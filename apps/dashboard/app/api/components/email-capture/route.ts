import { NextResponse } from 'next/server';
import { deployEmailCapture } from '@tools/native/email_capture_orchestrator.js';
import { defaultEmailCaptureConfig } from '@tools/native/email_capture.js';

// ── GET — return mock active email capture component ────────────────────────

export async function GET() {
  const config = defaultEmailCaptureConfig();
  return NextResponse.json({
    component: {
      component_id: 'comp_ec_demo',
      site_id: 'demo-store',
      component_type: 'email_capture',
      name: 'Email Capture Popup',
      status: 'active',
      config,
      snippet_name: 'vaeo-email-capture-demo',
      render_tag: "{%- render 'vaeo-email-capture-demo' -%}",
      version: '1.0.0',
      installed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

// ── POST — deploy email capture with mock deps ──────────────────────────────

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const site_id = body.site_id ?? 'demo-store';
  const dry_run = body.dry_run ?? false;
  const config = body.config ?? undefined;

  const result = await deployEmailCapture(
    site_id,
    'demo-store.myshopify.com',
    config,
    dry_run,
    {
      writeSnippet: async () => ({ success: true }),
      updateTheme: async () => ({ success: true }),
    },
  );

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

// ── DELETE — remove email capture component ─────────────────────────────────

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}));
  const _component_id = body.component_id ?? 'comp_ec_demo';
  return NextResponse.json(
    { success: true },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
