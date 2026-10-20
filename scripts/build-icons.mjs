/**
 * Renders every brand raster the app ships, and the path data the app
 * draws its logo with, from one source of truth: the three outlined SVGs
 * in scripts/icon/.
 *
 *   mark.svg          the icon's s on its own: the wordmark's s, no drip,
 *                     turned 9 degrees (the tag thrown on), in a square
 *                     viewBox centred on its optical centre
 *   wordmark.svg      "sipply" with the y's swash drip
 *   wordmark-sm.svg   the same lockup without the drip, for anything under
 *                     40pt tall (the drip's bead fills in there)
 *
 * They are copies of specs/v4.5-logo/final/, drawn by the generator in
 * specs/v4.5-logo/scribble/source/ ("Marker tag, cleaner icon", Jan, 20
 * Oct 2026; notes.md there has how they are drawn). Redraw the logo there,
 * copy the three files here, run this. Nothing below is hand-placed art.
 *
 * WHAT IT WRITES
 *
 *   assets/images/icon.png                  1024, opaque: the white s on Campari
 *   assets/images/icon-dark.png             1024, the Campari s on transparent (iOS 18 dark)
 *   assets/images/icon-tinted.png           1024, opaque grey: the white s on black (iOS 18 tinted)
 *   assets/images/splash-icon.png           1024, the Campari s on transparent, at the splash's 56%
 *   assets/images/android-icon-foreground.png  the white s inside the 66dp safe circle
 *   assets/images/android-icon-background.png  flat Campari
 *   assets/images/android-icon-monochrome.png  the foreground's s, for themed icons
 *   assets/images/favicon.png               48, opaque: the icon tile
 *   docs/img/icon.png                       512, opaque: the icon tile, for the site
 *   src/components/brand/paths.ts           the three SVGs' path data and boxes, for
 *                                           brand/Wordmark.tsx and brand/Mark.tsx
 *
 * THE PLACEMENT IS final.js's, PORTED. Each raster puts the s's optical
 * centre (halfway between its area centroid and its bbox centre: the
 * centroid alone sits it low) 0.8% of the tile above the middle, at a
 * stated share of the canvas. The numbers below are the generator's, and
 * the fill is Pillow's (see coverage()), so this script's output matches
 * specs/v4.5-logo/final/ up to the SVGs' two-decimal rounding. The one
 * file that deliberately differs is the tinted icon: see TINTED.
 *
 * NO BROWSER. The SVGs are straight-edged polygons (M, L and Z only, the
 * outliner's output), so they are filled here on an 8x supersampled grid
 * and box-reduced, exactly as the generator's raster.py does with Pillow,
 * and written as PNG through node:zlib. The old pipeline screenshotted HTML in headless Chrome to get
 * CSS placement right; with the placement now arithmetic, a browser would
 * only add a dependency and a second anti-aliasing to disagree with.
 *
 * Run: node scripts/build-icons.mjs           write everything
 *      node scripts/build-icons.mjs --check   exit 1 if any output is stale
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ICON = join(ROOT, 'scripts/icon');
const CHECK = process.argv.includes('--check');

/** Campari (theme.ts `accent`) and the page. The rasters cannot import theme.ts, so they are restated; check below. */
const RED = [0xd0, 0x10, 0x2c];
const WHITE = [0xff, 0xff, 0xff];

/*
 * Placement, from specs/v4.5-logo/scribble/source/final.js (variant C9).
 *
 *   FILL     the s's larger bbox side as a share of the icon tile. 70%:
 *            without the drip there is nothing to leave room for, and at
 *            29@1x it still reads as a plain s.
 *   SPLASH   the same on the splash canvas. app.json draws that canvas
 *            220pt wide, so 56% makes the s about 123pt on screen, the
 *            size the intro film was planned around.
 *   LIFT     the optical centre's rise above the middle, of the canvas.
 *   SAFE     Android's adaptive icon is 108dp and a circular mask keeps a
 *            66dp circle; the s's farthest point is set at 94.5% of that
 *            radius (296 of 313 px), so no launcher mask shaves it.
 */
