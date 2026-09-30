-- ====================================================================
-- Sipply — migration 011: trust and safety
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- WHAT IT FIXES
--
--   1. Account deletion failed for every user. delete_own_account (005)
--      deleted rows from storage.objects in SQL, which current Supabase
--      Storage refuses outright, and which never removed the image bytes
--      anyway. The client now empties the folder through the Storage API
--      and this function only checks that it did.
--   2. accept_invite (002) let any account make any other account follow
--      it, because the "invite" was a user id and every user id is public.
--      Invites are now random tokens that expire.
--   3. match_contacts and match_instagram answered any number of hashes
--      from any account, which made them a phone-number-to-profile
--      lookup. Now 500 per call and 3,000 per rolling 24 hours.
--   4. Nothing filtered captions, bios, display names or usernames (App
--      Store guideline 1.2). A trigger now refuses text on a word list.
--   5. Blocks were enforced on posts and profiles only. Follows, likes and
--      the photo bucket ignored them, so a blocked account could re-follow,
--      like, and keep downloading the blocker's photos.
--   6. posts.created_at and profiles.created_at were client-writable, so
--      one PATCH pinned a post to the top of every feed for good.
--
-- The app from build 10 depends on all six at once (new RPC signatures,
-- new error strings), so they ship as one file, and the SQL editor runs a
-- multi-statement script as a single transaction: it lands whole or not at
-- all.
--
-- ALSO IN THIS FILE
--
--   7. A one-off tidy that no build depends on: captions older builds saved
--      as 'Logged a new entry.' are made blank. See section 7.
--
-- ORDER
--
-- Apply after 010, before 012-014 (those depend on nothing here, but the
-- numbers are the order). Apply BEFORE build 10 reaches anyone: that build
-- calls accept_invite(invite_token) and inserts into public.invites, and
-- both fail against a database without this file.
--
-- Installed builds 8 and 9 keep working, with these differences:
--
--   * Tapping an old drinkdex://u/<id> invite no longer creates follows;
--     the RPC those builds call is gone. Intended.
--   * Account deletion works for anyone with no photos and no avatar, and
--     fails with 'photos_remaining' for everyone else, because those builds
--     skip the Storage API sweep that now has to come first. (Before this
--     file it failed for everybody.)
--   * A caption, name or bio the filter refuses, and a contact check past
--     the daily limit, fail with a generic error: only build 10 knows the
--     new messages.
--
-- ALSO DO BY HAND (dashboard, not SQL)
--
--   * Authentication -> Rate Limits: keep sign-ups per hour low, and keep
--     email confirmation on. Section 3's quota is per account, so its
--     strength is exactly the cost of making another account.
--
-- VERIFY AFTERWARDS (all read-only)
--
--   -- 1. The storage guard that broke 005. Expect protect_objects_delete
--   --    (or similar) in the list; it is why SQL deletes cannot be used.
--   select tgname from pg_trigger where tgrelid = 'storage.objects'::regclass;
--
--   -- 1. The new body never deletes from storage. Expect false.
--   select prosrc ilike '%delete from storage%'
--   from pg_proc where oid = 'public.delete_own_account()'::regprocedure;
--
--   -- 1. The definer can see objects at all. Expect a non-zero count if
--   --    anyone has uploaded a photo; zero here would mean the photos_remaining
--   --    check below is blind and must not be trusted.
--   select count(*) from storage.objects where bucket_id = 'pours';
--
--   -- 2. Expect: invite_token uuid | uuid
--   select pg_get_function_arguments(p.oid), pg_get_function_result(p.oid)
--   from pg_proc p where p.proname = 'accept_invite'
--     and p.pronamespace = 'public'::regnamespace;
--
--   -- 3. Expect provolatile = 'v' and prolang = plpgsql for both.
--   select p.proname, p.provolatile, l.lanname
--   from pg_proc p join pg_language l on l.oid = p.prolang
--   where p.proname in ('match_contacts', 'match_instagram')
--     and p.pronamespace = 'public'::regnamespace;
--
--   -- 4. Expect false, true, false.
--   select public.is_objectionable('Porn Star Martini night'),
--          public.is_objectionable('hola PUTA'),
--          public.is_objectionable('computadora', true);
--
--   -- 4. Rows written before the filter existed that it would now refuse.
--   --    Nothing touches them automatically; review them in the dashboard.
--   select id, username, display_name, bio from public.profiles
--   where public.is_objectionable(username, true)
--      or public.is_objectionable(display_name)
--      or public.is_objectionable(bio);
--   select id, author_id, caption from public.posts
--   where public.is_objectionable(caption);
--
--   -- 5. Every read policy should mention my_block_set.
--   select schemaname, tablename, policyname, qual, with_check
--   from pg_policies
--   where (schemaname = 'public' and tablename in ('posts', 'profiles', 'follows', 'likes'))
--      or (schemaname = 'storage' and tablename = 'objects')
--   order by 1, 2, 3;
--
--   -- 5. Smoke test as a real account, rolled back so nothing persists.
--   --    Paste your own user id. Both counts must be non-zero if the tables
--   --    have rows: zero means the block set is hiding everything.
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     json_build_object('sub', '<your user id>', 'role', 'authenticated')::text, true);
--   select (select count(*) from public.posts)    as posts_visible,
--          (select count(*) from public.profiles) as profiles_visible;
--   rollback;
--
--   -- 6. Expect two rows, and zero future-dated posts.
--   select tgname, tgrelid::regclass from pg_trigger
--   where tgname in ('posts_pin_created_at', 'profiles_pin_created_at');
--   select count(*) from public.posts where created_at > now();
--
--   -- 7. Expect zero straight after the run. Builds 8 and 9 still write
--   --    the sentence, so a count that creeps up later is them, not a
--   --    failure here.
--   select count(*) from public.posts where caption = 'Logged a new entry.';
-- ====================================================================


