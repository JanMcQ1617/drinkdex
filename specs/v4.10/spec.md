# v4.10 · The tag and the sweep (build spec)

Jan, 28 Oct 2026, pointing at the red paint-pen wordmark: "I want you to make it so all the text in the app is in this same font, and mix it with subheading and one other font." And, of build 34's paper grain: "make the background less grainy, it hurts the eyes to see, make it another way."

Two explorations answered him (`specs/v4.10/type/README.md`, `specs/v4.10/ground/README.md`), and two judges read both boards. This file is the lead's final call and the build spec for two parallel packages, **TYPE** (T) and **GROUND** (G). Section F says who owns which file. Section W is what Jan will see.

**The decisions, in one breath.**
- **Type is A, Tag.** Three faces with three jobs.
  - **Sedgwick Ave** is the marker. It sets the app's own tab titles, every drink name and the empty states' headlines.
  - **Anton** is the poster. It sets the section heads on the Dex and the drink page, and the press's outlined figures.
  - **Archivo** (400, 500, 600) sets everything else, including every key, count, amount, Nº and handle.
- **The ground is A, the studio sweep.** It stays white down to 40% of the window, then eases to #FBFBFB at the foot. It ships as a pre-dithered image, and the grain is deleted.
- **No copy changes.** App Store 1.4.3 binds every word. Anton's capitals are a transform, so VoiceOver still reads sentence case. No colour token changes, and the palette stays black, white, neutral greys and one red.

**Read with:**
- `specs/v4.10/type/README.md` and its board.
- `specs/v4.10/ground/README.md` and its board.
- `specs/v4.9/details/spec.md`. Its A.5 and G are rewritten by GROUND (G.5).
- Both stand except where this file says otherwise.

---

## 0. Where this departs from a judge, and why

Both judges chose A and A. Their required changes are all taken, with these calls where they disagree or where the code says something the board could not.

1. **The zero: judge 2's method, not judge 1's.**
   - I read the glyph. Sedgwick's `zero` (gid 438) has three contours: the outer, plus two half-counters that the slash cuts apart (bboxes 134..314 x 63..468 and 238..470 x 224..720). There is no separate slash contour to drop, and deleting one contour fills half the counter.
   - The patch is to redraw `zero` as Sedgwick's own `O`, scaled into the zero's box, keeping its advance (592) and left side bearing (27).
   - I built that in a scratch subset. It has two contours, reads as a zero in the hand, and stays distinct from ø ("Sønderjysk" beside "Ardbeg 10", "1800 Añejo", "Lot No. 40", "Old Forester 1920").
   - Because the advance is unchanged, fit is unchanged (judge 1's change 7 needs no re-run).
2. **Line heights: judge 2's (at least the face's natural line), not 22/26 or 60/60.** I add one thing neither judge raised: ink room (T.3).
   - In React Native on iOS, the paragraph view draws into its own bounds. Sedgwick's drawn glyphs reach past its own line metrics: descenders reach 0.433 em against the font's 0.312, and À reaches 1.174 em against 0.937.
   - So the last line's y/g/p/j would lose about 2.4pt of tail at 22pt, and a first-line Ż, Š or Í would lose its accent. Playfair never did this, because its glyphs sit inside its metrics.
3. **The marker's tab title is a new role, `tabTitle`. `title` stays Archivo.**
   - `textRole.title` has 15 readers today:
     - a person's handle (your profile's bar);
     - tournament, collection and place names;
     - the milestone title;
     - the phone code's digits.
   - Turning `title` into the marker would put figures and identifiers in the hand (judge 2, change 5) by default. Keeping `title` plain is safe by default, and the marker is opted into in exactly two files.
4. **The Anton heads are a new role, `sub`. `sectionTitle` stays Archivo.**
   - The heads on the board are drawn with `textRole.bodyStrong` in `dex/SectionHead.tsx` and `DrinkPanels.tsx`, not with `sectionTitle`.
   - `sectionTitle` is the content-size `SectionHeader` in the add-drink form, Activity, Find friends, Saved's collection heads and a place page. Poster capitals on "PHOTO (OPTIONAL)" in a form is not what the board showed.
   - Anton goes where Jan saw it, and only there.
5. **Every key is Archivo 600, not only the red one.**
   - Both judges set the red key to Archivo 600 17/24. One weight for every command keeps the red key from reading heavier than an ink key beside it.
   - Beside a tag and poster capitals, a 500 label reads as body text. There are about 128 Button call sites, so this goes in the role, not per site.
6. **A custom drink's name stays in the marker.**
   - It is a drink's name, shown in the same grid as catalogue names and drawn by the same DrinkName, and a second face in one grid would read as a bug.
   - The zero patch and the 15pt shrink floor (T.4) cover what a person might type.
   - Handles, tournament names, collection names and places stay Archivo: an identifier must be read exactly (l, I, 1, dots, underscores).
7. **`emptyTitle` is EmptyState's alone.**
   - Three other files spread it today: PasswordResetOverlay, and the reels' Recorder and CameraGate.
   - The overlay sits under the drawn wordmark, and the README warns against a Sedgwick title beside the wordmark. The two reels files are flagged off on the dark ground.
   - All three move to `textRole.bodyStrong`, which has today's exact metrics.
8. **Anton's head is 16/26, not 16/20.**
   - Anton's natural line is 1.505 em, 24.08pt at 16.
   - Below that, React Native's iOS layout does no baseline centring (`RCTApplyBaselineOffset` returns early), so `lineMarks` would no longer describe where the caps sit.
   - At 26 the capitals sit centred (6.0pt above, 6.2pt below).
9. **Press figures at cap 48 on both screens.** Dex sections were 40 and the drink page 64. 48 is the cap the board drew (`fig`: Anton at 56, cap 48) and the judges approved. Anton is condensed and tall, so Inter's 64 would turn the drink page's figure into a wall.
10. **The ground ships pre-dithered (judge 1), not as an 8-bit or 16-bit stepped ramp (judge 2).**
    - Judge 2's Increase Contrast addition is taken.
    - A dithered ramp is also what the arm's-length judging actually saw: Chrome dithers a CSS gradient, and the shots were CSS.
    - The foot is locked at #FBFBFB. The only fallback is plain white.

---

## T. Type (package TYPE)

### T.1 The files, the licences, and how they are built

**Ship exactly these five cuts in `assets/fonts/`:**

| File (and its `useFonts` key, byte for byte) | Source (in `specs/v4.10/type/fonts/`, as in google/fonts) | Build |
|---|---|---|
| `SedgwickAveLatin_400Regular.ttf` | `SedgwickAve-Regular.ttf` (sha256 `9c3633e5…3efa`) | subset; `zero` patched (below); OS/2 heights corrected; renamed |
| `AntonLatin_400Regular.ttf` | `Anton-Regular.ttf` (sha256 `a4ba3a92…7cab`) | subset; renamed. Glyphs untouched |
| `ArchivoLatin_400Regular.ttf` | `Archivo[wdth,wght].ttf` (sha256 `0e094a7d…5053`) | static instance `wght=400 wdth=100`, subset, renamed |
| `ArchivoLatin_500Medium.ttf` | the same | `wght=500 wdth=100` |
| `ArchivoLatin_600SemiBold.ttf` | the same | `wght=600 wdth=100` |

