/**
 * apps/dashboard/lib/add_site_form_logic.ts
 *
 * Pure logic for the "Add Client Site" slide-over form.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type Platform = 'shopify' | 'wordpress' | 'custom';

export interface AddSiteFormState {
  domain:      string;
  platform:    Platform;
  client_name: string;
  submitting:  boolean;
  error:       string | null;
}

export interface AddSiteFormErrors {
  domain:      string | null;
  client_name: string | null;
}

export interface AddSitePayload {
  domain:      string;
  platform:    Platform;
  client_name: string;
}

// ── buildInitialFormState ────────────────────────────────────────────────────

export function buildInitialFormState(): AddSiteFormState {
  return {
    domain:      '',
    platform:    'shopify',
    client_name: '',
    submitting:  false,
    error:       null,
  };
}

// ── normalizeDomain ──────────────────────────────────────────────────────────

export function normalizeDomain(raw: string): string {
  try {
    if (!raw || typeof raw !== 'string') return '';
    let d = raw.trim().toLowerCase();
    d = d.replace(/^https?:\/\//, '');
    d = d.replace(/\/.*$/, '');
    d = d.replace(/^www\./, '');
    return d;
  } catch {
    return '';
  }
}

// ── isValidDomain ────────────────────────────────────────────────────────────

export function isValidDomain(domain: string): boolean {
  try {
    if (!domain || typeof domain !== 'string') return false;
    const normalized = normalizeDomain(domain);
    if (normalized.length < 4) return false;
    if (!normalized.includes('.')) return false;
    // Basic domain pattern: alphanumeric + hyphens + dots
    const pattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;
    return pattern.test(normalized);
  } catch {
    return false;
  }
}

// ── isValidClientName ────────────────────────────────────────────────────────

export function isValidClientName(name: string): boolean {
  try {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    return trimmed.length >= 1 && trimmed.length <= 100;
  } catch {
    return false;
  }
}

// ── validateForm ─────────────────────────────────────────────────────────────

export function validateForm(state: AddSiteFormState): AddSiteFormErrors {
  try {
    return {
      domain: state.domain.trim() === ''
        ? 'Domain is required'
        : !isValidDomain(state.domain)
          ? 'Enter a valid domain (e.g. example.com)'
          : null,
      client_name: state.client_name.trim() === ''
        ? 'Client name is required'
        : !isValidClientName(state.client_name)
          ? 'Client name must be 1–100 characters'
          : null,
    };
  } catch {
    return { domain: 'Validation error', client_name: 'Validation error' };
  }
}

// ── hasErrors ────────────────────────────────────────────────────────────────

export function hasErrors(errors: AddSiteFormErrors): boolean {
  try {
    return errors.domain !== null || errors.client_name !== null;
  } catch {
    return true;
  }
}

// ── buildPayload ─────────────────────────────────────────────────────────────

export function buildPayload(state: AddSiteFormState): AddSitePayload {
  try {
    return {
      domain:      normalizeDomain(state.domain),
      platform:    state.platform ?? 'shopify',
      client_name: (state.client_name ?? '').trim(),
    };
  } catch {
    return { domain: '', platform: 'shopify', client_name: '' };
  }
}

// ── getPlatformOptions ───────────────────────────────────────────────────────

export function getPlatformOptions(): Array<{ value: Platform; label: string }> {
  return [
    { value: 'shopify',   label: 'Shopify' },
    { value: 'wordpress', label: 'WordPress' },
    { value: 'custom',    label: 'Custom / Other' },
  ];
}

// ── getSubmitButtonLabel ─────────────────────────────────────────────────────

export function getSubmitButtonLabel(submitting: boolean): string {
  try {
    return submitting ? 'Adding…' : 'Add Site';
  } catch {
    return 'Add Site';
  }
}
