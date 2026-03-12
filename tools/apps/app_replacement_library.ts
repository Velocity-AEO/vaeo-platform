/**
 * tools/apps/app_replacement_library.ts
 *
 * Tracks Shopify apps that VAEO has removed or replaced,
 * with performance deltas before/after.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type AppCategory =
  | 'seo'
  | 'schema'
  | 'image_optimization'
  | 'page_speed'
  | 'redirects'
  | 'sitemap'
  | 'meta_tags'
  | 'structured_data'
  | 'analytics'
  | 'other';

export type ReplacementType =
  | 'vaeo_native'
  | 'unnecessary'
  | 'third_party';

export interface AppReplacement {
  id:                    string;
  site_id:               string;
  tenant_id:             string;
  app_name:              string;
  app_category:          AppCategory;
  removed_at:            string;
  replacement?:          string;
  replacement_type:      ReplacementType;
  health_score_before?:  number;
  health_score_after?:   number;
  lcp_before?:           number;
  lcp_after?:            number;
  health_delta?:         number;
  lcp_delta?:            number;
  notes?:                string;
  created_at:            string;
}

export interface AppReplacementSummary {
  site_id:                string;
  total_apps_removed:     number;
  avg_health_delta:       number;
  avg_lcp_improvement_ms: number;
  replaced_by_vaeo:       number;
  deemed_unnecessary:     number;
  categories:             Record<AppCategory, number>;
}

// ── Injectable deps ──────────────────────────────────────────────────────────

export interface AppReplacementDeps {
  insert: (table: string, row: Record<string, unknown>) => Promise<{ id: string } | null>;
  query:  (table: string, filters: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
}

// ── Log replacement ──────────────────────────────────────────────────────────

export async function logAppReplacement(
  entry: Omit<AppReplacement, 'id' | 'created_at' | 'health_delta' | 'lcp_delta'>,
  deps:  AppReplacementDeps,
): Promise<{ ok: boolean; id?: string }> {
  try {
    const result = await deps.insert('app_replacements', {
      site_id:             entry.site_id,
      tenant_id:           entry.tenant_id,
      app_name:            entry.app_name,
      app_category:        entry.app_category,
      removed_at:          entry.removed_at,
      replacement:         entry.replacement ?? null,
      replacement_type:    entry.replacement_type,
      health_score_before: entry.health_score_before ?? null,
      health_score_after:  entry.health_score_after ?? null,
      lcp_before:          entry.lcp_before ?? null,
      lcp_after:           entry.lcp_after ?? null,
      notes:               entry.notes ?? null,
    });
    if (!result) return { ok: false };
    return { ok: true, id: result.id };
  } catch {
    return { ok: false };
  }
}

// ── Get replacements ─────────────────────────────────────────────────────────

export async function getAppReplacements(
  site_id: string,
  deps:    AppReplacementDeps,
): Promise<AppReplacement[]> {
  try {
    const rows = await deps.query('app_replacements', { site_id });
    return rows
      .map((row) => {
        const hsBefore = row.health_score_before as number | null;
        const hsAfter  = row.health_score_after as number | null;
        const lcpB     = row.lcp_before as number | null;
        const lcpA     = row.lcp_after as number | null;

        const healthDelta = (hsBefore != null && hsAfter != null)
          ? hsAfter - hsBefore
          : undefined;
        const lcpDelta = (lcpB != null && lcpA != null)
          ? lcpB - lcpA
          : undefined;

        return {
          id:                  row.id as string,
          site_id:             row.site_id as string,
          tenant_id:           row.tenant_id as string,
          app_name:            row.app_name as string,
          app_category:        row.app_category as AppCategory,
          removed_at:          row.removed_at as string,
          replacement:         (row.replacement as string) || undefined,
          replacement_type:    row.replacement_type as ReplacementType,
          health_score_before: hsBefore ?? undefined,
          health_score_after:  hsAfter ?? undefined,
          lcp_before:          lcpB ?? undefined,
          lcp_after:           lcpA ?? undefined,
          health_delta:        healthDelta,
          lcp_delta:           lcpDelta,
          notes:               (row.notes as string) || undefined,
          created_at:          row.created_at as string,
        };
      })
      .sort((a, b) => new Date(b.removed_at).getTime() - new Date(a.removed_at).getTime());
  } catch {
    return [];
  }
}

// ── Get summary ──────────────────────────────────────────────────────────────

const ALL_CATEGORIES: AppCategory[] = [
  'seo', 'schema', 'image_optimization', 'page_speed',
  'redirects', 'sitemap', 'meta_tags', 'structured_data',
  'analytics', 'other',
];

function emptyCategories(): Record<AppCategory, number> {
  const cats = {} as Record<AppCategory, number>;
  for (const c of ALL_CATEGORIES) cats[c] = 0;
  return cats;
}

export async function getReplacementSummary(
  site_id: string,
  deps:    AppReplacementDeps,
): Promise<AppReplacementSummary> {
  try {
    const replacements = await getAppReplacements(site_id, deps);
    const categories = emptyCategories();

    let healthDeltas: number[] = [];
    let lcpDeltas: number[] = [];
    let byVaeo = 0;
    let unnecessary = 0;

    for (const r of replacements) {
      categories[r.app_category] = (categories[r.app_category] ?? 0) + 1;
      if (r.health_delta != null) healthDeltas.push(r.health_delta);
      if (r.lcp_delta != null) lcpDeltas.push(r.lcp_delta);
      if (r.replacement_type === 'vaeo_native') byVaeo++;
      if (r.replacement_type === 'unnecessary') unnecessary++;
    }

    const avgHealth = healthDeltas.length > 0
      ? Math.round(healthDeltas.reduce((a, b) => a + b, 0) / healthDeltas.length)
      : 0;
    const avgLcp = lcpDeltas.length > 0
      ? Math.round(lcpDeltas.reduce((a, b) => a + b, 0) / lcpDeltas.length)
      : 0;

    return {
      site_id,
      total_apps_removed:     replacements.length,
      avg_health_delta:       avgHealth,
      avg_lcp_improvement_ms: avgLcp,
      replaced_by_vaeo:       byVaeo,
      deemed_unnecessary:     unnecessary,
      categories,
    };
  } catch {
    return {
      site_id,
      total_apps_removed:     0,
      avg_health_delta:       0,
      avg_lcp_improvement_ms: 0,
      replaced_by_vaeo:       0,
      deemed_unnecessary:     0,
      categories:             emptyCategories(),
    };
  }
}
