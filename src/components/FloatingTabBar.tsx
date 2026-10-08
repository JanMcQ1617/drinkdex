import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type TabName } from '@/components/icons';
import { useTabBarCollapse } from '@/components/ScrollChrome';
import { Avatar, haptic } from '@/components/ui';
import type { ProfileRow } from '@/lib/database.types';
import {
  colors,
  elevation,
  fonts,
  layout,
  radius,
  stroke,
  type as typeScale,
} from '@/constants/theme';
import { useAuth } from '@/store/auth';

/* ==================================================================== */
/* Floating tab bar                                                     */
/*                                                                      */
/* Replaces the stock expo-router bar, which was an opaque slab welded  */
/* to the bottom edge with a 1px top border: it cut the page off rather */
/* than floating over it.                                               */
/*                                                                      */
/* AN OPAQUE, BORDERED RECTANGLE. 12pt corners, a 1pt edge and a tight  */
/* shadow. It was a frosted-glass stadium with a painted sheen: the     */
/* fake-glass fallback was the most template-looking surface in the     */
/* app, and native Liquid Glass resolves to near-page on cream, so the  */
/* bar lost its own silhouette. A bar with a drawn edge reads as a made */
/* object.                                                              */
/*                                                                      */
/* ONE SKIN, ESPRESSO, ON EVERY TAB (v3). It was white on the paper     */
/* tabs and espresso only on Reels. A white bar laid over Home's        */
/* full-bleed photos read as a white box pasted onto the picture, and   */
/* on cream it was a white rectangle on a cream one. The espresso bar   */
/* is one dark, anchored object over every ground, the reel ground's    */
/* own colours, so it also needs no switch when Reels comes back.       */
/*                                                                      */
/* THE ACTIVE TAB IS BONE, NOT WINE, and says so three ways: its glyph  */
/* drawn solid, its label in SemiBold, and a 2pt indicator over the     */
/* slot, so the state never rests on colour alone. The bar's one wine   */
/* object is the post action, and a wine "where you are" would compete  */
/* with it.                                                             */
/*                                                                      */
/* BRASS HARDWARE (v3.3 Brass D11). A 1pt brass keyline inset 3 inside  */
/* the slab (tabKeyline, decorative), the indicator in brassLit riding  */
/* on that keyline (10.45:1 on espresso), and the + button edged in     */
/* brass (4.75:1 against its own wine) with a lit top lip. Two Views    */
/* and two colours; nothing new moves.                                  */
/*                                                                      */
/* MOVED BY THE FINGER OR BY UIKIT, NEVER BY A JS CLOCK. Changing tab   */
/* is the pager's ((tabs)/_layout.tsx): a swipe carries the page under  */
/* the finger, and a tap pages across natively (a cut under Reduce      */
/* Motion). The indicator is one rule whose translateX the native       */
/* driver interpolates from the pager's own position, so it glides with */
/* the page through a swipe or a tap and rests exactly over its slot;   */
/* the solid glyph and the label's weight switch once the page settles. */
/* Scrolling a list down compacts the bar to a 48pt glyph-only slab,    */
/* and scrolling up, or reaching the top, restores it                   */
/* (ScrollChrome.tsx). None of it runs on a timer: each is a native     */
/* interpolation of a scroll, the pager's or a list's, so a dropped     */
/* frame can only leave a working bar with every glyph showing.         */
/* ==================================================================== */

/**
 * Vertical space the floating bar occupies above the bottom edge.
 *
 * Tab screens must add `insets.bottom + TAB_BAR_CLEARANCE` to their
 * bottom padding — the bar floats OVER content, so the last list row would
 * otherwise sit under it.
 */
export const TAB_BAR_CLEARANCE = 84;

/** Inner horizontal padding of the bar. */
const BAR_PAD = 6;
/** The box every tab glyph (or the avatar and its ring) is centred in. */
const GLYPH_BOX = 28;
const GLYPH = 24;
const AVATAR = 24;

/*
 * The bar's inks. Resting is reelInkDim on reelBar (5.86:1), above the
 * 4.5:1 an 11pt label needs; active is reelInk (15.13:1).
 */
const INK = {
  active: colors.reelInk,
  rest: colors.reelInkDim,
  // Wine on the espresso bar is 1.12:1; the reel ground's liked-heart rose
  // is 3.15:1 there, enough for a dot that carries no words.
  badge: colors.wineSoft,
} as const;

/** The active slot's indicator: 2pt tall (stroke.indicator), as wide as the glyph box. */
const INDICATOR_W = 28;
/** The brass keyline's inset inside the slab, and so the indicator's top (it rides on the keyline). */
const KEYLINE_INSET = 3;

