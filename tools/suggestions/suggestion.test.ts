import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSuggestion,
  buildSuggestionSet,
  type Suggestion,
  type SuggestionPriority,
  type SuggestionSource,
} from './suggestion.js';

// ── Helper ────────────────────────────────────────────────────────────────────

function makeSuggestion(overrides: Partial<Omit<Suggestion, 'suggestion_id' | 'site_id' | 'created_at'>> = {}): Suggestion {
  return buildSuggestion('site1', {
    title: 'Test Suggestion',
    description: 'Test description',
    rationale: 'Test rationale',
    fix_type: 'schema_missing',
    priority: 'medium',
    estimated_impact: '+10% traffic',
    effort: 'low',
    affected_pages: ['/page1', '/page2'],
    affected_count: 2,
    can_auto_fix: true,
    source: 'rule_engine',
    confidence: 0.85,
    tags: ['schema', 'seo'],
    ...overrides,
  });
}

// ── buildSuggestion ─────────────────────────────────────────────────────────

describe('buildSuggestion', () => {
  it('sets suggestion_id as UUID', () => {
    const s = makeSuggestion();
    assert.ok(s.suggestion_id);
    assert.match(s.suggestion_id, /^[0-9a-f-]{36}$/);
  });

  it('sets site_id from argument', () => {
    const s = buildSuggestion('my-site', {
      title: 'T', description: 'D', rationale: 'R', fix_type: 'x',
      priority: 'low', estimated_impact: '', effort: 'low',
      affected_pages: [], affected_count: 0, can_auto_fix: false,
      source: 'rule_engine', confidence: 0, tags: [],
    });
    assert.equal(s.site_id, 'my-site');
  });

  it('sets created_at to ISO string', () => {
    const s = makeSuggestion();
    assert.ok(s.created_at);
    assert.ok(!isNaN(Date.parse(s.created_at)));
  });

  it('preserves title', () => {
    const s = makeSuggestion({ title: 'Fix Schema' });
    assert.equal(s.title, 'Fix Schema');
  });

  it('preserves priority', () => {
    const s = makeSuggestion({ priority: 'critical' });
    assert.equal(s.priority, 'critical');
  });

  it('preserves can_auto_fix', () => {
    const s = makeSuggestion({ can_auto_fix: false });
    assert.equal(s.can_auto_fix, false);
  });

  it('preserves confidence', () => {
    const s = makeSuggestion({ confidence: 0.92 });
    assert.equal(s.confidence, 0.92);
  });

  it('preserves tags array', () => {
    const s = makeSuggestion({ tags: ['a', 'b', 'c'] });
    assert.deepEqual(s.tags, ['a', 'b', 'c']);
  });

  it('preserves affected_pages', () => {
    const s = makeSuggestion({ affected_pages: ['/p1'] });
    assert.deepEqual(s.affected_pages, ['/p1']);
  });

  it('preserves source', () => {
    const s = makeSuggestion({ source: 'ai_engine' });
    assert.equal(s.source, 'ai_engine');
  });

  it('never throws on empty site_id', () => {
    const s = buildSuggestion('', {
      title: 'T', description: 'D', rationale: 'R', fix_type: 'x',
      priority: 'low', estimated_impact: '', effort: 'low',
      affected_pages: [], affected_count: 0, can_auto_fix: false,
      source: 'rule_engine', confidence: 0, tags: [],
    });
    assert.equal(s.site_id, '');
  });
});

// ── buildSuggestionSet ──────────────────────────────────────────────────────

describe('buildSuggestionSet', () => {
  it('sets set_id as UUID', () => {
    const set = buildSuggestionSet('site1', [], 'rule_engine');
    assert.ok(set.set_id);
    assert.match(set.set_id, /^[0-9a-f-]{36}$/);
  });

  it('sets site_id', () => {
    const set = buildSuggestionSet('site1', [], 'rule_engine');
    assert.equal(set.site_id, 'site1');
  });

  it('sets generated_at to ISO string', () => {
    const set = buildSuggestionSet('site1', [], 'rule_engine');
    assert.ok(!isNaN(Date.parse(set.generated_at)));
  });

  it('generated_by matches source', () => {
    const set = buildSuggestionSet('site1', [], 'ai_engine');
    assert.equal(set.generated_by, 'ai_engine');
  });

  it('total_count matches suggestion count', () => {
    const suggestions = [makeSuggestion(), makeSuggestion()];
    const set = buildSuggestionSet('site1', suggestions, 'rule_engine');
    assert.equal(set.total_count, 2);
  });

  it('critical_count accurate', () => {
    const suggestions = [
      makeSuggestion({ priority: 'critical' }),
      makeSuggestion({ priority: 'critical' }),
      makeSuggestion({ priority: 'high' }),
    ];
    const set = buildSuggestionSet('site1', suggestions, 'rule_engine');
    assert.equal(set.critical_count, 2);
  });

  it('high_count accurate', () => {
    const suggestions = [
      makeSuggestion({ priority: 'high' }),
      makeSuggestion({ priority: 'medium' }),
      makeSuggestion({ priority: 'high' }),
    ];
    const set = buildSuggestionSet('site1', suggestions, 'rule_engine');
    assert.equal(set.high_count, 2);
  });

  it('auto_fixable_count accurate', () => {
    const suggestions = [
      makeSuggestion({ can_auto_fix: true }),
      makeSuggestion({ can_auto_fix: false }),
      makeSuggestion({ can_auto_fix: true }),
    ];
    const set = buildSuggestionSet('site1', suggestions, 'rule_engine');
    assert.equal(set.auto_fixable_count, 2);
  });

  it('empty suggestions yields zero counts', () => {
    const set = buildSuggestionSet('site1', [], 'rule_engine');
    assert.equal(set.total_count, 0);
    assert.equal(set.critical_count, 0);
    assert.equal(set.high_count, 0);
    assert.equal(set.auto_fixable_count, 0);
  });

  it('never throws on empty site_id', () => {
    const set = buildSuggestionSet('', [], 'rule_engine');
    assert.equal(set.site_id, '');
  });
});
