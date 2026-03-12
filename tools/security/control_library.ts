/**
 * tools/security/control_library.ts
 *
 * SOC 2 Type II control library for Velocity AEO.
 * Maps every Trust Service Criteria control to its
 * implementation status, evidence, and gaps.
 *
 * Designed to be handed directly to an auditor.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type TrustServiceCriteria = 'CC' | 'A' | 'PI' | 'C' | 'P';

export type ControlStatus = 'implemented' | 'partial' | 'not_started' | 'not_applicable';

export interface Control {
  id:                   string;
  criteria:             TrustServiceCriteria;
  criteria_ref:         string;
  title:                string;
  description:          string;
  status:               ControlStatus;
  evidence:             string[];
  owner:                string;
  implementation_notes: string;
  last_reviewed?:       string;
  gaps?:                string[];
}

export interface ComplianceScore {
  total:        number;
  implemented:  number;
  partial:      number;
  not_started:  number;
  score_pct:    number;
}

// ── SOC 2 Controls ──────────────────────────────────────────────────────────

export const SOC2_CONTROLS: Control[] = [
  // ── Common Criteria (CC) ────────────────────────────────────────────────
  {
    id: 'CC1.1',
    criteria: 'CC',
    criteria_ref: 'CC1.1',
    title: 'Organizational commitment to integrity and ethical values',
    description: 'The entity demonstrates a commitment to integrity and ethical values.',
    status: 'partial',
    evidence: [
      'CLAUDE.md — project principles and coding standards',
      'tools/secret-scan/index.ts — automated secret scanning',
      '.githooks/pre-commit — pre-commit hooks enforcing standards',
    ],
    owner: 'Engineering',
    implementation_notes: 'Code of conduct enforced via automated tooling. Formal written code of ethics document pending.',
    gaps: ['No formal written code of conduct document'],
  },
  {
    id: 'CC2.1',
    criteria: 'CC',
    criteria_ref: 'CC2.1',
    title: 'Information and communication',
    description: 'The entity communicates information internally and externally to support the functioning of internal controls.',
    status: 'partial',
    evidence: [
      'CLAUDE.md — internal development standards',
      'tools/email/send.ts — automated email notifications',
      'tools/email/digest.ts — weekly digest reports',
    ],
    owner: 'Engineering',
    implementation_notes: 'Automated reporting via email digests and dashboard. Internal comms via standard channels.',
    gaps: ['No formal communication policy document'],
  },
  {
    id: 'CC3.1',
    criteria: 'CC',
    criteria_ref: 'CC3.1',
    title: 'Risk assessment process',
    description: 'The entity identifies and assesses risks to the achievement of its objectives.',
    status: 'partial',
    evidence: [
      'tools/scoring/issue_classifier.ts — automated risk scoring (critical/major/minor)',
      'tools/scoring/health_score.ts — site health risk assessment',
      'packages/core/src/triage/triage_engine.ts — triage engine with risk-based routing',
    ],
    owner: 'Engineering',
    implementation_notes: 'Automated risk scoring for SEO issues. Triage engine routes by risk level. Formal enterprise risk assessment pending.',
    gaps: ['No formal enterprise-wide risk assessment document'],
  },
  {
    id: 'CC4.1',
    criteria: 'CC',
    criteria_ref: 'CC4.1',
    title: 'Monitoring of controls',
    description: 'The entity selects, develops, and performs ongoing evaluations to ascertain whether controls are present and functioning.',
    status: 'implemented',
    evidence: [
      '1348 automated tests in CI — npm test',
      'tools/sandbox/regression_monitor.ts — automated regression monitoring',
      'tools/sandbox/multi_verify.ts — multi-signal verification',
      'tools/verify/delta.ts — before/after delta verification',
    ],
    owner: 'Engineering',
    implementation_notes: 'Comprehensive automated test suite with regression monitoring. Zero-failure policy enforced across all sprints. Multi-signal verification detects regressions automatically.',
    last_reviewed: '2026-03-11',
  },
  {
    id: 'CC5.1',
    criteria: 'CC',
    criteria_ref: 'CC5.1',
    title: 'Control activities — logical access',
    description: 'The entity selects and develops control activities that mitigate risks to the achievement of objectives.',
    status: 'implemented',
    evidence: [
      'apps/dashboard/lib/supabase.ts — role-based Supabase client (anon vs service role)',
      'Supabase RLS policies — row-level security on all tables',
      'apps/dashboard/app/api/auth/ — authentication endpoints',
      'Doppler secret management — no secrets in source code',
    ],
    owner: 'Engineering',
    implementation_notes: 'Supabase RLS enforces tenant isolation. Service role key restricted to server-side only. All secrets managed via Doppler.',
    last_reviewed: '2026-03-11',
  },
  {
    id: 'CC6.1',
    criteria: 'CC',
    criteria_ref: 'CC6.1',
    title: 'Logical access security — authentication',
    description: 'The entity implements logical access security to protect against unauthorized access.',
    status: 'implemented',
    evidence: [
      'apps/dashboard/app/api/auth/ — authentication flow',
      'apps/dashboard/components/Header.tsx — session-based auth with logout',
      'Supabase Auth — managed authentication provider',
    ],
    owner: 'Engineering',
    implementation_notes: 'Supabase Auth handles authentication. Session-based access control on all dashboard routes. Logout functionality enforced.',
    last_reviewed: '2026-03-11',
  },
  {
    id: 'CC6.2',
    criteria: 'CC',
    criteria_ref: 'CC6.2',
    title: 'Prior to issuing system credentials',
    description: 'The entity authorizes, modifies, or removes access rights in a timely manner.',
    status: 'partial',
    evidence: [
      'Supabase Auth — managed user provisioning',
      'apps/dashboard/app/api/auth/ — auth endpoints',
    ],
    owner: 'Engineering',
    implementation_notes: 'User creation via Supabase Auth. No formal access review process documented.',
    gaps: ['No formal access review cadence or offboarding checklist'],
  },
  {
    id: 'CC6.3',
    criteria: 'CC',
    criteria_ref: 'CC6.3',
    title: 'Role-based access control',
    description: 'The entity implements role-based access and least privilege principles.',
    status: 'implemented',
    evidence: [
      'Supabase RLS policies — tenant-scoped data access',
      'apps/dashboard/lib/supabase.ts — anon key (browser) vs service role (server)',
      'tools/secret-scan/index.ts — prevents credential exposure',
    ],
    owner: 'Engineering',
    implementation_notes: 'Two-tier access: anon key for client with RLS enforcement, service role for server operations only. Secret scanning prevents credential leaks.',
    last_reviewed: '2026-03-11',
  },
  {
    id: 'CC6.6',
    criteria: 'CC',
    criteria_ref: 'CC6.6',
    title: 'Logical access restrictions',
    description: 'The entity restricts logical access to systems and data based on roles and responsibilities.',
    status: 'implemented',
    evidence: [
      'Supabase RLS policies — row-level security',
      'apps/dashboard/app/api/ — API route authorization checks',
      'x-tenant-id header validation in API routes',
    ],
    owner: 'Engineering',
    implementation_notes: 'API routes validate tenant context. RLS prevents cross-tenant data access. All database queries scoped by site_id/tenant_id.',
    last_reviewed: '2026-03-11',
  },
  {
    id: 'CC6.7',
    criteria: 'CC',
    criteria_ref: 'CC6.7',
    title: 'Transmission of data',
    description: 'The entity protects data during transmission using encryption.',
    status: 'implemented',
    evidence: [
      'Vercel deployment — HTTPS enforced on all endpoints',
      'Supabase — TLS for all database connections',
      'Shopify Admin API — HTTPS-only API calls',
      'Doppler — encrypted secret transmission',
    ],
    owner: 'Engineering',
    implementation_notes: 'All data in transit encrypted via TLS/HTTPS. Vercel enforces HTTPS. Supabase connections use TLS. Shopify API calls over HTTPS only.',
    last_reviewed: '2026-03-11',
  },
  {
    id: 'CC7.1',
    criteria: 'CC',
    criteria_ref: 'CC7.1',
    title: 'Vulnerability management',
    description: 'The entity identifies, evaluates, and manages vulnerabilities.',
    status: 'partial',
    evidence: [
      'tools/secret-scan/index.ts — automated secret scanning in CI',
      '.githooks/pre-commit — pre-commit secret scan',
      'package.json — dependency management with version pinning',
    ],
    owner: 'Engineering',
    implementation_notes: 'Secret scanning prevents credential exposure. Dependencies version-pinned. No formal vulnerability scanning tool (e.g. Snyk/Dependabot) configured yet.',
    gaps: ['No automated dependency vulnerability scanning', 'No formal vulnerability disclosure policy'],
  },
  {
    id: 'CC7.2',
    criteria: 'CC',
    criteria_ref: 'CC7.2',
    title: 'Monitoring for anomalies',
    description: 'The entity monitors system components for anomalies indicative of security events.',
    status: 'partial',
    evidence: [
      'tools/sandbox/regression_monitor.ts — regression detection',
      'tools/tracer/change_detector.ts — change detection',
      'Vercel deployment logs — runtime monitoring',
    ],
    owner: 'Engineering',
    implementation_notes: 'Regression monitoring detects unexpected changes. Change detection tracks modifications. Production monitoring via Vercel. No dedicated SIEM or security alerting.',
    gaps: ['No dedicated security event monitoring (SIEM)', 'No incident response playbook'],
  },
  {
    id: 'CC8.1',
    criteria: 'CC',
    criteria_ref: 'CC8.1',
    title: 'Change management',
    description: 'The entity authorizes, designs, develops, configures, documents, tests, approves, and implements changes.',
    status: 'implemented',
    evidence: [
      'Git version control — all changes tracked',
      '.githooks/pre-commit — pre-commit validation',
      '1348 automated tests — zero-failure CI policy',
      'tools/sandbox/sandbox_verify.ts — sandbox verification before deploy',
      'tools/learning/approval_queue.ts — human approval workflow',
    ],
    owner: 'Engineering',
    implementation_notes: 'All changes go through Git with pre-commit hooks. Automated test suite must pass with zero failures. Sandbox verification validates changes before production. Human approval queue for high-risk changes.',
    last_reviewed: '2026-03-11',
  },
  {
    id: 'CC9.1',
    criteria: 'CC',
    criteria_ref: 'CC9.1',
    title: 'Vendor risk management',
    description: 'The entity identifies and manages risks associated with vendors and business partners.',
    status: 'partial',
    evidence: [
      'Vercel — SOC 2 Type II certified hosting',
      'Supabase — SOC 2 Type II certified database',
      'Doppler — SOC 2 certified secret management',
      'Shopify — PCI DSS and SOC 2 certified',
    ],
    owner: 'Engineering',
    implementation_notes: 'All major vendors (Vercel, Supabase, Doppler, Shopify) are SOC 2 certified. No formal vendor risk assessment registry.',
    gaps: ['No formal vendor risk assessment register', 'No vendor review cadence documented'],
  },

  // ── Availability (A) ───────────────────────────────────────────────────
  {
    id: 'A1.1',
    criteria: 'A',
    criteria_ref: 'A1.1',
    title: 'Availability commitments',
    description: 'The entity maintains availability commitments and system requirements.',
    status: 'partial',
    evidence: [
      'Vercel — managed hosting with 99.99% SLA',
      'Supabase — managed database with HA',
      'tools/sandbox/lighthouse_runner.ts — performance monitoring',
    ],
    owner: 'Engineering',
    implementation_notes: 'Infrastructure availability managed by Vercel and Supabase with high-availability guarantees. No formal SLA document for customers.',
    gaps: ['No formal customer-facing SLA document'],
  },
  {
    id: 'A1.2',
    criteria: 'A',
    criteria_ref: 'A1.2',
    title: 'Environmental protections',
    description: 'The entity manages environmental threats that could impair availability.',
    status: 'implemented',
    evidence: [
      'Vercel — multi-region edge deployment',
      'Supabase — managed database backups',
      'Doppler — encrypted secret storage with backup',
    ],
    owner: 'Engineering',
    implementation_notes: 'All infrastructure is cloud-managed with automatic backups, multi-region deployment, and disaster recovery handled by Vercel and Supabase.',
    last_reviewed: '2026-03-11',
  },

  // ── Processing Integrity (PI) ──────────────────────────────────────────
  {
    id: 'PI1.1',
    criteria: 'PI',
    criteria_ref: 'PI1.1',
    title: 'Processing integrity commitments',
    description: 'The entity obtains commitments about processing integrity from vendors and monitors compliance.',
    status: 'implemented',
    evidence: [
      'tools/sandbox/multi_verify.ts — 8-signal verification before deploy',
      'tools/verify/delta.ts — before/after delta checking',
      'tools/validator/ladder.ts — validation ladder for data quality',
      'tools/learning/confidence_scorer.ts — confidence scoring for fix quality',
      '1348 automated tests with zero-failure policy',
    ],
    owner: 'Engineering',
    implementation_notes: 'Multi-signal verification validates processing integrity before any change is deployed. Confidence scoring ensures fix quality. Automated test suite enforces correctness.',
    last_reviewed: '2026-03-11',
  },

  // ── Confidentiality (C) ────────────────────────────────────────────────
  {
    id: 'C1.1',
    criteria: 'C',
    criteria_ref: 'C1.1',
    title: 'Confidentiality commitments',
    description: 'The entity identifies and maintains confidentiality commitments and requirements.',
    status: 'partial',
    evidence: [
      'Doppler secret management — no secrets in source code',
      'tools/secret-scan/index.ts — automated secret scanning',
      'Supabase RLS — tenant data isolation',
      '.gitignore — sensitive files excluded from version control',
    ],
    owner: 'Engineering',
    implementation_notes: 'Secrets managed via Doppler, never committed to source. RLS enforces tenant isolation. Secret scanning in CI prevents leaks.',
    gaps: ['No formal data classification policy'],
  },
  {
    id: 'C1.2',
    criteria: 'C',
    criteria_ref: 'C1.2',
    title: 'Disposal of confidential information',
    description: 'The entity disposes of confidential information to meet objectives.',
    status: 'not_started',
    evidence: [],
    owner: 'Engineering',
    implementation_notes: 'No formal data retention or disposal policy implemented.',
    gaps: ['No data retention policy', 'No data disposal procedures', 'No automated data purge mechanism'],
  },

  // ── Privacy (P) ────────────────────────────────────────────────────────
  {
    id: 'P1.1',
    criteria: 'P',
    criteria_ref: 'P1.1',
    title: 'Privacy notice',
    description: 'The entity provides notice about its privacy practices.',
    status: 'not_started',
    evidence: [],
    owner: 'Legal',
    implementation_notes: 'Privacy notice not yet published.',
    gaps: ['No published privacy policy', 'No cookie consent mechanism'],
  },
  {
    id: 'P3.1',
    criteria: 'P',
    criteria_ref: 'P3.1',
    title: 'Collection of personal information',
    description: 'The entity collects personal information only for the purposes identified in the notice.',
    status: 'partial',
    evidence: [
      'Supabase Auth — collects only email for authentication',
      'tools/gsc/gsc_token_store.ts — stores OAuth tokens securely',
    ],
    owner: 'Engineering',
    implementation_notes: 'Minimal data collection — email for auth, OAuth tokens for GSC. No formal data inventory or processing register.',
    gaps: ['No formal data processing inventory', 'No data processing agreement template'],
  },
  {
    id: 'P6.1',
    criteria: 'P',
    criteria_ref: 'P6.1',
    title: 'Disclosure to third parties',
    description: 'The entity discloses personal information to third parties only for identified purposes.',
    status: 'partial',
    evidence: [
      'Shopify Admin API — accesses merchant store data with explicit permission',
      'Google Search Console API — accesses GSC data with OAuth consent',
      'No third-party analytics or tracking SDKs in dashboard',
    ],
    owner: 'Engineering',
    implementation_notes: 'Third-party access limited to Shopify (merchant-authorized) and Google (OAuth-consented). No marketing/analytics trackers.',
    gaps: ['No formal third-party data sharing agreement template'],
  },
  {
    id: 'P8.1',
    criteria: 'P',
    criteria_ref: 'P8.1',
    title: 'Quality of personal information',
    description: 'The entity provides mechanisms for data subjects to review and update their personal information.',
    status: 'not_started',
    evidence: [],
    owner: 'Engineering',
    implementation_notes: 'No self-service data review or update mechanism for end users.',
    gaps: ['No data subject access request (DSAR) process', 'No self-service data management portal'],
  },

  // ── Additional CC controls ────────────────────────────────────────────
  {
    id: 'CC5.2',
    criteria: 'CC',
    criteria_ref: 'CC5.2',
    title: 'Control activities — data backup',
    description: 'The entity implements control activities to ensure data recoverability.',
    status: 'implemented',
    evidence: [
      'Supabase — automatic daily database backups',
      'Git — full version history of all source code',
      'src/commands/rollback.ts — fix rollback capability',
      'src/commands/theme_rollback.ts — theme change rollback',
    ],
    owner: 'Engineering',
    implementation_notes: 'Database backed up daily by Supabase. All code changes in Git with full history. Rollback commands available for fixes and theme changes.',
    last_reviewed: '2026-03-11',
  },
  {
    id: 'CC6.8',
    criteria: 'CC',
    criteria_ref: 'CC6.8',
    title: 'Encryption of data at rest',
    description: 'The entity uses encryption to protect data at rest.',
    status: 'implemented',
    evidence: [
      'Supabase — AES-256 encryption at rest',
      'Doppler — encrypted secret storage',
      'Vercel — encrypted deployment artifacts',
    ],
    owner: 'Engineering',
    implementation_notes: 'All data at rest encrypted by infrastructure providers. Supabase uses AES-256. Doppler encrypts all stored secrets.',
    last_reviewed: '2026-03-11',
  },
];

// ── Query functions ─────────────────────────────────────────────────────────

/**
 * Get controls filtered by status.
 */
export function getControlsByStatus(status: ControlStatus): Control[] {
  return SOC2_CONTROLS.filter((c) => c.status === status);
}

/**
 * Get controls filtered by Trust Service Criteria.
 */
export function getControlsByCriteria(criteria: TrustServiceCriteria): Control[] {
  return SOC2_CONTROLS.filter((c) => c.criteria === criteria);
}

/**
 * Calculate overall compliance score.
 *
 * Score formula: (implemented + partial*0.5) / applicable_total * 100
 * Controls with status 'not_applicable' are excluded from the total.
 */
export function getComplianceScore(): ComplianceScore {
  const applicable = SOC2_CONTROLS.filter((c) => c.status !== 'not_applicable');
  const implemented = applicable.filter((c) => c.status === 'implemented').length;
  const partial     = applicable.filter((c) => c.status === 'partial').length;
  const not_started = applicable.filter((c) => c.status === 'not_started').length;
  const total       = applicable.length;

  const score_pct = total > 0
    ? Math.round(((implemented + partial * 0.5) / total) * 100)
    : 0;

  return { total, implemented, partial, not_started, score_pct };
}
