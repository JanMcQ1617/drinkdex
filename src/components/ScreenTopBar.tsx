import { useIsFocused } from 'expo-router';
import { StatusBar, type StatusBarStyle } from 'expo-status-bar';
import React, {
  createContext,
  isValidElement,
  useContext,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrassRail } from '@/components/brass/rules';
import { Grain } from '@/components/Grain';
import { Icon, type IconName } from '@/components/icons';
import { colors, fonts, layout, radius, space, stroke, textRole } from '@/constants/theme';
import { textWidth } from '@/lib/textFit';

/* ==================================================================== */
/* The top bar                                                          */
/*                                                                      */
/* ONE BAR FOR EVERY SCREEN. There were eight hand-built ones, in three */
/* title sizes, two fonts and two alignments, so moving between two     */
/* screens changed the furniture as well as the content. This is the    */
/* only one: a 44pt row on its ground, a centred Inter title, and at    */
/* most one control per side (two on the right, `rightSlots={2}`, for   */
/* Home's Tournaments and Activity).                                    */
/*                                                                      */
/* TWO GROUNDS. `tone="paper"` (the default) is the cream page with its */
/* own paper Grain, since grain is no longer one overlay over the app   */
/* and an ungrained opaque bar would read as a flat band over a grained */
/* page. `tone="lining"` is the cabinet's wine (Home's head band): the  */
/* lining fill and grain, bone ink, and a light status bar while the    */
/* screen is focused. Its glyph buttons learn the tone from context.    */
/*                                                                      */
/* `ground="clear"` keeps the tone's inks and drops the ground itself:  */
/* no fill, no grain, no rule, for a bar that floats over a band its    */
/* screen draws (Home's, which slides away on scroll). A clear lining   */
/* bar still asks for the light status bar.                             */
/*                                                                      */
/* No blur, no glass, no Playfair. A caller may hand a wordmark in as   */
/* `titleNode` (Home does); nothing else sets the title in the display  */
/* face, which is kept for the wordmark and drink names.                */
/*                                                                      */
/* THE RULE IS ONE SIGNAL, DRAWN ONCE. A 1pt rule along the bottom      */
/* (`line` on paper, `liningLip` on lining) says "content is scrolling  */
/* under me". It switches instantly when the list crosses its threshold */
/* (useScrolledPast), not on every frame and not through an animation,  */
/* and on a solid bar it is always laid out (transparent at rest) so    */
/* turning it on never moves the screen by a point. A clear bar has     */
/* none.                                                                */
/*                                                                      */
/* ON LINING THE RULE IS BRASS (v3.3 Brass D10): a 3pt rail of lit      */
/* brass, brass and shade over the 1pt border and the row's last 2pt    */
/* (where nothing is drawn), so it too moves nothing when it appears.   */
/* Paper keeps its 1pt `line`.                                          */
/* ==================================================================== */

/** Side slots: a 44pt glyph button with 4pt to the screen edge, and 4pt spare. */
const SIDE = 52;
/** A text button's narrowest side slot: its 72pt minimum plus the same margins. */
const SIDE_WIDE = 80;
/** Two glyph buttons side by side (`rightSlots={2}`): 96. */
const SIDE_DOUBLE = 2 * layout.hit + 8;
/** The title keeps this clear of the wider side, so it never runs under a side control. */
const TITLE_GAP = 4;
/** A bar's words grow with Larger Text only so far (their maxFontSizeMultiplier). */
const BAR_TEXT_SCALE_CAP = 1.3;
/**
 * Spare room for the strong (SemiBold) word, as the v3.3 spec sets it.
 * textFit's Inter classes are already costed on SemiBold and run wide
 * ("Cancel" estimates 61pt against 52.5 drawn), so this is margin on a
 * margin; it costs a strong side ~4pt of title room at the default size.
 */
const SEMIBOLD_SET = 1.06;
/** iOS page sheets draw their own grabber area; the bar starts just under it. */
const SHEET_INSET = space.sm;

export type TopBarTone = 'paper' | 'lining';

/**
 * The bar's ground, for the controls drawn on it. Context rather than a
 * prop on every button: a screen hands its buttons in as `left`/`right`
 * nodes, and a wine-on-lining glyph (1.22:1) is what a forgotten prop
 * would leave behind.
 */
const TopBarToneContext = createContext<TopBarTone>('paper');

