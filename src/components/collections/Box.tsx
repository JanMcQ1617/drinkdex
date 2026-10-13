import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icons';
import { colors, radius } from '@/constants/theme';

/* ==================================================================== */
/* The 22pt box                                                         */
/*                                                                      */
/* The save sheet's rows (ticked when the thing is in that collection), */
/* Remove items' tiles and Add from All saved's. Unticked, a 1.5pt      */
/* control edge on the page (3.45:1, a control's edge, never ink);      */
/* ticked, ink with a white check. The fill and the glyph both change,  */
/* so it never rests on colour alone. Decorative: the row or tile that  */
/* holds it is the checkbox VoiceOver hears.                            */
/* ==================================================================== */

export const BOX = 22;

export function Box({ on, onMedia }: { on: boolean; onMedia?: boolean }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.box, on ? styles.on : onMedia ? styles.offOnMedia : styles.off]}>
      {on ? <Icon name="check" size={16} color={colors.onInk} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: BOX,
    height: BOX,
    borderRadius: radius.badge,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  on: { backgroundColor: colors.text, borderColor: colors.text },
  off: { backgroundColor: colors.bg, borderColor: colors.lineControl },
  /* Over a print (Remove items, Add from All saved): the page's white inside, so the edge holds on any photo. */
  offOnMedia: { backgroundColor: colors.bg, borderColor: colors.text },
});
