'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CalendarClock, Check, Flag, MapPin, Send, ShieldAlert, Tag, X } from 'lucide-react';
import {
  acceptMeetup,
  makeOffer,
  proposeMeetup,
  respondToOffer,
  sendMessage,
  submitReport,
  type ThreadActionState,
} from '@/lib/messaging/actions';
import type { TimelineEntry } from '@/lib/messaging/queries';
import { Alert, Badge, Button, Card, Input, Select } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { formatINR } from '@/lib/utils';

export interface ThreadProps {
  conversationId: string;
  meId: string;
  otherName: string;
  isBuyer: boolean;
  listing: {
    id: string;
    title: string;
    askingPrice: number;
    sellFastPrice: number | null;
    status: string;
  };
  meetupPoints: Array<{ id: string; name: string; campus: string }>;
  timeline: TimelineEntry[];
  acceptedOfferId: string | null;
  acceptedAmount: number | null;
  status: string;
}

export function ThreadView(props: ThreadProps) {
  const router = useRouter();
  const [panel, setPanel] = useState<'none' | 'offer' | 'meetup' | 'report'>('none');
  const bottom = useRef<HTMLDivElement>(null);

  // Realtime: the thread must update without a refresh, or two students in a
  // corridor are looking at different conversations.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`thread:${props.conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${props.conversationId}` },
        () => router.refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'offers', filter: `conversation_id=eq.${props.conversationId}` },
        () => router.refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meetup_proposals', filter: `conversation_id=eq.${props.conversationId}` },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [props.conversationId, router]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [props.timeline.length]);

  return (
    <div className="flex min-h-[70vh] flex-col">
      {/* Non-dismissible, once per thread. A safety line you can swipe away is
          decoration; this one is the reason meetups are on a pre-approved list. */}
      <div className="border-hairline bg-surface flex items-start gap-3 rounded-xl border px-4 py-3">
        <ShieldAlert className="text-flame mt-0.5 size-4 shrink-0" />
        <p className="text-paper-dim text-[13px] leading-relaxed">
          Keep it on ReWyse. Meet in a designated campus zone during daylight, check the item
          before you confirm, and never share bank details or OTPs.
        </p>
      </div>

      <div className="flex-1 space-y-3 py-6">
        {props.timeline.length === 0 && (
          <p className="text-paper-faint py-10 text-center text-sm">
            Say hello, ask a question, or make an offer.
          </p>
        )}

        {props.timeline.map((entry) => {
          if (entry.kind === 'message') {
            const mine = entry.senderId === props.meId;
            return (
              <div key={entry.id} className={mine ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
                    mine ? 'bg-paper text-ink' : 'border-hairline bg-surface border'
                  }`}
                >
                  {entry.body}
                </div>
              </div>
            );
          }

          if (entry.kind === 'offer') {
            const mine = entry.proposedBy === props.meId;
            return (
              <OfferCard
                key={entry.id}
                entry={entry}
                mine={mine}
                sellFast={props.listing.sellFastPrice}
              />
            );
          }

          return <MeetupCard key={entry.id} entry={entry} mine={entry.proposedBy === props.meId} />;
        })}
        <div ref={bottom} />
      </div>

      {props.acceptedOfferId && props.isBuyer && (
        <Alert tone="success" title={`Offer accepted at ${formatINR(props.acceptedAmount ?? 0)}`}>
          <Link href={`/listing/${props.listing.id}`} className="underline">
            Go to the listing to pay at that price.
          </Link>
        </Alert>
      )}

      <div className="border-hairline bg-ink sticky bottom-0 space-y-3 border-t pt-4 pb-2">
        {panel === 'offer' && (
          <OfferForm
            conversationId={props.conversationId}
            suggested={props.listing.sellFastPrice ?? props.listing.askingPrice}
            onDone={() => setPanel('none')}
          />
        )}
        {panel === 'meetup' && (
          <MeetupForm
            conversationId={props.conversationId}
            points={props.meetupPoints}
            onDone={() => setPanel('none')}
          />
        )}
        {panel === 'report' && (
          <ReportForm
            conversationId={props.conversationId}
            onDone={() => setPanel('none')}
          />
        )}

        <div className="flex flex-wrap gap-2">
          <Chip active={panel === 'offer'} onClick={() => setPanel(panel === 'offer' ? 'none' : 'offer')}>
            <Tag className="size-3.5" /> Offer
          </Chip>
          <Chip active={panel === 'meetup'} onClick={() => setPanel(panel === 'meetup' ? 'none' : 'meetup')}>
            <CalendarClock className="size-3.5" /> Meetup
          </Chip>
          <Chip active={panel === 'report'} onClick={() => setPanel(panel === 'report' ? 'none' : 'report')}>
            <Flag className="size-3.5" /> Report
          </Chip>
        </div>

        <Composer conversationId={props.conversationId} otherName={props.otherName} />
      </div>
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] transition ${
        active
          ? 'bg-paper text-ink border-paper font-semibold'
          : 'border-hairline-strong text-paper-dim hover:border-paper hover:text-paper'
      }`}
    >
      {children}
    </button>
  );
}

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="flame" className="shrink-0 px-4" disabled={pending}>
      <Send className="size-4" />
    </Button>
  );
}

function Composer({ conversationId, otherName }: { conversationId: string; otherName: string }) {
  const [state, formAction] = useActionState<ThreadActionState, FormData>(sendMessage, {});
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      action={async (fd) => {
        await formAction(fd);
        ref.current?.reset();
      }}
      className="space-y-2"
    >
      <input type="hidden" name="conversationId" value={conversationId} />
      <div className="flex gap-2">
        <Input name="body" placeholder={`Message ${otherName}…`} maxLength={2000} autoComplete="off" required />
        <SendButton />
      </div>
      {state.error && <Alert tone="error">{state.error}</Alert>}
    </form>
  );
}

