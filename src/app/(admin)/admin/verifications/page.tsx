import { ReviewCard, type PendingReview } from './review-card';
import { Card, PageHeader } from '@/components/ui';
import { requireAdmin } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

/** Signed URLs are short-lived: an ID photo link must not outlive the review. */
const SIGNED_URL_TTL_SECONDS = 600;

export const dynamic = 'force-dynamic';

interface QueueRow {
  id: string;
  submitted_at: string;
  document_path: string | null;
  profiles: {
    full_name: string;
    email: string;
    hostel_or_hall: string | null;
    campuses: { abbreviation: string } | null;
  } | null;
}

export default async function VerificationQueuePage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('id_verifications')
    .select(
      'id, submitted_at, document_path, profiles!inner(full_name, email, hostel_or_hall, campuses(abbreviation))',
    )
    .eq('status', 'pending_review')
    .order('submitted_at', { ascending: true });

  const rows = (data ?? []) as unknown as QueueRow[];

  const reviews: PendingReview[] = await Promise.all(
    rows.map(async (row) => {
      let documentUrl: string | null = null;
      if (row.document_path) {
        const { data: signed } = await supabase.storage
          .from('id-documents')
          .createSignedUrl(row.document_path, SIGNED_URL_TTL_SECONDS);
        documentUrl = signed?.signedUrl ?? null;
      }
      return {
        id: row.id,
        submittedAt: row.submitted_at,
        fullName: row.profiles?.full_name ?? 'Unknown',
        email: row.profiles?.email ?? '',
        campus: row.profiles?.campuses?.abbreviation ?? '—',
        hostel: row.profiles?.hostel_or_hall ?? null,
        documentUrl,
      };
    }),
  );

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-5 py-8 pb-safe">
      <PageHeader
        title="ID verification queue"
        subtitle={
          reviews.length === 0
            ? 'Nothing waiting.'
            : `${reviews.length} student${reviews.length === 1 ? '' : 's'} waiting. Oldest first.`
        }
      />

      {error && (
        <Card>
          <p className="text-sm text-danger">Could not load the queue: {error.message}</p>
        </Card>
      )}

      {reviews.length === 0 && !error ? (
        <Card>
          <p className="text-sm text-paper-dim">
            The queue is empty. Every student who has signed up has been reviewed.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}

      <p className="text-xs text-paper-dim">
        Every signup lands here. If this queue grows faster than it is cleared, it becomes the
        limit on the pilot&rsquo;s growth — not the product.
      </p>
    </main>
  );
}
