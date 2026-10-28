-- ====================================================================
-- Sipply — migration 026: places (tag the bar where a drink was had)
--
-- For specs/v4.8-places/spec.md §2 (as reworked by §0.5, 26 Oct 2026).
-- supabase/schema.sql holds the same objects.
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- READ, NOT RUN. Like 021 to 025, nothing here has been executed: the
-- machine it was written on has no psql, postgres, docker or supabase CLI.
-- It was proven by reading every statement against supabase/schema.sql's
-- real names: posts (id, author_id, drink_id), post_photos (id, post_id,
-- path, taken_at, created_at), follows (follower_id, following_id),
-- reports (reason, report_reason_known), private.my_block_set() (011),
-- private.report_evidence(uuid, uuid, uuid) (019), public.is_objectionable
-- (011) and schema_migrations (009). The first real run is Jan's: run the
-- VERIFY block right after it.
--
-- WHY THERE IS NO PLACES TABLE (the licence rework, spec §0.5)
--
-- Apple's MapKit licence (Developer Program License Agreement, Attachment
-- 6) forbids using Apple's Map Data "as part of any secondary or derived
-- database" (§2.2) and allows caching it only "on a temporary and limited
-- basis" (§2.5). A server table of venues with Apple's names, addresses
-- and coordinates, kept for as long as a photo uses them, is exactly such
-- a database, so the first draft of this file (a public.places table and
-- upsert_place) is gone. Jan delegated the call on 26 Oct 2026 and it was
-- taken this way. What Sipply keeps instead, per tagged photo, is:
--
--   1. Apple's Place ID (MKMapItem.identifier's rawValue, iOS 18 and
--      later). Apple documents Place IDs as stable references an app may
--      store and look up again (WWDC24 "Unlock the power of places with
--      MapKit"). It is a pointer, not the data it points at.
--   2. The poster's own LABEL for the place: prefilled on the phone with
--      the name Apple returned, but editable in the "Tag this place" step
--      like a caption, at most 60 characters, and run through the same
--      content filter as captions here on the server. It is user content,
--      the poster's words, which is what lets the feed say "at La
--      Factoría" without asking Apple for every post.
--
-- No address, locality, country, category, latitude or longitude is
-- stored anywhere on the server. The phone resolves everything else (the
-- address, the map pin, Open in Apple Maps) live from the Place ID with
-- MapKit, keeps it in memory for the session, and shows it only with
-- Apple's map (§2.4).
--
-- WHAT IT ADDS
--
--   1. post_photos.apple_place_id and post_photos.place_label, both or
--      neither, with shape and length checks. On the photo, not the post:
--      one post is one drink forever (007), and a re-post of it can be at
--      another bar.
--   2. The caption filter on the label (a trigger, as 020's on the song),
--      so a label is refused the same way whichever write carries it.
--   3. set_photo_place(post, path, place id, label): add, change or
--      remove the place on a photo of your own post.
--   4. drink_places(drink): where people have had a drink, one row per
--      Place ID: the most recent label, how many different people, whether
--      someone you follow is among them, and when it was last posted.
--      People you follow first, then most recent; at most 100. Never by
--      how many, and never by distance (there are no coordinates to sort
--      by, and the drink page never asks for location). Blocks both ways
--      leave people out.
--   5. place_drinks(place id): the different drinks posted at a place,
--      each with how many people and its latest photo there, newest
--      first; at most 120; blocks both ways honoured.
--   6. Reports: the reason 'wrong_place', and the post's places (Place ID
--      and label) in the evidence snapshot, so a report shows what was
--      tagged.
--
-- WHAT IS COUNTED (App Review 1.4.3). People, never amounts: "3 people
-- have posted it here". Nothing is ranked by how many.
--
-- NO METER. The first draft charged each new place to its creator (30 a
-- day) because places were a shared table anyone could fill. A label is
-- one photo's caption-like words and touches nobody else's post, so it
-- needs no more metering than a caption does; private.place_creations is
-- not created (and dropped below if the first draft was ever run).
--
-- ORDER
--
-- After 025 by number. Depends on 007, 009, 011 and 019 (report_evidence's
-- three-argument form) only; section 0 stops the file if any is missing.
-- Builds up to 32 never touch these objects. Build 33 (v4.8) reads them
-- and, while they are missing (42703 on apple_place_id, PGRST204 on a
-- write naming it, PGRST202 on a function), shows no place line, no place
-- section and no Add place, with no error anywhere; the next launch after
-- this file shows them. A PGRST202 straight after the run is PostgREST's
-- schema cache: Settings -> API -> Reload schema, or relaunch.
--
-- Account deletion needs nothing new: the place is two columns of the
-- photo row, and photos go with their posts.
--
-- MODERATION, BY HAND
--
--   -- A wrongly tagged or badly labelled photo (from a 'wrong_place'
--   -- report: reported_post_id; the snapshot's places say which).
--   update public.post_photos set apple_place_id = null, place_label = null
--   where post_id = '<post id>';
--   -- Every tag naming one Place ID (a venue that should never be tagged).
--   update public.post_photos set apple_place_id = null, place_label = null
--   where apple_place_id = '<place id>';
--
-- VERIFY AFTERWARDS (all read-only, except the rolled-back smoke test)
--
--   -- Expect one row: 026_places.
--   select version from public.schema_migrations where version = '026_places';
--
--   -- Expect two rows: apple_place_id | text, place_label | text.
--   select a.attname, format_type(a.atttypid, a.atttypmod)
--   from pg_attribute a
--   where a.attrelid = 'public.post_photos'::regclass
--     and a.attname in ('apple_place_id', 'place_label') and not a.attisdropped
--   order by 1;
--
--   -- Expect null, null, null, null: the first draft's objects are not here.
--   select to_regclass('public.places'), to_regclass('private.place_creations'),
--          to_regprocedure('public.upsert_place(text, text, text, text, text, double precision, double precision, text)'),
--          (select a.attname from pg_attribute a
--           where a.attrelid = 'public.post_photos'::regclass and a.attname = 'place_id' and not a.attisdropped);
--
--   -- Expect three rows: post_photos_place_id_shape, post_photos_place_label_shape,
--   -- post_photos_place_pair.
--   select conname from pg_constraint
--   where conrelid = 'public.post_photos'::regclass and conname like 'post_photos_place%'
--   order by 1;
--
--   -- Expect one row: post_photos_reject_objectionable_place.
--   select tgname from pg_trigger
--   where tgrelid = 'public.post_photos'::regclass and tgname = 'post_photos_reject_objectionable_place';
--
--   -- Expect three rows, each true | false | true (definer, no anon, signed-in).
--   select p.oid::regprocedure, p.prosecdef,
--          has_function_privilege('anon', p.oid, 'execute'),
--          has_function_privilege('authenticated', p.oid, 'execute')
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('set_photo_place', 'drink_places', 'place_drinks')
--   order by 1;
--   -- (set_photo_place's row also proves the four-argument form:
--   -- set_photo_place(uuid,text,text,text).)
--
--   -- Expect true: the new reason is allowed.
--   select pg_get_constraintdef(oid) like '%wrong_place%' from pg_constraint
--   where conname = 'report_reason_known';
--
--   -- Smoke test, rolled back. Paste your user id. It tags a photo row on
--   -- a post for a drink id nobody posts ('zz-026-smoke') with a made-up
--   -- Place ID, reads both lists, relabels it through set_photo_place,
--   -- refuses a 61-character label and a label without an id, removes the
--   -- tag, and undoes all of it. No storage object is needed: only rows.
--   -- Expect "Success. No rows returned"; anything else raises and says
--   -- what it found.
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     json_build_object('sub', '<your user id>', 'role', 'authenticated')::text, true);
--   do $$
--   declare
--     v_me    uuid := auth.uid();
--     v_post  uuid;
--     v_path  text := auth.uid()::text || '/zz-026-smoke.jpg';
--     v_n     integer;
--     v_label text;
--   begin
--     insert into public.posts (author_id, drink_id) values (v_me, 'zz-026-smoke') returning id into v_post;
--     insert into public.post_photos (post_id, path, apple_place_id, place_label)
--     values (v_post, v_path, 'IZZ026SMOKE', 'ZZ 026 Smoke Bar');
--     select count(*) into v_n from public.drink_places('zz-026-smoke') d
--     where d.apple_place_id = 'IZZ026SMOKE' and d.people = 1 and d.label = 'ZZ 026 Smoke Bar';
--     if v_n <> 1 then raise exception 'drink_places: expected one place with one person, got %', v_n; end if;
--     select count(*) into v_n from public.place_drinks('IZZ026SMOKE') d where d.drink_id = 'zz-026-smoke';
--     if v_n <> 1 then raise exception 'place_drinks: expected the smoke drink, got %', v_n; end if;
--     if not public.set_photo_place(v_post, v_path, 'IZZ026SMOKE', '  The   Smoke  Bar ') then
--       raise exception 'set_photo_place(relabel) refused';
--     end if;
--     select d.label into v_label from public.place_drinks('IZZ026SMOKE') d limit 1;
--     if v_label is distinct from 'The Smoke Bar' then raise exception 'label not tidied: %', v_label; end if;
--     begin
--       perform public.set_photo_place(v_post, v_path, 'IZZ026SMOKE', repeat('x', 61));
--       raise exception 'a 61-character label was accepted';
--     exception when others then
--       if sqlerrm <> 'place_invalid' then raise; end if;
--     end;
--     begin
--       perform public.set_photo_place(v_post, v_path, null, 'No id');
--       raise exception 'a label without a place id was accepted';
--     exception when others then
--       if sqlerrm <> 'place_invalid' then raise; end if;
--     end;
--     if not public.set_photo_place(v_post, v_path, null, null) then raise exception 'set_photo_place(null) refused'; end if;
--     select count(*) into v_n from public.drink_places('zz-026-smoke');
--     if v_n <> 0 then raise exception 'the removed tag still shows'; end if;
--   end;
--   $$;
--   rollback;
-- ====================================================================


-- --------------------------------------------------------------------
-- 0. Stop here unless 007, 009, 011 and 019 are applied
-- --------------------------------------------------------------------

do $$
begin
  if to_regprocedure('private.my_block_set()') is null
     or to_regclass('public.post_photos') is null
     or to_regclass('public.schema_migrations') is null
     or to_regprocedure('public.is_objectionable(text, boolean)') is null
     or to_regprocedure('private.report_evidence(uuid, uuid, uuid)') is null then
    raise exception '026 needs 007, 009, 011 and 019 applied first';
  end if;
end;
$$;


-- --------------------------------------------------------------------
-- 0b. The first draft, if it was ever run anywhere
--
-- It was never applied to the live project (spec Part 7), but it was
-- shared as a file, and a test project may hold it. Everything it made
-- that this version does not keep goes, column first (its foreign key
-- names the table). All "if exists", so on a project that never saw it
-- this section does nothing. drink_places is dropped every time because
-- its result columns changed, which `create or replace` cannot do; it is
-- created again and granted again below, so a re-run still ends the same.
-- --------------------------------------------------------------------

alter table public.post_photos drop column if exists place_id;
drop function if exists public.upsert_place(text, text, text, text, text, double precision, double precision, text);
drop function if exists public.set_photo_place(uuid, text, uuid);
drop function if exists public.place_drinks(uuid);
drop function if exists public.drink_places(text);
drop function if exists private.metres_between(double precision, double precision, double precision, double precision);
drop function if exists private.place_name_key(text);
drop table if exists private.place_creations;
drop table if exists public.places;
drop index if exists public.post_photos_place_idx;


-- --------------------------------------------------------------------
-- 1. A photo's place: Apple's Place ID and the poster's label
--
-- Both or neither (post_photos_place_pair). The id's shape is what
-- MKMapItem.Identifier rawValues look like, held loosely ("I" and hex
-- today) so a change of Apple's alphabet within URL-safe characters does
-- not refuse a real place; it is also what the place route accepts, so a
-- stored id is always a link. The label is tidy text the phone has
-- already trimmed: 1 to 60 characters, no edge spaces, no control
-- characters (so no line breaks in a one-line header).
--
-- Writable by the photo's own insert (post_photos_insert_own already
-- checks the post is yours) and by set_photo_place. post_photos keeps no
-- update policy, so a client update still changes nothing.
-- --------------------------------------------------------------------

