import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultAIConfig,
  buildSiteContextPrompt,
  runAIEngine,
  type AIEngineConfig,
} from './ai_engine.js';
import type { SuggestionSiteStats, FixHistoryPage } from './rule_engine.js';
import type { RankingSnapshot } from '../rankings/ranking_entry.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStats(overrides: Partial<SuggestionSiteStats> = {}): SuggestionSiteStats {
  return {
    domain: 'example.com',
    health_score: 72,
    health_score_delta: 5,
    schema_coverage_pct: 45,
    issues_pending: 8,
    fixes_this_week: 3,
    fixes_this_month: 12,
    fixes_applied: 30,
    issues_resolved: 22,
    ...overrides,
  };
}

function makeRankings(overrides: Partial<RankingSnapshot> = {}): RankingSnapshot {
  return {
    site_id: 'site1',
    snapshot_id: 'snap1',
    entries: [],
    total_keywords: 40,
    avg_position: 18,
    keywords_in_top_3: 3,
    keywords_in_top_10: 12,
    keywords_improved: 5,
    keywords_dropped: 2,
    keywords_new: 4,
    snapshot_date: new Date().toISOString(),
    ...overrides,
  };
}

function makeHistory(overrides: Partial<FixHistoryPage> = {}): FixHistoryPage {
  return {
    site_id: 'site1',
    entries: [
      { fix_type: 'schema_missing', applied_at: '', page_url: '/p1', success: true },
      { fix_type: 'title_missing', applied_at: '', page_url: '/p2', success: true },
    ],
    total: 2,
    page: 1,
    ...overrides,
  };
}

const MOCK_AI_RESPONSE = JSON.stringify([
  {
    title: 'Add FAQ Schema',
    description: 'Adding FAQ schema to key pages will unlock rich results.',
    rationale: 'FAQ schema increases CTR by 20-30%.',
    fix_type: 'schema_missing',
    priority: 'high',
    estimated_impact: '+15% organic traffic',
    effort: 'low',
    can_auto_fix: true,
    confidence: 0.9,
    tags: ['schema', 'faq'],
  },
  {
    title: 'Fix Missing Titles',
    description: 'Several pages are missing title tags.',
    rationale: 'Title tags are the strongest on-page signal.',
    fix_type: 'title_missing',
    priority: 'critical',
    estimated_impact: '+10% organic traffic',
    effort: 'low',
    can_auto_fix: true,
    confidence: 0.95,
    tags: ['title', 'on-page'],
  },
]);

// ── defaultAIConfig ─────────────────────────────────────────────────────────

describe('defaultAIConfig', () => {
  it('returns config with model', () => {
    const config = defaultAIConfig();
    assert.equal(config.model, 'claude-opus-4-6');
  });

  it('returns config with max_tokens', () => {
    const config = defaultAIConfig();
    assert.equal(config.max_tokens, 1500);
  });

  it('returns config with temperature 0', () => {
    const config = defaultAIConfig();
    assert.equal(config.temperature, 0);
  });

  it('returns config with system_prompt', () => {
    const config = defaultAIConfig();
    assert.ok(config.system_prompt.length > 0);
    assert.ok(config.system_prompt.includes('VAEO'));
  });
});

// ── buildSiteContextPrompt ──────────────────────────────────────────────────

describe('buildSiteContextPrompt', () => {
  it('contains domain', () => {
    const prompt = buildSiteContextPrompt(makeStats(), makeRankings(), makeHistory());
    assert.ok(prompt.includes('example.com'));
  });

  it('contains health score', () => {
    const prompt = buildSiteContextPrompt(makeStats({ health_score: 72 }), makeRankings(), makeHistory());
    assert.ok(prompt.includes('72'));
  });

  it('contains schema coverage', () => {
    const prompt = buildSiteContextPrompt(makeStats({ schema_coverage_pct: 45 }), makeRankings(), makeHistory());
    assert.ok(prompt.includes('45%'));
  });

  it('contains fix types from history', () => {
    const prompt = buildSiteContextPrompt(makeStats(), makeRankings(), makeHistory());
    assert.ok(prompt.includes('schema_missing'));
    assert.ok(prompt.includes('title_missing'));
  });

  it('contains keyword stats', () => {
    const prompt = buildSiteContextPrompt(makeStats(), makeRankings({ total_keywords: 40 }), makeHistory());
    assert.ok(prompt.includes('40'));
  });
});

