-- ====================================================================
-- Clink — abuse hardening
--
-- Paste into the Supabase SQL Editor and press Run. Safe to re-run.
--
-- The ownership rules in schema.sql are sound: every write policy is
-- gated on auth.uid(). What they do NOT do is bound what an owner may
-- write. The app ships a publishable key and anyone can self-register,
-- so "authenticated" is not a meaningful barrier — every constraint
-- below assumes a hostile client talking straight to PostgREST.
--
-- Constraints are added NOT VALID so an existing row cannot block the
-- migration; they are enforced on every INSERT and UPDATE from here on.
-- Validate them once you've confirmed current data is clean:
--   alter table public.profiles validate constraint profiles_username_shape;
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Storage limits
--
-- The 'pours' bucket had no size cap and no MIME allowlist, so any
-- account was free unlimited file hosting inside its own folder —
-- the most practically exploitable gap in the schema.
-- --------------------------------------------------------------------

update storage.buckets
set
  file_size_limit = 8 * 1024 * 1024,  -- 8 MB; a phone JPEG is well under
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/heic', 'image/webp']
where id = 'pours';

-- --------------------------------------------------------------------
-- 2. Text bounds
--
-- No column had a length limit. `caption` and `bio` are free text on a
-- table any account can insert into, so both were unbounded writes.
-- --------------------------------------------------------------------

alter table public.posts
  drop constraint if exists posts_caption_len;
alter table public.posts
  add constraint posts_caption_len check (char_length(caption) <= 2000) not valid;

alter table public.profiles
  drop constraint if exists profiles_bio_len;
alter table public.profiles
  add constraint profiles_bio_len check (bio is null or char_length(bio) <= 300) not valid;

alter table public.profiles
  drop constraint if exists profiles_display_name_len;
alter table public.profiles
  add constraint profiles_display_name_len
  check (char_length(display_name) between 1 and 40) not valid;

-- --------------------------------------------------------------------
-- 3. Username shape
--
-- The client checks `length >= 3`; the database checked nothing, and
-- profiles_update_own lets an owner rewrite their username freely. That
-- combination allowed squatting and display-name impersonation via a
-- direct API call. Lowercase alphanumerics, underscore and period only,
-- which also blocks unicode lookalike homographs.
-- --------------------------------------------------------------------

alter table public.profiles
  drop constraint if exists profiles_username_shape;
alter table public.profiles
  add constraint profiles_username_shape
  check (username ~ '^[a-z0-9._]{3,24}$') not valid;

-- --------------------------------------------------------------------
-- 4. Accent must be a hex colour
--
-- accent is written straight from user_meta_data by handle_new_user and
-- is rendered as a colour. Bounding it keeps arbitrary strings out of
-- the render path.
-- --------------------------------------------------------------------

alter table public.profiles
  drop constraint if exists profiles_accent_hex;
alter table public.profiles
  add constraint profiles_accent_hex
  check (accent ~ '^#[0-9A-Fa-f]{6}$') not valid;

-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('003_hardening') on conflict (version) do nothing;
