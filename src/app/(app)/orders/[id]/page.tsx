import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check, ShieldCheck, Truck, Wallet } from 'lucide-react';
import { Alert } from '@/components/ui';
import { requireVerified } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { cn, formatINR } from '@/lib/utils';
import { formatOrderTime, orderStage, orderSteps, STAGE_LABELS } from '@/lib/orders';
import { ConfirmReceiptForm } from './confirm-form';
import { LiveRefresh } from './live-refresh';

export const dynamic = 'force-dynamic';

const SIGNED_URL_TTL_SECONDS = 3600;

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { id } = await params;
  const { paid } = await searchParams;
  const viewer = await requireVerified();
  const supabase = await createClient();

  const { data: payment } = await supabase
    .from('payments')
    .select(
      `*, listing:listings(id, title, listing_media(storage_path, kind, position)),
       seller:profiles!payments_seller_id_fkey(full_name),
       buyer:profiles!payments_buyer_id_fkey(full_name)`,
    )
    .eq('id', id)
    .maybeSingle();

  if (!payment) notFound();

  const isBuyer = payment.buyer_id === viewer.id;
  const listing = payment.listing as unknown as {
    id: string;
    title: string;
    listing_media: Array<{ storage_path: string; kind: string; position: number }> | null;
  } | null;
  const seller = payment.seller as unknown as { full_name: string } | null;
  const buyer = payment.buyer as unknown as { full_name: string } | null;
  const sellerFirst = seller?.full_name.split(' ')[0] ?? 'the seller';
  const buyerFirst = buyer?.full_name.split(' ')[0] ?? 'the buyer';

  const cover = (listing?.listing_media ?? [])
    .filter((m) => m.kind === 'photo')
    .sort((a, b) => a.position - b.position)[0];
  let imageUrl: string | null = null;
  if (cover) {
    const { data } = await supabase.storage
      .from('listing-media')
      .createSignedUrl(cover.storage_path, SIGNED_URL_TTL_SECONDS);
    imageUrl = data?.signedUrl ?? null;
  }

  const stage = orderStage(payment);
  const steps = orderSteps(payment);
  const current = steps.findIndex((s) => s.at === null);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">
      <LiveRefresh paymentId={payment.id} />

      {paid && isBuyer && (
        <div className="mb-5">
          <Alert tone="success" title="Order placed">
            Your payment is held in Dobara Escrow. A SwiftDrop rider will collect the item from{' '}
            {sellerFirst}.
          </Alert>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-paper-dim text-sm">{isBuyer ? 'Your order' : 'Your sale'}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{STAGE_LABELS[stage]}</h1>
        </div>
        {payment.tracking_id && (
          <p className="text-paper-dim text-sm">
            Tracking <span className="text-paper font-medium">{payment.tracking_id}</span>
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <section className="border-hairline bg-ink-raised rounded-xl border p-5">
            <Link href={listing ? `/listing/${listing.id}` : '#'} className="group flex gap-4">
              <div className="bg-ink-elevated size-16 shrink-0 overflow-hidden rounded-lg">
                {imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={imageUrl} alt="" className="size-full object-cover" />
                )}
              </div>
              <div className="min-w-0">
                <p className="group-hover:text-flame-bright line-clamp-2 font-medium">
                  {listing?.title ?? 'Item'}
                </p>
                <p className="text-paper-dim mt-1 text-sm">
                  {isBuyer ? `Sold by ${seller?.full_name}` : `Bought by ${buyer?.full_name}`}
                </p>
              </div>
            </Link>

            {payment.status !== 'initiated' && (
              <ol className="mt-6 space-y-0">
                {steps.map((step, i) => {
                  const done = step.at !== null;
                  const active = i === current && payment.status === 'held';
                  const last = i === steps.length - 1;
                  return (
                    <li key={step.key} className="relative flex gap-4 pb-5 last:pb-0">
                      {!last && (
                        <span
                          aria-hidden
                          className={cn(
                            'absolute top-7 left-[13px] h-[calc(100%-1.75rem)] w-0.5',
                            done && steps[i + 1]?.at ? 'bg-verify' : 'bg-hairline-strong',
                          )}
                        />
                      )}
                      <span
                        className={cn(
                          'relative flex size-7 shrink-0 items-center justify-center rounded-full border-2',
                          done
                            ? 'bg-verify border-verify text-ink'
                            : active
                              ? 'border-flame bg-ink'
                              : 'border-hairline-strong bg-ink',
                        )}
                      >
                        {done ? (
                          <Check className="size-4" strokeWidth={3} />
                        ) : active ? (
                          <span className="bg-flame pulse-dot size-2 rounded-full" />
                        ) : null}
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <p className={cn('text-sm font-medium', !done && !active && 'text-paper-dim')}>
                          {step.label}
                        </p>
                        <p className="text-paper-dim text-[13px]">
                          {done
                            ? formatOrderTime(step.at!)
                            : active
                              ? activeHint(step.key, { isBuyer, sellerFirst, buyerFirst })
                              : ''}
                        </p>
                        {step.key === 'paid_out' && payment.payout_reference && (
                          <p className="text-paper-faint mt-0.5 text-xs">
                            {formatINR(payment.item_amount)} to {payment.payout_account_mask} ·{' '}
                            {payment.payout_reference}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {isBuyer && stage === 'delivered' && (
            <ConfirmReceiptForm paymentId={payment.id} sellerFirstName={sellerFirst} />
          )}

          {payment.status === 'refunded' && (
            <Alert tone="info" title="Refunded">
              {payment.admin_note ?? 'This payment was returned to the buyer.'}
            </Alert>
          )}
        </div>

        <aside className="space-y-4">
          {payment.delivery_partner && (
            <section className="border-hairline bg-ink-raised rounded-xl border p-5 text-sm">
              <h2 className="flex items-center gap-2 font-semibold">
                <Truck className="size-4" />
                Delivery
              </h2>
              <dl className="mt-3 space-y-2">
                <Row label="Partner" value={payment.delivery_partner} />
                <Row label="Rider" value={payment.rider_name ?? 'Being assigned'} />
                <Row label="Deliver to" value={payment.delivery_address ?? '—'} />
              </dl>
            </section>
          )}

          <section className="border-hairline bg-ink-raised rounded-xl border p-5 text-sm">
            {isBuyer ? (
              <>
                <h2 className="font-semibold">Payment</h2>
                <dl className="mt-3 space-y-2">
                  <Row label="Item" value={formatINR(payment.item_amount)} />
                  <Row label="Delivery" value={formatINR(payment.delivery_fee)} />
                  <Row label="Convenience fee" value={formatINR(payment.convenience_fee)} />
                  <div className="border-hairline flex justify-between border-t pt-2 font-semibold">
                    <dt>Total paid</dt>
                    <dd>{formatINR(payment.amount)}</dd>
                  </div>
                  {payment.payment_method && <Row label="Paid with" value={`X-Pay · ${payment.payment_method}`} />}
                </dl>
              </>
            ) : (
              <>
                <h2 className="flex items-center gap-2 font-semibold">
                  <Wallet className="size-4" />
                  Your payout
                </h2>
                <p className="mt-2 text-2xl font-semibold tracking-tight">
                  {formatINR(payment.item_amount)}
                </p>
                <p className="text-paper-dim mt-1 text-[13px] leading-relaxed">
                  {payment.status === 'released'
                    ? `Sent to ${payment.payout_account_mask}.`
                    : `Paid to your bank account once ${buyerFirst} confirms the item arrived. Dobara charges sellers no commission.`}
                </p>
              </>
            )}
            <p className="border-hairline text-paper-dim mt-4 flex gap-2 border-t pt-4 text-[13px]">
              <ShieldCheck className="text-verify size-4 shrink-0" />
              Held in Dobara Escrow until the buyer confirms.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}

function activeHint(
  key: string,
  who: { isBuyer: boolean; sellerFirst: string; buyerFirst: string },
): string {
  switch (key) {
    case 'picked_up':
      return who.isBuyer
        ? `A rider will collect it from ${who.sellerFirst}'s hostel.`
        : 'Keep the item ready. A SwiftDrop rider will collect it from your hostel.';
    case 'out_for_delivery':
      return 'Collected. The rider heads out with it shortly.';
    case 'delivered':
      return who.isBuyer ? 'The rider is on the way to you.' : `On the way to ${who.buyerFirst}.`;
    case 'confirmed':
      return who.isBuyer ? 'Check the item and confirm below.' : `Waiting for ${who.buyerFirst} to confirm.`;
    case 'paid_out':
      return 'Dobara releases the payment shortly after confirmation.';
    default:
      return '';
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-paper-dim">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
