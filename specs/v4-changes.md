# v4 · Daylight, less stuff, My Bar shelves

9 Oct 2026. Build after 19 ("Brass"). Repo `/Users/janmcqueeny/Projects/drinkdex-worktrees/polish`, branch `v3-3`.

Jan, in order:

1. "remake the whole colorscheme of the app to black and white … make everything look sleek and good looking"
2. "rework the positioning of things, I want it to be pseudo minimalistic"
3. "I want less stuff. it looks really clumped up and a lot of information"
4. "make my bar section way more organized, its difficult for me to use … make it more easy to use"
5. When choosing: palette = **white**. My Bar = "the option that makes the user go through less steps to add things to his shelf, and makes it user friendly".

This file consolidates the decisions. Where the sources disagree, the order of precedence is:

1. Jan's words above, and his "fewest steps to add" amendment (section 6.2).
2. The My Bar model `specs/v4-mockups/mybar/shelves/spec.md` plus the judge's grafts in `specs/v4-mockups/mybar/judging.json`.
3. The less-stuff layout `specs/v4-mockups/layout/spec.md` (positioning, budgets, what went where), as rendered in White at `specs/v4-mockups/white-min/*.png`, with the judge's fixes in `specs/v4-mockups/directions-and-judges.json` → `less_stuff`.
4. The White palette `specs/v4-mockups/white/spec.md` (tokens, contrast, the photo bake, proofs, states without hue).
5. The rules that stay from v3.x (section 1.3).

The layout spec wins over the White spec on positioning. Concretely: no rules, dividers, cards, panels or outlines on the pages (a 1pt rule appears only under a bar once content scrolls under it); no plates, tags, chips, kickers or index rules on the Dex, the feed or the likers sheet; one 24pt side margin; three type sizes.

---

## 1. Decisions that hold everywhere

### 1.1 Palette (built: `src/constants/theme.ts`)

Black ink on gallery white. The drink photographs are the only colour, and you earn colour by catching a drink: a caught drink is the colour print, one you have not caught is a grey proof of the same frame (Dex grid only; everywhere else, including "You can make", the colour print shows).

| Role (spec) | Token | Hex | Job |
|---|---|---|---|
| page | `colors.bg`, `colors.surface` | #FFFFFF | every ground, bars, tab bar, sheets |
| wash | `colors.bgSunk` | #F5F5F5 | fields, tiles, the wash key, a photo before it decodes, the no-photo face |
| press | `colors.press` | #EBEBEB | pressed fill of a white or wash control |
| line | `colors.line` | #E3E3E3 | the 1pt rule under a scrolled bar; TabStrip foot |
| hair | `colors.hair` | #D6D6D6 | row separators (hairlineWidth), an off chip's edge |
| rule | `colors.rule` | #C4C4C4 | sheet grabber, ruler baseline |
| control | `colors.lineControl` (and `textFaint` for 18pt+ text) | #8A8A8A | control edges, empty plate, unticked box, no-photo glass. UI 3:1 only |
| muted | `colors.textMuted` | #5C5C5C | quiet text, placeholders, resting tab glyphs, not-yet names |
| ink | `colors.text`, `colors.lineInk` | #0A0A0A | text, the primary key, the +, ticked tiles, active glyphs, focus ring |
| | `colors.inkPressed` | #333333 | a held ink key |
| | `colors.onInk` / `onInkMuted` | #FFFFFF / #A3A3A3 | text on ink |
| | `colors.scrim` | rgba(10,10,10,.36) | behind a sheet |
| | `colors.photoEdge` | rgba(10,10,10,.07) | 1pt inset edge on every print |
| | `colors.tone1..tone4` | #262626 #3D3D3D #5C5C5C #E3E3E3 | avatar initials discs (`avatarTone(accent)`) |
| | `reel*` | ink / white | Reels (flagged off) |
| quotations | `facebook`, `google*`, `appleFill`, `providerEdge`, `providerInk`, `filmPaper` | | third-party marks; the intro film's paper |

Retired with no replacement name: wine, wineDeep, merlot, wineSoft, wineWash, textOnWine, taupe, taupeInk, amber, danger, dangerWash, success, lining, liningDeep, onLining\*, mat, slot\*, emboss\*, every brass\* and walnut\* token, label, storyRing\*, glyphTint, grain, walnutTile, `elevation.bar/seat/recess/paper/barDark/logAction`, `label.tagline`, `drinkGlyph`. Their users were remapped to the role tokens above (wine → text, onLining → text, lining → bg, liningDeep → bgSunk, danger → text, …).

**No red.** Errors are an ink ring + the alert glyph + the message in ink. Destructive words are ink SemiBold underlined, always followed by the system confirm (iOS colours that itself). Success has no colour.

**Status bar dark on every screen.** `FocusedStatusBar` is gone. Light only (`userInterfaceStyle: light`, `backgroundColor` and splash `#FFFFFF` in app.json). The stories viewer (`pours/[authorId]`) keeps its own light status bar over a full-bleed photo.

Contrast: every pair in white spec 1.2 is asserted by `node scripts/check-contrast.mjs`, which also fails on any hue in `colors` (R = G = B) outside the quotations, and asserts the "never" pairs stay unreadable.

### 1.2 Type, space, shape (built)

Three sizes (layout spec 2), plus Playfair at two of them for drink names. Use `textRole`:

| Role | Spec | Use |
|---|---|---|
| `title` | Inter 600 28/34 −0.4 | tab-root titles, set left |
| `body`, `bodyMedium`, `bodyStrong` | Inter 400/500/600 17/24 −0.2 | rows, keys (500), shelf heads, payoff (600), captions, field text |
| `small` | Inter 400 13/18 | story names, quiet counts, bios, meta, sublines |
| `nameLg` | Playfair 700 28/34 | the feed/post wall label, the catch moment |
| `name` | Playfair 700 17/24 | every drink name in grids, lists, results, sheets |
| `wordmark` | Playfair 700 28/34 | Home's bar, set left |
| `drinkHero` | Playfair 700 52/56 | drink page |
| `plate` | Inter 500 13/18 +1.0 tabular | "Nº 0127" (drink page, ••• sheet, Nº rail thumb) |

The older named roles (`rowTitle`, `sectionTitle`, `helper`, `button`, `prose`, `heroFigure` …) still exist and are re-valued onto the three sizes; new code should prefer the five above. `rowName/cardName/printName/miniName/tileName` → `name`; `nameplate/shelfName` → `nameLg`; `barTitleLg` → `title`; `kicker/dateline/holder/rank` → `small` (those uses are meant to disappear). `type` (typeScale) is legacy, read by auth/reels/forms; do not add new readers.

