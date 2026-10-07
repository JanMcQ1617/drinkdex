-- ====================================================================
-- Sipply — the whole schema, as of migration 020
--
-- FOR A NEW, EMPTY SUPABASE PROJECT ONLY. Paste into the SQL Editor and
-- Run once. It builds in one pass what the original base schema plus
-- migrations 002-020 built on the live project, and records every one of
-- them in schema_migrations, so 009's drift check reads the same on both.
--
-- NEVER RUN IT ON THE LIVE PROJECT. The live database changes only through
-- the numbered files in migrations/, applied in order. This file used to
-- be the base alone and to say "Safe to re-run"; re-running it after 006
-- quietly reset posts_read and profiles_read to using (true) and switched
-- block filtering off, with schema_migrations still showing 006 applied.
-- Written as the current state, a re-run would no longer revert anything,
-- but that only holds while this file is kept in step, so do not rely on
-- it.
--
-- KEEPING IT IN STEP: every new migration changes this file too, in the
-- same commit, and adds its row to the schema_migrations insert at the
-- bottom. src/lib/database.types.ts follows this file. The "why" behind
-- each rule lives in the migration that introduced it, named in each
-- section; this file keeps only enough to read it.
--
-- Every table has Row Level Security ON. The app ships a publishable
-- key, which is public by design; RLS is what actually protects the
-- data, so no policy may ever trust the client.
-- ====================================================================


-- --------------------------------------------------------------------
-- Record-keeping (009)
--
-- First, so the rows at the bottom have somewhere to go.
-- --------------------------------------------------------------------

create table if not exists public.schema_migrations (
  version    text primary key,
  applied_at timestamptz not null default now(),
  note       text
);

alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated;


-- --------------------------------------------------------------------
-- Extensions and the private schema (011, 013, 018)
--
-- `private` is not exposed by the API: its functions serve policies and
-- other functions and cannot be called as RPCs. `authenticated` needs
-- USAGE because RLS policies run as the querying role.
--
-- pg_cron runs the monthly drink-suggestions email (018). On a new
-- project enable it first (Dashboard -> Integrations -> Cron -> Enable);
-- if the line below errors, that is why. unaccent lives in `extensions`,
-- and everything that folds a drink name calls it by its full name.
-- --------------------------------------------------------------------

create extension if not exists pg_net;
create extension if not exists pg_cron;
create extension if not exists unaccent with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;


-- --------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------

-- 003 bounds every text column, 010 adds the avatar, 014 ties the avatar
-- path to its owner's folder.
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  username     text unique not null,
  display_name text not null,
  -- Avatar tint. Hex from the app's palette.
  accent       text not null default '#633444',
  bio          text,
  created_at   timestamptz not null default now(),
  avatar_path  text,
  constraint profiles_username_shape    check (username ~ '^[a-z0-9._]{3,24}$'),
  constraint profiles_display_name_len  check (char_length(display_name) between 1 and 40),
  constraint profiles_bio_len           check (bio is null or char_length(bio) <= 300),
  constraint profiles_accent_hex        check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  constraint profiles_avatar_path_len   check (avatar_path is null or char_length(avatar_path) <= 200),
  constraint profiles_avatar_path_owned check (avatar_path is null or split_part(avatar_path, '/', 1) = id::text)
);

comment on column public.profiles.avatar_path is
  'Object path in the private `pours` bucket, `<uid>/<file>`. Null means '
  'fall back to initials on the accent colour. Read through a signed URL.';

-- Discovery hashes (008). No grants and no policies: reachable only
-- through the SECURITY DEFINER functions below.
create table if not exists public.profile_secrets (
  user_id        uuid primary key references public.profiles on delete cascade,
  -- Salted SHA-256 of the phone number, computed on the device.
  phone_hash     text,
  -- Salted SHA-256 of the normalized Instagram handle, different salt.
  instagram_hash text,
  updated_at     timestamptz not null default now()
);

create table if not exists public.follows (
  follower_id  uuid not null references public.profiles on delete cascade,
  following_id uuid not null references public.profiles on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  -- You cannot follow yourself; your own posts are added to the feed
  -- by the client, not by an edge.
  constraint no_self_follow check (follower_id <> following_id)
);

-- One post per drink per person (007), carrying every photo of it.
create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles on delete cascade,
  -- An id in the app's bundled drinks.json, not a DB row: the Dex ships
  -- with the app. Bounded by length, not shape (014), because posts for
  -- drinks since removed from the Dex keep their old ids.
  drink_id   text not null,
  caption    text not null default '',
  -- Newest photo's path in the 'pours' bucket, kept by sync_post_preview.
  -- Null when no photo.
  photo_path text,
  -- Set by the server on insert, never changeable (011).
  created_at timestamptz not null default now(),
  constraint posts_one_per_drink    unique (author_id, drink_id),
  constraint posts_caption_len      check (char_length(caption) <= 2000),
  constraint posts_drink_id_len     check (char_length(drink_id) between 1 and 100),
  constraint posts_photo_path_owned check (
    photo_path is null
    or (char_length(photo_path) <= 200 and split_part(photo_path, '/', 1) = author_id::text)
  )
);

create table if not exists public.post_photos (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts on delete cascade,
  -- Path inside the 'pours' bucket, same convention as posts.photo_path.
  path       text not null,
  -- When the picture was TAKEN, which orders the carousel.
  taken_at   timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- The song on this photo's story (020): on the photo, not the post, so a
  -- re-post with no song does not inherit the last one's. All null, or all
  -- but the artwork set, on Apple's own hosts only.
  music_song_id     text,
  music_title       text,
  music_artist      text,
  music_artwork_url text,
  music_preview_url text,
  music_url         text,
  music_storefront  text,
  unique (post_id, path),
  constraint post_photos_path_len check (char_length(path) <= 200),
  constraint post_photos_music_shape check (
    num_nonnulls(music_song_id, music_title, music_artist, music_artwork_url,
                 music_preview_url, music_url, music_storefront) = 0
    or (
      num_nonnulls(music_song_id, music_title, music_artist,
                   music_preview_url, music_url, music_storefront) = 6
      and music_song_id ~ '^[0-9]{1,20}$'
      and char_length(music_title)  between 1 and 200
      and char_length(music_artist) between 1 and 200
      and char_length(music_preview_url) <= 500 and music_preview_url ~ '^https://audio-ssl\.itunes\.apple\.com/'
      and char_length(music_url) <= 500         and music_url ~ '^https://music\.apple\.com/'
      and (music_artwork_url is null
           or (char_length(music_artwork_url) <= 500 and music_artwork_url ~ '^https://is[0-9]+-ssl\.mzstatic\.com/'))
      and music_storefront ~ '^[a-z]{2}$'
    )
  )
);

create table if not exists public.likes (
  post_id    uuid not null references public.posts on delete cascade,
  user_id    uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- 006.
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles on delete cascade,
  blocked_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

-- Short videos (019). The id is made on the phone so the files can be
-- named after it before the row exists; the CHECKs tie each path to its
-- own row and its author's folder. Before reports, which can name one.
create table if not exists public.reels (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles on delete cascade,
  video_path  text not null,
  poster_path text not null,
  caption     text not null default '',
  -- An id in the bundled drinks.json, like posts.drink_id. Optional.
  drink_id    text,
  duration_ms integer not null,
  -- Filmed with the phone sideways: the viewer letterboxes instead of
  -- cropping. Read from the poster's dimensions on the phone.
  landscape   boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint reels_caption_len  check (char_length(caption) <= 300),
  constraint reels_drink_id_len check (drink_id is null or char_length(drink_id) between 1 and 100),
  constraint reels_duration     check (duration_ms between 1000 and 31000),
  constraint reels_video_path   check (
    video_path in (author_id::text || '/' || id::text || '.mov',
                   author_id::text || '/' || id::text || '.mp4')
  ),
  constraint reels_poster_path  check (poster_path = author_id::text || '/' || id::text || '.jpg')
);

create table if not exists public.reel_likes (
  reel_id    uuid not null references public.reels on delete cascade,
  user_id    uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reel_id, user_id)
);

-- 006, reshaped by 012 and 019: a report survives the deletion of its
-- reporter, its post or reel, or the person it names (each column is set
-- to null), keeps the author's id and a copy of the reported text, and
-- names exactly one subject when filed (enforced by prepare_report,
-- below).
create table if not exists public.reports (
  id                 uuid primary key default gen_random_uuid(),
  reporter_id        uuid references public.profiles on delete set null,
  reported_post_id   uuid references public.posts on delete set null,
  reported_user_id   uuid references public.profiles on delete set null,
  reason             text not null,
  note               text,
  created_at         timestamptz not null default now(),
  -- No foreign key on purpose: it outlives the account it names.
  reported_author_id uuid,
  snapshot           jsonb,
  reported_reel_id   uuid references public.reels on delete set null,
  constraint report_subject_at_most_one check (num_nonnulls(reported_post_id, reported_user_id, reported_reel_id) <= 1),
  constraint report_reason_known check (
    reason in ('spam', 'harassment', 'nudity', 'violence', 'underage', 'other')
  ),
  constraint report_note_len check (note is null or char_length(note) <= 1000)
);

