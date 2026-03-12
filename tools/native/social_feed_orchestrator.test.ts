import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deploySocialFeed, removeSocialFeed } from './social_feed_orchestrator.js';
import { createComponent } from './native_component.js';

describe('deploySocialFeed', () => {
  it('full deploy path succeeds', async () => {
    const result = await deploySocialFeed('site1', 'test.myshopify.com', {
      feed_url: 'https://feed.example.com/rss',
    });
    assert.equal(result.install_result.success, true);
    assert.equal(result.component.component_type, 'social_feed');
    assert.equal(result.component.status, 'active');
    assert.ok(result.snippet_html.includes('vaeo-social-feed'));
  });

  it('empty feed_url fails validation', async () => {
    const result = await deploySocialFeed('site1', 'test.myshopify.com', {
      feed_url: '',
    });
    assert.equal(result.install_result.success, false);
    assert.equal(result.component.status, 'error');
    assert.ok(result.install_result.message.includes('Validation failed'));
  });

  it('config merges with defaults', async () => {
    const result = await deploySocialFeed('site1', 'test.myshopify.com', {
      feed_url: 'https://feed.example.com/rss',
      display_count: 12,
      layout: 'masonry',
    });
    assert.equal(result.install_result.success, true);
    // Snippet should contain our custom display count
    assert.ok(result.snippet_html.includes('12'));
  });

  it('dry_run generates snippet but does not install', async () => {
    let writeCalled = false;
    const result = await deploySocialFeed('site1', 'test.myshopify.com', {
      feed_url: 'https://feed.example.com/rss',
    }, true, {
      writeSnippet: async () => { writeCalled = true; return { success: true }; },
    });
    assert.equal(result.install_result.success, true);
    assert.equal(writeCalled, false);
    assert.ok(result.snippet_html.length > 0);
    assert.ok(result.install_result.message.includes('Dry run'));
  });

  it('calls writeSnippet and updateTheme when not dry_run', async () => {
    let snippetWritten = false;
    let themeUpdated = false;
    await deploySocialFeed('site1', 'test.myshopify.com', {
      feed_url: 'https://feed.example.com/rss',
    }, false, {
      writeSnippet: async () => { snippetWritten = true; return { success: true }; },
      updateTheme: async () => { themeUpdated = true; return { success: true }; },
    });
    assert.equal(snippetWritten, true);
    assert.equal(themeUpdated, true);
  });

  it('handles writeSnippet failure', async () => {
    const result = await deploySocialFeed('site1', 'test.myshopify.com', {
      feed_url: 'https://feed.example.com/rss',
    }, false, {
      writeSnippet: async () => ({ success: false }),
    });
    assert.equal(result.install_result.success, false);
    assert.equal(result.component.status, 'error');
  });

  it('handles updateTheme failure', async () => {
    const result = await deploySocialFeed('site1', 'test.myshopify.com', {
      feed_url: 'https://feed.example.com/rss',
    }, false, {
      writeSnippet: async () => ({ success: true }),
      updateTheme: async () => ({ success: false }),
    });
    assert.equal(result.install_result.success, false);
    assert.ok(result.install_result.message.includes('Theme update'));
  });

  it('component has correct site_id', async () => {
    const result = await deploySocialFeed('my-site', 'test.myshopify.com', {
      feed_url: 'https://feed.example.com/rss',
    });
    assert.equal(result.component.site_id, 'my-site');
  });

  it('installed_at set on success', async () => {
    const result = await deploySocialFeed('site1', 'test.myshopify.com', {
      feed_url: 'https://feed.example.com/rss',
    });
    assert.ok(result.component.installed_at);
  });

  it('handles thrown error gracefully', async () => {
    const result = await deploySocialFeed('site1', 'test.myshopify.com', {
      feed_url: 'https://feed.example.com/rss',
    }, false, {
      writeSnippet: async () => { throw new Error('Network error'); },
    });
    assert.equal(result.install_result.success, false);
    assert.ok(result.component.error?.includes('Network error'));
  });
});

describe('removeSocialFeed', () => {
  it('calls removeSnippet and removeFromTheme', async () => {
    let snippetRemoved = false;
    let themeRemoved = false;
    const comp = createComponent('site1', 'social_feed', 'Social Feed', {});
    const result = await removeSocialFeed(comp, 'test.myshopify.com', {
      removeSnippet: async () => { snippetRemoved = true; return { success: true }; },
      removeFromTheme: async () => { themeRemoved = true; return { success: true }; },
    });
    assert.equal(result.success, true);
    assert.equal(snippetRemoved, true);
    assert.equal(themeRemoved, true);
  });

  it('handles removal error gracefully', async () => {
    const comp = createComponent('site1', 'social_feed', 'Social Feed', {});
    const result = await removeSocialFeed(comp, 'test.myshopify.com', {
      removeSnippet: async () => { throw new Error('Delete failed'); },
    });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('Delete failed'));
  });
});