/** The gap between a glyph box and its label (styles.item's `gap`). */
const LABEL_GAP = 3;
/** Labels grow with Larger Text only so far (the label's maxFontSizeMultiplier). */
const LABEL_SCALE_CAP = 1.3;

type TabBarIconProps = { focused: boolean; color: string; size: number };

/*
 * The glyph a route falls back to when its screen sets no tabBarIcon (every
 * screen sets one today). Two routes are not named after their glyph:
 * Home's route is `index`, My Bar's is `bar`.
 */
const ROUTE_GLYPH: Readonly<Record<string, TabName>> = { index: 'home', bar: 'bottle' };
const glyphFor = (route: string): TabName => ROUTE_GLYPH[route] ?? (route as TabName);

/*
 * Structural typing on purpose: expo-router SDK 57 vendors material top
 * tabs, which type their tab bar's props as `any` (react-native-tab-view's
 * types are not bundled), so we declare only the shape we consume.
 * Compatible with what <TopTabs tabBar={…}> passes, and with the bottom
 * tabs' bar props too.
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
        /**
         * Reserved: any truthy value draws a dot. Nothing sets it yet. Top
         * tabs type it as a render function, bottom tabs as a value.
         */
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
   * TabView hands it to its tab bar (react-native-tab-view's
   * PagerViewAdapter: the pager's onPageScroll on the native driver).
   * Optional, so the bar still draws, with a static indicator, without a
   * pager. TabView's `layout` and `jumpTo` arrive too and are not read.
   */
  position?: Animated.AnimatedInterpolation<number>;
};

/**
 * The post action: post a drink. A wine rectangle seated in the bar,
 * immediately before My Bar.
 *
 * It sits BETWEEN the tabs rather than being one of them. It is not a
 * route: posting a drink is a thing you do, not a place you are, and making
 * it a tab would put a permanently-unselectable item in a bar whose whole
 * job is showing where you are.
 *
 * Wider than tall and filled where the tabs are outlined, so it reads as a
 * different KIND of control rather than another tab. No ring and no shadow:
 * it was a 52pt disc in a page-coloured ring with a drop shadow of its own,
 * a button hovering in a hole rather than one belonging to the bar.
 *
 * No label under it, unlike the tabs. A plus needs no gloss; the coupe and
 * the bottle beside it are Sipply's own glyphs and do.
 *
 * No haptic. Haptics now answer a selection, a finished save, a like and
 * recording; a plain button press ticks nowhere in the app, and this one
 * opens a full-screen window, which is answer enough.
 *
 * Wine on the espresso bar is 1.12:1, so the fill alone would vanish into
 * it: the 1pt edge is what draws the button's outline, brass since v3.3
 * (5.32:1 on espresso, 4.75:1 against its own wine; it was bone,
 * logActionEdge, 3.02:1), and the bone plus on wine is 10.95:1. It used to
 * invert to bone on Reels for the same reason; with one skin everywhere,
 * the edge does it. 52 x 38 (was 48 x 36): the Brass mock's size, with a
 * lit inset lip along its top (elevation.logAction).
 */
function CentreAction({
  onPress,
  motion,
}: {
  onPress: () => void;
  /** Half the slots' drop: the + is centred on the full row, then on the compact slab. */
  motion: Animated.WithAnimatedValue<{ transform: { translateY: number }[] }>;
}) {
  return (
    <Animated.View style={[styles.fabSlot, motion]} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Post a drink"
        accessibilityHint="Take a photo and pick what you drank"
        // 38 tall; this reaches the 44pt target.
        hitSlop={{ top: 3, bottom: 3 }}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}>
        <Icon name="plus" size={22} color={colors.textOnWine} filled />
      </Pressable>
    </Animated.View>
  );
}

/**
 * Your own face in the Profile slot, in place of the person glyph: the
 * bar's one picture, and the tab you look for first. An avatar has no
 * outline and solid to swap between, so its 1.5pt ring does the glyph's
 * job: resting ink at rest, bone when focused, with the label's weight
 * and the indicator changing beside it. The ring is also the face's
 * silhouette at rest: the wine disc is 1.12:1 on the espresso bar.
 */
function ProfileFace({ profile, focused }: { profile: ProfileRow; focused: boolean }) {
  return (
    <View style={[styles.faceRing, { borderColor: focused ? INK.active : INK.rest }]}>
      <Avatar
        name={profile.display_name || profile.username}
        accent={profile.accent}
        size={AVATAR}
        avatarPath={profile.avatar_path}
      />
    </View>
  );
}

