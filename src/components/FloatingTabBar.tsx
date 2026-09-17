import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/glass';
import { Icon, TabIcon, type TabName } from '@/components/icons';
import { haptic } from '@/components/ui';
import { colors, fonts, motion, radius, space } from '@/constants/theme';

/* ==================================================================== */
/* Floating tab bar                                                     */
/*                                                                      */
/* Replaces the stock expo-router bar, which was an opaque slab welded  */
/* to the bottom edge with a 1px top border. Two problems with that:    */
/* it cut the page off rather than floating over it, and switching tabs */
/* was a hard cut — two icons toggling color, nothing in between.       */
/*                                                                      */
/* Here a single wine-wash pill SLIDES between tabs on a spring. One    */
/* object moving is what makes the bar feel continuous instead of       */
/* switched; two things blinking on and off never will.                 */
/*                                                                      */
/* The pill also stretches along its direction of travel and settles    */
/* back — squash-and-stretch, borrowed straight from character          */
/* animation. It is why the movement reads as weight rather than as a   */
/* value being interpolated.                                            */
/* ==================================================================== */

/**
 * Vertical space the floating bar occupies above the bottom edge.
 *
 * Tab screens must add `insets.bottom + TAB_BAR_CLEARANCE` to their
 * bottom padding — the bar floats OVER content now, so the last list row
 * would otherwise sit under frosted glass.
 */
export const TAB_BAR_CLEARANCE = 84;

/** Inner horizontal padding of the bar; the pill's track starts here. */
const BAR_PAD = 6;


/*
 * The centre action sits BETWEEN the tabs rather than being one of them.
 *
 * It is not a route: logging a pour is a thing you do, not a place you
 * are, and making it a fifth tab would put a permanently-unselectable
 * item in a bar whose whole job is showing where you are. It is rendered
 * before the tab at this index, so the row reads Home · Dex · + · Stats ·
 * Profile.
 *
 * Nothing positional is derived from this any more. The pill follows the
 * tabs' MEASURED boxes, so the gap can be any width without the pill
 * needing to know it exists.
 */
const FAB_SLOT = 2;


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

/** One tab. The active icon scales up and lifts a hair off the baseline. */
function TabItem({
  focused,
  reduced,
  children,
}: {
  focused: boolean;
  reduced: boolean;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    if (reduced) return { transform: [{ scale: 1 }, { translateY: 0 }] };
    return {
      transform: [
        // Same spring as the pill, not the shared token: the icon and the
        // pill are one gesture. A pill arriving 1.7x ahead of the icon it
        // carries splits the selection into two visible beats.
        { scale: withSpring(focused ? 1.07 : 1, motion.selection) },
        { translateY: withSpring(focused ? -1.5 : 0, motion.selection) },
      ],
    };
  });
  return <Animated.View style={[styles.itemInner, style]}>{children}</Animated.View>;
}

/**
 * The centre action — a filled wine disc that breaks the top edge of the
 * bar.
 *
 * It overhangs deliberately. A button contained inside the bar reads as a
 * fifth tab drawn slightly differently; one that crosses the edge reads as
 * a different KIND of control, which is what it is. The overhang is why
 * this cannot be `overflow: hidden` anywhere up the tree.
 *
 * No label under it, unlike the tabs. The tabs are labelled because they
 * are destinations you need to recognise; a plus needs no gloss, and a
 * fifth word would rebuild the visual rhythm the overhang just broke.
 */
function CentreAction({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.fabSlot} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Log a pour"
        accessibilityHint="Take a photo and pick what you drank"
        hitSlop={8}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}>
        <Icon name="plus" size={24} color={colors.textOnWine} />
      </Pressable>
    </View>
  );
}

