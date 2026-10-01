# 00 · Build plan (cross-checked)

Status: binding for **who edits which file and when**. Written 30 Sep 2026 after reading specs 01 to 07 in full and checking them against branch `reels-and-redesign`.
What to build is still in specs 01 to 07; each of them now opens with a "cross-check reconciliation" block that records what changed. Where a spec and this file disagree about ownership or order, this file wins. Where they disagree about a screen's composition, the screen's spec wins; about a shared token or primitive, 01 wins.

Spec tags: **01** design v2, **02** sign-in, **03** home and profile, **04** custom drinks, **05** clips, **06** tab-switch bug and cold-start intro, **07** location (long term, not built now).

---

## 1. Conflicts found, and how each was settled

Every row was fixed in the spec files themselves (section 8 lists the edits).

| # | Between | Conflict | Resolution |
|---|---|---|---|
| 1 | 02, 03, 04, 05, 07 | Migration numbers: 04 and 05 both claimed `016`; 02 and 03 said "next free"; 07 said "019 or later". | **016** sign-in lookup (02; the only one a release build needs), **017** home and profile (03), **018** drink submissions (04), **019** reels (05), **020** places (07, deferred). All five specs edited. |
| 2 | 01 vs 03, 07 | Top bar API: 01 defines `ScreenTopBar` / `TopBarButton`; 03 and 07 were written against `TopBar variant="root\|push\|modal"`, `IconButton`, `leading={{kind}}`, `divider`, `useScrolledPast`, and 01 claimed to copy a "03 §5.1 API" that does not exist. | 01's API is canonical. 01 gained `TopBarButton.badge`, `titleRef` and an exported `useScrolledPast`. 03 has a name map (03 §0.1) and its code blocks were rewritten; 07 likewise. |
| 3 | 01 vs 03 | Token names: 03 used `radius.tag`, `textRole.rootTitle`, `mediaBg`, `surfaceDark`, `textOnDarkMuted`, `lineOnDark`, `lineOnMedia`, `EmptyState tone="media"`, none of which 01 defines. | Mapped onto 01 and 05's tokens (`radius.badge`, `barTitleLg`, `reelGround`, `reelInk`, `reelInkMuted`, `reelTrack`, `reelScrim`, `tone="dark"`). No new tokens. |
| 4 | 01 vs 03 | Profile top bar: 01 said "@handle" with a `menu` glyph to Settings; 03 decided bare username and the Settings gear (keeps the docs' "gear, top right" true). | 03 wins (screen composition). 01 §7 edited; no `menu` glyph is drawn. |
| 5 | 01 vs 05 | Tab bar on Clips: 05 assumed the light glass bar and "Stats moves into Profile". | 01 owns the bar: it turns dark on Clips (only when signed in, so the cream sign-in screen keeps a paper bar), there is no glass, and Stats is a pushed screen from the Dex top bar. 05 edited. |
| 6 | 01, 05 vs 03, 07 | Where the Clips flag lives: `src/lib/reels.ts` (01, 05) vs `src/lib/flags.ts` (03, 07). | `REELS_ENABLED` in `src/lib/reels.ts`; 07's `PLACES_ENABLED` in `src/lib/places.ts`. **No `flags.ts`.** |
| 7 | 03 vs 05 | Profile clips: 05 added "Clips" segments to `OWN_SEGMENTS`/`PEER_SEGMENTS` (which 03 deletes), kept `numColumns={3}`, and built `ReelTile.tsx` + `useReelsByAuthor`; 03 has one `numColumns={1}` list of pre-chunked rows, a stubbed `videosSource` seam (`WIRED = false`) and a tab labelled "Videos". | 03's structure wins. `videosSource.ts` is wired from the start against B1's stage-1 exports; no `ReelTile.tsx`; the tab is labelled `COPY.label` ("Clips") so the feature has one name. 03 and 05 §8.1 rewritten. |
| 8 | 01 vs 05 | Icon name `reels` (01) vs `reel` (05). | `reels`, with 05's drawing. |
| 9 | 01 vs 05 | `ReelControl.tsx` vs 01's `MediaIconButton`. | No `ReelControl.tsx`; 05 imports `MediaIconButton`. |
| 10 | 06 vs 05 | 05's pager set `removeClippedSubviews`, which 06 rule 5 bans (it blanks whole lists on iOS Fabric). | Removed from 05. |
| 11 | 06 vs 02 | 02's step body used `entering={FadeIn}` / `exiting={FadeOut}`: lint rule 3 fails, and an `exiting` is the ghost-view bug 06 §3.8 fixes. | Removed; steps swap instantly. |
| 12 | 06 vs 05, 03 | Overlays that must disappear depended on animations finishing (05's 150 ms overlay fade, mute flash, heart burst; 03's double-tap burst). 06 shows animations can stall after a cold start. | Overlays toggle instantly; flash and bursts are unmounted by JS timers. |
| 13 | 02 vs 06 | Both rewrote `AuthGate`'s body: 02 `AuthWait`, no `signsInSocially`, wait for every new account; 06 `GateHold`, a 4 s capped and sticky row wait, keeps `signsInSocially`. 02 also claimed the wait was bounded by `refreshProfile`'s retries, which 06 disproves. | One merged body in **02 §9.1**: 06's `Hold`, `rowWaitOver`, `ROW_WAIT_MS`, plus 02's `SignInScreen`, `onClose` and all-accounts wait. 06 §3.5 points to it. |
| 14 | 06 vs 04, 05 | 06 rule 3 (no featureless hold) vs 04's custom detail ("render the background only" while hydrating) and 05's camera gate ("show nothing" until permissions read). | 06's `GateHold` becomes the shared primitive **`Hold`** in `ui.tsx` (01 §5.17), used by AuthGate, 04, 05 and every first load. |
| 15 | 01 vs 02 | 02 drew a 56pt title bar with a `borderStrong` hairline, a 52pt Continue with radius overrides, its own `auth/FieldGroup.tsx` with one wine ring around the group, wine code-cell focus, an uppercase `SectionLabel` in the picker, and 24pt gutters. | 01's primitives: `AuthTitleBar` wraps `ScreenTopBar` (44pt, `line` rule); Continue 48; `FieldGroup`/`SelectField`/`Field` from `ui.tsx` (per-row `lineInk` ring); no `auth/FieldGroup.tsx`; `ProviderButton` wraps `Button secondary block leading`; `SectionHeader size="group"`; 16pt gutters. |
| 16 | 01 vs 02 | 02's read-only email row needs a real `TextInput` (iOS AutoFill pairing) with a trailing "Change"; 01's `Field` had no trailing slot or ref. | 01's `Field` gains `trailing` and passes `ref` through. |
| 17 | 01 vs 04 | 04 created `ChoiceChip.tsx`, used `ghost` buttons, `SectionLabel`, an uppercase "ADDED BY YOU" eyebrow, `GlassCircle`, `haptic.warning` (does not exist), `radius.sm/lg`, a Playfair modal title. | 01's `Chip`, `text` buttons, `SectionHeader`, "Added by you · style" in sentence case, `MediaIconButton`, `haptic.error`, 01 radii, `ScreenTopBar` with Cancel. No `ChoiceChip.tsx`. |
| 18 | 01 vs 05 | On `reelGround`, 01's `text` button is wine (1.12:1) and `muted` is ≈3.2:1, so 05's "Not now" / EmptyState secondary actions would be invisible. | New Button variant **`onDarkText`** (label `reelInk`); `EmptyState tone="dark"` uses it. |
| 19 | 01 vs 03 | 03's markers over photos (gallery count, stack) used `scrim` + `textOnWine` at 11pt; that fails 4.5:1 over a bright photo. | Markers use `reelScrim` + `reelInk` (≈10:1 over white); contrast pair added to 01 §13.2. |
| 20 | 04 vs 05 | Both created `src/lib/drinkSearch.ts`, with different APIs. | One file, owned by B2, with 04's superset API; 05 imports it. |
| 21 | 03, 04, 05, 06 | `src/lib/social.ts`, `PostCard.tsx` and `database.types.ts` were each edited by three or four specs. `useSignedPhoto` and `isRenderablePost` lived in `PostCard.tsx`, which would make Home and Profile (and Clips) depend on each other inside one stage. | `useSignedPhoto` moves to new **`src/lib/useSignedPhoto.ts`** (with 05's bucket argument) and `isRenderablePost` moves to **`src/lib/social.ts`**, both built by A2 in stage 1. PostCard re-exports/imports them. 06 and 05 edited. |
| 22 | 05 vs 02 | 05 put the clips-store reset inside `store/auth.ts`; that makes the sign-in data package import the clips store in the same stage. | `store/reels.ts` subscribes to `useAuth` and resets itself on a user change. |
| 23 | 02 (stage 1) vs today's `AuthForm` (stage 2) | 02 changes `signUp`'s signature; the old `AuthForm` still calls it until C2 lands, so stage 1 would not compile. | The new action is `signUpEmail`; the old `signUp` stays `@deprecated` until stage 3. |
| 24 | 01 vs everyone | 01 had DS do a mechanical pass over **every** file in Phase 1 and delete old token names, which cannot coexist with file-disjoint packages. | Old names stay `@deprecated` (old values) through stages 1–2; each file's owner migrates it; A1 deletes the old names in stage 3 and `tsc` proves completeness. |
| 25 | 06 vs this plan | 06 asked for its fixes to ship as a separate TestFlight before the redesign. That needs the shared files edited before the packages fork, which puts files in two hands. | Dropped. Each 06 hunk is the first commit (prefixed `06:`) in its owning package, so it stays revertable; the "before" protocol runs on build 11 (already on TestFlight), the "after" protocol on the release build. The intro change still ships only with the cause-1 fix. |
| 26 | 02 vs 03, 05 | Gated pushed and modal routes would "close" sign-in to the Dex tab, stranding a modal. | Every gated pushed/modal route passes `onClose` that leaves the route (02 reconciliation 9). |
| 27 | 03, 04, 05 vs 01 | 03 relied on `ActivityIndicator` for first loads; 06 rule 3 asks for a message by 8 s. | First loads are `Hold` (01 §11). |
| 28 | 04, 05, 03 | Account-deletion copy: 04 and 05 each rewrote it; 03 adds saves. | One merged string in 04 §11, shipped by C7. |
| 29 | 07 vs 03, 01 | 07 used 52pt for PostCard's author row (03 says 56), "rule 3" for `round-ok` (it is rule 4), skeleton rows (01 allows static placeholders only for media grids), and assumed 04 creates `supabase/functions/`. | Fixed in 07. |

Checked and found consistent: account deletion covers every new store of user data (`saves` and `drink_submissions` cascade from `profiles`; 04's photos live in `pours/<uid>/`, which the sweep already empties; 05's sweep adds `reels/<uid>/`; 02's `sign_in_lookups` holds no user id); `flowType` stays implicit everywhere; custom drinks never reach the feed, so `isRenderablePost` needs no widening; the intro and the inline sign-in never race a native modal; every new flag defaults off.

---

## 2. Rules every package follows

1. **One owner per file.** Only the package that owns a file edits it, and it applies **every** spec's change to that file (each package below lists the spec sections). If you need something in another package's file, ask its owner; never edit it.
2. **Two stages, plus a short cleanup.**
   - **Stage 1, foundations** (theme and primitives, migrations, types, data-layer modules). Wave 1 is A1 and A2, which depend on nothing. Wave 2 is B1, B2 and B3, which depend only on A2's contracts: they can start coding at once against the types the specs spell out, and they merge after A2.
   - **Stage 2, screens** (C1 to C8), which import stage-1 code freely.
   - **Stage 3, cleanup and release**, done by the owners of the files involved.
3. **No same-stage imports of new code**, except wave 2 on A2, and the stage-2 day-one interface commits in rule 4.
4. **Day-one commits in stage 2**, merged to the integration branch within the first day so the others typecheck:
   - **Route stubs.** Each package's first commit creates every route it owns, rendering `<Hold slowMessage="Not built yet." />` (C5's `(tabs)/reels.tsx` renders 05's flag-off `<Redirect href="/" />`). C3: `/pours/[authorId]`, `/activity`, `/post/[id]`. C4: `/saved`, `/connections/[id]`. C5: `(tabs)/reels`, `/record`, `/reel/[id]`. C6: `/add-drink`, `/custom/[id]`. C1: `/stats` (the move keeps the same path).
   - **C2:** `AuthGate` gains `onClose?: () => void` (accepted, unused until the rest lands).
   - Then run `npx expo start` once in each worktree so typed routes regenerate (`.expo/types` is not committed).
5. **06 hunks go first.** In every shared file the 06 change is that package's first commit, message prefix `06:`, and carries nothing else.
6. **Deprecated names** (01 §2 override) may be read but never added. Each package converts its own files to 01's names in stage 2.
7. **Contracts that stay stable across stage 2:** `PostCard.tsx` (C3) keeps exporting `timeAgo`, `timeAgoSpoken` and `useSignedPhoto` (as a re-export); `PeopleList.tsx` (C4) keeps `FollowButton`'s props; `FloatingTabBar.tsx` (C1) keeps exporting `TAB_BAR_CLEARANCE = 84`.
8. **Flags stay off** in `.env` for the whole build: `EXPO_PUBLIC_PHONE_SIGN_IN`, `EXPO_PUBLIC_GOOGLE_SIGN_IN`, `EXPO_PUBLIC_REELS` (plus today's Apple and Facebook flags as they are). Turning one on is Jan's step after his setup (section 7).
9. **Worktrees.** One worktree per package under `~/Projects/drinkdex-worktrees/<package>`, branched from `reels-and-redesign`, merged back into it; never share a worktree between sessions.
10. **Merge gate for every package:** `npx tsc --noEmit`, `npx expo lint`, `node scripts/check-contrast.mjs`, and `node scripts/check-design.mjs` with **no violation in a file this package owns** (other packages' files may still report until they merge). Plus the package's own "done" line below.

---

## 3. Stage 1: foundations

### A1 · Design system (wave 1, depends on nothing)

| File | | What (spec sections) |
|---|---|---|
| `src/constants/theme.ts` | M | 01 §3 (radius, `line`/`lineControl`/`lineInk`, `stroke`, `layout`, `textRole`, `elevation.bar`, `motion.pressScale`, `foil`, `reelBar`, `reelInkDim`); 05 §10.1 clip tokens verbatim; 02 §4.6 Google mark colours. Old names stay `@deprecated` (01 §2 override). |
| `src/components/ui.tsx` | M | 01 §5 in full: Button (variants incl. `tonal`, `onDark`, `onDarkText`, `leading`), `MediaIconButton`, Field (label-inside, `invalid`, `labelHidden`, `trailing`, `ref`), `FieldGroup`, `SelectField`, SearchField, `OrDivider`, `Chip`, tags (`CategoryTag`, `Tag`), Card, `ListGroup`, `ListRow`, Divider, `SectionHeader` (+ `SectionLabel` alias), SegmentedControl, `Notice`, EmptyState (`actionVariant`, `secondaryAction`, `tone`), ProgressBar, Avatar `round-ok`, `Hold` (01 §5.17, from 06 §3.5's `GateHold`). `haptic.error` (02). Deletes `GoldButton`. |
| `src/components/ScreenTopBar.tsx` | C | 01 §5.12: `ScreenTopBar`, `TopBarButton` (with `badge`), `TopBarTextButton`, `useScrolledPast`. |
| `src/components/TabStrip.tsx` | C | 01 §5.13. |
| `src/components/icons.tsx` | M | 01 §14.3 (`reels`, `alert`, `TabName` + `'reels'`); 02 §4.6 (`mail`, `GoogleMark`); 03 §3 (`addPerson`, `stack`); 05 §10.2 (`flip`, `flash`, `volume`, `volumeOff`, `play`). Not `pin` (07) and not `menu`. |
| `src/components/glass.tsx` | M | 01 §3.8: `GlassSurface` default radius `radius.card`. Deleted in stage 3. |
| `src/components/DexCard.tsx` | M | 01 §14.3: card radius `control`; `glass.sheen*` → `foil.*`. |
| `scripts/check-design.mjs` | M | First commit `06:` rule 3 (06 §3.1); then 01 §13.1 rules 4 and 5. |
| `scripts/check-contrast.mjs` | M | 01 §13.2 pairs, 05 §10.1's six pairs, the marker pair. Stage 3: drop the glass pairs. |

Done when: the merge gate passes, every new primitive has been rendered once in a scratch route that is **not** committed (paper and dark tones, Dynamic Type default and AX3), and `check-design` reports nothing in A1's files.

### A2 · Data hub (wave 1, depends on nothing)

| File | | What |
|---|---|---|
| `supabase/migrations/016_sign_in_lookup.sql` | C | 02 §10.1. |
| `supabase/migrations/017_home_and_profile.sql` | C | 03 §4.1. |
| `supabase/migrations/018_drink_submissions.sql` | C | 04 §7 (7.1–7.5; create `submission_todo` and `submission_meta` before `submission_entry`, then `submission_card_html`, `digest_html`, send, check, schedule). |
| `supabase/migrations/019_reels.sql` | C | 05 §5.2, verbatim with 019 numbering. |
| `supabase/migrations/012_report_retention.sql` | M | The one header line from 05 §2 ("Since 019: do not re-run…"). |
| `supabase/schema.sql` | M | Fold in 016–019 in their matching sections, four `schema_migrations` rows, header "as of 019". |
| `src/lib/database.types.ts` | M | 02 §10.2, 03 §4.1, 04 §7.6, 05 §5.4. |
| `src/types.ts` | M | 03 §4.2, 04 §6.1. |
| `src/lib/supabase.ts` | M | First commit `06:` AppState start/stop (06 §3.7); then 05's exports `SUPABASE_URL`, `SUPABASE_KEY`. Never touch `flowType` or `detectSessionInUrl`. |
| `src/lib/social.ts` | M | First commit `06:` `isRenderablePost` (06 §3.3, moved here); 03 §4.3 queries and `savedByMe`; 04's one-word `export` of `putStrippedPhoto`; 05 §6.3 bucket-aware signed URLs and `primeSignedUrls`. |
| `src/lib/useSignedPhoto.ts` | C | `useSignedPhoto` moved verbatim from `PostCard.tsx` (with its doc comment) plus 05's `bucket = 'pours'` argument. PostCard keeps its own copy until C3 replaces it with a re-export. |
| `src/store/social.ts` | M | 03 §4.4. |
| `src/lib/moderation.ts` | M | 05 §9.1 `reportReel`. |

Done when: the merge gate passes; each migration has been read against its spec by a second person (header blocks, `schema_migrations` insert last, safe to re-run); `schema.sql` and `database.types.ts` match them.

### B1 · Clips data and native config (wave 2, depends on A2)

| File | | What |
|---|---|---|
| `src/lib/reels.ts` | C | 05 §3.4 flag, §6.1 (constants, `COPY`, types, fetch/post/delete/like, quota, orphan sweep). |
| `src/lib/reelMedia.ts` | C | 05 §4.5. |
| `src/store/reels.ts` | C | 05 §6.2 plus `reelsVersion` and the self-reset on a `useAuth` user change (05 reconciliation). |
| `app.json` | M | 05 §3.1 (camera plugin; image-picker strings) and §3.2 (Audio Data in the privacy manifest). Stage 3: `expo.ios.buildNumber`. |
| `.env` | M | 05 §3.4 block and 02 §3 block, verbatim, all `off`. |

Done when: the merge gate passes, and a **dev-client build** with the new `app.json` is on Jan's phone (prebuild `--clean` with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`, both PlistBuddy strings print, `scripts/check-native-links.sh` passes; take the build lock), so C5 can record on a device.

### B2 · Custom-drinks data and catalogue scripts (wave 2, depends on A2)

| File | | What |
|---|---|---|
| `src/lib/customDrinks.ts` | C | 04 §2.4, §3, §5.1's normalisation, `validateCustom`, `toDrink`, `catalogueTwin`. |
| `src/lib/drinkSearch.ts` | C | 04 §4's superset (`fold`, `WORD_CHAR`, `atWordStart`, `SEARCH_INDEX`, `rank`, `MAX_RESULTS`, `searchCatalogue`, `rankCustom`, `similarByName`), copied verbatim from `log.tsx` (C6 switches `log.tsx` to it). 05's `DrinkTagSheet` and 07's picker import it. |
| `src/lib/submissions.ts` | C | 04 §6.3. |
| `src/lib/guardedStorage.ts` | C | 04 §6.2. |
| `src/lib/pour.ts` | M | 04 §4: the helpers moved out of `store/collection.ts`, `persistCustomPhoto`, `customPhotoUri`. |
| `src/store/customDrinks.ts` | C | 04 §6.2. |
| `src/store/collection.ts` | M | 04 §4, §6.4: import the moved helpers; `adopt`. |
| `src/components/SubmissionSync.tsx` | C | 04 §6.3. |
| `scripts/import-submissions.mjs` | C | 04 §8. |
| `scripts/lib/dex-merge.mjs` | M | 04 §3 check 7 (id alphabet). |
| `scripts/lib/prove-guards.mjs` | M | 04 §3 planted failure for `u_x`. |

Done when: the merge gate passes, `node scripts/lib/prove-guards.mjs` fires the new case, and `node scripts/import-submissions.mjs --dry` runs on a hand-written two-entry attachment.

### B3 · Sign-in data (wave 2, depends on A2)

| File | | What |
|---|---|---|
| `src/store/auth.ts` | M | 02 §3 flags, §5.1 flow resets, §6.5 phone, §7.1 lookup, §7.3 as **`signUpEmail`** (old `signUp` kept `@deprecated` until stage 3), §8.2 Google and `finishOAuth`; 05 §11 bucket sweep and `deleteAccount` steps 1–3. Every other existing export keeps its signature. |
| `src/store/signInFlow.ts` | C | 02 §5.1. |
| `src/lib/oauth.ts` | C | 02 §8.1 (the implicit-flow header comment moves word for word). |
| `src/lib/facebook.ts` | M | 02 §8.1 (thin wrapper; friends code untouched). |
| `src/lib/phone.ts` | C | 02 §6.2 (no imports). |
| `src/data/countries.ts` | C | 02 §6.1 (no emoji, no flags). |
| `scripts/check-phone.mjs` | C | 02 §17 step 2. |
| `src/app/+native-intent.tsx` | M | 02 §2: import `AUTH_CALLBACK_PATH` from `@/lib/oauth`. |

Done when: the merge gate passes, `node scripts/check-phone.mjs` passes, and today's sign-in (still the old `AuthForm`) signs in by email and Apple on a dev client.

### Stage-1 gate

All five merged; the merge gate passes on the whole tree except rules 3–5 of `check-design` in stage-2 files. **Jan applies migrations 016, 017, 018 and 019** (section 7, step 1) so stage-2 screens test against real tables. Installed builds are unaffected: 017–019 are "feature off" when absent and unused by build 11 when present, and 016 is additive.

---

## 4. Stage 2: screens

### C1 · Shell, navigation and intro (depends on A1, B1, B2)

| File | | What |
|---|---|---|
| `src/app/_layout.tsx` | M | First commit `06:` intro (06 §5 step 2, with the three files below). Then 01 §14.3 (`SipplyTheme.colors.border: colors.line`) and every `Stack.Screen`: `stats` (01), `pours/[authorId]` (03 §2), `add-drink` and `custom/[id]` (04 §4), `record` and `reel/[id]` (05 §7.1). Mount `<SubmissionSync />` beside `<InviteLinkHandler />`, outside the splash gate (04 §9). |
| `src/app/(tabs)/_layout.tsx` | M | First commit `06:` `animation: 'none'` (06 §3.2). Then 01 §6.5 (`index`, `reels` with 05 §7.1's options and `title: COPY.label`, `dex`, `profile`; `stats` removed). |
| `src/components/FloatingTabBar.tsx` | M | 01 §6 rewrite (includes 06 §3.2's comment sentence and 05 §7.1's flag-aware slots; dark skin only when signed in). |
| `src/components/Grain.tsx` | M | 05 §7.1 / 01 §8 pathname rule. |
| `src/app/(tabs)/stats.tsx` | D | 01 §14.2, in the same commit as the next row (both resolve to `/stats`). |
| `src/app/stats.tsx` | C | 01 §14.1. |
| `src/components/CollectionStats.tsx` | M | First commit `06:` entrances removed (06 §3.1). Then 01 §14.3 (P1 + P3). |
| `src/lib/intro.ts` | C | 06 §5 step 1. |
| `src/components/VideoIntro.tsx` | M | 06 §5 step 3. |
| `src/components/InviteLinkHandler.tsx` | M | 06 §5 step 4. |

Done when: 01 §17's tab-bar items pass on a dev client, Stats opens from the Dex top bar and swipes back, and the intro plays after a swipe-away and not after a background (06 §8 item 4).

### C2 · Sign-in screens (depends on A1, B3)

| File | | What |
|---|---|---|
| `src/components/AuthGate.tsx` | M | Day one: `onClose?` prop. First real commit `06:` 06 §3.5 steps 1, 2 (as `Hold` from `ui.tsx`) and 4 on today's body. Then 02: the merged body in 02 §9.1, removals in 02 §2, `ChooseUsername` (02 §9.2), 01 §14.3. Keep exporting `AuthMessage`. |
| `src/components/auth/SignInScreen.tsx` | C | 02 §3, §4, §5.2 (with the reconciliation block). |
| `src/components/auth/AuthTitleBar.tsx` | C | 02 §4.2 as a `ScreenTopBar` wrapper. |
| `src/components/auth/ProviderButton.tsx` | C | 02 §4.6 as a `Button` wrapper. |
| `src/components/auth/PhoneCodeStep.tsx` | C | 02 §4.9, §6.4. |
| `src/components/auth/EmailSteps.tsx` | C | 02 §5.2, §7. |
| `src/components/auth/CountryPicker.tsx` | C | 02 §6.3. |
| `src/components/auth/Consent.tsx` | C | 02 §4.8 (moved out of AuthGate unchanged). |
| `src/components/WelcomeConnect.tsx` | M | 01 §14.3 (P1 + P3). |
| `src/app/user/[id].tsx` | M | 02 §9.1 (`onClose={leave}` on both gates; header comment). |

Done when: 02 §17 step 3 passes with all flags off and with phone on against a Supabase test number, and 06 §8 items 6 and 7 pass on a dev client.

### C3 · Home (depends on A1, A2)

| File | | What |
|---|---|---|
| `src/app/(tabs)/index.tsx` | M | First commit `06:` entrances out and `visibleFeed` (06 §3.1, §3.3). Then 03 §6. |
| `src/components/PostCard.tsx` | M | 03 §6.4; `isRenderablePost` imported from `@/lib/social`; `useSignedPhoto` re-exported from `@/lib/useSignedPhoto`; 01 §14.3. |
| `src/components/home/TodaysPours.tsx` | C | 03 §6.3. |
| `src/components/home/groupPours.ts` | C | 03 §6.3. |
| `src/app/pours/[authorId].tsx` | C | 03 §7. |
| `src/app/activity.tsx` | C | 03 §9. |
| `src/app/post/[id].tsx` | C | 03 §10.2 (own UUID regex). |
| `src/store/seen.ts` | C | 03 §4.5. |

Done when: 03 §13's Home, viewer, Activity and post checks pass (with migration 017 applied and with it absent on a scratch project, or by renaming the RPC as 02 §17 does).

### C4 · Profile (depends on A1, A2, B1)

| File | | What |
|---|---|---|
| `src/app/(tabs)/profile.tsx` | M | 03 §8.1. |
| `src/components/PeerProfile.tsx` | M | 03 §8.1 (exports `ACCOUNT_ID`). |
| `src/components/PeopleList.tsx` | M | 03 §2 `hideFollow`; 01 §14.3 (P1 + P3). |
| `src/app/find-friends.tsx` | M | 03 §10.4; 01 §7 top bar and gutter. |
| `src/components/profile/ProfileView.tsx` | C | 03 §8.2, §8.5. |
| `src/components/profile/ProfileHeader.tsx` | C | 03 §8.2, §8.3. |
| `src/components/profile/PostGrid.tsx` | C | 03 §8.5. |
| `src/components/profile/DexShelf.tsx` | C | 03 §8.6. |
| `src/components/profile/VideoGrid.tsx` | C | 03 §8.7 and 05 §8.1 (tile). |
| `src/components/profile/videosSource.ts` | C | 03 §8.7 as rewritten (wired to `@/lib/reels`). |
| `src/components/profile/usePostsByAuthor.ts` | C | 03 §2 (moved from `PeerProfile.tsx`). |
| `src/components/profile/useProfileCounts.ts` | C | 03 §4.4. |
| `src/app/connections/[id].tsx` | C | 03 §10.1. |
| `src/app/saved.tsx` | C | 03 §10.3. |
| `src/lib/profileLink.ts` | C | 03 §8.3. |

Done when: 03 §13's Profile items pass, including the Clips tab with `EXPO_PUBLIC_REELS=on` locally (never committed) once C5 has merged.

### C5 · Clips screens (depends on A1, A2, B1 and its dev-client build, B2)

| File | | What |
|---|---|---|
| `src/app/(tabs)/reels.tsx` | C | 05 §7.2 (first commit: flag-off redirect). |
| `src/app/record.tsx` | C | 05 §4. |
| `src/app/reel/[id].tsx` | C | 05 §8.2. |
| `src/components/reels/ReelPager.tsx` | C | 05 §7.3 (no `removeClippedSubviews`). |
| `src/components/reels/ReelCell.tsx` | C | 05 §7.4, §7.5, §9.1. |
| `src/components/reels/ReelVideo.tsx` | C | 05 §7.6. |
| `src/components/reels/RecordButton.tsx` | C | 05 §4.2 (`// round-ok: shutter`). |
| `src/components/reels/Recorder.tsx` | C | 05 §4.2. |
| `src/components/reels/ReelReview.tsx` | C | 05 §4.3, §4.4. |
| `src/components/reels/CameraGate.tsx` | C | 05 §4.1. |
| `src/components/reels/DrinkTagSheet.tsx` | C | 05 §4.3. |

Done when: 05 §14 items 2–18 pass on Jan's phone with the flag on locally.

### C6 · Catalogue screens: Dex, drink page, log, custom drinks (depends on A1, A2, B2)

| File | | What |
|---|---|---|
| `src/app/(tabs)/dex.tsx` | M | First commit `06:` (06 §3.4, §3.8). Then 01 §7 and §14.3 (fixed `ScreenTopBar` with the Stats button, progress rule, list-header order, scroll-to-top), 04 §1.1–1.3 (shelf, empty state, footer, handoff). |
| `src/app/drink/[id].tsx` | M | First commit `06:` (06 §3.1). Second commit: 04's extraction into `DrinkPanels.tsx`, nothing else. Then 01 §14.3 (P1–P3, `MediaIconButton` back). |
| `src/components/DrinkPanels.tsx` | C | 04 §4 (moved), then 01 §14.3's panel edits (`Tag`, bare step numerals). |
| `src/app/log.tsx` | M | 04 §1.4 (search from `@/lib/drinkSearch`, "Yours" rows, add-a-drink CTA, `?drink=` param); 01 §7 and §14.3. |
| `src/app/add-drink.tsx` | C | 04 §5.1–5.3 (with the reconciliation block). |
| `src/app/custom/[id].tsx` | C | 04 §5.5. |
| `src/components/CustomDrinkTile.tsx` | C | 04 §5.4. |

Done when: 04 §13 checks 1–13 and 16–17 pass, and 06 §8 item 3 (fling the Dex, tap Home, return) passes.

### C7 · Remaining screens, v2 polish (depends on A1, B2)

| File | | What |
|---|---|---|
| `src/app/settings.tsx` | M | 01 §7 and §14.3; 03 §10.5 ("Your activity": Saved, Activity); 04 §11 (`clearPours`, `resetAll`, the merged confirm copy, which also covers 05 §11). |
| `src/app/bar.tsx` | M | 01 §14.3. |
| `src/app/blocked.tsx` | M | 01 §14.3. |
| `src/app/edit-profile.tsx` | M | 01 §7 and §14.3. |
| `src/components/CelebrationOverlay.tsx` | M | First commit `06:` (06 §3.8). Then 01 §14.3 (P1 + P3; the choreography stays). |
| `src/components/FindFriends.tsx` | M | 02 §9.3 prefill; 01 §14.3. |
| `src/components/FacebookFriends.tsx` | M | 01 §14.3. |
| `src/components/InstagramImport.tsx` | M | 01 §14.3. |
| `src/components/PasswordResetOverlay.tsx` | M | 01 §14.3. |

Done when: every screen in this table passes 01 §17's checklist on a 375pt and a 430pt device, and 06 §8 item 8 passes.

### C8 · Docs (depends on nothing; merges with the release)

| File | | What |
|---|---|---|
| `docs/privacy.md` | M | 02 §16, 03 §4.6, 04 §12 (release commit); 05 §13.2 (held commit). |
| `docs/terms.md` | M | 04 §12 (release); 05 §13.3 (held). |
| `docs/appstore.md` | M | 02 §16 (release); 05 §13.4 (held). |
| `docs/testflight.md` | M | 02 §16 (the Supabase test number). |
| `docs/data-deletion.md` | M | 05 §13.4 (held). |

`docs/` is the live Pages site and republishes when `main` moves. The **release commit** merges with the release (02's text must be live before Jan turns on phone or Google; 04's ships with the release). The **held commit** (Clips) sits on branch `docs-clips` and merges only when Jan turns Clips on, after 05 §13.2's `mdls` check of a real posted clip.

### Stage-2 gate

Every package merged; `check-design` reports **zero** on the whole tree (all five rules); typed routes regenerated; each package's "done" list re-run once on the integrated branch.

---

## 5. Stage 3: cleanup and release

1. **A1:** delete the deprecated names (01 §2 override), the `glass` object, `src/components/glass.tsx` and the glass contrast pairs. `npx tsc --noEmit` must pass: that proves every old site was converted.
2. **B3:** delete the old `signUp` from `store/auth.ts`.
3. **B1:** bump `expo.ios.buildNumber` in `app.json` to the next unused number.
4. **Release build:** take the build lock; `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo prebuild -p ios --clean`; both PlistBuddy prints (05 §3.3); `scripts/build-ios.sh` (runs `scripts/check-native-links.sh`); upload to TestFlight. This is a native build: the camera plugin changed Info.plist.
5. **Verification on that build:** 06 §8's "after" protocol (Release only), then each spec's acceptance list with all flags off.

---

## 6. Deferred: L · Location (07), not in this build

L owns only the files 07 creates. When Jan schedules it, it becomes its own plan.

| File | | |
|---|---|---|
| `modules/sipply-places/expo-module.config.json` | C | 07 §6 |
| `modules/sipply-places/index.ts` | C | 07 §6.1 |
| `modules/sipply-places/ios/SipplyPlaces.podspec` | C | 07 §6 |
| `modules/sipply-places/ios/SipplyPlacesModule.swift` | C | 07 §6.2 |
| `modules/sipply-places/ios/OneShotLocator.swift` | C | 07 §6 |
| `supabase/migrations/020_places.sql` | C | 07 §4 |
| `supabase/functions/_shared/appleMaps.ts` | C | 07 §5.1 |
| `supabase/functions/place-resolve/index.ts` | C | 07 §5.2 |
| `supabase/functions/places-refresh/index.ts` | C | 07 §5.3 |
| `src/lib/places.ts` | C | 07 §7.1, §7.5 (`PLACES_ENABLED`) |
| `src/components/place/PlaceField.tsx` | C | 07 §8.2 |
| `src/components/place/PlacePicker.tsx` | C | 07 §8.3 |
| `src/components/place/PlaceLine.tsx` | C | 07 §8.4 |
| `src/components/place/PlaceView.tsx` | C | 07 §8.6 |
| `src/components/place/PlacePourTile.tsx` | C | 07 §8.6 |
| `src/app/place/[id].tsx` | C | 07 §8.6 |
| `docs/support.md` | M | 07 §11 |
| `docs/p/index.html` | C | 07 §12, Phase 3 |
| `scripts/venue-poster.mjs` | C | 07 §12, Phase 3 |

**Deferred hunks in files other packages own today** (applied by that file's owner when L is scheduled): `log.tsx` and `drink/[id].tsx` (Place field, 07 §8.2), `PostCard.tsx` (place line and menu, 07 §8.4–8.5), `lib/reels.ts`, `ReelCell.tsx`, `ReelReview.tsx` (07 §8.2, §8.4), `lib/social.ts`, `store/social.ts`, `types.ts` (07 §7.2–7.4), `database.types.ts`, `schema.sql`, `icons.tsx` (`pin`), `app.json` (07 §9.1, §9.4), `.env` (07 §7.5), `docs/privacy.md`, `docs/appstore.md`, `docs/terms.md` (07 §9). Constraint now (07 §1.1): nobody adds `expo-location` or `expo-maps`, and `pin` stays reserved.

---

## 7. What Jan must do outside the code, in order

**At the stage-1 gate** (so stage-2 screens test against real tables):
1. Supabase → Integrations → **Cron → Enable** (04 needs it before 018).
2. SQL Editor: apply **016, 017, 018, 019** in that order; run each file's VERIFY block. 016 must be applied before any build with the new sign-in screen reaches anyone, flags or not.
3. **Resend + Vault** for 018 (04 §14 steps 3–5): sign up with the address the emails should reach, store `resend_api_key` and `submissions_email`, run the test send. Expect a "No drink suggestions in September 2026" email the next morning; that is the job proving it works.
4. Storage → Settings: global upload limit ≥ 6 MB (05). Confirm `report_alert_url` is in Vault (013); clips and the monthly email both alert there.
5. Install B1's dev-client build on his phone (05 needs a real camera).

**Before the release reaches testers:**
6. Merge C8's release docs commit (it goes live with `main`).
7. App Store Connect → App Privacy: 04's User Content check (04 §12). Retake the App Store screenshots once the build is in (01 §16).

**Before each flag is turned on** (each is JS-only: an EAS Update or the next build):
8. **Phone** (`EXPO_PUBLIC_PHONE_SIGN_IN=on`): Twilio Verify, Supabase Phone provider, a test number, rate limits (02 §18 A); one real SMS to his own number; App Privacy phone row (02 §16).
9. **Google** (`EXPO_PUBLIC_GOOGLE_SIGN_IN=on`, shows only beside Apple): Google Auth Platform client, Supabase Google provider, publish the app, confirm the redirect URL (02 §18 B, C1); App Privacy user ID row.
10. **Clips** (`EXPO_PUBLIC_REELS=on`): 05 §14 device QA on the release build; post one clip and check its metadata with `mdls` (05 §13.2); merge the held `docs-clips` commit; App Privacy → Audio Data, review notes, a demo account with two clips (05 §13.1); **upgrade Supabase to Pro** the day a flag-on build is public on the App Store (05 §12.3).

**Monthly, from October:** the drink-suggestions routine in 04 §14 step 7.

**Not now:** location (07). Its setup is 07 §13 when it is scheduled.

---

## 8. Not created, unchanged, and the ownership index

**Not created (specs edited to drop them):** `src/lib/flags.ts`, `src/components/ChoiceChip.tsx`, `src/components/auth/FieldGroup.tsx`, `src/components/reels/ReelControl.tsx`, `src/components/reels/ReelTile.tsx`.

**Referenced but unchanged:** `package.json` (expo-camera, expo-video, expo-image-manipulator, expo-symbols, expo-crypto and expo-glass-effect are already installed; nothing is added or removed), `src/components/SipplyIntro.tsx`, `src/components/RarityDonut.tsx`, `src/components/artwork/*`, `src/lib/recovery.ts`, `src/data/index.ts` (`getDrink` stays catalogue-only, 04 D1), `src/data/drinks.json`, `scripts/build-ios.sh`, `scripts/build-lock.sh`, `scripts/check-native-links.sh`, `scripts/merge-cocktails.mjs`, `scripts/merge-world-spirits.mjs`, migrations 002–011 and 013–015. `scripts/cocktaildata/NN-submissions-YYYY-MM.json` and its `spiritdata` twin are written at run time by Jan's monthly `import-submissions.mjs`, not by this build.

**Ownership index** (every file any spec touches, exactly once):

| File | Package |
|---|---|
| `.env` | B1 |
| `app.json` | B1 |
| `docs/appstore.md` | C8 |
| `docs/data-deletion.md` | C8 |
| `docs/p/index.html` | L |
| `docs/privacy.md` | C8 |
| `docs/support.md` | L |
| `docs/terms.md` | C8 |
| `docs/testflight.md` | C8 |
| `modules/sipply-places/expo-module.config.json` | L |
| `modules/sipply-places/index.ts` | L |
| `modules/sipply-places/ios/OneShotLocator.swift` | L |
| `modules/sipply-places/ios/SipplyPlaces.podspec` | L |
| `modules/sipply-places/ios/SipplyPlacesModule.swift` | L |
| `scripts/check-contrast.mjs` | A1 |
| `scripts/check-design.mjs` | A1 |
| `scripts/check-phone.mjs` | B3 |
| `scripts/import-submissions.mjs` | B2 |
| `scripts/lib/dex-merge.mjs` | B2 |
| `scripts/lib/prove-guards.mjs` | B2 |
| `scripts/venue-poster.mjs` | L |
| `src/app/(tabs)/_layout.tsx` | C1 |
| `src/app/(tabs)/dex.tsx` | C6 |
| `src/app/(tabs)/index.tsx` | C3 |
| `src/app/(tabs)/profile.tsx` | C4 |
| `src/app/(tabs)/reels.tsx` | C5 |
| `src/app/(tabs)/stats.tsx` | C1 |
| `src/app/+native-intent.tsx` | B3 |
| `src/app/_layout.tsx` | C1 |
| `src/app/activity.tsx` | C3 |
| `src/app/add-drink.tsx` | C6 |
| `src/app/bar.tsx` | C7 |
| `src/app/blocked.tsx` | C7 |
| `src/app/connections/[id].tsx` | C4 |
| `src/app/custom/[id].tsx` | C6 |
| `src/app/drink/[id].tsx` | C6 |
| `src/app/edit-profile.tsx` | C7 |
| `src/app/find-friends.tsx` | C4 |
| `src/app/log.tsx` | C6 |
| `src/app/place/[id].tsx` | L |
| `src/app/post/[id].tsx` | C3 |
| `src/app/pours/[authorId].tsx` | C3 |
| `src/app/record.tsx` | C5 |
| `src/app/reel/[id].tsx` | C5 |
| `src/app/saved.tsx` | C4 |
| `src/app/settings.tsx` | C7 |
| `src/app/stats.tsx` | C1 |
| `src/app/user/[id].tsx` | C2 |
| `src/components/AuthGate.tsx` | C2 |
| `src/components/CelebrationOverlay.tsx` | C7 |
| `src/components/CollectionStats.tsx` | C1 |
| `src/components/CustomDrinkTile.tsx` | C6 |
| `src/components/DexCard.tsx` | A1 |
| `src/components/DrinkPanels.tsx` | C6 |
| `src/components/FacebookFriends.tsx` | C7 |
| `src/components/FindFriends.tsx` | C7 |
| `src/components/FloatingTabBar.tsx` | C1 |
| `src/components/Grain.tsx` | C1 |
| `src/components/InstagramImport.tsx` | C7 |
| `src/components/InviteLinkHandler.tsx` | C1 |
| `src/components/PasswordResetOverlay.tsx` | C7 |
| `src/components/PeerProfile.tsx` | C4 |
| `src/components/PeopleList.tsx` | C4 |
| `src/components/PostCard.tsx` | C3 |
| `src/components/ScreenTopBar.tsx` | A1 |
| `src/components/SubmissionSync.tsx` | B2 |
| `src/components/TabStrip.tsx` | A1 |
| `src/components/VideoIntro.tsx` | C1 |
| `src/components/WelcomeConnect.tsx` | C2 |
| `src/components/auth/AuthTitleBar.tsx` | C2 |
| `src/components/auth/Consent.tsx` | C2 |
| `src/components/auth/CountryPicker.tsx` | C2 |
| `src/components/auth/EmailSteps.tsx` | C2 |
| `src/components/auth/PhoneCodeStep.tsx` | C2 |
| `src/components/auth/ProviderButton.tsx` | C2 |
| `src/components/auth/SignInScreen.tsx` | C2 |
| `src/components/glass.tsx` | A1 |
| `src/components/home/TodaysPours.tsx` | C3 |
| `src/components/home/groupPours.ts` | C3 |
| `src/components/icons.tsx` | A1 |
| `src/components/place/PlaceField.tsx` | L |
| `src/components/place/PlaceLine.tsx` | L |
| `src/components/place/PlacePicker.tsx` | L |
| `src/components/place/PlacePourTile.tsx` | L |
| `src/components/place/PlaceView.tsx` | L |
| `src/components/profile/DexShelf.tsx` | C4 |
| `src/components/profile/PostGrid.tsx` | C4 |
| `src/components/profile/ProfileHeader.tsx` | C4 |
| `src/components/profile/ProfileView.tsx` | C4 |
| `src/components/profile/VideoGrid.tsx` | C4 |
| `src/components/profile/usePostsByAuthor.ts` | C4 |
| `src/components/profile/useProfileCounts.ts` | C4 |
| `src/components/profile/videosSource.ts` | C4 |
| `src/components/reels/CameraGate.tsx` | C5 |
| `src/components/reels/DrinkTagSheet.tsx` | C5 |
| `src/components/reels/RecordButton.tsx` | C5 |
| `src/components/reels/Recorder.tsx` | C5 |
| `src/components/reels/ReelCell.tsx` | C5 |
| `src/components/reels/ReelPager.tsx` | C5 |
| `src/components/reels/ReelReview.tsx` | C5 |
| `src/components/reels/ReelVideo.tsx` | C5 |
| `src/components/ui.tsx` | A1 |
| `src/constants/theme.ts` | A1 |
| `src/data/countries.ts` | B3 |
| `src/lib/customDrinks.ts` | B2 |
| `src/lib/database.types.ts` | A2 |
| `src/lib/drinkSearch.ts` | B2 |
| `src/lib/facebook.ts` | B3 |
| `src/lib/guardedStorage.ts` | B2 |
| `src/lib/intro.ts` | C1 |
| `src/lib/moderation.ts` | A2 |
| `src/lib/oauth.ts` | B3 |
| `src/lib/phone.ts` | B3 |
| `src/lib/places.ts` | L |
| `src/lib/pour.ts` | B2 |
| `src/lib/profileLink.ts` | C4 |
| `src/lib/reelMedia.ts` | B1 |
| `src/lib/reels.ts` | B1 |
| `src/lib/social.ts` | A2 |
| `src/lib/submissions.ts` | B2 |
| `src/lib/supabase.ts` | A2 |
| `src/lib/useSignedPhoto.ts` | A2 |
| `src/store/auth.ts` | B3 |
| `src/store/collection.ts` | B2 |
| `src/store/customDrinks.ts` | B2 |
| `src/store/reels.ts` | B1 |
| `src/store/seen.ts` | C3 |
| `src/store/signInFlow.ts` | B3 |
| `src/store/social.ts` | A2 |
| `src/types.ts` | A2 |
| `supabase/functions/_shared/appleMaps.ts` | L |
| `supabase/functions/place-resolve/index.ts` | L |
| `supabase/functions/places-refresh/index.ts` | L |
| `supabase/migrations/012_report_retention.sql` | A2 |
| `supabase/migrations/016_sign_in_lookup.sql` | A2 |
| `supabase/migrations/017_home_and_profile.sql` | A2 |
| `supabase/migrations/018_drink_submissions.sql` | A2 |
| `supabase/migrations/019_reels.sql` | A2 |
| `supabase/migrations/020_places.sql` | L |
| `supabase/schema.sql` | A2 |

Specs edited by this cross-check: `01-design-v2.md`, `02-auth-login.md`, `03-home-and-profile.md`, `04-custom-drinks.md`, `05-reels.md`, `06-tab-switch-bug.md`, `07-location-tagging-longterm.md`.

---

## 9. Jan's decisions, 1 Oct 2026 — these OVERRIDE anything above that disagrees

1. **The video section is called "Reels"** in every user-facing string (COPY.label, tab label, Info.plist purpose strings, empty states, docs). Jan chose this knowing it is Instagram's product name. Code identifiers stay `reels` as specced.
2. **Reels ships switched OFF.** `EXPO_PUBLIC_REELS=off` in `.env`; the tab, the record route and the profile Reels tab are hidden while off. Jan does not want it active "until I get a few members onboard"; he will say when to turn it on and upgrade Supabase.
3. **Tight caps for when it is turned on, before Supabase Pro:** 3 reels per account per rolling 24 h and 20 live reels per account (019's quota function and its storage-folder rule scale from these). Keep the 30 s / 720p / ~5 MB recording limits.
4. **Instant tab switches** (06) — confirmed.
5. **No comments this round** — confirmed; no comment glyph.
6. **The intro film plays on EVERY cold start** (C1), not once per install. The Reduce Motion fallback rule still holds.
7. Custom-drink pours are not postable and suggesters are not credited (04's defaults) — confirmed by default.

## 10. How this round is actually run (overrides §2's worktree mechanics)

All packages work in ONE worktree, `~/Projects/drinkdex-worktrees/polish` on branch `reels-and-redesign`, with strict file ownership instead of separate worktrees and merges. Agents never run git; the orchestrator commits each package. There is no dev-client build step (B1's "done when a dev-client build is on Jan's phone" is dropped): native verification happens once, on the release build, through `scripts/check-native-links.sh`. Route stubs and typed-route regeneration for stage 2 are done by a single step before the screen packages start.
