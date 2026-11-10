import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Camera, Check, ChevronRight, PackageCheck, Play, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { Alert, Button } from '@/components/ui';
import { BoostButton } from '@/components/boost-button';
import { BuyButton } from './buy-button';
import { Gallery, type GalleryItem } from './gallery';
import { requireVerified } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatINR } from '@/lib/utils';
import { daysUntilMoveout } from '@/lib/pricing/rails';
import { CLEARANCE_WINDOW_DAYS } from '@/lib/pricing/constants';
import { CATEGORY_LABELS } from '@/lib/listings/categories';
import { orderTotals } from '@/lib/fees';
import { deliveryEta, formatEta } from '@/lib/delivery';
import type { FunctionalStatus, ListingCategory } from '@/types/domain';

/** Media URLs must not outlive a browsing session. */
const SIGNED_URL_TTL_SECONDS = 3600;

export const dynamic = 'force-dynamic';

const CONDITION_LABELS: Record<FunctionalStatus, string> = {
  fully_working: 'Fully working',
  partially_working: 'Partly working',
  for_parts: 'For parts',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
}

export default async function ListingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ published?: string; error?: string }>;
}) {
  const { id } = await params;
  const { published, error } = await searchParams;
  const viewer = await requireVerified();
  const supabase = await createClient();

  const { data: listing } = await supabase
    .from('listings')
    .select(
      `*,
       seller:profiles!listings_seller_id_fkey(id, full_name, hostel_or_hall, trust_score, verified_status),
       campus:campuses(id, name, abbreviation)`,
    )
    .eq('id', id)
    .maybeSingle();

  // RLS already hides listings outside the viewer's cluster, so a miss here is
  // indistinguishable from "does not exist" -- which is the intended answer.
  if (!listing) notFound();

  const { data: media } = await supabase
    .from('listing_media')
    .select('id, storage_path, kind, is_live_capture')
    .eq('listing_id', id)
    .order('position');

  const items: GalleryItem[] = await Promise.all(
    (media ?? []).map(async (m) => {
      const { data } = await supabase.storage
        .from('listing-media')
        .createSignedUrl(m.storage_path, SIGNED_URL_TTL_SECONDS);
      return { id: m.id, kind: m.kind, url: data?.signedUrl ?? null };
    }),
  );

  const { data: boosts } = await supabase
    .from('boosts')
    .select('ends_at')
    .eq('listing_id', id)
    .gt('ends_at', new Date().toISOString())
    .order('ends_at', { ascending: false })
    .limit(1);

  // A buyer who negotiated sees their price, not the sticker price.
  const { data: acceptedOffer } = await supabase
    .from('offers')
    .select('amount')
    .eq('listing_id', id)
    .eq('buyer_id', viewer.id)
    .eq('status', 'accepted')
    .maybeSingle();

  const now = new Date();
  const days = daysUntilMoveout(listing.moveout_date, now);
  const isOwn = listing.seller_id === viewer.id;
  const hasVideo = (media ?? []).some((m) => m.kind === 'video');
  const liveCapture = (media ?? []).some((m) => m.is_live_capture);
  const sameCampus = viewer.campus_id === listing.campus_id;
  const price: number = acceptedOffer?.amount ?? listing.asking_price;
  const totals = orderTotals({
    itemAmount: Math.max(1, price),
    sameCampus,
    category: listing.category as ListingCategory,
  });
  const fairMin: number | null = listing.suggested_price_min;
  const fairMax: number | null = listing.suggested_price_max;
  const withinFair = fairMin !== null && fairMax !== null && price >= fairMin && price <= fairMax;
  const reasoning: string[] = Array.isArray(listing.price_reasoning) ? listing.price_reasoning : [];
  const sellerFirst = listing.seller?.full_name?.split(' ')[0] ?? 'the seller';
  const available = listing.status === 'active';

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5 md:px-8 md:py-6">
      <nav aria-label="Breadcrumb" className="text-paper-dim mb-5 flex items-center gap-1 text-[13px]">
        <Link href="/home" className="hover:text-paper">
          Home
        </Link>
        <ChevronRight className="size-3.5" />
        <Link href={`/search?category=${listing.category}`} className="hover:text-paper">
          {CATEGORY_LABELS[listing.category as ListingCategory]}
        </Link>
      </nav>

      {published && (
        <div className="mb-5">
          <Alert tone="success" title="Your listing is live">
            Verified students across IIITD, IITD and DTU can see and buy it now.
          </Alert>
        </div>
      )}
      {error === 'already_reserved' && (
        <div className="mb-5">
          <Alert tone="error">Someone else is already checking out this item.</Alert>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_20rem] lg:gap-8">
        <div className="lg:sticky lg:top-32 lg:h-fit">
          <Gallery items={items} title={listing.title} />
        </div>

        <div className="space-y-6">
          <div>
            <h1 className="text-2xl leading-tight font-semibold tracking-tight md:text-[28px]">
              {listing.title}
            </h1>
            <Link
              href={`/profile/${listing.seller_id}`}
              className="text-paper-dim hover:text-paper mt-2 inline-block text-sm"
            >
              Sold by {listing.seller?.full_name} · {listing.campus?.name}
            </Link>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
              {hasVideo && (
                <li className="text-paper flex items-center gap-1.5">
                  <Play className="size-3.5 fill-current" /> Video verified
                </li>
              )}
              {liveCapture && (
                <li className="text-paper-dim flex items-center gap-1.5">
                  <Camera className="size-3.5" /> Photographed in the app
                </li>
              )}
              {withinFair && (
                <li className="text-verify flex items-center gap-1.5">
                  <Check className="size-3.5" /> Fair price
                </li>
              )}
            </ul>
          </div>

          <div className="border-hairline border-t pt-5">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-[32px] font-semibold tracking-tight">{formatINR(price)}</span>
              {fairMax !== null && fairMax > price && (
                <span className="text-paper-faint text-sm">
                  Fair price <s>{formatINR(fairMax)}</s>
                </span>
              )}
            </div>
            {acceptedOffer && (
              <p className="text-verify mt-1 text-sm">{sellerFirst} accepted your offer.</p>
            )}
          </div>

          {days <= CLEARANCE_WINDOW_DAYS && (
            <div className="border-flame-edge bg-flame-soft rounded-lg border px-4 py-3">
              <p className="text-flame-bright text-sm font-semibold">
                {sellerFirst} moves out on {formatDate(listing.moveout_date)},{' '}
                {days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}
              </p>
              <p className="text-paper-dim mt-0.5 text-[13px]">
                The price is set to sell before then.
              </p>
            </div>
          )}

          <section aria-labelledby="condition-heading">
            <h2 id="condition-heading" className="font-semibold">
              Condition
            </h2>
            <dl className="border-hairline mt-3 divide-y divide-[var(--color-hairline)] rounded-lg border text-sm">
              <SpecRow label="Works" value={CONDITION_LABELS[listing.functional_status as FunctionalStatus]} />
              <SpecRow label="Visible wear" value={listing.cosmetic_flaws ?? 'None mentioned'} />
              <SpecRow label="Included" value={listing.accessories_included ?? 'Item only'} />
              <SpecRow label="Campus" value={listing.campus?.name ?? '—'} />
            </dl>
          </section>

          {listing.description && (
            <section aria-labelledby="about-heading">
              <h2 id="about-heading" className="font-semibold">
                About this item
              </h2>
              <p className="text-paper-dim mt-2 text-[15px] leading-relaxed whitespace-pre-line">
                {listing.description}
              </p>
            </section>
          )}

          {reasoning.length > 0 && (
            <section
              aria-labelledby="price-heading"
              className="border-hairline bg-ink-raised rounded-lg border p-4"
            >
              <h2 id="price-heading" className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="text-flame-bright size-4" />
                How this price was set
              </h2>
              <ul className="mt-2.5 space-y-1.5">
                {reasoning.map((point) => (
                  <li key={point} className="text-paper-dim flex gap-2.5 text-[13px] leading-relaxed">
                    <span className="bg-paper-faint mt-2 size-1 shrink-0 rounded-full" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
              {fairMin !== null && fairMax !== null && (
                <p className="text-paper-faint mt-3 text-xs">
                  Fair range for this item: {formatINR(fairMin)} – {formatINR(fairMax)}
                </p>
              )}
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-32 lg:h-fit">
          <div className="border-hairline-strong bg-ink-raised space-y-4 rounded-xl border p-5">
            {isOwn ? (
              <>
                <p className="font-semibold">This is your listing</p>
                <p className="text-paper-dim text-sm">
                  {available ? 'Live on the feed.' : 'Not on the feed right now.'}
                </p>
                {available && (
                  <BoostButton
                    listingId={listing.id}
                    boostedUntil={boosts?.[0]?.ends_at ?? null}
                    payer={{ name: viewer.full_name, email: viewer.email }}
                  />
                )}
                <Link href={`/listing/${listing.id}/edit`} className="block">
                  <Button variant="ghost" className="w-full">
                    Edit listing
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <p className="text-2xl font-semibold tracking-tight">{formatINR(price)}</p>
                <div className="text-paper-dim space-y-1 text-sm">
                  <p className="flex items-center gap-2">
                    <Truck className="size-4 shrink-0" />
                    <span>
                      Delivery {formatINR(totals.deliveryFee)} · get it by{' '}
                      <span className="text-paper font-medium">
                        {formatEta(deliveryEta(now, sameCampus))}
                      </span>
                    </span>
                  </p>
                  <p className="pl-6 text-[13px]">
                    + {formatINR(totals.convenienceFee)} convenience fee
                  </p>
                </div>

                {available ? (
                  <>
                    <p className="text-verify text-sm font-medium">In stock, one available</p>
                    <BuyButton
                      listingId={listing.id}
                      sellerFirstName={sellerFirst}
                      hasAcceptedOffer={Boolean(acceptedOffer)}
                    />
                  </>
                ) : (
                  <p className="text-flame-amber text-sm font-medium">
                    Sold or reserved by another buyer
                  </p>
                )}

                <div className="border-hairline space-y-3 border-t pt-4 text-[13px]">
                  <p className="flex gap-2.5">
                    <ShieldCheck className="text-verify size-4 shrink-0" />
                    <span className="text-paper-dim">
                      <span className="text-paper font-medium">Dobara Escrow.</span> Your payment
                      is held until you confirm the item arrived as described.
                    </span>
                  </p>
                  <p className="flex gap-2.5">
                    <PackageCheck className="text-paper-dim size-4 shrink-0" />
                    <span className="text-paper-dim">
                      Picked up from {sellerFirst}&rsquo;s hostel and delivered to yours.
                    </span>
                  </p>
                </div>
              </>
            )}
          </div>

          <Link
            href={`/profile/${listing.seller_id}`}
            className="border-hairline hover:border-hairline-strong mt-4 flex items-center gap-3 rounded-xl border p-4 transition"
          >
            <span className="bg-ink-elevated flex size-10 shrink-0 items-center justify-center rounded-full font-semibold">
              {listing.seller?.full_name?.[0] ?? '?'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <span className="truncate">{listing.seller?.full_name}</span>
                {listing.seller?.verified_status === 'verified' && (
                  <Check className="text-verify size-4 shrink-0" aria-label="Verified student" />
                )}
              </span>
              <span className="text-paper-dim block truncate text-xs">
                Verified student, {listing.campus?.abbreviation}
              </span>
            </span>
            <span className="text-right">
              <span className="block text-sm font-semibold">{listing.seller?.trust_score ?? 100}</span>
              <span className="text-paper-faint block text-[11px]">trust score</span>
            </span>
          </Link>
        </aside>
      </div>
    </main>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 px-4 py-2.5">
      <dt className="text-paper-dim">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
