# v4.6 · Pen details and the Dock (build spec)

Jan, 23 Oct 2026, after the design round in this folder (`index.html`):

1. **Details: "Pen marks at Ledger's spots".** One visual language, the logo's paint pen at hairline weight, used at the Ledger system's placements.
2. **Transition: "Dock".** When the film ends, its wordmark glides and shrinks into the first screen's wordmark while the app rises underneath; on Home the stories rule then draws itself in once.

Jan's brief was that the app looks "too bland": he wants "delicate details … simple yet complex". His standing rule (9 Oct) is "less stuff". So the details are a clear, consistent presence with no clutter. Every mark is **ornament, not information**.

This file is the build contract. Part A is the detail system, Part B is the Dock, and Part C says who owns which file. The foundation is already built and passing:

- `src/components/details/`: `penPath.ts`, `PenMarks.tsx`, `lineMarks.ts`, `handoff.ts`
- `scripts/render-details.mjs`, with its output in `build/`
- check-design rule 17's detail tier
- theme.ts §accent and white spec §1.3

---

## A. The detail system

### A.1 The pen (every mark)

Source of truth: `src/components/details/penPath.ts`. Do not restate these numbers anywhere else; import `PEN`.

- **Drawn, not stroked.** Each mark is a *filled* outline built around a centreline. Its width swells where the pen lands and thins as it lifts, and its ends are round. A `strokeWidth` line is not allowed.
- **Colour:** `colors.accent` (#D0102C) at 100%. No tint, no opacity, no second hue, and never `accentPressed`.
- **Floor:** no width under **0.4 pt** (`FLOOR`). At 2x, 0.25 pt is half a device pixel and smears to pink.
- **Path data is M/L/Z only.** The round ends and the drip's bead are flattened to points, so the app and `scripts/render-details.mjs` fill the same polygons.
- **Deterministic.** The same arguments always give the same path. A `seed` turns the waver's phase by the golden angle (`PEN_SEED` holds one per placement), and results are cached by their arguments.
- **Static.** The one motion in the system is the stories rule's draw-on at the end of the Dock (B.4). Marks never loop or pulse.

| Generator | Frame (nominal box) | Centreline | Width: land → peak → lift | Shape |
|---|---|---|---|---|
| `penRule(length, seed)` | `length` x 6 | y 3.4 | 0.4 → 1.1 → 0.4, the peak held through the middle (`sin(π·min(1, 1.06t))^0.45`) | One waver every 301.5 pt (1.3 swells over 392), ±0.5 pt. The lift flicks up 2 pt over the last 5% (clamped to 3 to 20 pt). Under 160 pt (`full`), the waver and the flick shrink with the length (the flick to no less than a quarter), so a 24 pt rule is a tapered dash, not a squiggle. **At 392 pt with seed 0 it reproduces Pen's mock `ruleD(392)` to 1e-15 pt.** |
| `penVRule(length, seed)` | 6 x `length` | x 3 | the same | The same rule standing up, drawn top to bottom, with the lift's flick to the right (toward the text it rules). |
| `penSwash(length)` | `length` x 6 | Catmull-Rom through (0, 2.2), (0.3L, 3.6), (0.62L, 3.5), (0.88L, 2.0), (L, 0) | 0.45 → 1.25 (by t 0.14) → 0.4 | A low arc that flicks up at its end, like the y's tail. `length` = 56 x min(fontScale, 1.3). The weight never scales. |
| `plateDrip()` | origin at the run's top | (0, 0) → (0.12, 6.99) | run 3.4 meniscus → 0.8 neck (`0.8 + 2.6·e^(−7t)`) | Two pieces, a run and a teardrop bead 2.8 pt across. The bead's foot is 8.5 pt below the run's start. There are two `<Path>`s because one path could cancel itself under a nonzero fill. |

Each `PenShape` carries:
- `d[]`: path strings;
- `polys[]`: the same pieces as polygons;
- `box`: the ink's bounding box, grown to whole points plus 0.5. It is the Svg's viewBox and its offset from the nominal box. Whole points mean the Svg frame never rounds to a size other than its viewBox.

Proof at 3x, 1:1, generated from the same file: `build/sheet@3x.png`, one PNG and one SVG per mark, and `build/index.html`. Re-run with `node scripts/render-details.mjs` after any geometry change. Its log prints each mark's box and its thinnest and widest ink (every mark is 0.4 to 1.1 or 1.25 pt, 1.2 to 3.75 px at 3x), and it exits non-zero if any width falls under the floor.

### A.2 The components (`details/PenMarks.tsx`)

All four components share these properties:
- They are `React.memo`'d.
- They are `pointerEvents="none"`, `accessible={false}`, `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"`.
- Each paints `colors.accent` through one react-native-svg `<Path>` (two for the drip).
- Each is a View of the mark's **nominal box**. The few tenths of a point of ink outside that box (round ends, the flick) come from an Svg offset from the box with `overflow: visible`, so callers align boxes, never ink, and the ink never changes their layout.

| Component | Props | Box | Notes |
|---|---|---|---|
| `PenRule` | `length`, `seed?`, `draw?: SharedValue<number>`, `style?` | `length` x 6, centreline 3.4 down | With `draw`, it renders the transform-only draw-on: a clipping window slides in from the left while the ink slides the other way, so there is no width animation and no layout per frame. `draw` is the eased progress, and at 1 both transforms are the identity. |
| `PenSwash` | `scale?` (min(fontScale, 1.3)), `style?` | (56 x scale) x 6 | Its origin sits 1 pt right of the title's left edge and 2 pt above the title's line-box foot: `position: absolute, left: 1, bottom: -4` inside a View that wraps the title Text. |
| `PenMargin` | `kind?: 'margin' \| 'column'`, `style` | 6 wide, centreline at x 3, as tall as its `top`/`bottom` allow | It measures its own height (`onLayout`, quarter-point steps, one extra render on a page and never in a cell). Under 8 pt it draws nothing. |
| `PlateDrip` | `border?` (default `stroke.edge`) | 0 x 0 at the anchor | It places itself inside the plate: 6 pt in from the right corner, 1.5 pt above the bottom edge, with the border subtracted because absolute offsets are measured inside it. The plate must not clip. |

`details/lineMarks.ts` gives `lineMarks(face, fontSize, lineHeight, scale)` → `{ capTop, baseline, foot, lineHeight }`. These are the cap height and baseline inside a line box, computed from the fonts' ratios (Inter .969/.242/.7275, Playfair 700 1.082/.251/.708). The vertical rules use them to run from the first line's **cap height** to the last line's **baseline**, without measuring text. If a device shows a rule off the caps, fix it in `lineMarks`, never in a screen's offsets.

`details/handoff.ts` holds `HOME_RULE_DRAW = makeMutable(1)`, the stories rule's draw-on progress. It is the only contract between Parts A and B (see C).

### A.3 Placements (exactly these)

Extended by specs/v4.7/spec.md §6 (23 Oct 2026): #7 retired, #9 to #12 added.

The reference layout is 440 x 956 (the mocks), with 390 in brackets. "Clear" means distance from ink to the nearest photo, ring or face. Every placement holds **at least 12 pt** from any image.

#### 1. Home: the stories head rule (Pen's "drawn rule")
- **Component:** `src/components/home/TodaysPours.tsx`. The component's root becomes a `View` holding today's horizontal `FlatList`, then a **rule band**. It stays inside the stories group that the Dock lifts (B.4).
- **Mark:** `<PenRule length={width − 2·layout.feedGutter} seed={PEN_SEED.stories} draw={HOME_RULE_DRAW} />`, so 408 pt (358). `width` comes from `useWindowDimensions`.
- **Geometry:** the band is a 10 pt View, so the tray's foot grows from 8 to 18. The rule sits `position: absolute, left: layout.feedGutter (16), top: −1.5`, which puts its centreline 1.9 pt into the band.
  - That is 14.1 pt under the story labels' baseline, and 14.1 pt above the first post's story ring (the ring's top is 6 into PostCard's 52 header).
  - It lines up with Home's 16 column, as the faces, captions and the entry rule do (Ledger's reasoning, accepted there).
