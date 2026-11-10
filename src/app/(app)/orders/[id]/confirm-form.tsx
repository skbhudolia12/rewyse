'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { confirmReceipt, type PaymentActionState } from '@/lib/payments/actions';
import { Alert, Button } from '@/components/ui';

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="flame" size="lg" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" /> Confirming
        </>
      ) : (
        'Confirm item received'
      )}
    </Button>
  );
}

export function ConfirmReceiptForm({ paymentId, sellerFirstName }: { paymentId: string; sellerFirstName: string }) {
  const [state, formAction] = useActionState<PaymentActionState, FormData>(confirmReceipt, {});

  if (state.message) return <Alert tone="success">{state.message}</Alert>;

  return (
    <div className="border-flame-edge bg-flame-soft space-y-4 rounded-xl border p-5">
      <div>
        <p className="font-semibold">Your item has been delivered</p>
        <p className="text-paper-dim mt-1 text-sm leading-relaxed">
          Check that it matches the listing. Confirming releases the payment to {sellerFirstName}.
          If something is wrong, don&rsquo;t confirm. Message the seller or report it instead.
        </p>
      </div>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="paymentId" value={paymentId} />
        {state.error && <Alert tone="error">{state.error}</Alert>}
        <ConfirmButton />
      </form>
    </div>
  );
}