- **Subset.**
  - Unicodes: `U+0020-007E, U+00A0-00FF, U+0100-017F, U+0180-024F, U+1EA0-1EF9, U+2000-206F, U+20A0-20BF, U+2122`.
  - This is today's Latin set, plus Vietnamese U+1EA0-1EF9, which fixes Rượu Đế, Rượu Nếp, Rượu Rắn, Rượu Thuốc and Cà Phê Trứng Rum: build 34 draws them in the system font.
  - Flags: `--layout-features='*' --glyph-names`.
  - My scratch build of these five comes to 518,648 bytes (507 KB), against 654,800 today.
- **Sedgwick's zero.**
  - Replace `zero` with a simple glyph: `O`'s outline transformed into the zero's own bbox (27, −17, 577, 798), which is x 0.862 and y 1.006.
  - Keep the advance at 592 and the lsb at 27, and decompose it (no composite).
  - Nothing in the font references `zero` as a component (checked).
- **Sedgwick's default ligatures** (added in the integration pass): keep only fi, fl, ff, ffi and ffl. Upstream's `liga` also forms ten pictures from words ("star1", "star2", "arrow1", "arrow2", "hiphop1", "hiphop2", "hiphopgoogle", "hiphopvinyl", "quotesleft", "quotesright"), which iOS applies unasked; no catalogue name spells one, but a custom drink could. `build-fonts.py` drops their rules before the subset and `--check` fails a file that still forms one. The five cuts then come to 508,924 bytes (497 KB).
- **Sedgwick's OS/2 heights.** Set `sCapHeight` 850 and `sxHeight` 670. Those are the drawn medians: caps run 0.81 to 0.92 em, median 0.848. The shipped 950 is wrong, and it misled the judging. This is metadata only: React Native lays out from hhea, which stays as it is.
- **Names.**
  - Rewrite name IDs 1, 2, 3, 4, 6, 16 and 17 so the family reads `SedgwickAveLatin`, `AntonLatin` or `ArchivoLatin`, and the style reads the weight. PostScript names: `SedgwickAveLatin-Regular`, `AntonLatin-Regular`, `ArchivoLatin-Regular`, `-Medium` and `-SemiBold`.
  - Sedgwick's name ID 5 gains "; Sipply subset, zero unslashed".
  - Keep IDs 0, 13 and 14 (copyright, licence, licence URL) exactly.
  - All three families are OFL 1.1 with no Reserved Font Name (copyright lines checked: "The Sedgwick Ave Project Authors", "The Anton Project Authors", "The Archivo Project Authors"). Subsetting, modifying and renaming are all permitted.
- **Deterministic output.** Save with `recalcTimestamp=False` and `head.modified` set to the source's. Archivo keeps the instancer's OVERLAP_SIMPLE flags, which CoreText fills correctly.
- **Licences.** Copy verbatim, as the OFL requires its text to travel with the font:
  - `OFL-sedgwickave.txt` to `assets/fonts/LICENSE-SedgwickAve.txt`;
  - `OFL-anton.txt` to `LICENSE-Anton.txt`;
  - `OFL-archivo.txt` to `LICENSE-Archivo.txt`.
- **Delete** `InterLatin_*.ttf`, `PlayfairDisplayLatin_*.ttf`, `LICENSE-Inter.txt` and `LICENSE-PlayfairDisplay.txt`. Do this only once nothing names them; T.11 lists the scripts that do today.
- **`scripts/build-fonts.py` (new)** writes all of the above from the pinned sources. Its prose header follows `build-numerals.py`.
  - With no flag, it builds.
  - With `--check`, it writes nothing and exits 1 unless all of these hold:
    1. Each source's sha256 matches its pin.
    2. Each shipped file exists with the names above.
    3. Each `fonts` value in `theme.ts` is a `useFonts` key in `_layout.tsx` and a file stem here.
    4. Sedgwick's `zero` has exactly 2 contours and advance 592.
    5. Every character of every name in `src/data/drinks.json` (spaces aside) is in the cmap of Sedgwick and of all three Archivo cuts.
    6. Anton has `0-9`, `N` and `degree`.
    7. Each face's hhea ascender, descender and lineGap over unitsPerEm equal `FACE_METRICS` in `lineMarks.ts` to 3 decimals. The ascent and descent there come from one source, and the check holds them to it.
    8. The Archivo files have no `fvar` table and do have `tnum`.
    9. Each LICENSE file is byte-equal to its source.
  - It also writes `src/lib/faceAdvances.ts` (T.9, GENERATED) and checks that file is current.
- **No native rebuild.** `app.json` has no expo-font plugin, so `_layout.tsx` loads these through `useFonts` and no prebuild is needed.

### T.2 `src/constants/theme.ts`: the faces and every role

**`fonts`.**
- The keys stay, so the 60-odd sites that set `fonts.body*` directly become Archivo with no edit (T.11a).
- `displayBold` goes: Sedgwick has one cut, and rule 6 forbids reading `fonts.display*` outside theme.ts, so nothing does.

```ts
export const fonts = {
  /** The marker, Sedgwick Ave (one cut): only the DISPLAY roles below (check-design rule 6). */
  display: 'SedgwickAveLatin_400Regular',
  /** The poster, Anton (one cut): only `sub` (rule 6). The press's figures are paths of the same file (numeralGlyphs). */
  sub: 'AntonLatin_400Regular',
  body: 'ArchivoLatin_400Regular',
  bodyMedium: 'ArchivoLatin_500Medium',
  bodySemiBold: 'ArchivoLatin_600SemiBold',
  bodyBold: 'ArchivoLatin_600SemiBold',
  /** The Dex number (the plate): Archivo 600, tabular. */
  label: 'ArchivoLatin_600SemiBold',
  /** Figures. Archivo, with the `tabular` style for column alignment. */
  numeral: 'ArchivoLatin_500Medium',
} as const;
```

**`textRole`.** Every key is listed: the 29 that exist today, plus `tabTitle` and `sub`. The colour is still the caller's. Tracking is 0 unless given.

