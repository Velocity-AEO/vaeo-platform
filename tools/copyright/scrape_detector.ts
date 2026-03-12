/**
 * tools/copyright/scrape_detector.ts
 *
 * Detects when content has been scraped and republished elsewhere.
 * Compares fingerprints via shared-word similarity, assigns severity.
 *
 * Never throws.
 */

import { randomUUID } from 'node:crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export type ScrapeSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface ScrapeMatch {
  match_id:        string;
  site_id:         string;
  original_url:    string;
  scraped_url:     string;
  scraped_domain:  string;
  similarity:      number;   // 0-1
  severity:        ScrapeSeverity;
  matched_phrases: string[];
  detected_at:     string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function simHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ── computeSimilarity ────────────────────────────────────────────────────────

export function computeSimilarity(a: string, b: string): number {
  try {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let shared = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) shared++;
    }
    const union = new Set([...wordsA, ...wordsB]).size;
    return union === 0 ? 0 : shared / union;
  } catch {
    return 0;
  }
}

// ── severityFromSimilarity ───────────────────────────────────────────────────

export function severityFromSimilarity(sim: number): ScrapeSeverity {
  if (sim >= 0.7) return 'critical';
  if (sim >= 0.5) return 'high';
  if (sim >= 0.3) return 'medium';
  return 'low';
}

// ── detectScrape ─────────────────────────────────────────────────────────────

export function detectScrape(
  site_id: string,
  original_url: string,
  original_content: string,
  scraped_url: string,
  scraped_content: string,
): ScrapeMatch {
  try {
    const similarity = computeSimilarity(original_content, scraped_content);
    const severity = severityFromSimilarity(similarity);

    // Extract matched phrases (shared 3-grams)
    const origWords = original_content.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const scrapedSet = new Set(scraped_content.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
    const phrases: string[] = [];
    for (let i = 0; i <= origWords.length - 3 && phrases.length < 5; i++) {
      const tri = [origWords[i], origWords[i + 1], origWords[i + 2]];
      if (tri.every((w) => scrapedSet.has(w))) {
        phrases.push(tri.join(' '));
      }
    }

    let domain = '';
    try {
      domain = new URL(scraped_url).hostname;
    } catch {
      domain = scraped_url;
    }

    return {
      match_id: randomUUID(),
      site_id,
      original_url,
      scraped_url,
      scraped_domain: domain,
      similarity,
      severity,
      matched_phrases: phrases,
      detected_at: new Date().toISOString(),
    };
  } catch {
    return {
      match_id: randomUUID(),
      site_id,
      original_url,
      scraped_url,
      scraped_domain: '',
      similarity: 0,
      severity: 'low',
      matched_phrases: [],
      detected_at: new Date().toISOString(),
    };
  }
}

// ── simulateScrapeMatches ────────────────────────────────────────────────────

const SCRAPER_DOMAINS = [
  'content-farm.xyz',
  'seo-clone.net',
  'copy-paste-blog.com',
  'article-spinner.io',
  'mirror-site.org',
  'stolen-content.biz',
  'auto-blog.net',
  'scrape-hub.com',
];

const SCRAPED_TEMPLATES = [
  'Our organic cotton collection is ethically sourced from certified farms. Each garment undergoes rigorous quality testing.',
  'Free shipping on all orders over $50. Shop our latest sustainable fashion collection featuring eco-friendly materials.',
  'The ultimate guide to building a capsule wardrobe with sustainable pieces for everyday wear.',
  'Customer reviews consistently rate our bamboo fabric clothing as the most comfortable they have worn.',
  'Our commitment to zero waste extends from design to delivery with recycled packaging materials.',
  'Handcrafted leather alternatives made from innovative plant-based materials for ethical fashion.',
  'Seasonal collection now available with light organic linen and hemp blends for warmer weather.',
  'Behind the scenes of our ethical manufacturing process with fair trade certified factory partners.',
  'Style meets sustainability in our newest activewear line made from recycled ocean plastics.',
  'Gift guide for the eco-conscious shopper featuring sustainable fashion accessories and organic clothing.',
];

export function simulateScrapeMatches(
  site_id: string,
  domain: string,
  count = 8,
): ScrapeMatch[] {
  try {
    const seed = simHash(domain);
    const matches: ScrapeMatch[] = [];

    for (let i = 0; i < count; i++) {
      const idx = (seed + i) % SCRAPED_TEMPLATES.length;
      const scraperIdx = (seed + i * 3) % SCRAPER_DOMAINS.length;
      const scraperDomain = SCRAPER_DOMAINS[scraperIdx];

      // ~30% hit rate: only some are high similarity
      const isHit = (seed + i * 7) % 10 < 3;
      const baseSim = isHit ? 0.5 + ((seed + i) % 40) / 100 : 0.1 + ((seed + i) % 20) / 100;
      const similarity = Math.min(baseSim, 1);
      const severity = severityFromSimilarity(similarity);

      const slug = `products/item-${i}`;
      const original_url = `https://${domain}/${slug}`;
      const scraped_url = `https://${scraperDomain}/copied-${slug}`;
      const content = SCRAPED_TEMPLATES[idx];

      // Extract some phrases from template
      const words = content.split(/\s+/).filter((w) => w.length > 2);
      const phrases: string[] = [];
      for (let j = 0; j <= words.length - 3 && phrases.length < 3; j += 4) {
        phrases.push(words.slice(j, j + 3).join(' '));
      }

      matches.push({
        match_id: randomUUID(),
        site_id,
        original_url,
        scraped_url,
        scraped_domain: scraperDomain,
        similarity,
        severity,
        matched_phrases: isHit ? phrases : [],
        detected_at: new Date().toISOString(),
      });
    }

    return matches;
  } catch {
    return [];
  }
}
