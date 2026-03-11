/**
 * tools/aeo/speakable_generator.ts
 *
 * Generates SpeakableSpecification JSON-LD for AEO (Answer Engine Optimization).
 * Identifies the most "speakable" content on a page and generates
 * schema markup that voice assistants and AI engines can consume.
 *
 * Injectable callAI for tests. Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface SpeakableConfig {
  url:              string;
  page_title:       string;
  meta_description: string;
  h1:               string;
  body_text:        string;
  page_type:        string;
}

export interface SpeakableResult {
  url:               string;
  speakable_schema:  Record<string, unknown>;
  css_selectors:     string[];
  xpath_selectors:   string[];
  liquid_snippet:    string;
  confidence:        number;
  reasoning:         string;
}

export type CallAIFn = (prompt: string) => Promise<string>;

export interface SpeakableDeps {
  callAI?: CallAIFn;
}

// ── Selector generation ──────────────────────────────────────────────────────

const HIGH_CONFIDENCE_TYPES = new Set([
  'product', 'article', 'blog', 'post',
]);

function buildCssSelectors(config: SpeakableConfig): string[] {
  const selectors: string[] = [];

  if (config.page_title) {
    selectors.push('title');
  }

  if (config.meta_description) {
    selectors.push('meta[name=description]');
  }

  // Page-type-specific selectors
  switch (config.page_type.toLowerCase()) {
    case 'product':
      selectors.push('.product-description p:first-child');
      selectors.push('.product__description p:first-child');
      break;
    case 'article':
    case 'blog':
    case 'post':
      selectors.push('article p:first-of-type');
      selectors.push('.article-content p:first-child');
      break;
    case 'collection':
      selectors.push('.collection-description p:first-child');
      break;
    default:
      selectors.push('main p:first-of-type');
      selectors.push('.page-content p:first-child');
      break;
  }

  // Always target H2s as key content markers
  selectors.push('h2');

  return selectors;
}

function buildXpathSelectors(cssSelectors: string[]): string[] {
  const xpathMap: Record<string, string> = {
    'title':                           '//title',
    'meta[name=description]':          '//meta[@name="description"]/@content',
    'h2':                              '//h2',
    '.product-description p:first-child':  '//*[contains(@class,"product-description")]//p[1]',
    '.product__description p:first-child': '//*[contains(@class,"product__description")]//p[1]',
    'article p:first-of-type':         '//article//p[1]',
    '.article-content p:first-child':  '//*[contains(@class,"article-content")]//p[1]',
    '.collection-description p:first-child': '//*[contains(@class,"collection-description")]//p[1]',
    'main p:first-of-type':            '//main//p[1]',
    '.page-content p:first-child':     '//*[contains(@class,"page-content")]//p[1]',
  };

  return cssSelectors.map((css) => xpathMap[css] ?? `//${css}`);
}

// ── Schema generation ────────────────────────────────────────────────────────

function buildSpeakableSchema(
  config: SpeakableConfig,
  cssSelectors: string[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type':    'WebPage',
    'name':     config.page_title || config.h1,
    'url':      config.url,
    'speakable': {
      '@type':       'SpeakableSpecification',
      'cssSelector': cssSelectors,
    },
  };
}

function buildLiquidSnippet(schema: Record<string, unknown>): string {
  const json = JSON.stringify(schema, null, 2);
  return `{% comment %} VAEO: Speakable Schema {% endcomment %}\n<script type="application/ld+json">\n${json}\n</script>`;
}

// ── AI-enhanced reasoning ────────────────────────────────────────────────────

async function generateReasoning(
  config: SpeakableConfig,
  deps: SpeakableDeps,
): Promise<string> {
  if (!deps.callAI) {
    return buildDefaultReasoning(config);
  }

  try {
    const prompt = `Analyze this page for speakable content (voice search / AI answer engine optimization).
Page type: ${config.page_type}
Title: ${config.page_title}
H1: ${config.h1}
Meta description: ${config.meta_description}
Body excerpt: ${config.body_text.slice(0, 500)}

In 1-2 sentences, explain why this page's title, meta description, and first paragraph are the best candidates for speakable content. Focus on conciseness and direct answer value.`;

    const response = await deps.callAI(prompt);
    return response || buildDefaultReasoning(config);
  } catch {
    return buildDefaultReasoning(config);
  }
}

function buildDefaultReasoning(config: SpeakableConfig): string {
  const type = config.page_type.toLowerCase();
  if (HIGH_CONFIDENCE_TYPES.has(type)) {
    return `${config.page_type} page with clear title and description — ideal for voice search. Speakable targets: title, meta description, and primary content paragraph.`;
  }
  return `Page title and meta description selected as speakable content. First content paragraph and H2 headings provide additional context for answer engines.`;
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Generate SpeakableSpecification schema for a page.
 *
 * 1. Build CSS selectors based on page type
 * 2. Generate XPath equivalents
 * 3. Build JSON-LD schema with SpeakableSpecification
 * 4. Generate Liquid snippet for injection
 * 5. Use AI for reasoning if available
 *
 * Never throws.
 */
export async function generateSpeakable(
  config: SpeakableConfig,
  deps?: SpeakableDeps,
): Promise<SpeakableResult> {
  const safeDeps = deps ?? {};

  const cssSelectors   = buildCssSelectors(config);
  const xpathSelectors = buildXpathSelectors(cssSelectors);
  const schema         = buildSpeakableSchema(config, cssSelectors);
  const liquidSnippet  = buildLiquidSnippet(schema);
  const reasoning      = await generateReasoning(config, safeDeps);

  const confidence = HIGH_CONFIDENCE_TYPES.has(config.page_type.toLowerCase())
    ? 0.9
    : 0.7;

  return {
    url:              config.url,
    speakable_schema: schema,
    css_selectors:    cssSelectors,
    xpath_selectors:  xpathSelectors,
    liquid_snippet:   liquidSnippet,
    confidence,
    reasoning,
  };
}
