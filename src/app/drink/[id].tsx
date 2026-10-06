import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VectorFace } from '@/components/artwork/VectorFace';
import { FoilSweep } from '@/components/DexCard';
import {
  CellarPage,
  CompositionCard,
  DexSinceRow,
  FieldNotes,
  heroHeight,
  HeroShade,
  HeroTitle,
  LabelBand,
  PinnedLogBar,
  pinnedBarEstimate,
  ServeCard,
  SpecCard,
  TastesOf,
  TriviaBand,
} from '@/components/DrinkPanels';
import { Grain } from '@/components/Grain';
import { FocusedStatusBar } from '@/components/ScreenTopBar';
import { announce, Button, EmptyState, Field, haptic, MediaIconButton } from '@/components/ui';
import {
  colors,
  elevation,
  layout,
  radius,
  RARITY_META,
  space,
  stroke,
  textRole,
  type as typeScale,
} from '@/constants/theme';
import { getDrink } from '@/data';
import { drinkPhoto } from '@/data/drinkPhotos';
import { containsObjectionable, OBJECTIONABLE_MESSAGE } from '@/lib/moderation';
import {
  NOTE_MAX,
  persistPhoto,
  pickFromCamera,
  pickFromLibrary,
  reportPost,
  reportPostPhoto,
  type PickResult,
} from '@/lib/pour';
import { useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';
import { useSocial } from '@/store/social';
import { confirmDestructive, showNotice } from '@/utils/alerts';

/*
 * The drink in the cellar (specs/v3-cabinet.md 9.8): the lit photograph
 * dissolving into the dark ground, the name riding over its foot, and the
 * reading under it on the same ground. The panels (title block, label
 * band, your pour, the spec card, the trivia band, the pinned bar) live
 * in components/DrinkPanels, shared with the screen for a drink someone
 * added themselves (custom/[id].tsx), so the two are drawn by one piece
 * of code.
 */

/* ==================================================================== */
/* Screen                                                               */
/* ==================================================================== */

type PickerMode = 'unlock' | 'update';

/** Which save is running — so only the button that was pressed spins. */
type Saving = 'dex' | 'post' | null;

export default function DrinkDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
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
   * The pinned bar's height, measured, so the page's foot always clears
   * it: its label may wrap to two lines at a large text size. Starts at
   * the bar's one-line height and is set again only when it changes.
   */
  const [barH, setBarH] = useState(() => pinnedBarEstimate(insets.bottom));

  // Modal / picker state
  const [modalVisible, setModalVisible] = useState(false);
  const [pickerMode, setPickerMode] = useState<PickerMode>('unlock');
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Saving>(null);

  /*
   * Declared up here, above the parallax, and that placement is load-bearing.
   * It used to sit two hundred lines lower, after the worklet that reads it.
   * The native Babel preset compiles `const` to a hoisted `var` with no
   * temporal dead zone, so the worklet captured `undefined` on every render
   * and Reduce Motion never switched the parallax off.
   */
  const reduced = useReducedMotion();

  /* ==================================================================
   * Hero parallax
   *
   * The photograph is the screen. Scrolling it away at the same speed as
   * the page reads as one flat sheet moving; at a fraction of that speed
   * the hero sits BEHIND the page and the card gains a floor. 0.35 is the
   * fraction — far enough to register, near enough that the photograph
   * stays in view while the name and facts arrive over it.
   *
   * That only works because the page is OPAQUE (DrinkPanels' CellarPage).
   * Without a ground of its own, the text below slid across the slower
   * photograph from the first 46pt of scroll — the dex line, the name and
   * then the recipe drawn straight over the picture, with no scrim, until
   * the hero finally left the screen some 700pt later. The title block
   * now starts ON the hero's dissolved foot and carries that ground with
   * it, so as it rides up no glyph ever lands on photo pixels.
   *
   * Pulling DOWN past the top stretches the hero instead of exposing the
   * ground behind it, which is the behaviour every photo header on iOS has
   * and the one thing people notice by its absence. A pull of p points
   * moves the page down by p, so the hero has to grow by exactly p with
   * its top edge pinned: scale 1 + p/H about its centre, then shift up by
   * p/2 to put the top back where it was. Scaling about the centre alone
   * moved the top edge up by only half the pull, and the other half showed
   * the ground. H is the hero's fixed height (heroHeight: the width times
   * 1.14), the same for a photograph and the vector face.
   *
   * Reduce Motion gets a hero that simply scrolls with the page. The
   * identity transform is spelled out rather than returned as `{}`, so a
   * setting flipped mid-scroll cannot leave the last parallax offset
   * stuck on the native view.
   * ================================================================== */
  const heroH = heroHeight(screenWidth);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const heroParallax = useAnimatedStyle(() => {
    const y = scrollY.value;
    if (reduced) return { transform: [{ translateY: 0 }, { scale: 1 }] };
    if (y >= 0) return { transform: [{ translateY: y * 0.35 }, { scale: 1 }] };
    return { transform: [{ translateY: y / 2 }, { scale: 1 - y / heroH }] };
  });

  const openPicker = useCallback((mode: PickerMode) => {
    setPickerMode(mode);
    setPickedUri(null);
    setNote('');
    setNoteError(null);
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setPickedUri(null);
    setNote('');
    setNoteError(null);
  }, []);

  /*
   * Picking comes from lib/pour, the same code the centre-tab log screen
   * uses, so there is one answer to where a pour photo comes from — and
   * that answer strips its location and caps its size before anything is
   * stored or shared. A cancelled pick stays silent: backing out of the
   * camera is not a problem to report. A denial is always the camera (the
   * library needs no permission), and its only fix is in Settings, so the
   * alert carries the way there, as the log screen's does.
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
   * `alsoPost` is the user's answer to "share this?", asked by the two
   * buttons in the sheet. Logging from a card used to publish the photo and
   * note to every signed-in account with no choice offered, while the
   * centre-tab flow asked — the same act, private from one door and public
   * from the other. Both now ask, with the same two buttons.
   *
   * Logging another pour of a collected drink (the 'update' sheet) asks
   * too. "Save photo" keeps a post that already exists in step and never
   * creates one, so an entry kept to the Dex stays there when its photo
   * changes; "Save & post" is the explicit way to share an entry that was
   * never posted, or whose post failed.
   */
  const handleConfirm = useCallback(
    async (alsoPost: boolean) => {
      if (!drink || !pickedUri || saving) return;
      const trimmed = note.trim();

      /*
       * The note only becomes a caption when it is posted, so only a post
       * is checked. The server has the final word — its trigger rejects the
       * caption whatever this says — but catching it here keeps the message
       * next to the field, before anything has been saved.
       */
      if (alsoPost && trimmed.length > 0 && containsObjectionable(trimmed)) {
        setNoteError(OBJECTIONABLE_MESSAGE);
        /*
         * Field speaks an error when it appears. Pressed again with the
         * same words, the error is already showing and nothing changes, so
         * the repeat press is answered here instead of in silence.
         */
        if (noteError) announce(OBJECTIONABLE_MESSAGE);
        return;
      }

      setSaving(alsoPost ? 'post' : 'dex');
      try {
        const uri = await persistPhoto(drink.id, pickedUri);
        if (pickerMode === 'update') {
          updatePhoto(drink.id, uri);
          /*
           * A post has to follow the collection, or it keeps showing the
           * picture just replaced. Both paths ADD rather than replace:
           * several photos of one drink taken weeks apart are the same entry
           * photographed twice, and the newest becomes the preview. "Save
           * photo" only ever adds to a post that exists; with none it writes
           * nothing, so an entry kept to the Dex stays there. Neither is
           * awaited, for the same reason as the log path below.
           *
           * The caption is empty because the update sheet has no note field: an
           * existing post keeps the words it was first shared with, and a
           * new one says nothing rather than a filler line. The note saved
           * with the entry is not sent either. A post the server refused
           * for its note is retried from here, and reportPost promises that
           * retry goes out without the note; sending it again would be
           * refused again.
           *
           * A failure is said once it is known, by lib/pour's reporters —
           * the centre-tab log screen's, so the same failure reads the same
           * from either door. reportPostPhoto cannot claim a post exists:
           * addPhotoForDrink answers false both when the upload failed and
           * when the lookup for a post did not go through, so it says "if",
           * as the sheet does.
           */
          if (myId && alsoPost) {
            void addPost(myId, drink.id, '', uri).then(reportPost);
          } else if (myId) {
            void addPhotoForDrink(myId, drink.id, uri).then(reportPostPhoto);
          }
          closeModal();
        } else {
          unlock(drink.id, uri, trimmed.length > 0 ? trimmed : undefined);
          /*
           * Only the sharing half needs an account — the collection is local
           * and must never be gated. Not awaited: uploading the photo can
           * take seconds, and the entry is already in the Dex. No filler
           * caption either: a post with nothing to say says nothing.
           *
           * The outcome goes to reportPost, the centre-tab log screen's
           * handler, so both doors fail in the same words. A caption on the
           * client's list never gets this far — it was refused above, next
           * to the field — so the 'objectionable' notice only covers what
           * the server's list catches after the sheet has closed.
           */
          if (alsoPost && myId) {
            void addPost(myId, drink.id, trimmed, uri).then(reportPost);
          }
          /*
           * The celebration is not raised here. collection.unlock() queues
           * it for the root CelebrationOverlay, the one surface every way of
           * logging lands on. This screen used to run its own gilt-ringed
           * "UNLOCKED" overlay as well, and both played at once.
           */
          haptic.success();
          closeModal();
        }
      } finally {
        setSaving(null);
      }
    },
    [
      addPhotoForDrink,
      addPost,
      closeModal,
      drink,
      myId,
      note,
      noteError,
      pickedUri,
      pickerMode,
      saving,
      unlock,
      updatePhoto,
    ]
  );

  /*
   * Says everything the button is about to do. It used to say the photo and
   * note would be "forgotten", which read as local housekeeping, while the
   * same tap deleted the shared post along with other people's likes on it
   * — and Settings' "Reset collection" promises the opposite ("Your posts
   * and account stay"), so the two had to be told apart in words. "Any
   * post" rather than "your post": a signed-in user may never have shared
   * this entry.
   */
  const handleRemove = useCallback(() => {
    if (!drink) return;
    confirmDestructive(
      'Remove from collection?',
      myId
        ? `${drink.name} goes back to locked, and your photo and note are deleted. Any post you shared of it comes off the feed too, with its photos and likes.`
        : `${drink.name} goes back to locked, and your photo and note are deleted.`,
      'Remove',
      () => {
        relock(drink.id);
        if (myId) void removePostsForDrink(myId, drink.id);
        router.back();
      }
    );
  }, [drink, myId, relock, removePostsForDrink, router]);

  /*
   * No entrance animation on the words under the photograph. Content must
   * never depend on an animation finishing to be visible: Reanimated can
   * stall after a cold start in Release builds and leave it at opacity 0
   * (specs/06-tab-switch-bug.md, cause 1).
   *
   * The photograph itself does not animate either. It used to spring up
   * from scale 0 with an 8% overshoot, which was a flourish when the hero
   * was a 150pt drawing in a framed panel and became a full-width
   * photograph ballooning past both screen edges once it went full bleed —
   * mid-push, on top of the native slide. It arrives with the screen
   * instead, the way a detail page's photo does everywhere else on iOS, and
   * expo-image's own short fade covers the decode.
   */

  /* ---- Unknown entry --------------------------------------------- */
  if (!drink) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <Grain tone="lining" />
        <FocusedStatusBar style="light" />
        <EmptyState
          icon="search"
          title="Unknown entry"
          body="This drink is not in the Dex."
          action={{ label: 'Back to the Dex', onPress: () => router.back() }}
          tone="lining"
        />
      </View>
    );
  }

  const unlocked = Boolean(record);
  const rarityMeta = RARITY_META[drink.rarity];
  /*
   * The hero is the tungsten-lit catalogue photograph first, then your
   * pour, then the lit vector face. It used to be your pour first; the
   * bake is the immersive face of the drink now, and your own photo has a
   * row of its own under the label band (DexSinceRow).
   */
  const ownPhoto = record?.photoUri ?? null;
  const stockPhoto = drinkPhoto(drink.id);
  const heroPhoto = stockPhoto ?? (ownPhoto ? { uri: ownPhoto } : null);
  // Named for what is actually drawn: a stock photo, your photo, or the art.
  const heroNoun = stockPhoto ? 'Photo' : ownPhoto ? 'Your photo' : 'Illustration';
  const busy = saving !== null;
  const openPost = (postId: string) => router.push({ pathname: '/post/[id]', params: { id: postId } });

  return (
    <View style={styles.screen}>
      {/* The cellar's own grain: under everything, and seen past the page's foot. */}
      <Grain tone="lining" />
      <FocusedStatusBar style="light" />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}>
        {/*
          Always full colour here, even before logging: you're on this
          screen to make the drink, and the picture tells you what you're
          aiming for. The Dex keeps its ghosts; that's the collection board.

          FULL BLEED, and up under the status bar. The scroll content has no
          gutter of its own (the panels carry it), so the photograph runs to
          both screen edges and to the top of the glass. Over it: the top
          scrim for the status bar and the back button, the 200pt dissolve
          into the cellar at its foot (HeroShade), and for a collected
          legendary one foil pass, the payoff it has in the grid.
        */}
        <Animated.View
          style={[styles.hero, { height: heroH }, heroParallax]}
          accessible
          accessibilityRole="image"
          /*
           * "Not collected yet" is the Dex card's word for this state, and
           * Stats counts the same thing as collected. The hero used to say
           * "not yet logged", so VoiceOver named one state two ways between
           * the grid cell and the page it opens.
           */
          accessibilityLabel={
            unlocked
              ? `${heroNoun} of ${drink.name}, ${rarityMeta.label}`
              : `${heroNoun} of ${drink.name}, not collected yet`
          }>
          {/*
            Disk, not memory-disk, for the Dex card's reason (DexCard): the
            memory tier keeps the full decoded bitmap, so each entry opened
            here left its 1024px lit photo (4 MB) or 2048px pour (12 MB)
            resident after the page closed, one more per drink looked at, in
            the pool the feed and avatars share. The file is on the phone;
            the short fade covers the decode.
          */}
          {heroPhoto ? (
            <Image
              source={heroPhoto}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={160}
              accessible={false}
              cachePolicy="disk"
              enforceEarlyResizing
            />
          ) : (
            <VectorFace
              drink={drink}
              mode="lit"
              width={screenWidth}
              height={heroH}
              // The glass at 60% of the width; artScale is a share of the height.
              artScale={(0.6 * screenWidth) / heroH}
            />
          )}

          {/*
            After the picture, so it paints over it (absolute positioning
            lifts nothing; siblings draw in order), and before the shade, so
            it fades with the photograph into the cellar. One pass, then it
            rests off the frame; none under Reduce Motion. The hero clips it.
          */}
          {unlocked && drink.rarity === 'legendary' ? <FoilSweep width={screenWidth} /> : null}
          <HeroShade />
        </Animated.View>

        {/*
          The page: everything under the photograph, on an opaque cellar
          ground that starts on the hero's dissolved foot, so it slides OVER
          the slower hero as you scroll (see Hero parallax) and no glyph is
          ever drawn on the picture. Its foot clears the pinned bar by the
          bar's measured height.

          Everything is visible whether or not the entry is logged. The
          point of the app is to send you off to make and try a drink, which
          the recipe can't do from behind a lock. Logging is the record that
          you did it, not the key to finding out how.
        */}
        <CellarPage paddingBottom={barH + space.xl}>
          <HeroTitle drink={drink} inDex={unlocked} />
          <LabelBand drink={drink} />
          {record ? (
            <DexSinceRow drink={drink} record={record} post={myPost} onOpenPost={openPost} />
          ) : null}
          <TastesOf notes={drink.tastingNotes} />

          {/* How it's made: a spec card for cocktails; for spirits, how to pour it and what's in it. */}
          {drink.recipe ? <SpecCard recipe={drink.recipe} /> : null}
          {!drink.recipe && drink.serve ? <ServeCard serve={drink.serve} /> : null}
          {!drink.recipe && drink.composition ? (
            <CompositionCard
              composition={drink.composition}
              style={drink.serve ? styles.secondCard : undefined}
            />
          ) : null}

          <FieldNotes description={drink.description} />
          <TriviaBand drink={drink} />

          {/*
            Taking the entry back out, at the foot: the bare destructive word
            on the cellar (Button's `dangerOnLining`), quiet because it is
            not what anyone comes here for. Logging lives in the pinned bar.
          */}
          {unlocked ? (
            <Button
              label="Remove from collection"
              variant="dangerOnLining"
              block
              onPress={handleRemove}
              accessibilityLabel={`Remove ${drink.name} from collection`}
              style={styles.removeButton}
            />
          ) : null}
        </CellarPage>
      </Animated.ScrollView>

      {/*
        Back button, pinned to the screen over the photograph. It used to sit
        inside the scroll content, which meant it drifted across the slower
        hero while scrolling and then left with the first screenful — on the
        longest page in the app. Swipe-back still works; this is for everyone
        who does not know it does.

        The media icon button (a dark translucent square with a faint bone
        edge), not a frosted glass disc: it holds on a white photograph and a
        dark one alike, and it is the one control the app draws over media.
        No haptic, like the system back.
      */}
      <MediaIconButton
        icon="chevronLeft"
        label="Back"
        onPress={() => router.back()}
        style={[styles.backButton, { top: insets.top + space.sm }]}
      />

      {/*
        The page's one action, pinned: "Log this drink", then "Log another
        <name>" once it is in your Dex. It replaced the mid-page "not in
        your collection" card, "Update photo" and the end-of-page log
        button, three doors to the same two sheets.
      */}
      <PinnedLogBar
        name={drink.name}
        collected={unlocked}
        onPress={() => openPicker(unlocked ? 'update' : 'unlock')}
        onHeight={setBarH}
      />

      {/* Log sheet: a first pour, or another one */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeModal}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            pointerEvents="box-none"
            style={styles.sheetPositioner}>
            {/*
              No grabber. This sheet fades in and has no drag gesture — it
              closes on a tap outside it — so a grabber promised a swipe that
              did nothing.
            */}
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) + space.sm }]}>
              <Text style={styles.sheetTitle} accessibilityRole="header">
                {pickerMode === 'update' ? (
                  'Log another pour'
                ) : (
                  <>
                    Log <Text style={textRole.nameInline}>{drink.name}</Text>
                  </>
                )}
              </Text>
              {/*
                Logging says what the photo is for and that sharing is a
                choice. Updating says where the new photo goes — including the
                post, if there is one — rather than repeating a rule the user
                already met.
              */}
              {pickerMode === 'unlock' ? (
                <Text style={styles.sheetSubtitle}>
                  A photo is how an entry joins your Dex. Posting it is up to you.
                </Text>
              ) : myId ? (
                <Text style={styles.sheetSubtitle}>
                  If you shared this entry, the post gets the new photo too.
                </Text>
              ) : null}

              <View style={styles.sheetBody}>
                {pickedUri ? (
                  <>
                    <Image
                      source={{ uri: pickedUri }}
                      style={styles.previewImage}
                      contentFit="cover"
                      enforceEarlyResizing
                      accessibilityLabel="Photo preview"
                    />
                    {/*
                      Field, the app's one form input, so the note is drawn,
                      labelled and announced like every other field, and like
                      the note on the centre-tab log screen. Field links a
                      refused caption to the input and speaks it when it
                      appears; handleConfirm speaks it again on a repeat press,
                      when nothing on screen changes. Prose, so capitals and
                      autocorrect are on.
                    */}
                    {pickerMode === 'unlock' ? (
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
                    ) : null}

                    {/*
                      The same pair, in the same order, as the centre-tab log
                      screen. Posting is the primary action because it is the
                      social half of the app, but it is never the only one: the
                      first button keeps the pour on this phone. A saved pour
                      answers with the success haptic; buttons do not tick.
                    */}
                    <View style={styles.sheetActions}>
                      <Button
                        label={pickerMode === 'update' ? 'Save photo' : 'Save to Dex'}
                        variant="secondary"
                        onPress={() => void handleConfirm(false)}
                        disabled={busy && saving !== 'dex'}
                        loading={saving === 'dex'}
                        style={styles.sheetAction}
                      />
                      <Button
                        label="Save & post"
                        onPress={() => void handleConfirm(true)}
                        disabled={!myId || (busy && saving !== 'post')}
                        loading={saving === 'post'}
                        style={styles.sheetAction}
                      />
                    </View>
                    {/*
                      Says why the second button is dead rather than leaving a
                      disabled control with no explanation.
                    */}
                    {!myId ? (
                      <Text style={styles.sheetHint}>
                        Sign in to post. Saving to your Dex works either way.
                      </Text>
                    ) : null}
                    {/*
                      Back to the two sources, not "Retake": it does not reopen
                      the camera, and after a library pick there was nothing to
                      retake.
                    */}
                    <Button
                      label="Choose another"
                      variant="text"
                      muted
                      block
                      onPress={() => setPickedUri(null)}
                      disabled={busy}
                      accessibilityLabel="Choose another photo"
                    />
                  </>
                ) : (
                  /*
                    The two sources as outlined buttons with their glyph
                    pinned at the left, as a sign-in stack draws them. They
                    were hand-built rows on a near-invisible hairline that
                    shrank when pressed; a secondary button is the app's one
                    way of drawing "an action that is not the main one".
                  */
                  <View style={styles.sources}>
                    <Button
                      label="Take photo"
                      variant="secondary"
                      icon="camera"
                      block
                      onPress={() => void takePhoto()}
                    />
                    <Button
                      label="Choose photo"
                      variant="secondary"
                      icon="grid"
                      block
                      onPress={() => void choosePhoto()}
                    />
                  </View>
                )}
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

