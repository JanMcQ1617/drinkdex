# The drop (slug `drip`): from the intro film into the app

v4.6 transition study, 23 Oct 2026. Jan asked for "some sort of motion design that transitions into the app" in place of the film's plain fade.

The idea: the drip on the y lets go. One red drop falls down the screen and lands as the red + key in the tab bar, where the accent lives. As it lands, the film's white lifts away like a sheet of paper and reveals Home, while the wordmark docks into Home's top bar.

It uses no new colour, words or marks. The drop is the logo's own paint (accent place 6) and it becomes the + key (place 1), so the accent count stays at six.

- `preview.mp4`: 1170 x 2532 (390 x 844 pt at 3x), 60 fps, 1.90 s. It holds the film's end frame for 0.4 s, plays the 1.00 s transition, then holds Home for 0.5 s.
- `frames.png`: the contact sheet, labelled in ms from T0.
- `source/`: the HyperFrames project (hyperframes@0.8.92).
  - `tools/state.cjs` is the whole motion model as one pure function of time. The native build should port it line for line.
  - `tools/gen.cjs` draws Home at 390 pt (the v4.4 campari Home with the v4.5 wordmark) and inlines the model.
  - Rebuild with `npm run build && npm run render:png && tools/encode.sh && python3 -I tools/sheet.py`. The render runs under the shared `/tmp/claude-501/hf-chrome.lock`.

## Where it starts: the film's last frame, exactly

`VideoIntro` draws the film at 220/483 pt per film px, centred. The film draws the wordmark at 1.426 film px per design unit, with the viewBox centre (215.805, 161.11) placed at film (540, 960). On a 390 x 844 phone that gives:

| | value |
|---|---|
| pt per wordmark unit | 0.64953 (`FILM_PT * 1.426`) |
| wordmark box | 300.7 x 185.45 pt, centred on the screen (195, 422) |
| the drip's bead | design (355, 296), r 7.88 → screen (285.41, 509.61), r 5.12 pt |

Check: the last frame of `assets/video/intro.mp4`, mapped the same way, against frame 0 of the render. The ink bounding boxes match to 1 px at 3x (137,990 to 1033,1542 against 137,991 to 1033,1541). No pixel differs by more than 79/255, and those are anti-aliasing and YUV edge pixels only.

## Beats (ms from T0 = the film's last frame)

| ms | beat | curve |
|---|---|---|
| 0 to 110 | **The drip lets go.** A drop (r 4.6, a little smaller than the 5.12 bead) swells out of the bead on a neck that pinches at its middle and thins to nothing. The neck snaps at 110. The bead stays: the wordmark is never changed. | the drop's y is on the fall curve below |
| 0 to 500 | **The fall.** One gravity curve, `y = bead.y + (key.y - bead.y) * u²` (u = t/500), so it starts from rest. It drifts 90 pt left onto the tab bar's centre: x eases in and out from 70 to 500, so it lands straight down. It draws to a point along its travel as it speeds up: tip at r × (1 + 0.95n), sharpness 0.85n, where n is speed over landing speed. | y: quad-in; x: `bezier(0.45, 0, 0.55, 1)` |
| 140 to 760 | **The wordmark docks** into Home's bar. Its centre moves on a straight line from (195, 422) to (47.74, 70), the 42 pt box at (13.69, 49) with `lead`. Its scale goes from 0.64953 to 0.14710 pt per unit, interpolated in log space so the shrink looks even. The drip and bead go with it, because Home's 42 pt wordmark is the full cut. | `bezier(0.35, 0, 0.05, 1)`: a soft start, then a long, sure settle, no overshoot |
| 480 to 1000 | **The white lifts away.** The film's ground moves up as one sheet, 878 pt, with a soft paper shadow under its foot (0 10 24 ink at 7%, plus 0 1 0 ink at 5%). It reveals Home from the tab bar up. Its peak speed is 64 pt a frame at 60 fps. The first curve tried peaked at 118 and read as a flash. | `bezier(0.25, 0.1, 0.25, 1)` (CSS "ease") |
| 500 | **Landing**, at full fall speed, on the + key's centre (195, 785.5). No squash, no bounce. | |
| 500 to 680 | **The drop opens into the key.** Its footprint (8.3 x 13.3, fully round) grows to 52 x 38, and the corner radius goes from 4.15 down to 4. | `bezier(0.2, 0.8, 0.2, 1)`, a hard ease-out |
| 570 to 740 | **The + draws** out from the key's centre: two white 1.83 pt round-capped strokes, 12.47 pt long, matching `icons.tsx` plus at 22 pt and stroke 2. Opacity rises over the first fifth so the + never starts as a dot. | `bezier(0.25, 0.6, 0.3, 1)` |
| ~830 | The status bar shows. In the mock it sits under the sheet and appears as the sheet clears the top strip. | |
| 1000 | **Hand-off.** The overlay's wordmark and key are pixel-identical to Home's own. The overlay goes and Home's own pair shows in the same frame. Measured on the render: the hand-off frames differ by at most 51/255, on anti-aliased icon edges only. | |

