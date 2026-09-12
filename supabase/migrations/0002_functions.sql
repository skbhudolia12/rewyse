-- Helper functions and triggers.
-- The auth helpers are SECURITY DEFINER so RLS policies can call them without
-- recursing back through the policies on profiles.

-- ---------------------------------------------------------------- auth helpers

create or replace function public.current_cluster_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.cluster_id
  from profiles p
  join campuses c on c.id = p.campus_id
  where p.id = auth.uid();
$$;

create or replace function public.current_campus_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select campus_id from profiles where id = auth.uid();
$$;

-- Both gates passed AND not banned. This is the single predicate guarding
-- every write a student can make.
create or replace function public.is_verified()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select verified_status = 'verified' and banned_at is null
     from profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'admin' and banned_at is null from profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.is_conversation_party(conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from conversations
    where id = conversation
      and (buyer_id = auth.uid() or seller_id = auth.uid())
  );
$$;

-- ---------------------------------------------------------------- updated_at

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch      before update on profiles      for each row execute function touch_updated_at();
create trigger listings_touch      before update on listings      for each row execute function touch_updated_at();
create trigger conversations_touch before update on conversations for each row execute function touch_updated_at();
create trigger comparables_touch   before update on comparables   for each row execute function touch_updated_at();

-- ---------------------------------------------------------------- verification gate

-- verified_status is derived, never set by hand: it is the AND of the two
-- independent gates. Keeping it computed means no code path can accidentally
-- mark someone verified who only cleared the email check.
create or replace function public.sync_verified_status()
returns trigger
language plpgsql
as $$
begin
  new.verified_status := case
    when new.id_review_status = 'rejected' then 'rejected'::verified_status
    when new.email_domain_ok and new.id_review_status = 'approved' then 'verified'::verified_status
    else 'pending'::verified_status
  end;
  return new;
end;
$$;

create trigger profiles_sync_verified
  before insert or update of email_domain_ok, id_review_status on profiles
  for each row execute function sync_verified_status();

-- Mirror an ID review decision onto the profile, and drop the document.
-- Retention policy: the decision is kept, the image is not.
create or replace function public.apply_id_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and new.status in ('approved', 'rejected') then
    new.document_path := null;
    new.reviewed_at := coalesce(new.reviewed_at, now());

    update profiles
    set id_review_status = new.status
    where id = new.profile_id;
  end if;
  return new;
end;
$$;

create trigger id_verifications_apply_review
  before update on id_verifications
  for each row execute function apply_id_review();

-- ---------------------------------------------------------------- trust score

-- Spec formula, with one deliberate change: only reports an admin has ACTIONED
-- count against a user. Counting raw reports would let any student tank a
-- rival's score by filing them, which is the opposite of a trust signal.
create or replace function public.recompute_trust_score(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actioned_flags   integer;
  broken_meetups   integer;
  completed_deals  integer;
  score            integer;
begin
  select count(*) into actioned_flags
  from reports r
  where r.status = 'actioned'
    and (
      (r.target_type = 'user' and r.target_id = target)
      or (r.target_type = 'listing'
          and r.target_id in (select id from listings where seller_id = target))
    );

  select count(*) into broken_meetups
  from meetup_proposals mp
  join conversations c on c.id = mp.conversation_id
  where mp.accepted_at is not null
    and mp.cancelled_at is not null
    and (c.buyer_id = target or c.seller_id = target);

  select count(*) into completed_deals
  from conversations c
  where c.status = 'completed'
    and (c.buyer_id = target or c.seller_id = target);

  score := 100
    - (actioned_flags * 15)
    - (broken_meetups * 10)
    + least(completed_deals, 10);

  update profiles
  set trust_score = greatest(0, least(100, score))
  where id = target;
end;
$$;

create or replace function public.trigger_recompute_trust()
returns trigger
language plpgsql
as $$
declare
  conv conversations%rowtype;
begin
  if tg_table_name = 'conversations' then
    perform recompute_trust_score(new.buyer_id);
    perform recompute_trust_score(new.seller_id);
  elsif tg_table_name = 'meetup_proposals' then
    select * into conv from conversations where id = new.conversation_id;
    perform recompute_trust_score(conv.buyer_id);
    perform recompute_trust_score(conv.seller_id);
  elsif tg_table_name = 'reports' and new.target_type = 'user' then
    perform recompute_trust_score(new.target_id);
  elsif tg_table_name = 'reports' and new.target_type = 'listing' then
    perform recompute_trust_score(
      (select seller_id from listings where id = new.target_id)
    );
  end if;
  return new;
end;
$$;

create trigger conversations_trust
  after update of status on conversations
  for each row execute function trigger_recompute_trust();

create trigger meetup_proposals_trust
  after update on meetup_proposals
  for each row execute function trigger_recompute_trust();

create trigger reports_trust
  after update of status on reports
  for each row execute function trigger_recompute_trust();

-- ---------------------------------------------------------------- conversation activity

-- Keeps the thread list ordered by real activity without a per-render subquery.
create or replace function public.touch_conversation()
returns trigger
language plpgsql
as $$
begin
  update conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on messages
  for each row execute function touch_conversation();

create trigger offers_touch_conversation
  after insert on offers
  for each row execute function touch_conversation();
