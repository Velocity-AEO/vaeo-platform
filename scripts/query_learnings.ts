/**
 * scripts/query_learnings.ts
 *
 * Query the learnings table with optional filters.
 *
 * Usage:
 *   doppler run -- npx tsx scripts/query_learnings.ts [options]
 *
 * Options:
 *   --issue-type=SCHEMA_MISSING
 *   --site-id=<uuid>
 *   --status=pending|approved|rejected
 *   --limit=50      (default 100)
 */

// ── Parse args ────────────────────────────────────────────────────────────────

function getArg(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split('=').slice(1).join('=') : undefined;
}

// ── DB setup ──────────────────────────────────────────────────────────────────

async function createDb() {
  const { getConfig } = await import('../packages/core/config.js');
  const mod = await import('../packages/commands/node_modules/@supabase/supabase-js/dist/index.mjs');
  const cfg = getConfig();
  return mod.createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const issueType = getArg('issue-type');
  const siteId    = getArg('site-id');
  const status    = getArg('status');
  const limitArg  = getArg('limit');
  const limit     = limitArg ? parseInt(limitArg, 10) : 100;

  const db = await createDb();

  type SupabaseChain = {
    eq(col: string, val: string): SupabaseChain;
    order(col: string, opts: { ascending: boolean }): SupabaseChain;
    limit(n: number): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
  };

  let query = (db as unknown as { from(t: string): { select(c: string): SupabaseChain } })
    .from('learnings')
    .select('*') as unknown as SupabaseChain;

  if (siteId)    query = query.eq('site_id',         siteId);
  if (issueType) query = query.eq('issue_type',      issueType);
  if (status)    query = query.eq('approval_status', status);

  query = query.order('created_at', { ascending: false });
  query = query.limit(limit) as unknown as SupabaseChain;

  const { data, error } = await (query as unknown as Promise<{ data: unknown[] | null; error: { message: string } | null }>);

  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }

  const rows = data ?? [];
  console.log(JSON.stringify(rows, null, 2));
  console.error(`\n${rows.length} row(s) returned.`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
