import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, haptic } from '@/components/ui';
import { colors, fonts, radius, space, type as typeScale } from '@/constants/theme';
import { useAuth } from '@/store/auth';
import { useSocial } from '@/store/social';
import type { UserProfile } from '@/types';

/* ==================================================================== */
/* Shared people list                                                   */
/*                                                                      */
/* Every discovery surface — contacts, Instagram, username search —      */
/* ends at the same place: a list of people and a decision about each.   */
/* Following them one at a time is the actual cost of joining a social   */
/* app, so the list leads with "Follow all" and keeps the per-person     */
/* buttons for the cases where that is too blunt.                        */
/* ==================================================================== */

export interface MatchEntry {
  profile: UserProfile;
  /**
   * Optional second line, e.g. "@sarah.g · mutual". Supplied by the caller
   * because only it knows where the match came from — the server never
   * learns the Instagram handle behind a match, so it cannot say.
   */
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Person row                                                          */
/* ------------------------------------------------------------------ */

export function PersonRow({
  person,
  note,
  following,
  onToggle,
}: {
  person: UserProfile;
  note?: string;
  following: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.row}>
      <Avatar name={person.displayName} accent={person.accent} size={44} />
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>
          {person.displayName}
        </Text>
        <Text style={styles.rowHandle} numberOfLines={1}>
          {note ?? `@${person.username}`}
        </Text>
      </View>
      <Button
        label={following ? 'Following' : 'Follow'}
        variant={following ? 'secondary' : 'primary'}
        onPress={onToggle}
        accessibilityLabel={`${following ? 'Unfollow' : 'Follow'} ${person.displayName}`}
        style={styles.rowBtn}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Match results                                                       */
/* ------------------------------------------------------------------ */

/**
 * A matched set, with one tap to follow all of them.
 *
 * The "Follow all" affordance disappears once nothing is left to follow
 * rather than sitting there disabled: a dead button at the top of a list
 * you have already acted on reads as a bug.
 */
export function MatchResults({
  entries,
  emptyText,
}: {
  entries: MatchEntry[];
  emptyText?: string;
}) {
  const myId = useAuth((s) => s.session?.user.id);
  const following = useSocial((s) => s.following);
  const toggleFollow = useSocial((s) => s.toggleFollow);
  const followMany = useSocial((s) => s.followMany);

  const [busy, setBusy] = useState(false);
  const [justAdded, setJustAdded] = useState<number | null>(null);

  const followingSet = useMemo(() => new Set(following), [following]);
  const pending = useMemo(
    () => entries.filter((e) => !followingSet.has(e.profile.id)),
    [entries, followingSet],
  );

  const followAll = useCallback(async () => {
    if (!myId || pending.length === 0) return;
    haptic.tap();
    setBusy(true);
    try {
      const added = await followMany(
        myId,
        pending.map((e) => e.profile.id),
      );
      setJustAdded(added);
    } finally {
      setBusy(false);
    }
  }, [myId, pending, followMany]);

  if (!myId) return null;

  if (entries.length === 0) {
    return emptyText ? <Text style={styles.hint}>{emptyText}</Text> : null;
  }

  return (
    <View style={styles.results}>
      {pending.length > 1 ? (
        <Button
          label={busy ? 'Following…' : `Follow all ${pending.length}`}
          icon="plus"
          block
          disabled={busy}
          onPress={followAll}
          accessibilityLabel={`Follow all ${pending.length} people in this list`}
        />
      ) : null}

      {justAdded !== null && pending.length === 0 ? (
        <Text style={styles.done}>
          {justAdded === 0
            ? 'You already followed everyone here.'
            : `Followed ${justAdded} ${justAdded === 1 ? 'person' : 'people'}.`}
        </Text>
      ) : null}

      {entries.map((entry) => (
        <PersonRow
          key={entry.profile.id}
          person={entry.profile}
          note={entry.note}
          following={followingSet.has(entry.profile.id)}
          onToggle={() => toggleFollow(myId, entry.profile.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  results: { gap: space.xs },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  rowText: { flex: 1 },
  rowName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
  },
  rowHandle: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textFaint,
  },
  rowBtn: { paddingHorizontal: space.lg, minHeight: 40 },

  hint: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textFaint,
    paddingTop: space.sm,
  },
  done: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    color: colors.wine,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    overflow: 'hidden',
  },
});
