# v4 · "Split" (black chrome, white pages)

Direction mock, 9 Oct 2026, for Jan's note: "so i want to remake the whole colorscheme of the app to black and white can you do that an make everthign look sleek and good looking".

Files in this folder:
- `index.html`: six screens side by side, 440 × 956 each. `index.html#home`, `#dex`, `#bar`, `#post`, `#profile` and `#log` show one screen at a time.
- `contact.png`: all six screens on one sheet.
- `home.png`, `dex.png`, `bar.png`, `post.png`, `profile.png`, `log.png`: one per screen, each 880 × 1912 (2x).
- `img/`: the studio masters, and `img/proof/`, the grey proofs (see §7).
- `tools/proofs.py`: bakes both kinds of image from `~/Desktop/CLINK DEX PHOTOS`.
- `tools/contrast.py`: the WCAG calculator that produced every ratio below.
- `tools/render.sh`: headless Chrome, using its own throwaway profile.

Base documents: `specs/v3-cabinet.md`, `specs/v3.3-changes.md`, `specs/v3-3-mockups/brass/spec.md` and `src/constants/theme.ts`. The app's structure, data and features don't change. The mock uses real data: names and numbers come from `src/data/drinks.json`, ingredient ranks and uses from `src/data/barIndex.json`, and the bar result (12 ticked → 30 makeable, 161 one away, orange completes 5) is the matching rule run on the Brass mock's set of 12 ingredients.

---

## 0. The idea in one line

**Black holds the white.** Every screen is a white page held between black chrome: the status bar, the top bar and each tab's head (its title, figure, search and filters) are black above the page, and the tab bar is black below it. Sheet heads and the whole + window are black too. You read, browse and tick on white. Emphasis is always **the inverse**: black on a white page, white on the black chrome. That covers a plate, a selected chip, a ticked ingredient, a primary key and the + key. No hue appears anywhere in the interface.

**Colour is what you've caught.** Photographs keep full colour, and they are the only colour left. A drink you hold shows its photo in colour. A drink you don't hold yet shows a **grey proof** of the same frame: the picture before it is inked. The Dex, My Bar and the + window all follow this rule, so the collection shows as colour filling in a grey book.

| Jan | Here |
|---|---|
| "Black and white" | 11 neutral greys from #000000 to #FFFFFF (R = G = B on every one). There are no wine, brass, walnut or accent hues, and there are no grain textures. |
| "Sleek" | Opaque, flat, square-cut surfaces. No shadows anywhere, no blur, no gradients, no textures. Type does the work: a magazine Didone for names, Inter for everything else, big tabular figures. |
| "Good looking" | The black and white split frames each page the way a magazine frames a spread. Photos sit on white with 24pt margins, like prints. |

---

## 1. Palette

### 1.1 The ramp (every colour in the interface)

