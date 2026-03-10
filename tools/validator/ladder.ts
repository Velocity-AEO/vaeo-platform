/**
 * tools/validator/ladder.ts
 *
 * Minimal-Effort Validator — tries the cheapest fix strategy first,
 * promotes to the next rung only when the lighter one fails proof.
 *
 * Rungs (in order):
 *   1. toggle   — CMS config / boolean toggle (e.g. enable SEO field)
 *   2. metafield — metafield / setting write (e.g. seo.title metafield)
 *   3. snippet  — snippet / block patch (e.g. inject schema block)
 *   4. template — full template file edit (e.g. rewrite product.liquid)
 *
 * At each rung: attempt fix → render → validateSeoFields → if pass, done.
 * If all rungs fail, return { status: 'manual_required' }.
 *
 * All Shopify API calls and file writes are injectable via LadderDeps.
 * Never throws — returns LadderResult with error on failure.
 */

import type { IssueReport } from '../scoring/issue_classifier.js';
import type { SeoFields, ValidationResult } from '../sandbox/liquid_renderer.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type RungName = 'toggle' | 'metafield' | 'snippet' | 'template';

export interface SiteRecord {
  site_id:    string;
  tenant_id:  string;
  cms_type:   'shopify' | 'wordpress';
  site_url:   string;
}

export interface RungAttempt {
  rung:    RungName;
  applied: boolean;
  error?:  string;
}

export interface ProofResult {
  pass:   boolean;
  fields: SeoFields;
  validation: ValidationResult;
}

export interface LadderResult {
  status:          'fixed' | 'manual_required';
  rung_used?:      RungName;
  proof?:          ProofResult;
  rungs_attempted: RungAttempt[];
  error?:          string;
}

// ── Injectable deps ──────────────────────────────────────────────────────────

export interface LadderDeps {
  /** Rung 1: Apply a toggle/config change for the issue. Returns true if applied. */
  applyToggle:    (issue: IssueReport, site: SiteRecord) => Promise<boolean>;
  /** Rung 2: Write a metafield value for the issue. Returns true if applied. */
  applyMetafield: (issue: IssueReport, site: SiteRecord) => Promise<boolean>;
  /** Rung 3: Inject a snippet/block to fix the issue. Returns true if applied. */
  applySnippet:   (issue: IssueReport, site: SiteRecord) => Promise<boolean>;
  /** Rung 4: Edit a template file to fix the issue. Returns true if applied. */
  applyTemplate:  (issue: IssueReport, site: SiteRecord) => Promise<boolean>;
  /** Render the page and extract SEO fields for proof checking. */
  renderAndExtract: (url: string, site: SiteRecord) => Promise<SeoFields>;
  /** Validate extracted SEO fields. */
  validateFields:   (fields: SeoFields) => ValidationResult;
}

// ── Rung registry ────────────────────────────────────────────────────────────

interface Rung {
  name:  RungName;
  apply: (issue: IssueReport, site: SiteRecord, deps: LadderDeps) => Promise<boolean>;
}

const RUNGS: Rung[] = [
  { name: 'toggle',    apply: (issue, site, deps) => deps.applyToggle(issue, site) },
  { name: 'metafield', apply: (issue, site, deps) => deps.applyMetafield(issue, site) },
  { name: 'snippet',   apply: (issue, site, deps) => deps.applySnippet(issue, site) },
  { name: 'template',  apply: (issue, site, deps) => deps.applyTemplate(issue, site) },
];

// ── Proof check ──────────────────────────────────────────────────────────────

/**
 * Check whether the target field passes validation after a fix.
 * Only checks the specific field the issue relates to — other fields
 * may still have issues, but that's a separate concern.
 */
function proofPassesForField(
  validation: ValidationResult,
  issue: IssueReport,
): boolean {
  // If the whole page passes, the field definitely passes.
  if (validation.pass) return true;

  // Otherwise check that no remaining issues match this field.
  return !validation.issues.some((v) => v.field === issue.field);
}

// ── Core ─────────────────────────────────────────────────────────────────────

export async function attemptFix(
  issue: IssueReport,
  site:  SiteRecord,
  deps:  LadderDeps,
): Promise<LadderResult> {
  const rungs_attempted: RungAttempt[] = [];

  for (const rung of RUNGS) {
    // ── Try applying the rung ──────────────────────────────────────────────
    let applied = false;
    try {
      applied = await rung.apply(issue, site, deps);
    } catch (err) {
      rungs_attempted.push({
        rung:    rung.name,
        applied: false,
        error:   err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (!applied) {
      rungs_attempted.push({ rung: rung.name, applied: false });
      continue;
    }

    // ── Proof check ────────────────────────────────────────────────────────
    let fields: SeoFields;
    let validation: ValidationResult;
    try {
      fields     = await deps.renderAndExtract(issue.url, site);
      validation = deps.validateFields(fields);
    } catch (err) {
      rungs_attempted.push({
        rung:    rung.name,
        applied: true,
        error:   `proof check failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    const proof: ProofResult = { pass: false, fields, validation };

    if (proofPassesForField(validation, issue)) {
      proof.pass = true;
      rungs_attempted.push({ rung: rung.name, applied: true });
      return {
        status: 'fixed',
        rung_used: rung.name,
        proof,
        rungs_attempted,
      };
    }

    // Proof failed — record and try next rung.
    rungs_attempted.push({
      rung:    rung.name,
      applied: true,
      error:   'proof check did not pass for target field',
    });
  }

  // All rungs exhausted.
  return {
    status: 'manual_required',
    rungs_attempted,
  };
}
