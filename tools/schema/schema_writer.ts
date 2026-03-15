/**
 * tools/schema/schema_writer.ts
 *
 * Writes valid JSON-LD to Shopify via metafields.
 *
 * Architecture:
 *   - Validates schemaJson before any API call
 *   - Writes to namespace="velocity_seo", key="schema_json", type="json"
 *   - GET existing metafield → PUT (update) or POST (create)
 *   - Injectable fetch for unit testing
 *   - Never throws — returns SchemaWriteResult
 *
 * API version: 2024-01
 */

import { validateSchema } from './schema_validator.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SchemaWriteInput {
  shopDomain:   string;
  accessToken:  string;
  resourceType: 'product' | 'collection' | 'page' | 'article' | 'blog';
  resourceId:   string;   // Shopify numeric ID
  schemaJson:   Record<string, unknown>;
}

export interface SchemaWriteResult {
  ok:           boolean;
  metafieldId?: string;
  error?:       string;
}

// ── Injectable fetch ──────────────────────────────────────────────────────────

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

let _fetchFn: FetchFn | undefined;

export function _injectFetch(fn: FetchFn): void {
  _fetchFn = fn;
}

export function _resetInjections(): void {
  _fetchFn = undefined;
}

function getFetch(): FetchFn {
  return _fetchFn ?? fetch;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseShopDomain(raw: string): string {
  return raw.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

function authHeaders(token: string): Record<string, string> {
  return {
    'X-Shopify-Access-Token': token,
    'Content-Type':           'application/json',
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function shopifyFetch(url: string, init: RequestInit): Promise<Response> {
  const res = await getFetch()(url, init);
  if (res.status === 429) {
    await sleep(500);
    return getFetch()(url, init);
  }
  return res;
}

/** Maps resourceType to Shopify metafield owner_resource value. */
const OWNER_RESOURCE: Record<SchemaWriteInput['resourceType'], string> = {
  product:    'product',
  collection: 'custom_collection',
  page:       'page',
  article:    'article',
  blog:       'blog',
};

interface ShopifyMetafieldBody {
  metafield?: { id: number; value: string; namespace?: string; key?: string };
  /** Some Shopify stores return the plural array format even on POST/PUT. */
  metafields?: Array<{ id: number; value: string; namespace?: string; key?: string }>;
}

/**
 * Extract metafield ID from a Shopify response.
 *
 * - Singular `{ metafield: { id } }`: accepted when namespace/key are absent
 *   (minimal API response); throws if they are present but don't match.
 * - Plural `{ metafields: [...] }`: only matches by namespace + key — no fallback.
 * - Returns null when ID cannot be found (triggers re-fetch path in writeSchema).
 */
function extractMetafieldId(body: ShopifyMetafieldBody, namespace: string, key: string): string | null {
  // Preferred: singular { metafield: { id } }
  if (body.metafield?.id) {
    const { namespace: ns, key: k } = body.metafield;
    if ((ns !== undefined && ns !== namespace) || (k !== undefined && k !== key)) {
      throw new Error(
        `Shopify returned metafield for wrong namespace/key: ` +
        `expected ${namespace}/${key}, got ${ns ?? '?'}/${k ?? '?'}`,
      );
    }
    return String(body.metafield.id);
  }
  // Fallback: plural { metafields: [...] } — must match by namespace/key exactly
  if (body.metafields) {
    const match = body.metafields.find(
      (m) => m.namespace === namespace && m.key === key,
    );
    if (match?.id) return String(match.id);
  }
  return null;
}

// ── writeSchema ───────────────────────────────────────────────────────────────

/**
 * Write JSON-LD schema to a Shopify resource metafield.
 *
 * 1. Validate schemaJson — return error immediately if invalid.
 * 2. GET existing velocity_seo/schema_json metafield.
 * 3. PUT (update) or POST (create) the metafield.
 * 4. Return { ok, metafieldId }.
 *
 * Never throws.
 */
export async function writeSchema(input: SchemaWriteInput): Promise<SchemaWriteResult> {
  try {
    // 1. Validate before any API call
    const validation = validateSchema(input.schemaJson);
    if (!validation.valid) {
      return {
        ok:    false,
        error: `Schema validation failed: ${validation.errors.join('; ')}`,
      };
    }

    const host          = normaliseShopDomain(input.shopDomain);
    const headers       = authHeaders(input.accessToken);
    const ownerResource = OWNER_RESOURCE[input.resourceType];
    const value         = JSON.stringify(input.schemaJson);

    // 2. GET existing metafield
    const getUrl = `https://${host}/admin/api/2024-01/metafields.json` +
      `?owner_id=${input.resourceId}&owner_resource=${ownerResource}&namespace=velocity_seo&key=schema_json`;

    const getRes  = await shopifyFetch(getUrl, { method: 'GET', headers });
    if (!getRes.ok) {
      return { ok: false, error: `GET metafields failed (${getRes.status})` };
    }
    const getBody = await getRes.json() as { metafields?: Array<{ id: number; value: string }> };
    const existing = getBody.metafields?.[0];

    let metafieldId: string;

    if (existing) {
      // 3a. PUT (update existing)
      const putUrl = `https://${host}/admin/api/2024-01/metafields/${existing.id}.json`;
      const putRes = await shopifyFetch(putUrl, {
        method:  'PUT',
        headers,
        body:    JSON.stringify({ metafield: { value } }),
      });
      if (!putRes.ok) {
        return { ok: false, error: `PUT metafield failed (${putRes.status})` };
      }
      const putBody = await putRes.json() as ShopifyMetafieldBody;
      const putId = extractMetafieldId(putBody, 'velocity_seo', 'schema_json');
      metafieldId = putId ?? String(existing.id);

    } else {
      // 3b. POST (create new) — use resource-scoped endpoint
      const postUrl = `https://${host}/admin/api/2024-01/${ownerResource}s/${input.resourceId}/metafields.json`;
      const postRes = await shopifyFetch(postUrl, {
        method:  'POST',
        headers,
        body:    JSON.stringify({
          metafield: {
            namespace:      'velocity_seo',
            key:            'schema_json',
            value,
            type:           'json',
          },
        }),
      });
      if (!postRes.ok) {
        return { ok: false, error: `POST metafield failed (${postRes.status})` };
      }
      const postBody = await postRes.json() as ShopifyMetafieldBody;
      const postId = extractMetafieldId(postBody, 'velocity_seo', 'schema_json');
      if (!postId) {
        // Verify creation by re-fetching
        const verifyRes = await shopifyFetch(getUrl, { method: 'GET', headers });
        if (verifyRes.ok) {
          const verifyBody = await verifyRes.json() as { metafields?: Array<{ id: number }> };
          const created = verifyBody.metafields?.[0];
          if (created?.id) {
            metafieldId = String(created.id);
          } else {
            return { ok: false, error: 'POST returned 200 but metafield not found on verify' };
          }
        } else {
          return { ok: false, error: 'POST returned 200 but could not verify metafield creation' };
        }
      } else {
        metafieldId = postId;
      }
    }

    return { ok: true, metafieldId };

  } catch (err) {
    return {
      ok:    false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
