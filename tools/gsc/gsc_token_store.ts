/**
 * tools/gsc/gsc_token_store.ts
 *
 * GSC OAuth token storage — upserts into sites.extra_data.gsc_token.
 * Injectable DB for tests. Non-fatal: errors are swallowed.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GSCTokenRecord {
  site_id:        string;
  access_token:   string;
  refresh_token?: string;
  expires_at:     string;
  scope:          string;
  created_at:     string;
}

export interface TokenStoreDb {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        single(): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
    update(data: Record<string, unknown>): {
      eq(col: string, val: string): Promise<{ error: unknown }>;
    };
  };
}

// ── Store token ───────────────────────────────────────────────────────────────

export async function storeGSCToken(
  record: GSCTokenRecord,
  db:     TokenStoreDb,
): Promise<void> {
  try {
    // Read current extra_data
    const { data: site } = await db
      .from('sites')
      .select('extra_data')
      .eq('id', record.site_id)
      .single();

    const extraData = (site?.extra_data as Record<string, unknown>) ?? {};
    extraData.gsc_token = record;

    await db
      .from('sites')
      .update({ extra_data: extraData })
      .eq('id', record.site_id);
  } catch { /* non-fatal */ }
}

// ── Get token ─────────────────────────────────────────────────────────────────

export async function getGSCToken(
  siteId: string,
  db:     TokenStoreDb,
): Promise<GSCTokenRecord | null> {
  try {
    const { data: site } = await db
      .from('sites')
      .select('extra_data')
      .eq('id', siteId)
      .single();

    if (!site) return null;
    const extraData = site.extra_data as Record<string, unknown> | null;
    if (!extraData?.gsc_token) return null;

    const token = extraData.gsc_token as GSCTokenRecord;

    // Check expiry (with 5-minute buffer)
    const expiresAt = new Date(token.expires_at).getTime();
    const buffer    = 5 * 60 * 1000;
    if (Date.now() > expiresAt - buffer) return null;

    return token;
  } catch {
    return null;
  }
}

// ── Connection check ──────────────────────────────────────────────────────────

export async function isGSCConnected(
  siteId: string,
  db:     TokenStoreDb,
): Promise<boolean> {
  const token = await getGSCToken(siteId, db);
  return token !== null;
}

// ── OAuth URL builder ─────────────────────────────────────────────────────────

const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

export function buildGSCAuthUrl(
  clientId:    string,
  redirectUri: string,
  state:       string,
): string {
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         GSC_SCOPE,
    state,
    access_type:   'offline',
    prompt:        'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ── Code exchange ─────────────────────────────────────────────────────────────

export async function exchangeGSCCode(
  code:         string,
  clientId:     string,
  clientSecret: string,
  redirectUri:  string,
  options?: { fetch?: typeof fetch },
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const f = options?.fetch ?? globalThis.fetch;

  const body = new URLSearchParams({
    code,
    client_id:     clientId,
    client_secret: clientSecret,
    redirect_uri:  redirectUri,
    grant_type:    'authorization_code',
  });

  const res = await f('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json() as {
    access_token:  string;
    refresh_token: string;
    expires_in:    number;
  };

  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_in:    data.expires_in,
  };
}
