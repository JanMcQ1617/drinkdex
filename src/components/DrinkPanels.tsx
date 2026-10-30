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

import { DexStatusTag, DrinkName, nameFit, Print } from '@/components/cabinet';
import { DexThumb, DrinkFace } from '@/components/DexCard';
import { lineMarks } from '@/components/details/lineMarks';
import { numeralWidth } from '@/components/details/numeralPath';
import { Paper } from '@/components/details/Paper';
import { PenDoubleRule, PenMargin } from '@/components/details/PenMarks';
import { PEN, PEN_SEED } from '@/components/details/penPath';
import { PressLeader, PressNumeral } from '@/components/details/PressMarks';
import { Icon } from '@/components/icons';
import { formatPlateNumber, NumberPlate } from '@/components/plate';
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
import { BUY_LABEL, buyLabelFor } from '@/lib/shop';
import { postKeyLabel } from '@/lib/shopCore';
import { textWidth, widestRun } from '@/lib/textFit';
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
/* by space under the poster's heads (Anton capitals, since v4.10,      */
/* specs/v4.10/spec.md T.7): no cards, no rules, no bands.              */
/*                                                                      */
/* Every panel copes with blanks, because a custom drink has them where */
/* a catalogue entry never does (no composition summary, no steps, a    */
/* serve guide with only a temperature, no ABV). A blank part is left   */
/* out rather than drawn empty.                                         */
/*                                                                      */
/* THE RULED RECORD (v4.6, specs/v4.6-details A.3 #5, #6, #8). The first */
/* exception to "no rules": the logo's pen, at hairline weight, rules   */
/* the record the way a ledger's page is ruled, and says nothing. A     */
/* margin rule in the middle of the left gutter (x 12) runs from the    */
/* name's cap height to the last fact's baseline (HeroRecord); a column */
/* rule runs between the two fact columns, only when there are two      */
/* (FactList); and a caught drink's Nº plate lets one drip of its paint */
/* fall (NumberPlate's `drip`, passed by HeroTitle alone). None touches */
/* the print (the margin rule starts 36.8 under it), a key or a word,   */
/* and their heights come from the type's own metrics (details/         */
/* lineMarks) with the rules measuring themselves, so they follow       */
/* Dynamic Type.                                                        */
/*                                                                      */
/* THE SPEC AS A MENU CARD (v4.9, specs/v4.9/details C.5, A.5). Jan:    */
/* "it still feels too empty", and two of the directions he picked land */
/* here. The first how-section the page draws (the spec, else the       */
/* serve, else the composition) opens with a lead: the pen's double     */
/* rule across the column, then the drink's own figure in the press's   */
/* outline, "Nº 0100" at cap 48 in colors.rule (Anton's figures since   */
/* v4.10, the plate's spelling, shrunk only to fit a narrow column, and */
/* drawn only up to 1.3x text),                                         */
/* then its head. A custom drink gets the rule without a figure: it has */
/* no number. The figure is the same grey caught or not, and never      */
/* spoken (the plate says "Number 100"). The spec's rows read as a menu */
/* sets them, item ··· amount: the press's dotted leader between, on    */
/* the item's first baseline, its dots dropped when the item wraps or   */
/* has no amount (the leader itself is always laid out, so a wrap can   */
/* never undo itself). Past 1.3x, or with an amount wider than its      */
/* column, the rows stack as they always did. The page and the pinned   */
/* bar lie on the paper (A.5), which since v4.10 draws the sweep: white */
/* to 40% of the window, then easing to #FBFBFB at the foot             */
/* (specs/v4.10/spec.md G).                                             */
/*                                                                      */
/* So a drink not caught has two pen marks at rest and three in all, a  */
/* caught one three and four, and the press's two (v4.9 D.1).           */
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

/**
 * The spec's amount column as it was, the gap after it, and when it stops
 * being a column. Beside the item (v4.9) the column is as wide as its
 * words, at the row's end; an amount wider than the old column's 76 of
 * text still stacks every row, as it always did.
 */
const AMOUNT_COL = 84;
const AMOUNT_GAP = space.sm;
const STACK_ABOVE_SCALE = 1.3;

