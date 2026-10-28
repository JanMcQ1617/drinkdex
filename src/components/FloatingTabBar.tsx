import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Paper } from '@/components/details/Paper';
import { Icon, type TabName } from '@/components/icons';
import { Avatar, haptic } from '@/components/ui';
import type { ProfileRow } from '@/lib/database.types';
import { colors, layout, radius, stroke } from '@/constants/theme';
import { useBareGround } from '@/lib/bareGround';
import { useAuth } from '@/store/auth';

/* ==================================================================== */
/* The tab bar                                                          */
/*                                                                      */
/* Five glyphs and one short line (layout spec 4: "10 → 5 elements";    */
/* v4.2 decided 6 adds the line). Home · Tournaments · Dex · Saved ·    */
/* Profile, on an opaque page slab docked to the foot, with no rule, no */
/* shadow and no floating card. The name kept its file: it is still the */
/* bar TopTabs draws.                                                   */
/*                                                                      */
/* NO LABELS ON SCREEN, EVERY LABEL SPOKEN. Each tab keeps its name as  */
/* its accessibilityLabel ("Home", "Dex, your collection" …), so        */
/* VoiceOver reads exactly what it did; only the 11pt captions went.    */
/* The line is drawn, never spoken: `selected` already says where you   */
/* are.                                                                 */
/*                                                                      */
/* WHERE YOU ARE, THREE WAYS, NONE OF THEM COLOUR ALONE. The active     */
/* tab's glyph is the same glyph filled, in ink; a resting one is the   */
/* outline in muted. Every tab glyph has a solid form (icons.tsx,       */
/* TabName), and your face, which has none, takes a ring instead. And   */
/* an 18 x 2 ink line with square ends sits under the active one (Jan,  */
/* 13 Oct 2026: "add an affect to know in which tab i am in the         */
/* bottom").                                                            */
/*                                                                      */
/* THE DEX KEY (v4.7, Jan, 23 Oct 2026; specs/v4.7/spec.md 1 and its    */
/* dated note). The centre slot was the + until build 29: a Campari     */
/* rectangle that opened the + window and was not a page. Build 30 put  */
/* the Tournaments tab there, on the same red with a white trophy. The  */
/* same day Jan swapped the two: "make the dex section the middle one   */
/* and the tournament where the deck is" (the deck being the Dex). So   */
/* the centre is the Dex, the collection the app is built around, drawn */
/* as the bar's one filled key: the red rectangle (accent place 1, now  */
/* the Dex key), the Dex's own stemmed glass on it in white, outline at */
/* rest and solid when you are on it, like every other glyph. The red   */
/* keeps it the bar's one different KEY, and the line still says where  */
/* you are: it rests under the key on the Dex and stays ink, because    */
/* where you are is not the accent's to say (theme.ts names its         */
/* places). Tournaments took the Dex's old second slot as an ordinary   */
/* tab: its trophy in muted outline at rest, solid ink on its page, the */
/* line under it, exactly as Home's house is drawn. Posting lost        */
/* nothing: Home's create key opens the + window, as on Instagram.      */
/*                                                                      */
/* MOVED BY THE PAGER, NEVER BY A JS CLOCK. Changing tab is the pager's */
/* ((tabs)/_layout.tsx): a swipe carries the page under the finger and  */
/* a tap pages across natively (a cut under Reduce Motion). The line is */
/* the one thing here that moves, and it is not an animation of its     */
/* own: its x is the native driver's interpolation of the pager's own   */
/* position, so it travels with the page, under the finger or under     */
/* UIKit's paging, cuts when the page cuts, and rests where the page    */
/* rests. The filled glyph switches with the navigator's index: at once */
/* on a tap, and on a swipe when the pager picks the page. No timer,    */
/* no Animated.timing, no Reanimated.                                   */
/*                                                                      */
/* THE PAPER (v4.9, specs/v4.9/details/spec.md A.5; the sweep since     */
/* v4.10, specs/v4.10/spec.md G). The slab is the page's ground, so it  */
/* carries the page's paper (details/Paper), laid as the bar View's     */
/* first child under the line and the row. The sweep is anchored to the */
/* window and the slab's Paper cuts it at the slab's own place, so the  */
/* slab shows the sweep's foot exactly as the page above it would at    */
/* that height: the bar meets the page as one sheet, with no step. The  */
/* ground only. No mark is ever drawn on the bar (never a key, a glyph  */
/* or the line: the pen keeps off the tab bar), and the paper is static */
/* and measures only its own place in the window, so the bar stays free */
/* of Reanimated. At the Dock it arrives with the chrome, because the   */
/* bar already sits in the chrome Rise ((tabs)/_layout.tsx). Under      */
/* Reduce Transparency, Invert Colours or Increase Contrast there is    */
/* none, and the slab is the plain white it was. Under a bare page (the */
/* sign-in page and the steps after it, which are plain white on        */
/* purpose) there is none either: lib/bareGround holds it bare while    */
/* that page is focused, so the slab is white under white rather than   */
/* the sweep's foot ending in a step at the bar's top.                  */
/* ==================================================================== */

