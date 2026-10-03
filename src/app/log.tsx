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

import { DrinkArt } from '@/components/artwork';
import { CelebrationOverlay } from '@/components/CelebrationOverlay';
import { Grain } from '@/components/Grain';
import { Icon } from '@/components/icons';
import { ScreenTopBar, TopBarTextButton } from '@/components/ScreenTopBar';
import {
  announce,
  Button,
  CategoryTag,
  EmptyState,
  Field,
  haptic,
  SearchField,
  SectionHeader,
} from '@/components/ui';
import {
  CATEGORY_META,
  colors,
  fonts,
  layout,
  radius,
  space,
  stroke,
  textRole,
  type as typeScale,
} from '@/constants/theme';
import { formatCount, getDrink } from '@/data';
import { drinkPhoto } from '@/data/drinkPhotos';
import { catalogueTwin, isCustomId, ownTwin, shortQuery, toDrink } from '@/lib/customDrinks';
import { fold, MAX_RESULTS, rank, rankCustom, SEARCH_INDEX } from '@/lib/drinkSearch';
import { containsObjectionable, OBJECTIONABLE_MESSAGE } from '@/lib/moderation';
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
import { useAuth } from '@/store/auth';
import { useCelebrate } from '@/store/celebrate';
import { useCollection } from '@/store/collection';
import { customDrinkById, useCustomDrinks } from '@/store/customDrinks';
import { useSocial } from '@/store/social';
import type { CustomDrink, Drink } from '@/types';
import { confirmDestructive, showNotice } from '@/utils/alerts';

/* ==================================================================== */
/* Log a pour                                                           */
/*                                                                      */
/* The centre action's destination: photograph first, then say what it  */
/* was.                                                                 */
/*                                                                      */
/* That order is the whole point of this screen existing. Logging from  */
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
/* A pour of a drink someone added is kept in their Dex, not posted:    */
/* followers' phones look drinks up in the catalogue, which does not    */
/* have it until Sipply adds it.                                        */
/* ==================================================================== */

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

/**
 * One result, as a list row: a 44pt thumbnail on the category's wash, the
 * name with its style and origin, and what the drink is to you at the end.
 *
 * A fill answers the press, not a scale: a row is a control, not a
 * picture. The chosen row keeps the wine wash and gains a check, so the
 * choice is said by a shape as well as a colour (it was a check in a wine
 * disc, one of the app's nine icons in circles). The word at the end is
 * "Yours" for a drink this person added, "Collected" for one already in
 * the Dex, and the category tag otherwise.
 */
