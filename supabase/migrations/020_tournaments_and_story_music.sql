-- ====================================================================
-- Sipply — migration 020: tournaments, and music on stories
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- READ, NOT RUN. The machine this was written on has no psql, postgres
-- or deno (checked 6 Oct 2026), so nothing here has been executed. It was
-- proven by reading every statement against supabase/schema.sql's real
-- names and signatures (private.my_block_set(), public.blocked_with(uuid),
-- public.is_objectionable(text, boolean), public.pin_created_at(),
-- public.recent_pours(), the post_photos, posts, follows and blocks
-- columns), and the scoring rules of section 5 by a Node model of
-- private.tournament_standings run on a fixture (a repost, a fourth new
-- drink in a day, a goal reached, a tie). The first real run is Jan's:
-- run the VERIFY block below right after it.
--
-- WHAT IT ADDS
--
--   1. A song on a story. Seven music_* columns on public.post_photos (a
--      drink is one post, so a song belongs to the photo it was posted
--      with, and a re-post with no song does not inherit the last one's),
--      a shape check that admits only Apple's own preview, link and
--      artwork hosts, the content filter on the title and artist, and
--      recent_pours() recreated to return the song.
--   2. private.music_search_usage and public.charge_music_search(): the
--      apple-music Edge Function charges each song search to the account,
--      120 an hour.
--   3. public.tournaments and public.tournament_members. Friends compete to
--      try the most DIFFERENT drinks: each different catalogue drink a
--      member posts during the window counts once, at most three new ones
--      a day in the host's time zone; how much anyone drinks is never
--      counted (App Review 1.4.3). Select-only for clients; every write is
--      an RPC. Visible to the host and the people invited or in it, never
--      to anyone blocked either way; a block between a host and a member
--      takes the member out.
--   4. The scoring (tournament_standings), computed from posts and photos
--      on the server; results frozen the first time anyone reads a
--      finished tournament (finalize_tournament).
--   5. RPCs: my_tournaments, tournament_board, create_tournament,
--      invite_to_tournament, respond_to_tournament, leave_tournament,
--      end_tournament, delete_tournament. Errors are P0001 with the
--      messages listed at section 7, which the app maps to its copy.
--
-- ORDER
--
-- After 019. Depends on 006 (blocked_with), 007 (post_photos), 009
-- (schema_migrations), 011 (my_block_set, is_objectionable,
-- pin_created_at) and 017 (recent_pours); section 0 stops the file if
-- any is missing. Installed builds notice nothing: build 14 reads
-- recent_pours by column name and ignores the new ones, never sends a
-- music column, and never calls the tournament functions. Builds from 15
-- on look for my_tournaments and hide tournaments while it is missing,
-- so this can be applied before or after any build.
--
-- Account deletion needs nothing new: tournaments a person hosts, their
-- memberships and their search counts all cascade from profiles.
--
-- ALSO DO BY HAND (dashboard, not SQL), before EXPO_PUBLIC_STORY_MUSIC
-- leaves 'off'
--
--   * Deploy supabase/functions/apple-music/index.ts: Edge Functions ->
--     Deploy a new function -> Via editor, name it apple-music, then turn
--     OFF "Verify JWT with legacy secret" in its Settings: this project's
--     ECC-signed sessions fail that check, and the function checks the
--     session itself. Under Edge Functions -> Secrets add MUSICKIT_KEY_P8
--     (the whole .p8 text, BEGIN/END lines included), MUSICKIT_KEY_ID and
--     APPLE_TEAM_ID. Supabase supplies SUPABASE_URL and the project's
--     publishable key itself. The .p8 never goes in the repo.
--
-- VERIFY AFTERWARDS (all read-only, except the rolled-back smoke test)
--
--   -- Expect one row: 020_tournaments_and_story_music.
--   select version from public.schema_migrations
--   where version = '020_tournaments_and_story_music';
--
--   -- Expect three names, none null:
--   -- tournaments | tournament_members | private.music_search_usage
--   select to_regclass('public.tournaments'), to_regclass('public.tournament_members'),
--          to_regclass('private.music_search_usage');
--
--   -- Expect: tournament_members | tournament_members_read
--   --         tournaments        | tournaments_read
--   select tablename, policyname from pg_policies
--   where tablename in ('tournaments', 'tournament_members') order by 1, 2;
--
--   -- Expect 15 rows. prosecdef true on every row except recent_pours
--   -- (false), and anon false on every row. authenticated true on every
--   -- row except tournament_standings, tournament_finish_at,
--   -- finalize_tournament and add_invitees (false); true on
--   -- my_tournament_ids, which the read policies call as the caller.
--   select p.oid::regprocedure as fn, p.prosecdef,
--          has_function_privilege('anon', p.oid, 'execute')          as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as authenticated
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where (n.nspname = 'public' and p.proname in (
--            'recent_pours', 'charge_music_search', 'my_tournaments', 'tournament_board',
--            'create_tournament', 'invite_to_tournament', 'respond_to_tournament',
--            'leave_tournament', 'end_tournament', 'delete_tournament'))
--      or (n.nspname = 'private' and p.proname in (
--            'my_tournament_ids', 'tournament_standings', 'tournament_finish_at',
--            'finalize_tournament', 'add_invitees'))
--   order by p.oid::regprocedure::text;
--
--   -- Expect four: blocks_drop_tournament_membership,
--   -- post_photos_reject_objectionable, tournaments_pin_created_at,
--   -- tournaments_reject_objectionable.
--   select tgname from pg_trigger
--   where tgname in ('post_photos_reject_objectionable', 'tournaments_reject_objectionable',
--                    'tournaments_pin_created_at', 'blocks_drop_tournament_membership')
--   order by 1;
--
--   -- Expect one row: post_photos_music_shape.
--   select conname from pg_constraint
--   where conrelid = 'public.post_photos'::regclass and conname = 'post_photos_music_shape';
--
--   -- Expect true: recent_pours returns the song.
--   select pg_get_function_result('public.recent_pours()'::regprocedure) like '%music_url text%';
--
--   -- Expect 3.
--   select private.tournament_daily_cap();
--
--   -- Smoke test as a real account, rolled back. Paste your user id.
--   -- Expect: your tournaments (none yet: no rows), then true.
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     json_build_object('sub', '<your user id>', 'role', 'authenticated')::text, true);
--   select * from public.my_tournaments();
--   select public.charge_music_search();
--   rollback;
-- ====================================================================


