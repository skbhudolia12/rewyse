import Link from 'next/link';
import { Card } from '@/components/ui';
import { requireAdmin } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatINR } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Operations overview: how the business is doing, then what needs a person.
 *
 * Revenue counts only orders that were paid and not refunded. An abandoned
 * checkout never charged anyone, and a refunded one gave the money back.
 */
export default async function AdminHomePage() {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const [orders, boosts, ids, reports, listings] = await Promise.all([
    supabase
      .from('payments')
      .select('status, item_amount, convenience_fee, delivery_fee, buyer_confirmed_at')
      .in('status', ['held', 'released']),
    supabase.from('boosts').select('amount, ends_at'),
    supabase.from('id_verifications').select('id').eq('status', 'pending_review'),
    supabase.from('reports').select('id').eq('status', 'open'),
    supabase.from('listings').select('id').eq('status', 'active'),
  ]);

  const paid = orders.data ?? [];
  const sum = (xs: Array<Record<string, unknown>>, key: string) =>
    xs.reduce((total, x) => total + Number(x[key] ?? 0), 0);

  const convenience = sum(paid, 'convenience_fee');
  const delivery = sum(paid, 'delivery_fee');
  const boostRevenue = sum(boosts.data ?? [], 'amount');
  const gmv = sum(paid, 'item_amount');
  const now = new Date().getTime();
  const liveBoosts = (boosts.data ?? []).filter((b) => new Date(b.ends_at as string).getTime() > now).length;
  const readyToPay = paid.filter((p) => p.status === 'held' && p.buyer_confirmed_at).length;
  const inDelivery = paid.filter((p) => p.status === 'held' && !p.buyer_confirmed_at).length;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 md:px-8 md:py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Good to see you, {admin.full_name.split(' ')[0]}</h1>
        <p className="text-paper-dim mt-1 text-sm">How the marketplace is doing, and what needs you.</p>
      </div>

      <section aria-labelledby="revenue-heading" className="border-hairline bg-ink-raised rounded-xl border p-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="revenue-heading" className="text-paper-dim text-sm">
              ReWyse revenue
            </h2>
            <p className="mt-1 text-[40px] leading-none font-semibold tracking-tight">
              {formatINR(convenience + delivery + boostRevenue)}
            </p>
          </div>
          <p className="text-paper-dim text-sm">
            on {formatINR(gmv)} of items sold across {paid.length} {paid.length === 1 ? 'order' : 'orders'}
          </p>
        </div>
        <dl className="mt-6 grid gap-3 sm:grid-cols-3">
          <Revenue label="Convenience fees" value={convenience} note="3–5% of each order, paid by buyers" />
          <Revenue label="Delivery fees" value={delivery} note="Charged per order for partner delivery" />
          <Revenue label="Listing boosts" value={boostRevenue} note={`${liveBoosts} running now, paid by sellers`} />
        </dl>
      </section>

      <section aria-labelledby="queue-heading">
        <h2 id="queue-heading" className="mb-3 font-semibold">
          Needs attention
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Queue href="/admin/payments" label="Sellers to pay" count={readyToPay} />
          <Queue href="/admin/payments" label="Deliveries in progress" count={inDelivery} calm />
          <Queue href="/admin/verifications" label="ID checks waiting" count={ids.data?.length ?? 0} />
          <Queue href="/admin/reports" label="Open reports" count={reports.data?.length ?? 0} />
        </div>
        <p className="text-paper-faint mt-3 text-[13px]">{listings.data?.length ?? 0} listings live across the cluster.</p>
      </section>
    </main>
  );
}

function Revenue({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="border-hairline rounded-lg border px-4 py-3">
      <dt className="text-paper-dim text-xs">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tracking-tight">{formatINR(value)}</dd>
      <p className="text-paper-faint mt-1 text-xs">{note}</p>
    </div>
  );
}

function Queue({ href, label, count, calm }: { href: string; label: string; count: number; calm?: boolean }) {
  const urgent = count > 0 && !calm;
  return (
    <Link href={href}>
      <Card className="hover:border-hairline-strong h-full transition">
        <p className={`text-3xl font-semibold tracking-tight ${urgent ? 'text-flame-bright' : ''}`}>{count}</p>
        <p className="text-paper-dim mt-1 text-sm">{label}</p>
      </Card>
    </Link>
  );
}
