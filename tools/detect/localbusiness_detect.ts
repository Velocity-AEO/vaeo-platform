/**
 * tools/detect/localbusiness_detect.ts
 *
 * Detects local business signals from page HTML.
 * Pure function — no I/O, never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LocalBusinessSignals {
  has_localbusiness_schema: boolean;
  has_address:              boolean;
  has_phone:                boolean;
  has_hours:                boolean;
  has_geo:                  boolean;
  has_price_range:          boolean;
  has_same_as:              boolean;
  detected_name?:           string;
  detected_address?:        string;
  detected_phone?:          string;
  detected_city?:           string;
  detected_state?:          string;
  detected_zip?:            string;
  detected_country?:        string;
  is_local_business_page:   boolean;
  issues:                   string[];
}

// ── LocalBusiness schema subtypes ─────────────────────────────────────────────

const LOCAL_BUSINESS_TYPES = new Set([
  'LocalBusiness', 'Store', 'AutoDealer', 'Restaurant',
  'HomeAndConstructionBusiness', 'HealthAndBeautyBusiness',
  'SportsActivityLocation', 'TouristAttraction', 'LodgingBusiness',
  'AutomotiveBusiness', 'DryCleaningOrLaundry', 'FoodEstablishment',
  'MedicalBusiness', 'MovingCompany', 'PetStore', 'Pharmacy', 'SportsClub',
  'Bakery', 'BarOrPub', 'CafeOrCoffeeShop', 'FastFoodRestaurant',
  'HairSalon', 'HardwareStore', 'Hotel', 'LegalService',
]);

// ── Regex patterns ────────────────────────────────────────────────────────────

const JSONLD_RE = /<script\s[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

// Phone: (###) ###-#### or ###-###-#### or ###.###.####
const PHONE_RE  = /\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/;

// Street address: number + name + type keyword
const STREET_RE = /\d+\s+[A-Za-z0-9]+(?:\s+[A-Za-z0-9]+){0,4}\s+(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Court|Ct\.?|Place|Pl\.?|Circle|Cir\.?|Highway|Hwy\.?|Parkway|Pkwy\.?)\b/i;

// Zip code: 5 digits optionally followed by -4
const ZIP_RE    = /\b(\d{5})(?:-\d{4})?\b/;

// City, STATE abbreviation pattern
const US_STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC';
const CITY_STATE_RE = new RegExp(`([A-Z][a-zA-Z\\s]{1,25}?),\\s*(${US_STATES})\\b`);

// Hours of operation keywords
const HOURS_RE  = /\b(hours[\s_-]*of[\s_-]*operation|business[\s_-]*hours|open(?:ing)?[\s_-]*hours|open(?:ing)?[\s_-]*(?:daily|mon|tue|wed|thu|fri|sat|sun)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon[\s-]+fri|closes?\s+at|open\s+until|open\s+\d)/i;

// ── Internal JSON-LD scan result ──────────────────────────────────────────────

interface JsonLdScanResult {
  found:           boolean;
  has_address:     boolean;
  has_phone:       boolean;
  has_hours:       boolean;
  has_geo:         boolean;
  has_price_range: boolean;
  has_same_as:     boolean;
  name?:           string;
  phone?:          string;
  address?:        string;
  city?:           string;
  state?:          string;
  zip?:            string;
  country?:        string;
}

function scanJsonLd(html: string): JsonLdScanResult {
  const result: JsonLdScanResult = {
    found: false, has_address: false, has_phone: false,
    has_hours: false, has_geo: false, has_price_range: false, has_same_as: false,
  };

  JSONLD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = JSONLD_RE.exec(html)) !== null) {
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
        const types: string[] = Array.isArray(typeRaw)
          ? typeRaw.map(String)
          : [String(typeRaw ?? '')];

        if (!types.some((t) => LOCAL_BUSINESS_TYPES.has(t))) continue;

        result.found = true;
        if (node.name)      result.name = String(node.name);
        if (node.telephone) { result.has_phone = true; result.phone = String(node.telephone); }
        if (node.priceRange) result.has_price_range = true;
        if (node.openingHours || node.openingHoursSpecification) result.has_hours = true;
        if (node.geo)       result.has_geo = true;
        if (node.sameAs)    result.has_same_as = true;

        const addr = node.address;
        if (addr && typeof addr === 'object' && addr !== null) {
          result.has_address = true;
          const a = addr as Record<string, unknown>;
          if (a.streetAddress)   result.address = String(a.streetAddress);
          if (a.addressLocality) result.city    = String(a.addressLocality);
          if (a.addressRegion)   result.state   = String(a.addressRegion);
          if (a.postalCode)      result.zip     = String(a.postalCode);
          if (a.addressCountry)  result.country = String(a.addressCountry);
        } else if (typeof addr === 'string' && addr) {
          result.has_address = true;
          result.address = addr;
        }
      }
    } catch { /* ignore parse errors */ }
  }

  return result;
}

