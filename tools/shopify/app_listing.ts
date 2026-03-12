/**
 * tools/shopify/app_listing.ts
 *
 * Shopify App Store listing copy for Velocity AEO.
 * Pure functions — no I/O, never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface AppListingSection {
  title:   string;
  content: string;
}

export interface AppListing {
  app_name:           string;
  tagline:            string;
  description:        string;
  key_benefits:       string[];
  how_it_works:       AppListingSection[];
  faqs:               Array<{ question: string; answer: string }>;
  support_email:      string;
  privacy_policy_url: string;
}

// ── Listing content ──────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://app.velocityaeo.com';

export const APP_LISTING: AppListing = {
  app_name: 'Velocity AEO',
  tagline:  'Automated SEO execution for Shopify stores',

  description:
    'Velocity AEO automatically finds and fixes SEO issues across your Shopify store. ' +
    'It optimizes title tags, meta descriptions, and injects schema.org structured data — ' +
    'all without touching your theme code manually. Get a real-time health score, ' +
    'review fixes with confidence scores, and deploy with one click.',

  key_benefits: [
    'Automated title and meta tag optimization that improves click-through rates',
    'Schema.org structured data injection for rich search results',
    'Real-time SEO health score with actionable breakdown',
    'One-click fix approval and deployment directly to your theme',
    'Weekly performance digest with before/after metrics',
  ],

  how_it_works: [
    {
      title:   'Connect',
      content: 'Install Velocity AEO and authorize access to your store. ' +
               'VAEO immediately crawls your pages, detecting SEO issues ' +
               'and opportunities for structured data.',
    },
    {
      title:   'Review',
      content: 'Fixes surface in your dashboard with confidence scores ' +
               'and before/after previews. Each fix shows exactly what ' +
               'will change and why it improves your SEO.',
    },
    {
      title:   'Deploy',
      content: 'One click applies fixes directly to your Shopify theme. ' +
               'Every change is tracked and reversible — roll back any ' +
               'fix instantly if needed.',
    },
  ],

  faqs: [
    {
      question: 'What does Velocity AEO do?',
      answer:   'Velocity AEO crawls your Shopify store, identifies SEO issues ' +
                '(missing titles, meta descriptions, schema markup), and generates ' +
                'fixes that you can review and deploy with one click.',
    },
    {
      question: 'How are fixes applied to my store?',
      answer:   'Fixes are applied through the Shopify Theme API. VAEO modifies ' +
                'your theme\'s Liquid templates to add optimized meta tags and ' +
                'schema.org JSON-LD. Every change is reversible.',
    },
    {
      question: 'Will this affect my store\'s performance?',
      answer:   'No. VAEO adds lightweight meta tags and JSON-LD structured data ' +
                'that search engines expect. These additions do not impact page ' +
                'load speed or store performance.',
    },
    {
      question: 'How do I undo a fix?',
      answer:   'Every fix can be rolled back with one click from the dashboard. ' +
                'VAEO keeps a rollback manifest for each deployment, so your ' +
                'original theme code is always recoverable.',
    },
    {
      question: 'How much does Velocity AEO cost?',
      answer:   'Velocity AEO offers a Starter plan for individual stores, ' +
                'a Pro plan for growing businesses with up to 5 sites, and an ' +
                'Enterprise plan for agencies. Visit our billing page for details.',
    },
  ],

  support_email:      'support@velocityaeo.com',
  privacy_policy_url: `${BASE_URL}/privacy`,
};

// ── Markdown generator ───────────────────────────────────────────────────────

export function generateListingMarkdown(): string {
  const l = APP_LISTING;
  const lines: string[] = [];

  lines.push(`# ${l.app_name}`);
  lines.push('');
  lines.push(`*${l.tagline}*`);
  lines.push('');
  lines.push('## Description');
  lines.push('');
  lines.push(l.description);
  lines.push('');
  lines.push('## Key Benefits');
  lines.push('');
  for (const b of l.key_benefits) {
    lines.push(`- ${b}`);
  }
  lines.push('');
  lines.push('## How It Works');
  lines.push('');
  for (const section of l.how_it_works) {
    lines.push(`### ${section.title}`);
    lines.push('');
    lines.push(section.content);
    lines.push('');
  }
  lines.push('## FAQ');
  lines.push('');
  for (const faq of l.faqs) {
    lines.push(`**${faq.question}**`);
    lines.push('');
    lines.push(faq.answer);
    lines.push('');
  }
  lines.push('## Support');
  lines.push('');
  lines.push(`Email: ${l.support_email}`);
  lines.push('');
  lines.push(`Privacy Policy: ${l.privacy_policy_url}`);
  lines.push('');

  return lines.join('\n');
}

// ── JSON generator ───────────────────────────────────────────────────────────

export function generateListingJson(): string {
  return JSON.stringify(APP_LISTING, null, 2);
}
