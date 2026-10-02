-- ====================================================================
-- Sipply — migration 019: reels (short videos)
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- WHAT IT ADDS
--
--   1. public.reels and public.reel_likes, with RLS that mirrors posts and
--      likes: readable by every signed-in account not blocked either way,
--      writable only by the author. A reel the caller has reported is also
--      hidden from the caller.
--   2. A private 'reels' bucket: 6 MiB per file, video/quicktime,
--      video/mp4 and image/jpeg only, block-aware reads, and uploads only
--      into your own folder under file names derived from a uuid.
--   3. Limits: 3 reels per rolling 24 hours and 20 live reels per account
--      (trigger), and at most 2 x live + 4 files in your folder (storage
--      policy), so files no row points at cannot pile up. Tight on purpose
--      while the project is on Supabase's free tier: the app stops a
--      recording at 5 MB, so one account's 20 reels and their posters come
--      to about 100 MB, and a client that ignores the app's limits is still
--      held to 44 files of at most 6 MiB each. Section 1 holds the two
--      numbers; raise them there when the project moves to Pro.
--   4. Captions go through the 011 content filter; created_at is the
--      server's (011's pin_created_at).
--   5. Reports can name a reel (reported_reel_id), keep a snapshot of it,
--      and alert the moderation channel as 'a reel'.
--   6. delete_own_account refuses while anything is left in pours/<uid>/
--      OR reels/<uid>/. Same error string, 'photos_remaining', so every
--      installed build reads it as before.
--   7. my_reel_quota(): the caller's counts and limits, so the recorder
--      can say "come back tomorrow" before anyone films anything.
--
-- ORDER
--
-- After 018 (by number only). Depends on 011 (my_block_set, is_objectionable, pin_created_at,
-- reject_objectionable_post) and 012 (reports.snapshot, prepare_report);
-- section 0 stops the file if they are missing. Apply BEFORE any build with
-- EXPO_PUBLIC_REELS=on reaches anyone. Installed builds without reels notice
-- nothing: they never write reels, their reports name a post or a person,
-- and their accounts have no files under reels/.
--
-- DO NOT RE-RUN 012 AFTER THIS FILE. 012 drops every foreign key on
-- public.reports and puts back the two-subject prepare_report, which would
-- refuse every reel report.
--
-- ALSO DO BY HAND (dashboard, not SQL)
--
--   * Storage -> Settings: the global upload size limit must be at least
--     6 MB, or it caps this bucket's 6 MiB below what a 30-second reel
--     needs. The default, 50 MB, is fine.
--   * report_alert_url in Vault (013): if it was never stored, store it
--     now. Reels add moderation load, and every reel report alerts there.
--
-- VERIFY AFTERWARDS (all read-only)
--
--   -- Expect: reels | false | 6291456 | {video/quicktime,video/mp4,image/jpeg}
--   select id, public, file_size_limit, allowed_mime_types
--   from storage.buckets where id = 'reels';
--
--   -- Expect reels_objects_delete_own, reels_objects_insert_own,
--   -- reels_objects_read, and reels_delete_own, reels_insert_own, reels_read,
--   -- reel_likes_delete_own, reel_likes_insert_own, reel_likes_read.
--   select tablename, policyname from pg_policies
--   where policyname like 'reel%' order by 1, 2;
--
--   -- Expect reels_guard, reels_pin_created_at, reels_reject_objectionable.
--   select tgname from pg_trigger
--   where tgrelid = 'public.reels'::regclass and not tgisinternal order by 1;
--
--   -- Expect true: the account check now covers both buckets.
--   select prosrc ilike '%''reels''%'
--   from pg_proc where oid = 'public.delete_own_account()'::regprocedure;
--
--   -- Expect true: reports can name a reel.
--   select prosrc ilike '%reported_reel_id%'
--   from pg_proc where oid = 'public.prepare_report()'::regprocedure;
--
--   -- Smoke test as a real account, rolled back. Paste your user id.
--   -- Expect 0 | 0 | 0 | 3 | 20 on an account with no reels.
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     json_build_object('sub', '<your user id>', 'role', 'authenticated')::text, true);
--   select * from public.my_reel_quota();
--   rollback;
-- ====================================================================


