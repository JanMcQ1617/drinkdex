import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrassBezel, CountSeparator } from '@/components/brass';
import { Avatar, Button } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import type { UserProfile } from '@/types';

/* ==================================================================== */
/* The head of a profile                                                */
/*                                                                      */
/* One layout for your profile and anyone else's, so the two read as one */
/* screen: the picture in its brass bezel beside three counts, then the  */
/* name, the bio and a row of actions. The handle is not repeated here;  */
/* it is the screen's title, in the top bar.                             */
/*                                                                      */
/* v3.3 Brass (screen 5): the avatar sits in the D14 bezel (80 in 92)    */
/* and brass hairlines (D15) part the counts, each centred in its        */
/* column. The name moved under that row, as the mock sets it, and got   */
/* the full width with it: it wraps now, where beside the counts it was  */
/* one line cut short.                                                   */
/*                                                                      */
/* Posts, followers, following. The Dex count is not a fourth figure:   */
/* it is the walnut plaque under the buttons (ProfileView), with its     */
/* gauge and rank, so it is never confused with the posts figure here.   */
/* ==================================================================== */

/** The avatar inside the bezel: the mock's 80, so the bezel is 92, 6pt more than the old 86 face. */
const AVATAR = 80;
/** Between the bezel and the counts: the 18 the old face had, so the three columns keep their room. */
const IDENTITY_GAP = 18;
/** The counts sit in fixed thirds beside the bezel; past this they shrink to fit rather than break a word. */
const COUNT_CAP = 1.4;
const COUNT_MIN_SCALE = 0.7;

export type ProfileActions =
  | {
      kind: 'own';
      onEdit: () => void;
      onShare: () => void;
    }
  | {
      kind: 'peer';
      /** You follow them (the social store's optimistic list). */
      following: boolean;
      /** They follow you: the button offers "Follow back". */
      followsMe: boolean;
      onFollow: () => void;
      /** Asks first; see ProfileView. */
      onUnfollow: () => void;
    };

export function ProfileHeader({
  person,
  posts,
  followers,
  following,
  onOpenList,
  actions,
}: {
  person: UserProfile;
  /** `null` is a number not known yet: a dash, never a confident 0. */
  posts: number | null;
  followers: number | null;
  following: number | null;
  onOpenList: (list: 'followers' | 'following') => void;
  actions: ProfileActions;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.identity}>
        {/*
          Hidden from VoiceOver by Avatar itself, and the bezel is
          decorative: the name under them speaks. Own and peer alike; the
          feed's and the likers' faces stay plain.
        */}
        <BrassBezel size={AVATAR}>
          <Avatar
            name={person.displayName}
            accent={person.accent}
            size={AVATAR}
            avatarPath={person.avatarPath}
          />
        </BrassBezel>
        <View style={styles.counts}>
          <Count value={posts} one="post" many="posts" />
          <CountSeparator />
          <Count
            value={followers}
            one="follower"
            many="followers"
            onPress={() => onOpenList('followers')}
          />
          <CountSeparator />
          <Count
            value={following}
            one="following"
            many="following"
            onPress={() => onOpenList('following')}
          />
        </View>
      </View>

      {/* No line limit: a long name wraps at a space, it is never cut. */}
      <Text style={styles.name}>{person.displayName}</Text>
      {person.bio ? <Text style={styles.bio}>{person.bio}</Text> : null}

      <View style={styles.actions}>
        {actions.kind === 'own' ? (
          <>
            {/*
              Two outlined buttons sharing the row: white with a 1pt ink
              edge, because neither is the screen's call to action, and the
              one wine thing on this screen is not here (the tab bar's post
              button is). The tonal fill they had was bone on cream, a
              button you had to look for. No Find friends square beside them
              (v3.1): it is in Settings, on Home's stories rail and in every
              empty state that offers it.
            */}
            <Button
              label="Edit profile"
              variant="secondary"
              size="sm"
              onPress={actions.onEdit}
              style={styles.grow}
            />
            <Button
              label="Share profile"
              variant="secondary"
              size="sm"
              onPress={actions.onShare}
              style={styles.grow}
            />
          </>
        ) : actions.following ? (
          /*
           * Tonal, no check: following is a state, not an action to take.
           * Pressing it asks before unfollowing, because an unfollow from
           * here is the costly mistake; the list rows still toggle straight
           * away, as bulk tools do.
           */
          <Button
            label="Following"
            variant="tonal"
            size="sm"
            onPress={actions.onUnfollow}
            accessibilityLabel={`Unfollow ${person.displayName}`}
            accessibilityHint="Asks before unfollowing"
            style={styles.grow}
          />
        ) : (
          <Button
            label={actions.followsMe ? 'Follow back' : 'Follow'}
            variant="primary"
            size="sm"
            onPress={actions.onFollow}
            // "back" is spoken too: that they follow you is said by the label alone.
            accessibilityLabel={
              actions.followsMe ? `Follow ${person.displayName} back` : `Follow ${person.displayName}`
            }
            style={styles.grow}
          />
        )}
      </View>
    </View>
  );
}

/**
 * One figure over its word. Followers and following open their lists;
 * posts does not (the grid below is the list), so it is a plain element
 * read as one: "12 posts". `accessible` is what makes the label count:
 * RN only speaks a View's accessibilityLabel when the View is itself an
 * accessibility element.
 */
function Count({
  value,
  one,
  many,
  onPress,
}: {
  value: number | null;
  one: string;
  many: string;
  onPress?: () => void;
}) {
  const word = value === 1 ? one : many;
  const spoken =
    value === null
      ? `${many[0]!.toUpperCase()}${many.slice(1)}, not loaded yet`
      : `${formatCount(value)} ${word}`;
  /*
   * A column is a third of what the bezel leaves, about 80pt, and
   * "followers" at 13pt x 1.4 is about that on a 375pt phone. iOS shrinks
   * the word (or a long figure) to fit rather than wrap it inside itself;
   * at the default size nothing shrinks.
   */
  const body = (
    <>
      <Text
        style={styles.figure}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={COUNT_MIN_SCALE}
        maxFontSizeMultiplier={COUNT_CAP}>
        {value === null ? '–' : formatCount(value)}
      </Text>
      <Text
        style={styles.word}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={COUNT_MIN_SCALE}
        maxFontSizeMultiplier={COUNT_CAP}>
        {word}
      </Text>
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.count} accessible accessibilityLabel={spoken}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      // 40pt of type (22 + 18); 4 above and below clear the 44pt touch floor.
      hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Shows the list"
      style={({ pressed }) => [styles.count, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: layout.gutter, paddingTop: space.xs },
  identity: { flexDirection: 'row', alignItems: 'center', gap: IDENTITY_GAP },
  // The separators stretch to the row's height and stop 6pt short at each end (D15).
  counts: { flex: 1, flexDirection: 'row' },
  count: { flex: 1, alignItems: 'center' },
  pressed: { opacity: 0.5 },
  figure: { ...textRole.count, color: colors.text, textAlign: 'center' },
  word: { ...textRole.helper, color: colors.textMuted, textAlign: 'center' },
  // 16pt SemiBold under the bezel row (the mock's 12pt below it), the bio straight after.
  name: { ...textRole.sectionTitle, color: colors.text, marginTop: space.md },
  bio: { ...textRole.prose, color: colors.text, marginTop: 2 },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: 14 },
  grow: { flex: 1 },
});
