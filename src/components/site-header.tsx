import Link from 'next/link';
import { Suspense } from 'react';
import { MapPin, MessageCircle, Package, Plus, Repeat, Search, ShieldCheck, User } from 'lucide-react';
import { Wordmark } from '@/components/ui';
import { CategoryStrip } from '@/components/category-strip';
import { CATEGORY_LABELS } from '@/lib/listings/categories';
import { LISTING_CATEGORIES } from '@/types/domain';

/**
 * The marketplace header: identity, where things get delivered, search, and
 * the four places a student goes back to. Search is the widest element on
 * purpose -- on a marketplace it is the primary way in.
 */
export function SiteHeader({
  firstName,
  campusAbbr,
  isAdmin,
  verified,
  isDemo = false,
}: {
  firstName: string;
  campusAbbr: string;
  isAdmin: boolean;
  verified: boolean;
  /** Demo accounts get a way back to /demo to try another role. */
  isDemo?: boolean;
}) {
  return (
    <header className="border-hairline bg-ink/95 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 md:flex-nowrap md:px-8">
        <Link href={verified ? '/home' : '/verify'} aria-label="ReWyse home" className="shrink-0">
          <Wordmark />
        </Link>

        <div className="text-paper-dim flex shrink-0 items-center gap-1.5 text-[13px] leading-tight">
          <MapPin className="size-4" />
          <span>
            <span className="text-paper-faint block text-[11px]">Delivering to</span>
            <span className="text-paper font-medium">{campusAbbr} campus</span>
          </span>
        </div>

        {verified && (
          <form
            action="/search"
            role="search"
            className="border-hairline-strong focus-within:border-flame bg-ink-raised order-last flex h-11 w-full overflow-hidden rounded-lg border transition md:order-none md:flex-1"
          >
            <label htmlFor="header-category" className="sr-only">
              Category
            </label>
            <select
              id="header-category"
              name="category"
              defaultValue=""
              className="bg-ink-elevated text-paper-dim border-hairline hidden border-r px-3 text-[13px] focus:outline-none sm:block"
            >
              <option value="">All</option>
              {LISTING_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <label htmlFor="header-search" className="sr-only">
              Search listings
            </label>
            <input
              id="header-search"
              name="q"
              placeholder="Search monitors, desks, textbooks…"
              className="text-paper placeholder:text-paper-faint min-w-0 flex-1 bg-transparent px-3.5 focus:outline-none"
            />
            <button
              type="submit"
              aria-label="Search"
              className="bg-flame text-ink hover:bg-flame-bright flex w-12 items-center justify-center transition"
            >
              <Search className="size-[18px]" />
            </button>
          </form>
        )}

        {isDemo && (
          <Link
            href="/demo"
            className="border-hairline-strong text-paper-dim hover:text-paper ml-auto flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition md:order-last md:ml-0"
          >
            <Repeat className="size-3.5" />
            Switch role
          </Link>
        )}

        <nav aria-label="Account" className="ml-auto hidden items-center gap-1 md:flex">
          {verified && (
            <>
              <HeaderLink href="/listing/new" icon={<Plus className="size-4" />} label="Sell" />
              <HeaderLink href="/orders" icon={<Package className="size-4" />} label="Orders" />
              <HeaderLink
                href="/messages"
                icon={<MessageCircle className="size-4" />}
                label="Messages"
              />
            </>
          )}
          {isAdmin && (
            <HeaderLink href="/admin" icon={<ShieldCheck className="size-4" />} label="Admin" />
          )}
          {verified && (
            <HeaderLink href="/profile" icon={<User className="size-4" />} label={firstName} />
          )}
        </nav>
      </div>

      {verified && (
        <Suspense fallback={<div className="h-10" />}>
          <CategoryStrip />
        </Suspense>
      )}
    </header>
  );
}

function HeaderLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="text-paper-dim hover:text-paper hover:bg-surface flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium transition"
    >
      {icon}
      {label}
    </Link>
  );
}
