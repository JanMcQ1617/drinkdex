import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
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
import { GlassCircle } from '@/components/glass';
import { Icon } from '@/components/icons';
import {
  Button,
  Card,
  CategoryPill,
  Divider,
  EmptyState,
  haptic,
  PressableScale,
  RarityBadge,
  SectionLabel,
} from '@/components/ui';
import {
  CATEGORY_META,
  colors,
  elevation,
  fonts,
  motion,
  radius,
  RARITY_META,
  space,
  type as typeScale,
  tabular,
} from '@/constants/theme';
import { getDrink, formatDexNumber } from '@/data';
import { containsObjectionable, OBJECTIONABLE_MESSAGE } from '@/lib/moderation';
import {
  NOTE_MAX,
  persistPhoto,
  pickFromCamera,
  pickFromLibrary,
  reportPost,
  type PickResult,
} from '@/lib/pour';
import { useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';
import { useSocial } from '@/store/social';
import type { Composition, Recipe, ServeGuide } from '@/types';
import { confirmDestructive, showNotice } from '@/utils/alerts';

/* ==================================================================== */
/* Helpers                                                              */
/* ==================================================================== */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO date -> "Jul 16, 2026" */
function formatLogDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * First letter up, the rest as written.
 *
 * The spirit data stores its serving facts the way they read mid-sentence
 * — "veladora", "room temp, never chilled", "shaken" — and this screen
 * sets each one as a value on its own, where lowercase reads as a typo
 * beside a capitalised ABV and origin. Done here, at render, because this
 * screen is the only place those values are shown and drinks.json is
 * generated, never edited by hand.
 */
function sentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ==================================================================== */
/* Small in-file components                                             */
/* ==================================================================== */

/**
 * Two-up fact tile. Used by ServePanel for Temp/Glass.
 *
 * No line cap. The longest serving temperatures run to three lines at
 * this width ("Well chilled (38-45°F), served over plenty of ice"), and
 * an ellipsis there clipped the one thing the tile is for — the failure
 * the FactsLine note below gives as its reason for dropping cards. The
 * row stretches both tiles to the taller one, so the pair stays even.
 */
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

/*
 * The facts line — ABV, origin, glass — as one wrapping sentence rather than
 * three bordered cards.
 *
 * As cards they were three white panels with three letterspaced-caps labels,
 * and the third clipped its own content: "Highball glass with…". A container
 * that truncates the thing it exists to show is worse than no container, and
 * the label above each value was doing work the value already does — nobody
 * reads "8–10%" and wonders which field it is.
 *
 * Set as text it wraps instead of clipping, drops three borders and three
 * caps labels, and reads the way a wine app states a vintage.
 */
function FactsLine({ facts }: { facts: string[] }) {
  return (
    <Text style={styles.facts}>
      {facts.map((f, i) => (
        <Text key={f}>
          {i > 0 ? <Text style={styles.factsDot}>{'   ·   '}</Text> : null}
          {f}
        </Text>
      ))}
    </Text>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

/**
 * Cocktails — the make-at-home build.
 *
 * Amounts are set in tabular figures and right-aligned so the numerals stack
 * into a column the eye can scan, the way a printed spec sheet reads. They
 * are in the muted ink, not gilt: gilt means legendary and nothing else, and
 * a recipe card on a common entry printed in the legendary metal was
 * spending that colour on every cocktail in the Dex.
 *
 * Method and garnish sit in a label-and-detail card of their own, the row
 * CompositionPanel uses for a spirit's make-up. They were pill chips, which
 * are for tags — and a garnish is a sentence ("Celery stalk and lime wedge
 * on a celery-salt rim") that wrapped a pill into a two-line capsule. They
 * are a card of their own rather than more rows in the ingredient card,
 * whose rows are item-and-amount; two row shapes in one card would read as
 * one list that changed its mind halfway.
 */
function RecipePanel({ recipe }: { recipe: Recipe }) {
  const details = [
    { label: 'Method', detail: recipe.method },
    { label: 'Garnish', detail: recipe.garnish },
  ].filter((d): d is { label: string; detail: string } => Boolean(d.detail));

  return (
    <>
      <SectionLabel style={styles.section}>How it&apos;s made</SectionLabel>

      <Card style={styles.listCard}>
        {recipe.ingredients.map((ing, i) => (
          <View key={`${i}-${ing.item}`}>
            {i > 0 ? <Divider /> : null}
            <View style={styles.ingredientRow}>
              <Text style={styles.ingredientItem}>{ing.item}</Text>
              <Text style={styles.ingredientAmount}>{ing.amount}</Text>
            </View>
          </View>
        ))}
      </Card>

      <View style={styles.steps}>
        {recipe.steps.map((step, i) => (
          <View key={`step-${i}`} style={styles.stepRow}>
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      {details.length > 0 ? (
        <Card style={[styles.listCard, styles.detailCard]}>
          {details.map((d, i) => (
            <View key={d.label}>
              {i > 0 ? <Divider /> : null}
              <View style={styles.componentRow}>
                <Text style={styles.componentLabel}>{d.label}</Text>
                <Text style={styles.componentDetail}>{sentence(d.detail)}</Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}
    </>
  );
}

/**
 * Spirits — what the drink is made of.
 *
 * Deliberately not framed as a recipe: nobody builds these at the bar, so a
 * step list would be a lie. Labels come from the data rather than this file,
 * because they differ by what the bottle is — Base/Distillation/Aging for a
 * distilled spirit, Grapes/Region/Vinification for a sherry or a port.
 *
 * The process paragraph is plain prose under the card, set like Field
 * notes. It used to be a tinted callout with a wine stripe down its left
 * edge, which bent round the rounded corners and set a paragraph of
 * explanation in 13pt fine print.
 */
function CompositionPanel({ composition }: { composition: Composition }) {
  return (
    <>
      <SectionLabel style={styles.section}>What&apos;s in it</SectionLabel>

      <Text style={styles.lead}>{composition.summary}</Text>

      <Card style={styles.listCard}>
        {composition.components.map((component, i) => (
          <View key={`${i}-${component.label}`}>
            {i > 0 ? <Divider /> : null}
            <View style={styles.componentRow}>
              <Text style={styles.componentLabel}>{component.label}</Text>
              <Text style={styles.componentDetail}>{component.detail}</Text>
            </View>
          </View>
        ))}
      </Card>

      <Text style={[styles.bodyText, styles.process]}>{composition.process}</Text>
    </>
  );
}

/** How to serve it at home — complements, never replaces, the composition. */
function ServePanel({ serve }: { serve: ServeGuide }) {
  return (
    <>
      <SectionLabel style={styles.section}>Serve it right</SectionLabel>

      <View style={styles.statRow}>
        <StatCard label="Temp" value={sentence(serve.temp)} />
        <StatCard label="Glass" value={sentence(serve.glass)} />
      </View>

      <View style={styles.serveCard}>
        <Text style={styles.bodyText}>{serve.how}</Text>
      </View>

      {serve.pair && serve.pair.length > 0 ? (
        <View style={styles.pairWrap}>
          <Text style={styles.miniLabel}>Pairs with</Text>
          <View style={styles.chipRow}>
            {serve.pair.map((p, i) => (
              <Chip key={`${i}-${p}`} label={p} />
            ))}
          </View>
        </View>
      ) : null}
    </>
  );
}

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
        // The live region under the field is Android-only; iOS is told here.
        if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(OBJECTIONABLE_MESSAGE);
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
           * photographed twice, and the newest becomes the preview. Neither
           * is awaited, for the same reason as the log path below; a failure
           * is said once it is known.
           *
           * The caption is empty because this sheet has no note field: an
           * existing post keeps the words it was first shared with, and a
           * new one says nothing rather than a filler line.
           *
           * addPhotoForDrink answers false both when the upload failed and
           * when the lookup for a post did not go through, so its notice
           * cannot claim a post exists. It says "if", as the sheet does.
           */
          if (myId && alsoPost) {
            void addPost(myId, drink.id, '', uri).then(reportPost);
          } else if (myId) {
            void addPhotoForDrink(myId, drink.id, uri).then((kept) => {
              if (!kept) {
                showNotice(
                  'Post not updated',
                  'Your Dex has the new photo. If you shared this entry, the post still shows the old one. Use Update photo to try again.'
                );
              }
            });
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
   * Entrance choreography. The words under the photograph settle in reading
   * order — number and name, then the tags.
   *
   * The photograph itself does not animate. It used to spring up from
   * scale 0 with an 8% overshoot, which was a flourish when the hero was a
   * 150pt drawing in a framed panel and became a full-width photograph
   * ballooning past both screen edges once it went full bleed — mid-push,
   * on top of the native slide. It arrives with the screen instead, the way
   * a detail page's photo does everywhere else on iOS, and expo-image's own
   * short fade covers the decode.
   */
  const enter = (delay: number) =>
    reduced ? undefined : FadeInDown.duration(motion.base).delay(delay);

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
          {heroPhoto ? (
            <Image
              source={heroPhoto}
              style={styles.heroPhoto}
              contentFit="cover"
              transition={160}
              accessible={false}
              cachePolicy="memory-disk"
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
            Title UNDER the photograph, not above it.

            The name above a framed picture is a caption layout — it makes the
            photo an illustration of the heading. Under it, the photo is the
            subject and the name identifies it, which is how Vivino, and every
            wine label, orders the same two elements.
          */}
          <Animated.View entering={enter(0)} style={styles.titleBlock}>
            <Text style={styles.dexLine}>
              <Text style={styles.dexNumber}>{formatDexNumber(drink.dexNumber)}</Text>
              {'  ·  '}
              {drink.subcategory}
            </Text>
            <Text style={styles.name} accessibilityRole="header">
              {drink.name}
            </Text>
            <FactsLine facts={facts} />
          </Animated.View>

          {/* Meta row */}
          <Animated.View entering={enter(140)} style={styles.metaRow}>
            <CategoryPill category={drink.category} />
            <RarityBadge rarity={drink.rarity} />
          </Animated.View>

          {/*
            Everything below is visible whether or not the entry is logged.
            The point of the app is to send you off to make and try a drink,
            which the recipe can't do from behind a lock. Logging is the
            record that you did it, not the key to finding out how.
          */}

          {/*
            Your pour — when you logged it, and what you said.

            The photograph is not repeated here. The hero at the top of the
            screen already IS your photo once you have logged one, so the
            framed copy that used to sit here showed the same picture twice,
            one screen apart, inset in exactly the bordered panel the hero
            stopped being.
          */}
          {record ? (
            <>
              <SectionLabel style={styles.section}>Your pour</SectionLabel>
              <Text style={styles.logMeta}>Logged {formatLogDate(record.date)}</Text>
              {record.note ? <Text style={styles.quote}>“{record.note}”</Text> : null}
            </>
          ) : null}

          {/* Not logged yet — an invitation, sitting above the how-to */}
          {!unlocked ? (
            <Card style={styles.lockedCard}>
              <View style={styles.lockedIcon}>
                <Icon name="lock" size={22} color={colors.wine} />
              </View>
              <Text style={styles.lockedTitle}>Not in your collection yet</Text>
              <Text style={styles.lockedBody}>
                Everything you need to make it is right below. Snap a photo when you do and it
                joins your Dex.
              </Text>
              <Button
                label="Log this drink"
                icon="camera"
                block
                onPress={() => openPicker('unlock')}
                accessibilityLabel={`Log ${drink.name}`}
                style={styles.lockedCta}
              />
            </Card>
          ) : null}

          {/* Tasting notes */}
          <SectionLabel style={styles.section}>Tasting notes</SectionLabel>
          <View style={styles.chipRow}>
            {drink.tastingNotes.map((n, i) => (
              <Chip key={`${i}-${n}`} label={n} />
            ))}
          </View>

          {/* How it's made — a recipe for cocktails, a composition for the rest */}
          {drink.recipe ? <RecipePanel recipe={drink.recipe} /> : null}
          {!drink.recipe && drink.composition ? (
            <CompositionPanel composition={drink.composition} />
          ) : null}

          {drink.serve ? <ServePanel serve={drink.serve} /> : null}

          {/* Lore */}
          <SectionLabel style={styles.section}>Field notes</SectionLabel>
          <Text style={styles.bodyText}>{drink.description}</Text>

          <SectionLabel style={styles.section}>Bar trivia</SectionLabel>
          <Text style={styles.bodyText}>{drink.funFact}</Text>

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
                variant="danger"
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
        who does not know it does. No haptic, like the system back.
      */}
      <PressableScale
        onPress={() => router.back()}
        noHaptic
        style={[styles.backButton, { top: insets.top + space.sm }]}
        accessibilityRole="button"
        accessibilityLabel="Go back">
        <GlassCircle size={44}>
          <Icon name="chevronLeft" size={22} color={colors.text} />
        </GlassCircle>
      </PressableScale>

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
              <Text style={styles.sheetTitle}>
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
                      accessibilityLabel="Photo preview"
                    />
                    {pickerMode === 'unlock' ? (
                      <>
                        <Text style={styles.fieldLabel}>Note (optional)</Text>
                        <TextInput
                          value={note}
                          onChangeText={onNoteChange}
                          placeholder="Where you had it, what you thought"
                          placeholderTextColor={colors.textMuted}
                          maxLength={NOTE_MAX}
                          style={styles.noteInput}
                          returnKeyType="done"
                          accessibilityLabel="Note, optional"
                        />
                        {noteError ? (
                          <Text style={styles.fieldError} accessibilityLiveRegion="polite">
                            {noteError}
                          </Text>
                        ) : null}
                      </>
                    ) : null}

                    {/*
                      The same pair, in the same order, as the centre-tab log
                      screen. Posting is the primary action because it is the
                      social half of the app, but it is never the only one: the
                      first button keeps the pour on this phone. No press tick
                      on either while logging — a saved pour answers with the
                      success haptic, and the tick landed a beat before it.
                    */}
                    <View style={styles.sheetActions}>
                      <Button
                        label={pickerMode === 'update' ? 'Save photo' : 'Save to Dex'}
                        variant="secondary"
                        onPress={() => void handleConfirm(false)}
                        disabled={busy && saving !== 'dex'}
                        loading={saving === 'dex'}
                        noHaptic={pickerMode === 'unlock'}
                        style={styles.sheetAction}
                      />
                      <Button
                        label="Save & post"
                        onPress={() => void handleConfirm(true)}
                        disabled={!myId || (busy && saving !== 'post')}
                        loading={saving === 'post'}
                        noHaptic={pickerMode === 'unlock'}
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
                      variant="ghost"
                      block
                      onPress={() => setPickedUri(null)}
                      disabled={busy}
                      accessibilityLabel="Choose another photo"
                    />
                  </>
                ) : (
                  <>
                    <PressableScale
                      onPress={() => void takePhoto()}
                      style={styles.optionRow}
                      accessibilityRole="button"
                      accessibilityLabel="Take photo">
                      <Icon name="camera" size={20} color={colors.wine} />
                      <Text style={styles.optionText}>Take photo</Text>
                    </PressableScale>
                    <PressableScale
                      onPress={() => void choosePhoto()}
                      style={styles.optionRow}
                      accessibilityRole="button"
                      accessibilityLabel="Choose photo">
                      <Icon name="grid" size={20} color={colors.wine} />
                      <Text style={styles.optionText}>Choose photo</Text>
                    </PressableScale>
                  </>
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
   * text would be drawn across the photograph. It also carries the 24pt
   * gutter the scroll content no longer has, so the hero above it can run
   * edge to edge without cancelling a margin.
   */
  page: {
    backgroundColor: colors.bg,
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
  },

  /* Header */
  backButton: {
    /* Pinned over the photograph; `top` is set at the call site from the
       safe-area inset. Left matches the page gutter. */
    position: 'absolute',
    left: space.xl,
    zIndex: 2,
  },
  dexLine: {
    /* The brand's letterspaced sub-label, above the name. */
    fontFamily: fonts.label,
    fontSize: typeScale.micro.fontSize,
    letterSpacing: 2.6,
    color: colors.taupeInk,
    marginBottom: space.xs,
  },
  dexNumber: {
    /*
     * Wine, not gilt. Gilt means legendary and nothing else now, and a
     * catalogue number printed in the legendary metal on every entry was
     * spending the one colour the rarity ladder tops out at.
     */
    color: colors.wine,
  },
  name: {
    /* Drink names are the handoff's Playfair 700 at 28. */
    fontFamily: fonts.displayBold,
    fontSize: typeScale.headline.fontSize,
    lineHeight: typeScale.headline.lineHeight,
    color: colors.text,
    marginBottom: space.lg,
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
  titleBlock: { marginBottom: space.lg },

  facts: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight + 2,
    color: colors.textMuted,
    marginTop: space.xs,
  },
  /* The separator sits lighter than the facts so the row reads as items
     rather than as one run-on string. A glyph, not text: it carries no
     information of its own. */
  factsDot: { color: colors.textFaint },

  /* Meta */
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },

  /* Stats */
  statRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  /* Still used by ServePanel's Temp/Glass pair — only the drink's own three
     facts moved out to FactsLine. Two of these side by side read fine; three
     of them, one of which clipped its value, did not. */
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    gap: space.xs,
  },
  statLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    letterSpacing: 0.2,
    color: colors.taupeInk,
  },
  statValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.text,
  },

  /* Sections */
  section: {
    marginTop: space.xxl,
    marginBottom: space.md,
  },
  lead: {
    fontFamily: fonts.body,
    fontSize: typeScale.bodyLg.fontSize,
    lineHeight: typeScale.bodyLg.lineHeight,
    color: colors.text,
    marginBottom: space.lg,
  },
  bodyText: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.text,
  },
  /* The composition's process paragraph, under its card. */
  process: {
    marginTop: space.lg,
  },
  miniLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    letterSpacing: 0.2,
    color: colors.taupeInk,
  },

  /* Chips */
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  chip: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    // 7 + the 1pt border = an 8pt inset, on the grid.
    paddingVertical: 7,
  },
  chipText: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
  },

  /* Recipe + composition rows */
  listCard: {
    paddingHorizontal: space.lg,
  },
  /* Method and garnish, under the steps. */
  detailCard: {
    marginTop: space.lg,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.md,
    paddingVertical: space.md,
  },
  ingredientItem: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.text,
  },
  ingredientAmount: {
    maxWidth: '42%',
    textAlign: 'right',
    fontFamily: fonts.numeral,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.textMuted,
    ...tabular,
  },
  steps: {
    marginTop: space.lg,
    gap: space.md,
  },
  stepRow: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
  },
  stepNum: {
    /*
     * The chip's tint and hairline. These discs were a gilt rim on a gilt
     * wash, which put the legendary metal on every recipe in the Dex.
     */
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontFamily: fonts.numeral,
    fontSize: typeScale.micro.fontSize,
    color: colors.textMuted,
  },
  stepText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.text,
  },
  componentRow: {
    paddingVertical: space.md,
    gap: space.xs,
  },
  componentLabel: {
    /* The label ink the other 11pt labels on this screen use. */
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    letterSpacing: 0.2,
    color: colors.taupeInk,
  },
  componentDetail: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.text,
  },

  /* Serve */
  serveCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    padding: space.lg,
    marginTop: space.md,
  },
  pairWrap: {
    marginTop: space.lg,
    gap: space.sm,
  },

  /* Your pour */
  logMeta: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
  },
  quote: {
    /* Your own words about the drink — set as reading text, not fine print. */
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    fontStyle: 'italic',
    color: colors.text,
    marginTop: space.sm,
  },

  /* Locked */
  lockedCard: {
    alignItems: 'center',
    padding: space.xl,
    marginTop: space.xl,
  },
  lockedIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.wineWash,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  lockedTitle: {
    fontFamily: fonts.display,
    fontSize: typeScale.title.fontSize,
    lineHeight: typeScale.title.lineHeight,
    color: colors.text,
    marginBottom: space.sm,
  },
  lockedBody: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.textMuted,
    textAlign: 'center',
  },
  lockedCta: {
    marginTop: space.xl,
  },

  /* Footer actions */
  footerButton: {
    marginTop: space.xxl,
  },
  removeButton: {
    /*
     * The destructive skin's ink without its wash and outline. Red text is
     * the iOS signal for an action that deletes; the ghost grey it used to
     * be looked like a harmless link, and a filled red pill under "Update
     * photo" would outweigh the action people come here for.
     */
    marginTop: space.xs,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
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
     * `elevation.sheet` casts UPWARD (-4pt offset) precisely to draw it. The
     * 1pt border that used to sit here outlined all four sides, three of
     * which are off-screen, and doubled the shadow on the fourth.
     */
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.xl,
    ...elevation.sheet,
  },
  sheetTitle: {
    fontFamily: fonts.display,
    fontSize: typeScale.title.fontSize,
    lineHeight: typeScale.title.lineHeight,
    color: colors.text,
    marginBottom: space.xs,
  },
  sheetSubtitle: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
  },
  /* Spaced from the heading whether or not a subtitle sits under it. */
  sheetBody: {
    marginTop: space.lg,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.lg,
    marginBottom: space.xs,
  },
  sheetAction: { flex: 1 },
  sheetHint: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: space.xs,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    marginBottom: space.sm,
    minHeight: 52,
  },
  optionText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
  },
  previewImage: {
    width: '100%',
    aspectRatio: 3 / 2,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: space.md,
  },
  fieldLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    marginBottom: space.xs,
  },
  noteInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
    minHeight: 48,
  },
  /* The refused note's one signal: this line, directly under the field. */
  fieldError: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.danger,
    marginTop: space.xs,
  },
});
