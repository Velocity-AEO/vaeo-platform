/**
 * tools/shopify/shopify_onboarding.ts
 *
 * Shopify onboarding state machine for non-technical clients. Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ShopifyOnboardingStep =
  | 'enter_domain'
  | 'install_app'
  | 'authorize_oauth'
  | 'verify_connection'
  | 'register_site'
  | 'complete';

export interface ShopifyOnboardingState {
  step:                ShopifyOnboardingStep;
  site_id?:            string;
  shop_domain?:        string;
  access_token?:       string;
  connection_verified: boolean;
  scopes_granted:      string[];
  error?:              string;
  completed_at?:       string;
}

const STEP_ORDER: ShopifyOnboardingStep[] = [
  'enter_domain',
  'install_app',
  'authorize_oauth',
  'verify_connection',
  'register_site',
  'complete',
];

// ── buildShopifyOnboardingState ───────────────────────────────────────────────

export function buildShopifyOnboardingState(): ShopifyOnboardingState {
  try {
    return {
      step: 'enter_domain',
      connection_verified: false,
      scopes_granted: [],
    };
  } catch {
    return {
      step: 'enter_domain',
      connection_verified: false,
      scopes_granted: [],
    };
  }
}

// ── advanceShopifyOnboarding ──────────────────────────────────────────────────

export function advanceShopifyOnboarding(
  state: ShopifyOnboardingState,
  result: Partial<ShopifyOnboardingState>,
): ShopifyOnboardingState {
  try {
    const merged = { ...state, ...result, error: result.error };
    const currentIdx = STEP_ORDER.indexOf(merged.step);
    if (currentIdx >= 0 && currentIdx < STEP_ORDER.length - 1) {
      merged.step = STEP_ORDER[currentIdx + 1];
    }
    if (merged.step === 'complete') {
      merged.completed_at = merged.completed_at ?? new Date().toISOString();
    }
    return merged;
  } catch {
    return state ?? buildShopifyOnboardingState();
  }
}

// ── getShopifyOnboardingProgress ──────────────────────────────────────────────

export function getShopifyOnboardingProgress(
  state: ShopifyOnboardingState,
): { step_number: number; total_steps: number; percent: number } {
  try {
    const total = STEP_ORDER.length;
    const idx = STEP_ORDER.indexOf(state?.step ?? 'enter_domain');
    const step_number = (idx >= 0 ? idx : 0) + 1;
    const percent = Math.round(((step_number - 1) / (total - 1)) * 100);
    return { step_number, total_steps: total, percent };
  } catch {
    return { step_number: 1, total_steps: STEP_ORDER.length, percent: 0 };
  }
}

// ── buildShopifyInstallUrl ────────────────────────────────────────────────────

export function buildShopifyInstallUrl(
  shop_domain: string,
  client_id: string,
  redirect_uri: string,
  scopes: string[],
): string {
  try {
    const shop = (shop_domain ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    const scope = (scopes ?? []).join(',');
    const nonce = Math.random().toString(36).slice(2, 12);
    return `https://${shop}/admin/oauth/authorize?client_id=${encodeURIComponent(client_id)}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirect_uri)}&state=${nonce}`;
  } catch {
    return '';
  }
}