export function FloatingTabBar({ state, descriptors, navigation, position }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // The signed-in account's own row only: a stale row from a previous
  // account must never put someone else's face on this tab.
  const me = useAuth((s) =>
    s.session && s.profile?.id === s.session.user.id ? s.profile : null,
  );

  const focusedRoute = state.routes[state.index];
  const focusedKey = focusedRoute?.key;

  /*
   * Compaction, 0 (full) to 1 (compact), from the focused tab's list.
   * Rebuilt on every change of tab, so a tab always arrives with the
   * full bar; the constant 0 on Reels and while VoiceOver runs.
   *
   * labelBlock is what the compact bar gives up: the label's line at its
   * capped size and the gap above it (17pt at the default size). Taking it
   * off the bottom of the slab and dropping each slot by it centres every
   * glyph in what is left: 48pt from the default text size up, a little
   * more at the smaller sizes, where the bar's 64pt minimum holds it
   * taller than its content. barH is the slab's laid-out height, so the
   * scale is right at every size.
   */
  const c = useTabBarCollapse(focusedRoute?.name);
  const { fontScale } = useWindowDimensions();
  const labelBlock = LABEL_GAP + typeScale.tag.lineHeight * Math.min(fontScale, LABEL_SCALE_CAP);
  const [barH, setBarH] = useState<number>(layout.tabBar);
  // 0 until measured: the gliding indicator waits for it (see `glide`).
  const [barW, setBarW] = useState(0);
  const onBarLayout = (e: LayoutChangeEvent) => {
    setBarH(e.nativeEvent.layout.height);
    setBarW(e.nativeEvent.layout.width);
  };
  const motion = useMemo(() => {
    const along = (to: number) =>
      c.interpolate({ inputRange: [0, 1], outputRange: [0, to], extrapolate: 'clamp' });
    return {
      // Scaled from its foot (styles.slab's transformOrigin), so it shrinks downwards.
      slab: {
        transform: [
          {
            scaleY: c.interpolate({
              inputRange: [0, 1],
              outputRange: [1, Math.max(barH - labelBlock, 1) / Math.max(barH, 1)],
              extrapolate: 'clamp',
            }),
          },
        ],
      },
      // Each slot, and the indicator's track with them: the indicator rides the slab's top edge.
      slot: { transform: [{ translateY: along(labelBlock) }] },
      // Gone before they reach the slab's foot.
      label: {
        opacity: c.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: 'clamp' }),
      },
      fab: { transform: [{ translateY: along(labelBlock / 2) }] },
    };
  }, [c, barH, labelBlock]);

  /*
   * Every route in the navigator's state is a page of the pager and a slot
   * here, in the same order. With Reels off it is not in the state at all
   * ((tabs)/_layout.tsx guards it with TopTabs.Protected), so no page, no
   * swipe and no slot. It used to be filtered out here, which in a pager
   * would have left a page you could swipe to with no slot to show it.
   */
  const visible = state.routes;
  /*
   * The post action is drawn immediately before My Bar, found by its route
   * name rather than by counting: Home · Dex · + · My Bar · Profile with
   * Reels off, Home · Reels · Dex · + · My Bar · Profile with it on. Were
   * My Bar ever missing, it falls back to the middle of whatever is shown.
   */
  const barAt = visible.findIndex((r) => r.name === 'bar');
  const fabAt = barAt >= 0 ? barAt : Math.ceil(visible.length / 2);
  const pages = visible.length;

  /*
   * The gliding indicator's x, from the pager's position: page i rests it
   * centred over route i's slot, and a fraction puts it between the two.
   * Slots are equal (styles.slot is flex 1): the tabs and the + make
   * pages + 1 of them across the row, inside the slab's 1pt edge and the
   * row's padding, and a route at or past the + sits one slot further on.
   *
   * Clamped, so the pager's rubber band (were overdrag ever on) cannot
   * carry it off the end. Null until the bar is measured, or with no
   * pager: each slot then draws its own static indicator, so a missed
   * layout never loses the cue.
   *
   * Once drawn it stays mounted while the bar lives. The pager's native
   * onPageScroll event writes to the position values by native tag, and a
   * native value whose last child detaches is dropped and recreated under
   * a new tag (ScrollChrome's keeper note), which would freeze it here.
   *
   * Built once, in practice: position is the pager's own memoised node,
   * and barW goes from 0 to the window's width less the insets, which a
   * portrait-only iPhone app never changes (app.json). A rebuild would
   * keep the graph alive (React Native attaches the new node before it
   * detaches the old one), but the new node's first frame comes from the
   * JS side's copy of position, which the native driver leaves at the
   * launch page, so the rule would sit there until the pager next moved.
   * Give it a wake (as ScrollChrome's pulse does) before letting barW vary.
   */
  const glide = useMemo(() => {
    if (!position || barW <= 0 || pages < 2) return null;
    const slotW = (barW - 2 * stroke.edge - 2 * BAR_PAD) / (pages + 1);
    const pageIndices = Array.from({ length: pages }, (_, i) => i);
    return position.interpolate({
      inputRange: pageIndices,
      outputRange: pageIndices.map(
        (i) => stroke.edge + BAR_PAD + (i < fabAt ? i : i + 1) * slotW + (slotW - INDICATOR_W) / 2,
      ),
      extrapolate: 'clamp',
    });
  }, [position, barW, pages, fabAt]);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 2 }]}>
      {/*
        box-none down to the slab and the buttons: once the bar compacts,
        the strip above the slab is the page again and takes its own taps.
      */}
      <View style={styles.bar} onLayout={onBarLayout} pointerEvents="box-none">
        <Animated.View style={[styles.slab, motion.slab]}>
          {/* The brass keyline (D11): inside the slab, so it compacts with it. Decorative. */}
          <View pointerEvents="none" style={styles.keyline} />
        </Animated.View>
        {/*
          The second cue for where you are, after the solid glyph and the
          label's weight: a 2pt brassLit rule laid on the slab's brass
          keyline. It glides with the pager (see `glide`), and rides the
          slab's top edge down with the slots as the bar compacts.
        */}
        {glide ? (
          <Animated.View pointerEvents="none" style={[styles.indicatorTrack, motion.slot]}>
            <Animated.View style={[styles.indicatorGlide, { transform: [{ translateX: glide }] }]} />
          </Animated.View>
        ) : null}
        <View style={styles.row} accessibilityRole="tabbar" pointerEvents="box-none">
          {visible.map((route, at) => {
            const options = descriptors[route.key]?.options ?? {};
            const focused = route.key === focusedKey;
            /*
             * The glyph and its label are handed one ink, so a resting tab
             * is one grey, not a pale icon over a darker caption.
             */
            const color = focused ? INK.active : INK.rest;
            /*
             * Sentence case. These were UPPERCASE and letterspaced once,
             * the single most AI-looking habit this app had; a tab label is
             * the one place tiny caps are conventional, and it was still
             * four shouted words under four icons that already said them.
             */
            const label = options.title ?? route.name;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                // `select`, not `tap`: changing section is a selection.
                haptic.select();
                navigation.navigate(route.name);
              }
            };

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
                    motion={motion.fab}
                    onPress={() => {
                      /*
                       * router, not navigation: `log` is a root-stack modal,
                       * and the tab navigator handed to this component can
                       * only reach its own siblings.
                       *
                       * `navigate`, not `push`. A push always adds a route,
                       * so a double tap, or taps that queued up while the JS
                       * thread was busy, stacked one log sheet per tap, each
                       * a full search list kept alive underneath the next.
                       * navigate reuses the route when `log` is already the
                       * one on top (expo-router's stack override), and from
                       * anywhere else it pushes exactly as before.
                       */
                      router.navigate('/log');
                    }}
                  />
                ) : null}
                {/*
                  The slot moves, not just what is drawn in it, so its tap
                  area stays on the slab as the bar compacts (44pt and more
                  either way).
                */}
                <Animated.View style={[styles.slot, motion.slot]} pointerEvents="box-none">
                  <Pressable
                    onPress={onPress}
                    accessibilityRole="button"
                    accessibilityLabel={options.tabBarAccessibilityLabel ?? options.title ?? route.name}
                    accessibilityState={{ selected: focused }}
                    hitSlop={4}
                    style={styles.item}>
                    {/*
                      The indicator's fallback, static over the focused
                      slot: until the bar is measured, or with no pager.
                    */}
                    {!glide && focused ? <View style={styles.indicator} /> : null}
                    <View style={styles.glyphBox}>
                      {glyph}
                      {options.tabBarBadge ? (
                        <View style={styles.badge} />
                      ) : null}
                    </View>
                    <Animated.Text
                      style={[
                        styles.label,
                        { color, fontFamily: focused ? fonts.bodySemiBold : fonts.bodyMedium },
                        motion.label,
                      ]}
                      numberOfLines={1}
                      /*
                       * Capped. UIKit's own tab bar keeps its labels a fixed
                       * size; this one still grows with Larger Text, but only
                       * so far — at the accessibility sizes (2.35x and up) an
                       * 11pt label truncated to "Pr…" in a slot a fifth of
                       * the bar wide. VoiceOver reads the full
                       * accessibilityLabel whatever the cap.
                       */
                      maxFontSizeMultiplier={LABEL_SCALE_CAP}>
                      {label}
                    </Animated.Text>
                  </Pressable>
                </Animated.View>
              </React.Fragment>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: layout.tabBarInset,
    right: layout.tabBarInset,
  },
  /*
   * A minimum, not a height: the row is 63pt at the default text size and
   * grows a little at the capped Larger Text sizes rather than clipping
   * its labels. The padding is the slab's 1pt edge, so the row sits inside
   * it exactly as it did when the edge was this view's own border.
   */
  bar: {
    minHeight: layout.tabBar,
    padding: stroke.edge,
  },
  /*
   * The bar's skin, drawn behind the row so it can compact on its own:
   * the reel ground's espresso on every tab, with the reels' bone edge.
   * barDark is the one shadow: the bar floats over cream and photos alike,
   * and on cream a shadow is what says it is above the page, not in it.
   * Compacted, the 1pt edge draws at about 0.7pt top and bottom and the
   * corners at 12 x 9: below what reads at arm's length.
   */
  slab: {
    ...StyleSheet.absoluteFill,
    transformOrigin: 'bottom',
    borderRadius: radius.card,
    borderWidth: stroke.edge,
    backgroundColor: colors.reelBar,
    borderColor: colors.reelControlBorder,
    ...elevation.barDark,
  },
  /* Concentric with the slab's 12pt corners: 12 - 3. */
  keyline: {
    position: 'absolute',
    top: KEYLINE_INSET - stroke.edge,
    left: KEYLINE_INSET - stroke.edge,
    right: KEYLINE_INSET - stroke.edge,
    bottom: KEYLINE_INSET - stroke.edge,
    borderRadius: radius.card - KEYLINE_INSET,
    borderWidth: stroke.edge,
    borderColor: colors.tabKeyline,
  },
  /*
   * The row fills the bar and every slot stretches to the row's full
   * height, so a slot's top is always the bar's top edge (where its
   * indicator sits) whatever the text size, and the whole height of the
   * slot takes the tap.
   */
  row: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: BAR_PAD,
  },
  /*
   * `flex: 1` for the tabs and the action alike: six equal slots (five
   * with Reels off) are a property of the layout, not of a computed width
   * that could drift from it.
   */
  slot: { flex: 1 },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: LABEL_GAP,
    paddingVertical: 9,
  },
  /*
   * The gliding indicator's track: the bar's full width along its top
   * edge, so a translateX measured from the bar's left lands on the slab.
   * Absolute children are placed from the padding box's outer edge (the
   * slab's absoluteFill covers the bar's 1pt padding the same way), so
   * top 0 is the slab's top edge, where the fallback below also sits.
   */
  indicatorTrack: {
    position: 'absolute',
    top: KEYLINE_INSET,
    left: 0,
    right: 0,
    height: stroke.indicator,
  },
  indicatorGlide: {
    width: INDICATOR_W,
    height: stroke.indicator,
    backgroundColor: colors.brassLit,
  },
  /* The fallback: on the keyline (KEYLINE_INSET from the slab's outer top, inside the padded row), centred on the slot. */
  indicator: {
    position: 'absolute',
    top: KEYLINE_INSET - stroke.edge,
    left: '50%',
    marginLeft: -INDICATOR_W / 2,
    width: INDICATOR_W,
    height: stroke.indicator,
    backgroundColor: colors.brassLit,
  },
  glyphBox: {
    width: GLYPH_BOX,
    height: GLYPH_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 6,
    height: 6,
    // round-ok: dot
    borderRadius: radius.round,
    backgroundColor: INK.badge,
  },
  faceRing: {
    width: GLYPH_BOX,
    height: GLYPH_BOX,
    // round-ok: avatar
    borderRadius: radius.round,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /*
   * Sentence case, 11pt, Inter, no tracking — the same quiet caption iOS
   * sets under its own tab icons. Medium at rest, SemiBold when active.
   */
  label: {
    fontSize: typeScale.tag.fontSize,
    lineHeight: typeScale.tag.lineHeight,
  },

  fabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    width: 52,
    height: 38,
    borderRadius: radius.control,
    borderWidth: stroke.edge,
    borderColor: colors.brass,
    backgroundColor: colors.wine,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.logAction,
  },
  /* A fill change, not a scale: controls answer a press with their fill. */
  fabPressed: { backgroundColor: colors.wineDeep },
});
