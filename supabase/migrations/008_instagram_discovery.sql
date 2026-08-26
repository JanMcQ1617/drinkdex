-- ====================================================================
-- Sipply — migration 008: Instagram discovery + batch follow
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- WHY THIS SHAPE, AND NOT AN INSTAGRAM LOGIN BUTTON
--
-- No Meta API returns a follower or following LIST to a third-party app,
-- and none ever has. The Graph API exposes followers_COUNT and nothing
-- more, and the Basic Display API — the only one that ever worked for
-- personal accounts — was switched off on 4 December 2024. Every remaining
-- official Instagram login requires a Business or Creator account, which
-- almost no Sipply user has. So "Connect Instagram and import my friends"
-- cannot be built as an OAuth flow. It is not a permissions problem we
-- can apply our way out of; the endpoint does not exist.
--
-- What DOES exist is the user's own copy of that list. Instagram's
-- "Download your information" gives any account its followers and
-- following as JSON, usually within half an hour. The client parses that
-- file on the device, hashes the handles, and matches them here. Same
-- privacy shape as phone contacts, one step further: because we store a
-- hash rather than the handle, a dump of this table still does not link a
-- Sipply account to an Instagram identity.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Instagram discoverability
--
-- Opt-in and symmetric with phone_hash: to be findable you store a salted
-- SHA-256 of your OWN handle, never the handle itself. The client
-- normalizes before hashing (lowercase, '@' and profile-URL wrappers
-- stripped) so both sides of a comparison agree — see src/lib/instagram.ts.
--
-- Handles are a much smaller and more guessable space than phone numbers,
-- so treat this hash as an equality token, not as a secret. It stops a
-- table dump from reading as an identity map; it does not stop someone who
-- already suspects a specific handle from confirming it. That is the same
-- guarantee contact matching makes, and it is the one users actually want:
-- "find the people I already know" without handing over an address book.
-- --------------------------------------------------------------------

alter table public.profiles add column if not exists instagram_hash text;
create index if not exists profiles_instagram_hash_idx on public.profiles (instagram_hash);

-- Column-level lockdown, identical in spirit to phone_hash: RLS cannot
-- restrict a single column, so we drop the column privilege outright and
-- let only the SECURITY DEFINER matcher below read it. This is why the app
-- selects explicit column lists and never '*'.
revoke select (instagram_hash) on public.profiles from anon, authenticated;

-- --------------------------------------------------------------------
-- 2. match_instagram
--
-- The caller hashes the handles from their own Instagram export and sends
-- the set; we return the profiles that opted in with a matching hash.
-- Because a hit requires already holding the hash, this answers "is this
-- handle on Sipply?" for handles the caller already knows — it cannot
-- enumerate the column or reverse anyone else's handle.
--
-- Unlike match_contacts (002) this also drops people on either side of a
-- block. SECURITY DEFINER bypasses the profiles_read policy that would
-- normally hide them, so the filter has to be written out by hand; without
-- it, importing a list would quietly resurface someone you blocked.
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
  -- plaintext stays on the device, and only the device holds the
  -- hash -> handle mapping needed to read this.
  matched_hash text
)
language sql
security definer
set search_path = ''
stable
as $$
  select p.id, p.username, p.display_name, p.accent, p.bio, p.created_at, p.instagram_hash
  from public.profiles p
  where p.instagram_hash = any(hashes)
    and p.id <> auth.uid()
    and not public.blocked_with(p.id)
  limit 500;
$$;

revoke all on function public.match_instagram(text[]) from public, anon;
grant execute on function public.match_instagram(text[]) to authenticated;

-- --------------------------------------------------------------------
-- 3. follow_many
--
-- The point of the whole feature. Matching a 900-name export is useless if
-- acting on it is 40 separate taps and 40 separate round trips, which is
-- what "spend hours adding everyone" actually means.
--
-- SECURITY INVOKER on purpose: follows_insert_own (schema.sql) already
-- restricts inserts to rows where follower_id = auth.uid(), and that check
-- runs per row here exactly as it does for a single insert. This adds no
-- privilege — it only collapses N requests into one. Blocked pairs and
-- non-existent targets are filtered rather than left to fail the batch,
-- because one bad id in a list of 300 must not lose the other 299.
--
-- Returns the number of NEW edges, so the UI can say "Followed 12" rather
-- than counting the ones that were already there.
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
    -- Belt to the client's braces. Nothing legitimate sends more than a
    -- few hundred; this keeps a malformed or hostile call bounded.
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
-- 4. Account deletion
--
-- delete_own_account (005) removes the profile row, which takes
-- instagram_hash with it. Nothing to add here — this note exists so the
-- next person to add a profile column checks 005 rather than assuming.
-- --------------------------------------------------------------------
