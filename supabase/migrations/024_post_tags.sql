-- ====================================================================
-- Sipply — migration 024: tag the people you were with
--
-- For specs/v4.3/spec.md §2, where it was drafted (as
-- specs/v4.3/024_post_tags.sql). supabase/schema.sql holds the same
-- objects.
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- READ, NOT RUN. Like 021 to 023, nothing here has been executed: the
-- machine it was written on has no psql, postgres, docker or supabase CLI.
-- It was proven by reading every statement against supabase/schema.sql's
-- real names: posts (id, author_id, drink_id, photo_path), profiles (id,
-- username), follows (follower_id, following_id), blocks (blocker_id,
-- blocked_id), private.my_block_set() and public.blocked_with(uuid) (006,
-- 011), schema_migrations (009), and the house patterns of 017's saves and
-- 023's collection_items (column grants, own-row policies, a locked count
-- before a cap, a definer trigger where RLS would hide the rows it must
-- touch). The first real run is Jan's: run the VERIFY block right after it.
--
-- WHAT IT ADDS
--
--   1. public.post_tags: who a post's author was with, one row per post and
--      person, at most 10 per post (a before-insert trigger refuses the
--      11th with 'post_tags_full'). Only the author tags, only someone they
--      follow, never themselves, never anyone they are blocked with either
--      way. The tagged person may remove themselves; the author may remove
--      anyone. Read exactly as the post is (posts_read), minus anyone the
--      reader is blocked with.
--   2. public.post_tag_refusals: a person who removed themselves from a
--      post cannot be tagged on that post again. No grants and no policies:
--      written by a trigger, read by private.tag_refused().
--   3. A block takes the tags between the two people away, in both
--      directions, as 006's drop_follows_on_block takes the follows.
--
-- WHY A TABLE AND NOT A COLUMN. Activity asks "which posts tag ME, newest
-- first", which an array on posts cannot answer from an index; and a row
-- per person lets the tagged person delete their own row without being
-- able to write the post. Tags hang off the POST, not a photo: a post is
-- one drink (007), its photos are the times it was posted, and the tags
-- say who was with you over them. A re-post adds people, and removes only
-- someone the author unticks; it never removes anyone silently.
--
-- WHAT A TAG SHOWS, AND TO WHOM. Anyone who can see the post sees who is
-- tagged in it, by username, except people they are blocked with. The
-- tagged person sees the post in Activity ("ana tagged you in their
-- Negroni"), from this table's created_at; nothing else is stored and
-- nothing is sent. A push for it later needs no client rebuild (spec §2.5):
-- an after-insert trigger here, like 013's report alert, calls an Edge
-- Function, and build 25's notification handler already opens the post.
--
-- ORDER
--
-- After 023 by number. Depends on 009 (schema_migrations), 006 (blocks) and
-- 011 (my_block_set, blocked_with) only; section 0 stops the file if any is
-- missing. Does not need 017 to 023. Builds up to 24 never touch these
-- objects. Build 25 (v4.3) reads them and, while they are missing (PGRST205
-- or 42P01 on the table), shows no Tag people row, no "with" line and no tag
-- rows in Activity, with no error anywhere; the next launch after this file
-- shows them. A PGRST205 straight after the run is PostgREST's schema cache
-- catching up: relaunch.
--
-- Account deletion needs nothing new: delete_own_account() deletes the
-- auth.users row, which cascades to profiles, and from there to every tag
-- naming the account (tagged_id) and, through posts, every tag on its posts.
-- The refusals cascade the same two ways.
--
-- ALSO DO BY HAND
--
-- Nothing in the dashboard. docs/privacy.md, docs/data-deletion.md and
-- docs/appstore.md ship with the release (spec §4).
--
-- VERIFY AFTERWARDS (all read-only, except the rolled-back smoke test)
--
--   -- Expect one row: 024_post_tags.
--   select version from public.schema_migrations where version = '024_post_tags';
--
--   -- Expect two names and one function, none null.
--   select to_regclass('public.post_tags'), to_regclass('public.post_tag_refusals'),
--          to_regprocedure('private.tag_refused(uuid, uuid)');
--
--   -- Expect two rows, both true: Row Level Security is on.
--   select c.relname, c.relrowsecurity from pg_class c
--   where c.oid in ('public.post_tags'::regclass, 'public.post_tag_refusals'::regclass)
--   order by 1;
--
--   -- Expect post_tags_delete, post_tags_insert_author, post_tags_read:
--   -- three rows, every one for authenticated. None on post_tag_refusals.
--   select tablename, policyname, roles from pg_policies
--   where schemaname = 'public' and tablename in ('post_tags', 'post_tag_refusals')
--   order by 1, 2;
--
--   -- Expect four rows, every one confdeltype c (on delete cascade):
--   -- post_tags → posts, post_tags → profiles, and the same for refusals.
--   select conrelid::regclass as tbl, confrelid::regclass as refs, confdeltype
--   from pg_constraint
--   where contype = 'f'
--     and conrelid in ('public.post_tags'::regclass, 'public.post_tag_refusals'::regclass)
--   order by 1, 2;
--
--   -- Expect, in order: false (anon reads nothing); true (signed-in select);
--   -- true, true (insert post_id and tagged_id); false (insert created_at);
--   -- false (no update); true (delete); false, false (nobody reads or writes
--   -- the refusals); false (anon cannot run the refusal check).
--   select has_table_privilege('anon', 'public.post_tags', 'select')                          as anon_read,
--          has_table_privilege('authenticated', 'public.post_tags', 'select')                 as auth_read,
--          has_column_privilege('authenticated', 'public.post_tags', 'post_id', 'insert')     as ins_post,
--          has_column_privilege('authenticated', 'public.post_tags', 'tagged_id', 'insert')   as ins_tagged,
--          has_column_privilege('authenticated', 'public.post_tags', 'created_at', 'insert')  as ins_clock,
--          has_table_privilege('authenticated', 'public.post_tags', 'update')                 as auth_update,
--          has_table_privilege('authenticated', 'public.post_tags', 'delete')                 as auth_delete,
--          has_table_privilege('authenticated', 'public.post_tag_refusals', 'select')         as ref_read,
--          has_table_privilege('authenticated', 'public.post_tag_refusals', 'insert')         as ref_write,
--          has_function_privilege('anon', 'private.tag_refused(uuid, uuid)', 'execute')       as anon_refused;
--
--   -- Expect blocks_drop_tags, post_tags_cap, post_tags_refuse_again.
--   select tgname from pg_trigger
--   where tgname in ('post_tags_cap', 'post_tags_refuse_again', 'blocks_drop_tags')
--   order by 1;
--
--   -- Expect true: the cap is ten.
--   select prosrc like '%>= 10%' from pg_proc where proname = 'guard_post_tag_insert';
--
--   -- Smoke test, rolled back. Paste your id into the claims and another
--   -- real account's id into v_other (one you have not blocked, nor they
--   -- you). It makes a post for a drink id nobody posts ('zz-024-smoke'),
--   -- follows v_other if you do not already, and undoes all of it. Expect
--   -- "Success. No rows returned"; anything else raises and says what it
--   -- found. It covers: tagging someone you follow; a duplicate refused as
--   -- 23505; tagging yourself refused; tagging someone you do not follow
--   -- refused; the tagged person reads the tag and the post's drink through
--   -- the Activity join; they remove themselves; the author cannot tag them
--   -- on that post again; a block either way takes the tags away.
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     json_build_object('sub', '<your user id>', 'role', 'authenticated')::text, true);
--   do $$
--   declare
--     v_me    uuid := auth.uid();
--     v_other uuid := '<another account''s id>';
--     v_post  uuid;
--     v_post2 uuid;
--     v_n     integer;
--     v_drink text;
--   begin
--     if v_me is null or v_me = v_other then
--       raise exception 'paste your id into the claims and a different account''s id into v_other';
--     end if;
--     insert into public.follows (follower_id, following_id) values (v_me, v_other) on conflict do nothing;
--     insert into public.posts (author_id, drink_id) values (v_me, 'zz-024-smoke') returning id into v_post;
--     insert into public.post_tags (post_id, tagged_id) values (v_post, v_other);
--     begin
--       insert into public.post_tags (post_id, tagged_id) values (v_post, v_other);
--       raise exception 'a duplicate tag was accepted';
--     exception when unique_violation then null;
--     end;
--     begin
--       insert into public.post_tags (post_id, tagged_id) values (v_post, v_me);
--       raise exception 'you could tag yourself';
--     exception when insufficient_privilege then null;
--     end;
--     delete from public.post_tags where post_id = v_post and tagged_id = v_other;
--     delete from public.follows where follower_id = v_me and following_id = v_other;
--     begin
--       insert into public.post_tags (post_id, tagged_id) values (v_post, v_other);
--       raise exception 'you could tag someone you do not follow';
--     exception when insufficient_privilege then null;
--     end;
--     insert into public.follows (follower_id, following_id) values (v_me, v_other);
--     -- The author removing a tag leaves no refusal: they may tag again.
--     insert into public.post_tags (post_id, tagged_id) values (v_post, v_other);
--
--     perform set_config('request.jwt.claims',
--       json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
--     select count(*), max(p.drink_id) into v_n, v_drink
--     from public.post_tags t join public.posts p on p.id = t.post_id
--     where t.tagged_id = v_other and t.post_id = v_post;
--     if v_n <> 1 or v_drink is distinct from 'zz-024-smoke' then
--       raise exception 'the tagged account cannot read its tag and the post (% rows, %)', v_n, v_drink;
--     end if;
--     delete from public.post_tags where post_id = v_post and tagged_id = v_other;
--     get diagnostics v_n = row_count;
--     if v_n <> 1 then raise exception 'the tagged account could not remove itself'; end if;
--
--     perform set_config('request.jwt.claims',
--       json_build_object('sub', v_me, 'role', 'authenticated')::text, true);
--     if not private.tag_refused(v_post, v_other) then
--       raise exception 'removing yourself left no refusal';
--     end if;
--     begin
--       insert into public.post_tags (post_id, tagged_id) values (v_post, v_other);
--       raise exception 'the author tagged someone again after they removed themselves';
--     exception when insufficient_privilege then null;
--     end;
--
--     -- A block hides the other person's rows from both sides, so a count
--     -- straight after it proves nothing: block, unblock, then count. The
--     -- tags must still be gone (unblocking brings nothing back).
--     insert into public.posts (author_id, drink_id) values (v_me, 'zz-024-smoke-2') returning id into v_post2;
--     insert into public.post_tags (post_id, tagged_id) values (v_post2, v_other);
--     perform set_config('request.jwt.claims',
--       json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
--     insert into public.blocks (blocker_id, blocked_id) values (v_other, v_me);
--     delete from public.blocks where blocker_id = v_other and blocked_id = v_me;
--     perform set_config('request.jwt.claims',
--       json_build_object('sub', v_me, 'role', 'authenticated')::text, true);
--     select count(*) into v_n from public.post_tags where post_id = v_post2;
--     if v_n <> 0 then raise exception 'a block left % tag(s) in place', v_n; end if;
--     if not private.tag_refused(v_post2, v_other) then
--       raise exception 'a block by the tagged person left no refusal';
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
    raise exception '024 needs 009 (public.schema_migrations). Apply the earlier migrations first.';
  end if;
  if to_regclass('public.blocks') is null then
    raise exception '024 needs 006 (public.blocks). Apply the earlier migrations first.';
  end if;
  if to_regprocedure('private.my_block_set()') is null
     or to_regprocedure('public.blocked_with(uuid)') is null then
    raise exception '024 needs 011 (private.my_block_set, public.blocked_with). Apply the earlier migrations first.';
  end if;
end;
$$;


-- --------------------------------------------------------------------
-- 1. Tags
--
-- Cascades from both sides: deleting the post or either account removes
-- the tag, so account deletion needs no extra step. The clock is the
-- server's: the column grant below leaves created_at out of every insert.
-- --------------------------------------------------------------------

create table if not exists public.post_tags (
  post_id    uuid not null references public.posts    on delete cascade,
  tagged_id  uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, tagged_id)
);

-- "Posts that tag me, newest first", for Activity and the dot on Home's
-- heart. The primary key already serves a post's own tags (the feed, the
-- cap's count, the post cascade).
create index if not exists post_tags_tagged_recent_idx on public.post_tags (tagged_id, created_at desc);


-- --------------------------------------------------------------------
-- 2. Removing yourself sticks
--
-- Without this, an author could tag someone again the moment they left,
-- and every re-tag is a new row in that person's Activity. So when the
-- TAGGED person deletes their own row, a refusal is kept for that post,
-- and the insert policy below refuses a tag it names. The author deleting
-- a tag (a mistake corrected) keeps no refusal.
--
-- The refusal is only written while the post and the person both still
-- exist: an account deletion cascades through post_tags as that account,
-- and a refusal naming a profile mid-delete would fail the whole deletion
-- on its foreign key.
--
-- Nobody reads or writes this table through the API. The check lives in
-- `private`, out of PostgREST's reach (011 §0), because as an RPC it would
-- say who removed themselves from which post.
-- --------------------------------------------------------------------

create table if not exists public.post_tag_refusals (
  post_id    uuid not null references public.posts    on delete cascade,
  tagged_id  uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, tagged_id)
);

