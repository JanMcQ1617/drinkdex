import React, { isValidElement, useRef, useState, type ReactElement, type ReactNode } from 'react';
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
/*   size="lg"  a tab root: the title set LEFT at the gutter in `title` */
/*              (28/34), Home's wordmark in its place, and one control  */
/*              (or the quiet count, TopBarCount) right-aligned to the  */
/*              far gutter.                                             */
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
/** Spare room for the SemiBold word: textFit's Inter classes are costed on SemiBold already. */
const SEMIBOLD_SET = 1.06;
/** iOS page sheets draw their own grabber area; the bar starts just under it. */
const SHEET_INSET = space.sm;
/** A glyph button's slack each side of its 26pt glyph, so the glyph itself sits on the gutter. */
const GLYPH = 26;
const GLYPH_SLACK = (layout.hit - GLYPH) / 2;
/**
 * The quiet count sits on the title's baseline (layout spec 4): with the
 * 34pt title line centred in the 52pt row, the baseline is about 36pt
 * down, and a 13/18 line's baseline about 14pt into it.
 */
const COUNT_FOOT = layout.topBar - 36 - (textRole.small.lineHeight - 14);

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
  const word = Math.ceil(textWidth(label, 'inter', size) * (muted ? 1 : SEMIBOLD_SET));
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
}: ScreenTopBarProps) {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const clear = ground === 'clear';
  const paddingTop = inset === 'safe' ? insets.top : inset === 'sheet' ? SHEET_INSET : 0;
  const barStyle = [styles.bar, { paddingTop }, clear ? styles.barClear : showRule && styles.barRuled];

  if (size === 'lg') {
    return (
      <View style={barStyle}>
        <View style={styles.rootRow}>
          <View style={styles.rootTitle}>
            {left}
            {titleNode ? (
              <View accessible accessibilityRole="header" accessibilityLabel={title} style={styles.flexShrink}>
                {titleNode}
              </View>
            ) : (
              <Text
                ref={titleRef}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                maxFontSizeMultiplier={BAR_TEXT_SCALE_CAP}
                accessibilityRole="header"
                style={[textRole.title, styles.ink, styles.flexShrink]}>
                {title}
              </Text>
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
 * A glyph-only control for a bar: back, close, the bell, a •••. 44 x 44
 * with a 26pt glyph in ink, dimming while held as iOS's own bar buttons
 * do. `badge` puts an 8pt ink dot with a 2pt page ring at the glyph's top
 * right and says ", new" after the label.
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
  return (
    <Pressable
      onPress={onPress}
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
 */
export function TopBarCount({
  text,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: {
  text: string;
  onPress?: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
}) {
  const body = (
    <Text maxFontSizeMultiplier={BAR_TEXT_SCALE_CAP} style={[textRole.small, styles.count]}>
      {text}
    </Text>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel} style={styles.countSlot}>
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
      style={({ pressed }) => [styles.countSlot, pressed && styles.glyphPressed]}>
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
  /* 8pt ink with a 2pt page ring, drawn as the border: the dot's outer size is 12. */
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
    backgroundColor: colors.text,
  },

  /* The quiet count: on the title's baseline, right-aligned to the far gutter. */
  countSlot: {
    alignSelf: 'stretch',
    justifyContent: 'flex-end',
    paddingBottom: COUNT_FOOT,
    paddingRight: GLYPH_SLACK,
  },
  count: { color: colors.textMuted, fontVariant: ['tabular-nums'] },

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
