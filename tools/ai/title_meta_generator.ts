/**
 * tools/ai/title_meta_generator.ts
 *
 * AI-powered title and meta description generator for VAEO Tracer.
 * Calls Claude claude-sonnet-4-20250514 to generate SEO-optimised titles and meta descriptions,
 * then updates tracer_field_snapshots.proposed_value for matching rows.
 *
 * Design:
 *   - Injectable deps.callAI for all Claude API calls (mock in tests)
 *   - Injectable deps.updateSnapshot for database writes (mock in tests)
 *   - Server-side character enforcement — never trusts AI to count
 *   - Batch processing in groups of 10 with sequential execution per batch
 *   - Never throws — individual failures are captured in results
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type PageType = 'product' | 'collection' | 'page' | 'article' | 'index';

export interface GenerateParams {
  url:           string;
  current_title: string;
  product_name:  string;
  keywords:      string[];
  page_type:     PageType;
  brand_name?:   string;
}

export interface TitleResult {
  url:            string;
  proposed_title: string;
  reasoning:      string;
  char_count:     number;
  confidence:     number;
  error?:         string;
}

export interface MetaResult {
  url:           string;
  proposed_meta: string;
  reasoning:     string;
  char_count:    number;
  confidence:    number;
  error?:        string;
}

export interface BatchResult {
  url:    string;
  title:  TitleResult;
  meta:   MetaResult;
}

/** Shape returned by Claude API after JSON parsing. */
export interface AIResponse {
  generated_text:   string;
  confidence_score: number;
  reasoning:        string;
}

// ── Injectable deps ─────────────────────────────────────────────────────────

export interface TitleMetaDeps {
  /** Call Claude API with a system prompt and user prompt. Returns parsed JSON. */
  callAI: (systemPrompt: string, userPrompt: string) => Promise<AIResponse>;
  /** Update tracer_field_snapshots.proposed_value for a given url + field_type. */
  updateSnapshot: (url: string, fieldType: string, proposedValue: string) => Promise<void>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = 'You are a Shopify SEO expert. Return ONLY valid JSON, no prose.';

const TITLE_MIN = 50;
const TITLE_MAX = 60;
const META_MIN  = 120;
const META_MAX  = 155;

const BATCH_SIZE = 10;

// ── Character enforcement ───────────────────────────────────────────────────

/**
 * Truncates text at the last word boundary at or before `limit` characters.
 * Server-side enforcement — never relies on AI to count characters.
 */
export function truncateAtWordBoundary(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const candidate = text.slice(0, limit);
  const lastSpace = candidate.lastIndexOf(' ');
  return (lastSpace > 0 ? candidate.slice(0, lastSpace) : candidate).trimEnd();
}

// ── Prompt builders ─────────────────────────────────────────────────────────

function buildTitlePrompt(params: GenerateParams): string {
  const keywordList = params.keywords.length > 0
    ? `Target keywords: ${params.keywords.slice(0, 5).join(', ')}`
    : 'No keyword data available — focus on clarity and relevance.';

  const brand = params.brand_name ?? '';

  return `Generate a meta title for this ${params.page_type} page.

URL: ${params.url}
Current title: ${params.current_title || '(none)'}
Product/page name: ${params.product_name}
${keywordList}
Brand name: ${brand}

Rules:
- Title MUST be between ${TITLE_MIN} and ${TITLE_MAX} characters (count carefully).
- Put the primary keyword FIRST in the title.
- Include the brand name at the END separated by " | " or " - " only if it fits within the limit.
- Be specific and compelling — do not use generic filler words.
- Return ONLY valid JSON with this exact shape:
{"generated_text": "...", "confidence_score": 0.0, "reasoning": "..."}`;
}

function buildMetaPrompt(params: GenerateParams): string {
  const keywordList = params.keywords.length > 0
    ? `Target keywords: ${params.keywords.slice(0, 5).join(', ')}`
    : 'No keyword data available — focus on clarity and relevance.';

  const brand = params.brand_name ?? '';

  return `Generate a meta description for this ${params.page_type} page.

URL: ${params.url}
Current title: ${params.current_title || '(none)'}
Product/page name: ${params.product_name}
${keywordList}
Brand name: ${brand}

Rules:
- Description MUST be between ${META_MIN} and ${META_MAX} characters (count carefully).
- Include the primary keyword naturally within the first 50 characters.
- Make it action-oriented — use verbs like "Shop", "Discover", "Browse", "Learn".
- End with a clear call to action or value proposition.
- Return ONLY valid JSON with this exact shape:
{"generated_text": "...", "confidence_score": 0.0, "reasoning": "..."}`;
}

// ── Real deps ───────────────────────────────────────────────────────────────

async function realCallAI(systemPrompt: string, userPrompt: string): Promise<AIResponse> {
  const apiKey = process.env['ANTHROPIC_API_KEY'] ?? '';
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 256,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Anthropic API ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json() as {
    content: Array<{ type: string; text: string }>;
  };

  let text = data.content.find((c) => c.type === 'text')?.text ?? '';
  // Strip markdown code fences if present (```json ... ```)
  text = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  return JSON.parse(text) as AIResponse;
}

async function realUpdateSnapshot(url: string, fieldType: string, proposedValue: string): Promise<void> {
  const { getConfig }    = await import('../../packages/core/config.js');
  const { createClient } = await import('@supabase/supabase-js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false },
  });
  const { error } = await db
    .from('tracer_field_snapshots')
    .update({ proposed_value: proposedValue })
    .eq('url', url)
    .eq('field_type', fieldType);
  if (error) throw new Error(`snapshot update failed: ${error.message}`);
}