- `layout.gutter` = **24** (one side margin, every screen). `layout.topBar` 52 (the row under the status bar, 62–114 at 440). `layout.tabBar` 49. `layout.control` 52 (block key), `controlSm` 36, `search` 44, `rowTall` 64, `gridGap` 8 (Profile), `dexGap` 24, `dexLedge` 24, `section` 32, `group` 24, `story` { ring 62, ringWidth 2, gap 3, perRow 5 }.
- `space` unchanged (4 · 8 · 12 · 16 · 24 · 32 · 48).
- `radius`: none 0 (prints, tiles), badge 2 (plates, tags, boxes), **control 4** (keys, fields, chips, tiles, the +, the payoff key), card 8, sheet 12, round (avatars, story rings, dots ≤ 10pt only).
- `elevation`: only `sheet`. Nothing that scrolls casts a shadow; the tab bar casts none.
- Separation is by **space** (24–32 between groups), never by rules, cards or outlines.

### 1.3 Rules that stay (every package)

- No uppercase text anywhere (letter-spacing only on figure codes via `textRole.plate`).
- Squared keys and tiles (4pt). Round only: avatars, story rings, dots.
- WCAG AA on every text pair; `node scripts/check-contrast.mjs` passes.
- `node scripts/check-design.mjs` passes. It now also fails: an edge token (`line`, `hair`, `rule`, `press`, `photoEdge`, `scrim`, `lineControl`) as a text colour; `textFaint` with a literal fontSize under 18; any expo-image `<Image>` without `accessibilityIgnoresInvertColors`; a screen/root ground other than `bg`, `surface`, `reelGround`.
- Dynamic Type: text wraps, never truncates mid-word; drink names only through `DrinkName` (never `numberOfLines`). A one-line limit with ellipsis is allowed only where the layout spec says so for non-name text (a bio, a long ingredient label).
- VoiceOver: every control labelled; the tab bar has no visible labels, each tab keeps its `tabBarAccessibilityLabel` (done in `(tabs)/_layout.tsx`).
- Motion only native or UI-thread, resting state drawn: no Reanimated layout animations (`entering/exiting/layout`), no timed RN `Animated` (check-design rules 3 and 15). Sheets use the Modal's own native animation. Things that "go away after a moment" (the Nº rail) are cut on a JS timer, never faded.
- Images in small frames keep `enforceEarlyResizing` and a per-size `cacheKey` (`${path}#<w>x<h>`); every photo `accessibilityIgnoresInvertColors`.
- Keep every v3.3 behaviour: swipe tabs (TopTabs / pager-view), the full-screen `/log` window with results above the keyboard, the likers sheet, Apple/Google/Facebook sign-in, account deletion + Apple revoke.
- Comments: short WHY comments in the house style (boxed headers, sentences, no "TODO" without a reason). Delete dead brass/walnut/grain/tungsten/lining code rather than leaving it unused.
- No new dependencies, no installs, no Metro/simulator/prebuild/xcodebuild, no git writes, **no new route files** (typed routes need Metro to regenerate): new surfaces are `Modal presentationStyle="pageSheet"` or the short `BottomSheet`, or an existing route (Dex progress is `/stats`).

---

## 2. The foundation (built in step 1; read-only for packages)

### 2.1 Files

| File | State |
|---|---|
| `src/constants/theme.ts` | Daylight tokens, `onMedia` = { ink, fill, ring, edge }, roles, layout, radius, elevation, `CATEGORY_META` neutral, `avatarTone`, `SIGNUP_ACCENTS` (the four tones), `ACCENT_NAMES` (Graphite, Charcoal, Slate, Mist, plus every old hex). |
| `scripts/check-contrast.mjs` | Rewritten for Daylight (pairs, never-list, no-hue). Grain/walnut checks deleted. |
| `scripts/check-design.mjs` | Rule 6 name roles, rule 9 + invert, rule 10 grounds, rule 16 edge-ink. |
| `src/components/ui.tsx` | Monochrome primitives (below). Lining tones and lining button variants deleted. |
| `src/components/cabinet.tsx` | `DrinkName`, `Print`, `HeroFigure`, `DexStatusTag`, `dexStatusTagWidth`, `VerticalFade`, `svgStop`, `useSvgId`; **transitional** `LiningBand`, `Mount`, `MountWindow`, `MOUNT`, `LoosePrint` (flat, deprecated). |
| `src/components/media.tsx` | Only `MediaMarker` and `MediaNumberPlate`. Nameplate, DexStatusPlaque and TopScrim are deleted: no words on photos. |
| `src/components/plate.tsx` (new) | `NumberPlate`, `formatPlateNumber`, `formatRange`, `plateWidth`, `PLATE_CAP`, `PlateSize`, `PlateTone`. |
| `src/components/Ruler.tsx` (new) | `Ruler`, `DexPanel`, `rungCounts`, `dexPercent`. |
| `src/components/NumberRail.tsx` (new) | The Nº rail (scroll-only; the caller mounts it). |
| `src/components/Sheet.tsx` (new) | `BottomSheet`, `ActionSheet`, `SheetAction`, `SheetGrabber`. |
| `src/components/DexCard.tsx` | `DrinkFace` (photo / proof / no-photo face), `DexCard` (print + name, `outlined`), `DexThumb` (square print 52/44), `EmptyArt`, `dexCardHeight`, `FACE_FILL`. |
| `src/components/artwork/VectorFace.tsx`, `artwork/index.tsx` | The no-photo face (wash + glass outline in control at 1.4pt); `GlassOutline`; `DrinkArt` paper face only (reels). |
| `src/components/icons.tsx` | Stroke 1.6. New glyphs `bell`, `sliders` (solid = filter on), `arrowRight`. |
| `src/components/FloatingTabBar.tsx` | Docked opaque page bar, five glyphs, no labels, active = filled glyph in ink, + = the only filled key (52 × 38 ink, radius 4). `TAB_BAR_CLEARANCE` = 65 (49 + 16): tab screens still pad `insets.bottom + TAB_BAR_CLEARANCE`. |
| `src/components/ScreenTopBar.tsx` | `size="lg"` root bar (title left at the gutter, one control right), `size="md"` pushed/window bar (centred title or `titleVisible={false}`), `TopBarButton`, `TopBarTextButton`, `TopBarCount` (new), `useScrolledPast`. `tone`, `rightSlots`, `FocusedStatusBar` deleted. |
| `src/components/home/HomeChrome.tsx` | Wordmark left + Activity bell (badge dot). Props `{ scrollY, unread, onActivity }`; `HOME_BAR_HEIGHT`. |
| `src/components/ScrollChrome.tsx` | Tab-bar compaction removed (`useTabBarCollapse`, `CHROME`). `useTabScroll`, `useHideOnScroll` unchanged. |
| `src/components/TabPlaceholder.tsx`, `src/app/(tabs)/_layout.tsx`, `src/app/_layout.tsx`, `app.json` | Page grounds, titles left, dark status bar, white splash. |
| Deleted | `src/components/brass/**`, `src/components/Grain.tsx`, `assets/images/grain.png`, `assets/images/walnut.webp`, `scripts/build-walnut.py`. |
| `src/data/drinkPhotos.ts` | API renamed (`photoFor`, `proofFor`); still points at the tungsten set and `assets/drinks/ghost/` until the photos package regenerates it. **Owned by the photos package from step 2.** |

