/**
 * tools/wordpress/wp_multisite_detector.ts
 *
 * Detects WordPress multisite installs (network and subdomain configurations).
 * Never throws at outer level.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type WPMultisiteType = 'subdomain' | 'subdirectory' | 'none';

export interface WPSubsite {
  site_id:  number;
  url:      string;
  name:     string;
  is_main:  boolean;
}

export interface WPMultisiteConfig {
  is_multisite:    boolean;
  multisite_type:  WPMultisiteType;
  main_site_url:   string;
  subsites:        WPSubsite[];
  subsite_count:   number;
  detected_at:     string;
}

export interface DetectDeps {
  fetchFn?: (url: string, opts?: RequestInit) => Promise<Response>;
}

// ── detectMultisiteFromHTML ──────────────────────────────────────────────────

export function detectMultisiteFromHTML(html: string, url: string): boolean {
  try {
    const h = html ?? '';
    // Generator tag with multisite hint
    if (/name=["']generator["'][^>]*content=["'][^"']*multisite/i.test(h)) return true;
    if (/content=["'][^"']*multisite[^"']*["'][^>]*name=["']generator/i.test(h)) return true;
    // wp-includes paths with network patterns
    if (/\/wp-includes\/[^"']*network/i.test(h)) return true;
    // Admin-bar network menu items
    if (/id=["']wp-admin-bar-network/i.test(h)) return true;
    if (/class=["'][^"']*network-admin/i.test(h)) return true;
    // wp-signup.php presence (multisite-only)
    if (/wp-signup\.php/i.test(h)) return true;
    // /wp-admin/network/ links
    if (/\/wp-admin\/network\//i.test(h)) return true;
    return false;
  } catch {
    return false;
  }
}

// ── detectMultisiteType ─────────────────────────────────────────────────────

export function detectMultisiteType(
  main_url: string,
  subsite_urls: string[],
): WPMultisiteType {
  try {
    if (!subsite_urls || subsite_urls.length === 0) return 'none';
    const mainHost = new URL(main_url).hostname;

    let hasSubdomain = false;
    let hasSubdirectory = false;

    for (const sub of subsite_urls) {
      try {
        const subUrl = new URL(sub);
        if (subUrl.hostname !== mainHost) {
          // Check if it's a subdomain of main host
          if (subUrl.hostname.endsWith('.' + mainHost)) {
            hasSubdomain = true;
          }
        } else {
          // Same host — check for subdirectory path beyond /
          const mainPath = new URL(main_url).pathname.replace(/\/$/, '');
          const subPath = subUrl.pathname.replace(/\/$/, '');
          if (subPath !== mainPath && subPath.length > mainPath.length) {
            hasSubdirectory = true;
          }
        }
      } catch {
        // skip invalid URLs
      }
    }

    if (hasSubdomain) return 'subdomain';
    if (hasSubdirectory) return 'subdirectory';
    return 'none';
  } catch {
    return 'none';
  }
}

// ── detectWPMultisite ───────────────────────────────────────────────────────

export async function detectWPMultisite(
  wp_url: string,
  username: string,
  app_password: string,
  deps?: DetectDeps,
): Promise<WPMultisiteConfig> {
  const empty: WPMultisiteConfig = {
    is_multisite:   false,
    multisite_type: 'none',
    main_site_url:  wp_url ?? '',
    subsites:       [],
    subsite_count:  0,
    detected_at:    new Date().toISOString(),
  };

  try {
    const base = (wp_url ?? '').replace(/\/$/, '');
    const cred = Buffer.from(`${username ?? ''}:${app_password ?? ''}`).toString('base64');
    const fetchFn = deps?.fetchFn ?? globalThis.fetch;

    const res = await fetchFn(`${base}/wp-json/wp/v2/sites`, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${cred}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      // 404 = not multisite or sites endpoint not available
      return empty;
    }

    const data = await res.json() as unknown;
    if (!Array.isArray(data) || data.length === 0) {
      return empty;
    }

    const subsites: WPSubsite[] = data.map((site: Record<string, unknown>, i: number) => ({
      site_id: typeof site.id === 'number' ? site.id : i + 1,
      url:     typeof site.url === 'string' ? site.url : typeof site.home === 'string' ? site.home : '',
      name:    typeof site.name === 'string' ? site.name : typeof site.blogname === 'string' ? site.blogname : `Site ${i + 1}`,
      is_main: i === 0,
    }));

    const subsite_urls = subsites.map(s => s.url).filter(Boolean);
    const multisite_type = detectMultisiteType(base, subsite_urls);

    return {
      is_multisite:   true,
      multisite_type,
      main_site_url:  base,
      subsites,
      subsite_count:  subsites.length,
      detected_at:    new Date().toISOString(),
    };
  } catch {
    return empty;
  }
}