/* ==================================================================== */
/* Styles                                                               */
/* ==================================================================== */

const styles = StyleSheet.create({
  /* The cellar: the ground a lit photograph settles into. */
  screen: {
    flex: 1,
    backgroundColor: colors.liningDeep,
  },
  centered: {
    justifyContent: 'center',
  },

  /* Header */
  backButton: {
    /* Pinned over the photograph; `top` is set at the call site from the
       safe-area inset. 12 from the edge, a little inside the page gutter,
       as a bar's back control sits. */
    position: 'absolute',
    left: space.md,
    zIndex: 2,
  },

  /* Hero */
  hero: {
    /*
     * The cellar while the photo decodes, the colour its edges settle to,
     * so the decode moment already matches. Clips the dissolve and the
     * legendary foil.
     */
    backgroundColor: colors.liningDeep,
    overflow: 'hidden',
  },

  /* A spirit's second mat card, under "The pour". */
  secondCard: { marginTop: space.lg },

  /* Footer action */
  removeButton: {
    /*
     * Spacing only; the look is Button's `dangerOnLining` skin: the bare
     * red word, no fill, no edge, 8.34:1 on the cellar. Red text is the
     * iOS signal for an action that deletes, and a filled red button would
     * outweigh the action people come here for.
     */
    marginTop: space.xl,
    marginHorizontal: layout.gutter,
  },

  /* Modal sheet */
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetPositioner: {
    justifyContent: 'flex-end',
  },
  sheet: {
    /*
     * A bottom sheet's only visible edge is its top one, and
     * `elevation.sheet` casts UPWARD (-4pt offset) precisely to draw it. A
     * border would outline all four sides, three of which are off-screen,
     * and double the shadow on the fourth. Panel corners, top only.
     */
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingTop: space.xl,
    paddingHorizontal: layout.gutter,
    ...elevation.sheet,
  },
  sheetTitle: {
    /* Chrome, so Inter: the drink's name is the subject of the page, not of a dialog. */
    ...textRole.barTitleLg,
    color: colors.text,
    marginBottom: space.xs,
  },
  sheetSubtitle: {
    fontFamily: textRole.helper.fontFamily,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
  },
  /* Spaced from the heading whether or not a subtitle sits under it. */
  sheetBody: {
    marginTop: space.lg,
  },
  sources: { gap: space.sm },
  sheetActions: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.lg,
    marginBottom: space.xs,
  },
  sheetAction: { flex: 1 },
  sheetHint: {
    fontFamily: textRole.helper.fontFamily,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: space.xs,
  },
  /* An inset photo: the panel corner and a drawn edge, on the sunk well while it decodes. */
  previewImage: {
    width: '100%',
    aspectRatio: 3 / 2,
    borderRadius: radius.card,
    backgroundColor: colors.bgSunk,
    borderWidth: stroke.edge,
    borderColor: colors.line,
    marginBottom: space.md,
  },
});