Every other screen file got only mechanical edits to compile (token remaps, Grain and `FocusedStatusBar` removed, `tone="lining"` stripped, brass imports replaced by the survivors, minimal stand-ins marked "v4 foundation stand-in"). They may still look half-v3; redrawing them is the packages' job.

### 2.2 The API packages use

**Tokens.** As 1.1/1.2. Grounds: a screen root is `colors.bg` (check-design rule 10). Text: `text`, `textMuted`, `onInk`; glyphs may also use `lineControl`.

**Keys (`Button` in ui.tsx).** Variants: `primary` (ink, onInk, inkPressed held), `secondary` (the wash key, ink label, press held), `text` (ink word; `muted` for the back-out), `danger` (ink outline key, underlined label), `dangerText` (bare underlined), `onDark` / `onDarkText` (reels). Sizes `md` (52 tall) and `sm` (36, hitSlop to 44). `tonal`, `onLining*`, `dangerOnLining` are gone.

**Other ui.tsx primitives.** `Chip` (off: page + hair edge + ink; on: ink + onInk, count onInkMuted; no tone prop), `SearchField` (wash, no edge; focused: white with a 2pt ink ring overlay and ink glyph; `returnKeyType` defaults to `'default'`; `keyboardAppearance` light), `Field` / `FieldGroup` / `SelectField` (wash boxes; focus and error = ink ring; error adds the alert glyph and ink message), `ListGroup`/`Card` (a wash panel, radius 8, no edge), `ListRow` (`destructive` = ink SemiBold underlined; `titleRole="name"` uses `textRole.name`), `SegmentedControl`, `ProgressBar` (ink fill), `Notice` (no red), `EmptyState` (`tone` 'paper' | 'dark'), `Hold`, `Avatar` (grey tone disc via `avatarTone`; `ring` = 1pt ink ring with a 3pt gap), `PressableScale` (media tiles only), `haptic`, `announce`/`useAnnounce`, `MediaIconButton`, `Tag`, `CategoryTag`, `Divider`, `OrDivider`.

**Top bars.**

```tsx
// tab root: title at x 24, one control right-aligned to x 416
<ScreenTopBar size="lg" title="Dex" showRule={scrolled}
  right={<TopBarCount text="38 / 2,089" onPress={openProgress}
           accessibilityLabel="38 of 2,089 in your Dex" accessibilityHint="Opens Dex progress" />} />
<ScreenTopBar size="lg" title="My Bar" showRule={false}
  right={<TopBarButton icon="search" label="Find an ingredient" onPress={...} />} />
// pushed: back chevron only, no visible title (post detail)
<ScreenTopBar title="Post" titleVisible={false} showRule={scrolled}
  left={<TopBarButton icon="chevronLeft" label="Back" onPress={back} />} />
// window with a Playfair title (the + window after picking)
<ScreenTopBar title={drink.name} showRule
  titleNode={<DrinkName name={drink.name} role={textRole.name} measure={w - 160} cap={1.3} color={colors.text} />}
  left={<TopBarButton icon="chevronLeft" label="Back" onPress={...} />} />
```

`TopBarButton` badge = an 8pt ink dot with a 2pt page ring, and ", new" spoken.

**Photos.** `photoFor(id)` → the daylight colour print (bundled number, 1024px) or undefined; `proofFor(id)` → the 256px grey proof or undefined; `PHOTO_COUNT`. Draw them through `DrinkFace`:

```tsx
<Print width={w} height={h}>            // wash ground, square, 1pt photoEdge over the picture
  <DrinkFace drink={d} mode={caught ? 'photo' : 'proof'} width={w} height={h}
             photoUri={pour?.uri} photoCacheKey={pour?.path} transition={reduceMotion ? 0 : 140} />
</Print>
```

`DrinkFace` handles the per-size cache key, `enforceEarlyResizing`, `cachePolicy="disk"`, invert-colours and the no-photo face (1,927 drinks). `mode="photo"` with a user pour shows the pour. The proof → photo native crossfade is DrinkFace's `transition` (white spec 5.21: the catch).

**Dex cell.** `<DexCard drink cardWidth collected userPhotoUri userPhotoCacheKey nameLines outlined onPress />`: square print + Playfair name (ink when caught, muted when not). `dexCardHeight(cardWidth, fontScale, nameLines)` for estimates. `DexThumb` (`size` 'row' 52 / 'mini' 44) for rows. `EmptyArt({ drinkId, mode })` for empty states.

**Plates.** `<NumberPlate n tone="caught" | "notYet" | "media" size="sm" | "lg" label? />`; `formatPlateNumber(n)` → "Nº 0127" (U+00BA). Over a photo: `MediaNumberPlate` / `MediaMarker` from media.tsx.

**Progress.** `<Ruler count total mode="scale" | "ladder" />`, `<DexPanel count total />` (wash panel: figure, "of 2,089 in the Dex · 1.8%", rank word, ladder ruler, "171 more to Barfly in Training, at 209"), `rungCounts(total)`, `dexPercent`.

**Nº rail.** `<NumberRail total current onJump style />` — the caller mounts it on `onScrollBeginDrag`, keeps it while dragging or momentum, and unmounts it 1.2s after `onMomentumScrollEnd`/`onScrollEndDrag` with no momentum (a JS timer, a cut). Never mounted at rest.

**Sheets.**

