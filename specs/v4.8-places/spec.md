# v4.8 · Places: tag the bar, see where a drink has been had (build spec)

Jan, 25 Oct 2026:

> "I want you to connect google maps, or apple maps, so people can tag the place / bar they are at so people also know where they can try that drink."

This file is the build contract. Part 0 lists the decisions. Parts 1 to 4 are the native module, the data, the screens, and privacy and review. Part 5 says who owns which file and what each package hands the others. Part 6 lists the checks. Part 7 lists what only Jan can do. Measures are at 440 x 956 unless a 390 figure is given.

**It supersedes `specs/07-location-tagging-longterm.md` wherever they differ** (0.2 says where and why). Package D adds a line saying so at the top of 07.

Rules that hold everywhere in this round (the same as v4.6 and v4.7):
- **Daylight.** Black and white. **No new accent place**: no red in any file this round touches, so `scripts/check-design.mjs` rule 17's `ACCENT_FILES` and `DETAIL_SITES` do not change. **No new pen marks** either: the place page is a pushed screen, the search is a sheet and the post's header is body text, and v4.6 A.4 rules out marks in all three.
- Inter everywhere. Playfair only for drink names (`DrinkName`, the `name*` roles). Squared keys and chips (`radius.control`). No uppercase. Nothing under 11pt.
- **Less stuff** (Jan's standing rule). Nothing new shows on a screen until it has something to say. Tagging is one optional row. The drink page's section is hidden when there are no places. Details sit behind a tap.
- No Reanimated `entering`, `exiting` or `layout` props. Nothing in this round animates beyond the system's sheet slide and the existing press fills.
- **App Store 1.4.3.** A place is only ever "where people have had it". The app never offers deals, happy hours, prices, opening hours or "best bars". It never ranks bars by popularity and never says "drink more". Counts are **people**, never amounts. Ordering is by people you follow, then when it was last posted (distance went with the coordinates, 0.5). It is never by how many.
- The worktree is `/Users/janmcqueeny/Projects/drinkdex-worktrees/polish` on branch `v3-3`. **No package commits, pushes, touches `~/Projects/drinkdex`, or applies a migration.** 026 is written and read, and never run (Part 7).

---

## 0. Decisions

### 0.1 At a glance

| # | Decision | Why |
|---|---|---|
| P1 | **Apple Maps through MapKit on the phone.** `MKLocalSearchCompleter` gives suggestions as you type. `MKLocalSearch` resolves a pick into a place. `MKLocalPointsOfInterestRequest` lists what is nearby. There is no Google API, no API key, no billing and no server proxy. | It costs $0 at any volume. It is first party for App Review. What the user types and where they are go only to Apple. |
| P2 | **Apple Maps only, with an Apple map beside the data** (revised 26 Oct 2026, 0.4). Every place offers **"Open in Apple Maps"** (native, `MKMapItem.openInMaps`). There is **no Google Maps link**. Wherever a venue's Apple address is shown (the search's "Tag this place" step and the place page) a still Apple map of it is drawn (`PlaceMapView`, 1.8). | MapKit's licence (DPLA Attachment 6 §2.4): Map Data may be shown "only on an Apple map", and never "without displaying the corresponding Apple map". A Google link hands Apple's record to Google's map. Jan asked for Google **or** Apple, so Apple alone meets the request. |
| P3 | **Only drink venues can be tagged.** The categories are nightlife, brewery, winery, restaurant, cafe and hotel (iOS 13 and later), plus distillery and musicVenue (iOS 18 and later). The filter is applied on the phone, and 026's check enforces the same set. | A tag says where you can try a drink. It must never pin a home or a street address. Markets, stores, stadiums and theatres are left out: they are not where someone "had" a cocktail in the sense Jan means. |
| P4 | **Location is optional and When In Use only.** It is asked for only when the person taps "Show places near me". It only biases the search toward nearby places (since 0.5 it no longer sorts a drink's places: there is no distance without stored coordinates). **The device's location never leaves the phone except to Apple, and it is never stored.** Without it, text search still works. | Guideline 5.1.1 (asked on demand, works when denied) and 5.1.5. It also lets the privacy policy say one plain sentence. |
| P5 | **A place belongs to a photo:** `post_photos.place_id`, not `posts.place_id`. The post card shows the place of the photo on screen. The first photo is the newest, so by default that is the latest photo's place. | A post is one drink per person forever (`posts_one_per_drink`, 007). Each re-post adds a photo, and the same drink can be had at another bar next month. "Where people have had it" is a fact about each time, not about the entry. |
| P6 | **Superseded by 0.5 (26 Oct 2026): the server keeps only Apple's Place ID and the poster's label, on the photo.** As first written: **the server stores the venue a person chose,** in a deduplicated `public.places` table: Apple's id when the phone has one, the name, a one-line address, the locality, the country and the coordinates. One security-definer RPC writes it (`upsert_place`). Clients cannot write the table. | The drink page needs "nearest first" and the place page needs an address and a Maps link. Both need a venue coordinate. See 0.2 for how this differs from 07. |
| P7 | **Tagging is optional on every post** and goes with **Save & post** only, like tags and the song. "Save to Dex" and "Save photo" drop it with no confirm, because not posting is the decision (v4.3 §1.2's rule for tags). | Consistency. A place only means something on something others see. |
| P8 | **Your own post's ••• gets "Add place" or "Remove place"** for the photo on screen. | A tag someone regrets is a safety matter. Adding one later also lets old posts fill the drink pages from day one. One item at a time is the "less stuff" version of 07's three. |
| P9 | **A wrong place is reported through the post's existing Report.** There is one more reason, "Wrong place tagged" (`wrong_place`), and it is offered only when the photo on screen has a place. The report's server-built evidence now includes the post's places. | Task 3(e). No new moderation surface. Jan sees what was tagged in the report itself. |
| P10 | **There is no feature flag. 026 is the switch.** Reading places (the "at …" line, the place page, the drink page section) needs 026. Tagging also needs the native module (`placeSearchAvailable()`). Until Jan applies 026, the build looks exactly like build 32. | It follows the pattern of 024 and 025: a missing table or function reads as "feature off" and never as an error. |

### 0.2 Where this differs from the lead's brief and from spec 07, and why

1. **`drink_places` takes no point.** The brief listed `drink_places(drink_id, near_lat?, near_lng?)`. Sending a point would send the device's location to Sipply's server, which the same brief rules out ("the device location is never sent to Sipply's server or stored"). So the server returns at most 100 places with their venue coordinates, people you follow first, and **the phone sorts by distance**. That costs nothing at launch scale, since a drink is tagged at tens of places, not thousands. If a drink ever has more than 100 tagged places, the cut keeps friends first, then the most recently posted, and the nearest may fall outside it. That is a known limit for later, not a reason to send coordinates.
2. **Places are never ordered by how many people.** After "people you follow", the brief's order and 1.4.3 leave distance (on the phone) and then recency (`last_at`). A people count is shown beside each place but never used to rank it, so "Where people have had it" can never read as a chart of bars.
3. **Spec 07 kept no coordinates on the server**, out of caution about Apple's licence on caching Map Data. 07 cites Program Licence Agreement Schedule 6 §2.5, "temporary and limited", and Apple DTS declining to interpret it. Package S builds what the brief asks (stored coordinates), with two mitigations taken from 07:
   - places that no photo uses are deleted after 30 days of not being picked (`last_used_at`), inside `upsert_place`;
   - nothing is ever bulk-fetched from Apple, refreshed or served outside the app.

   **This is Jan's call** (Part 7, item 2), and it is wider than coordinates: 0.4 #3 restates it.
4. **07 verified every place on the server** (Edge Functions plus the Apple Maps Server API, with a Maps key). The brief rules out a server proxy and a key, so a modified client could create a place with a made-up name. The rails are:
   - the content filter on the name and address;
   - 30 new places per account per day;
   - shape and category checks;
   - the new report reason;
   - first writer wins, because no call can rename an existing place.

   If abuse ever appears, 07 §5's `place-resolve` is the upgrade path and needs no schema change.
5. 07's `pin` glyph, `PlaceLine`, venue page and privacy wording are reused where they still fit. 07's "Most logged here" ranking and its pour counts are **not**, because of rule 2 above.

### 0.3 The deployment target, checked

- `node_modules/expo-modules-core/ExpoModulesCore.podspec` (57.0.21) sets `:ios => '16.4'`.
- The build 32 archive's `Info.plist` (`~/Library/Developer/Xcode/Archives/2026-10-24/Sipply 1.0.0 (32) 12.22.xcarchive`) has `MinimumOSVersion` = **16.4**, built with `DTXcode` 2710 against `iphoneos27.1`.
- So every API newer than iOS 16.4 is guarded by `#available`. The ones used here, read from the iPhoneOS27.1 SDK headers in `/Applications/Xcode.app`:

| API | Availability | Use |
|---|---|---|
| `MKLocalSearchCompleter.resultTypes`, `.pointOfInterestFilter` | iOS 13 | suggestions, POI only |
| `MKLocalSearch.Request(completion:)` | iOS 9.3 | resolve a suggestion |
| `MKLocalSearch.Request.resultTypes`, `.pointOfInterestFilter` | iOS 13 | |
| `MKLocalPointsOfInterestRequest(center:radius:)`, `MKLocalSearch(request:)` taking it | iOS 14 | nearby |
| `MKPointOfInterestCategory` `.nightlife .brewery .winery .restaurant .cafe .hotel` | iOS 13 | venues |
| `MKPointOfInterestCategory` `.distillery .musicVenue` | **iOS 18** | `#available(iOS 18.0, *)` |
| `MKMapItem.identifier` (`MKMapItem.Identifier`, `.rawValue`) | **iOS 18** | `appleId`, else null |
| `MKMapItemRequest(mapItemIdentifier:)`, `getMapItem(completionHandler:)` | **iOS 18** | Open in Apple Maps by id |
| `MKMapItem.placemark` | deprecated **iOS 26** | used only in the `< 26` branch |
| `MKMapItem.location`, `.address`, `.addressRepresentations` (`fullAddress(includingRegion:singleLine:)`, `cityName`, `region`) | **iOS 26** | `#available(iOS 26.0, *)` |
| `CLLocationManager.authorizationStatus` (instance), `.accuracyAuthorization`, `locationManagerDidChangeAuthorization(_:)` | iOS 14 | permission |
| `CLLocationManager.requestLocation()` | iOS 9 | one coarse fix |
| `MKDistanceFormatter.unitStyle = .abbreviated` | iOS 7 | "350 ft", "1.2 km" by locale |

### 0.4 Revision at final integration (26 Oct 2026): the MapKit licence

The privacy review read Apple's Developer Program License Agreement, Attachment 6 (Apple Maps Service), live on 26 Oct 2026; the lead re-read it the same day. Three clauses decide this round:

> §2.2 "neither You nor Your Application may use or make available the Map Data, or any portion thereof, as part of any secondary or derived database."
>
> §2.4 "when displaying it on a map, You agree that it will be displayed only on an Apple map … You may not surface Map Data within Your Application … without displaying the corresponding Apple map … (e.g., if You surface an address result through the Apple Maps Service, You must display the corresponding map with the address result)."
>
> §2.5 "Map Data may not be cached, pre-fetched, or stored … other than on a temporary and limited basis".

What changed in the code because of them:
1. **An Apple map beside every Apple address.** A new native view, `PlaceMapView` (1.8), exported by the same module, draws a still MapKit map of the venue: muted emphasis, light, Apple's own points of interest off, no user location, one marker in ink, no panning or zooming, Apple's logo and Legal link left visible (§2.1). It appears in two places:
   - **The search sheet's new "Tag this place" step (3.2).** A tapped row no longer tags at once: it resolves, then shows the map, the name, "Category · address", **"Tag this place"** (primary, block) and **"Back to search"** (text). That is where the address result the person picks is surfaced. It also makes a wrong bar, the one public mistake a place can make, less likely.
   - **The place page (3.4)**, under the header's words, across the column at 2:1, then the key.
2. **No Google Maps.** `googleMapsUrl` is gone from `lib/places`. The place page's key is **"Open in Apple Maps"**, one tap, no ActionSheet (native by Apple's id on iOS 18+, else a named pin, else `appleMapsUrl`).
3. **Storing places is a §2.2 and §2.5 question, not only a coordinates one.** `public.places` keeps name, address, locality, country, category and coordinates for as long as a photo uses the place: that is a derived database of Map Data, and the 30-day prune of *unused* places does not make the rest temporary. 07 cited only §2.5. **Jan chooses one** before 026 is applied (Part 7):
   - **(a) Apple's Place ID only (recommended by the privacy review).** Store `MKMapItem.Identifier` (Apple presents Place IDs as a persistent reference meant to be saved and looked up again, WWDC24 session 10097) and the category. Tagging needs iOS 18 (`placeSearchAvailable()` false below 18), `upsert_place` requires `apple_id`, the 50 m name match goes, and the phone fetches the name, address and position with `MKMapItemRequest` whenever it shows or sorts a place. Costs: a rewrite of 026, `lib/places` and the screens' data before build 33; the drink page does up to 20 lookups per visit (MapKit throttles at about 50 a minute per device); a place renamed by Apple renames itself.
   - **(b) Place ID plus the name.** As (a), but the name is kept so the feed's "at …" line and the drink page need no lookup. Smaller rewrite; the name is still Map Data, so it is a narrower risk, not none.
   - **(c) Keep this spec's design** (all fields stored, unused rows pruned at 30 days) and accept the risk, or ask Apple in writing (§2.5 "Unless otherwise expressly permitted in writing by Apple").
   
   Nothing in the build changes until Jan picks; this round ships (c) as written, because 026 is not applied and switching now is cheapest. The privacy and App Privacy texts hold for all three (a tagged venue is still Precise Location on the label).

   **Decided 26 Oct 2026 (Jan delegated it): (a), with the poster's own label in place of Apple's name. See 0.5, which overrides every section below where they differ.**
4. **Smaller changes from the reviews** (all in the code now):
   - "Show places near me" says **"Your location isn't sent to Sipply."** (not "stays on your phone": the nearby search sends it to Apple). After a refusal the **same row** reads **"Location is off for Sipply in Settings."** and opens Settings, replacing the sentence and the Settings key ("less stuff").
   - 026's `upsert_place` runs the content filter on the locality as well, since it is shown on three screens.
   - 026's report evidence names each place's photo by **`photo_taken_at`, never its path**: 012's "never a file path" rule holds.
   - The feed header gives the place only what the drink's own width leaves (never under 48pt), so a drink that fits alone never wraps because of a place.
   - The post sheet's caption placeholder is "Say something about it" (the + window's), so the sheet no longer asks "where" twice.
   - `post/[id].tsx` re-reads the post on `placesVersion`, and the drink page's section reloads on `postsVersion` and `placesVersion`.
   - The engine answers a repeated suggestion fragment from its held results only when those results are that fragment's (`settledFragment`).

