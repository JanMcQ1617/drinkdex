-- ====================================================================
-- Sipply — migration 023: saved collections, and sharing one by link
--
-- For specs/v4.2/spec.md §4.9, where it was drafted (as
-- specs/v4.2/023_collections.sql). supabase/schema.sql holds the same
-- objects.
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- READ, NOT RUN. Like 022, nothing here has been executed: the machine it
-- was written on has no psql, postgres, docker or supabase CLI. It was
-- proven by reading every statement against supabase/schema.sql's real
-- names: profiles (id, username), posts (id, author_id, drink_id),
-- private.my_block_set() (011), public.is_objectionable(text, boolean)
-- (011), schema_migrations (009), and the house patterns of 017's saves
-- and 022's want_to_try (column grants, own-row policies, a per-account
-- advisory lock before a count, the server's clocks). The first real run
-- is Jan's: run the VERIFY block right after it.
--
-- WHAT IT ADDS
--
--   1. public.collections: a named group of saved things, one row each,
--      owned by one account. Private until shared. At most 50 per account
--      (a before-insert trigger refuses the 51st with 'collections_full').
--      Names are 1 to 40 characters, trimmed.
--   2. public.collection_items: what is in a collection, a saved DRINK (a
--      catalogue id) or a saved POST (a post id), one row each, at most 200
--      per collection ('collection_full'). A post item goes when the post
--      is deleted (on delete cascade); every item goes with its collection.
--   3. Sharing, through four functions, never through the tables:
--        share_collection(id)            mints a random share id, turns the link on
--        unshare_collection(id)          turns it off (the share id is thrown away)
--        get_shared_collection(share)    what a link shows, for anon and signed in
--        copy_shared_collection(share)   "Save collection": a private copy for the caller
--   4. Two clean-up triggers: unsaving a post (saves, 017) or a drink
--      (want_to_try, 022) takes it out of the owner's collections too, so
--      a collection only ever holds things that are in All saved.
--
-- WHY FUNCTIONS FOR SHARING. A select policy "visibility = 'link'" would let
-- anyone LIST every shared collection through PostgREST without knowing a
-- link. So the tables stay owner-only, and the only way in for anyone else
-- is get_shared_collection(share_id), which answers one collection for one
-- 122-bit random id and nothing for anything else. The share id is NOT the
-- collection id: stopping sharing throws it away, so an old link never
-- comes back to life when the collection is shared again.
--
-- WHAT A LINK SHOWS. The collection's name, the owner's username, its
-- drinks (catalogue ids; the page and the app have the names) and, for each
-- post in it, the drink that post shows. A post's id comes back only to a
-- signed-in caller who is not blocked with its author either way; that
-- caller then reads the post itself through posts_read as usual. Nobody
-- signed out ever gets a post id, a photo, a caption or an author.
--
-- ORDER
--
-- After 022 by number, and NEEDS 022 (want_to_try) and 017 (saves): section
-- 0 stops the file if either is missing. Does not need 018 to 021. Builds
-- up to 23 never touch these objects. Build 24 (v4.2) reads them and,
-- while they are missing (PGRST205 or 42P01 on the table, PGRST202 on a
-- function), hides every collection surface with no error anywhere; the
-- next launch after this file shows them. A PGRST205 straight after the run
-- is PostgREST's schema cache catching up: relaunch.
--
-- Account deletion needs nothing new: delete_own_account() deletes the
-- auth.users row, which cascades to profiles, from there to collections,
-- and from there to collection_items. A shared link of a deleted account
-- simply stops answering.
--
-- ALSO DO BY HAND
--
-- Nothing in the dashboard. docs/privacy.md, docs/data-deletion.md,
-- docs/appstore.md (Other User Content gains "collections") and the web
-- page docs/c/index.html ship with the release; Pages republishes when
-- main moves.
--
-- VERIFY AFTERWARDS (all read-only, except the rolled-back smoke test)
--
--   -- Expect one row: 023_collections.
--   select version from public.schema_migrations where version = '023_collections';
--
--   -- Expect two names, neither null.
--   select to_regclass('public.collections'), to_regclass('public.collection_items');
--
--   -- Expect two rows, both true: Row Level Security is on.
--   select c.relname, c.relrowsecurity from pg_class c
--   where c.oid in ('public.collections'::regclass, 'public.collection_items'::regclass)
--   order by 1;
--
--   -- Expect collection_items_delete_own, collection_items_insert_own,
--   -- collection_items_read_own, collections_delete_own,
--   -- collections_insert_own, collections_read_own, collections_update_own:
--   -- seven rows, every one for authenticated, none for anon.
--   select tablename, policyname, roles from pg_policies
--   where schemaname = 'public' and tablename in ('collections', 'collection_items')
--   order by 1, 2;
--
--   -- Expect three rows with confdeltype c (on delete cascade):
--   -- collections → profiles, collection_items → collections,
--   -- collection_items → posts.
--   select conrelid::regclass as tbl, confrelid::regclass as refs, confdeltype
--   from pg_constraint
--   where contype = 'f'
--     and conrelid in ('public.collections'::regclass, 'public.collection_items'::regclass)
--   order by 1, 2;
--
--   -- Expect, in order: false, false (anon reads neither table); true
--   -- (owner select); true, false (insert name, not share_id); true, false
--   -- (update name, not visibility); false (no update on items); true, true
--   -- (anon and authenticated may call get_shared_collection); false (anon
--   -- may not call share_collection).
--   select has_table_privilege('anon', 'public.collections', 'select')                       as anon_c,
--          has_table_privilege('anon', 'public.collection_items', 'select')                  as anon_ci,
--          has_table_privilege('authenticated', 'public.collections', 'select')              as c_select,
--          has_column_privilege('authenticated', 'public.collections', 'name', 'insert')     as c_ins_name,
--          has_column_privilege('authenticated', 'public.collections', 'share_id', 'insert') as c_ins_share,
--          has_column_privilege('authenticated', 'public.collections', 'name', 'update')     as c_upd_name,
--          has_column_privilege('authenticated', 'public.collections', 'visibility', 'update') as c_upd_vis,
--          has_table_privilege('authenticated', 'public.collection_items', 'update')         as ci_update,
--          has_function_privilege('anon', 'public.get_shared_collection(uuid)', 'execute')   as anon_get,
--          has_function_privilege('authenticated', 'public.get_shared_collection(uuid)', 'execute') as auth_get,
--          has_function_privilege('anon', 'public.share_collection(uuid)', 'execute')        as anon_share;
--
--   -- Expect collection_items_cap, collection_items_touch, collections_cap,
--   -- collections_touch, saves_leave_collections, want_to_try_leave_collections.
--   select tgname from pg_trigger
--   where tgname in ('collections_cap', 'collections_touch', 'collection_items_cap',
--                    'collection_items_touch', 'saves_leave_collections',
--                    'want_to_try_leave_collections')
--   order by 1;
--
--   -- Expect 0: no collection is link-shared without a share id, or the reverse.
--   select count(*) from public.collections where (visibility = 'link') <> (share_id is not null);
--
--   -- Smoke test as one account, rolled back. Paste your id and another
--   -- account's. Expect "Success. No rows returned"; anything else raises
--   -- and says what it found. It covers: a collection made, renamed and
--   -- read back; share_id not writable; a drink item and a duplicate
--   -- refused as 23505; sharing mints an id that get_shared_collection
--   -- answers, and an unknown id answers null; anon sees the drink but no
--   -- post id; stopping sharing kills the old id and sharing again mints a
--   -- new one; the other account cannot read or write the rows; unsaving
--   -- the drink takes it out of the collection.
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     json_build_object('sub', '<your user id>', 'role', 'authenticated')::text, true);
--   do $$
--   declare
--     v_me    uuid := auth.uid();
--     v_other uuid := '<another account''s id>';
--     v_c     uuid;
--     v_s1    uuid;
--     v_s2    uuid;
--     v_j     jsonb;
--     v_n     integer;
--   begin
--     if v_me is null or v_me = v_other then
--       raise exception 'paste your id into the claims and a different account''s id into v_other';
--     end if;
--     insert into public.collections (owner_id, name) values (v_me, 'Smoke test') returning id into v_c;
--     update public.collections set name = 'Smoke test 2' where id = v_c;
--     begin
--       update public.collections set share_id = gen_random_uuid() where id = v_c;
--       raise exception 'share_id could be written directly';
--     exception when insufficient_privilege then null;
--     end;
--     insert into public.want_to_try (user_id, drink_id) values (v_me, 'negroni') on conflict do nothing;
--     insert into public.collection_items (collection_id, kind, drink_id) values (v_c, 'drink', 'negroni');
--     begin
--       insert into public.collection_items (collection_id, kind, drink_id) values (v_c, 'drink', 'negroni');
--       raise exception 'a duplicate drink item was accepted';
--     exception when unique_violation then null;
--     end;
--     v_s1 := public.share_collection(v_c);
--     v_j := public.get_shared_collection(v_s1);
--     if v_j ->> 'name' is distinct from 'Smoke test 2' or jsonb_array_length(v_j -> 'items') <> 1 then
--       raise exception 'the shared collection did not read back: %', v_j;
--     end if;
--     if public.get_shared_collection(gen_random_uuid()) is not null then
--       raise exception 'an unknown share id answered';
--     end if;
--     perform public.unshare_collection(v_c);
--     if public.get_shared_collection(v_s1) is not null then
--       raise exception 'the link still answers after stop sharing';
--     end if;
--     v_s2 := public.share_collection(v_c);
--     if v_s2 = v_s1 then raise exception 'sharing again reused the old link'; end if;
--     delete from public.want_to_try where user_id = v_me and drink_id = 'negroni';
--     select count(*) into v_n from public.collection_items where collection_id = v_c;
--     if v_n <> 0 then raise exception 'unsaving the drink left it in the collection'; end if;
--     perform set_config('request.jwt.claims',
--       json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
--     select count(*) into v_n from public.collections where id = v_c;
--     if v_n <> 0 then raise exception 'another account can read the collection'; end if;
--     begin
--       insert into public.collection_items (collection_id, kind, drink_id) values (v_c, 'drink', 'margarita');
--       raise exception 'another account could add to the collection';
--     exception when insufficient_privilege then null;
--     end;
--     if public.get_shared_collection(v_s2) is null then
--       raise exception 'a signed-in stranger cannot open a live link';
--     end if;
--   end;
--   $$;
--   rollback;
--
--   -- As anon, rolled back: the link answers with drink ids and no post ids.
--   begin;
--   set local role anon;
--   select public.get_shared_collection('<a live share id>');
--   rollback;
-- ====================================================================


-- --------------------------------------------------------------------
-- 0. Preconditions
-- --------------------------------------------------------------------

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception '023 needs 009 (public.schema_migrations). Apply the earlier migrations first.';
  end if;
  if to_regclass('public.saves') is null then
    raise exception '023 needs 017 (public.saves). Apply 017 first.';
  end if;
  if to_regclass('public.want_to_try') is null then
    raise exception '023 needs 022 (public.want_to_try). Apply 022 first.';
  end if;
  if to_regprocedure('private.my_block_set()') is null
     or to_regprocedure('public.is_objectionable(text, boolean)') is null then
    raise exception '023 needs 011 (private.my_block_set, public.is_objectionable).';
  end if;
end;
$$;


-- --------------------------------------------------------------------
-- 1. Collections
-- --------------------------------------------------------------------

create table if not exists public.collections (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles on delete cascade,
  name        text not null,
  visibility  text not null default 'private',
  share_id    uuid unique,
  shared_at   timestamptz,
  created_at  timestamptz not null default now(),
  -- Moved by renames and by every item added, so the Saved tab can put the
  -- collection you last saved into first.
  updated_at  timestamptz not null default now(),
  constraint collections_name_shape
    check (name = btrim(name) and char_length(name) between 1 and 40),
  constraint collections_visibility
    check (visibility in ('private', 'link')),
  constraint collections_link_has_id
    check ((visibility = 'link') = (share_id is not null))
);

create index if not exists collections_owner_updated_idx on public.collections (owner_id, updated_at desc);

-- The server's clocks: created_at never moves, updated_at is now().
-- And a SHARED collection cannot be renamed to a name the content filter
-- catches: share_collection checks the name once, so without this a rename
-- after sharing would put any name on the public link.
create or replace function public.touch_collection()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.share_id is not null and new.name is distinct from old.name
     and public.is_objectionable(new.name) then
    raise exception 'collection_name_objectionable' using errcode = 'P0001',
      hint = 'Stop sharing it, or choose another name.';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.touch_collection() from public, anon, authenticated;

drop trigger if exists collections_touch on public.collections;
create trigger collections_touch
  before update on public.collections
  for each row execute function public.touch_collection();

-- At most 50 per account. The lock makes two inserts at once count in turn.
create or replace function public.guard_collection_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  have integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('collections:' || new.owner_id::text, 0));
  select count(*) into have from public.collections c where c.owner_id = new.owner_id;
  if have >= 50 then
    raise exception 'collections_full'
      using errcode = 'P0001',
            detail  = format('%s collections; the limit is 50', have),
            hint    = 'Delete one to make another.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_collection_insert() from public, anon, authenticated;

