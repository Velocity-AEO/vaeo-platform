# Change Management Policy

**Velocity AEO, Inc.**
**Document ID:** CMP-004
**Version:** 1.0
**Effective Date:** 2026-03-11
**Last Reviewed:** 2026-03-11
**Next Review:** 2027-03-11
**Owner:** Vincent Goodrich, CEO/Founder

---

## 1. Purpose and Scope

This policy defines how changes to VAEO's production systems, application code, database schemas, infrastructure configurations, and third-party integrations are requested, assessed, tested, approved, deployed, and verified.

It applies to all changes that affect:

- Application code deployed to Vercel
- Database schema or data in Supabase
- Secret and credential configurations in Doppler
- Third-party API integrations (Shopify, Google, Anthropic)
- AI model versions used for inference

---

## 2. Change Types

| Type | Description | Approval | Examples |
|------|-------------|----------|----------|
| **Standard** | Routine changes following established procedures with known, low risk | Pre-approved by policy | Feature additions, bug fixes, dependency updates, new test coverage |
| **Major** | Significant changes to architecture, data models, or security controls | Explicit founder approval + documented risk assessment | New database tables, new vendor integrations, authentication flow changes, RLS policy changes |
| **Emergency** | Changes required to resolve a P1/P2 incident or active production outage | Post-deployment review within 24 hours | Security patches, credential rotation, rollback of broken deployment |

---

## 3. Standard Change Process

Every standard change follows these steps:

### Step 1: Request and Documentation

- Changes are tracked as git commits with descriptive messages
- Feature work is developed on feature branches
- The commit message documents the "why" behind the change

### Step 2: Risk Assessment

Before merging, the developer assesses:

- Does this change modify authentication, authorization, or access control? (If yes → Major change)
- Does this change alter database schema? (If yes → see Section 6)
- Does this change introduce a new third-party dependency? (If yes → review for known vulnerabilities)
- Does this change handle Restricted data (credentials, tokens)? (If yes → additional review required)

### Step 3: Testing Requirements

All changes must pass the automated test suite before deployment:

- **Current baseline:** 1,300+ tests across all modules
- **Zero failures required** — no test may be skipped or disabled to allow deployment
- **New code must include tests** — feature additions require corresponding test coverage
- Tests run via `npm test` which executes the full suite including:
  - Unit tests for all detection, optimization, and scoring modules
  - Integration tests for the triage engine, apply engine, and sandbox verification
  - API handler tests for dashboard endpoints
  - End-to-end tests for the WordPress pipeline

The pre-commit secret scan (`npm run secret:scan:staged`) must pass — no secrets in committed code.

### Step 4: Approval

- Standard changes: self-approved by the founder after test suite passes
- As the team grows: pull request reviews will be required with minimum one approval

### Step 5: Deployment

- Merges to `main` trigger automatic deployment via Vercel
- Vercel builds the application, runs linting, and deploys to production
- Deployment is atomic — the previous version remains live until the new version is fully ready
- Doppler environment variables are synced automatically to Vercel

### Step 6: Verification

Post-deployment verification:

- Verify the dashboard loads correctly
- Verify API health endpoint responds
- Review Vercel deployment logs for errors
- For changes affecting merchant-facing features: verify on a test store

### Step 7: Rollback Procedure

If a deployment causes production issues:

1. **Immediate:** Use Vercel's instant rollback to the previous deployment (< 1 minute)
2. **Code fix:** If the issue is in application code, revert the commit, push, and let Vercel auto-deploy
3. **Database rollback:** If a migration caused the issue, apply a corrective migration (see Section 6)

Rollback does not require re-approval. Document the rollback reason in the incident log.

---

## 4. Emergency Change Process

Emergency changes bypass the standard approval process but must meet these requirements:

1. The change is necessary to resolve a P1 or P2 incident, or to address an active production outage
2. The automated test suite must still pass (no exceptions)
3. The change is deployed following the standard deployment process (merge to main → Vercel)
4. A post-deployment review is conducted within **24 hours** including:
   - Root cause of the emergency
   - The change that was made
   - Verification that the change resolved the issue
   - Any follow-up changes needed

If the test suite cannot pass due to the nature of the emergency (e.g., a test depends on a compromised third-party service), the failing test may be temporarily skipped with:

- A comment explaining the skip reason and the incident ID
- A follow-up task to re-enable the test within 5 business days

---

## 5. Prohibited Changes

The following changes are prohibited without explicit exception approval:

| Prohibited Action | Reason | Alternative |
|-------------------|--------|-------------|
| Direct SQL edits to production database | No audit trail, no rollback path, risk of data corruption | Create a Supabase migration file in `supabase/migrations/` |
| Deploying with test failures | Untested code may introduce regressions or security vulnerabilities | Fix the failing tests before deploying |
| Committing secrets to source code | Secrets in git history are permanent and cannot be fully removed | Use Doppler for all secret management |
| Disabling pre-commit hooks (`--no-verify`) | Bypasses secret scanning and other safety checks | Fix the hook failure before committing |
| Modifying RLS policies without review | Could expose merchant data across tenants | Treat as a Major change with documented risk assessment |
| Force-pushing to main | Destroys commit history and audit trail | Use revert commits instead |

---

## 6. Database Migration Process

All database schema changes follow this process:

1. **Create migration file:** Add a numbered SQL file to `supabase/migrations/` (e.g., `019_add_column.sql`)
2. **Test locally:** Apply the migration to a local or staging Supabase instance
3. **Review:** Migration files are reviewed for:
   - Data loss risk (DROP TABLE, DROP COLUMN)
   - Performance impact (large table ALTERs, missing indexes)
   - RLS policy implications
4. **Apply to production:** Run via the Supabase SQL Editor or CLI
5. **Verify:** Confirm the migration applied successfully and the application functions correctly
6. **Commit:** The migration file is committed to the repository for audit trail

### Migration Rules

- Migrations are **append-only** — never modify a previously applied migration file
- Destructive migrations (DROP) require a backup verification step before execution
- Data migrations (UPDATE, INSERT) must be idempotent — safe to run multiple times
- Migration files include a header comment with purpose and date

---

## 7. AI Model Change Process

When Anthropic releases new model versions:

1. **Assess:** Review the model changelog for changes that could affect SEO fix generation quality
2. **Test:** Run the full test suite with the new model version, paying attention to:
   - AI title/meta generation tests
   - Triage engine AI escalation tests
   - Reasoning block generation tests
3. **Compare:** Evaluate output quality on a sample of merchant pages
4. **Update:** Change the model ID in configuration and deploy through the standard process
5. **Monitor:** Watch for quality regressions in the first 48 hours post-deployment

Model version changes are treated as **Major changes** requiring documented risk assessment.

---

## 8. Change Log

All changes are tracked through:

- **Git history:** Every change is a commit with a descriptive message and author
- **Vercel deployment log:** Every deployment is recorded with timestamp, commit, and status
- **Supabase migration files:** Every schema change is a numbered SQL file in version control
- **Doppler audit log:** Every secret change is logged with timestamp and user

---

*This policy is maintained by Velocity AEO, Inc. For questions, contact security@velocityaeo.com.*
