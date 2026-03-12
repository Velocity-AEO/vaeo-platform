/**
 * tools/mcp/mcp_server.test.ts
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleMcpRequest,
  getMcpToolList,
  VAEO_MCP_TOOLS,
  _registerHandler,
  _resetHandlers,
  type McpRequest,
} from './mcp_server.ts';

// ── Setup ─────────────────────────────────────────────────────────────────────

const MOCK_DB = {};

// ── VAEO_MCP_TOOLS ────────────────────────────────────────────────────────────

describe('VAEO_MCP_TOOLS — registry', () => {
  it('contains exactly 5 tools', () => {
    assert.equal(VAEO_MCP_TOOLS.length, 5);
  });

  it('contains all expected tool names', () => {
    const names = VAEO_MCP_TOOLS.map((t) => t.name);
    assert.ok(names.includes('get_fix_confidence'));
    assert.ok(names.includes('get_site_learnings'));
    assert.ok(names.includes('get_pattern_performance'));
    assert.ok(names.includes('get_top_issues'));
    assert.ok(names.includes('get_health_trend'));
  });

  it('every tool has a non-empty description', () => {
    for (const tool of VAEO_MCP_TOOLS) {
      assert.ok(tool.description.length > 0, `${tool.name} has empty description`);
    }
  });

  it('every tool has an inputSchema object', () => {
    for (const tool of VAEO_MCP_TOOLS) {
      assert.ok(tool.inputSchema && typeof tool.inputSchema === 'object', `${tool.name} missing inputSchema`);
    }
  });

  it('get_fix_confidence requires site_id and issue_type', () => {
    const t = VAEO_MCP_TOOLS.find((x) => x.name === 'get_fix_confidence')!;
    const required = (t.inputSchema as { required?: string[] }).required ?? [];
    assert.ok(required.includes('site_id'));
    assert.ok(required.includes('issue_type'));
  });

  it('get_site_learnings has optional limit in schema', () => {
    const t = VAEO_MCP_TOOLS.find((x) => x.name === 'get_site_learnings')!;
    const props = (t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
    assert.ok('limit' in props);
    const required = (t.inputSchema as { required?: string[] }).required ?? [];
    assert.ok(!required.includes('limit'), 'limit should be optional');
  });

  it('get_health_trend has optional days in schema', () => {
    const t = VAEO_MCP_TOOLS.find((x) => x.name === 'get_health_trend')!;
    const required = (t.inputSchema as { required?: string[] }).required ?? [];
    assert.ok(!required.includes('days'), 'days should be optional');
  });
});

// ── getMcpToolList ────────────────────────────────────────────────────────────

describe('getMcpToolList', () => {
  it('returns an array of McpTool', async () => {
    const tools = await getMcpToolList();
    assert.ok(Array.isArray(tools));
    assert.ok(tools.length > 0);
  });

  it('is idempotent — returns same result on repeated calls', async () => {
    const a = await getMcpToolList();
    const b = await getMcpToolList();
    assert.equal(a.length, b.length);
    assert.deepStrictEqual(a.map((t) => t.name), b.map((t) => t.name));
  });
});

// ── handleMcpRequest ──────────────────────────────────────────────────────────

describe('handleMcpRequest — routing', () => {
  beforeEach(() => _resetHandlers());

  it('returns success=false for unknown tool', async () => {
    const r = await handleMcpRequest({ tool: 'no_such_tool', input: {} }, MOCK_DB);
    assert.ok(!r.success);
    assert.ok(r.error?.includes('Unknown tool'));
  });

  it('returns success=false for unwired (known but no handler registered) tool', async () => {
    const r = await handleMcpRequest({ tool: 'get_fix_confidence', input: { site_id: 's1', issue_type: 'title_missing' } }, MOCK_DB);
    assert.ok(!r.success);
    assert.ok(r.error?.includes('not yet wired'));
  });

  it('calls registered handler and returns data', async () => {
    _registerHandler('get_fix_confidence', async () => ({ confidence: 42 }));
    const r = await handleMcpRequest({ tool: 'get_fix_confidence', input: { site_id: 's1', issue_type: 'title_missing' } }, MOCK_DB);
    assert.ok(r.success);
    assert.deepStrictEqual(r.data, { confidence: 42 });
  });

  it('passes input to handler', async () => {
    let capturedInput: Record<string, unknown> = {};
    _registerHandler('get_top_issues', async (input) => { capturedInput = input; return []; });
    await handleMcpRequest({ tool: 'get_top_issues', input: { site_id: 's1', limit: 5 } }, MOCK_DB);
    assert.equal(capturedInput['site_id'], 's1');
    assert.equal(capturedInput['limit'], 5);
  });

  it('passes db to handler', async () => {
    const SPECIAL_DB = { marker: 'test-db' };
    let capturedDb: unknown;
    _registerHandler('get_health_trend', async (_i, db) => { capturedDb = db; return {}; });
    await handleMcpRequest({ tool: 'get_health_trend', input: { site_id: 's1' } }, SPECIAL_DB);
    assert.strictEqual(capturedDb, SPECIAL_DB);
  });

  it('returns success=false and error when handler throws', async () => {
    _registerHandler('get_fix_confidence', async () => { throw new Error('handler boom'); });
    const r = await handleMcpRequest({ tool: 'get_fix_confidence', input: { site_id: 's1', issue_type: 'title_missing' } }, MOCK_DB);
    assert.ok(!r.success);
    assert.ok(r.error?.includes('handler boom'));
  });

  it('never throws when request is missing tool', async () => {
    await assert.doesNotReject(() => handleMcpRequest({ tool: '', input: {} }, MOCK_DB));
    const r = await handleMcpRequest({ tool: '', input: {} }, MOCK_DB);
    assert.ok(!r.success);
  });

  it('never throws when input is null/undefined', async () => {
    _registerHandler('get_top_issues', async () => []);
    await assert.doesNotReject(() =>
      handleMcpRequest({ tool: 'get_top_issues', input: null as unknown as Record<string, unknown> }, MOCK_DB),
    );
  });

  it('response always has success field', async () => {
    const r = await handleMcpRequest({ tool: 'unknown', input: {} }, MOCK_DB);
    assert.ok('success' in r);
  });
});
