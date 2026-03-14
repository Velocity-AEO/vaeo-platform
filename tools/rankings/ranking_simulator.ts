/**
 * tools/rankings/ranking_simulator.ts
 *
 * Deterministic keyword ranking simulator for dev/demo data.
 */

import { buildRankingEntry, buildRankingSnapshot, type RankingSnapshot } from './ranking_entry.js';

// ── Deterministic hash ────────────────────────────────────────────────────────

function simHash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return Math.abs(h);
}

// ── Keyword templates by domain category ─────────────────────────────────────

const KEYWORD_POOLS: Record<string, string[]> = {
  beach: [
    'beach decor', 'coastal home accessories', 'boho beach decor',
    'rattan furniture', 'wicker baskets', 'coastal living decor',
    'beach house furniture', 'tropical home decor', 'seashell decor',
    'driftwood decor', 'jute rug', 'macrame wall hanging',
    'bohemian decor', 'ocean themed decor', 'nautical bedroom decor',
    'blue and white coastal decor', 'outdoor beach furniture',
    'hammock chair indoor', 'woven wall art', 'terracotta pots outdoor',
  ],
  fashion: [
    'summer dresses', 'boho clothing', 'beach coverup', 'linen pants women',
    'flowy maxi dress', 'resort wear', 'vacation outfits', 'sundress',
    'tropical print dress', 'off shoulder top', 'crop top linen',
    'wide leg pants beach', 'swimsuit coverup', 'beach bag tote',
    'sandals women', 'sun hat', 'beach jewelry', 'anklet gold',
    'shell necklace', 'turquoise jewelry',
  ],
  general: [
    'home decor shop', 'online boutique', 'unique gifts', 'artisan goods',
    'handmade crafts', 'sustainable products', 'eco friendly home',
    'small business gifts', 'curated home goods', 'lifestyle store',
    'gift ideas home', 'aesthetic room decor', 'minimalist decor',
    'trending home products', 'modern farmhouse decor', 'cozy home',
    'interior design inspiration', 'living room decor ideas',
    'bedroom decor', 'kitchen accessories',
  ],
};

function pickKeywordPool(domain: string): string[] {
  const d = domain.toLowerCase();
  if (d.includes('beach') || d.includes('coastal') || d.includes('cabana') || d.includes('coco')) {
    return KEYWORD_POOLS.beach;
  }
  if (d.includes('fashion') || d.includes('wear') || d.includes('cloth') || d.includes('dress')) {
    return KEYWORD_POOLS.fashion;
  }
  return KEYWORD_POOLS.general;
}

// ── CTR curve by position ─────────────────────────────────────────────────────

function ctrForPosition(pos: number): number {
  if (pos === 1)  return 0.28;
  if (pos === 2)  return 0.15;
  if (pos === 3)  return 0.10;
  if (pos <= 5)   return 0.06;
  if (pos <= 10)  return 0.02;
  if (pos <= 20)  return 0.005;
  return 0.002;
}

function impressionsForPosition(pos: number, seed: number): number {
  let base: number;
  if (pos === 1)       base = 1200;
  else if (pos <= 3)   base = 600;
  else if (pos <= 10)  base = 150;
  else if (pos <= 20)  base = 60;
  else                 base = 20;
  // ±30% variation using seed
  const variation = ((seed % 60) - 30) / 100;
  return Math.max(1, Math.round(base * (1 + variation)));
}

// ── simulateRankings ──────────────────────────────────────────────────────────

export function simulateRankings(
  site_id:       string,
  domain:        string,
  keyword_count  = 20,
): RankingSnapshot {
  try {
    const pool  = pickKeywordPool(domain ?? '');
    const hash  = simHash(domain ?? '');
    const count = Math.max(1, keyword_count);

    // Build deterministic position distribution:
    // 2-3 in top-3, 5-8 in top-10, rest 11-50
    const positions: number[] = [];
    const top3Count  = 2 + (hash % 2);                     // 2 or 3
    const top10Count = Math.max(top3Count + 1, 5 + (hash % 4)); // 5-8

    for (let i = 0; i < count; i++) {
      const seed = simHash(`${domain}-${i}`);
      let pos: number;
      if (i < top3Count) {
        pos = 1 + (seed % 3);                           // 1-3
      } else if (i < top10Count) {
        pos = 4 + (seed % 7);                           // 4-10
      } else {
        pos = 11 + (seed % 40);                         // 11-50
      }
      positions.push(pos);
    }

    const entries = positions.map((pos, i) => {
      const kwSeed  = simHash(`${domain}-kw-${i}`);
      const keyword = pool[kwSeed % pool.length] ?? `keyword ${i + 1}`;
      const prevSeed = simHash(`${domain}-prev-${i}`);

      // previous position: 70% have one, 30% are new
      let prev: number | undefined;
      if (prevSeed % 10 < 7) {
        const change = (prevSeed % 9) - 4; // -4 to +4
        prev = Math.max(1, Math.min(50, pos + change));
      }

      const imprSeed   = simHash(`${domain}-imp-${i}`);
      const impressions = impressionsForPosition(pos, imprSeed);
      const ctr         = ctrForPosition(pos);
      const clicks      = Math.max(0, Math.round(impressions * ctr));
      const url         = `https://${domain ?? 'example.com'}/products/item-${kwSeed % 20 + 1}`;

      return buildRankingEntry(site_id, keyword, url, pos, impressions, clicks, prev);
    });

    return buildRankingSnapshot(site_id, entries);
  } catch {
    return buildRankingSnapshot(site_id ?? '', []);
  }
}

// ── simulateRankingHistory ────────────────────────────────────────────────────

export function simulateRankingHistory(
  site_id: string,
  domain:  string,
  days     = 30,
): RankingSnapshot[] {
  try {
    const safeDays = Math.max(1, days);
    const snapshots: RankingSnapshot[] = [];

    for (let d = safeDays - 1; d >= 0; d--) {
      const daySeed = simHash(`${domain}-day-${d}`);

      // Get base snapshot and shift positions to show improvement trend over time
      const base = simulateRankings(site_id, domain, 20);

      // Earlier days have worse (higher) positions
      const improvementOffset = Math.floor(d * 0.3); // older = higher positions

      const shiftedEntries = base.entries.map((e, i) => {
        const entrySeed  = simHash(`${domain}-entry-${i}-day-${d}`);
        const dayNoise   = (entrySeed % 3) - 1; // -1, 0, +1 daily noise
        const newPos     = Math.max(1, Math.min(50, e.position + improvementOffset + dayNoise));
        const prevPos    = e.position_previous !== undefined
          ? Math.max(1, e.position_previous + improvementOffset)
          : undefined;

        const impressions = impressionsForPosition(newPos, daySeed + i);
        const clicks      = Math.max(0, Math.round(impressions * ctrForPosition(newPos)));

        return buildRankingEntry(site_id, e.keyword, e.url, newPos, impressions, clicks, prevPos);
      });

      const snap = buildRankingSnapshot(site_id, shiftedEntries);

      // Set snapshot_date to the correct past date
      const date = new Date();
      date.setDate(date.getDate() - d);
      (snap as unknown as Record<string, unknown>).snapshot_date = date.toISOString();

      snapshots.push(snap);
    }

    return snapshots;
  } catch {
    return [];
  }
}
