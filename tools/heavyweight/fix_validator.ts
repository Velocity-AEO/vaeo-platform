// tools/heavyweight/fix_validator.ts — Fix validation runner
// Validates SEO fixes under simulated production load conditions.
// Never throws.

import type { ScriptStub } from './script_stub_library.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LighthouseScore {
  performance: number;
  seo: number;
  accessibility: number;
  best_practices: number;
  lcp_ms: number;
  cls: number;
}

export interface SimulationResult {
  stubs_applied: ScriptStub[];
  total_simulated_load_ms: number;
  total_simulated_main_thread_ms: number;
  warnings: string[];
}

export interface StubInjectionConfig {
  stubs: ScriptStub[];
  insert_before_closing_body: boolean;
}

export interface StubInjectionResult {
  html: string;
  injected_count: number;
  injected_app_ids: string[];
}

export interface FixValidationInput {
  site_id: string;
  url: string;
  html_before: string;
  fix_types: string[];
  simulation_result: SimulationResult;
  score_before: LighthouseScore;
}

export interface AppliedFix {
  fix_type: string;
  success: boolean;
  change_description: string;
  lines_changed: number;
}

export interface FixValidationResult {
  site_id: string;
  url: string;
  fix_types: string[];
  html_before: string;
  html_after: string;
  fixes_applied: AppliedFix[];
  simulation_applied: boolean;
  production_condition_warnings: string[];
  validated_at: string;
  ready_for_scoring: boolean;
  error?: string;
}

// ── Text fix applicators ─────────────────────────────────────────────────────

function hasTag(html: string, pattern: RegExp): boolean {
  return pattern.test(html);
}

function countLinesDiff(before: string, after: string): number {
  const linesBefore = before.split('\n');
  const linesAfter = after.split('\n');
  let diff = 0;
  const max = Math.max(linesBefore.length, linesAfter.length);
  for (let i = 0; i < max; i++) {
    if ((linesBefore[i] ?? '') !== (linesAfter[i] ?? '')) diff++;
  }
  return diff;
}

export function applyTextFixes(
  html: string,
  fix_types: string[],
): { html: string; applied: string[] } {
  let result = html;
  const applied: string[] = [];

  for (const fix of fix_types) {
    const before = result;

    switch (fix) {
      case 'title_missing':
        if (!hasTag(result, /<title[\s>]/i)) {
          result = result.replace(/<head>/i, '<head>\n<title>Page Title</title>');
          if (result !== before) applied.push('title_missing');
        }
        break;

      case 'meta_description_missing':
        if (!hasTag(result, /<meta\s+name=["']description["']/i)) {
          result = result.replace(
            /<head>/i,
            '<head>\n<meta name="description" content="Page description.">',
          );
          if (result !== before) applied.push('meta_description_missing');
        }
        break;

      case 'image_alt_missing': {
        const imgNoAlt = /<img(?![^>]*\balt\s*=)[^>]*>/i;
        if (imgNoAlt.test(result)) {
          result = result.replace(imgNoAlt, (match) => {
            return match.replace(/<img/i, '<img alt=""');
          });
          if (result !== before) applied.push('image_alt_missing');
        }
        break;
      }

      case 'lang_missing':
        if (/<html(?![^>]*\blang\s*=)/i.test(result)) {
          result = result.replace(/<html/i, '<html lang="en"');
          if (result !== before) applied.push('lang_missing');
        }
        break;

      case 'canonical_missing':
        if (!hasTag(result, /<link[^>]*rel=["']canonical["']/i)) {
          result = result.replace(
            /<head>/i,
            '<head>\n<link rel="canonical" href="">',
          );
          if (result !== before) applied.push('canonical_missing');
        }
        break;
    }
  }

  return { html: result, applied };
}

// ── Default stub injector ────────────────────────────────────────────────────

function defaultInjectStubs(
  html: string,
  config: StubInjectionConfig,
): StubInjectionResult {
  let result = html;
  const injectedIds: string[] = [];

  for (const stub of config.stubs) {
    const tag = `<script data-vaeo-stub="${stub.app_id}">${stub.stub_js}</script>`;
    if (config.insert_before_closing_body && result.includes('</body>')) {
      result = result.replace('</body>', `${tag}\n</body>`);
    } else {
      result += `\n${tag}`;
    }
    injectedIds.push(stub.app_id);
  }

  return {
    html: result,
    injected_count: injectedIds.length,
    injected_app_ids: injectedIds,
  };
}

// ── Main validator ───────────────────────────────────────────────────────────

export async function validateFixUnderLoad(
  input: FixValidationInput,
  deps?: {
    injectStubs?: (html: string, config: StubInjectionConfig) => StubInjectionResult;
  },
): Promise<FixValidationResult> {
  try {
    // 1. Apply text fixes
    const { html: fixedHtml, applied } = applyTextFixes(input.html_before, input.fix_types);

    // 2. Re-inject stubs if simulation had stubs
    let htmlAfter = fixedHtml;
    let simulationApplied = false;

    if (input.simulation_result.stubs_applied.length > 0) {
      const injector = deps?.injectStubs ?? defaultInjectStubs;
      const injectionResult = injector(fixedHtml, {
        stubs: input.simulation_result.stubs_applied,
        insert_before_closing_body: true,
      });
      htmlAfter = injectionResult.html;
      simulationApplied = injectionResult.injected_count > 0;
    }

    // 3. Build fixes_applied with line counts
    const fixesApplied: AppliedFix[] = input.fix_types.map((fix_type) => {
      const success = applied.includes(fix_type);
      const linesChanged = success ? countLinesDiff(input.html_before, fixedHtml) : 0;
      const descriptions: Record<string, string> = {
        title_missing: 'Inserted <title> tag',
        meta_description_missing: 'Inserted meta description',
        image_alt_missing: 'Added alt attribute to img',
        lang_missing: 'Added lang="en" to html tag',
        canonical_missing: 'Inserted canonical link',
      };
      return {
        fix_type,
        success,
        change_description: success
          ? (descriptions[fix_type] ?? `Applied ${fix_type}`)
          : `Fix not needed or already present: ${fix_type}`,
        lines_changed: linesChanged,
      };
    });

    // 4. Determine ready_for_scoring
    const allSucceeded = fixesApplied.every((f) => f.success);
    const ready_for_scoring = allSucceeded && htmlAfter.length > 0;

    return {
      site_id: input.site_id,
      url: input.url,
      fix_types: input.fix_types,
      html_before: input.html_before,
      html_after: htmlAfter,
      fixes_applied: fixesApplied,
      simulation_applied: simulationApplied,
      production_condition_warnings: input.simulation_result.warnings,
      validated_at: new Date().toISOString(),
      ready_for_scoring,
    };
  } catch (err) {
    return {
      site_id: input.site_id,
      url: input.url,
      fix_types: input.fix_types,
      html_before: input.html_before,
      html_after: '',
      fixes_applied: [],
      simulation_applied: false,
      production_condition_warnings: [],
      validated_at: new Date().toISOString(),
      ready_for_scoring: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
