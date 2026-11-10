-- Commerce: fees, ReWyse-run delivery, escrow payouts and seller boosts.
--
-- STILL SIMULATED. No money moves; every payment and boost row is marked
-- is_simulated. What this migration adds is the full shape of the business:
-- the buyer pays item + convenience fee + delivery fee, the money is held,
-- a delivery partner moves the item, the buyer confirms, and an admin pays the
-- seller out. Sellers can pay to boost a listing.
--
-- Lessons from 0005-0008 applied up front: amounts are computed here, not
-- trusted from the client; column grants are written beside the policies; and
-- every rule about who may move a row lives in a trigger next to the data.

-- ---------------------------------------------------------------- fee rules
--
-- Mirrors src/lib/fees/index.ts. The TypeScript copy quotes prices in the UI;
-- this copy is the one that is charged. tests/commerce.integration.test.ts
-- pins the two together so they cannot drift.

create or replace function public.rewyse_convenience_fee(item integer)
returns integer
language sql
immutable
as $$
  select least(299, greatest(15, round(item * case
    when item < 1000 then 0.05
    when item < 5000 then 0.04
    else 0.03
  end)::integer));
$$;

create or replace function public.rewyse_delivery_fee(same_campus boolean, category listing_category)
returns integer
language sql
immutable
as $$
  select (case when same_campus then 39 else 79 end)
       + (case when category in ('furniture', 'appliances') then 60 else 0 end);
$$;

-- ---------------------------------------------------------------- payments: new columns

create type delivery_status as enum ('scheduled', 'picked_up', 'out_for_delivery', 'delivered');

alter table payments
  add column item_amount         integer,
  add column convenience_fee     integer not null default 0,
  add column delivery_fee        integer not null default 0,
  add column payment_method      text,
  add column delivery_address    text,
  add column delivery_status     delivery_status,
  add column delivery_partner    text,
  add column rider_name          text,
  add column tracking_id         text,
  add column scheduled_at        timestamptz,
  add column picked_up_at        timestamptz,
  add column out_for_delivery_at timestamptz,
  add column delivered_at        timestamptz,
  add column payout_reference    text,
  add column payout_account_mask text;

-- Rows from before fees existed: the whole amount was the item.
update payments set item_amount = amount where item_amount is null;
alter table payments alter column item_amount set not null;

alter table payments
  add constraint payments_amount_is_sum
  check (amount = item_amount + convenience_fee + delivery_fee);

-- ---------------------------------------------------------------- payments: priced on insert

/**
 * The buyer chooses WHAT to buy; the database decides what it costs.
 *
 * Whatever amounts the client sent are overwritten: the item price is the
 * buyer's accepted offer if one exists, else the listing's asking price, and
 * the fees follow from that. A buyer calling the API directly with
 * `amount: 1` gets charged the real total.
 */
create or replace function public.price_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  l listings%rowtype;
  buyer_campus uuid;
  agreed integer;
begin
  select * into l from listings where id = new.listing_id;
  if not found then
    raise exception 'That listing does not exist';
  end if;
  if l.status <> 'active' then
    raise exception 'This item is no longer available';
  end if;

  select amount into agreed
  from offers
  where listing_id = new.listing_id and buyer_id = new.buyer_id and status = 'accepted';

  select campus_id into buyer_campus from profiles where id = new.buyer_id;

  new.seller_id       := l.seller_id;
  new.item_amount     := coalesce(agreed, l.asking_price);
  new.convenience_fee := rewyse_convenience_fee(new.item_amount);
  new.delivery_fee    := rewyse_delivery_fee(buyer_campus = l.campus_id, l.category);
  new.amount          := new.item_amount + new.convenience_fee + new.delivery_fee;
  new.status          := 'initiated';
  return new;
end;
$$;

create trigger payments_price
  before insert on payments
  for each row execute function price_payment();

-- ---------------------------------------------------------------- payments: transitions