```tsx
<BottomSheet visible onClose title="Next bottle">…</BottomSheet>      // short: transparent Modal, scrim, grabber, fade
<ActionSheet visible onClose header="ines.ag · 2h · La Factoría, Old San Juan"
  actions={[{ label: 'View drink', detail: 'Nº 0127', onPress }, { label: 'Report', destructive: true, onPress }]} />
<SheetGrabber />   // for a pageSheet that draws its own head (LikersSheet, pickers)
```

Anything with a text field or a long scroll is a `Modal presentationStyle="pageSheet"` (as LikersSheet), never a BottomSheet.

**Spacing constants.** `layout.gutter` (24), `layout.section` (32 between groups), `layout.group` (24), `space.*`. Print column = `width − 2 × gutter` (392 at 440, 345 at 393).

### 2.3 Transitional exports (delete at integration)

`LiningBand`, `Mount`, `MountWindow`, `MOUNT`, `LoosePrint` (cabinet.tsx) are flat stand-ins kept only so un-redrawn screens compile; their prop docs say which props no longer do anything. `VerticalFade` is kept for ReelCell. Packages replace their call sites with `Print`, `View` and space. After all packages land, the integration pass (section 8) deletes each export with no importer.

A package that needs a foundation change (a new glyph, a new token, a prop) does **not** edit the foundation: it builds what it needs locally inside its own files, or lists the request in its report for integration.

---

## 3. Home (layout spec 5.1 · `white-min/home.png`)

**Budget: 27 elements at rest** (bar 2, stories 10–12, post 7, next photo 1, tab bar 5). Post block ≤ 7.

- **Bar**: HomeChrome (built): wordmark left, Activity bell right with the unread dot. No +, no trophy.
- **Stories**: rings 62 across, **five whole rings** per screen width: slot = `(width − 2 × gutter) / layout.story.perRow` (78.4 at 440), first ring at x 24, the row scrolls edge to edge. Unseen = 2pt ink ring + ink name. **Seen = no ring at all** + muted name. Your own disc first, named "You"; no "+" badge: tapping your ring with no story opens `/log` (camera), with a story plays it ("Add" lives in the viewer). Names `small`, centred, one line (ellipsis allowed for a username). 24 below the names, the first post.
- **Post (feed)**: the print 4:5 in the 392 column (radius 0, photoEdge), then one line: drink name `nameLg` left and author `small` muted right, sharing a baseline (the name wraps; the author drops below if it must). Then the actions row: heart (28, solid ink when liked, no red), the like count in body (tap opens the likers sheet), and right-aligned save (bookmark, only where the server has saves) and •••. No caption, no "Liked by" faces, no comment/share glyphs, no plate, no tag, no style/origin line on the feed. 32 to the next post.
- **Post •••** = `ActionSheet`: header "author · 2h · place"; Comment (if it exists today; else omit), Share, Save/Remove from saved, View drink (detail "Nº 0127", opens /drink), Report (destructive) — and Edit, Delete on your own posts (Delete destructive + system confirm). Everything the old menu did stays reachable here (block, report reasons…).
- Double-tap to like, gallery tap-to-advance and the gallery count marker (`MediaMarker`) stay.
- "Not in your Dex yet" band and Today's pours: keep the behaviour, redraw in Daylight (prints on page, names `name`, no band, no lining); judge whether it fits the 27 budget — the band appears only between posts 5/6 and 15/16 as today.
- Stories viewer (`pours/[authorId]`): keep as is functionally; restyle chrome to ink/white; drink name over the photo stays on a solid ink plate only, or under the photo.

**Post detail** (`post/[id]`, `white-min/post-rest.png`) — **9 at rest**: back chevron (no title, no bar icon), author row (32 avatar, name body 600, ••• right), print 392 × 490, drink name `nameLg`, full caption (body), heart + count. Tap the count → likers sheet.

**Likers sheet** (`white-min/post.png`) — **sheet ≤ 25**: pageSheet, grabber, "Liked by" (body 600). Rows 64: 44 avatar, name body, "(you)" muted on your row; key right: Follow (primary sm, 116 × 36) or Following (secondary sm). No handles, no tags, no plate, no sub-line. The search appears only at the large detent when more than 50 people liked it.

Acceptance: Home at rest counts ≤ 27; five whole rings on 393 and 440; a seen story has no ring; no text on any photo; liked heart solid ink; likes count opens the sheet; the post ••• contains every action the old menu had; VoiceOver reads each post as name, author, liked state; check-design clean.

## 4. Dex, drink page, Dex progress (layout spec 5.2 · `white-min/dex.png`)

**Dex budget: 25 at rest** (title + count 2, field 4, tiles 14, tab bar 5).

- **Bar**: `size="lg"` "Dex", right `TopBarCount` "38 / 2,089" (filtered: "12 / 1,190") → pushes `/stats` (Dex progress).
- **Field**: 392 × 44 wash, glass glyph, placeholder "Search a name or number", the `sliders` glyph at the right (own 44 hit area) opening the **filter sheet** (`BottomSheet`: All · Cocktails · Spirits / Caught · Not yet, as Chips with counts). Filter on → the glyph is the solid `sliders`, and the count shows the filtered total.
- **Grid**: 2 columns, cell = `(width − 2·24 − 24) / 2` (184 at 440), row gap 24. `DexCard`: print + name (8 below). Caught = colour print + ink Playfair name; not yet = proof + muted Playfair name. No plates, ranges, shelves, tags, chips on the page. Names wrap (2 lines reserved via `nameLines={2}` if that keeps rows level; never truncate).
- **Typing a number** ("127", "0127", "#127", "Nº 127") jumps the grid to Nº 0127 and outlines that tile (`outlined`) for 1s (a JS timer clears it), without filtering the grid; a number past the end says "There is no Nº 2500. The Dex runs from Nº 0001 to Nº 2,089." The jump keeps v3.3's retry-until-measured logic.
- **Nº rail**: `NumberRail`, **strictly scroll-only** (mounted on scroll begin, unmounted 1.2s after the scroll ends; never at rest), at x 412–436.
- Latest catch, the gauge, chart icon, chips, range headers, rails: off the screen (to Dex progress).

**Dex progress** (`app/stats.tsx`, the existing route, pushed): back chevron; `DexPanel`; the latest catch (print + name, opens the drink); "See your 38" (opens the Dex filtered to Caught); the per-category breakdown from CollectionStats restyled. Reached from the Dex count and Profile's "38 drinks in your Dex ›". Same numbers as the Dex tab (38 on both).

