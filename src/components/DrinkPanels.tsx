import { Image } from 'expo-image';
import React, { useMemo, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DexStatusTag, DrinkName, Print } from '@/components/cabinet';
import { DexThumb, DrinkFace } from '@/components/DexCard';
import { Icon } from '@/components/icons';
import { NumberPlate } from '@/components/plate';
import { Avatar, Button } from '@/components/ui';
import { CATEGORY_META, colors, layout, radius, space, stroke, tabular, textRole } from '@/constants/theme';
import {
  abvLabel,
  datelineOf,
  dexSinceLabel,
  glassLabel,
  glassPhrase,
  originLabel,
  splitAmount,
  styleLabel,
  tastesOf,
  type LabelFact,
} from '@/lib/drinkLabels';
import { widestRun } from '@/lib/textFit';
import { useAuth } from '@/store/auth';
import { useSocial } from '@/store/social';
import type {
  Composition,
  Drink,
  Post,
  Recipe,
  RecipeIngredient,
  ServeGuide,
  UnlockRecord,
  UserProfile,
} from '@/types';

/* ==================================================================== */
/* The drink page's panels                                              */
/*                                                                      */
/* Shared by drink/[id].tsx and custom/[id].tsx, so a drink someone     */
/* added is drawn by the same code as a catalogue entry. Two copies     */
/* would drift, and the person comparing their entry with the one under */
/* it in the Dex would see two different apps.                          */
/*                                                                      */
/* DAYLIGHT, LESS STUFF (white spec "not mocked, same kit"; layout spec */
/* section 4). A white page: the square print full width, the name in   */
/* drinkHero, the Nº plate and whether it is in your Dex, then the      */
/* facts the feed and the grids no longer stamp on (kind, origin,       */
/* glass, strength), and the reading: the spec, the field notes, the    */
/* origin story, and the friends who caught it. Sections are set apart */
/* by space under body-600 heads: no cards, no rules, no bands.         */
/*                                                                      */
/* Every panel copes with blanks, because a custom drink has them where */
/* a catalogue entry never does (no composition summary, no steps, a    */
/* serve guide with only a temperature, no ABV). A blank part is left   */
/* out rather than drawn empty.                                         */
/*                                                                      */
/* Nothing here animates: content never waits on a frame loop to show.  */
/* ==================================================================== */

/**
 * First letter up, the rest as written.
 *
 * The spirit data stores its serving facts the way they read mid-sentence
 * ("veladora", "room temp, never chilled") and the sections set each one
 * as a value on its own, where lowercase reads as a typo. Done at render
 * because drinks.json is generated, never edited by hand.
 */
function sentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ==================================================================== */
/* Geometry                                                             */
/* ==================================================================== */

/** Dynamic Type caps (specs/v3-cabinet.md 6.5). */
const HERO_NAME_CAP = 1.2;
const FACT_CAP = 1.3;

/** The spec's amount column, the gap after it, and when it stops being a column. */
const AMOUNT_COL = 84;
const AMOUNT_GAP = space.sm;
const STACK_ABOVE_SCALE = 1.3;

/** Hidden from VoiceOver and untouchable: the row it sits in speaks. */
const DECOR = {
  pointerEvents: 'none' as const,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
};

/* ==================================================================== */
/* The print                                                            */
/* ==================================================================== */

/**
 * The drink's picture, square and full width under the page's bar, the
 * wash showing until it decodes (white spec, the drink page). Always the
 * colour print, caught or not: you are here to make the drink, and the
 * picture is what you are aiming for. The Dex keeps its proofs; that is the
 * collection board.
 *
 * The catalogue's colour print first, then `photoUri` (your pour, or the
 * photo a custom drink was sent with), then the no-photo face, through
 * DrinkFace, so it decodes at the frame's size under a per-size cache key.
 * One VoiceOver image, named for what is drawn.
 */