| Ramp | Hex | Role token(s) in `colors` | Job |
|---|---|---|---|
| g0 | `#000000` | `chrome`, `ink` | The chrome ground (bars, heads, tab bar, sheet heads, the + window). Ink on the page. The inverse slab on white. |
| g1 | `#121212` | `chromeField` | Search fields and wells on chrome: the Dex gauge's well, the vector-face tile in the + window. |
| g2 | `#1F1F1F` | `chromePressed`, `meterTrack` | The pressed fill of rows on chrome. The Profile meter's track. |
| g3 | `#2E2E2E` | `chromeLine`, `avatarMid` | 1pt hairlines on chrome (decorative): row rules in the + window, count separators, the chip group divider. Also an avatar disc. |
| g4 | `#5E5E5E` | `inkMuted`, `avatarLight` | Secondary text on the page and on `tint`. The names of drinks you don't have yet. Also an avatar disc. |
| g5 | `#6E6E6E` | `chromeEdge` | 1pt control edges on chrome (fields, chips, outline keys, the gauge well). A seen story ring. The sheet grabber. Never text. |
| g6 | `#858585` | `lineControl`, `inkFaint`, `chromeFaint` | Control edges and glyphs on the page (checkbox, outlined plate, number rail ticks). Inactive tab glyph and label on chrome. The field glyph. |
| g7 | `#A3A3A3` | `chromeMuted` | Secondary text on chrome: the dateline, placeholders, figure captions, the kicker, gauge figures. |
| g8 | `#EBEBEB` | `line` | 1pt hairlines on the page (decorative): row separators, index rules, the number rail, unticked cell edges, the tab strip foot. |
| g9 | `#F4F4F4` | `tint` | The ground under a proof (it matches the proof's edge, so there is no seam). The pressed fill of rows on the page. |
| g10 | `#FFFFFF` | `page`, `onChrome` | The page ground. Ink on chrome. The inverse slab on black. |
| | `rgba(0,0,0,0.5)` | `scrim` | The dimmer behind a sheet. No text sits on it. |

Three rules hold the system together:
- **A grey has one job per ground.** On the page, secondary text is always g4. On chrome it is always g7. g5 and g6 are edges and glyphs, never small text.
- **Two inks only: g0 and g10.** Every primary word, figure and glyph is pure black or pure white. Grey always means secondary.
- **Pure black chrome on purpose.** On OLED, g0 is pixels switched off, so the Dynamic Island disappears into the top bar (look at any screen in the mock) and the tab bar meets the screen's edge with no seam.

### 1.2 Contrast (WCAG 2.x, from `tools/contrast.py`)

Text (target 4.5:1 for body, 3:1 for ≥ 18pt or ≥ 14pt bold):

| Text | Ground | Ratio | Where |
|---|---|---|---|
| g10 `#FFFFFF` | g0 `#000000` | **21.00** | All primary text on chrome. Black plates on the page. White plates on chrome. |
| g10 | g1 `#121212` | **18.73** | Typed text in a field |
| g10 | g2 `#1F1F1F` | **16.48** | Text on a pressed chrome row |
| g10 | g3 `#2E2E2E` | **13.58** | Initials on a g3 avatar |
| g10 | g4 `#5E5E5E` | **6.48** | Initials on a g4 avatar |
| g7 `#A3A3A3` | g0 | **8.33** | Secondary text on chrome |
| g7 | g1 | **7.43** | Placeholders ("Search 2,089 drinks") |
| g7 | g2 | **6.53** | Secondary text on a pressed chrome row |
| g6 `#858585` | g0 | **5.69** | Inactive tab labels (11pt) |
| g0 `#000000` | g10 `#FFFFFF` | **21.00** | All primary text on the page. Ink in a white plate on chrome. |
| g0 | g9 `#F4F4F4` | **19.09** | Text on a pressed page row |
| g4 `#5E5E5E` | g10 | **6.48** | Secondary text on the page. Names of drinks not yet caught. Outlined plate digits. |
| g4 | g9 | **5.90** | Secondary text on a pressed page row |

UI parts and glyphs (target 3:1):

| Mark | Ground | Ratio |
|---|---|---|
| g5 control edge (field, chip, outline key, gauge well) | g0 | **4.12** |
| g5 field edge, measured against the field's own fill | g1 | **3.67** |
| g6 checkbox edge, outlined-plate edge, rail ticks | g10 / g9 | **3.69 / 3.35** |
| g6 search glyph in a field | g1 | **5.08** |
| g6 inactive tab glyph | g0 | **5.69** |
| g10 unseen story ring (2pt), active-tab marker, focus ring, gauge marks | g0 / g1 | **21.00 / 18.73** |
| g10 meter fill | g2 track | **16.48** |
| g7 meter rung ticks | g0 | **8.33** |
| g0 liked heart, section rule, tab strip underline, focus ring on the page | g10 | **21.00** |
| g10 tick box inside a ticked (g0) cell | g0 | **21.00** |
| g0 tick glyph inside that white box | g10 | **21.00** |

Decorative only (they carry no information; check-contrast should list them so nobody later puts text on them):

| Mark | Ground | Ratio | Where |
|---|---|---|---|
| g3 hairline | g0 | 1.55 | |
| g8 hairline | g10 | 1.19 | |
| g9 proof ground | g10 | 1.10 | |
| g5 seen story ring | g0 | 4.12 | The ring's weight (1pt against 2pt) also carries the state |
| g2 meter track | g0 | 1.27 | The fill and the figures carry the value |

Never (check-contrast should assert that each of these fails):

| Pair | Ratio | Why it fails |
|---|---|---|
| g7 on g10 | 2.52 | The chrome's muted ink can't cross onto the page |
| g6 as text under 18pt on g10 or g9 | 3.69 / 3.35 | Too low for small text |
| g6 label on g2 | 4.47 | The tab bar answers a press with its glyph, not a fill (§4.2) |
| g5 as text anywhere | 4.12 on g0 | Below 4.5 |
| g3, g8, g9 as text | | Decorative greys only |
| Any text on a photograph | | Over a photo there is only ever a solid plate, and its text is measured against the plate (21:1) |

### 1.3 What leaves the palette

`wine`, `wineDeep`, `merlot`, `wineSoft`, `wineWash`, `taupe`, `taupeInk`, `amber`, every `brass*` token, `walnut*`, `label`, `onWalnutMuted`, `storyRing`, `lining*`, `mat`, `matEdge`, `slot*`, `emboss*`, `deboss*`, `ghostHi`, `faceCocktail`, `faceSpirit`, `filmPaper` (see §9), `glyphTint`, `walnutTile`, `grain`, the `danger*` reds, `record`, and the CATEGORY_META hues.

**Semantic colour without hue:**
- **Affirmative** (caught, ticked, liked, following) is the inverse fill plus a shape: a filled plate, a filled cell with a tick, a filled heart.
- **Destructive actions** ("Remove from collection", "Clear your bar") are black text with a leading minus glyph, and every one confirms through the native `Alert`. Its destructive button is iOS's own red. That's the system's colour, not one of ours.
- **Errors** get a 2pt g0 ring, an error glyph and a sentence. The words carry the error, never colour.

**Quotations stay:** `facebook` `#0866FF` + `onFacebook`, the four Google mark colours, and `appleFill`. Each appears only on its own sign-in button, because a third party's mark is drawn the way that company publishes it.

**Avatars:** `SIGNUP_ACCENTS` stops being read for colour. An initials disc takes g0, g3 or g4, chosen by a stable hash of the user id (white initials: 21.00, 13.58 and 6.48). Stored hex values stay in the database untouched. Photo avatars stay in colour, because they are photographs.

---

## 2. Type

### 2.1 Families

No new font. Both families are already on disk as Latin subsets (`assets/fonts/`), both OFL:

- **Playfair Display** 700 (`PlayfairDisplayLatin_700Bold`) for the wordmark and drink names, and **600** (`PlayfairDisplayLatin_600SemiBold`) only for the names of drinks you don't hold yet.
  - Why keep it: a Didone's thick and thin strokes are themselves a black-and-white form, and on a white page at 30 to 52pt it reads as a fashion masthead.
  - In Split it gets more room and tighter tracking (−0.3 to −0.8 at display sizes).
  - The lighter 600 cut in g4 is a second "not yet" cue next to the grey proof.
- **Inter** 400/500/600 for everything else. Large figures are set tight (−1.6 to −2) and tabular, the way Apple and Nothing set numbers.

Rejected:
- A mono for the plates: a third family just for four digits. Inter's tabular figures plus 1.2pt tracking already read as a catalogue code.
- Instrument Serif and other condensed display serifs: too narrow for two-line card names in a 128pt column, and very 2025.

### 2.2 Scale (new and changed `textRole` entries; every other role keeps its size)

| Role | Family | Size / line | Tracking | Where |
|---|---|---|---|---|
| `wordmark` | Playfair 700 | 27/32 | −0.3 | Home masthead |
| `nameplate` | Playfair 700 | 30/34 | −0.4 | The drink's name under a feed print |
| `drinkHero` | Playfair 700 | 52/56 | −0.8 | The drink page, under its print (not mocked) |
| `rowName` | Playfair 700 | 18/22 | 0 | + window results, One ingredient away |
| `cardName` | Playfair 700 / 600 | 16/19 | −0.1 | Dex cells, You can make strip (600 + g4 when not caught) |
| `nameInline` | Playfair 700 | (inherits) | | "theo_stirs's *Paper Plane*" |
| `figureLg` | Inter 600 tabular | 52/50 | −2 | The Dex head "38" |
| `figure` | Inter 600 tabular | 44/44 | −1.6 | The Profile Dex figure |
| `screenTitle` | Inter 600 | 26/32 | −0.6 | "What's in your bar?" |
| `sectionTitle` | Inter 600 | 20/24 | −0.3 | "You can make", with its count in g4 |
| `barTitle` | Inter 600 | 17/22 | −0.2 | Every top bar |
| `countFigure` | Inter 600 tabular | 21/26 | −0.3 | Profile counts |
| `username` | Inter 600 | 14/18 | 0 | Post headers. Likers rows use 15/20. |
| `bodySm` | Inter 400 | 14/20 | 0 | Bio, "Liked by…", live lines |
| `caption` | Inter 400 | 13/18 | 0 | Row subtitles, the tray head |
| `meta` | Inter 400 | 12/16 | 0 | Location, dateline, cell subtitles |
| `plate` | Inter 500 tabular | 11/14 | +1.2 | "Nº 0127" in sm plates (20pt tall) |
| `plateLg` | Inter 500 tabular | 12/16 | +1.3 | lg plates and split plates (24pt tall) |
| `index` | Inter 500 tabular | 11/14 | +1 | "0001 – 0003", rank numerals "01" |
| `kicker` | Inter 500 | 12/16 | +0.6 | "latest catch", "rank", "best matches": lowercase, at most one per screen |
| `tag` | Inter 500 | 11/14 | +0.2 | Tab labels, "In their Dex" |

The rules carry over unchanged:
- No uppercase anywhere. Tracking is used only on figure codes and the lowercase kicker (tracking-ok).
- The 11pt floor holds.
- "Nº" is `N` + U+00BA. Never use U+2116, which isn't in the subset.
- Names wrap and never truncate (DrinkName).
- Plates cap Dynamic Type at 1.3.

---

## 3. Space, radius, stroke, elevation

**Space:** the 4pt rhythm is unchanged.
- `layout.gutter` stays 16.
- New `layout.printInset` is **24**: feed and post photos and their text column. This is Brass D5's print, kept because the margin is what makes a photo read as a print on a page.
- Dex grid gap 8 (was 10). Profile grid gap 2.
- A section opens 20 below the content above it, with a 2pt rule and then 10 to its head.
- Rows:

| Row | Height |
|---|---|
| Likers | 60 |
| + window results | 64 |
| Checklist cells | min 52, and they grow with text |
| Feed header | 40 |

**Radius** (replaces `badge 4 / control 8 / card 12`). Split is cut, not rounded:

| Token | Value | For |
|---|---|---|
| `none` | 0 | Photos, tiles, proofs, chrome bars, the docked tab bar, plates cut flush into a tile corner |
| `hair` | 2 | Everything interactive or tag-shaped: keys, the + key, chips, fields, checkboxes, plates, tags, checklist cells. The grabber is 1. |
| `sheet` | 10 | The likers sheet's top corners (UIKit's own `pageSheet` shape) |
| `round` | 999 | Avatars, story rings and discs, the + badge, dots (`round-ok` unchanged) |

