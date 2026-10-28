-- ====================================================================
-- Sipply — migration 027: push notifications from other people
--
-- For specs/v4.9/push.md, the shape specs/v4.3/spec.md §2.5 planned
-- before the Apple push key existed. supabase/schema.sql holds the same
-- objects.
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- READ, NOT RUN. Like 021 to 026, nothing here has been executed: the
-- machine it was written on has no psql, postgres, docker or supabase CLI.
-- It was proven by reading every statement against supabase/schema.sql's
-- real names: profiles (id, username), posts (id, author_id), post_tags
-- (post_id, tagged_id, created_at), follows (follower_id, following_id,
-- created_at, pinned by follows_pin_created_at), tournaments (id, host_id,
-- name, finished_at, finalized_at), tournament_members (tournament_id,
-- user_id, status, invited_at), blocks (blocker_id, blocked_id), 013's
-- pg_net pattern, Vault (vault.secrets, vault.decrypted_secrets,
-- vault.create_secret) and schema_migrations (009). The first real run is
-- Jan's: run the VERIFY block right after it.
--
-- WHAT IT ADDS
--
--   1. public.push_tokens: the address Apple's Push Notification service
--      needs to reach one phone, per signed-in account, with the APNs
--      environment it belongs to ('production' for TestFlight and the App
--      Store, 'sandbox' for a development build). One token is one phone:
--      the same token from a second account moves to it. At most five per
--      account; the oldest beyond that go. Owner-only reads; every write
--      goes through the two RPCs below.
--   2. public.push_settings: three switches per ACCOUNT, all on until
--      changed: tags (someone tags you in a post), invites (someone
--      invites you to a tournament) and follows (someone starts following
--      you). No row means all three on.
--   3. RPCs for the app: register_push_token, unregister_push_token,
--      my_push_settings, set_push_setting.
--   4. Three AFTER INSERT triggers, on post_tags, tournament_members (an
--      'invited' row, never the host's own) and follows, that queue one
--      call to the `push` Edge Function through pg_net with a shared
--      secret header, 013's pattern.
--   5. private.push_ledger: one row per event that was pushed, so nothing
--      is pushed twice; private.push_pair: when one person last notified
--      another of a tag, or of an invite, so nobody can send someone a
--      stream of them; and the three service_role-only RPCs the function
--      calls: push_caller_ok (is this our trigger's secret?), push_claim
--      (did this really happen, may it be sent, and to which phones;
--      written to the ledger in the same step) and push_release (Apple
--      refused it outright: give the claim back).
--   6. The shared secret itself, made here in Vault if absent, so nobody
--      ever types or sees it; and the function's address, kept in Vault
--      beside it.
--
-- WHAT A FORGED CALL CAN DO: NOTHING NEW. The function's "Verify JWT"
-- switch is OFF, because pg_net's call carries no user's session, so
-- anyone can reach its URL. It therefore checks the caller itself: the
-- x-sipply-push header must match the Vault secret (push_caller_ok,
-- callable by service_role alone, compares digests, never the text).
-- And even a caller holding the secret can only push what push_claim
-- allows: the event's row must still exist (the tag, the invite still
-- 'invited', the follow), be less than an hour old, involve nobody
-- blocked either way, have the recipient's switch on, never have been
-- pushed before, and (a tag or an invite) be the first from that person
-- to that person in the hour. The ledger row is written in the same
-- statement that answers 'send', under its primary key, so two calls
-- racing for one event get one 'send' and one 'duplicate'; the pair's
-- row is taken the same way, so two racing events between the same two
-- people get one 'send' and one 'limited'.
--
-- RATE LIMITS. The ledger's key (kind, subject, recipient) makes each
-- event go out once:
--   follow  one push per follower and followed person, ever (subject is
--           the follower), so unfollowing and following again is silent;
--   tag     one per post and person;
--   invite  one per tournament and person.
-- Tag and invite rows go with their post or tournament; follow rows stay
-- until either account is deleted, which is what "ever" needs. That alone
-- would let one person flood another: post, tag, delete the post, again,
-- or host, invite, delete the tournament, again (create_tournament's caps
-- count surviving tournaments only), each a new event. So push_pair keys
-- (kind, actor, recipient), never cascades from a post or a tournament,
-- and allows one tag push and one invite push an hour from the same
-- person to the same person; the rest answer 'limited' and still show in
-- Activity. Follows need no pair row: their ledger key is the pair. Each
-- row names the two people and when, never any words.
--
-- GIVEN BACK ONLY WHEN APPLE REFUSED IT. A claimed event is spent (never
-- twice beats at least once) unless no phone can have shown it: Apple
-- answered for every phone and accepted none (a refused provider token,
-- for a wrong Key ID, Team ID or key; a dead token; any other refusal).
-- Then the function calls push_release, which deletes that claim's
-- ledger row and the pair hour it took, so the next such event, once the
-- fault is fixed, pushes (for a follow, unfollowing and following again).
-- A phone Apple never answered may have shown it, so that keeps it spent.
--
-- FAILURE IS A WARNING, NEVER A REFUSED INSERT. Every trigger catches
-- everything and raises a warning: a tag, an invite or a follow always
-- commits, pushed or not. pg_net queues the call inside the transaction
-- and sends it after commit, so a rolled-back create_tournament (its
-- 'no_invitees') pushes nothing.
--
-- INERT UNTIL CONFIGURED. Nothing is queued for anyone with no token, and
-- only build 34 registers tokens. Until the function is deployed the
-- calls answer 404; until its APNS_KEY and APNS_KEY_ID secrets exist it
-- answers 503 not_configured BEFORE claiming, so no event is used up, and
-- the hour's limit keeps anything older from going out once it is
-- configured. Either way pg_net only logs the answer.
--
-- ORDER
--
-- After 026 by number. Depends on 006 (blocks), 009 (schema_migrations),
-- 020 (tournaments, tournament_members), 024 (post_tags), 013 (pg_net) and
-- Supabase Vault only; section 0 stops the file if any is missing. Builds
-- up to 33 never touch these objects. Build 34 (v4.9) calls the RPCs and,
-- while they are missing (PGRST202 or 42883), registers nothing and shows
-- no alert switches in Settings, with no error anywhere. A PGRST202
-- straight after the run is PostgREST's schema cache: Settings -> API ->
-- Reload schema, or relaunch.
--
-- Account deletion needs nothing new: every row here references profiles
-- on delete cascade (tokens, settings, and the ledger and the pairs on
-- both people).
--
-- ALSO DO BY HAND (specs/v4.9/push.md, Jan's steps; never in this file)
--
--   The APNs key and its Key ID as Edge Function secrets (APNS_KEY,
--   APNS_KEY_ID; APPLE_TEAM_ID exists already), and the `push` function
--   deployed with Verify JWT OFF. The secret below is NOT one of them:
--   the function never holds it, it only passes it back to push_caller_ok.
--
-- VERIFY AFTERWARDS (all read-only, except the rolled-back smoke test)
--
--   -- Expect one row: 027_push.
--   select version from public.schema_migrations where version = '027_push';
--
--   -- Expect four names, none null.
--   select to_regclass('public.push_tokens'), to_regclass('public.push_settings'),
--          to_regclass('private.push_ledger'), to_regclass('private.push_pair');
--
--   -- Expect four rows, all true: Row Level Security is on.
--   select c.oid::regclass, c.relrowsecurity from pg_class c
--   where c.oid in ('public.push_tokens'::regclass, 'public.push_settings'::regclass,
--                   'private.push_ledger'::regclass, 'private.push_pair'::regclass)
--   order by 1;
--
--   -- Expect push_settings_read_own and push_tokens_read_own, both for authenticated.
--   select tablename, policyname, roles from pg_policies
--   where schemaname = 'public' and tablename in ('push_tokens', 'push_settings')
--   order by 1, 2;
--
--   -- Expect two rows, push_secret and push_url. Names only: never select
--   -- decrypted_secret here, so the secret never lands in a results pane.
--   select name from vault.secrets where name in ('push_secret', 'push_url') order by 1;
--
--   -- Expect seven rows. Columns: definer, anon, authenticated.
--   --   my_push_settings()                      | t | f | t
--   --   push_caller_ok(text)                    | t | f | f
--   --   push_claim(text,text,uuid,uuid)         | t | f | f
--   --   push_release(text,text,uuid,uuid)       | t | f | f
--   --   register_push_token(text,text)          | t | f | t
--   --   set_push_setting(text,boolean)          | t | f | t
--   --   unregister_push_token(text)             | t | t | t
--   -- (unregister_push_token is open to anon on purpose: a signed-out
--   -- phone takes its own token off.)
--   select p.oid::regprocedure, p.prosecdef,
--          has_function_privilege('anon', p.oid, 'execute')          as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as authenticated
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('register_push_token', 'unregister_push_token', 'my_push_settings',
--                       'set_push_setting', 'push_caller_ok', 'push_claim', 'push_release')
--   order by 1;
--
--   -- Expect true, true, true: the function's key may call its three.
--   select has_function_privilege('service_role', 'public.push_caller_ok(text)', 'execute'),
--          has_function_privilege('service_role', 'public.push_claim(text, text, uuid, uuid)', 'execute'),
--          has_function_privilege('service_role', 'public.push_release(text, text, uuid, uuid)', 'execute');
--
--   -- Expect follows_push, post_tags_push, tournament_members_push.
--   select tgname from pg_trigger
--   where tgname in ('follows_push', 'post_tags_push', 'tournament_members_push')
--   order by 1;
--
--   -- Expect false, false, false, false: no client role reads the ledger,
--   -- the pairs or the tokens' writes.
--   select has_table_privilege('authenticated', 'private.push_ledger', 'select'),
--          has_table_privilege('authenticated', 'private.push_pair', 'select'),
--          has_table_privilege('authenticated', 'public.push_tokens', 'insert'),
--          has_table_privilege('anon', 'public.push_tokens', 'select');
--
--   -- After a real push (a second account follows yours, on build 34 with
--   -- the alerts allowed): 200 and {"result":"sent","sent":1,...} here,
--   -- and only that is a delivery. 502 {"result":"not_delivered",...}
--   -- means no phone took it: "released":true is Apple refusing the key
--   -- or the token (the function's Logs say which; the claim was given
--   -- back, so the same account can unfollow and follow again to retry),
--   -- false is Apple not answering. A 503 means a secret is missing; 401
--   -- means the header did not match; 404 means the function is not
--   -- deployed under the name `push`.
--   select status_code, left(content::text, 200), created from net._http_response
--   order by created desc limit 5;
--
--   -- Smoke test, rolled back. Paste your id into the claims and another
--   -- real account's id into v_other: one that does NOT follow you yet and
--   -- that neither of you has blocked. Run it all at once in the SQL
--   -- editor (as postgres, which is how the editor runs). It registers a
--   -- made-up token for you, reads and flips a switch, has v_other follow
--   -- you, checks the trigger queued exactly one call to the function,
--   -- then claims that event as the function would: 'send' with your
--   -- made-up token, then 'duplicate'; gives it back (a wrong secret
--   -- cannot) and claims it again; and 'forbidden' with a wrong secret.
--   -- Expect "Success. No rows returned"; anything else raises
--   -- and says what it found. Nothing reaches Apple: the queued call is
--   -- rolled back with everything else before pg_net can send it.
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     json_build_object('sub', '<your user id>', 'role', 'authenticated')::text, true);
--   do $$
--   begin
--     if not public.register_push_token(repeat('ab', 32), 'sandbox') then
--       raise exception 'register_push_token did not answer true';
--     end if;
--     if public.my_push_settings() <> '{"tags": true, "invites": true, "follows": true}'::jsonb then
--       raise exception 'your switches are not all on (tick all three in Settings first): %', public.my_push_settings();
--     end if;
--     if (public.set_push_setting('follows', false) ->> 'follows')::boolean then
--       raise exception 'set_push_setting did not turn follows off';
--     end if;
--     perform public.set_push_setting('follows', true);
--   end;
--   $$;
--   reset role;
--   do $$
--   declare
--     v_me     uuid := (current_setting('request.jwt.claims')::jsonb ->> 'sub')::uuid;
--     v_other  uuid := '<another account''s id>';
--     v_secret text := (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.name = 'push_secret');
--     v_n      integer;
--     v_r      jsonb;
--   begin
--     if v_me is null or v_me = v_other then
--       raise exception 'paste your id into the claims and a different account''s id into v_other';
--     end if;
--     if exists (select 1 from public.follows f where f.follower_id = v_other and f.following_id = v_me) then
--       raise exception 'v_other already follows you: pick an account that does not';
--     end if;
--     select count(*) into v_n from net.http_request_queue q where q.url like '%/functions/v1/push';
--     insert into public.follows (follower_id, following_id) values (v_other, v_me);
--     if (select count(*) from net.http_request_queue q where q.url like '%/functions/v1/push') <> v_n + 1 then
--       raise exception 'the follow did not queue exactly one call to the push function';
--     end if;
--     v_r := public.push_claim(v_secret, 'follow', v_other, v_me);
--     if v_r ->> 'result' <> 'send' or not (v_r -> 'tokens') @> jsonb_build_array(jsonb_build_object('token', repeat('ab', 32), 'env', 'sandbox')) then
--       raise exception 'the first claim did not answer send with your token: %', v_r;
--     end if;
--     if public.push_claim(v_secret, 'follow', v_other, v_me) ->> 'result' <> 'duplicate' then
--       raise exception 'the second claim of the same follow was not a duplicate';
--     end if;
--     if public.push_release('not the secret', 'follow', v_other, v_me) then
--       raise exception 'a wrong secret gave a claim back';
--     end if;
--     if not public.push_release(v_secret, 'follow', v_other, v_me) then
--       raise exception 'push_release did not give the claim back';
--     end if;
--     if public.push_claim(v_secret, 'follow', v_other, v_me) ->> 'result' <> 'send' then
--       raise exception 'a claim given back could not be claimed again';
--     end if;
--     if public.push_claim('not the secret', 'follow', v_other, v_me) ->> 'result' <> 'forbidden' then
--       raise exception 'a wrong secret was not refused';
--     end if;
--     if public.push_caller_ok('not the secret') or not public.push_caller_ok(v_secret) then
--       raise exception 'push_caller_ok does not tell the secret from a wrong one';
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
    raise exception '027 needs 009 (public.schema_migrations). Apply the earlier migrations first.';
  end if;
  if to_regclass('public.blocks') is null then
    raise exception '027 needs 006 (public.blocks). Apply the earlier migrations first.';
  end if;
  if to_regclass('public.tournament_members') is null then
    raise exception '027 needs 020 (public.tournament_members). Apply the earlier migrations first.';
  end if;
  if to_regclass('public.post_tags') is null then
    raise exception '027 needs 024 (public.post_tags). Apply the earlier migrations first.';
  end if;
  if to_regclass('vault.secrets') is null
     or not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'vault' and p.proname = 'create_secret') then
    raise exception '027 needs Supabase Vault (vault.secrets, vault.create_secret).';
  end if;
