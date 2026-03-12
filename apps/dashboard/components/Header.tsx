'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const NAV = [
  { href: '/dashboard',  label: 'My Dashboard'   },
  { href: '/',           label: 'Operator'       },
  { href: '/fixes',      label: 'Fixes'          },
  { href: '/approvals',  label: 'Approvals'      },
  { href: '/learnings',  label: 'Learnings'      },
  { href: '/runs',       label: 'Runs'           },
  { href: '/sites',      label: 'Sites'          },
  { href: '/queue',      label: 'Command Center' },
  { href: '/jobs',       label: 'Jobs'           },
  { href: '/report',     label: 'Reports'        },
  { href: '/security',   label: 'Security'       },
  { href: '/vehicle',       label: 'Vehicle Schema' },
  { href: '/localbusiness', label: 'Local SEO'      },
  { href: '/accessibility', label: 'Accessibility'  },
  { href: '/environment',   label: 'App Environment' },
  { href: '/native',        label: 'Native'          },
  { href: '/onboarding',    label: 'Connect Site'   },
  { href: '/billing',    label: 'Billing'        },
];

export default function Header() {
  const pathname = usePathname();
  const router   = useRouter();
  const [pendingCount, setPendingCount] = useState(0);

  // Fetch pending approvals count for badge
  useEffect(() => {
    if (pathname === '/login') return;
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch('/api/approvals');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) {
          setPendingCount(data.filter((d: { status: string }) => d.status === 'pending').length);
        }
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [pathname]);

  // Don't render on auth pages — login page uses a full-screen overlay.
  if (pathname === '/login') return null;

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <header className="bg-[#0f1729] text-white shadow-lg">
      <div className="mx-auto max-w-screen-xl px-6 flex items-center gap-8 h-14">
        <div className="flex flex-col leading-tight mr-4">
          <span className="text-base font-bold tracking-tight">Velocity AEO</span>
          <span className="text-[10px] text-slate-400 uppercase tracking-widest">Operator Dashboard</span>
        </div>
        <nav className="flex items-center gap-1 flex-1 overflow-x-auto">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`px-3 py-1.5 rounded text-sm transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                pathname === n.href
                  ? 'bg-white/15 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              {n.label}
              {n.href === '/approvals' && pendingCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {pendingCount}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <button
          onClick={handleLogout}
          className="ml-auto text-xs text-slate-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
