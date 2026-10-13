import { createContext, type ReactNode, useContext } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CatalogueFace } from '@/components/auth/CatalogueFace';
import { Print } from '@/components/cabinet';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { useScrollEdges } from '@/components/log/scrollEdges';
import { colors, layout, space, stroke, tabular, textRole } from '@/constants/theme';
import { formatCount, getDrink, TOTAL } from '@/data';
import type { Drink } from '@/types';

/* ==================================================================== */
/* The sign-in page                                                     */
/*                                                                      */
/* Every step a new person walks through (sign-in, the username, Find   */
/* your people, Welcome back) stands on one frame. In v3 it was a paper */
/* sheet over the cabinet's wine lining, with three mounted drinks      */
/* peeking above it. In v4 it is a plain white page (white spec,        */
/* "Sign-in"; specs/v4-changes.md 7): the step's bar at the top, the    */
/* large Playfair wordmark on the first step, the form, and nothing     */
/* behind it. Jan: "make everything look sleek".                        */
/*                                                                      */
/* The names are the v3 ones (CabinetSheet, CabinetBackdrop's file) so  */
/* every step that draws on this frame kept its import; the cabinet     */
/* itself is gone.                                                      */
/*                                                                      */
/* THE BAR. Fixed at the top, under the status bar, on the page. Its    */
/* 1pt rule shows once the form scrolls under it, as on every v4 bar.   */
/* AuthTitleBar reads that from this frame (AuthPageScrolled), so the   */
/* steps pass their bar unchanged. A pinned footer's rule shows only    */
/* while the form runs on under it.                                     */
/*                                                                      */
/* STATIC. Nothing here starts invisible or animates.                   */
/* ==================================================================== */

/**
 * Whether the page's form has scrolled under its bar, for the bar's rule.
 * Null outside the sign-in page (a page sheet's own bar keeps its rule).
 */
const AuthPageScrolled = createContext<boolean | null>(null);
export function useAuthPageScrolled(): boolean | null {
  return useContext(AuthPageScrolled);
}

/** The wordmark's Dynamic Type cap (spec 6.5). */
const WORDMARK_CAP = 1.2;
/** The picks' heading and its line cap here, as a Dex card's name does. */
const NAME_CAP = 1.3;

/**
 * Above this text size, or below this height (the SE class), the first
 * step leaves the wordmark out: the lede alone wraps to four lines at the
 * accessibility sizes and would push the ways in under the tab bar, which
 * is the thing the first step must never do.
 */
const FULL_MAX_FONT_SCALE = 1.4;
const FULL_MIN_HEIGHT = 740;

/** The picks' prints: three across, never wider than 96 (a 288px decode at 3x). */
const PICK = 96;
const PICK_GAP = space.sm;
const PICKS_SHOWN = 3;

/**
 * What the picks head shows, from the taste store (store/taste): the
 * saved drinks, newest first, and the six the onboarding picked, in
 * their order.
 */
export interface PicksHead {
  saved: readonly string[];
  picks: readonly string[];
}

/**
 * The three prints: saved first, then the picks, each drink once. Only
 * drinks the catalogue still knows, so a renamed one drops out of the row
 * rather than leaving a gap; fewer than three is drawn as it is, never
 * padded with drinks the person did not choose.
 */
function picksShown({ saved, picks }: PicksHead): Drink[] {
  const shown: Drink[] = [];
  for (const id of [...saved, ...picks]) {
    if (shown.length === PICKS_SHOWN) break;
    const drink = getDrink(id);
    if (drink && !shown.some((d) => d.id === drink.id)) shown.push(drink);
  }
  return shown;
}

/**
 * What sits above the form.
 *
 *   full     the first step: "Sipply" in wordmarkLg and the catalogue's
 *            size as the invitation. On a short window or at an
 *            accessibility text size, nothing (the bar says the step).
 *   compact  every other step: nothing. The bar's title is the step.
 *   picks    Home's first step after the onboarding's "Not now" (specs/
 *            v4.1-changes.md 1.6): "Your picks", how many drinks are saved
 *            (or that they wait on this phone), and three of them as
 *            colour prints, the only colour on the page and the person's
 *            own. VoiceOver reads the heading and its line as one; the
 *            prints are decorative.
 */
