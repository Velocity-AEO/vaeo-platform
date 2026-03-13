'use client';

/**
 * Inline contextual help link that opens a Learning Center article.
 * Never crashes.
 */
export default function LearnMoreLink({
  article_slug,
  label,
}: {
  article_slug: string;
  label?: string;
}) {
  try {
    return (
      <a
        href={`/learn/${encodeURIComponent(article_slug)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-slate-400 hover:text-blue-500 transition-colors ml-2"
      >
        {label ?? '? What is this'}
      </a>
    );
  } catch {
    return null;
  }
}