alter table public.post_tag_refusals enable row level security;
revoke all on public.post_tag_refusals from anon, authenticated;

-- The cascade from profiles deletes by tagged_id.
create index if not exists post_tag_refusals_tagged_idx on public.post_tag_refusals (tagged_id);

create or replace function private.tag_refused(p_post uuid, p_tagged uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.post_tag_refusals r
    where r.post_id = p_post and r.tagged_id = p_tagged
  );
$$;

revoke all on function private.tag_refused(uuid, uuid) from public, anon;
grant execute on function private.tag_refused(uuid, uuid) to authenticated;

create or replace function public.refuse_tag_again()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.tagged_id = auth.uid()
     and exists (select 1 from public.posts p where p.id = old.post_id)
     and exists (select 1 from public.profiles pr where pr.id = old.tagged_id) then
    insert into public.post_tag_refusals (post_id, tagged_id)
    values (old.post_id, old.tagged_id)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

revoke all on function public.refuse_tag_again() from public, anon, authenticated;

drop trigger if exists post_tags_refuse_again on public.post_tags;
create trigger post_tags_refuse_again
  after delete on public.post_tags
  for each row execute function public.refuse_tag_again();


-- --------------------------------------------------------------------
-- 3. At most ten per post
--
-- The lock makes two inserts on one post at once count in turn. Definer,
-- so the count is every tag on the post and never only the ones this
-- caller may read.
-- --------------------------------------------------------------------

