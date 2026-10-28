import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Linking, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { DrinkName, Print } from '@/components/cabinet';
import { DrinkFace, FACE_FILL } from '@/components/DexCard';
import { chunk } from '@/components/profile/PostGrid';
import { PlaceMap, placeMapAvailable } from '@/components/places/PlaceMap';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { Button, EmptyState, haptic, Hold, Notice, PressableScale } from '@/components/ui';
import { colors, layout, space, tabular, textRole } from '@/constants/theme';
import { formatCount, getDrink } from '@/data';
import { appleMapsUrl, PLACE_CATEGORY_LABEL, type PlaceDrink } from '@/lib/places';
import {
  cachedPlace,
  openInAppleMaps,
  placeSearchAvailable,
  type ResolvedPlace,
  resolvePlace,
} from '@/lib/placeSearch';
import { useSignedPhoto } from '@/lib/useSignedPhoto';
import { usePlaces } from '@/store/places';

/* ==================================================================== */
/* A place (specs/v4.8-places 3.4, as reworked in §0.5)                 */
/*                                                                      */
/* Where people have had what: the place's name as people tagged it,    */
/* how many different drinks and how many people, Apple's map of the    */
/* street with Apple's address under it, one key that opens it in Apple */
/* Maps, and a grid of the drinks posted there.                         */
/*                                                                      */
/* TWO SOURCES, KEPT APART (the licence rework, §0.5). Sipply's server  */
/* holds only Apple's Place ID and each poster's label, so the page's   */
/* own words come from there: the title is the newest label, and the    */
/* counts and the grid are Sipply's posts. Everything of Apple's (the   */
/* address, the kind of place, the pin, Maps) is asked of Apple live,   */
/* by the Place ID, when the page opens (lib/placeSearch's              */
/* resolvePlace), held in memory for the session only, and drawn only   */
/* beside Apple's map, never on its own (DPLA Attachment 6 §2.4). The   */
/* map draws Apple's logo and Legal link itself; the footer credits     */
/* Apple in words as well, and only when Apple's details are showing.   */
/*                                                                      */
/* WHEN APPLE CANNOT ANSWER (iOS before 18 has no Place IDs, the build  */
/* has no module, offline, or Apple no longer knows the id), the page   */
/* is still whole: the label, the counts and the drinks. The map's      */
/* space is held while the look-up runs where one can, so the grid does */
/* not jump when it lands, and let go if none comes.                    */
/*                                                                      */
/* WHAT IT NEVER SAYS (App Store 1.4.3). No deals, prices, hours or     */
/* ratings; no "Post a drink here" key, because a venue's page must not */
/* read as an invitation to drink there (the drink page's own Post key  */
/* stays the one way to post); no counts on the tiles, and none ranks   */
/* anything. The header's count is distinct PEOPLE and distinct drinks, */
/* never pours or amounts.                                              */
/*                                                                      */
/* A pushed screen, so no pen marks (v4.6 A.4) and no red. The bar's    */
/* title is the place's name only once the header's own name has gone  */
/* under it, and its rule shows then too.                               */
/*                                                                      */
/* Nobody you have blocked, or who has blocked you, is counted or shown */
/* (place_drinks leaves them out on the server); a place whose every    */
/* visible tag is gone reads as unavailable, since Sipply has nothing   */
/* else of its own about it.                                            */
/* ==================================================================== */

/** Between the grid's three columns and its rows: the Dex grid's rhythm. */
const GRID_GAP = space.md;
const COLUMNS = 3;
/** Dynamic Type cap for a tile's name, as the Dex grid's. */
const TILE_NAME_CAP = 1.3;
/** The map across the column at 2:1 (408 x 204 at 440): a few streets, Apple's logo and Legal clear. */
const MAP_ASPECT = 2;

/** "12 different drinks, posted by 9 people"; "1 drink", "1 person". */
function countLine(drinks: number, people: number): string {
  const d = drinks === 1 ? '1 drink' : `${formatCount(drinks)} different drinks`;
  const p = people === 1 ? '1 person' : `${formatCount(people)} people`;
  return `${d}, posted by ${p}`;
}

