/**
 * tools/security/api_security.ts
 *
 * Composable security middleware for API routes.
 * Applies rate limiting, input validation, and audit logging
 * in a single injectable, never-throwing call.
 */

import { checkRateLimit, DEFAULT_RATE_LIMITS, type RateLimitConfig, type RateLimitStore } from './rate_limiter.js';
import { validateInput, type ValidationSchema } from './input_validator.js';
import { logAuditEvent, AuditAction } from './audit_log.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SecurityConfig {
  rate_limit?:           RateLimitConfig;
  require_auth?:         boolean;
  validate_body?:        ValidationSchema;
  validate_query?:       ValidationSchema;
  log_audit?:            boolean;
  audit_action?:         string;
  audit_resource_type?:  string;
}

export interface SecurityRequest {
  ip?:        string;
  headers:    Record<string, string>;
  body?:      Record<string, unknown>;
  query?:     Record<string, unknown>;
  tenant_id?: string;
}

export interface SecurityCheckResult {
  ok:               boolean;
  status?:          number;
  error?:           string;
  sanitized_body?:  Record<string, unknown>;
  sanitized_query?: Record<string, unknown>;
}

// ── applySecurityChecks ───────────────────────────────────────────────────────

export async function applySecurityChecks(
  request: SecurityRequest,
  config:  SecurityConfig,
  deps:    { store?: RateLimitStore; db?: unknown } = {},
): Promise<SecurityCheckResult> {
  try {
    // 1. Rate limit
    if (config.rate_limit) {
      const identifier = request.ip ?? request.tenant_id ?? 'anonymous';
      const store      = deps.store;

      if (store) {
        const rl = await checkRateLimit(identifier, config.rate_limit, store);
        if (!rl.allowed) {
          // Best-effort audit log
          if (config.log_audit && deps.db && request.tenant_id) {
            await logAuditEvent({
              tenant_id:     request.tenant_id,
              actor_type:    'api',
              action:        AuditAction.RATE_LIMIT_HIT,
              resource_type: config.audit_resource_type ?? 'api',
              outcome:       'blocked',
              ip_address:    request.ip,
            }, deps.db).catch(() => {});
          }
          return { ok: false, status: 429, error: 'Rate limit exceeded' };
        }
      }
    }

    // 2. Auth check
    if (config.require_auth) {
      const auth = request.headers['authorization'] ?? request.headers['x-api-key'];
      if (!auth || auth.trim() === '') {
        return { ok: false, status: 401, error: 'Authentication required' };
      }
    }

    // 3. Body validation
    let sanitized_body: Record<string, unknown> | undefined;
    if (config.validate_body) {
      const vr = validateInput(request.body ?? {}, config.validate_body);
      if (!vr.valid) {
        if (config.log_audit && deps.db && request.tenant_id) {
          await logAuditEvent({
            tenant_id:     request.tenant_id,
            actor_type:    'api',
            action:        AuditAction.VALIDATION_FAILED,
            resource_type: config.audit_resource_type ?? 'api',
            outcome:       'failure',
            ip_address:    request.ip,
            metadata:      { errors: vr.errors },
          }, deps.db).catch(() => {});
        }
        return { ok: false, status: 400, error: `Validation failed: ${Object.values(vr.errors).join(', ')}`};
      }
      sanitized_body = vr.sanitized;
    }

    // 4. Query validation
    let sanitized_query: Record<string, unknown> | undefined;
    if (config.validate_query) {
      const vr = validateInput(request.query ?? {}, config.validate_query);
      if (!vr.valid) {
        return { ok: false, status: 400, error: `Query validation failed: ${Object.values(vr.errors).join(', ')}` };
      }
      sanitized_query = vr.sanitized;
    }

    // 5. Success audit log
    if (config.log_audit && deps.db && request.tenant_id) {
      await logAuditEvent({
        tenant_id:     request.tenant_id,
        actor_type:    'api',
        action:        config.audit_action ?? 'api.request',
        resource_type: config.audit_resource_type ?? 'api',
        outcome:       'success',
        ip_address:    request.ip,
      }, deps.db).catch(() => {});
    }

    return { ok: true, sanitized_body, sanitized_query };
  } catch {
    // Fail-open: security middleware must never crash the route
    return { ok: true };
  }
}

// ── SECURITY_PRESETS ──────────────────────────────────────────────────────────

export const SECURITY_PRESETS: Record<string, SecurityConfig> = {
  PUBLIC_READ: {
    rate_limit:   DEFAULT_RATE_LIMITS['api_general'],
    require_auth: false,
    log_audit:    false,
  },

  AUTHENTICATED_WRITE: {
    rate_limit:   DEFAULT_RATE_LIMITS['api_general'],
    require_auth: true,
    log_audit:    true,
    audit_action: 'api.write',
  },

  CRAWL_TRIGGER: {
    rate_limit:          DEFAULT_RATE_LIMITS['api_crawl'],
    require_auth:        true,
    log_audit:           true,
    audit_action:        AuditAction.CRAWL_STARTED,
    audit_resource_type: 'site',
  },

  EXPORT: {
    rate_limit:          DEFAULT_RATE_LIMITS['api_export'],
    require_auth:        true,
    log_audit:           true,
    audit_action:        AuditAction.EXPORT_DOWNLOADED,
    audit_resource_type: 'export',
  },
};
