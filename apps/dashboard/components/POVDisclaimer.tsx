'use client';

import { useState, useEffect } from 'react';
import { getDisclaimerText, shouldShowDisclaimer } from '../lib/disclaimer_logic';

const STORAGE_KEY = 'vaeo_disclaimer_dismissed';

export default function POVDisclaimer() {
  const [dismissed, setDismissed] = useState(true); // default hidden until checked

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      setDismissed(stored === 'true');
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!shouldShowDisclaimer(dismissed)) return null;

  function handleDismiss() {
    try {
      sessionStorage.setItem(STORAGE_KEY, 'true');
    } catch { /* non-fatal */ }
    setDismissed(true);
  }

  return (
    <div className="bg-slate-100 border border-slate-200 rounded-lg px-4 py-2.5 flex items-start gap-3 text-sm text-slate-600">
      <span className="flex-1">{getDisclaimerText()}</span>
      <button
        onClick={handleDismiss}
        className="text-slate-400 hover:text-slate-600 text-xs font-medium shrink-0 mt-0.5"
      >
        Dismiss
      </button>
    </div>
  );
}