/**
 * The how-section's figure at its largest, its cap height in pt (v4.9
 * C.5): never scaled with Larger Text. 48 since v4.10, the Dex's sections'
 * cap too: Anton is condensed and tall, and at the 64 build 34's figure
 * took it would be a wall.
 */
const NUMERAL_CAP = 48;
/** Above this text size the lead draws no figure. */
const NUMERAL_TEXT_CAP = 1.3;
/** From the lead's double rule to the figure, or to the head when there is no figure. */
const LEAD_GAP = space.lg;

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
 * The name is the marker (Sedgwick Ave) at 60 through DrinkName: no line
 * limit, and shrunk only when its widest word would not fit the line
 * ("Holunderbeergeist").
 * A header, for the Headings rotor.
 *
 * The plate is solid Campari, the accent, once the drink is in your Dex
 * (v4.4) and an empty plate before (white spec 5.7), beside the tag that
 * says it in words ("In your Dex", "Not in your Dex yet"): the shape, the
 * fill and the word, so no state rests on one cue, the colour least of
 * all. A custom drink has no number (inventing one would say it had
 * joined the Dex), so its plate says whose it is instead. One VoiceOver
 * element.
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
            {/* The drip: the plate honours it only once caught, so a drink not yet in your Dex has none. */}
            <NumberPlate n={drink.dexNumber} tone={inDex ? 'caught' : 'notYet'} size="lg" drip />
            {inDex ? <DexStatusTag /> : <NotYetTag />}
          </>
        )}
      </View>
    </View>
  );
}

/**
 * The record: the name, the plate and the facts, with the pen's margin
 * rule beside them (v4.6). Both pages draw it (drink/[id] and custom/[id]),
 * so a drink you added is ruled as a catalogue entry is.
 *
 * The rule's centreline is at x 12, the middle of the 24 gutter. It starts
 * on the name's first-line cap height: the title block's 24 under the
 * print, then the cap height inside the name's line box, worked out at the
 * size DrinkName actually draws (its own fit for a long word, and its
 * Dynamic Type cap), so a shrunk "Holunderbeergeist" still starts on its
 * caps. It ends on the last fact caption's baseline, its line box's foot
 * short of the record's bottom. PenMargin measures the height between.
 *
 * No facts, no record to rule: the rule is drawn only when FactList is.
 */
