import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type TabName } from '@/components/icons';
import { Avatar, haptic } from '@/components/ui';
import type { ProfileRow } from '@/lib/database.types';
import { colors, layout, radius, stroke } from '@/constants/theme';
import { useAuth } from '@/store/auth';

/* ==================================================================== */
/* The tab bar                                                          */
/*                                                                      */
/* Five glyphs and one short line (layout spec 4: "10 → 5 elements";    */
/* v4.2 decided 6 adds the line). Home · Dex · + · Saved · Profile, on  */
/* an opaque page slab docked to the foot, with no rule, no shadow and  */
/* no floating card. The name kept its file: it is still the bar        */
/* TopTabs draws.                                                       */
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
/* bottom"). The + is the bar's only filled key, a Campari rectangle    */
/* (the accent, v4.4), so it reads as a different KIND of control:      */
/* posting is a thing you do, not a place you are. The line never rests */
/* under it, and the line stays ink: where you are is not the accent's  */
/* to say (theme.ts names its five places).                             */
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

/** The + key, 52 x 38: 3pt of hitSlop takes it to 44. */
const FAB_W = 52;
const FAB_H = 38;

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
 * screen sets one today). Three routes are not named after their glyph:
 * Home's route is `index`, Saved's is `saved`, My Bar's is `bar`.
 */
const ROUTE_GLYPH: Readonly<Record<string, TabName>> = { index: 'home', saved: 'bookmark', bar: 'bottle' };
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
 * The post action: an accent rectangle seated in the bar before Saved,
 * 4pt corners like every key, its + white (onAccent, 5.54:1). Not a
 * route: posting a drink is a thing you do, and a tab for it would be a
 * permanently unselectable item in a bar whose job is where you are. 52 x
 * 38 with 3pt of hitSlop to 44. No haptic: it opens a full-screen window,
 * which is answer enough.
 *
 * It stands on a column of page as wide as the key and as tall as the row,
 * drawn over the active tab's line. So the line, crossing from the Dex to
 * Saved, passes behind the key instead of underlining it, and the + never
 * looks like the tab you are on, even mid-swipe.
 */
function CentreAction({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.slot}>
      <View style={styles.fabColumn}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="Post a drink"
          accessibilityHint="Take a photo and pick the drink you had"
          hitSlop={{ top: 3, bottom: 3 }}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}>
          <Icon name="plus" size={22} color={colors.onAccent} filled />
        </Pressable>
      </View>
    </View>
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
  const router = useRouter();
  const { width: windowW } = useWindowDimensions();
  // The signed-in account's own row only: a stale row from a previous
  // account must never put someone else's face on this tab.
  const me = useAuth((s) => (s.session && s.profile?.id === s.session.user.id ? s.profile : null));

  const focusedKey = state.routes[state.index]?.key;
  /*
   * Every route in the navigator's state is a page of the pager and a slot
   * here, in the same order (Reels and My Bar are not in the state while
   * they are off). The + is drawn immediately before Saved, found by name,
   * so it keeps its place beside the Dex if My Bar comes back after Saved;
   * else before My Bar, else in the middle. Home · Dex · Saved · Profile
   * is Home · Dex · + · Saved · Profile either way.
   */
  const visible = state.routes;
  const savedAt = visible.findIndex((r) => r.name === 'saved');
  const barAt = visible.findIndex((r) => r.name === 'bar');
  const fabAt = savedAt >= 0 ? savedAt : barAt >= 0 ? barAt : Math.ceil(visible.length / 2);

  /*
   * THE LINE'S TRACK. The slots are equal (styles.slot is flex 1) across
   * the bar's full width: one per page, and one for the + when it is drawn.
   * A page at or past the + sits one slot further on, so page i rests the
   * line on the centre of slot i (before the +) or i + 1 (after it), and a
   * fraction of a page puts it between two. The + is a slot the line
   * crosses, behind its column (CentreAction), and never one it stops at.
   * Counted from the routes actually in the state, so Reels or My Bar,
   * while on, take their slots and the line still lands on every glyph.
   */
  const pages = visible.length;
  const slots = pages + (fabAt < pages ? 1 : 0);
  const slotWidth = (box?.width || windowW) / slots;

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
   * the page count and the +'s place are fixed for a build (the pager
   * rebuilds itself when its page count changes).
   */
  const glide = useMemo(() => {
    if (!position || pages < 2) return null;
    const at = Array.from({ length: pages }, (_, i) => i);
    return Animated.multiply(
      position.interpolate({
        inputRange: at,
        outputRange: at.map((i) => (i < fabAt ? i : i + 1) + 0.5),
        extrapolate: 'clamp',
      }),
      slotW,
    );
  }, [position, pages, fabAt, slotW]);

  useEffect(() => {
    slotW.setValue(slotWidth);
  }, [slotW, slotWidth, glide]);

  // Without a pager, a plain cut: the line stands on the focused tab's slot.
  const focusedSlot = state.index < fabAt ? state.index : state.index + 1;
  const lineX = glide ?? (focusedSlot + 0.5) * slotWidth;

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {/*
        The line, before the row, so the row draws over it and the +'s
        column of page hides it as it crosses. Mounted for the bar's whole
        life, never conditionally: the pager's native event writes to the
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
        {visible.map((route, at) => {
          const options = descriptors[route.key]?.options ?? {};
          const focused = route.key === focusedKey;
          const color = focused ? colors.text : colors.textMuted;

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

          return (
            <React.Fragment key={route.key}>
              {at === fabAt ? (
                <CentreAction
                  onPress={() => {
                    /*
                     * router, not navigation: `log` is a root-stack modal.
                     * `navigate`, not `push`: a double tap, or taps queued
                     * while the JS thread was busy, would stack one window
                     * per tap; navigate reuses `log` when it is on top.
                     */
                    router.navigate('/log');
                  }}
                />
              ) : null}
              <View style={styles.slot}>
                <Pressable
                  onPress={onPress}
                  accessibilityRole="button"
                  accessibilityLabel={options.tabBarAccessibilityLabel ?? options.title ?? route.name}
                  accessibilityState={{ selected: focused }}
                  style={styles.item}>
                  <View style={styles.glyphBox}>
                    {glyph}
                    {options.tabBarBadge ? <View style={styles.badge} /> : null}
                  </View>
                </Pressable>
              </View>
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Docked and opaque: the page's white under the row and the home indicator. */
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
  /* The page behind the + (CentreAction): the key's width, the row's height. */
  fabColumn: {
    flex: 1,
    width: FAB_W,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  fab: {
    width: FAB_W,
    height: FAB_H,
    borderRadius: radius.control,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* A fill change, not a scale: controls answer a press with their fill. */
  fabPressed: { backgroundColor: colors.accentPressed },
});
