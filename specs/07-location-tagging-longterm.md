# 07 · Location tagging (long term)

Status: **design only. Nothing in this file gets built now.** It is written so that, when Jan schedules it, an engineer can build Phase 1 without asking anything. Owner tag for the implementer: **LOC**.
Native modules added (Phase 1): **one local Expo module**, `modules/sipply-places` (Swift, Apple's MapKit and CoreLocation). No `expo-location`, no `expo-maps`, no third-party SDK.
Supabase changes (Phase 1): one migration, two Edge Functions, one cron job.

> **Cross-check reconciliation (30 Sep 2026). Binding; it overrides the sections below wherever they differ.**
> - **Not in this build.** `00-build-plan.md` lists this spec as the deferred package **L**. L owns only the files this spec creates (the module, the migration, the Edge Functions, `src/lib/places.ts`, `src/components/place/*`, `src/app/place/[id].tsx`, `docs/support.md`, and in Phase 3 `docs/p/index.html` and `scripts/venue-poster.mjs`). Its hunks in shared files (`log.tsx`, `drink/[id].tsx`, `PostCard.tsx`, the clip files, `social.ts`, `store/social.ts`, `types.ts`, `database.types.ts`, `schema.sql`, `icons.tsx`, `app.json`, `.env`, docs) are applied by whoever owns each file when L is scheduled; 00 lists them.
> - **Migration number: 020** (`020_places.sql`). 016–019 are taken by 02, 03, 04 and 05, and 019 creates `public.reels`, so section 3 of this migration always finds the table.
> - **The flag lives in `src/lib/places.ts`**, not `src/lib/flags.ts` (no `flags.ts` exists; each feature's flag sits in its own lib, as `REELS_ENABLED` does in `lib/reels.ts`).
> - **Top bars are `ScreenTopBar`** (01 §5.12): the picker is `ScreenTopBar size="md" inset="sheet" title="Add a place" left={<TopBarTextButton label="Cancel" muted …/>} showRule={scrolled}`; the venue page is `ScreenTopBar size="md" title={scrolled ? name : ''} left={back TopBarButton} showRule={scrolled}` with `useScrolledPast(56)` from `ScreenTopBar.tsx`. The venue name uses `textRole.emptyTitle` (Inter SemiBold 22/28; `rootTitle` does not exist). `radius.tag` is `radius.badge`.
> - **No skeleton rows** (01 §11 allows static placeholders only for known media grids): loading nearby / searching shows `Hold fill={false} slowMessage="Still searching."` under the search field; the venue page's first load is `Hold` for the header with static `bgSunk` placeholder tiles for the grid.
> - The `check-design` rule for `round-ok` markers is **rule 4** (rule 3 is 06's layout-animation rule). 03's PostCard author row is `minHeight` **56**, not 52. `supabase/functions/` is created by this spec (04 uses pg_cron and pg_net, not Edge Functions).

Checked against branch `reads-and-redesign` (reels-and-redesign) on 30 Sep 2026: `supabase/schema.sql` as of 015, `src/lib/social.ts`, `src/lib/pour.ts`, `src/app/log.tsx`, `src/app/user/[id].tsx`, `src/app/+native-intent.tsx`, `app.json`, `docs/privacy.md`, `docs/appstore.md`, and specs 01 to 06. Provider facts were checked against the vendors' own pages on the same date (section 15).

---

## 0. Decisions at a glance

| # | Decision | Why (one line) |
|---|---|---|
| L1 | **Apple, not Google or Foursquare.** Search runs on the phone through MapKit. The server talks to the Apple Maps Server API only to confirm and refresh a place the user picked. | It is $0 at any volume we can foresee, the user's location goes to Apple and never to Sipply, and it is first-party for App Review. |
| L2 | Places are keyed `apple:<Apple Maps Place ID>` in a `public.places` table. | Apple designs Place IDs to be stored and looked up again later. The prefix keeps a second provider possible without a schema change. |
| L3 | **The server stores no coordinates at all**, not the user's and not the venue's. A place row holds a refreshed display cache: name, locality, country, category. | Apple's licence limits caching Map Data to "temporary and limited" use. Nothing Phase 1 to 3 needs a coordinate on the server. |
| L4 | The user's location never enters JavaScript. The native module takes the fix, runs the search and hands JS place candidates with a formatted distance string. | No JS code path can upload a coordinate if JS never holds one. |
| L5 | **When In Use only, asked on tap.** The system prompt appears only when the user taps "Show places near me". There is no background location, no Always string and no pre-prompt screen. | Guidelines 5.1.1 and 5.1.5. Tagging still works with location denied (search by name). |
| L6 | **Only venues can be tagged.** There are twelve point-of-interest categories (bars, restaurants, hotels and so on). Street addresses and homes cannot be tagged. The server enforces this too. | The feature exists to promote places, and it must never become a way to pin someone's house. |
| L7 | A place belongs to a **photo** (`post_photos.place_id`) and to a **clip** (`reels.place_id`), not to a post. | A post is one drink per person with many pours over time (`posts_one_per_drink`, 007). Each photo is one pour at one place. |
| L8 | Places are shown as a **text line with a 14pt pin**, as specs/01 §8 sets out. There is no chip and no map card in the feed. Venue pages have no embedded map. "Directions" hands off to Apple Maps. | No map view means no `expo-maps` (alpha) and no extra native surface. Apple Maps does directions better than we could. |
| L9 | Places are **venue-centric, never person-centric.** Every place has a page listing its pours. No profile ever shows "places I've been", and there are no check-ins or "who's here now". | Collecting one person's places reveals their routine. A venue's page promotes the venue. |
| L10 | The author can **change or remove** the place on their own photo or clip at any time. This ships in Phase 1. | A tag someone regrets is a safety issue, not a nice-to-have. |
| L11 | The flag is `EXPO_PUBLIC_PLACES` (`on` shows everything; anything else hides everything). The tagging control also needs `isAvailable()` from the module (iOS 18+ and a build that contains it). | It follows the repo's flag pattern. Place IDs on device are iOS 18 API, and the app's floor is 16.4 (`ExpoModulesCore.podspec`). |
| L12 | A photo's EXIF location is **never** read to suggest a place. | `pour.ts` strips location from every photo on purpose. Reading it back would undo that and need photo-library location access. |

---

## 1. What Jan asked, and the shape of the answer

Jan's words: *"add a system where people can tag their location, use apple maps or any other location system where people can tag where they are to promote bars and other places, but this is for the long term, not short term."*

The goal is to **promote venues**. Tagging is the means. So the design is built around the venue page (a place's pours, what people drink there, a way to get there), and the tag is the link into it from every post and clip.

**Not in scope at any phase:** background location, geofences, check-ins, "friends nearby", live presence, a per-user map or places history, ads targeted by location, reading photo EXIF, user-created places (a place has to exist in Apple Maps), and Android tagging (reading and venue pages do work on Android, because they are plain JS).

### 1.1 What this spec asks of work happening now (Phase 0, $0)

Nothing gets built. These constraints keep the door open:

- **Do not add `expo-location` or `expo-maps`** to `package.json` for any other reason without reading section 2.3.
- The icon name `pin` is reserved for this spec (specs/01 §14.3 already defers it here).
- `post_photos` stays insert-only for clients until Phase 1 opens exactly one column (`place_id`) for update.
- specs/05 already leaves room for "its own nullable column later" on `public.reels`. Keep the clip overlay's left block able to take one more 24pt line.
- specs/03's PostCard author row must be able to grow by one line (section 8.4).

---

## 2. Providers compared, and the choice

### 2.1 The options

Volume assumptions: one tagging session is about 4 search calls (1 nearby plus about 3 typed queries after a 350ms debounce). **Launch** means 30 tags a day, about 3,600 calls a month. **Growth** means 1,000 tags a day, about 120,000 calls a month. Prices are as published on 30 Sep 2026.

| | **A. MapKit on the phone + Apple Maps Server API for lookups (chosen)** | B. Apple Maps Server API for everything, via an Edge Function | C. `expo-location` + Google Places API (New) | D. `expo-location` + Foursquare Places API |
|---|---|---|---|---|
| Search cost, launch | $0 | $0 | $0 (inside the free caps, but a card must be on file) | about $47/month (500 free Pro calls, then $15 per 1,000) |
| Search cost, growth | $0 | $0 until about 6,000 tags a day, then ask Apple for more quota | about $3,500/month (Nearby and Text Search Pro at $32 per 1,000 after 5,000 free each) | about $1,730/month |
| Quota | On-device search is throttled per device (about 50 requests per 60s, observed, not documented). No team quota. Server lookups use the 25,000 calls a day per team. | 25,000 calls a day **per team, shared with MapKit JS and every other app on Jan's developer team** | Billed per call. A bug or an abuser spends money. | Billed per call |
| Storage terms | Place IDs persist by design. Other Map Data is only "temporary and limited" (Program Licence Schedule 6 §2.5). No derived database (§2.2). | Same | `place_id` may be stored forever. Lat/lng may be kept for 30 days at most. **Must not be shown with a non-Google map.** Google attribution required. | Attribution required. Check the current storage terms before relying on them. |
| Where the user's location goes | Phone to Apple only. **Never to Sipply.** | Phone to our Edge Function to Apple. Transient, but it crosses our server. | Phone to our function (or Google's SDK) to Google | Phone to our function to Foursquare |
| App Review and App Privacy | First-party framework, one When-In-Use string | Same, no native code | `expo-location` writes **Always** usage strings by default (each one has to be set to `false`). Google becomes a processor to disclose. | `expo-location` as in C. Foursquare becomes a processor to disclose. |
| Build impact | One new local native module, so one native build | None (JS only) | One native module (`expo-location`) | One native module (`expo-location`) |
| Data fit for bars | Apple Maps POIs with explicit categories (`nightlife`, `brewery`, `winery`, `distillery`, `musicVenue` since iOS 18) | Same data | Best global coverage | Strong on nightlife (check-in heritage) |

Ruled out without a column:

- **`expo-maps`** (SDK 57): **alpha**, it is a map *view*, and it has no search or place lookup API (its iOS props are `annotations`, `markers`, `pointsOfInterest` filter and similar). Nothing here needs a map view. Reconsider it only if a future phase wants an embedded map.
- **MapKit JS:** a browser library. In React Native it needs a WebView, and it uses the same 25,000-a-day team quota as B.
- **FSQ OS Places** (Foursquare's open dataset): free and storable, but it is a 100M-row dump to host, filter and re-import monthly in Postgres. That is the wrong operational load for a solo developer. Nearby search would also send coordinates to our server.

### 2.2 Why A

1. **Cost stays flat.** Search is free on the phone. The server spends Apple quota only when someone picks a place nobody has tagged before, plus a weekly refresh: a few hundred calls a day at growth, against 25,000. Jan has no outside capital, and a per-keystroke bill (C, D) is exactly the open-ended cost to avoid.
2. **Privacy is a sentence, not a paragraph.** "Your location is never sent to Sipply" is literally true. The App Privacy answer stays small (section 9.4).
3. **Review is simple.** MapKit is first-party, the module asks for When In Use and nothing else, and there is no third-party SDK manifest.
4. **The server still verifies every place** (B's strength) because the `place-resolve` function looks the ID up with Apple before it ever writes a `places` row. A modified client cannot invent a venue called something offensive.

B is the fallback if the native module ever becomes a problem. The table, the functions and the UI all stay the same. Only the picker's data source moves into an Edge Function, and the cost is that the user's coordinates cross our server.

### 2.3 Why not `expo-location` for the fix

`expo-location` would hand JS the coordinate (breaking L4). Its config plugin writes `NSLocationAlwaysAndWhenInUseUsageDescription` and `NSLocationAlwaysUsageDescription` by default (Expo v57 docs), and it would be a second native module next to the one search needs anyway. A one-shot `CLLocationManager.requestLocation()` is about 60 lines of Swift in the same module.

---

## 3. How it fits together

```
 Phone                                   Supabase                          Apple
 ─────                                   ────────                          ─────
 PlacePicker ──(query, fix)──────────────────────────────────────────────▶ MapKit search
   ▲   candidates {id,name,locality,                                       (on-device API)
   │   category,distanceText}  ◀───────────────────────────────────────────
   │ tap a row
   └─▶ functions.invoke('place-resolve', {id}) ──▶ place-resolve ──GET /v1/place/{id}──▶ Maps Server API
                                                     │ upsert places (name, locality,
                                                     │ country, category; no coords)
       PlaceRef {id,name,locality} ◀─────────────────┘
 Save & post ──▶ post_photos.insert({post_id, path, place_id})
 Feed / clip / venue page ◀── select … post_photos(place_id, places(id,name,locality))
                                       places-refresh (weekly cron) ──GET /v1/place?ids=…──▶
```

**What goes where:**

| Data | Leaves the phone? | Kept by Sipply? |
|---|---|---|
| The device's coordinates | Only to Apple, for the search | **No.** Held in native memory for at most 120s, dropped when the app backgrounds, never in JS. |
| What the user types in place search | Only to Apple | No |
| The chosen place's ID | To Supabase | Yes, on the tagged photo or clip, until removed or deleted |
| The place's name, locality, country and category | Supabase gets them from Apple | Yes, as a cache refreshed every 30 days. Deleted 30 days after nothing references the place. |
| How many new places an account looked up today | No (server-side) | Yes: counts and times only, never which places. Rolling 24h. |

---

## 4. Data model: migration `020_places.sql`

**Number: 020** (fixed by the cross-check: 016 sign-in lookup, 017 home and profile, 018 drink submissions, 019 reels). Update the version string inside the file and the `schema.sql` row to match. Same commit: `supabase/schema.sql` (in the matching sections) and `src/lib/database.types.ts`, per the repo rule in `schema.sql`'s header.

```sql
-- ====================================================================
-- Sipply — migration 020: places (location tagging, phase 1)
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- WHAT IT ADDS
--   1. public.places: one row per venue anyone has tagged, keyed
--      'apple:<Apple Maps Place ID>'. Name, locality, country and category
--      are a display cache that place-resolve and places-refresh keep
--      fresh. NO coordinates, by design (specs/07, L3).
--   2. post_photos.place_id: where that pour photo was tagged. The author
--      may change or clear it: the one post_photos column a client may
--      update.
--   3. reels.place_id, the same for clips, if 05's table exists. If 05
--      lands after this file, run this file again.
--   4. place_summary(place): pours, people and top drinks at a place,
--      read through RLS, so blocks apply with no extra code.
--   5. place_lookups and charge_place_lookup(uid): at most 100 new-place
--      lookups per account per rolling 24 hours, so one account cannot
--      spend the team's Apple quota. Only the Edge Function calls it.
--
-- ORDER: after 011 (my_block_set) and 014. Before deploying place-resolve,
-- and before any build with EXPO_PUBLIC_PLACES=on.
--
-- Installed builds notice nothing: they never select the new column.
-- ====================================================================

-- 1. Places --------------------------------------------------------------
create table if not exists public.places (
  id           text primary key,
  name         text not null,
  locality     text,
  country_code text,
  category     text,
  refreshed_at timestamptz not null default now(),
  -- Set when Apple no longer knows the id and no alternate exists. The row
  -- stays so tagged pours keep their name; it can no longer be tagged.
  gone_at      timestamptz,
  created_at   timestamptz not null default now(),
  constraint places_id_shape       check (id ~ '^apple:[A-Za-z0-9._-]{1,80}$'),
  constraint places_name_len       check (char_length(name) between 1 and 200),
  constraint places_locality_len   check (locality is null or char_length(locality) <= 120),
  constraint places_country_shape  check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint places_category_known check (category is null or category in (
    'nightlife', 'brewery', 'winery', 'distillery', 'restaurant', 'cafe',
    'hotel', 'foodMarket', 'store', 'musicVenue', 'stadium', 'theater'))
);

create index if not exists places_refreshed_idx on public.places (refreshed_at);

alter table public.places enable row level security;
revoke all on public.places from anon, authenticated;
grant select on public.places to authenticated;

drop policy if exists places_read on public.places;
create policy places_read on public.places
  for select to authenticated using (true);
-- No insert/update/delete policy: only the Edge Functions write, with the
-- service role, which bypasses RLS.

-- 2. A photo's place -----------------------------------------------------
alter table public.post_photos
  add column if not exists place_id text
  references public.places (id) on update cascade on delete set null;

create index if not exists post_photos_place_idx
  on public.post_photos (place_id, created_at desc)
  where place_id is not null;

-- Clients could never update post_photos (no policy). Now exactly one
-- column, on your own post's photos.
revoke update on public.post_photos from authenticated;
grant update (place_id) on public.post_photos to authenticated;

drop policy if exists post_photos_update_own_place on public.post_photos;
create policy post_photos_update_own_place on public.post_photos
  for update to authenticated
  using      (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()))
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));

-- 3. A clip's place (only once 05 exists) --------------------------------
do $$
begin
  if to_regclass('public.reels') is not null then
    alter table public.reels
      add column if not exists place_id text
      references public.places (id) on update cascade on delete set null;
    create index if not exists reels_place_idx
      on public.reels (place_id, created_at desc) where place_id is not null;
    revoke update on public.reels from authenticated;
    grant update (place_id) on public.reels to authenticated;
    drop policy if exists reels_update_own_place on public.reels;
    create policy reels_update_own_place on public.reels
      for update to authenticated
      using (auth.uid() = author_id) with check (auth.uid() = author_id);
  end if;
end;
$$;

-- 4. A place's numbers ---------------------------------------------------
-- SECURITY INVOKER: posts_read and post_photos_read apply, so anyone the
-- caller is blocked with, either way, is not counted.
create or replace function public.place_summary(place text)
returns table (pours bigint, people bigint, top_drinks jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  with tagged as (
    select p.author_id, p.drink_id
    from public.post_photos ph
    join public.posts p on p.id = ph.post_id
    where ph.place_id = place
  ),
  top5 as (
    select t.drink_id, count(*) as n
    from tagged t
    group by t.drink_id
    order by n desc, t.drink_id
    limit 5
  )
  select
    (select count(*) from tagged),
    (select count(distinct t.author_id) from tagged t),
    coalesce((select jsonb_agg(jsonb_build_object('drink_id', drink_id, 'n', n)
                               order by n desc, drink_id) from top5), '[]'::jsonb);
$$;

revoke execute on function public.place_summary(text) from public, anon;
grant execute on function public.place_summary(text) to authenticated;

-- 5. The lookup meter ----------------------------------------------------
create table if not exists public.place_lookups (
  user_id      uuid not null references public.profiles on delete cascade,
  looked_up_at timestamptz not null default now()
);
create index if not exists place_lookups_user_idx on public.place_lookups (user_id, looked_up_at);
alter table public.place_lookups enable row level security;
revoke all on public.place_lookups from anon, authenticated;

-- true and recorded when under 100 in the last 24h; false otherwise.
create or replace function public.charge_place_lookup(uid uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  used integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('place_lookups:' || uid::text, 0));
  delete from public.place_lookups l
  where l.user_id = uid and l.looked_up_at <= now() - interval '24 hours';
  select count(*) into used from public.place_lookups l where l.user_id = uid;
  if used >= 100 then
    return false;
  end if;
  insert into public.place_lookups (user_id) values (uid);
  return true;
end;
$$;

revoke execute on function public.charge_place_lookup(uuid) from public, anon, authenticated;
grant execute on function public.charge_place_lookup(uuid) to service_role;

-- Last statement on purpose (009).
insert into public.schema_migrations (version)
values ('020_places') on conflict (version) do nothing;
```

Notes for the engineer:

- An update of `place_id` fires the existing `on_post_photo_change` trigger (007), which recomputes `posts.photo_path` to the same value. That is harmless, so leave it.
- `on update cascade` is what lets `places-refresh` move a renumbered Apple ID (section 5.3) without touching each photo.
- Account deletion needs no change: `place_lookups` cascades from `profiles`, and tagged photos go with their posts.
- **Verify afterwards (read-only):** `select column_name from information_schema.columns where table_name = 'post_photos' and column_name = 'place_id';` returns one row. As an ordinary user in the API, `insert into places …` is refused, and `update post_photos set place_id = …` on someone else's photo updates 0 rows.

**Phase 2 adds** (separate migration): `popular_places(country text)` (section 12, Phase 2).

---

## 5. Server: Edge Functions

New folder `supabase/functions/` (this spec creates it; 04 uses pg_cron and pg_net instead). Both functions deploy with JWT verification **on** (the default). They read `SUPABASE_URL` and the service key the platform injects. If the project has moved fully to the new secret keys, add one as the secret `SIPPLY_SECRET_KEY` and read that instead.

### 5.1 `supabase/functions/_shared/appleMaps.ts`

- **Secrets:** `APPLE_MAPS_TEAM_ID`, `APPLE_MAPS_KEY_ID`, `APPLE_MAPS_PRIVATE_KEY_B64` (the `.p8` file, base64, so the multi-line PEM survives the secrets form).
- **Access token:** sign an ES256 JWT with `npm:jose` (`importPKCS8(atob(B64), 'ES256')`, header `{ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }`, `iss: TEAM_ID`, `iat`, `exp` = 10 minutes). Exchange it at `GET https://maps-api.apple.com/v1/token` (`Authorization: Bearer <jwt>`) for `{ accessToken, expiresInSeconds }`. Cache the token in module scope until `expiresInSeconds − 60`.
- `lookup(rawId)`: `GET /v1/place/{rawId}?lang=en-US` (English, because the app's copy is English, and one shared cache needs one language). It returns `{ kind: 'ok', place } | { kind: 'not_found' } | { kind: 'busy' }`. 429 and 5xx count as `busy`. Any other non-200 counts as `not_found`.
- `lookupMany(rawIds)`: `GET /v1/place?ids=a,b,c&lang=en-US`, **at most 20 IDs per call** (a conservative batch; raise it to the documented maximum when building). It returns `results[]` plus `errors[]`.
- `alternateIds(rawIds)`: `GET /v1/place/alternateIds?ids=…`.
- `toPlaceRow(place)`:
  - `name`: trimmed, cut to 200 characters.
  - `locality`: unique non-empty values of `[structuredAddress.subLocality, structuredAddress.locality]` joined with ", ", falling back to `structuredAddress.administrativeArea`, cut to 120.
  - `country_code`: `countryCode` uppercased, or null if not two letters.
  - `category`: `poiCategory` with its first letter lowercased (`FoodMarket` becomes `foodMarket`). It is kept only if it is in `VENUE_CATEGORIES`, otherwise null.
- `VENUE_CATEGORIES`: the twelve values in the migration's check, exported once here and mirrored in `src/lib/places.ts` and the Swift module. A comment in each copy names the other two.
- **Logging:** status codes and counts only. Never log a place ID next to a user ID: together they say where someone was.

### 5.2 `supabase/functions/place-resolve/index.ts` (called by the app)

`POST { id: 'apple:<raw>' }` with the user's JWT (`supabase.functions.invoke('place-resolve', { body: { id } })` sends it).

1. Take the caller's id from the verified JWT (`auth.getClaims`). None means 401 `not_signed_in`.
2. `id` must match `^apple:([A-Za-z0-9._-]{1,80})$`. Otherwise 400 `bad_id`.
3. Read the `places` row. If it exists, `gone_at is null`, and `refreshed_at` is within 30 days, return 200 with `{ id, name, locality, category }`. **No Apple call.**
4. `rpc('charge_place_lookup', { uid })`. If false: return the existing row as it is (200) when there is one, otherwise 429 `rate_limited`.
5. `lookup(raw)`:
   - `busy`: return 503 `busy`.
   - `not_found`: if the row exists, set its `gone_at = now()`. Return 404 `not_found`.
   - `ok`: `toPlaceRow`. If `category` is null, return 422 `not_a_venue` and write nothing. Otherwise upsert with `refreshed_at = now()` and `gone_at = null`, then return 200.

### 5.3 `supabase/functions/places-refresh/index.ts` (cron only)

Runs weekly through Supabase **Integrations → Cron** (section 13). Each run:

1. Select up to 1,000 places with `refreshed_at < now() − 30 days`, oldest first.
2. Look them up in batches with `lookupMany`. On `busy`, stop the run; the next run continues.
3. Found: update `name`, `locality`, `country_code`, `category` and `refreshed_at`. A place whose category left the allowlist keeps its pours but gets `category = null`. The client refuses to tag a place with a null category (section 8.3).
4. Errored IDs go to `alternateIds`:
   - **One alternate, not yet in `places`:** `update places set id = 'apple:<alt>'`. The FK cascade moves every photo and clip. Then refresh it.
   - **One alternate, already a row:** `update post_photos set place_id = <existing> where place_id = <old>`, the same for `reels`, then delete the old row.
   - **None:** set `gone_at = now()`.
5. Delete places that no `post_photos` or `reels` row references and whose `created_at < now() − 30 days`. The cache holds only places in use, which is the "temporary and limited" reading of Apple's terms.
6. Return `{ refreshed, renumbered, gone, deleted }`, which shows up in the cron history.

Budget: with 10,000 places, about 500 Apple calls a month.

---

## 6. Native module: `modules/sipply-places`

Create it with `npx create-expo-module@latest --local` (SDK 57 docs), then strip it to iOS.

| File | Content |
|---|---|
| `expo-module.config.json` | `{ "platforms": ["apple"], "apple": { "modules": ["SipplyPlacesModule"] } }` |
| `ios/SipplyPlaces.podspec` | `s.platforms = { :ios => '16.4' }`, `s.swift_version = '6.0'` (matching `ExpoModulesCore.podspec`), `s.frameworks = 'MapKit', 'CoreLocation'`, dependency `ExpoModulesCore` |
| `ios/SipplyPlacesModule.swift` | The module (sketch below) |
| `ios/OneShotLocator.swift` | `@MainActor` wrapper around one `CLLocationManager` |
| `index.ts` | The typed JS API, with fallbacks when the module is absent |

### 6.1 JS API (`modules/sipply-places/index.ts`)

```ts
import { requireOptionalNativeModule } from 'expo';

export type PlaceCategory =
  | 'nightlife' | 'brewery' | 'winery' | 'distillery' | 'restaurant' | 'cafe'
  | 'hotel' | 'foodMarket' | 'store' | 'musicVenue' | 'stadium' | 'theater';

export interface PlaceCandidate {
  id: string;                  // 'apple:<Place ID>'
  name: string;
  locality: string | null;     // "Condado, San Juan"
  category: PlaceCategory;
  distanceText: string | null; // "350 ft" / "120 m", localized natively; null without a fix
}

/** Never a coordinate. 'unavailable' = not iOS 18+, or a build without the module. */
export type LocationState =
  | 'unavailable' | 'notDetermined' | 'denied' | 'restricted' | 'approximate' | 'precise';

/** Error codes thrown by nearby/search/openInMaps. */
export type PlacesErrorCode =
  | 'ERR_PLACES_NO_PERMISSION' | 'ERR_PLACES_APPROXIMATE' | 'ERR_PLACES_NO_FIX'
  | 'ERR_PLACES_THROTTLED' | 'ERR_PLACES_OFFLINE' | 'ERR_PLACES_FAILED';

const native = requireOptionalNativeModule('SipplyPlaces');

export function isAvailable(): boolean;                 // native?.isAvailable() ?? false
export function locationState(): LocationState;         // 'unavailable' when !native
export function requestLocation(): Promise<LocationState>; // prompts only when notDetermined
export function nearby(): Promise<PlaceCandidate[]>;    // ≤ 25, nearest first
export function search(query: string): Promise<PlaceCandidate[]>; // ≤ 15
export function cancelSearch(): void;
export function openInMaps(id: string): Promise<boolean>; // false → caller opens appleMapsUrl()
```

### 6.2 Swift sketch (behaviour is binding; exact syntax is the engineer's)

```swift
import ExpoModulesCore
import MapKit
import CoreLocation

// Mirror of VENUE_CATEGORIES in supabase/functions/_shared/appleMaps.ts and src/lib/places.ts.
@available(iOS 18.0, *)
let venueCategories: [MKPointOfInterestCategory] = [
  .nightlife, .brewery, .winery, .distillery, .restaurant, .cafe,
  .hotel, .foodMarket, .store, .musicVenue, .stadium, .theater,
]

public final class SipplyPlacesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SipplyPlaces")
    Function("isAvailable") { () -> Bool in if #available(iOS 18.0, *) { return true }; return false }
    Function("locationState") { () -> String in /* map CLLocationManager authorization + accuracy */ }
    AsyncFunction("requestLocation") { /* requestWhenInUseAuthorization only; await the delegate */ }.runOnQueue(.main)
    AsyncFunction("nearby") { /* fix (≤120 s old, else requestLocation() with 10 s timeout) →
        MKLocalPointsOfInterestRequest(center:, radius: 300), filter venueCategories;
        < 5 results → once more at radius 1_000. Approximate accuracy → throw ERR_PLACES_APPROXIMATE. */ }
    AsyncFunction("search") { (query: String) in /* MKLocalSearch.Request: naturalLanguageQuery = query,
        resultTypes = .pointOfInterest, pointOfInterestFilter = venueCategories,
        region = 20 km box around the fix when one exists (precise or approximate), else none.
        One search in flight: a new call cancels the previous MKLocalSearch. */ }
    Function("cancelSearch") { /* cancel the in-flight MKLocalSearch */ }
    AsyncFunction("openInMaps") { (id: String) in /* MKMapItemRequest(mapItemIdentifier:
        MKMapItem.Identifier(rawValue: raw)) → mapItem.openInMaps(launchOptions: nil) */ }
    OnAppEntersBackground { /* drop the cached fix */ }
  }
}
```

Rules the module must keep:

- **Candidates:** only map items with a non-nil `identifier` (iOS 18) and a category in the list. `id = "apple:" + identifier.rawValue`. On iOS 26+, read the location and address through `MKMapItem.location` and `addressRepresentations` (`MKPlacemark` is deprecated there). Otherwise use `placemark.location`, `subLocality` and `locality`.
- **Distance:** `MKDistanceFormatter` with `unitStyle = .abbreviated`, so it follows the locale (feet and miles in the US and Puerto Rico).
- **Fix:** `desiredAccuracy = kCLLocationAccuracyHundredMeters`, one `requestLocation()`. It is held only in a private property, for at most 120s, and dropped on background. It is never written to disk, `UserDefaults` or a log. `allowsBackgroundLocationUpdates` is never set, and `requestAlwaysAuthorization` is never referenced.
- **Errors:** `GEOErrorDomain` code −3 (throttled) becomes `ERR_PLACES_THROTTLED`. `NSURLErrorDomain` and `MKError.serverFailure` become `ERR_PLACES_OFFLINE`. Anything else becomes `ERR_PLACES_FAILED`.
- **Info.plist:** the module adds nothing. `app.json` carries the single string (section 9.1).

Native link check: the module is compiled from source with the app, so it cannot drift from `ExpoModulesCore` the way prebuilt modules do. It still has to pass `scripts/check-native-links.sh` on the archive's `.app`, like every native addition. Because `runtimeVersion` uses the `fingerprint` policy, this build starts a new runtime, so later EAS Updates for it reach only builds that contain the module. `requireOptionalNativeModule` keeps the JS safe on older builds either way.

---

## 7. Client data layer

### 7.1 `src/lib/places.ts` (LOC, new)

```ts
export const PLACE_ID = /^apple:[A-Za-z0-9._-]{1,80}$/;
export const VENUE_CATEGORIES = [/* the twelve, same order */] as const;
export const PLACE_CATEGORY_LABEL: Record<PlaceCategory, string> = {
  nightlife: 'Bar', brewery: 'Brewery', winery: 'Winery', distillery: 'Distillery',
  restaurant: 'Restaurant', cafe: 'Café', hotel: 'Hotel', foodMarket: 'Market',
  store: 'Shop', musicVenue: 'Music venue', stadium: 'Stadium', theater: 'Theater',
};
export const APPLE_MAPS_LEGAL_URL = 'https://gspe21-ssl.ls.apple.com/html/attribution.html';

export interface PlaceRef { id: string; name: string; locality: string | null }
export interface Place extends PlaceRef { category: PlaceCategory | null; gone: boolean }
export interface PlacePour { photoId: string; postId: string; authorId: string; drinkId: string; path: string; createdAt: string }
export interface PlaceSummary { pours: number; people: number; topDrinks: { drinkId: string; n: number }[] }

export type ResolveOutcome =
  | { ok: true; place: PlaceRef }
  | { ok: false; reason: 'rate_limited' | 'not_a_venue' | 'not_found' | 'busy' | 'offline' | 'failed' };

export async function resolvePlace(id: string): Promise<ResolveOutcome>; // functions.invoke; map status → reason
export async function fetchPlace(id: string): Promise<Place | null>;     // null = no row
export async function fetchPlaceSummary(id: string): Promise<PlaceSummary>;
export async function fetchPlacePours(id: string, before?: string): Promise<PlacePour[]>; // 60 per page
export function appleMapsUrl(p: PlaceRef): string;
  // `https://maps.apple.com/place?place-id=${raw}&name=${encodeURIComponent(p.name)}` (unified Maps URLs)
export function placeRoute(id: string): string; // `/place/${encodeURIComponent(id)}`
```

- `fetchPlacePours` selects `post_photos` with `id, post_id, path, created_at, posts!inner(author_id, drink_id)`, where `place_id = id`, ordered by `created_at desc`, limit 60, plus `.lt('created_at', before)` for the next page. It drops rows whose drink has left the Dex (`getDrink`), as `toPosts` does.
- `fetchPlaceSummary` calls `rpc('place_summary', { place: id })` and drops top drinks that are not in the Dex.
- `resolvePlace` keeps a module-level `Map<id, PlaceRef>` for the session, so re-picking a place costs no round trip.

### 7.2 `src/types.ts` (shared, add only)

`Post` gains `photoPlaces?: (PlaceRef | null)[]`, **aligned index-for-index with `photoPaths`** (newest first). The reels type from spec 05 gains `place: PlaceRef | null`.

### 7.3 `src/lib/social.ts` (shared, add only)

- `POST_SELECT` gains `place_id, places(id, name, locality)` inside `post_photos(...)`, **only when `PLACES_ENABLED`**. Also mirror the `isMissingAvatarColumn`/`disableAvatarColumn` pattern: a `42703`/`PGRST200` naming `place_id` switches the place columns off for the session and retries once. A flag flipped before the migration then costs one request, not a broken feed.
- `photoList()` keeps its newest-first sort. A sibling `placeList()` returns the places in that same order.
- `createPost(myId, drinkId, caption, localPhotoUri, placeId: string | null = null)` puts `place_id: placeId` on the `post_photos` insert. `addPhotoForDrink(…, placeId = null)` does the same. If the post is not created, the place is not either.
- New: `setPhotoPlace(postId: string, path: string, placeId: string | null): Promise<void>` runs `update({ place_id }).eq('post_id', postId).eq('path', path)` (`(post_id, path)` is unique, 007).

### 7.4 `src/store/social.ts` (shared, add only)

`addPost` and `addPhotoForDrink` take an optional `placeId` and pass it through. The new `setPhotoPlace(postId, path, place: PlaceRef | null)` patches `feed` optimistically (that photo's `photoPlaces` slot), calls the API, restores the slot on failure and bumps `postsVersion` on success.

### 7.5 Flag: in `src/lib/places.ts` (cross-check: there is no `src/lib/flags.ts`)

```ts
// src/lib/places.ts
/** Location tagging (specs/07). Reading places needs only this; tagging also needs the native module. */
export const PLACES_ENABLED = process.env.EXPO_PUBLIC_PLACES === 'on';
```

Then `.env` gets:

```
# Location tagging (specs/07). 'on' shows place lines, venue pages and, on
# builds with the sipply-places module (iOS 18+), the Place field. Before
# 'on': apply 020_places.sql, deploy place-resolve and places-refresh,
# and add their three Apple secrets (specs/07 section 13). JS-only flag.
EXPO_PUBLIC_PLACES=off
```

`const canTag = PLACES_ENABLED && Places.isAvailable() && !!myId;`

---

## 8. UX

Everything here is built only from specs/01's primitives and its section 4 table. It passes `check-design` rule 4 with **no** new `round-ok` markers. All text is sentence case.

### 8.1 Where tagging appears

| Surface | File (owner) | How |
|---|---|---|
| Log a pour | `src/app/log.tsx` (DS; LOC supplies the hunk) | `PlaceField` and the Note `Field` become one `FieldGroup` in the save bar (8.2) |
| Drink card, unlock/update sheet | `src/app/drink/[id].tsx` (DS; LOC hunk) | The same `FieldGroup` around its note `Field` |
| Clip review | `src/components/reels/ReelReview.tsx` (REELS; LOC hunk) | A "Tag a place" row directly under 05's drink tag row, with that row's anatomy (8.2) |
| Your own post | `src/components/PostCard.tsx` ⋯ menu (HOME; LOC hunk) | "Add a place", "Edit place", "Remove place" (8.5) |
| Your own clip | 05's ⋯ action sheet (REELS; LOC hunk) | The same three items |

### 8.2 `PlaceField` (`src/components/place/PlaceField.tsx`, LOC)

```ts
export function PlaceField(props: {
  value: PlaceRef | null;
  onChange: (p: PlaceRef | null) => void;
  disabled?: boolean;        // inside a FieldGroup it draws no box of its own (FieldGroup's context)
}): JSX.Element;
```

- It is DS's `SelectField`: label **"Place (optional)"**, `value = locality ? `${name} · ${locality}` : name`, placeholder **"Add a place"**, height `layout.field` (56), trailing `chevronDown` 20. Pressing it opens `PlacePicker` (8.3).
- In `log.tsx` and the drink sheet it sits in a `FieldGroup` with the Note field, place first:

  ```tsx
  <FieldGroup hint={place ? undefined : 'Shown with this photo on your post.'}>
    <PlaceField value={place} onChange={setPlace} />
    <Field label="Note (optional)" … />
  </FieldGroup>
  ```

  Grouping saves the gap a second box would cost the bottom bar. With a place set, pass no `hint`. Render this row directly under the group instead (marginTop 8): on the left, "Shown with this photo on your post." (`textRole.helper`, `textMuted`, `flex: 1`); on the right, a text button **"Remove"** (`Button variant="text" size="sm" muted`, hitSlop to 44, label "Remove place"). A note error from the group still replaces the helper text, and Remove stays.
- With the field present, the Note placeholder "Where you had it, what you thought" becomes **"What you thought of it"**. The place now answers "where".
- "Save to Dex" ignores the place (a private entry has no post). Phase 2 keeps it on the device instead (section 12).
- Hidden entirely unless `canTag`. Signed out, the field does not render, which matches "Save & post" being dead signed out.
- **Clip review** (dark, spec 05's tokens): a row with 05's drink-tag-row anatomy (height 52, radius 8, 1pt border, `paddingHorizontal: space.md`). Empty: `pin` 20 + "Tag a place" + `chevronRight`. Set: `pin` 20 + name (`fonts.bodySemiBold` 15, 1 line) + locality (13, muted) + clear (`close` 18, 44×44 hit, label "Remove place"). The insert payload gains `place_id`. `REEL_SELECT` gains `place_id, places(id, name, locality)` behind the flag.

### 8.3 `PlacePicker` (`src/components/place/PlacePicker.tsx`, LOC)

`PlacePicker({ visible, current, onPick, onClose })` renders RN `<Modal presentationStyle="pageSheet" animationType="slide">`. Handle both `onRequestClose` and `onDismiss` as close. **Why a component, not a route:** the selection stays in the caller's state, as 05's `DrinkTagSheet` does, and it works over `log.tsx`'s native modal.

Anatomy, top to bottom (gutter `layout.gutter` 16):

1. `ScreenTopBar size="md" inset="sheet" title="Add a place" left={<TopBarTextButton label="Cancel" muted …/>} showRule={scrolled}`: no trailing action.
2. `SearchField` (44), placeholder **"Search bars, restaurants, hotels"**, `returnKeyType="search"`, `autoCorrect={false}`, marginTop 8. It is auto-focused only when the location state is `denied`, `restricted` or `approximate`; otherwise the keyboard would cover the nearby list.
3. **Location area** (only while the query is empty), by `locationState()`:

| State | Shows |
|---|---|
| `notDetermined` | `ListGroup` with one `ListRow`: leading `pin`, title **"Show places near me"**, subtitle **"Uses your location once. It isn't saved."**. Tap calls `requestLocation()` (system prompt), then `nearby()` |
| `precise` | `SectionHeader` **"Nearby"** + results (below). Loads on open |
| `approximate` | `Notice tone="info"`: **"Precise Location is off for Sipply, so nearby places can't be listed. Search by name instead."** |
| `denied` / `restricted` | `Notice tone="info"`: **"Location is off for Sipply. Search by name, or turn it on in Settings."** action **"Settings"** → `Linking.openSettings()` (`restricted`: no action) |

4. **Results** (`ListGroup` of `ListRow`): title = name (`rowTitle`, `numberOfLines` 2), subtitle = `[categoryLabel, locality, distanceText].filter(Boolean).join(' · ')`, leading `pin` 22 `textMuted`. The current place gets fill `wineWash` + trailing `check` 20 `wine`. Rows are 64 tall (`rowTall`).
5. **Footer**, marginVertical 16: **"Places from Apple Maps"** (12, `textMuted`) followed by a text button **"Legal"** that opens `APPLE_MAPS_LEGAL_URL` in `WebBrowser.openBrowserAsync`. It is plain words, not Apple's logo.

Behaviour:

- **Typing:** the query is folded (same `fold` as Dex search, from `src/lib/drinkSearch.ts`, extracted by 04/05). Search starts at **2 characters** after a **350ms** debounce, with **one search in flight** (`cancelSearch()` first). A client token bucket allows **40 searches per rolling 60s**; past that, show the throttled state without calling native. Clearing the query brings the nearby list back from memory (no new call).
- **Tapping a result:** the row goes `busy` (spinner replaces the pin) and `resolvePlace(id)` runs.
  - ok: `haptic.select()`, `onPick(place)`, close.
  - Failure: keep the sheet open and put a `Notice` above the list, worded by reason (8.7).
  - Rows are disabled while one resolves.
- **Refusing non-venues:** the server's allowlist is the authority (`not_a_venue`). The module already filters by category, so this is a backstop.
- **VoiceOver:** after each search, `useAnnounce` reads "{n} places" (or the empty message). Row labels read "{name}, {category}, {locality}, {distance}" plus ", selected".

States:

| State | Render |
|---|---|
| Loading nearby / searching | `Hold fill={false} slowMessage="Still searching."` under the search field (01 §5.17; no skeleton rows) |
| Nearby empty | `ListRow` (static) **"No bars or restaurants within 1 km. Search by name."** |
| Search empty | Text 14/20 `textMuted`, centred, marginTop 24: **"No places match “{q}”. Homes and street addresses can't be tagged."** |
| Offline / failed | `Notice tone="error"` **"Couldn't search places. Check your connection and try again."** action **"Try again"** |
| Throttled | `Notice tone="info"` **"That's a lot of searches. Try again in a minute."** |

### 8.4 The place line on posts and clips (`src/components/place/PlaceLine.tsx`, LOC)

`PlaceLine({ place, tone: 'paper' | 'media', reserve?: boolean, onPress })`:

- Row, gap 4: `pin` 14 + name, `textRole.rowSubtitle` (13/18), `numberOfLines={1}`. Paper uses `textMuted`. Media uses 05's `reelInk` with `reelTextShadow` and `fonts.bodyMedium` 13.
- `Pressable`, `hitSlop={{ top: 2, bottom: 8, right: 12 }}`, `accessibilityRole="button"`, label **"At {name}. Opens the place."** Tap → `router.push(placeRoute(id))`.
- `reserve`: renders an invisible line of the same height (`opacity: 0`, hidden from VoiceOver) when `place` is null.

**PostCard (specs/03 §6.4, HOME owns; LOC supplies this hunk):** the author row gains a **third line** under the drink tag. It shows the place of the **photo on screen** (`post.photoPlaces[galleryIndex]`). If any photo on the post has a place, the line is reserved, so swiping the gallery never makes the row jump. The row's `minHeight` 56 becomes content-sized (about 70 with three lines). The profile grid, Saved, Activity and the pours viewer never show places.

**Clip overlay (specs/05 §7.4, REELS owns; LOC hunk):** in the left block, a `PlaceLine tone="media"` row (height 24) directly under the author row, only when the clip has a place. The page's a11y label gains "At {name}." after the drink part.

### 8.5 Change or remove a place on your own post or clip

PostCard ⋯ on your own post (after "Open in the Dex"):

- No place on the visible photo: **"Add a place"** (needs `canTag`) → `PlacePicker` → `setPhotoPlace`.
- With one: **"Edit place"** (needs `canTag`) and **"Remove place"** (always shown when `PLACES_ENABLED`, so removal never depends on iOS version or the module). There is no confirm, since it is reversible. `haptic.success()` on success. On failure, `showNotice('Couldn't update the place', 'Check your connection and try again.')`.

The same three items appear in 05's clip action sheet, against `reels.place_id`.

### 8.6 Venue page: `src/app/place/[id].tsx` (route) + `src/components/place/PlaceView.tsx` (LOC)

**Route.** It is a plain push, so `_layout.tsx` needs no `Stack.Screen` entry (like `user/[id]`). Gate it exactly as `user/[id].tsx` does: signed out, or with a placeholder handle, `<AuthGate>{null}</AuthGate>`. Decode the param. If it fails `PLACE_ID`, go straight to the missing state. `drinkdex://place/apple:<raw>` reaches it with no `+native-intent` change (unknown paths pass through). Back: `router.canGoBack() ? back() : replace('/')`.

**Data.** `fetchPlace`, `fetchPlaceSummary` and the first `fetchPlacePours` page run in parallel. They use the keyed `loading | failed | missing | ready` state pattern from specs/03 (`usePostsByAuthor`). Pull to refresh reloads all three. Reaching the end loads the next page of 60 while the last page was full.

**Anatomy** (one `FlatList`, `numColumns={1}`, rows pre-chunked as in specs/03 §8.5):

1. `ScreenTopBar size="md"` with a back `TopBarButton`. The title is the place name, shown **only once scrolled** past the header name (`useScrolledPast(56)` from `ScreenTopBar.tsx`); the swap is instant. `showRule={scrolled}`.
2. **Header** (`paddingHorizontal` 16, `paddingTop` 12):
   - Name: `textRole.emptyTitle` (Inter SemiBold 22/28), `text`, `numberOfLines` 2, role `header`.
   - Meta: `"{categoryLabel} · {locality}"` (skip whichever is missing), `textRole.rowSubtitle`, `textMuted`, marginTop 2.
   - Counts, marginTop 12: **"{n} pours · {m} people"** at 14/20. Numbers in `fonts.bodySemiBold` `text` and `tabular`; words in `textMuted`. Singular: "1 pour", "1 person".
   - Actions, marginTop 12, row, gap 8, each `flex: 1`: `Button variant="secondary" size="sm" icon="pin"` **"Directions"** → `openInMaps(id)`, falling back to `Linking.openURL(appleMapsUrl(place))`. Hidden when `gone`. `Button variant="secondary" size="sm" icon="share"` **"Share"** → `Share.share({ message })` (8.7).
   - Gone: `Notice tone="info"` **"Apple Maps no longer lists this place. Its pours stay here."**, marginTop 12.
3. **Most logged here** (only when `pours ≥ 3` and at least 2 distinct drinks), marginTop 24: `SectionHeader` **"Most logged here"**, then a `ListGroup` of up to 3 `ListRow`s:
   - leading node: a 44pt drink thumbnail (`radius.badge`, 1pt `line`, category wash, `DrinkArt`)
   - title: drink name (`emphasis`)
   - subtitle: `"{formatDexNumber} · {Cocktail|Spirit}"`
   - trailing text: the count (`tabular`)
   - tap → `/drink/[id]`
4. `SectionHeader` **"Recent pours"**, marginTop 24, marginBottom 8 (gutter applies).
5. **Grid**, outside the gutters: 3-up square tiles, `layout.gridGap` (2) gutters, radius `none` (`PlacePourTile`, which reuses `useSignedPhoto` and the specs/03 tile metrics). A tile shows **the tagged photo**, not the post's newest. Tap → `/post/[postId]` (specs/03 §10.2). a11y "Photo of {drink} by @{username}". Usernames come from `useSocial.profiles` / `fetchProfiles` for the page's authors.
6. **Footer**, centred, marginVertical 24: **"Place details from Apple Maps"** + text button **"Legal"**.

**States:**

| State | Render |
|---|---|
| Loading | `Hold` for the header area + 2 rows of static `bgSunk` placeholder tiles for the grid (01 §11's known-grid allowance). |
| Failed, nothing held | `EmptyState icon="alert"` "Could not load this place" / "Check your connection and try again." / secondary **"Try again"** |
| Missing (bad ID or no row) | `EmptyState icon="pin"` "Place unavailable" / "This place isn't on Sipply, or it no longer exists." / secondary **"Back"** |
| No pours (every tag removed, or all by blocked people) | Header as normal, then `EmptyState icon="pin"` "No pours here yet" / "Pours tagged here show up on this page." with no action. Phase 3 adds "Log a pour here". |
| Refresh fails over data | `Notice tone="error"` "Could not refresh. Pull down to try again." as the first row, keeping the content |
| Offline | Same as failed (specs/01 §11: no NetInfo) |

Blocks need no client code: `post_photos_read` follows `posts_read`, so a blocked author's pours, counts and top drinks never come back.

### 8.7 Copy

| Where | Text |
|---|---|
| Field | "Place (optional)" · placeholder "Add a place" · hint "Shown with this photo on your post." · "Remove" |
| Picker title / cancel | "Add a place" · "Cancel" |
| Resolve, `rate_limited` | "You've added a lot of new places today. Try again tomorrow." |
| Resolve, `not_a_venue` | "This place can't be tagged. Only bars, restaurants and similar venues can." |
| Resolve, `not_found` | "Apple Maps doesn't list this place any more. Pick another." |
| Resolve, `busy` / `offline` / `failed` | "Couldn't add this place. Try again." |
| Share message | `Pours at {name} on Sipply.\nOpen in Sipply: drinkdex://place/{encodedId}\nDirections: {appleMapsUrl}` |
| Post menu | "Add a place" · "Edit place" · "Remove place" |

### 8.8 Glyph: `pin` (DS owns `icons.tsx`; LOC supplies it)

Outline only. On the house 24 grid with the 1.75 stroke, it is a generic map marker, not any company's mark:

```tsx
pin: (<><Path d="M12 21.1s-6.6-5.7-6.6-11.2a6.6 6.6 0 0 1 13.2 0c0 5.5-6.6 11.2-6.6 11.2z" /><Circle cx="12" cy="9.9" r="2.4" /></>),
```

Add `'pin'` to `IconName`.

---

## 9. Privacy, safety, permissions

### 9.1 Permission (`app.json`, LOC)

Add under `expo.ios`:

```json
"infoPlist": {
  "NSLocationWhenInUseUsageDescription": "Sipply uses your location only while you choose a place to tag on a pour, to list the bars and restaurants around you. It is never saved, and it is never sent to Sipply's servers."
}
```

That is the **only** location key. There are no `NSLocationAlways*` keys, no `UIBackgroundModes` `location`, and no `NSLocationTemporaryUsageDescriptionDictionary` (approximate users are not asked to upgrade; they search by name).

Rules:

1. The prompt only ever follows a tap on "Show places near me". It never appears on launch, and there is no custom pre-prompt.
2. Denial costs nothing but the nearby list.
3. Changing permission in Settings is read fresh each time the picker opens (`locationState()`).

### 9.2 Safety rails (all Phase 1)

| Risk | Rail |
|---|---|
| Pinning someone's home | `resultTypes = .pointOfInterest` plus the 12-category allowlist on the phone, enforced again in `place-resolve`. Addresses never resolve. |
| Revealing one person's routine | No per-user places view, no history, no map of a profile (L9). The grid, Saved and Activity never show places. |
| Real-time "she's at X now" | Removing or changing a tag works at any time (8.5). Blocks hide pours on venue pages through RLS. There are no check-ins, no "who's here" and no notifications to followers about places. |
| Forged venues and names | Clients cannot write `places`. Only the function writes, after Apple confirms the ID. |
| Quota exhaustion by abuse | 100 new-place lookups per account per 24h. Fresh rows cost no Apple call. |
| Location retention | Device fix kept in native memory for at most 120s and never in JS. The server holds no coordinates at all. |
| Photo GPS | Still stripped (`pour.ts`). Tagging never reads EXIF (L12). |

### 9.3 Privacy policy (`docs/privacy.md`, LOC, published with the Phase 1 build)

1. **New paragraph** after **Photos**:

   > **Places (only if you tag one).** When you add a place to a pour or a clip, Sipply lists places near you or places matching what you type. To list nearby places, your phone asks Apple Maps using your location, only while that list is open and only if you allow it. Your location is not saved, on the phone or anywhere else, and it is never sent to Sipply's servers. Only venues can be tagged (bars, restaurants, hotels, breweries, wineries, distilleries, cafés, markets, shops, music venues, stadiums and theaters), never a home or a street address. The place you choose is stored with that photo or clip: Apple's identifier for it, and its name, neighbourhood, country and kind of venue, which our server gets from Apple Maps and refreshes. Anyone who can see the post or clip can see the place, and each place has a page showing the pours tagged there. You can change or remove the place on your own posts and clips at any time. Tagging never reads where a photo was taken: photos still carry no location.

2. **Matching limits** paragraph, add:

   > To protect the service, we also count how many new places each account looks up in a day (at most 100) and when, never which places.

3. **What Sipply does not do**, add a bullet:

   > **No location tracking.** Sipply never uses your location in the background, never saves it, and never sends it to our servers.

4. **Who else can see it**, add:

   > **Apple Maps**, if you tag a place: your phone sends your search, and your location if you allow it, to Apple to find places, under Apple's privacy policy. Our server sends Apple only a place's identifier, never anything about you.

5. **Deleting your account**, add "the record kept for the place-lookup limit" to the list. Tags go with the posts and clips.
6. Update **Last updated**.

### 9.4 App Privacy and the privacy manifest

- **App Store Connect → App Privacy:** add **Location → Coarse Location**, linked to the user, **App Functionality** only, not tracking.
  - Why coarse: a venue tag says where someone was at venue level, and we never collect a coordinate. Declaring it is honest, and under-declaring is a rejection risk.
  - **Precise Location stays "Not collected".**
- **`docs/appstore.md`** (LOC):
  - Add the row: `Location → Coarse Location | Yes | The venue a user chooses to tag on a post or clip, shown with it. The device's own location is used on the phone only, to list nearby venues, and is never sent to Sipply.`
  - Remove "Location (photos are re-encoded without it)" from the "Not collected" sentence and replace it with "Precise Location (photos are re-encoded without it, and the device's location never leaves the phone except to Apple Maps for a search)".
  - Extend the Other Usage Data row with "and how many new places an account looked up, kept 24 hours to enforce the 100-a-day limit".
- **`app.json` privacy manifest:** append to `NSPrivacyCollectedDataTypes`:

  ```json
  { "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeCoarseLocation",
    "NSPrivacyCollectedDataTypeLinked": true,
    "NSPrivacyCollectedDataTypeTracking": false,
    "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"] }
  ```

  CoreLocation and MapKit are not required-reason APIs, so no `NSPrivacyAccessedAPITypes` change.

### 9.5 Terms (`docs/terms.md`, LOC)

Under what users must not post, add:

> Tag only places you were actually at, and don't use a place tag to mislead or to harass.

Under content, add:

> Place names and details come from Apple Maps. A place appearing in Sipply doesn't mean it endorses Sipply or that Sipply endorses it.

### 9.6 App Review notes (Phase 1 submission)

> Location: When In Use only. It is requested only when the user taps "Show places near me" in Add a place (Log a pour → Place). Denying it leaves search by name working. Location is used on the device for MapKit search and is never sent to our servers. No background location. Only venues (MapKit point-of-interest categories) can be tagged.

Guidelines to check: 5.1.1 (permission on demand, purpose string, works when denied), 5.1.5 (location directly relevant), 2.5.4 (no background modes), 1.4.3 (nothing encourages excess; the app stays 18+). Phase 4 revisits all of these.

---

## 10. Accessibility

- Every control reaches 44×44. `PlaceLine` and the "Remove" text button use `hitSlop`, and each has a second path (post menu → Edit/Remove place).
- `PlaceField` is a `SelectField`: VoiceOver reads "Place (optional), La Factoría · San Juan" with the hint "Opens a list".
- Picker rows, the location row and Notices follow specs/01 §12. Search result counts are announced. A resolve error is announced (Notice with `useAnnounce`).
- Dynamic Type: rows use `minHeight` and grow. Picker names wrap to 2 lines. The venue name wraps to 2. `PlaceLine` caps at `maxFontSizeMultiplier={1.4}` on clips (05's overlay rule).
- Reduce Motion: nothing in this spec animates beyond the Modal's system slide.
- Colour independence: the selected picker row adds a check glyph and a "selected" state.

---

## 11. Files and owners (Phase 1)

### Create (LOC)

| File | What |
|---|---|
| `modules/sipply-places/expo-module.config.json`, `index.ts`, `ios/SipplyPlaces.podspec`, `ios/SipplyPlacesModule.swift`, `ios/OneShotLocator.swift` | Section 6 |
| `supabase/migrations/020_places.sql` | Section 4, verbatim |
| `supabase/functions/_shared/appleMaps.ts`, `place-resolve/index.ts`, `places-refresh/index.ts` | Section 5 |
| `src/lib/places.ts` | Section 7.1 |
| `src/components/place/PlaceField.tsx`, `PlacePicker.tsx`, `PlaceLine.tsx`, `PlaceView.tsx`, `PlacePourTile.tsx` | Section 8 |
| `src/app/place/[id].tsx` | Section 8.6 |

### Change

| File | Owner | Change |
|---|---|---|
| `app.json` | LOC | `ios.infoPlist` string (9.1), privacy manifest entry (9.4) |
| `.env` | LOC | `EXPO_PUBLIC_PLACES=off` block (7.5) |
| `src/lib/places.ts` | LOC (creates it, 7.1) | `PLACES_ENABLED` lives here (no `flags.ts`) |
| `src/components/icons.tsx` | DS (LOC hunk) | `pin` (8.8) |
| `src/types.ts`, `src/lib/social.ts`, `src/store/social.ts` | Shared, add only | Sections 7.2 to 7.4 |
| `src/lib/database.types.ts` | Shared | `places` row type, `post_photos.place_id`, `reels.place_id`, `place_summary` function |
| `supabase/schema.sql` | Shared | Same SQL as the migration, in the matching sections, plus the `schema_migrations` row; header "as of 020" |
| `src/app/log.tsx` | DS (LOC hunk) | `place` state, `FieldGroup` (8.2), `addPost(…, place?.id)` / `addPhotoForDrink(…, place?.id)`, Note placeholder |
| `src/app/drink/[id].tsx` | DS (LOC hunk) | The same in the unlock/update sheet |
| `src/components/PostCard.tsx` | HOME (LOC hunk) | Third author-row line (8.4), menu items (8.5) |
| `src/lib/reels.ts`, `ReelCell.tsx`, `ReelReview.tsx`, 05's action sheet | REELS (LOC hunk) | `REEL_SELECT`, insert payload, overlay line, review row, menu items |
| `docs/privacy.md`, `docs/appstore.md`, `docs/terms.md` | LOC | Sections 9.3 to 9.5 |
| `docs/support.md` | LOC | One Q&A: "How do I remove a place from my post? Open the post, tap ⋯, Remove place." |

No change: `_layout.tsx`, `+native-intent.tsx`, `AuthGate.tsx`, `FloatingTabBar.tsx`, `theme.ts` (no new tokens).

---

## 12. Phases and what each costs Jan

| Phase | What ships | Money | Jan's time | Build |
|---|---|---|---|---|
| **0 · Now** | Nothing. The constraints in 1.1. | $0 | 0 | none |
| **1 · Tag and show** | Everything in sections 4 to 11: module, picker, Place field (log, drink sheet, clip review), place lines, edit/remove, venue page with counts and "Most logged here", refresh cron, privacy and App Store updates | **$0.** Apple lookups are inside the $99/yr membership (25,000 calls a day). Supabase Edge invocations are a few thousand a month, far inside the free tier's 500,000. No per-search fees. | About 60 minutes of setup (section 13), plus one TestFlight pass | **One native build** (new module), then a JS flag flip |
| **2 · Find places** | `/places` screen ("Popular near you", "Popular on Sipply"), opened from a `pin` IconButton in Home's second trailing slot (HOME merges). Venue page `TabStrip` Pours / Clips. "Had at …" on the drink card from an on-device `UnlockRecord.placeId` (ID only; the name is read from `places`, re-resolved if it was pruned). | $0 | 5 minutes (run one migration) | JS only (EAS Update) |
| **3 · Venue kit** | `drinkdex://log?place=<id>` opens Log a pour with the place preset (log reads `useLocalSearchParams().place`, resolves it, prefills). A static redirect page `docs/p/index.html?id=<id>` that tries the app link and otherwise shows the App Store link. A printable QR poster per venue from `scripts/venue-poster.mjs`. The venue page's empty state gains "Log a pour here". | $0 plus printing | Delivering posters to bars | JS only |
| **4 · Venue partners** (only if Jan decides to charge venues) | Venue claims (owner verification), owner-written details (hours, specials) stored as **our** data next to the Apple ID, a "Partner" label, featured placement marked "Sponsored", payment through the Stripe Connect kit | Stripe fees per payment, and **a lawyer's review before building**: alcohol advertising rules in Puerto Rico and the US, FTC disclosure, Apple's licence on commercial use of Map Data (Apple DTS declines to interpret it) | Sales, verification, support | JS plus one migration; likely a new build for any new native need |

**Phase 2's "Popular near you" must not leak location.** The phone runs `nearby()` (radius 2,000m, up to 25 results) and fetches `popular_places(country)`, where country is the `countryCode` of the nearby results computed on the phone. That returns the top 500 places in that country by pours in the last 90 days, with counts. The phone intersects the two lists locally and caches the country list for 6 hours. The server learns only the country, never which venues are near the user. "Popular on Sipply" is the same list, unfiltered. Without precise location, only "Popular on Sipply" shows.

---

## 13. What Jan must configure (Phase 1, in this order)

1. **Coverage check (10 minutes, before any building):** in Apple Maps on his iPhone, search for ten bars and restaurants he knows in San Juan. If more than two are missing or miscategorised, stop and tell the engineer. The fallback is option D, at the cost shown in section 2.1.
2. **Apple Developer → Certificates, Identifiers & Profiles:**
   - **Identifiers → +, Maps IDs**: description "Sipply", identifier `maps.com.janmcqueeny.drinkdex`.
   - **Keys → +**: name "Sipply Maps", tick **MapKit JS** (it also covers Maps Server API), configure it with that Maps ID, and download the `.p8`. It downloads **once**, so keep it with the Wallet key on the Desktop.
   - Note the **Key ID** and the **Team ID** (top right of the page).
3. **Supabase → SQL Editor:** paste and run `supabase/migrations/020_places.sql` (after 019, which creates `reels`).
4. **Supabase → Edge Functions → Secrets:**
   - `APPLE_MAPS_TEAM_ID`
   - `APPLE_MAPS_KEY_ID`
   - `APPLE_MAPS_PRIVATE_KEY_B64`: the value from the command below, which copies the base64 of the downloaded key straight to the clipboard:

   ```sh
   base64 -i ~/Downloads/AuthKey_*.p8 | pbcopy
   ```

5. **Supabase → Edge Functions:** deploy `place-resolve` and `places-refresh` (dashboard editor, pasting each `index.ts` and the `_shared` file, or `supabase functions deploy`). Leave **Verify JWT** on for both.
6. **Supabase → Integrations → Cron:** enable it, then create a job named `places-refresh` with schedule `0 9 * * 1` (Mondays 09:00 UTC), type **Supabase Edge Function**, function `places-refresh`, and the service-key auth header the dashboard offers from Vault.
7. **Build:** the next native build (local `scripts/build-ios.sh`) carries the module. Run `scripts/check-native-links.sh` on the `.app`. Then set `EXPO_PUBLIC_PLACES=on` for that build, or ship it later as an EAS Update for that runtime.
8. **App Store Connect:**
   - App Privacy: add Coarse Location (9.4).
   - Review notes: paste 9.6.
   - Publish the privacy policy and terms first: `docs/` goes live when `main` moves.
9. **Quota note:** the 25,000-a-day Apple quota is per **team**. If Jan's other apps on the same developer team ever use MapKit JS or the Maps Server API, they share it. For more, use Apple's capacity request form (free).

Phase 2: run the `popular_places` migration. Phases 3 and 4: see section 12.

---

## 14. Verification and acceptance (Phase 1)

Engineer, before calling it done:

- `npx tsc --noEmit`, `npx expo lint`, `node scripts/check-design.mjs` (no new `round-ok`), `node scripts/check-contrast.mjs`.
- `plutil -p <Sipply.app>/Info.plist | grep -i location` prints exactly one key, `NSLocationWhenInUseUsageDescription`. `grep -c UIBackgroundModes` finds no `location`.
- `nm -u` on the app binary shows no `requestAlwaysAuthorization`.
- `scripts/check-native-links.sh <Sipply.app>` passes.
- In JS, `Object.keys(candidate)` is exactly `id, name, locality, category, distanceText`. No coordinate exists in JS.
- `place-resolve` checks (curl with a test user's JWT):
  - a real bar ID gives 200
  - a street address ID gives 422 `not_a_venue`
  - garbage gives 400
  - the 101st new ID in 24h gives 429
  - a second call for a fresh ID makes no Apple request (check the function logs)
- RLS:
  - a client cannot insert into `places`
  - `update post_photos set place_id` on another user's photo affects 0 rows
  - a blocked author's tagged pours are absent from `fetchPlacePours` and from `place_summary` counts
- `places-refresh` run by hand: stale rows refresh. A row with a forced bogus ID gets `gone_at`. An untagged row older than 30 days is deleted.

Device acceptance (iPhone on iOS 18+, and one on iOS 17 or a build without the module):

- [ ] On iOS 17 or an old build: no Place field anywhere. Place lines and venue pages still show, and Remove place still works.
- [ ] First "Show places near me" shows the system prompt with the 9.1 text. "Allow Once" lists nearby bars with distances in feet or miles. "Don't Allow" shows the Settings notice, and search by name still works.
- [ ] Precise Location off: approximate notice, and search still finds places near the city.
- [ ] Searching a street address or a school finds nothing taggable.
- [ ] Airplane mode: search shows the error notice. Picking a place fails with "Couldn't add this place". Saving the pour without a place still works.
- [ ] Save & post with a place: the feed shows the place line under the drink tag. Tapping it opens the venue page with the photo in Recent pours.
- [ ] Gallery post with places on some photos: the line changes with the photo and the row never jumps.
- [ ] Remove place from the ⋯ menu: the line goes, and the pour leaves the venue page after refresh.
- [ ] Clip with a place (if 05 has shipped): the overlay line shows, and the a11y label includes "At {name}".
- [ ] Directions opens Apple Maps at the venue. Share produces the 8.7 message.
- [ ] VoiceOver: picker rows, the field, the place line and the venue header read as specified. AX3 text wraps without clipping.

---

## 15. Sources (checked 30 Sep 2026)

- Apple Maps Server API overview, quota (25,000 calls per day per team, shared with MapKit JS) and endpoints (`/v1/token`, `/v1/place/{id}`, `/v1/place?ids=`, `/v1/place/alternateIds`): https://developer.apple.com/documentation/applemapsserverapi
- Place IDs persist and can be stored (WWDC24 "Unlock the power of places with MapKit"): https://developer.apple.com/videos/play/wwdc2024/10097/ and `MKMapItem.identifier`: https://developer.apple.com/documentation/mapkit/mkmapitem
- Program Licence Agreement, Schedule 6 (Apple Maps Service), §2.2 (no derived database) and §2.5 (cache only temporary and limited): https://developer.apple.com/support/terms/apple-developer-program-license-agreement ; DTS declining to interpret caching terms: https://developer.apple.com/forums/thread/807656
- MKLocalSearch throttling (50 requests per 60s, observed): https://developer.apple.com/forums/thread/760867
- `MKPointOfInterestCategory` list (iOS 18 adds `distillery`, `musicVenue` and others): https://developer.apple.com/documentation/mapkit/mkpointofinterestcategory
- Unified Maps URLs (`/place?place-id=`): https://developer.apple.com/documentation/mapkit/unified-map-urls
- expo-maps v57 (alpha; no search API): https://docs.expo.dev/versions/v57.0.0/sdk/maps/
- expo-location v57 plugin defaults (writes Always strings): https://docs.expo.dev/versions/v57.0.0/sdk/location/
- Local Expo modules: https://docs.expo.dev/modules/get-started/
- Google Maps Platform pricing (per-SKU free caps since 1 Mar 2025; Nearby Search Pro $32 per 1,000 after 5,000): https://developers.google.com/maps/billing-and-pricing/pricing ; Places terms (no non-Google map; lat/lng ≤ 30 days; place_id storable): https://cloud.google.com/maps-platform/terms/maps-service-terms
- Foursquare Places pricing (500 free Pro calls a month, then $15 per 1,000; Premium $18.75): https://foursquare.com/products/pricing/
