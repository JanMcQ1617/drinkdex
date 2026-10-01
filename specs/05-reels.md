# 05 — Short videos ("Clips"; `reels` in code)

Record up to 30 seconds in the app, post it with a caption and an optional
Dex tag, and watch everyone's in a full-screen vertical pager. Built on the
existing Supabase project, capped by size and count, and moderated the same
way posts are.

> **Cross-check reconciliation (30 Sep 2026). Binding; it overrides the sections below wherever they differ.**
> - **Packages (`00-build-plan.md`).** **B1** (stage 1) owns `lib/reels.ts`, `lib/reelMedia.ts`, `store/reels.ts`, `app.json` and `.env`. **C5** (stage 2) owns `(tabs)/reels.tsx`, `record.tsx`, `reel/[id].tsx` and `components/reels/*` (ReelPager, ReelCell, ReelVideo, RecordButton, Recorder, ReelReview, CameraGate, DrinkTagSheet). **A2** writes the migration, `schema.sql`, the 012 header line, `database.types.ts`, `lib/supabase.ts` (the two exports), `lib/social.ts` (bucket-aware signed URLs, `primeSignedUrls`) and `lib/moderation.ts` (`reportReel`). **A1** adds the §10 tokens, glyphs, `onDark` (plus `onDarkText`) and contrast pairs. **B3** makes the §11 `store/auth.ts` edits. **C1** does `Grain.tsx`, `(tabs)/_layout.tsx`, `FloatingTabBar.tsx` and the `_layout.tsx` Stack.Screens. **C7** ships the deletion copy. **C8** writes the docs.
> - **Migration number: 019** (`019_reels.sql`, version `'019_reels'`). It still depends only on 011–013; the number is just the slot after 016–018.
> - **The tab bar goes dark on Clips** (01 §6.3, owner of the bar), overriding §7.1's "unchanged light glass": there is no glass in v2. **Stats becomes a pushed screen opened from the Dex top bar** (01 §6.1), not part of Profile.
> - **No `ReelControl.tsx`**: import `MediaIconButton` from `ui.tsx` (01 §5.2; 44×44, `radius.control`, opacity 0.8 pressed, no scale). **No `ReelTile.tsx` / `useReelsByAuthor`**: the profile Clips grid is 03's `VideoGrid` fed by `components/profile/videosSource.ts`, which calls `fetchReelsByAuthor` and reads `reelsVersion` (§8.1 rewritten below). **No `lib/drinkSearch.ts` from this spec**: B2 writes it with 04's superset API; `DrinkTagSheet` imports `searchCatalogue` from it.
> - **`useSignedPhoto` moves to `src/lib/useSignedPhoto.ts`** (A2) with the `bucket` argument; `PostCard.tsx` re-exports it. C5 imports it from `@/lib/useSignedPhoto`.
> - **The icon is `reels`**, drawn as §10.2's `reel` (01 §14.3). There is no glyph named `reel`.
> - **No `removeClippedSubviews` on the pager** (06 rule 5): on iOS Fabric it can leave the list blank. Windowing props bound what is mounted.
> - **Text on dark is Inter:** the Clips header title is `textRole.barTitleLg`, primer and state titles `textRole.emptyTitle` (01 §8). Secondary buttons on dark ("Not now", "Done") are `variant="onDarkText"`; wine `text` buttons are invisible on `reelGround`.
> - **Radii and edges:** `radius.sm` → `radius.control`; `radius.md` → `radius.card` (review panel top corners) or `radius.control` (mute flash); the timer and Follow chips' "radius 6" → `radius.control`; `cardBorder` → `line`. Only the shutter core keeps literal radii (`// round-ok: shutter`, and the stop square's 6).
> - **Nothing that must disappear depends on an animation finishing** (06): the overlays hide and show **instantly** on long press (no 150 ms opacity), and the mute flash and heart burst are **unmounted by a JS `setTimeout`** (flash 820 ms, burst 700 ms) even if their fade stalls.
> - **Holds:** `CameraGate` shows `<Hold tone="dark" slowMessage="Still checking camera access." />` while the permission hooks are `null` (06 rule 3: no featureless hold). The first-page load is `<Hold tone="dark" slowMessage="Still loading clips." />`.
> - **Signed out**, the Clips tab shows 02's cream sign-in screen; the status-bar effect (`setStatusBarStyle('light')`) runs only inside the gated feed component, and the bar stays paper (01 §6.3).
> - **Account change:** `store/reels.ts` resets itself by subscribing to `useAuth` (user id changed, including sign-out), so `store/auth.ts` (B3) never imports the clips store. Settings needs no clips call on sign-out.
> - **Gated routes** `/record` and `/reel/[id]` pass `onClose` that leaves the route (02 reconciliation 9).

Everything here was checked against the code on branch `reels-and-redesign`
(expo-camera 57.0.6, expo-video 57.0.5, expo-file-system 57, migrations
through 015). Where a library behaves in a way that is easy to get wrong,
the file and line it was read from are named.

---

## 0. Decisions, one line each

| # | Decision | Why |
|---|---|---|
| D1 | The user-facing name is **Clips**; tables, bucket, routes and files keep `reels`. All visible strings live in one `COPY` object in `src/lib/reels.ts`. | "Reels" is Instagram's product name, and "Shots" would read as a drink category in this app. Swapping is a one-file change if Jan prefers another word (open question). |
| D2 | Container is the **.mov** iOS writes, stored as `reels/<uid>/<reelId>.mov`, `video/quicktime`. The bucket also allows `video/mp4` for a future Android/transcode path. | `AVCaptureMovieFileOutput` writes QuickTime (`CameraVideoRecording.swift`: `generatePathInCache(... extension: ".mov")`); there is no transcoder in the app, and naming it `.mp4` would lie about the container. AVPlayer plays it natively. |
| D3 | Codec **HEVC (`hvc1`)**, falling back to H.264 (`avc1`) when `CameraView.getAvailableVideoCodecsAsync()` lacks `hvc1`. `videoBitrate` 1,100,000 b/s, `videoQuality="720p"`. | At a 5 MB cap HEVC looks like H.264 at about twice the bitrate; every iPhone that can encode it can decode it, and Sipply is iOS-only. On iOS the bitrate is **ignored unless a codec is passed to `recordAsync`** (`CameraVideoRecording.swift`, `setVideoOptions`). |
| D4 | `recordAsync({ maxDuration: 30, maxFileSize: 5_000_000, codec })`; bucket ceiling 6 MiB. | 30 s × (1.10 video + ≤0.128 audio) Mb/s ≈ 4.6 MB, so `maxFileSize` is a backstop that only bites if the encoder overshoots; the bucket limit is the server's hard stop with headroom. |
| D5 | Upload with **`File.upload()` from expo-file-system** straight to the Storage REST endpoint with the user's JWT, binary body, `sessionType: 'background'`, determinate progress, `AbortController` cancel. | Native URLSession upload: progress events, survives a quick app switch, and never loads 5 MB into the JS heap. RLS applies at upload time because the request carries the user's token. |
| D6 | The reel id is generated on the phone (`Crypto.randomUUID()`), the files are named after it, and the row's CHECK constraints require `video_path` to equal `<author_id>/<id>.mov` (or `.mp4`) and `poster_path` to equal `<author_id>/<id>.jpg`. | A row can only ever point at files in its author's folder named for that row, which is what deletion, moderation and the account sweep all assume (the 014 lesson, made structural). |
| D7 | Poster frame is made on the phone: `player.generateThumbnailsAsync(t, { maxWidth: 720 })` → `ImageManipulator.manipulate(thumb).renderAsync()` → `saveAsync({ format: JPEG, compress: 0.72 })`. Stored beside the video as `<id>.jpg`. | No server-side processing exists; both APIs are already in the binary, and a re-encoded JPEG carries no EXIF. |
| D8 | Server quotas: **10 clips per rolling 24 h, 100 live clips per account**, and Storage refuses an upload when the folder holds more than `2 × live + 4` files. | Bounds what one account can cost the free tier (≤ ~500 MB worst case) and makes orphan-file abuse impossible; numbers live in two SQL functions and one TS constant. |
| D9 | Clips a user has **reported disappear for that user** at the RLS level (`private.my_reported_reels()`), on top of the block set. | A report that leaves the clip autoplaying in front of the reporter reads as "nothing happened"; doing it in RLS also hides it on profiles and survives relaunch. |
| D10 | Viewer = one vertical `FlatList` with `pagingEnabled`; **players exist only for the visible clip and its two neighbours** (mount/unmount, not a pool), all released when the screen loses focus. | At most 3 AVPlayers, preloading the next for free, and nothing decoding behind another tab. |
| D11 | Taps use plain `Pressable` with a 250 ms double-tap window (single = mute, double = like, long press = pause). No react-native-gesture-handler. | The app has no `GestureHandlerRootView`; wrapping the root to get a double tap is a whole-app change for one screen. |
| D12 | Global feed, newest first, keyset-paged by `(created_at, id)`, 8 per page. No ranking, no "Following" filter in v1. | With a few hundred clips, recency is the honest order; ranking needs signals the app does not collect. |
| D13 | Recording lives in a new full-screen modal route `/record` (camera → review → post in one screen, internal state), opened from the camera button in the Clips header and from the profile's Clips empty state. The centre **+** stays "Log a pour". | Keeps the recorded file in component state instead of route params, and does not overload the one button whose meaning is settled. |
| D14 | Feature flag `EXPO_PUBLIC_REELS` (`on` shows Clips; anything else hides the tab, the profile section and `/record`). | Same pattern as the Apple/Facebook flags: the native build with expo-camera can ship before the migration and Jan's on-device check, and turning it on later is a JS-only update. |
| D15 | Clips start **with sound on**; mute is one session-wide toggle (not persisted); `audioMixingMode: 'auto'`. | The format is made with sound; `auto` lets other apps' audio keep playing while a clip is muted. |
| D16 | Signed URLs stay at **1 hour**, memoised in memory only (the existing cache, generalised to a bucket argument). Not persisted, not longer-lived. | A longer-lived URL would keep a blocked person able to fetch a clip for its lifetime, undoing the block-aware Storage policy. |

