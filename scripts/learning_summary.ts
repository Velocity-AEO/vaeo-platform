#!/usr/bin/env node
/**
 * scripts/learning_summary.ts
 *
 * Print a summary of fix patterns from the learnings table.
 *
 * Usage:
 *   tsx scripts/learning_summary.ts --site-id <uuid> [--issue-type <type>]
 */

import { fileURLToPath } from 'node:url';
import { queryPatterns, getBestFix, type PatternSummary } from '../tools/learning/pattern_engine.ts';

// ── Args ──────────────────────────────────────────────────────────────────────

function parseArgs(): { siteId: string; issueType?: string } {
  const args = process.argv.slice(2);
  let siteId    = '';
  let issueType: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--site-id'    && args[i + 1]) { siteId    = args[++i]; }
    if (args[i] === '--issue-type' && args[i + 1]) { issueType = args[++i]; }
  }

  if (!siteId) {
    process.stderr.write('Error: --site-id is required\n');
    process.exit(1);
  }

  return { siteId, issueType };
}

// ── Formatting ────────────────────────────────────────────────────────────────

function pad(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
  );
  const line = widths.map((w) => '-'.repeat(w)).join('-+-');
  const fmt  = (row: string[]) => row.map((c, i) => pad(c, widths[i])).join(' | ');

  console.log(fmt(headers));
  console.log(line);
  for (const row of rows) console.log(fmt(row));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { siteId, issueType } = parseArgs();

  // Build real Supabase client
  const { getConfig }    = await import('../packages/core/config.js');
  const { createClient } = await import('@supabase/supabase-js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // Wrap Supabase client into PatternDb shape
  const patternDb = {
    from: (table: 'learnings') => ({
      select: (cols: string) => {
        let q = db.from(table).select(cols);
        const builder = {
          eq(col: string, val: string)                            { q = (q as any).eq(col, val); return builder; },
          order(col: string, opts: { ascending: boolean })        { q = (q as any).order(col, opts); return builder; },
          limit(n: number)                                        { q = (q as any).limit(n); return builder; },
          then<T>(resolve: (v: unknown) => T): Promise<T> { return (q as any).then(resolve); },
        };
        return builder as any;
      },
    }),
  };

  console.log(`\nLearning Summary — site: ${siteId}${issueType ? ` — type: ${issueType}` : ''}\n`);

  // ── Top 5 issue types by volume ──────────────────────────────────────────
  const patterns: PatternSummary[] = await queryPatterns({
    db:         patternDb,
    issue_type: issueType,
    min_samples: 1,
  });

  const top5 = patterns.slice(0, 5);

  console.log('=== Top Issue Types by Volume ===');
  if (top5.length === 0) {
    console.log('  (no data)');
  } else {
    printTable(
      ['Issue Type', 'Page Type', 'Total', 'Passed', 'Failed', 'Success Rate'],
      top5.map((p) => [
        p.issue_type,
        p.page_type,
        String(p.total),
        String(p.passed),
        String(p.failed),
        pct(p.success_rate),
      ]),
    );
  }

  // ── Top 3 recommended fixes with confidence ──────────────────────────────
  console.log('\n=== Top 3 Recommended Fixes ===');
  const topIssues = top5.slice(0, 3);
  if (topIssues.length === 0) {
    console.log('  (no data)');
  } else {
    for (const p of topIssues) {
      const best = await getBestFix(p.issue_type, '', patternDb);
      const confidence = best ? `${pct(best.confidence)} (n=${best.based_on_samples})` : 'insufficient data';
      const fix        = best?.recommended_fix ?? p.sample_fixes[0] ?? '(no fix available)';
      console.log(`\n  ${p.issue_type} [${p.page_type}]:`);
      console.log(`    Confidence : ${confidence}`);
      console.log(`    Fix        : ${fix.slice(0, 100)}${fix.length > 100 ? '…' : ''}`);
    }
  }

  // ── Pages with most issues ────────────────────────────────────────────────
  console.log('\n=== Pages with Most Issues ===');
  // Roll up total from patterns (pattern_engine already groups by issue_type+page_type)
  const urlTotals: Record<string, number> = {};
  for (const p of patterns) {
    const key = `${p.page_type} pages`;
    urlTotals[key] = (urlTotals[key] ?? 0) + p.total;
  }
  const sorted = Object.entries(urlTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (sorted.length === 0) {
    console.log('  (no data)');
  } else {
    printTable(['Page Type', 'Total Issues'], sorted.map(([k, v]) => [k, String(v)]));
  }

  console.log('');
}

// ── ESM guard ─────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename || process.argv[1]?.endsWith('learning_summary.ts')) {
  main().catch((err) => {
    process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
