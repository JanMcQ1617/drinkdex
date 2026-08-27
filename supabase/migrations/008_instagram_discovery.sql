-- ====================================================================
-- Sipply — migration 008: discovery secrets, Instagram matching,
--                         and batch follow
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- WHY THERE IS NO INSTAGRAM LOGIN BUTTON
--
-- No Meta API returns a follower or following LIST to a third-party app.
-- The Graph API exposes followers_count and nothing more, and the Basic
-- Display API — the only one that ever covered personal accounts — was
-- switched off on 4 December 2024. Every remaining Instagram login needs a
-- Business or Creator account, which almost no Sipply user has. So
-- "Connect Instagram and import my friends" cannot be built as OAuth. It
-- is not a permission we can apply for; the endpoint does not exist.
--
-- What does exist is the user's own copy. Instagram's "Download your
-- information" gives any account its followers and following as JSON. The
-- client parses that on the device, hashes the handles, and matches them
-- here — the same shape as phone-contact matching in 002.
-- ====================================================================


-- --------------------------------------------------------------------
-- 1. profile_secrets — the discovery hashes, out of reach entirely
--
-- 002 put phone_hash on profiles and wrote
--   revoke select (phone_hash) on public.profiles from anon, authenticated
-- believing that hid it. It never did. Supabase grants TABLE-level SELECT
-- on public tables to anon and authenticated, and in Postgres a
-- table-level grant implies every column: REVOKE SELECT (col) cannot
-- subtract from it. The statement succeeds, prints REVOKE, and changes
-- nothing.
--
-- The proof is our own code rather than theory: store/auth.ts ran
-- `select('*')` on profiles at every launch and the app works. Had the
-- revoke bitten, that call would have failed for every user on every
-- start. So phone_hash has been world-readable to any signed-in client
-- since 002, and an instagram_hash column on profiles would inherit it.
--
-- Fixing it by revoking table-level SELECT on profiles and granting the
-- safe columns back does work, but it breaks every already-installed
-- build the moment it runs, because those builds call `select *`. So the
-- hashes move out instead. profiles keeps only public data and stays
-- fully readable; the secrets live in a table with NO grants and NO
-- policies, which no client can read or write by any query. The only way
-- in or out is the SECURITY DEFINER functions below.
-- --------------------------------------------------------------------

create table if not exists public.profile_secrets (
  user_id        uuid primary key references public.profiles on delete cascade,
  -- Salted SHA-256 of the user's phone number, computed on the device.
  phone_hash     text,
  -- Salted SHA-256 of the normalized Instagram handle. Different salt from
  -- the phone one on purpose: a shared salt would let a known number
  -- confirm a handle and vice versa.
  instagram_hash text,
  updated_at     timestamptz not null default now()
);

create index if not exists profile_secrets_phone_idx     on public.profile_secrets (phone_hash);
create index if not exists profile_secrets_instagram_idx on public.profile_secrets (instagram_hash);

-- RLS on with no policy at all: default-deny for anyone who somehow holds
-- a grant. Belt and braces with the revoke below.
alter table public.profile_secrets enable row level security;

-- The actual lock. No SELECT, INSERT, UPDATE or DELETE for either client
-- role, so the table is unreachable from PostgREST entirely — it is not
-- even exposed as an endpoint.
revoke all on public.profile_secrets from anon, authenticated;

-- Carry across what 002 already collected, then drop the leaky column so
-- there is exactly one home for a phone hash.
--
-- Guarded and dynamic because the header promises this file is re-runnable:
-- the second run happens after the column is gone, and a static reference
-- to profiles.phone_hash would fail to resolve at plan time even inside an
-- IF branch that is not taken. EXECUTE defers resolution to the moment the
-- branch actually runs.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'phone_hash'
  ) then
    execute $mig$
      insert into public.profile_secrets (user_id, phone_hash)
      select p.id, p.phone_hash
      from public.profiles p
      where p.phone_hash is not null
      on conflict (user_id) do update set phone_hash = excluded.phone_hash
    $mig$;
  end if;
end $$;

alter table public.profiles drop column if exists phone_hash;

-- Never existed in production, but a re-run after an earlier draft of this
-- file might find it.
alter table public.profiles drop column if exists instagram_hash;

-- profiles now holds nothing private, so `select *` is harmless again and
-- older installed builds keep working. Stated explicitly rather than
-- assumed, in case an earlier draft of 008 revoked it.
grant select on public.profiles to anon, authenticated;


-- --------------------------------------------------------------------
-- 2. Opting in and out
--
-- The client cannot write profile_secrets directly, so these do it. They
-- take ONLY the hash and read auth.uid() themselves, exactly like
-- delete_own_account in 005 — there is no argument to aim at someone
-- else's row. Passing null clears that hash and stops discovery by it.
-- --------------------------------------------------------------------

