import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type TabName } from '@/components/icons';
import { Avatar, haptic } from '@/components/ui';
import type { ProfileRow } from '@/lib/database.types';
import { REELS_ENABLED } from '@/lib/reels';
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
/* AN OPAQUE, BORDERED RECTANGLE. 12pt corners, white, a 1pt `line`     */
/* edge and a tight shadow. It was a frosted-glass stadium with a       */
/* painted sheen: the fake-glass fallback was the most template-looking */
/* surface in the app, and native Liquid Glass resolves to near-page on */
/* cream, so the bar lost its own silhouette. A bar with a drawn edge   */
/* reads as a made object.                                              */
/*                                                                      */
/* THE ACTIVE TAB IS ESPRESSO, NOT WINE: its glyph drawn solid and its  */
/* label in SemiBold, so the state never rests on colour alone. The     */
/* bar's one wine object is the log action, and a wine "where you are"  */
/* competed with it. Nothing else moves: the page cuts, as iOS's own    */
/* tab bar and Instagram's do ((tabs)/_layout.tsx, specs/06).           */
/*                                                                      */
/* DARK ON REELS. While the Reels tab is focused and someone is signed  */
/* in, the bar takes the reel ground's colours; a cream bar over video  */
/* reads as a light leak. Signed out, the Reels tab shows the cream     */
/* sign-in screen, so the bar stays paper there. The skin switches with */
/* the tab, instantly.                                                  */
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
 * Two skins, one shape. Paper is every tab but Reels; dark is Reels while
 * signed in. Resting ink is textMuted on white (6.13:1) and reelInkDim on
 * reelBar (5.86:1); both clear the 4.5:1 an 11pt label needs.
 */
const PAPER = {
  active: colors.text,
  rest: colors.textMuted,
  ring: colors.lineInk,
  badge: colors.wine,
} as const;
const DARK = {
  active: colors.reelInk,
  rest: colors.reelInkDim,
  ring: colors.reelInk,
  // Wine on the espresso bar is 1.12:1; the reel ground's liked-heart rose
  // is 3.15:1 there, enough for a dot that carries no words.
  badge: colors.wineSoft,
} as const;

type TabBarIconProps = { focused: boolean; color: string; size: number };

/*
 * Structural typing on purpose: expo-router SDK 57 vendors bottom-tabs
 * with no public subpath for BottomTabBarProps, so we declare only the
 * shape we consume. Compatible with what <Tabs tabBar={…}> passes.
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
        tabBarBadge?: string | number;
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
};

/**
 * The centre action: log a pour. A wine rectangle seated in the bar.
 *
 * It sits BETWEEN the tabs rather than being one of them. It is not a
 * route: logging a pour is a thing you do, not a place you are, and making
 * it a tab would put a permanently-unselectable item in a bar whose whole
 * job is showing where you are.
 *
 * Wider than tall and filled where the tabs are outlined, so it reads as a
 * different KIND of control rather than another tab. No ring and no shadow:
 * it was a 52pt disc in a page-coloured ring with a drop shadow of its own,
 * a button hovering in a hole rather than one belonging to the bar.
 *
 * No label under it, unlike the tabs. A plus needs no gloss; the coupe and
 * the film gate beside it are Sipply's own glyphs and do.
 *
 * No haptic. Haptics now answer a selection, a finished save, a like and
 * recording; a plain button press ticks nowhere in the app, and this one
 * opens a sheet, which is answer enough.
 *
 * On Reels it inverts to bone with a wine plus (13.53:1): wine on the
 * espresso bar would be 1.12:1 and vanish.
 */
function CentreAction({ onPress, dark }: { onPress: () => void; dark: boolean }) {
  return (
    <View style={styles.fabSlot} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Log a pour"
        accessibilityHint="Take a photo and pick what you drank"
        // 36 tall; this reaches the 44pt target.
        hitSlop={{ top: 4, bottom: 4 }}
        style={({ pressed }) => [
          styles.fab,
          dark && styles.fabDark,
          pressed && (dark ? styles.fabDarkPressed : styles.fabPressed),
        ]}>
        <Icon name="plus" size={22} color={dark ? colors.wine : colors.textOnWine} filled />
      </Pressable>
    </View>
  );
}

/**
 * Your own face in the Profile slot, in place of the person glyph: the
 * bar's one picture, and the tab you look for first. Focused, it takes a
 * 1.5pt ink ring, because an avatar has no outline and solid to swap
 * between; the label's weight changes with it.
 */
