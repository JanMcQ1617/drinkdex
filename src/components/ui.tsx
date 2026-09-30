import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  TextInput,
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

import { Icon, type IconName } from '@/components/icons';
import {
  CATEGORY_META,
  colors,
  fonts,
  motion,
  label as labelType,
  radius,
  RARITY_META,
  space,
  tabular,
  type as typeScale,
} from '@/constants/theme';
import { formatCount } from '@/data';
import { peekSignedPhoto, signedPhotoUrl } from '@/lib/social';
import type { DrinkCategory, Rarity } from '@/types';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/* ==================================================================== */
/* Haptics                                                              */
/* ==================================================================== */

/** No-ops off-device — expo-haptics has no web implementation. */
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
export function announce(message: string) {
  if (Platform.OS === 'ios') {
    AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
  }
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
 * Tappable surface with a spring press state.
 *
 * Scales rather than dims: on a cream background an opacity change is
 * nearly invisible, so the old `pressed && {opacity}` pattern read as no
 * feedback at all. Honors Reduce Motion.
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

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerText';

/**
 * `md` is the handoff's 52pt call to action. `sm` is 44pt — the iOS touch
 * floor, not a step below it — for an action that sits inside a list row
 * (Follow, Unblock), where a 52pt pill makes the row taller than its
 * content. The label keeps its 16pt size, so no new type size appears.
 */
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
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
  /**
   * Skip the press-in tick. For a handler that answers with its own
   * haptic — a selection tick on Follow, a success notification after a
   * pour — which otherwise lands ~100ms after the tick as a double buzz.
   * A handler that would only repeat the tick should drop its call instead.
   */
  noHaptic?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/*
 * The Sipply handoff draws two buttons and they are the primary/secondary
 * pair: a filled wine pill with bone type, and an outlined pill that
 * borrows its border from the ground it sits on. `secondary` takes taupe
 * — the brand's border colour — rather than the legendary metal it used
 * to, which now means one thing only.
 *
 * No variant casts a shadow. The primary pill was the last thing still
 * wearing the card shadow, and an opaque wine pill on cream already has
 * the strongest edge on the screen, so all it added was a faint smudge
 * under every call to action (see Card below).
 *
 * Two destructive skins, for two weights of consequence. `danger` is the
 * washed pill, for the one irreversible action a screen exists to offer.
 * `dangerText` is the same red with no fill and no edge, for a quiet
 * destructive action at the foot of a screen about something else —
 * "Remove from collection", "Remove picture" — where a red pill would
 * outshout the screen's real call to action. Without it, those were
 * built by hand from `danger` with the fill and border overridden away.
 * `danger` text is 5.99:1 on the page and above that on a white card.
 */
const BUTTON_SKIN: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.wine, fg: colors.textOnWine, border: colors.wine },
  secondary: { bg: colors.surface, fg: colors.wine, border: colors.taupe },
  ghost: { bg: 'transparent', fg: colors.textMuted, border: 'transparent' },
  danger: { bg: colors.dangerWash, fg: colors.danger, border: colors.danger + '66' },
  dangerText: { bg: 'transparent', fg: colors.danger, border: 'transparent' },
};

