import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getLearnings, type LearningsDeps, type LearningsQuery } from './handler.ts';

function makeDeps(): LearningsDeps {
  const db = createServerClient();
  return {
    fetchLearnings: async (query: LearningsQuery) => {
      let q = (db as never as {
        from(t: string): {
          select(c: string): {
            order(c: string, o: object): {
              limit(n: number): {
                eq(c: string, v: string): unknown;
              };
            };
          };
        };
      })
        .from('learnings')
        .select('*');

      // Chain filters — build via type-safe narrowing
      type ChainedQuery = {
        eq(col: string, val: string): ChainedQuery;
        order(col: string, opts: object): ChainedQuery;
        limit(n: number): ChainedQuery & Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      };

      let chain = q as unknown as ChainedQuery;
      if (query.site_id)    chain = chain.eq('site_id',         query.site_id);
      if (query.issue_type) chain = chain.eq('issue_type',      query.issue_type);
      if (query.status)     chain = chain.eq('approval_status', query.status);
      chain = chain.order('created_at', { ascending: false });
      chain = chain.limit(query.limit ?? 100);

      const { data, error } = await (chain as unknown as Promise<{ data: unknown[] | null; error: { message: string } | null }>);
      if (error) throw new Error(error.message);
      return (data ?? []) as ReturnType<LearningsDeps['fetchLearnings']> extends Promise<infer T> ? T : never;
    },
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const p           = req.nextUrl.searchParams;
  const limitRaw    = p.get('limit');
  const query: LearningsQuery = {
    site_id:    p.get('site_id')    ?? undefined,
    issue_type: p.get('issue_type') ?? undefined,
    status:     p.get('status')     ?? undefined,
    limit:      limitRaw ? parseInt(limitRaw, 10) : undefined,
  };

  const result = await getLearnings(query, makeDeps());
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  return NextResponse.json(result.data ?? []);
}
