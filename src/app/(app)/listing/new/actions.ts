'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireVerified } from '@/lib/auth/session';
import { getQuote, recordAskingPrice, type Quote } from '@/lib/pricing/service';
import { LISTING_CATEGORIES, FUNCTIONAL_STATUSES } from '@/types/domain';

export interface ListingFormState {
  error?: string;
}

const quoteInput = z.object({
  title: z.string().trim().min(2).max(120),
  category: z.enum(LISTING_CATEGORIES),
  functionalStatus: z.enum(FUNCTIONAL_STATUSES),
  cosmeticFlaws: z.string().trim().max(200).optional(),
  accessories: z.string().trim().max(200).optional(),
  moveoutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; error: string };

/**
 * Live quote for the pricing panel.
 *
 * Debounced on the client rather than throttled here, so a seller typing a
 * title does not spend one model request per keystroke against a free-tier
 * quota. The per-seller hourly cap in the service is the hard backstop.
 */
export async function quoteAction(raw: unknown): Promise<QuoteResult> {
  const profile = await requireVerified();
  const parsed = quoteInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Fill in the item details to get a price.' };
  }

  try {
    const quote = await getQuote({
      ...parsed.data,
      cosmeticFlaws: parsed.data.cosmeticFlaws ?? null,
      accessories: parsed.data.accessories ?? null,
      sellerId: profile.id,
    });
    return { ok: true, quote };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not price this item right now.',
    };
  }
}

const createInput = quoteInput.extend({
  description: z.string().trim().max(1200).optional(),
  askingPrice: z.coerce.number().int().min(0).max(500_000),
  media: z
    .array(
      z.object({
        path: z.string().min(1).max(300),
        kind: z.enum(['photo', 'video']),
        isLiveCapture: z.boolean(),
      }),
    )
    .min(1, 'Add at least one photo.')
    .max(6),
});

/**
 * Publishes a listing.
 *
 * Enforces two spec rules the UI also enforces, because the UI is not a
 * security boundary: at least one image must be an in-app camera capture
 * rather than a gallery pick, and the campus comes from the seller's profile
 * rather than the form.
 */
export async function createListingAction(
  _prev: ListingFormState,
  formData: FormData,
): Promise<ListingFormState> {
  const profile = await requireVerified();

  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get('payload') ?? ''));
  } catch {
    return { error: 'Something went wrong submitting the form. Try again.' };
  }

  const parsed = createInput.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' };
  }
  const input = parsed.data;

  if (!input.media.some((m) => m.kind === 'photo' && m.isLiveCapture)) {
    return { error: 'At least one photo must be taken in the app, not picked from your gallery.' };
  }

  // The storage policy already scopes uploads to the seller's own folder; this
  // stops a forged path from being recorded against the listing.
  if (input.media.some((m) => !m.path.startsWith(`${profile.id}/`))) {
    return { error: 'Those uploads could not be verified. Try adding the photos again.' };
  }

  const supabase = await createClient();

  const quote = await getQuote({
    title: input.title,
    category: input.category,
    functionalStatus: input.functionalStatus,
    cosmeticFlaws: input.cosmeticFlaws ?? null,
    accessories: input.accessories ?? null,
    moveoutDate: input.moveoutDate,
    sellerId: profile.id,
  });

  const { data: listing, error } = await supabase
    .from('listings')
    .insert({
      seller_id: profile.id,
      campus_id: profile.campus_id,
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      functional_status: input.functionalStatus,
      cosmetic_flaws: input.cosmeticFlaws ?? null,
      accessories_included: input.accessories ?? null,
      moveout_date: input.moveoutDate,
      suggested_price_min: quote.fairMin,
      suggested_price_max: quote.fairMax,
      suggested_sell_fast_price: quote.sellFastPrice,
      asking_price: input.askingPrice,
      status: 'active',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !listing) {
    return { error: `Could not publish the listing: ${error?.message ?? 'unknown error'}` };
  }

  const { error: mediaError } = await supabase.from('listing_media').insert(
    input.media.map((m, i) => ({
      listing_id: listing.id,
      kind: m.kind,
      storage_path: m.path,
      is_live_capture: m.isLiveCapture,
      position: i,
    })),
  );

  if (mediaError) {
    return { error: `Listing saved but photos failed: ${mediaError.message}` };
  }

  // Closes the loop on the hypothesis: what was suggested, and what was chosen.
  await recordAskingPrice(listing.id, input.askingPrice, quote);

  redirect(`/listing/${listing.id}?published=1`);
}
