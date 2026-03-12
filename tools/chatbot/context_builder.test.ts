/**
 * tools/chatbot/context_builder.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSiteContext,
  formatContextForPrompt,
  buildSystemPrompt,
} from './context_builder.ts';

// ── buildSiteContext ──────────────────────────────────────────────────────────

describe('buildSiteContext', () => {
  it('sets site_id and domain', () => {
    const c = buildSiteContext('site-1', 'example.com');
    assert.equal(c.site_id, 'site-1');
    assert.equal(c.domain, 'example.com');
  });

  it('data_source is simulated when no options', () => {
    const c = buildSiteContext('site-1', 'example.com');
    assert.equal(c.data_source, 'simulated');
  });

  it('data_source is live when options provided', () => {
    const c = buildSiteContext('site-1', 'example.com', { health_score: 80 });
    assert.equal(c.data_source, 'live');
  });

  it('applies health_score override', () => {
    const c = buildSiteContext('site-1', 'example.com', { health_score: 88 });
    assert.equal(c.health_score, 88);
  });

  it('applies recent_fixes override', () => {
    const c = buildSiteContext('site-1', 'example.com', { recent_fixes: 25 });
    assert.equal(c.recent_fixes, 25);
  });

  it('applies open_issues override', () => {
    const c = buildSiteContext('site-1', 'example.com', { open_issues: 5 });
    assert.equal(c.open_issues, 5);
  });

  it('applies ranking_trend override', () => {
    const c = buildSiteContext('site-1', 'example.com', { ranking_trend: 'declining' });
    assert.equal(c.ranking_trend, 'declining');
  });

  it('applies ai_visibility_score override', () => {
    const c = buildSiteContext('site-1', 'example.com', { ai_visibility_score: 70 });
    assert.equal(c.ai_visibility_score, 70);
  });

  it('simulated defaults are in plausible ranges', () => {
    const c = buildSiteContext('site-abc', 'example.com');
    assert.ok(c.health_score >= 55 && c.health_score <= 94);
    assert.ok(c.recent_fixes >= 5 && c.recent_fixes <= 24);
    assert.ok(c.open_issues >= 8 && c.open_issues <= 32);
  });

  it('is deterministic for same site_id', () => {
    const a = buildSiteContext('site-xyz', 'example.com');
    const b = buildSiteContext('site-xyz', 'example.com');
    assert.equal(a.health_score, b.health_score);
    assert.equal(a.ranking_trend, b.ranking_trend);
  });

  it('top_issue_types is an array', () => {
    const c = buildSiteContext('site-1', 'example.com');
    assert.ok(Array.isArray(c.top_issue_types));
  });

  it('ranking_trend is one of improving/declining/stable', () => {
    const c = buildSiteContext('site-1', 'example.com');
    assert.ok(['improving', 'declining', 'stable'].includes(c.ranking_trend));
  });

  it('never throws with null inputs', () => {
    assert.doesNotThrow(() => buildSiteContext(null as never, null as never));
  });
});

// ── formatContextForPrompt ────────────────────────────────────────────────────

describe('formatContextForPrompt', () => {
  const ctx = buildSiteContext('site-1', 'cococabanalife.com', {
    health_score: 72,
    recent_fixes: 12,
    open_issues: 14,
    ranking_trend: 'improving',
    ai_visibility_score: 45,
  });

  it('contains domain', () => {
    const s = formatContextForPrompt(ctx);
    assert.ok(s.includes('cococabanalife.com'));
  });

  it('contains health score', () => {
    const s = formatContextForPrompt(ctx);
    assert.ok(s.includes('72/100'));
  });

  it('contains recent fixes count', () => {
    const s = formatContextForPrompt(ctx);
    assert.ok(s.includes('12'));
  });

  it('contains ranking trend', () => {
    const s = formatContextForPrompt(ctx);
    assert.ok(s.includes('improving'));
  });

  it('contains AI visibility score', () => {
    const s = formatContextForPrompt(ctx);
    assert.ok(s.includes('45/100'));
  });

  it('never throws with null input', () => {
    assert.doesNotThrow(() => formatContextForPrompt(null as never));
  });
});

// ── buildSystemPrompt ─────────────────────────────────────────────────────────

describe('buildSystemPrompt', () => {
  const ctx = buildSiteContext('site-1', 'cococabanalife.com');

  it('contains domain name', () => {
    const p = buildSystemPrompt(ctx);
    assert.ok(p.includes('cococabanalife.com'));
  });

  it('contains VAEO', () => {
    const p = buildSystemPrompt(ctx);
    assert.ok(p.includes('VAEO'));
  });

  it('contains actionable instruction', () => {
    const p = buildSystemPrompt(ctx);
    assert.ok(p.includes('actionable'));
  });

  it('contains health score from context', () => {
    const c = buildSiteContext('s', 'test.com', { health_score: 65 });
    const p = buildSystemPrompt(c);
    assert.ok(p.includes('65/100'));
  });

  it('never throws with null input', () => {
    assert.doesNotThrow(() => buildSystemPrompt(null as never));
  });
});
