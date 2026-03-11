/**
 * packages/commands/src/onboard.ts
 *
 * vaeo onboard --site <domain> --token <token>
 *
 * Case-study entry point: registers a Shopify site, runs a tracer scan,
 * classifies issues, calculates health score, and outputs a summary report.
 *
 * Steps:
 *   1. Validate inputs (domain, token)
 *   2. Verify Shopify credentials via Admin API
 *   3. Create sites record in Supabase
 *   4. Store access token in site_credentials
 *   5. Run tracer scan (load crawl_results → URL inventory + field snapshots)
 *   6. Classify issues from field snapshots
 *   7. Calculate health score
 *   8. Persist health score to sites table
 *   9. Output summary report
 *
 * Never throws — always returns OnboardResult.
 */

import { randomUUID } from 'node:crypto';
import { classifyFields, type FieldSnapshot, type IssueReport } from '../../../tools/scoring/issue_classifier.js';
import { calculateHealthScore, type HealthScore } from '../../../tools/scoring/health_score.js';
import {
  runTracerScan,
  type TracerScanOps,
  type TracerScanResult,
  type FieldSnapshotRow,
} from './tracer-scan.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface OnboardRequest {
  site:   string;  // domain, e.g. "mystore.myshopify.com"
  token:  string;  // Shopify Admin API access token (shpat_...)
}

export interface OnboardResult {
  status:       'completed' | 'failed';
  site_id:      string;
  site:         string;
  shop_name:    string;
  url_count:    number;
  issues:       IssueReport[];
  health_score: HealthScore | null;
  tracer:       TracerScanResult | null;
  error?:       string;
}

export interface OnboardOps {
  /** Verify Shopify credentials — returns shop name on success. */
  verifyShopify: (storeUrl: string, token: string) => Promise<{ ok: boolean; shop_name?: string; error?: string }>;
  /** Check if a site already exists for this domain. */
  findSiteByDomain: (domain: string) => Promise<{ site_id: string; tenant_id: string } | null>;
  /** Insert a new sites record. Returns site_id. */
  insertSite: (record: { site_id: string; tenant_id: string; cms_type: string; site_url: string; verified_at: string }) => Promise<void>;
  /** Store a credential for the site. */
  storeCredential: (siteId: string, tenantId: string, key: string, val: string) => Promise<void>;
  /** Load field snapshots written by the tracer scan. */
  loadFieldSnapshots: (siteId: string, runId: string) => Promise<FieldSnapshotRow[]>;
  /** Persist health score to the sites table. */
  updateHealthScore: (siteId: string, score: HealthScore) => Promise<void>;
  /** Generate a UUID. */
  generateId: () => string;
  /** Optional: override tracer scan ops for testing. */
  tracerOps?: Partial<TracerScanOps>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const HARDCODED_TENANT = '00000000-0000-0000-0000-000000000001';

// ── Real implementations ────────────────────────────────────────────────────

const realVerifyShopify: OnboardOps['verifyShopify'] = async (storeUrl, token) => {
  const host = storeUrl.replace(/^https?:\/\//i, '');
  const url = `https://${host}/admin/api/2025-01/shop.json`;
  const res = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type':           'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, error: `Shopify API returned ${res.status}: ${body.slice(0, 200)}` };
  }
  const json = (await res.json()) as { shop?: { name?: string } };
  return { ok: true, shop_name: json.shop?.name ?? storeUrl };
};

const realFindSiteByDomain: OnboardOps['findSiteByDomain'] = async (domain) => {
  const { getConfig } = await import('../../core/config.js');
  const { createClient } = await import('@supabase/supabase-js');
  const cfg = getConfig();
  const db = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, { auth: { persistSession: false } });
  const { data } = await db
    .from('sites')
    .select('site_id, tenant_id')
    .or(`site_url.eq.${domain},site_url.eq.https://${domain}`)
    .limit(1)
    .maybeSingle();
  return data ?? null;
};

const realInsertSite: OnboardOps['insertSite'] = async (record) => {
  const { getConfig } = await import('../../core/config.js');
  const { createClient } = await import('@supabase/supabase-js');
  const cfg = getConfig();
  const db = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, { auth: { persistSession: false } });
  const { error } = await db.from('sites').upsert(record, { onConflict: 'site_id' });
  if (error) throw new Error(`sites upsert failed: ${error.message}`);
};

