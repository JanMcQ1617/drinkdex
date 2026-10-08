# v3.3 direction "glow": Lit glass and tungsten

Status: **direction mockup**, written 7 Oct 2026 against build 17 (v3.1 tokens in `src/constants/theme.ts`, `specs/v3-cabinet.md`, `specs/v3.1-changes.md`). Not build-ready: it is one of the v3.3 directions answering Jan's 7 Oct complaint that the app is "either burgundy or cream" and needs details on every page. It mocks the structure being built now: Home · Dex · + · My Bar · Profile (tabs swipe sideways), one Dex grid in number order, the My Bar checklist, the likers sheet.

Files (all in this folder):

| File | What |
|---|---|
| `index.html` | The wall: five screens at 440×956 plus a sixth frame (Home scrolled up), the new inks, and each drink's sampled light. `index.html#home`, `#dex`, `#bar`, `#post`, `#profile`, `#scrolled` show one screen alone |
| `contact.png` | The wall, 2920×1520 |
| `home.png` `dex.png` `bar.png` `post.png` `profile.png` `scrolled.png` | One screen each, 880×1912 (2x) |
| `build.py` | Writes `index.html` from `src/data/drinks.json`, `img/glow.json` and `style.css`. Photos and fonts load by relative path from `assets/` |
| `contrast.py` | Every text and glyph pair in the mockups, composited and measured (section 2 is its output) |
| `render.sh` | Headless Chrome with its own throwaway profile; kills only its own processes and deletes the profile |
| `img/glow.json` | The sampled light of all 162 photographed drinks (section 3) |
| `img/caustic-tile.png`, `img/caustic-patch.png` | The caustic textures (white plus alpha, tinted at runtime) |
| `img/grain-*.png` | `assets/images/grain.png` at the lining (0.77) and paper (0.35) opacities, for the mockup only |

Data is real throughout. Names and numbers come from `drinks.json`: #0001 Caesar to #0012 Miami Vice, Negroni #0127, Aviation #0092, and so on. My Bar's figures come from `lib/bar.ts`'s matching run on `barIndex.json`. A bar of gin, vodka, white rum, bourbon, sweet vermouth, lemon, lime, sugar syrup, Angostura, soda water, orange, triple sec, mint and Campari (14 ticked) makes **44** drinks. Dry vermouth is the top one-away entry: it pours 11 more, including Martini and Bronx. The checklist uses `barIndex.json`'s order, and "in N drinks" is `reachOf`. People and the 137-drink collection are invented.

---

## 0. The idea

Build 17 has two flat grounds, wine lining and cream paper, and everything sits on one or the other. This direction keeps both grounds and every existing token. It adds one thing on top of them: **light**, from three sources.

1. **Each drink's own light.** The colour of a drink is sampled once from its photograph at build time. That light then shows wherever the drink appears:
   - its glow on the lining under a Dex card;
   - the colour it spills onto the paper around a feed photo;
   - the ring of the story it is in;
   - the halo of the profile whose latest catch it is;
   - its mark on the Dex spectrum;
   - the key strip under its tile in a profile grid.

   A Negroni lights things red-orange, a Grasshopper mint, an Aviation violet, a Gin Fizz ice. The screens stop being two-tone because the drinks colour them.
2. **Tungsten, the room light.** Amber pools from overhead lamps sit on the lining behind titles and hero figures. Tungsten is also the ink of a lit figure: "44" drinks you can make, "6.6%", the tally.
3. **Ice, the cool accent.** It works against wine and bone: the edge-lit lip of every glass shelf, the active-tab filament, "In your Dex" checks, "#0127 in their Dex" tags, the "+ Add" action.

Chrome becomes **glass**: smoked glass for the tab bar and plates over photos, wine glass for bars once you scroll. Every pane has a **hard 1pt edge and no fade**, which is Jan's "everything except the gradient". The app's top gradient is deleted outright (section 7).

It stays the same product. It keeps:
- paper for reading and lining for collecting;
- bone mounts in the Dex;
- the floating tab bar, Instagram's Home and Profile structure, and squared buttons with 1pt edges;
- Playfair for names and the wordmark only;
- no uppercase and no rarity.

