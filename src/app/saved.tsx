import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/AuthGate';
import { DrinkName, Print } from '@/components/cabinet';
import { DrinkFace, EmptyArt } from '@/components/DexCard';
import { chunk, PostGridRow } from '@/components/profile/PostGrid';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { EmptyState, Hold, Notice, SectionHeader } from '@/components/ui';
import { colors, layout, space, tabular, textRole } from '@/constants/theme';
import { formatCount, getDrink } from '@/data';
import { stylePhrase } from '@/lib/drinkLabels';
import { fetchSavedPosts, isRenderablePost, primeSignedUrls, savesSupported } from '@/lib/social';
import { useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';
import { useSocial } from '@/store/social';
import { useTaste } from '@/store/taste';
import type { Drink, Post } from '@/types';

/* ==================================================================== */
/* Saved                                                                */
/*                                                                      */
/* The posts you bookmarked, most recently saved first, as the profile's */
/* grid (plain square prints in the gutters, no plates). Private: the    */
/* saves table is readable by its owner only, and the first line says    */
/* so, because a bookmark that might be public is one nobody uses.       */
/*                                                                      */
/* It refetches when you come back to it after a save or unsave made     */
/* elsewhere (the social store counts them in savesVersion), so a post   */
/* unsaved from its own screen is gone when you return, and nothing is   */
/* fetched while the screen sits under another.                          */
/*                                                                      */
/* A HUNTING LIST. A bookmark in a drinks app is nearly always "I want   */
/* to try this", so the saves are split in two: the drinks not in your  */
/* Dex yet first, then the ones already in it. Worked out on the phone,  */
/* from each post's drink against your own collection: no new fetch, and */
/* nothing about your collection leaves the phone.                       */
/*                                                                      */
/* DRINKS TO TRY (v4.1 §1.4) come first, when there are any: the drinks  */
/* saved with "Save to try" on the first picks or a drink's page, newest */
/* first, as rows of a print, the name and what kind of drink it is. A   */
/* tap opens the drink. They are not the Dex, and never a drink already  */
/* in it (store/taste prunes the list as drinks are caught; the filter   */
/* here covers the frames before it has). Kept on the phone and with the */
/* account, owner only, so the private line above covers them too.      */
/* ==================================================================== */

const NO_POSTS: Post[] = [];

type Row =
  | { key: string; kind: 'head'; title: string; count: number; first: boolean; noun: 'post' | 'drink' }
  | { key: string; kind: 'posts'; posts: Post[] }
  | { key: string; kind: 'try'; drink: Drink };

/** A drink to try's print, and the space to its name: print at x 24, name at x 96. */
const TRY_PRINT = 56;
const TRY_GAP = space.lg;
/** 8 above and below the print: a 72pt pitch. */
const TRY_PAD_V = space.sm;
/** Dynamic Type cap on a row's name, as the + window's results. */
const TRY_NAME_CAP = 1.4;

/** One section's rows: its header, then its posts three to a row. Nothing for an empty section. */
function sectionRows(key: string, title: string, posts: Post[], first: boolean): Row[] {
  if (posts.length === 0) return [];
  return [
    { key: `${key}:head`, kind: 'head', title, count: posts.length, first, noun: 'post' },
    ...chunk(posts, 3).map((r): Row => ({ key: `${key}:${r[0]!.id}`, kind: 'posts', posts: r })),
  ];
}

export default function SavedScreen() {
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id);

  // Opened cold there is nothing under it; the Dex works signed out.
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/dex');
  }, [router]);

  if (!myId) return <AuthGate onClose={leave}>{null}</AuthGate>;
  return <Saved myId={myId} onBack={leave} />;
}

