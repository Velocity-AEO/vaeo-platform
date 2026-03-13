/**
 * tools/explanations/fix_explanation_registry.ts
 *
 * Client-facing explanations for every fix type.
 * Agencies can forward these directly to clients.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type FixExplanationCategory = 'seo' | 'aeo' | 'technical' | 'accessibility' | 'social';

export interface FixExplanation {
  issue_type:      string;
  short_label:     string;
  what_we_did:     string;
  why_it_matters:  string;
  expected_impact: string;
  learn_more_url:  string | null;
  category:        FixExplanationCategory;
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const FIX_EXPLANATION_REGISTRY: Record<string, FixExplanation> = {
  SPEAKABLE_MISSING: {
    issue_type: 'SPEAKABLE_MISSING',
    short_label: 'Speakable Schema Added',
    what_we_did: 'We added speakable schema markup to this page. This tells AI assistants like Google Assistant and Alexa which parts of your content are best suited for audio playback.',
    why_it_matters: 'As more searches happen through voice and AI assistants, speakable schema gives your content an advantage in being selected as the spoken answer. This is a core part of Answer Engine Optimization (AEO).',
    expected_impact: 'Improved eligibility for voice search results and AI answer inclusion over 4-8 weeks.',
    learn_more_url: null,
    category: 'aeo',
  },

  SCHEMA_MISSING: {
    issue_type: 'SCHEMA_MISSING',
    short_label: 'Schema Markup Added',
    what_we_did: 'We added structured data (JSON-LD schema) to this page. This gives search engines rich information about your content in a format they can reliably read.',
    why_it_matters: 'Schema markup makes your pages eligible for rich results in Google — star ratings, FAQs, product prices, and more. Pages without schema are invisible to these features.',
    expected_impact: 'Rich result eligibility within 1-4 weeks after Google recrawls the page.',
    learn_more_url: null,
    category: 'seo',
  },

  TITLE_MISSING: {
    issue_type: 'TITLE_MISSING',
    short_label: 'Title Tag Added',
    what_we_did: 'We added a title tag to this page. The title tag is the headline that appears in Google search results.',
    why_it_matters: 'A missing title tag is one of the most damaging SEO issues a page can have. Google uses it as the primary signal for what a page is about.',
    expected_impact: 'Improved ranking potential within 1-2 weeks after Google recrawls.',
    learn_more_url: null,
    category: 'seo',
  },

  TITLE_LONG: {
    issue_type: 'TITLE_LONG',
    short_label: 'Title Tag Shortened',
    what_we_did: 'We shortened your title tag to under 60 characters so it displays fully in search results without being cut off.',
    why_it_matters: 'Truncated titles look incomplete in search results and reduce click-through rates.',
    expected_impact: 'Better SERP appearance and improved CTR within days.',
    learn_more_url: null,
    category: 'seo',
  },

  TITLE_SHORT: {
    issue_type: 'TITLE_SHORT',
    short_label: 'Title Tag Expanded',
    what_we_did: 'We expanded your title tag to include more relevant keywords and context, making it more descriptive and useful for search engines.',
    why_it_matters: 'Very short titles waste valuable ranking real estate and don\'t communicate enough about the page to searchers or search engines.',
    expected_impact: 'Improved relevance signals and CTR within 1-2 weeks.',
    learn_more_url: null,
    category: 'seo',
  },

  META_DESC_MISSING: {
    issue_type: 'META_DESC_MISSING',
    short_label: 'Meta Description Added',
    what_we_did: 'We added a meta description to this page. This is the summary text that appears below your title in Google search results.',
    why_it_matters: 'A well-written meta description significantly improves click-through rates from search results. Without one, Google writes its own — often poorly.',
    expected_impact: 'Improved click-through rate from search results within days of Google recrawling.',
    learn_more_url: null,
    category: 'seo',
  },

  META_DESC_LONG: {
    issue_type: 'META_DESC_LONG',
    short_label: 'Meta Description Shortened',
    what_we_did: 'We shortened your meta description to under 160 characters so it displays fully in search results.',
    why_it_matters: 'Long meta descriptions get truncated in search results, cutting off important information and reducing click-through rates.',
    expected_impact: 'Better SERP appearance within days.',
    learn_more_url: null,
    category: 'seo',
  },

  CANONICAL_MISSING: {
    issue_type: 'CANONICAL_MISSING',
    short_label: 'Canonical Tag Added',
    what_we_did: 'We added a canonical tag to this page. This tells Google which version of a URL is the authoritative one to index.',
    why_it_matters: 'Without a canonical tag, Google may index multiple versions of the same page and split ranking signals across them — weakening all versions.',
    expected_impact: 'Consolidated ranking signals within 2-4 weeks.',
    learn_more_url: null,
    category: 'technical',
  },

  CANONICAL_WRONG: {
    issue_type: 'CANONICAL_WRONG',
    short_label: 'Canonical Tag Corrected',
    what_we_did: 'We corrected the canonical tag on this page. It was pointing to the wrong URL, which was sending Google\'s indexing signals to the wrong page.',
    why_it_matters: 'An incorrect canonical tag is effectively telling Google to ignore this page in favor of another — this can remove the page from search results entirely.',
    expected_impact: 'Restored indexing and ranking signals within 2-4 weeks.',
    learn_more_url: null,
    category: 'technical',
  },

  OG_MISSING: {
    issue_type: 'OG_MISSING',
    short_label: 'Open Graph Tags Added',
    what_we_did: 'We added Open Graph meta tags to this page. These control how your page appears when shared on Facebook, LinkedIn, and other platforms.',
    why_it_matters: 'Without OG tags, social platforms generate their own previews — often showing the wrong image or title. This reduces engagement on shared links.',
    expected_impact: 'Improved social share appearance immediately.',
    learn_more_url: null,
    category: 'social',
  },

  ALT_MISSING: {
    issue_type: 'ALT_MISSING',
    short_label: 'Image Alt Text Added',
    what_we_did: 'We added descriptive alt text to images on this page. Alt text describes images to search engines and screen readers.',
    why_it_matters: 'Images without alt text are invisible to Google Image Search and inaccessible to visually impaired users using screen readers.',
    expected_impact: 'Image search visibility and accessibility compliance improvement within 1-2 weeks.',
    learn_more_url: null,
    category: 'accessibility',
  },

  ROBOTS_NOINDEX: {
    issue_type: 'ROBOTS_NOINDEX',
    short_label: 'Noindex Directive Removed',
    what_we_did: 'We removed a noindex directive from this page. This directive was preventing Google from including the page in search results.',
    why_it_matters: 'A noindex tag makes a page completely invisible to search engines. This is sometimes intentional but often applied by mistake.',
    expected_impact: 'Page becomes eligible for indexing within days of Google recrawling. Full ranking may take several weeks.',
    learn_more_url: null,
    category: 'technical',
  },

  SCHEMA_INVALID: {
    issue_type: 'SCHEMA_INVALID',
    short_label: 'Schema Markup Fixed',
    what_we_did: 'We corrected errors in the structured data on this page. The existing schema had validation errors that prevented Google from understanding it.',
    why_it_matters: 'Invalid schema is worse than no schema — Google may penalize the page or ignore its structured data entirely, removing rich result eligibility.',
    expected_impact: 'Rich result eligibility restored within 1-4 weeks after Google recrawls.',
    learn_more_url: null,
    category: 'seo',
  },

  HREFLANG_MISSING: {
    issue_type: 'HREFLANG_MISSING',
    short_label: 'Hreflang Tags Added',
    what_we_did: 'We added hreflang tags to this page. These tell Google which language and region each version of a page is intended for.',
    why_it_matters: 'Without hreflang tags, Google may show the wrong language version of your page to users in different countries, leading to poor user experience and lost traffic.',
    expected_impact: 'Improved international search targeting within 2-4 weeks.',
    learn_more_url: null,
    category: 'technical',
  },

  HREFLANG_WRONG: {
    issue_type: 'HREFLANG_WRONG',
    short_label: 'Hreflang Tags Corrected',
    what_we_did: 'We corrected the hreflang tags on this page. They were pointing to the wrong language or region variants.',
    why_it_matters: 'Incorrect hreflang tags can cause Google to serve the wrong language version to users, hurting both user experience and rankings in specific markets.',
    expected_impact: 'Corrected international search targeting within 2-4 weeks.',
    learn_more_url: null,
    category: 'technical',
  },

  OG_TITLE: {
    issue_type: 'OG_TITLE',
    short_label: 'OG Title Added',
    what_we_did: 'We added an Open Graph title tag to this page. This controls the title shown when the page is shared on social media.',
    why_it_matters: 'Without an OG title, social platforms use the page title which may not be optimized for social engagement.',
    expected_impact: 'Improved social share appearance immediately.',
    learn_more_url: null,
    category: 'social',
  },

  OG_DESC: {
    issue_type: 'OG_DESC',
    short_label: 'OG Description Added',
    what_we_did: 'We added an Open Graph description tag to this page. This controls the description shown when the page is shared on social media.',
    why_it_matters: 'Without an OG description, social platforms auto-generate a description that is often irrelevant or truncated.',
    expected_impact: 'Improved social share appearance immediately.',
    learn_more_url: null,
    category: 'social',
  },

  REDIRECT_CHAIN_INTERNAL_LINK: {
    issue_type: 'REDIRECT_CHAIN_INTERNAL_LINK',
    short_label: 'Redirect Chain Fixed',
    what_we_did: 'Updated an internal link that was pointing to a URL that redirects multiple times before reaching its destination.',
    why_it_matters: 'Each redirect hop wastes a small amount of link equity. Linking directly to the final URL passes full equity with no waste.',
    expected_impact: 'Minor ranking improvement on the destination page as it now receives full link equity.',
    learn_more_url: null,
    category: 'seo',
  },

  CANONICAL_CONFLICT_LINK: {
    issue_type: 'CANONICAL_CONFLICT_LINK',
    short_label: 'Canonical Conflict Fixed',
    what_we_did: 'Updated an internal link that was pointing to a non-canonical version of a page.',
    why_it_matters: 'Links to non-canonical pages split equity between the canonical and non-canonical version. Google consolidates signals to the canonical — your link should too.',
    expected_impact: 'Improved ranking signals on the canonical page as it now receives direct link equity.',
    learn_more_url: null,
    category: 'seo',
  },

  GENERIC_ANCHOR_TEXT: {
    issue_type: 'GENERIC_ANCHOR_TEXT',
    short_label: 'Anchor Text Improved',
    what_we_did: 'Replaced generic anchor text (click here, read more) with descriptive text about the destination page.',
    why_it_matters: 'Anchor text is a relevance signal. Generic anchors tell Google nothing about the destination. Descriptive anchors reinforce the topic of the page being linked to.',
    expected_impact: 'Improved topical relevance signals on destination page over time.',
    learn_more_url: null,
    category: 'seo',
  },

  BROKEN_EXTERNAL_LINK_REMOVE: {
    issue_type: 'BROKEN_EXTERNAL_LINK_REMOVE',
    short_label: 'Broken Link Removed',
    what_we_did: 'Removed an outbound link to an external page that is no longer accessible.',
    why_it_matters: 'Broken outbound links are a negative quality signal and create a poor user experience.',
    expected_impact: 'Minor quality signal improvement — broken links removed.',
    learn_more_url: null,
    category: 'seo',
  },

  BROKEN_EXTERNAL_LINK_NOFOLLOW: {
    issue_type: 'BROKEN_EXTERNAL_LINK_NOFOLLOW',
    short_label: 'Nofollow Added',
    what_we_did: 'Added nofollow attribute to an outbound link to a low-value external domain.',
    why_it_matters: 'Followed links to low-value domains pass equity out of your site. Nofollow stops this while keeping the link visible.',
    expected_impact: 'Equity retained on your site rather than passed to external domain.',
    learn_more_url: null,
    category: 'seo',
  },

  ORPHANED_PAGE: {
    issue_type: 'ORPHANED_PAGE',
    short_label: 'Internal Links Added',
    what_we_did: 'We identified this page as orphaned — it had no internal links pointing to it from other pages on your site — and recommended adding internal links.',
    why_it_matters: 'Orphaned pages are difficult for search engines to discover and crawl. Without internal links, they accumulate very little ranking authority.',
    expected_impact: 'Improved crawl discovery and ranking signals within 2-4 weeks.',
    learn_more_url: null,
    category: 'seo',
  },
};

// ── Generic fallback ─────────────────────────────────────────────────────────

const GENERIC_EXPLANATION: FixExplanation = {
  issue_type:      'UNKNOWN',
  short_label:     'SEO Fix Applied',
  what_we_did:     'We applied an automated SEO fix to this page.',
  why_it_matters:  'This fix improves your page\'s visibility and performance in search engines.',
  expected_impact: 'Improved SEO performance within 1-4 weeks.',
  learn_more_url:  null,
  category:        'seo',
};

// ── Functions ────────────────────────────────────────────────────────────────

export function getFixExplanation(issue_type: string): FixExplanation {
  try {
    const key = (issue_type ?? '').toUpperCase();
    return FIX_EXPLANATION_REGISTRY[key] ?? { ...GENERIC_EXPLANATION, issue_type: key || 'UNKNOWN' };
  } catch {
    return { ...GENERIC_EXPLANATION };
  }
}

export function getExplanationsByCategory(category: FixExplanationCategory): FixExplanation[] {
  try {
    return Object.values(FIX_EXPLANATION_REGISTRY).filter(e => e.category === category);
  } catch {
    return [];
  }
}
