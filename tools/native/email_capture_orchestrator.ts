/**
 * tools/native/email_capture_orchestrator.ts
 *
 * Orchestrates deployment and removal of the VAEO Native
 * Email Capture Popup component on a Shopify store.
 *
 * Never throws at outer level.
 */

import {
  defaultEmailCaptureConfig,
  validateEmailCaptureConfig,
  generateEmailCaptureSnippet,
  type EmailCaptureConfig,
} from './email_capture.js';
import {
  createComponent,
  updateComponentStatus,
  buildComponentResult,
  type NativeComponent,
  type NativeComponentResult,
} from './native_component.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EmailCaptureDeployResult {
  component:      NativeComponent;
  install_result: NativeComponentResult;
  snippet_html:   string;
}

export interface EmailCaptureDeployDeps {
  writeSnippet?: (snippet_name: string, html: string) => Promise<{ success: boolean }>;
  updateTheme?:  (theme_file: string, inject_before: string, render_tag: string) => Promise<{ success: boolean }>;
}

// ── Deploy ───────────────────────────────────────────────────────────────────

export async function deployEmailCapture(
  site_id: string,
  shopify_store_domain: string,
  config?: Partial<EmailCaptureConfig>,
  dry_run?: boolean,
  deps?: EmailCaptureDeployDeps,
): Promise<EmailCaptureDeployResult> {
  try {
    // 1. Merge config
    const fullConfig: EmailCaptureConfig = {
      ...defaultEmailCaptureConfig(),
      ...config,
    };

    // 2. Validate
    const validation = validateEmailCaptureConfig(fullConfig);
    if (!validation.valid) {
      const component = createComponent(site_id, 'email_capture', 'Email Capture Popup', fullConfig as unknown as Record<string, unknown>);
      const errorComponent = updateComponentStatus(component, 'error', validation.errors.join('; '));
      return {
        component: errorComponent,
        install_result: buildComponentResult(errorComponent, false, 'created', `Validation failed: ${validation.errors.join('; ')}`, undefined, validation.errors.join('; ')),
        snippet_html: '',
      };
    }

    // 3. Create component
    const component = createComponent(site_id, 'email_capture', 'Email Capture Popup', fullConfig as unknown as Record<string, unknown>);

    // 4. Generate snippet
    const snippet_html = generateEmailCaptureSnippet(fullConfig, component.snippet_name);

    // 5. Install (unless dry_run)
    if (dry_run) {
      const result = buildComponentResult(component, true, 'created', 'Dry run — snippet generated but not installed', snippet_html);
      return { component, install_result: result, snippet_html };
    }

    // Write snippet file
    const writeSnippet = deps?.writeSnippet ?? (async () => ({ success: true }));
    const writeResult = await writeSnippet(component.snippet_name, snippet_html);

    if (!writeResult.success) {
      const errorComp = updateComponentStatus(component, 'error', 'Failed to write snippet');
      return {
        component: errorComp,
        install_result: buildComponentResult(errorComp, false, 'created', 'Snippet write failed', undefined, 'Failed to write snippet'),
        snippet_html,
      };
    }

    // Update theme to include render tag
    const updateTheme = deps?.updateTheme ?? (async () => ({ success: true }));
    const themeResult = await updateTheme('layout/theme.liquid', '</body>', component.render_tag);

    if (!themeResult.success) {
      const errorComp = updateComponentStatus(component, 'error', 'Failed to update theme');
      return {
        component: errorComp,
        install_result: buildComponentResult(errorComp, false, 'created', 'Theme update failed', snippet_html, 'Failed to update theme'),
        snippet_html,
      };
    }

    // Success
    const activeComp = updateComponentStatus(component, 'active');
    const finalComp = { ...activeComp, installed_at: new Date().toISOString() };
    return {
      component: finalComp,
      install_result: buildComponentResult(finalComp, true, 'created', `Email capture popup deployed to ${shopify_store_domain}`, snippet_html),
      snippet_html,
    };
  } catch (err) {
    const fallback = createComponent(site_id, 'email_capture', 'Email Capture Popup', {});
    const errorComp = updateComponentStatus(fallback, 'error', err instanceof Error ? err.message : String(err));
    return {
      component: errorComp,
      install_result: buildComponentResult(errorComp, false, 'created', 'Deploy failed', undefined, err instanceof Error ? err.message : String(err)),
      snippet_html: '',
    };
  }
}

// ── Remove ───────────────────────────────────────────────────────────────────

export async function removeEmailCapture(
  component: NativeComponent,
  shopify_store_domain: string,
  deps?: {
    removeSnippet?: (snippet_name: string) => Promise<{ success: boolean }>;
    removeFromTheme?: (theme_file: string, render_tag: string) => Promise<{ success: boolean }>;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const removeSnippet = deps?.removeSnippet ?? (async () => ({ success: true }));
    const removeFromTheme = deps?.removeFromTheme ?? (async () => ({ success: true }));

    await removeSnippet(component.snippet_name);
    await removeFromTheme('layout/theme.liquid', component.render_tag);

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
