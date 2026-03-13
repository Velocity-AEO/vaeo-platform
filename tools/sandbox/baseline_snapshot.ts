/**
 * tools/sandbox/baseline_snapshot.ts
 *
 * Baseline snapshot engine — captures weekly site snapshots and detects
 * page degradation independent of VAEO fixes.
 * If a client's site is getting worse without VAEO touching it, you need to know.
 *
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BaselineSnapshot {
  id:                  string;
  site_id:             string;
  snapshot_date:       string;
  url:                 string;
  title:               string | null;
  meta_description:    string | null;
  canonical:           string | null;
  has_schema:          boolean;
  schema_types:        string[];
  has_og_tags:         boolean;
  has_canonical:       boolean;
  is_noindex:          boolean;
  h1_count:            number;
  word_count:          number;
  image_count:         number;
  images_missing_alt:  number;
  internal_links:      number;
  external_links:      number;
  mobile_lighthouse:   number | null;
  page_size_bytes:     number | null;
  captured_at:         string;
}

export interface BaselineDiffChange {
  field:          string;
  previous_value: unknown;
  current_value:  unknown;
  change_type:    'added' | 'removed' | 'changed' | 'degraded' | 'improved';
}

export interface BaselineDiff {
  url:               string;
  site_id:           string;
  snapshot_date:     string;
  previous_date:     string;
  changes:           BaselineDiffChange[];
  degradation_count: number;
  improvement_count: number;
  net_change:        'better' | 'worse' | 'neutral';
  severity:          'critical' | 'high' | 'medium' | 'low' | 'none';
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Fields where a change is a potential degradation (direction matters). */
export const DEGRADATION_FIELDS: string[] = [
  'is_noindex',         // false → true = bad
  'has_schema',         // true → false = bad
  'has_canonical',      // true → false = bad
  'images_missing_alt', // increase = bad
  'mobile_lighthouse',  // decrease = bad
];

// Fields compared in diffs (excludes id / site_id / captured_at)
const DIFF_FIELDS: Array<keyof BaselineSnapshot> = [
  'title', 'meta_description', 'canonical',
  'has_schema', 'schema_types', 'has_og_tags', 'has_canonical', 'is_noindex',
  'h1_count', 'word_count', 'image_count', 'images_missing_alt',
  'internal_links', 'external_links', 'mobile_lighthouse',
];

// ── Internal helpers ──────────────────────────────────────────────────────────

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1]!.trim() || null : null;
}

function extractMetaDescription(html: string): string | null {
  const m = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
         ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  return m ? m[1]!.trim() || null : null;
}

function extractCanonical(html: string): string | null {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
         ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  return m ? m[1]!.trim() || null : null;
}

function extractSchemaTypes(html: string): string[] {
  const types: string[] = [];
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]!);
      const addType = (obj: Record<string, unknown>) => {
        if (obj['@type']) {
          if (Array.isArray(obj['@type'])) types.push(...(obj['@type'] as string[]));
          else types.push(String(obj['@type']));
        }
        if (Array.isArray(obj['@graph'])) {
          for (const item of obj['@graph']) addType(item as Record<string, unknown>);
        }
      };
      addType(data as Record<string, unknown>);
    } catch {
      // non-parseable JSON-LD — skip
    }
  }
  return [...new Set(types)];
}

function countWords(html: string): number {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.split(' ').filter(w => w.length > 0).length : 0;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }
  return a === b;
}

// ── capturePageBaseline ───────────────────────────────────────────────────────

