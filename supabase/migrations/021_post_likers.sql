-- ====================================================================
-- Sipply — migration 021: who liked a post
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- READ, NOT RUN. The machine this was written on has no psql, postgres,
-- deno or docker (checked 7 Oct 2026), so nothing here has been executed.
-- It was proven by reading every statement against supabase/schema.sql's
-- real names: likes (post_id, user_id, created_at), follows (follower_id,
-- following_id), profiles (id, username, display_name, accent,
-- avatar_path), posts (id, author_id), private.my_block_set() and the
-- four read policies these functions run under. The first real run is
-- Jan's: run the VERIFY block below right after it.
--
-- WHAT IT ADDS
--
--   1. likes_post_recent_idx: a post's likes, newest first. It serves the
--      likers list's pages and the summary's tie-break.
--   2. public.post_like_summaries(uuid[]): for each of up to 100 posts,
--      one liker to name on the card's "Liked by" line: someone you
--      follow if any of them liked it, else the newest liker. Never you,
--      never anyone blocked either way. A post with no such liker returns
--      no row.
--   3. public.post_likers(uuid, integer, timestamptz, uuid): everyone who
--      liked one post, newest first, a page at a time (keyset on the like's
--      created_at, then user_id), with whether you follow each. You are
--      listed too, like anyone.
--
-- WHY INVOKER
--
-- Both functions run as the caller (SECURITY INVOKER), as 017's
-- recent_pours does. posts_read, likes_read, profiles_read and
-- follows_read already say exactly what the caller may see, blocks both
-- ways included; a definer function would bypass all four and have to
-- re-implement each. Blocks are ALSO checked here, through
-- private.my_block_set(), so loosening a policy later cannot leak a
-- liker's name. Sipply has no private accounts (profiles has no
-- visibility column): who may see a post is posts_read, and nothing else.
--
-- ORDER
--
-- After 019 by number. Depends on 009 (schema_migrations) and 011
-- (my_block_set) only; section 0 stops the file if either is missing. It
-- does NOT depend on 020, which is not applied on the live project yet:
-- this file may be applied before or after it. Builds up to 17 never call
-- these functions. Build 18 asks for them and, while they are missing,
-- shows every post's plain "N likes", not tappable, with no error; after
-- this file it names a liker on the next launch. A PGRST202 straight
-- after the run is PostgREST's schema cache catching up: relaunch.
--
-- Account deletion needs nothing new: likes cascade from profiles and
-- from posts, so a deleted account leaves both lists at once.
--
-- ALSO DO BY HAND
--
-- Nothing. docs/privacy.md says that anyone who can see a post can see
-- who liked it; that text ships with the release.
--
-- VERIFY AFTERWARDS (all read-only, except the rolled-back smoke test)
--
--   -- Expect one row: 021_post_likers.
--   select version from public.schema_migrations where version = '021_post_likers';
--
--   -- Expect two names, neither null.
--   select to_regprocedure('public.post_like_summaries(uuid[])'),
--          to_regprocedure('public.post_likers(uuid, integer, timestamptz, uuid)');
--
--   -- Expect two rows, post_like_summaries(uuid[]) and post_likers(uuid,
--   -- integer, timestamp with time zone, uuid), each: prosecdef false
--   -- (runs as the caller), anon false, authenticated true, provolatile
--   -- s (stable), config search_path="".
--   select p.oid::regprocedure as fn, p.prosecdef,
--          has_function_privilege('anon', p.oid, 'execute')          as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
--          p.provolatile, array_to_string(p.proconfig, ', ') as config
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname in ('post_like_summaries', 'post_likers')
--   order by p.oid::regprocedure::text;
--
--   -- Expect one row: likes_post_recent_idx.
--   select indexname from pg_indexes
--   where schemaname = 'public' and indexname = 'likes_post_recent_idx';
--
--   -- auth.uid() is null in the SQL Editor, so both functions return
--   -- nothing there; the smoke test below runs them as a real account.
--   -- To pick its two ids: your id, then the most-liked posts with who
--   -- liked them (as the editor's owner role, so every like shows).
--   select id from public.profiles where username = '<your username>';
--   select l.post_id, count(*) as likes, string_agg(pr.username, ', ') as likers
--   from public.likes l join public.profiles pr on pr.id = l.user_id
--   group by l.post_id order by likes desc limit 5;
--
--   -- Smoke test as that account, rolled back. Paste your id and a post
--   -- someone other than you has liked. Expect "Success. No rows
--   -- returned"; anything else raises and says what it found. The checks
--   -- sit in one block because the editor shows only the last
--   -- statement's result (015). They cover: the list matches the likes
--   -- this account can see; the line names exactly one liker, never you,
--   -- someone in the list, and someone you follow when any of them did;
--   -- and a second page starts exactly where a one-row first page ended.
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     json_build_object('sub', '<your user id>', 'role', 'authenticated')::text, true);
--   do $$
--   declare
--     v_post   uuid := '<a post id>';
--     v_me     uuid := auth.uid();
--     v_listed integer;
--     v_likes  integer;
--     v_rows   integer;
--     v_named  uuid;
--     v_at     timestamptz;
--     v_first  uuid;
--     v_second uuid;
--     v_next   uuid;
--   begin
--     if not exists (select 1 from public.posts p where p.id = v_post) then
--       raise exception 'this account cannot see that post: pick another';
--     end if;
--     select count(*) into v_listed from public.post_likers(v_post, 100);
--     select count(*) into v_likes from public.likes l where l.post_id = v_post;
--     if v_listed <> least(v_likes, 100) then
--       raise exception 'post_likers listed % of the % likes this account can see', v_listed, v_likes;
--     end if;
--     if not exists (select 1 from public.post_likers(v_post, 100) x where x.user_id <> v_me) then
--       raise exception 'nobody but you has liked that post: pick one someone else liked';
--     end if;
--     select count(*), (array_agg(s.user_id))[1] into v_rows, v_named
--     from public.post_like_summaries(array[v_post]) s;
--     if v_rows <> 1 then
--       raise exception 'post_like_summaries returned % rows, expected 1', v_rows;
--     end if;
--     if v_named = v_me then
--       raise exception 'post_like_summaries named you';
--     end if;
--     if not exists (select 1 from public.post_likers(v_post, 100) x where x.user_id = v_named) then
--       raise exception 'post_like_summaries named someone post_likers does not list';
--     end if;
--     if exists (select 1 from public.post_likers(v_post, 100) x where x.followed_by_me)
--        and not exists (select 1 from public.post_likers(v_post, 100) x
--                        where x.user_id = v_named and x.followed_by_me) then
--       raise exception 'post_like_summaries named a stranger over someone you follow';
--     end if;
--     if v_listed >= 2 then
--       select x.liked_at, x.user_id into v_at, v_first from public.post_likers(v_post, 1) x;
--       select x.user_id into v_second from public.post_likers(v_post, 2) x
--       order by x.liked_at, x.user_id limit 1;
--       select x.user_id into v_next from public.post_likers(v_post, 1, v_at, v_first) x;
--       if v_next is distinct from v_second then
--         raise exception 'the second page does not start where the first ended';
--       end if;
--     end if;
--   end;
--   $$;
--   rollback;
-- ====================================================================


