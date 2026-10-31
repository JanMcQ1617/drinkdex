# v4.11 · Current place in Add place

30 Oct 2026. Jan, for the next build: "when the add place for a post, add current place to list and put it at the top". The Add place sheet now opens on a **Current place** row, above the venues near you and above Apple's suggestions: the bar or restaurant you are in, one tap from the Tag this place step.

| Piece | Where | State |
|---|---|---|
| The row | `src/components/places/PlaceSearchSheet.tsx` (`HereRow`, and `PlaceResultRow`'s `here`) | new |
| The locate glyph | `src/components/icons.tsx`, `locate` | new glyph |
| The fix's accuracy, as a yes or no; the location section's heading | `src/lib/placeSearch.ts` (`currentCoordinate` returns `{ at, close }`) | changed |
| What to Test | `specs/v4.11/wtt-37.txt` | one line |
| Review notes, Places | `specs/v4.11/review-notes-37.txt` | one clause, recounted |

Rules that hold (specs/v4.8-places, unchanged):

- **Only venues.** The row is the nearest row of the nearby answer, which is MapKit's venue filter (`VENUE_CATEGORIES`, P3). Nothing is reverse-geocoded, so the row can never hold a street address, a home or anything outside the filter.
- **Location is When In Use and asked only on a tap.** Opening the sheet, or coming back to it from Settings, reads the permission (`locationState()`, which never prompts) and, where it is already granted, takes the fix and asks `nearby()` as it did in v4.8. The prompt comes only from `askLocation`, now behind one row, Current place, which replaced **Show places near me** (§5).
- **The device's location never reaches Sipply.** The fix goes to `lib/placeSearch` and Apple only; the row's distance is worked out on the phone (P4, 2.6). Of the fix's accuracy only a yes or no (`close`, within 100 m) crosses into the screen.
- **Only the Place ID and the label are stored.** The row is the same `FoundPlace` as any near row, through the same `pick` → `choose` → **Tag this place** → `onPick({ appleId, label })` (§0.5).
- **iOS 18 and later, behind the existing check.** The sheet is only offered where `placeSearchAvailable()`. Nothing native changes: no Swift, no package, nothing for prebuild, so the fingerprint is the build's.
- **One hue.** None of it is red. No new key. Row text is Archivo (`body`, `small`).

---

## 1. What it shows

```
┌──────────────────────────────┐
│ Add place             Cancel │
│ [ Search a bar or restaurant]│
├──────────────────────────────┤
│ ⌖  La Factoría            ✓  │  Current place: 64, the first row
│    Current place · 30 ft     │
│ Near you                     │
│    El Batey                  │  the nearby answer, less the row above
│    Bar · 350 ft              │
│          …                   │
│     Places from Apple Maps   │
└──────────────────────────────┘
```

- **Found,** the row is a list row like the rest (`PlaceResultRow`): the venue's name as the title, **"Current place · 30 ft"** under it in small muted, the distance the same `formatDistance(distanceMeters(fix, place))` figure the near rows carry, and the check on the far gutter when it is the place already chosen. A 20pt `locate` glyph leads it at the gutter, the words 12 after.
- **Otherwise** it is `HereRow`: the same 64 and the same leading slot, **"Current place"** in `body` over one quiet line (or none). Every state is 64 tall, so finding the place never moves what is under it (and under a typed term a place found mid-word waits, §4). Every VoiceOver label starts with the words on the row, "Current place", so Voice Control's "Tap Current place" finds it in any state.
- **A tap on the found row is a tap on any row:** the keyboard goes and the Tag this place step opens with Apple's map, the address and the name field. The map before the tag is the licence's (DPLA Attachment 6 §2.4) and the cheapest way to catch the bar next door, so the row does not skip it.

## 2. The row, state by state

> **Changed in v4.12** (specs/v4.12/current-place-fix.md, after "it doesn't let me do it" on build 37): the inert rows below now take a tap (nothing here and can't tell go to the field; no fix is its own row, "Couldn't find where you are. Try again."), finding says so in words and ends at 20 s, and Precise Location off is a Current place row that opens Settings. This table is build 37's.

| Location | The row | A tap | VoiceOver |
|---|---|---|---|
| Never answered | ⌖ **Current place** over **"Your location isn't sent to Sipply."** (the line Show places near me carried, which this row replaced, §5) | `askLocation()`: the system prompt. Allowed, the fix and `nearby()` run and the row fills; that is the first tap, and the second opens Tag this place | "Current place. Your location isn't sent to Sipply.", hint "Asks to use your location to find where you are" |
| Allowed, finding | a spinner in the leading slot (the trailing slot's busy pattern, moved to the front: the row has no check yet) | none | "Current place, finding where you are", busy |
| Allowed, a venue within 100 m | the venue, as in §1 | Tag this place | "Current place, La Factoría, 30 ft" (", selected" when it is the chosen one); hint "Shows this place on a map before you tag it" |
| Allowed, venues near but none within 100 m | **"No bar or restaurant here."** | none | "Current place. No bar or restaurant here." |
| Allowed, venues near, but the fix worse than 100 m (§3) | **"Can't tell which place you're in."** The venues stay in Near you, the nearest first | none | "Current place. Can't tell which place you're in." |
| Allowed, nothing within 800 m (or no fix) | **"No bars or restaurants within 800 m. Search by name."** (units from `formatDistance(800)`): the line that stood under the field, said once, in the row | none | the same words |
| Refused | **"Location is off for Sipply in Settings."** | `Linking.openSettings()` | "Current place. Location is off for Sipply in Settings.", hint "Opens Settings" |
| Allowed, Precise Location off | no row: the line under the field says why, now naming the row too ("Precise Location is off for Sipply, so your current place and places near you aren't listed. Search by name."); a kilometre-wide guess cannot name the bar you are in | | |
| Restricted, no module, nearby superseded | no row, as the near list says nothing | | |
| Nearby failed or throttled | no row: the Notice above says why, and its Try again finds the place again with the list | | |

## 3. How near is "here"

**100 m** (`HERE_RADIUS_M`), from the fix to Apple's position for the venue.

- **Why 100.** The fix is asked for at `kCLLocationAccuracyHundredMeters` (PlaceSearchEngine.swift). Within 100 m the phone cannot say you are anywhere else; past it, it can, and a bar down the street is a place near you, not your current place. Anything tighter would miss the bar you are standing in whenever the fix is the 60 to 100 m an indoor fix often is; anything looser would offer the next block as "here".
- **The ranking is the list's own.** `nearby()` already returns venues within 800 m sorted nearest first by straight-line distance from the fix (native's sort over MapKit's points of interest). The row is that answer's first venue when it is within 100 m. No second MapKit search: native runs one `MKLocalSearch` at a time, and a second would cancel the list's.
- **Only from a close fix.** All of the above holds only when the fix is as good as it was asked to be. CoreLocation answers with worse when it has nothing better in time (indoors on weak wifi, a few hundred metres), and the nearest venue to a point that far off is not the bar you are in. Native reports the fix's `horizontalAccuracy`; `lib/placeSearch.currentCoordinate` turns it into `close` (0 to 100 m) and drops the figure, so the screen gets a point and a yes or no. Not close, the row says **"Can't tell which place you're in."** and the list carries the venues, nearest first, as v4.8 did.
- **A fix up to 120 s old** is still served from native's memory while the app stays in front (`PlaceSearchEngine.swift`, `fixAt`), so someone who tags one bar and walks to another within two minutes without leaving the app gets the first bar's fix. JS cannot see the fix's age; the map step is the catch until the next native build (§6).
- **In a street of bars** the nearest wins, and the Tag this place step's map is where a wrong guess is caught, as it is for any row.
- **Listed once.** The venue in the row is lifted out of Near you, and out of the return key's rows (§4); when it was the only one, Near you has no heading and no rows. VoiceOver's count after the answer still counts it ("5 places"): it was found with them. VoiceOver hears the row first, "Current place, La Factoría. 5 places", or its line ("No bar or restaurant here. 4 places"): the row a tap asked from comes back as a different view (ask, finding, found), so focus does not stay on it to hear what it found.

## 4. While a name is typed

The row stays at the top **only with a venue in it, and only if it held one as the typing began** (`hereKept`, latched in `onChangeText` as the term reaches two characters). It is still the one-tap answer whatever is typed, it is one row, and the first suggestion then gets its separator so the two read as one list. Asking, finding, nothing here and Settings are about location, not the search, and 3.2's rule is that the location row goes under two characters, so those states go with it rather than push Apple's suggestions under the keys. A venue found mid-word waits until the field is cleared: `nearby()` can take seconds and Apple's suggestions a fraction of one, so a row landing above them would push them 64 down under a finger already on its way to one.

The return key's rows are venues with a Place ID, so the row's venue is lifted out of them by `appleId`, and "No bars or restaurants match" counts it as a match. Suggestions are not checked against the row: a suggestion has no Place ID until it is tapped, and a name alone could be another branch.

## 5. What moved around it

- **Show places near me is gone.** While location has never been answered, Current place is the one row that asks and carries its line, "Your location isn't sent to Sipply."; the old row under it asked the same question and filled from the same answer. After a refusal Current place is the one row that says so: a second row would have said the same words and opened the same Settings page. `NearRow` and its styles are deleted.
- **Back from Settings** (an `AppState` listener in `Body`, only after the app was in the background, so the location prompt, which only makes it inactive, does not load twice): the state is read again and a change loads as a tap does, so a refusal turned to While Using goes to finding, then to the place, by itself. Turned off with the sheet open, the fix and the list go with it.
- **The Hold** is not drawn under the row while it spins: the row's spinner is the nearby list's too (one answer). Under a typed term the Hold works as before.
- **The "nothing nearby" line** is now the row's line (§2), not a second line under it.
- The sheet's header comment and the `askLocation` comment say the one row; `placeSearch.ts`'s location heading says "asked only on a tap in the place search".

## 6. The notes, and what is left for Jan

- `wtt-37.txt` gains one line under New in this build, the row (with Precise Location on), the tap, the prompt on a first tap and the second tap after it, and what to report: **346** characters after its "- ", the file **3,606**.
- `review-notes-37.txt`'s Places paragraph said location is "asked only on a tap of Show places near me", which is no longer true. It now says "asked only on a tap of Current place". Earlier, to fit App Store Connect's 4,000 with both rows named, the same paragraph lost "search" after Apple Maps, "an" before address, and "or later" (now "iOS 18+"): **3,975** characters (`tournaments.test.mjs` counts it), the paragraph 458.
- **Not edited (docs/ is Jan's), now out of step:**
  - `docs/appstore.md` 505 to 506 and 516 to 517: "asked only on a tap of Show places near me" (the Places paragraph and the 5.1.1 note). There is no such row now; the review notes above have the new words.
  - `docs/support.md` 174 to 181: both mentions of **Show places near me** ("asks for your location" and "if you said no, tapping … opens it") should name **Current place**; the row is gone.
  - `docs/testflight.md` 101 ("or tap Show places near me (iOS asks for your location only then": it is Current place that asks now) and 189 to 192 ("Show places near me shows the system prompt", and "After Don't Allow, the same row reads 'Location is off for Sipply in Settings.'": both are now the Current place row).
- `modules/place-search/ios/PlaceSearchEngine.swift`'s comment says only `requestLocation` "(behind 'Show places near me')" can prompt. Still true of the function; the parenthesis is stale. Left alone: a change to a Swift file changes the native fingerprint, and the next build need not change it for a comment.
- **For the next native build** (not this one: JS only here): the cached fix (§3) should carry its age, or `currentCoordinate` should take a fresh one when the sheet opens, so a two-minute-old fix never names the bar before.
- `specs/v4.8-places/spec.md` 3.2's table is the v4.8 record and is not rewritten; this file is the change to it.

## 7. Checked, and what only a phone can check

Checked 30 Oct 2026 in the worktree: `npx tsc --noEmit`, `npx expo lint`, every `scripts/check-*.mjs` (artwork, contrast, design, ideas, intro-dock, phone, push, recommend), every build script's `--check` (ground, drink-photos, share-index, icons, fonts, numerals), `specs/v4.11/shop.test.mjs`, `specs/v4.11/tournaments.test.mjs`, `specs/v4.10/email-focus.test.mjs`, and `npx expo export -p ios --clear` to a temporary folder, since deleted. The search field's ancestors are untouched (the build 35 lesson): the row lives in the list's header, under the field, never around it.

On a phone (TestFlight), before this ships:

- Location already allowed: open Add place in a bar. The row shows the bar with its distance, spinning first; tap it, Tag this place shows its map, and the post says its name. It is not listed again under Near you.
- Never asked (delete and reinstall): one row, Current place over "Your location isn't sent to Sipply."; tap it, Allow While Using: the row fills, Near you lists the rest. Tap again: Tag this place.
- Don't Allow: one row, "Location is off for Sipply in Settings.", opening Settings; search by name still works. Turn it on there and come back without closing the sheet: the row finds the place by itself.
- Precise Location off: no row, the Precise Location line (naming your current place), search works.
- Indoors with a weak fix: "Can't tell which place you're in." rather than a guess, the venues under it.
- At home or in a park: "No bar or restaurant here." over Near you, or the 800 m line alone.
- Type a name with the row showing a venue: it stays on top with the suggestions under it; in the other states it goes. Type before it has found the place: it does not appear above the suggestions until the field is cleared. Press return on the place's own name: it is listed once.
- Two bars a door apart: the row picks the nearer; the map shows which before anything is tagged.
- VoiceOver: "Current place. Your location isn't sent to Sipply.", "Current place, finding where you are", then the announcement "Current place, La Factoría. 5 places"; on the row, "Current place, La Factoría, 30 ft", ", selected" on the chosen one.
