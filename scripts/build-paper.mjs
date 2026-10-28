/**
 * The paper: the faint grain behind the page (v4.9, specs/v4.9/details/
 * spec.md A.5). Jan picked "a faint paper grain behind everything" as one
 * of three ways the app could stop feeling empty; this draws its tile.
 *
 * A port of specs/v4.9/details/tools/grain.mjs, which drew the board's
 * tiles: the same field, the same seed, the same bytes, so what ships is
 * what was judged (the board's assets and these are identical files).
 *
 * WHAT IT WRITES
 *
 *   assets/details/paper@2x.png   256 px, about 25 KB
 *   assets/details/paper@3x.png   384 px, about 53 KB
 *
 * Each is a seamless 128 x 128 pt tile of BLACK AT A LOW ALPHA (grey 0
 * plus alpha, PNG colour type 4), so it is drawn over the page's own
 * white and changes nothing else: no new colour token, no cream, no warm
 * paper. R = G = B wherever it lands, so check-contrast's one hue holds.
 * details/Paper.tsx lays it as a grid of plain tiles (never a repeating
 * image: UIKit pre-renders those into a screen-sized backing store).
 *
 *   tooth   periodic value noise on the tile's torus, cells of 4.8, 2.4
 *           and 1.2pt (+-0.6%, +-1.2%, +-0.6%), plus +-0.4% grit
 *   fibre   30 short hairline arcs a tile, 0.35pt, 3 to 9pt long, +1.6%
 *           at their middle, drawn with wrap so the tile stays seamless
 *
 * No flecks (judging, 28 Oct): the nine pressed specks a tile were the
 * darkest pixels, and across a big empty screen they read as dust on the
 * glass, repeating on the tile's 128pt lattice.
 *
 * SEEN, NOT FELT (bolder pass, 28 Oct). At 3.2 and 1.2pt cells and
 * +-0.65% the grain was below the eye's threshold on a device at arm's
 * length: those cells are 17 to 47 cycles a degree at 50cm, where the eye
 * needs several percent. The tooth centres on a 2.4pt cell at +-1.2%
 * (with 4.8pt at +-0.6% under it), 7 to 12 cycles a degree, where the eye
 * is most sensitive, so it reads as a sheet's tooth. Not lower: cells of
 * 8 to 13pt (a pulp's clouds) showed the 128pt tile as a repeating
 * lattice of blotches, which reads as a dirty screen. If a device shows
 * the grain as dirt, the step back is the 2.4pt octave to +-0.9% (one
 * number, below), and it goes to Jan before it ships.
 *
 * MEAN 1.6% black (the page reads #FBFBFB on average), and NO PIXEL OVER
 * 5.5% (#F1F1F1 at worst; the darkest is about 4.1% at 2x and 4.3% at 3x,
 * #F4F4F4), which keeps the faintest control edge (lineControl) over 3:1
 * on the darkest speck and textMuted over 5.9:1 even at the clamp (spec
 * G). Deterministic: a fixed seed, a fixed PRNG (mulberry32), no clock.
 *
 * Run:    node scripts/build-paper.mjs
 *         node scripts/build-paper.mjs --check   write nothing; exit 1 if either tile is stale
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = 'assets/details';
const CHECK = process.argv.includes('--check');

export const PAPER = {
  tile: 128,
  seed: 0x5199,
  mean: 0.016,
  max: 0.055,
  tooth: [
    { cell: 4.8, amp: 0.006 },
    { cell: 2.4, amp: 0.012 },
    { cell: 1.2, amp: 0.006 },
  ],
  grit: 0.004,
  fibres: { count: 30, alpha: 0.016, width: 0.35, len: [3, 9] },
  flecks: { count: 0, alpha: 0.03, r: [0.18, 0.4] },
};

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Periodic value noise on the tile's torus, -1..1, at `cell` pt. */
function valueNoise(rand, cellPt) {
  const n = Math.max(2, Math.round(PAPER.tile / cellPt));
  const v = Float32Array.from({ length: n * n }, () => rand() * 2 - 1);
  const at = (i, j) => v[((j % n) + n) % n * n + (((i % n) + n) % n)];
  const sm = (t) => t * t * (3 - 2 * t);
  return (xPt, yPt) => {
    const x = (xPt / PAPER.tile) * n;
    const y = (yPt / PAPER.tile) * n;
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = sm(x - i);
    const fy = sm(y - j);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
    return a + (b - a) * fy;
  };
}

