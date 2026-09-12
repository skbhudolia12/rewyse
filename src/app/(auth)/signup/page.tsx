import { SignInForm } from '../sign-in-form';
import { PageHeader } from '@/components/ui';
import { getAllowedDomainHint } from '@/lib/auth/domains';

/**
 * The campus allow-list is data, not code. Revalidate hourly so adding a campus
 * shows up without a redeploy, while still avoiding a database round trip on
 * every visit to a page that is otherwise static.
 */
export const revalidate = 3600;

export default async function SignupPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Join ReWyse"
        subtitle="Start with your college email. We verify every student before they can buy or sell."
      />
      <SignInForm submitLabel="Continue" domainHint={await getAllowedDomainHint()} />
    </div>
  );
}
