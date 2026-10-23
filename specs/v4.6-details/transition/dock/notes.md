# Dock: from the intro film into the app (v2, 23 Oct 2026)

The film ends on the finished wordmark, centred on white. Instead of dissolving, that same wordmark shrinks and glides up into the spot where Home draws it, in the top bar on the left. The app rises up behind it as it leaves:
1. the frame (the bar's keys and the tab bar);
2. the feed;
3. the stories, once the wordmark has left their row.

Last, the pen signs the page: the details system's one Home mark draws on under the stories, left to right. This adds no new words or decisions. The only new red is that mark, and it belongs to the details system.

- `preview.mp4`: v2. 780 x 1688 (390 x 844 pt at 2x), 60 fps, 107 frames, 1.78 s: 0.40 s of the film's held end frame, the 0.88 s transition, then 0.50 s of Home.
- `frames.png`: v2. 12 frames from the film's end frame to 900 ms, plus four 2x crops of the pen draw.
- `preview-v1.mp4`, `frames-v1.png`: the first version, kept for comparison.
- `source/`: the Hyperframes composition (hyperframes@0.8.92, the same pin and lock as `~/Projects/sipply-intro/d-the-tag`). `npm run render:png` writes `out/png` (frame_000001 is t = 0, so the swap is frame 25). The encode command is at the end of this file.

## What changed from v1, and why

| Judge's fix | Verdict | What I did |
|---|---|---|
| Close the dead air: start the stories at about 220 to 240 ms and the post at about 280 to 300 ms (taste, craft) | **Accepted, reordered** | The feed starts at **240 ms**: by then it is clear of the wordmark (wordmark foot y 194 at 233 ms, post header at 233). The chrome group now arrives at 160 ms, so from 160 ms the screen is already the app's frame, never a blank page. I first tried the stories at 240 ms too, but frames 267 to 367 ms put the red script directly on "Your story" and "ana". So the stories alone still wait until **360 ms**, nested inside the feed's rise. Something new arrives every 80 to 120 ms from 160 to 600. |
| Merge the four groups into two (craft) | **Partly accepted** | The bar's keys and the tab bar are now one group, **chrome**. The feed and the stories stay separate, for the overlap reason above. That makes three rises, not four, read in one direction: the page comes up behind the leaving wordmark, bottom first. |
| Opacity faster than translate, so the Negroni is never washed pink (taste, craft) | **Accepted** | Opacity runs over the first 30% of each window: 132 ms on RISE for the feed, past 0.9 within 50 ms. Measured: the photo is visibly tinted in 2 frames (250 and 267 ms) where v1 had about 8. |
| The + key and the dot must not pass through pink: translate only, or a fade under 80 ms (craft) | **Accepted, as the < 80 ms fade** | Translate-only can't work, because at frame 0 a tab bar 10 pt low would show over the film's white and break the invisible swap. So the whole **chrome** group fades in over **64 ms, linear** (4 frames) while it rises over 360 ms. Measured: the + key is tinted in 3 frames (183 to 217 ms). The dot now has its own reveal at 480 ms: full red within 48 ms, at 0.4 scale, then it grows. It is never a pink disc. |
| Soften the start, about bezier(0.3, 0, 0, 1) (craft) | **Accepted** | The dock now runs `bezier(0.3, 0, 0, 1)` over the same 600 ms. The foot's speed over the first frames is 1.3, 4.6, 9.4, 16.7, 27.7 pt per frame, where v1 had 3.1, 11.9, 25.7, 40.9. It peaks at the same 45 pt per frame around 117 ms. From 250 ms the path matches v1 to within 1 to 2 pt, so the stories' clearance still holds. I tried 640 ms; it delayed the clearance by 30 ms for no visible gain. |
| A motion-design moment: the pen draws on under the stories at about 560 to 840 ms (taste); tie the dock to the detail system (craft) | **Accepted, as a slot** | **The pen signs the page** at 560 to 840 ms: details/pen mark 3, the drawn rule (24 to 366 pt, y 205, the exact `ruleD` path), revealed left to right over 280 ms with `Easing.out(cubic)`. That is the draw-on pen's own rules already allow ("a 280 ms left-to-right clip … right after the intro film"). It adds no time: the transition is still 880 ms. **It belongs to whichever details system Jan picks.** Ledger puts its Home head double rule in the same place (tray foot + 5) and would extend the same way in the same window. Proof and Menu put their Home mark between posts, below the fold at launch, so with them this beat is simply dropped and the dock ends complete without it. |
| Tab bar active line drawn red in the preview (taste, craft, build) | **Accepted** | Re-rendered with the **ink** 18 x 2 line, as FloatingTabBar ships it (§1.3). |
| Only the first PostCard wraps; on 440 x 956 the next post's header shows (build) | **Accepted** | The feed group wraps the **whole `Animated.FlatList`** in Home (`(tabs)/index.tsx`), not item 0, so every visible row, header and footer moves together on any phone size. The stories' rise is a second wrapper around `TodaysPours`, inside the list header. Nesting is fine: opacities multiply, and the feed's is already 1 by 290 ms. |
| Pre-mount the fly SVG; don't mix a React mount with a UI-thread opacity change (build) | **Accepted** | See Build: the fly view mounts with the film and is driven entirely by shared values. One `runOnUI` sets the phase, the clock and the ground in the same UI frame. |
| SE status bar: insets.top goes 0 to 20 at the swap and onLayout won't refire (build) | **Accepted** | The target rect is a shared value, re-measured whenever `insets.top` changes (and on dimension change), and the flight reads it live every frame. See Build. |
| FloatingTabBar promises "no Reanimated" (build) | **Accepted** | The tab bar's rise wrapper lives in `(tabs)/_layout.tsx`'s `tabBar` render prop, around `<FloatingTabBar>`. The component itself is untouched. |
| The tap after 3.50 s needs `player.currentTime` synchronously (build) | **Accepted** | Read in the skip handler. If it is unknown or under 3.50, it falls back to the dissolve. See Skip. |
| Keep the tap-to-fast-forward and the settle fallback (taste) | **Kept** | Unchanged. |

Rejected: nothing outright. The one part I didn't take is "merge to two groups", for the stories only, because the frames showed the cost.

## Geometry (390 x 844 pt)

| | left | top | width | height |
|---|---|---|---|---|
| Film (VideoIntro: 220/483 pt per film px, centred) | -50.95 | -15.25 | 491.93 | 874.53 |
| Wordmark box at the film's end (gen.cjs: viewBox 660 film px wide, centred on film 540, 960) | 44.69 | 329.30 | 300.62 | 185.40 |
| Home's wordmark (HomeChrome: 42 pt, `lead`, on the 44 row's foot) | 13.69 | insets.top + 2 | 68.10 | 42.00 |

