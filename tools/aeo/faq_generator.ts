/**
 * tools/aeo/faq_generator.ts
 *
 * FAQ schema generator for AEO.
 * Extracts FAQ pairs from HTML patterns and/or generates them with AI.
 * Outputs FAQPage JSON-LD schema and injectable Liquid snippets.
 *
 * Injectable callAI for tests. Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface FAQItem {
  question:         string;
  answer:           string;
  source_selector?: string;
}

export interface FAQResult {
  url:            string;
  faq_items:      FAQItem[];
  schema:         Record<string, unknown>;
  liquid_snippet: string;
  extracted_from: 'ai' | 'html' | 'hybrid';
  confidence:     number;
}

export type CallAIFn = (prompt: string) => Promise<string>;

export interface FAQDeps {
  callAI?: CallAIFn;
}

// ── HTML FAQ extraction ──────────────────────────────────────────────────────

const DT_DD_RE      = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
const FAQ_CLASS_RE  = /<[^>]+class\s*=\s*["'][^"']*faq[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/gi;
const ITEMTYPE_RE   = /<[^>]+itemtype\s*=\s*["'][^"']*Question[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi;
const H3_P_RE       = /<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
const H2_P_RE       = /<h2[^>]*>([\s\S]*?)<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * Extract FAQ pairs from common HTML patterns.
 * Returns up to 10 items.
 */