drop trigger if exists collections_cap on public.collections;
create trigger collections_cap
  before insert on public.collections
  for each row execute function public.guard_collection_insert();

alter table public.collections enable row level security;

-- A client names a collection and nothing else: visibility, share_id and
-- shared_at move only through share_collection / unshare_collection.
revoke all on public.collections from anon, authenticated;
grant select, delete on public.collections to authenticated;
grant insert (owner_id, name) on public.collections to authenticated;
grant update (name) on public.collections to authenticated;

drop policy if exists collections_read_own   on public.collections;
drop policy if exists collections_insert_own on public.collections;
drop policy if exists collections_update_own on public.collections;
drop policy if exists collections_delete_own on public.collections;

create policy collections_read_own on public.collections
  for select to authenticated using (auth.uid() = owner_id);
create policy collections_insert_own on public.collections
  for insert to authenticated with check (auth.uid() = owner_id);
create policy collections_update_own on public.collections
  for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy collections_delete_own on public.collections
  for delete to authenticated using (auth.uid() = owner_id);


-- --------------------------------------------------------------------
-- 2. What is in a collection
-- --------------------------------------------------------------------

create table if not exists public.collection_items (
  id            bigint generated always as identity primary key,
  collection_id uuid not null references public.collections on delete cascade,
  kind          text not null,
  drink_id      text,
  post_id       uuid references public.posts on delete cascade,
  created_at    timestamptz not null default clock_timestamp(),
  constraint collection_items_shape check (
    (kind = 'drink' and drink_id is not null and post_id is null
       and drink_id ~ '^[a-z0-9][a-z0-9-]{0,79}$')
    or (kind = 'post' and post_id is not null and drink_id is null)
  )
);