export function capturePageBaseline(
  url:              string,
  html:             string,
  headers:          Record<string, string>,
  lighthouse_score: number | null,
): Omit<BaselineSnapshot, 'id' | 'site_id' | 'snapshot_date' | 'captured_at'> {
  try {
    const h = html ?? '';

    const canonical = extractCanonical(h);
    const schemaTypes = extractSchemaTypes(h);

    // Count images — total and missing alt
    const imgMatches = [...h.matchAll(/<img([^>]*)>/gi)];
    const image_count = imgMatches.length;
    const images_missing_alt = imgMatches.filter(m => {
      const attrs = m[1] ?? '';
      const altMatch = attrs.match(/\balt=["']([^"']*)["']/i);
      return !altMatch || altMatch[1]!.trim() === '';
    }).length;

    // Count links
    const anchors = [...h.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi)];
    let internal_links = 0;
    let external_links = 0;
    for (const a of anchors) {
      const href = (a[1] ?? '').trim();
      if (href.startsWith('http://') || href.startsWith('https://')) {
        external_links++;
      } else if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:')) {
        internal_links++;
      }
    }

    // page_size_bytes: from Content-Length header or byte length of HTML
    const contentLength = headers?.['content-length'] ?? headers?.['Content-Length'] ?? null;
    const page_size_bytes = contentLength !== null
      ? parseInt(contentLength, 10) || h.length
      : h.length > 0 ? h.length : null;

    return {
      url,
      title:            extractTitle(h),
      meta_description: extractMetaDescription(h),
      canonical,
      has_schema:       /<script[^>]+type=["']application\/ld\+json["']/i.test(h),
      schema_types:     schemaTypes,
      has_og_tags:      /<meta[^>]+property=["']og:/i.test(h),
      has_canonical:    canonical !== null,
      is_noindex:       /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(h)
                     || /content=["'][^"']*noindex[^"']*["'][^>]+name=["']robots["']/i.test(h),
      h1_count:         (h.match(/<h1[\s>]/gi) ?? []).length,
      word_count:       countWords(h),
      image_count,
      images_missing_alt,
      internal_links,
      external_links,
      mobile_lighthouse: typeof lighthouse_score === 'number' ? lighthouse_score : null,
      page_size_bytes,
    };
  } catch {
    return {
      url,
      title:             null,
      meta_description:  null,
      canonical:         null,
      has_schema:        false,
      schema_types:      [],
      has_og_tags:       false,
      has_canonical:     false,
      is_noindex:        false,
      h1_count:          0,
      word_count:        0,
      image_count:       0,
      images_missing_alt: 0,
      internal_links:    0,
      external_links:    0,
      mobile_lighthouse: null,
      page_size_bytes:   null,
    };
  }
}

// ── diffBaselines ─────────────────────────────────────────────────────────────

export function diffBaselines(
  current:  BaselineSnapshot,
  previous: BaselineSnapshot,
): BaselineDiff {
  try {
    const changes: BaselineDiffChange[] = [];

    for (const field of DIFF_FIELDS) {
      const prev_val = previous[field];
      const curr_val = current[field];

      if (valuesEqual(prev_val, curr_val)) continue;

      let change_type: BaselineDiffChange['change_type'] = 'changed';

      if ((prev_val === null || prev_val === undefined) && curr_val !== null && curr_val !== undefined) {
        change_type = 'added';
      } else if (prev_val !== null && prev_val !== undefined && (curr_val === null || curr_val === undefined)) {
        change_type = 'removed';
      } else if (DEGRADATION_FIELDS.includes(field)) {
        change_type = classifyDegradation(field, prev_val, curr_val);
      }

      changes.push({ field, previous_value: prev_val, current_value: curr_val, change_type });
    }

    const degradation_count = changes.filter(c => c.change_type === 'degraded').length;
    const improvement_count = changes.filter(c => c.change_type === 'improved').length;

    const net_change: BaselineDiff['net_change'] =
      degradation_count > improvement_count ? 'worse'
      : improvement_count > degradation_count ? 'better'
      : 'neutral';

    const diff: BaselineDiff = {
      url:               current.url,
      site_id:           current.site_id,
      snapshot_date:     current.snapshot_date,
      previous_date:     previous.snapshot_date,
      changes,
      degradation_count,
      improvement_count,
      net_change,
      severity:          'none', // calculated below
    };

    diff.severity = calculateBaselineSeverity(diff);
    return diff;
  } catch {
    return {
      url:               current?.url ?? '',
      site_id:           current?.site_id ?? '',
      snapshot_date:     current?.snapshot_date ?? '',
      previous_date:     previous?.snapshot_date ?? '',
      changes:           [],
      degradation_count: 0,
      improvement_count: 0,
      net_change:        'neutral',
      severity:          'none',
    };
  }
}

