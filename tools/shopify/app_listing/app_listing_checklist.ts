/**
 * tools/shopify/app_listing/app_listing_checklist.ts
 *
 * Shopify App Store submission checklist.
 * Tracks technical and listing content requirements for public app approval.
 *
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AppListingRequirement {
  id:          string;
  category:    string;
  requirement: string;
  status:      'complete' | 'incomplete' | 'manual';
  notes:       string | null;
}

// ── Requirements ──────────────────────────────────────────────────────────────

export const APP_LISTING_REQUIREMENTS: AppListingRequirement[] = [
  // ── Technical ──────────────────────────────────────────────────────────────

  {
    id:          'gdpr_data_request_webhook',
    category:    'Technical',
    requirement: 'GDPR customers/data_request webhook',
    status:      'complete',
    notes:       'POST /api/shopify/gdpr/customers/data_request — HMAC validated, logs to shopify_gdpr_requests',
  },
  {
    id:          'gdpr_customer_redact_webhook',
    category:    'Technical',
    requirement: 'GDPR customers/redact webhook',
    status:      'complete',
    notes:       'POST /api/shopify/gdpr/customers/redact — HMAC validated, queues redaction',
  },
  {
    id:          'gdpr_shop_redact_webhook',
    category:    'Technical',
    requirement: 'GDPR shop/redact webhook',
    status:      'complete',
    notes:       'POST /api/shopify/gdpr/shop/redact — HMAC validated, queues full shop deletion',
  },
  {
    id:          'shopify_billing_api',
    category:    'Technical',
    requirement: 'Shopify Billing API (appSubscriptionCreate)',
    status:      'complete',
    notes:       'tools/shopify/billing/shopify_billing.ts — all charges routed through Shopify billing',
  },
  {
    id:          'oauth_flow',
    category:    'Technical',
    requirement: 'OAuth 2.0 install flow',
    status:      'complete',
    notes:       'apps/dashboard/app/api/shopify/install and /callback routes implemented',
  },
  {
    id:          'app_uninstall_webhook',
    category:    'Technical',
    requirement: 'app/uninstalled webhook',
    status:      'complete',
    notes:       'POST /api/shopify/webhooks/app/uninstalled — marks site uninstalled, preserves data 30 days',
  },
  {
    id:          'mandatory_scopes_only',
    category:    'Technical',
    requirement: 'Requested OAuth scopes match actual usage',
    status:      'manual',
    notes:       'Verify requested scopes match actual usage in Partner dashboard. Review tools/shopify/oauth_scopes.ts.',
  },
  {
    id:          'https_only',
    category:    'Technical',
    requirement: 'HTTPS-only app URLs',
    status:      'complete',
    notes:       'All routes served over HTTPS. NEXT_PUBLIC_BASE_URL must be https://',
  },

  // ── Listing content ────────────────────────────────────────────────────────

  {
    id:          'app_name',
    category:    'Listing Content',
    requirement: 'App name',
    status:      'complete',
    notes:       'Velocity AEO',
  },
  {
    id:          'app_description',
    category:    'Listing Content',
    requirement: 'App description (150 words)',
    status:      'manual',
    notes:       'Write 150-word description for Partner dashboard. See tools/shopify/app_listing.ts for draft copy.',
  },
  {
    id:          'app_icon',
    category:    'Listing Content',
    requirement: 'App icon (1200×1200px)',
    status:      'manual',
    notes:       'Upload 1200×1200px icon to Partner dashboard. Must be PNG, no text, rounded corners.',
  },
  {
    id:          'screenshots',
    category:    'Listing Content',
    requirement: 'App screenshots (5× at 1600×900px)',
    status:      'manual',
    notes:       'Upload 5 screenshots at 1600×900px showing key features: dashboard, fix review, health score, schema, rankings.',
  },
  {
    id:          'demo_store',
    category:    'Listing Content',
    requirement: 'Demo store URL',
    status:      'complete',
    notes:       'cococabanalife.com — Shopify store with VAEO installed',
  },
  {
    id:          'privacy_policy_url',
    category:    'Listing Content',
    requirement: 'Privacy policy URL',
    status:      'manual',
    notes:       'Add privacy policy URL to Partner dashboard. Must be accessible and cover data handling.',
  },
  {
    id:          'support_email',
    category:    'Listing Content',
    requirement: 'Support email address',
    status:      'manual',
    notes:       'Add support email to Partner dashboard. Shopify will contact this for review questions.',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getIncompleteRequirements(
  requirements: AppListingRequirement[],
): AppListingRequirement[] {
  try {
    if (!Array.isArray(requirements)) return [];
    return requirements.filter(r => r.status === 'incomplete' || r.status === 'manual');
  } catch {
    return [];
  }
}

export function getSubmissionReadiness(requirements: AppListingRequirement[]): {
  ready:      boolean;
  complete:   number;
  incomplete: number;
  manual:     number;
  blocking:   AppListingRequirement[];
} {
  try {
    if (!Array.isArray(requirements)) {
      return { ready: false, complete: 0, incomplete: 0, manual: 0, blocking: [] };
    }

    const complete   = requirements.filter(r => r.status === 'complete').length;
    const incomplete = requirements.filter(r => r.status === 'incomplete').length;
    const manual     = requirements.filter(r => r.status === 'manual').length;
    const blocking   = requirements.filter(r => r.status === 'incomplete');

    // ready: true only when zero blocking (incomplete) items
    // manual items need human action but are not code-blocking
    return {
      ready:    incomplete === 0,
      complete,
      incomplete,
      manual,
      blocking,
    };
  } catch {
    return { ready: false, complete: 0, incomplete: 0, manual: 0, blocking: [] };
  }
}
