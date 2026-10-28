# v4.10 · The ground, another way (design exploration)

Jan, on his phone, of build 34's paper grain (v4.9 `details/spec.md` A.5): "make the background less grainy, it hurts the eyes to see, make it another way." The grain goes. He still wants the page to carry something, done another way, and comfortable to look at for a long time.

This began as exploration only, 28 Oct 2026, with every file under `specs/v4.10/ground/`. The recommendation is at the end, with exact values and how it replaces `details/Paper.tsx` without changing its API or its placements.

**Since built** (`specs/v4.10/spec.md` G): `scripts/build-ground.mjs` writes `assets/details/ground.png`, the sweep pre-dithered, and `details/Paper.tsx` lays it; the grain's tiles and `build-paper.mjs` are gone. §6 is updated to what shipped: the asset, the component as built, and the device checks. The rest is the record of the judging, as it was.

---

## 1. Why the grain hurt

The bolder pass made the grain seen on purpose. It moved the tooth to a 2.4pt cell at ±1.2%, which is about 8 to 11 cycles a degree at 35 to 50 cm. That is where the eye is most sensitive to contrast (A.5, "Why the cells moved"). So the pass did what it set out to do. But a texture whose energy sits at the eye's peak band is also the kind the eye works hardest on. It never resolves into a shape, so the eye keeps reading it. Under text that scrolls over a fixed sheet, it also reads as dirt on the glass.

So the replacement must put its contrast at the lowest spatial frequencies: a shape of light, not a texture. It has no edge to find, no lattice to repeat, and nothing at the frequency of text.

## 2. What every option had to do

