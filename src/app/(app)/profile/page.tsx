import Link from 'next/link';
import { Check, Plus } from 'lucide-react';
import { Button, Card, DaysLeft } from '@/components/ui';
import { BoostButton } from '@/components/boost-button';
import { requireVerified } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { cn, formatINR } from '@/lib/utils';
import { daysUntilMoveout } from '@/lib/pricing/rails';
import { RepriceButton } from './reprice-button';

export const dynamic = 'force-dynamic';

const SIGNED_URL_TTL_SECONDS = 3600;

const STATUS_LABELS: Record<string, string> = {
  active: 'Live',
  pending_pickup: 'Sold, awaiting delivery',
  completed: 'Sold',
  removed: 'Removed',
};

const OFFER_LABELS: Record<string, string> = {
  pending: 'Waiting for the seller',
  accepted: 'Accepted',
  rejected: 'Declined',
  countered: 'Countered',
  expired: 'Expired',
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const me = await requireVerified();
  const supabase = await createClient();
  const now = new Date();

  const showOffers = tab === 'offers';

  const [listingsRes, offersRes, payoutsRes] = await Promise.all([
    supabase
      .from('listings')
      .select(
        'id, title, asking_price, status, moveout_date, suggested_sell_fast_price, listing_media(storage_path, kind, position), boosts(ends_at)',
      )
      .eq('seller_id', me.id)
      .neq('status', 'removed')
      .order('created_at', { ascending: false }),
    supabase
      .from('offers')
      .select('id, amount, status, conversation_id, listing:listings(title)')
      .eq('buyer_id', me.id)
      .order('created_at', { ascending: false }),
    supabase.from('payments').select('item_amount').eq('seller_id', me.id).eq('status', 'released'),
  ]);

  type ListingRow = {
    id: string;
    title: string;
    asking_price: number;
    status: string;
    moveout_date: string;
    suggested_sell_fast_price: number | null;
    listing_media: Array<{ storage_path: string; kind: string; position: number }> | null;
    boosts: Array<{ ends_at: string }> | null;
  };
  const listings = (listingsRes.data ?? []) as unknown as ListingRow[];
  const offers = (offersRes.data ?? []) as unknown as Array<{
    id: string;
    amount: number;
    status: string;
    conversation_id: string;
    listing: { title: string } | null;
  }>;

  const thumbs = new Map<string, string | null>();
  await Promise.all(
    listings.map(async (l) => {
      const cover = (l.listing_media ?? [])
        .filter((m) => m.kind === 'photo')
        .sort((a, b) => a.position - b.position)[0];
      if (!cover) return thumbs.set(l.id, null);
      const { data } = await supabase.storage
        .from('listing-media')
        .createSignedUrl(cover.storage_path, SIGNED_URL_TTL_SECONDS);
      thumbs.set(l.id, data?.signedUrl ?? null);
    }),
  );

  const sold = listings.filter((l) => l.status === 'completed' || l.status === 'pending_pickup');
  const earned = (payoutsRes.data ?? []).reduce((sum, p) => sum + (p.item_amount as number), 0);
  const myMoveout = daysUntilMoveout(me.moveout_date, now);

  const stats = [
    { label: 'Listed', value: String(listings.length) },
    { label: 'Sold', value: String(sold.length) },
    { label: 'Earned', value: formatINR(earned) },
    { label: 'Trust score', value: String(me.trust_score) },
  ];

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-8 md:py-8">
      <section className="border-hairline bg-ink-raised rounded-xl border p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="bg-ink-elevated flex size-14 shrink-0 items-center justify-center rounded-full text-xl font-semibold">
            {me.full_name[0]}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <span className="truncate">{me.full_name}</span>
              <Check className="text-verify size-4 shrink-0" aria-label="Verified student" />
            </h1>
            <p className="text-paper-dim mt-0.5 truncate text-sm">
              {me.campus?.name}
              {me.hostel_or_hall ? `, ${me.hostel_or_hall}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-paper-dim">You move out in</span>
            <DaysLeft days={myMoveout} />
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="border-hairline rounded-lg border px-4 py-3">
              <dt className="text-paper-dim text-xs">{s.label}</dt>
              <dd className="mt-1 text-xl font-semibold tracking-tight">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="border-hairline flex gap-6 border-b" role="tablist">
        <TabLink href="/profile" label="Your listings" count={listings.length} active={!showOffers} />
        <TabLink href="/profile?tab=offers" label="Your offers" count={offers.length} active={showOffers} />
      </div>

      {showOffers ? (
        offers.length === 0 ? (
          <Empty title="No offers yet" body="Offers you make on other students' items show up here." />
        ) : (
          <ul className="border-hairline divide-hairline divide-y overflow-hidden rounded-xl border">
            {offers.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/messages/${o.conversation_id}`}
                  className="bg-ink-raised hover:bg-ink-elevated flex items-center justify-between gap-4 px-5 py-4 transition"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{o.listing?.title ?? 'Listing'}</span>
                    <span
                      className={cn(
                        'block text-[13px]',
                        o.status === 'accepted' ? 'text-verify' : 'text-paper-dim',
                      )}
                    >
                      {OFFER_LABELS[o.status] ?? o.status}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold">{formatINR(o.amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : listings.length === 0 ? (
        <Empty
          title="Nothing listed yet"
          body="Take a photo, add a title, and the price is worked out for you."
          cta
        />
      ) : (
        <ul className="space-y-3">
          {listings.map((l) => {
            const days = daysUntilMoveout(l.moveout_date, now);
            const live = l.status === 'active';
            const boostedUntil =
              (l.boosts ?? [])
                .map((b) => b.ends_at)
                .filter((e) => new Date(e) > now)
                .sort()
                .at(-1) ?? null;
            const canReprice =
              live && l.suggested_sell_fast_price !== null && l.asking_price > l.suggested_sell_fast_price;
            const thumb = thumbs.get(l.id);

            return (
              <li key={l.id} className="border-hairline bg-ink-raised rounded-xl border p-4">
                <div className="flex gap-4">
                  <Link href={`/listing/${l.id}`} className="bg-ink-elevated size-20 shrink-0 overflow-hidden rounded-lg">
                    {thumb && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={thumb} alt="" className="size-full object-cover" />
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/listing/${l.id}`} className="hover:text-flame-bright line-clamp-2 font-medium">
                        {l.title}
                      </Link>
                      <span className="shrink-0 font-semibold">{formatINR(l.asking_price)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
                      <span className={live ? 'text-verify' : 'text-paper-dim'}>{STATUS_LABELS[l.status]}</span>
                      {live && <DaysLeft days={days} size="sm" />}
                      {boostedUntil && <span className="text-paper-dim">· Sponsored</span>}
                    </div>
                  </div>
                </div>

                {live && (
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <BoostButton
                      listingId={l.id}
                      boostedUntil={boostedUntil}
                      payer={{ name: me.full_name, email: me.email }}
                    />
                    {canReprice ? (
                      <RepriceButton listingId={l.id} />
                    ) : (
                      <span className="hidden sm:block" />
                    )}
                    <Link href={`/listing/${l.id}/edit`}>
                      <Button variant="ghost" className="w-full">
                        Edit
                      </Button>
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function TabLink({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={cn(
        '-mb-px border-b-2 pb-3 text-sm transition',
        active ? 'border-paper text-paper font-medium' : 'text-paper-dim hover:text-paper border-transparent',
      )}
    >
      {label}
      {count > 0 && <span className="text-paper-faint ml-1.5">{count}</span>}
    </Link>
  );
}

function Empty({ title, body, cta }: { title: string; body: string; cta?: boolean }) {
  return (
    <Card className="py-12 text-center">
      <p className="text-lg font-semibold">{title}</p>
      <p className="text-paper-dim mx-auto mt-2 max-w-xs text-sm leading-relaxed">{body}</p>
      {cta && (
        <Link
          href="/listing/new"
          className="bg-flame text-ink hover:bg-flame-bright mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg px-5 text-sm font-semibold transition"
        >
          <Plus className="size-4" />
          List an item
        </Link>
      )}
    </Card>
  );
}
