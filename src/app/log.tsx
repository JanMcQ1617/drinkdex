import { Image } from 'expo-image';
import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrinkArt } from '@/components/artwork';
import { Icon } from '@/components/icons';
import { Button, CategoryPill, EmptyState, PressableScale, haptic } from '@/components/ui';
import { colors, fonts, radius, space, type as typeScale } from '@/constants/theme';
import { DRINKS, formatCount, TOTAL } from '@/data';
import { drinkPhoto } from '@/data/drinkPhotos';
import { containsObjectionable, OBJECTIONABLE_MESSAGE } from '@/lib/moderation';
import {
  NOTE_MAX,
  persistPhoto,
  pickFromCamera,
  pickFromLibrary,
  reportPost,
  type PickResult,
} from '@/lib/pour';
import { CelebrationOverlay } from '@/components/CelebrationOverlay';
import { Grain } from '@/components/Grain';
import { useAuth } from '@/store/auth';
import { useCelebrate } from '@/store/celebrate';
import { useCollection } from '@/store/collection';
import { useSocial } from '@/store/social';
import type { Drink } from '@/types';
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
/* ==================================================================== */

/** How many matches to render. Past this, typing more is quicker than scrolling. */
const MAX_RESULTS = 40;

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

/** Own keys only: the collection is a plain object, and 'constructor' is not a drink. */
function inDex(unlocks: Record<string, unknown>, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(unlocks, id);
}

/* -------------------------------------------------------------------- */
/* Search                                                               */
/* -------------------------------------------------------------------- */

/** Lower case with accents dropped, so "anejo" finds "Añejo". Same fold as the bar search. */
function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Letters and digits, including the folded Latin letters that have no ASCII base (ø, ß, ı). */
const WORD_CHAR = /[a-z0-9\u00c0-\u024f]/;

/** True when `q` occurs in `s` at the start of a word, not inside one. */
function atWordStart(s: string, q: string): boolean {
  for (let i = s.indexOf(q); i !== -1; i = s.indexOf(q, i + 1)) {
    if (i === 0 || !WORD_CHAR.test(s[i - 1])) return true;
  }
  return false;
}

/** Folded once at load, not on every keystroke. */
const SEARCH_INDEX = DRINKS.map((d) => ({
  drink: d,
  name: fold(d.name),
  style: fold(d.subcategory),
  place: fold(d.origin),
}));

/*
 * How well an entry answers the query, lower is better, or -1 for not at
 * all. The name outranks the style, which outranks the place: someone
 * typing "vodka" means Vodka Soda before a vodka from somewhere, and
 * with the list capped, anything ranked low enough is never seen.
 *
 * Styles and places only match at the start of a word. A raw substring
 * test let "gin" find everything from the Virgin Islands and put a
 * Painkiller above the Gin Sour.
 */
function rank(e: (typeof SEARCH_INDEX)[number], q: string): number {
  if (e.name === q) return 0;
  if (e.name.startsWith(q)) return 1;
  if (atWordStart(e.name, q)) return 2;
  if (e.name.includes(q)) return 3;
  if (atWordStart(e.style, q)) return 4;
  if (atWordStart(e.place, q)) return 5;
  return -1;
}

/* -------------------------------------------------------------------- */

function DrinkRow({
  drink,
  selected,
  collected,
  onPress,
}: {
  drink: Drink;
  selected: boolean;
  /** Already in the user's Dex, so saving it again updates rather than adds. */
  collected: boolean;
  onPress: (d: Drink) => void;
}) {
  const photo = drinkPhoto(drink.id);
  /*
   * Spoken as a plain number. The Dex prints it padded, "#0042", which
   * VoiceOver reads out zero by zero; the padding is for the eye, and
   * DexCard says it the same way.
   */
  const spoken = `${drink.name}, ${drink.subcategory}, number ${drink.dexNumber}${collected ? ', in your Dex' : ''}`;
  return (
    /* noHaptic: selectDrink gives the selection tick, and two pulses for one tap read as a buzz. */
    <PressableScale
      onPress={() => onPress(drink)}
      noHaptic
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={spoken}
      style={[styles.row, selected && styles.rowSelected]}>
      <View style={styles.rowArt}>
        {photo ? (
          <Image source={photo} style={styles.rowPhoto} contentFit="cover" transition={120} />
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
        <View style={styles.check}>
          <Icon name="check" size={14} color={colors.textOnWine} />
        </View>
      ) : collected ? (
        <Text style={styles.rowCollected}>In your Dex</Text>
      ) : (
        <CategoryPill category={drink.category} />
      )}
    </PressableScale>
  );
}