-- Invite tokens (011). Every column defaults server-side; the client may
-- write inviter_id only, and RLS checks it names the caller.
create table if not exists public.invites (
  token      uuid primary key default gen_random_uuid(),
  inviter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

-- Discovery meter (011): counts and times only, never the hashes.
create table if not exists public.discovery_usage (
  user_id    uuid not null references public.profiles on delete cascade,
  matcher    text not null check (matcher in ('contacts', 'instagram')),
  hashes     integer not null check (hashes > 0),
  checked_at timestamptz not null default now()
);

-- The content filter's word list (011). Grows from the dashboard.
create table if not exists public.blocked_terms (
  term         text primary key check (term ~ '^[a-z]+( [a-z]+)*$'),
  match_inside boolean not null default false,
  created_at   timestamptz not null default now()
);

-- The email step's lookup meter (016): a hashed caller bucket and a time,
-- one row per lookup, kept an hour. Nobody can read it.
create table if not exists public.sign_in_lookups (
  bucket    text not null,
  looked_at timestamptz not null default now()
);

-- Saved posts (017): a private bookmark, readable by its owner only.
-- Cascades from both sides.
create table if not exists public.saves (
  user_id    uuid not null references public.profiles on delete cascade,
  post_id    uuid not null references public.posts    on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- Drinks people add themselves, sent as suggestions (018). Own rows only.
-- The id is made on the phone. status, catalogue_id and reviewed_at are
-- Jan's, set from the dashboard; name_key and the clocks are the
-- trigger's.
create table if not exists public.drink_submissions (
  id                 uuid primary key,
  submitter_id       uuid not null default auth.uid()
                     references public.profiles (id) on delete cascade,
  name               text not null,
  name_key           text not null default '',
  category           text not null,
  subcategory        text not null,
  subcategory_is_new boolean not null default false,
  description        text not null,
  abv_low            numeric(4,1),
  abv_high           numeric(4,1),
  origin             text not null default '',
  glassware          text not null default '',
  tasting_notes      text[] not null default '{}',
  fun_fact           text not null default '',
  ingredients        jsonb not null default '[]'::jsonb,     -- [{ "item": text, "amount": text }]
  steps              text[] not null default '{}',
  method             text not null default '',
  garnish            text not null default '',
  base               text not null default '',
  distillation       text not null default '',
  aging              text not null default '',
  serve_temp         text not null default '',
  serve_how          text not null default '',
  pairings           text[] not null default '{}',
  process            text not null default '',
  note_for_team      text not null default '',
  photo_path         text,
  status             text not null default 'new',
  catalogue_id       text,
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint drink_submissions_category   check (category in ('cocktail', 'spirit')),
  constraint drink_submissions_name_len   check (char_length(btrim(name)) between 2 and 60),
  constraint drink_submissions_subcat_len check (char_length(btrim(subcategory)) between 2 and 40),
  constraint drink_submissions_desc_len   check (char_length(btrim(description)) between 20 and 280),
  constraint drink_submissions_abv        check (
    (abv_low is null and abv_high is null)
    or (abv_low between 0.5 and 96 and (abv_high is null or abv_high between abv_low and 96))),
  constraint drink_submissions_short_text check (
        char_length(origin) <= 80 and char_length(glassware) <= 40 and char_length(garnish) <= 60
    and char_length(serve_temp) <= 60 and char_length(base) <= 120
    and char_length(distillation) <= 120 and char_length(aging) <= 120),
  constraint drink_submissions_long_text  check (
        char_length(fun_fact) <= 280 and char_length(serve_how) <= 280
    and char_length(process) <= 280 and char_length(note_for_team) <= 500),
  constraint drink_submissions_list_sizes check (
        cardinality(tasting_notes) <= 5 and cardinality(steps) <= 8 and cardinality(pairings) <= 3
    and jsonb_typeof(ingredients) = 'array' and jsonb_array_length(ingredients) <= 12),
  constraint drink_submissions_method     check (method in ('', 'shaken','built','stirred','blended',
    'boiled','infused','layered','muddled','swizzled','rolled','thrown')),
  constraint drink_submissions_photo_path check (photo_path is null or (
    char_length(photo_path) <= 200 and split_part(photo_path, '/', 1) = submitter_id::text)),
  constraint drink_submissions_status     check (status in ('new','added','duplicate','declined')),
  constraint drink_submissions_catalogue  check (catalogue_id is null or catalogue_id ~ '^[a-z0-9-]{1,100}$'),
  constraint drink_submissions_resolved   check ((status in ('added','duplicate')) = (catalogue_id is not null))
);

-- The monthly email's ledger (018): one row per month covered, a count,
-- never personal data. In `private`, so the API cannot reach it at all.
create table if not exists private.submission_digests (
  period_start date primary key,                 -- first day of the month covered, Puerto Rico time
  status       text not null default 'pending' check (status in ('pending','delivered','failed')),
  request_id   bigint,                           -- net.http_post id -> net._http_response.id
  attempts     integer not null default 0,
  submissions  integer not null default 0,
  last_error   text,
  sent_at      timestamptz,
  checked_at   timestamptz
);

-- The song-search budget (020): the apple-music Edge Function charges each
-- search to the account through charge_music_search, 120 an hour. Counts
-- and hours only, never the terms. In `private`, revoked outright.
create table if not exists private.music_search_usage (
  user_id uuid not null references public.profiles on delete cascade,
  hour    timestamptz not null,
  count   integer not null default 0,
  primary key (user_id, hour)
);

-- Tournaments (020): friends compete to try the most DIFFERENT drinks.
-- ends_at is exclusive; target null = most by the end; tz is the host's
-- IANA zone, the daily cap's calendar day. finished_at, winner_id and
-- finalized_at are written once, by finalize_tournament. Select-only for
-- clients: every write is an RPC.
create table if not exists public.tournaments (
  id           uuid primary key default gen_random_uuid(),
  host_id      uuid not null references public.profiles on delete cascade,
  name         text not null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  target       smallint,
  tz           text not null default 'UTC',
  ended_at     timestamptz,           -- the host ended it early
  finished_at  timestamptz,           -- when counting stopped (end, early end or goal)
  winner_id    uuid references public.profiles on delete set null,
  finalized_at timestamptz,           -- results frozen
  created_at   timestamptz not null default now(),
  constraint tournaments_name_shape check (
    name = btrim(name) and char_length(name) between 1 and 40 and name !~ '[\r\n\t]'),
  constraint tournaments_window check (
    ends_at - starts_at >= interval '1 day' and ends_at - starts_at <= interval '31 days'),
  constraint tournaments_target check (target is null or target between 2 and 100),
  constraint tournaments_tz_len check (char_length(tz) between 1 and 64)
);

-- The host has a row too, always 'accepted'. 'declined' covers declining,
-- leaving and being taken out by a block, and is final for that
-- tournament. The final_* columns are the frozen standings.
create table if not exists public.tournament_members (
  tournament_id    uuid not null references public.tournaments on delete cascade,
  user_id          uuid not null references public.profiles on delete cascade,
  status           text not null default 'invited'
                   check (status in ('invited', 'accepted', 'declined')),
  invited_at       timestamptz not null default now(),
  responded_at     timestamptz,
  final_distinct   smallint,
  final_reached_at timestamptz,
  final_rank       smallint,
  primary key (tournament_id, user_id)
);


-- --------------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------------

create index if not exists posts_author_created_idx      on public.posts (author_id, created_at desc);
create index if not exists posts_created_idx             on public.posts (created_at desc);
create index if not exists post_photos_post_idx          on public.post_photos (post_id, taken_at desc);
create index if not exists follows_follower_idx          on public.follows (follower_id);
create index if not exists follows_following_idx         on public.follows (following_id);
-- The primary key (post_id, user_id) serves lookups by post; this serves
-- "which of these have I liked" and the delete cascade (014).
create index if not exists likes_user_idx                on public.likes (user_id, post_id);
create index if not exists profiles_created_idx          on public.profiles (created_at desc);
create index if not exists profile_secrets_phone_idx     on public.profile_secrets (phone_hash);
create index if not exists profile_secrets_instagram_idx on public.profile_secrets (instagram_hash);
create index if not exists blocks_blocker_idx            on public.blocks (blocker_id);
create index if not exists blocks_blocked_idx            on public.blocks (blocked_id);
create index if not exists reports_created_idx           on public.reports (created_at desc);
create index if not exists reports_reporter_idx          on public.reports (reporter_id);
create index if not exists reports_reported_post_idx     on public.reports (reported_post_id);
create index if not exists reports_reported_user_idx     on public.reports (reported_user_id);
create index if not exists reports_author_idx            on public.reports (reported_author_id);
create unique index if not exists reports_once_per_post  on public.reports (reporter_id, reported_post_id)
  where reported_post_id is not null;
create unique index if not exists reports_once_per_user  on public.reports (reporter_id, reported_user_id)
  where reported_user_id is not null;
create index if not exists invites_inviter_idx           on public.invites (inviter_id);
create index if not exists discovery_usage_user_idx      on public.discovery_usage (user_id, checked_at);
-- 016.
create index if not exists sign_in_lookups_time_idx      on public.sign_in_lookups (looked_at);
create index if not exists sign_in_lookups_bucket_idx    on public.sign_in_lookups (bucket, looked_at);
-- 017: "my saves, newest first"; the post side serves the delete cascade.
-- Today's pours filters and sorts photos by when they were added.
create index if not exists saves_user_created_idx        on public.saves (user_id, created_at desc);
create index if not exists saves_post_idx                on public.saves (post_id);
create index if not exists post_photos_created_idx       on public.post_photos (created_at desc);
-- 018: one suggestion per person per normalised name; the digest selects
-- by month of last change.
create unique index if not exists drink_submissions_one_per_name
  on public.drink_submissions (submitter_id, name_key);
create index if not exists drink_submissions_updated_idx on public.drink_submissions (updated_at);
-- 019: the feed is keyset-paged on (created_at, id); a profile's reels and
-- the quota counts read by author; "which have I liked" and the delete
-- cascade read reel_likes by user; one report per reporter per reel.
create index if not exists reels_created_idx             on public.reels (created_at desc, id desc);
create index if not exists reels_author_created_idx      on public.reels (author_id, created_at desc);
create index if not exists reel_likes_user_idx           on public.reel_likes (user_id, reel_id);
create index if not exists reports_reported_reel_idx     on public.reports (reported_reel_id);
create unique index if not exists reports_once_per_reel  on public.reports (reporter_id, reported_reel_id)
  where reported_reel_id is not null;
-- 020: a host's tournaments by creation (the hosting limits); "the ones
-- I am in", by person and status.
create index if not exists tournaments_host_idx          on public.tournaments (host_id, created_at desc);
create index if not exists tournament_members_user_idx   on public.tournament_members (user_id, status);


-- --------------------------------------------------------------------
-- Functions
--
-- Every SECURITY DEFINER function pins search_path to empty, per
-- Supabase's linter: an unpinned search_path on a definer function is a
-- privilege-escalation vector. SQL-language functions come after the
-- tables they read, because Postgres checks their bodies on creation.
-- --------------------------------------------------------------------

-- A profile row for every new auth user (015). An email sign-up names its
-- own handle and name in the metadata, used as sent. Apple and Facebook
-- send neither: the handle is 'pour_' plus 8 hex digits of the id, moving
-- one digit along the id past a clash or a filter hit; the name is the
-- provider's, cut to 40 characters, or 'New collector' when there is none
-- or the filter would refuse it, because a raise here fails the whole
-- sign-in.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta   jsonb   := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  hex    text    := replace(new.id::text, '-', '');
  handle text    := nullif(meta ->> 'username', '');
  shown  text    := nullif(meta ->> 'display_name', '');
  pos    integer := 1;
begin
  if handle is null then
    handle := 'pour_' || substr(hex, pos, 8);
    while pos < 25
      and (exists (select 1 from public.profiles p where p.username = handle)
           or public.is_objectionable(handle, true))
    loop
      pos := pos + 1;
      handle := 'pour_' || substr(hex, pos, 8);
    end loop;
  end if;

  if shown is null then
    shown := btrim(left(btrim(regexp_replace(
               coalesce(nullif(meta ->> 'full_name', ''), nullif(meta ->> 'name', ''), ''),
               '\s+', ' ', 'g')), 40));
    if shown = '' or public.is_objectionable(shown) then
      shown := 'New collector';
    end if;
  end if;

  insert into public.profiles (id, username, display_name, accent)
  values (new.id, handle, shown, coalesce(nullif(meta ->> 'accent', ''), '#633444'));
  return new;
end;
$$;

-- 006: a block removes the follow edges in both directions.
create or replace function public.drop_follows_on_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return new;
end;
$$;

-- 007: posts.photo_path follows the newest photo.
create or replace function public.sync_post_preview()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.post_id, old.post_id);
begin
  update public.posts
  set photo_path = (
    select path from public.post_photos
    where post_id = target
    order by taken_at desc, created_at desc
    limit 1
  )
  where id = target;
  return null;
end;
$$;

-- 011: the server owns created_at on posts and profiles; 017 extends it to
-- post_photos, likes and follows, which Today's pours and Activity order
-- by, and 019 to reels.
create or replace function public.pin_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  elsif new.created_at is distinct from old.created_at then
    raise exception 'created_at is set by the server and cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 006: true if either party has blocked the other. Per-call checks only;
-- read policies use private.my_block_set instead (011).
create or replace function public.blocked_with(other uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = other)
       or (b.blocker_id = other and b.blocked_id = auth.uid())
  );
$$;

-- 011: everyone the caller is blocked with, either way, once per query.
-- The coalesce matters: without it a caller with no blocks would see
-- nothing at all.
create or replace function private.my_block_set()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    array_agg(case when b.blocker_id = auth.uid() then b.blocked_id else b.blocker_id end),
    '{}'::uuid[]
  )
  from public.blocks b
  where b.blocker_id = auth.uid()
     or b.blocked_id = auth.uid();
$$;