-- --------------------------------------------------------------------
-- 0. A schema the API cannot see
--
-- PostgREST exposes `public` and nothing else here, so a function in
-- `private` can be used by policies and by other functions but cannot be
-- called as an RPC. Two of the helpers below would leak if they could be:
-- my_block_set would tell a caller who has blocked them, and the quota
-- helper would let a caller charge or probe the meter directly.
--
-- Postgres grants EXECUTE on every new function to PUBLIC, so each
-- function here revokes that explicitly. USAGE on the schema goes to
-- `authenticated` only because RLS policies run as the querying role and
-- have to be able to reach my_block_set.
-- --------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;


-- --------------------------------------------------------------------
-- 1. Account deletion without touching storage in SQL
--
-- Supersedes delete_own_account from 005, which ran
--   delete from storage.objects where bucket_id = 'pours' and ...
-- inside the function. That could never work on a current project, for
-- two separate reasons:
--
--   * Supabase Storage installs a statement-level BEFORE DELETE trigger on
--     storage.objects that raises "Direct deletion from storage tables is
--     not allowed. Use the Storage API instead." Statement-level means it
--     fires even when zero rows match, so the call failed for EVERY user,
--     including those who never uploaded a photo, and the rollback left the
--     auth user in place. SECURITY DEFINER does not get past a trigger.
--   * Even without that guard, deleting the row only removes metadata. The
--     file stays in the storage backend with nothing pointing at it, so
--     "deleting your account deletes your photos" was never true.
--
-- So the client does the storage half through the Storage API, which is
-- the only thing that deletes bytes: list pours/<uid>/ at offset 0, remove
-- what came back, repeat until the listing is empty. Always offset 0,
-- because paging forward while deleting skips files. Paths are flat,
-- <uid>/<file> for photos and <uid>/avatar-<ts>.<ext> for avatars (010),
-- so one level covers everything.
--
-- This function then refuses to delete the account while anything is left
-- under that prefix, rather than deleting the auth user and orphaning the
-- files forever. The error message is exactly 'photos_remaining' so the
-- client can tell "sweep again" from every other failure. A photo uploaded
-- from another device between the sweep and this call lands here too, and
-- the retry picks it up.
--
-- Nothing is ever deleted from storage.objects here, and no
-- storage.allow_delete_query escape hatch is set: that would make the SQL
-- delete pass the guard and still leave the bytes behind.
-- --------------------------------------------------------------------

