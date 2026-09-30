-- ====================================================================
-- Sipply — migration 012: reports outlive what they report
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- WHAT IT FIXES
--
-- 006 created public.reports with every foreign key ON DELETE CASCADE:
--
--   reporter_id        -> profiles  cascade
--   reported_post_id   -> posts     cascade
--   reported_user_id   -> profiles  cascade
--
-- So a report vanished the moment anyone involved left. The person
-- reported could delete the post, or the account, before a moderator ever
-- opened the table, and nothing would show they had been reported at all.
-- And a reporter who deleted their own account took every report they had
-- filed with them, which is the opposite of what docs/privacy.md promises:
-- "Reports are kept after deletion, without the reporter's identity,
-- because a moderation record that vanishes when the reporter leaves is
-- not a moderation record."
--
-- Separately, nothing stopped one account filing the same report a
-- thousand times, and the app's own report sheet can be tapped twice.
--
-- After this file:
--
--   * Deleting a reporter blanks reporter_id and keeps the report.
--   * Deleting a reported post or person blanks that column and keeps the
--     report, and two new columns keep what a moderator needs to act:
--     reported_author_id (who wrote it, with no foreign key so it survives)
--     and snapshot (the reported text, copied when the report is filed).
--   * One report per reporter per post, and per reporter per person. A
--     repeat fails with 23505, which the app must read as "already
--     reported" and thank the user for, not as a failure
--     (src/lib/moderation.ts, reportPost and reportUser). Builds before
--     10 do not know that and show their generic error on a repeat; the
--     first report is on file either way.
--
-- WHAT THE SNAPSHOT HOLDS
--
-- The caption, drink id and post date for a post report, plus the author's
-- username, display name and bio for either kind. Never the photo path:
-- account deletion removes the file (011), so a path would point at
-- nothing, and copying the image is not something this table should do.
-- docs/privacy.md has to say that a report keeps a copy of the reported
-- text; that change ships with this file.
--
-- ORDER
--
-- Any time after 011. Depends on nothing in it except the `private`
-- schema, which this file also creates if it is missing.
--
-- VERIFY AFTERWARDS (read-only)
--
--   -- Expect three rows, every one confdeltype = 'n' (SET NULL).
--   select conname, confdeltype from pg_constraint
--   where conrelid = 'public.reports'::regclass and contype = 'f'
--   order by conname;
--
--   -- Expect report_subject_at_most_one and no report_has_one_subject.
--   select conname from pg_constraint
--   where conrelid = 'public.reports'::regclass and contype = 'c'
--   order by conname;
--
--   -- Every existing report should now name an author and carry a
--   -- snapshot. Expect 0.
--   select count(*) from public.reports where reported_author_id is null;
--
--   -- Expect reports_prepare.
--   select tgname from pg_trigger
--   where tgrelid = 'public.reports'::regclass and not tgisinternal;
-- ====================================================================

create schema if not exists private;
revoke all on schema private from public;


-- --------------------------------------------------------------------
-- 1. Keep the report when its reporter or its subject goes
--
-- The three foreign keys are found by column and dropped whatever they are
-- called, then re-added under fixed names. 006 created them inline, so
-- they should carry Postgres's default names, but a drop that guessed
-- wrong would silently leave the cascade in place beside the new key, and
-- the report would still be deleted.
-- --------------------------------------------------------------------

alter table public.reports alter column reporter_id drop not null;

do $$
declare
  fk record;
begin
  for fk in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.reports'::regclass
      and c.contype = 'f'
  loop
    execute format('alter table public.reports drop constraint %I', fk.conname);
  end loop;
end $$;

alter table public.reports
  add constraint reports_reporter_id_fkey
    foreign key (reporter_id) references public.profiles (id) on delete set null,
  add constraint reports_reported_post_id_fkey
    foreign key (reported_post_id) references public.posts (id) on delete set null,
  add constraint reports_reported_user_id_fkey
    foreign key (reported_user_id) references public.profiles (id) on delete set null;

-- 006's check demanded exactly one subject on every row, for its whole
-- life. With SET NULL that is no longer true of an old report whose post
-- was deleted, and the check would refuse the SET NULL itself: deleting any
-- reported post, and deleting any reported account, would fail outright.
-- So the standing rule becomes "at most one", and "exactly one" moves to
-- the moment of filing (section 3), which is the only moment a caller
-- chooses it.
alter table public.reports drop constraint if exists report_has_one_subject;
alter table public.reports drop constraint if exists report_subject_at_most_one;
alter table public.reports
  add constraint report_subject_at_most_one
  check (num_nonnulls(reported_post_id, reported_user_id) <= 1);