**Stroke:**

| Token | Width | For |
|---|---|---|
| `edge` | 1 | Every edge and hairline: g8 on the page, g3 on chrome, g5 or g6 on controls |
| `indicator` | 2 | Active-tab marker, tab strip underline, focus ring, the unseen story ring |
| `rule` (new) | 2 | The black section rule on the page |

Nothing else.

**Elevation: none.** The `elevation` object is deleted, and check-design rule 12 becomes "no shadow prop anywhere".
- The tab bar is docked, so nothing floats.
- The sheet separates by the scrim and its black head.
- The Dex back-to-top button is a black 44 × 44 key on the white grid, which is already 21:1.
- This also removes every `boxShadow` from scrolling cells, which is the performance win in §8.

---

## 4. Components, one by one

### 4.1 Chrome: top bars and heads
- `ScreenTopBar`: always g0 with a g10 title and glyphs. The `tone` prop and `showRule` go: a black bar meeting a white page is already the edge, so there is no rail and no fade. The status bar style is `light` everywhere, set once in `_layout.tsx` instead of per screen.
- Each tab's head stays on the black; the white begins where the tab's own content begins:

| Tab | On the black |
|---|---|
| Home | Masthead and stories |
| Dex | Figure, gauge, search and chips |
| My Bar | Heading, live line, search and chips |
| Profile | Avatar, counts, bio, keys and Dex meter |

  - These heads scroll with their content (as today). The 44pt bar stays pinned and opaque.