### 0.5 Licence rework (26 Oct 2026): only Apple's Place ID and the poster's label are stored

**The decision.** Jan delegated 0.4 #3 on 26 Oct 2026, and it was taken as 0.4's option (a) with one change: in place of Apple's name, the server keeps **the poster's own label** for the place. MapKit's licence (DPLA Attachment 6) rules out the first design: §2.2, no "secondary or derived database" of Map Data; §2.5, caching only "on a temporary and limited basis"; §2.4, Apple data shown only with an Apple map. A server table of Apple's names, addresses and coordinates kept as long as a photo uses them is that database, and pruning *unused* rows does not make the rest temporary.

**What the server keeps, per tagged photo, and nothing else:**
1. **Apple's Place ID**: `MKMapItem.identifier.rawValue` (iOS 18+). Apple presents Place IDs as stable references an app may store and look up again (WWDC24 "Unlock the power of places with MapKit"). Column `post_photos.apple_place_id`, shape `^[A-Za-z0-9._:-]{1,100}$` (`post_photos_place_id_shape`).
2. **The poster's label**: the "Tag this place" step prefills a field, **"Name on your post"**, with the name Apple returned, and the poster may edit it like a caption. Column `post_photos.place_label`: 1 to 60 characters, no edge spaces, no control characters, and none of the invisible direction or zero-width marks U+200B, U+200E-F, U+202A-E, U+2066-9, U+FEFF (the joiners U+200C/D stay) (`post_photos_place_label_shape`), and the caption filter on it through a trigger (`reject_objectionable_place`, detail `'place'`). It is user content, the poster's words, which is what lets the feed say "at La Factoría" with no lookup.

Both or neither (`post_photos_place_pair`). **No address, locality, country, category, latitude or longitude is stored anywhere on the server.** `public.places`, `upsert_place`, `private.place_creations` (the 30-a-day meter), `private.metres_between`, `private.place_name_key` and `post_photos.place_id` are gone; 026 drops them if the first draft was ever run (its section 0b). No meter: a label touches only its own photo, like a caption.

**Everything else is resolved live on the phone,** by Place ID, with `MKMapItemRequest(mapItemIdentifier:)` (iOS 18+): the native `resolvePlace(id)` (engine + glue) and `lib/placeSearch`'s `resolvePlace` / `cachedPlace` / `rememberFound`. Answers are held **in JS memory only**: at most 100 places, 30 minutes each, gone on relaunch, never in storage (§2.5 "temporary and limited"). The venue just tagged is primed from the search's own answer, so its page opens with no second ask.

**Where each piece changed:**

| Area | Now |
|---|---|
| Migration 026 / `schema.sql` | `post_photos.apple_place_id`, `place_label`, three checks, the filter trigger, the index on `(apple_place_id, created_at desc)`, `posts_drink_idx`. RPCs: `set_photo_place(post, path, apple_place_id, label)` (both null removes; tidies the label; `place_invalid`); `drink_places(drink)` returns `apple_place_id, label` (the newest), `people`, `followed` (boolean: someone you follow is among them), `last_at`, followed first then most recent, at most 100; `place_drinks(apple_place_id)` returns the drinks plus `people_here` and the newest `label` on every row. Report evidence: `places` = Place ID, label, `photo_taken_at`. Blocks both ways, bounds, grants, idempotent, VERIFY block with a rolled-back smoke test. |
| Native | New `resolvePlace(id)` (MKMapItemRequest, held until it answers, venuesOnly false so a re-filed place still shows, category null outside the table) and `placeIdsAvailable()` (sync, `#available(iOS 18.0, *)`). Search rows without a Place ID are dropped. Typechecked (warnings as errors) at 16.4, 18.0 and 26.0 against the real prebuilt `ExpoModulesCore`, compiled to objects at 16.4 and 26.0, and all 95 `ExpoModulesCore` symbols the objects need are exported by that binary. |
| `lib/placeSearch` | `placeModuleAvailable()` (module present: the map can draw) vs `placeSearchAvailable()` (module **and** iOS 18: tagging). `FoundPlace.appleId` is required. `ResolvedPlace`, `resolvePlace`, `cachedPlace`, `rememberFound`, `isPlaceId`. |
| `lib/places` | `PlaceRef = { appleId, label }`. `cleanLabel`, `labelProblem`, `PLACE_LABEL_MAX` (60). `setPhotoPlaceRemote(post, path, PlaceRef | null)` → `'ok' | 'refused' | 'objectionable' | 'failed'`. `fetchDrinkPlaces`, `fetchPlacePage(appleId)`. Gone: `savePlace`, `fetchPlace`, `sortNearest`, the `Place` type. `appleMapsUrl` takes a `ResolvedPlace`. `placeHref(appleId)`. |
| Posting | `createPost` / `addPost` take a `PlaceRef` and write both columns on the photo insert; a refusal of the place (detail `'place'`, a `post_photos_place*` check, PGRST204 naming a place column) posts the photo without it (`'unplaced'`). |
| "Tag this place" (3.2) | Apple's map, Apple's name and "Category · address", then **Name on your post** (a `Field`, 60 max, prefilled, errors "Give the place a name." / `OBJECTIONABLE_MESSAGE`), **Tag this place**, **Back to search**. Nothing is written by the sheet: `onPick({ appleId, label })`. Bias without a fix: `usePlaces().lastSpot` (memory only); the feed's own-post fallback is gone. Suggestions stay name + Apple's short secondary line. |
| iOS below 18 | No Add place anywhere (`placeSearchAvailable()` false). Others' tags still show as their label; the place page shows the label, counts and drinks, with no map, no address and no Maps key. |
| Place page (3.4) | Route `/place/<Place ID>` (case kept; `isPlaceId`). Title = newest label. Count line. When Apple answers: the map, then **Apple's line under it** (Apple's own name when it differs from the label, the kind, the address), then **Open in Apple Maps**, and the footer "Place details from Apple Maps". While Apple is asked, the map's room is held in `bgSunk`, so the grid never jumps. No visible tags → "Place unavailable". |
| Drink page (3.5) | Server order only: places with someone you follow first, then most recent. **No distance sort, and it never asks for or reads location.** Rows: the label over "3 people", "Someone you follow" or "3 people, including someone you follow". |
| Post card (3.3) | "at {label}"; Remove place unchanged; a refused label on Add place says `OBJECTIONABLE_MESSAGE`. |
| `app.json` | The purpose string drops the drink-page sorting: "Only if you allow it, Sipply uses your location to suggest bars and restaurants near you when you tag a place on a post. Your location goes only to Apple Maps for that search. It is never sent to Sipply or saved." The manifest entry is unchanged. |
| App Privacy (4.3) | **Unchanged: Precise Location, linked, App Functionality, no tracking.** The licence decides what Sipply may keep of Apple's data, not how precisely a tag locates the person: the Place ID names one venue and resolves to its exact position, and the tag says the person was there. The "Coarse" alternative is gone (a Place ID cannot be rounded). The label is user content inside that row, not a new type. The new-place meter row text is gone from Other Usage Data. |
| Docs | `privacy.md` (what is stored, live lookups, no meter, deletion), `appstore.md` (review paragraph 522 with "on iOS 18 or later", recounts 4,004 → 3,831 with the Friends cut; the licence bullets; App Privacy reasoning), `support.md` (Name on your post, iOS 18, rename = remove and add; the limit section gone), `testflight.md` (What to Test 3,843, 3,966 with the sign-in item; checklist), `terms.md` and `data-deletion.md` (no meter, places go with the photos). |

**Remaining licence risk, accepted (27 Oct 2026, from the licence review).** A label the poster leaves unedited repeats Apple's name word for word, and it is kept alongside a Place ID. That keeps §0.4 (b)'s point true here: a stored name "is still Map Data, so it is a narrower risk, not none". Sipply treats the label as the poster's own words because the poster confirms or edits it in a captioned field (like a caption, filtered, theirs to change or remove), and nothing else of Apple's record (address, area, category, position) is kept. The only complete cures are Apple's written permission (§2.5's "Unless otherwise expressly permitted in writing by Apple") or a field that starts empty; the empty field was not taken, because most posters would then type a worse name for the same venue, or none.

**The "Show places near me" list, accepted (27 Oct 2026).** §2.4 says Map Data is not surfaced "without displaying the corresponding Apple map". The near-me list shows Apple's venue names with "Bar · 350 ft" (the distance worked out on the phone from Apple's coordinates) and no map, as the as-you-type list shows names with Apple's secondary line and no map. Both are search results the person picks from, nothing is kept or committed from them, and the next step (Tag this place) draws Apple's map with its logo and Legal link before anything is tagged. Drawing a second map of the near-me results was not done: it is one more thing at rest in a sheet that is meant to hold little (house rule), and a multi-pin map needs native work this round could not check on a phone. If Jan wants the strict reading met, the smaller change is to show only names there (drop the " · 350 ft"), or to add a small `PlaceMap` of the results above the list.

**Trade-offs accepted.** A label can say something Apple's record does not: the filter, the report reason, the place page's Apple line beside the map and the moderation SQL in 026's header are the rails. Labels differ between posters; a place's name on its page and the drink page is the newest visible one. A place Apple drops (its id stops resolving) still has its label and drinks, without a map. Grouping is by the stored id; if Apple ever re-issues a place's id, older and newer tags stay as two places until a later round maps `alternateIdentifiers`.

