# Access Control Policy

**Velocity AEO, Inc.**
**Document ID:** ACP-002
**Version:** 1.0
**Effective Date:** 2026-03-11
**Last Reviewed:** 2026-03-11
**Next Review:** 2027-03-11
**Owner:** Vincent Goodrich, CEO/Founder

---

## 1. Purpose and Scope

This policy defines how access to VAEO systems, data, and infrastructure is granted, managed, reviewed, and revoked. It applies to all human users, service accounts, and AI systems that interact with VAEO resources.

VAEO is currently operated by a single founder. This policy is designed to scale as the team grows, while providing appropriate controls for the current organizational structure.

---

## 2. User Access Management

### 2.1 Provisioning

New access is granted based on the following principles:

- **Role-based:** Access is assigned by role, not by individual request
- **Least privilege:** Only the permissions required for the role are granted
- **Documented:** All access grants are recorded with date, role, and approver

| Role | Systems | Access Level |
|------|---------|-------------|
| Founder/Admin | All systems | Full administrative access |
| Future Engineer | GitHub, Vercel (preview), Supabase (read-only dashboard) | Development access, no production credentials |
| Future Support | Dashboard (read-only) | Tenant-scoped read access |
| Service Account (CI/CD) | GitHub Actions, Vercel, Doppler (project-scoped) | Automated deployment only |

### 2.2 Deprovisioning

When a user's role changes or they leave the organization:

- All access is revoked within **24 hours** of role change or departure
- API keys and tokens associated with the user are rotated
- Active sessions are terminated
- Deprovisioning is logged in the access change register

### 2.3 Access Review

All user access is reviewed quarterly (see Section 8).

---

## 3. Authentication Requirements

### 3.1 Password Policy

All accounts that support password authentication must meet:

- Minimum 16 characters
- No reuse of the last 12 passwords
- Passwords stored only in a password manager (1Password, Bitwarden, or equivalent)
- No shared passwords between services

### 3.2 Multi-Factor Authentication (MFA)

MFA is **required** for:

| System | MFA Method |
|--------|-----------|
| GitHub | TOTP or hardware key |
| Supabase Dashboard | TOTP |
| Vercel Dashboard | TOTP |
| Doppler Dashboard | TOTP |
| Google Account (GSC) | TOTP or hardware key |
| Stripe Dashboard | TOTP |

MFA must be enabled before any Restricted or Confidential data can be accessed through these dashboards.

### 3.3 Session Management

- Dashboard user sessions expire after **8 hours** of inactivity
- API tokens do not expire but are rotated on schedule (see Section 5)
- Supabase JWTs are refreshed automatically via middleware; expired JWTs are rejected
- OAuth tokens (Shopify, GSC) are validated for expiry before each use, with a 5-minute buffer

---

## 4. Privileged Access

### 4.1 Administrative Accounts

The founder holds administrative access to all systems. Privileged access is controlled as follows:

- Admin actions on production databases require Doppler-managed credentials — never stored locally
- Direct SQL access to Supabase production is restricted to the SQL Editor with audit logging
- `SUPABASE_SERVICE_ROLE_KEY` is stored only in Doppler and injected at runtime
- No root or superuser SSH access exists — all infrastructure is serverless (Vercel, Supabase)

### 4.2 Service Accounts

| Service Account | System | Purpose | Credential Storage |
|-----------------|--------|---------|-------------------|
| Vercel deploy | GitHub → Vercel | Automated deployments | Vercel integration (OAuth) |
| Supabase service role | VAEO API | Database operations bypassing RLS | Doppler |
| Anthropic API key | VAEO API | AI inference requests | Doppler |
| Shopify API credentials | VAEO API | OAuth flow for merchant stores | Doppler |
| Google OAuth credentials | VAEO API | GSC integration | Doppler |

Service accounts:

- Have the minimum scopes required for their function
- Are not used for interactive access
- Have their credentials rotated per the schedule in Section 5

---

