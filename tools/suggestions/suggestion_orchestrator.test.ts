import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateSuggestions, type SuggestionMode } from './suggestion_orchestrator.js';
import { buildSuggestion, buildSuggestionSet, type SuggestionSet } from './suggestion.js';
import type { SuggestionSiteStats, FixHistoryPage } from './rule_engine.js';
import type { RankingSnapshot } from '../rankings/ranking_entry.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStats(): SuggestionSiteStats {
  return {
    domain: 'test.com', health_score: 75, health_score_delta: 5,
    schema_coverage_pct: 60, issues_pending: 3, fixes_this_week: 2,
    fixes_this_month: 8, fixes_applied: 20, issues_resolved: 17,
  };
}

function makeRankings(): RankingSnapshot {
  return {
    site_id: 'site1', snapshot_id: 'snap1', entries: [],
    total_keywords: 50, avg_position: 15, keywords_in_top_3: 5,
    keywords_in_top_10: 20, keywords_improved: 8, keywords_dropped: 2,
    keywords_new: 3, snapshot_date: new Date().toISOString(),
  };
}

function makeHistory(): FixHistoryPage {
  return { site_id: 'site1', entries: [], total: 0, page: 1 };
}

function makeRuleSet(): SuggestionSet {
  return buildSuggestionSet('site1', [
    buildSuggestion('site1', {
      title: 'Rule A', description: '', rationale: '', fix_type: 'schema_missing',
      priority: 'high', estimated_impact: '', effort: 'low', affected_pages: [],
      affected_count: 0, can_auto_fix: true, source: 'rule_engine', confidence: 0.9, tags: [],
    }),
    buildSuggestion('site1', {
      title: 'Rule B', description: '', rationale: '', fix_type: 'title_missing',
      priority: 'critical', estimated_impact: '', effort: 'low', affected_pages: [],
      affected_count: 0, can_auto_fix: true, source: 'rule_engine', confidence: 0.85, tags: [],
    }),
  ], 'rule_engine');
}