alter table public.post_photos add column if not exists apple_place_id text;
alter table public.post_photos add column if not exists place_label    text;

alter table public.post_photos drop constraint if exists post_photos_place_id_shape;
alter table public.post_photos add constraint post_photos_place_id_shape check (
  apple_place_id is null or apple_place_id ~ '^[A-Za-z0-9._:-]{1,100}$'
);
alter table public.post_photos drop constraint if exists post_photos_place_label_shape;
alter table public.post_photos add constraint post_photos_place_label_shape check (
  place_label is null or (
    char_length(place_label) between 1 and 60
    and place_label = btrim(place_label)
    and place_label !~ '[[:cntrl:]]'
    -- direction overrides and zero-width marks (not the joiners U+200C/D)
    and place_label !~ '[\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]'
  )
);
alter table public.post_photos drop constraint if exists post_photos_place_pair;
alter table public.post_photos add constraint post_photos_place_pair check (
  (apple_place_id is null) = (place_label is null)
);

-- place_drinks starts from a Place ID; drink_places from a drink, and
-- posts had no index on drink_id.
create index if not exists post_photos_apple_place_idx
  on public.post_photos (apple_place_id, created_at desc) where apple_place_id is not null;
create index if not exists posts_drink_idx on public.posts (drink_id);


-- --------------------------------------------------------------------
-- 2. The caption filter on the label
--
-- 011's is_objectionable, as 020 runs it on a song. A trigger rather than
-- a check in set_photo_place, so the photo's own insert (Save & post) is
-- held to the same line. The app reads detail 'place' and posts the photo
-- without the place rather than not at all (lib/social's createPost).
-- --------------------------------------------------------------------

create or replace function public.reject_objectionable_place()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.place_label is not null and public.is_objectionable(new.place_label) then
    raise exception 'objectionable_content' using errcode = 'P0001', detail = 'place';
  end if;
  return new;
end;
$$;

drop trigger if exists post_photos_reject_objectionable_place on public.post_photos;
create trigger post_photos_reject_objectionable_place
  before insert or update of place_label on public.post_photos
  for each row execute function public.reject_objectionable_place();


-- --------------------------------------------------------------------
-- 3. set_photo_place: add, change or remove the place on your photo
--
-- (post, path) is unique (007). Both null removes the tag; both set adds
-- or replaces it. The label is tidied here as the phone tidies it (edges
-- trimmed, runs of spaces made one, invisible marks dropped), so a modified client gets the same
-- text the table checks accept, and then the checks and the filter
-- trigger hold the line. False when the photo is not yours or is gone.
--
-- Errors, as the app reads them (src/lib/places.ts):
--   P0001 place_invalid          one without the other, a bad id, a label
--                                over 60 characters, or one with
--                                control characters or invisible
--                                direction marks left after tidying
--   P0001 objectionable_content  (detail 'place') the caption filter
--
-- The update fires 007's preview trigger and 017's clock pin, both of
-- which leave the row as it was.
-- --------------------------------------------------------------------

create or replace function public.set_photo_place(
  p_post_id        uuid,
  p_path           text,
  p_apple_place_id text,
  p_label          text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_id    text := nullif(btrim(coalesce(p_apple_place_id, '')), '');
  -- Invisible direction and zero-width marks go first (they could make a
  -- label read backwards or hide a word from the filter), then whitespace
  -- runs, line breaks and tabs included, become one space, and only then
  -- are the edges trimmed. Trimming first left a leading tab or newline
  -- as a leading space, which the table check then refused with 23514
  -- instead of place_invalid. U+200C and U+200D (the zero-width joiners)
  -- stay: Persian, the Indic scripts and emoji sequences need them.
  v_label text := nullif(btrim(regexp_replace(
                    regexp_replace(coalesce(p_label, ''), '[\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]', '', 'g'),
                    '\s+', ' ', 'g')), '');
  v_n     integer;
begin
  if v_uid is null then
    return false;
  end if;
  if (v_id is null) <> (v_label is null)
     or (v_id is not null and (
           v_id !~ '^[A-Za-z0-9._:-]{1,100}$'
           or char_length(v_label) > 60
           or v_label ~ '[[:cntrl:]]'
           or v_label ~ '[\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]')) then
    raise exception 'place_invalid' using errcode = 'P0001';
  end if;
  update public.post_photos ph
  set apple_place_id = v_id,
      place_label    = v_label
  from public.posts po
  where ph.post_id = p_post_id
    and ph.path = p_path
    and po.id = ph.post_id
    and po.author_id = v_uid;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;


-- --------------------------------------------------------------------
-- 4. drink_places: where people have had a drink
--
-- One row per Place ID: the label of the most recent tagged photo of this
-- drink there (labels are each poster's own words, so the newest stands
-- for the place), how many different people tagged it, whether someone
-- you follow is among them (never you), and when it was last posted.
-- People you follow first, then the most recent; never by how many
-- (1.4.3), and never by distance: the server holds no coordinates, and
-- the caller's location is never sent. Blocks both ways leave people out,
-- as posts_read does. Every inner column aliased (pid) so none reads as a
-- returned name.
-- --------------------------------------------------------------------

create function public.drink_places(p_drink_id text)
returns table (apple_place_id text, label text, people integer, followed boolean, last_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as id
  ),
  tagged as (
    select ph.apple_place_id as pid, ph.place_label as said, po.author_id, ph.created_at
    from public.posts po
    join public.post_photos ph on ph.post_id = po.id
    cross join me m
    where m.id is not null
      and po.drink_id = p_drink_id
      and ph.apple_place_id is not null
      and not (po.author_id = any ((select private.my_block_set())::uuid[]))
  ),
  per as (
    select t.pid,
           (array_agg(t.said order by t.created_at desc, t.author_id))[1] as said,
           count(distinct t.author_id)::integer as people,
           coalesce(bool_or(f.following_id is not null), false) as followed,
           max(t.created_at) as last_at
    from tagged t
    left join public.follows f
      on f.follower_id = (select m.id from me m) and f.following_id = t.author_id
    group by t.pid
  )
  select p.pid, p.said, p.people, p.followed, p.last_at
  from per p
  order by p.followed desc, p.last_at desc, p.pid
  limit 100;
$$;


-- --------------------------------------------------------------------
-- 5. place_drinks: what people have had at a place
--
-- One row per catalogue drink tagged at this Place ID: how many different
-- people, the newest tagged photo of it here (its post and path), and
-- when. `people_here` is the place's different people over every drink,
-- and `label` the most recent label over every drink, both the same on
-- every row (distinct people cannot be summed on the phone, and the page
-- needs one name for its header). Newest first; at most 120. Blocks both
-- ways leave people out. A malformed id answers nothing.
-- --------------------------------------------------------------------

create or replace function public.place_drinks(p_apple_place_id text)
returns table (drink_id text, people integer, post_id uuid, photo_path text, last_at timestamptz,
               people_here integer, label text)
language sql
stable
security definer
set search_path = ''
as $$
  with tagged as (
    select po.drink_id as did, po.author_id, po.id as pid, ph.path, ph.created_at, ph.place_label as said
    from public.post_photos ph
    join public.posts po on po.id = ph.post_id
    where (select auth.uid()) is not null
      and p_apple_place_id ~ '^[A-Za-z0-9._:-]{1,100}$'
      and ph.apple_place_id = p_apple_place_id
      and po.drink_id !~ '^u_'
      and not (po.author_id = any ((select private.my_block_set())::uuid[]))
  ),
  total as (
    select count(distinct t.author_id)::integer as n,
           (array_agg(t.said order by t.created_at desc, t.pid))[1] as said
    from tagged t
  ),
  per as (
    select t.did, count(distinct t.author_id)::integer as people, max(t.created_at) as last_at
    from tagged t
    group by t.did
  )
  select p.did, p.people, l.pid, l.path, p.last_at, tt.n, tt.said
  from per p
  cross join total tt
  cross join lateral (
    select t.pid, t.path from tagged t
    where t.did = p.did
    order by t.created_at desc, t.pid
    limit 1
  ) l
  order by p.last_at desc, p.did
  limit 120;
$$;


-- --------------------------------------------------------------------
-- 6. Reports: "Wrong place tagged", and the places in the evidence
-- --------------------------------------------------------------------

alter table public.reports drop constraint if exists report_reason_known;
alter table public.reports add constraint report_reason_known check (
  reason in ('spam', 'harassment', 'nudity', 'violence', 'underage', 'other', 'wrong_place')
);

-- 019's evidence, with the post's places added ('places': Apple's Place
-- ID and the poster's label, and when its photo was taken, to say which
-- photo had it, newest first). The moderator looks the id up in Apple
-- Maps if the label is not enough; nothing of Apple's is copied here.
-- Never the photo's file path: 012's rule holds (deletion removes the
-- file, and a path to nothing helps no moderator). Everything else is as
-- 019 wrote it.
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
      'places',       (select jsonb_agg(jsonb_build_object(
                                'apple_place_id', ph.apple_place_id, 'label', ph.place_label,
                                'photo_taken_at', ph.taken_at)
                              order by ph.taken_at desc)
                       from public.post_photos ph
                       where ph.post_id = post and ph.apple_place_id is not null),
      'username',     pr.username,
      'display_name', pr.display_name,
      'bio',          pr.bio
    ))
  from subject s
  left join public.profiles pr on pr.id = s.author_id;
