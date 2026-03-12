/**
 * tools/security/secret_tracker.ts
 *
 * Secret rotation policy tracker for SOC 2 compliance.
 * Pure functions — no I/O, never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SecretEntry {
  name:                   string;
  provider:               'doppler' | 'env' | 'supabase';
  last_rotated?:          string;  // ISO date string
  rotation_interval_days: number;
  is_overdue:             boolean;
  days_until_rotation:    number;
  description:            string;
}

// ── VAEO_SECRETS ──────────────────────────────────────────────────────────────

/** Baseline secret definitions (without computed fields). */
const SECRET_DEFS: Omit<SecretEntry, 'is_overdue' | 'days_until_rotation'>[] = [
  {
    name:                   'ANTHROPIC_API_KEY',
    provider:               'doppler',
    rotation_interval_days: 90,
    description:            'Anthropic Claude API key for AI title/meta generation',
  },
  {
    name:                   'SHOPIFY_API_SECRET',
    provider:               'doppler',
    rotation_interval_days: 180,
    description:            'Shopify Admin API secret for store access',
  },
  {
    name:                   'SUPABASE_SERVICE_ROLE_KEY',
    provider:               'supabase',
    rotation_interval_days: 180,
    description:            'Supabase service role key for server-side DB access',
  },
  {
    name:                   'NEXTAUTH_SECRET',
    provider:               'doppler',
    rotation_interval_days: 90,
    description:            'NextAuth session signing secret',
  },
  {
    name:                   'STRIPE_SECRET_KEY',
    provider:               'doppler',
    rotation_interval_days: 180,
    description:            'Stripe API key for billing',
  },
  {
    name:                   'GOOGLE_CLIENT_SECRET',
    provider:               'doppler',
    rotation_interval_days: 180,
    description:            'Google OAuth client secret for GSC integration',
  },
  {
    name:                   'DATABASE_URL',
    provider:               'doppler',
    rotation_interval_days: 365,
    description:            'Primary database connection string',
  },
];

/** Compute is_overdue and days_until_rotation relative to referenceDate. */
function computeFields(
  def: Omit<SecretEntry, 'is_overdue' | 'days_until_rotation'>,
  referenceDate: Date,
): SecretEntry {
  if (!def.last_rotated) {
    return { ...def, is_overdue: true, days_until_rotation: -def.rotation_interval_days };
  }

  const lastRotated  = new Date(def.last_rotated);
  const nextRotation = new Date(lastRotated.getTime() + def.rotation_interval_days * 86_400_000);
  const msUntil      = nextRotation.getTime() - referenceDate.getTime();
  const daysUntil    = Math.ceil(msUntil / 86_400_000);

  return {
    ...def,
    is_overdue:          daysUntil < 0,
    days_until_rotation: daysUntil,
  };
}

/** Platform secret definitions, computed as of now. */
export const VAEO_SECRETS: SecretEntry[] = SECRET_DEFS.map((d) => computeFields(d, new Date()));

// ── getRotationStatus ─────────────────────────────────────────────────────────

export interface RotationStatus {
  overdue:   SecretEntry[];
  due_soon:  SecretEntry[];
  ok:        SecretEntry[];
  summary:   string;
}

export function getRotationStatus(
  secrets:       SecretEntry[],
  referenceDate: Date = new Date(),
): RotationStatus {
  // Re-compute is_overdue / days_until_rotation against referenceDate for each provided secret
  const recomputed = secrets.map((s) => {
    const def: Omit<SecretEntry, 'is_overdue' | 'days_until_rotation'> = {
      name:                   s.name,
      provider:               s.provider,
      last_rotated:           s.last_rotated,
      rotation_interval_days: s.rotation_interval_days,
      description:            s.description,
    };
    return computeFields(def, referenceDate);
  });

  const overdue  = recomputed.filter((s) => s.is_overdue);
  const due_soon = recomputed.filter((s) => !s.is_overdue && s.days_until_rotation <= 30);
  const ok       = recomputed.filter((s) => !s.is_overdue && s.days_until_rotation > 30);

  const parts: string[] = [];
  if (overdue.length)  parts.push(`${overdue.length} overdue`);
  if (due_soon.length) parts.push(`${due_soon.length} due soon`);
  if (ok.length)       parts.push(`${ok.length} ok`);
  const summary = parts.join(', ') || 'no secrets tracked';

  return { overdue, due_soon, ok, summary };
}

// ── generateRotationReport ────────────────────────────────────────────────────

export function generateRotationReport(secrets: SecretEntry[]): string {
  const status = getRotationStatus(secrets);
  const now    = new Date().toISOString().slice(0, 10);

  const lines: string[] = [
    `# Secret Rotation Report`,
    ``,
    `**Generated:** ${now}  `,
    `**Summary:** ${status.summary}`,
    ``,
  ];

  if (status.overdue.length > 0) {
    lines.push(`## 🔴 Overdue (${status.overdue.length})`);
    lines.push('');
    for (const s of status.overdue) {
      lines.push(`- **${s.name}** (${s.provider}) — ${Math.abs(s.days_until_rotation)}d overdue`);
      lines.push(`  _${s.description}_`);
    }
    lines.push('');
  }

  if (status.due_soon.length > 0) {
    lines.push(`## 🟡 Due Soon (${status.due_soon.length})`);
    lines.push('');
    for (const s of status.due_soon) {
      lines.push(`- **${s.name}** (${s.provider}) — ${s.days_until_rotation}d remaining`);
      lines.push(`  _${s.description}_`);
    }
    lines.push('');
  }

  if (status.ok.length > 0) {
    lines.push(`## 🟢 OK (${status.ok.length})`);
    lines.push('');
    for (const s of status.ok) {
      const rotatedOn = s.last_rotated ? s.last_rotated.slice(0, 10) : 'never';
      lines.push(`- **${s.name}** (${s.provider}) — rotated ${rotatedOn}, next in ${s.days_until_rotation}d`);
    }
    lines.push('');
  }

  lines.push(`## Policy`);
  lines.push('');
  lines.push('| Secret | Provider | Interval |');
  lines.push('|--------|----------|----------|');
  for (const s of secrets) {
    lines.push(`| ${s.name} | ${s.provider} | ${s.rotation_interval_days}d |`);
  }

  return lines.join('\n');
}
