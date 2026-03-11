/**
 * tools/sandbox/sandbox_verify.ts
 *
 * Sandbox verification orchestrator.
 * Fetches a URL, extracts JSON-LD, selects the best schema block,
 * and returns a structured VerifyResult.
 *
 * Schema selection priority: Product → Collection → Article → WebPage → first block found.
 *
 * Never throws — errors are captured in the result.
 */

import { fetchHtml, FetchError } from './html_fetcher.js';
import { extractJsonLd, type JsonLdBlock } from './jsonld_extractor.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type VerifyStatus = 'PASS' | 'FAIL' | 'NO_SCHEMA';

export interface VerifyResult {
  url:         string;
  fetchedAt:   string;
  schemaFound: boolean;
  schemaType:  string | null;
  valid:       boolean;
  errors:      string[];
  rawSchema:   string | null;
  status:      VerifyStatus;
}

// ── Injectable deps ─────────────────────────────────────────────────────────

export interface SandboxVerifyDeps {
  fetchHtml:     (url: string) => Promise<string>;
  extractJsonLd: (html: string) => JsonLdBlock[];
}

function defaultDeps(): SandboxVerifyDeps {
  return { fetchHtml, extractJsonLd };
}

// ── Schema selection ────────────────────────────────────────────────────────

/** Priority order for schema type selection. */
const TYPE_PRIORITY = ['Product', 'Collection', 'Article', 'WebPage'];

function selectBestBlock(blocks: JsonLdBlock[]): JsonLdBlock | null {
  const validBlocks = blocks.filter((b) => b.parsed !== null);
  if (validBlocks.length === 0) return null;

  for (const targetType of TYPE_PRIORITY) {
    const match = validBlocks.find((b) => b.parsed!['@type'] === targetType);
    if (match) return match;
  }

  // Fallback: first valid block
  return validBlocks[0];
}

// ── Validation ──────────────────────────────────────────────────────────────

function validateSchema(block: JsonLdBlock): string[] {
  const errors: string[] = [];
  const schema = block.parsed;
  if (!schema) {
    errors.push('Schema could not be parsed');
    return errors;
  }

  if (!schema['@type']) {
    errors.push('Missing @type');
  }

  if (!schema['@context']) {
    errors.push('Missing @context');
  } else if (
    schema['@context'] !== 'https://schema.org' &&
    schema['@context'] !== 'http://schema.org' &&
    schema['@context'] !== 'https://schema.org/'
  ) {
    errors.push(`Unexpected @context: ${String(schema['@context'])}`);
  }

  const schemaType = schema['@type'] as string | undefined;

  if (schemaType === 'Product') {
    if (!schema['name']) errors.push('Product: missing name');
  }

  if (schemaType === 'Article') {
    if (!schema['headline'] && !schema['name']) errors.push('Article: missing headline or name');
  }

  return errors;
}

// ── sandboxVerify ───────────────────────────────────────────────────────────

/**
 * Verify JSON-LD schema on a live URL.
 *
 * 1. Fetch HTML
 * 2. Extract JSON-LD blocks
 * 3. Select best block by type priority
 * 4. Validate schema
 * 5. Return structured result
 */
export async function sandboxVerify(
  url:       string,
  _testDeps?: Partial<SandboxVerifyDeps>,
): Promise<VerifyResult> {
  const deps = { ...defaultDeps(), ..._testDeps };
  const fetchedAt = new Date().toISOString();

  // 1. Fetch
  let html: string;
  try {
    html = await deps.fetchHtml(url);
  } catch (err) {
    const msg = err instanceof FetchError
      ? `Fetch failed (${err.statusCode}): ${err.message}`
      : (err instanceof Error ? err.message : String(err));
    return {
      url,
      fetchedAt,
      schemaFound: false,
      schemaType:  null,
      valid:       false,
      errors:      [msg],
      rawSchema:   null,
      status:      'FAIL',
    };
  }

  // 2. Extract
  const blocks = deps.extractJsonLd(html);

  // 3. Select
  const best = selectBestBlock(blocks);

  if (!best) {
    // Check if there were blocks but all had parse errors
    const parseErrors = blocks.filter((b) => b.error).map((b) => b.error!);
    return {
      url,
      fetchedAt,
      schemaFound: blocks.length > 0,
      schemaType:  null,
      valid:       false,
      errors:      parseErrors.length > 0 ? parseErrors : ['No JSON-LD schema found'],
      rawSchema:   blocks.length > 0 ? blocks[0].raw : null,
      status:      'NO_SCHEMA',
    };
  }

  // 4. Validate
  const schemaType = (best.parsed?.['@type'] as string) ?? null;
  const errors = validateSchema(best);
  const valid = errors.length === 0;

  return {
    url,
    fetchedAt,
    schemaFound: true,
    schemaType,
    valid,
    errors,
    rawSchema:   best.raw,
    status:      valid ? 'PASS' : 'FAIL',
  };
}
