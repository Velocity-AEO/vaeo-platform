/**
 * tools/link_graph/link_velocity_tracker.ts
 *
 * Tracks weekly inbound link counts per page, detects pages losing authority,
 * alerts when hub pages lose links, and surfaces velocity trends.
 *
 * Never throws.
 */

import type { PageNode } from './types.js';
import type { AuthorityScore } from './authority_scorer.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LinkVelocitySnapshot {
  id:                       string;
  site_id:                  string;
  url:                      string;
  snapshot_date:            string;
  inbound_internal_count:   number;
  outbound_internal_count:  number;
  body_content_inbound:     number;
  navigation_inbound:       number;
  authority_score:          number | null;
  captured_at:              string;
}

export type VelocityTrendType =
  | 'gaining'
  | 'losing_gradual'
  | 'losing_sudden'
  | 'stable'
  | 'new_page'
  | 'insufficient_data';

export interface LinkVelocityTrend {
  url:                string;
  site_id:            string;
  title:              string | null;
  current_inbound:    number;
  inbound_7d_ago:     number | null;
  inbound_30d_ago:    number | null;
  change_7d:          number | null;
  change_30d:         number | null;
  pct_change_7d:      number | null;
  pct_change_30d:     number | null;
  trend_type:         VelocityTrendType;
  is_hub_page:        boolean;
  alert_required:     boolean;
  alert_reason:       string | null;
  authority_score:    number | null;
}

export const VELOCITY_THRESHOLDS = {
  hub_sudden_loss:   5,
  sudden_loss_pct:   25,
  gradual_loss_pct:  10,
  gaining_threshold: 3,
};

// ── classifyVelocityTrend ────────────────────────────────────────────────────

export function classifyVelocityTrend(
  change_7d:       number | null,
  change_30d:      number | null,
  current_inbound: number,
  pct_change_7d:   number | null,
): VelocityTrendType {
  try {
    if (change_7d == null && change_30d == null) return 'insufficient_data';
    if ((current_inbound ?? 0) === 0 && change_7d == null) return 'new_page';

    if (typeof pct_change_7d === 'number' && pct_change_7d <= -VELOCITY_THRESHOLDS.sudden_loss_pct) {
      return 'losing_sudden';
    }

    // Calculate pct_change_30d for gradual check
    if (typeof change_30d === 'number' && typeof current_inbound === 'number') {
      const base30 = current_inbound - change_30d;
      if (base30 > 0) {
        const pct30 = (change_30d / base30) * 100;
        if (pct30 <= -VELOCITY_THRESHOLDS.gradual_loss_pct) return 'losing_gradual';
      }
    }

    if (typeof change_7d === 'number' && change_7d >= VELOCITY_THRESHOLDS.gaining_threshold) {
      return 'gaining';
    }

    return 'stable';
  } catch {
    return 'insufficient_data';
  }
}

// ── shouldAlertVelocity ──────────────────────────────────────────────────────

export function shouldAlertVelocity(
  trend: LinkVelocityTrend,
): { alert: boolean; reason: string | null } {
  try {
    if (!trend) return { alert: false, reason: null };

    if (trend.is_hub_page && trend.trend_type === 'losing_sudden') {
      const n = Math.abs(trend.change_7d ?? 0);
      return {
        alert: true,
        reason: `Hub page lost ${n} inbound links in 7 days — authority at risk`,
      };
    }

    if (trend.trend_type === 'losing_sudden' && (trend.current_inbound ?? 0) < 5) {
      return {
        alert: true,
        reason: 'Page losing links rapidly — may become orphaned',
      };
    }

    if (trend.trend_type === 'losing_gradual' && (trend.authority_score ?? 0) >= 60) {
      return {
        alert: true,
        reason: 'High-authority page losing links gradually over 30 days',
      };
    }

    return { alert: false, reason: null };
  } catch {
    return { alert: false, reason: null };
  }
}

// ── captureVelocitySnapshot ──────────────────────────────────────────────────

export interface LinkGraph {
  pages: PageNode[];
}

export interface VelocityCaptureDeps {
  saveFn?: (snapshots: LinkVelocitySnapshot[]) => Promise<void>;
}

