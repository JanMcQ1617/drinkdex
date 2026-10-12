-- ====================================================================
-- Sipply — migration 022: your tastes, and drinks to try
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- READ, NOT RUN. The machine this was written on has no psql, postgres,
-- deno, docker or supabase CLI (checked 12 Oct 2026), so nothing here has
-- been executed. It was proven by reading every statement against
-- supabase/schema.sql's real names: profiles (id, references auth.users
-- on delete cascade), delete_own_account() (deletes the auth.users row),
-- schema_migrations (009), and the house patterns of 017's saves (column
-- grants, own-row policies), 019's guard_reel_insert (a per-account lock
-- before a count) and 011's pin_created_at (the server's clocks). The
-- first real run is Jan's: run the VERIFY block below right after it.
--
-- WHAT IT ADDS
--
--   1. public.taste_profiles: one row per account holding the onboarding
--      answers (v4.1 §3: what you usually drink, which spirits and
--      flavours, whether you make drinks at home, what was in your bar)
--      as one jsonb object, and "How did you hear about Sipply" when that
--      question is switched on (it is off). Its clocks are the server's:
--      a before-update trigger keeps created_at and stamps updated_at.
--   2. public.want_to_try: the drinks saved to try from the first picks
--      or a drink's page, one row per account and catalogue id, newest
--      first by its index. At most 200 per account: a before-insert
--      trigger refuses the 201st with 'want_to_try_full'. This is NOT the
--      Dex, which stays on the phone and holds only drinks you have had.
--
-- WHY
--
-- The phone keeps both already (store/taste), so the first run works
-- before any account exists and with no connection. They are kept with
-- the account too so they follow a person to a new phone, and so that
-- "Make an account and your picks and bar come with you" is true. The
-- recommendations themselves are worked out on the phone (lib/recommend):
-- the server stores the answers and the list, and computes nothing from
-- them.
--
-- OWNER ONLY. Both tables are readable and writable by their owner and
-- by nobody else: no follower, profile or public read, no view and no
-- function. They are not on the profile. The app writes taste_profiles
-- by an UPDATE and, when no row came back, an INSERT, never PostgREST's
-- upsert: the grants let a client insert user_id but update only
-- answers and heard_from, and an upsert would set user_id as well.
-- want_to_try is written with INSERT ... ON CONFLICT DO NOTHING and
-- DELETE.
--
-- ORDER
--
-- After 021 by number. Depends on 009 (schema_migrations) and on
-- public.profiles; section 0 stops the file if either is missing. It
-- depends on nothing from 010 to 021. Builds up to 20 never touch these
-- tables. Build 21 (v4.1) reads and writes them, and while they are
-- missing (PGRST205 or 42P01) keeps everything on the phone with no
-- error anywhere; after this file it syncs on the next launch, the
-- answers and list kept on the phone going to the account. A PGRST205
-- straight after the run is PostgREST's schema cache catching up:
-- relaunch.
--
-- Account deletion needs nothing new: delete_own_account() deletes the
-- auth.users row, which cascades to profiles and from there to both
-- tables (VERIFY checks both foreign keys say on delete cascade). The
-- app also resets its own copy, keeping only a "No, not yet" lock.
--
-- ALSO DO BY HAND
--
-- In App Store Connect → the app → App Privacy, add Other Data → Other
-- Data Types ("Taste answers and drinks saved to try": linked to the
-- user, App Functionality and Product Personalization, not tracking), as
-- docs/appstore.md now says. docs/privacy.md, docs/data-deletion.md and
-- the app's privacy manifest ship with the release. Nothing in the
-- dashboard.
--
-- VERIFY AFTERWARDS (all read-only, except the rolled-back smoke test)
--
--   -- Expect one row: 022_taste_profiles.
--   select version from public.schema_migrations where version = '022_taste_profiles';
--
--   -- Expect two names, neither null.
--   select to_regclass('public.taste_profiles'), to_regclass('public.want_to_try');
--
--   -- Expect two rows, both true: Row Level Security is on.
--   select c.relname, c.relrowsecurity from pg_class c
--   where c.oid in ('public.taste_profiles'::regclass, 'public.want_to_try'::regclass)
--   order by 1;
--
--   -- Expect taste_profiles_delete_own, taste_profiles_insert_own,
--   -- taste_profiles_read_own, taste_profiles_update_own,
--   -- want_to_try_delete_own, want_to_try_insert_own,
--   -- want_to_try_read_own: seven rows, every one for authenticated.
--   select tablename, policyname, roles from pg_policies
--   where schemaname = 'public' and tablename in ('taste_profiles', 'want_to_try')
--   order by 1, 2;
--
--   -- Expect two rows, taste_profiles and want_to_try, each referencing
--   -- profiles with confdeltype c (on delete cascade).
--   select conrelid::regclass as tbl, confrelid::regclass as refs, confdeltype
--   from pg_constraint
--   where contype = 'f'
--     and conrelid in ('public.taste_profiles'::regclass, 'public.want_to_try'::regclass)
--   order by 1;
--
--   -- Expect, in order: false, false (anon has nothing); true, true
--   -- (select and delete); true, false (insert answers, not created_at);
--   -- true, false (update answers, not user_id); true, false (want_to_try
--   -- insert drink_id, not created_at); false (no update on want_to_try).
--   select has_table_privilege('anon', 'public.taste_profiles', 'select')                as anon_tp,
--          has_table_privilege('anon', 'public.want_to_try', 'select')                   as anon_wtt,
--          has_table_privilege('authenticated', 'public.taste_profiles', 'select')       as tp_select,
--          has_table_privilege('authenticated', 'public.taste_profiles', 'delete')       as tp_delete,
--          has_column_privilege('authenticated', 'public.taste_profiles', 'answers', 'insert')    as tp_ins_answers,
--          has_column_privilege('authenticated', 'public.taste_profiles', 'created_at', 'insert') as tp_ins_created,
--          has_column_privilege('authenticated', 'public.taste_profiles', 'answers', 'update')    as tp_upd_answers,
--          has_column_privilege('authenticated', 'public.taste_profiles', 'user_id', 'update')    as tp_upd_user,
--          has_column_privilege('authenticated', 'public.want_to_try', 'drink_id', 'insert')      as wtt_ins_drink,
--          has_column_privilege('authenticated', 'public.want_to_try', 'created_at', 'insert')    as wtt_ins_created,
--          has_table_privilege('authenticated', 'public.want_to_try', 'update')          as wtt_update;
--
--   -- Expect taste_profiles_touch and want_to_try_cap.
--   select tgname from pg_trigger
--   where tgname in ('taste_profiles_touch', 'want_to_try_cap') order by 1;
--
--   -- Expect one row: want_to_try_user_created_idx.
--   select indexname from pg_indexes
--   where schemaname = 'public' and indexname = 'want_to_try_user_created_idx';
--
--   -- Expect clock_timestamp(): each row of one insert keeps its own time.
--   select column_default from information_schema.columns
--   where table_schema = 'public' and table_name = 'want_to_try' and column_name = 'created_at';
--
--   -- auth.uid() is null in the SQL Editor, so the policies show nothing
--   -- there; the smoke test below runs as two real accounts. To pick
--   -- them: your id, and any other account's.
--   select id, username from public.profiles order by created_at desc limit 5;
--
--   -- Smoke test as that account, rolled back. Paste your id and another
--   -- account's. Expect "Success. No rows returned"; anything else raises
--   -- and says what it found. The checks sit in one block because the
--   -- editor shows only the last statement's result (015). They cover:
--   -- an answers row written and read back as the app writes it (update,
--   -- then insert) and its clocks; a non-object refused; user_id not
--   -- updatable; two drinks saved in one insert, as the app sends them,
--   -- and read back newest first; the other account's rows invisible and
--   -- its insert refused; a malformed id refused; the 201st drink refused,
--   -- while a drink already on a full list is skipped, not refused.
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     json_build_object('sub', '<your user id>', 'role', 'authenticated')::text, true);
--   do $$
--   declare
--     v_me      uuid := auth.uid();
--     v_other   uuid := '<another account''s id>';
--     v_rows    integer;
--     v_have    integer;
--     v_answers jsonb;
--     v_created timestamptz;
--     v_updated timestamptz;
--     v_first   text;
--   begin
--     if v_me is null or v_me = v_other then
--       raise exception 'paste your id into the claims and a different account''s id into v_other';
--     end if;
--
--     -- Answers, as the app writes them: update, then insert when no row came back.
--     update public.taste_profiles set answers = '{"v": 1, "drinks": "both"}' where user_id = v_me;
--     get diagnostics v_rows = row_count;
--     if v_rows = 0 then
--       insert into public.taste_profiles (user_id, answers) values (v_me, '{"v": 1, "drinks": "both"}');
--     end if;
--     update public.taste_profiles set answers = '{"v": 1, "drinks": "cocktails"}', heard_from = 'friend'
--     where user_id = v_me;
--     select t.answers, t.created_at, t.updated_at into v_answers, v_created, v_updated
--     from public.taste_profiles t where t.user_id = v_me;
--     if v_answers ->> 'drinks' is distinct from 'cocktails' then
--       raise exception 'the answers did not read back: %', v_answers;
--     end if;
--     if v_updated < v_created then
--       raise exception 'updated_at % is before created_at %', v_updated, v_created;
--     end if;
--     begin
--       update public.taste_profiles set answers = '[]' where user_id = v_me;
--       raise exception 'an array was accepted as answers';
--     exception when check_violation then null;
--     end;
--     begin
--       update public.taste_profiles set user_id = v_other where user_id = v_me;
--       raise exception 'user_id could be updated';
--     exception when insufficient_privilege then null;
--     end;
--
--     -- Two drinks to try in one insert, oldest first with ON CONFLICT DO
--     -- NOTHING, as the app sends them; read back newest first.
--     delete from public.want_to_try where user_id = v_me and drink_id in ('negroni', 'margarita');
--     insert into public.want_to_try (user_id, drink_id) values (v_me, 'negroni'), (v_me, 'margarita')
--       on conflict (user_id, drink_id) do nothing;
--     select count(*) into v_rows from public.want_to_try
--     where user_id = v_me and drink_id in ('negroni', 'margarita');
--     if v_rows <> 2 then
--       raise exception 'read back % of the 2 drinks saved', v_rows;
--     end if;
--     select w.drink_id into v_first from public.want_to_try w
--     where w.user_id = v_me and w.drink_id in ('negroni', 'margarita')
--     order by w.created_at desc limit 1;
--     if v_first is distinct from 'margarita' then
--       raise exception 'one insert''s drinks came back with % first, not the newest', v_first;
--     end if;
--
--     -- The other account: invisible, and refused.
--     select count(*) into v_rows from public.want_to_try where user_id = v_other;
--     if v_rows <> 0 then raise exception 'another account''s drinks to try are visible'; end if;
--     select count(*) into v_rows from public.taste_profiles where user_id = v_other;
--     if v_rows <> 0 then raise exception 'another account''s tastes are visible'; end if;
--     begin
--       insert into public.want_to_try (user_id, drink_id) values (v_other, 'mojito');
--       raise exception 'saved a drink to another account''s list';
--     exception when insufficient_privilege then null;
--     end;
--     begin
--       insert into public.taste_profiles (user_id, answers) values (v_other, '{}');
--       raise exception 'wrote another account''s tastes';
--     exception when insufficient_privilege then null;
--     end;
--     begin
--       insert into public.want_to_try (user_id, drink_id) values (v_me, 'Not An Id');
--       raise exception 'a malformed drink id was accepted';
--     exception when check_violation then null;
--     end;
--
--     -- The cap: fill to 200, then one more is refused, and one already there is skipped.
--     select count(*) into v_have from public.want_to_try where user_id = v_me;
--     insert into public.want_to_try (user_id, drink_id)
--     select v_me, 'smoke-' || g from generate_series(1, 200 - v_have) g;
--     begin
--       insert into public.want_to_try (user_id, drink_id) values (v_me, 'smoke-extra');
--       raise exception 'the 201st drink was accepted';
--     exception when raise_exception then
--       if sqlerrm <> 'want_to_try_full' then raise; end if;
--     end;
--     insert into public.want_to_try (user_id, drink_id) values (v_me, 'negroni')
--       on conflict (user_id, drink_id) do nothing;
--   end;
--   $$;
--   rollback;
-- ====================================================================


