/**
 * tools/notifications/notification_dispatcher.ts
 *
 * Dispatches fix notifications via immediate email or digest queue. Never throws.
 */

import type { FixNotificationEvent, FixNotificationPayload } from './fix_notification.js';
import { shouldSendImmediately, getNotificationSubject, getNotificationBody } from './fix_notification.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface NotificationDispatchConfig {
  site_id:                    string;
  user_email:                 string;
  domain:                     string;
  digest_enabled:             boolean;
  immediate_alerts_enabled:   boolean;
}

export interface NotificationDispatchResult {
  event:      FixNotificationEvent;
  dispatched: boolean;
  method:     'immediate' | 'digest' | 'skipped';
  reason?:    string;
}

export interface NotificationDispatchDeps {
  sendEmailFn?:       (to: string, subject: string, body: string) => Promise<void>;
  scheduleDigestFn?:  (payload: FixNotificationPayload) => Promise<void>;
}

// ── Default stubs ────────────────────────────────────────────────────────────

async function defaultSendEmail(_to: string, _subject: string, _body: string): Promise<void> {
  // No-op in default; wired to real email sender in production
}

async function defaultScheduleDigest(_payload: FixNotificationPayload): Promise<void> {
  // No-op in default; wired to real digest scheduler in production
}

// ── dispatchFixNotification ──────────────────────────────────────────────────

export async function dispatchFixNotification(
  payload: FixNotificationPayload,
  config:  NotificationDispatchConfig,
  deps?:   NotificationDispatchDeps,
): Promise<NotificationDispatchResult> {
  try {
    const sendEmail      = deps?.sendEmailFn      ?? defaultSendEmail;
    const scheduleDigest = deps?.scheduleDigestFn  ?? defaultScheduleDigest;

    if (shouldSendImmediately(payload.event) && config.immediate_alerts_enabled) {
      const subject = getNotificationSubject(payload);
      const body    = getNotificationBody(payload);
      try {
        await sendEmail(config.user_email, subject, body);
      } catch { /* never let send failure propagate */ }
      return {
        event:      payload.event,
        dispatched: true,
        method:     'immediate',
      };
    }

    if (config.digest_enabled) {
      try {
        await scheduleDigest(payload);
      } catch { /* never let digest failure propagate */ }
      return {
        event:      payload.event,
        dispatched: true,
        method:     'digest',
      };
    }

    return {
      event:      payload.event,
      dispatched: false,
      method:     'skipped',
      reason:     'notifications disabled',
    };
  } catch {
    return {
      event:      payload?.event ?? 'fix_applied',
      dispatched: false,
      method:     'skipped',
      reason:     'dispatch error',
    };
  }
}

// ── dispatchBatchNotification ────────────────────────────────────────────────

export async function dispatchBatchNotification(
  payloads: FixNotificationPayload[],
  config:   NotificationDispatchConfig,
  deps?:    NotificationDispatchDeps,
): Promise<NotificationDispatchResult[]> {
  try {
    const results: NotificationDispatchResult[] = [];
    for (const payload of (payloads ?? [])) {
      const result = await dispatchFixNotification(payload, config, deps);
      results.push(result);
    }
    return results;
  } catch {
    return [];
  }
}
