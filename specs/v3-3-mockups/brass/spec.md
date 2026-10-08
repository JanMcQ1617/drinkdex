# v3.3 detail layer · "Brass" (back-bar hardware)

Direction mock, 7 Oct 2026, for Jan's build-17 note: "I think the app is too simple, its either burgundy or creame, add some details, into each page", plus: keep the scrolled-down look, lose the top gradient.

Files in this folder: `index.html` (five screens side by side, 440 × 956 each; `index.html#home`, `#dex`, `#bar`, `#post`, `#profile` show one), `contact.png` (the wall), `home.png`, `dex.png`, `bar.png`, `post.png`, `profile.png` (each 880 × 1912, 2x), `img/walnut.webp` and `img/grain-*.png` (mock textures), `tools/walnut.py` (makes the walnut tile; fixed seeds, so the output is the same every run).

Base: `specs/v3-cabinet.md` + `specs/v3.1-changes.md` + `src/constants/theme.ts`. It mocks the new structure: a floating tab bar (Home · Dex · + · My Bar · Profile) that swipes between tabs, the Dex in one number-ordered grid, My Bar as a checklist with no shelf, likes that show who liked the post.

---

## 0. The idea in one line

Wine is the cabinet and bone is the paper. Brass and walnut are **the fittings of a real back bar**: brass keylines and corner brackets on what is framed, an engraved brass plate wherever a Dex number appears, walnut shelves that drinks stand on, bottle labels for the things you tick, and a bar-spoon twist where a section begins. The structure does not change. The screens stop being two flat colours.

### What it answers in Jan's list

| Jan | Here |
|---|---|
| "Too simple, either burgundy or cream" | Three new material families (brass, walnut, label stock) and 20 details, each with a fixed job, on every page (§3, §4) |
| "Remove the gradient at the top when scrolling" | No top fade anywhere. Home's floating bar comes back as **solid lining with a brass rail at its foot** (D10), in place of `homeBarTop` → `homeBarFoot` → 24pt tail and the 16pt strip tail |
| "Who liked the post" | "Liked by maya.pours and 12 others" with three faces on Home; tapping it opens the likers sheet (screen 4) |
| "Drinks by number, not per section" | The Dex is one grid from Nº 0001. Each shelf's brass label holder names its range ("0001 – 0003"), so a fast scroll still says where you are (D9) |
| "Remove the My Bar shelf, let them choose what they have" | Screen 3: a checklist of bottle labels, ranked by how many drinks each pours, then "You can make" and "One ingredient away" |

### Rules this keeps

- **No uppercase.** Every word is sentence case. The brass "kicker" ("latest catch") is lowercase with 0.6pt tracking, never capitals (§5).
- **No pills** except avatars, story circles, the shutter and dots. New round things: plate screws (4pt), spoon-rule end discs (5 to 7pt), the avatar bezel (an avatar ring). Labels are **chamfered** rectangles, the grabber is radius 1, buttons stay 8pt squared with 1pt borders.
- **Playfair only for the wordmark and drink names.** Plates, counts, ranks, kickers and section heads are Inter.
- **No rarity.** Brass is **one** treatment, the same on every caught drink. It means "caught" (or "framed"), never a tier. Nothing reads `drink.rarity` (check-design rule 14 unchanged).
- **One wine action per view** holds: the wine Follow buttons on the likers sheet are the sheet's one action type; the + in the tab bar stays the bar's one wine object, now with a brass edge.
- **Not AI-looking**: no glows, glass, blur or mood gradients. The only gradients are where light really does something: the photo nameplate scrim (unchanged), the 12pt shade under a shelf or band (unchanged token `shade`), the brass bezel's lit side.

---

## 1. Palette

Existing values do not change. All additions go in `colors` (theme.ts) under a `/* ---- v3.3 brass ---- */` banner.

### 1.1 New tokens

