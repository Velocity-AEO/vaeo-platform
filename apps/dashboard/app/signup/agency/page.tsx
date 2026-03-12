'use client';

import { useState } from 'react';

type AgencyPlan = 'starter' | 'growth' | 'enterprise';
type Step = 'choose_plan' | 'agency_details' | 'owner_account' | 'billing' | 'complete';

const STEPS: Step[] = ['choose_plan', 'agency_details', 'owner_account', 'billing', 'complete'];
const STEP_LABELS = ['Plan', 'Details', 'Account', 'Billing', 'Complete'];

const PLANS: Array<{ id: AgencyPlan; name: string; price: string; sites: string; whitelabel: boolean }> = [
  { id: 'starter', name: 'Starter', price: '$99/mo', sites: 'Up to 10 sites', whitelabel: false },
  { id: 'growth', name: 'Growth', price: '$249/mo', sites: 'Up to 50 sites', whitelabel: true },
  { id: 'enterprise', name: 'Enterprise', price: '$499/mo', sites: 'Unlimited sites', whitelabel: true },
];

function validate(name: string, email: string): string[] {
  const errors: string[] = [];
  if ((name ?? '').length < 2) errors.push('Agency name must be at least 2 characters');
  if ((name ?? '').length > 80) errors.push('Agency name must be 80 characters or less');
  if (!(email ?? '').includes('@') || !(email ?? '').includes('.')) errors.push('Please enter a valid email address');
  return errors;
}

export default function AgencySignupPage() {
  const [step, setStep] = useState<Step>('choose_plan');
  const [plan, setPlan] = useState<AgencyPlan | null>(null);
  const [agencyName, setAgencyName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agencyId, setAgencyId] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const stepIdx = STEPS.indexOf(step);
  const percent = Math.round(((stepIdx + 1) / STEPS.length) * 100);

  function selectPlan(p: AgencyPlan) {
    setPlan(p);
    setStep('agency_details');
    setErrors([]);
  }

  function submitDetails() {
    const errs = validate(agencyName, ownerEmail);
    if (!ownerName) errs.push('Owner name is required');
    if (errs.length > 0) { setErrors(errs); return; }
    setErrors([]);
    setStep('owner_account');
  }

  async function createAccount() {
    const errs: string[] = [];
    if (password.length < 8) errs.push('Password must be at least 8 characters');
    if (password !== confirmPassword) errs.push('Passwords do not match');
    if (errs.length > 0) { setErrors(errs); return; }
    setErrors([]);
    setLoading(true);
    try {
      const res = await fetch('/api/agency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agency_name: agencyName, owner_name: ownerName, owner_email: ownerEmail, plan }),
      });
      const data = await res.json();
      setAgencyId(data.agency_id ?? `agency_${Date.now()}`);
      setStep('billing');
    } catch {
      setErrors(['Failed to create account. Please try again.']);
    } finally {
      setLoading(false);
    }
  }

  function startTrial() {
    setStep('complete');
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 md:px-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Create Your Agency</h1>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            {STEP_LABELS.map((label, i) => (
              <span key={label} className={i <= stepIdx ? 'text-blue-600 font-medium' : ''}>{label}</span>
            ))}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="h-2 rounded-full bg-blue-600 transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {errors.map((e, i) => <p key={i}>{e}</p>)}
          </div>
        )}

        {/* Step 1: Choose Plan */}
        {step === 'choose_plan' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PLANS.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPlan(p.id)}
                className="bg-white rounded-lg border border-gray-200 p-6 text-left hover:border-blue-400 hover:shadow-md transition-all"
              >
                <h3 className="text-lg font-semibold text-gray-900">{p.name}</h3>
                <p className="text-2xl font-bold text-blue-600 mt-2">{p.price}</p>
                <p className="text-sm text-gray-500 mt-2">{p.sites}</p>
                <p className="text-sm text-gray-500 mt-1">
                  White-label: {p.whitelabel ? 'Yes' : 'No'}
                </p>
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Agency Details */}
        {step === 'agency_details' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Agency Name</label>
              <input
                type="text"
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Your Agency Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Owner Name</label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Your Full Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Owner Email</label>
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="you@agency.com"
              />
            </div>
            <button
              onClick={submitDetails}
              className="h-11 w-full sm:w-auto px-6 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 3: Owner Account */}
        {step === 'owner_account' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
            <p className="text-sm text-gray-600">Create your account password for {ownerEmail}</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Min 8 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={createAccount}
              disabled={loading}
              className="h-11 w-full sm:w-auto px-6 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        )}

        {/* Step 4: Billing */}
        {step === 'billing' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 text-center space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Start Your Free Trial</h2>
            <p className="text-sm text-gray-600">
              14 days free on the {plan ? PLANS.find((p) => p.id === plan)?.name : ''} plan.
              No credit card required to start.
            </p>
            <p className="text-2xl font-bold text-blue-600">
              {plan ? PLANS.find((p) => p.id === plan)?.price : ''}
            </p>
            <button
              onClick={startTrial}
              className="h-11 px-8 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
            >
              Start Free Trial
            </button>
          </div>
        )}

        {/* Step 5: Complete */}
        {step === 'complete' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 text-center space-y-4">
            <h2 className="text-xl font-bold text-gray-900">
              Welcome to Velocity AEO, {agencyName}!
            </h2>
            <p className="text-sm text-gray-600">
              Your agency dashboard is ready. Start adding client sites to begin.
            </p>
            <a
              href={`/agency/${agencyId}`}
              className="inline-block h-11 px-8 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 leading-[2.75rem]"
            >
              Go to Agency Dashboard
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
