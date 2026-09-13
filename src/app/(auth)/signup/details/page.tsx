import { redirect } from 'next/navigation';
import { DetailsForm } from './details-form';
import { PageHeader } from '@/components/ui';
import { getProfile, requireUser } from '@/lib/auth/session';

export default async function SignupDetailsPage() {
  const user = await requireUser();

  // Only send them onward once an ID has actually been queued for review.
  // A profile alone is not "finished signup" -- an interrupted attempt leaves
  // one behind, and bouncing on it strands the student on a pending screen
  // that nothing will ever resolve.
  const profile = await getProfile();
  if (profile && profile.id_review_status !== 'not_submitted') redirect('/verify');

  return (
    <div className="space-y-8">
      <PageHeader
        title="Almost there"
        subtitle="A few details, then we verify your student ID."
      />
      <DetailsForm email={user.email ?? ''} />
    </div>
  );
}
