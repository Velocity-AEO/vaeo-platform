import { NextRequest, NextResponse } from 'next/server';

// ── Inline types ─────────────────────────────────────────────────────────────

interface DriftEvent {
  fix_id:            string;
  site_id:           string;
  url:               string;
  issue_type:        string;
  original_value:    string;
  expected_value:    string;
  current_value:     string | null;
  drift_status:      'stable' | 'drifted' | 'unknown';
  drift_detected_at: string;
  applied_at:        string;
  days_since_fix:    number;
  probable_cause:    string | null;
}

interface DriftScanResult {
  site_id:             string;
  scanned_at:          string;
  fixes_scanned:       number;
  stable_fixes:        number;
  drifted_fixes:       number;
  unknown_fixes:       number;
  drift_rate:          number;
  drift_events:        DriftEvent[];
  most_probable_cause: string | null;
}

// ── GET /api/sites/[siteId]/drift ────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    if (!siteId) {
      return NextResponse.json({ error: 'Missing siteId' }, { status: 400 });
    }

    // Simulated drift scan result
    const result: DriftScanResult = {
      site_id:             siteId,
      scanned_at:          new Date().toISOString(),
      fixes_scanned:       18,
      stable_fixes:        16,
      drifted_fixes:       2,
      unknown_fixes:       0,
      drift_rate:          11.1,
      drift_events: [
        {
          fix_id:            'drift_fix_1',
          site_id:           siteId,
          url:               'https://example.com/products/item-1',
          issue_type:        'SCHEMA_MISSING',
          original_value:    '',
          expected_value:    '{"@type":"Product"}',
          current_value:     null,
          drift_status:      'drifted',
          drift_detected_at: new Date().toISOString(),
          applied_at:        new Date(Date.now() - 5 * 86_400_000).toISOString(),
          days_since_fix:    5,
          probable_cause:    'theme_update',
        },
        {
          fix_id:            'drift_fix_2',
          site_id:           siteId,
          url:               'https://example.com/pages/about',
          issue_type:        'META_DESC_MISSING',
          original_value:    '',
          expected_value:    'About our company',
          current_value:     null,
          drift_status:      'drifted',
          drift_detected_at: new Date().toISOString(),
          applied_at:        new Date(Date.now() - 3 * 86_400_000).toISOString(),
          days_since_fix:    3,
          probable_cause:    'cms_edit',
        },
      ],
      most_probable_cause: 'theme_update',
    };

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