---

## 1. Scope

**In v1:** permission priming; recorder (front/back, torch, tap or hold, 30 s ring, 1 s minimum); review (loop, mute, caption ≤ 300, optional Dex tag, Retake/Post, progress, cancel); upload with poster; `public.reels` + `public.reel_likes`; RLS; content filter; quotas; report/block/delete own; Clips tab pager; pushed author pager `/reel/[id]`; Clips on own and others' profiles; account-deletion sweep; budget monitoring; App Store and privacy updates.

**Not in v1 (say so if asked):** comments on clips; share (there is no link that opens a clip yet, and text-only share of a video is noise); save to camera roll (needs expo-media-library, a new native module); zoom, filters, music, multi-segment recording, uploading from the library; ranking; "Following" filter; view counts; clips in the Home feed; clips on the drink page; tagging a custom (user-submitted) drink — only Dex ids can be tagged until Jan adds the drink to `drinks.json`; location (the location spec will add its own nullable column later).

---

## 2. Files and owners

Owners: **R** = whoever builds this spec. **D** = design-system/navigation owner (theme, primitives, icons, tab bar). **P** = profile owner. **A** = auth/settings owner. Where a file belongs to D, P or A, that file's owning package in `00-build-plan.md` makes the edit from the hunk below. R never edits another package's file (the old "if their spec is not in flight, R edits it directly" is withdrawn: it would put one file in two packages).

### Create (R)

| File | What |
|---|---|
| `supabase/migrations/019_reels.sql` (A2) | Section 5, verbatim. Number fixed by the cross-check (016 sign-in lookup, 017 home and profile, 018 drink submissions, 019 this); nothing here depends on anything after 015. |
| `src/lib/reels.ts` | Data layer, constants and `COPY` (section 6.1). |
| `src/lib/reelMedia.ts` | Codec choice, poster generation, camera-cache pruning (section 4.5). |
| `src/store/reels.ts` | Zustand store for the Clips feed (section 6.2). |
| `src/app/(tabs)/reels.tsx` | The Clips tab (section 7). |
| `src/app/reel/[id].tsx` | Pushed pager for one author's clips, opened from a profile tile (section 8.2). |
| `src/app/record.tsx` | Full-screen modal: permission → camera → review → post (section 4). |
| `src/components/reels/ReelPager.tsx` | Shared vertical pager (tab and `/reel/[id]`). |
| `src/components/reels/ReelCell.tsx` | One page: poster, video, overlays, taps. |
| `src/components/reels/ReelVideo.tsx` | The player wrapper (mounted only near the visible page). |
| ~~`src/components/reels/ReelControl.tsx`~~ | **Not created**: `MediaIconButton` in `ui.tsx` (01 §5.2) is this control. |
| `src/components/reels/RecordButton.tsx` | Shutter with progress ring. |
| `src/components/reels/Recorder.tsx` | Camera phase of `/record`. |
| `src/components/reels/ReelReview.tsx` | Review/post phase of `/record`. |
| `src/components/reels/CameraGate.tsx` | Permission priming and the quota gate. |
| `src/components/reels/DrinkTagSheet.tsx` | Dex picker for the optional tag. |
| ~~`src/components/reels/ReelTile.tsx`~~ | **Not created**: 03's `profile/VideoGrid.tsx` draws the 9:16 tile (§8.1). |
| `src/lib/drinkSearch.ts` (**B2**, not this spec) | Drink search lifted **verbatim** out of `src/app/log.tsx` (`fold`, `WORD_CHAR`, `atWordStart`, `SEARCH_INDEX`, the ranking function, `MAX_RESULTS`). B2 writes it once in stage 1 with 04's superset API; this spec only imports it (`searchCatalogue` for `DrinkTagSheet`). C6 switches `log.tsx` over. |

### Change