-- 011: the content filter. Whole words (plus a plural 's') in folded,
-- lower-cased text, read once as written and once with digit stand-ins
-- as letters; for usernames, match_inside terms also match inside the
-- glued name.
create or replace function public.is_objectionable(t text, glued boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with folded as (
    select translate(lower(coalesce(t, '')),
                     'ÁÉÍÓÚÜÑáéíóúüñ',
                     'aeiouunaeiouun') as s
  ),
  spellings as (
    select s from folded
    union
    select translate(s, '013457@$', 'oieastas') from folded
  ),
  shapes as (
    select ' ' || btrim(regexp_replace(s, '[^a-z]+', ' ', 'g')) || ' ' as words,
           regexp_replace(s, '[^a-z]+', '', 'g')                    as run
    from spellings
  )
  select exists (
    select 1
    from shapes x
    join public.blocked_terms b
      on strpos(x.words, ' ' || b.term || ' ')  > 0
      or strpos(x.words, ' ' || b.term || 's ') > 0
      or (glued and b.match_inside and strpos(x.run, replace(b.term, ' ', '')) > 0)
  );
$$;

create or replace function public.reject_objectionable_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.caption is distinct from old.caption then
    if public.is_objectionable(new.caption) then
      raise exception 'objectionable_content' using errcode = 'P0001', detail = 'caption';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.reject_objectionable_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserting boolean := tg_op = 'INSERT';
begin
  if inserting or new.username is distinct from old.username then
    if public.is_objectionable(new.username, true) then
      raise exception 'objectionable_content' using errcode = 'P0001', detail = 'username';
    end if;
  end if;
  if inserting or new.display_name is distinct from old.display_name then
    if public.is_objectionable(new.display_name) then
      raise exception 'objectionable_content' using errcode = 'P0001', detail = 'display_name';
    end if;
  end if;
  if inserting or new.bio is distinct from old.bio then
    if public.is_objectionable(new.bio) then
      raise exception 'objectionable_content' using errcode = 'P0001', detail = 'bio';
    end if;
  end if;
  return new;
end;
$$;

-- 012, widened to reels by 019: who wrote the reported thing, which kind
-- of thing it was, and a copy of the text. Never a file path: deletion
-- removes the file, and a path to nothing helps no moderator.
create or replace function private.report_evidence(
  post uuid,
  person uuid,
  reel uuid,
  out author uuid,
  out snapshot jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with subject as (
    select coalesce(
      person,
      (select p.author_id from public.posts p where p.id = post),
      (select r.author_id from public.reels r where r.id = reel)
    ) as author_id
  )
  select
    s.author_id,
    jsonb_strip_nulls(jsonb_build_object(
      'kind',         case when post is not null then 'post'
                           when reel is not null then 'reel'
                           else 'account' end,
      'caption',      coalesce((select p.caption    from public.posts p where p.id = post),
                               (select r.caption    from public.reels r where r.id = reel)),
      'drink_id',     coalesce((select p.drink_id   from public.posts p where p.id = post),
                               (select r.drink_id   from public.reels r where r.id = reel)),
      'posted_at',    coalesce((select p.created_at from public.posts p where p.id = post),
                               (select r.created_at from public.reels r where r.id = reel)),
      'duration_ms',  (select r.duration_ms from public.reels r where r.id = reel),
      'username',     pr.username,
      'display_name', pr.display_name,
      'bio',          pr.bio
    ))
  from subject s
  left join public.profiles pr on pr.id = s.author_id;
$$;

-- 012, widened by 019: exactly one subject (a post, a reel or a person),
-- server time, server-built evidence.
create or replace function public.prepare_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if num_nonnulls(new.reported_post_id, new.reported_user_id, new.reported_reel_id) <> 1 then
    raise exception 'a report names exactly one post, reel or person' using errcode = '23514';
  end if;

  new.created_at := now();

  select e.author, e.snapshot
    into new.reported_author_id, new.snapshot
  from private.report_evidence(new.reported_post_id, new.reported_user_id, new.reported_reel_id) e;

  -- Nobody reports their own post, reel or profile. The app never offers
  -- it, but the table would take it: a self-report of a reel then hides
  -- that reel from its own author (reels_read), and the orphan sweep reads
  -- its files as abandoned and removes them, leaving everyone else a reel
  -- with nothing to play.
  if new.reported_author_id = new.reporter_id then
    raise exception 'you cannot report your own content' using errcode = '23514';
  end if;

  return new;
end;
$$;

-- 013: one webhook message per report, if a URL is stored in Vault as
-- 'report_alert_url'. Never carries the reported content, and never
-- blocks the report. 019 names reels.
create or replace function public.alert_new_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target text;
begin
  select ds.decrypted_secret into target
  from vault.decrypted_secrets ds
  where ds.name = 'report_alert_url'
  limit 1;

  if target is null or btrim(target) = '' then
    return null;
  end if;

  perform net.http_post(
    url     := target,
    body    := jsonb_build_object(
      'text',
      format(
        'Sipply: new report (%s, %s) at %s. Review it in the dashboard: table public.reports, id %s.',
        new.reason,
        case when new.reported_post_id is not null then 'a post'
             when new.reported_reel_id is not null then 'a reel'
             else 'an account' end,
        to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'),
        new.id
      )
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  return null;
exception
  when others then
    raise warning 'report alert not sent for report %: %', new.id, sqlerrm;
    return null;
end;
$$;

-- 011, widened to both buckets by 019: the client empties pours/<uid>/
-- and reels/<uid>/ through the Storage API first; this refuses to delete
-- the account while anything is left in either, under the same
-- 'photos_remaining' every installed build reads. It never deletes from
-- storage.objects: Supabase refuses that, and it would orphan the files if
-- it did not. Removing auth.users cascades to profiles, and from there to
-- posts, follows, likes, saves (017), drink_submissions (018), reels and
-- reel_likes (019). Any later replacement must keep 'reels'.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  remaining integer;
begin
  if uid is null then
    raise exception 'not signed in: delete_own_account got no auth.uid()' using errcode = '28000';
  end if;

  select count(*) into remaining
  from storage.objects o
  where o.bucket_id in ('pours', 'reels')
    and (storage.foldername(o.name))[1] = uid::text;

  if remaining > 0 then
    raise exception 'photos_remaining'
      using errcode = 'P0001',
            detail  = format('%s file(s) still under pours/%s/ or reels/%s/', remaining, uid, uid),
            hint    = 'Remove them through the Storage API, then call delete_own_account again.';
  end if;

  -- Cascades to profiles, and from there to reels and reel_likes as well.
  delete from auth.users where id = uid;
end;
$$;

-- 008, with 011's format check.
create or replace function public.set_phone_hash(hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in: set_phone_hash got no auth.uid()' using errcode = '28000';
  end if;
  if hash is not null and hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_hash: expected 64 lowercase hex characters' using errcode = '22023';
  end if;
  insert into public.profile_secrets (user_id, phone_hash)
  values (auth.uid(), hash)
  on conflict (user_id) do update
    set phone_hash = excluded.phone_hash, updated_at = now();
end;
$$;

create or replace function public.set_instagram_hash(hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in: set_instagram_hash got no auth.uid()' using errcode = '28000';
  end if;
  if hash is not null and hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_hash: expected 64 lowercase hex characters' using errcode = '22023';
  end if;
  insert into public.profile_secrets (user_id, instagram_hash)
  values (auth.uid(), hash)
  on conflict (user_id) do update
    set instagram_hash = excluded.instagram_hash, updated_at = now();
end;
$$;

-- 011: 3,000 hashes per rolling 24 hours per account, across both
-- matchers, or 'rate_limited' without charging.
create or replace function private.charge_discovery(matcher text, requested integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  used integer;
begin
  if me is null then
    raise exception 'not signed in: charge_discovery got no auth.uid()' using errcode = '28000';
  end if;
  if requested <= 0 then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('discovery_usage:' || me::text, 0));

  delete from public.discovery_usage u
  where u.user_id = me
    and u.checked_at <= now() - interval '24 hours';

  select coalesce(sum(u.hashes), 0) into used
  from public.discovery_usage u
  where u.user_id = me;

  if used + requested > 3000 then
    raise exception 'rate_limited'
      using errcode = 'P0001',
            detail  = format('%s of 3000 hashes used in the last 24 hours; this call asked for %s', used, requested),
            hint    = 'Try again tomorrow.';
  end if;

  insert into public.discovery_usage (user_id, matcher, hashes)
  values (me, matcher, requested);
end;
$$;

-- 002/008/010, limited by 011: at most 500 hashes a call, and metered.
create or replace function public.match_contacts(hashes text[])
returns table (
  id uuid,
  username text,
  display_name text,
  accent text,
  bio text,
  avatar_path text,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  wanted text[];
begin
  if auth.uid() is null then
    raise exception 'not signed in: match_contacts got no auth.uid()' using errcode = '28000';
  end if;

  if coalesce(cardinality(hashes), 0) > 500 then
    raise exception 'too_many_hashes'
      using errcode = '22023',
            detail  = 'At most 500 hashes per call. Send the rest in further calls.';
  end if;

  select coalesce(array_agg(distinct h.v), '{}') into wanted
  from unnest(hashes) as h(v)
  where h.v is not null;

  if cardinality(wanted) = 0 then
    return;
  end if;

  perform private.charge_discovery('contacts', cardinality(wanted));

  return query
    select p.id, p.username, p.display_name, p.accent, p.bio, p.avatar_path, p.created_at
    from public.profiles p
    join public.profile_secrets s on s.user_id = p.id
    where s.phone_hash = any(wanted)
      and p.id <> auth.uid()
      and not public.blocked_with(p.id)
    limit 500;
end;
$$;

create or replace function public.match_instagram(hashes text[])
returns table (
  id uuid,
  username text,
  display_name text,
  accent text,
  bio text,
  avatar_path text,
  created_at timestamptz,
  -- Echoed back so the device, which alone holds hash -> handle, can
  -- label the row.
  matched_hash text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  wanted text[];
begin
  if auth.uid() is null then
    raise exception 'not signed in: match_instagram got no auth.uid()' using errcode = '28000';
  end if;

  if coalesce(cardinality(hashes), 0) > 500 then
    raise exception 'too_many_hashes'
      using errcode = '22023',
            detail  = 'At most 500 hashes per call. Send the rest in further calls.';
  end if;

  select coalesce(array_agg(distinct h.v), '{}') into wanted
  from unnest(hashes) as h(v)
  where h.v is not null;

  if cardinality(wanted) = 0 then
    return;
  end if;

  perform private.charge_discovery('instagram', cardinality(wanted));

  return query
    select p.id, p.username, p.display_name, p.accent, p.bio, p.avatar_path,
           p.created_at, s.instagram_hash
    from public.profiles p
    join public.profile_secrets s on s.user_id = p.id
    where s.instagram_hash = any(wanted)
      and p.id <> auth.uid()
      and not public.blocked_with(p.id)
    limit 500;
end;
$$;

-- 015: Facebook friends on Sipply, by the app-scoped ids Graph returned,
-- matched against Facebook identities the auth server verified. Callers
-- with no Facebook identity of their own get no rows. At most 5,000 ids a
-- call and not metered: those ids cannot be walked the way numbers can.
create or replace function public.match_facebook_friends(fb_ids text[])
returns table (
  id uuid,
  username text,
  display_name text,
  accent text,
  bio text,
  avatar_path text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  wanted text[];
begin
  if me is null then
    raise exception 'not signed in: match_facebook_friends got no auth.uid()' using errcode = '28000';
  end if;

  if coalesce(cardinality(fb_ids), 0) > 5000 then
    raise exception 'too_many_ids'
      using errcode = '22023',
            detail  = 'At most 5000 Facebook ids per call.';
  end if;

  if not exists (
    select 1 from auth.identities i
    where i.user_id = me
      and i.provider = 'facebook'
  ) then
    return;
  end if;

  select coalesce(array_agg(distinct f.v), '{}') into wanted
  from unnest(fb_ids) as f(v)
  where f.v is not null;

  if cardinality(wanted) = 0 then
    return;
  end if;

  return query
    select p.id, p.username, p.display_name, p.accent, p.bio, p.avatar_path, p.created_at
    from auth.identities i
    join public.profiles p on p.id = i.user_id
    where i.provider = 'facebook'
      and i.provider_id = any(wanted)
      and p.id <> me
      and not public.blocked_with(p.id);
end;
$$;

-- 008: batch follow. SECURITY INVOKER, so follows_insert_own (and its
-- block check) runs per row exactly as for a single insert.
create or replace function public.follow_many(targets uuid[])
returns integer
language sql
as $$
  with candidates as (
    select distinct t
    from unnest(targets) as t
    where t is not null
      and t <> auth.uid()
      and exists (select 1 from public.profiles p where p.id = t)
      and not public.blocked_with(t)
    limit 500
  ),
  inserted as (
    insert into public.follows (follower_id, following_id)
    select auth.uid(), t from candidates
    on conflict do nothing
    returning 1
  )
  select count(*)::int from inserted;
$$;

-- 011: redeems an invite token into a mutual follow. Returns the inviter's
-- id, or null for an unknown or expired token, your own link, or a block
-- either way.
create or replace function public.accept_invite(invite_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  inviter uuid;
begin
  if me is null then
    raise exception 'not signed in: accept_invite got no auth.uid()' using errcode = '28000';
  end if;

  select i.inviter_id into inviter
  from public.invites i
  where i.token = invite_token
    and i.expires_at > now();

  if inviter is null or inviter = me or public.blocked_with(inviter) then
    return null;
  end if;

  insert into public.follows (follower_id, following_id)
  values (me, inviter)
  on conflict do nothing;

  insert into public.follows (follower_id, following_id)
  values (inviter, me)
  on conflict do nothing;

  return inviter;
end;
$$;

-- 016: the email step's lookup. 'new', 'password' or 'other' for an
-- address, metered at 30 per caller IP (bucketed by md5 of
-- cf-connecting-ip) and 1,000 overall per hour; past that, 'rate_limited'.
-- It answers what GoTrue's public signup endpoint already answers.
create or replace function public.sign_in_method(e text)
returns text
language plpgsql
volatile                      -- it writes the meter; PostgREST runs STABLE read-only
security definer              -- reads auth.users, which no client role can
set search_path = ''
as $$
declare
  hdrs    jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  addr    text  := lower(btrim(coalesce(e, '')));
  caller  text;
  per_ip  integer;
  overall integer;
  pw      text;
begin
  if length(addr) > 254 or addr !~ '^[^@\s]+@[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  caller := md5('sipply-sign-in-lookup:' || coalesce(nullif(hdrs ->> 'cf-connecting-ip', ''), 'unknown'));

  perform pg_advisory_xact_lock(hashtextextended('sign_in_lookups', 0));
  delete from public.sign_in_lookups l where l.looked_at <= now() - interval '1 hour';
  select count(*), count(*) filter (where l.bucket = caller)
    into overall, per_ip
  from public.sign_in_lookups l;
  if per_ip >= 30 or overall >= 1000 then
    raise exception 'rate_limited' using errcode = 'P0001', hint = 'Try again later.';
  end if;
  insert into public.sign_in_lookups (bucket) values (caller);

  -- GoTrue stores emails lowercased, so equality hits its email index.
  select u.encrypted_password into pw
  from auth.users u
  where u.email = addr and u.deleted_at is null
  limit 1;

  if not found then return 'new'; end if;
  if pw is not null and pw <> '' then return 'password'; end if;   -- OAuth/phone users carry ''
  return 'other';
end;
$$;

-- 017: every photo shared in the last 24 hours by the caller or anyone
-- the caller follows. SECURITY INVOKER, so the tables' read policies,
-- blocks included, apply with nothing extra here. 020 added the photo's
-- song (callers read the columns by name, so build 14 ignores them).
create or replace function public.recent_pours()
returns table (post_id uuid, author_id uuid, drink_id text, path text, poured_at timestamptz,
               music_song_id text, music_title text, music_artist text,
               music_artwork_url text, music_preview_url text, music_url text)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.author_id, p.drink_id, ph.path, ph.created_at,
         ph.music_song_id, ph.music_title, ph.music_artist,
         ph.music_artwork_url, ph.music_preview_url, ph.music_url
  from public.post_photos ph
  join public.posts p on p.id = ph.post_id
  where ph.created_at >= now() - interval '24 hours'
    and (
      p.author_id = (select auth.uid())
      or p.author_id in (
        select f.following_id from public.follows f
        where f.follower_id = (select auth.uid())
      )
    )
  order by ph.created_at desc
  limit 300;
$$;

-- 018: a drink suggestion's prepare trigger. Normalises, checks shapes,
-- applies the category rules, runs every text column through the content
-- filter, and holds each account to 30 inserts per rolling 30 days. The
-- server owns identity, review columns and clocks.
create or replace function public.prepare_drink_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  me     uuid := auth.uid();
  recent integer;
  field  text;
  val    text;
  e      jsonb;
begin
  -- Identity and clocks belong to the server. A client (me not null) can never set review columns.
  if tg_op = 'INSERT' then
    if me is not null then
      new.submitter_id := me;
      new.status := 'new'; new.catalogue_id := null; new.reviewed_at := null;
    end if;
    new.created_at := now();
  else
    new.id := old.id; new.submitter_id := old.submitter_id; new.created_at := old.created_at;
  end if;
  new.updated_at := now();

  -- Normalise
  new.name        := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  new.subcategory := btrim(new.subcategory);
  new.description := btrim(new.description);
  new.tasting_notes := coalesce(array(select lower(btrim(x)) from unnest(new.tasting_notes) x where btrim(x) <> ''), '{}');
  new.pairings      := coalesce(array(select lower(btrim(x)) from unnest(new.pairings) x where btrim(x) <> ''), '{}');
  new.steps         := coalesce(array(select btrim(x) from unnest(new.steps) x where btrim(x) <> ''), '{}');
  -- Two-argument unaccent: with search_path = '' the one-argument form cannot find its
  -- dictionary and raises 'text search dictionary "unaccent" does not exist'.
  new.name_key := regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, new.name)),
                                 '[^a-z0-9]', '', 'g');
  if char_length(new.name_key) < 2 then
    raise exception 'submission_invalid' using errcode = 'P0001', detail = 'name';
  end if;

  -- Element shapes. The array check comes first: every jsonb_array_* call
  -- below raises a bare 22023 on an object, which the app would not read
  -- as a refusal.
  if jsonb_typeof(new.ingredients) is distinct from 'array' then
    raise exception 'submission_invalid' using errcode = 'P0001', detail = 'ingredients';
  end if;
  if exists (select 1 from unnest(new.tasting_notes) x where char_length(x) > 30) then
    raise exception 'submission_invalid' using errcode = 'P0001', detail = 'tasting_notes'; end if;
  if exists (select 1 from unnest(new.steps) x where char_length(x) > 200) then
    raise exception 'submission_invalid' using errcode = 'P0001', detail = 'steps'; end if;
  if exists (select 1 from unnest(new.pairings) x where char_length(x) > 40) then
    raise exception 'submission_invalid' using errcode = 'P0001', detail = 'pairings'; end if;
  for e in select * from jsonb_array_elements(new.ingredients) loop
    -- The object check on its own, for the same reason: jsonb_object_keys
    -- raises a bare 22023 on anything else, and SQL does not promise to
    -- stop at the first true term of an OR.
    if jsonb_typeof(e) <> 'object' then
      raise exception 'submission_invalid' using errcode = 'P0001', detail = 'ingredients';
    end if;
    if (select count(*) from jsonb_object_keys(e) k where k not in ('item','amount')) > 0
       or char_length(btrim(coalesce(e->>'item',''))) not between 1 and 80
       or char_length(coalesce(e->>'amount','')) > 40 then
      raise exception 'submission_invalid' using errcode = 'P0001', detail = 'ingredients';
    end if;
  end loop;

  -- Category rules (normalise the other category's fields away rather than refuse them)
  if new.category = 'cocktail' then
    if jsonb_array_length(new.ingredients) < 2 then
      raise exception 'submission_invalid' using errcode = 'P0001', detail = 'ingredients'; end if;
    new.base := ''; new.distillation := ''; new.aging := ''; new.serve_temp := '';
    new.serve_how := ''; new.pairings := '{}'; new.process := '';
  else
    if new.abv_low is null then
      raise exception 'submission_invalid' using errcode = 'P0001', detail = 'abv_low'; end if;
    new.ingredients := '[]'::jsonb; new.steps := '{}'; new.method := ''; new.garnish := '';
  end if;

  -- Content filter (011). Every text column, every write: a suggestion is re-read by a person
  -- each time it changes, so an edit carrying a newly blocked term is refused like a new row.
  for field, val in
    select f, v from (values
      ('name', new.name), ('subcategory', new.subcategory), ('description', new.description),
      ('origin', new.origin), ('glassware', new.glassware), ('garnish', new.garnish),
      ('fun_fact', new.fun_fact), ('note_for_team', new.note_for_team), ('base', new.base),
      ('distillation', new.distillation), ('aging', new.aging), ('serve_temp', new.serve_temp),
      ('serve_how', new.serve_how), ('process', new.process),
      ('tasting_notes', array_to_string(new.tasting_notes, ' / ')),
      ('steps', array_to_string(new.steps, ' / ')),
      ('pairings', array_to_string(new.pairings, ' / ')),
      ('ingredients', (select string_agg(coalesce(x->>'amount','') || ' ' || coalesce(x->>'item',''), ' / ')
                       from jsonb_array_elements(new.ingredients) x))
    ) as t(f, v)
  loop
    if public.is_objectionable(val) then
      raise exception 'objectionable_content' using errcode = 'P0001', detail = field;
    end if;
  end loop;

  -- Quota: 30 per rolling 30 days, counted on insert only, which is why the client never
  -- upserts (an upsert's insert half would count every edit). The lock queues one account's
  -- parallel inserts, as charge_discovery does (011), so they cannot all read 29 and pass.
  if tg_op = 'INSERT' and me is not null then
    perform pg_advisory_xact_lock(hashtextextended('drink_submissions:' || new.submitter_id::text, 0));
    select count(*) into recent from public.drink_submissions
    where submitter_id = new.submitter_id and created_at > now() - interval '30 days';
    if recent >= 30 then
      raise exception 'submission_quota' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

-- 018: the monthly email of drink suggestions, built and sent by the
-- database (Resend through pg_net, scheduled by pg_cron below). The
-- helpers come before what calls them, because LANGUAGE sql bodies are
-- checked on creation.
create or replace function private.html_escape(t text) returns text language sql immutable set search_path = '' as $$
  select replace(replace(replace(replace(replace(coalesce(t, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

create or replace function private.drink_slug(t text) returns text language sql stable set search_path = '' as $$
  select btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, t)),
               '[^a-z0-9]+', '-', 'g'), '-');
$$;

create or replace function private.abv_text(lo numeric, hi numeric) returns text language sql immutable set search_path = '' as $$
  select case
    when lo is null then ''
    when hi is null or hi = lo then trim_scale(lo)::text || '%'
    else trim_scale(lo)::text || '–' || trim_scale(hi)::text || '%' end;
$$;

create or replace function private.submission_todo(s public.drink_submissions) returns text[]
language sql stable set search_path = '' as $$
  select array_remove(array[
    'rarity',
    case when s.fun_fact = '' then 'funFact' end,
    case when s.abv_low is null then 'abv' end,
    case when s.origin = '' then 'origin' end,
    case when s.glassware = '' then 'glassware' end,
    case when cardinality(s.tasting_notes) < 2 then 'tastingNotes (needs 2+)' end,
    case when s.subcategory_is_new then 'subcategory is new: ' || s.subcategory end,
    case when s.category = 'cocktail' and cardinality(s.steps) < 3 then 'recipe.steps (needs 3+)' end,
    case when s.category = 'cocktail' and s.method = '' then 'recipe.method' end,
    case when s.category = 'cocktail' and exists (
      select 1 from jsonb_array_elements(s.ingredients) x where btrim(coalesce(x->>'amount', '')) = '')
      then 'recipe amounts' end,
    case when s.category = 'cocktail' and s.garnish = '' then 'recipe.garnish' end,
    case when s.category = 'spirit' then 'composition.summary' end,
    case when s.category = 'spirit' and ((s.base <> '')::int + (s.distillation <> '')::int
      + (s.aging <> '')::int + (s.abv_low is not null)::int) < 3 then 'composition.components (needs 3+)' end,
    case when s.category = 'spirit' and s.process = '' then 'composition.process' end,
    case when s.category = 'spirit' and s.serve_temp = '' then 'serve.temp' end,
    case when s.category = 'spirit' and s.serve_how = '' then 'serve.how' end,
    case when s.category = 'spirit' and cardinality(s.pairings) = 0 then 'serve.pair' end
  ], null);
$$;

create or replace function private.submission_meta(s public.drink_submissions, handle text) returns json
language sql stable set search_path = '' as $$
  select json_build_object(
    'submissionId', s.id,
    'category',     s.category,
    'submittedBy',  '@' || coalesce(handle, ''),
    'submittedAt',  s.created_at,
    'updatedAt',    s.updated_at,
    'photo',        s.photo_path,
    'noteForTeam',  s.note_for_team,
    'todo',         to_json(private.submission_todo(s)));
$$;

create or replace function private.submission_entry(s public.drink_submissions, handle text) returns json
language sql stable set search_path = '' as $$
  select case when s.category = 'cocktail' then json_build_object(
    'id', private.drink_slug(s.name), 'name', s.name, 'subcategory', s.subcategory,
    'description', s.description, 'abv', private.abv_text(s.abv_low, s.abv_high),
    'origin', s.origin, 'rarity', '', 'tastingNotes', to_json(s.tasting_notes),
    'glassware', s.glassware,
    'ingredients', (select coalesce(json_agg(x.e->>'item' order by x.ord), '[]'::json)
                    from jsonb_array_elements(s.ingredients) with ordinality x(e, ord)
                    where (x.e->>'item') !~* '^\s*(crushed\s+|cubed\s+)?ice\y'),
    'funFact', s.fun_fact,
    'recipe', json_build_object(
      'ingredients', (select coalesce(json_agg(json_build_object('item', x.e->>'item',
                        'amount', coalesce(x.e->>'amount', '')) order by x.ord), '[]'::json)
                      from jsonb_array_elements(s.ingredients) with ordinality x(e, ord)),
      'steps', to_json(s.steps), 'garnish', s.garnish, 'method', s.method),
    '_sipply', private.submission_meta(s, handle))
  else json_build_object(
    'id', private.drink_slug(s.name), 'name', s.name, 'subcategory', s.subcategory,
    'description', s.description, 'abv', private.abv_text(s.abv_low, s.abv_high),
    'origin', s.origin, 'rarity', '', 'tastingNotes', to_json(s.tasting_notes),
    'glassware', s.glassware, 'funFact', s.fun_fact,
    'serve', json_build_object('temp', s.serve_temp, 'glass', s.glassware,
                               'how', s.serve_how, 'pair', to_json(s.pairings)),
    'composition', json_build_object(
      'summary', '',
      'components', (select coalesce(json_agg(json_build_object('label', c.label, 'detail', c.detail) order by c.ord), '[]'::json)
                     from (values (1, 'Base', s.base), (2, 'Distillation', s.distillation), (3, 'Aging', s.aging),
                                  (4, 'Strength', private.abv_text(s.abv_low, s.abv_high))) c(ord, label, detail)
                     where c.detail <> ''),
      'process', s.process),
    '_sipply', private.submission_meta(s, handle))
  end;
$$;

create or replace function private.submission_card_html(s public.drink_submissions, handle text, also_count integer)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  tz        constant text := 'America/Puerto_Rico';
  c_ink     constant text := '#2B2322';
  c_muted   constant text := '#6A6058';
  c_wine    constant text := '#5B0F1A';
  c_rule    constant text := '#EFE9E0';
  p_style   constant text := 'margin:0 0 12px;font-size:15px;line-height:22px;color:#2B2322;';
  k_style   constant text := 'padding:2px 12px 2px 0;font-size:14px;line-height:20px;color:#6A6058;vertical-align:top;';
  v_style   constant text := 'padding:2px 0;font-size:14px;line-height:20px;color:#2B2322;vertical-align:top;';
  covered   date := date_trunc('month', s.updated_at at time zone tz)::date;
  todo      text[] := private.submission_todo(s);
  meta_line text;
  facts     text;
  part      text;
  card      text;
begin
  -- Name, and Jan's verdict when there already is one.
  card := format('<h2 style="margin:0 0 4px;font-size:20px;line-height:26px;color:%s;">%s%s</h2>',
    c_ink,
    private.html_escape(s.name),
    case when s.status <> 'new' then format(
      ' <span style="font-size:12px;line-height:16px;font-weight:600;color:%s;border:1px solid %s;padding:1px 6px;">%s</span>',
      c_wine, c_wine, private.html_escape(s.status)) else '' end);

  -- Cocktail · Sour · @handle · submitted 12 Sep 2026 · edited 14 Sep
  meta_line := concat_ws(' · ',
    initcap(s.category),
    s.subcategory || case when s.subcategory_is_new then ' (new style)' else '' end,
    '@' || coalesce(handle, ''),
    'submitted ' || to_char(s.created_at at time zone tz, 'FMDD Mon YYYY'),
    case when s.updated_at > s.created_at then 'edited ' || to_char(s.updated_at at time zone tz, 'FMDD Mon') end,
    case when s.created_at < (covered::timestamp at time zone tz) then 'UPDATED since an earlier email' end);
  card := card || format('<p style="margin:0 0 12px;font-size:13px;line-height:18px;color:%s;">%s</p>',
    c_muted, private.html_escape(meta_line));

  if also_count > 0 then
    card := card || format('<p style="margin:0 0 12px;font-size:13px;line-height:18px;font-weight:600;color:%s;">Also suggested by %s other %s this month</p>',
      c_wine, also_count, case when also_count = 1 then 'person' else 'people' end);
  end if;

  facts := concat_ws(' · ', nullif(private.abv_text(s.abv_low, s.abv_high), ''), nullif(s.origin, ''), nullif(s.glassware, ''));
  if facts <> '' then
    card := card || format('<p style="margin:0 0 12px;font-size:14px;line-height:20px;color:%s;">%s</p>',
      c_muted, private.html_escape(facts));
  end if;

  card := card || format('<p style="%s">%s</p>', p_style, private.html_escape(s.description));

  if cardinality(s.tasting_notes) > 0 then
    card := card || format('<p style="%s"><strong>Tasting notes:</strong> %s</p>',
      p_style, private.html_escape(array_to_string(s.tasting_notes, ', ')));
  end if;

  if s.category = 'cocktail' then
    select string_agg(format('<tr><td style="%s text-align:right;white-space:nowrap;">%s</td><td style="%s">%s</td></tr>',
             k_style, private.html_escape(coalesce(x.e->>'amount', '')), v_style, private.html_escape(x.e->>'item')),
           '' order by x.ord)
      into part
    from jsonb_array_elements(s.ingredients) with ordinality x(e, ord);
    if part is not null then
      card := card || '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border-collapse:collapse;">'
                   || part || '</table>';
    end if;
    if s.method <> '' then
      card := card || format('<p style="%s"><strong>Method:</strong> %s</p>', p_style, private.html_escape(s.method));
    end if;
    if cardinality(s.steps) > 0 then
      select string_agg(format('<li style="margin:0 0 4px;">%s</li>', private.html_escape(u.txt)), '' order by u.ord)
        into part
      from unnest(s.steps) with ordinality u(txt, ord);
      card := card || format('<ol style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:22px;color:%s;">%s</ol>',
        c_ink, part);
    end if;
    if s.garnish <> '' then
      card := card || format('<p style="%s"><strong>Garnish:</strong> %s</p>', p_style, private.html_escape(s.garnish));
    end if;
  else
    select string_agg(format('<tr><td style="%s white-space:nowrap;">%s</td><td style="%s">%s</td></tr>',
             k_style, private.html_escape(t.label), v_style, private.html_escape(t.detail)),
           '' order by t.ord)
      into part
    from (values
      (1, 'Made from',       s.base),
      (2, 'Distilled',       s.distillation),
      (3, 'Aging',           s.aging),
      (4, 'Serve',           s.serve_temp),
      (5, 'How to drink it', s.serve_how),
      (6, 'Goes well with',  array_to_string(s.pairings, ', ')),
      (7, 'How it''s made',  s.process)
    ) t(ord, label, detail)
    where t.detail <> '';
    if part is not null then
      card := card || '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border-collapse:collapse;">'
                   || part || '</table>';
    end if;
  end if;

  if s.fun_fact <> '' then
    card := card || format('<p style="%s"><strong>The story:</strong> %s</p>', p_style, private.html_escape(s.fun_fact));
  end if;

  if s.note_for_team <> '' then
    card := card || format(
      '<div style="margin:0 0 12px;padding:8px 12px;border-left:3px solid %s;background:%s;font-size:14px;line-height:20px;color:%s;"><strong>Note for the team:</strong> %s</div>',
      c_wine, c_rule, c_ink, private.html_escape(s.note_for_team));
  end if;

  card := card || format('<p style="margin:0 0 4px;font-size:13px;line-height:18px;color:%s;">%s</p>',
    c_muted,
    case when s.photo_path is null then 'No photo'
         else 'Photo: pours/' || private.html_escape(s.photo_path) || ' (dashboard: Storage &rarr; pours)' end);

  if cardinality(todo) > 0 then
    card := card || format('<p style="margin:0 0 4px;font-size:13px;line-height:18px;color:%s;"><strong>Still to write:</strong> %s</p>',
      c_ink, private.html_escape(array_to_string(todo, ', ')));
  end if;

  card := card || format('<p style="margin:0;font-size:11px;line-height:16px;color:%s;">%s</p>',
    c_muted, private.html_escape(s.id::text));

  return format('<tr><td style="padding:24px 0;border-top:1px solid %s;">%s</td></tr>', c_rule, card);
end;
$$;

create or replace function private.digest_html(
  label text, n_total integer, n_cocktail integer, n_spirit integer, tag text, cards text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  c_ink   constant text := '#2B2322';
  c_muted constant text := '#6A6058';
  c_wine  constant text := '#5B0F1A';
  c_rule  constant text := '#EFE9E0';
  code_style constant text := 'font-family:Menlo,Consolas,monospace;font-size:13px;';
  heading text;
  counts  text;
  run_line  text;
  body_rows text := '';
begin
  if n_total = 0 then
    heading := format('No drink suggestions in %s.', private.html_escape(label));
  else
    heading := format('%s drink suggestion%s for %s',
      n_total, case when n_total = 1 then '' else 's' end, private.html_escape(label));

    counts := format('%s cocktail%s · %s spirit%s',
      n_cocktail, case when n_cocktail = 1 then '' else 's' end,
      n_spirit,   case when n_spirit = 1 then '' else 's' end);

    -- Name only the files this email carries.
    run_line := case
      when n_cocktail > 0 and n_spirit > 0 then format(
        '<code style="%s">node scripts/import-submissions.mjs ~/Downloads/sipply-cocktails-%s.json</code> (and the same for <code style="%s">sipply-spirits-%s.json</code>)',
        code_style, private.html_escape(tag), code_style, private.html_escape(tag))
      when n_cocktail > 0 then format(
        '<code style="%s">node scripts/import-submissions.mjs ~/Downloads/sipply-cocktails-%s.json</code>',
        code_style, private.html_escape(tag))
      else format(
        '<code style="%s">node scripts/import-submissions.mjs ~/Downloads/sipply-spirits-%s.json</code>',
        code_style, private.html_escape(tag))
    end;

    body_rows := format('<tr><td style="padding:0 0 24px;"><p style="margin:0 0 16px;font-size:15px;line-height:22px;color:%s;">%s</p>', c_muted, counts)
         || format('<div style="padding:12px 16px;border:1px solid %s;">', c_rule)
         || format('<p style="margin:0 0 8px;font-size:15px;line-height:22px;font-weight:600;color:%s;">How to add them</p>', c_wine)
         || format('<p style="margin:0 0 4px;font-size:14px;line-height:20px;color:%s;">1. Save the attachments.</p>', c_ink)
         || format('<p style="margin:0 0 4px;font-size:14px;line-height:20px;color:%s;">2. Run: %s</p>', c_ink, run_line)
         || format('<p style="margin:0;font-size:14px;line-height:20px;color:%s;">3. Fill what each entry lists under todo, then run the merge scripts.</p>', c_ink)
         || '</div></td></tr>'
         || coalesce(cards, '');

    if n_total > 300 then
      body_rows := body_rows || format(
        '<tr><td style="padding:24px 0;border-top:1px solid %s;font-size:14px;line-height:20px;color:%s;">&hellip;and %s more. All of them are in the attachments, or see table public.drink_submissions.</td></tr>',
        c_rule, c_muted, n_total - 300);
    end if;
  end if;

  -- Plain concatenation where the markup holds a literal %, which format() would read.
  return '<!doctype html><html><body style="margin:0;padding:0;background:#FFFFFF;">'
      || format('<div style="display:none;max-height:0;overflow:hidden;">%s</div>', heading)
      || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px;">'
      || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:-apple-system, Helvetica, Arial, sans-serif;color:'
      || c_ink || ';">'
      || format('<tr><td style="padding:0 0 8px;"><h1 style="margin:0;font-size:24px;line-height:30px;color:%s;">%s</h1></td></tr>', c_ink, heading)
      || body_rows
      || format('<tr><td style="padding:24px 0 0;border-top:1px solid %s;font-size:12px;line-height:16px;color:%s;">Sent by the Sipply database on the 1st of each month.</td></tr>', c_rule, c_muted)
      || '</table></td></tr></table></body></html>';
end;
$$;

-- Once per month (the previous one, Puerto Rico time) unless forced. Only
-- a send made after its month was over counts as that month's email, so a
-- test send of the current month never stands in for the real one.
create or replace function private.send_submissions_digest(force boolean default false, period date default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  tz       constant text := 'America/Puerto_Rico';
  m        date := coalesce(period, (date_trunc('month', now() at time zone tz) - interval '1 month')::date);
  from_ts  timestamptz := (m::timestamp) at time zone tz;
  to_ts    timestamptz := ((m + interval '1 month')::timestamp) at time zone tz;
  label    text := to_char(m, 'FMMonth YYYY');
  tag      text := to_char(m, 'YYYY-MM');
  d        private.submission_digests;
  api_key  text; recipient text; sender text;
  n_total int; n_cocktail int; n_spirit int;
  cards text; cocktails text; spirits text; html text;
  attachments jsonb := '[]'::jsonb;
  req bigint;
begin
  select * into d from private.submission_digests where period_start = m;
  if found and d.status in ('pending', 'delivered') and d.sent_at >= to_ts and not force then
    return format('already %s for %s', d.status, label);
  end if;

  select decrypted_secret into api_key   from vault.decrypted_secrets where name = 'resend_api_key';
  select decrypted_secret into recipient from vault.decrypted_secrets where name = 'submissions_email';
  select decrypted_secret into sender    from vault.decrypted_secrets where name = 'submissions_from';
  if coalesce(btrim(api_key), '') = '' or coalesce(btrim(recipient), '') = '' then
    raise warning 'drink submissions email: resend_api_key or submissions_email missing from Vault';
    return 'not configured';
  end if;
  -- Resend's onboarding sender may only mail the Resend account owner's own address — fine here.
  sender := coalesce(nullif(btrim(sender), ''), 'Sipply <onboarding@resend.dev>');

  -- A row belongs to the month of its LAST change, so it appears exactly once with its latest content.
  with picked as (
    select s, p.username as handle,
           count(*) over (partition by s.category, s.name_key) - 1 as also_count,
           row_number() over (order by s.category, s.name_key, s.created_at) as n
    from public.drink_submissions s
    join public.profiles p on p.id = s.submitter_id
    where s.updated_at >= from_ts and s.updated_at < to_ts
  )
  select count(*),
         count(*) filter (where (s).category = 'cocktail'),
         count(*) filter (where (s).category = 'spirit'),
         string_agg(private.submission_card_html(s, handle, also_count::int), '' order by n)
           filter (where n <= 300),                                   -- HTML capped; JSON is not
         string_agg(private.submission_entry(s, handle)::text, E',\n' order by n)
           filter (where (s).category = 'cocktail'),
         string_agg(private.submission_entry(s, handle)::text, E',\n' order by n)
           filter (where (s).category = 'spirit')
  into n_total, n_cocktail, n_spirit, cards, cocktails, spirits
  from picked;

  -- Base64 with NO line breaks: Postgres wraps encode(…,'base64') at 76 chars.
  if n_cocktail > 0 then
    attachments := attachments || jsonb_build_array(jsonb_build_object(
      'filename', format('sipply-cocktails-%s.json', tag),
      'content',  translate(encode(convert_to('[' || E'\n' || cocktails || E'\n]\n', 'UTF8'), 'base64'), E'\n', '')));
  end if;
  if n_spirit > 0 then
    attachments := attachments || jsonb_build_array(jsonb_build_object(
      'filename', format('sipply-spirits-%s.json', tag),
      'content',  translate(encode(convert_to('[' || E'\n' || spirits || E'\n]\n', 'UTF8'), 'base64'), E'\n', '')));
  end if;

  html := private.digest_html(label, n_total, n_cocktail, n_spirit, tag, coalesce(cards, ''));

  req := net.http_post(
    url     := 'https://api.resend.com/emails',
    body    := jsonb_build_object(
                 'from', sender,
                 'to', jsonb_build_array(recipient),
                 'subject', case when n_total = 0 then format('Sipply: no drink suggestions in %s', label)
                                 else format('Sipply: %s drink suggestion%s for %s', n_total,
                                             case when n_total = 1 then '' else 's' end, label) end,
                 'html', html)
               || case when jsonb_array_length(attachments) > 0
                       then jsonb_build_object('attachments', attachments) else '{}'::jsonb end,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || api_key),
    timeout_milliseconds := 30000);

  insert into private.submission_digests as x (period_start, status, request_id, attempts, submissions, sent_at)
  values (m, 'pending', req, 1, n_total, now())
  on conflict (period_start) do update
    set status = 'pending', request_id = excluded.request_id,
        attempts = case when x.sent_at < to_ts and now() >= to_ts then 1 else x.attempts + 1 end,
        submissions = excluded.submissions, sent_at = now(), last_error = null;

  return format('queued %s submission(s) for %s as request %s', n_total, label, req);
end;
$$;

-- Reads Resend's answer, retries up to 4 attempts, then alerts.
create or replace function private.check_submissions_digest() returns void
language plpgsql security definer set search_path = '' as $$
declare
  d private.submission_digests;
  -- Scalars, not a `record`: a record left unassigned by a zero-row SELECT INTO
  -- raises "record is not assigned yet" the moment a field is read.
  r_code int; r_err text; r_timeout boolean; r_body text;
  got boolean;
  hook text;
  err text;
begin
  for d in select * from private.submission_digests where status = 'pending' loop
    r_code := null; r_err := null; r_timeout := null; r_body := null;
    select status_code, error_msg, timed_out, left(content, 500)
      into r_code, r_err, r_timeout, r_body
      from net._http_response where id = d.request_id;
    got := found;

    if got and r_code between 200 and 299 then
      update private.submission_digests set status = 'delivered', checked_at = now()
       where period_start = d.period_start;
    elsif got or d.sent_at < now() - interval '5 hours' then     -- pg_net keeps responses ~6 h
      err := coalesce(r_err, case when r_timeout then 'timed out' end, r_body,
                      'no response recorded');
      update private.submission_digests set status = 'failed', last_error = err, checked_at = now()
       where period_start = d.period_start;
      if d.attempts < 4 then
        perform private.send_submissions_digest(true, d.period_start);
      else
        select decrypted_secret into hook from vault.decrypted_secrets where name = 'report_alert_url';
        if coalesce(btrim(hook), '') <> '' then
          perform net.http_post(url := hook, body := jsonb_build_object('text', format(
            'Sipply: the drink-suggestions email for %s failed 4 times (%s). After fixing it, run: select private.send_submissions_digest(true, %L);',
            to_char(d.period_start, 'FMMonth YYYY'), left(err, 200), d.period_start)));
        end if;
        raise warning 'drink submissions email for % gave up: %', d.period_start, err;
      end if;
    end if;
  end loop;
exception when others then
  raise warning 'check_submissions_digest: %', sqlerrm;
end;
$$;

-- 019: the reel limits, in one place. The trigger, the storage policy
-- and my_reel_quota all read these, and the app reads them back from
-- my_reel_quota. 3 a day and 20 live while on the free tier.
create or replace function private.reel_day_limit()
returns integer language sql immutable set search_path = '' as $$ select 3 $$;

create or replace function private.reel_live_limit()
returns integer language sql immutable set search_path = '' as $$ select 20 $$;

-- 019: reels the caller has reported, hidden from the caller by
-- reels_read. Same once-per-query pattern as my_block_set.
create or replace function private.my_reported_reels()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(r.reported_reel_id), '{}'::uuid[])
  from public.reports r
  where r.reporter_id = auth.uid()
    and r.reported_reel_id is not null;
$$;

-- 019: Storage's insert check for reels/: at most two files a live reel
-- plus four spare, and two files per allowed reel in a day plus the same
-- spare, so files no row points at cannot pile up.
create or replace function private.reel_upload_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select count(*) as files,
           count(*) filter (where o.created_at > now() - interval '24 hours') as files_today
    from storage.objects o
    where o.bucket_id = 'reels'
      and (storage.foldername(o.name))[1] = auth.uid()::text
  )
  select m.files < 2 * (select count(*) from public.reels r where r.author_id = auth.uid()) + 4
     and m.files_today < 2 * private.reel_day_limit() + 4
  from mine m;
$$;

-- 019: the per-author quota on posting a reel, serialised per author.
create or replace function public.guard_reel_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  today integer;
  live  integer;
begin
  -- Serialises one author's concurrent inserts, as charge_discovery does
  -- (011): parallel posts must not all read the same count and pass.
  perform pg_advisory_xact_lock(hashtextextended('reels:' || new.author_id::text, 0));

  select count(*) filter (where r.created_at > now() - interval '24 hours'),
         count(*)
    into today, live
  from public.reels r
  where r.author_id = new.author_id;

  if today >= private.reel_day_limit() then
    raise exception 'reel_quota_day'
      using errcode = 'P0001',
            detail  = format('%s reels in the last 24 hours; the limit is %s', today, private.reel_day_limit()),
            hint    = 'Try again tomorrow.';
  end if;

  if live >= private.reel_live_limit() then
    raise exception 'reel_quota_total'
      using errcode = 'P0001',
            detail  = format('%s reels posted; the limit is %s', live, private.reel_live_limit()),
            hint    = 'Delete a reel to post another.';
  end if;

  return new;
end;
$$;

-- 019: the caller's reel counts and the limits, for the recorder's gate.
create or replace function public.my_reel_quota()
returns table (
  posted_today integer,
  live         integer,
  files        integer,
  day_limit    integer,
  live_limit   integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::int from public.reels r
      where r.author_id = auth.uid() and r.created_at > now() - interval '24 hours'),
    (select count(*)::int from public.reels r where r.author_id = auth.uid()),
    (select count(*)::int from storage.objects o
      where o.bucket_id = 'reels' and (storage.foldername(o.name))[1] = auth.uid()::text),
    private.reel_day_limit(),
    private.reel_live_limit();
$$;

-- 020: the 011 content filter on a story song's title and artist. The app
-- retries a refused photo without its song (detail 'music').
create or replace function public.reject_objectionable_music()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.music_title is not null
     and (public.is_objectionable(new.music_title) or public.is_objectionable(new.music_artist)) then
    raise exception 'objectionable_content' using errcode = 'P0001', detail = 'music';
  end if;
  return new;
end;
$$;

-- 020: charges one song search to the caller, 120 per account per hour.
-- Called by the apple-music Edge Function as the user. One upsert, so
-- parallel searches each add one; a day of old rows is swept on the way.
create or replace function public.charge_music_search()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n   integer;
begin
  if uid is null then
    return false;
  end if;
  delete from private.music_search_usage u
  where u.user_id = uid and u.hour < now() - interval '1 day';
  insert into private.music_search_usage as u (user_id, hour, count)
  values (uid, date_trunc('hour', now()), 1)
  on conflict (user_id, hour) do update set count = u.count + 1
  returning u.count into n;
  return n <= 120;
end;
$$;

-- 020: the content filter on a tournament's name, on insert and rename.
create or replace function public.reject_objectionable_tournament()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.name is distinct from old.name) and public.is_objectionable(new.name) then
    raise exception 'objectionable_content' using errcode = 'P0001', detail = 'tournament_name';
  end if;
  return new;
end;
$$;

-- 020: the tournaments the caller hosts or is invited to or in, for the
-- read policies. A helper, not a join in the policy: the two tables'
-- policies reading each other would recurse. Declined or left = gone.
create or replace function private.my_tournament_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(x.id), '{}'::uuid[])
  from (
    select t.id from public.tournaments t
    where t.host_id = (select auth.uid())
    union
    select m.tournament_id from public.tournament_members m
    where m.user_id = (select auth.uid())
      and m.status in ('invited', 'accepted')
  ) x;
$$;

-- 020: new drinks that count per member per calendar day (App Review
-- 1.4.3). One constant, read by the scoring and the boards.
create or replace function private.tournament_daily_cap()
returns integer language sql immutable set search_path = '' as $$ select 3 $$;

-- 020: every accepted member's standing, counting events before `upto`.
-- An event is the member's post for a catalogue drink being created or a
-- photo added to it; each drink counts at its FIRST event in the window,
-- unless that day's cap is already used, so a drink past the cap never
-- counts later. Not block-filtered: callers filter. Row order = rank:
-- goal reached first, most different drinks, got there first, user id.
create or replace function private.tournament_standings(t uuid, upto timestamptz)
returns table (user_id uuid, distinct_drinks integer, today_counted integer,
               reached_at timestamptz, target_at timestamptz, rank integer)
language sql
stable
security definer
set search_path = ''
as $$
  with tt as (
    select x.starts_at, x.tz, x.target from public.tournaments x where x.id = t
  ),
  members as (
    select m.user_id from public.tournament_members m
    where m.tournament_id = t and m.status = 'accepted'
  ),
  events as (
    select p.author_id, p.drink_id, p.created_at as ev_at
    from public.posts p
    join members m on m.user_id = p.author_id
    cross join tt
    where p.created_at >= tt.starts_at and p.created_at < upto and p.drink_id !~ '^u_'
    union all
    select p.author_id, p.drink_id, ph.created_at
    from public.post_photos ph
    join public.posts p on p.id = ph.post_id
    join members m on m.user_id = p.author_id
    cross join tt
    where ph.created_at >= tt.starts_at and ph.created_at < upto and p.drink_id !~ '^u_'
  ),
  firsts as (
    select e.author_id, e.drink_id, min(e.ev_at) as first_at
    from events e
    group by e.author_id, e.drink_id
  ),
  dayed as (
    select f.author_id, f.drink_id, f.first_at,
           (f.first_at at time zone tt.tz)::date as on_day,
           row_number() over (partition by f.author_id, (f.first_at at time zone tt.tz)::date
                              order by f.first_at, f.drink_id) as nth_that_day
    from firsts f
    cross join tt
  ),
  counted as (
    select d.author_id, d.first_at, d.on_day,
           row_number() over (partition by d.author_id order by d.first_at, d.drink_id) as nth
    from dayed d
    where d.nth_that_day <= private.tournament_daily_cap()
  ),
  per as (
    select m.user_id,
           count(c.first_at)::integer as distinct_drinks,
           (count(c.first_at) filter (where c.on_day = (now() at time zone tt.tz)::date))::integer
             as today_counted,
           max(c.first_at) as reached_at,
           min(c.first_at) filter (where tt.target is not null and c.nth = tt.target) as target_at
    from members m
    cross join tt
    left join counted c on c.author_id = m.user_id
    group by m.user_id, tt.tz, tt.target
  )
  select per.user_id, per.distinct_drinks, per.today_counted, per.reached_at, per.target_at,
         (row_number() over (order by per.target_at asc nulls last, per.distinct_drinks desc,
                                      per.reached_at asc nulls last, per.user_id))::integer
  from per;
$$;

-- 020: when counting stops, or null while it runs. A goal reached stops
-- it at that post (+ 1 microsecond, so the winning post counts).
create or replace function private.tournament_finish_at(t uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r   public.tournaments;
  hit timestamptz;
begin
  select * into r from public.tournaments x where x.id = t;
  if not found then
    return null;
  end if;
  if r.target is not null then
    select min(s.target_at) into hit
    from private.tournament_standings(t, least(r.ends_at, coalesce(r.ended_at, r.ends_at), now())) s;
    if hit is not null then
      return hit + interval '1 microsecond';
    end if;
  end if;
  if r.ended_at is not null then
    return least(r.ended_at, r.ends_at);
  end if;
  if now() >= r.ends_at then
    return r.ends_at;
  end if;
  return null;
end;
$$;

-- 020: freezes a finished tournament's results, once. The lock is the one
-- every tournament write takes.
create or replace function private.finalize_tournament(t uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  fin timestamptz;
  win uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('tournament:' || t::text, 0));
  if exists (select 1 from public.tournaments x where x.id = t and x.finalized_at is not null) then
    return;
  end if;
  fin := private.tournament_finish_at(t);
  if fin is null then
    return;
  end if;
  update public.tournament_members m
     set final_distinct = s.distinct_drinks, final_reached_at = s.reached_at, final_rank = s.rank
    from private.tournament_standings(t, fin) s
   where m.tournament_id = t and m.user_id = s.user_id;
  select s.user_id into win
  from private.tournament_standings(t, fin) s
  where s.rank = 1 and s.distinct_drinks > 0;
  update public.tournaments x
     set finished_at = fin, winner_id = win, finalized_at = now()
   where x.id = t;
end;
$$;

-- 020: 'finished' only once frozen.
create or replace function private.tournament_state(r public.tournaments)
returns text
language sql
stable
set search_path = ''
as $$
  select case when r.finalized_at is not null then 'finished'
              when now() < r.starts_at then 'upcoming'
              else 'live' end;
$$;

-- 020: one tournament with its standings, frozen or live. Volatile: it
-- freezes one that has just finished. Anyone the caller is blocked with is
-- left out; a blocked winner is hidden, never named.
create or replace function public.tournament_board(t uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r       public.tournaments;
  me      uuid := auth.uid();
  blocked uuid[] := private.my_block_set();
begin
  if me is null or not (t = any (private.my_tournament_ids())) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform private.finalize_tournament(t);
  select * into r from public.tournaments x where x.id = t;
  if not found or r.host_id = any (blocked) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'id', r.id, 'name', r.name, 'host_id', r.host_id,
    'starts_at', r.starts_at, 'ends_at', r.ends_at, 'target', r.target,
    'ended_at', r.ended_at, 'finished_at', r.finished_at,
    'state', private.tournament_state(r), 'daily_cap', private.tournament_daily_cap(),
    'winner_id', case when r.winner_id = any (blocked) then null else r.winner_id end,
    'winner_hidden', coalesce(r.winner_id = any (blocked), false),
    'my_status', case when r.host_id = me then 'host'
                      else (select m.status from public.tournament_members m
                            where m.tournament_id = t and m.user_id = me) end,
    'standings', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'distinct', s.distinct_drinks,
               'today', s.today_counted, 'reached_at', s.reached_at, 'rank', s.rank) order by s.rank)
      from (
        -- Frozen: the stored results.
        select m.user_id, m.final_distinct::integer as distinct_drinks, 0 as today_counted,
               m.final_reached_at as reached_at, m.final_rank::integer as rank
        from public.tournament_members m
        where r.finalized_at is not null and m.tournament_id = t and m.status = 'accepted'
          and m.final_rank is not null
        union all
        -- Running (or not started: everyone at 0): live from the posts.
        select x.user_id, x.distinct_drinks, x.today_counted, x.reached_at, x.rank
        from private.tournament_standings(t, greatest(least(r.ends_at, now()), r.starts_at)) x
        where r.finalized_at is null
      ) s
      where not (s.user_id = any (blocked))), '[]'::jsonb),
    'invited', coalesce((
      select jsonb_agg(m.user_id order by m.invited_at) from public.tournament_members m
      where m.tournament_id = t and m.status = 'invited' and not (m.user_id = any (blocked))), '[]'::jsonb)
  );
end;
$$;

-- 020: every tournament the caller hosts or is invited to or in, newest
-- start first, freezing any that have just finished (in id order, so two
-- callers take the locks in the same order).
create or replace function public.my_tournaments()
returns table (id uuid, name text, host_id uuid, starts_at timestamptz, ends_at timestamptz,
               target integer, finished_at timestamptz, winner_id uuid, winner_distinct integer,
               state text, my_status text, members integer, my_rank integer, my_distinct integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me      uuid := auth.uid();
  tid     uuid;
  blocked uuid[] := private.my_block_set();
begin
  if me is null then
    return;
  end if;
  -- In id order: each freeze takes that tournament's lock and holds it to
  -- the end of the call, so two of these running at once must take the
  -- locks they have in common in the same order or they can deadlock.
  for tid in
    select x.id from public.tournaments x
    where x.id = any (private.my_tournament_ids()) and x.finalized_at is null
    order by x.id
  loop
    perform private.finalize_tournament(tid);
  end loop;
  return query
  select t.id, t.name, t.host_id, t.starts_at, t.ends_at, t.target::integer, t.finished_at,
         case when t.winner_id = any (blocked) then null else t.winner_id end,
         -- The STORED winner's count, even when the name is hidden: a count
         -- with no winner_id is how the app knows the winner is hidden
         -- (this signature has no winner_hidden column, unlike tournament_board).
         (select w.final_distinct::integer from public.tournament_members w
          where w.tournament_id = t.id and w.user_id = t.winner_id),
         private.tournament_state(t),
         case when t.host_id = me then 'host' else m.status end,
         (select count(*)::integer from public.tournament_members c
          where c.tournament_id = t.id and c.status = 'accepted'),
         coalesce(m.final_rank::integer, live.rank),
         coalesce(m.final_distinct::integer, live.distinct_drinks)
  from public.tournaments t
  left join public.tournament_members m on m.tournament_id = t.id and m.user_id = me
  left join lateral (
    select s.rank, s.distinct_drinks
    from private.tournament_standings(t.id, greatest(least(t.ends_at, now()), t.starts_at)) s
    where s.user_id = me and t.finalized_at is null
  ) live on true
  where t.id = any (private.my_tournament_ids()) and not (t.host_id = any (blocked))
  order by t.starts_at desc
  limit 100;
end;
$$;

-- 020: invites, as the host, people the host follows, not blocked either
-- way and never in it before (declined stays declined); 50 seats with the
-- host. Returns how many were invited.
create or replace function private.add_invitees(t uuid, host uuid, people uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  room  integer;
  added integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('tournament:' || t::text, 0));
  room := 50 - (select count(*) from public.tournament_members m
                where m.tournament_id = t and m.status in ('invited', 'accepted'));
  insert into public.tournament_members (tournament_id, user_id)
  select t, ok.person from (
    select distinct u.person
    from unnest(coalesce(people, '{}'::uuid[])) as u(person)
    where u.person is not null
      and u.person <> host
      and exists (select 1 from public.follows f
                  where f.follower_id = host and f.following_id = u.person)
      and not public.blocked_with(u.person)
      and not exists (select 1 from public.tournament_members m
                      where m.tournament_id = t and m.user_id = u.person)
    limit greatest(room, 0)
  ) ok;
  get diagnostics added = row_count;
  return added;
end;
$$;

-- 020: hosts a tournament. Errors are P0001: invalid_dates, invalid_goal,
-- too_many_tournaments, no_invitees (rolls the call back), and the name
-- filter's objectionable_content (detail 'tournament_name').
create or replace function public.create_tournament(
  p_name text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_target integer, p_tz text, p_invitees uuid[])
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me  uuid := auth.uid();
  tid uuid;
begin
  if me is null then
    raise exception 'not signed in: create_tournament got no auth.uid()' using errcode = '28000';
  end if;
  if p_starts_at is null or p_ends_at is null
     or p_starts_at < now() - interval '5 minutes' or p_starts_at > now() + interval '30 days'
     or p_ends_at - p_starts_at < interval '1 day' or p_ends_at - p_starts_at > interval '31 days' then
    raise exception 'invalid_dates' using errcode = 'P0001';
  end if;
  -- A goal the daily cap makes unreachable (First to 10 in 3 days) is refused.
  if p_target is not null
     and (p_target < 2 or p_target > 100
          or p_target > private.tournament_daily_cap()
                        * ceil(extract(epoch from (p_ends_at - p_starts_at)) / 86400.0)) then
    raise exception 'invalid_goal' using errcode = 'P0001';
  end if;

  -- Serialises one host's creates, as charge_discovery does (011), so
  -- parallel calls cannot all read 4 and pass.
  perform pg_advisory_xact_lock(hashtextextended('tournaments:' || me::text, 0));
  if (select count(*) from public.tournaments x
      where x.host_id = me and x.finalized_at is null and x.ended_at is null and x.ends_at > now()) >= 5
     or (select count(*) from public.tournaments x
         where x.host_id = me and x.created_at > now() - interval '30 days') >= 10 then
    raise exception 'too_many_tournaments' using errcode = 'P0001';
  end if;

  -- One line, single spaces: the name check's shape. The filter runs in
  -- the insert trigger.
  insert into public.tournaments (host_id, name, starts_at, ends_at, target, tz)
  values (me, btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), p_starts_at, p_ends_at,
          p_target,
          coalesce((select z.name from pg_catalog.pg_timezone_names z where z.name = p_tz), 'UTC'))
  returning id into tid;

  insert into public.tournament_members (tournament_id, user_id, status, responded_at)
  values (tid, me, 'accepted', now());

  if private.add_invitees(tid, me, p_invitees) = 0 then
    raise exception 'no_invitees' using errcode = 'P0001';     -- rolls the whole call back
  end if;
  return tid;
end;
$$;

-- 020: host only, before it finishes (not_allowed, finished).
create or replace function public.invite_to_tournament(t uuid, people uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  r  public.tournaments;
begin
  if me is null then
    raise exception 'not signed in: invite_to_tournament got no auth.uid()' using errcode = '28000';
  end if;
  if not (t = any (private.my_tournament_ids())) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('tournament:' || t::text, 0));
  select * into r from public.tournaments x where x.id = t;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if r.host_id <> me then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if r.finalized_at is not null or private.tournament_finish_at(t) is not null then
    raise exception 'finished' using errcode = 'P0001';
  end if;
  return private.add_invitees(t, me, people);
end;
$$;

-- 020: an invitee joins or declines; declining is final.
create or replace function public.respond_to_tournament(t uuid, accept boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  r  public.tournaments;
begin
  if me is null then
    raise exception 'not signed in: respond_to_tournament got no auth.uid()' using errcode = '28000';
  end if;
  if not (t = any (private.my_tournament_ids())) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('tournament:' || t::text, 0));
  select * into r from public.tournaments x where x.id = t;
  if not found or public.blocked_with(r.host_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if accept is null or not exists (
    select 1 from public.tournament_members m
    where m.tournament_id = t and m.user_id = me and m.status = 'invited'
  ) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if r.finalized_at is not null or private.tournament_finish_at(t) is not null then
    raise exception 'finished' using errcode = 'P0001';
  end if;
  update public.tournament_members m
     set status = case when accept then 'accepted' else 'declined' end, responded_at = now()
   where m.tournament_id = t and m.user_id = me;
end;
$$;

-- 020: an accepted member who is not the host leaves, for good.
create or replace function public.leave_tournament(t uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  r  public.tournaments;
begin
  if me is null then
    raise exception 'not signed in: leave_tournament got no auth.uid()' using errcode = '28000';
  end if;
  if not (t = any (private.my_tournament_ids())) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('tournament:' || t::text, 0));
  select * into r from public.tournaments x where x.id = t;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if r.host_id = me or not exists (
    select 1 from public.tournament_members m
    where m.tournament_id = t and m.user_id = me and m.status = 'accepted'
  ) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if r.finalized_at is not null or private.tournament_finish_at(t) is not null then
    raise exception 'finished' using errcode = 'P0001';
  end if;
  update public.tournament_members m
     set status = 'declined', responded_at = now()
   where m.tournament_id = t and m.user_id = me;
end;
$$;

-- 020: the host ends a live tournament now; an upcoming one is deleted.
create or replace function public.end_tournament(t uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  r  public.tournaments;
begin
  if me is null then
    raise exception 'not signed in: end_tournament got no auth.uid()' using errcode = '28000';
  end if;
  if not (t = any (private.my_tournament_ids())) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('tournament:' || t::text, 0));
  select * into r from public.tournaments x where x.id = t;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if r.host_id <> me or now() < r.starts_at then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if r.finalized_at is not null then
    raise exception 'finished' using errcode = 'P0001';
  end if;
  if private.tournament_finish_at(t) is null then
    update public.tournaments x set ended_at = now() where x.id = t;
  end if;
  perform private.finalize_tournament(t);
end;
$$;

-- 020: the host deletes it; members cascade.
create or replace function public.delete_tournament(t uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  r  public.tournaments;
begin
  if me is null then
    raise exception 'not signed in: delete_tournament got no auth.uid()' using errcode = '28000';
  end if;
  if not (t = any (private.my_tournament_ids())) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('tournament:' || t::text, 0));
  select * into r from public.tournaments x where x.id = t;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if r.host_id <> me then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  delete from public.tournaments x where x.id = t;
end;
$$;

-- 020: a block between a host and a member takes the member out of every
-- unfinished tournament (as drop_follows_on_block drops the follows).
create or replace function private.drop_tournament_membership_on_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tournament_members m
     set status = 'declined', responded_at = now()
    from public.tournaments x
   where x.id = m.tournament_id and x.finalized_at is null and m.status <> 'declined'
     and ((x.host_id = new.blocker_id and m.user_id = new.blocked_id)
       or (x.host_id = new.blocked_id and m.user_id = new.blocker_id));
  return null;
end;
$$;


-- --------------------------------------------------------------------
-- Function privileges
--
-- Postgres grants EXECUTE on every new function to PUBLIC, so each one is
-- revoked first and granted only where a client needs it. The exceptions
-- are handle_new_user, drop_follows_on_block and sync_post_preview, which
-- were never revoked on the live project either; they are trigger
-- functions, which cannot be called as RPCs, and a trigger fires without
-- any EXECUTE check. Everything the monthly email uses (018) is callable
-- by nobody but its owner, which is what pg_cron runs as.
-- --------------------------------------------------------------------

revoke all on function public.pin_created_at()               from public, anon, authenticated;
revoke all on function public.reject_objectionable_post()    from public, anon, authenticated;
revoke all on function public.reject_objectionable_profile() from public, anon, authenticated;
revoke all on function public.prepare_report()               from public, anon, authenticated;
revoke all on function public.alert_new_report()             from public, anon, authenticated;
revoke all on function private.report_evidence(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.charge_discovery(text, integer) from public, anon, authenticated;
revoke all on function public.prepare_drink_submission()     from public, anon, authenticated;
revoke all on function public.guard_reel_insert()            from public, anon, authenticated;
revoke all on function private.reel_day_limit()              from public, anon, authenticated;
revoke all on function private.reel_live_limit()             from public, anon, authenticated;

revoke all on function private.html_escape(text)                                        from public, anon, authenticated;
revoke all on function private.drink_slug(text)                                         from public, anon, authenticated;
revoke all on function private.abv_text(numeric, numeric)                               from public, anon, authenticated;
revoke all on function private.submission_todo(public.drink_submissions)                from public, anon, authenticated;
revoke all on function private.submission_meta(public.drink_submissions, text)          from public, anon, authenticated;
revoke all on function private.submission_entry(public.drink_submissions, text)         from public, anon, authenticated;
revoke all on function private.submission_card_html(public.drink_submissions, text, integer) from public, anon, authenticated;
revoke all on function private.digest_html(text, integer, integer, integer, text, text) from public, anon, authenticated;
revoke all on function private.send_submissions_digest(boolean, date)                   from public, anon, authenticated;
revoke all on function private.check_submissions_digest()                               from public, anon, authenticated;

revoke all on function private.my_block_set() from public, anon;
grant execute on function private.my_block_set() to authenticated;

-- Read by reels_read and the reels/ insert policy, which run as the
-- querying role (019).
revoke all on function private.my_reported_reels()   from public, anon;
revoke all on function private.reel_upload_allowed() from public, anon;
grant execute on function private.my_reported_reels()   to authenticated;
grant execute on function private.reel_upload_allowed() to authenticated;

revoke all on function public.blocked_with(uuid) from public, anon;
grant execute on function public.blocked_with(uuid) to authenticated;

-- anon too: signup asks before creating the account (011).
revoke all on function public.is_objectionable(text, boolean) from public;
grant execute on function public.is_objectionable(text, boolean) to anon, authenticated;

-- anon too: the email step asks before anyone is signed in (016).
revoke all on function public.sign_in_method(text) from public;
grant execute on function public.sign_in_method(text) to anon, authenticated;

revoke all on function public.delete_own_account()             from public, anon;
revoke all on function public.set_phone_hash(text)             from public, anon;
revoke all on function public.set_instagram_hash(text)         from public, anon;
revoke all on function public.match_contacts(text[])           from public, anon;
revoke all on function public.match_instagram(text[])          from public, anon;
revoke all on function public.match_facebook_friends(text[])   from public, anon;
revoke all on function public.follow_many(uuid[])              from public, anon;
revoke all on function public.accept_invite(uuid)              from public, anon;
revoke all on function public.recent_pours()                   from public, anon;
revoke all on function public.my_reel_quota()                  from public, anon;
grant execute on function public.delete_own_account()           to authenticated;
grant execute on function public.set_phone_hash(text)           to authenticated;
grant execute on function public.set_instagram_hash(text)       to authenticated;
grant execute on function public.match_contacts(text[])         to authenticated;
grant execute on function public.match_instagram(text[])        to authenticated;
grant execute on function public.match_facebook_friends(text[]) to authenticated;
grant execute on function public.follow_many(uuid[])            to authenticated;
grant execute on function public.accept_invite(uuid)            to authenticated;
grant execute on function public.recent_pours()                 to authenticated;
grant execute on function public.my_reel_quota()                to authenticated;

-- 020. The trigger functions and the scoring helpers are reached only
-- through the definer functions; my_tournament_ids is read by the
-- tournament read policies as the querying role.
revoke all on function public.reject_objectionable_music()                from public, anon, authenticated;
revoke all on function public.reject_objectionable_tournament()           from public, anon, authenticated;
revoke all on function private.drop_tournament_membership_on_block()      from public, anon, authenticated;
revoke all on function private.tournament_daily_cap()                     from public, anon, authenticated;
revoke all on function private.tournament_standings(uuid, timestamptz)    from public, anon, authenticated;
revoke all on function private.tournament_finish_at(uuid)                 from public, anon, authenticated;
revoke all on function private.finalize_tournament(uuid)                  from public, anon, authenticated;
revoke all on function private.tournament_state(public.tournaments)       from public, anon, authenticated;
revoke all on function private.add_invitees(uuid, uuid, uuid[])           from public, anon, authenticated;

revoke all on function private.my_tournament_ids() from public, anon;
grant execute on function private.my_tournament_ids() to authenticated;

revoke all on function public.charge_music_search()                                          from public, anon;
revoke all on function public.tournament_board(uuid)                                         from public, anon;
revoke all on function public.my_tournaments()                                               from public, anon;
revoke all on function public.create_tournament(text, timestamptz, timestamptz, integer, text, uuid[]) from public, anon;
revoke all on function public.invite_to_tournament(uuid, uuid[])                             from public, anon;
revoke all on function public.respond_to_tournament(uuid, boolean)                           from public, anon;
revoke all on function public.leave_tournament(uuid)                                         from public, anon;
revoke all on function public.end_tournament(uuid)                                           from public, anon;
revoke all on function public.delete_tournament(uuid)                                        from public, anon;
grant execute on function public.charge_music_search()                                       to authenticated;
grant execute on function public.tournament_board(uuid)                                      to authenticated;
grant execute on function public.my_tournaments()                                            to authenticated;
grant execute on function public.create_tournament(text, timestamptz, timestamptz, integer, text, uuid[]) to authenticated;
grant execute on function public.invite_to_tournament(uuid, uuid[])                          to authenticated;
grant execute on function public.respond_to_tournament(uuid, boolean)                        to authenticated;
grant execute on function public.leave_tournament(uuid)                                      to authenticated;
grant execute on function public.end_tournament(uuid)                                        to authenticated;
grant execute on function public.delete_tournament(uuid)                                     to authenticated;


-- --------------------------------------------------------------------
-- Triggers
-- --------------------------------------------------------------------

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists on_block_drop_follows on public.blocks;
create trigger on_block_drop_follows
  after insert on public.blocks
  for each row execute function public.drop_follows_on_block();

drop trigger if exists on_post_photo_change on public.post_photos;
create trigger on_post_photo_change
  after insert or update or delete on public.post_photos
  for each row execute function public.sync_post_preview();

drop trigger if exists posts_pin_created_at on public.posts;
create trigger posts_pin_created_at
  before insert or update on public.posts
  for each row execute function public.pin_created_at();

drop trigger if exists profiles_pin_created_at on public.profiles;
create trigger profiles_pin_created_at
  before insert or update on public.profiles
  for each row execute function public.pin_created_at();

-- 017: Today's pours and Activity order by these three clocks, so the
-- server owns them too.
drop trigger if exists post_photos_pin_created_at on public.post_photos;
create trigger post_photos_pin_created_at
  before insert or update on public.post_photos
  for each row execute function public.pin_created_at();

drop trigger if exists likes_pin_created_at on public.likes;
create trigger likes_pin_created_at
  before insert or update on public.likes
  for each row execute function public.pin_created_at();

drop trigger if exists follows_pin_created_at on public.follows;
create trigger follows_pin_created_at
  before insert or update on public.follows
  for each row execute function public.pin_created_at();

drop trigger if exists posts_reject_objectionable on public.posts;
create trigger posts_reject_objectionable
  before insert or update of caption on public.posts
  for each row execute function public.reject_objectionable_post();

drop trigger if exists profiles_reject_objectionable on public.profiles;
create trigger profiles_reject_objectionable
  before insert or update of username, display_name, bio on public.profiles
  for each row execute function public.reject_objectionable_profile();

drop trigger if exists reports_prepare on public.reports;
create trigger reports_prepare
  before insert on public.reports
  for each row execute function public.prepare_report();

drop trigger if exists reports_alert on public.reports;
create trigger reports_alert
  after insert on public.reports
  for each row execute function public.alert_new_report();

-- 018. The update trigger is scoped to content columns, so Jan's
-- `update … set status = …` neither re-validates nor bumps updated_at
-- (which would drag the row into next month's email).
drop trigger if exists drink_submissions_prepare_insert on public.drink_submissions;
create trigger drink_submissions_prepare_insert
  before insert on public.drink_submissions
  for each row execute function public.prepare_drink_submission();

drop trigger if exists drink_submissions_prepare_update on public.drink_submissions;
create trigger drink_submissions_prepare_update
  before update of name, category, subcategory, subcategory_is_new, description, abv_low, abv_high,
    origin, glassware, tasting_notes, fun_fact, ingredients, steps, method, garnish, base,
    distillation, aging, serve_temp, serve_how, pairings, process, note_for_team, photo_path
  on public.drink_submissions
  for each row execute function public.prepare_drink_submission();

-- 019. Same-timing triggers fire in name order: the quota first, then the
-- server's clock, then the content filter, which pin_created_at and
-- reject_objectionable_post serve unchanged (they read only created_at
-- and caption).
drop trigger if exists reels_guard on public.reels;
create trigger reels_guard
  before insert on public.reels
  for each row execute function public.guard_reel_insert();

drop trigger if exists reels_pin_created_at on public.reels;
create trigger reels_pin_created_at
  before insert or update on public.reels
  for each row execute function public.pin_created_at();

drop trigger if exists reels_reject_objectionable on public.reels;
create trigger reels_reject_objectionable
  before insert or update of caption on public.reels
  for each row execute function public.reject_objectionable_post();

-- 020. post_photos takes inserts only; the update arm is there so a future
-- update policy cannot route around the filter.
drop trigger if exists post_photos_reject_objectionable on public.post_photos;
create trigger post_photos_reject_objectionable
  before insert or update of music_title, music_artist on public.post_photos
  for each row execute function public.reject_objectionable_music();

drop trigger if exists tournaments_reject_objectionable on public.tournaments;
create trigger tournaments_reject_objectionable
  before insert or update on public.tournaments
  for each row execute function public.reject_objectionable_tournament();

drop trigger if exists tournaments_pin_created_at on public.tournaments;
create trigger tournaments_pin_created_at
  before insert or update on public.tournaments
  for each row execute function public.pin_created_at();

drop trigger if exists blocks_drop_tournament_membership on public.blocks;
create trigger blocks_drop_tournament_membership
  after insert on public.blocks
  for each row execute function private.drop_tournament_membership_on_block();


-- --------------------------------------------------------------------
-- Table privileges
--
-- Supabase grants every new public table to anon and authenticated; the
-- tables below take that back. profile_secrets, discovery_usage,
-- blocked_terms, sign_in_lookups and schema_migrations are unreachable
-- from the API entirely. invites may be read and deleted by its owner and
-- inserted naming only inviter_id, so the token and expiry stay
-- server-made. saves (017) and drink_submissions (018) likewise grant
-- only the columns a client may name; drink_submissions' review columns
-- and clocks are never granted. Nobody edits a reel (019): no update
-- grant, on top of having no update policy. Tournaments (020) are
-- select-only: every write is an RPC, so the rules on dates, goals, seats
-- and blocks cannot be skipped by writing rows.
-- --------------------------------------------------------------------

grant select on public.profiles to anon, authenticated;

revoke all on public.profile_secrets from anon, authenticated;
revoke all on public.discovery_usage from anon, authenticated;
revoke all on public.blocked_terms   from anon, authenticated;
revoke all on public.sign_in_lookups from anon, authenticated;

revoke all on public.invites from anon, authenticated;
grant select, delete on public.invites to authenticated;
grant insert (inviter_id) on public.invites to authenticated;

revoke all on public.saves from anon, authenticated;
grant select, delete on public.saves to authenticated;
grant insert (user_id, post_id) on public.saves to authenticated;

revoke all on public.drink_submissions from anon, authenticated;
grant select, delete on public.drink_submissions to authenticated;
grant insert (id, name, category, subcategory, subcategory_is_new, description, abv_low, abv_high,
  origin, glassware, tasting_notes, fun_fact, ingredients, steps, method, garnish, base,
  distillation, aging, serve_temp, serve_how, pairings, process, note_for_team, photo_path)
  on public.drink_submissions to authenticated;
grant update (name, category, subcategory, subcategory_is_new, description, abv_low, abv_high,
  origin, glassware, tasting_notes, fun_fact, ingredients, steps, method, garnish, base,
  distillation, aging, serve_temp, serve_how, pairings, process, note_for_team, photo_path)
  on public.drink_submissions to authenticated;

revoke all on public.reels      from anon;
revoke all on public.reel_likes from anon;
revoke update, truncate, references, trigger on public.reels      from authenticated;
revoke update, truncate, references, trigger on public.reel_likes from authenticated;

revoke all on private.submission_digests from public, anon, authenticated;
revoke all on private.music_search_usage from public, anon, authenticated;

revoke all on public.tournaments, public.tournament_members from anon, authenticated;
grant select on public.tournaments, public.tournament_members to authenticated;


-- --------------------------------------------------------------------
-- Row Level Security
--
-- Reads that depend on blocks use private.my_block_set() wrapped in
-- (select ...), which the planner evaluates once per query; blocked_with
-- in a read policy would run once per row (011). Your own rows are never
-- in the set, because a block cannot name yourself.
-- --------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.profile_secrets enable row level security;
alter table public.follows         enable row level security;
alter table public.posts           enable row level security;
alter table public.post_photos     enable row level security;
alter table public.likes           enable row level security;
alter table public.blocks          enable row level security;
alter table public.reports         enable row level security;
alter table public.invites         enable row level security;
alter table public.discovery_usage enable row level security;
alter table public.blocked_terms   enable row level security;
alter table public.sign_in_lookups enable row level security;
alter table public.saves           enable row level security;
alter table public.drink_submissions enable row level security;
alter table public.reels           enable row level security;
alter table public.reel_likes      enable row level security;
alter table private.submission_digests enable row level security;
alter table private.music_search_usage enable row level security;
alter table public.tournaments     enable row level security;
alter table public.tournament_members enable row level security;

-- Profiles: readable by any signed-in user not blocked either way (you
-- must be able to find people to follow), writable only by their owner.
drop policy if exists profiles_read       on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_read on public.profiles
  for select to authenticated
  using (not (id = any ((select private.my_block_set())::uuid[])));

create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (auth.uid() = id);

create policy profiles_update_own on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Follows: readable (follower counts) except edges touching someone you
-- are blocked with; you may only create and remove edges where YOU are
-- the follower, and never toward a blocked pair.
drop policy if exists follows_read       on public.follows;
drop policy if exists follows_insert_own on public.follows;
drop policy if exists follows_delete_own on public.follows;

create policy follows_read on public.follows
  for select to authenticated
  using (not (array[follower_id, following_id] && (select private.my_block_set())));

create policy follows_insert_own on public.follows
  for insert to authenticated
  with check (auth.uid() = follower_id and not public.blocked_with(following_id));

create policy follows_delete_own on public.follows
  for delete to authenticated using (auth.uid() = follower_id);

-- Posts: readable by every signed-in user not blocked either way, so
-- profiles are browsable; the feed narrows to your follow set client-side.
-- Only the author may write or remove their own.
drop policy if exists posts_read       on public.posts;
drop policy if exists posts_insert_own on public.posts;
drop policy if exists posts_update_own on public.posts;
drop policy if exists posts_delete_own on public.posts;

create policy posts_read on public.posts
  for select to authenticated
  using (not (author_id = any ((select private.my_block_set())::uuid[])));

create policy posts_insert_own on public.posts
  for insert to authenticated with check (auth.uid() = author_id);

create policy posts_update_own on public.posts
  for update to authenticated using (auth.uid() = author_id) with check (auth.uid() = author_id);

create policy posts_delete_own on public.posts
  for delete to authenticated using (auth.uid() = author_id);

-- Post photos: exactly as visible as their post (007), and a new one must
-- sit in the author's own folder (014).
drop policy if exists post_photos_read       on public.post_photos;
drop policy if exists post_photos_insert_own on public.post_photos;
drop policy if exists post_photos_delete_own on public.post_photos;

create policy post_photos_read on public.post_photos
  for select to authenticated using (
    exists (select 1 from public.posts p where p.id = post_id)
  );

create policy post_photos_insert_own on public.post_photos
  for insert to authenticated with check (
    split_part(path, '/', 1) = auth.uid()::text
    and exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  );

create policy post_photos_delete_own on public.post_photos
  for delete to authenticated using (
    exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  );

-- Likes: counts are public except likes by someone you are blocked with;
-- you may only like as yourself, and only a post you can see.
drop policy if exists likes_read       on public.likes;
drop policy if exists likes_insert_own on public.likes;
drop policy if exists likes_delete_own on public.likes;

create policy likes_read on public.likes
  for select to authenticated
  using (not (user_id = any ((select private.my_block_set())::uuid[])));

create policy likes_insert_own on public.likes
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.posts p where p.id = post_id)
  );

create policy likes_delete_own on public.likes
  for delete to authenticated using (auth.uid() = user_id);

-- Blocks: private to the blocker. Deliberately NOT readable by the
-- blocked party (006).
drop policy if exists blocks_read_own   on public.blocks;
drop policy if exists blocks_insert_own on public.blocks;
drop policy if exists blocks_delete_own on public.blocks;

create policy blocks_read_own on public.blocks
  for select to authenticated using (auth.uid() = blocker_id);

create policy blocks_insert_own on public.blocks
  for insert to authenticated with check (auth.uid() = blocker_id);

create policy blocks_delete_own on public.blocks
  for delete to authenticated using (auth.uid() = blocker_id);

-- Reports: file one and read back your own; moderation happens in the
-- dashboard (006).
drop policy if exists reports_read_own   on public.reports;
drop policy if exists reports_insert_own on public.reports;

create policy reports_read_own on public.reports
  for select to authenticated using (auth.uid() = reporter_id);

create policy reports_insert_own on public.reports
  for insert to authenticated with check (auth.uid() = reporter_id);

-- Invites: your own only; redeeming goes through accept_invite (011).
drop policy if exists invites_read_own   on public.invites;
drop policy if exists invites_insert_own on public.invites;
drop policy if exists invites_delete_own on public.invites;

create policy invites_read_own on public.invites
  for select to authenticated using (auth.uid() = inviter_id);

create policy invites_insert_own on public.invites
  for insert to authenticated with check (auth.uid() = inviter_id);

create policy invites_delete_own on public.invites
  for delete to authenticated using (auth.uid() = inviter_id);

-- Saves (017): your own only, and only a post you can see (posts_read
-- already hides anyone you are blocked with, either way).
drop policy if exists saves_read_own   on public.saves;
drop policy if exists saves_insert_own on public.saves;
drop policy if exists saves_delete_own on public.saves;

create policy saves_read_own on public.saves
  for select to authenticated using (auth.uid() = user_id);

create policy saves_insert_own on public.saves
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.posts p where p.id = post_id)
  );

create policy saves_delete_own on public.saves
  for delete to authenticated using (auth.uid() = user_id);

-- Drink suggestions (018): own rows only, and nobody else reads. Editable
-- only until Jan has reviewed it; withdrawing is always allowed.
drop policy if exists drink_submissions_read_own   on public.drink_submissions;
drop policy if exists drink_submissions_insert_own on public.drink_submissions;
drop policy if exists drink_submissions_update_own on public.drink_submissions;
drop policy if exists drink_submissions_delete_own on public.drink_submissions;

create policy drink_submissions_read_own on public.drink_submissions
  for select to authenticated using (submitter_id = (select auth.uid()));
create policy drink_submissions_insert_own on public.drink_submissions
  for insert to authenticated with check (submitter_id = (select auth.uid()));
create policy drink_submissions_update_own on public.drink_submissions
  for update to authenticated
  using (submitter_id = (select auth.uid()) and status = 'new')
  with check (submitter_id = (select auth.uid()));
create policy drink_submissions_delete_own on public.drink_submissions
  for delete to authenticated using (submitter_id = (select auth.uid()));

-- Reels (019): like posts, readable by every signed-in account not blocked
-- either way, and also never a reel the caller has reported. Only the
-- author posts or removes one.
drop policy if exists reels_read       on public.reels;
drop policy if exists reels_insert_own on public.reels;
drop policy if exists reels_delete_own on public.reels;

create policy reels_read on public.reels
  for select to authenticated
  using (
    not (author_id = any ((select private.my_block_set())::uuid[]))
    and not (id = any ((select private.my_reported_reels())::uuid[]))
  );

create policy reels_insert_own on public.reels
  for insert to authenticated with check (auth.uid() = author_id);

create policy reels_delete_own on public.reels
  for delete to authenticated using (auth.uid() = author_id);

-- Reel likes (019): like likes. The insert's subquery runs under
-- reels_read, so a reel hidden by a block or by your own report cannot be
-- liked even by someone who kept its id.
drop policy if exists reel_likes_read       on public.reel_likes;
drop policy if exists reel_likes_insert_own on public.reel_likes;
drop policy if exists reel_likes_delete_own on public.reel_likes;

create policy reel_likes_read on public.reel_likes
  for select to authenticated
  using (not (user_id = any ((select private.my_block_set())::uuid[])));

create policy reel_likes_insert_own on public.reel_likes
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.reels r where r.id = reel_id)
  );

create policy reel_likes_delete_own on public.reel_likes
  for delete to authenticated using (auth.uid() = user_id);

-- Tournaments (020): the host and the people invited or in it, never a
-- tournament hosted by someone you are blocked with, and never the row of
-- a member you are blocked with. No write policies: RPCs only.
drop policy if exists tournaments_read        on public.tournaments;
drop policy if exists tournament_members_read on public.tournament_members;

create policy tournaments_read on public.tournaments
  for select to authenticated
  using (
    id = any ((select private.my_tournament_ids())::uuid[])
    and not (host_id = any ((select private.my_block_set())::uuid[]))
  );

create policy tournament_members_read on public.tournament_members
  for select to authenticated
  using (
    tournament_id = any ((select private.my_tournament_ids())::uuid[])
    and not (user_id = any ((select private.my_block_set())::uuid[]))
  );

-- profile_secrets, discovery_usage, blocked_terms, sign_in_lookups,
-- private.submission_digests and private.music_search_usage: RLS on and
-- no policy at all, on top of the revoked grants. Default-deny.


-- --------------------------------------------------------------------
-- Storage: photos and avatars, and reels
--
-- Two private buckets, read through signed URLs.
--
-- `pours`: objects are namespaced
-- pours/<uid>/<file>, and insert and delete are pinned to the owning uid.
-- Any signed-in account may read any folder except that of someone it is
-- blocked with, either way (011): list, download and createSignedUrl all
-- pass through pours_read. Avatars live here too (010), so account
-- deletion's Storage API sweep of pours/<uid>/ covers both.
--
-- 8 MB and images only (003): without them any account was free
-- unlimited file hosting inside its own folder. Drink-suggestion photos
-- (018) go in the same folder and take the same rules.
--
-- `reels` (019): a reel's video and poster, reels/<uid>/<reel id>.mov|.mp4
-- and .jpg. 6 MiB, those three types only. Reads stop at a block, as in
-- pours. Uploads only into your own folder, under a uuid file name, and
-- only while private.reel_upload_allowed() says the folder is not full.
-- No update policy, so nothing is ever overwritten. Account deletion
-- sweeps this folder too.
-- --------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pours', 'pours', false,
  8 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/heic', 'image/webp']
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists pours_read       on storage.objects;
drop policy if exists pours_insert_own on storage.objects;
drop policy if exists pours_delete_own on storage.objects;

create policy pours_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pours'
    and not (coalesce((storage.foldername(name))[1], '') = any ((select private.my_block_set())::text[]))
  );

create policy pours_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pours'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy pours_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'pours'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reels', 'reels', false,
  6 * 1024 * 1024,
  array['video/quicktime', 'video/mp4', 'image/jpeg']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists reels_objects_read       on storage.objects;
drop policy if exists reels_objects_insert_own on storage.objects;
drop policy if exists reels_objects_delete_own on storage.objects;

create policy reels_objects_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'reels'
    and not (coalesce((storage.foldername(name))[1], '') = any ((select private.my_block_set())::text[]))
  );

