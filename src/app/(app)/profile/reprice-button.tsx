'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2, Sparkles } from 'lucide-react';
import { repriceListing, type ListingActionState } from '@/lib/listings/actions';
import { Alert, Button, Card } from '@/components/ui';
import { formatINR } from '@/lib/utils';

interface Suggestion {
  sellFast: number;
  fairMin: number;
  fairMax: number;
  days: number;
  current: number;
}

function RunButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" /> Checking…
        </>
      ) : (
        <>
          <Sparkles className="size-4" /> {label}
        </>
      )}
    </Button>
  );
}

export function RepriceButton({ listingId }: { listingId: string }) {
  const [state, formAction] = useActionState<ListingActionState, FormData>(repriceListing, {});

  if (state.message === 'ok') {
    return <Alert tone="success">Price dropped. Your listing is updated.</Alert>;
  }

  let suggestion: Suggestion | null = null;
  if (state.message && state.message !== 'ok') {
    try {
      suggestion = JSON.parse(state.message) as Suggestion;
    } catch {
      suggestion = null;
    }
  }

  if (suggestion) {
    const saving = suggestion.current - suggestion.sellFast;
    const alreadyThere = saving <= 0;

    return (
      <Card className="border-flame-edge space-y-3">
        <p className="text-paper-dim text-[11px] font-semibold tracking-[0.13em] uppercase">
          {suggestion.days} {suggestion.days === 1 ? 'day' : 'days'} to move-out
        </p>

        {alreadyThere ? (
          <p className="text-[13px] leading-relaxed">
            You&rsquo;re already at or below the sell-fast price of{' '}
            <span className="font-semibold">{formatINR(suggestion.sellFast)}</span>. Nothing to drop.
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-3">
              <span className="text-paper-faint text-lg line-through">
                {formatINR(suggestion.current)}
              </span>
              <span className="font-display text-flame text-3xl">
                {formatINR(suggestion.sellFast)}
              </span>
            </div>
            <p className="text-paper-dim text-[13px] leading-relaxed">
              {formatINR(saving)} less. At this price it typically sells within 48 hours.
            </p>
            <form action={formAction}>
              <input type="hidden" name="listingId" value={listingId} />
              <input type="hidden" name="accept" value="1" />
              <Button type="submit" variant="flame" className="w-full">
                Drop to {formatINR(suggestion.sellFast)}
              </Button>
            </form>
          </>
        )}
      </Card>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="listingId" value={listingId} />
      <RunButton label="Drop price with Smart Price" />
      {state.error && <Alert tone="error">{state.error}</Alert>}
    </form>
  );
}
