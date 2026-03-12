# Incident Response Plan

**Velocity AEO, Inc.**
**Document ID:** IRP-003
**Version:** 1.0
**Effective Date:** 2026-03-11
**Last Reviewed:** 2026-03-11
**Next Review:** 2027-03-11
**Owner:** Vincent Goodrich, CEO/Founder

---

## 1. Purpose and Scope

This plan defines how Velocity AEO detects, responds to, contains, and recovers from security incidents. It applies to all VAEO systems, data, and third-party services that process merchant information.

An **incident** is any event that compromises the confidentiality, integrity, or availability of VAEO systems or merchant data — whether confirmed or suspected.

---

## 2. Incident Classification

| Priority | Severity | Description | Examples | Response Time |
|----------|----------|-------------|----------|--------------|
| **P1 — Critical** | Data breach or complete system compromise | Active unauthorized access to merchant data; Supabase credentials compromised; merchant Shopify tokens exposed; ransomware or destructive attack | **1 hour** |
| **P2 — High** | Significant security degradation | Unauthorized access attempt detected; single merchant credential exposed; Doppler or Vercel account compromise suspected; production deployment of vulnerable code | **4 hours** |
| **P3 — Medium** | Limited security impact | Failed brute-force attempts; non-sensitive data exposure; third-party vendor security advisory affecting VAEO; misconfigured access control caught in review | **24 hours** |
| **P4 — Low** | Minimal impact, informational | Phishing email received; security scan finding with no exploitation path; policy violation with no data impact; routine vulnerability in dev dependency | **72 hours** |

### Escalation Rules

- Any incident involving **Restricted data** (merchant credentials, OAuth tokens) is automatically P1
- Any incident reported by a third-party vendor (Supabase, Vercel, Doppler) starts at P2 minimum
- The incident commander may escalate or de-escalate based on investigation findings

---

## 3. Response Team and Contacts

| Role | Person | Contact | Backup |
|------|--------|---------|--------|
| Incident Commander | Vincent Goodrich | vincent@velocityaeo.com | — |
| Technical Lead | Vincent Goodrich | — | — |
| Communications Lead | Vincent Goodrich | — | — |

### External Contacts

| Organization | Purpose | Contact Method |
|-------------|---------|---------------|
| Supabase Support | Database incident coordination | support@supabase.io / Dashboard support |
| Vercel Support | Hosting incident coordination | Vercel Dashboard support ticket |
| Anthropic Support | API security concerns | Anthropic console support |
| Doppler Support | Secret management incidents | support@doppler.com |
| Legal Counsel | Breach notification obligations | TBD — retain before first merchant onboards |

As the team grows, additional roles (Security Engineer, VP Engineering) will be added to the response team.

---

## 4. Incident Response Phases

### Phase 1: Detection and Identification

**Objective:** Confirm that an incident has occurred and determine its scope.

Sources of detection:

- Supabase audit logs and alerts
- Vercel deployment logs and error monitoring
- Doppler access audit log (unexpected secret reads)
- GitHub security alerts (Dependabot, secret scanning)
- Merchant reports of unexpected behavior
- Pre-commit secret scan failures
- Automated test suite failures in production-bound code

Actions:

1. Acknowledge the alert and begin an incident log (timestamp, source, initial assessment)
2. Classify the incident using the priority matrix (Section 2)
3. Determine which systems and data are potentially affected
4. Preserve evidence — do not modify or delete logs

### Phase 2: Containment

**Objective:** Stop the incident from spreading while preserving evidence.

**Short-term containment (immediate):**

- Revoke compromised credentials in the issuing platform (Doppler, Supabase, Shopify Partners, Google Cloud)
- If a merchant token is compromised: revoke the specific token and notify the merchant
- If a VAEO service account is compromised: rotate the credential in Doppler; Vercel will auto-redeploy with new values
- If unauthorized code is deployed: roll back via Vercel instant rollback

**Long-term containment (hours):**

- Isolate affected systems (e.g., disable a specific API route)
- Enable enhanced logging on affected systems
- Review access logs for the scope of unauthorized activity

### Phase 3: Eradication

**Objective:** Remove the root cause of the incident.

Actions:

1. Identify the vulnerability or misconfiguration that was exploited
2. Develop and test a fix (must pass the full test suite — 1,300+ tests)
3. Deploy the fix through the standard change management process
4. Rotate all credentials that may have been exposed, even if compromise is not confirmed
5. Verify the fix by reviewing logs for continued unauthorized activity

### Phase 4: Recovery

**Objective:** Restore normal operations and verify system integrity.

Actions:

1. Restore any data from Supabase point-in-time recovery if integrity was compromised
2. Re-enable any disabled services or API routes
3. Monitor systems for 72 hours post-recovery for signs of recurrence
4. Confirm with affected merchants that their service is fully restored