/**
 * DISABLED AND LOADING ARE DIFFERENT STATES. Both ignore presses, but
 * `disabled` says "you can't do this yet" and fades to 42%, while
 * `loading` says "you did it, and it's working" and stays at full
 * strength with a spinner. Sharing the fade told someone whose tap had
 * landed that it hadn't. If a caller passes both, loading wins — it is
 * the more recent news.
 *
 * A press that lands must not resize what was pressed, so the spinner
 * never adds width. It takes the icon's place when there is one. A
 * `block` button has room beside its label. Anything else may be only as
 * wide as its label, so the spinner covers the label, which keeps its
 * space and stays the spoken name. Two-up rows are why: a spinner added
 * beside "Update photo" in half of a 375pt screen wraps it onto a second
 * line mid-save.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled,
  loading,
  block,
  noHaptic,
  style,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps) {
  const skin = BUTTON_SKIN[variant];
  const inert = !!disabled || !!loading;
  const iconSize = size === 'sm' ? 16 : 19;
  const spinner = loading ? <ActivityIndicator size="small" color={skin.fg} /> : null;
  const coverLabel = !!loading && !icon && !block;

  return (
    <PressableScale
      onPress={inert ? undefined : onPress}
      disabled={inert}
      noHaptic={noHaptic}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inert, busy: !!loading }}
      style={[
        styles.button,
        size === 'sm' && styles.buttonSm,
        { backgroundColor: skin.bg, borderColor: skin.border },
        block && styles.buttonBlock,
        disabled && !loading && styles.buttonDisabled,
        style,
      ]}>
      {icon ? (
        loading ? (
          <View style={[styles.buttonSlot, { width: iconSize, height: iconSize }]}>{spinner}</View>
        ) : (
          <Icon name={icon} size={iconSize} color={skin.fg} />
        )
      ) : block ? (
        spinner
      ) : null}
      <Text style={[styles.buttonLabel, { color: skin.fg }, coverLabel && styles.buttonLabelCovered]}>
        {label}
      </Text>
      {coverLabel ? <View style={styles.buttonCover}>{spinner}</View> : null}
    </PressableScale>
  );
}

/** @deprecated Use `<Button variant="primary" />`. */
export const GoldButton = Button;

/* ==================================================================== */
/* Badges                                                               */
/* ==================================================================== */

export function RarityBadge({ rarity, compact }: { rarity: Rarity; compact?: boolean }) {
  const meta = RARITY_META[rarity];
  return (
    <View style={[styles.badge, { backgroundColor: meta.wash, borderColor: meta.color + '55' }]}>
      {rarity === 'legendary' && !compact ? (
        <Icon name="sparkle" size={11} color={meta.color} filled />
      ) : (
        <View style={[styles.dot, { backgroundColor: meta.color }]} />
      )}
      {!compact && <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>}
    </View>
  );
}

