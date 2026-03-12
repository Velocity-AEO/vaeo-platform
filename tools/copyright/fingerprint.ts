/**
 * tools/copyright/fingerprint.ts
 *
 * Generates content fingerprints for copyright protection monitoring.
 * SHA-256 hashing, key phrase extraction, batch processing.
 *
 * Never throws.
 */

import { randomUUID, createHash } from 'node:crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ContentFingerprint {
  fingerprint_id:   string;
  site_id:          string;
  url:              string;
  content_hash:     string;
  content_preview:  string;
  word_count:       number;
  key_phrases:      string[];
  fingerprinted_at: string;
  page_type:        string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function simHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function extractKeyPhrases(content: string, count: number): string[] {
  const words = content.split(/\s+/).filter((w) => w.length > 2);
  const phrases: string[] = [];
  for (let i = 0; i <= words.length - 3 && phrases.length < count; i++) {
    const phrase = words.slice(i, i + 3 + (i % 3)).join(' ');
    if (phrase.length > 8) phrases.push(phrase);
  }
  return phrases.slice(0, count);
}

// ── Build fingerprint ────────────────────────────────────────────────────────

export function buildFingerprint(
  site_id: string,
  url: string,
  content: string,
  page_type?: string,
): ContentFingerprint {
  try {
    const hash = createHash('sha256').update(content).digest('hex');
    const words = content.split(/\s+/).filter((w) => w.length > 0);

    return {
      fingerprint_id: randomUUID(),
      site_id,
      url,
      content_hash: hash,
      content_preview: content.slice(0, 200),
      word_count: words.length,
      key_phrases: extractKeyPhrases(content, 5),
      fingerprinted_at: new Date().toISOString(),
      page_type: page_type ?? 'unknown',
    };
  } catch {
    return {
      fingerprint_id: randomUUID(),
      site_id,
      url,
      content_hash: '',
      content_preview: '',
      word_count: 0,
      key_phrases: [],
      fingerprinted_at: new Date().toISOString(),
      page_type: page_type ?? 'unknown',
    };
  }
}

// ── Batch ────────────────────────────────────────────────────────────────────

export function buildFingerprintBatch(
  site_id: string,
  pages: Array<{ url: string; content: string; page_type?: string }>,
): ContentFingerprint[] {
  try {
    return pages.map((p) => buildFingerprint(site_id, p.url, p.content, p.page_type));
  } catch {
    return [];
  }
}

// ── Simulate ─────────────────────────────────────────────────────────────────

const SAMPLE_CONTENT = [
  'Our organic cotton collection is ethically sourced from certified farms. Each garment undergoes rigorous quality testing to ensure lasting comfort and sustainability. We believe fashion should never come at the cost of the environment.',
  'Free shipping on all orders over $50. Shop our latest sustainable fashion collection featuring eco-friendly materials and ethical manufacturing processes. Join thousands of conscious consumers making a difference.',
  'The ultimate guide to building a capsule wardrobe with sustainable pieces. Learn how to maximize your style while minimizing your environmental impact with carefully chosen staple items.',
  'Customer reviews consistently rate our bamboo fabric clothing as the most comfortable they have ever worn. The natural antimicrobial properties keep you fresh all day long.',
  'Our commitment to zero waste extends from design to delivery. Every package uses recycled materials and our return process ensures nothing ends up in landfills.',
  'Handcrafted leather alternatives made from innovative plant-based materials. Our vegan leather bags are designed to last years while leaving zero animal footprint.',
  'Seasonal collection now available. Discover our spring lineup featuring light organic linen and hemp blends perfect for warmer weather. Limited quantities available.',
  'Behind the scenes of our ethical manufacturing process. We partner directly with fair trade certified factories to ensure every worker receives living wages and safe conditions.',
  'Style meets sustainability in our newest activewear line. Made from recycled ocean plastics, each piece removes waste from our waterways while keeping you comfortable during workouts.',
  'Gift guide for the eco-conscious shopper. Find the perfect present from our curated selection of sustainable fashion accessories and organic clothing essentials.',
  'Our denim collection uses 80% less water than conventional manufacturing. Innovative dyeing techniques eliminate harmful chemicals while producing vibrant lasting color.',
  'Join our loyalty program and earn rewards for sustainable choices. Get early access to new collections and exclusive discounts on your favorite eco-friendly products.',
];

const PAGE_TYPES = ['product', 'product', 'article', 'product', 'article', 'product', 'collection', 'article', 'product', 'article', 'product', 'article'];

export function simulateFingerprints(
  site_id: string,
  domain: string,
  count = 10,
): ContentFingerprint[] {
  try {
    const seed = simHash(domain);
    const fingerprints: ContentFingerprint[] = [];

    for (let i = 0; i < count; i++) {
      const idx = (seed + i) % SAMPLE_CONTENT.length;
      const content = SAMPLE_CONTENT[idx];
      const pt = PAGE_TYPES[idx];
      const slug = pt === 'article' ? `blog/post-${i}` : pt === 'collection' ? `collections/col-${i}` : `products/item-${i}`;
      const url = `https://${domain}/${slug}`;

      fingerprints.push(buildFingerprint(site_id, url, content, pt));
    }

    return fingerprints;
  } catch {
    return [];
  }
}
