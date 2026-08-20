-- ====================================================================
-- Clink — several photos per drink, one post
--
-- Paste into the Supabase SQL Editor and press Run. Safe to re-run.
--
-- Logging the same drink twice used to create two unrelated posts, so a
-- profile filled up with duplicates of one entry and the feed showed the
-- same drink repeatedly from one person. A drink is now ONE post per
-- person, carrying as many photos as they have taken of it.
--
-- posts.photo_path is KEPT as a denormalised preview rather than
-- dropped. Every existing read path — the feed, the profile grid, the
-- tiles — already selects it, and a trigger keeps it pointing at the
-- newest photo. That leaves this migration additive for readers: nothing
-- that works today stops working.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. The photos
-- --------------------------------------------------------------------

create table if not exists public.post_photos (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts on delete cascade,
  -- Path inside the 'pours' bucket, same convention as posts.photo_path.
  path       text not null,
  -- When the picture was TAKEN, which is what orders the carousel. Falls
  -- back to insertion time when the camera gives us nothing.
  taken_at   timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (post_id, path)
);

create index if not exists post_photos_post_idx on public.post_photos (post_id, taken_at desc);

-- --------------------------------------------------------------------
-- 2. Move what already exists into it
--
-- Runs before the unique constraint below, because today's data can
-- legitimately contain several posts for one drink and the constraint
-- would reject them.
-- --------------------------------------------------------------------

insert into public.post_photos (post_id, path, taken_at, created_at)
select p.id, p.photo_path, p.created_at, p.created_at
from public.posts p
where p.photo_path is not null
on conflict (post_id, path) do nothing;

-- --------------------------------------------------------------------
-- 3. Collapse duplicate posts into the earliest one
--
-- The oldest post for a drink is the one that gets kept: it holds the
-- likes and the original caption, and its created_at is when the person
-- actually first logged that drink.
-- --------------------------------------------------------------------

do $$
declare
  keeper record;
begin
  for keeper in
    select author_id, drink_id, min(created_at) as first_at
    from public.posts
    group by author_id, drink_id
    having count(*) > 1
  loop
    -- Photos from the losing posts move to the keeper.
    update public.post_photos ph
    set post_id = (
      select id from public.posts
      where author_id = keeper.author_id and drink_id = keeper.drink_id
        and created_at = keeper.first_at
      limit 1
    )
    where ph.post_id in (
      select id from public.posts
      where author_id = keeper.author_id and drink_id = keeper.drink_id
        and created_at <> keeper.first_at
    );

    delete from public.posts
    where author_id = keeper.author_id and drink_id = keeper.drink_id
      and created_at <> keeper.first_at;
  end loop;
end $$;

-- --------------------------------------------------------------------
-- 4. One post per drink per person, from here on
-- --------------------------------------------------------------------

alter table public.posts drop constraint if exists posts_one_per_drink;
alter table public.posts add constraint posts_one_per_drink unique (author_id, drink_id);

-- --------------------------------------------------------------------
-- 5. Keep posts.photo_path pointing at the newest photo
--
-- In a trigger rather than in the client so it holds however a photo
-- arrives, and so a client that forgets cannot leave the preview stale.
-- --------------------------------------------------------------------

create or replace function public.sync_post_preview()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.post_id, old.post_id);
begin
  update public.posts
  set photo_path = (
    select path from public.post_photos
    where post_id = target
    order by taken_at desc, created_at desc
    limit 1
  )
  where id = target;
  return null;
end;
$$;

drop trigger if exists on_post_photo_change on public.post_photos;
create trigger on_post_photo_change
  after insert or update or delete on public.post_photos
  for each row execute function public.sync_post_preview();

-- --------------------------------------------------------------------
-- 6. RLS — a photo is exactly as visible as its post
--
-- Reuses the posts policy by existence check rather than restating the
-- block rules, so blocking keeps working here without a second copy of
-- the logic that could drift.
-- --------------------------------------------------------------------

alter table public.post_photos enable row level security;

drop policy if exists post_photos_read       on public.post_photos;
drop policy if exists post_photos_insert_own on public.post_photos;
drop policy if exists post_photos_delete_own on public.post_photos;

create policy post_photos_read on public.post_photos
  for select to authenticated using (
    exists (select 1 from public.posts p where p.id = post_id)
  );

create policy post_photos_insert_own on public.post_photos
  for insert to authenticated with check (
    exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  );

create policy post_photos_delete_own on public.post_photos
  for delete to authenticated using (
    exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  );