function OfferCard({
  entry,
  mine,
  sellFast,
}: {
  entry: Extract<TimelineEntry, { kind: 'offer' }>;
  mine: boolean;
  sellFast: number | null;
}) {
  const [state, formAction] = useActionState<ThreadActionState, FormData>(respondToOffer, {});
  const pending = entry.status === 'pending';
  const atSellFast = sellFast !== null && entry.amount === sellFast;

  return (
    <div className={mine ? 'flex justify-end' : 'flex justify-start'}>
      <Card className="w-[86%] max-w-sm space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-paper-dim text-[11px] font-semibold tracking-[0.13em] uppercase">
              {entry.isCounter ? 'Counter-offer' : 'Offer'}
            </p>
            <p className="font-display mt-1.5 text-3xl">{formatINR(entry.amount)}</p>
          </div>
          <StatusPill status={entry.status} />
        </div>

        {atSellFast && pending && <Badge tone="flame">At the sell-fast price</Badge>}

        {pending && !mine && (
          <form action={formAction} className="space-y-2">
            <input type="hidden" name="offerId" value={entry.id} />
            <div className="flex gap-2">
              <Button type="submit" name="decision" value="accepted" variant="flame" className="flex-1">
                <Check className="size-4" /> Accept
              </Button>
              <Button type="submit" name="decision" value="rejected" variant="secondary" className="flex-1">
                <X className="size-4" /> Decline
              </Button>
            </div>
            {state.error && <Alert tone="error">{state.error}</Alert>}
          </form>
        )}

        {pending && mine && (
          <p className="text-paper-faint text-[13px]">Waiting for a response.</p>
        )}
      </Card>
    </div>
  );
}