- Home: when `HomeChrome`'s bar slides back over the feed, it is opaque g0. The bar tail, strip tail, `homeBarTop` / `homeBarFoot` and the rail are deleted.

### 4.2 Tab bar (`FloatingTabBar` → docked)
- `layout.tabBarInset` becomes 0 and the radius 0. The bar is 64 tall plus the safe area, on g0, with no shadow and no keyline. It is the black foot of every page.
- Five items as today:
  - **Active**: filled glyph, g10 label in Inter 600, and a 20 × 2 g10 marker 4pt below the bar's top edge. The marker still follows the pager natively (three cues, not colour alone).
  - **Inactive**: g6 outline glyph and g6 label.
  - **Pressed**: the glyph goes g10 for the press. There is no fill, because g6 on g2 is 4.47.
- **The + is the bar's one white key**: 52 × 38, g10, radius 2, a 2pt g0 plus.
- Profile shows a 26pt avatar. When active it gets a 1.5pt g10 ring with a 1.5pt g0 gap.
- `TAB_BAR_CLEARANCE` = 64 + bottom inset. Content no longer shows past the bar's sides.
- Fallback if Jan wants the floating bar back: `tabBarInset: 12`, radius 2. Everything else stands.

### 4.3 Plates (`BrassPlate` + `LabelTag` → `Plate`, `components/split/Plate.tsx`)
One View and one Text, no SVG. Tones:

| Tone | Fill | Text | Edge | Where |
|---|---|---|---|---|
| `ink` | g0 | g10 | | A caught drink on the page and over photos (solid, 21:1 against itself) |
| `paper` | g10 | g0 | | A caught drink on chrome: likers sheet head, + window, My Bar's "12 ticked" |
| `holder` | g10 | g4 | 1pt g6 | Not caught, on the page or a proof |
| `holderDark` | transparent | g7 | 1pt g5 | Not caught, on chrome |

- **Sizes**: `sm` (20pt, `plate`) and `lg` (24pt, `plateLg`).
- **`corner`**: radius 0, absolutely placed flush at a tile's top-left (Dex, strip) or bottom-left (Profile grid). This replaces mounts, keylines and bevels in one gesture.
- **Split plate** (`status`): the number cell plus a second cell, "✓ In your Dex", in the opposite tone with a 1pt edge in the number cell's colour. On the page that is black then white. In the mock it sits to the right of the drink's name under a feed print. This is where the direction's name shows up in the components.
- Decorative to VoiceOver, as before: the card speaks "number 127".

### 4.4 Feed post (`PostCard`)
- Header: 32pt avatar, username, "· 2h", location in g4, ···.
- The print: inset 24, 4:5, radius 0, no edge. The studio photo's grey seamless is already distinct from white.
- Under the print: a row with the name in `nameplate` and the split plate right-aligned.
  - This deletes both scrims, `DexStatusPlaque`, `MediaNumberPlate` and the brackets. **No text ever sits on a photo in the feed**, so no contrast depends on the photo.
- Actions: heart (filled g0 when liked), comment, send, bookmark. Then "Liked by **maya.pours** and **12 others**" with three 18pt faces separated by 1.5pt g10 rings, then the caption.

### 4.5 Stories (on chrome)
- 62pt ring box, 52pt photo disc.
- Unseen: 2pt g10 ring. Seen: 1pt g5 ring with a g7 label.
- "You": a g3 disc with initials and a 22pt g10 badge with a g0 plus inside a 2pt g0 ring.

### 4.6 Dex
- **Head on chrome**:
  - "38" in `figureLg`, then "in your Dex" and "of 2,089 · 1.8%" (g7). On the right, the kicker "latest catch" and the name in Playfair 17.
  - **The map gauge** (`BrassGauge` → `Gauge variant="map"`): a 12pt g1 well with a 1pt g5 edge. One g10 mark at every caught drink's Dex number (graft 1's bucketing and single Path, unchanged). Ticks every 5% under the well, 3pt in g5 and 5pt at each 10%. Figures 0, 500, 1,000, 1,500 and 2,089 in g7, positioned with RN Text.
  - Search field, then the chips.
- **The page**:
  - Tray head: "In Dex order" on the left, "38 of 2,089 collected" on the right, g4 `caption`.
  - Rows of three. Each row opens with an **index rule**: "0001 – 0003" in `index` g4 plus a g8 hairline to the edge. This is Brass's shelf label holder without the shelf. The row component draws its own rule, so no `leadingItem` bookkeeping is needed.
- **Cell** (`DexCard`):
  - A 128pt square: the photo if caught, the proof on g9 if not. With no photo at all, the vector face is drawn as a g6 line glass on g9.
  - A corner plate (`ink` or `holder`).
  - The name below in `cardName`.
  - No mount, mat, keyline, bevel, recess or seat shadow. The spoken label is unchanged.
- **Number rail** (graft 2): a 1pt g8 line down the right gutter with g6 ticks every 100 (500 longer) and a 5 × 16 g0 position mark. Dragging shows an `ink` plate beside the finger, as today.
- Back-to-top: a g0 44pt key with a g10 arrow.

### 4.7 My Bar
- **Head on chrome**:
  - "What's in your bar?" (`screenTitle`), and the "12 ticked" `paper` plate.
  - The live line "12 in your bar · makes **30** drinks". The count is g10, the rest g7.
  - Search field, then chips: All · In your bar 12 · the category chips.
- **Checklist** (`BarPicker` `CheckRow`): two columns at ≥ 375pt and one column at accessibility text sizes. Each cell is min 52pt, radius 2, and the whole cell is the checkbox (`accessibilityRole="checkbox"`).

| State | Cell | Box | Label | Subtitle | Rank "01" |
|---|---|---|---|---|---|
| Ticked | g0 | 20pt g10 box with a g0 tick (the inverse twice) | g10, Inter 500 15/19 | "in 173 drinks" in g7 | g7, top right |
| Unticked | g10 with a g8 edge | 1pt g6 box | g0 | g4 | g4, top right |

  - The state is shape plus fill, never colour alone.
  - **The ingredient glyphs go.** Their job was to let you scan by tint and shape. In one ink at 16pt they stopped reading, and black against white cells already scans by state at a glance.
