/**
 * tools/reasoning/generate_block.ts
 *
 * Reasoning Block engine — given an action_queue row (plus sibling context),
 * produces a structured ReasoningBlock explaining *why* a fix is proposed,
 * what the options are, and what the trade-offs look like.
 *
 * The block is stored in action_queue.reasoning_block (JSONB, added in migration 008).
 *
 * Pure logic — no I/O. Injectable deps for Supabase reads/writes so the
 * module is fully testable without a database.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ActionRow {
  id:                string;
  run_id:            string;
  tenant_id:         string;
  site_id:           string;
  issue_type:        string;
  url:               string;
  risk_score:        number;
  priority:          number;
  proposed_fix:      Record<string, unknown>;
  approval_required: boolean;
  execution_status:  string;
}

export interface Option {
  label:       string;
  description: string;
  risk_delta:  number;   // +/- shift from base risk_score
  effort:      'low' | 'medium' | 'high';
  tradeoff:    string;
}

export interface ReasoningBlock {
  detected:            { issue: string; current_value: string | null };
  why:                 string;
  proposed:            { change: string; target_value: string | null };
  risk_score:          number;   // 1–10
  blast_radius:        number;   // count of URLs affected
  dependency_check:    string[]; // blocking issue_types on same URL
  visual_change_flag:  boolean;
  options:             Option[]; // min 2
  recommended_option:  string;   // label of recommended option
  confidence:          number;   // 0.0–1.0
}

// ── Injectable deps ──────────────────────────────────────────────────────────

export interface ReasoningDeps {
  /** Count how many action_queue rows share the same URL within this run. */
  countUrlsAffected: (runId: string, siteId: string, issueType: string) => Promise<number>;
  /** Return issue_types of other open issues on the same URL within this run. */
  findSiblingIssues: (runId: string, url: string, excludeId: string) => Promise<string[]>;
  /** Persist the reasoning_block on the action_queue row. */
  storeBlock: (actionId: string, block: ReasoningBlock) => Promise<void>;
}

// ── Issue-type metadata ──────────────────────────────────────────────────────

interface IssueMeta {
  label:              string;
  rule:               string;
  defaultChange:      string;
  visualChange:       boolean;
  baseConfidence:     number;
  optionGenerator:    (row: ActionRow) => Option[];
}