export interface ScreenTopBarProps {
  /** The bar's title, and its spoken name even when `titleNode` replaces the text. */
  title: string;
  /** md: 17/22, pushed and modal screens. lg: 20/26, a root screen's own name. */
  size?: 'md' | 'lg';
  left?: ReactNode;
  right?: ReactNode;
  /** The 1pt rule along the bottom: on while content scrolls under the bar. Ignored on a clear bar. */
  showRule: boolean;
  /** Drawn in place of the title text (Home's wordmark). `title` stays the spoken name. */
  titleNode?: ReactNode;
  /**
   * 'safe' (default): below the status bar. 'sheet': 8pt, inside an iOS
   * page sheet. 'none': no top padding, for a bar its screen places under
   * a status strip of its own (Home).
   */
  inset?: 'safe' | 'sheet' | 'none';
  /**
   * So a multi-step screen can move VoiceOver focus to the title on each
   * step. It is attached to the title text, so it stays unset on a bar
   * whose `titleNode` replaces that text.
   */
  titleRef?: React.Ref<Text>;
  /**
   * 'paper' (default): the cream page. 'lining': the cabinet's wine, with
   * bone ink, the lining's grain and a light status bar while focused.
   */
  tone?: TopBarTone;
  /**
   * 'solid' (default): the bar's ground, grain and rule. 'clear': no
   * ground, no grain, and `showRule` is ignored, for a bar that floats
   * over its own band (Home). The tone still picks the inks.
   */
  ground?: 'solid' | 'clear';
  /**
   * 2: the right side holds two glyph buttons (Home: Tournaments and
   * Activity), handed in together as `right`. The title's insets take the
   * wider side, so the wordmark stays centred on the screen.
   */
  rightSlots?: 1 | 2;
}

function isTextButton(node: ReactNode): node is ReactElement<TopBarTextButtonProps> {
  return isValidElement(node) && node.type === TopBarTextButton;
}

/*
 * A text side is as wide as its word, at the size it is drawn. It was a
 * fixed 80pt: 4pt to the edge and the button's 12 + 12 padding left the
 * label 52pt, and "Cancel" in Inter 16 is 52.5pt at the default text
 * size and up to 1.3x that at Larger Text, so it cut to "Canc…" (Jan,
 * build 17), in every Cancel and Done on a bar. Measured with textFit's
 * conservative estimate at the label's capped size, with SEMIBOLD_SET's
 * spare room when it is the strong (wine) action, +2 for rounding, and
 * never narrower than the old 80, so a short word keeps the layout it had.
 */
function textSideWidth(button: ReactElement<TopBarTextButtonProps>, fontScale: number): number {
  const { label, muted } = button.props;
  const size = textRole.rowTitle.fontSize * Math.min(fontScale, BAR_TEXT_SCALE_CAP);
  const word = Math.ceil(textWidth(label, 'inter', size) * (muted ? 1 : SEMIBOLD_SET));
  return Math.max(SIDE_WIDE, space.xs + 2 * space.md + word + 2);
}

/**
 * A screen's top bar.
 *
 * The title is centred on the SCREEN, not between the controls: it is
 * laid over the row with equal insets from both edges, so a back chevron
 * on one side and nothing on the other cannot push it off centre. A text
 * control on either side ("Cancel"), or two glyphs on the right, widens
 * both insets alike.
 *
 * A pushed screen's back control is
 * `left={<TopBarButton icon="chevronLeft" label="Back" onPress={onBack} />}`.
 */
