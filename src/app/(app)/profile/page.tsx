import Link from 'next/link';
import { CheckCircle2, Clock, Plus, Tag } from 'lucide-react';
import { Badge, Button, Card, DaysLeft } from '@/components/ui';
import { requireVerified } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatINR } from '@/lib/utils';
import { daysUntilMoveout } from '@/lib/pricing/rails';
import { RepriceButton } from './reprice-button';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const me = await requireVerified();
  const supabase = await createClient();

  const showOffers = tab === 'offers';

  const [listingsRes, offersRes, conversationsRes] = await Promise.all([
    supabase
      .from('listings')
      .select('id, title, asking_price, status, moveout_date, suggested_sell_fast_price')
      .eq('seller_id', me.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('offers')
      .select('id, amount, status, listing_id, conversation_id, created_at, listing:listings(title)')
      .eq('buyer_id', me.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('conversations')
      .select('id, status, buyer_id, seller_id, updated_at')
      .or(`buyer_id.eq.${me.id},seller_id.eq.${me.id}`),
  ]);

  const listings = listingsRes.data ?? [];
  const offers = (offersRes.data ?? []) as unknown as Array<{
    id: string;
    amount: number;
    status: string;
    listing_id: string;
    conversation_id: string;
    listing: { title: string } | null;
  }>;

  const active = listings.filter((l) => l.status === 'active');
  const sold = listings.filter((l) => l.status === 'completed');
  const conversations = conversationsRes.data ?? [];

  // Response time needs message timestamps we do not aggregate yet; showing a
  // fabricated "15m" would be worse than showing nothing.
  const stats = [
    { label: 'Items listed', value: String(listings.length) },
    { label: 'Sold', value: String(sold.length) },
    { label: 'Campus trust', value: `${me.trust_score}%` },
  ];

  const myMoveout = daysUntilMoveout(me.moveout_date, new Date());

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-5 py-8">
      <Card className="space-y-5">
        <div className="flex items-start gap-4">
          <div className="bg-paper text-ink flex size-14 shrink-0 items-center justify-center rounded-full text-xl font-bold">
            {me.full_name[0]}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-semibold">{me.full_name}</h1>
              <CheckCircle2 className="text-verify size-4 shrink-0" />
            </div>
            <p className="text-paper-dim mt-1 truncate text-[13px]">
              {me.campus?.name}
              {me.hostel_or_hall ? ` · ${me.hostel_or_hall}` : ''}
            </p>
          </div>
        </div>

        <div className="border-hairline flex items-center justify-between border-t pt-4">
          <div className="flex items-center gap-2">
            <Clock className="text-paper-dim size-4" />
            <span className="text-paper-dim text-[13px]">You move out in</span>
          </div>
          <DaysLeft days={myMoveout} />
        </div>

        <dl className="grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="border-hairline bg-surface rounded-xl border p-3.5">
              <dt className="text-paper-dim text-[11px] leading-tight">{s.label}</dt>
              <dd className="font-display mt-1.5 text-2xl">{s.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-paper-faint text-[11px] leading-relaxed">
          Campus trust starts at 100 and moves with completed deals, cancelled meetups, and
          reports an admin has actioned. It is a simple count, not a rating.
        </p>
      </Card>

      <div className="flex gap-2">
        <TabLink href="/profile" label="My listings" count={active.length} active={!showOffers} />
        <TabLink href="/profile?tab=offers" label="My offers" count={offers.length} active={showOffers} />
      </div>

      {showOffers ? (
        offers.length === 0 ? (
          <Empty
            title="No offers yet"
            body="When you offer on something, it shows up here so you can track it."
          />
        ) : (
          <div className="space-y-3">
            {offers.map((o) => (
              <Link key={o.id} href={`/messages/${o.conversation_id}`} className="block">
                <Card className="hover:border-flame-edge flex items-center justify-between gap-4 transition">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{o.listing?.title ?? 'Listing'}</p>
                    <p className="text-paper-dim mt-1 text-[12px] capitalize">{o.status}</p>
                  </div>
                  <span className="font-display shrink-0 text-xl">{formatINR(o.amount)}</span>
                </Card>
              </Link>
            ))}
          </div>
        )
      ) : listings.length === 0 ? (
        <Empty
          title="Nothing listed yet"
          body="Your move-out date is already set, so listing something takes about a minute."
          cta
        />
      ) : (
        <div className="space-y-4">
          {listings.map((l) => {
            const days = daysUntilMoveout(l.moveout_date, new Date());
            const canReprice =
              l.status === 'active' &&
              l.suggested_sell_fast_price !== null &&
              l.asking_price > l.suggested_sell_fast_price;

            return (
              <Card key={l.id} className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <Link href={`/listing/${l.id}`} className="min-w-0 flex-1">
                    <p className="truncate font-medium">{l.title}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {l.status === 'active' ? (
                        <DaysLeft days={days} size="sm" />
                      ) : (
                        <Badge tone="neutral">{l.status.replace('_', ' ')}</Badge>
                      )}
                    </div>
                  </Link>
                  <span className="font-display shrink-0 text-2xl">{formatINR(l.asking_price)}</span>
                </div>

                {canReprice && <RepriceButton listingId={l.id} />}

                {l.status === 'active' && (
                  <div className="flex gap-2">
                    <Link href={`/listing/${l.id}/edit`} className="flex-1">
                      <Button variant="ghost" className="w-full">
                        Edit
                      </Button>
                    </Link>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-paper-faint text-center text-[12px]">
        {conversations.length} {conversations.length === 1 ? 'conversation' : 'conversations'}
      </p>
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
      className={`flex-1 rounded-xl border px-4 py-3 text-center text-sm transition ${
        active
          ? 'bg-paper text-ink border-paper font-semibold'
          : 'border-hairline-strong text-paper-dim hover:border-paper hover:text-paper'
      }`}
    >
      {label}
      {count > 0 && <span className="ml-2 opacity-60">{count}</span>}
    </Link>
  );
}

function Empty({ title, body, cta }: { title: string; body: string; cta?: boolean }) {
  return (
    <Card className="py-12 text-center">
      <Tag className="text-paper-faint mx-auto size-7" />
      <p className="font-display mt-4 text-xl">{title}</p>
      <p className="text-paper-dim mx-auto mt-2 max-w-xs text-sm leading-relaxed">{body}</p>
      {cta && (
        <Link
          href="/listing/new"
          className="bg-flame text-ink hover:bg-flame-bright mt-6 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition"
        >
          <Plus className="size-4" />
          List something
        </Link>
      )}
    </Card>
  );
}