const ISSUE_META: Record<string, IssueMeta> = {
  // ── Technical errors ─────────────────────────────────────────────────────
  ERR_404: {
    label:          'Page returns HTTP 404',
    rule:           'HTTP status detector found a 404 response',
    defaultChange:  'Set up a 301 redirect to the most relevant live page',
    visualChange:   false,
    baseConfidence: 0.85,
    optionGenerator: () => [
      { label: 'Redirect to closest match', description: 'Create a 301 redirect to the most relevant existing page', risk_delta: 0, effort: 'low', tradeoff: 'Quick fix; may not perfectly match user intent' },
      { label: 'Restore original page', description: 'Recreate the page content if it was removed accidentally', risk_delta: -2, effort: 'high', tradeoff: 'Best UX but requires content recreation' },
      { label: 'Redirect to homepage', description: 'Redirect to the site homepage as a fallback', risk_delta: +1, effort: 'low', tradeoff: 'Easiest but loses page-specific SEO value' },
    ],
  },
  ERR_500: {
    label:          'Page returns HTTP 5xx server error',
    rule:           'HTTP status detector found a server error response',
    defaultChange:  'Investigate and fix the server-side error',
    visualChange:   false,
    baseConfidence: 0.70,
    optionGenerator: () => [
      { label: 'Fix server error', description: 'Debug and resolve the server-side issue causing the error', risk_delta: -3, effort: 'high', tradeoff: 'Proper fix but requires developer investigation' },
      { label: 'Temporary redirect', description: 'Redirect to a working page while the issue is diagnosed', risk_delta: +1, effort: 'low', tradeoff: 'Stops error from impacting SEO; not a permanent solution' },
    ],
  },
  ERR_REDIRECT_CHAIN: {
    label:          'Redirect chain detected (>2 hops)',
    rule:           'Redirect detector found a chain with more than 2 hops',
    defaultChange:  'Consolidate redirect chain to a single 301',
    visualChange:   false,
    baseConfidence: 0.95,
    optionGenerator: () => [
      { label: 'Flatten to single redirect', description: 'Replace the chain with a direct 301 from source to final destination', risk_delta: -1, effort: 'low', tradeoff: 'Clean solution; requires access to redirect rules' },
      { label: 'Update internal links', description: 'Change internal links to point directly to the final URL', risk_delta: -2, effort: 'medium', tradeoff: 'Better long-term but more pages to update' },
    ],
  },
  ERR_BROKEN_INTERNAL_LINK: {
    label:          'Internal link points to a 404 page',
    rule:           'Link checker found an internal link whose target returns 404',
    defaultChange:  'Update the link href to point to a valid page',
    visualChange:   false,
    baseConfidence: 0.90,
    optionGenerator: () => [
      { label: 'Update link target', description: 'Change the href to point to the correct live page', risk_delta: 0, effort: 'low', tradeoff: 'Direct fix; need to identify correct target' },
      { label: 'Remove broken link', description: 'Remove the link entirely if the content is no longer relevant', risk_delta: +1, effort: 'low', tradeoff: 'Loses navigation path; may affect UX' },
    ],
  },

  // ── Canonicals ───────────────────────────────────────────────────────────
  CANONICAL_MISSING: {
    label:          'Missing canonical tag',
    rule:           'Page has no <link rel="canonical"> element',
    defaultChange:  'Add self-referencing canonical tag',
    visualChange:   false,
    baseConfidence: 0.95,
    optionGenerator: (row) => [
      { label: 'Add self-referencing canonical', description: `Add <link rel="canonical" href="${row.url}">`, risk_delta: 0, effort: 'low', tradeoff: 'Standard best practice; no ranking risk' },
      { label: 'Canonical to preferred URL', description: 'Point canonical to a preferred version if duplicates exist', risk_delta: +1, effort: 'medium', tradeoff: 'Better for dedup but requires analysis of duplicate pages' },
    ],
  },
  CANONICAL_MISMATCH: {
    label:          'Canonical URL does not match page URL',
    rule:           'Canonical tag points to a different URL than the current page',
    defaultChange:  'Fix canonical to match the page URL or confirm the redirect intent',
    visualChange:   false,
    baseConfidence: 0.80,
    optionGenerator: () => [
      { label: 'Fix canonical to self', description: 'Update canonical to point to the current page URL', risk_delta: 0, effort: 'low', tradeoff: 'Safe if this page should be indexed independently' },
      { label: 'Confirm consolidation', description: 'Keep current canonical if intentionally consolidating to another URL', risk_delta: -1, effort: 'low', tradeoff: 'Correct if pages are intentional duplicates' },
    ],
  },
  CANONICAL_RELATIVE: {
    label:          'Canonical tag uses a relative URL',
    rule:           'Canonical tag href is relative instead of absolute',
    defaultChange:  'Convert canonical href to an absolute URL',
    visualChange:   false,
    baseConfidence: 0.98,
    optionGenerator: () => [
      { label: 'Make canonical absolute', description: 'Prefix the canonical href with the full domain', risk_delta: -1, effort: 'low', tradeoff: 'Simple fix; universally recommended' },
      { label: 'Replace with self-referencing', description: 'Replace with a full self-referencing canonical', risk_delta: 0, effort: 'low', tradeoff: 'Slightly broader change but equally safe' },
    ],
  },
  CANONICAL_REDIRECT: {
    label:          'Canonical URL redirects',
    rule:           'The canonical target URL itself returns a redirect',
    defaultChange:  'Update canonical to point to the final destination URL',
    visualChange:   false,
    baseConfidence: 0.90,
    optionGenerator: () => [
      { label: 'Point to final URL', description: 'Update canonical href to the redirect\'s final destination', risk_delta: 0, effort: 'low', tradeoff: 'Fixes the redirect chain signal' },
      { label: 'Remove redirect', description: 'Fix the redirect so the canonical target resolves directly', risk_delta: -1, effort: 'medium', tradeoff: 'Cleaner but requires server-side redirect changes' },
    ],
  },
  CANONICAL_CHAIN: {
    label:          'Canonical chain detected',
    rule:           'Canonical points to a page whose canonical points elsewhere',
    defaultChange:  'Update canonical to point to the final canonical target',
    visualChange:   false,
    baseConfidence: 0.90,
    optionGenerator: () => [
      { label: 'Point to final target', description: 'Set canonical directly to the end of the chain', risk_delta: 0, effort: 'low', tradeoff: 'Resolves chain; straightforward fix' },
      { label: 'Self-reference instead', description: 'Set canonical to self if this is the preferred page', risk_delta: +1, effort: 'low', tradeoff: 'Only correct if this page should be the canonical version' },
    ],
  },

  // ── Content / metadata ───────────────────────────────────────────────────
  META_TITLE_MISSING: {
    label:          'Missing <title> tag',
    rule:           'Page has no <title> element or title is empty',
    defaultChange:  'Add a descriptive, keyword-optimised title tag',
    visualChange:   true,
    baseConfidence: 0.85,
    optionGenerator: (row) => {
      const keywords = row.proposed_fix['top_keywords'] as Array<{ query: string }> | undefined;
      const kwHint = keywords?.[0]?.query ? ` incorporating "${keywords[0].query}"` : '';
      return [
        { label: 'Generate from page content', description: `Create a title from the page heading and content${kwHint}`, risk_delta: 0, effort: 'low', tradeoff: 'Automated; may need human refinement for brand voice' },
        { label: 'Manual title creation', description: 'Flag for manual title writing by content team', risk_delta: -2, effort: 'high', tradeoff: 'Best quality but slower to deploy' },
      ];
    },
  },
  META_TITLE_LONG: {
    label:          'Title tag exceeds 60 characters',
    rule:           'Title tag length exceeds the recommended 60-character limit',
    defaultChange:  'Shorten the title to under 60 characters while preserving key terms',
    visualChange:   true,
    baseConfidence: 0.90,
    optionGenerator: () => [
      { label: 'Truncate intelligently', description: 'Shorten the title keeping primary keywords at the front', risk_delta: 0, effort: 'low', tradeoff: 'Quick; may lose some brand terms' },
      { label: 'Rewrite title', description: 'Craft a new concise title optimised for the primary keyword', risk_delta: +1, effort: 'medium', tradeoff: 'Better quality but higher effort and risk of meaning change' },
    ],
  },
  META_TITLE_DUPLICATE: {
    label:          'Duplicate title tag',
    rule:           'Multiple pages share the same <title> content',
    defaultChange:  'Create unique titles for each page reflecting their distinct content',
    visualChange:   true,
    baseConfidence: 0.80,
    optionGenerator: () => [
      { label: 'Differentiate with page-specific terms', description: 'Append or prepend page-specific keywords to make titles unique', risk_delta: 0, effort: 'low', tradeoff: 'Automated; titles may feel formulaic' },
      { label: 'Manual rewrite per page', description: 'Write custom unique titles for each affected page', risk_delta: -1, effort: 'high', tradeoff: 'Best quality but labour-intensive' },
    ],
  },
  META_DESC_MISSING: {
    label:          'Missing meta description',
    rule:           'Page has no <meta name="description"> tag or it is empty',
    defaultChange:  'Add a compelling meta description summarising the page content',
    visualChange:   true,
    baseConfidence: 0.85,
    optionGenerator: (row) => {
      const keywords = row.proposed_fix['top_keywords'] as Array<{ query: string }> | undefined;
      const kwHint = keywords?.[0]?.query ? ` targeting "${keywords[0].query}"` : '';
      return [
        { label: 'Generate from page content', description: `Create a meta description from page content${kwHint}`, risk_delta: 0, effort: 'low', tradeoff: 'Automated; may not capture best call-to-action' },
        { label: 'Manual description', description: 'Flag for manual copywriting', risk_delta: -2, effort: 'high', tradeoff: 'Highest quality but slow to scale' },
      ];
    },
  },
  META_DESC_LONG: {
    label:          'Meta description exceeds 155 characters',
    rule:           'Meta description length exceeds the recommended 155-character limit',
    defaultChange:  'Shorten the description to under 155 characters',
    visualChange:   true,
    baseConfidence: 0.90,
    optionGenerator: () => [
      { label: 'Trim to 155 characters', description: 'Truncate at the nearest sentence boundary under 155 characters', risk_delta: 0, effort: 'low', tradeoff: 'Quick fix; may lose secondary messaging' },
      { label: 'Rewrite description', description: 'Write a new concise description optimised for click-through', risk_delta: +1, effort: 'medium', tradeoff: 'Better quality but more effort' },
    ],
  },
  H1_MISSING: {
    label:          'Missing <h1> tag',
    rule:           'Page has no <h1> heading element',
    defaultChange:  'Add an H1 heading that describes the page content',
    visualChange:   true,
    baseConfidence: 0.85,
    optionGenerator: () => [
      { label: 'Generate from page title', description: 'Create an H1 derived from the page title or primary content', risk_delta: 0, effort: 'low', tradeoff: 'Quick; may duplicate title tag content' },
      { label: 'Custom H1 creation', description: 'Write a unique H1 distinct from the title', risk_delta: -1, effort: 'medium', tradeoff: 'Better for SEO variety but needs content input' },
    ],
  },
  H1_DUPLICATE: {
    label:          'Multiple <h1> tags on page',
    rule:           'Page contains more than one <h1> heading element',
    defaultChange:  'Demote extra H1s to H2 and keep a single primary H1',
    visualChange:   true,
    baseConfidence: 0.90,
    optionGenerator: () => [
      { label: 'Demote extras to H2', description: 'Keep the first H1 and change subsequent H1s to H2', risk_delta: 0, effort: 'low', tradeoff: 'Minimal risk; may change visual heading size' },
      { label: 'Merge into single H1', description: 'Combine H1 content into one comprehensive heading', risk_delta: +1, effort: 'medium', tradeoff: 'Cleaner but alters page heading structure more significantly' },
    ],
  },

  // ── Images ───────────────────────────────────────────────────────────────
  IMG_ALT_MISSING: {
    label:          'Image missing alt text',
    rule:           'Image element has no alt attribute or it is empty',
    defaultChange:  'Add descriptive alt text based on the image content and context',
    visualChange:   false,
    baseConfidence: 0.80,
    optionGenerator: () => [
      { label: 'Auto-generate alt text', description: 'Generate alt text from surrounding content and filename', risk_delta: 0, effort: 'low', tradeoff: 'Scalable but may not be perfectly descriptive' },
      { label: 'Manual alt text', description: 'Flag for manual alt text writing', risk_delta: -2, effort: 'high', tradeoff: 'Most accurate but does not scale' },
    ],
  },
  IMG_DIMENSIONS_MISSING: {
    label:          'Image missing width/height attributes',
    rule:           'Image element lacks explicit width and height attributes',
    defaultChange:  'Add width and height attributes to prevent layout shift',
    visualChange:   false,
    baseConfidence: 0.95,
    optionGenerator: () => [
      { label: 'Add intrinsic dimensions', description: 'Set width/height to the image\'s natural dimensions', risk_delta: 0, effort: 'low', tradeoff: 'Prevents CLS; no visual change if CSS handles sizing' },
      { label: 'Use aspect-ratio CSS', description: 'Add CSS aspect-ratio instead of explicit dimensions', risk_delta: +1, effort: 'medium', tradeoff: 'More flexible but requires CSS changes' },
    ],
  },

  // ── Schema ───────────────────────────────────────────────────────────────
  SCHEMA_MISSING: {
    label:          'No JSON-LD structured data',
    rule:           'Page has no JSON-LD structured data block',
    defaultChange:  'Add appropriate JSON-LD schema based on page type',
    visualChange:   false,
    baseConfidence: 0.80,
    optionGenerator: () => [
      { label: 'Add auto-detected schema', description: 'Generate JSON-LD based on detected page type (Product, Article, etc.)', risk_delta: 0, effort: 'low', tradeoff: 'Automated; may miss niche schema types' },
      { label: 'Manual schema creation', description: 'Craft custom JSON-LD with all recommended properties', risk_delta: -1, effort: 'high', tradeoff: 'Most complete but requires schema expertise' },
    ],
  },
  SCHEMA_INVALID_JSON: {
    label:          'Invalid JSON-LD structured data',
    rule:           'JSON-LD block contains invalid JSON that cannot be parsed',
    defaultChange:  'Fix JSON syntax errors in the structured data block',
    visualChange:   false,
    baseConfidence: 0.92,
    optionGenerator: () => [
      { label: 'Auto-fix JSON syntax', description: 'Correct JSON syntax errors (missing commas, quotes, brackets)', risk_delta: 0, effort: 'low', tradeoff: 'Quick fix; assumes structure is otherwise correct' },
      { label: 'Regenerate schema', description: 'Replace with a freshly generated valid JSON-LD block', risk_delta: +1, effort: 'medium', tradeoff: 'Clean slate but may lose custom properties' },
    ],
  },
  SCHEMA_DUPLICATE: {
    label:          'Duplicate JSON-LD schema type',
    rule:           'Page has multiple JSON-LD blocks with the same @type',
    defaultChange:  'Merge or remove duplicate JSON-LD blocks',
    visualChange:   false,
    baseConfidence: 0.88,
    optionGenerator: () => [
      { label: 'Merge into single block', description: 'Combine duplicate blocks into one comprehensive JSON-LD', risk_delta: 0, effort: 'medium', tradeoff: 'Preserves all data; merge logic may need review' },
      { label: 'Remove duplicates', description: 'Keep the most complete block and remove others', risk_delta: +1, effort: 'low', tradeoff: 'Simple but may lose data from removed blocks' },
    ],
  },
};