export function ScreenTopBar({
  title,
  size = 'md',
  left,
  right,
  showRule,
  titleNode,
  inset = 'safe',
  titleRef,
  tone = 'paper',
  ground = 'solid',
  rightSlots = 1,
}: ScreenTopBarProps) {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const leftWidth = isTextButton(left) ? textSideWidth(left, fontScale) : SIDE;
  const rightWidth =
    rightSlots === 2 ? SIDE_DOUBLE : isTextButton(right) ? textSideWidth(right, fontScale) : SIDE;
  // Both insets take the wider side, so the title stays centred on the screen.
  const titleInset = Math.max(leftWidth, rightWidth) + TITLE_GAP;
  const lining = tone === 'lining';
  const clear = ground === 'clear';
  const paddingTop = inset === 'safe' ? insets.top : inset === 'sheet' ? SHEET_INSET : 0;

  return (
    <View
      style={[
        styles.bar,
        lining && styles.barLining,
        { paddingTop },
        clear ? styles.barClear : showRule && !lining && styles.barRuled,
      ]}>
      {/* The ground's own grain, first, so everything in the bar sits on it. A clear bar has no ground to grain. */}
      {clear ? null : <Grain tone={tone} />}
      {/*
        Only the lining bar asks for focus. A paper bar also draws inside
        sheets and pickers (AuthTitleBar) that sit outside any route screen,
        where useIsFocused has no navigator to ask.
      */}
      {lining ? <FocusedStatusBar style="light" /> : null}
      {lining && !clear && showRule ? <BrassRail style={styles.railOverBorder} /> : null}
      <TopBarToneContext.Provider value={tone}>
        <View style={styles.row}>
          <View style={[styles.side, { width: leftWidth }]}>{left}</View>
          <View style={[styles.side, styles.sideRight, { width: rightWidth }]}>{right}</View>
          <View
            pointerEvents="box-none"
            style={[styles.titleSlot, { left: titleInset, right: titleInset }]}>
            {titleNode ? (
              // The node is drawn as given; this wrapper is what VoiceOver
              // reads, as a heading with the bar's title for its name.
              <View accessible accessibilityRole="header" accessibilityLabel={title}>
                {titleNode}
              </View>
            ) : (
              <Text
                ref={titleRef}
                numberOfLines={1}
                /*
                 * Wider sides leave a long title less room at Larger Text,
                 * so it shrinks before it would cut. 0.7, not 0.8: "Host a
                 * tournament" beside "Cancel" at the 1.3 cap on a 375pt
                 * phone is 198pt of Inter SemiBold in 147, so it needs
                 * 0.74 (measured from the bundled font). Every other title
                 * beside a word needs 0.87 or more.
                 */
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                maxFontSizeMultiplier={BAR_TEXT_SCALE_CAP}
                accessibilityRole="header"
                style={[
                  size === 'lg' ? textRole.barTitleLg : textRole.barTitle,
                  styles.title,
                  lining && styles.titleLining,
                ]}>
                {title}
              </Text>
            )}
          </View>
        </View>
      </TopBarToneContext.Provider>
    </View>
  );
}

/**
 * The status bar's style while the screen that renders this is focused,
 * and nothing otherwise.
 *
 * A screen on a dark ground (a lining bar, the drink page, the sign-in
 * shell) needs light glyphs, but tabs stay mounted when they lose focus,
 * and two mounted <StatusBar>s fight: the last one rendered wins, whichever
 * screen is showing. Rendering it only while focused lets the root's dark
 * <StatusBar /> take over again the moment the screen leaves.
 *
 * Route screens only: useIsFocused needs a navigator above it, so never
 * the root overlays (PasswordResetOverlay, CelebrationOverlay).
 */
export function FocusedStatusBar({ style }: { style: StatusBarStyle }) {
  const focused = useIsFocused();
  return focused ? <StatusBar style={style} /> : null;
}

/**
 * A glyph-only control for a bar side: back, close, settings, the Home
 * heart. 44 × 44 with a 26pt glyph in ink (bone on a lining bar), and it
 * dims while held, as iOS's own bar buttons do (a fill behind a bare glyph
 * would read as a button that was never drawn).
 *
 * `badge` puts a dot at the glyph's top-right and says ", new" after the
 * label: 6pt wine on paper; on lining, where wine is 1.22:1, a 7pt bone dot
 * with a 2pt lining ring that cuts it out of the glyph. `children` are
 * drawn inside the glyph's box, over it.
 */
