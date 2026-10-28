import React from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { DrinkName } from '@/components/cabinet';
import { colors, textRole } from '@/constants/theme';
import type { Pick } from '@/lib/recommend';

import {
  RESULT_PRINT,
  RESULT_TEXT_GAP,
  SAVE_GAP,
  SAVE_H,
  SAVE_W,
} from './metrics';
import { Appear } from './motion';
import { DrinkPrint } from './Photo';
import { SaveKey } from './SaveKey';

/* ==================================================================== */
/* One of the first picks                                               */
/*                                                                      */
/* specs/v4.1-changes.md 1.4 (spec 2, "Result rows"): a 72pt print (the */
/* no-photo face on wash for a drink without one), the name in the      */
/* marker through DrinkName (it scales a long name to fit its 156pt     */
/* column, never an ellipsis), the why line in small muted ink, two     */
/* lines at most, with ". You can make it." when the bar makes it, and  */
/* Save to try at the right.                                            */
/*                                                                      */
/* The reveal (m20) holds the print back while a copy flies to it, and  */
/* the words and the key until their turn. Held means not drawn by       */
/* plain state, released by the reveal's JS clock; once released they   */
/* fade up from 0.6, never from nothing.                                */
/* ==================================================================== */

const NAME_CAP = 1.3;
/** The name and why line start this far down the row, so they sit on the print. */
const TEXT_TOP = 10;

export type RowPart = 'shown' | 'held' | 'appear';

export function whyLine(pick: Pick): string {
  return pick.makeNow ? `${pick.why}. You can make it.` : pick.why;
}

export function PickRow({
  pick,
  contentW,
  print = 'shown',
  words = 'shown',
  onLayout,
}: {
  pick: Pick;
  /** The width between the 40pt margins. */
  contentW: number;
  print?: RowPart;
  words?: RowPart;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const nameW = Math.max(60, contentW - RESULT_PRINT - RESULT_TEXT_GAP - SAVE_GAP - SAVE_W);
  const why = whyLine(pick);

  const face = <DrinkPrint id={pick.id} size={RESULT_PRINT} />;
  const body = (
    <View style={styles.after}>
      <View accessible accessibilityLabel={why ? `${pick.name}. ${why}` : pick.name} style={[styles.text, { width: nameW }]}>
        <DrinkName name={pick.name} role={textRole.name} measure={nameW} cap={NAME_CAP} color={colors.text} />
        {why ? (
          <Text numberOfLines={2} style={styles.why}>
            {why}
          </Text>
        ) : null}
      </View>
      <View style={styles.save}>
        <SaveKey id={pick.id} name={pick.name} />
      </View>
    </View>
  );

  return (
    <View onLayout={onLayout} style={styles.row}>
      <View style={styles.print}>
        {print === 'appear' ? <Appear>{face}</Appear> : <View style={print === 'held' ? styles.held : null}>{face}</View>}
      </View>
      {words === 'appear' ? (
        <Appear duration={200} style={styles.afterBox}>
          {body}
        </Appear>
      ) : (
        <View
          style={[styles.afterBox, words === 'held' && styles.held]}
          accessibilityElementsHidden={words === 'held'}
          importantForAccessibility={words === 'held' ? 'no-hide-descendants' : 'auto'}>
          {body}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  print: { width: RESULT_PRINT, height: RESULT_PRINT },
  held: { opacity: 0 },
  afterBox: { flex: 1, marginLeft: RESULT_TEXT_GAP },
  after: { flexDirection: 'row', alignItems: 'flex-start' },
  text: { paddingTop: TEXT_TOP },
  why: { ...textRole.small, color: colors.textMuted, marginTop: 2 },
  save: { marginLeft: SAVE_GAP, marginTop: (RESULT_PRINT - SAVE_H) / 2 },
});
