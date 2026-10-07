import { type ReactNode } from 'react';
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

import { Mount, MOUNT, MountWindow } from '@/components/cabinet';
import { DrinkFace, FACE_FILL } from '@/components/DexCard';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Grain } from '@/components/Grain';
import { FocusedStatusBar } from '@/components/ScreenTopBar';
import { colors, elevation, layout, radius, space, stroke, textRole } from '@/constants/theme';
import { formatCount, getDrink, TOTAL } from '@/data';

/* ==================================================================== */
/* The sign-in sheet over the cabinet                                   */
/*                                                                      */
/* The three steps a new person walks through (sign-in, the username,   */
/* Welcome) share one frame (specs/v3-cabinet.md 9.11): the cabinet's   */
/* wine lining behind, and Jan's paper sheet laid over it, its title    */
/* bar sticking under the status bar while the form scrolls. The sheet's */
/* own layout is the step's and is not touched here; this file only      */
/* decides what lies behind it.                                          */
/*                                                                      */
/* WHY ONE SHELL, AND THE STATUS BAR. The lining runs from the top of    */
/* the screen, so the status bar is light, and the strip above the       */
/* sticky bar is always lining (the shell's own padding, outside the     */
/* scroll view), so light glyphs never land on the paper bar. Putting    */
/* the backdrop inside a paper screen under its bar, as a first draft    */
/* did for the username and Welcome steps, would have.                   */
/*                                                                      */
/* ONE GRAIN UNDER THE LINING. The shell's ground carries the lining     */
/* grain, and the backdrop draws on it with no fill of its own: a second */
/* grain layer would double the texture over the backdrop and seam it    */
/* against the status-bar strip above.                                   */
/*                                                                      */
/* STATIC. The backdrop is a choice made from the window, never an       */
/* animation, and nothing here starts invisible.                         */
/* ==================================================================== */

/* ==================================================================== */
/* CabinetBackdrop                                                      */
/* ==================================================================== */

/** The wordmark roles' Dynamic Type cap (spec 6.5). */
const WORDMARK_CAP = 1.2;

/**
 * The three drinks in the cabinet behind the first step: real catalogue
 * drinks, all three photographed, each a collected mount (mat, edge and
 * seat, the same frame every collected card has). The middle one is raised.
 */
const FEATURED = [
  { id: 'negroni', raised: false },
  { id: 'zombie', raised: true },
  { id: 'last-word', raised: false },
] as const;

/** A feature mount at full size, before a narrow phone scales it down to fit three. */
const CARD = { width: 116, height: 150 } as const;
const CARD_GAP = 14;
/** How much higher the middle card sits. */
const RAISE = 14;
/**
 * Room above the cards inside their clip, so the raised card's seat
 * shadow is not cut flat along its top. Taken out of the 24pt above them.
 */
const SHADOW_ROOM = 12;

/**
 * Above this text size the first step uses the compact backdrop too:
 * xxxLarge (1.35) is the largest size short of the accessibility sizes,
 * where the lede alone wraps to four lines and would push the form off
 * the first screen, which is the thing this choice exists to prevent.
 */
const FULL_MAX_FONT_SCALE = 1.4;

/**
 * How much of the cards shows above the sheet: the raised card shows all
 * of it, the other two this less RAISE. Chosen so the sign-in controls
 * stay above the floating tab bar at rest: 96pt on Pro Max and Plus
 * heights (900pt and up), 56pt on 6.1-inch phones, so Continue and the
 * first two ways in stay clear of the bar. Null (the compact backdrop)
 * below 740pt, the SE class, where no card fits.
 */
function cardBand(height: number, fontScale: number): number | null {
  if (height < 740 || fontScale > FULL_MAX_FONT_SCALE) return null;
  return height >= 900 ? 96 : 56;
}

/**
 * What lies behind the sheet, drawn on the lining it is placed on.
 *
 * `full` (the first step of sign-in, where the window has room): the
 * large wordmark, the catalogue's size as an invitation, and three mounted
 * drinks whose tops show above the sheet, so the cabinet is the first
 * thing a new person sees. `compact` (every other step, and the first one
 * on a short window or at an accessibility text size): the wordmark in a
 * band.
 *
 * Decorative and untouchable: the sheet's title bar says where you are,
 * and a pan on the backdrop scrolls the form.
 */
export function CabinetBackdrop({ variant }: { variant: 'full' | 'compact' }) {
  const { width, height, fontScale } = useWindowDimensions();
  const band = variant === 'full' ? cardBand(height, fontScale) : null;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={band == null ? styles.compact : styles.full}>
      {band == null ? (
        <Text maxFontSizeMultiplier={WORDMARK_CAP} style={[textRole.wordmark, styles.wordmark]}>
          Sipply
        </Text>
      ) : (
        <>
          <Text maxFontSizeMultiplier={WORDMARK_CAP} style={[textRole.wordmarkLg, styles.wordmark]}>
            Sipply
          </Text>
          <Text style={[textRole.prose, styles.lede]}>
            {`${formatCount(TOTAL)} drinks. Start your Dex with the next one.`}
          </Text>
          <FeatureCards band={band} windowWidth={width} />
        </>
      )}
    </View>
  );
}

/**
 * The three mounts, clipped at `band` so only their tops show: the sheet
 * begins exactly where they are cut, which reads as the sheet lying over
 * them. Three 116pt cards fit from a 408pt column; a narrower phone scales
 * them down, keeping their shape.
 *
 * Memory: three lit windows of about 90 x 124pt, decoded at that size.
 */