end;
$$;


-- --------------------------------------------------------------------
-- 1. pg_net (on since 013) and the private schema (011, 018)
-- --------------------------------------------------------------------

create extension if not exists pg_net;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;


-- --------------------------------------------------------------------
-- 2. Device tokens
--
-- The token is the primary key: one phone's token belongs to one account
-- at a time, so a phone signed in to a second account is told only that
-- account's news. APNs tokens are 32 bytes today (64 hex characters);
-- Apple says not to rely on the length, so up to 100 bytes is accepted.
-- Stored in lower case, as the RPC writes it.
-- --------------------------------------------------------------------

create table if not exists public.push_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles on delete cascade,
  env        text not null default 'production',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_tokens_token_shape check (token ~ '^[0-9a-f]{64,200}$'),
  constraint push_tokens_env check (env in ('production', 'sandbox'))
);

-- An account's phones, newest first: the cap's trim and push_claim's read.
create index if not exists push_tokens_user_idx on public.push_tokens (user_id, updated_at desc);


-- --------------------------------------------------------------------
-- 3. The three switches, per account
--
-- No row reads as all three on (my_push_settings, push_claim); a row is
-- made the first time one is changed.
-- --------------------------------------------------------------------

create table if not exists public.push_settings (
  user_id    uuid primary key references public.profiles on delete cascade,
  tags       boolean not null default true,
  invites    boolean not null default true,
  follows    boolean not null default true,
  updated_at timestamptz not null default now()
);


