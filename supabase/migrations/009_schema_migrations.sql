-- ====================================================================
-- Sipply — migration 009: a record of which migrations are applied
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- WHY THIS EXISTS
--
-- On 27 August 2026 the app's feed was broken in production and nobody
-- knew. Migration 007 had never been run, so public.post_photos did not
-- exist, and the feed's own select embeds it:
--
--   posts?select=...,post_photos(path,taken_at)
--   -> PGRST200: Could not find a relationship between 'posts' and
--                'post_photos' in the schema cache
--
-- Every fetchFeed call failed. It went unnoticed for weeks because the
-- account had no posts, and an errored feed renders exactly like an empty
-- one: "Nothing poured yet". It surfaced only because an unrelated query
-- happened to join that table.
--
-- The root cause is not that someone forgot. It is that migrations here
-- are files a human pastes into a web editor, and nothing anywhere
-- recorded which ones had been pasted. There was no way to ask the
-- question, so nobody could answer it.
-- ====================================================================

create table if not exists public.schema_migrations (
  -- The filename without .sql — '007_post_photos'. Not a number, because
  -- the name is what you match against the directory listing.
  version    text primary key,
  applied_at timestamptz not null default now(),
  -- Optional free text: 'backfilled', 'applied by hand after outage', etc.
  note       text
);

-- Operational metadata, not app data. No client role has any business
-- reading or writing it, and the app never queries it — the checks below
-- are run from the SQL editor, which is also where migrations are applied,
-- so the tool that creates the drift is the tool that reveals it.
alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated;

-- --------------------------------------------------------------------
-- Backfill
--
-- Everything through 008 is confirmed present in production as of
-- 27 August 2026, verified object by object rather than assumed: all 11
-- functions, all 10 check constraints, and all 8 tables were listed and
-- matched against the files before writing these rows.
--
-- 'schema' is the base schema.sql, which is not numbered but is the thing
-- every migration builds on.
-- --------------------------------------------------------------------

insert into public.schema_migrations (version, note) values
  ('schema',                   'base schema.sql; backfilled 27 Aug 2026'),
  ('002_social_graph',         'backfilled 27 Aug 2026'),
  ('003_hardening',            'backfilled 27 Aug 2026'),
  ('004_validate_hardening',   'backfilled 27 Aug 2026'),
  ('005_account_deletion',     'backfilled 27 Aug 2026'),
  ('006_report_and_block',     'backfilled 27 Aug 2026'),
  ('007_post_photos',          'was MISSING in production; applied 27 Aug 2026 after the feed was found broken'),
  ('008_instagram_discovery',  'applied 26 Aug 2026'),
  ('009_schema_migrations',    'this file')
on conflict (version) do nothing;

-- ====================================================================
-- THE CONVENTION, from here on
--
-- Every migration ends with its own row. One line, last statement in the
-- file, so a migration that runs records itself and a migration that fails
-- partway does not claim to have:
--
--   insert into public.schema_migrations (version)
--   values ('010_whatever') on conflict (version) do nothing;
--
-- The existing files 002-008 have had that line added retroactively. They
-- are already recorded by the backfill above, so the line only matters if
-- one of them is ever re-run — but it makes the pattern visible in every
-- file rather than living only in this comment.
--
-- TO CHECK FOR DRIFT
--
-- Paste this and compare the result against `ls supabase/migrations`.
-- Anything in the directory that is not in this list has never run:
--
--   select version, applied_at, note
--   from public.schema_migrations order by version;
--
-- That is the whole mechanism. It does not enforce anything and it cannot
-- run migrations for you — it only makes "which ones are applied?" a
-- question with an answer, which is precisely what was missing.
-- ====================================================================

insert into public.schema_migrations (version)
values ('009_schema_migrations') on conflict (version) do nothing;
