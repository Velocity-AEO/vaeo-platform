import { NextRequest, NextResponse } from 'next/server';

// ── Mock registry data (mirrors tools/native/unified_registry.ts) ────────────

const REGISTRY = [
  {
    component_type: 'shipping_bar',
    display_name: 'Shipping Bar',
    description: 'Animated free shipping progress bar. Drives order value up.',
    status: 'available',
    default_config: {
      threshold_cents: 5000,
      bar_color: '#4ade80',
      background_color: '#f0fdf4',
      text_below: 'You qualify for FREE shipping!',
      text_above: 'Add {remaining} more for FREE shipping!',
      position: 'top',
      animate: true,
    },
  },
  {
    component_type: 'email_capture',
    display_name: 'Email Capture Popup',
    description: 'Exit-intent email capture. No third-party popup app needed.',
    status: 'available',
    default_config: {
      trigger: 'exit_intent',
      title: 'Get 10% Off Your First Order',
      subtitle: 'Join our list and save on your first purchase.',
    },
  },
  {
    component_type: 'social_feed',
    display_name: 'Social Feed Widget',
    description: 'Pull in Instagram, TikTok, or YouTube content directly to your storefront.',
    status: 'available',
    default_config: {
      feed_type: 'rss',
      feed_url: '',
      display_count: 6,
      layout: 'grid',
      columns: 3,
      show_caption: true,
      show_platform_badge: true,
      image_aspect_ratio: '1:1',
      cache_duration_minutes: 30,
    },
  },
];

// ── GET: list all registry entries ──────────────────────────────────────────

export async function GET() {
  return NextResponse.json({ components: REGISTRY }, { status: 200 });
}

// ── POST: deploy a component ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { component_type, config, dry_run } = body;

    const entry = REGISTRY.find((r) => r.component_type === component_type);
    if (!entry) {
      return NextResponse.json(
        { error: `Unknown component type: ${component_type}` },
        { status: 400 },
      );
    }

    const component_id = `comp_${component_type}_${Date.now()}`;
    const snippet_name = `vaeo-${component_type.replace(/_/g, '-')}-${component_id.slice(-6)}`;

    const result = {
      component: {
        component_id,
        site_id: body.site_id ?? 'demo-site',
        component_type,
        name: entry.display_name,
        status: dry_run ? 'draft' : 'active',
        config: { ...entry.default_config, ...config },
        snippet_name,
        installed_at: dry_run ? undefined : new Date().toISOString(),
      },
      install_result: {
        success: true,
        action: dry_run ? 'preview' : 'created',
        message: dry_run
          ? `Dry run: ${entry.display_name} snippet generated`
          : `${entry.display_name} deployed successfully`,
      },
      snippet_html: `<!-- VAEO ${entry.display_name} | ${snippet_name} -->\n<div id="${snippet_name}"><!-- ${entry.display_name} renders here --></div>`,
    };

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Deploy failed' },
      { status: 500 },
    );
  }
}
