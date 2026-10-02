import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icons';
import { Button, Card, Divider, SectionHeader, Tag } from '@/components/ui';
import {
  colors,
  dexNumber,
  fonts,
  radius,
  space,
  stroke,
  tabular,
  textRole,
  type as typeScale,
} from '@/constants/theme';
import type { Composition, Recipe, ServeGuide, UnlockRecord } from '@/types';

/* ==================================================================== */
/* The drink page's panels                                              */
/*                                                                      */
/* Moved out of drink/[id].tsx so a drink someone added themselves      */
/* (custom/[id].tsx) is drawn by the same code as a catalogue entry:    */
/* the same recipe card, the same composition rows, the same serve      */
/* tiles, the same title block. Two copies would drift, and the person  */
/* comparing their entry with the one under it in the Dex would see two */
/* different apps.                                                      */
/*                                                                      */
/* Every panel copes with blanks, because a custom drink has them where */
/* a catalogue entry never does (no composition summary, steps that are */
/* optional, a serve guide with only a temperature). A blank part is    */
/* left out rather than drawn empty.                                    */
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
 * — "veladora", "room temp, never chilled", "shaken" — and the drink page
 * sets each one as a value on its own, where lowercase reads as a typo
 * beside a capitalised ABV and origin. Done here, at render, because these
 * panels are the only place those values are shown and drinks.json is
 * generated, never edited by hand.
 */
export function sentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ==================================================================== */
/* Title block                                                          */
/* ==================================================================== */

/**
 * The words under the photograph: a line above the name, the name, and
 * the facts.
 *
 * Title UNDER the photograph, not above it. The name above a framed
 * picture is a caption layout — it makes the photo an illustration of the
 * heading. Under it, the photo is the subject and the name identifies it,
 * which is how Vivino, and every wine label, orders the same two elements.
 *
 * The line above is sentence case in plain Inter. It was a letterspaced
 * caps label, the habit that most made the app look machine-designed; a
 * catalogue number keeps its tracking because it is a code made of
 * figures (DexNumber), not a word. The name is Playfair: a drink's name
 * is the brand's voice, and the one place the display face stays.
 *
 * No entrance animation on any of it. Content must never depend on an
 * animation finishing to be visible: Reanimated can stall after a cold
 * start in Release builds and leave it at opacity 0 (specs/06-tab-switch-
 * bug.md, cause 1).
 */
export function DrinkTitle({
  eyebrow,
  name,
  facts,
}: {
  eyebrow: React.ReactNode;
  name: string;
  facts: string[];
}) {
  return (
    <View style={styles.titleBlock}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.name} accessibilityRole="header">
        {name}
      </Text>
      {facts.length > 0 ? <FactsLine facts={facts} /> : null}
    </View>
  );
}

/**
 * A catalogue number inside the eyebrow: wine, tabular, and tracked like
 * the Dex card's, because it is read as a code.
 */
export function DexNumber({ children }: { children: string }) {
  return <Text style={styles.dexNumber}>{children}</Text>;
}

/** The tags under the title: category, and rarity where there is one. */
export function MetaRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.metaRow}>{children}</View>;
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
export function FactsLine({ facts }: { facts: string[] }) {
  return (
    <Text style={styles.facts}>
      {facts.map((f, i) => (
        // By position: two facts can read the same ("Mexico" as origin and
        // as glass is unlikely, but a key must not depend on it).
        <Text key={`${i}-${f}`}>
          {i > 0 ? <Text style={styles.factsDot}>{'   ·   '}</Text> : null}
          {f}
        </Text>
      ))}
    </Text>
  );
}

/* ==================================================================== */
/* Your pour, and the invitation to log one                             */
/* ==================================================================== */

/**
 * When you logged it, and what you said.
 *
 * The photograph is not repeated here. The hero at the top of the screen
 * already IS your photo once you have logged one, so a framed copy here
 * showed the same picture twice, one screen apart.
 */
export function YourPour({ record }: { record: UnlockRecord }) {
  return (
    <>
      <SectionHeader title="Your pour" style={styles.section} />
      <Text style={styles.logMeta}>Logged {formatLogDate(record.date)}</Text>
      {record.note ? <Text style={styles.quote}>“{record.note}”</Text> : null}
    </>
  );
}

/**
 * Not logged yet: an invitation, sitting above the how-to.
 *
 * The lock is drawn bare, in muted ink. It sat in a wine disc, which made
 * the card's quietest element the loudest wine thing on the page, above
 * the one wine button that actually does something.
 */