/**
 * Replaces the 0006 guard. Same escrow rules, plus delivery and checkout fields.
 *
 * Field authority is checked before the early return on unchanged status,
 * which is the bug 0006 fixed and must stay fixed.
 */
create or replace function public.guard_payment_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_is_admin boolean := is_admin();
  actor uuid := auth.uid();
  next_step delivery_status;
begin
  -- Checkout details are the buyer's, and only before they pay.
  if (new.delivery_address is distinct from old.delivery_address
      or new.payment_method is distinct from old.payment_method)
     and not actor_is_admin then
    if actor <> old.buyer_id then
      raise exception 'Only the buyer can change checkout details';
    end if;
    if old.status <> 'initiated' then
      raise exception 'Checkout details are fixed once payment is made';
    end if;
  end if;

  -- The delivery partner reports progress, never the buyer or the seller.
  -- In the pilot an admin stands in for the partner's webhook.
  if new.delivery_status is distinct from old.delivery_status then
    if not actor_is_admin then
      raise exception 'Only ReWyse operations can update a delivery';
    end if;
    if old.status <> 'held' then
      raise exception 'Only a paid order can be delivered';
    end if;
    next_step := case old.delivery_status
      when 'scheduled' then 'picked_up'::delivery_status
      when 'picked_up' then 'out_for_delivery'::delivery_status
      when 'out_for_delivery' then 'delivered'::delivery_status
      else null
    end;
    if new.delivery_status is distinct from next_step then
      raise exception 'Deliveries move one step at a time';
    end if;
    case new.delivery_status
      when 'picked_up' then new.picked_up_at := now();
      when 'out_for_delivery' then new.out_for_delivery_at := now();
      when 'delivered' then new.delivered_at := now();
      else null;
    end case;
  end if;

  -- Only the buyer may say they received the item, and only once it has been delivered.
  if new.buyer_confirmed_at is distinct from old.buyer_confirmed_at then
    if new.buyer_confirmed_at is not null and actor <> old.buyer_id and not actor_is_admin then
      raise exception 'Only the buyer can confirm receipt';
    end if;
    if new.buyer_confirmed_at is null and not actor_is_admin then
      raise exception 'Confirmation cannot be withdrawn';
    end if;
    if new.buyer_confirmed_at is not null and old.status <> 'held' then
      raise exception 'Only a held payment can be confirmed';
    end if;
    if new.buyer_confirmed_at is not null and new.delivery_status is distinct from 'delivered' then
      raise exception 'You can confirm once the item has been delivered';
    end if;
  end if;

  if new.status = old.status then
    return new;
  end if;

  if old.status in ('released', 'refunded', 'cancelled') then
    raise exception 'This payment is already %', old.status;
  end if;

  if new.status in ('released', 'refunded') and not actor_is_admin then
    raise exception 'Only an admin can release or refund a payment';
  end if;

  if new.status = 'released' and new.buyer_confirmed_at is null then
    raise exception 'Cannot release before the buyer confirms they received the item';
  end if;

  if new.status = 'held' then
    if old.status <> 'initiated' then
      raise exception 'Only a new payment can be captured';
    end if;
    if new.delivery_address is null or length(trim(new.delivery_address)) = 0 then
      raise exception 'Add a delivery address before paying';
    end if;
    -- The partner is assigned the moment money is held, as a real dispatch would.
    new.delivery_status  := 'scheduled';
    new.scheduled_at     := now();
    new.delivery_partner := 'SwiftDrop Logistics';
    new.rider_name       := (array['Ravi Kumar', 'Sunil Yadav', 'Amit Singh', 'Deepak Sharma'])
                              [1 + abs(hashtext(new.id::text)::bigint) % 4];
    new.tracking_id      := 'SWD' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  end if;

  if new.status = 'released' then
    new.payout_reference    := 'PAYOUT-SIM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    new.payout_account_mask := 'HDFC Bank ••••' || lpad((abs(hashtext(old.seller_id::text)::bigint) % 10000)::text, 4, '0');
  end if;

  return new;
