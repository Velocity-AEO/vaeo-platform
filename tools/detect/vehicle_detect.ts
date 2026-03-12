/**
 * tools/detect/vehicle_detect.ts
 *
 * Detects vehicle schema signals from dealership inventory pages.
 * Pure function — no I/O, never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VehicleSignals {
  has_vehicle_schema:  boolean;
  has_price_schema:    boolean;
  detected_vin?:       string;
  detected_make?:      string;
  detected_model?:     string;
  detected_year?:      string;
  detected_price?:     string;
  is_inventory_page:   boolean;
  issues:              string[];
}

// ── Inventory URL patterns ────────────────────────────────────────────────────

const INVENTORY_PATTERNS = [
  /\/inventory\//i,
  /\/vehicle\//i,
  /\/vehicles\//i,
  /\/cars\//i,
  /\/used\//i,
  /\/new\//i,
  /\/vdp\//i,
  /\/vehicle-details\//i,
  /\/car-details\//i,
  /\/listing\//i,
];

// ── VIN pattern: exactly 17 alphanumeric chars (no I, O, Q) ───────────────────

const VIN_REGEX = /\b([A-HJ-NPR-Z0-9]{17})\b/;

// ── Year pattern: 4 digits 1900-2099 ──────────────────────────────────────────

const YEAR_REGEX = /\b(19[0-9]{2}|20[0-9]{2})\b/;

// ── Price pattern ─────────────────────────────────────────────────────────────

const PRICE_REGEX = /\$\s?([\d,]+(?:\.\d{2})?)/;

// ── Common makes ──────────────────────────────────────────────────────────────

const MAKES = [
  'Toyota', 'Honda', 'Ford', 'Chevrolet', 'Chevy', 'BMW', 'Mercedes-Benz',
  'Mercedes', 'Audi', 'Lexus', 'Nissan', 'Hyundai', 'Kia', 'Subaru',
  'Volkswagen', 'VW', 'Mazda', 'Jeep', 'Dodge', 'Ram', 'GMC', 'Cadillac',
  'Buick', 'Lincoln', 'Acura', 'Infiniti', 'Volvo', 'Porsche', 'Land Rover',
  'Jaguar', 'Genesis', 'Chrysler', 'Tesla', 'Rivian', 'Lucid',
];

const MAKE_REGEX = new RegExp(`\\b(${MAKES.join('|')})\\b`, 'i');

// ── Detector ──────────────────────────────────────────────────────────────────

export function detectVehicleSignals(html: string, url: string): VehicleSignals {
  const issues: string[] = [];

  // Check for existing vehicle schema
  const hasVehicleSchema = /["']@type["']\s*:\s*["'](Car|Vehicle|Automobile)["']/i.test(html);
  const hasPriceSchema   = /["']@type["']\s*:\s*["']Offer["']/i.test(html)
                        && /["']price["']\s*:/i.test(html);

  // Check if inventory page
  const isInventoryByUrl = INVENTORY_PATTERNS.some((p) => p.test(url));
  const vinMatch         = html.match(VIN_REGEX);
  const isInventoryPage  = isInventoryByUrl || !!vinMatch;

  // Extract VIN
  const detectedVin = vinMatch?.[1];

  // Extract year
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
  const titleText  = titleMatch?.[1] ?? '';
  const h1Match    = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
  const h1Text     = h1Match?.[1]?.replace(/<[^>]+>/g, '') ?? '';
  const headerText = `${titleText} ${h1Text}`;

  const yearMatch    = headerText.match(YEAR_REGEX);
  const detectedYear = yearMatch?.[1];

  // Extract make
  const makeMatch    = headerText.match(MAKE_REGEX);
  const detectedMake = makeMatch?.[1];

  // Extract model — word(s) after make in header text
  let detectedModel: string | undefined;
  if (detectedMake) {
    const afterMake = headerText.substring(headerText.toLowerCase().indexOf(detectedMake.toLowerCase()) + detectedMake.length).trim();
    const modelMatch = afterMake.match(/^([A-Za-z0-9][\w-]*(?:\s[A-Za-z0-9][\w-]*)?)/);
    if (modelMatch) {
      detectedModel = modelMatch[1]!.trim();
    }
  }

  // Extract price
  const priceMatch    = html.match(PRICE_REGEX);
  const detectedPrice = priceMatch?.[1]?.replace(/,/g, '');

  // Build issues
  if (isInventoryPage && !hasVehicleSchema) {
    issues.push('MISSING_VEHICLE_SCHEMA');
  }
  if (isInventoryPage && !hasPriceSchema && detectedPrice) {
    issues.push('MISSING_PRICE_SCHEMA');
  }
  if (isInventoryPage && !detectedVin) {
    issues.push('MISSING_VIN');
  }

  return {
    has_vehicle_schema: hasVehicleSchema,
    has_price_schema:   hasPriceSchema,
    detected_vin:       detectedVin,
    detected_make:      detectedMake,
    detected_model:     detectedModel,
    detected_year:      detectedYear,
    detected_price:     detectedPrice,
    is_inventory_page:  isInventoryPage,
    issues,
  };
}