## 1. Rules: kept, and the one this direction asks Jan to change

Kept as written: no pills except avatars, story circles, the shutter and dots, and 8pt-radius buttons with 1pt edges. No uppercase. Playfair only through the name roles and the wordmark (every Playfair glyph in the mockups is a drink name or "Sipply"). The 11pt floor. Rarity stays removed (v3.1 §7). There are no layout entrance animations and nothing new moves (section 8). Every text pair passes AA and is measured below.

**Changed, on purpose:** v3 §1.1 says "No glows, no glass, no blur halos." This direction reverses that, under three limits:
- **A glow is only ever light from a drink or a lamp.** There are no mood fields and nothing coloured that a drink did not cast.
- **Glass is only chrome**: bars, the tab bar, plates, sheets, the search field. Never content.
- **Gradients exist only as light falloff.** That means lamp pools and the drink's own glow. No gradient ever sits under a bar, at the top of a screen or over a photo (section 7).

If Jan wants the v3 rule kept, this direction does not apply.

## 2. Palette and contrast

The grounds are unchanged: paper `#F7F2EA`, mat `#FBF8F2`, lining `#3E0A12`, cellar `#2F070D`. New tokens:

| Token | Value | Job |
|---|---|---|
| `tungsten` | `#E9B26A` | Lamp light; lit figures and the meniscus on lining, cellar and glass |
| `tungstenInk` | `#8A5A12` | The same light as ink on paper and mat (Profile tab counts) |
| `ice` | `#A9DDEB` | Cool accent on dark grounds: glyphs, tags, "+ Add", the tab filament |
| `iceInk` | `#1B5868` | Ice as ink on paper and mat (tags and links on paper) |
| `rose` | `#D9848E` | Lit wine for glyphs on dark (heart, unread dot), because wine on lining is 1.22:1. **Glyph only** |
| `glassInkMuted` | `#C9BDB6` | Secondary text on glass over a photo (nameplate subline) |
| `smokeGlass` | `rgba(24,14,16,.84)` | Tab bar slab |
| `wineGlass` | `rgba(47,7,13,.95)` | Any top bar once its screen scrolls (replaces `homeBarTop`/`homeBarFoot`) |
| `frostTint` | `rgba(47,7,13,.74)` | Tint over a blurred copy of a known photo (post page bar) |
| `sheetTint` | `rgba(30,12,16,.86)` | Tint over the blurred photo in the likers sheet (floor 0.84, see below) |
| `glassHi` | `rgba(255,253,249,.16)` | The 1pt lit lip along a pane's edge |
| `glassEdge` | `rgba(255,253,249,.22)` | A plate's 1pt edge over a photo |
| `iceEdge` | `rgba(169,221,235,.38)` | The ice lip of a glass shelf; ice tag and "+ Add" edges |
| `lampPool` | `rgba(233,178,106,.12)` | Peak of a lamp pool (radial, 0.12 → 0.05 at 55% → 0) |
| `light(drink)` | generated | Each drink's own light (section 3) |

Plates and markers over photos keep `onMedia.markerFill` (0.78), so the v3 rule that text over media sits on alpha ≥ 0.62 still holds.

Every pair used. The ground column is the worst real pixel: the brightest or darkest grain pixel from v3 §4, a glass composited over a white photo, or a lamp pool's peak over the brightest grain. Output of `contrast.py`, 0 failures:

