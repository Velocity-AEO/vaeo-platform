'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  generateSessionId,
  saveOnboardingState,
  loadOnboardingState,
  clearOnboardingState,
  getResumeStep,
} from '../../../tools/onboarding/onboarding_state_store';

// ── Types ─────────────────────────────────────────────────────────────────────

type WPOnboardingStep =
  | 'enter_url'
  | 'generate_password'
  | 'enter_credentials'
  | 'verify_connection'
  | 'detect_plugins'
  | 'register_site'
  | 'complete';

interface SEOCoverage {
  seo_plugin:      string;
  has_sitemap:     boolean;
  has_schema:      boolean;
  has_og_tags:     boolean;
  has_meta_robots: boolean;
  managed_fields:  string[];
}

interface WPOnboardingState {
  step:                WPOnboardingStep;
  site_id?:            string;
  wp_url?:             string;
  username?:           string;
  app_password?:       string;
  connection_verified: boolean;
  plugins_detected:    string[];
  seo_coverage?:       SEOCoverage;
  error?:              string;
  completed_at?:       string;
}

const STEP_LABELS: Record<WPOnboardingStep, string> = {
  enter_url: 'Enter URL',
  generate_password: 'Application Password',
  enter_credentials: 'Credentials',
  verify_connection: 'Verify',
  detect_plugins: 'Plugins',
  register_site: 'Register',
  complete: 'Complete',
};

const STEP_ORDER: WPOnboardingStep[] = [
  'enter_url', 'generate_password', 'enter_credentials',
  'verify_connection', 'detect_plugins', 'register_site', 'complete',
];

// ── API call helper ──────────────────────────────────────────────────────────

async function callOnboardAPI(
  step: WPOnboardingStep,
  state: WPOnboardingState,
  payload: Record<string, string>,
): Promise<{ state: WPOnboardingState; message: string }> {
  const res = await fetch('/api/onboard/wordpress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step, state, payload }),
  });
  return res.json();
}

// ── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ current }: { current: WPOnboardingStep }) {
  const idx = STEP_ORDER.indexOf(current);
  const percent = Math.round(((idx + 1) / STEP_ORDER.length) * 100);

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 14, color: '#6b7280' }}>
          Step {idx + 1} of {STEP_ORDER.length}: {STEP_LABELS[current]}
        </span>
        <span style={{ fontSize: 14, color: '#6b7280' }}>{percent}%</span>
      </div>
      <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4 }}>
        <div style={{ height: 8, background: '#2563eb', borderRadius: 4, width: `${percent}%`, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

// ── Page component ───────────────────────────────────────────────────────────

export default function WordPressOnboardPage() {
  const [state, setState] = useState<WPOnboardingState>({
    step: 'enter_url',
    connection_verified: false,
    plugins_detected: [],
  });
  const [loading, setLoading] = useState(false);
  const [wpUrl, setWpUrl] = useState('');
  const [username, setUsername] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [resumed, setResumed] = useState(false);
  const [sessionId, setSessionId] = useState('');

  // Resume state on mount
  useEffect(() => {
    const tenantId = 'default'; // Would come from auth context
    const sid = generateSessionId(tenantId, 'wordpress');
    setSessionId(sid);

    loadOnboardingState(sid).then(saved => {
      if (saved && !saved.completed) {
        const resumeIdx = getResumeStep(saved);
        const resumeStep = STEP_ORDER[resumeIdx] ?? 'enter_url';
        setState(prev => ({ ...prev, step: resumeStep }));
        if (saved.form_data?.wp_url) setWpUrl(saved.form_data.wp_url as string);
        if (saved.form_data?.username) setUsername(saved.form_data.username as string);
        setResumed(true);
      }
    }).catch(() => {});
  }, []);

  // Save state on each step change
  const saveProgress = useCallback((currentStep: WPOnboardingStep) => {
    if (!sessionId) return;
    const stepIdx = STEP_ORDER.indexOf(currentStep);
    saveOnboardingState({
      session_id: sessionId,
      platform: 'wordpress',
      current_step: stepIdx,
      total_steps: STEP_ORDER.length,
      completed_steps: Array.from({ length: stepIdx }, (_, i) => i),
      form_data: { wp_url: wpUrl, username },
      started_at: new Date().toISOString(),
      last_updated_at: new Date().toISOString(),
      completed: currentStep === 'complete',
    }).catch(() => {});
  }, [sessionId, wpUrl, username]);

  const advance = useCallback(async (payload: Record<string, string> = {}) => {
    setLoading(true);
    try {
      const result = await callOnboardAPI(state.step, state, payload);
      setState(result.state);
      saveProgress(result.state.step);
      if (result.state.step === 'complete' && sessionId) {
        clearOnboardingState(sessionId).catch(() => {});
      }
    } catch {
      setState((s) => ({ ...s, error: 'Network error. Please try again.' }));
    } finally {
      setLoading(false);
    }
  }, [state, saveProgress, sessionId]);

  const retry = useCallback(() => {
    setState((s) => ({ ...s, error: undefined }));
  }, []);

  // Auto-advance for verify_connection step
  const handleVerify = useCallback(async () => {
    setLoading(true);
    try {
      const result = await callOnboardAPI('verify_connection', state, {});
      if (result.state.error) {
        setState(result.state);
      } else {
        // Auto-advance to detect_plugins
        const detectResult = await callOnboardAPI('detect_plugins', result.state, {});
        setState(detectResult.state);
      }
    } catch {
      setState((s) => ({ ...s, error: 'Connection failed. Please try again.' }));
    } finally {
      setLoading(false);
    }
  }, [state]);

  return (
    <div style={{ maxWidth: 640, margin: '40px auto', padding: '0 20px' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Connect WordPress Site</h1>
      <p style={{ color: '#6b7280', marginBottom: 24 }}>
        Follow these steps to connect your WordPress site to VAEO.
      </p>

      <ProgressBar current={state.step} />

      {/* Resume banner */}
      {resumed && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 16, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#1d4ed8', fontSize: 14 }}>Resuming your setup from where you left off</span>
          <button
            onClick={() => {
              setResumed(false);
              setState({ step: 'enter_url', connection_verified: false, plugins_detected: [] });
              setWpUrl('');
              setUsername('');
              setAppPassword('');
              if (sessionId) clearOnboardingState(sessionId).catch(() => {});
            }}
            style={{ color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}
          >
            Start over
          </button>
        </div>
      )}

      {/* Error banner */}
      {state.error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <p style={{ color: '#dc2626', margin: 0, fontWeight: 500 }}>{state.error}</p>
          <button onClick={retry} style={{ marginTop: 8, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
            Try Again
          </button>
        </div>
      )}

      {/* Step 1: Enter URL */}
      {state.step === 'enter_url' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Enter your WordPress site URL</h2>
          <input
            type="url"
            placeholder="https://yoursite.com"
            value={wpUrl}
            onChange={(e) => setWpUrl(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 16, marginBottom: 16, boxSizing: 'border-box' }}
          />
          <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>Must start with https://</p>
          <button
            onClick={() => advance({ wp_url: wpUrl })}
            disabled={loading || !wpUrl.startsWith('https://')}
            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 16, cursor: 'pointer', opacity: loading || !wpUrl.startsWith('https://') ? 0.5 : 1 }}
          >
            {loading ? 'Checking...' : 'Continue'}
          </button>
        </div>
      )}

      {/* Step 2: Generate Application Password */}
      {state.step === 'generate_password' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Generate an Application Password</h2>
          <div style={{ background: '#f9fafb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2 }}>
              <li>Log into your WordPress Admin</li>
              <li>Go to <strong>Users → Your Profile</strong></li>
              <li>Scroll to <strong>Application Passwords</strong></li>
              <li>Enter name: <code style={{ background: '#e5e7eb', padding: '2px 6px', borderRadius: 4 }}>VAEO</code></li>
              <li>Click <strong>Add New Application Password</strong></li>
              <li>Copy the password shown</li>
            </ol>
          </div>
          <button
            onClick={() => advance({})}
            disabled={loading}
            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 16, cursor: 'pointer', opacity: loading ? 0.5 : 1 }}
          >
            {loading ? 'Loading...' : 'I have my password'}
          </button>
        </div>
      )}

      {/* Step 3: Enter Credentials */}
      {state.step === 'enter_credentials' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Enter your credentials</h2>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>WordPress Username</label>
          <input
            type="text"
            placeholder="admin"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 16, marginBottom: 16, boxSizing: 'border-box' }}
          />
          <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Application Password</label>
          <input
            type="password"
            placeholder="xxxx xxxx xxxx xxxx"
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 16, marginBottom: 16, boxSizing: 'border-box' }}
          />
          <button
            onClick={() => {
              advance({ username, app_password: appPassword }).then(() => {
                // After credentials saved, auto-trigger verify
                setTimeout(() => handleVerify(), 100);
              });
            }}
            disabled={loading || !username || !appPassword}
            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 16, cursor: 'pointer', opacity: loading || !username || !appPassword ? 0.5 : 1 }}
          >
            {loading ? 'Saving...' : 'Verify Connection'}
          </button>
        </div>
      )}

      {/* Step 4: Verifying */}
      {state.step === 'verify_connection' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, textAlign: 'center' }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Verifying Connection</h2>
          {loading ? (
            <div>
              <div style={{ fontSize: 40, marginBottom: 16, animation: 'spin 1s linear infinite' }}>&#8635;</div>
              <p style={{ color: '#6b7280' }}>Connecting to your WordPress site...</p>
            </div>
          ) : (
            <button
              onClick={handleVerify}
              style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 16, cursor: 'pointer' }}
            >
              Verify Now
            </button>
          )}
        </div>
      )}

      {/* Step 5: Plugin Detection */}
      {state.step === 'detect_plugins' && !state.error && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Detected Plugins</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {state.plugins_detected.map((p) => (
              <span key={p} style={{ background: '#dbeafe', color: '#1d4ed8', padding: '4px 12px', borderRadius: 16, fontSize: 14, fontWeight: 500 }}>
                {p}
              </span>
            ))}
            {state.plugins_detected.length === 0 && (
              <span style={{ color: '#9ca3af', fontSize: 14 }}>No SEO plugins detected</span>
            )}
          </div>
          {state.seo_coverage && (
            <div style={{ background: '#f9fafb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>SEO Coverage</h3>
              <p style={{ margin: '4px 0', fontSize: 14 }}>
                SEO Plugin: <strong>{state.seo_coverage.seo_plugin || 'none'}</strong>
              </p>
              <p style={{ margin: '4px 0', fontSize: 14 }}>
                VAEO will write: <strong>
                  {state.seo_coverage.managed_fields.length > 0
                    ? `Fields not managed by ${state.seo_coverage.seo_plugin} (schema, speakable, FAQ)`
                    : 'All SEO fields (no SEO plugin detected)'}
                </strong>
              </p>
              <p style={{ margin: '4px 0', fontSize: 14 }}>
                VAEO will NOT write: <strong>
                  {state.seo_coverage.managed_fields.length > 0
                    ? state.seo_coverage.managed_fields.join(', ')
                    : 'N/A — no conflicts'}
                </strong>
              </p>
            </div>
          )}
          <button
            onClick={() => advance({})}
            disabled={loading}
            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 16, cursor: 'pointer', opacity: loading ? 0.5 : 1 }}
          >
            {loading ? 'Registering...' : 'Register Site'}
          </button>
        </div>
      )}

      {/* Step 6: Register */}
      {state.step === 'register_site' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, textAlign: 'center' }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Registering Site</h2>
          {loading ? (
            <p style={{ color: '#6b7280' }}>Creating your site record...</p>
          ) : (
            <button
              onClick={() => advance({})}
              style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 16, cursor: 'pointer' }}
            >
              Register Now
            </button>
          )}
        </div>
      )}

      {/* Step 7: Complete */}
      {state.step === 'complete' && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#10003;</div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: '#16a34a', marginBottom: 8 }}>
            Your site is connected to VAEO
          </h2>
          <p style={{ color: '#6b7280', marginBottom: 8 }}>
            Site ID: <code style={{ background: '#e5e7eb', padding: '2px 8px', borderRadius: 4 }}>{state.site_id}</code>
          </p>
          <p style={{ color: '#6b7280', marginBottom: 24 }}>
            VAEO will begin analyzing your site and applying optimizations.
          </p>
          <a
            href={`/client/${state.site_id}`}
            style={{ display: 'inline-block', background: '#2563eb', color: '#fff', textDecoration: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 16 }}
          >
            Go to Dashboard
          </a>
        </div>
      )}
    </div>
  );
}