create or replace function public.delete_own_account()
returns void
language plpgsql
-- security definer so the caller can remove their own auth.users row,
-- which the `authenticated` role cannot touch directly. search_path is
-- pinned to empty per Supabase's linter guidance.
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  remaining integer;
begin
  -- Never trust the caller for identity: the function takes no arguments,
  -- so it cannot be aimed at another account.
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

  -- Cascades to public.profiles, and from there to posts, post_photos,
  -- likes, follows in both directions, blocks, invites, discovery usage
  -- and profile_secrets. Once 012 is applied, reports survive with the
  -- reporter blanked instead of cascading away.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;


-- --------------------------------------------------------------------
-- 2. Invites are tokens, not user ids
--
-- 002's accept_invite(inviter uuid) wrote BOTH follow edges, including
-- inviter -> caller, the one follows_insert_own exists to forbid. The only
-- input was a user id, and user ids are not secrets: every profile row is
-- readable, and the people list hands out two hundred at a time. So one
-- script calling accept_invite(<every id>) made every account follow a
-- spammer, and put the spammer's posts in every home feed. It never checked
-- blocks either, so a blocked account could restore both edges the block
-- had removed.
--
-- An invite is now a row the inviter creates. The token is a random uuid
-- nobody can guess, so only someone the inviter actually sent a link to
-- can redeem it. It stays valid for 30 days and can be redeemed by more
-- than one person, so a link dropped in a group chat still works for the
-- whole group.
--
-- Every column has a server default, inviter_id included, so the client
-- creates one with insert({}) and reads back the token. The column-level
-- grant is what makes the defaults binding: a client may name itself as
-- inviter (and RLS checks that it did) but cannot write the token, the
-- creation time or the expiry, so a link cannot be made to live forever.
-- --------------------------------------------------------------------

create table if not exists public.invites (
  token      uuid primary key default gen_random_uuid(),
  inviter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

create index if not exists invites_inviter_idx on public.invites (inviter_id);

alter table public.invites enable row level security;

revoke all on public.invites from anon, authenticated;
grant select, delete on public.invites to authenticated;
grant insert (inviter_id) on public.invites to authenticated;

drop policy if exists invites_read_own   on public.invites;
drop policy if exists invites_insert_own on public.invites;
drop policy if exists invites_delete_own on public.invites;

-- Your own invites only. Nobody else ever needs to read a token: redeeming
-- goes through accept_invite, which looks it up as the table owner.
create policy invites_read_own on public.invites
  for select to authenticated using (auth.uid() = inviter_id);

create policy invites_insert_own on public.invites
  for insert to authenticated with check (auth.uid() = inviter_id);

-- Lets an inviter withdraw a link early. Nothing in the app does yet.
create policy invites_delete_own on public.invites
  for delete to authenticated using (auth.uid() = inviter_id);

-- DROP, not CREATE OR REPLACE: the parameter is renamed (inviter ->
-- invite_token) and the return type changes (void -> uuid), and Postgres
-- allows neither in place. The grants go with the old function and are
-- reissued below. Installed builds that still send { inviter } now get
-- PGRST202 and follow nobody, which is the point.
drop function if exists public.accept_invite(uuid);

-- Returns the inviter's id, so the app can open their profile, or null
-- when there is nothing to do: an unknown or expired token, your own
-- link, or a block in either direction. Null rather than an error because
-- a stale link in a chat is ordinary, not a failure worth a message.
--
-- SECURITY DEFINER because the reciprocal edge (inviter -> caller) is one
-- the caller may not insert under follows_insert_own. That bypass is now
-- earned: the caller had to hold a token only the inviter could have
-- given them.
create function public.accept_invite(invite_token uuid)
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

revoke all on function public.accept_invite(uuid) from public, anon;
grant execute on function public.accept_invite(uuid) to authenticated;


-- --------------------------------------------------------------------
-- 3. Discovery limits
--
-- 002 and 008 argued that matching could not enumerate anyone, because a
-- caller must already hold a hash to get a hit. That is false. The salts
-- ship in the app bundle, and normalizePhone reduces every number to ten
-- digits, so the whole of Puerto Rico's 787 and 939 space (about 2 x 10^7
-- numbers) can be hashed offline in seconds. With no cap on the input the
-- matcher was an oracle: send every hash, get back the username, display
-- name and avatar of every account that saved a phone number. The same
-- holds for match_instagram and any scraped list of handles.
--
-- Two limits, both enforced here because the client's chunk size is only
-- a convention a hostile client does not follow:
--
--   * 500 hashes per call. The app sends 300 at a time.
--   * 3,000 hashes per rolling 24 hours per account, across both matchers.
--     Past that the call raises 'rate_limited' and the app says to try
--     again tomorrow. A refused call is not charged.
--
-- What this does NOT do: make enumeration impossible. The meter is per
-- account and signup is open, so it raises the cost of mapping the whole
-- number space from one account to thousands of them. Sign-up rate limits
-- and email confirmation (see the header) are what make thousands
-- expensive. Say that plainly rather than repeat 002's mistake.
--
-- discovery_usage stores counts and times, never the hashes themselves, so
-- the meter cannot become a record of whose numbers someone checked.
-- --------------------------------------------------------------------

