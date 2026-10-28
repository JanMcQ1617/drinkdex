import { cropCorners } from './framePath';
import {
  cached,
  dot,
  line,
  loop,
  type LoopSpec,
  PEN,
  type PenShape,
  penSwash,
  place,
  press,
  type Pt,
  shapeOne,
  type Width,
} from './penPath';

/* ==================================================================== */
/* The doodles: the logo's paint pen drawing a garnish                  */
/*                                                                      */
/* v4.9 (Jan, 28 Oct 2026; specs/v4.9/details/spec.md A.2), ported 1:1  */
/* from specs/v4.9/details/tools/doodles.mjs, the file the board was    */
/* drawn with. Jan: "I like the line under the text, but it still feels */
/* too empty", and of the three directions he was offered he picked all */
/* three, the first being red pen doodles on empty screens and at the   */
/* ends of lists. Every doodle is FILLED pen outlines (penPath's        */
/* stroke()), M/L/Z only, no width under FLOOR, deterministic, cached   */
/* by its arguments, and drawn as ONE path (shapeOne). Each is drawn in */
/* its own NOMINAL box (DOODLE_BOX, pt at scale 1), and a caller places */
/* the box, never the ink, exactly as the v4.6 marks.                   */
/*                                                                      */
/*   limeWheel  a wheel: the rind and six plain teardrop segments       */
/*   twist      a citrus peel hanging in turns, one stroke              */
/*   cherry     the fruit, its stem and a pressed tip                   */
/*   olivePick  two olives on a long pick, a bead for a head            */
/*   coupe      the rim, the bowl, the stem and the foot                */
/*   shaker     a cobbler shaker: cap, shoulder, tin                    */
/*   crown      three points and the base, for the Tournaments leader   */
/*   arrow      a bowed shaft and a two-stroke head, for two empty keys */
/*                                                                      */
/* ONE HAND, THE LOGO'S. After judging (28 Oct) the outline pressure    */
/* peaks at the Marker's weight, not a hairline: few, pressured strokes */
/* read as the tag that wrote "sipply"; many hairline details read as a */
/* red ballpoint sketchbook. So there is no interior detail: no pith,   */
/* no pimentos, no glints, no liquid line. Each doodle is two to four   */
/* strokes, and one (the lime) adds its segments as plain teardrops.    */
/*                                                                      */
/*   DOODLE.line   0.45 -> 2.10 -> 0.40  outlines (a rind, a bowl, a    */
/*                                       tin, a crown)                  */
/*   DOODLE.fine   0.40 -> 1.10 -> 0.40  the lime's segments only       */
/*   tick          0.40 -> peak -> 0.40  short straight strokes (a      */
/*                                       stem, a pick), peak 1.3 to 1.7 */
/*                                                                      */
/* BOLDER (28 Oct, the lead's pass on Jan's "still feels too empty"):   */
/* the doodles are drawn half as big again where they are placed (art-  */
/* led 1.5, icon-led 1.25, the signature 1.2; DOODLE_SCALE), and the    */
/* pen presses harder to match, 2.1 at its peak, not 1.8, so a bigger   */
/* drawing keeps the logo's weight instead of thinning into a sketch.   */
/* Scale still never moves the pen: a doodle at 1.5 has the widths of   */
/* one at 1. The end marks are SIGNED (signature()): the doodle, and    */
/* the swash Jan likes under it as the flourish, one path. An empty     */
/* state is a CLUSTER (emptyCluster()): the print's crop corners and    */
/* two or three doodles round it, or two over a glyph, one path.        */
/*                                                                      */
/* ORNAMENT, NOT INFORMATION. No doodle means a screen (a lime on Home  */
/* says nothing about the Dex), none adds a word, a count or a state,   */
/* and the arrow never points at a key that posts or logs a drink (App  */
/* Store 1.4.3: a pen pointing at the drinking action is encouragement, */
/* words or not).                                                       */
/*                                                                      */
/* Points are HAND-PLACED, not built from a circle-and-square kit: the  */
/* slight overshoot at a loop's close is the drawing.                   */
/*                                                                      */
/* PAINT-FREE, like penPath and framePath: this file names no colour    */
/* and imports only those two, so node runs it as it is for the proof   */
/* (scripts/render-details.mjs), and anything may import it.            */
/*                                                                      */
/* Removed after judging, never to return: the glint and every sparkle  */
/* (a red four-point sparkle is the "AI" / "new" glyph: a state), the   */
/* five-point star (a red star is "favourite" and, in one stroke, a     */
/* pentagram), the ice cube (read as a package icon; the twist replaces */
/* it) and the pimentos (the olive pick read as a chain link).          */
/* ==================================================================== */