- Under the list: "Sweet vermouth, Dry vermouth and 482 more" in g4, and a "Show 20 more ›" text key in g0 600.
- **Section heads** (`SpoonRule` → `SectionHead`): a 2pt g0 rule, then "You can make" with "30" in g4, and "See all" underlined (1pt, offset 3).
- **You can make**: a strip of 112pt tiles with corner plates and the name below.
- **One ingredient away**: rows with a 56pt thumb (colour if caught, proof if not), the name in `rowName` plus an `sm` plate, "Needs orange · orange pours 5 more" in g4, and a "+ Orange" outline key (1pt g0, 32 tall). Once added, the key turns ink with "Added ✓".

### 4.8 The + window (`log.tsx`)
- **The whole window is chrome** (g0). It is a full-screen modal that rises as one black sheet, so it reads as a different place from the white pages it covers.
- Top bar: X ("Close") and "Post a drink".
- The search row is pinned:
  - On the left, a 44pt print of the picked photo: radius 0, a colour photo, because the user took it.
  - The field: g1, a 1pt g5 edge, and when focused a 2pt g10 ring as an overlay so the layout never moves. Typed text is g10 and the clear key is a g5 disc with a g0 ×.
- **Find mode** (as in v3.3 §4):
  - A "best matches" kicker, then the result rows above the keyboard:
    - Thumb 48: photo, proof, or the vector face as a g6 line glass on g1 with a 1pt g3 edge.
    - The name in `rowName` g10, and "Spirit-forward · Florence, Italy" in g7.
    - On the right, a plate (`paper` if caught, `holderDark` if not) over "In your Dex" or "New catch" in g7, 11pt.
  - Rows are separated by 1pt g3 hairlines.
  - Footer: "Showing the best 6 of 9. Not the one? **Add "neg"**".
- **Keyboard**: `keyboardAppearance="dark"` on every field in the app, because every field now sits on chrome. Use `returnKeyType="default"`: results are live, so there is nothing to submit, and the default "return" key is grey. A "search" or "done" key would paint iOS's blue onto the one surface we don't draw.
- **Compose mode**:
  - The photo well on g1 with a 1pt g5 edge.
  - Caption field: g1.
  - **Save to Dex** is a g10 key with g0 text (the inverse primary, 48 tall). **Save & post** is a g5 outline key.
  - The collect preview shows the drink's proof switching to colour.
- The in-window `CelebrationOverlay` shows the photo crossfading from proof to colour (expo-image `transition`, native) and the plate filling from outline to `paper`. **The catch is the moment colour arrives.**

### 4.9 Likers sheet (`LikersSheet`)
- `pageSheet`, medium detent first, as specified.
- **Black head**:
  - Grabber: 36 × 4, g5, radius 1.
  - "Liked by" (Inter 600 20/24), then "24 people liked theo_stirs's *Paper Plane*" in g7 with the name in Playfair g10.
  - An `lg` `paper` plate "Nº 0107", and a chrome search field (40 tall).
- **White list**: 60pt rows with a 40pt avatar, the name (Inter 600 15/20, "(you)" in g4) and the username in g4 13.
  - When it applies, a tag: "✓ In their Dex" / "✓ In your Dex", 18 tall, 1pt g0 edge, 11pt.
  - **Follow** is a g0 key with g10 text, 96 × 32. **Following** is an outline key with a 1pt g0 edge. Your own row has no key.
  - Separators: 1pt g8, inset 16.

### 4.10 Profile
- **Masthead on chrome**:
  - Avatar: a 76pt disc inside an 86pt box with a 1pt g10 ring. This replaces the brass bezel.
  - Counts in `countFigure` g10 with g7 labels, split by 1pt g3 rules.
  - The name (Inter 600 16) and the bio in g7.
  - **Edit profile** and **Share profile**: two equal outline keys (1pt g5, g10 text, 36 tall).
  - A 1pt g3 rule.
- **The Dex meter** (`DexPlaque` → `DexMeter`):
  - "38" in `figure`, then "of 2,089 in the Dex · 1.8%" in g7. On the right, "rank" (kicker) and "First Sips" (g10, Inter 600 15).
  - A 4pt g2 track **filled in g10 to the count** (minimum 3pt).
  - A 1pt g7 tick, 14 tall, at each rung of the ladder from `lib/milestones` (209, 523, 1,045, 1,567), labelled in g7, with 2,089 at the end.
  - Under it: "171 more to **Barfly in Training**, at 209".
  - **Changed from Brass:** the plaque's gauge plotted Dex numbers on a count axis. Here the Profile shows *how far* (a fill against the rungs) and the Dex head shows *where* (the map). Same data, one meaning per gauge.
