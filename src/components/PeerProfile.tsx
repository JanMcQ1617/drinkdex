import { useCallback, useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Grain } from '@/components/Grain';
import { ProfileView } from '@/components/profile/ProfileView';
import { ScreenTopBar, TopBarButton } from '@/components/ScreenTopBar';
import { EmptyState, haptic, Hold } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { blockUser, REPORT_REASONS, reportUser, type ReportReason } from '@/lib/moderation';
import { shareProfile } from '@/lib/profileLink';
import { fetchProfiles } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { useSocial } from '@/store/social';
import type { UserProfile } from '@/types';

/* ==================================================================== */
/* Someone else's profile                                               */
/*                                                                      */
/* Rendered by its own root-stack route, app/user/[id].tsx, rather than  */
/* as a mode of the Profile tab. As a mode it borrowed the tab's place:  */
/* the tab bar lit Profile while you were looking at someone else, Back  */
/* had to be rebuilt by hand from the tab's history, and there was no    */
/* swipe back at all. Pushed over the tabs, it gets the native back      */
/* gesture, the tab bar leaves while it shows, and Back is simply back.  */
/*                                                                      */
/* This file is the part only someone else's profile has: finding the    */
/* account from an id, and the menu that reports or blocks it. The body  */
/* is the same ProfileView your own profile draws (components/profile).  */
/* ==================================================================== */

/*
 * The id arrives from a link as readily as from a tap, so it is checked
 * before it is used. A plain lookup object answers "constructor" or
 * "__proto__" with something that is not a profile, and an id that is not
 * shaped like an account id cannot be one: asking the server about it only
 * failed, which read as a connection problem with a Try again that could
 * never work. Both now read as the account not being there.
 *
 * Exported for the other screens that take an account id as a param
 * (the followers and following lists).
 */
export const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ownEntry<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

