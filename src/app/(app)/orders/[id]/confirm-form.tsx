'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { confirmReceipt, type PaymentActionState } from '@/lib/payments/actions';
import { Alert, Button, Card } from '@/components/ui';

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="flame" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Confirming…' : 'I have the item — release the payment'}
    </Button>
  );
}

export function ConfirmReceiptForm({ paymentId }: { paymentId: string }) {
  const [state, formAction] = useActionState<PaymentActionState, FormData>(confirmReceipt, {});

  if (state.message) {
    return <Alert tone="success">{state.message}</Alert>;
  }

  return (
    <Card className="space-y-4">
      <div>
        <p className="font-semibold">Got the item?</p>
        <p className="text-paper-dim mt-1.5 text-[13px] leading-relaxed">
          Only confirm once it&rsquo;s in your hands and matches the listing. This is the step
          that pays the seller — if something is wrong, don&rsquo;t confirm, report it instead.
        </p>
      </div>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="paymentId" value={paymentId} />
        {state.error && <Alert tone="error">{state.error}</Alert>}
        <ConfirmButton />
      </form>
    </Card>
  );
}
