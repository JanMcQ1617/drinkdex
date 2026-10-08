import { Image } from 'expo-image';
import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { DrinkName, LiningBand, NumberPlate, useSvgId } from '@/components/cabinet';
import { DexThumb } from '@/components/DexCard';
import { Grain } from '@/components/Grain';
import { Icon } from '@/components/icons';
import { DexStatusPlaque, TopScrim } from '@/components/media';
import { Button, Card } from '@/components/ui';
import {
  colors,
  elevation,
  fonts,
  layout,
  radius,
  space,
  stroke,
  tabular,
  textRole,
} from '@/constants/theme';
import {
  abvLabel,
  datelineOf,
  dexSinceLabel,
  glassLabel,
  glassPhrase,
  methodLabel,
  originLabel,
  splitAmount,
  stylePhrase,
  tastesOf,
  type LabelFact,
} from '@/lib/drinkLabels';
import { widestRun } from '@/lib/textFit';
import type { Composition, Drink, Post, Recipe, RecipeIngredient, ServeGuide, UnlockRecord } from '@/types';

/* ==================================================================== */
/* The drink page's panels                                              */
/*                                                                      */
/* Shared by drink/[id].tsx and custom/[id].tsx, so a drink someone     */
/* added is drawn by the same code as a catalogue entry: the same hero  */
/* dissolve, title block, label band, spec card and pinned bar. Two     */
/* copies would drift, and the person comparing their entry with the    */
/* one under it in the Dex would see two different apps.                */
/*                                                                      */
/* THE CELLAR (specs/v3-cabinet.md 9.8). The page is a lit drink in the */
/* cellar: the photograph dissolves into `liningDeep` (every lit photo  */
/* already settles to that colour at its edges), the name rides over    */
/* the dissolved foot, and the reading under it sits on the same dark   */
/* ground, with the recipe as a paper spec card lying on it and the     */
/* origin story as a raised band of lining.                             */
/*                                                                      */
/* No glyph here ever sits on photo pixels. The title block is the top  */
/* of CellarPage, an OPAQUE cellar ground with an 80pt fade above it,   */
/* so the inks on it are the cellar pairs check-contrast measures       */
/* (onLining 14.47:1, onLiningMuted 7.38:1), never the over-media pairs */
/* those inks fail. The only things over the photograph are the media   */
/* skins: the scrims, the back button and the eyebrow's plaque.         */
/*                                                                      */
/* Every panel copes with blanks, because a custom drink has them where */
/* a catalogue entry never does (no composition summary, no steps, a    */
/* serve guide with only a temperature, no ABV). A blank part is left   */
/* out rather than drawn empty.                                         */
/*                                                                      */
/* Nothing here animates. Content must never depend on an animation     */
/* finishing to be visible: Reanimated can stall after a cold start in  */
/* Release builds and leave it at opacity 0 (specs/06-tab-switch-bug,   */
/* cause 1). The only motion on the page is the route's hero parallax,  */
/* which is the identity at rest.                                       */
/* ==================================================================== */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO date -> "Jul 16, 2026" */
export function formatLogDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * First letter up, the rest as written.
 *
 * The spirit data stores its serving facts the way they read mid-sentence
 * ("veladora", "room temp, never chilled") and the cards set each one as a
 * value on its own, where lowercase reads as a typo. Done at render
 * because drinks.json is generated, never edited by hand.
 */
export function sentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ==================================================================== */
/* Geometry                                                             */
/* ==================================================================== */

/** The hero's height as a share of the window's width (500pt on a 440pt phone). */
const HERO_ASPECT = 1.14;
/** The hero's foot that dissolves into the cellar. */
const HERO_DISSOLVE = 200;
/**
 * How far the title block rides up over the hero. With the dissolve, the
 * photograph is already 44% gone where the block's ground begins (88 of
 * the dissolve's 200pt lie above it).
 */
const TITLE_OVERLAP = 112;
/** The fade above the title block's opaque ground. */
const TITLE_FADE = 80;
/** Strips the grain fades in over, across TITLE_FADE (see GrainRamp). */
const RAMP_STEPS = 8;

/** Dynamic Type caps (specs/v3-cabinet.md 6.5). */
const HERO_NAME_CAP = 1.2;
const BAND_CAP = 1.3;