function ProfileFace({ profile, focused, ring }: { profile: ProfileRow; focused: boolean; ring: string }) {
  return (
    <View style={[styles.faceRing, focused && { borderColor: ring }]}>
      <Avatar
        name={profile.display_name || profile.username}
        accent={profile.accent}
        size={AVATAR}
        avatarPath={profile.avatar_path}
      />
    </View>
  );
}

export function FloatingTabBar({ state, descriptors, navigation }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const signedIn = useAuth((s) => s.session != null);
  // The signed-in account's own row only: a stale row from a previous
  // account must never put someone else's face on this tab.
  const me = useAuth((s) =>
    s.session && s.profile?.id === s.session.user.id ? s.profile : null,
  );

  const focusedKey = state.routes[state.index]?.key;
  /*
   * REELS_ENABLED as well: with the flag off the reels route is only ever
   * a redirect home, and a dark bar flashed for that frame would be a
   * glimpse of a feature that is switched off.
   */
  const dark =
    REELS_ENABLED && state.routes[state.index]?.name === 'reels' && signedIn;
  const skin = dark ? DARK : PAPER;

  /*
   * The reels route always exists (its file is the switched-off redirect),
   * so with the flag off the bar skips it. A route's focus is still read by
   * its key, never by its position here, which shifts when one is skipped.
   */
  const visible = state.routes.filter((r) => r.name !== 'reels' || REELS_ENABLED);
  /*
   * The log action is drawn before the tab at this position, so it sits in
   * the middle of whatever is shown: Home · Reels · + · Dex · Profile, or
   * Home · Dex · + · Profile with Reels off.
   */
  const fabAt = Math.ceil(visible.length / 2);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 2 }]}>
      <View style={[styles.bar, dark ? styles.barDark : styles.barPaper]}>
        <View style={styles.row} accessibilityRole="tabbar">
          {visible.map((route, at) => {
            const options = descriptors[route.key]?.options ?? {};
            const focused = route.key === focusedKey;
            /*
             * The glyph and its label are handed one ink, so a resting tab
             * is one grey, not a pale icon over a darker caption.
             */
            const color = focused ? skin.active : skin.rest;
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
                <ProfileFace profile={me} focused={focused} ring={skin.ring} />
              ) : (
                (options.tabBarIcon?.({ focused, color, size: GLYPH }) ?? (
                  <Icon name={route.name as TabName} filled={focused} color={color} size={GLYPH} />
                ))
              );

            return (
              <React.Fragment key={route.key}>
                {at === fabAt ? (
                  <CentreAction
                    dark={dark}
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
                <Pressable
                  onPress={onPress}
                  accessibilityRole="button"
                  accessibilityLabel={options.tabBarAccessibilityLabel ?? options.title ?? route.name}
                  accessibilityState={{ selected: focused }}
                  hitSlop={4}
                  style={styles.item}>
                  <View style={styles.glyphBox}>
                    {glyph}
                    {options.tabBarBadge ? (
                      <View style={[styles.badge, { backgroundColor: skin.badge }]} />
                    ) : null}
                  </View>
                  <Text
                    style={[
                      styles.label,
                      { color, fontFamily: focused ? fonts.bodySemiBold : fonts.bodyMedium },
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
                    maxFontSizeMultiplier={1.3}>
                    {label}
                  </Text>
                </Pressable>
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
   * its labels.
   */
  bar: {
    minHeight: layout.tabBar,
    justifyContent: 'center',
    borderRadius: radius.card,
    borderWidth: stroke.edge,
  },
  barPaper: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    ...elevation.bar,
  },
  /* No shadow on the dark bar: a shadow on near-black ground is no lift. */
  barDark: {
    backgroundColor: colors.reelBar,
    borderColor: colors.reelControlBorder,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: BAR_PAD,
  },
  /*
   * `flex: 1` for the tabs and the action alike: five equal slots (four
   * with Reels off) are a property of the layout, not of a computed width
   * that could drift from it.
   */
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
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
  },
  faceRing: {
    width: GLYPH_BOX,
    height: GLYPH_BOX,
    // round-ok: avatar
    borderRadius: radius.round,
    borderWidth: 1.5,
    borderColor: 'transparent',
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
    width: 48,
    height: 36,
    borderRadius: radius.control,
    borderWidth: stroke.edge,
    borderColor: colors.wineDeep,
    backgroundColor: colors.wine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* A fill change, not a scale: controls answer a press with their fill. */
  fabPressed: { backgroundColor: colors.wineDeep },
  /* The edge takes the fill's colour: no visible edge on the dark bar. */
  fabDark: { backgroundColor: colors.reelInk, borderColor: colors.reelInk },
  fabDarkPressed: { backgroundColor: colors.reelInkMuted, borderColor: colors.reelInkMuted },
});
