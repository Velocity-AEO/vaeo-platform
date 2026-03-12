import { NextResponse } from 'next/server';
import {
  SOC2_CONTROLS,
  getComplianceScore,
  getControlsByCriteria,
  type TrustServiceCriteria,
} from '../../../../../tools/security/control_library.js';

export async function GET() {
  const score = getComplianceScore();

  const criteria: TrustServiceCriteria[] = ['CC', 'A', 'PI', 'C', 'P'];
  const by_criteria: Record<string, typeof SOC2_CONTROLS> = {};
  for (const c of criteria) {
    by_criteria[c] = getControlsByCriteria(c);
  }

  const gaps = SOC2_CONTROLS
    .filter((c) => c.gaps && c.gaps.length > 0)
    .map((c) => ({
      control_id: c.id,
      control_title: c.title,
      status: c.status,
      gaps: c.gaps!,
    }));

  return NextResponse.json(
    {
      generated_at: new Date().toISOString(),
      score,
      controls: SOC2_CONTROLS,
      by_criteria,
      gaps,
    },
    {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    },
  );
}