export async function extractFAQFromHTML(
  html: string,
  url: string,
): Promise<FAQItem[]> {
  const items: FAQItem[] = [];
  const seen = new Set<string>();

  function addItem(question: string, answer: string, selector: string): void {
    const q = stripTags(question).trim();
    const a = stripTags(answer).trim();
    if (!q || !a || q.length < 5 || a.length < 10) return;
    if (seen.has(q.toLowerCase())) return;
    seen.add(q.toLowerCase());
    items.push({ question: q, answer: a, source_selector: selector });
  }

  // 1. dt/dd pairs
  let m: RegExpExecArray | null;
  DT_DD_RE.lastIndex = 0;
  while ((m = DT_DD_RE.exec(html)) !== null) {
    addItem(m[1], m[2], 'dt/dd');
  }

  // 2. Schema.org Question itemtype
  ITEMTYPE_RE.lastIndex = 0;
  while ((m = ITEMTYPE_RE.exec(html)) !== null) {
    const block = m[1];
    const qMatch = block.match(/itemprop\s*=\s*["']name["'][^>]*>([\s\S]*?)</);
    const aMatch = block.match(/itemprop\s*=\s*["']text["'][^>]*>([\s\S]*?)</);
    if (qMatch && aMatch) {
      addItem(qMatch[1], aMatch[1], 'itemtype=Question');
    }
  }

  // 3. .faq class blocks — look for Q&A patterns inside
  FAQ_CLASS_RE.lastIndex = 0;
  while ((m = FAQ_CLASS_RE.exec(html)) !== null) {
    const block = m[1];
    // Try h3+p pattern inside FAQ blocks
    const innerH3P = /<h[23][^>]*>([\s\S]*?)<\/h[23]>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
    let inner: RegExpExecArray | null;
    while ((inner = innerH3P.exec(block)) !== null) {
      addItem(inner[1], inner[2], '.faq h3+p');
    }
  }

  // 4. H3+P pattern (question-like headings followed by answer paragraphs)
  H3_P_RE.lastIndex = 0;
  while ((m = H3_P_RE.exec(html)) !== null) {
    const q = stripTags(m[1]);
    if (q.includes('?') || /^(what|how|why|when|where|can|do|is|are|will|should)\b/i.test(q)) {
      addItem(m[1], m[2], 'h3+p');
    }
  }

  // 5. H2+P pattern for question-like headings
  H2_P_RE.lastIndex = 0;
  while ((m = H2_P_RE.exec(html)) !== null) {
    const q = stripTags(m[1]);
    if (q.includes('?') || /^(what|how|why|when|where|can|do|is|are|will|should)\b/i.test(q)) {
      addItem(m[1], m[2], 'h2+p');
    }
  }

  return items.slice(0, 10);
}

// ── AI FAQ generation ────────────────────────────────────────────────────────

/**
 * Generate FAQ pairs using AI from page content.
 * Returns 3-5 FAQ pairs.
 */
export async function generateFAQWithAI(
  config: { url: string; page_title: string; body_text: string; page_type: string },
  deps?: FAQDeps,
): Promise<FAQItem[]> {
  if (!deps?.callAI) {
    return generateDefaultFAQs(config);
  }

  try {
    const prompt = `Generate 3-5 FAQ pairs for this page. Return JSON array of {question, answer} objects.
Focus on questions a customer/user would actually ask.
Format questions as: "What is X?", "How does Y work?", "Can I Z?"

Page type: ${config.page_type}
Title: ${config.page_title}
Content: ${config.body_text.slice(0, 1000)}

Return ONLY a JSON array, no markdown or explanation.`;

    const response = await deps.callAI(prompt);
    const parsed = JSON.parse(response) as Array<{ question: string; answer: string }>;

    if (!Array.isArray(parsed)) return generateDefaultFAQs(config);

    return parsed
      .filter((p) => p.question && p.answer)
      .slice(0, 5)
      .map((p) => ({
        question: p.question,
        answer:   p.answer,
      }));
  } catch {
    return generateDefaultFAQs(config);
  }
}

function generateDefaultFAQs(
  config: { url: string; page_title: string; body_text: string; page_type: string },
): FAQItem[] {
  const title = config.page_title || 'this';
  const items: FAQItem[] = [];

  switch (config.page_type.toLowerCase()) {
    case 'product':
      items.push(
        { question: `What is ${title}?`, answer: config.body_text.slice(0, 150).trim() || `${title} is a product available on our store.` },
        { question: `How much does ${title} cost?`, answer: `Visit the product page for current pricing and availability.` },
        { question: `Is ${title} available for shipping?`, answer: `Yes, we offer shipping. Check the product page for details.` },
      );
      break;
    case 'article':
    case 'blog':
      items.push(
        { question: `What is ${title} about?`, answer: config.body_text.slice(0, 150).trim() || `This article covers ${title}.` },
        { question: `Who wrote ${title}?`, answer: `Check the article byline for author information.` },
        { question: `How can I learn more about this topic?`, answer: `Browse our blog for related articles and guides.` },
      );
      break;
    default:
      items.push(
        { question: `What is ${title}?`, answer: config.body_text.slice(0, 150).trim() || `Learn more about ${title} on this page.` },
        { question: `How can I contact you?`, answer: `Visit our contact page for ways to reach us.` },
        { question: `Where can I find more information?`, answer: `Browse our website for additional resources and details.` },
      );
      break;
  }

  return items;
}

// ── Schema building ──────────────────────────────────────────────────────────

function buildFAQPageSchema(items: FAQItem[]): Record<string, unknown> {
  return {
    '@context':    'https://schema.org',
    '@type':       'FAQPage',
    'mainEntity':  items.map((item) => ({
      '@type': 'Question',
      'name':  item.question,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text':  item.answer,
      },
    })),
  };
}

function buildLiquidSnippet(schema: Record<string, unknown>): string {
  const json = JSON.stringify(schema, null, 2);
  return `{% comment %} VAEO: FAQ Schema {% endcomment %}\n<script type="application/ld+json">\n${json}\n</script>`;
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Build FAQ schema for a page.
 *
 * 1. Try extracting FAQs from HTML patterns
 * 2. If <3 items found, supplement with AI-generated FAQs
 * 3. Build FAQPage JSON-LD schema
 * 4. Generate injectable Liquid snippet
 *
 * Never throws.
 */
export async function buildFAQSchema(
  url: string,
  html: string,
  config: { page_title: string; body_text: string; page_type: string },
  deps?: FAQDeps,
): Promise<FAQResult> {
  let htmlItems: FAQItem[] = [];
  let aiItems: FAQItem[] = [];

  // 1. Extract from HTML
  try {
    htmlItems = await extractFAQFromHTML(html, url);
  } catch { /* non-fatal */ }

  // 2. Supplement with AI if needed
  let extracted_from: 'html' | 'ai' | 'hybrid' = 'html';

  if (htmlItems.length < 3) {
    try {
      aiItems = await generateFAQWithAI(
        { url, page_title: config.page_title, body_text: config.body_text, page_type: config.page_type },
        deps,
      );
    } catch { /* non-fatal */ }

    if (htmlItems.length === 0) {
      extracted_from = 'ai';
    } else {
      extracted_from = 'hybrid';
    }
  }

  // 3. Merge — HTML items first, then AI to fill up
  const seen = new Set(htmlItems.map((i) => i.question.toLowerCase()));
  const merged = [...htmlItems];
  for (const ai of aiItems) {
    if (!seen.has(ai.question.toLowerCase())) {
      merged.push(ai);
      seen.add(ai.question.toLowerCase());
    }
  }
  const faq_items = merged.slice(0, 10);

  // 4. Build schema
  const schema = buildFAQPageSchema(faq_items);
  const liquid_snippet = buildLiquidSnippet(schema);

  const confidence = extracted_from === 'html' ? 0.9
    : extracted_from === 'hybrid' ? 0.75
    : 0.6;

  return {
    url,
    faq_items,
    schema,
    liquid_snippet,
    extracted_from,
    confidence,
  };
}