| Token | Hex | Job | Text? |
|---|---|---|---|
| `brass` | `#B8924F` | Rails, keylines, corner brackets, gauge edges, spoon rules, the + button's edge | Never text. UI (3:1) on every dark ground; decorative on paper and mat |
| `brassPlate` | `#C9A867` | The face of an engraved number plate, the shelf label holder, the gauge fill | Carries `text` (espresso) only |
| `brassLit` | `#E8D3A2` | 1pt top highlight of a plate or rail; the active-tab marker; the engraving's light edge (`textShadowColor`) | Never text |
| `brassShade` | `#7D5F2C` | 1pt foot of a plate or rail; a bottle label's outer edge; screw heads | Never text |
| `brassInk` | `#7A5820` | Brass-coloured **text** on paper, mat, white and label stock: the count in a section head, rank numerals, light kickers | Yes, body-safe |
| `brassOnDark` | `#D6B676` | Brass-coloured **text** on lining, cellar, espresso, walnut: kickers, the rank word, the empty plate's number | Yes, body-safe |
| `plateHolderEdge` | `rgba(184,146,79,.72)` | The 1pt edge of an empty plate holder in a slot | UI |
| `walnut` | `#4A3328` | The wood (fallback fill under the texture; texture mean is `#4B372B`) | Ground |
| `walnutTop` | `#6A4C3B` | The lit top face of a shelf | Never text |
| `walnutDeep` | `#2E1F19` | A plank's lower edge, the plaque's edge, the gauge well on the plaque | Ground for the gauge only |
| `onWalnutMuted` | `#C9B6A8` | Secondary text on walnut (`onLiningMuted` fails there, see below) | Yes |
| `label` | `#F3E9D2` | Bottle-label stock: ticked ingredients, "In your Dex" over a photo, "In their Dex" | Ground |

