import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSocialFeedConfig,
  validateSocialFeedConfig,
  generateSocialFeedSnippet,
  type SocialFeedConfig,
} from './social_feed.js';

function makeConfig(overrides: Partial<SocialFeedConfig> = {}): SocialFeedConfig {
  return { ...defaultSocialFeedConfig(), feed_url: 'https://feed.example.com/rss', ...overrides };
}

describe('defaultSocialFeedConfig', () => {
  it('returns instagram_rss feed_type', () => {
    assert.equal(defaultSocialFeedConfig().feed_type, 'instagram_rss');
  });

  it('returns empty feed_url', () => {
    assert.equal(defaultSocialFeedConfig().feed_url, '');
  });

  it('returns display_count=6', () => {
    assert.equal(defaultSocialFeedConfig().display_count, 6);
  });

  it('returns grid layout', () => {
    assert.equal(defaultSocialFeedConfig().layout, 'grid');
  });

  it('returns columns=3', () => {
    assert.equal(defaultSocialFeedConfig().columns, 3);
  });

  it('returns show_heading=true', () => {
    assert.equal(defaultSocialFeedConfig().show_heading, true);
  });

  it('returns heading_text Follow Us', () => {
    assert.equal(defaultSocialFeedConfig().heading_text, 'Follow Us');
  });

  it('returns cache_duration_minutes=30', () => {
    assert.equal(defaultSocialFeedConfig().cache_duration_minutes, 30);
  });
});

describe('validateSocialFeedConfig', () => {
  it('valid config passes', () => {
    const result = validateSocialFeedConfig(makeConfig());
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('empty feed_url fails', () => {
    const result = validateSocialFeedConfig(makeConfig({ feed_url: '' }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('feed_url')));
  });

  it('display_count > 20 fails', () => {
    const result = validateSocialFeedConfig(makeConfig({ display_count: 25 }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('display_count')));
  });

  it('display_count < 1 fails', () => {
    const result = validateSocialFeedConfig(makeConfig({ display_count: 0 }));
    assert.equal(result.valid, false);
  });

  it('gap_px > 40 fails', () => {
    const result = validateSocialFeedConfig(makeConfig({ gap_px: 50 }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('gap_px')));
  });

  it('border_radius_px > 40 fails', () => {
    const result = validateSocialFeedConfig(makeConfig({ border_radius_px: 45 }));
    assert.equal(result.valid, false);
  });

  it('refresh_interval < 5 fails', () => {
    const result = validateSocialFeedConfig(makeConfig({ refresh_interval_minutes: 2 }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('refresh_interval')));
  });

  it('cache_duration < 5 fails', () => {
    const result = validateSocialFeedConfig(makeConfig({ cache_duration_minutes: 1 }));
    assert.equal(result.valid, false);
  });

  it('invalid columns fails', () => {
    const result = validateSocialFeedConfig(makeConfig({ columns: 5 as any }));
    assert.equal(result.valid, false);
  });

  it('caption_max_chars < 10 fails', () => {
    const result = validateSocialFeedConfig(makeConfig({ caption_max_chars: 5 }));
    assert.equal(result.valid, false);
  });
});

describe('generateSocialFeedSnippet', () => {
  it('contains vaeo-social-feed wrapper', () => {
    const html = generateSocialFeedSnippet(makeConfig(), 'test-feed');
    assert.ok(html.includes('vaeo-social-feed'));
  });

  it('contains style block', () => {
    const html = generateSocialFeedSnippet(makeConfig(), 'test-feed');
    assert.ok(html.includes('<style>'));
    assert.ok(html.includes('</style>'));
  });

  it('contains script block', () => {
    const html = generateSocialFeedSnippet(makeConfig(), 'test-feed');
    assert.ok(html.includes('<script>'));
    assert.ok(html.includes('</script>'));
  });

  it('contains heading when show_heading=true', () => {
    const html = generateSocialFeedSnippet(makeConfig({ show_heading: true, heading_text: 'Our Feed' }), 'test');
    assert.ok(html.includes('Our Feed'));
    assert.ok(html.includes('<h2'));
  });

  it('no heading when show_heading=false', () => {
    const html = generateSocialFeedSnippet(makeConfig({ show_heading: false }), 'test');
    assert.ok(!html.includes('<h2'));
  });

  it('contains grid layout when layout=grid', () => {
    const html = generateSocialFeedSnippet(makeConfig({ layout: 'grid' }), 'test');
    assert.ok(html.includes('display:grid'));
    assert.ok(html.includes('grid-template-columns'));
  });

  it('contains horizontal scroll when layout=horizontal_scroll', () => {
    const html = generateSocialFeedSnippet(makeConfig({ layout: 'horizontal_scroll' }), 'test');
    assert.ok(html.includes('overflow-x:auto'));
    assert.ok(html.includes('scroll-snap-type'));
  });

  it('contains caption logic when show_caption=true', () => {
    const html = generateSocialFeedSnippet(makeConfig({ show_caption: true }), 'test');
    assert.ok(html.includes('vaeo-caption'));
    assert.ok(html.includes('capText'));
  });

  it('no caption rendering when show_caption=false', () => {
    const html = generateSocialFeedSnippet(makeConfig({ show_caption: false }), 'test');
    assert.ok(!html.includes('capText'));
  });

  it('contains platform badge when show_platform_badge=true', () => {
    const html = generateSocialFeedSnippet(makeConfig({ show_platform_badge: true }), 'test');
    assert.ok(html.includes('vaeo-badge'));
    assert.ok(html.includes('Instagram'));
  });

  it('contains localStorage cache logic', () => {
    const html = generateSocialFeedSnippet(makeConfig(), 'my-widget');
    assert.ok(html.includes('localStorage'));
    assert.ok(html.includes('vaeo-feed-my-widget'));
  });

  it('contains feed_url in script', () => {
    const html = generateSocialFeedSnippet(makeConfig({ feed_url: 'https://my.feed/rss' }), 'test');
    assert.ok(html.includes('https://my.feed/rss'));
  });

  it('contains display_count value', () => {
    const html = generateSocialFeedSnippet(makeConfig({ display_count: 8 }), 'test');
    assert.ok(html.includes('8'));
  });

  it('columns reflected in grid CSS', () => {
    const html = generateSocialFeedSnippet(makeConfig({ columns: 4 }), 'test');
    assert.ok(html.includes('repeat(4,1fr)'));
  });

  it('snippet_name in comment', () => {
    const html = generateSocialFeedSnippet(makeConfig(), 'my-social');
    assert.ok(html.includes('snippet: my-social'));
  });

  it('contains XML parsing when feed_type=instagram_rss', () => {
    const html = generateSocialFeedSnippet(makeConfig({ feed_type: 'instagram_rss' }), 'test');
    assert.ok(html.includes('DOMParser'));
    assert.ok(html.includes('text/xml'));
  });

  it('contains JSON parsing when feed_type=custom_json', () => {
    const html = generateSocialFeedSnippet(makeConfig({ feed_type: 'custom_json' }), 'test');
    assert.ok(html.includes('JSON.parse'));
  });
});