/**
 * The bottom padding a tab screen adds over `insets.bottom` so its last row
 * clears the bar: the bar's 49pt row and 16pt of air. The bar is opaque, so
 * content that scrolls under it is hidden, not shown through.
 */
export const TAB_BAR_CLEARANCE = layout.tabBar + 16;

const GLYPH = 26;
const AVATAR = 26;
/** The active avatar's ring: 1.5pt ink with a 2pt gap (layout spec 4). */
const FACE_RING = 1.5;
const FACE_GAP = 2;
const FACE_BOX = AVATAR + 2 * (FACE_RING + FACE_GAP);

/*
 * The Dex key, 52 x 32 (spec 1.2, which drew it for the trophy; the
 * measures moved with the red, unchanged). 32, not the +'s 38: the row
 * is 49 and the active line sits at y 43 to 45 (LINE_TOP), so a 38 key
 * (y 5.5 to 43.5) covered the line it now has to rest over. At 32 it runs
 * 8.5 to 40.5 and the line hangs 2.5 under it, the same air it keeps
 * under a 33pt glyph box. No hitSlop: the Pressable is the whole slot,
 * as every tab's is, so the touch target is 88 x 49 at 440.
 */
const KEY_W = 52;
const KEY_H = 32;
/** The Dex's glass on the key: a little under the bar's 26 so it sits inside the red with air round it. */
const KEY_GLYPH = 22;

/*
 * The active tab's line: 18 wide, under a 26pt glyph whose drawing is about
 * 20 across, and stroke.indicator (2) tall, with square ends. Its top is the
 * glyph box's foot plus the face ring's own 2pt gap, so it hangs under a
 * glyph and clears your face's ring by the same air the ring keeps from the
 * face: y 43 to 45 of the 49pt row, 4pt above the row's foot.
 */
const LINE_W = 18;
const LINE_TOP = (layout.tabBar + FACE_BOX) / 2 + FACE_GAP;

type TabBarIconProps = { focused: boolean; color: string; size: number };

/*
 * The glyph a route falls back to when its screen sets no tabBarIcon (every
 * screen sets one today). Four routes are not named after their glyph:
 * Home's route is `index`, Saved's is `saved`, My Bar's is `bar`, and the
 * Tournaments tab's is `board`, whose trophy is an ordinary tab glyph again
 * since the swap. The Dex's route is `dex`, its glyph's own name, though
 * the bar draws it as DexKey and never this way.
 */
const ROUTE_GLYPH: Readonly<Record<string, TabName>> = {
  index: 'home',
  saved: 'bookmark',
  bar: 'bottle',
  board: 'trophy',
};

/** The Dex's route: the slot the bar draws as its red key, wherever it falls. */
const KEY_ROUTE = 'dex';
const glyphFor = (route: string): TabName => ROUTE_GLYPH[route] ?? (route as TabName);

/*
 * Structural typing on purpose: expo-router SDK 57 vendors material top
 * tabs, which type their tab bar's props as `any`, so we declare only the
 * shape we consume. TabView also hands its bar `jumpTo`, which is not read.
 */
type FloatingTabBarProps = {
  state: {
    index: number;
    routes: { key: string; name: string }[];
  };
  descriptors: Record<
    string,
    {
      options: {
        title?: string;
        tabBarAccessibilityLabel?: string;
        tabBarIcon?: (props: TabBarIconProps) => React.ReactNode;
        /** Reserved: any truthy value draws a dot. Nothing sets it yet. */
        tabBarBadge?: string | number | (() => React.ReactElement);
      };
    }
  >;
  navigation: {
    // Method syntax, not a property: bivariant, so it accepts the real emit.
    emit(event: {
      type: 'tabPress';
      target?: string;
      canPreventDefault: true;
    }): { defaultPrevented: boolean };
    navigate(name: string): void;
  };
  /**
   * Where the pager is, in pages: 0 to routes - 1, fractional mid-swipe.
   * TabView hands it to its bar (react-native-tab-view's PagerViewAdapter:
   * the pager's onPageScroll, position plus offset, on the native driver),
   * and it is the same node for the bar's whole life. Optional, so the bar
   * still draws without a pager, its line standing on the focused tab.
   */
  position?: Animated.AnimatedInterpolation<number>;
  /** TabView's own box (initialLayout until it has laid out): the bar's width, since the bar spans it. */
  layout?: { width: number };
};

