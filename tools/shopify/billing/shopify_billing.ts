/**
 * tools/shopify/billing/shopify_billing.ts
 *
 * Shopify Billing API integration.
 * Shopify requires all charges for public apps to go through their billing API.
 * Stripe remains for non-Shopify customers; this is the Shopify-first path.
 *
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShopifyPlan {
  name:       string;
  price:      number;
  currency:   'USD';
  interval:   'EVERY_30_DAYS' | 'ANNUAL';
  trial_days: number;
  features:   string[];
}

// ── Plans ─────────────────────────────────────────────────────────────────────

export const SHOPIFY_PLANS: ShopifyPlan[] = [
  {
    name:       'starter',
    price:      49,
    currency:   'USD',
    interval:   'EVERY_30_DAYS',
    trial_days: 14,
    features:   [
      '1 Shopify store',
      'Automated title & meta tag fixes',
      'SEO health score',
      'Weekly email digest',
    ],
  },
  {
    name:       'pro',
    price:      149,
    currency:   'USD',
    interval:   'EVERY_30_DAYS',
    trial_days: 14,
    features:   [
      'Up to 5 stores',
      'Schema.org structured data injection',
      'AI-generated fix confidence scores',
      'Fix history & rollback',
      'AEO visibility score',
    ],
  },
  {
    name:       'agency_starter',
    price:      299,
    currency:   'USD',
    interval:   'EVERY_30_DAYS',
    trial_days: 14,
    features:   [
      'Up to 15 stores',
      'Agency dashboard',
      'White-label reports',
      'Bulk fix operations',
      'Priority support',
    ],
  },
  {
    name:       'agency_growth',
    price:      799,
    currency:   'USD',
    interval:   'EVERY_30_DAYS',
    trial_days: 14,
    features:   [
      'Up to 50 stores',
      'Multi-site job orchestration',
      'Custom domain branding',
      'Advanced analytics',
      'Dedicated onboarding',
    ],
  },
  {
    name:       'agency_enterprise',
    price:      1999,
    currency:   'USD',
    interval:   'EVERY_30_DAYS',
    trial_days: 14,
    features:   [
      'Unlimited stores',
      'SLA guarantee',
      'Custom integrations',
      'Dedicated account manager',
      'Enterprise billing',
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function shopifyAdminGraphQLUrl(shopDomain: string): string {
  const domain = shopDomain.includes('.myshopify.com')
    ? shopDomain
    : `${shopDomain}.myshopify.com`;
  return `https://${domain}/admin/api/2025-01/graphql.json`;
}

function getAccessToken(shopDomain: string): string {
  // In production, look up the stored access token for this shop
  return process.env[`SHOPIFY_TOKEN_${shopDomain.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`]
    ?? process.env.SHOPIFY_ADMIN_TOKEN
    ?? '';
}

type GraphQLFn = (
  url:     string,
  token:   string,
  query:   string,
  variables: Record<string, unknown>,
) => Promise<{ data?: unknown; errors?: unknown[] }>;

async function defaultGraphQL(
  url:       string,
  token:     string,
  query:     string,
  variables: Record<string, unknown>,
): Promise<{ data?: unknown; errors?: unknown[] }> {
  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':                  'application/json',
      'X-Shopify-Access-Token':        token,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json() as Promise<{ data?: unknown; errors?: unknown[] }>;
}

// ── createShopifySubscription ─────────────────────────────────────────────────

export async function createShopifySubscription(
  shop_domain: string,
  plan:        ShopifyPlan,
  return_url:  string,
  deps?:       { graphqlFn?: GraphQLFn },
): Promise<{ confirmation_url: string; subscription_id: string } | null> {
  try {
    const graphql   = deps?.graphqlFn ?? defaultGraphQL;
    const url       = shopifyAdminGraphQLUrl(shop_domain);
    const token     = getAccessToken(shop_domain);

    const query = `
      mutation appSubscriptionCreate(
        $name: String!,
        $lineItems: [AppSubscriptionLineItemInput!]!,
        $returnUrl: URL!,
        $trialDays: Int
      ) {
        appSubscriptionCreate(
          name: $name
          lineItems: $lineItems
          returnUrl: $returnUrl
          trialDays: $trialDays
        ) {
          appSubscription { id }
          confirmationUrl
          userErrors { field message }
        }
      }
    `;

    const variables = {
      name:      `Velocity AEO — ${plan.name}`,
      returnUrl: return_url,
      trialDays: plan.trial_days,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price:    { amount: plan.price, currencyCode: plan.currency },
              interval: plan.interval,
            },
          },
        },
      ],
    };

    const resp = await graphql(url, token, query, variables);
    const result = (resp.data as any)?.appSubscriptionCreate;

    if (!result || result.userErrors?.length > 0) return null;

    const subscription_id = result.appSubscription?.id ?? '';
    const confirmation_url = result.confirmationUrl ?? '';

    if (!confirmation_url) return null;

    return { confirmation_url, subscription_id };
  } catch {
    return null;
  }
}

// ── getShopifySubscription ────────────────────────────────────────────────────

export async function getShopifySubscription(
  shop_domain:     string,
  subscription_id: string,
  deps?:           { graphqlFn?: GraphQLFn },
): Promise<{ status: string; plan_name: string; activated_on: string | null } | null> {
  try {
    const graphql = deps?.graphqlFn ?? defaultGraphQL;
    const url     = shopifyAdminGraphQLUrl(shop_domain);
    const token   = getAccessToken(shop_domain);

    const query = `
      query getAppSubscription($id: ID!) {
        node(id: $id) {
          ... on AppSubscription {
            id
            status
            name
            createdAt
          }
        }
      }
    `;

    const resp   = await graphql(url, token, query, { id: subscription_id });
    const node   = (resp.data as any)?.node;
    if (!node) return null;

    return {
      status:       node.status ?? 'UNKNOWN',
      plan_name:    node.name ?? '',
      activated_on: node.createdAt ?? null,
    };
  } catch {
    return null;
  }
}

// ── cancelShopifySubscription ─────────────────────────────────────────────────

export async function cancelShopifySubscription(
  shop_domain:     string,
  subscription_id: string,
  deps?:           { graphqlFn?: GraphQLFn },
): Promise<boolean> {
  try {
    const graphql = deps?.graphqlFn ?? defaultGraphQL;
    const url     = shopifyAdminGraphQLUrl(shop_domain);
    const token   = getAccessToken(shop_domain);

    const query = `
      mutation appSubscriptionCancel($id: ID!) {
        appSubscriptionCancel(id: $id) {
          appSubscription { id status }
          userErrors { field message }
        }
      }
    `;

    const resp   = await graphql(url, token, query, { id: subscription_id });
    const result = (resp.data as any)?.appSubscriptionCancel;

    if (!result || result.userErrors?.length > 0) return false;
    return true;
  } catch {
    return false;
  }
}
