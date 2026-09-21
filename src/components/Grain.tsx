import { Image, StyleSheet, View } from 'react-native';

/* ==================================================================== */
/* Paper grain                                                          */
/*                                                                      */
/* A 128px tile of seeded gaussian noise, repeated across the whole app  */
/* at low opacity.                                                      */
/*                                                                      */
/* WHY. The palette is called Porcelain Speakeasy and the ground is a    */
/* warm bone (#F7F2EA) meant to read as paper. Rendered as a flat fill   */
/* it reads as a hex value instead — perfectly even, which no paper      */
/* ever is. The grain is what makes a cream rectangle look like stock    */
/* rather than a swatch, and it is the cheapest depth in the app: no     */
/* motion, no layout, no per-frame cost.                                */
/*                                                                      */
/* WHY NOT A GRADIENT OR A GLOW. Those were deliberately removed in the  */
/* de-slop pass, because a gradient behind content is the single most    */
/* template-looking thing a phone app can do. Grain is the opposite      */
/* move: it adds material rather than decoration, and it cannot be       */
/* mistaken for a glow.                                                  */
/*                                                                      */
/* REACT NATIVE'S Image, NOT expo-image. Tiling is the entire point and  */
/* only core Image has `resizeMode="repeat"`; expo-image has no repeat   */
/* mode at all, so the same tile there would be stretched to full screen */
/* — a grey blur instead of a texture. This is the one place in the app  */
/* that must not use expo-image.                                        */
/*                                                                      */
/* pointerEvents="none" is load-bearing: this covers every pixel of the  */
/* app and would otherwise swallow every tap in it.                     */
/*                                                                      */
/* The tile is generated, not drawn — the seeded script is recorded in   */
/* the commit that added assets/images/grain.png, so it can be made      */
/* again rather than being a binary nobody can reproduce.                */
/* ==================================================================== */

export function Grain() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image
        source={require('../../assets/images/grain.png')}
        resizeMode="repeat"
        /*
         * The tile ships at alpha 26/255; this is the second, tunable half
         * of the strength. Together they land near 3.5% — visible as
         * texture at arm's length, invisible as dots.
         */
        style={[StyleSheet.absoluteFill, styles.grain]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grain: { opacity: 0.35 },
});
