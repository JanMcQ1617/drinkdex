import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrinkName } from '@/components/cabinet';
import { TopBarButton } from '@/components/ScreenTopBar';
import { colors, layout, space, stroke, textRole } from '@/constants/theme';

/* ==================================================================== */
/* The compose step's bar (layout spec 5.6, "after picking")            */
/*                                                                      */
/* A back chevron and the chosen drink's name, centred, in Playfair at  */
/* body size: the name is the screen's title, so there is no "Post a    */
/* drink" above it and no other icon (layout principle 8).              */
/*                                                                      */
/* WHY NOT ScreenTopBar. Its row is a fixed 52pt, which suits a word    */
/* like "Settings", but a drink's name must never be cut (it is drawn   */
/* by DrinkName and wraps). "Rothman & Winter Crème de Violette" at     */
/* Larger Text takes two lines, so this bar is ScreenTopBar's md bar    */
/* with a row that grows: 52pt at least, the title in the flow between  */
/* two equal sides so it stays centred on the screen. Same page ground, */
/* same 1pt rule once the photo scrolls under it.                       */
/* ==================================================================== */

/** A md bar's side slot (ScreenTopBar's SIDE): a 44pt glyph button and its margins. */
const SIDE = 52;
/** Larger Text grows the title only so far in a bar (ScreenTopBar's cap). */
const TITLE_CAP = 1.3;

export function ComposeBar({
  name,
  width,
  showRule,
  onBack,
}: {
  name: string;
  /** The window's width: the title's measure is what the two sides leave. */
  width: number;
  showRule: boolean;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top }, showRule && styles.ruled]}>
      <View style={styles.row}>
        <View style={styles.side}>
          <TopBarButton
            icon="chevronLeft"
            label="Back"
            accessibilityHint="Back to the search, to choose a different drink"
            onPress={onBack}
          />
        </View>
        <View accessible accessibilityRole="header" accessibilityLabel={name} style={styles.title}>
          <DrinkName
            name={name}
            role={textRole.name}
            measure={width - 2 * SIDE}
            cap={TITLE_CAP}
            color={colors.text}
            align="center"
          />
        </View>
        <View style={styles.side} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.bg,
    // Always laid out, transparent at rest, so the rule moves nothing when it shows.
    borderBottomWidth: stroke.edge,
    borderBottomColor: 'transparent',
  },
  ruled: { borderBottomColor: colors.line },
  row: { minHeight: layout.topBar, flexDirection: 'row', alignItems: 'center' },
  side: { width: SIDE, paddingLeft: space.xs, alignSelf: 'flex-start', height: layout.topBar, justifyContent: 'center' },
  title: { flex: 1, paddingVertical: space.md, alignItems: 'center' },
});
