import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { updateApprovalStatus } from '@tools/learning/approval_queue.js';
import { updateLearning } from '@tools/learning/learning_logger.js';
import { rejectItem, type ApprovalsDeps } from '../../handler.ts';

function makeDeps(): ApprovalsDeps {
  const db = createServerClient();
  return {
    getPending: async () => [],
    setStatus: async (id, status, note, reviewerId) => {
      return updateApprovalStatus(id, status, note, db as never, reviewerId);
    },
    setLearning: async (learningId, updates) => {
      return updateLearning(learningId, updates, db as never);
    },
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const { id } = params;
  let note        = '';
  let reviewerId: string | undefined;
  let learningId: string | undefined;

  try {
    const body = await req.json() as { note?: string; reviewer_id?: string; learning_id?: string };
    note        = body.note ?? '';
    reviewerId  = body.reviewer_id;
    learningId  = body.learning_id;
  } catch { /* body optional */ }

  const result = await rejectItem(id, note, reviewerId, learningId, makeDeps());
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json({ ok: true });
}
