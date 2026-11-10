import { ListingWizard } from './listing-wizard';
import { requireVerified } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function NewListingPage() {
  const profile = await requireVerified();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Sell an item</h1>
      <p className="text-paper-dim mt-1.5 text-sm">
        Buyers on your cluster see it as soon as you publish. Delivery is handled for you.
      </p>
      <div className="mt-6">
        <ListingWizard defaultMoveout={profile.moveout_date} />
      </div>
    </main>
  );
}
