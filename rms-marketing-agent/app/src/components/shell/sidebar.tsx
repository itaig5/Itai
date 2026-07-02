'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarClock, Compass, Eye, Home, ListChecks, Settings, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/recommendations', label: 'Recommendations', icon: Sparkles },
  { href: '/radar', label: 'Promotion Radar', icon: Compass },
  { href: '/visibility', label: 'Visibility', icon: Eye },
  { href: '/audit', label: 'Audit & Outcomes', icon: ListChecks },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-hairline bg-card">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-ink">
          <CalendarClock size={17} />
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight tracking-tight">RevPilot</div>
          <div className="text-[10px] text-ink-muted leading-tight">revenue · every channel</div>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                active ? 'bg-accent-soft text-ink' : 'text-ink-secondary hover:bg-inset hover:text-ink',
              )}
            >
              <Icon size={15} className={active ? 'text-accent' : 'text-ink-muted'} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-5 py-4 text-[10px] leading-relaxed text-ink-muted">
        Demo world on seed data.
        <br />
        Advisory by design — every push is
        <br />
        guarded &amp; operator-approved.
      </div>
    </aside>
  );
}
