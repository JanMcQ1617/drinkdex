# v4 · "Night" (slug `black`): black-led monochrome

Direction mock, 9 Oct 2026, for Jan's note: "so i want to remake the whole colorscheme of the app to black and white can you do that an make everthign look sleek and good looking".

Files in this folder:

- `index.html`: six screens side by side at 440 × 956. `index.html#home`, `#dex`, `#bar`, `#post`, `#profile`, `#log` show one screen alone.
- `contact.png`: all six screens on one wall (2900 × 1196).
- `home.png`, `dex.png`, `bar.png`, `post.png`, `profile.png`, `log.png`: one per screen, 880 × 1912 (2x).
- `img/*.webp`, `img/ghost/*.webp`: 32 photographs and their ghosts, **re-baked** for this direction with the app's own `scripts/lib/tungsten.py` (§5). These are mock copies; `assets/drinks` is untouched.
- `fonts/JetBrainsMonoLatin_400Regular.ttf`, `_500Medium.ttf`: the one new family, as static Latin subsets (§3).

Base: `specs/v3-cabinet.md`, `specs/v3.3-changes.md`, `specs/v3-3-mockups/brass/spec.md`, `src/constants/theme.ts`. The structure is v3.3 exactly: floating tab bar (Home · Dex · + · My Bar · Profile) that swipes between tabs, one number-ordered Dex grid, My Bar as a checklist then "You can make" then "One ingredient away", likers sheet, full-screen + window with the search pinned above the keyboard. Only the look changes.

---

## 0. The idea in one line

**The bar at night.** Every ground is true black, every word is white or one of two greys, and the only colour on the screen is the drinks: each photograph is re-lit in a neutral pool of light that falls off to exactly `#000000`, so a drink glows out of the page with no frame around it. Depth is one step up a grey ramp, never a shadow. The one white object in each view is the thing to press.

| Jan | Here |
|---|---|
| "Remake the whole colour scheme to black and white" | Wine, merlot, bone, cream, brass, walnut, label stock, story pink, danger red and every category tint are deleted. The palette is 15 values: black, white, a 9-step grey ramp and 4 scrims (§1). |
| "Make everything look sleek and good looking" | Photos dissolve into the page (§5); one white action per view; type by role, with a catalogue face for the Dex's figures (§3); hairline instrument marks instead of hardware (§7); nothing ornamental is left. |

### Rules this keeps

- **No uppercase.** Sentence case everywhere; the kicker ("latest catch", "rank") is lowercase with 0.6pt tracking.
- **Squared buttons.** Buttons, chips, fields and the + are 6pt rectangles. Round is reserved for avatars, story rings, the + badge on "You" and dots.
- **WCAG AA on every text pair**, with the hex and ratio in §2.
- **No top gradients.** Bars are solid black with a 1pt hairline at the foot once content runs under them. The only gradient left is the nameplate scrim at the foot of a photograph, under its text.
- **React Native primitives only**: Views, `react-native-svg` (gauge, icons), `expo-image` (photos). No blur, no shadows anywhere (§4.4), no textures.

---

## 1. Palette

### 1.1 The Night tokens

| Token | Hex | Job | Text on it? |
|---|---|---|---|
| `night` | `#000000` | Every screen's ground. Bars. The colour every photograph settles to at its edges (the bake's `settle`). Text on white. | Ground |
| `surface` | `#0E0E0E` | Level 1: panels, list groups, fields on night, unticked checklist tiles, an empty photo window | Ground |
| `raised` | `#171717` | Level 2: the tab bar, sheets, ticked tiles, tonal buttons | Ground |
| `raisedHi` | `#222222` | Level 3: a field or avatar inside a sheet | Ground |
| `pressed` | `#2C2C2C` | Held state of anything on `raised` or `raisedHi` | Ground |
| `rule` | `#1F1F1F` | Hairlines on night: the bar's foot, list separators, panel edges, photo-window keylines. Decorative | Never |
| `edge` | `#2E2E2E` | 1pt edge of raised things: tab bar, sheet lip, chips, fields, tonal buttons, separators inside a sheet. Decorative | Never |
| `edgeStrong` | `#474747` | Outline Nº plate, outline tag, seen story ring, avatar ring, sheet grabber. Decorative | Never |
| `lineControl` | `#737373` | Unticked checkbox edge (1.5pt), outline-button edge: 3:1 on night through raisedHi | Never |
| `ink` | `#F5F5F5` | Titles and body text, glyphs | (text) |
| `inkMuted` | `#A3A3A3` | Secondary text: metadata, placeholders, counts, scale labels. Body-safe on every ground | (text) |
| `inkFaint` | `#7E7E7E` | Glyphs and large type anywhere; small text **only on night and surface** (the chip count, the clear glyph) | (text, limited) |
| `white` | `#FFFFFF` | Primary button, Nº plate (caught), ticked box, unseen story ring, active tab marker and TabStrip underline, gauge fill, focus edge, wordmark | Carries `night` text |
| `whitePressed` | `#D4D4D4` | Held primary button and held plate-sized controls | Carries `night` text |
| `tabDim` | `#8C8C8C` | Resting tab glyph + label on the `raised` bar | (text) |

Scrims and translucents (composited over the worst case, a white frame, in §2):

| Token | Value | Job |
|---|---|---|
| `scrimMid` | `rgba(0,0,0,.62)` | Shallowest stop text may sit on over a photo |
| `scrimDeep` | `rgba(0,0,0,.86)` | Foot of the nameplate scrim |
| `marker` | `rgba(0,0,0,.72)` | Fill of a marker over a photo ("In your Dex", gallery count, duration) |
| `markerEdge` | `rgba(255,255,255,.28)` | 1pt edge of that marker |
| `overlay` | `rgba(0,0,0,.48)` | What lies under a sheet or dialog |

Gauge marks (decorative, the labels carry the numbers): track `#2A2A2A`, 5% tick `#3A3A3A`, 25% tick `#5A5A5A`.