create table if not exists public.discovery_usage (
  user_id    uuid not null references public.profiles on delete cascade,
  matcher    text not null check (matcher in ('contacts', 'instagram')),
  hashes     integer not null check (hashes > 0),
  checked_at timestamptz not null default now()
);

create index if not exists discovery_usage_user_idx
  on public.discovery_usage (user_id, checked_at);

-- Same lock as profile_secrets in 008: RLS on with no policy, and no grant
-- for either client role. Only the definer functions below touch it.
alter table public.discovery_usage enable row level security;
revoke all on public.discovery_usage from anon, authenticated;

-- Charges `requested` hashes to the caller's rolling-day budget, or raises
-- 'rate_limited' without charging anything.
--
-- The advisory lock serialises one account's concurrent calls. Without it,
-- ten parallel requests would each read the same total, each pass, and
-- together spend ten times the budget.
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

  -- Old rows are useless once they leave the window; clearing them here
  -- keeps the table at one day of calls per active user.
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

revoke all on function private.charge_discovery(text, integer) from public, anon, authenticated;

-- Same return columns as 010, so CREATE OR REPLACE keeps the grants. The
-- language moves from sql to plpgsql for the guards, and the volatility
-- from STABLE to VOLATILE because the function now writes: PostgREST runs
-- a STABLE function in a read-only transaction, where the charge would
-- fail.
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

revoke all on function public.match_contacts(text[]) from public, anon;
grant execute on function public.match_contacts(text[]) to authenticated;