**Drink page** (`drink/[id]`, DrinkPanels; not mocked; white spec "not mocked, same kit"): white page; the square print full width (wash until decoded); `drinkHero` name; the `lg` plate (caught / notYet) and `DexStatusTag`; category, glass, origin, "friends who caught this" — everything the feed and grids dropped lives here. Sections ("Origin story", "The spec") separated by space, headings body 600. The pinned action bar on page with one primary key. Back is a `MediaIconButton` over the photo or a page bar — no gradient scrim. Remove-from-collection is `dangerText` + system confirm.

**The catch** (CelebrationOverlay): the print crossfades proof → colour via `DrinkFace transition` (0 under Reduce Motion), the plate fills ink at the same moment, `nameLg` name. No Reanimated layout animation (its existing `entering` allowlist entry is the only one).

Acceptance: Dex at rest ≤ 25; no plate/tag/range/chip on the Dex page; typing 127 jumps to and outlines Nº 0127 for 1s; the rail never shows at rest; the count opens Dex progress; Dex progress and Profile agree; drink page shows Nº, state, category, glass, origin; check-design clean.

## 5. Profile and the people screens (layout spec 5.5 · `white-min/profile.png`)

**Budget: 31 at rest** (title + ••• 2, avatar 1, name + bio 2, counts 6, Edit profile 1, Dex line 2, grid 12, tab bar 5).

- **Bar**: `size="lg"` with the username as title, ••• right → `ActionSheet`: Share profile, Settings, Tournaments (only while the server has them; detail "2 invitations" when pending), About (the full bio). No + and no gear in the bar.
- 80 avatar at x 24 (photo or tone disc), name body 600 and the bio `small` muted beside it (one line, ellipsis allowed; full bio in About and Edit profile).
- Counts on one body line: figures 600 ink, labels muted, 28 apart ("64 posts  212 followers  180 following"); followers/following open connections.
- One key: Edit profile (secondary, 392 × 44). On someone else's profile the slot is Follow (primary) / Following (secondary).
- "38 drinks in your Dex ›" (`small` muted + 16pt chevron) → `/stats`.
- Grid: 3 columns, 8 gaps, square tiles (radius 0), **no plates**; your posts. No Posts/Dex tab strip; a peer's caught drinks are on their Dex progress or drink pages.
- Peer profile (`user/[id]`, PeerProfile): the same layout with Follow in the key slot.
- Edit profile, connections, settings, saved, blocked, find friends (FindFriends, FacebookFriends, InstagramImport, WelcomeConnect): restyle in the kit (page grounds, wash ListGroups, wash fields, ink keys, no cards with edges). Accent picker becomes the four tones by name (Graphite, Charcoal, Slate, Mist) using `SIGNUP_ACCENTS`/`ACCENT_NAMES`; `CATEGORY_META.*.color` is no longer a valid map key (both are ink).
- Settings keeps account deletion (+ Apple revoke) exactly as v3.3; destructive rows are `ListRow destructive`.

Acceptance: Profile at rest ≤ 31; one key on screen; no plates on the grid; the ••• sheet holds Share, Settings, Tournaments, About; Dex line opens Dex progress with the same 38; account deletion flow unchanged; check-design clean.

## 6. My Bar: shelves, fewest steps (shelves spec + judging grafts + Jan's amendment)

Mockups: `specs/v4-mockups/mybar/shelves/{empty,basics,stocked,picker,search,ingredient,removed,next,make}.png`. Read shelves `spec.md` whole; this section lists what changes from it.

### 6.1 The screen (top to bottom)

1. **Bar**: `size="lg"` "My Bar". No icon (the search lives on the page, 6.2), no quiet count.
2. **Fixed head (does not scroll)**:
   - **Payoff key**: an ink key 392 × 52, radius 4: "You can make 31" in body 600 onInk, then — right-aligned before the chevron — the **last change** in onInkMuted: "+10" or "−5" (only after a change this visit; tabular), then a 22pt chevron. Opens the Make list (6.5). Nothing to make yet: "Nothing to make yet", not a button, no chevron (wash key look, ink text). Empty bar: hidden.
   - **The add field** directly under it (12 gap): `SearchField` "Add an ingredient" (wash, 44). See 6.2.
3. **Scrolling body**:
   - **Next line** (44 hit): "Add dry vermouth → 10 more drinks" — "Add dry vermouth" body 500 ink, `arrowRight` 16 muted, "10 more drinks" muted — and at the right a one-tap **Add** key (secondary sm). Tapping the words opens the Next bottle sheet (6.4); tapping Add adds it at once and the line holds "Dry vermouth is in · Undo" in place (Undo a text key) until the tab loses focus or the next change, so the next suggestion never slides under the finger. Ranked by the canonical `result.nextBest` (how many one-away drinks name the bottle), ties by full gain (`gainOf`), then uses, then A to Z; the number shown is the true full gain. Hidden when nothing is one bottle away.
   - 32 of space, then the **seven shelves**, always in this order: Spirits · Liqueurs & vermouth · Mixers · Fresh · Syrups & sugar · Bitters · Other. Head: shelf name body 600 left, "+ Add" (16 plus + "Add" muted, 44 hit, label "Add to Spirits") right. Tiles: wash, radius 4, 44 tall, 16 inset, label body ink, 8 apart both ways, wrapping; **A to Z** (folded); a long label one line with ellipsis. Empty shelf: one `small` muted line of examples ("Lemons, limes, mint, eggs, cream"). 28 between shelves. Other shows only what you own.
   - Foot: "Clear my bar" (`dangerText`), only when the bar holds something; system confirm; then the Undo-in-place rule applies to the whole bar (tiles struck, one "Undo" under the shelves) until blur.
4. **Empty state** (no items): "Nothing in your bar yet" body 600, the muted sentence, the key "Start with the basics" (primary block 52), then the seven shelves with their example lines. No payoff, no next line.
5. **Before hydration**: the bar and nothing else (never flash the empty state).

### 6.2 Adding, in the fewest steps (Jan's amendment)

