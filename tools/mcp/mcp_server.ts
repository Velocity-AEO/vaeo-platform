/**
 * tools/mcp/mcp_server.ts
 *
 * VAEO MCP server — routes incoming tool calls to the correct handler
 * and returns structured McpResponse objects.
 *
 * Tool list is static; handlers are injectable for testing.
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface McpTool {
  name:        string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpRequest {
  tool:  string;
  input: Record<string, unknown>;
}

export interface McpResponse {
  success: boolean;
  data?:   unknown;
  error?:  string;
}

// ── Tool registry ─────────────────────────────────────────────────────────────

export const VAEO_MCP_TOOLS: McpTool[] = [
  {
    name:        'get_fix_confidence',
    description: 'Get historical fix confidence score for an issue type on a site',
    inputSchema: {
      type:       'object',
      properties: {
        site_id:    { type: 'string', description: 'Site identifier' },
        issue_type: { type: 'string', description: 'Issue type to score confidence for' },
      },
      required: ['site_id', 'issue_type'],
    },
  },
  {
    name:        'get_site_learnings',
    description: 'Get all learnings for a site, optionally filtered by issue type',
    inputSchema: {
      type:       'object',
      properties: {
        site_id:    { type: 'string',  description: 'Site identifier' },
        issue_type: { type: 'string',  description: 'Optional issue type filter' },
        limit:      { type: 'number',  description: 'Max rows to return (default 20, max 100)' },
      },
      required: ['site_id'],
    },
  },
  {
    name:        'get_pattern_performance',
    description: 'Get aggregate pattern performance across all sites for an issue type',
    inputSchema: {
      type:       'object',
      properties: {
        issue_type:      { type: 'string', description: 'Issue type to aggregate' },
        min_confidence:  { type: 'number', description: 'Minimum success rate filter (0–100)' },
      },
      required: ['issue_type'],
    },
  },
  {
    name:        'get_top_issues',
    description: 'Get top unresolved issues for a site ranked by severity and frequency',
    inputSchema: {
      type:       'object',
      properties: {
        site_id: { type: 'string', description: 'Site identifier' },
        limit:   { type: 'number', description: 'Max issues to return (default 10)' },
      },
      required: ['site_id'],
    },
  },
  {
    name:        'get_health_trend',
    description: 'Get health score trend for a site over a specified number of days',
    inputSchema: {
      type:       'object',
      properties: {
        site_id: { type: 'string', description: 'Site identifier' },
        days:    { type: 'number', description: 'Lookback window in days (default 30)' },
      },
      required: ['site_id'],
    },
  },
];

// ── Tool name → handler map (populated by wiring in Step 2) ──────────────────

type HandlerFn = (input: Record<string, unknown>, db: unknown) => Promise<unknown>;

const _handlers = new Map<string, HandlerFn>();

/** Register a handler for a tool name (used in wiring + tests). */
export function _registerHandler(name: string, fn: HandlerFn): void {
  _handlers.set(name, fn);
}

/** Reset all handlers (test teardown). */
export function _resetHandlers(): void {
  _handlers.clear();
}

// ── handleMcpRequest ──────────────────────────────────────────────────────────

export async function handleMcpRequest(
  request: McpRequest,
  db:      unknown,
): Promise<McpResponse> {
  try {
    if (!request?.tool) {
      return { success: false, error: 'tool name is required' };
    }

    const knownTool = VAEO_MCP_TOOLS.find((t) => t.name === request.tool);
    if (!knownTool) {
      return { success: false, error: `Unknown tool: ${request.tool}` };
    }

    const handler = _handlers.get(request.tool);
    if (!handler) {
      return { success: false, error: `Tool not yet wired: ${request.tool}` };
    }

    const data = await handler(request.input ?? {}, db);
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error:   err instanceof Error ? err.message : String(err),
    };
  }
}

// ── getMcpToolList ────────────────────────────────────────────────────────────

export async function getMcpToolList(): Promise<McpTool[]> {
  return VAEO_MCP_TOOLS;
}
