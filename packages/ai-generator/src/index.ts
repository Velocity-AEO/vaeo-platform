/**
 * packages/ai-generator/src/index.ts
 *
 * AI content generator for Velocity AEO.
 *
 * Writes missing or duplicate SEO content — titles, meta descriptions,
 * and ALT text — using the Anthropic Claude API. Every output is gated
 * by three enforced guardrails before it touches the action queue:
 *
 *   1. Character limit enforcement — server-side trim after generation.
 *      Titles: 60 chars, word boundary. Meta: 155 chars, sentence boundary.
 *      ALT: 125 chars, word boundary.
 *
 *   2. Confidence threshold routing.
 *      score >= 0.7 → auto_deploy eligible.
 *      score <  0.7 → approval_required = true.
 *      score <  0.5 → fix_source = 'manual', human authoring flag.
 *
 *   3. Prompt template library — all calls use versioned templates.
 *      Never freeform prompts.
 *
 * Caching: Redis 7-day TTL, key = {tenant_id}:{url}:{issue_type}.
 * Rate limiting: max 10 concurrent API calls; 100ms back-off on 429.
 * Fallback: API failure → fix_source='manual', never throws.
 */

import type { CmsType } from '../../core/types.js';
import { createLogger } from '../../action-log/src/index.js';

// ── Issue types ───────────────────────────────────────────────────────────────

export type GeneratorIssueType =
  | 'META_TITLE_MISSING'
  | 'META_TITLE_DUPLICATE'
  | 'META_DESC_MISSING'
  | 'META_DESC_DUPLICATE'
  | 'IMG_ALT_MISSING';

// ── GenerateRequest / GenerateResult ─────────────────────────────────────────

export interface GenerateRequest {
  run_id:          string;
  tenant_id:       string;
  site_id:         string;
  cms:             CmsType;
  url:             string;
  issue_type:      GeneratorIssueType;
  /** Existing content — present for DUPLICATE variants. */
  current_value?:  string;
  /** First 500 chars of page body text. */
  page_content:    string;
  /** Top 3 GSC keywords by impressions for this URL. */
  gsc_keywords:    string[];
  brand_name:      string;
  character_limit: number;
  /** Optional image src — used for IMG_ALT_MISSING. */
  image_src?:      string;
}

export interface GenerateResult {
  generated_text:    string;
  confidence_score:  number;
  reasoning:         string;
  fix_source:        'ai_suggested' | 'manual';
  approval_required: boolean;
  issue_type:        string;
  url:               string;
}

// ── Prompt templates (versioned) ──────────────────────────────────────────────

/**
 * Versioned prompt template library.
 * All API calls use exactly one of these — no freeform prompts allowed.
 * Templates use {placeholder} syntax; renderTemplate() fills them.
 */
