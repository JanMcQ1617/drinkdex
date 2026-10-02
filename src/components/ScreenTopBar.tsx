import React, { isValidElement, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icons';
import { colors, fonts, layout, radius, space, stroke, textRole } from '@/constants/theme';

/* ==================================================================== */
/* The top bar                                                          */
/*                                                                      */
/* ONE BAR FOR EVERY SCREEN. There were eight hand-built ones, in three */
/* title sizes, two fonts and two alignments, so moving between two     */
/* screens changed the furniture as well as the content. This is the    */
/* only one: a 44pt row on the page colour, a centred Inter title, and  */
/* at most one control per side.                                        */
/*                                                                      */
/* No blur, no glass, no Playfair. A caller may hand a wordmark in as   */
/* `titleNode` (Home does); nothing else sets the title in the display  */
/* face, which is kept for the brand's voice.                           */
/*                                                                      */
/* THE RULE IS ONE SIGNAL, DRAWN ONCE. A 1pt `line` along the bottom    */
/* says "content is scrolling under me". It switches instantly when the */
/* list crosses its threshold (useScrolledPast), not on every frame and */
/* not through an animation, and it is always laid out (transparent at  */
/* rest) so turning it on never moves the screen by a point.            */
/* ==================================================================== */

/** Side slots: a 44pt glyph button with 4pt to the screen edge, and 4pt spare. */
const SIDE = 52;
/** A text button's side slot: its 72pt minimum plus the same margins. */
const SIDE_WIDE = 80;
/** Title insets from each screen edge, so it never runs under a side control. */
const TITLE_INSET = SIDE + 4;
const TITLE_INSET_WIDE = SIDE_WIDE + 4;
/** iOS page sheets draw their own grabber area; the bar starts just under it. */
const SHEET_INSET = space.sm;

export interface ScreenTopBarProps {
  /** The bar's title, and its spoken name even when `titleNode` replaces the text. */
  title: string;
  /** md: 17/22, pushed and modal screens. lg: 20/26, a root screen's own name. */
  size?: 'md' | 'lg';
  left?: ReactNode;
  right?: ReactNode;
  /** The 1pt rule along the bottom: on while content scrolls under the bar. */
  showRule: boolean;
  /** Drawn in place of the title text (Home's wordmark). `title` stays the spoken name. */
  titleNode?: ReactNode;
  /** 'safe' (default): below the status bar. 'sheet': 8pt, inside an iOS page sheet. */
  inset?: 'safe' | 'sheet';
  /**
   * So a multi-step screen can move VoiceOver focus to the title on each
   * step. It is attached to the title text, so it stays unset on a bar
   * whose `titleNode` replaces that text.
   */
  titleRef?: React.Ref<Text>;
}

function isTextButton(node: ReactNode) {
  return isValidElement(node) && node.type === TopBarTextButton;
}

/**
 * A screen's top bar.
 *
 * The title is centred on the SCREEN, not between the controls: it is
 * laid over the row with equal insets from both edges, so a back chevron
 * on one side and nothing on the other cannot push it off centre. A text
 * control on either side ("Cancel") widens both insets alike.
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
}: ScreenTopBarProps) {
  const insets = useSafeAreaInsets();
  const wideLeft = isTextButton(left);
  const wideRight = isTextButton(right);
  const titleInset = wideLeft || wideRight ? TITLE_INSET_WIDE : TITLE_INSET;

  return (
    <View
      style={[
        styles.bar,
        { paddingTop: inset === 'safe' ? insets.top : SHEET_INSET },
        showRule && styles.barRuled,
      ]}>
      <View style={styles.row}>
        <View style={[styles.side, { width: wideLeft ? SIDE_WIDE : SIDE }]}>{left}</View>
        <View style={[styles.side, styles.sideRight, { width: wideRight ? SIDE_WIDE : SIDE }]}>
          {right}
        </View>
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
              maxFontSizeMultiplier={1.3}
              accessibilityRole="header"
              style={[size === 'lg' ? textRole.barTitleLg : textRole.barTitle, styles.title]}>
              {title}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

/**
 * A glyph-only control for a bar side: back, close, settings, the Home
 * heart. 44 × 44 with a 26pt glyph in ink, and it dims while held, as
 * iOS's own bar buttons do (a fill behind a bare glyph would read as a
 * button that was never drawn).
 *
 * `badge` puts a 6pt wine dot at the glyph's top-right and says ", new"
 * after the label. `children` are drawn inside the glyph's box, over it.
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
        <Icon name={icon} size={26} color={colors.text} filled={filled} />
        {badge ? <View style={styles.badge} /> : null}
        {children}
      </View>
    </Pressable>
  );
}

/**
 * A word for a bar side: "Cancel" on a modal sheet. Wine, SemiBold, for
 * an action; `muted` (textMuted, regular weight) for the one that backs
 * out. Its slot widens, and the title's insets with it (ScreenTopBar).
 *
 * `loading` keeps the label's width and lays a spinner over it, so the
 * bar does not shift while the action runs.
 */
export function TopBarTextButton({
  label,
  onPress,
  muted,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  muted?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  const inert = !!disabled || !!loading;
  const color = muted ? colors.textMuted : colors.wine;
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
        maxFontSizeMultiplier={1.3}
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
