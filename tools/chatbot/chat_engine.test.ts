/**
 * tools/chatbot/chat_engine.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultChatConfig, runChatEngine, buildQuickReplies } from './chat_engine.ts';
import { buildSiteContext } from './context_builder.ts';
import { buildMessage, buildSession } from './message.ts';

// ── defaultChatConfig ─────────────────────────────────────────────────────────

describe('defaultChatConfig', () => {
  it('sets model to claude-sonnet-4-20250514', () => {
    const c = defaultChatConfig('system');
    assert.equal(c.model, 'claude-sonnet-4-20250514');
  });

  it('sets max_tokens to 500', () => {
    const c = defaultChatConfig('system');
    assert.equal(c.max_tokens, 500);
  });

  it('sets temperature to 0.7', () => {
    const c = defaultChatConfig('system');
    assert.equal(c.temperature, 0.7);
  });

  it('sets system_prompt', () => {
    const c = defaultChatConfig('my prompt');
    assert.equal(c.system_prompt, 'my prompt');
  });

  it('never throws with null input', () => {
    assert.doesNotThrow(() => defaultChatConfig(null as never));
  });
});

// ── runChatEngine ─────────────────────────────────────────────────────────────

describe('runChatEngine', () => {
  const context  = buildSiteContext('site-1', 'example.com');
  const session  = buildSession('site-1');
  const userMsg  = buildMessage(session.session_id, 'site-1', 'user', 'What should I fix first?');
  const messages = [userMsg];

  it('calls injectable callClaude dep', async () => {
    let called = false;
    await runChatEngine(messages, context, {
      callClaude: async () => { called = true; return 'Fix schema first.'; },
    });
    assert.equal(called, true);
  });

  it('returns string from injectable dep', async () => {
    const result = await runChatEngine(messages, context, {
      callClaude: async () => 'Fix schema first.',
    });
    assert.equal(result, 'Fix schema first.');
  });

  it('passes config and formatted messages to dep', async () => {
    let capturedConfig: unknown;
    let capturedMsgs: unknown;
    await runChatEngine(messages, context, {
      callClaude: async (config, msgs) => {
        capturedConfig = config;
        capturedMsgs = msgs;
        return 'ok';
      },
    });
    assert.ok((capturedConfig as { model: string }).model === 'claude-sonnet-4-20250514');
    assert.ok(Array.isArray(capturedMsgs));
  });

  it('filters out system messages before passing to Claude', async () => {
    const sysMsg  = buildMessage(session.session_id, 'site-1', 'system', 'sys');
    let capturedMsgs: Array<{ role: string }> = [];
    await runChatEngine([sysMsg, userMsg], context, {
      callClaude: async (_c, msgs) => { capturedMsgs = msgs; return 'ok'; },
    });
    assert.ok(capturedMsgs.every(m => m.role !== 'system'));
  });

  it('handles dep throwing — returns error message', async () => {
    const result = await runChatEngine(messages, context, {
      callClaude: async () => { throw new Error('API down'); },
    });
    assert.ok(result.includes('try again'));
  });

  it('error message contains try again', async () => {
    const result = await runChatEngine(messages, context, {
      callClaude: async () => { throw new Error('fail'); },
    });
    assert.ok(result.toLowerCase().includes('try again'));
  });

  it('works with empty messages array', async () => {
    const result = await runChatEngine([], context, {
      callClaude: async () => 'Empty is fine.',
    });
    assert.equal(result, 'Empty is fine.');
  });

  it('works with both user and assistant messages', async () => {
    const assistantMsg = buildMessage(session.session_id, 'site-1', 'assistant', 'Here is advice.');
    let capturedMsgs: Array<{ role: string }> = [];
    await runChatEngine([userMsg, assistantMsg], context, {
      callClaude: async (_c, msgs) => { capturedMsgs = msgs; return 'ok'; },
    });
    assert.equal(capturedMsgs.length, 2);
  });

  it('never throws on null inputs', async () => {
    await assert.doesNotReject(() =>
      runChatEngine(null as never, null as never),
    );
  });

  it('returns error string on null inputs (no dep)', async () => {
    const result = await runChatEngine(null as never, null as never, {
      callClaude: async () => { throw new Error('null'); },
    });
    assert.ok(typeof result === 'string');
  });
});

// ── buildQuickReplies ─────────────────────────────────────────────────────────

describe('buildQuickReplies', () => {
  it('always includes "What should I fix first?"', () => {
    const ctx = buildSiteContext('s', 'd');
    const qs  = buildQuickReplies(ctx);
    assert.ok(qs.includes('What should I fix first?'));
  });

  it('always includes "What has VAEO fixed recently?"', () => {
    const ctx = buildSiteContext('s', 'd');
    const qs  = buildQuickReplies(ctx);
    assert.ok(qs.includes('What has VAEO fixed recently?'));
  });

  it('includes low health score question when score < 60', () => {
    const ctx = buildSiteContext('s', 'd', { health_score: 45 });
    const qs  = buildQuickReplies(ctx);
    assert.ok(qs.includes('Why is my health score low?'));
  });

  it('does not include health score question when score >= 60', () => {
    const ctx = buildSiteContext('s', 'd', { health_score: 75 });
    const qs  = buildQuickReplies(ctx);
    assert.ok(!qs.includes('Why is my health score low?'));
  });

  it('includes rankings drop question when declining', () => {
    const ctx = buildSiteContext('s', 'd', { ranking_trend: 'declining' });
    const qs  = buildQuickReplies(ctx);
    assert.ok(qs.includes('Why are my rankings dropping?'));
  });

  it('does not include rankings drop question when improving', () => {
    const ctx = buildSiteContext('s', 'd', { ranking_trend: 'improving' });
    const qs  = buildQuickReplies(ctx);
    assert.ok(!qs.includes('Why are my rankings dropping?'));
  });

  it('includes big issues question when open_issues > 10', () => {
    const ctx = buildSiteContext('s', 'd', { open_issues: 15 });
    const qs  = buildQuickReplies(ctx);
    assert.ok(qs.includes('What are my biggest issues?'));
  });

  it('includes AI visibility question when ai_visibility_score < 40', () => {
    const ctx = buildSiteContext('s', 'd', { ai_visibility_score: 25 });
    const qs  = buildQuickReplies(ctx);
    assert.ok(qs.includes('How can I improve my AI visibility?'));
  });

  it('does not include AI visibility question when score >= 40', () => {
    const ctx = buildSiteContext('s', 'd', { ai_visibility_score: 60 });
    const qs  = buildQuickReplies(ctx);
    assert.ok(!qs.includes('How can I improve my AI visibility?'));
  });

  it('never throws with null input', () => {
    assert.doesNotThrow(() => buildQuickReplies(null as never));
  });
});
