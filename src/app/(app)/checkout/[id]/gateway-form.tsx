'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { simulateGatewayCapture, type PaymentActionState } from '@/lib/payments/actions';
import { Alert, Button } from '@/components/ui';
import { formatINR } from '@/lib/utils';

function PayButton({ amount }: { amount: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="flame" size="lg" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" /> Contacting X-Pay…
        </>
      ) : (
        `Pay ${formatINR(amount)}`
      )}
    </Button>
  );
}

export function GatewayForm({ paymentId, amount }: { paymentId: string; amount: number }) {
  const [state, formAction] = useActionState<PaymentActionState, FormData>(
    simulateGatewayCapture,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="paymentId" value={paymentId} />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <PayButton amount={amount} />
      <p className="text-paper-faint text-center text-[11px]">
        Pressing this records a simulated payment. Nothing is charged.
      </p>
    </form>
  );
}