export const PROMPT_TEMPLATES_V1: Readonly<Record<GeneratorIssueType, string>> = {
  META_TITLE_MISSING: `You are an SEO expert writing a page title.
Page URL: {url}
Brand: {brand_name}
Top keywords this page ranks for: {gsc_keywords}
Page content excerpt: {page_content}

Write a page title that:
- Includes the most important keyword naturally
- Is unique and descriptive
- Is under {character_limit} characters
- Does not keyword stuff

Respond with JSON only, no preamble:
{"generated_text": "...", "confidence_score": 0.0-1.0, "reasoning": "..."}`,

  META_TITLE_DUPLICATE: `You are an SEO expert fixing a duplicate page title.
Page URL: {url}
Brand: {brand_name}
Current duplicate title: {current_value}
Top keywords this page ranks for: {gsc_keywords}
Page content excerpt: {page_content}

Write a page title that:
- Is unique to this specific page (not a duplicate of {current_value})
- Highlights page-specific content and differentiators
- Includes the most relevant keyword naturally
- Is under {character_limit} characters
- Does not keyword stuff

Respond with JSON only, no preamble:
{"generated_text": "...", "confidence_score": 0.0-1.0, "reasoning": "..."}`,

  META_DESC_MISSING: `You are an SEO expert writing a meta description.
Page URL: {url}
Brand: {brand_name}
Top keywords this page ranks for: {gsc_keywords}
Page content excerpt: {page_content}

Write a meta description that:
- Includes the primary keyword naturally
- Communicates a clear value proposition
- Includes a soft call to action
- Is under {character_limit} characters
- Accurately represents the page content

Respond with JSON only, no preamble:
{"generated_text": "...", "confidence_score": 0.0-1.0, "reasoning": "..."}`,

  META_DESC_DUPLICATE: `You are an SEO expert fixing a duplicate meta description.
Page URL: {url}
Brand: {brand_name}
Current duplicate description: {current_value}
Top keywords this page ranks for: {gsc_keywords}
Page content excerpt: {page_content}

Write a meta description that:
- Is unique to this specific page (not a duplicate of the current value)
- Communicates a distinct value proposition for this page
- Includes the most relevant keyword naturally
- Includes a soft call to action
- Is under {character_limit} characters

Respond with JSON only, no preamble:
{"generated_text": "...", "confidence_score": 0.0-1.0, "reasoning": "..."}`,

  IMG_ALT_MISSING: `You are writing ALT text for an image.
Image URL: {image_src}
Page URL: {url}
Page content excerpt: {page_content}

Write ALT text that:
- Describes what the image shows
- Is useful for screen readers
- Is under {character_limit} characters
- Does not start with "image of" or "picture of"

Respond with JSON only, no preamble:
{"generated_text": "...", "confidence_score": 0.0-1.0, "reasoning": "..."}`,
} as const;

// ── Template rendering ────────────────────────────────────────────────────────

/** Fills {placeholder} tokens in a template string. */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

// ── Character limit enforcement ───────────────────────────────────────────────

/**
 * Trims text to maxLen characters at a word boundary.
 * If the text is already within limit, returns it unchanged.
 */
export function trimAtWordBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const sub = text.slice(0, maxLen);
  const lastSpace = sub.lastIndexOf(' ');
  return lastSpace > 0 ? sub.slice(0, lastSpace) : sub;
}

/**
 * Trims text to maxLen characters at a sentence boundary (. ! ?).
 * Falls back to word boundary if no sentence end is found in range.
 */
export function trimAtSentenceBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const sub = text.slice(0, maxLen);
  // Find the last sentence-ending punctuation within the window
  const match = sub.match(/^(.*[.!?])\s/s);
  if (match && match[1] && match[1].length > 0) {
    return match[1].trim();
  }
  return trimAtWordBoundary(text, maxLen);
}

/**
 * Enforces the character limit appropriate for the issue_type.
 * Meta descriptions trim at sentence boundary; everything else at word boundary.
 */
export function enforceCharLimit(
  text: string,
  issueType: GeneratorIssueType,
  characterLimit: number,
): string {
  if (issueType === 'META_DESC_MISSING' || issueType === 'META_DESC_DUPLICATE') {
    return trimAtSentenceBoundary(text, characterLimit);
  }
  return trimAtWordBoundary(text, characterLimit);
}

// ── Confidence routing ────────────────────────────────────────────────────────

/** Applies confidence thresholds to produce fix_source and approval_required. */
export function applyConfidenceRouting(confidence: number): {
  fix_source:        'ai_suggested' | 'manual';
  approval_required: boolean;
} {
  if (confidence < 0.5) {
    return { fix_source: 'manual', approval_required: true };
  }
  if (confidence < 0.7) {
    return { fix_source: 'ai_suggested', approval_required: true };
  }
  return { fix_source: 'ai_suggested', approval_required: false };
}

// ── Injectable ops (for testing) ──────────────────────────────────────────────

/** Raw API response shape — exactly what Claude returns in its JSON body. */
export interface ApiResponse {
  generated_text:   string;
  confidence_score: number;
  reasoning:        string;
}

export interface GeneratorOps {
  /** Makes the Anthropic API call. Returns parsed JSON or throws. */
  callApi: (prompt: string) => Promise<ApiResponse>;
  /** Reads from cache. Returns null on miss or error. */
  cacheGet: (key: string) => Promise<GenerateResult | null>;
  /** Writes to cache. Fire-and-forget — never throws. */
  cacheSet: (key: string, value: GenerateResult) => Promise<void>;
}

