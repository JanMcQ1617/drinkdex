import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React, { createContext, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  type AccessibilityState,
  ActivityIndicator,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { DrinkName } from '@/components/cabinet';
import { Icon, type IconName } from '@/components/icons';
import {
  CATEGORY_META,
  colors,
  fonts,
  layout,
  motion,
  radius,
  space,
  stroke,
  tabular,
  textRole,
  type as typeScale,
} from '@/constants/theme';
import { formatCount } from '@/data';
import { peekSignedPhoto, signedPhotoUrl } from '@/lib/social';
import type { DrinkCategory } from '@/types';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/* ==================================================================== */
/* The v2 rules every primitive here follows                            */
/*                                                                      */
/*   1. Rectangles, not ovals. Controls are 8pt rounded rectangles       */
/*      (radius.control), panels 12pt (radius.card), media square.      */
/*      Only people and round objects are circles.                      */
/*   2. Every edge is drawn. A container has a visible 1pt edge; an      */
/*      input a 3:1 edge (lineControl); a secondary button an ink edge.  */
/*   3. Chrome is Inter, through theme.ts's textRole.                   */
/*   4. Nothing performs. Controls answer a press with a FILL change,    */
/*      never a scale; only media tiles keep PressableScale. Nothing     */
/*      waits on an animation to become visible: Reanimated can stall    */
/*      for seconds after a cold start in a Release build, so every      */
/*      state that matters (a floating field label, a selected segment)  */
/*      is shown without motion too.                                     */
/*   5. One wine action per view. Wine fills the primary action; focus,  */
/*      selection and secondary actions use ink. Since v3 wine is also a */
/*      material (the cabinet's lining), and wine on lining is 1.22:1,   */
/*      so on lining the primary button is bone (`onLining`) instead.   */
/*   6. Drink names go through DrinkName (components/cabinet.tsx): they  */
/*      shrink to fit their column and never truncate.                   */
/* ==================================================================== */

/* ==================================================================== */
/* Haptics                                                              */
/* ==================================================================== */

/**
 * No-ops off-device — expo-haptics has no web implementation.
 *
 * Buttons and rows do not tick on press: a tick on every tap is noise,
 * and it landed before the handler's own answer as a double buzz. `select`
 * is for a selection that changed (a tab, a segment, a chip), `success`
 * for a completed save, `error` for a refused one (a wrong code), `tap`
 * for like and record.
 */
export const haptic = {
  tap: () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  select: () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
  },
  success: () => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
  error: () => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },
};

/* ==================================================================== */
/* Announcements                                                        */
/* ==================================================================== */

/**
 * Speaks `message` to VoiceOver now.
 *
 * accessibilityLiveRegion, which the forms used for every error and
 * notice, is Android-only. On iOS — the platform this app ships on — a
 * VoiceOver user pressed Sign in, heard the button change and change back,
 * and was never told the password did not match. Live regions stay for
 * Android, and this is gated to iOS so Android does not hear it twice.
 *
 * `queue: true` so a button's own label change, which lands at the same
 * moment, does not cut the message off.
 *
 * Lives here, beside Field, because this file imports no screen. It used
 * to live in AuthGate, and AuthGate renders WelcomeConnect, which renders
 * FindFriends and InstagramImport — so both of those kept a private copy
 * rather than import it back through a require cycle.
 */
/*
 * The same message twice within a moment is one event, said once. Each gated
 * screen mounts its own AuthGate, so a signed-out user who has visited two of
 * them has two forms subscribed to the same store error — and without this,
 * VoiceOver read every failure once per mounted form.
 */
let lastAnnounced = { message: '', at: 0 };
const REPEAT_WINDOW_MS = 800;

export function announce(message: string) {
  if (Platform.OS !== 'ios') return;
  const now = Date.now();
  if (message === lastAnnounced.message && now - lastAnnounced.at < REPEAT_WINDOW_MS) return;
  lastAnnounced = { message, at: now };
  AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
}

/**
 * Announces `message` when it appears or changes. Keyed on the string: a
 * store that clears its error at the start of every attempt gets the same
 * failure announced twice when it happens twice.
 */
export function useAnnounce(message: string | null | undefined) {
  useEffect(() => {
    if (message) announce(message);
  }, [message]);
}

/* ==================================================================== */
/* PressableScale                                                       */
/* ==================================================================== */

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  style?: ViewStyle | (ViewStyle | false | undefined)[];
  /** Skip the light haptic tick. */
  noHaptic?: boolean;
  /** Springs to this scale while held. */
  scaleTo?: number;
}

/**
 * Tappable surface with a spring press state. MEDIA TILES ONLY: Dex
 * cards, profile grid tiles, reel tiles.
 *
 * A picture has no fill to change, so it answers a press by giving a
 * little under the finger. Everything else (buttons, rows, chips,
 * segments, fields) answers with a fill change instead (see Button):
 * forty controls that all shrink when touched read as a template, not as
 * objects. Honors Reduce Motion.
 *
 * The resting state is scale 1, so a spring that never runs leaves the
 * tile exactly where it should be.
 */
export function PressableScale({
  children,
  style,
  noHaptic,
  scaleTo = motion.pressScale,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  /*
   * Plain handlers, not useCallback: React Compiler is on, so it memoizes
   * these itself. Writing `scale.value` inside a useCallback additionally
   * trips react-hooks/immutability — the compiler treats the closed-over
   * shared value as immutable, which Reanimated's mutable refs violate.
   */
  const handleIn: NonNullable<PressableProps['onPressIn']> = (e) => {
    scale.set(reduced ? 1 : withSpring(scaleTo, motion.spring));
    if (!noHaptic) haptic.tap();
    onPressIn?.(e);
  };

  const handleOut: NonNullable<PressableProps['onPressOut']> = (e) => {
    scale.set(reduced ? 1 : withSpring(1, motion.spring));
    onPressOut?.(e);
  };

  return (
    <AnimatedPressable
      style={[animated, ...(Array.isArray(style) ? style : [style])] as never}
      onPressIn={handleIn}
      onPressOut={handleOut}
      {...rest}>
      {children}
    </AnimatedPressable>
  );
}

/* ==================================================================== */
/* Buttons                                                              */
/* ==================================================================== */

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'tonal'
  | 'text'
  | 'danger'
  | 'dangerText'
  | 'onDark'
  | 'onDarkText'
  | 'onLining'
  | 'onLiningOutline'
  | 'onLiningText'
  | 'dangerOnLining';

/**
 * `md` is 48pt, the call to action. `sm` is 36pt for an action that sits
 * inside a list row (Follow, Unblock), where a 48pt button makes the row
 * taller than its content; 4pt of hitSlop above and below still gives the
 * finger 44.
 */
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  /**
   * Any 20pt node in place of `icon`, drawn as given: a provider's mark
   * (GoogleMark, Apple's SF Symbol, Facebook's logo), or a spinner while
   * that one row's request is out.
   */
  leading?: React.ReactNode;
  /** `text` only: the label in textMuted rather than wine (Cancel, Not now). */
  muted?: boolean;
  /** The action can't be taken yet — an incomplete form. Dims the button. */
  disabled?: boolean;
  /**
   * The action was taken and is still running. Ignores presses like
   * `disabled`, but keeps full strength and shows a spinner without
   * changing the button's size. See the note on Button.
   */
  loading?: boolean;
  /** Fills the available width. */
  block?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /**
   * Merged over the state Button works out itself. For a row that must
   * read as unavailable while keeping full strength, which `disabled`
   * cannot do (it fades): a provider row while another provider's request
   * is out passes `{ disabled: true }` and a no-op `onPress`.
   */
  accessibilityState?: AccessibilityState;
  /**
   * Caps the label's Dynamic Type growth, for a button pinned to a bar that
   * must not grow without bound (the drink page's "Post another …", 1.3).
   * Uncapped by default, like any body text. The label still wraps.
   */
  maxFontSizeMultiplier?: number;
}

type ButtonSkin = {
  bg: string;
  fg: string;
  edge: string;
  /** Fill while held. Controls answer with a fill, never a scale. */
  pressedBg?: string;
  pressedEdge?: string;
  /** For skins with no fill to change: dim while held instead. */
  pressedOpacity?: number;
  /** No fill, no edge, no corner: a text button. */
  bare?: boolean;
};

/*
 * Every skin is a rectangle with a drawn edge, or bare text. The handoff's
 * pills went because a screen where every control is a stadium is the
 * plainest sign that nothing was decided.
 *
 * ONE WINE THING. Only `primary` is wine. `secondary` is white with a 1pt
 * espresso outline and an espresso label (a taupe outline was 1.68:1 on the
 * page, an edge you had to look for); `tonal` is the quiet fill for a
 * second action that should not compete (Following). `text` stays wine
 * because a wine word is not a wine object, and `muted` drops it to
 * textMuted for the action that backs out (Cancel, Not now).
 *
 * Two destructive skins, for two weights of consequence. `danger` is the
 * washed button, for the one irreversible action a screen exists to offer.
 * `dangerText` is the same red with no fill and no edge, for a quiet
 * destructive action at the foot of a screen about something else —
 * "Remove from collection", "Remove photo" — where a red button would
 * outshout the screen's real call to action. `danger` text is 5.99:1 on
 * the page and above that on a white card.
 *
 * Two for the dark reels ground, where wine is 1.12:1 and vanishes:
 * `onDark` is the bone button with an espresso-black label (19.3:1), and
 * `onDarkText` the bone text button for "Not now" and "Done".
 *
 * Four for the cabinet's lining, where wine is 1.22:1. `onLining` is the
 * primary there: bone with a lining label (13.32:1), held at onLiningMuted
 * (6.79:1). `onLiningOutline` is the secondary, bone text on a 3.27:1
 * `liningControl` edge; `onLiningText` the quiet one; `dangerOnLining`
 * the bare destructive word ("Remove from collection") on the cellar.
 *
 * No variant casts a shadow.
 */