export function HeroRecord({ drink, inDex, custom }: { drink: Drink; inDex: boolean; custom?: boolean }) {
  const { width, fontScale } = useWindowDimensions();
  const ruled = factsOf(drink).length > 0;

  const hero = textRole.drinkHero;
  const nameScale = Math.min(fontScale, HERO_NAME_CAP);
  // DrinkName's own fit (components/cabinet), from the same inputs, so the rule meets the caps it draws.
  const fit = nameFit(drink.name, hero, width - layout.gutter * 2, HERO_NAME_CAP, fontScale);
  const top = space.xl + lineMarks('display', hero.fontSize * fit, hero.lineHeight * fit, nameScale).capTop;
  const factScale = Math.min(fontScale, FACT_CAP);
  const bottom = lineMarks('text', textRole.small.fontSize, textRole.small.lineHeight, factScale).foot;

  return (
    <View style={styles.record}>
      <HeroTitle drink={drink} inDex={inDex} custom={custom} />
      <FactList drink={drink} />
      {ruled ? (
        <PenMargin kind="margin" style={{ position: 'absolute', left: layout.gutter / 2 - PEN.vrule.mid, top, bottom }} />
      ) : null}
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
 *
 * The pen's column rule (v4.6) stands in the middle of the gap between
 * the two columns, from the first value's cap height to the last
 * caption's baseline, as a ledger's column rule runs its table (with
 * three facts it still runs to the last row). Only when there ARE two
 * columns: a single column has none, and the rule never invents one.
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
      widestRun(f.value, 'text', textRole.bodyStrong.fontSize * scale) <= half &&
      widestRun(f.caption, 'text', textRole.small.fontSize * scale) <= half,
  );
  const cell = fitsHalf ? half : inner;
  const columns = fitsHalf && facts.length >= 2;

  return (
    <View accessible accessibilityLabel={facts.map(spokenFact).join('. ')} style={styles.facts}>
      {columns ? (
        <PenMargin
          kind="column"
          style={{
            position: 'absolute',
            left: half + space.xl / 2 - PEN.vrule.mid,
            top: lineMarks('text', textRole.bodyStrong.fontSize, textRole.bodyStrong.lineHeight, scale).capTop,
            bottom: lineMarks('text', textRole.small.fontSize, textRole.small.lineHeight, scale).foot,
          }}
        />
      ) : null}
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
 * A section of the page: its head in the poster (`sub`, Anton 16/26 in
 * capitals by transform, v4.10 T.7; a header for the rotor, spoken as it
 * is written), an optional quiet aside on the same line ("Stirred · 3
 * ingredients"), then its content. Set apart from the one above by space
 * alone.
 *
 * The aside sits on the head's baseline: the row aligns tops and drops
 * the aside by the difference between the poster's baseline and
 * Archivo's small line's (lineMarks), both at the reader's text size, as
 * neither caps. When the head wraps, the aside goes under it.
 *
 * `lead` is drawn over the head, after the section's 32 of air (v4.9):
 * the first how-section's HowLead, and nothing on any other section.
 */
function Section({
  title,
  aside,
  lead,
  style,
  children,
}: {
  title: string;
  aside?: string;
  lead?: React.ReactNode;
  style?: ViewStyle;
  children: React.ReactNode;
}) {
  const { fontScale } = useWindowDimensions();
  const head = lineMarks('sub', textRole.sub.fontSize, textRole.sub.lineHeight, fontScale);
  const quiet = lineMarks('text', textRole.small.fontSize, textRole.small.lineHeight, fontScale);
  return (
    <View style={[styles.section, style]}>
      {lead}
      <View style={styles.sectionHead}>
        <Text accessibilityRole="header" accessibilityLabel={title} style={[textRole.sub, styles.ink]}>
          {title}
        </Text>
        {aside ? (
          <Text style={[textRole.small, styles.muted, { marginTop: Math.max(0, head.baseline - quiet.baseline) }]}>
            {aside}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/**
 * The first how-section's lead (v4.9 C.5): the pen's double rule across
 * the column, 16, then, for a catalogue drink up to 1.3x text, its figure
 * in the press's outline ("Nº 0100", the plate's spelling) at cap 48, or
 * smaller where the column is narrower than the figure (at 48 Anton's
 * condensed figures fit every phone's column, so the fit is a guard),
 * and the section's own 12 to the head. `number` null (a
 * custom drink, which has none) is the rule alone, 16 over the head.
 *
 * Both marks are hidden and measure nothing: the figure's width is its
 * advances, and the rule's the column's. The figure never says whether
 * the drink is caught; the plate above does, in words.
 */
function HowLead({ number }: { number: number | null }) {
  const { width, fontScale } = useWindowDimensions();
  const measure = width - layout.gutter * 2;
  const figure = number !== null && fontScale <= NUMERAL_TEXT_CAP ? formatPlateNumber(number) : null;
  // The cap that fits the column, floored to a whole point, so the set never runs past the gutter.
  const cap = figure ? Math.min(NUMERAL_CAP, Math.floor(measure / numeralWidth(figure, 1))) : 0;
  return (
    <View style={figure ? undefined : styles.leadBare}>
      <PenDoubleRule length={measure} seed={PEN_SEED.spec} />
      {figure ? <PressNumeral text={figure} cap={cap} style={styles.leadFigure} /> : null}
    </View>
  );
}

/** The section's lead for `number`: none when it is not passed (every how-section but the page's first). */
const leadFor = (number: number | null | undefined) => (number === undefined ? undefined : <HowLead number={number} />);

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
 * One ingredient, as a menu sets it (v4.9 C.5, O-1): the item with any
 * note after it ("Soda water · to top"), the press's dotted leader, then
 * the amount in tabular 600 over its metric, right-aligned at the row's
 * end. The row aligns on first baselines, so the leader (a childless
 * View, whose baseline is its foot) sits on the item's first line, level
 * with the amount's figures. The item counts its lines (onTextLayout,
 * one extra render, on a page and never in a cell): the dots show only
 * beside an item on one line with an amount to lead to. The leader's
 * View is laid out either way, so dropping its dots can never unwrap the
 * item and loop. Spoken in the order it reads: item, amount, metric,
 * note.
 *
 * `stacked` puts the amount above the item in one column, for every row
 * at once, exactly as the spec was set before v4.9 (and spoken amount
 * first, as it then reads): past 1.3x text an item, a leader and an
 * amount no longer share a phone's line, and an amount whose longest word
 * is wider than the old column ("1 barspoon", "2–3 cherries") would
 * squeeze the item to a word a line.
 */
function IngredientRow({ ing, stacked }: { ing: RecipeIngredient; stacked: boolean }) {
  const { amount, metric, note } = splitAmount(ing.amount);
  const hasAmount = Boolean(amount || metric);
  // The item's lines, from its own layout: one until it has drawn, as nearly every item is.
  const [lines, setLines] = useState(1);
  const figures = hasAmount ? (
    <>
      {amount ? <Text style={[textRole.specAmount, styles.ink]}>{amount}</Text> : null}
      {metric ? <Text style={[textRole.small, styles.muted, tabular]}>{metric}</Text> : null}
    </>
  ) : null;
  const noteText = note ? <Text style={[textRole.small, styles.muted]}>{` · ${note}`}</Text> : null;

  if (stacked) {
    return (
      <View
        accessible
        accessibilityLabel={[amount, metric, ing.item, note].filter(Boolean).join(', ')}
        style={[styles.ingRow, styles.ingRowStacked]}>
        {figures ? <View>{figures}</View> : null}
        <Text style={[textRole.body, styles.ink]}>
          {ing.item}
          {noteText}
        </Text>
      </View>
    );
  }
  return (
    <View
      accessible
      accessibilityLabel={[ing.item, amount, metric, note].filter(Boolean).join(', ')}
      style={styles.ingRow}>
      <Text
        onTextLayout={(e) => {
          const n = e.nativeEvent.lines.length;
          if (n !== lines) setLines(n);
        }}
        style={[textRole.body, styles.ink, styles.ingItem]}>
        {ing.item}
        {noteText}
      </Text>
      <PressLeader dots={hasAmount && lines === 1} />
      {figures ? <View style={styles.amountCol}>{figures}</View> : null}
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
 *
 * `number`, on the page's first how-section only, draws the lead over
 * the head (HowLead, v4.9): the drink's Dex number, or null for a drink
 * someone added (the rule without a figure). Left out, no lead.
 */
export function SpecSection({ recipe, number }: { recipe: Recipe; number?: number | null }) {
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
        widestRun(s.amount, 'text', textRole.specAmount.fontSize * fontScale) > amountText ||
        widestRun(s.metric ?? '', 'text', textRole.small.fontSize * fontScale) > amountText
      );
    });

  return (
    <Section title="The spec" aside={aside} lead={leadFor(number)}>
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
 * The serve guide's rows that say something, and the glass only when it
 * says more than the facts do (ServeSection, below). Empty when the
 * section would draw nothing, so a page can tell whether it is the first
 * how-section drawn, the one the lead goes on.
 */
export function serveRows(
  serve: ServeGuide,
  drink?: Pick<Drink, 'category' | 'glassware' | 'subcategory'>,
): { label: string; detail: string }[] {
  const shown = drink ? glassPhrase(drink) : '';
  const glass = shown && glassKey(serve.glass) === glassKey(shown) ? '' : serve.glass;
  return [
    { label: 'Temperature', detail: serve.temp },
    { label: 'Glass', detail: glass },
    { label: 'How to serve it', detail: serve.how },
    { label: 'Pairs with', detail: (serve.pair ?? []).filter(Boolean).join(', ') },
  ].filter((r) => r.detail && r.detail.trim());
}

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
 *
 * `number` draws the lead, as SpecSection's does, when this is the page's
 * first how-section: a spirit's.
 */
export function ServeSection({
  serve,
  drink,
  number,
}: {
  serve: ServeGuide;
  drink?: Pick<Drink, 'category' | 'glassware' | 'subcategory'>;
  number?: number | null;
}) {
  const rows = serveRows(serve, drink);
  if (rows.length === 0) return null;
  return (
    <Section title="Serving" lead={leadFor(number)}>
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
 *
 * `number` draws the lead when no serve guide came before it (HowLead).
 */
export function CompositionSection({
  composition,
  number,
}: {
  composition: Composition;
  number?: number | null;
}) {
  const parts = composition.components.filter((c) => c.detail.trim());
  const summary = composition.summary.trim();
  const process = composition.process.trim();
  if (parts.length === 0 && !summary && !process) return null;
  return (
    <Section title="What's in it" lead={leadFor(number)}>
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
/* Friends who logged it                                                */
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
    <Section title="Friends who logged it">
      {shown.map(({ post, person }) => (
        <Pressable
          key={person.id}
          onPress={() => onOpenPost(post.id)}
          accessibilityRole="button"
          accessibilityLabel={`${person.username} logged it`}
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

const BAR_CAP = 1.3;
/** Between the split bar's two keys: the post sheet's pair keeps the same 12. */
const BAR_GAP = space.md;
/**
 * A key's label inset, each side: ui.tsx's styles.button pads 20 inside a
 * 1pt edge. specs/v4.11/shop.test.mjs fails if the two part.
 */
const KEY_INSET = 20 + stroke.edge;

/** The label's room on one line in each of the split bar's two keys, in points, at this window width. */
function splitKeyRoom(windowWidth: number): number {
  return (windowWidth - 2 * layout.gutter - BAR_GAP) / 2 - 2 * KEY_INSET;
}

/**
 * The page's one action, pinned to the foot on the page's white: "Post
 * this drink" until it is in your Dex, then "Post <name> again" ("Post it
 * again" for a name too long to sit in a key: lib/shopCore's
 * postKeyLabel). The post key: the accent fill with a white label (v4.4,
 * one of its five places; the + window's Post and the post sheet's "Save
 * & post" are the other keys in it). Spoken "Post <name>" / "Post <name>
 * again", the full name either way. Never "Post another <name>", which
 * reads as having another (App Review 1.4.3).
 *
 * `postable={false}` keeps it ink: a drink someone added (custom/[id])
 * opens the + window, which can only save such a drink to the Dex, and
 * the accent says post. A red key whose window posts nothing would be a
 * sixth place, and a wrong one.
 *
 * BUY A BOTTLE (v4.11, specs/v4.11/shop.md). With `onBuy` (a spirit's
 * page, the shop on: lib/shop's offersBottle) the bar holds two keys
 * side by side, half and half with the post sheet's 12 between them, as
 * Jan drew it: the post key on the left, the same key doing the same
 * thing, and "Buy a bottle" on the right. Buy is the wash key,
 * `secondary`, ink on the wash, so the bar keeps one hue: red still means
 * post, and only post (check-design rule 17). Neither key carries a mark
 * in the split: at half of a 393pt phone the post key's plus would push
 * "Post this drink" onto a second line, and the words matter more than
 * the glyph.
 * The post key's label is costed against its half (postKeyLabel), so
 * "Post <name> again" falls back to "Post it again" sooner. `buying` is
 * the checkout starting: Button's loading, a spinner over Buy's label at
 * its own size, and no second tap. The post key is held meanwhile, and
 * shown held: disabled, so it dims and VoiceOver says so, rather than a
 * live-looking key whose taps go nowhere (one sheet at a time, and
 * Stripe's is about to rise). Without `onBuy` the bar is the one
 * full-width key it always was.
 *
 * The 1pt rule over it shows only while the page has more under the bar
 * (`ruled`, the route's scroll signal), as a top bar's rule does: at the
 * page's end nothing is under it, and a rule there would be a divider.
 *
 * The label caps at 1.3 and may wrap to two lines; the bar grows with it.
 * Split, the two keys stand in one row and take the taller one's height,
 * so `onHeight` (the bar's own measure) still reports the taller of the
 * two. The route pads its content by it, and nothing at the foot hides
 * under a bar that grew.
 *
 * The bar lies on the paper (v4.9 A.5), its first child, as the page
 * under it does, so the bar reads as the page and not as a panel: since
 * v4.10 the sweep (specs/v4.10/spec.md G), and the bar's slice of it is
 * the page's own at the same window height, so the two meet with no
 * step. The key keeps its own fill, and its label is Archivo 600 like
 * every key's ("Post Piña Colada again" in plain bold, never the marker).
 */
export function PinnedPostBar({
  name,
  collected,
  ruled,
  postable = true,
  onPress,
  onHeight,
  onBuy,
  buying = false,
}: {
  name: string;
  collected: boolean;
  ruled: boolean;
  /** False where the key's window cannot post (a drink someone added): the key stays ink. */
  postable?: boolean;
  onPress: () => void;
  onHeight?: (height: number) => void;
  /** A spirit's page with the shop on: splits the bar and adds "Buy a bottle". */
  onBuy?: () => void;
  /** The checkout is starting: Buy spins and takes no second tap, and the post key is held. */
  buying?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const split = onBuy != null;
  // Costed at the size the label is drawn: Dynamic Type, up to the bar's cap.
  const size = textRole.button.fontSize * Math.min(fontScale, BAR_CAP);
  const label = postKeyLabel(
    name,
    collected,
    split ? { room: splitKeyRoom(width), width: (text) => textWidth(text, 'text600', size) } : null,
  );
  const spoken = collected ? `Post ${name} again` : `Post ${name}`;
  return (
    <View
      onLayout={(e) => onHeight?.(Math.ceil(e.nativeEvent.layout.height))}
      style={[styles.bar, ruled && styles.barRuled, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
      {/* Up over the top border's band: inside it, the paper would stop 1pt short of the page's above. */}
      <View pointerEvents="none" style={styles.barPaper}>
        <Paper />
      </View>
      {split ? (
        <View style={styles.barKeys}>
          <Button
            label={label}
            variant={postable ? 'post' : 'primary'}
            onPress={onPress}
            disabled={buying}
            accessibilityLabel={spoken}
            maxFontSizeMultiplier={BAR_CAP}
            style={styles.barKey}
          />
          <Button
            label={BUY_LABEL}
            variant="secondary"
            onPress={onBuy}
            loading={buying}
            accessibilityLabel={buyLabelFor(name)}
            maxFontSizeMultiplier={BAR_CAP}
            style={styles.barKey}
          />
        </View>
      ) : (
        <Button
          label={label}
          variant={postable ? 'post' : 'primary'}
          icon="plus"
          block
          onPress={onPress}
          accessibilityLabel={spoken}
          maxFontSizeMultiplier={BAR_CAP}
        />
      )}
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

  /* The record: full width, the frame the margin rule is placed in. */
  record: { position: 'relative' },

  /* The facts, two to a row */
  facts: {
    marginTop: space.xl,
    marginHorizontal: layout.gutter,
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: space.xl,
    rowGap: space.lg,
  },

  /* The lead (v4.9): the double rule, 16, the figure, the section's 12 to the head; with no figure, 16 to it. */
  leadFigure: { marginTop: LEAD_GAP },
  leadBare: { marginBottom: LEAD_GAP - space.md },

  /* Sections: 32 of air above each, the head 12 over its content. */
  section: { marginTop: layout.section, paddingHorizontal: layout.gutter, gap: space.md },
  /* Tops aligned, never centred or baseline-flexed: the aside drops onto the poster's baseline (Section). */
  sectionHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
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

  /* Ingredients: item ··· amount on the first baseline (the leader sets its own flex, 16 wide at least). */
  ingRow: { flexDirection: 'row', alignItems: 'baseline' },
  ingRowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 2 },
  /* The item gives way first, wrapping before the amount or the leader's 16 would. */
  ingItem: { flexShrink: 1 },
  /* As wide as its words, at the row's end; the metric right-aligned under the amount. */
  amountCol: { alignItems: 'flex-end' },

  /* Steps */
  stepRow: { flexDirection: 'row', alignItems: 'flex-start' },
  stepNum: { width: 28 },
  stepText: { flex: 1 },

  /* Friends who logged it */
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
  /* The split bar (v4.11): two keys, half and half, the taller one's height. */
  barKeys: { flexDirection: 'row', gap: BAR_GAP },
  barKey: { flex: 1 },
  /* The paper's box: the bar's, up to the outer edge of its top border (v4.9 A.5). */
  barPaper: { position: 'absolute', top: -stroke.edge, left: 0, right: 0, bottom: 0 },
});
