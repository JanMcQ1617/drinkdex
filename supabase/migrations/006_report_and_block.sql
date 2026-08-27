-- ====================================================================
-- Clink — reporting and blocking
--
-- Paste into the Supabase SQL Editor and press Run. Safe to re-run.
--
-- App Store guideline 1.2 requires any app carrying user-generated
-- content to provide a way to report objectionable content and a way to
-- block abusive users. Clink carries photos, captions and usernames from
-- strangers and had neither.
--
-- FILTERING LIVES IN RLS, NOT IN THE CLIENT. A blocked user's posts
-- disappear from every query at once — feed, profile grid, anything
-- written later — and a hostile client cannot ask for them anyway, which
-- a client-side .not(...in) filter would happily allow.
-- ====================================================================

-- --------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles on delete cascade,
  blocked_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

create table if not exists public.reports (
  id                 uuid primary key default gen_random_uuid(),
  reporter_id        uuid not null references public.profiles on delete cascade,
  -- Nullable because a report can be against a post OR a person. Exactly
  -- one is set; the check below enforces it rather than trusting callers.
  reported_post_id   uuid references public.posts on delete cascade,
  reported_user_id   uuid references public.profiles on delete cascade,
  reason             text not null,
  note               text,
  created_at         timestamptz not null default now(),
  constraint report_has_one_subject check (
    (reported_post_id is not null and reported_user_id is null) or
    (reported_post_id is null and reported_user_id is not null)
  ),
  constraint report_reason_known check (
    reason in ('spam', 'harassment', 'nudity', 'violence', 'underage', 'other')
  ),
  constraint report_note_len check (note is null or char_length(note) <= 1000)
);

create index if not exists blocks_blocker_idx  on public.blocks (blocker_id);
create index if not exists blocks_blocked_idx  on public.blocks (blocked_id);
create index if not exists reports_created_idx on public.reports (created_at desc);

-- --------------------------------------------------------------------
-- Blocking removes the relationship in BOTH directions
--
-- Leaving a follow edge in place after a block means the blocked person
-- still counts as a follower and still appears in follower counts, which
-- is not what "block" means to anyone who taps it.
-- --------------------------------------------------------------------

create or replace function public.drop_follows_on_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return new;
end;
$$;

drop trigger if exists on_block_drop_follows on public.blocks;
create trigger on_block_drop_follows
  after insert on public.blocks
  for each row execute function public.drop_follows_on_block();

-- --------------------------------------------------------------------
-- RLS
-- --------------------------------------------------------------------

alter table public.blocks  enable row level security;
alter table public.reports enable row level security;

-- Blocks are private to the blocker. Deliberately NOT readable by the
-- blocked party: telling someone they have been blocked is how blocking
-- turns into an escalation.
drop policy if exists blocks_read_own   on public.blocks;
drop policy if exists blocks_insert_own on public.blocks;
drop policy if exists blocks_delete_own on public.blocks;

create policy blocks_read_own on public.blocks
  for select to authenticated using (auth.uid() = blocker_id);

create policy blocks_insert_own on public.blocks
  for insert to authenticated with check (auth.uid() = blocker_id);

create policy blocks_delete_own on public.blocks
  for delete to authenticated using (auth.uid() = blocker_id);

-- Reports are write-only from the app's point of view: you may file one
-- and read back your own, but nobody can enumerate what others reported.
-- Moderation happens in the Supabase dashboard, not in the client.
drop policy if exists reports_read_own   on public.reports;
drop policy if exists reports_insert_own on public.reports;

create policy reports_read_own on public.reports
  for select to authenticated using (auth.uid() = reporter_id);

create policy reports_insert_own on public.reports
  for insert to authenticated with check (auth.uid() = reporter_id);

-- --------------------------------------------------------------------
-- Block test, as a definer function
--
-- The read policies below cannot query public.blocks directly. A policy's
-- subquery is itself subject to the referenced table's RLS, and
-- blocks_read_own deliberately exposes only rows where YOU are the
-- blocker — so the "they blocked me" direction would return no rows and
-- the hiding would silently work one way only. That failure is invisible
-- in testing unless you check from the blocked account.
--
-- security definer lets the check see both directions without exposing
-- the rows themselves, so a user still cannot enumerate who blocked
-- them; they can only observe that content is absent.
-- --------------------------------------------------------------------

create or replace function public.blocked_with(other uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = other)
       or (b.blocker_id = other and b.blocked_id = auth.uid())
  );
$$;

revoke all on function public.blocked_with(uuid) from public, anon;
grant execute on function public.blocked_with(uuid) to authenticated;

-- --------------------------------------------------------------------
-- Blocking hides content, in both directions
--
-- Replaces posts_read and profiles_read from schema.sql. Symmetric on
-- purpose: blocking someone hides you from them as well, so a block
-- cannot be used to keep watching a person who wanted you gone.
-- --------------------------------------------------------------------

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts
  for select to authenticated using (not public.blocked_with(author_id));

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated using (not public.blocked_with(id));

-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('006_report_and_block') on conflict (version) do nothing;