### Phase 5: Post-Incident Review

**Objective:** Learn from the incident and improve defenses.

Required for all P1 and P2 incidents. Conducted within **5 business days** of resolution.

The post-mortem document includes:

- Timeline of events (detection through resolution)
- Root cause analysis
- What went well in the response
- What could be improved
- Action items with owners and due dates
- Policy or control changes required

Post-mortems are stored in the security documentation repository and reviewed during annual policy reviews.

---

## 5. Communication Templates

### Internal Escalation (P1/P2)

```
Subject: [P1/P2] Security Incident — [Brief Description]

Incident ID: INC-YYYY-NNN
Detected: [timestamp]
Classification: P1/P2
Affected Systems: [list]
Affected Data: [description]
Current Status: [Detected / Contained / Eradicated / Recovered]

Summary:
[2-3 sentence description of what happened]

Immediate Actions Taken:
- [action 1]
- [action 2]

Next Steps:
- [next step 1]
- [next step 2]
```

### Merchant Notification (Data Breach)

```
Subject: Security Notice from Velocity AEO

Dear [Merchant Name],

We are writing to inform you of a security incident that may
have affected data associated with your store [store URL].

What happened:
[Clear, non-technical description]

What data was involved:
[Specific description of affected data types]

What we have done:
[Actions taken to contain and remediate]

What you should do:
[Specific recommended actions, e.g., rotate Shopify API key]

We take the security of your data seriously and are committed
to transparency. If you have questions, please contact us at
security@velocityaeo.com.

Vincent Goodrich
Founder, Velocity AEO
```

---

## 6. Recovery Time Objectives

| Priority | Recovery Time Objective (RTO) | Recovery Point Objective (RPO) |
|----------|------------------------------|-------------------------------|
| P1 — Critical | 4 hours | 1 hour (Supabase continuous backup) |
| P2 — High | 24 hours | 1 hour |
| P3 — Medium | 72 hours | 24 hours |
| P4 — Low | 5 business days | N/A |

---

## 7. Runbooks

### 7.1 Compromised API Key

**Applies to:** Anthropic API key, Shopify API secret, Google OAuth client secret, Supabase service role key

1. **Revoke** the compromised key immediately in the issuing platform
2. **Generate** a new key in the issuing platform
3. **Update** the new key in Doppler (the Vercel integration will auto-sync)
4. **Verify** the application is functioning with the new key
5. **Review** Doppler audit logs to determine when and how the key was accessed
6. **Check** for unauthorized usage:
   - Anthropic: review usage dashboard for unexpected inference calls
   - Shopify: review partner dashboard for unexpected API calls
   - Google: review OAuth consent screen and API usage
   - Supabase: review database logs for unauthorized queries
7. **Document** the incident and file a post-mortem if unauthorized usage is confirmed

### 7.2 Unauthorized Data Access

**Applies to:** Unauthorized access to merchant data in Supabase

1. **Identify** the scope: which tables, rows, and time range were accessed
2. **Revoke** the access path (disable the account, rotate the credential, fix the RLS policy)
3. **Preserve** query logs from Supabase for forensic analysis
4. **Assess** whether Restricted data (credentials, tokens) was accessed
5. If merchant credentials were accessed:
   - Notify affected merchants within 24 hours
   - Advise merchants to rotate their Shopify access tokens
   - Revoke and re-issue any affected GSC OAuth tokens
6. **Restore** data from point-in-time recovery if integrity is compromised
7. **File** post-mortem and update RLS policies as needed

### 7.3 Third-Party Vendor Breach

**Applies to:** Security incident at Supabase, Vercel, Doppler, or Anthropic

1. **Monitor** the vendor's status page and security advisory
2. **Assess** whether VAEO data was affected based on vendor communication
3. **Rotate** all credentials stored in or accessible by the affected vendor:
   - Supabase breach: rotate service role key, all merchant tokens stored in DB
   - Vercel breach: rotate Doppler project tokens, review deployment logs
   - Doppler breach: rotate ALL credentials across ALL vendors
   - Anthropic breach: rotate API key (no persistent VAEO data stored)
4. **Review** VAEO audit logs for signs of unauthorized access during the breach window
5. **Communicate** with affected merchants if their data was potentially exposed
6. **Document** the incident and review vendor relationship under VMP-005

---

## 8. Annual Testing

The Incident Response Plan is tested annually through:

- **Tabletop exercise:** Walk through a simulated P1 scenario with all response team members
- **Credential rotation drill:** Execute the compromised API key runbook against a non-production credential
- **Communication test:** Send a test merchant notification to verify delivery and content

Test results are documented and any identified improvements are incorporated into the next policy revision.

---

*This policy is maintained by Velocity AEO, Inc. For questions, contact security@velocityaeo.com.*
