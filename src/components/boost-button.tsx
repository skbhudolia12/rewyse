'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { XPaySheet } from '@/components/xpay-sheet';
import { boostListing } from '@/lib/listings/actions';
import { BOOST_PLANS, type BoostPlan } from '@/lib/fees';
import { cn, formatINR } from '@/lib/utils';

/**
 * Plan picker, then the X-Pay sheet. Shown only to the listing's seller.
 *
 * `boostedUntil` is set when a boost is already running; buying another one
 * extends it rather than overlapping (the database stacks them).
 */
export function BoostButton({
  listingId,
  boostedUntil,
  payer,
  className,
}: {
  listingId: string;
  boostedUntil: string | null;
  payer: { name: string; email: string };
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<BoostPlan>('boost_7d');
  const [paying, setPaying] = useState(false);

  const until = boostedUntil
    ? new Date(boostedUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
    : null;

  return (
    <>
      <Button variant="secondary" className={cn('w-full', className)} onClick={() => setOpen(true)}>
        <Rocket className="size-4" />
        {until ? `Featured until ${until}. Extend` : 'Boost listing'}
      </Button>

      {open && !paying && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="boost-title"
            className="bg-ink-raised border-hairline-strong w-full max-w-md rounded-t-2xl border p-6 sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="boost-title" className="text-lg font-semibold">
                  Boost your listing
                </h2>
                <p className="text-paper-dim mt-1 text-sm leading-relaxed">
                  Featured listings appear first on everyone&rsquo;s feed, marked Sponsored.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-paper-dim hover:text-paper hover:bg-surface rounded-full p-1.5"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              {(Object.keys(BOOST_PLANS) as BoostPlan[]).map((key) => {
                const p = BOOST_PLANS[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPlan(key)}
                    aria-pressed={plan === key}
                    className={cn(
                      'rounded-xl border p-4 text-left transition',
                      plan === key ? 'border-flame bg-flame-soft' : 'border-hairline-strong hover:border-paper-faint',
                    )}
                  >
                    <span className="block text-sm font-medium">{p.label}</span>
                    <span className="mt-1 block text-2xl font-semibold tracking-tight">{formatINR(p.price)}</span>
                    {key === 'boost_7d' && <span className="text-paper-dim mt-1 block text-xs">Best for a full week before move-out</span>}
                  </button>
                );
              })}
            </div>

            <Button variant="flame" size="lg" className="mt-5 w-full" onClick={() => setPaying(true)}>
              Pay {formatINR(BOOST_PLANS[plan].price)}
            </Button>
          </div>
        </div>
      )}

      {open && paying && (
        <XPaySheet
          reference={`BST-${listingId.slice(0, 8).toUpperCase()}`}
          amount={BOOST_PLANS[plan].price}
          payer={payer}
          onPay={async () => {
            const result = await boostListing({ listingId, plan });
            return result.ok ? { ok: true } : result;
          }}
          onSuccess={() => {
            setPaying(false);
            setOpen(false);
            router.refresh();
          }}
          onClose={() => setPaying(false)}
        />
      )}
    </>
  );
}
