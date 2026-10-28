import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { TicketCard } from '@/components/details/PressMarks';
import { Icon } from '@/components/icons';
import { dayWord, differentDrinks, lastMoment, ordinal, peopleCount } from '@/components/tournaments/TournamentRow';
import { Avatar } from '@/components/ui';
import { colors, fonts, space, tabular, textRole } from '@/constants/theme';
import type { TournamentBoard, TournamentSummary } from '@/types';

/* ==================================================================== */
/* One running tournament, as a card on the Tournaments tab             */
/* (specs/v4.7/spec.md 2.3)                                             */
/*                                                                      */
/* Its name, when it ends and how many are in it, and the top three.    */
/* The cards are the tab's only panels (the wash, 8pt corners, no       */
/* edge); everything else there sits on the page.                       */
/*                                                                      */
/* A TICKET STUB (v4.9, specs/v4.9/details/spec.md C.6). Jan's "a       */
/* torn-ticket edge on cards", built as the press would cut it, not as  */
/* torn paper (a ragged edge reads as craft): the card's own wash drawn */
/* as one silhouette with a half-round die-cut notch in each side,      */
/* centred in the 10pt gap between the head and the standings, and a    */
/* perforation from notch to notch in `rule`, all greys (PressMarks'    */
/* TicketCard). The card measures its head, so Larger Text moves the    */
/* notches with the gap; until it has measured it is the plain wash     */
/* card it was, so no frame is unfilled. It is still the one button,    */
/* pressed it still goes `press`, and nothing red sits on it: the tear  */
/* line is ornament, never a place to tear or a state.                  */
/*                                                                      */
/* ALWAYS ROOM FOR THREE LINES. 16 + name 24 + meta 18 + 10 + three     */
/* 26pt lines + 12 = 158, whether or not the standings have arrived, so */
/* a card never grows under your thumb when its board answers, and two  */
/* side by side are always the same height. Before the board arrives,   */
/* or when it fails, the three lines are empty space: no spinner, no    */
/* skeleton, and the card still opens the page.                         */
/*                                                                      */
/* RANKS ARE THE SERVER'S. A tournament breaks a tie by who got there   */
/* first, so ranks never repeat on a card (1, 2, 3 even at 4 entries    */
/* each), unlike the Friends board under it, where a tie is a tie. A    */
/* member with nothing counted yet shows no figure and "No entries yet" */
/* (Leaderboard's rule: at nought every rank is only the tie-break).    */
/* The time left is a day, never a countdown clock; the only figures    */
/* are entries (App Review 1.4.3).                                      */
/* ==================================================================== */

/** One person as a card line needs them: from the Friends board's rows or the social store. */
export type CardPerson = { username: string; displayName: string; accent: string; avatarPath?: string | null };

/** The card's height at text scale 1; a minimum, so Larger Text grows it rather than clipping. */
export const CARD_HEIGHT = 158;
/** A standings line, so three always fit and an empty one holds its place. */
const LINE = 26;
const FACE = 20;
/** The rank column, right-aligned, so a two-digit rank (blocked members leave gaps) still lines up. */
const RANK_COL = 14;
const CHEVRON = 16;
const TOP = 3;

/** A member whose profile is not in hand yet: named plainly, never left out. */
const SOMEONE = 'Someone';

export const TournamentCard = React.memo(function TournamentCard({
  tournament: t,
  board,
  myId,
  personOf,
  onOpen,
  style,
}: {
  tournament: TournamentSummary;
  /** The tournaments store's last answer for it (loadBoard); absent until then. */
  board: TournamentBoard | undefined;
  myId: string;
  personOf: (id: string) => CardPerson | undefined;
  onOpen: (id: string) => void;
  /** Its width: the full column for one card, 300 for a row of them. */
  style?: ViewStyle;
}) {
  const meta = `Ends ${dayWord(lastMoment(t.endsAt))} · ${peopleCount(t.members)}`;
  const top = (board?.standings ?? []).slice(0, TOP);

  /*
   * One button to VoiceOver, everything on it said once in reading order:
   * "Negroni week. Ends Sunday, 5 people. 1st ana, 6 entries. 2nd you,
   * 4 entries." The meta's dot is a comma when spoken.
   */
  const spokenLines = top.map((s) => {
    const who = s.userId === myId ? 'you' : (personOf(s.userId)?.username ?? SOMEONE);
    return s.distinct > 0 ? `${ordinal(s.rank)} ${who}, ${differentDrinks(s.distinct)}` : `${who}, no entries yet`;
  });
  const spoken = [t.name, meta.replace(' · ', ', '), ...spokenLines].map((x) => `${x}.`).join(' ');

  return (
    <Pressable
      onPress={() => onOpen(t.id)}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Opens the tournament"
      style={style}>
      {({ pressed }) => (
        <TicketCard
          pressed={pressed}
          style={styles.card}
          head={
            <>
              <View style={styles.nameRow}>
                {/* Inter, never Playfair: a tournament's name is not a drink's. */}
                <Text numberOfLines={1} style={styles.name}>
                  {t.name}
                </Text>
                <Icon name="chevronRight" size={CHEVRON} color={colors.textMuted} />
              </View>
              <Text numberOfLines={1} style={styles.meta}>
                {meta}
              </Text>
            </>
          }>
          {/* Under the tear line; the 10 above it is the ticket's own gap, where the notches bite. */}
          <View>
            {Array.from({ length: TOP }, (_, i) => {
              const s = top[i];
              if (!s) return <View key={`empty-${i}`} style={styles.line} />;
              const mine = s.userId === myId;
              const person = personOf(s.userId);
              const ranked = s.distinct > 0;
              return (
                <View key={s.userId} style={styles.line}>
                  <Text style={styles.rank} maxFontSizeMultiplier={1.3}>
                    {ranked ? s.rank : ''}
                  </Text>
                  <Avatar
                    name={person?.displayName ?? '?'}
                    accent={person?.accent ?? colors.text}
                    size={FACE}
                    avatarPath={person?.avatarPath}
                  />
                  <Text numberOfLines={1} style={styles.who}>
                    {person?.username ?? SOMEONE}
                    {mine ? <Text style={styles.you}> (you)</Text> : null}
                  </Text>
                  <Text style={styles.entries}>{ranked ? differentDrinks(s.distinct) : 'No entries yet'}</Text>
                </View>
              );
            })}
          </View>
        </TicketCard>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  /*
   * TicketCard pads 16 round the content and 12 under the last line, with
   * its 10 between the head and the standings (spec 2.3's 158), and answers
   * a press with its fill, never a scale.
   */
  card: { minHeight: CARD_HEIGHT },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { ...textRole.bodyStrong, flex: 1, color: colors.text },
  meta: { ...textRole.small, color: colors.textMuted },
  line: { minHeight: LINE, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: {
    ...textRole.small,
    ...tabular,
    fontFamily: fonts.bodySemiBold,
    minWidth: RANK_COL,
    textAlign: 'right',
    color: colors.text,
  },
  who: { ...textRole.small, flex: 1, color: colors.text },
  you: { color: colors.textMuted },
  entries: { ...textRole.small, ...tabular, color: colors.textMuted, textAlign: 'right' },
});