| Text | Ground (composited) | Hex of ground | Ratio | Needs | Where |
|---|---|---|---|---|---|
| tungsten `#E9B26A` | lining | `#3E0A12` | 8.78 | 4.5 | "You can make 44", "6.6%", tally figure |
| tungsten `#E9B26A` | lining, worst grain | `#4B1B23` | 7.46 | 4.5 |  |
| tungsten `#E9B26A` | lamp pool peak over worst lining grain | `#5E2D2C` | 5.85 | 4.5 | a figure inside a pool |
| tungsten `#E9B26A` | tally / panel (.30 smoke) over worst lining grain | `#39161C` | 8.46 | 4.5 | tally, Dex panel % |
| tungsten `#E9B26A` | cellar | `#2F070D` | 9.54 | 4.5 |  |
| tungsten ink `#8A5A12` | paper | `#F7F2EA` | 5.31 | 4.5 | figures on paper (Profile tab counts) |
| tungsten ink `#8A5A12` | paper, worst grain | `#EFEBE3` | 4.97 | 4.5 |  |
| tungsten ink `#8A5A12` | mat | `#FBF8F2` | 5.58 | 4.5 |  |
| ice `#A9DDEB` | lining | `#3E0A12` | 11.32 | 4.5 | "+ Add", chip check, glyphs |
| ice `#A9DDEB` | lining, worst grain | `#4B1B23` | 9.61 | 4.5 |  |
| ice `#A9DDEB` | ice button fill over lining | `#44171F` | 10.25 | 4.5 | "+ Add" label |
| ice `#A9DDEB` | ice tag over sheet over white | `#473C40` | 7.16 | 4.5 | "#0127 in their Dex" tag |
| ice `#A9DDEB` | marker over white | `#434141` | 6.87 | 4.5 | check on the "In your Dex" plate |
| ice `#A9DDEB` | smoke glass over white | `#3D3536` | 8.08 | 3.0 | active-tab filament (UI) |
| ice ink `#1B5868` | paper | `#F7F2EA` | 7.13 | 4.5 | ice on paper (tags, links) |
| ice ink `#1B5868` | paper, worst grain | `#EFEBE3` | 6.68 | 4.5 |  |
| ice ink `#1B5868` | mat | `#FBF8F2` | 7.50 | 4.5 |  |
| rose `#D9848E` | lining, worst grain | `#4B1B23` | 5.16 | 3.0 | heart glyph, unread dot (glyph only) |
| rose `#D9848E` | sheet tint over a white blur | `#3E2E31` | 4.66 | 3.0 | heart in the sheet title |
| onLining `#E9E5DF` | sheet tint over a white blur | `#3E2E31` | 10.21 | 4.5 | sheet titles, names |
| onLiningMuted `#B8A09B` | sheet tint over a white blur | `#3E2E31` | 5.21 | 4.5 | sheet secondary text |
| onLining `#E9E5DF` | frosted bar tint over a white blur | `#65474C` | 6.54 | 4.5 | post page bar title, glyphs |
| onLining `#E9E5DF` | wine glass over white | `#391319` | 13.06 | 4.5 | scrolled bars |
| onLiningMuted `#B8A09B` | wine glass over white | `#391319` | 6.67 | 4.5 |  |
| onLiningMuted `#B8A09B` | lamp pool peak over worst lining grain | `#5E2D2C` | 4.52 | 4.5 | muted text inside a pool |
| onLining `#E9E5DF` | lamp pool peak over worst lining grain | `#5E2D2C` | 8.87 | 4.5 |  |
| onLiningMuted `#B8A09B` | glass tile over worst lining grain | `#562930` | 4.86 | 4.5 | "in 173 drinks" |
| onLiningMuted `#B8A09B` | field (.32 smoke) over lining | `#2F0A10` | 7.29 | 4.5 | search placeholder |
| onLiningMuted `#B8A09B` | tally / panel (.30 smoke) over worst lining grain | `#39161C` | 6.54 | 4.5 | Dex panel text |
| onLiningMuted `#B8A09B` | cellar, worst grain | `#3E191E` | 6.27 | 4.5 | not-yet card name and number |
| onLiningFaint `#A7837F` | cellar, worst grain | `#3E191E` | 4.55 | 3.0 | lock glyph (glyph only) |
| reelInk `#FFFDF9` | marker over white | `#434141` | 9.98 | 4.5 | plates and markers over photos |
| glassInkMuted `#C9BDB6` | marker over white | `#434141` | 5.52 | 4.5 | nameplate subline over photos |
| reelInk `#FFFDF9` | smoke glass over white | `#3D3536` | 11.74 | 4.5 | active tab label |
| reelInkDim `#A99E94` | smoke glass over white | `#3D3536` | 4.55 | 4.5 | resting tab labels |
| reelInkDim `#A99E94` | smoke glass over paper | `#3C3233` | 4.72 | 4.5 |  |
| text `#2B2322` | mat | `#FBF8F2` | 14.50 | 4.5 | collected card name |
| taupeInk `#736247` | mat | `#FBF8F2` | 5.55 | 4.5 | padding zeros of "#0001" on mat |
| lining `#3E0A12` | onLining (bone fill) | `#E9E5DF` | 13.32 | 4.5 | bone checkbox tick, Follow label |
| muted `#6A6058` | tungsten wash `#F7E9D2` (paper) | `#F7E9D2` | 5.12 | 4.5 | (reserved: a lit row on paper) |

