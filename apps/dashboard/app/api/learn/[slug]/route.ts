import { NextRequest, NextResponse } from 'next/server';
import {
  getArticleBySlug,
  getRelatedArticles,
} from '@tools/learning_center/article_registry.js';

/**
 * GET /api/learn/{slug}
 * Public — no auth required.
 * Returns single article + related articles.
 * Cache-Control: 1 day
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const article = getArticleBySlug(slug);
    if (!article) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const related = getRelatedArticles(article.id, 3);

    return NextResponse.json(
      { article, related },
      { headers: { 'Cache-Control': 'public, max-age=86400' } },
    );
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
