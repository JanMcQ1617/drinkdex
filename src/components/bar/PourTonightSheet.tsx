import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { BrassPlate, DotLeader, formatPlateNumber, plateWidth } from '@/components/brass';
import { DexStatusTag, DrinkName } from '@/components/cabinet';
import { Grain } from '@/components/Grain';
import { ScreenTopBar, TopBarTextButton } from '@/components/ScreenTopBar';
import { Button } from '@/components/ui';
import { colors, layout, space, stroke, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import { useIsUnlocked } from '@/store/collection';
import type { Drink } from '@/types';

/* ==================================================================== */
/* You can make, all of it                                              */
/*                                                                      */
/* "See all" beside "You can make": every drink your bar makes, A to Z, */
/* set as a bar's menu (v3.3 graft 8): the name in Playfair, a dotted   */
/* leader, the brass Nº plate at the right on the name's last line, and */
/* what goes in it underneath. Forty lines at a time. A page sheet,     */
/* presented and dismissed by UIKit (its own slide, interruptible by    */
/* the grabber, nothing on the JS frame loop), so My Bar stays where    */
/* you left it underneath.                                              */
/*                                                                      */
/* No pictures: a menu is read, and forty lines of words cost nothing   */
/* to draw, where forty thumbs were forty decodes.                      */
/* ==================================================================== */

/** Lines per page: each mounts a plate and a leader, and six hundred in one commit is a freeze. */
const PAGE = 40;
/** The fewest dots a leader keeps, so a long name still reads as a menu line. */
const LEADER_MIN = 16;
/**
 * The leader rides on the name's baseline: Playfair at rowName's 22pt
 * line sits about 5pt above the line's foot, and that grows with the
 * name's text size (`nameScale`), so it is scaled with it.
 */
const LEADER_LIFT = 5;
/** The name's Dynamic Type cap (rowName in a list row, specs/v3-cabinet.md 6.5). */
const NAME_CAP = 1.4;

/** What goes in, as the recipe lists it: "Gin · Lemon juice · Sugar · Soda water". */
function contents(d: Drink): string | null {
  return d.ingredients?.length ? d.ingredients.join(' · ') : null;
}

const MenuLine = React.memo(function MenuLine({
  drink,
  first,
  onOpen,
}: {
  drink: Drink;
  first: boolean;
  onOpen: (id: string) => void;
}) {
  const inDex = useIsUnlocked(drink.id);
  const { width, fontScale } = useWindowDimensions();
  const plate = plateWidth(formatPlateNumber(drink.dexNumber), 'sm', fontScale);
  const nameScale = Math.min(fontScale, NAME_CAP);
  // The name's column: the line less its gutters, the plate and the shortest leader with its 4pt sides.
  const measure = width - 2 * layout.gutter - plate - LEADER_MIN - 2 * space.xs;
  const what = contents(drink);
  return (
    <Pressable
      onPress={() => onOpen(drink.id)}
      accessibilityRole="button"
      accessibilityLabel={[
        drink.name,
        `number ${drink.dexNumber}`,
        what ? what.split(' · ').join(', ') : null,
        inDex ? 'in your Dex' : 'not in your Dex yet',
      ]
        .filter(Boolean)
        .join(', ')}
      style={({ pressed }) => [styles.line, pressed && styles.linePressed]}>
      {first ? null : <View style={styles.rule} />}
      <View style={styles.head}>
        <DrinkName
          name={drink.name}
          role={textRole.rowName}
          measure={measure}
          cap={NAME_CAP}
          color={colors.text}
          style={styles.name}
        />
        <DotLeader style={{ minWidth: LEADER_MIN, marginBottom: LEADER_LIFT * nameScale }} />
        {/*
          A slot, so the row's flex-end carries the plate down to the name's
          last line: BrassPlate sets its own alignSelf (flex-start, for
          columns), which on its own would pin it to the name's FIRST line.
        */}
        <View>
          <BrassPlate n={drink.dexNumber} />
        </View>
      </View>
      {what ? <Text style={styles.contents}>{what}</Text> : null}
      {/* Only the new ones are marked: on a menu of what you can pour, "not caught yet" is the news. */}
      {inDex ? null : (
        <View style={styles.tag}>
          <DexStatusTag inDex={false} />
        </View>
      )}
    </Pressable>
  );
});

export function PourTonightSheet({
  visible,
  drinks,
  onClose,
  onOpen,
  onDismissed,
}: {
  visible: boolean;
  drinks: readonly Drink[];
  onClose: () => void;
  onOpen: (id: string) => void;
  /** iOS: the sheet has finished leaving (a drink's page can be pushed now). */
  onDismissed: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={onDismissed}>
      <Body drinks={drinks} onClose={onClose} onOpen={onOpen} />
    </Modal>
  );
}

function Body({
  drinks,
  onClose,
  onOpen,
}: {
  drinks: readonly Drink[];
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const [shown, setShown] = useState(PAGE);
  const left = drinks.length - shown;
  return (
    <View style={styles.screen}>
      <Grain />
      <ScreenTopBar
        title={`You can make ${formatCount(drinks.length)}`}
        inset="sheet"
        right={<TopBarTextButton label="Done" onPress={onClose} />}
        showRule
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.help}>Everything your bar makes, A to Z.</Text>
        <View style={styles.menu}>
          {drinks.slice(0, shown).map((d, i) => (
            <MenuLine key={d.id} drink={d} first={i === 0} onOpen={onOpen} />
          ))}
        </View>
        {left > 0 ? (
          <Button
            label={`Show ${formatCount(Math.min(PAGE, left))} more`}
            variant="secondary"
            block
            onPress={() => setShown((n) => n + PAGE)}
            accessibilityHint={`${formatCount(left)} not shown yet`}
            style={styles.more}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: space.xxxl },
  help: { ...textRole.helper, color: colors.textMuted, paddingHorizontal: layout.gutter, marginTop: space.sm },
  menu: { marginTop: space.md },
  line: { paddingHorizontal: layout.gutter, paddingVertical: space.md, gap: 2 },
  linePressed: { backgroundColor: colors.bgSunk },
  rule: {
    position: 'absolute',
    top: 0,
    left: layout.gutter,
    right: layout.gutter,
    height: stroke.hair,
    backgroundColor: colors.line,
  },
  /* The leader and the plate sit on the name's LAST line: the row aligns to its foot. */
  head: { flexDirection: 'row', alignItems: 'flex-end' },
  name: { flexShrink: 1 },
  contents: { ...textRole.helper, color: colors.textMuted },
  tag: { alignItems: 'flex-start', marginTop: space.xs },
  more: { marginHorizontal: layout.gutter, marginTop: space.md },
});
