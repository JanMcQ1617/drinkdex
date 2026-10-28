# v4.9 · Printed in grey, signed in red (build spec, revised after judging, then made bolder)

Jan, 28 Oct 2026: "I want you to add more design features through the app, I like the line under the text, but it still feels too empty for me." He was offered three directions and picked all three:

1. **Pen doodles and motion.** Red paint-pen doodles on empty screens and at the ends of lists, a pen crown on the Tournaments leader, and the swash under tab-root titles drawing itself in each time a tab opens.
2. **Editorial frames.** Big outlined numbers on drink pages and Dex sections, double pen rules, and menu-style dotted leaders between ingredients and amounts.
3. **Texture and photo frames.** A faint paper grain behind everything, pen crop-corner marks around post photos, and a torn-ticket edge on cards.

This file makes the three one language, so the app stops feeling empty without getting clumped:

- **The paper** is the ground: one neutral grain on the main page grounds, seen at arm's length.
- **The press** is printed matter, in greys: the big outlined Nº figure, section figures, menu leaders, a ticket's die-cut and perforation.
- **The pen** is the logo's red paint pen: the v4.6 and v4.7 rules and swash, six garnish doodles, crop corners, a crown, the arrow and the double rule.

There is still one pen, one red (Campari, `colors.accent`, at 100%), and black, white and greys. Every mark is **ornament, not information**. None adds a word, a count, a state or an icon, and none turns a state red.

**What changed after judging (28 Oct).** Taste and build reviews are answered in J, item by item. In short:

- Gone: the glint and every sparkle, the star, the ice cube, the pimentos, the lime's pith, the coupe's liquid line, the crown's dots, two of the three arrows, two of each print's four corners, the paper's flecks, the tournament winner's ticket, and the Nº on its own on Dex's rest head.
- The doodles now use the logo's pen: the stroke peaks at 1.8pt, not 1.3, and each doodle is two to four strokes. A **twist** replaces the ice cube, a **shaker** replaces the star, and the lime has plain teardrop segments.
- The press is easier to see: rings are 1pt, the drink page sets **Nº 0100** at cap 64, and Dex figures are cap 40.
- End marks sit right-aligned like a signature, not centred like an icon.
- The five art-led and list-root empty states sit at 38% of the free height (O-3, now in the build).
- Home's stories rule redraws on each Home arrival (O-2, now yes).
- Doodles on empty states are **opt-in** per call site.
- Every new mark is **one path**.
- The paper is a **tile grid**, never `resizeMode="repeat"`.
- Section F is final: five parallel-safe packages after a foundation, then a close-out.

**What changed in the bolder pass (28 Oct, the lead).** The judged spec was anchored on Jan's older "less stuff" (9 Oct). On the board, the drink page (the outlined Nº, the double rule, the leaders) and Tournaments (the crown, the ticket, the double rule) landed; Home at rest barely changed, the doodles were small and lonely, the end marks timid and the empty states still mostly blank white. Jan's newest word wins: the app must visibly stop feeling empty, and still never read as clutter, information, a state, a button or a link. Reasons item by item are in K. In short:

- **Home at rest changes.** The stories rule Jan likes is **doubled** (the double rule that landed on Tournaments and the drink page, now dividing Home's two halves, stories and feed), and the post's crop corners have **15pt arms** pressed to 1.45pt, not 10pt slivers. A drip off the stories rule was tried for the one new mark at rest and rejected on the render: it hung under one story and read as a pointer.
- **Doodles are half as big again and pressed harder**: drawn at 1.5 beside a print, 1.25 beside a glyph and 1.2 at a list's end, the pen's peak 2.1pt, not 1.8.
- **Every empty state is a cluster** that fills the middle of the screen: beside a print, two or three doodles round it in the two corners (one doodle fewer where an arrow goes); beside a glyph, two, an arch with the glyph at its foot. Each cluster is one path.
- **Two arrows, not one**: Home's "Find friends" and the Dex's "Show every drink", the art-led keys that lead somewhere to look. Never at a key that posts a drink (App Store 1.4.3).
- **End marks are signed**: the screen's doodle at 1.2 with the swash Jan likes under it as the flourish, right-aligned, one path.
- **The paper is seen**: its tooth moved to a 2.4pt cell at ±1.2%, where the eye at arm's length is most sensitive, mean #FBFBFB, darkest #F4F4F4, still grey and still off every wash.
- **§O is settled**: Jan delegated the six questions; the first answers stand and are built.
- **§F**: the push package has finished and never touched `activity.tsx`, which is F4's alone. TodaysPours gains a `retiring` key, so F5 deletes four.

Board: `board/index.html` (`?f=<frame>` for one frame, `?pair=home`, `?pair=saved-empty` or `?pair=activity-empty` for a before/after pair, `?f=home&v=drip` for the rejected drip). PNGs are in `board/shots/`, with the whole wall at `board/board.png`. Every mark on the board comes from `tools/*.mjs` and from the app's own `src/components/details/penPath.ts`; none is drawn by hand (see H).

Read with: `specs/v4.6-details/spec.md` §A (the pen, the components, the guards) and `specs/v4.7/spec.md` §6. Both stand except where this file says otherwise.

---

## A. The parts

### A.1 One hand: what every pen mark obeys

Pen marks are drawn, not stroked. Each is a filled outline built around a centreline, M/L/Z only.

- Ink: `colors.accent` at 100%. Never `accentPressed`, never a tint.
- No width under `FLOOR` (0.4pt). Deterministic, and cached by its arguments.
- **Scale moves the drawing, never the pen.** A doodle drawn at 1.5 has its centrelines scaled and its widths unchanged. `tools/build-marks.mjs` fails a run if any pen mark has ink under 0.4pt.
- **Rotation is baked, never a transform**: degrees about the centre of the mark's nominal box at its scale (`place()`), so the polygon a device fills is the one the board proves, and nothing can animate it.
- **One path per mark.** Every new mark's `d` is a one-element array (`shapeOne()`, A.2): on Fabric each `<Path>` is a native view.

Pressures, all from penPath's `press()` or a tick:

| Name | Land → peak → lift | Used for |
|---|---|---|
| `DOODLE.line` | 0.45 → **2.10** → 0.40 (peak at t 0.14) | every doodle outline, the crown |
| `DOODLE.fine` | 0.40 → 1.10 → 0.40 (peak at t 0.30) | the lime's segments, nothing else |
| tick | 0.40 → peak (1.3 to 1.7) → 0.40, `sin(πt)^0.7` | a stem, a pick, the cherry's tip |
| arrow shaft | 0.45 → 1.85 → 0.45 | the arrow; its head 0.5 → 1.6 and back to 0.45, 8pt long |
| crop corners (`CROP`) | 0.45 → **1.45** → 0.45, `sin(π·min(1, 1.04t))^0.5` | the print's corners and the post's top-right L |
| the post's foot (`cornerRule`) | 0.40 → 1.42, held, → 0.40 over its last 9pt | the corner that turns into the closing rule |
| the rules, swash, drip | unchanged from v4.6 / v4.7 | (the double rule is two of PenRule's) |

Few, pressured strokes read as the Marker tag that wrote "sipply"; many hairline details read as a ballpoint sketchbook. So no doodle carries interior detail.

**The bolder pass's weights.** The doodles are drawn half as big again where they are placed (`DOODLE_SCALE`: 1.5 beside a print, 1.25 beside a glyph, 1.2 signed at a list's end; the olive, the widest, 1.1 beside a glyph). Scale still never moves the pen, so a bigger drawing at the old 1.8 thinned into a sketch; the peak goes to 2.1 so it keeps the logo's weight at its new size. The corners go from a 1.2 hairline to 1.45, the arrow's weight. The rules and the swash Jan likes are not touched.

### A.2 New geometry (paint-free; port from `tools/` 1:1)

**Module rules for every paint-free `.ts` here:**

- Imports are extensionless (`from './penPath'`), as the rest of the app's are.
- The syntax is erasable only: no `enum`, no `namespace`, no parameter properties, and `import type` for type-only imports. Node strips the types when `render-details` loads them (E.3).
- No module-level mutable state besides the existing `cached()` map.
- Nothing throws during a render.

- **`penPath.ts`** (F0 edits it).
  - It **exports** its private helpers unchanged: `stroke`, `cap`, `press`, `catmull`, `toD`, `shapeOf`, `cached`, `quarter`, `smooth`, `clamp`, `clamp01`, `r2`.
  - It gains `place`, `samplesAlong`, `lengthOf`, `line`, `loop`, `dot`, `signedArea`, `oneD` and `shapeOne`, all from `tools/pen.mjs`. `oneD` turns every polygon to the same winding by its signed area and concatenates the subpaths, so nonzero fill paints their union; `shapeOne` is `shapeOf` with `d: [oneD(polys)]`.
  - `PEN_SEED` gains `spec: 11` and `restHead: 12`. Its comment reserves 8, 14 and 15: `doubleRule` draws its lower stroke with `seed + 3`, so `board`, `spec` and `restHead` also use those three. `activityEnd: 6` stays as a retired key and is never reused.
  - The comment also says that Home's doubled stories rule (`doubleRule(·, PEN_SEED.stories)`, C.1) draws its lower stroke with 3, `margin`'s number. That is a different generator (`penRule`, not `penVRule`) on a different screen, so nothing ever shows the two strokes together; the upper stroke stays seed 0, Pen's mock.
  - Nothing else changes; `penRule(392, 0)` still reproduces Pen's mock.
- **`doodlePath.ts`**, ported from `tools/doodles.mjs`.
  - Exports `DOODLE`, `DOODLE_BOX`, `DOODLE_SCALE`, `type DoodleName = 'lime' | 'twist' | 'cherry' | 'olive' | 'coupe' | 'shaker'`, `DOODLES`, `crown`, `ARROW`, `arrow`, `SIGN`, `signature`, `ART_CLUSTER`, `ICON_CLUSTER` and `emptyCluster` (the last three hold C.9's tables).
  - The doodle generators take `(s = 1, rot = 0)`. The scale goes to each drawing as an argument (`penAt(s)`), never through a module variable.
  - `DOODLE_SCALE = { art: 1.5, icon: 1.25, sign: 1.2 }`. The boxes below are at s 1; a caller's table gives the scale it draws at.

  | Generator | Nominal box at s 1 (pt) | Drawn as |
  |---|---|---|
  | `limeWheel` | 44 x 44 | The rind as one loop that closes 18° past its start. Six plain teardrop segments (fine), point to the hub, square to the centre, with no lean. |
  | `twist` | 34 x 44 | A citrus peel hanging in 4.5 turns along a 70° axis, one stroke. Its turns cross themselves, so it reads as a coil of peel, and its loops echo the logo's script. |
  | `cherry` | 36 x 44 | The fruit in one loop from its dimple, the stem in one long curve, a pressed tip. |
  | `olivePick` | 56 x 56 | Two olives that never touch on a 45° pick. The pick runs out past both olives and shows between them, with a pressed bead for a head. |
  | `coupe` | 40 x 44 | The rim, the bowl in one stroke, the stem, the foot. |
  | `shaker` | 30 x 48 | A cobbler shaker in three strokes: the cap, the strainer's shoulder and the tin, tapering to its foot. |
  | `crown` | 20 x 13 | Three points and the base in one stroke, then the base again. No dots. |
  | `arrow(from, to, bend)` | its points' own frame | A bowed shaft; its head is two strokes **8pt** long at 30° and −26° off the end's tangent. `ARROW = { from: [62, −24], to: [14, 24], bend: −14 }` is PenArrow's. |
  | `signature(name, rot)` | `w x h`: w = max(56, 1.2·bw + 4), h = 1.2·bh + 6 + 6 | **A signed list end** (C.10): the doodle at 1.2 with its rotation, its box 4 in from the right at the top, and `penSwash(56)` exactly, its box ending on the right edge 6 under the doodle's box. One path. Coupe, twist, cherry 56 x 64.8; lime 56.8 x 64.8; shaker 56 x 69.6; olive 71.2 x 79.2. |
  | `emptyCluster(name, kind)` | the picture's own frame, (0, 0) its top-left | **An empty state's composition** (C.9) as ONE path: for `'art'`, `cropCorners(120, 150)` and the ART_CLUSTER row's doodles; for `'icon'`, the ICON_CLUSTER row's two doodles. Each doodle is drawn at its scale and rotation, then moved to its box (`place`, `dx`/`dy`, after the baked rotation). Cached by `(name, kind)`. Imports `cropCorners` from `./framePath` (both paint-free). |

- **`framePath.ts`**, ported from `tools/frames.mjs`.

  | Generator | Tier | Geometry |
  |---|---|---|
  | `doubleRule(L, seed)` | pen | Two `penRule`s with centrelines 3.2pt apart (3.4 and 6.6 in a box L x 10). The lower one is 1.5% shorter and is its own stroke (`seed + 3`). |
  | `cropCorners(w, h, arm = 15, gap = 6, which = 'tr bl')` | pen | L marks round a w x h print, each ONE stroke bent through a 0.9pt-softened corner, `gap` outside the print on both axes, pressed 0.45 → 1.45 (`CROP`). The default is the anti-diagonal pair. Bolder pass: arms 15, not 11. |
  | `cornerL(arm = 15, which)` | pen | One L in an arm x arm box whose own corner is the mark's corner. |
  | `cornerRule(arm = 15, run = 32)` | pen | **The post's foot**: the bottom-left corner and the 24pt closing rule as ONE stroke. It lands at the top of the 15pt upright, turns the corner and runs on to x 40 in the card, where the closing rule ended, then lifts; 1.42 through the corner (`CORNER_RULE`). The box is run x arm, with the corner at its bottom left and the foot's centreline on the box's bottom edge. |
  | `leader(L)` | press | Round dots 1.1pt across, every 4pt, right-aligned: the last dot sits 2pt before the end and a partial dot is dropped at the start. **Box L x 4, its foot on the baseline, dot centres 1.6 above it (y 2.4).** |
  | `perforation(x0, x1, y)` | press | Dashes 2.4 x 0.8pt every 5pt, centred in the run. |
  | `ticket(w, h, at, notch = 8, r = 8)` | fill | The card's own silhouette, one clockwise outline: corners r 8 and two half-round die-cut notches of **radius 8**, one in each side, centred `at` pt from the top. Arcs are flattened to one point per 6°. |
  | `cropTick` | (rejected) | Kept in `tools/` only as the evidence for C.1; never ported. |
  | `dripRule` | (rejected) | The stories rule with the plate's drip at 0.7 of it. Kept in `tools/` only as the evidence for C.1 and K; never ported. |

- **`numeralPath.ts`**, ported from `tools/numerals.mjs`, plus the generated **`numeralGlyphs.ts`**.
  - **Path glyphs, not text.** Inter 600's figures, N, º (U+00BA, rule 16) and the space are read from `assets/fonts/InterLatin_600SemiBold.ttf` by `scripts/build-numerals.py` (a port of `tools/extract-glyphs.py`, using fontTools, with `--check`).
  - Each contour is simplified at the drawn size (Ramer-Douglas-Peucker, 0.05pt), then offset out and in by `ring/2` (mitred, the mitre capped at 2x), with the inner offset reversed.
  - **The whole figure is ONE path**: rings never overlap, so nonzero fill paints exactly the rings.
  - **`ring` is 1.0pt** at every size and never scaled. Display tracking is −0.02 em, with proportional figures.
  - The nominal box is (advance width x cap): its top on the cap height, its bottom on the baseline.
  - `numeral(text, cap)` returns a PenShape plus `width`. `numeralWidth(text, cap)` returns the width alone, for layout sums.
  - **An unknown character is skipped, never thrown on.**
- **`tabArrival.ts`** holds the motion hook (B).

Sizes, measured from `tools/` (one path each):

| Mark | Path text |
|---|---|
| lime 1.5 / 1.25 | 15.8 / 14.0 KB |
| twist, cherry, coupe, shaker 1.5 | 5.1 to 7.3 KB |
| olive 1.5 / 1.1 | 8.1 / 6.2 KB |
| a signed end mark | 6.8 to 8.4 KB (the lime's 15.3 KB) |
| an art-led cluster (corners and two or three doodles) | 15.8 to 29.4 KB |
| an icon-led cluster (two doodles) | 11.7 to 22.3 KB (the two with a lime are the heavy ones) |
| crown | 2.4 KB |
| arrow | 3.9 KB |
| crop corners 120 x 150 | 3.1 KB |
| `cornerL(15)` / `cornerRule` | 1.4 / 2.1 KB |
| `doubleRule(392)` / `doubleRule(408)` | 10.0 / 10.1 KB |
| leader 120 | 2.4 KB |
| perforation 280 | 2.4 KB |
| "01" / "08" at cap 40 | 2.7 / 6.0 KB |
| "Nº 0100" / "Nº 0888" at cap 64 | 12.6 / 21.9 KB |

Before judging, "0888" alone was 11 paths and 54 KB. The largest new path is Dex Logged's cluster at 29.4 KB, on an empty screen, mounted once and cached.

### A.3 New components (each is a painting module, fenced by rule 17)

All are `React.memo` and HIDDEN (v4.6 A.2: `pointerEvents="none"`, `accessible={false}`, `accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"`). Each is a View of its nominal box with the ink in an offset Svg (`overflow: visible`), exactly as `PenMarks`' `Ink`. Callers place boxes, never ink.

| Module | Export | Props (exact) | Paints |
|---|---|---|---|
| `PenMarks.tsx` | `PenSwash` | `scale?: number`, **`draw?: SharedValue<number>`** (through the existing `DrawOn`), `style?` | accent |
| `PenMarks.tsx` | `PenDoubleRule` | `length: number`, `seed: number`, **`draw?: SharedValue<number>`** (through the existing `DrawOn`: the window is the ink's box, so both strokes draw in it, Home's stories rule only, C.1), `style?` (box length x 10) | accent |
| `DoodleMarks.tsx` | `Doodle` | `name: DoodleName`, `scale?: number`, `rot?: number`, `style?` | accent |
| `DoodleMarks.tsx` | `EndMark` | `name: DoodleName`, `style?` (C.10: `signature(name, rot)`, its rotation from the table, a View of its nominal box, `alignSelf: 'flex-end'`) | accent |
| `DoodleMarks.tsx` | `EmptyMarks` | `name: DoodleName`, `kind: 'icon' \| 'art'` (C.9). A zero-size absolute View at the picture's (0, 0), holding `emptyCluster(name, kind)`: one path. | accent |
| `DoodleMarks.tsx` | `PenCrown` | `face: 40 \| 32`. It places itself, like PlateDrip, as an absolute child of the avatar's own wrapper: s = face / 40, box at `{ left: 22.5·s, top: −13.5·s }`, `crown(s, 8)`. | accent |
| `DoodleMarks.tsx` | `PenArrow` | none. A zero-size absolute View at `{ top: 0, left: '100%' }` of the action's wrapper, so its frame is the key's top-right corner; `arrow(ARROW.from, ARROW.to, ARROW.bend)`, that is `arrow([62, −24], [14, 24], −14)`. | accent |
| `FrameMarks.tsx` | `PostCorners` | `top?: boolean` (default true), `foot: 'rule' \| 'corner'` (C.1) | accent |
| `PressMarks.tsx` | `PressNumeral` | `text: string`, `cap: number`, `style?`; ink in `colors.rule`, passed as `fill` | grey |
| `PressMarks.tsx` | `PressLeader` | `dots?: boolean` (default true). It measures its own width (`onLayout`, quarter points) as PenMargin does. Its View is always laid out (C.5); `dots={false}` paints nothing. Ink in `colors.lineControl`, as `fill`. | grey |
| `PressMarks.tsx` | `TicketCard` | `pressed: boolean`, `head: ReactNode`, `children: ReactNode`, `style?` (C.6) | greys |
| `Paper.tsx` | `Paper` | none (A.5) | an image |

**Measuring** costs one extra render, so only these may do it, and none is ever inside a recycled cell:

- PenMargin, PressLeader, TicketCard (the card and its head) and Paper (its box);
- IngredientRow's `onTextLayout` (C.5).

PostCorners, PenCrown and EndMark, the marks that sit in or beside list cells, measure nothing.

### A.4 The press is never red

PressMarks.tsx and Paper.tsx may not name any accent token, and may not import a pen module (E). A grey mark is printed, and printing is never the hand's colour.

| Mark | Colour | Contrast on the page | Note |
|---|---|---|---|
| Numerals | `colors.rule` (#C4C4C4) | 1.74:1 | Hidden from VoiceOver, so not text for contrast (G). The 1pt ring, cap 40 and cap 64 sizes make them visible at arm's length. |
| Leaders | `colors.lineControl` (#8A8A8A) | 3.45:1 | |
| Ticket perforation | `colors.rule` | 1.60:1 on the wash | Not `hair`, which was 1.33:1 and did not read. |

### A.5 The paper

- **Asset.** `assets/details/paper@2x.png` (256 px, 25 KB) and `@3x.png` (384 px, 53 KB).
  - Each is a seamless 128 x 128pt tile of BLACK AT A LOW ALPHA (grey plus alpha).
  - Generated by `scripts/build-paper.mjs`, ported from `tools/grain.mjs` (fixed seed, mulberry32, `--check`).
  - **Tooth (bolder pass):** periodic value noise in 4.8pt, **2.4pt** and 1.2pt cells (±0.6%, **±1.2%**, ±0.6%), plus ±0.4% grit.
  - 30 fibres a tile: arcs 0.35pt wide and 3 to 9pt long, at +1.6% at their middle.
  - **No flecks.** They were the darkest pixels and read as dust on the glass.
  - The alpha mean is 1.62% (the page reads #FBFBFB). The darkest pixel is 4.14% at 2x and 4.32% at 3x, both #F4F4F4; no pixel can pass 5.5% (#F1F1F1), which the generator clamps.
  - One hue by construction (R = G = B), so check-contrast's ONE HUE holds and no token is added.
  - **Why the cells moved, not only the amplitude.** At 3.2 and 1.2pt the tooth was 17 to 47 cycles a degree at 50cm, where the eye needs several percent of contrast, so at ±0.65% it was below threshold on a device at arm's length: invisible, as the board showed. The 2.4pt cell sits at 7 to 12 cycles a degree, where the eye is most sensitive, so ±1.2% reads as a sheet's tooth. Cells of 8 to 13pt (a pulp's clouds) were tried and rejected: they showed the 128pt tile as a lattice of repeating blotches, which reads as a dirty screen. Fewer fibres (30, not 36) leave no landmark to repeat.
  - The paper is part of what makes a screen less empty now, never the whole of it: every screen that felt empty also gains marks (C, D.1).
- **Component: a tile grid, never `resizeMode="repeat"`.**
  - Fabric draws a repeat image as a tiled resizable UIImage. CALayer can only stretch, so UIKit pre-renders the tiling into a backing store the size of the view, about 15 MB for a full screen at 3x, per instance. With about 15 instances mounted, that cost is not acceptable.
  - Instead, `<Paper/>` is a wrapping View, `StyleSheet.absoluteFill`, `overflow: 'hidden'`, `pointerEvents="none"` and HIDDEN, placed as the **first child** of its surface.
  - It measures its box (`onLayout`) and renders `ceil(w / 128) x ceil(h / 128)` React Native `Image`s of the tile, each 128 x 128 at `(128·i, 128·j)` with `resizeMode="stretch"`. That is 32 for a full 440 x 956 screen and 4 for a bar.
  - Every tile is the same decoded bitmap (576 KB at 3x), and each UIImageView shows it as its layer's contents, with no backing store of its own.
  - It renders nothing until it has measured; a grain one frame late cannot be seen.
  - It is React Native's `Image`, not expo-image, so rule 9 (which follows the import) does not apply. The tile is decorative and fixed-size.
  - It is static and outside every scroll view, so content scrolls over a fixed paper, with no per-frame or per-cell cost.
  - The tile stays 128pt, so the decode stays 576 KB at 3x and under React Native's 2 MB per-image cache cap. A 256pt tile would hide the repeat better but decodes to 2.4 MB, past the cap, so each instance could decode its own.
- **Accessibility flags, read once.** A module-level store in Paper.tsx:
  - It reads `AccessibilityInfo.isReduceTransparencyEnabled()` and `isInvertColorsEnabled()` at import, and subscribes to `reduceTransparencyChanged` and `invertColorsChanged`.
  - `useSyncExternalStore` returns `known && !reduceTransparency && !invertColors`, so Paper renders nothing until the flags are known.
  - The grain never flashes for those readers: an inverted grain would be white specks on black.
- **Where (exactly these surfaces).** Each is the content branch's root; error and unknown-item branches stay as today.

  | Surface | File (package) | How |
  |---|---|---|
  | Home | `(tabs)/index.tsx` (F1) | root; see the Dock below |
  | Home's bar and status strip | `home/HomeChrome.tsx` (F1) | first child of `bar` and of `strip`; see the Dock below |
  | Dex | `(tabs)/dex.tsx` (F2) | root, `styles.header` (the Animated.View, first child), its ScreenTopBar `paper` |
  | Drink page | `drink/[id].tsx` (F2) | root, ScreenTopBar `paper` |
  | Custom drink | `custom/[id].tsx` (F2) | root, ScreenTopBar `paper` |
  | Both drink pages' pinned bar | `DrinkPanels.tsx` `PinnedPostBar` (F2) | its bar's first child |
  | Tournaments | `tournaments/FriendsBoard.tsx` (F3) | the main root, ScreenTopBar `paper` |
  | A tournament's page | `tournaments/[id].tsx` (F3) | both roots, both ScreenTopBars `paper` |
  | Saved | `(tabs)/saved.tsx`, `collections/AllSaved.tsx` (F4) | root, ScreenTopBar `paper` |
  | Profile, yours | `profile/ProfileView.tsx` (F4, `isOwn` only), `(tabs)/profile.tsx` (F4, its fallback) | root, ScreenTopBar `paper` |
  | Activity | `activity.tsx` (F4) | root, ScreenTopBar `paper` |
  | The tab bar's slab | `FloatingTabBar.tsx` (F4) | the `bar` View's first child; the ground only |
  | A lazy tab's placeholder | `TabPlaceholder.tsx` (F0) | the root's first child, page ground only (not Reels) |
  | The bars above | `ScreenTopBar.tsx` (F0) | the bar View's first child when `paper` is passed and `ground !== 'clear'` |

  - **ScreenTopBar has no paper by default.** It is used by 31 files, including sheets, windows, sign-in and Settings, so only the ten files above pass `paper`, and rule 17 fences the prop (E.2).
  - Noise against offset noise shows no seam, so the bar's paper meets the root's without a step.
- **Never.**
  - Wash or press surfaces (fields, chips, cards, your row), photographs and prints, ink grounds (reels, the story viewer, the intro film). A wash on the paper's mean is 1.05:1 (1.09:1 on white); no wash surface is identified by its edge (white spec 1.2 measures their words), and the device check below includes whether they still read as surfaces.
  - Sheets and windows, onboarding, sign-in and AuthGate's inline sign-in, Settings, My Bar (off behind its flag), and pushed list pages not in the table.
  - The 2pt white knock-out rings round overlapping faces stay `colors.bg`.
- **The Dock.** v4.6 B.3 swaps the film's white for Home's ground on identical pixels. Home's three Papers (root, bar, strip) are wrapped in the existing `<Rise group="chrome" pointerEvents="box-none" style={StyleSheet.absoluteFill}>` (`components/DockRise`), so the grain arrives with the chrome group (t 160, opacity linear over 64ms) and the swap frame stays the white it was. The tab bar's slab is already inside the chrome Rise (`(tabs)/_layout.tsx`).
  - Paper.tsx itself imports no Reanimated, so FloatingTabBar stays free of it.
  - At rest the clock is 1, so the paper is simply there.

---

## B. Motion: the swash signs each tab as it opens

Jan asked for the line he likes to draw itself in each time a tab opens. It never loops and it rests drawn.

- **Hook.** `useTabArrival(): SharedValue<number>` in `details/tabArrival.ts`.
  - Reanimated only (`useSharedValue`, `withDelay`, `withTiming`, `cancelAnimation`), read and written with **`.get()` / `.set()`**, the repo's React Compiler convention.
  - Never `entering`, `exiting` or `layout` (rule 3), and never a timed RN Animated (rule 15).

  ```ts
  export const ARRIVAL = { delay: 140, duration: 280, settle: 400 } as const; // ms; Easing.out(Easing.cubic)
  // draw starts at 0 (1 under Reduce Motion). It draws to 1 on each NOT-FRONT -> FRONT change,
  // and is reset to 0 400ms after each FRONT -> NOT-FRONT change.
  ```

  - **Front** means the tab navigator's own state, `navigation.getState()`, with `routes[index].key === useRoute().key`. It is read on mount and on every `navigation.addListener('state', …)`, exactly as `(tabs)/bar.tsx` does. It is never `useIsFocused` alone: a push over the tabs and the pop back are not a tab opening.
  - **Start undrawn.** A lazy tab mounts when a drag toward it starts, so it mounts behind. Starting at 0 means the page slides in undrawn and signs when it lands; a start at 1 would show drawn, then blank, then drawn.
  - **It arrives** (front, and it was not, including mount in front): `cancelAnimation(draw)`, `draw.set(0)`, then `draw.set(withDelay(140, withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) })))`.
  - **It leaves** (it was front, and is not): `draw.set(withDelay(400, withTiming(0, { duration: 0 })))`. The reset happens after the page has gone, so the outgoing title never visibly un-draws.
  - **Safety.** On any focus with `draw.get() < 1` and no arrival queued, run the arrival, so the swash cannot be left undrawn in front.
  - **Reduce Motion** (`useReducedMotion()`): start at 1, never reset, never run.
  - **Device check (acceptance).** Does pager-view 8 on iOS change the index at finger lift or at settle? The 140ms delay assumes it changes at settle on a swipe and at once on a tap (the pager then glides about 250ms).
- **Where.**
  - ScreenTopBar's lg branch renders the swash through a child, `function TitleSwash({ scale })`, which alone calls `useTabArrival()` and passes `draw` to `PenSwash`. Hooks stay unconditional in ScreenTopBar, a focus change re-renders the swash alone, and no `title === ''` bar draws one.
  - Every lg bar is a tab root: Dex, Saved, All saved, Tournaments, your Profile, and My Bar (behind its flag). Keep the lg swash on tab roots; on a pushed screen the hook would read the stack.
  - **Home's stories rule (O-2, settled yes).** `TodaysPours` draws its stories rule, now the doubled `PenDoubleRule` (C.1), with `draw` from `useDerivedValue(() => Math.min(HOME_RULE_DRAW.get(), arrival.get()))`, where `arrival = useTabArrival()`. Both strokes draw in the one window, the upper (Pen's mock) leading by its own 1.5% of length.
    - On a cold start the Dock's later draw-on (560 to 880ms) governs.
    - After that, every return to Home signs the page. Home is the most-opened tab, and without this the motion Jan asked for never played there after launch.
- **TabPlaceholder draws no swash** (its PenSwash import and DETAIL_SITES entry go; F0). The real bar mounts and draws in.
- **What does not move.** A tournament's page keeps its static swash, since it is a pushed page. Everything else is static.
- **Frames.** `board/shots/sheet.png`, the Motion row: 0%, 25%, 50%, 75%, 100%. The window slides while the ink stands still.

---

## C. Placements (exactly these)

Reference layout 440 x 956. "Clear" means ink to the nearest photo, face or text.

### C.0 Home at rest (bolder pass)

The lead's read of the judged board: Home at rest barely changed. Two moves make it change, and both are singular or are the post's own frame, never a mark per row of content:

- **The stories rule is doubled** (C.1, TodaysPours). The rule Jan likes stays exactly itself as the upper stroke; the double rule that landed on Tournaments and the drink page adds the lower one, so Home's two halves (stories, then the feed) are divided the way the board's halves and the spec card are.
- **The post's corners are 15pt arms at the logo's weight** (C.1, PostCard), not 10pt slivers at 1.2.
- **Rejected after rendering: a drip off the stories rule** (`tools/frames.mjs` `dripRule`, `shots/rejected-stories-drip.png`). The plate's drip at 0.7 of the rule hung under one story of a tray that scrolls; a mark under one face reads as a pointer, "this one", and that is a state.
- With the paper now seen (A.5), Home at rest gains three visible changes: the second stroke, the corners, the ground. Rendered: `board/shots/home.png`; before and after: `board/shots/pair-home.png`.

### C.1 Home · the stories rule doubled, the post as a print (crop corners)

- **The stories rule.** `TodaysPours`' rule band keeps its 10pt and its place. Its mark becomes `<PenDoubleRule length={width − 2·layout.feedGutter} seed={PEN_SEED.stories} draw={draw} />` (408, 358 at 390) at `{ position: 'absolute', left: 16, top: −3.5 }`, 2pt higher than the single rule's −1.5:
  - the upper centreline sits at the band's top (−0.1), 12.1pt under the story labels' baseline (9pt under their descenders);
  - the lower centreline sits 3.1 into the band, **12.9pt above the first post's story ring**, so the 12pt ring clearance (v4.6 A.3) holds; at the single rule's −1.5 it would have been 10.9;
  - no layout moves: the band, the tray's foot and the feed's first row are where they were.
  - The upper stroke is `penRule(408, 0)`, Pen's mock to 1e-15, and still draws on at the Dock (v4.6 B.4) and on each Home arrival (B).
- **Rejected after rendering: trim ticks on the photo.** A feed photo is full bleed, so a crop mark outside it can only be a dash at the screen edge. Rendered (`shots/rejected-trim-ticks.png`), it reads as a rendering fault.
- **Adopted: the POST is the print.** `PostCard` draws `<PostCorners top={cornerTop} foot={closingRule ? 'rule' : 'corner'} />` as absolute children of the card's root. It is the anti-diagonal pair, **8pt in from the screen's edges**, with **15pt arms** (bolder pass; they were 10):
  - **Top right:** `cornerL(15, 'tr')` at `{ top: 3, right: 8 }`. The corner is at (432, 3) and its arms run to x 417 and y 18.
    - It is 13pt clear of the ••• glyph's ink (the arm's end at (432, 18) to the last dot's top at (419.4, 24.8)), and 34pt above the photo.
    - **Not on the first post**: `(tabs)/index.tsx` passes `cornerTop={index > 0}`. The first row's corner would sit 10pt under the stories rule's lower stroke.
  - **Bottom left, on Home: `cornerRule()` at `{ left: 8, bottom: 3 }`.** The corner and the closing rule are ONE stroke. It rises 15pt at x 8, turns, and runs along the old rule's line (h − 3) to x 40, where the 24pt rule ended. **It replaces PostCard's PenRule**, so the 2pt seam the judges saw cannot exist.
    - Its upright's top (h − 18) is level with the time line's baseline and 8pt left of it, in the gutter: beside the words, never under them.
  - **Bottom left, on the post page** (`closingRule={false}`): `cornerL(15, 'bl')` at `{ left: 8, bottom: 3 }`, alone.
- **Never on the photo** (rule 11). The nearest ink is 34pt above it, with the header between.
- **Cost.** Two cached constant paths, placed by the card's own edges, with no layout, no state and no measuring in the cell. `PostCard`'s `CLOSING_RULE` constants and its PenRule import retire.
- Rendered: `board/shots/home.png`; before and after: `board/shots/pair-home.png`.

### C.2 Home · the end of the feed

`(tabs)/index.tsx` `footer` (only when the feed has posts): `<EndMark name="coupe" style={{ marginTop: 10 }} />` is the footer's first child.

- With the footer's 8 of padding it sits 18 under the last post: the signed coupe (C.10), 56 x 64.8, its box's right edge on the footer's content edge (x 416), and the footer's 12 gap follows it.
- Rendered: `board/shots/home-end.png`.

### C.3 Home · empty

The art-led EmptyState (Negroni) with `doodle="coupe" arrow place="optical"`: the cluster (two crop corners, the coupe low left and a lime high right, both at 1.5) and the arrow to "Find friends" (C.9).

- The list's `contentContainerStyle` gains `flexGrow: 1`.
- Rendered: `board/shots/home-empty.png`.

### C.4 Dex · numbered heads

- **`SectionHead`** gains `ordinal?: number` (1-based, For-you heads only) and `rest?: boolean` (Everything else). `dexRows.ts` sets `ordinal: stops.length + 1` on each For-you head, before the push, and `rest: true` on `head:rest`.
- **The figure.** With `ordinal` and `fontScale <= 1.3`, the head draws `<PressNumeral text={pad2(ordinal)} cap={40} />` ("01", "02", …) at the gutter, 10 above the head's line.
  - It is a SIBLING of the "See all" Pressable, before it, so a press never dims a figure. The `after` 8 for a non-first head moves onto the figure's wrapper.
  - `export const NUMERAL_BAND = 50` (the cap 40 plus 10).
  - At 440 the first figure spans y 234 to 274 under the chips' foot at 210 (24 clear), and its title follows at 284.
- **The rest head** draws no figure; the lone Nº is gone. Its head rule becomes `<PenDoubleRule length={width − 48} seed={PEN_SEED.restHead} />` in the same 7pt spacer at top 3. The lower stroke falls into the 12 under it, leaving 8.8pt to the first prints. Meaning: For you ends; the catalogue begins.
- **`dex.tsx`:** a head row's estimate is `headEstimate + (r.ordinal && fontScale <= 1.3 ? NUMERAL_BAND : 0)` (it only feeds `onScrollToIndexFailed`).
- **By number** has no heads, so no figures; the Nº rail is its numbering.
- **The grid's end.** ListFooterComponent at rest (no text query, no chip, slider or status filter, at least one row; the NotTheOne footer wins when it shows): `<EndMark name="lime" style={{ marginTop: 18, marginRight: 24 }} />`.
- **The grid's end** is signed: the lime and the swash under it (C.10).
- **Empties.** Only Logged (`nothingCollected`) opts in: `doodle="lime" arrow place="optical"`, with the list's `contentContainerStyle` gaining `flexGrow: 1`. The cluster is the corners round the Ramos proof, the lime low left and the shaker high right; the arrow goes to "Show every drink", which leads to the whole catalogue. Search misses and filter misses stay bare (C.9).
- Rendered: `board/shots/dex.png`, `board/shots/dex-empty.png`.

### C.5 Drink page · the spec as a menu card

- **The lead.**
  - `Section` gains `lead?: ReactNode`, drawn above its head inside the section's 32 top margin.
  - `SpecSection`, `ServeSection` and `CompositionSection` each gain `number?: number | null`. When it is passed (not `undefined`), the section builds the lead, in this order:
    1. `<PenDoubleRule length={width − 48} seed={PEN_SEED.spec} />` (box 10);
    2. 16pt;
    3. when `number` is a number and `fontScale <= 1.3`, `<PressNumeral text={\`Nº ${formatDexNumber(number).slice(1)}\`} cap={cap} />` ("Nº 0100", the plate's own form), with `cap = Math.min(64, Math.floor((width − 48) / numeralWidth(text, 1)))`; then 12pt;
    4. the existing head.
  - That gives 102pt at cap 64. The widest number, "Nº 0444", sets cap 61 at 390pt wide and 58 at 375pt.
  - `drink/[id]` passes `number={drink.dexNumber}` to the first how-section it draws: SpecSection when there is a recipe, else ServeSection, else CompositionSection. The figure is the same grey whether the drink is caught or not.
  - `custom/[id]` passes `number={null}` to its first how-section, so it gets the double rule without a figure.
- **Leaders (O-1, settled yes).** In the non-stacked mode, IngredientRow becomes **item ··· amount**, aligned on the first baseline (`alignItems: 'baseline'`):
  - `[item Text (flexShrink 1, with its note), onTextLayout → lines]`
  - `[<PressLeader dots={hasAmount && lines === 1} /> (flex 1, minWidth 16, marginHorizontal 6, height 4)]`
  - `[amount column: amount (specAmount, tabular) over metric (small muted, tabular), right-aligned]`
  - The leader is a childless View, so its Yoga baseline is its bottom edge, and that sits on the item's baseline.
  - **The leader's View is always laid out.** Only the dots are skipped, when the item wraps or there is no amount, so wrapping cannot unwrap and loop.
  - The row's label follows the new visual order: item, amount, metric, note.
  - **Stacked mode** (fontScale > 1.3, or an amount wider than its column) is exactly today's layout.
- **Unchanged.** Steps keep their bare muted figures, and Method, Garnish, Serve and Composition keep their Detail rows. The margin rule, column rule and drip stay. "Remove from collection" has no mark within its section.
- Rendered: `board/shots/drink.png`.

### C.6 Tournaments tab

- **The board rule becomes the double rule.** `<PenDoubleRule length={fullCard} seed={PEN_SEED.board} />` in the same 24pt band at top 7.
- **The crown.**
  - FriendRow wraps its Avatar in a plain `<View>` and, when `ranked && row.place === 1`, adds `<PenCrown face={FACE} />` inside it.
  - The crown is anchored to the Avatar's own box, so the rank column's growth with Larger Text never moves it. It perches off the face's top right, 0.5pt above it, tilted 8°.
  - Ties draw a crown on each leader, because they share the place. Never at 0 entries, and never the only cue: the "1" is still there and still spoken.
- **Ticket cards.** TournamentCard swaps `ui.Card` for `<TicketCard pressed={pressed} style={styles.card} head={<>{nameRow}{meta}</>}>{standings}</TicketCard>`, where the standings View loses its `marginTop: 10` because TicketCard owns the gap. TicketCard:
  - lays out `head`, a 10pt gap, then `children`, inside padding 16 (12 at the bottom), radius 8;
  - draws a plain View in `colors.bgSunk` (`colors.press` when pressed) until it has measured both itself and its head (quarter points), so no frame is unfilled;
  - then draws an absolutely filled Svg (`accessible={false}`, under the children) holding `ticket(w, h, at)` in that fill and `perforation(10, w − 10, at)` in `colors.rule`, with `at = 16 + headHeight + 5` (63 at default size). The notches are centred in the gap, so Larger Text moves them with it.
  - The whole card stays the one button it was; nothing red sits on it.
- **The Friends list's end.** `<EndMark name="shaker" style={{ marginTop: 18, marginRight: 24, marginBottom: 9 }} />` (signed, C.10) is the footer's first child, when there is at least one row besides yours and `!followsNobody`. It is never beside the "Find people to follow" link line.
- **Unchanged by the bolder pass** apart from the signed end and the crown taking the doodles' weight (2.1): this tab landed.
- **Empties.** None opt in: the tab's only EmptyState is the feature gate ("Tournaments are not here yet").
- Rendered: `board/shots/board.png`.

### C.7 A tournament's page

- **Crown** on the Leaderboard's rank-1 row while `state === 'live'`: the Avatar wrapped in a plain View with `<PenCrown face={32} />`, the crown at s 0.8. When it is finished, the trophy stands in place of the "1" and there is no crown.
- The swash under the name stays, static. Paper as in A.5.
- **No winner ticket.** One ticket form, in one place, the tab's cards (J).

### C.8 Saved and Profile

- **Saved** (`(tabs)/saved.tsx` and `AllSaved.tsx`):
  - Nothing saved: the art-led EmptyState with `doodle="olive" place="optical"`, with `contentContainerStyle` gaining `flexGrow: 1`. The cluster has three doodles round the Paper Plane proof: the olive pick low left, a twist high right and a cherry low right. It has no action, so no arrow. Rendered: `board/shots/saved-empty.png`; before and after: `board/shots/pair-saved-empty.png`.
  - The tiles' end (at least one row): `<EndMark name="olive" style={{ marginTop: 18, marginRight: 24 }} />` (signed) as the ListFooterComponent, or its first child when there is one.
  - Covers get NO corners: they are pressable mosaics, which makes them keys.
- **Profile (yours)** (`ProfileView.tsx`, `isOwn` only):
  - The grid's end: `<EndMark name="twist" style={{ marginTop: 18, marginRight: 24, marginBottom: 9 }} />` after the grid, above "Showing the latest N of M" when that note shows. Rendered: `board/shots/profile.png`.
  - Empty posts: art-led with `doodle="twist"`, staying top-placed (its header already fills the top; J): the twist low left and a cherry high right. **No arrow:** its key is "Post a drink", and no mark ever points at a key that posts or logs a drink (App Store 1.4.3; D.2).
  - Other people's profiles: only their "No posts yet" empty, `doodle="twist"`.

### C.9 Empty states (opt-in, one composition, no new words)

- **EmptyState (`ui.tsx`) gains three props:**
  - `doodle?: DoodleName`, default none: **nothing draws unless a caller opts in**;
  - `arrow?: boolean`;
  - `place?: 'top' | 'optical'`, default `'top'`.
- **`tone="dark"` and `icon="alert"` always draw nothing**, whatever is passed.
- **Structure:**

  ```tsx
  <View style={[styles.empty, place === 'optical' && styles.emptyFill /* flexGrow: 1 */, tone === 'dark' && styles.emptyDark]}>
    {place === 'optical' ? <View style={{ flexGrow: 38 }} /> : null}
    <View style={styles.picture /* position 'relative', overflow 'visible' */}>
      {art ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{art}</View> : <Icon … />}
      {marks ? <EmptyMarks name={doodle} kind={art ? 'art' : 'icon'} /> : null}
    </View>
    {title}{body}
    {action ? (
      <View style={styles.emptyActionBox /* marginTop: space.xl; NO accessibility props */}>
        <Button … style={styles.emptyActionKey /* minWidth 200 */} />
        {arrowShown ? <PenArrow /> : null}
      </View>
    ) : null}
    {secondaryAction}
    {place === 'optical' ? <View style={{ flexGrow: 62 }} /> : null}
  </View>
  ```

  - **The action's wrapper is a plain View, never hidden**, so VoiceOver still reaches "Find friends" and the rest. Only the marks' own Views are hidden (A.3).
  - `arrowShown = arrow && art && fontScale <= 1.15 && windowWidth >= 372`.
    - The arrow's frame is the key's top-right corner, and its start is 62pt right of it. With the 200pt minimum key the start sits at W/2 + 162: 12pt right of the 300pt body's edge, and inside the 24pt gutter from W 372, so every supported iPhone (375 and up) shows it.
    - The cut-off is 1.15, not the 1.3 used elsewhere, because above it "Show every drink" outgrows the 200pt key (219pt at 1.3) and would push the start past the gutter on a 375 phone. Both labels fit 200 up to 1.15.
- **The optical place (O-3, settled yes).** The composition's top sits at 38% of the free height between the list's header foot and its bottom padding. It works only where the EmptyState is the list's ListEmptyComponent (or every wrapper between them carries `flexGrow: 1`), and the list's `contentContainerStyle` has `flexGrow: 1`. Five callers use it: Home, Saved, All saved, Dex Logged and Activity.
- **The opt-in table (the whole of it).** Every other EmptyState in the app is bare: errors, dead ends ("Unknown drink", "Post unavailable", "Place unavailable", "This tournament is not available", "This collection isn't here any more"), feature gates, search and filter misses, sheets and windows (LikersSheet's two, MusicPicker, TagPeopleSheet, InvitePicker, add-drink), the reels' dark empties, Blocked, and Hold and Notice.

  | File | Empty state | `doodle` | Kind | `place` | `arrow` | Package |
  |---|---|---|---|---|---|---|
  | `app/(tabs)/index.tsx` | Nothing posted yet | coupe | art | optical | yes | F1 |
  | `app/(tabs)/dex.tsx` (GridEmpty) | Nothing logged yet | lime | art | optical | **yes** | F2 |
  | `app/tournaments/index.tsx` | No tournaments yet | shaker | icon | top | no | F3 |
  | `app/(tabs)/saved.tsx` | Save drinks to find them here | olive | art | optical | no | F4 |
  | `components/collections/AllSaved.tsx` | Save drinks to find them here | olive | art | optical | no | F4 |
  | `components/profile/ProfileView.tsx` | Post your first drink (yours) | twist | art | top | no | F4 |
  | `components/profile/ProfileView.tsx` | No posts yet (theirs) | twist | icon | top | no | F4 |
  | `app/activity.tsx` | No activity yet | cherry | icon | optical | no | F4 |
  | `app/saved/[id].tsx` | Nothing here yet | olive | icon | top | no | F4 |
  | `app/connections/[id].tsx` | No followers yet; Not following anyone yet (both) | coupe | icon | top | no | F4 |
  | `app/find-friends.tsx` | No one else here yet | coupe | icon | top | no | F4 |

- **The clusters (bolder pass).** Each composition is ONE path, `emptyCluster(name, kind)` (A.2), drawn by `EmptyMarks` at the picture's (0, 0). The tables live in `doodlePath.ts` as `ART_CLUSTER` and `ICON_CLUSTER`, ported 1:1 from `tools/doodles.mjs`. Each row is a doodle, its scale and its baked rotation, and its nominal box's top-left in the picture's frame.
  - **Rules every row keeps:** 14pt off the print (12 off a glyph), 10 off a crop corner, 14 above the title, no ink above −6 (art) or −36 (icon) so a top-placed state keeps 12 under its header, and inside the 24pt gutters at 375 (art boxes within x −103 to 223 of the print). Never two of one doodle in a cluster, and never more than three.
  - **Art-led** (the 120 x 150 EmptyArt print at (0, 0)): `cropCorners(120, 150)`, the anti-diagonal pair 6pt off the print with 15pt arms, and the doodles at 1.5 outside the print's sides: the subject low on the left, beyond the bottom corner, and a partner high on the right, beyond the top one. The whole cluster runs along the corners' own diagonal, one slanted band rising to the right like the swash; Saved's third doodle, low right, closes it into a triangle. One doodle fewer where an arrow goes.

    | Subject (callers) | Low left | High right | Low right | Arrow |
    |---|---|---|---|---|
    | coupe (Home) | coupe 1.5, −10° at (−80, 74) | lime 1.5, 8° at (140, 14) | none | yes |
    | lime (Dex Logged) | lime 1.5, −8° at (−86, 80) | shaker 1.5, 10° at (142, 4) | none | yes |
    | olive (Saved, All saved) | olive 1.5, −4° at (−102, 64) | twist 1.5, 8° at (142, 2) | cherry 1.5, 10° at (140, 86) | no action |
    | twist (Profile, yours) | twist 1.5, −6° at (−70, 78) | cherry 1.5, 10° at (140, 10) | none | no (1.4.3) |

    A subject with no row (none today) draws the corners and the subject alone, at 1.5, −8° at (−80, 74).
  - **Icon-led** (the 36pt glyph's box at (0, 0)): the subject up left and a partner up right, both tops 36 above the glyph, an arch with the glyph at its foot. Bottoms end by y 26 (a degree or two more with the rotations), so the title (16 under the glyph, at 52) keeps about 25pt clear.

    | Subject (callers) | Up left | Up right |
    |---|---|---|
    | cherry (Activity) | cherry 1.25, −14° at (−58, −36) | olive 1.1, 8° at (50, −36) |
    | shaker (No tournaments yet) | shaker 1.25, −12° at (−50, −36) | lime 1.25, 10° at (52, −36) |
    | coupe (followers, following, find friends) | coupe 1.25, −8° at (−62, −36) | twist 1.25, 8° at (52, −36) |
    | olive (a collection's "Nothing here yet") | olive 1.1, −4° at (−74, −36) | cherry 1.25, 12° at (52, −36) |
    | twist (their "No posts yet") | twist 1.25, −6° at (−55, −36) | coupe 1.25, 8° at (52, −36) |
    | lime (no caller) | lime 1.25, −10° at (−67, −36) | shaker 1.25, 10° at (52, −36) |

  - The partners are other screens' doodles only as names: no doodle means a screen, so a lime on Home says nothing about the Dex.
- **The arrow** is not in the cluster's path: `PenArrow` sits in the action's wrapper, so it follows the key wherever the words push it. It draws on the two art-led keys that lead somewhere to look: Home's "Find friends" and the Dex's "Show every drink". It is a hook from beside the body round to the key's middle, ending **14pt clear of it**, aimed at it, never touching it. Never at a key that posts or logs a drink (Profile's "Post a drink"), never at "Try again" (errors are bare), and never more than one on a screen.
- Rendered: `board/shots/home-empty.png`, `dex-empty.png`, `saved-empty.png`, `activity-empty.png`; the icon-led set on `sheet.png`; before and after: `pair-saved-empty.png`, `pair-activity-empty.png`.

### C.10 List ends (EndMark)

- **What it is (bolder pass): signed.** `signature(name, rot)` (A.2): the screen's doodle at 1.2 with its rotation, and under it `penSwash(56)`, the swash Jan likes under the tab titles, as the flourish a hand puts under a signature: the drawing, then the line, flicking up at the right. One path. It is **right-aligned** (`alignSelf: 'flex-end'`) on its parent's content edge, 18 under the list's last row, never centred in the icon slot.
  - Its box is 56 x 64.8 (coupe, twist, cherry), 56.8 x 64.8 (lime), 56 x 69.6 (shaker) and 71.2 x 79.2 (the olive, which overhangs the swash's start to the left, as a signature's initial does).
  - It was the doodle alone at 0.8 (about 29 x 35); the judged board's marks were timid there.

  | Screen | File | When | Doodle | Rot | Style |
  |---|---|---|---|---|---|
  | Home | `(tabs)/index.tsx` | the feed has posts (footer's first child) | coupe | −4° | `marginTop: 10` (with the footer's 8 of padding, 18) |
  | Dex | `(tabs)/dex.tsx` | at rest, at least one row | lime | −8° | `marginTop: 18, marginRight: 24` |
  | Tournaments | `tournaments/FriendsBoard.tsx` | a row besides yours, `!followsNobody` (footer's first child) | shaker | −12° | `marginTop: 18, marginRight: 24, marginBottom: 9` |
  | Saved | `(tabs)/saved.tsx`, `collections/AllSaved.tsx` | at least one row | olive | −4° | `marginTop: 18, marginRight: 24` |
  | Profile (yours) | `profile/ProfileView.tsx` | the grid has posts | twist | −6° | `marginTop: 18, marginRight: 24, marginBottom: 9` |
  | Activity | `activity.tsx` | `visible.length > 0`, in place of `ClosingRule` | cherry | −10° | `marginTop: 18, marginRight: 24` |

- Rendered: `board/shots/home-end.png`, `profile.png`; all six on `sheet.png`.
- **Where.** In the list's ListFooterComponent: one static node, never a cell.
- **Activity's 24pt closing rule (v4.7 #12) retires**: `ClosingRule`, `CLOSING_RULE` and the PenRule import go. A list end is signed one way everywhere.
- **Never** under a search's footer, a link line or a destructive row.

### C.11 Everything else

- **Sheets, windows** (+, edit profile, host form, the catch card), **onboarding, sign-in and Settings** stay bare (v4.6 A.4, v4.7 6.2), with no paper.
- **NotInDexYet prints, the profile grid, Activity's and the board's thumbnails** get no corners: too tight, or keys.

---

## D. Budget and the never-list

### D.1 Per screen (bolder pass)

A placement repeated down a list counts once. The logo and the seven accent places do not count, and neither does the paper (a ground). **Pen** kinds are red, **press** kinds grey, and "at rest" means the first screenful. A composition (an empty state's cluster) is one kind, however many doodles it holds; its parts are in the next table.

| Screen | Pen at rest | Pen in all | Press | Count (rest / all / press) |
|---|---|---|---|---|
| Home | stories double rule · post corners (with the foot) | + signed end mark | none | 2 / 3 / 0 |
| Home, empty | stories double rule · the composition · the arrow | same | none | 3 / 3 / 0 |
| Dex, For you | swash · head rule | + rest double rule · signed end mark | section figures | 2 / 4 / 1 |
| Dex, by number | swash | + signed end mark | none | 1 / 2 / 0 |
| Dex, nothing logged | swash · the composition · the arrow | same | none | 3 / 3 / 0 |
| Drink page, caught | margin · column · drip | + the spec's double rule | figure · leaders | 3 / 4 / 2 |
| Drink page, not yet or custom | margin · column | + double rule | figure (not on custom) · leaders | 2 / 3 / 2 |
| Tournaments | swash · double rule · crown | + signed end mark | the ticket's perforation | 3 / 4 / 1 |
| A tournament's page | swash · crown (live) | same | none | 2 / 2 / 0 |
| Saved | swash · signed end mark, or the composition | same | none | 2 / 2 / 0 |
| Profile (yours) | swash, and the composition when there are no posts | + signed end mark | none | 1–2 / 2 / 0 |
| Activity | none, or the composition | signed end mark, or the composition | none | 0–1 / 1 / 0 |
| The other opt-in empties (C.9) | the composition | same | none | 1 / 1 / 0 |
| Sheets, windows, onboarding, sign-in, Settings, errors, dead ends, loading | none | none | none | 0 / 0 / 0 |

- No screen shows more than three pen kinds at rest, more than four in all, or more than two press kinds. Home, empty, is at the cap at rest (the rule, the cluster, the arrow) and adds nothing below.
- No two marks of a kind sit side by side without content between them. A cluster's doodles are never two of one kind, and the print or the glyph sits between them.

**What a composition holds, and the visible red count.** The judges counted every red object on an empty state, the logo, the Dex key and red counts included. Before judging Home empty was 11 (with glints); the judged spec cut it to 8. The bolder pass adds a doodle per cluster:

| Empty state | Its marks | Red objects on screen (judged → bolder) |
|---|---|---|
| Home | 2 corners · coupe · lime · arrow | 8 → 9 (logo, badge, stories rule, 2 corners, 2 doodles, arrow, Dex key) |
| Dex, nothing logged | 2 corners · lime · shaker · arrow | new: 8 (swash, the red 0, 2 corners, 2 doodles, arrow, Dex key) |
| Saved, All saved | 2 corners · olive · twist · cherry | 5 → 7 (swash, 2 corners, 3 doodles, Dex key) |
| Profile, yours, no posts | 2 corners · twist · cherry | 6 → 7 (swash, the red Dex count, 2 corners, 2 doodles, Dex key) |
| Activity | cherry · olive | 1 → 2 |
| The icon-led rest | two doodles | 1 → 2 |

The red sits in three bands, never in one heap: the chrome at the top (logo, badge, the rule or swash), the cluster in the middle, the Dex key at the foot. The cluster holds the middle third of the screen, which was the blank white the lead pointed at.

### D.2 The never-list, updated

**Lifted by Jan's picks (28 Oct):**

- **"Empty states, except a tab root's own swash."** The opt-in empties of C.9 get one composition each.
- **"12pt clear of photos."** Relaxed for the frame marks only: crop corners sit 6pt off an art print, the post's corners are 34pt or more from its photo, and the Dex rest head's double rule is 8.8pt above the prints. A cluster's doodles keep 14 off the print. Still **never ON a photo** (rule 11).
- **"12pt clear of avatars."** Relaxed for the crown only, which sits 0.5pt above the face and never touches it.
- **"Static: one motion."** Plus the arrivals (B).
- **"No screen gets more than three."** Replaced by D.1.
- **"Pushed screens."** A tournament's page gains the crown; the opt-in empties on pushed screens gain their composition.
- **Ground.** The paper is new; v4.6 had no textures.
- **Layout.** The five optical empty states move down (O-3). Nothing else's layout changes, except the recipe rows (O-1) and Dex's numbered heads (+50pt each). The stories rule moves 2pt up inside its own band; the band and everything after it stay put. The signed end marks are taller than the bare doodles (65 to 79pt, was about 35), so each list's footer grows by about 30pt.

**Standing:**

- **Never on keys, buttons, chips, fields or state glyphs.**
  - The arrows end 14pt clear of their keys.
  - Tickets are the card's own fill, in greys.
  - The post's top-right corner keeps 10pt off the ••• glyph.
  - The In-your-Dex check stays grey.
- **Never the tab bar.** Its slab's ground carries the paper only.
- **Never under body text, usernames or links.** Leaders sit between an item and its amount, never under either.
- **Never on errors, dead ends, destructive actions or alerts.**
- **Never on ink or accent grounds**, except the drip (v4.6).
- **Never on sheets, windows, onboarding or sign-in.**
- **Never a state turned red, and never a mark that changes with a state.**
  - The figure is the same grey caught or not.
  - The crown only ever repeats a place that is shown and spoken. It is the one mark that follows data, and it is acceptable only because Jan asked for it.
- **Never a glyph that reads as UI:**
  - no sparkle or four-point star (the "AI" or "new" glyph);
  - no five-point star (favourite or rated);
  - no radial spinner shape;
  - no box or package;
  - no viewfinder (four brackets);
  - no coach-mark arrow at a key besides the two art-led empties' (Home's "Find friends", the Dex's "Show every drink"), never more than one on a screen, and **never at a key that posts or logs a drink** (Profile's "Post a drink", the + key, "Post Daiquiri again"): App Store 1.4.3. A pen pointing at the drinking action is an encouragement, words or not.
- **Never a mark under one item of a scrolling row** (the stories tray, the chips, the cards' rail). A mark under one face or one chip reads as a pointer, "this one", which is a state: the rejected drip (C.0).
- **Never more than three doodles in a composition, never two of one doodle in it**, and never a doodle that touches its print, glyph, title or another doodle's box.
- **Never less contrast on text** (G), and never Playfair outside DrinkName (the figures are path glyphs of Inter).
- **Retired and never to return:** Pen's ring round the caught figure and its tick (v4.6), and everything listed under "Gone" above.

---

## E. Guards

### E.1 check-design rule 17

**`DETAIL_MODULE`** becomes the five painting modules: `/(^|\/)details\/(PenMarks|DoodleMarks|FrameMarks|PressMarks|Paper)$/`. The paint-free modules stay importable anywhere: penPath, doodlePath, framePath, numeralPath, numeralGlyphs, lineMarks, handoff and tabArrival.

**`ACCENT_TIERS`** keeps `components/details/` (accent only) and gains an exception list:

```js
const ACCENT_TIER_EXCEPT = {
  'components/details/PressMarks.tsx': 'the press is printed in greys',
  'components/details/Paper.tsx': 'the paper is a ground',
};
```

For an excepted file:

- any accent token fails;
- any import of a pen painting module fails, whether `./PenMarks`, `./DoodleMarks`, `./FrameMarks` or the alias form, resolved against the file's folder. Otherwise the press could draw red through a pen component.

PressMarks hands its greys to `<Path fill>`, never as a `color=` prop, so rule 16 is not triggered.

**`DETAIL_SITES`** (replaces the table). Each entry gains an optional `within` and an optional `retiring`:

- `within`: new code reads `enclosingNames()` **at each JSX use** (opening or self-closing tag) of an imported mark, as ACCENT_FILES' `within` does for tokens.
- **Any non-JSX reference** to an imported mark fails, for example `const X = EndMark` or passing it as a prop. Only `import type` is exempt.
- `retiring`: marks a file may still import until the close-out (F5) deletes the key. Each package then passes check-design on its own result.

```js
'components/home/TodaysPours.tsx':           { marks: ['PenDoubleRule'], retiring: ['PenRule'], why: "the doubled rule under Home's stories, signed on each Home arrival" },
'components/PostCard.tsx':                   { marks: ['PostCorners'], retiring: ['PenRule'], why: "the post's crop corners; its foot is the closing rule" },
'components/dex/SectionHead.tsx':            { marks: ['PenRule', 'PenDoubleRule', 'PressNumeral'], why: "the head rule, the rest head's double rule, the section figure" },
'components/ScreenTopBar.tsx':               { marks: ['PenSwash', 'Paper'], within: ['ScreenTopBar', 'TitleSwash'], why: "the arriving swash; the bar's paper" },
'components/TabPlaceholder.tsx':             { marks: ['Paper'], within: ['TabPlaceholder'], why: "the placeholder's paper (its swash retired, B)" },
'components/DrinkPanels.tsx':                { marks: ['PenMargin', 'PenDoubleRule', 'PressNumeral', 'PressLeader', 'Paper'], why: "the record's rules; the spec card; the pinned bar's paper" },
'components/plate.tsx':                      { marks: ['PlateDrip'], why: 'the drip off the caught Nº plate' },
'components/tournaments/FriendsBoard.tsx':   { marks: ['PenDoubleRule', 'PenCrown', 'EndMark', 'Paper'], retiring: ['PenRule'], why: 'the board rule doubled, the crown, the end, the paper' },
'components/tournaments/TournamentCard.tsx': { marks: ['TicketCard'], why: 'the ticket card' },
'components/tournaments/Leaderboard.tsx':    { marks: ['PenCrown'], why: "the leader's crown while it is live" },
'app/tournaments/[id].tsx':                  { marks: ['PenSwash', 'Paper'], why: "the swash under its name; the paper" },
'app/activity.tsx':                          { marks: ['EndMark', 'Paper'], retiring: ['PenRule'], why: "Activity's end mark (its closing rule retired)" },
'components/ui.tsx':                         { marks: ['EmptyMarks', 'PenArrow'], within: ['EmptyState'], why: "an empty state's composition" },
'app/(tabs)/index.tsx':                      { marks: ['EndMark', 'Paper'], why: "the feed's end; Home's paper" },
'components/home/HomeChrome.tsx':            { marks: ['Paper'], why: "the bar's and the strip's paper" },
'components/FloatingTabBar.tsx':             { marks: ['Paper'], within: ['FloatingTabBar'], why: "the slab's ground only" },
'app/(tabs)/dex.tsx':                        { marks: ['EndMark', 'Paper'], why: "the grid's end; the Dex's paper and header" },
'app/(tabs)/saved.tsx':                      { marks: ['EndMark', 'Paper'], why: "the tiles' end; the paper" },
'components/collections/AllSaved.tsx':       { marks: ['EndMark', 'Paper'], why: 'the same' },
'components/profile/ProfileView.tsx':        { marks: ['EndMark', 'Paper'], why: "the grid's end; your profile's paper" },
'app/(tabs)/profile.tsx':                    { marks: ['Paper'], why: "the profile tab's fallback paper" },
'app/drink/[id].tsx':                        { marks: ['Paper'], why: "the page's paper" },
'app/custom/[id].tsx':                       { marks: ['Paper'], why: "the page's paper" },
```

### E.2 check-design rule 17: `DETAIL_PROPS`

`DETAIL_PROPS` lists props that place a mark through a component. It is read with the ACCENT_PROPS code: any use of the prop outside its files fails, with "places a detail mark outside its placements (DETAIL_PROPS)".

```js
const DETAIL_PROPS = [
  { tag: 'EmptyState', prop: 'doodle', files: {
    'app/(tabs)/index.tsx': 1, 'app/(tabs)/dex.tsx': 1, 'app/tournaments/index.tsx': 1, 'app/(tabs)/saved.tsx': 1,
    'components/collections/AllSaved.tsx': 1, 'components/profile/ProfileView.tsx': 1, 'app/activity.tsx': 1,
    'app/saved/[id].tsx': 1, 'app/connections/[id].tsx': 1, 'app/find-friends.tsx': 1 } },
  { tag: 'EmptyState', prop: 'arrow', files: { 'app/(tabs)/index.tsx': 1, 'app/(tabs)/dex.tsx': 1 } },
  { tag: 'ScreenTopBar', prop: 'paper', files: {
    'app/(tabs)/dex.tsx': 1, 'app/drink/[id].tsx': 1, 'app/custom/[id].tsx': 1, 'components/tournaments/FriendsBoard.tsx': 1,
    'app/tournaments/[id].tsx': 1, 'app/(tabs)/saved.tsx': 1, 'components/collections/AllSaved.tsx': 1,
    'components/profile/ProfileView.tsx': 1, 'app/(tabs)/profile.tsx': 1, 'app/activity.tsx': 1 } },
];
```

(The `1`s are the `why` strings in the code: each says what the file places.) Because doodles are opt-in, a new sheet or a dead end gets no doodle unless someone adds it here: the guard asked for in build review item 12.

**Proving it still bites.** Plant each violation, run `node scripts/check-design.mjs`, see it fail with its own message, then revert, and check that the tree passes:

1. `PenCrown` imported into `FloatingTabBar.tsx`: not its mark.
2. `Doodle` imported into `components/dex/QuickChips.tsx`: not a site.
3. `<EmptyMarks>` used inside ui.tsx's `Button`: outside `within`.
4. `const M = EndMark;` in `(tabs)/saved.tsx`: a mark referenced outside JSX.
5. `colors.accent` in `PressMarks.tsx`: the press exception.
6. `import { PenRule } from './PenMarks'` in `Paper.tsx`: the exception's import ban.
7. `colors.accentPressed` in `DoodleMarks.tsx`: the tier's tokens.
8. `import * as D from '@/components/details/DoodleMarks'`: by name.
9. A `Paper` import in `components/Sheet.tsx` (or the sheet primitive in use): not a site.
10. `<EmptyState doodle="cherry">` in `LikersSheet.tsx`: DETAIL_PROPS.
11. `<ScreenTopBar paper>` in `settings.tsx`: DETAIL_PROPS.
12. After F5: a PenRule import left in `activity.tsx`: its retiring is gone.
13. `<EmptyState arrow>` in `ProfileView.tsx`: DETAIL_PROPS (its key posts a drink; D.2).
14. After F5: a PenRule import left in `TodaysPours.tsx`: its retiring is gone.

### E.3 render-details

- **A resolve hook, not a tsconfig change.** At the top of `scripts/render-details.mjs`:

  ```js
  import { registerHooks } from 'node:module';
  registerHooks({
    resolve(spec, ctx, next) {
      try { return next(spec, ctx); } catch (e) {
        if (spec.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(spec)) return next(`${spec}.ts`, ctx);
        throw e;
      }
    },
  });
  ```

  Then load penPath, doodlePath, framePath and numeralPath with `await import(…)`, after the hook is registered (static imports would hoist above it). The app's imports stay extensionless and tsc needs no `allowImportingTsExtensions`.
- **Floor check** for every new pen mark at every scale and rotation the spec uses: the signed end marks (1.2, each table rotation), every row of `ART_CLUSTER` (1.5) and `ICON_CLUSTER` (1.1 and 1.25) through `emptyCluster`, the crown at 1 and 0.8, the arrow, the corners (arm 15), `cornerRule`, and the double rules (392, 342, 408 and 358, with seeds 0, 5, 11 and 12).
- **Glyph coverage**: every character of "Nº 0123456789" exists in `numeralGlyphs.ts`, and `numeral()` returns a shape for each text the app sets. Fail otherwise.
- **The sheet** (`build/sheet@3x.png`) gains every new mark, the ten clusters and the six signatures included.

---

## F. File ownership (final, as amended by the bolder pass)

The bolder pass changes what some rows draw, not who owns a file. One file is freed: `src/app/activity.tsx`, F4's alone now that the push package has finished (commit bd7423f never touched it). One `retiring` key is added (TodaysPours), so F5 deletes four.

**Rules for every package:**

- No file is edited by two packages, and nothing outside its own table.
- None commits, stages, pushes or resets.
- Each runs `npx tsc --noEmit -p .`, `node scripts/check-design.mjs`, `node scripts/check-contrast.mjs` and `node scripts/render-details.mjs` on its result, and reports failures in its own files. Other agents' in-flight edits may fail elsewhere; it names them and does not fix them.

**Landing order:**

1. **F0 lands first, alone.** Every prop it adds is optional, so nothing else changes behaviour.
2. **F1, F2, F3 and F4 then run in parallel.** Their files are disjoint, and DETAIL_SITES' `retiring` keys let each pass check-design on its own.
3. **F5 (the close-out) runs last**, by F0's agent.

### F0 · Foundation (marks, assets, tools, guards, and the two contract components)

| File | Change |
|---|---|
| `src/components/details/penPath.ts` | Export the helpers. Add `place`, `samplesAlong`, `lengthOf`, `line`, `loop`, `dot`, `signedArea`, `oneD`, `shapeOne`. Add `PEN_SEED.spec` 11 and `.restHead` 12, with the comment reserving 8, 14 and 15 and noting the doubled stories rule's lower stroke on 3 (A.2). No geometry change. |
| `src/components/details/doodlePath.ts` (new) | Port of `tools/doodles.mjs`: the doodles at the bolder weights (`DOODLE` 2.1 and 1.1), `DOODLE_SCALE`, `ARROW`, `SIGN`, `signature`, `ART_CLUSTER`, `ICON_CLUSTER`, `emptyCluster` |
| `src/components/details/framePath.ts` (new) | Port of `tools/frames.mjs` (`CROP` arms 15 at 1.45, `CORNER_RULE` 15 at 1.42), without `cropTick` or `dripRule` |
| `src/components/details/numeralPath.ts` (new) | Port of `tools/numerals.mjs` (no throw) |
| `src/components/details/numeralGlyphs.ts` (new, GENERATED) | Written by `scripts/build-numerals.py` |
| `src/components/details/tabArrival.ts` (new) | `useTabArrival`, `ARRIVAL` (B) |
| `src/components/details/PenMarks.tsx` | `PenSwash` gains `draw`; add `PenDoubleRule`, with `draw` (C.1) |
| `src/components/details/DoodleMarks.tsx` (new) | `Doodle`, `EndMark` (the signature, C.10), `EmptyMarks` (`emptyCluster`, one path, C.9), `PenCrown`, `PenArrow` (`ARROW`) |
| `src/components/details/FrameMarks.tsx` (new) | `PostCorners` (the empty states' corners are inside EmptyMarks' one path, so there is no `CropCorners` component) |
| `src/components/details/PressMarks.tsx` (new) | `PressNumeral`, `PressLeader`, `TicketCard` |
| `src/components/details/Paper.tsx` (new) | `Paper`: the tile grid and the accessibility store (A.5); no Reanimated |
| `assets/details/paper@2x.png`, `paper@3x.png` (new) | From `scripts/build-paper.mjs` (the same bytes as `board/assets/`) |
| `scripts/build-paper.mjs`, `scripts/build-numerals.py` (new) | Ports of `tools/grain.mjs` and `tools/extract-glyphs.py`, each with `--check` |
| `scripts/render-details.mjs` | E.3 |
| `scripts/check-design.mjs` | Rule 17: E.1 and E.2 (TodaysPours' `PenDoubleRule` with `retiring: ['PenRule']`; the arrow in two files), and the header comment |
| `src/constants/theme.ts` | Comment only: the detail tier's new marks, and the press as a use of `rule` and `lineControl`. No token changes. |
| `src/components/ScreenTopBar.tsx` | `TitleSwash` with `useTabArrival` (B); the `paper?: boolean` prop drawing `<Paper/>` as the bar's first child (A.5). Nothing else. |
| `src/components/TabPlaceholder.tsx` | The swash removed; `<Paper/>` on the page ground (not Reels) |
| `src/components/ui.tsx` | EmptyState only: `doodle`, `arrow`, `place`, the picture and action wrappers, `EmptyMarks`, `PenArrow`, `arrowShown` at `fontScale <= 1.15 && windowWidth >= 372` (C.9). Nothing else in ui.tsx. |

### F1 · Home and the feed

| File | Change |
|---|---|
| `src/components/PostCard.tsx` | `cornerTop?: boolean` (default true). `<PostCorners top={cornerTop} foot={closingRule ? 'rule' : 'corner'} />` replaces the PenRule closing rule. The PenRule import and the `CLOSING_RULE*` constants go (C.1). |
| `src/app/(tabs)/index.tsx` | Paper at the root in `<Rise group="chrome">`. `renderItem` passes `cornerTop={index > 0}`. `EndMark` coupe as the footer's first child (C.2). The art-led EmptyState gets `doodle="coupe" arrow place="optical"`, and `contentContainerStyle` gains `flexGrow: 1` (C.3). |
| `src/components/home/HomeChrome.tsx` | Paper, each in `<Rise group="chrome">`, as the first child of `bar` and of `strip` (A.5) |
| `src/components/home/TodaysPours.tsx` | The stories rule becomes `PenDoubleRule` (seed `PEN_SEED.stories`, `top: −3.5` in the unchanged 10pt band) and its `draw` is `min(HOME_RULE_DRAW, useTabArrival())` (B, C.1, O-2). The PenRule import goes. |

### F2 · Dex and the drink page

| File | Change |
|---|---|
| `src/components/dex/SectionHead.tsx` | `ordinal`, `rest`, `NUMERAL_BAND`, `PressNumeral`, the rest head's `PenDoubleRule` (C.4) |
| `src/components/dex/dexRows.ts` | `ordinal` and `rest` on head rows (and their types) |
| `src/app/(tabs)/dex.tsx` | The head estimate; `EndMark` lime at rest; Paper at the root and in `styles.header`; ScreenTopBar `paper`; GridEmpty's Logged state gets `doodle="lime" arrow place="optical"`; `contentContainerStyle` gains `flexGrow: 1` |
| `src/components/DrinkPanels.tsx` | `Section.lead`; `number` on SpecSection, ServeSection and CompositionSection; IngredientRow's leader layout and label order; Paper in PinnedPostBar (C.5) |
| `src/app/drink/[id].tsx` | `number={drink.dexNumber}` on the first how-section; Paper at the content root; ScreenTopBar `paper` |
| `src/app/custom/[id].tsx` | `number={null}` on the first how-section; Paper at the content root; ScreenTopBar `paper` |

### F3 · Tournaments

| File | Change |
|---|---|
| `src/components/tournaments/FriendsBoard.tsx` | `PenDoubleRule` in the band; the crown in FriendRow (the Avatar wrapper); `EndMark` shaker; Paper at the main root; ScreenTopBar `paper` (C.6) |
| `src/components/tournaments/TournamentCard.tsx` | `TicketCard` with `head` (C.6) |
| `src/components/tournaments/Leaderboard.tsx` | The crown on rank 1 while live (C.7) |
| `src/app/tournaments/[id].tsx` | Paper at both roots; both ScreenTopBars `paper` |
| `src/app/tournaments/index.tsx` | "No tournaments yet": `doodle="shaker"` |

### F4 · The tab bar, Saved, Profile, Activity, and the other opt-in empties

| File | Change |
|---|---|
| `src/components/FloatingTabBar.tsx` | Paper as the `bar` View's first child only |
| `src/app/(tabs)/saved.tsx` | `EndMark` olive; Paper at the root; ScreenTopBar `paper`; `doodle="olive" place="optical"`; `flexGrow: 1` |
| `src/components/collections/AllSaved.tsx` | The same |
| `src/components/profile/ProfileView.tsx` | `EndMark` twist (yours); Paper at the root and ScreenTopBar `paper` (yours only); `doodle="twist"` on both posts empties |
| `src/app/(tabs)/profile.tsx` | Paper at the fallback root; its ScreenTopBar `paper` |
| `src/app/activity.tsx` | `ClosingRule` becomes `EndMark` cherry (its PenRule, `PEN_SEED.activityEnd` use and `CLOSING_RULE` go); Paper at the root; ScreenTopBar `paper`; "No activity yet" gets `doodle="cherry" place="optical"`; `contentContainerStyle` gains `flexGrow: 1`. F4's alone: the push package has finished (below). |
| `src/app/saved/[id].tsx` | "Nothing here yet": `doodle="olive"` |
| `src/app/connections/[id].tsx` | The three "No followers / Not following" empties: `doodle="coupe"` |
| `src/app/find-friends.tsx` | "No one else here yet": `doodle="coupe"` |

### F5 · Close-out (F0's agent, after F1 to F4)

| File | Change |
|---|---|
| `scripts/check-design.mjs` | Delete the four `retiring` keys (PostCard, FriendsBoard, activity, TodaysPours). Run all four checks, plant items 12 and 14 of E.2, revert. |

### Overlaps to sequence (for the lead)

- **The push package has finished** (commit bd7423f, "Push alerts in the app"). It never edited `src/app/activity.tsx`, so that file is **F4's alone**, with no sequencing.
- **Not v4.9's, ever:** `src/components/notifications/NotificationsHost.tsx` and `AlertsOptIn.tsx` were added or changed by the push package and are its files. `AlertsOptIn` is a consent sheet, so under A.5 and D.2 it is bare: no paper, no doodle, and no DETAIL_SITES or DETAIL_PROPS entry. `NotificationsHost` is mounted from `src/app/_layout.tsx`, which no v4.9 package touches.
- **Any `scripts/check-design.mjs` change a later package needs goes through F0** (or F5). `app.json` is not touched by v4.9.
- **No other overlap.** No v4.9 package touches:
  - `src/lib/push.ts`, `src/lib/notifications.ts`, `src/components/notifications/*`;
  - Settings, `src/app/_layout.tsx`, `src/store/auth.ts`, `WelcomeConnect`, `FindFriends.tsx` (the component) or `FacebookFriends.tsx`.

  `src/app/find-friends.tsx` (the route) is F4's.
- **App Store screenshots** (`scripts/appstore-shots/`) are retaken after v4.9 lands.
- **Contracts that cross packages (fixed by this file):**
  - every component name and prop in A.3;
  - `EmptyState`'s `doodle`, `arrow` and `place`, and `arrowShown`'s two cut-offs;
  - `PenDoubleRule`'s `draw`;
  - `DOODLE_SCALE`, `ARROW`, `SIGN`, `signature`, `ART_CLUSTER`, `ICON_CLUSTER` and `emptyCluster`;
  - `ScreenTopBar`'s `paper`;
  - `PostCard`'s `cornerTop`;
  - `SpecSection`, `ServeSection` and `CompositionSection`'s `number`;
  - `SectionHead`'s `ordinal` and `rest`, and `NUMERAL_BAND`;
  - `useTabArrival` and `ARRIVAL`;
  - `PEN_SEED.spec` and `.restHead`.

---

## G. Accessibility

- **Silent.** Every mark is HIDDEN (A.3), and no mark adds a label, a hint, a trait or a touch target.
  - EmptyState's action wrapper carries no accessibility props, so the action stays reachable (C.9).
  - `TicketCard`'s card stays the one button TournamentCard was; its Svg is `accessible={false}` under the children.
  - The crown never changes what a row says ("1, maya.pours, 87 entries").
  - The figures are not read: the plate still says "Number 100, in your Dex".
  - IngredientRow's label follows the new visual order (item, amount, metric, note); no words are added.
- **Contrast on the paper (bolder pass): its mean (#FBFBFB), its darkest pixel (#F4F4F4), and the clamp no pixel can pass (#F1F1F1):**

  | Colour | On #FFFFFF | On #FBFBFB | On #F4F4F4 | On #F1F1F1 |
  |---|---|---|---|---|
  | ink | 19.80 | 19.13 | 18.00 | 17.53 |
  | textMuted | 6.69 | 6.46 | 6.08 | 5.92 |
  | accent | 5.54 | 5.35 | 5.03 | 4.90 |
  | lineControl | 3.45 | 3.34 | 3.14 | 3.06 |

  Every text pair stays over 4.5:1 and every control edge over 3:1, even on the clamp, which no pixel reaches. That is why the clamp is 5.5% and stays there: at 6.3% (#EFEFEF) lineControl would meet 3:1 exactly. Wash surfaces carry no paper, so their measured pairs are unchanged. check-contrast needs no new pair, because no token changes.
- **Dynamic Type.**
  - The swash grows with `min(fontScale, 1.3)` (v4.6).
  - Doodles, the crown, the corners and the figures never scale.
  - The Dex and spec figures hide above 1.3, and the spec figure's cap also shrinks to fit the column. The arrows hide above 1.15 (C.9: above it "Show every drink" outgrows its 200pt key).
  - The clusters and the signed end marks never scale; at large text the words grow under them and the 14pt title clearance only grows.
  - Leaders follow the row's stacked threshold.
  - Tickets measure their head, so the notches stay in the gap.
  - The crown is anchored to the face, not the rank column.
- **Motion.** Reduce Motion leaves the swash and the stories rule drawn and still (B). Nothing else moves.
- **Reduce Transparency, Invert Colours.** No paper, and no flash before the flags are read (A.5). Marks are paths on a page, so they invert with it.
- **Device checks (acceptance, a 3x iPhone, arm's length):** the paper reads as a sheet's tooth and never as dirt or a lattice, and the wash surfaces (fields, Edit profile, Host a tournament, tickets) still read as surfaces on it. If the grain reads as dirt, the step back is the 2.4pt octave to ±0.9% in `build-paper.mjs`, one number, and it goes to Jan before it ships.
- **VoiceOver order and the rotor** are unchanged.

---

## H. The board, and how to rebuild it

`tools/` is plain Node and Python (fontTools for the glyphs), with nothing installed.

| File | What it does |
|---|---|
| `pen.mjs` | Re-exports penPath.ts's real marks, and carries its private helpers verbatim, plus the new ones (`place`, `line`, `loop`, `dot`, `signedArea`, `oneD`, `shapeOne`) |
| `doodles.mjs`, `frames.mjs`, `numerals.mjs` | The new generators (port targets in A.2), the cluster tables included |
| `extract-glyphs.py` → `glyphs.json` | Inter 600's figures, N, º and the space |
| `grain.mjs` | Writes `board/assets/paper@{2,3}x.png` and prints the mean and darkest pixel |
| `build-marks.mjs` | Scans `board/index.html` for `M('<spec>', …)` (`_` stands for a space) and its MARKS_EXTRA list, and writes `board/marks.js`; fails if any pen mark's ink is under 0.4pt. `sig|name|rot` is a signed end, `cl|name|art` or `cl|name|icon` a cluster, `drule|L|seed` the rejected drip |
| `proof.mjs` → `board/proof.html` | Every generator at 1x and 2x on a 1pt grid |
| `shoot.sh <url> <png> <w> <h> [scale]` | Headless Chrome in its own profile (`/tmp/sipply-v49-details-chrome`), killing only that profile |

Rebuild (repo root):

```bash
python3 specs/v4.9/details/tools/extract-glyphs.py
NODE_NO_WARNINGS=1 node specs/v4.9/details/tools/grain.mjs
NODE_NO_WARNINGS=1 node specs/v4.9/details/tools/build-marks.mjs
B="file://$PWD/specs/v4.9/details/board/index.html"; O=specs/v4.9/details/board/shots; S=specs/v4.9/details/tools/shoot.sh
for f in home home-end home-empty dex dex-empty drink board saved-empty activity-empty profile home-before saved-empty-before; do bash $S "$B?f=$f" $O/$f.png 440 956 2; done
bash $S "$B?f=sheet" $O/sheet.png 900 1240 2
bash $S "$B?f=paper-zoom" $O/paper-zoom.png 440 350 2
bash $S "$B?f=home&v=ticks" $O/rejected-trim-ticks.png 440 670 2
bash $S "$B?f=home&v=drip" $O/rejected-stories-drip.png 440 560 2
for p in home saved-empty activity-empty; do bash $S "$B?pair=$p" $O/pair-$p.png 940 1100 2; done
# the wall: shoot $B at 1940 x 9000, scale 1, and trim the empty #ECECEC rows -> board/board.png (1940 x 5824)
```

**Fidelity.** The board's type and layout follow the code's numbers in A to C, and the optical places are computed with the lists' real bottom paddings. Its photos, avatars and names are stand-ins.

---

## O. Settled: Jan delegated these (28 Oct)

Jan delegated the six questions below to the lead on 28 Oct, with his three picks and his "it still feels too empty". The first answers stand, and the build is made on them. Each keeps its reasoning, so a later change of mind knows what it undoes.

- **O-1. The recipe rows re-order to item ··· amount** (C.5): **yes.** The menu card on the board. (No would have kept today's amount-first rows with no leaders; the double rule and the figure would have stayed.)
- **O-2. Home's stories rule redraws on each Home arrival:** **yes**, and the rule is now the doubled one (C.1). (No would have left TodaysPours reading `HOME_RULE_DRAW` alone, and Home the one tab that never signs after the cold start.)
- **O-3. The five optical empty states:** **yes.** Home, Saved, All saved, Dex Logged and Activity sit at 38% of the free height, with their clusters. (No would have kept them top-anchored.)
- **O-4. The stars he was shown are gone:** **yes, accepted.** A red five-point star reads as "favourite" and the sparkle as "AI" or "new", both states, so no star of either kind is built. The shaker takes Tournaments.
- **O-5. "A torn-ticket edge" is a die-cut stub:** **yes, accepted.** Two notches and a perforation; a ragged or zigzag edge reads as craft paper.
- **O-6. The catch card as a ticket stub** (CelebrationOverlay): **not built.** The catch moment is a window, and windows stay bare.

---

## J. Judges' notes (28 Oct): what was taken, and where I disagree

Kept as the record. Where the bolder pass (K) overturns a row, the row says so; every Build row stands.

### Taste

| # | Judge's change | Verdict | What the build does |
|---|---|---|---|
| 1 | Remove the glint everywhere | Agree | Gone. Each empty state lost three red bits. |
| 2 | Replace the star | Agree | A cobbler shaker. "Stars" were in Jan's offer, so O-4 tells him. |
| 3 | Redraw the lime (spinner) | Agree, wheel kept | Six plain teardrop segments with no lean, and no pith. A wedge was the other option; I kept the wheel because it is the canonical rim garnish and the teardrops alone remove the spinner reading. It is no longer beside a search glyph (search misses are bare) and no longer centred at a list's foot. |
| 4 | Redraw or replace the ice cube | Agree | Replaced by a twist: one stroke whose loops are the logo's cursive. |
| 5 | Crop corners four to two | Agree | The anti-diagonal pair, the same as the posts. |
| 6 | Optical centring for the art-led empties | Agree, except Profile | Home, Saved, All saved, Dex Logged and Activity. **Not your Profile:** its header (face, stats, Edit profile, the Dex line) already fills the top 380pt, so centring would move the empty state by tens of points and change a screen whose top is content. |
| 7 | Make the press visible | Mostly agree | Ring 1.0, Dex figures cap 40, "Nº 0100" printed, and the lone Nº dropped. **The cap is 64, not 72 to 80:** with "Nº " in front, the widest number is 5.55 x cap wide, so 72 would overflow 392 at 440 and 342 at 390. The set is 334pt wide at 64, wider than the judge's 225pt target for "0100" alone. The cap shrinks to fit narrower phones. **"01" stays zero-padded:** two digits with no Nº cannot be taken for a drink's four digits with Nº, and an unpadded "1" in outline is a thin stick. |
| 8 | Doodles in the logo's pen | Agree | `DOODLE.line` peaks at 1.8, the arrow at 1.55, and the interior details are cut. The rules and swash are untouched. *(Bolder pass: 2.1 and 1.85 at the doodles' larger sizes; K 4.)* |
| 9 | End marks off-centre | Agree | Right-aligned on the content edge, as a signature. |
| 10 | Crown: no dots, half the tilt | Agree | 8°, a plain three-point tag crown. |
| 11 | Arrows only on Home empty | Agree | One arrow in the app. *(Bolder pass: two, Home and Dex Logged, never at a key that posts a drink; K 6.)* |
| 12 | Tickets | Agree | Notch radius 8, the perforation notch to notch in `rule`, die-cut kept and said so (O-5). |
| 13 | Home post corners | Agree, and one step further | The gap is closed to 0 by making the corner and the closing rule ONE stroke (`cornerRule`), and the first post's top-right corner is suppressed. I also moved both corners from 4 to 8pt in from the edge, since the judge read 4pt as stray slivers. |
| 14 | Paper: drop the flecks | Agree | Gone. The darkest pixel is now #F7F7F7, the amplitude is unchanged, and the paper is never counted toward "less empty". *(Bolder pass: the flecks stay gone; the tooth moved to 2.4pt and is seen, darkest #F4F4F4; K 8.)* |
| 15 | O-2: yes | Agree | Built (B). |
| 16 | O-1: yes | Agree | Kept as the assumption. |
| 17 | Olive pick | Agree | The pick is longer and shows between olives that never touch, and the pimentos are gone. |
| — | "Home before and after look the same" | Accepted, no change | A feed of photos is not where the app is empty. Adding marks there would be the clumping Jan rejected on 9 Oct. The visible change belongs on the empty states, list ends and the drink page. *(Overturned by the bolder pass: the stories rule doubled, the corners at 15; K 1.)* |
| — | "The olive reads as a chain link" | Fixed by 17 | |
| — | "Activity reads kawaii" | Fixed by 1 and 6 | The cherry alone, at the screen's optical centre. *(Bolder pass: the cherry and an olive pick in an arch over the heart, still no glints or sparkles, which were what read as kawaii; K 9.)* |

### Build

| # | Finding | Verdict | What the build does |
|---|---|---|---|
| 1 | Paper in ScreenTopBar has no opt-in | Agree | `paper?: boolean`, ten files, fenced by DETAIL_PROPS (A.5, E.2). |
| 2 | The EmptyState wrapper hides the action | Agree | The action wrapper is plain; only the marks are hidden (C.9). |
| 3 | The swash pops on a swipe into a lazy tab | Agree | Starts at 0, arrives only on not-front → front, `.get()`/`.set()`, and the pager timing is a device check (B). |
| 4 | Packages can't pass tsc alone | Agree, solved differently | Instead of landing F4's two files early, **ui.tsx's EmptyState and ScreenTopBar move into F0**, so every cross-package prop exists before F1 to F4 start, and F1 to F4 run in parallel. `retiring` keys let each pass check-design alone, and F5 removes them. |
| 5 | Node vs tsc on `.ts` imports | Agree; the hook, not tsconfig | A `registerHooks` resolve hook in render-details (E.3). `tsconfig.json` is shared by every agent in this tree, and `allowImportingTsExtensions` would let explicit `.ts` specifiers into app code; the hook is local to one script. |
| 6 | Paper's cost with `repeat` | Agree on the risk; disagree with the fallback | `repeat` is dropped outright for a tile grid: one shared 576 KB decode and plain UIImageViews, 32 for a full screen. The judge's fallback, one window-sized image, relies on every instance sharing one roughly 15 MB decode. As I understand React Native's decoded-image cache, images over its per-image cap (2 MB by default) are not cached, so each instance might decode its own; the grid does not depend on that. The memory gate stays: all tabs visited and a drink page pushed, on a 3x device, must add 3 MB or less. Also adopted: `pointerEvents` on the wrapper, the module-level accessibility store, and a device check that the grain reads at all. If it does not, that goes to Jan rather than raising the amplitude silently. |
| 7 | Views per mark | Agree | One `d` per mark (`shapeOne`, the numeral rings joined), RDP decimation (the "Nº 0888" figure from 54 KB in 11 paths to 22 KB in 1), and `numeral()` never throws. |
| 8 | The leader layout can loop | Agree | The leader's View is always in the layout; only the dots are skipped. One frame: box L x 4, foot on the baseline, centres 1.6 above. |
| 9 | TicketCard | Agree | A plain fill until measured. The y comes from TicketCard measuring its own `head` (no measuring in TournamentCard), with the notches centred in the 10pt gap: 63 at default size. The judge's 62 was "6 above the standings"; centring in the gap reads better and is equally safe. |
| 10 | Crown anchoring; `row.place` | Agree | Anchored to the Avatar wrapper; `ranked && row.place === 1`. |
| 11 | Rule 17 details | Agree | JSX-use `within`, non-JSX references fail, the exception also bans pen-module imports, `fill` never `color=`, and Activity's PenRule is handled by `retiring`. |
| 12 | Doodles where they don't belong | Agree, and inverted | Doodles are **opt-in** (default none) through an exact table, fenced by DETAIL_PROPS. "Unknown drink", LikersSheet's two empties, every sheet and every future dead end are bare without an edit. |
| — | Push package overlap, app.json, screenshots | Agree | F, Overlaps. |
| — | Module-level `S` in the doodle port | Agree | The scale is passed in (`penAt(s)`). |
| — | Seeds 8, 14, 15 | Agree | Reserved in the `PEN_SEED` comment. |
| — | FloatingTabBar and Reanimated | Agree | Paper.tsx is static; Home's fade rides the existing `Rise` in F1's files. |

**Also dropped, by me:** the tournament winner's ticket (`axis 'x'`, `perforationV`). It was a second ticket form for a rarely seen state, and one ticket in one place is the stronger idea.

---

## K. The bolder pass (28 Oct, the lead): what changed, and what the judges' notes still hold

Jan's newest word ("it still feels too empty") outranks his 9 Oct "less stuff", which the taste judge anchored on. The lead's read of the judged board: the drink page and Tournaments landed; Home at rest barely changed; the doodles were small and lonely; the end marks timid; the empty states mostly blank white. The build blockers in J (Build) all stand unchanged: one path a mark, the tile grid, the accessibility store, the opt-in doodles fenced by DETAIL_PROPS, `.get()`/`.set()`, the leader that cannot loop, the measured ticket, the anchored crown, the resolve hook, the retiring keys.

| # | Was (judged) | Now (bolder) | Why, and what still holds |
|---|---|---|---|
| 1 | Home at rest: "changes little by design" (J, Taste, last rows) | The stories rule doubled; the post's corners 15pt at 1.45; the paper seen | **Reversed.** A feed of photos was where Jan felt it. Nothing is added per row of content: the second stroke is singular, the corners are the post's own frame. |
| 2 | (no singular mark at rest) | A drip off the stories rule, **rejected** on the render | It hung under one story of a scrolling tray and read as a pointer. New never: no mark under one item of a scrolling row (D.2). |
| 3 | Corners 10 and 11pt at 1.2 | 15pt at 1.45 | Two slivers became a frame. Still the anti-diagonal pair (taste 5): four brackets are a viewfinder. |
| 4 | Doodles at 0.7 to 1, peak 1.8 | 1.5 by a print, 1.25 by a glyph, 1.2 signed; peak 2.1 | Taste 8 (the logo's pen) holds; at 1.5x the drawing the old weight thinned into a sketch. Still two to four strokes, no interior detail (taste 1, 3, 4, 17). |
| 5 | One doodle per empty state | A cluster: two or three by a print, two by a glyph, one path | The middle third of the screen was the blank white. Caps: never more than three, never two of one kind, one fewer where an arrow goes. |
| 6 | One arrow (taste 11) | Two: Home's "Find friends", the Dex's "Show every drink" | The lead asked for an arrow where there is an action. Held from taste 11: never more than one a screen, art-led only, 14 clear. Added: never at a key that posts or logs a drink (1.4.3), so Profile's "Post a drink" has none. |
| 7 | End marks at 0.8, right-aligned (taste 9) | Signed: the doodle at 1.2 and the swash under it | Taste 9's signature, made literal with the line Jan likes. Still never centred, never under a link line or a destructive row. |
| 8 | Paper "felt more than seen", amplitude not raised (taste 14) | Seen: 2.4pt tooth at ±1.2%, mean #FBFBFB | Reversed on the evidence of A.5: the old cells were below the eye's threshold at arm's length. Taste 14 holds: no flecks, and the lower cells that showed the tile as dirt were rejected. Still grey, still off every wash, still over 3:1 for every control edge (G). |
| 9 | Icon-led: the doodle up left only | An arch: up left and up right, tops level | Fills the middle without reaching the title (26pt clear). |
| 10 | Drink page, Tournaments | Unchanged, apart from the crown taking the doodles' 2.1 and the signed end | They landed; the lead's read. |
| 11 | Visible red on empties: Home 8, Saved 5, Activity 1 | Home 9, Saved 7, Activity 2, Dex Logged 8 | Honest in D.1: three bands (chrome, cluster, key), never one heap. Under the judges' original 11 everywhere. |
| 12 | §O open, first answers assumed | Settled: Jan delegated them | Recorded in O. |

**What the bolder pass did not do**, each considered and refused: a mark per post caption (per-row noise); a doodle in Home's bar beside the wordmark (it would read as a button, and it would alter the logo's company); the double rule under the bar (it collides with the bar's own grey rule on scroll); four corners on a print (a viewfinder); a larger crown (its row is 64pt, and at 1.25 it would reach the "Friends" label); a heavier press (it landed).
