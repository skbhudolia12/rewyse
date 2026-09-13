'use client';

import { useActionState, useState } from 'react';
import { resolveReport, type ReportActionState } from '@/lib/admin/report-actions';
import { Alert, Badge, Button, Card, Input } from '@/components/ui';

export interface QueuedReport {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  status: string;
  created_at: string;
  action_taken: string | null;
  reporter: { full_name: string; email: string } | null;
}

export function ReportRow({ report, readOnly }: { report: QueuedReport; readOnly: boolean }) {
  const [state, formAction] = useActionState<ReportActionState, FormData>(resolveReport, {});
  const [actioning, setActioning] = useState(false);

  if (state.message) {
    return (
      <Card>
        <Alert tone="success">{state.message}</Alert>
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge tone="neutral">{report.target_type}</Badge>
            {report.status === 'actioned' && <Badge tone="danger">Actioned</Badge>}
            {report.status === 'dismissed' && <Badge tone="neutral">Dismissed</Badge>}
          </div>
          <p className="mt-2.5 text-sm leading-relaxed">{report.reason}</p>
          <p className="text-paper-faint mt-2 text-[12px]">
            from {report.reporter?.full_name ?? 'unknown'} ·{' '}
            {new Date(report.created_at).toLocaleDateString('en-IN')}
          </p>
          <p className="text-paper-faint mt-1 font-mono text-[11px]">{report.target_id}</p>
        </div>
      </div>

      {report.action_taken && (
        <p className="text-paper-dim border-hairline border-l-2 pl-3 text-[13px]">
          {report.action_taken}
        </p>
      )}

      {!readOnly && (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="reportId" value={report.id} />

          {actioning ? (
            <div className="space-y-2">
              <Input name="note" required autoFocus maxLength={300} placeholder="What did you do?" />
              <div className="flex gap-2">
                <Button type="submit" name="decision" value="actioned" variant="danger" className="flex-1">
                  Confirm action
                </Button>
                <Button type="button" variant="ghost" onClick={() => setActioning(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button type="button" variant="danger" className="flex-1" onClick={() => setActioning(true)}>
                Action it
              </Button>
              <Button type="submit" name="decision" value="dismissed" variant="secondary" className="flex-1">
                Dismiss
              </Button>
            </div>
          )}

          <p className="text-paper-faint text-[12px]">
            Only an actioned report counts against the reported account&rsquo;s trust score.
            Dismissing costs them nothing.
          </p>

          {state.error && <Alert tone="error">{state.error}</Alert>}
        </form>
      )}
    </Card>
  );
}
