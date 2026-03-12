// tools/heavyweight/case_study_storage.ts — Case study persistence & formatting
// Stores case studies and renders them as Markdown. Never throws.

import type { CaseStudy, CaseStudySection } from './case_study_generator.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CaseStudyRecord {
  id: string;
  site_id: string;
  site_domain: string;
  case_study: CaseStudy;
  stored_at: string;
  version: number;
}

export interface CaseStudyStore {
  records: CaseStudyRecord[];
}

// ── In-memory store (replace with DB in production) ─────────────────────────

let store: CaseStudyStore = { records: [] };

export function resetStore(): void {
  store = { records: [] };
}

export function getStore(): CaseStudyStore {
  return store;
}

// ── Storage operations ──────────────────────────────────────────────────────

export function storeCaseStudy(cs: CaseStudy): CaseStudyRecord {
  const existing = store.records.find((r) => r.site_id === cs.site_id);
  const version = existing ? existing.version + 1 : 1;

  const record: CaseStudyRecord = {
    id: `cs_${cs.site_id}_v${version}`,
    site_id: cs.site_id,
    site_domain: cs.site_domain,
    case_study: cs,
    stored_at: new Date().toISOString(),
    version,
  };

  if (existing) {
    const idx = store.records.indexOf(existing);
    store.records[idx] = record;
  } else {
    store.records.push(record);
  }

  return record;
}

export function getCaseStudy(site_id: string): CaseStudyRecord | undefined {
  return store.records.find((r) => r.site_id === site_id);
}

export function listCaseStudies(): CaseStudyRecord[] {
  return [...store.records].sort((a, b) => b.stored_at.localeCompare(a.stored_at));
}

export function deleteCaseStudy(site_id: string): boolean {
  const idx = store.records.findIndex((r) => r.site_id === site_id);
  if (idx === -1) return false;
  store.records.splice(idx, 1);
  return true;
}

// ── Markdown formatter ──────────────────────────────────────────────────────

function formatSection(section: CaseStudySection): string {
  const lines: string[] = [];
  lines.push(`## ${section.heading}`);
  lines.push('');
  lines.push(section.body);
  if (section.data_points.length > 0) {
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    for (const dp of section.data_points) {
      lines.push(`| ${dp.label} | ${dp.value} |`);
    }
  }
  return lines.join('\n');
}

export function formatCaseStudyAsMarkdown(cs: CaseStudy): string {
  const lines: string[] = [];

  lines.push(`# ${cs.headline}`);
  lines.push('');
  lines.push(`*${cs.subheadline}*`);
  lines.push('');

  for (const section of cs.sections) {
    lines.push(formatSection(section));
    lines.push('');
  }

  if (cs.pullquote) {
    lines.push(`> ${cs.pullquote}`);
    lines.push('');
  }

  // Metrics summary
  const m = cs.metrics_snapshot;
  lines.push('## Key Metrics');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Performance Before | ${m.performance_before} |`);
  lines.push(`| Performance After | ${m.performance_after} |`);
  lines.push(`| Performance Delta | +${m.performance_delta} |`);
  lines.push(`| LCP Before | ${(m.lcp_before_ms / 1000).toFixed(1)}s |`);
  lines.push(`| LCP After | ${(m.lcp_after_ms / 1000).toFixed(1)}s |`);
  lines.push(`| Apps Detected | ${m.apps_detected} |`);
  lines.push(`| Fixes Applied | ${m.fixes_applied} |`);
  if (m.monthly_savings_usd > 0) {
    lines.push(`| Monthly Savings | $${m.monthly_savings_usd}/mo |`);
  }
  lines.push('');

  if (cs.shareable_summary) {
    lines.push('---');
    lines.push('');
    lines.push(`**Share:** ${cs.shareable_summary}`);
    lines.push('');
  }

  lines.push(`*${cs.cta}*`);
  lines.push('');
  lines.push(`*Generated: ${cs.generated_at}*`);

  return lines.join('\n');
}
