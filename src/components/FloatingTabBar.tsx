import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/glass';
import { Icon, type TabName } from '@/components/icons';
import { haptic } from '@/components/ui';
import { colors, fonts, radius, space } from '@/constants/theme';

/* ==================================================================== */
/* Floating tab bar                                                     */
/*                                                                      */
/* Replaces the stock expo-router bar, which was an opaque slab welded  */
/* to the bottom edge with a 1px top border. Two problems with that:    */
/* it cut the page off rather than floating over it, and switching tabs */
/* was a hard cut — two icons toggling color, nothing in between.       */
/*                                                                      */
/* Here the selected tab is its icon drawn solid, icon and label in     */
/* wine, and that is the whole signal. The bar once also slid a         */
/* wine-wash pill between tabs and sprang the icon up and larger; four  */
/* cues for one state is a bar shouting "active", and with Reduce       */
/* Motion on, where the icon never scaled or lifted, it read perfectly  */
/* well. The movement that says the section changed belongs to the      */
/* page, which shifts in the direction of travel ((tabs)/_layout.tsx).  */
/* ==================================================================== */

/**
 * Vertical space the floating bar occupies above the bottom edge.
 *
 * Tab screens must add `insets.bottom + TAB_BAR_CLEARANCE` to their
 * bottom padding — the bar floats OVER content now, so the last list row
 * would otherwise sit under frosted glass.
 */
export const TAB_BAR_CLEARANCE = 84;

/** Inner horizontal padding of the bar. */
const BAR_PAD = 6;


/*
 * The centre action sits BETWEEN the tabs rather than being one of them.
 *
 * It is not a route: logging a pour is a thing you do, not a place you
 * are, and making it a fifth tab would put a permanently-unselectable
 * item in a bar whose whole job is showing where you are. It is rendered
 * before the tab at this index, so the row reads Home · Dex · + · Stats ·
 * Profile.
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

/**
 * The centre action — a filled wine disc seated in the bar, centred on it.
 *
 * Bigger than a tab and filled where the tabs are outlined, so it reads as
 * a different KIND of control rather than a fifth tab drawn slightly
 * differently, which is what it is. It stays inside the bar's edge: an
 * earlier overhang lifted it clear of the top and read as a button
 * hovering ABOVE the bar rather than one belonging to it, and GlassSurface
 * clips its children to the rounded shape in any case.
 *
 * No label under it, unlike the tabs. The tabs are labelled because they
 * are destinations you need to recognise; a plus needs no gloss, and a
 * fifth word would rebuild the visual rhythm the disc just broke.
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
             * textMuted, not textFaint. These labels are 11pt — small text,
             * which WCAG holds to 4.5:1 — and textFaint measures 3.82:1 on
             * the bar's fill. check-contrast never caught it because it only
             * audits textFaint at the 3.0 large-text threshold, which is the
             * right rule for the token and the wrong one for this use of it.
             * textMuted is 5.98:1 here. The icon is handed the same colour,
             * so a resting tab is one grey, not a pale icon over a darker
             * caption.
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
                  order is Home · Dex · action · Stats · Profile.
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
                  <View style={styles.itemInner}>
                    {options.tabBarIcon?.({ focused, color, size: 24 }) ?? (
                      <Icon
                        name={route.name as TabName}
                        filled={focused}
                        color={color}
                        size={24}
                      />
                    )}
                    <Text
                      style={[styles.label, { color }]}
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
                  </View>
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
     * border, `0 12px 30px rgba(43,35,34,.14)`. The material lives in
     * `glass.fill` and the shadow is `elevation.raisedBox`, which
     * GlassSurface applies; the geometry is here.
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
     * The disc (52) is taller than a tab (about 46), so the slot borrows 6
     * of the row's 9pt padding at the top AND the bottom. Its margin box
     * stays shorter than the tabs, so it never grows the row past the 64pt
     * the handoff specifies, and the slot it stretches to is centred on
     * the bar: about 6pt of air above the disc and 6pt below. Negative
     * margins rather than a transform, so the layout box moves with the
     * disc and it cannot end up overlapping the icons either side at
     * narrow widths. A margin on the top alone, as this was, left 3.6pt
     * above and 9.6pt below — off-centre against the bar and the row.
     */
    marginTop: -6,
    marginBottom: -6,
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
     * through the bar that the disc comes up through, so a disc seated
     * inside the bar looks set INTO it rather than stuck on it. It also
     * guarantees a clean edge against the icons either side no matter how
     * narrow the slot gets.
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
     * Sentence case, 11pt, Inter Medium, no tracking — the same quiet
     * caption iOS sets under its own tab icons. At this size a word fits
     * its fifth of the bar with air either side, so the icon above it
     * leads and the label only confirms it.
     */
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    letterSpacing: 0,
  },
});