/**
 * Case, diacritics and spacing aside: whether Apple's name says the same
 * as the label. The combining-mark range is escaped, as PlaceSearchSheet's
 * fold: typed literally it is invisible.
 */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Apple's line under the map: Apple's own name when it differs from the
 * label people gave the place (so a joke or a stale label never stands
 * alone beside the map), then the kind, then the address (else the area).
 */
function appleLine(apple: ResolvedPlace, label: string): string {
  return [
    fold(apple.name) === fold(label) ? null : apple.name,
    apple.category ? PLACE_CATEGORY_LABEL[apple.category] : null,
    apple.address ?? apple.locality,
  ]
    .filter(Boolean)
    .join(' · ');
}

type Apple =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'ready'; place: ResolvedPlace }
  | { status: 'none' }
  | { status: 'failed' };

/**
 * Apple's side of the page, by Place ID: what this session already holds
 * at once (a revisit, or the place just tagged), else one look-up. 'off'
 * where no look-up can run (no module, before iOS 18). `retry` asks again
 * after a failure (the pull to refresh); an answer in hand is kept.
 */
function useApplePlace(appleId: string, enabled: boolean): [Apple, () => void] {
  const can = enabled && placeSearchAvailable();
  const initial = (): Apple => {
    if (!can) return { status: 'off' };
    const held = cachedPlace(appleId);
    if (held === undefined) return { status: 'loading' };
    return held ? { status: 'ready', place: held } : { status: 'none' };
  };
  const [apple, setApple] = useState<Apple>(initial);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!can) return;
    let alive = true;
    resolvePlace(appleId).then(
      (place) => {
        if (alive) setApple(place ? { status: 'ready', place } : { status: 'none' });
      },
      () => {
        if (alive) setApple((was) => (was.status === 'ready' ? was : { status: 'failed' }));
      },
    );
    return () => {
      alive = false;
    };
  }, [appleId, can, attempt]);

  const retry = useCallback(() => {
    setApple((was) => (was.status === 'failed' ? { status: 'loading' } : was));
    setAttempt((n) => n + 1);
  }, []);
  return [apple, retry];
}

