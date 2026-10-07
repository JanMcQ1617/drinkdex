import React, { createContext, useContext, useId } from 'react';
import {
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Grain } from '@/components/Grain';
import { Icon } from '@/components/icons';
import { colors, dexNumber, elevation, radius, space, stroke, textRole } from '@/constants/theme';
import { formatCount, formatDexNumber } from '@/data';
import { faceOf, fitScale, textWidth } from '@/lib/textFit';
import type { Rarity } from '@/types';

/* ==================================================================== */
/* The cabinet                                                          */
/*                                                                      */
/* The frames v3 is built from (specs/v3-cabinet.md, sections 2, 5 and  */
/* 7.2). Sipply is a collector's cabinet in two materials: the LINING,  */
/* wine grained like baize, is the inside of the cabinet, and a drink   */
/* you have caught is a MOUNT, bone card stock seated in the lining     */
/* with a contact shadow. A drink you have not caught is a SLOT, a      */
/* recess pressed into the lining. Collecting moves a drink from one    */
/* material to the other, which is why the two states differ by         */
/* material and not by a tint.                                          */
/*                                                                      */
/* Frames only. Nothing here loads an image: a caller puts the face     */
/* (DexCard.tsx's DrinkFace, a signed photo) inside a MountWindow or a  */
/* LoosePrint, so this file decides no decode size and holds no memory. */
/*                                                                      */
/* Everything is static: Views, drawn edges, `elevation` tokens and SVG */
/* gradients. Nothing animates, so nothing can stall half drawn.        */
/* ==================================================================== */

/**
 * An SVG gradient id that is unique to this instance. Web shares one id
 * namespace across every <Svg> on the page, so two bands with the same id
 * would paint each other's gradient; React's ids carry punctuation that
 * does not survive `url(#…)`, hence the strip.
 */
export function useSvgId(prefix: string): string {
  return prefix + useId().replace(/[^A-Za-z0-9]/g, '');
}

/**
 * A colour token as an SVG gradient stop: `rgba(14, 11, 11, 0.62)` becomes
 * `rgb(14, 11, 11)` at stopOpacity 0.62 (times `opacity`).
 *
 * Every <Stop> with a translucent token must go through this.
 * react-native-svg's native gradients throw away the alpha of an rgba (or
 * 8-digit hex) stopColor and take stopOpacity alone, which defaults to 1:
 * handed straight in, a 0.62 scrim paints solid black on iOS and a clear
 * stop paints opaque. The web passes the string to the browser and draws
 * it right, so a web render never shows the difference.
 */
export function svgStop(color: string, opacity = 1): { stopColor: string; stopOpacity: number } {
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(color);
  if (rgba) {
    const alpha = rgba[4] == null ? 1 : Number(rgba[4]);
    return { stopColor: `rgb(${rgba[1]}, ${rgba[2]}, ${rgba[3]})`, stopOpacity: alpha * opacity };
  }
  const hex8 = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(color);
  if (hex8) return { stopColor: `#${hex8[1]}`, stopOpacity: (parseInt(hex8[2]!, 16) / 255) * opacity };
  if (color === 'transparent') return { stopColor: 'rgb(0, 0, 0)', stopOpacity: 0 };
  return { stopColor: color, stopOpacity: opacity };
}

/**
 * A vertical fade from `from` (top) to `to` (bottom) that fills the box
 * `style` gives it: the shade under a band, a photo's scrims and dissolves.
 * Light doing something physical, never a mood field behind text.
 * `toOpacity` fades the bottom stop out (0: clear), so a translucent token
 * can fade to nothing without a second "clear" token. Both stops go through
 * svgStop, so translucent tokens keep their alpha on iOS. Decorative and
 * untouchable.
 */