- **Clear:** 32 pt from the story discs, 14 pt from the next ring.
- **It replaces nothing.** The tray has no rule today (index.tsx: "Nothing under the tray"). The bar's own grey `line` rule is unchanged and still appears only on scroll.
- **Motion:** the draw-on (B.4) once per cold start. Otherwise it is static and fully drawn, since `HOME_RULE_DRAW` rests at 1.

#### 2. Home: the closing rule after each post (Ledger's entry rule, drawn by the pen)
- **Component:** `src/components/PostCard.tsx`. Add the prop `closingRule?: boolean`, **default true**. `src/app/post/[id].tsx` passes `closingRule={false}`, because the single post view is not the feed. Home's `renderItem` passes nothing, so `(tabs)/index.tsx` needs no edit for this.
- **Mark:** `<PenRule length={24} seed={PEN_SEED.entry} />`, the card's last laid-out child (after the time line, before the sheets). It sits `position: absolute, left: GUTTER (16), bottom: FOOT − 11 − (PEN.rule.height − PEN.rule.mid)`, which is 0.4.
  - Its centreline is 11 pt under the time line's box, inside the existing 14 pt `FOOT`.
  - That is about 12 pt from the time's descenders and 13 pt from the next post's face.
  - Post heights do not change.
- **Only on `kind: 'post'` rows.** `NotInDexYet` never draws it.
- **Scroll cost:** the path is one cached constant, so each cell mounts one static `<Path>`, with no measurement and no state.

