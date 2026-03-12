# Vendor Management Policy

**Velocity AEO, Inc.**
**Document ID:** VMP-005
**Version:** 1.0
**Effective Date:** 2026-03-11
**Last Reviewed:** 2026-03-11
**Next Review:** 2027-03-11
**Owner:** Vincent Goodrich, CEO/Founder

---

## 1. Purpose and Scope

This policy governs how Velocity AEO selects, assesses, monitors, and offboards third-party vendors that process, store, or have access to VAEO systems and merchant data. It ensures that vendor risk is identified, managed, and reviewed on a recurring basis.

---

## 2. Vendor Risk Tiers

Vendors are classified into three tiers based on the sensitivity of data they access and their criticality to VAEO operations:

| Tier | Criteria | Review Frequency | Examples |
|------|----------|-----------------|----------|
| **Tier 1 — Critical** | Stores or processes Restricted/Confidential data; VAEO cannot operate without this vendor | Annual | Supabase, Vercel, Anthropic, Doppler |
| **Tier 2 — Important** | Processes Confidential data or provides important but substitutable functionality | Biennial | Google (GSC OAuth), Stripe |
| **Tier 3 — Standard** | No access to merchant data; provides development or operational tooling | On onboarding only | npm packages, GitHub, development tools |

---

## 3. Vendor Assessment Criteria

Before onboarding a Tier 1 or Tier 2 vendor, the following must be evaluated:

| Criterion | Tier 1 Required | Tier 2 Required | Evidence |
|-----------|----------------|-----------------|----------|
| SOC 2 Type 2 report (or equivalent) | Required | Preferred | Vendor-provided report |
| Data encryption at rest | Required | Required | Vendor documentation |
| Data encryption in transit (TLS 1.2+) | Required | Required | Vendor documentation |
| Incident notification SLA | Required (72 hours max) | Preferred | Contract or ToS |
| Data processing agreement (DPA) | Required | Required if processing PII | Signed agreement |
| Sub-processor disclosure | Required | Preferred | Vendor sub-processor list |
| Data residency | Documented | Documented | Vendor documentation |
| Right to audit | Preferred | Optional | Contract clause |

---

## 4. Current Vendor Inventory

### Tier 1 — Critical Vendors

#### Supabase

| Attribute | Detail |
|-----------|--------|
| **Service** | Managed Postgres database |
| **Data Accessed** | All merchant data, site credentials, OAuth tokens, SEO field snapshots, fix history, audit logs, health scores |
| **Classification** | Restricted + Confidential |
| **SOC 2 Status** | Type 2 certified |
| **Encryption** | AES-256 at rest, TLS 1.3 in transit |
| **Data Residency** | US (AWS us-east-1) |
| **Backup** | Continuous point-in-time recovery, daily snapshots |
| **DPA** | Available on request |
| **Sub-processors** | AWS (infrastructure) |
| **Last Reviewed** | 2026-03-11 |

#### Vercel

| Attribute | Detail |
|-----------|--------|
| **Service** | Application hosting, edge functions, CDN |
| **Data Accessed** | Application code, environment variables (via Doppler sync), request/response data in transit |
| **Classification** | Confidential (code), Internal (logs) |
| **SOC 2 Status** | Type 2 certified |
| **Encryption** | TLS 1.3 in transit, encrypted at rest |
| **Data Residency** | Global edge network, US primary |
| **Backup** | Deployment history with instant rollback |
| **DPA** | Available in Enterprise plan |
| **Sub-processors** | AWS, Cloudflare (CDN) |
| **Last Reviewed** | 2026-03-11 |

#### Anthropic

| Attribute | Detail |
|-----------|--------|
| **Service** | AI inference API (Claude models) |
| **Data Accessed** | Page content submitted per-request for SEO analysis and fix generation |
| **Classification** | Confidential (page content) |
| **SOC 2 Status** | Type 2 certified |
| **Data Retention** | No persistent storage of API inputs or outputs (per API usage policy) |
| **Encryption** | TLS 1.3 in transit |
| **Training** | Customer data is not used for model training (per API terms) |
| **DPA** | Available on request |
| **Last Reviewed** | 2026-03-11 |