- **White page**:
  - TabStrip: the active label in g0 600 with a 56 × 2 g0 underline, the inactive one in g4, and a g8 rule under the strip.
  - Grid: 4:5 tiles with 2pt gaps and an `ink` corner plate flush at the bottom-left.

### 4.11 Not mocked: the same kit applies
- **Drink page**: the top bar is chrome and the body white. The print sits at the top (4:5, full width), with the name in `drinkHero` and a split plate under it. Each section ("The spec", "Origin story") opens with a 2pt rule. The pinned action bar is chrome with a g10 primary key. The cellar dissolve is gone.
- **Sign-in**: the backdrop is g0 with `wordmarkLg` in g10. The Apple, Google and Facebook buttons stay as quotations.
- **Settings-class screens**: chrome bar, white body, list groups with g8 edges.
- **Activity**: rows like the likers rows.
- **Reels** (flag off): already black. `record` would become a g10 shape: a circle to record, a square to stop.

---

## 5. What survives from Brass, and how

| Brass piece | Split | Why |
|---|---|---|
| D1 engraved Nº plate | **Survives** as the inverse `Plate`: black on the page, white on chrome, flush in tile corners | It is data: the number is how the Dex is indexed |
| D2 empty plate holder | **Survives** as `holder` / `holderDark` (outlined) | A state cue that doesn't rely on colour |
| D9 shelf label holder ("0001 – 0003") | **Survives** as the index rule above each row | It still says where you are in a fast scroll |
| Graft 2 number rail | **Survives**: 1pt g8 rule with g6 ticks | Function: the way to the back of the book |
| D12 gauge + graft 1 marks | **Survives** on the Dex as the white-mark map. On the Profile it becomes a fill meter with rung ticks. | Data. One meaning per gauge (§4.10). |
| D13 plaque contents (figure, rank, next rung) | **Survive**. The walnut and keyline go. | Data |
| D15 count separators | **Survive** as g3 hairlines | |
| D18 likers sheet | **Survives** whole. The tags become outlined, the keys squared. | A feature |
| Graft 6 dateline | **Survives** under the wordmark | Editorial: a masthead and its date |
| Rank numerals, the kicker | **Survive** in g4 / g7 | Data and voice |
| D5 the print (inset photo) | **Survives** at 24 | The margin makes a photo a print on a page |
| D11 tab marker | **Survives** as a g10 bar. The keyline goes. | Function |
| D14 avatar bezel | Becomes a 1pt hairline ring | Ornament reduced to an edge |
| D4 corner brackets | **Go** | Ornament. The black and white edges already frame everything. |
| D6 chamfered bottle labels | **Go** → squared inverse cells and outlined tags | A costume shape |
| D7 bar-spoon rule | **Goes** → the 2pt section rule | Ornament becomes typography |
| D8, D9, D13, D19 walnut | **Go** (`walnut.webp` and `build-walnut.py` retire) | A material costume |
| D10 brass rail | **Goes**. The black bar against white is the edge. | |
| D3 mount keyline, D17 bevel, D16 author hairline | **Go** | |
| D20 search well | Becomes the chrome field | |
| Graft 3 ingredient glyphs | **Go** | One ink kills their scan value (§4.7) |
| Paper and lining grain | **Go** | Flat is the point |
| The tungsten re-light | **Goes** → studio masters | §7 |

---

## 6. Dark and light

**One scheme in both system appearances.** `userInterfaceStyle` stays `"light"`.
- **The split is the identity.** If the pages went black under system dark mode, chrome and page would merge, and every inverse (plates, ticked cells, Follow) would flip its meaning.
- **It is already night-friendly.** The black chrome takes a third to half of every screen, all of the + window, the sheet heads and the tab bar, and on OLED those pixels are off.
- **The photos wouldn't sit well on black.** They are bright studio frames on a grey seamless, and on a black page they would glare.
- **What is fixed instead of switched:**
  - Status bar is `light` on every screen.
  - `keyboardAppearance="dark"` on every field.
  - System alerts and action sheets stay light, as iOS draws them for a light app.
- **Increase Contrast** (`AccessibilityInfo` high contrast): the muted inks step up one stop, g7 → `#BDBDBD` on chrome and g4 → `#404040` on the page. The edges stay.
- A "night pages" variant (page g10 → `#0A0A0A`) was considered and is not recommended for the reasons above.

---

## 7. Photographs

**Full colour, re-graded.** The tungsten re-light (`scripts/lib/tungsten.py`) is Cabinet art direction baked into pixels:
- a brown pool wall (`#7C5642`),
- a `#2F070D` wine edge on every photo,
- a warm cast on the glass.

