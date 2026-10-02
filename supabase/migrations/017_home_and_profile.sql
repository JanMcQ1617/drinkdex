-- ====================================================================
-- Sipply — migration 017: saved posts, and today's pours
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- WHAT IT ADDS
--
--   1. public.saves: a private bookmark of a post. Readable by its owner
--      only; a post can be saved only by someone who can see it.
--   2. public.recent_pours(): every photo shared in the last 24 hours by
--      the caller or anyone the caller follows, newest first. It feeds the
--      row of pour tiles at the top of Home.
--   3. An index on post_photos.created_at, which (2) filters and sorts on.
--   4. The server owns created_at on post_photos, likes and follows, as
--      011 made it own posts' and profiles'.
--
-- WHY
--
-- The bookmark under each post is a real save, not decoration: a bookmark
-- that forgets itself would confirm something that never happened. Saves
-- get their own table rather than a column, because who saved what is
-- private and every other social table is readable for its counts.
--
-- Today's pours reads post_photos.created_at rather than posts.created_at,
-- because logging a drink again adds a photo to the OLD post (one post per
-- drink, 007), and that photo is still today's pour. The function runs as
-- the caller (SECURITY INVOKER), so posts_read, post_photos_read and
-- follows_read all apply and blocks are honoured with nothing extra here.
--
-- Activity (likes on your posts, new followers) needs no new table: likes
-- and follows already hold it. What Activity and Today's pours do need is
-- clocks a client cannot set, which is (4); section 3 says why.
--
-- ORDER
--
-- Any time after 011 (its pin_created_at, which the live project already
-- has); independent of every other migration in 016-019. Installed builds
-- notice nothing: none of them sends created_at for these tables. Builds
-- that know about saves and today's pours treat a missing table or
-- function as "feature off": the bookmark hides and the row shows only
-- your own tile, so a build may reach a phone before this file is applied.
--
-- Do not re-run 007 after this file. Its backfill names created_at, which
-- the trigger in section 3 now replaces with the moment of the re-run, so
-- any photo it added would show in Today's pours as poured today.
--
-- ALSO DO BY HAND
--
-- Nothing. docs/privacy.md says saved posts are visible only to you, and
-- lists them among what account deletion removes; that text ships with
-- the release.
--
-- VERIFY AFTERWARDS (all read-only)
--
--   -- Expect one row.
--   select version from public.schema_migrations where version = '017_home_and_profile';
--
--   -- Both non-null.
--   select to_regclass('public.saves') as saves_table,
--          to_regprocedure('public.recent_pours()') as recent_pours_fn;
--
--   -- Expect saves_delete_own, saves_insert_own, saves_read_own.
--   select policyname from pg_policies where tablename = 'saves' order by 1;
--
--   -- Expect false, false, true: anon cannot run it, and it runs as the
--   -- caller (prosecdef false).
--   select has_function_privilege('anon', 'public.recent_pours()', 'execute'),
--          (select prosecdef from pg_proc where oid = 'public.recent_pours()'::regprocedure),
--          has_function_privilege('authenticated', 'public.recent_pours()', 'execute');
--
--   -- Expect follows_pin_created_at, likes_pin_created_at,
--   -- post_photos_pin_created_at.
--   select tgname from pg_trigger
--   where tgname in ('post_photos_pin_created_at', 'likes_pin_created_at', 'follows_pin_created_at')
--   order by 1;
-- ====================================================================


-- --------------------------------------------------------------------
-- 1. Saves
--
-- Cascades from both sides: deleting the post or the account removes the
-- save, so account deletion needs no extra step.
-- --------------------------------------------------------------------

create table if not exists public.saves (
  user_id    uuid not null references public.profiles on delete cascade,
  post_id    uuid not null references public.posts    on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- "My saves, newest first", for the Saved screen.
create index if not exists saves_user_created_idx on public.saves (user_id, created_at desc);
-- Serves the cascade when a post is deleted.
create index if not exists saves_post_idx         on public.saves (post_id);

alter table public.saves enable row level security;

-- Insert may name only the two ids; created_at stays the server's.
revoke all on public.saves from anon, authenticated;
grant select, delete on public.saves to authenticated;
grant insert (user_id, post_id) on public.saves to authenticated;

drop policy if exists saves_read_own   on public.saves;
drop policy if exists saves_insert_own on public.saves;
drop policy if exists saves_delete_own on public.saves;

create policy saves_read_own on public.saves
  for select to authenticated using (auth.uid() = user_id);

-- Only a post you can see: posts_read already hides anyone you are
-- blocked with, either way.
create policy saves_insert_own on public.saves
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.posts p where p.id = post_id)
  );

create policy saves_delete_own on public.saves
  for delete to authenticated using (auth.uid() = user_id);


-- --------------------------------------------------------------------
-- 2. Today's pours
--
-- Every photo shared in the last 24 hours by the caller or anyone the
-- caller follows. SECURITY INVOKER on purpose: posts_read,
-- post_photos_read and follows_read all apply, so blocks are honoured
-- with nothing extra here. Capped at 300 rows, which is far more tiles
-- than the row can show.
-- --------------------------------------------------------------------

create or replace function public.recent_pours()
returns table (post_id uuid, author_id uuid, drink_id text, path text, poured_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.author_id, p.drink_id, ph.path, ph.created_at
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

create index if not exists post_photos_created_idx on public.post_photos (created_at desc);


-- --------------------------------------------------------------------
-- 3. The server owns the clocks Today's pours and Activity read
--
-- recent_pours filters and orders by post_photos.created_at; Activity and
-- the dot on Home's heart order by likes.created_at and follows.created_at.
-- All three took whatever the client sent on insert, so one row dated
-- 2999 would sit first in every follower's pours, or at the top of
-- someone's Activity, for good, and once Activity was opened everything
-- that really happened after it would read as already seen. 011 closed
-- the same hole on posts and profiles; this applies its pin_created_at
-- here. No build sends the column for these tables, so no write the app
-- makes changes.
--
-- As in 011, the triggers are dropped before the clean-up and recreated
-- after it, so a re-run's clean-up is not refused by them.
-- --------------------------------------------------------------------

drop trigger if exists post_photos_pin_created_at on public.post_photos;
drop trigger if exists likes_pin_created_at       on public.likes;
drop trigger if exists follows_pin_created_at     on public.follows;

-- Anything already dated in the future was written by hand, since the
-- default can only produce the present.
update public.post_photos set created_at = now() where created_at > now();
update public.likes       set created_at = now() where created_at > now();
update public.follows     set created_at = now() where created_at > now();

create trigger post_photos_pin_created_at
  before insert or update on public.post_photos
  for each row execute function public.pin_created_at();

create trigger likes_pin_created_at
  before insert or update on public.likes
  for each row execute function public.pin_created_at();

create trigger follows_pin_created_at
  before insert or update on public.follows
  for each row execute function public.pin_created_at();


-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('017_home_and_profile') on conflict (version) do nothing;