const BUTTON_SKIN: Record<ButtonVariant, ButtonSkin> = {
  primary: {
    bg: colors.wine,
    fg: colors.textOnWine,
    edge: colors.wine,
    pressedBg: colors.wineDeep,
    pressedEdge: colors.wineDeep,
  },
  secondary: {
    bg: colors.surface,
    fg: colors.text,
    edge: colors.lineInk,
    pressedBg: colors.bgSunk,
  },
  tonal: { bg: colors.bgSunk, fg: colors.text, edge: colors.line, pressedBg: colors.slot },
  text: { bg: 'transparent', fg: colors.wine, edge: 'transparent', pressedOpacity: 0.5, bare: true },
  danger: { bg: colors.dangerWash, fg: colors.danger, edge: colors.danger, pressedOpacity: 0.8 },
  dangerText: {
    bg: 'transparent',
    fg: colors.danger,
    edge: 'transparent',
    pressedOpacity: 0.5,
    bare: true,
  },
  onDark: {
    bg: colors.reelInk,
    fg: colors.reelGround,
    edge: colors.reelInk,
    pressedBg: colors.reelInkMuted,
    pressedEdge: colors.reelInkMuted,
  },
  onDarkText: {
    bg: 'transparent',
    fg: colors.reelInk,
    edge: 'transparent',
    pressedOpacity: 0.5,
    bare: true,
  },
  onLining: {
    bg: colors.onLining,
    fg: colors.lining,
    edge: colors.onLining,
    pressedBg: colors.onLiningMuted,
    pressedEdge: colors.onLiningMuted,
  },
  onLiningOutline: {
    bg: 'transparent',
    fg: colors.onLining,
    edge: colors.liningControl,
    pressedBg: colors.liningPressed,
  },
  onLiningText: {
    bg: 'transparent',
    fg: colors.onLining,
    edge: 'transparent',
    pressedOpacity: 0.5,
    bare: true,
  },
  dangerOnLining: {
    bg: 'transparent',
    fg: colors.dangerOnLining,
    edge: 'transparent',
    pressedOpacity: 0.5,
    bare: true,
  },
};

/** Variants whose `block` form pins the mark at the left (see Button). */
const PINS_MARK: readonly ButtonVariant[] = ['secondary', 'tonal', 'onDark', 'onLining', 'onLiningOutline'];

/**
 * DISABLED AND LOADING ARE DIFFERENT STATES. Both ignore presses, but
 * `disabled` says "you can't do this yet" and fades to 42%, while
 * `loading` says "you did it, and it's working" and stays at full
 * strength with a spinner. Sharing the fade told someone whose tap had
 * landed that it hadn't. If a caller passes both, loading wins — it is
 * the more recent news.
 *
 * A press that lands must not resize what was pressed, so the spinner
 * never adds width. It takes the mark's place when there is one. A
 * `block` button has room beside its label. Anything else may be only as
 * wide as its label, so the spinner covers the label, which keeps its
 * space and stays the spoken name. Two-up rows are why: a spinner added
 * beside "Update photo" in half of a 375pt screen wraps it onto a second
 * line mid-save.
 *
 * A STACK OF PROVIDER BUTTONS LINES UP. A `block` secondary, tonal,
 * onDark, onLining or onLiningOutline button with a mark pins the mark
 * 16pt from its left edge and centres the label across the full width, so
 * a column of "Continue with …" rows puts every mark in one column and
 * every label on one axis.
 * Anywhere else the mark sits inline before the label.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  leading,
  muted,
  disabled,
  loading,
  block,
  style,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  maxFontSizeMultiplier,
}: ButtonProps) {
  const skin = BUTTON_SKIN[variant];
  const fg = muted && variant === 'text' ? colors.textMuted : skin.fg;
  const inert = !!disabled || !!loading;
  const sm = size === 'sm';
  const iconSize = sm ? 16 : 20;
  const markSize = leading ? 20 : iconSize;
  const hasMark = !!leading || !!icon;
  const pinned = !!block && hasMark && PINS_MARK.includes(variant);
  const spinner = loading ? <ActivityIndicator size="small" color={fg} /> : null;
  const coverLabel = !!loading && !hasMark && !block;

  const mark = hasMark ? (
    <View
      style={[
        styles.buttonSlot,
        { width: markSize, height: markSize },
        pinned && styles.buttonSlotPinned,
      ]}>
      {loading ? spinner : (leading ?? <Icon name={icon!} size={iconSize} color={fg} />)}
    </View>
  ) : null;

  return (
    <Pressable
      onPress={inert ? undefined : onPress}
      disabled={inert}
      hitSlop={sm ? { top: 4, bottom: 4 } : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inert, busy: !!loading, ...accessibilityState }}
      style={({ pressed }) => [
        styles.button,
        sm && styles.buttonSm,
        skin.bare && (sm ? styles.buttonBareSm : styles.buttonBare),
        {
          backgroundColor: pressed && skin.pressedBg ? skin.pressedBg : skin.bg,
          borderColor: pressed && skin.pressedEdge ? skin.pressedEdge : skin.edge,
        },
        pressed && skin.pressedOpacity ? { opacity: skin.pressedOpacity } : null,
        block && styles.buttonBlock,
        disabled && !loading && styles.buttonDisabled,
        style,
      ]}>
      {mark ?? (block ? spinner : null)}
      <Text
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        style={[
          sm ? textRole.buttonSm : textRole.button,
          styles.buttonLabel,
          { color: fg },
          pinned && styles.buttonLabelPinned,
          coverLabel && styles.buttonLabelCovered,
        ]}>
        {label}
      </Text>
      {coverLabel ? <View style={styles.buttonCover}>{spinner}</View> : null}
    </Pressable>
  );
}

/* ==================================================================== */
/* Media icon button                                                    */
/* ==================================================================== */

/**
 * A glyph-only control that sits over a photograph, a video or a camera
 * preview: the drink page's back button, the recorder's close, flip and
 * torch, the Reels header's record.
 *
 * A dark translucent square with a faint bone edge, so it holds on a white
 * frame (4.27:1 for the glyph, composited) and on a black one alike. It
 * replaces the glass circle, which was a frosted disc with a painted
 * sheen. Selected (the torch on) inverts it: a bone fill and a dark glyph,
 * drawn solid where the glyph has a solid form.
 *
 * Dims while held rather than changing fill: over moving footage a fill
 * change reads as flicker.
 */
export function MediaIconButton({
  icon,
  label,
  onPress,
  selected,
  disabled,
  accessibilityHint,
  style,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  /** Placement only (absolute top/left over the media). */
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      style={({ pressed }) => [
        styles.mediaButton,
        selected && styles.mediaButtonSelected,
        pressed && styles.mediaButtonPressed,
        disabled && styles.buttonDisabled,
        style,
      ]}>
      <Icon
        name={icon}
        size={22}
        color={selected ? colors.reelGround : colors.reelInk}
        filled={!!selected}
      />
    </Pressable>
  );
}

/* ==================================================================== */
/* Tags                                                                 */
/* ==================================================================== */

/*
 * One anatomy for every tag: 22pt, a 4pt corner (radius.badge), a 1pt edge
 * in the tone at a third strength over its wash. The pills these replace
 * were the most repeated oval in the app.
 */

