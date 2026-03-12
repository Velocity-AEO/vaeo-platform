/**
 * tools/agency/agency_signup.ts
 *
 * Agency self-serve signup state machine.
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgencySignupStep =
  | 'choose_plan'
  | 'agency_details'
  | 'owner_account'
  | 'billing'
  | 'complete';

export type AgencyPlan = 'starter' | 'growth' | 'enterprise';

export interface AgencySignupState {
  step:          AgencySignupStep;
  plan?:         AgencyPlan;
  agency_name?:  string;
  owner_name?:   string;
  owner_email?:  string;
  agency_id?:    string;
  error?:        string;
  completed_at?: string;
}

// ── Step order ────────────────────────────────────────────────────────────────

const STEP_ORDER: AgencySignupStep[] = [
  'choose_plan',
  'agency_details',
  'owner_account',
  'billing',
  'complete',
];

// ── buildAgencySignupState ────────────────────────────────────────────────────

export function buildAgencySignupState(): AgencySignupState {
  try {
    return { step: 'choose_plan' };
  } catch {
    return { step: 'choose_plan' };
  }
}

// ── advanceAgencySignup ───────────────────────────────────────────────────────

export function advanceAgencySignup(
  state: AgencySignupState,
  result: Partial<AgencySignupState>,
): AgencySignupState {
  try {
    const merged = { ...state, ...result, error: undefined };
    const idx = STEP_ORDER.indexOf(merged.step);
    if (idx >= 0 && idx < STEP_ORDER.length - 1) {
      merged.step = STEP_ORDER[idx + 1];
    }
    return merged;
  } catch {
    return state ?? { step: 'choose_plan' };
  }
}

// ── getAgencySignupProgress ───────────────────────────────────────────────────

export function getAgencySignupProgress(
  state: AgencySignupState,
): { step_number: number; total_steps: number; percent: number } {
  try {
    const idx = STEP_ORDER.indexOf(state?.step ?? 'choose_plan');
    const step_number = (idx >= 0 ? idx : 0) + 1;
    const total_steps = STEP_ORDER.length;
    const percent = Math.round((step_number / total_steps) * 100);
    return { step_number, total_steps, percent };
  } catch {
    return { step_number: 1, total_steps: 5, percent: 20 };
  }
}

// ── validateAgencyDetails ─────────────────────────────────────────────────────

export function validateAgencyDetails(
  agency_name: string,
  owner_email: string,
): { valid: boolean; errors: string[] } {
  try {
    const errors: string[] = [];
    const name = agency_name ?? '';
    const email = owner_email ?? '';

    if (name.length < 2) {
      errors.push('Agency name must be at least 2 characters');
    }
    if (name.length > 80) {
      errors.push('Agency name must be 80 characters or less');
    }
    if (!email.includes('@') || !email.includes('.')) {
      errors.push('Please enter a valid email address');
    }

    return { valid: errors.length === 0, errors };
  } catch {
    return { valid: false, errors: ['Validation error'] };
  }
}
