import Link from 'next/link';
import { Search } from 'lucide-react';
import { Card, PageHeader } from '@/components/ui';
import { ListingCard } from '@/components/listing-card';
import { requireVerified } from '@/lib/auth/session';
import { getFeedListings } from '@/lib/listings/queries';
import { LISTING_CATEGORIES, type ListingCategory } from '@/types/domain';

export const dynamic = 'force-dynamic';

const CATEGORY_LABELS: Record<ListingCategory, string> = {
  electronics: 'Electronics',
  furniture: 'Room furniture',
  books: 'Study & books',
  appliances: 'Appliances',
  other: 'Everything else',
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q, category } = await searchParams;
  await requireVerified();

  const active = LISTING_CATEGORIES.includes(category as ListingCategory)
    ? (category as ListingCategory)
    : undefined;
  const query = q?.trim() || undefined;

  const listings = await getFeedListings({ category: active, query });

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-5 py-8 md:px-10">
      <PageHeader title="Explore" subtitle="Everything live across IIITD, IITD and DTU." />

      {/* A GET form: the query lives in the URL, so a search is shareable and
          the back button does what a student expects. */}
      <form action="/search" className="space-y-4">
        <div className="border-hairline-strong focus-within:border-flame flex items-center gap-3 rounded-xl border px-4 transition">
          <Search className="text-paper-dim size-4 shrink-0" />
          <input
            name="q"
            defaultValue={query ?? ''}
            placeholder="Monitors, desks, textbooks…"
            className="text-paper placeholder:text-paper-faint min-h-12 w-full bg-transparent focus:outline-none"
          />
        </div>
        {active && <input type="hidden" name="category" value={active} />}
      </form>

      <div className="flex flex-wrap gap-2">
        <Chip label="Everything" href={query ? `/search?q=${encodeURIComponent(query)}` : '/search'} active={!active} />
        {LISTING_CATEGORIES.map((c) => (
          <Chip
            key={c}
            label={CATEGORY_LABELS[c]}
            href={`/search?category=${c}${query ? `&q=${encodeURIComponent(query)}` : ''}`}
            active={active === c}
          />
        ))}
      </div>

      {listings.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="font-display text-xl">No matches</p>
          <p className="text-paper-dim mt-2 text-sm">
            {query ? `Nothing matching "${query}" on your cluster.` : 'Nothing in this category yet.'}
          </p>
        </Card>
      ) : (
        <>
          <p className="text-paper-dim text-[13px]">
            {listings.length} {listings.length === 1 ? 'result' : 'results'}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function Chip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-4 py-2 text-sm transition ${
        active
          ? 'bg-paper text-ink border-paper font-semibold'
          : 'border-hairline-strong text-paper-dim hover:border-paper hover:text-paper'
      }`}
    >
      {label}
    </Link>
  );
}
