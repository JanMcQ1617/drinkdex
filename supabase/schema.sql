-- ====================================================================
-- Sipply — the whole schema, as of migration 014
--
-- FOR A NEW, EMPTY SUPABASE PROJECT ONLY. Paste into the SQL Editor and
-- Run once. It builds in one pass what the original base schema plus
-- migrations 002-014 built on the live project, and records every one of
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
-- Extensions and the private schema (011, 013)
--
-- `private` is not exposed by the API: its functions serve policies and
-- other functions and cannot be called as RPCs. `authenticated` needs
-- USAGE because RLS policies run as the querying role.
-- --------------------------------------------------------------------

create extension if not exists pg_net;

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
  unique (post_id, path),
  constraint post_photos_path_len check (char_length(path) <= 200)
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

-- 006, reshaped by 012: a report survives the deletion of its reporter,
-- its post or the person it names (each column is set to null), keeps the
-- author's id and a copy of the reported text, and names exactly one
-- subject when filed (enforced by prepare_report, below).
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
  constraint report_subject_at_most_one check (num_nonnulls(reported_post_id, reported_user_id) <= 1),
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


-- --------------------------------------------------------------------
-- Functions
--
-- Every SECURITY DEFINER function pins search_path to empty, per
-- Supabase's linter: an unpinned search_path on a definer function is a
-- privilege-escalation vector. SQL-language functions come after the
-- tables they read, because Postgres checks their bodies on creation.
-- --------------------------------------------------------------------

-- A profile row for every new auth user, from the signup metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name, accent)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      'pour_' || substr(replace(new.id::text, '-', ''), 1, 8)
    ),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), 'New collector'),
    coalesce(nullif(new.raw_user_meta_data ->> 'accent', ''), '#633444')
  );
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

-- 011: the server owns created_at on posts and profiles.
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

