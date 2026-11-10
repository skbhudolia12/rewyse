'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import {
  advanceDelivery,
  resolvePayment,
  type PaymentActionState,
} from '@/lib/payments/actions';
import { Alert, Button, Input } from '@/components/ui';
import { cn, formatINR } from '@/lib/utils';
import { formatOrderTime, orderStage, STAGE_LABELS, type PaymentRow as OrderRow } from '@/lib/orders';

export interface DeskPayment extends OrderRow {
  id: string;
  amount: number;
  item_amount: number;
  convenience_fee: number;
  delivery_fee: number;
  gateway_reference: string;
  created_at: string;
  admin_note: string | null;
  payment_method: string | null;
  delivery_address: string | null;
  rider_name: string | null;
  tracking_id: string | null;
  payout_reference: string | null;
  payout_account_mask: string | null;
  listing: { title: string } | null;
  buyer: { full_name: string; email: string } | null;
  seller: { full_name: string; email: string } | null;
}

const ADVANCE_LABELS: Record<string, string> = {
  scheduled: 'Mark picked up',
  picked_up: 'Mark out for delivery',
  out_for_delivery: 'Mark delivered',
};

function Submit({
  children,
  variant = 'flame',
  name,
  value,
  disabled,
}: {
  children: React.ReactNode;
  variant?: 'flame' | 'secondary' | 'danger';
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" name={name} value={value} variant={variant} disabled={pending || disabled}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}

export function DeskRow({ payment }: { payment: DeskPayment }) {
  const [deliveryState, deliveryAction] = useActionState<PaymentActionState, FormData>(advanceDelivery, {});
  const [payoutState, payoutAction] = useActionState<PaymentActionState, FormData>(resolvePayment, {});
  const [refunding, setRefunding] = useState(false);

  const stage = orderStage(payment);
  const held = payment.status === 'held';
  const advanceLabel = held && !payment.buyer_confirmed_at ? ADVANCE_LABELS[payment.delivery_status ?? ''] : undefined;
  const canRelease = held && payment.buyer_confirmed_at !== null;
  const fees = payment.convenience_fee + payment.delivery_fee;

  return (
    <li className="bg-ink-raised space-y-4 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium">{payment.listing?.title ?? 'Listing'}</p>
          <p className="text-paper-dim mt-0.5 text-[13px]">
            {payment.buyer?.full_name} bought from {payment.seller?.full_name} ·{' '}
            {formatOrderTime(payment.created_at)}
          </p>
          <p className="text-paper-faint mt-0.5 text-xs">
            {payment.gateway_reference}
            {payment.tracking_id ? ` · ${payment.tracking_id}` : ''}
            {payment.rider_name ? ` · Rider ${payment.rider_name}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold">{formatINR(payment.amount)}</p>
          <p className="text-paper-dim text-xs">
            {formatINR(payment.item_amount)} to seller · {formatINR(fees)} fees
          </p>
          <p
            className={cn(
              'mt-1 text-xs font-medium',
              stage === 'completed' ? 'text-verify' : stage === 'refunded' ? 'text-paper-dim' : 'text-flame-bright',
            )}
          >
            {STAGE_LABELS[stage]}
          </p>
        </div>
      </div>

      {payment.status === 'released' && payment.payout_reference && (
        <p className="text-paper-dim text-[13px]">
          Paid {formatINR(payment.item_amount)} to {payment.payout_account_mask} · {payment.payout_reference}
        </p>
      )}
      {payment.admin_note && (
        <p className="text-paper-dim border-hairline border-l-2 pl-3 text-[13px]">{payment.admin_note}</p>
      )}

      {held && (
        <div className="flex flex-wrap items-start gap-2">
          {advanceLabel && (
            <form action={deliveryAction}>
              <input type="hidden" name="paymentId" value={payment.id} />
              <Submit variant="secondary">{advanceLabel}</Submit>
            </form>
          )}

          {stage === 'delivered' && (
            <p className="text-paper-dim self-center text-[13px]">Waiting for the buyer to confirm.</p>
          )}

          <form action={payoutAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="paymentId" value={payment.id} />
            {canRelease && (
              <Submit name="decision" value="release">
                Release {formatINR(payment.item_amount)} to seller
              </Submit>
            )}
            {refunding ? (
              <>
                <Input name="note" required autoFocus maxLength={300} placeholder="Reason for refund" className="w-64" />
                <Submit name="decision" value="refund" variant="danger">
                  Refund buyer
                </Submit>
                <Button type="button" variant="ghost" onClick={() => setRefunding(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button type="button" variant="ghost" onClick={() => setRefunding(true)}>
                Refund
              </Button>
            )}
          </form>
        </div>
      )}

      {deliveryState.error && <Alert tone="error">{deliveryState.error}</Alert>}
      {payoutState.error && <Alert tone="error">{payoutState.error}</Alert>}
    </li>
  );
}