function MeetupCard({
  entry,
  mine,
}: {
  entry: Extract<TimelineEntry, { kind: 'meetup' }>;
  mine: boolean;
}) {
  const [state, formAction] = useActionState<ThreadActionState, FormData>(acceptMeetup, {});
  const when = new Date(entry.time);

  return (
    <div className={mine ? 'flex justify-end' : 'flex justify-start'}>
      <Card className="w-[86%] max-w-sm space-y-3">
        <div className="text-paper-dim flex items-center gap-2 text-[11px] font-semibold tracking-[0.13em] uppercase">
          <MapPin className="text-flame size-3.5" />
          Meetup
        </div>
        <div>
          <p className="font-semibold">{entry.pointName}</p>
          <p className="text-paper-dim mt-1 text-[13px]">
            {when.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
            {' · '}
            {when.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>

        {entry.acceptedAt ? (
          <Badge tone="verify">
            <Check className="size-3" /> Confirmed
          </Badge>
        ) : entry.cancelledAt ? (
          <Badge tone="neutral">Cancelled</Badge>
        ) : mine ? (
          <p className="text-paper-faint text-[13px]">Waiting for them to confirm.</p>
        ) : (
          <form action={formAction} className="space-y-2">
            <input type="hidden" name="meetupId" value={entry.id} />
            <Button type="submit" variant="flame" className="w-full">
              Confirm this meetup
            </Button>
            {state.error && <Alert tone="error">{state.error}</Alert>}
          </form>
        )}
      </Card>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === 'accepted') return <Badge tone="verify">Accepted</Badge>;
  if (status === 'rejected') return <Badge tone="neutral">Declined</Badge>;
  if (status === 'countered') return <Badge tone="neutral">Countered</Badge>;
  if (status === 'expired') return <Badge tone="neutral">Expired</Badge>;
  return <Badge tone="flame">Pending</Badge>;
}

function OfferForm({
  conversationId,
  suggested,
  onDone,
}: {
  conversationId: string;
  suggested: number;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState<ThreadActionState, FormData>(makeOffer, {});

  return (
    <Card className="space-y-3">
      <p className="text-sm font-semibold">Make an offer</p>
      <form
        action={async (fd) => {
          await formAction(fd);
          onDone();
        }}
        className="space-y-2"
      >
        <input type="hidden" name="conversationId" value={conversationId} />
        <Input
          name="amount"
          type="number"
          inputMode="numeric"
          min={1}
          defaultValue={suggested}
          required
        />
        <p className="text-paper-dim text-[12px]">
          Suggested sell-fast price is {formatINR(suggested)}.
        </p>
        <div className="flex gap-2">
          <Button type="submit" variant="flame" className="flex-1">
            Send offer
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
        {state.error && <Alert tone="error">{state.error}</Alert>}
      </form>
    </Card>
  );
}

function MeetupForm({
  conversationId,
  points,
  onDone,
}: {
  conversationId: string;
  points: Array<{ id: string; name: string; campus: string }>;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState<ThreadActionState, FormData>(proposeMeetup, {});

  // Tomorrow at noon: a safe, daylight default. Computed in a lazy initializer
  // rather than during render -- reading the clock while rendering is impure,
  // and the viewer's timezone is only knowable on the client anyway.
  const [defaultValue] = useState(() => {
    const tomorrow = new Date(Date.now() + 86_400_000);
    tomorrow.setHours(12, 0, 0, 0);
    return new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
  });

  return (
    <Card className="space-y-3">
      <p className="text-sm font-semibold">Propose a meetup</p>
      <form
        action={async (fd) => {
          await formAction(fd);
          onDone();
        }}
        className="space-y-2"
      >
        <input type="hidden" name="conversationId" value={conversationId} />
        <Select name="meetupPointId" required defaultValue={points[0]?.id ?? ''}>
          {points.map((p) => (
            <option key={p.id} value={p.id}>
              {p.campus} — {p.name}
            </option>
          ))}
        </Select>
        <Input name="proposedTime" type="datetime-local" defaultValue={defaultValue} required />
        <p className="text-paper-dim text-[12px]">
          Only pre-approved campus spots. Daylight hours are safest.
        </p>
        <div className="flex gap-2">
          <Button type="submit" variant="flame" className="flex-1">
            Propose
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
        {state.error && <Alert tone="error">{state.error}</Alert>}
      </form>
    </Card>
  );
}

function ReportForm({ conversationId, onDone }: { conversationId: string; onDone: () => void }) {
  const [state, formAction] = useActionState<ThreadActionState, FormData>(submitReport, {});

  if (state.message) {
    return (
      <Alert tone="success">{state.message}</Alert>
    );
  }

  return (
    <Card className="space-y-3">
      <p className="text-sm font-semibold">Report this conversation</p>
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="targetType" value="conversation" />
        <input type="hidden" name="targetId" value={conversationId} />
        <Input name="reason" placeholder="What's wrong?" maxLength={300} required />
        <div className="flex gap-2">
          <Button type="submit" variant="danger" className="flex-1">
            Submit report
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
        {state.error && <Alert tone="error">{state.error}</Alert>}
      </form>
    </Card>
  );
}
