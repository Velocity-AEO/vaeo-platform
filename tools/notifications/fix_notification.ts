/**
 * tools/notifications/fix_notification.ts
 *
 * Fix notification payload builder. Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type FixNotificationEvent =
  | 'fix_applied'
  | 'fix_failed'
  | 'rollback_applied'
  | 'live_run_complete'
  | 'qa_failed';

export interface FixNotificationPayload {
  event:                FixNotificationEvent;
  site_id:             string;
  domain:              string;
  fix_count?:          number;
  fix_summary?:        string[];
  failed_count?:       number;
  rollback_fix_id?:    string;
  qa_failed_viewports?: string[];
  triggered_at:        string;
}

// ── buildFixNotification ─────────────────────────────────────────────────────

export function buildFixNotification(
  event: FixNotificationEvent,
  site_id: string,
  domain: string,
  data?: Partial<FixNotificationPayload>,
): FixNotificationPayload {
  try {
    return {
      event,
      site_id:             site_id ?? '',
      domain:              domain ?? '',
      fix_count:           data?.fix_count,
      fix_summary:         data?.fix_summary,
      failed_count:        data?.failed_count,
      rollback_fix_id:     data?.rollback_fix_id,
      qa_failed_viewports: data?.qa_failed_viewports,
      triggered_at:        data?.triggered_at ?? new Date().toISOString(),
    };
  } catch {
    return {
      event: event ?? 'fix_applied',
      site_id: '',
      domain: '',
      triggered_at: new Date().toISOString(),
    };
  }
}

// ── getNotificationSubject ───────────────────────────────────────────────────

export function getNotificationSubject(payload: FixNotificationPayload): string {
  try {
    const d = payload.domain || 'your site';
    switch (payload.event) {
      case 'fix_applied':
        return `VAEO fixed ${payload.fix_count ?? 0} issues on ${d}`;
      case 'fix_failed':
        return `VAEO encountered errors on ${d}`;
      case 'rollback_applied':
        return `A fix was rolled back on ${d}`;
      case 'live_run_complete':
        return `VAEO run complete for ${d}`;
      case 'qa_failed':
        return `Viewport QA failed on ${d}`;
      default:
        return `VAEO notification for ${d}`;
    }
  } catch {
    return 'VAEO notification';
  }
}

// ── getNotificationBody ──────────────────────────────────────────────────────

export function getNotificationBody(payload: FixNotificationPayload): string {
  try {
    const d = payload.domain || 'your site';
    const lines: string[] = [];

    switch (payload.event) {
      case 'fix_applied':
        lines.push(`VAEO successfully applied ${payload.fix_count ?? 0} fixes on ${d}.`);
        break;
      case 'fix_failed':
        lines.push(`VAEO encountered ${payload.failed_count ?? 0} errors while processing fixes on ${d}.`);
        lines.push('Our team has been notified and will investigate.');
        break;
      case 'rollback_applied':
        lines.push(`A fix was rolled back on ${d}.`);
        if (payload.rollback_fix_id) {
          lines.push(`Fix ID: ${payload.rollback_fix_id}`);
        }
        lines.push('The original content has been restored.');
        break;
      case 'live_run_complete':
        lines.push(`VAEO completed a live run on ${d}.`);
        if (payload.fix_count) {
          lines.push(`${payload.fix_count} fixes were applied.`);
        }
        break;
      case 'qa_failed':
        lines.push(`Viewport QA check failed on ${d}.`);
        if (payload.qa_failed_viewports && payload.qa_failed_viewports.length > 0) {
          lines.push(`Failed viewports: ${payload.qa_failed_viewports.join(', ')}`);
        }
        break;
      default:
        lines.push(`Notification for ${d}.`);
    }

    if (payload.fix_summary && payload.fix_summary.length > 0) {
      lines.push('');
      lines.push('Fixes applied:');
      for (const item of payload.fix_summary) {
        lines.push(`  • ${item}`);
      }
    }

    return lines.join('\n');
  } catch {
    return 'VAEO notification';
  }
}

// ── shouldSendImmediately ────────────────────────────────────────────────────

export function shouldSendImmediately(event: FixNotificationEvent): boolean {
  try {
    return event === 'fix_failed' || event === 'rollback_applied' || event === 'qa_failed';
  } catch {
    return false;
  }
}
