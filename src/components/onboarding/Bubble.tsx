import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, radius, textRole } from '@/constants/theme';

import { BUBBLE_PAD, SUB_GAP, TAIL_H, TAIL_W } from './metrics';

/* ==================================================================== */
/* The guide's speech bubble                                            */
/*                                                                      */
/* Imprint's card in Daylight (spec 2, departure 3): a filled wash with */
/* 4pt corners, the guide's voice and the one card on a screen.         */
/*                                                                      */
/*   C  question: beside the seal, its top-left corner square, pointing */
/*      at it; the prompt set left                                      */
/*   B  narration: under the seal, centred                              */
/*   A  centre stage: under the 200pt seal, a 20 x 9 tail at its top     */
/*      centre pointing up at it                                        */
/*                                                                      */
/* The prompt is `prompt`, Archivo 500 22/28 (the one size outside v4's */
/* three, agreed with Jan), capped at 1.3x so a two-line question stays */
/* a bubble. `**word**` sets a run in 600: "Which **whiskey** do you     */
/* reach for?". An optional sub line in small muted ink 8 under it.     */
/*                                                                      */
/* VoiceOver: one header, its words without the asterisks. On arrival   */
/* the step moves VoiceOver's focus to it, which reads it: the step's    */
/* announcement, spoken once (spec 10).                                 */
/* ==================================================================== */

/** The prompt grows to 1.3x and no further (spec 10). */
const PROMPT_CAP = 1.3;
/** After the push has settled, as AuthTitleBar's useStepTitleFocus waits. */
const FOCUS_DELAY_MS = 350;

/** "Which **whiskey** do you reach for?" as plain and bold runs. */
function runs(text: string): { text: string; bold: boolean }[] {
  return text.split('**').map((part, i) => ({ text: part, bold: i % 2 === 1 }));
}

/** The words, as VoiceOver says them. */
export function plainPrompt(text: string): string {
  return text.split('**').join('');
}

export function Bubble({
  mode,
  prompt,
  sub,
  focus = false,
  style,
}: {
  mode: 'A' | 'B' | 'C';
  prompt: string;
  sub?: string | null;
  /** Move VoiceOver here once the step has arrived. */
  focus?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<View>(null);

  useEffect(() => {
    if (!focus) return;
    const id = setTimeout(() => {
      if (ref.current) AccessibilityInfo.sendAccessibilityEvent(ref.current, 'focus');
    }, FOCUS_DELAY_MS);
    return () => clearTimeout(id);
  }, [focus]);

  const pad = BUBBLE_PAD[mode];
  const centred = mode !== 'C';
  const label = sub ? `${plainPrompt(prompt)} ${sub}` : plainPrompt(prompt);

  return (
    <View
      ref={ref}
      accessible
      accessibilityRole="header"
      accessibilityLabel={label}
      style={[
        styles.bubble,
        mode === 'C' && styles.pointed,
        { paddingVertical: pad.v, paddingHorizontal: pad.h },
        style,
      ]}>
      {mode === 'A' ? <View style={styles.tail} /> : null}
      <Text maxFontSizeMultiplier={PROMPT_CAP} style={[styles.prompt, centred && styles.centre]}>
        {runs(prompt).map((r, i) =>
          r.bold ? (
            <Text key={i} style={styles.bold}>
              {r.text}
            </Text>
          ) : (
            r.text
          ),
        )}
      </Text>
      {sub ? <Text style={[styles.sub, centred && styles.centre]}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { backgroundColor: colors.bgSunk, borderRadius: radius.control },
  /* The corner that points at the seal. */
  pointed: { borderTopLeftRadius: radius.none },
  prompt: { ...textRole.prompt, color: colors.text },
  bold: { fontFamily: fonts.bodySemiBold },
  centre: { textAlign: 'center' },
  sub: { ...textRole.small, color: colors.textMuted, marginTop: SUB_GAP },
  /* A wash triangle drawn with borders: 20 wide, 9 tall, its point at the seal. */
  tail: {
    position: 'absolute',
    top: -TAIL_H,
    left: '50%',
    marginLeft: -TAIL_W / 2,
    width: 0,
    height: 0,
    borderLeftWidth: TAIL_W / 2,
    borderRightWidth: TAIL_W / 2,
    borderBottomWidth: TAIL_H,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.bgSunk,
  },
});
