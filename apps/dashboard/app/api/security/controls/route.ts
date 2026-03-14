import { NextResponse } from 'next/server';
import {
  SOC2_CONTROLS,
  getComplianceScore,
} from '@tools/security/control_library.js';

export async function GET() {
  return NextResponse.json({
    controls: SOC2_CONTROLS,
    score: getComplianceScore(),
  });
}
