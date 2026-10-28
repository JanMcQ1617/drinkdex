/**
 * The paper: the studio sweep behind the page (v4.10, specs/v4.10/spec.md
 * G). Of build 34's textured paper (v4.9 A.5), Jan said it hurt the eyes
 * to see, and asked for the background another way. The texture is gone;
 * this draws what replaced it, the one picture details/Paper.tsx stretches.
 *
 * A port of specs/v4.10/ground/tools/sweep-png.mjs, which drew the board's
 * ramp, on build-paper.mjs's pattern (the script it replaces): its own CRC
 * and chunk writer, no dependency, and a --check that writes nothing.
 *
 * WHAT IT WRITES
 *
 *   assets/details/ground.png   440 x 574 px, 8-bit grey, about 1.6 KB
 *
 * One file, with no @2x or @3x, because it is stretched: 1 px a point
 * over the lower 60% of the tallest window (956 x 0.6, rounded). Paper
 * lays it from 40% of the window's height to the foot, cut at each box's
 * own window y, so every Paper shows the same window-anchored sweep.
 *
 * THE SWEEP. level(t) = 255 - 4 * smoothstep((t - 0.40) / 0.60), with t
 * the window y over the window's height and smoothstep(u) = u^2 (3 - 2u)
 * clamped to 0..1: white to 40%, then easing to #FBFBFB, LOCKED, at the
 * foot. Flat at both ends, so no Mach band marks where it starts or
 * stops. Neutral (R = G = B), no token and no cream, so check-contrast's
 * one hue holds; its darkest pixel is #FBFBFB, v4.9's texture's MEAN, so no
 * pair falls below what v4.9 accepted (spec G.6).
 *
 * PRE-DITHERED, never a stepped ramp. In 8 bits the sweep is four
 * one-level steps, and a stretched image is not dithered by the GPU, so
 * each step would be a full-width line at 53, 65, 75 and 87% of the
 * height. Instead row y holds the curve at t = 0.40 + 0.60 (y + 0.5) / 574
 * and every pixel is ordered-dithered against the standard 8 x 8 Bayer
 * matrix: floor(L), plus 1 where frac(L) > (B[y mod 8][x mod 8] + 0.5) / 64,
 * clamped to 251..255. Each texel lands as 3 x 3 device pixels at 3x; the
 * half-level speckle is about 22 cycles a degree at 40cm, far above the
 * band where build 34's texture hurt (7 to 12) and far below its +-1.2%.
 *
 * What that gives, and what --check holds it to:
 *
 *   - row 0 all 255 and row 573 all 251, and nothing outside 251..255;
 *   - every run of 8 rows (one period of the dither, all 64 thresholds,
 *     55 times across the width) averages within 1/16 of a level of the
 *     curve over those rows. The build measures 0.033 at worst: the 64
 *     thresholds alone would give 1/128, and the rest is the curve's own
 *     fall across the eight rows (up to 0.08 of a level where it is
 *     steepest), which each row's thresholds sample at its own height.
 *     A SINGLE row cannot be held to 1/64 (the figure spec G.2 first
 *     gave): one row of an 8 x 8 Bayer matrix has only 8 thresholds, so
 *     its mean moves in eighths, and row 0's run 0.5 to 42.5 of 64,
 *     leaving a gap of 21.5 at the top, so a row's mean can sit a third
 *     of a level (0.332) off the curve. That is the speckle, not a band;
 *     the 8-row figure is the one the eye integrates;
 *   - no two adjacent rows' means differ by a full level, so there is no
 *     contour line anywhere.
 *
 * THE FILE. IHDR (colour type 0, bit depth 8, no alpha), then sRGB
 * (intent 0, so the levels are read as the sRGB greys check-contrast
 * measures), then one IDAT (zlib level 9, filter 0 on every row), then
 * IEND. Nothing else: no gAMA, no pHYs, no time. Deterministic: no seed,
 * no clock, the same bytes on every run.
 *
 * Run:    node scripts/build-ground.mjs
 *         node scripts/build-ground.mjs --check   write nothing; exit 1 if the
 *                                                  sweep is stale, off its curve,
 *                                                  or v4.9's paper files are back
 */
import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = 'assets/details/ground.png';
const CHECK = process.argv.includes('--check');

