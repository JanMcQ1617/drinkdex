/* ==================================================================== */
/* v4.10 ground: the options, as numbers                                */
/*                                                                      */
/* Jan, on his phone, of build 34's paper grain (v4.9 spec A.5): "make  */
/* the background less grainy, it hurts the eyes to see, make it        */
/* another way." The grain goes; the page still carries something, done */
/* another way, and comfortable to look at for a long time. Each option */
/* below is one way, written once as numbers so the board               */
/* (build-board.mjs) draws exactly what the audit (measure.mjs) reads.  */
/*                                                                      */
/* Every value is a GREY LEVEL, 0 to 255, R = G = B (check-contrast's   */
/* ONE HUE: no cream, no warm paper). The accent never appears here: the */
/* only red on these screens is the v4.9 pen, drawn from its own marks. */
/* Geometry is in points on the board's 440 x 956 phone.                 */
/*                                                                      */
/* Each option says:                                                    */
/*   page   whether the page's own ground (the first child of the root,  */
/*          where Paper sits today) shows it;                           */
/*   bars   what the opaque bars (status strip, top bar, tab bar slab)  */
/*          draw: 'slice' is the same screen-sized picture cut at the   */
/*          bar's own place, so bar and page meet without a step;       */
/*          'plain' is the page white; 'tile' is v4.9's own tiling;     */
/*   under  the darkest and lightest levels any text, glyph or control  */
/*          can land on, which is what the contrast audit measures.     */
/* ==================================================================== */

export const W = 440;
export const H = 956;

/** Smoothstep: flat at both ends, so a ramp has no knee for the eye to find (no Mach band where it starts or stops). */
export const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const lv = (v) => Math.round(v * 100) / 100;
const rgb = (v) => `rgb(${lv(v)},${lv(v)},${lv(v)})`;
export const hex = (v) => '#' + Math.round(v).toString(16).padStart(2, '0').repeat(3).toUpperCase();

/* ---- A. Studio sweep -------------------------------------------------- */
/* The seamless paper of the photo studio the drinks are shot on: white  */
/* at the top, a whisper of grey settling toward the floor. Vertical     */
/* only, screen-anchored, smoothstep from `from` of the height to the    */
/* foot. Its top 40% is pure white, so every top bar is untouched.       */
export const SWEEP = { from: 0.4, foot: 248 };
export const sweepAt = (t, s = SWEEP) => 255 - (255 - s.foot) * smooth((t - s.from) / (1 - s.from));

/* ---- B. Window light ------------------------------------------------- */
/* The same falloff as a light from the top-left corner: radial, so the  */
/* bottom right is the greyest point. The ellipse is the screen's own    */
/* proportion, sized so the far corner sits at 100%.                     */
export const WINDOW = { from: 0.42, foot: 248, rx: 1.42 * W, ry: 1.42 * H };

/* ---- C. Top fade (the bars only) ------------------------------------- */
/* The page stays plain white; only the status strip and the top bar     */
/* carry a soft fade, darkest at the screen's top edge and white at the  */
/* bar's own foot, so content passes under a bar with no edge.           */
export const TOPFADE = { top: 242 };

/* ---- D. Ruled ledger -------------------------------------------------- */
/* A hairline every `pitch` pt and one margin rule in the left gutter,    */
/* on the page only (the bars stay a plain head band). The line is the   */
/* lightest grey that keeps lineControl over 3:1 where a glyph crosses   */
/* it (#F0F0F0: 3.03:1; #EFEFEF is 2.999).                               */
export const LEDGER = { pitch: 32, line: 240, weight: 0.5, marginX: 12, margin: 227 };

/* ---- E. Dot grid ------------------------------------------------------ */
/* A 1pt dot every 24pt, on the 16pt feed gutter, page only.             */
export const DOTS = { pitch: 24, origin: 16, d: 1, level: 227 };

/* ---- F. The s, watermarked -------------------------------------------- */
/* The app icon's s (brand/paths.ts MARK_PATH), very large and very      */
/* light in the lower right, bleeding off the edge and under the tab     */
/* bar: one low-frequency shape, nothing that repeats. `size` is the s's */
/* larger ink side (Mark's own `size`); (cx, cy) its optical centre.      */
export const MARKW = { size: 340, cx: 372, cy: 752, level: 244 };