export function HeroPrint({
  drink,
  photoUri,
  accessibilityLabel,
}: {
  drink: Drink;
  photoUri?: string | null;
  accessibilityLabel: string;
}) {
  const { width } = useWindowDimensions();
  const side = Math.round(width);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Print width={side} height={side}>
        <DrinkFace drink={drink} mode="photo" photoUri={photoUri} width={side} height={side} transition={160} />
      </Print>
    </View>
  );
}

/* ==================================================================== */
/* Title block                                                          */
/* ==================================================================== */

/** "Added by you": a custom drink's plate, where a catalogue drink has its number. */
function AddedPlate() {
  return (
    <View style={styles.addedPlate}>
      <Text maxFontSizeMultiplier={FACT_CAP} style={[textRole.statusWord, styles.muted]}>
        Added by you
      </Text>
    </View>
  );
}

/**
 * The not-yet word beside the empty plate: "Not in your Dex yet", muted on
 * a decorative hair edge, the in-Dex tag's quiet twin. Not "New": on this
 * page that read as though the drink had just been added.
 */
function NotYetTag() {
  return (
    <View style={styles.notYetTag}>
      <Text maxFontSizeMultiplier={FACT_CAP} style={[textRole.statusWord, styles.muted]}>
        Not in your Dex yet
      </Text>
    </View>
  );
}

/**
 * The name, then the Nº plate and whether it is in your Dex.
 *
 * The name is Playfair at 52 through DrinkName: no line limit, and shrunk
 * only when its widest word would not fit the line ("Holunderbeergeist").
 * A header, for the Headings rotor.
 *
 * The plate is solid ink once the drink is in your Dex and an empty plate
 * before (white spec 5.7), beside the tag that says it in words ("In your
 * Dex", "Not in your Dex yet"): the shape, the fill and the word, so no
 * state rests on one cue. A custom drink has no number (inventing one
 * would say it had joined the Dex), so its plate says whose it is instead.
 * One VoiceOver element.
 */
export function HeroTitle({ drink, inDex, custom }: { drink: Drink; inDex: boolean; custom?: boolean }) {
  const { width } = useWindowDimensions();
  const spoken = custom
    ? 'Added by you'
    : `Number ${drink.dexNumber}, ${inDex ? 'in your Dex' : 'not in your Dex yet'}`;

  return (
    <View style={styles.titleBlock}>
      <DrinkName
        name={drink.name}
        role={textRole.drinkHero}
        measure={width - layout.gutter * 2}
        cap={HERO_NAME_CAP}
        color={colors.text}
        accessibilityRole="header"
      />
      <View accessible accessibilityLabel={spoken} style={styles.plates}>
        {custom ? (
          <AddedPlate />
        ) : (
          <>
            <NumberPlate n={drink.dexNumber} tone={inDex ? 'caught' : 'notYet'} size="lg" />
            {inDex ? <DexStatusTag /> : <NotYetTag />}
          </>
        )}
      </View>
    </View>
  );
}

/* ==================================================================== */
/* The facts                                                            */
/* ==================================================================== */

type Fact = LabelFact & { kind: 'kind' | 'origin' | 'glass' | 'abv' };

/**
 * What kind of drink it is, as a value over its caption, as the other
 * facts are: "Spirit-forward" over "cocktail", "American whiskey" over
 * "spirit"; a drink with no style is its category word over "kind".
 */
function kindFact(drink: Drink): LabelFact {
  const style = styleLabel(drink.subcategory);
  const word = CATEGORY_META[drink.category].label;
  return style ? { value: style, caption: word.toLowerCase() } : { value: word, caption: 'kind' };
}

function factsOf(drink: Drink): Fact[] {
  const facts: Fact[] = [
    { kind: 'kind', ...kindFact(drink) },
    { kind: 'origin', ...originLabel(drink.origin) },
    { kind: 'glass', ...glassLabel(drink) },
    { kind: 'abv', ...abvLabel(drink) },
  ];
  // A custom drink may leave any of them blank.
  return facts.filter((f) => f.value !== '');
}

