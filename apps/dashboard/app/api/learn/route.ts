import { NextRequest, NextResponse } from 'next/server';
import {
  getArticlesByCategory,
  searchArticles,
  ARTICLE_REGISTRY,
  type ArticleCategory,
} from '@tools/learning_center/article_registry.js';

/**
 * GET /api/learn
 * Public — no auth required.
 * Query: ?category={category} or ?q={query}
 * Cache-Control: 1 day
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const q = searchParams.get('q');

    let articles;
    if (q) {
      articles = searchArticles(q);
    } else if (category) {
      articles = getArticlesByCategory(category as ArticleCategory);
    } else {
      articles = ARTICLE_REGISTRY;
    }

    return NextResponse.json(
      { articles },
      { headers: { 'Cache-Control': 'public, max-age=86400' } },
    );
  } catch {
    return NextResponse.json({ articles: [] }, { status: 500 });
  }
}
