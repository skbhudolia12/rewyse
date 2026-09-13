import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui';
import { ListingCard } from '@/components/listing-card';
import { requireVerified } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getFeedListings } from '@/lib/listings/queries';

export const dynamic = 'force-dynamic';

/**
 * Public seller card.
 *
 * Deliberately thin: name, campus, trust score, and what they have for sale.
 * A buyer deciding whether to meet a stranger on campus needs those four
 * things; a hostel name and a move-out date are the seller's to share in chat,
 * not the directory's to publish.
 */
export default async function PublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireVerified();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, trust_score, verified_status, campus:campuses(name, abbreviation)')
    .eq('id', id)
    .maybeSingle();

  // RLS limits this to the viewer's own cluster, so a miss is the right answer.
  if (!profile) notFound();

  const campus = profile.campus as unknown as { name: string; abbreviation: string } | null;
  const all = await getFeedListings({ limit: 48 });
  const theirs = all.filter((l) => l.campusAbbr === campus?.abbreviation);

  const { data: sellerListings } = await supabase
    .from('listings')
    .select('id')
    .eq('seller_id', id)
    .eq('status', 'active');
  const ids = new Set((sellerListings ?? []).map((l) => l.id));
  const listings = theirs.filter((l) => ids.has(l.id));

  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 px-5 py-8 md:px-10">
      <Card className="flex items-center gap-5">
        <div className="bg-paper text-ink flex size-16 shrink-0 items-center justify-center rounded-full text-2xl font-bold">
          {profile.full_name[0]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold">{profile.full_name}</h1>
            {profile.verified_status === 'verified' && (
              <CheckCircle2 className="text-verify size-4 shrink-0" />
            )}
          </div>
          <p className="text-paper-dim mt-1 text-[13px]">{campus?.name}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-2xl">{profile.trust_score}%</p>
          <p className="text-paper-dim text-[11px]">campus trust</p>
        </div>
      </Card>

      <section className="space-y-5">
        <h2 className="font-display text-2xl">
          {listings.length === 0
            ? 'Nothing listed right now'
            : `${listings.length} ${listings.length === 1 ? 'item' : 'items'} for sale`}
        </h2>
        {listings.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}
      </section>

      <Link href="/home" className="text-paper-dim hover:text-paper block text-center text-sm">
        Back to browsing
      </Link>
    </main>
  );
}
