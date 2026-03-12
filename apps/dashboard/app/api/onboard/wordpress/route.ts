import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

// ── Inline types (avoid Next.js bundler import issues) ───────────────────────

type WPOnboardingStep =
  | 'enter_url'
  | 'generate_password'
  | 'enter_credentials'
  | 'verify_connection'
  | 'detect_plugins'
  | 'register_site'
  | 'complete';

interface WPOnboardingState {
  step:                WPOnboardingStep;
  site_id?:            string;
  wp_url?:             string;
  username?:           string;
  app_password?:       string;
  connection_verified: boolean;
  plugins_detected:    string[];
  seo_coverage?:       SEOCoverage;
  error?:              string;
  completed_at?:       string;
}

type SEOPlugin = 'yoast' | 'rankmath' | 'aioseo' | 'none';

interface SEOCoverage {
  seo_plugin:      SEOPlugin;
  has_sitemap:     boolean;
  has_schema:      boolean;
  has_og_tags:     boolean;
  has_meta_robots: boolean;
  managed_fields:  string[];
}

// ── Step order ───────────────────────────────────────────────────────────────

const STEP_ORDER: WPOnboardingStep[] = [
  'enter_url', 'generate_password', 'enter_credentials',
  'verify_connection', 'detect_plugins', 'register_site', 'complete',
];

function nextStep(current: WPOnboardingStep): WPOnboardingStep {
  const idx = STEP_ORDER.indexOf(current);
  if (idx >= 0 && idx < STEP_ORDER.length - 1) return STEP_ORDER[idx + 1];
  return current;
}

// ── Simulated connection check ───────────────────────────────────────────────

function simulateVerifyConnection(wp_url: string, username: string): boolean {
  return (wp_url ?? '').startsWith('https://') && (username ?? '').length > 0;
}

// ── Simulated plugin detection ───────────────────────────────────────────────

function simulateDetectPlugins(domain: string): {
  plugins: string[];
  seo_coverage: SEOCoverage;
} {
  let h = 0;
  for (const c of domain) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  h = Math.abs(h);

  const pluginPool = [
    'yoast-seo', 'rankmath', 'jetpack', 'woocommerce',
    'contact-form-7', 'elementor', 'wp-super-cache',
  ];
  const detected: string[] = [];
  for (let i = 0; i < 3 + (h % 3); i++) {
    const p = pluginPool[(h + i) % pluginPool.length];
    if (!detected.includes(p)) detected.push(p);
  }

  const seoPlugin: SEOPlugin = detected.includes('yoast-seo')
    ? 'yoast'
    : detected.includes('rankmath')
      ? 'rankmath'
      : 'none';

  return {
    plugins: detected,
    seo_coverage: {
      seo_plugin: seoPlugin,
      has_sitemap: seoPlugin !== 'none',
      has_schema: seoPlugin !== 'none',
      has_og_tags: seoPlugin !== 'none',
      has_meta_robots: true,
      managed_fields: seoPlugin !== 'none'
        ? ['title', 'meta_description', 'og_tags']
        : [],
    },
  };
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { step, state, payload } = body as {
      step: WPOnboardingStep;
      state: WPOnboardingState;
      payload: Record<string, string>;
    };

    const s: WPOnboardingState = state ?? {
      step: 'enter_url',
      connection_verified: false,
      plugins_detected: [],
    };

    switch (step) {
      case 'enter_url': {
        const url = payload?.wp_url ?? '';
        if (!url.startsWith('https://')) {
          return NextResponse.json({
            state: { ...s, error: 'URL must start with https://' },
            message: 'Invalid URL format',
          }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
        }
        const next: WPOnboardingState = {
          ...s, wp_url: url, step: nextStep('enter_url'), error: undefined,
        };
        return NextResponse.json({
          state: next,
          message: 'URL accepted. Next: generate an application password.',
        }, { headers: { 'Cache-Control': 'no-store' } });
      }

      case 'generate_password': {
        const next: WPOnboardingState = {
          ...s, step: nextStep('generate_password'), error: undefined,
        };
        return NextResponse.json({
          state: next,
          message: 'Ready for credentials.',
        }, { headers: { 'Cache-Control': 'no-store' } });
      }

      case 'enter_credentials': {
        const username = payload?.username ?? '';
        const app_password = payload?.app_password ?? '';
        if (!username || !app_password) {
          return NextResponse.json({
            state: { ...s, error: 'Username and password are required' },
            message: 'Missing credentials',
          }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
        }
        const next: WPOnboardingState = {
          ...s, username, app_password,
          step: nextStep('enter_credentials'), error: undefined,
        };
        return NextResponse.json({
          state: next,
          message: 'Credentials saved. Verifying connection...',
        }, { headers: { 'Cache-Control': 'no-store' } });
      }

      case 'verify_connection': {
        const verified = simulateVerifyConnection(s.wp_url ?? '', s.username ?? '');
        if (!verified) {
          return NextResponse.json({
            state: { ...s, connection_verified: false, error: 'Connection failed. Check URL and credentials.' },
            message: 'Connection verification failed.',
          }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
        }
        const next: WPOnboardingState = {
          ...s, connection_verified: true,
          step: nextStep('verify_connection'), error: undefined,
        };
        return NextResponse.json({
          state: next,
          message: 'Connection verified! Detecting plugins...',
        }, { headers: { 'Cache-Control': 'no-store' } });
      }

      case 'detect_plugins': {
        const domain = (s.wp_url ?? '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        const { plugins, seo_coverage } = simulateDetectPlugins(domain);
        const next: WPOnboardingState = {
          ...s, plugins_detected: plugins, seo_coverage,
          step: nextStep('detect_plugins'), error: undefined,
        };
        return NextResponse.json({
          state: next,
          message: `Detected ${plugins.length} plugins. Ready to register.`,
        }, { headers: { 'Cache-Control': 'no-store' } });
      }

      case 'register_site': {
        const siteId = `wp-${randomUUID().slice(0, 8)}`;
        const next: WPOnboardingState = {
          ...s, site_id: siteId,
          step: nextStep('register_site'),
          completed_at: new Date().toISOString(),
          error: undefined,
        };
        return NextResponse.json({
          state: next,
          message: `Site registered with ID: ${siteId}`,
        }, { headers: { 'Cache-Control': 'no-store' } });
      }

      case 'complete': {
        return NextResponse.json({
          state: s,
          message: 'Onboarding complete!',
        }, { headers: { 'Cache-Control': 'no-store' } });
      }

      default:
        return NextResponse.json({
          state: s,
          message: `Unknown step: ${step}`,
        }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
  } catch (err) {
    return NextResponse.json(
      { state: null, message: 'Internal error during onboarding' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