export async function captureVelocitySnapshot(
  site_id:          string,
  graph:            LinkGraph,
  authority_scores: AuthorityScore[],
  deps?:            VelocityCaptureDeps,
): Promise<number> {
  try {
    if (!site_id || !graph?.pages) return 0;

    const pages = Array.isArray(graph.pages) ? graph.pages : [];
    if (pages.length === 0) return 0;

    const scoreMap = new Map<string, number>();
    if (Array.isArray(authority_scores)) {
      for (const s of authority_scores) {
        if (s?.url) scoreMap.set(s.url, s.normalized_score ?? 0);
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    const snapshots: LinkVelocitySnapshot[] = pages.map((p, i) => ({
      id:                      `vel_${site_id}_${i}_${Date.now()}`,
      site_id,
      url:                     p.url,
      snapshot_date:           today,
      inbound_internal_count:  p.inbound_link_count ?? 0,
      outbound_internal_count: p.outbound_link_count ?? 0,
      body_content_inbound:    0,
      navigation_inbound:      0,
      authority_score:         scoreMap.get(p.url) ?? null,
      captured_at:             now,
    }));

    const saveFn = deps?.saveFn ?? (async () => {});
    await saveFn(snapshots);

    return snapshots.length;
  } catch {
    return 0;
  }
}

// ── loadVelocityHistory ──────────────────────────────────────────────────────

export interface VelocityHistoryDeps {
  loadFn?: (site_id: string, url: string, limit: number) => Promise<LinkVelocitySnapshot[]>;
}

export async function loadVelocityHistory(
  site_id: string,
  url:     string,
  limit:   number,
  deps?:   VelocityHistoryDeps,
): Promise<LinkVelocitySnapshot[]> {
  try {
    if (!site_id || !url) return [];
    const safeLimit = typeof limit === 'number' && limit > 0 ? limit : 10;
    const loadFn = deps?.loadFn ?? (async () => [] as LinkVelocitySnapshot[]);
    const results = await loadFn(site_id, url, safeLimit);
    if (!Array.isArray(results)) return [];
    return [...results].sort((a, b) => (b.snapshot_date ?? '').localeCompare(a.snapshot_date ?? ''));
  } catch {
    return [];
  }
}

// ── calculateVelocityTrends ──────────────────────────────────────────────────

export interface VelocityTrendDeps {
  loadHistoryFn?: (site_id: string, url: string, limit: number) => Promise<LinkVelocitySnapshot[]>;
}

const TREND_SORT_ORDER: Record<VelocityTrendType, number> = {
  losing_sudden:     0,
  losing_gradual:    1,
  gaining:           2,
  new_page:          3,
  insufficient_data: 4,
  stable:            5,
};

export async function calculateVelocityTrends(
  site_id:          string,
  pages:            PageNode[],
  authority_scores: AuthorityScore[],
  deps?:            VelocityTrendDeps,
): Promise<LinkVelocityTrend[]> {
  try {
    if (!site_id || !Array.isArray(pages)) return [];

    const loadHistory = deps?.loadHistoryFn ?? (async () => [] as LinkVelocitySnapshot[]);

    const scoreMap = new Map<string, AuthorityScore>();
    if (Array.isArray(authority_scores)) {
      for (const s of authority_scores) if (s?.url) scoreMap.set(s.url, s);
    }

    const trends: LinkVelocityTrend[] = [];

    for (const page of pages) {
      if (!page?.url) continue;

      const history = await loadHistory(site_id, page.url, 30);
      const current_inbound = page.inbound_link_count ?? 0;
      const authScore = scoreMap.get(page.url);
      const is_hub = authScore?.authority_tier === 'hub';

      // Find snapshot ~7 days ago and ~30 days ago
      const now = Date.now();
      let snap7d: LinkVelocitySnapshot | null = null;
      let snap30d: LinkVelocitySnapshot | null = null;

      for (const snap of history) {
        const snapTime = new Date(snap.snapshot_date).getTime();
        const daysAgo = (now - snapTime) / (1000 * 60 * 60 * 24);
        if (!snap7d && daysAgo >= 5 && daysAgo <= 10) snap7d = snap;
        if (!snap30d && daysAgo >= 25 && daysAgo <= 35) snap30d = snap;
      }

      const inbound_7d_ago = snap7d?.inbound_internal_count ?? null;
      const inbound_30d_ago = snap30d?.inbound_internal_count ?? null;

      const change_7d = inbound_7d_ago != null ? current_inbound - inbound_7d_ago : null;
      const change_30d = inbound_30d_ago != null ? current_inbound - inbound_30d_ago : null;

      const pct_change_7d = change_7d != null && inbound_7d_ago != null && inbound_7d_ago > 0
        ? Math.round((change_7d / inbound_7d_ago) * 100 * 10) / 10
        : null;
      const pct_change_30d = change_30d != null && inbound_30d_ago != null && inbound_30d_ago > 0
        ? Math.round((change_30d / inbound_30d_ago) * 100 * 10) / 10
        : null;

      const trend_type = classifyVelocityTrend(change_7d, change_30d, current_inbound, pct_change_7d);

      const trend: LinkVelocityTrend = {
        url: page.url,
        site_id,
        title: page.title ?? null,
        current_inbound,
        inbound_7d_ago,
        inbound_30d_ago,
        change_7d,
        change_30d,
        pct_change_7d,
        pct_change_30d,
        trend_type,
        is_hub_page: is_hub,
        alert_required: false,
        alert_reason: null,
        authority_score: authScore?.normalized_score ?? null,
      };

      const alertResult = shouldAlertVelocity(trend);
      trend.alert_required = alertResult.alert;
      trend.alert_reason = alertResult.reason;

      trends.push(trend);
    }

    trends.sort((a, b) => {
      const oa = TREND_SORT_ORDER[a.trend_type] ?? 5;
      const ob = TREND_SORT_ORDER[b.trend_type] ?? 5;
      if (oa !== ob) return oa - ob;
      return (a.change_7d ?? 0) - (b.change_7d ?? 0);
    });

    return trends;
  } catch {
    return [];
  }
}

// ── getSiteVelocitySummary ───────────────────────────────────────────────────

export interface VelocitySummary {
  total_pages:           number;
  pages_gaining:         number;
  pages_losing_sudden:   number;
  pages_losing_gradual:  number;
  pages_stable:          number;
  hub_pages_losing:      number;
  total_alerts:          number;
  top_gaining:           LinkVelocityTrend[];
  top_losing:            LinkVelocityTrend[];
}

export interface VelocitySummaryDeps {
  trendsFn?: (site_id: string) => Promise<LinkVelocityTrend[]>;
}

export async function getSiteVelocitySummary(
  site_id: string,
  deps?:   VelocitySummaryDeps,
): Promise<VelocitySummary> {
  const empty: VelocitySummary = {
    total_pages: 0, pages_gaining: 0, pages_losing_sudden: 0,
    pages_losing_gradual: 0, pages_stable: 0, hub_pages_losing: 0,
    total_alerts: 0, top_gaining: [], top_losing: [],
  };

  try {
    if (!site_id) return empty;

    const trendsFn = deps?.trendsFn ?? (async () => [] as LinkVelocityTrend[]);
    const trends = await trendsFn(site_id);
    if (!Array.isArray(trends) || trends.length === 0) return empty;

    let pages_gaining = 0;
    let pages_losing_sudden = 0;
    let pages_losing_gradual = 0;
    let pages_stable = 0;
    let hub_pages_losing = 0;
    let total_alerts = 0;

    for (const t of trends) {
      switch (t.trend_type) {
        case 'gaining':        pages_gaining++; break;
        case 'losing_sudden':  pages_losing_sudden++; break;
        case 'losing_gradual': pages_losing_gradual++; break;
        case 'stable':         pages_stable++; break;
      }
      if (t.is_hub_page && (t.trend_type === 'losing_sudden' || t.trend_type === 'losing_gradual')) {
        hub_pages_losing++;
      }
      if (t.alert_required) total_alerts++;
    }

    const gaining = trends
      .filter(t => t.trend_type === 'gaining')
      .sort((a, b) => (b.change_7d ?? 0) - (a.change_7d ?? 0))
      .slice(0, 5);

    const losing = trends
      .filter(t => t.trend_type === 'losing_sudden' || t.trend_type === 'losing_gradual')
      .sort((a, b) => (a.change_7d ?? 0) - (b.change_7d ?? 0))
      .slice(0, 5);

    return {
      total_pages: trends.length,
      pages_gaining,
      pages_losing_sudden,
      pages_losing_gradual,
      pages_stable,
      hub_pages_losing,
      total_alerts,
      top_gaining: gaining,
      top_losing: losing,
    };
  } catch {
    return empty;
  }
}