#### 3. Dex: the section head rule
- **Component:** `src/components/dex/SectionHead.tsx`. It applies to both forms, the "See all" Pressable and the plain "by number" head.
- **Mark:** `<PenRule length={width − 2·layout.gutter} seed={PEN_SEED.sectionHead} />`, so 392 pt (342). It goes inside a 7 pt spacer View placed after the `line` row, `position: absolute, top: 3, left: 0`, which puts the centreline 6.4 pt under the head's line box.
- **Head height:** the head grows by **7 pt**. `paddingBottom` stays 12, so the first row's photos sit 12 pt below the ink.
  - Export `HEAD_RULE = 7` from SectionHead.
  - In `src/app/(tabs)/dex.tsx`, add it to `headEstimate` (line 872), or the scroll-to-section offsets (line 942) drift by 7 pt per head.
- **It is a section rule, not an underline.** It spans the column 6.4 pt below the row, the way a ledger's head rule does. An underline sits about 2 pt under a baseline and hugs the words. So it never reads as underlining "See all 445".

#### 4. Tab-root titles: the swash (Dex, Saved, your username)
- **Component:** `src/components/ScreenTopBar.tsx`, the `size="lg"` branch. It draws only when there is **no `titleNode` and `title !== ''`**.
  - That is Dex, Saved (`(tabs)/saved.tsx` and `collections/AllSaved.tsx`), your own Profile (`profile/ProfileView.tsx`), and My Bar while that tab exists.
  - Home's bar has none, because its wordmark is already the pen. The empty-title fallback bar in `(tabs)/profile.tsx` has none, and centred md titles never get one.
- **Mark:** wrap the title `Text` in `<View style={flexShrink: 1}>`, keeping `ref={titleRef}` on the Text. Then add `<PenSwash scale={Math.min(fontScale, BAR_TEXT_SCALE_CAP)} style={{ position: 'absolute', left: 1, bottom: -4 }} />`.
  - At scale 1 the line box's foot is 43 in the 52 row, so the swash box spans 41 to 47 and its ink stays at least 5 pt clear of the bar's 1 pt foot.
- **`src/components/TabPlaceholder.tsx`** draws the same swash under its title row (same wrapper, same offsets), so a lazy tab root's swash does not pop in when the real bar mounts. Its wordmark branch (Home) gets none.

#### 5. Drink page: the margin rule beside the record (name to last fact)
- **Component:** `src/components/DrinkPanels.tsx`. Add an exported `HeroRecord({ drink, inDex, custom })` that renders a full-width, `position: relative` View holding `<HeroTitle/>`, then `<FactList/>`, then the rule.
  - `src/app/drink/[id].tsx` (line 403) and `src/app/custom/[id].tsx` (line 191) swap their two lines for it.
  - The record is drawn the same way for both, as the file's header requires.
- **Mark:** `<PenMargin kind="margin" style={{ position: 'absolute', left: layout.gutter / 2 − PEN.vrule.mid, top, bottom }} />`, so the centreline is at x 12, the middle of the 24 gutter.
  - `top = space.xl + lineMarks('playfair', 52·fit, 56·fit, min(fontScale, HERO_NAME_CAP)).capTop`, which is 36.8 at scale 1. `fit` is DrinkName's own `fitScale(...)` for the name (export it or compute it the same way), so a shrunk long name still starts on its caps.
  - `bottom = lineMarks('inter', 13, 18, min(fontScale, FACT_CAP)).foot`, which is 4.3: it ends on the last caption's baseline.
- **Drawn only when FactList draws.** No facts means no record to rule.
- **Clear:** 36.8 pt below the print.

#### 6. Drink page: the column rule between the two fact columns
- **Component:** `FactList`, in DrinkPanels. It draws only when `fitsHalf && facts.length >= 2`, that is, when there are two columns. A single column never gets one, and the rule never invents a column.
- **Mark:** inside the `facts` View, `<PenMargin kind="column" style={{ position: 'absolute', left: half + space.xl / 2 − PEN.vrule.mid, top: lineMarks('inter', 17, 24, s).capTop, bottom: lineMarks('inter', 13, 18, s).foot }} />`, with `s = min(fontScale, FACT_CAP)`. At scale 1, top is 5.8 and bottom is 4.3.
  - It runs from the first row's cap height to the last row's baseline.
  - With three facts it still runs to the last baseline, as a ledger's column rule runs the table.