-- 012: who wrote the reported thing, and a copy of the text.
create or replace function private.report_evidence(
  post uuid,
  person uuid,
  out author uuid,
  out snapshot jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with subject as (
    select
      coalesce(person, (select p.author_id from public.posts p where p.id = post)) as author_id
  )
  select
    s.author_id,
    jsonb_strip_nulls(jsonb_build_object(
      'caption',      (select p.caption    from public.posts p where p.id = post),
      'drink_id',     (select p.drink_id   from public.posts p where p.id = post),
      'posted_at',    (select p.created_at from public.posts p where p.id = post),
      'username',     pr.username,
      'display_name', pr.display_name,
      'bio',          pr.bio
    ))
  from subject s
  left join public.profiles pr on pr.id = s.author_id;
$$;

-- 012: exactly one subject, server time, server-built evidence.
create or replace function public.prepare_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if num_nonnulls(new.reported_post_id, new.reported_user_id) <> 1 then
    raise exception 'a report names exactly one post or one person' using errcode = '23514';
  end if;

  new.created_at := now();

  select e.author, e.snapshot
    into new.reported_author_id, new.snapshot
  from private.report_evidence(new.reported_post_id, new.reported_user_id) e;

  return new;
end;
$$;

-- 013: one webhook message per report, if a URL is stored in Vault as
-- 'report_alert_url'. Never carries the reported content, and never
-- blocks the report.
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
        case when new.reported_post_id is not null then 'a post' else 'an account' end,
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

-- 011: the client empties pours/<uid>/ through the Storage API first; this
-- refuses to delete the account while anything is left there. It never
-- deletes from storage.objects: Supabase refuses that, and it would orphan
-- the files if it did not.
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
  where o.bucket_id = 'pours'
    and (storage.foldername(o.name))[1] = uid::text;

  if remaining > 0 then
    raise exception 'photos_remaining'
      using errcode = 'P0001',
            detail  = format('%s file(s) still under pours/%s/', remaining, uid),
            hint    = 'Remove them through the Storage API, then call delete_own_account again.';
  end if;

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


-- --------------------------------------------------------------------
-- Function privileges
--
-- Postgres grants EXECUTE on every new function to PUBLIC, so each one is
-- revoked first and granted only where a client needs it. The exceptions
-- are handle_new_user, drop_follows_on_block and sync_post_preview, which
-- were never revoked on the live project either; they are trigger
-- functions, which cannot be called as RPCs, and a trigger fires without
-- any EXECUTE check.
-- --------------------------------------------------------------------

revoke all on function public.pin_created_at()               from public, anon, authenticated;
revoke all on function public.reject_objectionable_post()    from public, anon, authenticated;
revoke all on function public.reject_objectionable_profile() from public, anon, authenticated;
revoke all on function public.prepare_report()               from public, anon, authenticated;
revoke all on function public.alert_new_report()             from public, anon, authenticated;
revoke all on function private.report_evidence(uuid, uuid)   from public, anon, authenticated;
revoke all on function private.charge_discovery(text, integer) from public, anon, authenticated;

revoke all on function private.my_block_set() from public, anon;
grant execute on function private.my_block_set() to authenticated;

revoke all on function public.blocked_with(uuid) from public, anon;
grant execute on function public.blocked_with(uuid) to authenticated;

-- anon too: signup asks before creating the account (011).
revoke all on function public.is_objectionable(text, boolean) from public;
grant execute on function public.is_objectionable(text, boolean) to anon, authenticated;

revoke all on function public.delete_own_account()       from public, anon;
revoke all on function public.set_phone_hash(text)       from public, anon;
revoke all on function public.set_instagram_hash(text)   from public, anon;
revoke all on function public.match_contacts(text[])     from public, anon;
revoke all on function public.match_instagram(text[])    from public, anon;
revoke all on function public.follow_many(uuid[])        from public, anon;
revoke all on function public.accept_invite(uuid)        from public, anon;
grant execute on function public.delete_own_account()     to authenticated;
grant execute on function public.set_phone_hash(text)     to authenticated;
grant execute on function public.set_instagram_hash(text) to authenticated;
grant execute on function public.match_contacts(text[])   to authenticated;
grant execute on function public.match_instagram(text[])  to authenticated;
grant execute on function public.follow_many(uuid[])      to authenticated;
grant execute on function public.accept_invite(uuid)      to authenticated;


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


-- --------------------------------------------------------------------
-- Table privileges
--
-- Supabase grants every new public table to anon and authenticated; the
-- tables below take that back. profile_secrets, discovery_usage,
-- blocked_terms and schema_migrations are unreachable from the API
-- entirely. invites may be read and deleted by its owner and inserted
-- naming only inviter_id, so the token and expiry stay server-made.
-- --------------------------------------------------------------------

grant select on public.profiles to anon, authenticated;

revoke all on public.profile_secrets from anon, authenticated;
revoke all on public.discovery_usage from anon, authenticated;
revoke all on public.blocked_terms   from anon, authenticated;

revoke all on public.invites from anon, authenticated;
grant select, delete on public.invites to authenticated;
grant insert (inviter_id) on public.invites to authenticated;


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

-- Profiles: readable by any signed-in user not blocked either way (you
-- must be able to find people to follow), writable only by their owner.
drop policy if exists profiles_read       on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_read on public.profiles
  for select to authenticated
  using (not (id = any ((select private.my_block_set()))));

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
  using (not (author_id = any ((select private.my_block_set()))));

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
  using (not (user_id = any ((select private.my_block_set()))));

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

-- profile_secrets, discovery_usage and blocked_terms: RLS on and no
-- policy at all, on top of the revoked grants. Default-deny.


-- --------------------------------------------------------------------
-- Storage: photos and avatars
--
-- One private bucket, read through signed URLs. Objects are namespaced
-- pours/<uid>/<file>, and insert and delete are pinned to the owning uid.
-- Any signed-in account may read any folder except that of someone it is
-- blocked with, either way (011): list, download and createSignedUrl all
-- pass through pours_read. Avatars live here too (010), so account
-- deletion's Storage API sweep of pours/<uid>/ covers both.
--
-- 8 MB and images only (003): without them any account was free
-- unlimited file hosting inside its own folder.
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
    and not (coalesce((storage.foldername(name))[1], '') = any ((select private.my_block_set()::text[])))
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
-- Record what this file stands in for. Last statement on purpose: a run
-- that fails partway must not claim to have succeeded.
-- --------------------------------------------------------------------

insert into public.schema_migrations (version, note) values
  ('schema',                  'schema.sql, current as of 014'),
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
  ('014_bounds_and_indexes',  'contained in schema.sql')
on conflict (version) do nothing;