-- --------------------------------------------------------------------
-- 4. The ledger: what was pushed; and the hour between two people
--
-- Keyed by the event (kind, subject, recipient), so each event goes out
-- once: subject is the post for a tag, the tournament for an invite and
-- the FOLLOWER for a follow (so a pair is pushed once, ever). The post and
-- tournament columns exist only to cascade: deleting the post or the
-- tournament takes its rows with it. Nobody reads or writes this through
-- the API; push_claim writes it, as the definer.
-- --------------------------------------------------------------------

create table if not exists private.push_ledger (
  kind          text not null,
  subject_id    uuid not null,
  recipient_id  uuid not null references public.profiles    on delete cascade,
  actor_id      uuid not null references public.profiles    on delete cascade,
  post_id       uuid          references public.posts       on delete cascade,
  tournament_id uuid          references public.tournaments on delete cascade,
  sent_at       timestamptz not null default now(),
  primary key (kind, subject_id, recipient_id),
  constraint push_ledger_subject check (
    case kind
      when 'tag'    then post_id is not null and post_id = subject_id and tournament_id is null
      when 'invite' then tournament_id is not null and tournament_id = subject_id and post_id is null
      when 'follow' then subject_id = actor_id and post_id is null and tournament_id is null
      else false
    end)
);

alter table private.push_ledger enable row level security;
revoke all on private.push_ledger from public, anon, authenticated;

