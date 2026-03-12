/**
 * tools/notifications/notification_preferences.ts
 *
 * Notification preference model and helpers. Never throws.
 */

import type { FixNotificationEvent } from './fix_notification.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface NotificationPreferences {
  site_id:                    string;
  user_id:                    string;
  digest_enabled:             boolean;
  immediate_alerts_enabled:   boolean;
  alert_on_fix_failed:        boolean;
  alert_on_rollback:          boolean;
  alert_on_qa_failed:         boolean;
  digest_frequency:           'daily' | 'weekly' | 'realtime';
}

// ── buildDefaultPreferences ──────────────────────────────────────────────────

export function buildDefaultPreferences(
  site_id: string,
  user_id: string,
): NotificationPreferences {
  try {
    return {
      site_id:                  site_id ?? '',
      user_id:                  user_id ?? '',
      digest_enabled:           true,
      immediate_alerts_enabled: true,
      alert_on_fix_failed:      true,
      alert_on_rollback:        true,
      alert_on_qa_failed:       true,
      digest_frequency:         'daily',
    };
  } catch {
    return {
      site_id: '',
      user_id: '',
      digest_enabled: true,
      immediate_alerts_enabled: true,
      alert_on_fix_failed: true,
      alert_on_rollback: true,
      alert_on_qa_failed: true,
      digest_frequency: 'daily',
    };
  }
}

// ── shouldSendForPreferences ─────────────────────────────────────────────────

export function shouldSendForPreferences(
  event: FixNotificationEvent,
  prefs: NotificationPreferences,
): boolean {
  try {
    switch (event) {
      case 'fix_failed':
        return prefs.alert_on_fix_failed ?? true;
      case 'rollback_applied':
        return prefs.alert_on_rollback ?? true;
      case 'qa_failed':
        return prefs.alert_on_qa_failed ?? true;
      case 'fix_applied':
        return prefs.digest_enabled ?? true;
      case 'live_run_complete':
        return prefs.digest_enabled ?? true;
      default:
        return true;
    }
  } catch {
    return true;
  }
}

// ── mergePreferences ─────────────────────────────────────────────────────────

export function mergePreferences(
  existing: NotificationPreferences,
  updates: Partial<NotificationPreferences>,
): NotificationPreferences {
  try {
    return {
      site_id:                  existing.site_id,
      user_id:                  existing.user_id,
      digest_enabled:           updates.digest_enabled ?? existing.digest_enabled,
      immediate_alerts_enabled: updates.immediate_alerts_enabled ?? existing.immediate_alerts_enabled,
      alert_on_fix_failed:      updates.alert_on_fix_failed ?? existing.alert_on_fix_failed,
      alert_on_rollback:        updates.alert_on_rollback ?? existing.alert_on_rollback,
      alert_on_qa_failed:       updates.alert_on_qa_failed ?? existing.alert_on_qa_failed,
      digest_frequency:         updates.digest_frequency ?? existing.digest_frequency,
    };
  } catch {
    return existing;
  }
}
