// tools/live/feedback_loop.ts — Post-deploy feedback loop
// Wires deploy outcomes back to the learning center. Never throws.

import type { FixBatch } from './live_fix_executor.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type FeedbackType =
  | 'deploy_success'
  | 'deploy_failure'
  | 'verification_pass'
  | 'verification_fail'
  | 'regression_detected';

export interface FeedbackEvent {
  event_id: string;
  site_id: string;
  run_id: string;
  fix_type: string;
  url: string;
  success: boolean;
  confidence_delta: number;
  health_score_delta?: number;
  feedback_type: FeedbackType;
  source: string;
  created_at: string;
}

export interface FeedbackSummary {
  site_id: string;
  run_id: string;
  events: FeedbackEvent[];
  total_events: number;
  success_rate: number;
  avg_confidence_delta: number;
  patterns_updated: string[];
  learning_writes: number;
  summarized_at: string;
}

export interface FeedbackDeps {
  writeLearning?: (
    site_id: string,
    fix_type: string,
    success: boolean,
    confidence_delta: number,
  ) => Promise<void>;
  updatePattern?: (
    fix_type: string,
    delta: number,
  ) => Promise<void>;
}

// ── Confidence deltas ───────────────────────────────────────────────────────

const CONFIDENCE_DELTAS: Record<FeedbackType, number> = {
  deploy_success: 0.05,
  verification_pass: 0.03,
  deploy_failure: -0.10,
  verification_fail: -0.08,
  regression_detected: -0.15,
};

// ── Build event ─────────────────────────────────────────────────────────────

export function buildFeedbackEvent(
  site_id: string,
  run_id: string,
  fix_type: string,
  url: string,
  success: boolean,
  feedback_type: FeedbackType,
): FeedbackEvent {
  return {
    event_id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    site_id,
    run_id,
    fix_type,
    url,
    success,
    confidence_delta: CONFIDENCE_DELTAS[feedback_type],
    feedback_type,
    source: 'live_run_feedback',
    created_at: new Date().toISOString(),
  };
}

// ── Process batch ───────────────────────────────────────────────────────────

export async function processFeedbackBatch(
  site_id: string,
  run_id: string,
  batch: FixBatch,
  deps?: FeedbackDeps,
): Promise<FeedbackSummary> {
  const events: FeedbackEvent[] = [];
  let learningWrites = 0;
  const patternsUpdated = new Set<string>();

  for (const attempt of batch.attempts) {
    // Determine feedback type from attempt outcome
    let feedbackType: FeedbackType;
    if (attempt.success && attempt.sandbox_passed) {
      feedbackType = attempt.deployed ? 'deploy_success' : 'verification_pass';
    } else if (!attempt.sandbox_passed) {
      feedbackType = 'verification_fail';
    } else {
      feedbackType = 'deploy_failure';
    }

    const event = buildFeedbackEvent(
      site_id,
      run_id,
      attempt.issue.fix_type,
      attempt.issue.url,
      attempt.success,
      feedbackType,
    );
    events.push(event);

    // Write learning (non-fatal)
    if (deps?.writeLearning) {
      try {
        await deps.writeLearning(site_id, attempt.issue.fix_type, attempt.success, event.confidence_delta);
        learningWrites++;
      } catch {
        // non-fatal
      }
    }

    // Update pattern (non-fatal)
    if (deps?.updatePattern) {
      try {
        await deps.updatePattern(attempt.issue.fix_type, event.confidence_delta);
        patternsUpdated.add(attempt.issue.fix_type);
      } catch {
        // non-fatal
      }
    }
  }

  const successEvents = events.filter((e) => e.success).length;
  const totalDeltas = events.reduce((sum, e) => sum + e.confidence_delta, 0);

  return {
    site_id,
    run_id,
    events,
    total_events: events.length,
    success_rate: events.length > 0 ? successEvents / events.length : 0,
    avg_confidence_delta: events.length > 0 ? totalDeltas / events.length : 0,
    patterns_updated: [...patternsUpdated],
    learning_writes: learningWrites,
    summarized_at: new Date().toISOString(),
  };
}
