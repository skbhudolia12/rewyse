/**
 * Select shapes for the admin console.
 *
 * These live apart from the pages so tests can exercise the EXACT string the
 * app sends. Three bugs in a row reached a real user because the integration
 * suite set data up through the service role and never issued the queries the
 * pages actually issue -- a green suite against paths nobody walks.
 *
 * Every embed names its constraint explicitly. Several tables carry more than
 * one foreign key to `profiles` (id_verifications has profile_id and
 * reviewed_by; payments has four), and a bare `profiles(...)` embed on any of
 * them is ambiguous -- PostgREST rejects the whole query rather than guessing,
 * which surfaces as an empty admin screen.
 */

export const PENDING_VERIFICATIONS_SELECT = `
  id, submitted_at, document_path,
  profiles!id_verifications_profile_id_fkey(
    full_name, email, hostel_or_hall, campuses(abbreviation)
  )
`;

export const PAYMENTS_QUEUE_SELECT = `
  id, amount, status, gateway_reference, buyer_confirmed_at, created_at, admin_note,
  listing:listings(title),
  buyer:profiles!payments_buyer_id_fkey(full_name, email),
  seller:profiles!payments_seller_id_fkey(full_name, email)
`;

export const REPORTS_QUEUE_SELECT = `
  id, target_type, target_id, reason, detail, status, created_at, action_taken,
  reporter:profiles!reports_reporter_id_fkey(full_name, email)
`;
