/**
 * tools/ai-visibility/visibility_history.ts
 *
 * Tracks AI visibility over time with snapshots.
 * Never throws.
 */

import { randomUUID } from 'node:crypto';
import type { UnifiedAISignal } from './unified_signal.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AIVisibilitySnapshot {
  snapshot_id:     string;
  site_id:         string;
  domain:          string;
  date:            string;
  combined_score:  number;
  perplexity_rate: number;
  google_aio_rate: number;
  total_citations: number;
  new_citations:   number;
  lost_citations:  number;
}

// ── Deterministic hash ──────────────────────────────────────────────────────

function simHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// ── buildVisibilitySnapshot ─────────────────────────────────────────────────

export function buildVisibilitySnapshot(
  site_id: string,
  domain: string,
  signal: UnifiedAISignal,
  previous?: AIVisibilitySnapshot,
): AIVisibilitySnapshot {
  try {
    const newCitations = previous
      ? Math.max(0, signal.total_citations - previous.total_citations)
      : 0;
    const lostCitations = previous
      ? Math.max(0, previous.total_citations - signal.total_citations)
      : 0;

    return {
      snapshot_id: randomUUID(),
      site_id,
      domain,
      date: new Date().toISOString().slice(0, 10),
      combined_score: signal.combined_score,
      perplexity_rate: signal.perplexity_citation_rate,
      google_aio_rate: signal.google_aio_citation_rate,
      total_citations: signal.total_citations,
      new_citations: newCitations,
      lost_citations: lostCitations,
    };
  } catch {
    return {
      snapshot_id: randomUUID(),
      site_id: site_id ?? '',
      domain: domain ?? '',
      date: new Date().toISOString().slice(0, 10),
      combined_score: 0,
      perplexity_rate: 0,
      google_aio_rate: 0,
      total_citations: 0,
      new_citations: 0,
      lost_citations: 0,
    };
  }
}

// ── simulateVisibilityHistory ───────────────────────────────────────────────

export function simulateVisibilityHistory(
  site_id: string,
  domain: string,
  days: number,
): AIVisibilitySnapshot[] {
  try {
    const seed = simHash(domain ?? '');
    const baseScore = 15 + (seed % 20); // 15-34 starting score
    const basePRate = 0.1 + (seed % 15) / 100;
    const baseGRate = 0.12 + (seed % 12) / 100;
    const snapshots: AIVisibilitySnapshot[] = [];

    for (let d = 0; d < days; d++) {
      const progress = d / Math.max(1, days - 1);
      const improvement = progress * 25; // Up to +25 score improvement
      const noise = ((simHash(`${domain}-day-${d}`) % 10) - 4) / 2; // -2 to +3

      const score = Math.min(100, Math.max(0, Math.round(baseScore + improvement + noise)));
      const pRate = Math.min(1, Math.max(0, basePRate + progress * 0.2 + noise / 100));
      const gRate = Math.min(1, Math.max(0, baseGRate + progress * 0.15 + noise / 100));
      const totalCitations = Math.round(score / 5) + (simHash(`${domain}-cit-${d}`) % 5);

      const prev = snapshots[snapshots.length - 1];
      const newCit = prev ? Math.max(0, totalCitations - prev.total_citations + (simHash(`${domain}-new-${d}`) % 3)) : 0;
      const lostCit = prev ? Math.max(0, (simHash(`${domain}-lost-${d}`) % 2)) : 0;

      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - d));

      snapshots.push({
        snapshot_id: randomUUID(),
        site_id,
        domain,
        date: date.toISOString().slice(0, 10),
        combined_score: score,
        perplexity_rate: Math.round(pRate * 1000) / 1000,
        google_aio_rate: Math.round(gRate * 1000) / 1000,
        total_citations: totalCitations,
        new_citations: newCit,
        lost_citations: lostCit,
      });
    }

    return snapshots;
  } catch {
    return [];
  }
}

// ── computeVisibilityTrend ──────────────────────────────────────────────────

export function computeVisibilityTrend(
  history: AIVisibilitySnapshot[],
): 'improving' | 'stable' | 'declining' {
  try {
    const safe = history ?? [];
    if (safe.length < 7) return 'stable';

    const first7 = safe.slice(0, 7);
    const last7 = safe.slice(-7);

    const avgFirst = first7.reduce((s, h) => s + h.combined_score, 0) / first7.length;
    const avgLast = last7.reduce((s, h) => s + h.combined_score, 0) / last7.length;

    if (avgLast > avgFirst + 5) return 'improving';
    if (avgLast < avgFirst - 5) return 'declining';
    return 'stable';
  } catch {
    return 'stable';
  }
}
