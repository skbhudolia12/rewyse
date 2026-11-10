'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireVerified, requireAdmin } from '@/lib/auth/session';

/**
 * Simulated escrow with Dobara-run delivery.
 *
 * NOTHING HERE MOVES REAL MONEY. There is no payment provider and no
 * settlement; every row is marked is_simulated in the database.
 *
 * Prices, state transitions and the listing's status are all decided in
 * Postgres (0009_commerce.sql): this file only expresses intent. A buyer who
 * skips the UI and calls the API directly gets the same rules, because the
 * rules are not here.
 */

export interface PaymentActionState {
  error?: string;
  message?: string;
}

export type CaptureResult = { ok: true; orderId: string } | { ok: false; error: string };

/** Buyer starts a purchase. The database prices it; this only says what is being bought. */
export async function startCheckout(listingId: string): Promise<void> {
  const buyer = await requireVerified();
  const supabase = await createClient();

  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('id, seller_id, status')
    .eq('id', listingId)
    .maybeSingle();

  if (listingError || !listing) redirect(`/listing/${listingId}?error=not_found`);
  if (listing.seller_id === buyer.id) redirect(`/listing/${listingId}?error=own_listing`);

  // Resume rather than duplicate: a buyer who left checkout and came back
  // lands on the same order.
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
  if (listing.status !== 'active') redirect(`/listing/${listingId}?error=unavailable`);

  const { data: payment, error } = await supabase
    .from('payments')
    .insert({ listing_id: listing.id, buyer_id: buyer.id, seller_id: listing.seller_id })
    .select('id')
    .single();

  if (error || !payment) {
    // The partial unique index means "someone else is already buying this".
    redirect(`/listing/${listingId}?error=already_reserved`);
  }

  redirect(`/checkout/${payment.id}`);
}

const captureInput = z.object({
  paymentId: z.string().uuid(),
  hostel: z.string().trim().min(2, 'Add your hostel or block.').max(80),
  room: z.string().trim().min(1, 'Add your room number.').max(20),
  method: z.enum(['upi', 'card', 'netbanking']),
});

const METHOD_LABELS = { upi: 'UPI', card: 'Card', netbanking: 'Netbanking' } as const;

/**
 * The simulated gateway "captures" the payment, which puts it in hold and
 * dispatches a delivery partner (both done by the database trigger).
 *
 * In a real integration this is the provider's webhook, never a browser call.
 */
export async function capturePayment(raw: unknown): Promise<CaptureResult> {
  const buyer = await requireVerified();
  const parsed = captureInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check your delivery details.' };
  }
  const { paymentId, hostel, room, method } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('payments')
    .update({
      delivery_address: `${hostel}, Room ${room}`,
      payment_method: METHOD_LABELS[method],
      status: 'held',
    })
    .eq('id', paymentId)
    .eq('buyer_id', buyer.id)
    .eq('status', 'initiated')
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: `Payment failed: ${error.message}` };
  if (!data) return { ok: false, error: 'This order was already paid or has expired.' };

  revalidatePath('/orders');
  return { ok: true, orderId: data.id };
}

/** Buyer confirms the delivered item matches the listing. Release depends on it. */
export async function confirmReceipt(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const buyer = await requireVerified();
  const paymentId = z.string().uuid().safeParse(formData.get('paymentId'));
  if (!paymentId.success) return { error: 'That order could not be found.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('payments')
    .update({ buyer_confirmed_at: new Date().toISOString() })
    .eq('id', paymentId.data)
    .eq('buyer_id', buyer.id)
    .eq('status', 'held');

  if (error) return { error: `Your confirmation wasn't saved: ${error.message}` };

  revalidatePath(`/orders/${paymentId.data}`);
  return { message: 'Thanks. The seller will be paid shortly.' };
}

const NEXT_DELIVERY_STEP = {
  scheduled: 'picked_up',
  picked_up: 'out_for_delivery',
  out_for_delivery: 'delivered',
} as const;

/** Operations moves a delivery one step forward, standing in for the partner's tracking feed. */
export async function advanceDelivery(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  await requireAdmin();
  const paymentId = z.string().uuid().safeParse(formData.get('paymentId'));
  if (!paymentId.success) return { error: 'That order could not be found.' };

  const supabase = await createClient();
  const { data: payment } = await supabase
    .from('payments')
    .select('delivery_status')
    .eq('id', paymentId.data)
    .maybeSingle();

  const current = payment?.delivery_status as keyof typeof NEXT_DELIVERY_STEP | undefined;
  const next = current ? NEXT_DELIVERY_STEP[current] : undefined;
  if (!next) return { error: 'This delivery has no next step.' };

  const { error } = await supabase
    .from('payments')
    .update({ delivery_status: next })
    .eq('id', paymentId.data);

  if (error) return { error: `The delivery wasn't updated: ${error.message}` };

  revalidatePath('/admin/payments');
  return { message: next };
}

const adminDecision = z.object({
  paymentId: z.string().uuid(),
  decision: z.enum(['release', 'refund']),
  note: z.string().trim().max(300).optional(),
});

/**
 * Admin pays the seller out, or refunds the buyer.
 *
 * Release stays a human decision even after the buyer confirms: the person
 * clicking it is the safety net for anything the flow did not anticipate.
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
  if (!parsed.success) return { error: 'That decision could not be read.' };
  const { paymentId, decision, note } = parsed.data;

  if (decision === 'refund' && !note) {
    return { error: 'Add a reason for the refund, so there is a record of why.' };
  }

  const supabase = await createClient();
  const { data: payment } = await supabase
    .from('payments')
    .select('id, status, buyer_confirmed_at')
    .eq('id', paymentId)
    .maybeSingle();

  if (!payment) return { error: 'That order could not be found.' };
  if (payment.status !== 'held') return { error: `This order is already ${payment.status}.` };
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

  if (error) return { error: `The decision wasn't saved: ${error.message}` };

  revalidatePath('/admin/payments');
  revalidatePath('/admin');
  return { message: decision === 'release' ? 'Payout sent to the seller.' : 'Refunded to the buyer.' };
}
