'use client';

import type { OnboardingStep, OnboardingProgress } from '../../../tools/onboarding/onboarding_progress.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface OnboardingProgressTrackerProps {
  progress: OnboardingProgress;
  onDismiss?: () => void;
}

// ── Step icon ────────────────────────────────────────────────────────────────

function StepIcon({ status }: { status: OnboardingStep['status'] }) {
  if (status === 'complete') {
    return (
      <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (status === 'in_progress') {
    return (
      <div className="w-6 h-6 rounded-full border-2 border-blue-500 bg-blue-50 flex items-center justify-center flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
      </div>
    );
  }
  if (status === 'blocked') {
    return (
      <div className="w-6 h-6 rounded-full bg-red-100 border-2 border-red-300 flex items-center justify-center flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-red-400" />
      </div>
    );
  }
  return (
    <div className="w-6 h-6 rounded-full border-2 border-slate-200 bg-white flex-shrink-0" />
  );
}

// ── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
      <div
        className="h-2 rounded-full bg-green-500 transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

// ── Completion celebration ───────────────────────────────────────────────────

function CompletionBanner() {
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
      <p className="text-green-800 font-semibold text-sm">Setup Complete</p>
      <p className="text-green-600 text-xs mt-1">
        VAEO is running on autopilot. Fixes apply nightly.
      </p>
    </div>
  );
}

// ── Step row ─────────────────────────────────────────────────────────────────

function StepRow({ step }: { step: OnboardingStep }) {
  const isActive = step.status === 'in_progress';
  return (
    <div className={`flex items-start gap-3 py-2 ${isActive ? 'bg-blue-50 -mx-3 px-3 rounded-lg' : ''}`}>
      <StepIcon status={step.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-medium ${step.status === 'complete' ? 'text-slate-400 line-through' : isActive ? 'text-blue-700' : 'text-slate-600'}`}>
            {step.label}
          </p>
          {!step.required && (
            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Optional</span>
          )}
        </div>
        <p className={`text-xs mt-0.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>
          {step.description}
        </p>
        {isActive && step.action_url && step.action_label && (
          <a
            href={step.action_url}
            className="inline-block mt-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded transition-colors"
          >
            {step.action_label}
          </a>
        )}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function OnboardingProgressTracker({ progress, onDismiss }: OnboardingProgressTrackerProps) {
  if (!progress || progress.total_steps === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Getting Started</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {progress.completed_steps} of {progress.total_steps} steps complete
            {progress.estimated_minutes_remaining > 0 && !progress.is_complete
              ? ` \u00B7 ~${progress.estimated_minutes_remaining} min remaining`
              : ''}
          </p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-slate-400 hover:text-slate-600 text-xs"
            aria-label="Dismiss onboarding"
          >
            Dismiss
          </button>
        )}
      </div>

      {/* Progress bar */}
      <ProgressBar percent={progress.percent_complete} />

      {/* Completion celebration */}
      {progress.is_complete ? (
        <div className="mt-4">
          <CompletionBanner />
        </div>
      ) : (
        /* Step list */
        <div className="mt-4 space-y-1">
          {progress.steps.map(step => (
            <StepRow key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}