The rules that keep those numbers true, for check-contrast to assert:

- **Lamp pools peak at 0.12.** At 0.14, `onLiningMuted` drops to 4.34 over the worst grain. No glass tile sits inside a pool's inner 55%.
- **The sheet tint never goes below 0.84.** At 0.82, `onLiningMuted` over a blurred white photo is exactly 4.50.
- **Paper spill: no muted text within 30pt below or 8pt above a lit print.** The print's glow is two box shadows (section 4). The falloff below the print, from the Gaussian (σ = blur / 2), is alpha 0.335 at 12pt, 0.154 at 24pt and 0.087 at 30pt. At 0.10 of the reddest light (`#ED352F`), `textMuted` over the darkest paper grain is 4.53. Ink and wine are 8.2:1 or better even at 12pt, so the actions row (glyphs, counts in ink, a wine heart) can sit right under the print.
- **Avatar initials:** `onLining` on every accent except amber `#8A5F10` (4.49) and taupe `#736247` (4.69). Those two take `reelInk` (5.55, 5.79).
- **A drink's light used as a ring** (story, liker, profile halo) is a UI cue and needs 3:1 on the worst lining grain. The worst sampled light is Jell-O Shot's `#ED2F36` at 3.42. The vector fallbacks for Port `#C23A44` (2.69), Vermouth (3.26) and Fortified (3.30) are lightened in HSL by the generator until they pass; Port becomes `#C84852` (3.04). Glows, spills, spectrum marks and key strips are decorative and carry no meaning alone: every one sits beside a name, a number or a count.

## 3. Each drink's own light

What it is: one hex per drink, `light(drink)`, generated into `src/data/drinkLight.ts`. That is 2,089 entries, about 25 KB in the bundle, and a lookup costs nothing at runtime. It is never hand-edited.

How the 162 photographed drinks get theirs (this is what `img/glow.json` holds). The build script is an extension of `scripts/lib/tungsten.py`, which already reads every master:

1. Downsample to 128px.
2. Take the background per row from the side columns, which are the tungsten wall.
3. Keep centre pixels whose chroma differs from that background: the liquid, the garnish and the glass.
4. Average those pixels, weighting by chroma distance × value.
5. Re-saturate to S 0.50 to 0.80 at V 0.93, so the light reads as light and not as a swatch of the liquid.

The tungsten re-light makes everything warm, so plain averaging gives every drink the same orange. The chroma-distance step is what separates the Grasshopper's mint (`#7AED77`) from the wall.

Then:
- **Clear and pale drinks** (saturation under 0.37 at a yellow-green hue, or too little foreground) get `ice`: Gin Fizz, Martini, Daiquiri, Gin and Tonic, Ramos Gin Fizz.
- **Cream and coffee drinks** get `tungsten`: Espresso Martini, White Russian, Brandy Alexander, Bushwacker.
- An override file (`scripts/lightdata/overrides.json`) fixes what the sampler misreads. Last Word currently lands on ice and arguably wants chartreuse.

The 1,927 vector-face drinks take the liquid colour their face already draws (v3 §7.5), falling back by subcategory: gin and vodka ice, whisky and rum amber, agave straw, amaro red-brown, herbal liqueur green, port and vermouth red (clamped, section 2). People's photos are never sampled or graded: a post glows in its **drink's** catalogue light, whatever the photo looks like.

## 4. The detail layer: every detail, where it appears, how it is drawn, what it costs