## 5. Secret and Credential Management

### 5.1 Secret Store

**Doppler** is the single source of truth for all secrets and credentials. No secrets are stored in:

- Source code or git history
- Environment variable files (`.env`) committed to the repository
- Local developer machines (except temporarily via `doppler run`)
- Vercel environment variables directly (Doppler integration syncs to Vercel)

A pre-commit secret scan (`npm run secret:scan:staged`) runs on every commit to prevent accidental secret exposure.

### 5.2 Rotation Schedule

| Credential | Rotation Frequency | Procedure |
|------------|-------------------|-----------|
| Supabase service role key | Annual or on compromise | Regenerate in Supabase dashboard, update Doppler |
| Anthropic API key | Annual or on compromise | Regenerate in Anthropic console, update Doppler |
| Shopify API secret | Annual or on compromise | Regenerate in Shopify Partners, update Doppler |
| Google OAuth client secret | Annual or on compromise | Regenerate in Google Cloud Console, update Doppler |
| Merchant Shopify access tokens | On merchant revocation | Automatic via Shopify OAuth flow |
| Merchant GSC OAuth tokens | On expiry (auto-refresh) | Automatic via refresh token flow |

### 5.3 Compromised Credential Response

If any credential is suspected to be compromised:

1. Revoke the credential immediately in the issuing platform
2. Generate a new credential and update Doppler
3. Verify no unauthorized access occurred using audit logs
4. Follow the Incident Response Plan (IRP-003) if data exposure is confirmed

---

## 6. Third-Party Access

### 6.1 Vendor Access Controls

Each third-party vendor has defined access boundaries:

| Vendor | Data Access | Controls |
|--------|------------|----------|
| **Supabase** | All database contents (encrypted at rest, RLS enforced) | SOC 2 Type 2, encryption at rest (AES-256), TLS in transit, point-in-time recovery |
| **Vercel** | Application code, environment variables (via Doppler sync) | SOC 2 Type 2, edge isolation, no persistent storage of request data |
| **Anthropic** | Page content submitted per-request for AI inference | No persistent storage of inputs, SOC 2 Type 2, API usage policy prohibits training on customer data |
| **Doppler** | All secrets and credentials (encrypted, access-logged) | SOC 2 Type 2, zero-knowledge encryption, audit log for all reads |
| **Google** | Search performance data for connected GSC properties | OAuth 2.0, scoped to `webmasters.readonly`, tokens stored in Supabase |
| **GitHub** | Source code repository | SOC 2 Type 2, branch protection, required reviews |

### 6.2 Vendor Access Reviews

Vendor access is reviewed as part of the annual Vendor Management assessment (VMP-005). Reviews verify:

- The vendor's SOC 2 report (or equivalent) remains current
- Data access is still limited to the documented scope
- No unauthorized data sharing or sub-processing has occurred

---

## 7. Remote Access

VAEO is a fully remote organization. All access to production systems occurs over the internet through vendor-provided dashboards and APIs. Controls include:

- All connections use TLS 1.2 or higher
- No VPN or direct server access exists — infrastructure is fully serverless
- Dashboard access requires MFA (see Section 3.2)
- API access requires valid authentication tokens
- The founder's development machine uses full-disk encryption

---

## 8. Access Review Schedule

| Review Activity | Frequency | Scope |
|----------------|-----------|-------|
| User access audit | Quarterly | All human accounts across all systems |
| Service account audit | Quarterly | All service accounts and API keys |
| MFA compliance check | Quarterly | Verify MFA enabled on all required accounts |
| Credential rotation check | Quarterly | Verify rotation schedule compliance |
| Vendor access review | Annual | All Tier 1 and Tier 2 vendors |
| Permission scope review | Annual | Verify least-privilege for all accounts |

Reviews are documented with date, findings, and any corrective actions taken. Evidence is retained for 2 years.

---

*This policy is maintained by Velocity AEO, Inc. For questions, contact security@velocityaeo.com.*
