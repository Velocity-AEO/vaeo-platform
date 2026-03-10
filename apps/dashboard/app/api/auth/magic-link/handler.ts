/**
 * app/api/auth/magic-link/handler.ts
 *
 * Pure business logic for sending a Supabase magic-link OTP email.
 * No Next.js imports. All Supabase calls injectable via MagicLinkDeps.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MagicLinkDeps {
  /**
   * Send a one-time-password email. Returns { error } on failure, null error on success.
   * Never throws.
   */
  sendOtp: (email: string) => Promise<{ error: string | null }>;
}

export interface MagicLinkResult {
  ok: boolean;
  error?: string;
  status: number;
}

// ── Validation ────────────────────────────────────────────────────────────────

/** Minimal email sanity check — Supabase validates fully on its side. */
export function validateEmail(raw: unknown): { valid: true; email: string } | { valid: false; error: string } {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, error: 'Email is required' };
  }
  const email = raw.trim();
  if (!email.includes('@') || email.length < 5) {
    return { valid: false, error: 'A valid email address is required' };
  }
  return { valid: true, email };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handleMagicLink(
  input: { email?: unknown },
  deps: MagicLinkDeps,
): Promise<MagicLinkResult> {
  const validation = validateEmail(input.email);
  if (!validation.valid) {
    return { ok: false, error: validation.error, status: 400 };
  }

  try {
    const { error } = await deps.sendOtp(validation.email);
    if (error) {
      return { ok: false, error, status: 500 };
    }
    return { ok: true, status: 200 };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      status: 500,
    };
  }
}