export function PeerProfile({ id, onBack }: { id: string; onBack: () => void }) {
  const insets = useSafeAreaInsets();

  const wellFormed = ACCOUNT_ID.test(id);
  const myId = useAuth((s) => s.session?.user.id);
  const cached = useSocial((s) => ownEntry(s.profiles, id));
  const dropAuthor = useSocial((s) => s.dropAuthor);

  /*
   * The lookup is normally already warm — you get here from the feed or a
   * list of people, which put the row in the store. A cold deep link, or a
   * match from Find friends (those rows are not merged into the store), is
   * the exception, so fetch the one row rather than show a nameless card.
   *
   * Keyed by id and attempt like every other async state in this file, so a
   * different person never borrows the last one's answer, and the fetch in
   * flight reads as loading rather than as "unavailable". A request that
   * failed is told apart from an account that is not there (blocked or
   * deleted, which RLS makes look the same on purpose): only the failure is
   * worth a retry.
   */
  const [attempt, setAttempt] = useState(0);
  const [fetched, setFetched] = useState<{
    id: string;
    attempt: number;
    profile: UserProfile | null;
    failed: boolean;
  } | null>(null);
  useEffect(() => {
    if (cached || !wellFormed) return;
    let alive = true;
    fetchProfiles([id])
      .then((map) => {
        if (alive) {
          setFetched({ id, attempt, profile: ownEntry(map, id) ?? null, failed: false });
        }
      })
      .catch(() => {
        if (alive) setFetched({ id, attempt, profile: null, failed: true });
      });
    return () => {
      alive = false;
    };
  }, [cached, wellFormed, id, attempt]);

  const answer = fetched?.id === id && fetched.attempt === attempt ? fetched : null;

  /*
   * Once someone is on screen, they stay on screen until this profile
   * itself decides otherwise. The store's copy can vanish under it: a
   * block made on one of their posts drops them from the store while that
   * post is still on top, and a full feed load replaces the store's
   * profiles with only the feed's authors. Falling back to the lookup
   * states either time unmounted the profile (a flash of loading, or an
   * "unavailable" page to tap Back from); held, ProfileView stays mounted
   * and, on the way back, finds out for itself whether the account can
   * still be seen, and leaves if it cannot.
   */
  const found = cached ?? answer?.profile ?? null;
  const [shown, setShown] = useState<UserProfile | null>(null);
  if (found && found !== shown) setShown(found);
  const person = found ?? (shown?.id === id ? shown : null);
  const lookup: 'loading' | 'failed' | 'missing' = !wellFormed
    ? 'missing'
    : !answer
      ? 'loading'
      : answer.failed
        ? 'failed'
        : 'missing';

  /*
   * A block takes them out of every list the store holds at once, then
   * leaves: RLS hides them from the next query, and staying on the profile
   * of someone you just blocked reads as a block that did not work. Both
   * block paths end here: this header's menu, and a block made on a screen
   * opened from this profile (one of their posts or reels), which
   * ProfileView notices when you come back to it.
   */
  const afterBlock = useCallback(() => {
    dropAuthor(id);
    onBack();
  }, [dropAuthor, id, onBack]);

  /*
   * Report and block live on the profile as well as on each post. A name,
   * a bio and a picture are content too, and an account that has never
   * posted has no post menu to reach them from.
   *
   * Built the way PostCard builds its menu, so the two read as one feature:
   * the same reasons and wording, an action sheet on iOS (a choice among
   * several is a sheet; an alert is for a yes or no), and Report not styled
   * destructive, because filing one removes nothing. Block is destructive.
   */
  const openReport = () => {
    if (!myId || !person) return;
    const file = (reason: ReportReason) => {
      void reportUser(myId, person.id, reason)
        .then(() =>
          Alert.alert(
            'Thanks',
            'This account has been reported. You can also block them from the same menu.',
          ),
        )
        .catch(() => Alert.alert('Could not report', 'Check your connection and try again.'));
    };
    const title = `Report @${person.username}`;
    const message =
      'What is wrong with this account? Reports are reviewed privately; they are not told who reported them.';

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          message,
          options: [...REPORT_REASONS.map((r) => r.label), 'Cancel'],
          cancelButtonIndex: REPORT_REASONS.length,
        },
        (i) => {
          const reason = REPORT_REASONS[i];
          if (reason) file(reason.key);
        },
      );
      return;
    }
    Alert.alert(title, message, [
      ...REPORT_REASONS.map((r) => ({ text: r.label, onPress: () => file(r.key) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const confirmBlock = () => {
    if (!myId || !person) return;
    Alert.alert(
      `Block @${person.username}?`,
      'You will not see their posts and they will not see yours. Any follow between you is removed. You can undo this in Settings, under Blocked accounts.',
      [
        { text: 'Cancel', style: 'cancel' as const },
        {
          text: 'Block',
          style: 'destructive' as const,
          onPress: () => {
            void blockUser(myId, person.id)
              .then(() => {
                haptic.select();
                afterBlock();
              })
              .catch(() => Alert.alert('Could not block', 'Check your connection and try again.'));
          },
        },
      ],
    );
  };

  /*
   * Share first: it is the everyday choice, and the two moderation actions
   * below it are the ones to reach on purpose. Sharing sends the profile's
   * link only; it never invites or follows anyone (lib/profileLink).
   */
  const openAccountMenu = () => {
    if (!person) return;
    const block = `Block @${person.username}`;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: person.displayName,
          options: ['Share profile', 'Report account', block, 'Cancel'],
          cancelButtonIndex: 3,
          destructiveButtonIndex: 2,
        },
        (i) => {
          if (i === 0) shareProfile(person);
          else if (i === 1) openReport();
          else if (i === 2) confirmBlock();
        },
      );
      return;
    }
    Alert.alert(person.displayName, undefined, [
      { text: 'Share profile', onPress: () => shareProfile(person) },
      { text: 'Report account', onPress: openReport },
      { text: block, style: 'destructive' as const, onPress: confirmBlock },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  /*
   * Before the account is known: the same bar, so Back is where it will
   * be, over a body that says which of three things this is.
   */
  if (!person) {
    return (
      <View style={styles.screen}>
        <Grain />
        <ScreenTopBar
          size="lg"
          title=""
          left={<TopBarButton icon="chevronLeft" label="Back" onPress={onBack} />}
          showRule={false}
        />
        {lookup === 'loading' ? (
          // The slot Hold, centred: a filled one would paint flat cream over the grain.
          <View style={styles.center}>
            <Hold fill={false} slowMessage="Still loading this profile." />
          </View>
        ) : (
          <View style={styles.center}>
            {lookup === 'failed' ? (
              <EmptyState
                icon="alert"
                title="Could not load this profile"
                body="Check your connection and try again."
                action={{ label: 'Try again', onPress: () => setAttempt(attempt + 1) }}
                actionVariant="secondary"
              />
            ) : (
              <EmptyState
                icon="users"
                title="Profile unavailable"
                body="This account is not available."
                action={{ label: 'Back', onPress: onBack }}
                actionVariant="secondary"
              />
            )}
          </View>
        )}
      </View>
    );
  }

  /*
   * The bottom inset is the home indicator's and no more. This screen is
   * pushed over the tabs, so the floating tab bar is not there to clear.
   */
  return (
    <ProfileView
      person={person}
      isOwn={false}
      onBack={onBack}
      right={
        myId ? (
          <TopBarButton
            icon="more"
            label={`Options for @${person.username}`}
            onPress={openAccountMenu}
          />
        ) : undefined
      }
      onBlocked={afterBlock}
      bottomInset={insets.bottom + space.xl}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center' },
});
