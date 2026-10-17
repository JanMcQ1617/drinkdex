import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import {
  confirmUnsave,
  ensureDrinkSaved,
  onSaveToCollectionAction,
  SAVE_TO_COLLECTION,
} from '@/components/collections/bookmark';
import { SaveSheet } from '@/components/collections/SaveSheet';
import { announce, haptic } from '@/components/ui';
import { colors, radius, textRole } from '@/constants/theme';
import { collectionsOn, type SavedThing, useCollectionsOn } from '@/store/collections';
import { WANT_TO_TRY_MAX, useTaste } from '@/store/taste';

import { SAVE_H, SAVE_W } from './metrics';
import { FadeOut, T, useFadingPrevious } from './motion';

/* ==================================================================== */
/* Save                                                                 */
/*                                                                      */
/* A pick's key (specs/v4.1-changes.md 1.4): it keeps the drink in the  */
/* saved drinks (store/taste `saved`, the Saved tab), and never puts it */
/* in the Dex, which holds only drinks you have had. Plain "Save", as   */
/* the drink page's bookmark is: it said "Save to try" through build    */
/* 25, which turned a pick into something to go and have (App Review    */
/* 1.4.3). 112 x 36 drawn, 44 to the finger; the width is fixed so      */
/* nothing moves when its word changes.                                 */
/*                                                                      */
/*   off  "Save"         wash, ink label (18.16:1)                      */
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
        {on ? 'Saved' : 'Save'}
      </Text>
    </View>
  );
}

export function SaveKey({ id, name }: { id: string; name: string }) {
  const saved = useTaste((s) => s.saved.includes(id));
  const reduce = useReducedMotion();
  const old = useFadingPrevious(saved, reduce ? 0 : T.pick + T.settle);

  /*
   * v4.2 §4. An unsave asks first when the drink is in a collection, which
   * it then leaves (components/collections/bookmark), and holding the key
   * opens Save to collection. No save bar here: the key's own word and
   * fill already say "Saved", and the only time collections are on for a
   * pick (signed in, so Settings' Your tastes) the picks are a full-screen
   * Modal with their own key at the foot, where a bar would cover it. For
   * the same Modal the sheet is drawn here, inside it, not by the app's
   * host: a Modal presents only over the Modal it is in.
   */
  const canCollect = useCollectionsOn();
  const [sheet, setSheet] = useState<{ thing: SavedThing; open: boolean } | null>(null);

  const refuse = () => {
    // The store refused the add, and a pick is always a catalogue drink, so the list is full: say so, since nothing changed.
    haptic.error();
    announce(`You can save up to ${WANT_TO_TRY_MAX} drinks. Take one out to save ${name}.`);
  };

  const press = () => {
    const taste = useTaste.getState();
    if (taste.saved.includes(id)) {
      confirmUnsave({ kind: 'drink', id }, () => {
        useTaste.getState().setSaved(id, false);
        haptic.tap();
      });
      return;
    }
    if (!taste.toggleSaved(id)) {
      refuse();
      return;
    }
    haptic.tap();
  };

  const hold = () => {
    if (!collectionsOn()) return;
    if (!ensureDrinkSaved(id)) {
      refuse();
      return;
    }
    haptic.tap();
    setSheet({ thing: { kind: 'drink', id }, open: true });
  };

  return (
    <>
      <Pressable
        onPress={press}
        onLongPress={canCollect ? hold : undefined}
        delayLongPress={canCollect ? 500 : undefined}
        accessibilityActions={canCollect ? SAVE_TO_COLLECTION : undefined}
        onAccessibilityAction={canCollect ? onSaveToCollectionAction(hold) : undefined}
        hitSlop={{ top: SLOP, bottom: SLOP }}
        accessibilityRole="button"
        accessibilityLabel={saved ? `Saved ${name}` : `Save ${name}`}
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
      {sheet ? (
        <SaveSheet thing={sheet.thing} visible={sheet.open} onClose={() => setSheet({ ...sheet, open: false })} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  key: { width: SAVE_W, height: SAVE_H, borderRadius: radius.control, overflow: 'hidden' },
  face: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: radius.control },
  label: { ...textRole.bodyMedium, textAlign: 'center' },
});