| File | Owner | Hunk |
|---|---|---|
| `app.json` | R | expo-camera plugin, image-picker microphone fix, privacy manifest (section 3). |
| `.env` | R | `EXPO_PUBLIC_REELS=off` with a comment block in the style of the existing flags (section 3.4). |
| `src/lib/supabase.ts` | R | Export the two values already read: `export const SUPABASE_URL = url; export const SUPABASE_KEY = key;` |
| `src/lib/social.ts` | R | Signed-URL cache takes a bucket (section 6.3). |
| `src/lib/useSignedPhoto.ts` (new, A2) | A2 | `useSignedPhoto(path, retryKey, bucket = 'pours')` moved out of `PostCard.tsx` with the bucket argument; `PostCard.tsx` (C3) re-exports it. |
| `src/lib/moderation.ts` | R | `reportReel` (section 9.1). |
| `src/lib/database.types.ts` | R | `ReelRow`, `ReelLikeRow`, `reported_reel_id`, `my_reel_quota` (section 5.4). |
| `supabase/schema.sql` | A2 | Fold 019 in, same commit, and add `('019_reels', 'contained in schema.sql')` to the bottom insert (the file's own KEEPING IT IN STEP rule). |
| `supabase/migrations/012_report_retention.sql` | R | Header only, one line: `-- Since 019: do not re-run. It would drop reports_reported_reel_id_fkey and put back the two-subject prepare_report, which refuses every clip report.` |
| `src/app/_layout.tsx` | R | Two `Stack.Screen`s (section 7.1). |
| `src/components/Grain.tsx` | D | Return `null` on clip screens (section 7.1). |
| `src/constants/theme.ts` | D | Clip tokens (section 10.1). |
| `scripts/check-contrast.mjs` | D | Six pairs (section 10.1). |
| `src/components/icons.tsx` | D | Six glyphs, `TabName` gains `'reels'` (section 10.2). |
| `src/components/ui.tsx` | D | `Button` variant `onDark` (section 10.3). |
| `src/app/(tabs)/_layout.tsx` | D | `Tabs.Screen name="reels"` (section 7.1). |
| `src/components/FloatingTabBar.tsx` | D | Skip the `reels` route when the flag is off (section 7.1). |
| `src/components/profile/videosSource.ts`, `VideoGrid.tsx` | P (C4) | The Clips tab on profiles (section 8.1, as rewritten). `profile.tsx` and `PeerProfile.tsx` get no clips code. |
| `src/store/auth.ts` | A (B3) | Sweep both buckets (section 11). The clips-store reset lives in `store/reels.ts` (B1), not here. |
| `src/app/settings.tsx` | C7 | Deletion copy names clips: the merged string in 04 §11. |
| `docs/privacy.md`, `docs/terms.md`, `docs/data-deletion.md`, `docs/appstore.md` | R | Section 13. |

---

## 3. Native setup (one new native module: expo-camera)

### 3.1 `app.json` → `expo.plugins`

Add, directly after the `expo-image-picker` entry:

```json
[
  "expo-camera",
  {
    "cameraPermission": "Sipply uses the camera to photograph a drink you are logging, to take your profile picture, and to film clips you choose to post.",
    "microphonePermission": "Sipply records sound with the clips you film. The microphone is on only while you are recording.",
    "recordAudioAndroid": true,
    "barcodeScannerEnabled": false
  }
]
```

(`barcodeScannerEnabled: false` keeps the ZXing barcode code out of the binary; nothing scans.)

And in the existing `expo-image-picker` entry change **both** of these to the same strings as above:

```json
"cameraPermission": "Sipply uses the camera to photograph a drink you are logging, to take your profile picture, and to film clips you choose to post.",
"microphonePermission": "Sipply records sound with the clips you film. The microphone is on only while you are recording."
```

**Why the image-picker edit is not optional.** Today it says `"microphonePermission": false`. In `@expo/config-plugins` (`ios/Permissions.js`, `applyPermissions`) a `false` **deletes** `NSMicrophoneUsageDescription` from Info.plist, and mods run in reverse registration order (`plugins/withMod.js`: each new mod calls `nextMod` after its own action), so the plugin listed *earlier* writes last. With image-picker above camera, its `false` deletes the camera plugin's microphone string, the build has no microphone purpose string, and iOS **kills the app** the first time the camera asks for the microphone. Two plugins also both write `NSCameraUsageDescription`; giving both the same strings makes plugin order irrelevant. On Android the same `false` also blocks `RECORD_AUDIO` via `withBlockedPermissions`.

### 3.2 Privacy manifest

Append to `expo.ios.privacyManifests.NSPrivacyCollectedDataTypes` (PhotosorVideos is already declared and covers the video itself):

```json
{
  "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeAudioData",
  "NSPrivacyCollectedDataTypeLinked": true,
  "NSPrivacyCollectedDataTypeTracking": false,
  "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"]
}
```

### 3.3 Building it

1. `ios/` must be regenerated or the plugin changes never reach Info.plist: `scripts/build-ios.sh` only prebuilds when `ios/` is missing. Run `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo prebuild -p ios --clean` (the team comes back from `ExportOptions.plist`; build-ios.sh's note 2).
2. Prove the trap in 3.1 did not fire — both must print the strings above:
   ```sh
   /usr/libexec/PlistBuddy -c 'Print :NSMicrophoneUsageDescription' ios/Sipply/Info.plist
   /usr/libexec/PlistBuddy -c 'Print :NSCameraUsageDescription' ios/Sipply/Info.plist
   ```
3. `npx expo install --check` must be clean (expo-camera ~57.0.6 matches SDK 57).
4. Bump `expo.ios.buildNumber` to the next unused number, take the build lock (`scripts/build-lock.sh acquire`), run `scripts/build-ios.sh`. It runs `scripts/check-native-links.sh` on the IPA; it must pass ("every in-app Swift symbol resolves"). If it fails, `npx expo install --fix`, prebuild `--clean`, rebuild — never ship around it.
5. `runtimeVersion` is `fingerprint`, so this build gets a new runtime and no OTA update can carry `expo-camera` imports to an older binary. That is correct and is why the flag exists.
6. Camera recording needs a physical iPhone. The simulator build renders expo-camera's placeholder and cannot record; everything else (pager, profile grid with seeded rows) can be checked there.

### 3.4 `.env`

```sh
# Clips (short videos). 'on' shows the Clips tab, the Clips section on
# profiles and the recorder; anything else hides all three. Needs a native
# build that contains expo-camera (build N and later). Before 'on':
#   1. Supabase SQL editor: apply supabase/migrations/019_reels.sql and run
#      its VERIFY block.
#   2. Record, post, watch, report and delete one clip on a real iPhone.
EXPO_PUBLIC_REELS=off
```

`src/lib/reels.ts`: `export const REELS_ENABLED = process.env.EXPO_PUBLIC_REELS === 'on';`

---

## 4. Recording — `/record`

`src/app/record.tsx` holds `phase: 'gate' | 'camera' | 'review'` and the recorded clip `{ uri, durationMs, landscape } | null`. Flag off → `<Redirect href="/" />`. Wrapped in `<AuthGate>`.

### 4.1 Gate (`CameraGate.tsx`)

Ground `colors.reelGround`, status bar `light`, content centred, `paddingHorizontal: space.xl`.

Permissions come from expo-camera's documented hooks, `const [cam, requestCam] = useCameraPermissions()` and `const [mic, requestMic] = useMicrophonePermissions()` (both `null` until read; show `<Hold tone="dark" slowMessage="Still checking camera access." />` until both are in). On mount, in parallel: `fetchMyReelQuota()` and `pruneCameraCache()`.

| Condition | Screen |
|---|---|
| Quota call says `posted_today >= day_limit` | Title `COPY.quotaDayTitle` ("You've posted 10 clips today"), body "You can post again tomorrow.", button `onDark` "Done" → close. |
| `live >= live_limit` | "You have 100 clips", "Delete one from your profile to post another.", "Done". |
| `files > 2 × live + 2` | Run `sweepOrphanReelFiles(myId)` silently, then continue. |
| Camera `undetermined` | **Primer.** Icon `camera` 40 `reelInk`; title "Film a clip" (`textRole.emptyTitle`, `reelInk`); body "Sipply needs the camera to film your clip and the microphone for its sound. Nothing is recorded until you press the button." (`fonts.body`, `type.body`, `reelInkMuted`); `Button variant="onDark" block` "Continue" → `requestCam()` then, if granted and the microphone is undetermined, `requestMic()`; `Button variant="onDarkText"` "Not now" → close. |
| Camera denied, `canAskAgain` false | Body "Camera access is off for Sipply."; "Open Settings" (`Linking.openSettings()`) and "Not now". On return to foreground (`AppState` → active) re-check and advance. |
| Camera granted | → `camera`. Microphone is optional (below). |
| Quota call failed (offline) | Continue; the server still enforces. |

Spacing: icon → title `space.lg`, title → body `space.sm`, body → buttons `space.xxl`, buttons gap `space.md`.

### 4.2 Camera (`Recorder.tsx`)

```tsx
<CameraView
  ref={cameraRef}
  style={StyleSheet.absoluteFill}
  mode="video"
  facing={facing}                       // 'back' first
  mirror={facing === 'front'}           // what you saw is what you get
  mute={!micGranted}
  videoQuality="720p"
  videoBitrate={REEL_VIDEO_BITRATE}     // 1_100_000; only honoured because a codec is passed
  videoStabilizationMode="auto"
  enableTorch={torch && facing === 'back'}
  active={focused && appActive}         // stops the session when hidden
  onCameraReady={() => setReady(true)}
  onMountError={() => setPhase('error')}
/>
```

`codec` is chosen once on mount by `pickCodec()` (4.5). `focused` from expo-router `useIsFocused()`; `appActive` from `AppState`.

**Anatomy** (all controls are `MediaIconButton` from `ui.tsx`: 44×44, `radius.control`, fill `reelControlFill`, 1pt border `reelControlBorder`, icon 22 `reelInk`; selected = fill `reelInk`, icon `reelGround`):

- Top-left at `top: insets.top + space.sm, left: space.lg`: **Close** (`close`). Hidden while recording.
- Top-right column at `right: space.lg`, gap `space.md`: **Flip** (`flip`), **Light** (`flash`, only when `facing === 'back'`, `accessibilityState.selected`). Flip is hidden while recording: the API stops a recording when the camera flips (`CameraView.d.ts`, `recordAsync`).
- Top-centre while recording: **timer chip** — height 28, `paddingHorizontal: 10`, `radius.control`, fill `reelControlFill`, 1pt `reelControlBorder`; a 6×6 square (radius 1) in `colors.record`, gap 6, then `0:12` in `fonts.bodySemiBold` 13, `tabular`, `reelInk`.
- Microphone denied: a chip under the top row, same skin, "No sound — microphone is off", tap → `Linking.openSettings()`.
- Bottom-centre: **RecordButton**, centre at `bottom: insets.bottom + space.xl + 42`.
- Above it, `space.md` gap, idle only: "Tap or hold to record" (`fonts.bodyMedium` 13, `reelInk`, text shadow `reelTextShadow`).

**RecordButton** (`RecordButton.tsx`, react-native-svg + Reanimated):

- Hit area 96×96. Outer ring 84 diameter, stroke 4: idle `reelInk`; recording = track `reelTrack` + progress arc `colors.record` from 12 o'clock clockwise (`AnimatedCircle`, `strokeDashoffset` driven by a shared value `withTiming(1, { duration: 30_000, easing: Easing.linear })`, cancelled on stop).
- Core: idle 68×68 radius 34 `colors.record`; recording 30×30 radius 6 `colors.record` (the stop square). Morph with `motion.spring`; Reduce Motion: no animation, swap instantly.
- `accessibilityRole="button"`, label idle "Record", recording "Stop recording"; `accessibilityValue={{ text: '12 of 30 seconds' }}`; hint idle "Records up to 30 seconds."

**Press logic** (one `Pressable`, timestamps in refs):

1. Idle + `onPressIn` (and `ready`): start. `pressedAt = now`, `startedAt = now`, `haptic.tap()`, `announce('Recording')`, call `cameraRef.current.recordAsync({ maxDuration: 30, maxFileSize: REEL_MAX_BYTES, codec })` and keep the promise.
2. Recording + `onPressOut`: if `now - pressedAt >= 350` it was a **hold** → `stopRecording()`. Shorter → **tap mode**, keep recording.
3. Recording in tap mode + next `onPressIn` → `stopRecording()`.
4. At 20 s elapsed: `announce('10 seconds left')`.
5. `AppState` leaves `active` while recording → `stopRecording()` (keep what was captured).
6. The promise resolves `{ uri }` on stop, on `maxDuration`, on `maxFileSize`: `haptic.select()`; `durationMs = now - startedAt` (clamped to 30,000). If `durationMs < REEL_MIN_MS` (1,000): delete the file, toast "Hold a little longer — at least 1 second." and stay. Else `announce('Recorded N seconds')`, `phase → 'review'`. **Unmount the CameraView** (do not hide it): that ends the capture session, so review audio comes out of the speaker, not the earpiece.
7. The promise rejects (interruption, call): toast "Recording stopped." and stay idle.

Toasts here are a single line in the hint position for 2.5 s, `accessibilityLiveRegion="polite"` plus `announce()`.

### 4.3 Review (`ReelReview.tsx`)

- Full-bleed `VideoView` of the local `uri` (`useVideoPlayer({ uri }, p => { p.loop = true; p.play(); })`), `contentFit` `cover` (portrait) or `contain` (landscape, on `reelGround`), `nativeControls={false}`, `allowsPictureInPicture={false}`.
- Tap on the video toggles mute; top-right `MediaIconButton` shows `volume`/`volumeOff` and does the same.
- Top-left `MediaIconButton` **Close** → if a clip exists: alert "Discard this clip?" [Keep editing] [Discard (destructive)]; while posting: "Stop posting?" [Keep posting] [Stop].
- On entering review, start `makePoster(player, durationMs)` (4.5) in the background; keep `{ posterUri, landscape }`.

**Bottom panel** inside `KeyboardAvoidingView behavior="padding"`: fill `colors.surface`, top-left/right radius `radius.card`, 1pt top border `colors.line`, `padding: space.lg`, `paddingBottom: insets.bottom + space.md`, children gap `space.md`:

1. `Field` label "Caption", multiline, `maxLength={REEL_CAPTION_MAX}` (300), min height 44, max height 96, counter shown from 250 characters. Error slot shows `OBJECTIONABLE_MESSAGE` when `containsObjectionable(caption)` or the server refuses.
2. **Drink tag row**: height 52, 1pt `colors.line`, radius `radius.control`, `paddingHorizontal: space.md`. Empty: `bottle` icon 20 `textMuted` + "Tag a drink" (`fonts.bodyMedium` 15) + `chevronRight`. Set: `DrinkArt` 28 flat + name (`fonts.bodySemiBold` 15, 1 line) + `dexNumber` + clear button (`close` 18, 44×44 hit, label "Remove drink tag"). Tap → `DrinkTagSheet`.
3. `ProgressBar` (2pt, wine on `bgSunk`) — only while posting.
4. Buttons row, gap `space.md`, each `flex: 1`: `Button variant="secondary"` "Retake" (while posting: "Cancel") and `Button variant="primary"` "Post" (while posting: `loading`, label "Posting 42%", accessibility label updated in 10 % steps).

Retake → alert "Discard this clip?" → delete local files → `phase: 'camera'`.

**DrinkTagSheet**: RN `Modal presentationStyle="pageSheet"`, `SearchField` autofocus, results from `src/lib/drinkSearch.ts` (≤ 40), rows 56 high: `DrinkArt` 32 · name (`fonts.bodySemiBold` 15) · `dexNumber` · subcategory (`fonts.body` 13 `textMuted`). Empty query shows "From your Dex": the user's 20 most recent unlocks from `useCollection` (likeliest to be what they are filming). No match: "No drink called “x” in the Dex. Only Dex drinks can be tagged for now."

### 4.4 Posting (`postReel`, section 6.1)

1. Client filter: `containsObjectionable(caption)` → show message, stop.
2. Wait for the poster (if it is still being made, the button shows "Preparing…"). Poster failed twice → "Couldn't prepare this clip. Retake it." 
3. `postReel({ … onProgress, signal })`; progress drives the bar.
4. Outcomes:

| Outcome | UI |
|---|---|
| `ok` | Delete the local `.mov` and `.jpg`; `useReels.getState().prepend(reel, myProfile)`; `haptic.success()`; `router.dismiss()` then `router.navigate('/reels')` (the new clip is first, globally newest). |
| `objectionable` | `OBJECTIONABLE_MESSAGE` under the caption; buttons re-enabled. |
| `quota_day` / `quota_total` | Alert with the gate's copy; Post disabled. |
| `too_large` | "This clip is too large to post. Record a shorter one." |
| `cancelled` | Back to review, silently. |
| `failed` | Inline under the buttons: "Couldn't post your clip. Check your connection and try again." Post re-enabled; the local files are kept for the retry. |

### 4.5 `src/lib/reelMedia.ts`

```ts
export async function pickCodec(): Promise<'hvc1' | 'avc1'>;
// CameraView.getAvailableVideoCodecsAsync(); 'hvc1' when listed, else 'avc1'. Cached for the session.

export async function makePoster(player: VideoPlayer, durationMs: number):
  Promise<{ uri: string; landscape: boolean }>;
// t = min(0.5, durationMs / 2000) seconds; on failure retry once at 0.
// const [thumb] = await player.generateThumbnailsAsync(t, { maxWidth: 720 });
// landscape = thumb.width > thumb.height;
// const ref = await ImageManipulator.manipulate(thumb).renderAsync();
// const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.72 });

export function pruneCameraCache(): void;
// Deletes every *.mov in new Directory(Paths.cache, 'Camera') (where expo-camera
// writes recordings). Called when /record opens, before anything is recorded, so
// every file there is an abandoned clip of up to 5 MB. try/catch; never throws.
```

If React Compiler's lint flags property writes on the player (`p.muted = …`) inside components, move them into module-level helpers (`setMuted(player, m)`), the same way `PressableScale` moved to `.set()`.

### 4.6 Accessibility (recorder and review)

- Every control ≥ 44×44 with a label: "Close", "Switch to front camera"/"Switch to back camera", "Light"(selected state), "Mute"/"Unmute".
- VoiceOver users record in tap mode (double-tap starts, double-tap stops); the hold path needs no special handling.
- `announce()` on start, at 10 s left, on stop, and on every posting outcome.
- Review video region: `accessible`, label "Your clip, 14 seconds", hint "Double-tap to mute or unmute."
- `maxFontSizeMultiplier={1.3}` on the hint, timer and chips over the camera; the review panel uses normal Dynamic Type.

---

## 5. Data model — `supabase/migrations/019_reels.sql`

### 5.1 Storage layout

```
reels/<author uid>/<reel uuid>.mov   video/quicktime   ≤ 6 MiB (client stops at 5,000,000 B)
reels/<author uid>/<reel uuid>.jpg   image/jpeg        poster, 720 px wide, ~80–150 KB
```

Private bucket. Reads through 1-hour signed URLs, exactly like `pours`. Own bucket rather than `pours` because `pours` is images-only at 8 MB (003) and widening it would let every photo path carry 8 MB of anything.

### 5.2 The migration, verbatim

```sql
-- ====================================================================
-- Sipply — migration 019: clips (short videos; `reels` in the schema)
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- WHAT IT ADDS
--
--   1. public.reels and public.reel_likes, with RLS that mirrors posts and
--      likes: readable by every signed-in account not blocked either way,
--      writable only by the author. A clip the caller has reported is also
--      hidden from the caller.
--   2. A private 'reels' bucket: 6 MiB per file, video/quicktime,
--      video/mp4 and image/jpeg only, block-aware reads, and uploads only
--      into your own folder under file names derived from a uuid.
--   3. Limits: 10 clips per rolling 24 hours and 100 live clips per account
--      (trigger), and at most 2 x live + 4 files in your folder (storage
--      policy), so files no row points at cannot pile up.
--   4. Captions go through the 011 content filter; created_at is the
--      server's (011's pin_created_at).
--   5. Reports can name a clip (reported_reel_id), keep a snapshot of it,
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
-- EXPO_PUBLIC_REELS=on reaches anyone. Installed builds without clips notice
-- nothing: they never write reels, their reports name a post or a person,
-- and their accounts have no files under reels/.
--
-- DO NOT RE-RUN 012 AFTER THIS FILE. 012 drops every foreign key on
-- public.reports and puts back the two-subject prepare_report, which would
-- refuse every clip report.
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
--   -- Expect true: reports can name a clip.
--   select prosrc ilike '%reported_reel_id%'
--   from pg_proc where oid = 'public.prepare_report()'::regprocedure;
--
--   -- Smoke test as a real account, rolled back. Paste your user id.
--   -- Expect 0 | 0 | 0 | 10 | 100 on an account with no clips.
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
returns integer language sql immutable set search_path = '' as $$ select 10 $$;

create or replace function private.reel_live_limit()
returns integer language sql immutable set search_path = '' as $$ select 100 $$;

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

-- The Clips feed: newest first, keyset-paged on (created_at, id).
create index if not exists reels_created_idx        on public.reels (created_at desc, id desc);
-- A profile's clips, and the quota counts.
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

-- Nobody edits a clip in v1; delete and post again. No update grant at all,
-- on top of having no update policy.
revoke all on public.reels      from anon;
revoke all on public.reel_likes from anon;
revoke update, truncate, references, trigger on public.reels      from authenticated;
revoke update, truncate, references, trigger on public.reel_likes from authenticated;


-- --------------------------------------------------------------------
-- 3. Reports can name a clip
--
-- Same shape as 012: SET NULL so the report outlives the clip, a snapshot
-- of the text when it is filed (never the file path: deletion removes the
-- file, and a path to nothing helps no moderator), one report per reporter
-- per clip.
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

  return new;
end;
$$;

revoke all on function public.prepare_report() from public, anon, authenticated;

-- The two-argument version from 012 has no caller left.
drop function if exists private.report_evidence(uuid, uuid);

-- 013's alert, with clips named. Still never carries the content.
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

-- Storage's insert check. Two rules: never more than two files a clip plus
-- four spare (one failed attempt's poster and video, twice), and never more
-- than two files per allowed clip in a day plus the same spare. A file is
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
  -- (011): ten parallel posts must not all read the same count and pass.
  perform pg_advisory_xact_lock(hashtextextended('reels:' || new.author_id::text, 0));

  select count(*) filter (where r.created_at > now() - interval '24 hours'),
         count(*)
    into today, live
  from public.reels r
  where r.author_id = new.author_id;

  if today >= private.reel_day_limit() then
    raise exception 'reel_quota_day'
      using errcode = 'P0001',
            detail  = format('%s clips in the last 24 hours; the limit is %s', today, private.reel_day_limit()),
            hint    = 'Try again tomorrow.';
  end if;

  if live >= private.reel_live_limit() then
    raise exception 'reel_quota_total'
      using errcode = 'P0001',
            detail  = format('%s clips posted; the limit is %s', live, private.reel_live_limit()),
            hint    = 'Delete a clip to post another.';
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

-- The subquery runs under reels_read, so a clip hidden by a block or by
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
```

### 5.3 What the SQL deliberately does not do

- No SQL delete from `storage.objects`, ever (011: Supabase refuses it, and it would orphan the bytes).
- No server check that `drink_id` is a Dex id (the Dex ships in the app bundle; same as posts).
- No update policy (no caption editing in v1).

### 5.4 `src/lib/database.types.ts`

```ts
export type ReelRow = {
  id: string;
  author_id: string;
  /** `<author_id>/<id>.mov` in the private `reels` bucket (CHECK-enforced). */
  video_path: string;
  /** `<author_id>/<id>.jpg` in the private `reels` bucket. */
  poster_path: string;
  caption: string;
  drink_id: string | null;
  duration_ms: number;
  landscape: boolean;
  created_at: string;
};

export type ReelLikeRow = { reel_id: string; user_id: string; created_at: string };

export type ReelQuotaRow = {
  posted_today: number;
  live: number;
  files: number;
  day_limit: number;
  live_limit: number;
};
```

`Tables.reels`: `Row: ReelRow; Insert: Omit<ReelRow, 'created_at' | 'landscape'> & { landscape?: boolean }; Update: { [k: string]: never }` plus `Relationships` following the existing posts entry. `Tables.reel_likes`: like `likes`. `ReportRow` and its Insert gain `reported_reel_id: string | null` (Insert: optional). `Functions.my_reel_quota: { Args: Record<string, never>; Returns: ReelQuotaRow[] }`. The embedded `reel_likes(count)` stays `unknown` and goes through the existing `likeCount()` normaliser, exactly as `likes(count)` does.

---

## 6. Client data layer

### 6.1 `src/lib/reels.ts`

```ts
export const REELS_ENABLED = process.env.EXPO_PUBLIC_REELS === 'on';
export const REEL_MAX_SECONDS = 30;
export const REEL_MIN_MS = 1000;
export const REEL_MAX_BYTES = 5_000_000;      // recordAsync maxFileSize
export const REEL_VIDEO_BITRATE = 1_100_000;  // CameraView videoBitrate (b/s)
export const REEL_CAPTION_MAX = 300;          // = reels_caption_len
export const REEL_PAGE = 8;

/** Every visible string for the feature. D1: one file to rename it. */
export const COPY = {
  label: 'Clips',
  record: 'Record a clip',
  emptyTitle: 'No clips yet',
  emptyBody: 'Film the first one. Up to 30 seconds, with sound.',
  endTitle: "You're all caught up",
  endBody: 'New clips show up here first.',
  errorTitle: "Clips didn't load",
  errorBody: 'Check your connection and try again.',
  cellError: "This clip didn't load",
  quotaDayTitle: (n: number) => `You've posted ${n} clips today`,
  quotaDayBody: 'You can post again tomorrow.',
  quotaLiveTitle: (n: number) => `You have ${n} clips`,
  quotaLiveBody: 'Delete one from your profile to post another.',
  // …every other string in this spec that names the feature
} as const;

export type Reel = {
  id: string;
  authorId: string;
  videoPath: string;
  posterPath: string;
  caption: string;
  drinkId: string | null;
  durationMs: number;
  landscape: boolean;
  createdAt: string;
  likes: number;
  likedByMe: boolean;
  mine: boolean;
};

export type ReelCursor = { createdAt: string; id: string } | null;

const REEL_SELECT =
  'id, author_id, video_path, poster_path, caption, drink_id, duration_ms, landscape, created_at, reel_likes(count)';

/** Global feed, newest first. `next` is null when this was the last page. */
export function fetchReels(myId: string, cursor: ReelCursor):
  Promise<{ reels: Reel[]; next: ReelCursor }>;
//   .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(REEL_PAGE)
//   cursor: .or(`created_at.lt."${c.createdAt}",and(created_at.eq."${c.createdAt}",id.lt.${c.id})`)
//   (double quotes: a timestamp's ':' and '+' are PostgREST grammar otherwise)
//   then fetchMyReelLikes(myId, ids) (scoped like social.ts fetchMyLikes) and
//   primeSignedUrls('reels', posterPaths).

/** All of one author's clips (≤ 100 by the live limit), newest first. */
export function fetchReelsByAuthor(authorId: string, myId: string): Promise<Reel[]>;
export function fetchReel(id: string, myId: string): Promise<Reel | null>;
export function fetchMyReelQuota(): Promise<ReelQuotaRow | null>;   // null on failure

/** Removes files in reels/<myId>/ that no row of mine points at and are older than 10 minutes. Returns how many. */
export function sweepOrphanReelFiles(myId: string): Promise<number>;
//   list(myId, { limit: 1000 }) at offset 0; compare against my rows' video_path/poster_path;
//   remove the rest whose created_at is > 10 min old (a live upload is younger).

export type PostReelInput = {
  myId: string;
  videoUri: string;
  posterUri: string;
  caption: string;
  drinkId: string | null;
  durationMs: number;
  landscape: boolean;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;   // 0..1, video bytes only
};

export type PostReelOutcome =
  | { status: 'ok'; reel: Reel }
  | { status: 'objectionable' }
  | { status: 'quota_day' }
  | { status: 'quota_total' }
  | { status: 'too_large' }
  | { status: 'cancelled' }
  | { status: 'failed' };

export function postReel(input: PostReelInput): Promise<PostReelOutcome>;
export function deleteReel(myId: string, reel: Reel): Promise<void>;
export function likeReel(myId: string, reelId: string): Promise<void>;     // duplicate = success
export function unlikeReel(myId: string, reelId: string): Promise<void>;
```

**`postReel`, step by step:**

1. `new File(videoUri).size > 6 * 1024 * 1024` → `too_large`.
2. `id = Crypto.randomUUID().toLowerCase()` (expo-crypto; already lowercase on iOS per `CryptoModule.swift`, but the storage regex and the path CHECKs compare against Postgres's lowercase `uuid::text`, so the `.toLowerCase()` stays). Paths: `${myId}/${id}.mov`, `${myId}/${id}.jpg`. A retry is a new call with a **new** id.
3. Token: `supabase.auth.getSession()`; if `expires_at - now < 120 s`, `refreshSession()` first.
4. Upload poster, then video, each with:
   ```ts
   await new File(uri).upload(`${SUPABASE_URL}/storage/v1/object/reels/${path}`, {
     httpMethod: 'POST',
     uploadType: UploadType.BINARY_CONTENT,
     mimeType,                                   // 'image/jpeg' | 'video/quicktime'
     headers: {
       Authorization: `Bearer ${token}`,
       apikey: SUPABASE_KEY,
       'Content-Type': mimeType,
       'x-upsert': 'false',
       'cache-control': 'max-age=31536000',     // the object never changes: new clip, new name
     },
     sessionType: 'background',
     signal,
     onProgress: path.endsWith('.mov')
       ? ({ bytesSent, totalBytes }) => onProgress?.(totalBytes > 0 ? bytesSent / totalBytes : 0)
       : undefined,
   });
   ```
   `UploadResult.status` not 2xx → read `body` JSON (`{ statusCode, error, message }`): 413 → `too_large`; 401 → refresh the session once and retry that file; 403 (the insert policy refused: quota or file count) → `fetchMyReelQuota()`: day limit → `quota_day`, live limit → `quota_total`, otherwise `sweepOrphanReelFiles` and retry once, then `failed`. Abort → `cancelled`.
5. Insert the row and read it back:
   `supabase.from('reels').insert({ id, author_id: myId, video_path, poster_path, caption, drink_id, duration_ms, landscape }).select(REEL_SELECT).single()`.
   Errors: `isObjectionableError` → `objectionable`; message contains `reel_quota_day` → `quota_day`; `reel_quota_total` → `quota_total`; anything else → `failed`.
6. On every non-`ok` outcome after step 4 began: best-effort `storage.from('reels').remove([poster, video])`, swallowed (same reasoning as `removeStoredPhoto`).

**`deleteReel`:** delete the row first (it vanishes for everyone at once), then `remove([videoPath, posterPath])`, failure swallowed (the folder sweep at account deletion and `sweepOrphanReelFiles` catch leftovers). Then `forgetSignedPhoto` for both paths.

### 6.2 `src/store/reels.ts`

Same discipline as `store/social.ts`: a `gen` counter bumped by `reset()`, read before the first await and checked after each.

```ts
interface ReelsState {
  feed: Reel[];
  next: ReelCursor;                 // null = no more pages
  status: 'idle' | 'loading' | 'ready' | 'error';
  loadingMore: boolean;
  authors: Record<string, UserProfile>;
  muted: boolean;                   // session-wide, starts false (D15)
  loadedAt: number;
  gen: number;
  load(myId: string): Promise<void>;        // first page, replaces feed
  loadMore(myId: string): Promise<void>;    // no-op while loadingMore or next === null
  toggleLike(myId: string, reelId: string, wasLiked: boolean): Promise<boolean>;
  setMuted(muted: boolean): void;
  /** Bumped after a post, delete or report; 03's profile Clips tab refetches on change. */
  reelsVersion: number;
  prepend(reel: Reel, author: UserProfile): void;
  remove(reelId: string): void;             // after delete or report
  dropAuthor(authorId: string): void;       // after a block
  reset(): void;
}
```

Authors come from `fetchProfiles()` (social.ts) for the new page's author ids, merged into `authors`.

### 6.3 `src/lib/social.ts` — signed URLs take a bucket

```ts
type Bucket = 'pours' | 'reels';
export function signedPhotoUrl(path: string | null, bucket: Bucket = 'pours'): Promise<string | null>;
export function peekSignedPhoto(path: string | null | undefined, bucket: Bucket = 'pours'): string | undefined;
export function forgetSignedPhoto(path: string | null, bucket: Bucket = 'pours'): void;
/** One createSignedUrls request seeding the cache for many paths (profile grids, a feed page). */
export function primeSignedUrls(bucket: Bucket, paths: string[]): Promise<void>;
```

The cache key becomes `` `${bucket}:${path}` ``; TTL, promise sharing and failure eviction unchanged. Every existing caller keeps working through the default. `useSignedPhoto` in `PostCard.tsx` gains the same third argument and passes it through.

---

## 7. Viewing — the Clips tab

### 7.1 Where it lives (assumption stated)

**Settled by 01 §6:** the bar is Home · **Clips** · (+) · Dex · Profile. Stats leaves the bar and becomes a pushed screen opened from the Dex top bar. The route is `(tabs)/reels` → `/reels`.

`src/app/(tabs)/_layout.tsx`:

```tsx
<Tabs.Screen
  name="reels"
  options={{
    title: COPY.label,
    tabBarAccessibilityLabel: COPY.label,
    tabBarIcon: tabIcon('reels'),
    // The scene's own ground is dark, so the instant tab cut (specs/06)
    // never shows a cream frame before the first video frame.
    sceneStyle: { backgroundColor: colors.reelGround },
  }}
/>
```

`FloatingTabBar.tsx`: when `!REELS_ENABLED`, skip the route named `reels` while keeping each route's **original** index for `focused = state.index === i`; the + is still placed before the third *visible* item. **Overridden by 01 §6.3:** the bar turns dark (`reelBar`) while Clips is focused and someone is signed in; there is no glass in v2.

`src/app/_layout.tsx`, inside `<Stack>`:

```tsx
<Stack.Screen
  name="record"
  options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }}
