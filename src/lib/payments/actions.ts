'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireVerified, requireAdmin } from '@/lib/auth/session';

/**
 * Simulated escrow.
 *
 * NOTHING HERE MOVES REAL MONEY. There is no payment provider, no card, no
 * settlement. The purpose is to let pilot students walk the hold-and-release
 * journey so we learn whether it makes them trust the marketplace — which is
 * the actual question, and one that does not need real rupees to answer.
 *
 * The state machine is enforced in Postgres (guard_payment_transition), not
 * here: a buyer must not be able to release their own payment by calling an
 * action directly, and application code is not where that guarantee belongs.
 */

export interface PaymentActionState {
  error?: string;
  message?: string;
}

/** Buyer starts a purchase. Creates the record, then hands off to the gateway. */
export async function startCheckout(listingId: string): Promise<void> {
  const buyer = await requireVerified();
  const supabase = await createClient();

  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('id, seller_id, asking_price, status')
    .eq('id', listingId)
    .maybeSingle();

  if (listingError || !listing) redirect(`/listing/${listingId}?error=not_found`);
  if (listing.seller_id === buyer.id) redirect(`/listing/${listingId}?error=own_listing`);
  if (listing.status !== 'active') redirect(`/listing/${listingId}?error=unavailable`);

  // Resume rather than duplicate: a buyer who abandoned the gateway and came
  // back should land on the same payment, not create a second one.
  const { data: existing } = await supabase
    .from('payments')
    .select('id, status')
    .eq('listing_id', listingId)
    .eq('buyer_id', buyer.id)
    .in('status', ['initiated', 'held'])
    .maybeSingle();

  if (existing) {
    redirect(existing.status === 'held' ? `/orders/${existing.id}` : `/checkout/${existing.id}`);
  }

  // An accepted offer is the agreed price; the sticker price is only a
  // starting point. Charging the asking price after a negotiation would make
  // the whole offer flow decorative.
  const { data: accepted } = await supabase
    .from('offers')
    .select('amount')
    .eq('listing_id', listingId)
    .eq('buyer_id', buyer.id)
    .eq('status', 'accepted')
    .maybeSingle();

  const { data: payment, error } = await supabase
    .from('payments')
    .insert({
      listing_id: listing.id,
      buyer_id: buyer.id,
      seller_id: listing.seller_id,
      amount: accepted?.amount ?? listing.asking_price,
      status: 'initiated',
    })
    .select('id')
    .single();

  if (error || !payment) {
    // The partial unique index means "someone else is already buying this".
    redirect(`/listing/${listingId}?error=already_reserved`);
  }

  redirect(`/checkout/${payment.id}`);
}

/**
 * The simulated gateway "captures" the payment.
 *
 * In a real integration this is a webhook from the provider, never a button the
 * browser presses. It is a button here precisely because there is no provider.
 */
export async function simulateGatewayCapture(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const buyer = await requireVerified();
  const paymentId = z.string().uuid().safeParse(formData.get('paymentId'));
  if (!paymentId.success) return { error: 'That payment could not be found.' };

  const supabase = await createClient();
  const { data: payment } = await supabase
    .from('payments')
    .select('id, buyer_id, listing_id, status')
    .eq('id', paymentId.data)
    .maybeSingle();

  if (!payment || payment.buyer_id !== buyer.id) {
    return { error: 'That payment could not be found.' };
  }
  if (payment.status !== 'initiated') {
    redirect(`/orders/${payment.id}`);
  }

  const { error } = await supabase
    .from('payments')
    .update({ status: 'held' })
    .eq('id', payment.id);

  if (error) return { error: `The gateway declined: ${error.message}` };

  // Take the item off the market while it is in hold.
  await supabase
    .from('listings')
    .update({ status: 'pending_pickup' })
    .eq('id', payment.listing_id);

  redirect(`/orders/${payment.id}?paid=1`);
}

/**
 * Buyer confirms they have the item in hand. This is the green light the
 * release depends on -- the trigger refuses to release without it.
 */
export async function confirmReceipt(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const buyer = await requireVerified();
  const paymentId = z.string().uuid().safeParse(formData.get('paymentId'));
  if (!paymentId.success) return { error: 'That payment could not be found.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('payments')
    .update({ buyer_confirmed_at: new Date().toISOString() })
    .eq('id', paymentId.data)
    .eq('buyer_id', buyer.id)
    .eq('status', 'held');

  if (error) return { error: `Could not record your confirmation: ${error.message}` };

  revalidatePath(`/orders/${paymentId.data}`);
  return { message: 'Thanks — the seller will be paid out shortly.' };
}

const adminDecision = z.object({
  paymentId: z.string().uuid(),
  decision: z.enum(['release', 'refund']),
  note: z.string().trim().max(300).optional(),
});

/**
 * Admin releases held funds to the seller, or refunds the buyer.
 *
 * Release is deliberately a human decision even though the buyer has already
 * confirmed: during a pilot, the person clicking this is the safety net for
 * anything the flow did not anticipate.
 */
export async function resolvePayment(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const admin = await requireAdmin();

  const parsed = adminDecision.safeParse({
    paymentId: formData.get('paymentId'),
    decision: formData.get('decision'),
    note: formData.get('note') || undefined,
  });
  if (!parsed.success) return { error: 'Invalid decision.' };
  const { paymentId, decision, note } = parsed.data;

  if (decision === 'refund' && !note) {
    return { error: 'Give a reason when refunding, so there is a record of why.' };
  }

  const supabase = await createClient();
  const { data: payment } = await supabase
    .from('payments')
    .select('id, listing_id, status, buyer_confirmed_at')
    .eq('id', paymentId)
    .maybeSingle();

  if (!payment) return { error: 'That payment could not be found.' };
  if (payment.status !== 'held') return { error: `This payment is ${payment.status}.` };
  if (decision === 'release' && !payment.buyer_confirmed_at) {
    return { error: 'The buyer has not confirmed receipt yet.' };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('payments')
    .update(
      decision === 'release'
        ? { status: 'released', released_by: admin.id, released_at: now, admin_note: note ?? null }
        : { status: 'refunded', refunded_by: admin.id, refunded_at: now, admin_note: note ?? null },
    )
    .eq('id', paymentId);

  if (error) return { error: `Could not record the decision: ${error.message}` };

  await supabase
    .from('listings')
    .update({ status: decision === 'release' ? 'completed' : 'active' })
    .eq('id', payment.listing_id);

  revalidatePath('/admin/payments');
  return {
    message:
      decision === 'release'
        ? 'Released to the seller. (Simulated — no money moved.)'
        : 'Refunded to the buyer. (Simulated — no money moved.)',
  };
}