const realStoreCredential: OnboardOps['storeCredential'] = async (siteId, tenantId, key, val) => {
  const { getConfig } = await import('../../core/config.js');
  const { createClient } = await import('@supabase/supabase-js');
  const cfg = getConfig();
  const db = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, { auth: { persistSession: false } });
  const { error } = await db.from('site_credentials').upsert(
    { site_id: siteId, tenant_id: tenantId, credential_key: key, credential_val: val, updated_at: new Date().toISOString() },
    { onConflict: 'site_id,credential_key' },
  );
  if (error) throw new Error(`site_credentials upsert failed: ${error.message}`);
};

const realLoadFieldSnapshots: OnboardOps['loadFieldSnapshots'] = async (siteId, runId) => {
  const { getConfig } = await import('../../core/config.js');
  const { createClient } = await import('@supabase/supabase-js');
  const cfg = getConfig();
  const db = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, { auth: { persistSession: false } });
  const { data, error } = await db
    .from('tracer_field_snapshots')
    .select('*')
    .eq('site_id', siteId)
    .eq('run_id', runId);
  if (error) throw new Error(`tracer_field_snapshots load failed: ${error.message}`);
  // Map actual DB columns → internal FieldSnapshotRow
  return (data ?? []).map((r: Record<string, unknown>) => ({
    run_id:        r.run_id as string,
    site_id:       r.site_id as string,
    url:           r.url as string,
    field_type:    r.field_name as string,
    current_value: r.current_value as string | null,
    char_count:    typeof r.current_value === 'string' ? (r.current_value as string).length : 0,
    issue_flag:    false,
    issue_type:    null,
  })) as FieldSnapshotRow[];
};

const realUpdateHealthScore: OnboardOps['updateHealthScore'] = async (siteId, score) => {
  const { getConfig } = await import('../../core/config.js');
  const { createClient } = await import('@supabase/supabase-js');
  const cfg = getConfig();
  const db = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, { auth: { persistSession: false } });
  const { error } = await db
    .from('sites')
    .update({ health_score: score })
    .eq('site_id', siteId);
  if (error) throw new Error(`sites health_score update failed: ${error.message}`);
};

