-- ====================================================================
-- Clink — social schema
--
-- Paste into the Supabase SQL Editor and press Run. Safe to re-run.
--
-- Every table has Row Level Security ON. The app ships a publishable
-- key, which is public by design — RLS is what actually protects the
-- data, so no policy may ever trust the client.
-- ====================================================================

-- --------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  username     text unique not null,
  display_name text not null,
  -- Avatar tint. Hex from the app's palette.
  accent       text not null default '#633444',
  bio          text,
  created_at   timestamptz not null default now()
);

create table if not exists public.follows (
  follower_id  uuid not null references public.profiles on delete cascade,
  following_id uuid not null references public.profiles on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  -- You cannot follow yourself; your own posts are added to the feed
  -- by the client, not by an edge.
  constraint no_self_follow check (follower_id <> following_id)
);

create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles on delete cascade,
  -- Matches an id in the app's bundled drinks.json, not a DB row —
  -- the 460-drink index ships with the app and never changes per user.
  drink_id   text not null,
  caption    text not null default '',
  -- Path inside the 'pours' storage bucket. Null when no photo.
  photo_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.likes (
  post_id    uuid not null references public.posts on delete cascade,
  user_id    uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- --------------------------------------------------------------------
-- Indexes — the feed query sorts by recency within a follow set
-- --------------------------------------------------------------------

create index if not exists posts_author_created_idx on public.posts (author_id, created_at desc);
create index if not exists posts_created_idx        on public.posts (created_at desc);
create index if not exists follows_follower_idx     on public.follows (follower_id);
create index if not exists follows_following_idx    on public.follows (following_id);
create index if not exists likes_post_idx           on public.likes (post_id);

-- --------------------------------------------------------------------
-- Auto-create a profile when someone signs up
--
-- security definer so it can write to public.profiles before the new
-- user has a session. search_path is pinned to empty per Supabase's
-- linter guidance — an unpinned search_path on a definer function is a
-- privilege-escalation vector.
-- --------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name, accent)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      'pour_' || substr(replace(new.id::text, '-', ''), 1, 8)
    ),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), 'New collector'),
    coalesce(nullif(new.raw_user_meta_data ->> 'accent', ''), '#633444')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------------
-- Row Level Security
-- --------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.follows  enable row level security;
alter table public.posts    enable row level security;
alter table public.likes    enable row level security;

-- Profiles: readable by any signed-in user (you must be able to find
-- people to follow), writable only by their owner.
drop policy if exists profiles_read       on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_read on public.profiles
  for select to authenticated using (true);

create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (auth.uid() = id);

create policy profiles_update_own on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Follows: readable by all (follower counts), but you may only create
-- and remove edges where YOU are the follower.
drop policy if exists follows_read       on public.follows;
drop policy if exists follows_insert_own on public.follows;
drop policy if exists follows_delete_own on public.follows;

create policy follows_read on public.follows
  for select to authenticated using (true);

create policy follows_insert_own on public.follows
  for insert to authenticated with check (auth.uid() = follower_id);

create policy follows_delete_own on public.follows
  for delete to authenticated using (auth.uid() = follower_id);

-- Posts: readable by all signed-in users so profiles are browsable;
-- the feed narrows to your follow set client-side. Only the author may
-- write or remove their own.
drop policy if exists posts_read       on public.posts;
drop policy if exists posts_insert_own on public.posts;
drop policy if exists posts_update_own on public.posts;
drop policy if exists posts_delete_own on public.posts;

create policy posts_read on public.posts
  for select to authenticated using (true);

create policy posts_insert_own on public.posts
  for insert to authenticated with check (auth.uid() = author_id);

create policy posts_update_own on public.posts
  for update to authenticated using (auth.uid() = author_id) with check (auth.uid() = author_id);

create policy posts_delete_own on public.posts
  for delete to authenticated using (auth.uid() = author_id);

-- Likes: counts are public, but you may only like as yourself.
drop policy if exists likes_read       on public.likes;
drop policy if exists likes_insert_own on public.likes;
drop policy if exists likes_delete_own on public.likes;

create policy likes_read on public.likes
  for select to authenticated using (true);

create policy likes_insert_own on public.likes
  for insert to authenticated with check (auth.uid() = user_id);

create policy likes_delete_own on public.likes
  for delete to authenticated using (auth.uid() = user_id);

-- --------------------------------------------------------------------
-- Storage — proof photos
--
-- Private bucket, so there are no public links and the app reads through
-- signed URLs. Note what pours_read actually grants, though: ANY signed-in
-- user may select any object in the bucket, so photos are enumerable, not
-- merely unguessable. That matches posts_read (every post is visible to
-- every account) and is intended for a social feed — but it means there is
-- no private-account concept, and self-registration is open. Writes are the
-- real boundary: objects are namespaced pours/<uid>/<file> and insert and
-- delete are pinned to the owning uid.
-- --------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('pours', 'pours', false)
on conflict (id) do nothing;

drop policy if exists pours_read       on storage.objects;
drop policy if exists pours_insert_own on storage.objects;
drop policy if exists pours_delete_own on storage.objects;

create policy pours_read on storage.objects
  for select to authenticated using (bucket_id = 'pours');

create policy pours_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pours'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy pours_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'pours'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
