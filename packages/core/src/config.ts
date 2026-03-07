/**
 * packages/core/src/config.ts
 *
 * Single source of truth for all environment variable access.
 *
 * Rules:
 *   - Never throws at module load time — only when a required var is missing
 *     AND the caller actually accesses it.
 *   - `config` is a Proxy — full loadConfig() runs on first property access.
 *   - Narrow accessors (getConfig, getRedisConfig, getR2Config) read ONLY the
 *     specific env vars they need, so callers don't require unrelated vars.
 *   - Pure ESM — no require(), no CJS patterns.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VaeoConfig {
  supabase: {
    url:            string;
    anonKey:        string;
    serviceRoleKey: string;
  };
  redis: {
    url: string;
  };
  upstash: {
    redisRestUrl:   string;
    redisRestToken: string;
  };
  anthropic: {
    apiKey: string;
  };
  r2: {
    accountId:       string;
    accessKeyId:     string;
    secretAccessKey: string;
    bucketName:      string;
    endpoint:        string;
  };
  shopify: {
    pocAccessToken: string;
    pocStoreUrl:    string;
  };
  wordpress: {
    pocUrl:         string;
    pocUsername:    string;
    pocAppPassword: string;
  };
  google: {
    apiKey: string;
  };
  semrush: {
    apiKey: string | null;
  };
  sendgrid: {
    apiKey: string | null;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function required(key: string): string {
  const value = process.env[key];
  if (!value?.trim()) {
    throw new Error(
      `[vaeo/config] Missing required environment variable: ${key}\n` +
      `  Ensure it is set in Doppler (or .env for local dev).`,
    );
  }
  return value.trim();
}

function optional(key: string): string | null {
  const value = process.env[key];
  return value?.trim() || null;
}

// ── Full config loader ────────────────────────────────────────────────────────

function loadConfig(): VaeoConfig {
  return {
    supabase: {
      url:            required('SUPABASE_URL'),
      anonKey:        required('SUPABASE_ANON_KEY'),
      serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    },
    redis: {
      url: required('REDIS_URL'),
    },
    upstash: {
      redisRestUrl:   required('UPSTASH_REDIS_REST_URL'),
      redisRestToken: required('UPSTASH_REDIS_REST_TOKEN'),
    },
    anthropic: {
      apiKey: required('ANTHROPIC_API_KEY'),
    },
    r2: {
      accountId:       required('R2_ACCOUNT_ID'),
      accessKeyId:     required('R2_ACCESS_KEY_ID'),
      secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
      bucketName:      required('R2_BUCKET_NAME'),
      endpoint:        required('R2_ENDPOINT'),
    },
    shopify: {
      pocAccessToken: required('SHOPIFY_POC_ACCESS_TOKEN'),
      pocStoreUrl:    required('SHOPIFY_POC_STORE_URL'),
    },
    wordpress: {
      pocUrl:         required('WP_POC_URL'),
      pocUsername:    required('WP_POC_USERNAME'),
      pocAppPassword: required('WP_POC_APP_PASSWORD'),
    },
    google: {
      apiKey: required('GOOGLE_API_KEY'),
    },
    semrush: {
      apiKey: optional('SEMRUSH_API_KEY'),
    },
    sendgrid: {
      apiKey: optional('SENDGRID_API_KEY'),
    },
  };
}

// ── Lazy singleton ────────────────────────────────────────────────────────────

let _config: VaeoConfig | undefined;

function lazyConfig(): VaeoConfig {
  if (!_config) _config = loadConfig();
  return _config;
}

/**
 * Proxy-based lazy config object. Importing this module never triggers
 * loadConfig() — it only runs when a property is first accessed.
 */
export const config = new Proxy({} as VaeoConfig, {
  get(_target, prop: string | symbol) {
    return (lazyConfig() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// ── Narrow accessors ──────────────────────────────────────────────────────────

/**
 * Returns Supabase connection credentials.
 * Reads ONLY SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — does not trigger
 * the full loadConfig(), so callers don't need REDIS_URL etc.
 */
export function getConfig(): { supabaseUrl: string; supabaseServiceKey: string } {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url?.trim()) {
    throw new Error(
      '[vaeo/config] Missing required environment variable: SUPABASE_URL\n' +
      '  Ensure it is set in Doppler (or .env for local dev).',
    );
  }
  if (!key?.trim()) {
    throw new Error(
      '[vaeo/config] Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY\n' +
      '  Ensure it is set in Doppler (or .env for local dev).',
    );
  }
  return { supabaseUrl: url.trim(), supabaseServiceKey: key.trim() };
}

/**
 * Returns Redis connection credentials.
 * Reads ONLY REDIS_URL + UPSTASH_REDIS_REST_TOKEN.
 */
export function getRedisConfig(): { url: string; token: string } {
  const url   = process.env['REDIS_URL'];
  const token = process.env['UPSTASH_REDIS_REST_TOKEN'];
  if (!url?.trim()) {
    throw new Error(
      '[vaeo/config] Missing required environment variable: REDIS_URL\n' +
      '  Ensure it is set in Doppler (or .env for local dev).',
    );
  }
  if (!token?.trim()) {
    throw new Error(
      '[vaeo/config] Missing required environment variable: UPSTASH_REDIS_REST_TOKEN\n' +
      '  Ensure it is set in Doppler (or .env for local dev).',
    );
  }
  return { url: url.trim(), token: token.trim() };
}

/**
 * Returns Cloudflare R2 credentials.
 * Reads ONLY the five R2_* env vars.
 */
export function getR2Config(): {
  accountId:       string;
  accessKeyId:     string;
  secretAccessKey: string;
  bucketName:      string;
  endpoint:        string;
} {
  const accountId       = process.env['R2_ACCOUNT_ID'];
  const accessKeyId     = process.env['R2_ACCESS_KEY_ID'];
  const secretAccessKey = process.env['R2_SECRET_ACCESS_KEY'];
  const bucketName      = process.env['R2_BUCKET_NAME'];
  const endpoint        = process.env['R2_ENDPOINT'];

  if (!accountId?.trim())       throw new Error('[vaeo/config] Missing required environment variable: R2_ACCOUNT_ID');
  if (!accessKeyId?.trim())     throw new Error('[vaeo/config] Missing required environment variable: R2_ACCESS_KEY_ID');
  if (!secretAccessKey?.trim()) throw new Error('[vaeo/config] Missing required environment variable: R2_SECRET_ACCESS_KEY');
  if (!bucketName?.trim())      throw new Error('[vaeo/config] Missing required environment variable: R2_BUCKET_NAME');
  if (!endpoint?.trim())        throw new Error('[vaeo/config] Missing required environment variable: R2_ENDPOINT');

  return {
    accountId:       accountId.trim(),
    accessKeyId:     accessKeyId.trim(),
    secretAccessKey: secretAccessKey.trim(),
    bucketName:      bucketName.trim(),
    endpoint:        endpoint.trim(),
  };
}
