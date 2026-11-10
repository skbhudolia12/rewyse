'use client';

import { useTransition } from 'react';
import { HandCoins, Loader2, MessageCircle } from 'lucide-react';
import { startCheckout } from '@/lib/payments/actions';
import { openConversation } from '@/lib/messaging/actions';
import { Button } from '@/components/ui';

export function BuyButton({
  listingId,
  sellerFirstName,
  hasAcceptedOffer,
}: {
  listingId: string;
  sellerFirstName: string;
  hasAcceptedOffer: boolean;
}) {
  const [buying, startBuy] = useTransition();
  const [offering, startOffer] = useTransition();
  const [chatting, startChat] = useTransition();
  const busy = buying || offering || chatting;

  return (
    <div className="space-y-2">
      <Button
        variant="flame"
        size="lg"
        className="w-full"
        disabled={busy}
        onClick={() => startBuy(() => void startCheckout(listingId))}
      >
        {buying ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Opening checkout
          </>
        ) : hasAcceptedOffer ? (
          'Buy at your offer price'
        ) : (
          'Buy now'
        )}
      </Button>

      {!hasAcceptedOffer && (
        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          disabled={busy}
          onClick={() => startOffer(() => void openConversation(listingId, 'offer'))}
        >
          {offering ? <Loader2 className="size-4 animate-spin" /> : <HandCoins className="size-4" />}
          Make an offer
        </Button>
      )}

      <Button
        variant="ghost"
        className="w-full"
        disabled={busy}
        onClick={() => startChat(() => void openConversation(listingId))}
      >
        {chatting ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}
        Message {sellerFirstName}
      </Button>
    </div>
  );
}
