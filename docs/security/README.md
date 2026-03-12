# Velocity AEO — Security Documentation

## Overview

Velocity AEO is an automated SEO optimization platform for Shopify merchants. We process merchant store data, Google Search Console metrics, and use AI to detect and fix SEO issues. Security is foundational to our platform — merchants trust us with their store credentials and business data.

This directory contains the security policies and plans that govern how we protect that data. These documents are designed for SOC 2 Type 2 audit readiness and are reviewed annually (or more frequently when triggered by incidents or system changes).

---

## Policy Documents

| # | Document | Description |
|---|----------|-------------|
| 01 | [Information Security Policy](01_information_security_policy.md) | Security framework, data classification, roles, acceptable use, access control principles |
| 02 | [Access Control Policy](02_access_control_policy.md) | User provisioning, MFA requirements, secret management, credential rotation, access reviews |
| 03 | [Incident Response Plan](03_incident_response_plan.md) | P1-P4 classification, 5-phase response, communication templates, runbooks |
| 04 | [Change Management Policy](04_change_management_policy.md) | Change types, testing requirements, deployment process, database migrations, rollback |
| 05 | [Vendor Management Policy](05_vendor_management_policy.md) | Vendor tiers, assessment criteria, full inventory with SOC 2 status, review schedule |
| 06 | [Data Classification and Retention Policy](06_data_retention_policy.md) | Data inventory, retention schedules, deletion procedures, GDPR/CCPA compliance |
| 07 | [Business Continuity Plan](07_business_continuity_plan.md) | Impact analysis, RTO/RPO targets, vendor outage scenarios, backup procedures |

---

## SOC 2 Readiness

SOC 2 Type 2 evaluates controls across five Trust Service Criteria. The following table summarizes VAEO's current readiness:

| Trust Service Criterion | Status | Key Controls in Place | Gaps Remaining |
|------------------------|--------|----------------------|----------------|
| **CC — Security** (Common Criteria) | In Progress | MFA on all infrastructure accounts; Doppler secret management with audit logging; Supabase RLS enforcing tenant isolation; pre-commit secret scanning; 1,300+ automated tests required before deployment; TLS everywhere | Formal penetration test not yet conducted; no dedicated security monitoring/SIEM tool; single-person access review process |
| **A — Availability** | In Progress | Vercel global CDN with instant rollback; Supabase automatic failover and continuous backup (1-hour RPO); graceful degradation when Anthropic API unavailable; documented BCP with 5 threat scenarios | No formal uptime SLA published to merchants; status page not yet deployed; annual BCP test not yet conducted |
| **PI — Processing Integrity** | In Progress | Automated test suite (1,300+ tests, zero-failure deployment gate); triage engine with deterministic scoring rules; sandbox verification before fix application; audit trail for all fixes applied | No formal data validation monitoring; no automated reconciliation of applied fixes vs. expected outcomes |
| **C — Confidentiality** | In Progress | 4-level data classification (Restricted → Public); Doppler zero-knowledge encryption for secrets; Supabase AES-256 encryption at rest; credentials never logged; Anthropic API does not persist inputs | Data loss prevention (DLP) tooling not implemented; no automated classification enforcement |
| **P — Privacy** | In Progress | Data retention policy with defined schedules; 30-day deletion on cancellation; GDPR/CCPA rights documented; data minimization principles applied; GSC scope limited to readonly | Privacy impact assessment (PIA) not yet conducted; no formal cookie consent mechanism; privacy policy not yet published on website |

### Priority Remediation Items

1. **Penetration test** — Engage a third-party firm to conduct an application security assessment
2. **Status page** — Deploy a public status page for merchant transparency
3. **SIEM/monitoring** — Implement centralized log monitoring and alerting
4. **Privacy policy** — Publish a customer-facing privacy policy on the VAEO website
5. **BCP test** — Conduct the first annual business continuity tabletop exercise
6. **DLP controls** — Implement automated checks to prevent Restricted data from appearing in logs

---

## Document Control

| Attribute | Value |
|-----------|-------|
| **Last Full Review** | 2026-03-11 |
| **Next Scheduled Review** | 2027-03-11 |
| **Policy Owner** | Vincent Goodrich, CEO/Founder |
| **Contact** | security@velocityaeo.com |

All policies are version-controlled in this repository. Changes to security policies follow the Change Management Policy (CMP-004) and are tracked through git history.

---

*Velocity AEO, Inc. — security@velocityaeo.com*
