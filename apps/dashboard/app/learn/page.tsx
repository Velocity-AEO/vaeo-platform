'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * Learning Center home page — public, no auth required.
 * Never crashes.
 */

// Inline types to avoid bundler import issues
interface Article {
  id: string;
  title: string;
  slug: string;
  category: string;
  summary: string;
  read_time_minutes: number;
}

interface CategorySection {
  key: string;
  label: string;
}

const CATEGORIES: CategorySection[] = [
  { key: 'getting_started', label: 'Getting Started' },
  { key: 'understanding_vaeo', label: 'Understanding VAEO' },
  { key: 'seo_basics', label: 'SEO Basics' },
  { key: 'aeo', label: 'Answer Engine Optimization (AEO)' },
];

export default function LearnPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [searching, setSearching] = useState(false);

  // Load all articles on mount
  if (!loaded) {
    setLoaded(true);
    fetch('/api/learn')
      .then((r) => r.json())
      .then((data) => setArticles(data.articles ?? []))
      .catch(() => {});
  }

  function handleSearch(q: string) {
    setSearchQuery(q);
    setSearching(!!q.trim());
    if (!q.trim()) {
      fetch('/api/learn')
        .then((r) => r.json())
        .then((data) => setArticles(data.articles ?? []))
        .catch(() => {});
      return;
    }
    fetch(`/api/learn?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((data) => setArticles(data.articles ?? []))
      .catch(() => {});
  }

  function articlesByCategory(cat: string): Article[] {
    try {
      return articles.filter((a) => a.category === cat);
    } catch {
      return [];
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Header */}
      <h1 className="text-2xl font-bold text-slate-800">VAEO Learning Center</h1>
      <p className="text-slate-500 mt-1 mb-6">
        Everything you need to understand your SEO autopilot
      </p>

      {/* Search */}
      <div className="mb-8">
        <input
          type="text"
          placeholder="Search articles..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Search results mode */}
      {searching ? (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
            Search Results
          </h2>
          {articles.length === 0 ? (
            <p className="text-slate-400 text-sm">No articles found.</p>
          ) : (
            <div className="space-y-3">
              {articles.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Category sections */
        <div className="space-y-10">
          {CATEGORIES.map((cat) => {
            const catArticles = articlesByCategory(cat.key);
            if (catArticles.length === 0) return null;
            return (
              <section key={cat.key}>
                <h2 className="text-lg font-semibold text-slate-700 mb-3">
                  {cat.label}
                </h2>
                <div className="space-y-3">
                  {catArticles.map((a) => (
                    <ArticleCard key={a.id} article={a} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ArticleCard({ article }: { article: Article }) {
  return (
    <Link
      href={`/learn/${article.slug}`}
      className="block p-4 border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-800">{article.title}</h3>
          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{article.summary}</p>
        </div>
        <span className="text-xs text-slate-400 whitespace-nowrap">
          {article.read_time_minutes} min read
        </span>
      </div>
    </Link>
  );
}