// ── Meta / title helpers ──────────────────────────────────────────────────────

function extractMeta(html: string, attr: string): string | undefined {
  const escaped = attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  return html.match(re)?.[1];
}

function extractTitle(html: string): string | undefined {
  return html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]
    ?.replace(/<[^>]+>/g, '').trim() || undefined;
}

// ── Main detector ─────────────────────────────────────────────────────────────

export function detectLocalBusinessSignals(html: string, _url: string): LocalBusinessSignals {
  try {
    if (!html || typeof html !== 'string') return emptySignals();

    const schema = scanJsonLd(html);

    // Name: schema > og:site_name > title
    const detectedName = schema.name
      ?? extractMeta(html, 'og:site_name')
      ?? extractTitle(html);

    // Phone: schema phone or text phone
    const phoneMatch    = html.match(PHONE_RE);
    const detectedPhone = schema.phone ?? phoneMatch?.[0];
    const hasPhone      = schema.has_phone || !!phoneMatch;

    // Address: schema address or text match
    const streetMatch     = html.match(STREET_RE);
    const detectedAddress = schema.address ?? streetMatch?.[0];
    const hasAddress      = schema.has_address || !!streetMatch;

    // City + state: schema or text pattern
    const cityStateMatch = html.match(CITY_STATE_RE);
    const detectedCity   = schema.city  ?? cityStateMatch?.[1]?.trim();
    const detectedState  = schema.state ?? cityStateMatch?.[2];

    // Zip
    const zipMatch    = html.match(ZIP_RE);
    const detectedZip = schema.zip ?? zipMatch?.[1];

    // Hours
    const hasHours = schema.has_hours || HOURS_RE.test(html);

    // Price range
    const hasPriceRange = schema.has_price_range || /priceRange|price[\s_-]+range/i.test(html);

    // Local business page: schema found OR has address/phone/hours signals
    const isLocalPage = schema.found || hasAddress || hasPhone || hasHours;

    // Issues
    const issues: string[] = [];
    if (isLocalPage && !schema.found)  issues.push('MISSING_LOCALBUSINESS_SCHEMA');
    if (isLocalPage && !hasAddress)    issues.push('MISSING_ADDRESS');
    if (isLocalPage && !hasPhone)      issues.push('MISSING_PHONE');
    if (isLocalPage && !hasHours)      issues.push('MISSING_HOURS');

    return {
      has_localbusiness_schema: schema.found,
      has_address:              hasAddress,
      has_phone:                hasPhone,
      has_hours:                hasHours,
      has_geo:                  schema.has_geo,
      has_price_range:          hasPriceRange,
      has_same_as:              schema.has_same_as,
      detected_name:            detectedName,
      detected_address:         detectedAddress,
      detected_phone:           detectedPhone,
      detected_city:            detectedCity,
      detected_state:           detectedState,
      detected_zip:             detectedZip,
      detected_country:         schema.country,
      is_local_business_page:   isLocalPage,
      issues,
    };
  } catch {
    return emptySignals();
  }
}

function emptySignals(): LocalBusinessSignals {
  return {
    has_localbusiness_schema: false,
    has_address:              false,
    has_phone:                false,
    has_hours:                false,
    has_geo:                  false,
    has_price_range:          false,
    has_same_as:              false,
    is_local_business_page:   false,
    issues:                   [],
  };
}
