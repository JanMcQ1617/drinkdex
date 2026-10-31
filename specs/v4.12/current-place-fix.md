# v4.12 · Current place: no tap that does nothing

30 Oct 2026. Jan, on build 37: "I tried to click my current location but it doesnt let me do it." Which state the row was in is not known. This is every way a tap on **Current place** (specs/v4.11/current-place.md) could do nothing, most likely first, and what changed. JS only: no Swift, no package, nothing for prebuild, so the native fingerprint is build 37's.

| Piece | Where | State |
|---|---|---|
| The row's states, the load's number and its deadline, the field-clear re-ask | `src/components/places/PlaceSearchSheet.tsx` | changed |
| What to Test | `specs/v4.12/wtt-38.txt` | one line |
| `lib/placeSearch.ts`, `modules/place-search/ios` (read, not edited), `docs/` | | unchanged |

## 1. Why a tap could do nothing, most likely first

1. **"No bar or restaurant here." or "Can't tell which place you're in."** (`none`, `unsure`). `hereRow` drew `HereRow` with no `onPress`, and `HereRow` without one is a plain `View`: the same locate glyph, the same "Current place" in `body`, no press fill, no tap. It looked like every other row and was the only kind that did nothing. It is the answer whenever the nearest venue is more than 100 m (`HERE_RADIUS_M`) from the fix (Apple's point for a large venue can be), or the fix is worse than 100 m (`close` is false in `lib/placeSearch.currentCoordinate`, usual indoors on weak wifi), and at home, where a first try usually is.
2. **No fix, read as "nothing near".** Native's `currentCoordinate` gives up after 10 s (`PlaceSearchEngine.swift`, the `asyncAfter(.now() + 10)` in `currentCoordinate`) or CoreLocation fails (`didFailWithError`), and answers null; `loadNear` then set `{ status: 'ready', rows: [] }`, so the row said **"No bars or restaurants within 800 m. Search by name."**: untrue, and inert as in 1.
3. **Finding, for as long as Apple took.** `finding` was the same plain `View`, a spinner and no words. The fix has native's 10 s; `nearby()` does not: `run()` starts the `MKLocalSearch` with no deadline, so on a weak connection the row spun on and took no tap.
4. **Precise Location off.** No row at all: `here` was null and `locationBlock` drew a quiet `Text`, "Precise Location is off for Sipply, so your current place and places near you aren't listed. Search by name." A finger that went for "your current place" got nothing, and nothing led to the switch.
5. **Two loads at once.** Try again tapped twice, or the prompt's answer beside a return from Settings: native runs one `MKLocalSearch`, so the newer `nearby()` settles the older as superseded, and the older's `setNear({ status: 'idle' })` could land after the newer answer. `here` went null: the row and Near you vanished.
6. **Superseded, never asked again.** A suggestion's tap or the return key while the row was finding takes MapKit's one search; `nearby()` answers null, `near` goes idle, `here` is null. Clearing the field asked nothing, so the sheet showed neither the row nor Near you until it was reopened.
7. **A prompt that never answers** (`ask`). `askLocation` awaits native `requestLocation`, which waits for `locationManagerDidChangeAuthorization`; a second tap only joins native's waiting replies (`permissionReplies.count == 1`) and does not ask iOS again. If the prompt never showed, every later tap ticks and does nothing for the rest of the session. Unlikely (the purpose string is in `app.json`, and nothing else in the app suppresses the prompt), and native only (§4).

**Checked, not a cause.** The hit area: a full-width `Pressable`, 64 at least, nothing laid over it (the separator is inside the row and not drawn on the first). The keys: `keyboardShouldPersistTaps="handled"` on the `FlatList`, the only scroll view inside the Modal, so a tap on a `Pressable` lands with the keyboard up. The found row: `pick` → `choose` is synchronous and `locked` holds only while a row settles. `off`: `Linking.openSettings()`. The Places flag and the iOS 18 gate: `placesSupported() && placeSearchAvailable()` hides Add place itself, so a sheet that opened has passed both.

## 2. The row now

Every state but `finding` takes a tap, and `finding` says in words that it is busy.

| State | The row | A tap |
|---|---|---|
| `ask` | unchanged | asks. Allowed with Precise Location, the keys (up since the sheet opened) go down: the list is about to show, as on an open that already had it |
| `finding` | spinner, **"Finding where you are…"** | none, the one busy state. At 20 s (`FIND_WAIT_MS`: native's 10 for the fix, 10 for Apple) it ends: still no fix is `lost`; a fix but no answer from Apple is the list's Notice ("Couldn't search places…", Try again) and no row, as any search that did not answer |
| `found` | unchanged | Tag this place |
| `none`, `unsure` | unchanged words | the cursor goes to the field, to search by name |
| `lost` (new) | **"Couldn't find where you are. Try again."** | looks again (a fix CoreLocation delivered after native's 10 s is kept natively, so that second look is at once) |
| `off` | unchanged | Settings |
| `imprecise` (new) | **"Precise Location is off in Settings."**; the line under the field is gone | Settings; back with it on, the row finds the place by itself (the AppState listener already compared `precise`) |

- **Why `none` and `unsure` go to the field rather than look again.** Native serves the same fix for 120 s (`fixAt`), so a second look within two minutes spins and returns the same answer: a tap that looks as if it worked and did not. Typing the name is the one way left. When native can take a fresh fix (§4), `unsure` can look again instead.
- **Loads are numbered** (`loadSeq`): each `loadNear` takes the next number and only the newest may set anything; the deadline moves the number on, so a late answer cannot land.
- **Clearing the field after a superseded nearby asks again** (`onChangeText`, under two characters, `near` idle, allowed and precise), but not while a suggestion is settling, whose search it would cancel in turn: then the ask is owed (`nearOwed`) and made once the pick lets go of MapKit and the list is back (`payNear`: Back to search, or a pick that failed or was not a venue). Never as a pick is superseded, which may be the sheet going. Typing a term again cancels the debt.
- **The sheet gone, its loads stop.** An unmount moves `loadSeq` on, so a fix that comes after the sheet closed (native waits up to 10 s; closing cancels the search, not the fix) never goes on to `nearby()`, sends nothing to Apple and cannot take a reopened sheet's search. The watchdog, if it fires first, finds its load stale and sets nothing.
- **VoiceOver.** Labels still start with "Current place", so Voice Control's "Tap Current place" works in every state. `lost` is announced, "Current place. Couldn't find where you are. Try again." Hints: "Puts the cursor in the search field, to search by name", "Looks for where you are again", "Opens Settings".
- The new lines are 22 to 39 characters, no longer than "Location is off for Sipply in Settings.", which already shipped on one line, so the row keeps its 64. "No bars or restaurants within 800 m. Search by name." (52, unchanged) may already take two on a narrow phone.

## 3. What holds

- **Location is asked only on a tap of Current place**, unchanged: looking again is `currentCoordinate()`, which never prompts. `review-notes-37.txt`'s "asked only on a tap of Current place" stays true; the notes need no change.
- **Precise Location off is still never asked to upgrade** (v4.8 §5's rule: no `NSLocationTemporaryUsageDescriptionDictionary`, no system prompt). The row says the switch is off and a tap opens Sipply's Settings page, as the refused row already does. If Jan would rather it stay a line, `imprecise` goes back to `return null` with the old `Text`, nothing else depends on it.
- **The device's location never reaches Sipply**: nothing new crosses `lib/placeSearch`; still only a point and `close`.
- One hue, none of it red; no new key; Archivo `body` and `small`. The search field's ancestors are untouched (the build 35 lesson): the row is in the list's header, and `Keyboard.dismiss()` changes no style.

## 4. For the next native build (not this one)

- `currentCoordinate` should be able to skip the 120 s cache (a `fresh` argument), and not cache a fix worse than 100 m; better, keep updating for a few seconds and take the best fix until one is within 100 m. Then `unsure` is rarer and can offer a real second look. (The fix's age, spec v4.11 §6, is the same change.)
- `requestLocation`: call `requestWhenInUseAuthorization()` on every call while not determined (iOS ignores a repeat while the prompt is up), or settle waiting replies with the current state when the app becomes active, so a prompt that never answered cannot block every later ask (§1, 7).
- `run()`: a deadline on `MKLocalSearch` (about 10 s, then `ERR_PLACES_OFFLINE`), so the JS deadline is not the only one.
- `PlaceSearchEngine.swift` 11 and 165 still say "Show places near me" (spec v4.11 §6 left them: a comment is not worth a fingerprint change).

## 5. Not edited (docs/ is Jan's), now out of step

- `docs/testflight.md` 193: "Precise Location off shows its own line." It is now the Current place row, "Precise Location is off in Settings.", opening Settings. (Its 189 to 192 are already listed in spec v4.11 §6.)

## 6. Checked, and what only a phone can check

Checked 30 Oct 2026 in the worktree: `npx tsc --noEmit`, `npx expo lint`, every `scripts/check-*.mjs`, every build script's `--check`, `specs/v4.11/shop.test.mjs`, `specs/v4.11/tournaments.test.mjs`, `specs/v4.10/email-focus.test.mjs`, and `npx expo export -p ios --clear` to a temporary folder, since deleted.

Needs Jan: **a screenshot of the row when the tap does nothing**, and what Settings → Sipply → Location says (Never, Ask Next Time, While Using; Precise Location on or off). The row's line says which of §1 it was; if it was the venue's own name and the tap still did nothing, none of §1 explains it and it needs a screen recording.

On a phone (TestFlight), before this ships:

- At home: "No bar or restaurant here." (or the 800 m line); tap it: the keyboard comes up in the search field.
- Indoors with a weak fix: "Can't tell which place you're in."; tap it: the same.
- Airplane mode with location on: "Finding where you are…", then within about 20 s "Couldn't find where you are. Try again." or the Couldn't search places notice; tap: it looks again.
- Precise Location off for Sipply: the row reads "Precise Location is off in Settings."; tap: Settings. Turn it on, come back without closing the sheet: the row finds the place.
- Never asked: tap, Allow While Using: the keys go down, the row finds the place, a second tap opens Tag this place.
- Type a name while the row is finding, tap a suggestion, Back to search, clear the field: the row and Near you come back.
- Type a name, tap a suggestion and clear the field while it spins; Back to search: the row and Near you come back.
- In a bar: unchanged from v4.11 (the row names it; tap; Tag this place).
