/**
 * tools/apply/aeo_apply.ts
 *
 * AEO fix applicator — routes AEO issue types to the appropriate
 * generator (speakable, FAQ, answer block) and injects schema
 * into the Shopify theme via metafield or snippet.
 *
 * Injectable deps for testing. Never throws.
 */

import type { ApprovedItem } from './apply_engine.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AEOApplyResult {
  success:      boolean;
  action?:      string;
  schema_type?: string;
  error?:       string;
}

export interface AEOApplyDeps {
  /** Generate speakable schema. */
  generateSpeakable?: (config: {
    url: string;
    page_title: string;
    page_type: string;
    content_selectors?: string[];
  }) => Promise<{
    schema: Record<string, unknown>;
    liquid_snippet: string;
    confidence: number;
  }>;
  /** Build FAQ schema from HTML + AI. */
  buildFAQSchema?: (
    url: string,
    html: string,
    config: { page_title: string; body_text: string; page_type: string },
  ) => Promise<{
    schema: Record<string, unknown>;
    liquid_snippet: string;
    confidence: number;
    faq_items: Array<{ question: string; answer: string }>;
  }>;
  /** Inject answer schema into HTML. */
  injectAnswerSchema?: (
    html: string,
    opportunity: { url: string; opportunity_type: string; trigger_phrases: string[]; recommended_schema: string; confidence: number },
    content: { items?: string[]; steps?: string[]; definition?: string },
  ) => Promise<{
    html: string;
    schema_injected: Record<string, unknown>;
    liquid_snippet: string;
  }>;
  /** Fetch page HTML for analysis. */
  fetchHTML?: (url: string) => Promise<string>;
  /** Write a Liquid snippet to the Shopify theme. */
  writeSnippet?: (
    creds: { access_token: string; store_url: string },
    snippet: string,
    snippetName: string,
  ) => Promise<{ success: boolean; error?: string }>;
}

// ── Default deps (real implementations) ─────────────────────────────────────

