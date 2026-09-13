'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/session';

export interface ReportActionState {
  error?: string;
  message?: string;
}

const input = z.object({
  reportId: z.string().uuid(),
  decision: z.enum(['actioned', 'dismissed']),
  note: z.string().trim().max(300).optional(),
});

/**
 * Resolves a report.
 *
 * Only an actioned report counts against a trust score (see recompute in 0002),
 * so dismissing a bad-faith report costs the reported student nothing. That is
 * deliberate: a raw report count would let any student tank a rival's score by
 * filing them.
 */
export async function resolveReport(
  _prev: ReportActionState,
  formData: FormData,
): Promise<ReportActionState> {
  const admin = await requireAdmin();

  const parsed = input.safeParse({
    reportId: formData.get('reportId'),
    decision: formData.get('decision'),
    note: formData.get('note') || undefined,
  });
  if (!parsed.success) return { error: 'Invalid decision.' };

  if (parsed.data.decision === 'actioned' && !parsed.data.note) {
    return { error: 'Say what you did, so there is a record of it.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('reports')
    .update({
      status: parsed.data.decision,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      action_taken: parsed.data.note ?? null,
    })
    .eq('id', parsed.data.reportId);

  if (error) return { error: `Could not record that: ${error.message}` };

  revalidatePath('/admin/reports');
  return {
    message:
      parsed.data.decision === 'actioned'
        ? 'Actioned. This counts against the reported account.'
        : 'Dismissed. Nothing counts against the reported account.',
  };
}