create or replace function public.match_instagram(hashes text[])
returns table (
  id uuid,
  username text,
  display_name text,
  accent text,
  bio text,
  avatar_path text,
  created_at timestamptz,
  -- Echoed back so the client can label the row with the handle it came
  -- from without the server ever learning it. Unchanged from 008.
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

revoke all on function public.match_instagram(text[]) from public, anon;
grant execute on function public.match_instagram(text[]) to authenticated;

-- The setters from 008, unchanged except that a non-null value must now
-- look like what the app sends: a lowercase hex SHA-256. It was any text of
-- any length, which let one account park megabytes in profile_secrets.
-- This is hygiene, not a defence: a well-formed hash of someone else's
-- number is still accepted, and nothing here can tell.
create or replace function public.set_phone_hash(hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Raises rather than returning quietly; see 008 for the afternoon that
  -- a silent return cost.
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

revoke all on function public.set_phone_hash(text)     from public, anon;
revoke all on function public.set_instagram_hash(text) from public, anon;
grant execute on function public.set_phone_hash(text)     to authenticated;
grant execute on function public.set_instagram_hash(text) to authenticated;


-- --------------------------------------------------------------------
-- 4. Objectionable text
--
-- Guideline 1.2 asks first for "a method for filtering objectionable
-- material from being posted". Report and block (006) cover the rest of
-- that list; nothing filtered text. Every free-text column a stranger can
-- see is now checked on write: posts.caption, and profiles.username,
-- display_name and bio.
--
-- In a trigger, not the client, so an old build or a hand-rolled request
-- cannot skip it. The client's own check (containsObjectionable) exists to
-- say so next to the field before the round trip; this is the one that
-- decides. The error message is exactly 'objectionable_content' and the
-- DETAIL names the column, so a form with several fields can put the
-- message under the right one.
--
-- HOW TEXT IS MATCHED
--
-- Lower-cased, accents folded (so 'Maricón' meets 'maricon'), then split
-- into words on anything that is not a letter. A term matches a whole word,
-- or that word plus 's'. Whole words, because substring matching on free
-- text is how filters end up refusing 'Scunthorpe', 'computadora' (puta)
-- and 'Allspice Dram' (spic). Plain 's' only, never 'es': 'spic' plus 'es'
-- is 'spices', which half the tasting notes in the Dex contain, so the one
-- Spanish plural that needs 'es' is listed as its own term instead.
--
-- The same check runs a second time with common digit and symbol
-- stand-ins read as letters (0 o, 1 i, 3 e, 4 a, 5 s, 7 t, @ a, $ s), so
-- 'n1gger' is not a way round it.
--
-- Usernames glue words together by design ('jan_bar', 'thepourhouse'), so
-- a whole-word check alone would miss most of them. For usernames only,
-- terms flagged match_inside also match anywhere inside the name with the
-- separators removed. Only terms that are never an innocent part of
-- another word carry that flag.
--
-- THE LIST
--
-- Lives in public.blocked_terms, readable by nobody through the API, and
-- is meant to grow: insert a row from the dashboard and it applies to the
-- next write. The seed is slurs and explicit sexual terms, in English and
-- Puerto Rican Spanish. Left out on purpose, because they are real drink
-- names or ordinary bar talk that a filter here would refuse: Porn Star
-- Martini, Red Headed Slut, Sex on the Beach, Slippery Nipple, Blow Job,
-- Suffering Bastard, Mount Gay, Charro Negro, and the chink of glasses.
-- Also left out because they are common names: Kike (Enrique), and the
-- surnames Coon and Dyke. General profanity is not on the list; the
-- filter is for abuse, not for swearing about a good drink.
--
-- Rows that existed before this ran are not touched. The header has the
-- query that lists them for review.
-- --------------------------------------------------------------------

create table if not exists public.blocked_terms (
  -- Lowercase ASCII words separated by single spaces, which is the shape
  -- the matcher reduces text to. A term in any other shape could never
  -- match, so the check refuses it rather than let it sit there inert.
  term         text primary key check (term ~ '^[a-z]+( [a-z]+)*$'),
  -- Also match inside a glued username. See above for when that is safe.
  match_inside boolean not null default false,
  created_at   timestamptz not null default now()
);

alter table public.blocked_terms enable row level security;
revoke all on public.blocked_terms from anon, authenticated;

insert into public.blocked_terms (term, match_inside) values
  -- racial and ethnic slurs
  ('nigger',    true),
  ('nigga',     true),
  ('wetback',   true),
  ('raghead',   true),
  ('towelhead', true),
  ('spic',      false),
  ('gook',      false),
  ('beaner',    false),
  ('sudaca',    false),
  -- slurs about sexuality, gender and disability
  ('faggot',    true),
  ('maricon',   true),
  ('maricones', true),
  ('fag',       false),
  ('tranny',    false),
  ('retard',    false),
  ('retarded',  false),
  -- sexual
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

-- True when `t` contains a blocked term. `glued` switches on the inside-a-
-- word match for usernames.
--
-- Granted to anon as well as authenticated because the one write it can
-- not reach with a readable error is signup: the profile row is inserted by
-- the on_auth_user_created trigger, and GoTrue turns any failure there into
-- a bare 500. The app asks this function first instead. It returns only a
-- boolean, and the list is mirrored in the app bundle anyway, so letting
-- anyone ask costs nothing.
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

revoke all on function public.is_objectionable(text, boolean) from public;
grant execute on function public.is_objectionable(text, boolean) to anon, authenticated;

-- Checks only what changed. An old caption that a newly added term now
-- matches must not stop its author from, say, re-logging the drink; the
-- report flow is how old content gets dealt with. On INSERT there is no old
-- row (OLD reads as null), so the tg_op test is what makes a new row count
-- as changed.
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

-- Trigger functions run without an EXECUTE check, and nothing should call
-- these directly.
revoke all on function public.reject_objectionable_post()    from public, anon, authenticated;
revoke all on function public.reject_objectionable_profile() from public, anon, authenticated;

-- Scoped to the text columns, so an update that only touches the accent or
-- the avatar never runs the matcher at all.
drop trigger if exists posts_reject_objectionable on public.posts;
create trigger posts_reject_objectionable
  before insert or update of caption on public.posts
  for each row execute function public.reject_objectionable_post();

drop trigger if exists profiles_reject_objectionable on public.profiles;
create trigger profiles_reject_objectionable
  before insert or update of username, display_name, bio on public.profiles
  for each row execute function public.reject_objectionable_profile();


-- --------------------------------------------------------------------
-- 5. Blocks everywhere
--
-- 006 made posts and profiles block-aware and stopped there. Everything
-- else still let a blocked account keep watching the person who blocked
-- them, which 006 says a block must never allow:
--
--   * follows: drop_follows_on_block removes both edges once, and then
--     nothing stops a direct insert putting the blocked account back among
--     the blocker's followers. Anyone could also read who the blocker
--     follows.
--   * likes: the blocker's likes stayed readable, and a post id held from
--     before the block could still be liked (the foreign-key check does
--     not go through posts_read).
--   * storage: pours_read let any signed-in account list and sign every
--     object in the bucket, so storage.from('pours').list('<blocker uid>')
--     returned every new photo and avatar the blocker uploaded.
--
-- Every follow path now refuses a blocked pair: a direct insert
-- (follows_insert_own), follow_many (SECURITY INVOKER, so the same policy
-- runs per row), and accept_invite (section 2, checked explicitly because
-- it runs as the owner).
--
-- WHY THE READ POLICIES USE A SET, NOT blocked_with()
--
-- blocked_with is SECURITY DEFINER, and Postgres never inlines a definer
-- function, so a policy that calls it runs it once for EVERY row it
-- considers, each call its own index probe. A people search that has to
-- scan the whole profiles table paid that per profile. my_block_set returns
-- the caller's blocked-either-way ids once; wrapped in (select ...) it
-- becomes an InitPlan the planner evaluates a single time per query.
--
-- The cast OUTSIDE the parentheses is load-bearing:
-- `x = any ((select f())::uuid[])`. Written `x = any ((select f()))`,
-- Postgres reads the doubled parentheses as a subquery, not as an array
-- expression, compares x to each ROW (a whole uuid[]) and fails with
-- "operator does not exist: uuid = uuid[]" — which is exactly how the
-- first run of this file failed on the live project, 30 Sep 2026.
--
-- The coalesce to an empty array is not optional. array_agg over no rows
-- is NULL, `x = any(NULL)` is NULL, and `not NULL` is NULL, which a policy
-- reads as false: without it, everyone with no blocks would see nothing.
--
-- It lives in `private` (section 0) because as an RPC it would list the
-- accounts that have blocked the caller, which 006 promises nobody can
-- enumerate. blocked_with stays, for the insert checks and the definer
-- functions in sections 2 and 3, where it runs once per call.
-- --------------------------------------------------------------------

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

revoke all on function private.my_block_set() from public, anon;
grant execute on function private.my_block_set() to authenticated;

-- Same meaning as 006's versions; only the cost changes. Your own rows are
-- never in the set (blocks has no_self_block), so nobody hides from
-- themselves.
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts
  for select to authenticated
  using (not (author_id = any ((select private.my_block_set())::uuid[])));

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (not (id = any ((select private.my_block_set())::uuid[])));

-- An edge disappears if either end is someone you are blocked with, so
-- follower counts and lists stop reporting on them in both directions.
drop policy if exists follows_read on public.follows;
create policy follows_read on public.follows
  for select to authenticated
  using (not (array[follower_id, following_id] && (select private.my_block_set())));

drop policy if exists follows_insert_own on public.follows;
create policy follows_insert_own on public.follows
  for insert to authenticated
  with check (auth.uid() = follower_id and not public.blocked_with(following_id));

drop policy if exists likes_read on public.likes;
create policy likes_read on public.likes
  for select to authenticated
  using (not (user_id = any ((select private.my_block_set())::uuid[])));

-- The subquery runs under posts_read, so a post hidden by a block cannot
-- be liked even by someone who kept its id.
drop policy if exists likes_insert_own on public.likes;
create policy likes_insert_own on public.likes
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.posts p where p.id = post_id)
  );