export function CategoryPill({ category }: { category: DrinkCategory }) {
  const meta = CATEGORY_META[category];
  return (
    <View style={[styles.badge, { backgroundColor: meta.wash, borderColor: meta.color + '55' }]}>
      <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
    </View>
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
 * Initials on a wine disc.
 *
 * The handoff draws every avatar the same way — a solid wine circle with a
 * Playfair initial in bone — so the disc no longer takes the user's accent
 * as a wash. The accent survives as the RING, which keeps per-user colour
 * without asking bone type to stay readable on six different fills: brass
 * would have landed at 4.49:1, just under the bar this app holds.
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
  avatarPath,
  localUri,
}: {
  name: string;
  accent: string;
  size?: number;
  /** Draws an unseen-story style ring. */
  ring?: boolean;
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

  const inner = size - (ring ? 6 : 0);

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
        { width: size, height: size, borderRadius: size / 2 },
        ring ? { borderWidth: 2, borderColor: accent } : null,
      ]}>
      <View
        style={[
          styles.avatarInner,
          {
            width: inner,
            height: inner,
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
        {photo ? (
          <Image
            source={{ uri: photo, cacheKey: localUri ? undefined : (avatarPath ?? undefined) }}
            cachePolicy="memory-disk"
            style={styles.avatarPhoto}
            contentFit="cover"
          />
        ) : (
          <Text style={[styles.avatarText, { fontSize: inner * 0.42, color: colors.textOnWine }]}>
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
 * A section heading, and announced as one.
 *
 * The header role is what VoiceOver's Headings rotor jumps between. Long
 * screens (a drink's recipe, Settings, the shelves of My Bar) are built
 * from these, and without the role the only way to "Delete account" or
 * "Spirits" was to swipe past everything above it.
 *
 * The label is passed explicitly because textTransform is not only
 * visual: iOS uppercases the string itself, and a Text with no label
 * speaks that string, so VoiceOver was handed "SERVE IT RIGHT" and may
 * spell a short capitalised word out letter by letter. A string heading
 * is spoken as it is written in the source instead.
 */
export function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={style}>
      <Text
        style={styles.sectionLabel}
        accessibilityRole="header"
        accessibilityLabel={typeof children === 'string' ? children : undefined}>
        {children}
      </Text>
    </View>
  );
}

/**
 * A panel on the page.
 *
 * ONE EDGE, DRAWN ONCE. This used to be tint plus hairline plus shadow —
 * three mechanisms separating every one of twenty-one cards from the same
 * ground. Measured against this palette, the shadow was doing the tint's job
 * twice: white on cream is 1.114:1 across the whole card edge, and the
 * shadow's darkest point is 1.115:1 — the same separation, smeared over 8pt
 * of blur instead of landing on a boundary. The hairline is the only one of
 * the three contributing something the others do not, a crisp 1pt line at
 * 1.207:1 against the card face.
 *
 * So: tint and hairline stay, the shadow goes. Soft drop shadows under
 * everything are also the most reliable tell that nobody decided where the
 * light was coming from.
 *
 * The `raised` prop went with it — no caller ever passed it. Surfaces that
 * genuinely float (the tab bar, sheets) carry their own elevation and are
 * not Cards.
 */
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle | (ViewStyle | false | undefined)[];
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[styles.divider, style]} />;
}

export function ProgressBar({
  value,
  max,
  /**
   * Wine by default: a progress bar in this app measures collection, which
   * is the affirmative colour's job. Callers pass a category colour only
   * for the per-category breakdown, where the bar identifies a category,
   * not progress.
   */
  color = colors.wine,
  height = 8,
}: {
  value: number;
  max: number;
  color?: string;
  height?: number;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const reduced = useReducedMotion();

  const fill = useAnimatedStyle(() => ({
    width: reduced ? `${pct}%` : withTiming(`${pct}%`, { duration: motion.slow }),
  }));

  return (
    <View
      style={[styles.barTrack, { height, borderRadius: height / 2 }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max, now: value }}>
      <Animated.View
        style={[{ height, borderRadius: height / 2, backgroundColor: color }, fill]}
      />
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

/**
 * Segmented control with a thumb that SLIDES between options.
 *
 * ONE CONTROL. The profile's sections and My Bar's Shelf/Drinks switch were
 * two copies of this, with a comment asking whoever changed one to change
 * the other; that is how they had already drifted apart on the role their
 * segments announced. They share this now.
 *
 * The white thumb used to be a background swapped onto whichever segment
 * was active — two things blinking rather than one thing moving. A
 * travelling thumb is what makes a segmented control feel like a physical
 * switch, and it matches the tab pill in the Hornofino app so both houses
 * move alike.
 *
 * It travels on `motion.selection`, the spring every selection control in
 * the app answers with; the tab bar sits one tap away, and the same
 * gesture must not settle at two speeds. Under Reduce Motion it slides on
 * a short timing curve instead of springing.
 *
 * No press-scale here on purpose: the segments are wide, and the thumb
 * arriving is already the feedback. Scaling them too would be noise.
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
  const reduced = useReducedMotion();
  const [barW, setBarW] = useState(0);
  const index = Math.max(0, items.findIndex((i) => i.key === value));

  const PAD = space.xs;
  const GAP = space.xs;
  const segW = barW > 0 ? (barW - PAD * 2 - GAP * (items.length - 1)) / items.length : 0;

  const x = useDerivedValue(() => {
    const target = index * (segW + GAP);
    return reduced
      ? withTiming(target, { duration: motion.fast })
      : withSpring(target, motion.selection);
  });
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      // 'tabbar', not 'tablist': on iOS only this role carries the TabBar
      // trait, which is what makes VoiceOver say "tab, 1 of 2" for each
      // segment inside. The segments themselves are buttons (see below).
      accessibilityRole="tabbar"
      style={[styles.segments, style]}
      onLayout={(e) => setBarW(Math.round(e.nativeEvent.layout.width))}>
      {segW > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.segmentThumb, { width: segW, left: PAD }, thumbStyle]}
        />
      ) : null}
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
                color={active ? colors.wine : colors.textMuted}
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

/* ==================================================================== */
/* Search field                                                         */
/* ==================================================================== */

export interface SearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Names what is searched — "Name, style or country". Never the only label. */
  placeholder: string;
  /** What VoiceOver calls the field. Required: the placeholder is not a label. */
  accessibilityLabel: string;
  /**
   * The field sits on a white card rather than on the page. A white field
   * on a white card has only its hairline for an edge, so it takes the
   * page's cream instead.
   */
  onCard?: boolean;
  /** A slot after the text and before the clear button, e.g. a spinner. */
  trailing?: React.ReactNode;
  returnKeyType?: React.ComponentProps<typeof TextInput>['returnKeyType'];
  onSubmitEditing?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** A plain prop under React 19; lets a screen focus the field. */
  ref?: React.Ref<TextInput>;
  style?: ViewStyle;
}

/**
 * The app's one search input.
 *
 * There were four — the Dex, Log, My Bar and Find friends — each built by
 * hand, and they had drifted on glyph size, clear-button reach and return
 * key. This is the Dex's, which the others had been measured against: a
 * white pill on a hairline, 44pt tall (the touch floor, on the 4pt grid)
 * with 16pt text so iOS never zooms the screen on focus.
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
  onSubmitEditing,
  onFocus,
  onBlur,
  ref,
  style,
}: SearchFieldProps) {
  return (
    <View style={[styles.search, onCard && styles.searchOnCard, style]}>
      <Icon name="search" size={17} color={colors.textMuted} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        onFocus={onFocus}
        onBlur={onBlur}
        style={styles.searchInput}
        accessibilityLabel={accessibilityLabel}
      />
      {trailing}
      {value.length > 0 ? (
        <PressableScale
          onPress={() => onChangeText('')}
          noHaptic
          hitSlop={space.sm}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={styles.searchClear}>
          <Icon name="close" size={16} color={colors.textMuted} />
        </PressableScale>
      ) : null}
    </View>
  );
}

/* ==================================================================== */
/* Form field                                                           */
/* ==================================================================== */

type InputProps = React.ComponentProps<typeof TextInput>;

export interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  /** A password: masked, with a reveal toggle inside the field's right edge. */
  secure?: boolean;
  autoComplete?: InputProps['autoComplete'];
  textContentType?: InputProps['textContentType'];
  inputMode?: InputProps['inputMode'];
  /** Defaults to 'none', which is right for everything but names and prose. */
  autoCapitalize?: InputProps['autoCapitalize'];
  /** Defaults to off. Turn it on for prose (a bio), never for a handle. */
  autoCorrect?: boolean;
  maxLength?: number;
  /** Prose that wraps: a taller box, text from the top. */
  multiline?: boolean;
  /** Keyboard chaining: 'next' with a focus hop, or the form's own action. */
  returnKeyType?: InputProps['returnKeyType'];
  onSubmitEditing?: () => void;
  submitBehavior?: InputProps['submitBehavior'];
  /** Called when the field takes focus, after its own focus ring shows. */
  onFocus?: () => void;
  /** Called when the field loses focus, after its own focus ring drops. */
  onBlur?: () => void;
  /** A plain prop under React 19; lets the form move focus between fields. */
  ref?: React.Ref<TextInput>;
  hint?: string;
  /** Fixed leading character, e.g. the '@' on a handle. Not part of the value. */
  prefix?: string;
  /** Colours the hint as a problem. The submit button is disabled either
   *  way, so without this the reason reads as ordinary help text. */
  hintIsError?: boolean;
  /** Spoken instead of `label`, when the visible label is terse ("About"). */
  accessibilityLabel?: string;
  style?: ViewStyle;
}

/**
 * A labelled text field: the app's one form input.
 *
 * It lived in AuthGate, and edit-profile drew its own three fields beside
 * it — the same box twice, one with a focus ring and a reveal toggle and
 * one without, and a handle field whose '@' was laid out differently in
 * each. It is here so every form in the app draws, labels and announces a
 * field one way. Three password fields that behaved subtly differently
 * would be worse than any coupling this creates.
 *
 * A visible label always, never a placeholder standing in for one. The
 * label, the placeholder, the '@' and a non-error hint are all textMuted:
 * each is small text a person has to read, so each needs 4.5:1, and
 * textFaint is for large type and glyphs only.
 */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secure,
  autoComplete,
  textContentType,
  inputMode,
  autoCapitalize = 'none',
  autoCorrect = false,
  maxLength,
  multiline,
  returnKeyType,
  onSubmitEditing,
  submitBehavior,
  onFocus,
  onBlur,
  ref,
  hint,
  prefix,
  hintIsError,
  accessibilityLabel,
  style,
}: FieldProps) {
  const [reveal, setReveal] = useState(false);
  const [focused, setFocused] = useState(false);

  // A hint that turns into an error is news; the same hint as help is not.
  useAnnounce(hintIsError ? hint : null);

  return (
    <View style={[styles.field, style]}>
      {/*
        Hidden from VoiceOver because the input carries the same label;
        otherwise every field was announced twice, once as text and once as
        the field.
      */}
      <Text style={styles.fieldLabel} accessibilityElementsHidden importantForAccessibility="no">
        {label}
      </Text>
      <View style={styles.inputWrap}>
        {/* Hidden for the same reason as the label: read on its own it is a
            stray "at sign" between the field's name and the field. */}
        {prefix ? (
          <Text style={styles.prefix} accessibilityElementsHidden importantForAccessibility="no">
            {prefix}
          </Text>
        ) : null}
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secure && !reveal}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          autoComplete={autoComplete}
          textContentType={textContentType}
          inputMode={inputMode}
          maxLength={maxLength}
          multiline={multiline}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          submitBehavior={submitBehavior}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          style={[
            styles.input,
            multiline && styles.inputMultiline,
            secure && styles.inputSecure,
            prefix ? styles.inputWithPrefix : null,
            focused && styles.inputFocused,
          ]}
          accessibilityLabel={accessibilityLabel ?? label}
          /* The rule or the error is read with the field, not left for a
             VoiceOver user to find as a separate element afterwards. */
          accessibilityHint={hint}
        />
        {secure ? (
          <PressableScale
            onPress={() => setReveal((r) => !r)}
            hitSlop={12}
            noHaptic
            accessibilityRole="button"
            accessibilityLabel={reveal ? 'Hide password' : 'Show password'}
            style={styles.reveal}>
            <Icon name={reveal ? 'eyeOff' : 'eye'} size={18} color={colors.textMuted} />
          </PressableScale>
        ) : null}
      </View>
      {hint ? (
        <Text
          style={[styles.fieldHint, hintIsError && styles.fieldHintError]}
          accessibilityLiveRegion={hintIsError ? 'polite' : 'none'}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/* ==================================================================== */
/* Empty state                                                          */
/* ==================================================================== */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={26} color={colors.wineSoft} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          variant="secondary"
          style={styles.emptyAction}
        />
      ) : null}
    </View>
  );
}

