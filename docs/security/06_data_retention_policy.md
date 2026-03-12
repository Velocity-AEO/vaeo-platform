# Data Classification and Retention Policy

**Velocity AEO, Inc.**
**Document ID:** DRP-006
**Version:** 1.0
**Effective Date:** 2026-03-11
**Last Reviewed:** 2026-03-11
**Next Review:** 2027-03-11
**Owner:** Vincent Goodrich, CEO/Founder

---

## 1. Purpose and Scope

This policy defines how Velocity AEO classifies, retains, and deletes data processed by the platform. It ensures that data is kept only as long as necessary for business and legal purposes, and that deletion is performed securely when retention periods expire.

This policy applies to all data stored in Supabase, cached in Vercel, processed by the Anthropic API, and managed through Doppler.

---

## 2. Data Inventory

The following table catalogs all data types processed by VAEO, their classification, storage location, and purpose:

| Data Type | Classification | Storage | Purpose |
|-----------|---------------|---------|---------|
| Merchant Shopify access tokens | **Restricted** | Supabase (`site_credentials` table) | Authenticate API calls to merchant stores for applying fixes |
| Google Search Console OAuth tokens | **Restricted** | Supabase (`sites.extra_data.gsc_token`) | Authenticate GSC API calls for traffic data enrichment |
| Doppler master token | **Restricted** | Doppler (self-referential) | Access all other secrets |
| Supabase service role key | **Restricted** | Doppler | Database operations bypassing RLS |
| Anthropic API key | **Restricted** | Doppler | AI inference requests |
| Shopify API credentials (client ID/secret) | **Restricted** | Doppler | OAuth flow for merchant onboarding |
| Google OAuth client credentials | **Restricted** | Doppler | GSC OAuth flow |
| Merchant site URLs | **Confidential** | Supabase (`sites` table) | Identify merchant stores |
| SEO field snapshots (titles, meta descriptions, schema markup) | **Confidential** | Supabase (`action_queue`, `learnings` tables) | Before/after comparison for SEO fixes |
| Fix history and audit logs | **Confidential** | Supabase (`action_queue`, `learnings` tables) | Audit trail of all changes made to merchant stores |
| Triage results and recommendations | **Confidential** | Supabase (`learnings` table) | Record of AI and rule-based triage decisions |
| Health scores and reports | **Internal** | Supabase (`sites` table) | Dashboard display, trend tracking |
| GSC traffic data (clicks, impressions, position) | **Confidential** | Supabase (`tracer_gsc_cache` table) | Priority scoring enrichment |
| Billing data (Stripe customer IDs, subscription status) | **Confidential** | Supabase (`tenants` table), Stripe | Subscription management, invoicing |
| Onboarding status | **Internal** | Supabase (`sites.extra_data.onboarding`) | Track merchant setup progress |
| Application logs | **Internal** | Vercel (runtime logs) | Debugging, monitoring |
| AI inference inputs/outputs | **Confidential** | Not persisted by Anthropic | SEO fix generation (transient processing only) |

---

## 3. Classification Applied

Each data classification level maps to specific handling requirements:

| Level | Encryption at Rest | Encryption in Transit | Access Control | Logging |
|-------|-------------------|----------------------|----------------|---------|
| **Restricted** | Required (AES-256) | Required (TLS 1.2+) | Founder only + authorized service accounts | All access logged |
| **Confidential** | Required | Required | Role-based + tenant-scoped RLS | Access logged |
| **Internal** | Recommended | Required | VAEO systems only | Standard logging |
| **Public** | Optional | Recommended | No restrictions | No requirement |

---

## 4. Retention Schedules

