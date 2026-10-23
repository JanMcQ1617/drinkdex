-- ====================================================================
-- Sipply — migration 025: the Friends board
--
-- For specs/v4.7/spec.md §3. supabase/schema.sql holds the same object.
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- READ, NOT RUN. Like 021 to 024, nothing here has been executed: the
-- machine it was written on has no psql, postgres, docker or supabase CLI.
-- It was proven by reading every statement against supabase/schema.sql's
-- real names: profiles (id, username, display_name, accent, avatar_path),
-- follows (follower_id, following_id), posts (id, author_id, drink_id,
-- photo_path, created_at), post_photos (post_id, created_at),
-- private.my_block_set() (011) and schema_migrations (009). The first real
-- run is Jan's: run the VERIFY block right after it.
--
-- WHAT IT ADDS
--
--   public.friends_board(): for the caller and everyone the caller
--   follows, minus anyone blocked either way, one row each: who they are,
--   how many DIFFERENT catalogue drinks they have posted (each once, ever:
--   one post is one drink, 007), their place among the rows, and their
--   latest three posts' drink and photo. Most entries first, then
--   username; at most 200 people, and the caller always.
--
-- WHY A FUNCTION. The board needs a count per person over posts, which a
-- client would have to read row by row. SECURITY DEFINER so the counts
-- are one query; it reads only what posts_read already shows the caller
-- (every post by anyone they are not blocked with), and applies the same
-- block set itself. Nothing is stored and nothing new is exposed.
--
-- WHAT IS COUNTED (App Review 1.4.3). Different drinks, each once, ever:
-- never amounts, never per day, never reset. The app calls them entries.
--
-- ORDER
--
-- After 024 by number. Depends on 009 (schema_migrations), 007
-- (post_photos, posts_one_per_drink) and 011 (my_block_set) only; section
-- 0 stops the file if any is missing. Builds up to 29 never call it.
-- Build 30 (v4.7) calls it on the Tournaments tab and, while it is
-- missing (PGRST202 or 42883), leaves out the Friends half of that tab
-- with no error; the next focus after this file shows it. A PGRST202
-- straight after the run is PostgREST's schema cache: Settings -> API ->
-- Reload schema, or wait a minute.
--
-- VERIFY AFTERWARDS (all read-only, except the rolled-back smoke test)
--
--   -- Expect one row: 025_friends_board.
--   select version from public.schema_migrations where version = '025_friends_board';
--
--   -- Expect one row: friends_board() | true | false | true
--   select p.oid::regprocedure as fn, p.prosecdef,
--          has_function_privilege('anon', p.oid, 'execute')          as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as authenticated
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'friends_board';
--
--   -- Smoke test as a real account, rolled back. Paste your user id.
--   -- Expect your own row (entries = your posts, less any custom drinks),
--   -- then one row per person you follow, most entries first.
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     json_build_object('sub', '<your user id>', 'role', 'authenticated')::text, true);
--   select username, entries, place, jsonb_array_length(latest) from public.friends_board();
--   rollback;
-- ====================================================================


-- --------------------------------------------------------------------
-- 0. Stop here unless 007, 009 and 011 are applied
-- --------------------------------------------------------------------

do $$
begin
  if to_regprocedure('private.my_block_set()') is null
     or to_regclass('public.post_photos') is null
     or to_regclass('public.schema_migrations') is null then
    raise exception '025 needs 007, 009 and 011 applied first';
  end if;
end;
$$;


-- --------------------------------------------------------------------
-- 1. The board
--
-- `place` is a competition rank (1, 2, 3, 3, 5): on this board a tie is
-- only a tie. Null at 0 entries, where a place would be the alphabet's.
-- `latest` is a jsonb array of up to three {drink_id, photo_path},
-- newest first by the post's last photo (a re-post moves a drink up),
-- then by post id, so two posts with the same moment keep one order from
-- call to call and the prints never swap on a refresh. photo_path may be
-- null (a post with no photo), and the app then shows the drink's own
-- picture. Ranked over everyone the caller follows, then cut to 200, so
-- a place is true even past the cut; the caller's row is kept whatever
-- its place.
-- --------------------------------------------------------------------

create or replace function public.friends_board()
returns table (user_id uuid, username text, display_name text, accent text, avatar_path text,
               entries integer, place integer, latest jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as id
  ),
  people as (
    select m.id as person from me m where m.id is not null
    union
    select f.following_id from public.follows f join me m on f.follower_id = m.id
  ),
  shown as (
    select p.person
    from people p
    where not (p.person = any ((select private.my_block_set())::uuid[]))
  ),
  counted as (
    select s.person,
           (select count(distinct po.drink_id)::integer
            from public.posts po
            where po.author_id = s.person and po.drink_id !~ '^u_') as entries
    from shown s
  ),
  ranked as (
    select c.person, c.entries, pr.username, pr.display_name, pr.accent, pr.avatar_path,
           (rank() over (order by c.entries desc))::integer as place,
           row_number() over (order by c.entries desc, pr.username) as nth
    from counted c
    join public.profiles pr on pr.id = c.person
  )
  select r.person, r.username, r.display_name, r.accent, r.avatar_path, r.entries,
         case when r.entries > 0 then r.place end,
         coalesce((
           select jsonb_agg(jsonb_build_object('drink_id', l.drink_id, 'photo_path', l.photo_path)
                            order by l.last_at desc, l.id)
           from (
             select po.id, po.drink_id, po.photo_path,
                    coalesce((select max(ph.created_at) from public.post_photos ph where ph.post_id = po.id),
                             po.created_at) as last_at
             from public.posts po
             where po.author_id = r.person and po.drink_id !~ '^u_'
             order by last_at desc, po.id
             limit 3
           ) l
         ), '[]'::jsonb)
  from ranked r
  where r.nth <= 200 or r.person = (select m.id from me m)
  order by r.entries desc, r.username;
$$;

comment on function public.friends_board() is
  'The Tournaments tab''s Friends board (v4.7): the caller and everyone they follow, minus blocks either way, '
  'with how many different catalogue drinks each has posted (each once, ever; never amounts) and their latest '
  'three posts. Most first, then username; at most 200 plus the caller.';

revoke all on function public.friends_board() from public, anon;
grant execute on function public.friends_board() to authenticated;


-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('025_friends_board') on conflict (version) do nothing;
