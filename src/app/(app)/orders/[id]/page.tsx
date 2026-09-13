import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2, Clock, MapPin, Wallet } from 'lucide-react';
import { Alert, Badge, Button, Card, PageHeader } from '@/components/ui';
import { requireVerified } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatINR } from '@/lib/utils';
import { ConfirmReceiptForm } from './confirm-form';

export const dynamic = 'force-dynamic';

/**
 * The buyer's view of a held payment.
 *
 * The whole trust mechanism is one sentence here: the seller is not paid until
 * the buyer says the item is what was described. Everything on this page exists
 * to make that legible, and to make the "simulated" part impossible to miss.
 */
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
      `*, listing:listings(id, title, campus_id), seller:profiles!payments_seller_id_fkey(full_name)`,
    )
    .eq('id', id)
    .maybeSingle();

  if (!payment) notFound();

  const isBuyer = payment.buyer_id === viewer.id;
  const listing = payment.listing as unknown as { id: string; title: string } | null;
  const seller = payment.seller as unknown as { full_name: string } | null;

  const { data: meetup } = await supabase
    .from('safe_meetup_points')
    .select('name')
    .eq('campus_id', (payment.listing as unknown as { campus_id: string } | null)?.campus_id ?? '')
    .eq('active', true)
    .limit(1);

  const steps = [
    { done: true, label: 'Payment held by ReWyse', detail: payment.gateway_reference },
    {
      done: payment.buyer_confirmed_at !== null,
      label: 'Buyer confirms the item',
      detail: payment.buyer_confirmed_at
        ? 'Confirmed'
        : 'Meet the seller, check the item, then confirm below',
    },
    {
      done: payment.status === 'released',
      label: 'Seller paid out',
      detail: payment.status === 'released' ? 'Released' : 'Waiting on your confirmation',
    },
  ];

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-5 py-10">
      <div className="rounded-xl border border-dashed border-amber-500/50 bg-amber-500/10 px-4 py-3">
        <p className="text-[13px] leading-relaxed text-amber-200/90">
          <span className="font-semibold text-amber-300">Simulated payment.</span> No money moved.
          This flow exists so you can tell us whether it feels trustworthy.
        </p>
      </div>

      {paid && (
        <Alert tone="success" title="Payment held">
          The seller can see the item is reserved. Arrange a handover, check it, then confirm.
        </Alert>
      )}

      <PageHeader
        eyebrow={isBuyer ? 'Your order' : 'Your sale'}
        title={listing?.title ?? 'Item'}
        subtitle={
          isBuyer
            ? `Held with ReWyse until you confirm you received it from ${seller?.full_name ?? 'the seller'}.`
            : 'The buyer has paid. Funds are released once they confirm they have the item.'
        }
      />

      <Card className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-paper-dim text-xs font-semibold tracking-[0.14em] uppercase">
              Amount held
            </p>
            <p className="font-display text-flame mt-2 text-4xl">{formatINR(payment.amount)}</p>
          </div>
          <StatusBadge status={payment.status} />
        </div>

        <ol className="space-y-4">
          {steps.map((step) => (
            <li key={step.label} className="flex gap-3.5">
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                  step.done ? 'bg-verify-soft text-verify' : 'bg-ink-raised text-paper-faint'
                }`}
              >
                {step.done ? <CheckCircle2 className="size-4" /> : <Clock className="size-4" />}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{step.label}</p>
                <p className="text-paper-dim truncate text-[13px]">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {meetup?.[0] && payment.status === 'held' && (
        <Card>
          <div className="text-paper-dim flex items-center gap-2.5 text-xs font-semibold tracking-[0.14em] uppercase">
            <MapPin className="text-flame size-4" />
            Where to meet
          </div>
          <p className="mt-3 font-semibold">{meetup[0].name}</p>
          <p className="text-paper-dim mt-2 text-[13px] leading-relaxed">
            Pre-approved, daylight hours, people around. Check the item before you confirm —
            confirming is what releases the money.
          </p>
        </Card>
      )}

      {isBuyer && payment.status === 'held' && !payment.buyer_confirmed_at && (
        <ConfirmReceiptForm paymentId={payment.id} />
      )}

      {isBuyer && payment.buyer_confirmed_at && payment.status === 'held' && (
        <Alert tone="info" title="Confirmed — thank you">
          A ReWyse admin will release the funds to the seller. During the pilot this is a person,
          not an automatic payout.
        </Alert>
      )}

      {payment.status === 'released' && (
        <Alert tone="success" title="Completed">
          Released to the seller. Simulated — no money moved.
        </Alert>
      )}

      {payment.status === 'refunded' && (
        <Alert tone="info" title="Refunded">
          {payment.admin_note ?? 'This payment was returned to the buyer.'}
        </Alert>
      )}

      {listing && (
        <Link href={`/listing/${listing.id}`} className="block">
          <Button variant="secondary" className="w-full">
            View the listing
          </Button>
        </Link>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'released') return <Badge tone="verify">Released</Badge>;
  if (status === 'refunded') return <Badge tone="neutral">Refunded</Badge>;
  if (status === 'held')
    return (
      <Badge tone="flame">
        <Wallet className="size-3" />
        In hold
      </Badge>
    );
  return <Badge tone="neutral">{status}</Badge>;
}
