import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUGGESTION_RULES,
  runRuleEngine,
  type SuggestionSiteStats,
  type FixHistoryPage,
  type SuggestionRule,
} from './rule_engine.js';
import { buildSuggestion } from './suggestion.js';
import type { RankingSnapshot } from '../rankings/ranking_entry.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStats(overrides: Partial<SuggestionSiteStats> = {}): SuggestionSiteStats {
  return {
    domain: 'test.com',
    health_score: 75,
    health_score_delta: 5,
    schema_coverage_pct: 60,
    issues_pending: 3,
    fixes_this_week: 2,
    fixes_this_month: 8,
    fixes_applied: 20,
    issues_resolved: 17,
    ...overrides,
  };
}

function makeRankings(overrides: Partial<RankingSnapshot> = {}): RankingSnapshot {
  return {
    site_id: 'site1',
    snapshot_id: 'snap1',
    entries: [],
    total_keywords: 50,
    avg_position: 15,
    keywords_in_top_3: 5,
    keywords_in_top_10: 20,
    keywords_improved: 8,
    keywords_dropped: 2,
    keywords_new: 3,
    snapshot_date: new Date().toISOString(),
    ...overrides,
  };
}

function makeHistory(overrides: Partial<FixHistoryPage> = {}): FixHistoryPage {
  return {
    site_id: 'site1',
    entries: [],
    total: 0,
    page: 1,
    ...overrides,
  };
}

function findRule(id: string): SuggestionRule {
  const rule = SUGGESTION_RULES.find((r) => r.rule_id === id);
  assert.ok(rule, `Rule ${id} not found`);
  return rule;
}

// ── SUGGESTION_RULES ────────────────────────────────────────────────────────

describe('SUGGESTION_RULES', () => {
  it('has at least 12 rules', () => {
    assert.ok(SUGGESTION_RULES.length >= 12);
  });

  it('all rules have required fields', () => {
    for (const rule of SUGGESTION_RULES) {
      assert.ok(rule.rule_id);
      assert.ok(rule.name);
      assert.ok(rule.description);
      assert.equal(typeof rule.evaluate, 'function');
    }
  });
});

// ── Individual rules ────────────────────────────────────────────────────────

describe('low_schema_coverage rule', () => {
  it('triggers when schema_coverage_pct < 50', () => {
    const rule = findRule('low_schema_coverage');
    const result = rule.evaluate(makeStats({ schema_coverage_pct: 30 }), makeRankings(), makeHistory());
    assert.ok(result);
    assert.equal(result.priority, 'critical');
    assert.equal(result.fix_type, 'schema_missing');
  });

  it('returns null when schema_coverage_pct >= 50', () => {
    const rule = findRule('low_schema_coverage');
    const result = rule.evaluate(makeStats({ schema_coverage_pct: 55 }), makeRankings(), makeHistory());
    assert.equal(result, null);
  });
});

describe('poor_health_score rule', () => {
  it('triggers when health_score < 60', () => {
    const rule = findRule('poor_health_score');
    const result = rule.evaluate(makeStats({ health_score: 45 }), makeRankings(), makeHistory());
    assert.ok(result);
    assert.equal(result.priority, 'critical');
  });

  it('returns null when health_score >= 60', () => {
    const rule = findRule('poor_health_score');
    const result = rule.evaluate(makeStats({ health_score: 80 }), makeRankings(), makeHistory());
    assert.equal(result, null);
  });
});

describe('missing_titles rule', () => {
  it('triggers when issues_pending > 0 and history has title_missing', () => {
    const rule = findRule('missing_titles');
    const result = rule.evaluate(
      makeStats({ issues_pending: 5 }),
      makeRankings(),
      makeHistory({ entries: [{ fix_type: 'title_missing', applied_at: '', page_url: '/p1', success: true }] }),
    );
    assert.ok(result);
    assert.equal(result.priority, 'high');
  });

  it('returns null when no title fixes in history', () => {
    const rule = findRule('missing_titles');
    const result = rule.evaluate(makeStats({ issues_pending: 5 }), makeRankings(), makeHistory());
    assert.equal(result, null);
  });
});

describe('avg_position_opportunity rule', () => {
  it('triggers when avg_position > 20', () => {
    const rule = findRule('avg_position_opportunity');
    const result = rule.evaluate(makeStats(), makeRankings({ avg_position: 25 }), makeHistory());
    assert.ok(result);
    assert.equal(result.priority, 'high');
  });

  it('returns null when avg_position <= 20', () => {
    const rule = findRule('avg_position_opportunity');
    const result = rule.evaluate(makeStats(), makeRankings({ avg_position: 15 }), makeHistory());
    assert.equal(result, null);
  });
});

describe('top_10_expansion rule', () => {
  it('triggers when keywords_in_top_10 < 30% of total', () => {
    const rule = findRule('top_10_expansion');
    const result = rule.evaluate(makeStats(), makeRankings({ total_keywords: 100, keywords_in_top_10: 10 }), makeHistory());
    assert.ok(result);
    assert.equal(result.priority, 'high');
  });

  it('returns null when >= 30% in top 10', () => {
    const rule = findRule('top_10_expansion');
    const result = rule.evaluate(makeStats(), makeRankings({ total_keywords: 50, keywords_in_top_10: 20 }), makeHistory());
    assert.equal(result, null);
  });
});

