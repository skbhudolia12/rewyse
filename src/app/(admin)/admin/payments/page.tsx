import { Card, PageHeader } from '@/components/ui';
import { requireAdmin } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { PaymentRow, type HeldPayment } from './payment-row';

export const dynamic = 'force-dynamic';

/**
 * The escrow desk.
 *
 * Ordered so the work is obvious: payments the buyer has already confirmed sit
 * at the top, because those are the ones where a student is waiting to be paid
 * and every hour of delay is a person wondering where their money is.
 */
export default async function PaymentsQueuePage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('payments')
    .select(
      `id, amount, status, gateway_reference, buyer_confirmed_at, created_at, admin_note,
       listing:listings(title),
       buyer:profiles!payments_buyer_id_fkey(full_name, email),
       seller:profiles!payments_seller_id_fkey(full_name, email)`,
    )
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (data ?? []) as unknown as Array<
    HeldPayment & { status: string; buyer_confirmed_at: string | null }
  >;

  const awaitingRelease = rows.filter((p) => p.status === 'held' && p.buyer_confirmed_at);
  const inHold = rows.filter((p) => p.status === 'held' && !p.buyer_confirmed_at);
  const settled = rows.filter((p) => p.status !== 'held');

  const heldTotal = rows
    .filter((p) => p.status === 'held')
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-5 py-10">
      <PageHeader
        eyebrow="Escrow desk"
        title="Payments"
        subtitle="Simulated throughout the pilot — releasing here moves no real money."
      />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Awaiting release" value={String(awaitingRelease.length)} urgent />
        <Stat label="In hold" value={String(inHold.length)} />
        <Stat label="Value held" value={`₹${heldTotal.toLocaleString('en-IN')}`} />
      </div>

      {error && (
        <Card>
          <p className="text-danger text-sm">Could not load payments: {error.message}</p>
        </Card>
      )}

      <Section
        title="Buyer confirmed — ready to release"
        empty="Nothing waiting on you."
        rows={awaitingRelease}
      />
      <Section
        title="Held, buyer has not confirmed yet"
        empty="No payments currently in hold."
        rows={inHold}
      />
      <Section title="Settled" empty="Nothing settled yet." rows={settled.slice(0, 20)} readOnly />
    </main>
  );
}

function Section({
  title,
  empty,
  rows,
  readOnly,
}: {
  title: string;
  empty: string;
  rows: Array<HeldPayment & { status: string; buyer_confirmed_at: string | null }>;
  readOnly?: boolean;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl">{title}</h2>
      {rows.length === 0 ? (
        <Card>
          <p className="text-paper-dim text-sm">{empty}</p>
        </Card>
      ) : (
        rows.map((p) => <PaymentRow key={p.id} payment={p} readOnly={readOnly ?? false} />)
      )}
    </section>
  );
}

function Stat({ label, value, urgent }: { label: string; value: string; urgent?: boolean }) {
  return (
    <div className="border-hairline bg-surface rounded-xl border p-4">
      <p className={`font-display text-2xl ${urgent && value !== '0' ? 'text-flame' : ''}`}>
        {value}
      </p>
      <p className="text-paper-dim mt-1 text-[11px] leading-tight">{label}</p>
    </div>
  );
}
