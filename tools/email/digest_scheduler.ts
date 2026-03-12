/**
 * tools/email/digest_scheduler.ts
 *
 * Manages digest send scheduling:
 *   getNextSendAt  — compute next scheduled ISO timestamp
 *   shouldSendDigest — determine if a digest is due now
 *   getSchedulesForTenant — load schedules from DB (or return default)
 *
 * Pure functions + injectable DB. Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DigestSchedule {
  tenant_id:     string;
  frequency:     'weekly' | 'monthly';
  day_of_week:   number;   // 0 = Sunday … 6 = Saturday
  hour_utc:      number;   // 0–23
  enabled:       boolean;
  last_sent_at?: string;
  next_send_at:  string;   // ISO timestamp
}

export const DEFAULT_DIGEST_SCHEDULE = {
  frequency:   'weekly' as const,
  day_of_week: 1,    // Monday
  hour_utc:    9,
  enabled:     true,
};

// ── Internal DB types ─────────────────────────────────────────────────────────

interface DbQ<T> extends PromiseLike<{ data: T | null; error: { message: string } | null }> {
  select(cols: string): DbQ<T>;
  eq(col: string, val: unknown): DbQ<T>;
  order(col: string, opts?: { ascending?: boolean }): DbQ<T>;
  limit(n: number): DbQ<T>;
}

interface SchedDb {
  from(table: string): DbQ<unknown[]>;
}

// ── getNextSendAt ─────────────────────────────────────────────────────────────

/**
 * Returns the ISO timestamp of the next scheduled send after `now`.
 *
 * weekly:  advances day-by-day until we hit the target day_of_week, then sets
 *          the time to hour_utc:00:00Z. If today IS the target day and we
 *          haven't yet passed hour_utc, returns today at that hour.
 *
 * monthly: first day of next calendar month at hour_utc:00:00Z.
 */
export function getNextSendAt(
  schedule: Omit<DigestSchedule, 'next_send_at'>,
  now: Date = new Date(),
): string {
  try {
    const { frequency, day_of_week, hour_utc } = schedule;

    if (frequency === 'monthly') {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, hour_utc, 0, 0, 0));
      return d.toISOString();
    }

    // weekly
    const candidate = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour_utc, 0, 0, 0,
    ));

    // Advance from today until we land on day_of_week
    for (let i = 0; i < 8; i++) {
      const testDay = new Date(candidate.getTime() + i * 86_400_000);
      if (testDay.getUTCDay() === day_of_week && testDay > now) {
        return testDay.toISOString();
      }
    }

    // Fallback: 7 days from now
    return new Date(now.getTime() + 7 * 86_400_000).toISOString();
  } catch {
    return new Date(Date.now() + 7 * 86_400_000).toISOString();
  }
}

// ── shouldSendDigest ──────────────────────────────────────────────────────────

const DEDUP_WINDOW_MS = 23 * 60 * 60 * 1000; // 23 hours

/**
 * Returns true when:
 *   - enabled is true
 *   - now >= next_send_at
 *   - last_sent_at is absent or > 23 hours ago (prevents duplicate sends)
 */
export function shouldSendDigest(schedule: DigestSchedule, now: Date = new Date()): boolean {
  try {
    if (!schedule.enabled) return false;
    if (now < new Date(schedule.next_send_at)) return false;
    if (schedule.last_sent_at) {
      const lastSent = Date.parse(schedule.last_sent_at);
      if (!isNaN(lastSent) && now.getTime() - lastSent < DEDUP_WINDOW_MS) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ── getSchedulesForTenant ─────────────────────────────────────────────────────

/**
 * Loads DigestSchedule rows for a tenant from the `digest_schedules` table.
 * Falls back to a default weekly Monday-9am schedule if none found.
 */
export async function getSchedulesForTenant(
  tenant_id: string,
  db:        unknown,
): Promise<DigestSchedule[]> {
  try {
    const sdb = db as SchedDb;
    const { data, error } = await (sdb.from('digest_schedules') as DbQ<Record<string, unknown>[]>)
      .select('tenant_id, frequency, day_of_week, hour_utc, enabled, last_sent_at, next_send_at')
      .eq('tenant_id', tenant_id);

    if (error || !data?.length) {
      return [defaultScheduleFor(tenant_id)];
    }

    return data.map((row) => ({
      tenant_id:    String(row['tenant_id'] ?? tenant_id),
      frequency:    (row['frequency'] === 'monthly' ? 'monthly' : 'weekly') as DigestSchedule['frequency'],
      day_of_week:  Number(row['day_of_week'] ?? DEFAULT_DIGEST_SCHEDULE.day_of_week),
      hour_utc:     Number(row['hour_utc']    ?? DEFAULT_DIGEST_SCHEDULE.hour_utc),
      enabled:      Boolean(row['enabled'] ?? true),
      last_sent_at: row['last_sent_at'] != null ? String(row['last_sent_at']) : undefined,
      next_send_at: row['next_send_at'] != null ? String(row['next_send_at']) : getNextSendAt({
        tenant_id,
        ...DEFAULT_DIGEST_SCHEDULE,
      }),
    }));
  } catch {
    return [defaultScheduleFor(tenant_id)];
  }
}

// ── scheduleDigest ────────────────────────────────────────────────────────────

export interface DigestQueueEntry {
  site_id:     string;
  trigger:     string;
  queued_at:   string;
}

interface QueueDb {
  from(table: string): {
    insert(row: Record<string, unknown>): PromiseLike<{ error: unknown }>;
  };
}

/**
 * Queues a digest for the given site by writing to `digest_queue`.
 * Non-fatal: errors are swallowed and logged.
 * Injectable `db` for testing.
 */
export async function scheduleDigest(
  site_id:  string,
  options:  { trigger: string },
  deps?:    { db?: unknown },
): Promise<void> {
  try {
    const db = deps?.db as QueueDb | undefined;
    if (!db) return;
    const entry: DigestQueueEntry = {
      site_id,
      trigger:   options?.trigger ?? 'unknown',
      queued_at: new Date().toISOString(),
    };
    await db.from('digest_queue').insert(entry as unknown as Record<string, unknown>);
  } catch {
    // non-fatal
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultScheduleFor(tenant_id: string): DigestSchedule {
  const base = { tenant_id, ...DEFAULT_DIGEST_SCHEDULE };
  return {
    ...base,
    next_send_at: getNextSendAt(base),
  };
}
