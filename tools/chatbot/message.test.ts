/**
 * tools/chatbot/message.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMessage, buildSession, updateSession } from './message.ts';

// ── buildMessage ──────────────────────────────────────────────────────────────

describe('buildMessage', () => {
  it('sets session_id', () => {
    const m = buildMessage('sess-1', 'site-1', 'user', 'hello');
    assert.equal(m.session_id, 'sess-1');
  });

  it('sets site_id', () => {
    const m = buildMessage('sess-1', 'site-1', 'user', 'hello');
    assert.equal(m.site_id, 'site-1');
  });

  it('sets role correctly', () => {
    const m = buildMessage('s', 's', 'assistant', 'hi');
    assert.equal(m.role, 'assistant');
  });

  it('sets system role', () => {
    const m = buildMessage('s', 's', 'system', 'you are an assistant');
    assert.equal(m.role, 'system');
  });

  it('sets content', () => {
    const m = buildMessage('s', 's', 'user', 'my question');
    assert.equal(m.content, 'my question');
  });

  it('message_id is a non-empty string', () => {
    const m = buildMessage('s', 's', 'user', 'q');
    assert.ok(typeof m.message_id === 'string' && m.message_id.length > 0);
  });

  it('created_at is ISO string', () => {
    const m = buildMessage('s', 's', 'user', 'q');
    assert.ok(!isNaN(Date.parse(m.created_at)));
  });

  it('metadata is undefined when not provided', () => {
    const m = buildMessage('s', 's', 'user', 'q');
    assert.equal(m.metadata, undefined);
  });

  it('metadata is set when provided', () => {
    const m = buildMessage('s', 's', 'user', 'q', { key: 'value' });
    assert.deepEqual(m.metadata, { key: 'value' });
  });

  it('never throws with null inputs', () => {
    assert.doesNotThrow(() => buildMessage(null as never, null as never, null as never, null as never));
  });
});

// ── buildSession ──────────────────────────────────────────────────────────────

describe('buildSession', () => {
  it('sets site_id', () => {
    const s = buildSession('site-1');
    assert.equal(s.site_id, 'site-1');
  });

  it('session_id is a non-empty string', () => {
    const s = buildSession('site-1');
    assert.ok(typeof s.session_id === 'string' && s.session_id.length > 0);
  });

  it('starts with message_count of 0', () => {
    const s = buildSession('site-1');
    assert.equal(s.message_count, 0);
  });

  it('started_at is ISO string', () => {
    const s = buildSession('site-1');
    assert.ok(!isNaN(Date.parse(s.started_at)));
  });

  it('last_active is ISO string', () => {
    const s = buildSession('site-1');
    assert.ok(!isNaN(Date.parse(s.last_active)));
  });

  it('context_summary is undefined initially', () => {
    const s = buildSession('site-1');
    assert.equal(s.context_summary, undefined);
  });

  it('never throws with null input', () => {
    assert.doesNotThrow(() => buildSession(null as never));
  });
});

// ── updateSession ─────────────────────────────────────────────────────────────

describe('updateSession', () => {
  it('increments message_count by 1', () => {
    const session = buildSession('site-1');
    const msg     = buildMessage(session.session_id, 'site-1', 'user', 'hi');
    const updated = updateSession(session, msg);
    assert.equal(updated.message_count, 1);
  });

  it('increments message_count from 5 to 6', () => {
    const session = { ...buildSession('site-1'), message_count: 5 };
    const msg     = buildMessage(session.session_id, 'site-1', 'user', 'hi');
    const updated = updateSession(session, msg);
    assert.equal(updated.message_count, 6);
  });

  it('updates last_active to message created_at', () => {
    const session = buildSession('site-1');
    const msg     = buildMessage(session.session_id, 'site-1', 'user', 'hi');
    const updated = updateSession(session, msg);
    assert.equal(updated.last_active, msg.created_at);
  });

  it('preserves other session fields', () => {
    const session = buildSession('site-1');
    const msg     = buildMessage(session.session_id, 'site-1', 'user', 'hi');
    const updated = updateSession(session, msg);
    assert.equal(updated.session_id, session.session_id);
    assert.equal(updated.site_id, session.site_id);
  });

  it('never throws with null inputs', () => {
    assert.doesNotThrow(() => updateSession(null as never, null as never));
  });
});
