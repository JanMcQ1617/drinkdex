-- ====================================================================
-- 010 — Profile pictures
--
-- Adds one nullable column. Everything else this feature needs already
-- exists, which is the reason it is only one column.
--
-- STORAGE REUSES THE `pours` BUCKET, deliberately, rather than adding an
-- `avatars` one. Three things already hold for `pours/<uid>/…` and would
-- all have to be rebuilt and kept in step for a second bucket:
--
--   * pours_insert_own / pours_delete_own check
--     (storage.foldername(name))[1] = auth.uid()::text, so a user can
--     only write and remove objects under their own prefix.
--   * pours_read grants select to `authenticated`, which is exactly the
--     audience for an avatar — the app has no anonymous browsing.
--   * delete_own_account() in 005 deletes EVERY object in `pours` under
--     the user's prefix. An avatar stored there is therefore already
--     covered by account deletion, and the privacy policy's promise that
--     deletion removes your photos stays true without touching that
--     function.
--
-- A separate bucket would mean three new policies plus an edit to the
-- deletion function, and the failure mode of forgetting the last one is
-- avatars outliving deleted accounts — the precise thing 005 exists to
-- prevent. The cost is that one bucket holds two kinds of image, which is
-- a naming inconvenience rather than a correctness problem.
--
-- The column stores the object PATH, not a URL. The bucket is private, so
-- every read is a short-lived signed URL minted on demand; storing a URL
-- would persist something that expires in an hour.
-- ====================================================================

alter table public.profiles
  add column if not exists avatar_path text;

-- Belt and braces against a client writing a full URL or an oversized
-- key. Paths are `<uid>/<file>` and the uid alone is 36 characters.
alter table public.profiles
  drop constraint if exists profiles_avatar_path_len;
alter table public.profiles
  add constraint profiles_avatar_path_len
  check (avatar_path is null or char_length(avatar_path) <= 200) not valid;

comment on column public.profiles.avatar_path is
  'Object path in the private `pours` bucket, `<uid>/<file>`. Null means '
  'fall back to initials on the accent colour. Read through a signed URL.';

-- --------------------------------------------------------------------
-- The two discovery RPCs return a fixed column list, so they have to be
-- taught about the new one or every person found by contact or Instagram
-- match renders as initials while the rest of the app shows faces.
--
-- DROP then CREATE, not CREATE OR REPLACE: Postgres refuses to change a
-- function's return type in place, and adding a column to a `returns
-- table` is exactly that. The grants go with the old function, so they
-- are reissued below — forgetting them is how these silently start
-- failing with "permission denied for function" for every signed-in user.
-- --------------------------------------------------------------------

drop function if exists public.match_contacts(text[]);

create function public.match_contacts(hashes text[])
returns table (
  id uuid,
  username text,
  display_name text,
  accent text,
  bio text,
  avatar_path text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select p.id, p.username, p.display_name, p.accent, p.bio, p.avatar_path, p.created_at
  from public.profiles p
  join public.profile_secrets s on s.user_id = p.id
  where s.phone_hash = any(hashes)
    and p.id <> auth.uid()
    and not public.blocked_with(p.id)
  limit 500;
$$;

revoke all on function public.match_contacts(text[]) from public, anon;
grant execute on function public.match_contacts(text[]) to authenticated;

drop function if exists public.match_instagram(text[]);

create function public.match_instagram(hashes text[])
returns table (
  id uuid,
  username text,
  display_name text,
  accent text,
  bio text,
  avatar_path text,
  created_at timestamptz,
  -- Echoed back so the client can label the row with the handle it came
  -- from without the server ever learning it. Unchanged from 008.
  matched_hash text
)
language sql
security definer
set search_path = ''
stable
as $$
  select p.id, p.username, p.display_name, p.accent, p.bio, p.avatar_path,
         p.created_at, s.instagram_hash
  from public.profiles p
  join public.profile_secrets s on s.user_id = p.id
  where s.instagram_hash = any(hashes)
    and p.id <> auth.uid()
    and not public.blocked_with(p.id)
  limit 500;
$$;

revoke all on function public.match_instagram(text[]) from public, anon;
grant execute on function public.match_instagram(text[]) to authenticated;

insert into public.schema_migrations (version)
values ('010_profile_avatar') on conflict (version) do nothing;
