/**
 * tools/learning/confidence_display_builder.ts
 *
 * Builds display-ready confidence data for fix history rows.
 * Clients see why VAEO made each fix decision.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ConfidenceDisplayData {
  fix_id:               string;
  confidence_score:     number;
  confidence_label:     string;
  confidence_color:     string;
  risk_level:           string;
  risk_label:           string;
  risk_color:           string;
  decision_method:      'auto_approved' | 'manually_approved' | 'auto_applied';
  decision_label:       string;
  decision_reasons:     string[];
  threshold_used:       number;
  threshold_met:        boolean;
  sandbox_passed:       boolean | null;
  viewport_qa_passed:   boolean | null;
  applied_at:           string;
}

// ── getConfidenceLabel ───────────────────────────────────────────────────────

export function getConfidenceLabel(score: number): string {
  try {
    if (typeof score !== 'number' || isNaN(score)) return 'Low';
    if (score >= 0.97) return 'Very High';
    if (score >= 0.92) return 'High';
    if (score >= 0.85) return 'Good';
    if (score >= 0.75) return 'Moderate';
    return 'Low';
  } catch {
    return 'Low';
  }
}

// ── getConfidenceColor ───────────────────────────────────────────────────────

export function getConfidenceColor(score: number): string {
  try {
    if (typeof score !== 'number' || isNaN(score)) return 'text-red-600';
    if (score >= 0.92) return 'text-green-600';
    if (score >= 0.85) return 'text-blue-600';
    if (score >= 0.75) return 'text-yellow-600';
    return 'text-red-600';
  } catch {
    return 'text-red-600';
  }
}

// ── getRiskLevelLabel ────────────────────────────────────────────────────────

export function getRiskLevelLabel(risk_level: string): string {
  try {
    const map: Record<string, string> = {
      critical: 'Critical Risk',
      high:     'High Risk',
      medium:   'Medium Risk',
      low:      'Low Risk',
    };
    return map[risk_level] ?? 'Unknown Risk';
  } catch {
    return 'Unknown Risk';
  }
}

// ── getRiskLevelColor ────────────────────────────────────────────────────────

export function getRiskLevelColor(risk_level: string): string {
  try {
    const map: Record<string, string> = {
      critical: 'text-red-700',
      high:     'text-orange-600',
      medium:   'text-yellow-600',
      low:      'text-green-600',
    };
    return map[risk_level] ?? 'text-slate-500';
  } catch {
    return 'text-slate-500';
  }
}

// ── buildDecisionReasons ─────────────────────────────────────────────────────

export function buildDecisionReasons(
  confidence_score: number,
  threshold_used: number,
  sandbox_passed: boolean | null,
  viewport_qa_passed: boolean | null,
  risk_level: string,
  decision_method: string,
): string[] {
  try {
    const reasons: string[] = [];

    const scorePct = Math.round((confidence_score ?? 0) * 100);
    const threshPct = Math.round((threshold_used ?? 0) * 100);
    reasons.push(`Confidence score: ${scorePct}% (threshold: ${threshPct}%)`);

    if (decision_method === 'auto_approved' || decision_method === 'auto_applied') {
      reasons.push('Score exceeded threshold — fix applied automatically');
    }
    if (decision_method === 'manually_approved') {
      reasons.push('Manually approved by account owner');
    }

    if (sandbox_passed === true) {
      reasons.push('Sandbox verification passed');
    } else if (sandbox_passed === false) {
      reasons.push('Sandbox verification failed — fix blocked until manual review');
    }

    if (viewport_qa_passed === true) {
      reasons.push('Visual QA passed at all 4 viewports');
    } else if (viewport_qa_passed === false) {
      reasons.push('Visual QA issues detected — review screenshots');
    }

    if (risk_level === 'critical' || risk_level === 'high') {
      reasons.push('High-risk fix type — elevated confidence required');
    }

    return reasons;
  } catch {
    return [];
  }
}

// ── getDecisionLabel ─────────────────────────────────────────────────────────

function getDecisionLabel(method: string): string {
  try {
    const map: Record<string, string> = {
      auto_approved:     'Auto-Approved',
      auto_applied:      'Auto-Applied',
      manually_approved: 'Manually Approved',
    };
    return map[method] ?? 'Applied';
  } catch {
    return 'Applied';
  }
}

// ── buildConfidenceDisplayData ───────────────────────────────────────────────

export function buildConfidenceDisplayData(
  fix: {
    fix_id:             string;
    confidence_score:   number;
    risk_level:         string;
    decision_method:    string;
    threshold_used:     number;
    sandbox_passed:     boolean | null;
    viewport_qa_passed: boolean | null;
    applied_at:         string;
  },
): ConfidenceDisplayData {
  try {
    const f = fix ?? {} as any;
    const score = typeof f.confidence_score === 'number' ? f.confidence_score : 0;
    const threshold = typeof f.threshold_used === 'number' ? f.threshold_used : 0;
    const method = f.decision_method ?? 'auto_applied';

    return {
      fix_id:             f.fix_id ?? '',
      confidence_score:   score,
      confidence_label:   getConfidenceLabel(score),
      confidence_color:   getConfidenceColor(score),
      risk_level:         f.risk_level ?? 'low',
      risk_label:         getRiskLevelLabel(f.risk_level ?? 'low'),
      risk_color:         getRiskLevelColor(f.risk_level ?? 'low'),
      decision_method:    method as ConfidenceDisplayData['decision_method'],
      decision_label:     getDecisionLabel(method),
      decision_reasons:   buildDecisionReasons(
        score,
        threshold,
        f.sandbox_passed ?? null,
        f.viewport_qa_passed ?? null,
        f.risk_level ?? 'low',
        method,
      ),
      threshold_used:     threshold,
      threshold_met:      score >= threshold,
      sandbox_passed:     f.sandbox_passed ?? null,
      viewport_qa_passed: f.viewport_qa_passed ?? null,
      applied_at:         f.applied_at ?? '',
    };
  } catch {
    return {
      fix_id:             '',
      confidence_score:   0,
      confidence_label:   'Low',
      confidence_color:   'text-red-600',
      risk_level:         'low',
      risk_label:         'Low Risk',
      risk_color:         'text-green-600',
      decision_method:    'auto_applied',
      decision_label:     'Auto-Applied',
      decision_reasons:   [],
      threshold_used:     0,
      threshold_met:      true,
      sandbox_passed:     null,
      viewport_qa_passed: null,
      applied_at:         '',
    };
  }
}
