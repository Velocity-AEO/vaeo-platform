/**
 * tools/chatbot/quick_answers.ts
 *
 * Pre-seeds common questions with good answers so the
 * chatbot feels smart on first load. Never throws.
 */

import type { SiteContext } from './context_builder.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QuickAnswer {
  question:         string;
  answer_template:  string;
  requires_context: boolean;
  context_fields:   string[];
}

// ── QUICK_ANSWERS ─────────────────────────────────────────────────────────────

export const QUICK_ANSWERS: QuickAnswer[] = [
  {
    question: 'What should I fix first?',
    answer_template:
      'Your site health score is {health_score}/100. ' +
      'I recommend focusing on these top issues first: {top_issue_types}. ' +
      'Fixing these will have the biggest impact on your SEO performance.',
    requires_context: true,
    context_fields: ['health_score', 'top_issue_types'],
  },
  {
    question: 'What has VAEO fixed recently?',
    answer_template:
      'VAEO has completed {recent_fixes} fixes in the last 30 days for {domain}. ' +
      'These improvements are actively boosting your search visibility.',
    requires_context: true,
    context_fields: ['recent_fixes'],
  },
  {
    question: 'How is my site performing?',
    answer_template:
      'Your site health score is {health_score}/100 and your ranking trend is {ranking_trend}. ' +
      'Overall, your SEO foundation is solid and VAEO is continuously working to improve it.',
    requires_context: true,
    context_fields: ['health_score', 'ranking_trend'],
  },
  {
    question: 'What is my AI visibility score?',
    answer_template:
      'Your AI visibility score is {ai_visibility_score}/100. ' +
      'This measures how often AI tools like Perplexity and Google AI Overviews cite your site.',
    requires_context: true,
    context_fields: ['ai_visibility_score'],
  },
];

// ── formatAnswer ──────────────────────────────────────────────────────────────

export function formatAnswer(template: string, context: SiteContext): string {
  try {
    const t = template ?? '';
    const c = context ?? {} as SiteContext;

    return t
      .replace(/\{health_score\}/g, String(c.health_score ?? 0))
      .replace(/\{top_issue_types\}/g, (c.top_issue_types ?? []).join(', ') || 'none detected')
      .replace(/\{recent_fixes\}/g, String(c.recent_fixes ?? 0))
      .replace(/\{ranking_trend\}/g, String(c.ranking_trend ?? 'stable'))
      .replace(/\{ai_visibility_score\}/g, String(c.ai_visibility_score ?? 0))
      .replace(/\{domain\}/g, String(c.domain ?? ''));
  } catch {
    return template ?? '';
  }
}

// ── resolveQuickAnswer ────────────────────────────────────────────────────────

export function resolveQuickAnswer(
  question: string,
  context: SiteContext,
): string | null {
  try {
    const q = (question ?? '').trim().toLowerCase();
    const match = QUICK_ANSWERS.find(
      (qa) => qa.question.toLowerCase() === q,
    );
    if (!match) return null;
    return formatAnswer(match.answer_template, context);
  } catch {
    return null;
  }
}
