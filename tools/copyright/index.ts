/**
 * tools/copyright/index.ts
 *
 * Barrel re-export for the Copyright Protection module.
 */

export const COPYRIGHT_VERSION = '1.0.0';

export const MONITORED_SIGNALS = [
  'exact_match',
  'phrase_match',
  'fuzzy_match',
] as const;

// ── Fingerprint ──────────────────────────────────────────────────────────────

export {
  buildFingerprint,
  buildFingerprintBatch,
  simulateFingerprints,
  type ContentFingerprint,
} from './fingerprint.js';

// ── Scrape detector ──────────────────────────────────────────────────────────

export {
  detectScrape,
  computeSimilarity,
  severityFromSimilarity,
  simulateScrapeMatches,
  type ScrapeMatch,
  type ScrapeSeverity,
} from './scrape_detector.js';

// ── Copyright report ─────────────────────────────────────────────────────────

export {
  generateCopyrightReport,
  simulateCopyrightReport,
  type CopyrightReport,
  type InfringingDomain,
} from './copyright_report.js';
