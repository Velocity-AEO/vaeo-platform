/**
 * packages/adapters/ai/src/templates/img_alt.ts
 *
 * Versioned prompt template for IMG_ALT_MISSING.
 */

export const IMG_ALT_TEMPLATE_VERSION = '1.0.0';

export interface ImgAltPromptInput {
  image_src:        string;
  surrounding_text: string;
  page_title:       string;
  character_limit:  number;
}

export function buildImgAltPrompt(input: ImgAltPromptInput): string {
  return `You are an accessibility and SEO expert writing an image alt attribute.

Image URL: ${input.image_src}
Page title: ${input.page_title}
Text surrounding the image in the DOM (50 chars before/after):
"""
${input.surrounding_text}
"""
Hard character limit: ${input.character_limit}

Rules:
- Return ONLY valid JSON — no preamble, no markdown fences, no extra text.
- "generated_text": the alt text. Must be under ${input.character_limit} characters.
- Describe what is visually depicted in the image based on the filename and surrounding context.
- Do NOT start with "Image of" or "Photo of" — screen readers already announce it as an image.
- Be concise and descriptive; convey meaning and context.
- "confidence_score": float 0.0–1.0 reflecting how much context was available.
  1.0 = clear image filename + rich surrounding text
  0.6–0.9 = partial context (URL slug meaningful, or surrounding text useful)
  0.3–0.5 = generic filename (img001.jpg) with little surrounding context
  0.1–0.2 = no useful context at all
- "reasoning": one sentence explaining your alt text choice.

Required JSON shape (no other keys):
{"generated_text": "...", "confidence_score": 0.0, "reasoning": "..."}`;
}
