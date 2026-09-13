import Link from 'next/link';
import { IdCard, Wallet, Flag, Tag } from 'lucide-react';
import { Card, PageHeader } from '@/components/ui';
import { requireAdmin } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Admin home. Each tile shows the count that decides whether it needs opening,
 * so the queue that is backing up is visible without clicking into all of them.
 */
export default async function AdminHomePage() {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const [ids, payments, reports, listings] = await Promise.all([
    supabase.from('id_verifications').select('id').eq('status', 'pending_review'),
    supabase.from('payments').select('id, buyer_confirmed_at').eq('status', 'held'),
    supabase.from('reports').select('id').eq('status', 'open'),
    supabase.from('listings').select('id').eq('status', 'active'),
  ]);

  const awaitingRelease = (payments.data ?? []).filter((p) => p.buyer_confirmed_at).length;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-5 py-10">
      <PageHeader
        eyebrow="Admin"
        title={`Hi, ${admin.full_name.split(' ')[0]}`}
        subtitle="Everything that needs a person."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Tile
          href="/admin/verifications"
          icon={<IdCard className="size-5" />}
          title="ID verifications"
          count={ids.data?.length ?? 0}
          urgentAbove={0}
          caption="Students waiting to be let in"
        />
        <Tile
          href="/admin/payments"
          icon={<Wallet className="size-5" />}
          title="Escrow desk"
          count={awaitingRelease}
          urgentAbove={0}
          caption={`${payments.data?.length ?? 0} in hold · ${awaitingRelease} ready to release`}
        />
        <Tile
          href="/admin/payments"
          icon={<Flag className="size-5" />}
          title="Reports"
          count={reports.data?.length ?? 0}
          urgentAbove={0}
          caption="Flagged listings and threads"
          disabled
        />
        <Tile
          href="/home"
          icon={<Tag className="size-5" />}
          title="Live listings"
          count={listings.data?.length ?? 0}
          urgentAbove={Number.POSITIVE_INFINITY}
          caption="Active across the cluster"
        />
      </div>

      <Card>
        <p className="text-sm font-semibold">Payments are simulated</p>
        <p className="text-paper-dim mt-1.5 text-[13px] leading-relaxed">
          Releasing or refunding on the escrow desk records a decision and updates the listing. No
          real money moves, and the flow is built so a licensed payment provider can replace the
          simulation without a rewrite.
        </p>
      </Card>
    </main>
  );
}

function Tile({
  href,
  icon,
  title,
  count,
  caption,
  urgentAbove,
  disabled,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  count: number;
  caption: string;
  urgentAbove: number;
  disabled?: boolean;
}) {
  const urgent = count > urgentAbove;
  const body = (
    <Card className={`h-full transition ${disabled ? 'opacity-50' : 'hover:border-flame-edge'}`}>
      <div className="flex items-start justify-between">
        <span className={urgent ? 'text-flame' : 'text-paper-dim'}>{icon}</span>
        <span className={`font-display text-3xl ${urgent ? 'text-flame' : ''}`}>{count}</span>
      </div>
      <p className="mt-4 font-semibold">{title}</p>
      <p className="text-paper-dim mt-1 text-[13px]">{disabled ? 'Phase 4' : caption}</p>
    </Card>
  );
  return disabled ? <div>{body}</div> : <Link href={href}>{body}</Link>;
}
