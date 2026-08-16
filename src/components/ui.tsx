import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  Platform,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/icons';
import {
  CATEGORY_META,
  colors,
  elevation,
  fonts,
  motion,
  radius,
  RARITY_META,
  space,
  type as typeScale,
} from '@/constants/theme';
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

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  /** Fills the available width. */
  block?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const BUTTON_SKIN: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.wine, fg: colors.textOnWine, border: colors.wine },
  secondary: { bg: colors.surface, fg: colors.wine, border: colors.cardBorderLit },
  ghost: { bg: 'transparent', fg: colors.textMuted, border: 'transparent' },
  danger: { bg: colors.dangerWash, fg: colors.danger, border: colors.danger + '66' },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  block,
  style,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps) {
  const skin = BUTTON_SKIN[variant];

  return (
    <PressableScale
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        styles.button,
        { backgroundColor: skin.bg, borderColor: skin.border },
        variant === 'primary' && elevation.card,
        block && styles.buttonBlock,
        disabled && styles.buttonDisabled,
        style,
      ]}>
      {icon ? <Icon name={icon} size={19} color={skin.fg} /> : null}
      <Text style={[styles.buttonLabel, { color: skin.fg }]}>{label}</Text>
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
 * Initials on a tinted disc.
 *
 * Deliberately not emoji: emoji render in the system font, so their weight
 * and color can't be controlled by design tokens, and at avatar size they
 * read as placeholder art.
 */
export function Avatar({
  name,
  accent,
  size = 40,
  ring,
}: {
  name: string;
  accent: string;
  size?: number;
  /** Draws an unseen-story style ring. */
  ring?: boolean;
}) {
  const initials = name
    .replace(/[^a-zA-Z0-9 ._-]/g, '')
    .split(/[ ._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

  const inner = size - (ring ? 6 : 0);

  return (
    <View
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
            backgroundColor: accent + '2E',
            borderColor: accent + '66',
          },
        ]}>
        <Text style={[styles.avatarText, { fontSize: inner * 0.38, color: accent }]}>
          {initials || '?'}
        </Text>
      </View>
    </View>
  );
}

/* ==================================================================== */
/* Structure                                                            */
/* ==================================================================== */

export function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={style}>
      <Text style={styles.sectionLabel}>{children}</Text>
    </View>
  );
}

export function Card({
  children,
  style,
  raised,
}: {
  children: React.ReactNode;
  style?: ViewStyle | (ViewStyle | false | undefined)[];
  raised?: boolean;
}) {
  return (
    <View style={[styles.card, raised ? elevation.raised : elevation.card, style]}>{children}</View>
  );
}

export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[styles.divider, style]} />;
}

export function ProgressBar({
  value,
  max,
  /**
   * Patina by default: a progress bar in this app always measures collection,
   * which is patina's job. Callers pass a category color only for the
   * per-category breakdown, where the bar identifies a category, not progress.
   */
  color = colors.patina,
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
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  buttonBlock: { alignSelf: 'stretch' },
  buttonDisabled: { opacity: 0.42 },
  buttonLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    letterSpacing: 0.2,
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
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  avatarOuter: { alignItems: 'center', justifyContent: 'center' },
  avatarInner: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.bodySemiBold, letterSpacing: 0.3 },

  sectionLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },

  divider: { height: 1, backgroundColor: colors.cardBorder },

  barTrack: { width: '100%', backgroundColor: colors.bgSunk, overflow: 'hidden' },

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