- **Neutral only.** R = G = B greys, no cream (check-contrast's ONE HUE). The accent appears only as the v4.9 pen marks, drawn from their own `marks.js`.
- **Every pair still passes.** Each option's darkest ground is measured against the page pairs that `scripts/check-contrast.mjs` holds (`tools/measure.mjs`). The ground is fixed and the page scrolls over it, so any text can land on any part of it.
- **No moiré or shimmer while scrolling.** Static and outside every scroll view, as Paper is today.
- **Not busy.** Cheap to render, with no full-screen work per frame.
- **Off the wash surfaces**, as A.5 already holds.
- **Works with the pen**: the crop corners, doodles and double rules.

## 3. The options

Each option is drawn on the v4.9 board's own three before-and-after screens (Home at rest, Saved empty, Activity empty) at 440 x 956 @2x. They use v4.9's real marks, read in place, not copied. Paths are relative to `specs/v4.10/ground/board/`.

| | Option | Values | Shots | Verdict |
|---|---|---|---|---|
| 0 | Plain white (v4.8) | none | `shots/white-{home,saved-empty,activity-empty}.png` | The reference: comfortable, carries nothing |
| · | Today: the grain (v4.9, build 34) | 128pt tile, 2.4pt tooth ±1.2%, mean #FBFBFB, darkest #F4F4F4 | `shots/grain-*.png` | What hurts |
| A | **Studio sweep** | White to 40% of the height, then a smoothstep to #F8F8F8 at the foot. Vertical only, screen-anchored | `shots/sweep-*.png` | **Taken, with its foot tuned to #FBFBFB (§5)** |
| B | Window light | Radial from the top-left corner: white to 42%, then down to #F8F8F8 in the far corner | `shots/window-*.png` | Rejected: reads as uneven backlight, and it seams on every swipe |
| C | Top fade, the bars only | Plain page. The status strip and top bar fade from #F2F2F2 at the screen's edge to white at the bar's foot | `shots/topfade-*.png` | Rejected: says "content is under the bar" when none is |
| D | Ruled ledger | A 0.5pt #F0F0F0 line every 32pt, and a #E3E3E3 margin rule at x 12; page only | `shots/ledger-*.png` | Rejected: a stripe the text never sits on |
| E | Dot grid | A 1pt #E3E3E3 dot every 24pt from (16, 16); page only | `shots/dots-*.png` | Rejected: fails three pairs, reads as specks |
| F | The s, watermarked | The icon's s (`brand/paths.ts`), 340pt, #F4F4F4, centred at (372, 752), under the tab bar | `shots/mark-*.png` | Rejected: reads as burn-in, and it seams on every swipe |

The sheets they were judged on:

- `arm-length.png`: every option on the three screens at 25%, about a 6.9in phone at arm's length seen on a laptop. This was the first look.
- `ground-100.png`: the lower right of Saved (empty) at 100% of the @2x pixels, where only the ground shows.
- `structure.png`: Saved and Home with the levels 236 to 255 stretched 13 times. It shows what the eye could find in each ground if it looked: a ramp's 8-bit steps, a seam at a bar, a lattice. It is never how the screen looks. Its last column, "A #FBFBFB, shipped PNG", is re-rendered from the shipped `assets/details/ground.png` (§5): speckle, and no contour line.
- `checks.png`: the survivors on the screens that carry wash surfaces (Dex's field and chips, the tickets, Host a tournament and your row, Edit profile, Post a drink at the feed's end), plus one probe. The probe moves the Tournaments page 190pt down, so your row rests on the foot.

## 4. Judging, eye comfort first

**A · Studio sweep.** This is the seamless paper the drinks are photographed on: a white wall that settles, very slightly, toward the floor.

- It has nothing at the frequency of text or of the grain. It is one half-cycle over about 450pt, roughly 0.1 cycles a degree.
- It has no edge, no corner and no repeat, so the eye has nothing to fix on. At arm's length it reads as light, not as a surface.
- The smoothstep is flat at both ends, so no Mach band marks where the ramp starts or stops.
- Its top 40% is pure white, so every top bar, the stories row and the first post's head are exactly as in v4.8. The only bar it reaches is the tab bar's slab (or the drink pages' pinned bar), and that bar cuts the same picture at its own place. `sheets.py` reads the levels across the slab's top edge as 251 251 251 for the pick, and 248 248 248 as first drawn (§7): there is no step.
- It is the only option that is the same at every x. A pager swipe or a push therefore moves pages over a ground that looks identical, and two pages mid-swipe meet each other, and the fixed slab, with no seam.

**B · Window light.**

- At the same levels it is just as smooth.
- At arm's length on the empty screens, a light that is brighter on one side reads as an uneven backlight, a display fault, more than as a page.
- It depends on x, so it seams. Mid-swipe, the right edge of one tab page (its darkest side) meets the left edge of the next (its lightest side). The fixed tab slab no longer matches the page sliding above it.

**C · Top fade.**

- The page stays white, so this carries the least.
- What it does carry says something false. A grey haze under the status bar is what iOS draws when content has scrolled under a bar (the scroll-edge effect). Drawn at rest, it says there is more above when there is not. It also sits behind every large title.

**D · Ruled ledger.**

- The rules are faint (#F0F0F0 keeps lineControl at 3.03:1 where a glyph crosses one).
- The 32pt pitch is 1.2 to 1.6 cycles a degree, near the band where stripes are least comfortable to look at.
- The text's own lines (24pt) never sit on the 32pt rules. Because the rules are fixed and the page scrolls, no layout could make them sit there. A ledger whose writing ignores its lines reads as misregistration.

**E · Dot grid.**

- At #E3E3E3, a 1pt dot that a glyph crosses fails three pairs: accent as text 4.31:1, textFaint 2.69:1 and lineControl 2.69:1 (`measure.mjs`). To pass, the dots would have to be #F0F0F0, and at that level a 1pt dot is gone.
- As drawn, at arm's length the grid reads as specks on a lattice. That is the dust on the glass v4.9 removed with the flecks.

**F · The s, watermarked.**

- It is one low-frequency shape, but it is fixed behind content that scrolls. A faint logo that never moves while everything else does is the picture of OLED burn-in.
- The text crossing its hard edge appears to slide against it.
- It seams on a swipe as B does: the part on the slab stays while the page's part slides.
- And it stamps the brand behind every page, which is louder than the page it is meant to calm.

**Ranking for comfort:** 0 ≥ A > B > C > F > E > D > the grain. Of the options that carry something, A is the most comfortable by a wide margin. It is also the cheapest to build (§6).

## 5. Tuning A: the foot

A was first drawn with its foot at #F8F8F8. The checks moved the foot three levels lighter, to **#FBFBFB**.

- **#F8F8F8.** Wash surfaces are told from the page by their fill alone (white spec 1.2): fields, keys, tickets and your row. A wash on white is 1.09:1. On an #F8F8F8 foot it is 1.03:1, and your row at the foot visibly loses its band. See `checks.png`, row "Your row on the foot", and `shots/check-sweep-board-foot.png`.
- **#FBFBFB.** The wash is 1.054:1 on this foot. That is exactly what A.5 accepted on the grain's mean, so the foot gives up nothing v4.9 had not already given. `shots/check-sweep251-board-foot.png` shows your row still reads.
- **#F6F6F6**, as the far side: the wash is 1.01:1 and stops reading (`shots/sweep246-*.png`).
- **The PNG the app ships**, `assets/details/ground.png` (`scripts/build-ground.mjs`: pre-dithered, 440 x 574 over the lower 60% of the screen, spec G.2), holds the same levels as the CSS gradient (`shots/sweeppng-*.png`): `sheets.py` reads 255 to 251 down Saved's margin, and 251 on both sides of the slab's seam.
  - It was first drawn from `tools/sweep-png.mjs`'s stepped 4 x 256 ramp. Chrome dithers a CSS gradient and does not dither a stretched image, so that file's four one-level steps showed as the bands in `structure.png`'s last column. That is why the shipped file carries its own dither (spec 0.10).
  - The board draws the shipped file texel for texel (`image-rendering: pixelated`), each texel a 2 x 2 block as it lands as 3 x 3 device pixels on a phone. Headless Chrome's smooth CPU upscale averages a dither and drops the fraction: drawn smooth at 2x, this file's rows came out flat, up to a whole level dark, with steps where the file has none. On the phone the file is shown at its own size by a UIImageView and stretched by Core Animation on the GPU, whose linear filter only softens the speckle.

A is quiet at #FBFBFB. It is seen at the floor of an empty screen and under the tab bar, and felt elsewhere. That is the intent: the v4.9 pen marks now do the work of making a screen less empty, and the ground only has to be a comfortable sheet for them. If Jan, on the device, sees nothing at all, the next step is one number (§6, device checks).

---

## 6. Recommendation: A, the studio sweep, foot #FBFBFB

### Values

| | |
|---|---|
| Colours | #FFFFFF to #FBFBFB. Neutral (R = G = B), no token added, no cream |
| Direction | Vertical only, anchored to the window (the screen), never to the content |
| Curve | `level(t) = 255 − 4 · smoothstep((t − 0.40) / 0.60)`, with `t = y / window height` (0 at the screen's top edge, 1 at its foot) and `smoothstep(u) = u²(3 − 2u)`, clamped to 0..1 |
| Pure white | The top 40% by construction: to 382pt on a 956pt screen |
| As drawn in 8 bits on a 440 x 956pt screen | Without a dither, #FEFEFE from 506pt, #FDFDFD from 619pt, #FCFCFC from 716pt, #FBFBFB from 828pt to the foot: 53%, 65%, 75% and 87% of the height on any screen. As shipped, the dither spreads each step over its whole band, so no row's mean differs from the next row's by a full level, and every 8-row band averages within 1/16 of a level of the curve |
| Where | Exactly A.5's table, unchanged: the page grounds and the bars over them; never a wash, a press surface, a photo, an ink ground, a sheet, a window, onboarding or Settings |
| Bars | The tab bar's slab and the drink pages' pinned bar cut the same picture at their own place, so the slab is #FBFBFB and meets the page above it with no step. Every top bar, the status strip, Home's bar and strip and Dex's header lie in the white 40% and draw nothing. Under the bare sign-in pages the slab draws no paper (integration pass, `src/lib/bareGround.ts`), so it is white under white there |
| Asset | `assets/details/ground.png`, written by `scripts/build-ground.mjs` (spec G.2): 440 x 574 px, 1 px a point over the lower 60% of the tallest window; 8-bit grey (PNG colour type 0) with an sRGB chunk, 1,597 bytes, at most about 1 MB decoded as RGBA. One file with no @2x or @3x, because it is stretched. **Pre-dithered**: row y holds `level(0.40 + 0.60 · (y + 0.5) / 574)`, ordered-dithered against the 8 x 8 Bayer matrix and clamped to 251..255. (First sketched here as a stepped 4 x 256 ramp, `tools/sweep-png.mjs`; see §5.) |

### Contrast on the darkest ground (#FBFBFB), from `tools/measure.mjs`

| Colour | On #FFFFFF | On the foot, #FBFBFB | The grain's darkest, #F4F4F4 (today) |
|---|---|---|---|
| ink | 19.80 | 19.13 | 18.00 |
| textMuted | 6.69 | 6.46 | 6.08 |
| accent (text, and the pen) | 5.54 | 5.35 | 5.03 |
| textFaint, 18pt+ / lineControl | 3.45 | 3.34 | 3.14 |
| wash (decorative) | 1.090 | 1.054 | 1.009 |
| press (decorative) | 1.192 | 1.152 | 1.084 |
| line (decorative) | 1.283 | 1.240 | 1.167 |

The foot's figures are A.5 / G's own "#FBFBFB" column. So the pick's darkest pixel is the grain's *mean*, and no pixel is darker. Spec G's table shrinks to two columns, and check-contrast needs no new pair: no token changes.

### How it is built in React Native: `details/Paper.tsx` reimplemented, its API kept

`Paper` keeps:

- its name, its export and its no-props API;
- `HIDDEN` and `React.memo`;
- the module-level accessibility store, which gains Increase Contrast (`isDarkerSystemColorsEnabled()` and `darkerSystemColorsChanged`, spec G.1). Under Reduce Transparency there is no ramp. Under Invert Colours there is none either, for a new reason: an image may be left uninverted or inverted, so the ramp would be either a light sheet under a dark page or a black floor. Under Increase Contrast there is none, so the wash fills get their 1.09:1 back at the foot;
- every placement in A.5's table. No caller changes: ScreenTopBar's `paper`, HomeChrome's bar and strip, FloatingTabBar's slab, PinnedPostBar's box, TabPlaceholder and every root stay as they are, and check-design rule 17's DETAIL_SITES is untouched.

Only its body changes, from a tile grid to one stretched Image. As built (spec G.3, `src/components/details/Paper.tsx`), every hook runs before the early return, the box is measured again when the window's height changes, and the Image covers only the lower 60% the asset holds:

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

Why this shape:

- **One Image, not a grid.** A stretched image is its layer's contents, filtered by the GPU when it is composited. That means no tiles and no backing store of its own. It also avoids the tiled resizable UIImage that `resizeMode="repeat"` pre-renders, which A.5 exists to avoid.
- **The cost.** One decode (440 x 574, at most about 1 MB as RGBA) is shared by every instance. Each root and the slab draw one quad. Top bars draw nothing. That replaces 32 tiles a full screen and 4 a bar. Nothing runs per frame, and nothing is drawn per cell.
- **Sliced by the window, not the box.** Each Paper offsets the same window-sized picture by its own window y. A bar therefore shows exactly the part of the page behind it, and the slab meets the page with no seam.
- **Measured, not computed.** A bar does not know where it sits. `measureInWindow` asks at layout, and again whenever the window's height changes, then the Image is drawn. Nothing draws until then: an #FBFBFB foot arriving one frame late is under a one-level change. At the Dock it arrives with the chrome Rise, as the grain did, so the swap frame stays the white it was (v4.6 B.3).
- **No x.** The ramp is the same at every x, so the slide-in of a pushed page and a tab swipe are both seamless. That is why A and not B.
- **What comes out of the app.** `assets/details/paper@2x.png` and `paper@3x.png`. `scripts/build-paper.mjs` becomes `scripts/build-ground.mjs`, a port of `tools/sweep-png.mjs` with `--check` on the build-paper pattern, and the gate list swaps `build-paper.mjs --check` for it. The comments that name the grain change: Paper.tsx's header; the paper notes in FloatingTabBar, ScreenTopBar, HomeChrome, DrinkPanels and the routes listed in A.5; and theme.ts's note on the paper.

### Device checks before it ships (a 3x iPhone, arm's length, full brightness)

The build's own list is spec G.7, on Saved (empty) and Activity (empty) first; these are the ground's three as they now stand.

1. **No contour lines at the floor, and no speckle.** The shipped asset is pre-dithered, so it has no step to show: its speckle is ±½ a level at about 22 cycles a degree at 40cm, far above the band where the grain hurt. Look at 53, 65, 75 and 87% of the height, where an undithered ramp would step.
   - If a line or the speckle shows, Paper returns null and the page ships plain white, and it goes to Jan (spec G.1). Never a darker foot, never a texture.
   - ~~If a line shows, first write the same ramp at 16 bits.~~ Not taken: the judges chose the pre-dithered ramp over an 8-bit or 16-bit stepped one (spec 0.10).
2. **The washes still read** at the foot: your row, Host a tournament, Edit profile, Post a drink and the Dex field when scrolled low. They sit at 1.054:1, as on v4.9's paper.
3. **Jan sees it.** ~~If he sees nothing ("still empty"), the step is one number: the foot back to #F8F8F8, as A was first drawn.~~ Struck (spec G.5): #F8F8F8 fails this folder's own audit, `tools/measure.mjs`, whose WASH_MIN is 1.05 (a wash at that foot is 1.03:1, `shots/check-sweep-board-foot.png`). The foot is locked at #FBFBFB. If Jan says "still empty", the answer is the type and the pen marks, never a darker floor (spec W).

---

## 7. Rebuild (repo root)

```bash
bash specs/v4.10/ground/tools/render.sh
```

It runs, in order:

1. `tools/sweep-png.mjs`, the first draft's stepped 4 x 256 PNG, kept for the record. The board's "shipped PNG" row reads `assets/details/ground.png` itself, which `node scripts/build-ground.mjs` writes (and `--check` holds).
2. `tools/build-board.mjs`. It derives `board/index.html` from the v4.9 board, swapping only its ground layer and its assembly, and stops if the v4.9 board no longer has the lines it swaps.
3. Every shot, through `tools/shoot.sh`: headless Chrome in its own profile, `/tmp/sipply-v410-ground-chrome`, killing only that profile.
4. `tools/sheets.py`. It writes the four sheets and prints each option's levels down Saved's margin and across the slab's seam, plus the wash of your row against the foot.
5. `tools/measure.mjs`, the contrast audit. It exits 1 if the pick fails a pair or leaves the wash under 1.05:1 on its foot.

Every value is written once, in `tools/grounds.mjs`, so the board draws exactly what the audit reads. `board/index.html` with no query is the whole wall. `?g=<option>&f=<screen>[&shift=190]` draws one phone.

The board's type is the v4.9 board's: Inter and Playfair, read from `assets/fonts/`. Once v4.10's type (spec T) has replaced them there, a re-render draws the phones in fallback faces unless those files are restored from build 34's tree first; `sheets.py` labels its sheets in Archivo when Inter is gone. The shots in `board/shots/` were all drawn with the judged faces.