end;
$$;

-- The 0005 trigger fired only on status and buyer_confirmed_at; delivery and
-- checkout fields need the guard too.
drop trigger payments_guard_transition on payments;
create trigger payments_guard_transition
  before update on payments
  for each row execute function guard_payment_transition();

/**
 * The listing follows the money. Done here rather than in the app because the
 * buyer's session cannot update the seller's listing under RLS, so the old
 * app-side update silently did nothing.
 */
create or replace function public.sync_listing_with_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    update listings
    set status = case new.status
      when 'held' then 'pending_pickup'::listing_status
      when 'released' then 'completed'::listing_status
      when 'refunded' then 'active'::listing_status
      else status
    end
    where id = new.listing_id;
  end if;
  return new;
end;
$$;

create trigger payments_sync_listing
  after update of status on payments
  for each row execute function sync_listing_with_payment();

-- ---------------------------------------------------------------- payments: grants

-- Column grants replace the table-wide UPDATE from 0007. Amounts are absent on
-- purpose: nobody edits a price after the database has set it.
revoke update on payments from authenticated;
grant update (
  status, buyer_confirmed_at, delivery_address, payment_method, delivery_status,
  released_by, released_at, refunded_by, refunded_at, admin_note
) on payments to authenticated;

-- A buyer keeps seeing what they bought after it leaves the feed.
create policy listings_select_buyer on listings
  for select using (id in (select listing_id from payments where buyer_id = auth.uid()));

-- ---------------------------------------------------------------- listings: price reasoning

-- The model's reasoning for the item's value, shown to buyers. Never the
-- urgency maths, which is code and recomputed on demand.
alter table listings add column price_reasoning jsonb;

-- ---------------------------------------------------------------- boosts

create table boosts (
  id                uuid primary key default gen_random_uuid(),
  listing_id        uuid not null references listings(id) on delete cascade,
  seller_id         uuid not null references profiles(id) on delete cascade,
  plan              text not null check (plan in ('boost_3d', 'boost_7d')),
  amount            integer not null check (amount > 0),
  starts_at         timestamptz not null default now(),
  ends_at           timestamptz not null,
  payment_reference text not null default ('XPAY-SIM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  is_simulated      boolean not null default true,
  created_at        timestamptz not null default now()
);
create index boosts_active_idx on boosts(listing_id, ends_at);
create index boosts_seller_idx on boosts(seller_id, created_at desc);

/** Plan decides price and length; the client only picks the plan. */
create or replace function public.price_boost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  l listings%rowtype;
  days integer;
begin
  select * into l from listings where id = new.listing_id;
  if not found or l.seller_id <> new.seller_id then
    raise exception 'You can only boost your own listing';
  end if;
  if l.status <> 'active' then
    raise exception 'Only a live listing can be boosted';
  end if;

  new.amount := case new.plan when 'boost_3d' then 29 else 49 end;
  days := case new.plan when 'boost_3d' then 3 else 7 end;
  -- A second boost extends the first rather than overlapping it.
  new.starts_at := greatest(now(), coalesce(
    (select max(ends_at) from boosts where listing_id = new.listing_id), now()));
  new.ends_at := new.starts_at + make_interval(days => days);
  return new;
end;
$$;

create trigger boosts_price
  before insert on boosts
  for each row execute function price_boost();

alter table boosts enable row level security;
grant select, insert on boosts to authenticated;

-- Anyone who can see the listing can see that it is boosted: the feed needs it.
create policy boosts_select_visible on boosts
  for select using (listing_id in (select id from listings));

create policy boosts_insert_own on boosts
  for insert with check (is_verified() and seller_id = auth.uid());

create policy boosts_admin on boosts
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------- realtime

-- The buyer's order page updates live while operations advances the delivery.
alter publication supabase_realtime add table payments;

-- ---------------------------------------------------------------- storage

-- iPhones record .mov; rejecting it would fail the verification video on half
-- the phones on campus.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
where id = 'listing-media';