function DrinkRow({
  drink,
  selected,
  collected,
  photoUri,
  badge,
  onPress,
}: {
  drink: Drink;
  selected: boolean;
  /** Already logged, so saving it again updates rather than adds. */
  collected: boolean;
  /** The drink's own photo (a drink someone added), drawn ahead of any stock one. */
  photoUri?: string | null;
  /** 'yours': a drink this person added, not one from the catalogue. */
  badge?: 'yours';
  onPress: (d: Drink) => void;
}) {
  const photo = photoUri ? { uri: photoUri } : badge ? undefined : drinkPhoto(drink.id);
  /*
   * Spoken as a plain number. The Dex prints it padded, "#0042", which
   * VoiceOver reads out zero by zero; the padding is for the eye, and
   * DexCard says it the same way. A drink someone added has no number, and
   * says whose it is instead.
   *
   * "Collected" is the state's one word: the Dex filter, the profile stat
   * and the celebration card all use it.
   */
  const spoken = badge
    ? `${drink.name}, ${drink.subcategory}, added by you${collected ? ', collected' : ''}`
    : `${drink.name}, ${drink.subcategory}, number ${drink.dexNumber}${collected ? ', collected' : ''}`;
  return (
    <Pressable
      onPress={() => onPress(drink)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={spoken}
      style={({ pressed }) => [
        styles.row,
        selected ? styles.rowSelected : pressed ? styles.rowPressed : null,
      ]}>
      <View style={[styles.rowArt, { backgroundColor: CATEGORY_META[drink.category].wash }]}>
        {photo ? (
          <Image source={photo} style={styles.rowPhoto} contentFit="cover" transition={120} enforceEarlyResizing />
        ) : (
          <DrinkArt drink={drink} size={34} flat />
        )}
      </View>

      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>
          {drink.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {[drink.subcategory, drink.origin].filter(Boolean).join(' · ')}
        </Text>
      </View>

      {selected ? (
        <Icon name="check" size={20} color={colors.wine} />
      ) : badge ? (
        <Text style={styles.rowYours}>Yours</Text>
      ) : collected ? (
        <Text style={styles.rowCollected}>Collected</Text>
      ) : (
        <CategoryTag category={drink.category} />
      )}
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

/* -------------------------------------------------------------------- */

export default function LogPourScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();

  /*
   * `/log?drink=<id>` opens with that drink chosen: a Dex entry's or a
   * custom drink's "Log this drink" and "Update photo". Only the photo is
   * left to do, so a drink chosen this way does not count as work to
   * discard on the way out (see `dirty`).
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
  const [drink, setDrink] = useState<Drink | null>(() => resolveDrink(preselectId));
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  /** Said under the note when the caption would be refused. */
  const [noteError, setNoteError] = useState<string | null>(null);
  /** Which button is saving, so only that one says so. */
  const [savingAs, setSavingAs] = useState<'dex' | 'post' | null>(null);
  /** Once the pour is saved: whether it went in new or as a re-log. */
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
   * card's Update photo sheet commits with "Save photo", and so does this
   * button. It behaves the same way too — a post of the entry, if there is
   * one, takes the new photo, and none is created (see save()).
   *
   * After the save it is read from what the save was, not from the
   * stores. By then every drink on this sheet has a pour, so re-reading
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
   * It used to call router.back() the instant the pour was saved, which
   * put the celebration in an impossible position: this is a native-stack
   * MODAL, presented by iOS in its own view controller above the React
   * root, so the overlay mounted beside <Stack> renders underneath it and
   * is never seen. Dismissing first and hoping the card catches up is a
   * race against an animation.
   *
   * So the sheet stays, renders the celebration itself — same tree, no
   * cross-window layering to reason about — and leaves when the queue is
   * empty. Both this instance and the root one read the same queue, and a
   * dismissal pops it once, so the card can never appear twice. A pour of
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
    if (r.ok) setPhotoUri(r.uri);
    else if (r.reason !== 'cancelled') notice(r);
  }, []);

  const choosePhoto = useCallback(async () => {
    const r = await pickFromLibrary();
    if (r.ok) setPhotoUri(r.uri);
    else if (r.reason !== 'cancelled') notice(r);
  }, []);

  const selectDrink = useCallback((d: Drink) => {
    haptic.select();
    setDrink(d);
  }, []);

  /*
   * The add-a-drink form, named after the search. It takes this sheet's
   * photo along (setSeed), as a copy: the photo stays here too, ready to
   * save as the pour once the drink comes back selected.
   */
  const openAdd = useCallback(() => {
    Keyboard.dismiss();
    useCustomDrinks.getState().setSeed({ photoUri });
    router.push({ pathname: '/add-drink', params: { name: trimmed, from: 'log' } });
  }, [photoUri, router, trimmed]);

  /*
   * Back from the form: the drink just added, or the catalogue drink one of
   * its "Already in the Dex?" rows pointed at, chosen here. The note waits
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
  const saveHint =
    photoUri == null || drink == null
      ? null
      : isCustom
        ? 'Drinks you added stay in your Dex until they join the catalogue.'
        : !myId
          ? 'Sign in to post. Saving to your Dex works either way.'
          : relog
            ? 'If you shared this entry, the post gets the new photo too.'
            : null;

  const onNoteChange = useCallback((text: string) => {
    setNote(text);
    setNoteError(null);
  }, []);

  const save = useCallback(
    async (alsoPost: boolean) => {
      /*
       * First, before the guard. Tapping Save does not blur the note or the
       * search field, and a keyboard left up would sit over the lower half
       * of the celebration card, Done button included.
       */
      Keyboard.dismiss();
      if (!photoUri || !drink || busy || saved) return;
      const trimmedNote = note.trim();

      /*
       * A drink someone added: the pour goes to their own store, beside
       * the drink, never into the collection. It does not move the Dex's
       * count, and there is no number or rarity to celebrate, so nothing
       * plays. It cannot be posted (the button is off), and the note is
       * never a caption, so it is not checked as one.
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
       * The note only becomes a caption when it is posted, so only a post
       * is checked. The server has the final word — its trigger rejects the
       * caption whatever this says — but catching it here keeps the message
       * next to the field, before anything has been saved.
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
         * Not awaited. The pour is saved and celebrated the moment it is
         * local; uploading the photo can take seconds on a bar's signal,
         * and holding the sheet open on a spinning button for that long
         * after the card is dismissed made a finished task look stuck. What
         * became of the post still reaches the user, as a notice once it is
         * known.
         *
         * A re-log goes through the same call: addPost adds the photo to
         * the post that already exists and keeps its caption, which a note
         * only fills if it was blank. No note means no caption, not a
         * filler line — the post already says what was logged.
         *
         * A re-log kept off the feed ("Save photo") still keeps a post in
         * step, as the drink card's Update photo does: a post left showing
         * the replaced picture is the entry contradicting itself. It never
         * creates one, so an entry kept to the Dex stays there. Not awaited
         * either; a failure arrives as a notice, as a post's does.
         */
        if (alsoPost && myId) {
          void addPost(myId, drink.id, trimmedNote, uri).then(reportPost);
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
   * that only holds the drink it was opened for.
   *
   * This catches the swipe and Cancel alike, since both go through the
   * navigator. The post-save close is not held up: `saved` is already
   * set by the time it runs. Mid-save, the attempt is simply ignored
   * rather than offering to discard a save that is already happening.
   */
  const dirty =
    !saved &&
    (photoUri != null || (drink != null && drink.id !== preselectId) || note.trim().length > 0);
  usePreventRemove(dirty, ({ data }) => {
    if (busy) return;
    confirmDestructive(
      'Discard this pour?',
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
   */
  const { height: windowH } = useWindowDimensions();
  const [sheetH, setSheetH] = useState(windowH);

  /** A drink's own photo for its row: the pour's, else the one it was added with. */
  const customPhoto = (c: CustomDrink) =>
    (inDex(customPours, c.id) ? customPours[c.id].photoUri : null) ||
    customPhotoUri(c.photoFile) ||
    null;

  const selectedCustom = isCustom && drink ? (customDrinkById(drink.id) ?? null) : null;

  const header = (
    <View style={styles.gutter}>
      {/* ---- The photograph ---- */}
      {/*
        The frame shows; the two buttons under it act.

        It used to be the frame itself that took a photo, with the library
        as a text link below — which made the camera the only obvious way
        in and hid the fact that a pour already in your roll works just as
        well. Half the time the drink was photographed before anyone
        thought to open Sipply, so the two routes are peers now rather than
        a button and a footnote.

        An inset photo: the panel corner and a drawn edge on the sunk well.
        Empty, it shows a bare camera and two lines; the wine disc the
        camera sat in was one of the app's nine icons in circles.
      */}
      <View style={styles.photoFrame}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" enforceEarlyResizing />
        ) : (
          <View style={styles.photoEmpty}>
            <Icon name="camera" size={32} color={colors.text} />
            <Text style={styles.photoEmptyTitle}>Add a photo</Text>
            <Text style={styles.photoEmptyBody}>Take one now, or pick one you already took.</Text>
          </View>
        )}
      </View>

      {/*
        The drink card's two labels, Take photo and Choose photo, and one
        label each in both states: the frame above already shows that a
        photo has been chosen. "Retake" came up after a library pick too,
        naming a photo that was never taken; "Choose another" did not fit a
        half-width button; "Camera roll" was a third name for the library.
        One app names the two routes once.
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
        drink that Save would still log.
      */}
      {drink && !results.rows.some((r) => r.drink.id === drink.id) ? (
        <View style={styles.selectedBlock}>
          <Text style={styles.selectedLabel}>Selected</Text>
          {/* Full-bleed like the rows below it, so the gutter is taken back. */}
          <View style={styles.bleed}>
            <DrinkRow
              drink={drink}
              selected
              collected={isCustom ? inDex(customPours, drink.id) : inDex(unlocks, drink.id)}
              photoUri={selectedCustom ? customPhoto(selectedCustom) : null}
              badge={isCustom ? 'yours' : undefined}
              onPress={selectDrink}
            />
          </View>
        </View>
      ) : null}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? windowH - sheetH : 0}
      onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}>
      {/*
        The app's one top bar. No status-bar inset on iOS: the page sheet
        starts below the status bar, and the root's inset added inside it
        left a blank band above the bar. Android presents the modal full
        screen and does need it. "Log", the word the tab bar and the drink
        card use for this act. The rule is always drawn: a sheet's bar sits
        over a list from the start. Save stays in the bottom bar, where the
        thumb is.
      */}
      <ScreenTopBar
        title="Log a pour"
        size="md"
        inset={Platform.OS === 'ios' ? 'sheet' : 'safe'}
        showRule
        left={<TopBarTextButton label="Cancel" muted onPress={() => router.back()} />}
      />

      <FlatList
        data={results.rows}
        keyExtractor={(r) => r.drink.id}
        renderItem={({ item }) => (
          <DrinkRow
            drink={item.drink}
            selected={drink?.id === item.drink.id}
            collected={
              item.custom ? inDex(customPours, item.drink.id) : inDex(unlocks, item.drink.id)
            }
            photoUri={item.custom ? customPhoto(item.custom) : null}
            badge={item.custom ? 'yours' : undefined}
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
        ListFooterComponent={
          results.rows.length > 0 && (results.total > MAX_RESULTS || offerAdd) ? (
            <View style={styles.gutter}>
              {results.total > MAX_RESULTS ? (
                <Text style={styles.moreHint}>
                  Showing the best {MAX_RESULTS} of {formatCount(results.total)}. Keep typing to
                  narrow them down.
                </Text>
              ) : null}
              {offerAdd ? <NotTheOne query={trimmed} onAdd={openAdd} /> : null}
            </View>
          ) : null
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />

      {/* ---- Save ---- */}
      <View style={[styles.saveBar, { paddingBottom: insets.bottom + space.md }]}>
        {/*
          The app's one form input, with the same label, prompt, cap and
          props as the note on the drink card's sheet, so the one note is
          asked for one way from both doors. A visible label, not only a
          placeholder: the placeholder is gone the moment anything is
          typed, and with it the only sign that the note is optional. Field
          links a refused caption to the input and speaks it when it
          appears. Prose, so capitals and autocorrect are on.
        */}
        <Field
          label="Note (optional)"
          value={note}
          onChangeText={onNoteChange}
          placeholder="Where you had it, what you thought"
          maxLength={NOTE_MAX}
          autoCapitalize="sentences"
          autoCorrect
          returnKeyType="done"
          error={noteError}
          accessibilityLabel="Note, optional"
        />
        {/*
          The same pair, in the same order, as the sheet on a Dex card.
          Only the pressed one shows it is working. The other keeps its
          look, and save() ignores it until the first has finished (see
          canSave). A saved pour answers with the success haptic; buttons
          do not tick.
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
            disabled={!canSave || !myId || isCustom}
            loading={savingAs === 'post'}
            style={styles.saveBtn}
          />
        </View>
        {saveHint ? <Text style={styles.saveHint}>{saveHint}</Text> : null}
      </View>

      {/*
        The paper grain, again. iOS presents this sheet in its own view
        controller above the React root, so the root layout's Grain is
        underneath it and this page would otherwise be the one flat fill in
        the app. Above the content and below the celebration, the same
        order as the root: the card stays clean stock on a grained page.
        pointerEvents none, so it takes no taps.
      */}
      <Grain />

      {/*
        Rendered here as well as at the root. While this sheet is up it is
        the only one that can be seen; once it closes, the root instance
        covers every other way a pour gets logged.
      */}
      <CelebrationOverlay />
    </KeyboardAvoidingView>
  );
}

/* -------------------------------------------------------------------- */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  /*
   * The rows run edge to edge, as a system list's do, so their pressed and
   * chosen fills reach both sides; everything else keeps the gutter, and a
   * row's own padding puts its thumbnail on the same line.
   */
  list: { paddingBottom: space.xxxl },
  gutter: { paddingHorizontal: layout.gutter },
  bleed: { marginHorizontal: -layout.gutter },

  /* Photograph: an inset photo */
  photoFrame: {
    aspectRatio: 4 / 3,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.bgSunk,
    borderWidth: stroke.edge,
    borderColor: colors.line,
    marginTop: space.sm,
  },
  photo: { width: '100%', height: '100%' },
  photoEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
    gap: space.xs,
  },
  photoEmptyTitle: {
    marginTop: space.sm,
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.bodySm.fontSize,
    lineHeight: typeScale.bodySm.lineHeight,
    color: colors.text,
  },
  photoEmptyBody: {
    ...textRole.helper,
    color: colors.textMuted,
    textAlign: 'center',
  },

  photoActions: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  photoAction: { flex: 1 },

  sectionTitle: {
    marginTop: space.xl,
    marginBottom: space.md,
  },

  search: { marginBottom: space.md },

  /* Result row: ListRow's metrics, with its own trailing word */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: layout.rowTall,
    paddingVertical: space.md,
    paddingHorizontal: layout.gutter,
  },
  rowPressed: { backgroundColor: colors.bgSunk },
  rowSelected: { backgroundColor: colors.wineWash },
  /* A thumbnail under 48pt: the badge corner and a drawn edge. */
  rowArt: {
    width: 44,
    height: 44,
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: colors.line,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowPhoto: { width: '100%', height: '100%' },
  rowText: { flex: 1 },
  rowName: {
    ...textRole.rowTitle,
    fontFamily: fonts.bodySemiBold,
    color: colors.text,
  },
  rowMeta: {
    ...textRole.rowSubtitle,
    color: colors.textMuted,
  },
  rowCollected: {
    fontFamily: fonts.body,
    fontSize: typeScale.bodySm.fontSize,
    lineHeight: typeScale.bodySm.lineHeight,
    color: colors.textMuted,
  },
  /* taupeInk: "yours" is a provenance, not a state, so it is not the state's muted grey. */
  rowYours: {
    fontFamily: fonts.bodyMedium,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.taupeInk,
  },
  selectedBlock: { marginBottom: space.sm },
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
