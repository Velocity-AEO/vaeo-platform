/**
 * tools/value/before_after.ts
 *
 * Generates before/after comparisons for SEO fixes,
 * scoring field quality and computing improvement deltas.
 *
 * Never throws.
 */

import { randomUUID } from 'node:crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export interface BeforeAfterComparison {
  comparison_id:            string;
  site_id:                  string;
  url:                      string;
  fix_type:                 string;
  fix_label:                string;
  field_name:               string;
  before_value:             string;
  after_value:              string;
  before_length?:           number;
  after_length?:            number;
  character_delta?:         number;
  quality_score_before:     number;
  quality_score_after:      number;
  quality_delta:            number;
  applied_at:               string;
  ranking_position_before?: number;
  ranking_position_after?:  number;
  ranking_delta?:           number;
}

export interface FixHistoryEntry {
  url:           string;
  fix_type:      string;
  fix_label:     string;
  field_name:    string;
  before_value:  string;
  after_value:   string;
  applied_at:    string;
  ranking_position_before?: number;
  ranking_position_after?:  number;
}

// ── Score field quality ──────────────────────────────────────────────────────

export function scoreFieldQuality(value: string, fix_type: string): number {
  try {
    if (!value || value.trim() === '') return 0;

    const len = value.length;

    switch (fix_type) {
      case 'title_missing':
      case 'title':
        if (len < 30) return 40;
        if (len <= 60) return 100;
        if (len <= 70) return 70;
        return 70;

      case 'meta_description_missing':
      case 'meta_description':
        if (len < 70) return 50;
        if (len <= 160) return 100;
        return 60;

      case 'image_alt_missing':
        if (len < 6) return 30;
        if (len <= 125) return 100;
        return 60;

      case 'schema_missing':
        try {
          JSON.parse(value);
          return 100;
        } catch {
          return 50;
        }

      default:
        return 80;
    }
  } catch {
    return 0;
  }
}

// ── Build comparison ─────────────────────────────────────────────────────────

export function buildComparison(
  site_id: string,
  entry: FixHistoryEntry,
): BeforeAfterComparison {
  try {
    const quality_score_before = scoreFieldQuality(entry.before_value, entry.fix_type);
    const quality_score_after = scoreFieldQuality(entry.after_value, entry.fix_type);
    const quality_delta = quality_score_after - quality_score_before;

    const before_length = entry.before_value.length;
    const after_length = entry.after_value.length;

    const ranking_delta =
      entry.ranking_position_before != null && entry.ranking_position_after != null
        ? entry.ranking_position_before - entry.ranking_position_after
        : undefined;

    return {
      comparison_id: randomUUID(),
      site_id,
      url: entry.url,
      fix_type: entry.fix_type,
      fix_label: entry.fix_label,
      field_name: entry.field_name,
      before_value: entry.before_value,
      after_value: entry.after_value,
      before_length,
      after_length,
      character_delta: after_length - before_length,
      quality_score_before,
      quality_score_after,
      quality_delta,
      applied_at: entry.applied_at,
      ranking_position_before: entry.ranking_position_before,
      ranking_position_after: entry.ranking_position_after,
      ranking_delta,
    };
  } catch {
    return {
      comparison_id: randomUUID(),
      site_id,
      url: entry.url ?? '',
      fix_type: entry.fix_type ?? '',
      fix_label: entry.fix_label ?? '',
      field_name: entry.field_name ?? '',
      before_value: '',
      after_value: '',
      quality_score_before: 0,
      quality_score_after: 0,
      quality_delta: 0,
      applied_at: new Date().toISOString(),
    };
  }
}

// ── Build comparison report ──────────────────────────────────────────────────

export function buildComparisonReport(
  site_id: string,
  entries: FixHistoryEntry[],
): BeforeAfterComparison[] {
  try {
    const comparisons = entries.map((e) => buildComparison(site_id, e));
    return comparisons.sort((a, b) => b.quality_delta - a.quality_delta);
  } catch {
    return [];
  }
}