-- --------------------------------------------------------------------
-- 0. Stop here unless 009 is applied and profiles exists
-- --------------------------------------------------------------------

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception '022 needs 009 (public.schema_migrations). Apply the earlier migrations first.';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception '022 needs public.profiles. Apply the base schema first.';
  end if;
end;
$$;


-- --------------------------------------------------------------------
-- 1. Your tastes
--
-- One row per account. `answers` is the app's TasteAnswers object
-- (src/store/taste.ts), or {} once cleared; the server checks only its
-- shape and size (an object, 4 KB at most), because the app reads it
-- back through its own checks and nothing here interprets it.
-- heard_from is null unless the question is switched on, and then one of
-- the app's seven answers.
-- --------------------------------------------------------------------

create table if not exists public.taste_profiles (
  user_id    uuid primary key references public.profiles on delete cascade,
  answers    jsonb not null default '{}'::jsonb,
  heard_from text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint taste_profiles_answers_shape
    check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 4096),
  constraint taste_profiles_heard_from
    check (heard_from in ('friend', 'instagram', 'tiktok', 'app-store', 'facebook', 'google', 'other'))
);

-- The server's clocks: created_at stays what the insert made it, and
-- every update stamps updated_at. Insert cannot name either column (the
-- grants below), so their defaults are the server's too.
create or replace function public.touch_taste_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_taste_profile() from public, anon, authenticated;