function makeAISet(): SuggestionSet {
  return buildSuggestionSet('site1', [
    buildSuggestion('site1', {
      title: 'AI A', description: '', rationale: '', fix_type: 'schema_missing',
      priority: 'critical', estimated_impact: '', effort: 'medium', affected_pages: [],
      affected_count: 0, can_auto_fix: true, source: 'ai_engine', confidence: 0.95, tags: [],
    }),
    buildSuggestion('site1', {
      title: 'AI B', description: '', rationale: '', fix_type: 'image_alt_missing',
      priority: 'medium', estimated_impact: '', effort: 'low', affected_pages: [],
      affected_count: 0, can_auto_fix: true, source: 'ai_engine', confidence: 0.8, tags: [],
    }),
  ], 'ai_engine');
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('generateSuggestions', () => {
  it('mode rule only runs rule engine', async () => {
    let ruleCalled = false;
    let aiCalled = false;
    await generateSuggestions('site1', makeStats(), makeRankings(), makeHistory(), 'rule', {
      runRuleEngine: async () => { ruleCalled = true; return makeRuleSet(); },
      runAIEngine: async () => { aiCalled = true; return makeAISet(); },
    });
    assert.equal(ruleCalled, true);
    assert.equal(aiCalled, false);
  });

  it('mode ai only runs AI engine', async () => {
    let ruleCalled = false;
    let aiCalled = false;
    await generateSuggestions('site1', makeStats(), makeRankings(), makeHistory(), 'ai', {
      runRuleEngine: async () => { ruleCalled = true; return makeRuleSet(); },
      runAIEngine: async () => { aiCalled = true; return makeAISet(); },
    });
    assert.equal(ruleCalled, false);
    assert.equal(aiCalled, true);
  });

  it('mode both runs both engines', async () => {
    let ruleCalled = false;
    let aiCalled = false;
    await generateSuggestions('site1', makeStats(), makeRankings(), makeHistory(), 'both', {
      runRuleEngine: async () => { ruleCalled = true; return makeRuleSet(); },
      runAIEngine: async () => { aiCalled = true; return makeAISet(); },
    });
    assert.equal(ruleCalled, true);
    assert.equal(aiCalled, true);
  });

  it('combined deduplicates by fix_type keeping highest priority', async () => {
    const result = await generateSuggestions('site1', makeStats(), makeRankings(), makeHistory(), 'both', {
      runRuleEngine: async () => makeRuleSet(),
      runAIEngine: async () => makeAISet(),
    });
    // schema_missing appears in both — should keep critical (AI A)
    const schema = result.combined.filter((s) => s.fix_type === 'schema_missing');
    assert.equal(schema.length, 1);
    assert.equal(schema[0].priority, 'critical');
  });

  it('combined sorted by priority: critical first', async () => {
    const result = await generateSuggestions('site1', makeStats(), makeRankings(), makeHistory(), 'both', {
      runRuleEngine: async () => makeRuleSet(),
      runAIEngine: async () => makeAISet(),
    });
    const priorities = result.combined.map((s) => s.priority);
    const critIdx = priorities.indexOf('critical');
    const medIdx = priorities.indexOf('medium');
    if (critIdx >= 0 && medIdx >= 0) {
      assert.ok(critIdx < medIdx);
    }
  });

  it('rule_suggestions is null when mode is ai', async () => {
    const result = await generateSuggestions('site1', makeStats(), makeRankings(), makeHistory(), 'ai', {
      runAIEngine: async () => makeAISet(),
    });
    assert.equal(result.rule_suggestions, null);
    assert.ok(result.ai_suggestions);
  });

  it('ai_suggestions is null when mode is rule', async () => {
    const result = await generateSuggestions('site1', makeStats(), makeRankings(), makeHistory(), 'rule', {
      runRuleEngine: async () => makeRuleSet(),
    });
    assert.ok(result.rule_suggestions);
    assert.equal(result.ai_suggestions, null);
  });

  it('mode is returned in result', async () => {
    const result = await generateSuggestions('site1', makeStats(), makeRankings(), makeHistory(), 'both', {
      runRuleEngine: async () => makeRuleSet(),
      runAIEngine: async () => makeAISet(),
    });
    assert.equal(result.mode, 'both');
  });

  it('never throws on missing deps', async () => {
    const result = await generateSuggestions('site1', makeStats(), makeRankings(), makeHistory(), 'both');
    assert.ok(result);
    assert.deepEqual(result.combined, []);
  });

  it('never throws on engine failure', async () => {
    const result = await generateSuggestions('site1', makeStats(), makeRankings(), makeHistory(), 'both', {
      runRuleEngine: async () => { throw new Error('boom'); },
      runAIEngine: async () => { throw new Error('crash'); },
    });
    assert.ok(result);
    assert.deepEqual(result.combined, []);
  });

  it('combined includes unique fix_types from both engines', async () => {
    const result = await generateSuggestions('site1', makeStats(), makeRankings(), makeHistory(), 'both', {
      runRuleEngine: async () => makeRuleSet(),
      runAIEngine: async () => makeAISet(),
    });
    const fixTypes = result.combined.map((s) => s.fix_type);
    assert.ok(fixTypes.includes('title_missing'));
    assert.ok(fixTypes.includes('image_alt_missing'));
    assert.ok(fixTypes.includes('schema_missing'));
  });

  it('rule-only mode returns correct combined count', async () => {
    const result = await generateSuggestions('site1', makeStats(), makeRankings(), makeHistory(), 'rule', {
      runRuleEngine: async () => makeRuleSet(),
    });
    assert.equal(result.combined.length, 2);
  });

  it('ai-only mode returns correct combined count', async () => {
    const result = await generateSuggestions('site1', makeStats(), makeRankings(), makeHistory(), 'ai', {
      runAIEngine: async () => makeAISet(),
    });
    assert.equal(result.combined.length, 2);
  });

  it('empty engine results yield empty combined', async () => {
    const empty = buildSuggestionSet('site1', [], 'rule_engine');
    const result = await generateSuggestions('site1', makeStats(), makeRankings(), makeHistory(), 'rule', {
      runRuleEngine: async () => empty,
    });
    assert.equal(result.combined.length, 0);
  });

  it('handles null rule result gracefully', async () => {
    const result = await generateSuggestions('site1', makeStats(), makeRankings(), makeHistory(), 'rule', {
      runRuleEngine: async () => null as unknown as SuggestionSet,
    });
    assert.ok(result);
  });

  it('mode both with only rule dep works', async () => {
    const result = await generateSuggestions('site1', makeStats(), makeRankings(), makeHistory(), 'both', {
      runRuleEngine: async () => makeRuleSet(),
    });
    assert.ok(result.rule_suggestions);
    assert.equal(result.ai_suggestions, null);
    assert.equal(result.combined.length, 2);
  });
});
