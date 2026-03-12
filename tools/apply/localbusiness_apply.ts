/**
 * tools/apply/localbusiness_apply.ts
 *
 * Injects or replaces a LocalBusiness JSON-LD block in page HTML.
 * Pure function — no I/O, never throws.
 */

// ── LocalBusiness @type set (for replacement detection) ───────────────────────

const LOCAL_BUSINESS_TYPES = new Set([
  'LocalBusiness', 'Store', 'AutoDealer', 'Restaurant',
  'HomeAndConstructionBusiness', 'HealthAndBeautyBusiness',
  'SportsActivityLocation', 'TouristAttraction', 'LodgingBusiness',
  'AutomotiveBusiness', 'DryCleaningOrLaundry', 'FoodEstablishment',
  'MedicalBusiness', 'MovingCompany', 'PetStore', 'Pharmacy', 'SportsClub',
  'Bakery', 'BarOrPub', 'CafeOrCoffeeShop', 'FastFoodRestaurant',
  'HairSalon', 'HardwareStore', 'Hotel', 'LegalService',
]);

// ── Find existing LocalBusiness JSON-LD block ─────────────────────────────────

interface BlockPosition { start: number; end: number }

function findExistingBlock(html: string): BlockPosition | null {
  const re = /<script\s[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse((m[1] ?? '').trim()) as Record<string, unknown>;
      const nodes: Record<string, unknown>[] = [];
      if (Array.isArray(parsed['@graph'])) {
        for (const n of parsed['@graph']) {
          if (n && typeof n === 'object') nodes.push(n as Record<string, unknown>);
        }
      } else {
        nodes.push(parsed);
      }
      for (const node of nodes) {
        const typeRaw = node['@type'];
        const types = Array.isArray(typeRaw) ? typeRaw.map(String) : [String(typeRaw ?? '')];
        if (types.some((t) => LOCAL_BUSINESS_TYPES.has(t))) {
          return { start: m.index, end: m.index + m[0].length };
        }
      }
    } catch { /* ignore */ }
  }
  return null;
}

// ── Main apply function ───────────────────────────────────────────────────────

export function applyLocalBusinessSchema(
  html:   string,
  schema: Record<string, unknown>,
): { html: string; applied: boolean; method: string } {
  try {
    if (!html || typeof html !== 'string') {
      return { html: html ?? '', applied: false, method: 'skipped' };
    }

    const scriptTag = `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;

    // 1. Replace existing LocalBusiness JSON-LD
    const existing = findExistingBlock(html);
    if (existing) {
      const newHtml = html.slice(0, existing.start) + scriptTag + html.slice(existing.end);
      return { html: newHtml, applied: true, method: 'replaced_existing' };
    }

    // 2. Inject before </head>
    if (html.includes('</head>')) {
      const newHtml = html.replace('</head>', `${scriptTag}\n</head>`);
      return { html: newHtml, applied: true, method: 'injected_new' };
    }

    // 3. Fallback: inject before </body>
    if (html.includes('</body>')) {
      const newHtml = html.replace('</body>', `${scriptTag}\n</body>`);
      return { html: newHtml, applied: true, method: 'injected_new' };
    }

    // 4. Cannot inject safely
    return { html, applied: false, method: 'skipped' };
  } catch {
    return { html, applied: false, method: 'skipped' };
  }
}
