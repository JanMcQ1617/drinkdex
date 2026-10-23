import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CelebrationOverlay } from '@/components/CelebrationOverlay';
import { Icon } from '@/components/icons';
import { ComposeBar } from '@/components/log/ComposeBar';
import { PhotoSlot, PhotoSourceSheet, type PhotoSource } from '@/components/log/PhotoSource';
import { AddNewRow, ResultRow } from '@/components/log/ResultRow';
import { WithScrollEdges } from '@/components/log/scrollEdges';
import { TagPeopleRow } from '@/components/log/TagPeopleRow';
import { MusicPicker } from '@/components/MusicPicker';
import { SongArtwork } from '@/components/songs';
import { TagPeopleSheet } from '@/components/tags/TagPeopleSheet';
import { announce, Button, Field, haptic, SearchField } from '@/components/ui';
import { colors, layout, space, stroke, textRole } from '@/constants/theme';
import { formatCount, getDrink } from '@/data';
import { catalogueTwin, isCustomId, ownTwin, shortQuery, toDrink } from '@/lib/customDrinks';
import { styleLabel } from '@/lib/drinkLabels';
import { fold, MAX_RESULTS, rank, rankCustom, SEARCH_INDEX } from '@/lib/drinkSearch';
import { containsObjectionable, OBJECTIONABLE_MESSAGE } from '@/lib/moderation';
import { STORY_MUSIC } from '@/lib/music';
import {
  customPhotoUri,
  NOTE_MAX,
  persistPhoto,
  pickFromCamera,
  pickFromLibrary,
  reportPost,
  reportPostPhoto,
  type PickResult,
} from '@/lib/pour';
import { fetchMyPostTags, tagsSupported } from '@/lib/social';
import { latestDexIds } from '@/lib/tastes';
import { useAuth } from '@/store/auth';
import { useCelebrate } from '@/store/celebrate';
import { useCollection } from '@/store/collection';
import { customDrinkById, useCustomDrinks } from '@/store/customDrinks';
import { useSocial } from '@/store/social';
import type { CustomDrink, Drink, Song, UserProfile } from '@/types';
import { confirmDestructive, showNotice } from '@/utils/alerts';

/* ==================================================================== */
/* Post a drink                                                         */
/*                                                                      */
/* Posting's window, opened by Home's create key and every Post key     */
/* (v4.7: the tab bar's centre is the Dex key now, and no longer opens  */
/* it): a full-screen window that rises from the bottom                 */
/* (the root stack presents it as a fullScreenModal). v4 makes          */
/* it two plain steps (layout spec 5.6; Jan: "I want less stuff"):      */
/*                                                                      */
/*   FIND     the X and the search field in the one top row, and the    */
/*            results under it down to the keyboard: a print and a      */
/*            name per row, nothing else. The field has the cursor the  */
/*            moment the window opens. 18 elements mid-search, from 35. */
/*   COMPOSE  after picking: the drink's name as the bar's title, the   */
/*            photo (4:5 across the column), the caption, and Post at   */
/*            the foot with "Save to Dex only" under it. About 6.       */
/*                                                                      */
/* WHY FIND FIRST. v3.3 put the photo first and the search under it,    */
/* and the screen carried both at once: a print beside the field, a     */
/* counts line, plates and tags on every row, a collect preview. Now    */
/* each step shows only what that step needs, and the photo waits for   */
/* the step where it is the whole screen. Back from compose returns to  */
/* the search exactly as it was left (the query is kept), so changing   */
/* the drink is one tap and the chosen row carries a check.             */
/*                                                                      */
/* WHY THE RESULTS SIT ABOVE THE KEYBOARD. The field is pinned in the   */
/* top row and the list fills what the keyboard leaves (the KAV), so    */
/* the best matches are always under the field, never behind the keys   */
/* (Jan, build 17). The steps swap in one commit with no animation      */
/* (specs/v3.3-changes.md section 0): a stalled layout animation would  */
/* leave rows drawn over each other.                                    */
/*                                                                      */
/* A drink the Dex does not have can be added from here: the last row   */
/* of a search that names nothing reads "Add “neg” as a new drink" and  */
/* opens add-drink, which takes this window's photo along and hands the */
/* drink back chosen. A drink someone added is kept in their Dex, never */
/* posted: followers' phones look drinks up in the catalogue.           */
/*                                                                      */
/* With story music on (EXPO_PUBLIC_STORY_MUSIC), compose offers "Add   */
/* music" under the caption, and the song goes with Post only.          */
/*                                                                      */
/* TAG PEOPLE (v4.3 §1.2). Straight under the caption, one row names    */
/* who was with you and opens the picker (TagPeopleSheet). Only where   */
/* Post exists and the server has tags (migration 024): signed in, a    */
/* catalogue drink. The tags go with Post only, like the song; "Save to */
/* Dex only" keeps the drink and drops them, with no confirm, since not */
/* posting is the decision. A re-post starts from the post's own tags,  */
/* and Post writes the difference.                                      */
/* ==================================================================== */

/** Story music is on: "Add music" and its picker exist at all. */
const MUSIC_ON = STORY_MUSIC !== 'off';

