/**
 * packages/adapters/ai/src/index.ts
 *
 * AI content generation adapter for VAEO.
 * Calls Anthropic claude-sonnet-4-20250514 to generate SEO content.
 *
 * Design:
 *   - Injectable ApiFetch for unit tests (no real API calls in tests)
 *   - Never throws — always returns GenerateResult with success flag
 *   - Three guardrails (spec Section 7.1):
 *     1. Server-side char truncation at word boundary (never trust AI to count)
 *     2. confidence_score < 0.7 → caller should set approval_required = true
 *     3. Prompt templates are versioned modules in templates/ subfolder
 */

import {
  buildMetaTitlePrompt,
  META_TITLE_TEMPLATE_VERSION,
} from './templates/meta_title.js';
import {
  buildMetaDescPrompt,
  META_DESC_TEMPLATE_VERSION,
} from './templates/meta_description.js';
import {
  buildImgAltPrompt,
  IMG_ALT_TEMPLATE_VERSION,
} from './templates/img_alt.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TopKeyword {
  query:       string;
  impressions: number;
  position:    number;
}

export interface MetaTitleInput {
  fix_type:        'META_TITLE_MISSING' | 'META_TITLE_DUPLICATE';
  page_url:        string;
  page_title:      string;
  body_preview:    string;
  top_keywords:    TopKeyword[];
  brand_name:      string;
  character_limit: number;
}

export interface MetaDescInput {
  fix_type:        'META_DESC_MISSING' | 'META_DESC_DUPLICATE';
  page_url:        string;
  page_title:      string;
  body_preview:    string;
  top_keywords:    TopKeyword[];
  brand_name:      string;
  character_limit: number;
}

export interface ImgAltInput {
  fix_type:         'IMG_ALT_MISSING';
  image_src:        string;
  surrounding_text: string;
  page_title:       string;
  character_limit:  number;
}

export type GenerateInput = MetaTitleInput | MetaDescInput | ImgAltInput;

export interface GenerateSuccess {
  success:          true;
  generated_text:   string;
  confidence_score: number;
  reasoning:        string;
  fix_type:         string;
  template_version: string;
  /** true if confidence_score < 0.7 — caller should set approval_required = true */
  low_confidence:   boolean;
}

export interface GenerateFailure {
  success: false;
  error:   string;
}

export type GenerateResult = GenerateSuccess | GenerateFailure;

/** Injectable fetch type for unit testing. */
export type ApiFetch = (url: string, init: RequestInit) => Promise<Response>;

// ── Guardrail 1: server-side character truncation ─────────────────────────────

/**
 * Truncates text at the last word boundary at or before `limit` characters.
 * Never relies on the AI to count characters — always enforced server-side.
 */
export function truncateAtWordBoundary(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const candidate = text.slice(0, limit);
  const lastSpace = candidate.lastIndexOf(' ');
  return (lastSpace > 0 ? candidate.slice(0, lastSpace) : candidate).trimEnd();
}

// ── Anthropic API call ────────────────────────────────────────────────────────

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL   = 'claude-sonnet-4-20250514';

async function callAnthropic(
  prompt:   string,
  apiKey:   string,
  apiFetch: ApiFetch,
): Promise<{ generated_text: string; confidence_score: number; reasoning: string }> {
  const resp = await apiFetch(ANTHROPIC_API_URL, {
    method:  'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      ANTHROPIC_MODEL,
      max_tokens: 256,
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Anthropic API ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json() as {
    content: Array<{ type: string; text: string }>;
  };

  const text = data.content.find((c) => c.type === 'text')?.text ?? '';

  // Parse JSON from model response — model is instructed to return only JSON
  const parsed = JSON.parse(text.trim()) as {
    generated_text:   string;
    confidence_score: number;
    reasoning:        string;
  };

  return parsed;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateContent(
  input:     GenerateInput,
  _testOpts?: {
    apiFetch?: ApiFetch;
    apiKey?:   string;
  },
): Promise<GenerateResult> {
  try {
    // Resolve API key — read directly from env (ANTHROPIC_API_KEY via Doppler)
    const apiKey = _testOpts?.apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? '';
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

    const apiFetch: ApiFetch = _testOpts?.apiFetch ?? fetch;

    // Build prompt + pick template version
    let prompt: string;
    let templateVersion: string;

    if (input.fix_type === 'META_TITLE_MISSING' || input.fix_type === 'META_TITLE_DUPLICATE') {
      prompt          = buildMetaTitlePrompt(input);
      templateVersion = META_TITLE_TEMPLATE_VERSION;
    } else if (input.fix_type === 'META_DESC_MISSING' || input.fix_type === 'META_DESC_DUPLICATE') {
      prompt          = buildMetaDescPrompt(input);
      templateVersion = META_DESC_TEMPLATE_VERSION;
    } else {
      // IMG_ALT_MISSING
      prompt          = buildImgAltPrompt(input);
      templateVersion = IMG_ALT_TEMPLATE_VERSION;
    }

    const raw = await callAnthropic(prompt, apiKey, apiFetch);

    // Guardrail 1: server-side character limit enforcement
    const characterLimit = 'character_limit' in input ? input.character_limit : 125;
    const generated_text = truncateAtWordBoundary(raw.generated_text, characterLimit);

    // Guardrail 2: clamp confidence score to [0, 1]
    const confidence_score = Math.min(1, Math.max(0, raw.confidence_score));

    return {
      success:          true,
      generated_text,
      confidence_score,
      reasoning:        raw.reasoning,
      fix_type:         input.fix_type,
      template_version: templateVersion,
      low_confidence:   confidence_score < 0.7,
    };

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}