function classifyDegradation(
  field:    string,
  prev_val: unknown,
  curr_val: unknown,
): BaselineDiffChange['change_type'] {
  switch (field) {
    case 'is_noindex':
      if (!prev_val && curr_val)  return 'degraded';
      if (prev_val  && !curr_val) return 'improved';
      break;
    case 'has_schema':
      if (prev_val  && !curr_val) return 'degraded';
      if (!prev_val && curr_val)  return 'improved';
      break;
    case 'has_canonical':
      if (prev_val  && !curr_val) return 'degraded';
      if (!prev_val && curr_val)  return 'improved';
      break;
    case 'images_missing_alt':
      if ((curr_val as number) > (prev_val as number)) return 'degraded';
      if ((curr_val as number) < (prev_val as number)) return 'improved';
      break;
    case 'mobile_lighthouse':
      if ((curr_val as number) < (prev_val as number)) return 'degraded';
      if ((curr_val as number) > (prev_val as number)) return 'improved';
      break;
  }
  return 'changed';
}

// ── calculateBaselineSeverity ─────────────────────────────────────────────────

export function calculateBaselineSeverity(
  diff: BaselineDiff,
): BaselineDiff['severity'] {
  try {
    if (diff.changes.length === 0) return 'none';

    // Critical: noindex added or schema removed
    const noindexAdded  = diff.changes.some(c => c.field === 'is_noindex'  && c.change_type === 'degraded');
    const schemaRemoved = diff.changes.some(c => c.field === 'has_schema'  && c.change_type === 'degraded');
    if (noindexAdded || schemaRemoved) return 'critical';

    // High: canonical removed or lighthouse drop > 10
    const canonicalRemoved = diff.changes.some(c => c.field === 'has_canonical' && c.change_type === 'degraded');
    const lighthouseDrop   = diff.changes.find(c => c.field === 'mobile_lighthouse' && c.change_type === 'degraded');
    const lhDrop = lighthouseDrop
      ? (lighthouseDrop.previous_value as number) - (lighthouseDrop.current_value as number)
      : 0;
    if (canonicalRemoved || lhDrop > 10) return 'high';

    // Medium: lighthouse drop 5-10 or >= 3 total changes
    if (lhDrop >= 5 || diff.changes.length >= 3) return 'medium';

    // Low: 1-2 changes
    if (diff.changes.length >= 1) return 'low';

    return 'none';
  } catch {
    return 'none';
  }
}

// ── saveBaselineSnapshot ──────────────────────────────────────────────────────

export async function saveBaselineSnapshot(
  snapshot: BaselineSnapshot,
  deps?:    { saveFn?: (snap: BaselineSnapshot) => Promise<boolean> },
): Promise<boolean> {
  try {
    if (!snapshot?.site_id || !snapshot?.url) return false;
    const fn = deps?.saveFn ?? defaultSaveFn;
    return await fn(snapshot);
  } catch {
    return false;
  }
}

// ── loadLatestBaseline ────────────────────────────────────────────────────────

export async function loadLatestBaseline(
  site_id: string,
  url:     string,
  deps?:   { loadFn?: (site_id: string, url: string) => Promise<BaselineSnapshot | null> },
): Promise<BaselineSnapshot | null> {
  try {
    if (!site_id || !url) return null;
    const fn = deps?.loadFn ?? defaultLoadFn;
    return await fn(site_id, url);
  } catch {
    return null;
  }
}

// ── loadBaselineAtDate ────────────────────────────────────────────────────────

export async function loadBaselineAtDate(
  site_id:     string,
  url:         string,
  target_date: string,
  deps?:       { loadFn?: (site_id: string, url: string, target_date: string) => Promise<BaselineSnapshot | null> },
): Promise<BaselineSnapshot | null> {
  try {
    if (!site_id || !url || !target_date) return null;
    const fn = deps?.loadFn ?? defaultLoadAtDateFn;
    return await fn(site_id, url, target_date);
  } catch {
    return null;
  }
}

// ── Defaults ──────────────────────────────────────────────────────────────────

async function defaultSaveFn(_snap: BaselineSnapshot): Promise<boolean> {
  return false;
}

async function defaultLoadFn(
  _site_id: string,
  _url:     string,
): Promise<BaselineSnapshot | null> {
  return null;
}

async function defaultLoadAtDateFn(
  _site_id:     string,
  _url:         string,
  _target_date: string,
): Promise<BaselineSnapshot | null> {
  return null;
}
