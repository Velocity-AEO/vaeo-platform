/**
 * app/api/auth/login/handler.ts
 *
 * Pure business logic for email/password sign-in.
 * No Next.js imports. All Supabase calls injectable via LoginDeps.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginDeps {
  /**
   * Attempt sign-in. Returns the session on success, or an error message.
   * Never throws — wrap in try/catch at the call site if needed.
   */
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ session: unknown | null; error: string | null }>;
}

export interface LoginResult {
  ok: boolean;
  session?: unknown;
  error?: string;
  status: number;
}

// ── Input validation ──────────────────────────────────────────────────────────

export type ValidationResult<T> =
  | { valid: true } & T
  | { valid: false; error: string };

/**
 * Validate raw request body. Returns validated fields or an error string.
 * Does NOT call any external service.
 */
export function validateLoginInput(
  input: unknown,
): ValidationResult<LoginInput> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const { email, password } = input as Record<string, unknown>;

  if (!email || typeof email !== 'string' || !email.includes('@') || email.trim().length < 5) {
    return { valid: false, error: 'A valid email address is required' };
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters' };
  }

  return { valid: true, email: email.trim(), password };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handleLogin(
  input: LoginInput,
  deps: LoginDeps,
): Promise<LoginResult> {
  try {
    const { session, error } = await deps.signIn(input.email, input.password);
    if (error) {
      return { ok: false, error, status: 401 };
    }
    return { ok: true, session, status: 200 };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      status: 500,
    };
  }
}
