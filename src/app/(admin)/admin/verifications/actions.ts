'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/session';

export interface ReviewState {
  error?: string;
  message?: string;
}

const schema = z.object({
  verificationId: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().max(300).optional(),
});

/**
 * Records an ID review decision and destroys the document.
 *
 * Retention policy in one function: the decision, the reviewer and the
 * timestamp are kept; the photograph is not. The trigger in 0002 nulls the
 * path on the row, and this deletes the object itself -- both are needed, since
 * a null column with a live file in the bucket is not deletion, it is just a
 * lost pointer to retained personal data.
 *
 * Runs through the caller's own session so the admin RLS policies are exercised
 * rather than bypassed.
 */
export async function reviewIdDocument(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const reviewer = await requireAdmin();

  const parsed = schema.safeParse({
    verificationId: formData.get('verificationId'),
    decision: formData.get('decision'),
    reason: formData.get('reason') || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid review submission.' };
  }
  const { verificationId, decision, reason } = parsed.data;

  if (decision === 'rejected' && !reason) {
    return { error: 'Give a reason when rejecting, so the student knows what to fix.' };
  }

  const supabase = await createClient();

  const { data: record, error: readError } = await supabase
    .from('id_verifications')
    .select('id, profile_id, document_path, status')
    .eq('id', verificationId)
    .single();

  if (readError || !record) return { error: 'That review could not be found.' };
  if (record.status !== 'pending_review') {
    return { error: 'That ID has already been reviewed.' };
  }

  const documentPath = record.document_path;

  const { error: updateError } = await supabase
    .from('id_verifications')
    .update({
      status: decision,
      reviewed_by: reviewer.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason ?? null,
    })
    .eq('id', verificationId);

  if (updateError) return { error: `Could not record the decision: ${updateError.message}` };

  // Only after the decision is durably recorded. Deleting first would risk
  // destroying the evidence and then failing to record why.
  if (documentPath) {
    const { error: deleteError } = await supabase.storage
      .from('id-documents')
      .remove([documentPath]);
    if (deleteError) {
      // The decision stands; flag the orphaned file rather than failing the
      // review and leaving the student stuck in the queue.
      return {
        message: `Recorded, but the ID image could not be deleted (${deleteError.message}). Remove ${documentPath} manually.`,
      };
    }
  }

  revalidatePath('/admin/verifications');
  return { message: decision === 'approved' ? 'Student verified.' : 'Rejected and notified.' };
}