-- Once per collection each. The app inserts and reads 23505 as "already in".
create unique index if not exists collection_items_drink_uniq
  on public.collection_items (collection_id, drink_id) where kind = 'drink';
create unique index if not exists collection_items_post_uniq
  on public.collection_items (collection_id, post_id) where kind = 'post';
-- A collection's items newest first; and the post cascade.
create index if not exists collection_items_collection_created_idx
  on public.collection_items (collection_id, created_at desc);
create index if not exists collection_items_post_idx
  on public.collection_items (post_id) where post_id is not null;

-- At most 200 per collection.
create or replace function public.guard_collection_item_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  have integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('collection_items:' || new.collection_id::text, 0));
  select count(*) into have from public.collection_items i where i.collection_id = new.collection_id;
  if have >= 200 then
    raise exception 'collection_full'
      using errcode = 'P0001',
            detail  = format('%s items; the limit is 200', have),
            hint    = 'Remove one to add another.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_collection_item_insert() from public, anon, authenticated;

drop trigger if exists collection_items_cap on public.collection_items;
create trigger collection_items_cap
  before insert on public.collection_items
  for each row execute function public.guard_collection_item_insert();

-- An item added moves its collection's updated_at (the owner may update
-- only `name`, so this runs as the definer and touches nothing else).
create or replace function public.touch_collection_on_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.collections set updated_at = now() where id = new.collection_id;
  return null;
