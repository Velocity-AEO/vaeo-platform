/**
 * tools/apply/timestamp_apply.ts
 *
 * Applies timestamp fixes to HTML:
 *   inject_jsonld_date_modified  — add dateModified to existing JSON-LD block
 *   update_jsonld_date_modified  — replace existing dateModified in JSON-LD
 *   inject_og_modified_time      — add <meta property="article:modified_time">
 *   update_og_modified_time      — replace existing article:modified_time content
 *
 * Never throws — skips any fix that would corrupt HTML.
 */

import type { TimestampFix, TimestampPlan } from '../optimize/timestamp_plan.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TimestampApplyResult {
  html:    string;
  applied: TimestampFix[];
  skipped: TimestampFix[];
}

// ── Regex patterns ────────────────────────────────────────────────────────────

const JSONLD_BLOCK_RE  = /(<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi;
const JSONLD_TYPES_RE  = /"@type"\s*:\s*"(Article|Product|WebPage|WebSite|BlogPosting|NewsArticle)"/i;
const DATE_MODIFIED_RE = /"dateModified"\s*:\s*"[^"]*"/;
const OG_MODIFIED_RE   = /(<meta[^>]+property\s*=\s*["']article:modified_time["'][^>]*content\s*=\s*["'])([^"']*)([^>]*>)/i;
const OG_MODIFIED_RE2  = /(<meta[^>]+content\s*=\s*["'][^"']*["'][^>]*property\s*=\s*["']article:modified_time["'][^>]*>)/i;
const LAST_OG_RE       = /(<meta[^>]+property\s*=\s*["']og:[^"']+["'][^>]*>)(?![\s\S]*<meta[^>]+property\s*=\s*["']og:)/i;
const HEAD_OPEN_RE     = /(<head[^>]*>)/i;

// ── JSON-LD helpers ───────────────────────────────────────────────────────────

function injectDateModified(jsonText: string, value: string): string | null {
  try {
    const obj = JSON.parse(jsonText);
    if (Array.isArray(obj)) {
      // Find the first matching type in the array
      const target = obj.find((item) =>
        item && typeof item === 'object' &&
        JSONLD_TYPES_RE.test(JSON.stringify({ '@type': (item as any)['@type'] })),
      );
      if (target) {
        (target as any)['dateModified'] = value;
        return JSON.stringify(obj, null, 2);
      }
      // Inject into first object if no typed match
      if (obj[0] && typeof obj[0] === 'object') {
        (obj[0] as any)['dateModified'] = value;
        return JSON.stringify(obj, null, 2);
      }
      return null;
    }
    if (obj && typeof obj === 'object') {
      (obj as any)['dateModified'] = value;
      return JSON.stringify(obj, null, 2);
    }
    return null;
  } catch {
    return null;
  }
}

function updateDateModified(jsonText: string, newValue: string): string | null {
  try {
    const obj = JSON.parse(jsonText);
    let updated = false;

    function updateInObj(o: unknown): void {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach(updateInObj); return; }
      const rec = o as Record<string, unknown>;
      if ('dateModified' in rec) { rec['dateModified'] = newValue; updated = true; }
    }

    updateInObj(obj);
    return updated ? JSON.stringify(obj, null, 2) : null;
  } catch {
    return null;
  }
}

// ── applyTimestampFixes ───────────────────────────────────────────────────────

export function applyTimestampFixes(
  html: string,
  plan: TimestampPlan,
): TimestampApplyResult {
  const applied: TimestampFix[] = [];
  const skipped: TimestampFix[] = [];
  let result = html;

  if (typeof html !== 'string' || !plan?.fixes) {
    return { html, applied, skipped: plan?.fixes ?? [] };
  }

  for (const fix of plan.fixes) {
    try {
      switch (fix.type) {

        // ── inject_jsonld_date_modified ──────────────────────────────────────
        case 'inject_jsonld_date_modified': {
          let didApply = false;
          let attempts = 0;

          result = result.replace(JSONLD_BLOCK_RE, (full, open, body, close) => {
            if (didApply) return full;
            // Only inject into blocks that match known schema types
            if (!JSONLD_TYPES_RE.test(body)) { attempts++; return full; }
            const injected = injectDateModified(body.trim(), fix.new_value);
            if (!injected) return full;
            didApply = true;
            return `${open}\n${injected}\n${close}`;
          });
          JSONLD_BLOCK_RE.lastIndex = 0;

          if (!didApply) {
            // No matching JSON-LD block — create a minimal WebPage block
            const minimal = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', dateModified: fix.new_value }, null, 2);
            const snippet = `\n<script type="application/ld+json">\n${minimal}\n</script>`;
            const headMatch = HEAD_OPEN_RE.exec(result);
            if (headMatch) {
              // Insert after </head>... actually just append to head
              result = result.replace(/<\/head>/i, `${snippet}\n</head>`);
              didApply = true;
            }
          }

          if (didApply) applied.push(fix);
          else          skipped.push(fix);
          break;
        }

        // ── update_jsonld_date_modified ──────────────────────────────────────
        case 'update_jsonld_date_modified': {
          let didApply = false;

          result = result.replace(JSONLD_BLOCK_RE, (full, open, body, close) => {
            if (didApply) return full;
            if (!DATE_MODIFIED_RE.test(body)) return full;
            const updated = updateDateModified(body.trim(), fix.new_value);
            if (!updated) return full;
            didApply = true;
            return `${open}\n${updated}\n${close}`;
          });
          JSONLD_BLOCK_RE.lastIndex = 0;

          if (didApply) applied.push(fix);
          else          skipped.push(fix);
          break;
        }

        // ── inject_og_modified_time ──────────────────────────────────────────
        case 'inject_og_modified_time': {
          const tag = `<meta property="article:modified_time" content="${fix.new_value}">`;
          let didApply = false;

          // Insert after last og: meta tag
          const lastOgMatch = LAST_OG_RE.exec(result);
          if (lastOgMatch) {
            result = result.replace(LAST_OG_RE, `$1\n${tag}`);
            didApply = true;
          } else {
            // No OG tags — insert after <head>
            const headMatch = HEAD_OPEN_RE.exec(result);
            if (headMatch) {
              result = result.replace(HEAD_OPEN_RE, `$1\n${tag}`);
              didApply = true;
            }
          }

          if (didApply) applied.push(fix);
          else          skipped.push(fix);
          break;
        }

        // ── update_og_modified_time ──────────────────────────────────────────
        case 'update_og_modified_time': {
          // Try property-first attribute order
          let didApply = false;
          if (OG_MODIFIED_RE.test(result)) {
            result   = result.replace(OG_MODIFIED_RE, `$1${fix.new_value}$3`);
            didApply = true;
          } else if (OG_MODIFIED_RE2.test(result)) {
            // content-first: replace the content value inside the tag
            result = result.replace(OG_MODIFIED_RE2, (full) =>
              full.replace(/content\s*=\s*["'][^"']*["']/, `content="${fix.new_value}"`),
            );
            didApply = true;
          }

          if (didApply) applied.push(fix);
          else          skipped.push(fix);
          break;
        }

        default:
          skipped.push(fix);
      }
    } catch {
      skipped.push(fix);
    }
  }

  return { html: result, applied, skipped };
}