#### 7. Profile: the margin rule beside the ledger rows
- **Component:** `src/components/profile/ProfileHeader.tsx`, **your own profile only, and only when both rows show**: "N entries in your Dex" and Tournaments.
  - Beside a single 44 pt row it would be a 9.5 pt tick that reads as a stray mark.
- **Mark:**
  - Wrap the two Pressables in a `ledger` View and move `dexLine`'s `marginTop: space.xs` onto it.
  - Then add `<PenMargin kind="margin" style={{ position: 'absolute', left: −layout.gutter / 2 − PEN.vrule.mid, top: pad + m.capTop, bottom: pad + m.foot }} />`.
  - Here `m = lineMarks('inter', 13, 18, fontScale)` (these Texts do not cap), and `pad = max(0, (layout.hit − m.lineHeight) / 2)`.
  - At scale 1 that gives top 17.3, bottom 17.3, and length 53.5 (`build/profile-margin@3x.png`).
- **It never touches the red figure.** The rule is at x 12; the "14" starts at x 24, under its own row.

#### 8. Drink page: the drip off the caught Nº plate
- **Component:** `src/components/plate.tsx`. Add `drip?: boolean`, honoured only when `tone === 'caught' && size === 'lg'`. The caught style gains `overflow: 'visible'`. Inside the plate's View, render `<PlateDrip />`.
  - **Only `HeroTitle` passes `drip`.** The catch card (`CelebrationOverlay`), the rail thumb and every grid never pass it, so they never mount the Svg.
- **Geometry:** the run leaves the bottom edge 6 pt in from the right corner and starts 1.5 pt inside the fill. The bead's foot is 7 pt below the plate.
  - The facts sit 24 pt below the plate row, so about 18 pt of air remains and nothing moves.
- **A drink not caught gets nothing.** This is the drip's only use in the app.

### A.4 Never

There is no mark on any of these:
- photos, prints, avatars, story rings (12 pt clear always);
- buttons and keys (the + key, the post key), chips, fields, state glyphs (the In-your-Dex check stays grey);
- the tab bar (the active line stays ink);
- under a tappable figure (both red 14s are buttons);
- body text, usernames or links (a pen line under words reads as a link);
- errors, destructive actions or alerts;
- ink or accent grounds (except the drip, which leaves the plate as the same paint);
- sheets, pushed screens, windows and centred `barTitle`s;
- onboarding and sign-in (the wordmark is their red);
- empty states, except a tab root's own swash.

Retired and never to return: Pen's ring around the caught figure and its red pen tick. Both turned a state red, and that is information.

### A.5 Per-screen budget

Extended by specs/v4.7/spec.md §6 (23 Oct 2026): #7 retired, #9 to #12 added.

A repeat of the same placement (the next post's closing rule, the next section's head rule) counts once. The logo and the six accent places do not count.

| Screen | Marks | Count |
|---|---|---|
| Home | stories head rule (draws on once) · closing rule per post | 2 |
| Dex | swash · head rule per section | 2 |
| Drink page, caught | margin rule · column rule · drip | 3 |
| Drink page, not yet / custom drink | margin rule · column rule | 2 |
| Profile (yours) | swash · margin rule | 2 |
| Saved, My Bar | swash | 1 |
| Someone else's profile, pushed screens, sheets, windows, onboarding, sign-in | none | 0 |

- No screen gets more than three.
- No two marks of the same kind ever sit next to each other without content between them.
- Adding a mark anywhere else is Jan's decision, made in this file and in check-design's `DETAIL_SITES` together.
- If Home still feels bland on device, the next step is the rule's peak at 1.25 pt (`PEN.rule.peak`), not a new mark.

### A.6 Guards (built)

check-design rule 17 enforces three things:
- **`colors.accent` may sit anywhere in `src/components/details/` (`ACCENT_TIERS`), and nowhere new outside it.** `accentPressed` and `onAccent` fail even inside the folder.
- **The marks (`details/PenMarks`) may be imported only by the eight placement files in `DETAIL_SITES`, and each may import only its own marks:**

  | File | Mark |
  |---|---|
  | TodaysPours, PostCard, SectionHead | `PenRule` |
  | ScreenTopBar, TabPlaceholder | `PenSwash` |
  | DrinkPanels, ProfileHeader | `PenMargin` |
  | plate | `PlateDrip` |

- **Imports must be by name.** A namespace or default import fails.

`penPath`, `lineMarks` and `handoff` paint nothing, so they are importable anywhere.

Proved on 23 Oct with four planted violations, then reverted:
- `colors.accent` in TodaysPours;
- `colors.accentPressed` in PenMarks;
- `PenRule` imported by FloatingTabBar;
- `PenSwash` imported by plate.tsx.

Each failed with its own message, and the six existing places still pass.

---

## B. The Dock

