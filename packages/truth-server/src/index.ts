/**
 * packages/truth-server/src/index.ts
 *
 * Snapshot and diff engine — the platform's source of truth for site state.
 *
 * Three responsibilities:
 *   1. snapshot() — fetch current CMS state and persist it to Supabase (+ R2 for large payloads)
 *   2. diff()     — compare two snapshots field-by-field and return a structured diff
 *   3. restore()  — retrieve and integrity-verify a snapshot for rollback or audit
 *
 * All queries include tenant_id in the WHERE clause — multi-tenant isolation enforced at query level.
 * Supabase RLS provides the second layer of isolation.
 *
 * Never call process.env directly — all credentials come from packages/core/config.ts.
 */

import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import type {
  CMSAdapter,
  ActionLogEvent,
  CmsType,
} from '../../../packages/core/types.js';
import { config } from '../../../packages/core/config.js';

// ── Table / storage constants — change here, not in queries ──────────────────

const TABLE_SNAPSHOTS = 'site_snapshots' as const;
const R2_PATH_PREFIX = (tenantId: string, runId: string) =>
  `${tenantId}/${runId}/snapshot.json`;

/** Snapshot payloads larger than this threshold are offloaded to R2. */
const R2_SIZE_THRESHOLD_BYTES = 1_000_000; // 1 MB

// ── Public return types ───────────────────────────────────────────────────────

/** Result returned by snapshot(). */
export interface SnapshotResult {
  snapshot_id: string;
  content_hash: string;
}

/** A single changed field in a diff. */
export interface DiffChangedField {
  field: string;
  before_value: unknown;
  after_value: unknown;
}

/** A field that appeared in the after snapshot but not the before. */
export interface DiffAddedField {
  field: string;
  value: unknown;
}

/** A field that was present in the before snapshot but missing in the after. */
export interface DiffRemovedField {
  field: string;
  previous_value: unknown;
}

/** Structured diff result returned by diff(). */
export interface SnapshotDiff {
  run_id_before: string;
  run_id_after: string;
  fields_changed: DiffChangedField[];
  fields_added: DiffAddedField[];
  fields_removed: DiffRemovedField[];
  compared_at: string;
}

/** Full snapshot row as stored in Supabase. */
export interface SiteSnapshot {
  snapshot_id: string;
  run_id: string;
  tenant_id: string;
  site_id: string;
  cms_type: CmsType;
  snapshot_data: Record<string, unknown>;
  content_hash: string;
  created_at: string;
}

// ── ActionLog writer ──────────────────────────────────────────────────────────

/**
 * Emits an ActionLogEvent to stdout as newline-delimited JSON.
 * The platform log aggregator persists these — the truth-server just emits them.
 */
function writeLog(
  overrides: Partial<ActionLogEvent> & Pick<ActionLogEvent, 'run_id' | 'site_id' | 'stage' | 'status'>,
): void {
  const event: ActionLogEvent = {
    tenant_id: '',
    cms: 'shopify',
    command: 'truth-server',
    urls: [],
    proof_artifacts: [],
    before_metrics: null,
    after_metrics: null,
    ts: new Date().toISOString(),
    ...overrides,
  };
  process.stdout.write(JSON.stringify(event) + '\n');
}

// ── Supabase client factory ───────────────────────────────────────────────────

/**
 * Creates a Supabase client using the service-role key so RLS policies are
 * evaluated against the tenant_id we explicitly pass — not the anon user.
 * The service-role key is never exposed to the browser; server-side only.
 */
function makeSupabaseClient(): SupabaseClient {
  return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false },
  });
}

// ── R2 client factory ─────────────────────────────────────────────────────────

/**
 * Creates an AWS S3-compatible client pointing at Cloudflare R2.
 * Credentials come from config.r2 — never from process.env.
 */
function makeR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: config.r2.endpoint,
    credentials: {
      accessKeyId: config.r2.accessKeyId,
      secretAccessKey: config.r2.secretAccessKey,
    },
  });
}

// ── Hashing ───────────────────────────────────────────────────────────────────

/**
 * Computes a deterministic SHA-256 hash of any JSON-serialisable object.
 * Keys are sorted before serialisation so object ordering doesn't affect the hash.
 */