export function VerticalFade({
  from,
  to,
  toOpacity = 1,
  style,
}: {
  from: string;
  to: string;
  toOpacity?: number;
  style: StyleProp<ViewStyle>;
}) {
  const id = useSvgId('fade');
  /*
   * The box is a View and the Svg fills it at 100% x 100%. An Svg placed
   * by absolute insets alone sizes itself on iOS, but an <svg> on the web
   * is a replaced element that keeps its 300px default width there.
   */
  return (
    <View pointerEvents="none" style={style}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" {...svgStop(from)} />
            <Stop offset="1" {...svgStop(to, toOpacity)} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/* ==================================================================== */
/* LiningBand                                                           */
/* ==================================================================== */

/** The shade under a band that meets paper: 12pt, `shade` fading to clear. */
const SHADE = 12;

/**
 * A stretch of the cabinet's lining: the wine fill with its grain under
 * the children.
 *
 * `radius={0}` (default) is a full-bleed band; `radius={12}` an inset
 * panel (the Settings member card, Stats' collection panel), which draws a
 * 1pt `liningLine` edge and clips its children to its corners.
 *
 * `lip` is where a full-bleed band meets paper below it: a 1pt `liningLip`
 * along the band's foot, and under it a 12pt shade (`shade` to clear), the
 * band's thickness rather than a drop shadow. Two placements, because a
 * list cell cannot paint over the next cell: `shade="overlay"` hangs the
 * shade absolutely over whatever follows, which only works for a list
 * HEADER lifted with `ListHeaderComponentStyle={{ zIndex: 1 }}` (Home's
 * head band); `shade="inFlow"` (default) makes the band's own last 12pt a
 * paper strip, with paper grain, that carries the shade. A panel ignores
 * `lip`: it is framed by its edge, and a shade under a floating panel would
 * be a drop shadow.
 *
 * `style` styles the lining itself (padding, height), not the paper strip.
 */
export function LiningBand({
  children,
  lip,
  shade = 'inFlow',
  radius: r = 0,
  style,
}: {
  children: React.ReactNode;
  /** 1pt liningLip + 12pt shade below. Full-bleed bands only. */
  lip?: boolean;
  /** Default 'inFlow'; 'overlay' only for a lifted list header (Home). */
  shade?: 'overlay' | 'inFlow';
  /** 0 a full-bleed band, 12 an inset panel (1pt liningLine edge, overflow hidden). */
  radius?: 0 | 12;
  style?: StyleProp<ViewStyle>;
}) {
  if (r === 12) {
    return (
      <View style={[styles.panel, style]}>
        <Grain tone="lining" />
        {children}
      </View>
    );
  }

  const band = (
    <View style={[styles.band, style]}>
      <Grain tone="lining" />
      {children}
      {lip ? <View pointerEvents="none" style={styles.lip} /> : null}
      {lip && shade === 'overlay' ? (
        <VerticalFade from={colors.shade} to={colors.shade} toOpacity={0} style={styles.shadeOverlay} />
      ) : null}
    </View>
  );

  if (!lip || shade === 'overlay') return band;

  return (
    <View>
      {band}
      <View pointerEvents="none" style={styles.shadeStrip}>
        <Grain />
        <VerticalFade from={colors.shade} to={colors.shade} toOpacity={0} style={StyleSheet.absoluteFill} />
      </View>
    </View>
  );
}

/* ==================================================================== */
/* DrinkName                                                            */
/* ==================================================================== */

/**
 * A drink's name, and the ONLY way one is drawn (specs/v3-cabinet.md 6.4).
 *
 * Names never truncate: no `numberOfLines`, no `adjustsFontSizeToFit`. They
 * wrap at word boundaries and their containers grow. What a line limit
 * used to hide is a word wider than its column, which iOS would break
 * mid-word ("Holunderbeergei / st"), so the role is shrunk, never below
 * 11pt, until the name's widest unbreakable run fits `measure`. Short
 * names are untouched; a name with a long word shrinks only as far as it
 * must.
 *
 * The size is worked out, not measured (lib/textFit.ts): at this Dynamic
 * Type size the role would draw at `role.fontSize × min(fontScale, cap)`,
 * the fit scale is taken against that, and the Text is given the scaled
 * role with `maxFontSizeMultiplier={cap}`, so iOS's own multiplier lands
 * it on the fitted size. Pure layout: no state and no onLayout, so the
 * first frame is the final one.
 *
 * `measure` is the column's width in points, which every call site knows
 * from the window width (the table in 6.4). `role` is one of theme.ts's
 * name roles (a locked Dex card passes its Inter Medium 15/20 instead).
 */
export function DrinkName({
  name,
  role,
  measure,
  cap,
  color,
  align = 'left',
  accessibilityRole,
  style,
}: {
  name: string;
  role: TextStyle;
  measure: number;
  /** maxFontSizeMultiplier (specs/v3-cabinet.md 6.5). */
  cap: number;
  color: string;
  align?: 'left' | 'center';
  accessibilityRole?: 'header' | 'text';
  /** Placement and shadows. Size and line height are DrinkName's. */
  style?: StyleProp<TextStyle>;
}) {
  const { fontScale } = useWindowDimensions();
  const fontSize = role.fontSize ?? textRole.rowName.fontSize;
  const lineHeight = role.lineHeight ?? Math.round(fontSize * 1.25);
  const scale = fitScale(name, faceOf(role.fontFamily), fontSize * Math.min(fontScale, cap), measure);
  return (
    <Text
      maxFontSizeMultiplier={cap}
      accessibilityRole={accessibilityRole}
      style={[
        role,
        { color, textAlign: align },
        style,
        { fontSize: fontSize * scale, lineHeight: lineHeight * scale },
        role.letterSpacing != null && { letterSpacing: role.letterSpacing * scale },
      ]}>
      {name}
    </Text>
  );
}

/* ==================================================================== */
/* Mount and slot                                                       */
/* ==================================================================== */

export type MountSize = 'grid' | 'shelf' | 'feature' | 'thumb';

/**
 * Each mount's geometry. `padding` is from the inside of the 1pt edge to
 * the content, so a grid card's text column is `cardWidth − 38` (1 + 18 on
 * each side) and a shelf card's `cardWidth − 26`. The 18pt is clear mat:
 * until v3.1 a tier rule was printed inside it, and the padding was kept
 * exactly when the rule went, so every DrinkName measure in
 * specs/v3-cabinet.md 6.4 still holds. A caller with its own measure
 * (CustomDrinkTile) may override the padding through `style`.
 *
 * `ruleInset` is read by nothing since v3.1; the close-out deletes it.
 */
export const MOUNT: Record<
  MountSize,
  { radius: number; ruleInset: number | null; padding: number; windowRadius: number }
> = {
  grid: { radius: 8, ruleInset: 4, padding: 18, windowRadius: 3 },
  feature: { radius: 8, ruleInset: 4, padding: 12, windowRadius: 3 },
  shelf: { radius: 6, ruleInset: 3, padding: 12, windowRadius: 2 },
  thumb: { radius: 4, ruleInset: null, padding: 3, windowRadius: 2 },
};

/** Which mount a MountWindow sits in, for its corner. */
const MountSizeContext = createContext<MountSize>('grid');

/**
 * A drink in the cabinet.
 *
 * `state="mounted"` (collected): `mat` card stock with a 1pt edge (`matEdge`
 * on lining, `line` on paper), and on lining only the `elevation.seat`
 * contact shadow, the one place a card casts one.
 *
 * `state="slot"` (not yet): `liningDeep` pressed into the lining with
 * `elevation.recess` and a 1pt `slotEdge`, the same for every drink.
 *
 * A frame only: the edges are decorative, and the card that holds the
 * mount speaks for it.
 *
 * `tier` is ignored since v3.1 (rarity is gone) and kept only so callers
 * not yet moved off it compile; the close-out deletes it.
 */
export function Mount({
  state,
  size,
  onLining,
  children,
  style,
}: {
  state: 'mounted' | 'slot';
  /** @deprecated rarity, removed in v3.1: ignored; deleted at the close-out. */
  tier?: Rarity;
  size: MountSize;
  /** Seat shadow and matEdge when true. */
  onLining: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const geo = MOUNT[size];
  const mounted = state === 'mounted';

  return (
    <View
      style={[
        styles.mount,
        { borderRadius: geo.radius, padding: geo.padding },
        mounted
          ? [styles.mountMat, { borderColor: onLining ? colors.matEdge : colors.line }, onLining && elevation.seat]
          : [styles.mountSlot, elevation.recess],
        style,
      ]}>
      <MountSizeContext.Provider value={size}>{children}</MountSizeContext.Provider>
    </View>
  );
}

/**
 * The window a mount shows its drink through: clipped at the mount's
 * window corner (3pt, 2pt on shelf and thumb), on a `liningDeep` fill (a
 * lit photo's own edge colour, so the moment before it decodes already
 * matches), with a 1pt hairline drawn over the picture (`windowEdge`, or
 * `slotWindowEdge` in a slot).
 *
 * `height` is a minimum: in a row that stretches its cards to the tallest
 * one the window takes up the slack, so two cards' windows always line up
 * whatever their names wrap to.
 */
export function MountWindow({
  height,
  state,
  children,
}: {
  height: number;
  state: 'mounted' | 'slot';
  children: React.ReactNode;
}) {
  const r = MOUNT[useContext(MountSizeContext)].windowRadius;
  return (
    <View style={[styles.window, { minHeight: height, borderRadius: r }]}>
      {children}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[
          StyleSheet.absoluteFill,
          styles.windowEdge,
          { borderRadius: r, borderColor: state === 'slot' ? colors.slotWindowEdge : colors.windowEdge },
        ]}
      />
    </View>
  );
}

/* ==================================================================== */
/* Plates and tags                                                      */
/* ==================================================================== */

/**
 * The catalogue number, stamped: "#0009" in `dexNumber` (11pt, tracked,
 * tabular) on a 20pt plate with a 1pt edge. On mat and paper it is taupe
 * with taupeInk (5.55:1 on mat); on lining and in a slot the edge is
 * `plateEdgeLining` and the ink onLiningMuted (6.79:1). Over a photograph
 * use media.tsx's MediaNumberPlate instead.
 *
 * Not its own VoiceOver element: the card or row that holds it says
 * "number 9".
 */
export function NumberPlate({ n, tone }: { n: number; tone: 'mat' | 'paper' | 'lining' | 'slot' }) {
  const dark = tone === 'lining' || tone === 'slot';
  return (
    <View style={[styles.plate, { borderColor: dark ? colors.plateEdgeLining : colors.taupe }]}>
      <Text
        accessible={false}
        maxFontSizeMultiplier={1.3}
        style={[dexNumber, { color: dark ? colors.onLiningMuted : colors.taupeInk }]}>
        {formatDexNumber(n)}
      </Text>
    </View>
  );
}

/** @deprecated rarity, removed in v3.1: draws nothing; deleted at the close-out. */
export function TierWord(props: { rarity: Rarity; tone: 'paper' | 'lining'; size?: 'sm' | 'md' }): null {
  return null;
}

/** @deprecated rarity, removed in v3.1: draws nothing; deleted at the close-out. */
export function RarityTally(props: { counts: Record<Rarity, number>; tone: 'paper' | 'lining' }): null {
  return null;
}

/**
 * Whether a drink in a paper list (Log, My Bar) is in your Dex yet.
 *
 * Not in: "New" (selected: "New to your Dex"), wine on its wash with a 1pt
 * wine edge, because a new catch is the thing those lists exist to find.
 * In: a check and "In your Dex", muted on a 1pt `line` edge. The words
 * carry the state; the colour only repeats it.
 */
export function DexStatusTag({ inDex, selected }: { inDex: boolean; selected?: boolean }) {
  if (inDex) {
    return (
      <View style={[styles.statusTag, styles.statusTagIn]}>
        <Icon name="check" size={TAG_ICON} color={colors.textMuted} />
        <Text maxFontSizeMultiplier={TAG_CAP} style={[styles.statusTagText, { color: colors.textMuted }]}>
          {tagLabel(true, selected)}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.statusTag, styles.statusTagNew]}>
      <Text maxFontSizeMultiplier={TAG_CAP} style={[styles.statusTagText, { color: colors.wine }]}>
        {tagLabel(false, selected)}
      </Text>
    </View>
  );
}

const TAG_ICON = 12;
const TAG_CAP = 1.3;

function tagLabel(inDex: boolean, selected?: boolean): string {
  if (inDex) return 'In your Dex';
  return selected ? 'New to your Dex' : 'New';
}

/**
 * The width a DexStatusTag takes at this text size, worked out rather than
 * measured (lib/textFit.ts errs wide), so a row can subtract it when it
 * gives DrinkName its measure. "New to your Dex" comes to about 130pt at
 * the default size and 165 at the 1.3 cap, wider than a fixed 112pt
 * trailing column.
 */
export function dexStatusTagWidth(inDex: boolean, selected: boolean | undefined, fontScale: number): number {
  const size = textRole.statusWord.fontSize * Math.min(fontScale, TAG_CAP);
  const icon = inDex ? TAG_ICON + space.xs : 0;
  return stroke.edge * 2 + space.sm * 2 + icon + textWidth(tagLabel(inDex, selected), 'inter', size);
}

/**
 * A photograph lying loose in the lining: a friend's pour of a drink you
 * have not caught ("Not in your Dex yet"). Not a mount, because it is not
 * yours yet: a 4pt corner, a 1pt `printEdge`, and it clips the photo the
 * caller puts in it. The photo is laid out inside the edge, so a full-bleed
 * child never covers it.
 */
export function LoosePrint({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  return <View style={[styles.print, { width, height }]}>{children}</View>;
}

/**
 * A count set large: "38" and its caption ("of 2,089 collected"). Inter
 * tabular, not Playfair: a figure is not a name (check-design rule 6). Wine
 * on paper, bone on lining; the caption in the ground's muted ink.
 *
 * Baseline-aligned in a wrapping row, so in a narrow column (the Latest
 * catch panel on a 375pt phone, accessibility text sizes) the caption drops
 * under the figure instead of squeezing it. Both cap at 1.3. One VoiceOver
 * element: "38 of 2,089 collected".
 */
export function HeroFigure({
  value,
  caption,
  tone,
}: {
  value: number;
  caption: string;
  tone: 'paper' | 'lining';
}) {
  const lining = tone === 'lining';
  const figure = formatCount(value);
  return (
    <View accessible accessibilityLabel={`${figure} ${caption}`} style={styles.hero}>
      <Text maxFontSizeMultiplier={1.3} style={[textRole.heroFigure, { color: lining ? colors.onLining : colors.wine }]}>
        {figure}
      </Text>
      <Text
        maxFontSizeMultiplier={1.3}
        style={[textRole.helper, { color: lining ? colors.onLiningMuted : colors.textMuted }]}>
        {caption}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /* LiningBand */
  band: { backgroundColor: colors.lining },
  panel: {
    backgroundColor: colors.lining,
    borderRadius: radius.card,
    borderWidth: stroke.edge,
    borderColor: colors.liningLine,
    overflow: 'hidden',
  },
  lip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: stroke.edge,
    backgroundColor: colors.liningLip,
  },
  shadeOverlay: { position: 'absolute', left: 0, right: 0, top: '100%', height: SHADE },
  shadeStrip: { height: SHADE, backgroundColor: colors.bg },

  /* Mount */
  mount: { borderWidth: stroke.edge },
  mountMat: { backgroundColor: colors.mat },
  mountSlot: { backgroundColor: colors.liningDeep, borderColor: colors.slotEdge },
  window: { flexGrow: 1, overflow: 'hidden', backgroundColor: colors.liningDeep },
  windowEdge: { borderWidth: stroke.edge },

  /* NumberPlate */
  plate: {
    minHeight: 20,
    paddingHorizontal: 5,
    justifyContent: 'center',
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
  },

  /* DexStatusTag */
  statusTag: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
  },
  statusTagNew: { backgroundColor: colors.wineWash, borderColor: colors.wine },
  statusTagIn: { borderColor: colors.line },
  statusTagText: textRole.statusWord,

  /* LoosePrint */
  print: {
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: colors.printEdge,
    overflow: 'hidden',
    backgroundColor: colors.liningDeep,
  },

  /* HeroFigure */
  hero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: space.sm },
});
