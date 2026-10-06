import { useState } from 'react';
import { Image, type LayoutChangeEvent, StyleSheet, View } from 'react-native';

import { grain } from '@/constants/theme';

/* ==================================================================== */
/* Grain                                                                */
/*                                                                      */
/* A 128px tile of seeded gaussian noise, repeated across a ground at    */
/* low opacity.                                                         */
/*                                                                      */
/* WHY. The grounds are materials: cream paper, and in v3 the wine       */
/* lining of a cabinet, grained like baize. Rendered as a flat fill a    */
/* ground reads as a hex value instead — perfectly even, which no paper  */
/* or cloth ever is. The grain is what makes a rectangle look like stock */
/* rather than a swatch, and it is the cheapest depth in the app: no     */
/* motion, no layout, no per-frame cost.                                */
/*                                                                      */
/* WHY NOT A GRADIENT OR A GLOW. Those were deliberately removed in the  */
/* de-slop pass, because a gradient behind content is the single most    */
/* template-looking thing a phone app can do. Grain is the opposite      */
/* move: it adds material rather than decoration, and it cannot be       */
/* mistaken for a glow.                                                  */
/*                                                                      */
/* ONE PER GROUND, UNDER CONTENT. It used to be one global overlay over  */
/* the whole app, which dusted every photograph with sensor noise. Now   */
/* each ground mounts its own as its FIRST child, so whatever sits on    */
/* the ground (photos included) is drawn above it. `tone` picks the      */
/* strength from `grain` in theme.ts: paper ~3.6%, lining ~7.8%, which   */
/* check-contrast composites under every text pair on those grounds.    */
/* Never mount it over media.                                           */
/*                                                                      */
/* TILED BY HAND, NOT resizeMode="repeat". Build 14 on Jan's iPhone drew */
/* the repeat image as ONE tile: a lighter 128pt square in the top-left  */
/* of every grained ground, and no grain anywhere else. So the ground is */
/* measured and covered with a grid of 128pt tiles; every tile is the    */
/* same bundled image, decoded once and shared. Core Image, not          */
/* expo-image: it is a tiny bundled asset that needs no cache policy.    */
/*                                                                      */
/* pointerEvents="none" is load-bearing: a sheet or an older screen      */
/* still mounts this over its content, and there it would otherwise     */
/* swallow every tap.                                                   */
/*                                                                      */
/* The tile is generated, not drawn — the seeded script is recorded in   */
/* the commit that added assets/images/grain.png, so it can be made      */
/* again rather than being a binary nobody can reproduce.                */
/* ==================================================================== */

const GRAIN_TILE = require('../../assets/images/grain.png');
/** The tile's size in points (the PNG is 128px, shipped at 1x). */
const TILE = 128;
/** Past this the ground is a long scroll; the grain stops rather than mounting hundreds of tiles. */
const MAX_ROWS = 40;

export function Grain({ tone = 'paper' }: { tone?: 'paper' | 'lining' }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  };
  const cols = size ? Math.ceil(size.w / TILE) : 0;
  const rows = size ? Math.min(MAX_ROWS, Math.ceil(size.h / TILE)) : 0;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={onLayout}>
      {/*
        The tile ships at alpha 26/255; this is the second, tunable half
        of the strength (grain.paper, grain.lining).
      */}
      <View style={[StyleSheet.absoluteFill, styles.clip, { opacity: grain[tone] }]}>
        {Array.from({ length: rows * cols }, (_, i) => (
          <Image
            key={i}
            source={GRAIN_TILE}
            style={[styles.tile, { left: (i % cols) * TILE, top: Math.floor(i / cols) * TILE }]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  tile: { position: 'absolute', width: TILE, height: TILE },
});
