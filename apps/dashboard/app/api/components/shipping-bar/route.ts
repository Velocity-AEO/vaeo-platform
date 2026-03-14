import { NextRequest, NextResponse } from 'next/server';
import { deployShippingBar, removeShippingBar } from '@tools/native/shipping_bar_orchestrator';
import { defaultShippingBarConfig } from '@tools/native/shipping_bar';
import { createComponent, updateComponentStatus } from '@tools/native/native_component';
import type { ShippingBarConfig } from '@tools/native/shipping_bar';

const mockDeps = {
  writeSnippet: async () => ({ success: true }),
  updateTheme:  async () => ({ success: true, backup_key: 'mock-backup-001' }),
};

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const cfg       = defaultShippingBarConfig();
    const component = createComponent('demo-site', 'shipping_bar', 'VAEO Shipping Bar', cfg as unknown as Record<string, unknown>);
    const active    = updateComponentStatus(component, 'active');
    active.installed_at = new Date(Date.now() - 3600_000).toISOString();

    return NextResponse.json(
      { component: active, config: cfg },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      config?:   Partial<ShippingBarConfig>;
      dry_run?:  boolean;
      site_id?:  string;
    };

    const result = await deployShippingBar(
      body.site_id ?? 'demo-site',
      'demo.myshopify.com',
      body.config,
      body.dry_run ?? true,
      mockDeps,
    );

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { component_id?: string };
    const component = createComponent('demo-site', 'shipping_bar', 'VAEO Shipping Bar', {});
    const result    = await removeShippingBar(component, 'demo.myshopify.com', {
      deleteSnippet: async () => ({ success: true }),
      revertTheme:   async () => ({ success: true }),
    });
    return NextResponse.json(
      { component_id: body.component_id ?? component.component_id, ...result },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
