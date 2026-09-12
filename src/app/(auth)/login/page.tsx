import { SignInForm } from '../sign-in-form';
import { PageHeader } from '@/components/ui';
import { getAllowedDomainHint } from '@/lib/auth/domains';

/**
 * The campus allow-list is data, not code. Revalidate hourly so adding a campus
 * shows up without a redeploy, while still avoiding a database round trip on
 * every visit to a page that is otherwise static.
 */
export const revalidate = 3600;

export default async function LoginPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Welcome back" subtitle="Sign in with your college email." />
      <SignInForm submitLabel="Send sign-in link" domainHint={await getAllowedDomainHint()} />
    </div>
  );
}