/** The six garnishes an empty state or a list's end may draw. */
export type DoodleName = 'lime' | 'twist' | 'cherry' | 'olive' | 'coupe' | 'shaker';

export const DOODLE = {
  line: { land: 0.45, peak: 2.1, lift: 0.4 },
  fine: { land: 0.4, peak: 1.1, lift: 0.4 },
} as const;
/** Where each doodle is drawn (bolder pass): beside an art print, beside a 36pt glyph, and signed at a list's end. */
export const DOODLE_SCALE = { art: 1.5, icon: 1.25, sign: 1.2 } as const;
const W = press(DOODLE.line.land, DOODLE.line.peak, DOODLE.line.lift);
const F = press(DOODLE.fine.land, DOODLE.fine.peak, DOODLE.fine.lift, 0.3);
/** A tick's pressure: lands and lifts thin, swells in the middle. */
const T =
  (peak = 1.6): Width =>
  (t) =>
    0.4 + (peak - 0.4) * Math.sin(Math.PI * t) ** 0.7;

/** Nominal boxes, pt at scale 1: [width, height]. */
export const DOODLE_BOX: Record<DoodleName | 'crown', readonly [number, number]> = {
  lime: [44, 44],
  twist: [34, 44],
  cherry: [36, 44],
  olive: [56, 56],
  coupe: [40, 44],
  shaker: [30, 48],
  crown: [20, 13],
};

/** A drawing's hand at one scale: its centrelines scaled, its widths never. */
interface Hand {
  ln: (pts: Pt[], w: Width) => Pt[];
  lp: (o: LoopSpec, w: Width) => Pt[];
  dt: (x: number, y: number, r: number, n?: number) => Pt[];
}

/*
 * SCALE MOVES THE DRAWING, NEVER THE PEN. A doodle drawn at 1.5 has its
 * centrelines scaled and its widths unchanged (the swash's rule: its
 * length grows with the text, its weight never does). The scale is
 * handed to each generator's drawing as `p` (penAt(s)), never held in a
 * module variable, so one generator may call another.
 */
function penAt(s: number): Hand {
  return {
    ln: (pts, w) => line(pts.map(([x, y]): Pt => [x * s, y * s]), w),
    lp: (o, w) => loop({ ...o, cx: o.cx * s, cy: o.cy * s, rx: o.rx * s, ry: (o.ry ?? o.rx) * s }, w),
    dt: (x, y, r, n) => dot(x * s, y * s, r * Math.max(0.85, s), n),
  };
}

/**
 * ROTATION IS BAKED, never a transform: `rot` degrees about the centre of
 * the doodle's nominal box at this scale (DOODLE_BOX x s), so the shape a
 * device fills is the shape this file proves, and nothing animates it.
 */
function drawn(key: DoodleName | 'crown', s: number, rot: number, make: (p: Hand) => Pt[][]): PenShape {
  return cached(`dd|${key}|${s}|${rot}`, () => {
    const polys = make(penAt(s));
    if (!rot) return shapeOne(polys);
    const [bw, bh] = DOODLE_BOX[key];
    return shapeOne(place(polys, { rot, cx: (bw * s) / 2, cy: (bh * s) / 2 }));
  });
}

/**
 * A lime wheel: the rind in one loop that closes past itself, and six
 * segments as plain teardrops, point to the hub, square to the centre (no
 * lean, so it can never read as a spinner), short of the rind.
 */
