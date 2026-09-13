-- Reconciles table GRANTs with the RLS policies that depend on them.
--
-- An RLS policy does not grant a privilege. Postgres checks the GRANT first and
-- the policy second, so a table with `for all using (is_admin())` and no UPDATE
-- grant gives an admin "permission denied for table ..." -- which is what
-- approving an ID did. Every admin write in the console was in that state:
-- reviewing an ID, actioning a report, editing comparables, adding a campus or
-- a meetup point.
--
-- RLS remains the gate on WHO. These grants only make the policies reachable.

-- ---------------------------------------------------------------- over-grant

-- 0003 revoked everything then granted back explicitly, but `payments` was
-- created afterwards in 0005 and picked up Supabase's default privileges --
-- which include TRUNCATE, and TRUNCATE bypasses row level security entirely.
-- A signed-in student should never hold it.
revoke all on payments from anon, authenticated;
grant select, insert, update on payments to authenticated;

-- ---------------------------------------------------------------- ID review

-- The reviewer writes the decision. document_path is omitted on purpose: the
-- trigger nulls it, and a BEFORE trigger assigning NEW does not require the
-- caller to hold UPDATE on that column.
grant update (status, reviewed_by, reviewed_at, rejection_reason)
  on id_verifications to authenticated;

-- ---------------------------------------------------------------- moderation

grant update (status, reviewed_by, reviewed_at, action_taken)
  on reports to authenticated;

-- ---------------------------------------------------------------- admin reference data

-- Curating comparables is how the team corrects the pricing model when it is
-- wrong about a specific item, so it has to be reachable from the console
-- rather than requiring a database session.
grant insert, update, delete on comparables to authenticated;

-- Seeding a campus's approved meetup points is a prerequisite for that campus
-- going live at all.
grant insert, update, delete on safe_meetup_points to authenticated;
grant insert, update, delete on clusters to authenticated;
grant insert, update, delete on campuses to authenticated;
grant insert, update, delete on campus_domains to authenticated;

-- ---------------------------------------------------------------- note
--
-- price_cache stays granted to NOBODY. Its admin policy is unreachable by
-- design: the cache is written only by the server with the service role, so a
-- forged entry cannot drive the price shown to a seller. That gap is deliberate
-- and should stay.
