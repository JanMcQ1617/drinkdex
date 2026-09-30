-- ====================================================================
-- Sipply — migration 014: bound the last open columns, and two indexes
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- WHAT IT FIXES
--
-- 1. 003 set out to bound every column a hostile client can write, and
--    missed three: posts.drink_id, posts.photo_path and post_photos.path
--    had no length limit at all. A followed account could fill a hundred
--    posts with megabyte-long drink ids and every follower's feed request
--    would download them.
--
-- 2. Nothing tied a photo path to the account that owns it. A client could
--    attach another user's object as its own post photo or avatar without
--    re-uploading it. That exposes nothing new (the bucket is readable to
--    every account not blocked, 011), so this is defence in depth, but it
--    means a post's photos and a profile's avatar are always files that
--    account uploaded, which is what account deletion and moderation both
--    assume.
--
-- 3. likes had no index leading with user_id. "Which of these posts have I
--    liked" and the account-deletion cascade both filter on it, and both
--    scanned the whole table. And fetchPeople orders every profile by
--    created_at with nothing to read that order from.
--
-- All constraints are NOT VALID, exactly as in 003: enforced on every
-- INSERT and UPDATE from now on, without checking rows that already exist.
-- Postgres DOES check them when an existing row is updated, which is why
-- drink_id gets a length bound and not a shape: posts for the beer and
-- wine removed on 20 Sep 2026 still exist, with ids up to 58 characters
-- ('...-australia-wn'), and a shape rule they failed would lock those rows
-- against any update. 100 leaves room for every id the Dex has ever used.
--
-- ORDER
--
-- Any time after 011.
--
-- VALIDATE LATER, like 004 did for 003. An error names a row to fix first,
-- and nothing is written:
--
--   alter table public.posts       validate constraint posts_drink_id_len;
--   alter table public.posts       validate constraint posts_photo_path_owned;
--   alter table public.post_photos validate constraint post_photos_path_len;
--   alter table public.profiles    validate constraint profiles_avatar_path_owned;
--
-- VERIFY AFTERWARDS (read-only)
--
--   -- Rows the new rules would refuse. Expect none.
--   select id, drink_id from public.posts where char_length(drink_id) not between 1 and 100;
--   select id, photo_path from public.posts
--   where photo_path is not null
--     and (char_length(photo_path) > 200 or split_part(photo_path, '/', 1) <> author_id::text);
--   select id, path from public.post_photos where char_length(path) > 200;
--   select id, avatar_path from public.profiles
--   where avatar_path is not null and split_part(avatar_path, '/', 1) <> id::text;
--
--   -- Expect likes_user_idx and profiles_created_idx, and no likes_post_idx.
--   select indexname from pg_indexes
--   where schemaname = 'public' and tablename in ('likes', 'profiles')
--   order by indexname;
-- ====================================================================


-- --------------------------------------------------------------------
-- 1. Lengths
-- --------------------------------------------------------------------

alter table public.posts drop constraint if exists posts_drink_id_len;
alter table public.posts
  add constraint posts_drink_id_len
  check (char_length(drink_id) between 1 and 100) not valid;

alter table public.post_photos drop constraint if exists post_photos_path_len;
alter table public.post_photos
  add constraint post_photos_path_len
  check (char_length(path) <= 200) not valid;


-- --------------------------------------------------------------------
-- 2. A path belongs to the account whose folder it is in
--
-- Paths are <uid>/<file> (pours_insert_own already confines uploads to
-- that folder), so the first segment has to be the owner. Compared as
-- text, which cannot throw the way a cast to uuid would.
--
-- posts.photo_path is normally written by sync_post_preview (007) from
-- post_photos, which the policy below now checks; the constraint covers a
-- client writing it directly through posts_update_own. It also carries
-- the length bound, since both are about what that column may hold.
-- --------------------------------------------------------------------

alter table public.posts drop constraint if exists posts_photo_path_owned;
alter table public.posts
  add constraint posts_photo_path_owned
  check (
    photo_path is null
    or (char_length(photo_path) <= 200 and split_part(photo_path, '/', 1) = author_id::text)
  ) not valid;

-- 010 already bounds avatar_path at 200 characters.
alter table public.profiles drop constraint if exists profiles_avatar_path_owned;
alter table public.profiles
  add constraint profiles_avatar_path_owned
  check (avatar_path is null or split_part(avatar_path, '/', 1) = id::text) not valid;

-- post_photos has no author column to put in a CHECK, so the rule goes in
-- the insert policy, next to the existing "your own post" test. There is
-- no update policy, so insert is the only way a path gets in.
drop policy if exists post_photos_insert_own on public.post_photos;
create policy post_photos_insert_own on public.post_photos
  for insert to authenticated with check (
    split_part(path, '/', 1) = auth.uid()::text
    and exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  );


-- --------------------------------------------------------------------
-- 3. Indexes
-- --------------------------------------------------------------------

-- (user_id, post_id) answers "which of these posts have I liked" from the
-- index alone, and serves the user_id side of the delete cascade.
create index if not exists likes_user_idx on public.likes (user_id, post_id);

-- likes_post_idx duplicated the leading column of the primary key
-- (post_id, user_id), which already serves every lookup by post. It only
-- cost a second write on every like.
drop index if exists public.likes_post_idx;

-- fetchPeople: newest two hundred profiles.
create index if not exists profiles_created_idx on public.profiles (created_at desc);


-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('014_bounds_and_indexes') on conflict (version) do nothing;
