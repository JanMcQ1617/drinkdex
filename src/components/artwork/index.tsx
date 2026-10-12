import React from 'react';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

import { colors } from '@/constants/theme';
import type { Drink } from '@/types';

import { resolveShape, SHAPES } from './glasses';
import type { GlassShape } from './glasses';
import { liquidColor } from './liquid';

export { resolveShape, SHAPES } from './glasses';
export { liquidColor, LIQUID } from './liquid';
export type { GlassShape } from './glasses';

/* ==================================================================== */
/* Garnish                                                              */
/* ==================================================================== */

type GarnishKind = 'wheel' | 'wedge' | 'olive' | 'cherry' | 'sprig' | 'twist' | null;

function resolveGarnish(drink: Drink): GarnishKind {
  const g = (drink.recipe?.garnish ?? '').toLowerCase();
  const n = drink.name.toLowerCase();
  const src = `${g} ${n}`;

  if (!g && drink.category !== 'cocktail') return null;
  if (/olive|onion|gibson/.test(src)) return 'olive';
  if (/cherry|luxardo|maraschino/.test(src)) return 'cherry';
  if (/mint|basil|rosemary|thyme|sprig|herb/.test(src)) return 'sprig';
  if (/twist|peel|zest|expressed/.test(src)) return 'twist';
  if (/wedge|slice/.test(src)) return 'wedge';
  if (/wheel|round|orange|lime|lemon|grapefruit/.test(src)) return 'wheel';
  return null;
}

function Garnish({ kind, x, y, tint }: { kind: GarnishKind; x: number; y: number; tint: string }) {
  switch (kind) {
    case 'wheel':
      return (
        <G>
          <Circle cx={x} cy={y} r={7} fill={tint} stroke={colors.text} strokeWidth={1.4} />
          <Path
            d={`M${x - 7} ${y} H${x + 7} M${x} ${y - 7} V${y + 7}`}
            stroke={colors.text}
            strokeWidth={0.9}
            opacity={0.55}
          />
        </G>
      );
    case 'wedge':
      return (
        <Path
          d={`M${x - 7} ${y + 5} A8 8 0 0 1 ${x + 7} ${y + 5} Z`}
          fill={tint}
          stroke={colors.text}
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
      );
    case 'olive':
      return (
        <G>
          <Path
            d={`M${x} ${y - 9} V${y + 2}`}
            stroke={colors.text}
            strokeWidth={1.2}
            strokeLinecap="round"
          />
          <Circle cx={x} cy={y + 5} r={5} fill="#8FA83E" stroke={colors.text} strokeWidth={1.3} />
          <Circle cx={x} cy={y + 5} r={1.8} fill="#C4453A" />
        </G>
      );
    case 'cherry':
      return (
        <G>
          <Path
            d={`M${x} ${y - 9} Q${x + 3} ${y - 3} ${x + 1} ${y + 1}`}
            stroke="#6B4A22"
            strokeWidth={1.2}
            fill="none"
            strokeLinecap="round"
          />
          <Circle cx={x} cy={y + 5} r={5} fill="#B02A3A" stroke={colors.text} strokeWidth={1.3} />
        </G>
      );
    case 'sprig':
      return (
        <G stroke="#4E7A32" strokeWidth={1.5} strokeLinecap="round" fill="none">
          <Path d={`M${x} ${y + 6} V${y - 8}`} />
          <Path d={`M${x} ${y - 4} Q${x + 6} ${y - 7} ${x + 5} ${y - 12}`} />
          <Path d={`M${x} ${y - 1} Q${x - 6} ${y - 4} ${x - 5} ${y - 9}`} />
        </G>
      );
    case 'twist':
      return (
        <Path
          d={`M${x - 4} ${y - 8} Q${x + 6} ${y - 4} ${x} ${y + 2} Q${x - 6} ${y + 7} ${x + 3} ${y + 9}`}
          stroke="#E0A93A"
          strokeWidth={2.6}
          fill="none"
          strokeLinecap="round"
        />
      );
    default:
      return null;
  }
}

/* ==================================================================== */
/* Footprint                                                            */
/* ==================================================================== */

/**
 * Where a glass stands and how wide it is, in viewBox units, read from the
 * shape's own path data so a new or redrawn glass needs no table entry.
 * The bases run from y 82 (a sake cup's foot) to 102 (a flute's), so
 * a face that stood every glass on one fixed line would float the short
 * ones and sink the stemmed ones into the counter (VectorFace).
 */
export interface ArtFootprint {
  /** Lowest point of the vessel and its parts. */
  baseY: number;
  minX: number;
  maxX: number;
}

/**
 * Extent of absolute M/L/H/V/Q/C/Z path data, the only commands
 * glasses.ts draws with. Quadratic segments count their true extremum, not
 * the control point, which overshoots: a coupe foot's control point sits at
 * y 103 while the curve itself bottoms out at 100.75.
 */