export function NotLoggedCard({
  title,
  body,
  onLog,
  accessibilityLabel,
}: {
  title: string;
  body: string;
  onLog: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Card style={styles.lockedCard}>
      <Icon name="lock" size={28} color={colors.textMuted} />
      <Text style={styles.lockedTitle}>{title}</Text>
      <Text style={styles.lockedBody}>{body}</Text>
      <Button
        label="Log this drink"
        icon="camera"
        block
        onPress={onLog}
        accessibilityLabel={accessibilityLabel}
        style={styles.lockedCta}
      />
    </Card>
  );
}

/* ==================================================================== */
/* Reading                                                              */
/* ==================================================================== */

/** The notes as tags. Nothing at all when there are none: a heading over nothing is a broken page. */
export function TastingNotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <>
      <SectionHeader title="Tasting notes" style={styles.section} />
      <View style={styles.tagRow}>
        {notes.map((n, i) => (
          <Tag key={`${i}-${n}`} label={n} />
        ))}
      </View>
    </>
  );
}

/** The description, and the trivia when there is any. */
export function FieldNotes({ description, funFact }: { description: string; funFact: string }) {
  return (
    <>
      {description ? (
        <>
          <SectionHeader title="Field notes" style={styles.section} />
          <Text style={styles.bodyText}>{description}</Text>
        </>
      ) : null}
      {funFact ? (
        <>
          <SectionHeader title="Bar trivia" style={styles.section} />
          <Text style={styles.bodyText}>{funFact}</Text>
        </>
      ) : null}
    </>
  );
}

/* ==================================================================== */
/* Panels                                                               */
/* ==================================================================== */

/**
 * Two-up fact tile. Used by ServePanel for Temp/Glass.
 *
 * No line cap. The longest serving temperatures run to three lines at
 * this width ("Well chilled (38-45°F), served over plenty of ice"), and
 * an ellipsis there clipped the one thing the tile is for — the failure
 * the FactsLine note above gives as its reason for dropping cards. The
 * row stretches both tiles to the taller one, so the pair stays even.
 */
