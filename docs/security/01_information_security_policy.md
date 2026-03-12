# Information Security Policy

**Velocity AEO, Inc.**
**Document ID:** ISP-001
**Version:** 1.0
**Effective Date:** 2026-03-11
**Last Reviewed:** 2026-03-11
**Next Review:** 2027-03-11
**Owner:** Vincent Goodrich, CEO/Founder

---

## 1. Purpose and Scope

This policy establishes the information security framework for Velocity AEO ("VAEO"), a SaaS platform that provides automated SEO optimization for Shopify merchants. It applies to all information assets, systems, and personnel — including the founder, contractors, and AI systems operating on behalf of VAEO.

VAEO processes and stores merchant data including Shopify store credentials, Google Search Console OAuth tokens, SEO field snapshots, fix history, and health scores. This policy governs the protection of that data across all environments, infrastructure providers, and processing activities.

### Systems in Scope

- **Supabase** — Postgres database hosting all merchant and platform data
- **Vercel** — Application hosting for the VAEO dashboard and API routes
- **Anthropic API** — AI inference for SEO fix generation and triage
- **Doppler** — Secret and credential management
- **Google OAuth** — Google Search Console integration
- **GitHub** — Source code repository

---

## 2. Roles and Responsibilities

### CEO/Founder (Vincent Goodrich)

- Serves as the Information Security Officer until a dedicated role is established
- Approves all security policies and exceptions
- Conducts access reviews and vendor assessments
- Responds to security incidents
- Maintains the security documentation and evidence repository

### Engineering (Founder + AI Systems)

- Implements security controls in application code
- Follows secure development practices (input validation, parameterized queries, secret management)
- Runs the automated test suite (1,300+ tests) before every deployment
- Reviews AI-generated code changes before merging
- Maintains infrastructure configurations

### Third-Party Processors

- Must maintain SOC 2 Type 2 certification (or equivalent) for Tier 1 vendors
- Are subject to the Vendor Management Policy (VMP-005)
- Must notify VAEO of security incidents within 72 hours per contractual obligations

---

## 3. Information Classification

All data handled by VAEO is classified into one of four levels:

| Level | Description | Examples | Controls |
|-------|-------------|----------|----------|
| **Restricted** | Compromise would cause severe harm to merchants or VAEO | Shopify access tokens, GSC OAuth tokens, Supabase service role key, Doppler master token | Encrypted at rest and in transit, stored only in Doppler or Supabase encrypted columns, access limited to founder, never logged |
| **Confidential** | Internal business data or merchant PII | Merchant store URLs, SEO field snapshots, fix history, billing records (Stripe customer IDs), API keys | Encrypted in transit, stored in Supabase with RLS enabled, access limited to authorized services |
| **Internal** | Operational data not intended for public release | Health scores, triage results, system logs, test results, deployment configs | Access limited to VAEO systems, not shared externally without classification review |
| **Public** | Information intended for or acceptable for public access | Marketing content, public API documentation, open-source components | No access restrictions |

### Classification Rules

- Data defaults to **Confidential** unless explicitly classified otherwise.
- Merchant credentials are always **Restricted** regardless of context.
- Classification must be reviewed when data is shared with a new system or vendor.

---

## 4. Acceptable Use

### Permitted Uses

- Accessing merchant data solely for the purpose of providing SEO optimization services as described in the VAEO Terms of Service
- Using AI inference (Anthropic API) to analyze page content and generate SEO fixes — content is submitted per-request and not stored by Anthropic
- Accessing Shopify Admin APIs using stored merchant credentials to apply approved fixes
- Querying Google Search Console data using OAuth tokens to enrich priority scoring

### Prohibited Uses

- Accessing merchant data for any purpose unrelated to service delivery
- Sharing merchant credentials or tokens with any party not listed in the vendor inventory
- Storing secrets or credentials in source code, environment variables outside Doppler, or unencrypted storage
- Disabling or bypassing the automated test suite before deployment
- Making direct production database modifications without a migration file

---

## 5. Access Control Principles

VAEO enforces two core access control principles:

### Least Privilege

Every user, service, and AI system is granted only the minimum permissions required to perform its function. Specific implementations:

- Supabase Row-Level Security (RLS) restricts data access to the owning tenant
- API routes validate session tokens and tenant headers via middleware
- Shopify API scopes are limited to themes, content, products, and analytics
- Google OAuth scope is restricted to `webmasters.readonly`
- The Supabase anon key (used by the browser client) cannot bypass RLS

### Need-to-Know

Access to Restricted and Confidential data is limited to systems and personnel that require it for service delivery:

- Merchant credentials are accessed only by the apply engine and snippet installer at the time of fix execution
- GSC tokens are accessed only by the GSC client during data enrichment
- The Anthropic API receives only the page content necessary for fix generation — no credentials or tokens are transmitted

---

## 6. Incident Response Overview

VAEO maintains an Incident Response Plan (IRP-003) that defines procedures for detecting, responding to, and recovering from security incidents. Key elements:

- **Classification:** Incidents are classified P1 (Critical) through P4 (Low) based on data exposure, system impact, and merchant impact
- **Response Time:** P1 incidents require response within 1 hour; P2 within 4 hours
- **Communication:** Affected merchants are notified within 72 hours for incidents involving their data
- **Post-Incident Review:** All P1 and P2 incidents require a written post-mortem within 5 business days

Full details are documented in the Incident Response Plan.

---

## 7. Policy Review

This policy is reviewed and updated on the following schedule:

| Activity | Frequency | Responsible Party |
|----------|-----------|-------------------|
| Full policy review | Annual | CEO/Founder |
| Access control review | Quarterly | CEO/Founder |
| Vendor security assessment | Annual (Tier 1), Biennial (Tier 2) | CEO/Founder |
| Incident response plan test | Annual | CEO/Founder |
| Data classification review | Annual or upon system change | CEO/Founder |

Unscheduled reviews are triggered by:

- A security incident (P1 or P2)
- A significant change to infrastructure or vendors
- A change in applicable regulations
- Customer or auditor findings

---

## 8. Exceptions Process

Exceptions to this policy must be:

1. **Documented** — the specific policy requirement being excepted, the business justification, and the compensating controls
2. **Approved** — by the CEO/Founder (or delegated security officer)
3. **Time-limited** — exceptions expire after 90 days and must be renewed
4. **Tracked** — all exceptions are logged in the security exceptions register

No exception may be granted that would:

- Allow storage of Restricted data in unencrypted form
- Bypass authentication for API routes that access merchant data
- Permit deployment without passing the automated test suite

---

*This policy is maintained by Velocity AEO, Inc. For questions, contact security@velocityaeo.com.*
