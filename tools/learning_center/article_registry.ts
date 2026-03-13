/**
 * tools/learning_center/article_registry.ts
 *
 * Centralized content registry for the VAEO Learning Center.
 * All public functions never throw.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type ArticleCategory =
  | 'getting_started'
  | 'seo_basics'
  | 'aeo'
  | 'understanding_vaeo'
  | 'agency'
  | 'troubleshooting';

export interface Article {
  id:               string;
  title:            string;
  slug:             string;
  category:         ArticleCategory;
  summary:          string;
  content:          string;
  related_feature:  string | null;
  read_time_minutes: number;
  helpful_for:      string[];
}

// ── Article Registry ─────────────────────────────────────────────────────────

export const ARTICLE_REGISTRY: Article[] = [
  {
    id: 'what-is-aeo',
    title: 'What Is Answer Engine Optimization?',
    slug: 'what-is-aeo',
    category: 'aeo',
    summary:
      'AEO is the practice of optimizing your content to be selected as the answer by AI assistants and voice search engines.',
    content: `## What Is Answer Engine Optimization?

Answer Engine Optimization (AEO) is the practice of structuring your website content so that AI assistants, voice search engines, and Google's AI Overview boxes select your content as the definitive answer to a user's question.

### How AEO Differs from Traditional SEO

Traditional SEO focuses on ranking in a list of ten blue links. AEO focuses on being *the single answer* that an AI assistant reads aloud or displays in an answer box. With SEO, you compete for clicks. With AEO, you compete for selection — there is only one winner.

### How AI Assistants Select Content

Google Assistant, Alexa, Siri, and AI overview boxes all follow a similar pattern when choosing content:

1. **Structured data first** — They look for schema markup (FAQ, HowTo, Speakable) that explicitly marks content as answer-ready.
2. **Content clarity** — Short, direct answers in the first paragraph of a section are preferred over long-form prose.
3. **Authority signals** — Domain authority, page speed, and HTTPS all factor into selection confidence.
4. **Freshness** — Recently updated content is preferred for time-sensitive queries.

### The Role of Speakable Schema

Speakable schema tells voice assistants exactly which parts of your page are suitable for text-to-speech. Without it, assistants have to guess — and they usually guess wrong or skip your content entirely. VAEO automatically adds speakable schema to your most important content sections.

### FAQ and HowTo Schema

FAQ schema marks question-and-answer pairs on your page, making them eligible for rich results and AI answer selection. HowTo schema marks step-by-step instructions. Both dramatically increase your chances of being selected as an answer. VAEO detects pages that would benefit from these schemas and adds them automatically.

### Why AEO Matters for Shopify and WordPress Stores

E-commerce stores have a unique AEO opportunity: product pages naturally answer questions like "What does [product] cost?" and "What are the features of [product]?" Category pages answer "What are the best [category] products?" By adding the right schema, your store pages become answer-eligible for thousands of product-related queries.

### How VAEO Handles AEO Automatically

VAEO scans your pages for AEO opportunities and automatically adds speakable, FAQ, and HowTo schema where appropriate. Your AEO Score in the dashboard shows how answer-ready your site is across seven key signals, each weighted by impact on AI selection.`,
    related_feature: 'aeo-score',
    read_time_minutes: 4,
    helpful_for: ['new clients', 'agencies explaining value to clients'],
  },

  {
    id: 'how-health-score-works',
    title: 'How Your SEO Health Score Works',
    slug: 'how-health-score-works',
    category: 'understanding_vaeo',
    summary:
      'Your health score is calculated from the severity of open SEO issues on your site — not just the count.',
    content: `## How Your SEO Health Score Works

Your SEO Health Score is a single number from 0 to 100 that represents the overall technical SEO health of your site. It is not a simple count of issues — it is a severity-weighted score that prioritizes the problems that actually hurt your rankings.

### What the Score Measures

The health score evaluates every page VAEO has crawled and checks for open SEO issues across categories like missing title tags, broken schema, missing alt text, canonical problems, and more. Each issue type has a severity weight based on its impact on search rankings.

### Why Severity Weighting Matters

Not all SEO issues are equal. A missing title tag on your homepage has a much larger impact on rankings than a missing alt tag on a blog post image. The health score reflects this reality:

- **Critical issues** (missing titles, broken canonicals, noindex on important pages) have the highest weight
- **High issues** (missing meta descriptions, broken schema) have significant weight
- **Medium issues** (missing alt text, suboptimal headings) have moderate weight
- **Low issues** (minor formatting, optional enhancements) have minimal weight

### What a Missing Title Tag Costs vs a Missing Alt Tag

A missing title tag on a product page can cost you 10-15 positions in search results for that page's target keyword. A missing alt tag on one image might cost you a fraction of a position. The health score weights these proportionally — fixing one missing title tag improves your score more than fixing ten missing alt tags.

### How to Improve Your Score

The fastest way to improve your health score is to let VAEO fix the highest-severity issues first. VAEO automatically prioritizes fixes by severity, so the first fixes applied will have the biggest impact on your score. You can see the projected score improvement for each pending fix in your dashboard.

### What a Perfect Score Means

A score of 100 means VAEO has not detected any open SEO issues on your crawled pages. This is achievable but may not be realistic for every site — some site types (large catalogs, user-generated content) will always have some issues in flux. A score above 85 is excellent for most sites.`,
    related_feature: 'health-score',
    read_time_minutes: 3,
    helpful_for: ['new clients', 'clients asking about their score'],
  },

  {
    id: 'what-is-fix-drift',
    title: 'What Is Fix Drift and Why Does It Happen?',
    slug: 'what-is-fix-drift',
    category: 'understanding_vaeo',
    summary:
      'Fix drift happens when a theme update or plugin change overwrites an SEO fix VAEO previously applied.',
    content: `## What Is Fix Drift and Why Does It Happen?

Fix drift occurs when a change to your site — typically a theme update, plugin update, or manual edit — overwrites or removes an SEO fix that VAEO previously applied. It is one of the most common reasons SEO improvements are lost over time.

### How Theme and Plugin Updates Work

When your Shopify theme or WordPress theme is updated, the update replaces template files with new versions. If VAEO added a meta description to your product template, and the theme update ships a new version of that template, the meta description is gone. The same applies to WordPress plugin updates — a Yoast or RankMath update can overwrite schema markup that VAEO added.

### Why Updates Overwrite Meta Tags and Schema

Theme and plugin developers do not know about customizations made after their code shipped. Updates replace files wholesale rather than merging changes. This is by design — it prevents conflicts — but it means any direct template modifications are lost.

### How VAEO Detects Drift Automatically

VAEO runs periodic drift scans that compare the current state of your pages against the expected state after fixes were applied. If a fix is no longer present on the page, VAEO flags it as drifted. The Fix Stability Monitor in your dashboard shows drift events in real time.

### What Happens When Drift Is Detected

When VAEO detects that a fix has drifted, it automatically requeues the fix for reapplication. You do not need to take any action — VAEO will reapply the fix using the same approach that worked the first time. If the fix fails to reapply (because the page structure changed significantly), VAEO flags it for review.

### How to Reduce Drift on Your Site

While drift cannot be eliminated entirely, you can reduce its frequency:

1. **Avoid unnecessary theme updates** — Only update when there is a security fix or a feature you need.
2. **Use child themes** (WordPress) — Child theme customizations survive parent theme updates.
3. **Review update changelogs** — Check if the update modifies templates that VAEO has fixed.
4. **Let VAEO handle reapplication** — Do not manually re-add fixes. VAEO tracks what was applied and will reapply automatically.`,
    related_feature: 'drift-scanner',
    read_time_minutes: 3,
    helpful_for: ['clients seeing drift alerts', 'clients updating themes'],
  },

  {
    id: 'understanding-confidence-scores',
    title: 'Why Does VAEO Show a Confidence Score?',
    slug: 'understanding-confidence-scores',
    category: 'understanding_vaeo',
    summary:
      'Every fix VAEO applies has a confidence score. Higher risk fixes require higher confidence before being applied automatically.',
    content: `## Why Does VAEO Show a Confidence Score?

Every fix VAEO applies goes through a verification pipeline before it touches your live site. The confidence score is the result of that pipeline — it tells you how certain VAEO is that the fix will improve your site without causing problems.

### What Confidence Scoring Is

The confidence score is a number from 0 to 1 (displayed as a percentage) that combines multiple verification signals into a single measure of fix safety. A score of 0.97 means VAEO is 97% confident the fix is safe and beneficial.

### Why Different Fix Types Have Different Thresholds

Not all fixes carry the same risk. Adding an alt tag to an image is very low risk — the worst case is a slightly awkward description. Modifying a canonical tag is higher risk — a wrong canonical can deindex a page. VAEO sets higher confidence thresholds for higher-risk fixes:

- **Low risk** (alt text, meta descriptions): threshold 0.75
- **Medium risk** (schema markup, heading structure): threshold 0.85
- **High risk** (canonicals, redirects, noindex changes): threshold 0.92
- **Critical risk** (template-level changes): threshold 0.97

### What Sandbox Verification Means

Before applying a fix to your live site, VAEO applies it in a sandbox environment and compares the before and after HTML. The sandbox checks that the fix was applied correctly, that no other elements on the page were affected, and that Lighthouse performance scores did not drop.

### What Viewport QA Means

Viewport QA captures how the page looks at multiple screen sizes (mobile, tablet, desktop) before and after the fix. If the fix causes any visual change beyond the intended improvement, the viewport QA flags it for review.

### When VAEO Auto-Applies vs Waits

If the confidence score meets or exceeds the threshold for the fix's risk level, and both sandbox and viewport QA pass, VAEO applies the fix automatically. If any check fails, VAEO holds the fix and surfaces it in your dashboard for manual review.

### How to Interpret the Decision Log

Each fix in your fix history shows the full decision log: what the confidence score was, what threshold was required, whether sandbox passed, whether viewport QA passed, and the specific reasons VAEO made its decision. This transparency lets you understand exactly why each fix was or was not applied automatically.`,
    related_feature: 'confidence-display',
    read_time_minutes: 4,
    helpful_for: ['clients reviewing fix history', 'agencies auditing fix decisions'],
  },

  {
    id: 'reading-your-rankings',
    title: 'How to Read Your Keyword Rankings',
    slug: 'reading-your-rankings',
    category: 'understanding_vaeo',
    summary:
      'Your rankings data comes directly from Google Search Console. Here is how to interpret position, trend, and week-over-week changes.',
    content: `## How to Read Your Keyword Rankings

Your keyword rankings in VAEO come directly from Google Search Console (GSC). They show where your pages appear in Google search results for specific keywords, and how those positions are changing over time.

### What GSC Position Means

Position is the average rank of your page in Google search results for a given keyword. Position 1 means you are the first organic result. Position 10 means you are at the bottom of page one. Position 11+ means you are on page two or beyond. Lower numbers are better.

### Why Position Fluctuates

It is normal for positions to fluctuate by 1-3 positions day to day. Google constantly tests different result orderings, and your position reflects an average. Fluctuations of more than 5 positions usually indicate a real change — either from a Google algorithm update, a competitor change, or a change on your site.

### How to Read Week-Over-Week Trends

The trend indicator shows how your average position changed compared to the previous week. A green arrow up means you moved to a better (lower number) position. A red arrow down means you moved to a worse (higher number) position. A dash means no significant change.

### What Biggest Gains and Losses Mean

The biggest gains section shows keywords where your position improved the most in the past week. These often correlate with recent VAEO fixes — if VAEO added a missing title tag to a page, you may see that page's target keyword jump several positions within days.

The biggest losses section shows keywords where your position dropped. This can indicate drift (a fix was overwritten), a competitor improvement, or a Google algorithm change.

### Why New Keywords Appear

When VAEO improves your page's SEO, Google may start ranking that page for keywords it was not previously visible for. New keywords appearing in your rankings is a positive signal that your SEO improvements are working.

### What Lost Keywords Mean

A lost keyword means a page that was previously ranking for a keyword is no longer appearing in the top 100 results. This is not always bad — sometimes Google consolidates rankings to a more relevant page on your site. But if many keywords are lost suddenly, it may indicate a technical issue.

### How VAEO Uses Rankings to Prioritize Fixes

VAEO uses your ranking data to prioritize which pages to fix first. Pages that are ranking on positions 11-20 (top of page two) get priority because they are closest to page one — a small SEO improvement can push them onto page one where they will get significantly more traffic.`,
    related_feature: 'rankings',
    read_time_minutes: 4,
    helpful_for: ['clients reading rankings reports', 'clients new to GSC'],
  },

  {
    id: 'shopify-seo-basics',
    title: 'Shopify SEO — What Matters Most',
    slug: 'shopify-seo-basics',
    category: 'seo_basics',
    summary:
      'The most impactful SEO issues on Shopify stores and how VAEO fixes them automatically.',
    content: `## Shopify SEO — What Matters Most

Shopify is a powerful e-commerce platform, but its default themes often miss critical SEO elements. Here are the most impactful issues VAEO finds and fixes on Shopify stores.

### Title Tags on Product Pages

The title tag is the single most important on-page SEO element. It appears in search results and tells Google what the page is about. Many Shopify themes use the product name as the title tag without any additional context — missing the store name, category, or key selling points that improve click-through rates.

### Meta Descriptions and CTR

Meta descriptions do not directly affect rankings, but they dramatically affect click-through rate (CTR). A compelling meta description can double your clicks from the same ranking position. VAEO generates unique meta descriptions for every product and collection page based on the page content.

### Schema for Products and Collections

Product schema tells Google the price, availability, rating, and other structured data about your products. This enables rich results in search — the star ratings, price, and availability badges you see in Google results. Collection schema helps Google understand your category structure. Most Shopify themes include basic product schema but miss important fields or have implementation errors.

### Canonical Tags on Filtered Pages

Shopify creates filtered URLs for collections (e.g., /collections/shoes?sort_by=price). Without proper canonical tags, Google may index these filtered pages as duplicates, diluting your ranking signals. VAEO ensures canonical tags point to the correct primary URL.

### Image Alt Text at Scale

Product images without alt text are invisible to Google Image Search and hurt your accessibility score. Manually writing alt text for hundreds or thousands of products is impractical. VAEO generates descriptive alt text at scale based on product titles, descriptions, and image context.

### Why Shopify Themes Often Miss These

Theme developers focus on visual design and user experience, not SEO. Most themes include the minimum required meta tags but skip schema markup, optimized titles, and proper canonical handling. This is not a flaw in Shopify itself — it is a gap that VAEO fills automatically.`,
    related_feature: null,
    read_time_minutes: 5,
    helpful_for: ['Shopify store owners', 'agencies managing Shopify clients'],
  },

  {
    id: 'wordpress-seo-basics',
    title: 'WordPress SEO — Common Issues',
    slug: 'wordpress-seo-basics',
    category: 'seo_basics',
    summary:
      'The most common SEO problems on WordPress sites and what causes them.',
    content: `## WordPress SEO — Common Issues

WordPress powers over 40% of the web, but its flexibility creates unique SEO challenges. Plugin conflicts, theme limitations, and configuration complexity lead to issues that are hard to detect and fix manually.

### Plugin Conflicts — Yoast vs RankMath

Many WordPress sites have multiple SEO plugins installed, or remnants of old plugins that were deactivated but not fully removed. Yoast and RankMath both generate meta tags and schema — if both are partially active, you get duplicate or conflicting markup that confuses search engines.

### How VAEO Handles Plugin Conflicts

VAEO detects which SEO plugins are active on your site and understands their output. Rather than fighting with existing plugins, VAEO works alongside them — filling gaps they miss and correcting errors in their output. If VAEO detects a conflict between plugins, it flags it in your dashboard with a specific recommendation.

### WooCommerce Product Schema

WooCommerce adds basic product schema, but it often misses fields that enable rich results — like aggregate ratings, brand, GTIN/SKU identifiers, and offer details. VAEO detects missing schema fields and adds them, enabling richer search result appearances.

### Canonical Issues on Archive Pages

WordPress generates multiple archive pages (category archives, tag archives, date archives, author archives) that can create duplicate content issues. Proper canonical tags on these pages are critical but often misconfigured — especially when pagination is involved.

### Cache and Why It Matters for Fixes

WordPress sites often use caching plugins (WP Super Cache, W3 Total Cache, WP Rocket) that serve cached versions of pages. When VAEO applies a fix, the cached version may still show the old content. VAEO automatically busts the cache for fixed pages, but aggressive server-level caching (like Cloudflare or Varnish) may require additional configuration.`,
    related_feature: null,
    read_time_minutes: 4,
    helpful_for: ['WordPress site owners', 'agencies managing WordPress clients'],
  },

  {
    id: 'getting-started-guide',
    title: 'Getting Started with VAEO',
    slug: 'getting-started-guide',
    category: 'getting_started',
    summary: 'Everything you need to know in your first week with VAEO.',
    content: `## Getting Started with VAEO

Welcome to VAEO. This guide covers what to expect in your first week and how to get the most out of your SEO autopilot.

### What Happens After Onboarding

Once your site is connected, VAEO begins its first crawl. This typically takes a few minutes for small sites and up to an hour for sites with thousands of pages. During the crawl, VAEO discovers all your pages, analyzes their SEO health, and builds a prioritized fix queue.

### First Crawl and What to Expect

Your first health score will appear after the crawl completes. Do not be alarmed if it is low — most sites start between 40 and 70. This is normal and reflects the SEO gaps that exist on most sites before optimization. The score gives you a baseline to measure improvement against.

### First Fix Run Timeline

VAEO begins applying fixes within hours of your first crawl. Fixes are applied in priority order — the highest-impact, lowest-risk fixes go first. You will see your first fixes in the Fix History section of your dashboard, each with a confidence score and verification status.

### How to Read Your First Report

Your dashboard shows several key sections:

- **Health Score** — Your overall SEO health, updated after each fix run
- **Fix History** — Every fix VAEO has applied, with before/after details
- **Rankings** — Your keyword positions from Google Search Console (requires GSC connection)
- **AEO Score** — How answer-engine-ready your site is

### How to Connect GSC

To see keyword rankings in VAEO, connect your Google Search Console account. Go to Settings → Integrations → Google Search Console and follow the authorization flow. VAEO only reads your search analytics data — it never modifies your GSC settings.

### When to Expect Ranking Improvements

SEO improvements take time to reflect in rankings. After VAEO applies fixes, Google needs to recrawl your pages and reprocess them. This typically takes 1-4 weeks for individual pages. Significant ranking improvements usually become visible within 2-6 weeks of the first fix run.

### What Not to Worry About

- **Score fluctuations of 1-2 points** — Normal as new pages are crawled and fixes are applied
- **Ranking fluctuations of 1-3 positions** — Normal daily variation in Google results
- **New issues appearing** — As VAEO crawls more pages, it discovers more issues. This is progress, not regression
- **Fix drift alerts** — VAEO automatically reapplies drifted fixes. No action needed from you.`,
    related_feature: null,
    read_time_minutes: 5,
    helpful_for: ['new clients', 'clients in first week'],
  },
];

// ── Public API ───────────────────────────────────────────────────────────────

export function getArticlesByCategory(category: ArticleCategory): Article[] {
  try {
    if (!category) return [];
    return ARTICLE_REGISTRY.filter((a) => a.category === category);
  } catch {
    return [];
  }
}

export function getArticleBySlug(slug: string): Article | null {
  try {
    if (!slug) return null;
    return ARTICLE_REGISTRY.find((a) => a.slug === slug) ?? null;
  } catch {
    return null;
  }
}

export function getRelatedArticles(article_id: string, limit: number): Article[] {
  try {
    if (!article_id) return [];
    const article = ARTICLE_REGISTRY.find((a) => a.id === article_id);
    if (!article) return [];
    return ARTICLE_REGISTRY
      .filter((a) => a.category === article.category && a.id !== article_id)
      .slice(0, Math.max(0, limit));
  } catch {
    return [];
  }
}

export function searchArticles(query: string): Article[] {
  try {
    if (!query || typeof query !== 'string') return [];
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return ARTICLE_REGISTRY.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q),
    );
  } catch {
    return [];
  }
}