function FeatureCards({ band, windowWidth }: { band: number; windowWidth: number }) {
  const fit = Math.floor((windowWidth - 2 * layout.gutter - 2 * CARD_GAP) / 3);
  const cardW = Math.min(CARD.width, fit);
  const cardH = Math.round((cardW * CARD.height) / CARD.width);
  const inset = 2 * (stroke.edge + MOUNT.feature.padding);
  const windowW = cardW - inset;
  const windowH = cardH - inset;

  return (
    <View style={[styles.cards, { height: SHADOW_ROOM + band }]}>
      {FEATURED.map(({ id, raised }) => {
        const drink = getDrink(id);
        // A renamed drink drops out of the row rather than breaking the screen.
        if (!drink) return null;
        return (
          <Mount
            key={id}
            state="mounted"
            size="feature"
            onLining
            style={{ width: cardW, height: cardH, marginTop: raised ? 0 : RAISE }}>
            <MountWindow height={windowH} state="mounted">
              <DrinkFace drink={drink} mode="lit" width={windowW} height={windowH} style={FACE_FILL} />
            </MountWindow>
          </Mount>
        );
      })}
    </View>
  );
}

/* ==================================================================== */
/* CabinetSheet                                                         */
/* ==================================================================== */

/** The sheet's top, the scroll view's second child, sticks. */
const STICKY = [1];
/**
 * How far the sheet's paper runs past the foot of the form, so a bounce
 * at the bottom shows paper and not the lining behind. Taken back out by
 * a negative margin, so it never adds scroll.
 */
const OVERSCROLL = 1000;

/**
 * A step of sign-in or onboarding, as a paper sheet over the cabinet.
 *
 *   ground   lining, with the lining grain, from the top of the screen;
 *            the status bar light while the screen is focused
 *   [0]      CabinetBackdrop, `full` or `compact`
 *   [1]      the sheet's top: the step's own bar (AuthTitleBar with
 *            insetTop={false}, or ScreenTopBar inset="sheet"), clipped to
 *            12pt top corners; it sticks under the status bar while the
 *            form scrolls
 *   [2]      the sheet's body: paper and its grain, growing to the foot
 *            of a short step, holding the step as it was
 *
 * The bar's own paper and grain are the sheet top's: a ScreenTopBar draws
 * both, so the top adds no grain of its own.
 *
 * Bottom clearance: the tab bar floats over every screen this is drawn in
 * (AuthGate renders it in the Home and Profile scenes), so the body ends
 * TAB_BAR_CLEARANCE above the home indicator, plus the space.md every tab
 * screen adds, and the last row can scroll out from under the bar.
 * Without the space.md a pinned footer's button cleared a notchless
 * phone's bar by 6pt, close enough to read as part of it.
 *
 * `footer` (Welcome's Continue) is pinned under the scroll view on paper,
 * with the same clearance, so the step's way out is always in view; the
 * keyboard is then met by the scroll view's own insets instead of a
 * KeyboardAvoidingView, so the footer stays put rather than riding up.
 *
 * Route screens only: the status bar follows the screen's focus.
 */
export function CabinetSheet({
  backdrop,
  bar,
  children,
  footer,
  contentStyle,
}: {
  backdrop: 'full' | 'compact';
  /** The step's title bar, set for a sheet (no status-bar inset of its own). */
  bar: ReactNode;
  children: ReactNode;
  /** Pinned under the form, always in view. */
  footer?: ReactNode;
  /** The step body's own padding. */
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const clearance = insets.bottom + TAB_BAR_CLEARANCE + space.md;

  const scroll = (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      stickyHeaderIndices={STICKY}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets={footer != null}
      showsVerticalScrollIndicator={footer == null}>
      {/*
        The backdrop also casts the sheet's shadow: a strip of paper the
        sheet's top lies exactly over, casting upward onto the cards. On
        the sticky top itself the shadow would spread down over the form
        too (a sticky header is lifted over the content below it), and
        iOS takes a shadow away from a view that clips, which the top's
        rounded corners need.
      */}
      <View>
        <CabinetBackdrop variant={backdrop} />
        <View pointerEvents="none" style={styles.sheetShadow} />
      </View>
      {/* ScrollView moves a sticky child's style onto its own wrapper, clip included. */}
      <View style={styles.sheetTop}>{bar}</View>
      <View style={[styles.body, { paddingBottom: OVERSCROLL + (footer == null ? clearance : 0) }]}>
        <Grain />
        <View style={contentStyle}>{children}</View>
      </View>
    </ScrollView>
  );

  if (footer != null) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Grain tone="lining" />
        <FocusedStatusBar style="light" />
        {scroll}
        {/* A drawn edge between the form and the pinned way out (01: every edge is drawn). */}
        <View style={[styles.footer, { paddingBottom: clearance }]}>
          <Grain />
          {footer}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Grain tone="lining" />
      <FocusedStatusBar style="light" />
      {scroll}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  /* CabinetBackdrop */
  full: { alignItems: 'center', paddingTop: space.xl },
  compact: { alignItems: 'center', paddingTop: space.md, paddingBottom: 18 },
  wordmark: { color: colors.onLining, textAlign: 'center' },
  lede: {
    color: colors.onLiningMuted,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: layout.gutter,
  },
  cards: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    columnGap: CARD_GAP,
    marginTop: space.xl - SHADOW_ROOM,
    paddingTop: SHADOW_ROOM,
    overflow: 'hidden',
  },

  /* CabinetSheet */
  screen: { flex: 1, backgroundColor: colors.lining },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  sheetShadow: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    height: 2 * radius.card,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    ...elevation.sheet,
  },
  sheetTop: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    overflow: 'hidden',
  },
  body: { flexGrow: 1, backgroundColor: colors.bg, marginBottom: -OVERSCROLL },
  footer: {
    paddingHorizontal: layout.gutter,
    paddingTop: space.md,
    borderTopWidth: stroke.edge,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
});