drop trigger if exists taste_profiles_touch on public.taste_profiles;
create trigger taste_profiles_touch
  before update on public.taste_profiles
  for each row execute function public.touch_taste_profile();

alter table public.taste_profiles enable row level security;

-- Insert names the account and the two answers; update only the answers.
revoke all on public.taste_profiles from anon, authenticated;
grant select, delete on public.taste_profiles to authenticated;
grant insert (user_id, answers, heard_from) on public.taste_profiles to authenticated;
grant update (answers, heard_from) on public.taste_profiles to authenticated;

drop policy if exists taste_profiles_read_own   on public.taste_profiles;
drop policy if exists taste_profiles_insert_own on public.taste_profiles;
drop policy if exists taste_profiles_update_own on public.taste_profiles;
drop policy if exists taste_profiles_delete_own on public.taste_profiles;

create policy taste_profiles_read_own on public.taste_profiles
  for select to authenticated using (auth.uid() = user_id);

create policy taste_profiles_insert_own on public.taste_profiles
  for insert to authenticated with check (auth.uid() = user_id);

create policy taste_profiles_update_own on public.taste_profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy taste_profiles_delete_own on public.taste_profiles
  for delete to authenticated using (auth.uid() = user_id);


-- --------------------------------------------------------------------
-- 2. Drinks to try
--
-- A catalogue id per row, in the shape the catalogue's ids take (the
-- catalogue is in the app, not here, so the shape is what the server can
-- check). Newest first by the index, for the first sync's read.
--
-- created_at is clock_timestamp(), not now(). The app sends a phone's
-- list in one insert, oldest first, and now() is the transaction's time,
-- the same for every row of it: the list would come back to a second
-- phone in no order. clock_timestamp() moves on per row, in the order
-- the rows were sent.
-- --------------------------------------------------------------------