`elevation` gains `plate: { boxShadow: '0px 1px 1.5px rgba(14, 11, 11, 0.35)' }` (a plate's contact shadow; small and static).

### 1.2 Contrast (WCAG 2.x, computed; worst-case pixels included)

Worst-case grounds: paper grain darkest `#EFEBE3`, lining grain brightest `#4B1B23`, cellar grain brightest `#3E191E` (v3 §4), walnut texture **brightest** pixel `#584233` (printed by `tools/walnut.py`; the texture runs `#31231C` to `#584233`).

Text (target 4.5:1):

| Text | Ground | Ratio | Use |
|---|---|---|---|
| `text` #2B2322 | `brassPlate` #C9A867 | **6.79** | Plate digits, shelf holder range |
| `text` #2B2322 | `label` #F3E9D2 | **12.73** | Bottle-label words |
| `textMuted` #6A6058 | `label` | **5.08** | "in 173 drinks" on a ticked label |
| `wine` #5B0F1A | `label` | **11.38** | The check on a label tag |
| `brassInk` #7A5820 | paper #F7F2EA / worst grain #EFEBE3 | **5.81 / 5.44** | Section counts ("30"), rank numerals |
| `brassInk` | mat #FBF8F2 / white / `label` | **6.11 / 6.47 / 5.36** | Rank numeral on unticked / ticked labels |
| `brassOnDark` #D6B676 | lining #3E0A12 / worst grain | **8.60 / 7.30** | Kickers ("latest catch") |
| `brassOnDark` | cellar #2F070D / worst grain | **9.34 / 7.93** | The number on an empty plate holder |
| `brassOnDark` | espresso #2B2322 | **7.91** | |
| `brassOnDark` | walnut mean / brightest pixel | **5.75 / 4.82** | Rank word on the plaque ("First Sips") |
| `onLining` #E9E5DF | walnut brightest pixel | **7.47** | Figures and titles on walnut |
| `onWalnutMuted` #C9B6A8 | walnut mean / brightest | **5.71 / 4.79** | "of 2,089 in the Dex · 3.1%" |
| `onLining` | `wine` | **10.95** | The + glyph (unchanged) |

UI and glyphs (target 3:1):

| Mark | Ground | Ratio |
|---|---|---|
| `brass` rail / keyline / gauge edge | lining / worst grain / cellar / espresso | 5.78 / 4.91 / 6.28 / 5.32 |
| `brass` rail and gauge edge | walnut brightest / `walnutDeep` | 3.24 / 5.48 |
| `brass` edge of the + button | `wine` | 4.75 |
| `brassLit` active-tab marker | espresso tab bar | 10.45 |
| `brassPlate` gauge fill | cellar well / `walnutDeep` well | 8.02 / 7.00 |
| `brassOnDark` rank notches | walnut brightest | 4.82 |
| `plateHolderEdge` (.72) composited | cellar / worst grain | 3.80 / 3.44 |
| `lineControl` unticked checkbox edge | white | 3.91 (unchanged pair) |
| `wine` ticked checkbox | `label` | 11.38 |
| `brassShade` label edge | paper / `label` | 5.32 / 4.91 |

Decorative only (carry no information; check-contrast lists them as decorative so nobody later puts text on them): `brass` on paper 2.59 and on mat 2.73 (mount keylines, avatar bezel, count separators, spoon rules on paper, the sheet grabber); the tab bar's inner keyline `rgba(184,146,79,.42)` on espresso, 2.07 composited.

**Never** (check-contrast asserts each fails): `onLiningMuted` on walnut (3.81 at the brightest pixel; use `onWalnutMuted`); `brass` as text anywhere; `brassInk` on any dark ground; any brass token as text over a photo. Over a photo, brass appears only as a **solid opaque plate** or a bracket, and the plate's text is measured against the plate (6.79), never against the photo.

---

## 2. Details: where, how it is drawn in React Native, what it costs

Primitives: Views, `react-native-svg` (already in the app; DexCard and the drink page use it), `expo-image` (already the image layer). No new native module, no package, no Reanimated, no blur, no runtime image processing. Every detail is **static**: it never animates, so it cannot stall or rest half-drawn.

### D1 · Engraved number plate (`NumberPlate tone="brass"`)
- **Where**: every Dex number. The feed nameplate, the post page, the likers sheet header, every Dex card, My Bar's "You can make" mounts and "One ingredient away" rows, every Profile grid tile, the "12 ticked" tally.
- **Drawn**: one View: `brassPlate` fill, radius 2, `borderTopWidth 1 brassLit`, `borderBottomWidth 1 brassShade`, `elevation.plate`. Text: `dexNumber` with `color: text`, `letterSpacing: 1.2` (was 1.5; tracking-ok, digits only), `textShadowColor: brassLit, textShadowOffset {0,1}, textShadowRadius 0` (the engraving's lit lower edge). Content "Nº 0127": `N` + `º` (U+00BA, present in the Inter latin subset; `№` U+2116 is **not**, so never use it). Size `sm` 18pt tall (cards, tiles), `lg` 22pt (nameplate, sheet header, tally) which adds two **screws**: 4pt round Views in `brassShade` with a 1.5pt `brassLit` dot top-left (dots, `round-ok: dot`).
- **Over a photo** it replaces `MediaNumberPlate`'s translucent marker: a solid plate, so its contrast does not depend on the picture.
- **Cost**: 1 View + 1 Text (+4 Views on `lg`). Nothing measured, nothing decoded.

### D2 · Empty plate holder (`NumberPlate tone="holder"`)
- **Where**: every drink not yet in your Dex (Dex slots; the same in search results).
- **Drawn**: the plate's box with no fill: `borderWidth 1 plateHolderEdge`, text `brassOnDark`, no shadow, no screws. Caught = polished brass; not yet = an empty holder. Said in words too: the slot's spoken label stays "{name}, number {n}, not collected yet".
- **Cost**: 1 View + 1 Text.

### D3 · Brass keyline on mounts
- **Where**: every mount (a caught drink's bone card): Dex grid, My Bar "You can make", the 56pt thumbs in "One ingredient away". Not on slots.
- **Drawn**: one absolute View inside the mount, `inset 3`, `borderWidth 1 brass`, radius `outer − 3` (8 → 5; 4 → 2 on thumbs), `pointerEvents="none"`. Uniform on every card. It is not the v3 tier rule (that was coloured and weighted by rarity, and v3.1 removed it): one weight, one colour, meaning "caught".
- **Cost**: 1 View per card. On a 3-column Dex with ~15 cells mounted, 15 Views.

### D4 · Corner brackets
- **Where**: a framed photograph: the feed post (Home), the post page; recommended also on the drink page hero and Log's preview (not mocked). **Not** on grid tiles or cards (too small, too many).
- **Drawn**: one `<Svg>` absolutely filling the photo at inset 8, `pointerEvents="none"`, drawn **after** the nameplate scrim so it stays bright. Four L plates, arm 22, thickness 3, with an 8pt corner square: each is one `Path` (`brass` fill, 0.75 `brassShade` stroke) + one highlight `Path` (`brassLit` 0.9) + a screw (`Circle r 1.9 brassShade` + a 0.7 slot line). The mock's drop shadow is drawn in RN as the same L path offset 1pt down in `rgba(14,11,11,.55)` underneath (no SVG filter). Wrap in `React.memo` keyed on width × height.
- **Clearance**: the bottom-left bracket ends 7pt left of the nameplate's text column (text at inset 18, bracket at 8 to 11), so it never touches a glyph.
- **Cost**: 1 Svg, 16 elements, per visible post. FlatList windowing keeps 2 to 3 posts mounted. Rasterised once; static.

### D5 · The print (feed photo inset)
- **Where**: Home feed posts and the post page.
- **Drawn**: the photo sits 24pt from each screen edge (392pt at 440, 345pt at 393), radius 4, 1pt `rgba(43,35,34,.22)` edge, aspect **4:5 unchanged**, nameplate unchanged (two scrims, §4.4 of v3). It is what lets the brackets read as a frame, and it is what fits stories, author, photo, actions, Liked by and a caption line above the tab bar.
- **Cost**: zero beyond today; the decode gets slightly smaller (392 vs 440 wide).
- **The trade**: the feed loses its full-bleed photos (Instagram's structure). If Jan wants full bleed back, keep the brackets at inset 12 on the full-bleed photo and drop the inset; everything else stands.

### D6 · Bottle-label tag (`LabelTag`)
- **Where**: "In your Dex" on a feed photo (replaces `DexStatusPlaque`'s dark marker), "In their Dex" / "In your Dex" in the likers sheet, every ingredient in My Bar's checklist.
- **Drawn**: a chamfered rectangle (corners cut at 45°: 4pt on small tags, 7pt on checklist labels), one `<Svg>` behind the content: one `Path` (`label` fill, 1pt `brassShade` stroke; unticked checklist labels are `surface` white with a `line` edge). Ticked checklist labels add an **inner rule**: a second chamfered `Path` inset 2.5, `brass` at 0.85, 0.8pt. Content is ordinary Views/Text on top. Path from a pure function `chamferPath(w, h, c, inset)`.
- **Sizing**: checklist labels have known size (half the column × 50pt), so no measuring. Small tags take their width from `onLayout` once (one extra layout pass per tag, on mount).
- **Cost**: 1 Svg (1 or 2 Paths) per tag. The checklist shows 6 to 12 at once.

### D7 · Bar-spoon twist rule (`SpoonRule`)
- **Where**: My Bar's section heads ("You can make 30", "One ingredient away 161"). Available to any section head (the drink page's "Origin story" and "The spec", the feed footer), at most one per section.
- **Drawn**: one `<Svg height 8>` filling the rest of the row (`flex: 1`, width from `onLayout`): a faint baseline `Path` (`brass` 0.55), one `Path` of short diagonal strokes every 3.2pt (the twisted shaft, `brass` 1.1pt), a 2.6pt disc at the left end and a 3.6pt disc with a `brassLit` 1.4pt centre at the right end (the muddler end; dots). The path string is memoised by width.
- **Cost**: 1 Svg, 4 elements per section head.

### D8 · Walnut (the wood)
- **Asset**: `assets/images/walnut.webp`, 1024 × 320, **10 KB**, made by `tools/walnut.py` (numpy + Pillow, fixed seeds; prints its brightest pixel, which §1.2 measures text against). It is not a photograph and needs no licence.
- **Drawn**: `expo-image` absolute fill, `contentFit="cover"`, `cachePolicy="memory-disk"`, one shared source. On repeated planks (the Dex), each row passes a different `contentPosition` (`{ left: (row × 137) % 100 + '%' }`) so neighbouring shelves do not show the same grain. The fill under it is `walnut`, so the first frame before decode is already wood-coloured.
- **Cost**: one decode, 1024 × 320 × 4 = **1.3 MB**, shared by every walnut surface on every screen (the expo-image memory cache holds one bitmap per source). Well inside the 256 MB cap; less than one feed photo.

### D9 · Walnut shelf with a brass front rail (`Shelf`)
- **Where**: Home, under the stories (the stories stand on it); the Dex, under every row of three; My Bar, the counter's top edge.
- **Drawn**, top to bottom, all Views: 4pt top face (`walnutTop`, flat in RN; the mock's 4pt gradient is not needed), 2pt rail (`brass` with a 1pt `brassLit` top border), 17pt front (D8 texture) with a 1pt `walnutDeep` foot, then the existing 12pt `shade` fade (`VerticalFade`, the same functional shade v3 already draws under a band).
- **Label holder** (Dex only): a `brassPlate` holder at left 16 on the front face, 14pt tall, Inter Medium 11 `text`, tracking 1, tabular: the row's range, "0001 – 0003" (en dash, present in the subset). The Dex FlatList uses `numColumns={3}`; `ItemSeparatorComponent` renders between rows and receives `leadingItem` (the row above), so the holder's range comes from the row it sits under with no extra bookkeeping. While a filter is on, the holder shows the first and last number in that row ("0004 – 0011"), so it still says where you are in the numbering.
- **Cost**: 6 Views + 1 expo-image (shared bitmap) per shelf; ~5 shelves mounted on the Dex.

### D10 · Brass rail under a solid top bar (no fade)
- **Where**: Home's floating bar when it slides back over the feed; any lining top bar once content runs under it (the post page in the mock; My Bar's head band foot; ScreenTopBar `tone="lining"` where `showRule` is on today).
- **Drawn**: 3pt of Views at the bar's foot: 1pt `brassLit` at 0.55, 1pt `brass`, 1pt `rgba(14,11,11,.45)`. On Home, `HomeChrome`'s bar ground becomes **opaque `lining` + grain** (still faded in by `fadeIn` over the first 24pt of scroll, so at rest nothing changes), the 24pt bar tail and the 16pt strip tail are deleted, and the rail rides with the bar's `translateY`. Retire `homeBarTop`, `homeBarFoot`, `layout.homeBarTail`, `layout.homeStripTail`.
- **Contrast gain**: the bar's glyphs go from 5.60:1 (bone over 72% lining over a white photo) to 13.32:1 on solid lining.
- **Cost**: 3 Views, and two `VerticalFade` SVGs fewer than today.

### D11 · Tab bar hardware
- **Where**: the floating tab bar, every tab (it swipes with the pages; the bar itself does not move).
- **Drawn**: an inner keyline View inset 3, 1pt `rgba(184,146,79,.42)`, radius 9 (concentric with the bar's 12); the active marker becomes a 28 × 2 `brassLit` bar at top 3 (it was bone, on the outer edge), with the solid glyph and SemiBold label unchanged (three cues, not colour alone). The + button: `wine` 52 × 38, radius 8, 1pt `brass` border, `boxShadow: inset 0 1px 0 rgba(232,211,162,.25)`. The 48pt compact state keeps the keyline and the marker.
- **Cost**: +2 Views. The marker's horizontal position can follow the pager's offset (native-driven `Animated` from the pager's `onPageScroll`, interpolated, identity at rest) so it slides with Jan's swipe; if it ever stalls it rests on a tab, which is still correct.

### D12 · Brass gauge (`BrassGauge`)
- **Where**: the Dex header (38 of 2,089) and the Profile plaque (64 of 2,089).
- **Drawn**: one `<Svg height 12>`: a well `Rect` (radius 2, cellar or `walnutDeep` fill, 1pt `brass` stroke), the fill `Rect` (`brassPlate`, min 3pt so 0.1% still shows), a 1pt `brassLit` highlight on the fill, a tick `Path` every 5% (10% ticks longer). The numeric labels under it are **RN Text** in a row positioned by percentage (they follow Dynamic Type; SVG text would not), Inter Medium 11 tabular, `onLiningMuted` / `onWalnutMuted`. On the plaque, the ticks are joined by four `brassOnDark` triangular **notches** at the rank ladder from `lib/milestones` (10, 25, 50, 75%), labelled with the count that reaches each: `ceil(total × pct / 100)` = 209, 523, 1,045, 1,567, and 2,089 at the end.
- **Accessibility**: `accessibilityRole="progressbar"`, `accessibilityValue={{ min: 0, max: total, now: count }}`, label "64 of 2,089 in your Dex".
- **Cost**: 1 Svg, ~25 elements; recomputed only when the count changes.

### D13 · Walnut Dex plaque (Profile)
- **Where**: Profile, between the buttons and the tab strip (own profile and peers'). Replaces nothing (v3.1 deleted Top shelf; this is the Dex progress the profile always lacked at a glance).
- **Drawn**: a View, radius 8, 1pt `walnutDeep` edge, `overflow: hidden`, the D8 texture as absolute fill, an inner `brass` keyline (inset 3, 0.9), content: figure `heroFigure`-sized "64" in `onLining`, "of 2,089 in the Dex · 3.1%" in `onWalnutMuted`, the rank word ("First Sips", `rankTitle()`) in `brassOnDark`, the D12 gauge. Below it on paper: "145 more to **Barfly in Training**, at 209" (`textMuted` / `text`).
- **Cost**: 3 Views + 1 expo-image (shared) + the gauge. One per Profile.

### D14 · Avatar bezel (Profile)
- **Where**: the Profile header avatar only (own and peer). Feed and likers avatars stay plain.
- **Drawn**: `<Svg 92>`: one `Circle` stroke 4 with a `LinearGradient` at 135° (`brassLit` → `brass` 45% → `brassShade`), the lit side top left; then the existing `Avatar` at 80 with a 2pt paper gap. Round: an avatar ring (`round-ok: avatar`). The mock's ring is this linear gradient; react-native-svg has no conic gradient, so none is used.
- **Cost**: 1 Svg, 3 elements.

### D15 · Count separators (Profile)
- **Drawn**: 1pt Views between posts / followers / following, `brass` at 0.6, inset 6pt top and bottom. Decorative.
- **Cost**: 2 Views.

### D16 · Brass hairline on post authors
- **Where**: the author avatar in a post header (Home, post page).
- **Drawn**: `Avatar ring="brass"`: a 1pt paper gap and a 1pt `brass` ring (two nested borders). Decorative.
- **Cost**: 1 View.

### D17 · Window bevel
- **Where**: the photo window inside a mount (Dex, My Bar).
- **Drawn**: two 1pt Views hugging the window: `rgba(14,11,11,.28)` above, `rgba(255,253,249,.9)` below, the cut edge of a mat lit from above. Slots do not get it: a recess has no mat to cut.
- **Cost**: 2 Views per mount.

### D18 · Likers sheet (screen 4)
- **Opens** from the "Liked by …" line (Home and the post page). A `pageSheet`-style bottom sheet (`elevation.sheet`, radius 12 top), medium detent first, drag to large.
- **Drawn**: a **brass grabber** (36 × 4, radius 1, not a pill: `brass` with a 1pt `brassLit` top border), the title "Liked by" + "24 people liked theo_stirs's *Paper Plane*" (drink name in `nameInline`) + the drink's `lg` plate, a D10 rail under the header, a search field, rows: 44pt avatar, name (Inter SemiBold), username, the D6 mini label "In their Dex" when the liker has caught that drink ("In your Dex" on your own row), and Follow (wine, squared) / Following (outline, squared). No button on your own row.
- **Data**: the likers query needs one boolean per row, whether that liker's collection holds the post's drink. If that is not already readable from the client (profiles show a Dex tab, so collections are visible to followers), it is one `exists(...)` column in the RPC; if it is not wanted, drop the tag and nothing else changes.
- **Cost**: a FlatList of rows; the tag is 1 Svg per row.

### D19 · Home's back-bar shelf under the stories
- The head band (lining, grain) now ends in a D9 shelf, so the story circles stand on a shelf, then paper. Rings unchanged (`storyRing` unseen 2.5pt, `storyRingSeen` 1pt, + badge).
- **Cost**: one shelf (6 Views + the shared walnut bitmap).

### D20 · Search well on lining (Dex)
- **Drawn**: the Dex search field on lining becomes a well: `liningDeep` fill, 1pt `liningControl` edge (3.27:1 on lining, 3.36:1 on the cellar fill), `boxShadow: inset 0 1px 4px rgba(0,0,0,.45)`, glyph and placeholder `onLiningMuted` (7.38:1 on cellar). Placeholder "Search 2,089 drinks" (`formatCount(TOTAL)`).
- **Cost**: 0 extra Views (style only).

---

## 3. Per page: the signature detail, and everything on it

| Screen | Ground order | Signature | Also |
|---|---|---|---|
| 1 Home | lining band → walnut shelf → paper | Stories stand on the back-bar shelf (D19) | The framed print with brass corner brackets (D4, D5); `lg` plate + "In your Dex" label over the photo (D1, D6); author hairline (D16); "Liked by maya.pours and 12 others" with three overlapping 20pt faces; tab bar hardware (D11); no top fade (D10) |
| 2 Dex | lining → cellar slots → walnut shelves | Walnut shelf per row with a brass label holder naming its numbers (D9) | Hero figure + "latest catch" kicker; brass gauge with ticks (D12); search well (D20); squared filter chips (All / Cocktails / Spirits │ Collected / Not yet); brass-trimmed mounts with a polished plate (D1, D3, D17) against recesses with an empty plate holder (D2) |
| 3 My Bar | lining head → brass rail → paper → walnut counter → paper | The checklist as bottle labels, ranked (D6): ticked ones are label stock with an inner brass rule, unticked are plain white | "12 ticked" `lg` plate on the lining; rank numerals 01, 02 … in `brassInk`; bar-spoon rules (D7) beside "You can make 30" and "One ingredient away 161" (counts in `brassInk`); the walnut counter carries mounts (D8, D3); one-away rows with a thumb mount, Playfair name, plate, "Needs orange · orange pours 5 more" and a squared "+ Orange" |
| 4 Post + likers | lining bar + rail → paper → sheet | The likers sheet (D18): brass grabber, the drink's plate, a face and name per liker, "In their Dex" labels | Solid top bar with a brass rail at its foot, no fade (D10); the framed print (D4) |
| 5 Profile | paper → walnut plaque → paper grid | The walnut Dex plaque with a brass gauge notched at the rank ladder (D13, D12) | Brass bezel avatar (D14); brass count separators (D15); every grid tile carries its `sm` plate bottom-left (D1, solid, legible over any photo) |

Numbers in the mock are real: drink names and Dex numbers from `src/data/drinks.json` (Nº 0001 Caesar … Nº 0009 Ramos Gin Fizz; Negroni 0127, Paper Plane 0107, Daiquiri 0100, Americano 0013, Boulevardier 0122, Tom Collins 0033); ingredient ranks and "in N drinks" from `src/data/barIndex.json` (`uses`); the bar result ("12 ticked", 30 makeable, 161 one away, orange completes 5) is `matchBar()`'s rule applied to {gin, lemon, lime, sugar syrup, bourbon, sweet vermouth, Campari, white rum, Angostura, soda water, tequila, triple sec}; 490 ingredients; the rank ladder from `lib/milestones` (209 is 10% of 2,089, rounded up as `rankTitle` requires).

---

## 4. Micro-typography

| Rule | Role | Where |
|---|---|---|
| Dex numbers are always "Nº " + 4 tabular digits, on a plate | `dexNumber`, `letterSpacing 1.2` on plates | Everywhere a drink has a number |
| Ranges use an en dash with spaces | holder text | "0001 – 0003" |
| Counts are Inter tabular; a count beside a head is `brassInk` SemiBold at the head's size | `shelfTitle` + `count` colour | "You can make **30**" |
| Rank numerals: two digits, tracked 1, `brassInk`, Inter Medium 11 | new `textRole.rank` | My Bar checklist |
| Kicker: lowercase, Inter Medium 12/16, tracking 0.6, `brassInk` or `brassOnDark`; at most one per screen | new `textRole.kicker` (tracking-ok: sentence case, never caps) | "latest catch" on the Dex |
| Thousands always separated | `formatCount` | 2,089 · 1,045 |
| A drink name inside a sentence is Playfair, the sentence Inter | `nameInline` | "theo_stirs's *Paper Plane*" |
| Engraving: plate text carries a 1pt lit lower edge | `textShadowColor brassLit`, offset {0,1}, radius 0 | Plates and holders only |

11pt floor holds (plates and holders are 11). Dynamic Type: plates and holders cap at 1.3 (they sit in fixed frames); their containers grow.

---

## 5. Performance

Everything is static Views, a handful of small SVGs and one shared 10 KB texture. No blur, no runtime effects, nothing on Reanimated's frame loop, no layout entrance animation (check-design rule 3 unchanged). Brackets, labels and spoon rules are `React.memo` components keyed on size.

| Screen | Added per screen (mounted) | Decoded image memory added |
|---|---|---|
| Home | 1 shelf (6 Views + walnut), ~3 bracket Svgs, ~3 `lg` plates, ~3 label tags, liked-by faces (3 Views per post) | walnut 1.3 MB (shared, once per app session) |
| Dex | ~15 plates or holders, ~8 keylines, ~16 bevel Views, ~5 shelves (6 Views each + walnut, same bitmap), 1 gauge Svg | 0 beyond the walnut |
| My Bar | 6 to 12 label Svgs, 2 spoon Svgs, the counter (walnut), ~5 mounts | 0 beyond the walnut |
| Post + likers | 1 bracket Svg, 2 plates, ~8 row tags | 0 |
| Profile | bezel Svg, plaque (3 Views + walnut), gauge Svg, ~12 tile plates | 0 beyond the walnut |

Rough order: the Dex adds about 120 plain Views to a screen that already mounts ~15 cards with images; Views are the cheapest thing Fabric draws. The one thing to watch is the label SVGs that size by `onLayout` (small tags): each costs one extra layout on mount, never on scroll. If the Dex ever stutters on an older phone, the first thing to drop is the window bevel (2 Views per card), then the shelf texture (fall back to flat `walnut`); neither changes the look much.

---

## 6. Guards to add (for whoever builds it)

- **check-contrast**: every pair in §1.2, including the walnut brightest pixel read from the tile (decode `walnut.webp` as it already decodes `grain.png`); the "never" pairs as asserted failures; `brass*` tokens never allowed as `onMedia` text.
- **check-design**: `brass`, `brassPlate`, `brassLit`, `brassShade` may not be a `color` of a Text (only `brassInk`, `brassOnDark` may); `№` (U+2116) fails the build (not in the subset); `textRole.kicker` is the only new tracking, with `tracking-ok`; rule 14 (no rarity readers) unchanged, so the uniform keyline cannot drift back into tiers.

---

## 7. What this mock does not settle

- **The feed print (D5)** changes full-bleed photos to inset ones. Everything else works with full bleed if Jan prefers it.
- **"In their Dex" (D18)** needs the likers query to say whether each liker caught the drink.
- The drink page, Log, sign-in and Settings are not mocked; the same kit applies (brackets on the drink page hero, plates, spoon rules on its section heads, rail under its bar).
- The keyboard-covers-results problem and the + opening a new window are separate from this layer.