/* ==================================================================== */

const styles = StyleSheet.create({
  button: {
    /* 52pt tall, pill — the handoff's button, verbatim. */
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  /* Row actions. 44pt is the iOS touch floor; see ButtonSize. */
  buttonSm: { minHeight: 44, paddingHorizontal: space.lg },
  buttonBlock: { alignSelf: 'stretch' },
  buttonDisabled: { opacity: 0.42 },
  buttonLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
  },
  /* Loading: holds the icon's box so the spinner cannot widen the pill. */
  buttonSlot: { alignItems: 'center', justifyContent: 'center' },
  /* Loading, inline and icon-less: the label keeps its width, unseen. */
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

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: {
    fontFamily: fonts.bodyMedium,
    ...typeScale.tag,
  },

  avatarOuter: { alignItems: 'center', justifyContent: 'center' },
  avatarInner: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // Clips the photo to the circle; without it the image renders square
    // inside a round border.
    overflow: 'hidden',
  },
  avatarText: { fontFamily: fonts.displayBold },
  /* Fills the inner circle, which already carries the radius and clips. */
  avatarPhoto: { width: '100%', height: '100%' },

  sectionLabel: {
    /*
     * The brand's letterspaced sub-label: Inter Medium, uppercase, tracked
     * to 0.3em, in taupe. `taupeInk` rather than `taupe` because this one
     * lands on the light page, where raw taupe is 1.68:1 and decorative.
     *
     * THE ONLY UPPERCASE ROLE LEFT IN THE APP, deliberately. Letterspaced
     * caps were also on tab labels, form field labels, category and rarity
     * badges, stat labels, the dex eyebrow, celebration eyebrows, wine style
     * tags and the locked-card caption — nine more places. Used everywhere it
     * stops being a device and becomes a tic, and it is the habit that most
     * makes an interface look machine-designed.
     *
     * Section headings keep it because they are structure rather than
     * content: they name a region of the page, they are never read as a
     * value, and small caps above a rule is an editorial convention that
     * suits Playfair and wine. If a new label wants uppercase, the question
     * is whether it is a section heading. If it is not, it is sentence case.
     */
    fontFamily: fonts.label,
    fontSize: labelType.ui.fontSize,
    lineHeight: labelType.ui.lineHeight,
    letterSpacing: labelType.ui.letterSpacing,
    textTransform: 'uppercase',
    color: colors.taupeInk,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },

  divider: { height: 1, backgroundColor: colors.cardBorder },

  barTrack: { width: '100%', backgroundColor: colors.bgSunk, overflow: 'hidden' },

  /* Segmented control */
  segments: {
    flexDirection: 'row',
    gap: space.xs,
    padding: space.xs,
    backgroundColor: colors.bgSunk,
    borderRadius: radius.pill,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.pill,
  },
  // The thumb is its own layer so it can slide; the active segment carries
  // no fill of its own.
  segmentThumb: {
    position: 'absolute',
    top: space.xs,
    bottom: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  // 13pt, and the only name an inactive segment has: textMuted, not
  // textFaint. Selection reads as wine on the white thumb.
  segmentLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },
  segmentLabelActive: { color: colors.wine },

  /* Search field */
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  searchOnCard: { backgroundColor: colors.bg },
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

  /* Form field */
  field: { gap: space.sm },
  fieldLabel: {
    fontFamily: fonts.bodyMedium,
    ...typeScale.micro,
    color: colors.textMuted,
  },
  inputWrap: { justifyContent: 'center' },
  input: {
    minHeight: 50,
    backgroundColor: colors.surface,
    borderWidth: 1,
    /*
     * textFaint, a non-text use at 3.91:1 against the white fill. A
     * cardBorder hairline was 1.21:1, and the white fill itself is 1.11:1
     * on the cream page, so a form's main controls were close to invisible
     * to anyone with low vision. A control's edge is not a card's edge:
     * the "tint and hairline" rule is for cards.
     */
    borderColor: colors.textFaint,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    // 16pt keeps iOS from auto-zooming the field on focus.
    fontSize: typeScale.body.fontSize,
    fontFamily: fonts.body,
    color: colors.text,
  },
  /* Prose: room for about four lines at rest, text from the top. The box
     grows past that with its content, as a minHeight does. */
  inputMultiline: {
    minHeight: 108,
    paddingTop: space.md,
    paddingBottom: space.md,
    textAlignVertical: 'top',
  },
  /* Room for the reveal toggle, on password fields only; elsewhere it cut
     a long address or name short for a button that was not there. */
  inputSecure: { paddingRight: 46 },
  inputWithPrefix: { paddingLeft: space.lg + 16 },
  /* The field being typed into, in the affirmative colour. Same width, so
     focusing does not nudge the layout. */
  inputFocused: { borderColor: colors.wine },
  reveal: { position: 'absolute', right: space.md, padding: 6 },
  /*
   * Drawn over the field rather than inside the value: an '@' the user can
   * delete or double up on is a handle that never matches anybody.
   *
   * textMuted, not textFaint: the '@' is 16pt regular type, so it needs
   * 4.5:1 like any other small text, and it reads as part of the handle
   * being typed rather than as decoration.
   */
  prefix: {
    position: 'absolute',
    left: space.lg,
    zIndex: 1,
    fontSize: typeScale.body.fontSize,
    fontFamily: fonts.body,
    color: colors.textMuted,
  },
  /*
   * textMuted, not textFaint. These are 13pt and carry the username rule
   * and the privacy promise for phone and Instagram; textFaint is for large
   * type and glyphs only.
   */
  fieldHint: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
  },
  fieldHintError: { color: colors.danger },

  empty: {
    alignItems: 'center',
    paddingVertical: space.xxxl,
    paddingHorizontal: space.xl,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.wineWash,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  emptyTitle: {
    fontFamily: fonts.display,
    fontSize: typeScale.title.fontSize,
    lineHeight: typeScale.title.lineHeight,
    color: colors.text,
    textAlign: 'center',
    marginBottom: space.sm,
  },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 300,
  },
  emptyAction: { marginTop: space.xl },
});
