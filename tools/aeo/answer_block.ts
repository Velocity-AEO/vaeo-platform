/**
 * tools/aeo/answer_block.ts
 *
 * Answer block detector and injector for AEO.
 * Scans page content for answer engine trigger patterns
 * (definitions, how-tos, lists, comparisons, FAQs) and
 * injects appropriate structured data schema.
 *
 * Injectable callAI for tests. Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type OpportunityType = 'definition' | 'how_to' | 'list' | 'comparison' | 'faq';

export interface AnswerOpportunity {
  url:                string;
  opportunity_type:   OpportunityType;
  trigger_phrases:    string[];
  recommended_schema: string;
  confidence:         number;
}

export type CallAIFn = (prompt: string) => Promise<string>;

export interface AnswerBlockDeps {
  callAI?: CallAIFn;
}

// ── Regex patterns ───────────────────────────────────────────────────────────

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

function extractText(html: string): string {
  return stripTags(html).replace(/\s+/g, ' ').trim();
}

// ── Opportunity detectors ────────────────────────────────────────────────────

function detectDefinitionOpportunities(text: string, url: string): AnswerOpportunity[] {
  const triggers: string[] = [];
  const patterns = [
    /\bwhat is\b/gi,
    /\bis a\b[^.]{10,}/gi,
    /\bdefined as\b/gi,
    /\brefers to\b/gi,
    /\bmeans that\b/gi,
  ];

  for (const pat of patterns) {
    pat.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pat.exec(text)) !== null) {
      const context = text.slice(Math.max(0, m.index - 20), m.index + m[0].length + 30).trim();
      triggers.push(context);
    }
  }

  if (triggers.length === 0) return [];

  return [{
    url,
    opportunity_type: 'definition',
    trigger_phrases:  triggers.slice(0, 5),
    recommended_schema: 'DefinedTerm',
    confidence: Math.min(0.9, 0.5 + triggers.length * 0.1),
  }];
}

function detectHowToOpportunities(html: string, text: string, url: string): AnswerOpportunity[] {
  const triggers: string[] = [];

  // Check headings for how-to patterns
  const headingPattern = /\bhow to\b|\bsteps to\b|\bguide to\b|\bstep[- ]by[- ]step\b/gi;
  let m: RegExpExecArray | null;
  while ((m = headingPattern.exec(text)) !== null) {
    const context = text.slice(Math.max(0, m.index - 10), m.index + m[0].length + 40).trim();
    triggers.push(context);
  }

  // Check for ordered lists
  const olCount = (html.match(/<ol[\s>]/gi) ?? []).length;
  if (olCount > 0) {
    triggers.push(`${olCount} ordered list(s) found`);
  }

  if (triggers.length === 0) return [];

  return [{
    url,
    opportunity_type: 'how_to',
    trigger_phrases:  triggers.slice(0, 5),
    recommended_schema: 'HowTo',
    confidence: Math.min(0.95, 0.6 + triggers.length * 0.1),
  }];
}

function detectListOpportunities(html: string, text: string, url: string): AnswerOpportunity[] {
  const triggers: string[] = [];

  // Unordered lists with 3+ items
  const ulBlocks = html.match(/<ul[^>]*>[\s\S]*?<\/ul>/gi) ?? [];
  for (const ul of ulBlocks) {
    const liCount = (ul.match(/<li[\s>]/gi) ?? []).length;
    if (liCount >= 3) {
      triggers.push(`Unordered list with ${liCount} items`);
    }
  }

  // "Top X" headings
  const topPattern = /\btop\s+\d+\b|\bbest\s+\d+\b|\b\d+\s+best\b|\b\d+\s+ways?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = topPattern.exec(text)) !== null) {
    triggers.push(text.slice(m.index, m.index + m[0].length + 30).trim());
  }

  if (triggers.length === 0) return [];

  return [{
    url,
    opportunity_type: 'list',
    trigger_phrases:  triggers.slice(0, 5),
    recommended_schema: 'ItemList',
    confidence: Math.min(0.85, 0.5 + triggers.length * 0.1),
  }];
}

function detectComparisonOpportunities(html: string, text: string, url: string): AnswerOpportunity[] {
  const triggers: string[] = [];

  // Comparison patterns
  const compPatterns = [
    /\bvs\.?\b/gi,
    /\bversus\b/gi,
    /\bcompared to\b/gi,
    /\bcomparison\b/gi,
    /\bdifference between\b/gi,
  ];

  for (const pat of compPatterns) {
    pat.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pat.exec(text)) !== null) {
      const context = text.slice(Math.max(0, m.index - 20), m.index + m[0].length + 30).trim();
      triggers.push(context);
    }
  }

  // Tables (often used for comparisons)
  const tableCount = (html.match(/<table[\s>]/gi) ?? []).length;
  if (tableCount > 0) {
    triggers.push(`${tableCount} table(s) found`);
  }

  if (triggers.length === 0) return [];

  return [{
    url,
    opportunity_type: 'comparison',
    trigger_phrases:  triggers.slice(0, 5),
    recommended_schema: 'Table',
    confidence: Math.min(0.85, 0.5 + triggers.length * 0.1),
  }];
}

function detectFAQOpportunities(html: string, text: string, url: string): AnswerOpportunity[] {
  const triggers: string[] = [];

  // Question marks in headings
  const headingsWithQ = html.match(/<h[1-6][^>]*>[^<]*\?[^<]*<\/h[1-6]>/gi) ?? [];
  for (const h of headingsWithQ) {
    triggers.push(stripTags(h));
  }

  // FAQ keyword
  if (/\bfaq\b|\bfrequently asked\b|\bquestions\b/i.test(text)) {
    triggers.push('FAQ section detected');
  }

  // dt/dd patterns
  if (/<dt[\s>]/i.test(html)) {
    triggers.push('Definition list (dt/dd) found');
  }

  if (triggers.length === 0) return [];

  return [{
    url,
    opportunity_type: 'faq',
    trigger_phrases:  triggers.slice(0, 5),
    recommended_schema: 'FAQPage',
    confidence: Math.min(0.9, 0.6 + triggers.length * 0.1),
  }];
}

// ── detectAnswerOpportunities ────────────────────────────────────────────────

/**
 * Scan page content for answer engine trigger patterns.
 * Returns opportunities sorted by confidence (desc).
 */
