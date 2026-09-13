-- Phase 4: chat, structured offers, meetup scheduling.
--
-- The authorisation lessons from 0005-0007 are applied up front here: every
-- rule about WHO may do WHAT lives in a trigger beside the data, the grants
-- that make the policies reachable are written in the same migration as the
-- policies, and nothing depends on the application remembering to check.

-- ---------------------------------------------------------------- realtime

-- Supabase only streams tables in this publication. Without it the chat renders
-- correctly and simply never updates, which looks like a broken socket rather
-- than a missing line of SQL.
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table offers;
alter publication supabase_realtime add table meetup_proposals;

-- Realtime sends the old row on update/delete only when the replica identity
-- carries it; without this a read-receipt update arrives with nulls.
alter table messages replica identity full;

-- ---------------------------------------------------------------- offers

/**
 * Guards offer transitions.
 *
 * The asymmetry is the whole point: the party who did NOT make an offer is the
 * one who may accept or decline it. Without this, a buyer could accept their own
 * lowball and march straight to checkout at that price.
 */
create or replace function public.guard_offer_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  proposer uuid;
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status <> 'pending' then
    raise exception 'This offer is already %', old.status;
  end if;

  -- Whoever created the offer is the proposer; a counter flips the direction.
  proposer := case when old.counter_of is null then old.buyer_id
                   else (select case when o.buyer_id = old.buyer_id then old.seller_id
                                     else old.buyer_id end
                         from offers o where o.id = old.counter_of) end;

  if new.status in ('accepted', 'rejected') then
    if actor = proposer then
      raise exception 'You cannot accept or decline your own offer';
    end if;
    if actor not in (old.buyer_id, old.seller_id) then
      raise exception 'Only the buyer or seller can respond to this offer';
    end if;
  end if;

  new.resolved_at := coalesce(new.resolved_at, now());
  return new;
end;
$$;

create trigger offers_guard_transition
  before update of status on offers
  for each row execute function guard_offer_transition();

/**
 * Accepting an offer supersedes every other pending offer on that listing.
 * Leaving them open would let a seller accept two different buyers.
 */
create or replace function public.supersede_other_offers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted' then
    update offers
    set status = 'expired', resolved_at = now()
    where listing_id = new.listing_id
      and id <> new.id
      and status = 'pending';
  end if;
  return new;
end;
$$;

create trigger offers_supersede
  after update of status on offers
  for each row execute function supersede_other_offers();

-- The accepted price is what checkout must charge, so it has to be findable.
create unique index offers_one_accepted_per_listing
  on offers(listing_id)
  where status = 'accepted';

-- ---------------------------------------------------------------- meetups

/**
 * A meetup is agreed, not announced: only the party who did not propose it can
 * accept. Accepting moves the conversation and the listing together, so a
 * scheduled handover always takes the item off the market.
 */
create or replace function public.guard_meetup_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conv conversations%rowtype;
begin
  if new.accepted_at is distinct from old.accepted_at and new.accepted_at is not null then
    if auth.uid() = old.proposed_by then
      raise exception 'The other person has to accept the meetup you proposed';
    end if;

    select * into conv from conversations where id = old.conversation_id;
    if auth.uid() not in (conv.buyer_id, conv.seller_id) then
      raise exception 'Only the buyer or seller can accept this meetup';
    end if;

    update conversations set status = 'confirmed' where id = old.conversation_id;
    update listings set status = 'pending_pickup'
      where id = conv.listing_id and status = 'active';
  end if;

  return new;
end;
$$;

create trigger meetups_guard_acceptance
  before update of accepted_at on meetup_proposals
  for each row execute function guard_meetup_acceptance();

-- A proposal must name a meetup point on one of the two parties' campuses.
-- Cross-campus deals happen; meeting at a third campus nobody attends does not.
create or replace function public.check_meetup_point_campus()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  select exists (
    select 1
    from conversations c
    join profiles b on b.id = c.buyer_id
    join profiles s on s.id = c.seller_id
    join safe_meetup_points p on p.id = new.meetup_point_id
    where c.id = new.conversation_id
      and p.active
      and p.campus_id in (b.campus_id, s.campus_id)
  ) into allowed;

  if not allowed then
    raise exception 'Pick an active meetup point on your campus or theirs';
  end if;

  return new;
end;
$$;

create trigger meetups_check_campus
  before insert on meetup_proposals
  for each row execute function check_meetup_point_campus();

-- ---------------------------------------------------------------- conversation activity

-- Unread counts are read on every thread-list render; without this they are a
-- sequential scan per conversation.
create index messages_unread_idx
  on messages(conversation_id, sender_id)
  where read_at is null;

-- ---------------------------------------------------------------- grants
--
-- Written here, beside the policies they serve. An RLS policy is not a
-- privilege: `for all using (is_admin())` over a table with no UPDATE grant is
-- permission denied, which is how the ID queue shipped broken.

grant update (status, resolved_at) on offers to authenticated;
grant update (accepted_at, cancelled_at) on meetup_proposals to authenticated;
grant update (read_at) on messages to authenticated;
grant update (status) on conversations to authenticated;
