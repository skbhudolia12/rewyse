import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Card } from '@/components/ui';
import { ListingCard } from '@/components/listing-card';
import { ListingGrid } from '@/components/listing-grid';
import { requireVerified } from '@/lib/auth/session';
import { getClearanceListings, getFeedListings } from '@/lib/listings/queries';
import { CATEGORY_LABELS } from '@/lib/listings/categories';
import { LISTING_CATEGORIES, type ListingCategory } from '@/types/domain';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const profile = await requireVerified();
  const viewerCampus = profile.campus?.abbreviation ?? '';

  const active = LISTING_CATEGORIES.includes(category as ListingCategory)
    ? (category as ListingCategory)
    : undefined;

  const [clearance, listings] = await Promise.all([
    getClearanceListings(12),
    getFeedListings({ category: active }),
  ]);
  const now = new Date();

  return (
    <main className="mx-auto w-full max-w-7xl space-y-10 px-4 py-6 md:px-8 md:py-8">
      {clearance.length > 0 && (
        <section
          aria-labelledby="clearance-heading"
          className="bg-ink-raised border-hairline relative overflow-hidden rounded-2xl border"
        >
          <span className="bg-flame absolute inset-y-0 left-0 w-1" aria-hidden />
          <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5 md:px-7 md:pt-6">
            <div>
              <h2 id="clearance-heading" className="font-display text-2xl md:text-[28px]">
                Leaving campus this week
              </h2>
              <p className="text-paper-dim mt-1.5 max-w-xl text-sm">
                These sellers move out within 7 days, and their prices drop as the date gets
                closer.
              </p>
            </div>
            <Link
              href="/search?clearance=1"
              className="text-flame-bright hover:text-flame text-sm font-medium"
            >
              See all
            </Link>
          </div>
          <div className="scrollbar-none flex snap-x scroll-px-5 gap-4 overflow-x-auto px-5 pt-5 pb-6 md:scroll-px-7 md:px-7">
            {clearance.map((l) => (
              <div key={l.id} className="w-44 shrink-0 snap-start md:w-52">
                <ListingCard listing={l} viewerCampusAbbr={viewerCampus} now={now} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="feed-heading">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="feed-heading" className="text-lg font-semibold">
            {active ? CATEGORY_LABELS[active] : 'Across the Delhi cluster'}
          </h2>
          <p className="text-paper-dim text-[13px]">
            {listings.length} {listings.length === 1 ? 'item' : 'items'} from IIITD, IITD and DTU
          </p>
        </div>

        {listings.length === 0 ? (
          <Card className="py-14 text-center">
            <p className="text-lg font-semibold">Nothing listed here yet</p>
            <p className="text-paper-dim mx-auto mt-2 max-w-sm text-sm leading-relaxed">
              {active
                ? 'No one on your cluster is selling in this category right now.'
                : 'List the first item. It takes about a minute, and the price is worked out for you.'}
            </p>
            <Link
              href="/listing/new"
              className="bg-flame text-ink hover:bg-flame-bright mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg px-5 text-sm font-semibold transition"
            >
              <Plus className="size-4" />
              List an item
            </Link>
          </Card>
        ) : (
          <ListingGrid listings={listings} viewer={viewerCampus} now={now} />
        )}
      </section>
    </main>
  );
}