All drawing is plain Views, react-native-svg and expo-image (all installed). There are no new native modules and nothing is installed. Pixel tricks in the mockup map to RN like this:
- CSS `box-shadow` → RN `boxShadow` (new architecture, already used by `elevation`);
- CSS `color-mix` → an rgba string built from `light()`;
- CSS `mask` on a white-alpha PNG → expo-image `tintColor`;
- CSS `filter: blur` on an image → expo-image `blurRadius`.

| # | Detail | Where | How it is drawn in RN | Cost |
|---|---|---|---|---|
| 1 | **Drink glow** | Collected Dex cards, My Bar "You can make" photos, the Latest catch thumb, the legend | Two `boxShadow` entries on the card in `light()` at 0.78 and 0.34 alpha: `0 16 30 -8` and `0 0 30 0` | One shadow layer pair per visible card (≤ 9 on Dex, ≤ 4 on My Bar). RN gives iOS an explicit shadow path, so there is no offscreen pass. If profiling on Jan's phone shows dropped frames in the Dex grid, swap in one shared pre-blurred `glow-9slice.png` tinted with `tintColor` (one decode for every card) |
| 2 | **Paper spill** | Feed prints on Home (and the post page on paper) | The same two shadows on the print, `0 20 40 -12` at 0.62 and `0 0 30 -6` at 0.36, in the drink's light | One per post cell. The spacing rule is in section 2 |
| 3 | **Lamp pools** | Home's head band (two lamps), Dex behind the count, My Bar behind the question and above the rail, Profile behind the avatar | One absolute `<Svg>` per band with `<RadialGradient>` ellipses (stops 0.12, 0.05 at 55%, 0), `pointerEvents="none"`, under Grain | Rasterised once at layout; scrolls with its band, never in chrome |
| 4 | **Caustics** | On the glass shelf under each lit Dex card and under each My Bar rail photo; inside catalogue photos on the counter | Shelf: `img/caustic-patch.png` (256×112, 17 KB, falloff baked in) as one expo-image per card, `tintColor={light}`, opacity 0.55 to 0.95. Photos: **baked** by the tungsten pass (the caustic tile projected onto the counter under the glass, at ≤ 0.35, in the drink's light) | One shared decode (115 KB in memory). The baked version costs nothing at runtime; an estimated +3% per webp (not measured). Not on paper: caustics on cream rendered as noise, so the feed has spill only |
| 5 | **Glass shelf** | Under Home's band, under every Dex row, under the My Bar rail | A 3pt View: 1pt `iceEdge` top, `rgba(255,253,249,.05)` body, 1pt `rgba(0,0,0,.42)` foot, and `boxShadow 0 7 12 -3` on lining (none on Home, where it would read as a fade on paper). In the Dex it is the `ItemSeparatorComponent` of the `numColumns={3}` list | Nil |
| 6 | **Bone mount, lit** | Collected Dex cards | v3's mount (mat, 1pt `matEdge`, window inset 4, `windowEdge` hairline) + item 1 + a 1pt white inner top highlight (`boxShadow inset 0 1 0 #FFF`) | As v3, plus item 1 |
| 7 | **Unlit slot** | Not-yet Dex cards | v3's recess unchanged: cellar fill, `slotEdge`, `elevation.recess`, ghost photo, name in Inter Medium `onLiningMuted`, lock glyph `onLiningFaint` | As today |
| 8 | **Smoked-glass tab bar** | Every tab | The slab becomes `smokeGlass` + `<Grain tone="lining">` (the grain is what reads as frost) + 1pt `rgba(255,253,249,.14)` edge + 1pt `glassHi` inner top lip. No blur: expo-blur is not installed and nothing is added | As today |
| 9 | **Ice filament** | The active tab | The 2pt indicator in `ice` with `boxShadow 0 0 8 1 rgba(169,221,235,.55)` | One shadow |
| 10 | **Glowing +** | The tab bar's post action | Wine fill, `logActionEdge`, inner lip `inset 0 1 0 rgba(255,253,249,.2)`, halo `0 0 16 rgba(217,132,142,.28)` | One shadow |
| 11 | **Wine-glass bars, hard edge** | Home's floating bar when it returns on scroll up; any `ScreenTopBar` over scrolled content | Solid `wineGlass` + Grain, 1pt `glassHi` bottom edge, nothing below it. Opacity is native-driven `fadeIn` as today | **Cheaper** than build 17: two SVG `VerticalFade`s and two tails are deleted (section 7) |
| 12 | **Frosted pane over a known photo** | The post page's bar and the likers sheet | An expo-image of the **same** photo with `blurRadius={22}`, requested small (`enforceEarlyResizing`, about 220×275), clipped into the pane, kept aligned to the photo by a native-driven `translateY` from `scrollY`, with `frostTint`/`sheetTint` over it and Grain on top. The sheet's top edge is 1pt of the drink's light at 0.7 ("edge-lit") | One extra decode (about 0.24 MB), shared by both panes (same URI and radius hit expo-image's cache). The blur runs once on decode |
| 13 | **Glass plates over photos** | "#0127" and "In your Dex" on feed photos and the post page; markers on profile tiles | `onMedia.markerFill` (0.78) + 1pt `glassEdge` + 1pt inner top lip; radius 4 | Nil |
| 14 | **Glass nameplate** | Bottom-left of a feed photo | A solid marker-fill box (radius 8, 1pt edge) holding the name (Playfair 30/34, `onMedia.ink`) and the subline (Inter 13, `glassInkMuted`). It **replaces** the two-gradient Nameplate scrim of v3 §4.4, so no gradient sits over a photo at all; text is on alpha 0.78 by construction | Fewer SVGs than today |
| 15 | **Story rings in the drink's light** | Home's stories; liker avatars that have a story | v3.1's ring (2.5pt unseen, 1pt seen) with `borderColor = ring(light)` (clamped ≥ 3:1) and a halo `boxShadow 0 0 16 1` at 0.42. Seen rings stay `storyRingSeen` and get no halo, so "unseen" is said by colour, weight **and** light | One shadow per unseen ring (≤ 6) |
| 16 | **Profile halo** | Profile avatar | 2pt ring + 24pt halo in the light of the person's latest catch ("you glow the colour of your last pour"). Round-ok: it is the avatar's ring | One shadow |
| 17 | **The Dex spectrum** | Dex header (406×14) and the Profile Dex panel (374×12) | One `<Svg>`: every drink you have as a 2pt mark at x = (n − 1) / 2,089 × width, in its light, on a recessed track (`rgba(14,11,11,.40)` fill, 1pt `liningLine`, inset shadow). Labels "#0001" and "#2089" at its ends | At most `width` rects: drinks are merged per pixel column, so a 2,000-drink Dex is still ≤ 406 rects. Memoised on the collection count |
| 18 | **Key strips** | Under every profile-grid tile | A 3pt View at the tile's foot in the drink's light; the grid reads as a palette of what was poured | Nil |
| 19 | **The measure (number scrubber)** | Dex right edge | A 1pt track with ticks (5pt, every fifth 9pt, `onLiningFaint`) and labels 1 · 500 · 1000 · 1500 · 2089 (Inter Medium 11, tabular). A tungsten **meniscus** (14×3, halo) is native-driven from `scrollY`. Drag via a gesture-handler `Pan` → `scrollToOffset` from measured row offsets (rows vary in height because names wrap, so not `getItemLayout`) | One small View tree; the meniscus is one transform |
| 20 | **Lit ingredient glyphs** | My Bar checklist | Six new 24-grid shapes in `icons.tsx`: spirit bottle, wine bottle, bitters dasher, citrus wheel, mixer glass, syrup jar. **Ticked:** filled with the ingredient's light (a ~40-entry table emitted by `build-bar-index.mjs`, category default otherwise), plus a soft halo View (`boxShadow 0 0 16 6` at 0.38). **Unticked:** outline in `onLiningFaint`, no halo. The checkbox (bone fill, lining tick) carries the state; the light is reinforcement | ≤ 8 shadows on screen |
| 21 | **Glass tiles and fields** | Checklist tiles, One-away rows, the search field, the Dex panel, the tally | `rgba(255,253,249,.035–.06)` or `rgba(14,11,11,.25–.32)` fills, 1pt edge, `inset 0 1 0` lip (fields: `inset 0 2 6` recess) | Nil |
| 22 | **"In their Dex" tag** | Likers sheet rows | Radius-4 rectangle, 1pt `iceEdge`, `rgba(169,221,235,.08)` fill, ice check + "#0127 in their Dex" (Inter Medium 12) | Nil, but it needs data: section 9 |
| 23 | **Shelf-edge labels** | My Bar "You can make" rail | Names (`miniName`) and numbers sit **below** the glass shelf, like price labels on a back-bar shelf edge | Nil |

