# v4.12 · Current place: no tap that does nothing

30 Oct 2026. Jan, on build 37: "I tried to click my current location but it doesnt let me do it." Which state the row was in was not known at first. This is every way a tap on **Current place** (specs/v4.11/current-place.md) could do nothing, most likely first, and what changed.

**Later the same day, confirmed by Jan: it was the ask** (§1, 7). The row showed only "Current place", and a tap did nothing: no iOS prompt, no change. Permission was never answered (`.notDetermined`), the purpose string is in the built `Info.plist`, so the prompt was asked for and never shown, and build 37's native waits for it for good. Build 38 is a full native build (prebuild `--clean` and an archive), so the fix is native as well as JS (§4).

One caution for the phone check: in build 37 the only row with no line under "Current place" was `finding` (a spinner where the locate glyph is). `ask` had "Your location isn't sent to Sipply." under it. If the row Jan saw had a spinner, it was `finding`, which §2's `FIND_WAIT_MS` and §4's search deadline end; if it had the glyph, it was `ask`.

| Piece | Where | State |
|---|---|---|
| The row's states (`missed`, `servicesOff` new), the ask's deadline, the load's number and its deadline, the field-clear re-ask | `src/components/places/PlaceSearchSheet.tsx` | changed |
| `services_off` in `LocationPermission` | `src/lib/placeSearch.ts` | changed |
| `requestLocation` (services check, re-ask, safety net), the 100 m fix cache, `run()`'s deadline, two stale comments | `modules/place-search/ios/PlaceSearchEngine.swift` | changed |
| What to Test | `specs/v4.12/wtt-38.txt` | one line |
| `PlaceSearchModule.swift`, `PlaceMapView.swift`, `app.json` (`Info.plist`), `docs/` | | unchanged |

## 1. Why a tap could do nothing, most likely first