/>
<Stack.Screen name="reel/[id]" options={{ gestureDirection: 'horizontal' }} />
```

`fullScreenModal` because a card sheet's swipe-down would fight hold-to-record; it is presented natively, so the root `<Grain />` cannot reach it (good). `Grain.tsx`: `const path = usePathname(); if (path === '/reels' || path.startsWith('/reel/')) return null;` — paper grain over video reads as sensor noise.

### 7.2 Screen (`(tabs)/reels.tsx`)

- `<AuthGate>` around it, as Home and Profile do. Flag off → `<Redirect href="/" />`.
- Status bar: `useFocusEffect` → `setStatusBarStyle('light')`, cleanup → `setStatusBarStyle('dark')` (expo-status-bar). The effect lives in the gated child (the feed component rendered inside `<AuthGate>`), so the signed-out sign-in screen keeps a dark status bar on cream.
- On first focus with `status === 'idle'` → `load(myId)`. On focus when `Date.now() - loadedAt > 10 min` and the visible index is 0 → `load` again.
- `useScrollToTop(listRef)`: tapping the tab while on it returns to the first clip; a second tap at index 0 refreshes.
- Header overlay (not part of the list): top scrim (SVG `LinearGradient` from `reelScrimMid` to `reelScrimClear`, height `insets.top + 120`), title `COPY.label` at `top: insets.top + space.sm, left: space.lg` (`textRole.barTitleLg`, `reelInk`, `reelTextShadow`, `maxFontSizeMultiplier={1.4}`), and at the right a `MediaIconButton` with `camera` → `router.push('/record')`, label "Record a clip".
- Body: `<ReelPager reels={feed} authors={authors} bottomInset={insets.bottom + TAB_BAR_CLEARANCE} onNearEnd={() => loadMore(myId)} footer={next === null && feed.length ? <EndPage/> : null} />`.

**States** (all on `reelGround`, centred, gap as in 4.1, buttons `onDark`):

| State | Content |
|---|---|
| Loading first page | `<Hold tone="dark" slowMessage="Still loading clips." />`. |
| Empty | `EmptyState tone="dark"`: `reels` icon, `COPY.emptyTitle`, `COPY.emptyBody`, button `COPY.record` → `/record`. |
| Error (first page) | `COPY.errorTitle`, `COPY.errorBody`, "Try again" → `load`. |
| Error loading more | Keep the feed; the end page shows `COPY.errorTitle` + "Try again" → `loadMore`. |
| End | A full-height last page: `COPY.endTitle`, `COPY.endBody`, button `COPY.record`. |
| Refreshing | `RefreshControl tintColor={colors.reelInk}`. |

### 7.3 `ReelPager`

```ts
type ReelPagerProps = {
  reels: Reel[];
  authors: Record<string, UserProfile>;
  initialIndex?: number;
  bottomInset: number;
  onNearEnd?: () => void;          // fired when active >= reels.length - 3
  onRemoved?: (reelId: string) => void;
  footer?: React.ReactElement | null;
  refreshControl?: React.ReactElement;
};
```

- Measures its own height with `onLayout` (`pageH`); renders nothing until it has one.
- `FlatList`: `pagingEnabled`, `decelerationRate="fast"`, `disableIntervalMomentum`, `showsVerticalScrollIndicator={false}`, `contentInsetAdjustmentBehavior="never"`, `getItemLayout={(_, i) => ({ length: pageH, offset: pageH * i, index: i })}`, `initialScrollIndex={initialIndex}`, `windowSize={5}`, `initialNumToRender={2}`, `maxToRenderPerBatch={2}`, **no** `removeClippedSubviews` (06 rule 5), `keyExtractor={r => r.id}`, `ListFooterComponent` sized `pageH`.
- Active page: `onViewableItemsChanged` (a stable ref) with `viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}`.
- `focused` = `useIsFocused()`; `appActive` from `AppState`. Each cell gets `active = focused && appActive && i === activeIndex` and `loadVideo = focused && Math.abs(i - activeIndex) <= 1` (D10: the visible page, the one behind it, and the next one, which is the preload).
- Before mounting the first player in a session: `setVideoCacheSizeAsync(256 * 1024 * 1024).catch(() => {})` once (module flag). The value persists, and the call is only allowed while no player exists, so failure is ignored.
- Accessibility: each cell has `accessibilityActions` `increment`/`decrement` → `scrollToIndex(activeIndex ± 1)`.

### 7.4 `ReelCell` anatomy (numbers for a 393×852 pt screen; everything scales from the insets)

Layers, bottom to top:

1. **Ground** `reelGround`.
2. **Poster**: `expo-image`, `source={{ uri: signedPoster, cacheKey: reel.posterPath }}`, `cachePolicy="memory-disk"`, `contentFit` `cover` (portrait) / `contain` (landscape), `transition={120}`. Keyed on the path, as PostCard does, so the disk cache survives signed-URL rotation.
3. **Video** (`ReelVideo`, only when `loadVideo` and the signed video URL is a string): `VideoView`, same `contentFit`, `nativeControls={false}`, `allowsPictureInPicture={false}`, `opacity` 0 until `onFirstFrameRender`, then 1.
4. **Bottom scrim**: SVG `LinearGradient` over the bottom 45 % of the page: `reelScrimClear` at 0 %, `reelScrimMid` at 40 %, `reelScrim` at 100 %.
5. **Tap surface**: a full-page `Pressable` (see 7.5).
6. **Overlays** (hidden while long-pressing, instantly: no opacity animation, so a stalled animation can never leave them hidden):
   - **Left block**, `left: space.lg`, `right: space.lg + 52 + space.sm + space.md` (clears the rail), `bottom: bottomInset + space.md`, gap `space.sm`:
     - Author row, height 32, gap `space.sm`: `Avatar` 32 with ring; `@username` (`fonts.bodySemiBold`, `type.bodySm`, `reelInk`); `· 2d` (`timeAgo`, `fonts.body` 13, `reelInk`); if not mine and not followed, **Follow** chip: height 28, `paddingHorizontal: 10`, `radius.control`, 1 pt border `reelInk`, label `fonts.bodySemiBold` 13 `reelInk` → `useSocial.toggleFollow`. The avatar + name are one `PressableScale` → `/user/[id]` (or the Profile tab when mine).
     - Caption (if not blank): `fonts.body`, `type.bodySm`, `reelInk`, `numberOfLines` 2 collapsed / 8 expanded; `onTextLayout` decides whether a "more" line (`fonts.bodySemiBold` 13) shows; tapping the caption toggles.
     - Drink chip (if `getDrink(drinkId)`): height 32, `paddingHorizontal: 10`, radius 8, fill `reelControlFill`, 1 pt `reelControlBorder`, `DrinkArt` 20 flat + name (`fonts.bodyMedium` 13 `reelInk`) + `formatDexNumber` (`fonts.label` 11 `reelInk`, `tabular`) → `/drink/[id]`.
   - **Right rail**, `right: space.sm`, width 52, bottom aligned with the left block, gap `space.lg`, each item 52 wide with a 44×44 hit target:
     - Like: `heart` 28, filled + `colors.wineSoft` when liked, outline `reelInk` otherwise; count under it (`fonts.bodyMedium` 12, `reelInk`, `tabular`, `formatCount`, hidden at 0). Optimistic overlay exactly like PostCard's `flip` state.
     - More: `more` 28 `reelInk` → action sheet (section 9).
   - **Progress line** (active only): full width, 2 pt, `bottom: bottomInset - space.sm`; track `reelTrack`, fill `reelInk`; width from `timeUpdate` (`timeUpdateEventInterval = 0.25` on the active player only, 0 otherwise) through a Reanimated shared value.
   - **Mute flash**: centred 64×64, `radius.control`, fill `reelControlFill`, 1 pt `reelControlBorder`, `volume`/`volumeOff` 28; fades in 120 ms, out after 700 ms, and is **unmounted by a JS timer at 820 ms** whatever the fade did.
   - **Heart burst** at the tap point: `heart` filled 96 `colors.wineSoft`; scale 0.6 → 1.15 → 1 with `motion.spring`, fade out by 600 ms, **unmounted by a JS timer at 700 ms** (06: a stalled fade must not leave a heart on screen). Reduce Motion: fade only.
   - **Buffering**: active and no first frame after 600 ms, or `status === 'loading'` mid-play → small `ActivityIndicator` `reelInk`, centred.
   - **Cell error** (`statusChange` → `error`, or the video would not sign): poster stays; centred `COPY.cellError` (`fonts.bodySemiBold` 15 `reelInk`) + small `onDark` "Try again" → `forgetSignedPhoto(videoPath, 'reels')` and remount the player (key bump).

All text over video uses `reelInk` with `reelTextShadow` (`textShadowColor`, `textShadowOffset {0,1}`, `textShadowRadius 6`); no lowered-opacity greys over video (they fail contrast over bright frames). `maxFontSizeMultiplier={1.4}` on overlay text so it stays inside the page.

### 7.5 Taps (D11)

One `Pressable` over the page (under the overlays, which have their own handlers):

- `onPress(e)`: if a pending single tap exists within 250 ms → cancel it and **double tap**: like if not liked (never unlikes), `haptic.tap()`, heart burst at `e.nativeEvent.locationX/Y`. Otherwise schedule the **single tap** for 250 ms later: toggle `muted` in the store + mute flash.
- `onLongPress` (`delayLongPress={300}`): pause the active player and hide overlays; `onPressOut` after a long press: resume and show them.
- The list's scroll cancels the press, so swiping never mutes.

### 7.6 `ReelVideo` lifecycle

```tsx
const player = useVideoPlayer({ uri, useCaching: true }, (p) => {
  p.loop = true;
  p.muted = muted;
  p.audioMixingMode = 'auto';
  p.timeUpdateEventInterval = 0;
});
// active → timeUpdateEventInterval = 0.25; play()
// inactive → pause(); currentTime = 0; timeUpdateEventInterval = 0
// muted changes → player.muted = muted
// useEventListener(player, 'statusChange', …) → error / loading
// useEventListener(player, 'timeUpdate', …) → progress shared value
```

Unmounting releases the player (useVideoPlayer owns it). Leaving the tab sets `loadVideo` false everywhere, so nothing decodes or downloads behind another tab; posters stay painted.

### 7.7 Accessibility (viewer)

- Each page: one accessible element for the video region, label "Clip by @user, 14 seconds. {caption}. Tagged {drink}." (omit empty parts), hint "Swipe up with three fingers for the next clip.", `accessibilityActions`: `like`/"Like" (or "Unlike"), `mute`/"Mute" (or "Unmute"), `increment`, `decrement`, `magicTap` → play/pause.
- Rail buttons and the author row are separate buttons ("Like, 12 likes" / "Unlike"; "More options"; "Open @user's profile").
- `useReducedMotion()`: heart burst and mute flash fade only; the page itself still autoplays (the user opened a video feed).
- No captions/subtitles exist for user audio; say nothing pretending otherwise.

---

## 8. Clips on profiles

### 8.1 Profile section (rewritten by the cross-check: 03 owns the profile)

03's `ProfileView` (package C4) owns the profile tabs and the list. It already has a third tab item for clips, `{ key: 'videos', icon: 'reels', label: COPY.label, fillActive: true }`, shown only when `REELS_ENABLED`, and renders clips as pre-chunked rows of three in its single `numColumns={1}` FlatList (03 §8.5). This spec supplies only data and copy, through `components/profile/videosSource.ts` (03 §8.7), which C4 writes against B1's stage-1 exports:

- **Data:** `fetchReelsByAuthor(authorId, myId)` (§6.1; ≤ 100 by the live limit, newest first), then `primeSignedUrls('reels', posterPaths)` once per load. Fetched on first selection of the tab, not on profile open. Refetch key: `useReels((s) => s.reelsVersion)`.
- **Tile** (03's `VideoGrid`): 9:16, `radius.none`, full-bleed 3-up with `layout.gridGap`, ground `reelGround` while signing; poster `contentFit="cover"`, `cacheKey: posterPath`; bottom-left `play` 12 + duration `0:14` (`fonts.bodySemiBold` 12, `reelInk`, `tabular`) on a `reelScrim` band. Label "Clip, 14 seconds, posted 2 days ago{, tagged Negroni}". Press → `router.push({ pathname: '/reel/[id]', params: { id: reel.id, author: reel.authorId } })`.
- **States** (03 §8.8 rows, with `COPY`): loading → six static `bgSunk` placeholder tiles; empty (own) → `EmptyState icon="reels" title={COPY.emptyTitle} body="Film one and it shows up here." action={{ label: COPY.record, onPress: () => router.push('/record') }}`; empty (peer) → same without action, body "Nothing filmed yet."; error → `EmptyState icon="alert"` with secondary "Try again".
- **`reelsVersion`:** `store/reels.ts` (§6.2) bumps it after a post, a delete or a report.

### 8.2 `/reel/[id]`

`src/app/reel/[id].tsx`, params `id` (required) and `author` (optional uid).

- With `author`: `fetchReelsByAuthor(author, myId)`, `initialIndex` = index of `id` (0 if missing).
- Without: `fetchReel(id, myId)`; null → "This clip isn't available." + Back.
- `<ReelPager bottomInset={insets.bottom + space.lg} …/>`, no tab bar (pushed over the tabs), status bar light while focused.
- Top-left `MediaIconButton` `chevronLeft` "Back" at `top: insets.top + space.sm`. Edge-swipe back stays on (the pager scrolls vertically, nothing competes).
- Loading/error states as in 7.2. Deleting the last clip in the list → `router.back()`.

---

## 9. Moderation

### 9.1 The "More" sheet (`ActionSheetIOS`, Alert elsewhere)

- **Someone else's clip**: "Open {drink}" (if tagged), "Report clip", "Block @user" (destructive).
- **Your clip**: "Open {drink}" (if tagged), "Delete clip" (destructive) → alert "Delete this clip? It's removed for everyone and can't be undone." [Cancel] [Delete] → `deleteReel` → `store.remove` + `onRemoved` + `haptic.select()`.

**Report** = the PostCard flow, reasons from `REPORT_REASONS`, then:

```ts
// src/lib/moderation.ts
export async function reportReel(myId: string, reelId: string, reason: ReportReason, note?: string): Promise<void> {
  const { error } = await supabase
    .from('reports')
    .insert({ reporter_id: myId, reported_reel_id: reelId, reason, note: note ?? null });
  if (error && !isDuplicate(error)) throw error;
}
```

On success: alert "Thanks — This clip has been reported and you won't see it again. You can also block this person from the clip menu."; `store.remove(reelId)` (the server already hides it on the next query, D9).

**Block** = PostCard's confirm text and `blockUser`, then `useReels.getState().dropAuthor(id)` and `useSocial.getState().dropAuthor(id)`.

### 9.2 Jan's takedown procedure (dashboard)

1. The 013 webhook posts "new report (…, a reel)". Open **Table editor → reports**, find the id; `reported_reel_id` names the clip and `snapshot` holds its caption.
2. **Table editor → reels**, row with that id: open `video_path` in **Storage → reels** to watch it.
3. To remove: delete the **row** first (it disappears for everyone), then in **Storage → reels → <author uid>** delete `<id>.mov` and `<id>.jpg`.
4. Serious or repeated: Authentication → Users → the author → ban, as for posts.

Read-only helper for step 1:

```sql
select rp.id as report, rp.created_at, rp.reason, rp.snapshot,
       r.id as reel, r.video_path, r.author_id