/** A fact said aloud: "Spirit-forward cocktail", "Florence, Italy", "Rocks glass", "24 percent". */
function spokenFact(f: Fact): string {
  switch (f.kind) {
    case 'kind':
      return f.caption === 'kind' ? f.value : `${f.value} ${f.caption}`;
    case 'origin':
      return f.caption === 'origin' ? `From ${f.value}` : `From ${f.value}, ${f.caption}`;
    case 'glass':
      return `${f.value} ${f.caption}`;
    case 'abv':
      return `${f.value.replace(/\s*–\s*/g, ' to ').replace(/%/g, ' percent')} alcohol`;
  }
}

/**
 * Kind, origin, glass and strength, two to a row, each a value (body 600)
 * over a small caption ("Florence" / "Italy", "24%" / "abv"). No rules
 * between them: the columns and the space carry the grid.
 *
 * One column, rather than break a word: at the 1.3 cap on a 375pt phone a
 * half column is too narrow for "Massachusetts", and iOS would break it
 * inside the word. Worked out from lib/textFit (which errs wide), so the
 * first frame is the final one. Values wrap and cap at 1.3. One VoiceOver
 * element.
 */
export function FactList({ drink }: { drink: Drink }) {
  const { width, fontScale } = useWindowDimensions();
  const facts = factsOf(drink);
  if (facts.length === 0) return null;

  const inner = width - layout.gutter * 2;
  // Floored, so two cells and the gap never sum past the row by a rounding and wrap.
  const half = Math.floor((inner - space.xl) / 2);
  const scale = Math.min(fontScale, FACT_CAP);
  const fitsHalf = facts.every(
    (f) =>
      widestRun(f.value, 'inter', textRole.bodyStrong.fontSize * scale) <= half &&
      widestRun(f.caption, 'inter', textRole.small.fontSize * scale) <= half,
  );
  const cell = fitsHalf ? half : inner;

  return (
    <View accessible accessibilityLabel={facts.map(spokenFact).join('. ')} style={styles.facts}>
      {facts.map((f) => (
        <View key={f.kind} style={{ width: cell }}>
          <Text maxFontSizeMultiplier={FACT_CAP} style={[textRole.bodyStrong, styles.ink]}>
            {f.value}
          </Text>
          <Text maxFontSizeMultiplier={FACT_CAP} style={[textRole.small, styles.muted]}>
            {f.caption}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* ==================================================================== */
/* In your Dex since                                                    */
/* ==================================================================== */

/** A post still uploading has only its local photo, so that counts as one. */
function photoCount(post: Post): number {
  return post.photoPaths?.length || (post.photoPath || post.photoUri ? 1 : 0);
}

/** Your photo's print in the row. */
const SINCE_THUMB = 52;

/**
 * Your entry, once you have one: your photo as a small print, "In your
 * Dex since 14 September", and a second line that says only what is true.
 * The collection keeps one record per drink on the phone, so there is no
 * count of posts to give: "Shared · 3 photos" when your post of this drink
 * is in the feed store (and the row opens it), otherwise "Only on this
 * phone", which is where the collection lives.
 *
 * The page's print is the catalogue's, so this is where your own picture
 * is seen. A photo whose file is gone shows the drink's thumb rather than
 * an empty frame; the failure is remembered per file, so the next photo
 * you post is shown. Your caption, when you wrote one, follows as reading
 * text.
 */
export function DexSinceRow({
  drink,
  record,
  post,
  onOpenPost,
}: {
  drink: Drink;
  record: UnlockRecord;
  /** Your post of this drink, when the feed store holds it. */
  post?: Post;
  onOpenPost?: (postId: string) => void;
}) {
  const [lostUri, setLostUri] = useState<string | null>(null);
  const uri = record.photoUri;
  const since = dexSinceLabel(record.date);
  const k = post ? photoCount(post) : 0;
  const line2 = post ? (k > 0 ? `Shared · ${k} ${k === 1 ? 'photo' : 'photos'}` : 'Shared') : 'Only on this phone';
  const open = post && onOpenPost ? () => onOpenPost(post.id) : null;
  const spoken = `${since}. ${line2.replace(' · ', ', ')}`;

  const body = (
    <>
      <View {...DECOR}>
        {uri && uri !== lostUri ? (
          <Print width={SINCE_THUMB} height={SINCE_THUMB}>
            <Image
              accessibilityIgnoresInvertColors
              // The frame's size in the key: a bare file key would hand this small decode to a larger view of the same photo.
              source={{ uri, cacheKey: `${uri}#${SINCE_THUMB}x${SINCE_THUMB}` }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={140}
              accessible={false}
              cachePolicy="disk"
              enforceEarlyResizing
              onError={() => setLostUri(uri)}
            />
          </Print>
        ) : (
          <DexThumb drink={drink} />
        )}
      </View>
      <View style={styles.sinceText}>
        <Text style={[textRole.bodyMedium, styles.ink]}>{since}</Text>
        <Text style={[textRole.small, styles.muted]}>{line2}</Text>
      </View>
      {open ? <Icon name="chevronRight" size={18} color={colors.textMuted} /> : null}
    </>
  );

  return (
    <View style={styles.section}>
      {open ? (
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={spoken}
          accessibilityHint="Opens your post"
          style={({ pressed }) => [styles.sinceRow, pressed && styles.pressed]}>
          {body}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={spoken} style={styles.sinceRow}>
          {body}
        </View>
      )}
      {record.note ? <Text style={[textRole.body, styles.ink, styles.note]}>“{record.note}”</Text> : null}
    </View>
  );
}

/* ==================================================================== */
/* Sections                                                             */
/* ==================================================================== */

/**
 * A section of the page: its head in body 600 (a header for the rotor),
 * an optional quiet aside on the same line ("Stirred · 3 ingredients"),
 * then its content. Set apart from the one above by space alone.
 */
function Section({
  title,
  aside,
  style,
  children,
}: {
  title: string;
  aside?: string;
  style?: ViewStyle;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.sectionHead}>
        <Text accessibilityRole="header" style={[textRole.bodyStrong, styles.ink]}>
          {title}
        </Text>
        {aside ? <Text style={[textRole.small, styles.muted]}>{aside}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** A label over its detail: method, garnish, the serve's parts, the composition's. */
function Detail({ label, detail }: { label: string; detail: string }) {
  return (
    <View style={styles.detail}>
      <Text style={[textRole.small, styles.muted]}>{label}</Text>
      <Text style={[textRole.body, styles.ink]}>{detail}</Text>
    </View>
  );
}

/** "Menthol, bitter herbs, juniper, cola spice", in body. Nothing when there are none. */
export function TastesOf({ notes }: { notes: string[] }) {
  const line = tastesOf(notes);
  if (!line) return null;
  return (
    <Section title="Tastes of">
      <Text style={[textRole.body, styles.ink]}>{line}</Text>
    </Section>
  );
}

/*
 * A method the head can say in a word ("Shaken"). A custom drink's method
 * is free text ("Shake hard, then double strain"), which gets a row of its
 * own instead.
 */
const ONE_WORD = /^\S{1,16}$/;

/**
 * One ingredient, amount first, the way a bartender reads a spec: the
 * amount in tabular 600 in an 84pt column, its metric under it, then the
 * item with any note after it ("Soda water · to top").
 *
 * `stacked` puts the amount above the item in one column, for every row
 * at once so the column never half-holds: past 1.3x text an 84pt column
 * would wrap "1.5 oz" a letter at a time, and an amount whose longest word
 * is wider than the column ("1 barspoon", "2–3 cherries") would break
 * inside the word.
 */
function IngredientRow({ ing, stacked }: { ing: RecipeIngredient; stacked: boolean }) {
  const { amount, metric, note } = splitAmount(ing.amount);
  const spoken = [amount, metric, ing.item, note].filter(Boolean).join(', ');
  const hasAmount = Boolean(amount || metric);
  return (
    <View accessible accessibilityLabel={spoken} style={[styles.ingRow, stacked && styles.ingRowStacked]}>
      {hasAmount || !stacked ? (
        <View style={stacked ? null : styles.amountCol}>
          {amount ? <Text style={[textRole.specAmount, styles.ink]}>{amount}</Text> : null}
          {metric ? <Text style={[textRole.small, styles.muted, tabular]}>{metric}</Text> : null}
        </View>
      ) : null}
      <Text style={[textRole.body, styles.ink, !stacked && styles.ingItemBeside]}>
        {ing.item}
        {note ? <Text style={[textRole.small, styles.muted]}>{` · ${note}`}</Text> : null}
      </Text>
    </View>
  );
}

/**
 * Cocktails: how to make it. "The spec" with the method and the count;
 * the ingredients amount first; the steps numbered with bare tabular
 * figures; then the garnish.
 *
 * The method is said once, in the head; only a method too long for the
 * head gets a row. A drink someone added may have no steps and no
 * amounts: the block is left out and a missing amount leaves its column
 * empty rather than inventing one. Nothing at all when there is nothing.
 */
export function SpecSection({ recipe }: { recipe: Recipe }) {
  const { fontScale } = useWindowDimensions();
  const method = (recipe.method ?? '').trim();
  const headMethod = ONE_WORD.test(method) ? sentence(method) : '';
  const n = recipe.ingredients.length;
  const steps = recipe.steps.filter((s) => s.trim());
  const garnish = (recipe.garnish ?? '').trim();
  if (n === 0 && steps.length === 0 && !garnish && !method) return null;

  const aside = [headMethod, n > 0 ? `${n} ${n === 1 ? 'ingredient' : 'ingredients'}` : '']
    .filter(Boolean)
    .join(' · ');

  // Body text is uncapped, so the amounts draw at the full fontScale.
  const amountText = AMOUNT_COL - AMOUNT_GAP;
  const stacked =
    fontScale > STACK_ABOVE_SCALE ||
    recipe.ingredients.some((ing) => {
      const s = splitAmount(ing.amount);
      return (
        widestRun(s.amount, 'inter', textRole.specAmount.fontSize * fontScale) > amountText ||
        widestRun(s.metric ?? '', 'inter', textRole.small.fontSize * fontScale) > amountText
      );
    });

  return (
    <Section title="The spec" aside={aside}>
      {n > 0 ? (
        <View style={styles.rows}>
          {recipe.ingredients.map((ing, i) => (
            <IngredientRow key={`${i}-${ing.item}`} ing={ing} stacked={stacked} />
          ))}
        </View>
      ) : null}

      {steps.length > 0 ? (
        <View style={[styles.rows, n > 0 && styles.after]}>
          {steps.map((step, i) => (
            // One element per step, as the ingredient rows are: the bare figure alone says nothing.
            <View key={`step-${i}`} accessible accessibilityLabel={`Step ${i + 1}. ${step}`} style={styles.stepRow}>
              <Text style={[textRole.bodyStrong, styles.muted, tabular, styles.stepNum]}>{i + 1}</Text>
              <Text style={[textRole.body, styles.ink, styles.stepText]}>{step}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {method && !headMethod ? <Detail label="Method" detail={sentence(method)} /> : null}
      {garnish ? <Detail label="Garnish" detail={sentence(garnish)} /> : null}
    </Section>
  );
}

/** One glass however it is spelled: "snifter", "Snifter glass", "Rocks glass." are each one key. */
const glassKey = (s: string | undefined) =>
  (s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[.\s]+$/, '')
    .replace(/\s+glass(?:es)?$/, '');

/**
 * Spirits: how to pour it at home. Each part only when it has something
 * in it, since a drink someone added may know its temperature and nothing
 * else.
 *
 * The glass only when it says more than the facts above already do
 * (`drink`, whose glass FactList shows): 666 of the 1,190 spirits name
 * the same glass in both, and a page that says "Rocks glass" twice is the
 * clutter v4 took out. "Chilled shot glass" and "Copita or Glencairn" say
 * more than the fact's "Shot glass" and "Glencairn glass", so they keep
 * the row.
 */
export function ServeSection({
  serve,
  drink,
}: {
  serve: ServeGuide;
  drink?: Pick<Drink, 'category' | 'glassware' | 'subcategory'>;
}) {
  const shown = drink ? glassPhrase(drink) : '';
  const glass = shown && glassKey(serve.glass) === glassKey(shown) ? '' : serve.glass;
  const rows = [
    { label: 'Temperature', detail: serve.temp },
    { label: 'Glass', detail: glass },
    { label: 'How to serve it', detail: serve.how },
    { label: 'Pairs with', detail: (serve.pair ?? []).filter(Boolean).join(', ') },
  ].filter((r) => r.detail && r.detail.trim());
  if (rows.length === 0) return null;
  return (
    <Section title="The pour">
      {rows.map((r) => (
        <Detail key={r.label} label={r.label} detail={sentence(r.detail.trim())} />
      ))}
    </Section>
  );
}

/**
 * Spirits: what the bottle is made of. Not a recipe: nobody builds these
 * at the bar, so a step list would be a lie. The labels come from the
 * data (Base/Distillation/Aging for a spirit, Grapes/Region/Vinification
 * for a sherry or a port). The summary leads and the process closes; a
 * drink someone added has no summary (it is editorial).
 */
export function CompositionSection({ composition }: { composition: Composition }) {
  const parts = composition.components.filter((c) => c.detail.trim());
  const summary = composition.summary.trim();
  const process = composition.process.trim();
  if (parts.length === 0 && !summary && !process) return null;
  return (
    <Section title="What's in it">
      {summary ? <Text style={[textRole.body, styles.ink]}>{summary}</Text> : null}
      {parts.map((c, i) => (
        <Detail key={`${i}-${c.label}`} label={c.label} detail={c.detail} />
      ))}
      {process ? <Text style={[textRole.body, styles.ink, styles.after]}>{process}</Text> : null}
    </Section>
  );
}

/** The description. Nothing when there is none. */
export function FieldNotes({ description }: { description: string }) {
  if (!description.trim()) return null;
  return (
    <Section title="Field notes">
      <Text style={[textRole.body, styles.ink]}>{description}</Text>
    </Section>
  );
}

/**
 * Where the drink came from, with its year beside the head ("1919"). Only
 * the year: the place is already the origin fact above, and datelineOf's
 * "Florence, Italy · 1919" said it a second time a screen apart.
 *
 * The text is the drink's researched origin story (generated into
 * drinks.json by scripts/merge-origin-stories.mjs), else its fun fact, so
 * a drink without a story yet still has a paragraph here. A story replaces
 * the fun fact outright, because the writers fold a true one into it;
 * datelineOf takes the year from the same text, for the same reason.
 * Nothing when both are empty. No line limit: it is the page's one piece
 * of prose.
 */
export function OriginStory({ drink }: { drink: Pick<Drink, 'funFact' | 'originStory'> }) {
  const text = drink.originStory?.trim() || drink.funFact?.trim();
  if (!text) return null;
  // With no origin, datelineOf answers with the year alone (taken from the same text it always was).
  const year = datelineOf({ origin: '', funFact: drink.funFact, originStory: drink.originStory });
  return (
    <Section title="Origin story" aside={year || undefined}>
      <Text style={[textRole.story, styles.ink]}>{text}</Text>
    </Section>
  );
}

/* ==================================================================== */
/* Friends who caught it                                                */
/* ==================================================================== */

/** Rows shown before "and N more". */
const FRIENDS_MAX = 3;
const FRIEND_AVATAR = 32;

/**
 * The people you follow whose posts of this drink are in your feed, newest
 * first, each once: the drink page now holds what the likers sheet's "In
 * their Dex" tags and the feed's plates used to say (layout spec 5.4).
 * Posting a drink is how it joins a Dex, so a post is the honest sign;
 * nothing here is fetched, so it is only ever "from your feed", never a
 * claim about everyone. A row opens that friend's post of it.
 *
 * Nothing at all when nobody you follow has posted it, or signed out.
 */
export function FriendsWhoCaught({ drinkId, onOpenPost }: { drinkId: string; onOpenPost: (postId: string) => void }) {
  const myId = useAuth((s) => s.session?.user.id);
  const feed = useSocial((s) => s.feed);
  const following = useSocial((s) => s.following);
  const profiles = useSocial((s) => s.profiles);

  const friends = useMemo(() => {
    if (!myId) return [];
    const follow = new Set(following);
    const posts = feed
      .filter((p) => p.drinkId === drinkId && !p.mine && p.authorId !== myId && follow.has(p.authorId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const seen = new Set<string>();
    const out: { post: Post; person: UserProfile }[] = [];
    for (const post of posts) {
      if (seen.has(post.authorId)) continue;
      seen.add(post.authorId);
      const person = Object.prototype.hasOwnProperty.call(profiles, post.authorId) ? profiles[post.authorId] : undefined;
      if (person) out.push({ post, person });
    }
    return out;
  }, [drinkId, feed, following, myId, profiles]);

  if (friends.length === 0) return null;
  const shown = friends.slice(0, FRIENDS_MAX);
  const more = friends.length - shown.length;

  return (
    <Section title="Friends who caught it">
      {shown.map(({ post, person }) => (
        <Pressable
          key={person.id}
          onPress={() => onOpenPost(post.id)}
          accessibilityRole="button"
          accessibilityLabel={`${person.username} caught it`}
          accessibilityHint="Opens their post"
          style={({ pressed }) => [styles.friendRow, pressed && styles.pressed]}>
          <Avatar
            name={person.displayName || person.username}
            accent={person.accent}
            avatarPath={person.avatarPath}
            size={FRIEND_AVATAR}
          />
          {/* A username is one word: one line, and an ellipsis only for a very long one. */}
          <Text numberOfLines={1} style={[textRole.body, styles.ink, styles.friendName]}>
            {person.username}
          </Text>
          <Icon name="chevronRight" size={18} color={colors.textMuted} />
        </Pressable>
      ))}
      {more > 0 ? (
        <Text style={[textRole.small, styles.muted]}>{`and ${more} more in your feed`}</Text>
      ) : null}
    </Section>
  );
}

/* ==================================================================== */
/* Pinned bar                                                           */
/* ==================================================================== */

/** Past this many characters "Post another <name>" becomes "Post it again". */
const BAR_NAME_MAX = 22;
const BAR_CAP = 1.3;

/**
 * The page's one action, pinned to the foot on the page's white: "Post
 * this drink" until it is in your Dex, then "Post another <name>" ("Post
 * it again" for a name too long to sit in a key). The ink key. Spoken
 * "Post <name>" / "Post another <name>", the full name either way.
 *
 * The 1pt rule over it shows only while the page has more under the bar
 * (`ruled`, the route's scroll signal), as a top bar's rule does: at the
 * page's end nothing is under it, and a rule there would be a divider.
 *
 * The label caps at 1.3 and may wrap to two lines; the bar grows with it.
 * `onHeight` reports the bar's measured height so the route can pad its
 * content by it, and nothing at the foot hides under a bar that grew.
 */
export function PinnedPostBar({
  name,
  collected,
  ruled,
  onPress,
  onHeight,
}: {
  name: string;
  collected: boolean;
  ruled: boolean;
  onPress: () => void;
  onHeight?: (height: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const label = collected ? (name.length > BAR_NAME_MAX ? 'Post it again' : `Post another ${name}`) : 'Post this drink';
  return (
    <View
      onLayout={(e) => onHeight?.(Math.ceil(e.nativeEvent.layout.height))}
      style={[styles.bar, ruled && styles.barRuled, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
      <Button
        label={label}
        variant="primary"
        icon="plus"
        block
        onPress={onPress}
        accessibilityLabel={collected ? `Post another ${name}` : `Post ${name}`}
        maxFontSizeMultiplier={BAR_CAP}
      />
    </View>
  );
}

/**
 * Whether the page has more under the pinned bar: its rule's signal.
 * Worked out from the scroll offset, the view's height and the content's,
 * so a page too short to scroll is answered on layout, not left ruled
 * until a scroll that never comes. State flips only when the answer
 * changes, never per frame. Pass all three handlers to the ScrollView,
 * `onScroll` with scrollEventThrottle={16}.
 */
export function useMoreBelow(): {
  moreBelow: boolean;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onLayout: (e: LayoutChangeEvent) => void;
  onContentSizeChange: (w: number, h: number) => void;
} {
  const [moreBelow, setMoreBelow] = useState(true);
  const m = useRef({ y: 0, view: 0, content: 0, more: true });
  const settle = () => {
    const { y, view, content } = m.current;
    if (view <= 0 || content <= 0) return;
    const more = y + view < content - 1;
    if (more === m.current.more) return;
    m.current.more = more;
    setMoreBelow(more);
  };
  return {
    moreBelow,
    onScroll: (e) => {
      m.current.y = e.nativeEvent.contentOffset.y;
      m.current.view = e.nativeEvent.layoutMeasurement.height;
      m.current.content = e.nativeEvent.contentSize.height;
      settle();
    },
    onLayout: (e) => {
      m.current.view = e.nativeEvent.layout.height;
      settle();
    },
    onContentSizeChange: (_w, h) => {
      m.current.content = h;
      settle();
    },
  };
}

/** The bar's height before it has been measured. */
export function pinnedBarEstimate(bottomInset: number): number {
  return layout.pinnedBar + bottomInset;
}

/* ==================================================================== */
/* Styles                                                               */
/* ==================================================================== */

const styles = StyleSheet.create({
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  pressed: { opacity: 0.6 },

  /* Title block: 24 under the print, the plate 12 under the name. */
  titleBlock: { marginTop: space.xl, paddingHorizontal: layout.gutter },
  plates: {
    marginTop: space.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
  },
  addedPlate: {
    minHeight: 24,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: colors.lineControl,
  },
  /* DexStatusTag's in-Dex geometry, so the two states sit in the same box. */
  notYetTag: {
    minHeight: 26,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: colors.hair,
  },

  /* The facts, two to a row */
  facts: {
    marginTop: space.xl,
    marginHorizontal: layout.gutter,
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: space.xl,
    rowGap: space.lg,
  },

  /* Sections: 32 of air above each, the head 12 over its content. */
  section: { marginTop: layout.section, paddingHorizontal: layout.gutter, gap: space.md },
  sectionHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: space.md,
    rowGap: 2,
  },
  detail: { gap: 2 },
  rows: { gap: space.md },
  after: { marginTop: space.xs },

  /* In your Dex since */
  sinceRow: { minHeight: SINCE_THUMB, flexDirection: 'row', alignItems: 'center', gap: space.lg },
  sinceText: { flex: 1 },
  note: { marginTop: space.xs },

  /* Ingredients */
  ingRow: { flexDirection: 'row', alignItems: 'baseline' },
  ingRowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 2 },
  amountCol: { width: AMOUNT_COL, paddingRight: AMOUNT_GAP },
  /* Beside the amount column it takes the rest of the row; stacked, its own height. */
  ingItemBeside: { flex: 1 },

  /* Steps */
  stepRow: { flexDirection: 'row', alignItems: 'flex-start' },
  stepNum: { width: 28 },
  stepText: { flex: 1 },

  /* Friends who caught it */
  friendRow: { minHeight: layout.hit, flexDirection: 'row', alignItems: 'center', gap: space.md },
  friendName: { flex: 1 },

  /* Pinned bar */
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.md,
    paddingHorizontal: layout.gutter,
    backgroundColor: colors.bg,
    // Always laid out, transparent until content runs under it, so showing it moves nothing.
    borderTopWidth: stroke.edge,
    borderTopColor: 'transparent',
  },
  barRuled: { borderTopColor: colors.line },
});
