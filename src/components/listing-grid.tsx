import { ListingCard } from '@/components/listing-card';
import type { FeedListing } from '@/lib/listings/queries';

export function ListingGrid({
  listings,
  viewer,
  now,
}: {
  listings: FeedListing[];
  viewer: string;
  now: Date;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {listings.map((l) => (
        <ListingCard key={l.id} listing={l} viewerCampusAbbr={viewer} now={now} />
      ))}
    </div>
  );
}