// ── runAIEngine ─────────────────────────────────────────────────────────────

describe('runAIEngine', () => {
  it('parses mock JSON response into suggestions', async () => {
    const result = await runAIEngine('site1', makeStats(), makeRankings(), makeHistory(), undefined, {
      callClaude: async () => MOCK_AI_RESPONSE,
    });
    assert.equal(result.total_count, 2);
    assert.ok(result.suggestions[0].title);
  });

  it('builds correct Suggestion objects', async () => {
    const result = await runAIEngine('site1', makeStats(), makeRankings(), makeHistory(), undefined, {
      callClaude: async () => MOCK_AI_RESPONSE,
    });
    const faq = result.suggestions.find((s) => s.title === 'Add FAQ Schema');
    assert.ok(faq);
    assert.equal(faq.fix_type, 'schema_missing');
    assert.equal(faq.priority, 'high');
    assert.equal(faq.can_auto_fix, true);
    assert.equal(faq.confidence, 0.9);
  });

  it('source is ai_engine', async () => {
    const result = await runAIEngine('site1', makeStats(), makeRankings(), makeHistory(), undefined, {
      callClaude: async () => MOCK_AI_RESPONSE,
    });
    assert.equal(result.generated_by, 'ai_engine');
    for (const s of result.suggestions) {
      assert.equal(s.source, 'ai_engine');
    }
  });

  it('API failure returns empty set, not throw', async () => {
    const result = await runAIEngine('site1', makeStats(), makeRankings(), makeHistory(), undefined, {
      callClaude: async () => { throw new Error('API down'); },
    });
    assert.equal(result.total_count, 0);
    assert.equal(result.generated_by, 'ai_engine');
  });

  it('invalid JSON returns empty set', async () => {
    const result = await runAIEngine('site1', makeStats(), makeRankings(), makeHistory(), undefined, {
      callClaude: async () => 'not json at all {{{',
    });
    assert.equal(result.total_count, 0);
  });

  it('empty response returns empty set', async () => {
    const result = await runAIEngine('site1', makeStats(), makeRankings(), makeHistory(), undefined, {
      callClaude: async () => '',
    });
    assert.equal(result.total_count, 0);
  });

  it('callClaude receives system prompt', async () => {
    let receivedSystem = '';
    await runAIEngine('site1', makeStats(), makeRankings(), makeHistory(), undefined, {
      callClaude: async (_prompt, system) => {
        receivedSystem = system;
        return '[]';
      },
    });
    assert.ok(receivedSystem.includes('VAEO'));
  });

  it('callClaude receives site context as prompt', async () => {
    let receivedPrompt = '';
    await runAIEngine('site1', makeStats(), makeRankings(), makeHistory(), undefined, {
      callClaude: async (prompt) => {
        receivedPrompt = prompt;
        return '[]';
      },
    });
    assert.ok(receivedPrompt.includes('example.com'));
  });

  it('custom config overrides defaults', async () => {
    let receivedConfig: AIEngineConfig | undefined;
    await runAIEngine('site1', makeStats(), makeRankings(), makeHistory(), { max_tokens: 2000 }, {
      callClaude: async (_p, _s, config) => {
        receivedConfig = config;
        return '[]';
      },
    });
    assert.equal(receivedConfig?.max_tokens, 2000);
    assert.equal(receivedConfig?.model, 'claude-opus-4-6');
  });

  it('handles non-array JSON response', async () => {
    const result = await runAIEngine('site1', makeStats(), makeRankings(), makeHistory(), undefined, {
      callClaude: async () => '{"key": "value"}',
    });
    assert.equal(result.total_count, 0);
  });

  it('filters out items without title', async () => {
    const partial = JSON.stringify([
      { fix_type: 'schema_missing' },
      { title: 'Valid', fix_type: 'title_missing', priority: 'high' },
    ]);
    const result = await runAIEngine('site1', makeStats(), makeRankings(), makeHistory(), undefined, {
      callClaude: async () => partial,
    });
    assert.equal(result.total_count, 1);
    assert.equal(result.suggestions[0].title, 'Valid');
  });

  it('defaults invalid priority to medium', async () => {
    const data = JSON.stringify([
      { title: 'Test', fix_type: 'x', priority: 'URGENT' },
    ]);
    const result = await runAIEngine('site1', makeStats(), makeRankings(), makeHistory(), undefined, {
      callClaude: async () => data,
    });
    assert.equal(result.suggestions[0].priority, 'medium');
  });
});