### B.1 The source rect (the film's last frame), a pure function of the screen

The film is 1080 x 1920 film px, drawn by VideoIntro at `FILM_PT = SPLASH_MARK.width / 483 = 220/483` pt per film px and centred on `useWindowDimensions()`. Its end frame (3.50 to 5.00 s, still) holds the full-cut wordmark:
- the `WORDMARK_PATH` viewBox, [-15.68, 18.35, 462.97, 285.52], the same viewBox as the app's;
- drawn **660 film px wide, centred on film (540, 960)** (`~/Projects/sipply-intro/d-the-tag/tools/gen.cjs`, `WM_W`);
- with `tools/data.json` `wordmarkFilmBox` = [[210, 756.48], [870, 1163.52]].

```ts
const [, , VB_W, VB_H] = WORDMARK_PATH.viewBox;
export function filmWordmarkRect(screenW: number, screenH: number) {
  const w = 660 * FILM_PT;            // 300.62 pt
  const h = (w * VB_H) / VB_W;        // 185.40 pt
  return { x: (screenW - w) / 2, y: (screenH - h) / 2, w, h };
}
```

The box is centred because the film's centre (540, 960) is the wordmark's centre, and the film itself is centred on the screen.

| Screen | Source x, y (w 300.62, h 185.40) | Home target (x, y, w, h) | Scale |
|---|---|---|---|
| 375 x 667 (SE) | 37.19, 240.80 | 13.69, inset+2, 68.10, 42 | 0.22654 |
| 390 x 844 | 44.69, 329.30 | 13.69, inset+2, 68.10, 42 | 0.22654 |
| 393 x 852 | 46.19, 333.30 | same | 0.22654 |
| 402 x 874 | 50.69, 344.30 | same | 0.22654 |
| 440 x 956 | 69.69, 385.30 | same | 0.22654 |

The Dock round checked these against the decoded last frame (`transition/dock/notes.md`, Geometry): the ink boxes match to 1 px at 2x and both grounds are 255.

The target is always **measured** (B.2), never taken from this table. Its height is `42 x min(fontScale, 44/42)` for Home and `66 x min(fontScale, 1.2)` for the large wordmark (Welcome, sign-in, the password reset; scale about 0.356). Its width is height x `WORDMARK_ASPECT` (1.62150). The scale is uniform because the viewBox is the same.

### B.2 The destination registry (`src/lib/introDock.ts`, new, Package B)

```ts
export type DockTargetId = 'home' | 'welcome' | 'signin' | 'reset';
export interface DockTarget { id: DockTargetId; x: number; y: number; w: number; h: number; cut: 'full' | 'sm' }
export const DOCK_MS = 880, HANDOFF_MS = 600;
export const dockClock = makeMutable(1);           // 1 = at rest: every value is the identity
export const dockPhase = makeMutable(0);           // 0 film, 1 docking
export const dockTarget = makeMutable<DockTarget | null>(null);
export function registerDockTarget(t: DockTarget): void;   // one slot per id
export function clearDockTarget(id: DockTargetId): void;   // on unmount
export function onDockStart(fn: () => void): () => void;   // VideoIntro fires it at playToEnd
export function useDockTarget(id: DockTargetId): { ref, onLayout };  // measure + register
export function riseStyle(start, dur, dy, opMs, opLinear): worklet → { opacity, transform }
export function useRise(...): animated style  // a wrapper's useAnimatedStyle over dockClock
```

- **Measuring.** `useDockTarget` calls `ref.measureInWindow` inside `requestAnimationFrame`, on three triggers:
  1. `onLayout`;
  2. an effect keyed on `insets.top` and the window's dimensions (on a home-button iPhone, un-hiding the status bar at the swap moves Home 20 pt down without refiring `onLayout`);
  3. `onDockStart`.

  It writes `cut = h < WORDMARK_SM_BELOW (40) ? 'sm' : 'full'` and ignores a rect that is not finite or has zero size.
- **Priority when more than one is mounted:** reset > welcome > signin > home, the root's stacking order. An overlay sits above the screen under it: FirstRun's onboarding is drawn over the whole Stack, so the welcome is above Home's tab, whose AuthGate has sign-in's first step mounted under it on a signed-out first launch. The live `dockTarget` is the highest-priority registered slot.
- **Only a visible slot registers** (`useDockTarget(id, { enabled })`, `<DockSlot enabled>`). A covered slot is cleared, not just outranked, so a resumed onboarding (no welcome slot) never sends the film to the covered sign-in:
  - `signin` while its tab is focused and FirstRun is not showing (`lib/firstRun`, the same predicate FirstRun draws on);
  - `home` while its tab is focused, because a cold-start notification tap pushes a drink page (or Activity, or the Dex) during the film while Home stays mounted underneath.
  - With nothing visible, the film settles (B.6).
