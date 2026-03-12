/**
 * tools/detect/aeo_detect.ts
 *
 * AEO (Answer Engine Optimization) issue detector.
 * Scans HTML for missing speakable schema, FAQ opportunities,
 * answer block opportunities, and incomplete AEO schema.
 *
 * Integrates with existing detector pattern. Never throws.
 */

import {
  detectAnswerOpportunities,
  type AnswerOpportunity,
} from '../aeo/answer_block.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type AEOIssueType =
  | 'SPEAKABLE_MISSING'
  | 'FAQ_OPPORTUNITY'
  | 'ANSWER_BLOCK_OPPORTUNITY'
  | 'AEO_SCHEMA_INCOMPLETE';

export interface AEOIssue {
  url:         string;
  issue_type:  AEOIssueType;
  severity:    number;
  details:     string;
  opportunity: AnswerOpportunity | null;
}

// ── Regex patterns ───────────────────────────────────────────────────────────

const JSONLD_RE    = /<script\s[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const FAQ_DT_DD_RE = /<dt[\s>]/i;
const FAQ_CLASS_RE = /class\s*=\s*["'][^"']*faq[^"']*["']/i;
const FAQ_KEYWORD  = /\bfaq\b|\bfrequently asked\b|\bquestions?\b.*\banswers?\b/i;
const QUESTION_H   = /<h[1-6][^>]*>[^<]*\?[^<]*<\/h[1-6]>/i;

// ── Speakable detection ──────────────────────────────────────────────────────

function hasSpeakableSchema(html: string): { exists: boolean; complete: boolean } {
  JSONLD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = JSONLD_RE.exec(html)) !== null) {
    const content = (m[1] ?? '').trim();
    try {
      const parsed = JSON.parse(content);
      if (parsed.speakable || parsed['@type'] === 'SpeakableSpecification') {
        // Check completeness
        const speakable = parsed.speakable ?? parsed;
        const hasSelectors = speakable.cssSelector || speakable.xpath;
        return { exists: true, complete: !!hasSelectors };
      }
      // Check nested (e.g., in @graph)
      if (Array.isArray(parsed['@graph'])) {
        for (const node of parsed['@graph']) {
          if (node.speakable || node['@type'] === 'SpeakableSpecification') {
            const sp = node.speakable ?? node;
            return { exists: true, complete: !!(sp.cssSelector || sp.xpath) };
          }
        }
      }
    } catch { /* ignore parse errors */ }
  }

  return { exists: false, complete: false };
}

// ── FAQ opportunity detection ────────────────────────────────────────────────

function hasFAQSchema(html: string): boolean {
  JSONLD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = JSONLD_RE.exec(html)) !== null) {
    try {
      const parsed = JSON.parse((m[1] ?? '').trim());
      if (parsed['@type'] === 'FAQPage') return true;
      if (Array.isArray(parsed['@graph'])) {
        if (parsed['@graph'].some((n: Record<string, unknown>) => n['@type'] === 'FAQPage')) return true;
      }
    } catch { /* ignore */ }
  }
  return false;
}

function hasFAQContent(html: string): boolean {
  return FAQ_DT_DD_RE.test(html) ||
         FAQ_CLASS_RE.test(html) ||
         FAQ_KEYWORD.test(html) ||
         QUESTION_H.test(html);
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Detect AEO issues on a page.
 *
 * SPEAKABLE_MISSING (severity=8): No speakable schema in JSON-LD
 * AEO_SCHEMA_INCOMPLETE (severity=7): Speakable exists but missing selectors
 * FAQ_OPPORTUNITY (severity=6): FAQ patterns found but no FAQPage schema
 * ANSWER_BLOCK_OPPORTUNITY (severity=5): Answer patterns found
 *
 * Returns all issues sorted by severity desc.
 */
export async function detectAEOIssues(
  html: string,
  url: string,
  page_type: string,
): Promise<AEOIssue[]> {
  const issues: AEOIssue[] = [];

  // 1. Speakable check
  const speakable = hasSpeakableSchema(html);
  if (!speakable.exists) {
    issues.push({
      url,
      issue_type: 'SPEAKABLE_MISSING',
      severity:   8,
      details:    'No SpeakableSpecification schema found — page content is not optimized for voice/AI answer engines',
      opportunity: null,
    });
  } else if (!speakable.complete) {
    issues.push({
      url,
      issue_type: 'AEO_SCHEMA_INCOMPLETE',
      severity:   7,
      details:    'SpeakableSpecification exists but lacks cssSelector/xpath — answer engines cannot identify speakable content',
      opportunity: null,
    });
  }

  // 2. FAQ opportunity check
  if (hasFAQContent(html) && !hasFAQSchema(html)) {
    issues.push({
      url,
      issue_type: 'FAQ_OPPORTUNITY',
      severity:   6,
      details:    'FAQ content patterns detected but no FAQPage schema — add structured FAQ markup for answer engine visibility',
      opportunity: null,
    });
  }

  // 3. Answer block opportunities
  try {
    const opportunities = await detectAnswerOpportunities(html, url, page_type);
    if (opportunities.length > 0) {
      // Report the highest-confidence opportunity
      const best = opportunities[0];
      issues.push({
        url,
        issue_type:  'ANSWER_BLOCK_OPPORTUNITY',
        severity:    5,
        details:     `Answer engine opportunity: ${best.opportunity_type} pattern detected (confidence: ${best.confidence.toFixed(2)}) — recommended schema: ${best.recommended_schema}`,
        opportunity: best,
      });
    }
  } catch { /* non-fatal */ }

  // Sort by severity desc
  issues.sort((a, b) => b.severity - a.severity);

  return issues;
}
