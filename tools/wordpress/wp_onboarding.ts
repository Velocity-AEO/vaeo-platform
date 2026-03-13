/**
 * tools/wordpress/wp_onboarding.ts
 *
 * Multi-step onboarding state machine for WordPress credential flow.
 * Non-technical clients can connect their WP site without a terminal.
 *
 * Never throws.
 */

import type { SEOCoverage } from './plugin_conflict_detector.js';
import type { WPMultisiteConfig } from './wp_multisite_detector.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type WPOnboardingStep =
  | 'enter_url'
  | 'generate_password'
  | 'enter_credentials'
  | 'verify_connection'
  | 'detect_plugins'
  | 'register_site'
  | 'complete';

export interface WPOnboardingState {
  step:                  WPOnboardingStep;
  site_id?:              string;
  wp_url?:               string;
  username?:             string;
  app_password?:         string;
  connection_verified:   boolean;
  plugins_detected:      string[];
  seo_coverage?:         SEOCoverage;
  is_multisite?:         boolean;
  multisite_config?:     WPMultisiteConfig;
  error?:                string;
  completed_at?:         string;
}

// ── Step sequence ─────────────────────────────────────────────────────────────

const STEP_ORDER: WPOnboardingStep[] = [
  'enter_url',
  'generate_password',
  'enter_credentials',
  'verify_connection',
  'detect_plugins',
  'register_site',
  'complete',
];

// ── buildOnboardingState ──────────────────────────────────────────────────────

export function buildOnboardingState(): WPOnboardingState {
  try {
    return {
      step: 'enter_url',
      connection_verified: false,
      plugins_detected: [],
    };
  } catch {
    return {
      step: 'enter_url',
      connection_verified: false,
      plugins_detected: [],
    };
  }
}

// ── advanceOnboarding ─────────────────────────────────────────────────────────

export function advanceOnboarding(
  state: WPOnboardingState,
  result: Partial<WPOnboardingState>,
): WPOnboardingState {
  try {
    const s = state ?? buildOnboardingState();
    const merged: WPOnboardingState = { ...s, ...result, error: undefined };

    // Advance to next step
    const currentIdx = STEP_ORDER.indexOf(merged.step);
    if (currentIdx >= 0 && currentIdx < STEP_ORDER.length - 1) {
      merged.step = STEP_ORDER[currentIdx + 1];
    }

    // Mark complete if at final step
    if (merged.step === 'complete' && !merged.completed_at) {
      merged.completed_at = new Date().toISOString();
    }

    return merged;
  } catch {
    return state ?? buildOnboardingState();
  }
}

// ── getOnboardingProgress ─────────────────────────────────────────────────────

export function getOnboardingProgress(
  state: WPOnboardingState,
): { step_number: number; total_steps: number; percent: number } {
  try {
    const s = state ?? buildOnboardingState();
    const total = STEP_ORDER.length;
    const idx = STEP_ORDER.indexOf(s.step);
    const stepNumber = idx >= 0 ? idx + 1 : 1;
    const percent = Math.round((stepNumber / total) * 100);

    return { step_number: stepNumber, total_steps: total, percent };
  } catch {
    return { step_number: 1, total_steps: 7, percent: 14 };
  }
}
