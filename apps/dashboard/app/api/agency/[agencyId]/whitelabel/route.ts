import { NextResponse } from 'next/server';

// ── Inline types (avoid bundler import issues) ───────────────────────────────

interface WhiteLabelConfig {
  agency_id:          string;
  agency_name:        string;
  brand_name:         string;
  logo_url:           string | null;
  primary_color:      string;
  support_email:      string;
  hide_vaeo_branding: boolean;
  custom_domain:      string | null;
}

function buildDefaultWhiteLabel(agency_id: string): WhiteLabelConfig {
  return {
    agency_id,
    agency_name: agency_id,
    brand_name: agency_id,
    logo_url: null,
    primary_color: '#6366f1',
    support_email: 'support@vaeo.app',
    hide_vaeo_branding: false,
    custom_domain: null,
  };
}

function isValidHexColor(color: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color ?? '');
}

// ── GET handler ──────────────────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ agencyId: string }> },
) {
  try {
    const { agencyId } = await params;

    // In production, load from Supabase
    // const { data } = await supabase.from('whitelabel_configs')
    //   .select('*').eq('agency_id', agencyId).maybeSingle();

    const config = buildDefaultWhiteLabel(agencyId);

    return NextResponse.json(config, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to load white-label config' },
      { status: 500 },
    );
  }
}

// ── PATCH handler ────────────────────────────────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ agencyId: string }> },
) {
  try {
    const { agencyId } = await params;
    const body = await request.json() as Partial<WhiteLabelConfig>;

    // Validate primary_color if provided
    if (body.primary_color && !isValidHexColor(body.primary_color)) {
      return NextResponse.json(
        { error: 'Invalid primary_color. Must be a valid hex color (#fff or #ffffff)' },
        { status: 400 },
      );
    }

    // In production, upsert in Supabase
    const config: WhiteLabelConfig = {
      ...buildDefaultWhiteLabel(agencyId),
      ...body,
      agency_id: agencyId,
    };

    return NextResponse.json(config, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to update white-label config' },
      { status: 500 },
    );
  }
}