/**
 * The label band's cell padding: the first column is flush left, and a
 * value runs up to the next column's rule, as on a printed label. The
 * width estimate errs wide, so a value it passes clears the rule anyway;
 * a right pad of even 4pt sent a third of the catalogue to the 2 x 2 on a
 * 393pt phone (measured over all 2,089 drinks), most of them for values
 * that fit.
 */
const CELL_PAD_LEFT = 12;
const CELL_PAD_RIGHT = 0;

/** The spec card's amount column, the gap after it, and when it stops being a column. */
const AMOUNT_COL = 84;
const AMOUNT_GAP = space.sm;
const STACK_ABOVE_SCALE = 1.3;

/** The hero's height for a window this wide. */
export function heroHeight(width: number): number {
  return Math.round(width * HERO_ASPECT);
}

/** Hidden from VoiceOver and untouchable: a layer of light, not content. */
const DECOR = {
  pointerEvents: 'none' as const,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
};

/* ==================================================================== */
/* Hero and the cellar ground                                           */
/* ==================================================================== */

/**
 * Clear to the cellar, top to bottom, in one colour: the stops differ
 * only in opacity. A gradient from `transparent` (clear black) would pass
 * through a dark grey on its way, a band no photograph has.
 */
function Dissolve({ style }: { style: StyleProp<ViewStyle> }) {
  const id = useSvgId('dissolve');
  return (
    <View {...DECOR} style={style}>
      {/* Sized by attribute as well: an <svg> without one is 300x150 on web. */}
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.liningDeep} stopOpacity={0} />
            <Stop offset="1" stopColor={colors.liningDeep} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * What lies over the hero's picture: the top scrim under the status bar
 * and the back button, and the 200pt dissolve at its foot into the
 * cellar. Put it last inside the hero frame, which clips it. A lit
 * catalogue photo already settles to `liningDeep` at its edges, so the
 * dissolve finishes what the bake began and there is no seam.
 */
export function HeroShade() {
  return (
    <>
      <TopScrim />
      <Dissolve style={styles.heroDissolve} />
    </>
  );
}

/**
 * The grain fades in across the title fade instead of starting at the
 * opaque edge. Grain lifts the cellar's mean colour by up to ten levels
 * (of 255), so a flat ground meeting a grained one draws a visible line;
 * in eight strips, each a step stronger, the change is about a level a
 * strip.
 * Each strip shows its own slice of one continuous tile (the inner box
 * is offset by the strip's top), so the strips do not repeat one another.
 */
function GrainRamp() {
  const step = TITLE_FADE / RAMP_STEPS;
  return (
    <View {...DECOR} style={styles.ramp}>
      {Array.from({ length: RAMP_STEPS }, (_, i) => (
        <View key={i} style={[styles.rampStrip, { height: step, opacity: (i + 0.5) / RAMP_STEPS }]}>
          <View style={[styles.rampTile, { top: -i * step }]}>
            <Grain tone="lining" />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Everything under the hero, on its own opaque cellar ground.
 *
 * It rides up over the hero's dissolved foot (TITLE_OVERLAP), with an
 * 80pt fade to the cellar hanging above it, so the title block it opens
 * with never has a photograph under a glyph. Opaque all the way down for
 * the parallax's sake: the hero scrolls at 0.35 of the page's speed, so
 * it slides down BEHIND everything here, and a transparent stretch would
 * show it again further down the page.
 *
 * Its gutter is its children's: the origin story band runs full bleed.
 * `paddingBottom` clears the pinned bar (the route measures it).
 */
export function CellarPage({ children, paddingBottom }: { children: React.ReactNode; paddingBottom: number }) {
  return (
    <View style={[styles.page, { paddingBottom }]}>
      <Grain tone="lining" />
      <Dissolve style={styles.titleFade} />
      <GrainRamp />
      {children}
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
      <Text maxFontSizeMultiplier={BAND_CAP} style={[textRole.statusWord, styles.addedText]}>
        Added by you
      </Text>
    </View>
  );
}

/**
 * The words that ride over the hero's foot: an eyebrow and the name.
 *
 * Eyebrow (wraps): the number plate, whether it is in your Dex (a
 * statement here, not a button: you are already on the drink), then the
 * style phrase ("Spirit-forward cocktail", "American whiskey"). A custom
 * drink has neither plate (inventing a number would say it had joined the
 * Dex), so its eyebrow says whose it is instead. One VoiceOver element.
 *
 * The name is Playfair at 52 through DrinkName: no line limit, and shrunk
 * only when its widest word would not fit the line ("Holunderbeergeist").
 * "Three Dots and a Dash" wraps to three lines at the 1.2 cap and is
 * never shrunk. A header, for the Headings rotor.
 */
export function HeroTitle({ drink, inDex, custom }: { drink: Drink; inDex: boolean; custom?: boolean }) {
  const { width } = useWindowDimensions();
  const phrase = stylePhrase(drink);
  const spoken = custom
    ? `Added by you. ${phrase}`
    : `Number ${drink.dexNumber}, ${inDex ? 'in your Dex' : 'not in your Dex yet'}. ${phrase}`;

  return (
    <View style={styles.titleBlock}>
      <View accessible accessibilityLabel={spoken} style={styles.eyebrow}>
        {custom ? (
          <AddedPlate />
        ) : (
          <>
            {/* Brass when it is in your Dex, the empty holder when it is not (v3.3 D1, D2). */}
            <NumberPlate n={drink.dexNumber} tone="lining" caught={inDex} />
            <DexStatusPlaque inDex={inDex} name={drink.name} />
          </>
        )}
        <Text style={styles.eyebrowPhrase}>· {phrase}</Text>
      </View>
      <DrinkName
        name={drink.name}
        role={textRole.drinkHero}
        measure={width - layout.gutter * 2}
        cap={HERO_NAME_CAP}
        color={colors.onLining}
        accessibilityRole="header"
        style={styles.heroName}
      />
    </View>
  );
}

/* ==================================================================== */
/* Label band                                                           */
/* ==================================================================== */

type BandFact = LabelFact & { kind: 'abv' | 'origin' | 'glass' | 'method' };

function bandFacts(drink: Drink): BandFact[] {
  const method = methodLabel(drink);
  const facts: (BandFact | null)[] = [
    { kind: 'abv', ...abvLabel(drink) },
    { kind: 'origin', ...originLabel(drink.origin) },
    { kind: 'glass', ...glassLabel(drink) },
    method ? { kind: 'method', ...method } : null,
  ];
  // A custom drink may leave any of them blank.
  return facts.filter((f): f is BandFact => f != null && f.value !== '');
}

/** The band said aloud: "28 percent, London, England, Coupe glass, stirred". */
function spokenFact(f: BandFact, drink: Drink): string {
  switch (f.kind) {
    case 'abv':
      return f.value.replace(/\s*–\s*/g, ' to ').replace(/%/g, ' percent');
    case 'origin':
      return f.caption === 'origin' ? f.value : `${f.value}, ${f.caption}`;
    case 'glass':
      return glassPhrase(drink);
    case 'method':
      return f.caption === 'method' ? f.value.toLowerCase() : `served ${f.value.toLowerCase()}`;
  }
}

/**
 * The bottle label under the name: strength, origin, glass, method (a
 * spirit's serve), four equal columns between 1pt rules, each a value
 * over a small caption ("28%" / "abv", "London" / "England"). It replaced
 * a 13pt run-on facts line and two tags.
 *
 * The columns are equal from rule to rule, as on the label; a ruled
 * cell's text is its share less the 12pt pad and the 1pt rule.
 *
 * FALLS BACK TO 2 x 2 rather than break a word. A quarter column holds
 * about 73pt of text on a 375pt phone, and the catalogue has values wider
 * than that ("20.5–28.5%", "Netherlands"). iOS would break those inside
 * the word, so when any value's (or caption's) widest unbreakable run,
 * estimated at this text size (lib/textFit.ts errs wide), would not fit
 * its column, the band lays out as two rows of two. Three values leave
 * the fourth cell empty; a custom drink with fewer facts gets fewer
 * columns. At the 1.3 cap on a 375pt phone even a half column is too
 * narrow for "Massachusetts", so past the 2 x 2 the band is one fact a
 * row. Worked out, not measured, so the first frame is the final one.
 *
 * Values wrap (no line limit) and cap at 1.3. One VoiceOver element.
 */
export function LabelBand({ drink }: { drink: Drink }) {
  const { width, fontScale } = useWindowDimensions();
  const facts = bandFacts(drink);
  if (facts.length === 0) return null;

  const band = width - layout.gutter * 2;
  const scale = Math.min(fontScale, BAND_CAP);
  const valueSize = textRole.labelValue.fontSize * scale;
  const captionSize = textRole.labelCaption.fontSize * scale;
  const fitsIn = (cols: number) => {
    // One column is flush left and unruled; otherwise the narrowest cell is a ruled one.
    const text = cols === 1 ? band : band / cols - CELL_PAD_LEFT - stroke.edge - CELL_PAD_RIGHT;
    return facts.every(
      (f) => widestRun(f.value, 'inter', valueSize) <= text && widestRun(f.caption, 'inter', captionSize) <= text,
    );
  };
  const n = facts.length;
  const cols = fitsIn(n) ? n : n > 2 && fitsIn(2) ? 2 : 1;

  const rows: (BandFact | null)[][] = [];
  for (let i = 0; i < n; i += cols) {
    const row: (BandFact | null)[] = facts.slice(i, i + cols);
    // The 2 x 2 keeps its fourth cell (and its rule) when it has three facts.
    while (row.length < cols) row.push(null);
    rows.push(row);
  }
  const cellWidth = band / cols;

  return (
    <View
      accessible
      accessibilityLabel={facts.map((f) => spokenFact(f, drink)).join(', ')}
      style={styles.band}>
      {rows.map((row, r) => (
        <View key={r} style={[styles.bandRow, r > 0 && styles.bandRowRuled]}>
          {row.map((f, c) => (
            <View
              key={f ? f.kind : `empty-${c}`}
              style={[styles.bandCell, { width: cellWidth }, c > 0 && styles.bandCellRuled]}>
              {f ? (
                <>
                  <Text maxFontSizeMultiplier={BAND_CAP} style={styles.bandValue}>
                    {f.value}
                  </Text>
                  <Text maxFontSizeMultiplier={BAND_CAP} style={styles.bandCaption}>
                    {f.caption}
                  </Text>
                </>
              ) : null}
            </View>
          ))}
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

/**
 * Your entry, once you have one: the photo as a 44 x 52 print, "In your
 * Dex since 14 September", and a second line that says only what is
 * true. The collection keeps one record per drink on the phone, so there
 * is no count of posts to give. "Shared · 3 photos" when your post of
 * this drink is in the feed store (and the row opens it); otherwise "Only
 * on this phone", which is where the collection lives.
 *
 * The hero is the lit catalogue photograph now, so this is where your own
 * picture is seen. A photo whose file is gone shows the drink's mounted
 * thumbnail rather than an empty frame: the `mini` mount, the one seated
 * in the lining (matEdge and the seat; `row` is drawn for paper). The
 * failure is remembered per file, so the next photo you post is shown.
 * Your caption, when you wrote one (the record's `note`), is set under
 * the row as reading text.
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

  const body = (
    <>
      <View {...DECOR}>
        {uri && uri !== lostUri ? (
          <Image
            source={{ uri }}
            style={styles.sinceThumb}
            contentFit="cover"
            transition={140}
            accessible={false}
            enforceEarlyResizing
            onError={() => setLostUri(uri)}
          />
        ) : (
          <DexThumb drink={drink} size="mini" />
        )}
      </View>
      <View style={styles.sinceText}>
        <Text style={styles.sinceTitle}>{since}</Text>
        <Text style={styles.sinceLine}>{line2}</Text>
      </View>
      {open ? <Icon name="chevronRight" size={18} color={colors.onLiningFaint} /> : null}
    </>
  );

  return (
    <View style={styles.since}>
      {open ? (
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={`${since}. ${line2.replace(' · ', ', ')}`}
          accessibilityHint="Opens your post"
          style={({ pressed }) => [styles.sinceRow, pressed && styles.pressed]}>
          {body}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={`${since}. ${line2.replace(' · ', ', ')}`} style={styles.sinceRow}>
          {body}
        </View>
      )}
      {record.note ? <Text style={styles.note}>“{record.note}”</Text> : null}
    </View>
  );
}

/* ==================================================================== */
/* Tastes of                                                            */
/* ==================================================================== */

/** "Menthol, bitter herbs, juniper, cola spice" at 18pt, in place of the 11pt tags. Nothing when there are none. */
export function TastesOf({ notes }: { notes: string[] }) {
  const line = tastesOf(notes);
  if (!line) return null;
  return (
    <View style={styles.tastes}>
      <Text style={styles.kicker} accessibilityRole="header">
        Tastes of
      </Text>
      <Text style={styles.tastesLine}>{line}</Text>
    </View>
  );
}

/* ==================================================================== */
/* Mat cards                                                            */
/* ==================================================================== */

/**
 * A paper card lying on the cellar: mat stock, a 1pt `line` edge, and
 * `elevation.paper`, the one shadow a card casts off the lining. Ink
 * inside is the paper set (text 14.50:1, textMuted 5.78:1, wine 12.96:1
 * on mat). The head is 52pt with a rule under it.
 */
function MatCard({
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
    <Card surface="mat" style={[styles.matCard, style]}>
      <View style={styles.matHead}>
        <Text style={styles.matTitle} accessibilityRole="header">
          {title}
        </Text>
        {aside ? <Text style={styles.matAside}>{aside}</Text> : null}
      </View>
      {children}
    </Card>
  );
}

/**
 * A label over its detail, ruled above: method, garnish, the serve's
 * parts, the composition's. `first` drops the rule for a row straight
 * under the head, which already has one.
 */
function MatRow({ label, detail, first }: { label: string; detail: string; first?: boolean }) {
  return (
    <View style={[styles.matRow, !first && styles.ruled]}>
      <Text style={styles.matLabel}>{label}</Text>
      <Text style={styles.matDetail}>{detail}</Text>
    </View>
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
 * amount in tabular wine in an 84pt column, its metric under it, then the
 * item with any note after it ("Soda water · to top").
 *
 * `stacked` puts the amount above the item in one column, for the card's
 * every row at once so the column never half-holds: past 1.3x text an
 * 84pt column would wrap "1.5 oz" a letter at a time, and an amount whose
 * longest word is wider than the column's 76pt of text ("1 barspoon",
 * "2–3 cherries") would break inside the word.
 */
function IngredientRow({ ing, first, stacked }: { ing: RecipeIngredient; first: boolean; stacked: boolean }) {
  const { amount, metric, note } = splitAmount(ing.amount);
  const spoken = [amount, metric, ing.item, note].filter(Boolean).join(', ');
  const hasAmount = Boolean(amount || metric);
  return (
    <View
      accessible
      accessibilityLabel={spoken}
      style={[styles.ingRow, !first && styles.ruled, stacked && styles.ingRowStacked]}>
      {hasAmount || !stacked ? (
        <View style={stacked ? null : styles.amountCol}>
          {amount ? <Text style={styles.amount}>{amount}</Text> : null}
          {metric ? <Text style={styles.metric}>{metric}</Text> : null}
        </View>
      ) : null}
      <Text style={[styles.ingItem, !stacked && styles.ingItemBeside]}>
        {ing.item}
        {note ? <Text style={styles.ingNote}>{` · ${note}`}</Text> : null}
      </Text>
    </View>
  );
}

/**
 * Cocktails: how to make it, as a bar's spec card. "The spec" with the
 * method and the count; the ingredients amount first; the steps under a
 * rule, numbered with bare tabular figures (no discs); then the garnish.
 *
 * The method is said once, in the head (the label band says it too, so a
 * third "Shaken" in a row of its own would be one too many); only a
 * method too long for the head gets a row. A drink someone added may have
 * no steps and no amounts: the block is left out and a missing amount
 * leaves its column empty rather than inventing one. Nothing at all when
 * there is nothing to show.
 */
export function SpecCard({ recipe, style }: { recipe: Recipe; style?: ViewStyle }) {
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
  const amountSize = textRole.specAmount.fontSize * fontScale;
  const amountText = AMOUNT_COL - AMOUNT_GAP;
  const stacked =
    fontScale > STACK_ABOVE_SCALE ||
    recipe.ingredients.some((ing) => {
      const s = splitAmount(ing.amount);
      return (
        widestRun(s.amount, 'inter', amountSize) > amountText ||
        widestRun(s.metric ?? '', 'inter', textRole.labelCaption.fontSize * fontScale) > amountText
      );
    });

  return (
    <MatCard title="The spec" aside={aside} style={style}>
      {recipe.ingredients.map((ing, i) => (
        <IngredientRow key={`${i}-${ing.item}`} ing={ing} first={i === 0} stacked={stacked} />
      ))}

      {steps.length > 0 ? (
        <View style={[styles.steps, n > 0 && styles.ruled]}>
          {steps.map((step, i) => (
            // One element per step, as the ingredient rows are: the bare figure alone says nothing.
            <View key={`step-${i}`} accessible accessibilityLabel={`Step ${i + 1}. ${step}`} style={styles.stepRow}>
              <Text style={styles.stepNum}>{i + 1}</Text>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {method && !headMethod ? (
        <MatRow label="Method" detail={sentence(method)} first={n === 0 && steps.length === 0} />
      ) : null}
      {garnish ? (
        <MatRow
          label="Garnish"
          detail={sentence(garnish)}
          first={n === 0 && steps.length === 0 && !(method && !headMethod)}
        />
      ) : null}
    </MatCard>
  );
}

/**
 * Spirits: how to pour it at home, on the same mat card. Each part only
 * when it has something in it, since a drink someone added may know its
 * temperature and nothing else.
 */
export function ServeCard({ serve, style }: { serve: ServeGuide; style?: ViewStyle }) {
  const rows = [
    { label: 'Temperature', detail: serve.temp },
    { label: 'Glass', detail: serve.glass },
    { label: 'How to serve it', detail: serve.how },
    { label: 'Pairs with', detail: (serve.pair ?? []).filter(Boolean).join(', ') },
  ].filter((r) => r.detail && r.detail.trim());
  if (rows.length === 0) return null;
  return (
    <MatCard title="The pour" style={style}>
      {rows.map((r, i) => (
        <MatRow key={r.label} label={r.label} detail={sentence(r.detail.trim())} first={i === 0} />
      ))}
    </MatCard>
  );
}

/**
 * Spirits: what the bottle is made of. Not a recipe: nobody builds these
 * at the bar, so a step list would be a lie. The labels come from the
 * data (Base/Distillation/Aging for a spirit, Grapes/Region/Vinification
 * for a sherry or a port). The summary leads and the process closes; a
 * drink someone added has no summary (it is editorial).
 */
export function CompositionCard({ composition, style }: { composition: Composition; style?: ViewStyle }) {
  const parts = composition.components.filter((c) => c.detail.trim());
  const summary = composition.summary.trim();
  const process = composition.process.trim();
  if (parts.length === 0 && !summary && !process) return null;
  return (
    <MatCard title="What's in it" style={style}>
      {summary ? <Text style={styles.matLead}>{summary}</Text> : null}
      {parts.map((c, i) => (
        <MatRow key={`${i}-${c.label}`} label={c.label} detail={c.detail} first={i === 0 && !summary} />
      ))}
      {process ? (
        <Text style={[styles.matLead, (Boolean(summary) || parts.length > 0) && styles.ruled]}>{process}</Text>
      ) : null}
    </MatCard>
  );
}

/* ==================================================================== */
/* Field notes and the origin story                                     */
/* ==================================================================== */

/** The description, on the cellar ground. Nothing when there is none. */
export function FieldNotes({ description }: { description: string }) {
  if (!description.trim()) return null;
  return (
    <View style={styles.fieldNotes}>
      <Text style={styles.fieldTitle} accessibilityRole="header">
        Field notes
      </Text>
      <Text style={styles.fieldBody}>{description}</Text>
    </View>
  );
}

/**
 * Where the drink came from, as reading text on a full-bleed band of
 * lining (lining on the cellar reads raised), ruled top and bottom, under
 * a dateline of its origin and year ("Florence, Italy · 1919"). It took
 * Bar trivia's place in v3.1.
 *
 * The text is the drink's researched origin story (generated into
 * drinks.json by scripts/merge-origin-stories.mjs), else its fun fact, so
 * a drink without a story yet still has the band trivia had. A story
 * replaces the fun fact outright, because the writers fold a true one into
 * it; datelineOf takes the year from the same text, for the same reason.
 * Nothing when both are empty. No line limit: it is the page's one piece
 * of prose.
 */
export function OriginStory({ drink }: { drink: Pick<Drink, 'origin' | 'funFact' | 'originStory'> }) {
  const text = drink.originStory?.trim() || drink.funFact?.trim();
  if (!text) return null;
  const dateline = datelineOf(drink);
  return (
    <LiningBand style={styles.story}>
      <Text style={styles.storyKicker} accessibilityRole="header">
        Origin story
      </Text>
      {dateline ? <Text style={styles.storyDateline}>{dateline}</Text> : null}
      <Text style={styles.storyText}>{text}</Text>
    </LiningBand>
  );
}

/* ==================================================================== */
/* Pinned bar                                                           */
/* ==================================================================== */

/** Past this many characters "Post another <name>" becomes "Post it again". */
const BAR_NAME_MAX = 22;
const BAR_CAP = 1.3;

/**
 * The page's one action, pinned over the foot: "Post this drink" until it
 * is in your Dex, then "Post another <name>" ("Post it again" for a name
 * too long to sit in a button). The bone button, because wine on lining
 * is 1.22:1. Spoken "Post <name>" / "Post another <name>", the full name
 * either way. The export keeps its v3 name: renaming it would touch both
 * callers for nothing a user sees.
 *
 * The label caps at 1.3 and may wrap to two lines; the bar grows with it.
 * `onHeight` reports the bar's measured height so the route can pad its
 * content by it, and nothing at the foot hides under a bar that grew.
 */
export function PinnedLogBar({
  name,
  collected,
  onPress,
  onHeight,
}: {
  name: string;
  collected: boolean;
  onPress: () => void;
  onHeight?: (height: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const label = collected
    ? name.length > BAR_NAME_MAX
      ? 'Post it again'
      : `Post another ${name}`
    : 'Post this drink';
  return (
    <View
      onLayout={(e) => onHeight?.(Math.ceil(e.nativeEvent.layout.height))}
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
      <Grain tone="lining" />
      <Button
        label={label}
        variant="onLining"
        icon="plus"
        block
        onPress={onPress}
        accessibilityLabel={collected ? `Post another ${name}` : `Post ${name}`}
        maxFontSizeMultiplier={BAR_CAP}
      />
    </View>
  );
}

/** The bar's height before it has been measured. */
export function pinnedBarEstimate(bottomInset: number): number {
  return layout.pinnedBar + bottomInset;
}

/* ==================================================================== */
/* Styles                                                               */
/* ==================================================================== */

const styles = StyleSheet.create({
  /* Hero and ground */
  heroDissolve: { position: 'absolute', left: 0, right: 0, bottom: 0, height: HERO_DISSOLVE },
  page: {
    marginTop: -TITLE_OVERLAP,
    backgroundColor: colors.liningDeep,
  },
  titleFade: { position: 'absolute', left: 0, right: 0, top: -TITLE_FADE, height: TITLE_FADE },
  ramp: { position: 'absolute', left: 0, right: 0, top: -TITLE_FADE, height: TITLE_FADE },
  rampStrip: { overflow: 'hidden' },
  rampTile: { position: 'absolute', left: 0, right: 0, height: TITLE_FADE },

  /* Title block */
  titleBlock: { paddingHorizontal: layout.gutter },
  eyebrow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space.sm,
    rowGap: 6,
  },
  eyebrowPhrase: {
    fontFamily: fonts.bodyMedium,
    fontSize: textRole.helper.fontSize,
    lineHeight: textRole.helper.lineHeight,
    color: colors.onLiningMuted,
  },
  heroName: { marginTop: 6 },
  addedPlate: {
    minHeight: 24,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: colors.plateEdgeLining,
  },
  addedText: { color: colors.onLiningMuted },

  /* Label band */
  band: {
    marginTop: 14,
    marginHorizontal: layout.gutter,
    borderTopWidth: stroke.edge,
    borderBottomWidth: stroke.edge,
    borderColor: colors.liningLine,
  },
  bandRow: { flexDirection: 'row' },
  bandRowRuled: { borderTopWidth: stroke.edge, borderTopColor: colors.liningLine },
  /* Width from LabelBand: equal outer widths. flexBasis 0 would share out what
     is left after each cell's pad and rule, and set the first rule 13pt early. */
  bandCell: {
    paddingTop: 10,
    paddingBottom: space.md,
    paddingRight: CELL_PAD_RIGHT,
  },
  bandCellRuled: {
    paddingLeft: CELL_PAD_LEFT,
    borderLeftWidth: stroke.edge,
    borderLeftColor: colors.liningLine,
  },
  bandValue: { ...textRole.labelValue, color: colors.onLining },
  bandCaption: { ...textRole.labelCaption, color: colors.onLiningMuted, marginTop: 2 },

  /* In your Dex since */
  since: { marginTop: 14, paddingHorizontal: layout.gutter },
  sinceRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space.md },
  sinceThumb: {
    width: 44,
    height: 52,
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: colors.liningLine,
    backgroundColor: colors.lining,
  },
  sinceText: { flex: 1 },
  sinceTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 20, color: colors.onLining },
  sinceLine: { ...textRole.helper, color: colors.onLiningMuted },
  pressed: { opacity: 0.6 },
  /* Your own words about the drink: reading text, upright (the app has no italic cut). */
  note: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.onLining,
    marginTop: 10,
  },

  /* Tastes of */
  tastes: { marginTop: 20, paddingHorizontal: layout.gutter },
  kicker: { ...textRole.helper, color: colors.onLiningMuted },
  tastesLine: { ...textRole.tastes, color: colors.onLining, marginTop: 2 },

  /* Mat cards */
  matCard: {
    marginTop: space.xl,
    marginHorizontal: layout.gutter,
    paddingHorizontal: space.lg,
    ...elevation.paper,
  },
  matHead: {
    minHeight: 52,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: space.md,
    rowGap: 2,
    paddingVertical: 10,
    borderBottomWidth: stroke.edge,
    borderBottomColor: colors.line,
  },
  matTitle: { ...textRole.sectionTitle, fontSize: 17, color: colors.text },
  matAside: { ...textRole.helper, color: colors.textMuted },
  ruled: { borderTopWidth: stroke.edge, borderTopColor: colors.line },
  matRow: { paddingVertical: space.md, gap: 2 },
  matLabel: { ...textRole.fieldLabel, color: colors.textMuted },
  matDetail: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text },
  matLead: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
    paddingVertical: space.md,
  },

  /* Ingredients */
  ingRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: space.md,
  },
  ingRowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 2 },
  amountCol: { width: AMOUNT_COL, paddingRight: AMOUNT_GAP },
  amount: { ...textRole.specAmount, color: colors.wine },
  metric: { ...textRole.labelCaption, color: colors.textMuted, ...tabular },
  ingItem: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.text },
  /* Beside the amount column it takes the rest of the row; stacked, its own height. */
  ingItemBeside: { flex: 1 },
  ingNote: { ...textRole.helper, color: colors.textMuted },

  /* Steps */
  steps: { paddingVertical: 14, gap: space.md },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start' },
  stepNum: {
    width: 24,
    ...textRole.labelValue,
    lineHeight: 24,
    color: colors.textMuted,
    ...tabular,
  },
  stepText: { flex: 1, fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.text },

  /* Field notes */
  fieldNotes: { marginTop: space.xxl, paddingHorizontal: layout.gutter },
  fieldTitle: { ...textRole.sectionTitle, color: colors.onLining, marginBottom: space.sm },
  fieldBody: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.onLining },

  /* Origin story */
  story: {
    marginTop: space.xxl,
    padding: 20,
    borderTopWidth: stroke.edge,
    borderBottomWidth: stroke.edge,
    borderColor: colors.liningLine,
  },
  storyKicker: { ...textRole.helper, fontFamily: fonts.bodySemiBold, color: colors.onLiningMuted },
  storyDateline: { ...textRole.helper, color: colors.onLiningMuted, ...tabular },
  storyText: { ...textRole.story, color: colors.onLining, marginTop: space.sm },

  /* Pinned bar */
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.md,
    paddingHorizontal: layout.gutter,
    backgroundColor: colors.lining,
    borderTopWidth: stroke.edge,
    borderTopColor: colors.liningLine,
  },
});
