import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, space, textRole } from '@/constants/theme';

import { Bubble } from './Bubble';
import { FooterKey } from './FooterKey';
import { Guide } from './Guide';
import { EDGE, STAGE_TO_BUBBLE } from './metrics';

/* ==================================================================== */
/* The stop                                                             */
/*                                                                      */
/* "No, not yet" on the age question ends the flow (specs/v4.1-changes  */
/* .md 1.5; underage.png): the seal at centre stage, one sentence, and  */
/* Back to start, the wash key (m22). It never says how long the lock    */
/* lasts or how to get round it. Nothing is asked or kept but the lock  */
/* (store/taste refuseAge).                                             */
/*                                                                      */
/* UnderAgeBody is the flow's step body (its key is the flow's footer   */
/* key, relabelled). UnderAgeStop is the same body with its own key, for */
/* AuthGate: a brand-new account made through "I already have an        */
/* account" inside the lock meets it in place of the username step, and */
/* the key's handler deletes that account (busy while it does).         */
/* ==================================================================== */

export const UNDER_AGE_PROMPT = 'Sipply is for people of legal drinking age.';
export const UNDER_AGE_SUB = 'See you when you are.';
export const BACK_TO_START = 'Back to start';

export function UnderAgeBody({ focus = false }: { focus?: boolean }) {
  return (
    <View style={styles.body}>
      <Guide mode="A" gesture="speak" />
      <Bubble mode="A" prompt={UNDER_AGE_PROMPT} focus={focus} style={styles.bubble} />
      <Text style={styles.sub}>{UNDER_AGE_SUB}</Text>
    </View>
  );
}

export function UnderAgeStop({ onBack, busy = false }: { onBack: () => void; busy?: boolean }) {
  return (
    <View style={styles.stop}>
      <UnderAgeBody focus />
      <View style={styles.grow} />
      <FooterKey
        label={BACK_TO_START}
        look="wash"
        busy={busy}
        onPress={onBack}
        style={styles.key}
        accessibilityHint="Leaves without keeping an account"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stop: { flex: 1, paddingTop: space.xxl, paddingBottom: space.xl },
  body: { alignItems: 'center' },
  bubble: { alignSelf: 'stretch', marginHorizontal: EDGE, marginTop: STAGE_TO_BUBBLE },
  sub: {
    ...textRole.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: space.sm,
    paddingHorizontal: 56 - EDGE,
    marginHorizontal: EDGE,
  },
  grow: { flexGrow: 1, minHeight: space.xxl },
  key: { marginHorizontal: EDGE },
});