| Role | Face | Size / line | Tracking | Notes |
|---|---|---|---|---|
| `tabTitle` (new) | Sedgwick 400 | 36/46 | 0 | The app's own tab-root titles: Dex, Saved, Tournaments, My Bar. Read only by ScreenTopBar (lg) and TabPlaceholder |
| `drinkHero` | Sedgwick 400 | 60/76 | 0 | The drink page's name |
| `nameLg` | Sedgwick 400 | 36/46 | 0 | A drink at title size: a post's wall label, the catch |
| `name` | Sedgwick 400 | 22/28 | 0 | Grids, lists, picker rows |
| `nameSm` | Sedgwick 400 | 19/24 | 0 | A post header's drink line |
| `emptyTitle` | Sedgwick 400 | 22/28 | 0 | EmptyState only (0.7) |
| `sub` (new) | Anton 400 | 16/26 | +0.8 `tracking-ok:` | `textTransform: 'uppercase'` with `caps-ok:` (T.10). Dex section heads and the drink page's section heads only |
| `title` | Archivo 600 | 28/34 | −0.4 | Not the marker's: a handle, a tournament, collection or place name, the milestone, the phone code's digits (with `tabular`) |
| `body` | Archivo 400 | 17/24 | −0.2 | |
| `bodyMedium` | Archivo 500 | 17/24 | −0.2 | |
| `bodyStrong` | Archivo 600 | 17/24 | −0.2 | |
| `small` | Archivo 400 | 13/18 | 0 | |
| `barTitle` | Archivo 600 | 17/24 | −0.2 | |
| `sectionTitle` | Archivo 600 | 17/24 | −0.2 | Form and list heads (0.4) |
| `groupTitle` | Archivo 600 | 13/18 | 0 | |
| `rowTitle` | Archivo 400 | 17/24 | −0.2 | |
| `rowSubtitle` | Archivo 400 | 13/18 | 0 | |
| `button` | **Archivo 600** | 17/24 | −0.2 | Was 500 (0.5) |
| `buttonSm` | **Archivo 600** | 17/24 | −0.2 | Was 500 |
| `fieldLabel` | Archivo 500 | 13/18 | 0 | |
| `fieldValue` | Archivo 400 | 17/24 | −0.2 | |
| `helper` | Archivo 400 | 13/18 | 0 | |
| `heroFigure` | Archivo 600 | 28/34 | −0.4 | `tabular-nums` (Ruler) |
| `count` | Archivo 600 | 17/24 | −0.2 | `tabular-nums` |
| `prose` | Archivo 400 | 17/24 | −0.2 | Unused; kept |
| `specAmount` | Archivo 600 | 17/24 | −0.2 | `tabular-nums` |
| `story` | Archivo 400 | 17/26 | −0.2 | |
| `statusWord` | Archivo 500 | 13/18 | 0 | |
| `plate` | **Archivo 600** (`fonts.label`) | 13/18 | +1.0 `tracking-ok:` | `tabular-nums`; was 500 |
| `prompt` | Archivo 500 | 22/28 | −0.3 | The onboarding Bubble |
| `nameInline` | Archivo 600 (`fonts.bodySemiBold`), no size | inherits the host's | | A drink inside a sentence: bodyStrong-weight in a 17 line, smallStrong-weight in a 13 caption. This needs no edit at its hosts (activity.tsx, custom/[id].tsx, dex/PostSheet.tsx), because it already sets only the family |

- **Constants.** `TITLE`, `BODY` and `SMALL` stay. Add `TAG_TITLE = { fontSize: 36, lineHeight: 46, letterSpacing: 0 }` and `TAG_NAME = { fontSize: 22, lineHeight: 28, letterSpacing: 0 }`.
- **Comments.**
  - Rewrite the Typography block and the "PLAYFAIR DISCIPLINE" note as the three-face discipline (T.10).
  - Accent place 4 becomes "text, Archivo 600".
  - Rewrite the paper sentence in the v4.9 detail-tier note, in GROUND's wording (G.5).

### T.3 Line heights and ink room (the iOS facts this rests on)

**The natural-line rule.**
- Every textRole's `lineHeight` is at least its face's natural line, (hhea ascent + descent) x size:
  - Sedgwick 1.249 em;
  - Anton 1.505 em;
  - Archivo 1.088 em.
