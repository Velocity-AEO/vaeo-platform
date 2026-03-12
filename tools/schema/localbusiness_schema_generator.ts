/**
 * tools/schema/localbusiness_schema_generator.ts
 *
 * Generates schema.org/LocalBusiness JSON-LD for local SEO.
 * Pure functions — no I/O, never throws.
 */

import type { LocalBusinessSignals } from '../detect/localbusiness_detect.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LocalBusinessData {
  name?:            string;
  type?:            string;
  address_street?:  string;
  address_city?:    string;
  address_state?:   string;
  address_zip?:     string;
  address_country?: string;
  phone?:           string;
  website?:         string;
  latitude?:        string;
  longitude?:       string;
  hours?:           string[];
  price_range?:     string;
  description?:     string;
  image_url?:       string;
  same_as?:         string[];
}

// ── Common LocalBusiness subtypes ─────────────────────────────────────────────

export const LOCALBUSINESS_TYPES: string[] = [
  'LocalBusiness',
  'Store',
  'AutoDealer',
  'Restaurant',
  'HomeAndConstructionBusiness',
  'HealthAndBeautyBusiness',
  'SportsActivityLocation',
  'TouristAttraction',
  'LodgingBusiness',
];

// ── Schema generator ──────────────────────────────────────────────────────────

export function generateLocalBusinessSchema(
  data: LocalBusinessData,
  page_url: string,
): Record<string, unknown> {
  try {
    const schema: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type':    data.type ?? 'LocalBusiness',
    };

    if (data.name)        schema.name = data.name;
    if (page_url)         schema.url  = page_url;
    if (data.website)     schema.url  = data.website;
    if (data.phone)       schema.telephone  = data.phone;
    if (data.description) schema.description = data.description;
    if (data.image_url)   schema.image = data.image_url;
    if (data.price_range) schema.priceRange = data.price_range;
    if (data.hours && data.hours.length > 0) schema.openingHours = data.hours;
    if (data.same_as && data.same_as.length > 0) schema.sameAs = data.same_as;

    // PostalAddress
    const hasAddr = data.address_street || data.address_city || data.address_state || data.address_zip;
    if (hasAddr) {
      const address: Record<string, unknown> = { '@type': 'PostalAddress' };
      if (data.address_street)  address.streetAddress   = data.address_street;
      if (data.address_city)    address.addressLocality = data.address_city;
      if (data.address_state)   address.addressRegion   = data.address_state;
      if (data.address_zip)     address.postalCode      = data.address_zip;
      if (data.address_country) address.addressCountry  = data.address_country;
      schema.address = address;
    }

    // GeoCoordinates
    if (data.latitude && data.longitude) {
      schema.geo = {
        '@type':    'GeoCoordinates',
        latitude:   data.latitude,
        longitude:  data.longitude,
      };
    }

    return schema;
  } catch {
    return { '@context': 'https://schema.org', '@type': 'LocalBusiness' };
  }
}

// ── HTML data extraction ──────────────────────────────────────────────────────

const JSONLD_RE   = /<script\s[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const META_RE     = /<meta[^>]+(?:name|property)=["']([^"']+)["'][^>]+content=["']([^"']+)["']/gi;
const LB_TYPES    = new Set([
  'LocalBusiness', 'Store', 'AutoDealer', 'Restaurant',
  'HomeAndConstructionBusiness', 'HealthAndBeautyBusiness',
  'SportsActivityLocation', 'TouristAttraction', 'LodgingBusiness',
  'AutomotiveBusiness', 'DryCleaningOrLaundry', 'FoodEstablishment',
  'MedicalBusiness', 'MovingCompany', 'PetStore', 'Pharmacy', 'SportsClub',
  'Bakery', 'BarOrPub', 'CafeOrCoffeeShop', 'FastFoodRestaurant',
  'HairSalon', 'HardwareStore', 'Hotel', 'LegalService',
]);

export function extractLocalBusinessDataFromHtml(
  html: string,
  signals: LocalBusinessSignals,
): LocalBusinessData {
  try {
    const data: LocalBusinessData = {};

    // Seed from already-detected signals
    if (signals.detected_name)    data.name           = signals.detected_name;
    if (signals.detected_phone)   data.phone          = signals.detected_phone;
    if (signals.detected_address) data.address_street = signals.detected_address;
    if (signals.detected_city)    data.address_city   = signals.detected_city;
    if (signals.detected_state)   data.address_state  = signals.detected_state;
    if (signals.detected_zip)     data.address_zip    = signals.detected_zip;
    if (signals.detected_country) data.address_country = signals.detected_country;

    // Scan meta tags for description + image
    let m: RegExpExecArray | null;
    META_RE.lastIndex = 0;
    while ((m = META_RE.exec(html)) !== null) {
      const name    = m[1]!.toLowerCase();
      const content = m[2]!;
      if ((name === 'description' || name === 'og:description') && !data.description) {
        data.description = content;
      }
      if ((name === 'og:image' || name === 'twitter:image') && !data.image_url) {
        data.image_url = content;
      }
      if (name === 'og:url' && !data.website) {
        data.website = content;
      }
    }

    // Extract richer data from existing JSON-LD if present
    JSONLD_RE.lastIndex = 0;
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
          const types   = Array.isArray(typeRaw) ? typeRaw.map(String) : [String(typeRaw ?? '')];
          if (!types.some((t) => LB_TYPES.has(t))) continue;

          if (node.name && !data.name)             data.name        = String(node.name);
          if (node.telephone && !data.phone)        data.phone       = String(node.telephone);
          if (node.description && !data.description) data.description = String(node.description);
          if (node.image && !data.image_url)        data.image_url   = String(node.image);
          if (node.priceRange && !data.price_range) data.price_range = String(node.priceRange);
          if (node.url && !data.website)            data.website     = String(node.url);

          // Hours
          if (!data.hours) {
            if (Array.isArray(node.openingHours)) {
              data.hours = node.openingHours.map(String);
            } else if (typeof node.openingHours === 'string') {
              data.hours = [node.openingHours];
            }
          }

          // sameAs
          if (!data.same_as) {
            if (Array.isArray(node.sameAs))         data.same_as = node.sameAs.map(String);
            else if (typeof node.sameAs === 'string') data.same_as = [node.sameAs];
          }

          // Geo
          if (!data.latitude && node.geo && typeof node.geo === 'object') {
            const geo = node.geo as Record<string, unknown>;
            if (geo.latitude)  data.latitude  = String(geo.latitude);
            if (geo.longitude) data.longitude = String(geo.longitude);
          }

          // @type → data.type
          if (!data.type) data.type = types[0];
        }
      } catch { /* ignore */ }
    }

    return data;
  } catch {
    return {};
  }
}
