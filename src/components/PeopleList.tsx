import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { announce, Avatar, Button, Notice } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
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
/*                                                                      */
/* v4: the likers sheet's rows (layout spec 5.4, white-min/post.png),   */
/* on the page: a 44pt face, the name, the key at the far gutter, 64pt  */
/* apart and separated by space, not hairlines. Follow is ink, Following */
/* the wash key, both one width, so a tap never changes the key's size. */
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

/*
 * The two labels a key can toggle between, measured in Archivo SemiBold
 * 17 (the key's label since v4.10): "Following" 75.9pt, "Follow back"
 * 93.1pt, each under the width kept for it. With the sm
 * key's 14pt padding and 1pt edge each side, a key 30pt wider than its
 * longer label holds both.
 */
const FOLLOWING_LABEL_W = 77;
const FOLLOW_BACK_LABEL_W = 95;
const KEY_CHROME_W = 30;
/** The likers sheet's key (layout spec 5.4). */
const FOLLOW_KEY_MIN_W = 116;

/**
 * The in-row Follow / Following toggle, the one every list of people uses
 * (Activity's new followers too).
 *
 * Button's row size (`sm`: 36pt drawn, 44pt to the finger), 116 wide at
 * least (layout spec 5.4), and as wide as the longer of the two labels it
 * toggles between at the current text size, so Follow and Following (or
 * Follow back and Following) are the same key and the row never moves
 * under the tap:
 *
 *   Follow       primary, ink: the offer this row exists to make
 *   Follow back  primary too; someone already follows you (`back`)
 *   Following    the wash key: a state rather than a call to action
 *
 * A profile header draws its own Follow at the header's width.
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
  back,
}: {
  following: boolean;
  /** Who, for the spoken label: "Follow Maya Ortiz". */
  name: string;
  onToggle: () => void;
  /** They already follow you: not following them is "Follow back". */
  back?: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const followBack = !following && !!back;
  // Sized for the longer label of the pair, so the tap that swaps them leaves the key as it was.
  const minWidth = Math.max(
    FOLLOW_KEY_MIN_W,
    Math.ceil((back ? FOLLOW_BACK_LABEL_W : FOLLOWING_LABEL_W) * fontScale) + KEY_CHROME_W,
  );
  return (
    <Button
      label={following ? 'Following' : followBack ? 'Follow back' : 'Follow'}
      variant={following ? 'secondary' : 'primary'}
      onPress={onToggle}
      size="sm"
      accessibilityLabel={
        following ? `Unfollow ${name}` : followBack ? `Follow ${name} back` : `Follow ${name}`
      }
      style={{ minWidth }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Person row                                                          */
/* ------------------------------------------------------------------ */

/** The face in a person row: the likers sheet's 44 (layout spec 5.4). */
const ROW_AVATAR = 44;
/** Face to name: the name starts 16 past the face, at x 84. */
const ROW_GAP = 16;

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
 * decision (Blocked accounts: a blocked profile cannot be opened).
 *
 * Not a ListRow: a pressable ListRow is one button to VoiceOver, and this
 * row holds two controls, the person and their key, so each stays
 * reachable on its own. Pressing the person fills the row; nothing scales.
 * The handle (or the caller's note, "@sarah.g · mutual") is the quiet line
 * under the name: in a list of strangers it is how you tell two Marias
 * apart. The likers sheet, a list of people you have already met, drops it.
 */
export function PersonRow({
  person,
  note,
  following,
  onToggle,
  onOpen,
  hideFollow,
  gutter,
  followsYou,
  trailing,
}: {
  person: UserProfile;
  note?: string;
  following: boolean;
  onToggle: () => void;
  /** They follow you (a followers list): their Follow reads "Follow back". */
  followsYou?: boolean;
  onOpen?: ((id: string) => void) | null;
  /** No Follow key: your own row in someone's followers. */
  hideFollow?: boolean;
  /**
   * Pads the row to the screen gutter, for a list that runs edge to edge
   * so its pressed fill does too. Off inside a column already in the gutters.
   */
  gutter?: boolean;
  /** Another key in Follow's place (Blocked accounts' Unblock). */
  trailing?: ReactNode;
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
        {/*
          No line limit, as in the likers sheet: at Larger Text a name wraps
          at a space rather than losing its end. The key keeps its place
          either way, since the column beside it is what grows.
        */}
        <Text style={[textRole.body, styles.ink]}>{person.displayName}</Text>
        <Text style={[textRole.small, styles.muted]}>{note ?? `@${person.username}`}</Text>
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
      {trailing ??
        (hideFollow ? null : (
          <FollowButton
            following={following}
            name={person.displayName}
            onToggle={onToggle}
            back={followsYou}
          />
        ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Match results                                                       */
/* ------------------------------------------------------------------ */

const FOLLOW_ALL_FAILED = 'Could not follow them. Check your connection and try again.';

/** What a Follow all did: "Followed 4 people.", or that there was no one left to follow. */
function followedLine(added: number): string {
  return added === 0
    ? 'You already followed everyone here.'
    : `Followed ${added} ${added === 1 ? 'person' : 'people'}.`;
}

/**
 * A matched set, with one tap to follow all of them.
 *
 * The "Follow all" key goes once nothing is left to follow rather than
 * sitting there disabled: a dead button at the top of a list you have
 * already acted on reads as a bug. A line saying so takes its slot.
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

  /*
   * NOTHING MOVES UNDER THE FINGER. Whether this list has a Follow all
   * slot is decided once, when the list first appears (keyed by who is in
   * it), and the slot then keeps its height while it is the same list.
   * Decided on every render, following the second-to-last person by their
   * own key took the key away and pulled every row up 60pt, under a finger
   * on its way to the next Follow; unfollowing one put it back and pushed
   * them all down. A new list (a new search, a re-check) decides afresh,
   * and forgets the last list's outcome.
   */
  const listKey = entries.map((e) => e.profile.id).join('|');
  const [slot, setSlot] = useState<{ list: string; shown: boolean } | null>(null);
  if (slot?.list !== listKey) {
    setSlot({ list: listKey, shown: pending.length > 1 });
    setOutcome(null);
  }
  const showSlot = slot?.list === listKey ? slot.shown : pending.length > 1;

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
       * does not change is not announced again. The success line is said
       * too: on iOS it replaces the key without a word otherwise.
       */
      announce(added === null ? FOLLOW_ALL_FAILED : followedLine(added));
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
      {showSlot ? (
        <View style={styles.slot}>
          {pending.length > 0 ? (
            <Button
              label={
                busy
                  ? 'Following…'
                  : pending.length === 1
                    ? 'Follow the last one'
                    : `Follow all ${pending.length}`
              }
              block
              loading={busy}
              onPress={followAll}
              accessibilityLabel={
                pending.length === 1
                  ? 'Follow the last person in this list'
                  : `Follow all ${pending.length} people in this list`
              }
            />
          ) : typeof outcome === 'number' ? (
            <Notice tone="success">{followedLine(outcome)}</Notice>
          ) : (
            <Text style={styles.slotLine}>You follow everyone here.</Text>
          )}
        </View>
      ) : null}

      {/*
        A failed "Follow all" says so under the button it leaves in place.
        It used to put the list back without a word, which looked the same
        as a tap that had not registered.
      */}
      {outcome === 'failed' && pending.length > 0 ? (
        <Notice tone="error">{FOLLOW_ALL_FAILED}</Notice>
      ) : null}

      {/* The rows sit flush at a 64pt pitch: space parts them, no hairlines. */}
      <View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  results: { gap: space.sm },
  // The block key's height, held by whatever the slot shows (see MatchResults).
  slot: { minHeight: layout.control, justifyContent: 'center' },
  slotLine: { ...textRole.small, color: colors.textMuted },

  /* 64pt rows (layout spec 5.4), the key at the far gutter. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: layout.rowTall,
    paddingVertical: space.sm,
  },
  rowPressed: { backgroundColor: colors.press },
  rowIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    minHeight: layout.hit,
  },
  rowText: { flex: 1 },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  hint: {
    ...textRole.small,
    color: colors.textMuted,
    paddingTop: space.sm,
  },
});
