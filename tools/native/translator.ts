// tools/native/translator.ts — The Translator: observes app behavior, writes the spec.
// Sits between Department 1 (specs) and Department 2 (components).
// Never touches source code. This is the legal protection layer.

import {
  type FunctionalSpec,
  type NativeAppCategory,
  type ObservedBehavior,
  createSpec,
} from './functional_spec.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type { NativeAppCategory as AppCategory };

export interface TranslatorInput {
  app_name: string;
  app_id: string;
  category: NativeAppCategory;
  observed_url?: string;
  observation_notes: string;
  observer_name: string;
}

export interface TranslatorOutput {
  spec: FunctionalSpec;
  confidence: 'high' | 'medium' | 'low';
  needs_legal_review: boolean;
  warnings: string[];
  observation_source: string;
}

// ── Action verb detection ────────────────────────────────────────────────────

const ACTION_VERBS = [
  'shows', 'displays', 'renders', 'loads', 'opens', 'closes',
  'hides', 'appears', 'updates', 'changes', 'adds', 'removes',
  'triggers', 'submits', 'captures', 'sends', 'redirects',
  'scrolls', 'animates', 'calculates', 'validates', 'filters',
  'sorts', 'highlights', 'toggles', 'collapses', 'expands',
  'tracks', 'logs', 'stores', 'fetches', 'plays',
];

function containsActionVerb(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return ACTION_VERBS.some((verb) => lower.includes(verb));
}

// ── Core translator ─────────────────────────────────────────────────────────

export function translateObservationToSpec(
  input: TranslatorInput,
): TranslatorOutput {
  const warnings: string[] = [];

  // Parse observation notes into behaviors
  const sentences = input.observation_notes
    .split(/[.\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  const behaviors: ObservedBehavior[] = [];
  let behaviorIndex = 0;

  for (const sentence of sentences) {
    if (containsActionVerb(sentence)) {
      behaviorIndex++;
      behaviors.push({
        id: `b${behaviorIndex}`,
        description: sentence,
        trigger: 'Observed behavior',
        expected_output: 'As observed',
        user_visible: true,
      });
    }
  }

  // Determine confidence
  let confidence: TranslatorOutput['confidence'];
  if (behaviors.length >= 5) {
    confidence = 'high';
  } else if (behaviors.length >= 2) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  // Warnings
  if (confidence === 'low') {
    warnings.push('Low confidence: fewer than 2 behaviors parsed from observation notes');
  }
  // data_inputs will be empty — needs human completion
  warnings.push('data_inputs is empty — requires human completion');

  // Legal review needed for regulatory-sensitive categories
  const needs_legal_review = input.category === 'payments' || input.category === 'email';
  if (needs_legal_review) {
    warnings.push(`Category "${input.category}" requires legal review before approval`);
  }

  const date = new Date().toISOString().split('T')[0];
  const location = input.observed_url ?? 'merchant store';

  const spec = createSpec({
    name: `${input.app_name} (Native)`,
    category: input.category,
    version: '1.0.0',
    replaces_app: input.app_name,
    replaces_app_id: input.app_id,
    observed_behaviors: behaviors,
    data_inputs: [],
    performance_requirements: {
      max_js_kb: 10,
      no_external_cdn: true,
      no_render_blocking: true,
      lazy_load_eligible: false,
    },
    legal_notes: `Spec derived from observing visible behavior of ${input.app_name} at ${location}. Observed by ${input.observer_name} on ${date}. No source code accessed. Independent implementation.`,
  });

  return {
    spec,
    confidence,
    needs_legal_review,
    warnings,
    observation_source: location,
  };
}

// ── Build prompt generator ──────────────────────────────────────────────────

export function specToPrompt(spec: FunctionalSpec): string {
  const lines: string[] = [];

  lines.push('Build a native Shopify component that implements the following functional spec.');
  lines.push('Write original code from scratch. Do not reference or derive from any existing app\'s implementation.');
  lines.push('');
  lines.push(`Component: ${spec.name}`);
  lines.push(`Replaces: ${spec.replaces_app}`);
  lines.push('');

  lines.push('Behaviors:');
  spec.observed_behaviors.forEach((b, i) => {
    lines.push(`${i + 1}. ${b.description}`);
    lines.push(`   Trigger: ${b.trigger}`);
    lines.push(`   Expected: ${b.expected_output}`);
  });
  lines.push('');

  if (spec.data_inputs.length > 0) {
    lines.push('Data inputs:');
    for (const d of spec.data_inputs) {
      const req = d.required ? '(required)' : '(optional)';
      lines.push(`- ${d.name}: ${d.type} — ${d.description} ${req}`);
    }
    lines.push('');
  }

  lines.push('Performance requirements:');
  lines.push(`- Max JS bundle: ${spec.performance_requirements.max_js_kb}kb`);
  if (spec.performance_requirements.no_external_cdn) {
    lines.push('- No external CDN dependencies');
  }
  if (spec.performance_requirements.no_render_blocking) {
    lines.push('- No render-blocking resources');
  }
  if (spec.performance_requirements.lazy_load_eligible) {
    lines.push('- Lazy load eligible');
  }
  lines.push('');

  lines.push(`Legal: ${spec.legal_notes}`);

  return lines.join('\n');
}