export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
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
 * The step numbers are bare figures in a narrow column. They sat in tinted
 * discs, one of the nine icon-in-a-circle shapes the app was built from,
 * and a number does not need a container to be read as a number.
 *
 * Method and garnish sit in a label-and-detail card of their own, the row
 * CompositionPanel uses for a spirit's make-up. They were pill chips, which
 * are for tags — and a garnish is a sentence ("Celery stalk and lime wedge
 * on a celery-salt rim") that wrapped a pill into a two-line capsule. They
 * are a card of their own rather than more rows in the ingredient card,
 * whose rows are item-and-amount; two row shapes in one card would read as
 * one list that changed its mind halfway.
 *
 * A drink someone added may have no steps and no amounts (both are
 * optional on the form): the steps block is left out, and a missing amount
 * leaves its column empty rather than inventing one.
 */
export function RecipePanel({ recipe }: { recipe: Recipe }) {
  const details = [
    { label: 'Method', detail: recipe.method },
    { label: 'Garnish', detail: recipe.garnish },
  ].filter((d): d is { label: string; detail: string } => Boolean(d.detail));

  return (
    <>
      <SectionHeader title="How it's made" style={styles.section} />

      {recipe.ingredients.length > 0 ? (
        <Card style={styles.listCard}>
          {recipe.ingredients.map((ing, i) => (
            <View key={`${i}-${ing.item}`}>
              {i > 0 ? <Divider /> : null}
              <View style={styles.ingredientRow}>
                <Text style={styles.ingredientItem}>{ing.item}</Text>
                {ing.amount ? <Text style={styles.ingredientAmount}>{ing.amount}</Text> : null}
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      {recipe.steps.length > 0 ? (
        <View style={styles.steps}>
          {recipe.steps.map((step, i) => (
            <View key={`step-${i}`} style={styles.stepRow}>
              <Text style={styles.stepNum}>{i + 1}</Text>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      ) : null}

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
 *
 * The summary is skipped when empty: a drink someone added has none (it is
 * editorial, written by Sipply when the drink joins the Dex).
 */
export function CompositionPanel({ composition }: { composition: Composition }) {
  return (
    <>
      <SectionHeader title="What's in it" style={styles.section} />

      {composition.summary ? <Text style={styles.lead}>{composition.summary}</Text> : null}

      {composition.components.length > 0 ? (
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
      ) : null}

      {composition.process ? (
        <Text style={[styles.bodyText, styles.process]}>{composition.process}</Text>
      ) : null}
    </>
  );
}

/**
 * How to serve it at home — complements, never replaces, the composition.
 *
 * Each part is drawn only when it has something in it, since a drink
 * someone added may know its temperature and nothing else.
 */
export function ServePanel({ serve }: { serve: ServeGuide }) {
  const tiles = [
    { label: 'Temp', value: serve.temp },
    { label: 'Glass', value: serve.glass },
  ].filter((t) => Boolean(t.value));

  return (
    <>
      <SectionHeader title="Serve it right" style={styles.section} />

      {tiles.length > 0 ? (
        <View style={styles.statRow}>
          {tiles.map((t) => (
            <StatCard key={t.label} label={t.label} value={sentence(t.value)} />
          ))}
        </View>
      ) : null}

      {serve.how ? (
        <View style={styles.serveCard}>
          <Text style={styles.bodyText}>{serve.how}</Text>
        </View>
      ) : null}

      {serve.pair && serve.pair.length > 0 ? (
        <View style={styles.pairWrap}>
          <Text style={styles.miniLabel}>Pairs with</Text>
          <View style={styles.tagRow}>
            {serve.pair.map((p, i) => (
              <Tag key={`${i}-${p}`} label={p} />
            ))}
          </View>
        </View>
      ) : null}
    </>
  );
}

/** Spacing a screen gives the first block under a panel: the drink page's section rhythm. */
export const PANEL_SECTION: ViewStyle = { marginTop: space.xxl, marginBottom: space.md };

/* ==================================================================== */
/* Styles                                                               */
/* ==================================================================== */

/*
 * The small labels inside the panels (Temp, Glass, Base, Pairs with): 11pt
 * Medium in taupe ink, with no tracking. They were letterspaced, and v2
 * tracks nothing but figures.
 */
const smallLabel = {
  fontFamily: fonts.bodyMedium,
  fontSize: typeScale.tag.fontSize,
  lineHeight: typeScale.tag.lineHeight,
  color: colors.taupeInk,
} as const;

const styles = StyleSheet.create({
  /* Title block */
  titleBlock: { marginBottom: space.lg },
  eyebrow: {
    fontFamily: fonts.bodyMedium,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    marginBottom: space.xs,
  },
  dexNumber: {
    /*
     * Wine, not gilt. Gilt means legendary and nothing else now, and a
     * catalogue number printed in the legendary metal on every entry was
     * spending the one colour the rarity ladder tops out at. Tracked as the
     * Dex card tracks it: figures, so it is a code and not a word.
     */
    letterSpacing: dexNumber.letterSpacing,
    color: colors.wine,
    ...tabular,
  },
  name: {
    /* Drink names are the handoff's Playfair 700 at 28. */
    fontFamily: fonts.displayBold,
    fontSize: typeScale.headline.fontSize,
    lineHeight: typeScale.headline.lineHeight,
    color: colors.text,
    marginBottom: space.lg,
  },
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
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },

  /* Sections */
  section: PANEL_SECTION,
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
  process: { marginTop: space.lg },
  miniLabel: smallLabel,
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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

  /* Not logged */
  lockedCard: {
    alignItems: 'center',
    padding: space.xl,
    marginTop: space.xl,
  },
  lockedTitle: {
    /* Inter, as every state title is; Playfair is kept for drink names. */
    ...textRole.emptyTitle,
    color: colors.text,
    textAlign: 'center',
    marginTop: space.md,
    marginBottom: space.sm,
  },
  lockedBody: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.textMuted,
    textAlign: 'center',
  },
  lockedCta: { marginTop: space.xl },

  /* Serve */
  statRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  /* Two of these side by side read fine; three of them, one of which
     clipped its value, did not. A panel: the card corner and a drawn edge. */
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: stroke.edge,
    borderColor: colors.line,
    borderRadius: radius.card,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    gap: space.xs,
  },
  statLabel: smallLabel,
  statValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.text,
  },
  serveCard: {
    backgroundColor: colors.surface,
    borderWidth: stroke.edge,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: space.lg,
    marginTop: space.md,
  },
  pairWrap: {
    marginTop: space.lg,
    gap: space.sm,
  },

  /* Recipe + composition rows */
  listCard: { paddingHorizontal: space.lg },
  /* Method and garnish, under the steps. */
  detailCard: { marginTop: space.lg },
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
    /* A bare figure in a 20pt column, on the step text's first line. */
    width: 20,
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.bodySm.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.textMuted,
    ...tabular,
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
  componentLabel: smallLabel,
  componentDetail: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.text,
  },
});
