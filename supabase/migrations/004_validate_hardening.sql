-- ====================================================================
-- Clink — validate the 003 constraints
--
-- Paste into the Supabase SQL Editor and press Run. Safe to re-run.
--
-- 003 added its constraints NOT VALID so no existing row could block the
-- migration. They have been enforcing on every INSERT and UPDATE since,
-- but Postgres has never checked the rows that were already there.
--
-- This validates them. Run it while the table is small — validation
-- takes a SHARE UPDATE EXCLUSIVE lock, which is cheap on a few hundred
-- rows and expensive on a few million.
--
-- An error here is INFORMATION, not a failure: it means an existing row
-- violates the rule, and it names the constraint. Nothing is written and
-- nothing is broken — fix the row, then re-run.
-- ====================================================================

alter table public.posts    validate constraint posts_caption_len;
alter table public.profiles validate constraint profiles_bio_len;
alter table public.profiles validate constraint profiles_display_name_len;
alter table public.profiles validate constraint profiles_username_shape;
alter table public.profiles validate constraint profiles_accent_hex;

-- Confirmation: every row should read convalidated = true.
select
  conrelid::regclass as table_name,
  conname            as constraint_name,
  convalidated
from pg_constraint
where conname in (
  'posts_caption_len',
  'profiles_bio_len',
  'profiles_display_name_len',
  'profiles_username_shape',
  'profiles_accent_hex'
)
order by table_name, constraint_name;

-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('004_validate_hardening') on conflict (version) do nothing;