create table if not exists public.want_to_try (
  user_id    uuid not null references public.profiles on delete cascade,
  drink_id   text not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id, drink_id),
  constraint want_to_try_drink_id_shape check (drink_id ~ '^[a-z0-9][a-z0-9-]{0,79}$')
);

create index if not exists want_to_try_user_created_idx on public.want_to_try (user_id, created_at desc);

-- At most 200 per account, the phone's own cap (store/taste
-- WANT_TO_TRY_MAX). Runs as the caller, so the count is of the caller's
-- own rows (want_to_try_read_own), and an insert naming another account
-- counts nothing and is then refused by want_to_try_insert_own. The lock
-- serialises one account's concurrent saves, as 019's reel quota does:
-- parallel inserts must not all read 199 and pass. A drink already on
-- the list passes untouched, so the app's ON CONFLICT DO NOTHING skips it
-- rather than meeting the cap.
create or replace function public.guard_want_to_try_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('want_to_try:' || new.user_id::text, 0));

  if exists (select 1 from public.want_to_try w
             where w.user_id = new.user_id and w.drink_id = new.drink_id) then
    return new;
  end if;

  select count(*) into saved from public.want_to_try w where w.user_id = new.user_id;
  if saved >= 200 then
    raise exception 'want_to_try_full'
      using errcode = 'P0001',
            detail  = format('%s drinks saved to try; the limit is 200', saved),
            hint    = 'Remove one to save another.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_want_to_try_insert() from public, anon, authenticated;

drop trigger if exists want_to_try_cap on public.want_to_try;
create trigger want_to_try_cap
  before insert on public.want_to_try
  for each row execute function public.guard_want_to_try_insert();

alter table public.want_to_try enable row level security;

-- Insert names the two ids; created_at stays the server's. No update.
revoke all on public.want_to_try from anon, authenticated;
grant select, delete on public.want_to_try to authenticated;
grant insert (user_id, drink_id) on public.want_to_try to authenticated;

drop policy if exists want_to_try_read_own   on public.want_to_try;
drop policy if exists want_to_try_insert_own on public.want_to_try;
drop policy if exists want_to_try_delete_own on public.want_to_try;

create policy want_to_try_read_own on public.want_to_try
  for select to authenticated using (auth.uid() = user_id);

create policy want_to_try_insert_own on public.want_to_try
  for insert to authenticated with check (auth.uid() = user_id);

create policy want_to_try_delete_own on public.want_to_try
  for delete to authenticated using (auth.uid() = user_id);


-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('022_taste_profiles') on conflict (version) do nothing;