function hashObject(obj: Record<string, unknown>): string {
  const stable = JSON.stringify(obj, Object.keys(obj).sort());
  return createHash('sha256').update(stable, 'utf-8').digest('hex');
}

// ── Deep diff ─────────────────────────────────────────────────────────────────

/**
 * Recursively walks two plain objects and collects every leaf-level difference.
 * Returns three lists: changed fields, added fields, and removed fields.
 * Nested keys are represented with dot notation (e.g. "pages.gid://shopify/Page/1.title").
 */
function deepDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  prefix = '',
): { changed: DiffChangedField[]; added: DiffAddedField[]; removed: DiffRemovedField[] } {
  const changed: DiffChangedField[] = [];
  const added: DiffAddedField[] = [];
  const removed: DiffRemovedField[] = [];

  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const inBefore = Object.prototype.hasOwnProperty.call(before, key);
    const inAfter = Object.prototype.hasOwnProperty.call(after, key);

    if (!inBefore) {
      added.push({ field: fullKey, value: after[key] });
      continue;
    }
    if (!inAfter) {
      removed.push({ field: fullKey, previous_value: before[key] });
      continue;
    }

    const bVal = before[key];
    const aVal = after[key];

    // Recurse into nested plain objects — not into arrays or primitives
    if (
      bVal !== null && aVal !== null &&
      typeof bVal === 'object' && typeof aVal === 'object' &&
      !Array.isArray(bVal) && !Array.isArray(aVal)
    ) {
      const nested = deepDiff(
        bVal as Record<string, unknown>,
        aVal as Record<string, unknown>,
        fullKey,
      );
      changed.push(...nested.changed);
      added.push(...nested.added);
      removed.push(...nested.removed);
    } else {
      // Primitive or array — compare by stable JSON representation
      const bStr = JSON.stringify(bVal);
      const aStr = JSON.stringify(aVal);
      if (bStr !== aStr) {
        changed.push({ field: fullKey, before_value: bVal, after_value: aVal });
      }
    }
  }

  return { changed, added, removed };
}

// ── R2 helpers ────────────────────────────────────────────────────────────────

/**
 * Uploads a JSON payload to Cloudflare R2 at {tenantId}/{runId}/snapshot.json.
 * Returns the public path (not a signed URL — access is controlled by RLS + the
 * R2 bucket policy). Throws if the upload fails.
 */
async function uploadToR2(
  r2: S3Client,
  tenantId: string,
  runId: string,
  data: Record<string, unknown>,
): Promise<string> {
  const key = R2_PATH_PREFIX(tenantId, runId);
  const body = JSON.stringify(data);

  await r2.send(new PutObjectCommand({
    Bucket: config.r2.bucketName,
    Key: key,
    Body: body,
    ContentType: 'application/json',
    Metadata: { tenant_id: tenantId, run_id: runId },
  }));

  return `r2://${config.r2.bucketName}/${key}`;
}

/**
 * Downloads and parses a JSON payload from Cloudflare R2 by key path.
 * Throws if the object is missing or unreadable.
 */
