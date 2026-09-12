import { redirect } from 'next/navigation';
import { DetailsForm } from './details-form';
import { PageHeader } from '@/components/ui';
import { getProfile, requireUser } from '@/lib/auth/session';

export default async function SignupDetailsPage() {
  const user = await requireUser();

  // Someone who already finished signup does not need to fill it in again.
  if (await getProfile()) redirect('/verify');

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