/** The tile's alpha field at `scale` device px per pt. */
export function paperAlpha(scale) {
  const rand = mulberry32(PAPER.seed);
  const octaves = PAPER.tooth.map((o) => ({ f: valueNoise(rand, o.cell), amp: o.amp }));
  const px = PAPER.tile * scale;
  const A = new Float32Array(px * px);
  const grit = mulberry32(PAPER.seed ^ 0xa5a5);
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      let a = PAPER.mean;
      for (const o of octaves) a += o.amp * o.f((x + 0.5) / scale, (y + 0.5) / scale);
      a += (grit() * 2 - 1) * PAPER.grit;
      A[y * px + x] = a;
    }
  }
  // Fibres: short arcs, drawn with wrap so the tile stays seamless.
  const fr = mulberry32(PAPER.seed ^ 0x1234);
  const ink = (xPt, yPt, alpha, rPt) => {
    const r = rPt * scale;
    const cx = xPt * scale;
    const cy = yPt * scale;
    for (let dy = -Math.ceil(r + 1); dy <= Math.ceil(r + 1); dy++) {
      for (let dx = -Math.ceil(r + 1); dx <= Math.ceil(r + 1); dx++) {
        const d = Math.hypot(dx + 0.5 - (cx % 1), dy + 0.5 - (cy % 1));
        const cov = Math.max(0, Math.min(1, r + 0.5 - d));
        if (cov <= 0) continue;
        const X = (((Math.floor(cx) + dx) % px) + px) % px;
        const Y = (((Math.floor(cy) + dy) % px) + px) % px;
        A[Y * px + X] = Math.max(A[Y * px + X], A[Y * px + X] * (1 - cov) + (A[Y * px + X] + alpha) * cov);
      }
    }
  };
  const F = PAPER.fibres;
  for (let k = 0; k < F.count; k++) {
    const x0 = fr() * PAPER.tile;
    const y0 = fr() * PAPER.tile;
    const len = F.len[0] + fr() * (F.len[1] - F.len[0]);
    const a = fr() * Math.PI * 2;
    const bend = (fr() - 0.5) * 0.9;
    const steps = Math.ceil(len * scale * 1.5);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const ang = a + bend * t;
      const fade = Math.sin(Math.PI * t) ** 0.6;
      ink(x0 + Math.cos(ang) * len * t, y0 + Math.sin(ang) * len * t, (F.alpha * fade) / 2.2, F.width / 2);
    }
  }
  const K = PAPER.flecks;
  for (let k = 0; k < K.count; k++) {
    ink(fr() * PAPER.tile, fr() * PAPER.tile, K.alpha, K.r[0] + fr() * (K.r[1] - K.r[0]));
  }
  let sum = 0;
  let max = 0;
  for (let i = 0; i < A.length; i++) {
    A[i] = Math.max(0, Math.min(PAPER.max, A[i]));
    sum += A[i];
    max = Math.max(max, A[i]);
  }
  return { A, px, mean: sum / A.length, max };
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
/** Grey + alpha PNG (colour type 4): grey 0 (black), alpha from the field. */
export function pngOf(A, px) {
  const raw = Buffer.alloc((px * 2 + 1) * px);
  for (let y = 0; y < px; y++) {
    raw[y * (px * 2 + 1)] = 0;
    for (let x = 0; x < px; x++) {
      const o = y * (px * 2 + 1) + 1 + x * 2;
      raw[o] = 0;
      raw[o + 1] = Math.round(A[y * px + x] * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(px, 0);
  ihdr.writeUInt32BE(px, 4);
  ihdr[8] = 8;
  ihdr[9] = 4;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---- Write, or check ------------------------------------------------ */

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const grey = (a) => Math.round(255 * (1 - a)).toString(16).toUpperCase().repeat(3);
  let stale = 0;
  if (!CHECK) mkdirSync(join(ROOT, OUT), { recursive: true });
  for (const s of [2, 3]) {
    const { A, px, mean, max } = paperAlpha(s);
    const bytes = pngOf(A, px);
    const rel = `${OUT}/paper@${s}x.png`;
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
      continue;
    }
    writeFileSync(file, bytes);
    console.log(
      `  ${rel}  ${px}px  ${(bytes.length / 1024).toFixed(1)} KB · mean ${(mean * 100).toFixed(2)}% (#${grey(mean)}) · darkest ${(max * 100).toFixed(2)}% (#${grey(max)})`,
    );
  }
  if (CHECK) {
    if (stale) {
      console.error(`\n  build-paper: ${stale} tile(s) differ from this script's grain. Run node scripts/build-paper.mjs.\n`);
      process.exit(1);
    }
    console.log('\n  build-paper: both tiles match the grain.\n');
  } else {
    console.log('\n  Paper tiles rebuilt.\n');
  }
}