-- The cascades delete by these.
create index if not exists push_ledger_recipient_idx  on private.push_ledger (recipient_id);
create index if not exists push_ledger_actor_idx      on private.push_ledger (actor_id);
create index if not exists push_ledger_post_idx       on private.push_ledger (post_id) where post_id is not null;
create index if not exists push_ledger_tournament_idx on private.push_ledger (tournament_id) where tournament_id is not null;

/*
 * The hour between two people (RATE LIMITS, at the head of this file):
 * when `actor` last notified `recipient` of a tag, or of an invite. One
 * row per kind and pair, overwritten, never deleted with a post or a
 * tournament, so deleting and making again is no way round it. It goes
 * with either account. push_claim writes it, push_release gives back the
 * hour a refused claim took; nobody reads it through the API.
 */
create table if not exists private.push_pair (
  kind         text not null,
  actor_id     uuid not null references public.profiles on delete cascade,
  recipient_id uuid not null references public.profiles on delete cascade,
  last_at      timestamptz not null default now(),
  primary key (kind, actor_id, recipient_id),
  constraint push_pair_kind check (kind in ('tag', 'invite'))
);

alter table private.push_pair enable row level security;
revoke all on private.push_pair from public, anon, authenticated;

-- The cascades delete by these.
create index if not exists push_pair_actor_idx     on private.push_pair (actor_id);
create index if not exists push_pair_recipient_idx on private.push_pair (recipient_id);


