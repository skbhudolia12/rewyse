import { notFound, redirect } from 'next/navigation';
import { Lock, ShieldCheck } from 'lucide-react';
import { requireVerified } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatINR } from '@/lib/utils';
import { GatewayForm } from './gateway-form';

export const dynamic = 'force-dynamic';

/**
 * The simulated X-Pay gateway.
 *
 * Rendered to look like a separate product on purpose -- a real gateway is a
 * different company's page, and a handover that feels seamless would teach
 * pilot students the wrong thing about where their money goes.
 *
 * The simulation notice is not buried. Anyone on this page can see in one
 * glance that no real payment is happening, which is the only honest way to put
 * a payment screen in front of real students.
 */
export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const buyer = await requireVerified();
  const supabase = await createClient();

  const { data: payment } = await supabase
    .from('payments')
    .select('id, amount, status, gateway_reference, buyer_id, listing:listings(title)')
    .eq('id', id)
    .maybeSingle();

  if (!payment || payment.buyer_id !== buyer.id) notFound();
  if (payment.status !== 'initiated') redirect(`/orders/${payment.id}`);

  const listing = payment.listing as unknown as { title: string } | null;

  return (
    <main className="bg-ink-raised flex min-h-screen flex-col items-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-5 rounded-xl border border-dashed border-amber-500/50 bg-amber-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-amber-300">Simulation — no real payment</p>
          <p className="mt-1 text-[13px] leading-relaxed text-amber-200/80">
            X-Pay is a stand-in so you can try the flow. No card is charged and no money moves.
          </p>
        </div>

        <div className="border-hairline bg-ink overflow-hidden rounded-2xl border">
          <div className="border-hairline flex items-center justify-between border-b px-6 py-5">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-2xl tracking-[-0.05em]">X&#8209;Pay</span>
              <span className="text-paper-faint text-[11px]">secure checkout</span>
            </div>
            <Lock className="text-paper-faint size-4" />
          </div>

          <div className="space-y-5 px-6 py-7">
            <div>
              <p className="text-paper-dim text-xs font-semibold tracking-[0.14em] uppercase">
                Paying
              </p>
              <p className="font-display mt-2 text-5xl">{formatINR(payment.amount)}</p>
              <p className="text-paper-dim mt-2 text-sm">{listing?.title ?? 'Item'}</p>
            </div>

            <div className="border-hairline bg-surface space-y-3 rounded-xl border p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="text-flame mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Held until you confirm</p>
                  <p className="text-paper-dim mt-1 text-[13px] leading-relaxed">
                    ReWyse holds this until you have the item and say it&rsquo;s what was
                    described. Only then does the seller get paid.
                  </p>
                </div>
              </div>
            </div>

            <dl className="text-paper-dim space-y-2 text-[13px]">
              <div className="flex justify-between">
                <dt>Reference</dt>
                <dd className="text-paper font-mono text-xs">{payment.gateway_reference}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Method</dt>
                <dd className="text-paper">UPI · Simulated</dd>
              </div>
            </dl>

            <GatewayForm paymentId={payment.id} amount={payment.amount} />
          </div>
        </div>

        <p className="text-paper-faint mt-5 text-center text-xs leading-relaxed">
          During the pilot, ReWyse is testing whether this flow feels trustworthy — not processing
          payments. Handover still happens in person, on campus.
        </p>
      </div>
    </main>
  );
}
