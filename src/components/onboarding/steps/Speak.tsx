import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import type { GuideGesture } from '../Guide';
import { BODY_TOP, STAGE_PAD, footReserve, type Geometry } from '../metrics';
import { UnderAgeBody } from '../UnderAgeStop';

import { Shell } from './Shell';

/* ==================================================================== */
/* The guide speaks (mode A; Imprint 02 and 23)                         */
/*                                                                      */
/*   hello   "Welcome! Let's find your drinks."  Continue, enabled      */
/*   allset  "All set! Let's keep your picks."   the seal stamps (m21)   */
/*   stop    the under-age screen's body (UnderAgeStop)                 */
/* ==================================================================== */

export function SpeakStep({
  geo,
  prompt,
  gesture,
  focus,
}: {
  geo: Geometry;
  prompt: string;
  gesture: GuideGesture;
  focus: boolean;
}) {
  return <Shell geo={geo} mode="A" prompt={prompt} gesture={gesture} focus={focus} />;
}

export function StopStep({ geo, focus }: { geo: Geometry; focus: boolean }) {
  return (
    <ScrollView
      style={[styles.scroll, { top: geo.top + BODY_TOP }]}
      contentContainerStyle={{ paddingTop: STAGE_PAD, paddingBottom: footReserve(geo, null) + 16 }}
      alwaysBounceVertical={false}
      showsVerticalScrollIndicator={false}>
      <UnderAgeBody focus={focus} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
