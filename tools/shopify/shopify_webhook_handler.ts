/**
 * tools/shopify/shopify_webhook_handler.ts
 *
 * Shopify webhook router. Routes incoming webhook topics to the correct handler.
 * All handlers are injectable for testing.
 *
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WebhookHandlerDeps {
  handleAppUninstalled?:   (body: unknown, shop_domain: string) => Promise<void>;
  handleDataRequest?:      (body: unknown, shop_domain: string) => Promise<void>;
  handleCustomerRedact?:   (body: unknown, shop_domain: string) => Promise<void>;
  handleShopRedact?:       (body: unknown, shop_domain: string) => Promise<void>;
  markSiteUninstalled?:    (shop_domain: string) => Promise<void>;
  cancelSubscription?:     (shop_domain: string, subscription_id: string) => Promise<boolean>;
  logFn?:                  (msg: string) => void;
}

// ── Default handlers ──────────────────────────────────────────────────────────

async function defaultHandleAppUninstalled(
  body:        unknown,
  shop_domain: string,
  deps:        WebhookHandlerDeps,
): Promise<void> {
  const log = deps.logFn ?? ((msg: string) => process.stderr.write(msg + '\n'));
  try {
    log(`[SHOPIFY_UNINSTALL] shop=${shop_domain}`);

    if (deps.markSiteUninstalled) {
      await deps.markSiteUninstalled(shop_domain);
    }

    // Data is preserved for 30 days (GDPR compliance)
    // Actual deletion is triggered by the shop/redact GDPR webhook
    log(`[SHOPIFY_UNINSTALL] site marked uninstalled; data preserved 30 days for shop=${shop_domain}`);
  } catch {
    // non-fatal
  }
}

async function defaultHandleDataRequest(
  _body:       unknown,
  shop_domain: string,
  deps:        WebhookHandlerDeps,
): Promise<void> {
  const log = deps.logFn ?? ((msg: string) => process.stderr.write(msg + '\n'));
  log(`[GDPR] data_request received for shop=${shop_domain}`);
}

async function defaultHandleCustomerRedact(
  _body:       unknown,
  shop_domain: string,
  deps:        WebhookHandlerDeps,
): Promise<void> {
  const log = deps.logFn ?? ((msg: string) => process.stderr.write(msg + '\n'));
  log(`[GDPR] customer_redact received for shop=${shop_domain}`);
}

async function defaultHandleShopRedact(
  _body:       unknown,
  shop_domain: string,
  deps:        WebhookHandlerDeps,
): Promise<void> {
  const log = deps.logFn ?? ((msg: string) => process.stderr.write(msg + '\n'));
  log(`[GDPR] shop_redact received for shop=${shop_domain}`);
}

// ── routeShopifyWebhook ───────────────────────────────────────────────────────

export async function routeShopifyWebhook(
  topic:       string,
  body:        unknown,
  shop_domain: string,
  deps?:       WebhookHandlerDeps,
): Promise<void> {
  const d   = deps ?? {};
  const log = d.logFn ?? ((msg: string) => process.stderr.write(msg + '\n'));

  try {
    switch (topic) {
      case 'app/uninstalled': {
        if (d.handleAppUninstalled) {
          await d.handleAppUninstalled(body, shop_domain);
        } else {
          await defaultHandleAppUninstalled(body, shop_domain, d);
        }
        break;
      }
      case 'customers/data_request': {
        if (d.handleDataRequest) {
          await d.handleDataRequest(body, shop_domain);
        } else {
          await defaultHandleDataRequest(body, shop_domain, d);
        }
        break;
      }
      case 'customers/redact': {
        if (d.handleCustomerRedact) {
          await d.handleCustomerRedact(body, shop_domain);
        } else {
          await defaultHandleCustomerRedact(body, shop_domain, d);
        }
        break;
      }
      case 'shop/redact': {
        if (d.handleShopRedact) {
          await d.handleShopRedact(body, shop_domain);
        } else {
          await defaultHandleShopRedact(body, shop_domain, d);
        }
        break;
      }
      default: {
        log(`[SHOPIFY_WEBHOOK] unknown topic: ${topic} for shop=${shop_domain}`);
        break;
      }
    }
  } catch {
    // never throws
  }
}
