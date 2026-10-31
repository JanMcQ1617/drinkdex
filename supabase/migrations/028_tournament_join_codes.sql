-- ====================================================================
-- Sipply — migration 028: join a tournament with a code
--
-- For specs/v4.12/join-codes.md. supabase/schema.sql holds the same
-- objects.
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- READ, NOT RUN. Like 021 to 027, nothing here has been executed: the
-- machine it was written on has no psql, postgres, docker or supabase CLI.
-- It was proven by reading every statement against supabase/schema.sql's
-- real names: tournaments (id, host_id, name, starts_at, ends_at, target,
-- finalized_at, created_at, pinned by tournaments_pin_created_at),
-- tournament_members (tournament_id, user_id, status, responded_at),
-- profiles (id, username, display_name, accent, avatar_path),
-- private.my_block_set() and public.is_objectionable(text, boolean) (011),
-- private.tournament_finish_at, private.finalize_tournament,
-- private.tournament_state and private.add_invitees (020), 027's
-- tournament_members_push trigger and schema_migrations (009); and by
-- specs/v4.12/join-codes.test.mjs, which reads this file against the app.
-- The first real run is Jan's: run the VERIFY block right after it.
--
-- WHAT IT ADDS
--
--   1. public.tournaments.join_code: six characters from 31 that cannot
--      be misread for each other (2-9 and A-Z without 0, O, 1, I and L),
--      made by the server when a tournament is made (the column's
--      default, private.new_tournament_code()), unique among tournaments
--      that are not finished (a partial unique index), and given to every
--      unfinished tournament that already exists. Members read it through
--      tournaments_read, as they read the name: no new grant, no new
--      policy.
--   2. private.tournament_code_misses: wrong codes per account per hour,
--      the song-search budget's shape (020's music_search_usage). Twenty
--      in an hour and the next guess is refused without being looked up,
--      so a code cannot be found by trying them.
--   3. public.tournament_by_code(p_code): what the app shows before
--      anyone joins (the name, the dates, the goal, who hosts, how many
--      are in it) and whether joining would work. Nothing else: no
--      standings, no member list, no ids but the tournament's and the
--      host's.
--   4. public.join_tournament_with_code(p_code): joins the caller as
--      'accepted', after every check again under the tournament's lock.
--   5. public.create_tournament, the same signature and the same uuid
--      back, so build 37 notices nothing: inviting is now optional. A host
--      who names nobody gets a tournament and its code; a host who named
--      people none of whom can be invited is still told so (no_invitees),
--      because they meant someone.
--
-- WHAT A CODE CAN DO, AND NOT. Holding a code is being asked to join:
-- the host shares it, and so may anyone in it, as they could forward an
-- invitation. It opens one tournament that has not finished, to a
-- signed-in account (never anon, never an anonymous session, never a
-- deleted account whose token has not expired yet) that:
--   - is not in it already (the host and anyone accepted are told they
--     are, and the app opens it);
--   - never declined it, left it or was taken out of it by a block:
--     'declined' stays final, as 020 made it;
--   - is not blocked, either way, with the host (then the code answers
--     as a wrong one, charged as one, exactly as tournaments_read hides
--     that tournament) or with anyone in it or still asked (then
--     not_allowed, which names nobody);
--   - finds a seat: 50 with the host, counting everyone in it or still
--     asked, as add_invitees counts. An open invitation is already a
--     seat, so the invited may always take it.
-- Joining tells nobody. 027's tournament_members_push fires only for an
-- inserted 'invited' row (its WHEN); a code joins as 'accepted', and an
-- open invitation turns 'accepted' by an update, which no trigger
-- watches. No new notification, no Activity row.
--
-- GUESSING. 31^6 is 887,503,681 codes. A wrong code, or the code of a
-- tournament whose host the caller is blocked with, costs one of twenty
-- an hour (this clock hour and the one before it, so a burst at :59
-- cannot be followed by another at :00); the twenty-first is refused
-- before the lookup, so it learns nothing. A code that cannot be one (the
-- wrong length or a letter outside the 31) is answered as wrong without
-- the charge: it names no tournament. Nor is a finished tournament's code
-- charged: it answers finished, which opens nothing. Counts and hours
-- only, never the codes tried. A miss can only be counted for an account
-- with a profile, so both RPCs sign out a deleted account's token first.
--
-- ANSWERS, NOT ERRORS. Both RPCs answer {result: <word>} and never raise
-- for a refusal: a raise would roll back the miss it is meant to count.
-- The words: ok, member, full (with the preview), joined (with the id),
-- not_found, finished, not_allowed, limited. Signed out is 28000, as
-- every RPC here raises it; so is an account deleted since its token was
-- issued.
--
-- ORDER
--
-- After 027 by number. Depends on 009 (schema_migrations), 011
-- (my_block_set, is_objectionable) and 020 (the tournaments and their
-- helpers) only; section 0 stops the file if any is missing. Builds up to
-- 37 never read the column or call the two RPCs, and call
-- create_tournament with at least one invitee, as they always did. Build
-- 38 (v4.12) asks for tournament_by_code with no code when the host
-- sheet opens and, while it is missing (PGRST202 or 42883), keeps the
-- invite required, shows no code, and its Join with code screen says it
-- is not here yet; nothing errors. A PGRST202 straight after the run is
-- PostgREST's schema cache: Settings -> API -> Reload schema, or relaunch.
--
-- Account deletion needs nothing new: the misses reference profiles on
-- delete cascade, and a code goes with its tournament. The token a
-- deleted account still holds (valid until it expires) is answered 28000
-- by both RPCs, before the lookup (GUESSING, above).
--
-- VERIFY AFTERWARDS (all read-only, except the rolled-back smoke test)
--
--   -- Expect one row: 028_tournament_join_codes.
--   select version from public.schema_migrations where version = '028_tournament_join_codes';
--
--   -- Expect one row: join_code | text | private.new_tournament_code()
--   select column_name, data_type, column_default from information_schema.columns
--   where table_schema = 'public' and table_name = 'tournaments' and column_name = 'join_code';
--
--   -- Expect 0, 0, 0: every unfinished tournament has a code, none twice,
--   -- none of another shape.
--   select count(*) filter (where join_code is null),
--          count(*) - count(distinct join_code) - count(*) filter (where join_code is null),
--          count(*) filter (where join_code !~ '^[2-9A-HJKMNP-Z]{6}$')
--   from public.tournaments where finalized_at is null;
--
--   -- Expect tournaments_join_code_open and tournaments_join_code_shape.
--   select indexname from pg_indexes where indexname = 'tournaments_join_code_open'
--   union all
--   select conname from pg_constraint where conname = 'tournaments_join_code_shape';
--
--   -- Expect true, then false: RLS on the misses, and no client reads them.
--   select relrowsecurity from pg_class where oid = 'private.tournament_code_misses'::regclass;
--   select has_table_privilege('authenticated', 'private.tournament_code_misses', 'select');
--
--   -- Expect seven rows. Columns: definer, anon, authenticated. (The
--   -- public ones print without their schema; create_tournament's six
--   -- arguments are cut short here.)
--   --   create_tournament(text,timestamp with time zone,…) | t | f | t
--   --   join_tournament_with_code(text)                    | t | f | t
--   --   private.code_join_state(uuid,uuid)                 | t | f | f
--   --   private.find_tournament_by_code(text)              | t | f | f
--   --   private.new_tournament_code()                      | t | f | f
--   --   private.tournament_code_norm(text)                 | f | f | f
--   --   tournament_by_code(text)                           | t | f | t
--   select p.oid::regprocedure, p.prosecdef,
--          has_function_privilege('anon', p.oid, 'execute')          as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as authenticated
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where (n.nspname = 'public' and p.proname in ('create_tournament', 'tournament_by_code',
--                                                 'join_tournament_with_code'))
--      or (n.nspname = 'private' and p.proname in ('new_tournament_code', 'tournament_code_norm',
--                                                  'find_tournament_by_code', 'code_join_state'))
--   order by p.oid::regprocedure::text;
--
--   -- Smoke test, rolled back. Paste your id into the claims and another
--   -- real account's id into v_other: one that is not blocked with you
--   -- either way. You must host fewer than 5 unfinished tournaments (the
--   -- hosting limit). Run it all at once in the SQL editor. It hosts a
--   -- tournament with nobody invited and reads its code; looks it up as
--   -- you ('member'), with a wrong code ('not_found', one miss counted)
--   -- and with no code ('not_found', none counted); as v_other looks it
--   -- up ('ok'), joins ('joined'), joins again ('member'); checks v_other
--   -- is 'accepted' and that the join queued no push; then twenty wrong
--   -- codes as v_other and the right one answers 'limited'; then, as you,
--   -- ends it and checks its code answers 'finished', uncharged; and an
--   -- id with no profile (a deleted account's token) is signed out. Expect
--   -- "Success. No rows returned"; anything else raises and says what it
--   -- found. Nothing is kept.
--   begin;
--   select set_config('request.jwt.claims',
--     json_build_object('sub', '<your user id>', 'role', 'authenticated')::text, true);
--   do $$
--   declare
--     v_me     uuid := (current_setting('request.jwt.claims')::jsonb ->> 'sub')::uuid;
--     v_other  uuid := '<another account''s id>';
--     v_t      uuid;
--     v_code   text;
--     v_wrong  text;
--     v_queued integer;
--     v_r      jsonb;
--   begin
--     if v_me is null or v_me = v_other then
--       raise exception 'paste your id into the claims and a different account''s id into v_other';
--     end if;
--     set local role authenticated;
--     v_t := public.create_tournament('Code smoke test', now(), now() + interval '2 days', null, 'UTC', '{}');
--     select x.join_code into v_code from public.tournaments x where x.id = v_t;
--     if v_code is null or v_code !~ '^[2-9A-HJKMNP-Z]{6}$' then
--       raise exception 'the new tournament has no code of the right shape: %', v_code;
--     end if;
--     if public.tournament_by_code(lower(v_code)) ->> 'result' <> 'member' then
--       raise exception 'the host did not read as a member, lower case: %', public.tournament_by_code(v_code);
--     end if;
--     v_wrong := case when v_code = '222222' then '333333' else '222222' end;
--     if public.tournament_by_code(v_wrong) ->> 'result' <> 'not_found'
--        or public.tournament_by_code('') ->> 'result' <> 'not_found' then
--       raise exception 'a wrong code, or no code, was not answered as wrong';
--     end if;
--     perform set_config('request.jwt.claims',
--       json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
--     v_r := public.tournament_by_code(v_code);
--     if v_r ->> 'result' <> 'ok' or v_r ->> 'name' <> 'Code smoke test' or (v_r -> 'host' ->> 'id')::uuid <> v_me then
--       raise exception 'the preview for the other account is not ok with the name and host: %', v_r;
--     end if;
--     reset role;
--     select count(*) into v_queued from net.http_request_queue q where q.url like '%/functions/v1/push';
--     set local role authenticated;
--     v_r := public.join_tournament_with_code(' ' || v_code || ' ');
--     if v_r ->> 'result' <> 'joined' or (v_r ->> 'id')::uuid <> v_t then
--       raise exception 'joining did not answer joined with the id: %', v_r;
--     end if;
--     if public.join_tournament_with_code(v_code) ->> 'result' <> 'member' then
--       raise exception 'joining twice did not answer member';
--     end if;
--     reset role;
--     if (select m.status from public.tournament_members m where m.tournament_id = v_t and m.user_id = v_other) <> 'accepted' then
--       raise exception 'the other account is not accepted';
--     end if;
--     if (select count(*) from net.http_request_queue q where q.url like '%/functions/v1/push') <> v_queued then
--       raise exception 'joining by code queued a push';
--     end if;
--     if (select coalesce(sum(u.count), 0) from private.tournament_code_misses u where u.user_id = v_me) <> 1 then
--       raise exception 'your wrong code was not counted once (and no code not at all)';
--     end if;
--     set local role authenticated;
--     for i in 1..20 loop
--       perform public.tournament_by_code(v_wrong);
--     end loop;
--     if public.tournament_by_code(v_code) ->> 'result' <> 'limited' then
--       raise exception 'twenty wrong codes did not stop the twenty-first guess';
--     end if;
--     perform set_config('request.jwt.claims',
--       json_build_object('sub', v_me, 'role', 'authenticated')::text, true);
--     perform public.end_tournament(v_t);
--     if public.tournament_by_code(v_code) ->> 'result' <> 'finished' then
--       raise exception 'the code of a finished tournament did not answer finished';
--     end if;
--     perform set_config('request.jwt.claims',
--       json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
--     begin
--       perform public.tournament_by_code(v_wrong);
--       raise exception 'an account with no profile (a deleted one''s token) was not signed out';
--     exception when sqlstate '28000' then
--       null;
--     end;
--     reset role;
--     if (select coalesce(sum(u.count), 0) from private.tournament_code_misses u where u.user_id = v_me) <> 1 then
--       raise exception 'a finished tournament''s code was charged as a miss';
--     end if;
--   end;
--   $$;
--   rollback;
-- ====================================================================


-- --------------------------------------------------------------------
-- 0. Preconditions
-- --------------------------------------------------------------------

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception '028 needs 009 (public.schema_migrations). Apply the earlier migrations first.';
  end if;
  if to_regprocedure('private.my_block_set()') is null
     or to_regprocedure('public.is_objectionable(text, boolean)') is null then
    raise exception '028 needs 011 (my_block_set, is_objectionable). Apply the earlier migrations first.';
  end if;
  if to_regclass('public.tournament_members') is null
     or to_regprocedure('private.tournament_finish_at(uuid)') is null
     or to_regprocedure('private.finalize_tournament(uuid)') is null
     or to_regprocedure('private.tournament_state(public.tournaments)') is null
     or to_regprocedure('private.add_invitees(uuid, uuid, uuid[])') is null then
    raise exception '028 needs 020 (the tournaments and their helpers). Apply the earlier migrations first.';
  end if;
end;
$$;


-- --------------------------------------------------------------------
-- 1. The code
--
-- 31 characters: the figures 2 to 9 and the letters without I, L and O,
-- so nothing on the screen can be read as something else (0 and O, 1, I
-- and L) and the person typing it never has to ask. Six of them: 887
-- million codes, read out in one breath. Kept upper case; anything typed
-- is upper-cased and its spaces and dashes dropped before it is compared
-- (tournament_code_norm), so "abc 234" is ABC234. The app's alphabet
-- (src/lib/tournamentCode.ts) is the same string, and
-- specs/v4.12/join-codes.test.mjs fails the two apart.
-- --------------------------------------------------------------------

/*
 * A typed code as stored: upper case, without spaces or dashes; null when
 * what is left cannot be a code. Immutable and not a definer: it reads
 * nothing.
 */
create or replace function private.tournament_code_norm(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when x.c ~ '^[2-9A-HJKMNP-Z]{6}$' then x.c end
  from (select upper(regexp_replace(coalesce(p_code, ''), '[[:space:]-]+', '', 'g')) as c) x;
$$;

/*
 * A new code, free among unfinished tournaments. Each character is one
 * byte of a fresh gen_random_uuid() (pg_strong_random, the core's own: no
 * extension needed), the first byte, which in a v4 UUID is all random. A
 * byte at 248 or over (31 x 8) is dropped and drawn again, so every
 * character is equally likely; `random()` is never used, as it is
 * predictable. A code the content filter would refuse as a name (011,
 * glued, digits read as the letters they stand in for) is drawn again, so
 * no screen ever shows one.
 *
 * Free is checked here, which a parallel create cannot see until it
 * commits: two creates drawing the same one of 887 million codes in the
 * same moment meet the unique index instead, and create_tournament draws
 * again (section 5).
 */
create or replace function private.new_tournament_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  abc  constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  b    integer;
  code text;
begin
  loop
    code := '';
    while char_length(code) < 6 loop
      b := get_byte(uuid_send(gen_random_uuid()), 0);
      if b < 248 then
        code := code || substr(abc, b % 31 + 1, 1);
      end if;
    end loop;
    exit when not public.is_objectionable(code, true)
          and not exists (select 1 from public.tournaments x
                          where x.join_code = code and x.finalized_at is null);
  end loop;
  return code;
end;
$$;


-- --------------------------------------------------------------------
-- 2. The column, its index, the codes for tournaments already running
--
-- Unique only among tournaments that are not finished (finalized_at null,
-- the one test that never changes back): a finished tournament keeps its
-- code on its row, where nobody can use it, and the code may be drawn
-- again. Nullable, because tournaments finished before this file have
-- none and need none.
--
-- The column comes first with no default, so adding it writes nothing;
-- the running ones get their codes one statement at a time (each sees the
-- last, so the generator's check holds), and only then is the default
-- set, for every tournament made from here on, by any version of
-- create_tournament (020's too, if it is ever run again).
-- --------------------------------------------------------------------

alter table public.tournaments add column if not exists join_code text;

alter table public.tournaments drop constraint if exists tournaments_join_code_shape;
alter table public.tournaments add constraint tournaments_join_code_shape
  check (join_code is null or join_code ~ '^[2-9A-HJKMNP-Z]{6}$');

create unique index if not exists tournaments_join_code_open
  on public.tournaments (join_code) where finalized_at is null;

-- The backfill. tournaments_pin_created_at lets an update through that
-- leaves created_at alone, and the name filter reads only a new name.
do $$
declare
  t uuid;
begin
  for t in
    select x.id from public.tournaments x
    where x.finalized_at is null and x.join_code is null
    order by x.created_at, x.id
  loop
    update public.tournaments x set join_code = private.new_tournament_code() where x.id = t;
  end loop;
end;
$$;

alter table public.tournaments alter column join_code set default private.new_tournament_code();


-- --------------------------------------------------------------------
-- 3. Wrong codes, per account and hour
--
-- 020's music_search_usage, for guesses: one row per account and clock
-- hour, one upsert per miss, a day of old rows swept on the way in. In
-- `private` and revoked outright: only the definer functions below reach
-- it.
-- --------------------------------------------------------------------

create table if not exists private.tournament_code_misses (
  user_id uuid not null references public.profiles on delete cascade,
  hour    timestamptz not null,
  count   integer not null default 0,
  primary key (user_id, hour)
);
alter table private.tournament_code_misses enable row level security;   -- no policies: unreachable
revoke all on private.tournament_code_misses from public, anon, authenticated;


-- --------------------------------------------------------------------
-- 4. Finding a tournament by its code
-- --------------------------------------------------------------------

/*
 * The one way a code reaches a tournament, for both RPCs. Answers
 * {result: 'found', id} or {result} with one word: not_found, limited,
 * finished. The caller is auth.uid(), whose block set is the one read.
 *
 * In this order, each for a reason:
 *   - a code that cannot be one: not_found, uncharged and before the
 *     lock (it names no tournament; the app's probe sends '');
 *   - the caller's lock, so two guesses at once cannot both read 19;
 *   - twenty misses in this hour and the last: limited, before the
 *     lookup, so the twenty-first guess learns nothing;
 *   - the lookup, among unfinished tournaments (one at most, the index);
 *     none, but a finished one that kept the code, hosted by someone the
 *     caller is not blocked with: finished, uncharged;
 *   - none at all, or one hosted by someone the caller is blocked with
 *     either way: one miss, and not_found, the same answer for both;
 *   - one whose end, early end or goal has passed: frozen now, as every
 *     read freezes it (020), and finished.
 */
create or replace function private.find_tournament_by_code(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me     uuid := auth.uid();
  code   text := private.tournament_code_norm(p_code);
  missed integer;
  r      public.tournaments;
begin
  if me is null or code is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('tournament_code:' || me::text, 0));
  delete from private.tournament_code_misses u
  where u.user_id = me and u.hour < now() - interval '1 day';
  select coalesce(sum(u.count), 0) into missed
  from private.tournament_code_misses u
  where u.user_id = me and u.hour >= date_trunc('hour', now()) - interval '1 hour';
  if missed >= 20 then
    return jsonb_build_object('result', 'limited');
  end if;

  select * into r from public.tournaments x
  where x.join_code = code and x.finalized_at is null;
  -- None running, but a finished one kept it (section 2): a real code,
  -- sent by someone, answered as what it is and not charged, as the
  -- frozen-on-the-way answer below is not. It opens nothing. Most ended
  -- tournaments are frozen by the first visit after their end
  -- (my_tournaments), so without this a code shared on Friday read as
  -- wrong on Monday and every retry of it cost a guess. A host the
  -- caller is blocked with stays hidden here too. (`found` is still the
  -- select's: an IF's condition never sets it.)
  if not found and exists (select 1 from public.tournaments x
                           where x.join_code = code and x.finalized_at is not null
                             and not (x.host_id = any (private.my_block_set()))) then
    return jsonb_build_object('result', 'finished');
  end if;
  if not found or r.host_id = any (private.my_block_set()) then
    insert into private.tournament_code_misses as u (user_id, hour, count)
    values (me, date_trunc('hour', now()), 1)
    on conflict (user_id, hour) do update set count = u.count + 1;
    return jsonb_build_object('result', 'not_found');
  end if;

  if private.tournament_finish_at(r.id) is not null then
    perform private.finalize_tournament(r.id);
    return jsonb_build_object('result', 'finished');
  end if;
  return jsonb_build_object('result', 'found', 'id', r.id);
end;
$$;

/*
 * Whether `me` may join tournament `t` by its code, as of now: 'member'
 * (the host, or in it already), 'not_allowed' (declined, left or taken
 * out by a block before, which is final; or blocked either way with
 * anyone in it or still asked), 'full' (50 in it or asked, and no seat of
 * the caller's own among them) or 'ok'. The host's block was read by
 * find_tournament_by_code; the host's row is 'accepted', so a block made
 * since is caught here too.
 */
create or replace function private.code_join_state(t uuid, me uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mine    text;
  blocked uuid[] := private.my_block_set();
begin
  if exists (select 1 from public.tournaments x where x.id = t and x.host_id = me) then
    return 'member';
  end if;
  select m.status into mine from public.tournament_members m
  where m.tournament_id = t and m.user_id = me;
  if mine = 'accepted' then
    return 'member';
  end if;
  if mine = 'declined' then
    return 'not_allowed';
  end if;
  if exists (select 1 from public.tournament_members m
             where m.tournament_id = t and m.status in ('invited', 'accepted')
               and m.user_id = any (blocked)) then
    return 'not_allowed';
  end if;
  if mine is null and (select count(*) from public.tournament_members m
                       where m.tournament_id = t and m.status in ('invited', 'accepted')) >= 50 then
    return 'full';
  end if;
  return 'ok';
end;
$$;

/*
 * What the app shows before anyone joins: {result, id, name, starts_at,
 * ends_at, target, state ('upcoming' or 'live'), members (accepted, the
 * host included), host: {id, username, display_name, accent,
 * avatar_path}}, with result 'ok', 'member' or 'full'. Every other answer
 * is {result} alone: not_found, limited, finished, not_allowed. No
 * standings, no member list: the preview is the invitation, not the
 * tournament. Not under the tournament's lock: it changes nothing that
 * join_tournament_with_code does not read again under it.
 */
create or replace function public.tournament_by_code(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me    uuid := auth.uid();
  hit   jsonb;
  r     public.tournaments;
  h     public.profiles;
  st    text;
begin
  if me is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'not signed in: tournament_by_code got no auth.uid()' using errcode = '28000';
  end if;
  -- A deleted account's token still verifies until it expires, and its
  -- uid has no profile, so its misses could never be written (the foreign
  -- key): every wrong guess would fail as an error, a right one would
  -- answer, and the twenty would never count. Signed out, before any
  -- lookup. Every live account has a profile (handle_new_user).
  if not exists (select 1 from public.profiles p where p.id = me) then
    raise exception 'not signed in: tournament_by_code''s account is gone' using errcode = '28000';
  end if;
  hit := private.find_tournament_by_code(p_code);
  if hit ->> 'result' <> 'found' then
    return hit;
  end if;
  select * into r from public.tournaments x where x.id = (hit ->> 'id')::uuid;
  if not found then
    return jsonb_build_object('result', 'not_found');   -- deleted a moment ago; not a guess
  end if;
  st := private.code_join_state(r.id, me);
  if st = 'not_allowed' then
    return jsonb_build_object('result', 'not_allowed');
  end if;
  select * into h from public.profiles p where p.id = r.host_id;
  return jsonb_build_object(
    'result', st,
    'id', r.id, 'name', r.name, 'starts_at', r.starts_at, 'ends_at', r.ends_at, 'target', r.target,
    'state', private.tournament_state(r),
    'members', (select count(*)::integer from public.tournament_members m
                where m.tournament_id = r.id and m.status = 'accepted'),
    'host', jsonb_build_object('id', h.id, 'username', h.username, 'display_name', h.display_name,
                               'accent', h.accent, 'avatar_path', h.avatar_path));
end;
$$;

/*
 * Joins the caller by a code: {result: 'joined', id}, or {result:
 * 'member', id} for someone already in it (the app opens it), or {result}
 * with one word: not_found, limited, finished, full, not_allowed. Every
 * check is made again under the tournament's lock (finalize_tournament's,
 * which every tournament write takes), so a seat, a finish or a block
 * that lands between the preview and the tap is seen. An open invitation
 * is accepted, as respond_to_tournament would; anyone else joins as
 * 'accepted' at once. Joining late counts from the start, as for anyone.
 * No push, as the head of this file says.
 */
create or replace function public.join_tournament_with_code(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me    uuid := auth.uid();
  hit   jsonb;
  t     uuid;
  st    text;
begin
  if me is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'not signed in: join_tournament_with_code got no auth.uid()' using errcode = '28000';
  end if;
  -- A deleted account's live token: signed out, as tournament_by_code says why.
  if not exists (select 1 from public.profiles p where p.id = me) then
    raise exception 'not signed in: join_tournament_with_code''s account is gone' using errcode = '28000';
  end if;
  hit := private.find_tournament_by_code(p_code);
  if hit ->> 'result' <> 'found' then
    return hit;
  end if;
  t := (hit ->> 'id')::uuid;

  perform pg_advisory_xact_lock(hashtextextended('tournament:' || t::text, 0));
  -- Deleted, or frozen by another read, while this waited for the lock.
  if not exists (select 1 from public.tournaments x where x.id = t) then
    return jsonb_build_object('result', 'not_found');
  end if;
  if exists (select 1 from public.tournaments x where x.id = t and x.finalized_at is not null) then
    return jsonb_build_object('result', 'finished');
  end if;
  if private.tournament_finish_at(t) is not null then
    perform private.finalize_tournament(t);
    return jsonb_build_object('result', 'finished');
  end if;
  st := private.code_join_state(t, me);
  if st = 'member' then
    return jsonb_build_object('result', 'member', 'id', t);
  end if;
  if st <> 'ok' then
    return jsonb_build_object('result', st);
  end if;

  if exists (select 1 from public.tournament_members m
             where m.tournament_id = t and m.user_id = me and m.status = 'invited') then
    update public.tournament_members m
       set status = 'accepted', responded_at = now()
     where m.tournament_id = t and m.user_id = me;
  else
    insert into public.tournament_members (tournament_id, user_id, status, responded_at)
    values (t, me, 'accepted', now());
  end if;
  return jsonb_build_object('result', 'joined', 'id', t);
end;
$$;


-- --------------------------------------------------------------------
-- 5. Hosting with nobody invited
--
-- 020's create_tournament, with the same signature and the same uuid
-- back (build 37 calls it by name and reads the id), and two changes:
--
--   - Inviting is optional. A host who names nobody gets a tournament,
--     and the code (the column's default) is how people come in; the app
--     reads it from the row. A host who named people, none of whom can be
--     invited (unfollowed, blocked since the list was drawn), is still
--     refused with no_invitees, which rolls the call back: they meant
--     someone, and a tournament without them would say otherwise.
--   - The insert is tried again, at most three times, when it meets the
--     unique index: two creates that drew the same code in the same
--     moment (section 1). A fresh default is drawn each time.
--
-- Everything else is 020's, word for word: the dates, the goal, the
-- hosting limits under the host's lock, the name's shape and filter.
-- --------------------------------------------------------------------

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
  me    uuid := auth.uid();
  tid   uuid;
  tries integer := 0;
  asked integer := coalesce(cardinality(array_remove(p_invitees, null)), 0);
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
  -- the insert trigger. The code is the column's default.
  loop
    begin
      insert into public.tournaments (host_id, name, starts_at, ends_at, target, tz)
      values (me, btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), p_starts_at, p_ends_at,
              p_target,
              coalesce((select z.name from pg_catalog.pg_timezone_names z where z.name = p_tz), 'UTC'))
      returning id into tid;
      exit;
    exception
      when unique_violation then
        tries := tries + 1;
        if tries >= 3 then
          raise;
        end if;
    end;
  end loop;

  insert into public.tournament_members (tournament_id, user_id, status, responded_at)
  values (tid, me, 'accepted', now());

  if private.add_invitees(tid, me, p_invitees) = 0 and asked > 0 then
    raise exception 'no_invitees' using errcode = 'P0001';     -- rolls the whole call back
  end if;
  return tid;
end;
$$;


-- --------------------------------------------------------------------
-- 6. Function privileges (schema.sql's rule: revoke from public first)
--
-- The two RPCs are an account's: authenticated only, never anon. The
-- helpers are reached only from definer code (the generator also as the
-- column's default, which create_tournament evaluates as its owner).
-- --------------------------------------------------------------------

revoke all on function private.tournament_code_norm(text)         from public, anon, authenticated;
revoke all on function private.new_tournament_code()              from public, anon, authenticated;
revoke all on function private.find_tournament_by_code(text)      from public, anon, authenticated;
revoke all on function private.code_join_state(uuid, uuid)        from public, anon, authenticated;

revoke all on function public.tournament_by_code(text)            from public, anon;
revoke all on function public.join_tournament_with_code(text)     from public, anon;
revoke all on function public.create_tournament(text, timestamptz, timestamptz, integer, text, uuid[]) from public, anon;
grant execute on function public.tournament_by_code(text)         to authenticated;
grant execute on function public.join_tournament_with_code(text)  to authenticated;
grant execute on function public.create_tournament(text, timestamptz, timestamptz, integer, text, uuid[]) to authenticated;


-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('028_tournament_join_codes') on conflict (version) do nothing;