The transition lasts 1000 ms in all. The motion is confident ease-out throughout: nothing overshoots, bounces or wobbles.

## How it lands, screen by screen

The overlay has two optional targets, registered by whatever screen sits under the film: a **wordmark rect** and a **key rect**. Each beat runs only if its target exists, so a screen gets the full transition, part of it, or the fallback without any special case.

1. **Home (signed in)**: both targets, so it runs the full transition above. If someone is restored into another tab, the + key still registers its rect but no wordmark does. The drop still lands on the +, and the wordmark rides the sheet off the top, as in fallback 4.
2. **Onboarding's Welcome**: the wordmark is 66 pt and centred, and there is no + key.
   - The drop does not let go. Welcome's keys are ink, and a red key there would make a seventh accent place, which is Jan's call (spec §1.3).
   - The wordmark docks straight into Welcome's measured 66 pt box: scale 0.64953 to 66/285.52 = 0.23116 pt per unit. It moves only about 0.36x and slides to Welcome's centre-line.
   - Timing: dock over 0 to 600 on the same `bezier(0.35, 0, 0.05, 1)`. The sheet lifts over 120 to 640 on CSS "ease", revealing the drink wall above the name. Hand-off is at 640.
   - The drip and bead stay on the name, because 66 pt is the full cut.
3. **Sign-in** (`auth/CabinetBackdrop`, 66 pt wordmark at the top of the form): the same as Welcome, docking into its measured box. If the sheet's scroll has moved the wordmark off screen, there is no rect and it falls back to 4.
4. **Any other first screen** (a cold start into an invite, a password-reset link with its own overlay, a drink deep link, or anything that registers no target): the wordmark rides the sheet. It keeps the film's size and position, translates up with the white as one piece over 0 to 520 on CSS "ease", and hands off at 520. The result is the old fade's length, but as a lift instead of a dissolve, so the film never pops. `PasswordResetOverlay` draws a 66 pt wordmark and may register it to get landing 2 instead.

**Tap to skip** works at every point.
- During the film, the existing handler still takes the film and the transition away together, with the 280 ms dissolve.
- During the transition, a tap fast-forwards the one clock (below) to its end over 160 ms (`withTiming(END, { duration: 160, easing: Easing.linear })`). Every beat completes in order and lands exactly. Nothing is cut, and there is no second dissolve.

**Reduced motion** never reaches this: `VideoIntro` already hands that case to `SipplyIntro`.

## Building it natively (Reanimated 4.5, react-native-svg 15.15, no new native modules)

**One clock.** A single shared value, `clock` (ms), is driven by `withTiming(END, { duration: END, easing: Easing.linear })`. Every style and prop is a worklet function of `clock`, ported from `state.cjs`. The bezier curves are `Easing.bezier(...)`, called as `.factory()` inside a worklet or pre-built outside. There is no `withSequence` chain to keep in sync. Skipping is a second `withTiming` on the same value, and a resume after backgrounding is a check against the clock. Do not use `entering`, `exiting` or `layout` props anywhere: they stall in Release builds.

**Mount early, swap invisibly.** Mount the overlay hidden with the film (opacity 0), so its SVG has rasterized long before it is needed.
- On `playToEnd`, in one UI-thread frame, set `overlayShown = 1` and hide the `VideoView`.
- Only then start `clock`.
- The overlay's first frame equals the film's last frame (see "Where it starts"), so the swap cannot be seen.
- The existing `CEILING_MS` guarantee stays, extended by END.

**Layers, back to front, all absolute in window coordinates:**

