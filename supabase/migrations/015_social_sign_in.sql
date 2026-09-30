-- ====================================================================
-- Sipply — migration 015: Sign in with Apple and Continue with Facebook
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- WHAT IT ADDS
--
--   1. match_facebook_friends(fb_ids text[]): the signed-in person's
--      Facebook friends who are on Sipply, found by the app-scoped ids
--      Facebook returned to the app. Same columns back as match_contacts.
--   2. handle_new_user gives an account made by Apple or Facebook a real
--      name when the provider sent one, and a handle that steps past a
--      clash instead of failing on it.
--      Before this, every such account was 'New collector', and a
--      generated handle that met an existing one failed the sign-in.
--
-- ORDER
--
-- Apply after 011, which it depends on: section 2 calls
-- public.is_objectionable, and the check below stops the file at its first
-- statement if that is missing, so nothing is half-applied and sign-up is
-- never pointed at a function that does not exist. Independent of 012-014.
--
-- Apply BEFORE a build with Continue with Facebook or Sign in with Apple
-- reaches anyone. Without section 1 the Facebook friends list fails with
-- PGRST202; without section 2 every Facebook account starts as 'New
-- collector'.
--
-- Installed builds 8 and 9 notice nothing. They sign up by email only,
-- which sends a handle and a name, and those take the same path as before.
--
-- ALSO DO BY HAND (dashboard and Meta, not SQL)
--
--   * Authentication -> Sign In / Providers -> Facebook: on, with the Meta
--     app's App ID and App Secret, and the callback URL that page shows
--     added to the Meta app's Valid OAuth Redirect URIs. The app must read
--     friends with a token from this SAME Meta app. App-scoped ids are
--     issued per app, so ids from any other app match nobody, silently.
--   * Authentication -> URL Configuration -> Redirect URLs: add
--     drinkdex://auth/callback. Without it GoTrue sends the browser to the
--     Site URL and Continue with Facebook never returns to the app.
--   * Authentication -> Sign In / Providers -> Apple: on, with
--     com.janmcqueeny.drinkdex among the Client IDs, so the identity token
--     the phone receives is accepted.
--   * Authentication -> Sign In / Providers: "Allow manual linking" on, if
--     Connect Facebook on an existing email account links the identity
--     (supabase.auth.linkIdentity). Without it that call fails, and such
--     an account never has the Facebook identity section 1 matches on.
--   * Meta developer app: user_friends needs App Review before anyone
--     outside the app's own roles gets a friend list, and Meta asks for a
--     data deletion URL: https://janmcq1617.github.io/drinkdex/data-deletion
--     (docs/data-deletion.md — live only once docs/ is merged to main).
--
-- NOT IN THIS FILE
--
--   Apple requires an app that offers Sign in with Apple to revoke the
--   user's Apple tokens when the account is deleted. delete_own_account
--   (011) removes the auth user and, by cascade, its Apple identity row,
--   but revoking means calling Apple with a client secret signed by the
--   app's Sign in with Apple key, which does not belong in SQL. It needs
--   an Edge Function.
--
-- VERIFY AFTERWARDS (all read-only)
--
--   -- 1. Expect: fb_ids text[] | TABLE(id uuid, username text, ...,
--   --    created_at timestamp with time zone) | s
--   select pg_get_function_arguments(p.oid), pg_get_function_result(p.oid), p.provolatile
--   from pg_proc p where p.proname = 'match_facebook_friends'
--     and p.pronamespace = 'public'::regnamespace;
--
--   -- 1. Expect false, true.
--   select has_function_privilege('anon', 'public.match_facebook_friends(text[])', 'execute'),
--          has_function_privilege('authenticated', 'public.match_facebook_friends(text[])', 'execute');
--
--   -- 1. What the matcher can see. The SQL editor runs as the function's
--   --    owner, so this is its view exactly. Once anyone has used Continue
--   --    with Facebook, expect a 'facebook' row whose two counts are equal
--   --    (Graph ids are all digits). No 'facebook' row after someone has
--   --    signed in that way means the matcher is blind.
--   select provider, count(*), count(*) filter (where provider_id ~ '^[0-9]+$') as numeric_ids
--   from auth.identities group by provider order by provider;
--
--   -- 1. Smoke test as a real account, rolled back. Paste a user id,
--   --    ideally of an account that has signed in with Facebook: for any
--   --    other account the function returns before its final query, so
--   --    only the guards are tested. Expect "Success. No rows returned";
--   --    anything else raises and says what it got. The checks sit in one
--   --    block because the editor shows only the last statement's result,
--   --    and because a bare too_many_ids would abort the transaction
--   --    before the rollback.
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     json_build_object('sub', '<your user id>', 'role', 'authenticated')::text, true);
--   do $$
--   declare n integer;
--   begin
--     select count(*) into n from public.match_facebook_friends(array['0']);
--     if n <> 0 then raise exception 'expected 0 rows for id 0, got %', n; end if;
--     begin
--       perform public.match_facebook_friends(array_fill('0'::text, array[5001]));
--       raise exception '5001 ids were accepted; expected too_many_ids';
--     exception when invalid_parameter_value then
--       if sqlerrm <> 'too_many_ids' then raise; end if;
--     end;
--   end;
--   $$;
--   rollback;
--
--   -- 2. Expect true, and on_auth_user_created still attached.
--   select prosrc ilike '%full_name%'
--   from pg_proc where oid = 'public.handle_new_user()'::regprocedure;
--   select tgname from pg_trigger
--   where tgrelid = 'auth.users'::regclass and not tgisinternal;
-- ====================================================================


