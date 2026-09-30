-- ====================================================================
-- Clink — in-app account deletion
--
-- SUPERSEDED BY 011. Do not re-run this file: it would put back the
-- storage delete below, which fails for every user on a current Supabase
-- project. The reasoning about why storage needs handling still stands;
-- the way it was handled here did not work.
--
-- Apple requires any app offering account creation to offer account
-- DELETION from inside the app (App Store guideline 5.1.1(v)), and an
-- account that cannot be deleted is a real problem regardless of what
-- Apple thinks. Clink had signup and no way out.
--
-- Row data already cascades: every table referencing profiles or
-- auth.users does so ON DELETE CASCADE, so removing the auth user takes
-- profiles, posts, likes and follows with it.
--
-- STORAGE DOES NOT. storage.objects has no foreign key to profiles — it
-- is namespaced by a path convention (pours/<uid>/<file>), not by a
-- constraint. Deleting an account without this function would leave
-- every photo that account ever uploaded sitting in the bucket forever,
-- which is both a privacy failure and exactly what the deletion
-- requirement exists to prevent. The photo delete is therefore FIRST and
-- explicit.
--
-- That delete was the mistake. A SQL DELETE on storage.objects removes only
-- the metadata row and orphans the file, and Supabase Storage now refuses
-- it outright with a statement-level trigger, so this function raised for
-- every caller and no account could be deleted. Since 011 the client
-- empties the folder through the Storage API and the function only checks
-- that nothing is left.
-- ====================================================================

create or replace function public.delete_own_account()
returns void
language plpgsql
-- security definer so the caller can remove their own auth.users row,
-- which the `authenticated` role cannot touch directly. search_path is
-- pinned to empty per Supabase's linter guidance: an unpinned
-- search_path on a definer function is a privilege-escalation vector.
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  -- Never trust the caller for identity. auth.uid() is the only source,
  -- so this function cannot be aimed at another account no matter what
  -- it is passed — it takes no arguments precisely so it cannot be.
  if uid is null then
    raise exception 'Not signed in';
  end if;

  -- Photos first: no cascade covers these, and if the auth row went
  -- first we would lose the only handle on which objects were theirs.
  -- (Never worked: see the header. 011 replaces this with a check.)
  delete from storage.objects
  where bucket_id = 'pours'
    and (storage.foldername(name))[1] = uid::text;

  -- Cascades to public.profiles, and from there to posts, likes and
  -- follows in both directions.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('005_account_deletion') on conflict (version) do nothing;
