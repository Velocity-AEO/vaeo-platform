'use client';

import { useEffect, useState } from 'react';
import { getTabClasses, getCleanIndicator } from '../lib/strip_component_logic';

interface ViewportItem {
  name: string;
  width: number;
  before_url: string | null;
  after_url: string | null;
  clean: boolean;
}

interface ScreenshotData {
  fix_id: string;
  url: string;
  viewports: ViewportItem[];
  all_clean: boolean;
}

interface Props {
  fix_id: string;
  site_id: string;
  class_name?: string;
}

const VIEWPORT_TABS = ['mobile', 'tablet', 'laptop', 'wide'];
const VIEWPORT_LABELS: Record<string, string> = {
  mobile: 'Mobile',
  tablet: 'Tablet',
  laptop: 'Laptop',
  wide: 'Wide',
};

export default function ViewportScreenshotStrip({ fix_id, site_id, class_name }: Props) {
  const [data, setData] = useState<ScreenshotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState('mobile');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    fetch(`/api/fixes/${fix_id}/screenshots?siteId=${site_id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [fix_id, site_id]);

  if (loading) {
    return (
      <div className={`animate-pulse space-y-3 ${class_name ?? ''}`}>
        <div className="flex gap-2">
          {VIEWPORT_TABS.map((t) => (
            <div key={t} className="h-8 w-20 bg-gray-200 rounded-md" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="h-48 bg-gray-200 rounded-lg" />
          <div className="h-48 bg-gray-200 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={`text-sm text-gray-500 py-4 ${class_name ?? ''}`}>
        Screenshots unavailable for this fix
      </div>
    );
  }

  const activeViewport = data.viewports.find((v) => v.name === activeTab) ?? data.viewports[0];
  const indicator = activeViewport ? getCleanIndicator(activeViewport.clean) : null;

  return (
    <div className={class_name ?? ''}>
      {/* Viewport tabs */}
      <div className="flex gap-2 mb-4">
        {VIEWPORT_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={getTabClasses(tab, activeTab)}
          >
            {VIEWPORT_LABELS[tab] ?? tab}
          </button>
        ))}
      </div>

      {activeViewport && (
        <>
          {/* Active viewport info + clean indicator */}
          <div className="flex items-center gap-2 mb-3 text-sm text-gray-600">
            <span className="font-medium">
              {VIEWPORT_LABELS[activeViewport.name] ?? activeViewport.name} ({activeViewport.width}px)
            </span>
            {indicator && (
              <span className={`${indicator.color} font-medium`}>
                {indicator.icon} {indicator.label}
              </span>
            )}
          </div>

          {/* Before / After panels */}
          <div className="grid grid-cols-2 gap-4">
            {/* Before */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-500 border-b border-gray-200">
                Before
              </div>
              {activeViewport.before_url ? (
                <img
                  src={activeViewport.before_url}
                  alt={`Before — ${activeViewport.name}`}
                  className="w-full h-auto"
                />
              ) : (
                <div className="h-48 bg-gray-100 flex items-center justify-center text-sm text-gray-400">
                  Screenshot unavailable
                </div>
              )}
            </div>

            {/* After */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-500 border-b border-gray-200">
                After
              </div>
              {activeViewport.after_url ? (
                <img
                  src={activeViewport.after_url}
                  alt={`After — ${activeViewport.name}`}
                  className="w-full h-auto"
                />
              ) : (
                <div className="h-48 bg-gray-100 flex items-center justify-center text-sm text-gray-400">
                  Screenshot unavailable
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
