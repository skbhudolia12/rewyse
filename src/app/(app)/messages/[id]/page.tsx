import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireVerified } from '@/lib/auth/session';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import {
  MEETUPS_SELECT,
  MESSAGES_SELECT,
  OFFERS_SELECT,
  THREAD_DETAIL_SELECT,
  buildTimeline,
} from '@/lib/messaging/queries';
import { formatINR } from '@/lib/utils';
import { DaysLeft } from '@/components/ui';
import { daysUntilMoveout } from '@/lib/pricing/rails';
import { ThreadView } from './thread-view';

export const dynamic = 'force-dynamic';

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireVerified();
  const supabase = await createClient();

  const { data: conv } = await supabase
    .from('conversations')
    .select(THREAD_DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle();

  // RLS hides threads you are not a party to, so a miss is indistinguishable
  // from "does not exist" -- which is the answer we want to give.
  if (!conv) notFound();

  const thread = conv as unknown as {
    id: string;
    status: string;
    buyer_id: string;
    seller_id: string;
    listing: {
      id: string;
      title: string;
      asking_price: number;
      status: string;
      moveout_date: string;
      campus_id: string;
      suggested_sell_fast_price: number | null;
    } | null;
    buyer: { id: string; full_name: string; campus_id: string } | null;
    seller: { id: string; full_name: string; campus_id: string } | null;
  };

  const [messages, offers, meetups] = await Promise.all([
    supabase.from('messages').select(MESSAGES_SELECT).eq('conversation_id', id).order('created_at'),
    supabase.from('offers').select(OFFERS_SELECT).eq('conversation_id', id).order('created_at'),
    supabase.from('meetup_proposals').select(MEETUPS_SELECT).eq('conversation_id', id).order('created_at'),
  ]);

  // Mark the other party's messages read. Uses the caller's own session, so the
  // read-receipt grant is exercised rather than bypassed.
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', id)
    .neq('sender_id', me.id)
    .is('read_at', null);

  const isBuyer = thread.buyer_id === me.id;
  const other = isBuyer ? thread.seller : thread.buyer;

  // Meetup points from either party's campus: cross-campus deals are normal,
  // meeting at a third campus nobody attends is not.
  const campusIds = [thread.buyer?.campus_id, thread.seller?.campus_id].filter(
    (c): c is string => Boolean(c),
  );
  const admin = createAdminClient();
  const { data: points } = await admin
    .from('safe_meetup_points')
    .select('id, name, campuses(abbreviation)')
    .in('campus_id', campusIds)
    .eq('active', true)
    .order('name');

  const meetupPoints = (points ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    campus: (p.campuses as unknown as { abbreviation: string } | null)?.abbreviation ?? '',
  }));

  const acceptedOffer = (offers.data ?? []).find((o) => o.status === 'accepted');
  const days = thread.listing ? daysUntilMoveout(thread.listing.moveout_date, new Date()) : 0;

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-6">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/messages" className="text-paper-dim hover:text-paper">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{other?.full_name ?? 'Unknown'}</p>
          <p className="text-paper-dim text-[12px]">{isBuyer ? 'Seller' : 'Buyer'}</p>
        </div>
      </div>

      {thread.listing && (
        <Link href={`/listing/${thread.listing.id}`} className="block">
          <div className="border-hairline bg-surface hover:border-flame-edge mb-4 flex items-center justify-between gap-4 rounded-xl border px-4 py-3 transition">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{thread.listing.title}</p>
              <div className="mt-1.5">
                <DaysLeft days={days} size="sm" />
              </div>
            </div>
            <span className="font-display shrink-0 text-xl">
              {formatINR(thread.listing.asking_price)}
            </span>
          </div>
        </Link>
      )}

      <ThreadView
        conversationId={thread.id}
        meId={me.id}
        otherName={other?.full_name?.split(' ')[0] ?? 'them'}
        isBuyer={isBuyer}
        listing={{
          id: thread.listing?.id ?? '',
          title: thread.listing?.title ?? '',
          askingPrice: thread.listing?.asking_price ?? 0,
          sellFastPrice: thread.listing?.suggested_sell_fast_price ?? null,
          status: thread.listing?.status ?? 'active',
        }}
        meetupPoints={meetupPoints}
        timeline={buildTimeline(
          (messages.data ?? []) as never,
          (offers.data ?? []) as never,
          (meetups.data ?? []) as never,
        )}
        acceptedOfferId={acceptedOffer?.id ?? null}
        acceptedAmount={acceptedOffer?.amount ?? null}
        status={thread.status}
      />
    </main>
  );
}
