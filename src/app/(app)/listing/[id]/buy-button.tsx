'use client';

import { useTransition } from 'react';
import { Loader2, MessageCircle, ShieldCheck } from 'lucide-react';
import { startCheckout } from '@/lib/payments/actions';
import { openConversation } from '@/lib/messaging/actions';
import { Button } from '@/components/ui';
import { formatINR } from '@/lib/utils';

export function BuyButton({
  listingId,
  sellerFirstName,
  acceptedAmount,
}: {
  listingId: string;
  sellerFirstName: string;
  acceptedAmount: number | null;
}) {
  const [buying, startBuy] = useTransition();
  const [chatting, startChat] = useTransition();

  return (
    <div className="space-y-2.5">
      <Button
        variant="flame"
        size="lg"
        className="w-full"
        disabled={buying}
        onClick={() => startBuy(() => void startCheckout(listingId))}
      >
        {buying ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Opening checkout…
          </>
        ) : acceptedAmount !== null ? (
          `Pay your accepted price — ${formatINR(acceptedAmount)}`
        ) : (
          'Buy — payment held until you confirm'
        )}
      </Button>

      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        disabled={chatting}
        onClick={() => startChat(() => void openConversation(listingId))}
      >
        {chatting ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Opening…
          </>
        ) : (
          <>
            <MessageCircle className="size-4" /> Message {sellerFirstName}
          </>
        )}
      </Button>

      <p className="text-paper-faint flex items-center justify-center gap-1.5 text-center text-xs">
        <ShieldCheck className="size-3.5" />
        Simulated payment during the pilot — nothing is charged
      </p>
    </div>
  );
}