$$;

revoke all on function private.report_evidence(uuid, uuid, uuid) from public, anon, authenticated;


-- --------------------------------------------------------------------
-- 7. Privileges
-- --------------------------------------------------------------------

revoke all on function public.reject_objectionable_place()                 from public, anon, authenticated;
revoke all on function public.set_photo_place(uuid, text, text, text)      from public, anon;
revoke all on function public.drink_places(text)                           from public, anon;
revoke all on function public.place_drinks(text)                           from public, anon;
grant execute on function public.set_photo_place(uuid, text, text, text)   to authenticated;
grant execute on function public.drink_places(text)                        to authenticated;
grant execute on function public.place_drinks(text)                        to authenticated;

comment on function public.set_photo_place(uuid, text, text, text) is
  'v4.8: add, change or remove the place on a photo of your own post: Apple''s Place ID and your label for it, '
  'both or neither. The label is tidied, checked (1 to 60 characters) and filtered. False when not yours.';
comment on function public.drink_places(text) is
  'v4.8: where people have had a drink, per Apple Place ID: the newest label, different people, whether you '
  'follow any of them. Followed first, then most recent; never by how many. Blocks both ways honoured. At most 100.';
comment on function public.place_drinks(text) is
  'v4.8: the different drinks posted at an Apple Place ID, each with different people and its newest photo there, '
  'plus the place''s newest label. Newest first, at most 120. Blocks both ways honoured.';


-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('026_places') on conflict (version) do nothing;
