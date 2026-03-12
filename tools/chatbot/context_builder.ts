/**
 * tools/chatbot/context_builder.ts
 */

// ── Deterministic hash ────────────────────────────────────────────────────────

function simHash(s: string): number {
  let h = 0;
  for (const c of (s ?? '')) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return Math.abs(h);
}

// ── SiteContext interface ─────────────────────────────────────────────────────

export interface SiteContext {
  site_id:              string;
  domain:               string;
  health_score:         number;
  recent_fixes:         number;
  open_issues:          number;
  top_issue_types:      string[];
  ranking_trend:        'improving' | 'declining' | 'stable';
  ai_visibility_score:  number;
  last_run_at?:         string;
  data_source:          'live' | 'simulated';
}

// ── buildSiteContext ──────────────────────────────────────────────────────────

const DEFAULT_ISSUE_TYPES = [
  'schema_missing', 'meta_description_missing', 'image_alt_missing',
  'canonical_missing', 'title_missing',
];

const TRENDS: Array<'improving' | 'declining' | 'stable'> = ['improving', 'stable', 'declining'];

export function buildSiteContext(
  site_id:  string,
  domain:   string,
  options?: {
    health_score?:        number;
    recent_fixes?:        number;
    open_issues?:         number;
    top_issue_types?:     string[];
    ranking_trend?:       'improving' | 'declining' | 'stable';
    ai_visibility_score?: number;
    last_run_at?:         string;
  },
): SiteContext {
  try {
    const hasOptions = options !== undefined && options !== null;

    if (hasOptions) {
      const h = simHash(site_id ?? '');
      return {
        site_id,
        domain,
        health_score:        options.health_score        ?? 72,
        recent_fixes:        options.recent_fixes        ?? 12,
        open_issues:         options.open_issues         ?? 14,
        top_issue_types:     options.top_issue_types     ?? DEFAULT_ISSUE_TYPES.slice(0, 3),
        ranking_trend:       options.ranking_trend       ?? TRENDS[h % 3],
        ai_visibility_score: options.ai_visibility_score ?? 45,
        last_run_at:         options.last_run_at,
        data_source:         'live',
      };
    }

    // Simulated defaults — deterministic from site_id
    const h = simHash(site_id ?? '');
    return {
      site_id,
      domain,
      health_score:        55 + (h % 40),                  // 55-94
      recent_fixes:        5  + (h % 20),                  // 5-24
      open_issues:         8  + (h % 25),                  // 8-32
      top_issue_types:     DEFAULT_ISSUE_TYPES.slice(0, 3 + (h % 3)),
      ranking_trend:       TRENDS[h % 3],
      ai_visibility_score: 30 + (h % 50),                  // 30-79
      data_source:         'simulated',
    };
  } catch {
    return {
      site_id:             site_id ?? '',
      domain:              domain ?? '',
      health_score:        50,
      recent_fixes:        5,
      open_issues:         10,
      top_issue_types:     ['schema_missing'],
      ranking_trend:       'stable',
      ai_visibility_score: 40,
      data_source:         'simulated',
    };
  }
}

// ── formatContextForPrompt ────────────────────────────────────────────────────

export function formatContextForPrompt(context: SiteContext): string {
  try {
    const c = context ?? {} as SiteContext;
    return [
      `Site: ${c.domain ?? ''}`,
      `Health Score: ${c.health_score ?? 0}/100`,
      `Recent Fixes: ${c.recent_fixes ?? 0} in last 30 days`,
      `Open Issues: ${c.open_issues ?? 0}`,
      `Top Issues: ${(c.top_issue_types ?? []).join(', ')}`,
      `Ranking Trend: ${c.ranking_trend ?? 'stable'}`,
      `AI Visibility Score: ${c.ai_visibility_score ?? 0}/100`,
      `Data: ${c.data_source ?? 'simulated'}`,
    ].join('\n');
  } catch {
    return 'Site context unavailable.';
  }
}

// ── buildSystemPrompt ─────────────────────────────────────────────────────────

export function buildSystemPrompt(context: SiteContext): string {
  try {
    const domain = context?.domain ?? 'your site';
    return [
      `You are the VAEO AI assistant for ${domain}.`,
      `You help the site owner understand their SEO performance`,
      `and what actions VAEO is taking to improve it.`,
      `Be concise, specific, and actionable.`,
      `Always reference the site data below when answering.`,
      `If asked about something outside SEO, politely redirect.`,
      formatContextForPrompt(context),
    ].join('\n');
  } catch {
    return 'You are the VAEO AI assistant. Be concise, specific, and actionable.';
  }
}