/**
 * The Dex tab, drawn as the bar's one filled key: a Campari rectangle
 * (accent place 1), 4pt corners like every key, the Dex's stemmed glass
 * white on it (onAccent, 5.54:1), outline at rest and solid when focused, so
 * where you are reads on the key the way it reads on every glyph, by
 * shape and not by colour. It is a tab like the others: the same press
 * (the caller's onPress, with its `select` haptic), the same `selected`
 * state, the same spoken name, and the whole slot is its Pressable, so
 * nothing needs hitSlop. Pressed, its fill goes accentPressed: controls
 * answer a press with their fill, never a scale.
 *
 * The only place this file names the accent (check-design rule 17 reads
 * exactly DexKey, styles.dexKey and styles.dexKeyPressed).
 */
function DexKey({
  focused,
  label,
  onPress,
}: {
  focused: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      style={styles.item}>
      {({ pressed }) => (
        <View style={[styles.dexKey, pressed && styles.dexKeyPressed]}>
          <Icon name="dex" size={KEY_GLYPH} color={colors.onAccent} filled={focused} />
        </View>
      )}
    </Pressable>
  );
}

/**
 * Your own face in the Profile slot: the bar's one picture, and the tab you
 * look for first. An avatar has no outline and solid to swap between, so
 * when active it takes a 1.5pt ink ring with a 2pt gap instead.
 */
function ProfileFace({ profile, focused }: { profile: ProfileRow; focused: boolean }) {
  return (
    <View style={[styles.faceRing, focused && styles.faceRingOn]}>
      <Avatar
        name={profile.display_name || profile.username}
        accent={profile.accent}
        size={AVATAR}
        avatarPath={profile.avatar_path}
      />
    </View>
  );
}

