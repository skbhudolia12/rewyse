-- Row Level Security.
-- This app holds student PII and photographs of government-adjacent ID cards, so
-- the default posture is deny-everything and grant back explicitly. Nothing here
-- is deferred to application code: a leaked anon key must not be able to read
-- another student's messages, offers, or ID document.

-- Start from zero rather than trusting Supabase's default grants.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter table clusters           enable row level security;
alter table campuses           enable row level security;
alter table campus_domains     enable row level security;
alter table safe_meetup_points enable row level security;
alter table profiles           enable row level security;
alter table id_verifications   enable row level security;
alter table listings           enable row level security;
alter table listing_media      enable row level security;
alter table comparables        enable row level security;
alter table price_cache        enable row level security;
alter table pricing_events     enable row level security;
alter table conversations      enable row level security;
alter table messages           enable row level security;
alter table offers             enable row level security;
alter table meetup_proposals   enable row level security;
alter table reports            enable row level security;
alter table notifications      enable row level security;

-- ---------------------------------------------------------------- reference data
-- Readable pre-auth: the signup form needs campus and cluster options before a
-- session exists. None of it is sensitive; all of it is admin-writable only.

grant select on clusters, campuses, campus_domains, safe_meetup_points to anon, authenticated;

create policy reference_readable_clusters   on clusters           for select using (true);
create policy reference_readable_campuses   on campuses           for select using (true);
create policy reference_readable_domains    on campus_domains     for select using (true);
create policy reference_readable_meetups    on safe_meetup_points for select using (active or is_admin());

create policy admin_writes_clusters on clusters           for all using (is_admin()) with check (is_admin());
create policy admin_writes_campuses on campuses           for all using (is_admin()) with check (is_admin());
create policy admin_writes_domains  on campus_domains     for all using (is_admin()) with check (is_admin());
create policy admin_writes_meetups  on safe_meetup_points for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------- profiles
-- Column-level grants, not just row-level: a student may edit their own name and
-- move-out date but must never be able to write their own role, verification
-- state, trust score, or ban status.

grant select on profiles to authenticated;
grant insert (id, full_name, email, campus_id, hostel_or_hall, moveout_date) on profiles to authenticated;
grant update (full_name, hostel_or_hall, moveout_date) on profiles to authenticated;

create policy profiles_select_self on profiles
  for select using (id = auth.uid());

-- Peers in the same cluster are visible so seller cards render; a user who has
-- not cleared both gates sees nobody but themselves.
create policy profiles_select_cluster_peers on profiles
  for select using (
    is_verified()
    and campus_id in (select id from campuses where cluster_id = current_cluster_id())
  );

create policy profiles_select_admin on profiles
  for select using (is_admin());

create policy profiles_insert_self on profiles
  for insert with check (id = auth.uid());

create policy profiles_update_self on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_update_admin on profiles
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------- ID documents
-- The tightest policy in the schema. Only the owner and an admin ever see a row,
-- and the document_path is nulled by trigger the moment a decision is recorded.

grant select on id_verifications to authenticated;
grant insert (profile_id, document_path) on id_verifications to authenticated;

create policy id_verifications_select_own on id_verifications
  for select using (profile_id = auth.uid());

create policy id_verifications_insert_own on id_verifications
  for insert with check (profile_id = auth.uid());

create policy id_verifications_admin on id_verifications
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------- listings

grant select, insert, update on listings to authenticated;
grant select, insert, delete on listing_media to authenticated;

-- Cluster-scoped discovery: a verified user sees active listings from every
-- campus in their own cluster, and never beyond it.
create policy listings_select_cluster on listings
  for select using (
    is_verified()
    and status in ('active', 'pending_pickup')
    and campus_id in (select id from campuses where cluster_id = current_cluster_id())
  );

create policy listings_select_own on listings
  for select using (seller_id = auth.uid());

create policy listings_select_admin on listings
  for select using (is_admin());

-- A seller may only list against their own campus, and only once fully verified.
create policy listings_insert_own on listings
  for insert with check (
    is_verified()
    and seller_id = auth.uid()
    and campus_id = current_campus_id()
  );

create policy listings_update_own on listings
  for update using (seller_id = auth.uid() and is_verified())
  with check (seller_id = auth.uid());

