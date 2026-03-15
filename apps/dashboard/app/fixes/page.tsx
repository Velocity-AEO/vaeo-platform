'use client';

import { useState } from 'react';

// ── Static fix data ──────────────────────────────────────────────────────────

const SITE = 'cococabanalife.com';
const HEALTH = { score: 56, grade: 'C' };

const FIX = {
  id: 'title-tag-home',
  label: 'Fix Title Tag',
  url: 'https://cococabanalife.com/',
  issue: 'Keyword Opportunity — Title Missing Primary Intent',
  current:  'Cococabana Life | Luxury Pool Floats',
  proposed: 'Luxury Foam Pool Floats & Beach Accessories | Cococabana Life',
  reason:
    'Current title buries the primary keyword. Leading with "Luxury Foam Pool Floats" captures 3× search volume. AI confidence based on crawl data + keyword gap analysis.',
  confidence: 94,
  chars: { before: 37, after: 60 },
};

type FixState = 'pending' | 'applying' | 'applied' | 'rolling-back' | 'rolled-back' | 'error';

// ── Sub-components ────────────────────────────────────────────────────────────

function SiteHeader() {
  const gradeColor =
    HEALTH.grade === 'A'
      ? 'text-green-600'
      : HEALTH.grade === 'B'
      ? 'text-yellow-600'
      : 'text-orange-500';

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-8">
      <div>
        <h1 className="text-lg md:text-xl font-semibold text-slate-900 truncate max-w-xs md:max-w-none">{SITE}</h1>
        <p className="text-xs text-slate-400 mt-0.5">Shopify</p>
      </div>
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5">
        <span className="text-xs text-slate-500 uppercase tracking-wide font-medium">Health</span>
        <span className="text-2xl font-bold tabular-nums text-slate-800">{HEALTH.score}</span>
        <span className={`text-xl font-bold ${gradeColor}`}>{HEALTH.grade}</span>
      </div>
    </div>
  );
}

function ConfidencePill({ value }: { value: number }) {
  const color =
    value >= 90 ? 'bg-green-100 text-green-800 border-green-200' :
    value >= 75 ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                  'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span className={`inline-flex items-center gap-1 border rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>
      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4 6l1.5 1.5L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {value}% confidence
    </span>
  );
}

function TitleComparison({ fixState, originalTitle }: { fixState: FixState; originalTitle: string }) {
  const isApplied = fixState === 'applied' || fixState === 'rolling-back';
  const isRolledBack = fixState === 'rolled-back';

  return (
    <div className="space-y-3">
      {/* Current / Original */}
      <div>
        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-medium mb-1">
          {isRolledBack ? 'Restored' : 'Current'}
        </p>
        <p
          className={`text-sm font-mono border rounded-lg px-3 py-2 transition-colors ${
            isApplied
              ? 'text-slate-400 bg-slate-50 border-slate-200 line-through opacity-50'
              : isRolledBack
              ? 'text-slate-800 bg-slate-50 border-slate-300 font-semibold'
              : 'text-slate-600 bg-slate-50 border-slate-200'
          }`}
        >
          {originalTitle}
          <span className="ml-2 text-[10px] text-slate-400 not-italic font-sans">{originalTitle.length} chars</span>
        </p>
      </div>

      {/* Proposed */}
      <div>
        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-medium mb-1">AI Proposed</p>
        <p
          className={`text-sm font-mono border rounded-lg px-3 py-2 transition-colors ${
            isApplied
              ? 'text-green-800 bg-green-50 border-green-200 font-semibold'
              : isRolledBack
              ? 'text-slate-400 bg-slate-50 border-slate-200 line-through opacity-50'
              : 'text-slate-800 bg-white border-slate-200'
          }`}
        >
          {FIX.proposed}
          <span className={`ml-2 text-[10px] not-italic font-sans ${isApplied ? 'text-green-600' : 'text-slate-400'}`}>
            {FIX.chars.after} chars
          </span>
        </p>
      </div>
    </div>
  );
}

