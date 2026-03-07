/**
 * packages/adapters/ai/src/templates/meta_description.ts
 *
 * Versioned prompt template for META_DESC_MISSING / META_DESC_DUPLICATE.
 */

export const META_DESC_TEMPLATE_VERSION = '1.0.0';

export interface MetaDescPromptInput {
  page_url:        string;
  page_title:      string;
  body_preview:    string;
  top_keywords:    Array<{ query: string; impressions: number; position: number }>;
  brand_name:      string;
  character_limit: number;
}

export function buildMetaDescPrompt(input: MetaDescPromptInput): string {
  const keywordHint =
    input.top_keywords.length > 0
      ? `Top search keywords: ${
          input.top_keywords
            .slice(0, 3)
            .map((k) => `"${k.query}" (${k.impressions} impressions, position ${k.position.toFixed(1)})`)
            .join(', ')
        }. Weave the most relevant keyword in naturally.`
      : 'No keyword data available — focus on value proposition and a clear call to action.';

  return `You are an expert SEO copywriter writing a meta description for a web page.

Page URL: ${input.page_url}
Page title: ${input.page_title}
Brand name: ${input.brand_name}
Hard character limit: ${input.character_limit}

Page content preview (first 500 chars):
"""
${input.body_preview}
"""

${keywordHint}

Rules:
- Return ONLY valid JSON — no preamble, no markdown fences, no extra text.
- "generated_text": the meta description. Must be under ${input.character_limit} characters (count carefully).
- "confidence_score": float 0.0–1.0 reflecting how much useful context was available.
  1.0 = rich page content + keyword data
  0.7–0.9 = decent content, no keywords
  0.4–0.6 = sparse content or very generic page
  0.1–0.3 = almost no usable context
- "reasoning": one sentence explaining your description choice.
- Write in active voice; include a subtle call to action where appropriate.
- Do not start with the brand name or page title verbatim.

Required JSON shape (no other keys):
{"generated_text": "...", "confidence_score": 0.0, "reasoning": "..."}`;
}
