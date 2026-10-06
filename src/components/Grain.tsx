import { Image, StyleSheet, View } from 'react-native';

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
/* REACT NATIVE'S Image, NOT expo-image. Tiling is the entire point and  */
/* only core Image has `resizeMode="repeat"`; expo-image has no repeat   */
/* mode at all, so the same tile there would be stretched to full screen */
/* — a grey blur instead of a texture. This is the one place in the app  */
/* that must not use expo-image.                                        */
/*                                                                      */
/* pointerEvents="none" is load-bearing: a sheet or an older screen      */
/* still mounts this over its content, and there it would otherwise     */
/* swallow every tap.                                                   */
/*                                                                      */
/* The tile is generated, not drawn — the seeded script is recorded in   */
/* the commit that added assets/images/grain.png, so it can be made      */
/* again rather than being a binary nobody can reproduce.                */
/* ==================================================================== */

export function Grain({ tone = 'paper' }: { tone?: 'paper' | 'lining' }) {
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Image
        source={require('../../assets/images/grain.png')}
        resizeMode="repeat"
        /*
         * The tile ships at alpha 26/255; this is the second, tunable half
         * of the strength (grain.paper, grain.lining).
         */
        style={[StyleSheet.absoluteFill, { opacity: grain[tone] }]}
      />
    </View>
  );
}
