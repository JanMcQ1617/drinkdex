import React, { isValidElement, useRef, useState, type ReactElement, type ReactNode } from 'react';
import {
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
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

import { inkRoom, lineMarks } from '@/components/details/lineMarks';
import { Paper } from '@/components/details/Paper';
import { PenSwash } from '@/components/details/PenMarks';
import { useTabArrival } from '@/components/details/tabArrival';
import { Icon, type IconName } from '@/components/icons';
import { colors, fonts, layout, radius, space, stroke, textRole } from '@/constants/theme';
import { textWidth } from '@/lib/textFit';

/* ==================================================================== */
/* The top bar                                                          */
/*                                                                      */
/* ONE BAR FOR EVERY SCREEN, and in v4 it holds less (layout spec 4):   */
/* a title or the wordmark, and at most one icon. A pushed screen gets  */
/* a back chevron and no other icon.                                    */
/*                                                                      */
/*   size="lg"  a tab root: the title set LEFT at the gutter in the     */
/*              marker's `tabTitle` (Sedgwick Ave 36/46, v4.10), or in  */
/*              `title` (Archivo 600 28/34) when a person typed it      */
/*              (`userTitle`: your handle), Home's wordmark in its      */
/*              place, and one control (or the quiet count,             */
/*              TopBarCount) right-aligned to the far gutter.           */
/*   size="md"  a pushed screen or a window: back or close on the left, */
/*              the title centred in `barTitle` (17/24), or no visible  */
/*              title at all (`titleVisible={false}`), as the post      */
/*              detail has none: its drink name is the page's title.    */
/*                                                                      */
/* SOLID PAGE, NO FADE. The bar is the page's white. A 1pt `line` rule  */
/* along its foot says "content is scrolling under me": it switches     */
/* when the list crosses its threshold (useScrolledPast), and is always */
/* laid out (transparent at rest), so it moves nothing when it shows.   */
/* `ground="clear"` drops the fill and the rule, for Home's bar, which  */
/* HomeChrome lays over its own ground.                                 */
/*                                                                      */
/* THE SWASH (v4.6, specs/v4.6-details A.3 #4). Under a tab root's      */
/* title (Dex, Saved, your username, My Bar), the logo's pen draws one  */
/* low arc that flicks up at its end, like the y's tail in "sipply": a  */
/* signature, not an underline. Only on an lg bar with a title of its   */
/* own: Home's wordmark already IS the pen, an empty title has nothing  */
/* to sign, and a centred md title (a pushed screen, a window) never    */
/* gets one. Under a tag title (v4.10, specs/v4.10/spec.md T.6) it      */
/* never scales, as the title does not: its box spans 44 to 50 in the   */
/* 52 row, 1 under the title's 3..49 line box, and its ink keeps 2      */
/* clear of the bar's foot. Under a typed title it sits where it always */
/* has, growing in length with the title's text (to the 1.3 cap), never */
/* in weight, and stays 5 clear of the foot rule.                       */
/*                                                                      */
/* IT SIGNS EACH TAB AS IT OPENS (v4.9, specs/v4.9/details B). Jan      */
/* asked for the line he likes to draw itself in each time a tab opens: */
/* TitleSwash, the swash's own child component, alone reads the tab's   */
/* arrival (details/tabArrival) and hands it to the swash's draw-on, so */
/* the bar's hooks stay unconditional and a focus change re-renders the */
/* swash alone. It starts undrawn (a lazy tab mounts behind, mid-drag), */
/* draws in 140ms after the tab lands, rests drawn, and never loops;    */
/* under Reduce Motion it is simply there. Every lg bar with a title is */
/* a tab root, so the arrival is the tabs': a pushed page over the tabs */
/* and the pop back are not a tab opening. TabPlaceholder no longer     */
/* draws a swash: the real bar mounts and signs.                        */
/*                                                                      */
/* THE PAPER (v4.9, A.5), only when a screen asks: `paper` lays the     */
/* paper (details/Paper) as the bar's first child, so the bar's sheet   */
/* meets the page's under it without a step. Since v4.10 the paper is   */
/* the sweep, white to 40% of the window, then easing to #FBFBFB at the */
/* foot (specs/v4.10/spec.md G), and each Paper slices that one window- */
/* anchored picture at its own window y, so a bar, which ends in the    */
/* white 40%, draws nothing and still meets the page as one sheet. Off  */
/* by default, because this bar also heads sheets, windows, sign-in and */
/* Settings, which stay bare; check-design's DETAIL_PROPS lets only the */
/* ten paper screens pass it. A clear bar (Home's) never draws it:      */
/* HomeChrome lays Home's own.                                          */
/*                                                                      */
/* The status bar is dark on every screen (the root's <StatusBar />):   */
/* nothing in Daylight is dark enough to need light glyphs.             */
/* ==================================================================== */

/** A side slot on a md bar: a 44pt glyph button with 4pt to the screen edge, and 4pt spare. */
const SIDE = 52;
/** A text button's narrowest side slot: its 72pt minimum plus the same margins. */
const SIDE_WIDE = 80;
/** The title keeps this clear of the wider side, so it never runs under a side control. */
const TITLE_GAP = 4;
/** A bar's words grow with Larger Text only so far (their maxFontSizeMultiplier). */
const BAR_TEXT_SCALE_CAP = 1.3;
/**
 * A tag title never grows (v4.10, specs/v4.10/spec.md T.8): 36pt is
 * already build 34's title at its 1.3 cap (28 x 1.3 = 36.4), it keeps the
 * fixed 52pt row and its swash, and a tag at 2x stops reading as a tag.
 */
const TAB_TITLE_CAP = 1;
/** Spare room for the SemiBold word: textFit's 'text' classes are costed on Archivo SemiBold already. */
const SEMIBOLD_SET = 1.06;
/** iOS page sheets draw their own grabber area; the bar starts just under it. */
const SHEET_INSET = space.sm;
/** A glyph button's slack each side of its 26pt glyph, so the glyph itself sits on the gutter. */
const GLYPH = 26;
const GLYPH_SLACK = (layout.hit - GLYPH) / 2;
/**
 * Where a tag title's baseline sits in the 52pt row, at a text scale
 * `s` (at most 1, as the title never grows): its 46pt line box is centred
 * in the row, 3 to 49 at 1x, and the marker's baseline 34.25 into it, so
 * 37.25 down (specs/v4.10/spec.md T.6).
 */
function tabTitleBaseline(s: number): number {
  const t = textRole.tabTitle;
  return (layout.topBar - t.lineHeight * s) / 2 + lineMarks('display', t.fontSize, t.lineHeight, s).baseline;
}

/**
 * The quiet count sits on the tag title's baseline (layout spec 4), each
 * at its own drawn size: the count's 13/18 Archivo line ends this far
 * above the row's foot, its baseline on the title's. A glyph control on
 * the right (•••) stays centred instead.
 */
function countFoot(fontScale: number): number {
  const c = textRole.small;
  const count = lineMarks('text', c.fontSize, c.lineHeight, Math.min(fontScale, BAR_TEXT_SCALE_CAP));
  return layout.topBar - tabTitleBaseline(Math.min(fontScale, TAB_TITLE_CAP)) - count.foot;
}

export interface ScreenTopBarProps {
  /** The bar's title, and its spoken name even when `titleNode` replaces the text or the title is hidden. */
  title: string;
  /** lg: a tab root, title set left. md (default): a pushed screen or window, title centred. */
  size?: 'md' | 'lg';
  left?: ReactNode;
  right?: ReactNode;
  /** The 1pt rule along the bottom: on while content scrolls under the bar. Ignored on a clear bar. */
  showRule: boolean;
  /** Drawn in place of the title text (Home's wordmark, the + window's chosen drink). */
  titleNode?: ReactNode;
  /** md only: false draws no title (the post detail). The bar still speaks `title` as a header. */
  titleVisible?: boolean;
  /**
   * 'safe' (default): below the status bar. 'sheet': 8pt, inside an iOS
   * page sheet. 'none': no top padding, for a bar its screen places itself.
   */
  inset?: 'safe' | 'sheet' | 'none';
  /** So a multi-step screen can move VoiceOver focus to the title on each step. */
  titleRef?: React.Ref<Text>;
  /** 'solid' (default): the page and its rule. 'clear': neither (Home). */
  ground?: 'solid' | 'clear';
  /**
   * The paper under the bar (v4.9 A.5; the sweep since v4.10): only on
   * the screens whose page has it, so the two meet as one sheet. Ignored
   * on a clear bar. check-design (DETAIL_PROPS) fails it anywhere else.
   */
  paper?: boolean;
  /**
   * lg only: the title is something a person typed (your handle), so it is
   * set in `title`, Archivo 600 28/34, growing to the bars' 1.3 cap, not in
   * the marker: an identifier must be read exactly (l, I, 1, dots,
   * underscores). Off, the title is the app's own word in `tabTitle`.
   */
  userTitle?: boolean;
}

function isTextButton(node: ReactNode): node is ReactElement<TopBarTextButtonProps> {
  return isValidElement(node) && node.type === TopBarTextButton;
}

/*
 * A text side is as wide as its word, at the size it is drawn, so "Cancel"
 * at Larger Text never cuts to "Canc…" (Jan, build 17). Never narrower
 * than the old 80, so a short word keeps the layout it had.
 */
function textSideWidth(button: ReactElement<TopBarTextButtonProps>, fontScale: number): number {
  const { label, muted } = button.props;
  const size = textRole.rowTitle.fontSize * Math.min(fontScale, BAR_TEXT_SCALE_CAP);
  const word = Math.ceil(textWidth(label, 'text', size) * (muted ? 1 : SEMIBOLD_SET));
  return Math.max(SIDE_WIDE, space.xs + 2 * space.md + word + 2);
}

/**
 * A screen's top bar.
 *
 * On a md bar the title is centred on the SCREEN, not between the
 * controls: it is laid over the row with equal insets from both edges, so
 * a back chevron on one side and nothing on the other cannot push it off
 * centre.
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
  titleVisible = true,
  inset = 'safe',
  titleRef,
  ground = 'solid',
  paper = false,
  userTitle = false,
}: ScreenTopBarProps) {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const clear = ground === 'clear';
  const paddingTop = inset === 'safe' ? insets.top : inset === 'sheet' ? SHEET_INSET : 0;
  const barStyle = [styles.bar, { paddingTop }, clear ? styles.barClear : showRule && styles.barRuled];
  /*
   * The bar's first child, so the row draws over it, in a box that runs
   * on over the foot's 1pt rule band: an absolute child is laid inside
   * its parent's border, so the paper alone would stop 1pt short of the
   * page's under it. Its box ends in the sweep's white, so today it draws
   * nothing; the box is kept so the two still meet if either moves.
   */
  const paperLayer =
    paper && !clear ? (
      <View pointerEvents="none" style={styles.paper}>
        <Paper />
      </View>
    ) : null;

  if (size === 'lg') {
    // A tag title never scales, so neither does its ink room nor its swash (T.6, T.8).
    const tagScale = Math.min(fontScale, TAB_TITLE_CAP);
    return (
      <View style={barStyle}>
        {paperLayer}
        <View style={styles.rootRow}>
          <View style={styles.rootTitle}>
            {left}
            {titleNode ? (
              <View accessible accessibilityRole="header" accessibilityLabel={title} style={styles.flexShrink}>
                {titleNode}
              </View>
            ) : (
              /*
               * The wrapper is the title's own box, so the swash is placed
               * from the title's left edge and its line box's foot at any
               * text size: the marker's ink room is padding taken back as
               * margin, so the box is still the line box. The ref stays on
               * the Text, for focus moves.
               */
              <View style={styles.flexShrink}>
                <Text
                  ref={titleRef}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  maxFontSizeMultiplier={userTitle ? BAR_TEXT_SCALE_CAP : TAB_TITLE_CAP}
                  accessibilityRole="header"
                  style={
                    userTitle
                      ? [textRole.title, styles.ink, styles.flexShrink]
                      : [
                          textRole.tabTitle,
                          styles.ink,
                          styles.flexShrink,
                          inkRoom('display', textRole.tabTitle.fontSize * tagScale),
                        ]
                  }>
                  {title}
                </Text>
                {title !== '' ? (
                  <TitleSwash
                    scale={userTitle ? Math.min(fontScale, BAR_TEXT_SCALE_CAP) : 1}
                    under={userTitle ? 'typed' : 'tag'}
                  />
                ) : null}
              </View>
            )}
          </View>
          {right ? <View style={styles.rootRight}>{right}</View> : null}
        </View>
      </View>
    );
  }

  const leftWidth = isTextButton(left) ? textSideWidth(left, fontScale) : SIDE;
  const rightWidth = isTextButton(right) ? textSideWidth(right, fontScale) : SIDE;
  // Both insets take the wider side, so the title stays centred on the screen.
  const titleInset = Math.max(leftWidth, rightWidth) + TITLE_GAP;

  return (
    <View style={barStyle}>
      {paperLayer}
      <View style={styles.row}>
        <View style={[styles.side, { width: leftWidth }]}>{left}</View>
        <View style={[styles.side, styles.sideRight, { width: rightWidth }]}>{right}</View>
        <View pointerEvents="box-none" style={[styles.titleSlot, { left: titleInset, right: titleInset }]}>
          {titleNode ? (
            <View accessible accessibilityRole="header" accessibilityLabel={title}>
              {titleNode}
            </View>
          ) : titleVisible ? (
            <Text
              ref={titleRef}
              numberOfLines={1}
              /*
               * Wider sides leave a long title less room at Larger Text, so
               * it shrinks before it would cut ("Host a tournament" beside
               * "Cancel" at the 1.3 cap needs 0.74).
               */
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              maxFontSizeMultiplier={BAR_TEXT_SCALE_CAP}
              accessibilityRole="header"
              style={[textRole.barTitle, styles.ink, styles.centred]}>
              {title}
            </Text>
          ) : (
            // No visible title, still a heading for VoiceOver's rotor, over the slot it would fill.
            <Text ref={titleRef} accessible accessibilityRole="header" accessibilityLabel={title} style={StyleSheet.absoluteFill} />
          )}
        </View>
      </View>
    </View>
  );
}

