-- ReWyse core schema
-- Delhi cluster campus marketplace: listings, rule-assisted pricing, offers, chat, meetups.
-- Payments are deliberately absent: exchange happens in person, off-platform.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums

create type id_review_status    as enum ('not_submitted', 'pending_review', 'approved', 'rejected');
create type verified_status     as enum ('pending', 'verified', 'rejected');
create type user_role           as enum ('student', 'admin');
create type listing_category    as enum ('electronics', 'furniture', 'books', 'appliances', 'other');
create type functional_status   as enum ('fully_working', 'partially_working', 'for_parts');
create type listing_status      as enum ('active', 'pending_pickup', 'completed', 'removed');
create type conversation_status as enum ('open', 'meetup_proposed', 'confirmed', 'completed', 'cancelled');
create type offer_status        as enum ('pending', 'accepted', 'rejected', 'countered', 'expired');
create type base_value_source   as enum ('llm', 'comparables', 'category_default');
create type pricing_outcome     as enum ('accepted_sell_fast', 'within_range', 'above_range', 'below_range');
create type report_target_type  as enum ('listing', 'user', 'conversation');
create type report_status       as enum ('open', 'reviewing', 'actioned', 'dismissed');
create type media_kind          as enum ('photo', 'video');

-- ---------------------------------------------------------------- geography

