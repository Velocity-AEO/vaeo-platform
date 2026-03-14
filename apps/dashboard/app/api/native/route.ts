import { NextResponse } from 'next/server';
import { getApprovedSpecs, SPEC_LIBRARY } from '@tools/native/spec_library.js';
import {
  COMPONENT_REGISTRY,
  getLiveComponents,
} from '@tools/native/component_registry.js';
import {
  APP_FINGERPRINT_CATALOG,
} from '@tools/apps/app_fingerprint_catalog.js';

/**
 * GET /api/native
 * Returns specs, components, and summary for the native component system.
 */
export async function GET() {
  try {
    const specs = SPEC_LIBRARY;
    const components = COMPONENT_REGISTRY;
    const approvedSpecs = getApprovedSpecs();
    const liveComponents = getLiveComponents();
    const inDevelopment = components.filter((c) => c.status === 'development');

    // Calculate total monthly savings potential
    const replacedAppIds = new Set(approvedSpecs.map((s) => s.replaces_app_id));
    let totalSavings = 0;
    for (const app of APP_FINGERPRINT_CATALOG) {
      if (replacedAppIds.has(app.app_id) && app.monthly_cost_usd) {
        totalSavings += app.monthly_cost_usd;
      }
    }
    // Also check by app name if app_id doesn't match
    const replacedAppNames = new Set(approvedSpecs.map((s) => s.replaces_app.toLowerCase()));
    for (const app of APP_FINGERPRINT_CATALOG) {
      if (!replacedAppIds.has(app.app_id) && replacedAppNames.has(app.name.toLowerCase()) && app.monthly_cost_usd) {
        totalSavings += app.monthly_cost_usd;
      }
    }

    return NextResponse.json({
      specs,
      components,
      summary: {
        total_specs: specs.length,
        approved_specs: approvedSpecs.length,
        live_components: liveComponents.length,
        in_development: inDevelopment.length,
        total_monthly_savings_potential: totalSavings,
      },
    }, {
      status: 200,
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