// ── Fallback for unknown issue types ─────────────────────────────────────────

function fallbackMeta(issueType: string): IssueMeta {
  return {
    label:          issueType.replace(/_/g, ' ').toLowerCase(),
    rule:           `Detector rule triggered for ${issueType}`,
    defaultChange:  `Apply recommended fix for ${issueType}`,
    visualChange:   false,
    baseConfidence: 0.60,
    optionGenerator: () => [
      { label: 'Apply automated fix', description: 'Apply the system-recommended fix', risk_delta: 0, effort: 'low', tradeoff: 'Fast but may need human review' },
      { label: 'Manual review', description: 'Flag for manual investigation and fix', risk_delta: -3, effort: 'high', tradeoff: 'Safest but slowest' },
    ],
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract a human-readable "current value" from the proposed_fix or issue details. */
function extractCurrentValue(row: ActionRow): string | null {
  const fix = row.proposed_fix;
  // Common detector patterns: current_title, current_description, current_h1, current_value
  for (const key of ['current_title', 'current_description', 'current_h1', 'current_value', 'current_alt', 'current_src']) {
    if (typeof fix[key] === 'string') return fix[key] as string;
  }
  // For errors, the URL itself is the "current value"
  if (row.issue_type.startsWith('ERR_')) return row.url;
  return null;
}

/** Extract the proposed target value from proposed_fix. */
function extractTargetValue(row: ActionRow): string | null {
  const fix = row.proposed_fix;
  for (const key of ['new_title', 'new_description', 'new_h1', 'new_value', 'new_alt', 'target_url', 'redirect_target']) {
    if (typeof fix[key] === 'string') return fix[key] as string;
  }
  return null;
}

/** Clamp a number between min and max. */
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ── Core generator ───────────────────────────────────────────────────────────

/**
 * Generate a ReasoningBlock for a single action_queue row.
 *
 * Pure logic — all I/O goes through `deps`.
 */
export async function generateReasoningBlock(
  row: ActionRow,
  deps: ReasoningDeps,
): Promise<ReasoningBlock> {
  const meta = ISSUE_META[row.issue_type] ?? fallbackMeta(row.issue_type);

  // Parallel I/O
  const [blastRadius, siblings] = await Promise.all([
    deps.countUrlsAffected(row.run_id, row.site_id, row.issue_type),
    deps.findSiblingIssues(row.run_id, row.url, row.id),
  ]);

  const options = meta.optionGenerator(row);
  const recommendedOption = options[0].label;

  // Confidence adjustments:
  //   - many siblings on the same URL → slightly lower (complex page)
  //   - high blast radius → slightly lower (widespread change)
  //   - low risk score → slightly higher (safer fix)
  let confidence = meta.baseConfidence;
  if (siblings.length > 3) confidence -= 0.05;
  if (blastRadius > 50)    confidence -= 0.05;
  if (row.risk_score <= 2) confidence += 0.05;
  if (row.risk_score >= 8) confidence -= 0.05;
  confidence = clamp(Number(confidence.toFixed(2)), 0.0, 1.0);

  const block: ReasoningBlock = {
    detected: {
      issue:         meta.label,
      current_value: extractCurrentValue(row),
    },
    why:                meta.rule,
    proposed: {
      change:       meta.defaultChange,
      target_value: extractTargetValue(row),
    },
    risk_score:         row.risk_score,
    blast_radius:       blastRadius,
    dependency_check:   siblings,
    visual_change_flag: meta.visualChange,
    options,
    recommended_option: recommendedOption,
    confidence,
  };

  // Persist
  await deps.storeBlock(row.id, block);

  return block;
}

/**
 * Batch-generate reasoning blocks for multiple action_queue rows.
 * Processes sequentially to avoid overwhelming the database.
 */
export async function generateReasoningBlocks(
  rows: ActionRow[],
  deps: ReasoningDeps,
): Promise<ReasoningBlock[]> {
  const blocks: ReasoningBlock[] = [];
  for (const row of rows) {
    blocks.push(await generateReasoningBlock(row, deps));
  }
  return blocks;
}