function Backdrop({ variant, picks }: { variant: 'full' | 'compact'; picks?: PicksHead }) {
  const { width, height, fontScale } = useWindowDimensions();
  const roomy = height >= FULL_MIN_HEIGHT && fontScale <= FULL_MAX_FONT_SCALE;

  if (picks) {
    const n = picks.saved.length;
    // "saved", not "saved to try": the count is every saved drink, and a drink page's bookmark saves caught ones too.
    const line = n >= 1 ? `${formatCount(n)} saved` : 'Kept on this phone until you sign in';
    const across = width - 2 * layout.gutter - (PICKS_SHOWN - 1) * PICK_GAP;
    const side = Math.min(PICK, Math.floor(across / PICKS_SHOWN));
    const shown = picksShown(picks);
    return (
      <View style={styles.head}>
        <View accessible accessibilityLabel={`Your picks, ${line}`}>
          <Text maxFontSizeMultiplier={NAME_CAP} style={[textRole.bodyStrong, styles.ink, styles.centre]}>
            Your picks
          </Text>
          <Text maxFontSizeMultiplier={NAME_CAP} style={[textRole.small, tabular, styles.muted, styles.centre]}>
            {line}
          </Text>
        </View>
        {roomy && shown.length > 0 ? (
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.picks}>
            {shown.map((drink) => (
              <Print key={drink.id} width={side} height={side}>
                <CatalogueFace drink={drink} width={side} height={side} />
              </Print>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  if (variant === 'compact' || !roomy) return null;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.head}>
      <Text maxFontSizeMultiplier={WORDMARK_CAP} style={[textRole.wordmarkLg, styles.ink, styles.centre]}>
        Sipply
      </Text>
      <Text style={[textRole.body, styles.muted, styles.centre, styles.lede]}>
        {`${formatCount(TOTAL)} drinks. Start your Dex with the next one.`}
      </Text>
    </View>
  );
}

/**
 * A step of sign-in or onboarding, on the white page.
 *
 *   bar      the step's own bar (AuthTitleBar, or a ScreenTopBar), fixed
 *            at the top under the status bar
 *   head     the wordmark on the first step, or the person's picks
 *            (Backdrop, above)
 *   body     the step, as it was
 *
 * Bottom clearance: the tab bar sits under every screen this is drawn in
 * (AuthGate renders it in the Home and Profile scenes), so the body ends
 * TAB_BAR_CLEARANCE above the home indicator, plus the space.md every tab
 * screen adds, and the last row can scroll out from under the bar.
 *
 * `footer` (Find your people's Continue) is pinned under the scroll view
 * with the same clearance, so the step's way out is always in view; the
 * keyboard is then met by the scroll view's own insets instead of a
 * KeyboardAvoidingView, so the footer stays put rather than riding up.
 *
 * `backdrop` and `picks` choose the head (Backdrop).
 */
export function CabinetSheet({
  backdrop,
  picks,
  bar,
  children,
  footer,
  contentStyle,
}: {
  backdrop: 'full' | 'compact';
  /** The person's picks and saved drinks: the head shows them in place of the wordmark. */
  picks?: PicksHead;
  /** The step's title bar. */
  bar: ReactNode;
  children: ReactNode;
  /** Pinned under the form, always in view. */
  footer?: ReactNode;
  /** The step body's own padding. */
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const clearance = insets.bottom + TAB_BAR_CLEARANCE + space.md;
  const edges = useScrollEdges();

  const scroll = (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: footer == null ? clearance : space.xl }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets={footer != null}
      onScroll={edges.onScroll}
      onLayout={edges.onLayout}
      onContentSizeChange={edges.onContentSizeChange}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={footer == null}>
      <Backdrop variant={backdrop} picks={picks} />
      <View style={contentStyle}>{children}</View>
    </ScrollView>
  );

  const head = <AuthPageScrolled.Provider value={edges.under}>{bar}</AuthPageScrolled.Provider>;

  if (footer != null) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        {head}
        {scroll}
        {/* The pinned way out: a bar at the foot, ruled only while the form runs on under it. */}
        <View style={[styles.footer, edges.moreBelow && styles.footerRuled, { paddingBottom: clearance }]}>
          {footer}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {head}
      {scroll}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  centre: { textAlign: 'center' },

  /* The head: 32 under the bar, and the body's own top padding under it. */
  head: { alignItems: 'center', paddingTop: space.xxl, paddingHorizontal: layout.gutter, gap: space.xs },
  lede: { marginTop: space.sm },
  picks: { flexDirection: 'row', justifyContent: 'center', gap: PICK_GAP, marginTop: space.xl },

  footer: {
    paddingHorizontal: layout.gutter,
    paddingTop: space.md,
    // Always laid out, transparent until the form runs under it, so showing it moves nothing.
    borderTopWidth: stroke.edge,
    borderTopColor: 'transparent',
    backgroundColor: colors.bg,
  },
  footerRuled: { borderTopColor: colors.line },
});
