import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type TabName } from '@/components/icons';
import { Avatar, haptic } from '@/components/ui';
import type { ProfileRow } from '@/lib/database.types';
import { colors, layout, radius } from '@/constants/theme';
import { useAuth } from '@/store/auth';

/* ==================================================================== */
/* The tab bar                                                          */
/*                                                                      */
/* Five glyphs and nothing else (layout spec 4: "10 → 5 elements").     */
/* Home · Dex · + · My Bar · Profile, on an opaque page slab docked to  */
/* the foot, with no rule, no shadow and no floating card. The name     */
/* kept its file: it is still the bar TopTabs draws.                    */
/*                                                                      */
/* NO LABELS ON SCREEN, EVERY LABEL SPOKEN. Each tab keeps its name as  */
/* its accessibilityLabel ("Home", "Dex, your collection" …), so        */
/* VoiceOver reads exactly what it did; only the 11pt captions went.    */
/*                                                                      */
/* WHERE YOU ARE, WITHOUT COLOUR ALONE. The active tab's glyph is the   */
/* same glyph filled, in ink; a resting one is the outline in muted.    */
/* Shape and tone both change. The + is the bar's only filled key, an   */
/* ink rectangle, so it reads as a different KIND of control: posting   */
/* is a thing you do, not a place you are.                              */
/*                                                                      */
/* MOVED BY THE PAGER, NEVER BY A JS CLOCK. Changing tab is the pager's */
/* ((tabs)/_layout.tsx): a swipe carries the page under the finger and  */
/* a tap pages across natively (a cut under Reduce Motion). The filled  */
/* glyph switches once the page settles. Nothing here animates.         */
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
 * tabs, which type their tab bar's props as `any`, so we declare only the
 * shape we consume. TabView also hands its bar `position`, `layout` and
 * `jumpTo`; none is read.
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
};

/**
 * The post action: an ink rectangle seated in the bar before My Bar. Not a
 * route: posting a drink is a thing you do, and a tab for it would be a
 * permanently unselectable item in a bar whose job is where you are. 52 x
 * 38 with 3pt of hitSlop to 44. No haptic: it opens a full-screen window,
 * which is answer enough.
 */
function CentreAction({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.slot}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Post a drink"
        accessibilityHint="Take a photo and pick what you drank"
        hitSlop={{ top: 3, bottom: 3 }}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}>
        <Icon name="plus" size={22} color={colors.onInk} filled />
      </Pressable>
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

export function FloatingTabBar({ state, descriptors, navigation }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // The signed-in account's own row only: a stale row from a previous
  // account must never put someone else's face on this tab.
  const me = useAuth((s) => (s.session && s.profile?.id === s.session.user.id ? s.profile : null));

  const focusedKey = state.routes[state.index]?.key;
  /*
   * Every route in the navigator's state is a page of the pager and a slot
   * here, in the same order (Reels is not in the state while it is off).
   * The + is drawn immediately before My Bar, found by name; were My Bar
   * ever missing, it falls back to the middle.
   */
  const visible = state.routes;
  const barAt = visible.findIndex((r) => r.name === 'bar');
  const fabAt = barAt >= 0 ? barAt : Math.ceil(visible.length / 2);

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
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
  /* 8pt ink with a 2pt page ring. */
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
  fab: {
    width: 52,
    height: 38,
    borderRadius: radius.control,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* A fill change, not a scale: controls answer a press with their fill. */
  fabPressed: { backgroundColor: colors.inkPressed },
});