export function limeWheel(s = 1, rot = 0): PenShape {
  return drawn('lime', s, rot, ({ ln, lp }) => {
    const c = 22;
    const out = [lp({ cx: c, cy: c, rx: 19.5, ry: 19, from: -115, sweep: 378, spiral: 0.965, wobble: 0.018, seed: 1 }, W)];
    for (let k = 0; k < 6; k++) {
      const a = ((-90 + k * 60) * Math.PI) / 180;
      const u = [Math.cos(a), Math.sin(a)] as const;
      const n = [-u[1], u[0]] as const;
      const at = (r: number, w: number): Pt => [c + u[0] * r + n[0] * w, c + u[1] * r + n[1] * w];
      // From the hub out one side, round the wide end, back down the other: one fine stroke.
      out.push(ln([at(3.4, 0), at(7.5, 2.1), at(11.6, 3.5), at(14.4, 2.6), at(15.2, 0), at(14.4, -2.6), at(11.6, -3.5), at(7.5, -2.1), at(3.7, -0.2)], F));
    }
    return out;
  });
}

/**
 * A citrus twist: a long peel hanging in turns, drawn as one stroke whose
 * turns cross themselves (a prolate trochoid along a slanted axis), so it
 * reads as a curl of peel and its loops as the logo's cursive. The turns
 * are widest in the middle and close at both ends.
 */
export function twist(s = 1, rot = 0): PenShape {
  return drawn('twist', s, rot, ({ ln }) => {
    const pts: Pt[] = [];
    const turns = 4.5;
    const N = 150;
    // The axis: from the top left down to the bottom right, 38pt long, at 70 degrees.
    const A = (70 * Math.PI) / 180;
    const ax = [Math.cos(A), Math.sin(A)] as const;
    const nx = [-ax[1], ax[0]] as const;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const along = 2 + 38 * t;
      const R = 2 + 6 * Math.sin(Math.PI * (0.08 + 0.84 * t)) ** 0.45;
      const ph = 2 * Math.PI * turns * t + 0.4;
      const a = along + 0.3 * R * Math.sin(ph);
      const c = R * Math.cos(ph);
      pts.push([10 + ax[0] * a + nx[0] * c, 1 + ax[1] * a + nx[1] * c]);
    }
    return [ln(pts, W)];
  });
}

/** A cocktail cherry: the fruit in one loop from its dimple, the stem in one long curve, a pressed tip. */
export function cherry(s = 1, rot = 0): PenShape {
  return drawn('cherry', s, rot, ({ ln }) => {
    const fruit: Pt[] = [
      [17.6, 22.6],
      [21.6, 21.2],
      [26.6, 23.6],
      [29.4, 29.8],
      [27.6, 37.2],
      [20.6, 41.4],
      [12.6, 40.2],
      [7.6, 34.2],
      [8.2, 27.2],
      [12.8, 22.4],
      [16.8, 22.9],
      [19.2, 24.6],
    ];
    const stem: Pt[] = [
      [18.4, 23.8],
      [19.6, 17.6],
      [22.8, 10.8],
      [27.8, 5.6],
      [32.4, 3.2],
    ];
    return [
      ln(fruit, W),
      ln(stem, (t) => 0.45 + 1.2 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.6),
      ln(
        [
          [30.6, 1.7],
          [33.6, 4.6],
        ],
        T(1.5),
      ),
    ];
  });
}

/**
 * Two olives on a long pick: the pick runs out past both olives at either
 * end and shows between them, so it reads as a garnish and never as a
 * chain link (the olives never touch), and a pressed bead heads it. No
 * pimentos.
 */
