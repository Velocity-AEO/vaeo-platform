/**
 * tools/whitelabel/whitelabel_config.ts
 *
 * Agency white-label configuration for dashboard branding. Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WhiteLabelConfig {
  agency_id:          string;
  agency_name:        string;
  brand_name:         string;
  logo_url:           string | null;
  primary_color:      string;
  support_email:      string;
  hide_vaeo_branding: boolean;
  custom_domain:      string | null;
}

// ── buildDefaultWhiteLabel ────────────────────────────────────────────────────

export function buildDefaultWhiteLabel(
  agency_id: string,
  agency_name: string,
): WhiteLabelConfig {
  try {
    return {
      agency_id:          agency_id ?? '',
      agency_name:        agency_name ?? '',
      brand_name:         agency_name ?? '',
      logo_url:           null,
      primary_color:      '#6366f1',
      support_email:      'support@vaeo.app',
      hide_vaeo_branding: false,
      custom_domain:      null,
    };
  } catch {
    return {
      agency_id: '', agency_name: '', brand_name: '',
      logo_url: null, primary_color: '#6366f1',
      support_email: 'support@vaeo.app',
      hide_vaeo_branding: false, custom_domain: null,
    };
  }
}

// ── applyWhiteLabel ───────────────────────────────────────────────────────────

export function applyWhiteLabel(
  config: WhiteLabelConfig,
  defaults: { brand_name: string; logo_url: string | null; primary_color: string },
): {
  brand_name: string;
  logo_url: string | null;
  primary_color: string;
  show_vaeo_badge: boolean;
} {
  try {
    return {
      brand_name:     config?.brand_name    || defaults?.brand_name    || '',
      logo_url:       config?.logo_url      ?? defaults?.logo_url     ?? null,
      primary_color:  config?.primary_color  || defaults?.primary_color || '#6366f1',
      show_vaeo_badge: !(config?.hide_vaeo_branding ?? false),
    };
  } catch {
    return {
      brand_name: defaults?.brand_name ?? '',
      logo_url: defaults?.logo_url ?? null,
      primary_color: defaults?.primary_color ?? '#6366f1',
      show_vaeo_badge: true,
    };
  }
}

// ── isValidHexColor ───────────────────────────────────────────────────────────

export function isValidHexColor(color: string): boolean {
  try {
    if (!color) return false;
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);
  } catch {
    return false;
  }
}
