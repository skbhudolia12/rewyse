-- Reference data for the Delhi cluster pilot.
-- Idempotent: safe to re-run against an existing database.
--
-- NOTE: meetup point names are placeholders chosen to be plausible campus
-- landmarks. Walk each campus and replace them with real, well-lit, staffed
-- locations before that campus goes live -- this list is a safety control, not
-- decoration, and a student will actually go stand where it says.

insert into clusters (id, name)
values ('11111111-1111-1111-1111-111111111111', 'Delhi Cluster')
on conflict (id) do nothing;

insert into campuses (id, cluster_id, name, abbreviation) values
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111111', 'IIIT Delhi',                 'IIITD'),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111111', 'IIT Delhi',                  'IITD'),
  ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111111', 'Delhi Technological University', 'DTU')
on conflict (id) do nothing;

insert into campus_domains (campus_id, domain) values
  ('22222222-2222-2222-2222-222222222201', 'iiitd.ac.in'),
  ('22222222-2222-2222-2222-222222222202', 'iitd.ac.in'),
  ('22222222-2222-2222-2222-222222222203', 'dtu.ac.in')
on conflict (domain) do nothing;

insert into safe_meetup_points (campus_id, name) values
  ('22222222-2222-2222-2222-222222222201', 'Library Foyer'),
  ('22222222-2222-2222-2222-222222222201', 'Academic Block Entrance'),
  ('22222222-2222-2222-2222-222222222201', 'Main Gate Security Desk'),
  ('22222222-2222-2222-2222-222222222202', 'Central Library Steps'),
  ('22222222-2222-2222-2222-222222222202', 'Main Gate Security Desk'),
  ('22222222-2222-2222-2222-222222222202', 'Student Activity Centre'),
  ('22222222-2222-2222-2222-222222222203', 'Central Library Entrance'),
  ('22222222-2222-2222-2222-222222222203', 'Main Gate Security Desk'),
  ('22222222-2222-2222-2222-222222222203', 'Sports Complex Entrance')
on conflict do nothing;

-- Seed comparables. These override the LLM whenever a listing title matches the
-- keyword, so they are the mechanism for correcting the model when it is wrong
-- about a specific item's local resale value. Expand this table during the pilot
-- rather than tuning the prompt for one-off mistakes.
insert into comparables (cluster_id, category, keyword, base_value, note) values
  ('11111111-1111-1111-1111-111111111111', 'furniture',   'study table',    2500, 'Seeded pre-launch, unverified'),
  ('11111111-1111-1111-1111-111111111111', 'furniture',   'study chair',    1800, 'Seeded pre-launch, unverified'),
  ('11111111-1111-1111-1111-111111111111', 'furniture',   'mattress',       2000, 'Seeded pre-launch, unverified'),
  ('11111111-1111-1111-1111-111111111111', 'furniture',   'bookshelf',      1500, 'Seeded pre-launch, unverified'),
  ('11111111-1111-1111-1111-111111111111', 'appliances',  'induction',      1200, 'Seeded pre-launch, unverified'),
  ('11111111-1111-1111-1111-111111111111', 'appliances',  'kettle',          600, 'Seeded pre-launch, unverified'),
  ('11111111-1111-1111-1111-111111111111', 'appliances',  'table fan',       900, 'Seeded pre-launch, unverified'),
  ('11111111-1111-1111-1111-111111111111', 'appliances',  'mini fridge',    5500, 'Seeded pre-launch, unverified'),
  ('11111111-1111-1111-1111-111111111111', 'electronics', 'monitor',        6000, 'Seeded pre-launch, unverified'),
  ('11111111-1111-1111-1111-111111111111', 'electronics', 'mechanical keyboard', 2500, 'Seeded pre-launch, unverified')
on conflict do nothing;