- **Who registers:**

  | Target | Where it registers | Size |
  |---|---|---|
  | `home` | **HomeChrome, around its own `<HomeWordmark />`, never inside `HomeWordmark`.** `TabPlaceholder` (Package A) renders `HomeWordmark` too, and must not register. Only while Home's tab is focused. | 42 pt |
  | `welcome` | `onboarding/steps/Welcome.tsx` | 66 pt |
  | `signin` | `auth/CabinetBackdrop.tsx`'s head wordmark (it draws only on the first, roomy step), only while focused and FirstRun is down | 66 pt |
  | `reset` | `PasswordResetOverlay.tsx` | 66 pt, `lead` |

### B.3 How the native wordmark takes over invisibly

- **The fly wordmark is pre-mounted.** It mounts with the film, as a sibling above the `VideoView` inside Film's overlay, and stays until `done`. It is an `Animated.View`, absolute at `filmWordmarkRect(screen)`, holding raw `<Svg viewBox={WORDMARK_PATH.viewBox}>` with `<Path d={WORDMARK_PATH.d} fill={colors.accent}>` at the source size.
  - It is not `<Wordmark>`, whose size follows fontScale.
  - It is only ever scaled down, so it stays sharp.
  - It is `accessible={false}` and `accessibilityIgnoresInvertColors`.
  - Its opacity is `dockPhase === 1 && t < 600 ? 1 : 0`, so it is invisible during the film.
