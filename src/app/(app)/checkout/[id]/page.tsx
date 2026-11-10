import { notFound, redirect } from 'next/navigation';
import { requireVerified } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { deliveryEta, formatEta } from '@/lib/delivery';
import { CheckoutClient } from './checkout-client';

export const dynamic = 'force-dynamic';

const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Checkout: where it goes, what it costs, then the X-Pay gateway.
 *
 * Every amount shown here was set by the database when the order was created
 * (price_payment in 0009), so this page displays the charge rather than
 * computing one.
 */
export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const buyer = await requireVerified();
  const supabase = await createClient();

  const { data: payment } = await supabase
    .from('payments')
    .select(
      `id, amount, item_amount, convenience_fee, delivery_fee, status, gateway_reference, buyer_id,
       listing:listings(id, title, campus_id, campus:campuses(abbreviation), listing_media(storage_path, kind, position)),
       seller:profiles!payments_seller_id_fkey(full_name)`,
    )
    .eq('id', id)
    .maybeSingle();

  if (!payment || payment.buyer_id !== buyer.id) notFound();
  if (payment.status !== 'initiated') redirect(`/orders/${payment.id}`);

  const listing = payment.listing as unknown as {
    id: string;
    title: string;
    campus_id: string;
    campus: { abbreviation: string } | null;
    listing_media: Array<{ storage_path: string; kind: string; position: number }> | null;
  } | null;
  const seller = payment.seller as unknown as { full_name: string } | null;

  const cover = (listing?.listing_media ?? [])
    .filter((m) => m.kind === 'photo')
    .sort((a, b) => a.position - b.position)[0];
  let imageUrl: string | null = null;
  if (cover) {
    const { data } = await supabase.storage
      .from('listing-media')
      .createSignedUrl(cover.storage_path, SIGNED_URL_TTL_SECONDS);
    imageUrl = data?.signedUrl ?? null;
  }

  const sameCampus = listing?.campus_id === buyer.campus_id;

  return (
    <CheckoutClient
      order={{
        id: payment.id,
        reference: payment.gateway_reference,
        itemAmount: payment.item_amount,
        convenienceFee: payment.convenience_fee,
        deliveryFee: payment.delivery_fee,
        total: payment.amount,
      }}
      item={{
        listingId: listing?.id ?? '',
        title: listing?.title ?? 'Item',
        imageUrl,
        sellerName: seller?.full_name ?? 'Seller',
        fromCampus: listing?.campus?.abbreviation ?? '',
      }}
      buyer={{
        name: buyer.full_name,
        email: buyer.email,
        hostel: buyer.hostel_or_hall ?? '',
        campus: buyer.campus?.name ?? '',
      }}
      eta={formatEta(deliveryEta(new Date(), sameCampus))}
    />
  );
}
