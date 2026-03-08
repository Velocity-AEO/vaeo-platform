'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type State = 'idle' | 'connecting' | 'success' | 'error';

export default function OnboardingPage() {
  const router = useRouter();
  const [storeUrl, setStoreUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [shopName, setShopName] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setState('connecting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/onboarding/shopify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_url: storeUrl, access_token: accessToken }),
      });
      const data = await res.json() as { ok: boolean; shop_name?: string; error?: string };

      if (!data.ok) {
        setState('error');
        setErrorMsg(data.error ?? 'Unknown error');
        return;
      }

      setShopName(data.shop_name ?? storeUrl);
      setState('success');
      setTimeout(() => router.push('/sites'), 1500);
    } catch (err) {
      setState('error');
      setErrorMsg((err as Error).message);
    }
  }

  return (
    <main className="min-h-screen bg-[#080f1e] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-[#0f1729] rounded-xl border border-slate-700 p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-white mb-1">Connect a Shopify Site</h1>
        <p className="text-sm text-slate-400 mb-6">
          Enter your store URL and Admin API access token to start crawling and optimising.
        </p>

        {state === 'success' && (
          <div className="mb-4 rounded-lg bg-emerald-900/40 border border-emerald-700 px-4 py-3 text-emerald-300 text-sm">
            <span className="font-semibold">{shopName}</span> connected! Redirecting to Sites...
          </div>
        )}

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
              disabled={state === 'connecting' || state === 'success'}
              className="w-full bg-[#0a1120] border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
              Admin API Access Token
            </label>
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="shpat_..."
              required
              disabled={state === 'connecting' || state === 'success'}
              className="w-full bg-[#0a1120] border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={state === 'connecting' || state === 'success'}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm py-2.5 rounded-lg transition-colors"
          >
            {state === 'connecting' ? 'Connecting...' : 'Connect Site'}
          </button>
        </form>
      </div>
    </main>
  );
}
