# 06: Blank cream screen when switching tabs, and the intro on every cold start

Status: build-ready. No migrations, no new native modules, nothing for Jan to configure.
Branch: `reels-and-redesign`. Line numbers are from that branch at the time of writing; anchor on the quoted code if they drift.

Jan's report: "when switching tabs sometimes a cream screen appears and nothing loads."
Jan's second ask covered here: "make the intro to the app appear always when you fully close the app."

---

## 0. Summary

The cream is not a screen of its own. It is the ground under everything, so **any page that paints nothing, or paints its content at opacity 0, looks exactly like this.** The ground is `colors.bg` `#F7F2EA` in four layers: the root view (`app.json` `expo.backgroundColor`), the root Stack (`src/app/_layout.tsx:119` `contentStyle`), the navigation theme (`_layout.tsx:47` `background: colors.bg`, drawn by every tab scene's `Background`) and each tab scene (`src/app/(tabs)/_layout.tsx:35` `sceneStyle`). The Grain overlay (`src/components/Grain.tsx:36-54`) sits on top at about 3.5% and catches no touches, so a blank page still looks like textured paper, with the floating tab bar on top.

I found seven ways a tab can show that ground. Ranked by how likely each is to be what Jan sees:

| # | Cause | Where it blanks | From code | Likelihood |
|---|---|---|---|---|
| 1 | Entrance animations (`entering={FadeInDown…}`) are the only way the Stats tab's body, the first three Home posts and the drink title appear, and Reanimated 4.5.x on iOS Release builds can stall its frame loop after a cold start. A stalled entrance never finishes. | Stats: everything under the "Stats" title. Home: the posts under the bubbles. | Proven: the content depends on the animation, with no fallback. The stall itself needs a device. | High |
| 2 | Tab transition `animation: 'shift'` draws every page at an opacity computed from a natively driven progress value. Opacity is 1 only when progress is exactly 0. | Whole tab, title included. Any tab. | The dependency is proven. Whether the value actually comes to rest away from 0 needs a device. | Medium |
| 3 | Posts for the wine and beer removed on 20 Sep 2026 are still in the feed. `PostCard` returns `null` for them, but each one still takes a 16pt gap, and a feed made only of them never shows the empty state. | Home, under the bubbles. | Proven. | Medium (depends on the data) |
| 4 | The Dex grid uses `removeClippedSubviews`. On iOS Fabric, a clipping container puts its children on screen only during its own remount pass. The ListHeader is one of those children. | Dex, the whole tab including its header. | The mechanism is proven. The failing case needs a device. | Medium-low |
| 5 | `AuthGate` shows a plain cream `<View>` with no spinner and no timeout in two states. One of them has no time limit and can come back after a token refresh. | Home and Profile. | Proven. | Low-medium (only new Apple or Facebook accounts) |
| 6 | `ready` waits for auth-js to finish starting up, and startup refreshes an expired token, with retries, for up to about 30 s offline or about 60 s on a stalled connection. | Home and Profile show a small spinner. | Proven. | Low |
| 7 | Nothing connects `AppState` to Supabase's token auto-refresh. After a resume, the first data calls wait behind a lazy token refresh. | Spinners on Home and Profile after a resume. | Proven that it is missing. | Low |

There is one more fix that ships with these but is a different symptom: layout `exiting` animations can leave a "ghost" view on screen permanently. That bug is still present in the installed Reanimated 4.5.1 (section 3.8).

**Fix all seven.** Each fix is small and can be reverted on its own. Each removes a way for visibility to depend on something that may never finish. Section 6 lists every file, in landing order. The intro change is section 5.

---

## 1. Read the symptom: what is still visible tells you the cause

Have Jan screenshot the blank screen once. Then:

| What is on screen besides cream and the tab bar | Cause |
|---|---|
| The "Stats" heading only | 1 |
| Home: the "Sipply" wordmark and the friend bubbles, then nothing. No spinner, no "Nothing poured yet". Pull to refresh does not bring it back. | 1 (or 3 if it persists across launches) |
| Home: large empty band between the bubbles and the first post | 3 |
| Nothing at all, title included, on any tab | 2 |
| Dex: nothing at all, but **dragging the blank area makes the grid reappear** | 4 (dragging does nothing under 2) |
| Home and Profile both blank with no spinner, while Dex and Stats are fine | 5 |
| Home and Profile show only a small wine spinner | 6 or 7 |

---

## 2. Navigator behaviour, checked (freezeOnBlur, lazy, detachInactiveScreens)

expo-router 57.0.24 vendors bottom-tabs at `node_modules/expo-router/build/react-navigation/bottom-tabs/`.

- **freezeOnBlur: off.** `BottomTabView.js:182` passes the screen option through, and nothing sets it. react-native-screens then falls back to `freezeEnabled()`, which is `false` unless `enableFreeze()` is called (`node_modules/react-native-screens/src/core.ts:26-42`). Nothing in `src/` or expo-router calls it. So react-freeze never engages and is **ruled out**. Do not turn it on: freezing combined with Reanimated layout animations is a known source of the same blanks.
- **lazy: true by default** (`BottomTabView.js:175-181`). Dex, Stats and Profile mount on their first visit and are never unmounted afterwards. That matters for cause 1: Stats starts its entrance animations at the moment of the first switch, and a stalled Stats tab stays blank until the app is killed.
- **detachInactiveScreens: true on iOS** (`BottomTabView.js:75-77`). Under `'shift'`, `activityState` is an interpolation of the progress value (`:189-201`). Screens to the right of the focused tab detach once their progress reaches 1. Screens to the left stay attached at state 1, because the interpolation extends its flat first segment. After fix 2 (`animation: 'none'`), every unfocused screen is simply inactive (`hasTwoStates`, `:168`).
- **No focus or transition listeners** exist in `src/` (no `useIsFocused`, `useFocusEffect`, `transitionEnd`), so changing the animation breaks nothing that listens to it.

---

## 3. Causes, evidence and exact fixes

### 3.1 Cause 1: content that only appears if a Reanimated entrance finishes (HIGH)

**Evidence: content that starts invisible**
- `src/components/CollectionStats.tsx:118-119` `const enter = (delay) => reduced ? undefined : FadeInDown.duration(motion.base).delay(delay)`, applied at `:124`, `:196`, `:221` and `:269`. These four `Animated.View`s hold **the entire Stats tab below its title**: Collection, Rarity, Category and Rarest entry. `src/app/(tabs)/stats.tsx:51-55` renders only the title outside them.
- `src/app/(tabs)/index.tsx:196-217` wraps each of the first three feed cells in `Animated.View entering={FadeInDown…delay(index * motion.stagger)}`. The masthead and bubbles (`:222-250`) are outside it, which is why they survive.
- `src/app/drink/[id].tsx:579-580` `enter`, used at `:747` (Dex number, name, facts) and `:760` (category and rarity pills).
- `FadeInDown` starts at opacity 0 with a translateY offset. Nothing else ever makes these views visible.

**Mechanism.** Reanimated runs layout animations on the same UI-runtime frame loop as `withTiming`. Upstream issue software-mansion/react-native-reanimated#10094 is open as of 30 Sep 2026. It reports that **in iOS Release builds only, on the New Architecture, for about 10-20 s after a cold start, animations never advance; "the stalled one never resumes"**, while direct value writes and JS timers keep working. The report is on 4.5.2 with worklets 0.11. This app runs 4.5.1 with worklets 0.10.1 (`package.json`). That fits every part of Jan's report:

- "Sometimes": it is intermittent per launch.
- "Nothing loads": the content was loaded and is drawn at opacity 0.
- "Switching tabs": Stats mounts on its first visit, which on most launches falls inside the window.
- It never reproduces in a dev build.

Three code-level facts make it worse:
- (a) A stalled Stats tab stays blank for the whole session, because the tab is never remounted.
- (b) Home cannot recover by pull-to-refresh. Refreshed posts keep the same `keyExtractor` keys, so their cells are not remounted, and after the first drag the `scrolled` flag (`index.tsx:156`) turns entrances off for any cell that does remount.
- (c) Section 5 moves the intro to every cold start. Home mounts underneath the film during the most congested seconds of startup, so this fix must land first or together with it.

**Proven / needs device.** That this content depends on the entrance is proven. The stall itself needs a Release build on a phone; section 8 has the protocol. Upgrading Reanimated is **not** the fix. The issue has no fix referenced, and SDK 57 pins 4.5.x (`npx expo install --check` would flag 4.7).

**Fix: remove entrances from content. The rule:** no content may start invisible and rely on an animation to become visible.

`src/components/CollectionStats.tsx`
- Delete line 4: `import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';`
- Remove `motion,` from the theme import (`:23`). It has no other use.
- Delete `:96` `const reduced = useReducedMotion();` and `:118-119` (`const enter …`).
- Replace the four `<Animated.View entering={enter(…)}>` at `:124`, `:196`, `:221` and `:269` with `<View>`, and their closing tags with `</View>`. There are no styles, so layout is unchanged.

`src/app/(tabs)/index.tsx`
- Delete line 4 (the `react-native-reanimated` import). Remove `motion` from the theme import on line 12.
- Delete `:131` `const reduced = useReducedMotion();` and `:151-157` (the `scrolled` state, `markScrolled` and their comment).
- Replace `renderItem` (`:196-217`) with:
  ```tsx
  const renderItem = useCallback(
    ({ item }: { item: Post }) => (
      <PostCard
        post={item}
        author={profiles[item.authorId]}
        onOpenDrink={openDrink}
        onOpenAuthor={openPerson}
        // A block takes their posts and bubble off screen at once; RLS
        // keeps them off from the next fetch on.
        onBlocked={dropAuthor}
      />
    ),
    [dropAuthor, openDrink, openPerson, profiles],
  );
  ```
- Delete `:266` `onScrollBeginDrag={…}`.

`src/app/drink/[id].tsx`
- Remove `FadeInDown` from the reanimated import (`:17`) and `motion` from the theme import (`:50`). Both are otherwise unused. Keep `Animated`, `useReducedMotion` and `reduced`, which are used at `:371` and `:713`.
- Replace `:567-580` (the "Entrance choreography" comment and `const enter`) with:
  ```tsx
  /*
   * No entrance animation on the words under the photograph. Content must
   * never depend on an animation finishing to be visible: Reanimated can
   * stall after a cold start in Release builds and leave it at opacity 0
   * (specs/06-tab-switch-bug.md, cause 1).
   */
  ```
- `:747` `<Animated.View entering={enter(0)} style={styles.titleBlock}>` becomes `<View style={styles.titleBlock}>`. `:760` becomes `<View style={styles.metaRow}>`. Change the closing tags to match.

**Guard against regression.** Add a third rule to `scripts/check-design.mjs`:
```js
// After const HEX:
/*
 * 3. No layout animations. An `entering` that never runs leaves content at
 *    opacity 0; an `exiting` that never finishes leaves a ghost view on
 *    screen. specs/06-tab-switch-bug.md.
 */
const LAYOUT_ANIM = /\b(entering|exiting)=\{/;
/** Files allowed one kind of layout animation, and why. */
const LAYOUT_ANIM_ALLOW = {
  'components/CelebrationOverlay.tsx': {
    kinds: ['entering'],
    why: 'scrim fade-in is decoration over a card that is visible without it',
  },
};
```
Inside `lines.forEach`, after the HEX check:
```js
const anim = code.match(LAYOUT_ANIM);
if (anim && !LAYOUT_ANIM_ALLOW[rel]?.kinds.includes(anim[1])) {
  violations.push({ rel, n: i + 1, kind: 'anim', line: line.trim() });
}
```
Make two text changes in the same file: the header comment says "Three rules", and the success line reads `'  No emoji-as-UI, hardcoded hex or layout animations outside the allowlist.\n'`. Files in the existing `ALLOW` map are skipped for every rule, which is fine: none of them uses layout animations. If another spec also edits this file, append its rule after this one and leave the order alone.

### 3.2 Cause 2: tab pages drawn at an animated opacity (MEDIUM)

**Evidence**
- `src/app/(tabs)/_layout.tsx:52-62` sets `animation: reduced ? 'fade' : 'shift'` with a spring `transitionSpec`.
- `node_modules/expo-router/build/react-navigation/bottom-tabs/TransitionConfigs/SceneStyleInterpolators.js:21-37`: `forShift` sets `opacity: progress.interpolate([-1, 0, 1] → [0, 1, 0])` plus `translateX` ±50. `forFade` (`:8-17`) is the same opacity without the translate.
- `BottomTabView.js:65` sets `useNativeDriver = true`. `:102-137` starts an `Animated.parallel` of springs toward 0 or ±1. `:207` applies the interpolated style to `elements/Screen` → `Background`, which is an `Animated.View` (`elements/Background.js`).
- The JS copy of a native value is synced only when the animation ends (`node_modules/react-native/Libraries/Animated/animations/Animation.js:143-160`). On Fabric, the shadow tree is re-synced by a scheduled re-render (`node_modules/react-native/src/private/animated/createAnimatedPropsHook.js:127-143`).
- BottomTabView builds new interpolation nodes on every render (`:183-201`). It restarts the whole parallel animation whenever `descriptors` change (`:141`), and they change during the very render in which a lazily mounted tab first appears.

**Mechanism.** A tab is visible only if its progress comes to rest at exactly 0. Tapping again mid-spring, or a re-render whose stale JS value lands after the native spring has finished, can leave the page at a partial or zero opacity. The ground then shows through.

**Proven / needs device.** The dependency is proven. A divergence actually happening needs a device; signature in section 1.

**Fix: `animation: 'none'`.** Instagram's tabs and iOS's own `UITabBarController` both switch with an instant cut, and it removes the only code path where a whole tab's visibility depends on an animation landing. Replace `src/app/(tabs)/_layout.tsx` lines 1-63 (imports through `screenOptions`) with:
```tsx
import { Tabs } from 'expo-router';
import React from 'react';
import type { ColorValue } from 'react-native';

import { FloatingTabBar } from '@/components/FloatingTabBar';
import { Icon, type TabName } from '@/components/icons';
import { colors } from '@/constants/theme';

/** (keep the existing doc comment above TabLayout unchanged) */
export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        /*
         * An instant cut, the way UITabBarController and Instagram switch
         * tabs. The 'shift' and 'fade' presets draw each page at an opacity
         * computed from a natively driven progress value, 1 only at exactly
         * 0; a page that came to rest anywhere else was a blank cream screen
         * (specs/06-tab-switch-bug.md, cause 2). If motion ever comes back,
         * it must be translate-only: never opacity.
         */
        animation: 'none',
      }}>
```
Leave the `Tabs.Screen` entries and `tabIcon` unchanged.

In `src/components/FloatingTabBar.tsx:24-25`, the header comment ends "The movement that says the section changed belongs to the page, which shifts in the direction of travel ((tabs)/_layout.tsx)." Replace that sentence with: "Nothing else moves: the page cuts, as iOS's own tab bar and Instagram's do ((tabs)/_layout.tsx, specs/06)." This is a comment-only change.

### 3.3 Cause 3: orphaned wine and beer posts render as nothing (MEDIUM, data-dependent)

**Evidence**
- `supabase/migrations/014_bounds_and_indexes.sql:30-31`: "posts for the beer and wine removed on 20 Sep 2026 still exist".
- The feed query (`src/lib/social.ts` `fetchFeed`, `FEED_SIZE = 100` at `:337`) returns them. The store keeps them (`src/store/social.ts:163-169`).
- `src/components/PostCard.tsx:440` `if (!drink) return null;`.
- On Home, each orphan is still a FlatList cell. The content container has `gap: space.lg` (`index.tsx:319`), so every orphan adds 16pt of empty cream.
- Because `feed.length > 0`, `ListEmptyComponent` (`index.tsx:285-307`) never shows "Nothing poured yet". A feed made only of orphans is the wordmark, the bubbles and nothing else.
- The Profile grid already drops them (`src/app/(tabs)/profile.tsx:241-243`). Home never did.

**Fix: one predicate, shared by the card and the list.**

> **Cross-check (30 Sep 2026):** the predicate lives in **`src/lib/social.ts`** (package A2, stage 1), not in `PostCard.tsx`, because 03's Home (C3) and Profile/Saved (C4) are separate packages and both need it in the same stage. `PostCard.tsx` imports it and renders `null` exactly when `!isRenderablePost(post)`; `index.tsx` imports it from `@/lib/social`. The code and the doc comment below are unchanged; only the file moves.

- In `src/lib/social.ts` (was: `src/components/PostCard.tsx`, near `useSignedPhoto`), add:
  ```tsx
  /**
   * Whether PostCard draws anything for this post. It renders null for a
   * drink that is not in this build (the wine and beer removed on 20 Sep
   * 2026 still have posts), so every list of posts filters with this
   * rather than leaving a zero-height cell and its gap. Widen it here, and
   * only here, when another kind of drink gains posts.
   */
  export function isRenderablePost(post: Post): boolean {
    return getDrink(post.drinkId) !== undefined;
  }
  ```
  (Import `getDrink` and `Post` there if `social.ts` does not already.)
- In `src/app/(tabs)/index.tsx`, after the `useSocial` reads, add `const visibleFeed = feed.filter(isRenderablePost);` and import `isRenderablePost` from `@/lib/social`. Pass `data={visibleFeed}` (`:255`). Change the subtitle condition at `:234` to `feedError && visibleFeed.length > 0`. The empty state then follows the visible list.
- **Custom-drinks spec:** if user-added drinks can be posted, widen `isRenderablePost` and `PostCard`'s `drink` lookup together. Do not filter separately.
- Not doing: deleting orphaned posts server-side. That is irreversible user content, and hiding them is enough.

### 3.4 Cause 4: Dex grid's `removeClippedSubviews` (MEDIUM-LOW, Dex only)

**Evidence**
- `src/app/(tabs)/dex.tsx:710` `removeClippedSubviews`. No other list in the app sets it.
- iOS Fabric: with clipping on, `mountChildComponentView` puts a child only into `_reactSubviews`, not into the window (`node_modules/react-native/React/Fabric/Mounting/ComponentViews/View/RCTViewComponentView.mm:156-170`). Children reach the screen only in `updateClippedSubviewsWithClipRect` (`:229-258`). That method is called from the scroll view's `_remountChildren` after a mount transaction (`RCTScrollViewComponentView.mm:291-296`), or after a scroll of at least `kClippingLeeway = 44` (`:35`, `:740-753`, `:973-998`). It returns early while the container's bounds are zero.
- The ListHeader (title, search, chips, progress) is one of those clipped children. When the Dex is scrolled to the top, its glass `Masthead` sits parked fully off screen (`dex.tsx:262`), so a bad clipping pass leaves **nothing** painted.
- React Native's own FlatList docs warn that `removeClippedSubviews` "may have bugs (missing content)". facebook/react-native#29819 and react-navigation#8789 describe this exact symptom: a list goes blank after switching tabs mid-momentum.

**Proven / needs device.** The mechanism is proven. The failing interleaving needs a device: fling the grid, tap Home mid-momentum, come back.

**Fix.** Delete `dex.tsx:710`. Add one sentence to the end of the comment at `:699-705`: "No removeClippedSubviews: on iOS Fabric it puts the header and cells on screen only during the scroll view's own remount pass, and a missed pass blanked the whole tab (specs/06, cause 4). The window below already caps what is mounted." Removing it costs nothing measurable: `initialNumToRender={4}` / `windowSize={5}` already bound mounted rows.

### 3.5 Cause 5: AuthGate's two featureless holds (LOW-MEDIUM, proven)

**Evidence**
- `src/components/AuthGate.tsx:208` `if (welcomeSeen === undefined) return <View style={styles.loading} />;`. This lasts a few ms normally and is featureless by design.
- `AuthGate.tsx:220-222`: a signed-in Apple or Facebook account that has not dismissed Welcome on this install waits for its profile row behind a plain cream `<View>`. **There is no time limit.**
  - `refreshProfile` (`src/store/auth.ts:1230-1311`) makes 3 attempts (`DELAYS_MS = [0, 400, 1200]`, `:1248`). Each awaits a supabase-js request with no timeout (`src/lib/supabase.ts:21-41` sets none), so on a stalled connection each attempt lasts until iOS's 60 s request timeout.
  - It **re-enters**: every `TOKEN_REFRESHED` or `SIGNED_IN` calls `refreshProfile` (`auth.ts:729`), and that clears `profileError` first (`:1234`). An account that had fallen through to Welcome after a failed load drops back to the blank hold.
  - Home and Profile mount their own gates but share this store, so switching between them shows the same blank.

**Fix: a bounded wait, and a hold that is never featureless.**

> **Cross-check (30 Sep 2026):** step 2's `GateHold` is built by A1 in `ui.tsx` as **`Hold`** (01 §5.17: same timings and code, plus `tone` and `fill` props), because 04's custom detail and 05's camera gate need it in the same stage. Step 3's body is **superseded by the merged body in `02-auth-login.md` §9.1**, which keeps everything here except `signsInSocially` (02 makes every new account wait for its row, still capped by `ROW_WAIT_MS`). Steps 1 and 4 apply as written. Package C2 builds all of it.

In `src/components/AuthGate.tsx`:

1. Extend `useWelcome` (`:122-144`):
   ```tsx
   const useWelcome = create<{
     seen: Record<string, boolean>;
     /**
      * Accounts whose wait for their own profile row is over for this
      * session: it failed, or ROW_WAIT_MS ran out. Sticky on purpose: a
      * token refresh clears profileError, and without this the gate fell
      * back from Welcome to a blank page each time.
      */
     rowWaitOver: Record<string, true>;
     load: (userId: string) => void;
     dismiss: (userId: string) => void;
     endRowWait: (userId: string) => void;
   }>()((set, get) => ({
     seen: {},
     rowWaitOver: {},
     load: /* unchanged */,
     dismiss: /* unchanged */,
     endRowWait: (userId) => {
       if (get().rowWaitOver[userId]) return;
       set((s) => ({ rowWaitOver: { ...s.rowWaitOver, [userId]: true } }));
     },
   }));

   /** How long a new Apple or Facebook account waits for its profile row before Welcome shows anyway. */
   const ROW_WAIT_MS = 4000;
   ```
2. Add `GateHold` above `AuthGate` (cross-check: built as `Hold` in `ui.tsx`; AuthGate imports it):
   ```tsx
   /** Cream for this long, so a wait of a frame or two does not flash a spinner. */
   const HOLD_QUIET_MS = 400;
   /** After this, the hold says what it is waiting for. */
   const HOLD_SLOW_MS = 8000;

   /**
    * What a gate shows while it cannot decide yet. Never a featureless page:
    * that is indistinguishable from a screen that failed to load
    * (specs/06-tab-switch-bug.md, cause 5).
    */
   function GateHold({ slowMessage }: { slowMessage: string }) {
     const [phase, setPhase] = useState<0 | 1 | 2>(0);
     useEffect(() => {
       const quiet = setTimeout(() => setPhase(1), HOLD_QUIET_MS);
       const slow = setTimeout(() => setPhase(2), HOLD_SLOW_MS);
       return () => {
         clearTimeout(quiet);
         clearTimeout(slow);
       };
     }, []);
     useAnnounce(phase === 2 ? slowMessage : null);
     return (
       <View style={styles.loading}>
         {phase >= 1 ? <ActivityIndicator color={colors.wine} accessibilityLabel="Loading" /> : null}
         {phase === 2 ? <Text style={styles.holdText}>{slowMessage}</Text> : null}
       </View>
     );
   }
   ```
3. Replace the body of `AuthGate` (`:168-227`). Hooks go first, and the decision order is unchanged except for the bounded wait. (**Superseded: build 02 §9.1's merged body.** This version is kept for the reasoning.)
   ```tsx
   export function AuthGate({ children }: { children: React.ReactNode }) {
     const session = useAuth((s) => s.session);
     const ready = useAuth((s) => s.ready);
     const profile = useAuth((s) => s.profile);
     const profileError = useAuth((s) => s.profileError);
     const userId = session?.user.id;

     const welcomeSeen = useWelcome((s) => (userId ? s.seen[userId] : undefined));
     const rowWaitOver = useWelcome((s) => (userId ? s.rowWaitOver[userId] === true : false));
     const loadWelcome = useWelcome((s) => s.load);
     const dismissWelcome = useWelcome((s) => s.dismiss);
     const endRowWait = useWelcome((s) => s.endRowWait);

     const ownProfile = profile && profile.id === userId ? profile : null;
     /*
      * A new Apple or Facebook account is about to be asked for a username,
      * and whether it must be is in its profile row. Waiting on the row keeps
      * Welcome from flashing past before the username step, but only for
      * ROW_WAIT_MS: after that, or once the row has failed, the account goes
      * on to Welcome and the username step takes over whenever the row lands.
      */
     const waitingForRow =
       session != null &&
       welcomeSeen === false &&
       !ownProfile &&
       !profileError &&
       !rowWaitOver &&
       signsInSocially(session.user);

     useEffect(() => {
       if (userId) loadWelcome(userId);
     }, [userId, loadWelcome]);

     useEffect(() => {
       if (!userId || welcomeSeen !== false || rowWaitOver) return;
       if (profileError) {
         endRowWait(userId);
         return;
       }
       if (!waitingForRow) return;
       const t = setTimeout(() => endRowWait(userId), ROW_WAIT_MS);
       return () => clearTimeout(t);
     }, [userId, welcomeSeen, rowWaitOver, profileError, waitingForRow, endRowWait]);

     if (!ready) {
       return <GateHold slowMessage="Still connecting. The Dex and Stats work without a connection." />;
     }
     if (!session || !userId) return <AuthForm />;
     if (ownProfile && isPlaceholderUsername(ownProfile.username)) {
       return <ChooseUsername key={userId} profile={ownProfile} />;
     }
     if (welcomeSeen === undefined || waitingForRow) {
       return <GateHold slowMessage="Still loading your account." />;
     }
     if (!welcomeSeen) return <WelcomeConnect onDone={() => dismissWelcome(userId)} />;
     return <>{children}</>;
   }
   ```
   Keep the existing explanatory comments where they still apply.
4. Styles: add `gap: space.md, paddingHorizontal: space.xl` to `loading` (`:948`), and add:
   ```tsx
   holdText: {
     fontFamily: fonts.body,
     fontSize: typeScale.caption.fontSize,
     lineHeight: typeScale.caption.lineHeight,
     color: colors.textMuted, // 4.5:1+ on the page; textFaint is not
     textAlign: 'center',
     maxWidth: 280,
   },
   ```

**Ownership note (cross-check).** One package, C2, builds `AuthGate.tsx`: first this spec's hunk as a `06:` commit on today's body, then 02's rewrite using the merged body in 02 §9.1. Nobody rebases one spec over the other.

### 3.6 Cause 6: `ready` held by auth startup (LOW, proven; a spinner, not a blank)

**Evidence**
- `useAuth.init` (`src/store/auth.ts:679-700`) sets `ready` only after `supabase.auth.getSession()` resolves.
- `getSession` first awaits `initializePromise` (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:2364-2366`). Startup (`_recoverAndRefresh`, `:3996-4045`) refreshes a stored token that is within the expiry margin. Any cold start more than an hour after last use qualifies.
- The refresh retries with backoff for up to `AUTO_REFRESH_TICK_DURATION_MS` = 30 s (`:3940-3958`; `dist/main/lib/constants.js:6`). That means about 30 s offline, and up to about 60 s if the first attempt hangs on iOS's request timeout.
- The whole time, `AuthGate.tsx:183-189` shows a lone spinner on Home and Profile.

**Fix.** Section 3.5 already covers it: `GateHold` adds "Still connecting. The Dex and Stats work without a connection." after 8 s. **Do not** restructure `init`. Its ordering is what keeps a half-finished password reset from rendering unguarded (`auth.ts:685-691`), and the recovery flow depends on the implicit `flowType` (`src/lib/supabase.ts:33-36`). That must not change.

### 3.7 Cause 7: no AppState wiring for token auto-refresh (LOW)

**Evidence.** `src/lib/supabase.ts:21-41` has no `AppState` listener. In React Native, auth-js starts a 30 s ticker once (`GoTrueClient.js` `_handleVisibilityChange`: "in non-browser environments the refresh token ticker runs always"), and iOS suspends JS timers in the background. After a resume with an expired token, the refresh happens lazily inside the first data request, and every other request waits for it. Supabase's React Native setup guide prescribes start/stop on `AppState`.

**Fix.** Append to `src/lib/supabase.ts`, and import `AppState` from `react-native` beside `Platform`:
```ts
/*
 * Supabase's React Native setup: refresh only while in the foreground.
 * startAutoRefresh runs a tick at once, so a token that expired while the
 * app was away is refreshed on return rather than inside the first query a
 * screen makes, which every other query would then wait behind. Web has
 * its own visibility handling inside auth-js.
 */
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
```
Not doing: a global fetch timeout on the client. It would bound these waits, but it would also cut off legitimate slow uploads, such as pour photos today and the Reels spec's video uploads.

### 3.8 Ships with these, different symptom: `exiting` animations that never finish

`node_modules/react-native-reanimated/Common/cpp/reanimated/LayoutAnimations/LayoutAnimationsProxy_Legacy.cpp:119-125` (and `_Experimental.cpp:290-304`) still has the bug in software-mansion/react-native-reanimated#10275: when a view has overlapping layout animations, the exit's "remove" intent is dropped, and the view stays on screen for the rest of the session. Upstream fixed it in PR #10376, which is not in 4.5.1. Combined with the cause-1 stall, the same thing happens to any exit that never finishes. Two places can hit it:

- `src/components/CelebrationOverlay.tsx:242-243`: the scrim has both `entering` and `exiting`. Tapping Done within the 380 ms fade-in can leave a dead dimmed layer over the app. `:82` (Card `exiting`) is the same.
- `src/app/(tabs)/dex.tsx:727-728`: the back-to-top button has ZoomIn and ZoomOut on one view. Scrolling back up quickly can leave a ghost button over the grid.

**Fix**
- CelebrationOverlay: delete `exiting=` at `:82` and `:243`, and remove `FadeOut` from the import (`:7`). Keep `entering` on the scrim; it is decoration over a card that is visible without it (allowlisted in 3.1).
- Dex: delete `:727-728`. Change that `Animated.View` (`:726`) to a `View`. Remove `ZoomIn` and `ZoomOut` (`:23-24`) and `:467` `const reduced = useReducedMotion();`, which is now unused (FilterChip has its own). Replace the comment at `:720-725` with: "Appears and disappears without a layout animation: an exit that never finishes leaves a ghost button over the grid (specs/06, 3.8)."

---

## 4. Ruled out, with evidence

- **Grain overlay:** about 3.5% texture with `pointerEvents="none"` (`Grain.tsx:36-54`). It cannot hide anything.
- **The intro film:** its ground is `colors.filmPaper` (tan), not cream (`VideoIntro.tsx:288-295`). It always unmounts: JS timers back up its exit (`:173-179`, ceiling `:208-211`).
- **CelebrationOverlay:** a dark scrim, not cream. Its stuck-exit case is 3.8.
- **PasswordResetOverlay:** cream, but it renders only while `recovering` and always shows a form (`PasswordResetOverlay.tsx:111`).
- **RootLayout `return null`** (`_layout.tsx:105-107`): happens only at launch, and the native splash is still up (`:101-103`). Not a tab switch.
- **Collection hydration:** the error path still sets `hydrated` (`src/store/collection.ts:332-336`).
- **Stats is not gated** (`stats.tsx:13-16`). Home and Profile render their headers outside every animation (`index.tsx:222-250`, `profile.tsx:282-358`), so neither can go fully blank except via causes 2, 5 or 6.
- **freezeOnBlur:** off (section 2).

---

## 5. The intro on every cold start

**Where the once-per-install flag lives today**
- `src/components/VideoIntro.tsx:84` `const SEEN_KEY = 'sipply.intro.v1'` in AsyncStorage.
- It is read by `hasSeenIntro()` (`:94-100`) from `src/app/_layout.tsx:78-84` and cached in the module variable `introDecision` (`:41`).
- It is written by `markIntroSeen()` (`:103-109`) from `done()` (`:143-146`).
- `ready` also waits for the read (`_layout.tsx:87` `showIntro !== null`).
- The rationale for once-per-install is in the header comment at `VideoIntro.tsx:26-39`.

**The change.** A JS runtime lives exactly as long as the app process, so "has not played in this runtime" means "this is a cold start". Swiping the app away, rebooting, or iOS reclaiming the app all start a new process and play the intro. Every background/foreground in between keeps the runtime, so the intro does not replay.

1. **New file `src/lib/intro.ts`:**
   ```ts
   /* ==================================================================== */
   /* Launch intro lifecycle, per JS runtime                                */
   /*                                                                      */
   /* Module scope IS the definition of a cold start: iOS makes a new JS   */
   /* runtime only when the process starts (swiped away, rebooted, or      */
   /* reclaimed while in the background) and keeps this module alive       */
   /* across every background/foreground in between. So the intro plays on */
   /* every cold start and never on a resume (Jan, 30 Sep 2026).           */
   /* ==================================================================== */

   let played = false;
   const waiters: Array<() => void> = [];

   /** True once the intro has finished in this runtime. */
   export function introHasPlayed(): boolean {
     return played;
   }

   /** Called by RootLayout when the intro ends, however it ends. */
   export function markIntroPlayed(): void {
     if (played) return;
     played = true;
     for (const resolve of waiters.splice(0)) resolve();
   }

   /** Resolves once the intro is off the screen; at once if it already is. */
   export function whenIntroPlayed(): Promise<void> {
     return played ? Promise.resolve() : new Promise((resolve) => waiters.push(resolve));
   }
   ```
2. **`src/app/_layout.tsx`**
   - Line 7 becomes `import { VideoIntro } from '@/components/VideoIntro';`. Add `import { introHasPlayed, markIntroPlayed } from '@/lib/intro';`.
   - Delete `:35-41` (the comment and `let introDecision`).
   - Replace `:74-84` with `const [showIntro, setShowIntro] = useState(() => !introHasPlayed());`.
   - `:87` becomes `const ready = (fontsLoaded || fontError != null) && hydrated;`. It no longer waits on storage, so the splash lifts slightly sooner.
   - `:226-229` `onDone` becomes `() => { markIntroPlayed(); setShowIntro(false); }`.
   - Update the wording of the comments at `:94-100` ("Every cold start plays the intro, which lifts the splash itself…") and `:211-214` ("on a cold start, a reset link plays the intro over the top…").
   - The splash logic (`:101-103`) is unchanged and still correct: with `showIntro` true from the first render, only the film's `onVisible` lifts the splash.
3. **`src/components/VideoIntro.tsx`**
   - Delete the AsyncStorage import (`:1`), `SEEN_KEY`, `hasSeenIntro` and `markIntroSeen` (`:84-109`).
   - Replace `done` (`:139-146`) by passing `onDone` straight through: `<SipplyIntro onDone={onDone} />` and `<Film onDone={onDone} onVisible={onVisible} />`.
   - Rewrite the "ONCE PER INSTALL" paragraph (`:26-39`) as "EVERY COLD START (Jan, 30 Sep 2026)". Note that a return after iOS has reclaimed the app counts as a cold start and plays it, which was the reason for the old rule, and that tap-to-skip is what keeps that tolerable. Delete the sentence about versioning the key.
   - The orphaned `sipply.intro.v1` value left in existing installs is one byte, unread and harmless. Leave it.
4. **`src/components/InviteLinkHandler.tsx`:** do not raise an Alert over the film. An invite link usually cold-starts the app, so its "Accept the invite?" would now land mid-intro. Import `whenIntroPlayed` from `@/lib/intro`.
   - In `handle` (`:135-148`), immediately before `offerInvite('You opened an invite link.', …)`, add `await whenIntroPlayed(); if (!active) return;`.
   - In the parked path (`:174-180`), make the `.then` callback `async` and add the same two lines before `offerInvite(…)`.
   - `reportOutcome` needs nothing: it runs after the user answers.

**Decisions**
- The intro plays on deep-link cold starts too. Jan said "always", the film is tap-to-skip, and the reset overlay was already designed to sit under it (`_layout.tsx:205-216`).
- Reduce Motion still gets the drawn `SipplyIntro`, also on every cold start.
- During development, editing `src/lib/intro.ts` resets the flag and replays the intro on Fast Refresh. That is acceptable.

**Ordering constraint.** Ship this together with cause 1, or after it. Never before it: Home mounts under the film during the most congested seconds of startup, which is exactly where cause 1's stall lives.

---

## 6. Files, owners, landing order

> **Cross-check (30 Sep 2026): who edits each file is set by `00-build-plan.md`, not by this table.** These files are shared with 01–05, and the parallel plan gives each file to exactly one package, so this spec's hunks are made by those packages: rule 3 in `check-design.mjs` (A1, its first commit), `supabase.ts` and `isRenderablePost` in `social.ts` (A2), `index.tsx` and `PostCard.tsx` (C3), `CollectionStats.tsx`, `(tabs)/_layout.tsx`, `FloatingTabBar.tsx` and the intro files H (C1), `dex.tsx` and `drink/[id].tsx` (C6), `AuthGate.tsx` (C2), `CelebrationOverlay.tsx` (C7). **In every shared file the 06 hunk is that package's first commit, prefixed `06:`**, so each cause stays revertable on its own.
>
> **The separate "06-only" TestFlight is dropped.** It would need these files edited before the packages fork, which puts each file in two hands. What it was for (telling a redesign regression from this bug) is kept another way: the "before" protocol in §8 runs on build 11, which is already on TestFlight and has none of these fixes, and the "after" protocol runs on the integrated release build, where each `06:` commit can be reverted alone if a blank comes back. The intro change (H) still never ships without cause 1's fix: both are in the same release.

The owner of every change below is the engineer implementing this spec. Land these as separate commits in this order, each one revertable on its own.

| Order | File | Change | Shared with |
|---|---|---|---|
| A | `src/components/CollectionStats.tsx` | Remove entrances (3.1) | none |
| A | `src/app/(tabs)/index.tsx` | Remove entrances (3.1); orphan filter (3.3) | **Home-redesign spec rewrites this file. It must keep `isRenderablePost` filtering and must not reintroduce `entering`.** |
| A | `src/app/drink/[id].tsx` | Remove entrances (3.1) | none |
| A | `scripts/check-design.mjs` | Rule 3 (3.1) | Anti-slop spec may add rules: append after rule 3 |
| B | `src/app/(tabs)/_layout.tsx` | `animation: 'none'` (3.2) | none |
| B | `src/components/FloatingTabBar.tsx` | Comment sentence only (3.2) | Anti-slop or home spec may restyle the bar. The comment edit merges trivially. |
| C | `src/lib/social.ts` (cross-check; was `PostCard.tsx`) | Export `isRenderablePost` (3.3); PostCard imports it | Custom-drinks spec would widen it (it does not: custom drinks cannot be posted, 04 D4); Home and Profile consume it |
| D | `src/app/(tabs)/dex.tsx` | Drop `removeClippedSubviews` (3.4); back-to-top without layout animation (3.8) | none |
| E | `src/components/AuthGate.tsx` | `GateHold`, bounded row wait (3.5, 3.6) | **Login-redesign spec rewrites `AuthForm` (`:407-760`)**. This spec owns `:103-227` and two styles. |
| F | `src/lib/supabase.ts` | AppState start/stop (3.7) | none. Do **not** touch `flowType` or `detectSessionInUrl`. |
| G | `src/components/CelebrationOverlay.tsx` | Drop `exiting` (3.8) | none |
| H | `src/lib/intro.ts` (new), `src/app/_layout.tsx`, `src/components/VideoIntro.tsx`, `src/components/InviteLinkHandler.tsx` | Intro every cold start (5) | Reels and location specs may add `Stack.Screen`s to `_layout.tsx`. This spec touches only the intro lines. |

There are no migrations, no SQL and no new native modules. `scripts/check-native-links.sh` is unaffected.

---

## 7. Rules for every other spec (reels, home, profile, login, custom drinks, anti-slop)

1. **Nothing may start invisible and depend on an animation to appear.** That means no `entering` / `exiting` (enforced by `check-design.mjs` rule 3), and no `useSharedValue(0)` opacity that only a `withTiming` raises, on any content. Motion is allowed only when the resting state is already visible: transforms from opacity 1, press feedback, or scroll-driven values.
2. **No tab-scene opacity.** If a transition comes back, it must be translate-only.
3. **No featureless holds.** Every loading branch shows a spinner within 400 ms and says what it is waiting for by 8 s. Use `Hold` from `ui.tsx` (01 §5.17), which is `GateHold`.
4. **Every list of posts filters with `isRenderablePost`.**
5. **No `removeClippedSubviews`** on any iOS list (the Reels feed included). Use windowing props instead.

---

## 8. States, accessibility, verification

**States.** Loading is handled by `GateHold`: quiet for 400 ms, then a spinner, then a message at 8 s. The "Still connecting" message tells the user where to go while offline. Error and empty states are unchanged (Home `feedError` EmptyState, Profile's retry). Empty now also appears correctly when every post is an orphan.

**Accessibility**
- The spinner is labelled "Loading".
- The slow message is announced once through `useAnnounce`, which reaches iOS VoiceOver where live regions don't.
- `textMuted` keeps 4.5:1 at 13pt.
- Removing the tab slide and the entrances takes motion away, so Reduce Motion is honoured trivially.
- The intro keeps `accessibilityViewIsModal` and its "Skip the intro" button.

**Static checks before any build:** `npx tsc --noEmit`, `npx expo lint`, `node scripts/check-design.mjs` (must print no violations).

**Device verification.** Cause 1 never reproduces in Debug, so use a Release build:
```
scripts/build-lock.sh acquire "06 tab bug"
scripts/build-ios.sh device
scripts/build-lock.sh release
```
TestFlight also works. Run on Jan's phone; there are no simulator builds.

- **Before the fix (optional, about 10 min, confirms the ranking):** 20 cold starts. Swipe the app away and reopen it. Within 2 s of Home appearing, tap Stats, then Home, then Profile. Screenshot any blank and match it against section 1.
- **After the fix, every item must pass with zero blanks:**
  1. 20 cold starts, each visiting Home → Dex → Stats (the Dex top bar's stats button, 01 §6.1) → back → Profile → Home within 10 s of the intro ending. The intro must play on every one.
  2. Ten rounds of tapping all four tabs in under a second.
  3. Ten rounds of flinging the Dex grid and tapping Home mid-momentum, then returning. The grid and its header must be there.
  4. Background the app for 10 s and return: no intro. Swipe it away and reopen: intro.
  5. Cold-start an invite link (`drinkdex://invite/<token>` from Notes). "Accept the invite?" appears only after the film.
  6. Airplane mode, cold start with a session last used more than 1 h ago. Home shows a spinner, then "Still connecting…" by 8 s. Dex and Stats are fully usable.
  7. Fresh install, Continue with Apple. No blank page on Home or Profile longer than 4 s. Welcome or the username step appears.
  8. Log a pour and tap Done on the celebration within half a second. No dimmed layer is left behind.

---

## 9. What Jan must configure

Nothing outside the code. No Supabase, App Store Connect or `.env` changes. He only needs to run the Release verification above, which is where cause 1 lives.

## 10. Not doing, and why

- **Upgrading Reanimated:** there is no upstream fix for the stall, and SDK 57 pins 4.5.x. Removing the dependency on it is the fix.
- **`enableFreeze` / `freezeOnBlur`:** it adds a third way for hidden screens and layout animations to interact.
- **A global fetch timeout:** it would cut off slow photo and video uploads.
- **Restructuring `useAuth.init`:** the password-reset guard depends on its order.
- **Deleting orphaned wine and beer posts server-side:** irreversible, and hiding them is enough.
