import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { announce, Avatar, Button, PressableScale } from '@/components/ui';
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
  /**
   * False keeps this entry out of "Follow all" while leaving its own Follow
   * button in place — for a match the caller is not sure of, such as a
   * handle more than one account claims.
   */
  bulk?: boolean;
}

/* ------------------------------------------------------------------ */
/* Follow button                                                       */
/* ------------------------------------------------------------------ */

/**
 * The in-row Follow / Following toggle, the one every list of people uses.
 *
 * There were two, drawn differently for the same decision: 40pt with no
 * state icon here — under the 44pt touch minimum — and 52pt with a check on
 * the profile's account list. This is Button's row size (`sm`, 44pt), with
 * a check once followed. A profile header's lone Follow stays the full-size
 * Button, since there it is the screen's main action rather than one of
 * fifty.
 *
 * No extra haptic: Button's press already ticks.
 */
export function FollowButton({
  following,
  name,
  onToggle,
}: {
  following: boolean;
  /** Who, for the spoken label: "Follow Maya Ortiz". */
  name: string;
  onToggle: () => void;
}) {
  return (
    <Button
      label={following ? 'Following' : 'Follow'}
      variant={following ? 'secondary' : 'primary'}
      icon={following ? 'check' : undefined}
      onPress={onToggle}
      size="sm"
      accessibilityLabel={`${following ? 'Unfollow' : 'Follow'} ${name}`}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Person row                                                          */
/* ------------------------------------------------------------------ */

/**
 * Someone in a matched list. The picture and name open their profile, as
 * the profile's own accounts list does: a match is a stranger until you
 * have seen who it is, and their profile is where Report and Block live
 * for an account that has never posted, which no post menu can reach.
 *
 * By default that is the /user/[id] screen, pushed over whatever list this
 * is in: Find friends, the Instagram and Facebook matches, and the welcome
 * step too, because that screen does not gate on the welcome step and so
 * opens the person rather than a second copy of it. `onOpen` replaces the
 * destination; `null` leaves the row as only a Follow decision.
 */
export function PersonRow({
  person,
  note,
  following,
  onToggle,
  onOpen,
}: {
  person: UserProfile;
  note?: string;
  following: boolean;
  onToggle: () => void;
  onOpen?: ((id: string) => void) | null;
}) {
  const router = useRouter();
  const open =
    onOpen === null
      ? null
      : (onOpen ?? ((id: string) => router.push({ pathname: '/user/[id]', params: { id } })));

  const identity = (
    <>
      <Avatar
        name={person.displayName}
        accent={person.accent}
        size={44}
        avatarPath={person.avatarPath}
      />
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>
          {person.displayName}
        </Text>
        <Text style={styles.rowHandle} numberOfLines={1}>
          {note ?? `@${person.username}`}
        </Text>
      </View>
    </>
  );

  return (
    <View style={styles.row}>
      {open ? (
        <PressableScale
          onPress={() => open(person.id)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${person.displayName}'s profile`}
          style={styles.rowIdentity}>
          {identity}
        </PressableScale>
      ) : (
        <View style={styles.rowIdentity}>{identity}</View>
      )}
      <FollowButton following={following} name={person.displayName} onToggle={onToggle} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Match results                                                       */
/* ------------------------------------------------------------------ */

const FOLLOW_ALL_FAILED = 'Could not follow them. Check your connection and try again.';

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
  onOpenPerson,
}: {
  entries: MatchEntry[];
  emptyText?: string;
  /** Where a row's name opens. Left off, their profile; `null`, nowhere (see PersonRow). */
  onOpenPerson?: ((id: string) => void) | null;
}) {
  const myId = useAuth((s) => s.session?.user.id);
  const following = useSocial((s) => s.following);
  const toggleFollow = useSocial((s) => s.toggleFollow);
  const followMany = useSocial((s) => s.followMany);

  const [busy, setBusy] = useState(false);
  /** How many the last "Follow all" added, or 'failed' when it did not go through. */
  const [outcome, setOutcome] = useState<number | 'failed' | null>(null);

  const followingSet = useMemo(() => new Set(following), [following]);
  const pending = useMemo(
    () => entries.filter((e) => e.bulk !== false && !followingSet.has(e.profile.id)),
    [entries, followingSet],
  );

  const followAll = useCallback(async () => {
    if (!myId || pending.length === 0) return;
    // No haptic here: the Button's own press already ticked.
    setBusy(true);
    try {
      const added = await followMany(
        myId,
        pending.map((e) => e.profile.id),
      );
      setOutcome(added ?? 'failed');
      // Spoken on iOS, where live regions do nothing; the line below is Android's.
      if (added === null) announce(FOLLOW_ALL_FAILED);
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
          loading={busy}
          onPress={followAll}
          accessibilityLabel={`Follow all ${pending.length} people in this list`}
        />
      ) : null}

      {/*
        A failed "Follow all" says so under the button it leaves in place.
        It used to put the list back without a word, which looked the same
        as a tap that had not registered.
      */}
      {outcome === 'failed' && pending.length > 0 ? (
        <Text style={styles.hint} accessibilityLiveRegion="polite">
          {FOLLOW_ALL_FAILED}
        </Text>
      ) : null}

      {typeof outcome === 'number' && pending.length === 0 ? (
        <Text style={styles.done}>
          {outcome === 0
            ? 'You already followed everyone here.'
            : `Followed ${outcome} ${outcome === 1 ? 'person' : 'people'}.`}
        </Text>
      ) : null}

      {entries.map((entry) => (
        <PersonRow
          key={entry.profile.id}
          person={entry.profile}
          note={entry.note}
          following={followingSet.has(entry.profile.id)}
          onToggle={() => toggleFollow(myId, entry.profile.id)}
          onOpen={onOpenPerson}
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
  // The same 44pt identity block as the profile's accounts rows.
  rowIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 44,
  },
  rowText: { flex: 1 },
  rowName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
  },
  // 13pt secondary lines: textMuted, which holds 4.5:1 where textFaint cannot.
  rowHandle: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
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
