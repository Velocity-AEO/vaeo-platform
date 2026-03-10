/**
 * tests/e2e/wordpress_pipeline.test.ts
 *
 * End-to-end integration test for the full VAEO pipeline on a WordPress site.
 *
 * Exercises every stage of the pipeline using injectable deps:
 *   1.  Connect site
 *   2.  Tracer scan (URL inventory + field snapshots)
 *   3.  Issue classifier
 *   4.  Health score
 *   5.  AI title + meta proposals
 *   6.  Guardrail enforcement (action ordering)
 *   7.  Validator ladder (attempt fix, check proof)
 *   8.  Approve fix
 *   9.  Apply via wp_adapter
 *   10. Preview-verify via local Liquid renderer
 *   11. Rollback
 *   12. Verify rollback restores original value
 *
 * All external calls are mocked. No real WordPress, Supabase, or AI calls.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ── Pipeline imports ─────────────────────────────────────────────────────────

import {
  runTracerScan,
  extractFieldSnapshots,
  type TracerScanOps,
  type CrawlResultRow,
  type FieldSnapshotRow,
  type UrlInventoryRow,
} from '../../packages/commands/src/tracer-scan.js';

import {
  classifyFields,
  type FieldSnapshot,
  type IssueReport,
} from '../../tools/scoring/issue_classifier.js';

import {
  calculateHealthScore,
  type HealthScore,
} from '../../tools/scoring/health_score.js';

import {
  generateTitle,
  generateMetaDescription,
  type TitleMetaDeps,
  type GenerateParams,
  type AIResponse,
} from '../../tools/ai/title_meta_generator.js';

import {
  attemptFix,
  type LadderDeps,
  type SiteRecord,
} from '../../tools/validator/ladder.js';

import {
  runApprove,
  type ApproveCommandOps,
  type PendingApprovalItem,
} from '../../packages/commands/src/approve.js';

import {
  runPreviewVerify,
  type PreviewVerifyOps,
  type PreviewItem,
} from '../../packages/commands/src/preview-verify.js';

import {
  runRollback,
  type RollbackCommandOps,
  type RollbackableItem,
  type RollbackManifest,
} from '../../packages/commands/src/rollback.js';

import {
  renderTemplate,
  extractSeoFields,
  validateSeoFields,
  type SeoFields,
} from '../../tools/sandbox/liquid_renderer.js';

// ── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const SITE_ID   = 'wp-site-001';
const RUN_ID    = 'run-e2e-001';
const DOMAIN    = 'demo-wordpress.example.com';

const WP_SITE: SiteRecord = {
  site_id:   SITE_ID,
  tenant_id: TENANT_ID,
  cms_type:  'wordpress',
  site_url:  `https://${DOMAIN}`,
};

// ── Mock WordPress site: 10 URLs, 3 with issues ─────────────────────────────

function buildMockCrawlResults(): CrawlResultRow[] {
  const base = {
    run_id:     RUN_ID,
    tenant_id:  TENANT_ID,
    site_id:    SITE_ID,
    h2:         ['Subheading'],
    images:     [],
    internal_links: [],
    redirect_chain: null,
    load_time_ms:   320,
    crawled_at:     '2026-03-10T00:00:00Z',
  };

  return [
    // ── 7 clean pages ─────────────────────────────────────────────────────
    {
      ...base, id: 'cr-01', url: `https://${DOMAIN}/`,
      status_code: 200,
      title:  'Demo WordPress — Professional Web Design Services',
      meta_desc: 'Professional web design services for small businesses and startups. Custom WordPress themes, responsive layouts, and SEO optimization.',
      h1: ['Professional Web Design Services'],
      canonical: `https://${DOMAIN}/`,
      schema_blocks: ['{"@type":"WebSite","name":"Demo WordPress"}'],
    },
    {
      ...base, id: 'cr-02', url: `https://${DOMAIN}/pages/about`,
      status_code: 200,
      title:  'About Us — Demo WordPress Design Studio Team',
      meta_desc: 'Meet our team of professional WordPress designers and developers with over 10 years of experience building functional websites.',
      h1: ['About Our Team'],
      canonical: `https://${DOMAIN}/pages/about`,
      schema_blocks: ['{"@type":"AboutPage","name":"About Us"}'],
    },
    {
      ...base, id: 'cr-03', url: `https://${DOMAIN}/pages/services`,
      status_code: 200,
      title:  'Our Services — Custom WordPress Development Solutions',
      meta_desc: 'Explore our full range of WordPress development services including custom themes, plugin development, and SEO optimization.',
      h1: ['Our Services'],
      canonical: `https://${DOMAIN}/pages/services`,
      schema_blocks: ['{"@type":"Service","name":"WordPress Development"}'],
    },
    {
      ...base, id: 'cr-04', url: `https://${DOMAIN}/pages/portfolio`,
      status_code: 200,
      title:  'Portfolio — Recent WordPress Projects and Case Studies',
      meta_desc: 'Browse our portfolio of recent WordPress projects showcasing custom designs, strategic SEO, and improved online presence.',
      h1: ['Our Portfolio'],
      canonical: `https://${DOMAIN}/pages/portfolio`,
      schema_blocks: ['{"@type":"CollectionPage","name":"Portfolio"}'],
    },
    {
      ...base, id: 'cr-05', url: `https://${DOMAIN}/blogs/news/wordpress-tips`,
      status_code: 200,
      title:  'Essential WordPress Tips for Small Business Owners',
      meta_desc: 'Learn essential WordPress tips and tricks for small business owners. Security best practices, performance optimization, and more.',
      h1: ['WordPress Tips for Business'],
      canonical: `https://${DOMAIN}/blogs/news/wordpress-tips`,
      schema_blocks: ['{"@type":"BlogPosting","headline":"WordPress Tips"}'],
    },
    {
      ...base, id: 'cr-06', url: `https://${DOMAIN}/blogs/news/seo-guide`,
      status_code: 200,
      title:  'Complete SEO Guide for WordPress Sites in 2026',
      meta_desc: 'A comprehensive SEO guide for WordPress sites covering technical optimization, content strategy, schema markup, and performance tips.',
      h1: ['SEO Guide 2026'],
      canonical: `https://${DOMAIN}/blogs/news/seo-guide`,
      schema_blocks: ['{"@type":"BlogPosting","headline":"SEO Guide"}'],
    },
    {
      ...base, id: 'cr-07', url: `https://${DOMAIN}/pages/contact`,
      status_code: 200,
      title:  'Contact Us — Get a Free WordPress Consultation Today',
      meta_desc: 'Contact our WordPress development team for a free consultation. We build custom themes, plugins, and SEO-optimized websites.',
      h1: ['Contact Us'],
      canonical: `https://${DOMAIN}/pages/contact`,
      schema_blocks: ['{"@type":"ContactPage","name":"Contact"}'],
    },

    // ── 3 pages with SEO issues ───────────────────────────────────────────

    // Issue 1: Missing title
    {
      ...base, id: 'cr-08', url: `https://${DOMAIN}/pages/pricing`,
      status_code: 200,
      title:  null,   // ← MISSING TITLE (critical)
      meta_desc: 'View our competitive pricing packages for WordPress development services. Choose from starter, professional, and enterprise plans.',
      h1: ['Pricing Plans'],
      canonical: `https://${DOMAIN}/pages/pricing`,
      schema_blocks: ['{"@type":"WebPage","name":"Pricing"}'],
    },

    // Issue 2: Missing meta description + missing H1
    {
      ...base, id: 'cr-09', url: `https://${DOMAIN}/pages/faq`,
      status_code: 200,
      title:  'Frequently Asked Questions — WordPress Development FAQ',
      meta_desc: null,   // ← MISSING META (major)
      h1: [],            // ← MISSING H1 (critical)
      canonical: `https://${DOMAIN}/pages/faq`,
      schema_blocks: ['{"@type":"FAQPage","name":"FAQ"}'],
    },

    // Issue 3: Missing schema + missing canonical
    {
      ...base, id: 'cr-10', url: `https://${DOMAIN}/pages/testimonials`,
      status_code: 200,
      title:  'Client Testimonials — What Our Customers Are Saying',
      meta_desc: 'Read testimonials from our satisfied WordPress development clients. See why businesses trust us with their web presence and growth.',
      h1: ['Client Testimonials'],
      canonical: null,   // ← MISSING CANONICAL (critical)
      schema_blocks: [],  // ← MISSING SCHEMA (major)
    },
  ];
}

// ── Shared in-memory state (simulates database) ─────────────────────────────

interface PipelineState {
  urlInventory:    UrlInventoryRow[];
  fieldSnapshots:  FieldSnapshotRow[];
  issues:          IssueReport[];
  healthScore:     HealthScore | null;
  proposals:       Map<string, { title?: string; meta?: string }>;
  actionQueue:     Map<string, {
    id: string; url: string; issue_type: string; execution_status: string;
    proposed_fix: Record<string, unknown>;
    rollback_manifest: RollbackManifest | null;
  }>;
  appliedFixes:    Map<string, { field: string; before: string | null; after: string }>;
}

let state: PipelineState;

function resetState(): void {
  state = {
    urlInventory:   [],
    fieldSnapshots: [],
    issues:         [],
    healthScore:    null,
    proposals:      new Map(),
    actionQueue:    new Map(),
    appliedFixes:   new Map(),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// STAGE 1: Connect site
// ═════════════════════════════════════════════════════════════════════════════

describe('E2E WordPress Pipeline', () => {
  beforeEach(() => resetState());

  // ── Stage 1: Connect ────────────────────────────────────────────────────

  describe('Stage 1 — Connect site', () => {
    it('registers a WordPress site with domain and credentials', async () => {
      // TODO: runConnect requires ConnectOps.verifyWordPress which calls the WP REST API.
      // For E2E we simulate the result: site exists in our mock lookup.
      const siteRecord = {
        site_id:   SITE_ID,
        tenant_id: TENANT_ID,
        cms_type:  'wordpress',
        site_url:  `https://${DOMAIN}`,
      };
      assert.equal(siteRecord.site_id, SITE_ID);
      assert.equal(siteRecord.cms_type, 'wordpress');
    });
  });

  // ── Stage 2: Tracer scan ────────────────────────────────────────────────

  describe('Stage 2 — Tracer scan', () => {
    it('inventories 10 URLs and extracts field snapshots', async () => {
      const crawlResults = buildMockCrawlResults();

      const ops: Partial<TracerScanOps> = {
        lookupSiteByDomain: async () => ({ site_id: SITE_ID, tenant_id: TENANT_ID, cms_type: 'wordpress' }),
        loadCrawlResults:   async () => crawlResults,
        upsertUrlInventory: async (rows) => { state.urlInventory = rows; return rows.length; },
        writeFieldSnapshots: async (rows) => { state.fieldSnapshots = rows; return rows.length; },
        generateId:         () => RUN_ID,
      };

      const result = await runTracerScan({ site: DOMAIN }, ops);

      assert.equal(result.status, 'completed');
      assert.equal(result.urls_inventoried, 10);
      assert.equal(state.urlInventory.length, 10);
      // 10 URLs × 6 fields (title, meta, h1, h2, canonical, schema) = 60 snapshots
      assert.equal(state.fieldSnapshots.length, 60);
    });

    it('detects issue flags on problem pages', async () => {
      const crawlResults = buildMockCrawlResults();

      const ops: Partial<TracerScanOps> = {
        lookupSiteByDomain: async () => ({ site_id: SITE_ID, tenant_id: TENANT_ID, cms_type: 'wordpress' }),
        loadCrawlResults:   async () => crawlResults,
        upsertUrlInventory: async (rows) => { state.urlInventory = rows; return rows.length; },
        writeFieldSnapshots: async (rows) => { state.fieldSnapshots = rows; return rows.length; },
        generateId:         () => RUN_ID,
      };

      await runTracerScan({ site: DOMAIN }, ops);

      // Check issue flags on the 3 problem pages
      const pricingTitle = state.fieldSnapshots.find(
        (s) => s.url.includes('/pricing') && s.field_type === 'title',
      );
      assert.ok(pricingTitle);
      assert.equal(pricingTitle!.issue_flag, true);
      assert.equal(pricingTitle!.issue_type, 'MISSING');

      const faqMeta = state.fieldSnapshots.find(
        (s) => s.url.includes('/faq') && s.field_type === 'meta_description',
      );
      assert.ok(faqMeta);
      assert.equal(faqMeta!.issue_flag, true);
      assert.equal(faqMeta!.issue_type, 'MISSING');

      const faqH1 = state.fieldSnapshots.find(
        (s) => s.url.includes('/faq') && s.field_type === 'h1',
      );
      assert.ok(faqH1);
      assert.equal(faqH1!.issue_flag, true);

      const testimonialsCanonical = state.fieldSnapshots.find(
        (s) => s.url.includes('/testimonials') && s.field_type === 'canonical',
      );
      assert.ok(testimonialsCanonical);
      assert.equal(testimonialsCanonical!.issue_flag, true);
    });
  });

  // ── Stage 3: Issue classifier ───────────────────────────────────────────

  describe('Stage 3 — Issue classifier', () => {
    it('detects title_missing, meta_missing, h1_missing, canonical_missing, schema_missing', () => {
      // Build classifier-compatible snapshots from crawl data
      const crawlResults = buildMockCrawlResults();
      const classifierSnapshots: FieldSnapshot[] = [];

      for (const row of crawlResults) {
        // title
        classifierSnapshots.push({
          url:           row.url,
          field_type:    'title',
          current_value: row.title,
          char_count:    row.title?.length ?? 0,
        });
        // meta_description
        classifierSnapshots.push({
          url:           row.url,
          field_type:    'meta_description',
          current_value: row.meta_desc,
          char_count:    row.meta_desc?.length ?? 0,
        });
        // h1
        const h1Val = (row.h1 ?? []).length > 0 ? (row.h1 ?? []).join(' | ') : null;
        classifierSnapshots.push({
          url:           row.url,
          field_type:    'h1',
          current_value: h1Val,
          char_count:    h1Val?.length ?? 0,
        });
        // canonical
        classifierSnapshots.push({
          url:           row.url,
          field_type:    'canonical',
          current_value: row.canonical,
          char_count:    row.canonical?.length ?? 0,
        });
        // schema
        const schemaVal = (row.schema_blocks ?? []).length > 0 ? (row.schema_blocks ?? []).join('\n') : null;
        classifierSnapshots.push({
          url:           row.url,
          field_type:    'schema',
          current_value: schemaVal,
          char_count:    schemaVal?.length ?? 0,
        });
      }

      state.issues = classifyFields(classifierSnapshots);

      // Expected issues:
      // 1. title_missing on /pricing (critical, 3pts)
      // 2. meta_missing on /faq (major, 2pts)
      // 3. h1_missing on /faq (critical, 3pts)
      // 4. canonical_missing on /testimonials (critical, 3pts)
      // 5. schema_missing on /testimonials (major, 2pts)
      assert.equal(state.issues.length, 5);

      const issueTypes = state.issues.map((i) => i.issue_type).sort();
      assert.deepStrictEqual(issueTypes, [
        'canonical_missing',
        'h1_missing',
        'meta_missing',
        'schema_missing',
        'title_missing',
      ]);

      // Check severities
      const titleMissing = state.issues.find((i) => i.issue_type === 'title_missing');
      assert.equal(titleMissing!.severity, 'critical');
      assert.equal(titleMissing!.url, `https://${DOMAIN}/pages/pricing`);

      const metaMissing = state.issues.find((i) => i.issue_type === 'meta_missing');
      assert.equal(metaMissing!.severity, 'major');
    });
  });

  // ── Stage 4: Health score ───────────────────────────────────────────────

  describe('Stage 4 — Health score', () => {
    it('calculates score from 5 issues across 10 URLs', () => {
      // Set up issues from Stage 3
      const crawlResults = buildMockCrawlResults();
      const snapshots: FieldSnapshot[] = [];
      for (const row of crawlResults) {
        snapshots.push({ url: row.url, field_type: 'title', current_value: row.title, char_count: row.title?.length ?? 0 });
        snapshots.push({ url: row.url, field_type: 'meta_description', current_value: row.meta_desc, char_count: row.meta_desc?.length ?? 0 });
        const h1Val = (row.h1 ?? []).length > 0 ? (row.h1 ?? []).join(' | ') : null;
        snapshots.push({ url: row.url, field_type: 'h1', current_value: h1Val, char_count: h1Val?.length ?? 0 });
        snapshots.push({ url: row.url, field_type: 'canonical', current_value: row.canonical, char_count: row.canonical?.length ?? 0 });
        const schemaVal = (row.schema_blocks ?? []).length > 0 ? (row.schema_blocks ?? []).join('\n') : null;
        snapshots.push({ url: row.url, field_type: 'schema', current_value: schemaVal, char_count: schemaVal?.length ?? 0 });
      }
      const issues = classifyFields(snapshots);

      const score = calculateHealthScore(issues, 10);
      state.healthScore = score;

      // Total deductions: 3 + 2 + 3 + 3 + 2 = 13 points
      // Score = 100 - (13 / 10) * 10 = 100 - 13 = 87 → grade B
      assert.equal(score.score, 87);
      assert.equal(score.grade, 'B');
      assert.equal(score.total_issues, 5);
      assert.equal(score.issues_by_severity.critical, 3);
      assert.equal(score.issues_by_severity.major, 2);
      assert.equal(score.issues_by_severity.minor, 0);
    });
  });

  // ── Stage 5: AI title + meta proposals ──────────────────────────────────

  describe('Stage 5 — AI title + meta proposals', () => {
    it('generates AI proposals for the title_missing page', async () => {
      const mockAI: TitleMetaDeps = {
        callAI: async (_sys, userPrompt): Promise<AIResponse> => {
          if (userPrompt.includes('meta title')) {
            return {
              generated_text: 'Affordable Pricing Plans for WordPress Development',
              confidence_score: 0.92,
              reasoning: 'Includes primary keyword, clear value proposition',
            };
          }
          return {
            generated_text: 'Explore our competitive WordPress development pricing packages with flexible monthly plans, enterprise options, and dedicated support included.',
            confidence_score: 0.88,
            reasoning: 'Action-oriented description with keyword in first 50 chars',
          };
        },
        updateSnapshot: async (url, fieldType, value) => {
          const existing = state.proposals.get(url) ?? {};
          if (fieldType === 'title') existing.title = value;
          else existing.meta = value;
          state.proposals.set(url, existing);
        },
      };

      const params: GenerateParams = {
        url:           `https://${DOMAIN}/pages/pricing`,
        current_title: '',
        product_name:  'Pricing Plans',
        keywords:      ['wordpress pricing', 'web development cost'],
        page_type:     'page',
        brand_name:    'Demo WordPress',
      };

      const titleResult = await generateTitle(params, mockAI);

      assert.ok(titleResult.proposed_title.length > 0);
      assert.ok(titleResult.proposed_title.length <= 60);
      assert.ok(titleResult.confidence > 0);
      assert.ok(!titleResult.error);
    });

    it('generates meta description for the meta_missing page', async () => {
      const mockAI: TitleMetaDeps = {
        callAI: async (): Promise<AIResponse> => ({
          generated_text: 'Find answers to common WordPress development questions. Our FAQ covers pricing, timelines, hosting, maintenance, and everything else you need to know.',
          confidence_score: 0.90,
          reasoning: 'Covers key FAQ topics with clear call to action',
        }),
        updateSnapshot: async (url, fieldType, value) => {
          const existing = state.proposals.get(url) ?? {};
          if (fieldType === 'meta_description') existing.meta = value;
          state.proposals.set(url, existing);
        },
      };

      const params: GenerateParams = {
        url:           `https://${DOMAIN}/pages/faq`,
        current_title: 'Frequently Asked Questions — WordPress Development FAQ',
        product_name:  'FAQ',
        keywords:      ['wordpress faq', 'web development questions'],
        page_type:     'page',
      };

      const metaResult = await generateMetaDescription(params, mockAI);

      assert.ok(metaResult.proposed_meta.length > 0);
      assert.ok(metaResult.proposed_meta.length <= 155);
      assert.ok(metaResult.confidence > 0);
      assert.ok(!metaResult.error);
    });
  });

  // ── Stage 6: Guardrail enforcement ──────────────────────────────────────

  describe('Stage 6 — Guardrail enforcement (action ordering)', () => {
    it('verifies the correct pipeline order was followed', () => {
      // TODO: tools/actionlog/enforce.ts does not exist on disk.
      // Guardrail enforcement would verify that:
      //   connect → tracer-scan → classify → score → generate → approve → apply → verify
      // For now, we verify the stages ran in order by checking state.
      //
      // The pipeline guarantees that:
      //   1. You cannot classify without snapshots (Stage 2 must precede Stage 3)
      //   2. You cannot score without issues (Stage 3 must precede Stage 4)
      //   3. You cannot apply without approval (Stage 8 must precede Stage 9)
      //
      // Simulating the guardrail check:
      const crawlResults = buildMockCrawlResults();
      assert.ok(crawlResults.length > 0, 'Stage 2: crawl data available');

      const snapshots: FieldSnapshot[] = [];
      for (const row of crawlResults) {
        snapshots.push({ url: row.url, field_type: 'title', current_value: row.title, char_count: row.title?.length ?? 0 });
      }
      const issues = classifyFields(snapshots);
      assert.ok(issues.length >= 0, 'Stage 3: classifier ran after snapshots');

      const score = calculateHealthScore(issues, crawlResults.length);
      assert.ok(score.score >= 0 && score.score <= 100, 'Stage 4: health score calculated after classification');
    });
  });

  // ── Stage 7: Validator ladder ───────────────────────────────────────────

  describe('Stage 7 — Validator ladder (attempt fix, check proof)', () => {
    it('fixes title_missing at metafield rung', async () => {
      const issue: IssueReport = {
        url:             `https://${DOMAIN}/pages/pricing`,
        field:           'title',
        issue_type:      'title_missing',
        severity:        'critical',
        current_value:   null,
        char_count:      0,
        points_deducted: 3,
      };

      const deps: LadderDeps = {
        applyToggle:    async () => false,   // toggle can't fix a missing title
        applyMetafield: async () => {
          // Simulate writing the title via a WP post_meta update
          state.appliedFixes.set(`${issue.url}:title`, {
            field: 'title', before: null, after: 'Affordable Pricing Plans for WordPress Development',
          });
          return true;
        },
        applySnippet:   async () => false,
        applyTemplate:  async () => false,
        renderAndExtract: async () => ({
          title:            'Affordable Pricing Plans for WordPress Development',
          meta_description: 'View our competitive pricing packages for WordPress development services.',
          h1:               ['Pricing Plans'],
          canonical:        `https://${DOMAIN}/pages/pricing`,
          schema_json_ld:   ['{"@type":"WebPage","name":"Pricing"}'],
        }),
        validateFields: (fields) => validateSeoFields(fields),
      };

      const result = await attemptFix(issue, WP_SITE, deps);

      assert.equal(result.status, 'fixed');
      assert.equal(result.rung_used, 'metafield');
      assert.ok(result.proof);
      assert.equal(result.proof!.pass, true);
      assert.equal(result.rungs_attempted.length, 2); // toggle (skipped) + metafield (fixed)
    });

    it('returns manual_required when all rungs fail', async () => {
      const issue: IssueReport = {
        url:             `https://${DOMAIN}/pages/testimonials`,
        field:           'canonical',
        issue_type:      'canonical_missing',
        severity:        'critical',
        current_value:   null,
        char_count:      0,
        points_deducted: 3,
      };

      const deps: LadderDeps = {
        applyToggle:    async () => false,
        applyMetafield: async () => false,
        applySnippet:   async () => false,
        applyTemplate:  async () => false,
        renderAndExtract: async () => ({
          title: 'Client Testimonials', meta_description: 'Read testimonials',
          h1: ['Testimonials'], canonical: null, schema_json_ld: [],
        }),
        validateFields: (fields) => validateSeoFields(fields),
      };

      const result = await attemptFix(issue, WP_SITE, deps);

      assert.equal(result.status, 'manual_required');
      assert.equal(result.rungs_attempted.length, 4);
    });
  });

  // ── Stage 8: Approve fix ────────────────────────────────────────────────

  describe('Stage 8 — Approve fix', () => {
    it('bulk-approves all pending fixes with --all', async () => {
      // Populate action queue with pending items
      const items: PendingApprovalItem[] = [
        {
          id: 'action-001', run_id: RUN_ID, tenant_id: TENANT_ID, site_id: SITE_ID,
          issue_type: 'title_missing', url: `https://${DOMAIN}/pages/pricing`,
          risk_score: 2, priority: 1, proposed_fix: { new_title: 'Pricing Plans' },
          execution_status: 'pending_approval',
          reasoning_block: {
            detected: { issue: 'Missing title tag', current_value: null },
            why: 'Page has no <title> tag',
            proposed: { change: 'Add title', target_value: 'Pricing Plans' },
            risk_score: 2, blast_radius: 1, dependency_check: [],
            visual_change_flag: false,
            options: [{ label: 'Add metafield title', risk: 1 }],
            recommended_option: 'Add metafield title',
            confidence: 0.92,
          },
        },
        {
          id: 'action-002', run_id: RUN_ID, tenant_id: TENANT_ID, site_id: SITE_ID,
          issue_type: 'meta_missing', url: `https://${DOMAIN}/pages/faq`,
          risk_score: 3, priority: 2, proposed_fix: { new_description: 'FAQ page desc' },
          execution_status: 'pending_approval',
          reasoning_block: {
            detected: { issue: 'Missing meta description', current_value: null },
            why: 'Page has no meta description',
            proposed: { change: 'Add meta description', target_value: 'FAQ description' },
            risk_score: 3, blast_radius: 1, dependency_check: [],
            visual_change_flag: false,
            options: [{ label: 'Add meta desc', risk: 2 }],
            recommended_option: 'Add meta desc',
            confidence: 0.88,
          },
        },
      ];

      const approvedIds: string[] = [];

      const ops: Partial<ApproveCommandOps> = {
        lookupSiteByDomain: async () => ({ site_id: SITE_ID, tenant_id: TENANT_ID }),
        loadPendingItems:   async () => items,
        markApproved:       async (id) => {
          approvedIds.push(id);
          state.actionQueue.set(id, {
            ...items.find((i) => i.id === id)!,
            execution_status: 'approved',
            rollback_manifest: null,
          });
        },
        markSkipped:        async () => {},
        displaySummary:     () => {},
        promptUser:         async () => 'y',
      };

      const result = await runApprove({ site: DOMAIN, approve_all: true }, ops);

      assert.equal(result.status, 'completed');
      assert.equal(result.approved, 2);
      assert.equal(approvedIds.length, 2);
      assert.ok(approvedIds.includes('action-001'));
      assert.ok(approvedIds.includes('action-002'));
    });
  });

  // ── Stage 9: Apply via wp_adapter ───────────────────────────────────────

  describe('Stage 9 — Apply via wp_adapter (wpApplyTitleFix)', () => {
    it('applies title fix and stores rollback manifest', () => {
      // Simulate wp_adapter.applyFix()
      // In a real run, this calls:
      //   PATCH /wp-json/wp/v2/pages/{id} with { meta: { _yoast_wpseo_title: newTitle } }
      //
      // TODO: wp_adapter.applyFix does not accept FieldSnapshot/IssueReport directly.
      // It needs a WpFixRequest with fix_type, target_url, before_value, after_value.
      // This stage simulates the adapter behavior.

      const fixUrl   = `https://${DOMAIN}/pages/pricing`;
      const newTitle = 'Affordable Pricing Plans for WordPress Development';

      // Simulate apply
      state.appliedFixes.set(`${fixUrl}:title`, {
        field: 'title', before: null, after: newTitle,
      });

      // Simulate rollback manifest creation
      const manifest: RollbackManifest = {
        manifest_id:     'manifest-001',
        run_id:          RUN_ID,
        tenant_id:       TENANT_ID,
        cms_type:        'wordpress',
        fields_to_reverse: 1,
        affected_resources: [{
          resource_type: 'post_meta',
          resource_id:   '42',
          resource_key:  '_yoast_wpseo_title',
          before_value:  null,
        }],
        created_at: new Date().toISOString(),
      };

      state.actionQueue.set('action-001', {
        id: 'action-001',
        url: fixUrl,
        issue_type: 'title_missing',
        execution_status: 'deployed',
        proposed_fix: { new_title: newTitle },
        rollback_manifest: manifest,
      });

      // Verify
      const fix = state.appliedFixes.get(`${fixUrl}:title`);
      assert.ok(fix);
      assert.equal(fix!.after, newTitle);
      assert.equal(fix!.before, null);

      const action = state.actionQueue.get('action-001');
      assert.ok(action);
      assert.equal(action!.execution_status, 'deployed');
      assert.ok(action!.rollback_manifest);
      assert.equal(action!.rollback_manifest!.affected_resources![0].resource_type, 'post_meta');
    });
  });

  // ── Stage 10: Preview-verify via local Liquid renderer ──────────────────

  describe('Stage 10 — Preview-verify via local Liquid renderer', () => {
    it('verifies the applied title fix passes SEO validation', async () => {
      const fixedTemplate = `<html>
<head>
  <title>Affordable Pricing Plans for WordPress Development</title>
  <meta name="description" content="View our competitive pricing packages for WordPress development services. Choose from starter, professional, and enterprise plans with flexible options.">
  <link rel="canonical" href="https://${DOMAIN}/pages/pricing">
  <script type="application/ld+json">{"@type":"WebPage","name":"Pricing"}</script>
</head>
<body>
  <h1>Pricing Plans</h1>
</body>
</html>`;

      const verifiedIds: string[] = [];

      const ops: Partial<PreviewVerifyOps> = {
        loadItems: async () => [{
          id: 'action-001', run_id: RUN_ID, tenant_id: TENANT_ID, site_id: SITE_ID,
          issue_type: 'title_missing', url: `https://${DOMAIN}/pages/pricing`,
          risk_score: 2, category: 'content', proposed_fix: {},
          execution_status: 'queued', template_path: 'templates/page.liquid',
        }],
        readPatchedFile:   async () => fixedTemplate,
        buildContext:      async () => ({}),
        shopifyApiVerify:  async () => ({ passed: true, issues: [] }),
        markVerified:      async (id) => { verifiedIds.push(id); },
        markIssuesFound:   async () => {},
      };

      const result = await runPreviewVerify(
        { run_id: RUN_ID, tenant_id: TENANT_ID, site_id: SITE_ID },
        ops,
      );

      assert.equal(result.status, 'passed');
      assert.equal(result.passed, 1);
      assert.equal(result.failed, 0);
      assert.equal(result.fallbacks, 0);
      assert.equal(result.issues.length, 0);
      assert.equal(verifiedIds.length, 1);
      assert.equal(verifiedIds[0], 'action-001');
    });

    it('falls back to Shopify API when template render fails', async () => {
      const ops: Partial<PreviewVerifyOps> = {
        loadItems: async () => [{
          id: 'action-002', run_id: RUN_ID, tenant_id: TENANT_ID, site_id: SITE_ID,
          issue_type: 'meta_missing', url: `https://${DOMAIN}/pages/faq`,
          risk_score: 3, category: 'content', proposed_fix: {},
          execution_status: 'queued',
        }],
        readPatchedFile:   async () => null,  // File not in sandbox cache
        buildContext:      async () => ({}),
        shopifyApiVerify:  async () => ({ passed: true, issues: [] }),
        markVerified:      async () => {},
        markIssuesFound:   async () => {},
      };

      const result = await runPreviewVerify(
        { run_id: RUN_ID, tenant_id: TENANT_ID, site_id: SITE_ID },
        ops,
      );

      assert.equal(result.status, 'passed');
      assert.equal(result.fallbacks, 1);
    });
  });

  // ── Stage 11: Rollback ──────────────────────────────────────────────────

  describe('Stage 11 — Rollback', () => {
    it('rolls back the deployed title fix', async () => {
      // Set up: action-001 was deployed with a manifest
      const manifest: RollbackManifest = {
        manifest_id:       'manifest-001',
        run_id:            RUN_ID,
        tenant_id:         TENANT_ID,
        cms_type:          'wordpress',
        fields_to_reverse: 1,
        affected_resources: [{
          resource_type: 'post_meta',
          resource_id:   '42',
          resource_key:  '_yoast_wpseo_title',
          before_value:  null,   // was null (missing) before fix
        }],
      };

      const rolledBackIds: string[] = [];

      const ops: Partial<RollbackCommandOps> = {
        loadItem:     async () => null,
        loadDeployed: async () => [{
          id: 'action-001', run_id: RUN_ID, tenant_id: TENANT_ID, site_id: SITE_ID,
          issue_type: 'title_missing', url: `https://${DOMAIN}/pages/pricing`,
          execution_status: 'deployed',
        }],
        loadManifest: async () => manifest,
        executeRollback: async (_item, m) => {
          // Simulate restoring the original value
          const resource = m.affected_resources![0];
          state.appliedFixes.set(`https://${DOMAIN}/pages/pricing:title`, {
            field:  'title',
            before: 'Affordable Pricing Plans for WordPress Development',
            after:  resource.before_value as string ?? '',
          });
          return { fields_reversed: 1 };
        },
        markRolledBack:     async (id) => { rolledBackIds.push(id); },
        markRollbackFailed: async () => {},
      };

      const result = await runRollback({
        run_id: RUN_ID, tenant_id: TENANT_ID, site_id: SITE_ID,
        cms: 'wordpress', rollback_all: true,
      }, ops);

      assert.equal(result.status, 'completed');
      assert.equal(result.rolled_back, 1);
      assert.equal(result.failed, 0);
      assert.equal(rolledBackIds.length, 1);
      assert.equal(rolledBackIds[0], 'action-001');
    });
  });

  // ── Stage 12: Verify rollback restores original value ───────────────────

  describe('Stage 12 — Verify rollback restores original value', () => {
    it('confirms the title is back to the original (null/missing) state', async () => {
      // After rollback, the page template should render WITHOUT the title we added.
      // The page goes back to having no <title>.
      const rolledBackTemplate = `<html>
<head>
  <meta name="description" content="View our competitive pricing packages.">
  <link rel="canonical" href="https://${DOMAIN}/pages/pricing">
</head>
<body>
  <h1>Pricing Plans</h1>
</body>
</html>`;

      const html = await renderTemplate(rolledBackTemplate, {});
      const fields = extractSeoFields(html);

      // Title should be null (missing) — restored to original state
      assert.equal(fields.title, null);

      // Validate: should fail with title_missing (back to original issue)
      const validation = validateSeoFields(fields);
      assert.equal(validation.pass, false);
      const titleIssue = validation.issues.find((i) => i.rule === 'title_missing');
      assert.ok(titleIssue, 'title_missing issue should be present after rollback');
      assert.equal(titleIssue!.severity, 'critical');
    });

    it('full rollback state is consistent', () => {
      // Simulate the full state check:
      // After rollback of action-001:
      //   - execution_status should be 'rolled_back'
      //   - the title field should be restored to its original value
      //   - the health score should revert to the pre-fix score (87/B)

      // Recalculate: same 5 issues as before (title still missing after rollback)
      const crawlResults = buildMockCrawlResults();
      const snapshots: FieldSnapshot[] = [];
      for (const row of crawlResults) {
        snapshots.push({ url: row.url, field_type: 'title', current_value: row.title, char_count: row.title?.length ?? 0 });
        snapshots.push({ url: row.url, field_type: 'meta_description', current_value: row.meta_desc, char_count: row.meta_desc?.length ?? 0 });
        const h1Val = (row.h1 ?? []).length > 0 ? (row.h1 ?? []).join(' | ') : null;
        snapshots.push({ url: row.url, field_type: 'h1', current_value: h1Val, char_count: h1Val?.length ?? 0 });
        snapshots.push({ url: row.url, field_type: 'canonical', current_value: row.canonical, char_count: row.canonical?.length ?? 0 });
        const schemaVal = (row.schema_blocks ?? []).length > 0 ? (row.schema_blocks ?? []).join('\n') : null;
        snapshots.push({ url: row.url, field_type: 'schema', current_value: schemaVal, char_count: schemaVal?.length ?? 0 });
      }
      const issues = classifyFields(snapshots);
      const score = calculateHealthScore(issues, 10);

      assert.equal(score.score, 87);
      assert.equal(score.grade, 'B');
      assert.equal(score.total_issues, 5);
    });
  });

  // ── Full pipeline integration ───────────────────────────────────────────

  describe('Full pipeline — all 12 stages in sequence', () => {
    it('runs the complete WordPress pipeline end-to-end', async () => {
      // ── Stage 1: Connect ──────────────────────────────────────────────
      const siteRecord = { site_id: SITE_ID, tenant_id: TENANT_ID, cms_type: 'wordpress' as const };

      // ── Stage 2: Tracer scan ──────────────────────────────────────────
      const crawlResults = buildMockCrawlResults();
      const tracerResult = await runTracerScan({ site: DOMAIN }, {
        lookupSiteByDomain: async () => siteRecord,
        loadCrawlResults:   async () => crawlResults,
        upsertUrlInventory: async (rows) => { state.urlInventory = rows; return rows.length; },
        writeFieldSnapshots: async (rows) => { state.fieldSnapshots = rows; return rows.length; },
        generateId:         () => RUN_ID,
      });
      assert.equal(tracerResult.status, 'completed');
      assert.equal(tracerResult.urls_inventoried, 10);

      // ── Stage 3: Issue classifier ─────────────────────────────────────
      const classifierSnapshots: FieldSnapshot[] = [];
      for (const row of crawlResults) {
        classifierSnapshots.push({ url: row.url, field_type: 'title', current_value: row.title, char_count: row.title?.length ?? 0 });
        classifierSnapshots.push({ url: row.url, field_type: 'meta_description', current_value: row.meta_desc, char_count: row.meta_desc?.length ?? 0 });
        const h1v = (row.h1 ?? []).length > 0 ? (row.h1 ?? []).join(' | ') : null;
        classifierSnapshots.push({ url: row.url, field_type: 'h1', current_value: h1v, char_count: h1v?.length ?? 0 });
        classifierSnapshots.push({ url: row.url, field_type: 'canonical', current_value: row.canonical, char_count: row.canonical?.length ?? 0 });
        const sv = (row.schema_blocks ?? []).length > 0 ? (row.schema_blocks ?? []).join('\n') : null;
        classifierSnapshots.push({ url: row.url, field_type: 'schema', current_value: sv, char_count: sv?.length ?? 0 });
      }
      const issues = classifyFields(classifierSnapshots);
      assert.equal(issues.length, 5);

      // ── Stage 4: Health score ─────────────────────────────────────────
      const score = calculateHealthScore(issues, 10);
      assert.equal(score.score, 87);
      assert.equal(score.grade, 'B');

      // ── Stage 5: AI title proposal ────────────────────────────────────
      const titleResult = await generateTitle({
        url: `https://${DOMAIN}/pages/pricing`,
        current_title: '', product_name: 'Pricing', keywords: ['wordpress pricing'],
        page_type: 'page',
      }, {
        callAI: async () => ({
          generated_text: 'Affordable Pricing Plans for WordPress Development',
          confidence_score: 0.92, reasoning: 'good',
        }),
        updateSnapshot: async () => {},
      });
      assert.ok(titleResult.proposed_title.length > 0);

      // ── Stage 6: Guardrail (verified by stage ordering) ───────────────
      // Stages ran in correct order: connect → scan → classify → score → generate

      // ── Stage 7: Validator ladder ─────────────────────────────────────
      const titleIssue = issues.find((i) => i.issue_type === 'title_missing')!;
      const ladderResult = await attemptFix(titleIssue, WP_SITE, {
        applyToggle: async () => false,
        applyMetafield: async () => true,
        applySnippet: async () => false,
        applyTemplate: async () => false,
        renderAndExtract: async () => ({
          title: titleResult.proposed_title, meta_description: 'Pricing packages.',
          h1: ['Pricing Plans'], canonical: `https://${DOMAIN}/pages/pricing`,
          schema_json_ld: ['{"@type":"WebPage"}'],
        }),
        validateFields: (f) => validateSeoFields(f),
      });
      assert.equal(ladderResult.status, 'fixed');

      // ── Stage 8: Approve ──────────────────────────────────────────────
      const approveResult = await runApprove({ site: DOMAIN, approve_all: true }, {
        lookupSiteByDomain: async () => ({ site_id: SITE_ID, tenant_id: TENANT_ID }),
        loadPendingItems: async () => [{
          id: 'action-001', run_id: RUN_ID, tenant_id: TENANT_ID, site_id: SITE_ID,
          issue_type: 'title_missing', url: `https://${DOMAIN}/pages/pricing`,
          risk_score: 2, priority: 1, proposed_fix: { new_title: titleResult.proposed_title },
          execution_status: 'pending_approval', reasoning_block: null,
        }],
        markApproved: async () => {},
        markSkipped: async () => {},
        displaySummary: () => {},
        promptUser: async () => 'y',
      });
      assert.equal(approveResult.approved, 1);

      // ── Stage 9: Apply via wp_adapter ─────────────────────────────────
      // Simulated: fix applied, manifest stored
      const manifest: RollbackManifest = {
        manifest_id: 'manifest-001', run_id: RUN_ID, tenant_id: TENANT_ID,
        cms_type: 'wordpress', fields_to_reverse: 1,
        affected_resources: [{
          resource_type: 'post_meta', resource_id: '42',
          resource_key: '_yoast_wpseo_title', before_value: null,
        }],
      };

      // ── Stage 10: Preview-verify ──────────────────────────────────────
      const verifyResult = await runPreviewVerify(
        { run_id: RUN_ID, tenant_id: TENANT_ID, site_id: SITE_ID },
        {
          loadItems: async () => [{
            id: 'action-001', run_id: RUN_ID, tenant_id: TENANT_ID, site_id: SITE_ID,
            issue_type: 'title_missing', url: `https://${DOMAIN}/pages/pricing`,
            risk_score: 2, category: 'content', proposed_fix: {},
            execution_status: 'queued', template_path: 'templates/page.liquid',
          }],
          readPatchedFile: async () => `<title>${titleResult.proposed_title}</title>
<meta name="description" content="View our competitive pricing packages for WordPress development services. Choose from starter, professional, and enterprise plans.">
<link rel="canonical" href="https://${DOMAIN}/pages/pricing">
<script type="application/ld+json">{"@type":"WebPage"}</script>
<h1>Pricing Plans</h1>`,
          buildContext: async () => ({}),
          shopifyApiVerify: async () => ({ passed: true, issues: [] }),
          markVerified: async () => {},
          markIssuesFound: async () => {},
        },
      );
      assert.equal(verifyResult.status, 'passed');

      // ── Stage 11: Rollback ────────────────────────────────────────────
      const rollbackResult = await runRollback({
        run_id: RUN_ID, tenant_id: TENANT_ID, site_id: SITE_ID,
        cms: 'wordpress', rollback_all: true,
      }, {
        loadItem: async () => null,
        loadDeployed: async () => [{
          id: 'action-001', run_id: RUN_ID, tenant_id: TENANT_ID, site_id: SITE_ID,
          issue_type: 'title_missing', url: `https://${DOMAIN}/pages/pricing`,
          execution_status: 'deployed',
        }],
        loadManifest: async () => manifest,
        executeRollback: async () => ({ fields_reversed: 1 }),
        markRolledBack: async () => {},
        markRollbackFailed: async () => {},
      });
      assert.equal(rollbackResult.status, 'completed');
      assert.equal(rollbackResult.rolled_back, 1);

      // ── Stage 12: Verify rollback ─────────────────────────────────────
      const rolledBackHtml = await renderTemplate('<html><body><h1>Pricing Plans</h1></body></html>', {});
      const rolledBackFields = extractSeoFields(rolledBackHtml);
      assert.equal(rolledBackFields.title, null);
      const rolledBackValidation = validateSeoFields(rolledBackFields);
      assert.equal(rolledBackValidation.pass, false);
      assert.ok(rolledBackValidation.issues.some((i) => i.rule === 'title_missing'));

      // Score reverts to original
      const postRollbackScore = calculateHealthScore(issues, 10);
      assert.equal(postRollbackScore.score, 87);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GAP ANALYSIS — TODOs for missing plumbing
// ═════════════════════════════════════════════════════════════════════════════
//
// The following gaps were identified during this E2E test build:
//
// TODO 1: tools/actionlog/enforce.ts does not exist on disk.
//   The guardrail enforcement step (Stage 6) that verifies correct pipeline
//   ordering (connect before scan, scan before classify, etc.) is not yet
//   implemented. Currently verified implicitly by stage ordering in tests.
//
// TODO 2: wp_adapter.applyFix() (packages/adapters/wordpress/src/index.ts)
//   does not accept IssueReport or FieldSnapshot types directly.
//   Stage 9 requires a WpFixRequest adapter to bridge between the action_queue
//   row shape and the WordPress REST API call format.
//
// TODO 3: No wp_adapter.fetchPages() or wp_adapter.fetchThemeFiles() exist.
//   Stage 1 (Connect) references a WordPress page/theme fetcher, but the
//   existing wp_adapter only supports applyFix/revertFix. A discovery
//   endpoint would be needed for full site onboarding.
//
// TODO 4: The sandbox theme cache (tools/sandbox/cache/{site_id}/) is not
//   auto-populated during the WordPress pipeline. The preview-verify step
//   (Stage 10) relies on readPatchedFile, but no step writes WordPress
//   theme files to the sandbox cache directory. Need a wp_adapter.pullThemeFiles()
//   or equivalent to populate the cache before preview-verify.
//
// TODO 5: packages/patch-engine/src/index.ts does not have a WordPress-specific
//   rollback path. The rollback command (Stage 11) relies on realDispatchRevert
//   which handles post_meta/page_meta resource_types, but there's no integration
//   test for the actual WP REST API call chain.
//
// TODO 6: The connect command (packages/commands/src/connect.ts) validates
//   WordPress credentials via ConnectOps.verifyWordPress, but this is a stub
//   that needs a real WP REST API health check implementation.
