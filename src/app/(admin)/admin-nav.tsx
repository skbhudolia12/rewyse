'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/payments', label: 'Escrow and delivery' },
  { href: '/admin/verifications', label: 'ID checks' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/insights', label: 'Pricing insights' },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <div className="border-hairline border-b">
      <nav
        aria-label="Operations"
        className="scrollbar-none mx-auto flex w-full max-w-7xl gap-1 overflow-x-auto px-4 md:px-8"
      >
        <span className="text-paper-faint mr-3 shrink-0 self-center text-[13px]">Operations</span>
        {SECTIONS.map((s) => {
          const active = s.href === '/admin' ? pathname === '/admin' : pathname.startsWith(s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'shrink-0 border-b-2 px-3 py-3 text-sm whitespace-nowrap transition',
                active ? 'border-flame text-paper font-medium' : 'text-paper-dim hover:text-paper border-transparent',
              )}
            >
              {s.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
