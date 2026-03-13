/**
 * tools/gsc/gsc_delta_sync.ts
 *
 * Delta sync engine for GSC Search Analytics.
 * Fetches only new data since last sync; full 28-day pull only on
 * first connect or manual refresh.
 *
 * Never throws.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export const GSC_FULL_SYNC_DAYS:    number = 28;
export const GSC_DELTA_SYNC_DAYS:   number = 3;
export const GSC_DELTA_TOLERANCE_DAYS: number = 1;

/** Number of days without a sync before we force a full re-pull. */
const MAX_DELTA_AGE_DAYS = 7;

// ── Types ─────────────────────────────────────────────────────────────────────

export type SyncMode = 'full' | 'delta';

export interface DeltaSyncConfig {
  site_id:      string;
  property:     string;
  last_sync_at: string | null;
  force_full:   boolean;
}

export interface DeltaSyncResult {
  site_id:          string;
  sync_mode:        SyncMode;
  date_range_start: string;
  date_range_end:   string;
  days_fetched:     number;
  rows_fetched:     number;
  rows_new:         number;
  rows_updated:     number;
  api_calls_made:   number;
  synced_at:        string;
  error?:           string;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number, from?: Date): string {
  const base = from ? new Date(from) : new Date();
  base.setDate(base.getDate() - n);
  return formatDate(base);
}

function yesterday(): string {
  return daysAgo(1);
}

function daysBetween(a: string, b: string): number {
  const ms = Math.abs(new Date(b).getTime() - new Date(a).getTime());
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

// ── determineSyncMode ─────────────────────────────────────────────────────────

export function determineSyncMode(
  last_sync_at: string | null,
  force_full:   boolean,
): SyncMode {
  try {
    if (force_full)          return 'full';
    if (!last_sync_at)       return 'full';

    const ageMs = Date.now() - new Date(last_sync_at).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > MAX_DELTA_AGE_DAYS) return 'full';

    return 'delta';
  } catch {
    return 'full';
  }
}

// ── buildDeltaDateRange ───────────────────────────────────────────────────────

export function buildDeltaDateRange(
  last_sync_at:   string,
  tolerance_days: number,
): { start: string; end: string } {
  try {
    const base    = new Date(last_sync_at);
    const start   = daysAgo(tolerance_days, base);
    const end     = yesterday();
    return { start, end };
  } catch {
    return { start: daysAgo(GSC_DELTA_SYNC_DAYS + GSC_DELTA_TOLERANCE_DAYS), end: yesterday() };
  }
}

// ── buildFullDateRange ────────────────────────────────────────────────────────

export function buildFullDateRange(): { start: string; end: string } {
  try {
    return { start: daysAgo(GSC_FULL_SYNC_DAYS), end: yesterday() };
  } catch {
    return { start: daysAgo(28), end: yesterday() };
  }
}

// ── buildSyncDateRange ────────────────────────────────────────────────────────

export function buildSyncDateRange(config: DeltaSyncConfig): {
  start: string;
  end:   string;
  mode:  SyncMode;
} {
  try {
    const mode = determineSyncMode(config?.last_sync_at ?? null, config?.force_full ?? false);

    if (mode === 'full') {
      const range = buildFullDateRange();
      return { ...range, mode };
    }

    const range = buildDeltaDateRange(
      config.last_sync_at!,
      GSC_DELTA_TOLERANCE_DAYS,
    );
    return { ...range, mode };
  } catch {
    return { ...buildFullDateRange(), mode: 'full' };
  }
}

// ── runDeltaSync ──────────────────────────────────────────────────────────────

export interface GSCRow {
  keyword:     string;
  url:         string;
  date:        string;
  clicks:      number;
  impressions: number;
  position:    number;
}

export interface UpsertResult {
  rows_new:     number;
  rows_updated: number;
}

export async function runDeltaSync(
  config: DeltaSyncConfig,
  deps?: {
    fetchGSCFn?:    (site_id: string, start: string, end: string) => Promise<GSCRow[]>;
    saveRankingsFn?: (site_id: string, rows: GSCRow[], mode: SyncMode) => Promise<UpsertResult>;
    loadLastSyncFn?: (site_id: string) => Promise<string | null>;
    logFn?:          (msg: string) => void;
  },
): Promise<DeltaSyncResult> {
  const synced_at = new Date().toISOString();

  try {
    const site_id = config?.site_id ?? '';
    const logFn   = deps?.logFn ?? ((msg: string) => process.stderr.write(msg + '\n'));

    // Resolve last_sync_at — allow deps override
    let last_sync_at = config.last_sync_at;
    if (!last_sync_at && deps?.loadLastSyncFn) {
      last_sync_at = await deps.loadLastSyncFn(site_id).catch(() => null);
    }

    const effectiveConfig: DeltaSyncConfig = { ...config, last_sync_at };
    const { start, end, mode }             = buildSyncDateRange(effectiveConfig);

    // Step 3: fetch GSC data for the date range only
    const fetchFn = deps?.fetchGSCFn ?? defaultFetchGSC;
    const rows    = await fetchFn(site_id, start, end).catch(() => [] as GSCRow[]);

    // Step 4: upsert into rankings table
    const saveFn = deps?.saveRankingsFn ?? defaultSaveRankings;
    const { rows_new, rows_updated } = await saveFn(site_id, rows, mode).catch(
      () => ({ rows_new: 0, rows_updated: 0 }),
    );

    const days_fetched = daysBetween(start, end) + 1;

    const result: DeltaSyncResult = {
      site_id,
      sync_mode:        mode,
      date_range_start: start,
      date_range_end:   end,
      days_fetched,
      rows_fetched:     rows.length,
      rows_new,
      rows_updated,
      api_calls_made:   1,
      synced_at,
    };

    logFn(
      `[GSC_SYNC] site=${site_id} mode=${mode} days=${days_fetched} ` +
      `rows=${rows.length} new=${rows_new} updated=${rows_updated} api_calls=1`,
    );

    return result;
  } catch (err) {
    return {
      site_id:          config?.site_id ?? '',
      sync_mode:        'full',
      date_range_start: '',
      date_range_end:   '',
      days_fetched:     0,
      rows_fetched:     0,
      rows_new:         0,
      rows_updated:     0,
      api_calls_made:   0,
      synced_at,
      error:            err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Defaults ──────────────────────────────────────────────────────────────────

async function defaultFetchGSC(
  _site_id: string,
  _start:   string,
  _end:     string,
): Promise<GSCRow[]> {
  return [];
}

async function defaultSaveRankings(
  _site_id: string,
  _rows:    GSCRow[],
  _mode:    SyncMode,
): Promise<UpsertResult> {
  return { rows_new: 0, rows_updated: 0 };
}