/**
 * The swash under a tab root's title, signing the tab each time it opens:
 * its own component, so the arrival's hook is called only where a swash
 * is drawn and a focus change re-renders this alone.
 */
function TitleSwash({ scale, under }: { scale: number; under: 'tag' | 'typed' }) {
  const draw = useTabArrival();
  return <PenSwash scale={scale} draw={draw} style={under === 'tag' ? styles.swashTag : styles.swash} />;
}

/**
 * A glyph-only control for a bar: back, close, the bell, a •••. 44 x 44
 * with a 26pt glyph in ink, dimming while held as iOS's own bar buttons
 * do. `badge` puts an 8pt dot with a 2pt page ring at the glyph's top
 * right and says ", new" after the label.
 *
 * The dot is the accent (v4.4): it is the Activity dot on Home's heart,
 * one of the accent's five places (theme.ts), and that is its only
 * caller. Not a general badge: check-design rule 17 fails `badge` passed
 * anywhere else, so red never becomes the app's way of saying "count".
 */
export function TopBarButton({
  icon,
  label,
  onPress,
  onLongPress,
  accessibilityActions,
  onAccessibilityAction,
  filled,
  badge,
  accessibilityHint,
  children,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** A second way in, held for 500ms (the drink page's bookmark: Save to collection, v4.2 §4.2). */
  onLongPress?: () => void;
  /** VoiceOver's way to the same second action, as a custom action. */
  accessibilityActions?: readonly AccessibilityActionInfo[];
  onAccessibilityAction?: (e: AccessibilityActionEvent) => void;
  filled?: boolean;
  badge?: boolean;
  /** Where the button goes, when its label alone does not say (sign-in's Close). */
  accessibilityHint?: string;
  children?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={onLongPress ? 500 : undefined}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, new` : label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.glyphButton, pressed && styles.glyphPressed]}>
      <View style={styles.glyphBox}>
        <Icon name={icon} size={GLYPH} color={colors.text} filled={filled} />
        {badge ? <View style={styles.badge} /> : null}
        {children}
      </View>
    </Pressable>
  );
}

/**
 * The quiet count on a tab root's bar, on the title's baseline: the Dex's
 * "38 / 2,089". Small, muted, tabular. With `onPress` it is a button (the
 * Dex's opens Dex progress), and `accessibilityLabel` says it in words.
 *
 * `figure` is the caught figure, drawn before `text` in Archivo 600 and the
 * accent (v4.4, one of its five places): the "38" of "38 / 2,089", the
 * number only, with the rest still the quiet muted count. 600 so the hue
 * reads at 13pt (5.54:1 on the page). Spoken as part of the label, never
 * on its own.
 */
export function TopBarCount({
  figure,
  text,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: {
  figure?: string;
  text: string;
  onPress?: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
}) {
  const { fontScale } = useWindowDimensions();
  // On the tag title's baseline at this text size, each at its own drawn scale (T.6).
  const slot = [styles.countSlot, { paddingBottom: countFoot(fontScale) }];
  const body = (
    <Text maxFontSizeMultiplier={BAR_TEXT_SCALE_CAP} style={[textRole.small, styles.count]}>
      {figure ? <Text style={styles.figure}>{figure}</Text> : null}
      {text}
    </Text>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel} style={slot}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 6, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [slot, pressed && styles.glyphPressed]}>
      {body}
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
 * A word for a bar side: "Cancel" on a modal sheet. Ink SemiBold for an
 * action; `muted` (textMuted, regular) for the one that backs out. Its slot
 * is sized from the word (textSideWidth), and the title's insets with it.
 * `loading` keeps the label's width and lays a spinner over it.
 */
export function TopBarTextButton({ label, onPress, muted, disabled, loading }: TopBarTextButtonProps) {
  const inert = !!disabled || !!loading;
  const color = muted ? colors.textMuted : colors.text;
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
        // The backstop: the slot is sized from an estimate, so iOS shrinks the word rather than cutting it.
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        maxFontSizeMultiplier={BAR_TEXT_SCALE_CAP}
        style={[textRole.rowTitle, { color }, !muted && styles.textButtonStrong, loading && styles.covered]}>
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
 * has moved `threshold` points (default 1) under the bar. It flips only
 * when the offset CROSSES the threshold, so a scroll never re-renders the
 * screen per frame. Pass `onScroll` and `scrollEventThrottle={16}`.
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
  /* The paper's box: the bar's, down to the outer edge of its foot's border (v4.9 A.5). */
  paper: { position: 'absolute', top: 0, left: 0, right: 0, bottom: -stroke.edge },
  /* No ground and no rule, so a clear bar is exactly its row (plus its inset). */
  barClear: { backgroundColor: 'transparent', borderBottomWidth: 0 },
  ink: { color: colors.text },
  centred: { textAlign: 'center' },
  flexShrink: { flexShrink: 1 },

  /* lg: the title at the gutter, one control at the far gutter (its glyph, not its hit box). */
  rootRow: {
    height: layout.topBar,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: layout.gutter,
    paddingRight: layout.gutter - GLYPH_SLACK,
    gap: space.md,
  },
  rootTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rootRight: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  /*
   * The swash's box under a typed title: 1 right of the title's left
   * edge, its foot 4 under the title's line box (so its top is 2 above
   * it). At text scale 1 the line box ends at 43 in the 52 row, the box
   * spans 41 to 47, and the ink keeps at least 5 clear of the bar's 1pt
   * foot.
   */
  swash: { position: 'absolute', left: 1, bottom: -4 },
  /*
   * Under a tag title (T.6): its foot 1 under the 3..49 line box, so the
   * box spans 44 to 50 in the 52 row at scale 1 always, and its ink keeps
   * 2 clear of the foot.
   */
  swashTag: { position: 'absolute', left: 1, bottom: -1 },

  /* md */
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

  glyphButton: {
    width: layout.hit,
    height: layout.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphPressed: { opacity: 0.6 },
  glyphBox: { width: GLYPH, height: GLYPH },
  /*
   * 8pt accent with a 2pt page ring, drawn as the border: the dot's outer
   * size is 12. The accent against the page is 5.54:1, so the dot clears
   * 3:1 as a mark; the label's ", new" says it to VoiceOver.
   */
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    // round-ok: dot
    borderRadius: radius.round,
    borderWidth: 2,
    borderColor: colors.bg,
    backgroundColor: colors.accent,
  },

  /* The quiet count: on the title's baseline (countFoot, at the reader's size), right-aligned to the far gutter. */
  countSlot: {
    alignSelf: 'stretch',
    justifyContent: 'flex-end',
    paddingRight: GLYPH_SLACK,
  },
  count: { color: colors.textMuted, fontVariant: ['tabular-nums'] },
  /* The caught figure: nested in the count, so it keeps the count's size, line and tabular figures. */
  figure: { fontFamily: fonts.bodySemiBold, color: colors.accent },

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
