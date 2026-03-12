/**
 * tools/onboarding/site_registration.ts
 *
 * Self-serve site registration — creates site record, stores credentials,
 * triggers first crawl. Injectable DB + job queue. Never throws.
 */

import { createInitialStatus, updateOnboardingStep, type OnboardingDb } from './onboarding_state.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RegistrationParams {
  shop_domain:    string;
  tenant_id:      string;
  shopify_token?: string;
  plan?:          string;
}

export interface RegistrationResult {
  ok:              boolean;
  site_id?:        string;
  already_exists?: boolean;
  error?:          string;
}

export interface RegistrationDb extends OnboardingDb {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        single(): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
        maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
    insert(rows: Array<Record<string, unknown>>): {
      select(cols: string): {
        single(): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
    update(data: Record<string, unknown>): {
      eq(col: string, val: string): Promise<{ error: unknown }>;
    };
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeDomain(domain: string): string {
  return domain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
}

// ── registerSite ──────────────────────────────────────────────────────────────

export async function registerSite(
  params: RegistrationParams,
  db:     RegistrationDb,
): Promise<RegistrationResult> {
  try {
    const domain  = normalizeDomain(params.shop_domain);
    const siteUrl = `https://${domain}`;

    // Check if site already exists
    const { data: existing } = await db
      .from('sites')
      .select('id')
      .eq('site_url', siteUrl)
      .maybeSingle();

    if (existing) {
      return {
        ok:             true,
        site_id:        existing.id as string,
        already_exists: true,
      };
    }

    // Create new site
    const onboarding = createInitialStatus('');
    onboarding.current_step = 'connect_shopify';
    onboarding.completed_steps = ['install'];

    const { data: inserted, error } = await db
      .from('sites')
      .insert([{
        site_url:    siteUrl,
        platform:    'shopify',
        tenant_id:   params.tenant_id,
        extra_data:  { onboarding, plan: params.plan ?? 'free' },
      }])
      .select('id')
      .single();

    if (error || !inserted) {
      return { ok: false, error: 'Failed to create site record' };
    }

    const siteId = inserted.id as string;

    // Update onboarding with correct site_id
    onboarding.site_id = siteId;
    await db.from('sites').update({
      extra_data: { onboarding, plan: params.plan ?? 'free' },
    }).eq('id', siteId);

    return { ok: true, site_id: siteId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── completeShopifyConnection ─────────────────────────────────────────────────

export async function completeShopifyConnection(
  siteId:      string,
  accessToken: string,
  db:          RegistrationDb,
): Promise<void> {
  try {
    // Store token (assuming credentials table or extra_data)
    const { data: site } = await db
      .from('sites')
      .select('extra_data')
      .eq('id', siteId)
      .single();

    const extraData = (site?.extra_data as Record<string, unknown>) ?? {};
    extraData.shopify_access_token = accessToken;

    await db.from('sites').update({ extra_data: extraData }).eq('id', siteId);

    // Advance onboarding
    await updateOnboardingStep(siteId, 'connect_shopify', { shopify_connected: true }, db);
  } catch { /* non-fatal */ }
}

// ── triggerFirstCrawl ─────────────────────────────────────────────────────────

export async function triggerFirstCrawl(
  siteId:     string,
  db:         RegistrationDb,
  enqueueJob: (job: { type: string; site_id: string; priority: number }) => Promise<string>,
): Promise<{ job_id?: string; error?: string }> {
  try {
    const jobId = await enqueueJob({
      type:     'crawl_site',
      site_id:  siteId,
      priority: 1,
    });

    // Update onboarding
    await updateOnboardingStep(siteId, 'first_crawl', { first_crawl_done: true }, db);

    return { job_id: jobId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