export function olivePick(s = 1, rot = 0): PenShape {
  return drawn('olive', s, rot, ({ ln, lp, dt }) => {
    const u = [Math.SQRT1_2, -Math.SQRT1_2] as const; // along the pick, bottom-left to top-right
    const at = (d: number, off = 0): Pt => [4 + u[0] * d - u[1] * off, 52 + u[1] * d + u[0] * off];
    const olive = (d: number, seed: number) => {
      const [cx, cy] = at(d);
      return lp({ cx, cy, rx: 8.6, ry: 6.4, from: 200, sweep: 374, spiral: 0.97, wobble: 0.03, seed, tilt: -45 }, W);
    };
    return [
      ln([at(0, 0.2), at(12.6, 0)], T(1.7)),
      olive(21.2, 2),
      ln([at(29.9, 0), at(31.9, 0)], T(1.3)),
      olive(40.6, 5),
      ln([at(49.3, 0), at(63, -0.3)], T(1.7)),
      dt(...at(65.4, -0.3), 1.7, 12),
    ];
  });
}

/** A coupe: the rim, the bowl in one stroke, the stem and the foot. */
export function coupe(s = 1, rot = 0): PenShape {
  return drawn('coupe', s, rot, ({ ln }) => [
    ln(
      [
        [3.2, 10.4],
        [12, 9.4],
        [20, 9.2],
        [28, 9.3],
        [36.8, 10.2],
      ],
      W,
    ),
    ln(
      [
        [3.4, 10.8],
        [6.6, 17.6],
        [13, 22.2],
        [20, 23.6],
        [27, 22.2],
        [33.4, 17.6],
        [36.6, 10.9],
      ],
      W,
    ),
    ln(
      [
        [20, 24.2],
        [19.8, 31],
        [20.1, 38.4],
      ],
      T(1.7),
    ),
    ln(
      [
        [11.4, 40.6],
        [16, 39.2],
        [20, 38.9],
        [24.2, 39.2],
        [28.8, 40.4],
      ],
      W,
    ),
  ]);
}

/** A cobbler shaker: the cap, the strainer's shoulder and the tin, three strokes, the tin tapering to its foot. */
export function shaker(s = 1, rot = 0): PenShape {
  return drawn('shaker', s, rot, ({ ln }) => [
    // The cap: a small dome, closed along its foot.
    ln(
      [
        [10.8, 9.6],
        [11.2, 5.4],
        [15, 2.6],
        [18.8, 5.4],
        [19.2, 9.6],
        [15, 10],
        [11.4, 9.8],
      ],
      W,
    ),
    // The shoulder: out from the cap's foot to the seam, across the seam, back up.
    ln(
      [
        [10.6, 10.4],
        [8.4, 14.2],
        [6.6, 17.6],
        [15, 17.9],
        [23.4, 17.5],
        [21.6, 14],
        [19.4, 10.4],
      ],
      W,
    ),
    // The tin: down from the seam, tapering, round its foot and up.
    ln(
      [
        [6.8, 19.2],
        [7.6, 30],
        [9, 41.2],
        [10.4, 44.6],
        [15, 45.4],
        [19.6, 44.6],
        [21, 41.2],
        [22.4, 30],
        [23.2, 19.1],
      ],
      W,
    ),
  ]);
}

/**
 * A crown for a 40pt face (scale 0.8 on a 32): three points and the base
 * in one stroke, then the base once more. No dots on the points: the
 * plain three-point crown is the tag's, the dotted one is the emoji's.
 * Box 20 x 13. It takes the doodles' weight (2.1) since the bolder pass.
 */
export function crown(s = 1, rot = 0): PenShape {
  return drawn('crown', s, rot, ({ ln }) => [
    ln(
      [
        [2.1, 11.6],
        [1.4, 7.4],
        [1.3, 2.6],
        [5.8, 7.2],
        [10, 1.2],
        [14.2, 7.2],
        [18.7, 2.6],
        [18.5, 7.6],
        [17.9, 11.6],
      ],
      W,
    ),
    ln(
      [
        [2.0, 11.9],
        [10, 12.4],
        [18, 11.8],
      ],
      W,
    ),
  ]);
}

/**
 * A pen arrow, from `from` to `to` (pt, in the caller's frame), bowed by
 * `bend` (pt to the left of travel; negative bows right), its head two
 * short strokes at 30 and -26 degrees off the end's tangent, `head` pt
 * long. Bolder pass: the shaft peaks at 1.85 (was 1.55) and the head is
 * 8pt (was 6), the doodles' new weight. Art-led empty states only, at
 * the one key that leads somewhere to look (spec C.9): Home's "Find
 * friends" and the Dex's "Show every drink". ARROW is PenArrow's, in the
 * frame of the key's top-right corner: from 62pt right of it and 24 above
 * round to 14 clear of the key, 24 down, bowed 14 to the right.
 */