-- --------------------------------------------------------------------
-- 0. Stop here unless 006, 007, 009, 011 and 017 are applied
-- --------------------------------------------------------------------

do $$
begin
  if to_regprocedure('private.my_block_set()') is null
     or to_regprocedure('public.blocked_with(uuid)') is null
     or to_regprocedure('public.is_objectionable(text, boolean)') is null
     or to_regprocedure('public.pin_created_at()') is null
     or to_regprocedure('public.recent_pours()') is null
     or to_regclass('public.post_photos') is null
     or to_regclass('public.schema_migrations') is null then
    raise exception '020 needs 006, 007, 009, 011 and 017 applied first';
  end if;
end;
$$;


-- --------------------------------------------------------------------
-- 1. A song on a story
--
-- On the photo row, not the post: posts_one_per_drink (007) makes a
-- re-post of a drink a new photo on the old post, and a re-post with no
-- song must not inherit last month's.
--
-- All seven columns are null, or every one but the artwork is set. The
-- full-set test is num_nonnulls, never the patterns alone: a CHECK passes
-- when it evaluates to NULL, so "title set, song id null" would have
-- slipped through a check that only matched the set columns. The hosts are
-- Apple's own, so a stored song can only ever send a viewer's phone to
-- Apple (the apple-music function drops anything else before the app sees
-- it). Lengths bound what a hostile client can store.
-- --------------------------------------------------------------------

alter table public.post_photos
  add column if not exists music_song_id     text,
  add column if not exists music_title       text,
  add column if not exists music_artist      text,
  add column if not exists music_artwork_url text,
  add column if not exists music_preview_url text,
  add column if not exists music_url         text,
  add column if not exists music_storefront  text;

alter table public.post_photos drop constraint if exists post_photos_music_shape;
alter table public.post_photos add constraint post_photos_music_shape check (
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
);

-- The 011 content filter on the song's title and artist, as on captions.
-- The app retries a refused photo without its song (detail 'music'), so a
-- filtered song never costs anyone their photo.
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

-- Insert is the only write post_photos takes (no update policy); the update
-- arm is there so a future update policy cannot route around the filter.
drop trigger if exists post_photos_reject_objectionable on public.post_photos;
create trigger post_photos_reject_objectionable
  before insert or update of music_title, music_artist on public.post_photos
  for each row execute function public.reject_objectionable_music();

-- recent_pours gains the song. Its return type changes, so drop and create
-- (create or replace cannot change a RETURNS TABLE), and grant again (the
-- drop takes the grants with it). Build 14 asks for its five columns by
-- name and ignores the rest. Still SECURITY INVOKER: the tables' read
-- policies, blocks included, decide what comes back.
drop function if exists public.recent_pours();
create function public.recent_pours()
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

