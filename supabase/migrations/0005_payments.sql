-- Simulated escrow for the pilot.
--
-- NO REAL MONEY MOVES THROUGH THIS. Every row here is a record of a pretend
-- payment made through a pretend gateway, so the team can watch students walk
-- the hold-and-release flow and say whether it makes sense to them.
--
-- Holding real student funds in India needs an RBI-licensed payment aggregator
-- and a registered entity. When that exists, this table is the seam a real
-- provider drops into: add provider_payment_id, swap the simulated gateway for
-- the real one, and the states below stay as they are.
--
-- is_simulated defaults TRUE and is NOT NULL on purpose. If this schema is ever
-- reused for live payments, every pre-existing row still says plainly that it
-- was never real -- rather than becoming indistinguishable from a genuine one.

create type payment_status as enum (
  'initiated',   -- buyer sent to the gateway
  'held',        -- gateway "captured"; funds notionally with ReWyse
  'released',    -- buyer confirmed receipt; paid out to the seller
  'refunded',    -- deal fell through; returned to the buyer
  'cancelled'    -- abandoned before capture
);

create table payments (
  id                 uuid primary key default gen_random_uuid(),
  listing_id         uuid not null references listings(id) on delete cascade,
  conversation_id    uuid references conversations(id) on delete set null,
  buyer_id           uuid not null references profiles(id) on delete cascade,
  seller_id          uuid not null references profiles(id) on delete cascade,
  amount             integer not null check (amount > 0),
  status             payment_status not null default 'initiated',

  -- Stand-in for a real gateway's reference. Prefixed so it can never be
  -- mistaken for a provider id in a log or a support conversation.
  gateway_reference  text not null default ('XPAY-SIM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  is_simulated       boolean not null default true,

  buyer_confirmed_at timestamptz,
  released_by        uuid references profiles(id) on delete set null,
  released_at        timestamptz,
  refunded_by        uuid references profiles(id) on delete set null,
  refunded_at        timestamptz,
  admin_note         text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  check (buyer_id <> seller_id)
);

create index payments_status_idx on payments(status, created_at);
create index payments_buyer_idx on payments(buyer_id, created_at desc);
create index payments_seller_idx on payments(seller_id, created_at desc);
create index payments_listing_idx on payments(listing_id);

-- One live payment per listing: a second buyer must not be able to pay for an
-- item that is already held or sold.
create unique index payments_one_active_per_listing
  on payments(listing_id)
  where status in ('initiated', 'held', 'released');

create trigger payments_touch before update on payments
  for each row execute function touch_updated_at();

alter table payments enable row level security;

grant select, insert, update on payments to authenticated;

create policy payments_select_party on payments
  for select using (buyer_id = auth.uid() or seller_id = auth.uid());

-- Only a verified buyer starts a payment, only on someone else's listing.
create policy payments_insert_buyer on payments
  for insert with check (
    is_verified()
    and buyer_id = auth.uid()
    and seller_id <> auth.uid()
  );

-- A party may update their own payment, but releasing money is NOT theirs to
-- do: the status transitions are enforced by the trigger below, which is what
-- actually stops a buyer marking their own payment released.
create policy payments_update_party on payments
  for update using (buyer_id = auth.uid() or seller_id = auth.uid())
  with check (buyer_id = auth.uid() or seller_id = auth.uid());

create policy payments_admin on payments
  for all using (is_admin()) with check (is_admin());

/**
 * Guards the state machine.
 *
 * RLS decides who may touch a row; this decides what they may turn it into.
 * Without it, the buyer's own update policy would let them move a payment
 * straight to 'released' and take the money out of hold themselves.
 */
create or replace function public.guard_payment_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_is_admin boolean := is_admin();
begin
  if new.status = old.status then
    return new;
  end if;

  -- Releasing and refunding are admin-only, always.
  if new.status in ('released', 'refunded') and not actor_is_admin then
    raise exception 'Only an admin can release or refund a payment';
  end if;

  -- A payment may only be released once the buyer has confirmed receipt.
  if new.status = 'released' and new.buyer_confirmed_at is null then
    raise exception 'Cannot release before the buyer confirms they received the item';
  end if;

  -- Buyer confirmation is the buyer's alone.
  if new.buyer_confirmed_at is distinct from old.buyer_confirmed_at
     and new.buyer_confirmed_at is not null
     and auth.uid() <> old.buyer_id
     and not actor_is_admin then
    raise exception 'Only the buyer can confirm receipt';
  end if;

  -- Terminal states are terminal.
  if old.status in ('released', 'refunded', 'cancelled') then
    raise exception 'This payment is already %', old.status;
  end if;

  return new;
end;
$$;

create trigger payments_guard_transition
  before update of status, buyer_confirmed_at on payments
  for each row execute function guard_payment_transition();
