/**
 * tools/native/native_component.ts
 *
 * Base interfaces and factory functions for VAEO native components.
 * Never throws.
 */

import { randomUUID } from 'node:crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

export type NativeComponentType   = 'shipping_bar' | 'email_capture' | 'social_feed';
export type NativeComponentStatus = 'draft' | 'active' | 'disabled' | 'error';

export interface NativeComponent {
  component_id:    string;
  site_id:         string;
  component_type:  NativeComponentType;
  name:            string;
  status:          NativeComponentStatus;
  config:          Record<string, unknown>;
  snippet_name:    string;
  render_tag:      string;
  installed_at?:   string;
  updated_at:      string;
  created_at:      string;
  version:         string;
  error?:          string;
}

export interface NativeComponentResult {
  component:    NativeComponent;
  success:      boolean;
  action:       'created' | 'updated' | 'removed' | 'enabled' | 'disabled';
  message:      string;
  snippet_html?: string;
  error?:        string;
  executed_at:   string;
}

// ── createComponent ───────────────────────────────────────────────────────────

export function createComponent(
  site_id:         string,
  component_type:  NativeComponentType,
  name:            string,
  config:          Record<string, unknown>,
): NativeComponent {
  try {
    const component_id = randomUUID();
    const type_slug    = (component_type ?? '').replace(/_/g, '-');
    const snippet_name = `vaeo-${type_slug}-${component_id.slice(0, 8)}`;
    const now          = new Date().toISOString();

    return {
      component_id,
      site_id:        site_id ?? '',
      component_type,
      name:           name ?? '',
      status:         'draft',
      config:         config ?? {},
      snippet_name,
      render_tag:     `{%- render '${snippet_name}' -%}`,
      updated_at:     now,
      created_at:     now,
      version:        '1.0.0',
    };
  } catch {
    const id  = randomUUID();
    const now = new Date().toISOString();
    return {
      component_id:   id,
      site_id:        site_id ?? '',
      component_type: component_type ?? 'shipping_bar',
      name:           name ?? '',
      status:         'error',
      config:         {},
      snippet_name:   `vaeo-error-${id.slice(0, 8)}`,
      render_tag:     '',
      updated_at:     now,
      created_at:     now,
      version:        '1.0.0',
    };
  }
}

// ── updateComponentStatus ─────────────────────────────────────────────────────

export function updateComponentStatus(
  component: NativeComponent,
  status:    NativeComponentStatus,
  error?:    string,
): NativeComponent {
  try {
    const updated: NativeComponent = {
      ...component,
      status,
      updated_at: new Date().toISOString(),
    };
    if (error !== undefined) updated.error = error;
    else delete updated.error;
    return updated;
  } catch {
    return { ...(component ?? {} as NativeComponent), status };
  }
}

// ── buildComponentResult ──────────────────────────────────────────────────────

export function buildComponentResult(
  component:    NativeComponent,
  success:      boolean,
  action:       NativeComponentResult['action'],
  message:      string,
  snippet_html?: string,
  error?:        string,
): NativeComponentResult {
  try {
    const result: NativeComponentResult = {
      component,
      success,
      action,
      message:     message ?? '',
      executed_at: new Date().toISOString(),
    };
    if (snippet_html !== undefined) result.snippet_html = snippet_html;
    if (error !== undefined)        result.error        = error;
    return result;
  } catch {
    return {
      component,
      success:     false,
      action,
      message:     'Result build failed.',
      executed_at: new Date().toISOString(),
      error:       'buildComponentResult threw',
    };
  }
}
