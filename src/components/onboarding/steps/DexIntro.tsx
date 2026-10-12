import React from 'react';
import { StyleSheet, View } from 'react-native';

import { DexReveal } from '../DexReveal';
import { DEX_TOP, MARGIN, type Geometry } from '../metrics';

import { Shell } from './Shell';

/* ==================================================================== */
/* Narration: your Dex (mode B; dexintro.png, Imprint 09)               */
/*                                                                      */
/* No key: it moves on by itself 1.8s after its last print (m18, the    */
/* flow's clock). Under VoiceOver there is a Continue instead.          */
/* ==================================================================== */

export const DEX_PROMPT = 'Every drink you try goes in your Dex.';

export function DexIntroStep({ geo, focus, keyed }: { geo: Geometry; focus: boolean; keyed: boolean }) {
  return (
    <Shell geo={geo} mode="B" prompt={DEX_PROMPT} focus={focus} foot={keyed ? 'key' : 'none'}>
      <View style={styles.grid}>
        <DexReveal width={geo.contentW} />
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  grid: { marginTop: DEX_TOP, paddingHorizontal: MARGIN },
});
