/**
 * tools/detect/localbusiness_issue_classifier.ts
 *
 * Classifies local business SEO issues. Covers missing schema fields
 * and NAP (Name/Address/Phone) consistency checks.
 *
 * Pure function. Never throws.
 */

import type { LocalBusinessSignals } from './localbusiness_detect.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LocalBusinessIssueType =
  | 'missing_localbusiness_schema'
  | 'missing_address'
  | 'missing_phone'
  | 'missing_hours'
  | 'missing_geo_coordinates'
  | 'missing_same_as'
  | 'missing_price_range'
  | 'nap_inconsistency';

export interface LocalBusinessIssue {
  type:           LocalBusinessIssueType;
  severity:       'high' | 'medium' | 'low';
  description:    string;
  recommendation: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const JSONLD_STRIP_RE = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi;
const PHONE_RE        = /\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/;

function normalizePhone(p: string): string {
  return p.replace(/\D/g, '');
}

function stripJsonLd(html: string): string {
  return html.replace(JSONLD_STRIP_RE, '');
}

// ── Main classifier ───────────────────────────────────────────────────────────

export function classifyLocalBusinessIssues(
  signals:  LocalBusinessSignals,
  html:     string,
  _url:     string,
): LocalBusinessIssue[] {
  const issues: LocalBusinessIssue[] = [];

  try {
    if (!signals.is_local_business_page) return [];

    // missing_localbusiness_schema — high
    if (!signals.has_localbusiness_schema) {
      issues.push({
        type:           'missing_localbusiness_schema',
        severity:       'high',
        description:    'No LocalBusiness schema found on a local business page — search engines cannot identify this as a local business',
        recommendation: 'Add schema.org/LocalBusiness JSON-LD with name, address, telephone, and openingHours',
      });
    }

    // missing_address — high
    if (!signals.has_address) {
      issues.push({
        type:           'missing_address',
        severity:       'high',
        description:    'No address found in schema or page content — critical for Google Maps pack placement',
        recommendation: 'Add a complete PostalAddress to your LocalBusiness schema and display your address visibly on the page',
      });
    }

    // missing_phone — high
    if (!signals.has_phone) {
      issues.push({
        type:           'missing_phone',
        severity:       'high',
        description:    'No phone number found in schema or page content — reduces click-to-call eligibility',
        recommendation: 'Add telephone to your LocalBusiness schema and display your phone number on the page',
      });
    }

    // missing_hours — medium (only if schema exists, indicating this is intentional)
    if (signals.has_localbusiness_schema && !signals.has_hours) {
      issues.push({
        type:           'missing_hours',
        severity:       'medium',
        description:    'No opening hours in LocalBusiness schema — Google Maps pack shows hours when available',
        recommendation: 'Add openingHours to your LocalBusiness schema (e.g. "Mo-Fr 09:00-17:00")',
      });
    }

    // missing_geo_coordinates — medium
    if (signals.has_localbusiness_schema && !signals.has_geo) {
      issues.push({
        type:           'missing_geo_coordinates',
        severity:       'medium',
        description:    'No geo coordinates (latitude/longitude) in LocalBusiness schema — critical for Google Maps pack ranking',
        recommendation: 'Add GeoCoordinates to your LocalBusiness schema with exact latitude and longitude',
      });
    }

    // missing_same_as — medium
    if (signals.has_localbusiness_schema && !signals.has_same_as) {
      issues.push({
        type:           'missing_same_as',
        severity:       'medium',
        description:    'No sameAs links in LocalBusiness schema — missing GBP, Yelp, and Facebook links reduces local authority',
        recommendation: 'Add sameAs URLs to your schema pointing to Google Business Profile, Yelp, and Facebook pages',
      });
    }

    // missing_price_range — low
    if (signals.has_localbusiness_schema && !signals.has_price_range) {
      issues.push({
        type:           'missing_price_range',
        severity:       'low',
        description:    'No priceRange in LocalBusiness schema — price range helps customers find relevant businesses',
        recommendation: 'Add priceRange to your LocalBusiness schema (e.g. "$", "$$", "$$$")',
      });
    }

    // nap_inconsistency — high (only when schema exists with phone)
    if (signals.has_localbusiness_schema && signals.detected_phone) {
      try {
        const textOnly    = stripJsonLd(html ?? '');
        const textPhoneM  = textOnly.match(PHONE_RE);
        if (textPhoneM) {
          const textPhone   = textPhoneM[0];
          const schemaPhone = signals.detected_phone;
          if (normalizePhone(textPhone) !== normalizePhone(schemaPhone)) {
            issues.push({
              type:           'nap_inconsistency',
              severity:       'high',
              description:    `Phone in visible page text (${textPhone}) differs from LocalBusiness schema (${schemaPhone}) — NAP inconsistency hurts local rankings`,
              recommendation: 'Ensure your Name, Address, and Phone are identical in schema and all visible page content',
            });
          }
        }
      } catch { /* non-fatal */ }
    }

  } catch { /* non-fatal — return whatever was accumulated */ }

  // Sort: high → medium → low
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));

  return issues;
}
