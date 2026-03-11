/**
 * scripts/run_triage.ts
 *
 * Runner: loads approved/pending items from action_queue for a given site,
 * runs the triage engine, writes results back, prints summary.
 *
 * Usage:
 *   doppler run -- npx tsx scripts/run_triage.ts --site-id=<uuid>
 */

import {
  triageBatch,
  type TriageItem,
  type TriageDeps,
  type TriageRecommendation,
} from '../packages/core/src/triage/triage_engine.js';

// ── Parse args ───────────────────────────────────────────────────────────────

function parseSiteId(): string {
  const arg = process.argv.find((a) => a.startsWith('--site-id='));
  if (!arg) {
    console.error('Usage: npx tsx scripts/run_triage.ts --site-id=<uuid>');
    process.exit(1);
  }
  return arg.split('=')[1]!;
}

// ── DB setup ─────────────────────────────────────────────────────────────────

async function createDb() {
  const { getConfig } = await import('../packages/core/config.js');
  const mod = await import('../packages/commands/node_modules/@supabase/supabase-js/dist/index.mjs');
  const cfg = getConfig();
  return mod.createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

// ── AI review stub ───────────────────────────────────────────────────────────

/**
 * Simple AI review implementation.
 * In production this would call Claude API; for now, uses a heuristic fallback.
 */
async function aiReview(item: TriageItem): Promise<{
  recommendation: TriageRecommendation;
  reason: string;
}> {
  // Try Claude API if available
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (apiKey) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key':      apiKey,
          'anthropic-version': '2023-06-01',
          'content-type':    'application/json',
        },
        body: JSON.stringify({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 150,
          messages: [{
            role: 'user',
            content: `You are an SEO triage assistant. Given this action item, respond with ONLY a JSON object: {"recommendation": "deploy"|"skip", "reason": "<one sentence>"}\n\nIssue: ${item.issue_type}\nURL: ${item.url}\nProposed fix: ${JSON.stringify(item.proposed_fix).slice(0, 200)}`,
          }],
        }),
      });

      if (res.ok) {
        const data = await res.json() as { content: Array<{ text: string }> };
        const text = data.content?.[0]?.text ?? '';
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]) as { recommendation: string; reason: string };
          if (parsed.recommendation === 'deploy' || parsed.recommendation === 'skip') {
            return { recommendation: parsed.recommendation, reason: parsed.reason };
          }
        }
      }
    } catch {
      // Fall through to heuristic
    }
  }

  // Heuristic fallback
  const url = item.url.toLowerCase();
  if (url.includes('/products/') || url.includes('/collections/')) {
    return { recommendation: 'deploy', reason: 'Revenue-generating page — worth fixing' };
  }
  return { recommendation: 'skip', reason: 'Low-priority page — skip for now' };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const siteId = parseSiteId();
  const db = await createDb();

  console.log(`\nTriaging items for site: ${siteId}\n`);

  // 1. Load approved + pending items
  const { data: items, error } = await db
    .from('action_queue')
    .select('id, issue_type, url, risk_score, priority, execution_status, proposed_fix')
    .eq('site_id', siteId)
    .in('execution_status', ['approved', 'pending_approval'])
    .order('priority', { ascending: true });

  if (error) {
    console.error('Failed to load items:', error.message);
    process.exit(1);
  }

  if (!items || items.length === 0) {
    console.log('No approved/pending items found.');

    // Show status distribution
    const { data: allItems } = await db
      .from('action_queue')
      .select('execution_status')
      .eq('site_id', siteId);
    if (allItems) {
      const counts: Record<string, number> = {};
      for (const r of allItems) {
        counts[r.execution_status] = (counts[r.execution_status] || 0) + 1;
      }
      console.log('Status distribution:', counts);
    }
    process.exit(0);
  }

  console.log(`Found ${items.length} items to triage.\n`);

  // 2. Run triage
  const deps: TriageDeps = { aiReview };
  const result = await triageBatch(items as TriageItem[], deps);

  if (!result.ok) {
    console.error('Triage failed:', result.error);
    process.exit(1);
  }

  // 3. Write results back to action_queue
  const now = new Date().toISOString();
  let writeErrors = 0;

  for (const r of result.results) {
    const { error: updateErr } = await db
      .from('action_queue')
      .update({
        triage_score:          r.score,
        triage_recommendation: r.recommendation,
        triage_reason:         r.reason,
        triage_impact:         r.impact,
        ai_reviewed:           r.ai_reviewed,
        triaged_at:            now,
        updated_at:            now,
      })
      .eq('id', r.action_id);

    if (updateErr) {
      console.error(`  [warn] Failed to update ${r.action_id}: ${updateErr.message}`);
      writeErrors++;
    }
  }

  // 4. Print summary
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  TRIAGE SUMMARY');
  console.log('────────────────────────────────────────────────────────────────');
  console.log(`  Total items:      ${result.summary.total}`);
  console.log(`  Deploy:           ${result.summary.deploy}`);
  console.log(`  Skip:             ${result.summary.skip}`);
  console.log(`  Review:           ${result.summary.review}`);
  console.log(`  AI escalations:   ${result.summary.ai_escalations}`);
  if (writeErrors > 0) {
    console.log(`  Write errors:     ${writeErrors}`);
  }
  console.log('────────────────────────────────────────────────────────────────');

  // Detail table
  console.log('');
  console.log('  REC       SCORE  ISSUE TYPE                URL');
  console.log('  ───────── ────── ────────────────────────── ────────────────────────────');
  for (const r of result.results) {
    const rec = r.recommendation.toUpperCase().padEnd(9);
    const score = String(r.score).padStart(4);
    const issue = r.action_id.slice(0, 8);
    const issueItem = items.find((i: TriageItem) => i.id === r.action_id);
    const issueType = (issueItem?.issue_type ?? '').padEnd(26);
    const shortUrl = (issueItem?.url ?? '').replace(/^https?:\/\/[^/]+/, '').slice(0, 30);
    console.log(`  ${rec} ${score}   ${issueType} ${shortUrl}`);
    if (r.ai_reviewed) {
      console.log(`           → AI: ${r.reason.split('→ AI: ')[1] ?? r.reason}`);
    }
  }
  console.log('════════════════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
