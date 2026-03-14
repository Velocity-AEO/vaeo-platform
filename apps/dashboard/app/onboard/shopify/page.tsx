'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  generateSessionId,
  buildInitialOnboardingState,
  saveOnboardingState,
  loadOnboardingState,
  clearOnboardingState,
  getResumeStep,
  type OnboardingState as ResumeState,
} from '@tools/onboarding/onboarding_state_store';

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'enter_domain' | 'install_app' | 'authorizing' | 'verifying' | 'complete';

const STEPS: { key: Step; label: string }[] = [
  { key: 'enter_domain', label: 'Store Domain' },
  { key: 'install_app', label: 'Install App' },
  { key: 'authorizing', label: 'Authorize' },
  { key: 'verifying', label: 'Verify' },
  { key: 'complete', label: 'Complete' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function ShopifyOnboardingPage() {
  const searchParams = useSearchParams();

  const [step, setStep]       = useState<Step>('enter_domain');
  const [domain, setDomain]   = useState('');
  const [error, setError]     = useState('');
  const [siteId, setSiteId]   = useState('');
  const [resumed, setResumed] = useState(false);
  const [sessionId, setSessionId] = useState('');

  // Resume state on mount
  useEffect(() => {
    const tenantId = 'default'; // Would come from auth context
    const sid = generateSessionId(tenantId, 'shopify');
    setSessionId(sid);

    loadOnboardingState(sid).then(state => {
      if (state && !state.completed) {
        const resumeIdx = getResumeStep(state);
        const resumeStep = STEPS[resumeIdx]?.key ?? 'enter_domain';
        setStep(resumeStep);
        if (state.form_data?.domain) setDomain(state.form_data.domain as string);
        setResumed(true);
      }
    }).catch(() => {});
  }, []);

  // Save state on each step change
  const saveProgress = useCallback((currentStep: Step) => {
    if (!sessionId) return;
    const stepIdx = STEPS.findIndex(s => s.key === currentStep);
    saveOnboardingState({
      session_id: sessionId,
      platform: 'shopify',
      current_step: stepIdx,
      total_steps: STEPS.length,
      completed_steps: Array.from({ length: stepIdx }, (_, i) => i),
      form_data: { domain },
      started_at: new Date().toISOString(),
      last_updated_at: new Date().toISOString(),
      completed: currentStep === 'complete',
    }).catch(() => {});
  }, [sessionId, domain]);

  // Check for OAuth callback
  useEffect(() => {
    if (searchParams.get('authorized') === 'true') {
      setStep('verifying');
      // Simulate verification
      const timer = setTimeout(() => {
        setSiteId(`site_${Date.now().toString(36)}`);
        setStep('complete');
        if (sessionId) clearOnboardingState(sessionId).catch(() => {});
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, sessionId]);

  const stepIdx  = STEPS.findIndex(s => s.key === step);
  const percent  = Math.round((stepIdx / (STEPS.length - 1)) * 100);

  function handleDomainSubmit() {
    setError('');
    const d = domain.trim().toLowerCase();
    if (!d.endsWith('.myshopify.com')) {
      setError('Domain must end with .myshopify.com');
      return;
    }
    setStep('install_app');
    saveProgress('install_app');
  }

  function handleInstall() {
    // In production, this would use buildShopifyInstallUrl
    const clientId = 'vaeo_app';
    const redirect = `${window.location.origin}/onboard/shopify?authorized=true`;
    const scopes = 'read_content,write_content,read_themes,write_themes';
    const url = `https://${domain}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirect)}&state=${Math.random().toString(36).slice(2)}`;
    window.location.href = url;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-slate-800">Connect Your Shopify Store</h1>
          <p className="text-sm text-slate-500 mt-1">Step {stepIdx + 1} of {STEPS.length}</p>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-100 rounded-full h-2 mb-8">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Resume banner */}
        {resumed && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-4 py-3 text-sm mb-4 flex items-center justify-between">
            <span>Resuming your setup from where you left off</span>
            <button
              onClick={() => {
                setResumed(false);
                setStep('enter_domain');
                setDomain('');
                if (sessionId) clearOnboardingState(sessionId).catch(() => {});
              }}
              className="text-blue-600 hover:text-blue-800 underline text-xs ml-4"
            >
              Start over
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        {/* Step 1 — Enter Domain */}
        {step === 'enter_domain' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Shopify store domain
              </label>
              <input
                type="text"
                value={domain}
                onChange={e => setDomain(e.target.value)}
                placeholder="mystore.myshopify.com"
                className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-slate-400 mt-1">
                Find this in your Shopify admin under Settings → Domains
              </p>
            </div>
            <button
              onClick={handleDomainSubmit}
              className="w-full h-11 bg-slate-900 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 2 — Install App */}
        {step === 'install_app' && (
          <div className="space-y-4 text-center">
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-blue-600" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-sm text-slate-600">
              Click below to install the VAEO app on your Shopify store.
              You&apos;ll be redirected to Shopify to authorize access.
            </p>
            <p className="text-xs text-slate-400">
              Store: <span className="font-medium text-slate-600">{domain}</span>
            </p>
            <button
              onClick={handleInstall}
              className="w-full h-11 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
            >
              Install VAEO on Shopify
            </button>
            <button
              onClick={() => setStep('enter_domain')}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              ← Back to domain entry
            </button>
          </div>
        )}

        {/* Step 3 — Authorizing */}
        {step === 'authorizing' && (
          <div className="text-center space-y-4 py-8">
            <svg className="w-10 h-10 text-blue-500 animate-spin mx-auto" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
              <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <p className="text-sm text-slate-600">Waiting for Shopify authorization...</p>
            <p className="text-xs text-slate-400">This may take a moment</p>
          </div>
        )}

        {/* Step 4 — Verifying */}
        {step === 'verifying' && (
          <div className="text-center space-y-4 py-8">
            <svg className="w-10 h-10 text-blue-500 animate-spin mx-auto" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
              <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <p className="text-sm text-slate-600">Verifying connection...</p>
          </div>
        )}

        {/* Step 5 — Complete */}
        {step === 'complete' && (
          <div className="text-center space-y-4 py-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-green-600" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-800">Your Shopify store is connected to VAEO</h2>
            {siteId && (
              <p className="text-xs text-slate-400 font-mono">Site ID: {siteId}</p>
            )}
            <a
              href={siteId ? `/client/${siteId}` : '/'}
              className="inline-flex items-center justify-center w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Go to Dashboard
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