-- --------------------------------------------------------------------
-- 0. Stop here unless 011 and 012 are applied
-- --------------------------------------------------------------------

do $$
begin
  if to_regprocedure('private.my_block_set()') is null
     or to_regprocedure('public.is_objectionable(text, boolean)') is null
     or to_regprocedure('public.reject_objectionable_post()') is null
     or to_regprocedure('public.pin_created_at()') is null
     or to_regprocedure('public.prepare_report()') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'reports' and column_name = 'snapshot'
     ) then
    raise exception '019 needs 011 and 012 applied first';
  end if;
end;
$$;


-- --------------------------------------------------------------------
-- 1. The limits, in one place
--
-- Change a number here and the trigger, the storage policy and
-- my_reel_quota all follow. The app's copy reads the limits back from
-- my_reel_quota, so it follows too.
-- --------------------------------------------------------------------

create or replace function private.reel_day_limit()
returns integer language sql immutable set search_path = '' as $$ select 3 $$;

create or replace function private.reel_live_limit()
returns integer language sql immutable set search_path = '' as $$ select 20 $$;

revoke all on function private.reel_day_limit()  from public, anon, authenticated;
revoke all on function private.reel_live_limit() from public, anon, authenticated;


-- --------------------------------------------------------------------
-- 2. Tables
--
-- The id is made on the phone so the files can be named after it before
-- the row exists; the CHECKs then tie each path to its own row and its
-- author's folder, so a row can never point at somebody else's file.
-- --------------------------------------------------------------------

create table if not exists public.reels (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles on delete cascade,
  video_path  text not null,
  poster_path text not null,
  caption     text not null default '',
  -- An id in the bundled drinks.json, like posts.drink_id. Optional.
  drink_id    text,
  duration_ms integer not null,
  -- Filmed with the phone sideways: the viewer letterboxes instead of
  -- cropping. Read from the poster's dimensions on the phone.
  landscape   boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint reels_caption_len  check (char_length(caption) <= 300),
  constraint reels_drink_id_len check (drink_id is null or char_length(drink_id) between 1 and 100),
  constraint reels_duration     check (duration_ms between 1000 and 31000),
  constraint reels_video_path   check (
    video_path in (author_id::text || '/' || id::text || '.mov',
                   author_id::text || '/' || id::text || '.mp4')
  ),
  constraint reels_poster_path  check (poster_path = author_id::text || '/' || id::text || '.jpg')
);

-- The Reels feed: newest first, keyset-paged on (created_at, id).
create index if not exists reels_created_idx        on public.reels (created_at desc, id desc);
-- A profile's reels, and the quota counts.
create index if not exists reels_author_created_idx on public.reels (author_id, created_at desc);

create table if not exists public.reel_likes (
  reel_id    uuid not null references public.reels on delete cascade,
  user_id    uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reel_id, user_id)
);

-- "Which of these have I liked", and the user_id side of the delete cascade
-- (the same reasoning as likes_user_idx in 014).
create index if not exists reel_likes_user_idx on public.reel_likes (user_id, reel_id);

-- Nobody edits a reel in v1; delete and post again. No update grant at all,
-- on top of having no update policy.
revoke all on public.reels      from anon;
revoke all on public.reel_likes from anon;
revoke update, truncate, references, trigger on public.reels      from authenticated;
revoke update, truncate, references, trigger on public.reel_likes from authenticated;


-- --------------------------------------------------------------------
-- 3. Reports can name a reel
--
-- Same shape as 012: SET NULL so the report outlives the reel, a snapshot
-- of the text when it is filed (never the file path: deletion removes the
-- file, and a path to nothing helps no moderator), one report per reporter
-- per reel.
-- --------------------------------------------------------------------

