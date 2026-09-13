import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { requireVerified } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { EditForm, type EditableListing } from './edit-form';

export const dynamic = 'force-dynamic';

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireVerified();
  const supabase = await createClient();

  const { data: listing } = await supabase
    .from('listings')
    .select(
      'id, seller_id, title, category, functional_status, cosmetic_flaws, accessories_included, description, moveout_date, asking_price, status',
    )
    .eq('id', id)
    .maybeSingle();

  if (!listing) notFound();
  if (listing.seller_id !== me.id) redirect(`/listing/${id}`);

  return (
    <main className="mx-auto w-full max-w-xl space-y-8 px-5 py-8">
      <PageHeader eyebrow="Your listing" title="Edit" subtitle={listing.title} />
      <EditForm listing={listing as unknown as EditableListing} />
    </main>
  );
}
