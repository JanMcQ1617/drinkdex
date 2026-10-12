import React, { useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  SectionList,
  type SectionListData,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrinkName } from '@/components/cabinet';
import { TopBarTextButton } from '@/components/ScreenTopBar';
import { SheetGrabber } from '@/components/Sheet';
import { colors, layout, space, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import type { MakeSection } from '@/lib/bar';
import type { Drink } from '@/types';

import { MAKE_THUMB, MakeThumb, nameLines } from './faces';

/* ==================================================================== */
/* You can make                                                         */
/*                                                                      */
/* The payoff key's list (shelves spec 5.6, v4-changes 6.5): every      */
/* drink your bar pours, by base spirit, familiar drinks first inside   */
/* each section (the judges' graft, so the Negroni is near the top of   */
/* Gin), a 40pt colour print and the name. One line under the title     */
/* names the sections with their sizes, and each name jumps there.      */
/* "Show its drinks" on an ingredient opens the same list narrowed to   */
/* that bottle.                                                         */
/*                                                                      */
/* A page sheet, presented and slid away by UIKit (no route: typed      */
/* routes need Metro to learn a new file), so My Bar stays where it was */
/* underneath. A SectionList with every row and head one known height, */
/* so getItemLayout puts a jump straight on its section.                */
/* ==================================================================== */

/** Dynamic Type cap for the names (a list row, specs/v3-cabinet.md 6.5) and the section heads. */
const CAP = 1.3;
/** The shortest row: a 40 print with 8 above and below. */
const ROW_MIN = 56;
/** Space a section leaves after its last row. */
const SECTION_FOOT = space.lg;

type Section = SectionListData<Drink, { key: string; title: string }>;

export function MakeSheet({
  visible,
  title,
  sections,
  onClose,
  onOpen,
}: {
  visible: boolean;
  /** "You can make 31", or the narrowed list's "You can make 5 with lime". */
  title: string;
  sections: readonly MakeSection[];
  onClose: () => void;
  /** A drink tapped, called once the sheet has gone (a page pushed under a sheet lands behind it). */
  onOpen: (drinkId: string) => void;
}) {
  /** The drink tapped, opened once the sheet has finished leaving (LikersSheet's pattern). */
  const pending = useRef<string | null>(null);

  const open = (id: string) => {
    pending.current = id;
    onClose();
    // Only iOS reports the sheet's dismissal; elsewhere open the drink straight away.
    if (Platform.OS !== 'ios') {
      pending.current = null;
      onOpen(id);
    }
  };
  const afterDismiss = () => {
    const id = pending.current;
    pending.current = null;
    if (id) onOpen(id);
  };

  /*
   * No allowSwipeDismissal, as MusicPicker: a swipe down asks
   * (onRequestClose) and the sheet leaves when `visible` goes false, so
   * Done and the swipe take one path.
   */
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={afterDismiss}>
      <Body title={title} sections={sections} onClose={onClose} onOpen={open} />
    </Modal>
  );
}