/** The options in board order. `under` is [darkest, lightest] level text can sit on. */
export const GROUNDS = [
  {
    id: 'white',
    letter: '0',
    title: 'Plain white (v4.8)',
    line: 'No ground at all: what every screen was before the paper.',
    page: false,
    bars: 'plain',
    under: [255, 255],
  },
  {
    id: 'grain',
    letter: '·',
    title: 'Today: the grain (v4.9, build 34)',
    line: 'The tile Jan says hurts: 2.4pt tooth at +-1.2%, mean #FBFBFB, darkest #F4F4F4.',
    page: true,
    bars: 'tile',
    under: [244, 255],
  },
  {
    id: 'sweep',
    letter: 'A',
    title: 'A · Studio sweep',
    line: `White to ${SWEEP.from * 100}% of the height, then a smoothstep to ${hex(SWEEP.foot)} at the foot. Vertical, screen-anchored.`,
    page: true,
    bars: 'slice',
    under: [SWEEP.foot, 255],
  },
  {
    id: 'window',
    letter: 'B',
    title: 'B · Window light',
    line: `Radial from the top-left corner: white to ${WINDOW.from * 100}%, then down to ${hex(WINDOW.foot)} in the far corner.`,
    page: true,
    bars: 'slice',
    under: [WINDOW.foot, 255],
  },
  {
    id: 'topfade',
    letter: 'C',
    title: 'C · Top fade, the bars only',
    line: `A plain white page; the status strip and top bar fade from ${hex(TOPFADE.top)} at the screen's edge to white at the bar's foot.`,
    page: false,
    bars: 'slice',
    under: [TOPFADE.top, 255],
  },
  {
    id: 'ledger',
    letter: 'D',
    title: 'D · Ruled ledger',
    line: `A ${LEDGER.weight}pt ${hex(LEDGER.line)} line every ${LEDGER.pitch}pt and a ${hex(LEDGER.margin)} margin rule at x ${LEDGER.marginX}; page only.`,
    page: true,
    bars: 'plain',
    under: [LEDGER.line, 255],
  },
  {
    id: 'dots',
    letter: 'E',
    title: 'E · Dot grid',
    line: `A ${DOTS.d}pt ${hex(DOTS.level)} dot every ${DOTS.pitch}pt from (${DOTS.origin}, ${DOTS.origin}); page only.`,
    page: true,
    bars: 'plain',
    under: [DOTS.level, 255],
  },
  {
    id: 'mark',
    letter: 'F',
    title: 'F · The s, watermarked',
    line: `The icon's s at ${MARKW.size}pt in ${hex(MARKW.level)}, its centre at (${MARKW.cx}, ${MARKW.cy}), off the right edge and under the tab bar.`,
    page: true,
    bars: 'slice',
    under: [MARKW.level, 255],
  },
];

/*
 * Tuning A, rendered beside the options but not one of them. The first
 * look drew A's foot at #F8F8F8; the checks moved it three levels
 * lighter, to #FBFBFB (PICK, the recommendation), because a wash row
 * resting on an #F8F8F8 foot is 1.03:1 and visibly loses its fill, and
 * #FBFBFB holds it at 1.05:1, the figure v4.9 A.5 accepted on the
 * paper's mean. #F6F6F6 shows the far side: a wash there is 1.01:1. And
 * the pick drawn from the PNG the app ships, to prove the asset route
 * draws what the CSS gradient drew. Chrome dithers a CSS gradient and
 * does not dither a stretched image, so the PNG shot is the honest
 * preview of the device.
 *
 * That row first drew tools/sweep-png.mjs's 4 x 256 stepped ramp, whose
 * four one-level steps were the bands in structure.png's last column.
 * The build ships a PRE-DITHERED ramp instead (specs/v4.10/spec.md G.2):
 * assets/details/ground.png, 440 x 574, written by
 * scripts/build-ground.mjs, which covers only the lower 60% of the
 * screen. So the row now reads that very file, laid as Paper lays it
 * (`box`: from 40% of the 956pt height, 573.6pt tall, 1 px a point),
 * stretched like a React Native Image with resizeMode="stretch".
 *
 * NEAREST-NEIGHBOUR, NOT CHROME'S SMOOTH UPSCALE (`pixelated`).
 * Headless Chrome (--disable-gpu) upscales an image on the CPU in a way
 * that averages a dither and then drops the fraction: drawn smooth at
 * 2x, this file's rows came out flat, up to a whole level darker than
 * their own mean, with steps where the dither had none (probed 28 Oct,
 * every texel exact at 1x and with image-rendering: pixelated). That is
 * Chrome's rasteriser, not the asset: on the phone the PNG is a bundled
 * file shown at its own size by a UIImageView, which Core Animation
 * stretches on the GPU with linear filtering. So the board draws each
 * texel as a 2 x 2 block, as it lands as 3 x 3 device pixels at 3x: the
 * levels the file holds, exactly, with the most speckle it can show.
 */
