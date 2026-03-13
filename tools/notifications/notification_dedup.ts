/**
 * tools/notifications/notification_dedup.ts
 *
 * Deduplication engine for fix notifications.
 * Same fix + same notification type within 1 hour = send once.
 * Never throws.
 */

// ── Constants ────────────────────────────────────────────────────────────────

export const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// ── Types ────────────────────────────────────────────────────────────────────

export interface NotificationDedupRecord {
  dedup_key:  string;
  site_id:    string;
  fix_id:     string;
  event:      string;
  sent_at:    string;
  expires_at: string;
}

export interface NotificationDedupResult {
  allowed:    boolean;
  dedup_key:  string;
  reason?:    string;
}

export interface NotificationDedupDeps {
  lookupFn?:  (dedup_key: string) => Promise<NotificationDedupRecord | null>;
  saveFn?:    (record: NotificationDedupRecord) => Promise<void>;
  deleteFn?:  (before_iso: string) => Promise<number>;
  nowFn?:     () => number;
}

// ── buildDedupKey ────────────────────────────────────────────────────────────

export function buildDedupKey(site_id: string, fix_id: string, event: string): string {
  try {
    return `dedup:${site_id ?? ''}:${fix_id ?? ''}:${event ?? ''}`;
  } catch {
    return 'dedup:::';
  }
}

// ── checkNotificationDedup ───────────────────────────────────────────────────

export async function checkNotificationDedup(
  site_id: string,
  fix_id:  string,
  event:   string,
  deps?:   NotificationDedupDeps,
): Promise<NotificationDedupResult> {
  try {
    const key = buildDedupKey(site_id, fix_id, event);
    const lookup = deps?.lookupFn ?? defaultLookup;
    const now = (deps?.nowFn ?? Date.now)();

    const existing = await lookup(key);

    if (existing) {
      const expiresAt = new Date(existing.expires_at).getTime();
      if (now < expiresAt) {
        return { allowed: false, dedup_key: key, reason: 'duplicate within window' };
      }
    }

    return { allowed: true, dedup_key: key };
  } catch {
    // Fail open — allow the notification if dedup check fails
    const key = buildDedupKey(site_id, fix_id, event);
    return { allowed: true, dedup_key: key, reason: 'dedup_check_error' };
  }
}

// ── recordNotificationSent ───────────────────────────────────────────────────

export async function recordNotificationSent(
  site_id: string,
  fix_id:  string,
  event:   string,
  deps?:   NotificationDedupDeps,
): Promise<boolean> {
  try {
    const key = buildDedupKey(site_id, fix_id, event);
    const save = deps?.saveFn ?? defaultSave;
    const now = (deps?.nowFn ?? Date.now)();

    const record: NotificationDedupRecord = {
      dedup_key:  key,
      site_id:    site_id ?? '',
      fix_id:     fix_id ?? '',
      event:      event ?? '',
      sent_at:    new Date(now).toISOString(),
      expires_at: new Date(now + DEDUP_WINDOW_MS).toISOString(),
    };

    await save(record);
    return true;
  } catch {
    return false;
  }
}

// ── cleanExpiredDedupRecords ─────────────────────────────────────────────────

export async function cleanExpiredDedupRecords(
  deps?: NotificationDedupDeps,
): Promise<number> {
  try {
    const deleteFn = deps?.deleteFn ?? defaultDelete;
    const now = (deps?.nowFn ?? Date.now)();
    const cutoff = new Date(now).toISOString();
    return await deleteFn(cutoff);
  } catch {
    return 0;
  }
}

// ── Default stubs ────────────────────────────────────────────────────────────

async function defaultLookup(_key: string): Promise<NotificationDedupRecord | null> {
  return null;
}

async function defaultSave(_record: NotificationDedupRecord): Promise<void> {}

async function defaultDelete(_before_iso: string): Promise<number> {
  return 0;
}
