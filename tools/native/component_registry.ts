// tools/native/component_registry.ts — Native component registry (Department 2)
// Stores built components written from scratch against specs.

import { randomUUID } from 'node:crypto';
import { SPEC_LIBRARY } from './spec_library.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface NativeComponent {
  component_id: string;
  spec_id: string;
  name: string;
  version: string;
  status: 'development' | 'testing' | 'approved' | 'live' | 'deprecated';
  platform: 'shopify' | 'wordpress' | 'both';
  entry_file: string;
  js_size_kb: number;
  has_external_cdn: boolean;
  has_render_blocking: boolean;
  test_coverage_pct: number;
  performance_verified: boolean;
  legal_approved: boolean;
  created_at: string;
  approved_at?: string;
  notes: string;
}

// ── Pre-loaded registry ─────────────────────────────────────────────────────

export const COMPONENT_REGISTRY: NativeComponent[] = [
  {
    component_id: randomUUID(),
    spec_id: SPEC_LIBRARY[0].spec_id,
    name: 'shipping_announcement_bar',
    version: '0.1.0',
    status: 'development',
    platform: 'shopify',
    entry_file: 'native/components/shipping-bar.liquid',
    js_size_kb: 0,
    has_external_cdn: false,
    has_render_blocking: false,
    test_coverage_pct: 0,
    performance_verified: false,
    legal_approved: false,
    created_at: new Date().toISOString(),
    notes: 'Awaiting build from approved spec',
  },
  {
    component_id: randomUUID(),
    spec_id: SPEC_LIBRARY[1].spec_id,
    name: 'email_capture_popup',
    version: '0.1.0',
    status: 'development',
    platform: 'both',
    entry_file: 'native/components/email-popup.liquid',
    js_size_kb: 0,
    has_external_cdn: false,
    has_render_blocking: false,
    test_coverage_pct: 0,
    performance_verified: false,
    legal_approved: false,
    created_at: new Date().toISOString(),
    notes: 'Awaiting build from approved spec',
  },
  {
    component_id: randomUUID(),
    spec_id: SPEC_LIBRARY[2].spec_id,
    name: 'social_feed_widget',
    version: '0.1.0',
    status: 'development',
    platform: 'shopify',
    entry_file: 'native/components/social-feed.liquid',
    js_size_kb: 0,
    has_external_cdn: false,
    has_render_blocking: false,
    test_coverage_pct: 0,
    performance_verified: false,
    legal_approved: false,
    created_at: new Date().toISOString(),
    notes: 'Awaiting build from approved spec',
  },
];

// ── Lookup helpers ──────────────────────────────────────────────────────────

export function getComponentBySpecId(spec_id: string): NativeComponent | undefined {
  return COMPONENT_REGISTRY.find((c) => c.spec_id === spec_id);
}

export function getLiveComponents(): NativeComponent[] {
  return COMPONENT_REGISTRY.filter((c) => c.status === 'live');
}

export function getComponentsByPlatform(platform: string): NativeComponent[] {
  return COMPONENT_REGISTRY.filter(
    (c) => c.platform === platform || c.platform === 'both',
  );
}

export function registerComponent(
  input: Omit<NativeComponent, 'component_id' | 'created_at'>,
): NativeComponent {
  const component: NativeComponent = {
    ...input,
    component_id: randomUUID(),
    created_at: new Date().toISOString(),
  };
  COMPONENT_REGISTRY.push(component);
  return component;
}
