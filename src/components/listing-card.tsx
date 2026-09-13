import Link from 'next/link';
import { CheckCircle2, PlayCircle } from 'lucide-react';
import { Badge } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import type { FeedListing } from '@/lib/listings/queries';

/**
 * Item art placeholder.
 *
 * A listing should always have a real photo -- the create flow requires a live
 * camera capture -- but a signed URL can fail to mint, and a broken image icon
 * in a grid looks like the site is broken. Line art degrades honestly.
 */
function Placeholder({ category }: { category: string }) {
  const paths: Record<string, string> = {
    electronics: 'M8 12h64v42H8zM32 54v8h16v-8M28 62h24',
    furniture: 'M6 26h68M12 26v34M68 26v34M12 40h56',
    books: 'M14 18h20v46H14zM36 22h18v42H36zM56 26l12 3-9 38-12-3z',
    appliances: 'M22 8h36v58H22zM22 30h36M50 18v8',
    other: 'M16 24h48v36H16zM16 24l24 18 24-18',
  };
  return (
    <svg
      viewBox="0 0 80 76"
      className="text-flame/70 size-20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={paths[category] ?? paths.other!} />
    </svg>
  );
}

export function ListingCard({ listing }: { listing: FeedListing }) {
  return (
    <Link
      href={`/listing/${listing.id}`}
      className={`group block overflow-hidden rounded-2xl border transition duration-300 hover:-translate-y-1.5 ${
        listing.isClearance
          ? 'border-flame-edge bg-gradient-to-br from-[rgba(255,90,31,0.1)] to-transparent hover:border-flame'
          : 'border-hairline bg-surface hover:border-flame-edge'
      }`}
    >
      <div className="border-hairline relative flex aspect-[4/3] items-center justify-center overflow-hidden border-b">
        {listing.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={listing.imageUrl}
            alt={listing.title}
            className="size-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <Placeholder category={listing.category} />
        )}

        {listing.isClearance && (
          <span className="bg-flame text-ink absolute top-3 left-3 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.04em]">
            {listing.daysLeft === 0 ? 'TODAY' : `${listing.daysLeft} DAYS`}
          </span>
        )}

        <div className="absolute top-3 right-3 flex gap-1.5">
          {listing.hasVideo && (
            <span className="bg-ink/75 text-paper flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold">
              <PlayCircle className="size-3" />
              Video
            </span>
          )}
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`font-display text-2xl ${listing.isClearance ? 'text-flame' : ''}`}>
            {formatINR(listing.askingPrice)}
          </span>
          <span className="border-hairline text-paper-dim shrink-0 rounded-full border px-2 py-0.5 text-[10px]">
            {listing.condition}
          </span>
        </div>

        <p className="mt-2 truncate text-sm font-medium">{listing.title}</p>

        <div className="text-paper-dim mt-3 flex items-center gap-1.5 text-[11px]">
          <CheckCircle2 className="text-flame size-3 shrink-0" />
          <span>{listing.campusAbbr}</span>
          <span className="text-paper-faint">·</span>
          <span className="truncate">
            {listing.daysLeft === 0 ? 'moving out today' : `${listing.daysLeft} days left`}
          </span>
        </div>

        {listing.isFairPrice && (
          <div className="mt-3">
            <Badge tone="verify" className="text-[10px]">
              Fair price
            </Badge>
          </div>
        )}
      </div>
    </Link>
  );
}
