/**
 * tools/apps/app_fingerprint_catalog.ts
 *
 * Catalog of third-party Shopify app fingerprints for environment scanning.
 * Each entry defines script, domain, DOM, and cookie patterns to detect
 * apps from page HTML. Includes performance impact and replaceability flags.
 *
 * Pure data + lookup helpers — never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type AppCategory =
  | 'seo'
  | 'shipping'
  | 'reviews'
  | 'upsell'
  | 'popup'
  | 'chat'
  | 'social'
  | 'loyalty'
  | 'analytics'
  | 'email'
  | 'payments'
  | 'inventory'
  | 'forms'
  | 'other';

export interface AppFingerprint {
  app_id:               string;
  name:                 string;
  category:             AppCategory;
  vendor?:              string;
  monthly_cost_usd?:    number;
  script_patterns:      string[];
  domain_patterns:      string[];
  dom_patterns:         string[];
  cookie_patterns:      string[];
  performance_impact:   'low' | 'medium' | 'high' | 'critical';
  performance_notes:    string;
  replaceable_by_vaeo:  boolean;
  regulatory_exempt:    boolean;
  description:          string;
}

// ── Catalog ──────────────────────────────────────────────────────────────────

export const APP_FINGERPRINT_CATALOG: AppFingerprint[] = [
  // ── SHIPPING ─────────────────────────────────────────────────────────────
  {
    app_id:              'hextom_shipping_bar',
    name:                'Hextom Free Shipping Bar',
    category:            'shipping',
    vendor:              'Hextom',
    monthly_cost_usd:    9.99,
    script_patterns:     ['hextom', 'free-shipping-bar'],
    domain_patterns:     ['cdn.hextom.com'],
    dom_patterns:        ['hextom-fsb'],
    cookie_patterns:     [],
    performance_impact:  'high',
    performance_notes:   'Injects render-blocking JS and CSS into every page load',
    replaceable_by_vaeo: true,
    regulatory_exempt:   false,
    description:         'Free shipping progress bar with customizable goals',
  },
  {
    app_id:              'shipscout',
    name:                'ShipScout',
    category:            'shipping',
    vendor:              'ShipScout',
    monthly_cost_usd:    9,
    script_patterns:     ['shipscout'],
    domain_patterns:     ['app.shipscout.io'],
    dom_patterns:        [],
    cookie_patterns:     [],
    performance_impact:  'medium',
    performance_notes:   'Async script with moderate payload',
    replaceable_by_vaeo: true,
    regulatory_exempt:   false,
    description:         'Shipping rate calculator and delivery estimator',
  },

  // ── REVIEWS ──────────────────────────────────────────────────────────────
  {
    app_id:              'judge_me',
    name:                'Judge.me',
    category:            'reviews',
    vendor:              'Judge.me',
    monthly_cost_usd:    15,
    script_patterns:     ['judge.me', 'judgeme'],
    domain_patterns:     ['judge.me'],
    dom_patterns:        ['jdgm-widget'],
    cookie_patterns:     [],
    performance_impact:  'medium',
    performance_notes:   'Loads review widgets with moderate script size',
    replaceable_by_vaeo: false,
    regulatory_exempt:   false,
    description:         'Product reviews with photos, Q&A, and SEO snippets',
  },
  {
    app_id:              'okendo',
    name:                'Okendo',
    category:            'reviews',
    vendor:              'Okendo',
    monthly_cost_usd:    19,
    script_patterns:     ['okendo'],
    domain_patterns:     ['cdn.okendo.io'],
    dom_patterns:        ['okendo-reviews'],
    cookie_patterns:     [],
    performance_impact:  'medium',
    performance_notes:   'Review widget with image/video uploads',
    replaceable_by_vaeo: false,
    regulatory_exempt:   false,
    description:         'Customer review platform with UGC content',
  },
  {
    app_id:              'loox',
    name:                'Loox',
    category:            'reviews',
    vendor:              'Loox',
    monthly_cost_usd:    9.99,
    script_patterns:     ['loox'],
    domain_patterns:     ['loox.io'],
    dom_patterns:        ['loox-rating'],
    cookie_patterns:     [],
    performance_impact:  'medium',
    performance_notes:   'Photo review carousels add moderate load',
    replaceable_by_vaeo: false,
    regulatory_exempt:   false,
    description:         'Photo reviews with referral and social proof widgets',
  },
  {
    app_id:              'stamped_io',
    name:                'Stamped.io',
    category:            'reviews',
    vendor:              'Stamped',
    monthly_cost_usd:    23,
    script_patterns:     ['stamped'],
    domain_patterns:     ['stamped.io'],
    dom_patterns:        ['stamped-reviews-widget'],
    cookie_patterns:     [],
    performance_impact:  'medium',
    performance_notes:   'Reviews and ratings widget with moderate JS payload',
    replaceable_by_vaeo: false,
    regulatory_exempt:   false,
    description:         'Reviews, ratings, and loyalty program platform',
  },

  // ── UPSELL ───────────────────────────────────────────────────────────────
  {
    app_id:              'one_click_upsell',
    name:                'Zipify One Click Upsell',
    category:            'upsell',
    vendor:              'Zipify',
    monthly_cost_usd:    35,
    script_patterns:     ['zipify', 'oneClickUpsell'],
    domain_patterns:     ['app.zipify.com'],
    dom_patterns:        [],
    cookie_patterns:     [],
    performance_impact:  'high',
    performance_notes:   'Post-purchase funnel scripts loaded on checkout pages',
    replaceable_by_vaeo: false,
    regulatory_exempt:   false,
    description:         'Post-purchase one-click upsell funnels',
  },
  {
    app_id:              'reconvert',
    name:                'ReConvert',
    category:            'upsell',
    vendor:              'ReConvert',
    monthly_cost_usd:    4.99,
    script_patterns:     ['reconvert'],
    domain_patterns:     ['reconvert.io'],
    dom_patterns:        [],
    cookie_patterns:     [],
    performance_impact:  'medium',
    performance_notes:   'Thank-you page upsell with moderate JS',
    replaceable_by_vaeo: false,
    regulatory_exempt:   false,
    description:         'Thank-you page and checkout upsell builder',
  },

  // ── POPUP / EMAIL CAPTURE ────────────────────────────────────────────────
  {
    app_id:              'sendwill',
    name:                'Sendwill',
    category:            'popup',
    vendor:              'Sendwill',
    monthly_cost_usd:    9,
    script_patterns:     ['sendwill'],
    domain_patterns:     ['sendwill.com'],
    dom_patterns:        [],
    cookie_patterns:     [],
    performance_impact:  'high',
    performance_notes:   'Popup scripts block interaction until loaded',
    replaceable_by_vaeo: true,
    regulatory_exempt:   false,
    description:         'Email popup and lead capture widget',
  },
  {
    app_id:              'privy',
    name:                'Privy',
    category:            'popup',
    vendor:              'Privy',
    monthly_cost_usd:    30,
    script_patterns:     ['privy'],
    domain_patterns:     ['widget.privy.com'],
    dom_patterns:        ['privy-popup'],
    cookie_patterns:     [],
    performance_impact:  'high',
    performance_notes:   'Multiple popups and banners with heavy JS bundle',
    replaceable_by_vaeo: true,
    regulatory_exempt:   false,
    description:         'Email popups, banners, spin wheels, and exit intent',
  },
  {
    app_id:              'klaviyo_popup',
    name:                'Klaviyo',
    category:            'popup',
    vendor:              'Klaviyo',
    monthly_cost_usd:    0,
    script_patterns:     ['klaviyo'],
    domain_patterns:     ['static.klaviyo.com'],
    dom_patterns:        ['klaviyo-form'],
    cookie_patterns:     [],
    performance_impact:  'high',
    performance_notes:   'Large tracking + popup JS bundle on every page',
    replaceable_by_vaeo: false,
    regulatory_exempt:   false,
    description:         'Email/SMS marketing with embedded signup forms',
  },

  // ── CHAT ─────────────────────────────────────────────────────────────────
  {
    app_id:              'intercom',
    name:                'Intercom',
    category:            'chat',
    vendor:              'Intercom',
    monthly_cost_usd:    39,
    script_patterns:     ['intercom'],
    domain_patterns:     ['widget.intercom.io'],
    dom_patterns:        ['intercom-container'],
    cookie_patterns:     [],
    performance_impact:  'critical',
    performance_notes:   'Heavy widget with websocket connection, large JS bundle (>200KB)',
    replaceable_by_vaeo: false,
    regulatory_exempt:   false,
    description:         'Customer messaging platform with live chat widget',
  },
  {
    app_id:              'tidio',
    name:                'Tidio',
    category:            'chat',
    vendor:              'Tidio',
    monthly_cost_usd:    19,
    script_patterns:     ['tidio'],
    domain_patterns:     ['code.tidio.co'],
    dom_patterns:        [],
    cookie_patterns:     [],
    performance_impact:  'high',
    performance_notes:   'Chat widget with real-time connection overhead',
    replaceable_by_vaeo: false,
    regulatory_exempt:   false,
    description:         'Live chat and chatbot platform',
  },
  {
    app_id:              'gorgias',
    name:                'Gorgias',
    category:            'chat',
    vendor:              'Gorgias',
    monthly_cost_usd:    10,
    script_patterns:     ['gorgias'],
    domain_patterns:     ['config.gorgias.chat'],
    dom_patterns:        [],
    cookie_patterns:     [],
    performance_impact:  'high',
    performance_notes:   'Help desk chat widget with persistent connection',
    replaceable_by_vaeo: false,
    regulatory_exempt:   false,
    description:         'Helpdesk and customer support chat for e-commerce',
  },

  // ── SOCIAL PROOF / FEED ──────────────────────────────────────────────────
  {
    app_id:              'instafeed',
    name:                'Instafeed',
    category:            'social',
    vendor:              'Mintt',
    monthly_cost_usd:    3.99,
    script_patterns:     ['instafeed'],
    domain_patterns:     ['instafeed.net'],
    dom_patterns:        [],
    cookie_patterns:     [],
    performance_impact:  'medium',
    performance_notes:   'Loads Instagram images and renders feed grid',
    replaceable_by_vaeo: true,
    regulatory_exempt:   false,
    description:         'Instagram feed widget for Shopify stores',
  },
  {
    app_id:              'elfsight',
    name:                'Elfsight',
    category:            'social',
    vendor:              'Elfsight',
    monthly_cost_usd:    5,
    script_patterns:     ['elfsight'],
    domain_patterns:     ['apps.elfsight.com'],
    dom_patterns:        ['elfsight-app'],
    cookie_patterns:     [],
    performance_impact:  'high',
    performance_notes:   'Third-party iframe/script injection for social widgets',
    replaceable_by_vaeo: false,
    regulatory_exempt:   false,
    description:         'Social media feed and review widget platform',
  },

  // ── LOYALTY ──────────────────────────────────────────────────────────────
  {
    app_id:              'smile_io',
    name:                'Smile.io',
    category:            'loyalty',
    vendor:              'Smile.io',
    monthly_cost_usd:    49,
    script_patterns:     ['smile.io', 'swellrewards'],
    domain_patterns:     ['cdn.sweettooth.io'],
    dom_patterns:        ['smile-ui-container'],
    cookie_patterns:     [],
    performance_impact:  'high',
    performance_notes:   'Loyalty launcher widget with large JS bundle',
    replaceable_by_vaeo: false,
    regulatory_exempt:   false,
    description:         'Points, referrals, and VIP loyalty program',
  },
  {
    app_id:              'yotpo_loyalty',
    name:                'Yotpo Loyalty',
    category:            'loyalty',
    vendor:              'Yotpo',
    monthly_cost_usd:    0,
    script_patterns:     ['yotpo'],
    domain_patterns:     ['cdn.yotpo.com'],
    dom_patterns:        ['yotpo-widget'],
    cookie_patterns:     [],
    performance_impact:  'high',
    performance_notes:   'Combined reviews + loyalty widget with heavy assets',
    replaceable_by_vaeo: false,
    regulatory_exempt:   false,
    description:         'Loyalty and rewards program with review integration',
  },

  // ── ANALYTICS ────────────────────────────────────────────────────────────
  {
    app_id:              'lucky_orange',
    name:                'Lucky Orange',
    category:            'analytics',
    vendor:              'Lucky Orange',
    monthly_cost_usd:    18,
    script_patterns:     ['luckyorange'],
    domain_patterns:     ['cdn.luckyorange.com'],
    dom_patterns:        [],
    cookie_patterns:     [],
    performance_impact:  'critical',
    performance_notes:   'Session recording captures every DOM mutation — extremely heavy',
    replaceable_by_vaeo: false,
    regulatory_exempt:   false,
    description:         'Heatmaps, session recordings, and visitor analytics',
  },
  {
    app_id:              'hotjar',
    name:                'Hotjar',
    category:            'analytics',
    vendor:              'Hotjar',
    monthly_cost_usd:    32,
    script_patterns:     ['hotjar'],
    domain_patterns:     ['static.hotjar.com'],
    dom_patterns:        [],
    cookie_patterns:     ['_hj'],
    performance_impact:  'critical',
    performance_notes:   'Session recording and heatmap tracking on every page',
    replaceable_by_vaeo: false,
    regulatory_exempt:   false,
    description:         'Behavior analytics with heatmaps and session recordings',
  },
  {
    app_id:              'microsoft_clarity',
    name:                'Microsoft Clarity',
    category:            'analytics',
    vendor:              'Microsoft',
    monthly_cost_usd:    0,
    script_patterns:     ['clarity'],
    domain_patterns:     ['www.clarity.ms'],
    dom_patterns:        [],
    cookie_patterns:     ['_clck'],
    performance_impact:  'medium',
    performance_notes:   'Lightweight session recording with deferred loading',
    replaceable_by_vaeo: false,
    regulatory_exempt:   false,
    description:         'Free heatmaps and session recordings by Microsoft',
  },

  // ── EMAIL MARKETING ──────────────────────────────────────────────────────
  {
    app_id:              'omnisend',
    name:                'Omnisend',
    category:            'email',
    vendor:              'Omnisend',
    monthly_cost_usd:    16,
    script_patterns:     ['omnisend'],
    domain_patterns:     ['omnisend.com'],
    dom_patterns:        [],
    cookie_patterns:     [],
    performance_impact:  'medium',
    performance_notes:   'Tracking pixel and form script with moderate footprint',
    replaceable_by_vaeo: false,
    regulatory_exempt:   false,
    description:         'Email and SMS marketing automation for e-commerce',
  },
  {
    app_id:              'drip',
    name:                'Drip',
    category:            'email',
    vendor:              'Drip',
    monthly_cost_usd:    39,
    script_patterns:     ['drip'],
    domain_patterns:     ['tag.getdrip.com'],
    dom_patterns:        [],
    cookie_patterns:     [],
    performance_impact:  'medium',
    performance_notes:   'Tracking script with form injection',
    replaceable_by_vaeo: false,
    regulatory_exempt:   false,
    description:         'Email marketing automation for e-commerce',
  },

  // ── PAYMENTS ─────────────────────────────────────────────────────────────
  {
    app_id:              'afterpay',
    name:                'Afterpay',
    category:            'payments',
    vendor:              'Afterpay',
    monthly_cost_usd:    0,
    script_patterns:     ['afterpay'],
    domain_patterns:     ['js.afterpay.com'],
    dom_patterns:        ['afterpay-placement'],
    cookie_patterns:     [],
    performance_impact:  'low',
    performance_notes:   'Small badge/placement script, minimal overhead',
    replaceable_by_vaeo: false,
    regulatory_exempt:   true,
    description:         'Buy now, pay later payment option',
  },
  {
    app_id:              'klarna',
    name:                'Klarna',
    category:            'payments',
    vendor:              'Klarna',
    monthly_cost_usd:    0,
    script_patterns:     ['klarna'],
    domain_patterns:     ['x.klarnacdn.net'],
    dom_patterns:        ['klarna-placement'],
    cookie_patterns:     [],
    performance_impact:  'low',
    performance_notes:   'Lightweight messaging badge script',
    replaceable_by_vaeo: false,
    regulatory_exempt:   true,
    description:         'Buy now, pay later with flexible payment options',
  },
  {
    app_id:              'recharge',
    name:                'ReCharge Subscriptions',
    category:            'payments',
    vendor:              'ReCharge',
    monthly_cost_usd:    0,
    script_patterns:     ['recharge'],
    domain_patterns:     ['cdn.rechargeapps.com'],
    dom_patterns:        [],
    cookie_patterns:     [],
    performance_impact:  'medium',
    performance_notes:   'Subscription widget with moderate JS bundle',
    replaceable_by_vaeo: false,
    regulatory_exempt:   true,
    description:         'Subscription billing and recurring payments',
  },

  // ── SEO ──────────────────────────────────────────────────────────────────
  {
    app_id:              'smart_seo',
    name:                'Smart SEO',
    category:            'seo',
    vendor:              'Sherpas Design',
    monthly_cost_usd:    9.99,
    script_patterns:     ['smart-seo'],
    domain_patterns:     ['smart-seo.app'],
    dom_patterns:        [],
    cookie_patterns:     [],
    performance_impact:  'low',
    performance_notes:   'Backend-only SEO optimization, minimal frontend impact',
    replaceable_by_vaeo: true,
    regulatory_exempt:   false,
    description:         'SEO meta tags, JSON-LD, and sitemap generator',
  },
  {
    app_id:              'seo_king',
    name:                'SEO King',
    category:            'seo',
    vendor:              'SEO King',
    monthly_cost_usd:    7.99,
    script_patterns:     ['seo-king'],
    domain_patterns:     ['seo-king.app'],
    dom_patterns:        [],
    cookie_patterns:     [],
    performance_impact:  'low',
    performance_notes:   'Backend SEO tooling with minimal JS overhead',
    replaceable_by_vaeo: true,
    regulatory_exempt:   false,
    description:         'SEO optimization toolkit for Shopify',
  },

  // ── FORMS ────────────────────────────────────────────────────────────────
  {
    app_id:              'shopify_forms',
    name:                'Shopify Forms',
    category:            'forms',
    vendor:              'Shopify',
    monthly_cost_usd:    0,
    script_patterns:     ['shopify-forms'],
    domain_patterns:     ['forms.shopifyapps.com'],
    dom_patterns:        [],
    cookie_patterns:     [],
    performance_impact:  'low',
    performance_notes:   'Native Shopify app with optimized loading',
    replaceable_by_vaeo: false,
    regulatory_exempt:   false,
    description:         'Built-in Shopify email capture forms',
  },
  {
    app_id:              'hulk_form_builder',
    name:                'Hulk Form Builder',
    category:            'forms',
    vendor:              'HulkApps',
    monthly_cost_usd:    9.90,
    script_patterns:     ['hulkapps'],
    domain_patterns:     ['hulkcode.com'],
    dom_patterns:        [],
    cookie_patterns:     [],
    performance_impact:  'medium',
    performance_notes:   'Form builder with conditional logic JS',
    replaceable_by_vaeo: false,
    regulatory_exempt:   false,
    description:         'Custom form builder with file uploads and logic',
  },

  // ── OTHER ────────────────────────────────────────────────────────────────
  {
    app_id:              'amazon_reviews',
    name:                'Amazon Reviews Import',
    category:            'other',
    vendor:              'Amazon',
    monthly_cost_usd:    0,
    script_patterns:     ['amazon'],
    domain_patterns:     ['z-na.amazon-adsystem.com'],
    dom_patterns:        [],
    cookie_patterns:     [],
    performance_impact:  'medium',
    performance_notes:   'External Amazon script with cross-origin overhead',
    replaceable_by_vaeo: false,
    regulatory_exempt:   false,
    description:         'Import and display Amazon product reviews',
  },
  {
    app_id:              'g_combined_listings',
    name:                'Google Shopping',
    category:            'other',
    vendor:              'Google',
    monthly_cost_usd:    0,
    script_patterns:     ['google-shopping'],
    domain_patterns:     ['shop.app'],
    dom_patterns:        [],
    cookie_patterns:     [],
    performance_impact:  'low',
    performance_notes:   'Lightweight Google Merchant Center integration',
    replaceable_by_vaeo: false,
    regulatory_exempt:   false,
    description:         'Google Shopping feed and product listing integration',
  },
];

// ── Lookup helpers ───────────────────────────────────────────────────────────

export function getAppById(id: string): AppFingerprint | undefined {
  return APP_FINGERPRINT_CATALOG.find((a) => a.app_id === id);
}

export function getAppsByCategory(category: AppCategory): AppFingerprint[] {
  return APP_FINGERPRINT_CATALOG.filter((a) => a.category === category);
}

export function getReplaceableApps(): AppFingerprint[] {
  return APP_FINGERPRINT_CATALOG.filter((a) => a.replaceable_by_vaeo);
}

export function getRegulatoryExemptApps(): AppFingerprint[] {
  return APP_FINGERPRINT_CATALOG.filter((a) => a.regulatory_exempt);
}
