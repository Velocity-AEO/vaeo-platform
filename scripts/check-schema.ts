#!/usr/bin/env node
/**
 * scripts/check-schema.ts
 *
 * Schema drift detection for vaeo-platform.
 *
 * Queries Supabase REST API to discover actual table columns and compares
 * them against the expected schema defined in EXPECTED_SCHEMA below.
 *
 * Usage:
 *   doppler run -- node --import tsx/esm scripts/check-schema.ts
 *   npm run db:check
 *
 * Exit 0 = no drift detected.
 * Exit 1 = drift (missing table or missing columns) detected.
 *
 * NOTE: This is a READ-ONLY diagnostic — it never writes anything.
 */

// ── Expected schema ────────────────────────────────────────────────────────────

/**
 * Map of table → expected column names.
 * Listed in approximate creation/logical order.
 * "Extra" columns in live DB are logged as informational, not drift.
 * "Missing" columns are drift and cause exit 1.
 */
const EXPECTED_SCHEMA: Record<string, string[]> = {
  sites: [
    'id', 'tenant_id', 'site_url', 'cms', 'created_at', 'updated_at',
  ],
  action_queue: [
    'id', 'run_id', 'tenant_id', 'site_id', 'url', 'issue_type',
    'patch_type', 'priority', 'status', 'proposed_fix', 'rollback_manifest',
    'cms_type', 'created_at', 'updated_at',
  ],
  action_log: [
    'id', 'run_id', 'tenant_id', 'site_id', 'action_id', 'cms_type',
    'stage', 'status', 'metadata', 'created_at',
  ],
  crawl_results: [
    'id', 'run_id', 'tenant_id', 'site_id', 'url', 'status_code',
    'content_type', 'crawled_at', 'metadata',
  ],
  site_snapshots: [
    'id', 'run_id', 'tenant_id', 'site_id', 'snapshot_type',
    'data', 'created_at',
  ],
  rollback_manifests: [
    'id', 'action_id', 'run_id', 'tenant_id', 'cms_type',
    'before_value', 'api_endpoint', 'created_at',
  ],
};

// ── ANSI colours ───────────────────────────────────────────────────────────────

const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const DIM    = '\x1b[2m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';

// ── REST API query ─────────────────────────────────────────────────────────────

interface TableResult {
  exists:  boolean;
  empty:   boolean;
  columns: string[];
  error?:  string;
}

async function queryTable(
  supabaseUrl: string,
  serviceKey:  string,
  table:       string,
): Promise<TableResult> {
  const url = `${supabaseUrl}/rest/v1/${table}?limit=1`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        apikey:        serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept:        'application/json',
      },
    });
  } catch (err) {
    return { exists: false, empty: false, columns: [], error: String(err) };
  }

  // PostgREST returns 404 / 400 / 200 depending on whether relation exists
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json() as Record<string, unknown>;
      detail = String(body['message'] ?? body['hint'] ?? body['details'] ?? detail);
    } catch { /* ignore */ }
    const missing =
      detail.toLowerCase().includes('does not exist') ||
      detail.toLowerCase().includes('relation')       ||
      res.status === 404;
    return {
      exists:  !missing,
      empty:   false,
      columns: [],
      error:   detail,
    };
  }

  const rows = await res.json() as Record<string, unknown>[];
  if (!Array.isArray(rows) || rows.length === 0) {
    return { exists: true, empty: true, columns: [] };
  }

  return { exists: true, empty: false, columns: Object.keys(rows[0]) };
}

// ── Report helpers ─────────────────────────────────────────────────────────────

function pad(s: string, n: number): string {
  return s.padEnd(n);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const supabaseUrl = process.env['SUPABASE_URL']?.trim();
  const serviceKey  = process.env['SUPABASE_SERVICE_ROLE_KEY']?.trim();

  if (!supabaseUrl || !serviceKey) {
    console.error(`${RED}✗ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set${RESET}`);
    process.exit(1);
  }

  // Redact URL for display
  const displayUrl = supabaseUrl.replace(/^(https?:\/\/[^.]{6})[^/]*/, '$1...');

  console.log(`\n${BOLD}vaeo-platform schema drift check${RESET}`);
  console.log(`${DIM}Supabase: ${displayUrl}${RESET}\n`);

  const COL_WIDTH = 24;
  let hasDrift = false;

  for (const [table, expectedCols] of Object.entries(EXPECTED_SCHEMA)) {
    process.stdout.write(`  ${pad(table, COL_WIDTH)}`);

    const result = await queryTable(supabaseUrl, serviceKey, table);

    // ── Table missing ────────────────────────────────────────────────────────
    if (!result.exists) {
      const label = result.error?.toLowerCase().includes('does not exist') || !result.error
        ? 'TABLE MISSING'
        : `ERROR: ${result.error}`;
      console.log(`${RED}${label}${RESET}`);
      hasDrift = true;
      continue;
    }

    // ── Table exists but empty — warn, skip column check ────────────────────
    if (result.empty) {
      console.log(`${YELLOW}EMPTY — cannot verify columns${RESET}`);
      continue;
    }

    // ── Compare columns ──────────────────────────────────────────────────────
    const actual  = result.columns;
    const missing = expectedCols.filter(c => !actual.includes(c));
    const extra   = actual.filter(c => !expectedCols.includes(c));

    if (missing.length === 0) {
      const extraNote = extra.length > 0
        ? `${DIM} (+${extra.length} extra: ${extra.join(', ')})${RESET}`
        : '';
      console.log(`${GREEN}OK${RESET}${DIM} (${actual.length} cols)${RESET}${extraNote}`);
    } else {
      hasDrift = true;
      console.log(`${YELLOW}DRIFT${RESET}`);
      console.log(`${' '.repeat(COL_WIDTH + 2)}  ${RED}missing : ${missing.join(', ')}${RESET}`);
      if (extra.length > 0) {
        console.log(`${' '.repeat(COL_WIDTH + 2)}  ${DIM}extra   : ${extra.join(', ')}${RESET}`);
      }
    }
  }

  console.log('');

  if (hasDrift) {
    console.log(`${RED}${BOLD}Schema drift detected. See details above.${RESET}`);
    console.log(`${DIM}(Missing columns = code/DB out of sync; TABLE MISSING = table not yet created)${RESET}\n`);
    process.exit(1);
  } else {
    console.log(`${GREEN}${BOLD}No drift detected.${RESET}\n`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error(`\n${RED}Unexpected error: ${String(err)}${RESET}\n`);
  process.exit(1);
});
