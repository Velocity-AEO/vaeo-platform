/**
 * tools/security/rate_limiter.ts
 *
 * Sliding window rate limiter with injectable store.
 * Fail-open on store errors — never blocks legitimate traffic.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  window_ms:    number;
  max_requests: number;
  key_prefix:   string;
}

export interface RateLimitResult {
  allowed:   boolean;
  remaining: number;
  reset_at:  string;
  key:       string;
}

export interface RateLimitStore {
  get(key: string): Promise<number | null>;
  set(key: string, value: number, ttl_ms: number): Promise<void>;
  increment(key: string, ttl_ms: number): Promise<number>;
}

// ── Default presets ───────────────────────────────────────────────────────────

export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  api_general: { window_ms: 60_000, max_requests: 100, key_prefix: 'rl:api'    },
  api_auth:    { window_ms: 60_000, max_requests: 10,  key_prefix: 'rl:auth'   },
  api_crawl:   { window_ms: 60_000, max_requests: 5,   key_prefix: 'rl:crawl'  },
  api_export:  { window_ms: 60_000, max_requests: 20,  key_prefix: 'rl:export' },
};

// ── checkRateLimit ────────────────────────────────────────────────────────────

export async function checkRateLimit(
  identifier: string,
  config:     RateLimitConfig,
  store:      RateLimitStore,
): Promise<RateLimitResult> {
  const key      = `${config.key_prefix}:${identifier}`;
  const reset_at = new Date(Date.now() + config.window_ms).toISOString();

  try {
    const count = await store.increment(key, config.window_ms);
    const remaining = Math.max(0, config.max_requests - count);
    const allowed   = count <= config.max_requests;
    return { allowed, remaining, reset_at, key };
  } catch {
    // Fail-open: store unavailable → allow request
    return { allowed: true, remaining: config.max_requests, reset_at, key };
  }
}

// ── createInMemoryStore ───────────────────────────────────────────────────────

interface StoreEntry { value: number; expires_at: number }

export function createInMemoryStore(): RateLimitStore {
  const map = new Map<string, StoreEntry>();

  function isExpired(entry: StoreEntry): boolean {
    return Date.now() > entry.expires_at;
  }

  function prune() {
    for (const [k, v] of map) {
      if (isExpired(v)) map.delete(k);
    }
  }

  return {
    async get(key) {
      prune();
      const entry = map.get(key);
      if (!entry || isExpired(entry)) return null;
      return entry.value;
    },

    async set(key, value, ttl_ms) {
      map.set(key, { value, expires_at: Date.now() + ttl_ms });
    },

    async increment(key, ttl_ms) {
      prune();
      const existing = map.get(key);
      if (!existing || isExpired(existing)) {
        map.set(key, { value: 1, expires_at: Date.now() + ttl_ms });
        return 1;
      }
      existing.value++;
      return existing.value;
    },
  };
}