export const ARROW = { from: [62, -24] as Pt, to: [14, 24] as Pt, bend: -14, head: 8, peak: 1.85 } as const;
export function arrow(from: Pt, to: Pt, bend = 10, head: number = ARROW.head): PenShape {
  const key = `dd|arrow|${from}|${to}|${bend}|${head}`;
  return cached(key, () => {
    const [x0, y0] = from;
    const [x1, y1] = to;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L;
    const ny = dx / L;
    const mid = (f: number, b: number): Pt => [x0 + dx * f + nx * b, y0 + dy * f + ny * b];
    const pts: Pt[] = [[x0, y0], mid(0.3, bend * 0.8), mid(0.62, bend * 0.85), [x1, y1]];
    const shaft = line(pts, (t) => 0.45 + (ARROW.peak - 0.45) * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.55);
    const ex = x1 - pts[2]![0];
    const ey = y1 - pts[2]![1];
    const el = Math.hypot(ex, ey) || 1;
    const back = [-ex / el, -ey / el] as const;
    const wing = (deg: number): Pt => {
      const a = (deg * Math.PI) / 180;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      return [x1 + head * (back[0] * c - back[1] * sn), y1 + head * (back[0] * sn + back[1] * c)];
    };
    return shapeOne([shaft, line([wing(30), [x1, y1]], (t) => 0.5 + 1.1 * t), line([[x1, y1], wing(-26)], (t) => 1.6 - 1.15 * t)]);
  });
}

/** The six garnishes by name, each `(scale, rotation) => shape`. */
export const DOODLES: Record<DoodleName, (s?: number, rot?: number) => PenShape> = {
  lime: limeWheel,
  twist,
  cherry,
  olive: olivePick,
  coupe,
  shaker,
};

/** A signed end mark, and the box a caller places it by (`nominal`, [w, h]). */
export type Signature = PenShape & { nominal: readonly [number, number] };

/**
 * A list's end, SIGNED (bolder pass, 28 Oct). The screen's doodle at
 * DOODLE_SCALE.sign (1.2) with its rotation, and under it the swash Jan
 * likes under the tab titles, penSwash(56) exactly, as the flourish a
 * hand puts under a signature: the drawing, then the line, flicking up at
 * the right. One path (shapeOne), so it is one native view.
 *
 * Frame: a box `w` x `h` whose RIGHT edge is the content edge (EndMark is
 * alignSelf 'flex-end'): the doodle's box sits `inset` in from the right
 * at the top, the swash's 56 x 6 box ends on the right edge, its top
 * `gap` under the doodle's box. So the flick lands under the doodle's
 * right side, and a wide doodle (the olive, 67pt) overhangs the swash's
 * start to the left, as a signature's initial does.
 */
export const SIGN = { swash: 56, inset: 4, gap: 6 } as const;
/**
 * Each screen's signed end, turned as the hand signs it (spec C.10): the
 * table EndMark draws from, kept here, by the geometry, so the proof's
 * floor check (scripts/render-details.mjs) reads the same rotations the
 * app draws.
 */
export const SIGN_ROT: Record<DoodleName, number> = {
  coupe: -4,
  lime: -8,
  shaker: -12,
  olive: -4,
  twist: -6,
  cherry: -10,
};
export function signature(name: DoodleName, rot = 0): Signature {
  return cached(`sig|${name}|${rot}`, () => {
    const s = DOODLE_SCALE.sign;
    const [bw, bh] = DOODLE_BOX[name];
    const dw = bw * s;
    const dh = bh * s;
    const w = Math.max(SIGN.swash, dw + SIGN.inset);
    const doodle = DOODLES[name](s, rot).polys.map((p) => p.map(([x, y]): Pt => [x + w - SIGN.inset - dw, y]));
    const swash = penSwash(SIGN.swash).polys.map((p) => p.map(([x, y]): Pt => [x + w - SIGN.swash, y + dh + SIGN.gap]));
    return { ...shapeOne([...doodle, ...swash]), nominal: [w, dh + SIGN.gap + PEN.swash.height] as const };
  });
}

