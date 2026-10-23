# v4.6 details · "Pen marks" (slug `pen`) · v2

Jan, 23 Oct 2026: "add some type of border design … the red accent, but delicate details … simple yet complex." Standing rule (9 Oct): less stuff.

v1 (five marks) is kept in `v1/`. v2 applies the three judges' fixes; what changed and what was rejected is at the end.

**The idea.** The logo is the paint pen at full weight, so every detail is that pen at hairline weight. v2 has three marks and one colour. Each mark is ornament: it adds no word, count, badge, icon or decision, and it never turns an existing state or figure red. At a glance a screen reads as it did before. On a second look, the hand that wrote "sipply" has underlined a title, drawn one border and, once, dripped.

## The pen (all three marks)

- **Drawn, not stroked.** Each mark is a *filled* outline built around a centreline. Its width swells where the pen lands and thins as it lifts, and the caps are round. A uniform `strokeWidth` line is not allowed, because it reads as UI rather than a hand.
- **Colour:** `accent` #D0102C only, at 100% opacity. No tint, no gradient, no second hue, and never `accentPressed`.
- **Weight range:** 0.4 to 1.25 pt for lines. The drip's bead is a 2.8 pt dot. **No width falls below 0.4 pt** (`FLOOR` in `penPath()`). At 2x, 0.25 pt is half a device pixel and smears to pink.
- **Static.** The one motion is the rule's draw-on that ends the intro (below). Marks never loop or pulse.

| # | Mark | Size | Width (land → peak → lift) | Shape |
|---|---|---|---|---|
| 1 | **Swash** | 56 × 6 pt at text scale 1. The length is multiplied by `min(fontScale, BAR_TEXT_SCALE_CAP)` (1.3), and the weight does not scale | 0.45 → 1.25 → 0.4 | A low arc that flicks up at the end, like the y's tail. It starts 1 pt right of the title's left edge, with its top 2 pt above the line box's foot. |
| 2 | **Drawn rule** | Column width (24 → 416 pt) × 6 | 0.4 → 1.1 → 0.4 | One long waver of 1 pt peak to peak (about 1.3 swells across the column), so it reads as a hand and not as aliasing. A 2 pt flick up over the last 5% as the pen lifts. |
| 3 | **Drip** | 8.5 pt from the plate's edge to the foot of the bead | 3.4 meniscus → 0.8 neck → 2.8 pt teardrop bead | Paint leaves the caught plate's bottom edge **6 pt in from its right corner**, where paint gathers. It necks, then ends in a teardrop. The run and the bead are two paths: one path would cancel itself where they overlap under nonzero fill. |

**Retired in v2:** the **ring** around the caught figure and the red **pen tick** in "In your Dex". The figure is already accent place 4, so circling it adds emphasis, and emphasis is information. A red check makes red mean "caught", which would in practice be a seventh accent place. The check stays the muted grey glyph. Neither returns, not even for empty states.

## Where each goes

| Surface | Mark | Notes |
|---|---|---|
| **Top bar, tab roots** | Swash under the title (Dex, Saved, your username) | One per bar. Home's bar has none, because its wordmark is already the pen. Never under a centred `barTitle`. |
| **Home** | Drawn rule under the story tray | The app's one border. It replaces the 1 pt `line` under the stories (§5.10). |
| **Drink page, caught** | Drip off the Nº plate | **Its only use in the app.** A drink not yet caught gets nothing. |
| **Pushed screens, windows, sheets** | None | Their centred `barTitle` stays plain, so they read as transient. |
| **Empty states** | None of their own | If the empty state sits on a tab root, its title swash is the mark. |
| **The caught figure** ("14 / 2,089", "14 entries") | **Never** | It is already red, so a mark on it would be emphasis. |
| **Lists, grid cells, cards, feed posts** | **Never** | Nothing repeats per row: a mark on every item becomes a pattern, and a pattern is clutter. |
| **Photos and prints** | **Never** | Nothing is drawn on or over a photograph, and no mark touches a print's edge. |
| **Buttons, keys, chips, fields, state glyphs** | **Never** | This covers the + key, the post key and the In-your-Dex check. A mark on a control or a state reads as a state. |
| **Tab bar** | **Never** | The accent never says where you are (§1.3). The active line stays ink. |
| **Avatars, story rings** | **Never** | A red loop around a face reads as an unseen story. |
| **Body text, usernames, links** | **Never** | A pen underline under readable text looks like a link. The swash goes under titles only. |
| **Errors, destructive actions, alerts** | **Never** | Red still never means delete or error. |
| **On ink or accent grounds** | **Never** | The drip is the one mark that touches red, and it leaves the plate as the same paint. |

## Budget

