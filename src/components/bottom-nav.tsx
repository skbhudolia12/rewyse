'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, PlusCircle, MessageCircle, User, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/search', label: 'Explore', icon: Search },
  { href: '/listing/new', label: 'Sell', icon: PlusCircle },
  { href: '/messages', label: 'Messages', icon: MessageCircle },
  { href: '/profile', label: 'Profile', icon: User },
] as const;

export function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = isAdmin
    ? [...ITEMS, { href: '/admin/verifications', label: 'Review', icon: ShieldCheck } as const]
    : ITEMS;

  return (
    <nav
      aria-label="Main"
      className="border-hairline bg-surface/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="mx-auto flex max-w-md">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-16 flex-col items-center justify-center gap-0.5 text-[10px] font-medium',
                  active ? 'text-flame' : 'text-paper-dim',
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.4 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
