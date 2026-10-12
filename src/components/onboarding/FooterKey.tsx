import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius, textRole } from '@/constants/theme';

import { EDGE, KEY_H } from './metrics';
import { Appear, EASE_OUT, FadeOut, LINEAR, T, useFadingPrevious, useSettled } from './motion';

/* ==================================================================== */
/* The footer key                                                       */
/*                                                                      */
/* Imprint's Continue in ink (spec 3.1): 392 x 51 at y 841, squared      */
/* (radius.control). One key for the whole flow, outside the step        */
/* layers, so it stays put while a step pushes (m1) and only its look    */
/* and words change:                                                     */
/*                                                                      */
/*   ink   enabled: ink, onInk label (19.80:1); inkPressed while held    */
/*   off   disabled: wash, muted label (6.13:1), never hidden            */
/*   wash  the secondary: wash, ink label (18.16:1): "Back to start"    */
/*                                                                      */
/* A change of look draws the new one at once in plain styles and lays  */
/* the old one over it, faded out (m5 330ms enabling, m6 350ms           */
/* disabling, m22 200ms relabelling) and unmounted by a JS timer         */
/* (motion.tsx): a stalled worklet costs a moment of the old colour,    */
/* never a Continue that looks grey but works.                          */
/*                                                                      */
/* `shift` is the welcome's: Get started is this key drawn 41 higher,    */
/* sliding home as the flow starts (m2). `hidden` is the narration       */
/* screens' and the sign-in's: no key. Labels cap at 1.3x, as the app's  */
/* pinned keys do, so the foot's geometry holds.                        */
/* ==================================================================== */

export type KeyLook = 'ink' | 'off' | 'wash';

const LABEL_CAP = 1.3;
/** The overlay of the old look is unmounted after the longest fade (m6) and its settle. */
const OLD_LOOK_MS = T.disable + T.settle;
const SEP = '\u0001';
/** The look a hidden key is recorded under, so nothing fades from it. */
const HIDDEN = 'hidden';

function fill(look: KeyLook, pressed: boolean): string {
  if (look === 'ink') return pressed ? colors.inkPressed : colors.text;
  if (look === 'wash') return pressed ? colors.press : colors.bgSunk;
  return colors.bgSunk;
}

function ink(look: KeyLook): string {
  return look === 'ink' ? colors.onInk : look === 'wash' ? colors.text : colors.textMuted;
}

/** One look of the key, drawn plain: the fill and its label. */
function Face({ look, label, pressed = false }: { look: KeyLook; label: string; pressed?: boolean }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.face, { backgroundColor: fill(look, pressed) }]}>
      <Text maxFontSizeMultiplier={LABEL_CAP} numberOfLines={1} style={[styles.label, { color: ink(look) }]}>
        {label}
      </Text>
    </View>
  );
}

export function FooterKey({
  label,
  look,
  onPress,
  hidden = false,
  shift = 0,
  busy = false,
  top,
  style,
  accessibilityHint,
}: {
  label: string;
  look: KeyLook;
  onPress: () => void;
  hidden?: boolean;
  /** Points above the footer slot it is drawn (the welcome's -41). */
  shift?: number;
  /** A request is out: a spinner in place of the label, presses ignored. */
  busy?: boolean;
  /** Pinned at the foot: the slot's y. Omitted, the key sits in the flow (UnderAgeStop). */
  top?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const reduce = useReducedMotion();
  const y = useSharedValue(shift);
  const o = useSharedValue(hidden ? 0 : 1);

  const moved = useSettled(shift, reduce ? 0 : T.welcome + T.settle);
  const shown = useSettled(hidden, reduce ? 0 : T.pushIn + T.settle);
  /*
   * A hidden key has no look to leave: coming back from a narration or the
   * reveal it arrives in its new look (from 0.6), with no fading copy of
   * whatever look it last had, which would flash an ink key over a grey one.
   */
  const old = useFadingPrevious(`${hidden ? HIDDEN : look}${SEP}${label}`, reduce ? 0 : OLD_LOOK_MS);
  const leaving = old !== undefined && !hidden && !old.startsWith(`${HIDDEN}${SEP}`) ? old : undefined;

  useEffect(() => {
    y.set(reduce ? shift : withTiming(shift, { duration: T.welcome, easing: EASE_OUT }));
  }, [shift, reduce, y]);

  useEffect(() => {
    if (reduce) {
      o.set(hidden ? 0 : 1);
      return;
    }
    if (hidden) {
      o.set(withTiming(0, { duration: T.pushOut, easing: LINEAR }));
      return;
    }
    // Coming back, it arrives as content does: from 0.6, never from nothing.
    if (o.get() < 0.6) o.set(0.6);
    o.set(withTiming(1, { duration: T.pushIn, easing: EASE_OUT }));
  }, [hidden, reduce, o]);

  const anim = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: y.value }] }));
  const plain = { opacity: hidden ? 0 : 1, transform: [{ translateY: shift }] };

  let fade: React.ReactNode = null;
  if (leaving !== undefined && !reduce) {
    const [oldLook, oldLabel] = leaving.split(SEP) as [KeyLook, string];
    const duration = oldLabel !== label ? T.relabel : look === 'ink' ? T.enable : T.disable;
    fade = (
      <FadeOut duration={duration} style={styles.radius}>
        <Face look={oldLook} label={oldLabel} />
      </FadeOut>
    );
  }

  const inert = hidden || busy || look === 'off';
  const relabelled = leaving !== undefined && leaving.split(SEP)[1] !== label;

  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      style={[
        top === undefined ? styles.inline : [styles.pinned, { top }],
        style,
        reduce || (moved && shown) ? plain : anim,
      ]}>
      <Pressable
        onPress={inert ? undefined : onPress}
        disabled={inert}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: look === 'off', busy }}
        style={styles.key}>
        {({ pressed }) => (
          <>
            <View style={[StyleSheet.absoluteFill, styles.radius, { backgroundColor: fill(look, pressed && !inert) }]} />
            {busy ? (
              <ActivityIndicator color={ink(look)} />
            ) : relabelled ? (
              <Appear duration={T.relabel}>
                <Text maxFontSizeMultiplier={LABEL_CAP} numberOfLines={1} style={[styles.label, { color: ink(look) }]}>
                  {label}
                </Text>
              </Appear>
            ) : (
              <Text maxFontSizeMultiplier={LABEL_CAP} numberOfLines={1} style={[styles.label, { color: ink(look) }]}>
                {label}
              </Text>
            )}
            {fade}
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pinned: { position: 'absolute', left: EDGE, right: EDGE },
  inline: { alignSelf: 'stretch' },
  key: {
    minHeight: KEY_H,
    borderRadius: radius.control,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: EDGE,
  },
  radius: { borderRadius: radius.control },
  face: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: EDGE },
  label: { ...textRole.bodyMedium, textAlign: 'center' },
});
