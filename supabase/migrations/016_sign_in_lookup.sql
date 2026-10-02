-- ====================================================================
-- Sipply — migration 016: the email step's "sign in or sign up" lookup
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- WHAT IT ADDS
--
--   1. public.sign_in_lookups: a meter of lookups, one row per lookup,
--      holding a hashed caller bucket and a time. Nobody can read it.
--   2. public.sign_in_method(e): given an email address, answers 'new'
--      (no account), 'password' (an account with a password) or 'other'
--      (an account made by Apple, Google, Facebook or phone, which has no
--      password). The sign-in screen asks it after the email step, so it
--      can show "Sign in" or "Create an account" instead of a form that
--      offers both and guesses.
--
-- WHY THIS IS NOT A NEW DISCLOSURE
--
-- GoTrue's public /auth/v1/signup already tells anyone whether an email
-- has an account (user_already_exists, or, with confirmations on, a user
-- with no identities). This answers the same question, metered tighter:
-- 30 per caller IP and 1,000 overall per hour. A refused lookup is not an
-- outage: the app shows a password step that offers both sign-in and
-- sign-up.
--
-- The caller is bucketed by md5 of Cloudflare's cf-connecting-ip, never
-- the IP itself, and rows live one hour. With no such header every caller
-- shares the 'unknown' bucket and the per-IP limit degrades into the
-- overall one.
--
-- Two errors, which the app reads by message:
--   invalid_email  (22023) — not something@something, or over 254 chars;
--                            the app says the address doesn't look right
--   rate_limited   (P0001) — over either meter; the app falls back
--
-- ORDER
--
-- Independent of 012-015 (needs only 009's schema_migrations). Apply it
-- BEFORE any build with the new sign-in screen reaches anyone, whatever
-- its flags say: the email step calls this on every sign-in. Without it
-- the call fails with PGRST202 and every email sign-in takes the slower
-- fallback step. Installed builds 8-11 never call it.
--
-- ALSO DO BY HAND
--
-- Nothing for this file. Phone and Google sign-in each have their own
-- dashboard setup, needed only before their flags are turned on.
--
-- VERIFY AFTERWARDS (all read-only)
--
--   -- Expect false, false.
--   select has_table_privilege('anon', 'public.sign_in_lookups', 'select'),
--          has_table_privilege('authenticated', 'public.sign_in_lookups', 'select');
--
--   -- Expect true, true.
--   select has_function_privilege('anon', 'public.sign_in_method(text)', 'execute'),
--          has_function_privilege('authenticated', 'public.sign_in_method(text)', 'execute');
--
--   -- Expect 'new' (the editor has no request headers, so this lands in
--   -- the 'unknown' bucket). Not strictly read-only: it adds one meter row,
--   -- which expires within the hour.
--   select public.sign_in_method('nobody@example.invalid');
--
--   -- AFTER one lookup from a phone: expect a row with fell_back = false.
--   -- If every row is true, cf-connecting-ip is not reaching Postgres; the
--   -- per-IP limit is then the overall one, which is safe but coarser.
--   select bucket = md5('sipply-sign-in-lookup:unknown') as fell_back, count(*)
--   from public.sign_in_lookups group by 1;
-- ====================================================================


-- --------------------------------------------------------------------
-- 1. The meter
--
-- RLS on, every grant revoked and no policy: only the definer function
-- below writes or reads it.
-- --------------------------------------------------------------------

create table if not exists public.sign_in_lookups (
  bucket    text not null,
  looked_at timestamptz not null default now()
);
create index if not exists sign_in_lookups_time_idx   on public.sign_in_lookups (looked_at);
create index if not exists sign_in_lookups_bucket_idx on public.sign_in_lookups (bucket, looked_at);
alter table public.sign_in_lookups enable row level security;
revoke all on public.sign_in_lookups from anon, authenticated;


-- --------------------------------------------------------------------
-- 2. The lookup
--
-- One advisory lock serialises every lookup, so two callers cannot both
-- read 29 and both pass. A lookup is one indexed count and one indexed
-- read of auth.users, so the queue behind the lock is short, and the
-- overall meter caps how long it can get.
-- --------------------------------------------------------------------

create or replace function public.sign_in_method(e text)
returns text
language plpgsql
volatile                      -- it writes the meter; PostgREST runs STABLE read-only
security definer              -- reads auth.users, which no client role can
set search_path = ''
as $$
declare
  hdrs    jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  addr    text  := lower(btrim(coalesce(e, '')));
  caller  text;
  per_ip  integer;
  overall integer;
  pw      text;
begin
  if length(addr) > 254 or addr !~ '^[^@\s]+@[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  caller := md5('sipply-sign-in-lookup:' || coalesce(nullif(hdrs ->> 'cf-connecting-ip', ''), 'unknown'));

  perform pg_advisory_xact_lock(hashtextextended('sign_in_lookups', 0));
  delete from public.sign_in_lookups l where l.looked_at <= now() - interval '1 hour';
  select count(*), count(*) filter (where l.bucket = caller)
    into overall, per_ip
  from public.sign_in_lookups l;
  if per_ip >= 30 or overall >= 1000 then
    raise exception 'rate_limited' using errcode = 'P0001', hint = 'Try again later.';
  end if;
  insert into public.sign_in_lookups (bucket) values (caller);

  -- GoTrue stores emails lowercased, so equality hits its email index.
  select u.encrypted_password into pw
  from auth.users u
  where u.email = addr and u.deleted_at is null
  limit 1;

  if not found then return 'new'; end if;
  if pw is not null and pw <> '' then return 'password'; end if;   -- OAuth/phone users carry ''
  return 'other';
end;
$$;

revoke all on function public.sign_in_method(text) from public;
grant execute on function public.sign_in_method(text) to anon, authenticated;


-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('016_sign_in_lookup') on conflict (version) do nothing;
