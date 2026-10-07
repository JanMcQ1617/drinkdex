import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DexStatusTag, dexStatusTagWidth, DrinkName, LiningBand } from '@/components/cabinet';
import { CelebrationOverlay } from '@/components/CelebrationOverlay';
import { DexThumb } from '@/components/DexCard';
import { Grain } from '@/components/Grain';
import { Icon } from '@/components/icons';
import { MusicPicker } from '@/components/MusicPicker';
import { ScreenTopBar, TopBarTextButton } from '@/components/ScreenTopBar';
import { SongArtwork } from '@/components/songs';
import {
  announce,
  Button,
  EmptyState,
  Field,
  haptic,
  SearchField,
  SectionHeader,
} from '@/components/ui';
import {
  colors,
  fonts,
  layout,
  radius,
  space,
  stroke,
  tabular,
  textRole,
  type as typeScale,
} from '@/constants/theme';
import { formatCount, formatDexNumber, getDrink, TOTAL } from '@/data';
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
import { faceOf, fitScale } from '@/lib/textFit';
import { useAuth } from '@/store/auth';
import { useCelebrate } from '@/store/celebrate';
import { useCollection } from '@/store/collection';
import { customDrinkById, useCustomDrinks } from '@/store/customDrinks';
import { useSocial } from '@/store/social';
import type { CustomDrink, Drink, Song } from '@/types';
import { confirmDestructive, showNotice } from '@/utils/alerts';

/* ==================================================================== */
/* Post a drink                                                         */
/*                                                                      */
/* The centre action's destination: photograph first, then say what it  */
/* was.                                                                 */
/*                                                                      */
/* That order is the whole point of this screen existing. Posting from  */
/* a Dex entry means you already know what you drank and have gone      */
/* looking for it — fine at home, useless at a bar with a glass in      */
/* front of you and no idea what the barman called it. Here the         */
/* photograph is the thing you can always take, and identifying it is a */
/* second step you can do at leisure.                                   */
/*                                                                      */
/* One screen, not a wizard. The two steps are short enough that paging */
/* between them would cost more than it organises, and keeping both     */
/* visible means the photo stays on screen while you search — which is  */
/* what you are looking at to work out what it was.                     */
/*                                                                      */
/* A drink the Dex does not have can be added from here (add-drink):    */
/* the search offers it when nothing found has the name typed, the form */
/* takes this sheet's photo along, and the drink comes back selected.   */
/* A photo of a drink someone added is kept in their Dex, not posted:   */
/* followers' phones look drinks up in the catalogue, which does not    */
/* have it until Sipply adds it.                                        */
/*                                                                      */
/* With story music on (EXPO_PUBLIC_STORY_MUSIC), a post can carry a    */
/* song for its story: "Add music" in the save bar opens the picker     */
/* (components/MusicPicker), and the song goes with Save & post only.   */
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

/* -------------------------------------------------------------------- */
/* Search                                                               */
/* -------------------------------------------------------------------- */

/** One result: a catalogue drink, or one this person added (`custom`). */
type Result = { drink: Drink; custom: CustomDrink | null };

/*
 * The catalogue's matches and this person's own, ranked together by one
 * measure: lib/drinkSearch's rank, moved there from this file so the
 * add-a-drink form and a reel's drink tag search the same way.
 *
 * Nothing is listed until something is typed. The full index in dex
 * order is not a starting point, it is a wall — and the one thing the
 * user reliably knows here is roughly what the drink was called.
 *
 * Every entry is ranked and the best MAX_RESULTS kept, rather than
 * stopping at the first MAX_RESULTS in dex order. Stopping early was
 * cheaper, but it meant "vodka" filled the list with vodkas from
 * somewhere before reaching Vodka Soda. Ranking the whole index is a few
 * thousand string checks per keystroke, which is nothing.
 *
 * On a tie, their own drink goes first: someone who added "Mango Chili
 * Margarita" and types "mango" means theirs before the catalogue's. Then
 * dex order; their own, which have no number, by name.
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

/* -------------------------------------------------------------------- */

/*
 * A result row's columns, for the name's measure (specs/v3-cabinet.md
 * 6.4): 12pt of padding each side, the 44pt thumbnail and its 12pt gap,
 * and at least 112pt for the tag at the end. DrinkName has to know the
 * column before layout, because it shrinks a name with a long word to fit
 * rather than letting iOS break the word.
 */
const ROW_PAD = space.md;
const THUMB_COLUMN = 44 + space.md;
const TRAILING_MIN = 112;
/** Dynamic Type cap on a row's name (6.5), and on the preview's sentence that holds one. */
const NAME_CAP = 1.4;
/*
 * Past this text size (XL and up) the tag leaves the end of the row and
 * sits under the meta line, on every row. The tag grows with the text:
 * "New to your Dex" is about 145pt wide at XL, and beside it a 375pt phone
 * leaves the name some 100pt, which shrinks most names. Under the meta the
 * name has the row.
 */
const STACK_SCALE = 1.1;

