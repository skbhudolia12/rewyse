import Link from 'next/link';
import { MapPin, Plus, Search } from 'lucide-react';
import { Badge, Card, Wordmark } from '@/components/ui';
import { ListingCard } from '@/components/listing-card';
import { requireVerified } from '@/lib/auth/session';
import {
  getCategoryCounts,
  getClearanceListings,
  getFeedListings,
} from '@/lib/listings/queries';
import { LISTING_CATEGORIES, type ListingCategory } from '@/types/domain';

export const dynamic = 'force-dynamic';

const CATEGORY_LABELS: Record<ListingCategory, string> = {
  electronics: 'Electronics',
  furniture: 'Room furniture',
  books: 'Study & books',
  appliances: 'Appliances',
  other: 'Everything else',
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const profile = await requireVerified();

  const active = LISTING_CATEGORIES.includes(category as ListingCategory)
    ? (category as ListingCategory)
    : undefined;

  const [clearance, listings, counts] = await Promise.all([
    getClearanceListings(),
    getFeedListings({ category: active }),
    getCategoryCounts(),
  ]);

  return (
    <main className="grid-paper min-h-full">
      <header className="border-hairline bg-ink/90 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 md:px-10">
          <div className="flex items-center gap-6">
            <Wordmark />
            <span className="border-hairline-strong text-paper-dim hidden items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium sm:inline-flex">
              <MapPin className="text-flame size-3.5" />
              Delhi Cluster
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/search"
              className="border-hairline-strong text-paper-faint hover:text-paper hidden items-center gap-2.5 rounded-full border px-4 py-2 text-sm transition md:flex md:w-72"
            >
              <Search className="size-4" />
              Search your cluster…
            </Link>
            <Link
              href="/listing/new"
              className="bg-flame text-ink hover:bg-flame-bright inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition"
            >
              <Plus className="size-4" />
              Sell
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl space-y-12 px-5 py-8 md:px-10">
        {clearance.length > 0 && (
          <section>
            <div className="mb-5 flex flex-wrap items-baseline gap-3">
              <span className="bg-flame pulse-dot mt-2 inline-block size-2 shrink-0 self-start rounded-full" />
              <h2 className="font-display text-2xl">Move-out clearance</h2>
              <p className="text-paper-dim text-[13px]">Sellers vacating within a week</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {clearance.slice(0, 4).map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              <CategoryChip label="Everything" href="/home" active={!active} />
              {LISTING_CATEGORIES.map((c) => (
                <CategoryChip
                  key={c}
                  label={CATEGORY_LABELS[c]}
                  href={`/home?category=${c}`}
                  active={active === c}
                  count={counts[c] ?? 0}
                />
              ))}
            </div>
            <p className="text-paper-dim text-[13px]">
              {listings.length} {listings.length === 1 ? 'listing' : 'listings'}
            </p>
          </div>

          {listings.length === 0 ? (
            <Card className="py-12 text-center">
              <p className="font-display text-xl">Nothing here yet</p>
              <p className="text-paper-dim mx-auto mt-2 max-w-sm text-sm leading-relaxed">
                {active
                  ? 'No listings in this category on your cluster right now.'
                  : `Be the first. Your move-out date is set, so ${profile.full_name.split(' ')[0]}, you can list something in about a minute.`}
              </p>
              <Link
                href="/listing/new"
                className="bg-flame text-ink hover:bg-flame-bright mt-6 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition"
              >
                <Plus className="size-4" />
                List something
              </Link>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {listings.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function CategoryChip({
  label,
  href,
  active,
  count,
}: {
  label: string;
  href: string;
  active: boolean;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
        active
          ? 'bg-paper text-ink border-paper font-semibold'
          : 'border-hairline-strong text-paper-dim hover:border-paper hover:text-paper'
      }`}
    >
      {label}
      {count !== undefined && count > 0 && !active && (
        <Badge tone="neutral" className="border-0 px-0 py-0 text-[10px]">
          {count}
        </Badge>
      )}
    </Link>
  );
}