-- --------------------------------------------------------------------
-- 0. Stop here unless 009 and 011 are applied
-- --------------------------------------------------------------------

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception '021 needs 009 (public.schema_migrations). Apply the earlier migrations first.';
  end if;
  if to_regprocedure('private.my_block_set()') is null then
    raise exception '021 needs 011 (private.my_block_set). Apply the earlier migrations first.';
  end if;
end;
$$;


-- --------------------------------------------------------------------
-- 1. A post's likes, newest first
--
-- The primary key (post_id, user_id) finds a post's likes but not in
-- order, so every page of the likers list and every summary's tie-break
-- would sort them all. Both functions order by (created_at desc,
-- user_id desc), which this index holds as it is.
-- --------------------------------------------------------------------

create index if not exists likes_post_recent_idx on public.likes (post_id, created_at desc, user_id desc);


-- --------------------------------------------------------------------
-- 2. One liker to name per post
--
-- For the feed's "Liked by Maya and 12 others": one call for a whole
-- page of posts, rather than one per card. Someone you follow wins over
-- a stranger, and among equals the newest like. Never you (the card says
-- "Liked by you" itself), never anyone blocked either way, and nothing
-- at all for a post you cannot see. At most 100 posts per call; the app
-- sends them in chunks of 100.
--
-- Every column reference is table-qualified: the RETURNS TABLE names
-- (post_id, user_id, ...) are also column names of likes and profiles,
-- and must never be read as one another.
-- --------------------------------------------------------------------

