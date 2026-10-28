import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PenCrown } from '@/components/details/DoodleMarks';
import { Icon } from '@/components/icons';
import { differentDrinks } from '@/components/tournaments/TournamentRow';
import { Avatar } from '@/components/ui';
import { colors, layout, radius, space, tabular, textRole } from '@/constants/theme';
import type { Standing, TournamentState, UserProfile } from '@/types';

/* ==================================================================== */
/* A tournament's standings, and the people still invited               */
/* (spec v3.1 §11.3)                                                    */
/*                                                                      */
/* One row per accepted member, in the server's rank order: rank,       */
/* face, username, "{k} entries". The only figures on a                  */
/* tournament's page are these: no meter, no progress toward a goal or   */
/* the daily cap (App Review 1.4.3).                                     */
/*                                                                      */
/* Your row is said three ways, not by colour alone: the wash under it, */
/* "(you)" after your name, and ", you" in its spoken label. The winner  */
/* is the trophy in place of "1" and ", winner".                         */
/*                                                                      */
/* Rows on the page, 56 apart and set apart by space, not rules. Their  */
/* content sits on the gutter; the row reaches 8pt past it each side,   */
/* so your row's wash and a press have a margin round the words.         */
/*                                                                      */
/* THE CROWN (v4.9, specs/v4.9/details/spec.md C.7). While it is on,    */
/* the leader's face wears the pen's crown, as the Tournaments tab's    */
/* does, at 0.8 for the 32pt face: off its top right, 0.5 above it,     */
/* anchored to the Avatar's own box. It only repeats the "1" beside it, */
/* which is still drawn and still spoken; a row says what it said       */
/* before. Nobody at nought is crowned (they have no rank), nor anyone  */
/* before the start, and once it has finished the trophy stands in the  */
/* "1"'s place instead, so the two never meet.                          */
/* ==================================================================== */

/** The rank column, so every face and name starts on one line down the list. */
const RANK_COL = 28;
const FACE = 32;
/** How far a row reaches past the column each side, for its wash. */
const BLEED = space.sm;

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
 * The standings, on the page. Before the start everyone is at nought,
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
    <View>
      {rows.map((s) => {
        const mine = s.userId === myId;
        const won = state === 'finished' && s.userId === winnerId;
        const ranked = !upcoming && s.distinct > 0;
        // The server breaks ties by who got there first, so one row holds rank 1.
        const crowned = state === 'live' && ranked && s.rank === 1;
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
                <Icon name="trophy" size={22} color={colors.text} />
              ) : ranked ? (
                <Text style={styles.rankText} maxFontSizeMultiplier={1.3}>
                  {s.rank}
                </Text>
              ) : null}
            </View>
            {/* The face in a plain View of its own box: the crown's anchor, whatever the rank column does. */}
            <View>
              <Avatar
                name={person?.displayName ?? '?'}
                accent={person?.accent ?? colors.text}
                size={FACE}
                avatarPath={person?.avatarPath}
              />
              {crowned ? <PenCrown face={FACE} /> : null}
            </View>
            <Text style={styles.username}>
              {name}
              {mine ? <Text style={styles.you}> (you)</Text> : null}
            </Text>
            <Text style={styles.count}>{differentDrinks(distinct)}</Text>
          </Pressable>
        );
      })}
    </View>
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
    <View>
      {ids.map((id) => {
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
              accent={person?.accent ?? colors.text}
              size={FACE}
              avatarPath={person?.avatarPath}
            />
            <View style={styles.pendingText}>
              <Text style={styles.pendingName}>{name}</Text>
              <Text style={styles.pendingNote}>Hasn&apos;t joined yet</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: -BLEED,
    paddingHorizontal: BLEED,
    paddingVertical: space.sm,
    borderRadius: radius.control,
  },
  /* Ink 18.16:1 and muted 6.13:1 on the wash (check-contrast). */
  mine: { backgroundColor: colors.bgSunk },
  pressed: { backgroundColor: colors.press },
  /* A minimum, not a width: a two-digit rank at a large text size widens its row rather than wrapping. */
  rank: { minWidth: RANK_COL, alignItems: 'center', justifyContent: 'center' },
  rankText: { ...textRole.count, color: colors.textMuted, textAlign: 'center' },
  username: { ...textRole.bodyStrong, flex: 1, color: colors.text },
  you: { fontFamily: textRole.body.fontFamily, color: colors.textMuted },
  count: { ...textRole.body, ...tabular, color: colors.text, textAlign: 'right' },

  pendingRow: { minHeight: layout.rowTall - space.sm },
  pendingText: { flex: 1 },
  pendingName: { ...textRole.bodyStrong, color: colors.text },
  pendingNote: { ...textRole.small, color: colors.textMuted },
});