-- --------------------------------------------------------------------
-- 5. The shared secret and the function's address, in Vault
--
-- Made here, once: 32 random bytes as hex from pgcrypto where it is
-- installed in `extensions` (Supabase's default), or else two v4 UUIDs
-- from the core gen_random_uuid() (pg_strong_random), 244 random bits.
-- Never printed. A re-run keeps both as they are. To rotate the secret:
-- delete it from vault.secrets and run this file again; nothing else
-- holds a copy.
-- --------------------------------------------------------------------

do $$
declare
  fresh text;
begin
  if not exists (select 1 from vault.secrets s where s.name = 'push_secret') then
    if to_regprocedure('extensions.gen_random_bytes(integer)') is not null then
      execute 'select encode(extensions.gen_random_bytes(32), ''hex'')' into fresh;
    else
      fresh := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    end if;
    perform vault.create_secret(fresh, 'push_secret',
      'Sipply 027: the header the push triggers send to the push Edge Function. Made by the migration; nobody types it.');
  end if;
  if not exists (select 1 from vault.secrets s where s.name = 'push_url') then
    perform vault.create_secret('https://yklknprzyoebzgazcmhj.supabase.co/functions/v1/push', 'push_url',
      'Sipply 027: where the push triggers send. Not a credential; kept beside the secret so a project without it stays inert.');
  end if;
end;
$$;


-- --------------------------------------------------------------------
-- 6. Helpers (private: out of PostgREST's reach, 011 §0)
-- --------------------------------------------------------------------

-- The Vault secret, compared as digests so the comparison never walks the
-- text. False when either side is missing or empty.
create or replace function private.push_secret_matches(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_secret, '') <> ''
     and exists (
       select 1 from vault.decrypted_secrets ds
       where ds.name = 'push_secret'
         and coalesce(ds.decrypted_secret, '') <> ''
         and sha256(convert_to(ds.decrypted_secret, 'UTF8')) = sha256(convert_to(p_secret, 'UTF8'))
     );
$$;

-- A block either way, read from the table: private.my_block_set() is the
-- CALLER's set (auth.uid()), and neither the trigger nor the function
-- runs as either person.
create or replace function private.push_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks x
    where (x.blocker_id = a and x.blocked_id = b) or (x.blocker_id = b and x.blocked_id = a)
  );
$$;

-- The recipient's switch for this kind of event; on when they never set one.
create or replace function private.push_setting_on(p_kind text, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p_kind when 'tag' then s.tags when 'invite' then s.invites when 'follow' then s.follows end
    from public.push_settings s where s.user_id = p_user
  ), p_kind in ('tag', 'invite', 'follow'));
$$;

/*
 * Queues one call to the function for one event, after the cheap checks
 * that would make it pointless: nobody to tell, no phone to tell them on,
 * their switch off, a block, already pushed, or (a tag or an invite) the
 * same person's hour not over yet. push_claim checks all of
 * it again, as of when the call lands. The body carries ids only, never a
 * name or a word. The warning names the kind and the error, never a
 * person. Never raises.
 */
