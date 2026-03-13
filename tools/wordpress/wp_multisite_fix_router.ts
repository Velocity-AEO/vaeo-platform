/**
 * tools/wordpress/wp_multisite_fix_router.ts
 *
 * Routes fixes to the correct subsite in a WordPress multisite network.
 * Never throws at outer level.
 */

import type { WPMultisiteConfig } from './wp_multisite_detector.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FixTarget {
  target_url:    string;
  is_subsite:    boolean;
  subsite_name:  string | null;
}

export interface WPSandboxConfig {
  wp_url:       string;
  username:     string;
  app_password: string;
  site_id:      string;
}

export interface WPIssue {
  url:        string;
  issue_type: string;
  severity:   string;
}

export interface WPApplyResult {
  success:     boolean;
  fix_url:     string;
  subsite_url: string | null;
  error?:      string;
}

export interface FixRouterDeps {
  applyFn?: (issue: WPIssue, config: WPSandboxConfig) => Promise<WPApplyResult>;
}

// ── resolveFixTargetSite ────────────────────────────────────────────────────

export function resolveFixTargetSite(
  issue_url: string,
  multisite_config: WPMultisiteConfig,
): FixTarget {
  try {
    if (!multisite_config?.is_multisite || !multisite_config.subsites?.length) {
      return {
        target_url:   multisite_config?.main_site_url ?? '',
        is_subsite:   false,
        subsite_name: null,
      };
    }

    const issueHost = new URL(issue_url).hostname;
    const issuePath = new URL(issue_url).pathname;

    // Check subdomain match
    for (const sub of multisite_config.subsites) {
      if (sub.is_main) continue;
      try {
        const subHost = new URL(sub.url).hostname;
        if (issueHost === subHost) {
          return {
            target_url:   sub.url,
            is_subsite:   true,
            subsite_name: sub.name,
          };
        }
      } catch {
        // skip
      }
    }

    // Check subdirectory match
    for (const sub of multisite_config.subsites) {
      if (sub.is_main) continue;
      try {
        const subPath = new URL(sub.url).pathname.replace(/\/$/, '');
        if (subPath && issuePath.startsWith(subPath + '/')) {
          return {
            target_url:   sub.url,
            is_subsite:   true,
            subsite_name: sub.name,
          };
        }
      } catch {
        // skip
      }
    }

    // Default to main site
    return {
      target_url:   multisite_config.main_site_url,
      is_subsite:   false,
      subsite_name: null,
    };
  } catch {
    return {
      target_url:   multisite_config?.main_site_url ?? '',
      is_subsite:   false,
      subsite_name: null,
    };
  }
}

// ── buildSubsiteFixConfig ───────────────────────────────────────────────────

export function buildSubsiteFixConfig(
  target: FixTarget,
  base_config: WPSandboxConfig,
): WPSandboxConfig {
  try {
    return {
      wp_url:       target.target_url ?? base_config.wp_url,
      username:     base_config.username,
      app_password: base_config.app_password,
      site_id:      base_config.site_id,
    };
  } catch {
    return { ...base_config };
  }
}

// ── applyMultisiteFix ───────────────────────────────────────────────────────

export async function applyMultisiteFix(
  issue: WPIssue,
  multisite_config: WPMultisiteConfig,
  base_fix_config: WPSandboxConfig,
  deps?: FixRouterDeps,
): Promise<WPApplyResult> {
  try {
    const target = resolveFixTargetSite(issue.url, multisite_config);
    const config = buildSubsiteFixConfig(target, base_fix_config);

    const applyFn = deps?.applyFn ?? defaultApplyFn;
    const result = await applyFn(issue, config);

    return {
      ...result,
      subsite_url: target.is_subsite ? target.target_url : null,
    };
  } catch (err) {
    return {
      success:     false,
      fix_url:     issue?.url ?? '',
      subsite_url: null,
      error:       err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Default ─────────────────────────────────────────────────────────────────

async function defaultApplyFn(
  issue: WPIssue,
  _config: WPSandboxConfig,
): Promise<WPApplyResult> {
  return {
    success:     true,
    fix_url:     issue.url,
    subsite_url: null,
  };
}
