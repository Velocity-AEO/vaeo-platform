import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getApprovalQueue, updateApprovalStatus } from '../../../../../tools/learning/approval_queue.js';
import { updateLearning } from '../../../../../tools/learning/learning_logger.js';
import { getApprovals, type ApprovalsDeps } from './handler.ts';

function makeDeps(): ApprovalsDeps {
  const db = createServerClient();
  return {
    getPending: async (siteId) => {
      return getApprovalQueue(db as never, siteId);
    },
    setStatus: async (id, status, note, reviewerId) => {
      return updateApprovalStatus(id, status, note, db as never, reviewerId);
    },
    setLearning: async (learningId, updates) => {
      return updateLearning(learningId, updates, db as never);
    },
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const siteId = req.nextUrl.searchParams.get('site_id') ?? undefined;
  const result = await getApprovals(makeDeps(), siteId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json(result.data ?? []);
}