- **The add field** (on the screen, under the payoff key): focusing it shows the results **between the field and the keyboard** (a list overlaying the shelves; the fixed head stays); type, tap **+** on a result, done — **3 taps** (field, type, +), no Done needed, the keyboard stays up for the next one (`keyboardShouldPersistTaps="handled"`, `keyboardDismissMode="on-drag"`). Each row: the canonical label (body), a small muted line only when it explains the hit ("Cointreau is a triple sec", "Any whiskey · covered by your bourbon", "On Liqueurs & vermouth"), "+N" muted when N > 0, and the key: **+** (add) or **✓** (in your bar; tap removes). Tapping a row's key toggles **in place**: rows never reorder while the field has text. Empty field focused: "Brand names work too, like Cointreau" (small muted) above the seven shelves as rows that open each shelf's picker. No match: "Nothing called “xyz”. Try a kind, like rum or citrus." Cancel = tap outside / drag.
- **"+ Add" on a shelf** opens that shelf's picker (pageSheet): title = the shelf, a field "Search all ingredients", rows 56 in the fixed `uses` order (Spirits grouped by family: Gin, Rum, Whiskey, Brandy, Tequila & mezcal, Vodka, More spirits, each with a small muted head). **Every tap on a row adds or removes immediately**, the box fills in place, "+N" recomputes, no row moves. The sheet just swipes away; a "Done" may remain as an optional close in the bar; the foot shows "You can make 41" live.
- **Start with the basics** opens a BottomSheet with the **14 basics PRE-TICKED** in shelf order (two-column tiles 52 tall, ticked = ink + onInk + white check), "Untick what you don't have" (small muted), foot "Makes N drinks" (live) and the key "Add 14" (counts the ticked; disabled at 0 with "Tick what you have"). Owning all 14 is **2 taps** (Start, Add). A swipe down adds nothing.
- **Nothing reorders under the finger, ever**: shelves are A to Z, pickers fixed by `uses`, the Next bottle sheet freezes its order when it opens, removals stay in place until blur.

### 6.3 Removing and Undo (judge graft: in place, no toast)

Tap a tile → the **ingredient sheet** (BottomSheet): the name (body 600), its shelf (small muted), "In 5 of the 31 you can make" (body), **"Show its drinks"** (text key → the Make list filtered to drinks using it; no inline list), family note when relevant ("Counts as any rum, too"), and one key "Remove from my bar" (secondary block). Remove closes the sheet and the tile **stays where it was, struck and muted, reading "Lime · Undo"**; tapping it puts the bottle back. The struck tiles clear when the My Bar tab loses focus. No Toast component. The payoff key shows "−5" as the last change.

### 6.4 Next bottle sheet

BottomSheet "Next bottle": rows 64: name body 500, "10 more, like Martini and Clarito" small muted (named drinks: photographed first, then Dex number), key Add (secondary sm) → "✓ Added" (primary sm) in place; tap again removes. Order frozen at open (`useState` initializer), counts live. Top 10, scroll to the end, no "Show more".

### 6.5 The Make list (pageSheet, no route)

