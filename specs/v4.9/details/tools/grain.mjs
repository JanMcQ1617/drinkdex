/* ==================================================================== */
/* v4.9 paper: the faint grain behind the page (spec A.5)               */
/*                                                                      */
/* Port target: scripts/build-paper.mjs, writing assets/details/        */
/* paper@2x.png and paper@3x.png (committed, with --check).             */
/*                                                                      */
/* A seamless 128 x 128 pt tile of BLACK AT A LOW ALPHA, so it is drawn */
/* over the page's own white (bg, or a sheet's surface) and changes     */
/* nothing else: no new colour token, no cream, no warm paper (one hue, */
/* check-contrast), R = G = B everywhere it lands.                      */
/*                                                                      */
/*   tooth   periodic value noise, cells of 4.8, 2.4 and 1.2pt          */
/*   fibre   30 short hairline curves a tile, 0.35pt, a little darker   */
/*                                                                      */
/* No flecks (judging, 28 Oct): the nine pressed specks a tile were the */
/* darkest pixels, and across a big empty screen they read as dust on   */
/* the glass, repeating on the tile's 128pt lattice.                    */
/*                                                                      */
/* BOLDER (28 Oct, the lead's pass): the paper must be SEEN on a device */
/* at arm's length. At 3.2 and 1.2pt cells and +-0.65% it was below the */
/* eye's threshold there: those cells are 17 to 47 cycles a degree at   */
/* 50cm, where the eye needs several percent. The tooth now centres on  */
/* a 2.4pt cell at +-1.2% (with 4.8pt at +-0.6% under it), which is 7   */
/* to 12 cycles a degree, where the eye is most sensitive, so the grain */
/* reads as a sheet's tooth at arm's length. Not lower: cells of 8 to   */
/* 13pt (the pulp's clouds) were tried and showed the 128pt tile as a   */
/* repeating lattice of blotches, which reads as a dirty screen. The    */
/* fibres are fewer (30), so no landmark repeats.                       */
/*                                                                      */
/* MEAN 1.6% black (the page reads #FBFBFB on average), and NO PIXEL    */
/* OVER 5.5% (#F1F1F1 at worst; the darkest is 4.1%, #F4F4F4), which    */
/* keeps the faintest control edge (lineControl, #8A8A8A) over 3:1 on   */
/* the darkest speck and textMuted over 6:1 (spec G). Deterministic: a  */
/* fixed seed, a fixed PRNG.                                            */
/*                                                                      */
/* Run: node specs/v4.9/details/tools/grain.mjs [outDir]                */
/* ==================================================================== */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = process.argv[2] ?? fileURLToPath(new URL('../board/assets', import.meta.url));
  mkdirSync(out, { recursive: true });
  for (const s of [2, 3]) {
    const { A, px, mean, max } = paperAlpha(s);
    const buf = pngOf(A, px);
    writeFileSync(join(out, `paper@${s}x.png`), buf);
    const grey = (a) => Math.round(255 * (1 - a));
    console.log(
      `paper@${s}x.png ${px}px ${(buf.length / 1024).toFixed(1)} KB · mean ${(mean * 100).toFixed(2)}% (#${grey(mean).toString(16).toUpperCase().repeat(3)}) · max ${(max * 100).toFixed(2)}% (#${grey(max).toString(16).toUpperCase().repeat(3)})`,
    );
  }
}