function extendBounds(d: string, b: { minX: number; maxX: number; maxY: number }) {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  let cmd = '';
  let x = 0;
  let y = 0;
  let i = 0;
  const take = () => Number(tokens[i++]);
  const point = (px: number, py: number) => {
    b.minX = Math.min(b.minX, px);
    b.maxX = Math.max(b.maxX, px);
    b.maxY = Math.max(b.maxY, py);
  };
  /** Extremum of one axis of a quadratic, when it falls inside the segment. */
  const quadExtreme = (p0: number, p1: number, p2: number) => {
    const den = p0 - 2 * p1 + p2;
    if (den === 0) return null;
    const t = (p0 - p1) / den;
    if (t <= 0 || t >= 1) return null;
    return (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
  };

  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++].toUpperCase();
    if (cmd === 'Z') {
      // A stray number after Z would otherwise never be consumed: a hang at render.
      if (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) i++;
      continue;
    }
    if (cmd === 'M' || cmd === 'L') {
      x = take();
      y = take();
      point(x, y);
    } else if (cmd === 'H') {
      x = take();
      point(x, y);
    } else if (cmd === 'V') {
      y = take();
      point(x, y);
    } else if (cmd === 'Q') {
      const x1 = take();
      const y1 = take();
      const x2 = take();
      const y2 = take();
      const ex = quadExtreme(x, x1, x2);
      const ey = quadExtreme(y, y1, y2);
      if (ex !== null) point(ex, y);
      if (ey !== null) point(x, ey);
      x = x2;
      y = y2;
      point(x, y);
    } else if (cmd === 'C') {
      // Unused by glasses.ts today; sampled, so a redrawn glass still works.
      const c = [take(), take(), take(), take(), take(), take()];
      for (let s = 1; s <= 8; s++) {
        const t = s / 8;
        const u = 1 - t;
        point(
          u * u * u * x + 3 * u * u * t * c[0] + 3 * u * t * t * c[2] + t * t * t * c[4],
          u * u * u * y + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5],
        );
      }
      x = c[4];
      y = c[5];
    } else {
      // A command this parser does not know: skip its number rather than loop.
      i++;
    }
  }
}

const FOOTPRINTS = new Map<GlassShape, ArtFootprint>();

export function artFootprint(drink: Drink): ArtFootprint {
  const shape = resolveShape(drink);
  const known = FOOTPRINTS.get(shape);
  if (known) return known;
  const def = SHAPES[shape];
  const b = { minX: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const d of [def.vessel, ...(def.parts ?? [])]) extendBounds(d, b);
  const fp = { baseY: b.maxY, minX: b.minX, maxX: b.maxX };
  FOOTPRINTS.set(shape, fp);
  return fp;
}

/* ==================================================================== */
/* DrinkArt                                                             */
/* ==================================================================== */

export interface DrinkArtProps {
  drink: Drink;
  size?: number;
  /** Hides the soft radial ground shadow. */
  flat?: boolean;
}

/**
 * A drawn glass with its pour, in ink strokes for a light ground: the reel
 * viewer's and tag sheet's small drink marks (Reels is flagged off). The
 * Dex's no-photo face is GlassOutline, below, which has no pour: in
 * Daylight a photograph is the only colour a drink earns.
 */
export const DrinkArt = React.memo(function DrinkArt({ drink, size = 96, flat = false }: DrinkArtProps) {
  const shape = resolveShape(drink);
  const def = SHAPES[shape];

  /*
   * Keyed by drink, not by glass. The pour colour is per drink, and on web
   * every SVG id shares one document namespace, so an id per shape let
   * every coupe on screen resolve to whichever pour mounted first.
   */
  const gradId = `g-${drink.id}`;
  const pour = liquidColor(drink);
  const glassStroke = 'rgba(10, 10, 10, 0.55)';
  const garnish = resolveGarnish(drink);

  return (
    <Svg width={size} height={size * (112 / 100)} viewBox="0 0 100 112" fill="none">
      <Defs>
        {/* Depth in the pour — flat fill reads as clip art. */}
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={pour} stopOpacity={0.82} />
          <Stop offset="1" stopColor={pour} stopOpacity={1} />
        </LinearGradient>
      </Defs>

      {!flat && <Circle cx={50} cy={103} r={20} fill={colors.text} opacity={0.06} />}

      <Path d={def.liquid} fill={`url(#${gradId})`} />

      <Path d={def.vessel} stroke={glassStroke} strokeWidth={2.2} strokeLinejoin="round" fill="none" />

      {def.parts?.map((d, i) => (
        <Path
          key={i}
          d={d}
          stroke={glassStroke}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}

      {/* Specular highlight — the single detail that sells it as glass. */}
      <Path d={def.vessel} stroke="rgba(255,255,255,0.75)" strokeWidth={0.9} fill="none" opacity={0.5} />

      {garnish && def.garnishAt && (
        <Garnish kind={garnish} x={def.garnishAt.x} y={def.garnishAt.y} tint={pour} />
      )}
    </Svg>
  );
});

/**
 * The no-photo face's glass (white spec 6.3): the drink's own glassware as
 * an outline, `stroke` points wide whatever its size, in one colour (the
 * caller passes colors.lineControl), with no pour, no garnish and no
 * light. 1,927 drinks have no photograph; caught and not yet share this
 * face, and the name style beside it tells them apart.
 */
export const GlassOutline = React.memo(function GlassOutline({
  drink,
  size,
  color,
  stroke = 1.4,
}: {
  drink: Drink;
  size: number;
  color: string;
  stroke?: number;
}) {
  const def = SHAPES[resolveShape(drink)];
  // viewBox units for `stroke` screen points at this size: the viewBox is 100 wide, drawn `size` wide.
  const w = (stroke * 100) / Math.max(size, 1);
  return (
    <Svg width={size} height={size * (112 / 100)} viewBox="0 0 100 112" fill="none">
      <G stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {[def.vessel, ...(def.parts ?? [])].map((d, i) => (
          <Path key={i} d={d} />
        ))}
      </G>
    </Svg>
  );
});
