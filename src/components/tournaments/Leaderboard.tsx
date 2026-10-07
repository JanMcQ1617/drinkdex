import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { differentDrinks } from '@/components/tournaments/TournamentRow';
import { Avatar, ListGroup } from '@/components/ui';
import { colors, layout, space, stroke, tabular, textRole } from '@/constants/theme';
import type { Standing, TournamentState, UserProfile } from '@/types';

/* ==================================================================== */
/* A tournament's standings, and the people still invited               */
/* (spec v3.1 §11.3)                                                    */
/*                                                                      */
/* One row per accepted member, in the server's rank order: rank,       */
/* face, username, "{k} different drinks". The only figures on a         */
/* tournament's page are these: no meter, no progress toward a goal or   */
/* the daily cap (App Review 1.4.3).                                     */
/*                                                                      */
/* Your row is said three ways, not by colour alone: the wine wash,      */
/* "(you)" after your name, and ", you" in its spoken label. The winner  */
/* is the trophy in place of "1" and ", winner".                         */
/* ==================================================================== */

/** The rank column, so every face and name starts on one line down the list. */
const RANK_COL = 28;
const FACE = 32;
/** Where a row's name starts: the group's 16pt inset, the rank, the face and the gaps between. */
const TEXT_INSET = space.lg + RANK_COL + space.md + FACE + space.md;

/** A member whose profile is not in hand (a failed profile read): named plainly, never left out. */
const SOMEONE = 'Someone';

function nameOf(people: Record<string, UserProfile>, id: string): string {
  const p = Object.prototype.hasOwnProperty.call(people, id) ? people[id] : undefined;
  return p ? `@${p.username}` : SOMEONE;
}

function profileOf(people: Record<string, UserProfile>, id: string): UserProfile | undefined {
  return Object.prototype.hasOwnProperty.call(people, id) ? people[id] : undefined;
}

/**
 * The standings, in a ListGroup. Before the start everyone is at nought,
 * so the rows are ordered by name and carry no rank (a rank there would
 * only be the server's tie-break). While it is on, a member with nothing
 * counted yet shows no rank either, for the same reason.
 *
 * Each row opens that person's profile (yours opens your own tab).
 */
export function Leaderboard({
  standings,
  people,
  myId,
  state,
  winnerId,
  onOpenPerson,
}: {
  standings: readonly Standing[];
  people: Record<string, UserProfile>;
  myId: string;
  state: TournamentState;
  /** Set only once it has finished and someone won. */
  winnerId: string | null;
  onOpenPerson: (id: string) => void;
}) {
  const upcoming = state === 'upcoming';
  const rows = upcoming
    ? [...standings].sort((a, b) =>
        nameOf(people, a.userId).localeCompare(nameOf(people, b.userId), undefined, {
          sensitivity: 'base',
        }),
      )
    : standings;
  if (rows.length === 0) return null;

  return (
    <ListGroup>
      {rows.map((s, i) => {
        const mine = s.userId === myId;
        const won = state === 'finished' && s.userId === winnerId;
        const ranked = !upcoming && s.distinct > 0;
        const distinct = upcoming ? 0 : s.distinct;
        const name = nameOf(people, s.userId);
        const person = profileOf(people, s.userId);
        const spoken = [
          ranked ? String(s.rank) : null,
          name,
          differentDrinks(distinct),
          mine ? 'you' : null,
          won ? 'winner' : null,
        ]
          .filter(Boolean)
          .join(', ');
        return (
          <Pressable
            key={s.userId}
            onPress={() => onOpenPerson(s.userId)}
            accessibilityRole="button"
            accessibilityLabel={spoken}
            accessibilityHint={mine ? 'Opens your profile' : 'Opens their profile'}
            style={({ pressed }) => [styles.row, mine && styles.mine, pressed && styles.pressed]}>
            <View style={styles.rank}>
              {won ? (
                <Icon name="trophy" size={22} color={colors.wine} />
              ) : ranked ? (
                <Text style={styles.rankText} maxFontSizeMultiplier={1.3}>
                  {s.rank}
                </Text>
              ) : null}
            </View>
            <Avatar
              name={person?.displayName ?? '?'}
              accent={person?.accent ?? colors.wine}
              size={FACE}
              avatarPath={person?.avatarPath}
            />
            <Text style={styles.username}>
              {name}
              {mine ? <Text style={styles.you}> (you)</Text> : null}
            </Text>
            <Text style={styles.count}>{differentDrinks(distinct)}</Text>
            {i < rows.length - 1 ? <View style={styles.separator} /> : null}
          </Pressable>
        );
      })}
    </ListGroup>
  );
}

/**
 * The people invited who have not answered yet, for the host and the
 * members: a face, the username and "Hasn't joined yet". Static rows:
 * there is nothing to do about an invitation but wait for it.
 */
export function PendingInvites({
  ids,
  people,
}: {
  ids: readonly string[];
  people: Record<string, UserProfile>;
}) {
  if (ids.length === 0) return null;
  return (
    <ListGroup>
      {ids.map((id, i) => {
        const person = profileOf(people, id);
        const name = nameOf(people, id);
        return (
          <View
            key={id}
            accessible
            accessibilityLabel={`${name}, hasn't joined yet`}
            style={[styles.row, styles.pendingRow]}>
            <Avatar
              name={person?.displayName ?? '?'}
              accent={person?.accent ?? colors.wine}
              size={FACE}
              avatarPath={person?.avatarPath}
            />
            <View style={styles.pendingText}>
              <Text style={styles.pendingName}>{name}</Text>
              <Text style={styles.pendingNote}>Hasn&apos;t joined yet</Text>
            </View>
            {i < ids.length - 1 ? <View style={[styles.separator, styles.pendingSeparator]} /> : null}
          </View>
        );
      })}
    </ListGroup>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  /* text 12.78:1 and textMuted 5.10:1 on the wash (check-contrast). */
  mine: { backgroundColor: colors.wineWash },
  pressed: { backgroundColor: colors.bgSunk },
  /* A minimum, not a width: a two-digit rank at a large text size widens its row rather than wrapping. */
  rank: { minWidth: RANK_COL, alignItems: 'center', justifyContent: 'center' },
  rankText: { ...textRole.count, color: colors.textMuted, textAlign: 'center' },
  username: { ...textRole.username, flex: 1, color: colors.text },
  you: { fontFamily: textRole.prose.fontFamily, color: colors.textMuted },
  count: { ...textRole.labelValue, ...tabular, color: colors.text, textAlign: 'right' },
  /* From the name's left edge to the row's right edge, as a ListRow's rule runs. */
  separator: {
    position: 'absolute',
    left: TEXT_INSET,
    right: 0,
    bottom: 0,
    height: stroke.hair,
    backgroundColor: colors.line,
  },

  pendingRow: { minHeight: layout.rowTall - space.sm },
  pendingText: { flex: 1 },
  pendingName: { ...textRole.username, color: colors.text },
  pendingNote: { ...textRole.helper, color: colors.textMuted },
  /* No rank column here: the rule starts after the face. */
  pendingSeparator: { left: space.lg + FACE + space.md },
});
