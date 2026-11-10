import { Alert, Card } from '@/components/ui';
import { requireAdmin } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { PAYMENTS_QUEUE_SELECT } from '@/lib/admin/queries';
import { formatINR } from '@/lib/utils';
import { DeskRow, type DeskPayment } from './payment-row';

export const dynamic = 'force-dynamic';

/**
 * Escrow and delivery desk.
 *
 * Ordered by who is waiting: confirmed orders first (a seller is waiting to be
 * paid), then deliveries in progress, then settled history.
 */
export default async function EscrowDeskPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('payments')
    .select(PAYMENTS_QUEUE_SELECT)
    .neq('status', 'initiated')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (data ?? []) as unknown as DeskPayment[];
  const held = rows.filter((p) => p.status === 'held');
  const ready = held.filter((p) => p.buyer_confirmed_at);
  const inDelivery = held.filter((p) => !p.buyer_confirmed_at);
  const settled = rows.filter((p) => p.status === 'released' || p.status === 'refunded');

  const inEscrow = held.reduce((sum, p) => sum + p.amount, 0);
  const paidOut = rows
    .filter((p) => p.status === 'released')
    .reduce((sum, p) => sum + p.item_amount, 0);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 md:px-8 md:py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Escrow and delivery</h1>
        <p className="text-paper-dim mt-1 text-sm">
          Move deliveries along as the partner reports them, then pay sellers once buyers confirm.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Held in escrow" value={formatINR(inEscrow)} />
        <Stat label="Ready to pay out" value={String(ready.length)} highlight={ready.length > 0} />
        <Stat label="In delivery" value={String(inDelivery.length)} />
        <Stat label="Paid to sellers" value={formatINR(paidOut)} />
      </dl>

      {error && <Alert tone="error">The orders didn&rsquo;t load: {error.message}</Alert>}

      <Section title="Ready to pay out" empty="No seller is waiting to be paid." rows={ready} />
      <Section title="In delivery" empty="No deliveries in progress." rows={inDelivery} />
      <Section title="Settled" empty="No settled orders yet." rows={settled.slice(0, 20)} />
    </main>
  );
}

function Section({ title, empty, rows }: { title: string; empty: string; rows: DeskPayment[] }) {
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">
        {title}
        {rows.length > 0 && <span className="text-paper-faint ml-2 font-normal">{rows.length}</span>}
      </h2>
      {rows.length === 0 ? (
        <Card className="text-paper-dim py-6 text-sm">{empty}</Card>
      ) : (
        <ul className="border-hairline divide-hairline divide-y overflow-hidden rounded-xl border">
          {rows.map((p) => (
            <DeskRow key={p.id} payment={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="border-hairline bg-ink-raised rounded-xl border px-4 py-3">
      <dt className="text-paper-dim text-xs">{label}</dt>
      <dd className={`mt-1 text-xl font-semibold tracking-tight ${highlight ? 'text-flame-bright' : ''}`}>{value}</dd>
    </div>
  );
}
