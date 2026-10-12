import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { WaysIn } from '@/components/auth/WaysIn';
import { colors, layout, textRole } from '@/constants/theme';

import { EDGE, type Geometry } from '../metrics';

import { Shell } from './Shell';

/* ==================================================================== */
/* Keep your picks: the sign-in (mode C; signin.png)                    */
/*                                                                      */
/* The existing ways in, unchanged (auth/WaysIn: Apple, Google,         */
/* Facebook, email, then the age and terms sentence), on the 24pt edges */
/* the provider rows keep, and Not now, an ink underlined word in the    */
/* footer's slot. Apple, Google and Facebook finish here: the session    */
/* arriving hides the whole first run. Email and phone carry on at the   */
/* Home tab's gate (the sign-in flow store is shared), which the flow   */
/* hands off to as soon as the flow leaves its first step.              */
/* ==================================================================== */

export const SIGNIN_PROMPT = 'Where should I keep your picks?';
export const SIGNIN_SUB = 'Make an account and your picks and bar come with you.';
/** The provider rows start 35 under the bubble (y 290). */
const WAYS_GAP = 34;
/** Not now's words sit low in the key's slot (y 870 to 894). */
const LINK_DROP = 19;
const LINK_CAP = 1.3;

export function SignInStep({ geo, focus, onNotNow }: { geo: Geometry; focus: boolean; onNotNow: () => void }) {
  return (
    <>
      <Shell geo={geo} mode="C" prompt={SIGNIN_PROMPT} sub={SIGNIN_SUB} focus={focus} gesture="speak">
        <View style={styles.ways}>
          <WaysIn />
        </View>
      </Shell>
      <View pointerEvents="box-none" style={[styles.linkRow, { top: geo.keyTop + LINK_DROP }]}>
        <Pressable
          onPress={onNotNow}
          accessibilityRole="button"
          accessibilityLabel="Not now"
          accessibilityHint="Opens Sipply without an account. Your picks stay on this phone."
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
          <Text maxFontSizeMultiplier={LINK_CAP} style={styles.linkText}>
            Not now
          </Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  ways: { marginTop: WAYS_GAP, paddingHorizontal: EDGE },
  linkRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  link: { minHeight: layout.hit, paddingHorizontal: EDGE, alignItems: 'center', justifyContent: 'center' },
  linkText: { ...textRole.bodyMedium, color: colors.text, textDecorationLine: 'underline' },
  pressed: { opacity: 0.5 },
});
