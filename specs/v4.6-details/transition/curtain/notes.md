# v4.6 transition: "Hairline curtain" (slug `curtain`), v2

The intro film no longer just dissolves. The pen makes one last flick: a Campari hairline drawn out from under the drip's bead. The white page parts along that line, onto white, and Home develops in the gap. The wordmark rides up with the top half and docks in Home's bar, and the top half itself becomes the bar. All the red is gone 400 ms in.

- `preview.mp4`: 390 x 844 pt at 2x (780 x 1688), 60 fps, 104 frames, 1.72 s. It has 0.40 s of the film's held end frame, the 0.82 s transition, then 0.50 s of Home.
- `frames.png`: 12 frames across it (-17 to +900 ms).
- `preview-v1.mp4`, `frames-v1.png`: the first version (0.98 s), kept for comparison.
- `src/`: the Hyperframes 0.8.92 composition. `src/render.sh` rebuilds both files, using the shared `/tmp/claude-501/hf-chrome.lock` and the intro film's own encode settings (H.264 High, yuv420p, BT.709 tv range, CRF 6). Intermediate frames are deleted.

Ornament, not information: nothing in it can be read. It adds one hairline, which is gone within 400 ms. No words, counts or new marks are left on Home.

## What changed from v1, and why

| Judge's fix | v2 |
|---|---|
| Taste: the 260 ms stroke reads like a loading bar, and nothing should wait. | **Taken.** The stroke is now 160 ms, and the split starts at 100 ms, while the line is still reaching the edges. |
| Craft: start it from the drip's bead, or from the centre, so it reads as the pen. | **Taken.** The line grows out both ways from x = W/2 + 90.2 (285.2 on 390), directly under the bead. The left side is longer, so both ends reach the screen edges together. |
| Craft: the split opens with a flash onto the red Negroni (v1's per-frame mean difference peaked at 18.1, against dock's 10.3). Ease it in, or open over a white band. | **Taken, both ways.** The split curve is now `bezier(0.4, 0, 0.1, 1)`, a soft start. A white **veil** under the halves fades out over 140 to 460 ms, so the slit opens onto white and Home develops in it. Peak per-frame difference is now **10.5 at +217 ms** (dock 10.3, drip 8.8), spread over about 120 ms instead of spiking. |
| Taste: the mid-split seam frames the Negroni like a letterbox. Drop the 0.97 scale, or reveal from a calmer region. | **Partly.** The 0.97 scale is gone. The seam cannot move to a calmer region, because it belongs under the bead and Home's content there differs per person. The veil does the job instead: while the slit is narrow it is mostly white, and by the time Home is at full strength the gap is about 300 pt tall. |
| Craft: the bottom half's red edge sweeps the photo and the caption. Fade it within 80 ms of the split. | **Taken.** It fades over the split's first 80 ms, while it is still over the veil, so it never touches the photo. |
| Taste and craft: no red rule at the bar's foot at the hand-off. | **Taken.** The top edge carries the mark through the veil, then fades over 180 to 400 ms. By the dock (660 ms), measured at 2x, the band at the bar's foot has 2 red pixels, against 703 at +500 in the same band. Nothing appears and then vanishes, and if the v4.6 detail system adds a permanent rule under the bar, this needs no reconciling. |
| Craft: the wordmark and the top half move different distances, so the 12 to 3 pt gap visibly closes. Lock it with a constant offset. | **Taken in spirit, not to the letter.** A constant offset in points cannot start about 13 pt under the bead and also land 3 pt above the bar's foot. So the gap is now **proportional to the mark's scale**: the seam moved 2 pt, to centre + 106 (528 on 844), which makes the start gap 13.30 pt and the docked gap 3 pt = 13.24 x 0.2265. Everything runs on one progress value, so the mark and its gap scale as one rigid group the whole flight, and the logo reads as carried by the edge. |
| Craft and build: the mock's tab bar draws v4.4's red active line. | **Taken.** It is the shipped 18 x 2 ink line now. |
| Build: home-button phones get insets.top 0 during the film and 20 after, so a rect registered during the film is 20 pt off. | **Taken.** See "Measuring", below. The targets are re-measured after the status bar is shown, before the split moves. |
| Build: pre-mount the overlay at opacity 0 and flip it with a shared value, not on `onLayout`. | **Taken.** See "Hand-off frame". |
| Build: snap the 0.5 pt lines with `roundToNearestPixel`. | **Taken.** |
| Build: Welcome's strap landing is too much machinery. Use the sign-in variant. | **Taken.** |
| Build: drop Home's 0.97 settle. | **Taken.** Nothing in Home's tree is touched. |
| Taste: merge the curtain into dock (the wordmark docks while a pen line writes itself under the stories, with no split). | **Rejected.** That is the dock finalist with a line added. The split is this concept. If Jan prefers that, he should pick dock. |

