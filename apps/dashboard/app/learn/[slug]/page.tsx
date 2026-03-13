'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

/**
 * Individual article page — public, no auth required.
 * Never crashes.
 */

interface Article {
  id: string;
  title: string;
  slug: string;
  category: string;
  summary: string;
  content: string;
  related_feature: string | null;
  read_time_minutes: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  getting_started: 'Getting Started',
  seo_basics: 'SEO Basics',
  aeo: 'Answer Engine Optimization',
  understanding_vaeo: 'Understanding VAEO',
  agency: 'Agency',
  troubleshooting: 'Troubleshooting',
};

const FEATURE_LINKS: Record<string, { label: string; href: string }> = {
  'aeo-score': { label: 'View your AEO Score', href: '/client' },
  'health-score': { label: 'View your Health Score', href: '/client' },
  'drift-scanner': { label: 'View Fix Stability Monitor', href: '/client' },
  'confidence-display': { label: 'View Fix History', href: '/client' },
  'rankings': { label: 'View your Rankings', href: '/client' },
};

export default function ArticlePage() {
  const params = useParams();
  const slug = typeof params?.slug === 'string' ? params.slug : '';

  const [article, setArticle] = useState<Article | null>(null);
  const [related, setRelated] = useState<Article[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);

  if (!loaded && slug) {
    setLoaded(true);
    fetch(`/api/learn/${encodeURIComponent(slug)}`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); return null; }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setArticle(data.article ?? null);
        setRelated((data.related ?? []).slice(0, 3));
        if (!data.article) setNotFound(true);
      })
      .catch(() => setNotFound(true));
  }

  if (notFound) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link href="/learn" className="text-sm text-blue-600 hover:underline">
          ← Learning Center
        </Link>
        <h1 className="text-xl font-bold text-slate-800 mt-6">Article Not Found</h1>
        <p className="text-slate-500 mt-2">
          The article you are looking for does not exist.
        </p>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    );
  }

  const featureLink = article.related_feature
    ? FEATURE_LINKS[article.related_feature] ?? null
    : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* Back link */}
      <Link href="/learn" className="text-sm text-blue-600 hover:underline">
        ← Learning Center
      </Link>

      {/* Category breadcrumb */}
      <p className="text-xs text-slate-400 mt-4 uppercase tracking-wide">
        {CATEGORY_LABELS[article.category] ?? article.category}
      </p>

      {/* Title */}
      <h1 className="text-2xl font-bold text-slate-800 mt-2">{article.title}</h1>

      {/* Read time */}
      <p className="text-xs text-slate-400 mt-1">
        {article.read_time_minutes} min read
      </p>

      {/* Content */}
      <div className="mt-6 prose prose-slate prose-sm max-w-none">
        {renderMarkdown(article.content)}
      </div>

      {/* Contextual CTA */}
      {featureLink && (
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <Link
            href={featureLink.href}
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            {featureLink.label} →
          </Link>
          <p className="text-xs text-blue-500 mt-1">See this in your dashboard</p>
        </div>
      )}

      {/* Related articles */}
      {related.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Related Articles
          </h2>
          <div className="space-y-2">
            {related.map((r) => (
              <Link
                key={r.id}
                href={`/learn/${r.slug}`}
                className="block p-3 border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
              >
                <h3 className="text-sm font-medium text-slate-700">{r.title}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{r.read_time_minutes} min read</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Simple markdown-to-JSX renderer for article content. */
function renderMarkdown(md: string): React.ReactNode {
  try {
    const lines = md.split('\n');
    const elements: React.ReactNode[] = [];
    let key = 0;

    for (const line of lines) {
      key++;
      if (line.startsWith('### ')) {
        elements.push(<h3 key={key} className="text-base font-semibold text-slate-700 mt-5 mb-2">{line.slice(4)}</h3>);
      } else if (line.startsWith('## ')) {
        elements.push(<h2 key={key} className="text-lg font-bold text-slate-800 mt-6 mb-2">{line.slice(3)}</h2>);
      } else if (/^\d+\.\s/.test(line)) {
        elements.push(<p key={key} className="text-sm text-slate-600 ml-4 mb-1">{renderInline(line)}</p>);
      } else if (line.startsWith('- **')) {
        elements.push(<p key={key} className="text-sm text-slate-600 ml-4 mb-1">{renderInline(line.slice(2))}</p>);
      } else if (line.startsWith('- ')) {
        elements.push(<p key={key} className="text-sm text-slate-600 ml-4 mb-1">• {renderInline(line.slice(2))}</p>);
      } else if (line.trim() === '') {
        // skip blank lines
      } else {
        elements.push(<p key={key} className="text-sm text-slate-600 mb-2">{renderInline(line)}</p>);
      }
    }
    return <>{elements}</>;
  } catch {
    return <p className="text-sm text-slate-600">{md}</p>;
  }
}

function renderInline(text: string): React.ReactNode {
  try {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-slate-700">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      return part;
    });
  } catch {
    return text;
  }
}
