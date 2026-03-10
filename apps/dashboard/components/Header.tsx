import Link from 'next/link';

const NAV = [
  { href: '/',           label: 'Dashboard'      },
  { href: '/fixes',      label: 'Fixes'          },
  { href: '/runs',       label: 'Runs'           },
  { href: '/sites',      label: 'Sites'          },
  { href: '/queue',      label: 'Command Center' },
  { href: '/onboarding', label: 'Connect Site'   },
  { href: '/billing',    label: 'Billing'        },
];

export default function Header() {
  return (
    <header className="bg-[#0f1729] text-white shadow-lg">
      <div className="mx-auto max-w-screen-xl px-6 flex items-center gap-8 h-14">
        <div className="flex flex-col leading-tight mr-4">
          <span className="text-base font-bold tracking-tight">Velocity AEO</span>
          <span className="text-[10px] text-slate-400 uppercase tracking-widest">Operator Dashboard</span>
        </div>
        <nav className="flex items-center gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="px-3 py-1.5 rounded text-sm text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