## 5. Per-screen signatures

- **Home.**
  - The head band has two tungsten lamps over the wordmark.
  - Stories are ringed and haloed in each pour's light: Negroni red, Aperol orange, Grasshopper mint, Aviation violet. The seen Espresso Martini has a thin ring.
  - The band ends on an ice-lipped glass shelf with no shade below it.
  - The post is an inset print (372×465, 4:5, radius 12) that spills its light onto the paper. Glass plates carry "#0127" and "In your Dex", and a glass nameplate replaces the scrim.
  - "Liked by **andres.v** and **12 others**" sits beside a stack of three avatars; tapping it opens the likers sheet (frame 4).
  - Scrolled up (frame 6), the bar comes back as a solid wine-glass pane with a hard 1pt edge. Nothing fades under it.
- **Dex.**
  - The hero count "137 of 2,089 in your Dex" with "6.6%" in tungsten, then the spectrum.
  - A glass search field: "Search by name, or type a number".
  - Category chips (All 2,089, Cocktails 899, Spirits 1,190) and status chips ("In your Dex 137" with an ice check, "Not yet 1,952").
  - One grid from #0001, three per row. Collected cards are lit bone mounts casting their light onto an edge-lit glass shelf. Not-yet cards stay dark recesses.
  - The measure runs down the right edge with its tungsten meniscus at #0001.
  - There are no section headers anywhere.