create or replace function public.post_like_summaries(p_post_ids uuid[])
returns table (post_id uuid, user_id uuid, username text, display_name text,
               accent text, avatar_path text)
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as id, (select private.my_block_set()) as blocked
  ),
  wanted as (
    select distinct u.id from unnest(p_post_ids[1:100]) as u(id)
  )
  select p.id, f.user_id, f.username, f.display_name, f.accent, f.avatar_path
  from me
  cross join wanted w
  join public.posts p on p.id = w.id
  cross join lateral (
    select pr.id as user_id, pr.username, pr.display_name, pr.accent, pr.avatar_path
    from public.likes l
    join public.profiles pr on pr.id = l.user_id
    where l.post_id = p.id
      and l.user_id <> me.id
      and not (l.user_id = any (me.blocked))
    order by exists (select 1 from public.follows fo
                     where fo.follower_id = me.id and fo.following_id = l.user_id) desc,
             l.created_at desc, l.user_id desc
    limit 1
  ) f
  where me.id is not null
    and not (p.author_id = any (me.blocked));
$$;


-- --------------------------------------------------------------------
-- 3. Everyone who liked one post
--
-- Newest first, a page at a time: the app passes the last row's
-- liked_at and user_id back as p_before_at and p_before_user. Keyset,
-- not offset, so a like arriving while someone scrolls cannot shift a
-- row onto the next page twice. 50 a page by default, 100 at most. The
-- caller is listed like anyone else, and the post's author too when
-- they liked their own post.
-- --------------------------------------------------------------------

create or replace function public.post_likers(
  p_post_id uuid,
  p_limit integer default 50,
  p_before_at timestamptz default null,
  p_before_user uuid default null)
returns table (user_id uuid, username text, display_name text, accent text,
               avatar_path text, liked_at timestamptz, followed_by_me boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as id, (select private.my_block_set()) as blocked
  )
  select pr.id, pr.username, pr.display_name, pr.accent, pr.avatar_path, l.created_at,
         exists (select 1 from public.follows fo
                 where fo.follower_id = me.id and fo.following_id = pr.id)
  from me
  join public.posts p on p.id = p_post_id
  join public.likes l on l.post_id = p.id
  join public.profiles pr on pr.id = l.user_id
  where me.id is not null
    and not (p.author_id = any (me.blocked))
    and not (l.user_id = any (me.blocked))
    and (p_before_at is null
         or (l.created_at, l.user_id)
            < (p_before_at, coalesce(p_before_user, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by l.created_at desc, l.user_id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;


-- --------------------------------------------------------------------
-- 4. Grants
--
-- Signed-in accounts only. Supabase's default privileges grant every new
-- public function to anon, hence the explicit revoke.
-- --------------------------------------------------------------------

revoke all on function public.post_like_summaries(uuid[])                      from public, anon;
revoke all on function public.post_likers(uuid, integer, timestamptz, uuid)    from public, anon;
grant execute on function public.post_like_summaries(uuid[])                   to authenticated;
grant execute on function public.post_likers(uuid, integer, timestamptz, uuid) to authenticated;


-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('021_post_likers') on conflict (version) do nothing;
