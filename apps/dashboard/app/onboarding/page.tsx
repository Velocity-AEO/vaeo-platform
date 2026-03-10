'use client';

import { useState, FormEvent } from 'react';

type State = 'idle' | 'redirecting' | 'error';

export default function OnboardingPage() {
  const [storeUrl, setStoreUrl] = useState('');
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setState('redirecting');
    setErrorMsg('');

    // Normalise: strip protocol, trailing slashes
    let shop = storeUrl.trim().toLowerCase();
    shop = shop.replace(/^https?:\/\//, '').replace(/\/+$/, '');

    // Accept "mystore" or "mystore.myshopify.com"
    if (!shop.includes('.')) {
      shop = `${shop}.myshopify.com`;
    }

    if (!/^[a-z0-9][a-z0-9\-]*\.myshopify\.com$/.test(shop)) {
      setState('error');
      setErrorMsg('Please enter a valid myshopify.com domain (e.g. mystore.myshopify.com)');
      return;
    }

    // Redirect to the install endpoint which will redirect to Shopify OAuth
    window.location.href = `/api/shopify/install?shop=${encodeURIComponent(shop)}`;
  }

  return (
    <main className="min-h-screen bg-[#080f1e] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-[#0f1729] rounded-xl border border-slate-700 p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-white mb-1">Connect a Shopify Site</h1>
        <p className="text-sm text-slate-400 mb-6">
          Enter your store URL to connect via Shopify OAuth. You&apos;ll be redirected to
          Shopify to authorise access.
        </p>

        {state === 'error' && (
          <div className="mb-4 rounded-lg bg-red-900/40 border border-red-700 px-4 py-3 text-red-300 text-sm">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
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
              disabled={state === 'redirecting'}
              className="w-full bg-[#0a1120] border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Scopes requested: themes, content, products, analytics (read/write)
            </p>
          </div>

          <button
            type="submit"
            disabled={state === 'redirecting'}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm py-2.5 rounded-lg transition-colors"
          >
            {state === 'redirecting' ? 'Redirecting to Shopify...' : 'Connect with Shopify'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-700">
          <p className="text-xs text-slate-500 text-center">
            Vaeo will request read/write access to themes and content, plus read access
            to products and analytics.
          </p>
        </div>
      </div>
    </main>
  );
}