create or replace function private.queue_push(p_kind text, p_subject uuid, p_recipient uuid, p_actor uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  secret text;
  target text;
begin
  if p_subject is null or p_recipient is null or p_actor is null or p_recipient = p_actor
     or not exists (select 1 from public.push_tokens t where t.user_id = p_recipient)
     or not private.push_setting_on(p_kind, p_recipient)
     or private.push_blocked(p_actor, p_recipient)
     or exists (select 1 from private.push_ledger l
                where l.kind = p_kind and l.subject_id = p_subject and l.recipient_id = p_recipient)
     or exists (select 1 from private.push_pair q
                where q.kind = p_kind and q.actor_id = p_actor and q.recipient_id = p_recipient
                  and q.last_at > now() - interval '1 hour') then
    return;
  end if;

  select ds.decrypted_secret into secret from vault.decrypted_secrets ds where ds.name = 'push_secret' limit 1;
  select ds.decrypted_secret into target from vault.decrypted_secrets ds where ds.name = 'push_url' limit 1;
  if coalesce(btrim(secret), '') = '' or coalesce(btrim(target), '') = '' then
    return;
  end if;

  perform net.http_post(
    url     := btrim(target),
    body    := jsonb_build_object('kind', p_kind, 'subject', p_subject, 'recipient', p_recipient),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sipply-push', secret),
    timeout_milliseconds := 10000
  );
exception
  when others then
    raise warning 'push not queued (%): %', p_kind, sqlerrm;
end;
$$;


-- --------------------------------------------------------------------
-- 7. The triggers
--
-- AFTER INSERT, so only a row that passed every check and is about to
-- commit is pushed. Each catches everything: a push is never worth a
-- refused tag, invite or follow.
-- --------------------------------------------------------------------

create or replace function private.push_on_tag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.queue_push('tag', new.post_id, new.tagged_id,
                             (select p.author_id from public.posts p where p.id = new.post_id));
  return null;
exception
  when others then
    raise warning 'push on tag skipped: %', sqlerrm;
    return null;
end;
$$;

-- Only an 'invited' row (the trigger's WHEN): the host's own row is
-- 'accepted', and queue_push drops recipient = actor besides.
create or replace function private.push_on_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.queue_push('invite', new.tournament_id, new.user_id,
                             (select x.host_id from public.tournaments x where x.id = new.tournament_id));
  return null;
exception
  when others then
    raise warning 'push on invite skipped: %', sqlerrm;
    return null;
end;
$$;

create or replace function private.push_on_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.queue_push('follow', new.follower_id, new.following_id, new.follower_id);
  return null;
exception
  when others then
    raise warning 'push on follow skipped: %', sqlerrm;
    return null;
end;
$$;

drop trigger if exists post_tags_push on public.post_tags;
create trigger post_tags_push
  after insert on public.post_tags
  for each row execute function private.push_on_tag();

drop trigger if exists tournament_members_push on public.tournament_members;
create trigger tournament_members_push
  after insert on public.tournament_members
  for each row when (new.status = 'invited')
  execute function private.push_on_invite();

drop trigger if exists follows_push on public.follows;
create trigger follows_push
  after insert on public.follows
  for each row execute function private.push_on_follow();


-- --------------------------------------------------------------------
-- 8. The app's RPCs
--
-- register: the caller's own phone, signed in. unregister: by the token
-- alone, signed in OR NOT, because a phone that signed out (or whose
-- sign-out request failed) must still be able to take its own address
-- off, and knowing a token means being that phone (or Apple). Settings:
-- the caller's own three switches.
-- --------------------------------------------------------------------

create or replace function public.register_push_token(p_token text, p_env text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me  uuid := auth.uid();
  tok text := lower(btrim(coalesce(p_token, '')));
begin
  if me is null then
    raise exception 'not signed in: register_push_token got no auth.uid()' using errcode = '28000';
  end if;
  if tok !~ '^[0-9a-f]{64,200}$' or p_env is null or p_env not in ('production', 'sandbox') then
    raise exception 'push_token_invalid' using errcode = 'P0001';
  end if;

  -- Serialised per account, so two launches at once cannot both trim.
  perform pg_advisory_xact_lock(hashtextextended('push_tokens:' || me::text, 0));
  insert into public.push_tokens as t (token, user_id, env)
  values (tok, me, p_env)
  on conflict (token) do update
    set user_id = excluded.user_id, env = excluded.env, updated_at = now();

  -- At most five phones per account: the least recently seen beyond that go.
  delete from public.push_tokens t
  where t.user_id = me
    and t.token not in (
      select k.token from public.push_tokens k
      where k.user_id = me
      order by k.updated_at desc, k.token
      limit 5
    );
  return true;
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.push_tokens t
    where t.token = lower(btrim(coalesce(p_token, '')))
    returning 1
  )
  select exists (select 1 from gone);
$$;

create or replace function public.my_push_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'tags',    coalesce(s.tags, true),
    'invites', coalesce(s.invites, true),
    'follows', coalesce(s.follows, true))
  from (select (select auth.uid()) as me) one
  left join public.push_settings s on s.user_id = one.me;
$$;

create or replace function public.set_push_setting(p_kind text, p_on boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in: set_push_setting got no auth.uid()' using errcode = '28000';
  end if;
  if p_kind is null or p_kind not in ('tags', 'invites', 'follows') or p_on is null then
    raise exception 'push_setting_invalid' using errcode = 'P0001';
  end if;
  insert into public.push_settings (user_id) values (me) on conflict (user_id) do nothing;
  update public.push_settings s
     set tags       = case when p_kind = 'tags'    then p_on else s.tags end,
         invites    = case when p_kind = 'invites' then p_on else s.invites end,
         follows    = case when p_kind = 'follows' then p_on else s.follows end,
         updated_at = now()
   where s.user_id = me;
  return public.my_push_settings();
end;
$$;


-- --------------------------------------------------------------------
-- 9. The function's RPCs (service_role only)
--
-- push_caller_ok answers whether a header is the trigger's secret, before
-- the function reads its own configuration, so a stranger learns nothing,
-- not even whether the APNs key is set. push_claim re-checks the secret
-- and then the event, as described at the head of this file, and returns
-- what the function needs and nothing more: the kind, the subject, the
-- actor's username, the tournament's name for an invite, and the
-- recipient's tokens with their environments. Every other answer is a
-- one-word `result` that names no person. push_release gives a claim
-- back when Apple refused it outright, and answers true or false only.
-- --------------------------------------------------------------------

create or replace function public.push_caller_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.push_secret_matches(p_secret);
$$;

create or replace function public.push_claim(p_secret text, p_kind text, p_subject uuid, p_recipient uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_at     timestamptz;
  v_title  text;
  v_who    text;
  v_tokens jsonb;
  v_n      integer;
begin
  if not private.push_secret_matches(p_secret) then
    return jsonb_build_object('result', 'forbidden');
  end if;
  if p_kind is null or p_subject is null or p_recipient is null then
    return jsonb_build_object('result', 'bad_request');
  end if;

  if p_kind = 'tag' then
    select p.author_id, t.created_at into v_actor, v_at
    from public.post_tags t
    join public.posts p on p.id = t.post_id
    where t.post_id = p_subject and t.tagged_id = p_recipient;
  elsif p_kind = 'invite' then
    -- Still asked, never the host, and only while it is still being played.
    select x.host_id, m.invited_at, x.name into v_actor, v_at, v_title
    from public.tournament_members m
    join public.tournaments x on x.id = m.tournament_id
    where m.tournament_id = p_subject and m.user_id = p_recipient and m.status = 'invited'
      and x.host_id <> p_recipient and x.finished_at is null and x.finalized_at is null;
  elsif p_kind = 'follow' then
    select f.follower_id, f.created_at into v_actor, v_at
    from public.follows f
    where f.follower_id = p_subject and f.following_id = p_recipient;
  else
    return jsonb_build_object('result', 'bad_request');
  end if;

  if v_actor is null or v_actor = p_recipient then
    return jsonb_build_object('result', 'gone');
  end if;
  -- pg_net sends within seconds; an hour covers a backlog, and keeps an
  -- old event from going out the day the function is configured.
  if v_at is null or v_at < now() - interval '1 hour' then
    return jsonb_build_object('result', 'stale');
  end if;
  if private.push_blocked(v_actor, p_recipient) then
    return jsonb_build_object('result', 'blocked');
  end if;
  if not private.push_setting_on(p_kind, p_recipient) then
    return jsonb_build_object('result', 'off');
  end if;
  select pr.username into v_who from public.profiles pr where pr.id = v_actor;
  if v_who is null then
    return jsonb_build_object('result', 'gone');
  end if;
  select jsonb_agg(jsonb_build_object('token', t.token, 'env', t.env) order by t.updated_at desc)
    into v_tokens
  from public.push_tokens t
  where t.user_id = p_recipient;
  if v_tokens is null then
    return jsonb_build_object('result', 'no_device');
  end if;

  -- Last, so an event refused above stays unpushed, never used up.
  insert into private.push_ledger (kind, subject_id, recipient_id, actor_id, post_id, tournament_id)
  values (p_kind, p_subject, p_recipient, v_actor,
          case when p_kind = 'tag' then p_subject end,
          case when p_kind = 'invite' then p_subject end)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('result', 'duplicate');
  end if;

  -- A tag or an invite: the pair's hour, taken only when it is over (a
  -- racing claim waits on the row, then sees it taken). Not over: the
  -- ledger row just written goes again, so this event stays unspent.
  if p_kind in ('tag', 'invite') then
    insert into private.push_pair as q (kind, actor_id, recipient_id, last_at)
    values (p_kind, v_actor, p_recipient, now())
    on conflict (kind, actor_id, recipient_id) do update
      set last_at = excluded.last_at
      where q.last_at <= now() - interval '1 hour';
    get diagnostics v_n = row_count;
    if v_n = 0 then
      delete from private.push_ledger l
       where l.kind = p_kind and l.subject_id = p_subject and l.recipient_id = p_recipient;
      return jsonb_build_object('result', 'limited');
    end if;
  end if;

  return jsonb_build_object(
    'result', 'send', 'kind', p_kind, 'subject', p_subject,
    'actor', v_who, 'title', v_title, 'tokens', v_tokens);
end;
$$;

/*
 * Gives a claim back, for the function alone, when no phone can have
 * shown it: Apple answered for every phone, and refused each (the
 * provider token, a dead device token, any other refusal). The ledger
 * row goes, and the pair's
 * hour with it when this claim took it (written in the claim's own
 * transaction, so its last_at is the row's sent_at to the microsecond),
 * so the same event, or the next like it, can push once the fault is
 * fixed. Only a claim from the last ten minutes: the function gives back
 * within seconds of claiming, and nothing older is ever undone. True when
 * one was given back.
 */
create or replace function public.push_release(p_secret text, p_kind text, p_subject uuid, p_recipient uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_at    timestamptz;
begin
  if not private.push_secret_matches(p_secret) then
    return false;
  end if;
  delete from private.push_ledger l
   where l.kind = p_kind and l.subject_id = p_subject and l.recipient_id = p_recipient
     and l.sent_at > now() - interval '10 minutes'
  returning l.actor_id, l.sent_at into v_actor, v_at;
  if v_actor is null then
    return false;
  end if;
  delete from private.push_pair q
   where q.kind = p_kind and q.actor_id = v_actor and q.recipient_id = p_recipient and q.last_at = v_at;
  return true;
end;
$$;


-- --------------------------------------------------------------------
-- 10. Who may do what
-- --------------------------------------------------------------------

alter table public.push_tokens   enable row level security;
alter table public.push_settings enable row level security;

revoke all on public.push_tokens, public.push_settings from anon, authenticated;
grant select on public.push_tokens, public.push_settings to authenticated;   -- writes: RPCs only
-- The function deletes a token APNs says is dead, as service_role.
grant select, delete on public.push_tokens to service_role;

drop policy if exists push_tokens_read_own   on public.push_tokens;
drop policy if exists push_settings_read_own on public.push_settings;

create policy push_tokens_read_own on public.push_tokens
  for select to authenticated using (user_id = (select auth.uid()));
create policy push_settings_read_own on public.push_settings
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on function private.push_secret_matches(text)                from public, anon, authenticated;
revoke all on function private.push_blocked(uuid, uuid)                 from public, anon, authenticated;
revoke all on function private.push_setting_on(text, uuid)              from public, anon, authenticated;
revoke all on function private.queue_push(text, uuid, uuid, uuid)       from public, anon, authenticated;
revoke all on function private.push_on_tag()                            from public, anon, authenticated;
revoke all on function private.push_on_invite()                         from public, anon, authenticated;
revoke all on function private.push_on_follow()                         from public, anon, authenticated;

revoke all on function public.register_push_token(text, text)           from public, anon;
revoke all on function public.unregister_push_token(text)               from public;
revoke all on function public.my_push_settings()                        from public, anon;
revoke all on function public.set_push_setting(text, boolean)           from public, anon;
revoke all on function public.push_caller_ok(text)                      from public, anon, authenticated;
revoke all on function public.push_claim(text, text, uuid, uuid)        from public, anon, authenticated;
revoke all on function public.push_release(text, text, uuid, uuid)      from public, anon, authenticated;

grant execute on function public.register_push_token(text, text)        to authenticated;
grant execute on function public.unregister_push_token(text)            to anon, authenticated;
grant execute on function public.my_push_settings()                     to authenticated;
grant execute on function public.set_push_setting(text, boolean)        to authenticated;
grant execute on function public.push_caller_ok(text)                   to service_role;
grant execute on function public.push_claim(text, text, uuid, uuid)     to service_role;
grant execute on function public.push_release(text, text, uuid, uuid)   to service_role;


-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('027_push') on conflict (version) do nothing;
