/**
 * scripts/run_ai_generate.ts
 *
 * Runner: finds top 3 issue URLs from the latest tracer scan for cococabanalife.com,
 * runs AI title + meta generator on them, prints results.
 *
 * Usage: doppler run -- npx tsx scripts/run_ai_generate.ts
 */

import { generateTitle, generateMetaDescription, type GenerateParams } from '../tools/ai/title_meta_generator.js';

const SITE_ID = '31cfee0c-fbe4-4128-adbc-3a1c740b6960';

async function createDb() {
  const { getConfig } = await import('../packages/core/config.js');
  // Dynamic import resolving from packages/commands which has the dep installed
  const mod = await import('../packages/commands/node_modules/@supabase/supabase-js/dist/index.mjs');
  const createClient = mod.createClient;
  const cfg = getConfig();
  return createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

async function main() {
  const db = await createDb();

  // Load latest snapshots
  const { data: snaps, error } = await db
    .from('tracer_field_snapshots')
    .select('run_id, url, field_name, current_value')
    .eq('site_id', SITE_ID)
    .order('snapshotted_at', { ascending: false })
    .limit(500);

  if (error || !snaps?.length) {
    console.error('Failed to load snapshots:', error?.message ?? 'no data');
    process.exit(1);
  }

  const runId = snaps[0].run_id;
  const runSnaps = snaps.filter((s: Record<string, unknown>) => s.run_id === runId);
  console.log(`Run ID: ${runId}, snapshots: ${runSnaps.length}\n`);

  // Find issue URLs: schema_missing (field_name='schema', current_value null)
  const urls = new Set<string>();
  for (const s of runSnaps) {
    if (s.field_name === 'schema' && !s.current_value) urls.add(s.url as string);
  }
  // Also add meta_too_short
  for (const s of runSnaps) {
    if (s.field_name === 'meta_description' && s.current_value &&
        (s.current_value as string).length < 120 && (s.current_value as string).length > 0) {
      urls.add(s.url as string);
    }
  }

  const top3 = [...urls].slice(0, 3);
  console.log('Top 3 issue URLs:');
  top3.forEach((u) => console.log(`  ${u}`));
  console.log('');

  // Build GenerateParams for each URL
  for (const url of top3) {
    const titleSnap = runSnaps.find((s: Record<string, unknown>) => s.url === url && s.field_name === 'title');
    const currentTitle = (titleSnap?.current_value as string) ?? '';
    const pageName = url.split('/').filter(Boolean).pop() ?? 'Page';

    const params: GenerateParams = {
      url,
      current_title: currentTitle,
      product_name: pageName.replace(/-/g, ' '),
      keywords: [],
      page_type: url.includes('/products/') ? 'product' : url.includes('/collections/') ? 'collection' : 'page',
      brand_name: 'Cococabana',
    };

    console.log(`── ${url}`);
    console.log(`   Current title: ${currentTitle || '(none)'}`);

    // Generate title
    const titleResult = await generateTitle(params, {
      updateSnapshot: async (u, ft, val) => {
        const { error: upErr } = await db
          .from('tracer_field_snapshots')
          .update({ proposed_value: val })
          .eq('url', u)
          .eq('field_name', ft)
          .eq('run_id', runId);
        if (upErr) console.error(`   [warn] snapshot update: ${upErr.message}`);
      },
    });
    console.log(`   AI title: ${titleResult.proposed_title} (${titleResult.char_count} chars, ${(titleResult.confidence * 100).toFixed(0)}%)`);
    if (titleResult.error) console.log(`   Title error: ${titleResult.error}`);

    // Generate meta
    const metaResult = await generateMetaDescription(params, {
      updateSnapshot: async (u, ft, val) => {
        const { error: upErr } = await db
          .from('tracer_field_snapshots')
          .update({ proposed_value: val })
          .eq('url', u)
          .eq('field_name', ft)
          .eq('run_id', runId);
        if (upErr) console.error(`   [warn] snapshot update: ${upErr.message}`);
      },
    });
    console.log(`   AI meta:  ${metaResult.proposed_meta} (${metaResult.char_count} chars, ${(metaResult.confidence * 100).toFixed(0)}%)`);
    if (metaResult.error) console.log(`   Meta error: ${metaResult.error}`);
    console.log('');
  }

  console.log('✓ AI generation complete for top 3 issue URLs');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
