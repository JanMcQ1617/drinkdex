-- ====================================================================
-- Sipply — migration 018: drinks people add themselves, and the monthly
-- email that brings them to Jan
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- WHAT IT ADDS
--
--   1. public.drink_submissions: a drink someone added in the app because
--      the Dex did not have it, sent as a suggestion with everything they
--      filled in. Own rows only: nobody else can read a suggestion, not
--      even its submitter's followers.
--   2. A trigger that normalises each write, checks it, runs every text
--      column through the 011 content filter, and holds each account to
--      30 suggestions per rolling 30 days.
--   3. A monthly email, sent by the database itself (Resend through
--      pg_net, scheduled by pg_cron): every suggestion from the previous
--      month as a readable card, plus JSON attachments already in the
--      scripts/cocktaildata and scripts/spiritdata entry shape, so
--      scripts/import-submissions.mjs can take them as they are.
--   4. Delivery that is checked rather than assumed: an hourly job reads
--      Resend's answer, retries up to 4 times, and posts to the moderation
--      webhook (013's report_alert_url) when it gives up.
--
-- HOW THE EMAIL BEHAVES
--
-- The send job runs DAILY at 13:00 UTC (09:00 in Puerto Rico) and sends
-- ONCE per month, covering the previous calendar month in Puerto Rico
-- time. Daily, so a database paused on the 1st, or a failed send, heals
-- the next day instead of skipping a month. A row belongs to the month of
-- its LAST change, so each suggestion appears in exactly one email with
-- its latest content; an edit after that email puts it in the next one,
-- marked as updated.
--
-- An empty month still sends a one-line email, "No drink suggestions in
-- September 2026": otherwise a month with no email looks exactly like a
-- broken job. The first morning after this file is applied, expect that
-- email for the month before; it is the job proving it works.
--
-- The email carries each photo's STORAGE PATH, not the picture: `pours`
-- is private, and a cron job cannot mint a signed URL (Storage signs only
-- through its API, and pg_net is asynchronous). The path opens in the
-- dashboard in two clicks. Submitted photos are reference only and are
-- never published.
--
-- ORDER
--
-- After 011 (the content filter; section 0 stops the file without it) and
-- 013 (pg_net, and the report_alert_url secret the give-up alert reuses).
-- Independent of 012 and of 016, 017 and 019. Installed builds notice
-- nothing. A build with "Add a drink" that reaches a phone first keeps
-- each suggestion on the phone, marked not yet sent, and sends it once
-- this file is applied.
--
-- ALSO DO BY HAND (dashboard, Resend and Vault; not in this file)
--
--   * BEFORE running this file: Dashboard -> Integrations -> Cron ->
--     Enable. If `create extension pg_cron` below errors, that is why;
--     enable it and run the file again.
--   * Resend: sign up at resend.com WITH THE ADDRESS THE EMAILS SHOULD
--     REACH (the onboarding sender can mail only the account owner's own
--     address), then API Keys -> Create, permission "Sending access".
--   * Vault, in the SQL editor (the key is a credential; never in the repo):
--       select vault.create_secret('re_...your key...', 'resend_api_key');
--       select vault.create_secret('you@example.com', 'submissions_email');
--     Optional, once a domain is verified in Resend:
--       select vault.create_secret('Sipply <drinks@yourdomain>', 'submissions_from');
--     Until both required secrets exist the job sends nothing and says
--     'not configured'.
--   * Test it at once rather than waiting for the 1st:
--       select private.send_submissions_digest(true,
--         date_trunc('month', now() at time zone 'America/Puerto_Rico')::date);
--     then, a minute later, the ledger and Resend's answer (VERIFY below).
--     That mails the current month so far. It does not stand in for the
--     month's email, which still goes out in full once the month is over
--     (5.2). The next morning the job sends the month before, as above.
--
-- VERIFY AFTERWARDS (read-only)
--
--   -- Table, triggers, policies.
--   -- Expect drink_submissions_prepare_insert, drink_submissions_prepare_update.
--   select tgname from pg_trigger
--   where tgrelid = 'public.drink_submissions'::regclass and not tgisinternal;
--   -- Expect read_own/SELECT, insert_own/INSERT, update_own/UPDATE, delete_own/DELETE.
--   select policyname, cmd from pg_policies where tablename = 'drink_submissions';
--
--   -- Jobs. Expect sipply-submissions-check '20 * * * *' and
--   -- sipply-submissions-send '0 13 * * *', both active.
--   select jobname, schedule, active from cron.job where jobname like 'sipply-submissions-%';
--   select status, return_message, start_time from cron.job_run_details
--    where jobid in (select jobid from cron.job where jobname like 'sipply-submissions-%')
--    order by start_time desc limit 5;
--
--   -- Email ledger and Resend's answer.
--   select * from private.submission_digests order by period_start desc;
--   select id, status_code, left(content, 200), error_msg, created
--   from net._http_response order by created desc limit 5;
--
--   -- After deleting a test account: expect 0.
--   select count(*) from public.drink_submissions where submitter_id = '<that uid>';
-- ====================================================================


-- --------------------------------------------------------------------
-- 0. Stop here unless 011 is applied
--
-- The prepare trigger calls public.is_objectionable on every write.
-- PL/pgSQL resolves a call only when it first runs, so without this check
-- the file would apply cleanly and then fail every suggestion with an
-- error the app does not recognise, leaving each one "not sent yet"
-- forever. The SQL editor runs the script as one transaction, so raising
-- here leaves the database untouched.
-- --------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.is_objectionable(text, boolean)') is null then
    raise exception '018 needs 011 applied first: public.is_objectionable(text, boolean) is missing';
  end if;
end;
$$;


-- --------------------------------------------------------------------
-- 1. Extensions and the private schema
-- --------------------------------------------------------------------

create extension if not exists pg_net;                       -- already on since 013
create extension if not exists pg_cron;                      -- if this errors: Dashboard -> Integrations -> Cron -> Enable, then re-run
create extension if not exists unaccent with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Every name key and slug below calls extensions.unaccent by its full
-- name. If unaccent was installed earlier into another schema, the line
-- above does nothing and those calls would fail on the first suggestion,
-- so say so now instead.
do $$
begin
  if to_regprocedure('extensions.unaccent(regdictionary, text)') is null then
    raise exception '018 needs unaccent in the extensions schema. It is installed elsewhere: run  alter extension unaccent set schema extensions;  then run this file again';
  end if;
end;
$$;


-- --------------------------------------------------------------------
-- 2. The table
--
-- The id is made on the phone, so retrying a lost response stays the same
-- row; it doubles as the app's custom drink id ('u_<id>'). Column bounds
-- match the app's form, so anything the form accepts the table accepts.
-- status, catalogue_id and reviewed_at are Jan's: set from the dashboard
-- when a suggestion is added to the Dex ('added', with the catalogue id),
-- was already there ('duplicate', likewise), or is not taken ('declined').
-- --------------------------------------------------------------------

create table if not exists public.drink_submissions (
  id                 uuid primary key,                       -- made on the phone
  submitter_id       uuid not null default auth.uid()
                     references public.profiles (id) on delete cascade,   -- account deletion removes them
  name               text not null,
  name_key           text not null default '',               -- set by trigger
  category           text not null,
  subcategory        text not null,
  subcategory_is_new boolean not null default false,
  description        text not null,
  abv_low            numeric(4,1),
  abv_high           numeric(4,1),
  origin             text not null default '',
  glassware          text not null default '',
  tasting_notes      text[] not null default '{}',
  fun_fact           text not null default '',
  ingredients        jsonb not null default '[]'::jsonb,     -- [{ "item": text, "amount": text }]
  steps              text[] not null default '{}',
  method             text not null default '',
  garnish            text not null default '',
  base               text not null default '',
  distillation       text not null default '',
  aging              text not null default '',
  serve_temp         text not null default '',
  serve_how          text not null default '',
  pairings           text[] not null default '{}',
  process            text not null default '',
  note_for_team      text not null default '',
  photo_path         text,
  status             text not null default 'new',            -- Jan's column
  catalogue_id       text,                                   -- Jan's column
  reviewed_at        timestamptz,                            -- Jan's column
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint drink_submissions_category   check (category in ('cocktail', 'spirit')),
  constraint drink_submissions_name_len   check (char_length(btrim(name)) between 2 and 60),
  constraint drink_submissions_subcat_len check (char_length(btrim(subcategory)) between 2 and 40),
  constraint drink_submissions_desc_len   check (char_length(btrim(description)) between 20 and 280),
  constraint drink_submissions_abv        check (
    (abv_low is null and abv_high is null)
    or (abv_low between 0.5 and 96 and (abv_high is null or abv_high between abv_low and 96))),
  constraint drink_submissions_short_text check (
        char_length(origin) <= 80 and char_length(glassware) <= 40 and char_length(garnish) <= 60
    and char_length(serve_temp) <= 60 and char_length(base) <= 120
    and char_length(distillation) <= 120 and char_length(aging) <= 120),
  constraint drink_submissions_long_text  check (
        char_length(fun_fact) <= 280 and char_length(serve_how) <= 280
    and char_length(process) <= 280 and char_length(note_for_team) <= 500),
  constraint drink_submissions_list_sizes check (
        cardinality(tasting_notes) <= 5 and cardinality(steps) <= 8 and cardinality(pairings) <= 3
    and jsonb_typeof(ingredients) = 'array' and jsonb_array_length(ingredients) <= 12),
  constraint drink_submissions_method     check (method in ('', 'shaken','built','stirred','blended',
    'boiled','infused','layered','muddled','swizzled','rolled','thrown')),
  constraint drink_submissions_photo_path check (photo_path is null or (
    char_length(photo_path) <= 200 and split_part(photo_path, '/', 1) = submitter_id::text)),
  constraint drink_submissions_status     check (status in ('new','added','duplicate','declined')),
  constraint drink_submissions_catalogue  check (catalogue_id is null or catalogue_id ~ '^[a-z0-9-]{1,100}$'),
  constraint drink_submissions_resolved   check ((status in ('added','duplicate')) = (catalogue_id is not null))
);

-- One per person per normalised name. A 23505 naming this index is the
-- app's 'duplicate': you already suggested a drink with this name.
create unique index if not exists drink_submissions_one_per_name
  on public.drink_submissions (submitter_id, name_key);
-- The digest selects by month of last change.
create index if not exists drink_submissions_updated_idx on public.drink_submissions (updated_at);


-- --------------------------------------------------------------------
-- 3. Prepare trigger: normalise, validate, filter, quota
--
-- In `public` with every privilege revoked, which is 011's pattern for
-- trigger functions. Its errors are all P0001, and the app maps each:
--   objectionable_content  (detail = the column) -> "has wording Sipply
--                          doesn't allow", naming the field
--   submission_invalid     (detail = the column) -> "didn't pass Sipply's
--                          checks", naming the field
--   submission_quota       -> sent on its own once under 30 in 30 days
--
-- The server owns identity and clocks. A client insert can never set the
-- review columns, and an update can never move a row to another account
-- or re-date it. Rows written from the SQL editor (no auth.uid()) keep
-- what they were given, so Jan can fix or backfill by hand.
--
-- The quota counts inserts only. That is why the app writes insert, then
-- update, and never upserts: a BEFORE INSERT trigger fires on the insert
-- half of INSERT ... ON CONFLICT DO UPDATE even when the row exists, so
-- every edit sent as an upsert would count against the quota.
-- --------------------------------------------------------------------

create or replace function public.prepare_drink_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  me     uuid := auth.uid();
  recent integer;
  field  text;
  val    text;
  e      jsonb;
begin
  -- Identity and clocks belong to the server. A client (me not null) can never set review columns.
  if tg_op = 'INSERT' then
    if me is not null then
      new.submitter_id := me;
      new.status := 'new'; new.catalogue_id := null; new.reviewed_at := null;
    end if;
    new.created_at := now();
  else
    new.id := old.id; new.submitter_id := old.submitter_id; new.created_at := old.created_at;
  end if;
  new.updated_at := now();

  -- Normalise
  new.name        := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  new.subcategory := btrim(new.subcategory);
  new.description := btrim(new.description);
  new.tasting_notes := coalesce(array(select lower(btrim(x)) from unnest(new.tasting_notes) x where btrim(x) <> ''), '{}');
  new.pairings      := coalesce(array(select lower(btrim(x)) from unnest(new.pairings) x where btrim(x) <> ''), '{}');
  new.steps         := coalesce(array(select btrim(x) from unnest(new.steps) x where btrim(x) <> ''), '{}');
  -- Two-argument unaccent: with search_path = '' the one-argument form cannot find its
  -- dictionary and raises 'text search dictionary "unaccent" does not exist'.
  new.name_key := regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, new.name)),
                                 '[^a-z0-9]', '', 'g');
  if char_length(new.name_key) < 2 then
    raise exception 'submission_invalid' using errcode = 'P0001', detail = 'name';
  end if;

  -- Element shapes. The array check comes first: every jsonb_array_* call
  -- below raises a bare 22023 on an object, which the app would not read
  -- as a refusal.
  if jsonb_typeof(new.ingredients) is distinct from 'array' then
    raise exception 'submission_invalid' using errcode = 'P0001', detail = 'ingredients';
  end if;
  if exists (select 1 from unnest(new.tasting_notes) x where char_length(x) > 30) then
    raise exception 'submission_invalid' using errcode = 'P0001', detail = 'tasting_notes'; end if;
  if exists (select 1 from unnest(new.steps) x where char_length(x) > 200) then
    raise exception 'submission_invalid' using errcode = 'P0001', detail = 'steps'; end if;
  if exists (select 1 from unnest(new.pairings) x where char_length(x) > 40) then
    raise exception 'submission_invalid' using errcode = 'P0001', detail = 'pairings'; end if;
  for e in select * from jsonb_array_elements(new.ingredients) loop
    -- The object check on its own, for the same reason: jsonb_object_keys
    -- raises a bare 22023 on anything else, and SQL does not promise to
    -- stop at the first true term of an OR.
    if jsonb_typeof(e) <> 'object' then
      raise exception 'submission_invalid' using errcode = 'P0001', detail = 'ingredients';
    end if;
    if (select count(*) from jsonb_object_keys(e) k where k not in ('item','amount')) > 0
       or char_length(btrim(coalesce(e->>'item',''))) not between 1 and 80
       or char_length(coalesce(e->>'amount','')) > 40 then
      raise exception 'submission_invalid' using errcode = 'P0001', detail = 'ingredients';
    end if;
  end loop;

  -- Category rules (normalise the other category's fields away rather than refuse them)
  if new.category = 'cocktail' then
    if jsonb_array_length(new.ingredients) < 2 then
      raise exception 'submission_invalid' using errcode = 'P0001', detail = 'ingredients'; end if;
    new.base := ''; new.distillation := ''; new.aging := ''; new.serve_temp := '';
    new.serve_how := ''; new.pairings := '{}'; new.process := '';
  else
    if new.abv_low is null then
      raise exception 'submission_invalid' using errcode = 'P0001', detail = 'abv_low'; end if;
    new.ingredients := '[]'::jsonb; new.steps := '{}'; new.method := ''; new.garnish := '';
  end if;

  -- Content filter (011). Every text column, every write: a suggestion is re-read by a person
  -- each time it changes, so an edit carrying a newly blocked term is refused like a new row.
  for field, val in
    select f, v from (values
      ('name', new.name), ('subcategory', new.subcategory), ('description', new.description),
      ('origin', new.origin), ('glassware', new.glassware), ('garnish', new.garnish),
      ('fun_fact', new.fun_fact), ('note_for_team', new.note_for_team), ('base', new.base),
      ('distillation', new.distillation), ('aging', new.aging), ('serve_temp', new.serve_temp),
      ('serve_how', new.serve_how), ('process', new.process),
      ('tasting_notes', array_to_string(new.tasting_notes, ' / ')),
      ('steps', array_to_string(new.steps, ' / ')),
      ('pairings', array_to_string(new.pairings, ' / ')),
      ('ingredients', (select string_agg(coalesce(x->>'amount','') || ' ' || coalesce(x->>'item',''), ' / ')
                       from jsonb_array_elements(new.ingredients) x))
    ) as t(f, v)
  loop
    if public.is_objectionable(val) then
      raise exception 'objectionable_content' using errcode = 'P0001', detail = field;
    end if;
  end loop;

  -- Quota: 30 per rolling 30 days, counted on insert only, which is why the client never
  -- upserts (an upsert's insert half would count every edit). The lock queues one account's
  -- parallel inserts, as charge_discovery does (011), so they cannot all read 29 and pass.
  if tg_op = 'INSERT' and me is not null then
    perform pg_advisory_xact_lock(hashtextextended('drink_submissions:' || new.submitter_id::text, 0));
    select count(*) into recent from public.drink_submissions
    where submitter_id = new.submitter_id and created_at > now() - interval '30 days';
    if recent >= 30 then
      raise exception 'submission_quota' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prepare_drink_submission() from public, anon, authenticated;

drop trigger if exists drink_submissions_prepare_insert on public.drink_submissions;
create trigger drink_submissions_prepare_insert
  before insert on public.drink_submissions
  for each row execute function public.prepare_drink_submission();

-- Scoped to content columns, so Jan's `update … set status = …` neither re-validates
-- nor bumps updated_at (which would drag the row into next month's email).
drop trigger if exists drink_submissions_prepare_update on public.drink_submissions;
create trigger drink_submissions_prepare_update
  before update of name, category, subcategory, subcategory_is_new, description, abv_low, abv_high,
    origin, glassware, tasting_notes, fun_fact, ingredients, steps, method, garnish, base,
    distillation, aging, serve_temp, serve_how, pairings, process, note_for_team, photo_path
  on public.drink_submissions
  for each row execute function public.prepare_drink_submission();


-- --------------------------------------------------------------------
-- 4. RLS and grants: own rows only, and nobody else reads
--
-- Update and delete are granted as well as insert and select, because
-- editing a suggestion and withdrawing it are features of the app, and
-- both are pinned to the owner. A suggestion is editable only until Jan
-- has reviewed it.
--
-- Storage needs no change. The photo goes under pours/<uid>/, which
-- pours_insert_own and pours_delete_own already allow and which the
-- account-deletion sweep already empties before delete_own_account runs.
-- pours_read lets any signed-in account not blocked either way list and
-- read that folder, so a suggestion's photo is exactly as visible as a
-- pour photo; docs/privacy.md says so.
-- --------------------------------------------------------------------

alter table public.drink_submissions enable row level security;
revoke all on public.drink_submissions from anon, authenticated;

grant select, delete on public.drink_submissions to authenticated;
grant insert (id, name, category, subcategory, subcategory_is_new, description, abv_low, abv_high,
  origin, glassware, tasting_notes, fun_fact, ingredients, steps, method, garnish, base,
  distillation, aging, serve_temp, serve_how, pairings, process, note_for_team, photo_path)
  on public.drink_submissions to authenticated;
grant update (name, category, subcategory, subcategory_is_new, description, abv_low, abv_high,
  origin, glassware, tasting_notes, fun_fact, ingredients, steps, method, garnish, base,
  distillation, aging, serve_temp, serve_how, pairings, process, note_for_team, photo_path)
  on public.drink_submissions to authenticated;
-- status, catalogue_id, reviewed_at, submitter_id, name_key, created_at, updated_at: no client grant.

drop policy if exists drink_submissions_read_own   on public.drink_submissions;
drop policy if exists drink_submissions_insert_own on public.drink_submissions;
drop policy if exists drink_submissions_update_own on public.drink_submissions;
drop policy if exists drink_submissions_delete_own on public.drink_submissions;

create policy drink_submissions_read_own on public.drink_submissions
  for select to authenticated using (submitter_id = (select auth.uid()));
create policy drink_submissions_insert_own on public.drink_submissions
  for insert to authenticated with check (submitter_id = (select auth.uid()));
-- Editable only until Jan has reviewed it.
create policy drink_submissions_update_own on public.drink_submissions
  for update to authenticated
  using (submitter_id = (select auth.uid()) and status = 'new')
  with check (submitter_id = (select auth.uid()));
-- Withdrawing is always allowed; account deletion cascades regardless.
create policy drink_submissions_delete_own on public.drink_submissions
  for delete to authenticated using (submitter_id = (select auth.uid()));


-- --------------------------------------------------------------------
-- 5. The monthly email
--
-- Everything from here on lives in `private`: no client role can call it,
-- only pg_cron (and Jan, from the SQL editor). Functions that read Vault
-- are SECURITY DEFINER; all of them pin search_path to empty and revoke
-- the EXECUTE that Postgres grants to PUBLIC by default.
-- --------------------------------------------------------------------

-- The ledger: one row per month covered. A count, never personal data.
create table if not exists private.submission_digests (
  period_start date primary key,                 -- first day of the month covered, Puerto Rico time
  status       text not null default 'pending' check (status in ('pending','delivered','failed')),
  request_id   bigint,                           -- net.http_post id -> net._http_response.id
  attempts     integer not null default 0,
  submissions  integer not null default 0,       -- a count; no personal data lives here
  last_error   text,
  sent_at      timestamptz,
  checked_at   timestamptz
);
alter table private.submission_digests enable row level security;
revoke all on private.submission_digests from public, anon, authenticated;


-- 5.1 Helpers. LANGUAGE sql bodies are checked when they are created, so
-- each one comes after everything it calls: submission_todo and
-- submission_meta before submission_entry.

create or replace function private.html_escape(t text) returns text language sql immutable set search_path = '' as $$
  select replace(replace(replace(replace(replace(coalesce(t, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

-- The catalogue's id shape: lower case, accents folded, runs of anything
-- else as one hyphen.
create or replace function private.drink_slug(t text) returns text language sql stable set search_path = '' as $$
  select btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, t)),
               '[^a-z0-9]+', '-', 'g'), '-');
$$;

-- "40%" or "40–46%" (en dash, as the catalogue writes ranges); '' when unknown.
create or replace function private.abv_text(lo numeric, hi numeric) returns text language sql immutable set search_path = '' as $$
  select case
    when lo is null then ''
    when hi is null or hi = lo then trim_scale(lo)::text || '%'
    else trim_scale(lo)::text || '–' || trim_scale(hi)::text || '%' end;
$$;

-- What Jan still has to write before the merge scripts will accept the
-- entry: the merge gates' required fields, minus what the person filled.
-- rarity always, because it is editorial; composition.summary likewise
-- for spirits.
create or replace function private.submission_todo(s public.drink_submissions) returns text[]
language sql stable set search_path = '' as $$
  select array_remove(array[
    'rarity',
    case when s.fun_fact = '' then 'funFact' end,
    case when s.abv_low is null then 'abv' end,
    case when s.origin = '' then 'origin' end,
    case when s.glassware = '' then 'glassware' end,
    case when cardinality(s.tasting_notes) < 2 then 'tastingNotes (needs 2+)' end,
    case when s.subcategory_is_new then 'subcategory is new: ' || s.subcategory end,
    case when s.category = 'cocktail' and cardinality(s.steps) < 3 then 'recipe.steps (needs 3+)' end,
    case when s.category = 'cocktail' and s.method = '' then 'recipe.method' end,
    case when s.category = 'cocktail' and exists (
      select 1 from jsonb_array_elements(s.ingredients) x where btrim(coalesce(x->>'amount', '')) = '')
      then 'recipe amounts' end,
    case when s.category = 'cocktail' and s.garnish = '' then 'recipe.garnish' end,
    case when s.category = 'spirit' then 'composition.summary' end,
    case when s.category = 'spirit' and ((s.base <> '')::int + (s.distillation <> '')::int
      + (s.aging <> '')::int + (s.abv_low is not null)::int) < 3 then 'composition.components (needs 3+)' end,
    case when s.category = 'spirit' and s.process = '' then 'composition.process' end,
    case when s.category = 'spirit' and s.serve_temp = '' then 'serve.temp' end,
    case when s.category = 'spirit' and s.serve_how = '' then 'serve.how' end,
    case when s.category = 'spirit' and cardinality(s.pairings) = 0 then 'serve.pair' end
  ], null);
$$;

-- The `_sipply` block on each exported entry. Both merge scripts project
-- the fields they keep, so this key never reaches drinks.json, and
-- import-submissions.mjs cuts it down to the submission id.
create or replace function private.submission_meta(s public.drink_submissions, handle text) returns json
language sql stable set search_path = '' as $$
  select json_build_object(
    'submissionId', s.id,
    'category',     s.category,
    'submittedBy',  '@' || coalesce(handle, ''),
    'submittedAt',  s.created_at,
    'updatedAt',    s.updated_at,
    'photo',        s.photo_path,
    'noteForTeam',  s.note_for_team,
    'todo',         to_json(private.submission_todo(s)));
$$;

-- One entry in the exact shape of scripts/cocktaildata or
-- scripts/spiritdata, keys in the source files' order. `json`, not
-- `jsonb`, so that order survives. Ice is left out of the short
-- ingredient list, as the catalogue does; `\y` is a word boundary in a
-- Postgres regex (`\b` would be a backspace).
create or replace function private.submission_entry(s public.drink_submissions, handle text) returns json
language sql stable set search_path = '' as $$
  select case when s.category = 'cocktail' then json_build_object(
    'id', private.drink_slug(s.name), 'name', s.name, 'subcategory', s.subcategory,
    'description', s.description, 'abv', private.abv_text(s.abv_low, s.abv_high),
    'origin', s.origin, 'rarity', '', 'tastingNotes', to_json(s.tasting_notes),
    'glassware', s.glassware,
    'ingredients', (select coalesce(json_agg(x.e->>'item' order by x.ord), '[]'::json)
                    from jsonb_array_elements(s.ingredients) with ordinality x(e, ord)
                    where (x.e->>'item') !~* '^\s*(crushed\s+|cubed\s+)?ice\y'),
    'funFact', s.fun_fact,
    'recipe', json_build_object(
      'ingredients', (select coalesce(json_agg(json_build_object('item', x.e->>'item',
                        'amount', coalesce(x.e->>'amount', '')) order by x.ord), '[]'::json)
                      from jsonb_array_elements(s.ingredients) with ordinality x(e, ord)),
      'steps', to_json(s.steps), 'garnish', s.garnish, 'method', s.method),
    '_sipply', private.submission_meta(s, handle))
  else json_build_object(
    'id', private.drink_slug(s.name), 'name', s.name, 'subcategory', s.subcategory,
    'description', s.description, 'abv', private.abv_text(s.abv_low, s.abv_high),
    'origin', s.origin, 'rarity', '', 'tastingNotes', to_json(s.tasting_notes),
    'glassware', s.glassware, 'funFact', s.fun_fact,
    'serve', json_build_object('temp', s.serve_temp, 'glass', s.glassware,
                               'how', s.serve_how, 'pair', to_json(s.pairings)),
    'composition', json_build_object(
      'summary', '',
      'components', (select coalesce(json_agg(json_build_object('label', c.label, 'detail', c.detail) order by c.ord), '[]'::json)
                     from (values (1, 'Base', s.base), (2, 'Distillation', s.distillation), (3, 'Aging', s.aging),
                                  (4, 'Strength', private.abv_text(s.abv_low, s.abv_high))) c(ord, label, detail)
                     where c.detail <> ''),
      'process', s.process),
    '_sipply', private.submission_meta(s, handle))
  end;
$$;

-- One suggestion as an email card: a table row, inline styles only (email
-- clients drop <style>), and html_escape on every value that came from a
-- person. A row belongs to the month of its last change, so "UPDATED since
-- an earlier email" means it was first sent in an earlier month: created
-- before the month this email covers.
create or replace function private.submission_card_html(s public.drink_submissions, handle text, also_count integer)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  tz        constant text := 'America/Puerto_Rico';
  c_ink     constant text := '#2B2322';
  c_muted   constant text := '#6A6058';
  c_wine    constant text := '#5B0F1A';
  c_rule    constant text := '#EFE9E0';
  p_style   constant text := 'margin:0 0 12px;font-size:15px;line-height:22px;color:#2B2322;';
  k_style   constant text := 'padding:2px 12px 2px 0;font-size:14px;line-height:20px;color:#6A6058;vertical-align:top;';
  v_style   constant text := 'padding:2px 0;font-size:14px;line-height:20px;color:#2B2322;vertical-align:top;';
  covered   date := date_trunc('month', s.updated_at at time zone tz)::date;
  todo      text[] := private.submission_todo(s);
  meta_line text;
  facts     text;
  part      text;
  card      text;
begin
  -- Name, and Jan's verdict when there already is one.
  card := format('<h2 style="margin:0 0 4px;font-size:20px;line-height:26px;color:%s;">%s%s</h2>',
    c_ink,
    private.html_escape(s.name),
    case when s.status <> 'new' then format(
      ' <span style="font-size:12px;line-height:16px;font-weight:600;color:%s;border:1px solid %s;padding:1px 6px;">%s</span>',
      c_wine, c_wine, private.html_escape(s.status)) else '' end);

  -- Cocktail · Sour · @handle · submitted 12 Sep 2026 · edited 14 Sep
  meta_line := concat_ws(' · ',
    initcap(s.category),
    s.subcategory || case when s.subcategory_is_new then ' (new style)' else '' end,
    '@' || coalesce(handle, ''),
    'submitted ' || to_char(s.created_at at time zone tz, 'FMDD Mon YYYY'),
    case when s.updated_at > s.created_at then 'edited ' || to_char(s.updated_at at time zone tz, 'FMDD Mon') end,
    case when s.created_at < (covered::timestamp at time zone tz) then 'UPDATED since an earlier email' end);
  card := card || format('<p style="margin:0 0 12px;font-size:13px;line-height:18px;color:%s;">%s</p>',
    c_muted, private.html_escape(meta_line));

  if also_count > 0 then
    card := card || format('<p style="margin:0 0 12px;font-size:13px;line-height:18px;font-weight:600;color:%s;">Also suggested by %s other %s this month</p>',
      c_wine, also_count, case when also_count = 1 then 'person' else 'people' end);
  end if;

  facts := concat_ws(' · ', nullif(private.abv_text(s.abv_low, s.abv_high), ''), nullif(s.origin, ''), nullif(s.glassware, ''));
  if facts <> '' then
    card := card || format('<p style="margin:0 0 12px;font-size:14px;line-height:20px;color:%s;">%s</p>',
      c_muted, private.html_escape(facts));
  end if;

  card := card || format('<p style="%s">%s</p>', p_style, private.html_escape(s.description));

  if cardinality(s.tasting_notes) > 0 then
    card := card || format('<p style="%s"><strong>Tasting notes:</strong> %s</p>',
      p_style, private.html_escape(array_to_string(s.tasting_notes, ', ')));
  end if;

  if s.category = 'cocktail' then
    select string_agg(format('<tr><td style="%s text-align:right;white-space:nowrap;">%s</td><td style="%s">%s</td></tr>',
             k_style, private.html_escape(coalesce(x.e->>'amount', '')), v_style, private.html_escape(x.e->>'item')),
           '' order by x.ord)
      into part
    from jsonb_array_elements(s.ingredients) with ordinality x(e, ord);
    if part is not null then
      card := card || '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border-collapse:collapse;">'
                   || part || '</table>';
    end if;
    if s.method <> '' then
      card := card || format('<p style="%s"><strong>Method:</strong> %s</p>', p_style, private.html_escape(s.method));
    end if;
    if cardinality(s.steps) > 0 then
      select string_agg(format('<li style="margin:0 0 4px;">%s</li>', private.html_escape(u.txt)), '' order by u.ord)
        into part
      from unnest(s.steps) with ordinality u(txt, ord);
      card := card || format('<ol style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:22px;color:%s;">%s</ol>',
        c_ink, part);
    end if;
    if s.garnish <> '' then
      card := card || format('<p style="%s"><strong>Garnish:</strong> %s</p>', p_style, private.html_escape(s.garnish));
    end if;
  else
    select string_agg(format('<tr><td style="%s white-space:nowrap;">%s</td><td style="%s">%s</td></tr>',
             k_style, private.html_escape(t.label), v_style, private.html_escape(t.detail)),
           '' order by t.ord)
      into part
    from (values
      (1, 'Made from',       s.base),
      (2, 'Distilled',       s.distillation),
      (3, 'Aging',           s.aging),
      (4, 'Serve',           s.serve_temp),
      (5, 'How to drink it', s.serve_how),
      (6, 'Goes well with',  array_to_string(s.pairings, ', ')),
      (7, 'How it''s made',  s.process)
    ) t(ord, label, detail)
    where t.detail <> '';
    if part is not null then
      card := card || '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border-collapse:collapse;">'
                   || part || '</table>';
    end if;
  end if;

  if s.fun_fact <> '' then
    card := card || format('<p style="%s"><strong>The story:</strong> %s</p>', p_style, private.html_escape(s.fun_fact));
  end if;

  if s.note_for_team <> '' then
    card := card || format(
      '<div style="margin:0 0 12px;padding:8px 12px;border-left:3px solid %s;background:%s;font-size:14px;line-height:20px;color:%s;"><strong>Note for the team:</strong> %s</div>',
      c_wine, c_rule, c_ink, private.html_escape(s.note_for_team));
  end if;

  card := card || format('<p style="margin:0 0 4px;font-size:13px;line-height:18px;color:%s;">%s</p>',
    c_muted,
    case when s.photo_path is null then 'No photo'
         else 'Photo: pours/' || private.html_escape(s.photo_path) || ' (dashboard: Storage &rarr; pours)' end);

  if cardinality(todo) > 0 then
    card := card || format('<p style="margin:0 0 4px;font-size:13px;line-height:18px;color:%s;"><strong>Still to write:</strong> %s</p>',
      c_ink, private.html_escape(array_to_string(todo, ', ')));
  end if;

  card := card || format('<p style="margin:0;font-size:11px;line-height:16px;color:%s;">%s</p>',
    c_muted, private.html_escape(s.id::text));

  return format('<tr><td style="padding:24px 0;border-top:1px solid %s;">%s</td></tr>', c_rule, card);
end;
$$;

-- The email around the cards: a 600px column, system fonts, the app's ink,
-- muted and wine. An empty month is the heading and the footer, nothing
-- else. `cards` is already escaped table rows.
create or replace function private.digest_html(
  label text, n_total integer, n_cocktail integer, n_spirit integer, tag text, cards text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  c_ink   constant text := '#2B2322';
  c_muted constant text := '#6A6058';
  c_wine  constant text := '#5B0F1A';
  c_rule  constant text := '#EFE9E0';
  code_style constant text := 'font-family:Menlo,Consolas,monospace;font-size:13px;';
  heading text;
  counts  text;
  run_line  text;
  body_rows text := '';
begin
  if n_total = 0 then
    heading := format('No drink suggestions in %s.', private.html_escape(label));
  else
    heading := format('%s drink suggestion%s for %s',
      n_total, case when n_total = 1 then '' else 's' end, private.html_escape(label));

    counts := format('%s cocktail%s · %s spirit%s',
      n_cocktail, case when n_cocktail = 1 then '' else 's' end,
      n_spirit,   case when n_spirit = 1 then '' else 's' end);

    -- Name only the files this email carries.
    run_line := case
      when n_cocktail > 0 and n_spirit > 0 then format(
        '<code style="%s">node scripts/import-submissions.mjs ~/Downloads/sipply-cocktails-%s.json</code> (and the same for <code style="%s">sipply-spirits-%s.json</code>)',
        code_style, private.html_escape(tag), code_style, private.html_escape(tag))
      when n_cocktail > 0 then format(
        '<code style="%s">node scripts/import-submissions.mjs ~/Downloads/sipply-cocktails-%s.json</code>',
        code_style, private.html_escape(tag))
      else format(
        '<code style="%s">node scripts/import-submissions.mjs ~/Downloads/sipply-spirits-%s.json</code>',
        code_style, private.html_escape(tag))
    end;

    body_rows := format('<tr><td style="padding:0 0 24px;"><p style="margin:0 0 16px;font-size:15px;line-height:22px;color:%s;">%s</p>', c_muted, counts)
         || format('<div style="padding:12px 16px;border:1px solid %s;">', c_rule)
         || format('<p style="margin:0 0 8px;font-size:15px;line-height:22px;font-weight:600;color:%s;">How to add them</p>', c_wine)
         || format('<p style="margin:0 0 4px;font-size:14px;line-height:20px;color:%s;">1. Save the attachments.</p>', c_ink)
         || format('<p style="margin:0 0 4px;font-size:14px;line-height:20px;color:%s;">2. Run: %s</p>', c_ink, run_line)
         || format('<p style="margin:0;font-size:14px;line-height:20px;color:%s;">3. Fill what each entry lists under todo, then run the merge scripts.</p>', c_ink)
         || '</div></td></tr>'
         || coalesce(cards, '');

    if n_total > 300 then
      body_rows := body_rows || format(
        '<tr><td style="padding:24px 0;border-top:1px solid %s;font-size:14px;line-height:20px;color:%s;">&hellip;and %s more. All of them are in the attachments, or see table public.drink_submissions.</td></tr>',
        c_rule, c_muted, n_total - 300);
    end if;
  end if;

  -- Plain concatenation where the markup holds a literal %, which format() would read.
  return '<!doctype html><html><body style="margin:0;padding:0;background:#FFFFFF;">'
      || format('<div style="display:none;max-height:0;overflow:hidden;">%s</div>', heading)
      || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px;">'
      || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:-apple-system, Helvetica, Arial, sans-serif;color:'
      || c_ink || ';">'
      || format('<tr><td style="padding:0 0 8px;"><h1 style="margin:0;font-size:24px;line-height:30px;color:%s;">%s</h1></td></tr>', c_ink, heading)
      || body_rows
      || format('<tr><td style="padding:24px 0 0;border-top:1px solid %s;font-size:12px;line-height:16px;color:%s;">Sent by the Sipply database on the 1st of each month.</td></tr>', c_rule, c_muted)
      || '</table></td></tr></table></body></html>';
end;
$$;


-- 5.2 Send. Idempotent per month: a month already pending or delivered is
-- left alone unless `force` is true. `period` picks the month (its first
-- day); the default is the month before this one, Puerto Rico time.
--
-- Only a send made after its month was over counts as that month's email.
-- A test send of the current month (ALSO DO BY HAND, above) is sent and
-- checked like any other, but the job still sends that month in full once
-- it ends: otherwise the test would stand in for it, and every suggestion
-- made after the test would never reach Jan. The real send also starts
-- its own count of attempts rather than inheriting the test's.
create or replace function private.send_submissions_digest(force boolean default false, period date default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  tz       constant text := 'America/Puerto_Rico';
  m        date := coalesce(period, (date_trunc('month', now() at time zone tz) - interval '1 month')::date);
  from_ts  timestamptz := (m::timestamp) at time zone tz;
  to_ts    timestamptz := ((m + interval '1 month')::timestamp) at time zone tz;
  label    text := to_char(m, 'FMMonth YYYY');
  tag      text := to_char(m, 'YYYY-MM');
  d        private.submission_digests;
  api_key  text; recipient text; sender text;
  n_total int; n_cocktail int; n_spirit int;
  cards text; cocktails text; spirits text; html text;
  attachments jsonb := '[]'::jsonb;
  req bigint;
begin
  select * into d from private.submission_digests where period_start = m;
  if found and d.status in ('pending', 'delivered') and d.sent_at >= to_ts and not force then
    return format('already %s for %s', d.status, label);
  end if;

  select decrypted_secret into api_key   from vault.decrypted_secrets where name = 'resend_api_key';
  select decrypted_secret into recipient from vault.decrypted_secrets where name = 'submissions_email';
  select decrypted_secret into sender    from vault.decrypted_secrets where name = 'submissions_from';
  if coalesce(btrim(api_key), '') = '' or coalesce(btrim(recipient), '') = '' then
    raise warning 'drink submissions email: resend_api_key or submissions_email missing from Vault';
    return 'not configured';
  end if;
  -- Resend's onboarding sender may only mail the Resend account owner's own address — fine here.
  sender := coalesce(nullif(btrim(sender), ''), 'Sipply <onboarding@resend.dev>');

  -- A row belongs to the month of its LAST change, so it appears exactly once with its latest content.
  with picked as (
    select s, p.username as handle,
           count(*) over (partition by s.category, s.name_key) - 1 as also_count,
           row_number() over (order by s.category, s.name_key, s.created_at) as n
    from public.drink_submissions s
    join public.profiles p on p.id = s.submitter_id
    where s.updated_at >= from_ts and s.updated_at < to_ts
  )
  select count(*),
         count(*) filter (where (s).category = 'cocktail'),
         count(*) filter (where (s).category = 'spirit'),
         string_agg(private.submission_card_html(s, handle, also_count::int), '' order by n)
           filter (where n <= 300),                                   -- HTML capped; JSON is not
         string_agg(private.submission_entry(s, handle)::text, E',\n' order by n)
           filter (where (s).category = 'cocktail'),
         string_agg(private.submission_entry(s, handle)::text, E',\n' order by n)
           filter (where (s).category = 'spirit')
  into n_total, n_cocktail, n_spirit, cards, cocktails, spirits
  from picked;

  -- Base64 with NO line breaks: Postgres wraps encode(…,'base64') at 76 chars.
  if n_cocktail > 0 then
    attachments := attachments || jsonb_build_array(jsonb_build_object(
      'filename', format('sipply-cocktails-%s.json', tag),
      'content',  translate(encode(convert_to('[' || E'\n' || cocktails || E'\n]\n', 'UTF8'), 'base64'), E'\n', '')));
  end if;
  if n_spirit > 0 then
    attachments := attachments || jsonb_build_array(jsonb_build_object(
      'filename', format('sipply-spirits-%s.json', tag),
      'content',  translate(encode(convert_to('[' || E'\n' || spirits || E'\n]\n', 'UTF8'), 'base64'), E'\n', '')));
  end if;

  html := private.digest_html(label, n_total, n_cocktail, n_spirit, tag, coalesce(cards, ''));

  req := net.http_post(
    url     := 'https://api.resend.com/emails',
    body    := jsonb_build_object(
                 'from', sender,
                 'to', jsonb_build_array(recipient),
                 'subject', case when n_total = 0 then format('Sipply: no drink suggestions in %s', label)
                                 else format('Sipply: %s drink suggestion%s for %s', n_total,
                                             case when n_total = 1 then '' else 's' end, label) end,
                 'html', html)
               || case when jsonb_array_length(attachments) > 0
                       then jsonb_build_object('attachments', attachments) else '{}'::jsonb end,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || api_key),
    timeout_milliseconds := 30000);

  insert into private.submission_digests as x (period_start, status, request_id, attempts, submissions, sent_at)
  values (m, 'pending', req, 1, n_total, now())
  on conflict (period_start) do update
    set status = 'pending', request_id = excluded.request_id,
        attempts = case when x.sent_at < to_ts and now() >= to_ts then 1 else x.attempts + 1 end,
        submissions = excluded.submissions, sent_at = now(), last_error = null;

  return format('queued %s submission(s) for %s as request %s', n_total, label, req);
end;
$$;


-- 5.3 Check, retry, alert. pg_net sends after the transaction commits and
-- records Resend's answer in net._http_response, which it keeps for about
-- six hours; this reads it. A 2xx is delivered. Anything else, or no
-- answer five hours on, is a failure: retried up to 4 attempts in all,
-- then reported to the moderation webhook and left 'failed' (the next
-- day's send job tries once more, and alerts again if that fails too).
create or replace function private.check_submissions_digest() returns void
language plpgsql security definer set search_path = '' as $$
declare
  d private.submission_digests;
  -- Scalars, not a `record`: a record left unassigned by a zero-row SELECT INTO
  -- raises "record is not assigned yet" the moment a field is read.
  r_code int; r_err text; r_timeout boolean; r_body text;
  got boolean;
  hook text;
  err text;
begin
  for d in select * from private.submission_digests where status = 'pending' loop
    r_code := null; r_err := null; r_timeout := null; r_body := null;
    select status_code, error_msg, timed_out, left(content, 500)
      into r_code, r_err, r_timeout, r_body
      from net._http_response where id = d.request_id;
    got := found;

    if got and r_code between 200 and 299 then
      update private.submission_digests set status = 'delivered', checked_at = now()
       where period_start = d.period_start;
    elsif got or d.sent_at < now() - interval '5 hours' then     -- pg_net keeps responses ~6 h
      err := coalesce(r_err, case when r_timeout then 'timed out' end, r_body,
                      'no response recorded');
      update private.submission_digests set status = 'failed', last_error = err, checked_at = now()
       where period_start = d.period_start;
      if d.attempts < 4 then
        perform private.send_submissions_digest(true, d.period_start);
      else
        select decrypted_secret into hook from vault.decrypted_secrets where name = 'report_alert_url';
        if coalesce(btrim(hook), '') <> '' then
          perform net.http_post(url := hook, body := jsonb_build_object('text', format(
            'Sipply: the drink-suggestions email for %s failed 4 times (%s). After fixing it, run: select private.send_submissions_digest(true, %L);',
            to_char(d.period_start, 'FMMonth YYYY'), left(err, 200), d.period_start)));
        end if;
        raise warning 'drink submissions email for % gave up: %', d.period_start, err;
      end if;
    end if;
  end loop;
exception when others then
  raise warning 'check_submissions_digest: %', sqlerrm;
end;
$$;

revoke all on function private.html_escape(text)                                        from public, anon, authenticated;
revoke all on function private.drink_slug(text)                                         from public, anon, authenticated;
revoke all on function private.abv_text(numeric, numeric)                               from public, anon, authenticated;
revoke all on function private.submission_todo(public.drink_submissions)                from public, anon, authenticated;
revoke all on function private.submission_meta(public.drink_submissions, text)          from public, anon, authenticated;
revoke all on function private.submission_entry(public.drink_submissions, text)         from public, anon, authenticated;
revoke all on function private.submission_card_html(public.drink_submissions, text, integer) from public, anon, authenticated;
revoke all on function private.digest_html(text, integer, integer, integer, text, text) from public, anon, authenticated;
revoke all on function private.send_submissions_digest(boolean, date)                   from public, anon, authenticated;
revoke all on function private.check_submissions_digest()                               from public, anon, authenticated;


-- 5.4 Schedule. Re-runnable: unschedule by name, then schedule.
select cron.unschedule(jobid) from cron.job
 where jobname in ('sipply-submissions-send', 'sipply-submissions-check');
select cron.schedule('sipply-submissions-send',  '0 13 * * *',  $$select private.send_submissions_digest()$$);  -- 09:00 AST daily, sends once a month
select cron.schedule('sipply-submissions-check', '20 * * * *', $$select private.check_submissions_digest()$$);


-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('018_drink_submissions') on conflict (version) do nothing;