-- --------------------------------------------------------------------
-- 0. Stop here unless 011 is applied
--
-- Section 2 calls public.is_objectionable for any sign-up that arrives
-- without a handle or a name, which is every Apple and Facebook sign-up.
-- PL/pgSQL resolves a call only when it first runs, so without this check
-- the file would apply cleanly on a database without 011 and then fail
-- each of those sign-ins with a bare 500. Email sign-ups send both, never
-- reach the call, and would go on working, which would hide the fault
-- until the first social sign-in. The SQL editor runs the script as one
-- transaction, so raising here leaves the database untouched.
-- --------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.is_objectionable(text, boolean)') is null then
    raise exception '015 needs 011 applied first: public.is_objectionable(text, boolean) is missing';
  end if;
end;
$$;


-- --------------------------------------------------------------------
-- 1. Facebook friends who are on Sipply
--
-- Continue with Facebook asks for user_friends. With it, Graph's
-- /me/friends lists the person's Facebook friends who also use Sipply and
-- granted user_friends too, each as an app-scoped id: a number Facebook
-- issues per app, the same for that person every time this app asks.
-- Supabase stores that same id as provider_id on the person's 'facebook'
-- row in auth.identities when they sign in through the same Meta app. So
-- the match is against identities the auth server verified with Facebook,
-- not against anything a client wrote: nobody can claim another person's
-- Facebook account the way anyone can type another person's number.
--
-- Not metered, unlike the matchers in 011. Those guard spaces anyone can
-- walk: every Puerto Rico number can be hashed offline with the salt from
-- the app bundle, and a large share of them belong to someone. An
-- app-scoped id is not derived from anything public, and the one place a
-- client learns someone else's is its own friend list. Guessing instead
-- means drawing from Facebook's whole id space, where Sipply's handful of
-- ids are too sparse to hit, and a hit would pair a public profile with a
-- number that means nothing outside this Meta app. A real match tells the
-- caller what Facebook already told them, that this friend uses Sipply,
-- and adds only which profile is theirs. The cap is per call, at 5,000,
-- Facebook's own limit on friends, so one call carries a whole list and a
-- runaway client stops there.
--
-- Only for callers with a Facebook identity of their own. An account that
-- never connected Facebook has no friend list to send, so the only way
-- here without one is a hand-rolled request. It gets no rows rather than
-- an error: the same answer as a list with nobody on Sipply, which gives
-- such a request nothing to learn from.
--
-- Otherwise the rules of match_contacts: never the caller, never anyone
-- blocked either way, and the same columns back, so the app maps both the
-- same way. It never returns a Facebook id, and it stores nothing: not
-- the list, and not a count.
--
-- STABLE, because it only reads. Each id matches at most one identity,
-- since auth.identities is unique on (provider_id, provider), so the
-- answer is bounded by the cap without a LIMIT.
-- --------------------------------------------------------------------

