'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireVerified } from '@/lib/auth/session';
import { getQuote, recordAskingPrice } from '@/lib/pricing/service';
import { FUNCTIONAL_STATUSES, LISTING_CATEGORIES } from '@/types/domain';

export interface ListingActionState {
  error?: string;
  message?: string;
}

/**
 * Re-runs the pricing engine against today's days-remaining.
 *
 * This is the second, independent data point on the pilot's hypothesis: not
 * only whether a seller accepts the sell-fast price when they first list, but
 * whether they accept it again as the deadline closes in and the number drops.
 * Logged with `is_repricing` so the two can be told apart.
 *
 * Cheap to run: the base value is already cached under the item's identity, and
 * urgency is local arithmetic, so this costs no model quota.
 */
export async function repriceListing(
  _prev: ListingActionState,
  formData: FormData,
): Promise<ListingActionState> {
  const me = await requireVerified();
  const listingId = z.string().uuid().safeParse(formData.get('listingId'));
  const accept = formData.get('accept') === '1';
  if (!listingId.success) return { error: 'That listing could not be found.' };

  const supabase = await createClient();
  const { data: listing } = await supabase
    .from('listings')
    .select(
      'id, seller_id, title, category, functional_status, cosmetic_flaws, accessories_included, moveout_date, asking_price, status',
    )
    .eq('id', listingId.data)
    .maybeSingle();

  if (!listing) return { error: 'That listing could not be found.' };
  if (listing.seller_id !== me.id) return { error: 'That is not your listing.' };
  if (listing.status !== 'active') return { error: 'Only an active listing can be repriced.' };

  const quote = await getQuote({
    title: listing.title,
    category: listing.category,
    functionalStatus: listing.functional_status,
    cosmeticFlaws: listing.cosmetic_flaws,
    accessories: listing.accessories_included,
    moveoutDate: listing.moveout_date,
    sellerId: me.id,
    listingId: listing.id,
    isRepricing: true,
  });

  // Two-step by design: show the number first, drop the price only when the
  // seller says so. Silently repricing someone's listing would be taking a
  // decision that is theirs.
  if (!accept) {
    return {
      message: JSON.stringify({
        sellFast: quote.sellFastPrice,
        fairMin: quote.fairMin,
        fairMax: quote.fairMax,
        days: quote.daysUntilMoveout,
        current: listing.asking_price,
      }),
    };
  }

  const { error } = await supabase
    .from('listings')
    .update({
      asking_price: quote.sellFastPrice,
      suggested_price_min: quote.fairMin,
      suggested_price_max: quote.fairMax,
      suggested_sell_fast_price: quote.sellFastPrice,
    })
    .eq('id', listing.id);

  if (error) return { error: `Could not update the price: ${error.message}` };

  await recordAskingPrice(listing.id, quote.sellFastPrice, quote);

  revalidatePath('/profile');
  revalidatePath(`/listing/${listing.id}`);
  return { message: 'ok' };
}

const editInput = z.object({
  listingId: z.string().uuid(),
  title: z.string().trim().min(2).max(120),
  category: z.enum(LISTING_CATEGORIES),
  functionalStatus: z.enum(FUNCTIONAL_STATUSES),
  cosmeticFlaws: z.string().trim().max(200).optional(),
  accessories: z.string().trim().max(200).optional(),
  description: z.string().trim().max(1200).optional(),
  moveoutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  askingPrice: z.coerce.number().int().min(0).max(500_000),
});

export async function updateListing(
  _prev: ListingActionState,
  formData: FormData,
): Promise<ListingActionState> {
  const me = await requireVerified();

  const parsed = editInput.safeParse({
    listingId: formData.get('listingId'),
    title: formData.get('title'),
    category: formData.get('category'),
    functionalStatus: formData.get('functionalStatus'),
    cosmeticFlaws: formData.get('cosmeticFlaws') || undefined,
    accessories: formData.get('accessories') || undefined,
    description: formData.get('description') || undefined,
    moveoutDate: formData.get('moveoutDate'),
    askingPrice: formData.get('askingPrice'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' };
  }
  const input = parsed.data;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('listings')
    .select('id, seller_id, status')
    .eq('id', input.listingId)
    .maybeSingle();

  if (!existing) return { error: 'That listing could not be found.' };
  if (existing.seller_id !== me.id) return { error: 'That is not your listing.' };
  if (existing.status === 'completed') return { error: 'A sold listing cannot be edited.' };

  const { error } = await supabase
    .from('listings')
    .update({
      title: input.title,
      category: input.category,
      functional_status: input.functionalStatus,
      cosmetic_flaws: input.cosmeticFlaws ?? null,
      accessories_included: input.accessories ?? null,
      description: input.description ?? null,
      moveout_date: input.moveoutDate,
      asking_price: input.askingPrice,
    })
    .eq('id', input.listingId);

  if (error) return { error: `Could not save: ${error.message}` };

  redirect(`/listing/${input.listingId}`);
}

/**
 * Takes a listing off the market.
 *
 * Soft-removes rather than deletes: the pricing_events and offers attached to
 * it are the pilot's measurements, and deleting the row would take a data point
 * out of the study every time someone changed their mind.
 */
export async function removeListing(
  _prev: ListingActionState,
  formData: FormData,
): Promise<ListingActionState> {
  const me = await requireVerified();
  const listingId = z.string().uuid().safeParse(formData.get('listingId'));
  if (!listingId.success) return { error: 'That listing could not be found.' };

  const supabase = await createClient();
  const { data: listing } = await supabase
    .from('listings')
    .select('id, seller_id, status')
    .eq('id', listingId.data)
    .maybeSingle();

  if (!listing) return { error: 'That listing could not be found.' };
  if (listing.seller_id !== me.id) return { error: 'That is not your listing.' };
  if (listing.status === 'pending_pickup') {
    return { error: 'Someone is mid-purchase. Cancel that first.' };
  }

  const { error } = await supabase
    .from('listings')
    .update({ status: 'removed' })
    .eq('id', listing.id);
  if (error) return { error: `Could not remove it: ${error.message}` };

  revalidatePath('/profile');
  redirect('/profile');
}