export function PlacePage({ id, valid, onBack }: { id: string; valid: boolean; onBack: () => void }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const entry = usePlaces((s) => (valid ? s.byPlace[id] : undefined));
  const loadPlace = usePlaces((s) => s.loadPlace);
  const [apple, retryApple] = useApplePlace(id, valid);

  /* The rows, and each visit's refresh of them. */
  useFocusEffect(
    useCallback(() => {
      if (valid) void loadPlace(id);
    }, [id, loadPlace, valid]),
  );

  /*
   * Pull to refresh. The store keeps what it holds when a refresh fails
   * (its state stays 'ready') and marks it `refreshFailed`, so the page
   * stays and a line over it says the refresh did not land. A look-up of
   * Apple's side that failed is asked again with it.
   */
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (!valid) return;
    setRefreshing(true);
    if (apple.status === 'failed') retryApple();
    try {
      await loadPlace(id);
    } finally {
      setRefreshing(false);
    }
  };
  const staleRefresh = entry?.state === 'ready' && !!entry.refreshFailed;

  /*
   * The bar's title shows once the header's name has gone under the bar.
   * The name's foot is measured inside the head, and the head's own top
   * inside the list's header, and the two are added: the "Could not
   * refresh" notice, when it shows, sits above the head and pushes the
   * name down by its own height.
   */
  const [headTop, setHeadTop] = useState(0);
  const [nameFootInHead, setNameFootInHead] = useState(space.md + textRole.title.lineHeight);
  const [past, onScroll] = useScrolledPast(headTop + nameFootInHead);

  const page = entry?.data ?? null;
  const place = page?.place ?? null;

  const bar = (
    <ScreenTopBar
      title={place?.label ?? 'Place'}
      titleVisible={past && !!place}
      showRule={past}
      left={<TopBarButton icon="chevronLeft" label="Back" onPress={onBack} />}
    />
  );

  /* ---- States without a page ---- */

  if (!valid || entry?.state === 'missing' || (entry?.state === 'ready' && !place)) {
    return (
      <View style={styles.screen}>
        {bar}
        <View style={styles.center}>
          <EmptyState
            icon="pin"
            title="Place unavailable"
            body="This place isn't on Sipply any more."
            action={{ label: 'Back', onPress: onBack }}
            actionVariant="secondary"
          />
        </View>
      </View>
    );
  }
  if (!page || !place) {
    return (
      <View style={styles.screen}>
        {bar}
        <View style={styles.center}>
          {entry?.state === 'failed' ? (
            <EmptyState
              icon="alert"
              title="Could not load this place"
              body="Check your connection and try again."
              action={{ label: 'Try again', onPress: () => void loadPlace(id) }}
              actionVariant="secondary"
            />
          ) : (
            <Hold fill={false} slowMessage="Still loading this place." />
          )}
        </View>
      </View>
    );
  }

  /* ---- The page ---- */

  const column = width - 2 * layout.gutter;
  const mapHeight = Math.round(column / MAP_ASPECT);
  const tile = (column - (COLUMNS - 1) * GRID_GAP) / COLUMNS;
  const rows = chunk(page.drinks, COLUMNS);
  const resolved = apple.status === 'ready' && placeMapAvailable() ? apple.place : null;
  // The map's room, held while Apple is asked, so the grid does not move when the map lands.
  const holdMapRoom = apple.status === 'loading' && placeMapAvailable();
  const appleWords = resolved ? appleLine(resolved, place.label) : '';

  const header = (
    <View>
      {staleRefresh ? (
        <Notice tone="error" style={styles.notice}>
          Could not refresh. Pull down to try again.
        </Notice>
      ) : null}
      <View
        style={styles.head}
        onLayout={(e) => {
          const top = Math.round(e.nativeEvent.layout.y);
          setHeadTop((prev) => (prev === top ? prev : top));
        }}>
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          onLayout={(e) => {
            const foot = Math.round(e.nativeEvent.layout.y + e.nativeEvent.layout.height);
            setNameFootInHead((prev) => (prev === foot ? prev : foot));
          }}
          style={[textRole.title, styles.ink]}>
          {place.label}
        </Text>
        {page.drinks.length > 0 ? (
          <Text style={[textRole.small, styles.muted, tabular, styles.metaLine]}>
            {countLine(page.drinks.length, page.peopleHere)}
          </Text>
        ) : null}
        {resolved ? (
          <>
            {/* Apple's map, then Apple's words under it: the address is never shown without its map (§2.4). */}
            <View style={styles.map}>
              <PlaceMap lat={resolved.lat} lng={resolved.lng} name={resolved.name} width={column} height={mapHeight} />
            </View>
            {appleWords ? (
              <Text numberOfLines={2} style={[textRole.small, styles.muted, styles.appleLine]}>
                {appleWords}
              </Text>
            ) : null}
            <Button
              label="Open in Apple Maps"
              variant="secondary"
              size="sm"
              icon="pin"
              onPress={() => void openApple(resolved)}
              accessibilityHint="Opens this place in Apple Maps"
              style={styles.mapsKey}
            />
          </>
        ) : holdMapRoom ? (
          <View
            style={[styles.map, styles.mapRoom, { height: mapHeight }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ) : null}
      </View>
      {page.drinks.length > 0 ? (
        <Text accessibilityRole="header" style={[textRole.sectionTitle, styles.ink, styles.gridHead]}>
          Drinks people have had here
        </Text>
      ) : (
        <Text style={[textRole.small, styles.muted, styles.nothing]}>Nothing posted here yet.</Text>
      )}
    </View>
  );

  return (
    <View style={styles.screen}>
      {bar}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.map((d) => d.drinkId).join('|')}
        renderItem={({ item }) => (
          <View style={styles.gridRow}>
            {item.map((d) => (
              <PlaceDrinkTile
                key={d.drinkId}
                item={d}
                size={tile}
                onOpen={(drinkId) => router.push({ pathname: '/drink/[id]', params: { id: drinkId } })}
              />
            ))}
          </View>
        )}
        ListHeaderComponent={header}
        ListFooterComponent={
          resolved ? (
            <Text style={[textRole.small, styles.muted, styles.footer]}>Place details from Apple Maps</Text>
          ) : (
            <View style={styles.footerSpace} />
          )
        }
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.textMuted} />
        }
        initialNumToRender={6}
        windowSize={7}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