Scale is 0.22654. The preview uses the v4.4 mock's 62 pt status band, so the destination top is 64, matching the rollout board's (13.7, 64). On a device the destination is measured, never assumed (see Build).

I checked that the hand-off from film to vector can't be seen. I extracted the film's last frame (frame 299, decoded BT.709 limited range to full, giving exact #FFFFFF) and placed it as VideoIntro places the film. I then compared it with the vector wordmark drawn at the box above. The ink bounding boxes match to 1 px at 2x, the grounds are both 255, and the only differences are anti-aliasing at the edges.

## Beats (ms from the film's `playToEnd`)

| ms | what |
|---|---|
| 0 | **Swap.** In the same UI frame, the vector wordmark (already mounted, hidden) shows at the film's box, and the film plus its white fill go to opacity 0. Home is already underneath on the same white, with every group at opacity 0, so nothing on screen changes. Measured: the grounds are both 255, and the wordmark differs only in anti-aliasing at its edges (mean difference 0.1 to 0.27 per channel). The status bar is un-hidden (`animated`). |
| 0 to 600 | **Dock.** translateX, translateY and scale (1 to 0.2265, origin top-left) on one curve, `DOCK = Easing.bezier(0.3, 0, 0, 1)`. It eases off the still frame over about 5 frames, peaks around 117 ms, then has a long settle: the foot is at y 229 by 200 ms and 130 by 383 ms, and the last 2 pt ease in until 600. The path is straight, with no bounce or overshoot. |
| 160 to 520 | **Chrome:** the bar's keys and the tab bar rise 8 pt on `RISE = Easing.bezier(0.22, 1, 0.36, 1)`, with opacity 0 to 1 **linear over 64 ms**, so the red + key is tinted in at most 3 frames. They never cross the wordmark, which stays left of x 213 and above the tab bar. |
| 240 to 680 | **The feed** (the whole list) rises 16 pt on RISE, with opacity on RISE over its first 132 ms (0.49, 0.77, 0.90, 0.96 …). It is clear of the wordmark from its first frame. |
| 360 to 780 | **The stories** (nested in the list) rise 14 pt more, with opacity on RISE over 126 ms. They start only once the wordmark's foot (y 136 at 360 ms) is above the rings' top plus the offset (129 + 14 at opacity 0). The drip passes through the gap between "Your story" and "ana". |
| 480 to 780 | **The Activity dot**, only if it is drawn (unread): opacity 0 to 1 over 48 ms (linear) at 0.4 scale, then it grows to 1 on RISE. A small red echo of the landing, adding no information. |
| 560 to 840 | **The pen signs the page:** the details system's Home mark draws on left to right over 280 ms with `Easing.out(Easing.cubic)` (pen: the drawn rule under the stories). Measured right end: x 47 at 567, 150 at 600, 284 at 667, 346 at 733, done by about 767. |
| 600 | **Hand-off.** In the same UI frame, Home's own wordmark goes to opacity 1 and the flying one to 0, on identical pixels (measured: zero difference in the wordmark region from frame 61, which is 600 ms, on). |
| 880 | Done. Unmount the overlay, call `onDone`. |

Total: **880 ms**, unchanged from v1.

## Skip

- **During the transition:** a tap fast-forwards rather than snapping. Run the clock to 1 with `withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) })`. Every value is a pure function of the clock, so everything arrives together, the pen mark included.
- **During the film:** read `player.currentTime` **synchronously in the skip handler** (expo-video's property, in seconds), before calling `finish`.
  - **Under 3.50 s, or unknown** (NaN, undefined, or a throw from a released player): the wordmark isn't finished on screen, so there is no dock. The film dissolves (280 ms) while Home's groups rise on the same clock started at 0. Home's wordmark rides with the chrome group, and the pen beat still runs.
  - **3.50 s or later** (the finished hold, pixel-identical to the end frame): the dock starts at once from that frame.

## How it lands

- **Home (signed in):** as above. The target is `HomeWordmark` (42 pt, `lead`, row foot). The groups are:
  - **chrome**: HomeChrome's keys, and the tab bar wrapped in `(tabs)/_layout.tsx`;
  - **feed**: the `Animated.FlatList`'s wrapper in `(tabs)/index.tsx`;
  - **stories**: `TodaysPours`, in the list header;
  - **dot**: the Activity badge;
  - **pen beat**: the chosen details system's Home mark.

- **Onboarding Welcome:** Welcome draws the wordmark large and centred (`WORDMARK_LG` 66 pt, so about 107 x 66 pt) below the wall of prints.
  - Same dock, to Welcome's measured rect: scale is about 0.356, and the path runs down and slightly in rather than up.
  - The wall fades in (no rise; its rows already drift) over 360 to 780, with opacity on RISE over its first 30%.
  - The line under the wordmark, the terms line and the buttons rise 10 pt over 420 to 880, with opacity over their first 30%. They sit where the wordmark lands, so they don't move earlier.
  - No pen beat: no details system marks onboarding.
  - The wordmark keeps its drip (66 pt is the full cut).

- **Sign-in:** SignInScreen draws the same large wordmark under the step's bar. It docks to that measured rect.
  - The step bar rises in the chrome window (160 to 520, with the 64 ms fade).
  - The fields and buttons rise over 420 to 880, with opacity over their first 30%.
  - No pen beat.

- **Any other first screen (graceful fallback):** this covers a cold-started deep link to a drink, an invite (its Alert waits for `onDone` anyway), or anything that registered no target within 150 ms of `playToEnd`.
  - "Settle" instead of dock: the wordmark lifts 12 pt and scales to 0.94 about its centre while the overlay fades out. It uses today's 280 ms with `Easing.out(Easing.quad)`.
  - The screen shows through as it does today. If that screen opted into the rise groups, they run on the same clock; otherwise it is static.
  - It is never slower than today's dissolve.
  - The password reset draws the large wordmark, so it registers a target and gets the real dock.

- **Reduced Motion:** unchanged. VideoIntro already routes to SipplyIntro, so there is no dock. The details mark is drawn static, which the clock's rest value of 1 gives for free.

## Building it natively (Reanimated 4.5, no new native modules)

**One clock, in `src/lib/introDock.ts`.**
- `clock = makeMutable(1)`. 1 means at rest, so a resume, the drawn intro or any stall leaves every value at identity and Home is never stuck hidden.
- `phase = makeMutable(0)`: 0 is the film, 1 is docking.
- `DOCK_MS = 880`.
- `target = makeMutable<{ x, y, w, h, cut } | null>(null)`, written by `registerDockTarget` and cleared by `clearDockTarget`.
- Worklet helpers:
  - `t() = clock.value * 880`.
  - `riseStyle(start, dur, dy, opMs, opLinear)`. It computes `e = RISE(clamp((t - start) / dur))` and `o = opLinear ? clamp((t - start) / opMs) : RISE(clamp((t - start) / opMs))`, and returns `{ opacity: o, transform: [{ translateY: (1 - e) * dy }] }`.
  - The curves are `RISE = Easing.bezierFn(0.22, 1, 0.36, 1)` and `DOCK = Easing.bezierFn(0.3, 0, 0, 1)`. `Easing.bezierFn` exists in the installed Reanimated 4.5.1.

**The fly wordmark is pre-mounted.**
- It mounts with the film, as a sibling above the VideoView inside Film's overlay, and stays mounted until `done`.
- Its opacity is a pure function: `phase.value === 1 && t() < 600 ? 1 : 0`. During the film (phase 0) it is invisible.
- No React render happens at the swap. Nothing is mounted or unmounted in the frame that matters.

**Starting it, in Film's `finish` path.** This runs on `playToEnd`, or on a tap with currentTime ≥ 3.50, when `target.value` is set:
```ts
runOnUI(() => {
  'worklet';
  phase.value = 1;          // ground -> 0, fly -> 1
  clock.value = 0;          // Home's groups -> hidden (already under the film)
  clock.value = withTiming(1, { duration: DOCK_MS, easing: Easing.linear }, (ok) => { if (ok) runOnJS(done)(); });
})();
setLeaving(true);           // status bar un-hide, pointerEvents none: JS-side, any frame is fine
setTimeout(done, DOCK_MS + 120);
```
- The overlay's ground (the white fill plus VideoView) uses `useAnimatedStyle(() => ({ opacity: phase.value === 1 ? 0 : 1 }))`.
- Because phase, clock and ground all flip inside one UI-thread call, they land in the same frame.
- Don't use Reanimated `entering`, `exiting` or `layout` props anywhere here; they stall in Release builds.

**The flight.**
- An `Animated.View`, absolute at the film box: `srcW = 660 * FILM_PT`, `srcH = srcW * VB_H / VB_W`, centred on `useWindowDimensions()`.
- `transformOrigin: 'top left'`, with `p = DOCK(min(t() / 600, 1))` and `transform: [{ translateX: (T.x - srcL) * p }, { translateY: (T.y - srcT) * p }, { scale: 1 + (T.w / srcW - 1) * p }]`, where `T = target.value`.
- **T is read live every frame**, so a re-measure mid-flight just redirects the remaining path.
- Draw it with raw react-native-svg `<Svg viewBox>` plus `WORDMARK_PATH` at `srcW x srcH`, not `<Wordmark>`, whose size follows fontScale. It is only ever scaled down, so it stays sharp.
- **Drip:** if `T.cut === 'sm'` (Larger Text below 40 pt tall), draw `WORDMARK_SM_PATH` under `WORDMARK_PATH` and fade the full one out over 450 to 600 ms.

**Measuring the target, with the SE status bar handled.**
- `HomeWordmark`, Welcome and SignIn each call `ref.measureInWindow` inside `requestAnimationFrame`, from three triggers:
  - `onLayout`;
  - a `useEffect` keyed on **`insets.top`** and window dimensions;
  - an `onDockStart` listener that VideoIntro fires at `playToEnd`.
- They write `target.value` (cut is `h < 40 ? 'sm' : 'full'`).
- Why `insets.top` matters: on a home-button iPhone the hidden status bar gives the page 0 inset, and un-hiding it at the swap moves Home down 20 pt. HomeWordmark's own `onLayout` may not refire, because its position relative to its parent hasn't changed.
- The effect re-measures within about 2 frames of the inset change, early in the flight (p < 0.1), and the live read absorbs it. At the 600 ms hand-off the rect is final.
- Clear the target on unmount.

**The groups (all `useAnimatedStyle` on wrappers; transforms and opacity only).**

| Group | Where the wrapper goes | riseStyle |
|---|---|---|
| chrome: bar keys | inside HomeChrome around the keys row. It nests inside the RN-Animated bar, whose native-driven translateY is 0 at rest. | `(160, 360, 8, 64, linear)` |
| chrome: tab bar | **`(tabs)/_layout.tsx`'s `tabBar` render prop**, around `<FloatingTabBar>`. FloatingTabBar stays Reanimated-free, as its header promises. | `(160, 360, 8, 64, linear)` |
| feed | **around the `Animated.FlatList`** in `(tabs)/index.tsx` (a `flex: 1` wrapper), so every row moves together on any phone size, not item 0 only | `(240, 440, 16, 132, RISE)` |
| stories | around `TodaysPours` inside the list header (nested in feed) | `(360, 420, 14, 126, RISE)` |
| dot | the Activity badge: opacity `clamp((t - 480) / 48)`, scale `0.4 + 0.6 * RISE(clamp((t - 480) / 300))` | none |
| pen beat | the details system's Home mark (see below) | none |
| HomeWordmark | its wrapper's opacity `t() >= 600 ? 1 : 0` | none |

**The pen beat, using transforms only.**
- The mark (pen: `DrawnRule`, the 342 x 4 path) sits in an `overflow: 'hidden'` View of its own width.
- That window gets `translateX: -(1 - d) * W` and the path inside gets `translateX: +(1 - d) * W`, with `d = Easing.out(Easing.cubic)(clamp((t - 560) / 280))`.
- The visible part grows from the left edge. There is no width animation and no layout per frame.
- At rest (clock = 1), `d = 1` and the mark is simply drawn.
- With Ledger it is the head double rule, with the same window. With Proof or Menu there is no beat.

**Accessibility.**
- The overlay keeps `accessibilityViewIsModal` until `done`, and the skip `Pressable` stays on top for the 880 ms.
- The fly view and the pen mark are `accessible={false}`. The fly view gets `accessibilityIgnoresInvertColors`.

**What to measure on a device.**
1. The swap frame with a screen recording at 60 fps: no missing-wordmark frame, and no flash of Home.
2. An SE (home button): the dock lands on the 20 pt-lower wordmark with no jump at 600 ms.
3. A 440 x 956 Pro Max: no row of the feed shows at full opacity at frame 0.
4. Android with a translucent status bar: `measureInWindow` against the overlay's window coordinates.

**Encode, from `source/out/png`:**
```
ffmpeg -framerate 60 -i source/out/png/frame_%06d.png -vf "format=rgb24,scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p,setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709" -c:v libx264 -profile:v high -preset slow -crf 12 -an -movflags +faststart -r 60 preview.mp4
```
