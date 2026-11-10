'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { CATEGORY_LABELS } from '@/lib/listings/categories';
import { LISTING_CATEGORIES } from '@/types/domain';

export function CategoryStrip() {
  const pathname = usePathname();
  const params = useSearchParams();
  const onBrowse = pathname === '/home' || pathname === '/search';
  const active = onBrowse ? params.get('category') : null;
  const clearance = pathname === '/search' && params.get('clearance') === '1';

  const links = [
    { href: '/home', label: 'All items', on: pathname === '/home' && !active },
    ...LISTING_CATEGORIES.map((c) => ({
      href: `/search?category=${c}`,
      label: CATEGORY_LABELS[c],
      on: active === c,
    })),
  ];

  return (
    <div className="border-hairline bg-ink-raised border-t">
      <nav
        aria-label="Categories"
        className="scrollbar-none mx-auto flex w-full max-w-7xl items-center gap-1 overflow-x-auto px-4 md:px-8"
      >
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={l.on ? 'page' : undefined}
            className={cn(
              'shrink-0 border-b-2 px-3 py-2.5 text-[13px] whitespace-nowrap transition',
              l.on
                ? 'border-paper text-paper font-medium'
                : 'text-paper-dim hover:text-paper border-transparent',
            )}
          >
            {l.label}
          </Link>
        ))}
        <span className="bg-hairline-strong mx-2 h-4 w-px shrink-0" aria-hidden />
        <Link
          href="/search?clearance=1"
          aria-current={clearance ? 'page' : undefined}
          className={cn(
            'text-flame-bright flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] font-medium whitespace-nowrap',
            clearance ? 'border-flame' : 'border-transparent',
          )}
        >
          <span className="bg-flame inline-block size-1.5 rounded-full" />
          Move-out clearance
        </Link>
      </nav>
    </div>
  );
}
