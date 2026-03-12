import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateBadge, generateVerifiedSchema } from './velocity_badge.js';

// ── generateBadge ────────────────────────────────────────────────────────────

describe('generateBadge', () => {
  it('sets site_id', () => {
    const badge = generateBadge('site-1', 'example.com');
    assert.equal(badge.site_id, 'site-1');
  });

  it('sets domain', () => {
    const badge = generateBadge('site-1', 'example.com');
    assert.equal(badge.domain, 'example.com');
  });

  it('verified_at is ISO string', () => {
    const badge = generateBadge('site-1', 'example.com');
    assert.ok(!isNaN(Date.parse(badge.verified_at)));
  });

  it('badge_version is 1.0.0', () => {
    const badge = generateBadge('site-1', 'example.com');
    assert.equal(badge.badge_version, '1.0.0');
  });

  it('embed_snippet is non-empty string', () => {
    const badge = generateBadge('site-1', 'example.com');
    assert.ok(badge.embed_snippet.length > 0);
    assert.ok(badge.embed_snippet.includes('vaeo.app'));
  });

  it('embed_snippet contains anchor tag', () => {
    const badge = generateBadge('site-1', 'example.com');
    assert.ok(badge.embed_snippet.includes('<a '));
    assert.ok(badge.embed_snippet.includes('</a>'));
  });

  it('verification_url contains site_id', () => {
    const badge = generateBadge('my-site-123', 'example.com');
    assert.ok(badge.verification_url.includes('my-site-123'));
  });

  it('verification_url starts with https://vaeo.app', () => {
    const badge = generateBadge('site-1', 'example.com');
    assert.ok(badge.verification_url.startsWith('https://vaeo.app/verified/'));
  });

  it('never throws on empty inputs', () => {
    assert.doesNotThrow(() => generateBadge('', ''));
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() =>
      generateBadge(null as unknown as string, null as unknown as string),
    );
  });
});

// ── generateVerifiedSchema ───────────────────────────────────────────────────

describe('generateVerifiedSchema', () => {
  it('returns valid JSON string', () => {
    const badge = generateBadge('site-1', 'example.com');
    const schema = generateVerifiedSchema(badge);
    assert.doesNotThrow(() => JSON.parse(schema));
  });

  it('schema contains @context', () => {
    const badge = generateBadge('site-1', 'example.com');
    const parsed = JSON.parse(generateVerifiedSchema(badge));
    assert.equal(parsed['@context'], 'https://schema.org');
  });

  it('schema contains @type WebSite', () => {
    const badge = generateBadge('site-1', 'example.com');
    const parsed = JSON.parse(generateVerifiedSchema(badge));
    assert.equal(parsed['@type'], 'WebSite');
  });

  it('schema contains domain in url', () => {
    const badge = generateBadge('site-1', 'example.com');
    const parsed = JSON.parse(generateVerifiedSchema(badge));
    assert.ok(parsed.url.includes('example.com'));
  });

  it('schema potentialAction has correct name', () => {
    const badge = generateBadge('site-1', 'example.com');
    const parsed = JSON.parse(generateVerifiedSchema(badge));
    assert.equal(parsed.potentialAction.name, 'Verified by Velocity AEO');
  });

  it('schema potentialAction target matches verification_url', () => {
    const badge = generateBadge('site-1', 'example.com');
    const parsed = JSON.parse(generateVerifiedSchema(badge));
    assert.equal(parsed.potentialAction.target, badge.verification_url);
  });

  it('never throws on fallback badge', () => {
    const badge = generateBadge('', '');
    assert.doesNotThrow(() => generateVerifiedSchema(badge));
  });
});