-- List, download and createSignedUrl all go through this one SELECT
-- policy, so all three now stop at a block. Compared as text rather than
-- cast to uuid: an object whose first path segment is not a uuid (a folder
-- placeholder made in the dashboard, say) would make a cast throw and
-- break the whole listing. An object at the bucket root has no folder,
-- coalesces to '' and stays visible, as before. Your own folder is never
-- in the set, so the account-deletion sweep still sees everything.
drop policy if exists pours_read on storage.objects;
create policy pours_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pours'
    and not (coalesce((storage.foldername(name))[1], '') = any ((select private.my_block_set())::text[]))
  );


-- --------------------------------------------------------------------
-- 6. The server owns created_at
--
-- created_at had a default and nothing else. `authenticated` holds UPDATE
-- on every column (008 explains why a column REVOKE cannot subtract from a
-- table grant), and the owner policies only check whose row it is. So
-- PATCH /posts?id=eq.X {"created_at":"2999-01-01"} put that post first in
-- every follower's feed permanently, since the feed orders by created_at,
-- and the same on profiles put an account first in "Everyone on Sipply".
--
-- Now an insert always gets now(), whatever it sent, and an update that
-- tries to change the value is refused rather than quietly ignored, so a
-- client that tries learns it cannot. An update that leaves created_at
-- alone, which is every write the app makes, passes untouched: createPost's
-- upsert never names the column, so its conflict branch keeps the original
-- date.
--
-- The trigger is dropped before the clean-up and recreated after it, so
-- the clean-up (an UPDATE of created_at) is not refused by it on a re-run.
-- --------------------------------------------------------------------