1. **"No bar or restaurant here." or "Can't tell which place you're in."** (`none`, `unsure`). `hereRow` drew `HereRow` with no `onPress`, and `HereRow` without one is a plain `View`: the same locate glyph, the same "Current place" in `body`, no press fill, no tap. It looked like every other row and was the only kind that did nothing. It is the answer whenever the nearest venue is more than 100 m (`HERE_RADIUS_M`) from the fix (Apple's point for a large venue can be), or the fix is worse than 100 m (`close` is false in `lib/placeSearch.currentCoordinate`, usual indoors on weak wifi), and at home, where a first try usually is.
2. **No fix, read as "nothing near".** Native's `currentCoordinate` gives up after 10 s (`PlaceSearchEngine.swift`, the `asyncAfter(.now() + 10)` in `currentCoordinate`) or CoreLocation fails (`didFailWithError`), and answers null; `loadNear` then set `{ status: 'ready', rows: [] }`, so the row said **"No bars or restaurants within 800 m. Search by name."**: untrue, and inert as in 1.
3. **Finding, for as long as Apple took.** `finding` was the same plain `View`, a spinner and no words. The fix has native's 10 s; `nearby()` does not: `run()` starts the `MKLocalSearch` with no deadline, so on a weak connection the row spun on and took no tap.
4. **Precise Location off.** No row at all: `here` was null and `locationBlock` drew a quiet `Text`, "Precise Location is off for Sipply, so your current place and places near you aren't listed. Search by name." A finger that went for "your current place" got nothing, and nothing led to the switch.
5. **Two loads at once.** Try again tapped twice, or the prompt's answer beside a return from Settings: native runs one `MKLocalSearch`, so the newer `nearby()` settles the older as superseded, and the older's `setNear({ status: 'idle' })` could land after the newer answer. `here` went null: the row and Near you vanished.
6. **Superseded, never asked again.** A suggestion's tap or the return key while the row was finding takes MapKit's one search; `nearby()` answers null, `near` goes idle, `here` is null. Clearing the field asked nothing, so the sheet showed neither the row nor Near you until it was reopened.
7. **A prompt that never answers** (`ask`). **Confirmed: the one Jan hit.** `askLocation` awaits native `requestLocation`, which waits for `locationManagerDidChangeAuthorization`; a second tap only joins native's waiting replies (`permissionReplies.count == 1`) and does not ask iOS again. If the prompt never showed, every later tap ticks and does nothing for the rest of the session. First thought unlikely (the purpose string is in `app.json`, and nothing else in the app suppresses the prompt). The likeliest way it happens: Location Services off for the whole phone (Settings → Privacy & Security → Location Services), where an app never asked can still read `.notDetermined` while `requestWhenInUseAuthorization()` shows nothing and calls nothing back. Otherwise a request iOS dropped. Neither is reproduced here (no phone; §6 has the check). Fixed in native and JS, whichever it was (§2, §4).

**Checked, not a cause.** The hit area: a full-width `Pressable`, 64 at least, nothing laid over it (the separator is inside the row and not drawn on the first). The keys: `keyboardShouldPersistTaps="handled"` on the `FlatList`, the only scroll view inside the Modal, so a tap on a `Pressable` lands with the keyboard up. The found row: `pick` → `choose` is synchronous and `locked` holds only while a row settles. `off`: `Linking.openSettings()`. The Places flag and the iOS 18 gate: `placesSupported() && placeSearchAvailable()` hides Add place itself, so a sheet that opened has passed both.

## 2. The row now

Every state but `finding` takes a tap, and `finding` says in words that it is busy.

| State | The row | A tap |
|---|---|---|
| `ask` | unchanged; while an ask is out the locate glyph is a spinner | asks, again on every tap (still a button with its press fill while it spins: native asks iOS again). Allowed with Precise Location, the keys (up since the sheet opened) go down: the list is about to show, as on an open that already had it |
| `missed` (new) | **"The location prompt didn't open. Try again."**, and a **Settings** text key on the far gutter | the row asks again; Settings opens Sipply's page. Shown when an ask ends still `undetermined`: native's 3 s, or the sheet's own `ASK_WAIT_MS` (8 s, a backstop) |
| `servicesOff` (new) | **"Location Services are off"** over **"Settings → Privacy & Security → Location Services"** | Settings (Sipply's page: the system-wide switch has no public URL, and `App-Prefs:` URLs are private, so not used). Back from Settings the state is read again and the row is `ask`; a tap with the switch on gets the prompt |
| `finding` | spinner, **"Finding where you are…"** | none, the one busy state. At 20 s (`FIND_WAIT_MS`: native's 10 for the fix, 10 for Apple) it ends: still no fix is `lost`; a fix but no answer from Apple is the list's Notice ("Couldn't search places…", Try again) and no row, as any search that did not answer |
| `found` | unchanged | Tag this place |
| `none`, `unsure` | unchanged words | the cursor goes to the field, to search by name |
| `lost` (new) | **"Couldn't find where you are. Try again."** | looks again (a fix CoreLocation delivered after native's 10 s is kept natively, from build 38 only when within 100 m, so that second look is at once) |
| `off` | unchanged | Settings |
| `imprecise` (new) | **"Precise Location is off in Settings."**; the line under the field is gone | Settings; back with it on, the row finds the place by itself (the AppState listener already compared `precise`) |

- **Every ask ends** (`askLocation`). The answer comes whatever happens: the prompt's; `services_off` at once; or `undetermined`, no prompt came, from native's 3 s or, should native ever not answer, the sheet's `ASK_WAIT_MS`, which reads `locationState()` afresh rather than assume. (A backstop, not for build 37: `runtimeVersion` is the `fingerprint` policy in `app.json`, `modules/place-search/ios` is one of its sources, and §4 changes it, so no update brings this JS to build 37's native.) Both waits count only while the app stays active: the prompt makes the app inactive, so nothing is decided while it is up, and back to active with no answer the wait starts again. Native answers every waiting ask at once, so only the newest ask may set anything (`askSeq`); a native answer after the sheet's deadline still lands (it is the prompt's), once (`decided`). Closing the sheet stops an ask's deadline and listener (`askStop`).
- **A prompt that opens late.** If iOS shows it after native's 3 s, native has already answered `undetermined` and the prompt's answer reaches no one. So after a `missed` ask, with none out since, coming back from inactive also reads the state (the AppState listener, which otherwise waits for background), and an answer loads the row as a tap does. Both marks are refs (`lateAsk`, `appAway`), set as the ask answers, since the listener subscribes again in the render that turns the row `missed` and the prompt's inactive can reach the one it replaces; already inactive as `undetermined` lands, the prompt opened just after native answered, and its return is read too. Nothing changed on that read, it reads once more `REREAD_MS` (1 s) later, since CoreLocation may apply the answer just after the app is back (native's fresh `promptWait` allows the same); a return from Settings gets the second read too.
- **Why `none` and `unsure` go to the field rather than look again.** Native serves the same fix for 120 s (`fixAt`), so a second look within two minutes spins and returns the same answer: a tap that looks as if it worked and did not. Typing the name is the one way left. Build 38's native no longer holds a fix worse than 100 m (§4), so a second look after `unsure` would take a fresh one-shot fix; but from the same spot moments later that is most often as coarse (CoreLocation already answered with the best it had in time), so the row still goes to the field until native keeps updating for a close fix (§4, a later build). Reopening the sheet does take a fresh fix now.
- **Loads are numbered** (`loadSeq`): each `loadNear` takes the next number and only the newest may set anything; the deadline moves the number on, so a late answer cannot land.
- **Clearing the field after a superseded nearby asks again** (`onChangeText`, under two characters, `near` idle, allowed and precise), but not while a suggestion is settling, whose search it would cancel in turn: then the ask is owed (`nearOwed`) and made once the pick lets go of MapKit and the list is back (`payNear`: Back to search, or a pick that failed or was not a venue). Never as a pick is superseded, which may be the sheet going. Typing a term again cancels the debt.
- **The sheet gone, its loads stop.** An unmount moves `loadSeq` on, so a fix that comes after the sheet closed (native waits up to 10 s; closing cancels the search, not the fix) never goes on to `nearby()`, sends nothing to Apple and cannot take a reopened sheet's search. The watchdog, if it fires first, finds its load stale and sets nothing.
- **VoiceOver.** Labels still start with "Current place", so Voice Control's "Tap Current place" works in every state, `servicesOff` included (its first line is "Location Services are off"; the label is "Current place. Location Services are off. Turn them on in Settings, Privacy & Security, Location Services."). `lost`, `missed` and `servicesOff` are announced; `missed` is withdrawn while a Try again is out, so one that ends with no prompt either is announced again (`useAnnounce` speaks only a change). An ask out reads busy when the row is read; it is not announced, since the prompt that normally follows is. `missed`'s Settings key is a separate button beside the row, not inside it, so VoiceOver and Voice Control reach it on its own ("Opens Sipply in Settings"). Hints: "Puts the cursor in the search field, to search by name", "Looks for where you are again", "Asks to use your location again", "Opens Settings".
- The new lines are 22 to 39 characters, no longer than "Location is off for Sipply in Settings.", which already shipped on one line, so the row keeps its 64. "No bars or restaurants within 800 m. Search by name." (52, unchanged) may already take two on a narrow phone. `missed`'s line (43, beside its Settings key) and `servicesOff`'s path (49) are longer and may take two lines; the row then grows past 64. Both are states nobody sits in, so the height they add was left alone.

## 3. What holds

- **Location is asked only on a tap of Current place**, unchanged: looking again is `currentCoordinate()`, which never prompts. The ask's new parts ask nothing of the person: `locationServicesEnabled()` is a read, the safety net only answers what is waiting, and the sheet's deadline reads `locationState()`. A second tap asks iOS again, which can only show the same When In Use prompt the first tap asked for. Opening the sheet still only reads the permission. `review-notes-38.txt`'s "asked only on a tap of Current place" stays true; the notes need no change.
- **When In Use only, no new `Info.plist` key.** `Info.plist` keeps its one location key (`NSLocationWhenInUseUsageDescription`); no Always request, no `startUpdatingLocation`, no print (spec v4.8 §6.1's grep finds nothing). The engine still imports only MapKit, CoreLocation and Foundation: UIApplication's two notifications are named by their string values, as its error domains are (each checked against UIKit's `rawValue`).
- **Precise Location off is still never asked to upgrade** (v4.8 §5's rule: no `NSLocationTemporaryUsageDescriptionDictionary`, no system prompt). The row says the switch is off and a tap opens Sipply's Settings page, as the refused row already does. If Jan would rather it stay a line, `imprecise` goes back to `return null` with the old `Text`, nothing else depends on it.
- **The device's location never reaches Sipply**: nothing new crosses `lib/placeSearch`; still only a point and `close`.
- One hue, none of it red; one new key, `missed`'s Settings, a plain text key; Archivo `body` and `small`. The search field's ancestors are untouched (the build 35 lesson): the row is in the list's header, and `Keyboard.dismiss()` changes no style.

## 4. Native, in build 38

Build 38 is a full native build, so the native half of §1, 7 and the cheap follow-ups are in it (`PlaceSearchEngine.swift`; the glue, `PlaceSearchModule.swift`, is unchanged).

- **`requestLocation`, every ask ends.**
  - While `.notDetermined`, `CLLocationManager.locationServicesEnabled()` is read on a background queue (Apple warns it can block the UI on main), then back on main before anything is touched. Off: every waiting reply gets `{ permission: "services_off", precise: false }` at once.
  - On: `requestWhenInUseAuthorization()` on every ask, not only the first waiting one (iOS ignores a repeat while the prompt is up); every reply waits together and one answer settles them all (`settlePermission`). Each ask moves the ticket on as it joins, so a wait armed by an earlier ask cannot settle it while its services check is out, before it has asked iOS.
  - Safety net: `promptWait` (3 s) after each ask, if no authorization change came and the app never went inactive, the waiting replies get the state as it is (still `undetermined`). The prompt makes the app inactive (`UIApplicationWillResignActiveNotification`), so while it is up nothing is settled early; back to active (`UIApplicationDidBecomeActiveNotification`) with replies still waiting, a fresh 3 s starts, which leaves the delegate its moment to answer first. Each wait has a ticket, so only the newest can settle.
- **The fix cache keeps only a fix within 100 m** (`kCLLocationAccuracyHundredMeters`, the JS `CLOSE_FIX_M`). A worse one answers its own ask and is not served again for 120 s, so a later look (reopening the sheet, `lost`'s Try again) takes a fresh fix that may be close enough. JS `unsure` still goes to the field rather than look again (§2: a one-shot fix moments later is most often as coarse).
- **`run()` has a deadline**: an `MKLocalSearch` still out after `searchWait` (10 s) is cancelled and answers `ERR_PLACES_OFFLINE` (`timedOut`), which JS already reads as "Couldn't search places…" with Try again. The reply is let go before the cancel, and the identity check keeps a late callback from settling anything. This covers picks and the return key's search too.
- The two "Show places near me" comments now name Current place.

Still for a later native build: `currentCoordinate` with a `fresh` argument, or a few seconds of updates keeping the best fix until one is within 100 m. Then `unsure` is rarer and can offer a real second look. (The fix's age, spec v4.11 §6, is the same change.)

## 4a. How each way of not answering now ends

| What happens after the tap | Build 38 (native and JS) |
|---|---|
| The prompt shows and is answered | the answer, as before |
| Location Services off for the whole phone | `servicesOff` within a moment of the tap |
| The ask is dropped, no prompt | `missed` after 3 s |
| The prompt shows after 3 s | `missed`, then the prompt; its answer is read on the way back from it |
| The prompt is up for a long time | nothing decided while it is up; the answer when it comes |
| The app goes inactive for something else mid-ask | a fresh wait once back |
| The sheet closes mid-ask | nothing lands; native's replies settle into nothing |

No column for build 37's native under a JS update: that pairing cannot happen (`fingerprint` runtime version, §2).

## 5. Not edited (docs/ is Jan's), now out of step

- `docs/testflight.md` 193: "Precise Location off shows its own line." It is now the Current place row, "Precise Location is off in Settings.", opening Settings. (Its 189 to 192 are already listed in spec v4.11 §6.)

## 6. Checked, and what only a phone can check

Checked 30 Oct 2026 in the worktree: `npx tsc --noEmit`, `npx expo lint`, every `scripts/check-*.mjs`, every build script's `--check`, `specs/v4.11/shop.test.mjs`, `specs/v4.11/tournaments.test.mjs`, `specs/v4.10/email-focus.test.mjs`, `specs/v4.12/join-codes.test.mjs`, and `npx expo export -p ios --clear` to a temporary folder, since deleted. The engine, as spec v4.8 §6.1 asks: `xcrun --sdk iphoneos swiftc -typecheck -swift-version 5` at `-target arm64-apple-ios16.4` and `arm64-apple-ios26.0` against iPhoneOS27.1 print nothing, `swiftc -parse` is clean, and the §6.1 grep finds nothing. Not checked here: the glue and the pod together (no prebuild, no archive in this pass), so the archive is the first full compile. All of it run again after the review's fixes (the late-prompt marks as refs and the second read, `missed` heard again after a Try again, the ticket moved on as an ask joins, the build 37 comments), all clean; and `@expo/fingerprint` lists `modules/place-search/ios` among the iOS fingerprint's sources (`expoAutolinkingIos`), which is why this JS never meets build 37's native.

From Jan, answered: the row was the ask (top of this file). Still useful: whether Location Services were on for the whole phone (Settings → Privacy & Security → Location Services) when it happened, which says which of §1, 7's two ways it was. If a tap on any row still does nothing on build 38, a screenshot of the row and a screen recording.

On a phone (TestFlight), before this ships:

- At home: "No bar or restaurant here." (or the 800 m line); tap it: the keyboard comes up in the search field.
- Indoors with a weak fix: "Can't tell which place you're in."; tap it: the same.
- Airplane mode with location on: "Finding where you are…", then within about 20 s "Couldn't find where you are. Try again." or the Couldn't search places notice; tap: it looks again.
- Precise Location off for Sipply: the row reads "Precise Location is off in Settings."; tap: Settings. Turn it on, come back without closing the sheet: the row finds the place.
- Never asked: tap, Allow While Using: the glyph spins until the prompt is up, then the keys go down, the row finds the place, a second tap opens Tag this place. (To be never asked again on a phone that was: delete Sipply and install it from TestFlight, or Settings → General → Transfer or Reset iPhone → Reset → Reset Location & Privacy.)
- Never asked, Location Services off for the whole phone: tap: at once "Location Services are off" over the Settings path; tap: Sipply's Settings page. Turn Location Services on, come back without closing the sheet: the row is the ask again; tap: the prompt.
- Never asked, the prompt left up for a minute before answering: nothing changes under it, and the answer loads the row.
- Never asked, Don't Allow: "Location is off for Sipply in Settings."; tap: Settings.
- `missed` cannot be made to happen on purpose; if it shows ("The location prompt didn't open. Try again."), tap the row once, then Settings, and note both. With VoiceOver on, a Try again that ends in `missed` again is heard again. If the prompt opens a moment after `missed` shows, answer it: the row loads by itself.
- Type a name while the row is finding, tap a suggestion, Back to search, clear the field: the row and Near you come back.
- Type a name, tap a suggestion and clear the field while it spins; Back to search: the row and Near you come back.
- In a bar: unchanged from v4.11 (the row names it; tap; Tag this place).