- At or above it, React Native centres the glyph box in the line box (`RCTApplyBaselineOffset` in RN 0.86's `RCTAttributedTextUtils.mm`). That is exactly what `lineMarks()` assumes.
- Below it, RN applies no offset, and the type sits where TextKit's clamp puts it.
- Every role in T.2 passes, with the slack in this table. check-design asserts it (T.10).

| Face | Natural line | Tightest role | Its line | Slack |
|---|---|---|---|---|
| Sedgwick | 1.249 em | `drinkHero` 60 | 76 (needs 74.94) | +1.1pt |
| Sedgwick | 1.249 em | `nameSm` 19 | 24 (needs 23.73) | +0.3pt |
| Anton | 1.505 em | `sub` 16 | 26 (needs 24.08) | +1.9pt |
| Archivo | 1.088 em | `title` 28 | 34 (needs 30.46) | +3.5pt |

**Ink room.**
- iOS clips a Text's glyphs to the Text's own bounds. Fabric's `RCTParagraphComponentView drawRect:` draws into the content frame, and its backing store is the bounds.
- I measured Sedgwick against the catalogue's characters:
  - ASCII tops reach 0.922 em, inside the 0.937 ascent;
  - descenders reach −0.433 (y, j, p, g, q), against a 0.312 descent;
  - accented capitals reach 1.174 (À, Š, Â, Ú, Ž, Č, Í, É, Ō, Ż; 50 names).
- Archivo's accents (0.928) and Anton's (Å 1.229) fit inside their roles' half-leading, which I checked for every role, so they need none.
- So every Sedgwick Text is given room beyond its line box:
  - `paddingTop = ceil(0.24 x drawn size)` with an equal negative `marginTop`;
  - `paddingBottom = ceil(0.13 x drawn size)` with an equal negative `marginBottom`.
- Layout does not move (Yoga's margin box stays the line box), but the bounds now hold the ink.
- At 1x the room is: name and emptyTitle 6/3, nameSm 5/3, nameLg and tabTitle 9/5, drinkHero 15/8.
- The helper is `inkRoom(face, drawnSize)` in `lineMarks.ts` (T.9). It returns zeros for `'text'` and `'sub'`.
- It is applied in exactly four places, the only readers rule 6 allows for Sedgwick roles: DrinkName (T.4), ScreenTopBar's lg title and TabPlaceholder's title (T.6), and EmptyState's title.
- **Caller margins are kept, not overwritten.** The helper subtracts from the caller's resolved `marginTop` and `marginBottom`, read with `StyleSheet.flatten(style)`, including `marginVertical` and `margin`.

**Wrapped lines** still touch where a descender sits over a capital: at 1.27 em the gap is about 0.01 em. A tag does that. Inner lines may overlap; only the box's top and bottom clip.

### T.4 Drink names

- **DrinkName** (`components/cabinet.tsx`) stays the only way a name is drawn.
  - It reads the face with `faceOf(role.fontFamily)` and applies `inkRoom`.
  - Its shrink floor is 15pt for `'display'` and stays 11 for `'text'`. A locked Dex card's own Archivo 500 15/20 role is a `'text'` role. No catalogue name needs a long-word shrink at 22; a custom drink can.
  - Names still never truncate and still wrap at word boundaries.
- **Caps.**
  - Every DrinkName call site keeps its cap. Today's are 1.2 to 1.3, `board.dailyCap` and `HERO_NAME_CAP` 1.2.
  - The two sites at 1.4 drop to 1.3: `ui.tsx` Row's `cap={1.4}` and `add-drink.tsx` `SIMILAR_NAME_CAP`.
  - So no marker line ever draws above 1.3 times its role.
- **Inline names** are `nameInline`, Archivo 600 at the host's size (T.2). The marker never appears inside a sentence.
- **The post header's drink line** (PostCard): `nameSm` 19/24 beside " at " and the place in Archivo 13/18.
  - **The split.** Cost the drink as `textWidth(drinkName, 'display', textRole.nameSm.fontSize * s)`, where s = min(fontScale, HEADER_CAP), not at the caption's 13.
  - **The row.** `secondLine` takes `alignItems: 'flex-start'`. " at " and the place each get `marginTop = lineMarks('display', 19s, 24s).baseline − lineMarks('text', 13s, 18s).baseline` (4.6pt at 1x), so the three words share a baseline. Centring would leave the small words floating.
- **Figures inside a name** ("Wild Turkey 101") are Sedgwick's own proportional figures, with the unslashed zero. They are part of the name, never a count.

### T.5 Figures and the Nº

- **Counts, amounts and the Ruler's figure** are Archivo 600 with `tabular-nums`: `count`, `specAmount`, `heroFigure`, and `fonts.bodySemiBold` with `tabular` at the direct sites (ProfileHeader, TopBarCount, FeedbackCard). The marker and Anton never set one.
- **The plate** "Nº 0147" (`textRole.plate`, `plate.tsx`, NumberRail, ForYouRail) is Archivo 600 13/18 +1.0, tabular. Archivo's º (U+00BA) is a small ring (324 x 368 units), clearly not its 0 (475 x 710). The sign stays U+00BA (rule 16).
- **The press's outlined figures** (PressNumeral: the drink page's Nº and the Dex's 01, 02…) are regenerated from Anton.
  - `scripts/build-numerals.py` reads `assets/fonts/AntonLatin_400Regular.ttf`. It takes `0-9`, `N` and the space as they are, so `NUMERAL_FONT` becomes `{ unitsPerEm: 2048, capHeight: 1760 }`.
  - **The º is drawn as Anton's `degree` ring**, translated up by 153 units so its top sits on the cap height (1931..1607 → 1084..1760), with `degree`'s advance (796).
  - Anton's own `ordmasculine` is a tall oval shaped like its 0 (712 x 1218 against 932 x 1792), so the figure read "N⁰ 0147". I rendered both, and the ring reads as Nº.
  - The text the app passes still contains º. Only the shape changes.
  - Anton is a static cut with no overlapping contours, so `numeralPath`'s ring offsets stay clean.
  - The thinnest counter is the 0's, 174 units: 4.7pt at cap 48. With the 1pt ring that leaves 3.7pt, so rings never meet.
- **Caps.**
  - `dex/SectionHead.tsx` `FIGURE_CAP` 40 → 48.
  - `DrinkPanels.tsx` `NUMERAL_CAP` 64 → 48. The column fit (`min(cap, floor(measure / numeralWidth))`) stays.
  - `render-details.mjs` draws `figure-01` and `figure-no-0100` at 48, and its per-width loop uses `Math.min(48, …)`.

### T.6 Titles

- **ScreenTopBar `size="lg"`** draws `textRole.tabTitle` by default: the Dex, Saved (both the tab and AllSaved), Tournaments and My Bar pass fixed strings and need no edit.
  - The title Text keeps `numberOfLines={1}`, `adjustsFontSizeToFit` and `minimumFontScale={0.7}`.
  - Its `maxFontSizeMultiplier` is **1** (T.8), and it takes `inkRoom('display', 36)`.
- **New prop `userTitle?: boolean`**: the title is something a person typed, so it is set in `textRole.title` (Archivo 600 28/34), exactly as today, with `BAR_TEXT_SCALE_CAP` 1.3.
  - `ProfileView` passes it on your own profile's lg bar (`person.username`).
  - `(tabs)/profile.tsx`'s fallback passes `title=""`, so it draws nothing and needs no prop.
- **The swash** (TitleSwash) keeps the board's place.
  - Under `tabTitle`, its box spans y 44 to 50 in the 52pt row: `swash.bottom` is −1 from the 3..49 line box, and the scale is always 1.
  - Under `userTitle` it stays where it is today (41 to 47 at 1x, `bottom: -4`, growing with min(fontScale, 1.3)).
  - Its ink keeps 2pt clear of the bar's foot.
- **The Dex's count** (TopBarCount, the "38 / 2,089" on the right) shares the title's baseline:
  - title baseline: 3 + lineMarks('display', 36, 46).baseline = 37.25pt in the row;
  - the count sits at its own drawn scale, with the offset from lineMarks;
  - a glyph control on the right (•••) stays centred.
- **TabPlaceholder** draws its title exactly as the real bar will:
  - `tabTitle`, cap 1 and ink room for Tournaments, Dex, Saved and My Bar;
  - `textRole.title` for `title="Profile"`, which `(tabs)/_layout.tsx` now passes with `userTitle`;
  - `textRole.title` on the Reels ground;
  - Home keeps its wordmark.
- **Every other title stays `textRole.title`** and needs no edit: tournaments/[id] (with its swash), saved/[id], collection/[share], AllSaved's page title, PlacePage, MakeSheet, CelebrationOverlay's milestone, PhoneCodeStep's digits and reels.
- **md bars** stay `barTitle` (Archivo), including a drink page's centred title.

### T.7 Section heads

- `textRole.sub` (Anton 16/26, +0.8, uppercase by transform) replaces `textRole.bodyStrong` on the section head's label in `dex/SectionHead.tsx` (both branches) and on `Section`'s title in `DrinkPanels.tsx`.
- Those cover "Sour and citrusy", "Everything else", "The spec" and every other drink-page section.
- The strings stay sentence case in the code, the copy and VoiceOver.
- **Baselines.** Each head row aligns its Archivo aside ("See all 445", "by number", "Blended · 4 ingredients") on the head's baseline, with offsets from `lineMarks('sub', …)` and `lineMarks('text', …)` as in T.4. Centring is not used.
- No other file uses `sub`. Rule 6 fences it.

### T.8 Dynamic Type limits

| What | Cap (`maxFontSizeMultiplier`) | Why |
|---|---|---|
| `tabTitle` (ScreenTopBar lg, TabPlaceholder) | **1** (never scales) | 36pt is already today's title at its 1.3 cap: 28 x 1.3 = 36.4. It is never smaller than build 34's title up to fontScale 1.29 (1% under at 1.3), it keeps the fixed 52pt row and its swash, and a tag at 2x stops reading as a tag |
| Drink names (DrinkName) | each site's existing cap, at most **1.3** (two 1.4 sites drop) | As today; the marker caps lower than reading text |
| `emptyTitle` (EmptyState) | **uncapped**, as today | A sentence a reader must read. At AX sizes it wraps, and its ink room scales with it |
| `sub` | **uncapped**, as today's `bodyStrong` head was | Anton stays legible large, and a header must not shrink for the people who need it |
| `userTitle` and every Archivo role | unchanged (as today) | |
| Press figures | unchanged: they hide above 1.3 (v4.9 G) | |

The swash under a tab title never scales. Under `userTitle` it still follows min(fontScale, 1.3).

### T.9 The metric modules

- **`src/lib/textFit.ts`.**
  - `Face` becomes `'display' | 'text' | 'text400' | 'text600'`. The names are roles, so the next swap renames nothing.
  - `faceOf()` returns `'display'` for `/SedgwickAve/`, else `'text'`.
  - `'text'` is a class estimate costed on Archivo 600, its widest cut (narrow, lower, cap, wide, measured as Inter's were and rounded up).
  - `'display'`, `'text400'` and `'text600'` are exact advances from the GENERATED `src/lib/faceAdvances.ts`, which `build-fonts.py` writes.
    - Each entry is (hmtx advance + the largest positive kern with that glyph on the left), over unitsPerEm, x `ADVANCE_SLACK` 1.02.
    - The tables cover U+0020-007E, `TYPO_MARKS` and every character in the catalogue's names.
    - Anything else falls back to its NFD base, then to `FALLBACK_EM`.
  - The kern allowance matters: Sedgwick has 651 kern pairs, widening by up to +140 units, and Archivo by up to +50. Inter only ever tightened, which is why its tables had no allowance.
  - Pure, as now. The prose header names the faces.
- **`src/components/details/lineMarks.ts`.** `LineFace` becomes `'display' | 'text' | 'sub'`, and `inkRoom(face, size)` is added.

  ```ts
  display: { ascent: 0.937, descent: 0.312, cap: 0.85,  inkAbove: 0.24, inkBelow: 0.13 }, // Sedgwick: hhea; cap the drawn median
  sub:     { ascent: 1.176, descent: 0.329, cap: 0.859, inkAbove: 0,    inkBelow: 0    }, // Anton: hhea 2409/674, cap 1760 of 2048
  text:    { ascent: 0.878, descent: 0.210, cap: 0.686, inkAbove: 0,    inkBelow: 0    }, // Archivo: hhea 878/210, cap 686
  ```

- **Callers.**
  - DrinkPanels: `lineMarks('playfair'…)` → `'display'`, `'inter'` → `'text'`, `widestRun(…'inter'…)` → `'text'`.
  - add-drink, PostCard (`'inter400'` → `'text400'`, `'inter600'` → `'text600'`, `'playfair'` → `'display'`), ScreenTopBar `textSideWidth`, ProviderButton, `bar/NextBottleSheet.tsx`, `bar/faces.tsx` `nameLines` (`'display'`) and `lib/tags.ts`.
  - NotInDexYet and cabinet go through `faceOf` and need no literal edit.
- **One-time acceptance (TYPE):** extend `specs/v4.10/type/tools/fit.mjs` to read the shipped subsets. For all 2,089 names, at 22 in 184 and 60 in 392, the estimate of each name's widest run must be at least Chrome's shaped width. Report the minimum margin.

### T.10 check-design: what rule 6 and the font rules become

**Rule 6, renamed "three faces, three jobs"** (header list item 6 and its block comment). `PLAYFAIR*` identifiers become `DISPLAY*`/`FACE*`, and the report category is `face`.

1. **In theme.ts.**
   - `fonts.display` may only be the `fontFamily` of `DISPLAY_ROLES = ['tabTitle', 'drinkHero', 'nameLg', 'name', 'nameSm', 'emptyTitle']`.
   - `fonts.sub` may only be that of `SUB_ROLES = ['sub']`.
   - Every other entry names a body key. That is what fails the marker reaching `button`, `buttonSm`, `count`, `plate`, `specAmount`, `heroFigure`, `title` or `nameInline` (the judges' list).
2. **Outside theme.ts.**
   - No `fonts.display*` or `fonts.sub`, by property, element or destructuring.
   - No family string matching `/^(SedgwickAve|Anton|Archivo|PlayfairDisplay|Inter)\w*_\d{3}\w*$/` other than as a key in a font map.
   - No DISPLAY or SUB role's `fontFamily` lent to other text.
3. **Readers.**
   - `drinkHero`, `nameLg`, `name` and `nameSm` reach a screen only as DrinkName's `role`. This is the existing rule, with `DRINK_NAME_ROLES` now these four.
   - `tabTitle` is read only in `components/ScreenTopBar.tsx` and `components/TabPlaceholder.tsx`.
   - `emptyTitle` is read only in `components/ui.tsx`.
   - `sub` is read only in `components/dex/SectionHead.tsx` and `components/DrinkPanels.tsx`.
4. **The natural line.** Each theme.ts textRole with a `fontSize` has `lineHeight >= (ascent + descent) x fontSize` for its face. `FACE_METRICS` is read from `lineMarks.ts` with the TypeScript AST, as theme.ts is read.
5. **Keys match.** Every `fonts` value is a key of `_layout.tsx`'s `useFonts({…})` object. A mismatch falls back silently, so the build fails it instead.

**Rule 5.**
- A `textTransform: 'uppercase'` is allowed in theme.ts only, on a line, or under a line, marked `caps-ok: <reason>`, and only inside `textRole.sub`.
- Both the line check (`CAPS`) and the AST check learn the marker.
- Typed capitals (rule 8's `CAPS_TEXT`) stay banned.
- The reason in the code: Anton's poster caps are the board's, the transform keeps the copy and VoiceOver in sentence case, and rule 5's history (tracked Inter caps reading machine-made) is about a body face, not a poster face.

**Rule 8.** Nothing changes in the mechanism: `sub`'s +0.8 carries `tracking-ok:` in theme.ts, and the plate keeps its marker.

**Rule 7** (the 11pt floor) is unchanged. DrinkName's 15pt display floor is a component rule, not a check.

The rule-17 comments that say "Paper (the grain)" take GROUND's wording (G.5).

**Gates.** The gate list gains:
- `python3 scripts/build-fonts.py --check`;
- `python3 scripts/build-numerals.py --check`, which passes today and is not yet listed;
- GROUND's swap (G.4).

### T.11 Who sets a font family directly

**(a) Unchanged.** These name a `fonts.body*`, `fonts.label` or `fonts.numeral` key, or a body role's family, so they become Archivo with no edit:
- `activity.tsx`, `add-drink.tsx` (1536, 1578), `_layout.tsx` (DefaultTheme), `collection/[share].tsx`, `pours/[authorId].tsx`;
- `PostCard` (username, placeName, strong), `Ruler`, `TabStrip`, `songs`, `media`, `ScreenTopBar` (figure, textButtonStrong);
- `ui.tsx` (13 styles);
- `CountryPicker`, `PhoneCodeStep`, `WelcomeBack`, `Consent`, `PlaceRow`, `EmailSteps`;
- `ReelCell`, `ReelReview`, `Recorder` (its chips), `VideoGrid`;
- `ProfileHeader`, `OrderSheet`, `dex/SectionHead` (its aside), `Leaderboard`, `Bubble`, `FriendsBoard`, `TournamentCard`, `FeedbackCard`.

Their literal pairs all clear Archivo's natural line (ReelReview's 15/20 is the tightest: it needs 16.3). ProviderButton's Apple row stays the system font with its `fontWeight: '600'`, as Apple's HIG asks.

**(b) Must change**, all in TYPE's table (F):
- DrinkName (T.4).
- ScreenTopBar, TabPlaceholder and `(tabs)/_layout.tsx` (T.6).
- ProfileView (`userTitle`).
- EmptyState in `ui.tsx`: ink room on the title, and the Row cap at 1.3.
- PasswordResetOverlay, `reels/Recorder` and `reels/CameraGate`: `emptyTitle` → `bodyStrong`.
- `dex/SectionHead` and DrinkPanels (T.5, T.7).
- PostCard (T.4).
- The textFit callers (T.9).
- `numeralGlyphs.ts`, generated (T.5).

### T.12 Outside the app

These all set or load the old files today:
- **`scripts/appstore-shots/compose.mjs`**: `@font-face` from `ArchivoLatin_600SemiBold.ttf` and `_500Medium.ttf`, family `ArchivoSipply`, and its "Inter did not load" message. Captions stay `textRole.title` (Archivo 600), because a caption is a sentence. The App Store screenshots are not re-shot in this release.
- **`scripts/build-drink-photos.mjs`**: `QA_FONT` → `ArchivoLatin_500Medium.ttf`.
- **`scripts/build-dex-index.mjs`** (the printable index): Playfair → Sedgwick (`SedgwickAveLatin_400Regular.ttf`) and Inter → Archivo.
- **`specs/v4.10/type/tools/fit.mjs`**: it reads the shipped subsets. Its "today" row is dropped, and the README table keeps the historical figures.
- **The website** (sipply.theidealizepr.com) is not in this repo's build. It is a follow-up for Jan, not part of v4.10.

### T.13 Before TYPE reports: the check sheet

Render `specs/v4.10/type/board/A-build-checks.png` from the **shipped** files in `assets/fonts/`, at T.2's numbers. Draw each line box and the ink-room box in a hairline. The sheet holds:
1. The 35 names that contain a 0, at `name` 22/28 in the 184 column and at `drinkHero` 60/76 in 392.
2. A two-line and a three-line hero, a wrapped grid name ("Tommy's Margarita", "Brandy Alexander"), and an accented capital under a descender ("Cognac Hors d'Âge").
3. "Żubrówka", "Šljivovica" or the catalogue's nearest Š name, and "Daiquiri" as the last line, inside their ink boxes.
4. Each Dex title with its swash in the 52 row, and "38 / 2,089" on the title's baseline.
5. "SOUR AND CITRUSY" with "See all 445", and "THE SPEC" with its aside, on one baseline.
6. The outlined "Nº 0147" and "01" at cap 48, from the regenerated `numeralGlyphs.ts`.
7. The post header's second line, "Piña Colada at Dead Rabbit", on one baseline.

Also update `specs/v4.10/type/README.md`:
- §2 and §5: these numbers and rules.
- "Anton's º is a plain ring": it is not.
- The red key is Archivo.
- Add DrinkPanels' PinnedPostBar to §5.

---

## G. Ground (package GROUND)

### G.1 Values

| | |
|---|---|
| Colours | #FFFFFF to **#FBFBFB, locked**. Neutral (R = G = B), with no token and no cream |
| Direction | Vertical only, anchored to the **window**, never to the content |
| Curve | `level(t) = 255 − 4 · smoothstep((t − 0.40) / 0.60)`, with `t = y / window height` and `smoothstep(u) = u²(3 − 2u)` clamped to 0..1 |
| Pure white | The top 40% (382pt of 956) |
| Where | Every Paper site exactly as today: `DETAIL_SITES` and ScreenTopBar's `paper` are untouched. Never a wash, a press surface, a photo, an ink ground, a sheet, a window, onboarding or Settings |
| Off | Reduce Transparency, Invert Colours **and Increase Contrast** (new): Paper draws nothing, so the page is plain #FFFFFF and the wash fills get their 1.09:1 back at the foot |
| Fallback | If the dither is ever visible on a phone, Paper returns null: plain white. **Never a darker foot, never a texture.** "Still empty" is answered by the type and the pen marks |

### G.2 The asset and `scripts/build-ground.mjs`

- **`assets/details/ground.png`.** One file, with no @2x or @3x because it is stretched.
  - 440 x 574 px: 1 px per pt over the lower 60% of the tallest window (956 x 0.6, rounded).
  - 8-bit greyscale: PNG colour type 0, bit depth 8, no alpha.
  - **Pre-dithered**: row y maps to `t = 0.40 + 0.60 · (y + 0.5) / 574`. With `L = level(t)`, pixel (x, y) is `floor(L) + (frac(L) > (B[y mod 8][x mod 8] + 0.5) / 64 ? 1 : 0)`, where B is the standard 8 x 8 Bayer matrix (0..63). Values are clamped to 251..255.
- **What that gives.**
  - The top row is all 255 and the bottom rows all 251.
  - Every 8-row band (one full Bayer period down, 55 across) averages within 1/16 of a level of the curve: 0.033 in the shipped file. A single row cannot be held tighter: one row of the matrix has only 8 thresholds, so its mean sits up to 0.332 of a level off the curve, which is the speckle and not a band. (This line read "every row's mean within 1/64" until the build measured it; corrected in the integration pass.)
  - No two adjacent rows differ by a full level across the width, so there is no contour line anywhere.
  - Each texel lands as 3 x 3 device pixels at 3x. The ±½-level speckle is about 22 cycles a degree at 40 cm, far above the band where the grain hurt (7 to 12) and far below its ±1.2%.
- **Chunks.** IHDR, then **sRGB** (intent 0, so the levels are read as the sRGB greys check-contrast measures), then one IDAT (zlib level 9, filter 0 on every row), then IEND. Nothing else: no gAMA, no pHYs, no time. The shipped file is 1,597 bytes (the 1,584 first noted here left out the 13-byte sRGB chunk), and its 13x stretch shows speckle and no edge.
- **The script.**
  - It is a port of `specs/v4.10/ground/tools/sweep-png.mjs` on `build-paper.mjs`'s pattern, with its own CRC and chunk writer and a prose header.
  - `--check` writes nothing and exits 1 unless all of these hold:
    1. `assets/details/ground.png` is byte-equal to the regenerated buffer.
    2. The histogram is only 251..255.
    3. Row 0 is all 255 and row 573 is all 251.
    4. Every 8-row band is within 1/16 of a level of the curve, and no two adjacent rows' means differ by a full level.
    5. `paper@2x.png` and `paper@3x.png` no longer exist.

### G.3 `src/components/details/Paper.tsx`: the same component, a new body

**Paper keeps:**
- its name, export and no-props API;
- `HIDDEN` and `React.memo`;
- React Native's `Image` (not expo-image), with no Reanimated;
- every placement;
- the module-level accessibility store.

**The store gains Increase Contrast:**
- `AccessibilityInfo.isDarkerSystemColorsEnabled()` at import, plus the `darkerSystemColorsChanged` event (both are in RN 0.86).
- `shown` is true only when all three flags are known and none is on.

```tsx
/** Where the sweep leaves white, as a fraction of the window's height (specs/v4.10/spec.md G.1). */
const RAMP_FROM = 0.4;
const SOURCE = require('../../../assets/details/ground.png');

export const Paper = React.memo(function Paper() {
  const on = useSyncExternalStore(subscribe, snapshot);
  const { height: screen } = useWindowDimensions();
  const box = useRef<View>(null);
  const [place, setPlace] = useState<{ top: number; reaches: boolean } | null>(null);
  const measure = useCallback(() => {
    box.current?.measureInWindow((_x, y, _w, h) => {
      const reaches = y + h > RAMP_FROM * screen;
      setPlace((p) => (p && p.top === y && p.reaches === reaches ? p : { top: y, reaches }));
    });
  }, [screen]);
  useEffect(measure, [measure]); // again whenever the window's height changes
  if (!on) return null;
  return (
    <View ref={box} {...HIDDEN} onLayout={measure} style={styles.ground}>
      {place?.reaches ? (
        <Image
          source={SOURCE}
          resizeMode="stretch"
          fadeDuration={0}
          style={[styles.sweep, { top: RAMP_FROM * screen - place.top, height: (1 - RAMP_FROM) * screen }]}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  ground: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  sweep: { position: 'absolute', left: 0, right: 0 },
});
```

- **Hooks.** Every hook runs before the early return. The React Compiler is on, so there is no conditional hook. If the compiler makes `useCallback` redundant, plain functions are fine.
- **Slicing.** Each Paper slices the same window-anchored picture at its own window y. Every Paper box is the full window width, so the slab's and the pinned bar's slices meet the page's with no step, and the dither runs on across the seam.
- **Under a bare page** (added in the integration pass). The sign-in page, the steps after it and AuthHold are white with no Paper, so the slab's slice ended in a hard step at its top edge, 255 over 251 (measured on `specs/v4.10/board-final`; build 34's grain made the same step at its mean). While one of them is focused it holds the ground bare (`src/lib/bareGround.ts`, called from CabinetSheet and AuthHold), and FloatingTabBar draws no Paper while a hold is out: white under white. Signed in, nothing holds it.
- **Boxes that end in the white 40%** draw nothing. That covers every top bar, Home's bar and status strip, and the Dex's sliding header.
- **Measurement.**
  - `measureInWindow` runs at layout and again when the window's height changes.
  - Pushes and tab swipes move pages sideways only, so a measurement taken mid-transition is still right in y.
  - No vertically presented route (log, pours, add-drink, tournaments/new, edit-profile, record) hosts a Paper. A drink pushed from inside the Pours modal is measured where it lands, which is the correct window y.
- **Cost.** One decode (440 x 574, at most about 1 MB as RGBA) is shared by every instance. One quad is drawn per root, slab and pinned bar, and nothing per frame. It replaces 32 tiles a screen.
- **The header comment** is rewritten for the sweep. Its "A TILE GRID, NEVER repeat" note becomes "one stretched Image: its layer's contents, with no backing store of its own".

### G.4 What goes, and the gate swap

- **Delete:** `assets/details/paper@2x.png`, `assets/details/paper@3x.png` and `scripts/build-paper.mjs`. `build-ground.mjs` replaces it.
- **Keep:** `specs/v4.9/details/tools/grain.mjs`, which is history.
- **Gate list:** remove `node scripts/build-paper.mjs --check` and add `node scripts/build-ground.mjs --check`.
- `check-contrast` is unchanged, because no token changes.

### G.5 Words to change

**The vocabulary**, for both packages wherever they touch a comment about the ground:
- It is still **"the paper"**, which is Paper's name.
- What it draws is **"the sweep"**: "white to 40% of the window, then easing to #FBFBFB at the foot (v4.10, specs/v4.10/spec.md G)".
- "grain", "tile", "tooth" and "fibre" leave every comment that describes the shipped app. History in the v4.9 spec's J and K stays as written.
- "a fixed sheet" stays true.

**GROUND edits these comments:**
- `Paper.tsx`;
- `activity.tsx`, `(tabs)/saved.tsx`, `(tabs)/dex.tsx`, `(tabs)/index.tsx` and `(tabs)/profile.tsx`;
- `tournaments/[id].tsx`, `custom/[id].tsx` and `drink/[id].tsx`;
- `FloatingTabBar.tsx`, `home/HomeChrome.tsx`, `tournaments/FriendsBoard.tsx` and `collections/AllSaved.tsx`.

In these files GROUND also fixes any comment naming the old faces, using T's words: Archivo for Inter, and "the marker (Sedgwick Ave)" for Playfair in a drink name.

**TYPE makes the same ground edits** in the files it owns: `theme.ts` (the detail-tier note), `ScreenTopBar.tsx` (the THE PAPER block, the `paper` prop doc and the `grain` const and style, renamed `paper`), `DrinkPanels.tsx` (`barGrain` → `barPaper`, plus its three notes), `TabPlaceholder.tsx`, `ProfileView.tsx` and `check-design.mjs`.

**Specs (GROUND):**
- **`specs/v4.9/details/spec.md` A.5** is rewritten for the sweep: G.1 to G.4, the unchanged placement table, Increase Contrast beside Reduce Transparency and Invert Colours, and the Dock note.
- **v4.9 G** is rewritten:
  - the contrast table is cut to the #FFFFFF and #FBFBFB columns (G.6);
  - Increase Contrast joins the flags;
  - the device check becomes G.7.
- **v4.9's other mentions** of the grain as shipped (the intro, A.3, D.1, D.2, E, F's rows) gain "(v4.10: the sweep, specs/v4.10/spec.md G)".
- **`specs/v4.10/ground/README.md` §6:**
  - device check 3's "foot back to #F8F8F8" is struck, because it fails `tools/measure.mjs`'s own WASH_MIN, 1.05 against 1.03;
  - the shipped asset is the pre-dithered 440 x 574;
  - `structure.png`'s 13x column is re-rendered from `assets/details/ground.png` (speckle allowed, no contour lines).

### G.6 Contrast proof (sRGB, WCAG 2)

The darkest pixel the sweep can draw is #FBFBFB, the grain's *mean*, so no pair falls below what v4.9 accepted. I recomputed every value.

| Colour | On #FFFFFF | On the foot, #FBFBFB | Needs |
|---|---|---|---|
| ink | 19.80 | 19.13 | 4.5 |
| textMuted | 6.69 | 6.46 | 4.5 |
| accent (text, the pen) | 5.54 | 5.35 | 4.5 |
| textFaint 18pt+ and lineControl | 3.45 | 3.34 | 3.0 |
| wash (fields, keys, tickets, your row) | 1.090 | 1.054 | v4.9's accepted 1.054 |
| press | 1.192 | 1.152 | decorative |
| line | 1.283 | 1.240 | decorative |

The type change adds no pair: the colours, the roles' colours and the 13pt floor are unchanged. Sedgwick's thinner stroke is set at 19pt and up, in ink or textMuted (6.46:1 at worst).

### G.7 Device checks (a 3x iPhone at full brightness, arm's length, on Saved (empty) and Activity (empty) first)

1. No line at 53, 65, 75 or 87% of the height, and no visible speckle or lattice. If either shows, ship plain white (G.1) and tell Jan.
2. Your row, Host a tournament, Edit profile, Post a drink and the Dex field still read as surfaces at the foot.
3. The tab bar's slab meets every tab root with no band, and the drink pages' pinned bar meets its page.
4. A tab-pager swipe, a slide_from_right push, and a drink opened from inside the Pours modal all show the ramp at the same height as a cold-opened page.
5. With Increase Contrast, Reduce Transparency or Invert Colours on, the page is plain white with no flash.

The type checks run on the same phone:
- the q tail of "Daiquiri" and Ż's dot are whole (ink room);
- the Dex title's swash sits clear of the bar's foot;
- the count shares the title's baseline;
- "Nº 0147" reads as Nº.

---

## F. File ownership (two parallel packages)

**Rules:**
- No file is edited by both packages.
- Neither package commits, stages, stashes, resets or switches branches.
- Neither runs prebuild, xcodebuild or a simulator, or touches a live service.
- Each keeps the edits already in the tree from other tasks. `src/components/ui.tsx` carries the email task's Field zIndex fix: TYPE edits around it and never reverts it. `.env`, `WelcomeBack.tsx`, `docs/*.md` and `specs/v4.9/meta-review.md` / `review-notes.txt` belong to the Facebook task and to neither package.
- Each runs every gate below on its result. A failure in the other package's files is reported, re-run after a minute, and never fixed.
- `theme.ts` and `check-design.mjs` are TYPE's.

### TYPE

| File | Change |
|---|---|
| `assets/fonts/*` | T.1: five new cuts and three LICENSE files; delete Inter, Playfair and their licences; rewrite `README.md` |
| `scripts/build-fonts.py` (new) | T.1, with `--check` |
| `src/lib/faceAdvances.ts` (new, GENERATED) | T.9 |
| `src/constants/theme.ts` | T.2, plus the ground note in GROUND's words (G.5) |
| `src/app/_layout.tsx` | `useFonts` keys (T.1) |
| `src/app/(tabs)/_layout.tsx` | `<TabPlaceholder title="Profile" userTitle />` |
| `scripts/check-design.mjs` | T.10, plus the rule-17 "grain" comments (G.5) |
| `src/lib/textFit.ts`, `src/lib/tags.ts` | T.9 |
| `src/components/details/lineMarks.ts` | T.9 (`inkRoom`, metrics) |
| `scripts/build-numerals.py`, `src/components/details/numeralGlyphs.ts` (GENERATED), `src/components/details/numeralPath.ts` (comments) | T.5 |
| `scripts/render-details.mjs` | The two figure caps and the loop at 48 (T.5) |
| `src/components/cabinet.tsx` | DrinkName (T.4) |
| `src/components/ScreenTopBar.tsx` | T.6, `textSideWidth` face (T.9), comments (G.5) |
| `src/components/TabPlaceholder.tsx` | T.6, comments (G.5) |
| `src/components/profile/ProfileView.tsx` | `userTitle`, comments (G.5) |
| `src/components/ui.tsx` | EmptyState's title ink room; Row's name cap 1.3; comments naming the faces. Nothing else |
| `src/components/dex/SectionHead.tsx` | `sub`, baselines, `FIGURE_CAP` 48 (T.5, T.7) |
| `src/components/DrinkPanels.tsx` | `sub`, faces, `NUMERAL_CAP` 48, comments (G.5) |
| `src/components/PostCard.tsx` | T.4, faces (T.9) |
| `src/app/add-drink.tsx` | Face literal; `SIMILAR_NAME_CAP` 1.3 |
| `src/components/auth/ProviderButton.tsx`, `src/components/bar/NextBottleSheet.tsx`, `src/components/bar/faces.tsx` | Face literals (T.9) |
| `src/components/PasswordResetOverlay.tsx`, `src/components/reels/Recorder.tsx`, `src/components/reels/CameraGate.tsx` | `emptyTitle` → `bodyStrong` (0.7) |
| `scripts/appstore-shots/compose.mjs`, `scripts/build-drink-photos.mjs`, `scripts/build-dex-index.mjs` | T.12 |
| Comment-only, the faces' names | `CelebrationOverlay.tsx`, `SipplyIntro.tsx`, `PeopleList.tsx`, `icons.tsx`, `songs.tsx`, `plate.tsx`, `places/PlaceRow.tsx`, `onboarding/PickRow.tsx`, `onboarding/Bubble.tsx`, `log/ComposeBar.tsx`, `home/NotInDexYet.tsx`, `details/PressMarks.tsx`, `artwork/VectorFace.tsx`, `tournaments/TournamentRow.tsx`, `tournaments/TournamentCard.tsx`, `brand/Wordmark.tsx` (only where a line describes today's faces; its v4.5 history stays) |
| `specs/v4.10/type/**` | T.9's fit check, T.13's sheet, the README |

### GROUND

| File | Change |
|---|---|
| `src/components/details/Paper.tsx` | G.3 |
| `scripts/build-ground.mjs` (new); `scripts/build-paper.mjs` (delete) | G.2, G.4 |
| `assets/details/ground.png` (new); `assets/details/paper@2x.png`, `paper@3x.png` (delete) | G.2, G.4 |
| Comment-only: `src/app/activity.tsx`, `src/app/(tabs)/saved.tsx`, `src/app/(tabs)/dex.tsx`, `src/app/(tabs)/index.tsx`, `src/app/(tabs)/profile.tsx`, `src/app/tournaments/[id].tsx`, `src/app/custom/[id].tsx`, `src/app/drink/[id].tsx`, `src/components/FloatingTabBar.tsx`, `src/components/home/HomeChrome.tsx`, `src/components/tournaments/FriendsBoard.tsx`, `src/components/collections/AllSaved.tsx` | G.5: the ground, and the old faces' names |
| `specs/v4.9/details/spec.md` | G.5 |
| `specs/v4.10/ground/**` | G.5: §6 and the shipped-asset structure render |

**Why these are disjoint and safe in parallel.**
- `nameInline` needs no edit at its hosts, which is why activity.tsx, custom/[id].tsx and PostSheet are not TYPE's.
- `tabTitle` is ScreenTopBar's default, which is why dex.tsx, saved.tsx, AllSaved and FriendsBoard need no type edit.
- `title` stays plain, which is why tournaments/[id].tsx is untouched by TYPE.
- GROUND changes no API, which is why no TYPE file depends on it.
- check-design passes GROUND's Paper as it stands: same module, same sites, no accent.

### Gates (from the repo root; both packages, and the lead after both land)

```
npx tsc --noEmit
npx expo lint
node scripts/check-design.mjs
node scripts/check-contrast.mjs
node scripts/check-artwork.mjs
node scripts/check-recommend.mjs
node scripts/check-ideas.mjs
node scripts/check-push.mjs
node scripts/build-share-index.mjs --check
node scripts/build-drink-photos.mjs --check
node scripts/build-icons.mjs --check
node scripts/check-intro-dock.mjs
node scripts/render-details.mjs
node scripts/build-ground.mjs --check        # replaces build-paper.mjs --check
python3 scripts/build-fonts.py --check       # new
python3 scripts/build-numerals.py --check    # new to the list
npx expo export -p ios --output-dir /tmp/sipply-export-<label>   # then delete it
```

While both packages are in flight, `build-paper.mjs --check` and `build-ground.mjs --check` may each fail for the other's half-done state. Report it, don't fix it. After landing, `grep -rniE "grain|InterLatin|Playfair" src scripts` may show only:
- "grain spirit" in `artwork/liquid.ts`;
- v4.5 history lines in `brand/Wordmark.tsx`;
- check-design's banned-family regex.

---

## W. What Jan will see

1. **Every drink name is written in the logo's hand** (Sedgwick Ave): the Dex grid, the drink page's big name, a post's header and wall label, the catch moment, onboarding and search. Names are bigger than Playfair's (22 in the grid, 60 on the drink page), and a long name wraps or shrinks; it is never cut.
2. **The tab titles are tags.** "Dex", "Saved" and "Tournaments" are in the same hand at 36pt over the red swash, as the logo's sibling. Your profile keeps your handle in a plain bold, so it reads exactly.
3. **Section heads are gig-poster capitals** (Anton) on the Dex and the drink page: SOUR AND CITRUSY, THE SPEC. The big outlined 01 and Nº 0147 are the same poster figures, at cap 48, and they now read Nº rather than N⁰.
4. **Everything you read is Archivo**, a plain grotesk: rows, steps, captions, usernames, fields, counts and amounts. Keys are a touch bolder (600). The red key reads "Post Piña Colada again" in that plain bold, never in the hand.
5. **Empty screens say their headline in the hand**: "No activity yet", "Save drinks to find them here".
6. **Numbers in names read right.** Ardbeg 10, 1800 Añejo and Old Forester 1920 have no slashed zeros. The five Vietnamese names (Rượu Đế and the others) draw in the app's own fonts for the first time.
7. **The grain is gone.** The page is white. Toward the bottom of an empty screen it settles, by about a breath, to #FBFBFB: light, not texture, with no dots, no lines and no pattern, and nothing shifts when you swipe between tabs.
8. **Fields, your row and the tickets** still stand out from the page at the bottom of the screen.
9. **Accessibility.** With Increase Contrast, Reduce Transparency or Invert Colours on, the page is plain white. Larger Text grows everything it grew before. The tab titles stay at 36, which is already as big as build 34's titles got at the top setting.
10. **Nothing else changes**: no word, the same layout, black and white with the same red in the same places, and the app's fonts about 130 KB lighter (507 KB against 639).

If Jan says "still empty", the answer is the type and the pen marks, never a darker floor. If he says the red key should be in the marker, that is one role, `button`, but it would turn about 128 keys into tags. The spec says no, and why (0.5).