/*
 * A denial is always the camera (the library needs no permission), and
 * the only fix for it is in Settings, so the alert carries the way there
 * rather than just naming it.
 */
function notice(r: Extract<PickResult, { ok: false; reason: 'denied' | 'error' }>) {
  if (r.reason === 'denied' && Platform.OS !== 'web') {
    Alert.alert(r.title, r.body, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => void Linking.openSettings() },
    ]);
    return;
  }
  showNotice(r.title, r.body);
}

/** Own keys only: the stores are plain objects, and 'constructor' is not a drink. */
function inDex(map: Record<string, unknown>, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, id);
}

/**
 * A drink by id, from the catalogue or from the drinks this person added
 * (as the adapter the rows draw with). Null for anything else.
 */
function resolveDrink(id: string | null | undefined): Drink | null {
  if (!id) return null;
  if (isCustomId(id)) {
    const c = customDrinkById(id);
    return c ? toDrink(c) : null;
  }
  return getDrink(id) ?? null;
}

/** Nobody tagged: one array, so "nobody" is the same value from render to render. */
const NOBODY: UserProfile[] = [];

/** The same people, whatever the order: a tag set changed or not. */
function samePeople(a: readonly UserProfile[], b: readonly UserProfile[]): boolean {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((p) => p.id));
  return b.every((p) => ids.has(p.id));
}

/* -------------------------------------------------------------------- */
/* Search                                                               */
/* -------------------------------------------------------------------- */

/** One result: a catalogue drink, or one this person added (`custom`). */
type Result = { drink: Drink; custom: CustomDrink | null };

/*
 * The catalogue's matches and this person's own, ranked together by one
 * measure: lib/drinkSearch's rank, shared with the add-a-drink form and a
 * reel's drink tag.
 *
 * Nothing from the index is listed until something is typed: the whole
 * index in dex order is a wall, and the one thing the user reliably knows
 * here is roughly what the drink was called. An empty field offers the
 * latest drinks in their own Dex instead (see `recent`).
 *
 * Every entry is ranked and the best MAX_RESULTS kept, rather than the
 * first MAX_RESULTS in dex order, so "vodka" reaches Vodka Soda. On a tie
 * their own drink goes first (someone who added "Mango Chili Margarita"
 * and types "mango" means theirs), then dex order; their own by name.
 */
function search(query: string, own: Record<string, CustomDrink>): { rows: Result[]; total: number } {
  const q = fold(query.trim());
  if (q.length === 0) return { rows: [], total: 0 };
  const hits: (Result & { r: number })[] = [];
  for (const c of Object.values(own)) {
    const r = rankCustom(c, q);
    if (r >= 0) hits.push({ r, drink: toDrink(c), custom: c });
  }
  for (const e of SEARCH_INDEX) {
    const r = rank(e, q);
    if (r >= 0) hits.push({ r, drink: e.drink, custom: null });
  }
  hits.sort(
    (a, b) =>
      a.r - b.r ||
      (a.custom ? 0 : 1) - (b.custom ? 0 : 1) ||
      (a.custom && b.custom
        ? a.drink.name.localeCompare(b.drink.name)
        : a.drink.dexNumber - b.drink.dexNumber),
  );
  return { rows: hits.slice(0, MAX_RESULTS), total: hits.length };
}

/** How many of the Dex's latest catches an empty search offers. */
const RECENT_MAX = 6;

/*
 * The find row (layout spec 5.6): the X's 24pt glyph at x 22 in its 44pt
 * box, and the field from x 64 to the far gutter (352 wide at 440).
 */
const CLOSE_GLYPH = 24;
const CLOSE_BOX_LEFT = 22 - (layout.hit - CLOSE_GLYPH) / 2;
const CLOSE_TO_FIELD = 64 - CLOSE_BOX_LEFT - layout.hit;

/**
 * The line under a name two results share, the only subtitle the results
 * keep: where it is from, else its style; a drink someone added says so.
 */
function twinLine(r: Result): string {
  if (r.custom) return 'Added by you';
  return r.drink.origin || styleLabel(r.drink.subcategory) || `Number ${r.drink.dexNumber}`;
}

/* -------------------------------------------------------------------- */

type Step = 'find' | 'compose';

