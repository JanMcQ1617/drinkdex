import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FollowButton } from '@/components/PeopleList';
import { BottomSheet } from '@/components/Sheet';
import { orderTagged } from '@/lib/tags';
import { Avatar, Button } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { useAuth } from '@/store/auth';
import { useSocial } from '@/store/social';
import type { Post, UserProfile } from '@/types';

/* ==================================================================== */
/* In this post (specs/v4.3/spec.md §1.5)                               */
/*                                                                      */
/* Who the author was with, behind the header's "with ana and 2         */
/* others": a short sheet, since a post holds ten people at most. One   */
/* 64pt row each, in the header's order (you first, then people you     */
/* follow): the face, the name ("You" for you) over "@handle", and one  */
/* key. Your own row's is Remove me; everyone else's is their Follow.   */
/* The author's own view of their post has no keys: they manage tags    */
/* through •••, and following people they tagged is already done.      */
/*                                                                      */
/* Tapping a person opens their profile once the sheet has gone (the    */
/* likers sheet's pattern): a screen pushed while the sheet is still up */
/* lands underneath it.                                                 */
/* ==================================================================== */

/** The face (the likers sheet's 44 in a 64 row). */
const ROW_AVATAR = 44;
/** Remove me, Follow and Following share one width, so the keys line up (116 x 36). */
const KEY_W = 116;

export interface TaggedSheetProps {
  visible: boolean;
  /** The post as the card shows it, its `tagged` included. */
  post: Post;
  author: UserProfile;
  onClose: () => void;
  /** Your own row's Remove me. The card asks first, then removes you. */
  onRemoveMe: () => void;
}

export function TaggedSheet({ visible, post, author, onClose, onRemoveMe }: TaggedSheetProps) {
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id);
  const following = useSocial((s) => s.following);
  const toggleFollow = useSocial((s) => s.toggleFollow);

  /*
   * The order is the header's as the sheet opens, and holds while it is
   * up: the line puts people you follow first, so ordering by the live
   * follow list moved a row the moment its Follow was tapped, under the
   * finger. Taken again on each open, as a render-time adjustment, so
   * the first frame is already right. The keys read the live list.
   */
  const [orderBy, setOrderBy] = useState(following);
  const [openNow, setOpenNow] = useState(visible);
  if (visible !== openNow) {
    setOpenNow(visible);
    if (visible) setOrderBy(following);
  }
  const people = orderTagged(post.tagged ?? [], myId, orderBy);
  const followed = new Set(following);
  // Only the author's own view is keyless; everyone else gets Follow or Remove me.
  const keys = !!myId && myId !== author.id;

  /*
   * The person tapped, opened once the sheet has gone: a screen pushed
   * while the sheet is still fading lands underneath it.
   */
  const pending = useRef<string | null>(null);

  const go = (id: string) => {
    // Your own name is the Profile tab, where Edit profile is, as on Home.
    if (id === myId) router.navigate('/profile');
    else router.navigate({ pathname: '/user/[id]', params: { id } });
  };

  const openPerson = (id: string) => {
    pending.current = id;
    onClose();
    // Only iOS reports the sheet's dismissal; elsewhere open the profile straight away.
    if (Platform.OS !== 'ios') {
      pending.current = null;
      go(id);
    }
  };

  const afterDismiss = () => {
    const id = pending.current;
    pending.current = null;
    if (id) go(id);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} onDismissed={afterDismiss}>
      <Text accessibilityRole="header" style={styles.title}>
        In this post
      </Text>
      {/* Ten rows at most; at the largest text sizes they scroll inside the sheet. */}
      <ScrollView bounces={false} style={styles.list} showsVerticalScrollIndicator={false}>
        {people.map((person) => {
          const self = person.id === myId;
          return (
            <View key={person.id} style={styles.row}>
              <Pressable
                onPress={() => openPerson(person.id)}
                accessibilityRole="button"
                accessibilityLabel={self ? `You, @${person.username}` : `${person.displayName}, @${person.username}`}
                accessibilityHint={self ? 'Opens your profile' : 'Opens their profile'}
                style={({ pressed }) => [styles.identity, pressed && styles.pressed]}>
                <Avatar name={person.displayName} accent={person.accent} size={ROW_AVATAR} avatarPath={person.avatarPath} />
                <View style={styles.rowText}>
                  <Text style={styles.name}>{self ? 'You' : person.displayName}</Text>
                  <Text style={styles.handle}>@{person.username}</Text>
                </View>
              </Pressable>
              {!keys ? null : self ? (
                // A wash key: it removes nothing of theirs, only you from their post.
                <Button
                  label="Remove me"
                  variant="secondary"
                  size="sm"
                  onPress={onRemoveMe}
                  accessibilityLabel="Remove me from this post"
                  style={styles.key}
                />
              ) : (
                <FollowButton
                  following={followed.has(person.id)}
                  name={person.displayName}
                  onToggle={() => {
                    if (myId) void toggleFollow(myId, person.id);
                  }}
                />
              )}
            </View>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.5 },
  /* "In this post" centred, 8 above the first row's own 10. */
  title: { ...textRole.bodyStrong, color: colors.text, textAlign: 'center', marginBottom: space.sm },
  /* Shrinks inside the sheet's 88% so the rows scroll rather than run off its foot. */
  list: { flexGrow: 0, flexShrink: 1 },
  /* Rows: 64, the 44 face at the gutter, the name 16 after it, the key on the far gutter. */
  row: {
    minHeight: layout.rowTall,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.lg, minHeight: layout.hit },
  rowText: { flex: 1 },
  name: { ...textRole.body, color: colors.text },
  handle: { ...textRole.small, color: colors.textMuted },
  key: { minWidth: KEY_W },
});
