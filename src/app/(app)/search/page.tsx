import Link from 'next/link';
import { Card } from '@/components/ui';
import { ListingGrid } from '@/components/listing-grid';
import { requireVerified } from '@/lib/auth/session';
import { getFeedListings } from '@/lib/listings/queries';
import { CATEGORY_LABELS } from '@/lib/listings/categories';
import { cn } from '@/lib/utils';
import { LISTING_CATEGORIES, type ListingCategory } from '@/types/domain';

export const dynamic = 'force-dynamic';

function searchHref(params: {
  q?: string | undefined;
  category?: string | undefined;
  clearance?: boolean;
}): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.category) sp.set('category', params.category);
  if (params.clearance) sp.set('clearance', '1');
  const qs = sp.toString();
  return qs ? `/search?${qs}` : '/search';
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; clearance?: string }>;
}) {
  const { q, category, clearance } = await searchParams;
  const profile = await requireVerified();

  const active = LISTING_CATEGORIES.includes(category as ListingCategory)
    ? (category as ListingCategory)
    : undefined;
  const query = q?.trim() || undefined;
  const clearanceOnly = clearance === '1';

  const listings = await getFeedListings({ category: active, query, clearanceOnly });

  const heading = query
    ? `Results for “${query}”`
    : clearanceOnly
      ? 'Sellers leaving this week'
      : active
        ? CATEGORY_LABELS[active]
        : 'Everything on your cluster';

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
        <p className="text-paper-dim text-[13px]">
          {listings.length} {listings.length === 1 ? 'item' : 'items'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip
          label="All categories"
          href={searchHref({ q: query, clearance: clearanceOnly })}
          active={!active}
        />
        {LISTING_CATEGORIES.map((c) => (
          <Chip
            key={c}
            label={CATEGORY_LABELS[c]}
            href={searchHref({ q: query, category: c, clearance: clearanceOnly })}
            active={active === c}
          />
        ))}
        <Chip
          label="Leaving this week"
          href={searchHref({ q: query, category: active, clearance: !clearanceOnly })}
          active={clearanceOnly}
          flame
        />
      </div>

      {listings.length === 0 ? (
        <Card className="py-14 text-center">
          <p className="text-lg font-semibold">No items match</p>
          <p className="text-paper-dim mx-auto mt-2 max-w-sm text-sm">
            {query
              ? `Nothing on your cluster matches “${query}”. Try a shorter word, or clear the filters.`
              : 'Nothing listed with these filters yet.'}
          </p>
          <Link
            href="/search"
            className="text-flame-bright hover:text-flame mt-5 inline-block text-sm font-medium"
          >
            Clear filters
          </Link>
        </Card>
      ) : (
        <ListingGrid
          listings={listings}
          viewer={profile.campus?.abbreviation ?? ''}
          now={new Date()}
        />
      )}
    </main>
  );
}

function Chip({
  label,
  href,
  active,
  flame,
}: {
  label: string;
  href: string;
  active: boolean;
  flame?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] transition',
        active
          ? flame
            ? 'border-flame bg-flame-soft text-flame-bright font-medium'
            : 'border-paper bg-paper text-ink font-medium'
          : 'border-hairline-strong text-paper-dim hover:text-paper hover:border-paper-faint',
      )}
    >
      {label}
    </Link>
  );
}