function AppliedOverlay({
  onRollback,
  rollbackState,
}: {
  onRollback: () => void;
  rollbackState: 'idle' | 'loading';
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/95 rounded-2xl z-10 gap-3">
      <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
        <svg className="w-8 h-8 text-green-600" viewBox="0 0 24 24" fill="none">
          <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="text-base font-semibold text-slate-900">Fix Applied</p>
      <span className="inline-flex items-center gap-1.5 bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
        <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-pulse" />
        LIVE
      </span>
      <button
        onClick={onRollback}
        disabled={rollbackState === 'loading'}
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-200 hover:border-slate-300 bg-white rounded-lg px-3 py-1.5 transition-colors mt-1"
      >
        {rollbackState === 'loading' ? (
          <>
            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
              <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            Rolling back…
          </>
        ) : (
          <>
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
              <path d="M3 8a5 5 0 1 0 1.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M3 4v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Rollback
          </>
        )}
      </button>
    </div>
  );
}

function RolledBackOverlay() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/95 rounded-2xl z-10 gap-3">
      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
        <svg className="w-7 h-7 text-slate-400" viewBox="0 0 16 16" fill="none">
          <path d="M3 8a5 5 0 1 0 1.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M3 4v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="text-base font-semibold text-slate-700">Rolled Back</p>
      <span className="inline-flex items-center gap-1.5 bg-slate-200 text-slate-600 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
        Original Restored
      </span>
      <p className="text-xs text-slate-400 text-center max-w-[200px]">
        Live theme restored to original title tag.
      </p>
    </div>
  );
}

// ── Fix Card ──────────────────────────────────────────────────────────────────

function FixCard() {
  const [state, setState] = useState<FixState>('pending');
  const [rollbackState, setRollbackState] = useState<'idle' | 'loading'>('idle');
  const [originalTitle, setOriginalTitle] = useState(FIX.current);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleApply() {
    setState('applying');
    setErrorMsg('');
    try {
      const res = await fetch('/api/apply-fix', { method: 'POST' });
      const body = await res.json() as { ok: boolean; error?: string; original_title?: string };
      if (body.ok) {
        if (body.original_title) setOriginalTitle(body.original_title);
        setState('applied');
      } else {
        setErrorMsg(body.error ?? 'Unknown error');
        setState('error');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }

  async function handleRollback() {
    setRollbackState('loading');
    try {
      const res = await fetch('/api/rollback-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original_title: originalTitle }),
      });
      const body = await res.json() as { ok: boolean; error?: string };
      if (body.ok) {
        setState('rolled-back');
      } else {
        // Rollback failed — stay in applied state, surface error briefly
        setErrorMsg(body.error ?? 'Rollback failed');
        setState('error');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setState('error');
    } finally {
      setRollbackState('idle');
    }
  }

  const showOverlay = state === 'applied' || state === 'rolling-back' || state === 'rolled-back';

  return (
    <div className="relative bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-sm w-full max-w-2xl">
      {state === 'applied' || state === 'rolling-back' ? (
        <AppliedOverlay onRollback={handleRollback} rollbackState={rollbackState} />
      ) : state === 'rolled-back' ? (
        <RolledBackOverlay />
      ) : null}

      {/* Card header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded">
              Title Tag
            </span>
            <span className="text-[10px] text-slate-400 font-mono">{FIX.url}</span>
          </div>
          <h2 className="text-sm font-semibold text-slate-800">{FIX.issue}</h2>
        </div>
        <ConfidencePill value={FIX.confidence} />
      </div>

      {/* Title comparison */}
      <TitleComparison
        fixState={state}
        originalTitle={originalTitle}
      />

      {/* Reason */}
      <p className="mt-4 text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 leading-relaxed">
        {FIX.reason}
      </p>

      {/* Error */}
      {state === 'error' && (
        <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {errorMsg}
        </p>
      )}

      {/* Actions — hidden when overlay is shown */}
      {!showOverlay && (
        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={handleApply}
            disabled={state === 'applying'}
            className="inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors h-11 w-full sm:w-auto"
          >
            {state === 'applying' ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                  <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Applying…
              </>
            ) : (
              'Approve & Apply'
            )}
          </button>
          {state === 'error' && (
            <button
              onClick={() => setState('pending')}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FixesPage() {
  return (
    <>
      <SiteHeader />

      <div className="mb-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Pending Fixes</h2>
        <p className="text-xs text-slate-400">AI-detected issues with proposed patches ready to apply.</p>
      </div>

      <FixCard />
    </>
  );
}