create table clusters (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table campuses (
  id           uuid primary key default gen_random_uuid(),
  cluster_id   uuid not null references clusters(id) on delete restrict,
  name         text not null,
  abbreviation text not null unique,
  created_at   timestamptz not null default now()
);
create index campuses_cluster_idx on campuses(cluster_id);

-- Allow-list driving signup gate A. One campus may have several valid domains.
create table campus_domains (
  id         uuid primary key default gen_random_uuid(),
  campus_id  uuid not null references campuses(id) on delete cascade,
  domain     text not null unique,
  created_at timestamptz not null default now()
);
create index campus_domains_campus_idx on campus_domains(campus_id);

-- Admin-seeded. Users never free-type a meetup location (trust/safety control).
create table safe_meetup_points (
  id         uuid primary key default gen_random_uuid(),
  campus_id  uuid not null references campuses(id) on delete cascade,
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index safe_meetup_points_campus_idx on safe_meetup_points(campus_id) where active;

-- ---------------------------------------------------------------- people

create table profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  full_name        text not null,
  email            text not null unique,
  campus_id        uuid not null references campuses(id) on delete restrict,
  hostel_or_hall   text,
  moveout_date     date not null,
  role             user_role not null default 'student',
  -- Gate A (email domain) and Gate B (ID review) are independent; both must pass.
  email_domain_ok  boolean not null default false,
  id_review_status id_review_status not null default 'not_submitted',
  verified_status  verified_status not null default 'pending',
  trust_score      integer not null default 100 check (trust_score between 0 and 100),
  banned_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index profiles_campus_idx on profiles(campus_id);

-- Separate table so RLS can lock the ID document away from every non-admin.
-- document_path is NULLED on review decision; the decision itself is retained.
create table id_verifications (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references profiles(id) on delete cascade,
  document_path    text,
  status           id_review_status not null default 'pending_review',
  submitted_at     timestamptz not null default now(),
  reviewed_by      uuid references profiles(id) on delete set null,
  reviewed_at      timestamptz,
  rejection_reason text
);
create index id_verifications_queue_idx on id_verifications(submitted_at) where status = 'pending_review';
create index id_verifications_profile_idx on id_verifications(profile_id);

-- ---------------------------------------------------------------- listings

create table listings (
  id                        uuid primary key default gen_random_uuid(),
  seller_id                 uuid not null references profiles(id) on delete cascade,
  campus_id                 uuid not null references campuses(id) on delete restrict,
  title                     text not null check (length(trim(title)) > 0),
  description               text,
  category                  listing_category not null,
  functional_status         functional_status not null,
  cosmetic_flaws            text,
  accessories_included      text,
  moveout_date              date not null,
  suggested_price_min       integer,
  suggested_price_max       integer,
  suggested_sell_fast_price integer,
  asking_price              integer not null check (asking_price >= 0),
  status                    listing_status not null default 'active',
  published_at              timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index listings_campus_status_idx on listings(campus_id, status);
create index listings_moveout_idx on listings(moveout_date) where status = 'active';
create index listings_seller_idx on listings(seller_id);

-- One row per photo/video. is_live_capture enforces the "not a stock photo" rule.
create table listing_media (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references listings(id) on delete cascade,
  kind            media_kind not null,
  storage_path    text not null,
  is_live_capture boolean not null default false,
  position        integer not null default 0,
  created_at      timestamptz not null default now()
);
create index listing_media_listing_idx on listing_media(listing_id, position);

-- ---------------------------------------------------------------- pricing

-- Manually curated base values. Overrides the LLM whenever a row matches.
create table comparables (
  id         uuid primary key default gen_random_uuid(),
  cluster_id uuid references clusters(id) on delete cascade,
  category   listing_category not null,
  keyword    text not null,
  base_value integer not null check (base_value > 0),
  note       text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index comparables_lookup_idx on comparables(category, keyword);

-- LLM response cache, keyed on item identity only and NOT on moveout date --
-- urgency is pure local math, so changing the date must never spend quota.
create table price_cache (
  cache_key   text primary key,
  base_value  integer not null,
  source      base_value_source not null,
  model_used  text,
  reasoning   text,
  confidence  numeric(3, 2),
  hit_count   integer not null default 0,
  created_at  timestamptz not null default now(),
  last_hit_at timestamptz not null default now()
);

-- The hypothesis ledger. One row per suggestion shown to a seller, including
-- every "Drop Price with AI" re-run. prompt_version segments pre/post tuning.
create table pricing_events (
  id                   uuid primary key default gen_random_uuid(),
  listing_id           uuid references listings(id) on delete set null,
  seller_id            uuid not null references profiles(id) on delete cascade,
  category             listing_category not null,
  title_snapshot       text not null,
  base_value           integer not null,
  base_value_source    base_value_source not null,
  condition_multiplier numeric(4, 3) not null,
  days_until_moveout   integer not null,
  urgency_factor       numeric(4, 3) not null,
  fair_min             integer not null,
  fair_max             integer not null,
  sell_fast_price      integer not null,
  model_used           text,
  prompt_version       text not null,
  raw_model_response   jsonb,
  latency_ms           integer,
  is_repricing         boolean not null default false,
  final_asking_price   integer,
  outcome              pricing_outcome,
  created_at           timestamptz not null default now()
);
create index pricing_events_listing_idx on pricing_events(listing_id);
create index pricing_events_outcome_idx on pricing_events(outcome, created_at);

-- ---------------------------------------------------------------- transaction

create table conversations (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  buyer_id   uuid not null references profiles(id) on delete cascade,
  seller_id  uuid not null references profiles(id) on delete cascade,
  status     conversation_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, buyer_id),
  check (buyer_id <> seller_id)
);
create index conversations_buyer_idx on conversations(buyer_id, updated_at desc);
create index conversations_seller_idx on conversations(seller_id, updated_at desc);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id       uuid not null references profiles(id) on delete cascade,
  body            text not null check (length(trim(body)) > 0),
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index messages_conversation_idx on messages(conversation_id, created_at);

-- Structured so "accepted at sell-fast price, zero counters" is a query,
-- not a manual read of chat logs.
create table offers (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  listing_id      uuid not null references listings(id) on delete cascade,
  buyer_id        uuid not null references profiles(id) on delete cascade,
  seller_id       uuid not null references profiles(id) on delete cascade,
  amount          integer not null check (amount >= 0),
  status          offer_status not null default 'pending',
  counter_of      uuid references offers(id) on delete set null,
  -- Snapshot of what the engine suggested when this offer was made, so later
  -- prompt tuning cannot retroactively change what an offer is measured against.
  suggested_sell_fast_at_offer integer,
  suggested_min_at_offer       integer,
  suggested_max_at_offer       integer,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);
create index offers_conversation_idx on offers(conversation_id, created_at);
create index offers_listing_idx on offers(listing_id);

create table meetup_proposals (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  proposed_by     uuid not null references profiles(id) on delete cascade,
  meetup_point_id uuid not null references safe_meetup_points(id) on delete restrict,
  proposed_time   timestamptz not null,
  accepted_at     timestamptz,
  cancelled_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index meetup_proposals_conversation_idx on meetup_proposals(conversation_id, created_at);

-- ---------------------------------------------------------------- safety and comms

create table reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references profiles(id) on delete cascade,
  target_type  report_target_type not null,
  target_id    uuid not null,
  reason       text not null,
  detail       text,
  status       report_status not null default 'open',
  reviewed_by  uuid references profiles(id) on delete set null,
  reviewed_at  timestamptz,
  action_taken text,
  created_at   timestamptz not null default now()
);
create index reports_queue_idx on reports(created_at) where status = 'open';

-- Drives both the in-app bell and the email dispatcher, so the two cannot drift.
create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_unread_idx on notifications(user_id, created_at desc) where read_at is null;
create index notifications_pending_email_idx on notifications(created_at) where emailed_at is null;
