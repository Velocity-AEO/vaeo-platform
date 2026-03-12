'use client';

/**
 * apps/dashboard/components/AddClientSitePanel.tsx
 *
 * Slide-over panel for adding a new client site to an agency roster.
 */

import { useState, useCallback } from 'react';
import {
  buildInitialFormState,
  validateForm,
  hasErrors,
  buildPayload,
  getPlatformOptions,
  getSubmitButtonLabel,
  type AddSiteFormState,
  type Platform,
} from '../lib/add_site_form_logic';

interface Props {
  agencyId: string;
  open:     boolean;
  onClose:  () => void;
  onAdded:  () => void;
}

export default function AddClientSitePanel({ agencyId, open, onClose, onAdded }: Props) {
  const [form, setForm] = useState<AddSiteFormState>(buildInitialFormState);
  const [fieldErrors, setFieldErrors] = useState<{ domain: string | null; client_name: string | null }>({
    domain: null,
    client_name: null,
  });

  const update = useCallback((patch: Partial<AddSiteFormState>) => {
    setForm(prev => ({ ...prev, ...patch }));
  }, []);

  const handleSubmit = useCallback(async () => {
    const errs = validateForm(form);
    setFieldErrors(errs);
    if (hasErrors(errs)) return;

    update({ submitting: true, error: null });
    try {
      const payload = buildPayload(form);
      const res = await fetch(`/api/agency/${agencyId}/roster`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        update({ submitting: false, error: body.error ?? 'Failed to add site' });
        return;
      }

      setForm(buildInitialFormState());
      setFieldErrors({ domain: null, client_name: null });
      onAdded();
      onClose();
    } catch {
      update({ submitting: false, error: 'Network error' });
    }
  }, [form, agencyId, onAdded, onClose, update]);

  if (!open) return null;

  const platformOptions = getPlatformOptions();

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Add Client Site</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Domain */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
            <input
              type="text"
              value={form.domain}
              onChange={e => update({ domain: e.target.value })}
              placeholder="example.com"
              className={`w-full px-3 py-2 border rounded-md text-sm ${
                fieldErrors.domain ? 'border-red-400' : 'border-gray-300'
              } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
            />
            {fieldErrors.domain && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.domain}</p>
            )}
          </div>

          {/* Platform */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
            <select
              value={form.platform}
              onChange={e => update({ platform: e.target.value as Platform })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {platformOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Client name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
            <input
              type="text"
              value={form.client_name}
              onChange={e => update({ client_name: e.target.value })}
              placeholder="Acme Corp"
              className={`w-full px-3 py-2 border rounded-md text-sm ${
                fieldErrors.client_name ? 'border-red-400' : 'border-gray-300'
              } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
            />
            {fieldErrors.client_name && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.client_name}</p>
            )}
          </div>

          {/* Global error */}
          {form.error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{form.error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={form.submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {getSubmitButtonLabel(form.submitting)}
          </button>
        </div>
      </div>
    </div>
  );
}