alter table public.reports add column if not exists reported_reel_id uuid;

alter table public.reports drop constraint if exists reports_reported_reel_id_fkey;
alter table public.reports
  add constraint reports_reported_reel_id_fkey
  foreign key (reported_reel_id) references public.reels (id) on delete set null;

create index if not exists reports_reported_reel_idx on public.reports (reported_reel_id);
create unique index if not exists reports_once_per_reel
  on public.reports (reporter_id, reported_reel_id)
  where reported_reel_id is not null;

alter table public.reports drop constraint if exists report_subject_at_most_one;
alter table public.reports
  add constraint report_subject_at_most_one
  check (num_nonnulls(reported_post_id, reported_user_id, reported_reel_id) <= 1);

create or replace function private.report_evidence(
  post uuid,
  person uuid,
  reel uuid,
  out author uuid,
  out snapshot jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with subject as (
    select coalesce(
      person,
      (select p.author_id from public.posts p where p.id = post),
      (select r.author_id from public.reels r where r.id = reel)
    ) as author_id
  )
  select
    s.author_id,
    jsonb_strip_nulls(jsonb_build_object(
      'kind',         case when post is not null then 'post'
                           when reel is not null then 'reel'
                           else 'account' end,
      'caption',      coalesce((select p.caption    from public.posts p where p.id = post),
                               (select r.caption    from public.reels r where r.id = reel)),
      'drink_id',     coalesce((select p.drink_id   from public.posts p where p.id = post),
                               (select r.drink_id   from public.reels r where r.id = reel)),
      'posted_at',    coalesce((select p.created_at from public.posts p where p.id = post),
                               (select r.created_at from public.reels r where r.id = reel)),
      'duration_ms',  (select r.duration_ms from public.reels r where r.id = reel),
      'username',     pr.username,
      'display_name', pr.display_name,
      'bio',          pr.bio
    ))
  from subject s
  left join public.profiles pr on pr.id = s.author_id;
$$;

revoke all on function private.report_evidence(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.prepare_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if num_nonnulls(new.reported_post_id, new.reported_user_id, new.reported_reel_id) <> 1 then
    raise exception 'a report names exactly one post, reel or person' using errcode = '23514';
  end if;

  new.created_at := now();

  select e.author, e.snapshot
    into new.reported_author_id, new.snapshot
  from private.report_evidence(new.reported_post_id, new.reported_user_id, new.reported_reel_id) e;

  -- Nobody reports their own post, reel or profile. The app never offers
  -- it, but the table would take it: a self-report of a reel then hides
  -- that reel from its own author (reels_read), and the orphan sweep reads
  -- its files as abandoned and removes them, leaving everyone else a reel
  -- with nothing to play.
  if new.reported_author_id = new.reporter_id then
    raise exception 'you cannot report your own content' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.prepare_report() from public, anon, authenticated;

-- The two-argument version from 012 has no caller left.
drop function if exists private.report_evidence(uuid, uuid);

-- 013's alert, with reels named. Still never carries the content.
create or replace function public.alert_new_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target text;
begin
  select ds.decrypted_secret into target
  from vault.decrypted_secrets ds
  where ds.name = 'report_alert_url'
  limit 1;

  if target is null or btrim(target) = '' then
    return null;
  end if;

  perform net.http_post(
    url     := target,
    body    := jsonb_build_object(
      'text',
      format(
        'Sipply: new report (%s, %s) at %s. Review it in the dashboard: table public.reports, id %s.',
        new.reason,
        case when new.reported_post_id is not null then 'a post'
             when new.reported_reel_id is not null then 'a reel'
             else 'an account' end,
        to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'),
        new.id
      )
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  return null;
exception
  when others then
    raise warning 'report alert not sent for report %: %', new.id, sqlerrm;
    return null;
end;
$$;

revoke all on function public.alert_new_report() from public, anon, authenticated;


-- --------------------------------------------------------------------
-- 4. Helpers the policies read once per query
--
-- Same pattern and the same load-bearing cast as my_block_set (011):
-- wrapped in (select ...) the planner evaluates it once, and the coalesce
-- keeps "reported nothing" from hiding everything.
-- --------------------------------------------------------------------

create or replace function private.my_reported_reels()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(r.reported_reel_id), '{}'::uuid[])
  from public.reports r
  where r.reporter_id = auth.uid()
    and r.reported_reel_id is not null;
$$;

revoke all on function private.my_reported_reels() from public, anon;
grant execute on function private.my_reported_reels() to authenticated;

-- Storage's insert check. Two rules: never more than two files a reel plus
-- four spare (one failed attempt's poster and video, twice), and never more
-- than two files per allowed reel in a day plus the same spare. A file is
-- counted while it exists, so a failed attempt the app cleaned up costs
-- nothing; one it could not clean up is swept by sweepOrphanReelFiles.
create or replace function private.reel_upload_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select count(*) as files,
           count(*) filter (where o.created_at > now() - interval '24 hours') as files_today
    from storage.objects o
    where o.bucket_id = 'reels'
      and (storage.foldername(o.name))[1] = auth.uid()::text
  )
  select m.files < 2 * (select count(*) from public.reels r where r.author_id = auth.uid()) + 4
     and m.files_today < 2 * private.reel_day_limit() + 4
  from mine m;
$$;

revoke all on function private.reel_upload_allowed() from public, anon;
grant execute on function private.reel_upload_allowed() to authenticated;


-- --------------------------------------------------------------------
-- 5. Triggers on reels
--
-- Same-timing triggers fire in name order: reels_guard, then
-- reels_pin_created_at, then reels_reject_objectionable. pin_created_at
-- and reject_objectionable_post (011) only read created_at and caption,
-- so they serve reels unchanged.
-- --------------------------------------------------------------------

create or replace function public.guard_reel_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  today integer;
  live  integer;
begin
  -- Serialises one author's concurrent inserts, as charge_discovery does
  -- (011): parallel posts must not all read the same count and pass.
  perform pg_advisory_xact_lock(hashtextextended('reels:' || new.author_id::text, 0));

  select count(*) filter (where r.created_at > now() - interval '24 hours'),
         count(*)
    into today, live
  from public.reels r
  where r.author_id = new.author_id;

  if today >= private.reel_day_limit() then
    raise exception 'reel_quota_day'
      using errcode = 'P0001',
            detail  = format('%s reels in the last 24 hours; the limit is %s', today, private.reel_day_limit()),
            hint    = 'Try again tomorrow.';
  end if;

  if live >= private.reel_live_limit() then
    raise exception 'reel_quota_total'
      using errcode = 'P0001',
            detail  = format('%s reels posted; the limit is %s', live, private.reel_live_limit()),
            hint    = 'Delete a reel to post another.';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_reel_insert() from public, anon, authenticated;

drop trigger if exists reels_guard on public.reels;
create trigger reels_guard
  before insert on public.reels
  for each row execute function public.guard_reel_insert();

drop trigger if exists reels_pin_created_at on public.reels;
create trigger reels_pin_created_at
  before insert or update on public.reels
  for each row execute function public.pin_created_at();

drop trigger if exists reels_reject_objectionable on public.reels;
create trigger reels_reject_objectionable
  before insert or update of caption on public.reels
  for each row execute function public.reject_objectionable_post();


-- --------------------------------------------------------------------
-- 6. RLS
-- --------------------------------------------------------------------

alter table public.reels      enable row level security;
alter table public.reel_likes enable row level security;

drop policy if exists reels_read       on public.reels;
drop policy if exists reels_insert_own on public.reels;
drop policy if exists reels_delete_own on public.reels;

create policy reels_read on public.reels
  for select to authenticated
  using (
    not (author_id = any ((select private.my_block_set())::uuid[]))
    and not (id = any ((select private.my_reported_reels())::uuid[]))
  );

create policy reels_insert_own on public.reels
  for insert to authenticated with check (auth.uid() = author_id);

create policy reels_delete_own on public.reels
  for delete to authenticated using (auth.uid() = author_id);

drop policy if exists reel_likes_read       on public.reel_likes;
drop policy if exists reel_likes_insert_own on public.reel_likes;
drop policy if exists reel_likes_delete_own on public.reel_likes;

create policy reel_likes_read on public.reel_likes
  for select to authenticated
  using (not (user_id = any ((select private.my_block_set())::uuid[])));

-- The subquery runs under reels_read, so a reel hidden by a block or by
-- your own report cannot be liked even by someone who kept its id.
create policy reel_likes_insert_own on public.reel_likes
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.reels r where r.id = reel_id)
  );

create policy reel_likes_delete_own on public.reel_likes
  for delete to authenticated using (auth.uid() = user_id);


-- --------------------------------------------------------------------
-- 7. The bucket
-- --------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reels', 'reels', false,
  6 * 1024 * 1024,
  array['video/quicktime', 'video/mp4', 'image/jpeg']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists reels_objects_read       on storage.objects;
drop policy if exists reels_objects_insert_own on storage.objects;
drop policy if exists reels_objects_delete_own on storage.objects;

-- Same rule as pours_read (011): list, download and createSignedUrl all
-- stop at a block, either way. Your own folder is never in the set, so the
-- account sweep still sees everything.
create policy reels_objects_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'reels'
    and not (coalesce((storage.foldername(name))[1], '') = any ((select private.my_block_set())::text[]))
  );