In a monochrome app that grade would be the largest block of wine and brown left on screen. The studio masters the bake starts from (`~/Desktop/CLINK DEX PHOTOS`, 1024px, one per drink) are already a neutral cool-grey seamless and stone, so **the drink is the only colour in the frame**. The mock uses them unmodified (`img/*.jpg`).

**Pipeline change** (`scripts/build-drink-photos.mjs`):
- **A new `--grade studio`.** The masters are re-encoded as they are at 1024 q82. Today's `--grade off` already does exactly this, but only for QA.
- **The seam gate and `SETTLE` retire**, because nothing dissolves into a dark ground any more.
- **The ghost bake becomes the proof bake** (`tools/proofs.py` is the reference):
  - Take the luminance only and compress it into 186–244, with the master's seamless (≈ 0.80 luminance) landing on 244, which is g9. A proof therefore meets its g9 tile with no visible seam.
  - 256px, q80, the same size and decode cost as today's ghost.
  - `ghostHi` retires.
- Drinks without a master keep the vector face, redrawn as a line glass in g6 on g9 (page) or g1 (chrome).

**Trade:** about 163 photos re-encode, and the drink page loses its photo-dissolves-into-cellar hero, which becomes a print on white. No new photography and no generation.

---

## 8. Performance

Split is **cheaper than Brass on every screen**.

| Removed | Saving |
|---|---|
| The walnut bitmap | 1.3 MB decoded, shared |
| Two grain tiles | |
| Every bracket, label, spoon, bezel and gauge-plaque SVG | |
| Keylines and bevels | 3 Views per Dex card |
| Every shadow | Including `seat` and `recess` on scrolling cells |
| The `VerticalFade` SVGs | |
| The feed's two scrim gradients per post | |

| Added | Cost |
|---|---|
| A plate | 1 View + 1 Text |
| An index rule | 1 Text + 1 View per Dex row |
| The Profile meter | Views only, replacing an Svg |

- **Per Dex cell**: 1 expo-image, 1 plate, 1 name. A proof is 256px (0.26 MB decoded), the same as today's ghost. A caught tile at 128pt is resized early to 384px (0.59 MB). `enforceEarlyResizing` and per-size `cacheKey` are unchanged.
- **Nothing translucent or blurred**: the chrome is opaque g0 (no BlurView) and the sheet uses one flat scrim.
- **No gradients anywhere**, so the "no top gradients" rule holds trivially.
- **Static**: nothing new animates. The tab marker's native-driven `translateX` and the expo-image crossfade are the only motion, as in v3.3 §0.
- **The status bar never toggles**, which saves a `StatusBar` update per focus change.

---

## 9. For the build (packages, guards, open points)

**`theme.ts`:**
- Add the ramp and the role tokens from §1.1.
- Re-point the old tokens whose job is unchanged for one build: `bg`/`surface`/`card` → page, `text` → ink, `textMuted` → g4, `textFaint`/`lineControl` → g6, `line` → g8, `onLining` → g10, `onLiningMuted` → g7.
- **Delete** every token whose job is gone (brass, walnut, wine, label, grain, lining materials), so `tsc` lists each call site that has to change. Repeat the theme.ts header's warning in the commit: re-valuing is deliberate here because the jobs are identical.
- `CATEGORY_META` colour → g0, wash → g9.
- `radius` and `stroke` as §3. `elevation` is deleted.

**Guards:**
- **check-contrast**: every pair in §1.2, the "never" list as asserted failures, and composite pairs for the scrim.
- **check-design**, new rules:
  - (a) Every `#RRGGBB` and `rgba()` in `colors` is neutral (R = G = B), except the quotation tokens (Facebook, Google, Apple). This enforces black and white mechanically.
  - (b) No shadow props.
  - (c) Radius values are only 0, 1, 2, 10 or `round`.
  - (d) g5, g6, g3, g8 and g9 are never the `color` of a Text under 18pt (g6 is allowed only for the tab label on g0 and for glyphs).
  - Rule 6 (Playfair discipline) is unchanged. The 600 cut joins the allowed name roles.

**Open points for Jan:**
1. **Docked tab bar** in place of floating (§4.2). The one-token fallback is written down.
2. **Studio photos in place of the tungsten re-light** (§7). This is the one decision that touches assets.
3. **The intro film** (`assets/video/intro.mp4`, `filmPaper` `#D6C4B1`) is warm paper. Under Split it either gets re-graded to grey or stays as the one warm moment before the app opens.
4. **The Facebook button** stays blue as a quotation, the one hue left in the app, and only on the sign-in screen. Check Meta's current button guidelines before drawing it any other way.