/** One doodle of a cluster: [doodle, scale, rotation (deg), x, y], its nominal box's top-left at (x, y) in the picture's frame. */
export type ClusterRow = readonly [DoodleName, number, number, number, number];

/*
 * EMPTY STATES AS CLUSTERS (bolder pass, 28 Oct; spec C.9). Each row is
 * [doodle, scale, rot, x, y]: the doodle drawn at its scale with its
 * rotation baked, its nominal box's top-left moved to (x, y) in the
 * picture's own frame, (0, 0) the picture's top-left. Art-led: round the
 * 120 x 150 EmptyArt print, with its anti-diagonal crop corners; the
 * subject low left beyond the bottom corner, a partner high right beyond
 * the top one, so the cluster runs along the corners' own diagonal, one
 * band rising to the right like the swash; on Saved (no action, so no
 * arrow) a third, low right, closes it into a triangle. Icon-led: round
 * the 36pt glyph, the subject up left and a partner up right, their tops
 * level 36 above the glyph, an arch with the glyph at its foot. Every box
 * keeps 14 off the print (12 off the glyph), 10 off a corner, 14 above
 * the title, and inside the 24pt gutters at 375. Never two of one doodle
 * in a cluster, never more than three.
 */
export const ART_CLUSTER: Partial<Record<DoodleName, readonly ClusterRow[]>> = {
  coupe: [
    ['coupe', 1.5, -10, -80, 74],
    ['lime', 1.5, 8, 140, 14],
  ],
  lime: [
    ['lime', 1.5, -8, -86, 80],
    ['shaker', 1.5, 10, 142, 4],
  ],
  olive: [
    ['olive', 1.5, -4, -102, 64],
    ['twist', 1.5, 8, 142, 2],
    ['cherry', 1.5, 10, 140, 86],
  ],
  twist: [
    ['twist', 1.5, -6, -70, 78],
    ['cherry', 1.5, 10, 140, 10],
  ],
};
export const ICON_CLUSTER: Record<DoodleName, readonly ClusterRow[]> = {
  cherry: [
    ['cherry', 1.25, -14, -58, -36],
    ['olive', 1.1, 8, 50, -36],
  ],
  shaker: [
    ['shaker', 1.25, -12, -50, -36],
    ['lime', 1.25, 10, 52, -36],
  ],
  coupe: [
    ['coupe', 1.25, -8, -62, -36],
    ['twist', 1.25, 8, 52, -36],
  ],
  olive: [
    ['olive', 1.1, -4, -74, -36],
    ['cherry', 1.25, 12, 52, -36],
  ],
  twist: [
    ['twist', 1.25, -6, -55, -36],
    ['coupe', 1.25, 8, 52, -36],
  ],
  lime: [
    ['lime', 1.25, -10, -67, -36],
    ['shaker', 1.25, 10, 52, -36],
  ],
};
/**
 * An empty state's whole composition as ONE path (a Fabric <Path> is a
 * native view, so four marks would be four). An art row that does not
 * exist draws the corners and the subject alone, low left; nothing throws.
 */
export function emptyCluster(name: DoodleName, kind: 'art' | 'icon'): PenShape {
  return cached(`cl|${name}|${kind}`, () => {
    const art = kind === 'art';
    const rows: readonly ClusterRow[] = (art ? ART_CLUSTER : ICON_CLUSTER)[name] ?? [
      [name, art ? DOODLE_SCALE.art : DOODLE_SCALE.icon, -8, art ? -80 : -62, art ? 74 : -36],
    ];
    const polys: Pt[][] = art ? [...cropCorners(120, 150).polys] : [];
    for (const [n, sc, rot, x, y] of rows) polys.push(...place(DOODLES[n](sc, rot).polys, { dx: x, dy: y }));
    return shapeOne(polys);
  });
}
