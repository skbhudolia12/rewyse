import Link from 'next/link';
import { Check, Play } from 'lucide-react';
import { formatINR } from '@/lib/utils';
import { deliveryEta, formatEta } from '@/lib/delivery';
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
      className="text-paper-faint size-16"
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

export function ListingCard({
  listing,
  viewerCampusAbbr,
  now = new Date(),
}: {
  listing: FeedListing;
  viewerCampusAbbr?: string;
  now?: Date;
}) {
  const sameCampus = viewerCampusAbbr === listing.campusAbbr;
  const showFairMax =
    listing.suggestedMax !== null && listing.suggestedMax > listing.askingPrice;

  return (
    <Link
      href={`/listing/${listing.id}`}
      className="group focus-visible:ring-flame block rounded-xl focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="bg-ink-elevated relative flex aspect-square items-center justify-center overflow-hidden rounded-xl">
        {listing.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={listing.imageUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <Placeholder category={listing.category} />
        )}

        <div className="absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
          {listing.isBoosted ? (
            <span className="bg-ink/80 text-paper-dim rounded-md px-2 py-1 text-[11px] font-medium backdrop-blur">
              Sponsored
            </span>
          ) : (
            <span />
          )}
          {listing.hasVideo && (
            <span className="bg-ink/80 text-paper flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium backdrop-blur">
              <Play className="size-3 fill-current" />
              Video
            </span>
          )}
        </div>

        {listing.isClearance && (
          <span className="bg-flame text-ink absolute bottom-2.5 left-2.5 rounded-md px-2 py-1 text-[11px] font-semibold">
            {listing.daysLeft === 0
              ? 'Seller leaves today'
              : listing.daysLeft === 1
                ? 'Seller leaves tomorrow'
                : `Seller leaves in ${listing.daysLeft} days`}
          </span>
        )}
      </div>

      <div className="px-0.5 pt-3">
        <p className="group-hover:text-flame-bright line-clamp-2 min-h-[2.5rem] text-sm leading-5 font-medium transition">
          {listing.title}
        </p>

        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-xl font-semibold tracking-tight">
            {formatINR(listing.askingPrice)}
          </span>
          {showFairMax && (
            <span className="text-paper-faint text-xs">
              Fair <s>{formatINR(listing.suggestedMax!)}</s>
            </span>
          )}
        </div>

        <p className="text-paper-dim mt-1 text-xs">
          {listing.condition} · {listing.campusAbbr}
        </p>

        <p className="text-paper-dim mt-1 text-xs">
          Get it by{' '}
          <span className="text-paper font-medium">{formatEta(deliveryEta(now, sameCampus))}</span>
        </p>

        {listing.isFairPrice && (
          <p className="text-verify mt-1.5 flex items-center gap-1 text-xs font-medium">
            <Check className="size-3.5" />
            Fair price
          </p>
        )}
      </div>
    </Link>
  );
}
