/**
 * tools/optimize/resource_hint_plan.ts
 *
 * Generates preconnect / dns-prefetch link tag plans from ResourceHintSignals.
 *
 * Rules:
 *  - Font domains (fonts.googleapis.com, fonts.gstatic.com, use.typekit.net,
 *    fast.fonts.net) get crossorigin on preconnect (required for CORS).
 *  - Every missing_preconnect domain gets a <link rel="preconnect"> entry.
 *  - Every missing_dns_prefetch domain gets a <link rel="dns-prefetch"> entry.
 *  - buildHintTags() renders the combined insertion string ready for <head>.
 *
 * Pure — never throws.
 */

import type { ResourceHintSignals } from '../detect/resource_hint_detect.js';
import { PRIORITY_DOMAINS } from '../detect/resource_hint_detect.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ResourceHintEntry {
  domain:      string;
  hint_type:   'preconnect' | 'dns-prefetch';
  tag:         string;
  crossorigin: boolean;
  description: string;
}

export interface ResourceHintPlan {
  url:          string;
  entries:      ResourceHintEntry[];
  insert_html:  string;
  domain_count: number;
}

// ── Font domains requiring crossorigin ───────────────────────────────────────

export const CROSSORIGIN_DOMAINS = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'use.typekit.net',
  'fast.fonts.net',
]);

// ── Tag builders ─────────────────────────────────────────────────────────────

export function buildPreconnectTag(domain: string): string {
  const co = CROSSORIGIN_DOMAINS.has(domain) ? ' crossorigin' : '';
  return `<link rel="preconnect" href="https://${domain}"${co}>`;
}

export function buildDnsPrefetchTag(domain: string): string {
  return `<link rel="dns-prefetch" href="//${domain}">`;
}

// ── Entry builder ─────────────────────────────────────────────────────────────

function makeEntry(domain: string, hint_type: 'preconnect' | 'dns-prefetch'): ResourceHintEntry {
  const crossorigin = hint_type === 'preconnect' && CROSSORIGIN_DOMAINS.has(domain);
  const tag = hint_type === 'preconnect'
    ? buildPreconnectTag(domain)
    : buildDnsPrefetchTag(domain);
  const desc = PRIORITY_DOMAINS[domain] ?? domain;
  return {
    domain,
    hint_type,
    tag,
    crossorigin,
    description: `Add ${hint_type} for ${desc} (${domain})`,
  };
}

// ── Plan generator ────────────────────────────────────────────────────────────

export function generateResourceHintPlan(signals: ResourceHintSignals, url: string): ResourceHintPlan {
  try {
    const entries: ResourceHintEntry[] = [];

    for (const domain of signals.missing_preconnect) {
      entries.push(makeEntry(domain, 'preconnect'));
    }
    for (const domain of signals.missing_dns_prefetch) {
      entries.push(makeEntry(domain, 'dns-prefetch'));
    }

    // Deduplicate by tag string (same domain may appear in both lists)
    const seen = new Set<string>();
    const unique = entries.filter((e) => {
      if (seen.has(e.tag)) return false;
      seen.add(e.tag);
      return true;
    });

    const insert_html = unique.map((e) => e.tag).join('\n');
    const domain_count = new Set(unique.map((e) => e.domain)).size;

    return { url, entries: unique, insert_html, domain_count };
  } catch {
    return { url, entries: [], insert_html: '', domain_count: 0 };
  }
}