create policy reels_objects_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'reels'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(mov|mp4|jpg)$'
    and private.reel_upload_allowed()
  );

create policy reels_objects_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'reels'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- --------------------------------------------------------------------
-- The content filter's starting list (011)
--
-- Slurs and explicit sexual terms. Words that are real drink names or
-- bar talk (Porn Star Martini, Red Headed Slut, Sex on the Beach,
-- Slippery Nipple, Blow Job, Suffering Bastard, Mount Gay, Charro Negro,
-- the chink of glasses) and common names (Kike, Coon, Dyke) are left out
-- on purpose. Keep in step with the insert in 011.
-- --------------------------------------------------------------------

insert into public.blocked_terms (term, match_inside) values
  ('nigger',    true),
  ('nigga',     true),
  ('wetback',   true),
  ('raghead',   true),
  ('towelhead', true),
  ('spic',      false),
  ('gook',      false),
  ('beaner',    false),
  ('sudaca',    false),
  ('faggot',    true),
  ('maricon',   true),
  ('maricones', true),
  ('fag',       false),
  ('tranny',    false),
  ('retard',    false),
  ('retarded',  false),
  ('whore',     true),
  ('dildo',     true),
  ('handjob',   true),
  ('cumshot',   true),
  ('mamabicho', true),
  ('cunt',      false),
  ('twat',      false),
  ('puta',      false),
  ('puto',      false)
