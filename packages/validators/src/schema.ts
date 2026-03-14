/**
 * packages/validators/src/schema.ts
 *
 * Schema.org JSON-LD validator for Velocity AEO.
 *
 * Validates structured data blocks locally — no external API, no rate limits.
 * Runs before schema is injected into a live page so invalid markup never ships.
 *
 * Validation pipeline (per block, in order):
 *   1. JSON.parse() — invalid JSON short-circuits remaining checks.
 *   2. @context + @type presence.
 *   3. Per-type required field check (REQUIRED_FIELDS map).
 *   4. Duplicate @type detection across all blocks in the request.
 *
 * Pass condition: ALL blocks have valid_json=true AND no block has errors[].
 * Warnings (unknown type, duplicate type) do not affect passed status.
 *
 * Never throws — always returns SchemaResult.
 */

import { createLogger } from '../../action-log/src/index.js';

// ── Public types ──────────────────────────────────────────────────────────────

export interface SchemaRequest {
  run_id:        string;
  tenant_id:     string;
  site_id:       string;
  url:           string;
  /** Array of raw JSON-LD strings to validate. */
  schema_blocks: string[];
}

export interface ValidatedBlock {
  /** The @type value, or 'unknown' if unparseable / missing. */
  schema_type:    string;
  /** True when JSON.parse() succeeded. */
  valid_json:     boolean;
  /** True when @context field is present. */
  has_context:    boolean;
  /** True when @type field is present. */
  has_type:       boolean;
  /** Required fields for this @type that are absent. */
  missing_fields: string[];
  /** All validation errors for this block (errors block; warnings do not). */
  errors:         string[];
  /** All validation warnings (informational only, do not affect passed). */
  warnings:       string[];
  /** Original input string. */
  raw:            string;
}

export interface SchemaResult {
  url:              string;
  /** True only when ALL blocks have valid_json=true and no block has errors[]. */
  passed:           boolean;
  validated_blocks: ValidatedBlock[];
  error_count:      number;
  run_id:           string;
  tenant_id:        string;
}

// ── Required fields map ───────────────────────────────────────────────────────

/**
 * Required fields per schema @type.
 * Any @type not listed is treated as unknown — passes with a warning.
 */
export const REQUIRED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  Organization:   ['name', 'url'],
  WebSite:        ['name', 'url'],
  Product:        ['name', 'offers'],
  Article:        ['headline', 'datePublished'],
  BreadcrumbList: ['itemListElement'],
  FAQPage:        ['mainEntity'],
  Person:         ['name'],
  LocalBusiness:  ['name', 'address'],
} as const;

// ── Block validator ───────────────────────────────────────────────────────────

/**
 * Validates a single JSON-LD string through all checks except duplicate
 * detection (which requires all blocks to be parsed first).
 */
export function validateBlock(raw: string): ValidatedBlock {
  const block: ValidatedBlock = {
    schema_type:    'unknown',
    valid_json:     false,
    has_context:    false,
    has_type:       false,
    missing_fields: [],
    errors:         [],
    warnings:       [],
    raw,
  };

  // ── Step 1: JSON parse ───────────────────────────────────────────────────
  let parsed: Record<string, unknown>;
  try {
    const value = JSON.parse(raw);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      block.errors.push('invalid_json:root_must_be_object');
      return block;
    }
    parsed       = value as Record<string, unknown>;
    block.valid_json = true;
  } catch {
    block.errors.push('invalid_json');
    return block;
  }

  // ── Step 2: @context + @type presence ────────────────────────────────────
  block.has_context = '@context' in parsed && parsed['@context'] != null;
  block.has_type    = '@type'    in parsed && typeof parsed['@type'] === 'string';

  if (!block.has_context) block.errors.push('missing_@context');
  if (!block.has_type)    block.errors.push('missing_@type');

  // Extract schema_type for step 3 (even if missing — use 'unknown')
  const schemaType = block.has_type
    ? (parsed['@type'] as string)
    : 'unknown';
  block.schema_type = schemaType;

  // Short-circuit: no point checking required fields if @type is absent
  if (!block.has_type) return block;

  // ── Step 3: Per-type required fields ─────────────────────────────────────
  const required = REQUIRED_FIELDS[schemaType];
  if (required === undefined) {
    // Unknown type — informational warning only, not an error
    block.warnings.push('unknown_type_not_validated');
  } else {
    for (const field of required) {
      if (!(field in parsed) || parsed[field] == null) {
        block.missing_fields.push(field);
        block.errors.push(`missing_required_field:${field}`);
      }
    }
  }

  return block;
}

// ── Duplicate @type detection ─────────────────────────────────────────────────

/**
 * Mutates each block to add a warning when its @type appears in more than
 * one block. Warnings — not errors — so duplicates don't set passed=false.
 */
export function applyDuplicateTypeWarnings(blocks: ValidatedBlock[]): void {
  const typeCounts = new Map<string, number>();

  for (const b of blocks) {
    if (b.schema_type !== 'unknown') {
      typeCounts.set(b.schema_type, (typeCounts.get(b.schema_type) ?? 0) + 1);
    }
  }

  for (const b of blocks) {
    const count = typeCounts.get(b.schema_type) ?? 0;
    if (count > 1) {
      b.warnings.push(`duplicate_schema_type_${b.schema_type}`);
    }
  }
}

// ── runSchemaValidator ────────────────────────────────────────────────────────

/**
 * Validates an array of JSON-LD strings for a single page.
 *
 * Flow:
 *   1. Validate each block individually (JSON parse → field checks).
 *   2. Apply cross-block duplicate @type warnings.
 *   3. Determine overall passed status.
 *   4. Write ActionLog entries.
 *
 * Never throws.
 */
export async function runSchemaValidator(
  request: SchemaRequest,
): Promise<SchemaResult> {
  const log = createLogger({
    run_id:    request.run_id,
    tenant_id: request.tenant_id,
    site_id:   request.site_id,
    cms:       'shopify', // validators are CMS-agnostic
    command:   'schema-validator',
    url:       request.url,
  });

  log({
    command:  'schema-validator',
    stage:    'schema-validator:start',
    status:   'pending',
    metadata: { block_count: request.schema_blocks.length },
  });

  // ── Validate each block ───────────────────────────────────────────────────
  const validatedBlocks = request.schema_blocks.map(validateBlock);

  // ── Cross-block: duplicate @type warnings ────────────────────────────────
  applyDuplicateTypeWarnings(validatedBlocks);

  // ── Aggregate results ────────────────────────────────────────────────────
  const errorCount = validatedBlocks.reduce((n, b) => n + b.errors.length, 0);
  const passed     = validatedBlocks.every((b) => b.valid_json && b.errors.length === 0);

  const result: SchemaResult = {
    url:              request.url,
    passed,
    validated_blocks: validatedBlocks,
    error_count:      errorCount,
    run_id:           request.run_id,
    tenant_id:        request.tenant_id,
  };

  log({
    command:  'schema-validator',
    stage:    'schema-validator:complete',
    status:   passed ? 'ok' : 'failed',
    metadata: {
      passed,
      block_count:  validatedBlocks.length,
      error_count:  errorCount,
      failed_types: validatedBlocks
        .filter((b) => b.errors.length > 0)
        .map((b) => b.schema_type),
    },
  });

  if (!passed) {
    const failedTypes = validatedBlocks
      .filter((b) => b.errors.length > 0)
      .map((b) => ({ type: b.schema_type, errors: b.errors }));

    log({
      command:  'schema-validator',
      stage:    'schema-validator:blocked',
      status:   'failed',
      metadata: { failed_blocks: failedTypes },
    });
  }

  return result;
}
