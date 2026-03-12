/**
 * tools/mcp/mcp_config.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MCP_SERVER_CONFIG, getMcpServerUrl } from './mcp_config.ts';

describe('MCP_SERVER_CONFIG', () => {
  it('has name vaeo-mcp', () => {
    assert.equal(MCP_SERVER_CONFIG.name, 'vaeo-mcp');
  });

  it('has version 1.0.0', () => {
    assert.equal(MCP_SERVER_CONFIG.version, '1.0.0');
  });

  it('tools_endpoint is /api/mcp/tools', () => {
    assert.equal(MCP_SERVER_CONFIG.tools_endpoint, '/api/mcp/tools');
  });

  it('call_endpoint is /api/mcp', () => {
    assert.equal(MCP_SERVER_CONFIG.call_endpoint, '/api/mcp');
  });

  it('auth is none', () => {
    assert.equal(MCP_SERVER_CONFIG.auth, 'none');
  });

  it('description is non-empty', () => {
    assert.ok(MCP_SERVER_CONFIG.description.length > 0);
  });

  it('base_url is a non-empty string', () => {
    assert.ok(typeof MCP_SERVER_CONFIG.base_url === 'string');
    assert.ok(MCP_SERVER_CONFIG.base_url.length > 0);
  });
});

describe('getMcpServerUrl', () => {
  it('returns a string ending with /api/mcp', () => {
    const url = getMcpServerUrl();
    assert.ok(url.endsWith('/api/mcp'), `Expected URL to end with /api/mcp, got: ${url}`);
  });

  it('includes the base_url', () => {
    const url = getMcpServerUrl();
    assert.ok(url.includes(MCP_SERVER_CONFIG.base_url), `URL should include base_url`);
  });
});
