/**
 * Domain types mirroring `supabase/migrations/0001_schema.sql`.
 *
 * Hand-maintained rather than generated so the schema stays readable at the
 * boundary. If you change an enum here, change it in the migration too --
 * Postgres is the source of truth, this file is the contract the app codes to.
 */

export const LISTING_CATEGORIES = [
  'electronics',
  'furniture',
  'books',
  'appliances',
  'other',
] as const;
export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

export const FUNCTIONAL_STATUSES = [
  'fully_working',
  'partially_working',
  'for_parts',
] as const;
export type FunctionalStatus = (typeof FUNCTIONAL_STATUSES)[number];

export type IdReviewStatus = 'not_submitted' | 'pending_review' | 'approved' | 'rejected';
export type VerifiedStatus = 'pending' | 'verified' | 'rejected';
export type UserRole = 'student' | 'admin';
export type ListingStatus = 'active' | 'pending_pickup' | 'completed' | 'removed';
export type ConversationStatus =
  | 'open'
  | 'meetup_proposed'
  | 'confirmed'
  | 'completed'
  | 'cancelled';
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'countered' | 'expired';
export type BaseValueSource = 'llm' | 'comparables' | 'category_default';
export type PricingOutcome =
  | 'accepted_sell_fast'
  | 'within_range'
  | 'above_range'
  | 'below_range';
export type ReportTargetType = 'listing' | 'user' | 'conversation';
export type ReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';
export type MediaKind = 'photo' | 'video';

export interface Cluster {
  id: string;
  name: string;
}

export interface Campus {
  id: string;
  cluster_id: string;
  name: string;
  abbreviation: string;
}

export interface SafeMeetupPoint {
  id: string;
  campus_id: string;
  name: string;
  active: boolean;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  campus_id: string;
  hostel_or_hall: string | null;
  moveout_date: string;
  role: UserRole;
  email_domain_ok: boolean;
  id_review_status: IdReviewStatus;
  verified_status: VerifiedStatus;
  trust_score: number;
  banned_at: string | null;
  created_at: string;
}

export interface Listing {
  id: string;
  seller_id: string;
  campus_id: string;
  title: string;
  description: string | null;
  category: ListingCategory;
  functional_status: FunctionalStatus;
  cosmetic_flaws: string | null;
  accessories_included: string | null;
  moveout_date: string;
  suggested_price_min: number | null;
  suggested_price_max: number | null;
  suggested_sell_fast_price: number | null;
  asking_price: number;
  status: ListingStatus;
  published_at: string | null;
  created_at: string;
}

export interface ListingMedia {
  id: string;
  listing_id: string;
  kind: MediaKind;
  storage_path: string;
  is_live_capture: boolean;
  position: number;
}

export interface Conversation {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  status: ConversationStatus;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface Offer {
  id: string;
  conversation_id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  status: OfferStatus;
  counter_of: string | null;
  suggested_sell_fast_at_offer: number | null;
  suggested_min_at_offer: number | null;
  suggested_max_at_offer: number | null;
  created_at: string;
  resolved_at: string | null;
}

export interface MeetupProposal {
  id: string;
  conversation_id: string;
  proposed_by: string;
  meetup_point_id: string;
  proposed_time: string;
  accepted_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export interface Report {
  id: string;
  reporter_id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason: string;
  detail: string | null;
  status: ReportStatus;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}