| Data Type | Retention Period | Trigger for Deletion | Justification |
|-----------|-----------------|---------------------|---------------|
| Active merchant site data (credentials, snapshots, fixes) | Duration of active subscription | Subscription cancellation + 30-day grace period | Required for ongoing service delivery |
| Merchant credentials (Shopify tokens, GSC tokens) | Duration of active subscription | Subscription cancellation | Required for API access; no value after cancellation |
| Audit logs (fix history, triage decisions, approval records) | **2 years minimum** | 2 years after creation | Compliance and dispute resolution |
| Fix history (action_queue records) | **1 year** | 1 year after fix applied or skipped | Operational review and regression analysis |
| GSC traffic cache | **90 days** | Rolling 90-day window | Performance data refreshed regularly |
| Health scores and reports | Duration of active subscription | Subscription cancellation + 30 days | Dashboard display |
| Deleted merchant data | **Purged within 30 days** of deletion request | Merchant deletion request or subscription cancellation | Data minimization principle |
| Billing records (Stripe customer IDs, invoice history) | **7 years** | 7 years after last transaction | Tax compliance and financial record-keeping |
| Application logs (Vercel) | **30 days** | Automatic Vercel log rotation | Debugging and incident investigation |
| Onboarding status | Duration of active subscription | Subscription cancellation + 30 days | Setup tracking |

---

## 5. Deletion Procedures

### Merchant Data Deletion (Subscription Cancellation)

When a merchant cancels their subscription:

1. **Day 0:** Subscription marked as cancelled; merchant notified of 30-day grace period
2. **Day 1–30:** Merchant data remains accessible in case of re-activation
3. **Day 31:** Automated deletion process executes:
   - Revoke and delete Shopify access tokens from `site_credentials`
   - Revoke and delete GSC OAuth tokens from `sites.extra_data`
   - Delete SEO field snapshots and fix history from `action_queue`
   - Delete triage results and learnings from `learnings` table
   - Delete site record from `sites` table
   - Retain audit log entries for 2 years (anonymized — site URL replaced with site_id hash)
   - Retain billing records in Stripe for 7 years
4. **Verification:** Confirm deletion by querying for the site_id across all tables
5. **Documentation:** Log the deletion with timestamp and confirmation

### Credential Deletion

Credentials (Shopify tokens, GSC tokens) are deleted immediately when:

- The merchant revokes access through Shopify or Google
- The merchant requests credential deletion
- The subscription is cancelled (after 30-day grace period)

### Right to Erasure Requests

VAEO honors data deletion requests within **30 days** of receipt. The process:

1. Verify the identity of the requester (must be the Shopify store owner)
2. Execute the merchant data deletion procedure above
3. Confirm deletion to the requester in writing

---

## 6. Data Subject Rights

### GDPR (for EU merchants or EU site visitors)

VAEO supports the following data subject rights:

| Right | Implementation |
|-------|---------------|
| Right of access | Merchant can view all their data through the VAEO dashboard |
| Right to rectification | Merchant can update their store URL and settings |
| Right to erasure | 30-day deletion upon request (see Section 5) |
| Right to data portability | Data export available upon request (JSON format) |
| Right to restrict processing | Merchant can pause fix application through the dashboard |
| Right to object | Merchant can cancel subscription and request data deletion |

### CCPA (for California merchants)

| Right | Implementation |
|-------|---------------|
| Right to know | Merchant can request a summary of data collected and processed |
| Right to delete | 30-day deletion upon request |
| Right to opt-out | VAEO does not sell personal information |
| Right to non-discrimination | Service terms do not change based on privacy right exercise |

---

## 7. Breach Notification Requirements

In the event of a data breach involving merchant personal data:

| Regulation | Notification Timeline | Recipient |
|------------|----------------------|-----------|
| **GDPR** | Within **72 hours** of becoming aware | Supervisory authority + affected data subjects (if high risk) |
| **CCPA** | As soon as reasonably practicable | Affected California residents |
| **Contractual** | Within **72 hours** | Affected merchants (per VAEO Terms of Service) |

Breach notifications include:

- Nature of the breach and approximate number of affected records
- Categories of data involved
- Likely consequences
- Measures taken to address the breach
- Contact information for follow-up

The Incident Response Plan (IRP-003) contains communication templates for breach notifications.

---

## 8. Data Minimization

VAEO follows data minimization principles:

- Only collect data necessary for service delivery (SEO optimization)
- Do not retain AI inference inputs or outputs beyond the request lifecycle
- Limit GSC data collection to the `webmasters.readonly` scope
- Limit Shopify data access to themes, content, products, and analytics
- Regularly review data collection to identify and eliminate unnecessary data points

---

*This policy is maintained by Velocity AEO, Inc. For questions, contact security@velocityaeo.com.*
