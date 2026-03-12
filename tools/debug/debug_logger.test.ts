/**
 * tools/debug/debug_logger.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDebugSession,
  logDebugEvent,
  exportDebugSession,
  type DebugEvent,
  type DebugSession,
} from './debug_logger.ts';

// ── createDebugSession ────────────────────────────────────────────────────────

describe('createDebugSession', () => {
  it('returns a session with the given site_id', () => {
    const s = createDebugSession('site-abc');
    assert.equal(s.site_id, 'site-abc');
  });

  it('generates a non-empty session_id', () => {
    const s = createDebugSession('site-abc');
    assert.ok(s.session_id.length > 0);
  });

  it('generates unique session_ids for each call', () => {
    const a = createDebugSession('site-abc');
    const b = createDebugSession('site-abc');
    assert.notEqual(a.session_id, b.session_id);
  });

  it('starts with an empty events array', () => {
    const s = createDebugSession('site-abc');
    assert.equal(s.events.length, 0);
  });

  it('starts with fix_count = 0', () => {
    const s = createDebugSession('site-abc');
    assert.equal(s.fix_count, 0);
  });

  it('starts with failure_count = 0', () => {
    const s = createDebugSession('site-abc');
    assert.equal(s.failure_count, 0);
  });

  it('starts with learning_writes = 0', () => {
    const s = createDebugSession('site-abc');
    assert.equal(s.learning_writes, 0);
  });

  it('sets started_at to a valid ISO string', () => {
    const before = Date.now();
    const s = createDebugSession('site-abc');
    const after = Date.now();
    const ts = new Date(s.started_at).getTime();
    assert.ok(ts >= before && ts <= after);
  });
});

// ── logDebugEvent ─────────────────────────────────────────────────────────────

describe('logDebugEvent', () => {
  function makeSession(): DebugSession {
    return createDebugSession('site-001');
  }

  function baseEvent(overrides: Partial<Omit<DebugEvent, 'id' | 'timestamp' | 'session_id'>> = {}) {
    return {
      site_id:    'site-001',
      event_type: 'decision' as const,
      issue_type: 'title_missing',
      url:        'https://example.com/page',
      reasoning:  'Selected fix type: meta_title',
      ...overrides,
    };
  }

  it('returns a DebugEvent with id and timestamp set', () => {
    const s = makeSession();
    const e = logDebugEvent(s, baseEvent());
    assert.ok(e.id.length > 0);
    assert.ok(e.timestamp.length > 0);
  });

  it('injects session_id onto the event', () => {
    const s = makeSession();
    const e = logDebugEvent(s, baseEvent());
    assert.equal(e.session_id, s.session_id);
  });

  it('pushes the event into session.events', () => {
    const s = makeSession();
    logDebugEvent(s, baseEvent());
    assert.equal(s.events.length, 1);
  });

  it('increments fix_count for fix_applied events', () => {
    const s = makeSession();
    logDebugEvent(s, baseEvent({ event_type: 'fix_applied' }));
    assert.equal(s.fix_count, 1);
  });

  it('does NOT increment fix_count for non-fix_applied events', () => {
    const s = makeSession();
    logDebugEvent(s, baseEvent({ event_type: 'decision' }));
    assert.equal(s.fix_count, 0);
  });

  it('increments failure_count for fix_failed events', () => {
    const s = makeSession();
    logDebugEvent(s, baseEvent({ event_type: 'fix_failed' }));
    assert.equal(s.failure_count, 1);
  });

  it('increments learning_writes for learning_write events', () => {
    const s = makeSession();
    logDebugEvent(s, baseEvent({ event_type: 'learning_write' }));
    assert.equal(s.learning_writes, 1);
  });

  it('accumulates multiple events in order', () => {
    const s = makeSession();
    logDebugEvent(s, baseEvent({ event_type: 'decision' }));
    logDebugEvent(s, baseEvent({ event_type: 'fix_applied' }));
    logDebugEvent(s, baseEvent({ event_type: 'fix_failed' }));
    logDebugEvent(s, baseEvent({ event_type: 'learning_write' }));
    assert.equal(s.events.length, 4);
    assert.equal(s.fix_count, 1);
    assert.equal(s.failure_count, 1);
    assert.equal(s.learning_writes, 1);
  });

  it('preserves optional fields when provided', () => {
    const s = makeSession();
    const e = logDebugEvent(s, baseEvent({
      confidence_score: 0.85,
      health_delta:     5,
      duration_ms:      42,
    }));
    assert.equal(e.confidence_score, 0.85);
    assert.equal(e.health_delta, 5);
    assert.equal(e.duration_ms, 42);
  });

  it('never throws on malformed session input', () => {
    assert.doesNotThrow(() =>
      logDebugEvent(null as unknown as DebugSession, baseEvent()),
    );
  });
});

// ── exportDebugSession ────────────────────────────────────────────────────────

describe('exportDebugSession', () => {
  it('returns a valid JSON string', () => {
    const s = createDebugSession('site-abc');
    const json = exportDebugSession(s);
    assert.doesNotThrow(() => JSON.parse(json));
  });

  it('exported JSON contains session_id', () => {
    const s = createDebugSession('site-abc');
    const json = exportDebugSession(s);
    assert.ok(json.includes(s.session_id));
  });

  it('exported JSON contains events array', () => {
    const s = createDebugSession('site-abc');
    logDebugEvent(s, {
      site_id: 'site-abc', event_type: 'decision',
      issue_type: 'title_missing', url: 'https://example.com',
      reasoning: 'test',
    });
    const json = exportDebugSession(s);
    const parsed = JSON.parse(json) as DebugSession;
    assert.equal(parsed.events.length, 1);
  });

  it('never throws on null input', () => {
    assert.doesNotThrow(() => exportDebugSession(null as unknown as DebugSession));
  });

  it('returns pretty-printed JSON (2-space indent)', () => {
    const s = createDebugSession('site-abc');
    const json = exportDebugSession(s);
    assert.ok(json.includes('\n  '));
  });
});