**Fixes from the final reviews (27 Oct 2026).**
- `set_photo_place` now drops the invisible marks, collapses whitespace runs and only then trims (it trimmed first, so a label starting with a tab or newline reached the table check as a leading space and failed with 23514 instead of `place_invalid`). `cleanLabel` in `lib/places` drops the same set first, so the phone, the function and the table check agree. Both in 026 and `schema.sql`.
- `openInAppleMaps` holds its `MKMapItemRequest` in `idRequests` until it answers, as `resolvePlace` does, so "Open in Apple Maps" cannot silently do nothing if MapKit lets an unowned request go.
- "Name on your post" has autocorrect off, so a venue's real name is not "fixed" while the poster edits it.
- Deletion wording in `privacy.md` and `data-deletion.md` now names the one exception (a report's copy keeps the Place ID and label); `appstore.md`'s licence bullet no longer says "no Map Data" is kept.

---

## 1. Native: the local module `modules/place-search` (Package N)

### 1.1 How SDK 57 finds it (checked in `node_modules`)

- `expo-modules-autolinking` (`build/commands/autolinkingOptions.js`) uses `./modules` as `nativeModulesDir` by default, and `build/dependencies/scanning.js` accepts a directory there **without a `package.json`** (it mocks the name from the folder). So the module is `modules/place-search/` with no `package.json` and no `package.json` change.
- `expo prebuild` (run by `scripts/build-ios.sh archive`) writes the pod into the generated `ios/`. Nothing in `ios/` is committed or edited by hand.
- `runtimeVersion` uses the `fingerprint` policy, so this native addition starts a new runtime. EAS Updates published for it reach only builds that contain the module. Builds up to 32 never call it, and `requireOptionalNativeModule` keeps the JS safe either way.
- It is compiled from source with the app, not shipped prebuilt, so it cannot drift from `ExpoModulesCore` the way build 10's prebuilt modules did. It still runs through `scripts/check-native-links.sh` on the archive like every native change.
- `create-expo-module --local` would scaffold Android, a view and a web stub too. **Write the files below by hand instead.** They are the iOS half of that template, matched to the shape of the installed `expo-apple-authentication` and `expo-haptics` (same podspec keys, `swift_version '5.9'`, `static_framework`, `DEFINES_MODULE`, whole-module compilation).

### 1.2 Files

| File | Content |
|---|---|
| `modules/place-search/expo-module.config.json` | `{ "platforms": ["apple"], "apple": { "modules": ["PlaceSearchModule"] } }` |
| `modules/place-search/ios/PlaceSearch.podspec` | 1.3 |
| `modules/place-search/ios/PlaceSearchEngine.swift` | All of MapKit and CoreLocation, with **no `ExpoModulesCore` import**, so it typechecks on its own (6.1). See 1.5. |
| `modules/place-search/ios/PlaceSearchModule.swift` | The thin Expo glue (1.4), plus `View(PlaceMapView.self)` (1.8) |
| `modules/place-search/ios/PlaceMapView.swift` | The still Apple map (1.8, added 26 Oct) |
| `src/components/places/PlaceMap.tsx` | Its JS face: `requireNativeView('PlaceSearch')`, `PlaceMap`, `placeMapAvailable()` (1.8) |
| `src/lib/placeSearch.ts` | The typed JS wrapper (1.7) |

### 1.3 `PlaceSearch.podspec`

```ruby
Pod::Spec.new do |s|
  s.name           = 'PlaceSearch'
  s.version        = '1.0.0'
  s.summary        = 'Sipply: venue search with MapKit, and an optional coarse location fix'
  s.description    = s.summary
  s.license        = 'UNLICENSED'
  s.author         = 'The Idealize'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MapKit', 'CoreLocation'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
```

**Why Swift 5.9 and not ExpoModulesCore's 6.0.** The installed `expo-haptics` and `expo-apple-authentication` both compile in 5.9 mode beside a 6.0 core. In Swift 6 mode, the delegate callbacks of `MKLocalSearchCompleter` and `CLLocationManager` need explicit actor isolation, and any mistake there is a compile error that only the 35-minute archive would reveal. In 5.9 mode it is a warning. Every call in this module runs on the main queue anyway (1.4).

### 1.4 `PlaceSearchModule.swift` (the glue)

```swift
import CoreLocation
import ExpoModulesCore
import MapKit

struct LatLngRecord: Record {
  @Field var lat: Double = 0
  @Field var lng: Double = 0
}

struct MapsTargetRecord: Record {
  @Field var appleId: String? = nil
  @Field var name: String = ""
  @Field var lat: Double = 0
  @Field var lng: Double = 0
}

private func coordinate(_ r: LatLngRecord) -> CLLocationCoordinate2D {
  CLLocationCoordinate2D(latitude: r.lat, longitude: r.lng)
}

public final class PlaceSearchModule: Module {
  /*
   * Made on first use, on the main queue: every function below runs there
   * (`.runOnQueue(.main)`), so the completer and the location manager are
   * created on the main run loop, which is where their delegates call back.
   */
  private var engine: PlaceSearchEngine?

  private func core() -> PlaceSearchEngine {
    if let engine { return engine }
    let made = PlaceSearchEngine()
    engine = made
    return made
  }

  /* One way to settle a promise from the engine's Result, so every code reaches JS the same way. */
  private func settle(_ promise: Promise) -> PlaceReply {
    return { result in
      switch result {
      case .success(let value):
        promise.resolve(value)
      case .failure(let failure):
        promise.reject(Exception(name: "PlaceSearchError", description: failure.message, code: failure.code))
      }
    }
  }

  public func definition() -> ModuleDefinition {
    Name("PlaceSearch")

    AsyncFunction("suggest") { (query: String, bias: LatLngRecord?, promise: Promise) in
      self.core().suggest(query, bias: bias.map(coordinate), reply: self.settle(promise))
    }.runOnQueue(.main)

    AsyncFunction("resolve") { (id: String, promise: Promise) in
      self.core().resolve(id, reply: self.settle(promise))
    }.runOnQueue(.main)

    AsyncFunction("search") { (query: String, bias: LatLngRecord?, promise: Promise) in
      self.core().search(query, bias: bias.map(coordinate), reply: self.settle(promise))
    }.runOnQueue(.main)

    AsyncFunction("nearby") { (center: LatLngRecord, promise: Promise) in
      self.core().nearby(coordinate(center), reply: self.settle(promise))
    }.runOnQueue(.main)

    AsyncFunction("cancel") {
      self.engine?.cancelAll()
    }.runOnQueue(.main)

    AsyncFunction("locationState") { (promise: Promise) in
      promise.resolve(self.core().locationState())
    }.runOnQueue(.main)

    AsyncFunction("requestLocation") { (promise: Promise) in
      self.core().requestLocation(reply: self.settle(promise))
    }.runOnQueue(.main)

    AsyncFunction("currentCoordinate") { (promise: Promise) in
      self.core().currentCoordinate(reply: self.settle(promise))
    }.runOnQueue(.main)

    AsyncFunction("openInAppleMaps") { (target: MapsTargetRecord, promise: Promise) in
      self.core().openInAppleMaps(
        appleId: target.appleId, name: target.name,
        at: CLLocationCoordinate2D(latitude: target.lat, longitude: target.lng),
        reply: self.settle(promise))
    }.runOnQueue(.main)

    Function("formatDistance") { (meters: Double) -> String in
      formatDistance(meters)
    }

    OnAppEntersBackground {
      DispatchQueue.main.async { self.engine?.dropFix() }
    }
  }
}
```

Checked against the installed core (`node_modules/expo-modules-core/ios`):
- `Record` and `@Field` are in `Core/Records/`.
- `Promise.resolve(_ value: Any?)` is in `Core/Promise.swift`. The generic `resolve<T: AnyArgument>` does not match `Any`, so passing `Any` is unambiguous.
- `Exception(name:description:code:)` is in `Core/Exceptions/Exception.swift:39`.
- `runOnQueue(_:)` is in `Core/Functions/AsyncFunctionDefinition.swift:207`.
- `OnAppEntersBackground` is in `Api/Factories/EventListenersFactories.swift:39`.
- `AsyncFunction` with a trailing `Promise` argument is the form `expo-apple-authentication` uses.

### 1.5 `PlaceSearchEngine.swift` (binding behaviour; this is the reference implementation)

N writes this file to compile, and 6.1 typechecks it. The behaviour is binding. The exact syntax is N's, as long as it still passes 6.1.

**Proven on 25 Oct 2026.** This exact block, copied out of this file, typechecks with **no errors and no warnings** (`-warnings-as-errors`) using `xcrun --sdk iphoneos swiftc -typecheck -swift-version 5`. It was checked at both `-target arm64-apple-ios16.4` and `-target arm64-apple-ios26.0`, against Xcode 27.1's iPhoneOS27.1 SDK. If N changes it, N re-runs both.

```swift
import CoreLocation
import Foundation
import MapKit

/// A failure the glue turns into a coded JS error (src/lib/placeSearch.ts maps the codes).
struct PlaceFailure: Error {
  let code: String
  let message: String
}

typealias PlaceReply = (Result<Any, PlaceFailure>) -> Void

/*
 * The venues a tag may name: our key for each of Apple's categories. Mirrors
 * VENUE_CATEGORIES in src/lib/placeSearch.ts and places_category_known in
 * migration 026; a comment in each names the other two. Markets, stores,
 * stadiums and theatres are left out on purpose (specs/v4.8-places P3).
 */
func venueTable() -> [MKPointOfInterestCategory: String] {
  var table: [MKPointOfInterestCategory: String] = [
    .nightlife: "nightlife", .brewery: "brewery", .winery: "winery",
    .restaurant: "restaurant", .cafe: "cafe", .hotel: "hotel",
  ]
  if #available(iOS 18.0, *) {
    table[.distillery] = "distillery"
    table[.musicVenue] = "musicVenue"
  }
  return table
}

func venueFilter() -> MKPointOfInterestFilter {
  MKPointOfInterestFilter(including: Array(venueTable().keys))
}

/// "350 ft" in the US and Puerto Rico, "120 m" elsewhere: the locale decides.
func formatDistance(_ meters: Double) -> String {
  let formatter = MKDistanceFormatter()
  formatter.unitStyle = .abbreviated
  return formatter.string(fromDistance: max(0, meters))
}

/*
 * Error domains compared by their string values, so nothing here depends on
 * how the SDK spells the constants in Swift. MKErrorDomain codes (MKTypes.h):
 * 2 serverFailure, 3 loadingThrottled, 4 placemarkNotFound. GEOErrorDomain -3
 * is the throttle MKLocalSearch reports in practice (specs/07 §15).
 */
private func isNoResults(_ error: Error) -> Bool {
  let e = error as NSError
  return e.domain == "MKErrorDomain" && e.code == 4
}

private func failure(_ error: Error) -> PlaceFailure {
  let e = error as NSError
  if (e.domain == "MKErrorDomain" && e.code == 3) || (e.domain == "GEOErrorDomain" && e.code == -3) {
    return PlaceFailure(code: "ERR_PLACES_THROTTLED", message: "Too many searches")
  }
  if (e.domain == "MKErrorDomain" && e.code == 2) || e.domain == NSURLErrorDomain {
    return PlaceFailure(code: "ERR_PLACES_OFFLINE", message: "Could not reach Apple Maps")
  }
  return PlaceFailure(code: "ERR_PLACES_FAILED", message: e.localizedDescription)
}

private let cancelled = PlaceFailure(code: "ERR_PLACES_CANCELLED", message: "Superseded by a newer search")

final class PlaceSearchEngine: NSObject, MKLocalSearchCompleterDelegate, CLLocationManagerDelegate {

  // ---- Suggestions ------------------------------------------------------

  private let completer = MKLocalSearchCompleter()
  private var suggestReply: PlaceReply?
  private var suggestTicket = 0
  /* The last two sets handed to JS, by token, so a tap on a row from the set before still resolves. */
  private var completions: [String: MKLocalSearchCompletion] = [:]
  private var previousCompletions: [String: MKLocalSearchCompletion] = [:]
  private var setNumber = 0

  // ---- One MKLocalSearch at a time (resolve, search, nearby) -------------

  private var activeSearch: MKLocalSearch?
  private var searchReply: PlaceReply?

  // ---- Location ---------------------------------------------------------

  private lazy var manager: CLLocationManager = {
    let m = CLLocationManager()
    m.desiredAccuracy = kCLLocationAccuracyHundredMeters
    m.delegate = self
    return m
  }()
  private var permissionReplies: [PlaceReply] = []
  private var fixReplies: [PlaceReply] = []
  private var fixTicket = 0
  /* Held in memory only, for at most 120 s, and dropped when the app backgrounds. Never written anywhere. */
  private var fix: CLLocation?
  private var fixAt: Date?

  override init() {
    super.init()
    completer.delegate = self
    completer.resultTypes = .pointOfInterest
    completer.pointOfInterestFilter = venueFilter()
  }

  // MARK: suggest

  func suggest(_ query: String, bias: CLLocationCoordinate2D?, reply: @escaping PlaceReply) {
    // A newer keystroke supersedes the one still waiting.
    suggestReply?(.failure(cancelled))
    suggestReply = nil
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard q.count >= 2 else {
      completer.cancel()
      reply(.success([[String: Any]]()))
      return
    }
    if let bias {
      completer.region = MKCoordinateRegion(center: bias, latitudinalMeters: 30_000, longitudinalMeters: 30_000)
    }
    suggestTicket += 1
    let ticket = suggestTicket
    suggestReply = reply
    // The same fragment again sends no delegate callback, so answer from what is held.
    if q == completer.queryFragment && !completer.isSearching {
      deliverSuggestions()
      return
    }
    completer.queryFragment = q
    // A completer that never calls back must not leave JS waiting forever.
    DispatchQueue.main.asyncAfter(deadline: .now() + 6) { [weak self] in
      guard let self, self.suggestTicket == ticket, self.suggestReply != nil else { return }
      self.deliverSuggestions()
    }
  }

  private func deliverSuggestions() {
    guard let reply = suggestReply else { return }
    suggestReply = nil
    setNumber += 1
    previousCompletions = completions
    completions = [:]
    var rows: [[String: Any]] = []
    for (i, c) in completer.results.prefix(8).enumerated() {
      let id = "\(setNumber).\(i)"
      completions[id] = c
      rows.append(["id": id, "title": c.title, "subtitle": c.subtitle])
    }
    reply(.success(rows))
  }

  func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
    deliverSuggestions()
  }

  func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {
    guard let reply = suggestReply else { return }
    suggestReply = nil
    reply(isNoResults(error) ? .success([[String: Any]]()) : .failure(failure(error)))
  }

  // MARK: resolve / search / nearby

  func resolve(_ id: String, reply: @escaping PlaceReply) {
    guard let completion = completions[id] ?? previousCompletions[id] else {
      reply(.failure(PlaceFailure(code: "ERR_PLACES_STALE", message: "That suggestion is no longer listed")))
      return
    }
    let request = MKLocalSearch.Request(completion: completion)
    request.resultTypes = .pointOfInterest
    request.pointOfInterestFilter = venueFilter()
    // The first item that is a venue, or null: the suggestion led somewhere that cannot be tagged.
    run(MKLocalSearch(request: request), reply: reply) { items in
      items.lazy.compactMap(placeRow).first.map { $0 as Any } ?? NSNull()
    }
  }

  func search(_ query: String, bias: CLLocationCoordinate2D?, reply: @escaping PlaceReply) {
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard q.count >= 2 else {
      reply(.success([[String: Any]]()))
      return
    }
    let request = MKLocalSearch.Request()
    request.naturalLanguageQuery = q
    request.resultTypes = .pointOfInterest
    request.pointOfInterestFilter = venueFilter()
    if let bias {
      request.region = MKCoordinateRegion(center: bias, latitudinalMeters: 30_000, longitudinalMeters: 30_000)
    }
    run(MKLocalSearch(request: request), reply: reply) { items in
      Array(items.compactMap(placeRow).prefix(15))
    }
  }

  func nearby(_ center: CLLocationCoordinate2D, reply: @escaping PlaceReply) {
    let request = MKLocalPointsOfInterestRequest(center: center, radius: 800)
    request.pointOfInterestFilter = venueFilter()
    let here = CLLocation(latitude: center.latitude, longitude: center.longitude)
    run(MKLocalSearch(request: request), reply: reply) { items in
      let rows = items.compactMap(placeRow)
      func metres(_ row: [String: Any]) -> Double {
        let lat = row["lat"] as? Double ?? 0
        let lng = row["lng"] as? Double ?? 0
        return here.distance(from: CLLocation(latitude: lat, longitude: lng))
      }
      return Array(rows.sorted { metres($0) < metres($1) }.prefix(20))
    }
  }

  func cancelAll() {
    completer.cancel()
    suggestReply?(.failure(cancelled))
    suggestReply = nil
    activeSearch?.cancel()
    activeSearch = nil
    searchReply?(.failure(cancelled))
    searchReply = nil
  }

  /*
   * One MKLocalSearch in flight: a new one cancels the last and settles its
   * reply as cancelled. The identity check keeps a late callback from the
   * cancelled search from settling the new reply. MKLocalSearch is throttled
   * per device (about 50 a minute, observed), and the sheet sends one per tap.
   */
  private func run(_ s: MKLocalSearch, reply: @escaping PlaceReply, shape: @escaping ([MKMapItem]) -> Any) {
    activeSearch?.cancel()
    searchReply?(.failure(cancelled))
    activeSearch = s
    searchReply = reply
    s.start { [weak self] response, error in
      guard let self, self.activeSearch === s, let reply = self.searchReply else { return }
      self.activeSearch = nil
      self.searchReply = nil
      if let error {
        reply(isNoResults(error) ? .success(shape([])) : .failure(failure(error)))
        return
      }
      reply(.success(shape(response?.mapItems ?? [])))
    }
  }

  // MARK: location

  func locationState() -> [String: Any] {
    let m = manager
    let permission: String
    switch m.authorizationStatus {
    case .notDetermined: permission = "undetermined"
    case .restricted: permission = "restricted"
    case .denied: permission = "denied"
    case .authorizedWhenInUse, .authorizedAlways: permission = "granted"
    @unknown default: permission = "denied"
    }
    return ["permission": permission, "precise": m.accuracyAuthorization == .fullAccuracy]
  }

  /* When In Use only. There is no Always request anywhere in the app (6.1 greps for it). */
  func requestLocation(reply: @escaping PlaceReply) {
    guard manager.authorizationStatus == .notDetermined else {
      reply(.success(locationState()))
      return
    }
    permissionReplies.append(reply)
    if permissionReplies.count == 1 {
      manager.requestWhenInUseAuthorization()
    }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    // Also called once as the manager is made, while still undetermined: wait for the answer.
    guard manager.authorizationStatus != .notDetermined else { return }
    let state = locationState()
    let replies = permissionReplies
    permissionReplies = []
    replies.forEach { $0(.success(state)) }
  }

  /* A coarse fix, only when already allowed. Never prompts. Null on any failure: a fix is a nicety. */
  func currentCoordinate(reply: @escaping PlaceReply) {
    let status = manager.authorizationStatus
    guard status == .authorizedWhenInUse || status == .authorizedAlways else {
      reply(.success(NSNull()))
      return
    }
    if let fix, let fixAt, Date().timeIntervalSince(fixAt) < 120 {
      reply(.success(row(fix)))
      return
    }
    fixReplies.append(reply)
    guard fixReplies.count == 1 else { return }
    fixTicket += 1
    let ticket = fixTicket
    manager.requestLocation()
    DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in
      guard let self, self.fixTicket == ticket else { return }
      self.settleFix(nil)
    }
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let last = locations.last else { return }
    fix = last
    fixAt = Date()
    settleFix(last)
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    settleFix(nil)
  }

  private func settleFix(_ location: CLLocation?) {
    fixTicket += 1
    let replies = fixReplies
    fixReplies = []
    let value: Any = location.map(row) ?? NSNull()
    replies.forEach { $0(.success(value)) }
  }

  private func row(_ l: CLLocation) -> [String: Any] {
    ["lat": l.coordinate.latitude, "lng": l.coordinate.longitude, "accuracy": l.horizontalAccuracy]
  }

  func dropFix() {
    fix = nil
    fixAt = nil
  }

  // MARK: Open in Apple Maps

  func openInAppleMaps(appleId: String?, name: String, at coordinate: CLLocationCoordinate2D, reply: @escaping PlaceReply) {
    let byCoordinate = {
      let item: MKMapItem
      if #available(iOS 26.0, *) {
        item = MKMapItem(location: CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude), address: nil)
      } else {
        item = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
      }
      item.name = name
      let opened = item.openInMaps(launchOptions: nil)
      reply(.success(opened))
    }
    if #available(iOS 18.0, *), let raw = appleId, let identifier = MKMapItem.Identifier(rawValue: raw) {
      // Apple's own record of the place, so Maps shows the venue's card, not a dropped pin.
      MKMapItemRequest(mapItemIdentifier: identifier).getMapItem { item, _ in
        guard let item else {
          byCoordinate()
          return
        }
        let opened = item.openInMaps(launchOptions: nil)
        reply(.success(opened))
      }
      return
    }
    byCoordinate()
  }
}

// MARK: Map item → the row JS receives (FoundPlace in src/lib/placeSearch.ts)

private func placeRow(_ item: MKMapItem) -> [String: Any]? {
  // A backstop: the filter already asked for venues only.
  guard let category = item.pointOfInterestCategory, let kind = venueTable()[category] else { return nil }
  let name = (item.name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
  guard !name.isEmpty else { return nil }

  let coordinate: CLLocationCoordinate2D
  var address: String?
  var locality: String?
  var country: String?
  if #available(iOS 26.0, *) {
    coordinate = item.location.coordinate
    address = item.addressRepresentations?.fullAddress(includingRegion: false, singleLine: true) ?? item.address?.shortAddress
    locality = item.addressRepresentations?.cityName
    country = item.addressRepresentations?.region?.identifier
  } else {
    let p = item.placemark
    coordinate = p.coordinate
    let street = [p.subThoroughfare, p.thoroughfare].compactMap { $0 }.joined(separator: " ")
    let parts = [street, p.subLocality ?? "", p.locality ?? ""].filter { !$0.isEmpty }
    address = parts.isEmpty ? nil : parts.joined(separator: ", ")
    locality = p.locality ?? p.subLocality
    country = p.isoCountryCode
  }
  guard CLLocationCoordinate2DIsValid(coordinate), !(coordinate.latitude == 0 && coordinate.longitude == 0) else {
    return nil
  }

  var appleId: Any = NSNull()
  if #available(iOS 18.0, *), let identifier = item.identifier {
    appleId = identifier.rawValue
  }
  return [
    "appleId": appleId,
    "name": String(name.prefix(120)),
    "address": address.map { String($0.prefix(300)) } ?? NSNull(),
    "locality": locality.map { String($0.prefix(120)) } ?? NSNull(),
    "country": country ?? NSNull(),
    "lat": coordinate.latitude,
    "lng": coordinate.longitude,
    "category": kind,
  ]
}
```

Rules the engine keeps (6.1 checks them):
- The device fix is held only in `fix` and `fixAt`, for at most 120 s, and dropped on background. It is never written to disk, `UserDefaults`, a log or a print. It reaches JS only through `currentCoordinate`, and JS sends it nowhere (1.7, 2.6).
- No `requestAlwaysAuthorization`, no `allowsBackgroundLocationUpdates`, no `startUpdatingLocation`. Only one-shot `requestLocation()`.
- No `print` or `NSLog` anywhere in the module. A query or a coordinate in a device log is still a leak.
- Only `MapKit`, `CoreLocation` and `Foundation` are imported in the engine.

### 1.6 `app.json` (Package N)

1. Under `expo.ios`, add the one location key (there is no `infoPlist` block yet):

   ```json
   "infoPlist": {
     "NSLocationWhenInUseUsageDescription": "Only if you allow it, Sipply uses your location to suggest bars and restaurants near you when you tag a place on a post. Your location goes only to Apple Maps for that search. It is never sent to Sipply or saved."
   }
   ```

   It is the **only** location key. There is no `NSLocationAlways*`, no `UIBackgroundModes` `location`, and no `NSLocationTemporaryUsageDescriptionDictionary`: someone with Precise Location off searches by name (3.2) and is never asked to upgrade.
2. In `expo.ios.privacyManifests.NSPrivacyCollectedDataTypes`, append the entry Part 4.3 recommends. With Jan's default answer it is:

   ```json
   {
     "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypePreciseLocation",
     "NSPrivacyCollectedDataTypeLinked": true,
     "NSPrivacyCollectedDataTypeTracking": false,
     "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"]
   }
   ```

   (Revised 26 Oct, 0.5: the string no longer mentions sorting a drink's places, which went with the coordinates; there is no Coarse alternative any more.) MapKit and CoreLocation are not required-reason APIs, so `NSPrivacyAccessedAPITypes` does not change.
3. Nothing else changes: no plugin entry (a local module needs none) and no `buildNumber` (that comes with the archive, outside this round).

### 1.8 `PlaceMapView.swift` and `PlaceMap.tsx` (added at final integration, 0.4)

- An `ExpoView` (Fabric) holding an `MKMapView`: `MKStandardMapConfiguration(emphasisStyle: .muted)` with `pointOfInterestFilter = .excludingAll`, `overrideUserInterfaceStyle = .light`, scroll, zoom, rotate and pitch off, no compass, no scale, `showsUserLocation = false`. One `MKMarkerAnnotationView`: `markerTintColor` ink `#0A0A0A`, white glyph, title hidden (spoken only), not selectable. Never the system red: rule 17 cannot see native colours, so this file keeps the one red to its listed places by hand.
- Props `lat`, `lng`, `name`; `OnViewDidUpdateProps` sets the region once (600 m across), and `layoutSubviews` sets it again when the size changes, since MapKit fits a region to the view's shape.
- It is the module's first `View`, so it is the default view: JS reaches it as `requireNativeView('PlaceSearch')`, resolved only when `placeSearchAvailable()`.
- `PlaceMap` holds it at 200 x 160 or more (Apple's logo and Legal link must stay visible, §2.1), with a hair edge on a wrapper so the map's corners are never covered. Without the module it draws nothing.
- Checked like the rest of the module: engine, glue and view typecheck together against the real prebuilt `ExpoModulesCore` 57.0.21 at iOS 16.4, 18.0 and 26.0 with warnings as errors, compile to objects at 16.4 and 26.0, and every one of the 94 `ExpoModulesCore` symbols they need is exported by that binary.

### 1.7 `src/lib/placeSearch.ts` (Package N; what U and S import)

**Revised 26 Oct (0.5).** `FoundPlace.appleId` is `string`, required: a row without a Place ID is dropped. `placeSearchAvailable()` now means the module **and** iOS 18 (native `placeIdsAvailable()`), and `placeModuleAvailable()` is the module alone (the map). New: `ResolvedPlace { appleId, name, address, locality, lat, lng, category | null }`, `resolvePlace(appleId)` (native `resolvePlace`, shared per id, answers kept in memory: 100 places, 30 minutes; failures throw `PlaceSearchError` and are not kept), `cachedPlace(appleId)`, `rememberFound(found)`, `isPlaceId(s)`. Nothing else in the block below changed.

```ts
import { requireOptionalNativeModule } from 'expo'; // re-exported by expo (build/Expo.d.ts), checked in 57.0.27
import { Platform } from 'react-native';

/** Mirrors venueTable() in PlaceSearchEngine.swift and places_category_known in migration 026. */
export const VENUE_CATEGORIES = [
  'nightlife', 'brewery', 'winery', 'distillery', 'restaurant', 'cafe', 'hotel', 'musicVenue',
] as const;
export type PlaceCategory = (typeof VENUE_CATEGORIES)[number];

export interface LatLng { lat: number; lng: number }

/** A row of as-you-type suggestions. `id` is a native token, valid for the last two sets only. */
export interface PlaceSuggestion { id: string; title: string; subtitle: string }

/** A venue as Apple Maps describes it: what savePlace (lib/places) sends to upsert_place. */
export interface FoundPlace {
  appleId: string | null;        // MKMapItem.identifier on iOS 18+, else null
  name: string;
  address: string | null;        // one line, without the country
  locality: string | null;
  country: string | null;        // ISO 3166-1 alpha-2, "PR"
  lat: number;
  lng: number;
  category: PlaceCategory;
}

export type LocationPermission = 'unavailable' | 'undetermined' | 'denied' | 'restricted' | 'granted';
export interface LocationState { permission: LocationPermission; precise: boolean }

export type PlaceSearchErrorCode = 'offline' | 'throttled' | 'stale' | 'failed' | 'unavailable';
export class PlaceSearchError extends Error {
  constructor(public readonly code: PlaceSearchErrorCode, message?: string) { super(message ?? code); }
}

/** True on an iOS build that contains the module (build 33 on). False everywhere else: tagging hides. */
export function placeSearchAvailable(): boolean;

/**
 * As-you-type suggestions, venues only, at most 8. Waits 150 ms after the last
 * call before asking (the debounce lives here, so every caller gets it).
 * null = superseded by a newer call: drop it. [] under 2 characters.
 */
export function suggest(query: string, bias?: LatLng | null): Promise<PlaceSuggestion[] | null>;

/** A suggestion to a venue. 'not_taggable' = it led to something outside VENUE_CATEGORIES. null = superseded. */
export function resolve(s: PlaceSuggestion): Promise<FoundPlace | 'not_taggable' | null>;

/** The return key's search, at most 15. null = superseded. */
export function search(query: string, bias?: LatLng | null): Promise<FoundPlace[] | null>;

/** Venues within 800 m of `center`, nearest first, at most 20. null = superseded. */
export function nearby(center: LatLng): Promise<FoundPlace[] | null>;

/** Cancels anything in flight (the sheet's close). */
export function cancelPlaceSearch(): void;

/** 'unavailable' when the module is missing. Never prompts. */
export function locationState(): Promise<LocationState>;

/** Shows the system prompt only while 'undetermined'; otherwise answers at once. */
export function requestLocation(): Promise<LocationState>;

/** A coarse fix (about 100 m), only when already granted; null otherwise. Never prompts. NEVER send it anywhere. */
export function currentCoordinate(): Promise<LatLng | null>;

/** Native Apple Maps: Apple's own card by id on iOS 18+, else a pin with the name. False if Maps did not open. */
export function openInAppleMaps(p: { appleId: string | null; name: string; lat: number; lng: number }): Promise<boolean>;

/** "350 ft" / "1.2 km" in the phone's units (MKDistanceFormatter); a plain km/m fallback without the module. */
export function formatDistance(meters: number): string;
```

How the wrapper behaves:
- `const native = Platform.OS === 'ios' ? requireOptionalNativeModule<NativeShape>('PlaceSearch') : null;`. Every function checks `native` first. Without it they answer `null`, `[]`, `'unavailable'` or `false`, and `formatDistance` falls back to `m < 1000 ? `${round(m, 10)} m` : `${(m / 1000).toFixed(1)} km``. Nothing throws because the module is absent.
- Native rejections are mapped by `code`:
  - `ERR_PLACES_CANCELLED` becomes `null` (superseded, which is not an error);
  - `ERR_PLACES_THROTTLED` throws `PlaceSearchError('throttled')`;
  - `ERR_PLACES_OFFLINE` throws `'offline'`;
  - `ERR_PLACES_STALE` throws `'stale'`;
  - anything else throws `'failed'`.
- `resolve` maps a `null` row to `'not_taggable'`. On `'stale'`, it retries once as `search(`${s.title} ${s.subtitle}`)` and takes the first row whose name matches the title after case and accent folding. Only if that finds nothing does it rethrow.
- Rows are **checked, not trusted**, in the same pattern as `lib/friendsBoard`:
  - a row without a string `name` or finite `lat`/`lng`, or with a `category` outside `VENUE_CATEGORIES`, is dropped;
  - strings are trimmed;
  - `appleId` must match `^[A-Za-z0-9._:-]{1,100}$`, else null;
  - `country` must match `^[A-Z]{2}$`, else null.
- The debounce is 150 ms, with a generation counter: a call that a newer one overtakes resolves `null` without reaching native.
- `locationState()` calls native each time (permissions change in Settings while the app runs) and returns `{ permission: 'unavailable', precise: false }` without the module.

---

## 2. Data: migration 026, the client data layer (Package S)

### 2.1 Shape

**As reworked 26 Oct (0.5).**

- `post_photos.apple_place_id` and `post_photos.place_label`: where that photo was had, as Apple's Place ID and the poster's label, both or neither. Written by the photo's insert (Save & post) or by `set_photo_place` on your own photo. There is no places table and no meter.
- RPCs:
  - `set_photo_place(post, path, apple_place_id, label)`: adds, changes or (both null) removes the place on your own photo;
  - `drink_places(drink)`: where people have had a drink, per Place ID;
  - `place_drinks(apple_place_id)`: what people have had at a place.
- The label's caption filter: `reject_objectionable_place`, a trigger.
- Reports: the reason `wrong_place`, and the post's places (Place ID, label, `photo_taken_at`) in the evidence snapshot.

### 2.2 `supabase/migrations/026_places.sql` (S writes it exactly; Jan applies it by hand)

**Revised 26 Oct (0.5): the file itself is now the contract.** The first draft's SQL that stood here (a `public.places` table, `upsert_place`, the meter, the 50 m dedupe and the 30-day prune) is withdrawn by the licence decision; it was never applied. The reworked file holds, in order:

0. The stop unless 007, 009, 011 and 019 are applied (018's unaccent is no longer needed).
0b. The first draft's objects dropped if a project ever ran it: `post_photos.place_id`, `upsert_place`, the old `set_photo_place(uuid, text, uuid)` and `place_drinks(uuid)`, `drink_places(text)` (dropped every run because its result columns changed; created and granted again below), the two private helpers, `private.place_creations`, `public.places`, the old index.
1. `post_photos.apple_place_id`, `place_label`, the checks `post_photos_place_id_shape`, `post_photos_place_label_shape` and `post_photos_place_pair`; the indexes `post_photos_apple_place_idx` and `posts_drink_idx`.
2. `reject_objectionable_place()` and its trigger, `before insert or update of place_label`.
3. `set_photo_place`: definer; tidies the label (trim, runs of spaces as one); `place_invalid` for one without the other, a bad id, over 60 or control characters; updates only the caller's own photo; false when not theirs.
4. `drink_places`: per Place ID, the newest label (`array_agg … order by created_at desc`), distinct people, `followed` (`bool_or` over follows), `last_at`; blocks both ways through `private.my_block_set()`; `order by followed desc, last_at desc`; at most 100.
5. `place_drinks`: per catalogue drink at the id (custom `u_` drinks out), people, newest photo, `people_here` and the newest `label` on every row; a malformed id answers nothing; at most 120.
6. `wrong_place` in `report_reason_known`, and `report_evidence` with `places` (still never a file path).
7. Revokes and grants: the trigger function nobody's; the three RPCs to `authenticated` only.
8. The `schema_migrations` row, last.

The header carries the why (the licence), the moderation SQL by hand (clear one post's tags, or every tag naming one Place ID) and the VERIFY block (columns, the first draft's objects absent, the three checks, the trigger, definer and grants, the reason, and a rolled-back smoke test that tags, reads both lists, relabels, refuses a 61-character label and a label without an id, and removes). `supabase/schema.sql` holds the same objects in their sections (header "as of migration 026"; the columns and checks in `post_photos`; the indexes in the index block; the trigger function beside 020's; the RPCs after `friends_board`; `report_evidence` and `report_reason_known` in place; revokes, grants and the trigger in their sections; `('026_places', …)` in the bottom insert).

### 2.3 `src/lib/places.ts` (S; what U imports)

**As reworked 26 Oct (0.5).**

```ts
import type { LatLng, PlaceCategory, ResolvedPlace } from '@/lib/placeSearch';

/** types.ts: Apple's Place ID and the poster's label. Nothing of Apple's beyond the id. */
export interface PlaceRef { appleId: string; label: string }

export interface DrinkPlace { place: PlaceRef; people: number; followed: boolean; lastAt: string }
export interface PlaceDrink { drinkId: string; people: number; postId: string; photoPath: string | null; lastAt: string }
export interface PlacePage { place: PlaceRef; drinks: PlaceDrink[]; peopleHere: number }

export function placesSupported(): boolean;                       // re-exported from lib/social
export const PLACE_CATEGORY_LABEL: Record<PlaceCategory, string>; // drawn only from Apple's live answer
export const PLACE_LABEL_MAX = 60;
export function cleanLabel(raw: string): string;                  // controls → spaces, runs → one, trimmed, 60 code points
export function labelProblem(label: string): 'empty' | 'objectionable' | null;
export function toPlaceRef(id: unknown, label: unknown): PlaceRef | null;

export type SetPhotoPlaceResult = 'ok' | 'refused' | 'objectionable' | 'failed';
export function setPhotoPlaceRemote(postId: string, path: string, place: PlaceRef | null): Promise<SetPhotoPlaceResult>;
export function fetchDrinkPlaces(drinkId: string): Promise<DrinkPlace[] | null>;         // null = 026 missing
export function fetchPlacePage(appleId: string): Promise<{ place: PlaceRef | null; drinks: PlaceDrink[]; peopleHere: number } | null>;

export function distanceMeters(a: LatLng, b: LatLng): number;     // "350 ft" beside a SEARCH row only
export const placeHref: (appleId: string) => Href;                // "/place/<Place ID>"
export function appleMapsUrl(p: ResolvedPlace): string;           // from Apple's live answer
export function samePlace(a?: PlaceRef | null, b?: PlaceRef | null): boolean;
export function photoPlace(post: Post, path: string | null | undefined): PlaceRef | null;
```

- **No call carries a coordinate, either way.** The only place data any RPC receives is a Place ID and a label (`set_photo_place`, and the photo insert in `lib/social`). 6.2's grep proves it.
- `setPhotoPlaceRemote` maps errors: `isMissingPlaces` → `'failed'` and places off; `objectionable_content` → `'objectionable'`; `place_invalid` → `'refused'`; anything else, offline included → `'failed'`; `data !== true` → `'refused'`.
- `appleMapsUrl` is the long-standing `maps.apple.com/?q=&ll=` form, built from a `ResolvedPlace`, used only if `openInAppleMaps` answers false.

### 2.4 `src/store/places.ts` (S, new; zustand, the friendsBoard store's guards)

```ts
type Load<T> = { data: T; state: 'loading' | 'ready' | 'failed' | 'missing'; refreshFailed?: boolean };

interface PlacesState {
  /** Per drink, the server's rows in the server's order. */
  byDrink: Record<string, Load<DrinkPlace[]>>;
  loadDrink(drinkId: string): Promise<void>;          // numbered loads, only the newest writes; nothing signed out
  /** Per Apple Place ID, Sipply's side of the page. 'missing' = nothing visible tagged there, or 026 missing. */
  byPlace: Record<string, Load<PlacePage | null>>;
  loadPlace(appleId: string): Promise<void>;
  /** (0.5) Where the last pick was, as MapKit said: the next search's bias. Memory only, never sent. */
  lastSpot: LatLng | null;
  rememberSpot(at: LatLng): void;
  reset(): void;                                       // on useAuth's user id change, as friendsBoard
}
```

Not persisted. Loads keep what they hold while refreshing; a failure over data keeps the data and sets `refreshFailed`. Apple's side of a place page is not here: `lib/placeSearch` holds it, in memory, by Place ID.

### 2.5 Posts, posting and reports (S: `types.ts`, `lib/social.ts`, `store/social.ts`, `lib/pour.ts`, `lib/moderation.ts`, `lib/database.types.ts`)

- **Revised 26 Oct (0.5):** `PlaceRef` is `{ appleId, label }`; `fetchPostPlaces` selects `post_id, path, apple_place_id, place_label` where `apple_place_id` is not null (no embed); `createPost(…, music?, place?: PlaceRef | null)` writes both columns and retries without them on a refusal of the place (P0001 detail `'place'`, 23514 naming `post_photos_place*`, PGRST204 naming a place column); `addPost(…, tags, place?)`; `setPhotoPlace` resolves `SetPhotoPlaceResult` and no longer remembers a pick; `isMissingPlaces` reads PGRST202/42883, and 42703/PGRST204 naming `apple_place_id` or `place_label`. `database.types.ts`: `PostPhotoRow` gains the two columns, `PlaceRow`, the `places` table and `upsert_place` are gone, `DrinkPlaceRow` / `PlaceDrinkRow` / `set_photo_place` / `place_drinks` take the new shapes. The rest of this section is as first written.
- **`types.ts`.** `Post` gains:

  ```ts
  /**
   * Where each photo was had (migration 026), by photo path. undefined =
   * unknown (026 not applied, or the read failed): no place line. {} = known,
   * and no photo of this post has a place. Keyed by path, not index, so the
   * gallery's order never matters.
   */
  places?: Record<string, PlaceRef>;
  ```

  `PlaceRef` is re-exported from `lib/places`, so `types.ts` imports the type only.
- **`lib/social.ts`:**
  - `fetchPostPlaces(postIds)` follows `fetchPostTags` exactly (the same chunking, null for unknown, never throws, a session flag):

    ```ts
    supabase.from('post_photos')
      .select('post_id, path, place:places(id, name, locality, lat, lng)')
      .in('post_id', part)
      .not('place_id', 'is', null)
    ```

    It is a read of its own, never an embed in `POST_SELECT`, for 024's reason: a post read must never fail because of its places. A `42703` naming `place_id`, or a `PGRST200`, switches places off for the session. Make sure `isMissingAvatarColumn` cannot match this case (it tests `avatar_path` and must stay that narrow).
  - `toPosts` adds it as the fifth parallel read. `toPost` sets `places`.
  - `createPost(myId, drinkId, caption, localPhotoUri, music?, placeId?: string | null)` puts `place_id` on the photo insert. It then retries in order:
    1. without the song, on a music refusal, keeping the place;
    2. without the place, when a place-bearing insert fails with `23503` (the place was deleted) or `PGRST204` (the column is unknown).

    It resolves `{ withPhoto, postId, placed }`, where `placed` is true when there was no place to send or it went on.
  - `addPhotoForDrink` is unchanged: it never sends a place (P7).
  - `export { placesSupported } from '@/lib/places'` is optional. U imports it from `lib/places` either way.
- **`store/social.ts`:**
  - `PostOutcome` gains `'unplaced'`.
  - `addPost(myId, drinkId, caption, photoUri, music, tags, placeId?: string | null)` passes `placeId` through. The outcome is `!withPhoto ? 'no-photo' : !tagsSaved ? 'untagged' : !placed ? 'unplaced' : 'ok'`.
  - New: `setPhotoPlace(myId, postId, path, place: PlaceRef | null): Promise<boolean>`. It patches the feed's copy at once (`places[path]` set or deleted), calls `setPhotoPlaceRemote`, restores the copy on failure, and bumps a new `placesVersion` on success. The post page holds its own copy and re-reads on `placesVersion`, as it does on `tagsVersion`. A successful add also calls `usePlaces.getState().remember(place)`.
- **`lib/pour.ts`.** In `reportPost`, a case for `'unplaced'`: `showNotice('Posted without the place', "The place didn't save. Open the post's ••• and choose Add place to try again.")`.
- **`lib/moderation.ts`:**
  - `export const PLACE_REPORT_REASON = { key: 'wrong_place', label: 'Wrong place tagged' } as const;`
  - `ReportReason` widens to `(typeof REPORT_REASONS)[number]['key'] | 'wrong_place'`, and `reportPost` accepts it.
  - `REPORT_REASONS` itself does not change, so profile and reel reports never offer it.
- **`lib/database.types.ts`** (hand-typed, as `FriendsBoardRow` is):
  - `places` Row `PlaceRow` (the readable columns), with `Insert`/`Update: never`;
  - `post_photos` Row and Insert gain `place_id: string | null`;
  - `Functions`: `upsert_place` (Args the eight `p_*`, Returns `Json`), `set_photo_place` (Returns `boolean`), `drink_places` (Returns `DrinkPlaceRow[]`), `place_drinks` (Returns `PlaceDrinkRow[]`);
  - `ReportRow['reason']` gains `'wrong_place'`.

### 2.6 What crosses the wire, and what never does

**As reworked 26 Oct (0.5).**

| Data | Leaves the phone? | Kept by Sipply? |
|---|---|---|
| The device's coordinates | **Only to Apple**, inside MapKit, to bias a search or list nearby venues | **No.** Native memory for at most 120 s; in JS only as the search's bias and "350 ft" beside a search row. The drink page no longer reads it at all. |
| What the person types in place search | Only to Apple | No |
| A tagged venue's Apple Place ID | To Supabase, on the photo row (insert or `set_photo_place`) | Yes, with the photo, until removed or the photo or post is deleted |
| The poster's label for it | To Supabase, with the id | Yes, likewise; filtered like a caption |
| Apple's name, address, area, kind and position for a venue | **Only from Apple to the phone** (a search, or `resolvePlace` by id) | **No.** JS memory only: 100 places, 30 minutes each, gone on relaunch |
| A Place ID looked up again (opening a place page) | To Apple, through MapKit | No |

---

## 3. UI (Package U)

New files go in `src/components/places/`, plus the route `src/app/place/[id].tsx`. Copy is sentence case and the words below are exact. Every row reaches 44 tall. Everything uses the theme's tokens: `colors.text`, `textMuted`, `bgSunk`, `press`, `hair`, `line` and `lineControl`. **Never `accent`.**

### 3.0 The `pin` glyph (`src/components/icons.tsx`)

An outline-only map marker on the house 24 grid. It uses the 1.6 stroke (white spec §5.19), with round caps and joins, and is nobody's logo:

```tsx
pin: (
  <>
    <Path d="M12 21.1s-6.6-5.7-6.6-11.2a6.6 6.6 0 0 1 13.2 0c0 5.5-6.6 11.2-6.6 11.2z" />
    <Circle cx="12" cy="9.9" r="2.4" />
  </>
),
```

Add `'pin'` to `IconName`. There is no solid form: a place is never a state.

### 3.1 Posting: the Place row (`components/places/PlaceRow.tsx`)

```ts
export function PlaceRow(props: {
  place: PlaceRef | null;
  onAdd: () => void;           // opens PlaceSearchSheet
  onRemove: () => void;
  disabled?: boolean;          // after the save, dimmed, as TagPeopleRow
}): JSX.Element;
```

- **Empty.** It uses `TagPeopleRow`'s anatomy exactly: 56 tall across the column, no fill and no rule, and `press` while held. The `pin` glyph sits at 24 in `text`, then **"Add place"** (`bodyMedium`, ink), then the 20pt `chevronRight` in `textMuted`.
  - The whole row is one button: label "Add place", hint "Search for the bar or restaurant where you had it".
- **Chosen.** The same 56 row holds the `pin` glyph, then **a chip**. The chip follows the white spec's "off" chip: 32 tall, `radius.control`, `page` fill, 1pt `hair` edge. Inside it:
  - the place's name in Inter 500 13 ink, one line with an ellipsis, and `maxFontSizeMultiplier` 1.4;
  - the `close` glyph at 16 in `textMuted`, with 8 after the name.

  The chip hugs its content up to the column. Two targets:
  - the name part reopens the search to change the place (label "Place, La Factoría", hint "Changes the place");
  - the × is its own 44×44 target (hitSlop), labelled "Remove place". It calls `onRemove`, `haptic.select()` and `announce('Place removed')`.

  No chevron when chosen: the chip is the control.
- **Where it shows:**
  - **`app/log.tsx` (the + window, compose step).** It sits directly under Tag people (or under the caption when Tag people is not offered), 16 above the music key, inside a `View` with the same top margin `tagRow` uses. Shown when `posts && placesSupported() && placeSearchAvailable() && photoUri != null` (since 0.5 `placeSearchAvailable()` includes iOS 18).
    - `place` state: `useState<PlaceRef | null>(null)`, reset when the drink changes.
    - It goes into `save(true)` as `addPost(…, tags, place)` (a `PlaceRef`, 0.5) and nowhere else.
    - A picked place counts as work for the leave-confirm, like a song.
    - The header comment gains a paragraph: "PLACE (v4.8). Under Tag people, …".
  - **`components/dex/PostSheet.tsx` (the drink page's post sheet).** It sits under the caption in `'unlock'` mode, and under the preview in `'update'` mode, before the two keys. Shown when `signedIn && pickedUri && placesOn`.
    - New props: `place: PlaceRef | null`, `placesOn: boolean`, `onAddPlace()`, `onRemovePlace()`.
    - **The search sheet is rendered inside PostSheet's own `<Modal>`.** iOS presents a modal only from the top view controller, so it must be a child of the sheet, not a sibling in the route.
    - `drink/[id].tsx` owns the state and passes `place` to its `addPost` call for "Save & post" only.
- **Not offered:** "Save to Dex", "Save photo", a custom drink, signed out, without the module, or without 026.

### 3.2 The search sheet (`components/places/PlaceSearchSheet.tsx`)

```ts
export function PlaceSearchSheet(props: {
  visible: boolean;
  current: PlaceRef | null;
  onPick: (place: PlaceRef) => void; // (0.5) { appleId, label }; nothing is written by the sheet
  onClose: () => void;
}): JSX.Element;
```

It is an RN `<Modal presentationStyle="pageSheet" animationType="slide">`, like PostSheet and TagPeopleSheet. UIKit slides it and honours Reduce Motion. `onRequestClose` closes it and calls `cancelPlaceSearch()`. Anatomy, top to bottom, on `colors.surface`:

1. `SheetGrabber`. Then the title row, in PostSheet's `titleRow`: **"Add place"** (`bodyStrong`, a header) on the left, `TopBarTextButton label="Cancel" muted` on the right.
2. `SearchField`:
   - placeholder **"Search a bar or restaurant"**, `accessibilityLabel` "Search Apple Maps for a bar, restaurant or other place you had a drink";
   - `autoCorrect={false}`, `returnKeyType="default"` (the white spec's monochrome keyboard rule), `keyboardAppearance="light"`;
   - `onSubmitEditing` runs `search(query)`;
   - auto-focused unless the nearby list is showing (it would sit under the keys).
3. **Under the field, while the query is under 2 characters,** by `locationState()` (read each time the sheet opens):

| State | Shows |
|---|---|
| `undetermined` | One 56pt row: `pin` 20 in `textMuted`, **"Show places near me"** (`body`, ink), and under it **"Your location stays on your phone."** (small, muted). The tap calls `requestLocation()`. That is the **only** place in the app that can raise the system prompt. Granted and precise: load nearby. Otherwise: the line below. |
| `granted` and precise | **"Near you"** (`groupTitle`, muted, a header) and up to 20 nearby rows, loaded on open from `currentCoordinate()` then `nearby()` |
| `granted`, not precise | Small muted line: **"Precise Location is off for Sipply, so places near you aren't listed. Search by name."** |
| `denied` | Small muted line: **"Location is off for Sipply. Search by name, or turn it on in Settings."**, then a `Button variant="text" size="sm"` **"Settings"** that calls `Linking.openSettings()` |
| `restricted`, `unavailable` | Nothing: search by name |

4. **Suggestions** (query of 2 characters or more): `suggest(query, bias)` on every change. The wrapper debounces, and a `null` answer is dropped.
   - Rows are 64 tall. The **title** is in `body` ink, up to 2 lines. The **subtitle** is Apple's address line, in small muted, 1 line.
   - The row for `current` ends with the `check` glyph at 20 in ink, and is `selected` to VoiceOver (0.5: a found row by its Place ID; a suggestion by its title against the label).
   - Separators are `hair`, inset to the text.
   - Nearby rows and the return key's search rows (`FoundPlace`) show the name, then small muted `[PLACE_CATEGORY_LABEL[category], distance or locality].join(' · ')`. Distance is `formatDistance(distanceMeters(fix, place))` and appears only when a fix is held.
5. **Footer**, 16 under the last row and centred: **"Places from Apple Maps"** (small, muted). Plain words, not Apple's logo.

**Bias** (`bias` for suggest and search), first that exists (revised 0.5):
1. the coarse fix, when permitted;
2. `usePlaces().lastSpot` (where the last pick was, as MapKit said; memory only);
3. none (Apple's default). Posts carry no position any more, so the feed fallback is gone.

The bias is passed to MapKit and nowhere else.

**Tapping a row.** The row shows the `Hold` spinner in place of its trailing slot, and every row is disabled until it settles:
- a suggestion runs `resolve(s)`; a found row skips straight to the "Tag this place" step (0.4, 0.5);
- on `'not_taggable'`: a `Notice` (ink tone) above the list, **"This place can't be tagged. Pick a bar, restaurant or similar place."**;
- ~~`savePlace(found)`~~ **(0.5) the step's "Tag this place"**: `cleanLabel` the field, then `labelProblem`: `empty` → under the field **"Give the place a name."**; `objectionable` → `OBJECTIONABLE_MESSAGE`. Otherwise `haptic.select()`, `rememberFound(found)`, `rememberSpot(found)`, `onPick({ appleId, label })` and close. The field, **"Name on your post"**, is prefilled with Apple's name (or the current label when it is the same Place ID), 60 max, under "Category · address" and above the key. The limit, objectionable-name, missing and failed notices of the first draft are gone with `upsert_place`.

**States:**

| State | Render |
|---|---|
| Loading nearby or searching | `<Hold fill={false} slowMessage="Still searching." />` under the field (no skeleton rows) |
| Nothing nearby | Small muted, 16 under the head: **"No bars or restaurants within 800 m. Search by name."** (units from `formatDistance(800)`) |
| No matches | Small muted, centred, 24 under the field: **"No bars or restaurants match “{q}”."** |
| Offline or failed | `Notice` **"Couldn't search places. Check your connection and try again."**, action **"Try again"** |
| Throttled | `Notice` **"That's a lot of searches. Try again in a minute."** |

**VoiceOver.** After each answer, `useAnnounce` speaks "{n} places" or the empty line. A row reads "La Factoría, Calle San Sebastián 148, San Juan" plus ", selected" for the current one. Its hint is "Tags this place".

### 3.3 The post card: "at <Place>" (`components/PostCard.tsx`)

- **The header's second line** becomes **`Negroni at La Factoría`**, as Instagram puts a place under the name:
  - the drink in `DrinkName` (`nameSm`, ink), as today;
  - **" at "** in `textRole.small`, muted;
  - the place's **label** (0.5) in Inter 500 13 (`fonts.bodyMedium`, `SMALL`), ink, one line with an ellipsis.

  The place is `photoPlace(post, current)`, where `current` is the path of the **photo on screen**: the newest one first, then whichever photo the gallery has swiped to.
- **Fitting.** The line stays one line, so the header keeps its two lines and never jumps as the gallery moves. The place takes what the drink leaves, but never less than `min(placeNaturalWidth, 96)`. `DrinkName` gets `measure − atWidth − thatMinimum` (measured with `lib/textFit`'s `textWidth` at the capped scale `HEADER_CAP`), and the place `Text` takes `flex: 1` with `numberOfLines={1}`. A photo with no place draws the line exactly as today.
- **Targets.** The drink opens the drink page, as today. The place is its own `Pressable` (`hitSlop` to the line, as the drink has) and opens `placeHref(place.appleId)`.
  - VoiceOver: the header's one element reads "maya.pours, Negroni, at La Factoría, 2 hours ago".
  - A new accessibility action `{ name: 'place', label: 'Open La Factoría' }` goes beside "Open Negroni".
- **••• on your own post** (`menuActions`), after Tag people and before View drink, when `placesSupported()`:
  - The photo on screen has no place, and `placeSearchAvailable()`: **"Add place"**. It opens `PlaceSearchSheet`, then `setPhotoPlace(myId, post.id, current, place)`.
  - The photo on screen has a place: **"Remove place"**. Plain, not destructive, with no confirm (it can be undone). It calls `setPhotoPlace(…, null)`.
  - Success: `haptic.success()`. Failure: `showNotice("Couldn't update the place", 'Check your connection and try again.')`.
  - The sheet is mounted beside `TagPeopleSheet` in the card, and only while open.
- **Report** (someone else's post): when the photo on screen has a place, `reasonActions` gains `PLACE_REPORT_REASON` (**"Wrong place tagged"**) just before "Something else". It files through the same `fileReport`.
- The profile grid, Saved, Activity, the pours viewer and the stories **never show places**. That rules out a person-centric places trail (07 L9).

### 3.4 The place page (`app/place/[id].tsx` + `components/places/PlacePage.tsx`)

- **Route.** A plain push, as `user/[id]`, so `_layout.tsx` needs no `Stack.Screen`.
  - It is gated exactly as `user/[id].tsx` is: signed out, AuthGate with sign-in; with a placeholder handle, the username step.
  - The param must be a uuid (lowercased). Anything else goes straight to the missing state.
  - Back is `router.canGoBack() ? router.back() : router.replace('/')`.
  - `drinkdex://place/<uuid>` reaches it with no `+native-intent` change.
- **Data (revised 0.5).** The route is `/place/<Apple Place ID>` (`isPlaceId`, case kept). Sipply's side, `usePlaces().loadPlace(appleId)` on focus: the newest label, the counts and the drinks. Apple's side, `resolvePlace(appleId)` once per open (from `cachedPlace` at once when held), live from MapKit and kept in memory only. Pull to refresh calls the load again, and the lookup if it failed.
- **Anatomy.** One `FlatList` of grid rows, pre-chunked in threes. The header is the `ListHeaderComponent`, the footer the `ListFooterComponent`.
  1. `ScreenTopBar size="md"` with the back `TopBarButton`. The centred title is the place's name **only once scrolled** past the header's name (`useScrolledPast`), and the rule shows then too.
  2. **Header** at the gutter, `paddingTop` 12:
     - **Name** in `textRole.title` (Inter 600 28/34), ink, up to 2 lines, `accessibilityRole="header"`: the newest **label** (0.5);
     - ~~**Meta**~~ (0.5: moved under the map as Apple's line, below);
     - **Count** in small muted, marginTop 4: **"{d} different drinks, posted by {p} people"**, singular "1 drink" and "1 person", figures `tabular`. This is distinct people (`peopleHere`), never amounts;
     - **The map** (revised 26 Oct, 0.4), marginTop 16: `PlaceMap` across the column at 2:1, only once Apple has answered (0.5). While the lookup runs, a `bgSunk` box of the same size holds its room; with no answer (below iOS 18, offline, unknown id) nothing is drawn and the page is the label, counts and drinks;
     - **Apple's line** (0.5), marginTop 8, small muted, up to 2 lines: `[apple.name if it differs from the label, PLACE_CATEGORY_LABEL[category], address ?? locality].join(' · ')`;
     - **The one key**, marginTop 12, only with Apple's answer: `Button variant="secondary" size="sm" icon="pin" label="Open in Apple Maps"`. One tap calls `openInAppleMaps(place)` and falls back to `Linking.openURL(appleMapsUrl(place))` on false. No ActionSheet and no Google Maps (0.4). The key is not full width; it hugs its label.
  3. **"Drinks people have had here"** (`sectionTitle`, a header), marginTop 32, marginBottom 12.
  4. **Grid.** Three columns at the gutter with 12 between, the Dex grid's cell rhythm. Each tile:
     - the **print**, 1:1, radius 0, `photoEdge`, decoded at the tile with `enforceEarlyResizing` and a sized `cacheKey` (check-design rule 9). It shows the newest tagged photo here (`useSignedPhoto(photoPath)`), else the drink's own print (`photoFor`), else `DrinkFace`;
     - then 8, then the drink's name in `DrinkName` (`name` role, 2 lines, fitted, never truncated).

     A tap opens `/drink/[id]`. VoiceOver reads "Negroni, had here by 3 people" with the hint "Opens the drink". There is no count on the tile: "less stuff", and the header already says it.
  5. **Footer**, centred, marginVertical 24: **"Place details from Apple Maps"** (small muted), only when Apple's details are showing (0.5).
- **States:**

| State | Render |
|---|---|
| First load | The bar, then `<Hold fill={false} slowMessage="Still loading this place." />` centred. No skeleton. |
| Failed, nothing held | `EmptyState icon="alert" title="Could not load this place" body="Check your connection and try again."`, with a secondary **"Try again"** |
| Missing (bad id, every visible tag gone, or 026 not applied) | `EmptyState icon="pin" title="Place unavailable" body="This place isn't on Sipply any more."`, with a secondary **"Back"**. (0.5: with no places table, "no visible tags" is "missing".) |
| Place, no catalogue drinks (only rows outside this build) | The header as normal, then small muted at the gutter: **"Nothing posted here yet."** |
| Refresh fails over data | `Notice` **"Could not refresh. Pull down to try again."** above the header, with the content kept |

- No marks (v4.6 A.4: pushed screens). No "Post a drink here" key, because a venue page must not read as an invitation to drink there (1.4.3). The drink page's own Post key stays the one way to post.

### 3.5 The drink page: "Where people have had it" (`components/places/WherePeopleHadIt.tsx`)

**As reworked 26 Oct (0.5).**

- `drink/[id].tsx` renders `<WherePeopleHadIt drinkId={drink.id} />` straight after `<FriendsWhoCaught …/>`. `DrinkPanels.tsx` is not edited, and `custom/[id].tsx` does not get it.
- It draws **nothing** when signed out, `!placesSupported()`, still loading, failed, or with no rows. It is the last section, so appearing late moves nothing above it. Data: `usePlaces().loadDrink(drinkId)` on focus, and again on `postsVersion` / `placesVersion`.
- **Order: the server's, as it comes.** Places where someone you follow posted it first, then the most recent. **No distance sort** (the server holds no coordinates, and resolving every row with Apple would be a lookup per row), and **it never asks for, or reads, location**.
- **Anatomy.** DrinkPanels' `Section` anatomy; the title **"Where people have had it"**. Rows 56 min: `pin` 20 in `textMuted`; 12 later the **label** (`body`, ink, 1 line, 2 above 1.3) over small muted **"3 people"** / **"1 person"**, or with someone you follow among them **"Someone you follow"** (one person) or **"3 people, including someone you follow"**; `chevronRight` 18 in `textMuted`. First **3**, then **"Show {n} more"** in place, to at most 20. No separators.
- **Tap** opens `placeHref(place.appleId)`. VoiceOver: "La Factoría, 3 people, including someone you follow", hint "Opens the place".

### 3.6 What U needs from N and S (exact)

From **`@/lib/placeSearch`** (N):
- `placeSearchAvailable(): boolean`
- `suggest(query, bias?)` → `Promise<PlaceSuggestion[] | null>`
- `resolve(s)` → `Promise<FoundPlace | 'not_taggable' | null>`
- `search(query, bias?)` → `Promise<FoundPlace[] | null>`
- `nearby(center)` → `Promise<FoundPlace[] | null>`
- `cancelPlaceSearch()`
- `locationState()` → `Promise<LocationState>`
- `requestLocation()` → `Promise<LocationState>`
- `currentCoordinate()` → `Promise<LatLng | null>`
- `openInAppleMaps({ appleId, name, lat, lng })` → `Promise<boolean>`
- `formatDistance(m)` → `string`
- the types `PlaceSuggestion`, `FoundPlace`, `LatLng`, `LocationState`, `PlaceCategory` and the class `PlaceSearchError` (`.code`)

From **`@/lib/places`** (S):
- `placesSupported()`, `PLACE_CATEGORY_LABEL`
- (0.5) `cleanLabel`, `labelProblem`, `PLACE_LABEL_MAX`, `samePlace`
- `distanceMeters`, `placeHref`, `appleMapsUrl`, `photoPlace` (`savePlace`, `sortNearest`, `googleMapsUrl` are gone)
- the types `PlaceRef`, `DrinkPlace`, `PlaceDrink`, `PlacePage`

From **`@/store/places`** (S): `usePlaces` (`byDrink`, `loadDrink`, `byPlace`, `loadPlace`, `lastSpot`, `rememberSpot`).

From **`@/lib/placeSearch`** also (0.5): `placeModuleAvailable`, `resolvePlace`, `cachedPlace`, `rememberFound`, `isPlaceId`, the type `ResolvedPlace`.

From **`@/store/social`** (S):
- `addPost(…, tags, place?: PlaceRef | null)`
- `setPhotoPlace(myId, postId, path, place | null)` → `Promise<SetPhotoPlaceResult>` (0.5)
- `placesVersion`

From **`@/lib/moderation`** (S): `PLACE_REPORT_REASON`, the widened `ReportReason`.

From **`@/types`** (S): `Post.places?: Record<string, PlaceRef>`.

---

## 4. Privacy and review (Package D)

### 4.1 `docs/privacy.md`

**Revised 26 Oct (0.5): `docs/privacy.md` itself is now the text.** Its Places paragraph says Sipply stores Apple's identifier and the name the poster gives the place (prefilled, editable), not the address, area or position, which the phone asks Apple for by the identifier and keeps only in memory; that a tag is still where the person was, so Precise Location; who sees it; that it goes with the photo. The no-tracking bullet says location is used only while searching for a place to tag. The Apple Maps paragraph adds the identifier lookup. The meter, the 30-day prune and "a place names nobody" are gone from Places, deletion and the EEA basis. The first draft's wording below is kept for the record.

1. A new paragraph after **Tags**:

   > **Places (only if you tag one).** When you post a drink you can add the place you had it: a bar, restaurant, brewery, winery, distillery, café, hotel or music venue, never a home or a street address. Places are found with Apple Maps on your phone. What you type goes to Apple to find them, and if you allow it, so does your location, to suggest places near you; your location stays on your phone and with Apple, and is never sent to Sipply or saved. The place you choose is stored with that photo: its name, address, area, country, kind and position on the map, and Apple's identifier for it, which our server keeps once for everyone who tags it. Anyone who can see the post can see the place, each place has a page showing the drinks people have posted there, and a drink's page shows the places people have had it, with how many people; nobody you have blocked, or who has blocked you, is counted or shown. You can add or remove the place on your own posts at any time. To keep places from being misused we count how many new places each account adds in a day (at most 30), never which ones. A place nobody uses is deleted 30 days after it was last picked.

2. **What Sipply does not do**, a new bullet:

   > - **No location tracking.** Sipply never uses your location in the background, never sends it to our servers and never saves it. If you allow it, it is used on your phone, and by Apple Maps, only while you tag a place or open a drink's page.

3. **Who else can see it**, a new paragraph after Supabase:

   > **Apple Maps**, if you tag a place: your phone sends what you type, and your location if you allowed it, to Apple to find places, under Apple's privacy policy. A place's page, and the step before you tag one, show Apple's map of the venue, which your phone loads from Apple. Opening a place in Apple Maps hands its name and position to that app.

   (As revised 26 Oct, 0.4; the Places paragraph above also gained "the search only offers venues", "The place you tag is the only location Sipply keeps, and the App Store lists it as Precise Location" and "Everyone signed in to Sipply can see the place on your post, so it shows where you were when you posted", which replaced "Anyone who can see the post can see the place".)

4. **Photos**: the sentence "with no location and no other camera metadata" stays true. Tagging never reads where a photo was taken.
5. **Deleting your account**: add "the count of places you added today" to the list. Places themselves name nobody and stay while other posts use them.
6. **Last updated**: the release date.

Also D's: **`docs/data-deletion.md`**, the same item in its list, and **`docs/support.md`**, a short section "Places on a post":
- Tag one: Add place under the caption.
- Remove one: the post's ••• → Remove place.
- A wrong place on someone's post: ••• → Report → Wrong place tagged.
- Location is optional, and search by name always works.

### 4.2 `docs/terms.md` (one sentence each)

- Under what not to post: "Tag only places where you actually had the drink, and never use a place to mislead or harass."
- Under content: "Place names and details come from Apple Maps. A place appearing in Sipply is not an endorsement either way."

### 4.3 The App Privacy label (a recommendation for Jan; D writes it into `docs/appstore.md`)

**Revised 26 Oct (0.5): the recommendation stands, Precise Location, linked, App Functionality, no tracking, for a different reason in one place.** The server no longer stores coordinates, but a Place ID names one venue and resolves to its exact position, and the tag says the person was there, linked to the account: that still describes the user's location at better than three decimals. The licence decides what Sipply may keep of Apple's data, not how precisely a tag locates the person. The label is the poster's words, inside Other User Content already. **The Coarse alternative below no longer exists** (a Place ID cannot be rounded). `docs/appstore.md` carries the reworded row and reasons.

**Declare Location → Precise Location: linked to the user, App Functionality, not used for tracking.** The device's own location stays **not collected**.

Why, from Apple's own definitions (developer.apple.com/app-store/app-privacy-details, read 25 Oct 2026):
- **"Collect"** is "transmitting data off the device in a way that allows you and/or your third-party partners to access it for a period longer than what is necessary to service the transmitted request in real time". A tagged place is sent to our server and kept with the post, so it is collected.
- **Precise Location** is "Information that describes the location of a user or device with the same or greater resolution as a latitude and longitude with three or more decimal places". A tag records where the person was when they had the drink, at the venue's coordinates, which `places` stores at full precision. That is the location of a user at better than three decimals, and it is linked to the account through the post.
- **Other User Content** ("Any other user-generated content") is not enough on its own. Apple's same page says that "if you ask a user to input a specific data type into a text field … you'll need to disclose the specific type of data". A place picker asks for exactly one specific type, a location. Under-declaring is a rejection risk. Over-declaring costs one row on the label.
- **The device's own location is not collected.** Apple's page says "Data that is processed only on device is not 'collected'". The fix goes to MapKit, and Apple adds "You are not responsible for disclosing data collected by Apple." It never reaches Sipply (2.6).
- **Coarse Location is not declared.** Nothing coarser than the venue is kept.

**The alternative, if Jan would rather show Coarse.** Store the venue's coordinates rounded to 2 decimals (about 1.1 km). That loses the 50 m dedupe (it would fall back to the name within the same rounded cell) and makes "nearest" accurate only to about a kilometre. The spec does not recommend it.

D's edits in `docs/appstore.md` → App Privacy:
- The table gains the row `Location → Precise Location | Yes | The place a person tags on a post's photo (a bar, restaurant or similar venue chosen from Apple Maps): its coordinates, name and address, shown with the post. The device's own location is used on the phone and by Apple Maps only, and never sent to Sipply.`
- "Declare these nine" becomes "ten".
- The Other Usage Data row gains "How many new places an account added each day, never which; kept two days to enforce the 30-a-day limit."
- The Not-collected sentence becomes "Contacts, Coarse Location (the device's own location never leaves the phone except to Apple Maps for a search, and photos are re-encoded without location), Search History (the Dex and place searches run on the phone or with Apple), …".
- The manifest paragraph names the new `NSPrivacyCollectedDataTypePreciseLocation` entry (N writes it in `app.json`, 1.6).

### 4.4 App Review notes and What to Test (D, counted the way the files count)

**Revised 26 Oct (0.5), recounted from the files.** The review paragraph ends "Try it on iOS 18 or later: post a drink, then Add place." and is **522**; with the set below it is 4,004 with the Friends sentence (4 over) and **3,831** without it (169 to spare); phone sign-in would make 4,299 and songs 4,422. What to Test's Places item names iOS 18 and renaming the place, **423** with its line break: the list is **3,843**, **3,966** with the first sign-in item (34 to spare). The Beta App Description is unchanged at 1,665.

**Review notes** (`docs/appstore.md`): a new section **"### Places — a build with the place-search module and migration 026 applied"**, holding this paragraph. It is **503** characters as pasted: bold marks gone, line breaks as spaces.

> **Places.** A post can name the bar or restaurant it was had at, found with Apple Maps search on the device (MapKit). Only venues can be tagged, never a home or an address. Location is When In Use, asked only on a tap of Show places near me; search by name works without it, and the device's location never reaches our server. Pages count people who had a drink at a place, never amounts, prices, deals or rankings. Wrong places are reported from the post's "..." menu. Try it: post a drink, then Add place.

`[503]`

The field is already near its 4,000 limit. D's arithmetic, from the figures in `appstore.md` and `testflight.md` as they stand:
- The build-25-style set with every cut already described (Contacts and Instagram down to their first sentence, and the third-party paragraph's two sentences about the Facebook friends list and the access token dropped) is about 3,482 before phone sign-in and songs.
- Places adds 503 plus the blank line, so 3,987: 13 to spare. That is too tight to trust.
- So **also leave out the Tournaments paragraph's Friends sentence** (173 with its space). That gives about 3,814, 186 to spare. Phone sign-in and songs both stay out.
- D recounts the real set from the files before writing any figure, and writes the figures in the house style (the `[n]` line, and the paragraph on the limit updated).

The same paragraph goes into `testflight.md`'s Test Information notes, by the same "written once in appstore.md" rule, under the "Add … when it has them" heading, with the same cut.

**What to Test** (`docs/testflight.md`), one new item, **333** with its leading "- ":

> - **Places.** Post a drink and tap Add place under the caption. Search a bar by name, or tap Show places near me (iOS asks for your location only then; say no once and check search still works). Tap the place on your post to open its page and try Open in Maps. On the drink's own page, check the bar shows under Where people have had it.

- What to Test is 3,860 now (3,983 with the first sign-in item). To make room, **remove "Liking, sharing, saving" (211) and "Scrolling" (229)**. Both shipped in builds 29 and 30 and have been tested since.
- That makes 3,860 − 440 + 334 = **3,754** (3,877 with the sign-in item).
- D updates the bracketed count note, and adds a line to the Beta App Description's "Worth trying" list: "- Tagging the bar on a post, and the drink's Where people have had it" (73).
- D keeps the description under its stated count and recounts it.

**Guidelines to check before submitting** (D lists them under the paragraph, not for pasting):
- 5.1.1: asked on demand, a purpose string, works when denied;
- 5.1.5: location directly relevant, nothing in the background;
- 2.5.4: no background modes;
- 1.4.3: nothing encourages drinking, no deals, no rankings;
- 4.0, 5.2 and the MapKit licence: Apple Maps data shown with an Apple map that keeps its logo and Legal link, credited in words as well, and no Google Maps anywhere (0.4).

---

## 5. File ownership (four packages, no file edited by two)

None of them commits, pushes, or applies a migration. Each runs Part 6 on its own files before it reports. The full run happens once all four have landed: U's imports need N's and S's files.

### Package N: the native module, its wrapper, app.json

| File | Change |
|---|---|
| `modules/place-search/expo-module.config.json` (new) | 1.2 |
| `modules/place-search/ios/PlaceSearch.podspec` (new) | 1.3 |
| `modules/place-search/ios/PlaceSearchModule.swift` (new) | 1.4 |
| `modules/place-search/ios/PlaceSearchEngine.swift` (new) | 1.5 |
| `src/lib/placeSearch.ts` (new) | 1.7 |
| `app.json` | `ios.infoPlist` with the one location string, and the privacy manifest entry (1.6) |

### Package S: the migration, the schema and the data layer

| File | Change |
|---|---|
| `supabase/migrations/026_places.sql` (new) | 2.2, exactly. **Write the file; never run it.** |
| `supabase/schema.sql` | The same objects, in their sections (2.2 notes) |
| `src/lib/places.ts` (new) | 2.3 |
| `src/store/places.ts` (new) | 2.4 |
| `src/types.ts` | `Post.places` (2.5) |
| `src/lib/social.ts` | `fetchPostPlaces`, the fifth read in `toPosts`, `createPost`'s `placeId` and retries (2.5) |
| `src/store/social.ts` | `PostOutcome 'unplaced'`, `addPost`'s `placeId`, `setPhotoPlace`, `placesVersion` (2.5) |
| `src/lib/pour.ts` | `reportPost`'s `'unplaced'` case (2.5) |
| `src/lib/moderation.ts` | `PLACE_REPORT_REASON`, `ReportReason` (2.5) |
| `src/lib/database.types.ts` | 2.5 |

### Package U: every screen

| File | Change |
|---|---|
| `src/components/icons.tsx` | `pin` (3.0) |
| `src/components/places/PlaceRow.tsx` (new) | 3.1 |
| `src/components/places/PlaceSearchSheet.tsx` (new) | 3.2 |
| `src/components/places/PlacePage.tsx` (new) | 3.4 |
| `src/components/places/WherePeopleHadIt.tsx` (new) | 3.5 |
| `src/app/place/[id].tsx` (new) | 3.4 (the gate, the param, Back) |
| `src/app/log.tsx` | The Place row, its state, `addPost`'s `placeId`, the leave-confirm, the header comment (3.1) |
| `src/components/dex/PostSheet.tsx` | The Place row and the nested search sheet, plus props (3.1) |
| `src/app/drink/[id].tsx` | The sheet's place state, `addPost`'s `placeId` on Save & post, `<WherePeopleHadIt />` (3.1, 3.5) |
| `src/components/PostCard.tsx` | "at <Place>" in the header, the a11y action, Add or Remove place in •••, the report reason (3.3) |

### Package D: docs only

| File | Change |
|---|---|
| `docs/privacy.md` | 4.1 |
| `docs/terms.md` | 4.2 |
| `docs/support.md`, `docs/data-deletion.md` | 4.1 |
| `docs/appstore.md` | App Privacy (4.3), the Places review section and every recount (4.4) |
| `docs/testflight.md` | What to Test, the Beta App Description line, the Test Information pointer and counts (4.4) |
| `specs/07-location-tagging-longterm.md` | One line at the top: "Superseded by specs/v4.8-places/spec.md (25 Oct 2026) wherever they differ; see its §0.2." |

### What each needs from the others

- **N → S and U:** `src/lib/placeSearch.ts`'s exports and types, exactly as 1.7 gives them. S imports only the types `FoundPlace`, `LatLng` and `PlaceCategory`. U imports the functions. If N lands last, S and U write against 1.7, and the final `tsc` run proves the match.
- **S → U:** the names in 3.6. S's `photoPlace` reads `Post.places`, which S also adds, so U never touches `types.ts`.
- **S ↔ N, the category list:** three copies must agree: `venueTable()` (N), `VENUE_CATEGORIES` (N) and `places_category_known` plus `upsert_place`'s list (S). Each carries a comment naming the other two. 6.2 compares them.
- **U ↔ S, posting:** U only passes `place?.id` to `addPost` and calls `setPhotoPlace`. All writes are S's.
- **N ↔ D, the purpose string and the manifest:** N writes 1.6's string and entry word for word. D's privacy text (4.1) and label (4.3) say the same things. If Jan changes the 4.3 choice, N's manifest type changes with it.
- **check-design:** no package edits `scripts/check-design.mjs`, `theme.ts` or `penPath.ts`. Nothing here adds an accent, a mark or a shadow, and rule 9 (decode size) applies to U's new Images.

---

## 6. Checks before any package is done

### 6.1 N

- **Typecheck the engine against the real SDK at the real floor**, with no simulator and no archive:

  ```sh
  xcrun --sdk iphoneos swiftc -typecheck -swift-version 5 -target arm64-apple-ios16.4 \
    modules/place-search/ios/PlaceSearchEngine.swift
  ```

  It must print nothing. This proves every iOS 18 and iOS 26 call is behind `#available` at the 16.4 floor, and that every symbol exists in iPhoneOS27.1. Run it again with `-target arm64-apple-ios26.0` to prove the iOS 26 branch compiles too.
- The glue cannot be typechecked outside the pod (it needs `ExpoModulesCore`). Read it against the installed core once more: every DSL name in 1.4 is cited there.
- `npx expo-modules-autolinking search --platform apple` (from the worktree) lists `place-search` with `PlaceSearchModule`.
- `grep -rnE 'requestAlwaysAuthorization|allowsBackgroundLocationUpdates|startUpdatingLocation|print\(|NSLog|UserDefaults' modules/place-search` finds nothing.
- `node -e "const a=require('./app.json');console.log(Object.keys(a.expo.ios.infoPlist))"` prints exactly `[ 'NSLocationWhenInUseUsageDescription' ]`.
- `npx tsc --noEmit -p .` is clean for `src/lib/placeSearch.ts`.

### 6.2 S

- Read 026 against `schema.sql` once more (names, aliases, grants). Diff `report_evidence` against `schema.sql` 862 to 900. **Do not run it.**
- (0.5) `grep -nE "rpc\('(drink_places|place_drinks|set_photo_place)'" -A4 src/lib/places.ts` shows no `lat` or `lng` argument, and `grep -nE "lat|lng|address|locality" supabase/migrations/026_places.sql` finds them only in comments: **no RPC and no column carries a coordinate or an address.**
- (0.5) The two category lists match: `VENUE_CATEGORIES` and `venueTable()` (026 stores no kind; `PLACE_CATEGORY_LABEL` is held to the list by tsc).
- `npx tsc --noEmit -p .` is clean, and `node scripts/check-design.mjs` passes for S's files.

### 6.3 U

- `npx tsc --noEmit -p .`, `npx expo lint`, `node scripts/check-design.mjs` and `node scripts/check-contrast.mjs` are all clean once N and S have landed.
- `grep -n "accent" src/components/places src/app/place` finds nothing.
- No FlatList cell does per-item work on scroll: the grid tiles and the rows are memoised, and the signed URLs come from the shared cache.
- VoiceOver reads the labels in 3.1 to 3.5. At AX3 nothing clips: the chip ellipsizes, rows grow, and the place name wraps to 2 lines.

### 6.4 After the build (Jan's TestFlight pass; D lists it in `testflight.md`'s notes)

- [ ] Before 026: no Add place, no "at …", no section, no errors. The build looks like build 32.
- [ ] After 026: Add place under Tag people; the search finds bars by name with location never asked.
- [ ] "Show places near me" shows the system prompt with the 1.6 text. Allow While Using lists venues within 800 m with distances in feet or miles. Don't Allow shows the Settings line, and search still works. Precise Location off shows its line.
- [ ] Searching a home address or a school finds nothing taggable.
- [ ] Save & post with a place: the feed shows "Negroni at La Factoría", and the place opens its page with the photo in the grid. Save to Dex with a place chosen posts nothing and tags nothing.
- [ ] A gallery post with a place on one photo: the line follows the photo and the header never jumps.
- [ ] Your ••• → Remove place takes the tag away; Add place puts one back.
- [ ] Tapping a result shows Tag this place with Apple's map (ink marker, logo and Legal visible); Back to search keeps the words.
- [ ] The place page shows the same map; Open in Apple Maps opens the venue's own card (iOS 18 and later). No Google Maps anywhere.
- [ ] A drink's page shows Where people have had it, places with someone you follow first, then the most recent, and never asks for location (0.5).
- [ ] (0.5) Rename the place in Tag this place: the post says the new name; its page shows Apple's own name beside the map. An empty or refused name is stopped in the step.
- [ ] (0.5) The place page in airplane mode: label, counts and drinks, no map; below iOS 18, no Add place anywhere and others' tags still read as their label.
- [ ] Someone else's post with a place: Report offers Wrong place tagged; the report's snapshot names the place.
- [ ] Airplane mode: the search shows its error; posting without a place still works.
- [ ] `plutil -p Sipply.app/Info.plist | grep -i location` prints only `NSLocationWhenInUseUsageDescription`.
- [ ] `scripts/check-native-links.sh` passes on the archive.

---

## 7. What only Jan does

1. **Say yes to 026, then apply it by hand** (SQL Editor, paste, Run, then the VERIFY block). Builds up to 32 are unaffected. Apply it **before** submitting build 33 for review: the binary carries a location purpose string, and reviewers should find the feature that uses it.
2. ~~**Decide how places are stored**~~ **Decided 26 Oct 2026 (delegated): Place ID plus the poster's label (0.5); 026 is rewritten to match.** As first asked (0.4 #3), before 026 is applied: (a) Apple's Place ID only, iOS 18 to tag (the privacy review's recommendation), (b) Place ID plus the name, or (c) this spec as written, accepting the §2.2/§2.5 risk or asking Apple in writing. (a) and (b) mean a rewrite of 026 and the data layer before build 33. Tell N to switch the manifest to Coarse if the label changes (4.3).
3. **App Store Connect → App Privacy:** add Location → Precise Location (linked, App Functionality, no tracking; unchanged by 0.5). Publish the privacy policy first: `docs/` goes live when `main` moves.
4. **The archive:** `scripts/build-lock.sh acquire` → `scripts/build-ios.sh archive` → `scripts/check-native-links.sh` → upload. This build carries the module, so it starts a new runtime (fingerprint).
5. **Review notes:** paste the Places paragraph with the cut in 4.4, after D's recount.
