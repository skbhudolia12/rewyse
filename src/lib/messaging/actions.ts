'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { requireVerified } from '@/lib/auth/session';

/**
 * Chat, offers and meetup scheduling.
 *
 * Authorisation lives in Postgres triggers (0008), not here: who may accept an
 * offer, who may accept a meetup, who may confirm. These actions are the
 * ergonomic layer over that, and a bug in this file cannot let anyone past it.
 */

export interface ThreadActionState {
  error?: string;
  message?: string;
}

/** Notifications are written server-side; the bell and the mailer read one table. */
async function notify(userId: string, type: string, payload: Record<string, unknown>) {
  const admin = createAdminClient();
  await admin.from('notifications').insert({ user_id: userId, type, payload });
}

/** Opens (or reuses) the buyer's thread on a listing. */
export async function openConversation(listingId: string): Promise<void> {
  const buyer = await requireVerified();
  const supabase = await createClient();

  const { data: listing } = await supabase
    .from('listings')
    .select('id, seller_id, status')
    .eq('id', listingId)
    .maybeSingle();

  if (!listing) redirect(`/listing/${listingId}`);
  if (listing.seller_id === buyer.id) redirect(`/listing/${listingId}`);

  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('listing_id', listingId)
    .eq('buyer_id', buyer.id)
    .maybeSingle();

  if (existing) redirect(`/messages/${existing.id}`);

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({ listing_id: listingId, buyer_id: buyer.id, seller_id: listing.seller_id })
    .select('id')
    .single();

  if (error || !created) redirect(`/listing/${listingId}?error=chat_failed`);

  await notify(listing.seller_id, 'conversation_opened', { listingId, conversationId: created.id });
  redirect(`/messages/${created.id}`);
}

const messageInput = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1, 'Write something first.').max(2000),
});