create policy listings_admin on listings
  for all using (is_admin()) with check (is_admin());

create policy listing_media_select on listing_media
  for select using (
    listing_id in (select id from listings)  -- inherits the listing policies above
  );

create policy listing_media_write_own on listing_media
  for insert with check (
    listing_id in (select id from listings where seller_id = auth.uid())
  );

create policy listing_media_delete_own on listing_media
  for delete using (
    listing_id in (select id from listings where seller_id = auth.uid())
  );

create policy listing_media_admin on listing_media
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------- pricing
-- price_cache is intentionally NOT granted to authenticated. It is written only
-- by the server with the service role, so a client cannot poison cached values.

grant select on comparables to authenticated;
grant select, insert on pricing_events to authenticated;

create policy comparables_select on comparables
  for select using (is_verified());

create policy comparables_admin on comparables
  for all using (is_admin()) with check (is_admin());

create policy pricing_events_insert_own on pricing_events
  for insert with check (seller_id = auth.uid() and is_verified());

create policy pricing_events_select_own on pricing_events
  for select using (seller_id = auth.uid());

create policy pricing_events_admin on pricing_events
  for all using (is_admin()) with check (is_admin());

create policy price_cache_admin on price_cache
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------- conversations

grant select, insert, update on conversations to authenticated;
grant select, insert, update on messages to authenticated;
grant select, insert, update on offers to authenticated;
grant select, insert, update on meetup_proposals to authenticated;

create policy conversations_select_party on conversations
  for select using (buyer_id = auth.uid() or seller_id = auth.uid());

-- Only a buyer opens a thread, only on someone else's listing, only when verified.
create policy conversations_insert_buyer on conversations
  for insert with check (
    is_verified()
    and buyer_id = auth.uid()
    and seller_id <> auth.uid()
  );

create policy conversations_update_party on conversations
  for update using (buyer_id = auth.uid() or seller_id = auth.uid())
  with check (buyer_id = auth.uid() or seller_id = auth.uid());

create policy conversations_admin on conversations
  for all using (is_admin()) with check (is_admin());

create policy messages_select_party on messages
  for select using (is_conversation_party(conversation_id));

create policy messages_insert_party on messages
  for insert with check (
    is_verified()
    and sender_id = auth.uid()
    and is_conversation_party(conversation_id)
  );

-- Read receipts: a party may update rows in their own thread.
create policy messages_update_party on messages
  for update using (is_conversation_party(conversation_id))
  with check (is_conversation_party(conversation_id));

create policy messages_admin on messages
  for all using (is_admin()) with check (is_admin());

create policy offers_select_party on offers
  for select using (is_conversation_party(conversation_id));

create policy offers_insert_party on offers
  for insert with check (
    is_verified()
    and is_conversation_party(conversation_id)
    and (buyer_id = auth.uid() or seller_id = auth.uid())
  );

create policy offers_update_party on offers
  for update using (is_conversation_party(conversation_id))
  with check (is_conversation_party(conversation_id));

create policy offers_admin on offers
  for all using (is_admin()) with check (is_admin());

create policy meetups_select_party on meetup_proposals
  for select using (is_conversation_party(conversation_id));

create policy meetups_insert_party on meetup_proposals
  for insert with check (
    is_verified()
    and proposed_by = auth.uid()
    and is_conversation_party(conversation_id)
  );

create policy meetups_update_party on meetup_proposals
  for update using (is_conversation_party(conversation_id))
  with check (is_conversation_party(conversation_id));

create policy meetups_admin on meetup_proposals
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------- safety and comms

grant select, insert on reports to authenticated;
grant select, update on notifications to authenticated;

create policy reports_insert_self on reports
  for insert with check (reporter_id = auth.uid() and is_verified());

create policy reports_select_own on reports
  for select using (reporter_id = auth.uid());

create policy reports_admin on reports
  for all using (is_admin()) with check (is_admin());

create policy notifications_select_own on notifications
  for select using (user_id = auth.uid());

-- Marking read is the only client-side write; rows are created server-side.
create policy notifications_update_own on notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notifications_admin on notifications
  for all using (is_admin()) with check (is_admin());
