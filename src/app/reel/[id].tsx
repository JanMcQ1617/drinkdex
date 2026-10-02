import { setStatusBarStyle } from 'expo-status-bar';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { ReelPager } from '@/components/reels/ReelPager';
import { EmptyState, Hold, MediaIconButton } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { COPY, fetchReel, fetchReelsByAuthor, type Reel, REELS_ENABLED } from '@/lib/reels';
import { fetchProfiles } from '@/lib/social';
import { useAuth } from '@/store/auth';
import type { UserProfile } from '@/types';

/* ==================================================================== */
/* One person's reels                                                   */
/*                                                                      */
/* Pushed over the tabs from a tile on a profile's Reels tab, with the   */
/* reel's id and its author's: the pager holds all of that person's     */
/* reels (the live limit keeps it to one request) and opens on the one   */
/* tapped, so swiping goes through their reels rather than everyone's.  */
/* With only an id (a link, later) it is that one reel.                  */
/*                                                                      */
/* No tab bar under it, and the edge swipe goes back: the pager scrolls  */
/* vertically, so nothing competes for a horizontal swipe.               */
/* ==================================================================== */

export default function ReelScreen() {
  return REELS_ENABLED ? <GatedReel /> : <Redirect href="/" />;
}

function GatedReel() {
  const router = useRouter();
  // Out of this screen, or to the Dex when a link opened it cold, the way a gated push closes.
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/dex');
  };
  return (
    <AuthGate onClose={leave}>
      <AuthorReels onBack={leave} />
    </AuthGate>
  );
}

type Loaded =
  | { attempt: number; kind: 'ready'; reels: Reel[]; authors: Record<string, UserProfile>; index: number }
  | { attempt: number; kind: 'missing' }
  | { attempt: number; kind: 'error' };

function AuthorReels({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; author?: string }>();
  const id = String(params.id ?? '').toLowerCase();
  const author = params.author ? String(params.author).toLowerCase() : null;
  const myId = useAuth((s) => s.session?.user.id);

  /*
   * One load per attempt; "Try again" is a new attempt. The result carries
   * the attempt it answers, so a retry reads as loading at once, with no
   * state reset inside the effect.
   */
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  /** Reels deleted or reported from here, gone from the list at once. */
  const [gone, setGone] = useState<readonly string[]>([]);

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );

  useEffect(() => {
    if (!myId) return;
    let alive = true;
    void (async () => {
      try {
        let reels: Reel[];
        let index = 0;
        if (author) {
          reels = await fetchReelsByAuthor(author, myId);
          // The tapped reel, or the newest when it has gone since the grid was drawn.
          index = Math.max(0, reels.findIndex((r) => r.id === id));
        } else {
          const one = await fetchReel(id, myId);
          reels = one ? [one] : [];
        }
        const authors = reels.length ? await fetchProfiles(reels.map((r) => r.authorId)) : {};
        // A reel whose author did not come back (deleted, or a block that just landed) is not shown.
        const shown = reels.filter((r) => authors[r.authorId]);
        if (!alive) return;
        if (shown.length === 0) {
          setLoaded({ attempt, kind: 'missing' });
          return;
        }
        const at = shown.findIndex((r) => r.id === reels[index]?.id);
        setLoaded({ attempt, kind: 'ready', reels: shown, authors, index: Math.max(0, at) });
      } catch {
        if (alive) setLoaded({ attempt, kind: 'error' });
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, author, myId, attempt]);

  const current = loaded?.attempt === attempt ? loaded : null;
  const reels = current?.kind === 'ready' ? current.reels.filter((r) => !gone.includes(r.id)) : [];

  // The last one deleted or reported: nothing left to page through.
  const removed = (reelId: string) => {
    const left = reels.filter((r) => r.id !== reelId);
    setGone((g) => [...g, reelId]);
    if (left.length === 0) onBack();
  };

  let body: ReactNode;
  if (!current) {
    body = <Hold tone="dark" slowMessage={COPY.loadingSlow} />;
  } else if (current.kind === 'error') {
    body = (
      <View style={styles.page}>
        <EmptyState
          tone="dark"
          icon="alert"
          title={COPY.errorTitle}
          body={COPY.errorBody}
          action={{ label: 'Try again', onPress: () => setAttempt((n) => n + 1) }}
        />
      </View>
    );
  } else if (current.kind === 'missing' || reels.length === 0) {
    body = (
      <View style={styles.page}>
        <EmptyState
          tone="dark"
          icon="reels"
          title={COPY.unavailable}
          body="It may have been deleted."
          action={{ label: 'Back', onPress: onBack }}
        />
      </View>
    );
  } else {
    body = (
      <ReelPager
        reels={reels}
        authors={current.authors}
        initialIndex={current.index}
        bottomInset={insets.bottom + space.lg}
        onRemoved={removed}
        // Every reel here is that person's: blocking them empties the screen.
        onAuthorBlocked={onBack}
      />
    );
  }

  return (
    <View style={styles.screen}>
      {body}
      <MediaIconButton
        icon="chevronLeft"
        label="Back"
        onPress={onBack}
        style={[styles.back, { top: insets.top + space.sm }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.reelGround },
  page: { flex: 1, justifyContent: 'center' },
  back: { position: 'absolute', left: space.lg },
});
