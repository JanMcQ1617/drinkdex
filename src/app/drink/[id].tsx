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

import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { DrinkArt } from '@/components/artwork';
import { drinkPhoto } from '@/data/drinkPhotos';
import { FoilSweep } from '@/components/DexCard';
import {
  CompositionPanel,
  DexNumber,
  DrinkTitle,
  FieldNotes,
  MetaRow,
  NotLoggedCard,
  RecipePanel,
  sentence,
  ServePanel,
  TastingNotes,
  YourPour,
} from '@/components/DrinkPanels';
import {
  announce,
  Button,
  CategoryTag,
  EmptyState,
  Field,
  haptic,
  MediaIconButton,
  RarityBadge,
} from '@/components/ui';
import {
  CATEGORY_META,
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
import { getDrink, formatDexNumber } from '@/data';
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
 * The panels under the photograph (recipe, composition, serve, the title
 * block, your pour) live in components/DrinkPanels, shared with the screen
 * for a drink someone added themselves (custom/[id].tsx), so the two are
 * drawn by one piece of code.
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
   * That only works because the page is OPAQUE (styles.page). Without a
   * ground of its own, the text below slid across the slower photograph
   * from the first 46pt of scroll — the dex line, the name and then the
   * recipe drawn straight over the picture, with no scrim, until the hero
   * finally left the screen some 700pt later.
   *
   * Pulling DOWN past the top stretches the hero instead of exposing the
   * ground behind it, which is the behaviour every photo header on iOS has
   * and the one thing people notice by its absence. A pull of p points
   * moves the page down by p, so the hero has to grow by exactly p with
   * its top edge pinned: scale 1 + p/H about its centre, then shift up by
   * p/2 to put the top back where it was. Scaling about the centre alone
   * moved the top edge up by only half the pull, and the other half showed
   * cream. H is measured, not assumed — a photograph and the vector art
   * give the hero different heights.
   *
   * Reduce Motion gets a hero that simply scrolls with the page. The
   * identity transform is spelled out rather than returned as `{}`, so a
   * setting flipped mid-scroll cannot leave the last parallax offset
   * stuck on the native view.
   * ================================================================== */
  const scrollY = useSharedValue(0);
  const heroH = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const heroParallax = useAnimatedStyle(() => {
    const y = scrollY.value;
    if (reduced) return { transform: [{ translateY: 0 }, { scale: 1 }] };
    if (y >= 0) return { transform: [{ translateY: y * 0.35 }, { scale: 1 }] };
    const h = heroH.value;
    return { transform: [{ translateY: y / 2 }, { scale: h > 0 ? 1 - y / h : 1 }] };
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
   * Updating a photo asks too. "Save photo" keeps a post that already exists
   * in step and never creates one, so an entry kept to the Dex stays there
   * when its photo changes; "Save & post" is the explicit way to share an
   * entry that was never posted, or whose post failed.
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
           * The caption is empty because Update photo has no note field: an
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
        <EmptyState
          icon="search"
          title="Unknown entry"
          body="This drink is not in the Dex."
          action={{ label: 'Back to the Dex', onPress: () => router.back() }}
        />
      </View>
    );
  }

  const unlocked = Boolean(record);
  const rarityMeta = RARITY_META[drink.rarity];
  const categoryMeta = CATEGORY_META[drink.category];
  // Unique per entry+state: SVG <Defs> ids share one namespace on web.
  const heroFieldId = `heroField-${drink.id}-${unlocked ? 'c' : 'e'}`;
  // Your own pour outranks the stock photograph once you have logged one.
  const ownPhoto = unlocked && record?.photoUri ? record.photoUri : null;
  const heroPhoto = ownPhoto ? { uri: ownPhoto } : drinkPhoto(drink.id);
  // Named for what is actually drawn: your photo, a stock photo, or the art.
  const heroNoun = ownPhoto ? 'Your photo' : heroPhoto ? 'Photo' : 'Illustration';
  const busy = saving !== null;

  /*
   * Spirits state their glass in "Serve it right", so it is left out here
   * rather than printed twice on the same screen. Cocktails have no serve
   * guide, and for them this line is the only place the glass appears.
   */
  const facts = [
    drink.abv,
    drink.origin,
    drink.serve || !drink.glassware ? null : sentence(drink.glassware),
  ].filter((f): f is string => Boolean(f));

  return (
    <View style={styles.screen}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}>
        {/*
          Always full color here, even before logging: you're on this
          screen to make the drink, and the color tells you what you're
          aiming for. The Dex grid keeps its silhouettes — that's the
          collection board.

          FULL BLEED, and up under the status bar. The scroll content has no
          gutter of its own — the page below carries it — so the photograph
          runs to both screen edges and to the top of the glass.

          It used to sit inset inside a 16pt-radius, 1pt-bordered white panel
          on cream — a picture of a drink, framed and hung. Vivino, and every
          app whose subject is a photograph, lets the image be the surface
          instead of an object placed on one.

          Same card language as the Dex grid otherwise: category field behind
          the art, and a collected legendary gets the foil sweep it has in the
          grid — the payoff should be BIGGER on the screen you open to look at
          the thing, not smaller.
        */}
        <Animated.View
          onLayout={(e) => heroH.set(e.nativeEvent.layout.height)}
          style={[
            styles.hero,
            heroParallax,
            /*
             * A photograph defines the hero's height itself, so the padding
             * that framed the 150pt vector would only band the image. The
             * vector art keeps its breathing room, measured from below the
             * status bar so the drawing never slides under it.
             */
            heroPhoto ? styles.heroPhotoMode : { paddingTop: insets.top + space.xl },
            unlocked && styles.heroUnlocked,
            !unlocked && styles.heroLocked,
          ]}
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
          {unlocked ? (
            <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
              <Defs>
                <LinearGradient id={heroFieldId} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={categoryMeta.fieldFrom} />
                  <Stop offset="1" stopColor={categoryMeta.fieldTo} />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${heroFieldId})`} />
            </Svg>
          ) : null}

          {/*
            The hero follows the same precedence as the Dex card: the pour you
            logged, else the stock photograph, else the vector art. It is NOT
            dimmed while locked, unlike the grid — the grid is the collection
            board, where withholding creates the pull, but this is the screen
            you open to decide whether to make the drink. Hiding what it looks
            like here would work against the recipe sitting directly below it.
          */}
          {/*
            Disk, not memory-disk, for the Dex card's reason (DexCard): the
            memory tier keeps the full decoded bitmap, so each entry opened
            here left its 1024px stock photo (4 MB) or 2048px pour (12 MB)
            resident after the page closed, one more per drink looked at, in
            the pool the feed and avatars share. The file is on the phone;
            the short fade covers the decode.
          */}
          {heroPhoto ? (
            <Image
              source={heroPhoto}
              style={styles.heroPhoto}
              contentFit="cover"
              transition={160}
              accessible={false}
              cachePolicy="disk"
              enforceEarlyResizing
            />
          ) : (
            <DrinkArt drink={drink} size={150} />
          )}

          {/*
            LAST, so it paints over the photograph. Siblings draw in order and
            absolute positioning does not lift anything, so the sweep used to
            run underneath an opaque image — every collected legendary has
            one, since logging requires a photo — and was never seen. Same
            order as DexCard. The hero's overflow still clips it.
          */}
          {unlocked && drink.rarity === 'legendary' && !reduced ? (
            <FoilSweep width={screenWidth} />
          ) : null}
        </Animated.View>

        {/*
          The page: everything under the photograph, on a ground of its own so
          it slides OVER the slower hero as you scroll (see Hero parallax).

          The rarity tier is this page's top RULE. It was a border on all four
          sides of the hero while the hero was an inset panel, then its bottom
          edge once the photograph went full bleed — and then the opaque page
          covered that edge from the first point of scroll. The seam between
          photograph and page is where the tier belongs, and the page's top
          edge is the one that stays there. Widths keep the existing ladder,
          thickened so a 1pt hairline does not vanish against a photograph.
        */}
        <View
          style={[
            styles.page,
            { paddingBottom: Math.max(insets.bottom, space.xl) + space.xxxl },
            unlocked && {
              borderTopColor: rarityMeta.edge,
              borderTopWidth: rarityMeta.edgeWidth + 2,
            },
          ]}>
          {/*
            The title block and the tags (DrinkPanels). The catalogue number
            is the only tracked text on the page: it is a code made of
            figures; the style beside it is a word and is set plainly.
          */}
          <DrinkTitle
            eyebrow={
              <>
                <DexNumber>{formatDexNumber(drink.dexNumber)}</DexNumber>
                {'  ·  '}
                {drink.subcategory}
              </>
            }
            name={drink.name}
            facts={facts}
          />
          <MetaRow>
            <CategoryTag category={drink.category} />
            <RarityBadge rarity={drink.rarity} />
          </MetaRow>

          {/*
            Everything below is visible whether or not the entry is logged.
            The point of the app is to send you off to make and try a drink,
            which the recipe can't do from behind a lock. Logging is the
            record that you did it, not the key to finding out how.
          */}

          {record ? <YourPour record={record} /> : null}

          {!unlocked ? (
            <NotLoggedCard
              title="Not in your collection yet"
              body="Everything you need to make it is right below. Snap a photo when you do and it joins your Dex."
              onLog={() => openPicker('unlock')}
              accessibilityLabel={`Log ${drink.name}`}
            />
          ) : null}

          <TastingNotes notes={drink.tastingNotes} />

          {/* How it's made — a recipe for cocktails, a composition for the rest */}
          {drink.recipe ? <RecipePanel recipe={drink.recipe} /> : null}
          {!drink.recipe && drink.composition ? (
            <CompositionPanel composition={drink.composition} />
          ) : null}

          {drink.serve ? <ServePanel serve={drink.serve} /> : null}

          <FieldNotes description={drink.description} funFact={drink.funFact} />

          {/*
            Footer actions.

            Collected: change the photo, or take the entry back out.

            Not collected: log it — the same action as the card up top, again
            here because this is where the recipe ends. The locked card says
            "everything you need is right below", so the moment you are ready
            to log is the moment you have scrolled past all of it, glass in
            hand, and the only button used to be a full recipe back up.
          */}
          {unlocked ? (
            <>
              <Button
                label="Update photo"
                variant="secondary"
                icon="camera"
                block
                onPress={() => openPicker('update')}
                accessibilityLabel={`Update your photo of ${drink.name}`}
                style={styles.footerButton}
              />
              <Button
                label="Remove from collection"
                variant="dangerText"
                block
                onPress={handleRemove}
                accessibilityLabel={`Remove ${drink.name} from collection`}
                style={styles.removeButton}
              />
            </>
          ) : (
            <Button
              label="Log this drink"
              icon="camera"
              block
              onPress={() => openPicker('unlock')}
              accessibilityLabel={`Log ${drink.name}`}
              style={styles.footerButton}
            />
          )}
        </View>
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

      {/* Unlock / update-photo modal */}
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
                {pickerMode === 'update' ? 'Update photo' : `Log ${drink.name}`}
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
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    justifyContent: 'center',
  },

  /*
   * Everything below the photograph. Opaque on purpose: the parallax slides
   * this page over the slower hero, and without a ground of its own the
   * text would be drawn across the photograph. It also carries the screen
   * gutter the scroll content does not have, so the hero above it can run
   * edge to edge without cancelling a margin.
   */
  page: {
    backgroundColor: colors.bg,
    paddingHorizontal: layout.gutter,
    paddingTop: space.lg,
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: space.xl,
    backgroundColor: colors.surface,
    // Clips the category field and the legendary foil.
    overflow: 'hidden',
  },
  heroUnlocked: {
    /*
     * No shadow and no rule. elevation.card lifted the hero off the page when
     * it was a panel with corners; a block that runs to all three edges has
     * nothing to cast onto. The rarity rule is drawn by the page's top edge
     * (see the page at the call site).
     */
  },
  /*
   * Locked entries no longer get a dashed frame and a "NOT YET LOGGED" caps
   * caption. The dashes read as a coupon, and the caption repeated what the
   * card eight rows below already says in a full sentence — two elements
   * announcing the same absence, in the loudest typography on the screen.
   *
   * Kept as an empty style so the call site's `!unlocked &&` branch stays
   * legible next to `unlocked &&` rather than becoming a lone conditional.
   */
  heroLocked: {},
  heroPhotoMode: {
    /*
     * Nothing under the photograph. The 8pt of bottom padding that used to
     * sit here held a "Not yet logged" caption; the caption went and the
     * padding stayed, as a white band under a locked photo and a strip of
     * category field between a collected one and its rarity rule.
     */
    paddingVertical: 0,
    gap: 0,
  },
  heroPhoto: {
    /*
     * Square, matching the source, so nothing is cropped — and it is a real
     * laid-out child rather than an absolute fill, because the hero has no
     * height of its own once the vector artwork stops providing it.
     */
    width: '100%',
    aspectRatio: 1,
  },

  /* Footer actions */
  footerButton: {
    marginTop: space.xxl,
  },
  removeButton: {
    /*
     * Spacing only; the look is Button's `dangerText` skin — red text, no
     * fill, no edge. Red text is the iOS signal for an action that deletes;
     * the grey it used to be looked like a harmless link, and a filled red
     * button under "Update photo" would outweigh the action people come
     * here for.
     */
    marginTop: space.xs,
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