export async function sendMessage(
  _prev: ThreadActionState,
  formData: FormData,
): Promise<ThreadActionState> {
  const me = await requireVerified();
  const parsed = messageInput.safeParse({
    conversationId: formData.get('conversationId'),
    body: formData.get('body'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Message not sent.' };

  const supabase = await createClient();
  const { error } = await supabase.from('messages').insert({
    conversation_id: parsed.data.conversationId,
    sender_id: me.id,
    body: parsed.data.body,
  });
  if (error) return { error: `Could not send: ${error.message}` };

  const { data: conv } = await supabase
    .from('conversations')
    .select('buyer_id, seller_id, listing_id')
    .eq('id', parsed.data.conversationId)
    .maybeSingle();

  if (conv) {
    const other = conv.buyer_id === me.id ? conv.seller_id : conv.buyer_id;
    await notify(other, 'message_received', {
      conversationId: parsed.data.conversationId,
      listingId: conv.listing_id,
    });
  }

  revalidatePath(`/messages/${parsed.data.conversationId}`);
  return {};
}

const offerInput = z.object({
  conversationId: z.string().uuid(),
  amount: z.coerce.number().int().min(1, 'Enter an amount.').max(500_000),
  counterOf: z.string().uuid().optional(),
});

/**
 * Makes an offer, or counters one.
 *
 * The suggested sell-fast price is snapshotted onto the row. Without it, tuning
 * the pricing prompt later would retroactively change what every historical
 * offer is measured against -- and that comparison is the pilot's entire
 * hypothesis.
 */
export async function makeOffer(
  _prev: ThreadActionState,
  formData: FormData,
): Promise<ThreadActionState> {
  const me = await requireVerified();
  const parsed = offerInput.safeParse({
    conversationId: formData.get('conversationId'),
    amount: formData.get('amount'),
    counterOf: formData.get('counterOf') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Offer not sent.' };

  const supabase = await createClient();
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, listing_id, buyer_id, seller_id, listing:listings(suggested_sell_fast_price)')
    .eq('id', parsed.data.conversationId)
    .maybeSingle();

  if (!conv) return { error: 'That conversation could not be found.' };
  if (me.id !== conv.buyer_id && me.id !== conv.seller_id) {
    return { error: 'You are not part of this conversation.' };
  }

  const listing = conv.listing as unknown as { suggested_sell_fast_price: number | null } | null;

  const { error } = await supabase.from('offers').insert({
    conversation_id: conv.id,
    listing_id: conv.listing_id,
    buyer_id: conv.buyer_id,
    seller_id: conv.seller_id,
    amount: parsed.data.amount,
    suggested_sell_fast_at_offer: listing?.suggested_sell_fast_price ?? null,
    counter_of: parsed.data.counterOf ?? null,
  });
  if (error) return { error: `Could not send the offer: ${error.message}` };

  // A counter is a rejection of what came before; leaving it pending would let
  // both sides sit accepted at once.
  if (parsed.data.counterOf) {
    await supabase
      .from('offers')
      .update({ status: 'countered' })
      .eq('id', parsed.data.counterOf)
      .eq('status', 'pending');
  }

  const other = conv.buyer_id === me.id ? conv.seller_id : conv.buyer_id;
  await notify(other, 'offer_received', {
    conversationId: conv.id,
    amount: parsed.data.amount,
  });

  revalidatePath(`/messages/${conv.id}`);
  return {};
}

const respondInput = z.object({
  offerId: z.string().uuid(),
  decision: z.enum(['accepted', 'rejected']),
});

export async function respondToOffer(
  _prev: ThreadActionState,
  formData: FormData,
): Promise<ThreadActionState> {
  const me = await requireVerified();
  const parsed = respondInput.safeParse({
    offerId: formData.get('offerId'),
    decision: formData.get('decision'),
  });
  if (!parsed.success) return { error: 'Invalid response.' };

  const supabase = await createClient();
  const { data: offer } = await supabase
    .from('offers')
    .select('id, conversation_id, buyer_id, seller_id, amount')
    .eq('id', parsed.data.offerId)
    .maybeSingle();
  if (!offer) return { error: 'That offer could not be found.' };

  // The trigger refuses if you are the one who proposed it; this just turns
  // that into a sentence rather than a Postgres error string.
  const { error } = await supabase
    .from('offers')
    .update({ status: parsed.data.decision })
    .eq('id', offer.id);

  if (error) {
    return {
      error: /your own offer/i.test(error.message)
        ? 'You proposed this offer — the other person has to respond to it.'
        : `Could not record that: ${error.message}`,
    };
  }

  const other = offer.buyer_id === me.id ? offer.seller_id : offer.buyer_id;
  await notify(other, parsed.data.decision === 'accepted' ? 'offer_accepted' : 'offer_rejected', {
    conversationId: offer.conversation_id,
    amount: offer.amount,
  });

  revalidatePath(`/messages/${offer.conversation_id}`);
  return {
    message:
      parsed.data.decision === 'accepted'
        ? 'Offer accepted. The buyer can now pay at that price.'
        : 'Offer declined.',
  };
}

const meetupInput = z.object({
  conversationId: z.string().uuid(),
  meetupPointId: z.string().uuid(),
  proposedTime: z.string().min(1, 'Pick a time.'),
});

export async function proposeMeetup(
  _prev: ThreadActionState,
  formData: FormData,
): Promise<ThreadActionState> {
  const me = await requireVerified();
  const parsed = meetupInput.safeParse({
    conversationId: formData.get('conversationId'),
    meetupPointId: formData.get('meetupPointId'),
    proposedTime: formData.get('proposedTime'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Could not propose.' };

  const when = new Date(parsed.data.proposedTime);
  if (Number.isNaN(when.getTime())) return { error: 'That time is not valid.' };
  if (when.getTime() < Date.now() - 60_000) return { error: 'Pick a time in the future.' };

  const supabase = await createClient();
  const { error } = await supabase.from('meetup_proposals').insert({
    conversation_id: parsed.data.conversationId,
    proposed_by: me.id,
    meetup_point_id: parsed.data.meetupPointId,
    proposed_time: when.toISOString(),
  });
  if (error) return { error: error.message.replace(/^.*?:\s*/, '') };

  await supabase
    .from('conversations')
    .update({ status: 'meetup_proposed' })
    .eq('id', parsed.data.conversationId);

  const { data: conv } = await supabase
    .from('conversations')
    .select('buyer_id, seller_id')
    .eq('id', parsed.data.conversationId)
    .maybeSingle();

  if (conv) {
    const other = conv.buyer_id === me.id ? conv.seller_id : conv.buyer_id;
    await notify(other, 'meetup_proposed', { conversationId: parsed.data.conversationId });
  }

  revalidatePath(`/messages/${parsed.data.conversationId}`);
  return {};
}

export async function acceptMeetup(
  _prev: ThreadActionState,
  formData: FormData,
): Promise<ThreadActionState> {
  await requireVerified();
  const id = z.string().uuid().safeParse(formData.get('meetupId'));
  if (!id.success) return { error: 'That meetup could not be found.' };

  const supabase = await createClient();
  const { data: meetup } = await supabase
    .from('meetup_proposals')
    .select('id, conversation_id')
    .eq('id', id.data)
    .maybeSingle();
  if (!meetup) return { error: 'That meetup could not be found.' };

  const { error } = await supabase
    .from('meetup_proposals')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', meetup.id);

  if (error) {
    return {
      error: /other person has to accept/i.test(error.message)
        ? 'You proposed this meetup — the other person has to accept it.'
        : `Could not confirm: ${error.message}`,
    };
  }

  revalidatePath(`/messages/${meetup.conversation_id}`);
  return { message: 'Meetup confirmed. The item is reserved for you.' };
}

const reportInput = z.object({
  targetType: z.enum(['listing', 'user', 'conversation']),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(1, 'Say what is wrong.').max(300),
});

export async function submitReport(
  _prev: ThreadActionState,
  formData: FormData,
): Promise<ThreadActionState> {
  const me = await requireVerified();
  const parsed = reportInput.safeParse({
    targetType: formData.get('targetType'),
    targetId: formData.get('targetId'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Could not report.' };

  const supabase = await createClient();
  const { error } = await supabase.from('reports').insert({
    reporter_id: me.id,
    target_type: parsed.data.targetType,
    target_id: parsed.data.targetId,
    reason: parsed.data.reason,
  });
  if (error) return { error: `Could not submit the report: ${error.message}` };

  return { message: 'Reported. Someone on the ReWyse team will look at this.' };
}