const FILL = 0.7;
const SPLASH = 0.56;
const LIFT = 0.008;
const SAFE_R = (1024 * (66 / 108)) / 2;
const SAFE_USE = 0.945;
/** The supersampling factor per axis: 64 samples a pixel, as raster.py. */
const SS = 8;

/* ---- The SVGs ------------------------------------------------------- */

/** One outlined SVG: its viewBox, its path data as written, and the closed polygons it draws. */
function readSvg(name) {
  const svg = readFileSync(join(ICON, name), 'utf8');
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1].split(/\s+/).map(Number);
  const d = svg.match(/<path[^>]*\sd="([^"]+)"/)?.[1];
  if (!viewBox || viewBox.length !== 4 || !d) throw new Error(`scripts/icon/${name}: no viewBox or no <path d>`);
  if ((svg.match(/<path/g) ?? []).length !== 1) throw new Error(`scripts/icon/${name}: expected one <path>`);
  // The outliner writes absolute M/L/Z only. Anything else is a hand edit this filler cannot read.
  if (/[^MLZ\d\s.\-e]/.test(d)) throw new Error(`scripts/icon/${name}: path uses commands other than M, L, Z`);
  const polys = d
    .split('Z')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) =>
      s
        .replace(/^M/, '')
        .split('L')
        .map((pt) => pt.trim().split(/\s+/).map(Number)),
    );
  return { viewBox, d, polys };
}

function bbox(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) for (const [x, y] of p) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/** The area centroid, holes counted by their winding (nonzero, as the SVG fills). */
function centroid(polys) {
  let A = 0, X = 0, Y = 0;
  for (const p of polys) for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    const c = x1 * y2 - x2 * y1;
    A += c; X += (x1 + x2) * c; Y += (y1 + y2) * c;
  }
  return [X / (3 * A), Y / (3 * A)];
}

/** final.js's optical centre: halfway between the centroid and the bbox centre. */
function optical(polys) {
  const b = bbox(polys);
  const [gx, gy] = centroid(polys);
  return [(gx + b.x0 + b.w / 2) / 2, (gy + b.y0 + b.h / 2) / 2];
}

/** The s with its larger bbox side `size` px and its optical centre at (cx, cy). */
function place(polys, size, cx, cy) {
  const b = bbox(polys);
  const [ox, oy] = optical(polys);
  const k = size / Math.max(b.w, b.h);
  return polys.map((p) => p.map(([x, y]) => [cx + (x - ox) * k, cy + (y - oy) * k]));
}

/** The farthest outline point from the optical centre, at `size`. */
function reach(polys, size) {
  const b = bbox(polys);
  const [ox, oy] = optical(polys);
  const k = size / Math.max(b.w, b.h);
  let r = 0;
  for (const p of polys) for (const [x, y] of p) r = Math.max(r, Math.hypot(x - ox, y - oy) * k);
  return r;
}

/* ---- Filling -------------------------------------------------------- */

/*
 * Coverage of `polys` (in 1024-canvas units) on a size x size grid, 0 to
 * 255, filled the way Pillow's ImageDraw.polygon fills (raster.py's mask):
 * on the 8x grid each vertex is truncated to a whole subsample, a
 * subsample's centre is its integer coordinate, every scanline is taken
 * at a whole row with each edge's two end rows included, and a span runs
 * from its left crossing rounded half up to its right one rounded half
 * down, both ends included. That bias is half a subsample per side, 1/16
 * of a pixel: invisible, but a plain centre-sampled fill comes out that
 * much thinner and differs from final/ by up to 40 levels along every
 * edge. This reproduces raster.py bit for bit from the same polygons
 * (checked against final.js's polys.json), so what is left between this
 * and final/ is only the SVGs' two-decimal rounding.
 *
 * Spans pair crossings in order (even-odd), as Pillow does. The mark is
 * one outline with no holes, which is all this fills.
 */
