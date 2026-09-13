'use client';

import { useTransition } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { startCheckout } from '@/lib/payments/actions';
import { Button } from '@/components/ui';

export function BuyButton({ listingId, sellerFirstName }: { listingId: string; sellerFirstName: string }) {
  const [pending, start] = useTransition();

  return (
    <div className="space-y-2.5">
      <Button
        variant="flame"
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() => start(() => void startCheckout(listingId))}
      >
        {pending ? <><Loader2 className="size-4 animate-spin" /> Opening checkout…</> : 'Buy — payment held until you confirm'}
      </Button>
      <Button variant="secondary" size="lg" className="w-full" disabled>
        Message {sellerFirstName}
      </Button>
      <p className="text-paper-faint flex items-center justify-center gap-1.5 text-center text-xs">
        <ShieldCheck className="size-3.5" />
        Simulated payment during the pilot — nothing is charged
      </p>
    </div>
  );
}
