import { ListingWizard } from './listing-wizard';
import { PageHeader } from '@/components/ui';
import { requireVerified } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function NewListingPage() {
  const profile = await requireVerified();

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 md:px-10">
      <PageHeader
        eyebrow="New listing"
        title="Sell something"
        subtitle="Three short steps. The price panel updates as you type."
      />
      <div className="mt-10">
        <ListingWizard defaultMoveout={profile.moveout_date} />
      </div>
    </main>
  );
}