create or replace function public.guard_post_tag_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  have integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('post_tags:' || new.post_id::text, 0));
  select count(*) into have from public.post_tags t where t.post_id = new.post_id;
  if have >= 10 then
    raise exception 'post_tags_full'
      using errcode = 'P0001',
            detail  = format('%s people tagged; the limit is 10', have),
            hint    = 'Remove someone to tag someone else.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_post_tag_insert() from public, anon, authenticated;

drop trigger if exists post_tags_cap on public.post_tags;
create trigger post_tags_cap
  before insert on public.post_tags
  for each row execute function public.guard_post_tag_insert();


-- --------------------------------------------------------------------
-- 4. A block takes the tags away, both ways
--
-- Like drop_follows_on_block (006): the tags between the two people go the
-- moment either blocks the other. Definer, because by then posts_read
-- already hides the other person's posts from the blocker, so an invoker
-- delete would find only half of them. Unblocking brings nothing back.
-- When the blocker was the one tagged, refuse_tag_again (above) also keeps
-- a refusal, so that post cannot tag them again after an unblock.
-- --------------------------------------------------------------------

create or replace function public.drop_tags_on_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.post_tags t
  using public.posts p
  where p.id = t.post_id
    and ((p.author_id = new.blocker_id and t.tagged_id = new.blocked_id)
      or (p.author_id = new.blocked_id and t.tagged_id = new.blocker_id));
  return null;
