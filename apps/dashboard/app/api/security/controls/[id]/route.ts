import { NextResponse } from 'next/server';
import { SOC2_CONTROLS } from '@tools/security/control_library.js';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const control = SOC2_CONTROLS.find((c) => c.id === params.id);

  if (!control) {
    return NextResponse.json(
      { error: `Control not found: ${params.id}` },
      { status: 404 },
    );
  }

  return NextResponse.json(control);
}
