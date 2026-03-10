import { NextRequest, NextResponse } from 'next/server';
import { getMainThemeId, readThemeLiquid, writeThemeLiquid } from '@/lib/shopify-admin';

const IS_MOCK = process.env.APPLY_FIX_MOCK === 'true';

const TITLE_REGEX = /<title>[^<]*<\/title>/i;

async function rollbackTitleFix(originalTitle: string): Promise<void> {
  const themeId = await getMainThemeId();
  const current = await readThemeLiquid(themeId);

  if (!TITLE_REGEX.test(current)) throw new Error('<title> tag not found in layout/theme.liquid');

  const restored = current.replace(TITLE_REGEX, `<title>${originalTitle}</title>`);
  if (restored === current) throw new Error('Title already matches original — no change needed');

  await writeThemeLiquid(themeId, restored);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (IS_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return NextResponse.json({ ok: true, mock: true });
  }

  let original_title: string;
  try {
    const body = await req.json() as { original_title?: string };
    if (!body.original_title?.trim()) throw new Error('original_title is required');
    original_title = body.original_title.trim();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  try {
    await rollbackTitleFix(original_title);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
