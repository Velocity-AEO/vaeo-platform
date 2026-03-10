import type { Metadata } from 'next';

interface Props {
  params: Promise<{ siteId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteId } = await params;

  // Fetch verification data server-side for OG tags.
  // Use internal URL for server-side fetch during build/SSR.
  let domain = 'this site';
  let score  = 0;
  let grade  = '';

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
                 ?? process.env.VERCEL_URL
                   ? `https://${process.env.VERCEL_URL}`
                   : 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/verify/${siteId}`, {
      next: { revalidate: 300 },
    });
    if (res.ok) {
      const data = await res.json();
      domain = data.domain ?? domain;
      score  = data.health_score ?? 0;
      grade  = data.grade ?? '';
    }
  } catch {
    // Non-critical — use defaults
  }

  const title       = `${domain} — Velocity Verified (Grade ${grade || '?'})`;
  const description = `${domain} scores ${score}/100 on the Velocity AEO health check. Page titles, meta descriptions, structured data, and more — verified.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type:     'website',
      siteName: 'Velocity AEO',
    },
    twitter: {
      card:        'summary_large_image',
      title,
      description,
    },
  };
}

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
