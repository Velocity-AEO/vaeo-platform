'use client';

import Link from 'next/link';
import { getBannerState, getBannerMessage } from '../lib/banner_logic';

interface Props {
  data_source: 'gsc_live' | 'simulated';
  gsc_connected: boolean;
}

export default function SimulatedDataBanner({ data_source, gsc_connected }: Props) {
  const state = getBannerState(data_source, gsc_connected);

  if (state === 'no_banner') return null;

  const message = getBannerMessage(state);
  const isYellow = state === 'gsc_not_connected';

  return (
    <div
      className={`rounded-lg px-4 py-2.5 flex items-center gap-3 text-sm ${
        isYellow
          ? 'bg-yellow-50 border border-yellow-200 text-yellow-800'
          : 'bg-blue-50 border border-blue-200 text-blue-800'
      }`}
    >
      <span className="flex-1">{message}</span>
      {state === 'gsc_not_connected' && (
        <Link
          href="/settings/gsc"
          className="shrink-0 px-3 py-1 rounded bg-yellow-600 text-white text-xs font-medium hover:bg-yellow-700 transition-colors"
        >
          Connect GSC
        </Link>
      )}
    </div>
  );
}
