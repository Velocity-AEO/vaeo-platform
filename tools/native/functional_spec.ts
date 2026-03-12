// tools/native/functional_spec.ts — Functional spec schema for native component system
// Department 1: stores WHAT a component does, never HOW.

import { randomUUID } from 'node:crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export type NativeAppCategory =
  | 'seo'
  | 'schema'
  | 'image_optimization'
  | 'page_speed'
  | 'redirects'
  | 'sitemap'
  | 'meta_tags'
  | 'structured_data'
  | 'analytics'
  | 'shipping'
  | 'popup'
  | 'social'
  | 'reviews'
  | 'payments'
  | 'email'
  | 'other';

export interface ObservedBehavior {
  id: string;
  description: string;
  trigger: string;
  expected_output: string;
  user_visible: boolean;
}

export interface DataInput {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export interface PerformanceRequirements {
  max_js_kb: number;
  no_external_cdn: boolean;
  no_render_blocking: boolean;
  lazy_load_eligible: boolean;
}

export interface FunctionalSpec {
  spec_id: string;
  name: string;
  category: NativeAppCategory;
  version: string;
  status: 'draft' | 'reviewed' | 'approved' | 'deprecated';
  replaces_app: string;
  replaces_app_id: string;
  observed_behaviors: ObservedBehavior[];
  data_inputs: DataInput[];
  performance_requirements: PerformanceRequirements;
  legal_notes: string;
  created_at: string;
  reviewed_at?: string;
  approved_at?: string;
}

// Re-export for convenience
export type AppCategory = NativeAppCategory;

// ── Functions ────────────────────────────────────────────────────────────────

export function createSpec(
  input: Omit<FunctionalSpec, 'spec_id' | 'created_at' | 'status'>,
): FunctionalSpec {
  return {
    ...input,
    spec_id: randomUUID(),
    status: 'draft',
    created_at: new Date().toISOString(),
  };
}

export function approveSpec(spec: FunctionalSpec): FunctionalSpec {
  return {
    ...spec,
    status: 'approved',
    approved_at: new Date().toISOString(),
  };
}

export function validateSpec(
  spec: FunctionalSpec,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!spec.name || spec.name.trim() === '') {
    errors.push('name is required');
  }
  if (!spec.replaces_app || spec.replaces_app.trim() === '') {
    errors.push('replaces_app is required');
  }
  if (!spec.observed_behaviors || spec.observed_behaviors.length === 0) {
    errors.push('at least one observed_behavior is required');
  }
  if (!spec.data_inputs || spec.data_inputs.length === 0) {
    errors.push('at least one data_input is required');
  }
  if (!spec.performance_requirements) {
    errors.push('performance_requirements is required');
  }

  return { valid: errors.length === 0, errors };
}
