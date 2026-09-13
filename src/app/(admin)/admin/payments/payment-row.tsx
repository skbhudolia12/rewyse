'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { resolvePayment, type PaymentActionState } from '@/lib/payments/actions';
import { Alert, Badge, Button, Card, Input } from '@/components/ui';
import { formatINR } from '@/lib/utils';

export interface HeldPayment {
  id: string;
  amount: number;
  gateway_reference: string;
  created_at: string;
  admin_note: string | null;
  listing: { title: string } | null;
  buyer: { full_name: string; email: string } | null;
  seller: { full_name: string; email: string } | null;
}

function Actions({ onRefund, canRelease }: { onRefund: () => void; canRelease: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex gap-2">
      <Button
        type="submit"
        name="decision"
        value="release"
        variant="flame"
        className="flex-1"
        disabled={pending || !canRelease}
      >
        {pending ? 'Saving…' : 'Release to seller'}
      </Button>
      <Button type="button" variant="secondary" onClick={onRefund} disabled={pending}>
        Refund
      </Button>
    </div>
  );
}

export function PaymentRow({
  payment,
  readOnly,
}: {
  payment: HeldPayment & { status: string; buyer_confirmed_at: string | null };
  readOnly: boolean;
}) {
  const [state, formAction] = useActionState<PaymentActionState, FormData>(resolvePayment, {});
  const [refunding, setRefunding] = useState(false);

  const confirmed = payment.buyer_confirmed_at !== null;

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-semibold">{payment.listing?.title ?? 'Deleted listing'}</p>
          <p className="text-paper-dim mt-1 truncate text-[13px]">
            {payment.buyer?.full_name} → {payment.seller?.full_name}
          </p>
          <p className="text-paper-faint mt-1 font-mono text-[11px]">
            {payment.gateway_reference}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-2xl">{formatINR(payment.amount)}</p>
          <div className="mt-1.5 flex justify-end">
            {payment.status === 'released' ? (
              <Badge tone="verify">Released</Badge>
            ) : payment.status === 'refunded' ? (
              <Badge tone="neutral">Refunded</Badge>
            ) : confirmed ? (
              <Badge tone="flame">Confirmed</Badge>
            ) : (
              <Badge tone="neutral">Awaiting buyer</Badge>
            )}
          </div>
        </div>
      </div>

      {payment.admin_note && (
        <p className="text-paper-dim border-hairline border-l-2 pl-3 text-[13px]">
          {payment.admin_note}
        </p>
      )}

      {state.message && <Alert tone="success">{state.message}</Alert>}

      {!readOnly && !state.message && (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="paymentId" value={payment.id} />

          {!confirmed && (
            <p className="text-paper-dim text-[13px]">
              The buyer has not confirmed receipt. Releasing is blocked until they do — refund
              instead if the deal fell through.
            </p>
          )}

          {refunding ? (
            <div className="space-y-2">
              <Input
                name="note"
                required
                autoFocus
                maxLength={300}
                placeholder="Why is this being refunded?"
              />
              <div className="flex gap-2">
                <Button type="submit" name="decision" value="refund" variant="danger" className="flex-1">
                  Confirm refund
                </Button>
                <Button type="button" variant="ghost" onClick={() => setRefunding(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Actions onRefund={() => setRefunding(true)} canRelease={confirmed} />
          )}

          {state.error && <Alert tone="error">{state.error}</Alert>}
        </form>
      )}
    </Card>
  );
}