export const GROUND = {
  /** Points across the widest window, at 1 px a point (the stretch covers narrower ones). */
  width: 440,
  /** The lower 60% of the tallest window, 956pt, at 1 px a point: 573.6, rounded. */
  height: Math.round(956 * 0.6),
  /** Where the sweep leaves white, as a fraction of the window's height. Paper's RAMP_FROM. */
  from: 0.4,
  /** The foot: #FBFBFB, locked (spec G.1). The only fallback is plain white. */
  foot: 251,
};

/** v4.9's paper (A.5), retired by the sweep: --check fails while either file is still in the tree. */
const RETIRED = ['assets/details/paper@2x.png', 'assets/details/paper@3x.png'];

/** The standard 8 x 8 Bayer matrix, 0..63: B2n = [[4B, 4B + 2], [4B + 3, 4B + 1]] from B1 = [[0]]. */
export const BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

const smoothstep = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** The sweep's grey level at `t`, the window y over the window's height (0 at the top). */
export const level = (t) => 255 - (255 - GROUND.foot) * smoothstep((t - GROUND.from) / (1 - GROUND.from));

/** The curve at the centre of row `y` of the image. */
export const rowLevel = (y) => level(GROUND.from + ((1 - GROUND.from) * (y + 0.5)) / GROUND.height);

/** The dithered field, row by row: one grey byte a pixel. */
export function groundPixels() {
  const { width: w, height: h } = GROUND;
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const L = rowLevel(y);
    const base = Math.floor(L);
    const frac = L - base;
    const B = BAYER[y % 8];
    for (let x = 0; x < w; x++) {
      const v = base + (frac > (B[x % 8] + 0.5) / 64 ? 1 : 0);
      px[y * w + x] = Math.min(255, Math.max(GROUND.foot, v));
    }
  }
  return px;
}