revoke all on function public.recent_pours() from public, anon;
grant execute on function public.recent_pours() to authenticated;


-- --------------------------------------------------------------------
-- 2. The song-search budget
--
-- The apple-music Edge Function calls charge_music_search() as the user
-- before every search: 120 per account per hour, so one account cannot
-- spend Sipply's MusicKit allowance. Counts and hours only, never the
-- search terms. In `private`, and revoked outright: only the definer
-- function below reaches it.
-- --------------------------------------------------------------------

create table if not exists private.music_search_usage (
  user_id uuid not null references public.profiles on delete cascade,
  hour    timestamptz not null,
  count   integer not null default 0,
  primary key (user_id, hour)
);
alter table private.music_search_usage enable row level security;   -- no policies: unreachable
revoke all on private.music_search_usage from public, anon, authenticated;

-- One upsert, so parallel searches from one account each add one and none
-- is lost; a day of old rows is swept on the way in.
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


-- --------------------------------------------------------------------
-- 3. Tournaments
--
-- ends_at is exclusive. target null = most different drinks by the end.
-- tz is the host's IANA zone (checked against pg_timezone_names on
-- create), which decides the daily cap's calendar day. finished_at,
-- winner_id and finalized_at are written once, by finalize_tournament.
-- --------------------------------------------------------------------

create table if not exists public.tournaments (
  id           uuid primary key default gen_random_uuid(),
  host_id      uuid not null references public.profiles on delete cascade,
  name         text not null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  target       smallint,
  -- The host's IANA zone, for the daily cap's calendar day.
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
create index if not exists tournaments_host_idx on public.tournaments (host_id, created_at desc);

-- The host has a row too, always 'accepted'. 'declined' covers declining,
-- leaving and being taken out by a block, and is final: add_invitees never
-- invites someone with any row in that tournament.
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
create index if not exists tournament_members_user_idx on public.tournament_members (user_id, status);

-- The 011 content filter on the name, on insert and on any rename.
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

drop trigger if exists tournaments_reject_objectionable on public.tournaments;
create trigger tournaments_reject_objectionable
  before insert or update on public.tournaments
  for each row execute function public.reject_objectionable_tournament();

-- The server owns created_at, which the 10-in-30-days hosting limit reads.
drop trigger if exists tournaments_pin_created_at on public.tournaments;
create trigger tournaments_pin_created_at
  before insert or update on public.tournaments
  for each row execute function public.pin_created_at();


-- --------------------------------------------------------------------
-- 4. Visibility
--
-- A helper, not a join in the policy: tournaments' policy reading
-- tournament_members (whose policy reads tournaments) would recurse.
-- SECURITY DEFINER, so it reads both tables past RLS, once per query in
-- the (select ...) form, like my_block_set (011). A member who declined
-- or left no longer sees the tournament at all.
--
-- Clients may only read. Every write is an RPC below, so the rules on
-- dates, goals, seats and blocks cannot be skipped by writing rows.
-- --------------------------------------------------------------------

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

alter table public.tournaments        enable row level security;
alter table public.tournament_members enable row level security;
revoke all on public.tournaments, public.tournament_members from anon, authenticated;
grant select on public.tournaments, public.tournament_members to authenticated;   -- writes: RPCs only

drop policy if exists tournaments_read on public.tournaments;
create policy tournaments_read on public.tournaments
  for select to authenticated
  using (
    id = any ((select private.my_tournament_ids())::uuid[])
    and not (host_id = any ((select private.my_block_set())::uuid[]))
  );

drop policy if exists tournament_members_read on public.tournament_members;
create policy tournament_members_read on public.tournament_members
  for select to authenticated
  using (
    tournament_id = any ((select private.my_tournament_ids())::uuid[])
    and not (user_id = any ((select private.my_block_set())::uuid[]))
  );


-- --------------------------------------------------------------------
-- 5. Scoring
--
-- What counts: for each accepted member and each CATALOGUE drink (a
-- drink someone added has a 'u_' id and cannot be posted anyway), the
-- drink's first event inside the window, where an event is that member's
-- post for the drink being created or a photo being added to it (one post
-- per drink, 007). Joining late counts from the start. A post deleted
-- before the results freeze stops counting.
--
-- The daily cap: at most 3 drinks count per member per calendar day in
-- the host's zone, in the order they were first posted. A drink first
-- posted after that day's 3 never counts in that tournament, even when
-- posted again on a later day, because its FIRST event is what is
-- counted: the cap never gives anyone a reason to have a drink twice.
-- One constant, so a change to the number is one line.
-- --------------------------------------------------------------------

create or replace function private.tournament_daily_cap()
returns integer language sql immutable set search_path = '' as $$ select 3 $$;

-- Every accepted member's standing, counting events before `upto`. Not
-- block-filtered: callers filter what they show. Row order = rank: who
-- reached the goal first, then the most different drinks, then who got
-- to that count first, then (only to make it total) the user id.
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

-- When counting stops, or null while it is still running. A goal reached
-- stops it at that post (+ 1 microsecond, so the winning post counts in a
-- window that excludes its end).
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

-- Freezes a finished tournament's results, once. The lock queues every
-- write to one tournament (the RPCs below take the same one), so two
-- readers arriving together freeze it once and an invite cannot land
-- while it freezes. Winner: rank 1, if they counted anything.
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

-- 'finished' only once frozen. A tournament past its end is frozen by the
-- read that comes before this is asked, so 'live' never outlasts it.
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


-- --------------------------------------------------------------------
-- 6. Reads
--
-- Volatile, because each freezes a tournament that has just finished
-- before reading it (supabase-js calls RPCs as POST, which PostgREST runs
-- read-write). Anyone the caller is blocked with is left out of every
-- list; a blocked winner is reported as hidden, never named.
-- --------------------------------------------------------------------

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

-- Every tournament the caller hosts or is invited to or in, newest start
-- first, at most 100. Unfrozen ones are frozen first if they have finished.
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


-- --------------------------------------------------------------------
-- 7. Writes
--
-- Errors are P0001 with these messages, which the app maps to its copy:
--   not_found, not_allowed, finished, invalid_dates, invalid_goal,
--   too_many_tournaments, no_invitees, objectionable_content (detail
--   'tournament_name').
-- Every RPC checks auth.uid() is set (else 28000, as every RPC here does)
-- and that the tournament is one the caller can see (else not_found),
-- then takes the tournament's lock (finalize_tournament's).
-- --------------------------------------------------------------------

