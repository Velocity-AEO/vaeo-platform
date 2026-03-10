import { NextResponse } from 'next/server';
import { getMainThemeId, readThemeLiquid, writeThemeLiquid } from '@/lib/shopify-admin';

const IS_MOCK = process.env.APPLY_FIX_MOCK === 'true';

const PROPOSED_TITLE = 'Luxury Foam Pool Floats & Beach Accessories | Cococabana Life';
const MOCK_ORIGINAL = 'Cococabana Life | Luxury Pool Floats';

const TITLE_REGEX = /<title>[^<]*<\/title>/i;

async function applyTitleFix(): Promise<{ original_title: string }> {
  const themeId = await getMainThemeId();
  const original = await readThemeLiquid(themeId);

  const match = original.match(TITLE_REGEX);
  if (!match) throw new Error('<title> tag not found in layout/theme.liquid');

  const original_title = match[0].replace(/<\/?title>/gi, '').trim();
  if (original_title === PROPOSED_TITLE) throw new Error('Title already matches proposed value — no change needed');

  const patched = original.replace(TITLE_REGEX, `<title>${PROPOSED_TITLE}</title>`);
  await writeThemeLiquid(themeId, patched);

  return { original_title };
}

export async function POST(): Promise<NextResponse> {
  if (IS_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return NextResponse.json({ ok: true, mock: true, original_title: MOCK_ORIGINAL });
  }

  try {
    const { original_title } = await applyTitleFix();
    return NextResponse.json({ ok: true, original_title });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