from public.reports rp
left join public.reels r on r.id = rp.reported_reel_id
where rp.reported_reel_id is not null or rp.snapshot ->> 'kind' = 'reel'
order by rp.created_at desc;
```

---

## 10. Design-system additions (D merges)

### 10.1 `src/constants/theme.ts` → `colors`

```ts
/*
 * Clips. The one dark surface in the app: video needs a black-ish ground,
 * and a cream frame around a moving picture reads as a web embed. Warm,
 * not neutral, so it still belongs beside wine.
 */
reelGround: '#0E0B0B',
/** Text and glyphs on reelGround and over video. 19.3:1 on the ground. */
reelInk: '#FFFDF9',
/** Secondary text on the SOLID ground only (13.1:1) — never over video. */
reelInkMuted: '#D8D2CB',
/** The shutter core and the recording dot. 4.4:1 on reelGround. */
record: '#D8402F',
/** Control chips over video/camera: fill and 1pt border. */
reelControlFill: 'rgba(14, 11, 11, 0.55)',
reelControlBorder: 'rgba(255, 253, 249, 0.28)',
/** Bottom scrim stops under captions; top scrim uses reelScrimMid → clear. */
reelScrim: 'rgba(14, 11, 11, 0.78)',
reelScrimMid: 'rgba(14, 11, 11, 0.62)',
reelScrimClear: 'rgba(14, 11, 11, 0)',
/** Progress tracks over video. */
reelTrack: 'rgba(255, 253, 249, 0.24)',
/** textShadowColor for every word over video. */
reelTextShadow: 'rgba(14, 11, 11, 0.6)',
```

`scripts/check-contrast.mjs` → `PAIRS` (six pairs; rgba composited with the existing `over()` helper over a worst-case white frame, `#FFFFFF`):

