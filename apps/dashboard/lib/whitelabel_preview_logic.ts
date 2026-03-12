/**
 * apps/dashboard/lib/whitelabel_preview_logic.ts
 *
 * Pure logic for the white-label preview page.
 * Computes color contrast, preview elements, and form validation.
 * Never throws.
 */

import type { WhiteLabelConfig } from '../../../tools/whitelabel/whitelabel_config.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PreviewFormState {
  brand_name:         string;
  primary_color:      string;
  support_email:      string;
  hide_vaeo_branding: boolean;
  logo_url:           string;
  custom_domain:      string;
}

export interface PreviewFormErrors {
  brand_name:    string | null;
  primary_color: string | null;
  support_email: string | null;
}

export interface PreviewTheme {
  bg_color:      string;
  text_color:    string;
  brand_name:    string;
  show_badge:    boolean;
  contrast_ok:   boolean;
}

// ── buildPreviewFormState ────────────────────────────────────────────────────

export function buildPreviewFormState(config: WhiteLabelConfig | null): PreviewFormState {
  try {
    return {
      brand_name:         config?.brand_name         ?? '',
      primary_color:      config?.primary_color      ?? '#6366f1',
      support_email:      config?.support_email      ?? '',
      hide_vaeo_branding: config?.hide_vaeo_branding ?? false,
      logo_url:           config?.logo_url           ?? '',
      custom_domain:      config?.custom_domain      ?? '',
    };
  } catch {
    return {
      brand_name: '', primary_color: '#6366f1', support_email: '',
      hide_vaeo_branding: false, logo_url: '', custom_domain: '',
    };
  }
}

// ── hexToRgb ─────────────────────────────────────────────────────────────────

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  try {
    if (!hex || typeof hex !== 'string') return null;
    const cleaned = hex.replace('#', '');
    if (cleaned.length === 3) {
      const r = parseInt(cleaned[0] + cleaned[0], 16);
      const g = parseInt(cleaned[1] + cleaned[1], 16);
      const b = parseInt(cleaned[2] + cleaned[2], 16);
      return { r, g, b };
    }
    if (cleaned.length === 6) {
      const r = parseInt(cleaned.slice(0, 2), 16);
      const g = parseInt(cleaned.slice(2, 4), 16);
      const b = parseInt(cleaned.slice(4, 6), 16);
      return { r, g, b };
    }
    return null;
  } catch {
    return null;
  }
}

// ── relativeLuminance ────────────────────────────────────────────────────────

export function relativeLuminance(r: number, g: number, b: number): number {
  try {
    const [rs, gs, bs] = [r / 255, g / 255, b / 255].map(c =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
    );
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  } catch {
    return 0;
  }
}

// ── contrastRatio ────────────────────────────────────────────────────────────

export function contrastRatio(hex1: string, hex2: string): number {
  try {
    const c1 = hexToRgb(hex1);
    const c2 = hexToRgb(hex2);
    if (!c1 || !c2) return 1;
    const l1 = relativeLuminance(c1.r, c1.g, c1.b);
    const l2 = relativeLuminance(c2.r, c2.g, c2.b);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  } catch {
    return 1;
  }
}

// ── meetsWCAGAA ──────────────────────────────────────────────────────────────

export function meetsWCAGAA(fgHex: string, bgHex: string): boolean {
  try {
    return contrastRatio(fgHex, bgHex) >= 4.5;
  } catch {
    return false;
  }
}

// ── getTextColorForBg ────────────────────────────────────────────────────────

export function getTextColorForBg(bgHex: string): string {
  try {
    const rgb = hexToRgb(bgHex);
    if (!rgb) return '#ffffff';
    const lum = relativeLuminance(rgb.r, rgb.g, rgb.b);
    return lum > 0.179 ? '#000000' : '#ffffff';
  } catch {
    return '#ffffff';
  }
}

// ── buildPreviewTheme ────────────────────────────────────────────────────────

export function buildPreviewTheme(form: PreviewFormState): PreviewTheme {
  try {
    const bg = form.primary_color || '#6366f1';
    const text = getTextColorForBg(bg);
    return {
      bg_color:    bg,
      text_color:  text,
      brand_name:  form.brand_name || 'Your Brand',
      show_badge:  !form.hide_vaeo_branding,
      contrast_ok: meetsWCAGAA(text, bg),
    };
  } catch {
    return {
      bg_color: '#6366f1', text_color: '#ffffff',
      brand_name: 'Your Brand', show_badge: true, contrast_ok: true,
    };
  }
}

// ── isValidHexColor ──────────────────────────────────────────────────────────

export function isValidHexColor(color: string): boolean {
  try {
    if (!color || typeof color !== 'string') return false;
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color.trim());
  } catch {
    return false;
  }
}

// ── isValidEmail ─────────────────────────────────────────────────────────────

export function isValidEmail(email: string): boolean {
  try {
    if (!email || typeof email !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  } catch {
    return false;
  }
}

// ── validatePreviewForm ──────────────────────────────────────────────────────

export function validatePreviewForm(form: PreviewFormState): PreviewFormErrors {
  try {
    return {
      brand_name: form.brand_name.trim() === ''
        ? 'Brand name is required'
        : null,
      primary_color: !isValidHexColor(form.primary_color)
        ? 'Enter a valid hex color (e.g. #6366f1)'
        : null,
      support_email: form.support_email.trim() !== '' && !isValidEmail(form.support_email)
        ? 'Enter a valid email address'
        : null,
    };
  } catch {
    return { brand_name: 'Validation error', primary_color: 'Validation error', support_email: 'Validation error' };
  }
}

// ── hasPreviewErrors ─────────────────────────────────────────────────────────

export function hasPreviewErrors(errors: PreviewFormErrors): boolean {
  try {
    return errors.brand_name !== null || errors.primary_color !== null || errors.support_email !== null;
  } catch {
    return true;
  }
}
