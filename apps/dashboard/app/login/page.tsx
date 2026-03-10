'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type Mode  = 'password' | 'magic-link';
type State = 'idle' | 'loading' | 'magic-sent' | 'error';

export default function LoginPage() {
  const router  = useRouter();
  const [mode,   setMode]   = useState<Mode>('password');
  const [state,  setState]  = useState<State>('idle');
  const [email,  setEmail]  = useState('');
  const [pass,   setPass]   = useState('');
  const [errMsg, setErrMsg] = useState('');

  // ── Password sign-in ─────────────────────────────────────────────────────

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setState('loading');
    setErrMsg('');

    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password: pass }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        setErrMsg(error ?? 'Sign-in failed');
        setState('error');
        return;
      }

      router.replace('/');
    } catch {
      setErrMsg('Network error — please try again');
      setState('error');
    }
  }

  // ── Magic link ───────────────────────────────────────────────────────────

  async function handleMagicLinkSubmit(e: FormEvent) {
    e.preventDefault();
    setState('loading');
    setErrMsg('');

    try {
      const res = await fetch('/api/auth/magic-link', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        setErrMsg(error ?? 'Failed to send link');
        setState('error');
        return;
      }

      setState('magic-sent');
    } catch {
      setErrMsg('Network error — please try again');
      setState('error');
    }
  }

  const loading = state === 'loading';

  return (
    // Full-screen overlay so the nav header is visually irrelevant.
    <div className="fixed inset-0 bg-[#080f1e] flex items-center justify-center p-6 z-50">
      <div className="w-full max-w-md bg-[#0f1729] rounded-xl border border-slate-700 p-8 shadow-2xl">

        {/* Logo */}
        <div className="mb-6">
          <p className="text-base font-bold text-white">Velocity AEO</p>
          <p className="text-xs text-slate-400 uppercase tracking-widest">Operator Dashboard</p>
        </div>

        <h1 className="text-xl font-semibold text-white mb-6">Sign in to your account</h1>

        {/* Error banner */}
        {state === 'error' && (
          <div className="mb-4 rounded-lg bg-red-900/40 border border-red-700 px-4 py-3 text-red-300 text-sm">
            {errMsg}
          </div>
        )}

        {/* Magic-link success */}
        {state === 'magic-sent' && (
          <div className="mb-4 rounded-lg bg-emerald-900/40 border border-emerald-700 px-4 py-3 text-emerald-300 text-sm">
            Magic link sent — check your email and click the link to sign in.
          </div>
        )}

        {/* Mode tabs */}
        <div className="flex gap-2 mb-6">
          {(['password', 'magic-link'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setState('idle'); setErrMsg(''); }}
              className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                mode === m
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {m === 'password' ? 'Password' : 'Magic Link'}
            </button>
          ))}
        </div>

        {/* ── Password form ── */}
        {mode === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={loading}
                className="w-full bg-[#0a1120] border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
                className="w-full bg-[#0a1120] border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm py-2.5 rounded-lg transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}

        {/* ── Magic-link form ── */}
        {mode === 'magic-link' && state !== 'magic-sent' && (
          <form onSubmit={handleMagicLinkSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={loading}
                className="w-full bg-[#0a1120] border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm py-2.5 rounded-lg transition-colors"
            >
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}

        <p className="mt-6 text-xs text-slate-500 text-center">
          Don&apos;t have an account?{' '}
          <a href="mailto:team@velocityaeo.com" className="text-indigo-400 hover:underline">
            Contact your admin.
          </a>
        </p>
      </div>
    </div>
  );
}
