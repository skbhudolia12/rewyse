-- Fixes an authorisation hole in guard_payment_transition.
--
-- The original guarded the buyer-confirmation field, but only AFTER an early
-- return that fired whenever `status` was unchanged. Confirming receipt does
-- not change status, so that check was unreachable: a seller could set
-- buyer_confirmed_at on their own sale, and an admin seeing "buyer confirmed"
-- would then release the funds. That is the whole escrow guarantee gone.
--
-- Caught by tests/payments.integration.test.ts before any of it shipped.
--
-- The lesson kept in the new ordering: authority over a FIELD is checked
-- independently of whether the row's status is moving.

create or replace function public.guard_payment_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_is_admin boolean := is_admin();
begin
  -- Field-level authority first: this must hold whether or not status moves.
  -- Only the buyer may assert that they received the item.
  if new.buyer_confirmed_at is distinct from old.buyer_confirmed_at then
    if new.buyer_confirmed_at is not null
       and auth.uid() <> old.buyer_id
       and not actor_is_admin then
      raise exception 'Only the buyer can confirm receipt';
    end if;
    -- Un-confirming is an admin correction, never a party's own doing.
    if new.buyer_confirmed_at is null and not actor_is_admin then
      raise exception 'Confirmation cannot be withdrawn';
    end if;
  end if;

  -- A confirmation is only meaningful while the payment is actually in hold.
  if new.buyer_confirmed_at is distinct from old.buyer_confirmed_at
     and new.buyer_confirmed_at is not null
     and old.status <> 'held' then
    raise exception 'Only a held payment can be confirmed';
  end if;

  if new.status = old.status then
    return new;
  end if;

  -- Terminal states are terminal.
  if old.status in ('released', 'refunded', 'cancelled') then
    raise exception 'This payment is already %', old.status;
  end if;

  -- Moving money is an admin decision, never a party's.
  if new.status in ('released', 'refunded') and not actor_is_admin then
    raise exception 'Only an admin can release or refund a payment';
  end if;

  -- And release specifically requires the buyer's green light.
  if new.status = 'released' and new.buyer_confirmed_at is null then
    raise exception 'Cannot release before the buyer confirms they received the item';
  end if;

  return new;
end;
$$;
