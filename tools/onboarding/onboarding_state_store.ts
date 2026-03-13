/**
 * tools/onboarding/onboarding_state_store.ts
 *
 * Persistence layer for onboarding wizard resume state.
 * Allows clients to resume mid-flow if they close the wizard.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface OnboardingState {
  session_id:       string;
  platform:         'shopify' | 'wordpress';
  current_step:     number;
  total_steps:      number;
  completed_steps:  number[];
  form_data:        Record<string, unknown>;
  started_at:       string;
  last_updated_at:  string;
  completed:        boolean;
}

export interface OnboardingStateSaveDeps {
  saveFn?: (state: OnboardingState) => Promise<void>;
}

export interface OnboardingStateLoadDeps {
  loadFn?: (session_id: string) => Promise<OnboardingState | null>;
}

export interface OnboardingStateDeleteDeps {
  deleteFn?: (session_id: string) => Promise<void>;
}

// ── generateSessionId ────────────────────────────────────────────────────────

export function generateSessionId(
  tenant_id: string,
  platform:  string,
): string {
  try {
    const ts = Date.now().toString(36);
    return `onboard_${platform ?? 'unknown'}_${tenant_id ?? 'unknown'}_${ts}`;
  } catch {
    return `onboard_unknown_unknown_${Date.now().toString(36)}`;
  }
}

// ── getResumeStep ────────────────────────────────────────────────────────────

export function getResumeStep(state: OnboardingState | null): number {
  try {
    if (!state) return 0;
    return state.current_step ?? 0;
  } catch {
    return 0;
  }
}

// ── buildInitialOnboardingState ──────────────────────────────────────────────

export function buildInitialOnboardingState(
  session_id: string,
  platform:   'shopify' | 'wordpress',
  total_steps: number,
): OnboardingState {
  try {
    return {
      session_id:      session_id ?? '',
      platform:        platform ?? 'shopify',
      current_step:    0,
      total_steps:     total_steps ?? 0,
      completed_steps: [],
      form_data:       {},
      started_at:      new Date().toISOString(),
      last_updated_at: new Date().toISOString(),
      completed:       false,
    };
  } catch {
    return {
      session_id: '', platform: 'shopify', current_step: 0,
      total_steps: 0, completed_steps: [], form_data: {},
      started_at: new Date().toISOString(),
      last_updated_at: new Date().toISOString(),
      completed: false,
    };
  }
}

// ── saveOnboardingState ──────────────────────────────────────────────────────

export async function saveOnboardingState(
  state: OnboardingState,
  deps?: OnboardingStateSaveDeps,
): Promise<boolean> {
  try {
    const saveFn = deps?.saveFn ?? defaultSave;
    const updated = {
      ...state,
      last_updated_at: new Date().toISOString(),
    };
    await saveFn(updated);
    return true;
  } catch {
    return false;
  }
}

// ── loadOnboardingState ──────────────────────────────────────────────────────

export async function loadOnboardingState(
  session_id: string,
  deps?: OnboardingStateLoadDeps,
): Promise<OnboardingState | null> {
  try {
    const loadFn = deps?.loadFn ?? defaultLoad;
    return await loadFn(session_id);
  } catch {
    return null;
  }
}

// ── clearOnboardingState ─────────────────────────────────────────────────────

export async function clearOnboardingState(
  session_id: string,
  deps?: OnboardingStateDeleteDeps,
): Promise<boolean> {
  try {
    const deleteFn = deps?.deleteFn ?? defaultDelete;
    await deleteFn(session_id);
    return true;
  } catch {
    return false;
  }
}

// ── Defaults ─────────────────────────────────────────────────────────────────

async function defaultSave(_state: OnboardingState): Promise<void> {}
async function defaultLoad(_session_id: string): Promise<OnboardingState | null> { return null; }
async function defaultDelete(_session_id: string): Promise<void> {}
