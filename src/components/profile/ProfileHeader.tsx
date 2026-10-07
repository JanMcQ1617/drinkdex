import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import type { UserProfile } from '@/types';

/* ==================================================================== */
/* The head of a profile                                                */
/*                                                                      */
/* One layout for your profile and anyone else's, so the two read as one */
/* screen: the picture, then the name over three counts, then the bio,   */
/* then a row of actions. The handle is not repeated here; it is the     */
/* screen's title, in the top bar.                                       */
/*                                                                      */
/* The name (16pt) sits over 18pt figures and their 13pt muted words, so */
/* the head has an order to read in. Before, name, figures, bio and      */
/* buttons all sat between 14 and 16pt, and only the avatar stood out.   */
/*                                                                      */
/* Posts, followers, following. Not a Dex count: a collection never      */
/* leaves its owner's phone, so it would be a dash on every profile but  */
/* yours. Your own Dex count is on the Dex tab, in the strip below.      */
/* ==================================================================== */

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
        {/* Hidden from VoiceOver by Avatar itself: the name beside it speaks. */}
        <Avatar
          name={person.displayName}
          accent={person.accent}
          size={86}
          avatarPath={person.avatarPath}
        />
        <View style={styles.identityText}>
          <Text style={styles.name} numberOfLines={1}>
            {person.displayName}
          </Text>
          <View style={styles.counts}>
            <Count value={posts} one="post" many="posts" />
            <Count
              value={followers}
              one="follower"
              many="followers"
              onPress={() => onOpenList('followers')}
            />
            <Count
              value={following}
              one="following"
              many="following"
              onPress={() => onOpenList('following')}
            />
          </View>
        </View>
      </View>

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
  const body = (
    <>
      <Text style={styles.figure} maxFontSizeMultiplier={1.4}>
        {value === null ? '–' : formatCount(value)}
      </Text>
      <Text style={styles.word} maxFontSizeMultiplier={1.4}>
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
  identity: { flexDirection: 'row', alignItems: 'center' },
  identityText: { flex: 1, marginLeft: 18, justifyContent: 'center' },
  // 16pt SemiBold, over the figures: the person comes first by place, the figures by size.
  name: { ...textRole.sectionTitle, color: colors.text },
  counts: { flexDirection: 'row', marginTop: 6 },
  count: { flex: 1, alignItems: 'flex-start' },
  pressed: { opacity: 0.5 },
  figure: { ...textRole.count, color: colors.text },
  word: { ...textRole.helper, color: colors.textMuted },
  bio: { ...textRole.prose, color: colors.text, marginTop: space.md },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: 14 },
  grow: { flex: 1 },
});
