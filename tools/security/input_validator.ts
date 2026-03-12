/**
 * tools/security/input_validator.ts
 *
 * Field-level input validation and sanitization.
 * Never throws. Returns all errors, not just the first.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ValidationRule {
  type:         'string' | 'uuid' | 'url' | 'email' | 'domain' | 'number' | 'boolean' | 'array';
  required?:    boolean;
  min_length?:  number;
  max_length?:  number;
  min?:         number;
  max?:         number;
  pattern?:     RegExp;
  sanitize?:    boolean;
}

export type ValidationSchema = Record<string, ValidationRule>;

export interface ValidationResult {
  valid:     boolean;
  errors:    Record<string, string>;
  sanitized: Record<string, unknown>;
}

// ── Patterns ──────────────────────────────────────────────────────────────────

const UUID_RE    = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN_RE  = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const EMAIL_RE   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Sanitize ──────────────────────────────────────────────────────────────────

function sanitizeString(val: string): string {
  return val
    .replace(/\0/g, '')                       // null bytes
    .replace(/<[^>]*>/g, '')                  // HTML tags
    .trim();
}

// ── validateInput ─────────────────────────────────────────────────────────────

export function validateInput(
  input:  Record<string, unknown>,
  schema: ValidationSchema,
): ValidationResult {
  const errors:    Record<string, string>  = {};
  const sanitized: Record<string, unknown> = {};

  try {
    for (const [field, rule] of Object.entries(schema)) {
      const raw = input[field];

      // Required check
      if (raw === undefined || raw === null || raw === '') {
        if (rule.required) {
          errors[field] = `${field} is required`;
        }
        continue;
      }

      // Type-specific validation
      switch (rule.type) {
        case 'string': {
          if (typeof raw !== 'string') { errors[field] = `${field} must be a string`; break; }
          const val = rule.sanitize ? sanitizeString(raw) : raw;
          if (rule.min_length !== undefined && val.length < rule.min_length) {
            errors[field] = `${field} must be at least ${rule.min_length} characters`; break;
          }
          if (rule.max_length !== undefined && val.length > rule.max_length) {
            errors[field] = `${field} must be at most ${rule.max_length} characters`; break;
          }
          if (rule.pattern && !rule.pattern.test(val)) {
            errors[field] = `${field} format is invalid`; break;
          }
          sanitized[field] = val;
          break;
        }

        case 'uuid': {
          if (typeof raw !== 'string' || !UUID_RE.test(raw)) {
            errors[field] = `${field} must be a valid UUID`; break;
          }
          sanitized[field] = raw.toLowerCase();
          break;
        }

        case 'url': {
          if (typeof raw !== 'string') { errors[field] = `${field} must be a string`; break; }
          try {
            const u = new URL(raw);
            if (u.protocol !== 'http:' && u.protocol !== 'https:') {
              errors[field] = `${field} must be an http or https URL`; break;
            }
            sanitized[field] = raw;
          } catch {
            errors[field] = `${field} must be a valid URL`;
          }
          break;
        }

        case 'email': {
          if (typeof raw !== 'string' || !EMAIL_RE.test(raw)) {
            errors[field] = `${field} must be a valid email address`; break;
          }
          sanitized[field] = raw.toLowerCase().trim();
          break;
        }

        case 'domain': {
          if (typeof raw !== 'string' || !DOMAIN_RE.test(raw)) {
            errors[field] = `${field} must be a valid domain (no protocol or path)`; break;
          }
          sanitized[field] = raw.toLowerCase();
          break;
        }

        case 'number': {
          const n = typeof raw === 'number' ? raw : Number(raw);
          if (isNaN(n)) { errors[field] = `${field} must be a number`; break; }
          if (rule.min !== undefined && n < rule.min) {
            errors[field] = `${field} must be at least ${rule.min}`; break;
          }
          if (rule.max !== undefined && n > rule.max) {
            errors[field] = `${field} must be at most ${rule.max}`; break;
          }
          sanitized[field] = n;
          break;
        }

        case 'boolean': {
          if (typeof raw !== 'boolean') { errors[field] = `${field} must be a boolean`; break; }
          sanitized[field] = raw;
          break;
        }

        case 'array': {
          if (!Array.isArray(raw)) { errors[field] = `${field} must be an array`; break; }
          if (rule.min !== undefined && raw.length < rule.min) {
            errors[field] = `${field} must have at least ${rule.min} items`; break;
          }
          if (rule.max !== undefined && raw.length > rule.max) {
            errors[field] = `${field} must have at most ${rule.max} items`; break;
          }
          sanitized[field] = raw;
          break;
        }
      }
    }

    // Pass through fields not in schema (unvalidated)
    for (const [k, v] of Object.entries(input)) {
      if (!(k in schema) && !(k in sanitized)) {
        sanitized[k] = v;
      }
    }
  } catch {
    // Non-fatal
  }

  return { valid: Object.keys(errors).length === 0, errors, sanitized };
}

// ── COMMON_SCHEMAS ────────────────────────────────────────────────────────────

export const COMMON_SCHEMAS: Record<string, ValidationSchema> = {
  SITE_REGISTRATION: {
    shop_domain: { type: 'domain', required: true, max_length: 253 },
    tenant_id:   { type: 'uuid',   required: true },
  },

  CRAWL_REQUEST: {
    site_id:  { type: 'uuid',   required: true },
    max_urls: { type: 'number', required: false, min: 1, max: 10_000 },
  },

  FIX_APPROVAL: {
    site_id: { type: 'uuid',   required: true },
    fix_id:  { type: 'uuid',   required: true },
    action:  { type: 'string', required: true, pattern: /^(approve|reject)$/ },
  },

  API_KEY: {
    key: {
      type:       'string',
      required:   true,
      min_length: 32,
      max_length: 128,
      pattern:    /^[A-Za-z0-9_\-]+$/,
    },
  },
};
