/**
 * tools/native/shipping_bar_orchestrator.ts
 *
 * High-level deploy/remove orchestrator for the VAEO Shipping Bar.
 * Never throws at outer level — errors surfaced in result.
 */

import {
  createComponent,
  type NativeComponent,
} from './native_component.js';
import {
  defaultShippingBarConfig,
  validateShippingBarConfig,
  generateShippingBarSnippet,
  type ShippingBarConfig,
} from './shipping_bar.js';
import {
  installComponent,
  removeComponent,
  type ComponentInstallConfig,
  type ComponentInstallResult,
} from './component_installer.js';

// ── deployShippingBar ─────────────────────────────────────────────────────────

export async function deployShippingBar(
  site_id:              string,
  shopify_store_domain: string,
  config?:              Partial<ShippingBarConfig>,
  dry_run?:             boolean,
  deps?: {
    writeSnippet?: NonNullable<Parameters<typeof installComponent>[3]>['writeSnippet'];
    updateTheme?:  NonNullable<Parameters<typeof installComponent>[3]>['updateTheme'];
  },
): Promise<{
  component:      NativeComponent;
  install_result: ComponentInstallResult;
  snippet_html:   string;
}> {
  try {
    // 1. Merge config with defaults
    const merged: ShippingBarConfig = {
      ...defaultShippingBarConfig(),
      ...(config ?? {}),
    };

    // 2. Validate
    const validation = validateShippingBarConfig(merged);
    if (!validation.valid) {
      throw new Error(`Invalid shipping bar config: ${validation.errors.join('; ')}`);
    }

    // 3. Create component
    const component = createComponent(
      site_id,
      'shipping_bar',
      'VAEO Shipping Bar',
      merged as unknown as Record<string, unknown>,
    );

    // 4. Generate snippet
    const snippet_html = generateShippingBarSnippet(merged, component.snippet_name);

    // 5. Install
    const install_config: ComponentInstallConfig = {
      site_id,
      platform:             'shopify',
      shopify_store_domain,
      theme_file:           'layout/theme.liquid',
      inject_before:        '</body>',
      dry_run:              dry_run ?? false,
    };

    const install_result = await installComponent(
      component,
      snippet_html,
      install_config,
      deps,
    );

    return { component: install_result.component, install_result, snippet_html };
  } catch (err) {
    // Build a minimal error result that never propagates
    const errMsg  = err instanceof Error ? err.message : String(err);
    const c       = createComponent(site_id ?? '', 'shipping_bar', 'VAEO Shipping Bar', {});
    const errComp = { ...c, status: 'error' as const, error: errMsg };
    return {
      component: errComp,
      snippet_html: '',
      install_result: {
        component:           errComp,
        snippet_html:        '',
        theme_file_updated:  false,
        render_tag_injected: false,
        dry_run:             dry_run ?? false,
        rollback_available:  false,
        installed_at:        new Date().toISOString(),
        error:               errMsg,
        success:             false,
      },
    };
  }
}

// ── removeShippingBar ─────────────────────────────────────────────────────────

export async function removeShippingBar(
  component:            NativeComponent,
  shopify_store_domain: string,
  deps?:                Parameters<typeof removeComponent>[2],
): Promise<{ success: boolean; error?: string }> {
  try {
    const install_config: ComponentInstallConfig = {
      site_id:              component.site_id,
      platform:             'shopify',
      shopify_store_domain,
      theme_file:           'layout/theme.liquid',
      inject_before:        '</body>',
      dry_run:              false,
    };

    const result = await removeComponent(component, install_config, deps);
    return { success: result.success, ...(result.error ? { error: result.error } : {}) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
