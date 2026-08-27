-- ====================================================================
-- Clink — migration 002: friend discovery
--
-- Adds phone-contact matching and mutual invites on top of schema.sql.
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
-- ====================================================================

-- --------------------------------------------------------------------
-- Phone discoverability
--
-- Opt-in: a user who wants to be findable by contacts stores a hash of
-- their phone number, never the number itself. The hash is a salted
-- SHA-256 the client computes (see src/lib/contacts.ts); the salt is a
-- shipped constant, so this raises the cost of a reverse lookup without
-- pretending to defeat a determined brute force of a 10-digit space.
-- --------------------------------------------------------------------

alter table public.profiles add column if not exists phone_hash text;
create index if not exists profiles_phone_hash_idx on public.profiles (phone_hash);

-- Column-level lockdown: phone_hash must never come back in a normal
-- `select *`. Row RLS can't restrict a single column, so we drop the
-- column privilege — only the SECURITY DEFINER matcher below (which runs
-- as the table owner) can read it. This is why the app selects explicit
-- column lists instead of '*'.
revoke select (phone_hash) on public.profiles from anon, authenticated;

-- --------------------------------------------------------------------
-- match_contacts
--
-- The caller hashes the phone numbers in their address book and passes
-- the set here; we return the profiles that opted in with a matching
-- hash. Because the caller must already hold a hash to get a hit, this
-- confirms "is this number on Clink?" for numbers they already know —
-- it cannot enumerate the column or reverse anyone else's number.
-- --------------------------------------------------------------------

create or replace function public.match_contacts(hashes text[])
returns table (
  id uuid,
  username text,
  display_name text,
  accent text,
  bio text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.accent, p.bio, p.created_at
  from public.profiles p
  where p.phone_hash = any(hashes)
    and p.id <> auth.uid()
  limit 500;
$$;

revoke all on function public.match_contacts(text[]) from public;
grant execute on function public.match_contacts(text[]) to authenticated;

-- --------------------------------------------------------------------
-- accept_invite
--
-- Turns an invite link into a mutual follow: the caller follows the
-- inviter AND the inviter follows the caller, so both feeds light up.
-- SECURITY DEFINER because the reciprocal edge (inviter -> caller) is one
-- the caller is forbidden to insert under the follows RLS policy.
-- --------------------------------------------------------------------

create or replace function public.accept_invite(inviter uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Ignore self-invites and missing inviters.
  if inviter is null or inviter = auth.uid() then
    return;
  end if;
  -- And an inviter that isn't a real profile.
  if not exists (select 1 from public.profiles where id = inviter) then
    return;
  end if;

  insert into public.follows (follower_id, following_id)
  values (auth.uid(), inviter)
  on conflict do nothing;

  insert into public.follows (follower_id, following_id)
  values (inviter, auth.uid())
  on conflict do nothing;
end;
$$;

revoke all on function public.accept_invite(uuid) from public;
grant execute on function public.accept_invite(uuid) to authenticated;

-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('002_social_graph') on conflict (version) do nothing;
