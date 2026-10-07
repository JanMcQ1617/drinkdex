import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { DexStatusTag, dexStatusTagWidth, DrinkName, MOUNT, Mount, MountWindow } from '@/components/cabinet';
import { Grain } from '@/components/Grain';
import { ScreenTopBar, TopBarTextButton } from '@/components/ScreenTopBar';
import { Button, Card } from '@/components/ui';
import { colors, layout, space, stroke, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import { useIsUnlocked } from '@/store/collection';
import type { Drink } from '@/types';

import { BarFace } from './faces';

/* ==================================================================== */
/* Pour tonight, all of it                                              */
/*                                                                      */
/* "See all" under the strip: every drink the shelf pours, as the rows  */
/* today's My Bar listed them (a mounted thumbnail, the name in         */
/* Playfair, whether it is in your Dex yet), forty at a time. A page    */
/* sheet, presented by UIKit, so the counter stays where you left it.   */
/* ==================================================================== */

/** Rows per page: each row mounts a face, and six hundred in one commit is a freeze. */
const PAGE = 40;
const THUMB = { width: 44, height: 56 } as const;
/**
 * The name's column before its tag: the screen less its gutters, the
 * group's edges, the row's 16pt padding at both ends, the 44pt thumb and
 * the 12pt after it, and the 12pt gap before the tag.
 */
const ROW_CHROME = 2 * layout.gutter + 2 * stroke.edge + 2 * space.lg + THUMB.width + space.md + space.md;

const Row = React.memo(function Row({
  drink,
  first,
  measure,
  onOpen,
}: {
  drink: Drink;
  first: boolean;
  measure: number;
  onOpen: (id: string) => void;
}) {
  const inDex = useIsUnlocked(drink.id);
  const { fontScale } = useWindowDimensions();
  const inner = MOUNT.thumb.padding + stroke.edge;
  return (
    <Pressable
      onPress={() => onOpen(drink.id)}
      accessibilityRole="button"
      accessibilityLabel={`${drink.name}, ${inDex ? 'in your Dex' : 'not in your Dex yet'}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      {first ? null : <View style={styles.rule} />}
      <Mount state="mounted" size="thumb" onLining={false} style={THUMB}>
        <MountWindow height={THUMB.height - 2 * inner} state="mounted">
          <BarFace drink={drink} mode="lit" width={THUMB.width - 2 * inner} height={THUMB.height - 2 * inner} />
        </MountWindow>
      </Mount>
      <View style={styles.rowText}>
        <DrinkName
          name={drink.name}
          role={textRole.rowName}
          measure={measure - dexStatusTagWidth(inDex, false, fontScale)}
          cap={1.4}
          color={colors.text}
        />
      </View>
      <DexStatusTag inDex={inDex} />
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
  const { width } = useWindowDimensions();
  const [shown, setShown] = useState(PAGE);
  const left = drinks.length - shown;
  return (
    <View style={styles.screen}>
      <Grain />
      <ScreenTopBar
        title={`Pour tonight, ${formatCount(drinks.length)}`}
        inset="sheet"
        right={<TopBarTextButton label="Done" onPress={onClose} />}
        showRule
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.help}>Everything your shelf pours, A to Z.</Text>
        <Card style={styles.list}>
          {drinks.slice(0, shown).map((d, i) => (
            <Row key={d.id} drink={d} first={i === 0} measure={width - ROW_CHROME} onOpen={onOpen} />
          ))}
        </Card>
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
  list: { marginHorizontal: layout.gutter, marginTop: space.md, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: layout.rowTall,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  rowPressed: { backgroundColor: colors.bgSunk },
  rule: {
    position: 'absolute',
    top: 0,
    left: space.lg + THUMB.width + space.md,
    right: 0,
    height: stroke.hair,
    backgroundColor: colors.line,
  },
  rowText: { flex: 1 },
  more: { marginHorizontal: layout.gutter, marginTop: space.md },
});
