/**
 * tools/heavyweight/script_stub_library.ts
 *
 * Library of safe no-op script stubs that simulate the timing
 * and performance characteristics of third-party apps without
 * executing real code. Used by the sandbox to validate fixes
 * under production-like load conditions.
 *
 * All stub_js values use only setTimeout + console.log.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ScriptStub {
  app_id:                      string;
  app_name:                    string;
  category:                    string;
  stub_js:                     string;
  simulated_load_ms:           number;
  simulated_main_thread_ms:    number;
  simulated_network_requests:  number;
  affects_cls:                 boolean;
  affects_lcp:                 boolean;
  dom_mutations:               string[];
  description:                 string;
}

export interface SimulatedCost {
  total_load_ms:          number;
  total_main_thread_ms:   number;
  total_network_requests: number;
  cls_contributors:       string[];
  lcp_contributors:       string[];
}

// ── Stub catalog ─────────────────────────────────────────────────────────────

export const SCRIPT_STUB_LIBRARY: ScriptStub[] = [
  {
    app_id:                     'intercom',
    app_name:                   'Intercom',
    category:                   'chat',
    stub_js:                    'window.__vaeo_stub_intercom=true;setTimeout(()=>console.log("[VAEO stub] Intercom loaded"),800);',
    simulated_load_ms:          800,
    simulated_main_thread_ms:   450,
    simulated_network_requests: 12,
    affects_cls:                true,
    affects_lcp:                false,
    dom_mutations:              ['#intercom-frame', '.intercom-launcher'],
    description:                'Simulates Intercom chat widget load cost',
  },
  {
    app_id:                     'klaviyo_popup',
    app_name:                   'Klaviyo',
    category:                   'popup',
    stub_js:                    'window.__vaeo_stub_klaviyo=true;setTimeout(()=>console.log("[VAEO stub] Klaviyo loaded"),400);',
    simulated_load_ms:          400,
    simulated_main_thread_ms:   180,
    simulated_network_requests: 6,
    affects_cls:                false,
    affects_lcp:                false,
    dom_mutations:              ['#klaviyo-form'],
    description:                'Simulates Klaviyo email/SMS tracking + popup cost',
  },
  {
    app_id:                     'hotjar',
    app_name:                   'Hotjar',
    category:                   'analytics',
    stub_js:                    'window.__vaeo_stub_hotjar=true;setTimeout(()=>console.log("[VAEO stub] Hotjar loaded"),600);',
    simulated_load_ms:          600,
    simulated_main_thread_ms:   320,
    simulated_network_requests: 8,
    affects_cls:                false,
    affects_lcp:                true,
    dom_mutations:              ['#_hj_feedback_container'],
    description:                'Simulates Hotjar heatmap and session recording cost',
  },
  {
    app_id:                     'tidio',
    app_name:                   'Tidio',
    category:                   'chat',
    stub_js:                    'window.__vaeo_stub_tidio=true;setTimeout(()=>console.log("[VAEO stub] Tidio loaded"),700);',
    simulated_load_ms:          700,
    simulated_main_thread_ms:   380,
    simulated_network_requests: 10,
    affects_cls:                true,
    affects_lcp:                false,
    dom_mutations:              ['#tidio-chat'],
    description:                'Simulates Tidio live chat widget load cost',
  },
  {
    app_id:                     'lucky_orange',
    app_name:                   'Lucky Orange',
    category:                   'analytics',
    stub_js:                    'window.__vaeo_stub_luckyorange=true;setTimeout(()=>console.log("[VAEO stub] Lucky Orange loaded"),900);',
    simulated_load_ms:          900,
    simulated_main_thread_ms:   520,
    simulated_network_requests: 15,
    affects_cls:                false,
    affects_lcp:                true,
    dom_mutations:              ['#lo-identify'],
    description:                'Simulates Lucky Orange session recording cost',
  },
  {
    app_id:                     'privy',
    app_name:                   'Privy',
    category:                   'popup',
    stub_js:                    'window.__vaeo_stub_privy=true;setTimeout(()=>console.log("[VAEO stub] Privy loaded"),550);',
    simulated_load_ms:          550,
    simulated_main_thread_ms:   290,
    simulated_network_requests: 7,
    affects_cls:                true,
    affects_lcp:                false,
    dom_mutations:              ['#privy-container'],
    description:                'Simulates Privy popup and banner load cost',
  },
  {
    app_id:                     'hextom_shipping_bar',
    app_name:                   'Hextom Shipping Bar',
    category:                   'shipping',
    stub_js:                    'window.__vaeo_stub_hextom=true;setTimeout(()=>console.log("[VAEO stub] Hextom loaded"),300);',
    simulated_load_ms:          300,
    simulated_main_thread_ms:   120,
    simulated_network_requests: 3,
    affects_cls:                true,
    affects_lcp:                false,
    dom_mutations:              ['#hextom-fsb'],
    description:                'Simulates Hextom free shipping bar load cost',
  },
  {
    app_id:                     'judge_me',
    app_name:                   'Judge.me',
    category:                   'reviews',
    stub_js:                    'window.__vaeo_stub_judgeme=true;setTimeout(()=>console.log("[VAEO stub] Judge.me loaded"),350);',
    simulated_load_ms:          350,
    simulated_main_thread_ms:   160,
    simulated_network_requests: 5,
    affects_cls:                false,
    affects_lcp:                false,
    dom_mutations:              ['.jdgm-widget'],
    description:                'Simulates Judge.me product review widget cost',
  },
  {
    app_id:                     'smile_io',
    app_name:                   'Smile.io',
    category:                   'loyalty',
    stub_js:                    'window.__vaeo_stub_smileio=true;setTimeout(()=>console.log("[VAEO stub] Smile.io loaded"),650);',
    simulated_load_ms:          650,
    simulated_main_thread_ms:   340,
    simulated_network_requests: 9,
    affects_cls:                true,
    affects_lcp:                false,
    dom_mutations:              ['#smile-ui-container'],
    description:                'Simulates Smile.io loyalty launcher widget cost',
  },
  {
    app_id:                     'instafeed',
    app_name:                   'Instafeed',
    category:                   'social',
    stub_js:                    'window.__vaeo_stub_instafeed=true;setTimeout(()=>console.log("[VAEO stub] Instafeed loaded"),250);',
    simulated_load_ms:          250,
    simulated_main_thread_ms:   80,
    simulated_network_requests: 4,
    affects_cls:                false,
    affects_lcp:                false,
    dom_mutations:              ['#instafeed'],
    description:                'Simulates Instafeed Instagram feed widget cost',
  },
];

// ── Lookup helpers ───────────────────────────────────────────────────────────

export function getStubByAppId(app_id: string): ScriptStub | undefined {
  return SCRIPT_STUB_LIBRARY.find((s) => s.app_id === app_id);
}

export function getStubsForDetectedApps(app_ids: string[]): ScriptStub[] {
  try {
    if (!app_ids?.length) return [];
    return app_ids
      .map((id) => SCRIPT_STUB_LIBRARY.find((s) => s.app_id === id))
      .filter((s): s is ScriptStub => s !== undefined);
  } catch {
    return [];
  }
}

export function calculateTotalSimulatedCost(stubs: ScriptStub[]): SimulatedCost {
  try {
    if (!stubs?.length) {
      return {
        total_load_ms: 0,
        total_main_thread_ms: 0,
        total_network_requests: 0,
        cls_contributors: [],
        lcp_contributors: [],
      };
    }

    return {
      total_load_ms:          stubs.reduce((s, st) => s + st.simulated_load_ms, 0),
      total_main_thread_ms:   stubs.reduce((s, st) => s + st.simulated_main_thread_ms, 0),
      total_network_requests: stubs.reduce((s, st) => s + st.simulated_network_requests, 0),
      cls_contributors:       stubs.filter((st) => st.affects_cls).map((st) => st.app_name),
      lcp_contributors:       stubs.filter((st) => st.affects_lcp).map((st) => st.app_name),
    };
  } catch {
    return {
      total_load_ms: 0,
      total_main_thread_ms: 0,
      total_network_requests: 0,
      cls_contributors: [],
      lcp_contributors: [],
    };
  }
}