```js
[C.reelInk, C.reelGround, 4.5, 'text on the clips ground'],
[C.reelInkMuted, C.reelGround, 4.5, 'secondary text on the clips ground'],
[C.record, C.reelGround, 3.0, 'record core glyph on the clips ground'],
[C.wineSoft, C.reelGround, 3.0, 'liked heart and heart burst on the clips ground'],                    // ≈ 4.0
[C.reelInk, over([14, 11, 11, 0.55], '#FFFFFF'), 3.0, 'control glyph on its chip over a white frame'],   // ≈ 4.2
[C.reelInk, over([14, 11, 11, 0.62], '#FFFFFF'), 4.5, 'caption at the shallow end of the scrim over a white frame'], // ≈ 5.3
```

`check-design.mjs` stays clean: every colour above is a token; no hex or rgba in components.

### 10.2 `src/components/icons.tsx`

Six glyphs on the 24 grid, 1.75 stroke, round caps/joins, outline + solid where noted. A1 draws them in stage 1. The first is named **`reels`** (01 §14.3 gives its path data), and `TabName` gains `'reels'`.

| Name | Drawing | Solid? |
|---|---|---|
| `reels` | A portrait frame (x 5.25, y 2.75, 13.5 × 18.5, rx 2.5) with a play triangle centred inside and two 3 pt ticks on the inner top edge, like a film gate. **No clapperboard band with diagonal stripes** — that is Instagram's glyph. | Yes: filled frame, triangle knocked out. |
| `flip` | Two opposing arcs with arrowheads around a small camera body. | No |
| `flash` | A lightning bolt. | Yes (torch on) |
| `volume` | Speaker with two waves. | No |
| `volumeOff` | Speaker with a diagonal slash. | No |
| `play` | Small right-pointing triangle (tile badge). | Yes (always filled) |