let _ops: GeneratorOps | null = null;

export function _injectOps(ops: Partial<GeneratorOps>): void {
  _ops = { ...defaultOps(), ...ops };
}

export function _resetOps(): void {
  _ops = null;
}

// ── Rate limiter ──────────────────────────────────────────────────────────────

const MAX_CONCURRENT = 10;
let _activeCount = 0;
const _queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  return new Promise((resolve) => {
    if (_activeCount < MAX_CONCURRENT) {
      _activeCount++;
      resolve();
    } else {
      _queue.push(() => { _activeCount++; resolve(); });
    }
  });
}

function releaseSlot(): void {
  _activeCount = Math.max(0, _activeCount - 1);
  const next = _queue.shift();
  if (next) next();
}

// ── Default ops (real implementations) ───────────────────────────────────────

function defaultOps(): GeneratorOps {
  return {
    callApi: realCallApi,
    cacheGet: realCacheGet,
    cacheSet: realCacheSet,
  };
}

async function realCallApi(prompt: string): Promise<ApiResponse> {
  // Dynamic import so config errors only surface at call time, not module load
  const { config } = await import('../../core/config.js');

  const body = JSON.stringify({
    model:      'claude-sonnet-4-20250514',
    max_tokens: 300,
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }],
  });

  let attempt = 0;
  while (attempt < 2) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         config.anthropic.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body,
    });

    if (res.status === 429) {
      // Rate limit — log and back off once
      process.stdout.write(JSON.stringify({
        stage: 'ai-generator:rate_limit',
        status: 'skipped',
        ts: new Date().toISOString(),
      }) + '\n');
      await new Promise((r) => setTimeout(r, 100));
      attempt++;
      continue;
    }

    if (!res.ok) {
      throw new Error(`Anthropic API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json() as {
      content: Array<{ type: string; text: string }>;
    };
    const text = data.content.find((b) => b.type === 'text')?.text ?? '';
    return JSON.parse(text) as ApiResponse;
  }

  throw new Error('Anthropic API rate limit exceeded after retry');
}

async function realCacheGet(key: string): Promise<GenerateResult | null> {
  try {
    const { config } = await import('../../core/config.js');
    const res = await fetch(
      `${config.upstash.redisRestUrl}/get/${encodeURIComponent(key)}`,
      { headers: { Authorization: `Bearer ${config.upstash.redisRestToken}` } },
    );
    if (!res.ok) return null;
    const body = await res.json() as { result: string | null };
    if (!body.result) return null;
    return JSON.parse(body.result) as GenerateResult;
  } catch {
    return null;
  }
}

async function realCacheSet(key: string, value: GenerateResult): Promise<void> {
  try {
    const { config } = await import('../../core/config.js');
    const TTL = 7 * 24 * 60 * 60; // 7 days in seconds
    await fetch(
      `${config.upstash.redisRestUrl}/set/${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.upstash.redisRestToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: JSON.stringify(value), ex: TTL }),
      },
    );
  } catch {
    // Cache write failure is non-fatal — silently swallow
  }
}

// ── Fallback result ───────────────────────────────────────────────────────────

function fallbackResult(req: GenerateRequest): GenerateResult {
  return {
    generated_text:    '',
    confidence_score:  0,
    reasoning:         'Generation failed — manual authoring required.',
    fix_source:        'manual',
    approval_required: true,
    issue_type:        req.issue_type,
    url:               req.url,
  };
}

// ── Cache key ─────────────────────────────────────────────────────────────────

export function cacheKey(req: GenerateRequest): string {
  return `${req.tenant_id}:${req.url}:${req.issue_type}`;
}

// ── generate ──────────────────────────────────────────────────────────────────

/**
 * Generates missing or duplicate SEO content for a single issue.
 *
 * Guardrails applied in order:
 *   1. Template-based prompt (no freeform).
 *   2. Character limit enforcement (word/sentence boundary trim).
 *   3. Confidence threshold routing (fix_source + approval_required).
 *
 * Never throws. Returns a fallback GenerateResult on any failure.
 */
