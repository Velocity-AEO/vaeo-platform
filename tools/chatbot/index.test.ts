import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHATBOT_VERSION,
  CHATBOT_MODEL,
  buildMessage,
  buildSession,
  updateSession,
  buildSiteContext,
  formatContextForPrompt,
  buildSystemPrompt,
  runChatEngine,
  defaultChatConfig,
  buildQuickReplies,
} from './index.js';

describe('chatbot index barrel', () => {
  it('CHATBOT_VERSION is a semver string', () => {
    assert.match(CHATBOT_VERSION, /^\d+\.\d+\.\d+$/);
  });

  it('CHATBOT_MODEL is a string', () => {
    assert.equal(typeof CHATBOT_MODEL, 'string');
    assert.ok(CHATBOT_MODEL.length > 0);
  });

  it('CHATBOT_MODEL matches claude-sonnet-4', () => {
    assert.ok(CHATBOT_MODEL.includes('claude-sonnet'));
  });

  it('buildMessage is exported and callable', () => {
    const msg = buildMessage('sess1', 'site1', 'user', 'Hello');
    assert.ok(msg.message_id);
    assert.equal(msg.role, 'user');
    assert.equal(msg.content, 'Hello');
  });

  it('buildSession is exported and callable', () => {
    const sess = buildSession('site1');
    assert.ok(sess.session_id);
    assert.equal(sess.site_id, 'site1');
    assert.equal(sess.message_count, 0);
  });

  it('updateSession is exported and callable', () => {
    const sess = buildSession('site1');
    const msg = buildMessage(sess.session_id, 'site1', 'user', 'Hi');
    const updated = updateSession(sess, msg);
    assert.equal(updated.message_count, 1);
  });

  it('buildSiteContext is exported and callable', () => {
    const ctx = buildSiteContext('site1', 'test.com');
    assert.equal(ctx.site_id, 'site1');
    assert.equal(ctx.domain, 'test.com');
    assert.equal(typeof ctx.health_score, 'number');
  });

  it('formatContextForPrompt is exported and callable', () => {
    const ctx = buildSiteContext('site1', 'test.com');
    const str = formatContextForPrompt(ctx);
    assert.ok(str.includes('test.com'));
    assert.ok(str.includes('Health Score'));
  });

  it('buildSystemPrompt is exported and callable', () => {
    const ctx = buildSiteContext('site1', 'test.com');
    const prompt = buildSystemPrompt(ctx);
    assert.ok(prompt.includes('VAEO'));
    assert.ok(prompt.includes('test.com'));
  });

  it('runChatEngine is exported and callable', async () => {
    const ctx = buildSiteContext('site1', 'test.com');
    const msg = buildMessage('sess1', 'site1', 'user', 'Hello');
    const reply = await runChatEngine([msg], ctx, {
      callClaude: async () => 'mock reply',
    });
    assert.equal(reply, 'mock reply');
  });

  it('defaultChatConfig is exported and callable', () => {
    const config = defaultChatConfig('system prompt');
    assert.equal(config.system_prompt, 'system prompt');
    assert.equal(typeof config.max_tokens, 'number');
  });

  it('buildQuickReplies is exported and callable', () => {
    const ctx = buildSiteContext('site1', 'test.com');
    const replies = buildQuickReplies(ctx);
    assert.ok(Array.isArray(replies));
    assert.ok(replies.length > 0);
  });

  it('never throws on import with null context', () => {
    assert.doesNotThrow(() => {
      buildSiteContext(null as unknown as string, null as unknown as string);
    });
  });
});
