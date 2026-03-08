/**
 * packages/commands/src/monitor-scheduler.ts
 *
 * Schedules post-deploy monitor checks using BullMQ if Redis is configured,
 * otherwise logs the scheduled times and returns without throwing.
 *
 * Called non-blocking from optimize.ts after a successful deploy.
 */

const SCHEDULE = [
  { check_type: 'http_status',  delay_ms: 1  * 60 * 60 * 1000 },   //  1h
  { check_type: 'lighthouse',   delay_ms: 24 * 60 * 60 * 1000 },   // 24h
  { check_type: 'playwright',   delay_ms: 48 * 60 * 60 * 1000 },   // 48h
  { check_type: 'gsc_indexing', delay_ms: 72 * 60 * 60 * 1000 },   // 72h
] as const;

export async function scheduleMonitorChecks(
  runId:    string,
  tenantId: string,
  siteId:   string,
): Promise<void> {
  const redisUrl = process.env['REDIS_URL'];

  if (!redisUrl) {
    // No Redis configured — log scheduled times and return
    for (const job of SCHEDULE) {
      const runAt = new Date(Date.now() + job.delay_ms).toISOString();
      console.log(`[monitor-scheduler] ${job.check_type} scheduled at ${runAt} (run=${runId})`);
    }
    return;
  }

  // BullMQ available — enqueue delayed jobs
  try {
    const { Queue } = await import('bullmq');
    const queue = new Queue('monitor', {
      connection: { url: redisUrl },
    });

    await Promise.all(
      SCHEDULE.map(job =>
        queue.add(
          job.check_type,
          { run_id: runId, tenant_id: tenantId, site_id: siteId, check_type: job.check_type },
          { delay: job.delay_ms, jobId: `${runId}:${job.check_type}` },
        ),
      ),
    );

    await queue.close();
    console.log(`[monitor-scheduler] Scheduled 4 monitor checks for run=${runId}`);
  } catch (err) {
    // Non-blocking — log and continue
    console.error(`[monitor-scheduler] Failed to enqueue jobs: ${(err as Error).message}`);
  }
}