export async function generate(
  req: GenerateRequest,
  _testOps?: Partial<GeneratorOps>,
): Promise<GenerateResult> {
  const ops: GeneratorOps = _testOps
    ? { ...defaultOps(), ..._testOps }
    : (_ops ?? defaultOps());

  const log = createLogger({
    run_id:    req.run_id,
    tenant_id: req.tenant_id,
    site_id:   req.site_id,
    cms:       req.cms,
    command:   'ai-generator',
    url:       req.url,
  });

  // ── Cache check ──────────────────────────────────────────────────────────
  const key = cacheKey(req);
  try {
    const cached = await ops.cacheGet(key);
    if (cached) {
      log({ stage: 'ai-generator:cache_hit', status: 'ok',
            metadata: { issue_type: req.issue_type } });
      return cached;
    }
  } catch {
    // Cache read failure is non-fatal — proceed to generation
  }

  log({ stage: 'ai-generator:start', status: 'pending',
        metadata: { issue_type: req.issue_type } });

  // ── Build prompt ─────────────────────────────────────────────────────────
  const template = PROMPT_TEMPLATES_V1[req.issue_type];
  const prompt = renderTemplate(template, {
    url:             req.url,
    brand_name:      req.brand_name,
    gsc_keywords:    req.gsc_keywords.join(', '),
    page_content:    req.page_content,
    character_limit: String(req.character_limit),
    current_value:   req.current_value ?? '',
    image_src:       req.image_src ?? '',
  });

  // ── API call with rate limiting ──────────────────────────────────────────
  let apiResp: ApiResponse;
  await acquireSlot();
  try {
    apiResp = await ops.callApi(prompt);
  } catch {
    releaseSlot();
    log({ stage: 'ai-generator:fallback', status: 'failed',
          metadata: { issue_type: req.issue_type, reason: 'api_error' } });
    return fallbackResult(req);
  }
  releaseSlot();

  // ── Validate JSON response ───────────────────────────────────────────────
  if (
    typeof apiResp !== 'object' ||
    typeof apiResp.generated_text !== 'string' ||
    typeof apiResp.confidence_score !== 'number'
  ) {
    log({ stage: 'ai-generator:fallback', status: 'failed',
          metadata: { issue_type: req.issue_type, reason: 'invalid_json' } });
    return fallbackResult(req);
  }

  // ── Confidence < 0.5 → fallback to manual ────────────────────────────────
  if (apiResp.confidence_score < 0.5) {
    log({ stage: 'ai-generator:fallback', status: 'ok',
          metadata: {
            issue_type:       req.issue_type,
            reason:           'low_confidence',
            confidence_score: apiResp.confidence_score,
          } });
    return {
      ...fallbackResult(req),
      confidence_score: apiResp.confidence_score,
      reasoning:        apiResp.reasoning ?? '',
    };
  }

  // ── Guardrail 1: enforce character limit ─────────────────────────────────
  const trimmed = enforceCharLimit(
    apiResp.generated_text,
    req.issue_type,
    req.character_limit,
  );

  // ── Guardrail 2: confidence routing ──────────────────────────────────────
  const { fix_source, approval_required } = applyConfidenceRouting(
    apiResp.confidence_score,
  );

  const result: GenerateResult = {
    generated_text:    trimmed,
    confidence_score:  apiResp.confidence_score,
    reasoning:         apiResp.reasoning ?? '',
    fix_source,
    approval_required,
    issue_type:        req.issue_type,
    url:               req.url,
  };

  log({
    stage:    'ai-generator:complete',
    status:   'ok',
    metadata: {
      issue_type:       req.issue_type,
      confidence_score: result.confidence_score,
      fix_source:       result.fix_source,
      approval_required: result.approval_required,
      char_count:       trimmed.length,
    },
  });

  // ── Cache result (fire-and-forget) ────────────────────────────────────────
  void ops.cacheSet(key, result);

  return result;
}
