/**
 * packages/core/types.ts
 *
 * Core interface contracts for Velocity AEO MVP 1.2.
 * Supported CMS: Shopify, WordPress.
 *
 * ⚠️  These interfaces are the platform contract.
 *     Do NOT modify without explicit instruction.
 */

// ── Shared primitives ────────────────────────────────────────────────────────

/** Supported CMS targets for the platform. */
export type CmsType = 'shopify' | 'wordpress';

/** Confidence level assigned to an automated patch. */
export type PatchConfidence = 'safe' | 'preview_only' | 'manual_required';

/** Terminal status of a command execution or patch attempt. */
export type StageStatus = 'ok' | 'error' | 'skipped' | 'pending';

/** A single field-level SEO patch to be applied to one resource. */
export interface PatchEntry {
  /** Unique idempotency key for this patch (e.g. "site|issue_type|url|date"). */
  idempotency_key: string;
  /** The URL or resource path this patch targets. */
  url: string;
  /** The field being patched (e.g. "title", "meta_description", "canonical"). */
  field: string;
  /** Value captured before the patch was applied; used for rollback. */
  before_value: string | null;
  /** Value to write. */
  after_value: string;
  /** Confidence level of the automated patch. */
  confidence: PatchConfidence;
}

/** Snapshot of a measurable SEO metric captured before or after a patch run. */
export interface MetricSnapshot {
  /** ISO 8601 timestamp when the snapshot was captured. */
  captured_at: string;
  /** Number of pages with a missing or empty title tag. */
  title_missing: number;
  /** Number of pages with a missing or empty meta description. */
  meta_missing: number;
  /** Number of canonical issues detected (missing, relative, or off-domain). */
  canonical_issues: number;
  /** Number of 3xx redirect chains detected. */
  redirect_chains: number;
  /** Aggregate Core Web Vitals score (0–100), if available. */
  cwv_score: number | null;
}

// ── 1. CMSAdapter ────────────────────────────────────────────────────────────

/**
 * Defines the standard I/O contract every CMS adapter must implement so the
 * platform core can read state, write patches, and roll back changes without
 * knowing CMS-specific implementation details.
 */
export interface CMSAdapter {
  /**
   * Fetch the current SEO state for all relevant resources on the site.
   * Returns a structured snapshot suitable for diff and patch planning.
   */
  fetch_state(siteId: string): Promise<Record<string, unknown>>;

  /**
   * Apply a set of patch entries to the CMS.
   * Must be rollback-first: capture before_value for every field before writing.
   * Returns the idempotency keys of patches that were successfully applied.
   */
  apply_patch(manifest: PatchManifest): Promise<string[]>;

  /**
   * Restore all fields in the manifest to their before_value.
   * Must collect all errors before throwing so partial rollbacks are reported.
   */
  rollback(manifest: PatchManifest): Promise<void>;

  /**
   * List all content templates available on this CMS
   * (e.g. page types, post types, theme layout files).
   */
  list_templates(siteId: string): Promise<TemplateRef[]>;

  /**
   * Return a flat list of all crawlable URLs for the site, suitable for
   * verification passes and before/after snapshots.
   */
  list_urls(siteId: string): Promise<UrlEntry[]>;
}

/** A reference to a CMS content template (page type, post type, theme file, etc.). */
export interface TemplateRef {
  /** CMS-internal identifier for the template. */
  template_id: string;
  /** Human-readable label. */
  label: string;
  /** REST path or theme asset key used to access this template. */
  resource_path: string;
}

/** A crawlable URL entry with its CMS resource context. */
export interface UrlEntry {
  /** Fully-qualified public URL. */
  url: string;
  /** CMS-internal resource identifier (GID, post ID, etc.). */
  resource_id: string;
  /** Content type (e.g. "page", "article", "product", "post"). */
  content_type: string;
}

// ── 2. PatchManifest ─────────────────────────────────────────────────────────

/**
 * Describes a complete, self-contained set of SEO patches for a single run,
 * including the backup reference needed to reverse every change.
 */
export interface PatchManifest {
  /** Unique identifier for the automation run that produced this manifest. */
  run_id: string;
  /** Identifier of the site being patched. */
  site_id: string;
  /** CMS this manifest targets. */
  cms: CmsType;
  /** Ordered list of individual field-level patches to apply. */
  patches: PatchEntry[];
  /**
   * Filesystem or storage path where rollback artifacts are written.
   * The adapter uses this path to locate before_value snapshots.
   */
  backup_ref: string;
}

// ── 3. ActionLog event ───────────────────────────────────────────────────────

/**
 * Immutable append-only audit record written to the ActionLog after every
 * command execution, capturing full before/after context for compliance and
 * debugging.
 */
export interface ActionLogEvent {
  /** Run identifier that produced this event. */
  run_id: string;
  /** Tenant (agency or operator) that owns this site. */
  tenant_id: string;
  /** Site this event applies to. */
  site_id: string;
  /** CMS the command ran against. */
  cms: CmsType;
  /** Name of the vaeo command that was executed (e.g. "theme apply-next"). */
  command: string;
  /** URLs affected or verified during this command. */
  urls: string[];
  /** Pipeline stage at which this event was recorded. */
  stage: string;
  /** Terminal status of this stage. */
  status: StageStatus;
  /** Relative paths to proof artifacts written by this command. */
  proof_artifacts: string[];
  /** SEO metrics captured before the command ran; null if not applicable. */
  before_metrics: MetricSnapshot | null;
  /** SEO metrics captured after the command ran; null if not yet available. */
  after_metrics: MetricSnapshot | null;
  /** ISO 8601 timestamp when this event was written. */
  ts: string;
}

// ── 4. InjectionRegistry ─────────────────────────────────────────────────────

/**
 * Tracks every DOM location where the platform has injected or intends to
 * inject structured data or meta fields, enabling re-verification and drift
 * detection across runs.
 */
export interface InjectionRegistry {
  /** Site this injection record belongs to. */
  site_id: string;
  /** Template or theme asset where the injection lives. */
  template_id: string;
  /**
   * Type of field being injected
   * (e.g. "meta_title", "meta_description", "canonical", "json_ld").
   */
  field_type: string;
  /** CSS selector or Liquid/PHP expression used to locate the injection point. */
  selector: string;
  /** Whether the injected value was confirmed present in a live DOM snapshot. */
  confirmed_in_dom: boolean;
  /** run_id of the most recent verification pass that checked this entry. */
  last_verified_run_id: string;
}

// ── 5. GuardrailDecision ─────────────────────────────────────────────────────

/**
 * Records the outcome of a guardrail check at a pipeline stage, controlling
 * whether execution may advance and providing a typed reason when blocked.
 */
export interface GuardrailDecision {
  /** Run identifier this decision applies to. */
  run_id: string;
  /** Pipeline stage that was evaluated (e.g. "pre-apply", "post-verify"). */
  stage: string;
  /** True if the pipeline is permitted to proceed past this stage. */
  allowed: boolean;
  /**
   * Human-readable explanation of why the pipeline was blocked.
   * Present only when allowed is false.
   */
  blocked_reason?: string;
  /**
   * The next pipeline stage to execute if allowed is true.
   * Undefined if this is the terminal stage or the pipeline is blocked.
   */
  next_stage?: string;
}