### 10.3 `src/components/ui.tsx`

`ButtonVariant` gains `'onDark'`: `{ bg: colors.reelInk, fg: colors.reelGround, border: colors.reelInk }` — for actions on `reelGround` (gate, empty, error, end pages). Shape follows whatever radius the design spec sets for buttons (squared per house style).

`ReelControl` is **not built**: it is `MediaIconButton` in `ui.tsx` (01 §5.2), same skin as 4.2, `radius.control`, pressed opacity 0.8, `hitSlop` 4. `ButtonVariant` also gains `'onDarkText'` (01 §5.1) for secondary actions on dark.

---

## 11. Account deletion and sign-out (A merges)

`src/store/auth.ts`:

```ts
const SWEPT_BUCKETS = ['pours', 'reels'] as const;

/** emptyPhotoFolder, generalised: same offset-0 loop, same errors. */
async function emptyStorageFolder(bucketName: (typeof SWEPT_BUCKETS)[number], uid: string): Promise<void>;

async function emptyAccountStorage(uid: string): Promise<void> {
  for (const b of SWEPT_BUCKETS) await emptyStorageFolder(b, uid);
}
```

`deleteAccount` becomes:

1. Best-effort `supabase.from('reels').delete().eq('author_id', uid)` (viewers stop seeing clips whose files are about to go; a failure is ignored, the cascade still removes the rows).
2. `emptyAccountStorage(uid)` where `emptyPhotoFolder(uid)` was called (both places, including the `photos_remaining` retry). The error mapping regex stays `/photos_(remaining|not_removed)/`.
3. After success: `clearVideoCacheAsync().catch(() => {})` (expo-video; may refuse while a player exists — ignore).

