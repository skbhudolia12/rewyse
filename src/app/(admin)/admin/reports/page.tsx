import { Card, PageHeader } from '@/components/ui';
import { requireAdmin } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { REPORTS_QUEUE_SELECT } from '@/lib/admin/queries';
import { ReportRow, type QueuedReport } from './report-row';

export const dynamic = 'force-dynamic';

export default async function ReportsQueuePage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('reports')
    .select(REPORTS_QUEUE_SELECT)
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (data ?? []) as unknown as QueuedReport[];
  const open = rows.filter((r) => r.status === 'open');
  const closed = rows.filter((r) => r.status !== 'open');

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-5 py-10">
      <PageHeader
        eyebrow="Safety"
        title="Reports"
        subtitle="Flagged listings, users and conversations."
      />

      {error && (
        <Card>
          <p className="text-danger text-sm">Could not load reports: {error.message}</p>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-xl">Open</h2>
        {open.length === 0 ? (
          <Card>
            <p className="text-paper-dim text-sm">Nothing waiting.</p>
          </Card>
        ) : (
          open.map((r) => <ReportRow key={r.id} report={r} readOnly={false} />)
        )}
      </section>

      {closed.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-xl">Resolved</h2>
          {closed.slice(0, 20).map((r) => (
            <ReportRow key={r.id} report={r} readOnly />
          ))}
        </section>
      )}
    </main>
  );
}