function defaultOps(): OnboardOps {
  return {
    verifyShopify:      realVerifyShopify,
    findSiteByDomain:   realFindSiteByDomain,
    insertSite:         realInsertSite,
    storeCredential:    realStoreCredential,
    loadFieldSnapshots: realLoadFieldSnapshots,
    updateHealthScore:  realUpdateHealthScore,
    generateId:         () => randomUUID(),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Normalise domain → mystore.myshopify.com */
function normaliseDomain(raw: string): string {
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return d;
}

/** Convert FieldSnapshotRow[] → FieldSnapshot[] for the classifier. */
function toClassifierInput(rows: FieldSnapshotRow[]): FieldSnapshot[] {
  return rows.map((r) => ({
    url:           r.url,
    field_type:    r.field_type,
    current_value: r.current_value,
    char_count:    r.char_count ?? 0,
  }));
}

// ── runOnboard ──────────────────────────────────────────────────────────────

export async function runOnboard(
  request: OnboardRequest,
  _testOps?: Partial<OnboardOps>,
): Promise<OnboardResult> {
  const ops = _testOps ? { ...defaultOps(), ..._testOps } : defaultOps();

  const fail = (error: string): OnboardResult => ({
    status: 'failed',
    site_id: '',
    site: request.site,
    shop_name: '',
    url_count: 0,
    issues: [],
    health_score: null,
    tracer: null,
    error,
  });

  // ── 1. Validate ────────────────────────────────────────────────────────────
  if (!request.site?.trim()) return fail('--site is required');
  if (!request.token?.trim()) return fail('--token is required');

  const domain = normaliseDomain(request.site);

  // ── 2. Verify Shopify credentials ──────────────────────────────────────────
  let shopName: string;
  try {
    const verify = await ops.verifyShopify(domain, request.token);
    if (!verify.ok) return fail(`Shopify verification failed: ${verify.error}`);
    shopName = verify.shop_name ?? domain;
  } catch (err) {
    return fail(`Shopify verification error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 3. Create or reuse site record ─────────────────────────────────────────
  let siteId: string;
  const tenantId = HARDCODED_TENANT;
  try {
    const existing = await ops.findSiteByDomain(domain);
    if (existing) {
      siteId = existing.site_id;
    } else {
      siteId = ops.generateId();
      await ops.insertSite({
        site_id:     siteId,
        tenant_id:   tenantId,
        cms_type:    'shopify',
        site_url:    `https://${domain}`,
        verified_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    return fail(`Site registration error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 4. Store access token ──────────────────────────────────────────────────
  try {
    await ops.storeCredential(siteId, tenantId, 'shopify_access_token', request.token);
  } catch (err) {
    return fail(`Credential storage error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 5. Run tracer scan ─────────────────────────────────────────────────────
  let tracerResult: TracerScanResult;
  try {
    tracerResult = await runTracerScan({ site: domain }, ops.tracerOps);
    if (tracerResult.status === 'failed') {
      return fail(`Tracer scan failed: ${tracerResult.error}`);
    }
  } catch (err) {
    return fail(`Tracer scan error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 6. Load field snapshots and classify issues ────────────────────────────
  let issues: IssueReport[];
  let snapshots: FieldSnapshotRow[];
  try {
    snapshots = await ops.loadFieldSnapshots(siteId, tracerResult.run_id);
    const classifierInput = toClassifierInput(snapshots);
    issues = classifyFields(classifierInput);
  } catch (err) {
    return fail(`Issue classification error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 7. Calculate health score ──────────────────────────────────────────────
  const urlCount = tracerResult.urls_inventoried;
  const healthScore = calculateHealthScore(issues, urlCount);

  // ── 8. Persist health score ────────────────────────────────────────────────
  try {
    await ops.updateHealthScore(siteId, healthScore);
  } catch {
    // Non-fatal — we still return the score even if persistence fails
  }

  // ── 9. Return result ──────────────────────────────────────────────────────
  return {
    status:       'completed',
    site_id:      siteId,
    site:         domain,
    shop_name:    shopName,
    url_count:    urlCount,
    issues,
    health_score: healthScore,
    tracer:       tracerResult,
  };
}

// ── CLI entry point ──────────────────────────────────────────────────────────

export async function runOnboardCli(opts: { site: string; token: string }): Promise<void> {
  const result = await runOnboard({ site: opts.site, token: opts.token });

  if (result.status === 'completed' && result.health_score) {
    const hs = result.health_score;

    process.stdout.write(
      `\n` +
      `╔══════════════════════════════════════════════════════════════╗\n` +
      `║  VAEO Onboard Report                                       ║\n` +
      `╠══════════════════════════════════════════════════════════════╣\n` +
      `║  Site:         ${pad(result.shop_name, 44)}║\n` +
      `║  Domain:       ${pad(result.site, 44)}║\n` +
      `║  Site ID:      ${pad(result.site_id, 44)}║\n` +
      `╠══════════════════════════════════════════════════════════════╣\n` +
      `║  URLs Scanned: ${pad(String(result.url_count), 44)}║\n` +
      `║  Total Issues: ${pad(String(hs.total_issues), 44)}║\n` +
      `║    Critical:   ${pad(String(hs.issues_by_severity.critical), 44)}║\n` +
      `║    Major:      ${pad(String(hs.issues_by_severity.major), 44)}║\n` +
      `║    Minor:      ${pad(String(hs.issues_by_severity.minor), 44)}║\n` +
      `╠══════════════════════════════════════════════════════════════╣\n` +
      `║  Health Score: ${pad(`${hs.score}/100  (${hs.grade})`, 44)}║\n` +
      `╠══════════════════════════════════════════════════════════════╣\n` +
      (hs.breakdown.length > 0
        ? hs.breakdown.map((line) => `║    ${pad(line, 56)}║\n`).join('')
        : `║    No issues found                                       ║\n`) +
      `╚══════════════════════════════════════════════════════════════╝\n` +
      `\n`,
    );
  } else {
    process.stderr.write(`✗ Onboard failed: ${result.error ?? 'unknown error'}\n`);
    process.exitCode = 1;
  }
}

/** Right-pad string to a fixed width. */
function pad(str: string, width: number): string {
  if (str.length >= width) return str.slice(0, width);
  return str + ' '.repeat(width - str.length);
}
