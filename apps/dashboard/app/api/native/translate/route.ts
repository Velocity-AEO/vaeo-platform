import { NextRequest, NextResponse } from 'next/server';
import {
  translateObservationToSpec,
  type TranslatorInput,
} from '../../../../../../../tools/native/translator.js';

/**
 * POST /api/native/translate
 * Accepts TranslatorInput, returns TranslatorOutput.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;

    if (!body.app_name || !(body.app_name as string).trim()) {
      return NextResponse.json(
        { error: 'app_name is required' },
        { status: 400 },
      );
    }
    if (!body.observation_notes || !(body.observation_notes as string).trim()) {
      return NextResponse.json(
        { error: 'observation_notes is required' },
        { status: 400 },
      );
    }

    const input: TranslatorInput = {
      app_name: body.app_name as string,
      app_id: (body.app_id as string) ?? '',
      category: (body.category as TranslatorInput['category']) ?? 'other',
      observed_url: body.observed_url as string | undefined,
      observation_notes: body.observation_notes as string,
      observer_name: (body.observer_name as string) ?? 'Unknown',
    };

    const output = translateObservationToSpec(input);

    return NextResponse.json(output);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