/**
 * One result, as a row of the grouped results list: the drink mounted as a
 * lit thumbnail, its name in Playfair, its number and style, and at the
 * end what it is to you.
 *
 * Lit for every drink, collected or not: this is where you identify what
 * you drank, and a ghost would hide the picture you are matching. The name
 * goes through DrinkName, so it wraps and the row grows; nothing is cut
 * short.
 *
 * The tag says "New" for a drink not yet in your Dex, "In your Dex" for one
 * that is, and "Yours" for a drink this person added. Chosen, the row takes
 * the wine wash and a 1.5pt wine edge, and a new drink's tag reads "New to
 * your Dex": the choice is said by an edge and words as well as a colour.
 *
 * A fill answers the press, not a scale: a row is a control, not a
 * picture. Each row draws its own share of the group's edge (`first` and
 * `last` take the corners), so a FlatList of rows reads as one panel.
 */
function DrinkRow({
  drink,
  selected,
  collected,
  photoUri,
  badge,
  rowWidth,
  first,
  last,
  onPress,
}: {
  drink: Drink;
  selected: boolean;
  /** Already in the Dex, so saving it again updates rather than adds. */
  collected: boolean;
  /** The drink's own photo (a drink someone added), drawn ahead of any stock one. */
  photoUri?: string | null;
  /** 'yours': a drink this person added, not one from the catalogue. */
  badge?: 'yours';
  /** The row's width inside the group's 1pt edges. */
  rowWidth: number;
  first: boolean;
  last: boolean;
  onPress: (d: Drink) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const trailing = Math.max(
    TRAILING_MIN,
    space.md + (badge ? 0 : dexStatusTagWidth(collected, selected, fontScale)),
  );
  const beside = rowWidth - 2 * ROW_PAD - THUMB_COLUMN - trailing;
  const below = rowWidth - 2 * ROW_PAD - THUMB_COLUMN;
  /*
   * And at any size, a row whose name the tag beside it would shrink: a
   * long word ("Feuerzangenbowle") on a small phone, or a chosen row whose
   * tag has grown to "New to your Dex". The name keeps its size and the
   * tag moves down a line, so choosing a drink never makes its name
   * smaller. Worked out as DrinkName will, from the same estimate.
   */
  const face = faceOf(textRole.rowName.fontFamily);
  const nameSize = textRole.rowName.fontSize * Math.min(fontScale, NAME_CAP);
  const stacked =
    fontScale > STACK_SCALE ||
    fitScale(drink.name, face, nameSize, beside) < fitScale(drink.name, face, nameSize, below);
  const measure = stacked ? below : beside;

  const styleWord = styleLabel(drink.subcategory);
  /*
   * Spoken as a plain number. The Dex prints it padded, "#0042", which
   * VoiceOver reads out zero by zero; the padding is for the eye, and
   * DexCard says it the same way. A drink someone added has no number, and
   * says whose it is instead.
   *
   * The state in the tag's own words, so a VoiceOver user and a sighted
   * one are told the same thing; the choice is accessibilityState.
   */
  const spoken = badge
    ? [drink.name, styleWord, 'added by you', collected ? 'collected' : null].filter(Boolean).join(', ')
    : [
        drink.name,
        `number ${drink.dexNumber}`,
        styleWord,
        collected ? 'in your Dex' : 'new to your Dex',
      ]
        .filter(Boolean)
        .join(', ');

  const status = badge ? (
    <Text style={styles.rowYours}>Yours</Text>
  ) : (
    <DexStatusTag inDex={collected} selected={selected} />
  );

  return (
    <Pressable
      onPress={() => onPress(drink)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={spoken}
      style={({ pressed }) => [
        styles.row,
        first && styles.rowFirst,
        last && styles.rowLast,
        selected ? styles.rowSelected : pressed ? styles.rowPressed : null,
      ]}>
      <DexThumb drink={drink} photoUri={photoUri} />

      <View style={styles.rowText}>
        <DrinkName name={drink.name} role={textRole.rowName} measure={measure} cap={NAME_CAP} color={colors.text} />
        {/*
          "#0127 · Spirit-forward": the number in the plate's taupe. A drink
          someone added has no number, so it keeps its style and where it
          is from.
        */}
        {badge ? (
          <Text style={styles.rowMeta}>{[styleWord, drink.origin].filter(Boolean).join(' · ')}</Text>
        ) : (
          <Text style={styles.rowMeta}>
            <Text style={styles.rowNumber}>{formatDexNumber(drink.dexNumber)}</Text>
            {styleWord ? ` · ${styleWord}` : ''}
          </Text>
        )}
        {stacked ? <View style={styles.rowStatusStacked}>{status}</View> : null}
      </View>

      {stacked ? null : status}

      {/*
        The chosen row's edge, inside the group's own: the wash alone was a
        colour, and an edge is a shape. Last, so it lies over the fill.
      */}
      {selected ? (
        <View
          pointerEvents="none"
          style={[styles.rowEdge, first && styles.rowEdgeFirst, last && styles.rowEdgeLast]}
        />
      ) : null}
    </Pressable>
  );
}

/**
 * Under results that never name the drink typed: the way to add it. A
 * search for "margarita" always finds something, so an empty list alone
 * would hide that a drink can be added at all. The Dex grid ends the same
 * way.
 */
function NotTheOne({ query, onAdd }: { query: string; onAdd: () => void }) {
  return (
    <View style={styles.notTheOne}>
      <Text style={styles.notTheOneText}>Not the one you meant?</Text>
      <Button
        label={`Add “${shortQuery(query)}”`}
        variant="secondary"
        size="sm"
        icon="plus"
        onPress={onAdd}
        accessibilityLabel={`Add ${query} to your Dex`}
      />
    </View>
  );
}

/**
 * What saving a new catch will do, said before it happens: the drink
 * seated in the lining as the mount it is about to become, "Negroni joins
 * your Dex", and the card it will be, "39 of 2,089 collected · #0127".
 * The collect moment's final state, drawn static: nothing here moves, so
 * there is no state in which it is half shown.
 *
 * The thumbnail carries this photo once there is one, since the Dex card
 * will show yours ahead of the catalogue's.
 *
 * Inter, with only the name in Playfair (nameInline): a sentence that
 * names a drink is not a drink name. One VoiceOver element.
 */
function CollectPreview({
  drink,
  number,
  photoUri,
}: {
  drink: Drink;
  /** The count once this drink is in: the card number it will be. */
  number: number;
  photoUri: string | null;
}) {
  const count = `${formatCount(number)} of ${formatCount(TOTAL)} collected`;
  return (
    <LiningBand radius={12} style={styles.preview}>
      <View
        accessible
        accessibilityLabel={`${drink.name} joins your Dex. ${count}, number ${drink.dexNumber}.`}
        style={styles.previewRow}>
        <DexThumb drink={drink} photoUri={photoUri} size="mini" />
        <View style={styles.previewText}>
          <Text maxFontSizeMultiplier={NAME_CAP} style={styles.previewTitle}>
            <Text style={textRole.nameInline}>{drink.name}</Text> joins your Dex
          </Text>
          <Text style={styles.previewMeta}>
            {count} · {formatDexNumber(drink.dexNumber)}
          </Text>
        </View>
      </View>
    </LiningBand>
  );
}

/* -------------------------------------------------------------------- */

export default function PostDrinkScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();

  /*
   * `/log?drink=<id>` opens with that drink chosen: a Dex entry's or a
   * custom drink's pinned "Post this drink" or "Post another". Only the
   * photo is left to do, so a drink chosen this way does not count as work
   * to discard on the way out (see `dirty`).
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

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  /** Where the photo came from, for the line beside the print and its camera button. */
  const [photoFrom, setPhotoFrom] = useState<'camera' | 'library'>('camera');
  const [drink, setDrink] = useState<Drink | null>(() => resolveDrink(preselectId));
  const [query, setQuery] = useState('');
  /** The caption. Still `note` in code: the Dex entry's field (UnlockRecord.note) keeps that name. */
  const [note, setNote] = useState('');
  /** Said under the caption when it would be refused. */
  const [noteError, setNoteError] = useState<string | null>(null);
  /** The song for this photo's story, sent with Save & post only. Never set while music is off. */
  const [song, setSong] = useState<Song | null>(null);
  const [pickingMusic, setPickingMusic] = useState(false);
  /** Which button is saving, so only that one says so. */
  const [savingAs, setSavingAs] = useState<'dex' | 'post' | null>(null);
  /** Once the photo is saved: whether it went in new or as a re-log. */
  const [saved, setSaved] = useState<'new' | 'relog' | null>(null);
  const busy = savingAs !== null;
  const trimmed = query.trim();

  /** A drink this person added: kept in their Dex, never posted, never celebrated. */
  const isCustom = drink != null && isCustomId(drink.id);

  /*
   * Picking a drink you already have makes this an update, not a catch:
   * the entry keeps its date and takes the new photo, there is nothing to
   * celebrate, and posting adds the photo to the drink's post rather than
   * starting a second one. The rows and the button say so up front, where
   * "Save to Dex" used to read as adding.
   *
   * In the drink card's words, because it is the drink card's act: that
   * card's sheet for posting it again commits with "Save photo", and so
   * does this button. It behaves the same way too — a post of the entry,
   * if there is one, takes the new photo, and none is created (see save()).
   *
   * After the save it is read from what the save was, not from the
   * stores. By then the drink just saved is in them, so re-reading
   * would flip a new entry's button to "Save photo", and its hint to a
   * re-log's, under its celebration.
   */
  const relog =
    drink != null &&
    (saved
      ? saved === 'relog'
      : isCustom
        ? inDex(customPours, drink.id)
        : inDex(unlocks, drink.id));

  /*
   * This screen closes itself only once there is nothing left to show.
   *
   * It used to call router.back() the instant the photo was saved, which
   * put the celebration in an impossible position: this is a native-stack
   * MODAL, presented by iOS in its own view controller above the React
   * root, so the overlay mounted beside <Stack> renders underneath it and
   * is never seen. Dismissing first and hoping the card catches up is a
   * race against an animation.
   *
   * So the sheet stays, renders the celebration itself — same tree, no
   * cross-window layering to reason about — and leaves when the queue is
   * empty. Both this instance and the root one read the same queue, and a
   * dismissal pops it once, so the card can never appear twice. A photo of
   * a drink someone added raises no celebration, so it leaves at once.
   */
  const pending = useCelebrate((s) => s.queue.length);

  const results = useMemo(() => search(query, customDrinks), [query, customDrinks]);

  /*
   * Whether to offer adding the drink typed: two characters at least, and
   * no catalogue drink or drink of their own already has that name (folded
   * the way the form and the server compare names). For "Adonis" the
   * offer stays away; for "margarita", which finds plenty but none called
   * that, it sits under the results.
   */
  const offerAdd =
    trimmed.length >= 2 && !catalogueTwin(trimmed) && !ownTwin(trimmed, customDrinks);

  /*
   * No haptic of their own: buttons do not tick, and the pick itself is
   * not a selection change.
   */
  const takePhoto = useCallback(async () => {
    const r = await pickFromCamera();
    if (r.ok) {
      setPhotoUri(r.uri);
      setPhotoFrom('camera');
    } else if (r.reason !== 'cancelled') notice(r);
  }, []);

  const choosePhoto = useCallback(async () => {
    const r = await pickFromLibrary();
    if (r.ok) {
      setPhotoUri(r.uri);
      setPhotoFrom('library');
    } else if (r.reason !== 'cancelled') notice(r);
  }, []);

  const selectDrink = useCallback((d: Drink) => {
    haptic.select();
    setDrink(d);
  }, []);

  /*
   * The add-a-drink form, named after the search. It takes this sheet's
   * photo along (setSeed), as a copy: the photo stays here too, ready to
   * save once the drink comes back selected.
   */
  const openAdd = useCallback(() => {
    Keyboard.dismiss();
    useCustomDrinks.getState().setSeed({ photoUri });
    router.push({ pathname: '/add-drink', params: { name: trimmed, from: 'log' } });
  }, [photoUri, router, trimmed]);

  /*
   * Back from the form: the drink just added, or the catalogue drink one of
   * its "Already in the Dex?" rows pointed at, chosen here. The handoff waits
   * in the custom-drinks store and is taken on focus, so it is read once,
   * by this screen, after the form has gone; the choice is said aloud,
   * since nothing under the finger changed.
   */
  useFocusEffect(
    useCallback(() => {
      const h = useCustomDrinks.getState().takeHandoff('log');
      if (!h) return;
      const next = resolveDrink(h.id);
      if (!next) return;
      setDrink(next);
      announce(`Selected ${next.name}`);
    }, []),
  );

  /*
   * The music picker closes when this sheet loses focus, and its preview
   * stops with it (MusicPicker stops on close and on blur).
   */
  useFocusEffect(useCallback(() => () => setPickingMusic(false), []));

  /*
   * What `disabled` means on the two save buttons: nothing to save yet,
   * or already saved. A save in progress is not in it. That state is
   * the pressed button's spinner, and dimming its neighbour for the same
   * second said "you can't do this" on top of "it's working". save()
   * turns away a second tap on its own, so the neighbour needs no fade to
   * be safe.
   *
   * `saved` stays: the celebration covers the sheet, but a re-log has no
   * celebration and the sheet takes a moment to slide away.
   */
  const canSave = photoUri != null && drink != null && !saved;
  /** This sheet can post: a photo and a drink, signed in, a catalogue drink. */
  const postable = photoUri != null && drink != null && !!myId && !isCustom;
  /** Save & post can be pressed. */
  const canPost = postable && !saved;
  /*
   * "Add music" shows wherever Save & post is enabled, and nowhere else:
   * a song is only ever sent with a post, so it is never offered where the
   * sheet cannot post (signed out, a drink you added). After the save it
   * stays, dimmed with the two buttons, so the bar does not jump shorter
   * while the sheet slides away.
   */
  const offerMusic = MUSIC_ON && postable;

  /*
   * One line under the buttons, once there is something to save, and only
   * when a button needs explaining. For a drink someone added, it says why
   * posting is off: until Sipply adds the drink, nobody else's phone can
   * show it. Signed out, it says why the second button is dead rather than
   * leaving a disabled control with no reason: the collection works
   * signed out and only sharing does not. On a re-log it says where the
   * new photo goes, in the drink card's words for the same act, since
   * "Save photo" can change a post it does not name.
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
  /*
   * With a song chosen, and nothing above needing the line, it says how
   * long the song lasts: it belongs to this photo's story, not the post.
   * Said once, here, not again by the song row.
   */
  const saveHint =
    reason ?? (offerMusic && song ? "Music plays with this photo's story for a day." : null);

  const onNoteChange = useCallback((text: string) => {
    setNote(text);
    setNoteError(null);
  }, []);

  const save = useCallback(
    async (alsoPost: boolean) => {
      /*
       * First, before the guard. Tapping Save does not blur the caption or
       * the search field, and a keyboard left up would sit over the lower
       * half of the celebration card, Done button included.
       */
      Keyboard.dismiss();
      if (!photoUri || !drink || busy || saved) return;
      const trimmedNote = note.trim();

      /*
       * A drink someone added: the photo goes to their own store, beside
       * the drink, never into the collection. It does not move the Dex's
       * count, and there is no number to celebrate, so nothing plays. It
       * cannot be posted (the button is off), so the caption is never
       * shown to anyone and is not checked.
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
       * The caption is only seen by others when it is posted, so only a
       * post is checked. The server has the final word — its trigger
       * rejects the caption whatever this says — but catching it here
       * keeps the message next to the field, before anything is saved.
       */
      if (alsoPost && trimmedNote.length > 0 && containsObjectionable(trimmedNote)) {
        setNoteError(OBJECTIONABLE_MESSAGE);
        /*
         * Field speaks an error when it appears. Pressed again with the
         * same words, the error is already showing and nothing changes, so
         * the repeat press is answered here instead of in silence.
         */
        if (noteError) announce(OBJECTIONABLE_MESSAGE);
        return;
      }

      setSavingAs(alsoPost ? 'post' : 'dex');
      try {
        const uri = await persistPhoto(drink.id, photoUri);

        unlock(drink.id, uri, trimmedNote.length > 0 ? trimmedNote : undefined);

        /*
         * Only the sharing half needs an account. The collection is local,
         * so a signed-out user still gets their entry.
         *
         * Not awaited. The drink is saved and celebrated the moment it is
         * local; uploading the photo can take seconds on a bar's signal,
         * and holding the sheet open on a spinning button for that long
         * after the card is dismissed made a finished task look stuck. What
         * became of the post still reaches the user, as a notice once it is
         * known.
         *
         * A re-log goes through the same call: addPost adds the photo to
         * the post that already exists and keeps its caption, which this
         * one only fills if it was blank. No caption typed means none, not
         * a filler line — the post already says what was drunk.
         *
         * The song rides on Save & post alone: it goes on this photo's row
         * (lib/social createPost), so the story plays it for a day. Save to
         * Dex and Save photo never send one; a private entry has no story.
         *
         * A re-log kept off the feed ("Save photo") still keeps a post in
         * step, as the drink card's Save photo does: a post left showing
         * the replaced picture is the entry contradicting itself. It never
         * creates one, so an entry kept to the Dex stays there. Not awaited
         * either; a failure arrives as a notice, as a post's does.
         */
        if (alsoPost && myId) {
          void addPost(myId, drink.id, trimmedNote, uri, MUSIC_ON ? song : null).then(reportPost);
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
      unlock,
      myId,
      addPost,
      addPhotoForDrink,
    ],
  );

  useEffect(() => {
    // Navigation, not state — this leaves once the celebration is done.
    if (saved && pending === 0) router.back();
  }, [saved, pending, router]);

  /*
   * Leaving with work on the sheet asks first. Someone at a bar may have
   * spent a minute photographing and searching, and the photo exists only
   * in the picker's cache until it is saved — one stray swipe down on the
   * list used to throw all of it away. An empty sheet still leaves on the
   * first swipe, which keeps the gesture meaning "never mind"; so does one
   * that only holds the drink it was opened for. A chosen song is work too.
   *
   * This catches the swipe and Cancel alike, since both go through the
   * navigator. The post-save close is not held up: `saved` is already
   * set by the time it runs. Mid-save, the attempt is simply ignored
   * rather than offering to discard a save that is already happening.
   */
  const dirty =
    !saved &&
    (photoUri != null ||
      (drink != null && drink.id !== preselectId) ||
      note.trim().length > 0 ||
      song != null);
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
   * The sheet's offset from the top of the window, for the keyboard.
   *
   * `presentation: 'modal'` is a page sheet on iPhone, starting some way
   * below the status bar. KeyboardAvoidingView compares its own frame,
   * which is sheet-relative, with the keyboard's top, which is in window
   * coordinates — so without the offset it under-pads by exactly that gap
   * and the bottom of the save bar stays under the keyboard. A page sheet
   * is anchored to the bottom, so the gap is the window height minus the
   * sheet's. Measured from layout, not measureInWindow, which can read
   * the sheet mid-way through its presentation animation. 'padding' does
   * not change the view's own height, so this cannot feed back on itself.
   *
   * The width comes from the same layout: the result rows give their names
   * a measure (DrinkName), and the sheet is what they sit in.
   */
  const { width: windowW, height: windowH } = useWindowDimensions();
  const [sheet, setSheet] = useState({ w: windowW, h: windowH });
  /** A result row's width: the sheet less the list's gutters and the group's 1pt edges. */
  const rowWidth = sheet.w - 2 * layout.gutter - 2 * stroke.edge;

  /** A drink's own photo for its row: the one last saved of it, else the one it was added with. */
  const customPhoto = (c: CustomDrink) =>
    (inDex(customPours, c.id) ? customPours[c.id].photoUri : null) ||
    customPhotoUri(c.photoFile) ||
    null;

  const selectedCustom = isCustom && drink ? (customDrinkById(drink.id) ?? null) : null;

  /*
   * The collect preview, for a new catch from the catalogue: a re-log has
   * nothing to collect, and a drink someone added never moves the count.
   * Its number is the count with this drink in it; once saved, the store
   * already holds it.
   */
  const collectedCount = Object.keys(unlocks).length;
  const preview =
    drink != null && !isCustom && !relog ? (
      <CollectPreview drink={drink} number={collectedCount + (saved ? 0 : 1)} photoUri={photoUri} />
    ) : null;

  /*
   * The choice is drawn above the results when they do not hold it (see
   * the Selected block), and the preview goes with it there, under the row
   * it describes, instead of after up to 40 rows of another search or a
   * "No match".
   */
  const selectedApart = drink != null && !results.rows.some((r) => r.drink.id === drink.id);

  const header = (
    <View>
      {/* ---- The photograph ---- */}
      {/*
        The well shows; the buttons act.

        It used to be the frame itself that took a photo, with the library
        as a text link below — which made the camera the only obvious way
        in and hid the fact that a photo already in your roll works just as
        well. Half the time the drink was photographed before anyone
        thought to open Sipply, so the two routes are peers rather than a
        button and a footnote.

        Empty, it is a 96pt well, not a 4:3 frame: the frame held a 408x306
        hole for a photo that did not exist yet and decoded 4.5 MB once it
        did. Picked, the photo is a 90x120 print on bone mat, beside where
        it came from and the two ways to replace it.
      */}
      {photoUri ? (
        <View style={styles.printRow}>
          <View style={styles.print}>
            <Image
              source={{ uri: photoUri }}
              style={styles.printPhoto}
              contentFit="cover"
              accessible={false}
              enforceEarlyResizing
            />
          </View>
          <View style={styles.printText}>
            <View accessible>
              <Text style={styles.photoTitle}>Your photo</Text>
              <Text style={styles.photoBody}>
                {photoFrom === 'camera' ? 'Taken just now' : 'From your library'}
              </Text>
            </View>
            {/*
              The camera route keeps its camera, and is "Retake" only after
              a photo was taken: after a library pick, "Retake" would name
              a photo nobody took. "Choose another" is the library's.
              Small buttons that wrap, so a 375pt phone and large text keep
              both labels whole.
            */}
            <View style={styles.printActions}>
              <Button
                label={photoFrom === 'camera' ? 'Retake' : 'Take photo'}
                variant="secondary"
                size="sm"
                icon="camera"
                onPress={() => void takePhoto()}
                accessibilityLabel={photoFrom === 'camera' ? 'Retake photo' : 'Take a photo instead'}
              />
              <Button
                label="Choose another"
                variant="secondary"
                size="sm"
                onPress={() => void choosePhoto()}
                accessibilityLabel="Choose another photo"
              />
            </View>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.well} accessible>
            <View style={styles.wellTile}>
              <Icon name="camera" size={26} color={colors.text} />
            </View>
            <View style={styles.wellText}>
              <Text style={styles.photoTitle}>Add a photo</Text>
              <Text style={styles.photoBody}>Take one now, or pick one you already took.</Text>
            </View>
          </View>

          {/*
            The drink card's two labels, Take photo and Choose photo, as on
            its sheet for posting it again; "Camera roll" was a third name
            for the library. One app names the two routes once.
          */}
          <View style={styles.photoActions}>
            <Button
              label="Take photo"
              variant="secondary"
              icon="camera"
              onPress={() => void takePhoto()}
              style={styles.photoAction}
            />
            <Button
              label="Choose photo"
              variant="secondary"
              icon="grid"
              onPress={() => void choosePhoto()}
              style={styles.photoAction}
            />
          </View>
        </>
      )}

      {/* ---- What was it ---- */}
      <SectionHeader title="What was it?" style={styles.sectionTitle} />

      {/*
        The app's one search field, so it is the Dex's field and not a
        near-miss of it. It searches name, style and origin, so it takes
        the Dex's placeholder: it names how to search rather than how much,
        which is the help this screen exists for. Someone at a bar who never
        heard the drink's name can still type "tiki" or "mexico".
      */}
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder="Name, style or country"
        accessibilityLabel="Search for the drink you had, by name, style or country"
        style={styles.search}
      />

      {/*
        The choice stays in view whatever is typed next. It used to show only
        while the search was empty, so searching again to compare hid the
        drink that Save would still use.
      */}
      {drink && selectedApart ? (
        <View style={styles.selectedBlock}>
          <Text style={styles.selectedLabel}>Selected</Text>
          {/* A group of one, drawn like the results below it. */}
          <DrinkRow
            drink={drink}
            selected
            collected={isCustom ? inDex(customPours, drink.id) : inDex(unlocks, drink.id)}
            photoUri={selectedCustom ? customPhoto(selectedCustom) : null}
            badge={isCustom ? 'yours' : undefined}
            rowWidth={rowWidth}
            first
            last
            onPress={selectDrink}
          />
          {preview}
        </View>
      ) : null}
    </View>
  );

  /*
   * Under the results: how many were left out, the collect preview, then
   * the way to add a drink the Dex does not have. The preview follows the
   * list it was chosen from, in the scroll and not in the save bar, which
   * stays as short as it was while the keyboard is up. A choice the
   * results do not hold keeps its preview in the Selected block instead.
   */
  const more = results.rows.length > 0 && results.total > MAX_RESULTS;
  const addUnder = results.rows.length > 0 && offerAdd;
  const previewUnder = selectedApart ? null : preview;
  const footer =
    more || previewUnder || addUnder ? (
      <View>
        {more ? (
          <Text style={styles.moreHint}>
            Showing the best {MAX_RESULTS} of {formatCount(results.total)}. Keep typing to narrow
            them down.
          </Text>
        ) : null}
        {previewUnder}
        {addUnder ? <NotTheOne query={trimmed} onAdd={openAdd} /> : null}
      </View>
    ) : null;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? windowH - sheet.h : 0}
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        setSheet((s) => (s.w === w && s.h === h ? s : { w, h }));
      }}>
      {/*
        The paper grain, first, so everything on the page lies over it:
        photographs and thumbnails stay clean, and the white panels are
        stock on a grained page. iOS presents this sheet in its own view
        controller above the React root, so no grain from anywhere else
        reaches it. pointerEvents none, so it takes no taps.
      */}
      <Grain />

      {/*
        The app's one top bar. No status-bar inset on iOS: the page sheet
        starts below the status bar, and the root's inset added inside it
        left a blank band above the bar. Android presents the modal full
        screen and does need it. "Post a drink", the words the tab bar and
        the home bar use for this act. The rule is always drawn: a sheet's
        bar sits over a list from the start. Save stays in the bottom bar,
        where the thumb is.
      */}
      <ScreenTopBar
        title="Post a drink"
        size="md"
        inset={Platform.OS === 'ios' ? 'sheet' : 'safe'}
        showRule
        left={<TopBarTextButton label="Cancel" muted onPress={() => router.back()} />}
      />

      <FlatList
        data={results.rows}
        keyExtractor={(r) => r.drink.id}
        renderItem={({ item, index }) => (
          <DrinkRow
            drink={item.drink}
            selected={drink?.id === item.drink.id}
            collected={
              item.custom ? inDex(customPours, item.drink.id) : inDex(unlocks, item.drink.id)
            }
            photoUri={item.custom ? customPhoto(item.custom) : null}
            badge={item.custom ? 'yours' : undefined}
            rowWidth={rowWidth}
            first={index === 0}
            last={index === results.rows.length - 1}
            onPress={selectDrink}
          />
        )}
        ListHeaderComponent={header}
        /*
          The Dex's empty search, in the Dex's words: the same field, so the
          same miss reads the same way, with the same way out. It keeps
          examples the Dex does not print, because this screen is where
          someone has a drink and no name for it, and "tiki", "amaro" and
          "mexico" each find dozens.

          And, for a name of two characters or more, the way to add it: a
          drink with no match may simply not be in the Dex yet.
        */
        ListEmptyComponent={
          trimmed.length > 0 ? (
            offerAdd ? (
              <EmptyState
                icon="search"
                title={`No match for “${trimmed}”`}
                body="Check the spelling, or search by style or country: “tiki”, “amaro” and “mexico” all work. Not in the Dex? Add it."
                action={{ label: `Add “${shortQuery(trimmed)}”`, onPress: openAdd }}
                secondaryAction={{ label: 'Clear search', onPress: () => setQuery('') }}
              />
            ) : (
              <EmptyState
                icon="search"
                title={`No match for “${trimmed}”`}
                body="Check the spelling, or search by style or country: “tiki”, “amaro” and “mexico” all work."
                action={{ label: 'Clear search', onPress: () => setQuery('') }}
              />
            )
          ) : null
        }
        ListFooterComponent={footer}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />

      {/* ---- Save ---- */}
      <View style={[styles.saveBar, { paddingBottom: insets.bottom + space.md }]}>
        {/*
          Music, above the caption, only where the sheet can post.
          No song: one small button. A song: its cover, title and artist,
          and Remove. No preview plays here; the picker is where a song is
          auditioned, beside its Apple Music link.
        */}
        {offerMusic ? (
          song ? (
            <View style={styles.songRow}>
              <View
                accessible
                accessibilityLabel={`Music, ${song.title} by ${song.artist}`}
                style={styles.songInfo}>
                <SongArtwork url={song.artworkUrl} size={32} />
                {/*
                  Uncapped, like the caption and buttons beside it: the bar
                  is not a fixed frame. One line each keeps it bounded.
                */}
                <View style={styles.songText}>
                  <Text numberOfLines={1} style={styles.songTitle}>
                    {song.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.songArtist}>
                    {song.artist}
                  </Text>
                </View>
              </View>
              {/*
                Not during a save: save() has already read the song, so a
                Remove mid-save would say "removed" and post it anyway.
              */}
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
        {/*
          The app's one form input, with the same label, prompt, cap and
          props as the caption on the drink card's sheet, so the one
          caption is asked for one way from both doors. A visible label,
          not only a placeholder: the placeholder is gone the moment
          anything is typed, and with it the only sign that the caption is
          optional. Field links a refused caption to the input and speaks
          it when it appears. Prose, so capitals and autocorrect are on.
        */}
        <Field
          label="Add a caption"
          value={note}
          onChangeText={onNoteChange}
          placeholder="Where you had it, what you thought"
          maxLength={NOTE_MAX}
          autoCapitalize="sentences"
          autoCorrect
          returnKeyType="done"
          error={noteError}
          accessibilityLabel="Caption, optional"
        />
        {/*
          The same pair, in the same order, as the sheet on a Dex card.
          Only the pressed one shows it is working. The other keeps its
          look, and save() ignores it until the first has finished (see
          canSave). A save answers with the success haptic; buttons do not
          tick.
        */}
        <View style={styles.saveRow}>
          <Button
            label={relog ? 'Save photo' : 'Save to Dex'}
            variant="secondary"
            onPress={() => void save(false)}
            disabled={!canSave}
            loading={savingAs === 'dex'}
            style={styles.saveBtn}
          />
          <Button
            label="Save & post"
            onPress={() => void save(true)}
            disabled={!canPost}
            loading={savingAs === 'post'}
            style={styles.saveBtn}
          />
        </View>
        {saveHint ? <Text style={styles.saveHint}>{saveHint}</Text> : null}
      </View>

      {/*
        Rendered here as well as at the root. While this sheet is up it is
        the only one that can be seen; once it closes, the root instance
        covers every other way a drink is collected.
      */}
      <CelebrationOverlay />

      {/* Only while story music is on; it presents itself over this sheet. */}
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

  /*
   * Everything keeps the gutter, the results included: they are one
   * grouped panel on the page (white, a 1pt edge, the panel corner), not
   * a system list run edge to edge.
   */
  list: { paddingHorizontal: layout.gutter, paddingBottom: space.xxxl },

  /* Photograph, empty: a 96pt well with a camera tile and two lines */
  well: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.lg,
    marginTop: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    borderWidth: stroke.edge,
    borderColor: colors.lineControl,
  },
  wellTile: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSunk,
    borderRadius: radius.control,
    borderWidth: stroke.edge,
    borderColor: colors.line,
  },
  wellText: { flex: 1, gap: 2 },
  photoTitle: { ...textRole.sectionTitle, color: colors.text },
  photoBody: { ...textRole.helper, color: colors.textMuted },

  photoActions: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  photoAction: { flex: 1 },

  /*
   * Photograph, picked: a print on bone mat, 90x120, beside its two lines
   * and buttons. Flat on the paper: a card on paper casts no shadow.
   */
  printRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    marginTop: space.sm,
  },
  print: {
    width: 90,
    height: 120,
    padding: space.xs,
    backgroundColor: colors.mat,
    borderRadius: 6,
    borderWidth: stroke.edge,
    borderColor: colors.line,
  },
  printPhoto: { flex: 1, borderRadius: 3 },
  printText: { flex: 1 },
  printActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },

  sectionTitle: {
    marginTop: space.xl,
    marginBottom: space.md,
  },

  search: { marginBottom: space.md },

  /*
   * A result row, and its share of the group's edge: every row draws the
   * top rule (the first one's is the group's top edge, the others' the
   * separator), the first takes the top corners and the last the bottom
   * edge and corners. Min 72, and it grows with the name.
   */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 72,
    paddingVertical: space.sm,
    paddingHorizontal: ROW_PAD,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderTopWidth: stroke.edge,
    borderLeftWidth: stroke.edge,
    borderRightWidth: stroke.edge,
  },
  rowFirst: { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card },
  rowLast: {
    borderBottomWidth: stroke.edge,
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
  },
  rowPressed: { backgroundColor: colors.bgSunk },
  rowSelected: { backgroundColor: colors.wineWash },
  /* The chosen row's 1.5pt wine edge, inside the group's 1pt one (corner 12 − 1). */
  rowEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1.5,
    borderColor: colors.wine,
  },
  rowEdgeFirst: { borderTopLeftRadius: radius.card - 1, borderTopRightRadius: radius.card - 1 },
  rowEdgeLast: { borderBottomLeftRadius: radius.card - 1, borderBottomRightRadius: radius.card - 1 },
  rowText: { flex: 1, gap: 2 },
  rowMeta: { ...textRole.helper, color: colors.textMuted },
  rowNumber: { color: colors.taupeInk, ...tabular },
  rowStatusStacked: { flexDirection: 'row', marginTop: space.xs },
  /* taupeInk: "yours" is a provenance, not a state, so it is not the state's muted grey. */
  rowYours: {
    fontFamily: fonts.bodyMedium,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.taupeInk,
  },
  /* 16 above the results, so the group of one and the results read as two panels. */
  selectedBlock: { marginBottom: space.lg },
  selectedLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    marginBottom: space.xs,
  },
  moreHint: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    marginTop: space.md,
  },

  /* The collect preview: a lining panel 16pt under the results */
  preview: { marginTop: space.lg, paddingVertical: space.md, paddingHorizontal: 14 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  previewText: { flex: 1, gap: 2 },
  previewTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 17,
    lineHeight: 22,
    color: colors.onLining,
  },
  previewMeta: { ...textRole.helper, color: colors.onLiningMuted, ...tabular },

  /* "Not the one you meant?" under the results */
  notTheOne: {
    paddingTop: space.xl,
    paddingBottom: space.md,
    alignItems: 'center',
    gap: space.sm,
  },
  notTheOneText: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    textAlign: 'center',
  },

  /* Save */
  saveBar: {
    paddingHorizontal: layout.gutter,
    paddingTop: space.md,
    gap: space.md,
    borderTopWidth: stroke.edge,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  /* Music: the button keeps its own width; a song is a 32pt cover, two lines and Remove. */
  addMusic: { alignSelf: 'flex-start' },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  songInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  songText: { flex: 1 },
  songTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, lineHeight: 18, color: colors.text },
  songArtist: { ...textRole.helper, color: colors.textMuted },
  saveRow: { flexDirection: 'row', gap: space.md },
  saveBtn: { flex: 1 },
  saveHint: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
