import Link from 'next/link';
import { Card } from '@/components/ui';
import { requireVerified } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { cn, formatINR } from '@/lib/utils';
import { formatOrderTime, orderStage, STAGE_LABELS, type OrderStage } from '@/lib/orders';

export const dynamic = 'force-dynamic';

const SELECT = `id, buyer_id, seller_id, amount, item_amount, status, delivery_status, created_at,
  scheduled_at, picked_up_at, out_for_delivery_at, delivered_at, buyer_confirmed_at, released_at, refunded_at,
  listing:listings(title)`;

type Row = {
  id: string;
  buyer_id: string;
  amount: number;
  item_amount: number;
  status: string;
  delivery_status: string | null;
  created_at: string;
  scheduled_at: string | null;
  picked_up_at: string | null;
  out_for_delivery_at: string | null;
  delivered_at: string | null;
  buyer_confirmed_at: string | null;
  released_at: string | null;
  refunded_at: string | null;
  listing: { title: string } | null;
};

export default async function OrdersPage() {
  const me = await requireVerified();
  const supabase = await createClient();

  // Abandoned checkouts are not orders; they are left out of both lists.
  const { data } = await supabase
    .from('payments')
    .select(SELECT)
    .neq('status', 'initiated')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as unknown as Row[];
  const purchases = rows.filter((r) => r.buyer_id === me.id);
  const sales = rows.filter((r) => r.buyer_id !== me.id);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-10 px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
      <OrderList title="Your purchases" rows={purchases} amount={(r) => r.amount} empty="Items you buy show up here." />
      <OrderList
        title="Your sales"
        rows={sales}
        amount={(r) => r.item_amount}
        empty="When someone buys one of your listings, it shows up here."
      />
    </main>
  );
}

function OrderList({
  title,
  rows,
  amount,
  empty,
}: {
  title: string;
  rows: Row[];
  amount: (r: Row) => number;
  empty: string;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <Card className="text-paper-dim py-8 text-center text-sm">{empty}</Card>
      ) : (
        <ul className="border-hairline divide-hairline divide-y overflow-hidden rounded-xl border">
          {rows.map((r) => {
            const stage = orderStage(r);
            return (
              <li key={r.id}>
                <Link
                  href={`/orders/${r.id}`}
                  className="bg-ink-raised hover:bg-ink-elevated flex items-center justify-between gap-4 px-5 py-4 transition"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.listing?.title ?? 'Item'}</span>
                    <span className="text-paper-dim block text-[13px]">{formatOrderTime(r.created_at)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold">{formatINR(amount(r))}</span>
                    <StageChip stage={stage} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function StageChip({ stage }: { stage: OrderStage }) {
  return (
    <span
      className={cn(
        'mt-1 inline-block text-xs font-medium',
        stage === 'completed' ? 'text-verify' : stage === 'refunded' ? 'text-paper-dim' : 'text-flame-bright',
      )}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}
