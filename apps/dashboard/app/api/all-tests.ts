/**
 * app/api/all-tests.ts
 *
 * Test entry point — imports all handler test files so node:test collects them
 * in a single run. Static imports resolve [siteId] as a literal directory name,
 * bypassing node's glob expansion of bracket characters in --test arguments.
 */

import './onboarding/shopify/handler.test.ts';
import './sites/[siteId]/health/handler.test.ts';