const roundHalfUp = (f) => (f >= 0 ? Math.floor(f + 0.5) : -Math.floor(Math.abs(f) + 0.5));
const roundHalfDown = (f) => (f >= 0 ? Math.ceil(f - 0.5) : -Math.ceil(Math.abs(f) - 0.5));

function coverage(polys, size, canvas = 1024) {
  const big = size * SS;
  const k = big / canvas;
  const mask = new Uint8Array(big * big);
  const hline = (x0, y, x1) => {
    if (y < 0 || y >= big) return;
    mask.fill(1, Math.max(0, x0) + y * big, Math.min(big - 1, x1) + 1 + y * big);
  };
  for (const p of polys) {
    const xy = p.map(([x, y]) => [Math.trunc(x * k), Math.trunc(y * k)]);
    const edges = [];
    for (let i = 0; i < xy.length; i++) {
      const [x0, y0] = xy[i];
      const [x1, y1] = xy[(i + 1) % xy.length];
      if (x0 === x1 && y0 === y1) continue;
      // float32 slope and crossings, as Pillow's Edge keeps them
      const dx = y0 === y1 ? 0 : Math.fround((x1 - x0) / (y1 - y0));
      edges.push({ x0, y0, dx, xmin: Math.min(x0, x1), xmax: Math.max(x0, x1), ymin: Math.min(y0, y1), ymax: Math.max(y0, y1) });
    }
    let ymin = big - 1;
    let ymax = 0;
    const sloped = [];
    for (const e of edges) {
      ymin = Math.min(ymin, e.ymin);
      ymax = Math.max(ymax, e.ymax);
      if (e.ymin === e.ymax) hline(e.xmin, e.ymin, e.xmax);
      else sloped.push(e);
    }
    ymin = Math.max(0, ymin);
    ymax = Math.min(big, ymax);
    for (let y = ymin; y <= ymax; y++) {
      const xx = [];
      for (const e of sloped) {
        if (y < e.ymin || y > e.ymax) continue;
        xx.push(Math.fround(Math.fround((y - e.y0) * e.dx) + e.x0));
        // An edge's last row counts twice, so a vertex between two edges pairs up
        if (y === e.ymax && y < ymax) xx.push(xx[xx.length - 1]);
      }
      xx.sort((a, b) => a - b);
      let pos = 0;
      for (let i = 1; i < xx.length; i += 2) {
        const end = roundHalfDown(xx[i]);
        if (end < pos) continue;
        const start = Math.max(pos, roundHalfUp(xx[i - 1]));
        if (end < start) continue;
        hline(start, y, end);
        pos = end + 1;
      }
    }
  }
  // Box-reduce, as Pillow's reduce() does: the mean of 64 samples, rounded.
  const cov = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = 0;
      for (let j = 0; j < SS; j++) {
        const row = (y * SS + j) * big + x * SS;
        for (let i = 0; i < SS; i++) n += mask[row + i];
      }
      cov[y * size + x] = Math.floor((n * 255 + 32) / 64);
    }
  }
  return cov;
}

/* ---- Images --------------------------------------------------------- */

/** An opaque tile: `fg` over `bg` through the coverage. */
function tile(cov, size, bg, fg) {
  const px = new Uint8Array(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    for (let ch = 0; ch < 3; ch++) px[i * 3 + ch] = Math.round(bg[ch] + ((fg[ch] - bg[ch]) * cov[i]) / 255);
  }
  return { size, channels: 3, px };
}

/** One colour, the coverage as its alpha (raster.py's glyph(): the colour is kept under alpha 0 too). */
function glyph(cov, size, rgb) {
  const px = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    px[i * 4] = rgb[0]; px[i * 4 + 1] = rgb[1]; px[i * 4 + 2] = rgb[2]; px[i * 4 + 3] = cov[i];
  }
  return { size, channels: 4, px };
}

