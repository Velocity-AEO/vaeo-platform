/**
 * tools/fixes/schema_write_executor.ts
 *
 * Executes a real schema write for a fix action:
 *   1. Validates schema JSON is well-formed
 *   2. Routes to shopify or wordpress apply path
 *   3. Confirms write by re-fetching the page and checking for schema presence
 *   4. Rolls back automatically if confirmation fails
 *   5. Records result
 *
 * Never throws.
 */

import { validateSchemaOnPage } from './schema_confirm_validator.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SchemaWriteResult {
  success:            boolean;
  url:                string;
  schema_type:        string;
  bytes_written:      number;
  theme_file_updated: string;
  rolled_back:        boolean;
  error?:             string;
}

export type SchemaApplyFn = (
  site_id:     string,
  url:         string,
  schema_json: Record<string, unknown>,
  schema_type: string,
  platform:    'shopify' | 'wordpress',
) => Promise<{ ok: boolean; metafieldId?: string; theme_file?: string; error?: string }>;

export type SchemaValidateFn = (
  schema_json: Record<string, unknown>,
) => { valid: boolean; errors: string[] };

export type SchemaRollbackFn = (
  site_id:     string,
  url:         string,
  schema_type: string,
  platform:    'shopify' | 'wordpress',
) => Promise<{ ok: boolean; error?: string }>;

export type SchemaConfirmFn = (
  url:           string,
  expected_type: string,
) => Promise<{ confirmed: boolean; found_types: string[] }>;

export type SchemaRecordFn = (
  site_id:     string,
  action_id:   string,
  result:      SchemaWriteResult,
) => Promise<void>;