#### Doppler

| Attribute | Detail |
|-----------|--------|
| **Service** | Secret and credential management |
| **Data Accessed** | All API keys, database credentials, OAuth client secrets, service tokens |
| **Classification** | Restricted |
| **SOC 2 Status** | Type 2 certified |
| **Encryption** | Zero-knowledge encryption, AES-256 at rest, TLS in transit |
| **Audit Logging** | Full audit trail for all secret reads and writes |
| **Data Residency** | US |
| **DPA** | Available on request |
| **Last Reviewed** | 2026-03-11 |

### Tier 2 — Important Vendors

#### Google (Search Console)

| Attribute | Detail |
|-----------|--------|
| **Service** | OAuth 2.0 provider for Google Search Console integration |
| **Data Accessed** | Search performance data (clicks, impressions, position) for connected merchant properties |
| **Classification** | Confidential |
| **SOC 2 Status** | SOC 2 Type 2 and ISO 27001 certified |
| **Scope** | `webmasters.readonly` — read-only access to Search Console data |
| **Token Storage** | OAuth tokens stored in Supabase (encrypted at rest) |
| **DPA** | Google Cloud DPA applies |
| **Last Reviewed** | 2026-03-11 |

#### Stripe

| Attribute | Detail |
|-----------|--------|
| **Service** | Payment processing |
| **Data Accessed** | Stripe customer IDs, subscription status, payment events (no card numbers stored by VAEO) |
| **Classification** | Confidential |
| **Compliance** | PCI DSS Level 1 Service Provider |
| **SOC 2 Status** | Type 2 certified |
| **Data Residency** | US |
| **DPA** | Stripe DPA applies automatically |
| **Last Reviewed** | 2026-03-11 |

### Tier 3 — Standard Vendors

#### GitHub

| Attribute | Detail |
|-----------|--------|
| **Service** | Source code repository, CI/CD integration |
| **Data Accessed** | Application source code (no merchant data) |
| **SOC 2 Status** | Type 2 certified |
| **Controls** | Branch protection, Dependabot alerts, secret scanning |
| **Last Reviewed** | 2026-03-11 |

#### npm Registry

| Attribute | Detail |
|-----------|--------|
| **Service** | Package registry for JavaScript dependencies |
| **Data Accessed** | None — packages are downloaded, no data uploaded |
| **Risk** | Supply chain risk from malicious packages |
| **Controls** | Lock file (`package-lock.json`), Dependabot vulnerability alerts, minimal dependency footprint |
| **Last Reviewed** | 2026-03-11 |

---

## 5. Vendor Review Schedule

| Tier | Review Frequency | Review Activities |
|------|-----------------|-------------------|
| Tier 1 | Annual | SOC 2 report review, data access scope verification, incident history review, sub-processor changes, DPA currency |
| Tier 2 | Biennial | Compliance certification review, data access scope verification |
| Tier 3 | On onboarding | Initial assessment only; re-assessed if scope changes |

Unscheduled reviews are triggered by:

- A security incident involving the vendor
- Significant changes to the vendor's service or terms
- Vendor acquisition or merger
- Changes to the data VAEO shares with the vendor

---

## 6. Vendor Offboarding Process

When a vendor relationship is terminated:

1. **Revoke access:** Disable all API keys, OAuth integrations, and service accounts associated with the vendor
2. **Data retrieval:** Export any VAEO data stored by the vendor
3. **Data deletion:** Request written confirmation that the vendor has deleted all VAEO data per their DPA obligations
4. **Credential rotation:** Rotate any credentials that were shared with or accessible by the vendor
5. **Documentation:** Update the vendor inventory to reflect the termination, including date and reason
6. **Migration:** Ensure replacement vendor or process is in place before termination completes

---

*This policy is maintained by Velocity AEO, Inc. For questions, contact security@velocityaeo.com.*
