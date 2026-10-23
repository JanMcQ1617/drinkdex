import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { Avatar, Button } from '@/components/ui';
import { colors, fonts, layout, radius, space, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import type { UserProfile } from '@/types';

/* ==================================================================== */
/* The head of a profile                                                */
/*                                                                      */
/* v4, less stuff (layout spec 5.5, white-min/profile.png). From the    */
/* top: the 80pt face at the gutter with the name beside it and the bio */
/* under the name on ONE line (the whole bio is in ••• › About and Edit */
/* profile); the three counts on one line; ONE key; on your own profile */
/* the quiet "38 entries in your Dex ›" that opens Dex progress.       */
/*                                                                      */
/* The Tournaments line that sat under it (17 Oct 2026) went with v4.7  */
/* (Jan, 23 Oct 2026; specs/v4.7/spec.md 2.9): tournaments have a tab   */
/* of their own now, the trophy second in the bar, so a second way in   */
/* from here would be a duplicate to keep in step.                      */
/*                                                                      */
/* THE CAUGHT FIGURE IS THE ACCENT (v4.4, one of its five places; see   */
/* theme.ts). In "38 entries in your Dex" the number alone is Campari   */
/* at 600; the words stay muted. Nothing else here takes it: the        */
/* counts, followers and posts stay ink or muted, and the app has one   */
/* red dot, Home's Activity dot.                                        */
/*                                                                      */
/* One layout for yours and anyone else's, so the two read as one       */
/* screen. Yours has Edit profile in the key's slot; theirs has Follow  */
/* (ink) or Following (wash), and beside it the ••• that holds Share,   */
/* About, Report and Block. That ••• lives here, not in the bar, because */
/* a pushed screen's bar holds the back chevron and nothing else        */
/* (layout principle 8, as the post detail moved its ••• into the row). */
/*                                                                      */
/* No pen mark sits here any more. v4.6's margin rule (A.3 #7) ruled   */
/* the Dex and Tournaments lines as one ledger and was drawn only when  */
/* both showed; with one line left it would be a 9.5pt tick, a stray    */
/* mark, so it retired with the Tournaments line (v4.7 6.1). Profile's  */
/* one mark is the swash under its title (ScreenTopBar).                */
/*                                                                      */
/* The handle is not repeated here: it is the screen's title. The Dex   */
/* panel, its ruler and the rank ladder moved to Dex progress (/stats), */
/* and Share profile into the •••.                                      */
/* ==================================================================== */

/** The face, ring included (layout spec 5.5: 80 at x 24). */
const AVATAR = 80;
/** Face to name: the name starts at x 124. */
const IDENTITY_GAP = 20;
/** Between the three counts (layout spec 5.5). */
const COUNT_GAP = 28;
/** The quiet line's chevron. */
const CHEVRON = 16;

export type ProfileActions =
  | {
      kind: 'own';
      onEdit: () => void;
      /** Your Dex count, the same figure the Dex tab and Dex progress show. */
      dexCount: number;
      /** Opens Dex progress. */
      onOpenDex: () => void;
    }
  | {
      kind: 'peer';
      /** You follow them (the social store's optimistic list). */
      following: boolean;
      /** They follow you: the key offers "Follow back". */
      followsMe: boolean;
      onFollow: () => void;
      /** Asks first; see ProfileView. */
      onUnfollow: () => void;
      /** Their account menu. Absent signed out, where there is nothing to report or block as. */
      onMore?: () => void;
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
  const bio = person.bio?.trim();
  return (
    <View style={styles.header}>
      <View style={styles.identity}>
        {/*
          Hidden from VoiceOver by Avatar itself: the name beside it speaks.
          The 1pt ink ring with its 3pt gap is the face's frame (white
          spec 5.14), the same ring the tab bar's face takes when Profile
          is the tab you are on.
        */}
        <Avatar
          name={person.displayName}
          accent={person.accent}
          size={AVATAR}
          ring
          avatarPath={person.avatarPath}
        />
        <View style={styles.identityText}>
          {/* No line limit: a long name wraps at a space, it is never cut. */}
          <Text style={[textRole.bodyStrong, styles.ink]}>{person.displayName}</Text>
          {bio ? (
            /*
             * One line, with an ellipsis: the one place the layout allows a
             * cut (spec 5.5), because the whole bio is a tap away in •••
             * › About and in Edit profile. VoiceOver reads it whole.
             */
            <Text
              numberOfLines={1}
              accessibilityLabel={bio}
              style={[textRole.small, styles.muted, styles.bio]}>
              {bio}
            </Text>
          ) : null}
        </View>
      </View>

      {/*
        One line of counts, 28 apart; at Larger Text the line wraps between
        two counts, never inside one.
      */}
      <View style={styles.counts}>
        <Count value={posts} one="post" many="posts" />
        <Count value={followers} one="follower" many="followers" onPress={() => onOpenList('followers')} />
        <Count value={following} one="following" many="following" onPress={() => onOpenList('following')} />
      </View>

      <View style={styles.keys}>
        {actions.kind === 'own' ? (
          // The screen's one key (layout principle 6), the wash key: nothing here is a call to action.
          <Button label="Edit profile" variant="secondary" onPress={actions.onEdit} style={styles.key} />
        ) : actions.following ? (
          /*
           * The wash key: following is a state, not an action to take.
           * Pressing it asks before unfollowing, because an unfollow from
           * here is the costly mistake; the list rows still toggle straight
           * away, as bulk tools do.
           */
          <Button
            label="Following"
            variant="secondary"
            onPress={actions.onUnfollow}
            accessibilityLabel={`Unfollow ${person.displayName}`}
            accessibilityHint="Asks before unfollowing"
            style={styles.key}
          />
        ) : (
          <Button
            label={actions.followsMe ? 'Follow back' : 'Follow'}
            variant="primary"
            onPress={actions.onFollow}
            // "back" is spoken too: that they follow you is said by the label alone.
            accessibilityLabel={
              actions.followsMe ? `Follow ${person.displayName} back` : `Follow ${person.displayName}`
            }
            style={styles.key}
          />
        )}
        {actions.kind === 'peer' && actions.onMore ? (
          <Pressable
            onPress={actions.onMore}
            accessibilityRole="button"
            accessibilityLabel={`Options for @${person.username}`}
            style={({ pressed }) => [styles.more, pressed && styles.morePressed]}>
            <Icon name="more" size={22} color={colors.text} />
          </Pressable>
        ) : null}
      </View>

      {/* The quiet line's wrapper: it holds the Dex line's 4 over it. */}
      {actions.kind === 'own' ? (
        <View style={styles.ledger}>
          <Pressable
            onPress={actions.onOpenDex}
            accessibilityRole="button"
            accessibilityLabel={dexLine(actions.dexCount)}
            accessibilityHint="Opens Dex progress"
            style={({ pressed }) => [styles.line, pressed && styles.dimmed]}>
            <Text style={[textRole.small, styles.muted, styles.dexText]}>
              {/* The accent only once there is something caught: a red 0 reads as an error. */}
              <Text style={actions.dexCount > 0 ? styles.dexFigure : undefined}>{formatCount(actions.dexCount)}</Text>
              {dexWords(actions.dexCount)}
            </Text>
            <Icon name="chevronRight" size={CHEVRON} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/** "38 entries in your Dex", "1 entry in your Dex": the catalogue's word, not a count of drinks had. */
function dexLine(n: number): string {
  return `${formatCount(n)}${dexWords(n)}`;
}

/** The line after its figure (" entries in your Dex"), which is drawn on its own in the accent. */
function dexWords(n: number): string {
  return ` ${n === 1 ? 'entry' : 'entries'} in your Dex`;
}

/**
 * One count, figure then word, read as one: "212 followers". Followers and
 * following open their lists; posts does not (the grid below is the list).
 * `accessible` is what makes the label count: RN only speaks a View's
 * accessibilityLabel when the View is itself an accessibility element.
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
    <Text style={[textRole.body, styles.muted]}>
      <Text style={styles.figure}>{value === null ? '–' : formatCount(value)}</Text> {word}
    </Text>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={spoken}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      // A 24pt line; 10 above and below reach the 44pt touch floor.
      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Shows the list"
      style={({ pressed }) => pressed && styles.dimmed}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The bar ends at y 114 and the face starts at 130 (layout spec 5.5).
  header: { paddingHorizontal: layout.gutter, paddingTop: space.lg },
  identity: { flexDirection: 'row', alignItems: 'center', gap: IDENTITY_GAP },
  identityText: { flex: 1 },
  bio: { marginTop: space.xs },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  counts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: COUNT_GAP,
    rowGap: space.xs,
    marginTop: space.xl,
  },
  figure: { fontFamily: fonts.bodySemiBold, color: colors.text, fontVariant: ['tabular-nums'] },
  dimmed: { opacity: 0.5 },
  keys: { flexDirection: 'row', gap: space.sm, marginTop: space.xl },
  // 392 x 44 (layout spec 5.5), under the block key's 52.
  key: { flex: 1, minHeight: layout.hit },
  more: {
    width: layout.hit,
    height: layout.hit,
    borderRadius: radius.control,
    backgroundColor: colors.bgSunk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  morePressed: { backgroundColor: colors.press },
  // The quiet line: a 44pt row, an 18pt line of small type and a chevron at the gutter.
  line: {
    minHeight: layout.hit,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  // The quiet line's wrapper: it sits 18 under the key (its line at y 344 at 440).
  ledger: { marginTop: space.xs },
  dexText: { flex: 1 },
  /* The caught figure: the accent at 600 so the hue reads at 13pt (5.54:1 on the page), tabular like every count. */
  dexFigure: { fontFamily: fonts.bodySemiBold, color: colors.accent, fontVariant: ['tabular-nums'] },
});
