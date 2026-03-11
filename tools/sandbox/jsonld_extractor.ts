/**
 * tools/sandbox/jsonld_extractor.ts
 *
 * Extracts JSON-LD blocks from raw HTML.
 * Never throws — malformed JSON returns an error entry.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface JsonLdBlock {
  /** Parsed JSON-LD object, or null if parsing failed. */
  parsed: Record<string, unknown> | null;
  /** Raw string content from the <script> tag. */
  raw:    string;
  /** Error message if JSON parsing failed. */
  error?: string;
}

// ── Regex ────────────────────────────────────────────────────────────────────

/**
 * Matches <script type="application/ld+json">...</script>
 * Case-insensitive, supports attributes in any order, handles whitespace.
 */
const JSONLD_REGEX = /<script\s[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

// ── extractJsonLd ───────────────────────────────────────────────────────────

/**
 * Extract all JSON-LD blocks from an HTML string.
 *
 * - Returns an empty array if no blocks found.
 * - Malformed JSON produces a block with parsed=null and an error message.
 * - Never throws.
 */
export function extractJsonLd(html: string): JsonLdBlock[] {
  const blocks: JsonLdBlock[] = [];

  let match: RegExpExecArray | null;
  // Reset lastIndex since we reuse the global regex
  JSONLD_REGEX.lastIndex = 0;

  while ((match = JSONLD_REGEX.exec(html)) !== null) {
    const raw = (match[1] ?? '').trim();
    if (!raw) {
      blocks.push({ parsed: null, raw: '', error: 'Empty JSON-LD block' });
      continue;
    }

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        blocks.push({ parsed: parsed as Record<string, unknown>, raw });
      } else if (Array.isArray(parsed)) {
        // JSON-LD can be an array of objects — flatten into separate blocks
        for (const item of parsed) {
          if (typeof item === 'object' && item !== null) {
            blocks.push({ parsed: item as Record<string, unknown>, raw: JSON.stringify(item) });
          }
        }
      } else {
        blocks.push({ parsed: null, raw, error: 'JSON-LD is not an object or array' });
      }
    } catch (err) {
      blocks.push({
        parsed: null,
        raw,
        error:  `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return blocks;
}
