import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { announce, Avatar, Button, Notice } from '@/components/ui';
import { colors, fonts, layout, space, stroke, textRole } from '@/constants/theme';
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
 * Button's row size (`sm`: 36pt drawn, 44pt to the finger). Follow is the
 * primary, the action to take; Following is tonal, a quiet fill with no
 * check, because it is a state rather than a second call to action, and a
 * column of wine-and-check buttons down a list of people you already
 * follow made every row shout. A profile header draws its own Follow, the
 * same two skins at the header's width.
 *
 * It toggles at once, with no confirmation: lists of people are bulk
 * tools. Only the profile header asks before an unfollow.
 *
 * No haptic: buttons do not tick on press (specs/01 §5.0).
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
      variant={following ? 'tonal' : 'primary'}
      onPress={onToggle}
      size="sm"
      accessibilityLabel={`${following ? 'Unfollow' : 'Follow'} ${name}`}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Person row                                                          */
/* ------------------------------------------------------------------ */

/** The avatar in a person row: ListRow's 40pt leading node. */
const ROW_AVATAR = 40;

/**
 * Someone in a list of people. The picture and name open their profile: a
 * match is a stranger until you have seen who it is, and their profile is
 * where Report and Block live for an account that has never posted, which
 * no post menu can reach.
 *
 * By default that is the /user/[id] screen, pushed over whatever list this
 * is in: Find friends, the Instagram and Facebook matches, followers and
 * following, and the welcome step too, because that screen does not gate on
 * the welcome step and so opens the person rather than a second copy of
 * it. `onOpen` replaces the destination; `null` leaves the row as only a
 * Follow decision.
 *
 * ListRow's metrics (64pt with a 40pt avatar, name over handle, a hairline
 * that starts at the text), but not a ListRow: a pressable ListRow is one
 * button to VoiceOver, and this row holds two controls, the person and
 * their Follow, so each stays reachable on its own. Pressing the person
 * fills the row, as a ListRow does; nothing scales.
 */
export function PersonRow({
  person,
  note,
  following,
  onToggle,
  onOpen,
  hideFollow,
  gutter,
  separator,
}: {
  person: UserProfile;
  note?: string;
  following: boolean;
  onToggle: () => void;
  onOpen?: ((id: string) => void) | null;
  /** No Follow button: your own row in someone's followers. */
  hideFollow?: boolean;
  /**
   * Pads the row to the screen gutter, for rows that run edge to edge (on
   * the page, or in a ListGroup). Off inside a card that has its own padding.
   */
  gutter?: boolean;
  /** A hairline under the row, from the text to the right edge. Off on a list's last row. */
  separator?: boolean;
}) {
  const router = useRouter();
  const [pressed, setPressed] = useState(false);
  const open =
    onOpen === null
      ? null
      : (onOpen ?? ((id: string) => router.navigate({ pathname: '/user/[id]', params: { id } })));
  const inset = gutter ? layout.gutter : 0;

  const identity = (
    <>
      <Avatar
        name={person.displayName}
        accent={person.accent}
        size={ROW_AVATAR}
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
    <View
      style={[
        styles.row,
        { paddingHorizontal: inset },
        pressed && styles.rowPressed,
      ]}>
      {open ? (
        <Pressable
          onPress={() => open(person.id)}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${person.displayName}'s profile`}
          style={styles.rowIdentity}>
          {identity}
        </Pressable>
      ) : (
        <View style={styles.rowIdentity}>{identity}</View>
      )}
      {hideFollow ? null : (
        <FollowButton following={following} name={person.displayName} onToggle={onToggle} />
      )}
      {separator ? (
        <View style={[styles.separator, { left: inset + ROW_AVATAR + space.md }]} />
      ) : null}
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
    setBusy(true);
    try {
      const added = await followMany(
        myId,
        pending.map((e) => e.profile.id),
      );
      setOutcome(added ?? 'failed');
      /*
       * Said here as well as by the notice below: a second failure in a row
       * leaves that notice on screen with the same words, and a notice that
       * does not change is not announced again.
       */
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
        <Notice tone="error">{FOLLOW_ALL_FAILED}</Notice>
      ) : null}

      {typeof outcome === 'number' && pending.length === 0 ? (
        <Notice tone="success">
          {outcome === 0
            ? 'You already followed everyone here.'
            : `Followed ${outcome} ${outcome === 1 ? 'person' : 'people'}.`}
        </Notice>
      ) : null}

      {/* The rows sit flush: each draws its own hairline, the last none. */}
      <View>
        {entries.map((entry, i) => (
          <PersonRow
            key={entry.profile.id}
            person={entry.profile}
            note={entry.note}
            following={followingSet.has(entry.profile.id)}
            onToggle={() => toggleFollow(myId, entry.profile.id)}
            onOpen={onOpenPerson}
            separator={i < entries.length - 1}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  results: { gap: space.sm },

  /* ListRow's metrics: 64pt with a 40pt avatar, 12pt between the parts. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: layout.rowTall,
    paddingVertical: space.md,
  },
  rowPressed: { backgroundColor: colors.bgSunk },
  rowIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: layout.hit,
  },
  rowText: { flex: 1 },
  rowName: { ...textRole.rowTitle, fontFamily: fonts.bodySemiBold, color: colors.text },
  // 13pt secondary lines: textMuted, which holds 4.5:1 where textFaint cannot.
  rowHandle: { ...textRole.rowSubtitle, color: colors.textMuted },
  // From the start of the name to the row's right edge, as iOS's own lists draw it.
  separator: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    height: stroke.hair,
    backgroundColor: colors.line,
  },
  hint: {
    ...textRole.helper,
    color: colors.textMuted,
    paddingTop: space.sm,
  },
});