/* -------------------------------------------------------------------- */

export default function LogPourScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();

  const unlock = useCollection((s) => s.unlock);
  const unlocks = useCollection((s) => s.unlocks);
  const addPost = useSocial((s) => s.addPost);
  const myId = useAuth((s) => s.session?.user.id);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [drink, setDrink] = useState<Drink | null>(null);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  /** Said under the note when the caption would be refused. */
  const [noteError, setNoteError] = useState<string | null>(null);
  /** Which button is saving, so only that one says so. */
  const [savingAs, setSavingAs] = useState<'dex' | 'post' | null>(null);
  /** Once the pour is in the collection: whether it went in new or as a re-log. */
  const [saved, setSaved] = useState<'new' | 'relog' | null>(null);
  const busy = savingAs !== null;

  /*
   * Picking a drink you already have makes this an update, not a catch:
   * the entry keeps its date and takes the new photo, there is nothing to
   * celebrate, and posting adds the photo to the drink's post rather than
   * starting a second one. The rows and the button say so up front, where
   * "Save to Dex" used to read as adding.
   *
   * After the save it is read from what the save was, not from the
   * collection. By then every drink on this sheet is in the Dex, so
   * re-reading it would flip a new entry's button to "Update photo" under
   * its celebration, and a re-log's back to "Save to Dex" as the sheet
   * closes.
   */
  const relog = drink != null && (saved ? saved === 'relog' : inDex(unlocks, drink.id));

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
   * dismissal pops it once, so the card can never appear twice.
   */
  const pending = useCelebrate((s) => s.queue.length);

  /*
   * Nothing is listed until something is typed. The full index in dex
   * order is not a starting point, it is a wall — and the one thing the
   * user reliably knows here is roughly what the drink was called.
   *
   * Every entry is ranked and the best MAX_RESULTS kept, rather than
   * stopping at the first MAX_RESULTS in dex order. Stopping early was
   * cheaper, but it meant "vodka" filled the list with vodkas from
   * somewhere before reaching Vodka Soda. Ranking the whole index is a
   * few thousand string checks per keystroke, which is nothing.
   */
  const results = useMemo(() => {
    const q = fold(query.trim());
    if (q.length === 0) return { rows: [] as Drink[], total: 0 };
    const hits: { r: number; drink: Drink }[] = [];
    for (const e of SEARCH_INDEX) {
      const r = rank(e, q);
      if (r >= 0) hits.push({ r, drink: e.drink });
    }
    hits.sort((a, b) => a.r - b.r || a.drink.dexNumber - b.drink.dexNumber);
    return { rows: hits.slice(0, MAX_RESULTS).map((h) => h.drink), total: hits.length };
  }, [query]);

  /*
   * No haptic of their own: these are Buttons, which already tick on
   * press-in, and a second pulse on release made one tap feel like two.
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
      const trimmed = note.trim();

      /*
       * The note only becomes a caption when it is posted, so only a post
       * is checked. The server has the final word — its trigger rejects the
       * caption whatever this says — but catching it here keeps the message
       * next to the field, before anything has been saved.
       */
      if (alsoPost && trimmed.length > 0 && containsObjectionable(trimmed)) {
        setNoteError(OBJECTIONABLE_MESSAGE);
        // The live region under the field is Android-only; iOS is told here.
        if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(OBJECTIONABLE_MESSAGE);
        return;
      }

      setSavingAs(alsoPost ? 'post' : 'dex');
      try {
        const uri = await persistPhoto(drink.id, photoUri);

        unlock(drink.id, uri, trimmed.length > 0 ? trimmed : undefined);

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
         */
        if (alsoPost && myId) {
          void addPost(myId, drink.id, trimmed, uri).then(reportPost);
        }

        haptic.success();
        setSaved(relog ? 'relog' : 'new');
      } finally {
        setSavingAs(null);
      }
    },
    [photoUri, drink, busy, saved, relog, note, unlock, myId, addPost],
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
   * first swipe, which keeps the gesture meaning "never mind".
   *
   * This catches the swipe and Cancel alike, since both go through the
   * navigator. The post-save close is not held up: `saved` is already
   * set by the time it runs. Mid-save, the attempt is simply ignored
   * rather than offering to discard a save that is already happening.
   */
  const dirty = !saved && (photoUri != null || drink != null || note.trim().length > 0);
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

  const header = (
    <View>
      {/* ---- The photograph ---- */}
      {/*
        The frame shows; the two buttons under it act.
        
        It used to be the frame itself that took a photo, with the library
        as a text link below — which made the camera the only obvious way
        in and hid the fact that a pour already in your roll works just as
        well. Half the time the drink was photographed before anyone
        thought to open Sipply, so the two routes are peers now rather than
        a button and a footnote.
      */}
      <View style={styles.photoFrame}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" />
        ) : (
          <View style={styles.photoEmpty}>
            <View style={styles.photoEmptyDisc}>
              <Icon name="camera" size={26} color={colors.textOnWine} />
            </View>
            <Text style={styles.photoEmptyTitle}>Photograph your pour</Text>
            <Text style={styles.photoEmptyBody}>
              Or pick one you already took.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.photoActions}>
        <Button
          label={photoUri ? 'Retake' : 'Take photo'}
          variant="secondary"
          icon="camera"
          onPress={() => void takePhoto()}
          style={styles.photoAction}
        />
        {/*
          One label in both states. "Choose another" did not fit a half-width
          button and broke onto two lines beside a one-line Retake; the frame
          above already shows that a photo has been chosen. "Choose photo",
          not "Camera roll": the drink card offers the same two routes as
          Take photo and Choose photo, and one app should name them once.
        */}
        <Button
          label="Choose photo"
          variant="secondary"
          icon="grid"
          onPress={() => void choosePhoto()}
          style={styles.photoAction}
        />
      </View>

      {/* ---- What was it ---- */}
      <Text style={styles.sectionTitle}>What was it?</Text>

      <View style={styles.searchWrap}>
        <Icon name="search" size={17} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${formatCount(TOTAL)} entries`}
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={styles.searchInput}
          accessibilityLabel="Search for the drink you had"
        />
        {query.length > 0 ? (
          <PressableScale
            onPress={() => setQuery('')}
            noHaptic
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={10}>
            <Icon name="close" size={16} color={colors.textMuted} />
          </PressableScale>
        ) : null}
      </View>

      {/*
        The choice stays in view whatever is typed next. It used to show only
        while the search was empty, so searching again to compare hid the
        drink that Save would still log.
      */}
      {drink && !results.rows.some((r) => r.id === drink.id) ? (
        <View style={styles.selectedBlock}>
          <Text style={styles.selectedLabel}>Selected</Text>
          <DrinkRow
            drink={drink}
            selected
            collected={inDex(unlocks, drink.id)}
            onPress={selectDrink}
          />
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
      {/* ---- Bar ---- */}
      {/*
        No status-bar inset on iOS: the page sheet starts below the status
        bar, and the root's inset added inside it left a blank band above
        the bar. Android presents the modal full screen and does need it.
      */}
      <View
        style={[
          styles.topBar,
          { paddingTop: Platform.OS === 'ios' ? space.lg : insets.top + space.sm },
        ]}>
        <PressableScale
          onPress={() => router.back()}
          noHaptic
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          hitSlop={10}
          style={styles.topBarSide}>
          {/* Capped so it stays one line in the fixed slot that keeps the title centred. */}
          <Text style={styles.cancel} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            Cancel
          </Text>
        </PressableScale>

        {/* "Log", the word the tab bar and the drink card use for this act. */}
        <Text style={styles.topBarTitle} accessibilityRole="header">
          Log a pour
        </Text>

        {/* Balances the title against Cancel without a second control. */}
        <View style={styles.topBarSide} />
      </View>

      <FlatList
        data={results.rows}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => (
          <DrinkRow
            drink={item}
            selected={drink?.id === item.id}
            collected={inDex(unlocks, item.id)}
            onPress={selectDrink}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          query.trim().length > 0 ? (
            <EmptyState
              icon="search"
              title="Nothing by that name"
              body="Try the style or the place instead — “tiki”, “amaro”, “oaxaca” all work."
            />
          ) : null
        }
        ListFooterComponent={
          results.total > MAX_RESULTS ? (
            <Text style={styles.moreHint}>
              Showing the best {MAX_RESULTS} of {formatCount(results.total)}. Keep typing to narrow
              them down.
            </Text>
          ) : null
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, { paddingBottom: space.xxxl }]}
        showsVerticalScrollIndicator={false}
      />

      {/* ---- Save ---- */}
      <View style={[styles.saveBar, { paddingBottom: insets.bottom + space.md }]}>
        {/*
          A visible label, not only a placeholder: the placeholder is gone
          the moment anything is typed, and with it the only sign that the
          note is optional and becomes the caption when posted. The same
          strings as the drink card's sheet.
        */}
        <View>
          <Text style={styles.fieldLabel}>Note (optional)</Text>
          <TextInput
            value={note}
            onChangeText={onNoteChange}
            placeholder="Where you had it, what you thought"
            placeholderTextColor={colors.textMuted}
            maxLength={NOTE_MAX}
            style={styles.noteInput}
            accessibilityLabel="Note, optional"
          />
          {noteError ? (
            <Text style={styles.fieldError} accessibilityLiveRegion="polite">
              {noteError}
            </Text>
          ) : null}
        </View>
        {/*
          The same pair, in the same order, as the sheet on a Dex card.
          Only the pressed one shows it is working. The other keeps its
          look, and save() ignores it until the first has finished (see
          canSave). No press tick on either — a saved pour answers with
          the success haptic, and the tick landed a beat before it.
        */}
        <View style={styles.saveRow}>
          <Button
            label={relog ? 'Update photo' : 'Save to Dex'}
            variant="secondary"
            onPress={() => void save(false)}
            disabled={!canSave}
            loading={savingAs === 'dex'}
            noHaptic
            style={styles.saveBtn}
          />
          <Button
            label="Save & post"
            onPress={() => void save(true)}
            disabled={!canSave || !myId}
            loading={savingAs === 'post'}
            noHaptic
            style={styles.saveBtn}
          />
        </View>
        {/*
          Says why the second button is dead rather than leaving a disabled
          control with no explanation — the collection works signed out and
          only sharing does not.
        */}
        {!myId && photoUri && drink ? (
          <Text style={styles.saveHint}>Sign in to post. Saving to your Dex works either way.</Text>
        ) : null}
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

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  topBarSide: { width: 72 },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.displayBold,
    fontSize: typeScale.title.fontSize,
    color: colors.text,
  },
  cancel: {
    fontFamily: fonts.bodyMedium,
    fontSize: typeScale.body.fontSize,
    color: colors.textMuted,
  },

  list: { paddingHorizontal: space.lg },

  /* Photograph */
  photoFrame: {
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginTop: space.sm,
  },
  photo: { width: '100%', height: '100%' },
  photoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  photoEmptyDisc: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.wine,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  photoEmptyTitle: {
    fontFamily: fonts.displayBold,
    fontSize: typeScale.bodyLg.fontSize,
    color: colors.text,
  },
  photoEmptyBody: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
    marginTop: 2,
  },

  photoActions: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  photoAction: { flex: 1 },

  sectionTitle: {
    fontFamily: fonts.displayBold,
    fontSize: typeScale.title.fontSize,
    color: colors.text,
    marginTop: space.sm,
    marginBottom: space.md,
  },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    /* The Dex search's size, so the app's search fields are one field,
       not four near-misses. 44 is the tap minimum; it is a minimum, so
       Larger Text grows the field instead of clipping the query. */
    minHeight: 44,
    marginBottom: space.md,
  },
  searchInput: {
    flex: 1,
    alignSelf: 'stretch',
    fontFamily: fonts.body,
    /* 16 (body) so a mobile browser does not zoom the page on focus. */
    fontSize: typeScale.body.fontSize,
    color: colors.text,
  },

  /* Result row */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    minHeight: 56,
  },
  rowSelected: { backgroundColor: colors.wineWash },
  rowArt: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardAlt,
  },
  rowPhoto: { width: '100%', height: '100%' },
  rowText: { flex: 1 },
  rowName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
  },
  rowMeta: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },
  rowCollected: {
    fontFamily: fonts.bodyMedium,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },
  selectedBlock: { marginBottom: space.sm },
  selectedLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
    paddingHorizontal: space.sm,
    marginBottom: space.xs,
  },
  moreHint: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
    paddingHorizontal: space.sm,
    marginTop: space.md,
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.wine,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Save */
  saveBar: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  fieldLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    marginBottom: space.xs,
  },
  noteInput: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    /* A minimum with its own padding, so Larger Text grows the field. */
    paddingVertical: space.sm,
    minHeight: 46,
  },
  fieldError: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.danger,
    marginTop: space.xs,
  },
  saveRow: { flexDirection: 'row', gap: space.md },
  saveBtn: { flex: 1 },
  saveHint: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