export function FloatingTabBar({ state, descriptors, navigation, position, layout: box }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width: windowW } = useWindowDimensions();
  // The signed-in account's own row only: a stale row from a previous
  // account must never put someone else's face on this tab.
  const me = useAuth((s) => (s.session && s.profile?.id === s.session.user.id ? s.profile : null));
  // A bare page is focused over the bar (lib/bareGround): the slab is its white, with no paper.
  const bare = useBareGround();

  const focusedKey = state.routes[state.index]?.key;
  /*
   * Every route in the navigator's state is a page of the pager and a slot
   * here, in the same order (Reels and My Bar are not in the state while
   * they are off). There is no slot without a page any more (v4.7: the +
   * that sat in the centre became a tab, the Dex since the swap), so the
   * track is plain: N pages, N equal slots, page i on slot i.
   */
  const visible = state.routes;

  /*
   * THE LINE'S TRACK. The slots are equal (styles.slot is flex 1) across
   * the bar's full width, one per page, so page i rests the line on the
   * centre of slot i and a fraction of a page puts it between two.
   * Counted from the routes actually in the state, so Reels or My Bar,
   * while on, take their slots and the line still lands on every glyph.
   * It passes under the red key on its way from Tournaments to Saved,
   * and rests under it on the Dex.
   */
  const pages = visible.length;
  const slotWidth = (box?.width || windowW) / pages;

  /*
   * A slot's width, held in a native value instead of baked into the
   * interpolation, so the graph below is built once and a new width is a
   * value set, never a new graph.
   *
   * That matters because only the native side knows where the pager is.
   * Its events move position there and nowhere else: the JS side's copy
   * stays where JS last set it (the launch page, or Reduce Motion's last
   * cut), and once Animated has drawn the line, React's commits no longer
   * write its transform (Fabric leaves a transform Animated manages to
   * Animated). So a graph built later (a new width baked in) would not be
   * drawn at all until the pager next moved, since iOS does not draw a
   * freshly connected graph by itself (ScrollChrome's wake note): the line
   * would stay where the old graph left it. A value set does make it draw,
   * from the native side's true position. So the effect below sets the
   * width on mount and on any change, and that set doubles as the wake: it
   * runs after the line has connected (a component's effects run after
   * its children's).
   *
   * Native from birth, as ScrollChrome's values are, so the whole graph is
   * native the moment it attaches, whichever order the pager and the bar
   * attach in.
   */
  const [slotW] = useState(() => new Animated.Value(slotWidth, { useNativeDriver: true }));

  /*
   * The line's x: the pager's position mapped page by page to slot centres
   * (in slots), times a slot's width. Interpolate and multiply, both on the
   * native driver, moved by the pager's own scroll events and nothing else:
   * under the finger, under UIKit's paging after a tap (across every tab in
   * between on a jump of several), and in one step when the pager cuts
   * (Reduce Motion: PagerViewAdapter sets position to the new page). At
   * rest the pager's last event carries offset 0 (pager-view's
   * emitIdleWithCleanOffset), so the line stands exactly on its slot.
   * Clamped, so a rubber band past the ends (were overdrag ever on) cannot
   * carry it off the bar.
   *
   * At first paint it is the JS side's value, which is the launch page,
   * where the pager starts: the line is on the right tab before any event,
   * and nothing about it starts hidden or waits for a frame.
   *
   * Built once, in practice: position is the pager's own memoised node, and
   * the page count is fixed for a build (the pager rebuilds itself when its
   * page count changes).
   */
  const glide = useMemo(() => {
    if (!position || pages < 2) return null;
    const at = Array.from({ length: pages }, (_, i) => i);
    return Animated.multiply(
      position.interpolate({
        inputRange: at,
        outputRange: at.map((i) => i + 0.5),
        extrapolate: 'clamp',
      }),
      slotW,
    );
  }, [position, pages, slotW]);

  useEffect(() => {
    slotW.setValue(slotWidth);
  }, [slotW, slotWidth, glide]);

  // Without a pager, a plain cut: the line stands on the focused tab's slot.
  const lineX = glide ?? (state.index + 0.5) * slotWidth;

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {/* The slab's paper, first, so the line and the row draw over it: the ground only (v4.9 A.5; the sweep, v4.10 G). */}
      {bare ? null : <Paper />}
      {/*
        The line, before the row. Nothing in the row covers it: the red
        key ends 2.5 above it. Mounted for the bar's whole life, never
        conditionally: the pager's native event writes to the
        position values by native tag, and a native value whose last child
        detaches is dropped and recreated under a new tag (ScrollChrome's
        keeper note), which would freeze the line where it was. Decorative:
        each tab's `selected` state is what VoiceOver reads.
      */}
      <Animated.View
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={[styles.line, { transform: [{ translateX: lineX }] }]}
      />
      <View style={styles.row} accessibilityRole="tabbar">
        {visible.map((route) => {
          const options = descriptors[route.key]?.options ?? {};
          const focused = route.key === focusedKey;
          const color = focused ? colors.text : colors.textMuted;
          const label = options.tabBarAccessibilityLabel ?? options.title ?? route.name;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              // `select`, not `tap`: changing section is a selection.
              haptic.select();
              navigation.navigate(route.name);
            }
          };

          /*
           * Filled when focused, by both paths: the screens' tabIcon
           * ((tabs)/_layout.tsx) and this fallback draw <Icon filled>,
           * whose SOLID form every TabName has.
           */
          const glyph =
            route.name === 'profile' && me ? (
              <ProfileFace profile={me} focused={focused} />
            ) : (
              (options.tabBarIcon?.({ focused, color, size: GLYPH }) ?? (
                <Icon name={glyphFor(route.name)} filled={focused} color={color} size={GLYPH} />
              ))
            );

          if (route.name === KEY_ROUTE) {
            return (
              <View key={route.key} style={styles.slot}>
                <DexKey focused={focused} label={label} onPress={onPress} />
              </View>
            );
          }

          return (
            <View key={route.key} style={styles.slot}>
              <Pressable
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: focused }}
                style={styles.item}>
                <View style={styles.glyphBox}>
                  {glyph}
                  {options.tabBarBadge ? <View style={styles.badge} /> : null}
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Docked and opaque: the page's white, and its paper, under the row and the home indicator. */
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
  },
  /* Five equal slots across the full width: centres at x 44 · 132 · 220 · 308 · 396 on a 440pt phone. */
  row: { height: layout.tabBar, flexDirection: 'row', alignItems: 'stretch' },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  item: {
    minWidth: layout.hit,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphBox: { width: FACE_BOX, height: FACE_BOX, alignItems: 'center', justifyContent: 'center' },
  /*
   * Ink, square ends (no radius), at the bar's left edge pulled back by half
   * its width, so its translateX is the x of the centre it stands on.
   */
  line: {
    position: 'absolute',
    top: LINE_TOP,
    left: -LINE_W / 2,
    width: LINE_W,
    height: stroke.indicator,
    backgroundColor: colors.text,
  },
  /*
   * 8pt ink with a 2pt page ring. Ink, not the accent: Home's Activity dot
   * is the accent's one dot (theme.ts), and there are no red badges.
   */
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    // round-ok: dot
    borderRadius: radius.round,
    borderWidth: 2,
    borderColor: colors.bg,
    backgroundColor: colors.text,
  },
  faceRing: {
    width: FACE_BOX,
    height: FACE_BOX,
    // round-ok: avatar
    borderRadius: radius.round,
    borderWidth: FACE_RING,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceRingOn: { borderColor: colors.text },
  /*
   * The Dex key's red, centred in its slot by the Pressable
   * (styles.item): y 8.5 to 40.5 of the 49pt row, over the line's 43.
   */
  dexKey: {
    width: KEY_W,
    height: KEY_H,
    borderRadius: radius.control,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* A fill change, not a scale: controls answer a press with their fill. */
  dexKeyPressed: { backgroundColor: colors.accentPressed },
});
