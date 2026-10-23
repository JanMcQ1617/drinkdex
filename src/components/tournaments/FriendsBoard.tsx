import { Image } from 'expo-image';
import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Print } from '@/components/cabinet';
import { PenRule } from '@/components/details/PenMarks';
import { PEN, PEN_SEED } from '@/components/details/penPath';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Icon } from '@/components/icons';
import { ScreenTopBar, useScrolledPast } from '@/components/ScreenTopBar';
import { TournamentCard, type CardPerson } from '@/components/tournaments/TournamentCard';
import { ordinal, rowKind, TournamentRules } from '@/components/tournaments/TournamentRow';
import { Avatar, Button, EmptyState, Hold, Notice, SectionHeader } from '@/components/ui';
import { colors, fonts, layout, motion, radius, space, tabular, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import { photoFor } from '@/data/drinkPhotos';
import { fetchProfiles } from '@/lib/social';
import { newTournamentHref, tournamentHref, tournamentsHref } from '@/lib/tournaments';
import { useSignedPhoto } from '@/lib/useSignedPhoto';
import { useAuth } from '@/store/auth';
import { useFriendsBoard } from '@/store/friendsBoard';
import { mergeProfiles, useSocial } from '@/store/social';
import { useTournaments } from '@/store/tournaments';
import type { FriendStanding, TournamentSummary } from '@/types';

/* ==================================================================== */
/* The Tournaments tab: the Friends board (specs/v4.7/spec.md 2)        */
/*                                                                      */
/* Jan, 23 Oct 2026: "the tournament tab … where the users can see a    */
/* whole table of all the drinks their friends have registered". It sat */
/* on the red key in the middle of the bar in build 30; the same day he */
/* gave the middle to the Dex, so it is the trophy, second in the bar.  */
/* Two halves, top to bottom:                                           */
/*                                                                      */
/*   TOURNAMENTS. "Host a tournament" first (he asked for it on top),   */
/*   then a card per tournament on now that you host or joined, ending  */
/*   soonest first, at most five, and a quiet "All tournaments ›" line  */
/*   that opens the full list (/tournaments), where invitations are     */
/*   answered and finished ones live. One card spans the column; two or */
/*   more scroll sideways at 300 with the next one peeking in, so the   */
/*   Friends rows start high enough for six to show.                    */
/*                                                                      */
/*   FRIENDS. You and everyone you follow, ranked by how many DIFFERENT */
/*   drinks each has posted (migration 025): rank, face, username, the  */
/*   count and their latest three prints. A row opens that profile.     */
/*                                                                      */
/* WHAT THE COUNT IS (App Review 1.4.3). Each person's Dex lives on     */
/* their phone, so the honest figure is their posts: one post is one    */
/* drink (007), counted once, ever, catalogue drinks only (a custom     */
/* drink's u_ id is left out, as tournaments leave it out), so it can   */
/* sit below Profile's "N posts". Never an amount, never per day, never */
/* reset, so nothing to keep up and no streak. The screen calls them    */
/* entries, and the foot says what is counted, beside the tournaments'  */
/* own rules.                                                           */
/*                                                                      */
/* TIES. On a card the server breaks a tie by who got there first, so   */
/* ranks run 1, 2, 3. Here a tie is only a tie: 1, 2, 3, 3, 5, and the  */
/* spoken label says "tied". Nobody at nought has a rank.               */
/*                                                                      */
/* YOU, three ways and never by colour alone: the wash under your row,  */
/* " (you)" after your name, and ", you" spoken (Leaderboard's rule).   */
/*                                                                      */
/* THE BOARD RULE (v4.7 6.1 #10): the logo's pen draws one hairline     */
/* between the halves, as the Dex's head rule ends a head. Only when    */
/* both halves are drawn: with one there is nothing to separate. The    */
/* tab's other mark is the swash under its title (ScreenTopBar).        */
/*                                                                      */
/* WHEN THE SERVER IS BEHIND. Without 025 the Friends half (its head,   */
/* rows, foot sentence and the rule) is left out with no error; without */
/* 020 the tournaments half is. Neither: the full list's own "not here  */
/* yet". Each store asks again on the next focus, so applying a         */
/* migration needs no new build.                                        */
/*                                                                      */
/* Less stuff: no panels round the rows and no rules between them, rows */
/* on the page set apart by space (layout principle 3). Nothing here    */
/* animates, so a scroll costs the rows nothing.                        */
/* ==================================================================== */

/** At most this many cards, and boards asked for on each focus. */
const CARDS_MAX = 5;
/** A card in a row of them; the next one peeks past the far gutter. */
const CARD_W = 300;
const CARD_GAP = space.md;
/*
 * Above this text size the cards stack full width and a row's prints drop
 * under its name: side by side, from the accessibility sizes up, there is
 * no room for either (TournamentRow's STACK_SCALE).
 */
const STACK_SCALE = 1.3;

/** A Friends row (spec 2.5): 64 tall, rank 28, face 40, prints 40 x 40 four apart. */
const ROW_H = 64;
const RANK_COL = 28;
const FACE = 40;
const PRINT = 40;
const PRINT_GAP = space.xs;
const PRINTS = 3;
/** Your row's wash reaches this far past the gutter each side (x 16 to 424 at 440). */
const BLEED = space.sm;
/** The board rule's band: its centreline is the band's middle. */
const BAND = space.xl;
const CHEVRON = 16;

/** SectionHeader's group size pads 16 each side; this puts its words at x 24. */
const HEAD_INSET = layout.gutter - space.lg;

const time = (iso: string) => Date.parse(iso);

/** On now, in one you host or joined (the full list's "On now"): ending soonest first. */
function liveOf(list: readonly TournamentSummary[]): TournamentSummary[] {
  return list
    .filter((t) => rowKind(t) === 'live')
    .sort((a, b) => time(a.endsAt) - time(b.endsAt))
    .slice(0, CARDS_MAX);
}

/** "42 entries", "1 entry", "No entries yet": the catalogue's word, as Profile's Dex line says it. */
function entriesLine(n: number): string {
  if (n <= 0) return 'No entries yet';
  return `${formatCount(n)} ${n === 1 ? 'entry' : 'entries'}`;
}

/**
 * Resolves once no tournaments load is in flight. load() returns early,
 * writing nothing, when a newer load has started (its numbered-load guard),
 * so "my load returned" is not "the list is answered": a pull during the
 * first focus load would otherwise call the empty list answered and flash
 * "Nothing on now" before the newer load's cards arrive. reset() clears
 * `loading` too, so this never waits on a signed-out store.
 */
function tournamentsSettled(): Promise<void> {
  return new Promise((resolve) => {
    if (!useTournaments.getState().loading) return resolve();
    const stop = useTournaments.subscribe((s) => {
      if (s.loading) return;
      stop();
      resolve();
    });
  });
}

/**
 * Asks the server for everything the tab shows: the tournaments list,
 * then each card's board (in parallel, at most five), and the Friends
 * board beside them. Resolves when all have answered; never rejects (each
 * store keeps what it had and says so in `failed`). `onTournaments` runs
 * once the newest tournaments load has written, never on a superseded one.
 */
async function refreshAll(onTournaments?: () => void): Promise<void> {
  const tournaments = (async () => {
    const t = useTournaments.getState();
    await t.load();
    await tournamentsSettled();
    onTournaments?.();
    const s = useTournaments.getState();
    if (!s.supported) return;
    await Promise.all(liveOf(s.list).map((x) => s.loadBoard(x.id).catch(() => undefined)));
  })();
  await Promise.all([tournaments, useFriendsBoard.getState().load()]);
}

export function FriendsBoard({ myId }: { myId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const stacked = fontScale > STACK_SCALE;

  const tSupported = useTournaments((s) => s.supported);
  const list = useTournaments((s) => s.list);
  const tFailed = useTournaments((s) => s.failed);
  const boards = useTournaments((s) => s.boards);
  const pendingInvites = useTournaments((s) => s.pendingInvites);

  const fSupported = useFriendsBoard((s) => s.supported);
  const rows = useFriendsBoard((s) => s.rows);
  const fFailed = useFriendsBoard((s) => s.failed);
  const fLoaded = useFriendsBoard((s) => s.loaded);

  const profiles = useSocial((s) => s.profiles);
  const me = useAuth((s) => (s.profile?.id === myId ? s.profile : null));

  const [scrolled, onScroll] = useScrolledPast();
  const listRef = useRef<FlatList<FriendStanding>>(null);
  useScrollToTop(listRef);

  /*
   * True once this screen's own first tournaments load has answered.
   * Until then an empty list is "not asked yet", never "Nothing on now";
   * a list another screen already loaded shows at once.
   */
  const [tAsked, setTAsked] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void refreshAll(() => {
        if (alive) setTAsked(true);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  const refresh = async () => {
    setRefreshing(true);
    await refreshAll(() => setTAsked(true));
    setRefreshing(false);
  };

  const live = tSupported ? liveOf(list) : [];
  const anyTournament = list.some((t) => rowKind(t) !== null);
  const comingUp = list.filter((t) => rowKind(t) === 'upcoming').length;

  /*
   * The names on the cards' top three. Most are people you follow, so the
   * Friends rows answer them; the rest come from the social store, and any
   * still missing are read once and merged into it, as the full list does,
   * only while the same account is signed in. A failed read leaves them
   * "Someone".
   */
  const fromBoard = new Map(rows.map((r) => [r.userId, r] as const));
  const personOf = (id: string): CardPerson | undefined => {
    const r = fromBoard.get(id);
    if (r) return r;
    if (Object.prototype.hasOwnProperty.call(profiles, id)) return profiles[id];
    if (me && id === me.id) {
      return { username: me.username, displayName: me.display_name, accent: me.accent, avatarPath: me.avatar_path };
    }
    return undefined;
  };
  const wanted = [
    ...new Set(live.flatMap((t) => (boards[t.id]?.standings ?? []).slice(0, 3).map((s) => s.userId))),
  ]
    .filter((id) => !fromBoard.has(id) && id !== myId)
    .sort()
    .join(',');
  useEffect(() => {
    const held = useSocial.getState().profiles;
    const missing = wanted.split(',').filter((id) => id && !Object.prototype.hasOwnProperty.call(held, id));
    if (missing.length === 0) return;
    let alive = true;
    const gen = useSocial.getState().gen;
    fetchProfiles(missing).then(
      (people) => {
        if (!alive || useSocial.getState().gen !== gen) return;
        useSocial.setState((s) => ({ profiles: mergeProfiles(s.profiles, people) }));
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [wanted]);

  const openTournament = useCallback((id: string) => router.push(tournamentHref(id)), [router]);
  /* Someone else's profile pushes over the tabs; yours pages across to the Profile tab. */
  const openPerson = useCallback(
    (id: string) => {
      if (id === myId) router.navigate('/profile');
      else router.push({ pathname: '/user/[id]', params: { id } });
    },
    [router, myId],
  );

  const friendsShown = fSupported && (fLoaded || rows.length > 0);
  /*
   * The Hold stays until BOTH halves are known, not just the first to
   * answer: tournaments usually answer first, and drawing them with the
   * rules footer and then pushing the Friends head, rows and board rule in
   * above that footer reads as the screen jumping. A half the server lacks
   * (supported false) is known; a failed answer is known (it says so).
   */
  const tPending = tSupported && !tAsked && list.length === 0;
  const fPending = fSupported && !fLoaded && rows.length === 0;
  const firstVisit = tPending || fPending;

  // A tab root: the title set left (its swash is ScreenTopBar's own), nothing on the right.
  const top = <ScreenTopBar size="lg" title="Tournaments" showRule={scrolled} />;

  /* Both migrations missing: the full list's own words, and nothing else. */
  if (!tSupported && !fSupported) {
    return (
      <View style={styles.screen}>
        {top}
        <View style={styles.center}>
          <EmptyState
            icon="trophy"
            title="Tournaments are not here yet"
            body="They arrive with an update on our side. Nothing to do on yours."
          />
        </View>
      </View>
    );
  }

  /* ---- The header block: everything above the Friends rows ---- */

  const staleNotice = (tFailed && list.length > 0) || (fFailed && rows.length > 0);
  const quietDetail =
    pendingInvites > 0
      ? `${formatCount(pendingInvites)} ${pendingInvites === 1 ? 'invitation' : 'invitations'}`
      : comingUp > 0
        ? `${formatCount(comingUp)} coming up`
        : undefined;
  const cardsInRow = live.length > 1 && !stacked;
  const fullCard = width - 2 * layout.gutter;
  /*
   * The board rule (spec 2.4) needs both halves drawn, and never sits
   * under an error line: with nothing cached and the tournaments load
   * failed, the half above it is "Could not load tournaments…", and a red
   * pen mark under an error is on v4.6's never list (A.4).
   */
  const tErrorLine = tFailed && !anyTournament;
  const bandShown = tSupported && friendsShown && !firstVisit && !tErrorLine;

  const header = (
    <View style={styles.head}>
      {staleNotice ? (
        <Notice tone="error" style={styles.notice}>
          Could not refresh. Pull down to try again.
        </Notice>
      ) : null}

      {tSupported ? (
        <Button
          label="Host a tournament"
          variant="secondary"
          icon="plus"
          block
          onPress={() => router.push(newTournamentHref())}
          style={styles.host}
        />
      ) : null}

      {tSupported && !firstVisit ? (
        live.length > 0 ? (
          <>
            <SectionHeader title="On now" size="group" style={styles.groupHead} />
            {cardsInRow ? (
              <ScrollView
                horizontal
                contentContainerStyle={styles.cardRow}
                snapToInterval={CARD_W + CARD_GAP}
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}>
                {live.map((t) => (
                  <TournamentCard
                    key={t.id}
                    tournament={t}
                    board={boards[t.id]}
                    myId={myId}
                    personOf={personOf}
                    onOpen={openTournament}
                    style={{ width: CARD_W }}
                  />
                ))}
              </ScrollView>
            ) : (
              <View style={styles.cardStack}>
                {live.map((t) => (
                  <TournamentCard
                    key={t.id}
                    tournament={t}
                    board={boards[t.id]}
                    myId={myId}
                    personOf={personOf}
                    onOpen={openTournament}
                    style={{ width: fullCard }}
                  />
                ))}
              </View>
            )}
          </>
        ) : null
      ) : null}

      {tSupported && !firstVisit ? (
        anyTournament ? (
          /*
           * Profile's old quiet line exactly: one 44pt row, the word at the
           * left and what is waiting at the chevron, one button to
           * VoiceOver ("All tournaments, 1 invitation"). An invitation is
           * said before what is coming up: it is the one that asks you
           * something.
           */
          <Pressable
            onPress={() => router.push(tournamentsHref())}
            accessibilityRole="button"
            accessibilityLabel={quietDetail ? `All tournaments, ${quietDetail}` : 'All tournaments'}
            accessibilityHint="Opens every tournament, invitations included"
            style={({ pressed }) => [styles.quietLine, live.length === 0 && styles.quietFirst, pressed && styles.dimmed]}>
            <View style={styles.lineText}>
              <Text style={[styles.quiet, styles.lineWord]}>All tournaments</Text>
              {quietDetail ? <Text style={[styles.quiet, styles.lineWord]}>{quietDetail}</Text> : null}
            </View>
            <Icon name="chevronRight" size={CHEVRON} color={colors.textMuted} />
          </Pressable>
        ) : tFailed ? (
          <Text style={styles.nothing}>Could not load tournaments. Pull down to try again.</Text>
        ) : (
          /*
           * 12 more under it when the rule follows, so the rule has 24 clear
           * above as it has under the quiet line: at the band's own 12 it
           * read as this sentence's underline, a mark on body text.
           */
          <Text style={[styles.nothing, bandShown && styles.nothingOverRule]}>
            Nothing on now. A tournament is a shared log of the Dex entries you and people you follow post
            between two dates.
          </Text>
        )
      ) : null}

      {/*
        The board rule: a 24pt band that ends the tournaments half, the pen's
        hairline on its middle (spec 2.4). 12 clear of the text above and of
        the Friends head below. A static path, cached by its length.
      */}
      {bandShown ? (
        <View style={styles.band} accessible={false} importantForAccessibility="no-hide-descendants">
          <PenRule
            length={fullCard}
            seed={PEN_SEED.board}
            style={{ position: 'absolute', left: 0, top: BAND / 2 - PEN.rule.mid }}
          />
        </View>
      ) : null}

      {friendsShown ? (
        <>
          <SectionHeader
            title="Friends"
            size="group"
            style={[
              styles.groupHead,
              bandShown ? styles.friendsHead : tSupported ? null : styles.friendsHeadAlone,
            ]}
          />
          {fFailed && rows.length === 0 ? (
            <Text style={styles.nothing}>Could not load. Pull down to try again.</Text>
          ) : null}
        </>
      ) : null}

      {firstVisit ? (
        <View style={styles.hold}>
          <Hold fill={false} slowMessage="Still loading tournaments and friends." />
        </View>
      ) : null}
    </View>
  );

  /* You follow nobody: the table is your row alone, and a way to find people under it. */
  const followsNobody = friendsShown && fLoaded && !fFailed && rows.every((r) => r.userId === myId);

  const footer = (
    <View>
      {followsNobody ? (
        <View style={styles.lonely}>
          <Text style={styles.footText}>Follow people to see how many different drinks each has posted.</Text>
          <Pressable
            onPress={() => router.push('/find-friends')}
            accessibilityRole="button"
            accessibilityLabel="Find people to follow"
            style={({ pressed }) => [styles.findLine, pressed && styles.dimmed]}>
            <Text style={styles.find}>Find people to follow</Text>
            <Icon name="chevronRight" size={CHEVRON} color={colors.text} />
          </Pressable>
        </View>
      ) : null}
      {/* What is counted, then the tournaments' own rules, in one Text (never only in a collapsed section). */}
      {!firstVisit && (friendsShown || tSupported) ? (
        <Text style={[styles.footText, styles.rules]}>
          {friendsShown ? 'Friends shows how many different drinks each person has posted, each counted once. ' : ''}
          {tSupported ? <TournamentRules style={styles.footText} /> : null}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      {top}
      <FlatList
        ref={listRef}
        data={friendsShown ? rows : []}
        keyExtractor={(r) => r.userId}
        renderItem={({ item }) => (
          <FriendRow row={item} mine={item.userId === myId} stacked={stacked} onOpen={openPerson} />
        )}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.textMuted} />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

/* ==================================================================== */
/* A Friends row                                                        */
/* ==================================================================== */

/**
 * One person: rank, face, username and their count, and their latest
 * three prints at the far gutter. The whole row is one button; the prints
 * are silent. Memoised on the row object, which the store replaces only
 * when an answer arrives, so a scroll re-renders nothing.
 */
const FriendRow = React.memo(function FriendRow({
  row,
  mine,
  stacked,
  onOpen,
}: {
  row: FriendStanding;
  mine: boolean;
  stacked: boolean;
  onOpen: (id: string) => void;
}) {
  const ranked = row.place !== null && row.entries > 0;
  const spoken = [
    ranked ? ordinal(row.place!) : null,
    ranked && row.tied ? 'tied' : null,
    row.username,
    mine ? 'you' : null,
    row.entries > 0 ? entriesLine(row.entries) : 'no entries yet',
  ]
    .filter(Boolean)
    .join(', ');

  const prints =
    row.entries > 0 && row.latest.length > 0 ? (
      <View style={[styles.prints, stacked && styles.printsStacked]}>
        {/* Newest first from the left; fewer than three leave the empty page, so the column's left edge holds. */}
        {Array.from({ length: PRINTS }, (_, i) => {
          const p = row.latest[i];
          return p ? (
            <BoardPrint key={`${p.drinkId}:${i}`} drinkId={p.drinkId} photoPath={p.photoPath} />
          ) : (
            <View key={`empty-${i}`} style={styles.printSlot} />
          );
        })}
      </View>
    ) : null;

  return (
    <Pressable
      onPress={() => onOpen(row.userId)}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={mine ? 'Opens your profile' : 'Opens their profile'}
      style={({ pressed }) => [
        styles.row,
        stacked && styles.rowStacked,
        mine && styles.mine,
        pressed && styles.pressed,
      ]}>
      <Text
        style={styles.rank}
        maxFontSizeMultiplier={1.3}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}>
        {ranked ? row.place : ''}
      </Text>
      <Avatar name={row.displayName} accent={row.accent} size={FACE} avatarPath={row.avatarPath} />
      <View style={styles.who}>
        {/* The username, not the display name: what people know each other by here, and what the cards show. */}
        <Text numberOfLines={1} style={styles.username}>
          {row.username}
          {mine ? <Text style={styles.you}> (you)</Text> : null}
        </Text>
        <Text style={styles.count}>{entriesLine(row.entries)}</Text>
        {stacked ? prints : null}
      </View>
      {stacked ? null : prints}
    </Pressable>
  );
});

/**
 * One of a person's latest posts, 40 x 40: the post's own photo, else the
 * drink's stock photo, else the wash. Decoded at the frame's size: a
 * photo stored at up to 2048px in a 40pt print would otherwise hold a
 * full-size decode per print (build 13's lag fix). Decorative.
 */
function BoardPrint({ drinkId, photoPath }: { drinkId: string; photoPath: string | null }) {
  const url = useSignedPhoto(photoPath);
  const stock = photoFor(drinkId);
  const source = url
    ? { uri: url, cacheKey: photoPath ? `${photoPath}#${PRINT}x${PRINT}` : undefined }
    : url === undefined && photoPath
      ? null // still signing: the print's wash, not a flash of the stock photo
      : (stock ?? null);
  return (
    <Print width={PRINT} height={PRINT} style={styles.print}>
      {source ? (
        <Image
          accessibilityIgnoresInvertColors
          accessible={false}
          source={source}
          recyclingKey={photoPath ?? drinkId}
          cachePolicy="disk"
          enforceEarlyResizing
          contentFit="cover"
          transition={motion.fast}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </Print>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center' },

  /* The header block: the bar ends at y 114, the Host key starts at 130. */
  head: { paddingTop: space.lg },
  notice: { marginHorizontal: layout.gutter, marginBottom: space.lg },
  host: { marginHorizontal: layout.gutter },
  /* A group head insets its own 16 (it was drawn for a panel), so this lands its words on the gutter. */
  groupHead: { marginTop: space.xl, marginBottom: space.sm, marginHorizontal: HEAD_INSET },
  cardRow: { paddingHorizontal: layout.gutter, gap: CARD_GAP },
  cardStack: { paddingHorizontal: layout.gutter, gap: CARD_GAP },

  quietLine: {
    minHeight: layout.hit,
    marginHorizontal: layout.gutter,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  /* With no card above it, it sits 12 under the Host key, as the empty sentence does. */
  quietFirst: { marginTop: space.md },
  quiet: { ...textRole.small, color: colors.textMuted },
  /*
   * The word at the left and the state at the chevron; when Larger Text
   * leaves no room for both, the state drops to a line of its own, never
   * splitting "All tournaments" (Profile's old line's rule).
   */
  lineText: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    columnGap: space.sm,
  },
  lineWord: { flexShrink: 1 },
  dimmed: { opacity: 0.5 },
  nothing: { ...textRole.small, color: colors.textMuted, marginTop: space.md, marginHorizontal: layout.gutter },
  nothingOverRule: { marginBottom: space.md },

  band: { height: BAND, marginHorizontal: layout.gutter },
  /*
   * 4 under the band (12 from the rule's line), 8 over the first row. With
   * no band (the error line above), the group head's own 24 applies.
   */
  friendsHead: { marginTop: space.xs },
  /* Without tournaments the Friends head is the first thing under the bar. */
  friendsHeadAlone: { marginTop: 0 },
  hold: { paddingTop: space.xxxl },

  /* A Friends row: 64 tall, its content on the gutter, the row (and your wash) 8 past it each side. */
  row: {
    minHeight: ROW_H,
    marginHorizontal: layout.gutter - BLEED,
    paddingHorizontal: BLEED,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.control,
  },
  rowStacked: { alignItems: 'flex-start', paddingVertical: space.md },
  /* Ink 18.16:1 and muted 6.13:1 on the wash (check-contrast). */
  mine: { backgroundColor: colors.bgSunk },
  pressed: { backgroundColor: colors.press },
  rank: { ...textRole.count, width: RANK_COL, marginRight: space.sm, textAlign: 'right', color: colors.text },
  who: { flex: 1, marginLeft: space.md, marginRight: space.md },
  username: { ...textRole.bodyMedium, color: colors.text },
  you: { color: colors.textMuted },
  count: { ...textRole.small, ...tabular, color: colors.textMuted },
  prints: { flexDirection: 'row', gap: PRINT_GAP },
  printsStacked: { marginTop: space.sm },
  printSlot: { width: PRINT, height: PRINT },
  /* 2pt corners, like every small print; the edge is Print's own photoEdge inset. */
  print: { borderRadius: radius.badge },

  lonely: { marginTop: space.lg, marginHorizontal: layout.gutter },
  footText: { ...textRole.small, color: colors.textMuted },
  findLine: { minHeight: layout.hit, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  find: { ...textRole.small, fontFamily: fonts.bodyMedium, color: colors.text },
  rules: { marginTop: space.xl, marginHorizontal: layout.gutter },
});
