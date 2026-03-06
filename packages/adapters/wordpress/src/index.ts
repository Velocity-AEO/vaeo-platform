/**
 * packages/adapters/wordpress/src/index.ts
 *
 * WordPress CMSAdapter — stub.
 *
 * The full WordPress adapter implementation is in the VAEO-shopify-safe POC
 * repo (src/adapters/wordpress/). Port it here as C1 when ready.
 *
 * This stub satisfies the CMSAdapter interface so the rollback-runner and
 * patch engine compile correctly. Every method throws until the real
 * implementation is ported.
 */

import type {
  CMSAdapter,
  PatchManifest,
  TemplateRef,
  UrlEntry,
} from '../../../../packages/core/types.js';

export class WordPressAdapter implements CMSAdapter {
  async fetch_state(_siteId: string): Promise<Record<string, unknown>> {
    throw new Error('[wordpress-adapter] Not yet implemented — port from VAEO-shopify-safe');
  }

  async apply_patch(_manifest: PatchManifest): Promise<string[]> {
    throw new Error('[wordpress-adapter] Not yet implemented — port from VAEO-shopify-safe');
  }

  async rollback(_manifest: PatchManifest): Promise<void> {
    throw new Error('[wordpress-adapter] Not yet implemented — port from VAEO-shopify-safe');
  }

  async list_templates(_siteId: string): Promise<TemplateRef[]> {
    throw new Error('[wordpress-adapter] Not yet implemented — port from VAEO-shopify-safe');
  }

  async list_urls(_siteId: string): Promise<UrlEntry[]> {
    throw new Error('[wordpress-adapter] Not yet implemented — port from VAEO-shopify-safe');
  }
}

export default WordPressAdapter;