export function FloatingTabBar({ state, descriptors, navigation }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const router = useRouter();
  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 2 }]}>
      <GlassSurface cornerRadius={radius.tab} style={styles.bar}>
        <View style={styles.row}>
          {state.routes.map((route, i) => {
            const options = descriptors[route.key]?.options ?? {};
            const focused = state.index === i;
            /*
             * textMuted, not textFaint. These labels are 9pt — small text,
             * which WCAG holds to 4.5:1 — and textFaint measures 3.09:1 on
             * the bar's fill. check-contrast never caught it because it only
             * audits textFaint at the 3.0 large-text threshold, which is the
             * right rule for the token and the wrong one for this use of it.
             * textMuted is 5.98:1 here.
             */
            const color = focused ? colors.wine : colors.textMuted;
            /*
             * Sentence case. These were UPPERCASE and letterspaced, which is
             * the single most AI-looking habit in this app — it was on the
             * tab labels, the section headings, the dex eyebrow, the stat
             * labels and the locked caption all at once. A tab label is the
             * one place tiny caps are conventional, and it is still four
             * shouted words under four icons that already say the same thing.
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

            return (
              <React.Fragment key={route.key}>
                {/*
                  Rendered BEFORE the tab that sits after the gap, so the
                  order is Home · Dex · action · Stats · Profile and the
                  empty slot the pill skips is the one this fills.
                */}
                {i === FAB_SLOT ? (
                  <CentreAction
                    onPress={() => {
                      haptic.tap();
                      /*
                       * router, not navigation: `log` is a root-stack modal,
                       * and the tab navigator handed to this component can
                       * only reach its own siblings.
                       */
                      router.push('/log');
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
                <TabItem focused={focused} reduced={reduced}>
                  {options.tabBarIcon?.({ focused, color, size: 24 }) ?? (
                    <TabIcon name={route.name as TabName} focused={focused} size={24} />
                  )}
                  <Text style={[styles.label, { color }]} numberOfLines={1}>
                    {label}
                  </Text>
                </TabItem>
              </Pressable>
              </React.Fragment>
            );
          })}
        </View>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  bar: {
    /*
     * The Sipply handoff specifies this bar outright: a 64pt pill inset
     * 16 from each edge, off-white at 92% over a 10px blur, hairline
     * border, `0 12px 30px rgba(43,35,34,.14)`. The material and the
     * shadow live in `glass.fill` and `elevation.raised`; the geometry is
     * here.
     */
    marginHorizontal: 16,
    minHeight: 64,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 9,
    paddingHorizontal: BAR_PAD,
  },
  item: {
    flex: 1,
    paddingVertical: 3,
  },

  /*
   * The slot is the same width as a tab so the five-across rhythm holds;
   * the disc inside it is bigger than the slot is tall and hangs out the
   * top. `justifyContent: center` with a negative margin rather than a
   * transform, so the layout box moves with it and the disc cannot end up
   * overlapping the icons either side at narrow widths.
   */
  /*
   * `flex: 1`, exactly like a tab. The slot used to be given a computed
   * width, which meant the row's even pitch depended on that number being
   * right; letting it flex makes five equal slots a property of the layout
   * rather than of a calculation that could drift from it.
   */
  /*
   * `flex: 1`, exactly like a tab. The slot used to be given a computed
   * width, which meant the row's even pitch depended on that number being
   * right; letting it flex makes five equal slots a property of the layout
   * rather than of a calculation that could drift from it.
   */
  fabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    /*
     * -6, not -16. The larger overhang lifted the disc clear of the bar's
     * top edge, which read as a button hovering ABOVE the bar rather than
     * one seated in it — and it pulled the plus well above the eyeline the
     * four icons share, so the row no longer scanned as one horizontal
     * group. Six points still breaks the edge enough for the ring to
     * register as a cut-through; it just stops the disc leaving.
     */
    marginTop: -6,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.wine,
    alignItems: 'center',
    justifyContent: 'center',
    /*
     * A ring in the PAGE colour, not the bar's.
     *
     * Without it the disc sits directly on the bar's fill and reads as
     * pasted onto the surface. A page-coloured ring reads as a hole cut
     * through the bar that the disc comes up through — which is what the
     * overhang is already claiming, so the two now say the same thing.
     * It also guarantees a clean edge against the icons either side no
     * matter how narrow the slot gets.
     */
    borderWidth: 3,
    borderColor: colors.bg,
    /*
     * Tight and close, not a cloud. At radius 12 / y+6 the shadow spread
     * far enough past the disc to read as a smudge on the cream rather
     * than as lift — the bar it sits on is only 64pt tall, so there is no
     * room for a soft far-throw shadow to resolve.
     */
    shadowColor: colors.lockInk,
    shadowOpacity: 0.18,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  /* Scale, not opacity: a wine disc fading toward cream reads as disabled. */
  fabPressed: { transform: [{ scale: 0.94 }] },
  itemInner: {
    alignItems: 'center',
    gap: space.xs - 1,
  },
  label: {
    /*
     * The brand's letterspaced label, at tab scale — but one point larger
     * and tracked tighter than the brand default. At 9/1.6 the longest
     * label ("PROFILE") sprawled nearly the full slot and left the icons
     * looking crowded by their own captions; 10/0.9 is wider per glyph and
     * narrower overall.
     */
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    letterSpacing: 0,
  },
});
