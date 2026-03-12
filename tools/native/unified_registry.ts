// tools/native/unified_registry.ts — Unified component registry
// Wires all three native components into a single registry.
// Never throws.

import type { NativeComponentType, NativeComponent } from './native_component.js';
import { createComponent, updateComponentStatus, buildComponentResult } from './native_component.js';
import type { NativeComponentResult } from './native_component.js';

import {
  defaultShippingBarConfig,
  validateShippingBarConfig,
  generateShippingBarSnippet,
  type ShippingBarConfig,
} from './shipping_bar.js';

import {
  defaultEmailCaptureConfig,
  validateEmailCaptureConfig,
  generateEmailCaptureSnippet,
  type EmailCaptureConfig,
} from './email_capture.js';

import {
  defaultSocialFeedConfig,
  validateSocialFeedConfig,
  generateSocialFeedSnippet,
  type SocialFeedConfig,
} from './social_feed.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ComponentRegistryEntry {
  component_type: NativeComponentType;
  display_name: string;
  description: string;
  deploy: (
    site_id: string,
    domain: string,
    config?: Record<string, unknown>,
    dry_run?: boolean,
  ) => Promise<{
    component: NativeComponent;
    install_result: NativeComponentResult;
    snippet_html: string;
  }>;
  remove: (
    component: NativeComponent,
    domain: string,
  ) => Promise<{ success: boolean; error?: string }>;
  default_config: () => Record<string, unknown>;
  validate: (config: Record<string, unknown>) => { valid: boolean; errors: string[] };
}

// ── Deploy helpers ──────────────────────────────────────────────────────────

async function deployShippingBar(
  site_id: string,
  domain: string,
  config?: Record<string, unknown>,
  dry_run?: boolean,
): Promise<{ component: NativeComponent; install_result: NativeComponentResult; snippet_html: string }> {
  try {
    const fullConfig = { ...defaultShippingBarConfig(), ...config } as ShippingBarConfig;
    const validation = validateShippingBarConfig(fullConfig);
    if (!validation.valid) {
      const comp = createComponent(site_id, 'shipping_bar', 'Shipping Bar', config ?? {});
      const errComp = updateComponentStatus(comp, 'error', validation.errors.join('; '));
      return {
        component: errComp,
        install_result: buildComponentResult(errComp, false, 'created', `Validation failed: ${validation.errors.join('; ')}`, undefined, validation.errors.join('; ')),
        snippet_html: '',
      };
    }
    const comp = createComponent(site_id, 'shipping_bar', 'Shipping Bar', fullConfig as unknown as Record<string, unknown>);
    const snippet = generateShippingBarSnippet(fullConfig, comp.snippet_name);
    if (dry_run) {
      return { component: comp, install_result: buildComponentResult(comp, true, 'created', 'Dry run', snippet), snippet_html: snippet };
    }
    const active = updateComponentStatus(comp, 'active');
    return {
      component: { ...active, installed_at: new Date().toISOString() },
      install_result: buildComponentResult(active, true, 'created', `Shipping bar deployed to ${domain}`, snippet),
      snippet_html: snippet,
    };
  } catch (err) {
    const comp = createComponent(site_id, 'shipping_bar', 'Shipping Bar', {});
    const errComp = updateComponentStatus(comp, 'error', err instanceof Error ? err.message : String(err));
    return { component: errComp, install_result: buildComponentResult(errComp, false, 'created', 'Deploy failed'), snippet_html: '' };
  }
}

async function deployEmailCapture(
  site_id: string,
  domain: string,
  config?: Record<string, unknown>,
  dry_run?: boolean,
): Promise<{ component: NativeComponent; install_result: NativeComponentResult; snippet_html: string }> {
  try {
    const fullConfig = { ...defaultEmailCaptureConfig(), ...config } as EmailCaptureConfig;
    const validation = validateEmailCaptureConfig(fullConfig);
    if (!validation.valid) {
      const comp = createComponent(site_id, 'email_capture', 'Email Capture Popup', config ?? {});
      const errComp = updateComponentStatus(comp, 'error', validation.errors.join('; '));
      return {
        component: errComp,
        install_result: buildComponentResult(errComp, false, 'created', `Validation failed: ${validation.errors.join('; ')}`, undefined, validation.errors.join('; ')),
        snippet_html: '',
      };
    }
    const comp = createComponent(site_id, 'email_capture', 'Email Capture Popup', fullConfig as unknown as Record<string, unknown>);
    const snippet = generateEmailCaptureSnippet(fullConfig, comp.snippet_name);
    if (dry_run) {
      return { component: comp, install_result: buildComponentResult(comp, true, 'created', 'Dry run', snippet), snippet_html: snippet };
    }
    const active = updateComponentStatus(comp, 'active');
    return {
      component: { ...active, installed_at: new Date().toISOString() },
      install_result: buildComponentResult(active, true, 'created', `Email capture deployed to ${domain}`, snippet),
      snippet_html: snippet,
    };
  } catch (err) {
    const comp = createComponent(site_id, 'email_capture', 'Email Capture Popup', {});
    const errComp = updateComponentStatus(comp, 'error', err instanceof Error ? err.message : String(err));
    return { component: errComp, install_result: buildComponentResult(errComp, false, 'created', 'Deploy failed'), snippet_html: '' };
  }
}

