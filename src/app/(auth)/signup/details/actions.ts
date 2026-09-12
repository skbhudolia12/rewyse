'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { resolveCampusForEmail, type CampusDomain } from '@/lib/auth/campus-email';

export interface DetailsFormState {
  error?: string;
}

const schema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Enter your full name.')
    .max(80, 'That name is too long.'),
  hostel: z.string().trim().max(80).optional(),
  moveoutDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose your move-out date.')
    .refine((value) => {
      const date = new Date(`${value}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return false;
      // A move-out date more than two years out is a typo, not a plan, and it
      // would park the pricing engine at its ceiling indefinitely.
      const twoYears = Date.now() + 730 * 86_400_000;
      return date.getTime() <= twoYears;
    }, 'That date is too far away. Check the year.'),
  documentPath: z
    .string()
    .min(1, 'Upload a photo of your student ID.')
    .max(300),
});

/**
 * Completes signup: creates the profile and queues the ID for review.
 *
 * The campus is resolved server-side from the authenticated email address and
 * never read from the form. A client-supplied campus_id would let a DTU student
 * enrol themselves at IIIT Delhi, which is the entire trust boundary of a
 * cluster-scoped marketplace.
 */
export async function completeSignup(
  _prev: DetailsFormState,
  formData: FormData,
): Promise<DetailsFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect('/login');

  const parsed = schema.safeParse({
    fullName: formData.get('fullName'),
    hostel: formData.get('hostel') || undefined,
    moveoutDate: formData.get('moveoutDate'),
    documentPath: formData.get('documentPath'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' };
  }
  const input = parsed.data;

  // Enforce that the uploaded path really is this user's folder. The storage
  // policy already enforces it on write, but the path also lands in our own
  // table and must not be attacker-chosen.
  if (!input.documentPath.startsWith(`${user.id}/`)) {
    return { error: 'That upload could not be verified. Please try again.' };
  }

  const admin = createAdminClient();
  const { data: domains } = await admin.from('campus_domains').select('campus_id, domain');
  const campusId = resolveCampusForEmail(user.email, (domains ?? []) as CampusDomain[]);

  if (!campusId) {
    return { error: 'Your email is not on a recognised campus. Contact the ReWyse team.' };
  }

  const { error: profileError } = await supabase.from('profiles').insert({
    id: user.id,
    full_name: input.fullName,
    email: user.email.toLowerCase(),
    campus_id: campusId,
    hostel_or_hall: input.hostel ?? null,
    moveout_date: input.moveoutDate,
  });

  if (profileError) {
    if (profileError.code === '23505') redirect('/verify'); // already signed up
    return { error: `Could not save your details: ${profileError.message}` };
  }

  // email_domain_ok is gate A, and it is only true because the user proved
  // inbox access by following the emailed link to get here.
  const { error: gateError } = await admin
    .from('profiles')
    .update({ email_domain_ok: true })
    .eq('id', user.id);
  if (gateError) return { error: 'Could not confirm your campus email. Please try again.' };

  const { error: idError } = await supabase.from('id_verifications').insert({
    profile_id: user.id,
    document_path: input.documentPath,
    status: 'pending_review',
  });
  if (idError) return { error: `Could not submit your ID: ${idError.message}` };

  const { error: statusError } = await admin
    .from('profiles')
    .update({ id_review_status: 'pending_review' })
    .eq('id', user.id);
  if (statusError) return { error: 'Could not queue your ID for review. Please try again.' };

  redirect('/verify');
}