export const PICK = { from: 0.4, foot: 251 };
export const TUNING = [
  { id: 'sweep251', title: 'A at #FBFBFB (the pick)', line: 'The sweep with its foot three levels lighter: a wash on it stays 1.05:1.', sweep: PICK, page: true, bars: 'slice', under: [PICK.foot, 255] },
  { id: 'sweep246', title: 'A at #F6F6F6 (too far)', line: 'Two levels darker than the first look: a wash at the foot is 1.01:1 and stops reading.', sweep: { from: 0.4, foot: 246 }, page: true, bars: 'slice', under: [246, 255] },
  {
    id: 'sweeppng',
    title: 'A at #FBFBFB, the shipped PNG',
    line: 'assets/details/ground.png: the pre-dithered 440 x 574 grey PNG, stretched over the lower 60% of the screen.',
    png: '../../../../assets/details/ground.png',
    box: { top: PICK.from * H, height: (1 - PICK.from) * H },
    pixelated: true,
    page: true,
    bars: 'slice',
    under: [PICK.foot, 255],
  },
];

/* ==================================================================== */
/* CSS for the board: each option as one picture of the 440 x 956       */
/* screen (a gradient or an SVG), which the bars cut at their place.    */
/* ==================================================================== */

const svgURL = (svg) => `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;

/** Stops every 2% of a ramp, so Chrome draws the smoothstep and not a straight line between two stops. */
function stops(at, unit = '%', span = 100) {
  const out = [];
  for (let i = 0; i <= 50; i++) {
    const p = (i / 50) * span;
    out.push(`${rgb(at(p / span))} ${lv(p)}${unit}`);
  }
  return out.join(', ');
}

/**
 * The CSS background-image for an option on a screen whose top bar ends
 * at `barFoot` (the top fade ends there), or null for none.
 */
export function cssImage(id, { barFoot = 114, markPath = null, grain = '', sweep = SWEEP, png = '' } = {}) {
  switch (id) {
    case 'white':
      return null;
    case 'grain':
      return grain;
    case 'sweep':
      return png ? `url(${png})` : `linear-gradient(180deg, ${stops((t) => sweepAt(t, sweep))})`;
    case 'window': {
      const w = WINDOW;
      const at = (t) => 255 - (255 - w.foot) * smooth((t - w.from) / (1 - w.from));
      return `radial-gradient(${w.rx}px ${w.ry}px at 0px 0px, ${stops(at)})`;
    }
    case 'topfade': {
      const at = (t) => TOPFADE.top + (255 - TOPFADE.top) * smooth(t);
      return `linear-gradient(180deg, ${stops(at, 'px', barFoot)}, rgb(255,255,255) ${barFoot}px)`;
    }
    case 'ledger': {
      const L = LEDGER;
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
        `<defs><pattern id="l" width="${W}" height="${L.pitch}" patternUnits="userSpaceOnUse">` +
        `<rect x="0" y="${L.pitch - L.weight}" width="${W}" height="${L.weight}" fill="${hex(L.line)}"/></pattern></defs>` +
        `<rect width="${W}" height="${H}" fill="url(#l)"/>` +
        `<rect x="${L.marginX}" y="0" width="${L.weight}" height="${H}" fill="${hex(L.margin)}"/></svg>`;
      return svgURL(svg);
    }
    case 'dots': {
      const D = DOTS;
      const o = D.origin - D.pitch / 2;
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
        `<defs><pattern id="d" x="${o}" y="${o}" width="${D.pitch}" height="${D.pitch}" patternUnits="userSpaceOnUse">` +
        `<circle cx="${D.pitch / 2}" cy="${D.pitch / 2}" r="${D.d / 2}" fill="${hex(D.level)}"/></pattern></defs>` +
        `<rect width="${W}" height="${H}" fill="url(#d)"/></svg>`;
      return svgURL(svg);
    }
    case 'mark': {
      const { d, ink, optical } = markPath;
      const k = MARKW.size / Math.max(ink[2] - ink[0], ink[3] - ink[1]);
      const tx = MARKW.cx - optical[0] * k;
      const ty = MARKW.cy - optical[1] * k;
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
        `<path d="${d}" fill="${hex(MARKW.level)}" transform="translate(${lv(tx)} ${lv(ty)}) scale(${k.toFixed(5)})"/></svg>`;
      return svgURL(svg);
    }
    default:
      throw new Error(`no ground ${id}`);
  }
}
