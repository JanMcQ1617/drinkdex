# v3.3 detail layer, direction "Menu": menu card and print

Written 7 Oct 2026 against build 17 and the v3.1 structure now being built (`specs/v3-cabinet.md`, `specs/v3.1-changes.md`, `src/constants/theme.ts`). Mockups: `index.html` in this folder (five 440 x 956 frames plus a specimen row), rendered to `contact.png`, `home.png`, `dex.png`, `bar.png`, `post.png`, `profile.png`. Every photo is a real catalogue photo from `assets/drinks/` (the not-yet cards use the real ghost bakes in `assets/drinks/ghost/`). Every name and Nº comes from `src/data/drinks.json`. The My Bar counts (490 ingredients, 33 makeable, Dry vermouth +10) come from running the matcher on `src/data/barIndex.json`.

Native modules added: **none**. Packages: **none**. Everything is plain Views, `react-native-svg` and `expo-image`. No new motion. No blur, no runtime image filters.

---

## 0. The idea, and what it answers

Jan, 7 Oct: "the app is too simple, it's either burgundy or cream, add some details into each page". He also likes the scrolled screens except for the top gradient.

What this direction does: Sipply keeps Cabinet's materials (bone paper, wine lining), but the screens now look **printed** in the way a good cocktail menu and the paper around a bar are printed:

- **Two inks.** Wine stays the first ink: headings' ornaments, rules, the one wine action. A second ink, **bottle green**, marks everything that is *yours*: Nº numerals, the "In your Dex" stamp, ticked ingredients, progress meters, counts you earned. In practice that means a reader can tell "mine" from "the catalogue's" by colour alone, and the brand stays wine.
- **Three paper stocks** where the app had one cream: the page (`bg`), bone card (`mat`) for tickets and cards, and a warmer **buff** for stubs and tickets. The wine lining shows up as **printed objects** (a menu card, a member card) and not only as a band, so wine and cream interleave down every page.
- **Bar ephemera as structure.** A post is a **ticket** with a perforated tear line. The Dex is a **numbered catalogue** (stamped colour plates for drinks you have, one-ink proofs for the rest). My Bar is an **order pad** plus a **menu**. The likers are a numbered **guest list**. The profile counts sit on a **ticket strip**, and the Dex progress sits on a **member card**.
- **Micro-typography from print**: Nº numerals, the Oxford rule, a leaf fleuron, the manicule (printer's pointing hand), dotted leaders, footnote daggers, tracked lowercase labels.

**No gradient anywhere at the top of a screen** (§5).

Same product: tab order, Instagram structure on Home and Profile, the v3.1 stories rail, the floating tab bar, Playfair only for the wordmark and drink names, Inter for everything else, squared 1pt-bordered buttons, no uppercase, no rarity.

---

## 1. The five frames

| Frame | Ground | Signature details |
|---|---|---|
| 1 Home (at rest) | Wine masthead band, then paper | Wordmark flanked by Oxford rules and green lozenges; a dateline ("Tuesday, 7 October · 6 friends posted today"); a blind-stamped lattice in the band; a **deckled edge** where the band meets paper (replacing the 12pt shade). The post is a **ticket**: author row, photo tipped in with a plate mark, a perforated tear line carrying the serial "Nº 0127", then a buff stub with the name, the "In your Dex / since 12 Sep" stamp, actions, "Liked by maya.pours and 12 others", the caption, and a footnote (†) with the drink's Dex facts |
| 2 Dex | Paper | A buff **catalogue card** (wine red line, punched hole, hero figure 38, a **printed scale** of all 2,089 numbers); search; squared filters; a **running folio** ("Nº 0001 – 0009 · 4 of these 9 in your Dex") over an Oxford rule. **One grid in Nº order**: caught = bone card with a green inner frame, colour photo, solid stamp; not yet = a dashed "unprinted" outline with the ghost (one-ink) photo. Every card carries its Nº and a **glass mark** at the top, so a row half under the tab bar still says what it is |
| 3 My Bar | Paper | The checklist is an **order pad**: bone sheet, double wine **ledger margin**, ruled cells, squared checkboxes (ticked = green fill + bone tick), the drink count for each ingredient in tabular figures, footnoted ("* in how many drinks"). "You can make" is a **wine menu card**: fleuron head, Oxford rule, menu lines with **dotted leaders** to the Nº, ingredients as the menu description. "One ingredient away" is a buff **ticket** with a perforated stub ("+10 drinks"), a manicule, and one outline button |
| 4 Post, likers open | Paper post under a flat dim; paper sheet | The sheet title is "Liked by" (Jan's words). Under the squared grabber is a perforated **tear-off** line; under the subtitle ("Negroni by ines.ag · 13 people") is an Oxford rule; the likers are a **numbered guest list** (01 to 13 in green tabular figures), with avatar, username, name, Follow / Following |
| 5 Profile | Paper | A 1pt green ring around the avatar; counts on a buff **ticket strip** with vertical perforations and notches; the Dex as a wine **member card** (lattice, the figure in green, the scale in bone, a perforated stub with your latest drink); the posts grid carries **Nº plates** (on the existing `onMedia` marker) |

---

## 2. Palette

### 2.1 New tokens (`colors`, additions only, no existing hex changes)

```ts
/* ---- v3.3 Menu: the second ink and two paper stocks ---- */
/** The second ink. Nº numerals, the "In your Dex" stamp, ticks, meters, earned counts.
 *  9.02 paper, 9.48 mat, 8.28 buff, 8.34 bottleWash; 8.45 on paper's worst grain pixel. Never on lining (1.66). */
bottle: '#24493A',
/** The second ink on the lining and the cellar. 9.64 lining, 10.47 cellar, 8.18 worst grain, 7.06 on a lattice stroke.
 *  Never on paper (1.56) and never over media (3.19 on scrimMid over white). */
bottleLit: '#A9CDB8',
/** Ticket stock: post stubs, the one-away ticket, the profile counts strip, the Dex catalogue card. */
buff: '#F2E8D6',
/** Green plate: a selected Dex filter (and the ticked state if a row ever needs a fill). */
bottleWash: '#E4ECE5',
/** Decorative rules, no text: the caught card's inner frame. */
bottleRule: '#6F8F7E',
/** Decorative rules, no text: the ledger margin, the catalogue card's red line, the fleuron's side rules (= wineSoft). */
wineRule: '#A85A63',
```

`onMedia` gains `plaque.stamp: { fill: colors.bottle, edge: colors.bottle, ink: colors.mat }`. That is the solid stamp wherever it touches a photo. It is an opaque plate, so its ink is measured against its own fill (9.48), the same way `plaque.neutral` already works. No tinted ink ever sits on media.

### 2.2 Contrast (WCAG 2.x, measured)

"Worst grain" uses `grain` from theme.ts. For light stocks it is the darkest tile pixel at paper opacity 0.35. For lining it is the brightest pixel at 0.77. "Lattice stroke" is the lattice's 6% bone line composited over the lining, then the worst grain over that.

| Ink | Ground | Flat | Worst grain | Target |
|---|---|---|---|---|
| bottle #24493A | paper #F7F2EA | 9.02 | 8.45 | 4.5 |
| bottle | mat #FBF8F2 | 9.48 | 8.84 | 4.5 |
| bottle | buff #F2E8D6 | 8.28 | 7.76 | 4.5 |
| bottle | bottleWash #E4ECE5 | 8.34 | 7.82 | 4.5 |
| mat (solid stamp, tick) | bottle | 9.48 | n/a | 4.5 |
| text #2B2322 | buff | 12.65 | 11.87 | 4.5 |
| textMuted #6A6058 | buff | 5.05 | 4.73 | 4.5 |
| wine #5B0F1A | buff | 11.31 | 10.61 | 4.5 |
| text | bottleWash | 12.76 | 11.96 | 4.5 |
| textMuted | bottleWash | 5.09 | 4.77 | 4.5 |
| textMuted | mat | 5.78 | 5.39 | 4.5 |
| wine | mat | 12.96 | 12.09 | 4.5 |
| bottleLit #A9CDB8 | lining #3E0A12 | 9.64 | 8.18 | 4.5 |
| bottleLit | cellar #2F070D | 10.47 | 8.89 | 4.5 |
| bottleLit | lining + lattice stroke | 8.55 | 7.06 | 4.5 |
| onLining #E9E5DF | lining + lattice stroke | 11.81 | 9.75 | 4.5 |
| onLiningMuted #B8A09B | lining + lattice stroke | 6.03 | 4.98 | 4.5 |
| storyRing #BC6B75 (UI cue) | lining + lattice stroke | 3.88 | 3.20 | 3.0 |
| lineControl #8A7F74 (checkbox, dashed slot edge) | mat / paper | 3.69 / 3.51 | n/a | 3.0 |
| lineControl (outline button edge) | buff | 3.22 | n/a | 3.0 |
| reelInk on markerFill 0.78 over white (grid Nº plate) | | 9.98 | n/a | 4.5 |
| textOnWine on wine (+ button) | | 10.95 | n/a | 4.5 |
| bottleRule / wineRule / taupe holes | mat | 3.35 / 4.60 / 1.77 | n/a | decorative only |

**Never** (check-contrast should assert each fails): bottle on lining 1.66; bottleLit on paper 1.56; wine on lining 1.22 (unchanged rule); bottleLit over media 3.19.

Existing pair this work surfaced, not introduced by it: the `#8A5F10` amber signup accent with bone initials is 4.49:1. The mockup does not use it. G should either drop the accent or raise its initials to ≥ 18pt.

### 2.3 How the inks are split (the rule builders follow)

- **Espresso** (`text`): reading text. **Wine**: ornaments, rules, section-head labels, the one filled action, links on paper. **Bottle**: anything that is the viewer's own state or number (Nº, stamp, ticks, earned counts, meter fill). On lining, the bottle job goes to **bottleLit**, and wine never appears as ink there.
- Green is **ink, never a ground**. The only green fills are the solid stamp, a ticked checkbox, the meter fill, and the `bottleWash` selected chip. That is what keeps wine plus green reading as a two-ink menu and not as a seasonal palette.

---

## 3. Typography and micro-typography

| Detail | Where | RN |
|---|---|---|
| **Nº numerals.** "Nº 0127" replaces "#0127" | Every dex number: ticket serial, Dex cards, folio, menu lines, member card, grid plates | `dexNumber` unchanged (Inter Medium 11/14, 1.5 tracking, tabular). The glyph is `N` + U+00BA (º), present in the Inter latin subset (checked with fontTools). Colour → `bottle` on light stocks, `bottleLit` on lining, `onMedia.ink` on plates. VoiceOver keeps "number 127" |
| **Tracked lowercase label** ("small caps" by spacing, never by case) | Home dateline, "Most useful first*", "The catalogue", "Member of the Dex" | New role `textRole.printLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16, letterSpacing: 1 }` with `// tracking-ok: a printed label set in sentence case; words, never capitals`. This is the second tracking exception after `dexNumber`, so check-design rule 8 needs it named. It is limited to 12pt labels of 2 to 6 words |
| **Hero figures in the second ink** | Dex "38", member card "38", "+10", "33" | `heroFigure` / `count` (Inter SemiBold tabular), colour `bottle` / `bottleLit` |
| **Footnote marks** | † after the drink name on a ticket; * on "Most useful first" | Inter (the dagger and asterisk are in the latin subset). The mark is its own `<Text>` at 11pt, `wine`, raised by `lineHeight`/`top` offset (RN has no `vertical-align`); the footnote is `helper` 12/17 `textMuted` under a 28 x 1pt `lineControl` rule |
| **Ingredients as menu description** | My Bar menu lines | `rowSubtitle` 13/18, sentence case built from the recipe (`Gin, lemon juice, sugar, soda water`) |
| **Drink names** | Ticket stub (`nameplate` 30/36 set on paper now), Dex cards (`printName`-size 15/18 SemiBold), menu lines (`rowName`), sheet subtitle and stubs (`nameInline`) | All through `DrinkName` with their measures (§6 below lists the two that change) |

Playfair stays only in the wordmark and drink names.

---

## 4. Every detail: where it appears, how it is drawn, what it costs

Cost key: **views** = extra native views per instance; **img** = extra decoded images; **svg** = react-native-svg nodes. All of it is static, with no animation and nothing redrawn on scroll unless the list recycles the cell.

| # | Detail | Where | How it is drawn in RN | Cost |
|---|---|---|---|---|
| 1 | **Oxford rule** (2pt rule, 2pt gap, 1pt rule) | Masthead (short, flanking the wordmark), Dex folio, My Bar menu card, likers sheet | `<OxfordRule color>`: one View, `borderTopWidth: 2`, `borderBottomWidth: 1`, height 5. On lining: `rgba(233,229,223,.34)` | 1 view |
| 2 | **Leaf fleuron** (two citrus leaves around a lozenge, midribs knocked out) | My Bar head; menu card head | `<Fleuron ink ground />`: one `<Svg>` 34 x 12, three filled `Path`s plus one 0.7pt `Path` in the ground colour. Side rules are 1pt Views in `wineRule` / `liningLine` | 1 svg (4 paths) + 2 views |
| 3 | **Lozenges** | Masthead, either side of the rules | 5 x 5 View, `bottleLit`, `transform: [{ rotate: '45deg' }]` | 2 views |
| 4 | **Blind-stamped lattice** (an 18pt diaper of lozenges at 6% bone) | Home band, scrolled Home bar, My Bar menu card, Profile member card | **Recommended:** bake a 54 x 54 @3x PNG tile (`assets/images/lattice.png`) and tile it with the same hand-tiling `Grain.tsx` uses (f2245f2), under content and over grain. Alternative: `<Svg><Defs><Pattern>` + one `<Rect fill="url(#lat)">`, but do not use it inside FlatList cells | PNG route: 1 tiny texture (shared, ~1 KB), N tile views like Grain. SVG route: 1 svg per surface |
| 5 | **Deckled edge** where lining meets paper | Foot of the Home band (replaces `LiningBand`'s 1pt lip and 12pt `shade` gradient); foot of the scrolled Home bar | `<Deckle width color seed />`: one `<Svg>` height 8 with one filled `Path`. The path is built once per width (`useMemo`) from a seeded random walk (2.5pt steps, ±0.75 jitter, pulled back to the centre line), so it never changes between renders. Same code as `deckle()` in index.html | 1 svg, ~180 path segments, built once |
| 6 | **Ticket post card** | Home feed, post page (`PostCard`) | A `mat` card (1pt `line`, radius 4, `overflow: 'hidden'`). **Plate mark**: the photo sits in a View with a 1pt `line` border and 3pt `mat` padding. **Perforation row** (24pt): an `<Svg>` `Line` with `strokeDasharray={[0, 6]}`, `strokeLinecap="round"`, `strokeWidth={2}`, `taupe`; two **notches** (14pt Views, `radius.round`, `bg` fill, 1pt `line` border) centred on the card's left and right edges, so the card's overflow clip leaves exact half-circles (`round-ok: perforation`); the **serial** (`Nº 0127`) on a `mat` View centred over the dashes. **Stub** below: `buff` background with paper grain | +6 views, 1 svg per post |
| 7 | **Rubber stamp, outline** ("In your Dex / since 12 Sep"; wine variant "New to you") | Ticket stub; any stamp on paper | View with a 1.5pt `bottle` border, radius 3; an inner absolute View inset 2pt with a 0.75pt border (the double rule); 1 or 2 `Text`s (`statusWord` 12/14 SemiBold; the date at 11/13, tabular); `transform: [{ rotate: '-6deg' }]`. **Wear**: an `expo-image` of `assets/images/stamp-wear.png` (128px speckle tile, in this folder as `img/wear.png`) absolutely filling the stamp with `tintColor` = the ground colour (`mat` / `buff`) at opacity 0.6, so specks of paper break the ink. `accessibilityLabel` carries the words | 4 views + 1 img (one shared 128px texture, decoded once) |
| 8 | **Rubber stamp, solid** | Caught Dex cards, over the photo's lower right | Same shape, filled `onMedia.plaque.stamp.fill`, mat ink, mat inner rule; wear tinted `bottleLit` at 0.32 (uneven ink, not holes). Opaque, so no media pixel sits under its text | same as 7 |
| 9 | **One-ink proofs** | Not-yet Dex cards | The existing ghost bakes (`assets/drinks/ghost/*.webp`, 256px, `colors.ghostHi`). No new pipeline. Unphotographed drinks keep their locked `DrinkFace` deboss | **Lower** memory than today if the not-yet card used to load the 1024 lit photo |
| 10 | **Printed card vs unprinted slot** | Dex grid | Caught: `mat` fill, 1pt `line`, plus an absolute inner View inset 3pt, 1pt `bottleRule` at 0.55 opacity, radius 2. Not yet: no fill, 1pt **dashed** `lineControl` border (`borderStyle: 'dashed'`, uniform on all four sides, which iOS supports), name in `textMuted` | +1 view (caught) |
| 11 | **Glass marks** (highball, rocks, coupe, martini, wine, flute, mug) | Dex card top-right; available for footnotes | 7 new `icons.tsx` glyphs on a 14 x 16 grid, 1.2 stroke (paths in index.html `GL`). `glassOf(glassware)` maps the catalogue string. `textFaint` (3.69 on mat; a glyph, 3:1) | 1 svg (1 to 3 paths) per card |
| 12 | **Catalogue card** | Dex header | `buff` card, 1pt `line`, radius 4; header row (`printLabel` "The catalogue", `Nº 0001 – 2089`) in wine; a full-bleed 1pt `wineRule` line under it; the hero figure in `bottle`; the printed scale (13); a **punched hole**: a 10pt `bg` disc with a 1pt `line` edge, half off the card's bottom edge (`round-ok: dot`) | ~8 views + 1 svg |
| 13 | **Printed scale** (a tick per 100, a long tick per 500, labels 0 / 500 / 1,000 / 1,500 / 2,089, the caught share filled in the second ink, plus a 1.5pt pointer) | Dex catalogue card; Profile member card (labels 0 / 1,000 / 2,089, bone ticks, bottleLit fill) | `<PrintedScale have total tone>`: one `<Svg>`, 1 baseline `Path`, ~22 tick `Path`s, 1 `Rect`, 3 to 5 `SvgText` labels (Inter, `fontVariant` tabular is not available in SvgText, so labels are RN `Text` positioned absolutely if the font must match exactly) | 1 svg (~27 nodes), built once per value |
| 14 | **Running folio** ("Nº 0001 – 0009 · 4 of these 9 in your Dex") | Under the Dex filters, above an Oxford rule | Plain Text. The range comes from the FlatList's `onViewableItemsChanged` (already a cheap callback; set `viewabilityConfig.itemVisiblePercentThreshold: 50`). It updates on settle, not per frame | 2 text views, a state update per settle |
| 15 | **Order pad** | My Bar checklist | `mat` sheet, 1pt `line`, radius 4. **Ledger margin**: one absolute View 4pt wide with 1pt `wineRule` left and right borders, at 0.8 opacity, full height. Cells: a 2-column grid of rows with `stroke.hair` rules (FlatList `numColumns={2}` or a mapped View grid; the list is short and filtered by search). **Checkbox**: 20 x 20 View, radius 3, 1pt `lineControl`; ticked = `bottle` fill + `check` glyph in `mat`. Count right-aligned, `labelCaption` tabular, `bottle` when ticked. Header `printLabel` "Most useful first*" + "12 ticked"; footer footnote + "Show all 490" link | ~4 views per row |
| 16 | **Menu card** ("You can make") | My Bar | A `lining` card with `Grain tone="lining"` + lattice (4), 1pt `liningLine` edge, radius 4. Fleuron head in `bottleLit`; "You can make" `shelfTitle` + count in `bottleLit`; Oxford rule in bone 34%. **Menu lines**: 46pt thumbnail in a 1pt `printEdge` frame (`expo-image`, `enforceEarlyResizing`, `cachePolicy="disk"`), `DrinkName` `rowName` in `onLining`, a **dotted leader** (`<Svg width="100%" height={2}><Line x2="100%" strokeDasharray={[0, 4.5]} strokeLinecap="round" strokeWidth={1.8} /></Svg>`, flex 1, aligned to the name's baseline), `Nº` in `bottleLit`; ingredients `onLiningMuted`. "See all 33" in `onLining` (never wine on lining) | per line: ~6 views + 1 svg + 1 img (46pt) |
| 17 | **One-away ticket** | My Bar, under the menu | `buff` card; left stub (76pt) with "+10" `count` in `bottle` and "drinks"; a **vertical perforation** (Svg `Line` dashed + two notches top and bottom, as in 6); body: manicule + "One ingredient away", "Opens Martini, Clarito, Bronx and 7 more." (names via `nameInline`), `Button variant="secondary" size="sm"` "Add dry vermouth" | ~10 views + 2 svg |
| 18 | **Manicule** | One-away ticket; available as the "tip" mark anywhere | New `icons.tsx` glyph `manicule`, 30 x 16 grid, 1.25 stroke plus a filled cuff (path in index.html) | 1 svg |
| 19 | **Masthead and dateline** | Home band | The wordmark (`wordmark` 28/34) flanked by 34pt Oxford rules and lozenges (1, 3). Dateline: `printLabel` in `onLiningMuted`, the friend count in `bottleLit`. The count is the number of story groups `TodaysPours` already holds; the date is the device's. Adds 20pt to the band | ~8 views |
| 20 | **Guest list** | Likers sheet | Index "01".."13" (`printLabel` digits, `bottle`, tabular, 22pt column), `Avatar` 40, username `username`, display name `rowSubtitle`, `Button secondary sm` Follow / Following (Following uses the quiet edge). Subtitle row `nameInline` drink + "by ines.ag" left, "13 people" right; Oxford rule under it | +1 text per row |
| 21 | **Tear-off sheet top** | Likers sheet (and every sheet that adopts it) | Grabber becomes a 36 x 4 rectangle, radius 1 (no pill); 12pt below it, a full-width dashed Svg `Line` in `taupe` | 1 svg |
| 22 | **Counts ticket** | Profile header | `buff` strip beside the avatar (66pt tall, flex 1), three cells divided by vertical perforations (dashed Line + top and bottom notches, as 17) | ~12 views + 2 svg |
| 23 | **Member card** | Profile, under the actions | `lining` card + grain + lattice; `printLabel` "Member of the Dex" in `bottleLit`; "38" `heroFigure` in `bottleLit`, "of 2,089 · 1.8%" `onLiningMuted`; the printed scale (13) in bone; a perforated **stub** on the right with "Latest", a 44pt thumbnail in a print frame, `DrinkName` `miniName`, Nº | ~14 views + 2 svg + 1 img |
| 24 | **Avatar ring** | Profile | The existing `Avatar ring`, drawn 1pt `bottle` at 4pt outside the disc | 0 new (prop) |
| 25 | **Grid Nº plates** | Profile posts grid | `MediaNumberPlate` (already exists in media.tsx) with the Nº glyph; `onMedia.markerFill` + `markerEdge` + `ink` | 0 new |
| 26 | **Tab bar keyline** | FloatingTabBar | One absolute View inset 3pt, radius 9, 1pt `rgba(255,253,249,0.07)`, inside the slab (it scales with the slab when the bar compacts) | 1 view |
| 27 | **Footnote** | Ticket stub; My Bar pad | `fnrule` (28 x 1 View, `lineControl`) + `helper` text. Content is Dex data only (`styleLabel(subcategory)`, glass, origin, abv), so it is true for every post | 2 views |

### 4.1 What the frames cost, screen by screen

| Screen | Added views (visible) | Added images | Added svg | Notes |
|---|---|---|---|---|
| Home | ~40 (masthead, deckle, ticket furniture on 2 visible posts) | wear tile (shared) | 3 to 4 | Lattice as a PNG tile is the cheapest; the deckle path is built once |
| Dex | ~45 (12 visible cards x ~3, header) | wear tile; **not-yet cards switch to 256px ghosts** | 13 (glass marks + scale) | Memory goes down if any not-yet card used the lit photo |
| My Bar | ~70 (8 to 10 cells, 2 menu lines, ticket) | 2 x 46pt thumbs | 5 | The list is short; nothing virtualised changes |
| Likers sheet | ~10 | none | 1 | |
| Profile | ~30 | 1 x 44pt thumb | 3 | |

All of it is a few dozen static native views per screen, against the 256 MB image cap and the existing grain tiling. There is no animation, nothing per frame, and no blur or shadow beyond the existing `elevation` tokens (the stamp, the ticket and the cards cast **no** shadow; they are paper on paper).

---

## 5. The top gradient, removed (Jan's one complaint about the scrolled look)

Deleted, with what replaces each:

| Was (v3 / v3.1) | Now |
|---|---|
| Home floating bar ground `VerticalFade homeBarTop → homeBarFoot` (94% → 72%) | A **solid** `lining` slab with grain and lattice. `fadeIn` still drives its opacity from 0 at rest to 1 by 24pt of scroll, so at rest it is the band itself |
| Bar tail `homeBarTail` (24pt fade below the bar) | The **deckled edge** (5), 8pt, solid, riding with the bar's `translateY` |
| Status strip tail `homeStripTail` (16pt fade) | Nothing: the strip stays solid lining, and when the bar is hidden the strip's own foot is a deckle |
| `LiningBand` 12pt `shade` gradient under the band at rest | The deckle |
| Feed nameplate scrim (two gradients over the photo's foot) | **Gone from the feed**: the name now prints on the stub below the photo, so the feed has no scrim at all. The drink page's photo dissolve is not a top gradient and is untouched |

Tokens `homeBarTop`, `homeBarFoot`, `homeBarTail`, `homeStripTail` become `@deprecated` and are deleted at the close-out. The `homeBarFoot` AA guarantee (onLining over a white photo through 72%) is no longer needed, because the slab is opaque: onLining on lining is 13.32.

---

## 6. Structural choices this direction makes (Jan decides)

1. **The feed photo is square inside the ticket** (`layout.feedPhotoAspect` 4:5 → 1:1 for the plate; the post page shows the same plate). That is the only way the name, the stamp, the likes line and the start of the caption all land on the first screen under the stories (frame 1). If Jan keeps 4:5, the ticket still works and the stub simply starts below the fold.
2. **The drink name leaves the photo.** It prints on the stub (`nameplate` 30/36 on buff, measure = card width − 28 − stamp width ≈ 250pt at 440). The photo is cleaner and has no scrim; it is less "poster". `DrinkName` still fits long words.
3. **The Dex is three columns**, which reads as a numbered list and shows nine numbers above the fold instead of four to six. The name role is 15/18 Playfair SemiBold with measure = card width − 14 (≈ 115pt at 440, ≈ 97pt at 375). "Holunderbeergeist" shrinks through `DrinkName`, as v3 §6.4 already handles. If Jan prefers two columns, every detail here transfers unchanged.
4. **Bottle green is a new brand ink.** It is used as ink only (§2.3). A small, reversible step: one token.
5. **A second tracked label** (`printLabel`, 1pt) beside `dexNumber`'s tracking. It is sentence case, so no capitals are ever spaced, but it is a deliberate exception to check-design rule 8.

---

## 7. Build notes (who touches what)

- `src/constants/theme.ts`: §2.1 tokens, `onMedia.plaque.stamp`, `textRole.printLabel`, deprecations in §5.
- `src/components/print.tsx` (new): `OxfordRule`, `Fleuron`, `Lozenge`, `Deckle`, `Perforation` (horizontal / vertical, with notches and optional serial), `Stamp` (outline / solid, ink, lines), `Leader`, `PrintedScale`, `Lattice` (PNG tiling), `Footnote`. Pure presentational components, no state.
- `src/components/icons.tsx`: `manicule` and the seven glass marks, plus `glassOf()` in `src/lib/drinkLabels.ts`.
- `PostCard.tsx`: ticket layout (6, 7, 27); `Nameplate` leaves the feed.
- `home/HomeChrome.tsx` and the band: masthead, dateline, lattice, deckle; §5 deletions.
- `DexCard.tsx` and the Dex header: 8, 9, 10, 11, 12, 13, 14.
- `(tabs)/bar.tsx`: 15, 16, 17.
- The likers sheet (new with "who liked this"): 20, 21.
- `ProfileHeader.tsx` / `ProfileView.tsx`: 22, 23, 24, 25.
- `FloatingTabBar.tsx`: 26.
- `scripts/check-contrast.mjs`: every row of §2.2 plus the four "never" pairs. `scripts/check-design.mjs`: `round-ok: perforation` (notches ≤ 14pt) and `round-ok: dot` (the punched hole); rule 8 names `printLabel`; rule 12 unchanged (the new pieces cast no shadow).

---

## 8. Risks and open checks

- **"since 12 Sep" needs the first-collected date** on the viewer's collection record for that drink. v3's drink page already prints "First poured 12 Sep", so the field should exist; verify before building. Without it, the stamp is one line, "In your Dex".
- **Stamp wear vs legibility**: the speckle tile removes roughly 10% of the ink at 0.6 opacity. The words stay readable at 11 to 12pt in the renders, the state is always in `accessibilityLabel`, and on Dex cards the printed-vs-dashed card already carries the state without the stamp.
- **Dashed borders** on iOS draw the system's own dash rhythm, not the mock's. If it reads too busy, use an Svg `Rect` with `strokeDasharray={[4, 3]}` instead (+1 svg per not-yet card).
- **Tabular figures inside `SvgText`** are not guaranteed (react-native-svg's text does not take RN's `fontVariant`; I did not verify whether its `fontFeatureSettings` reaches the custom Inter on iOS). Use absolutely positioned RN `Text` for the scale labels if the figures must align.
- **The scale at 1.8%** looks nearly empty for a new member. It is honest, and the pointer and the figure carry it. An alternative is a per-hundred scale ("Nº 0001 – 0100: 6"), which is a product call.
- **Square feed plate** (§6.1) and **name off the photo** (§6.2) are the two changes Jan is most likely to push back on. Both are independent of the rest of the layer.
- **Two-ink discipline** is the whole look. If green starts filling grounds or buttons, wine plus green reads as a holiday card. Keep §2.3 in review.
- Not rendered on a device: the RN drawing notes are from the APIs as documented (react-native-svg `Pattern`, `strokeDasharray`; expo-image `tintColor`; RN uniform dashed borders). Jan's Release-build pass is where the deckle path, the stamp rotation and the lattice tiling get eyeballed.