-- Invites, as the host (auth.uid() is the host in every caller), people
-- the host follows, not blocked either way, not already in it in any
-- state: someone who declined or left stays out. Seats are the people
-- still in it or still asked, 50 with the host; a decline frees one.
-- Returns how many were invited.
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

-- Starts within 5 minutes ago to 30 days ahead; 1 to 31 days long; a goal
-- of 2 to 100 that the daily cap does not make unreachable (cap x days,
-- so First to 10 needs 4 days); at most 5 unfinished and 10 created per 30
-- days per host. The host joins as 'accepted'. No invitee who can be
-- invited rolls the whole call back.
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

-- Host only, before it finishes. Returns how many were invited, which may
-- be 0 (everyone named was already asked, or cannot be).
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

-- An invitee joins (accept) or declines. Only an open invitation (else
-- not_allowed), and not once it has finished. Declining is final.
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

-- An accepted member who is not the host leaves: 'declined', so their
-- drinks stop counting and they cannot be invited back. Not once it has
-- finished: the frozen standings are everyone's record.
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

-- The host ends a live tournament now: standings freeze and whoever is
-- ahead wins. Not one that has not started (else not_allowed: an upcoming
-- one is deleted, not ended). One whose goal was just reached, or whose
-- end has just passed, is frozen at that moment instead, not now.
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

-- The host deletes it, in any state: it disappears for everyone in it
-- (members cascade).
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


-- --------------------------------------------------------------------
-- 8. A block between a host and a member takes the member out (as 006
--    drops follows). Only while it is unfinished: frozen results stay.
--    The pair's rows elsewhere in a tournament are hidden from each other
--    by the read policies and tournament_board instead.
-- --------------------------------------------------------------------

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

drop trigger if exists blocks_drop_tournament_membership on public.blocks;
create trigger blocks_drop_tournament_membership
  after insert on public.blocks
  for each row execute function private.drop_tournament_membership_on_block();


-- --------------------------------------------------------------------
-- 9. Function privileges (schema.sql's rule: revoke from public first).
--    Trigger functions fire without any EXECUTE check, so revoking them
--    costs nothing; the private helpers are reached only through the
--    definer functions above, except my_tournament_ids, which the read
--    policies call as the querying role.
-- --------------------------------------------------------------------

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
grant execute on function private.my_tournament_ids() to authenticated;    -- read by RLS as the caller

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
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('020_tournaments_and_story_music') on conflict (version) do nothing;
