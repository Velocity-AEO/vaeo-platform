/**
 * tools/rollback/rollback_engine.ts
 *
 * Core rollback logic: restores a fix to its original value.
 * Injectable deps for apply and log. Never throws.
 */

import { buildFixNotification } from '../notifications/fix_notification.js';
import { dispatchFixNotification, type NotificationDispatchConfig } from '../notifications/notification_dispatcher.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RollbackTarget {
  fix_id:         string;
  site_id:        string;
  url:            string;
  platform:       'shopify' | 'wordpress';
  signal_type:    string;
  original_value: string | null;
  applied_value:  string;
  applied_at:     string;
}

export interface RollbackResult {
  fix_id:          string;
  site_id:         string;
  success:         boolean;
  restored_value:  string | null;
  rolled_back_at:  string;
  error?:          string;
}

export interface RollbackDeps {
  applyFn?: (
    target: RollbackTarget,
    value:  string,
  ) => Promise<{ success: boolean; error?: string }>;
  logFn?: (result: RollbackResult, target: RollbackTarget) => Promise<void>;
  notificationConfig?: NotificationDispatchConfig;
  dispatchNotification?: typeof dispatchFixNotification;
}

export interface RollbackLastDeps extends RollbackDeps {
  loadLastFixFn?: (site_id: string) => Promise<RollbackTarget | null>;
}

// ── rollbackFix ───────────────────────────────────────────────────────────────

export async function rollbackFix(
  target: RollbackTarget,
  deps?:  RollbackDeps,
): Promise<RollbackResult> {
  const rolled_back_at = new Date().toISOString();

  try {
    // No original value → cannot rollback
    if (target.original_value === null) {
      return {
        fix_id:         target.fix_id,
        site_id:        target.site_id,
        success:        false,
        restored_value: null,
        rolled_back_at,
        error:          'No original value recorded, cannot rollback',
      };
    }

    // Apply original value
    const applyFn = deps?.applyFn ?? defaultApplyFn;
    const applyResult = await applyFn(target, target.original_value);

    if (!applyResult.success) {
      return {
        fix_id:         target.fix_id,
        site_id:        target.site_id,
        success:        false,
        restored_value: null,
        rolled_back_at,
        error:          applyResult.error ?? 'Apply function returned failure',
      };
    }

    const result: RollbackResult = {
      fix_id:         target.fix_id,
      site_id:        target.site_id,
      success:        true,
      restored_value: target.original_value,
      rolled_back_at,
    };

    // Log rollback (non-fatal)
    if (deps?.logFn) {
      try {
        await deps.logFn(result, target);
      } catch {
        // non-fatal
      }
    }

    // Dispatch rollback notification (non-fatal)
    if (deps?.notificationConfig) {
      try {
        const dispatch = deps.dispatchNotification ?? dispatchFixNotification;
        const payload = buildFixNotification('rollback_applied', target.site_id, target.url, {
          rollback_fix_id: target.fix_id,
        });
        await dispatch(payload, deps.notificationConfig);
      } catch {
        // never let notification failure propagate
      }
    }

    return result;
  } catch (err) {
    return {
      fix_id:         target.fix_id,
      site_id:        target.site_id,
      success:        false,
      restored_value: null,
      rolled_back_at,
      error:          err instanceof Error ? err.message : String(err),
    };
  }
}

// ── rollbackLastFix ───────────────────────────────────────────────────────────

export async function rollbackLastFix(
  site_id: string,
  deps?:   RollbackLastDeps,
): Promise<RollbackResult> {
  const rolled_back_at = new Date().toISOString();

  try {
    const loadLastFixFn = deps?.loadLastFixFn ?? defaultLoadLastFix;
    const target = await loadLastFixFn(site_id);

    if (!target) {
      return {
        fix_id:         '',
        site_id,
        success:        false,
        restored_value: null,
        rolled_back_at,
        error:          'No fix found for site',
      };
    }

    return rollbackFix(target, deps);
  } catch (err) {
    return {
      fix_id:         '',
      site_id,
      success:        false,
      restored_value: null,
      rolled_back_at,
      error:          err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Defaults ──────────────────────────────────────────────────────────────────

async function defaultApplyFn(
  _target: RollbackTarget,
  _value:  string,
): Promise<{ success: boolean; error?: string }> {
  return { success: true };
}

async function defaultLoadLastFix(_site_id: string): Promise<RollbackTarget | null> {
  return null;
}
