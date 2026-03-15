/**
 * POST /api/sites/[siteId]/crawl
 *
 * Runs a full crawl + audit pipeline for the site and writes new issues to
 * action_queue with execution_status='queued'. Existing approved/deployed rows
 * are untouched (upsert with ignoreDuplicates=true in the audit writeQueue).
 *
 * Implementation note: the crawl engine uses crawlee (+ Puppeteer/Playwright
 * transitive deps) which cannot be bundled by webpack. The pipeline is run as
 * a child process via scripts/crawl-worker.ts so those packages never enter
 * the Next.js bundle.
 *
 * Never sets execution_status='approved' — only the dashboard UI approval
 * action (POST /api/sites/[siteId]/fixes with action='approve') may do that.
 *
 * Returns: { urls_crawled, issues_found, issues_written }
 * Errors:  { error: string } with 4xx/5xx status.
 */

import { spawn }               from 'node:child_process';
import path                    from 'node:path';
import type { NextRequest }    from 'next/server';
import { NextResponse }        from 'next/server';
import { createServerClient }  from '@/lib/supabase';

// Allow up to 5 minutes — crawls of large sites can take 60–120 s.
export const maxDuration = 300;

// ── Worker subprocess helpers ─────────────────────────────────────────────

interface CrawlWorkerResult {
  urls_crawled:   number;
  issues_found:   number;
  issues_written: number;
}

function runWorker(
  siteId:   string,
  tenantId: string,
  cmsType:  string,
): Promise<CrawlWorkerResult> {
  return new Promise((resolve, reject) => {
    // process.cwd() is apps/dashboard/ when Next.js runs locally.
    const cwd    = process.cwd();
    const worker = path.join(cwd, 'scripts', 'crawl-worker.ts');
    // Use tsx/esm as the ESM loader — installed in apps/dashboard/node_modules.
    const tsxEsm = path.join(cwd, 'node_modules', 'tsx', 'dist', 'esm', 'index.mjs');

    const child = spawn(
      process.execPath,
      ['--import', tsxEsm, worker,
       '--site-id', siteId, '--tenant-id', tenantId, '--cms', cmsType],
      { cwd, env: process.env },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on('error', reject);

    child.on('close', (code) => {
      // stderr carries action-log JSON lines — not an error on its own.
      const line = stdout.trim().split('\n').pop() ?? '';
      try {
        const parsed = JSON.parse(line) as CrawlWorkerResult & { error?: string };
        if (code !== 0 || parsed.error) {
          reject(new Error(parsed.error ?? (stderr.trim() || `Worker exited with code ${code}`)));
        } else {
          resolve(parsed);
        }
      } catch {
        reject(new Error(stderr.trim() || `Worker failed (exit ${code}): ${stdout.slice(0, 200)}`));
      }
    });
  });
}

// ── Route handler ─────────────────────────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
): Promise<NextResponse> {
  const { siteId } = await params;

  // Look up tenant_id + cms_type — both required by the crawl/audit commands.
  const db = createServerClient();
  const { data: site, error: siteError } = await db
    .from('sites')
    .select('tenant_id, cms_type')
    .eq('site_id', siteId)
    .maybeSingle();

  if (siteError || !site) {
    return NextResponse.json({ error: 'Site not found' }, { status: 404 });
  }

  try {
    const result = await runWorker(
      siteId,
      site.tenant_id as string,
      site.cms_type  as string,
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