### 1.2 Photographs: the only colour

Not tokens in `colors`, constants of the bake (`scripts/build-drink-photos.mjs`, §5):

| Constant | v3.3 | Night | Why |
|---|---|---|---|
| `settle` (edge colour, read from theme.ts) | `colors.liningDeep` `#2F070D` | `colors.photoGround` `#000000` | The photo meets the page with no seam; full-bleed photos dissolve into the black |
| `POOL` (wall colour at the centre of the light) | `#7C5642` (warm tungsten) | `#45413E` (near-neutral) | A warm brown wall reads as walnut again and puts a hue in every frame. On a near-neutral wall the drink (Negroni red, Grasshopper green, Aviation violet) is the only colour. The subject keeps tungsten.py's warm `SUBJECT_TINT`, so drinks still glow rather than look clinical |
| `ghostHi` (the ghost's highlight) | `#9C7F7A` (rose) | `#6A6A6A` | A drink you have not caught becomes a grey impression that recedes behind the lit ones |

### 1.3 Migration from v3.3 (what each old key becomes)

So call sites keep compiling while screens are restyled, every old key is re-pointed for one release, then deleted (as v3 did with its stage 3).

| v3.3 key(s) | Night |
|---|---|
| `bg`, `lining`, `liningDeep`, `reelGround`, `lockInk` | `night` |
| `surface`, `card`, `mat`, `bgSunk`, `slot` | `surface` |
| `cardAlt`, `reelBar` | `raised` |
| `line`, `liningLine`, `liningLip`, `slotEdge`, `matEdge`, `windowEdge`, `plateEdgeLining`, `printEdge` | `edge` (on raised) or `rule` (on night) |
| `lineControl`, `liningControl` | `lineControl` |
| `lineInk` | `white` |
| `text`, `onLining`, `reelInk`, `textOnEspresso` | `ink` |
| `textMuted`, `onLiningMuted`, `reelInkMuted`, `onWalnutMuted` | `inkMuted` |
| `textFaint`, `onLiningFaint` | `inkFaint` |
| `reelInkDim` | `tabDim` |
| `wine`, `merlot`, `success` (every affirmative fill) | `white`, with `night` text |
| `textOnWine` | `night` |
| `wineWash`, `successWash`, `dangerWash` | `raised` |
| `danger`, `dangerOnLining` | `ink` (a destructive act says so in words and is confirmed by the system alert, which iOS draws in its own red) |
| `storyRing` | `white` |
| `storyRingSeen` | `edgeStrong` |
| `reelScrim`, `onMedia.markerFill` | `marker` |
| `reelControlBorder`, `onMedia.markerEdge` | `markerEdge` |
| `scrim`, `overlay` | `overlay` |
| `record` | `white` (the recording state is the timer and the square stop glyph, not a red dot; Reels is flag-off) |
| `brass`, `brassPlate`, `brassLit`, `brassShade`, `brassInk`, `brassOnDark`, `plateHolderEdge`, `railLit`, `railShade`, `tabKeyline`, `bracketShadow`, `bevelTop`, `bevelFoot`, `walnut*`, `label`, `walnutTile`, `glyphTint`, `wineSoft`, `wineDeep`, `taupe*`, `amber`, `embossLight/Shadow`, `debossLight/Shadow`, `counterBand/Line`, `ledge`, `shade`, `faceCocktail/Spirit`, `ghostHi` (moves into the bake) | deleted |
| `CATEGORY_META.*.color / wash / fieldFrom / fieldTo` | `ink` / `raised` / `surface` / `surface` |
| `SIGNUP_ACCENTS` | stay stored on profiles (data), but are **not drawn**: an avatar with no photo is an initials disc in `#2E2E2E` with a 1pt `edgeStrong` ring |
| `facebook`, `onFacebook`, `google*`, `appleFill`, `providerEdge`, `providerInk` | kept, sign-in screen only: they quote another company's mark. Sign in with Apple switches to its HIG **white** style on black |

`onMedia` becomes: `ink: white`, `shadow: rgba(0,0,0,.6)`, `scrimClear: rgba(0,0,0,0)`, `scrimMid`, `scrimDeep`, `markerFill: marker`, `markerEdge`, `plaque.plate: { fill: white, ink: night }`, `plaque.marker: { fill: marker, edge: markerEdge, ink: white }`. Nothing else may be drawn over a photo (check-design rule 11 unchanged).

### 1.4 The token block (for `src/constants/theme.ts`)

```ts
export const colors = {
  /* ---- v4 Night: black, white, one grey ramp. No hue in the UI (specs/v4-mockups/black/spec.md) ---- */
  night: '#000000',       // every ground; text on white
  photoGround: '#000000', // what build-drink-photos settles every photo to (kept separate: the bake reads a plain hex by name)
  surface: '#0E0E0E',
  raised: '#171717',
  raisedHi: '#222222',
  pressed: '#2C2C2C',
  rule: '#1F1F1F',
  edge: '#2E2E2E',
  edgeStrong: '#474747',
  lineControl: '#737373',
  ink: '#F5F5F5',
  inkMuted: '#A3A3A3',
  inkFaint: '#7E7E7E',
  white: '#FFFFFF',
  whitePressed: '#D4D4D4',
  tabDim: '#8C8C8C',
  scrimMid: 'rgba(0, 0, 0, 0.62)',
  scrimDeep: 'rgba(0, 0, 0, 0.86)',
  marker: 'rgba(0, 0, 0, 0.72)',
  markerEdge: 'rgba(255, 255, 255, 0.28)',
  overlay: 'rgba(0, 0, 0, 0.48)',
  gaugeTrack: '#2A2A2A',
  gaugeTick: '#3A3A3A',
  gaugeTickMajor: '#5A5A5A',
  /* quotations, sign-in only: facebook, onFacebook, googleBlue/Green/Yellow/Red, providerEdge, providerInk (unchanged) */
} as const;
```

---

## 2. Contrast (WCAG 2.x, computed)

There is no grain on any Night ground, so the worst pixel under text is the ground itself (v3 had to measure grain and walnut; Night does not).

### 2.1 Text (4.5:1 body, 3:1 for ≥ 18pt or ≥ 14pt bold)

| Text | on `night` #000 | on `surface` #0E0E0E | on `raised` #171717 | on `raisedHi` #222 | on `pressed` #2C2C2C |
|---|---|---|---|---|---|
| `ink` #F5F5F5 | **19.26** | **17.71** | **16.44** | **14.59** | **12.81** |
| `inkMuted` #A3A3A3 | **8.33** | **7.65** | **7.11** | **6.31** | **5.54** |
| `inkFaint` #7E7E7E | **5.17** | **4.76** | 4.42 (large/glyph only) | 3.92 (large/glyph only) | 3.44 (large/glyph only) |
| `tabDim` #8C8C8C | 6.25 | 5.74 | **5.33** (the tab bar) | 4.73 | 4.15 (large only) |
| `white` #FFFFFF | **21.00** | 19.30 | 17.93 | 15.91 | 13.97 |

| Pair | Ratio | Where |
|---|---|---|
| `night` #000 on `white` #FFF | **21.00** | Primary buttons, solid Nº plates, "All" chip, the + |
| `night` on `whitePressed` #D4D4D4 | **14.17** | Held primary button |
| `ink` on avatar disc #2E2E2E | **12.46** | Initials |
| `ink` on avatar disc #474747 | **8.52** | The lightest disc used in the liked-by faces |
| `white` on `marker` over a white frame (#474747) | **9.29** | "In your Dex" over a photo |
| `white` on `scrimMid` over a white frame (#616161) | **6.19** | Lowest text over a photo (the nameplate sits at ≥ .68) |
| `white` on `scrimDeep` over a white frame (#242424) | **15.52** | Nameplate meta line |
| `inkMuted` on `raised` | **7.11** | "In their Dex" tag text, sheet subtitle |
| `inkMuted` on `raisedHi` | **6.31** | Placeholder in the sheet's search |

### 2.2 UI and glyphs (3:1)

| Mark | Ground | Ratio |
|---|---|---|
| `lineControl` #737373 checkbox / outline-button edge | night / surface / raised / raisedHi | **4.43 / 4.07 / 3.78 / 3.36** |
| `white` ticked box, unseen story ring, active tab marker | night / raised | 21.00 / 17.93 |
| `white` gauge fill | `gaugeTrack` #2A2A2A | **14.35** |
| `inkMuted` rank notch (`ink` for the next rank) | surface | 7.65 / 17.71 |
| `tabDim` resting tab glyph | raised | 5.33 |
| `ink` icon glyphs | night | 19.26 |
| `inkFaint` clear (x) glyph in a field | surface | 4.76 |
| Focus edge (`white`, 1pt, replaces the field's `edge`) | surface / night | 19.30 / 21.00 |

### 2.3 Decorative only (carry no information; check-contrast lists them so nobody puts text on them)

`rule` (1.27 on night), `edge` (1.55 on night, 1.32 on raised), `edgeStrong` (2.26 on night), `markerEdge` composited (2.26), `gaugeTrack` (1.46), `gaugeTick` (1.85), `gaugeTickMajor` (3.04). Their jobs are rhythm and edges; every one of them sits beside a fill change, a label or a glyph that carries the information. The seen story ring (`edgeStrong`, 1pt) is distinguished from the unseen one by **weight** (1 vs 2pt) and colour, and the label dims to `inkMuted`.

### 2.4 Never (check-contrast asserts each fails)

`inkFaint` as small text on `raised`, `raisedHi` or `pressed` (4.42, 3.92, 3.44); `tabDim` as small text on `pressed`; `lineControl` as an edge on `pressed` (2.95); `inkMuted` over a photo at any scrim under `scrimDeep` (2.46 on scrimMid over white); any grey other than `white` as text over a photo.

### 2.5 Increase Contrast (iOS setting)

When `AccessibilityInfo.isDarkerSystemColorsEnabled()` is true (and on its `darkerSystemColorsChanged` event), five tokens step up:

| Token | Normal | Increased | Gain on night / raised |
|---|---|---|---|
| `inkMuted` | #A3A3A3 | #BDBDBD | 11.18 / 9.54 |
| `inkFaint` | #7E7E7E | #9E9E9E | 7.84 / 6.69 (now body-safe everywhere) |
| `lineControl` | #737373 | #8F8F8F | 6.49 / 5.54 |
| `edgeStrong` | #474747 | #6B6B6B | 3.94 / 3.36 (outline plates read as UI) |
| `edge`, `rule` | #2E2E2E, #1F1F1F | #474747, #333333 | edges become visible on OLED at low brightness |

---

## 3. Type

### 3.1 Families: three, seven cuts, one job each

| Role | Family | Cuts | Job |
|---|---|---|---|
| display | **Playfair Display** (kept) | 600, 700 | The wordmark and drink names, and nothing else. A drink's name is the title of the work; a high-contrast serif in white on black is the most "gallery label" thing the app can do, and it keeps Sipply recognisably Sipply. |
| body | **Inter** (kept) | 400, 500, 600 | Everything you read or press. Body only: Inter no longer sets any catalogue figure. |
| data | **JetBrains Mono** (new; OFL 1.1, Google Fonts `ofl/jetbrainsmono/JetBrainsMono[wght].ttf`) | 400, 500 | **The Dex's own figures**: the four digits of a Nº plate, the Dex count, "of 2,089 · 1.8%", the gauge scale and rank notches, a section's count ("30", "161"), checklist ranks ("01"), chip counts. It reads as a catalogue or accession number: a precise, slightly mechanical voice that sits against the serif names and the quiet Inter. |

Why JetBrains Mono and not another mono: true tabular digits with a slashed-free, open zero that does not read as an O at 11pt; a tall x-height that stays crisp in white on black; it ships `º` and the en dash in its Latin set; OFL with no reserved name, so it can be subset and renamed like the other two. Why a mono at all: on a black screen every figure in Inter looked like every other word. Splitting the data role out is what makes the Dex read as a collection with a numbering system rather than a list.

**The rule that keeps the mono honest: mono means "measured against the 2,089".** Social numbers (posts, followers, likes, "2h", "12 others") stay Inter. If a number is not about the Dex or the bar's catalogue, it is not mono.

Files, made exactly as `assets/fonts/README.md` describes (instance per weight, then subset, then rename name IDs 1/2/3/4/6/16/17 to `JetBrainsMonoLatin`):

```
python3 -m fontTools.varLib.instancer JetBrainsMono[wght].ttf wght=400 -o /tmp/jbm-400.ttf
python3 -m fontTools.subset /tmp/jbm-400.ttf \
  --unicodes='U+0020-00FF,U+0100-017F,U+2000-206F,U+20A0-20BF,U+2116,U+2122' \
  --layout-features='*' --output-file=assets/fonts/JetBrainsMonoLatin_400Regular.ttf
```

60 KB per cut (+120 KB total). `LICENSE-JetBrainsMono.txt` travels with them. `fonts` gains `data: 'JetBrainsMonoLatin_400Regular'`, `dataMedium: 'JetBrainsMonoLatin_500Medium'`; `fonts.label` and `fonts.numeral` stop being Inter. No `fontWeight` anywhere (README rule).

### 3.2 The Nº plate is two faces

`Nº` is set in **Inter Medium** and the four digits in **JetBrains Mono Medium**, as two nested `Text`s in one plate. In a monospace face the masculine ordinal `º` takes a full cell and reads "N °" (the first render of this mock showed it); Inter's `º` sits tight to the N. Never `№` (U+2116): Inter's subset still lacks it.

### 3.3 Roles

| Role | Family / cut | Size / line | Tracking | Colour | Where |
|---|---|---|---|---|---|
| `wordmark` | Playfair 700 | 28 / 34 | +0.2 | white | Home bar |
| `wordmarkLg` | Playfair 700 | 44 / 50 | +0.2 | white | Sign-in, password reset |
| `drinkHero` | Playfair 700 | 52 / 56 | −0.3 | white | Drink page |
| `nameplate` | Playfair 700 | 38 / 44 | −0.2 | white (onMedia) | Over a feed or post photo (was 34) |
| `nameLg` | Playfair 700 | 28 / 34 | 0 | ink | Pours viewer, collect moment |
| `rowName` | Playfair 600 (700 when it is the row's subject) | 18 / 22 | 0 | ink; muted for the unmatched part of a search hit | + window results, One ingredient away |
| `cardName` | Playfair 700 | 15 / 18 | 0 | ink | Dex cells, "You can make" strip |
| `cardNameNot` | Playfair 600 | 15 / 18 | 0 | inkMuted | Dex cells not yet caught |
| `latestName` | Playfair 700 | 16 / 22 | 0 | ink | Dex header "latest catch" |
| `nameInline` | Playfair 600 | inherits | 0 | ink | A name inside an Inter sentence ("theo_stirs's *Paper Plane*") |
| `screenTitle` (new) | Inter 600 | 26 / 32 | −0.5 | white | "What's in your bar?" |
| `barTitle` | Inter 600 | 17 / 22 | −0.2 | ink | Every top bar (one size now; `barTitleLg` retires) |
| `sectionTitle` | Inter 600 | 20 / 26 | −0.3 | ink | "You can make", "One ingredient away", "Liked by" |
| `count` (social) | Inter 600 | 20 / 24 | −0.3 | ink | Profile posts / followers / following |
| `username` | Inter 600 | 14–15 / 18–20 | 0 | ink | Post author, liker name |
| `rowTitle` | Inter 500 | 15 / 19 | 0 | ink | Checklist tiles |
| `prose` | Inter 400 | 14 / 20 | 0 | inkMuted | Bio, captions |
| `meta` | Inter 400 | 12–13 / 16–18 | 0 | inkMuted | "La Factoría, Old San Juan", "in 173 drinks" |
| `button` | Inter 600 | 14 / 18 (sm, md); 16 / 20 (block) | 0 | night on white; ink on tonal/outline | |
| `chip` | Inter 500 | 14 / 18 | 0 | inkMuted; night when on | |
| `tab` | Inter 500 (600 active) | 11 / 14 | 0 | tabDim; white active | |
| `kicker` | Inter 500 | 12 / 16 | +0.6 (tracking-ok: lowercase) | inkMuted | "latest catch", "rank". At most one per screen region |
| `heroFigure` | Mono 400 | 46 / 46 (Dex), 44 / 44 (Profile panel) | −1.5 | white | The Dex count |
| `figure` | Mono 400 | 12 / 16 | 0 | inkMuted | "of 2,089 · 1.8%" |
| `plate` | Inter 500 "Nº" + Mono 500 digits | 11 / 14 (sm, 18pt tall); 12 / 16 (lg, 22pt tall) | +0.2 on digits | night on white; inkMuted on outline | Every Dex number |
| `scale` | Mono 400 | 11 / 14 | 0 | inkMuted (next rank: ink) | Gauge labels |
| `rank` | Mono 400 | 11 / 14 | 0 | inkMuted | Checklist "01" |
| `sectionCount` | Mono 400 | 13 / 16 | 0 | inkMuted | "30", "161" beside a section title |
| `chipCount` | Mono 500 | 12 / 16 | 0 | inkFaint (night on an active chip) | "In your bar 12" |

11pt floor holds (plates, scale, rank, tab labels are 11). Dynamic Type: plates, scale labels and tab labels cap at `maxFontSizeMultiplier` 1.3 (fixed frames); everything else wraps and grows; names never truncate (v3 §6.4 unchanged).

Negative tracking is only on Inter ≥ 17pt and on the mono hero figure: large Inter at default tracking looks loose in white on black, which is most of what made the old dark screens feel un-sleek.

---

## 4. Space, radius, stroke, elevation, icons

### 4.1 Space

4pt rhythm unchanged (`space` xs 4 … xxxl 48), gutter 16, tab bar inset 12 and 34 from the bottom. Between sections 32 to 40; a section head sits 12 above its content; a cell's label sits 8 under its photograph. Black needs more air than cream did: no section is separated by a box or a rule where whitespace can do it.

### 4.2 Radius (role-named, replaces `radius`)

| Key | pt | Used by |
|---|---|---|
| `none` | 0 | Full-bleed photos, Profile grid tiles, rules, the keyboard |
| `tag` | 2 | Nº plates, markers, outline tags, checkboxes; the grabber is 1 |
| `thumb` | 4 | Small photo thumbs ≤ 46: the + window's result rows and its 44pt print |
| `control` | 6 | Buttons, fields, chips, the + button, Dex photo windows, "You can make" photos, the 56pt One-ingredient-away thumb |
| `card` | 8 | Checklist tiles, the Profile Dex panel, list groups |
| `sheet` | 12 | Sheet top corners |
| `bar` | 14 | The floating tab bar |
| `round` | 999 | Avatars, story rings and discs, the "You" + badge, dots (round-ok, lint-enforced as today) |

Tighter than v3's 8/12 on purpose: 6pt controls read as machined, 8pt+ reads soft.

### 4.3 Stroke

| Key | pt | Used by |
|---|---|---|
| `hair` | 1 (drawn 1pt, not `hairlineWidth`: a 0.33pt grey on OLED black flickers while scrolling) | `rule` / `edge` separators, bar foot, panel and photo-window keylines |
| `edge` | 1 | Every container and control edge |
| `box` | 1.5 | An unticked checkbox (so a 20pt square reads at 3:1 without growing) |
| `indicator` | 2 | Active tab marker (20 × 2), TabStrip underline (64 × 2), unseen story ring, gauge track and fill |
| icon | 1.5 at 24pt | All line icons; 2 for the + in the white button; 2.2–2.4 for a check inside a box |

### 4.4 Elevation: none

Every `elevation.*` shadow is deleted (`bar`, `barDark`, `sheet`, `seat`, `recess`, `paper`, `logAction`). On black a shadow is invisible at best and a grey smudge at worst. Depth is: **one step up the ramp + a 1pt edge**. The tab bar is `raised` with an `edge`; a sheet is `raised` with an `edge` lip and the `overlay` on what is under it; a field is `surface` with an `edge`. check-design rule 12 now asserts `elevation` is empty and no `boxShadow`/`shadow*` prop exists in `src/`.

### 4.5 Icons

24pt grid, 1.5pt stroke, round caps and joins, `ink` at rest. **Outline at rest, solid when on**: the active tab's glyph, a liked heart, a saved bookmark. No duotone, no colour, no badges with numbers; an unread dot is a 7pt `white` disc with a 2pt `night` ring. Tab glyphs: house, coupe (Dex), bottle (My Bar), the avatar (Profile). The chart glyph on the Dex is four bars on a baseline.

---

## 5. Photographs

### 5.1 The re-bake (required; the mock's photos were made this way)

`scripts/build-drink-photos.mjs`:

1. `themeColors(['liningDeep', 'ghostHi'])` → `themeColors(['photoGround'])`; `SETTLE = photoGround` (`#000000`).
2. `POOL = '#7C5642'` → `'#45413E'`.
3. `GHOST_HI` becomes a script constant `'#6A6A6A'` (it no longer lives in `colors`, since nothing in the UI draws it).
4. Run it once: 162 photos. The mock's 32-photo run took 17 s and every photo passed the seam gate at **0/255** (the edge is exactly `#000000`). Three were flagged "stray light" for review on the QA sheet (bushwacker, whiskey-sour, clover-club); none is shown in the mock.

The `.drinks-next` swap, the WebP encode, the require map and the gates are unchanged. Masters stay in `~/Desktop/CLINK DEX PHOTOS`.

### 5.2 How photos are drawn

- **Feed and post: full bleed again** (440 × 550 at 440, 4:5 unchanged). Brass inset the print to hang brackets on it; Night needs the bleed, because a photo that settles to the page's own black has no edge to frame. The drink appears out of the dark.
- **Nameplate**: one bottom scrim, 200pt, `clear → scrimMid at 45% → scrimDeep`, with `white` text on it (the name always sits on ≥ .68). Over it, a solid `lg` Nº plate and the "In your Dex" marker. No top scrim, ever.
- **Grid and strips**: photos `cover`, centred on the bake's light (`object-position 50% 46%`), radius 6, with a 1pt `rule` keyline inside the window so the grid keeps its rhythm even where a photo's edge is pure black.
- **Ghosts** (not caught): the 256px ghost bake, shown at full opacity; it is already dim.
- **Drinks with no photograph** (1,927 of 2,089): the vector face becomes a single line drawing of the glass shape (`resolveShape`), 1.25pt `#5E5E5E` on `surface`, no fill, no counter band. The mock shows the rocks glass in the + window's last three rows.
- **Stories**: the friend's latest pour, cropped to the glass, inside the ring.
- Every photo `<Image>` keeps `enforceEarlyResizing` and its per-size `cacheKey`, and adds `accessibilityIgnoresInvertColors` (Smart Invert must not turn the only colour in the app into a negative).

---

## 6. Components, one by one

### Chrome

- **Top bar** (`ScreenTopBar`, `HomeChrome`): solid `night`, 44pt, title `barTitle` centred. When content scrolls under it, a 1pt `rule` appears at its foot (the old `showRule`). No fade, no tail: `homeBarTop`, `homeBarFoot`, `layout.homeBarTail`, `layout.homeStripTail` stay deleted, and the Brass rail becomes this hairline. Glyph buttons 44 × 44, `ink`.
- **Status bar**: `light` on every screen, always.
- **Floating tab bar**: `raised`, 1pt `edge`, radius 14, 64pt, inset 12 / 34. Resting tabs `tabDim` glyph + label; the active tab is `white`, its glyph solid, its label SemiBold, and a **20 × 2 `white` marker on the bar's top edge** that rides the pager's `position` natively (v3.3 §1 mechanism unchanged). Three cues, none of them hue. **The + is the bar's one white object**: 52 × 38, radius 6, `white` fill, a 2pt `night` plus. Held: `whitePressed`. The Profile tab shows the user's avatar at 24 with a 1.5pt `raised` gap and 1pt `white` ring when active. The 48pt compact state keeps the marker.
- **Tab placeholder** (v3.3 `TabPlaceholder`): `night` with the title in place. No grain any more.

### Home

- **Stories**: 62pt rings. Unseen: 2pt `white`. Seen: 1pt `edgeStrong`, label `inkMuted`. "You": the initials disc with no ring and a 22pt `white` + badge with a 2pt `night` ring. Labels `ink` 12/16. No shelf under them: the row ends in black space.
- **Post card**: author row (32pt avatar with 1pt `edgeStrong` inset ring, `username` + " · 2h" `inkMuted`, place line `meta`, more glyph), the full-bleed photo with its nameplate (§5.2), an action row (heart, comment, send, bookmark; liked = solid white heart), then "Liked by **maya.pours** and **12 others**" with three 22pt faces overlapping by 4pt, each with a 2pt `night` ring. The whole line opens the likers sheet. Caption below in `prose` with the author in `ink` SemiBold.
- **Activity dot** on the heart: 7pt `white` with a 2pt `night` ring.

### Dex

- **Header**: `heroFigure` "38" + "in your Dex" (Inter 500 15, ink) / "of 2,089 · 1.8%" (`figure`). Right: kicker "latest catch" and the drink's name in `latestName`.
- **Gauge** (`DexGauge`, was `BrassGauge`): one `Svg` 32pt tall: a 2pt `gaugeTrack` line across the full width, the `white` fill (min 3pt so 0.1% shows), a 1 × 4 `gaugeTick` every 5% and a 1 × 7 `gaugeTickMajor` every 25%, labels in `scale` as RN `Text` positioned by percentage (Dynamic Type works), first left-aligned, last right-aligned. `accessibilityRole="progressbar"`, value `{min 0, max 2089, now 38}`, label "38 of 2,089 in your Dex".
- **Search**: `surface`, 1pt `edge`, radius 6, 44pt, glyph and placeholder `inkMuted` ("Search 2,089 drinks"). Focused: the edge turns `white` (1pt, so nothing moves).
- **Filter chips**: 32pt, radius 6, 1pt `edge`, label `inkMuted`; on = `white` fill, `night` label, no edge. A 1 × 20 `edge` divider between the type and status groups.
- **Cell** (`DexCard`, rewritten): no card. The photograph is the work and the label hangs under it, like a gallery wall label:
  - window 130.67 × 156 at 440 (column width × 1.19), radius 6, 1pt `rule` keyline; caught = the lit photo in full colour; not yet = the ghost;
  - 8pt below: the `sm` Nº plate: **solid `white` with `night` digits when caught; outline (`edgeStrong`, `inkMuted` digits) when not**;
  - 6pt below: the name, `cardName` in `ink`, or `cardNameNot` in `inkMuted`, wrapping to two lines.
  - Caught vs not is said four ways: colour photo vs grey impression, filled vs outline plate, ink vs muted name, and the spoken label ("Caesar, number 1, in your Dex" / "Greyhound, number 2, not collected yet"). No lock or check glyph needed.
  - Rows: 3 columns, 8pt column gap, 16pt row gap. No shelves, no range holders.

### My Bar

- `screenTitle` "What's in your bar?" and the live line "**12** in your bar · makes **30** drinks" (`prose`, figures `ink` SemiBold).
- Search ("Search 490 ingredients") and chips as on the Dex; "In your bar" carries its count in `chipCount`.
- **Checklist tiles** (`CheckRow`, 2-up): 52pt, radius 8. Unticked: `surface`, 1pt `rule`, an empty 20pt box with a 1.5pt `lineControl` edge. Ticked: `raised`, 1pt `edge`, the box filled `white` with a 2.4pt `night` check. Name `rowTitle`, "in 173 drinks" `meta`, rank "01" `rank` top right. State is fill + glyph + tile step, never colour. The whole tile is the control (`accessibilityRole="checkbox"`). The ingredient glyphs (`IngredientGlyph`, `glyphTint`) are removed: they were the only coloured things left in the UI, and the tile reads without them.
- "Sweet vermouth, Dry vermouth and 482 more" `meta` + "Show all" `ink` SemiBold.
- **Section heads**: `sectionTitle` + `sectionCount` + "See all" (`inkMuted`, 500) right-aligned. No rule, no spoon.
- **You can make**: a strip of 118pt cards: photo 118 × 126 radius 6 with a `rule` keyline, plate, `cardName`. A drink you can make but have not caught still shows its lit photo (it is a suggestion); its plate is the outline one.
- **One ingredient away**: rows with a 56pt thumb (radius 6), `rowName` 700 + the plate inline, "Needs orange · pours 5 more" `meta`, and a squared **secondary** button "+ Orange" (outline `lineControl`, `ink` label, 32pt). Adding happens in place, as v3.3 §6 specifies.

### Post page and the likers sheet

- Post page top bar: back, "Post", more; solid with its `rule` foot once the photo runs under it.
- **Likers sheet** (RN `Modal` `pageSheet`, as v3.3 §8): `raised`, radius 12 top, a 1pt `edge` lip, `overlay` on the page behind. Grabber 36 × 4, radius 1, `edgeStrong`. Header: "Liked by" `sectionTitle`, "24 people liked theo_stirs's *Paper Plane*" (`meta`, name `nameInline`), the drink's `lg` plate right. Search: `raisedHi`, radius 6, no edge (the fill step is the field on a sheet), placeholder `inkMuted` 6.31:1.
- **Rows** (62pt, 1pt `edge` separators): 44pt initials disc (`raisedHi` with a 1pt `edge` ring; your own disc one step lighter), name `username`, then the handle `meta` and, when the liker has the drink, an **outline tag** "✓ In their Dex" (1pt `edgeStrong`, radius 2, `inkMuted` 11pt; "In your Dex" on your row). Right: **Follow = primary** (`white`, `night` label, 96 × 32), **Following = secondary** (outline). No button on your own row. Follow is the sheet's one white action type.
- Data: the "In their Dex" tag still needs the one boolean per liker that Brass D18 named; if it is not wanted, drop the tag and nothing else changes.

### Profile

- Top bar: "+", the handle as title, settings gear.
- Avatar 84 (photo, or initials disc `#2E2E2E` with a 1pt `edgeStrong` ring). Counts in `count` over `meta` labels, three equal columns. Name `username`, bio `prose`.
- Buttons: "Edit profile" and "Share profile" are **tonal** (`raised`, 1pt `edge`, `ink` label, 36pt), half width each. Neither is the screen's primary action, so neither is white.
- **Dex panel** (was the walnut plaque): `surface`, radius 8, 1pt `rule`. `heroFigure` 44 "64", "in your Dex" / "of 2,089 · 3.1%", kicker "rank" over "First Sips" (Inter 600 15) right. The gauge, plus **rank notches**: a 1 × 14 mark at each rung of `lib/milestones` (209, 523, 1,045, 1,567), the next rung's notch and label in `ink`, the rest `inkMuted`; 2,089 right-aligned at the end. Under the panel: "145 more to **Barfly in Training**, at 209".
- **TabStrip** (Posts | Dex): label `ink` SemiBold when on, `inkMuted` 500 when off; a 64 × 2 `white` underline under the active one; 1pt `rule` across the foot.
- **Grid**: 3 columns, 2pt gaps on `night`, square tiles full bleed (radius 0), each with its `sm` solid plate 6pt from the bottom left. The plate is solid white, so it reads on any photograph (21:1, measured against the plate).

### The + window (Post a drink)

- Full-screen modal, `night`. Top bar: close X, "Post a drink", `rule` foot always drawn.
- **Search row** pinned under the bar (v3.3 §4): the 44pt print of the photo you took (radius 4, 1pt `edge`), then the field (`surface`, focused = 1pt `white` edge, `ink` text, a 2pt `white` caret, a `inkFaint` clear glyph).
- **Results**: 62pt rows on `night` with 1pt `rule` separators: 46pt thumb (photo, or the glass line drawing on `surface`), `rowName` with **the typed match in `white` with a 1pt underline and the rest in `inkMuted`**, the meta line ("Spirit-forward · Florence, Italy"), the plate at the right (solid if it is already in your Dex, outline if posting it would be a new catch). Footer line: "Showing the best 6 of 9" `meta` + "Not the one? Add “neg”" `ink` SemiBold.
- **Keyboard**: the system's, `keyboardAppearance="dark"` on every `TextInput` (SearchField and Field), so it is grey on black and never a white slab. `returnKeyType="done"`: iOS tints a `search` return key blue, and the results are live anyway.
- Compose mode (not mocked) uses the same kit: the photo well is `surface` with a 1pt `edge`, "Save & post" is the screen's one primary (white) button, "Save to Dex" is secondary (outline).

### Everything else (not mocked; same kit)

- **Drink page**: `night` ground, the hero photo full bleed and dissolving into the page (the bake was made for exactly this), `drinkHero` name, the label band as four columns of `figure`/`meta` pairs separated by 1pt `rule`s, the spec card becomes a `surface` panel (radius 8, `rule` edge, no `paper` shadow). The pinned action bar is `night` with a `rule` top and one white primary.
- **Sheets, dialogs, toasts**: `raised`, `edge`, `overlay`. Toasts are `raisedHi` with `ink` text.
- **Empty states**: a 1.5pt line glyph in `inkFaint` at 40pt, `sectionTitle`, `prose`, one white button.
- **Sign-in**: wordmark `wordmarkLg` on `night`; provider rows keep their quoted marks (§1.3), Apple's button in its white style.
- **Celebration overlay** (a new catch): the photo full screen on `night`, the name in `nameLg`, the solid plate dropping into place (native-driver opacity + translate only, as now). No confetti colour.
- **Intro film**: see §11.

---

## 7. What survives from Brass, and what goes

| Brass piece | Night | Why |
|---|---|---|
| D1 engraved Nº plate | **Survives** as a solid `white` plate, `night` digits, radius 2. No screws, no engraved shadow, no brassLit/brassShade borders | The number is the Dex's identity. White on black is the strongest mark this palette has, so the plate now also means "caught" |
| D2 empty plate holder | **Survives** as the outline plate (1pt `edgeStrong`, `inkMuted` digits) | Same shape, not yet filled: the Brass idea, without the metal |
| D3 brass keyline on mounts | Goes | The lit colour photo and the filled plate already say "caught" |
| D4 corner brackets | Goes | Ornament. The photo's dissolve into the page frames it |
| D5 inset print | Reverted to full bleed | The dissolve needs the bleed |
| D6 bottle-label tags | Become the `marker` over photos and the outline tag on grounds; the checklist becomes tiles | Same jobs, no costume |
| D7 bar-spoon rule | Goes | Section heads stand on whitespace and a mono count |
| D8 / D9 walnut, shelves, label holders with the row range | Go, including the range | Each cell's own Nº is the wayfinding; no texture to decode |
| D10 brass rail under a bar | **Survives** as the 1pt `rule` at the bar's foot | Structure, not decoration |
| D11 tab bar hardware | The active **marker survives** (20 × 2 `white` on the top edge, moving with the pager). The keyline goes. The + turns white | The marker is a functional cue |
| D12 brass gauge | **Survives** as an instrument scale: 2pt track, white fill, 5% and 25% ticks, mono labels | The one place where fine marks carry meaning |
| D13 walnut Dex plaque | **Survives** as the Dex panel (`surface`, `rule` edge) with the rank notches | The content was right; the wood was costume |
| D14 avatar bezel | Goes (1pt `edgeStrong` ring only) | |
| D15 count separators | Go | Whitespace |
| D16 author hairline ring | **Survives** as the 1pt `edgeStrong` inset ring on every initials disc | Without it a `#2E2E2E` disc melts into black at low brightness |
| D17 window bevel | Goes | |
| D18 likers sheet | **Survives**, restyled (§6) | It is a feature |
| D19 stories shelf | Goes | |
| D20 search well | Becomes the plain `surface` field, no inner shadow | |
| `kicker` role | **Survives** | |

---

## 8. Dark / light behaviour

**Night is the only appearance.** Sipply stops following the system setting:

- `app.json`: `"userInterfaceStyle": "dark"` (sets `UIUserInterfaceStyle = Dark`), so system alerts, action sheets, the share sheet, date pickers, the photo picker and context menus render dark too, and there is never a white system sheet over a black app.
- `StatusBar style="light"` everywhere (the per-screen `FocusedStatusBar` logic simplifies to a constant).
- `keyboardAppearance="dark"` on every `TextInput`.
- There is no light theme. The photographs are baked to settle to `#000000`, so a light ground would show a black square around every drink. A light appearance would be a different direction with its own bake, not a toggle.
- Increase Contrast steps five tokens up (§2.5). Reduce Transparency changes nothing (the only translucency is the scrims and the overlay, which must stay). Bold Text works through the existing Inter 600 cut. Smart Invert skips photos (`accessibilityIgnoresInvertColors`).
- The app icon and splash: splash background `#000000` with the white wordmark (so launch does not flash cream). Re-colouring the app icon is out of scope here and flagged in §11.

---

## 9. Performance

Night is lighter to draw than Brass on every screen.

| Removed | Saved |
|---|---|
| The walnut texture | One 1.3 MB decode and an `expo-image` per shelf (~5 on the Dex, 1 on Home, 1 on Profile) |
| `Grain` on lining and paper | One tiled image layer under every screen root. On OLED, grain also lights thousands of pixels that would otherwise be off, and it visibly crawls while scrolling |
| Every `boxShadow` (`seat` and `recess` were on scrolling Dex cells) | Shadow path rasterisation on every mounted cell |
| Brass SVGs: brackets (16 elements per post), label tags (each with an `onLayout` pass), spoon rules, the bezel | ~20 `Svg` per screen and their first-layout passes |
| Plate screws, bevels, keylines, rails | ~120 Views on a full Dex screen |

| Added | Cost |
|---|---|
| Plates | 1 View + 2 Text each (as before, minus the screws) |
| Gauge | 1 `Svg`, ~25 elements, recomputed only when the count changes (same as Brass) |
| JetBrains Mono | +120 KB of fonts, loaded with the others at launch |

- **OLED**: on every iPhone since the X, a `#000000` pixel is off. Most of each screen is now unlit, which is what makes the photos look like they glow, and it costs less battery than cream did.
- **Black smear**: OLED pixels turning on from fully off lag a little while scrolling (visible on 60 Hz panels, slight on ProMotion). That is why the ramp starts at `#0E0E0E` rather than `#050505`, why surfaces stay small (tiles, panels) and why the photos fade to black softly instead of ending at a hard grey box: nothing important sits in the `#01`–`#0D` band where the smear shows.
- Photos: same 1024 / 256 px files, same byte budget, same `expo-image` cache sizes. The bake only changes pixels.
- No motion is added. v3.3's motion policy (pager, native-driver indicator, UIKit sheets) stands, and check-design rules 3 and 15 are unchanged.

---

## 10. Guards (for whoever builds it)

- **check-contrast**: every pair in §2.1 and §2.2, the "never" pairs in §2.4 asserted as failures, the Increase Contrast variants in §2.5, and the scrims composited over white. Drop the grain and walnut measurements (no textures remain). Assert `colors.photoGround === colors.night`.
- **check-design**:
  - no hue: every `colors` value must have R = G = B (the sign-in quotations are listed in an allowlist by key);
  - `elevation` is empty and no `boxShadow`, `shadowColor`, `shadowOpacity` or `elevation:` style appears in `src/`;
  - only `inkMuted`, `ink`, `white`, `night` and `tabDim` may be a Text `color`; `inkFaint` only on `night` or `surface` grounds (lint by component allowlist as rule 16 does for brass today);
  - `fonts.data*` only through the data roles (`heroFigure`, `figure`, `plate`, `scale`, `rank`, `sectionCount`, `chipCount`); `№` (U+2116) still fails the build;
  - `keyboardAppearance="dark"` present on every `TextInput`;
  - rule 14 (no rarity readers) unchanged.
- **build-drink-photos**: fails if `photoGround` is not a plain hex, as it does for `liningDeep` today.

---

## 11. Open questions and risks

- **The intro film** (`assets/video/intro.mp4`, `colors.filmPaper` `#D6C4B1`) is a cream-paper animation. It will look like it belongs to another app on a black launch. It needs a monochrome re-render, or the launch goes straight from a black splash to Home.
- **The app icon** is wine-and-bone today. A black-and-white icon is a separate, small job.
- **People's photos are colour.** Avatars with a real photo stay in colour (they are photographs, like the drinks). Only initials discs are grey.
- **"In their Dex"** still depends on the likers query returning one boolean per liker (as in Brass).
- **Three photos flagged "stray light"** in the re-bake (bushwacker, whiskey-sour, clover-club) need a look on the full QA sheet; the warm pool may have hidden what the neutral pool shows.
- **Feed photos return to full bleed.** If Jan preferred Brass's inset print, keep the inset (24pt sides, radius 4) and everything else here stands; the dissolve is simply less dramatic.
- **Destructive red is gone from our UI.** "Remove from collection" and "Clear your bar" say so in words and are confirmed by the system alert, which iOS draws with its own red destructive button. That is the platform's colour, not ours.
