/**
 * tools/jobs/priority_queue.ts
 *
 * Priority queue with age-based starvation prevention
 * and health-score boosting. Never throws.
 */

import type { JobPriority } from './job_orchestrator.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PriorityQueueItem {
  job_id:      string;
  site_id:     string;
  tenant_id:   string;
  priority:    JobPriority;
  enqueued_at: string;
  score:       number;
}

export interface PriorityQueueDb {
  getQueuedJobs: (tenant_id: string) => Promise<Array<{
    job_id:      string;
    site_id:     string;
    tenant_id:   string;
    priority:    JobPriority;
    enqueued_at: string;
    health_score?: number;
  }>>;
}

// ── Priority base scores ─────────────────────────────────────────────────────

const BASE_SCORES: Record<JobPriority, number> = {
  high:   1000,
  normal: 500,
  low:    100,
};

const AGE_BONUS_CAP = 200;
const HEALTH_THRESHOLD = 40;
const HEALTH_BONUS = 50;

// ── calculatePriorityScore ──────────────────────────────────────────────────

export function calculatePriorityScore(
  priority:      JobPriority,
  enqueued_at:   string,
  health_score?: number,
): number {
  let score = BASE_SCORES[priority];

  // Age bonus: floor(minutes_waiting / 10) * 10, capped at 200
  const enqueued = new Date(enqueued_at).getTime();
  const now = Date.now();
  const minutesWaiting = Math.max(0, (now - enqueued) / 60000);
  const ageBonus = Math.min(Math.floor(minutesWaiting / 10) * 10, AGE_BONUS_CAP);
  score += ageBonus;

  // Health penalty: sick sites get bumped up
  if (health_score !== undefined && health_score < HEALTH_THRESHOLD) {
    score += HEALTH_BONUS;
  }

  return score;
}

// ── sortByPriority ──────────────────────────────────────────────────────────

export function sortByPriority(
  items: PriorityQueueItem[],
): PriorityQueueItem[] {
  return [...items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Stable: earlier enqueued first
    return new Date(a.enqueued_at).getTime() - new Date(b.enqueued_at).getTime();
  });
}

// ── buildPriorityQueue ──────────────────────────────────────────────────────

export async function buildPriorityQueue(
  tenant_id: string,
  db:        PriorityQueueDb,
): Promise<PriorityQueueItem[]> {
  try {
    const rows = await db.getQueuedJobs(tenant_id);
    const items: PriorityQueueItem[] = rows.map((row) => ({
      job_id:      row.job_id,
      site_id:     row.site_id,
      tenant_id:   row.tenant_id,
      priority:    row.priority,
      enqueued_at: row.enqueued_at,
      score:       calculatePriorityScore(row.priority, row.enqueued_at, row.health_score),
    }));
    return sortByPriority(items);
  } catch {
    return [];
  }
}

// ── peekNextJob ─────────────────────────────────────────────────────────────

export async function peekNextJob(
  tenant_id: string,
  db:        PriorityQueueDb,
): Promise<PriorityQueueItem | null> {
  try {
    const queue = await buildPriorityQueue(tenant_id, db);
    return queue[0] ?? null;
  } catch {
    return null;
  }
}
