/**
 * GET /api/mcp/tools
 *   Returns the list of available MCP tools.
 *   Returns: { tools: McpTool[] }
 *   No auth required.
 */

import { NextResponse } from 'next/server';
import { getMcpToolList } from '@tools/mcp/mcp_server.js';

export async function GET() {
  const tools = await getMcpToolList();
  return NextResponse.json({ tools });
}
