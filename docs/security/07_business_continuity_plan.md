# Business Continuity Plan

**Velocity AEO, Inc.**
**Document ID:** BCP-007
**Version:** 1.0
**Effective Date:** 2026-03-11
**Last Reviewed:** 2026-03-11
**Next Review:** 2027-03-11
**Owner:** Vincent Goodrich, CEO/Founder

---

## 1. Purpose and Scope

This plan ensures that Velocity AEO can maintain or rapidly restore critical business functions in the event of a disruption — whether caused by a vendor outage, infrastructure failure, security incident, or personnel unavailability.

It covers all systems required for VAEO to deliver its core service: automated SEO optimization for Shopify merchants.

---

## 2. Business Impact Analysis

### Critical Functions

| Function | Description | Impact of Loss | Maximum Tolerable Downtime |
|----------|-------------|----------------|---------------------------|
| **Dashboard access** | Merchants view health scores, approve fixes, review learnings | Merchants cannot monitor their SEO status | 4 hours |
| **Fix pipeline** | Detection, triage, apply engine, sandbox verification | New SEO issues accumulate unfixed; no merchant harm from delay | 24 hours |
| **Merchant data integrity** | Site records, credentials, fix history, audit logs | Data loss would break merchant trust and service delivery | 0 (no data loss acceptable) |
| **Billing** | Subscription management, payment processing | Revenue collection paused; no service impact to merchants | 72 hours |
| **Onboarding** | New merchant registration and first crawl | New merchants cannot sign up; existing merchants unaffected | 24 hours |

### Dependencies

| System | Functions Dependent | Single Point of Failure? |
|--------|-------------------|-------------------------|
| Supabase | All functions (database) | Yes — mitigated by automatic failover and continuous backups |
| Vercel | Dashboard, API, onboarding | Yes — mitigated by CDN caching and static fallback |
| Anthropic | Fix generation (AI triage, title/meta generation) | No — fixes queue and process when available |
| Doppler | All functions (secrets) | Partial — Vercel caches environment variables |
| Google (GSC) | Priority scoring enrichment | No — triage functions without GSC data |
| Stripe | Billing only | No — existing subscriptions continue |
| Founder | All functions | Yes — mitigated by documentation and emergency procedures |

---

## 3. Recovery Objectives

| Metric | Target | Justification |
|--------|--------|---------------|
| **RTO** (Recovery Time Objective) | **4 hours** for critical functions | Merchants expect dashboard access within a business day |
| **RPO** (Recovery Point Objective) | **1 hour** | Supabase continuous backup with point-in-time recovery to any second in the last 7 days |
| **MTPD** (Maximum Tolerable Period of Disruption) | **24 hours** for full service | Beyond 24 hours, merchant impact becomes significant |

---

## 4. Threat Scenarios and Response

### Scenario 1: Vercel Outage

**Impact:** Dashboard inaccessible, API routes unavailable, no fix application

**Response:**

1. **Detect:** Monitor Vercel status page (status.vercel.com) and automated uptime checks
2. **Communicate:** Post status update to merchant-facing status page within 1 hour
3. **Mitigate:**
   - Vercel's global CDN caches static assets — dashboard may partially function
   - API routes will be unavailable; fix pipeline queues naturally (no data loss)
   - No merchant data is at risk (data is in Supabase, not Vercel)
4. **Recover:** Service automatically restores when Vercel recovers — no action required
5. **Fallback:** If outage exceeds 4 hours, evaluate emergency migration to alternative host

**Expected RTO:** Dependent on Vercel (historical SLA: 99.99% uptime)

### Scenario 2: Supabase Outage

**Impact:** All data inaccessible, dashboard shows errors, no fix processing

**Response:**

1. **Detect:** Monitor Supabase status page (status.supabase.com) and database connection health checks
2. **Communicate:** Notify merchants of read-only or degraded mode within 1 hour
3. **Mitigate:**
   - Supabase provides automatic failover for managed databases
   - Dashboard can display cached/static content (no live data)
   - Fix pipeline pauses naturally — no data loss, queued items process on recovery
4. **Recover:**
   - If automatic failover resolves the issue: verify data integrity, resume operations
   - If data corruption occurred: restore from point-in-time backup (RPO: 1 hour)
5. **Fallback:** If outage exceeds 4 hours, contact Supabase support for escalation

**Expected RTO:** < 1 hour (automatic failover); 2–4 hours if manual restore required

### Scenario 3: Anthropic API Outage

**Impact:** AI-powered features unavailable — no AI triage, no title/meta generation

**Response:**

