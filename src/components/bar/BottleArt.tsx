import React from 'react';
import Svg, { ClipPath, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { svgStop, useSvgId } from '@/components/cabinet';
import { colors } from '@/constants/theme';
import type { BottleForm, BottleLook, FreshForm, FreshLook, Look } from '@/data/barShelf';

import {
  BAR,
  CAP,
  FRUIT,
  GLASS,
  INK,
  LABEL_LINE,
  LABEL_PAPER,
  PAPER_GOODS,
  pourColor,
  pourStops,
  SIPHON,
  skinOf,
} from './paint';

/* ==================================================================== */
/* Bottle art                                                           */
/*                                                                      */
/* One set of shapes for both states, ported from the Back bar mockup's */
/* path table (specs/v3-2-mockups/mybar-backbar/index.html):             */
/*                                                                      */
/*   LIT    on your shelf: glass, the liquid, a bone label with a rule  */
/*          and a small device (never words, so no brand is imitated),  */
/*          a cap, rim light and a contact shadow on the plank.         */
/*   GHOST  not on your shelf: the same silhouette blind-stamped into   */
/*          the lining, debossLight on the upper edge and debossShadow  */
/*          on the lower, the material the locked vector glasses use.   */
/*                                                                      */
/* Vectors, so a shelf of thirty bottles decodes no bitmaps. Static:    */
/* nothing here animates, so nothing can rest half drawn. Decorative:   */
/* the bay that holds the art speaks for it.                            */
/* ==================================================================== */

interface FormDef {
  w: number;
  h: number;
  capW: number;
  capH: number;
  neckW: number;
  neckH: number;
  /** Shoulder height. */
  sh: number;
  style: 'round' | 'flat';
  /** Foot corner. */
  r?: number;
  /** Label band as shares of the body: top and height. */
  label: [number, number];
  fill: number;
}

/* Sizes in points at scale 1, as the mockup drew them. */
const FORMS: Record<BottleForm, FormDef> = {
  tall: { w: 34, h: 92, capW: 12, capH: 9, neckW: 10, neckH: 14, sh: 13, style: 'round', label: [0.26, 0.4], fill: 0.78 },
  slim: { w: 30, h: 98, capW: 11, capH: 10, neckW: 9, neckH: 24, sh: 16, style: 'round', label: [0.3, 0.3], fill: 0.82 },
  square: { w: 36, h: 86, capW: 14, capH: 9, neckW: 12, neckH: 9, sh: 5, style: 'flat', label: [0.22, 0.46], fill: 0.8 },
  whiskey: { w: 40, h: 80, capW: 15, capH: 10, neckW: 12, neckH: 8, sh: 5, style: 'flat', label: [0.3, 0.42], fill: 0.8 },
  rye: { w: 35, h: 86, capW: 13, capH: 10, neckW: 11, neckH: 13, sh: 6, style: 'flat', label: [0.24, 0.46], fill: 0.78 },
  wine: { w: 30, h: 96, capW: 9, capH: 11, neckW: 8.5, neckH: 22, sh: 22, style: 'round', label: [0.3, 0.48], fill: 0.86 },
  aperitif: { w: 30, h: 90, capW: 10, capH: 9, neckW: 9, neckH: 20, sh: 20, style: 'round', label: [0.34, 0.3], fill: 0.82 },
  squat: { w: 36, h: 78, capW: 13, capH: 9, neckW: 11, neckH: 8, sh: 6, style: 'flat', label: [0.36, 0.3], fill: 0.82 },
  agave: { w: 36, h: 90, capW: 13, capH: 10, neckW: 11, neckH: 14, sh: 14, style: 'round', label: [0.34, 0.34], fill: 0.8 },
  dasher: { w: 22, h: 54, capW: 9, capH: 8, neckW: 7, neckH: 5, sh: 8, style: 'round', r: 2, label: [0.02, 0.92], fill: 0.9 },
  small: { w: 26, h: 52, capW: 9, capH: 8, neckW: 8, neckH: 6, sh: 10, style: 'round', r: 2.5, label: [0.36, 0.3], fill: 0.74 },
  beer: { w: 26, h: 70, capW: 9, capH: 5, neckW: 9, neckH: 17, sh: 15, style: 'round', r: 2.5, label: [0.4, 0.3], fill: 0.9 },
};

interface Geom {
  w: number;
  h: number;
  d: string;
  cap: { x: number; w: number; h: number };
  cx: number;
  yN: number;
  yB: number;
  x1: number;
}

const geomCache = new Map<BottleForm, Geom>();

/** The silhouette of a bottle form: neck, shoulder and body as one path. */
function geom(form: BottleForm): Geom {
  const hit = geomCache.get(form);
  if (hit) return hit;
  const F = FORMS[form];
  const { w, h, capW, capH, neckW, neckH, sh } = F;
  const r = F.r ?? 3;
  const cx = w / 2;
  const x1 = cx - neckW / 2;
  const x2 = cx + neckW / 2;
  const yN = capH + neckH;
  const yB = yN + sh;
  const L = 0.5;
  const R = w - 0.5;
  const foot = `V${h - r}Q${L} ${h} ${L + r} ${h}H${R - r}Q${R} ${h} ${R} ${h - r}`;
  let d: string;
  if (F.style === 'flat') {
    const k = 4;
    d = `M${x1} ${capH}V${yN}Q${x1} ${yB} ${x1 - k} ${yB}H${L + k}Q${L} ${yB} ${L} ${yB + k}${foot}V${yB + k}Q${R} ${yB} ${R - k} ${yB}H${x2 + k}Q${x2} ${yB} ${x2} ${yN}V${capH}Z`;
  } else {
    d = `M${x1} ${capH}V${yN}C${x1} ${yN + sh * 0.55} ${L} ${yN + sh * 0.35} ${L} ${yB}${foot}V${yB}C${R} ${yN + sh * 0.35} ${x2} ${yN + sh * 0.55} ${x2} ${yN}V${capH}Z`;
  }
  const g = { w, h, d, cap: { x: cx - capW / 2, w: capW, h: capH + 0.6 }, cx, yN, yB, x1 };
  geomCache.set(form, g);
  return g;
}

/* ---- Fresh things: their size and the outline paths the ghost stamps ---- */

const FRESH: Record<FreshForm, { w: number; h: number; paths: string[] }> = {
  lemon: { w: 30, h: 22, paths: ['M1.5 12C1.5 6.5 7 2.5 15 2.5S28.5 6.5 28.5 12 23 21.5 15 21.5 1.5 17.5 1.5 12Z', 'M1.5 12H0M28.5 12H30'] },
  lime: { w: 40, h: 22, paths: ['M2 12.5a9 9 0 1 0 18 0a9 9 0 1 0-18 0Z', 'M21.5 13a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0-17 0Z'] },
  orange: { w: 30, h: 28, paths: ['M2.5 15.5a12.5 12.5 0 1 0 25 0a12.5 12.5 0 1 0-25 0Z', 'M16.4 1.6c3-1.8 6.4-1.2 7.6.6-2.8 1.4-5.6 1.2-7.6-.6Z'] },
  grapefruit: { w: 34, h: 30, paths: ['M2 16.5a15 13.5 0 1 0 30 0a15 13.5 0 1 0-30 0Z', 'M17 3c.4-1.4 1.2-2.2 2.2-2.6', 'M7.5 12.5c1.6-3 4.4-5 7.6-5.6'] },
  fruit: { w: 28, h: 26, paths: ['M2 14a12 12 0 1 0 24 0a12 12 0 1 0-24 0Z', 'M14 2.4c.3-1.2 1-2 2-2.3'] },
  sprig: { w: 30, h: 50, paths: ['M4 24h22l-2 25.5H6Z', 'M15 24 12 6M15 24l5-16M15 24V9'] },
  siphon: { w: 32, h: 70, paths: ['M5 24h20v44a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z', 'M6 24V16c0-5 4-9 9-9s9 4 9 9v8Z', 'M24 14h7v3.5h-7Z'] },
  can: { w: 24, h: 44, paths: ['M2 6Q2 3.5 4.5 3.5H19.5Q22 3.5 22 6V41Q22 43.5 19.5 43.5H4.5Q2 43.5 2 41Z', 'M3.5 3.5Q3.5 1 6 1H18Q20.5 1 20.5 3.5'] },
  carton: { w: 26, h: 50, paths: ['M2 49.5V16L6 6V2H20V6L24 16V49.5Z', 'M2 16H24M6 6H20'] },
  egg: {
    w: 34,
    h: 26,
    paths: [
      'M9 2C4.2 2 1.5 9 1.5 15.5C1.5 21 4.8 25 9 25S16.5 21 16.5 15.5C16.5 9 13.8 2 9 2Z',
      'M25 5C20.8 5 18.5 11 18.5 16.5C18.5 21.5 21.4 25 25 25S31.5 21.5 31.5 16.5C31.5 11 29.2 5 25 5Z',
    ],
  },
  jug: { w: 30, h: 40, paths: ['M4.5 9H22.5L23.5 13C25 20 25 31 22.6 38Q22 39.5 20.4 39.5H7.6Q6 39.5 5.4 38C3 31 3 20 4.5 13Z', 'M4.5 9L1 7.4L4 12.4', 'M23.6 15C29 15 29 28 23.2 28.4'] },
  jar: { w: 28, h: 34, paths: ['M3 11Q3 9 5 9H23Q25 9 25 11V31Q25 33 23 33H5Q3 33 3 31Z', 'M4.5 3Q4.5 1 6.5 1H21.5Q23.5 1 23.5 3V8H4.5Z'] },
};

/** The art's drawn size in points at scale 1, margins included (the bay sizes from it). */
export function artSize(look: Look): { w: number; h: number } {
  const { w, h } = look.kind === 'bottle' ? FORMS[look.form] : FRESH[look.form];
  return { w: w + 12, h: h + 6 };
}

/** The scale that fits a look inside a w x h window, with a little air. */
export function fitArt(look: Look, w: number, h: number, air = 0.86): number {
  const size = artSize(look);
  return Math.min(1, (w * air) / size.w, (h * air) / size.h);
}

/* ==================================================================== */

/**
 * One ingredient's picture. `lit` draws it on the shelf; otherwise it is
 * stamped into the lining. `scale` 1 is the shelf size; rows and cards
 * pass fitArt() for their window.
 */
export const BottleArt = React.memo(function BottleArt({
  look,
  lit,
  scale = 1,
}: {
  look: Look;
  lit: boolean;
  scale?: number;
}) {
  const id = useSvgId('bottle');
  const size = artSize(look);
  const inner =
    look.kind === 'bottle'
      ? lit
        ? litBottle(look, id)
        : ghost([geom(look.form).d, capPath(geom(look.form))], scale)
      : lit
        ? litFresh(look, id)
        : ghost(FRESH[look.form].paths, scale);
  return (
    <Svg
      width={size.w * scale}
      height={size.h * scale}
      viewBox={`-6 -1 ${size.w} ${size.h}`}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {inner}
    </Svg>
  );
});

function capPath(g: Geom): string {
  const { x, w, h } = g.cap;
  return `M${x} ${h}V1.5Q${x} 0 ${x + 1.5} 0H${x + w - 1.5}Q${x + w} 0 ${x + w} 1.5V${h}Z`;
}

/**
 * Blind-stamped: the lower edge in debossShadow, nudged down a hair, then
 * the shape itself with a faint dark fill and the debossLight upper edge.
 * Strokes stay 1pt at any scale.
 */
function ghost(paths: string[], scale: number) {
  const sw = 1 / scale;
  return (
    <>
      {paths.map((d, i) => (
        <Path
          key={`s${i}`}
          d={d}
          transform={`translate(0 ${0.9 / scale})`}
          fill="none"
          stroke={colors.debossShadow}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      ))}
      {paths.map((d, i) => (
        <Path
          key={`l${i}`}
          d={d}
          fill={BAR.contact}
          fillOpacity={0.16}
          stroke={colors.debossLight}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      ))}
    </>
  );
}

/* ---- Lit bottle ---- */

function litBottle(a: BottleLook, id: string) {
  const F = FORMS[a.form];
  const g = geom(a.form);
  const { w, h, d, cap, cx, yB } = g;
  const bodyH = h - yB;
  const fill = a.fill ?? F.fill;
  const ly = yB + bodyH * (1 - fill);
  const [labelTop, labelShare] = F.label;
  const labY = yB + bodyH * labelTop;
  const labH = bodyH * labelShare;
  const inset = a.form === 'dasher' ? 1.2 : 3;
  const lw = w - inset * 2;
  const paper = a.dark ? LABEL_PAPER.dark : LABEL_PAPER.light;
  const line = a.dark ? LABEL_LINE.dark : LABEL_LINE.light;
  const band = a.band ? INK[a.band] : null;
  // The device: a small diamond, and under it a short rule on a two-line label.
  const dy = labY + labH * (band ? 0.34 : 0.5);
  const r0 = Math.min(2.6, labH * 0.16);
  const device = `M${cx} ${dy - r0}L${cx + r0} ${dy}L${cx} ${dy + r0}L${cx - r0} ${dy}Z`;
  const [top, foot] = pourStops(a.pour);
  const capFill = CAP[a.cap ?? 'espresso'];
  const glass = GLASS[a.glass ?? 'clear'];

  return (
    <>
      <Defs>
        <ClipPath id={`${id}c`}>
          <Path d={d} />
        </ClipPath>
        <LinearGradient id={`${id}l`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" {...svgStop(top)} />
          <Stop offset="1" {...svgStop(foot)} />
        </LinearGradient>
        {/* Round glass darkens at both edges, so the bottle reads as a cylinder, not a cut-out. */}
        <LinearGradient id={`${id}y`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" {...svgStop(BAR.edgeShade, 0.38)} />
          <Stop offset="0.24" {...svgStop(BAR.edgeShade, 0)} />
          <Stop offset="0.68" {...svgStop(BAR.edgeShade, 0)} />
          <Stop offset="1" {...svgStop(BAR.edgeShade, 0.48)} />
        </LinearGradient>
      </Defs>
      <Ellipse cx={cx} cy={h + 0.6} rx={w * 0.52} ry={2} fill={BAR.contact} fillOpacity={0.45} />
      <Path d={d} fill={glass} />
      <G clipPath={`url(#${id}c)`}>
        <Rect x={0} y={ly} width={w} height={h - ly} fill={`url(#${id}l)`} />
        <Rect x={0} y={ly} width={w} height={0.8} fill={BAR.glint} />
        <Rect x={inset} y={labY} width={lw} height={labH} rx={1} fill={paper} />
        {band ? (
          <Rect x={inset} y={labY + labH * 0.62} width={lw} height={Math.max(2.2, labH * 0.14)} fill={band} />
        ) : null}
        {labH > 9 ? (
          <Rect
            x={inset + 1.4}
            y={labY + 1.4}
            width={lw - 2.8}
            height={labH - 2.8}
            rx={0.6}
            fill="none"
            stroke={line}
            strokeWidth={0.55}
          />
        ) : null}
        <Path
          d={labH > 14 ? `${device}M${cx - lw * 0.22} ${dy + r0 + 2.2}h${lw * 0.44}v0.7h${-lw * 0.44}Z` : device}
          fill={a.dark ? line : (band ?? colors.merlot)}
          fillOpacity={0.85}
        />
        <Rect x={0} y={0} width={w} height={h} fill={`url(#${id}y)`} />
        <Rect x={w * 0.17} y={yB + 3} width={2.2} height={bodyH * 0.74} rx={1.1} fill={BAR.glint} />
      </G>
      <Path d={d} fill="none" stroke={BAR.rim} strokeWidth={0.8} />
      <Rect x={cap.x} y={0} width={cap.w} height={cap.h} rx={a.cap === 'cork' ? 2 : 1.5} fill={capFill} />
      {a.wax ? (
        <Path
          d={`M${cap.x} ${cap.h - 1}h${cap.w}v2.2c-1.6 0-1.6 3.6-3.2 3.6s-1.2-2.4-2.8-2.4-1.4 4.4-3.1 4.4-1.4-3.2-2.9-3.2S${cap.x + 1.2} ${cap.h + 2.6} ${cap.x} ${cap.h + 2.6}z`}
          fill={capFill}
        />
      ) : null}
    </>
  );
}

/* ---- Lit fresh things ---- */

function shadow(f: { w: number; h: number }, rx: number) {
  return <Ellipse cx={f.w / 2} cy={f.h + 0.4} rx={rx} ry={2} fill={BAR.contact} fillOpacity={0.45} />;
}

/** A skin: a top-to-foot gradient, a soft highlight and a dark outline. */
function skin(id: string, d: string, stops: readonly [string, string] | readonly string[], hx: number, hy: number, hr: number) {
  return (
    <>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0.3" y2="1">
          <Stop offset="0" {...svgStop(stops[0]!)} />
          <Stop offset="1" {...svgStop(stops[1]!)} />
        </LinearGradient>
      </Defs>
      <Path d={d} fill={`url(#${id})`} />
      <Ellipse cx={hx} cy={hy} rx={hr} ry={hr * 0.7} fill={FRUIT.highlight} />
      <Path d={d} fill="none" stroke={FRUIT.outline} strokeWidth={0.7} />
    </>
  );
}

/** A mint leaf, drawn from the stem out. */
function leaf(key: string, x: number, y: number, r: number, s = 1) {
  return (
    <G key={key} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <Path d="M0 0C2.4-3.6 7.6-3.8 10.4 0C7.6 3.8 2.4 3.6 0 0Z" fill={FRUIT.leaf} stroke={FRUIT.stem} strokeWidth={0.5} />
      <Path d="M.6 0H9" stroke={FRUIT.leafVein} strokeWidth={0.5} />
    </G>
  );
}

const LEAVES: [number, number, number, number][] = [
  [13, 15, -150, 1],
  [12.4, 10, -115, 0.95],
  [14.6, 4.6, -95, 0.8],
  [17, 15, -30, 1],
  [18.6, 9.6, -60, 0.95],
  [15.4, 8, -80, 0.75],
  [14.8, 20, 160, 0.85],
  [15.4, 20.4, 20, 0.85],
];

function litFresh(look: FreshLook, id: string) {
  const f = FRESH[look.form];
  const tint = look.tint ? pourColor(look.tint) : null;
  switch (look.form) {
    case 'lemon':
      return (
        <>
          {shadow(f, 12)}
          {skin(id, f.paths[0]!, FRUIT.lemon, 10, 7.5, 5)}
          <Path d="M1.5 12l-1.4.4M28.5 12l1.4-.4" stroke={FRUIT.lemon[1]} strokeWidth={2} strokeLinecap="round" />
        </>
      );
    case 'orange':
      return (
        <>
          {shadow(f, 12)}
          {skin(id, f.paths[0]!, FRUIT.orange, 10.5, 10, 5)}
          <Path d="M15 3.2c.3-1.6 1-2.6 2-3" stroke={FRUIT.stem} strokeWidth={1.2} strokeLinecap="round" fill="none" />
          <Path d={f.paths[1]!} fill={FRUIT.leaf} />
        </>
      );
    case 'grapefruit':
      return (
        <>
          {shadow(f, 14)}
          {skin(id, f.paths[0]!, FRUIT.grapefruit, 11, 10, 6)}
        </>
      );
    case 'fruit':
      return (
        <>
          {shadow(f, 11)}
          {skin(id, f.paths[0]!, tint ? skinOf(tint) : FRUIT.orange, 10, 9, 4.5)}
          <Path d={f.paths[1]!} stroke={FRUIT.stem} strokeWidth={1.1} strokeLinecap="round" fill="none" />
        </>
      );
    case 'lime':
      return (
        <>
          {shadow(f, 17)}
          {skin(id, f.paths[0]!, FRUIT.lime, 7.5, 8, 3.5)}
          <Path d={f.paths[1]!} fill={FRUIT.lime[1]} stroke={FRUIT.outline} strokeWidth={0.7} />
          <Ellipse cx={30} cy={13} rx={6.9} ry={6.9} fill={FRUIT.limeFlesh[0]} />
          <Path
            d="M30 6.4V19.6M23.4 13H36.6M25.3 8.3 34.7 17.7M34.7 8.3 25.3 17.7"
            stroke={FRUIT.limeFlesh[1]}
            strokeWidth={0.8}
          />
        </>
      );
    case 'sprig':
      return (
        <>
          {shadow(f, 13)}
          <Path d="M15 26 12 7M15 26l5-17M15 26V10" stroke={FRUIT.stem} strokeWidth={1.1} fill="none" strokeLinecap="round" />
          {LEAVES.map(([x, y, r, s], i) => leaf(`f${i}`, x, y, r, s))}
          <Path d={f.paths[0]!} fill={PAPER_GOODS.jug} stroke={BAR.rim} strokeWidth={0.8} />
          <Rect x={7.4} y={27} width={1.6} height={19} rx={0.8} fill={BAR.glint} />
        </>
      );
    case 'siphon':
      return (
        <>
          <Defs>
            <LinearGradient id={`${id}m`} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" {...svgStop(SIPHON.metal[0])} />
              <Stop offset="0.35" {...svgStop(SIPHON.metal[1])} />
              <Stop offset="1" {...svgStop(SIPHON.metal[2])} />
            </LinearGradient>
          </Defs>
          {shadow(f, 13)}
          <Path d={f.paths[0]!} fill={SIPHON.glass} stroke={BAR.rim} strokeWidth={0.8} />
          <Path d="M5 30h20M5 38h20M5 46h20M5 54h20M5 62h20" stroke={SIPHON.rings} strokeWidth={0.6} />
          <Rect x={8.2} y={26} width={1.8} height={40} rx={0.9} fill={BAR.glint} />
          <Path d={f.paths[1]!} fill={`url(#${id}m)`} />
          <Path d="M24 14h7v3.5h-7Z" fill={`url(#${id}m)`} />
          <Rect x={4.2} y={22.6} width={21.6} height={2.6} rx={1} fill={SIPHON.collar} />
        </>
      );
    case 'can':
      return (
        <>
          <Defs>
            <LinearGradient id={`${id}y`} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" {...svgStop(BAR.edgeShade, 0.4)} />
              <Stop offset="0.3" {...svgStop(BAR.edgeShade, 0)} />
              <Stop offset="0.7" {...svgStop(BAR.edgeShade, 0)} />
              <Stop offset="1" {...svgStop(BAR.edgeShade, 0.5)} />
            </LinearGradient>
          </Defs>
          {shadow(f, 11)}
          <Path d={f.paths[0]!} fill={tint ?? FRUIT.orange[0]} />
          <Rect x={2} y={18} width={20} height={12} fill={LABEL_PAPER.light} />
          <Path d="M12 21.4l2.6 2.6-2.6 2.6-2.6-2.6Z" fill={tint ?? colors.merlot} fillOpacity={0.85} />
          <Path d={f.paths[0]!} fill={`url(#${id}y)`} />
          <Path d={f.paths[1]!} fill={CAP.metal} />
          <Rect x={2} y={3.5} width={20} height={1.4} fill={CAP.metal} />
          <Rect x={5} y={6} width={1.6} height={34} rx={0.8} fill={BAR.glint} />
        </>
      );
    case 'carton':
      return (
        <>
          {shadow(f, 12)}
          <Path d="M2 49.5V16L6 6H20L24 16V49.5Z" fill={PAPER_GOODS.carton} />
          <Path d="M6 6V2H20V6Z" fill={PAPER_GOODS.cartonFold} />
          <Path d="M2 16L6 6H20L24 16Z" fill={PAPER_GOODS.cartonFold} />
          <Rect x={4} y={22} width={18} height={20} rx={1} fill={tint ?? FRUIT.orange[0]} />
          <Ellipse cx={13} cy={30} rx={4.2} ry={4.2} fill={LABEL_PAPER.light} fillOpacity={0.85} />
          <Path d="M2 49.5V16L6 6V2H20V6L24 16V49.5Z" fill="none" stroke={FRUIT.outline} strokeWidth={0.7} />
          <Rect x={18} y={17} width={6} height={32.5} fill={BAR.edgeShade} fillOpacity={0.14} />
        </>
      );
    case 'egg':
      return (
        <>
          {shadow(f, 15)}
          {skin(id, f.paths[0]!, PAPER_GOODS.shell, 6.5, 9, 3)}
          {skin(`${id}b`, f.paths[1]!, PAPER_GOODS.shell, 22.5, 11.5, 3)}
        </>
      );
    case 'jug':
      return (
        <>
          <Defs>
            <ClipPath id={`${id}c`}>
              <Path d={f.paths[0]!} />
            </ClipPath>
          </Defs>
          {shadow(f, 12)}
          <Path d={f.paths[0]!} fill={PAPER_GOODS.jug} />
          <G clipPath={`url(#${id}c)`}>
            <Rect x={0} y={15} width={f.w} height={f.h} fill={tint ?? FRUIT.orange[0]} />
            <Rect x={0} y={15} width={f.w} height={0.8} fill={BAR.glint} />
          </G>
          <Path d={f.paths[0]!} fill="none" stroke={BAR.rim} strokeWidth={0.8} />
          <Path d={f.paths[1]!} fill="none" stroke={BAR.rim} strokeWidth={0.8} />
          <Path d={f.paths[2]!} fill="none" stroke={BAR.rim} strokeWidth={1.6} strokeLinecap="round" />
          <Rect x={7.4} y={13} width={1.6} height={22} rx={0.8} fill={BAR.glint} />
        </>
      );
    case 'jar':
      return (
        <>
          <Defs>
            <ClipPath id={`${id}c`}>
              <Path d={f.paths[0]!} />
            </ClipPath>
          </Defs>
          {shadow(f, 12)}
          <Path d={f.paths[0]!} fill={GLASS.clear} />
          <G clipPath={`url(#${id}c)`}>
            <Rect x={0} y={14} width={f.w} height={f.h} fill={tint ?? FRUIT.orange[0]} />
            <Rect x={3} y={18} width={22} height={9} fill={LABEL_PAPER.light} />
            <Path d="M14 20.2l2.3 2.3-2.3 2.3-2.3-2.3Z" fill={colors.merlot} fillOpacity={0.85} />
          </G>
          <Path d={f.paths[0]!} fill="none" stroke={BAR.rim} strokeWidth={0.8} />
          <Path d={f.paths[1]!} fill={PAPER_GOODS.jarLid} />
          <Rect x={6} y={11} width={1.6} height={19} rx={0.8} fill={BAR.glint} />
        </>
      );
  }
}