1. **Sheet**: an `Animated.View` filling the screen in `colors.filmPaper`, with `translateY = -878 * lift(clock)`.
   - Shadow: `shadowColor: colors.ink, shadowOpacity: .07, shadowRadius: 12, shadowOffset: {0, 10}`, plus a 0.5 pt foot line `rgba(10,10,10,.05)` drawn as a child View.
   - The status bar comes back at `LIFT0` (`<StatusBar hidden={false} animated />`, which fades).
2. **Wordmark**: an `Animated.View` laid out at the **film** size, 300.7 x 185.45, centred on the film's centre, holding the existing `Wordmark` (react-native-svg).
   - Use transforms only: `translateX/Y = lerp(from, to, d)` and `scale = exp(lerp(0, ln(toH / 185.45), d))` about its centre. Laying it out large and scaling down keeps it sharp.
   - `shouldRasterizeIOS` (and `renderToHardwareTextureAndroid`) during the move avoids re-tessellating the 22 KB path every frame.
3. **Neck and drop**: one `Svg` across the screen with two `AnimatedPath`s (`Animated.createAnimatedComponent(Path)`), whose `d` comes from `useAnimatedProps` worklets. These are `dropPath()` and the neck from `state.cjs`, which use only plain math and string building.
   - Fallback if that proves heavy on device: a 9.2 pt round `Animated.View` that rotates to the velocity angle and stretches `scaleY 1 to 1.95` and `scaleX 1 to 0.9` with speed. The tip is lost; the read is the same.
4. **Key**: an `Animated.View` filled with `colors.accent`, centred on the measured key centre.
   - Its `width`, `height` and `borderRadius` are animated. Reanimated 4 commits these from the UI thread on Fabric. It is one small view for 180 ms.
   - The + is two white `View` bars, 1.83 x 12.47, round-ended, scaled from 0 with `scaleX` and `scaleY` about the centre, or two `AnimatedPath`s.

**Veil the real pair.** Home's wordmark and the tab bar's + must not show through the lifting sheet before the overlay's copies are complete. Otherwise the real key appears beside a half-open drop: the first render showed exactly that.
- Add `introVeil = makeMutable(0)` to `src/lib/intro.ts`.
- `HomeWordmark` and `FloatingTabBar`'s `CentreAction` multiply their opacity by `1 - introVeil.value` in a `useAnimatedStyle`.
- The overlay sets `introVeil = 1` when it starts. At END, in the same worklet frame, it sets `overlayShown = 0` and `introVeil = 0`, then `runOnJS(done)`.

**What has to be measured** (window coordinates, `measureInWindow` or Reanimated `measure()` after layout; the film runs 5 s, so everything has laid out by then):

- **The destination wordmark's window rect.** Home's `HomeWordmark` box: (13.69, insets.top + 2), 68.1 x 42 at default text size, up to 44 tall under Larger Text. Also Welcome's and sign-in's 66 pt `Wordmark`. Each registers itself in `src/lib/intro.ts` (`registerIntroTarget('wordmark', rect)`) from `onLayout`, and clears it on unmount. The dock uses the rect's centre, and its height over 185.45 as the end scale. Do not hard-code 42.
- **The + key's window rect** from `CentreAction` (52 x 38 at the bar's centre slot; cy = H − insets.bottom − 24.5). Its centre is the drop's landing point, and its size is what the drop opens to.
- **The film's own wordmark and bead rect**: computed, not measured. Use the screen centre, `FILM_PT * 1.426 * viewBox`, and the bead at design (355, 296) r 7.88 (export these from `VideoIntro` next to `FILM_PT`). This works on any screen size because the film is drawn at the splash's scale, not cover-fitted.
- **insets.top and insets.bottom**: these place Home's wordmark and the key. On a 440 pt phone the key's x is 220, and the drop still drifts the same 90 pt.

**Verify on device:**
- Take one screenshot at END − 1 frame and one at END + 1. They should not differ beyond anti-aliasing.
- Check that the first overlay frame against the film's last frame is identical.
- Run a Release build: there should be no dropped frames in the 480 to 680 window, where the sheet, key and drop all move at once.

## Things to know

- The mock is a 390 x 844 iPhone 13/14 (insets 47/34). Home's wordmark and + key are drawn in SVG there. An HTML box snaps its edges to whole CSS px before the 3x scale (13.69 to 14, 766.5 to 767), which the app does not do, and that showed up as a 0.3 to 0.7 pt jump at the hand-off until it was fixed.
- The residual 51/255 edge difference at the hand-off frame is Chrome re-rasterizing Home's layer when the sheet's opacity drops. It is not part of the motion.
