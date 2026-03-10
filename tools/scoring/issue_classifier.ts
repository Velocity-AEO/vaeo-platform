/**
 * tools/scoring/issue_classifier.ts
 *
 * Classifies field-level SEO issues from tracer snapshots.
 * Pure logic — no I/O, fully testable.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface FieldSnapshot {
  url:           string;
  field_type:    string;   // 'title' | 'meta_description' | 'h1' | 'canonical' | 'schema'
  current_value: string | null;
  char_count:    number;
}

export type Severity = 'critical' | 'major' | 'minor';

export interface IssueReport {
  url:             string;
  field:           string;
  issue_type:      string;
  severity:        Severity;
  current_value:   string | null;
  char_count:      number;
  points_deducted: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_POINTS: Record<Severity, number> = {
  critical: 3,
  major:    2,
  minor:    1,
};

// ── Single-snapshot rules ────────────────────────────────────────────────────

type Rule = (snap: FieldSnapshot) => IssueReport | null;

const TITLE_RULES: Rule[] = [
  (s) => {
    if (!s.current_value || s.current_value.trim() === '') {
      return issue(s, 'title_missing', 'critical');
    }
    return null;
  },
  (s) => {
    if (s.current_value && s.current_value.trim() !== '' && s.char_count < 30) {
      return issue(s, 'title_too_short', 'minor');
    }
    return null;
  },
  (s) => {
    if (s.current_value && s.char_count > 60) {
      return issue(s, 'title_too_long', 'minor');
    }
    return null;
  },
];

const META_RULES: Rule[] = [
  (s) => {
    if (!s.current_value || s.current_value.trim() === '') {
      return issue(s, 'meta_missing', 'major');
    }
    return null;
  },
  (s) => {
    if (s.current_value && s.current_value.trim() !== '' && s.char_count < 120) {
      return issue(s, 'meta_too_short', 'minor');
    }
    return null;
  },
  (s) => {
    if (s.current_value && s.char_count > 155) {
      return issue(s, 'meta_too_long', 'minor');
    }
    return null;
  },
];

const H1_RULES: Rule[] = [
  (s) => {
    if (!s.current_value || s.current_value.trim() === '') {
      return issue(s, 'h1_missing', 'critical');
    }
    return null;
  },
];

const CANONICAL_RULES: Rule[] = [
  (s) => {
    if (!s.current_value || s.current_value.trim() === '') {
      return issue(s, 'canonical_missing', 'critical');
    }
    return null;
  },
];

const SCHEMA_RULES: Rule[] = [
  (s) => {
    if (!s.current_value || s.current_value.trim() === '') {
      return issue(s, 'schema_missing', 'major');
    }
    return null;
  },
];

const RULES_BY_FIELD: Record<string, Rule[]> = {
  title:            TITLE_RULES,
  meta_description: META_RULES,
  h1:               H1_RULES,
  canonical:        CANONICAL_RULES,
  schema:           SCHEMA_RULES,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function issue(snap: FieldSnapshot, issueType: string, severity: Severity): IssueReport {
  return {
    url:             snap.url,
    field:           snap.field_type,
    issue_type:      issueType,
    severity,
    current_value:   snap.current_value,
    char_count:      snap.char_count,
    points_deducted: SEVERITY_POINTS[severity],
  };
}

// ── Duplicate detection ──────────────────────────────────────────────────────

function detectDuplicates(
  snapshots: FieldSnapshot[],
  fieldType: string,
  issueType: string,
  severity: Severity,
): IssueReport[] {
  const byValue = new Map<string, FieldSnapshot[]>();
  for (const snap of snapshots) {
    if (snap.field_type !== fieldType) continue;
    const val = snap.current_value?.trim();
    if (!val) continue; // skip empty — already caught by missing rule
    const existing = byValue.get(val);
    if (existing) {
      existing.push(snap);
    } else {
      byValue.set(val, [snap]);
    }
  }

  const issues: IssueReport[] = [];
  for (const [, snaps] of byValue) {
    if (snaps.length >= 2) {
      for (const snap of snaps) {
        issues.push(issue(snap, issueType, severity));
      }
    }
  }
  return issues;
}

// ── h1_multiple detection ────────────────────────────────────────────────────

function detectMultipleH1(snapshots: FieldSnapshot[]): IssueReport[] {
  const byUrl = new Map<string, FieldSnapshot[]>();
  for (const snap of snapshots) {
    if (snap.field_type !== 'h1') continue;
    if (!snap.current_value || snap.current_value.trim() === '') continue;
    const existing = byUrl.get(snap.url);
    if (existing) {
      existing.push(snap);
    } else {
      byUrl.set(snap.url, [snap]);
    }
  }

  const issues: IssueReport[] = [];
  for (const [, snaps] of byUrl) {
    if (snaps.length >= 2) {
      for (const snap of snaps) {
        issues.push(issue(snap, 'h1_multiple', 'major'));
      }
    }
  }
  return issues;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Classify all SEO issues from a set of field snapshots.
 *
 * Runs single-field rules (missing, length) then cross-URL rules
 * (duplicates, multiple H1s).
 */
export function classifyFields(snapshots: FieldSnapshot[]): IssueReport[] {
  const issues: IssueReport[] = [];

  // Single-snapshot rules
  for (const snap of snapshots) {
    const rules = RULES_BY_FIELD[snap.field_type];
    if (!rules) continue;
    for (const rule of rules) {
      const result = rule(snap);
      if (result) issues.push(result);
    }
  }

  // Cross-URL duplicate detection
  issues.push(...detectDuplicates(snapshots, 'title', 'title_duplicate', 'major'));
  issues.push(...detectDuplicates(snapshots, 'meta_description', 'meta_duplicate', 'major'));

  // Multiple H1 detection (same URL, multiple non-empty H1 snapshots)
  issues.push(...detectMultipleH1(snapshots));

  return issues;
}
