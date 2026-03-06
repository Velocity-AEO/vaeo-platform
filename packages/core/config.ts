/**
 * packages/core/config.ts
 *
 * Single source of truth for all environment variable access.
 * No other file in the codebase may call process.env directly —
 * import the `config` export from this module instead.
 *
 * Reads and validates all required variables at module load time.
 * Throws a descriptive error naming the exact missing variable.
 *
 * All secrets are managed through Doppler.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function required(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(
      `[vaeo/config] Missing required environment variable: ${key}\n` +
      `  Ensure it is set in Doppler (or .env for local dev).`,
    );
  }
  return value.trim();
}

function optional(key: string, fallback: string): string {
  const value = process.env[key];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

function optionalOrNull(key: string): string | null {
  const value = process.env[key];
  return value && value.trim() !== '' ? value.trim() : null;
}

// ── Config type ───────────────────────────────────────────────────────────────

export interface VaeoConfig {
  // Supabase
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
  };

  // Upstash Redis — REST API (for @upstash/redis SDK)
  upstash: {
    redisRestUrl: string;
    redisRestToken: string;
  };

  // Redis — RESP protocol endpoint (for BullMQ / ioredis)
  redis: {
    /** Full Redis RESP URL, e.g. rediss://xxx.upstash.io:6380 */
    url: string;
    /** Upstash token used as the ioredis password. */
    token: string;
  };

  // Cloudflare R2
  r2: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
    endpoint: string;
  };

  // Shopify
  shopify: {
    storeDomain: string;
    storefrontDomain: string;
    adminApiToken: string;
    apiVersion: string;
  };

  // WordPress
  wordpress: {
    siteUrl: string;
    appUser: string;
    appPassword: string;
  };

  // Anthropic
  anthropic: {
    apiKey: string;
    model: string;
  };

  // OpenAI
  openai: {
    apiKey: string;
    model: string;
  };

  // Google — PageSpeed Insights
  googlePsi: {
    apiKey: string;
  };

  // Google — Search Console
  googleSearchConsole: {
    applicationCredentials: string;
    siteUrl: string;
  };

  // Google — Indexing API
  googleIndexing: {
    serviceAccountEmail: string;
    serviceAccountKeyPath: string;
  };

  // Semrush
  semrush: {
    apiKey: string;
  };

  // Postmark
  postmark: {
    serverToken: string;
    fromAddress: string;
  };

  // Sentry
  sentry: {
    dsn: string;
    environment: string;
  };
}

// ── Load and validate ─────────────────────────────────────────────────────────

function loadConfig(): VaeoConfig {
  return {
    supabase: {
      url:             required('SUPABASE_URL'),
      anonKey:         required('SUPABASE_ANON_KEY'),
      serviceRoleKey:  required('SUPABASE_SERVICE_ROLE_KEY'),
    },

    upstash: {
      redisRestUrl:   required('UPSTASH_REDIS_REST_URL'),
      redisRestToken: required('UPSTASH_REDIS_REST_TOKEN'),
    },

    redis: {
      url:   required('REDIS_URL'),
      token: required('REDIS_TOKEN'),
    },

    r2: {
      accountId:       required('R2_ACCOUNT_ID'),
      accessKeyId:     required('R2_ACCESS_KEY_ID'),
      secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
      bucketName:      optional('R2_BUCKET_NAME', 'vaeo-artifacts'),
      endpoint:        required('R2_ENDPOINT'),
    },

    shopify: {
      storeDomain:      required('SHOPIFY_STORE_DOMAIN'),
      storefrontDomain: required('SHOPIFY_STOREFRONT_DOMAIN'),
      adminApiToken:    required('SHOPIFY_ADMIN_API_TOKEN'),
      apiVersion:       optional('SHOPIFY_API_VERSION', '2025-01'),
    },

    wordpress: {
      siteUrl:     required('WP_SITE_URL'),
      appUser:     required('WP_APP_USER'),
      appPassword: required('WP_APP_PASSWORD'),
    },

    anthropic: {
      apiKey: required('ANTHROPIC_API_KEY'),
      model:  optional('ANTHROPIC_MODEL', 'claude-sonnet-4-6'),
    },

    openai: {
      apiKey: required('OPENAI_API_KEY'),
      model:  optional('OPENAI_MODEL', 'gpt-4o'),
    },

    googlePsi: {
      apiKey: required('GOOGLE_PSI_API_KEY'),
    },

    googleSearchConsole: {
      applicationCredentials: required('GOOGLE_APPLICATION_CREDENTIALS'),
      siteUrl:                required('GSC_SITE_URL'),
    },

    googleIndexing: {
      serviceAccountEmail:   required('GOOGLE_INDEXING_SA_EMAIL'),
      serviceAccountKeyPath: required('GOOGLE_INDEXING_SA_KEY_PATH'),
    },

    semrush: {
      apiKey: required('SEMRUSH_API_KEY'),
    },

    postmark: {
      serverToken:  required('POSTMARK_SERVER_TOKEN'),
      fromAddress:  required('POSTMARK_FROM_ADDRESS'),
    },

    sentry: {
      dsn:         required('SENTRY_DSN'),
      environment: optional('SENTRY_ENVIRONMENT', 'production'),
    },
  };
}

// ── Singleton export ──────────────────────────────────────────────────────────

/**
 * Typed, validated configuration object.
 * Loaded once at module import time — throws immediately if any required
 * variable is absent so misconfigured deploys fail fast at startup.
 */
export const config: VaeoConfig = loadConfig();