**Clips store reset (cross-check):** `store/reels.ts` subscribes to `useAuth` at module scope and calls `reset()` whenever `session?.user.id` changes (sign-in as someone else, sign-out, deletion). `store/auth.ts` does not import the clips store, and `settings.tsx` needs no clips call.

`settings.tsx` deletion copy: the merged string in 04 §11 ("every photo and clip you uploaded").

---

## 12. Storage budget and when to upgrade

### 12.1 Per clip

| | Average (15 s) | Maximum (30 s) |
|---|---|---|
| Video, HEVC 1.10 Mb/s + AAC ≤ 0.128 Mb/s | ≈ 2.3 MB | ≈ 4.6 MB (hard stop 5.0 MB) |
| Poster (720 px JPEG, q 0.72) | ≈ 0.1 MB | ≈ 0.15 MB |
| **Stored** | **≈ 2.4 MB** | **≈ 4.75 MB** |
| **Egress per view** (whole file is fetched for clips this short, plus poster, plus ~30 % for the preloaded next clip that is skipped) | **≈ 3.2 MB** | ≈ 6 MB |

### 12.2 Against Supabase plans

Plan figures as published when this was written; confirm on the Supabase pricing page before deciding.

| | Free | Pro ($25/month) |
|---|---|---|
| File storage | 1 GB | 100 GB, then ~$0.021/GB-month |
| Egress | 5 GB/month (+ 5 GB cached) | 250 GB/month (+ 250 GB cached), then ~$0.09/GB |
| Clips that fit (after ~200 MB of photos) | ≈ 330 average / ≈ 170 maximum | ≈ 40,000 average |
| Views per month | ≈ 1,500 (e.g. 50 people × 30 clips) | ≈ 78,000; past that ≈ $0.29 per 1,000 views |
| Worst single account (100 live × 4.75 MB) | ≈ 475 MB — half the free tier | negligible |

Egress, not storage, is the binding limit on free.

### 12.3 Decision

- **Stay on Free while Clips is flag-on only for TestFlight.**
- **Upgrade to Pro the day a build with `EXPO_PUBLIC_REELS=on` goes live on the App Store**, or earlier if Usage shows storage > 700 MB or egress > 3.5 GB in a cycle. Reason: on Free, going over quota is not billed; the project gets restricted, and a restricted project fails sign-in, the feed and the Dex sync, not only video.
- On Pro, keep the spend cap **on** for the first month, set usage email alerts, then decide.

### 12.4 Monitoring (read-only, run weekly in the SQL editor)

```sql
-- Files and bytes per bucket.
select bucket_id, count(*) as files,
       pg_size_pretty(sum((metadata ->> 'size')::bigint)) as stored
from storage.objects group by bucket_id order by bucket_id;

-- Clips posted per day, last 14 days.
select date_trunc('day', created_at)::date as day, count(*)
from public.reels where created_at > now() - interval '14 days'
group by 1 order by 1;

-- Files no clip row points at (orphans; the app sweeps its own on the next recording).
select o.name, o.created_at
from storage.objects o
where o.bucket_id = 'reels'
  and not exists (
    select 1 from public.reels r
    where r.video_path = o.name or r.poster_path = o.name
  )
order by o.created_at;
```

Egress is only visible on **Dashboard → Usage**.

---

## 13. App Store, privacy and terms

### 13.1 App Review (guideline 1.2, user-generated content)

What 1.2 asks for and where it is: a filter for objectionable material (captions through `is_objectionable`, the server trigger); reporting with timely response (… → Report clip, six reasons, the 013 alert, 24 hours per Terms); blocking (… → Block); published contact (support page). Video itself is not machine-screened; the review notes say so plainly rather than imply otherwise.

Paste into **App Review Information → Notes** (edit the account line):

> Sipply now has Clips: short videos (up to 30 seconds) that signed-in people film inside the app and post. To review, sign in with the demo account below, open Clips (second tab) to watch, and tap the camera button at the top right to record — camera and microphone are requested only at that moment. Every clip that is not yours has a ••• menu with Report clip (six reasons; the clip disappears for the reporter immediately) and Block, which hides everything from that person in both directions. Captions pass the same server-side text filter as posts. Every report alerts our moderation channel and is acted on within 24 hours, as the Terms in Settings commit to; content that breaks them is removed and the account suspended. Your own clips can be deleted from the same menu, and deleting your account deletes every clip.
> Demo account: <email> / <password> — it has two clips posted.

Also:

- **Guideline 1.4.3 (alcohol)**: Terms already forbid glamorising underage drinking and drink-driving; add "or drinking to excess" (13.3), and "underage" is already a report reason.
- **Age rating questionnaire**: answer the user-generated-content question Yes (unchanged since photo posts) and keep the alcohol answer at its current level; nothing new to declare unless the questionnaire asks about video specifically, in which case Yes.
- **App Privacy (nutrition label)**: add **Audio Data** — collected, linked to the user, app functionality, not tracking. Confirm **Photos or Videos** is declared (it is in the manifest).
- **5.1.1 purpose strings**: the two strings in 3.1 name the feature specifically.
- **5.1.1(v)**: account deletion removes clips (section 11).
- No background mode is needed: a background URLSession upload does not require `UIBackgroundModes`.

### 13.2 `docs/privacy.md`

Add a **Clips** paragraph beside **Photos**: the video and its sound are recorded only while you hold or tap the record button; nothing is uploaded unless you press Post; a clip, its poster image, caption and optional drink are stored in a private bucket and shown, through links that expire within an hour, to signed-in people you have not blocked. Unlike photos, the video file is not re-encoded: Sipply never writes a location into it, but it may carry the recording time and the phone model that iOS writes into every video. **Verify that sentence before publishing**: post one clip, download it from Storage → reels, and run `mdls <file>.mov | grep -i -E 'model|creat|latitude'` on the Mac; reword to what is actually there. Reports keep a copy of a clip's caption, never the video. In "Other Sipply users can see…", add clips. In the deletion section, clips are deleted with the account.

### 13.3 `docs/terms.md`

In "do not post or send", extend the alcohol line: "Anything encouraging or glamorising underage drinking, drink-driving, **or drinking to excess**". Under "What happens to your content", "Your photos and captions" → "Your photos, clips and captions". Treat-as-public line unchanged.

### 13.4 `docs/data-deletion.md`, `docs/appstore.md`

Data deletion: list clips among what goes. App Store description, after YOUR SHELF:

```
CLIPS

Film a drink in up to 30 seconds and post it to Clips, where everyone on Sipply can watch, like and find out what's in the glass. Tag the Dex entry and it's one tap from your clip to the recipe.
```

Recount the bracketed length after adding it (+~230). `docs/` is the live Pages site; it republishes when main moves, so merge the docs with (not before) the build that turns Clips on.

---

## 14. Device QA (must pass before the flag goes on)

1. PlistBuddy prints both purpose strings (3.3).
2. First open of `/record`: primer → camera prompt → microphone prompt. Deny microphone → records silently with the "No sound" chip.
3. Tap mode stops itself at 30 s; ring fills linearly; the `.mov` is ≤ 5,000,000 bytes (log `new File(uri).size` in a dev build).
4. Hold mode stops on release; a < 1 s clip is discarded with the message.
5. Flip disappears while recording; torch works on the back camera.
6. Backgrounding mid-recording lands on review with what was captured.
7. Review audio plays from the **speaker**, not the earpiece.
8. Post on cellular: progress moves; Cancel leaves **no** files in `reels/<uid>/` (check Storage).
9. A caption with a blocked term shows the filter message; nothing is uploaded.
10. 11th clip in 24 h: the gate says so before the camera opens; a hand-crafted 11th insert raises `reel_quota_day`.
11. Viewer: only one clip ever has sound; swipe 10 fast — no doubled audio, no stutter; switching tab pauses and releases; returning resumes; backgrounding pauses.
12. Single tap mutes after ~250 ms; double tap likes once and never unlikes; long press pauses and hides overlays.
13. Block from a clip: their clips vanish from Clips and profiles; from the other account, the blocker's clip files no longer sign.
14. Report: the clip disappears for the reporter and stays gone after relaunch; `reports` has `reported_reel_id` and a `snapshot` with `kind: 'reel'`; the webhook says "a reel".
15. Delete own clip: row gone, both files gone.
16. Delete an account that has clips and photos: succeeds; both folders empty.
17. A landscape-held recording plays letterboxed, not cropped.
18. VoiceOver: record in tap mode, post, then page clips with three-finger swipes and like via the rotor action.
19. `npx tsc --noEmit`, `npx expo lint`, `node scripts/check-contrast.mjs`, `node scripts/check-design.mjs` all pass; `scripts/check-native-links.sh` passes on the IPA.

---

## 15. What Jan must do outside the code

1. **Supabase SQL editor**: apply `019_reels.sql` after 016–018, run its VERIFY block, then the smoke test with your user id.
2. **Supabase → Storage → Settings**: confirm the global upload size limit is at least 6 MB (the default 50 MB is fine).
3. **Report alerts**: if `report_alert_url` was never stored in Vault (013), set it now; clips add moderation load.
4. **Native build** (3.3): prebuild `--clean`, PlistBuddy check, bump `ios.buildNumber`, `scripts/build-ios.sh`, upload.
5. **Device check** (section 14), then set `EXPO_PUBLIC_REELS=on` in `.env`; it can ship as an EAS Update to the build from step 4.
6. **App Store Connect**: App Privacy → add Audio Data; age-rating answers per 13.1; review notes and a demo account with two clips.
7. **Billing**: upgrade to Pro when the flag-on build goes public on the App Store (12.3); turn on usage alerts.
8. **Docs**: merge the privacy/terms/data-deletion/appstore edits with the flag-on release; verify the metadata sentence first (13.2).
