/**
 * Select shapes for chat, offers and meetups.
 *
 * Kept apart from the pages so tests issue the EXACT strings the app issues.
 * Every embed names its constraint: conversations and offers each carry two
 * foreign keys to `profiles`, and a bare `profiles(...)` on either is ambiguous
 * -- PostgREST rejects the whole query rather than guessing, which surfaces as
 * an empty screen with the real error buried underneath.
 */

export const THREAD_LIST_SELECT = `
  id, status, updated_at, listing_id, buyer_id, seller_id,
  listing:listings(id, title, asking_price, status, moveout_date),
  buyer:profiles!conversations_buyer_id_fkey(id, full_name),
  seller:profiles!conversations_seller_id_fkey(id, full_name),
  messages(id, body, created_at, sender_id, read_at)
`;

export const THREAD_DETAIL_SELECT = `
  id, status, listing_id, buyer_id, seller_id, created_at,
  listing:listings(id, title, asking_price, status, moveout_date, campus_id,
                   suggested_price_min, suggested_price_max, suggested_sell_fast_price),
  buyer:profiles!conversations_buyer_id_fkey(id, full_name, campus_id),
  seller:profiles!conversations_seller_id_fkey(id, full_name, campus_id)
`;

export const MESSAGES_SELECT = `id, conversation_id, sender_id, body, read_at, created_at`;

export const OFFERS_SELECT = `
  id, conversation_id, listing_id, buyer_id, seller_id, amount, status,
  counter_of, suggested_sell_fast_at_offer, created_at, resolved_at
`;

export const MEETUPS_SELECT = `
  id, conversation_id, proposed_by, meetup_point_id, proposed_time,
  accepted_at, cancelled_at, created_at,
  point:safe_meetup_points(id, name, campus_id)
`;

/** One entry in the merged conversation timeline. */
export type TimelineEntry =
  | { kind: 'message'; at: string; id: string; senderId: string; body: string }
  | {
      kind: 'offer';
      at: string;
      id: string;
      amount: number;
      status: string;
      proposedBy: string;
      isCounter: boolean;
    }
  | {
      kind: 'meetup';
      at: string;
      id: string;
      proposedBy: string;
      pointName: string;
      time: string;
      acceptedAt: string | null;
      cancelledAt: string | null;
    };

interface RawMessage {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

interface RawOffer {
  id: string;
  amount: number;
  status: string;
  buyer_id: string;
  seller_id: string;
  counter_of: string | null;
  created_at: string;
}

interface RawMeetup {
  id: string;
  proposed_by: string;
  proposed_time: string;
  accepted_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  point: { name: string } | null;
}

/**
 * Merges the three streams into one chronological timeline.
 *
 * Done here rather than in SQL because a UNION across three shapes costs more
 * to read and maintain than a sort over a few dozen rows, and a thread with
 * enough entries to make that a performance question is not a thread anyone is
 * still scrolling.
 */
export function buildTimeline(
  messages: RawMessage[],
  offers: RawOffer[],
  meetups: RawMeetup[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...messages.map((m) => ({
      kind: 'message' as const,
      at: m.created_at,
      id: m.id,
      senderId: m.sender_id,
      body: m.body,
    })),
    ...offers.map((o) => ({
      kind: 'offer' as const,
      at: o.created_at,
      id: o.id,
      amount: o.amount,
      status: o.status,
      // A counter flips who is proposing, which is what decides whose side of
      // the thread the card sits on and who is allowed to accept it.
      proposedBy: o.counter_of ? o.seller_id : o.buyer_id,
      isCounter: o.counter_of !== null,
    })),
    ...meetups.map((m) => ({
      kind: 'meetup' as const,
      at: m.created_at,
      id: m.id,
      proposedBy: m.proposed_by,
      pointName: m.point?.name ?? 'a campus meetup point',
      time: m.proposed_time,
      acceptedAt: m.accepted_at,
      cancelledAt: m.cancelled_at,
    })),
  ];

  return entries.sort((a, b) => a.at.localeCompare(b.at));
}