create or replace function public.match_facebook_friends(fb_ids text[])
returns table (
  id uuid,
  username text,
  display_name text,
  accent text,
  bio text,
  avatar_path text,
  created_at timestamptz
)
language plpgsql
stable
-- security definer to read auth.identities, which no client role can.
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  wanted text[];
begin
  if me is null then
    raise exception 'not signed in: match_facebook_friends got no auth.uid()' using errcode = '28000';
  end if;

  if coalesce(cardinality(fb_ids), 0) > 5000 then
    raise exception 'too_many_ids'
      using errcode = '22023',
            detail  = 'At most 5000 Facebook ids per call.';
  end if;

  if not exists (
    select 1 from auth.identities i
    where i.user_id = me
      and i.provider = 'facebook'
  ) then
    return;
  end if;

  select coalesce(array_agg(distinct f.v), '{}') into wanted
  from unnest(fb_ids) as f(v)
  where f.v is not null;

  if cardinality(wanted) = 0 then
    return;
  end if;

  return query
    select p.id, p.username, p.display_name, p.accent, p.bio, p.avatar_path, p.created_at
    from auth.identities i
    join public.profiles p on p.id = i.user_id
    where i.provider = 'facebook'
      and i.provider_id = any(wanted)
      and p.id <> me
      and not public.blocked_with(p.id);
end;
$$;

revoke all on function public.match_facebook_friends(text[]) from public, anon;
grant execute on function public.match_facebook_friends(text[]) to authenticated;


-- --------------------------------------------------------------------
-- 2. A name and a handle for accounts made by Apple or Facebook
--
-- Supersedes handle_new_user from the base schema. An email sign-up sends
-- username and display_name in the user metadata, and the trigger has
-- always used them. Sign in with Apple and Continue with Facebook send
-- neither, so every such account started as 'New collector' with a pour_
-- handle, and a Facebook friends list where everyone is 'New collector'
-- tells nobody whom they are about to follow.
--
-- THE NAME. Facebook's sign-in puts the person's name in the metadata, as
-- full_name and as name, so the trigger starts from it. Apple's identity
-- token carries no name at all: Apple hands it to the app once, on the
-- first sign-in, so an Apple account still starts as 'New collector'
-- until the app saves the name it was given.
--
-- A provider's name is shaped to fit rather than refused. The person never
-- typed it and has no form to fix it in, and anything this trigger raises
-- fails the whole sign-in with a bare 500 from GoTrue (see
-- is_objectionable in 011). So whitespace is collapsed, it is cut to the
-- 40 characters profiles_display_name_len allows, and it becomes 'New
-- collector' when nothing is left or the content filter would refuse it.
-- Either way it can be changed in Edit profile.
--
-- A name or handle the user did type, at email sign-up, takes the same
-- path as before: inserted as sent, and refused by the constraints and the
-- filter trigger if it breaks them. The sign-up form screens both first
-- and reads that 500 as "That username is taken", so quietly repairing it
-- here would hand the user an account with a handle they never chose.
--
-- THE HANDLE. 'pour_' and the first 8 hex digits of the user id, as
-- before. That is 32 bits, so two accounts meeting there is a matter of
-- time once most sign-ups are social, and a clash was a unique violation
-- that failed the sign-in. Now a handle that is taken, or that the
-- content filter would refuse, moves one digit along the id and takes the
-- next 8, through the 25 windows the 32 digits hold. Moving, not growing:
-- a filter hit is a word spelled inside the digits (5 reads as s, 7 as t,
-- and usernames are matched glued together), so a longer handle would
-- still contain it. Only if all 25 fail does the insert raise, as every
-- clash did before.
-- --------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta   jsonb   := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  hex    text    := replace(new.id::text, '-', '');
  handle text    := nullif(meta ->> 'username', '');
  shown  text    := nullif(meta ->> 'display_name', '');
  pos    integer := 1;
begin
  if handle is null then
    handle := 'pour_' || substr(hex, pos, 8);
    while pos < 25
      and (exists (select 1 from public.profiles p where p.username = handle)
           or public.is_objectionable(handle, true))
    loop
      pos := pos + 1;
      handle := 'pour_' || substr(hex, pos, 8);
    end loop;
  end if;

  if shown is null then
    shown := btrim(left(btrim(regexp_replace(
               coalesce(nullif(meta ->> 'full_name', ''), nullif(meta ->> 'name', ''), ''),
               '\s+', ' ', 'g')), 40));
    if shown = '' or public.is_objectionable(shown) then
      shown := 'New collector';
    end if;
  end if;

  insert into public.profiles (id, username, display_name, accent)
  values (new.id, handle, shown, coalesce(nullif(meta ->> 'accent', ''), '#633444'));
  return new;
end;
$$;


-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('015_social_sign_in') on conflict (version) do nothing;
