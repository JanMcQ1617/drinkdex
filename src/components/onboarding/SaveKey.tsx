import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { announce, haptic } from '@/components/ui';
import { colors, radius, textRole } from '@/constants/theme';
import { WANT_TO_TRY_MAX, useTaste } from '@/store/taste';

import { SAVE_H, SAVE_W } from './metrics';
import { FadeOut, T, useFadingPrevious } from './motion';

/* ==================================================================== */
/* Save to try                                                          */
/*                                                                      */
/* A pick's key (specs/v4.1-changes.md 1.4): it keeps the drink on the  */
/* want-to-try list (store/taste `saved`), and never puts it in the     */
/* Dex, which holds only drinks you have had. 112 x 36 drawn, 44 to the */
/* finger; the width is fixed so nothing moves when its word changes.   */
/*                                                                      */
/*   off  "Save to try"  wash, ink label (18.16:1)                      */
/*   on   "Saved"        ink, onInk label (19.80:1)                     */
/*                                                                      */
/* Its word changes as well as its fill, so the state never rests on    */
/* colour alone. The fill is the pick's (m4): the new look plain at     */
/* once, the old one fading over it and unmounted on a timer.           */
/* ==================================================================== */

const LABEL_CAP = 1.3;
const SLOP = (44 - SAVE_H) / 2;

function Face({ on, pressed }: { on: boolean; pressed: boolean }) {
  const fill = on ? (pressed ? colors.inkPressed : colors.text) : pressed ? colors.press : colors.bgSunk;
  return (
    <View style={[StyleSheet.absoluteFill, styles.face, { backgroundColor: fill }]}>
      <Text
        maxFontSizeMultiplier={LABEL_CAP}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={[styles.label, { color: on ? colors.onInk : colors.text }]}>
        {on ? 'Saved' : 'Save to try'}
      </Text>
    </View>
  );
}

export function SaveKey({ id, name }: { id: string; name: string }) {
  const saved = useTaste((s) => s.saved.includes(id));
  const reduce = useReducedMotion();
  const old = useFadingPrevious(saved, reduce ? 0 : T.pick + T.settle);

  const press = () => {
    const taste = useTaste.getState();
    const was = taste.saved.includes(id);
    const now = taste.toggleSaved(id);
    if (!was && !now) {
      // The store refused the add (the list is full, or the drink is in the Dex): say so, since nothing changed.
      haptic.error();
      announce(
        taste.saved.length >= WANT_TO_TRY_MAX
          ? `You can keep up to ${WANT_TO_TRY_MAX} drinks to try. Take one off to save ${name}.`
          : `${name} is already in your Dex.`,
      );
      return;
    }
    haptic.tap();
  };

  return (
    <Pressable
      onPress={press}
      hitSlop={{ top: SLOP, bottom: SLOP }}
      accessibilityRole="button"
      accessibilityLabel={saved ? `Saved ${name} to try` : `Save ${name} to try`}
      accessibilityState={{ selected: saved }}
      style={styles.key}>
      {({ pressed }) => (
        <>
          <Face on={saved} pressed={pressed} />
          {old !== undefined && !reduce ? (
            <FadeOut duration={T.pick}>
              <Face on={old} pressed={false} />
            </FadeOut>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  key: { width: SAVE_W, height: SAVE_H, borderRadius: radius.control, overflow: 'hidden' },
  face: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: radius.control },
  label: { ...textRole.bodyMedium, textAlign: 'center' },
});