/* ------------------------------ PNG -------------------------------- */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** An 8-bit grey PNG (colour type 0) of `px`: IHDR, sRGB (intent 0), one IDAT (filter 0 on every row), IEND. */
export function pngOf(px, w = GROUND.width, h = GROUND.height) {
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0;
    raw.set(px.subarray(y * w, (y + 1) * w), y * (w + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // colour type 0: grey, no alpha
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('sRGB', Buffer.from([0])),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Read a PNG this script could have written back to its grey bytes, so the
 * checks below measure the SHIPPED file and not only the generator. Anything
 * else (another chunk, colour type, depth or filter) is reported, never read.
 */
export function readGround(bytes) {
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) return { error: 'not a PNG' };
  const types = [];
  let ihdr = null;
  const idat = [];
  for (let o = 8; o < bytes.length; ) {
    const len = bytes.readUInt32BE(o);
    const type = bytes.toString('latin1', o + 4, o + 8);
    const data = bytes.subarray(o + 8, o + 8 + len);
    types.push(type);
    if (type === 'IHDR') ihdr = data;
    if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  if (types.join(' ') !== 'IHDR sRGB IDAT IEND') return { error: `chunks are ${types.join(' ')}, not IHDR sRGB IDAT IEND` };
  const w = ihdr.readUInt32BE(0);
  const h = ihdr.readUInt32BE(4);
  if (ihdr[8] !== 8 || ihdr[9] !== 0) return { error: `bit depth ${ihdr[8]}, colour type ${ihdr[9]}, not 8-bit grey` };
  const raw = zlib.inflateSync(Buffer.concat(idat));
  if (raw.length !== (w + 1) * h) return { error: 'IDAT is not one filter byte and one grey byte a pixel' };
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    if (raw[y * (w + 1)] !== 0) return { error: `row ${y} uses filter ${raw[y * (w + 1)]}, not 0` };
    px.set(raw.subarray(y * (w + 1) + 1, (y + 1) * (w + 1)), y * w);
  }
  return { w, h, px };
}

/** How far the field strays from the curve: see the header for what each figure holds. */
export function measure(px, w = GROUND.width, h = GROUND.height) {
  const hist = new Map();
  for (const v of px) hist.set(v, (hist.get(v) || 0) + 1);
  const mean = (y) => {
    let s = 0;
    for (let x = 0; x < w; x++) s += px[y * w + x];
    return s / w;
  };
  const means = Array.from({ length: h }, (_, y) => mean(y));
  let band = 0;
  for (let y = 0; y + 8 <= h; y++) {
    let m = 0;
    let c = 0;
    for (let k = 0; k < 8; k++) {
      m += means[y + k];
      c += rowLevel(y + k);
    }
    band = Math.max(band, Math.abs(m - c) / 8);
  }
  let row = 0;
  let step = 0;
  for (let y = 0; y < h; y++) {
    row = Math.max(row, Math.abs(means[y] - rowLevel(y)));
    if (y > 0) step = Math.max(step, Math.abs(means[y] - means[y - 1]));
  }
  const all = (y, v) => px.subarray(y * w, (y + 1) * w).every((p) => p === v);
  return { hist, band, row, step, top: all(0, 255), foot: all(h - 1, GROUND.foot) };
}

/** Every value --check holds, as failures (empty when the sweep is right). */
function failures(m) {
  const out = [];
  const outside = [...m.hist.keys()].filter((v) => v < GROUND.foot || v > 255);
  if (outside.length) out.push(`levels outside ${GROUND.foot}..255: ${outside.sort((a, b) => a - b).join(', ')}`);
  if (!m.top) out.push('row 0 is not all 255');
  if (!m.foot) out.push(`row ${GROUND.height - 1} is not all ${GROUND.foot}`);
  if (m.band > 1 / 16) out.push(`an 8-row band strays ${m.band.toFixed(4)} of a level from the curve (limit 1/16)`);
  if (m.step >= 1) out.push(`two adjacent rows' means differ by ${m.step.toFixed(3)} of a level: a contour line`);
  return out;
}

/* ---- Write, or check ------------------------------------------------ */

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const px = groundPixels();
  const bytes = pngOf(px);
  const file = join(ROOT, OUT);
  const report = (m) =>
    `${GROUND.width} x ${GROUND.height} px · levels ${[...m.hist.keys()].sort((a, b) => a - b).join(' ')} · ` +
    `8-row bands within ${m.band.toFixed(4)} of the curve, single rows ${m.row.toFixed(3)}, adjacent rows ${m.step.toFixed(3)}`;
  if (CHECK) {
    const problems = [];
    let shipped = null;
    try {
      shipped = readFileSync(file);
    } catch {
      problems.push(`${OUT} is missing`);
    }
    if (shipped) {
      if (!shipped.equals(bytes)) problems.push(`${OUT} differs from this script's sweep`);
      const read = readGround(shipped);
      if (read.error) problems.push(`${OUT}: ${read.error}`);
      else if (read.w !== GROUND.width || read.h !== GROUND.height) problems.push(`${OUT} is ${read.w} x ${read.h}, not ${GROUND.width} x ${GROUND.height}`);
      else for (const f of failures(measure(read.px))) problems.push(`${OUT}: ${f}`);
    }
    // The generator itself, so a drifted formula fails here even before the file is rebuilt from it.
    for (const f of failures(measure(px))) problems.push(`the generator: ${f}`);
    for (const rel of RETIRED) if (existsSync(join(ROOT, rel))) problems.push(`${rel} is still in the tree (v4.9's paper, retired in v4.10)`);
    if (problems.length) {
      for (const p of problems) console.error(`  ${p}`);
      console.error(`\n  build-ground: ${problems.length} problem(s). Run node scripts/build-ground.mjs, and delete v4.9's paper files.\n`);
      process.exit(1);
    }
    console.log(`  ${OUT}  ${report(measure(px))}`);
    console.log('\n  build-ground: the sweep matches its curve.\n');
  } else {
    const problems = failures(measure(px));
    if (problems.length) {
      for (const p of problems) console.error(`  the generator: ${p}`);
      console.error('\n  build-ground: nothing written.\n');
      process.exit(1);
    }
    mkdirSync(join(ROOT, 'assets/details'), { recursive: true });
    writeFileSync(file, bytes);
    console.log(`  ${OUT}  ${bytes.length.toLocaleString('en-US')} bytes · ${report(measure(px))}`);
    const left = RETIRED.filter((rel) => existsSync(join(ROOT, rel)));
    if (left.length) console.log(`\n  v4.9's paper files are still in the tree: ${left.join(', ')}. --check fails until they are deleted.`);
    console.log('\n  Ground rebuilt.\n');
  }
}
