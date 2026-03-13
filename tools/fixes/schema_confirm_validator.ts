/**
 * tools/fixes/schema_confirm_validator.ts
 *
 * After a schema write, re-fetches the live page and confirms the expected
 * schema @type is present in a <script type="application/ld+json"> block.
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SchemaConfirmResult {
  confirmed:   boolean;
  found_types: string[];
  error?:      string;
}

export interface SchemaConfirmDeps {
  fetchFn?: (url: string, init?: RequestInit) => Promise<{ ok: boolean; text: () => Promise<string> }>;
}

// ── extractSchemaTypes ────────────────────────────────────────────────────────

/**
 * Parse all <script type="application/ld+json"> blocks from HTML and return
 * the @type values found across all blocks (strings and arrays both expanded).
 * Never throws.
 */
export function extractSchemaTypes(html: string): string[] {
  try {
    if (!html) return [];
    const types: string[] = [];
    const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(match[1]?.trim() ?? '{}') as Record<string, unknown>;
        const t = parsed['@type'];
        if (typeof t === 'string') {
          types.push(t);
        } else if (Array.isArray(t)) {
          for (const v of t) {
            if (typeof v === 'string') types.push(v);
          }
        }
        // Also handle @graph array
        const graph = parsed['@graph'];
        if (Array.isArray(graph)) {
          for (const node of graph) {
            const nt = (node as Record<string, unknown>)['@type'];
            if (typeof nt === 'string') types.push(nt);
            else if (Array.isArray(nt)) {
              for (const v of nt) {
                if (typeof v === 'string') types.push(v);
              }
            }
          }
        }
      } catch { /* malformed block — skip */ }
    }
    return types;
  } catch {
    return [];
  }
}

// ── validateSchemaOnPage ──────────────────────────────────────────────────────

export async function validateSchemaOnPage(
  url:           string,
  expected_type: string,
  deps?:         SchemaConfirmDeps,
): Promise<SchemaConfirmResult> {
  try {
    if (!url || !expected_type) {
      return { confirmed: false, found_types: [], error: 'url and expected_type are required' };
    }

    const fetchFn = deps?.fetchFn ?? fetch;

    const res = await fetchFn(url, {
      method:  'GET',
      headers: { 'User-Agent': 'vaeo-schema-confirm/1.0' },
      // @ts-ignore — signal not in all fetch types
      signal:  AbortSignal.timeout?.(15_000),
    }).catch((err: unknown) => ({
      ok:   false as const,
      text: async () => '',
      _err: err instanceof Error ? err.message : String(err),
    }));

    if (!res.ok) {
      return {
        confirmed:   false,
        found_types: [],
        error: `Page fetch returned non-OK for ${url}`,
      };
    }

    const html       = await res.text().catch(() => '');
    const foundTypes = extractSchemaTypes(html);

    // Normalize: allow "Product" to match "product" etc.
    const expectedLow = expected_type.toLowerCase();
    const confirmed   = foundTypes.some((t) => t.toLowerCase() === expectedLow);

    return { confirmed, found_types: foundTypes };
  } catch (err) {
    return {
      confirmed:   false,
      found_types: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
