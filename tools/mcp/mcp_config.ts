/**
 * tools/mcp/mcp_config.ts
 *
 * Static configuration for the VAEO MCP server.
 * Consumed by MCP clients (e.g. Claude) to discover endpoints.
 */

export const MCP_SERVER_CONFIG = {
  name:            'vaeo-mcp',
  version:         '1.0.0',
  description:     'VAEO platform intelligence server — provides SEO fix confidence, learnings, and pattern data to Claude at decision time',
  base_url:        process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://dashboard-nine-omega-59.vercel.app',
  tools_endpoint:  '/api/mcp/tools',
  call_endpoint:   '/api/mcp',
  auth:            'none',
} as const;

export function getMcpServerUrl(): string {
  return MCP_SERVER_CONFIG.base_url + MCP_SERVER_CONFIG.call_endpoint;
}
