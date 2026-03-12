import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUICK_ANSWERS,
  resolveQuickAnswer,
  formatAnswer,
  type QuickAnswer,
} from './quick_answers.js';
import { buildSiteContext, type SiteContext } from './context_builder.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<SiteContext> = {}): SiteContext {
  return buildSiteContext('site1', 'test.com', {
    health_score: 72,
    recent_fixes: 15,
    open_issues: 10,
    top_issue_types: ['schema_missing', 'meta_description_missing'],
    ranking_trend: 'improving',
    ai_visibility_score: 45,
    ...overrides,
  });
}

// ── QUICK_ANSWERS ────────────────────────────────────────────────────────────

describe('QUICK_ANSWERS', () => {
  it('has minimum 4 entries', () => {
    assert.ok(QUICK_ANSWERS.length >= 4);
  });

  it('all entries have required fields', () => {
    for (const qa of QUICK_ANSWERS) {
      assert.equal(typeof qa.question, 'string');
      assert.equal(typeof qa.answer_template, 'string');
      assert.equal(typeof qa.requires_context, 'boolean');
      assert.ok(Array.isArray(qa.context_fields));
    }
  });

  it('includes "What should I fix first?" question', () => {
    const match = QUICK_ANSWERS.find(q => q.question === 'What should I fix first?');
    assert.ok(match);
    assert.ok(match.context_fields.includes('health_score'));
    assert.ok(match.context_fields.includes('top_issue_types'));
  });

  it('includes "What has VAEO fixed recently?" question', () => {
    const match = QUICK_ANSWERS.find(q => q.question === 'What has VAEO fixed recently?');
    assert.ok(match);
    assert.ok(match.context_fields.includes('recent_fixes'));
  });
});

// ── resolveQuickAnswer ───────────────────────────────────────────────────────

describe('resolveQuickAnswer', () => {
  it('finds exact match', () => {
    const ctx = makeContext();
    const answer = resolveQuickAnswer('What should I fix first?', ctx);
    assert.ok(answer);
    assert.ok(answer.includes('72'));
  });

  it('is case insensitive', () => {
    const ctx = makeContext();
    const answer = resolveQuickAnswer('what should i fix first?', ctx);
    assert.ok(answer);
  });

  it('returns null for no match', () => {
    const ctx = makeContext();
    const answer = resolveQuickAnswer('What is the meaning of life?', ctx);
    assert.equal(answer, null);
  });

  it('resolves with real context values', () => {
    const ctx = makeContext({ recent_fixes: 42 });
    const answer = resolveQuickAnswer('What has VAEO fixed recently?', ctx);
    assert.ok(answer);
    assert.ok(answer.includes('42'));
  });

  it('resolves AI visibility question', () => {
    const ctx = makeContext({ ai_visibility_score: 55 });
    const answer = resolveQuickAnswer('What is my AI visibility score?', ctx);
    assert.ok(answer);
    assert.ok(answer.includes('55'));
  });

  it('never throws on null question', () => {
    const ctx = makeContext();
    const answer = resolveQuickAnswer(null as unknown as string, ctx);
    assert.equal(answer, null);
  });

  it('never throws on null context', () => {
    const answer = resolveQuickAnswer('What should I fix first?', null as unknown as SiteContext);
    assert.ok(answer !== undefined);
  });
});

// ── formatAnswer ─────────────────────────────────────────────────────────────

describe('formatAnswer', () => {
  it('replaces {health_score}', () => {
    const ctx = makeContext({ health_score: 88 });
    const result = formatAnswer('Score: {health_score}', ctx);
    assert.equal(result, 'Score: 88');
  });

  it('replaces {domain}', () => {
    const ctx = makeContext();
    const result = formatAnswer('Site: {domain}', ctx);
    assert.equal(result, 'Site: test.com');
  });

  it('replaces {recent_fixes}', () => {
    const ctx = makeContext({ recent_fixes: 7 });
    const result = formatAnswer('Fixed: {recent_fixes}', ctx);
    assert.equal(result, 'Fixed: 7');
  });

  it('replaces {ranking_trend}', () => {
    const ctx = makeContext({ ranking_trend: 'declining' });
    const result = formatAnswer('Trend: {ranking_trend}', ctx);
    assert.equal(result, 'Trend: declining');
  });

  it('replaces {ai_visibility_score}', () => {
    const ctx = makeContext({ ai_visibility_score: 60 });
    const result = formatAnswer('AI: {ai_visibility_score}', ctx);
    assert.equal(result, 'AI: 60');
  });

  it('replaces {top_issue_types}', () => {
    const ctx = makeContext({ top_issue_types: ['broken_links', 'slow_pages'] });
    const result = formatAnswer('Issues: {top_issue_types}', ctx);
    assert.equal(result, 'Issues: broken_links, slow_pages');
  });

  it('never throws on null template', () => {
    const ctx = makeContext();
    assert.doesNotThrow(() => formatAnswer(null as unknown as string, ctx));
  });
});
