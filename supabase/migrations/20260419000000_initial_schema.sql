-- ── Extensions ──────────────────────────────────────────────────────────────

create extension if not exists vector with schema extensions;

-- ── Enums ───────────────────────────────────────────────────────────────────

create type ais_source as enum ('ais_live', 'gfw', 'backfill');

-- ── Tables ──────────────────────────────────────────────────────────────────

create table vessels (
  mmsi          text        primary key,
  imo           text,
  name          text,
  flag          text,
  vessel_type   text,
  dwt           numeric,
  built_year    smallint,
  updated_at    timestamptz not null default now()
);

create table positions (
  id            bigserial   primary key,
  mmsi          text        not null references vessels (mmsi) on delete cascade,
  ts            timestamptz not null,
  lat           double precision not null,
  lon           double precision not null,
  sog           numeric,
  cog           numeric,
  draft         numeric,
  source        ais_source  not null,
  inserted_at   timestamptz not null default now()
);

create table daily_transits (
  date          date        primary key,
  vessel_count  integer     not null default 0,
  by_flag       jsonb       not null default '{}',
  avg_draft     numeric
);

create table flag_mix_daily (
  date          date        not null,
  flag          text        not null,
  count         integer     not null default 0,
  share         numeric     not null default 0,
  primary key (date, flag)
);

create table throughput_mbd_daily (
  date          date        primary key,
  mbd           numeric     not null,
  method        text        not null
);

create table petrodollar_daily (
  date          date        primary key,
  brent_usd     numeric,
  wti_usd       numeric,
  source        text        not null
);

create table data_quality_daily (
  date                      date    primary key,
  ais_messages_received     integer not null default 0,
  transponder_silence_flag  boolean not null default false,
  notes                     text
);

create table events (
  id            uuid        primary key default gen_random_uuid(),
  ts            timestamptz not null,
  kind          text        not null,
  title         text        not null,
  description   text
);

create table chatbot_docs (
  id            uuid        primary key default gen_random_uuid(),
  chunk         text        not null,
  embedding     extensions.vector(1536),
  metadata      jsonb       not null default '{}'
);

-- ── Indices ──────────────────────────────────────────────────────────────────

create index positions_mmsi_ts_idx  on positions using btree (mmsi, ts);
create index positions_ts_idx       on positions using btree (ts);

create index chatbot_docs_embedding_idx
  on chatbot_docs
  using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 100);

-- ── Row Level Security ───────────────────────────────────────────────────────

alter table vessels              enable row level security;
alter table positions            enable row level security;
alter table daily_transits       enable row level security;
alter table flag_mix_daily       enable row level security;
alter table throughput_mbd_daily enable row level security;
alter table petrodollar_daily    enable row level security;
alter table data_quality_daily   enable row level security;
alter table events               enable row level security;
alter table chatbot_docs         enable row level security;

-- Public read on aggregate tables and events (anon + authenticated).
-- No write policies defined, so no role can insert/update/delete via PostgREST.

create policy "public read" on daily_transits
  for select using (true);

create policy "public read" on flag_mix_daily
  for select using (true);

create policy "public read" on throughput_mbd_daily
  for select using (true);

create policy "public read" on petrodollar_daily
  for select using (true);

create policy "public read" on data_quality_daily
  for select using (true);

create policy "public read" on events
  for select using (true);

-- Authenticated-only read on raw data tables (no anon access).

create policy "authenticated read" on vessels
  for select using (auth.role() = 'authenticated');

create policy "authenticated read" on positions
  for select using (auth.role() = 'authenticated');

-- chatbot_docs is internal; authenticated read only.

create policy "authenticated read" on chatbot_docs
  for select using (auth.role() = 'authenticated');

-- ── Seed ────────────────────────────────────────────────────────────────────

insert into events (ts, kind, title, description) values (
  '2026-02-28T00:00:00Z',
  'regime_change',
  'Strait closure',
  'Feb 28 2026 strait closure event. Pre/post split anchor for correlation analysis.'
);
