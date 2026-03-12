// tools/native/social_feed.ts — Social Feed Widget config, validation, and HTML generator
// Pulls from public RSS/JSON feeds — no OAuth required for display.
// Never throws.

// ── Types ────────────────────────────────────────────────────────────────────

export interface SocialFeedConfig {
  feed_type: 'instagram_rss' | 'tiktok_rss' | 'youtube_rss' | 'custom_json';
  feed_url: string;
  display_count: number;
  layout: 'grid' | 'horizontal_scroll' | 'masonry';
  columns: 2 | 3 | 4;
  show_caption: boolean;
  caption_max_chars: number;
  show_platform_badge: boolean;
  image_aspect_ratio: '1:1' | '4:5' | '16:9';
  border_radius_px: number;
  gap_px: number;
  heading_text: string;
  show_heading: boolean;
  heading_color: string;
  link_to_post: boolean;
  refresh_interval_minutes: number;
  fallback_image_url: string;
  cache_duration_minutes: number;
}

// ── Defaults ────────────────────────────────────────────────────────────────

export function defaultSocialFeedConfig(): SocialFeedConfig {
  return {
    feed_type: 'instagram_rss',
    feed_url: '',
    display_count: 6,
    layout: 'grid',
    columns: 3,
    show_caption: false,
    caption_max_chars: 100,
    show_platform_badge: true,
    image_aspect_ratio: '1:1',
    border_radius_px: 8,
    gap_px: 8,
    heading_text: 'Follow Us',
    show_heading: true,
    heading_color: '#1a1a1a',
    link_to_post: true,
    refresh_interval_minutes: 60,
    fallback_image_url: '',
    cache_duration_minutes: 30,
  };
}

// ── Validation ──────────────────────────────────────────────────────────────

export function validateSocialFeedConfig(
  config: SocialFeedConfig,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.feed_url || config.feed_url.trim() === '') {
    errors.push('feed_url must not be empty');
  }
  if (config.display_count < 1 || config.display_count > 20) {
    errors.push('display_count must be between 1 and 20');
  }
  if (![2, 3, 4].includes(config.columns)) {
    errors.push('columns must be 2, 3, or 4');
  }
  if (config.caption_max_chars < 10 || config.caption_max_chars > 500) {
    errors.push('caption_max_chars must be between 10 and 500');
  }
  if (config.gap_px < 0 || config.gap_px > 40) {
    errors.push('gap_px must be between 0 and 40');
  }
  if (config.border_radius_px < 0 || config.border_radius_px > 40) {
    errors.push('border_radius_px must be between 0 and 40');
  }
  if (config.refresh_interval_minutes < 5) {
    errors.push('refresh_interval_minutes must be >= 5');
  }
  if (config.cache_duration_minutes < 5) {
    errors.push('cache_duration_minutes must be >= 5');
  }

  return { valid: errors.length === 0, errors };
}

// ── Aspect ratio helper ─────────────────────────────────────────────────────

function aspectRatioCSS(ratio: string): string {
  switch (ratio) {
    case '4:5': return '4/5';
    case '16:9': return '16/9';
    default: return '1/1';
  }
}

function platformLabel(feedType: string): string {
  if (feedType.startsWith('instagram')) return 'Instagram';
  if (feedType.startsWith('tiktok')) return 'TikTok';
  if (feedType.startsWith('youtube')) return 'YouTube';
  return 'Feed';
}

// ── Snippet generator ───────────────────────────────────────────────────────