async function downloadFromR2(
  r2: S3Client,
  r2Url: string,
): Promise<Record<string, unknown>> {
  // r2Url format: r2://{bucket}/{key}
  const withoutScheme = r2Url.replace(/^r2:\/\/[^/]+\//, '');
  const key = withoutScheme;

  const result = await r2.send(new GetObjectCommand({
    Bucket: config.r2.bucketName,
    Key: key,
  }));

  if (!result.Body) {
    throw new Error(`[truth-server] R2 object at ${key} has no body`);
  }

  const text = await result.Body.transformToString('utf-8');
  return JSON.parse(text) as Record<string, unknown>;
}

// ── TruthServer ───────────────────────────────────────────────────────────────

/**
 * TruthServer — snapshot, diff, and restore engine.
 *
 * Instantiate with the appropriate CMS adapter for the site being snapshotted.
 * The adapter is swapped at construction time so the truth-server stays CMS-agnostic.
 */
export class TruthServer {
  private readonly supabase: SupabaseClient;
  private readonly r2: S3Client;

  constructor(private readonly adapter: CMSAdapter) {
    this.supabase = makeSupabaseClient();
    this.r2 = makeR2Client();
  }

  /**
   * Takes a full snapshot of the site's current SEO state by calling fetch_state
   * on the CMS adapter, then persists the result to Supabase. If the payload
   * exceeds 1 MB, the raw data is stored in Cloudflare R2 and only the R2 URL
   * is written to Supabase. Returns the snapshot_id and content_hash.
   */
  async snapshot(
    siteId: string,
    runId: string,
    tenantId: string,
    cmsType: CmsType = 'shopify',
  ): Promise<SnapshotResult> {
    writeLog({ run_id: runId, site_id: siteId, stage: 'snapshot:start', status: 'pending' });

    // 1. Fetch current state from the CMS adapter
    let stateData: Record<string, unknown>;
    try {
      stateData = await this.adapter.fetch_state(siteId);
    } catch (err) {
      writeLog({ run_id: runId, site_id: siteId, stage: 'snapshot:fetch_state_error', status: 'error' });
      throw new Error(
        `[truth-server] snapshot: fetch_state failed for site ${siteId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 2. Compute content hash over the raw state
    const contentHash = hashObject(stateData);

    // 3. Decide storage: Supabase JSONB for ≤1 MB, R2 for larger
    const serialised = JSON.stringify(stateData);
    const byteSize = Buffer.byteLength(serialised, 'utf-8');
    let snapshotDataForDb: Record<string, unknown>;

    if (byteSize > R2_SIZE_THRESHOLD_BYTES) {
      // Upload full payload to R2 — throw if upload fails, do not proceed
      let r2Url: string;
      try {
        r2Url = await uploadToR2(this.r2, tenantId, runId, stateData);
      } catch (err) {
        writeLog({ run_id: runId, site_id: siteId, stage: 'snapshot:r2_upload_error', status: 'error' });
        throw new Error(
          `[truth-server] snapshot: R2 upload failed for run ${runId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      // Store R2 reference in Supabase instead of raw payload
      snapshotDataForDb = {
        _storage: 'r2',
        _r2_url: r2Url,
        _byte_size: byteSize,
      };
    } else {
      snapshotDataForDb = stateData;
    }

    // 4. Insert row into Supabase — tenant_id always included
    let snapshotId: string;
    try {
      const { data, error } = await this.supabase
        .from(TABLE_SNAPSHOTS)
        .insert({
          run_id: runId,
          tenant_id: tenantId,
          site_id: siteId,
          cms_type: cmsType,
          snapshot_data: snapshotDataForDb,
          content_hash: contentHash,
          // created_at is set by Supabase DEFAULT NOW()
        })
        .select('snapshot_id')
        .single();

      if (error) {
        throw new Error(error.message);
      }
      if (!data) {
        throw new Error('No row returned after insert');
      }

      snapshotId = (data as { snapshot_id: string }).snapshot_id;
    } catch (err) {
      writeLog({ run_id: runId, site_id: siteId, stage: 'snapshot:db_error', status: 'error' });
      throw new Error(
        `[truth-server] snapshot: Supabase insert failed for run ${runId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    writeLog({
      run_id: runId,
      site_id: siteId,
      stage: 'snapshot:complete',
      status: 'ok',
      proof_artifacts: [`supabase://${TABLE_SNAPSHOTS}/${snapshotId}`],
    });

    return { snapshot_id: snapshotId, content_hash: contentHash };
  }

  /**
   * Retrieves both snapshots from Supabase by run_id, then compares their
   * snapshot_data field by field — including nested JSONB objects — and returns
   * a structured diff listing every change, addition, and removal.
   */
  async diff(
    runIdBefore: string,
    runIdAfter: string,
    tenantId: string,
  ): Promise<SnapshotDiff> {
    writeLog({ run_id: runIdBefore, site_id: '', stage: 'diff:start', status: 'pending' });

    // Fetch both snapshots — both must belong to the same tenant
    let before: SiteSnapshot;
    let after: SiteSnapshot;

    try {
      const [beforeRes, afterRes] = await Promise.all([
        this.supabase
          .from(TABLE_SNAPSHOTS)
          .select('*')
          .eq('run_id', runIdBefore)
          .eq('tenant_id', tenantId)
          .single(),
        this.supabase
          .from(TABLE_SNAPSHOTS)
          .select('*')
          .eq('run_id', runIdAfter)
          .eq('tenant_id', tenantId)
          .single(),
      ]);

      if (beforeRes.error) {
        throw new Error(`Before snapshot (${runIdBefore}): ${beforeRes.error.message}`);
      }
      if (afterRes.error) {
        throw new Error(`After snapshot (${runIdAfter}): ${afterRes.error.message}`);
      }
      if (!beforeRes.data || !afterRes.data) {
        throw new Error('One or both snapshots returned no data');
      }

      before = beforeRes.data as SiteSnapshot;
      after = afterRes.data as SiteSnapshot;
    } catch (err) {
      writeLog({ run_id: runIdBefore, site_id: '', stage: 'diff:fetch_error', status: 'error' });
      throw new Error(
        `[truth-server] diff: failed to fetch snapshots: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Resolve R2-offloaded snapshots before comparing
    const beforeData = await this.resolveSnapshotData(before);
    const afterData = await this.resolveSnapshotData(after);

    // Deep-compare the two state objects
    const { changed, added, removed } = deepDiff(beforeData, afterData);

    const result: SnapshotDiff = {
      run_id_before: runIdBefore,
      run_id_after: runIdAfter,
      fields_changed: changed,
      fields_added: added,
      fields_removed: removed,
      compared_at: new Date().toISOString(),
    };

    writeLog({
      run_id: runIdBefore,
      site_id: before.site_id,
      stage: 'diff:complete',
      status: 'ok',
    });

    return result;
  }

  /**
   * Retrieves a snapshot from Supabase by run_id and verifies that its
   * content_hash still matches the stored data. If the hash does not match,
   * throws an error — never returns data that may have been tampered with.
   * Returns the full snapshot_data for use by the rollback process.
   */
  async restore(runId: string, tenantId: string): Promise<Record<string, unknown>> {
    writeLog({ run_id: runId, site_id: '', stage: 'restore:start', status: 'pending' });

    // Fetch snapshot — tenant_id always in WHERE clause
    let row: SiteSnapshot;
    try {
      const { data, error } = await this.supabase
        .from(TABLE_SNAPSHOTS)
        .select('*')
        .eq('run_id', runId)
        .eq('tenant_id', tenantId)
        .single();

      if (error) throw new Error(error.message);
      if (!data) throw new Error('No snapshot found for this run_id and tenant_id');

      row = data as SiteSnapshot;
    } catch (err) {
      writeLog({ run_id: runId, site_id: '', stage: 'restore:fetch_error', status: 'error' });
      throw new Error(
        `[truth-server] restore: Supabase fetch failed for run ${runId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Resolve R2-offloaded data if needed
    const resolvedData = await this.resolveSnapshotData(row);

    // Verify integrity — never return data whose hash doesn't match
    const computedHash = hashObject(resolvedData);
    if (computedHash !== row.content_hash) {
      writeLog({ run_id: runId, site_id: row.site_id, stage: 'restore:hash_mismatch', status: 'error' });
      throw new Error(
        `[truth-server] restore: content_hash mismatch for run ${runId}.\n` +
        `  Stored:   ${row.content_hash}\n` +
        `  Computed: ${computedHash}\n` +
        `  The snapshot may have been tampered with. Refusing to return data.`,
      );
    }

    writeLog({
      run_id: runId,
      site_id: row.site_id,
      stage: 'restore:complete',
      status: 'ok',
      proof_artifacts: [`supabase://${TABLE_SNAPSHOTS}/${row.snapshot_id}`],
    });

    return resolvedData;
  }

  /**
   * If a snapshot row has its data offloaded to R2 (indicated by _storage: 'r2'),
   * downloads and returns the full payload. Otherwise returns the in-row data directly.
   */
  private async resolveSnapshotData(
    row: SiteSnapshot,
  ): Promise<Record<string, unknown>> {
    const data = row.snapshot_data;
    if (data['_storage'] === 'r2' && typeof data['_r2_url'] === 'string') {
      try {
        return await downloadFromR2(this.r2, data['_r2_url']);
      } catch (err) {
        throw new Error(
          `[truth-server] resolveSnapshotData: R2 download failed for run ${row.run_id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return data;
  }
}

// ── Default export ────────────────────────────────────────────────────────────

export default TruthServer;