export function TopBarButton({
  icon,
  label,
  onPress,
  filled,
  badge,
  accessibilityHint,
  children,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  filled?: boolean;
  badge?: boolean;
  /** Where the button goes, when its label alone does not say (sign-in's Close). */
  accessibilityHint?: string;
  children?: ReactNode;
}) {
  const lining = useContext(TopBarToneContext) === 'lining';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, new` : label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.glyphButton, pressed && styles.glyphPressed]}>
      <View style={styles.glyphBox}>
        <Icon name={icon} size={26} color={lining ? colors.onLining : colors.text} filled={filled} />
        {badge ? <View style={lining ? styles.badgeLining : styles.badge} /> : null}
        {children}
      </View>
    </Pressable>
  );
}

interface TopBarTextButtonProps {
  label: string;
  onPress: () => void;
  muted?: boolean;
  disabled?: boolean;
  loading?: boolean;
}

/**
 * A word for a bar side: "Cancel" on a modal sheet. Wine, SemiBold, for
 * an action; `muted` (textMuted, regular weight) for the one that backs
 * out. On a lining bar the two are onLining and onLiningMuted, since wine
 * there is 1.22:1. Its slot is sized from the word (textSideWidth), and
 * the title's insets with it (ScreenTopBar).
 *
 * `loading` keeps the label's width and lays a spinner over it, so the
 * bar does not shift while the action runs.
 */
export function TopBarTextButton({ label, onPress, muted, disabled, loading }: TopBarTextButtonProps) {
  const inert = !!disabled || !!loading;
  const lining = useContext(TopBarToneContext) === 'lining';
  const color = lining
    ? muted
      ? colors.onLiningMuted
      : colors.onLining
    : muted
      ? colors.textMuted
      : colors.wine;
  return (
    <Pressable
      onPress={inert ? undefined : onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inert, busy: !!loading }}
      style={({ pressed }) => [
        styles.textButton,
        pressed && styles.textPressed,
        disabled && !loading && styles.disabled,
      ]}>
      <Text
        numberOfLines={1}
        /*
         * The backstop: the slot is sized from an estimate, so if it is
         * ever short iOS shrinks the word a little rather than cutting it.
         */
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        maxFontSizeMultiplier={BAR_TEXT_SCALE_CAP}
        style={[
          textRole.rowTitle,
          { color },
          !muted && styles.textButtonStrong,
          loading && styles.covered,
        ]}>
        {label}
      </Text>
      {loading ? (
        <View style={styles.cover}>
          <ActivityIndicator size="small" color={color} />
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * The top bar's rule signal for a scrolling screen: true once the content
 * has moved `threshold` points (default 1) under the bar.
 *
 * It flips its boolean only when the offset CROSSES the threshold, so a
 * scroll never re-renders the screen per frame. Pass `onScroll` and
 * `scrollEventThrottle={16}` to the list. A rubber-band pull past the top
 * (a negative offset) counts as not scrolled.
 */
export function useScrolledPast(
  threshold = 1,
): [scrolled: boolean, onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void] {
  const [scrolled, setScrolled] = useState(false);
  const last = useRef(false);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const past = e.nativeEvent.contentOffset.y >= threshold;
    if (past === last.current) return;
    last.current = past;
    setScrolled(past);
  };
  return [scrolled, onScroll];
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.bg,
    // Always laid out, transparent at rest: see the header note.
    borderBottomWidth: stroke.edge,
    borderBottomColor: 'transparent',
  },
  barRuled: { borderBottomColor: colors.line },
  barLining: { backgroundColor: colors.lining },
  /* Down over the 1pt border: absolute children are placed inside it. */
  railOverBorder: { bottom: -stroke.edge },
  /* No ground and no rule, so a clear bar is exactly its row's 44pt (plus its inset). */
  barClear: { backgroundColor: 'transparent', borderBottomWidth: 0 },
  row: {
    height: layout.topBar,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  side: {
    height: layout.topBar,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingLeft: space.xs,
  },
  sideRight: { justifyContent: 'flex-end', paddingLeft: 0, paddingRight: space.xs },
  titleSlot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text, textAlign: 'center' },
  titleLining: { color: colors.onLining },

  glyphButton: {
    width: layout.hit,
    height: layout.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphPressed: { opacity: 0.6 },
  glyphBox: { width: 26, height: 26 },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 6,
    height: 6,
    // round-ok: dot
    borderRadius: radius.round,
    backgroundColor: colors.wine,
  },
  /* 7pt bone with a 2pt lining ring: the ring is drawn as the border, so the
     dot's outer size is 11 and it sits 2pt further out than the paper dot. */
  badgeLining: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 11,
    height: 11,
    // round-ok: dot
    borderRadius: radius.round,
    borderWidth: 2,
    borderColor: colors.lining,
    backgroundColor: colors.onLining,
  },

  textButton: {
    minWidth: 72,
    minHeight: layout.hit,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textButtonStrong: { fontFamily: fonts.bodySemiBold },
  textPressed: { opacity: 0.5 },
  disabled: { opacity: 0.42 },
  covered: { opacity: 0 },
  cover: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
