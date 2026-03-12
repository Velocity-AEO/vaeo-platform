'use client';

import { useState, FormEvent, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

type WizardStep = 'connect_shopify' | 'connect_gsc' | 'first_crawl' | 'review_issues' | 'complete';
type State = 'idle' | 'loading' | 'error';

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'connect_shopify', label: 'Connect Shopify' },
  { key: 'connect_gsc',     label: 'Connect GSC' },
  { key: 'first_crawl',     label: 'First Crawl' },
  { key: 'review_issues',   label: 'Review Issues' },
  { key: 'complete',        label: 'Complete' },
];

export default function OnboardingPage() {
  const searchParams = useSearchParams();
  const siteIdParam  = searchParams.get('site_id');
  const stepParam    = searchParams.get('step') as WizardStep | null;

  const [step,       setStep]       = useState<WizardStep>(stepParam ?? 'connect_shopify');
  const [state,      setState]      = useState<State>('idle');
  const [errorMsg,   setErrorMsg]   = useState('');
  const [storeUrl,   setStoreUrl]   = useState('');
  const [siteId,     setSiteId]     = useState(siteIdParam ?? '');
  const [crawling,   setCrawling]   = useState(false);
  const [issueCount, setIssueCount] = useState(0);

  // Load onboarding status if we have a site_id
  useEffect(() => {
    if (!siteId) return;
    fetch(`/api/onboarding/status/${siteId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.current_step) {
          setStep(data.current_step as WizardStep);
          if (data.issues_found) setIssueCount(data.issues_found);
        }
      })
      .catch(() => {});
  }, [siteId]);

  // Handle GSC callback redirect
  useEffect(() => {
    if (searchParams.get('gsc') === 'connected' && siteId) {
      completeStep('connect_gsc', { gsc_connected: true });
    }
  }, [searchParams, siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const completeStep = useCallback(async (
    s: WizardStep,
    data?: Record<string, unknown>,
  ) => {
    if (!siteId) return;
    try {
      const res = await fetch('/api/onboarding/complete-step', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ site_id: siteId, step: s, data }),
      });
      if (res.ok) {
        const result = await res.json() as { onboarding: { current_step: WizardStep } };
        setStep(result.onboarding.current_step);
      }
    } catch {}
  }, [siteId]);

  const stepIndex    = STEPS.findIndex((s) => s.key === step);
  const loading      = state === 'loading';

  // ── Step 1: Connect Shopify ─────────────────────────────────────────────

  function handleShopifySubmit(e: FormEvent) {
    e.preventDefault();
    setState('loading');
    setErrorMsg('');

    let shop = storeUrl.trim().toLowerCase();
    shop = shop.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (!shop.includes('.')) shop = `${shop}.myshopify.com`;

    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
      setState('error');
      setErrorMsg('Please enter a valid myshopify.com domain');
      return;
    }

    // Register site first, then redirect to Shopify OAuth
    fetch('/api/onboarding/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ shop_domain: shop, tenant_id: 'self-serve' }),
    })
      .then((r) => r.json())
      .then((data: { ok: boolean; site_id?: string; error?: string }) => {
        if (!data.ok) {
          setErrorMsg(data.error ?? 'Registration failed');
          setState('error');
          return;
        }
        if (data.site_id) setSiteId(data.site_id);
        window.location.href = `/api/shopify/install?shop=${encodeURIComponent(shop)}`;
      })
      .catch(() => {
        setErrorMsg('Network error — please try again');
        setState('error');
      });
  }

  // ── Step 2: Connect GSC ─────────────────────────────────────────────────

  function handleGSCConnect() {
    window.location.href = `/api/gsc/connect?site_id=${siteId}`;
  }

  function handleSkipGSC() {
    completeStep('connect_gsc', { gsc_connected: false });
  }

  // ── Step 3: First Crawl ─────────────────────────────────────────────────

  async function handleStartCrawl() {
    setCrawling(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/onboarding/start-crawl', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ site_id: siteId }),
      });

      if (!res.ok) {
        setErrorMsg('Failed to start crawl');
        setCrawling(false);
        return;
      }

      // Poll for completion
      const poll = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/onboarding/status/${siteId}`);
          if (statusRes.ok) {
            const data = await statusRes.json() as { current_step: string; issues_found: number };
            if (data.current_step !== 'first_crawl') {
              clearInterval(poll);
              setCrawling(false);
              setIssueCount(data.issues_found);
              setStep(data.current_step as WizardStep);
            }
          }
        } catch {}
      }, 3000);

      // Stop polling after 5 minutes
      setTimeout(() => {
        clearInterval(poll);
        setCrawling(false);
        completeStep('first_crawl', { first_crawl_done: true });
      }, 300000);
    } catch {
      setErrorMsg('Network error');
      setCrawling(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#080f1e] flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-[#0f1729] rounded-xl border border-slate-700 p-8 shadow-2xl">

        {/* Step indicators */}
        <div className="flex items-center gap-1 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                i < stepIndex
                  ? 'bg-emerald-600 text-white'
                  : i === stepIndex
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-700 text-slate-400'
              }`}>
                {i < stepIndex ? '\u2713' : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px ${i < stepIndex ? 'bg-emerald-600' : 'bg-slate-700'}`} />
              )}
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-400 mb-6 text-center">
          {STEPS[stepIndex]?.label ?? 'Setup'}
        </p>

        {/* Error banner */}
        {(state === 'error' || errorMsg) && (
          <div className="mb-4 rounded-lg bg-red-900/40 border border-red-700 px-4 py-3 text-red-300 text-sm">
            {errorMsg}
          </div>
        )}

        {/* ── Step 1: Connect Shopify ── */}
        {step === 'connect_shopify' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-1">Connect your Shopify store</h1>
            <p className="text-sm text-slate-400 mb-6">
              Enter your store URL. You&apos;ll be redirected to Shopify to authorize access.
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
                  placeholder="yourstore.myshopify.com"
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
                {loading ? 'Connecting...' : 'Connect Store'}
              </button>
            </form>
          </>
        )}

        {/* ── Step 2: Connect GSC ── */}
        {step === 'connect_gsc' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-1">Connect Google Search Console</h1>
            <p className="text-sm text-slate-400 mb-6">
              Connect GSC to unlock traffic-based priority scoring. Your crawl results
              will be enriched with real click and impression data.
            </p>

            <div className="space-y-3">
              <button
                onClick={handleGSCConnect}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm py-2.5 rounded-lg transition-colors"
              >
                Connect Google Search Console
              </button>

              <button
                onClick={handleSkipGSC}
                className="w-full bg-transparent border border-slate-600 hover:border-slate-500 text-slate-400 hover:text-slate-300 font-medium text-sm py-2.5 rounded-lg transition-colors"
              >
                Skip for now
              </button>
            </div>

            <p className="mt-4 text-xs text-slate-500 text-center">
              You can connect GSC later from the Sites page.
            </p>
          </>
        )}

        {/* ── Step 3: First Crawl ── */}
        {step === 'first_crawl' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-1">Run your first crawl</h1>
            <p className="text-sm text-slate-400 mb-6">
              VAEO will scan your store for SEO issues — missing meta tags, schema markup,
              image optimization, and more.
            </p>

            {crawling ? (
              <div className="text-center py-6">
                <div className="inline-block w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-sm text-slate-300">Crawling your store...</p>
                <p className="text-xs text-slate-500 mt-1">This usually takes 1–3 minutes.</p>
              </div>
            ) : (
              <button
                onClick={handleStartCrawl}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm py-2.5 rounded-lg transition-colors"
              >
                Start Your First Crawl
              </button>
            )}
          </>
        )}

        {/* ── Step 4: Review Issues ── */}
        {step === 'review_issues' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-1">Crawl complete</h1>
            <p className="text-sm text-slate-400 mb-6">
              {issueCount > 0
                ? `We found ${issueCount} SEO issue${issueCount > 1 ? 's' : ''} on your store.`
                : 'Your crawl is complete. Head to the dashboard to review your results.'}
            </p>

            {issueCount > 0 && (
              <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg px-4 py-3 mb-6">
                <p className="text-sm text-amber-300 font-medium">{issueCount} issues found</p>
                <p className="text-xs text-amber-400/70 mt-1">
                  VAEO has prioritized these by impact and traffic data.
                </p>
              </div>
            )}

            <a
              href="/dashboard"
              onClick={() => completeStep('review_issues')}
              className="block w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm py-2.5 rounded-lg transition-colors text-center"
            >
              Go to Dashboard
            </a>
          </>
        )}

        {/* ── Step 5: Complete ── */}
        {step === 'complete' && (
          <>
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-emerald-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl text-emerald-400">{'\u2713'}</span>
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">You&apos;re all set!</h1>
              <p className="text-sm text-slate-400 mb-6">
                VAEO is monitoring your store and will automatically detect and fix SEO issues.
              </p>
            </div>

            <a
              href="/dashboard"
              className="block w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm py-2.5 rounded-lg transition-colors text-center"
            >
              Open Dashboard
            </a>

            <div className="mt-4 flex gap-3 justify-center">
              <a href="/sites" className="text-xs text-slate-400 hover:text-slate-300">
                View Sites
              </a>
              <a href="/queue" className="text-xs text-slate-400 hover:text-slate-300">
                Command Center
              </a>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