- **The ground.** The overlay's white fill and the `VideoView` take `opacity: dockPhase === 1 ? 0 : 1`.
- **The swap is one UI-thread call** on `playToEnd`, or on a tap at currentTime ≥ 3.50 when a target is set:
  ```ts
  runOnUI(() => {
    'worklet';
    dockPhase.value = 1;                 // ground -> 0, fly -> 1, same frame
    dockClock.value = 0;                 // Home's groups -> hidden (they were under the opaque film)
    HOME_RULE_DRAW.value = target.id === 'home' ? 0 : 1;
    dockClock.value = withTiming(1, { duration: DOCK_MS, easing: Easing.linear }, (ok) => { if (ok) runOnJS(done)(); });
  })();
  setLeaving(true);                      // status bar un-hide (animated), pointerEvents: JS side, any frame
  setTimeout(done, DOCK_MS + 120);       // the guarantee
  ```
  Nothing mounts or unmounts in the frame that matters.
  - Before the swap the screen is white plus the film's wordmark.
  - After the swap it is white (the film's ground has gone, and the app underneath is on the same white with every group at opacity 0) plus the vector wordmark on identical pixels.
  - So no frame changes.
- **The hand-off at 600 ms.** In the same UI frame, the destination's own wordmark wrapper goes to opacity 1 (`t >= 600`) and the fly goes to 0. At p = 1 the fly sits exactly on the measured rect, at the same cut and size, so the pixels are identical (the Dock round measured zero difference from 600 ms on).
- **Cut.** If `target.cut === 'sm'` (Smaller Text, under 40 pt tall), the fly draws `WORDMARK_SM_PATH` under `WORDMARK_PATH` and fades the full cut out over 450 to 600 ms, so the drip is gone by the hand-off.

### B.4 The timeline (ms after the film's `playToEnd`; t = dockClock x 880)

| ms | What | Curve |
|---|---|---|
| 0 | **Swap** (B.3). The status bar un-hides, animated. | none |
| 0 to 600 | **Dock:** translateX, translateY and scale (1 → T.w / src.w), `transformOrigin: 'top left'`, with `p = DOCK(min(t / 600, 1))` and `T = dockTarget.value` **read live every frame**, so a re-measure mid-flight just redirects the rest of the path. A straight path with no overshoot. | `DOCK = Easing.bezierFn(0.3, 0, 0, 1)` |
| 160 to 520 | **Chrome:** HomeChrome's keys row and the tab bar rise 8 pt. Opacity runs 0 → 1 **linear over 64 ms**, so the red + key and the Activity dot are tinted for at most 3 frames. The dot rides this group; there is no separate dot beat, because the dot is drawn inside `TopBarButton` (ScreenTopBar, Package A). | `RISE = Easing.bezierFn(0.22, 1, 0.36, 1)` |
| 240 to 680 | **Feed:** the whole `Animated.FlatList` (a `flex: 1` wrapper in `(tabs)/index.tsx`) rises 16 pt, with opacity on RISE over its first 132 ms. | RISE |
| 360 to 780 | **Stories:** a wrapper around `<TodaysPours>` inside the list header (nested in the feed) rises 14 pt more, with opacity on RISE over 126 ms. They start only once the wordmark's foot has cleared the rings. The stories rule (A.3 #1) is inside TodaysPours, so it rides this group: by 560 ms less than 1.5 pt of the rise is left. | RISE |
| 560 to 880 | **The pen signs the page:** `HOME_RULE_DRAW` runs 0 → 1, **320 ms** (Pen's hand-off), **Home only**. B drives it from the clock, in a `useAnimatedReaction` inside Film: `HOME_RULE_DRAW.value = Easing.out(Easing.cubic)(clamp((t − 560) / 320))`. It is a pure function of the clock, so a fast-forward carries it too. | `Easing.out(Easing.cubic)` |
| 600 | **Hand-off** (B.3): the destination's wordmark goes to 1 and the fly to 0. | step |
| 880 | **Done.** Set `HOME_RULE_DRAW.value = 1` and `dockPhase.value = 0`, unmount the overlay, call `onDone`. | none |

Total: **880 ms** after the film, so the whole transition is about 0.9 s.

- Every group is a `useAnimatedStyle` wrapper (transforms and opacity only) built from `riseStyle` over `dockClock`. At clock 1 every value is the identity, so a resume, a stall or Reduce Motion leaves the app fully drawn and the rule drawn.
- **No `entering`, `exiting` or `layout` props anywhere**; they stall in Release builds.
- No new native modules: Reanimated 4.5.1's `makeMutable`, `Easing.bezierFn`, `runOnUI`, `useAnimatedReaction` and react-native-svg are already installed.

**Onboarding Welcome and sign-in** use the same dock to their measured rect (scale about 0.356). Their path runs down and slightly inward rather than up.
- Welcome's wall fades in over 360 to 780 ms. Its strap line, legal line and keys rise 10 pt over 420 to 880 ms, with opacity over the first 30%.
- On sign-in, the step bar rises in the chrome window and the fields and buttons over 420 to 880 ms.
- **No pen beat:** no detail marks onboarding or sign-in.
- The large wordmark keeps its drip (66 pt is the full cut).

### B.5 Skip

- **During the transition:** a tap fast-forwards instead of snapping: `dockClock.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) })`. Every value, the pen beat included, is a function of the clock, so everything arrives together. The skip `Pressable` stays on top for the full 880 ms.
- **During the film:** read `player.currentTime` **synchronously** in the skip handler, before `finish`.
  - **3.50 s or later** (the finished, still wordmark): dock at once from that frame.
  - **Under 3.50 s, or unknown** (NaN, undefined, or a throw from a released player): the wordmark is not finished on screen, so there is no dock. The film dissolves over 280 ms (today's `EXIT_MS`, `Easing.out(Easing.quad)`), and the destination's groups rise on the same clock started at 0. The destination's wordmark rides with the chrome group, and on Home the pen beat still runs.
- Tap anywhere still skips at any time, as today.

### B.6 Fallback

- **No destination, or none measurable:** a cold-started deep link to a drink, an invite, or anything that registered no valid target within **150 ms** of `playToEnd`. The film's still end frame covers that wait.
  - The film **settles** instead of docking: the fly lifts 12 pt and scales to 0.94 about its centre while the overlay fades out over today's 280 ms (`Easing.out(Easing.quad)`).
  - The screen shows through as it does today; if that screen opted into rise groups, they run on the same clock.
  - It is never slower than today's dissolve. `HOME_RULE_DRAW` is not touched (it stays 1).
- **Error, background or the 9 s ceiling:** today's `finish` path, unchanged: the dissolve, with clock and phase left at rest.
- **Reduce Motion:** unchanged. VideoIntro routes to SipplyIntro, so there is no dock and no draw-on. The rule is drawn from the first frame, because nothing moves `HOME_RULE_DRAW` off 1.
- **Accessibility:** the overlay keeps `accessibilityViewIsModal` until `done`. The fly view and every mark are hidden from VoiceOver.

### B.7 What to measure on a device

1. The swap frame, in a 60 fps screen recording: no missing-wordmark frame and no flash of Home.
2. An SE (home button): the dock lands on the 20 pt-lower wordmark with no jump at 600 ms.
3. A 440 x 956 Pro Max: no feed row is at full opacity at frame 0.
4. Android with a translucent status bar: `measureInWindow` against the overlay's window coordinates.
5. The stories rule's draw-on starts with the stories still settling, by less than 1.5 pt.

---

## C. File ownership

Packages A and B never edit the same file. The foundation's files are done. **Neither package edits `src/components/details/handoff.ts`** (the contract), `src/constants/theme.ts` or `specs/v4-mockups/white/spec.md`.

### Package A: placements (A.3)

| File | Change |
|---|---|
| `src/components/home/TodaysPours.tsx` | Root View, rule band, `PenRule` with `draw={HOME_RULE_DRAW}` (#1) |
| `src/components/PostCard.tsx` | `closingRule` prop (default true), the 24 pt `PenRule` (#2) |
| `src/app/post/[id].tsx` | `closingRule={false}` |
| `src/components/dex/SectionHead.tsx` | 7 pt spacer and `PenRule`; export `HEAD_RULE` (#3) |
| `src/app/(tabs)/dex.tsx` | `headEstimate += HEAD_RULE` |
| `src/components/ScreenTopBar.tsx` | The lg title wrapper and `PenSwash` (#4) |
| `src/components/TabPlaceholder.tsx` | The same swash under its title row |
| `src/components/DrinkPanels.tsx` | `HeroRecord` and its margin rule, FactList's column rule, `drip` on the hero plate (#5, #6, #8) |
| `src/app/drink/[id].tsx`, `src/app/custom/[id].tsx` | `<HeroTitle/><FactList/>` → `<HeroRecord/>` |
| `src/components/plate.tsx` | `drip` prop, `PlateDrip`, `overflow: 'visible'` (#8) |
| `src/components/profile/ProfileHeader.tsx` | The `ledger` wrapper and `PenMargin` (#7) |
| `src/components/details/PenMarks.tsx`, `penPath.ts`, `lineMarks.ts` | Only if a placement proves a primitive wrong on device. Then re-run `node scripts/render-details.mjs`. |
| `scripts/check-design.mjs` | Only `DETAIL_SITES`, and only if a placement moves file |

### Package B: the Dock (B)

| File | Change |
|---|---|
| `src/lib/introDock.ts` (new) | The clock, phase, target registry, `riseStyle`/`useRise`, `filmWordmarkRect`, `useDockTarget` (B.1, B.2) |
| `src/components/VideoIntro.tsx` | The pre-mounted fly, the ground's phase, the swap, `onDockStart`, the 150 ms wait, the skip logic, the settle fallback, the `HOME_RULE_DRAW` reaction (B.3 to B.6) |
| `src/components/home/HomeChrome.tsx` | Registers `home` around its own `HomeWordmark` (never inside `HomeWordmark`); the keys-row chrome rise; the wordmark wrapper's `t >= 600` opacity |
| `src/app/(tabs)/index.tsx` | The feed wrapper around `Animated.FlatList`; the stories wrapper around `<TodaysPours>` |
| `src/app/(tabs)/_layout.tsx` | The tab bar's chrome rise, in the `tabBar` render prop around `<FloatingTabBar>` (FloatingTabBar stays Reanimated-free) |
| `src/components/onboarding/steps/Welcome.tsx` (and `OnboardingFlow.tsx` if Welcome's keys are drawn there) | Registers `welcome`; the wall fade and the rises |
| `src/components/auth/CabinetBackdrop.tsx` | Registers `signin` |
| `src/components/auth/SignInScreen.tsx` | The step bar and field rises (optional, B.4) |
| `src/components/PasswordResetOverlay.tsx` | Registers `reset` |
| `src/app/_layout.tsx` | Only if VideoIntro's props change |

### What each needs from the other (no shared file)

- **The stories rule's draw-on.** A passes `HOME_RULE_DRAW` (from `details/handoff`) to the `PenRule` in TodaysPours. B writes it from the dock clock. Neither imports the other. If B has not landed, the value rests at 1 and the rule is simply drawn; if A has not landed, B's writes move nothing.
- **The stories group.** B wraps `<TodaysPours>` in index.tsx; A's rule lives inside TodaysPours, so it rises with the stories. A must keep TodaysPours a single component returning one root.
- **The closing rule.** It defaults on in PostCard (A), so B's index.tsx passes nothing new.
- **`HomeWordmark`.** B keeps its name and its props-free signature, because A's TabPlaceholder renders it. B registers the target in HomeChrome, not in HomeWordmark, so the placeholder never registers.
- **The Activity dot.** It lives in `TopBarButton` (ScreenTopBar.tsx, A). B does not animate it on its own; it rides the chrome group's 64 ms linear fade, so A's ScreenTopBar needs no Dock hook.
- **check-design.** Neither package's Dock files import `details/PenMarks`, so `DETAIL_SITES` needs no change for B. A's eight files are already listed.

---

## D. Checks before either package is done

- `npx tsc --noEmit -p .`, `node scripts/check-design.mjs` and `node scripts/check-contrast.mjs` all clean.
- `node scripts/render-details.mjs` if any geometry changed, comparing `build/sheet@3x.png`.
- No FlatList cell does per-item work for a mark: the closing rule is a cached constant path, and no mark measures in a cell.
- Reduce Motion on: the film is replaced by SipplyIntro, nothing draws on, and every mark is static.