-- Your folder, a uuid file name with one of three extensions, and the
-- file-count rule above. No update policy, so nothing is ever overwritten.
create policy reels_objects_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'reels'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(mov|mp4|jpg)$'
    and private.reel_upload_allowed()
  );

create policy reels_objects_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'reels'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- --------------------------------------------------------------------
-- 8. Account deletion covers both buckets
--
-- Supersedes 011's body. The client empties pours/<uid>/ and reels/<uid>/
-- through the Storage API first; this refuses while either holds anything.
-- The message stays 'photos_remaining' so every installed build reads it.
-- Any later migration that replaces this function must keep 'reels'.
-- --------------------------------------------------------------------

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  remaining integer;
begin
  if uid is null then
    raise exception 'not signed in: delete_own_account got no auth.uid()' using errcode = '28000';
  end if;

  select count(*) into remaining
  from storage.objects o
  where o.bucket_id in ('pours', 'reels')
    and (storage.foldername(o.name))[1] = uid::text;

  if remaining > 0 then
    raise exception 'photos_remaining'
      using errcode = 'P0001',
            detail  = format('%s file(s) still under pours/%s/ or reels/%s/', remaining, uid, uid),
            hint    = 'Remove them through the Storage API, then call delete_own_account again.';
  end if;

  -- Cascades to profiles, and from there to reels and reel_likes as well.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;


-- --------------------------------------------------------------------
-- 9. The caller's quota, for the recorder's gate
-- --------------------------------------------------------------------

create or replace function public.my_reel_quota()
returns table (
  posted_today integer,
  live         integer,
  files        integer,
  day_limit    integer,
  live_limit   integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::int from public.reels r
      where r.author_id = auth.uid() and r.created_at > now() - interval '24 hours'),
    (select count(*)::int from public.reels r where r.author_id = auth.uid()),
    (select count(*)::int from storage.objects o
      where o.bucket_id = 'reels' and (storage.foldername(o.name))[1] = auth.uid()::text),
    private.reel_day_limit(),
    private.reel_live_limit();
$$;

revoke all on function public.my_reel_quota() from public, anon;
grant execute on function public.my_reel_quota() to authenticated;


-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('019_reels') on conflict (version) do nothing;