function defaultAEODeps(): AEOApplyDeps {
  return {
    generateSpeakable: async (config) => {
      const { generateSpeakable } = await import('../aeo/speakable_generator.js');
      return generateSpeakable(config);
    },
    buildFAQSchema: async (url, html, config) => {
      const { buildFAQSchema } = await import('../aeo/faq_generator.js');
      return buildFAQSchema(url, html, config);
    },
    injectAnswerSchema: async (html, opportunity, content) => {
      const { injectAnswerSchema } = await import('../aeo/answer_block.js');
      return injectAnswerSchema(html, opportunity as Parameters<typeof injectAnswerSchema>[1], content);
    },
    fetchHTML: async (url) => {
      const res = await fetch(url);
      return res.text();
    },
    writeSnippet: async (creds, snippet, snippetName) => {
      try {
        const host = creds.store_url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
        const { getLiveThemeId } = await import('../schema/snippet_installer.js');
        const themeId = await getLiveThemeId(host, creds.access_token);
        if (!themeId) return { success: false, error: 'No live theme found' };

        const assetKey = `snippets/${snippetName}.liquid`;
        const res = await fetch(
          `https://${host}/admin/api/2024-01/themes/${themeId}/assets.json`,
          {
            method: 'PUT',
            headers: {
              'X-Shopify-Access-Token': creds.access_token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ asset: { key: assetKey, value: snippet } }),
          },
        );
        if (!res.ok) return { success: false, error: `Asset write failed (${res.status})` };
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Apply an AEO fix based on the issue type.
 *
 * SPEAKABLE_MISSING / AEO_SCHEMA_INCOMPLETE → generateSpeakable → write snippet
 * FAQ_OPPORTUNITY → buildFAQSchema → write snippet
 * ANSWER_BLOCK_OPPORTUNITY → injectAnswerSchema → write snippet
 *
 * Never throws.
 */
export async function applyAEOFix(
  item: ApprovedItem,
  creds: { access_token: string; store_url: string },
  _testDeps?: Partial<AEOApplyDeps>,
): Promise<AEOApplyResult> {
  const deps = { ...defaultAEODeps(), ..._testDeps };

  try {
    const issueType = item.issue_type;
    const url       = item.url;
    const pageTitle = (item.proposed_fix['page_title'] as string) ?? '';
    const pageType  = (item.proposed_fix['page_type']  as string) ?? 'page';

    // ── SPEAKABLE_MISSING / AEO_SCHEMA_INCOMPLETE ─────────────────────────
    if (issueType === 'SPEAKABLE_MISSING' || issueType === 'AEO_SCHEMA_INCOMPLETE') {
      if (!deps.generateSpeakable) {
        return { success: false, error: 'generateSpeakable dep not available' };
      }
      const selectors = (item.proposed_fix['content_selectors'] as string[]) ?? undefined;
      const result = await deps.generateSpeakable({
        url,
        page_title: pageTitle,
        page_type:  pageType,
        content_selectors: selectors,
      });

      if (deps.writeSnippet) {
        const wr = await deps.writeSnippet(creds, result.liquid_snippet, 'vaeo-speakable');
        if (!wr.success) {
          return { success: false, action: 'speakable', error: wr.error };
        }
      }

      return {
        success:     true,
        action:      'speakable',
        schema_type: 'SpeakableSpecification',
      };
    }

    // ── FAQ_OPPORTUNITY ───────────────────────────────────────────────────
    if (issueType === 'FAQ_OPPORTUNITY') {
      if (!deps.buildFAQSchema) {
        return { success: false, error: 'buildFAQSchema dep not available' };
      }
      // Fetch page HTML for FAQ extraction
      let html = '';
      if (deps.fetchHTML) {
        try { html = await deps.fetchHTML(url); } catch { /* use empty */ }
      }
      const bodyText = (item.proposed_fix['body_text'] as string) ?? '';

      const result = await deps.buildFAQSchema(url, html, {
        page_title: pageTitle,
        body_text:  bodyText,
        page_type:  pageType,
      });

      if (deps.writeSnippet) {
        const wr = await deps.writeSnippet(creds, result.liquid_snippet, 'vaeo-faq');
        if (!wr.success) {
          return { success: false, action: 'faq', error: wr.error };
        }
      }

      return {
        success:     true,
        action:      'faq',
        schema_type: 'FAQPage',
      };
    }

    // ── ANSWER_BLOCK_OPPORTUNITY ──────────────────────────────────────────
    if (issueType === 'ANSWER_BLOCK_OPPORTUNITY') {
      if (!deps.injectAnswerSchema) {
        return { success: false, error: 'injectAnswerSchema dep not available' };
      }
      // Fetch page HTML
      let html = '';
      if (deps.fetchHTML) {
        try { html = await deps.fetchHTML(url); } catch { /* use empty */ }
      }

      const opportunityType = (item.proposed_fix['opportunity_type'] as string) ?? 'definition';
      const recommendedSchema = (item.proposed_fix['recommended_schema'] as string) ?? 'DefinedTerm';
      const content = {
        items:      (item.proposed_fix['items']      as string[]) ?? undefined,
        steps:      (item.proposed_fix['steps']      as string[]) ?? undefined,
        definition: (item.proposed_fix['definition'] as string)   ?? undefined,
      };

      const result = await deps.injectAnswerSchema(
        html,
        {
          url,
          opportunity_type:   opportunityType,
          trigger_phrases:    (item.proposed_fix['trigger_phrases'] as string[]) ?? [],
          recommended_schema: recommendedSchema,
          confidence:         (item.proposed_fix['confidence'] as number) ?? 0.5,
        },
        content,
      );

      if (deps.writeSnippet) {
        const wr = await deps.writeSnippet(creds, result.liquid_snippet, 'vaeo-answer-block');
        if (!wr.success) {
          return { success: false, action: 'answer_block', error: wr.error };
        }
      }

      return {
        success:     true,
        action:      'answer_block',
        schema_type: recommendedSchema,
      };
    }

    return { success: false, error: `Unknown AEO issue type: ${issueType}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