export function CategoryTag({ category }: { category: DrinkCategory }) {
  const meta = CATEGORY_META[category];
  return (
    <View style={[styles.tag, { backgroundColor: meta.wash, borderColor: meta.color + '55' }]}>
      <Text style={[styles.tagText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

/**
 * A neutral tag: a word that describes, not a state or a category — an
 * ingredient, a tasting note. Bone fill, `line` edge, muted label.
 */
export function Tag({ label, style }: { label: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.tag, styles.tagNeutral, style]}>
      <Text style={[styles.tagText, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

/* ==================================================================== */
/* Chip                                                                 */
/* ==================================================================== */

/**
 * A toggle: the My Bar shelf, the custom-drink pickers, a removable token.
 *
 * Selected is wine on its wash with a wine edge AND a leading check, so
 * the state does not rest on colour alone. `icon` replaces the check (a
 * "+ suggestion" chip), and `trailingIcon` adds a small glyph after the
 * label ('close' on a token that removes itself).
 *
 * 32pt tall with 6pt of hitSlop above and below, so the finger gets 44.
 * Since v3 the Dex's filter row is made of these too (All · Cocktails ·
 * Spirits, then Collected · Not yet), one selection per axis, in place of
 * the underlined tabs it had.
 */
export function Chip({
  label,
  selected,
  onPress,
  icon,
  trailingIcon,
  count,
  disabled,
  accessibilityLabel,
  tone = 'paper',
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
  trailingIcon?: IconName;
  count?: number;
  disabled?: boolean;
  accessibilityLabel?: string;
  /**
   * v3.3 Brass: 'lining' for a chip on the cabinet's wine (the Dex's
   * filters). Resting, a clear chip on a liningControl edge (3.27:1) with
   * bone words and an onLiningMuted count; selected, the bone fill with
   * lining ink (13.32:1), the lining's own primary, since wine on lining
   * is 1.22:1. The check still leads a selected chip.
   */
  tone?: 'paper' | 'lining';
}) {
  const lining = tone === 'lining';
  const ink = lining ? (selected ? colors.lining : colors.onLining) : selected ? colors.wine : colors.text;
  const lead = icon ?? (selected ? 'check' : null);
  return (
    <Pressable
      onPress={
        disabled
          ? undefined
          : () => {
              haptic.select();
              onPress();
            }
      }
      disabled={disabled}
      hitSlop={{ top: 6, bottom: 6 }}
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? (count != null ? `${label}, ${formatCount(count)}` : label)
      }
      accessibilityState={{ selected, disabled: !!disabled }}
      style={({ pressed }) => [
        styles.chip,
        lining && styles.chipLining,
        selected && (lining ? styles.chipLiningSelected : styles.chipSelected),
        pressed && (lining ? (selected ? styles.chipLiningSelectedPressed : styles.chipLiningPressed) : styles.chipPressed),
        disabled && styles.buttonDisabled,
      ]}>
      {lead ? <Icon name={lead} size={14} color={ink} /> : null}
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected, { color: ink }]}>{label}</Text>
      {count != null ? (
        <Text
          style={[
            styles.chipCount,
            tabular,
            lining && { color: selected ? colors.textMuted : colors.onLiningMuted },
          ]}>
          {formatCount(count)}
        </Text>
      ) : null}
      {trailingIcon ? <Icon name={trailingIcon} size={12} color={ink} /> : null}
    </Pressable>
  );
}

/* ==================================================================== */
/* Avatar                                                               */
/* ==================================================================== */

/**
 * Resolves an avatar's signed URL.
 *
 * Lives here rather than being passed in because Avatar has seven call
 * sites, several of them inside lists, and threading a resolved URL
 * through every one of them means seven chances to forget. The signing
 * itself is memoised by path in lib/social, so the same face appearing
 * beside twenty posts costs one request.
 *
 * `localUri` short-circuits it: an image just picked from the camera roll
 * has not been uploaded yet, and the editor needs to preview it now.
 *
 * An already-signed path is answered on the first render, from the cache,
 * as PostCard's useSignedPhoto does. Without that, every avatar in a list
 * that scrolled back into view remounted as initials for a frame and then
 * swapped to the photo, even though the URL was sitting in memory. The
 * cache keeps only successes, so an avatar whose signing failed is asked
 * again by the next mount rather than showing initials until relaunch.
 */
function useAvatarUrl(path: string | null | undefined, localUri?: string | null): string | null {
  const [resolved, setResolved] = useState<{ path: string; url: string | null } | null>(null);
  const cached = peekSignedPhoto(path);

  useEffect(() => {
    /*
     * Skipped only when THIS render already had the URL. Asking the cache
     * again here would race: a signing that settles between the render and
     * the effect would make the effect bail while the render still showed
     * initials, and nothing would ever swap the photo in.
     */
    if (!path || cached !== undefined) return;
    let alive = true;
    // signedPhotoUrl never rejects. A path that will not sign resolves
    // null and falls back to initials, which is never wrong, just less
    // personal.
    void signedPhotoUrl(path).then((url) => {
      if (alive) setResolved({ path, url });
    });
    return () => {
      alive = false;
    };
  }, [path, cached]);

  if (localUri) return localUri;
  if (!path) return null;
  if (cached !== undefined) return cached;
  return resolved && resolved.path === path ? resolved.url : null;
}

/**
 * The disc (in points, inside any ring) from which an avatar decodes its
 * whole file rather than a circle-sized thumbnail: the 86pt profile header
 * and the edit preview. Every list face (24-57pt) stays under it.
 */
const LARGE_AVATAR = 64;

/**
 * Initials on a wine disc.
 *
 * THE SANCTIONED CIRCLE. Everything else in the interface is a rectangle;
 * a person is round, which is how a feed tells people from things at a
 * glance. The radii below carry `round-ok: avatar` for check-design.
 *
 * The handoff draws every avatar the same way — a solid wine circle with
 * a bone initial — so the disc no longer takes the user's accent as a
 * wash. The accent survives as the RING, which keeps per-user colour
 * without asking bone type to stay readable on six different fills: brass
 * would have landed at 4.49:1, just under the bar this app holds.
 *
 * The initials are Inter SemiBold, not the handoff's Playfair: v3 keeps the
 * display face for the wordmark and drink names (check-design rule 6). They
 * are 40% of the disc and never under 11pt, the app's floor, so the 24pt
 * tab-bar face reads "NV" at 11 rather than at 7.
 *
 * Deliberately not emoji: emoji render in the system font, so their weight
 * and colour can't be controlled by design tokens, and at avatar size they
 * read as placeholder art.
 */
export function Avatar({
  name,
  accent,
  size = 40,
  ring,
  ringWidth = 2,
  avatarPath,
  localUri,
}: {
  name: string;
  accent: string;
  size?: number;
  /** Draws the accent ring, with a 1pt gap inside it. */
  ring?: boolean;
  /** The ring's stroke, 2 by default; edit profile draws 3 so the accent being chosen shows. */
  ringWidth?: number;
  /** Object path from `profiles.avatar_path`. */
  avatarPath?: string | null;
  /** A just-picked local image, previewed before it is uploaded. */
  localUri?: string | null;
}) {
  const photo = useAvatarUrl(avatarPath, localUri);
  const initials = name
    .replace(/[^a-zA-Z0-9 ._-]/g, '')
    .split(/[ ._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

  // The ring and a 1pt gap on each side.
  const inner = size - (ring ? ringWidth * 2 + 2 : 0);

  /*
   * How the photo is decoded, and the cache key that goes with it.
   *
   * expo-image's SDWebImage (5.21.6 and later) files a downsized decode
   * under the file's ORIGINAL key in memory, and any other size that misses
   * its own entry is handed that bitmap as it is. With one key per face,
   * the 24pt tab bar's 66px decode became the 86pt profile header's picture,
   * stretched four times: build 15's soft face. So every decode size has a
   * key of its own (`#<points>`), and no view can be given a picture made
   * for another size.
   *
   * Large avatars (the profile header, the edit preview) decode the whole
   * file and let expo-image shrink it after the load. An early resize fits
   * the photo INSIDE the circle's box, so a 4:3 face came out a third short
   * of covering it. A whole avatar is 512px since uploads were capped (older
   * ones up to 2048px), and only one or two are on screen at a time. A
   * just-picked photo is still camera-sized, so its preview decodes early.
   */
  const decodeEarly = inner < LARGE_AVATAR || !!localUri;
  const cacheKey =
    localUri || !avatarPath ? undefined : `${avatarPath}#${decodeEarly ? Math.round(inner) : 'full'}`;

  /*
   * Hidden from VoiceOver. Every call site either prints the name beside
   * the avatar or labels the control that holds it, so the initials only
   * made each row say the name twice — "J M, Jan McQueeny". Hiding the
   * outer view also keeps them out of the label iOS builds for an
   * unlabelled parent, which skips hidden children.
   */
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.avatarOuter,
        // round-ok: avatar
        { width: size, height: size, borderRadius: size / 2 },
        ring ? { borderWidth: ringWidth, borderColor: accent } : null,
      ]}>
      <View
        style={[
          styles.avatarInner,
          {
            width: inner,
            height: inner,
            // round-ok: avatar
            borderRadius: inner / 2,
            backgroundColor: colors.wine,
            borderColor: colors.wine,
          },
        ]}>
        {/*
          Cached on disk under the object path, not the URL. A signed URL
          carries a token that is new every time the path is signed, so
          keyed by URL (expo-image's default) the same face was downloaded
          again every hour and on every launch. The path is a safe key
          because an avatar is never overwritten: each upload is a new
          avatar-<timestamp>.jpg, so a new face is a new key.

          No key while a just-picked local image is showing. That preview is
          not the object at avatarPath, and filed under its key it would
          show the OLD avatar — whatever the disk cache holds for that path.
        */}
        {photo ? ( // full-size-ok: only past LARGE_AVATAR, where the file is bounded (decodeEarly)
          <Image
            source={{ uri: photo, cacheKey }}
            cachePolicy="memory-disk"
            /*
             * Small avatars decode at the circle's size, not the file's.
             * Avatars were stored at up to 2048px — about 16 MB each once
             * decoded — and a list of 24-57pt faces filled the image cache in
             * a screenful, which is the lag that built up until the app died.
             */
            enforceEarlyResizing={decodeEarly}
            style={styles.avatarPhoto}
            contentFit="cover"
          />
        ) : (
          <Text
            // The disc is a fixed size, so its initials must not grow past it.
            allowFontScaling={false}
            style={[styles.avatarText, { fontSize: Math.max(11, Math.round(inner * 0.4)), color: colors.textOnWine }]}>
            {initials || '?'}
          </Text>
        )}
      </View>
    </View>
  );
}

/* ==================================================================== */
/* Structure                                                            */
/* ==================================================================== */

/**
 * A heading for a stretch of a screen, and announced as one.
 *
 * Sentence case, Inter, no tracking. It replaces the letterspaced
 * uppercase taupe label, which the code's own comment called "the habit
 * that most makes an interface look machine-designed": a heading is
 * written as it is read.
 *
 * `content` (16 SemiBold, ink) heads a part of a page: "How it's made".
 * `group` (14 SemiBold, muted, 16pt inset) names the ListGroup beneath it,
 * lined up with that group's row titles, as iOS Settings does. `strong`
 * sets a group header in ink rather than muted, for the one group that
 * matters most on its screen (Activity's "New").
 *
 * `tone="lining"` is for a header on the cabinet's lining: title and
 * action in onLining (wine is 1.22:1 there), a group title onLiningMuted.
 *
 * The header role is what VoiceOver's Headings rotor jumps between. Long
 * screens (a drink's recipe, Settings, the shelves of My Bar) are built
 * from these, and without the role the only way to "Delete account" or
 * "Spirits" was to swipe past everything above it.
 *
 * Layout-neutral: no margins of its own; each screen places it.
 */
export function SectionHeader({
  title,
  size = 'content',
  action,
  tone = 'paper',
  strong,
  style,
}: {
  title: string;
  size?: 'content' | 'group';
  action?: { label: string; onPress: () => void };
  tone?: 'paper' | 'lining';
  /** A group header in ink rather than muted. */
  strong?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const group = size === 'group';
  const lining = tone === 'lining';
  const muted = group && !strong;
  const titleInk = lining
    ? muted
      ? colors.onLiningMuted
      : colors.onLining
    : muted
      ? colors.textMuted
      : colors.text;
  return (
    <View style={[styles.sectionHeader, group && styles.sectionHeaderGroup, style]}>
      <Text
        style={[group ? textRole.groupTitle : textRole.sectionTitle, styles.sectionTitle, { color: titleInk }]}
        accessibilityRole="header">
        {title}
      </Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={({ pressed }) => pressed && styles.textPressed}>
          <Text style={[styles.sectionAction, lining && { color: colors.onLining }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * A panel on the page.
 *
 * ONE EDGE, DRAWN ONCE: a 1pt `line` around white, no shadow. Measured
 * against this palette, white on cream is 1.11:1, the old `cardBorder`
 * hairline added only 1.21:1 against the card face, and the shadow that
 * used to sit under it was doing the tint's job twice — the same
 * separation smeared over 8pt of blur instead of landing on a boundary.
 * `line` is an edge you can see without hunting for it, and soft drop
 * shadows under everything are the most reliable tell that nobody decided
 * where the light was coming from.
 *
 * Surfaces that genuinely float (the tab bar, sheets) carry their own
 * elevation and are not Cards.
 *
 * `surface="mat"` is bone card stock (colors.mat) instead of white: the
 * drink page's spec card, where the card is a printed object rather than
 * a panel. The edge is the same `line`; the one
 * mat card that lies on the cellar ground adds `elevation.paper` itself.
 */
export function Card({
  children,
  surface = 'white',
  style,
}: {
  children: React.ReactNode;
  surface?: 'white' | 'mat';
  style?: ViewStyle | (ViewStyle | false | undefined)[];
}) {
  return <View style={[styles.card, surface === 'mat' && styles.cardMat, style]}>{children}</View>;
}

/** Where a ListRow sits in its ListGroup. Null outside a group. */
const ListSlotContext = createContext<{ last: boolean } | null>(null);

/**
 * Rows in a panel: a Card that clips its rows to its corners and tells
 * the last one to drop its separator, so a group never ends on a rule
 * that runs into its own edge.
 *
 * Through context, not cloneElement: a row can be wrapped (a fragment
 * aside) and still know where it sits. Pass rows as direct children.
 */
export function ListGroup({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const rows = React.Children.toArray(children);
  return (
    <View style={[styles.card, styles.listGroup, style]}>
      {rows.map((row, i) => (
        <ListSlotContext.Provider
          key={React.isValidElement(row) && row.key != null ? row.key : i}
          value={{ last: i === rows.length - 1 }}>
          {row}
        </ListSlotContext.Provider>
      ))}
    </View>
  );
}

interface ListRowBaseProps {
  title: string;
  /** Up to two lines. */
  subtitle?: string;
  leading?: { icon: IconName; color?: string } | { node: React.ReactNode };
  trailing?: 'chevron' | { text: string } | { node: React.ReactNode };
  /** Absent: a static row, not a button. */
  onPress?: () => void;
  /** SemiBold title: people's names, drink names in a list. */
  emphasis?: boolean;
  /** Title and icon in danger, and never a chevron. */
  destructive?: boolean;
  disabled?: boolean;
  /** A spinner in place of the leading icon while the row's action runs. */
  busy?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export type ListRowProps = ListRowBaseProps &
  (
    | { titleRole?: 'row'; titleMeasure?: undefined }
    | {
        /**
         * The title is a drink's name: drawn through DrinkName in
         * `textRole.rowName` (Playfair 18/22, Dynamic Type cap 1.4), with no
         * line limit, fitted to `titleMeasure`.
         */
        titleRole: 'name';
        /**
         * The title column's width in points: window width less the gutters,
         * the row's padding, the leading node and the trailing node. DrinkName
         * shrinks a name with a long word to fit it instead of breaking the
         * word, so it has to know the column without waiting for a layout.
         */
        titleMeasure: number;
      }
  );

/**
 * One row of a list: Settings, a country picker, Activity, connections.
 *
 * 52pt for one line, 64pt with a subtitle or a leading node (an avatar or
 * a drink thumbnail). Pressed, it fills `bgSunk` — a fill, not a scale.
 * Its own fill is clear, so in a ListGroup it shows the group's white and
 * on the page it shows the page.
 *
 * The separator is a hairline that starts at the title's left edge and
 * runs to the row's right edge, as iOS's own lists do: the leading column
 * stays one unbroken strip. The last row of a group draws none.
 *
 * `titleRole="name"` is for a list of drinks (My Bar, Log, Add a drink):
 * the title is the drink's name, set in Playfair and never truncated.
 */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  emphasis,
  destructive,
  disabled,
  busy,
  accessibilityLabel,
  accessibilityHint,
  titleRole,
  titleMeasure,
}: ListRowProps) {
  const slot = useContext(ListSlotContext);
  const tall = !!subtitle || (!!leading && 'node' in leading);
  const ink = destructive ? colors.danger : colors.text;
  const trailingText = trailing && typeof trailing === 'object' && 'text' in trailing ? trailing.text : null;
  const spoken = accessibilityLabel ?? [title, subtitle, trailingText].filter(Boolean).join(', ');

  const lead = busy ? (
    <ActivityIndicator size="small" color={ink} />
  ) : leading ? (
    'icon' in leading ? (
      <Icon name={leading.icon} size={22} color={destructive ? colors.danger : (leading.color ?? colors.text)} />
    ) : (
      leading.node
    )
  ) : null;

  const end =
    trailing === 'chevron' ? (
      destructive ? null : (
        <Icon name="chevronRight" size={18} color={colors.textFaint} />
      )
    ) : trailing && 'text' in trailing ? (
      <Text style={styles.rowTrailingText}>{trailing.text}</Text>
    ) : trailing ? (
      trailing.node
    ) : null;

  const body = (
    <>
      {lead ? <View style={styles.rowLeading}>{lead}</View> : null}
      <View style={styles.rowMain}>
        <View style={styles.rowText}>
          {titleRole === 'name' ? (
            <DrinkName name={title} role={textRole.rowName} measure={titleMeasure!} cap={1.4} color={ink} />
          ) : (
            <Text style={[textRole.rowTitle, { color: ink }, emphasis && styles.rowTitleEmphasis]}>
              {title}
            </Text>
          )}
          {subtitle ? (
            <Text style={styles.rowSubtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {end}
        {slot && !slot.last ? <View style={styles.rowSeparator} /> : null}
      </View>
    </>
  );

  const box = [styles.row, tall && styles.rowTall, disabled && styles.buttonDisabled];

  if (!onPress) {
    /*
     * A static row is read as one element, unless it holds a node of its
     * own at the end (a switch, a Follow button): grouping it would leave
     * that control unreachable, so its parts are read in turn instead.
     */
    const holdsControl = !!trailing && typeof trailing === 'object' && 'node' in trailing;
    return (
      <View
        style={box}
        accessible={!holdsControl}
        accessibilityLabel={holdsControl ? undefined : spoken}
        accessibilityHint={accessibilityHint}>
        {body}
      </View>
    );
  }

  /*
   * A pressable row is ONE button to VoiceOver, so a control inside it
   * (a trailing node) cannot be reached on its own. A row that needs both
   * should be static, with its own controls.
   */
  return (
    <Pressable
      onPress={disabled || busy ? undefined : onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      style={({ pressed }) => [...box, pressed && styles.rowPressed]}>
      {body}
    </Pressable>
  );
}

/** A hairline rule in `line`. `inset` starts it that far from the left. */
export function Divider({ style, inset }: { style?: ViewStyle; inset?: number }) {
  return <View style={[styles.divider, inset ? { marginLeft: inset } : null, style]} />;
}

/**
 * "or" between two ways of doing one thing: a rule, the word, a rule.
 * No margins of its own. The rules are decoration and hidden from
 * VoiceOver; the word is read.
 */
export function OrDivider({ label = 'or', style }: { label?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.orRow, style]}>
      <View style={styles.orRule} accessibilityElementsHidden importantForAccessibility="no" />
      <Text style={styles.orLabel}>{label}</Text>
      <View style={styles.orRule} accessibilityElementsHidden importantForAccessibility="no" />
    </View>
  );
}

/**
 * A flat 4pt bar: square ends, a sunk track, a wine fill. It was an 8pt
 * capsule, which made a measurement look like a button. On the lining
 * (`tone="lining"`) the track is a `liningLine` rule and the fill bone,
 * since wine on lining is 1.22:1.
 *
 * The fill eases to a new value, but its first frame is already the right
 * width (Reanimated resolves an animation in its first style pass to its
 * target), so a stalled frame loop can only delay an update, never hide
 * the progress. The figure beside it, and `accessibilityValue`, carry the
 * number regardless.
 */
export function ProgressBar({
  value,
  max,
  /**
   * Wine by default (bone on lining): a progress bar in this app measures
   * collection, which is the affirmative colour's job. Callers pass a
   * category colour only for the per-category breakdown, where the bar
   * identifies a category, not progress.
   */
  color,
  height = 4,
  tone = 'paper',
}: {
  value: number;
  max: number;
  color?: string;
  height?: number;
  tone?: 'paper' | 'lining';
}) {
  const lining = tone === 'lining';
  const fillColor = color ?? (lining ? colors.onLining : colors.wine);
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const reduced = useReducedMotion();

  const fill = useAnimatedStyle(() => ({
    width: reduced ? `${pct}%` : withTiming(`${pct}%`, { duration: motion.slow }),
  }));

  return (
    <View
      style={[styles.barTrack, lining && styles.barTrackLining, { height }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max, now: value }}>
      <Animated.View style={[{ height, backgroundColor: fillColor }, fill]} />
    </View>
  );
}

/* ==================================================================== */
/* Notice                                                               */
/* ==================================================================== */

const NOTICE_TONE = {
  error: { edge: colors.danger + '55', bg: colors.dangerWash, fg: colors.danger, icon: 'alert' },
  success: { edge: colors.wine + '55', bg: colors.wineWash, fg: colors.wine, icon: 'check' },
  info: { edge: colors.line, bg: colors.surface, fg: colors.textMuted, icon: 'alert' },
} as const satisfies Record<string, { edge: string; bg: string; fg: string; icon: IconName }>;

/**
 * A message in a box, inline with the content: a failed refresh over a
 * feed that is still shown, a sent email, a form-level error.
 *
 * It replaces six private copies (an errorBox here, a noticeBox there)
 * that each picked their own radius, padding and red. The glyph says the
 * tone as well as the colour does.
 *
 * Errors are announced (iOS has no live regions); the live region stays
 * for Android.
 */
export function Notice({
  tone,
  children,
  action,
  style,
}: {
  tone: 'error' | 'success' | 'info';
  children: React.ReactNode;
  action?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
}) {
  const t = NOTICE_TONE[tone];
  useAnnounce(tone === 'error' && typeof children === 'string' ? children : null);
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.notice, { borderColor: t.edge, backgroundColor: t.bg }, style]}>
      <Icon name={t.icon} size={18} color={t.fg} />
      <Text style={[textRole.helper, styles.noticeText, { color: t.fg }]}>{children}</Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          // 13 above and below an 18pt line: the 44pt touch floor.
          hitSlop={{ top: 13, bottom: 13, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={({ pressed }) => pressed && styles.textPressed}>
          <Text style={[styles.noticeAction, { color: t.fg }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ==================================================================== */
/* Segmented control                                                    */
/* ==================================================================== */

export interface SegmentItem<K extends string> {
  key: K;
  label: string;
  /** Spoken instead of `label`, when whose screen this is changes the wording. */
  a11yLabel?: string;
  icon?: IconName;
  /** Only icons with a solid variant should fill when active. */
  fillActive?: boolean;
  /** A trailing figure, shown when non-zero: "Drinks 48". */
  count?: number;
}

/** Track padding: the gap between the track's edge and the thumb. */
const SEG_PAD = 2;

/**
 * Segmented control with a thumb that SLIDES between options.
 *
 * ONE CONTROL. The profile's sections and My Bar's Shelf/Drinks switch were
 * two copies of this, with a comment asking whoever changed one to change
 * the other; that is how they had already drifted apart on the role their
 * segments announced. They share this now.
 *
 * A rectangle in a rectangle: a sunk 36pt track with a 1pt edge, and a
 * white thumb with its own edge at the concentric radius (control − 2).
 * The active label is INK, not wine: selection is not the call to action.
 *
 * The white thumb used to be a background swapped onto whichever segment
 * was active — two things blinking rather than one thing moving. A
 * travelling thumb is what makes a segmented control feel like a physical
 * switch. It travels on `motion.selection`, the spring every selection
 * indicator in the app answers with; under Reduce Motion it slides on a
 * short timing curve instead of springing. The active label's colour also
 * says which segment is on, so a thumb that stalls mid-way never hides it.
 *
 * Tapping the segment already selected does nothing, not even the
 * selection tick — iOS's own segmented control is the same, and a tick
 * with no change tells the finger something happened when nothing did.
 *
 * A `count` sits inside the segment, after the label, in tabular figures
 * so it does not jitter as it ticks: ticking a bottle in My Bar and
 * watching "Drinks 48" tick up is the loop that screen is built on.
 *
 * Layout-neutral: the track carries no outer margin, so each screen places
 * it with `style`.
 */
export function SegmentedControl<K extends string>({
  items,
  value,
  onChange,
  style,
}: {
  items: readonly SegmentItem<K>[];
  value: K;
  onChange: (key: K) => void;
  style?: ViewStyle;
}) {
  const [barW, setBarW] = useState(0);
  const index = Math.max(0, items.findIndex((i) => i.key === value));

  // Inside the track's 1pt edge and its padding.
  const segW = barW > 0 ? (barW - stroke.edge * 2 - SEG_PAD * 2) / items.length : 0;

  return (
    <View
      // 'tabbar', not 'tablist': on iOS only this role carries the TabBar
      // trait, which is what makes VoiceOver say "tab, 1 of 2" for each
      // segment inside. The segments themselves are buttons (see below).
      accessibilityRole="tabbar"
      style={[styles.segments, style]}
      onLayout={(e) => setBarW(e.nativeEvent.layout.width)}>
      {segW > 0 ? <SegmentThumb index={index} segW={segW} /> : null}
      {items.map((item) => {
        const active = value === item.key;
        const spoken = item.a11yLabel ?? item.label;
        return (
          <Pressable
            key={item.key}
            onPress={() => {
              if (active) return;
              onChange(item.key);
              haptic.select();
            }}
            hitSlop={{ top: 4, bottom: 4 }}
            /*
             * 'button', not 'tab'. React Native gives 'tab' no trait at all
             * on iOS, so VoiceOver read a bare "Your posts, selected" with
             * nothing to say it could be pressed. A selected button inside
             * the tab bar is how the tab bar at the foot of the app is read.
             */
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.count ? `${spoken}, ${formatCount(item.count)}` : spoken}
            style={styles.segment}>
            {item.icon ? (
              <Icon
                name={item.icon}
                size={17}
                color={active ? colors.text : colors.textMuted}
                filled={active && !!item.fillActive}
              />
            ) : null}
            <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
              {item.label}
            </Text>
            {item.count ? (
              <Text style={[styles.segmentLabel, tabular, active && styles.segmentLabelActive]}>
                {formatCount(item.count)}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The thumb, mounted only once the track has a width. Reanimated resolves
 * an animation in its first pass to its target, so a fresh thumb is drawn
 * under the active segment from its first frame and only travels when the
 * selection changes. Driven from the track itself it started at x 0 before
 * the width was known, so a control that opened on its second segment slid
 * across on every appearance, and a stalled frame loop after a cold start
 * would have left it under the wrong label.
 */
function SegmentThumb({ index, segW }: { index: number; segW: number }) {
  const reduced = useReducedMotion();
  const x = useDerivedValue(() => {
    const target = index * segW;
    return reduced
      ? withTiming(target, { duration: motion.fast })
      : withSpring(target, motion.selection);
  });
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.segmentThumb, { width: segW, left: SEG_PAD }, slide]}
    />
  );
}

/* ==================================================================== */
/* Search field                                                         */
/* ==================================================================== */

type InputProps = React.ComponentProps<typeof TextInput>;

/**
 * Every TextInput prop passes through (autoFocus, maxLength, onKeyPress…)
 * except the ones that make it the app's search field and not a screen's
 * own: the text style, the placeholder colour, and autocorrect,
 * autocapitalisation and multiline, which a query never wants.
 */
export interface SearchFieldProps
  extends Omit<
    InputProps,
    | 'value'
    | 'onChangeText'
    | 'placeholder'
    | 'accessibilityLabel'
    | 'style'
    | 'ref'
    | 'placeholderTextColor'
    | 'autoCorrect'
    | 'autoCapitalize'
    | 'multiline'
  > {
  value: string;
  onChangeText: (text: string) => void;
  /** Names what is searched — "Name, style or country". Never the only label. */
  placeholder: string;
  /** What VoiceOver calls the field. Required: the placeholder is not a label. */
  accessibilityLabel: string;
  /**
   * The field sits on a white card rather than on the page. A white field
   * on a white card has only its edge to separate it, so it takes the
   * page's cream instead.
   */
  onCard?: boolean;
  /** A slot after the text and before the clear button, e.g. a spinner. */
  trailing?: React.ReactNode;
  /** A plain prop under React 19; lets a screen focus the field. */
  ref?: React.Ref<TextInput>;
  /** The box's outer placement: margins and width. The text inside is fixed. */
  style?: ViewStyle;
  /**
   * v3.3 Brass D20: 'lining' sinks the field into the cabinet as a well,
   * the cellar's fill with an opaque onLiningFaint edge (4.19:1 against
   * the grained lining around it; the translucent liningControl, laid
   * over the cellar fill, came to 2.62:1 there), bone text and
   * an onLiningMuted glyph and placeholder (6.79:1 on lining, more in the
   * cellar). The mock's inset shadow is left out: the field scrolls with
   * the Dex's header, and v3.3 casts no shadow from what scrolls.
   */
  tone?: 'paper' | 'lining';
}

/**
 * The app's one search input.
 *
 * There were four — the Dex, Log, My Bar and Find friends — each built by
 * hand, and they had drifted on glyph size, clear-button reach and return
 * key. This is the Dex's, which the others had been measured against: a
 * white box on a 1pt `line` edge, 44pt tall (the touch floor, on the 4pt
 * grid) with 16pt text so iOS never zooms the screen on focus.
 *
 * Focus darkens the edge to `lineControl` and nothing more. A search field
 * is not a form input: it has no label to float and no error to ring.
 *
 * The glyph and the placeholder share textMuted, so the glyph never sits
 * fainter than the words beside it — at textFaint both were 2.5:1 in a sunk
 * well.
 *
 * The clear button appears only when there is something to clear. It is a
 * 28pt box plus 8pt of slop on every side, so 44pt to the finger; the bare
 * 16pt glyph it replaced was 31. No haptic: clearing is a text edit, like
 * the system's own clear button, not an action.
 *
 * Search, not autocorrect: names like "Negroni" and "Ardbeg" are exactly
 * what iOS "corrects", and a query is not a sentence to capitalise.
 */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  onCard,
  trailing,
  returnKeyType = 'search',
  ref,
  style,
  onFocus,
  onBlur,
  tone = 'paper',
  ...input
}: SearchFieldProps) {
  const [focused, setFocused] = useState(false);
  const lining = tone === 'lining';
  const muted = lining ? colors.onLiningMuted : colors.textMuted;
  return (
    <View
      style={[
        styles.search,
        onCard && styles.searchOnCard,
        lining && styles.searchLining,
        focused && (lining ? styles.searchLiningFocused : styles.searchFocused),
        style,
      ]}>
      <Icon name="search" size={18} color={muted} />
      <TextInput
        {...input}
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        placeholder={placeholder}
        placeholderTextColor={muted}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType={returnKeyType}
        keyboardAppearance={lining ? 'dark' : input.keyboardAppearance}
        style={[styles.searchInput, lining && styles.searchInputLining]}
        accessibilityLabel={accessibilityLabel}
      />
      {trailing}
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText('')}
          hitSlop={space.sm}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={({ pressed }) => [styles.searchClear, pressed && styles.glyphPressed]}>
          <Icon name="close" size={16} color={muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* ==================================================================== */
/* Form fields                                                          */
/* ==================================================================== */

/** Where a field row sits inside a FieldGroup. Null for a field on its own. */
type GroupSlot = {
  position: 'only' | 'first' | 'middle' | 'last';
  /** The group's hint or error, spoken as each row's hint. */
  note: string | null;
};
const GroupSlotContext = createContext<GroupSlot | null>(null);

/**
 * From a field box's outer edge to its content, the 1pt edge included, so
 * a row is 56pt (8 + 16 label + 2 + 22 value + 8) whether it draws its own
 * edge or sits in a FieldGroup that draws it.
 */
const FIELD_PAD_V = 8;
/** Space between the label and the value line. */
const LABEL_GAP = 2;
/** How much bigger the resting label is drawn: 12pt label → 16pt value size. */
const REST_SCALE = 4 / 3;
/** A resting label that is already on its line: value size, left edge held. */
const REST_LABEL: TextStyle = { transformOrigin: 'left center', transform: [{ scale: REST_SCALE }] };

/**
 * The resting label: drawn at value size where the value would sit, while
 * the field is empty and unfocused, so an empty field reads as one line
 * that names itself. Focus, or a value, puts it back on top at once.
 *
 * NO ANIMATION, on purpose. Reanimated can stall for 10–20 seconds after a
 * cold start in a Release build, and the sign-in screen is exactly what is
 * on screen then. A float that stalled half way would leave the label lying
 * on top of the number being typed. A jump cannot stall.
 *
 * Every offset is MEASURED, never hard-coded, so the label holds at every
 * Dynamic Type size: the box's height, and the label's top and height in
 * it. Until the first layout lands, the default sizes stand in for them.
 * Scaled about its left edge, the label keeps its left margin.
 */
function useRestingLabel(resting: boolean, multiline: boolean) {
  const [boxH, setBoxH] = useState<number>(layout.field);
  const [label, setLabel] = useState({
    y: FIELD_PAD_V,
    h: textRole.fieldLabel.lineHeight,
  });

  const onBoxLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setBoxH((prev) => (prev === h ? prev : h));
  };
  const onLabelLayout = (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    setLabel((prev) => (prev.y === y && prev.h === height ? prev : { y, h: height }));
  };

  /*
   * Where the label's centre goes: the middle of the box for a one-line
   * field, and the first value line for a multiline one, whose value
   * starts at the top.
   */
  const target = multiline
    ? label.y + label.h + LABEL_GAP + textRole.fieldValue.lineHeight / 2
    : boxH / 2;
  const labelStyle: TextStyle | null = resting
    ? {
        transformOrigin: 'left center',
        transform: [{ translateY: target - (label.y + label.h / 2) }, { scale: REST_SCALE }],
      }
    : null;

  return { onBoxLayout, onLabelLayout, labelStyle };
}

/**
 * The corners a row takes where it meets its group's corners: all four for
 * the only row, the top two for the first, the bottom two for the last, and
 * none for a row in the middle, which meets only other rows.
 */
function slotCorners(position: GroupSlot['position'], r: number): ViewStyle {
  switch (position) {
    case 'only':
      return { borderRadius: r };
    case 'first':
      return { borderTopLeftRadius: r, borderTopRightRadius: r };
    case 'last':
      return { borderBottomLeftRadius: r, borderBottomRightRadius: r };
    default:
      return {};
  }
}

/**
 * The box every field row draws: 56pt (112 multiline), an 8pt corner, a
 * 1pt `lineControl` edge on white. Inside a FieldGroup the group draws the
 * edge, and the row draws none: it sits inside that edge, rounded only
 * where it meets the group's corners, at the radius concentric with the
 * edge's inner side (`control` less the edge). The group does not clip its
 * rows (styles.fieldGroup says why), so these corners are what keep a
 * row's fill (a pressed SelectField, a disabled Field) off the group's
 * rounded edge.
 */
function fieldBoxStyle(slot: GroupSlot | null, multiline: boolean, sunk: boolean) {
  return [
    styles.fieldBox,
    multiline && styles.fieldBoxMultiline,
    slot ? styles.fieldBoxInGroup : null,
    slot ? slotCorners(slot.position, radius.control - stroke.edge) : null,
    sunk && styles.fieldBoxSunk,
  ];
}

/**
 * The 2pt ring a focused or invalid row draws over itself.
 *
 * An overlay, so focusing never moves the layout by a pixel: a border that
 * thickened on focus would push its own text. It straddles the box's outer
 * edge, 1pt outside and 1pt in, covering the 1pt edge beneath.
 *
 * On its own a field's ring sits 1pt outside a box of radius `control`, so
 * its corners are `control + 1`, concentric. Inside a group the row has no
 * edge of its own: 1pt outside the row is the group's own outer edge, so
 * the ring's corners match the group's (`control`) where the row meets a
 * corner, and are square where it meets another row. There the ring also
 * covers the separator it shares with its neighbour, which is why the row
 * is lifted above its siblings while ringed.
 */
function FieldRing({ color, slot }: { color: string; slot: GroupSlot | null }) {
  const corners = slot ? slotCorners(slot.position, radius.control) : { borderRadius: radius.control + 1 };
  return <View pointerEvents="none" style={[styles.fieldRing, corners, { borderColor: color }]} />;
}

/**
 * The line under a field or a group: the error while there is one, with
 * the alert glyph, and the hint otherwise.
 */
function FieldNote({ text, error, gap }: { text: string; error: boolean; gap: number }) {
  return (
    <View style={[styles.fieldNote, { marginTop: gap }]}>
      {error ? <Icon name="alert" size={14} color={colors.danger} /> : null}
      <Text
        style={[textRole.helper, styles.fieldNoteText, error && styles.fieldNoteError]}
        accessibilityLiveRegion={error ? 'polite' : 'none'}>
        {text}
      </Text>
    </View>
  );
}

/**
 * Every TextInput prop passes through — autoComplete, textContentType,
 * inputMode, maxLength, returnKeyType, onSubmitEditing, submitBehavior,
 * autoFocus, editable, placeholder — except what Field decides itself: the
 * text style (every field is drawn one way), the placeholder colour,
 * masking (see `secure`) and the spoken hint (see `hint` and `error`).
 */
type FieldBaseProps = Omit<
  InputProps,
  | 'value'
  | 'onChangeText'
  | 'style'
  | 'ref'
  | 'placeholderTextColor'
  | 'secureTextEntry'
  | 'accessibilityHint'
  | 'accessibilityLabel'
> & {
  value: string;
  onChangeText: (v: string) => void;
  /** A password: masked, with a reveal toggle at the end of the value line. */
  secure?: boolean;
  /** Defaults to 'none', which is right for everything but names and prose. */
  autoCapitalize?: InputProps['autoCapitalize'];
  /** Defaults to off. Turn it on for prose (a bio), never for a handle. */
  autoCorrect?: boolean;
  /** Prose that wraps: a taller box, text from the top. */
  multiline?: boolean;
  /** Called when the field takes focus, after its own focus ring shows. */
  onFocus?: InputProps['onFocus'];
  /** Called when the field loses focus, after its own focus ring drops. */
  onBlur?: InputProps['onBlur'];
  /** A plain prop under React 19, passed to the TextInput; lets a form move focus. */
  ref?: React.Ref<TextInput>;
  /** The rule or the promise — "3 to 20 letters, numbers or underscores". */
  hint?: string;
  /**
   * What is wrong with the value now. Shown in place of `hint` while set,
   * and announced when it appears. See the note on Field.
   */
  error?: string | null;
  /**
   * The error ring with no message line: a row inside a FieldGroup, whose
   * message the group shows.
   */
  invalid?: boolean;
  /** Fixed leading character, e.g. the '@' on a handle. Not part of the value. */
  prefix?: string;
  /**
   * A node at the right end of the box, vertically centred: "Change" on a
   * read-only email row. Not combined with `secure`, whose reveal toggle
   * already sits there.
   */
  trailing?: React.ReactNode;
  /**
   * Colours the hint itself as a problem: the older spelling of `error`,
   * for a form that swaps its hint text rather than passing both.
   */
  hintIsError?: boolean;
  /** The field's outer box: margins and width. The input inside is fixed. */
  style?: StyleProp<ViewStyle>;
};

export type FieldProps = FieldBaseProps &
  (
    | {
        label: string;
        labelHidden?: false;
        /** Spoken instead of `label`, when the visible label is terse ("About"). */
        accessibilityLabel?: string;
      }
    | {
        /**
         * No visible label: for a row of inputs under visible column
         * headings (a recipe's amount and ingredient). The placeholder
         * shows at rest, and the spoken name is required.
         */
        labelHidden: true;
        label?: string;
        accessibilityLabel: string;
      }
  );

/**
 * A labelled text field: the app's one form input.
 *
 * THE LABEL IS INSIDE THE BOX. An empty field shows its label at value
 * size, where the value will go; focus or a value moves it to the top of
 * the box in 12pt, with the value under it (see useRestingLabel). The
 * label is always visible, so a placeholder never stands in for one; a
 * placeholder ("you@example.com") shows only while the field is focused
 * and still empty.
 *
 * It lived in AuthGate, and edit-profile drew its own three fields beside
 * it. It is here so every form in the app draws, labels and announces a
 * field one way. Three password fields that behaved subtly differently
 * would be worse than any coupling this creates.
 *
 * FOCUS IS INK, ERROR IS RED, AND NEITHER MOVES ANYTHING. A 2pt ring is
 * drawn over the edge (FieldRing): `lineInk` while focused, `danger` while
 * in error. Focus used to turn the edge wine, which made the field compete
 * with the one wine button on the screen.
 *
 * AN ERROR REPLACES THE HINT; IT DOES NOT STACK UNDER IT. The line below
 * the field shows one thing: the error while there is one, the hint
 * otherwise. A grey rule with a red complaint beneath it is two signals
 * for one state, and the second pushes the form down mid-typing. So write
 * an error that stands on its own ("Usernames are 3 to 20 letters,
 * numbers or underscores", not "Too short"): it is all the person sees.
 *
 * Linked for VoiceOver twice over. That line is the input's
 * accessibilityHint, so it is read with the field instead of being left as
 * a separate element to find afterwards. It also stays a visible, readable
 * Text of its own, because a VoiceOver user can switch hints off, and an
 * error that lived only in the hint would then never be heard. An error is
 * also announced when it appears: iOS has no live regions.
 *
 * Inside a FieldGroup the group draws the box, the separators and the
 * message line; the row draws its own ring.
 */
export function Field(props: FieldProps) {
  const {
    label,
    labelHidden,
    value,
    onChangeText,
    secure,
    autoCapitalize = 'none',
    autoCorrect = false,
    multiline = false,
    onFocus,
    onBlur,
    ref,
    hint,
    error,
    invalid,
    prefix,
    trailing,
    hintIsError,
    accessibilityLabel,
    placeholder,
    editable,
    style,
    ...input
  } = props;
  const slot = useContext(GroupSlotContext);
  const [reveal, setReveal] = useState(false);
  const [focused, setFocused] = useState(false);
  const [trailingW, setTrailingW] = useState(0);
  const inner = useRef<TextInput>(null);
  // Forward the caller's ref to the TextInput itself, so focus() and
  // blur() work from outside; the box keeps its own handle for tap-to-focus.
  useImperativeHandle(ref, () => inner.current as TextInput, []);

  const resting = !labelHidden && !focused && value.length === 0;
  const { onBoxLayout, onLabelLayout, labelStyle } = useRestingLabel(resting, multiline);

  const note = slot ? null : error || hint || null;
  const noteIsError = !slot && (!!error || (!!hint && !!hintIsError));
  // `invalid` rings without a message of its own; the group says why.
  const inError = !!error || !!invalid || (!!hint && !!hintIsError);
  const ringColor = inError ? colors.danger : focused ? colors.lineInk : null;
  const disabled = editable === false;

  // An error is news; the same hint as help is not.
  useAnnounce(noteIsError ? note : null);

  return (
    <View style={[slot && ringColor ? styles.fieldLifted : null, style]}>
      <View>
        <Pressable
          // Tapping anywhere in the box, the label included, starts typing.
          onPress={() => inner.current?.focus()}
          accessible={false}
          onLayout={onBoxLayout}
          style={[fieldBoxStyle(slot, multiline, disabled), labelHidden && styles.fieldBoxCentred]}>
          {labelHidden ? null : (
            /*
              Hidden from VoiceOver because the input carries the same label;
              otherwise every field was announced twice, once as text and once
              as the field. A tap on it lands on the box, which focuses the
              input.
            */
            <Text
              onLayout={onLabelLayout}
              // One line while drawn a third larger, so it cannot wrap into
              // the line below; on top it may wrap at the largest sizes.
              numberOfLines={resting ? 1 : undefined}
              style={[textRole.fieldLabel, styles.fieldLabel, labelStyle]}
              accessibilityElementsHidden
              importantForAccessibility="no">
              {label}
            </Text>
          )}
          <View style={[styles.fieldValueRow, !labelHidden && styles.fieldValueRowUnderLabel]}>
            {/*
              Hidden for the same reason as the label: read on its own it is
              a stray "at sign" between the field's name and the field. Only
              while the label is on top: at rest the label sits on this line.

              Drawn beside the value rather than inside it: an '@' the user
              can delete or double up on is a handle that never matches
              anybody.
            */}
            {prefix && !resting ? (
              <Text
                style={[textRole.fieldValue, styles.fieldPrefix]}
                accessibilityElementsHidden
                importantForAccessibility="no">
                {prefix}
              </Text>
            ) : null}
            <TextInput
              {...input}
              ref={inner}
              value={value}
              onChangeText={onChangeText}
              editable={editable}
              placeholder={labelHidden || focused ? placeholder : undefined}
              placeholderTextColor={colors.textMuted}
              secureTextEntry={secure && !reveal}
              autoCapitalize={autoCapitalize}
              autoCorrect={autoCorrect}
              multiline={multiline}
              onFocus={(e) => {
                setFocused(true);
                onFocus?.(e);
              }}
              onBlur={(e) => {
                setFocused(false);
                onBlur?.(e);
              }}
              style={[
                styles.fieldInput,
                multiline && styles.fieldInputMultiline,
                disabled && styles.fieldInputDisabled,
                trailing && !secure ? { paddingRight: trailingW + space.sm } : null,
              ]}
              accessibilityLabel={accessibilityLabel ?? label}
              accessibilityHint={(slot ? slot.note : note) ?? undefined}
            />
            {secure ? (
              <Pressable
                onPress={() => setReveal((r) => !r)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={reveal ? 'Hide password' : 'Show password'}
                style={({ pressed }) => [styles.fieldReveal, pressed && styles.glyphPressed]}>
                <Icon name={reveal ? 'eyeOff' : 'eye'} size={18} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
          {trailing && !secure ? (
            <View
              style={styles.fieldTrailing}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                setTrailingW((prev) => (prev === w ? prev : w));
              }}>
              {trailing}
            </View>
          ) : null}
        </Pressable>
        {ringColor ? <FieldRing color={ringColor} slot={slot} /> : null}
      </View>
      {note ? <FieldNote text={note} error={noteIsError} gap={6} /> : null}
    </View>
  );
}

/**
 * Two or more field rows in one box: country over phone number, as the
 * system's own forms draw them.
 *
 * The group draws the outer edge and a full-width 1pt `lineControl`
 * separator between rows; each row draws only its own ring, so the person
 * can see WHICH row is live (one ring around the whole group would not
 * say). Rows learn where they sit through context, not cloneElement, so a
 * Field or a SelectField works as a row unchanged. Pass rows as direct
 * children.
 *
 * Below the group, one line: `error` (announced) in place of `hint`. Each
 * row's input also carries it as its spoken hint.
 */
export function FieldGroup({
  children,
  error,
  hint,
  style,
}: {
  children: React.ReactNode;
  error?: string | null;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const rows = React.Children.toArray(children);
  const note = error || hint || null;
  useAnnounce(error || null);

  return (
    <View style={style}>
      <View style={styles.fieldGroup}>
        {rows.map((row, i) => {
          const position: GroupSlot['position'] =
            rows.length === 1 ? 'only' : i === 0 ? 'first' : i === rows.length - 1 ? 'last' : 'middle';
          return (
            <React.Fragment key={React.isValidElement(row) && row.key != null ? row.key : i}>
              {i > 0 ? <View style={styles.fieldGroupRule} /> : null}
              <GroupSlotContext.Provider value={{ position, note }}>{row}</GroupSlotContext.Provider>
            </React.Fragment>
          );
        })}
      </View>
      {note ? <FieldNote text={note} error={!!error} gap={space.sm} /> : null}
    </View>
  );
}

/**
 * A field that opens a list instead of taking text: Country or region.
 *
 * The same row as Field, so it sits in a FieldGroup beside one without a
 * seam: the label on top whenever there is a value, at value size where
 * the value would go when there is not, and a chevron at the end. It is a
 * button, read as "label, value", with "Opens a list" as its hint.
 *
 * Pressed, it fills `bgSunk`. It takes no focus ring: it is not where
 * typing goes.
 */
export function SelectField({
  label,
  value,
  placeholder,
  onPress,
  disabled,
  accessibilityLabel,
  accessibilityHint = 'Opens a list',
  style,
}: {
  label: string;
  value?: string | null;
  placeholder?: string;
  onPress: () => void;
  disabled?: boolean;
  /** Replaces the spoken "label, value" when the visible value reads badly aloud. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const slot = useContext(GroupSlotContext);
  const shown = value || placeholder || null;
  /*
   * With nothing to show, the label is the column's only line, and the
   * column is centred in the box, so it is already where a value would
   * sit: it only needs drawing at value size. No measuring, unlike Field,
   * whose empty input still holds its line under the label.
   */
  const labelStyle: TextStyle | null = shown ? null : REST_LABEL;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (value ? `${label}, ${value}` : label)}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        fieldBoxStyle(slot, false, false),
        styles.selectBox,
        pressed && styles.rowPressed,
        disabled && styles.buttonDisabled,
        style,
      ]}>
      <View style={styles.selectText}>
        <Text numberOfLines={1} style={[textRole.fieldLabel, styles.fieldLabel, labelStyle]}>
          {label}
        </Text>
        {shown ? (
          <Text
            numberOfLines={1}
            style={[textRole.fieldValue, styles.fieldValueRowUnderLabel, { color: value ? colors.text : colors.textMuted }]}>
            {shown}
          </Text>
        ) : null}
      </View>
      <Icon name="chevronDown" size={20} color={colors.text} />
    </Pressable>
  );
}

/* ==================================================================== */
/* Empty state                                                          */
/* ==================================================================== */

/** Either the glyph or the art: one picture above the title, never none. */
type EmptyStateArt = { icon: IconName; art?: React.ReactNode } | { icon?: IconName; art: React.ReactNode };

const EMPTY_TONE = {
  paper: { glyph: colors.text, title: colors.text, body: colors.textMuted, action: 'primary', secondary: 'text' },
  dark: { glyph: colors.reelInk, title: colors.reelInk, body: colors.reelInkMuted, action: 'onDark', secondary: 'onDarkText' },
  lining: { glyph: colors.onLining, title: colors.onLining, body: colors.onLiningMuted, action: 'onLining', secondary: 'onLiningText' },
} as const satisfies Record<
  string,
  { glyph: string; title: string; body: string; action: ButtonVariant; secondary: ButtonVariant }
>;

/**
 * What a list says when it has nothing, or could not load.
 *
 * The glyph is drawn bare, with no disc behind it: an icon in a tinted
 * circle over a title is the most copied empty state there is. The title
 * is Inter, like the rest of the chrome; Playfair stays for the wordmark
 * and drink names.
 *
 * Conventions: an empty list shows its subject's glyph and one primary
 * action. A failure shows `alert`, "Could not load …", "Check your
 * connection and try again.", and `actionVariant="secondary"` "Try again".
 *
 * `tone="dark"` is for the reels ground, where wine is invisible: bone
 * type, an `onDark` action and an `onDarkText` secondary. `tone="lining"`
 * is the cabinet's (the Dex tray): onLining title, onLiningMuted body, an
 * `onLining` action and an `onLiningText` secondary, and no fill of its
 * own: the tray's grained lining shows through.
 *
 * `art` replaces the glyph with a picture of the thing that is missing:
 * the Dex's EmptyArt, a mounted drink (DexCard.tsx). It is a plain node,
 * not something this file looks up, so ui.tsx never imports DexCard.tsx
 * (which imports this file), and it is hidden from VoiceOver: the title
 * says what the picture shows. The art must be a real catalogue drink,
 * never an invented person or post.
 */
export function EmptyState({
  icon,
  art,
  title,
  body,
  action,
  actionVariant,
  secondaryAction,
  tone = 'paper',
}: EmptyStateArt & {
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
  /** Defaults to `primary` on paper, `onDark` on dark, `onLining` on lining; `secondary` for a retry. */
  actionVariant?: ButtonVariant;
  /** A quieter second way out, under the action: "Clear search". */
  secondaryAction?: { label: string; onPress: () => void };
  tone?: 'paper' | 'dark' | 'lining';
}) {
  const t = EMPTY_TONE[tone];
  return (
    <View style={[styles.empty, tone === 'dark' && styles.emptyDark]}>
      {art ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {art}
        </View>
      ) : icon ? (
        <Icon name={icon} size={36} color={t.glyph} />
      ) : null}
      <Text style={[textRole.emptyTitle, styles.emptyTitle, { color: t.title }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: t.body }]}>{body}</Text>
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          variant={actionVariant ?? t.action}
          style={styles.emptyAction}
        />
      ) : null}
      {secondaryAction ? (
        <Button
          label={secondaryAction.label}
          onPress={secondaryAction.onPress}
          variant={t.secondary}
          size="sm"
          style={styles.emptySecondary}
        />
      ) : null}
    </View>
  );
}

/* ==================================================================== */
/* Hold                                                                 */
/* ==================================================================== */

/** Nothing but the ground for this long, so a wait of a frame or two does not flash a spinner. */
export const HOLD_QUIET_MS = 400;
/** After this, the hold says what it is waiting for. */
export const HOLD_SLOW_MS = 8000;

/**
 * What a screen shows while it cannot draw its content yet: a first load,
 * a gate deciding, a permission being read.
 *
 * NEVER A FEATURELESS PAGE. A plain cream (or black) page is
 * indistinguishable from a screen that failed to load, which is exactly
 * how "switching tabs shows a blank screen" was reported. So: the ground
 * alone for HOLD_QUIET_MS, then a spinner, then at HOLD_SLOW_MS the
 * `slowMessage`, said aloud once, which should name what it is waiting for
 * and, where there is one, what still works ("Still connecting. The Dex
 * and Stats work without a connection.").
 *
 * The phases run on JS timers, not animations, so they advance even when
 * the UI thread's animation loop has stalled.
 *
 * `fill` (default) centres it in the whole screen on the ground colour;
 * `fill={false}` is for the empty slot of a list under its header.
 * `tone="dark"` is the reels ground: a bone spinner and bone-muted text.
 */
export function Hold({
  slowMessage,
  tone = 'paper',
  fill = true,
}: {
  slowMessage: string;
  tone?: 'paper' | 'dark';
  fill?: boolean;
}) {
  const [phase, setPhase] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    const quiet = setTimeout(() => setPhase(1), HOLD_QUIET_MS);
    const slow = setTimeout(() => setPhase(2), HOLD_SLOW_MS);
    return () => {
      clearTimeout(quiet);
      clearTimeout(slow);
    };
  }, []);
  useAnnounce(phase === 2 ? slowMessage : null);

  const dark = tone === 'dark';
  return (
    <View
      style={[
        fill ? styles.holdFill : styles.holdSlot,
        fill && { backgroundColor: dark ? colors.reelGround : colors.bg },
      ]}>
      {phase >= 1 ? (
        <ActivityIndicator color={dark ? colors.reelInk : colors.wine} accessibilityLabel="Loading" />
      ) : null}
      {phase === 2 ? (
        <Text style={[styles.holdText, dark && { color: colors.reelInkMuted }]}>{slowMessage}</Text>
      ) : null}
    </View>
  );
}

/* ==================================================================== */

const styles = StyleSheet.create({
  /* Buttons */
  button: {
    minHeight: layout.control,
    /* Never wider than its container: in a wrapping row of buttons a label
       at a large text size wraps inside its button (buttonLabel) instead of
       pushing the button off the screen edge. */
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: 20,
    borderRadius: radius.control,
    borderWidth: stroke.edge,
  },
  buttonSm: { minHeight: layout.controlSm, paddingHorizontal: 14 },
  /* Text buttons: no box to draw, so no corner, and the 44pt touch floor
     rather than the 48pt control height. */
  buttonBare: { minHeight: layout.hit, paddingHorizontal: space.md, borderRadius: radius.none },
  buttonBareSm: { minHeight: layout.controlSm, paddingHorizontal: space.sm, borderRadius: radius.none },
  buttonBlock: { alignSelf: 'stretch' },
  buttonDisabled: { opacity: 0.42 },
  /* At the largest text sizes a label wider than its button wraps inside it
     instead of running out past the edge. */
  buttonLabel: { flexShrink: 1, textAlign: 'center' },
  /* Loading: holds the mark's box so the spinner cannot widen the button. */
  buttonSlot: { alignItems: 'center', justifyContent: 'center' },
  /* A stack of provider rows: every mark in one column, 16pt in. */
  buttonSlotPinned: { position: 'absolute', left: space.lg },
  /* Room for the pinned mark on both sides, so a long label never runs
     under it and the label stays centred on the button. */
  buttonLabelPinned: { flexShrink: 1, textAlign: 'center', paddingHorizontal: 28 },
  /* Loading, inline and mark-less: the label keeps its width, unseen. */
  buttonLabelCovered: { opacity: 0 },
  buttonCover: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textPressed: { opacity: 0.5 },
  /* Glyph-only controls dim while held (iOS's own bar buttons do). */
  glyphPressed: { opacity: 0.6 },

  /* Media icon button */
  mediaButton: {
    width: layout.hit,
    height: layout.hit,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    borderWidth: stroke.edge,
    borderColor: colors.reelControlBorder,
    backgroundColor: colors.reelControlFill,
  },
  mediaButtonSelected: { backgroundColor: colors.reelInk, borderColor: colors.reelInk },
  mediaButtonPressed: { opacity: 0.8 },

  /* Tags */
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: layout.tag,
    paddingHorizontal: 6,
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    alignSelf: 'flex-start',
  },
  tagNeutral: { backgroundColor: colors.cardAlt, borderColor: colors.line },
  tagText: { fontFamily: fonts.bodyMedium, ...typeScale.tag },

  /* Chip */
  chip: {
    minHeight: layout.chip,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    borderWidth: stroke.edge,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.wineWash, borderColor: colors.wine },
  chipPressed: { backgroundColor: colors.bgSunk },
  chipLining: { backgroundColor: 'transparent', borderColor: colors.liningControl },
  chipLiningSelected: { backgroundColor: colors.onLining, borderColor: colors.onLining },
  chipLiningPressed: { backgroundColor: colors.liningPressed },
  chipLiningSelectedPressed: { backgroundColor: colors.onLiningMuted, borderColor: colors.onLiningMuted },
  chipLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.text,
  },
  chipLabelSelected: { fontFamily: fonts.bodySemiBold, color: colors.wine },
  chipCount: {
    fontFamily: fonts.bodyMedium,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
  },

  /* Avatar */
  avatarOuter: { alignItems: 'center', justifyContent: 'center' },
  avatarInner: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // Clips the photo to the circle; without it the image renders square
    // inside a round border.
    overflow: 'hidden',
  },
  avatarText: { fontFamily: fonts.bodySemiBold },
  /* Fills the inner circle, which already carries the radius and clips. */
  avatarPhoto: { width: '100%', height: '100%' },

  /* Section header */
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', gap: space.md },
  sectionHeaderGroup: { paddingHorizontal: space.lg },
  sectionTitle: { flex: 1 },
  sectionAction: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.bodySm.fontSize,
    lineHeight: typeScale.bodySm.lineHeight,
    color: colors.wine,
  },

  /* Card and list */
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: stroke.edge,
    borderColor: colors.line,
  },
  cardMat: { backgroundColor: colors.mat },
  listGroup: { overflow: 'hidden' },
  row: {
    minHeight: layout.row,
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingLeft: space.lg,
  },
  rowTall: { minHeight: layout.rowTall },
  rowPressed: { backgroundColor: colors.bgSunk },
  rowLeading: { justifyContent: 'center', marginRight: space.md, paddingVertical: space.md },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingRight: space.lg,
  },
  rowText: { flex: 1 },
  rowTitleEmphasis: { fontFamily: fonts.bodySemiBold },
  rowSubtitle: { ...textRole.rowSubtitle, color: colors.textMuted },
  rowTrailingText: {
    fontFamily: fonts.body,
    fontSize: typeScale.bodySm.fontSize,
    lineHeight: typeScale.bodySm.lineHeight,
    color: colors.textMuted,
  },
  /* Starts at the title's left edge (the start of rowMain), runs to the
     row's right edge. */
  rowSeparator: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: stroke.hair,
    backgroundColor: colors.line,
  },

  divider: { height: stroke.hair, backgroundColor: colors.line },

  orRow: { flexDirection: 'row', alignItems: 'center' },
  orRule: { flex: 1, height: stroke.edge, backgroundColor: colors.line },
  orLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    paddingHorizontal: space.md,
  },

  /* Square ends: a measurement, not a capsule. */
  barTrack: { width: '100%', backgroundColor: colors.bgSunk, overflow: 'hidden', borderRadius: radius.none },
  barTrackLining: { backgroundColor: colors.liningLine },

  /* Notice */
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.control,
    borderWidth: stroke.edge,
  },
  noticeText: { flex: 1 },
  noticeAction: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
  },

  /* Segmented control */
  segments: {
    flexDirection: 'row',
    minHeight: layout.segmented,
    padding: SEG_PAD,
    backgroundColor: colors.bgSunk,
    borderRadius: radius.control,
    borderWidth: stroke.edge,
    borderColor: colors.line,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
  },
  // The thumb is its own layer so it can slide; the active segment carries
  // no fill of its own. Concentric with the track: its radius less the inset.
  segmentThumb: {
    position: 'absolute',
    top: SEG_PAD,
    bottom: SEG_PAD,
    borderRadius: radius.control - SEG_PAD,
    borderWidth: stroke.edge,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  // 13pt, and the only name an inactive segment has: textMuted, not
  // textFaint. Selection reads as ink on the white thumb.
  segmentLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
  },
  segmentLabelActive: { color: colors.text },

  /* Search field */
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: layout.search,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    borderWidth: stroke.edge,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  searchOnCard: { backgroundColor: colors.bg },
  searchFocused: { borderColor: colors.lineControl },
  searchLining: { backgroundColor: colors.liningDeep, borderColor: colors.onLiningFaint },
  searchLiningFocused: { borderColor: colors.onLiningMuted },
  searchInputLining: { color: colors.onLining },
  searchInput: {
    flex: 1,
    alignSelf: 'stretch',
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
  },
  searchClear: {
    minWidth: 28,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Form fields */
  fieldBox: {
    minHeight: layout.field,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    // Less the edge below it: see FIELD_PAD_V.
    paddingVertical: FIELD_PAD_V - stroke.edge,
    borderRadius: radius.control,
    /*
     * lineControl: a non-text use at 3.91:1 against the white fill and
     * 3.51:1 against the page. The old cardBorder hairline was 1.21:1, and
     * the white fill itself is 1.11:1 on the cream page, so a form's main
     * controls were close to invisible to anyone with low vision. A
     * control's edge is not a card's edge.
     */
    borderWidth: stroke.edge,
    borderColor: colors.lineControl,
    backgroundColor: colors.surface,
    // Clips a resting label that, drawn a third larger, would run past
    // the box at the largest text sizes.
    overflow: 'hidden',
  },
  fieldBoxMultiline: { minHeight: layout.fieldMultiline, justifyContent: 'flex-start' },
  fieldBoxInGroup: { borderWidth: 0, borderRadius: radius.none, paddingVertical: FIELD_PAD_V },
  fieldBoxSunk: { backgroundColor: colors.bgSunk },
  fieldBoxCentred: { justifyContent: 'center' },
  fieldLabel: { color: colors.textMuted },
  fieldValueRow: { flexDirection: 'row', alignItems: 'center' },
  fieldValueRowUnderLabel: { marginTop: LABEL_GAP },
  fieldPrefix: { color: colors.textMuted },
  fieldInput: {
    flex: 1,
    padding: 0,
    // 16pt keeps iOS from auto-zooming the field on focus. No lineHeight
    // on a one-line input: iOS shifts the text inside its box when given one.
    fontFamily: textRole.fieldValue.fontFamily,
    fontSize: textRole.fieldValue.fontSize,
    minHeight: textRole.fieldValue.lineHeight,
    color: colors.text,
  },
  /* Prose: room for about four lines at rest inside the 112pt box, text
     from the top. It grows past that with its content. */
  fieldInputMultiline: {
    lineHeight: textRole.fieldValue.lineHeight,
    minHeight: layout.fieldMultiline - FIELD_PAD_V * 2 - textRole.fieldLabel.lineHeight - LABEL_GAP,
    textAlignVertical: 'top',
  },
  fieldInputDisabled: { color: colors.textMuted },
  fieldReveal: {
    minWidth: 28,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: space.sm,
  },
  fieldTrailing: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: space.lg,
    justifyContent: 'center',
  },
  fieldRing: {
    position: 'absolute',
    top: -1,
    left: -1,
    right: -1,
    bottom: -1,
    borderWidth: stroke.ring,
  },
  /* A ringed row inside a group draws over the separators it shares. */
  fieldLifted: { zIndex: 1 },
  fieldNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  /* textMuted, not textFaint: 13pt text a person has to read. */
  fieldNoteText: { flex: 1, color: colors.textMuted },
  fieldNoteError: { color: colors.danger },
  /*
   * Deliberately NOT overflow: 'hidden'. On iOS a clipping view's border is
   * drawn by Core Animation IN FRONT of its children (React Native only
   * draws a border behind them, as CSS does, when the view does not clip),
   * so a clipping group would paint its grey 1pt edge over the outer half
   * of a ringed row's 2pt ring. Unclipped, the ring covers the edge, and
   * the rows round their own corners instead (fieldBoxStyle).
   */
  fieldGroup: {
    borderRadius: radius.control,
    borderWidth: stroke.edge,
    borderColor: colors.lineControl,
    backgroundColor: colors.surface,
  },
  /* Full width, as the system's grouped fields draw it. */
  fieldGroupRule: { height: stroke.edge, backgroundColor: colors.lineControl },
  selectBox: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  selectText: { flex: 1, justifyContent: 'center' },

  /* Empty state */
  empty: {
    alignItems: 'center',
    paddingVertical: space.xxxl,
    paddingHorizontal: layout.gutter,
  },
  emptyDark: { backgroundColor: colors.reelGround },
  emptyTitle: { textAlign: 'center', marginTop: space.lg },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    textAlign: 'center',
    maxWidth: 300,
    marginTop: space.sm,
  },
  emptyAction: { marginTop: space.xl, minWidth: 200 },
  emptySecondary: { marginTop: space.xs },

  /* Hold */
  holdFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    paddingHorizontal: layout.gutter,
  },
  holdSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    paddingVertical: space.xxxl,
    paddingHorizontal: layout.gutter,
  },
  holdText: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted, // 4.5:1+ on the page; textFaint is not
    textAlign: 'center',
    maxWidth: 280,
  },
});