- **One mark per screen.** The logo does not count. Today: Home 1 (rule), Dex 1 (swash), Drink 1 (drip), Profile 1 (swash), Saved 1 (swash), sheets and pushed screens 0.
- The drip appears once in the whole app, and the rule only on Home.
- Adding a mark anywhere else is Jan's decision, made in this file and in check-design rule 17's allowlist together, like a seventh accent place. If Home still feels bland, the next step is the rule's peak at 1.25 pt, not a second mark.

## The hand-off (the intro's last beat)

The draw-on is the end of the intro transition, so the motion and the detail system read as one idea.

- When the film clears onto **Home**, the drawn rule draws left to right: **320 ms**, ease-out (`Easing.out(Easing.cubic)`), starting as the film's fade completes. It runs once per cold start.
- New people land on Welcome or sign-in, which have no rule, so nothing draws for them.
- Swashes never draw on. They stay static, so the tab-root bars do not depend on the intro's lifecycle.
- Under Reduce Motion the rule is static and drawn from the first frame.
- Mocked as frames at 30%, 65% and drawn: `mock/index.html#campari-home.pen.draw30` (`out/crop-draw*.png`).

## Build (React Native)

- One file, `brand/PenMarks.tsx`, exports `Swash`, `DrawnRule` and `PlateDrip`. Each is one react-native-svg `<Path fill={colors.accent}>`, or two for the drip (run + bead), inside a small absolutely positioned `<Svg>` with `pointerEvents="none"` and `accessible={false}`. They carry no meaning, so they have no labels.
- The geometry is fixed, so the `d` strings are precomputed constants generated by `penPath()` in `mock/index.html`, with no runtime math. The swash is drawn at 56 pt and scaled on x only by `min(fontScale, BAR_TEXT_SCALE_CAP)` through the Svg `viewBox` (`width = 58 * s`, `preserveAspectRatio="none"`), so its weight is unchanged.
- **`PlateDrip` is a drink-page-only prop on `plate.tsx`** (`drip?: boolean`, honoured only for `tone="caught"`, `size="lg"`). Grid cells, the likers sheet and the catch card never pass it, so they never mount the Svg. The plate needs `overflow: 'visible'` and 9 pt of clearance under it. On the drink page the facts sit 22 pt below the plate, so nothing moves.
- `DrawnRule` sits once in Home's list header, never in a cell. Its draw-on is a single Reanimated `animatedProps` on a `ClipPath` `Rect` width. It reads a one-shot `introHandoff` shared value that `VideoIntro` sets when its fade ends. If the value has already fired, or Reduce Motion is on, the rule mounts fully drawn.
- No mark lives in a FlatList cell, feed post or grid tile, so scrolling costs nothing. Each screen adds at most one static path. There are no shadows or images, and nothing runs on a frame clock except the one 320 ms draw-on.
- Guards: add `PenMarks` to check-design rule 17's list of components allowed to read `colors.accent`. Add a rule that `PenMarks` is never imported by a list `renderItem` or by `PostCard`.

## v2: the judges' fixes

**Accepted**
- Taste and craft: removed the red pen tick, so the check stays grey.
- Taste and craft: removed the Profile ring. Craft's case that the Dex ring is also emphasis convinced me too, so **the ring is retired everywhere**. That also settles craft's "Dex gets one mark".
- Taste: the swash goes on tab roots only and never under a centred `barTitle`, now written into the rules.
- Taste: the Home rule peaks at 1.1 pt.
- Craft and build: every width is floored at 0.4 pt, which also meets build's 0.33 pt floor.
- Craft: the drip runs 8.5 pt and ends in a real teardrop with a meniscus at the plate. It moved from 18 pt in (which read as accidental) to 6 pt in from the corner.
- Craft: the rule's waver is now a visible 1 pt across the column, where before it was 0.4 pt of aliasing jitter.
- Build: the swash length scales with `min(fontScale, 1.3)`.
- Build: `PlateDrip` is a drink-page-only prop on `plate.tsx`.

**Moot.** Build's `textWidth()` measurement for the ring and the ring's 7 pt margin and SE wrap check no longer apply, because the ring is gone and the Dex bar and Profile row keep their layout.

**Split decision.** Taste asked to ship the draw-on as the intro's last beat, and build asked to drop it because it ties the tab-root bars to the intro. I kept the draw-on **on Home's rule only** and dropped it from the swashes. Jan asked for motion that carries the intro into the app, and the rule is the mark on the screen the intro reveals. No tab-root bar depends on the intro's lifecycle.

**Rejected:** none outright. Craft's alternative for the rule ("make it straight and taper only the width") is the fallback if the visible waver reads as wobble on device.