export async function detectAnswerOpportunities(
  html: string,
  url: string,
  _page_type: string,
): Promise<AnswerOpportunity[]> {
  const text = extractText(html);

  const opportunities: AnswerOpportunity[] = [
    ...detectDefinitionOpportunities(text, url),
    ...detectHowToOpportunities(html, text, url),
    ...detectListOpportunities(html, text, url),
    ...detectComparisonOpportunities(html, text, url),
    ...detectFAQOpportunities(html, text, url),
  ];

  // Sort by confidence desc
  opportunities.sort((a, b) => b.confidence - a.confidence);

  return opportunities;
}

// ── Schema builders ──────────────────────────────────────────────────────────

function buildHowToSchema(
  url: string,
  steps: string[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type':    'HowTo',
    'name':     `How to guide`,
    'step':     steps.map((s, i) => ({
      '@type':    'HowToStep',
      'position': i + 1,
      'text':     s,
    })),
  };
}

function buildItemListSchema(
  url: string,
  items: string[],
): Record<string, unknown> {
  return {
    '@context':        'https://schema.org',
    '@type':           'ItemList',
    'numberOfItems':   items.length,
    'itemListElement': items.map((item, i) => ({
      '@type':    'ListItem',
      'position': i + 1,
      'name':     item,
    })),
  };
}

function buildDefinedTermSchema(
  definition: string,
): Record<string, unknown> {
  return {
    '@context':    'https://schema.org',
    '@type':       'DefinedTerm',
    'description': definition,
  };
}

function buildTableSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type':    'Table',
  };
}

// ── injectAnswerSchema ───────────────────────────────────────────────────────

/**
 * Inject answer schema into page HTML based on the opportunity type.
 *
 * For how_to: generates HowTo schema with steps
 * For list: generates ItemList schema
 * For definition: generates DefinedTerm schema
 * For comparison: generates Table schema
 *
 * Injects into <head> as JSON-LD. Returns updated HTML + liquid_snippet.
 * Never throws.
 */
export async function injectAnswerSchema(
  html: string,
  opportunity: AnswerOpportunity,
  content: {
    items?:      string[];
    steps?:      string[];
    definition?: string;
  },
  _deps?: AnswerBlockDeps,
): Promise<{
  html:             string;
  schema_injected:  Record<string, unknown>;
  liquid_snippet:   string;
}> {
  let schema: Record<string, unknown>;

  switch (opportunity.opportunity_type) {
    case 'how_to':
      schema = buildHowToSchema(opportunity.url, content.steps ?? []);
      break;
    case 'list':
      schema = buildItemListSchema(opportunity.url, content.items ?? []);
      break;
    case 'definition':
      schema = buildDefinedTermSchema(content.definition ?? '');
      break;
    case 'comparison':
      schema = buildTableSchema();
      break;
    case 'faq':
      // FAQ is handled by faq_generator — return minimal schema
      schema = { '@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [] };
      break;
    default:
      schema = {};
      break;
  }

  const jsonLd = `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
  const liquid = `{% comment %} VAEO: ${opportunity.opportunity_type} schema {% endcomment %}\n${jsonLd}`;

  // Inject into <head>
  let updatedHtml = html;
  const headClose = /<\/head>/i;
  if (headClose.test(html)) {
    updatedHtml = html.replace(headClose, `${jsonLd}\n</head>`);
  } else {
    updatedHtml = jsonLd + '\n' + html;
  }

  return {
    html:            updatedHtml,
    schema_injected: schema,
    liquid_snippet:  liquid,
  };
}
