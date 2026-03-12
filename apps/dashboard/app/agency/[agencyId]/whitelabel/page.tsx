'use client';

/**
 * apps/dashboard/app/agency/[agencyId]/whitelabel/page.tsx
 *
 * White-label preview + settings for agency branding.
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  buildPreviewFormState,
  buildPreviewTheme,
  validatePreviewForm,
  hasPreviewErrors,
  type PreviewFormState,
} from '../../../../lib/whitelabel_preview_logic';

export default function WhiteLabelPreviewPage() {
  const params = useParams();
  const agencyId = params?.agencyId as string;

  const [form, setForm] = useState<PreviewFormState>(buildPreviewFormState(null));
  const [fieldErrors, setFieldErrors] = useState<{ brand_name: string | null; primary_color: string | null; support_email: string | null }>({
    brand_name: null, primary_color: null, support_email: null,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/agency/${agencyId}/whitelabel`);
      if (res.ok) {
        const config = await res.json();
        setForm(buildPreviewFormState(config));
      }
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  }, [agencyId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const update = useCallback((patch: Partial<PreviewFormState>) => {
    setForm(prev => ({ ...prev, ...patch }));
    setSaved(false);
  }, []);

  const handleSave = useCallback(async () => {
    const errs = validatePreviewForm(form);
    setFieldErrors(errs);
    if (hasPreviewErrors(errs)) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agency/${agencyId}/whitelabel`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Failed to save');
      } else {
        setSaved(true);
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }, [form, agencyId]);

  if (loading) {
    return (
      <div className="p-8 animate-pulse">
        <div className="h-8 w-48 bg-gray-200 rounded mb-8" />
        <div className="h-64 bg-gray-100 rounded" />
      </div>
    );
  }

  const theme = buildPreviewTheme(form);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">White-Label Settings</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Settings form */}
        <div className="space-y-5">
          {/* Brand name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
            <input
              type="text"
              value={form.brand_name}
              onChange={e => update({ brand_name: e.target.value })}
              className={`w-full px-3 py-2 border rounded-md text-sm ${
                fieldErrors.brand_name ? 'border-red-400' : 'border-gray-300'
              } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
            />
            {fieldErrors.brand_name && <p className="mt-1 text-xs text-red-600">{fieldErrors.brand_name}</p>}
          </div>

          {/* Primary color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={form.primary_color}
                onChange={e => update({ primary_color: e.target.value })}
                className="h-10 w-10 rounded border border-gray-300 cursor-pointer"
              />
              <input
                type="text"
                value={form.primary_color}
                onChange={e => update({ primary_color: e.target.value })}
                className={`flex-1 px-3 py-2 border rounded-md text-sm font-mono ${
                  fieldErrors.primary_color ? 'border-red-400' : 'border-gray-300'
                } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
              />
            </div>
            {fieldErrors.primary_color && <p className="mt-1 text-xs text-red-600">{fieldErrors.primary_color}</p>}
            {!theme.contrast_ok && (
              <p className="mt-1 text-xs text-amber-600">Low contrast — text may be hard to read</p>
            )}
          </div>

          {/* Support email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Support Email</label>
            <input
              type="email"
              value={form.support_email}
              onChange={e => update({ support_email: e.target.value })}
              placeholder="support@example.com"
              className={`w-full px-3 py-2 border rounded-md text-sm ${
                fieldErrors.support_email ? 'border-red-400' : 'border-gray-300'
              } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
            />
            {fieldErrors.support_email && <p className="mt-1 text-xs text-red-600">{fieldErrors.support_email}</p>}
          </div>

          {/* Hide VAEO branding */}
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.hide_vaeo_branding}
              onChange={e => update({ hide_vaeo_branding: e.target.checked })}
              className="rounded border-gray-300"
            />
            Hide VAEO branding
          </label>

          {/* Save button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
            {saved && <span className="text-sm text-green-600">Saved</span>}
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
        </div>

        {/* Live preview */}
        <div>
          <h2 className="text-sm font-medium text-gray-500 mb-3">Preview</h2>
          <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            {/* Header preview */}
            <div
              className="px-6 py-4 flex items-center justify-between"
              style={{ backgroundColor: theme.bg_color, color: theme.text_color }}
            >
              <span className="font-semibold text-lg">{theme.brand_name}</span>
              {theme.show_badge && (
                <span className="text-xs opacity-75">Powered by VAEO</span>
              )}
            </div>

            {/* Body preview */}
            <div className="p-6 bg-white">
              <div className="h-3 w-3/4 bg-gray-200 rounded mb-3" />
              <div className="h-3 w-1/2 bg-gray-200 rounded mb-3" />
              <div className="h-3 w-2/3 bg-gray-200 rounded mb-6" />

              <button
                className="px-4 py-2 text-sm font-medium rounded-md"
                style={{ backgroundColor: theme.bg_color, color: theme.text_color }}
              >
                Sample Button
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