/**
 * Apple Maps natively (the venue's own card by Apple's id on iOS 18 and
 * later, else a pin with its name), and the long-standing maps.apple.com
 * link only if Maps would not open that way. Both from Apple's live
 * answer: Sipply holds no position to open.
 */
async function openApple(place: ResolvedPlace): Promise<void> {
  haptic.tap();
  const opened = await openInAppleMaps(place).catch(() => false);
  if (!opened) await Linking.openURL(appleMapsUrl(place)).catch(() => {});
}

/**
 * One drink had here: its print (the newest photo tagged here, else the
 * drink's own daylight print, else the no-photo face), then its name under
 * it. No count on the tile ("less stuff"; the header says how many), and
 * the spoken label carries it instead.
 */
const PlaceDrinkTile = React.memo(function PlaceDrinkTile({
  item,
  size,
  onOpen,
}: {
  item: PlaceDrink;
  size: number;
  onOpen: (drinkId: string) => void;
}) {
  /*
   * `undefined` while signing: the print holds its wash, and only a photo
   * that will not sign (`null`) falls back to the drink's own face, as the
   * profile grid's tiles do. The signed URL comes from the shared cache, so
   * a tile scrolled back into view paints at once.
   */
  const photoUrl = useSignedPhoto(item.photoPath);
  const drink = getDrink(item.drinkId);
  // place_drinks rows for drinks not in this build are dropped by lib/places; this keeps a stray one from crashing.
  if (!drink) return null;
  const px = Math.round(size);
  const waiting = !!item.photoPath && photoUrl === undefined;

  return (
    <PressableScale
      noHaptic
      unstable_pressDelay={120}
      onPress={() => {
        haptic.tap();
        onOpen(drink.id);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${drink.name}, had here by ${item.people === 1 ? '1 person' : `${formatCount(item.people)} people`}`}
      accessibilityHint="Opens the drink"
      style={{ width: size }}>
      <Print width={size} height={size}>
        {waiting ? null : (
          /*
           * DrinkFace decodes at the tile's own size and keys its cache by
           * the storage path and the size (rule 9), so the same photo drawn
           * full width on a post is never handed this tile's small decode.
           */
          <DrinkFace
            drink={drink}
            mode="photo"
            photoUri={photoUrl ?? null}
            photoCacheKey={item.photoPath}
            width={px}
            height={px}
            style={FACE_FILL}
          />
        )}
      </Print>
      <DrinkName
        name={drink.name}
        role={textRole.name}
        measure={size}
        cap={TILE_NAME_CAP}
        color={colors.text}
        style={styles.tileName}
      />
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center' },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  content: { paddingBottom: space.xxxl },
  notice: { marginHorizontal: layout.gutter, marginTop: space.md },

  /* The header at the gutter, 12 under the bar. */
  head: { paddingHorizontal: layout.gutter, paddingTop: space.md },
  metaLine: { marginTop: space.xs },
  /* The map 16 under the words, Apple's line 8 under the map; the key 12 under that, hugging its label. */
  map: { marginTop: space.lg },
  /* While Apple is asked: the map's own wash, at the map's size, so nothing below moves when it lands. */
  mapRoom: { backgroundColor: colors.bgSunk },
  appleLine: { marginTop: space.sm },
  mapsKey: { alignSelf: 'flex-start', marginTop: space.md },

  gridHead: { marginTop: layout.section, marginBottom: space.md, paddingHorizontal: layout.gutter },
  nothing: { marginTop: layout.section, paddingHorizontal: layout.gutter },

  /* Three to a row inside the gutters, 12 apart; a short last row stays left. */
  gridRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
    paddingHorizontal: layout.gutter,
    marginBottom: GRID_GAP,
  },
  tileName: { marginTop: space.sm },

  footer: { textAlign: 'center', marginVertical: space.xl, paddingHorizontal: layout.gutter },
  footerSpace: { height: space.xl },
});