function Saved({ myId, onBack }: { myId: string; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [scrolled, onScroll] = useScrolledPast();
  const savesVersion = useSocial((s) => s.savesVersion);

  /*
   * Keyed by account, saves version and explicit retries. The version only
   * moves the key while the screen is focused: under another screen it
   * keeps the key it last fetched, and the change is picked up the moment
   * it is in front again.
   *
   * A retry is stamped with the key it was asked on, as usePostsByAuthor
   * does, so a refetch the version caused never shows the pull spinner
   * just because a pull happened earlier.
   */
  const [seenVersion, setSeenVersion] = useState(savesVersion);
  if (focused && seenVersion !== savesVersion) setSeenVersion(savesVersion);
  const base = `${myId}#${seenVersion}`;
  const [asked, setAsked] = useState({ base: '', n: 0 });
  const request = `${base}#${asked.n}`;

  const [loaded, setLoaded] = useState<{
    myId: string;
    request: string;
    posts: Post[];
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSavedPosts(myId)
      .then((posts) => {
        if (!alive) return;
        // One signing request for the grid rather than one per tile; see usePostsByAuthor.
        void primeSignedUrls(
          'pours',
          posts.flatMap((p) => (p.photoPath ? [p.photoPath] : [])),
        );
        setLoaded({ myId, request, posts, failed: false });
      })
      .catch(() => {
        if (!alive) return;
        setLoaded((prev) => ({
          myId,
          request,
          posts: prev?.myId === myId ? prev.posts : NO_POSTS,
          failed: true,
        }));
      });
    return () => {
      alive = false;
    };
  }, [myId, request]);

  const mine = loaded?.myId === myId ? loaded : null;
  const current = mine?.request === request;
  const status: 'loading' | 'ready' | 'error' =
    !mine || (mine.failed && !current) ? 'loading' : mine.failed ? 'error' : 'ready';
  const posts = (mine?.posts ?? NO_POSTS).filter(isRenderablePost);
  const reloading = asked.n > 0 && asked.base === base && !current && !!mine;
  const reload = () => setAsked({ base, n: asked.n + 1 });

  /*
   * Split against your collection once it has been read from disk. Before
   * that every drink would read as not in your Dex, so the list waits on
   * it (normally it is read before the splash lifts).
   */
  const unlocks = useCollection((s) => s.unlocks);
  const collectionReady = useCollection((s) => s.hydrated);
  const inDex = (p: Post) => Object.prototype.hasOwnProperty.call(unlocks, p.drinkId);
  const hunting = posts.filter((p) => !inDex(p));
  const caught = posts.filter(inDex);
  const waiting = status === 'loading' || (posts.length > 0 && !collectionReady);

  /* Drinks to try: catalogue drinks only, none in the Dex, newest first as the store keeps them. */
  const savedIds = useTaste((s) => s.saved);
  const toTry = collectionReady
    ? savedIds.flatMap((id) => {
        const drink = getDrink(id);
        return drink && !Object.prototype.hasOwnProperty.call(unlocks, id) ? [drink] : [];
      })
    : [];
  const tryRows: Row[] =
    toTry.length > 0
      ? [
          { key: 'try:head', kind: 'head', title: 'Drinks to try', count: toTry.length, first: true, noun: 'drink' },
          ...toTry.map((drink): Row => ({ key: `try:${drink.id}`, kind: 'try', drink })),
        ]
      : [];

  const rows: Row[] = collectionReady
    ? [
        ...tryRows,
        ...sectionRows('hunting', 'Not in your Dex yet', hunting, tryRows.length === 0),
        ...sectionRows('caught', 'Already in your Dex', caught, tryRows.length === 0 && hunting.length === 0),
      ]
    : [];

  const router = useRouter();
  const { width } = useWindowDimensions();
  const openDrink = (id: string) => router.push({ pathname: '/drink/[id]', params: { id } });

  const renderRow = ({ item }: { item: Row }) =>
    item.kind === 'posts' ? (
      <PostGridRow posts={item.posts} />
    ) : item.kind === 'try' ? (
      <TryRow drink={item.drink} width={width} onPress={openDrink} />
    ) : (
      <View style={[styles.head, item.first && styles.headFirst]}>
        <SectionHeader title={item.title} style={styles.headTitle} />
        <Text
          style={styles.headCount}
          accessibilityLabel={`${formatCount(item.count)} ${item.count === 1 ? item.noun : `${item.noun}s`}`}>
          {formatCount(item.count)}
        </Text>
      </View>
    );

  /*
   * With drinks to try on screen, the posts' part says only what is
   * worth saying under them: that it is still loading, or that it could
   * not load. "Nothing saved yet" would contradict the list above it.
   */
  const postsFooter =
    tryRows.length === 0 || posts.length > 0 ? null : waiting ? (
      <Hold fill={false} slowMessage="Still loading your saved posts." />
    ) : status === 'error' ? (
      <EmptyState
        icon="alert"
        title="Could not load saved posts"
        body="Check your connection and try again."
        action={{ label: 'Try again', onPress: reload }}
        actionVariant="secondary"
      />
    ) : null;

  const empty =
    waiting ? (
      <Hold fill={false} slowMessage="Still loading your saved posts." />
    ) : status === 'error' ? (
      <EmptyState
        icon="alert"
        title="Could not load saved posts"
        body="Check your connection and try again."
        action={{ label: 'Try again', onPress: reload }}
        actionVariant="secondary"
      />
    ) : !savesSupported() ? (
      /*
       * The server has no saves table yet (migration 017 not applied):
       * not "nothing saved", which would be a confident wrong answer.
       */
      <EmptyState
        icon="bookmark"
        title="Saving isn't available right now"
        body="Try again after the next update."
      />
    ) : (
      /*
       * A drink still to catch, as its grey proof: what this list is for,
       * drawn rather than told with a bookmark glyph.
       */
      <EmptyState
        art={<EmptyArt drinkId="paper-plane" mode="proof" />}
        title="Nothing saved yet"
        body="Save a post to hunt the drink down later."
      />
    );

  return (
    <View style={styles.screen}>
      <ScreenTopBar
        title="Saved"
        left={<TopBarButton icon="chevronLeft" label="Back" onPress={onBack} />}
        showRule={scrolled}
      />
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={renderRow}
        ListHeaderComponent={
          <>
            <Text style={styles.privacy}>Only you can see what you save.</Text>
            {status === 'error' && posts.length > 0 ? (
              <Notice tone="error" style={styles.notice}>
                Could not refresh. Pull down to try again.
              </Notice>
            ) : null}
          </>
        }
        ListEmptyComponent={empty}
        ListFooterComponent={postsFooter}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshing={reloading}
        onRefresh={reload}
        initialNumToRender={6}
        windowSize={7}
        style={styles.list}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

/**
 * One drink to try: its colour print (a row of drinks is where you
 * recognise one), its name and what kind of drink it is. The row is one
 * button, opening the drink's page.
 */
function TryRow({ drink, width, onPress }: { drink: Drink; width: number; onPress: (id: string) => void }) {
  const kind = stylePhrase(drink);
  return (
    <Pressable
      onPress={() => onPress(drink.id)}
      accessibilityRole="button"
      accessibilityLabel={`${drink.name}, ${kind}`}
      accessibilityHint="Opens the drink"
      style={({ pressed }) => [styles.tryRow, pressed && styles.tryPressed]}>
      <Print width={TRY_PRINT} height={TRY_PRINT}>
        {/* DrinkFace decodes at the 56pt frame (enforceEarlyResizing, a per-size cacheKey) and is left alone by Smart Invert. */}
        <DrinkFace drink={drink} mode="photo" width={TRY_PRINT} height={TRY_PRINT} />
      </Print>
      <View style={styles.tryText}>
        <DrinkName
          name={drink.name}
          role={textRole.name}
          measure={width - 2 * layout.gutter - TRY_PRINT - TRY_GAP}
          cap={TRY_NAME_CAP}
          color={colors.text}
        />
        <Text style={styles.tryMeta}>{kind}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { flex: 1 },
  // A section head, then its prints; 32 above every head but the first (layout.section).
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.md,
    paddingHorizontal: layout.gutter,
    paddingTop: layout.section,
    paddingBottom: space.xs,
  },
  headFirst: { paddingTop: space.lg },
  headTitle: { flex: 1 },
  headCount: { ...textRole.small, ...tabular, color: colors.textMuted },
  privacy: {
    ...textRole.small,
    color: colors.textMuted,
    paddingHorizontal: layout.gutter,
    paddingVertical: space.sm,
  },
  notice: { marginHorizontal: layout.gutter, marginBottom: space.sm },
  tryRow: {
    minHeight: TRY_PRINT + 2 * TRY_PAD_V,
    flexDirection: 'row',
    alignItems: 'center',
    gap: TRY_GAP,
    paddingVertical: TRY_PAD_V,
    paddingHorizontal: layout.gutter,
  },
  tryPressed: { backgroundColor: colors.press },
  tryText: { flex: 1 },
  tryMeta: { ...textRole.small, color: colors.textMuted },
});
