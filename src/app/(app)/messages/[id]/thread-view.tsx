'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Check, Flag, Loader2, Send, ShieldAlert, Tag, X } from 'lucide-react';
import { startCheckout } from '@/lib/payments/actions';
import {
  makeOffer,
  respondToOffer,
  sendMessage,
  submitReport,
  type ThreadActionState,
} from '@/lib/messaging/actions';
import type { TimelineEntry } from '@/lib/messaging/queries';
import { Alert, Badge, Button, Card, Input } from '@/components/ui';
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
  initialPanel: 'none' | 'offer';
  timeline: TimelineEntry[];
  acceptedOfferId: string | null;
  acceptedAmount: number | null;
  status: string;
}

export function ThreadView(props: ThreadProps) {
  const router = useRouter();
  const [panel, setPanel] = useState<'none' | 'offer' | 'report'>(props.initialPanel);
  const [buying, startBuy] = useTransition();
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
          decoration; this one is why every payment goes through escrow. */}
      <div className="border-hairline bg-ink-raised flex items-start gap-3 rounded-lg border px-4 py-3">
        <ShieldAlert className="text-flame-bright mt-0.5 size-4 shrink-0" />
        <p className="text-paper-dim text-[13px] leading-relaxed">
          Pay only through ReWyse checkout, so your money stays in escrow until the item arrives.
          Never share bank details or OTPs in chat.
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
                    mine ? 'bg-paper text-ink' : 'border-hairline bg-ink-raised border'
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

          // Meetups predate ReWyse delivery; old proposals are not shown.
          return null;
        })}
        <div ref={bottom} />
      </div>

      {props.acceptedOfferId && props.isBuyer && props.listing.status === 'active' && (
        <div className="border-verify/35 bg-verify-soft flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
          <p className="text-verify text-sm font-medium">
            Offer accepted at {formatINR(props.acceptedAmount ?? 0)}
          </p>
          <Button
            variant="flame"
            disabled={buying}
            onClick={() => startBuy(() => void startCheckout(props.listing.id))}
          >
            {buying && <Loader2 className="size-4 animate-spin" />}
            Buy at {formatINR(props.acceptedAmount ?? 0)}
          </Button>
        </div>
      )}

      <div className="border-hairline bg-ink sticky bottom-0 space-y-3 border-t pt-4 pb-2">
        {panel === 'offer' && (
          <OfferForm
            conversationId={props.conversationId}
            suggested={props.listing.sellFastPrice ?? props.listing.askingPrice}
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
            <p className="text-paper-dim text-[13px]">
              {mine ? 'You offered' : entry.isCounter ? 'Counter-offer' : 'Offer'}
            </p>
            <p className="mt-0.5 text-2xl font-semibold tracking-tight">{formatINR(entry.amount)}</p>
          </div>
          <StatusPill status={entry.status} />
        </div>

        {atSellFast && pending && <Badge tone="flame">Matches the quick-sale price</Badge>}

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
          The quick-sale price is {formatINR(suggested)}.
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