1. **Detect:** API errors in application logs, Anthropic status page
2. **Impact Assessment:** This is a **non-critical** disruption:
   - Triage engine falls back to rule-based scoring (matrix + page type score)
   - Fix generation queues items for processing when API returns
   - Dashboard remains fully functional
   - No merchant data is at risk
3. **Mitigate:** No action required — the system degrades gracefully
4. **Recover:** AI features automatically resume when the API recovers
5. **Monitor:** Track queued items to ensure they process after recovery

**Expected RTO:** N/A — service continues in degraded mode

### Scenario 4: Doppler Outage

**Impact:** Cannot deploy new versions, cannot rotate secrets

**Response:**

1. **Detect:** Doppler status page, deployment failures
2. **Impact Assessment:** **Limited** — Vercel caches environment variables from the last successful sync
   - Running production deployment is unaffected
   - New deployments will fail until Doppler recovers
   - Secret rotation is blocked
3. **Mitigate:**
   - Production service continues operating with cached secrets
   - Defer any deployments until Doppler recovers
   - If emergency deployment is required: temporarily set Vercel environment variables manually (documented as emergency change)
4. **Recover:** Resume normal operations when Doppler recovers; verify Vercel sync is current

**Expected RTO:** N/A for running services; deployment blocked until recovery

### Scenario 5: Founder Incapacitation

**Impact:** No one available to respond to incidents, deploy fixes, or manage infrastructure

**Response:**

This is the highest-risk single point of failure. Mitigations:

1. **All credentials** are stored in Doppler with documented access procedures
2. **Emergency access document** (stored securely, separate from Doppler) contains:
   - Doppler master token recovery procedure
   - Supabase project admin credentials
   - Vercel team admin access
   - GitHub repository owner access
   - Stripe account access
   - Google Cloud project access
   - Domain registrar access
3. **Designated emergency contact** (to be established) can:
   - Access the emergency document
   - Contact vendors for account recovery
   - Engage a contract security engineer if needed
4. **Automated systems continue running:**
   - Vercel serves the dashboard without intervention
   - Supabase maintains data with automatic backups
   - Stripe continues billing
   - The fix pipeline pauses but does not lose data

**Action Items:**

- Designate an emergency contact and provide them with the emergency access document
- Review and update the emergency document quarterly
- Consider a bus factor > 1 as the team grows

---

## 5. Communication Plan

### Merchant Communication

| Situation | Channel | Timeline | Template |
|-----------|---------|----------|----------|
| Planned maintenance | Status page + email | 48 hours advance notice | "Scheduled maintenance on [date] from [time] to [time]. Brief service interruption expected." |
| Unplanned outage (< 1 hour) | Status page | Within 30 minutes | "We're experiencing a brief disruption. Your data is safe. Investigating now." |
| Extended outage (> 1 hour) | Status page + email | Within 1 hour | "Service is currently unavailable due to [cause]. Your data is safe. Estimated restoration: [time]." |
| Data incident | Email (direct) | Within 72 hours | Use IRP-003 merchant notification template |

### Status Page

VAEO maintains a public status page showing:

- Current operational status of dashboard, API, and fix pipeline
- Historical uptime
- Incident reports and post-mortems

---

## 6. Backup and Recovery

| System | Backup Method | Backup Frequency | Retention | Recovery Procedure |
|--------|-------------|-------------------|-----------|-------------------|
| Supabase (database) | Continuous point-in-time recovery | Continuous (every transaction) | 7 days PITR + daily snapshots for 30 days | Restore via Supabase dashboard to any point in time |
| Supabase (migrations) | Git version control | Every schema change | Indefinite (git history) | Re-apply migrations in order |
| Application code | Git (GitHub) | Every commit | Indefinite (git history) | Redeploy from any commit via Vercel |
| Secrets (Doppler) | Doppler versioning | Every change | Doppler retains version history | Restore previous version in Doppler dashboard |
| Vercel deployments | Vercel deployment history | Every deployment | 30 days of deployments | Instant rollback to any previous deployment |

---

## 7. Testing Schedule

The Business Continuity Plan is tested annually:

| Test | Description | Frequency |
|------|-------------|-----------|
| Database restore drill | Restore Supabase from PITR to a test environment, verify data integrity | Annual |
| Deployment rollback test | Roll back a production deployment and verify service continuity | Annual |
| Secret rotation drill | Rotate a non-critical credential end-to-end (Doppler → Vercel → verify) | Annual |
| Tabletop exercise | Walk through a vendor outage scenario with documented decision points | Annual |
| Emergency document review | Verify emergency access document is current and accessible | Quarterly |

Test results are documented and findings are incorporated into the next plan revision.

---

*This policy is maintained by Velocity AEO, Inc. For questions, contact security@velocityaeo.com.*
