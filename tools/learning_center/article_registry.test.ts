import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTICLE_REGISTRY,
  getArticlesByCategory,
  getArticleBySlug,
  getRelatedArticles,
  searchArticles,
  type Article,
  type ArticleCategory,
} from './article_registry.js';

// ── ARTICLE_REGISTRY ─────────────────────────────────────────────────────────

describe('ARTICLE_REGISTRY', () => {
  it('contains exactly 8 articles', () => {
    assert.equal(ARTICLE_REGISTRY.length, 8);
  });

  it('includes what-is-aeo', () => {
    assert.ok(ARTICLE_REGISTRY.some((a) => a.id === 'what-is-aeo'));
  });

  it('includes how-health-score-works', () => {
    assert.ok(ARTICLE_REGISTRY.some((a) => a.id === 'how-health-score-works'));
  });

  it('includes what-is-fix-drift', () => {
    assert.ok(ARTICLE_REGISTRY.some((a) => a.id === 'what-is-fix-drift'));
  });

  it('includes understanding-confidence-scores', () => {
    assert.ok(ARTICLE_REGISTRY.some((a) => a.id === 'understanding-confidence-scores'));
  });

  it('includes reading-your-rankings', () => {
    assert.ok(ARTICLE_REGISTRY.some((a) => a.id === 'reading-your-rankings'));
  });

  it('includes shopify-seo-basics', () => {
    assert.ok(ARTICLE_REGISTRY.some((a) => a.id === 'shopify-seo-basics'));
  });

  it('includes wordpress-seo-basics', () => {
    assert.ok(ARTICLE_REGISTRY.some((a) => a.id === 'wordpress-seo-basics'));
  });

  it('includes getting-started-guide', () => {
    assert.ok(ARTICLE_REGISTRY.some((a) => a.id === 'getting-started-guide'));
  });

  it('all articles have required fields', () => {
    for (const a of ARTICLE_REGISTRY) {
      assert.ok(a.id, `missing id`);
      assert.ok(a.title, `missing title for ${a.id}`);
      assert.ok(a.slug, `missing slug for ${a.id}`);
      assert.ok(a.category, `missing category for ${a.id}`);
      assert.ok(a.summary, `missing summary for ${a.id}`);
      assert.ok(a.content, `missing content for ${a.id}`);
      assert.ok(Array.isArray(a.helpful_for), `helpful_for not array for ${a.id}`);
    }
  });

  it('all articles have read_time_minutes', () => {
    for (const a of ARTICLE_REGISTRY) {
      assert.ok(typeof a.read_time_minutes === 'number', `missing read_time for ${a.id}`);
      assert.ok(a.read_time_minutes > 0, `read_time must be > 0 for ${a.id}`);
    }
  });

  it('all articles have non-empty content', () => {
    for (const a of ARTICLE_REGISTRY) {
      assert.ok(a.content.length > 100, `content too short for ${a.id}`);
    }
  });

  it('all article slugs are unique', () => {
    const slugs = ARTICLE_REGISTRY.map((a) => a.slug);
    assert.equal(new Set(slugs).size, slugs.length);
  });

  it('all article ids are unique', () => {
    const ids = ARTICLE_REGISTRY.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

// ── getArticlesByCategory ────────────────────────────────────────────────────

describe('getArticlesByCategory', () => {
  it('returns correct articles for understanding_vaeo', () => {
    const articles = getArticlesByCategory('understanding_vaeo');
    assert.ok(articles.length >= 3);
    for (const a of articles) {
      assert.equal(a.category, 'understanding_vaeo');
    }
  });

  it('returns correct articles for seo_basics', () => {
    const articles = getArticlesByCategory('seo_basics');
    assert.ok(articles.length >= 2);
    for (const a of articles) {
      assert.equal(a.category, 'seo_basics');
    }
  });

  it('returns correct articles for aeo', () => {
    const articles = getArticlesByCategory('aeo');
    assert.ok(articles.length >= 1);
    for (const a of articles) {
      assert.equal(a.category, 'aeo');
    }
  });

  it('returns [] for empty category', () => {
    assert.deepEqual(getArticlesByCategory('' as ArticleCategory), []);
  });

  it('returns [] for unknown category', () => {
    assert.deepEqual(getArticlesByCategory('nonexistent' as ArticleCategory), []);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getArticlesByCategory(null as any));
  });
});

// ── getArticleBySlug ─────────────────────────────────────────────────────────

describe('getArticleBySlug', () => {
  it('returns article when found', () => {
    const article = getArticleBySlug('what-is-aeo');
    assert.ok(article !== null);
    assert.equal(article!.id, 'what-is-aeo');
  });

  it('returns null when not found', () => {
    assert.equal(getArticleBySlug('nonexistent-slug'), null);
  });

  it('returns null for empty string', () => {
    assert.equal(getArticleBySlug(''), null);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getArticleBySlug(null as any));
  });
});

// ── getRelatedArticles ───────────────────────────────────────────────────────

describe('getRelatedArticles', () => {
  it('returns same category articles', () => {
    const related = getRelatedArticles('how-health-score-works', 10);
    assert.ok(related.length > 0);
    for (const a of related) {
      assert.equal(a.category, 'understanding_vaeo');
    }
  });

  it('excludes current article', () => {
    const related = getRelatedArticles('how-health-score-works', 10);
    assert.ok(!related.some((a) => a.id === 'how-health-score-works'));
  });

  it('respects limit', () => {
    const related = getRelatedArticles('how-health-score-works', 1);
    assert.ok(related.length <= 1);
  });

  it('returns [] for unknown article_id', () => {
    assert.deepEqual(getRelatedArticles('nonexistent', 5), []);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getRelatedArticles(null as any, null as any));
  });
});

// ── searchArticles ───────────────────────────────────────────────────────────

describe('searchArticles', () => {
  it('finds by title match', () => {
    const results = searchArticles('Answer Engine');
    assert.ok(results.length > 0);
    assert.ok(results.some((a) => a.id === 'what-is-aeo'));
  });

  it('finds by summary match', () => {
    const results = searchArticles('severity');
    assert.ok(results.length > 0);
    assert.ok(results.some((a) => a.id === 'how-health-score-works'));
  });

  it('is case-insensitive', () => {
    const lower = searchArticles('answer engine');
    const upper = searchArticles('ANSWER ENGINE');
    assert.equal(lower.length, upper.length);
  });

  it('returns [] for empty query', () => {
    assert.deepEqual(searchArticles(''), []);
  });

  it('returns [] for whitespace query', () => {
    assert.deepEqual(searchArticles('   '), []);
  });

  it('returns [] for no matches', () => {
    assert.deepEqual(searchArticles('xyznonexistent123'), []);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => searchArticles(null as any));
  });
});