drop trigger if exists posts_pin_created_at    on public.posts;
drop trigger if exists profiles_pin_created_at on public.profiles;

-- Anything already dated in the future was written by hand, since the
-- default can only produce the present.
update public.posts    set created_at = now() where created_at > now();
update public.profiles set created_at = now() where created_at > now();

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

revoke all on function public.pin_created_at() from public, anon, authenticated;

create trigger posts_pin_created_at
  before insert or update on public.posts
  for each row execute function public.pin_created_at();

create trigger profiles_pin_created_at
  before insert or update on public.profiles
  for each row execute function public.pin_created_at();


-- --------------------------------------------------------------------
-- 7. The old filler caption
--
-- Every build before 10 saved 'Logged a new entry.' as the caption when
-- the user typed none. The photo, the drink name and its spec line already
-- say an entry was logged, so the sentence was filler under every such
-- post, and it reached moderators as the caption in a report's snapshot
-- (012). Build 10 saves an empty caption and reads that exact sentence as
-- no caption (isBlankCaption in src/lib/social.ts), so nothing anyone sees
-- in the app changes; the rows just stop claiming a caption nobody wrote.
--
-- Exact match only: a caption that contains the sentence among other words
-- is something its author typed. Builds 8 and 9 keep writing the sentence
-- until they are replaced, and a constraint would refuse their posts
-- outright, so this stays a tidy; a re-run of this file catches the rows
-- they have written since. Only caption changes, so the content filter has
-- nothing to refuse and pin_created_at, just recreated above, sees
-- created_at untouched.
-- --------------------------------------------------------------------

update public.posts set caption = '' where caption = 'Logged a new entry.';


-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('011_trust_and_safety') on conflict (version) do nothing;