function Body({
  title,
  sections,
  onClose,
  onOpen,
}: {
  title: string;
  sections: readonly MakeSection[];
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const listRef = useRef<SectionList<Drink, { key: string; title: string }>>(null);
  const [contentH, setContentH] = useState(0);
  const [viewH, setViewH] = useState(0);

  const s = Math.min(fontScale, CAP);
  const measure = width - 2 * layout.gutter - MAKE_THUMB - space.lg;

  /*
   * Every row is as tall as the longest name needs at this text size, and
   * every head the same height, so the list can be laid out from numbers
   * alone: getItemLayout, and a jump that lands on its head in one step.
   */
  const { row, head, data, frames } = useMemo(() => {
    const size = textRole.name.fontSize * s;
    const lines = sections.reduce(
      (n, sec) => sec.drinks.reduce((m, d) => Math.max(m, nameLines(d.name, size, measure)), n),
      1,
    );
    const rowH = Math.max(ROW_MIN, Math.ceil(lines * textRole.name.lineHeight * s) + 2 * space.sm);
    const headH = Math.ceil(textRole.bodyStrong.lineHeight * s) + space.lg + space.sm;
    const list: Section[] = sections.map((sec) => ({ key: sec.key, title: sec.title, data: sec.drinks }));
    // SectionList's flat index: per section a head, its rows, then a foot.
    const table: { length: number; offset: number }[] = [];
    let y = 0;
    for (const sec of list) {
      table.push({ length: headH, offset: y });
      y += headH;
      for (let i = 0; i < sec.data.length; i++) {
        table.push({ length: rowH, offset: y });
        y += rowH;
      }
      table.push({ length: SECTION_FOOT, offset: y });
      y += SECTION_FOOT;
    }
    return { row: rowH, head: headH, data: list, frames: table };
  }, [sections, s, measure]);

  /** The flat index of each section's head, for the jump line. */
  const headIndex = useMemo(() => {
    const at: number[] = [];
    let i = 0;
    for (const sec of data) {
      at.push(i);
      i += sec.data.length + 2;
    }
    return at;
  }, [data]);

  /*
   * A jump puts the section's head at the top, or as near as the list's
   * end allows: UIKit takes an offset past the end and leaves the page
   * showing blank, so it is clamped.
   */
  const jump = (k: number) => {
    const frame = frames[headIndex[k] ?? 0];
    if (!frame) return;
    const y = Math.max(0, Math.min(frame.offset, contentH - viewH));
    listRef.current?.getScrollResponder()?.scrollTo({ y, animated: !reducedMotion });
  };

  return (
    <View style={styles.screen}>
      <SheetGrabber />
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[textRole.title, styles.ink, styles.title]}>
          {title}
        </Text>
        <TopBarTextButton label="Done" onPress={onClose} />
      </View>
      {sections.length > 1 ? (
        <View style={styles.jumps}>
          {sections.map((sec, k) => (
            <View key={sec.key} style={styles.jumpItem}>
              {k > 0 ? (
                <Text accessible={false} style={[textRole.small, styles.muted]}>
                  {' · '}
                </Text>
              ) : null}
              <Pressable
                onPress={() => jump(k)}
                hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={`${sec.title}, ${formatCount(sec.drinks.length)}`}
                accessibilityHint="Jumps to the section"
                style={({ pressed }) => pressed && styles.pressedWord}>
                <Text style={[textRole.small, styles.muted]}>
                  {sec.title} {formatCount(sec.drinks.length)}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <SectionList
        ref={listRef}
        sections={data}
        keyExtractor={(d) => d.id}
        getItemLayout={(_, index) => {
          const frame = frames[index] ?? { length: 0, offset: frames[frames.length - 1]?.offset ?? 0 };
          return { ...frame, index };
        }}
        onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
        onContentSizeChange={(_, h) => setContentH(h)}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHead, { height: head }]}>
            <Text
              accessibilityRole="header"
              accessibilityLabel={`${section.title}, ${formatCount(section.data.length)}`}
              maxFontSizeMultiplier={CAP}
              style={[textRole.bodyStrong, styles.ink]}>
              {section.title}
            </Text>
          </View>
        )}
        renderSectionFooter={() => <View style={styles.sectionFoot} />}
        renderItem={({ item }) => <MakeRow drink={item} height={row} measure={measure} onOpen={onOpen} />}
        initialNumToRender={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const MakeRow = React.memo(function MakeRow({
  drink,
  height,
  measure,
  onOpen,
}: {
  drink: Drink;
  height: number;
  measure: number;
  onOpen: (id: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onOpen(drink.id)}
      accessibilityRole="button"
      accessibilityLabel={drink.name}
      accessibilityHint="Opens the drink"
      style={({ pressed }) => [styles.row, { height }, pressed && styles.rowPressed]}>
      <MakeThumb drink={drink} />
      <View style={styles.name}>
        <DrinkName name={drink.name} role={textRole.name} measure={measure} cap={CAP} color={colors.text} />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingLeft: layout.gutter,
    paddingRight: space.xs,
  },
  title: { flex: 1, paddingTop: space.xs },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  jumps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: layout.gutter,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  jumpItem: { flexDirection: 'row' },
  pressedWord: { opacity: 0.5 },
  sectionHead: { justifyContent: 'flex-end', paddingHorizontal: layout.gutter, paddingBottom: space.sm, backgroundColor: colors.bg },
  sectionFoot: { height: SECTION_FOOT },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: layout.gutter },
  rowPressed: { backgroundColor: colors.press },
  name: { flex: 1 },
});