end;
$$;
revoke all on function public.touch_collection_on_item() from public, anon, authenticated;

drop trigger if exists collection_items_touch on public.collection_items;
create trigger collection_items_touch
  after insert on public.collection_items
  for each row execute function public.touch_collection_on_item();

alter table public.collection_items enable row level security;

revoke all on public.collection_items from anon, authenticated;
grant select, delete on public.collection_items to authenticated;
grant insert (collection_id, kind, drink_id, post_id) on public.collection_items to authenticated;

drop policy if exists collection_items_read_own   on public.collection_items;
drop policy if exists collection_items_insert_own on public.collection_items;
drop policy if exists collection_items_delete_own on public.collection_items;

create policy collection_items_read_own on public.collection_items
  for select to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = auth.uid()));

-- Only into your own collection, and a post only if you can see it
-- (posts_read already hides anyone you are blocked with, either way).
create policy collection_items_insert_own on public.collection_items
  for insert to authenticated
  with check (
    exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = auth.uid())
    and (kind = 'drink' or exists (select 1 from public.posts p where p.id = post_id))
  );

create policy collection_items_delete_own on public.collection_items
  for delete to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = auth.uid()));


-- --------------------------------------------------------------------
-- 3. Sharing
-- --------------------------------------------------------------------

-- Turn the link on. Idempotent: a collection already shared keeps its id.
-- Refuses a name the content filter catches, since a link makes it public.
create or replace function public.share_collection(p_collection uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_name  text;
  v_share uuid;
begin
  select c.owner_id, c.name, c.share_id into v_owner, v_name, v_share
  from public.collections c where c.id = p_collection
  for update;
  if v_owner is null or v_owner is distinct from auth.uid() then
    raise exception 'collection_not_found' using errcode = 'P0002';
  end if;
  if v_share is not null then return v_share; end if;
  if public.is_objectionable(v_name) then
    raise exception 'collection_name_objectionable' using errcode = 'P0001',
      hint = 'Rename the collection to share it.';
  end if;
  v_share := gen_random_uuid();
  update public.collections
     set share_id = v_share, visibility = 'link', shared_at = now()
   where id = p_collection;
  return v_share;
end;
$$;
revoke all on function public.share_collection(uuid) from public, anon;
grant execute on function public.share_collection(uuid) to authenticated;

-- Turn it off. The share id is thrown away: the old link never answers again.
create or replace function public.unshare_collection(p_collection uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.collections
     set share_id = null, visibility = 'private', shared_at = null
   where id = p_collection and owner_id = auth.uid();
  if not found then
    raise exception 'collection_not_found' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.unshare_collection(uuid) from public, anon;
grant execute on function public.unshare_collection(uuid) to authenticated;

-- What a link shows, or null. For anon (the web page) and signed in (the
-- app). Null for an unknown or switched-off id, and for a signed-in caller
-- blocked with the owner either way, so a block hides a link like a profile.
--   { name, owner, mine, collection_id (only when mine), drinks, posts,
--     items: [{ kind, drink_id, post_id (signed in, not blocked), at }] }
-- A post item's drink_id is the drink the post shows.
create or replace function public.get_shared_collection(p_share uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select c.id, c.owner_id, c.name, p.username
    from public.collections c
    join public.profiles p on p.id = c.owner_id
    where c.share_id = p_share and c.visibility = 'link'
      and (auth.uid() is null
           or not (c.owner_id = any ((select private.my_block_set())::uuid[])))
  ),
  it as (
    select i.kind, i.created_at,
           coalesce(i.drink_id, po.drink_id) as drink_id,
           case when i.kind = 'post' and auth.uid() is not null
                     and not (po.author_id = any ((select private.my_block_set())::uuid[]))
                then i.post_id end as post_id
    from c
    join public.collection_items i on i.collection_id = c.id
    left join public.posts po on po.id = i.post_id
    where i.kind = 'drink' or po.id is not null
    order by i.created_at desc
    limit 200
  )
  select case when not exists (select 1 from c) then null else jsonb_build_object(
    'name',  (select name from c),
    'owner', (select username from c),
    'mine',  coalesce((select owner_id from c) = auth.uid(), false),
    'collection_id', case when (select owner_id from c) = auth.uid() then (select id from c) end,
    'drinks', (select count(*) from it where kind = 'drink'),
    'posts',  (select count(*) from it where kind = 'post'),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                 'kind', kind, 'drink_id', drink_id, 'post_id', post_id, 'at', created_at)
               order by created_at desc) from it), '[]'::jsonb)
  ) end;
