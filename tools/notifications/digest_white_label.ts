/**
 * tools/notifications/digest_white_label.ts
 *
 * White label config for digest emails.
 * Allows agencies to brand emails before forwarding to clients.
 * Never throws.
 */

import type { DigestEmailData } from './digest_email_template.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface WhiteLabelEmailConfig {
  agency_name:   string | null;
  primary_color: string | null;
  reply_to:      string | null;
  from_name:     string | null;
}

export interface WhiteLabelEmailDeps {
  loadFn?: (site_id: string) => Promise<WhiteLabelEmailConfig | null>;
}

// ── applyWhiteLabelToDigest ──────────────────────────────────────────────────

export function applyWhiteLabelToDigest(
  data: DigestEmailData,
  config: WhiteLabelEmailConfig,
): DigestEmailData {
  try {
    if (!data) return data;
    if (!config) return data;
    const result = { ...data };
    if (config.agency_name) {
      result.agency_name = config.agency_name;
    }
    if (config.primary_color) {
      result.white_label_color = config.primary_color;
    }
    return result;
  } catch {
    return data;
  }
}

// ── buildFromAddress ─────────────────────────────────────────────────────────

export function buildFromAddress(config: WhiteLabelEmailConfig): string {
  try {
    if (config?.from_name) {
      return `${config.from_name} <mail@vaeo.app>`;
    }
    return 'VAEO SEO Autopilot <mail@vaeo.app>';
  } catch {
    return 'VAEO SEO Autopilot <mail@vaeo.app>';
  }
}

// ── loadWhiteLabelConfig ─────────────────────────────────────────────────────

export async function loadWhiteLabelConfig(
  site_id: string,
  deps?: WhiteLabelEmailDeps,
): Promise<WhiteLabelEmailConfig> {
  try {
    const loadFn = deps?.loadFn ?? defaultLoad;
    const config = await loadFn(site_id);
    return config ?? nullConfig();
  } catch {
    return nullConfig();
  }
}

// ── Defaults ─────────────────────────────────────────────────────────────────

function nullConfig(): WhiteLabelEmailConfig {
  return {
    agency_name:   null,
    primary_color: null,
    reply_to:      null,
    from_name:     null,
  };
}

async function defaultLoad(_site_id: string): Promise<WhiteLabelEmailConfig | null> {
  return null;
}