-- The SET NULL actions look reports up by these columns when a post or a
-- profile is deleted; without indexes every such delete scans the table.
create index if not exists reports_reporter_idx      on public.reports (reporter_id);
create index if not exists reports_reported_post_idx on public.reports (reported_post_id);
create index if not exists reports_reported_user_idx on public.reports (reported_user_id);


-- --------------------------------------------------------------------
-- 2. What a moderator still needs once the subject is gone
-- --------------------------------------------------------------------

-- No foreign key on purpose: it has to outlive the account it names, so a
-- moderator can still see that a deleted post belonged to someone who is
-- reported again next week.
alter table public.reports add column if not exists reported_author_id uuid;
alter table public.reports add column if not exists snapshot jsonb;

create index if not exists reports_author_idx on public.reports (reported_author_id);

-- Builds both from whatever the subject is. SECURITY DEFINER because the
-- reporter may already have blocked the author, and posts_read would then
-- hide the very post being reported.
create or replace function private.report_evidence(
  post uuid,
  person uuid,
  out author uuid,
  out snapshot jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with subject as (
    select
      coalesce(person, (select p.author_id from public.posts p where p.id = post)) as author_id
  )
  select
    s.author_id,
    jsonb_strip_nulls(jsonb_build_object(
      'caption',      (select p.caption    from public.posts p where p.id = post),
      'drink_id',     (select p.drink_id   from public.posts p where p.id = post),
      'posted_at',    (select p.created_at from public.posts p where p.id = post),
      'username',     pr.username,
      'display_name', pr.display_name,
      'bio',          pr.bio
    ))
  from subject s
  left join public.profiles pr on pr.id = s.author_id;
$$;

revoke all on function private.report_evidence(uuid, uuid) from public, anon, authenticated;

-- Reports filed before this file ran get the same evidence now, while
-- their subjects still exist.
update public.reports r
set (reported_author_id, snapshot) = (
  select e.author, e.snapshot
  from private.report_evidence(r.reported_post_id, r.reported_user_id) e
)
where r.snapshot is null;


-- --------------------------------------------------------------------
-- 3. Filing a report
--
-- Runs on every insert, whoever makes it. It enforces the exactly-one
-- rule section 1 took off the table, stamps the time, and fills the two
-- evidence columns itself, overwriting anything the caller sent: a client
-- must not be able to choose what the moderator is told about the post.
-- --------------------------------------------------------------------

create or replace function public.prepare_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if num_nonnulls(new.reported_post_id, new.reported_user_id) <> 1 then
    raise exception 'a report names exactly one post or one person' using errcode = '23514';
  end if;

  new.created_at := now();

  select e.author, e.snapshot
    into new.reported_author_id, new.snapshot
  from private.report_evidence(new.reported_post_id, new.reported_user_id) e;

  return new;
end;
$$;

revoke all on function public.prepare_report() from public, anon, authenticated;

drop trigger if exists reports_prepare on public.reports;
create trigger reports_prepare
  before insert on public.reports
  for each row execute function public.prepare_report();


-- --------------------------------------------------------------------
-- 4. One report per reporter per subject
--
-- Repeats are removed first, keeping each reporter's earliest report of a
-- subject, because the unique indexes cannot be built over duplicates.
-- They add nothing a moderator needs: the first one already says who
-- reported what and why.
--
-- A second report now fails with 23505. That is the app's cue to say
-- "thanks" again rather than show an error; nothing about the first
-- report changes. Reports whose reporter has since been deleted have a null
-- reporter_id, which a unique index never treats as a duplicate, so they
-- are all kept.
-- --------------------------------------------------------------------

delete from public.reports
where id in (
  select ranked.id
  from (
    select r.id,
           row_number() over (
             partition by r.reporter_id, r.reported_post_id
             order by r.created_at, r.id
           ) as n
    from public.reports r
    where r.reporter_id is not null
      and r.reported_post_id is not null
  ) ranked
  where ranked.n > 1
);

delete from public.reports
where id in (
  select ranked.id
  from (
    select r.id,
           row_number() over (
             partition by r.reporter_id, r.reported_user_id
             order by r.created_at, r.id
           ) as n
    from public.reports r
    where r.reporter_id is not null
      and r.reported_user_id is not null
  ) ranked
  where ranked.n > 1
);

create unique index if not exists reports_once_per_post
  on public.reports (reporter_id, reported_post_id)
  where reported_post_id is not null;

create unique index if not exists reports_once_per_user
  on public.reports (reporter_id, reported_user_id)
  where reported_user_id is not null;


-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('012_report_retention') on conflict (version) do nothing;