## Where it starts: the film's real last frame

`VideoIntro` draws the clip at 220/483 pt per film px, centred. The film draws its wordmark box at film px (210, 756.48) to (870, 1163.52) (`d-the-tag/tools/data.json`, `wordmarkFilmBox`). That puts the `final/wordmark.svg` box (viewBox 462.97 x 285.52) at **300.62 x 185.40 pt, centred on the screen**, which is 0.64933 pt per path unit. This holds on every phone, because the film is sized by the splash and not by the screen. On a 390 x 844 phone the box sits at (44.69, 329.30), and the bead (the ink's lowest point) is at (285.2, 513.6).

The preview shows the real frame (ffmpeg, accurate BT.709 to full-range conversion, white exactly 255) for 0.40 s and then swaps to the drawn wordmark. They match: the centroid is 0.07 px apart at 2x, and the ink area is within 0.06%. The swap cannot be seen.

## Beats

t = 0 is the moment the clip ends, where `finish` used to start the 280 ms dissolve.

| ms | What happens | Curve |
|---|---|---|
| 0 | The overlay is shown and the video hidden in the same UI frame (it was pre-mounted). The same wordmark is in the same place on the same white. The status bar un-hides with its own fade (about 250 ms). | none |
| 0 to 160 | **The stroke.** The two halves' 0.5 pt edges, stacked into one 1 pt line at the seam (centre + 106 = 528), grow out both ways from under the bead. They leave already moving and ease into both screen edges. | `bezier(0.25, 0, 0.1, 1)` |
| 100 to 660 | **The split and the dock.** The top half rises 422 pt, so its edge stops at the foot of Home's bar (y 106) and the top half becomes the bar. The bottom half falls the same 422 pt and leaves the screen. On the same progress value, the wordmark scales 0.2265x and moves to Home's wordmark rect, (13.7, 61), 42 pt tall, with its gap to the top half's edge proportional to its size. | `bezier(0.4, 0, 0.1, 1)`: a soft start, then a confident settle. No overshoot. |
| 100 to 180 | The bottom line fades, while it is still over the veil. | linear |
| 140 to 460 | **The veil** (white, full screen, under the halves) fades, so Home develops in the opening gap. | `inOut(quad)` |
| 180 to 400 | The top line fades. From here the top half's edge is only the white bar's own edge. | `inOut(quad)` |
| 660 to 820 | **Hand-off.** The overlay (the top half and the docked wordmark) dissolves over the wordmark's exact twin. What appears is the create and heart keys and the Activity dot. | `inOut(quad)` |

Total: 820 ms (v1 was 980).

**Skip.** A tap during the film keeps today's 280 ms dissolve, because the frame on screen is not the finished wordmark yet. A tap during the curtain fades the whole overlay to 0 in 150 ms while the parts keep moving underneath. There is no jump to an end state.

**Reduced motion.** Unchanged: `SipplyIntro` plays, and the film (and so this transition) never mounts.

## Landings

**Home (signed in, the common case).** As in the preview. The top half stops as Home's bar, its edge at `insets.top + HOME_BAR_HEIGHT + 2` (106 on this phone; the story rings start at 112). The wordmark lands on the measured `HomeWordmark` rect. The bottom half leaves the screen. Home's twin wordmark and keys stay hidden under the top half until the dissolve.

**Onboarding Welcome and sign-in** (both draw the wordmark 107 x 66 in white space: Welcome centred in the strap under the photo wall, sign-in centred 32 pt under the step bar). One variant for both:
- The stroke draws as on Home.
- Both halves leave the screen: top travel = seam + 1, bottom travel = H - seam + 1, on the split curve over 100 to 660.
- The top line fades over the split's first 120 ms, because the mark is not carried by it here. On Welcome the mark sinks below the seam, and on sign-in it rises past the top line. The bottom line fades in 80 ms, as on Home.
- The wordmark flies to its measured rect on the same progress value.
- **Twin cover:** a `colors.bg` patch exactly over the destination rect plus 2 pt, under the flyer, so the screen's own wordmark does not show as a second logo once the veil has cleared. Both slots are on plain white. The flyer and the patch unmount together in one frame at 660, revealing the identical twin.
- Total 660 ms, then unmount.

**Any other first screen, and the fallback.** This covers a cold-start deep link to a drink, a post or a collection; the password-reset overlay; a restored tab; Home whose wordmark ref was not registered within 100 ms of the clip ending; and Home whose bar is not at rest (hide-on-scroll translate is not 0). Nothing is measured. The stroke draws, then both halves leave (travel = max(seam, H - seam) + 1, the split curve, 100 to 660). The lines fade as on Home, and the veil fades as on Home. The wordmark goes out rigidly with the top half: same translateY, no scale. The title card lifts away. 660 ms, then unmount.

## Building it natively

Reanimated 4.5 shared values, transforms and opacity only. No `entering`/`exiting`/`layout` props (they stall in Release builds). No new native modules.

**Where it lives.** Add `src/components/intro/CurtainExit.tsx`. `Film` mounts it **with the film** (pre-mounted, `shown = 0`), inside the same `accessibilityViewIsModal` root, so VoiceOver still cannot walk into the Stack early. Taps during the film, errors and the ceiling timer still use `finish` and the 280 ms dissolve, and never show the curtain.

**Hand-off frame.** Wrap the VideoView (and the fill's white) in an `Animated.View` whose opacity is `1 - shown`, and give the overlay root opacity `shown`. On `playToEnd`, set `shown.value = 1` and start the values in the same call. Both flip in one UI frame, and the overlay's SVG has been rasterised since the film mounted, so there is no frame where it has not drawn. The veil is white and full-screen, so even if the fill drops a frame early, the Stack cannot show.

**Pieces** (all `Animated.View` plus `useAnimatedStyle`):
- **Veil:** full screen, `colors.bg`, the overlay's first child.
- **Halves:** two `colors.filmPaper` Views, `top: 0, height: seam + h` and `top: seam + h, height: H - seam - h`, where `seam = PixelRatio.roundToNearestPixel(H / 2 + 106)` and `h = PixelRatio.roundToNearestPixel(0.5)` (0.5 at 2x, 0.667 at 3x, so 1 px and 2 px; never `hairlineWidth`, which is 1 px on 3x and too faint).
- **Lines:** each half has an `h`-tall `colors.accent` child on its cut edge, `transform: [{ scaleX: draw }]` with `transformOrigin: [beadX, 0, 0]`, where `beadX = W / 2 + 90.2`. Stacked, they are the stroke. There is no separate stroke View.
- **Flyer:** react-native-svg `Svg` and `Path` with `WORDMARK_PATH.d`, drawn **directly** in a 300.62 x 185.40 box at the film rect (W/2 - 150.31, H/2 - 92.70). Do NOT use `<Wordmark>`: it multiplies its height by `min(fontScale, cap)`, so under Larger Text it would leave the film's frame. Use the full cut, with the drip, the whole way.
- **Twin cover** (Welcome and sign-in only): one `colors.bg` View at the destination rect plus 2 pt, between the halves and the flyer.

**Values.**
```ts
const E = Easing.bezier;
draw.value = withTiming(1, { duration: 160, easing: E(0.25, 0, 0.1, 1) });
part.value = withDelay(100, withTiming(1, { duration: 560, easing: E(0.4, 0, 0.1, 1) }));
veil.value = withDelay(140, withTiming(0, { duration: 320, easing: Easing.inOut(Easing.quad) }));
lineBot.value = withDelay(100, withTiming(0, { duration: 80, easing: Easing.linear }));
lineTop.value = withDelay(180, withTiming(0, { duration: 220, easing: Easing.inOut(Easing.quad) })); // 120 ms from 100 on Welcome/sign-in
fade.value = withDelay(660, withTiming(0, { duration: 160, easing: Easing.inOut(Easing.quad) },
  (ok) => { if (ok) runOnJS(done)(); })); // Home only; elsewhere unmount at 660
```
- Halves: `translateY = interpolate(part, [0, 1], [0, -topTravel])` and `[0, botTravel]`. Travels are shared values, so they can be corrected before `part` moves (see "Measuring").
- Flyer: centre-origin transforms, `[{ translateX: dx * part }, { translateY: dy * part }, { scale: 1 + (s - 1) * part }]`, where dx and dy are the centre-to-centre deltas and `s = dockH / 185.40`. Because the halves and the flyer share one progress value, the proportional gap holds at every frame, with nothing extra to compute.
- Keep a JS timer guarantee (1150 ms) that calls `done`, like the existing `EXIT_MS + 120` timer.

**Measuring.** Register a **ref**, not a rect, through a tiny module store in `src/lib/intro.ts` (`setDock({ kind: 'home' | 'welcome' | 'signin', ref, atRest?: () => boolean })`). Register only while this runtime's intro is still running.
1. At `playToEnd`, un-hide the status bar first, then start the stroke right away with provisional targets.
2. After the next frame (and after the safe-area insets update, or at +60 ms at the latest), call `measureInWindow` on the ref and write dx, dy, s and `topTravel = seam - (rect.y + rect.height + 3)` into the shared values. `part` does not move until 100 ms, so the correction cannot be seen. This is what handles home-button phones, where insets.top goes from 0 to 20 when the status bar returns and Home shifts 20 pt, unseen, under the veil.
3. On Home, also check `atRest()` (the hide-on-scroll translate is 0). If the ref is missing at 100 ms, the measurement fails, or the bar is not at rest, use the fallback.

**Geometry on other phones** (seam = H/2 + 106; the dock gap is always 3 pt, because the wordmark box is the same everywhere):

| Phone | Seam | Top half travel to the bar | Bottom half travel |
|---|---|---|---|
| 390 x 844 (insets.top 59) | 528 | 422 | 422 |
| 440 x 956 (insets.top 62) | 584 | 475 | 475 |
| SE 375 x 667 (insets.top 20 once the bar is shown) | 439.5 | 372.5 | 372.5 |

## Checked on the render

- Per-frame mean difference (grey, 390 x 844): the peak is 10.5 at +217 ms (v1: 18.1 at about +283). Dock is 10.3 and drip 8.8.
- The stroke starts directly under the bead and reaches both edges together (crops at +17, +33, +67 and +100 ms).
- Red pixels in the band at the bar's foot (2x rows 205 to 220): 703 at +500, 100 at +560, 19 at +600, 2 at +660. No rule is left at the hand-off.
- Docked flyer against Home's own wordmark (the frame at +667 against the last frame): the ink centroid is 0.5 px x and 0.4 px y apart at 2x, about 0.25 pt, and the ink area is within 0.6%. That is Chrome rasterising a scaled image against a small one. It is crossfaded over 160 ms, so it is invisible, and natively both are the same vector path at 42 pt.
- The tab bar's active line is ink.

## Weak spots

1. The veil is a dissolve laid under a wipe. It is what kills the flash and the letterbox, but a purist could call it two ideas. If it reads as mushy on device, shorten it to 240 ms before removing it.
2. The top line now lives only to 400 ms, so after that the "top half becomes the bar" read rests on the white half's own edge against Home. That is quieter than v1, and is what was asked for.
3. Only Home was rendered. Welcome, sign-in (with the twin cover) and the fallback are specified here, not rendered.
4. A 0.5 pt line on a fractional translateY spreads across two pixel rows while it moves. It is snapped at rest, and in motion it is soft for the frames it is visible, which are few.
5. The flash is now at dock's level, not below it (10.5 against 10.3). The remaining peak is Home itself arriving, which every finalist has to do.
