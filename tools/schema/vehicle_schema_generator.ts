/**
 * tools/schema/vehicle_schema_generator.ts
 *
 * Generates schema.org/Car JSON-LD for dealership inventory pages.
 * Pure functions — no I/O, never throws.
 */

import type { VehicleSignals } from '../detect/vehicle_detect.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VehicleData {
  vin?:          string;
  make?:         string;
  model?:        string;
  year?:         string;
  trim?:         string;
  color?:        string;
  mileage?:      string;
  price?:        string;
  condition?:    'new' | 'used' | 'certified';
  body_style?:   string;
  fuel_type?:    string;
  transmission?: string;
  drivetrain?:   string;
  description?:  string;
  image_url?:    string;
  dealer_name?:  string;
  dealer_url?:   string;
}

// ── Condition mapping ─────────────────────────────────────────────────────────

const CONDITION_MAP: Record<string, string> = {
  new:       'https://schema.org/NewCondition',
  used:      'https://schema.org/UsedCondition',
  certified: 'https://schema.org/RefurbishedCondition',
};

// ── Schema generator ──────────────────────────────────────────────────────────

export function generateVehicleSchema(
  data:     VehicleData,
  pageUrl:  string,
): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type':    'Car',
    url:        pageUrl,
  };

  if (data.vin)   schema.vehicleIdentificationNumber = data.vin;
  if (data.model) schema.model = data.model;
  if (data.year)  schema.vehicleModelDate = data.year;
  if (data.trim)  schema.vehicleConfiguration = data.trim;
  if (data.color) schema.color = data.color;

  if (data.make) {
    schema.brand = {
      '@type': 'Organization',
      name:    data.make,
    };
  }

  if (data.mileage) {
    schema.mileageFromOdometer = {
      '@type':    'QuantitativeValue',
      value:      data.mileage,
      unitCode:   'SMI',
    };
  }

  if (data.price) {
    const offer: Record<string, unknown> = {
      '@type':        'Offer',
      price:          data.price,
      priceCurrency:  'USD',
      availability:   'https://schema.org/InStock',
    };
    if (data.condition && CONDITION_MAP[data.condition]) {
      offer.itemCondition = CONDITION_MAP[data.condition];
    }
    schema.offers = offer;
  }

  if (data.condition && CONDITION_MAP[data.condition] && !schema.offers) {
    schema.itemCondition = CONDITION_MAP[data.condition];
  }

  if (data.body_style)   schema.bodyType = data.body_style;
  if (data.fuel_type)    schema.fuelType = data.fuel_type;
  if (data.transmission) schema.vehicleTransmission = data.transmission;
  if (data.drivetrain)   schema.driveWheelConfiguration = data.drivetrain;
  if (data.description)  schema.description = data.description;
  if (data.image_url)    schema.image = data.image_url;

  if (data.dealer_name || data.dealer_url) {
    const seller: Record<string, unknown> = { '@type': 'Organization' };
    if (data.dealer_name) seller.name = data.dealer_name;
    if (data.dealer_url)  seller.url  = data.dealer_url;
    schema.seller = seller;
  }

  // Build name from year+make+model
  const nameParts = [data.year, data.make, data.model].filter(Boolean);
  if (nameParts.length > 0) schema.name = nameParts.join(' ');

  return schema;
}

// ── HTML extraction ───────────────────────────────────────────────────────────

const META_REGEX = /<meta[^>]+(?:name|property)=["']([^"']+)["'][^>]+content=["']([^"']+)["']/gi;
const CONDITION_KEYWORDS: Record<string, VehicleData['condition']> = {
  'certified':  'certified',
  'cpo':        'certified',
  'pre-owned':  'used',
  'preowned':   'used',
  'used':       'used',
  'brand new':  'new',
  'new':        'new',
};

export function extractVehicleDataFromHtml(
  html:    string,
  signals: VehicleSignals,
): VehicleData {
  const data: VehicleData = {};

  // Use signals for already-detected fields
  if (signals.detected_vin)   data.vin   = signals.detected_vin;
  if (signals.detected_make)  data.make  = signals.detected_make;
  if (signals.detected_model) data.model = signals.detected_model;
  if (signals.detected_year)  data.year  = signals.detected_year;
  if (signals.detected_price) data.price = signals.detected_price;

  // Extract from meta tags
  let match;
  META_REGEX.lastIndex = 0;
  while ((match = META_REGEX.exec(html)) !== null) {
    const name    = match[1]!.toLowerCase();
    const content = match[2]!;

    if (name.includes('description') && !data.description) {
      data.description = content;
    }
    if ((name === 'og:image' || name === 'twitter:image') && !data.image_url) {
      data.image_url = content;
    }
  }

  // Detect condition from page text
  const bodyText = html.replace(/<[^>]+>/g, ' ').toLowerCase();
  for (const [keyword, condition] of Object.entries(CONDITION_KEYWORDS)) {
    if (bodyText.includes(keyword)) {
      data.condition = condition;
      break;
    }
  }

  // Detect mileage
  const mileageMatch = bodyText.match(/([\d,]+)\s*(?:miles|mi\b)/);
  if (mileageMatch) {
    data.mileage = mileageMatch[1]!.replace(/,/g, '');
  }

  // Detect transmission
  if (/\bautomatic\b/i.test(bodyText))      data.transmission = 'Automatic';
  else if (/\bmanual\b/i.test(bodyText))    data.transmission = 'Manual';
  else if (/\bcvt\b/i.test(bodyText))       data.transmission = 'CVT';

  // Detect fuel type
  if (/\belectric\b/i.test(bodyText) && !/\bgas\b/i.test(bodyText)) data.fuel_type = 'Electric';
  else if (/\bhybrid\b/i.test(bodyText))    data.fuel_type = 'Hybrid';
  else if (/\bdiesel\b/i.test(bodyText))    data.fuel_type = 'Diesel';
  else if (/\bgasoline\b/i.test(bodyText))  data.fuel_type = 'Gasoline';

  // Detect body style
  const bodyStyleMatch = bodyText.match(/\b(sedan|coupe|suv|truck|van|wagon|hatchback|convertible|crossover|minivan|pickup)\b/i);
  if (bodyStyleMatch) data.body_style = bodyStyleMatch[1]!;

  return data;
}