export function generateSocialFeedSnippet(
  config: SocialFeedConfig,
  snippet_name: string,
): string {
  const ratio = aspectRatioCSS(config.image_aspect_ratio);
  const platform = platformLabel(config.feed_type);
  const isRSS = config.feed_type.endsWith('_rss');
  const cacheKey = `vaeo-feed-${snippet_name}`;

  const gridCSS = config.layout === 'horizontal_scroll'
    ? `display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:${config.gap_px}px`
    : `display:grid;grid-template-columns:repeat(${config.columns},1fr);gap:${config.gap_px}px`;

  const scrollItemCSS = config.layout === 'horizontal_scroll'
    ? 'min-width:250px;scroll-snap-align:start;flex-shrink:0;'
    : '';

  const headingHTML = config.show_heading
    ? `  <h2 style="color:${config.heading_color};margin:0 0 16px 0;font-size:1.25rem">${config.heading_text}</h2>\n`
    : '';

  const badgeLogic = config.show_platform_badge
    ? `
        var badge = document.createElement('span');
        badge.className = 'vaeo-badge';
        badge.textContent = '${platform}';
        itemDiv.appendChild(badge);`
    : '';

  const captionLogic = config.show_caption
    ? `
        var cap = document.createElement('p');
        cap.className = 'vaeo-caption';
        var capText = item.caption || item.title || '';
        cap.textContent = capText.length > ${config.caption_max_chars} ? capText.slice(0, ${config.caption_max_chars}) + '...' : capText;
        wrapper.appendChild(cap);`
    : '';

  const linkOpen = config.link_to_post
    ? `var a = document.createElement('a');
        a.href = item.url || item.link || '#';
        a.target = '_blank';
        a.rel = 'noopener';
        a.style.textDecoration = 'none';
        a.style.color = 'inherit';`
    : `var a = document.createElement('div');`;

  const parseLogic = isRSS
    ? `function parseFeed(text) {
          var parser = new DOMParser();
          var xml = parser.parseFromString(text, 'text/xml');
          var entries = xml.querySelectorAll('item, entry');
          var items = [];
          for (var i = 0; i < Math.min(entries.length, ${config.display_count}); i++) {
            var e = entries[i];
            var title = (e.querySelector('title') || {}).textContent || '';
            var link = (e.querySelector('link') || {}).textContent || '';
            var enc = e.querySelector('enclosure, media\\\\:content, media\\\\:thumbnail');
            var img = enc ? (enc.getAttribute('url') || '') : '${config.fallback_image_url}';
            var desc = (e.querySelector('description') || {}).textContent || '';
            items.push({ title: title, url: link, image_url: img, caption: desc || title });
          }
          return items;
        }`
    : `function parseFeed(text) {
          var data = JSON.parse(text);
          var arr = Array.isArray(data) ? data : (data.items || data.feed || []);
          return arr.slice(0, ${config.display_count}).map(function(item) {
            return {
              title: item.title || '',
              url: item.url || item.link || '#',
              image_url: item.image_url || item.image || item.thumbnail || '${config.fallback_image_url}',
              caption: item.caption || item.description || item.title || ''
            };
          });
        }`;

  return `/* VAEO Native Social Feed v1.0.0
   Generated by Velocity AEO
   snippet: ${snippet_name} */

<div id="vaeo-social-feed">
${headingHTML}  <div class="vaeo-feed-grid" style="${gridCSS}">
  </div>
  <div class="vaeo-feed-loading" style="text-align:center;padding:24px;color:#888">Loading feed...</div>
  <div class="vaeo-feed-error" style="display:none;text-align:center;padding:24px;color:#c00">Unable to load feed. Please try again later.</div>
</div>

<style>
  #vaeo-social-feed { position: relative; }
  .vaeo-feed-item { position: relative; overflow: hidden; }
  .vaeo-feed-item img { display: block; width: 100%; aspect-ratio: ${ratio}; object-fit: cover; border-radius: ${config.border_radius_px}px; }
  .vaeo-badge { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.7); color: #fff; font-size: 10px; padding: 2px 8px; border-radius: 12px; pointer-events: none; }
  .vaeo-caption { margin: 4px 0 0 0; font-size: 12px; color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
</style>

<script>
(function() {
  var FEED_URL = '${config.feed_url}';
  var CACHE_KEY = '${cacheKey}';
  var CACHE_DURATION = ${config.cache_duration_minutes} * 60 * 1000;
  var DISPLAY_COUNT = ${config.display_count};
  var REFRESH_MS = ${config.refresh_interval_minutes} * 60 * 1000;

  ${parseLogic}

  function renderItems(items) {
    var grid = document.querySelector('#vaeo-social-feed .vaeo-feed-grid');
    var loading = document.querySelector('#vaeo-social-feed .vaeo-feed-loading');
    var errorEl = document.querySelector('#vaeo-social-feed .vaeo-feed-error');
    if (!grid) return;
    grid.innerHTML = '';
    loading.style.display = 'none';
    errorEl.style.display = 'none';
    items.slice(0, DISPLAY_COUNT).forEach(function(item) {
      var itemDiv = document.createElement('div');
      itemDiv.className = 'vaeo-feed-item';
      itemDiv.style.cssText = '${scrollItemCSS}';
      ${linkOpen}
      var wrapper = a;
      var img = document.createElement('img');
      img.src = item.image_url || '${config.fallback_image_url}';
      img.alt = (item.caption || item.title || 'Social post').slice(0, 80);
      img.loading = 'lazy';
      wrapper.appendChild(img);${badgeLogic}${captionLogic}
      itemDiv.appendChild(wrapper);
      grid.appendChild(itemDiv);
    });
  }

  function showError() {
    var loading = document.querySelector('#vaeo-social-feed .vaeo-feed-loading');
    var errorEl = document.querySelector('#vaeo-social-feed .vaeo-feed-error');
    if (loading) loading.style.display = 'none';
    if (errorEl) errorEl.style.display = 'block';
  }

  function fetchAndRender() {
    var cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        var parsed = JSON.parse(cached);
        if (parsed.ts && (Date.now() - parsed.ts < CACHE_DURATION)) {
          renderItems(parsed.items);
          return;
        }
      } catch(e) { /* ignore bad cache */ }
    }
    fetch(FEED_URL).then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function(text) {
      var items = parseFeed(text);
      renderItems(items);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), items: items }));
    }).catch(function() {
      showError();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchAndRender);
  } else {
    fetchAndRender();
  }

  if (REFRESH_MS > 0) {
    setInterval(fetchAndRender, REFRESH_MS);
  }
})();
</script>`;
}