on conflict (term) do nothing;


-- --------------------------------------------------------------------
-- Scheduled jobs (018)
--
-- The drink-suggestions email: the send job runs daily at 13:00 UTC
-- (09:00 in Puerto Rico) and sends once a month, for the month before;
-- the check job reads Resend's answer hourly and retries or alerts. Both
-- need Vault's resend_api_key and submissions_email before anything is
-- sent; until then the send job answers 'not configured'.
-- Re-runnable: unschedule by name, then schedule.
-- --------------------------------------------------------------------

select cron.unschedule(jobid) from cron.job
 where jobname in ('sipply-submissions-send', 'sipply-submissions-check');
select cron.schedule('sipply-submissions-send',  '0 13 * * *',  $$select private.send_submissions_digest()$$);
select cron.schedule('sipply-submissions-check', '20 * * * *', $$select private.check_submissions_digest()$$);


-- --------------------------------------------------------------------
-- Record what this file stands in for. Last statement on purpose: a run
-- that fails partway must not claim to have succeeded.
-- --------------------------------------------------------------------

insert into public.schema_migrations (version, note) values
  ('schema',                  'schema.sql, current as of 020'),
  ('002_social_graph',        'contained in schema.sql'),
  ('003_hardening',           'contained in schema.sql'),
  ('004_validate_hardening',  'contained in schema.sql'),
  ('005_account_deletion',    'contained in schema.sql'),
  ('006_report_and_block',    'contained in schema.sql'),
  ('007_post_photos',         'contained in schema.sql'),
  ('008_instagram_discovery', 'contained in schema.sql'),
  ('009_schema_migrations',   'contained in schema.sql'),
  ('010_profile_avatar',      'contained in schema.sql'),
  ('011_trust_and_safety',    'contained in schema.sql'),
  ('012_report_retention',    'contained in schema.sql'),
  ('013_report_alerts',       'contained in schema.sql'),
  ('014_bounds_and_indexes',  'contained in schema.sql'),
  ('015_social_sign_in',      'contained in schema.sql'),
  ('016_sign_in_lookup',      'contained in schema.sql'),
  ('017_home_and_profile',    'contained in schema.sql'),
  ('018_drink_submissions',   'contained in schema.sql'),
  ('019_reels',               'contained in schema.sql'),
  ('020_tournaments_and_story_music', 'contained in schema.sql')
on conflict (version) do nothing;