$$;
revoke all on function public.get_shared_collection(uuid) from public;
grant execute on function public.get_shared_collection(uuid) to anon, authenticated;

-- "Save collection": a private copy for the caller, same name, the drinks,
-- and the posts the caller can see. The caps apply (the triggers fire).
-- Returns the new collection's id. The app then saves each item into the
-- caller's All saved through its usual paths (the phone-first taste store
-- for drinks, savePost for posts), which keeps "in a collection ⇒ saved".
create or replace function public.copy_shared_collection(p_share uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src  record;
  v_new  uuid;
  v_me   uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select c.id, c.owner_id, c.name into v_src
  from public.collections c
  where c.share_id = p_share and c.visibility = 'link'
    and not (c.owner_id = any ((select private.my_block_set())::uuid[]));
  if not found then
    raise exception 'collection_not_found' using errcode = 'P0002';
  end if;
  insert into public.collections (owner_id, name) values (v_me, v_src.name) returning id into v_new;
  insert into public.collection_items (collection_id, kind, drink_id, post_id, created_at)
  select v_new, i.kind, i.drink_id, i.post_id, i.created_at
  from public.collection_items i
  left join public.posts po on po.id = i.post_id
  where i.collection_id = v_src.id
    and (i.kind = 'drink'
         or (po.id is not null and not (po.author_id = any ((select private.my_block_set())::uuid[]))))
  order by i.created_at;
  return v_new;
end;
$$;
revoke all on function public.copy_shared_collection(uuid) from public, anon;
grant execute on function public.copy_shared_collection(uuid) to authenticated;


-- --------------------------------------------------------------------
-- 4. Unsaving takes a thing out of your collections
-- --------------------------------------------------------------------

create or replace function public.leave_collections_on_unsave_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.collection_items i
  using public.collections c
  where c.id = i.collection_id and c.owner_id = old.user_id
    and i.kind = 'post' and i.post_id = old.post_id;
  return null;
end;
$$;
revoke all on function public.leave_collections_on_unsave_post() from public, anon, authenticated;

drop trigger if exists saves_leave_collections on public.saves;
create trigger saves_leave_collections
  after delete on public.saves
  for each row execute function public.leave_collections_on_unsave_post();

create or replace function public.leave_collections_on_unsave_drink()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.collection_items i
  using public.collections c
  where c.id = i.collection_id and c.owner_id = old.user_id
    and i.kind = 'drink' and i.drink_id = old.drink_id;
  return null;
end;
$$;
revoke all on function public.leave_collections_on_unsave_drink() from public, anon, authenticated;

drop trigger if exists want_to_try_leave_collections on public.want_to_try;
create trigger want_to_try_leave_collections
  after delete on public.want_to_try
  for each row execute function public.leave_collections_on_unsave_drink();


insert into public.schema_migrations (version)
values ('023_collections') on conflict (version) do nothing;
