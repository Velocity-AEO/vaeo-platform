'use client';

import { useState, FormEvent, useEffect } from 'react';

type Step  = 'workspace' | 'connect-site';
type State = 'idle' | 'loading' | 'error';

export default function OnboardingPage() {
  const [step,         setStep]       = useState<Step>('workspace');
  const [state,        setState]      = useState<State>('idle');
  const [errorMsg,     setErrorMsg]   = useState('');
  const [workspaceName, setName]      = useState('');
  const [storeUrl,     setStoreUrl]   = useState('');

  // Check if tenant already exists — if so, skip the workspace step.
  useEffect(() => {
    fetch('/api/tenants/me')
      .then((r) => { if (r.ok) setStep('connect-site'); })
      .catch(() => { /* network error — stay on workspace step */ });
  }, []);

  // ── Step 1: Create workspace ─────────────────────────────────────────────

  async function handleWorkspaceSubmit(e: FormEvent) {
    e.preventDefault();
    setState('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/tenants/me', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: workspaceName.trim() || 'My Workspace' }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        setErrorMsg(error ?? 'Failed to create workspace');
        setState('error');
        return;
      }

      setState('idle');
      setStep('connect-site');
    } catch {
      setErrorMsg('Network error — please try again');
      setState('error');
    }
  }

  // ── Step 2: Connect first Shopify site ───────────────────────────────────

  function handleShopifySubmit(e: FormEvent) {
    e.preventDefault();
    setState('loading');
    setErrorMsg('');

    let shop = storeUrl.trim().toLowerCase();
    shop = shop.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (!shop.includes('.')) shop = `${shop}.myshopify.com`;

    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
      setState('error');
      setErrorMsg('Please enter a valid myshopify.com domain (e.g. mystore.myshopify.com)');
      return;
    }

    window.location.href = `/api/shopify/install?shop=${encodeURIComponent(shop)}`;
  }

  const loading = state === 'loading';

  return (
    <main className="min-h-screen bg-[#080f1e] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-[#0f1729] rounded-xl border border-slate-700 p-8 shadow-2xl">

        {/* Progress indicator */}
        <div className="flex items-center gap-2 mb-8">
          {(['workspace', 'connect-site'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step === s
                  ? 'bg-indigo-600 text-white'
                  : i < (['workspace', 'connect-site'] as Step[]).indexOf(step)
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-700 text-slate-400'
              }`}>
                {i + 1}
              </div>
              {i < 1 && <div className="flex-1 h-px bg-slate-700 w-8" />}
            </div>
          ))}
          <span className="text-xs text-slate-400 ml-2">
            {step === 'workspace' ? 'Create workspace' : 'Connect first site'}
          </span>
        </div>

        {/* Error banner */}
        {state === 'error' && (
          <div className="mb-4 rounded-lg bg-red-900/40 border border-red-700 px-4 py-3 text-red-300 text-sm">
            {errorMsg}
          </div>
        )}

        {/* ── Step 1: Workspace name ── */}
        {step === 'workspace' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-1">Create your workspace</h1>
            <p className="text-sm text-slate-400 mb-6">
              Give your Vaeo workspace a name — you can change this later.
            </p>

            <form onSubmit={handleWorkspaceSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                  Workspace name
                </label>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Agency"
                  disabled={loading}
                  className="w-full bg-[#0a1120] border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm py-2.5 rounded-lg transition-colors"
              >
                {loading ? 'Creating…' : 'Continue'}
              </button>
            </form>
          </>
        )}

        {/* ── Step 2: Connect Shopify site ── */}
        {step === 'connect-site' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-1">Connect a Shopify Site</h1>
            <p className="text-sm text-slate-400 mb-6">
              Enter your store URL to connect via Shopify OAuth. You&apos;ll be redirected to
              Shopify to authorise access.
            </p>

            <form onSubmit={handleShopifySubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                  Store URL
                </label>
                <input
                  type="text"
                  value={storeUrl}
                  onChange={(e) => setStoreUrl(e.target.value)}
                  placeholder="mystore.myshopify.com"
                  required
                  disabled={loading}
                  className="w-full bg-[#0a1120] border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Scopes requested: themes, content, products, analytics (read/write)
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm py-2.5 rounded-lg transition-colors"
              >
                {loading ? 'Redirecting to Shopify…' : 'Connect with Shopify'}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-700">
              <p className="text-xs text-slate-500 text-center">
                Vaeo will request read/write access to themes and content, plus read access
                to products and analytics.
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
