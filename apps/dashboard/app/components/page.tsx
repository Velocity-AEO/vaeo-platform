'use client';

import { useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

type Trigger = 'exit_intent' | 'scroll_percent' | 'time_delay' | 'immediate';

interface EmailCaptureFormState {
  trigger: Trigger;
  trigger_value: number;
  title: string;
  subtitle: string;
  placeholder_text: string;
  button_text: string;
  success_message: string;
  background_color: string;
  text_color: string;
  button_color: string;
  button_text_color: string;
  overlay_opacity: number;
  border_radius_px: number;
  show_close_button: boolean;
  close_on_overlay_click: boolean;
  show_once_per_session: boolean;
  show_once_per_days: number;
  webhook_url: string;
  include_name_field: boolean;
  gdpr_checkbox: boolean;
  gdpr_text: string;
}

interface DeployResult {
  component: {
    component_id: string;
    status: string;
    component_type: string;
    name: string;
    installed_at?: string;
  };
  install_result: {
    success: boolean;
    message?: string;
    error?: string;
  };
  snippet_html: string;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS: EmailCaptureFormState = {
  trigger: 'exit_intent',
  trigger_value: 0,
  title: 'Get 10% Off Your First Order',
  subtitle: 'Join our list and save on your first purchase.',
  placeholder_text: 'Enter your email address',
  button_text: 'Get My Discount',
  success_message: "You're in! Check your inbox for your code.",
  background_color: '#ffffff',
  text_color: '#1a1a1a',
  button_color: '#1a1a2e',
  button_text_color: '#ffffff',
  overlay_opacity: 0.6,
  border_radius_px: 12,
  show_close_button: true,
  close_on_overlay_click: true,
  show_once_per_session: false,
  show_once_per_days: 7,
  webhook_url: '',
  include_name_field: false,
  gdpr_checkbox: false,
  gdpr_text: 'I agree to receive marketing emails.',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    draft: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-800',
    disabled: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ComponentsPage() {
  const [config, setConfig] = useState<EmailCaptureFormState>({ ...DEFAULTS });
  const [deploying, setDeploying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [result, setResult] = useState<DeployResult | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  function update<K extends keyof EmailCaptureFormState>(key: K, value: EmailCaptureFormState[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  async function handlePreview() {
    setDeploying(true);
    try {
      const res = await fetch('/api/components/email-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, dry_run: true }),
      });
      const data: DeployResult = await res.json();
      setPreviewHtml(data.snippet_html);
      setShowPreview(true);
      setResult(data);
    } catch { /* non-fatal */ }
    setDeploying(false);
  }

  async function handleDeploy() {
    setDeploying(true);
    try {
      const res = await fetch('/api/components/email-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, dry_run: false }),
      });
      const data: DeployResult = await res.json();
      setResult(data);
      setPreviewHtml(data.snippet_html);
    } catch { /* non-fatal */ }
    setDeploying(false);
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await fetch('/api/components/email-capture', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ component_id: result?.component?.component_id ?? 'comp_ec_demo' }),
      });
      setResult(null);
      setPreviewHtml('');
      setShowPreview(false);
    } catch { /* non-fatal */ }
    setRemoving(false);
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Components</h1>
        <p className="text-gray-500 text-sm mt-1">Deploy and manage VAEO native components</p>
      </div>

      {/* ── Email Capture Popup ────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold">Email Capture Popup</h2>
          {result && statusBadge(result.component.status)}
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Config panel — col 1–2 */}
          <div className="col-span-2 bg-white border rounded-lg p-6 space-y-5">
            {/* Trigger */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trigger</label>
                <select
                  value={config.trigger}
                  onChange={(e) => update('trigger', e.target.value as Trigger)}
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  <option value="exit_intent">Exit Intent</option>
                  <option value="scroll_percent">Scroll Percent</option>
                  <option value="time_delay">Time Delay (seconds)</option>
                  <option value="immediate">Immediate</option>
                </select>
              </div>
              {(config.trigger === 'scroll_percent' || config.trigger === 'time_delay') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {config.trigger === 'scroll_percent' ? 'Scroll %' : 'Delay (s)'}
                  </label>
                  <input
                    type="number"
                    value={config.trigger_value}
                    onChange={(e) => update('trigger_value', Number(e.target.value))}
                    className="w-full border rounded px-3 py-2 text-sm"
                    min={0}
                    max={config.trigger === 'scroll_percent' ? 100 : 120}
                  />
                </div>
              )}
            </div>

            {/* Text fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={config.title}
                  onChange={(e) => update('title', e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
                <input
                  type="text"
                  value={config.subtitle}
                  onChange={(e) => update('subtitle', e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Placeholder</label>
                <input
                  type="text"
                  value={config.placeholder_text}
                  onChange={(e) => update('placeholder_text', e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Button Text</label>
                <input
                  type="text"
                  value={config.button_text}
                  onChange={(e) => update('button_text', e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Success Message</label>
                <input
                  type="text"
                  value={config.success_message}
                  onChange={(e) => update('success_message', e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Colors */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Colors</h3>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Background</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={config.background_color} onChange={(e) => update('background_color', e.target.value)} className="w-8 h-8 border rounded cursor-pointer" />
                    <input type="text" value={config.background_color} onChange={(e) => update('background_color', e.target.value)} className="flex-1 border rounded px-2 py-1 text-xs font-mono" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Text</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={config.text_color} onChange={(e) => update('text_color', e.target.value)} className="w-8 h-8 border rounded cursor-pointer" />
                    <input type="text" value={config.text_color} onChange={(e) => update('text_color', e.target.value)} className="flex-1 border rounded px-2 py-1 text-xs font-mono" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Button</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={config.button_color} onChange={(e) => update('button_color', e.target.value)} className="w-8 h-8 border rounded cursor-pointer" />
                    <input type="text" value={config.button_color} onChange={(e) => update('button_color', e.target.value)} className="flex-1 border rounded px-2 py-1 text-xs font-mono" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Button Text</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={config.button_text_color} onChange={(e) => update('button_text_color', e.target.value)} className="w-8 h-8 border rounded cursor-pointer" />
                    <input type="text" value={config.button_text_color} onChange={(e) => update('button_text_color', e.target.value)} className="flex-1 border rounded px-2 py-1 text-xs font-mono" />
                  </div>
                </div>
              </div>
            </div>

            {/* Style controls */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Overlay Opacity: {config.overlay_opacity}
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={config.overlay_opacity}
                  onChange={(e) => update('overlay_opacity', Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Border Radius: {config.border_radius_px}px
                </label>
                <input
                  type="range"
                  min={0}
                  max={50}
                  value={config.border_radius_px}
                  onChange={(e) => update('border_radius_px', Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            {/* Toggles */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Behavior</h3>
              <div className="grid grid-cols-3 gap-3">
                {([
                  ['show_close_button', 'Show Close Button'],
                  ['close_on_overlay_click', 'Close on Overlay Click'],
                  ['show_once_per_session', 'Show Once Per Session'],
                  ['include_name_field', 'Include Name Field'],
                  ['gdpr_checkbox', 'GDPR Checkbox'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config[key] as boolean}
                      onChange={(e) => update(key, e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Show Once Per Days</label>
                <input
                  type="number"
                  value={config.show_once_per_days}
                  onChange={(e) => update('show_once_per_days', Number(e.target.value))}
                  className="w-full border rounded px-3 py-2 text-sm"
                  min={0}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL</label>
                <input
                  type="text"
                  value={config.webhook_url}
                  onChange={(e) => update('webhook_url', e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="https://hooks.example.com/email"
                />
              </div>
            </div>

            {config.gdpr_checkbox && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GDPR Text</label>
                <input
                  type="text"
                  value={config.gdpr_text}
                  onChange={(e) => update('gdpr_text', e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handlePreview}
                disabled={deploying}
                className="px-4 py-2 border rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                {deploying ? 'Generating...' : 'Preview Snippet'}
              </button>
              <button
                onClick={handleDeploy}
                disabled={deploying}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {deploying ? 'Deploying...' : 'Deploy to Store'}
              </button>
              {result?.component?.status === 'active' && (
                <button
                  onClick={handleRemove}
                  disabled={removing}
                  className="px-4 py-2 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {removing ? 'Removing...' : 'Remove'}
                </button>
              )}
              <button
                onClick={() => setConfig({ ...DEFAULTS })}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Reset Defaults
              </button>
            </div>
          </div>

          {/* Right column — result / snippet preview */}
          <div className="space-y-4">
            {/* Status card */}
            {result && (
              <div className="bg-white border rounded-lg p-4 space-y-2">
                <h3 className="text-sm font-semibold text-gray-700">Deploy Status</h3>
                <div className="flex items-center gap-2">
                  {statusBadge(result.component.status)}
                  <span className="text-xs text-gray-500">{result.component.component_id}</span>
                </div>
                <p className="text-xs text-gray-600">
                  {result.install_result.success
                    ? result.install_result.message ?? 'Deployed successfully'
                    : result.install_result.error ?? 'Deploy failed'}
                </p>
                {result.component.installed_at && (
                  <p className="text-xs text-gray-400">
                    Installed: {new Date(result.component.installed_at).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            {/* Snippet preview */}
            {showPreview && previewHtml && (
              <div className="bg-white border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700">Generated Snippet</h3>
                  <button
                    onClick={() => navigator.clipboard.writeText(previewHtml)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Copy
                  </button>
                </div>
                <pre className="bg-gray-900 text-green-400 p-3 rounded text-[10px] overflow-x-auto whitespace-pre-wrap font-mono max-h-96 overflow-y-auto">
                  {previewHtml}
                </pre>
              </div>
            )}

            {/* Live preview mockup */}
            <div className="bg-white border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Live Preview</h3>
              <div
                className="relative rounded-lg overflow-hidden"
                style={{ background: `rgba(0,0,0,${config.overlay_opacity})`, minHeight: 260, padding: 20 }}
              >
                <div
                  style={{
                    background: config.background_color,
                    color: config.text_color,
                    borderRadius: `${config.border_radius_px}px`,
                    padding: 24,
                    maxWidth: 320,
                    margin: '0 auto',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                    position: 'relative',
                  }}
                >
                  {config.show_close_button && (
                    <span style={{ position: 'absolute', top: 8, right: 12, fontSize: 18, cursor: 'pointer', color: config.text_color }}>
                      &times;
                    </span>
                  )}
                  <h4 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>{config.title}</h4>
                  <p style={{ margin: '0 0 12px', fontSize: 11, opacity: 0.8 }}>{config.subtitle}</p>
                  {config.include_name_field && (
                    <div style={{ marginBottom: 6 }}>
                      <input disabled placeholder="Your name" style={{ width: '100%', padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 11, boxSizing: 'border-box' as const }} />
                    </div>
                  )}
                  <div style={{ marginBottom: 6 }}>
                    <input disabled placeholder={config.placeholder_text} style={{ width: '100%', padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 11, boxSizing: 'border-box' as const }} />
                  </div>
                  {config.gdpr_checkbox && (
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginBottom: 8, fontSize: 9, color: config.text_color }}>
                      <input type="checkbox" disabled style={{ marginTop: 1 }} />
                      <span>{config.gdpr_text}</span>
                    </label>
                  )}
                  <button
                    disabled
                    style={{
                      width: '100%',
                      padding: '8px',
                      background: config.button_color,
                      color: config.button_text_color,
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'default',
                    }}
                  >
                    {config.button_text}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