"You can make 31" (title), the jump line "Gin 15 · Rum 3 · Whiskey 10 · Without a spirit 3" (small muted, each name jumps), sections by base spirit (family of the first Spirits-shelf slot), **familiar drinks first inside each section** (photographed first, then Dex number, then A to Z — the judges' graft, so Negroni sits above Artillery), rows 56: a 40 colour print (never a proof) + `name`. A row opens the drink page (close the sheet first or push over it). `SectionList` with fixed row height and `getItemLayout`. Filtered variant from "Show its drinks".

### 6.6 Data (scripts/build-bar-index.mjs → src/data/barIndex.json)

1. Emit `shelf` per ingredient (category + ~30 per-id overrides; `specs/v4-mockups/mybar/shelves/tools/shelves.py` holds the list) and `family` for spirits.
2. Emit `aliases` per ingredient: the VARIANT left sides that fold into it, plus the brand list (Martini Rosso → sweet vermouth, Noilly Prat → dry vermouth, Bacardi → white rum, Kahlúa → coffee liqueur, Baileys → Irish cream, Luxardo → maraschino, Cointreau → triple sec, club soda / seltzer → soda water).
3. **Sloe gin out of the gin family; apricot brandy and peach brandy out of the brandy family** (keep them as their own ids, move them to Liqueurs). Today sloe gin "makes" a Martini.
4. Merge duplicates and refile: "Angostura" (`other`) → Angostura bitters; lime-disc/zest, orange-slices, orgeat-syrup, golden-rum, kahlua, agave-nectar, egg variants merged into their canonical ids; refile the ~80 `other` items to their real shelves so Other holds only the odd ones; look at "Red" and "Irish whiskey shot" (parse leftovers).
5. Every merged id is added to `RETIRED` in `src/store/bar.ts` so stored bars migrate on load.

`src/lib/bar.ts` gains `Shelf`, `SHELF_ORDER`, `SHELF_LABEL`, `SHELF_EXAMPLE`, `Family`, `inventory(owned)`, `shelfList(shelf)`, `coveredBy(id, owned)`, `nextBottles(result, skip?)` (canonical nextBest order, full gain shown), `baseSpirit(drinkId)`, `makeList(result)` (sections, familiar first), and alias/family/shelf-word search (order: label starts, alias starts, family/shelf word, contains; ties uses then A to Z; cap 40). `bestBottle` becomes `nextBottles(r)[0]`; `CATEGORY_ORDER`/`CATEGORY_LABEL` (chips), `browseIngredients` (paging) retire; `model.ts`'s snapshot/paging/strip/away helpers, `BarPicker.tsx`, `Counter.tsx`, `PourTonightSheet.tsx` retire.

Acceptance (the eight tasks, counted as taps): basics all 14 = 2; add Campari from the field = 3 (field, type "camp", +); add Cointreau = 3 (finds Triple sec, "Cointreau is a triple sec"); check Campari = 0; remove lime = 2 (tile, Remove); undo = 1 (the struck tile); see what I can make and open Negroni = 2–3 (payoff key, Negroni near the top of Gin); best next bottle = 1 (Add on the line). Numbers for the 12-item test bar match the frames (31; −lime 26; +dry vermouth 41) with the family fix. Nothing moves under a tap. Screen at rest ≤ 34 elements (12 tiles). check-design clean.

## 7. The + window, sign-in and the rest (layout spec 5.6 · `white-min/plus.png`, `plus-compose.png`)

**Find mode — budget 18 mid-search**: X (24pt, x 22) and the field (352 × 44 at x 64, wash, focused: white + ink ring, × clear) in the top row — no "Post a drink" title, no photo beside the field, no counts line. Results from y 130 at a 68 pitch: a 52 `DexThumb` (colour print if it has one, else the no-photo face) and the name in `name`; no plates, no subtitles except when two results share a name (then a small muted origin). Results fill to the keyboard; KAV as v3.3. The last row is "Add “neg” as a new drink" (reached by scrolling). `keyboardAppearance="light"`, `returnKeyType="default"`.

**Compose (after picking) — budget ~6**: bar with back chevron and the drink's name in `name` as the centred title; the photo 392 × 490 (wash with a camera glyph when empty; tap = camera or library); caption field 392 × 88 wash, placeholder "Say something about it"; the **Post** key (primary block 52) at the foot (16 above the keyboard when up). Keep v3.3's "save without posting": a `text` key "Save to Dex only" under Post. The catch overlay as section 4.

**Sign-in / auth** (`components/auth/**`, AuthGate, PasswordResetOverlay): white page, `wordmarkLg`, provider rows unchanged quotations (Apple black, Google/Facebook outlined rows), email/phone steps in the kit. The CabinetBackdrop becomes a plain white page (no lining, no mounts). Keep every flow (Apple/Google/Facebook, email, phone code, password reset, consent, taste picker).

**Activity, tournaments, add-drink, custom drink, reels, songs/music**: restyle into the kit (page grounds, rows 64, avatars, ink keys, no cards with edges, no red). Reels stay flagged off; their dark ground is `reelGround`.

Acceptance: + window mid-search ≤ 18; compose ≤ 7; results above the keyboard; sign-in by all three providers unchanged; account deletion unchanged; check-design clean.

---

## 8. Packages (step 2) and integration (step 3)

Six packages, disjoint files. Each brief below is self-contained with the BASE.

### BASE (every package)

> Sipply iOS app — Expo SDK 57.0.27, React Native 0.86.3 (Fabric), expo-router ~57.0.25 typed routes, React Compiler on, Reanimated 4.5.1, expo-image, react-native-svg, zustand, Supabase. Repo `/Users/janmcqueeny/Projects/drinkdex-worktrees/polish`, branch `v3-3` (worktree). Its own node_modules — NEVER install anything; no new dependencies; no `expo start` / Metro / simulator / prebuild / xcodebuild; no git writes; **no new route files** (typed routes need Metro) — use pageSheet modals, `BottomSheet`, or existing routes.
>
> Read `specs/v4-changes.md` sections 1, 2 and your section, then the source specs it names, and Read the mockup PNGs listed in your brief and match them. The foundation (section 2.1 files) is read-only for you: use its API (2.2); if you need something it lacks, build it locally in your own files or list it in your report. Edit **only your files**; new files only inside your listed folders. Other packages are editing the rest of the app at the same time.
>
> Rules: no uppercase; squared keys/tiles (4pt), round only avatars/story rings/dots; WCAG AA (`node scripts/check-contrast.mjs`); `node scripts/check-design.mjs` clean; Dynamic Type (wrap, never truncate a name mid-word; names via DrinkName); VoiceOver labels on every control; motion only native/UI-thread with the resting state drawn, no Reanimated layout animations, no timed RN Animated; images in small frames keep `enforceEarlyResizing` + per-size `cacheKey`; photos `accessibilityIgnoresInvertColors`; keep every v3.3 behaviour; short WHY comments in the house style; delete dead brass/walnut/grain/tungsten/lining code and stand-ins in your files rather than leaving them; replace transitional `LiningBand`/`Mount`/`MountWindow`/`MOUNT`/`LoosePrint` uses in your files.
>
> Done when: `npx tsc --noEmit -p .` is clean for the whole project, `npx eslint <your files>` is clean (no warnings), check-design and check-contrast pass, and your section's acceptance checks hold (say in your report how you verified each, by reading code and numbers — there is no simulator).

### P1 · photos

Files: `scripts/lib/daylight.py` (new), `scripts/lib/tungsten.py` (delete), `scripts/build-drink-photos.mjs`, `assets/drinks/*.webp` (regenerate), `assets/drinks/proof/*.webp` (new), `assets/drinks/ghost/` (delete), `src/data/drinkPhotos.ts` (generated).

Brief: port `specs/v4-mockups/white/tools/daylight.py` (white spec 6.2–6.3) into `scripts/lib/daylight.py` as the bake the build script calls (the way it calls tungsten.py today: inputs from the script, lossless PNG out, metrics back). Add `--grade daylight` to `scripts/build-drink-photos.mjs` and make it the default; keep `--grade off` (QA of the masters as they are, writes nothing). Remove the tungsten grade, its theme reads (`colors.liningDeep`, `colors.ghostHi` no longer exist), the seam gate and the ghost; add the white spec 9 gates: fail if a wall pixel (chroma < 14) keeps any tint after the bake, or if a drink pixel's saturation changed; a hash of daylight.py printed into the generated header so mock and app stay in step. Regenerate `assets/drinks/<id>.webp` from the masters in `~/Desktop/CLINK DEX PHOTOS` (same 162 ids, same 1024px, same q82) and the **256px grey proofs** (q80, `out = 240 − (255 − Y) × 0.52`) into `assets/drinks/proof/<id>.webp`, replacing the ghost set in `assets/drinks/ghost/` (delete it). Regenerate `src/data/drinkPhotos.ts` with exactly this API: `photoFor(id)`, `proofFor(id)`, `PHOTO_COUNT` (own-key checks kept), header describing the daylight bake. Needs Python 3 + numpy + Pillow and `cwebp`/`dwebp`: all present on this Mac at step 1 (numpy 2.2.6, Pillow 12.2.0, /opt/homebrew/bin/cwebp); never install anything. Compare a QA sheet of `--grade off` vs `--grade daylight` (the Split graft) and report the wall measurements. Mockups: `specs/v4-mockups/white/img/*.webp`, `white/img/bw/*.webp`, `white/profile.png`, `white/home.png`.

### P2 · home

Files: `src/app/(tabs)/index.tsx`, `src/components/PostCard.tsx`, `src/components/LikersSheet.tsx`, `src/components/home/TodaysPours.tsx`, `src/components/home/NotInDexYet.tsx`, `src/components/home/groupPours.ts`, `src/app/post/[id].tsx`, `src/app/pours/[authorId].tsx`; new files under `src/components/home/`.

Brief: section 3. Mockups: `specs/v4-mockups/white-min/home.png`, `post-rest.png`, `post.png`; `layout/wire-home.png`, `wire-post.png`, `wire-post-rest.png`. Five whole story rings, seen = no ring, no + badge; the feed post is print + one name/author line + heart/count/save/•••; the post ••• as `ActionSheet` holding every old menu action; post detail at rest = 9; likers sheet ≤ 25 with Follow/Following keys and no handles/tags/plate. Remove the foundation stand-ins in these files (the wall-label stand-in in PostCard, TodaysPours' LABEL/BADGE constants).

### P3 · dex

Files: `src/app/(tabs)/dex.tsx`, `src/app/drink/[id].tsx`, `src/components/DrinkPanels.tsx`, `src/components/dex/LatestCatch.tsx`, `src/app/stats.tsx`, `src/components/CollectionStats.tsx`, `src/components/CelebrationOverlay.tsx`, `src/app/custom/[id].tsx`, `src/components/CustomDrinkTile.tsx`; new files under `src/components/dex/`.

Brief: section 4. Mockups: `specs/v4-mockups/white-min/dex.png`; `layout/wire-dex.png`; the drink page is unmocked (white spec "not mocked, same kit"). Dex at rest = 25: title + `TopBarCount` (→ /stats), the field with the `sliders` filter key (filter `BottomSheet` with counted Chips), the 2-column grid of `DexCard`, typing a number jumps and outlines the tile for 1s, the `NumberRail` strictly scroll-only. `/stats` becomes Dex progress (`DexPanel`, latest catch, "See your 38", breakdown). Drink page per section 4 (it now carries the Nº, state, category, glass, origin, friends). The catch crossfade via `DrinkFace transition`. Remove the dex.tsx stand-ins (the plain `Shelf` spacer, `SHELF_*`).

### P4 · my bar

Files: `src/app/(tabs)/bar.tsx`, `src/components/bar/**` (BarPicker, Counter, PourTonightSheet, controls, faces, model — retire what the new model does not use; new files here), `src/lib/bar.ts`, `src/store/bar.ts`, `scripts/build-bar-index.mjs`, `src/data/barIndex.json` (regenerated by the script).

Brief: section 6 whole, plus `specs/v4-mockups/mybar/shelves/spec.md` and `specs/v4-mockups/mybar/judging.json` (grafts). Mockups: `specs/v4-mockups/mybar/shelves/{stocked,empty,basics,picker,search,ingredient,removed,next,make}.png` (where this spec differs — the fixed ink payoff key with "+5/−5", the add field on the screen, pre-ticked basics, Undo in place, Add on the next line, Make list familiar-first, no Toast, no top-bar search glyph — this spec wins). Run `node scripts/build-bar-index.mjs` to regenerate barIndex.json. Verify the 12-item test bar numbers (31; −lime 26; +dry vermouth 41) against the new index, e.g. with `specs/v4-mockups/mybar/shelves/tools/match.py` (the matchBar port with the family fix) pointed at the regenerated JSON, or a scratchpad node script; put any such script in the scratchpad, not the repo. The Make list, pickers and sheets are modals (no new routes).

### P5 · profile and people

Files: `src/app/(tabs)/profile.tsx`, `src/app/user/[id].tsx`, `src/app/edit-profile.tsx`, `src/app/connections/[id].tsx`, `src/app/settings.tsx`, `src/app/saved.tsx`, `src/app/blocked.tsx`, `src/app/find-friends.tsx`, `src/components/profile/**`, `src/components/PeerProfile.tsx`, `src/components/PeopleList.tsx`, `src/components/FindFriends.tsx`, `src/components/FacebookFriends.tsx`, `src/components/InstagramImport.tsx`, `src/components/WelcomeConnect.tsx`; new files under `src/components/profile/`.

Brief: section 5. Mockups: `specs/v4-mockups/white-min/profile.png`; `layout/wire-profile.png`. Profile at rest = 31: username title + ••• (`ActionSheet`: Share profile, Settings, Tournaments when supported with pending count, About), avatar + name + one-line bio, counts on one line, one key (Edit profile / Follow), "38 drinks in your Dex ›" → `/stats`, 3-column grid with 8 gaps and no plates, no tab strip. Edit profile's accent picker: the four tones by name. Settings keeps account deletion + Apple revoke unchanged. Restyle connections, saved, blocked, find friends, Facebook/Instagram import in the kit.

### P6 · the + window, auth and the rest

Files: `src/app/log.tsx`, `src/app/add-drink.tsx`, `src/app/activity.tsx`, `src/app/tournaments/**`, `src/components/tournaments/**`, `src/components/auth/**`, `src/components/AuthGate.tsx`, `src/components/PasswordResetOverlay.tsx`, `src/components/SipplyIntro.tsx`, `src/components/VideoIntro.tsx`, `src/components/MusicPicker.tsx`, `src/components/songs.tsx`, `src/app/(tabs)/reels.tsx`, `src/app/reel/[id].tsx`, `src/app/record.tsx`, `src/components/reels/**`; new files under `src/components/log/` (new folder).

Brief: section 7. Mockups: `specs/v4-mockups/white-min/plus.png`, `plus-compose.png`; `layout/wire-plus.png`; white spec 5.17 for compose details. + window find mode ≤ 18 (X + field in one row, thumbs + Playfair names, "Add “neg” as a new drink" last), compose ≤ 7 (chosen name as the bar title, photo, caption, Post, "Save to Dex only"). Keep results above the keyboard and every v3.3 log behaviour. Sign-in: white page, wordmark, providers unchanged, CabinetBackdrop flattened (no lining/mounts). Activity and tournaments in the kit (tournaments are reached from Profile's ••• and from Activity's invitations; keep `tournamentsHref`). Reels flagged off: keep compiling on `reelGround`.

### Step 3 · integration (after all packages)

1. `npx tsc --noEmit -p .`, `npx eslint src scripts`, `node scripts/check-design.mjs`, `node scripts/check-contrast.mjs`.
2. Delete transitional exports with no importer: `LiningBand`, `Mount`, `MountWindow`, `MOUNT`, `LoosePrint` (cabinet.tsx), `VerticalFade`/`svgStop` if ReelCell no longer needs them, `DexStatusTag`/`dexStatusTagWidth` if unused; any foundation export no package used (`grep -rn` each).
3. Apply the packages' foundation requests.
4. Grep for stale words in code and comments: `lining`, `brass`, `walnut`, `grain`, `tungsten`, `wine`, `cream`, `bone`, `cellar`, `mat` (as a material), and fix comments that now lie.
5. Element counts per screen against sections 3–7, read from the code.

## 9. Open

- The app icon and the intro film (`assets/video/intro.mp4`) are still the wine ones; a black-on-white icon would match. Not in this pass.
- Avatar accents: signup offers the four tones; whether to offer a choice at all is Jan's call.
- The Android adaptive icon background is still #F8EBDE (icon pass).