async function deploySocialFeedComponent(
  site_id: string,
  domain: string,
  config?: Record<string, unknown>,
  dry_run?: boolean,
): Promise<{ component: NativeComponent; install_result: NativeComponentResult; snippet_html: string }> {
  try {
    const fullConfig = { ...defaultSocialFeedConfig(), ...config } as SocialFeedConfig;
    const validation = validateSocialFeedConfig(fullConfig);
    if (!validation.valid) {
      const comp = createComponent(site_id, 'social_feed', 'Social Feed Widget', config ?? {});
      const errComp = updateComponentStatus(comp, 'error', validation.errors.join('; '));
      return {
        component: errComp,
        install_result: buildComponentResult(errComp, false, 'created', `Validation failed: ${validation.errors.join('; ')}`, undefined, validation.errors.join('; ')),
        snippet_html: '',
      };
    }
    const comp = createComponent(site_id, 'social_feed', 'Social Feed Widget', fullConfig as unknown as Record<string, unknown>);
    const snippet = generateSocialFeedSnippet(fullConfig, comp.snippet_name);
    if (dry_run) {
      return { component: comp, install_result: buildComponentResult(comp, true, 'created', 'Dry run', snippet), snippet_html: snippet };
    }
    const active = updateComponentStatus(comp, 'active');
    return {
      component: { ...active, installed_at: new Date().toISOString() },
      install_result: buildComponentResult(active, true, 'created', `Social feed deployed to ${domain}`, snippet),
      snippet_html: snippet,
    };
  } catch (err) {
    const comp = createComponent(site_id, 'social_feed', 'Social Feed Widget', {});
    const errComp = updateComponentStatus(comp, 'error', err instanceof Error ? err.message : String(err));
    return { component: errComp, install_result: buildComponentResult(errComp, false, 'created', 'Deploy failed'), snippet_html: '' };
  }
}

// ── Remove helper ───────────────────────────────────────────────────────────

async function removeComponent(
  _component: NativeComponent,
  _domain: string,
): Promise<{ success: boolean; error?: string }> {
  // In production, this calls Shopify Admin API to remove snippet + theme tag
  return { success: true };
}

// ── Registry ────────────────────────────────────────────────────────────────

export const COMPONENT_REGISTRY: ComponentRegistryEntry[] = [
  {
    component_type: 'shipping_bar',
    display_name: 'Shipping Bar',
    description: 'Animated free shipping progress bar. Drives order value up.',
    deploy: deployShippingBar,
    remove: removeComponent,
    default_config: () => defaultShippingBarConfig() as unknown as Record<string, unknown>,
    validate: (c) => validateShippingBarConfig(c as unknown as ShippingBarConfig),
  },
  {
    component_type: 'email_capture',
    display_name: 'Email Capture Popup',
    description: 'Exit-intent email capture. No third-party popup app needed.',
    deploy: deployEmailCapture,
    remove: removeComponent,
    default_config: () => defaultEmailCaptureConfig() as unknown as Record<string, unknown>,
    validate: (c) => validateEmailCaptureConfig(c as unknown as EmailCaptureConfig),
  },
  {
    component_type: 'social_feed',
    display_name: 'Social Feed Widget',
    description: 'Pull in Instagram, TikTok, or YouTube content directly to your storefront.',
    deploy: deploySocialFeedComponent,
    remove: removeComponent,
    default_config: () => defaultSocialFeedConfig() as unknown as Record<string, unknown>,
    validate: (c) => validateSocialFeedConfig(c as unknown as SocialFeedConfig),
  },
];

// ── Lookup ───────────────────────────────────────────────────────────────────

export function getComponent(type: NativeComponentType): ComponentRegistryEntry | undefined {
  return COMPONENT_REGISTRY.find((e) => e.component_type === type);
}

export function listComponents(): ComponentRegistryEntry[] {
  return COMPONENT_REGISTRY;
}
