import React from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Icon } from '@/components/icons';
import { colors, fonts, radius, space, tabular, textRole } from '@/constants/theme';

import { CARD_H, CARD_PAD, CARD_PRINT, CARD_TEXT_GAP } from './metrics';
import { Appear, FadeOut, T, useFadingPrevious } from './motion';
import { DrinkPrint } from './Photo';

/* ==================================================================== */
/* The feedback card                                                    */
/*                                                                      */
/* Imprint 18 and 21, in Daylight (spec 2, study 4): the slot 17 above  */
/* the key, 105 tall, a wash card with a 56pt drink print on the left   */
/* (the only colour) and one body line, its figure in 600: "That's     */
/* 574 drinks in the Dex that match." The flavours and the bar use it.  */
/*                                                                      */
/* Mounted on the first pick, at 0.6 and fading up in place (m10, 300ms, */
/* no movement); later picks crossfade its words and its print (200ms).  */
/* The old words are a copy laid over the new and unmounted on a timer, */
/* so the card always ends on the right figure.                         */
/* ==================================================================== */

export interface CardWords {
  before: string;
  /** The figure, in 600 and tabular. */
  figure?: string;
  after?: string;
}

const SEP = '\u0001';
const pack = (w: CardWords) => [w.before, w.figure ?? '', w.after ?? ''].join(SEP);
const spoken = (w: CardWords) => `${w.before}${w.figure ?? ''}${w.after ?? ''}`;

function Words({ words }: { words: CardWords }) {
  return (
    <Text style={styles.words}>
      {words.before}
      {words.figure ? <Text style={styles.figure}>{words.figure}</Text> : null}
      {words.after ?? ''}
    </Text>
  );
}

function Picture({ drinkId }: { drinkId: string | null }) {
  if (!drinkId) {
    return (
      <View style={styles.empty}>
        <Icon name="bottle" size={28} color={colors.lineControl} />
      </View>
    );
  }
  return <DrinkPrint id={drinkId} size={CARD_PRINT} />;
}

export function FeedbackCard({
  drinkId,
  words,
  onHeight,
  style,
}: {
  /** The print beside the words; null draws an empty bottle slot. */
  drinkId: string | null;
  words: CardWords;
  /** The card's height, so the step's list can clear it. */
  onHeight?: (h: number) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReducedMotion();
  const key = pack(words);
  const oldWords = useFadingPrevious(key, reduce ? 0 : T.cardText + T.settle);
  const oldPrint = useFadingPrevious(drinkId, reduce ? 0 : T.cardText + T.settle);
  const live = !reduce;

  return (
    <Appear duration={T.card} style={style} pointerEvents="none">
      <View
        accessible
        accessibilityLabel={spoken(words)}
        onLayout={onHeight ? (e: LayoutChangeEvent) => onHeight(e.nativeEvent.layout.height) : undefined}
        style={styles.card}>
        <View style={styles.print}>
          <Picture drinkId={drinkId} />
          {live && oldPrint !== undefined ? (
            <FadeOut duration={T.cardText}>
              <Picture drinkId={oldPrint} />
            </FadeOut>
          ) : null}
        </View>
        <View style={styles.text}>
          <Words words={words} />
          {live && oldWords !== undefined ? (
            <FadeOut duration={T.cardText} style={styles.oldWords}>
              <Words
                words={{
                  before: oldWords.split(SEP)[0] ?? '',
                  figure: oldWords.split(SEP)[1] || undefined,
                  after: oldWords.split(SEP)[2] ?? '',
                }}
              />
            </FadeOut>
          ) : null}
        </View>
      </View>
    </Appear>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: CARD_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: CARD_TEXT_GAP,
    paddingHorizontal: CARD_PAD,
    paddingVertical: space.lg,
    backgroundColor: colors.bgSunk,
    borderRadius: radius.control,
  },
  print: { width: CARD_PRINT, height: CARD_PRINT },
  empty: {
    width: CARD_PRINT,
    height: CARD_PRINT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  text: { flex: 1, justifyContent: 'center' },
  /* The old words over the new: the same box, the copy fading. */
  oldWords: { justifyContent: 'center', backgroundColor: colors.bgSunk },
  words: { ...textRole.body, color: colors.text },
  figure: { fontFamily: fonts.bodySemiBold, ...tabular },
});
