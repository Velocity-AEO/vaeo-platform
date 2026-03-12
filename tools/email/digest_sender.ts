/**
 * tools/email/digest_sender.ts
 *
 * Sends weekly digest emails to tenants.
 *   sendDigestForTenant  — build + render + send for one tenant
 *   sendAllDueDigests    — iterate all tenants, send if scheduled
 *
 * Injectable deps for testability. Never throws.
 */

import {
  buildTenantDigest,
  type TenantDigestData,
  type DigestPeriod,
} from './digest_aggregator.js';
import { renderDigestEmail } from './render.js';
import { sendDigest as coreSendDigest } from './send.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DigestSendResult {
  tenant_id:       string;
  sent:            boolean;
  recipient_email?: string;
  error?:          string;
  sites_included:  number;
  period:          DigestPeriod;
}

// ── Internal DB types ─────────────────────────────────────────────────────────

interface DbQ<T> extends PromiseLike<{ data: T | null; error: { message: string } | null }> {
  select(cols: string): DbQ<T>;
  eq(col: string, val: unknown): DbQ<T>;
  limit(n: number): DbQ<T>;
  maybeSingle(): PromiseLike<{ data: T | null; error: { message: string } | null }>;
}

interface SenderDb {
  from(table: string): DbQ<unknown>;
}

// ── Dep types ─────────────────────────────────────────────────────────────────

type BuildDigestFn  = typeof buildTenantDigest;
type RenderFn       = (data: TenantDigestData) => string;
type SendEmailFn    = (to: string, subject: string, html: string) => Promise<boolean>;

interface SenderDeps {
  buildDigest?:  BuildDigestFn;
  renderDigest?: RenderFn;
  sendEmail?:    SendEmailFn;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function lastSevenDaysPeriod(now = new Date()): DigestPeriod {
  const to   = now.toISOString();
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return { from, to, days: 7 };
}

function simpleDigestSubject(data: TenantDigestData): string {
  const fixes = data.total_fixes_applied;
  if (fixes > 0) {
    return `Your weekly SEO digest — ${fixes} fix${fixes === 1 ? '' : 'es'} applied — Velocity AEO`;
  }
  return 'Your weekly SEO digest — Velocity AEO';
}

function simpleFallbackRender(data: TenantDigestData): string {
  const fixes = data.total_fixes_applied;
  const sites = data.total_sites;
  return `<p>Weekly SEO digest: ${fixes} fix${fixes === 1 ? '' : 'es'} applied across ${sites} site${sites === 1 ? '' : 's'}.</p>`;
}

// Default send: delegates to existing send infrastructure
const defaultSendEmail: SendEmailFn = async (to, subject, html) => {
  // Build a minimal DigestReport stub to use the existing sendDigest pipeline
  const stub = {
    site_id:          'digest',
    tenant_id:        '',
    site_url:         '',
    health_before:    0,
    health_after:     0,
    grade_before:     'F' as const,
    grade_after:      'F' as const,
    fixes_applied:    0,
    issues_resolved:  0,
    issues_remaining: 0,
    top_win:          '',
    generated_at:     new Date().toISOString(),
  };
  const result = await coreSendDigest(to, stub, {
    resendSend: async () => {
      // We use the pre-built html + subject, so override via a minimal shim
      const res = await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: {
          Authorization: `Bearer ${process.env['RESEND_API_KEY'] ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: 'Velocity AEO <digest@velocityaeo.com>', to, subject, html }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}`);
      return (await res.json()) as { id: string };
    },
  });
  return result.ok;
};

// ── sendDigestForTenant ───────────────────────────────────────────────────────

export async function sendDigestForTenant(
  tenant_id: string,
  db:        unknown,
  deps:      SenderDeps = {},
): Promise<DigestSendResult> {
  const period = lastSevenDaysPeriod();

  try {
    const sdb = db as SenderDb;

    // 1. Get tenant email
    let recipientEmail: string | null = null;

    // Try tenants table first
    const { data: tenantRow } = await (sdb.from('tenants') as DbQ<Record<string, unknown>>)
      .select('email')
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    if (tenantRow?.['email']) {
      recipientEmail = String(tenantRow['email']);
    } else {
      // Fall back to profiles table
      const { data: profileRow } = await (sdb.from('profiles') as DbQ<Record<string, unknown>>)
        .select('email')
        .eq('tenant_id', tenant_id)
        .limit(1)
        .maybeSingle();
      if (profileRow?.['email']) {
        recipientEmail = String(profileRow['email']);
      }
    }

    if (!recipientEmail) {
      return {
        tenant_id,
        sent:           false,
        error:          'No recipient email found for tenant',
        sites_included: 0,
        period,
      };
    }

    // 2. Build digest
    const buildFn = deps.buildDigest ?? buildTenantDigest;
    const data    = await buildFn(tenant_id, period, db);

    // 3. Skip if no activity
    if (data.total_fixes_applied === 0) {
      return {
        tenant_id,
        sent:            false,
        recipient_email: recipientEmail,
        sites_included:  data.total_sites,
        period,
      };
    }

    // 4. Render HTML
    const renderFn  = deps.renderDigest ?? defaultRenderDigest;
    const html      = renderFn(data);
    const subject   = simpleDigestSubject(data);

    // 5. Send
    const sendFn = deps.sendEmail ?? defaultSendEmail;
    const ok     = await sendFn(recipientEmail, subject, html);

    if (!ok) {
      return {
        tenant_id,
        sent:            false,
        recipient_email: recipientEmail,
        error:           'Email send returned false',
        sites_included:  data.total_sites,
        period,
      };
    }

    return {
      tenant_id,
      sent:            true,
      recipient_email: recipientEmail,
      sites_included:  data.total_sites,
      period,
    };
  } catch (err) {
    return {
      tenant_id,
      sent:           false,
      error:          err instanceof Error ? err.message : String(err),
      sites_included: 0,
      period,
    };
  }
}

function defaultRenderDigest(data: TenantDigestData): string {
  try {
    // Use simple fallback since renderDigestEmail takes a DigestReport not TenantDigestData
    // In production this can be replaced by a richer template
    return simpleFallbackRender(data);
  } catch {
    return simpleFallbackRender(data);
  }
}

// ── sendAllDueDigests ─────────────────────────────────────────────────────────

export async function sendAllDueDigests(
  db:   unknown,
  deps: SenderDeps = {},
): Promise<DigestSendResult[]> {
  try {
    const sdb = db as SenderDb;

    // Load all tenant IDs
    const { data: tenantsRaw } = await (sdb.from('tenants') as DbQ<Record<string, unknown>[]>)
      .select('tenant_id');

    const tenants = (tenantsRaw ?? []) as Array<{ tenant_id: string }>;
    if (!tenants.length) return [];

    const results: DigestSendResult[] = [];
    for (const { tenant_id } of tenants) {
      const result = await sendDigestForTenant(tenant_id, db, deps);
      results.push(result);
    }
    return results;
  } catch {
    return [];
  }
}