end;
$$;

revoke all on function public.drop_tags_on_block() from public, anon, authenticated;

drop trigger if exists blocks_drop_tags on public.blocks;
create trigger blocks_drop_tags
  after insert on public.blocks
  for each row execute function public.drop_tags_on_block();


-- --------------------------------------------------------------------
-- 5. Who may do what
--
-- Insert names the two ids and nothing else; nobody updates a tag (remove
-- it and tag again).
-- --------------------------------------------------------------------

alter table public.post_tags enable row level security;

revoke all on public.post_tags from anon, authenticated;
grant select, delete on public.post_tags to authenticated;
grant insert (post_id, tagged_id) on public.post_tags to authenticated;

drop policy if exists post_tags_read          on public.post_tags;
drop policy if exists post_tags_insert_author on public.post_tags;
drop policy if exists post_tags_delete        on public.post_tags;

-- Exactly as visible as the post (the subquery runs under posts_read, which
-- hides an author you are blocked with), minus a tagged person you are
-- blocked with: their name never reaches you on anyone's post.
create policy post_tags_read on public.post_tags
  for select to authenticated
  using (
    exists (select 1 from public.posts p where p.id = post_id)
    and not (tagged_id = any ((select private.my_block_set())::uuid[]))
  );

-- Only the post's author tags; only someone they follow (the subquery runs
-- under follows_read, which already drops an edge to a blocked account);
-- never themselves; never anyone blocked either way (checked as well,
-- through the definer, so loosening a read policy later cannot open it);
-- never someone who removed themselves from this post.
create policy post_tags_insert_author on public.post_tags
  for insert to authenticated
  with check (
    tagged_id <> (select auth.uid())
    and exists (select 1 from public.posts p
                where p.id = post_id and p.author_id = (select auth.uid()))
    and exists (select 1 from public.follows f
                where f.follower_id = (select auth.uid()) and f.following_id = tagged_id)
    and not public.blocked_with(tagged_id)
    and not private.tag_refused(post_id, tagged_id)
  );

-- The tagged person removes themselves; the author removes anyone.
create policy post_tags_delete on public.post_tags
  for delete to authenticated
  using (
    tagged_id = (select auth.uid())
    or exists (select 1 from public.posts p
               where p.id = post_id and p.author_id = (select auth.uid()))
  );


-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('024_post_tags') on conflict (version) do nothing;