function defaultDeps(): TitleMetaDeps {
  return {
    callAI:         realCallAI,
    updateSnapshot: realUpdateSnapshot,
  };
}

// ── Core generators ─────────────────────────────────────────────────────────

/**
 * Generate an SEO title for a single URL.
 * Enforces character limits server-side after AI generation.
 */
export async function generateTitle(
  params:    GenerateParams,
  _testDeps?: Partial<TitleMetaDeps>,
): Promise<TitleResult> {
  const deps = { ...defaultDeps(), ..._testDeps };

  try {
    const prompt = buildTitlePrompt(params);
    const raw = await deps.callAI(SYSTEM_PROMPT, prompt);

    // Server-side truncation at word boundary
    const proposed = truncateAtWordBoundary(raw.generated_text.trim(), TITLE_MAX);
    const confidence = Math.min(1, Math.max(0, raw.confidence_score));

    // Write to tracer_field_snapshots
    await deps.updateSnapshot(params.url, 'title', proposed);

    return {
      url:            params.url,
      proposed_title: proposed,
      reasoning:      raw.reasoning,
      char_count:     proposed.length,
      confidence,
    };
  } catch (err) {
    return {
      url:            params.url,
      proposed_title: '',
      reasoning:      '',
      char_count:     0,
      confidence:     0,
      error:          err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Generate a meta description for a single URL.
 * Enforces character limits server-side after AI generation.
 */
export async function generateMetaDescription(
  params:    GenerateParams,
  _testDeps?: Partial<TitleMetaDeps>,
): Promise<MetaResult> {
  const deps = { ...defaultDeps(), ..._testDeps };

  try {
    const prompt = buildMetaPrompt(params);
    const raw = await deps.callAI(SYSTEM_PROMPT, prompt);

    // Server-side truncation at word boundary
    const proposed = truncateAtWordBoundary(raw.generated_text.trim(), META_MAX);
    const confidence = Math.min(1, Math.max(0, raw.confidence_score));

    // Write to tracer_field_snapshots
    await deps.updateSnapshot(params.url, 'meta_description', proposed);

    return {
      url:           params.url,
      proposed_meta: proposed,
      reasoning:     raw.reasoning,
      char_count:    proposed.length,
      confidence,
    };
  } catch (err) {
    return {
      url:           params.url,
      proposed_meta: '',
      reasoning:     '',
      char_count:    0,
      confidence:    0,
      error:         err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Batch-generate titles and meta descriptions for multiple URLs.
 * Processes in batches of 10 to respect API rate limits.
 * Each URL gets both a title and meta description generated.
 */
export async function generateTitleMetaBatch(
  urls:       GenerateParams[],
  _testDeps?: Partial<TitleMetaDeps>,
): Promise<BatchResult[]> {
  const results: BatchResult[] = [];

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);

    // Process each item in the batch concurrently
    const batchResults = await Promise.all(
      batch.map(async (params) => {
        const [title, meta] = await Promise.all([
          generateTitle(params, _testDeps),
          generateMetaDescription(params, _testDeps),
        ]);
        return { url: params.url, title, meta };
      }),
    );

    results.push(...batchResults);
  }

  return results;
}