describe('no_recent_fixes rule', () => {
  it('triggers when fixes_this_week === 0', () => {
    const rule = findRule('no_recent_fixes');
    const result = rule.evaluate(makeStats({ fixes_this_week: 0 }), makeRankings(), makeHistory());
    assert.ok(result);
    assert.equal(result.priority, 'medium');
  });

  it('returns null when fixes_this_week > 0', () => {
    const rule = findRule('no_recent_fixes');
    const result = rule.evaluate(makeStats({ fixes_this_week: 3 }), makeRankings(), makeHistory());
    assert.equal(result, null);
  });
});

describe('keywords_dropped rule', () => {
  it('triggers when keywords_dropped > 3', () => {
    const rule = findRule('keywords_dropped');
    const result = rule.evaluate(makeStats(), makeRankings({ keywords_dropped: 5 }), makeHistory());
    assert.ok(result);
    assert.equal(result.priority, 'high');
    assert.ok(result.description.includes('5'));
  });

  it('returns null when keywords_dropped <= 3', () => {
    const rule = findRule('keywords_dropped');
    const result = rule.evaluate(makeStats(), makeRankings({ keywords_dropped: 2 }), makeHistory());
    assert.equal(result, null);
  });
});

describe('high_fix_velocity_praise rule', () => {
  it('triggers when fixes_this_month >= 10', () => {
    const rule = findRule('high_fix_velocity_praise');
    const result = rule.evaluate(makeStats({ fixes_this_month: 15 }), makeRankings(), makeHistory());
    assert.ok(result);
    assert.ok(result.title.includes('Excellent'));
  });

  it('returns null when fixes_this_month < 10', () => {
    const rule = findRule('high_fix_velocity_praise');
    const result = rule.evaluate(makeStats({ fixes_this_month: 5 }), makeRankings(), makeHistory());
    assert.equal(result, null);
  });
});

describe('schema_rich_results rule', () => {
  it('triggers when schema_coverage 50-79%', () => {
    const rule = findRule('schema_rich_results');
    const result = rule.evaluate(makeStats({ schema_coverage_pct: 65 }), makeRankings(), makeHistory());
    assert.ok(result);
    assert.equal(result.priority, 'medium');
  });

  it('returns null when schema_coverage < 50', () => {
    const rule = findRule('schema_rich_results');
    const result = rule.evaluate(makeStats({ schema_coverage_pct: 40 }), makeRankings(), makeHistory());
    assert.equal(result, null);
  });

  it('returns null when schema_coverage >= 80', () => {
    const rule = findRule('schema_rich_results');
    const result = rule.evaluate(makeStats({ schema_coverage_pct: 85 }), makeRankings(), makeHistory());
    assert.equal(result, null);
  });
});

describe('image_alt_opportunity rule', () => {
  it('always triggers', () => {
    const rule = findRule('image_alt_opportunity');
    const result = rule.evaluate(makeStats(), makeRankings(), makeHistory());
    assert.ok(result);
    assert.equal(result.priority, 'low');
  });
});

describe('canonical_audit rule', () => {
  it('always triggers', () => {
    const rule = findRule('canonical_audit');
    const result = rule.evaluate(makeStats(), makeRankings(), makeHistory());
    assert.ok(result);
    assert.equal(result.fix_type, 'canonical_missing');
  });
});

// ── runRuleEngine ───────────────────────────────────────────────────────────

describe('runRuleEngine', () => {
  it('returns SuggestionSet with source rule_engine', async () => {
    const result = await runRuleEngine('site1', makeStats(), makeRankings(), makeHistory());
    assert.equal(result.generated_by, 'rule_engine');
  });

  it('sorts by priority: critical first', async () => {
    const result = await runRuleEngine('site1', makeStats({ health_score: 40, schema_coverage_pct: 30 }), makeRankings(), makeHistory());
    const priorities = result.suggestions.map((s) => s.priority);
    const critIdx = priorities.indexOf('critical');
    const lowIdx = priorities.lastIndexOf('low');
    if (critIdx >= 0 && lowIdx >= 0) {
      assert.ok(critIdx < lowIdx);
    }
  });

  it('critical_count accurate', async () => {
    const result = await runRuleEngine('site1', makeStats({ health_score: 40, schema_coverage_pct: 30 }), makeRankings(), makeHistory());
    const actual = result.suggestions.filter((s) => s.priority === 'critical').length;
    assert.equal(result.critical_count, actual);
  });

  it('custom rules parameter respected', async () => {
    const customRule: SuggestionRule = {
      rule_id: 'custom',
      name: 'Custom',
      description: 'test',
      evaluate: (stats) => buildSuggestion(stats.domain, {
        title: 'Custom', description: '', rationale: '', fix_type: 'custom',
        priority: 'low', estimated_impact: '', effort: 'low',
        affected_pages: [], affected_count: 0, can_auto_fix: false,
        source: 'rule_engine', confidence: 1, tags: [],
      }),
    };
    const result = await runRuleEngine('site1', makeStats(), makeRankings(), makeHistory(), [customRule]);
    assert.equal(result.total_count, 1);
    assert.equal(result.suggestions[0].title, 'Custom');
  });

  it('never throws on any input', async () => {
    const result = await runRuleEngine('', {} as SuggestionSiteStats, {} as RankingSnapshot, {} as FixHistoryPage);
    assert.ok(result);
    assert.equal(typeof result.total_count, 'number');
  });

  it('sets site_id on all suggestions', async () => {
    const result = await runRuleEngine('my-site', makeStats(), makeRankings(), makeHistory());
    for (const s of result.suggestions) {
      assert.equal(s.site_id, 'my-site');
    }
  });
});
