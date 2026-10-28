import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  confirmUnsave,
  ensureDrinkSaved,
  onSaveToCollectionAction,
  SAVE_TO_COLLECTION,
} from '@/components/collections/bookmark';
import { Paper } from '@/components/details/Paper';
import { PostSheet, type PostSaving, type PostSheetMode } from '@/components/dex/PostSheet';
import {
  CompositionSection,
  DexSinceRow,
  FieldNotes,
  FriendsWhoCaught,
  HeroPrint,
  HeroRecord,
  OriginStory,
  PinnedPostBar,
  pinnedBarEstimate,
  ServeSection,
  serveRows,
  SpecSection,
  TastesOf,
  useMoreBelow,
} from '@/components/DrinkPanels';
import { WherePeopleHadIt } from '@/components/places/WherePeopleHadIt';
import { ScreenTopBar, TopBarButton, useScrolledPast } from '@/components/ScreenTopBar';
import { announce, Button, EmptyState, haptic } from '@/components/ui';
import { colors, layout, space } from '@/constants/theme';
import { getDrink } from '@/data';
import { photoFor } from '@/data/drinkPhotos';
import { containsObjectionable, OBJECTIONABLE_MESSAGE } from '@/lib/moderation';
import { type PlaceRef, placesSupported } from '@/lib/places';
import { placeSearchAvailable } from '@/lib/placeSearch';
import {
  persistPhoto,
  pickFromCamera,
  pickFromLibrary,
  reportPost,
  reportPostPhoto,
  type PickResult,
} from '@/lib/pour';
import { useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';
import { collectionsOn, useCollections, useCollectionsOn } from '@/store/collections';
import { useSocial } from '@/store/social';
import { useTaste, WANT_TO_TRY_MAX } from '@/store/taste';
import { confirmDestructive, showNotice } from '@/utils/alerts';

/*
 * A drink, on the page's white (white spec "not mocked, same kit"; layout
 * spec section 4): a back chevron in a plain bar, the square print full
 * width, the name, the Nº plate and its state, the facts, the spec, the
 * story, the friends who caught it, and one key pinned to the foot (the
 * post key, in the accent since v4.4).
 * Everything the feed and the grids stopped stamping on a drink lives
 * here now.
 *
 * WHY A BAR AND NOT A BUTTON OVER THE PHOTO. Daylight has no scrims: a
 * dark pour photo under the status bar would take its dark glyphs, and a
 * gradient to rescue them is what v4 removed. The page's own bar holds the
 * chevron on white, and the print starts under it.
 *
 * The panels live in components/DrinkPanels, shared with the page for a
 * drink someone added (custom/[id].tsx), so the two are drawn by one piece
 * of code.
 *
 * SAVE. The bar's right slot holds a bookmark on every drink, caught or
 * not, so it is there without scrolling: it keeps the drink in Saved (the
 * tab, and store/taste), solid while it is there, and a second tap takes
 * it out. It works signed out, since saved drinks are the phone's first.
 * Saved is bookmarks, not a list of drinks still to catch, so catching a
 * drink leaves it saved (Jan, 13 Oct 2026).
 *
 * PLACES (v4.8, specs/v4.8-places 3.1 and 3.5). The post sheet offers
 * Add place under the caption; this route holds the pick and sends it
 * with Save & post alone (Save to Dex and Save photo post nothing, so
 * they tag nothing). And the page ends with Where people have had it,
 * which draws nothing until there is a place to show.
 *
 * THE PAPER AND THE FIGURE (v4.9, specs/v4.9/details A.5, C.5). The page
 * and its bar lie on the paper's grain; the unknown drink stays bare, as
 * every dead end does. The first how-section the page draws opens with
 * the drink's figure, "Nº 0100" in the press's outline over the pen's
 * double rule: the spec for a cocktail, else the serve guide, else what
 * it is made of. The same grey caught or not: the plate says which.
 */

export default function DrinkDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const drink = getDrink(id);

  const record = useCollection((s) => (drink ? s.unlocks[drink.id] : undefined));
  const unlock = useCollection((s) => s.unlock);
  const updatePhoto = useCollection((s) => s.updatePhoto);
  const addPhotoForDrink = useSocial((s) => s.addPhotoForDrink);
  const relock = useCollection((s) => s.relock);
  const myId = useAuth((s) => s.session?.user.id);
  const addPost = useSocial((s) => s.addPost);
  const removePostsForDrink = useSocial((s) => s.removePostsForDrink);
  /*
   * Your post of this drink, when the feed store holds it: the "In your
   * Dex since" row then says how many photos it shares and opens it. A
   * find over the loaded feed (100 posts at most), no new query; the
   * object itself is returned, so the selector is stable between renders.
   */
  const myPost = useSocial((s) =>
    drink && myId ? s.feed.find((p) => p.drinkId === drink.id && (p.mine || p.authorId === myId)) : undefined,
  );

  /*
   * In Saved. A refused add is the full list (200), said in words; the
   * key's own label change is spoken too, since VoiceOver does not read a
   * label that changes under the focus by itself.
   */
  const saved = useTaste((s) => (drink ? s.saved.includes(drink.id) : false));
  /*
   * v4.2 §4: with an account and collections there, a save raises the
   * save bar (whose own announcement says "Saved"), holding the bookmark
   * opens Save to collection, and an unsave asks first when the drink is
   * in a collection, which it then leaves (components/collections/bookmark).
   */
  const canCollect = useCollectionsOn();
  const toggleSaved = useCallback(() => {
    if (!drink) return;
    const id = drink.id;
    if (useTaste.getState().saved.includes(id)) {
      confirmUnsave({ kind: 'drink', id }, () => {
        useTaste.getState().setSaved(id, false);
        haptic.tap();
        announce('Removed from Saved');
      });
      return;
    }
    if (!useTaste.getState().toggleSaved(id)) {
      showNotice('Saved is full', `It holds ${WANT_TO_TRY_MAX} drinks. Take one out to save another.`);
      return;
    }
    haptic.tap();
    if (collectionsOn()) useCollections.getState().showBar({ kind: 'drink', id });
    else announce('Saved');
  }, [drink]);
  const saveToCollection = useCallback(() => {
    if (!drink || !collectionsOn()) return;
    if (!ensureDrinkSaved(drink.id)) {
      showNotice('Saved is full', `It holds ${WANT_TO_TRY_MAX} drinks. Take one out to save another.`);
      return;
    }
    haptic.tap();
    useCollections.getState().openSheet({ kind: 'drink', id: drink.id });
  }, [drink]);

  /*
   * The pinned bar's height, measured, so the page's foot always clears
   * it: its label may wrap to two lines at a large text size. Starts at
   * the bar's one-line height and is set again only when it changes.
   */
  const [barH, setBarH] = useState(() => pinnedBarEstimate(insets.bottom));

  /*
   * The two rules: the top bar's once the print has moved under it, and
   * the pinned bar's while there is more page under it. Each flips state
   * only when its side changes, never per frame.
   */
  const [scrolled, onScrollTop] = useScrolledPast();
  const below = useMoreBelow();
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    onScrollTop(e);
    below.onScroll(e);
  };

  // The post sheet's state
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetMode, setSheetMode] = useState<PostSheetMode>('unlock');
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [saving, setSaving] = useState<PostSaving>(null);
  /*
   * Where this photo was had (v4.8): Apple's Place ID and the poster's
   * label for it. Starts empty with every sheet: a place is about one
   * time the drink was had, so the last post's never carries over.
   * Offered only signed in, with migration 026 there, the place-search
   * module in this build and iOS 18 or later (placeSearchAvailable;
   * placesSupported can turn off mid-session, when the server says 026
   * is not there, so it is read at render).
   */
  const [place, setPlace] = useState<PlaceRef | null>(null);
  const placesOn = !!myId && placesSupported() && placeSearchAvailable();

  const openSheet = useCallback((mode: PostSheetMode) => {
    setSheetMode(mode);
    setPickedUri(null);
    setNote('');
    setNoteError(null);
    setPlace(null);
    setSheetVisible(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetVisible(false);
    setPickedUri(null);
    setNote('');
    setNoteError(null);
    setPlace(null);
  }, []);

  /*
   * Picking comes from lib/pour, the same code the + window uses, so there
   * is one answer to where a pour photo comes from, and that answer strips
   * its location and caps its size before anything is stored or shared. A
   * cancelled pick stays silent. A denial is always the camera (the library
   * needs no permission), and its only fix is in Settings, so the alert
   * carries the way there.
   */
  const onPick = useCallback((r: PickResult) => {
    if (r.ok) {
      setPickedUri(r.uri);
    } else if (r.reason === 'denied' && Platform.OS !== 'web') {
      Alert.alert(r.title, r.body, [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ]);
    } else if (r.reason !== 'cancelled') {
      showNotice(r.title, r.body);
    }
  }, []);

  const takePhoto = useCallback(async () => {
    onPick(await pickFromCamera());
  }, [onPick]);

  const choosePhoto = useCallback(async () => {
    onPick(await pickFromLibrary());
  }, [onPick]);

  const onNoteChange = useCallback((text: string) => {
    setNote(text);
    setNoteError(null);
  }, []);

  /*
   * `alsoPost` is the person's answer to "share this?", asked by the two
   * keys in the sheet, as the + window asks it: the same act is never
   * private from one door and public from the other.
   *
   * Posting a caught drink again (the 'update' sheet) asks too. "Save
   * photo" keeps a post that already exists in step and never creates one,
   * so an entry kept to the Dex stays there when its photo changes; "Save
   * & post" is the explicit way to share an entry that was never posted,
   * or whose post failed.
   */
  const handleConfirm = useCallback(
    async (alsoPost: boolean) => {
      if (!drink || !pickedUri || saving) return;
      const trimmed = note.trim();

      /*
       * The note only becomes a caption when it is posted, so only a post
       * is checked. The server has the final word, but catching it here
       * keeps the message next to the field, before anything is saved.
       */
      if (alsoPost && trimmed.length > 0 && containsObjectionable(trimmed)) {
        setNoteError(OBJECTIONABLE_MESSAGE);
        // Field speaks an error when it appears; a repeat press with the same words is answered here.
        if (noteError) announce(OBJECTIONABLE_MESSAGE);
        return;
      }

      setSaving(alsoPost ? 'post' : 'dex');
      // Only Save & post sends a place, and only one picked while places work (P7).
      const placeToSend = alsoPost && placesOn ? place : null;
      try {
        const uri = await persistPhoto(drink.id, pickedUri);
        if (sheetMode === 'update') {
          updatePhoto(drink.id, uri);
          /*
           * A post has to follow the collection, or it keeps showing the
           * picture just replaced. Both paths ADD rather than replace: the
           * newest photo becomes the preview. "Save photo" only ever adds
           * to a post that exists; with none it writes nothing. Neither is
           * awaited. The caption is empty: an existing post keeps its
           * words, and a post the server refused for its caption is retried
           * from here without it (reportPost's promise).
           */
          if (myId && alsoPost) {
            void addPost(myId, drink.id, '', uri, undefined, undefined, placeToSend).then(reportPost);
          } else if (myId) {
            void addPhotoForDrink(myId, drink.id, uri).then(reportPostPhoto);
          }
          closeSheet();
        } else {
          unlock(drink.id, uri, trimmed.length > 0 ? trimmed : undefined);
          /*
           * Only the sharing half needs an account: the collection is
           * local and must never be gated. Not awaited: the upload can take
           * seconds, and the drink is already in the Dex. The outcome goes
           * to reportPost, the + window's handler, so both doors fail in
           * the same words.
           *
           * The catch is not raised here: collection.unlock() queues it for
           * the root CelebrationOverlay, the one surface every way of
           * catching a drink lands on.
           */
          if (alsoPost && myId) {
            void addPost(myId, drink.id, trimmed, uri, undefined, undefined, placeToSend).then(reportPost);
          }
          haptic.success();
          closeSheet();
        }
      } finally {
        setSaving(null);
      }
    },
    [
      addPhotoForDrink,
      addPost,
      closeSheet,
      drink,
      myId,
      note,
      noteError,
      pickedUri,
      place,
      placesOn,
      saving,
      sheetMode,
      unlock,
      updatePhoto,
    ],
  );

  /*
   * Says everything the key is about to do: the same tap deletes the
   * shared post along with other people's likes on it, and Settings'
   * "Reset collection" promises the opposite ("Your posts and account
   * stay"), so the two are told apart in words. Always the system confirm,
   * which iOS colours itself (no red in Daylight).
   */
  const handleRemove = useCallback(() => {
    if (!drink) return;
    confirmDestructive(
      'Remove from collection?',
      myId
        ? `${drink.name} goes back to not yet, and your photo and caption are deleted. Any post you shared of it comes off the feed too, with its photos and likes.`
        : `${drink.name} goes back to not yet, and your photo and caption are deleted.`,
      'Remove',
      () => {
        relock(drink.id);
        if (myId) void removePostsForDrink(myId, drink.id);
        router.back();
      },
    );
  }, [drink, myId, relock, removePostsForDrink, router]);

  const back = () => router.back();
  // `paper` on the page's own bar only (v4.9 A.5): the unknown drink's stays as it was.
  const bar = (title: string, right?: React.ReactNode, paper = false) => (
    <ScreenTopBar
      title={title}
      titleVisible={false}
      showRule={scrolled}
      paper={paper}
      left={<TopBarButton icon="chevronLeft" label="Back" onPress={back} />}
      right={right}
    />
  );

  /* ---- Unknown entry --------------------------------------------- */
  if (!drink) {
    return (
      <View style={styles.screen}>
        {bar('Unknown drink')}
        <View style={styles.centered}>
          <EmptyState
            icon="search"
            title="Unknown drink"
            body="This drink is not in the Dex."
            action={{ label: 'Back to the Dex', onPress: back }}
          />
        </View>
      </View>
    );
  }

  const unlocked = Boolean(record);
  /*
   * The print is the catalogue's colour photograph first, then your pour,
   * then the no-photo face. Your own photo has a row of its own under the
   * facts (DexSinceRow).
   */
  const ownPhoto = record?.photoUri ?? null;
  const stockPhoto = photoFor(drink.id) !== undefined;
  // Named for what is actually drawn: a photo, your photo, or the drawing.
  const printNoun = stockPhoto ? 'Photo' : ownPhoto ? 'Your photo' : 'Drawing';
  const openPost = (postId: string) => router.push({ pathname: '/post/[id]', params: { id: postId } });
  // A spirit's serve guide is first when it has a row to draw (every catalogue spirit's has); else its makeup.
  const serveFirst = drink.serve != null && serveRows(drink.serve, drink).length > 0;

  return (
    <View style={styles.screen}>
      {/* The paper's grain under the page (v4.9 A.5): outside the scroll, so the page moves over a fixed sheet. */}
      <Paper />
      {/* No visible title: the name under the print is the page's title. The bar still speaks it. */}
      {bar(
        drink.name,
        <TopBarButton
          icon="bookmark"
          filled={saved}
          label={saved ? 'Saved' : 'Save'}
          accessibilityHint={saved ? 'Takes it out of Saved' : 'Keeps it in Saved'}
          onPress={toggleSaved}
          onLongPress={canCollect ? saveToCollection : undefined}
          accessibilityActions={canCollect ? SAVE_TO_COLLECTION : undefined}
          onAccessibilityAction={canCollect ? onSaveToCollectionAction(saveToCollection) : undefined}
        />,
        true,
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: barH + space.xl }}
        onScroll={onScroll}
        onLayout={below.onLayout}
        onContentSizeChange={below.onContentSizeChange}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}>
        <HeroPrint
          drink={drink}
          photoUri={stockPhoto ? null : ownPhoto}
          // "Not yet" is the Dex's word for this state, so VoiceOver names it one way on the card and the page it opens.
          accessibilityLabel={unlocked ? `${printNoun} of ${drink.name}` : `${printNoun} of ${drink.name}, not yet in your Dex`}
        />

        {/*
          Everything is shown whether or not the drink is caught. The point
          of the app is to send you off to make and try a drink, which the
          recipe cannot do from behind a lock. Catching is the record that
          you did it, not the key to finding out how.
        */}
        {/* The name, the plate and the facts, ruled in the margin by the pen (v4.6). */}
        <HeroRecord drink={drink} inDex={unlocked} />
        {record ? <DexSinceRow drink={drink} record={record} post={myPost} onOpenPost={openPost} /> : null}
        <TastesOf notes={drink.tastingNotes} />

        {/*
          How it's made: the spec for a cocktail; for a spirit, how to pour
          it and what's in it. The first drawn takes the drink's number, and
          with it the lead: the double rule and the figure (v4.9 C.5).
        */}
        {drink.recipe ? <SpecSection recipe={drink.recipe} number={drink.dexNumber} /> : null}
        {!drink.recipe && drink.serve ? (
          <ServeSection serve={drink.serve} drink={drink} number={serveFirst ? drink.dexNumber : undefined} />
        ) : null}
        {!drink.recipe && drink.composition ? (
          <CompositionSection composition={drink.composition} number={serveFirst ? undefined : drink.dexNumber} />
        ) : null}

        <FieldNotes description={drink.description} />
        <OriginStory drink={drink} />
        <FriendsWhoCaught drinkId={drink.id} onOpenPost={openPost} />
        {/* Last, so that appearing once its rows arrive moves nothing above it. */}
        <WherePeopleHadIt drinkId={drink.id} />

        {/*
          Taking the drink back out, at the foot: the bare destructive words
          (ink, underlined), quiet because it is not what anyone comes here
          for. Posting is the pinned key.
        */}
        {unlocked ? (
          <Button
            label="Remove from collection"
            variant="dangerText"
            block
            onPress={handleRemove}
            accessibilityLabel={`Remove ${drink.name} from collection`}
            style={styles.remove}
          />
        ) : null}
      </ScrollView>

      {/*
        The page's one action, pinned: "Post this drink", then "Post
        another <name>" once it is in your Dex.
      */}
      <PinnedPostBar
        name={drink.name}
        collected={unlocked}
        ruled={below.moreBelow}
        onPress={() => openSheet(unlocked ? 'update' : 'unlock')}
        onHeight={setBarH}
      />

      <PostSheet
        visible={sheetVisible}
        mode={sheetMode}
        drinkName={drink.name}
        signedIn={Boolean(myId)}
        pickedUri={pickedUri}
        note={note}
        noteError={noteError}
        saving={saving}
        place={place}
        placesOn={placesOn}
        onAddPlace={setPlace}
        onRemovePlace={() => setPlace(null)}
        onClose={closeSheet}
        onTakePhoto={() => void takePhoto()}
        onChoosePhoto={() => void choosePhoto()}
        onChooseAnother={() => setPickedUri(null)}
        onNoteChange={onNoteChange}
        onConfirm={(alsoPost) => void handleConfirm(alsoPost)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center' },
  remove: { marginTop: layout.section, marginHorizontal: layout.gutter },
});
