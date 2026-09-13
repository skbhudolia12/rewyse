import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2, MapPin, ShieldCheck } from 'lucide-react';
import { Alert, Badge, Button, Card, DaysLeft } from '@/components/ui';
import { BuyButton } from './buy-button';
import { requireVerified } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatINR } from '@/lib/utils';
import { daysUntilMoveout } from '@/lib/pricing/rails';
import { CLEARANCE_WINDOW_DAYS } from '@/lib/pricing/constants';
import type { FunctionalStatus } from '@/types/domain';

/** Media URLs must not outlive a browsing session. */
const SIGNED_URL_TTL_SECONDS = 3600;

export const dynamic = 'force-dynamic';

const CONDITION_LABELS: Record<FunctionalStatus, string> = {
  fully_working: 'Fully working',
  partially_working: 'Partly working',
  for_parts: 'For parts',
};

export default async function ListingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ published?: string }>;
}) {
  const { id } = await params;
  const { published } = await searchParams;
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

  const images = await Promise.all(
    (media ?? []).map(async (m) => {
      const { data } = await supabase.storage
        .from('listing-media')
        .createSignedUrl(m.storage_path, SIGNED_URL_TTL_SECONDS);
      return { ...m, url: data?.signedUrl ?? null };
    }),
  );

  const { data: meetupPoints } = await supabase
    .from('safe_meetup_points')
    .select('name')
    .eq('campus_id', listing.campus_id)
    .eq('active', true)
    .limit(1);

  // Shown on the buy button so a buyer who negotiated sees their price, not
  // the sticker price.
  const { data: acceptedOffer } = await supabase
    .from('offers')
    .select('amount')
    .eq('listing_id', id)
    .eq('buyer_id', viewer.id)
    .eq('status', 'accepted')
    .maybeSingle();

  const days = daysUntilMoveout(listing.moveout_date, new Date());
  const isOwn = listing.seller_id === viewer.id;
  const hasVideo = images.some((m) => m.kind === 'video');
  const withinFair =
    listing.suggested_price_min !== null &&
    listing.suggested_price_max !== null &&
    listing.asking_price >= listing.suggested_price_min &&
    listing.asking_price <= listing.suggested_price_max;

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-16 md:px-10">
      {published && (
        <div className="pt-6">
          <Alert tone="success" title="Your listing is live">
            It&rsquo;s now visible to verified students across your cluster.
          </Alert>
        </div>
      )}

      {/* Highest visual priority on the page: the deadline is the product. */}
      {days <= CLEARANCE_WINDOW_DAYS && (
        <div className="bg-flame text-ink -mx-5 mt-6 flex flex-wrap items-center justify-between gap-3 px-5 py-4 md:-mx-10 md:px-10">
          <p className="font-display text-lg">
            Seller moves out on{' '}
            {new Date(listing.moveout_date).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'long',
            })}{' '}
            — {days === 0 ? 'today' : days === 1 ? '1 day left' : `${days} days left`}
          </p>
          <p className="text-sm font-semibold">Price drops as the date gets closer</p>
        </div>
      )}

      <div className="grid gap-10 pt-10 lg:grid-cols-[1fr_minmax(0,24rem)]">
        <div className="space-y-8">
          <div className="border-hairline bg-surface relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl border">
            {images[0]?.url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={images[0].url} alt={listing.title} className="size-full object-contain" />
            ) : (
              <p className="text-paper-faint text-sm">No photo</p>
            )}
            <div className="absolute top-4 left-4 flex flex-wrap gap-2">
              {hasVideo && <Badge tone="flame">Video verified</Badge>}
              {images.some((m) => m.is_live_capture) && (
                <Badge tone="neutral">Photographed in app</Badge>
              )}
            </div>
          </div>

          {images.length > 1 && (
            <div className="grid grid-cols-5 gap-3">
              {images.slice(1).map((m) => (
                <div
                  key={m.id}
                  className="border-hairline aspect-square overflow-hidden rounded-xl border"
                >
                  {m.url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={m.url} alt="" className="size-full object-cover" />
                  )}
                </div>
              ))}
            </div>
          )}

          <section>
            <h2 className="font-display text-2xl">Condition</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <ConditionTile
                label="Works"
                value={CONDITION_LABELS[listing.functional_status as FunctionalStatus]}
              />
              <ConditionTile label="Cosmetic" value={listing.cosmetic_flaws ?? 'Not specified'} />
              <ConditionTile label="Included" value={listing.accessories_included ?? 'Nothing extra'} />
            </div>
            {listing.description && (
              <p className="text-paper-dim mt-6 max-w-prose leading-relaxed">
                {listing.description}
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:h-fit">
          <Card className="space-y-5">
            <div>
              <p className="text-paper-dim text-xs font-semibold tracking-[0.13em] uppercase">
                {listing.category}
              </p>
              <h1 className="font-display mt-3 text-3xl">{listing.title}</h1>
            </div>

            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-display text-flame text-5xl">
                {formatINR(listing.asking_price)}
              </span>
              {listing.suggested_price_min !== null &&
                listing.asking_price < listing.suggested_price_min && (
                  <span className="text-paper-faint text-base line-through">
                    {formatINR(listing.suggested_price_min)}
                  </span>
                )}
            </div>

            <div className="flex flex-wrap gap-2">
              <DaysLeft days={days} />
              {withinFair && <Badge tone="verify">Fair price</Badge>}
            </div>

            {isOwn ? (
              <div className="space-y-2.5">
                <Link href={`/listing/${listing.id}/edit`} className="block">
                  <Button variant="secondary" size="lg" className="w-full">
                    Edit listing
                  </Button>
                </Link>
                <p className="text-paper-faint text-center text-xs">This is your listing.</p>
              </div>
            ) : (
              <BuyButton
                listingId={listing.id}
                sellerFirstName={listing.seller?.full_name?.split(' ')[0] ?? 'seller'}
                acceptedAmount={acceptedOffer?.amount ?? null}
              />
            )}
          </Card>

          <Card className="flex items-center gap-4">
            <div className="bg-paper text-ink flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-bold">
              {listing.seller?.full_name?.[0] ?? '?'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold">{listing.seller?.full_name}</span>
                {listing.seller?.verified_status === 'verified' && (
                  <CheckCircle2 className="text-verify size-4 shrink-0" />
                )}
              </div>
              <p className="text-paper-dim truncate text-[13px]">
                {listing.campus?.name}
                {listing.seller?.hostel_or_hall ? ` · ${listing.seller.hostel_or_hall}` : ''}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-display text-xl">{listing.seller?.trust_score ?? 100}%</p>
              <p className="text-paper-dim text-[11px]">trust</p>
            </div>
          </Card>

          <Card>
            <div className="text-paper-dim flex items-center gap-2.5 text-xs font-semibold tracking-[0.13em] uppercase">
              <MapPin className="text-flame size-4" />
              Safe meetup zone
            </div>
            <p className="mt-3 font-semibold">
              {listing.campus?.name} — {meetupPoints?.[0]?.name ?? 'To be agreed in chat'}
            </p>
            <p className="text-paper-dim mt-2 text-[13px] leading-relaxed">
              Pre-approved by ReWyse. Daylight hours, staffed and busy. You pick the exact time
              when you arrange the handover.
            </p>
          </Card>

          <div className="text-paper-dim flex items-center justify-center gap-2 text-xs">
            <ShieldCheck className="size-3.5" />
            Verified students only
          </div>
        </aside>
      </div>
    </main>
  );
}

function ConditionTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-hairline bg-surface rounded-xl border p-4">
      <p className="text-paper-dim text-[11px] font-semibold tracking-[0.13em] uppercase">
        {label}
      </p>
      <p className="mt-2 font-semibold">{value}</p>
    </div>
  );
}