- **My Bar.**
  - "What's in your bar?" with a tungsten tally ("14 ticked") and a glass search field ("Search 490 ingredients").
  - Filter chips that start with "Most useful".
  - A two-column checklist in usefulness order with lit ingredient glyphs (Lemon, Gin, Lime, Soda water, Orange, Angostura bitters, Sweet vermouth ticked; Dry vermouth not), then "Show all 490 ingredients".
  - "You can make **44** drinks": a rail of lit photos (Negroni #0127, Old Fashioned #0128, Boulevardier #0122, Americano #0013) on a glass shelf with labels on its edge.
  - "One ingredient away": Dry vermouth, which "pours 11 more, like Martini and Bronx", with an ice "+ Add".
  - There is no shelf section.
- **Post with likers sheet.**
  - The page bar is frosted from the post's own photo, with a hard edge.
  - The sheet is the same photo blurred under the sheet tint, edge-lit along the top in the Negroni's light.
  - "Liked by 13" with a rose heart. "*Negroni* #0127 · marisol.r's post". "Search 13 people".
  - "People you follow 4", then "Others 9".
  - Each row: an avatar (ringed in the light of the person's story if they have one today), name, "username · liked 2h ago", the ice "#0127 in their Dex" tag where true, and Following (outline) or Follow (bone).
- **Profile.**
  - An avatar haloed in the light of the latest catch (Aviation violet), counts with tabular figures between 1pt rules, name and bio.
  - The Dex panel: "137 of 2,089", the spectrum, and "Latest catch *Aviation* #0092 · 3 days ago" with a lit thumb.
  - Edit profile and Share profile buttons.
  - On paper: the tab strip with counts in tungsten ink, then the grid with glass number markers and a key strip of each drink's light.

## 6. Micro-typography

- **Dex numbers:** "#0127" stays Inter Medium 11, tracked 1.5, tabular. The **padding zeros and "#" step down one ink** (`taupeInk` on mat 5.55, `onLiningMuted` on lining 6.79, `glassInkMuted` on glass 5.52), so the significant figures read first, like an odometer. Every part still passes 4.5. Drawn as a nested `<Text>` in `DexNumber`.
- **Figures:** heroFigure 36 for the count; tungsten for lit figures (44, 6.6%, the tally, profile tab counts); everything tabular, "2,089" through `formatCount`.
- **Labels:** small labels ("People you follow 4", "Others 9", "Dex" in the panel) are sentence case, Inter Medium 12/16, tracked 0.4. That is `type.micro`'s existing tracking, so check-design rule 8 needs no exception. Their counts are set in `onLining` beside the muted word.
- **Inline names:** a drink name inside an Inter sentence ("like *Martini* and *Bronx*", "Latest catch *Aviation*") is `nameInline` Playfair 600, one step brighter than the sentence.
- **Names:** Playfair only through `DrinkName`. Dex cards use a 15/18 `cardName` (proposed `cardNameSm`, measure 116 − 16), the nameplate 30/34, the rail `miniName`. Avatar initials stay Inter.

## 7. No top gradient (Jan, 7 Oct)

Deleted, not restyled:
- `HomeChrome`'s two `VerticalFade` layers (`homeBarTop` → `homeBarFoot` ground and the 24pt tail);
- the status strip's 16pt tail;
- `layout.homeBarTail` and `homeStripTail`.

The returning bar is a solid `wineGlass` pane with grain and a 1pt `glassHi` edge (frame 6), and it still slides away natively. Also gone:
- the v3 12pt `shade` gradient under lining bands, replaced by the hard lip or the glass shelf;
- the 120pt top scrim behind the back button on photo pages, replaced by the frosted pane (item 12);
- the nameplate's bottom scrims, replaced by the glass nameplate (item 14).

After this, the only gradients left in the app are light falloff: lamp pools and the drink's glow.

## 8. Performance and motion

- **New motion: none.** The tab nudge, the bar's hide and return, and the tab bar's compaction stay exactly as in v3.1 §3. The only moving new things are the meniscus and the frosted copy's `translateY`, and both are native-driven interpolations of the existing `scrollY` (identity at offset 0).
- **No runtime blur** except expo-image's one-time, cached `blurRadius` on two copies of one image.
- **No blend modes** (`mixBlendMode` forces compositing), no `filter`, no Reanimated worklets, no new SVG per frame.
- **Shadows, counted at rest:**
  - Dex: 12 coloured shadow layers (6 visible collected cards × 2; not-yet cards cast none) + the filament + the +, so 14.
  - Home: 4 unseen rings + the print's 2 + the filament + the +, so 8.
  - My Bar: 4 rail photos × 2 + 7 glyph halos + the filament + the +, so 17.

  Every shadow is on a static row of a recycled list and is never animated.
- **Decoded image memory:**
  - caustic patch: +115 KB, shared;
  - blurred photo: +0.24 MB, on the post page only;
  - catalogue photos: unchanged (caustics are baked into the same webps).

  This is far under the 256 MB expo-image cap and no screen exceeds v3 §11's budget.
- **Bundle:** `drinkLight.ts` about 25 KB, the ingredient-light table about 2 KB, 6 glyph paths, one 17 KB PNG.
- **If the Dex stutters,** the first fallback is item 1's pre-blurred 9-slice PNG; the second is dropping the `0 0 30 0` ambient shadow and keeping the drop one.

## 9. Open calls for Jan

1. **Rule change:** allow glows and glass under the limits in section 1, or not.
2. **"In their Dex" in the likers sheet:** it needs the likers' collection status for one drink. That is a query against the unlocks of up to 13 people, and it is only fine if collections are already visible to whoever can see the post. If not, drop the tag; the sheet still works.
3. **The inset feed print** (372pt wide, so its light has paper to fall on) versus today's full-bleed photo. Full-bleed keeps more photo but loses the spill.
4. **Light overrides:** Last Word reads as ice and could be chartreuse; the override file decides.
5. **Real frost in the tab bar** would need `expo-blur`, which means a native module and a rebuild. This direction does not ask for it: smoked glass with grain is the version that ships without installing anything.

## 10. Rebuilding the mockup

`python3 build.py && ./render.sh` (or `./render.sh dex` for one frame). Chrome runs headless with a fresh profile under `.chrome-profile/`. The script kills only processes started with that profile and deletes it afterwards; Jan's own Chrome is never touched.