export interface SchemaWriteExecutorDeps {
  applyFn?:    SchemaApplyFn;
  validateFn?: SchemaValidateFn;
  rollbackFn?: SchemaRollbackFn;
  confirmFn?:  SchemaConfirmFn;
  recordFn?:   SchemaRecordFn;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const defaultApplyFn: SchemaApplyFn = async (
  _site_id,
  _url,
  _schema_json,
  _schema_type,
  _platform,
) => {
  // Real production path imports schema_writer dynamically to avoid
  // loading Shopify API keys in test environments.
  try {
    const { writeSchema } = await import('../schema/schema_writer.js');
    // In real path: caller must supply shopDomain, accessToken, resourceType, resourceId
    // This stub signals that the engine should use injected applyFn for real applies.
    void writeSchema;
    return { ok: false, error: 'applyFn must be injected with site credentials' };
  } catch {
    return { ok: false, error: 'applyFn must be injected with site credentials' };
  }
};

const defaultValidateFn: SchemaValidateFn = (schema_json) => {
  try {
    if (!schema_json || typeof schema_json !== 'object') {
      return { valid: false, errors: ['schema_json must be an object'] };
    }
    const ctx  = schema_json['@context'];
    const type = schema_json['@type'];
    const errors: string[] = [];
    if (!ctx)  errors.push('@context is required');
    if (!type) errors.push('@type is required');
    if (ctx && ctx !== 'https://schema.org') errors.push('@context must be "https://schema.org"');
    if (type && typeof type !== 'string' && !Array.isArray(type)) {
      errors.push('@type must be string or string[]');
    }
    return { valid: errors.length === 0, errors };
  } catch {
    return { valid: false, errors: ['validation threw'] };
  }
};

const defaultRollbackFn: SchemaRollbackFn = async () => {
  return { ok: false, error: 'rollbackFn must be injected for real rollbacks' };
};

const defaultConfirmFn: SchemaConfirmFn = async (url, expected_type) => {
  return validateSchemaOnPage(url, expected_type);
};

const defaultRecordFn: SchemaRecordFn = async () => {
  // No-op in default — callers inject a DB writer.
};

// ── executeSchemaWrite ────────────────────────────────────────────────────────

export async function executeSchemaWrite(
  site_id:     string,
  url:         string,
  schema_json: string,
  schema_type: string,
  platform:    'shopify' | 'wordpress',
  deps?:       SchemaWriteExecutorDeps,
): Promise<SchemaWriteResult> {
  const applyFn    = deps?.applyFn    ?? defaultApplyFn;
  const validateFn = deps?.validateFn ?? defaultValidateFn;
  const rollbackFn = deps?.rollbackFn ?? defaultRollbackFn;
  const confirmFn  = deps?.confirmFn  ?? defaultConfirmFn;
  const recordFn   = deps?.recordFn   ?? defaultRecordFn;

  const base: SchemaWriteResult = {
    success:            false,
    url:                url    ?? '',
    schema_type:        schema_type ?? '',
    bytes_written:      0,
    theme_file_updated: '',
    rolled_back:        false,
  };

  try {
    if (!site_id || !url || !schema_json) {
      const result: SchemaWriteResult = {
        ...base,
        error: 'site_id, url, and schema_json are required',
      };
      await recordFn(site_id ?? '', '', result).catch(() => {});
      return result;
    }

    // 1. Parse and validate schema JSON
    let parsedSchema: Record<string, unknown>;
    try {
      parsedSchema = JSON.parse(schema_json) as Record<string, unknown>;
    } catch {
      const result: SchemaWriteResult = {
        ...base,
        error: 'schema_json is not valid JSON',
      };
      await recordFn(site_id, '', result).catch(() => {});
      return result;
    }

    const validation = validateFn(parsedSchema);
    if (!validation.valid) {
      const result: SchemaWriteResult = {
        ...base,
        error: `Schema validation failed: ${validation.errors.join('; ')}`,
      };
      await recordFn(site_id, '', result).catch(() => {});
      return result;
    }

    // Resolve schema_type from parsed JSON if not provided
    const resolvedType = schema_type ||
      (typeof parsedSchema['@type'] === 'string'
        ? parsedSchema['@type']
        : (Array.isArray(parsedSchema['@type']) ? String(parsedSchema['@type'][0]) : 'unknown'));

    const bytesWritten = Buffer.byteLength(schema_json, 'utf8');

    // 2. Apply write
    const applyResult = await applyFn(site_id, url, parsedSchema, resolvedType, platform)
      .catch((err: unknown) => ({
        ok:    false as const,
        error: err instanceof Error ? err.message : String(err),
      }));

    if (!applyResult.ok) {
      const result: SchemaWriteResult = {
        ...base,
        schema_type:  resolvedType,
        bytes_written: bytesWritten,
        error: applyResult.error ?? 'Apply failed',
      };
      await recordFn(site_id, '', result).catch(() => {});
      return result;
    }

    const themeFile = applyResult.theme_file ?? 'metafield:velocity_seo/schema_json';

    // 3. Confirm write by re-fetching the page
    const confirmation = await confirmFn(url, resolvedType).catch(() => ({
      confirmed:   false,
      found_types: [] as string[],
    }));

    if (!confirmation.confirmed) {
      // 4. Rollback — confirmation failed
      const rollbackResult = await rollbackFn(site_id, url, resolvedType, platform)
        .catch(() => ({ ok: false as const, error: 'rollback threw' }));

      const result: SchemaWriteResult = {
        success:            false,
        url,
        schema_type:        resolvedType,
        bytes_written:      bytesWritten,
        theme_file_updated: themeFile,
        rolled_back:        true,
        error: rollbackResult.ok
          ? `Write confirmed failed — rolled back (found types: [${confirmation.found_types.join(', ')}])`
          : `Write confirmed failed — rollback also failed: ${rollbackResult.error}`,
      };
      await recordFn(site_id, '', result).catch(() => {});
      return result;
    }

    // 5. Success
    const result: SchemaWriteResult = {
      success:            true,
      url,
      schema_type:        resolvedType,
      bytes_written:      bytesWritten,
      theme_file_updated: themeFile,
      rolled_back:        false,
    };
    await recordFn(site_id, '', result).catch(() => {});
    return result;
  } catch (err) {
    const result: SchemaWriteResult = {
      ...base,
      error: err instanceof Error ? err.message : String(err),
    };
    try { await recordFn(site_id ?? '', '', result); } catch { /* non-fatal */ }
    return result;
  }
}