/** Opaque grey: the coverage itself as the level, so white where the s is and black elsewhere. */
function grey(cov, size) {
  return { size, channels: 1, px: cov };
}

function flat(size, rgb) {
  return tile(new Uint8Array(size * size), size, rgb, rgb);
}

/* ---- PNG ------------------------------------------------------------ */

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/** 8-bit PNG, colour type from the channel count, each row's filter the one with the smallest absolute sum. */
function png({ size, channels, px }) {
  const type = { 1: 0, 2: 4, 3: 2, 4: 6 }[channels];
  const stride = size * channels;
  const raw = Buffer.alloc((stride + 1) * size);
  const prev = new Uint8Array(stride);
  const cand = Array.from({ length: 5 }, () => new Uint8Array(stride));
  for (let y = 0; y < size; y++) {
    const cur = px.subarray(y * stride, (y + 1) * stride);
    const up = y === 0 ? prev : px.subarray((y - 1) * stride, y * stride);
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const o = cand[f];
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? cur[i - channels] : 0;
        const b = up[i];
        const c = i >= channels ? up[i - channels] : 0;
        let pred = 0;
        if (f === 1) pred = a;
        else if (f === 2) pred = b;
        else if (f === 3) pred = (a + b) >> 1;
        else if (f === 4) {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const v = (cur[i] - pred) & 0xff;
        o[i] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    raw[y * (stride + 1)] = best;
    raw.set(cand[best], y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = type; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---- The set -------------------------------------------------------- */

const mark = readSvg('mark.svg');
const word = readSvg('wordmark.svg');
const wordSm = readSvg('wordmark-sm.svg');

// The rasters restate Campari; a retuned accent must be restated here too, not drift silently.
const theme = readFileSync(join(ROOT, 'src/constants/theme.ts'), 'utf8');
const themeAccent = theme.match(/\baccent:\s*'#([0-9A-Fa-f]{6})'/)?.[1].toUpperCase();
const ownAccent = RED.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
if (themeAccent !== ownAccent) {
  throw new Error(`theme.ts's accent is #${themeAccent}; this script paints #${ownAccent}. Restate RED.`);
}
// And the splash's on-screen width, which the drawn intro (SipplyIntro) lines its mark up with.
const app = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'));
const splashPlugin = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen');
const SPLASH_WIDTH = splashPlugin?.[1]?.imageWidth;
if (typeof SPLASH_WIDTH !== 'number') throw new Error('app.json: no expo-splash-screen imageWidth');

const cy = 512 - 1024 * LIFT;
const icon = place(mark.polys, 1024 * FILL, 512, cy);
const splash = place(mark.polys, 1024 * SPLASH, 512, cy);
const androidSize = 1024 * FILL * ((SAFE_R * SAFE_USE) / reach(mark.polys, 1024 * FILL));
const android = place(mark.polys, androidSize, 512, cy);

const icon1024 = coverage(icon, 1024);
const androidCov = coverage(android, 1024);

/*
 * TINTED. final/icon-tinted-1024.png is the white s on transparent, which
 * is how the logo pass handed it over. Expo 57 cannot use that: its iOS
 * icon step (prebuild-config withIosIcons) flattens every appearance but
 * dark onto #ffffff before it writes the asset catalog, so a white s on
 * transparent becomes a white square. iOS tints by luminance, so the
 * tinted icon is the grey s on opaque black: the s takes the tint and the
 * ground stays the dark the system draws behind it.
 */
const OUTPUTS = [
  ['assets/images/icon.png', tile(icon1024, 1024, RED, WHITE)],
  ['assets/images/icon-dark.png', glyph(icon1024, 1024, RED)],
  ['assets/images/icon-tinted.png', grey(icon1024, 1024)],
  ['assets/images/splash-icon.png', glyph(coverage(splash, 1024), 1024, RED)],
  ['assets/images/android-icon-foreground.png', glyph(androidCov, 1024, WHITE)],
  ['assets/images/android-icon-background.png', flat(1024, RED)],
  ['assets/images/android-icon-monochrome.png', glyph(androidCov, 1024, WHITE)],
  // No mask draws the favicon's corners, and a browser tab rounds nothing: the square tile, as final/.
  ['assets/images/favicon.png', tile(coverage(icon, 48), 48, RED, WHITE)],
  ['docs/img/icon.png', tile(coverage(icon, 512), 512, RED, WHITE)],
];

/* ---- The app's path data -------------------------------------------- */

const r2 = (v) => Math.round(v * 100) / 100;
function entry(svg, extra = '') {
  const b = bbox(svg.polys);
  return `{
  /** The outlined path, exactly as the SVG writes it. Nonzero fill: a counter winds the other way. */
  d: '${svg.d}',
  /** The SVG's viewBox: x, y, width, height, in design units. */
  viewBox: [${svg.viewBox.join(', ')}],
  /** The ink's bbox inside it: x0, y0, x1, y1. */
  ink: [${[b.x0, b.y0, b.x1, b.y1].map(r2).join(', ')}],${extra}
}`;
}

const [ox, oy] = optical(mark.polys);
const paths = `/* ==================================================================== */
/* GENERATED by scripts/build-icons.mjs from scripts/icon/*.svg.        */
/* Do not edit: redraw the logo (specs/v4.5-logo/scribble), copy the    */
/* SVGs to scripts/icon/ and run it; --check says if it is current.     */
/*                                                                      */
/* Design units: y down, the wordmark's baseline at 200 and its         */
/* x-height top at 100 (an x-height of 100 units).                      */
/* ==================================================================== */

/** The wordmark's baseline and x-height top, in its design units. */
export const WORDMARK_BASELINE = 200;
export const WORDMARK_X_TOP = 100;

/** "sipply" with the y's swash drip. */
export const WORDMARK_PATH = ${entry(word)} as const;

/** The same lockup without the drip, drawn under 40pt tall. Same letters, same units; its box ends above the drip. */
export const WORDMARK_SM_PATH = ${entry(wordSm)} as const;

/** The icon's s alone, turned 9 degrees, in a square viewBox centred on its optical centre. */
export const MARK_PATH = ${entry(mark, `
  /** The optical centre the viewBox is centred on. */
  optical: [${[ox, oy].map(r2).join(', ')}],`)} as const;

/**
 * The launch screen, as app.json and build-icons draw it: the splash
 * canvas is \`width\` pt wide, centred on the screen, and the s's larger
 * side is \`fill\` of it, its optical centre \`lift\` of it above the middle.
 */
export const SPLASH_MARK = { width: ${SPLASH_WIDTH}, fill: ${SPLASH}, lift: ${LIFT} } as const;
`;
OUTPUTS.push(['src/components/brand/paths.ts', paths]);

/* ---- Write, or check ------------------------------------------------ */

let stale = 0;
for (const [rel, img] of OUTPUTS) {
  const bytes = typeof img === 'string' ? Buffer.from(img) : png(img);
  const file = join(ROOT, rel);
  if (CHECK) {
    let same = false;
    try {
      same = readFileSync(file).equals(bytes);
    } catch {
      same = false;
    }
    if (!same) {
      stale++;
      console.error(`  stale  ${rel}`);
    }
  } else {
    writeFileSync(file, bytes);
    console.log(`  ${rel}`);
  }
}

if (CHECK) {
  if (stale) {
    console.error(`\n  build-icons: ${stale} output(s) differ from scripts/icon/*.svg. Run node scripts/build-icons.mjs.\n`);
    process.exit(1);
  }
  console.log(`\n  build-icons: all ${OUTPUTS.length} outputs match scripts/icon/*.svg.\n`);
} else {
  console.log('\n  Brand rasters and paths rebuilt.\n');
}
