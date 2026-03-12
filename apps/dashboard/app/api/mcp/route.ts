/**
 * POST /api/mcp
 *   Handles a VAEO MCP tool call.
 *   Body: McpRequest { tool: string, input: Record<string, unknown> }
 *   Returns: McpResponse { success, data?, error? }
 *   No auth required (internal tool use only).
 *   Rate limit: 60 requests per minute per IP.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { handleMcpRequest, type McpRequest } from '../../../../../tools/mcp/mcp_server.js';
import { checkRateLimit, createInMemoryStore } from '../../../../../tools/security/rate_limiter.js';

// In-memory rate limiter (per-process; for multi-instance use Redis store)
const _store = createInMemoryStore();

export async function POST(request: NextRequest) {
  // Rate limit by IP
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown';
  const rl = await checkRateLimit(ip, { window_ms: 60_000, max_requests: 60, key_prefix: 'rl:mcp' }, _store);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded — 60 requests per minute' },
      { status: 429 },
    );
  }

  try {
    const body = await request.json() as McpRequest;

    if (!body?.tool) {
      return NextResponse.json({ success: false, error: 'tool is required' }, { status: 400 });
    }

    const db     = createServerClient();
    const result = await handleMcpRequest(body, db);

    const status = result.success ? 200 : 400;
    return NextResponse.json(result, { status });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
