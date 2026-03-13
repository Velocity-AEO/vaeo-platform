/**
 * apps/dashboard/lib/suspension_display.ts
 *
 * Pure logic for suspension badge display on agency portal.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface SuspensionDisplayInfo {
  is_suspended:   boolean;
  badge_label:    string;
  badge_color:    string;
  tooltip:        string;
  show_resume:    boolean;
}

export interface SiteSuspensionData {
  pipeline_suspended:          boolean;
  pipeline_resume_at:          string | null;
  consecutive_failures:        number;
  pipeline_suspension_reason:  string | null;
}

// ── getSuspensionDisplayInfo ─────────────────────────────────────────────────

export function getSuspensionDisplayInfo(
  site: SiteSuspensionData | null,
): SuspensionDisplayInfo {
  const none: SuspensionDisplayInfo = {
    is_suspended: false,
    badge_label:  '',
    badge_color:  '',
    tooltip:      '',
    show_resume:  false,
  };

  try {
    if (!site || !site.pipeline_suspended) return none;

    const resumeAt = site.pipeline_resume_at ?? 'unknown';
    const failures = site.consecutive_failures ?? 0;
    const reason   = site.pipeline_suspension_reason ?? 'consecutive_failures';

    const isHard = failures >= 10;

    return {
      is_suspended: true,
      badge_label:  isHard ? 'Hard Suspended' : 'Suspended',
      badge_color:  isHard ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700',
      tooltip:      `Suspended until ${resumeAt} — ${failures} consecutive failure${failures !== 1 ? 's' : ''}${reason !== 'consecutive_failures' ? ` (${reason})` : ''}`,
      show_resume:  true,
    };
  } catch {
    return none;
  }
}

// ── formatResumeAt ───────────────────────────────────────────────────────────

export function formatResumeAt(resume_at: string | null): string {
  try {
    if (!resume_at) return 'unknown';
    const d = new Date(resume_at);
    if (isNaN(d.getTime())) return 'unknown';
    return d.toLocaleString('en-US', {
      month:  'short',
      day:    'numeric',
      hour:   'numeric',
      minute: '2-digit',
    });
  } catch {
    return 'unknown';
  }
}

// ── getSuspensionReasonLabel ─────────────────────────────────────────────────

export function getSuspensionReasonLabel(reason: string | null): string {
  try {
    switch (reason) {
      case 'consecutive_failures': return 'Too many consecutive failures';
      case 'credential_invalid':   return 'Invalid credentials';
      case 'theme_conflict':       return 'Theme conflict detected';
      case 'api_quota_exceeded':   return 'API quota exceeded';
      case 'manual':               return 'Manually suspended';
      default:                     return 'Suspended';
    }
  } catch {
    return 'Suspended';
  }
}
