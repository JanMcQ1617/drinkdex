import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useScrollEdges } from '@/components/log/scrollEdges';
import { colors, stroke } from '@/constants/theme';

import { Bubble } from '../Bubble';
import { Guide, type GuideGesture } from '../Guide';
import { Appear } from '../motion';
import {
  BODY_PAD,
  BODY_TOP,
  BUBBLE_B_GAP,
  BUBBLE_C_GAP,
  CARD_GAP,
  EDGE,
  MARGIN,
  SEAL,
  STAGE_PAD,
  STAGE_TO_BUBBLE,
  footReserve,
  type Geometry,
} from '../metrics';

/* ==================================================================== */
/* A step's page, in Imprint's three modes (study 1)                    */
/*                                                                      */
/*   C  question: the 32pt seal at the top left, the bubble beside it,  */
/*      then the options on the 40pt margins                            */
/*   B  narration: the 40pt seal at the top centre, the bubble under it */
/*   A  centre stage: the 200pt seal in its rings, the bubble's tail     */
/*      pointing up at it                                               */
/*                                                                      */
/* The page scrolls (Dynamic Type grows everything) under the foot: the  */
/* footer key, and the feedback card 17 above it when the step has one.  */
/* While content runs on under the foot, the foot stands on the page     */
/* with a 1pt `line` rule at its top (y 820, m23), never a gradient;     */
/* the rest of the time there is nothing there to cover. The ground and */
/* the card belong to the step's layer and push with it; the key is the */
/* flow's and stays put.                                                */
/* ==================================================================== */

export type Foot = 'key' | 'none';

/** Air under the last item, below the foot's reserve, so it never sits flush on the rule. */
const END_AIR = 16;

export function Shell({
  geo,
  mode,
  prompt,
  sub,
  focus,
  gesture = 'speak',
  guideFrom,
  foot = 'key',
  card,
  children,
  after,
  bubbleIn,
}: {
  geo: Geometry;
  mode: 'A' | 'B' | 'C';
  prompt: string;
  sub?: string | null;
  /** Move VoiceOver to the bubble once arrived. */
  focus: boolean;
  gesture?: GuideGesture;
  /** The reveal's seal flying home (m20). */
  guideFrom?: { dx: number; dy: number; scale: number } | null;
  foot?: Foot;
  /** The feedback card, pinned 17 above the key. */
  card?: React.ReactNode;
  children?: React.ReactNode;
  /** Drawn over the page, under the foot: the reveal's flying copies. */
  after?: React.ReactNode;
  /** The bubble's words fade up from 0.6 over this many ms (the reveal's, m20). */
  bubbleIn?: number;
}) {
  const [cardH, setCardH] = useState<number | null>(null);
  const reserve = foot === 'key' ? footReserve(geo, card ? cardH ?? 0 : null) : geo.base + END_AIR;
  /*
   * The scroll view runs to the screen's foot, under the key, so "content
   * under the foot" is the last item's end below the foot's top edge: the
   * viewport's end short of the content's end by more than the air. (The
   * reserve is not padding past the foot, it is the foot: passing it here
   * would hide the rule while up to a reserve's worth of rows still sat
   * under the key, which a small phone or a large text size reaches.)
   */
  const edges = useScrollEdges(END_AIR);

  let head: React.ReactNode;
  if (mode === 'C') {
    head = (
      <View style={styles.cHead}>
        <Guide mode="C" gesture={gesture} from={guideFrom} />
        <Bubble mode="C" prompt={prompt} sub={sub} focus={focus} style={styles.cBubble} />
      </View>
    );
  } else if (mode === 'B') {
    head = (
      <View style={styles.centred}>
        <Guide mode="B" gesture={gesture} from={guideFrom} />
        {bubbleIn ? (
          <Appear duration={bubbleIn} style={styles.bBubble}>
            <Bubble mode="B" prompt={prompt} sub={sub} focus={focus} />
          </Appear>
        ) : (
          <Bubble mode="B" prompt={prompt} sub={sub} focus={focus} style={styles.bBubble} />
        )}
      </View>
    );
  } else {
    head = (
      <View style={styles.centred}>
        <Guide mode="A" gesture={gesture} from={guideFrom} />
        <Bubble mode="A" prompt={prompt} sub={sub} focus={focus} style={styles.aBubble} />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={[styles.scroll, { top: geo.top + BODY_TOP }]}
        contentContainerStyle={{ paddingTop: mode === 'A' ? STAGE_PAD : BODY_PAD, paddingBottom: reserve + END_AIR }}
        keyboardShouldPersistTaps="handled"
        alwaysBounceVertical={false}
        automaticallyAdjustKeyboardInsets
        onScroll={edges.onScroll}
        onLayout={edges.onLayout}
        onContentSizeChange={edges.onContentSizeChange}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}>
        {head}
        {children}
      </ScrollView>
      {after}
      {foot === 'key' && edges.moreBelow ? <View pointerEvents="none" style={[styles.ground, { height: reserve }]} /> : null}
      {card ? (
        <View
          onLayout={(e) => setCardH(e.nativeEvent.layout.height)}
          style={[styles.card, { bottom: geo.height - geo.keyTop + CARD_GAP }]}>
          {card}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  cHead: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: MARGIN },
  cBubble: { flex: 1, marginLeft: BUBBLE_C_GAP, minHeight: SEAL.C },
  centred: { alignItems: 'center' },
  bBubble: { alignSelf: 'stretch', marginHorizontal: MARGIN, marginTop: BUBBLE_B_GAP },
  aBubble: { alignSelf: 'stretch', marginHorizontal: EDGE, marginTop: STAGE_TO_BUBBLE },
  ground: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    borderTopWidth: stroke.edge,
    borderTopColor: colors.line,
  },
  card: { position: 'absolute', left: EDGE, right: EDGE },
});
