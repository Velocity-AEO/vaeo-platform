/**
 * tools/schema/schema_validator.ts
 *
 * Validates JSON-LD objects before they are written to any live store.
 *
 * Wraps the existing block-level validator from packages/validators/src/schema.ts
 * and adds spec-specific checks:
 *   - @context must equal "https://schema.org" exactly
 *   - @type must be a string or string[]
 *   - Product:        offers.price + offers.priceCurrency must exist
 *   - BreadcrumbList: itemListElement array ≥1, each with @type ListItem, position (number), name (string)
 *   - Organization:   name, url
 *   - WebSite:        url, name
 *   - WebPage:        name, url
 *
 * Never throws — returns { valid, errors }.
 */

import { validateBlock } from '../../packages/validators/src/schema.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SchemaValidation {
  valid:  boolean;
  errors: string[];
}

// ── Spec-specific checks ──────────────────────────────────────────────────────

function checkProduct(schema: Record<string, unknown>, errors: string[]): void {
  const offers = schema['offers'] as Record<string, unknown> | undefined;
  if (!offers || typeof offers !== 'object') {
    errors.push('product:missing_offers');
    return;
  }
  if (offers['price'] == null)         errors.push('product:offers.price missing');
  if (!offers['priceCurrency'])        errors.push('product:offers.priceCurrency missing');
}

function checkBreadcrumbList(schema: Record<string, unknown>, errors: string[]): void {
  const items = schema['itemListElement'];
  if (!Array.isArray(items) || items.length === 0) {
    errors.push('breadcrumblist:itemListElement must be array with at least 1 item');
    return;
  }
  items.forEach((item: unknown, i: number) => {
    if (!item || typeof item !== 'object') {
      errors.push(`breadcrumblist:itemListElement[${i}] is not an object`);
      return;
    }
    const el = item as Record<string, unknown>;
    if (el['@type'] !== 'ListItem')       errors.push(`breadcrumblist:itemListElement[${i}].@type must be ListItem`);
    if (typeof el['position'] !== 'number') errors.push(`breadcrumblist:itemListElement[${i}].position must be a number`);
    if (typeof el['name'] !== 'string' || !el['name']) errors.push(`breadcrumblist:itemListElement[${i}].name must be a string`);
  });
}

function checkRequiredFields(
  schema:   Record<string, unknown>,
  fields:   string[],
  prefix:   string,
  errors:   string[],
): void {
  for (const f of fields) {
    if (schema[f] == null || schema[f] === '') {
      errors.push(`${prefix}:missing_${f}`);
    }
  }
}

// ── validateSchema ────────────────────────────────────────────────────────────

/**
 * Validate a JSON-LD object before writing to Shopify.
 * Never throws.
 */
export function validateSchema(schemaJson: Record<string, unknown>): SchemaValidation {
  const errors: string[] = [];

  try {
    // ── Step 1: run shared block validator ──────────────────────────────────
    const raw   = JSON.stringify(schemaJson);
    const block = validateBlock(raw);

    // Collect errors from block validator
    for (const e of block.errors) {
      errors.push(e);
    }

    // Short-circuit if JSON failed or @context/@type missing
    if (!block.valid_json || !block.has_context || !block.has_type) {
      return { valid: false, errors };
    }

    // ── Step 2: @context must equal "https://schema.org" exactly ────────────
    if (schemaJson['@context'] !== 'https://schema.org') {
      errors.push('@context must equal "https://schema.org"');
    }

    // ── Step 3: @type must be string or string[] ─────────────────────────────
    const typeVal = schemaJson['@type'];
    if (typeof typeVal !== 'string' && !(Array.isArray(typeVal) && typeVal.every((t) => typeof t === 'string'))) {
      errors.push('@type must be a string or string[]');
    }

    // ── Step 4: per-type spec checks ─────────────────────────────────────────
    const schemaType = block.schema_type;

    if (schemaType === 'Product') {
      checkProduct(schemaJson, errors);
    } else if (schemaType === 'BreadcrumbList') {
      checkBreadcrumbList(schemaJson, errors);
    } else if (schemaType === 'Article') {
      checkRequiredFields(schemaJson, ['headline', 'url', 'datePublished'], 'article', errors);
    } else if (schemaType === 'Organization') {
      checkRequiredFields(schemaJson, ['name', 'url'], 'organization', errors);
    } else if (schemaType === 'WebSite') {
      checkRequiredFields(schemaJson, ['url', 'name'], 'website', errors);
    } else if (schemaType === 'WebPage') {
      checkRequiredFields(schemaJson, ['name', 'url'], 'webpage', errors);
    }

  } catch {
    errors.push('validator:unexpected_error');
  }

  return { valid: errors.length === 0, errors };
}