export default function PostDrinkScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();

  /*
   * `/log?drink=<id>` opens with that drink chosen, straight into compose:
   * a Dex entry's or a custom drink's "Post this drink". Only the photo is
   * left to do, so a drink chosen this way is not work to discard on the
   * way out (see `dirty`).
   */
  const params = useLocalSearchParams<{ drink?: string }>();
  const preselectId = typeof params.drink === 'string' ? params.drink : null;

  const unlock = useCollection((s) => s.unlock);
  const unlocks = useCollection((s) => s.unlocks);
  const addPost = useSocial((s) => s.addPost);
  const addPhotoForDrink = useSocial((s) => s.addPhotoForDrink);
  const myId = useAuth((s) => s.session?.user.id);
  // The stable records; lists are derived below (zustand v5 rejects a
  // selector that builds a new array on every call).
  const customDrinks = useCustomDrinks((s) => s.drinks);
  const customPours = useCustomDrinks((s) => s.pours);

  const [drink, setDrink] = useState<Drink | null>(() => resolveDrink(preselectId));
  const [step, setStep] = useState<Step>(() => (resolveDrink(preselectId) ? 'compose' : 'find'));
  /*
   * The search. Kept when a result is picked, so Back from compose finds
   * the search as it was left, the chosen drink among its rows. A drink
   * that arrives chosen (the preselect, the add form's handoff) seeds it
   * with its own name, for the same reason.
   */
  const [query, setQuery] = useState(() => resolveDrink(preselectId)?.name ?? '');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [choosingSource, setChoosingSource] = useState(false);
  /** The caption. Still `note` in code: the Dex entry's field (UnlockRecord.note) keeps that name. */
  const [note, setNote] = useState('');
  /** Said under the caption when it would be refused. */
  const [noteError, setNoteError] = useState<string | null>(null);
  /** The song for this photo's story, sent with Post only. Never set while music is off. */
  const [song, setSong] = useState<Song | null>(null);
  const [pickingMusic, setPickingMusic] = useState(false);
  /*
   * Who was with you (v4.3 §1.2), per drink, since a re-post starts from
   * that post's own tags. `tagBase` is what the server holds on your post
   * of the drink (read once as compose opens it; nobody when there is no
   * post yet, or the read failed). `tagPick` is the person's choice, with
   * the base they saw when they made it (`prev`): Post writes the
   * difference between the two, so a base that arrives after a pick was
   * made is never removed by it, only left as it is.
   */
  const [tagBase, setTagBase] = useState<{ drinkId: string; people: UserProfile[] } | null>(null);
  const [tagPick, setTagPick] = useState<{
    drinkId: string;
    people: UserProfile[];
    prev: UserProfile[];
  } | null>(null);
  const [pickingTags, setPickingTags] = useState(false);
  /*
   * Whether the server has tags, as state: lib/social learns it from the
   * first read of post_tags, which may land after this window opened, and
   * a read in render would not wake it. Asked again after each read here.
   */
  const [tagsOn, setTagsOn] = useState(tagsSupported);
  /** Which key is saving, so only that one says so. */
  const [savingAs, setSavingAs] = useState<'dex' | 'post' | null>(null);
  /** Once the photo is saved: whether it went in new or as a re-log. */
  const [saved, setSaved] = useState<'new' | 'relog' | null>(null);
  const busy = savingAs !== null;
  const trimmed = query.trim();

  const searchRef = useRef<TextInput>(null);

  /*
   * Every keystroke puts the results back at their top. A FlatList keeps
   * its offset when its rows change, so after scrolling down (the drag
   * lowers the keyboard), the next letter's best matches would be above
   * the window. Instant: it is the same list answering a new question.
   */
  const findListRef = useRef<FlatList<Result>>(null);
  const onQueryChange = useCallback((text: string) => {
    setQuery(text);
    findListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  /** A drink this person added: kept in their Dex, never posted, never celebrated. */
  const isCustom = drink != null && isCustomId(drink.id);

  /*
   * Picking a drink you already have makes this an update, not a catch:
   * the entry keeps its date and takes the new photo, there is nothing to
   * celebrate, and posting adds the photo to the drink's post rather than
   * starting a second one. After the save it is read from what the save
   * was, not from the stores, which by then hold the drink just saved and
   * would flip a new entry's keys to a re-log's under its celebration.
   */
  const relog =
    drink != null &&
    (saved
      ? saved === 'relog'
      : isCustom
        ? inDex(customPours, drink.id)
        : inDex(unlocks, drink.id));

  /*
   * This window closes itself only once there is nothing left to show. It
   * is a native-stack modal, presented above the React root, so the root's
   * celebration would render underneath it: the window renders the
   * celebration itself and leaves when the queue is empty (both instances
   * read one queue, so the card never shows twice).
   */
  const pending = useCelebrate((s) => s.queue.length);

  const results = useMemo(() => search(query, customDrinks), [query, customDrinks]);

  /*
   * An empty search's rows: the newest catches in this Dex, newest first,
   * catalogue drinks only (lib/tastes), so posting something again is
   * one tap instead of typing its name again.
   */
  const recent = useMemo<Result[]>(
    () =>
      latestDexIds(unlocks, RECENT_MAX).flatMap((id) => {
        const d = getDrink(id);
        return d ? [{ drink: d, custom: null }] : [];
      }),
    [unlocks],
  );

  /*
   * Whether to offer adding the drink typed: two characters at least, and
   * no catalogue drink or drink of their own already has that name (folded
   * the way the form and the server compare names).
   */
  const offerAdd =
    trimmed.length >= 2 && !catalogueTwin(trimmed) && !ownTwin(trimmed, customDrinks);

  /*
   * A result chosen: it becomes the drink, the keyboard goes down and the
   * window turns to compose in the same commit. One tap does it: the list
   * keeps taps while the keyboard is up (keyboardShouldPersistTaps). Said
   * aloud, since the row under the finger is gone.
   */
  const pick = useCallback((d: Drink) => {
    haptic.select();
    Keyboard.dismiss();
    searchRef.current?.blur();
    setDrink(d);
    setStep('compose');
    announce(`Selected ${d.name}`);
  }, []);

  /*
   * Back from compose: the search as it was left. The field mounts again
   * with autoFocus, so the keyboard is up for the next try.
   */
  const backToFind = useCallback(() => {
    Keyboard.dismiss();
    setStep('find');
  }, []);

  /* Android's back key does in compose what the chevron does. */
  useEffect(() => {
    if (step !== 'compose') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      backToFind();
      return true;
    });
    return () => sub.remove();
  }, [step, backToFind]);

  /*
   * The add-a-drink form, named after the search. It takes this window's
   * photo along (setSeed), as a copy: the photo stays here too, ready to
   * save once the drink comes back chosen.
   */
  const openAdd = useCallback(() => {
    Keyboard.dismiss();
    useCustomDrinks.getState().setSeed({ photoUri });
    router.push({ pathname: '/add-drink', params: { name: trimmed, from: 'log' } });
  }, [photoUri, router, trimmed]);

  /*
   * Back from the form: the drink just added, or the catalogue drink one
   * of its "Already in the Dex?" rows pointed at, chosen here and in
   * compose. The handoff waits in the custom-drinks store and is taken on
   * focus, so it is read once, by this screen, after the form has gone.
   * Back without adding, the search stays, results and all.
   */
  useFocusEffect(
    useCallback(() => {
      const h = useCustomDrinks.getState().takeHandoff('log');
      if (!h) return;
      const next = resolveDrink(h.id);
      if (!next) return;
      setDrink(next);
      setQuery(next.name);
      setStep('compose');
      announce(`Selected ${next.name}`);
    }, []),
  );

  /*
   * The music picker closes when this window loses focus, and its preview
   * stops with it (MusicPicker stops on close and on blur).
   */
  useFocusEffect(useCallback(() => () => setPickingMusic(false), []));

  /*
   * No haptic of their own: a pick is not a selection change. Runs after
   * the source sheet has gone (PhotoSourceSheet), so iOS presents the
   * picker over this window and not over a sheet on its way out.
   */
  const fromSource = useCallback(async (source: PhotoSource) => {
    const r = source === 'camera' ? await pickFromCamera() : await pickFromLibrary();
    if (r.ok) setPhotoUri(r.uri);
    else if (r.reason !== 'cancelled') notice(r);
  }, []);

  /*
   * The keyboard's state, for the foot: with it up, Post sits just above
   * it rather than above a home indicator the keyboard covers. And when
   * the caption takes the cursor, the photo above it scrolls away so the
   * caption and Post both show over the keys.
   */
  const [keyboardUp, setKeyboardUp] = useState(false);
  const captionFocused = useRef(false);
  const composeRef = useRef<ScrollView>(null);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardUp(false));
    const shown = Keyboard.addListener('keyboardDidShow', () => {
      if (captionFocused.current) composeRef.current?.scrollToEnd({ animated: true });
    });
    return () => {
      show.remove();
      hide.remove();
      shown.remove();
    };
  }, []);

  /*
   * What `disabled` means on the two keys: nothing to save yet, or
   * already saved. A save in progress is the pressed key's spinner, not a
   * dimmed neighbour; save() turns a second tap away on its own.
   */
  const canSave = photoUri != null && drink != null && !saved;
  /** This window posts at all: signed in, and a catalogue drink. Otherwise its one key saves to the Dex. */
  const posts = drink != null && !!myId && !isCustom;
  /*
   * "Add music" shows only where Post can send it: a song is only ever
   * sent with a post. After the save it stays, dimmed, so the screen does
   * not jump while the window slides away.
   */
  const offerMusic = MUSIC_ON && posts && photoUri != null;

  /*
   * Tag people shows exactly where Post exists and the server has tags
   * (§1.2), with or without a photo yet. The people shown are the pick,
   * else the post's own tags (none while they load: the row still opens).
   *
   * A pick made before the post's tags arrived never saw them. They stay
   * on the post (Post removes only people the person unticked), so as
   * they land they join the pick on screen and in the picker, and join
   * `taggedBefore`, every tag the person has been shown, which is what
   * Post writes the difference from. Without that, opening the picker
   * while the read was out hid the post's tags from the row for good.
   */
  const offerTags = posts && tagsOn;
  const drinkId = drink?.id ?? null;
  // Memoised: save() depends on both, and a fresh array each render would remake it each render.
  const { tagged, taggedBefore } = useMemo(() => {
    const pickNow = drinkId && tagPick?.drinkId === drinkId ? tagPick : null;
    const baseNow = drinkId && tagBase?.drinkId === drinkId ? tagBase.people : NOBODY;
    if (!pickNow) return { tagged: baseNow, taggedBefore: baseNow };
    const seen = new Set(pickNow.prev.map((p) => p.id));
    const picked = new Set(pickNow.people.map((p) => p.id));
    const unseen = baseNow.filter((p) => !seen.has(p.id));
    return {
      tagged: [...pickNow.people, ...unseen.filter((p) => !picked.has(p.id))],
      taggedBefore: [...pickNow.prev, ...unseen],
    };
  }, [drinkId, tagPick, tagBase]);
  const tagsChanged = offerTags && !samePeople(tagged, taggedBefore);

  /*
   * A re-post's starting tags: read once per drink as compose opens it.
   * The read also tells lib/social whether 024 is there, so the flag is
   * asked again once it lands.
   */
  useEffect(() => {
    if (!posts || !myId || !drinkId || !tagsSupported()) return;
    let alive = true;
    void fetchMyPostTags(myId, drinkId).then((r) => {
      if (!alive) return;
      setTagBase({ drinkId, people: r.people });
      setTagsOn(tagsSupported());
    });
    return () => {
      alive = false;
    };
  }, [posts, myId, drinkId]);

  /*
   * One small line under the caption, only when a key needs explaining:
   * why a drink someone added cannot be posted, why signed out there is
   * no Post, where a re-log's new photo goes. With a song chosen and
   * nothing else to say, how long the song lasts.
   */
  const reason =
    photoUri == null || drink == null
      ? null
      : isCustom
        ? 'Drinks you added stay in your Dex until they join the catalogue.'
        : !myId
          ? 'Sign in to post. Saving to your Dex works either way.'
          : relog
            ? 'If you shared this entry, the post gets the new photo too.'
            : null;
  const saveHint =
    reason ?? (offerMusic && song ? "Music plays with this photo's story for a day." : null);

  const onNoteChange = useCallback((text: string) => {
    setNote(text);
    setNoteError(null);
  }, []);

  const save = useCallback(
    async (alsoPost: boolean) => {
      /*
       * First, before the guard: a keyboard left up would sit over the
       * lower half of the celebration card, Done included.
       */
      Keyboard.dismiss();
      if (!photoUri || !drink || busy || saved) return;
      const trimmedNote = note.trim();

      /*
       * A drink someone added: the photo goes to their own store, beside
       * the drink, never into the collection. It does not move the Dex's
       * count and is never posted, so nothing plays and the caption is
       * never shown to anyone.
       */
      if (isCustom) {
        if (alsoPost) return;
        setSavingAs('dex');
        try {
          const uri = await persistPhoto(drink.id, photoUri);
          useCustomDrinks
            .getState()
            .logPour(drink.id, uri, trimmedNote.length > 0 ? trimmedNote : undefined);
          haptic.success();
          setSaved(relog ? 'relog' : 'new');
        } finally {
          setSavingAs(null);
        }
        return;
      }

      /*
       * Only a post's caption is seen by others, so only a post is
       * checked. The server's trigger has the final word; catching it here
       * keeps the message by the field, before anything is saved.
       */
      if (alsoPost && trimmedNote.length > 0 && containsObjectionable(trimmedNote)) {
        setNoteError(OBJECTIONABLE_MESSAGE);
        // Field speaks an error when it appears; the same press again is answered here.
        if (noteError) announce(OBJECTIONABLE_MESSAGE);
        return;
      }

      setSavingAs(alsoPost ? 'post' : 'dex');
      try {
        const uri = await persistPhoto(drink.id, photoUri);

        unlock(drink.id, uri, trimmedNote.length > 0 ? trimmedNote : undefined);

        /*
         * Only the sharing half needs an account; the collection is local.
         * Not awaited: the drink is saved and celebrated the moment it is
         * local, and an upload on a bar's signal can take seconds. What
         * became of the post still arrives, as a notice.
         *
         * A re-log goes through the same call: addPost adds the photo to
         * the post that exists and keeps its caption. The song rides on
         * Post alone. A re-log kept off the feed still keeps a post in
         * step, as the drink card's Save photo does; it never creates one.
         */
        if (alsoPost && myId) {
          // The tags ride with Post like the song, and only when they changed.
          const tags = tagsChanged
            ? { next: tagged.map((p) => p.id), prev: taggedBefore.map((p) => p.id) }
            : undefined;
          void addPost(myId, drink.id, trimmedNote, uri, MUSIC_ON ? song : null, tags).then(reportPost);
        } else if (relog && myId) {
          void addPhotoForDrink(myId, drink.id, uri).then(reportPostPhoto);
        }

        haptic.success();
        setSaved(relog ? 'relog' : 'new');
      } finally {
        setSavingAs(null);
      }
    },
    [
      photoUri,
      drink,
      busy,
      saved,
      isCustom,
      relog,
      note,
      noteError,
      song,
      tagsChanged,
      tagged,
      taggedBefore,
      unlock,
      myId,
      addPost,
      addPhotoForDrink,
    ],
  );

  useEffect(() => {
    // Navigation, not state: this leaves once the celebration is done.
    if (saved && pending === 0) router.back();
  }, [saved, pending, router]);

  /*
   * Leaving with work in the window asks first: the photo exists only in
   * the picker's cache until it is saved. An empty window still closes on
   * the first tap of the X, and so does one that only holds the drink it
   * was opened for. A chosen song is work too, and so is a tag set that
   * differs from where it started. The full-screen window has no swipe to
   * close, so this catches the X and Android's back; mid-save the attempt
   * is ignored rather than offering to discard a save already happening.
   */
  const dirty =
    !saved &&
    (photoUri != null ||
      (drink != null && drink.id !== preselectId) ||
      note.trim().length > 0 ||
      song != null ||
      tagsChanged);
  usePreventRemove(dirty, ({ data }) => {
    if (busy) return;
    confirmDestructive(
      'Discard this post?',
      'Nothing on this screen has been saved yet.',
      'Discard',
      () => navigation.dispatch(data.action),
    );
  });

  /*
   * The window's width, from its own layout: the rows give their names a
   * measure (DrinkName), and the photo is the column. A full-screen
   * modal's frame is the screen's, so the keyboard needs no offset.
   */
  const { width: windowW } = useWindowDimensions();
  const [frameW, setFrameW] = useState(windowW);
  const column = frameW - 2 * layout.gutter;

  /** A drink's own photo for its row: the one last saved of it, else the one it was added with. */
  const customPhoto = (c: CustomDrink) =>
    (inDex(customPours, c.id) ? customPours[c.id].photoUri : null) || customPhotoUri(c.photoFile) || null;

  /* ---- Find ---- */

  const findRows = trimmed.length > 0 ? results.rows : recent;
  /* Names two rows share, the one case a row says more than its name. */
  const twins = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of findRows) {
      const k = fold(r.drink.name);
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
  }, [findRows]);

  /*
   * Spoken as a plain number: "#0042" is read digit by digit. The state
   * the v3.3 tag printed is still said, so VoiceOver hears what a sighted
   * person sees by the colour of the print on the Dex.
   */
  const spokenFor = (r: Result) => {
    const collected = r.custom ? inDex(customPours, r.drink.id) : inDex(unlocks, r.drink.id);
    return r.custom
      ? [r.drink.name, 'added by you', collected ? 'in your Dex' : null].filter(Boolean).join(', ')
      : [r.drink.name, `number ${r.drink.dexNumber}`, collected ? 'in your Dex' : 'new to your Dex'].join(', ');
  };

  const more = results.rows.length > 0 && results.total > MAX_RESULTS;
  const findFooter =
    trimmed.length > 0 && (more || offerAdd) ? (
      <View>
        {more ? (
          <Text style={[textRole.small, styles.muted, styles.note]}>
            The best {MAX_RESULTS} of {formatCount(results.total)}. Keep typing to narrow them down.
          </Text>
        ) : null}
        {offerAdd ? (
          <AddNewRow
            label={`Add “${shortQuery(trimmed)}” as a new drink`}
            query={trimmed}
            onPress={openAdd}
          />
        ) : null}
      </View>
    ) : null;

  const findEmpty =
    trimmed.length > 0 ? (
      <Text style={[textRole.small, styles.muted, styles.note]}>
        {offerAdd
          ? `Nothing in the Dex is called “${shortQuery(trimmed)}”. Try a style or a country, like tiki or mexico, or add it.`
          : `Nothing called “${shortQuery(trimmed)}”. Try a style or a country, like tiki or mexico.`}
      </Text>
    ) : (
      <Text style={[textRole.small, styles.muted, styles.note]}>Type a name, a style or a country.</Text>
    );

  /*
   * Each step owns its rules (WithScrollEdges) and mounts afresh when the
   * window turns to it, its list back at the top, so its rules start off
   * too. Keyed: both steps put a WithScrollEdges in the same place, and
   * React would otherwise hand compose the search's scroll. The top row's
   * rule shows once content scrolls under it; compose's foot's only while
   * the caption runs on under it.
   */
  const findStep = (
    <WithScrollEdges key="find">
      {(findEdges) => (
        <>
          {/*
            The top row: the X and the field, and no bar above them (layout
            spec 5.6: no "Post a drink" title, no photo beside the field, no
            counts line). The X closes the window, asking first if there is
            anything to lose (usePreventRemove). The rule shows once the
            results scroll under the row.
          */}
          <View style={[styles.findBar, { paddingTop: insets.top }, findEdges.under && styles.findBarRuled]}>
            <View style={styles.findRow}>
              <Pressable
                onPress={() => router.back()}
                accessibilityRole="button"
                accessibilityLabel="Close"
                accessibilityHint="Asks first if there is anything to lose"
                style={({ pressed }) => [styles.close, pressed && styles.closePressed]}>
                <Icon name="close" size={CLOSE_GLYPH} color={colors.text} />
              </Pressable>
              {/*
                The placeholder invites the typing (Jan, 23 Oct 2026: "type
                your drink"); it was "Name, style or country", which read as a
                form's field hint rather than the one thing this window asks
                of you. The spoken label keeps saying HOW it searches (name,
                style and origin), so someone at a bar who never heard the
                drink's name still knows "tiki" or "mexico" works, and
                VoiceOver never depends on the placeholder (it is not a
                label). Return keeps the system's plain key (SearchField's
                default) and lowers the keyboard over the results, as in v3.3.
              */}
              <SearchField
                ref={searchRef}
                value={query}
                onChangeText={onQueryChange}
                autoFocus
                placeholder="Type your drink"
                accessibilityLabel="Search for the drink you had, by name, style or country"
                style={styles.findField}
              />
            </View>
          </View>

          {/*
            The results, from under the row down to the keyboard. Taps go
            through with the keyboard up, so one tap on a row chooses it; a drag
            lowers the keyboard to show more, and the results stay.
          */}
          <FlatList
            ref={findListRef}
            data={findRows}
            keyExtractor={(r) => r.drink.id}
            renderItem={({ item }) => (
              <ResultRow
                drink={item.drink}
                photoUri={item.custom ? customPhoto(item.custom) : null}
                subtitle={twins.has(fold(item.drink.name)) ? twinLine(item) : null}
                chosen={drink?.id === item.drink.id}
                width={frameW}
                spoken={spokenFor(item)}
                onPress={pick}
              />
            )}
            ListHeaderComponent={
              trimmed.length === 0 && recent.length > 0 ? (
                <Text accessibilityRole="header" style={[textRole.small, styles.muted, styles.recentHead]}>
                  Recent in your Dex
                </Text>
              ) : null
            }
            ListEmptyComponent={findEmpty}
            ListFooterComponent={findFooter}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScroll={findEdges.onScroll}
            scrollEventThrottle={16}
            style={styles.body}
            contentContainerStyle={[styles.findList, { paddingBottom: insets.bottom + space.xxxl }]}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}
    </WithScrollEdges>
  );

  /* ---- Compose ---- */

  const composeStep = drink ? (
    <WithScrollEdges key="compose">
      {(composeEdges) => (
        <>
          <ComposeBar name={drink.name} width={frameW} showRule={composeEdges.under} onBack={backToFind} />

          {/*
            The photo and the caption scroll; Post stays at the foot. A drag
            lowers the caption's keyboard.
          */}
          <ScrollView
            ref={composeRef}
            style={styles.body}
            contentContainerStyle={styles.compose}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScroll={composeEdges.onScroll}
            onLayout={composeEdges.onLayout}
            onContentSizeChange={composeEdges.onContentSizeChange}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}>
            <PhotoSlot
              uri={photoUri}
              width={column}
              onPress={() => {
                if (busy || saved) return;
                Keyboard.dismiss();
                setChoosingSource(true);
              }}
            />

            {/*
              The caption: the same cap, rules and moderation as the drink
              card's, asked one way from both doors. No visible label (layout
              spec 5.6): the placeholder asks, and the spoken name says it is
              optional. Field links a refused caption to the input and speaks
              it. Prose, so capitals and autocorrect are on; return lowers the
              keyboard rather than starting a line.
            */}
            <Field
              labelHidden
              multiline
              value={note}
              onChangeText={onNoteChange}
              placeholder="Say something about it"
              maxLength={NOTE_MAX}
              autoCapitalize="sentences"
              autoCorrect
              returnKeyType="done"
              submitBehavior="blurAndSubmit"
              keyboardAppearance="light"
              error={noteError}
              accessibilityLabel="Caption, optional"
              onFocus={() => {
                captionFocused.current = true;
              }}
              onBlur={() => {
                captionFocused.current = false;
              }}
              style={styles.caption}
            />

            {/*
              Tag people, 16 under the caption and before the music: who was
              with you, and the way to the picker. Not during a save: save()
              has already read the tags.
            */}
            {offerTags ? (
              <View style={styles.tagRow}>
                <TagPeopleRow
                  people={tagged}
                  disabled={!!saved}
                  onPress={() => {
                    if (busy || saved) return;
                    Keyboard.dismiss();
                    // Learned since this window opened: 024 is not there after all.
                    if (!tagsSupported()) {
                      setTagsOn(false);
                      return;
                    }
                    setPickingTags(true);
                  }}
                />
              </View>
            ) : null}

            {/*
              Music, only where Post can send it. No song: one small key. A
              song: its cover, title and artist, and Remove. Auditioning is the
              picker's, beside its Apple Music link.
            */}
            {offerMusic ? (
              song ? (
                <View style={styles.songRow}>
                  <View
                    accessible
                    accessibilityLabel={`Music, ${song.title} by ${song.artist}`}
                    style={styles.songInfo}>
                    <SongArtwork url={song.artworkUrl} size={32} />
                    <View style={styles.songText}>
                      <Text numberOfLines={1} style={[textRole.bodyMedium, styles.ink]}>
                        {song.title}
                      </Text>
                      <Text numberOfLines={1} style={[textRole.small, styles.muted]}>
                        {song.artist}
                      </Text>
                    </View>
                  </View>
                  {/* Not during a save: save() has already read the song. */}
                  <Button
                    label="Remove"
                    variant="text"
                    size="sm"
                    disabled={!!saved}
                    onPress={() => {
                      if (busy || saved) return;
                      setSong(null);
                      announce('Music removed');
                    }}
                    accessibilityLabel={`Remove ${song.title}`}
                  />
                </View>
              ) : (
                <Button
                  label="Add music"
                  variant="secondary"
                  size="sm"
                  icon="music"
                  disabled={!!saved}
                  onPress={() => {
                    if (busy || saved) return;
                    Keyboard.dismiss();
                    setPickingMusic(true);
                  }}
                  style={styles.addMusic}
                />
              )
            ) : null}

            {saveHint ? <Text style={[textRole.small, styles.muted, styles.hint]}>{saveHint}</Text> : null}
          </ScrollView>

          {/*
            The foot: Post, the screen's one solid key, and under it the quiet
            way to keep the drink without sharing it. Signed out, or for a drink
            someone added, there is nothing to post, so the one key saves to the
            Dex and the line above says why. Only the pressed key shows it is
            working; a save answers with the success haptic.

            Post is the post key, in the accent (v4.4), as the drink page's
            pinned key is. The same key saving instead ("Save to Dex", "Save
            photo") stays ink: the accent says post, and nothing is posted.

            While the caption's keyboard is up the foot is Post alone, 16 above
            the keys (layout spec 5.6): someone typing a caption is about to
            post it, and the quiet key is back the moment the keyboard goes
            down (return, or a drag).
          */}
          <View
            style={[
              styles.foot,
              composeEdges.moreBelow && styles.footRuled,
              { paddingBottom: keyboardUp ? space.lg : insets.bottom + space.sm },
            ]}>
            <Button
              label={posts ? 'Post' : relog ? 'Save photo' : 'Save to Dex'}
              variant={posts ? 'post' : 'primary'}
              onPress={() => void save(posts)}
              disabled={!canSave}
              loading={savingAs === (posts ? 'post' : 'dex')}
              block
              accessibilityHint={photoUri == null && !saved ? 'Add a photo first' : undefined}
            />
            {posts && !keyboardUp ? (
              <Button
                label={relog ? 'Save photo' : 'Save to Dex only'}
                variant="text"
                onPress={() => void save(false)}
                disabled={!canSave}
                loading={savingAs === 'dex'}
                block
                accessibilityHint={relog ? 'Keeps the new photo without posting again' : 'Keeps it in your Dex without posting'}
              />
            ) : null}
          </View>
        </>
      )}
    </WithScrollEdges>
  ) : null;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      // No offset: a full-screen modal's frame and the keyboard's top share coordinates.
      keyboardVerticalOffset={0}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        setFrameW((prev) => (prev === w ? prev : w));
      }}>
      {step === 'compose' && drink ? composeStep : findStep}

      {/*
        Rendered here as well as at the root. While this window is up it is
        the only one that can be seen; once it closes, the root instance
        covers every other way a drink is collected.
      */}
      <CelebrationOverlay />

      <PhotoSourceSheet
        visible={choosingSource}
        onClose={() => setChoosingSource(false)}
        onChoose={(source) => void fromSource(source)}
      />

      {/*
        The picker hands back who was picked; nothing is written until Post.
        It keeps the base the person saw, so Post removes only people they
        unticked.
      */}
      {offerTags && drinkId ? (
        <TagPeopleSheet
          visible={pickingTags}
          initial={tagged}
          onDone={(picked) => setTagPick({ drinkId, people: picked, prev: taggedBefore })}
          onClose={() => setPickingTags(false)}
        />
      ) : null}

      {/* Only while story music is on; it presents itself over this window. */}
      {MUSIC_ON ? (
        <MusicPicker
          visible={pickingMusic}
          onClose={() => setPickingMusic(false)}
          onChoose={(picked) => {
            setSong(picked);
            setPickingMusic(false);
            announce(`Music added, ${picked.title} by ${picked.artist}`);
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

/* -------------------------------------------------------------------- */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  /* Either step's body: whatever the top row and the foot (or the keyboard) leave. */
  body: { flex: 1 },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },

  /* Find: the X and the field in the top-bar row, the rule always laid out, transparent at rest. */
  findBar: {
    backgroundColor: colors.bg,
    borderBottomWidth: stroke.edge,
    borderBottomColor: 'transparent',
  },
  findBarRuled: { borderBottomColor: colors.line },
  findRow: {
    height: layout.topBar,
    flexDirection: 'row',
    alignItems: 'center',
    gap: CLOSE_TO_FIELD,
    paddingLeft: CLOSE_BOX_LEFT,
    paddingRight: layout.gutter,
  },
  close: { width: layout.hit, height: layout.hit, alignItems: 'center', justifyContent: 'center' },
  closePressed: { opacity: 0.6 },
  findField: { flex: 1 },
  /* The first row at y 130 (layout spec 5.6): 15 under the row's 1pt rule, then the row's own 8 above the thumb. */
  findList: { paddingTop: space.lg - stroke.edge },
  recentHead: { paddingHorizontal: layout.gutter, paddingTop: space.sm, paddingBottom: space.xs },
  note: { paddingHorizontal: layout.gutter, paddingVertical: space.md },

  /* Compose: the photo 8 under the bar, the caption 24 under the photo. */
  compose: { paddingHorizontal: layout.gutter, paddingTop: space.sm, paddingBottom: space.xl },
  caption: { marginTop: space.xl },
  tagRow: { marginTop: space.lg },
  addMusic: { alignSelf: 'flex-start', marginTop: space.lg },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg },
  songInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  songText: { flex: 1 },
  hint: { marginTop: space.lg },
  /* The foot's rule always laid out, transparent until the caption runs under it, so showing it moves nothing. */
  foot: {
    paddingHorizontal: layout.gutter,
    paddingTop: space.sm,
    backgroundColor: colors.bg,
    borderTopWidth: stroke.edge,
    borderTopColor: 'transparent',
  },
  footRuled: { borderTopColor: colors.line },
});