create or replace function public.set_phone_hash(hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  /*
   * Raise, never return quietly. This was `return;`, and it cost an
   * afternoon: with no caller identity the function did nothing, PostgREST
   * still answered 200, supabase-js saw no error, and the app flipped its
   * card to "Stop being findable" over a database that had never been
   * touched. A write that reports success without writing is worse than
   * one that fails.
   */
  if auth.uid() is null then
    raise exception 'not signed in: set_phone_hash got no auth.uid()' using errcode = '28000';
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
  -- Raises rather than returning quietly, for the reason set out above.
  if auth.uid() is null then
    raise exception 'not signed in: set_instagram_hash got no auth.uid()' using errcode = '28000';
  end if;
  insert into public.profile_secrets (user_id, instagram_hash)
  values (auth.uid(), hash)
  on conflict (user_id) do update
    set instagram_hash = excluded.instagram_hash, updated_at = now();
end;
$$;

revoke all on function public.set_phone_hash(text)     from public, anon;
revoke all on function public.set_instagram_hash(text) from public, anon;
grant execute on function public.set_phone_hash(text)     to authenticated;
grant execute on function public.set_instagram_hash(text) to authenticated;


-- --------------------------------------------------------------------
-- 3. match_contacts — repointed at profile_secrets
--
-- Same contract as 002. Redefined rather than left alone because the
-- column it read no longer exists. Now also drops people on either side of
-- a block, which 002 did not: SECURITY DEFINER bypasses profiles_read, so
-- without the filter a contact sync would resurface someone you blocked.
-- --------------------------------------------------------------------

create or replace function public.match_contacts(hashes text[])
returns table (
  id uuid,
  username text,
  display_name text,
  accent text,
  bio text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select p.id, p.username, p.display_name, p.accent, p.bio, p.created_at
  from public.profiles p
  join public.profile_secrets s on s.user_id = p.id
  where s.phone_hash = any(hashes)
    and p.id <> auth.uid()
    and not public.blocked_with(p.id)
  limit 500;
$$;

revoke all on function public.match_contacts(text[]) from public, anon;
grant execute on function public.match_contacts(text[]) to authenticated;


-- --------------------------------------------------------------------
-- 4. match_instagram
--
-- The caller hashes the handles from their own Instagram export and sends
-- the set; we return the profiles that opted in with a matching hash.
-- Because a hit requires already holding the hash, this answers "is this
-- handle on Sipply?" for handles the caller already knows — it cannot
-- enumerate anything or reverse anyone else's handle.
-- --------------------------------------------------------------------

create or replace function public.match_instagram(hashes text[])
returns table (
  id uuid,
  username text,
  display_name text,
  accent text,
  bio text,
  created_at timestamptz,
  -- Echoed back so the client can label the row with the handle it came
  -- from ("matched @sarah.g") without the server ever learning it: the
  -- plaintext stays on the device, which alone holds the hash -> handle map.
  matched_hash text
)
language sql
security definer
set search_path = ''
stable
as $$
  select p.id, p.username, p.display_name, p.accent, p.bio, p.created_at, s.instagram_hash
  from public.profiles p
  join public.profile_secrets s on s.user_id = p.id
  where s.instagram_hash = any(hashes)
    and p.id <> auth.uid()
    and not public.blocked_with(p.id)
  limit 500;
$$;

revoke all on function public.match_instagram(text[]) from public, anon;
grant execute on function public.match_instagram(text[]) to authenticated;


-- --------------------------------------------------------------------
-- 5. follow_many
--
-- The point of the whole feature. Matching a 900-name export is useless if
-- acting on it is 40 taps and 40 round trips, which is what "spend hours
-- adding everyone" actually means.
--
-- SECURITY INVOKER on purpose: follows_insert_own (schema.sql) already
-- restricts inserts to rows where follower_id = auth.uid(), and that check
-- runs per row here exactly as for a single insert. This adds no
-- privilege; it only collapses N requests into one. Blocked pairs and
-- missing targets are filtered rather than left to fail, because one bad
-- id in a list of 300 must not lose the other 299.
--
-- Returns the number of NEW edges, so the UI can say "Followed 12" rather
-- than the size of a list that was mostly already followed.
-- --------------------------------------------------------------------

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
    -- Belt to the client's braces; keeps a malformed call bounded.
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

revoke all on function public.follow_many(uuid[]) from public, anon;
grant execute on function public.follow_many(uuid[]) to authenticated;


-- --------------------------------------------------------------------
-- 6. Account deletion
--
-- delete_own_account (005) removes the profile row; profile_secrets
-- cascades from it, so the hashes go with it. Nothing to add — this note
-- exists so the next person checks 005 rather than assuming.
-- --------------------------------------------------------------------

-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('008_instagram_discovery') on conflict (version) do nothing;
