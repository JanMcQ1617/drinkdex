/* ==================================================================== */
/* v4.10 ground: the studio sweep as the PNG the app would ship         */
/*                                                                      */
/* The recommendation (../README.md) is a vertical ramp, so the whole   */
/* ground is one column of greys: this writes it as a 4 x 256 px 8-bit  */
/* grey PNG (colour type 0, about 100 bytes), which details/Paper.tsx   */
/* would stretch to the window's height with resizeMode="stretch". A    */
/* stretched image is the layer's contents, filtered by the GPU when it */
/* is composited: no tiles, no backing store, 4 KB decoded, one quad.   */
/*                                                                      */
/* Texel j holds the ramp at the centre of its row, (j + 0.5) / 256 of  */
/* the screen's height, rounded to a whole level: the same sweepAt()    */
/* the board's CSS gradient draws, so the shot drawn from this file     */
/* (board/shots/sweeppng-*.png) proves the asset route matches it, and  */
/* shows the device's 8-bit steps, which Chrome's dithered CSS hides.   */
/*                                                                      */
/* The app would carry its own port of this (the build-paper.mjs        */
/* pattern: a script in scripts/ with --check); this one writes only    */
/* the board's copy, board/assets/ground.png.                           */
/*                                                                      */
/* Kept as the record of the first draft. The app's port is             */
/* scripts/build-ground.mjs, and it ships the ramp PRE-DITHERED, 440 x  */
/* 574 over the lower 60% (specs/v4.10/spec.md G.2), not this stepped   */
/* 4 x 256; the board's "shipped PNG" row now draws that file.          */
/*                                                                      */
/* Run (repo root):  node specs/v4.10/ground/tools/sweep-png.mjs        */
/* ==================================================================== */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { PICK, sweepAt } from './grounds.mjs';

export const COLS = 4;
export const ROWS = 256;

/** The column of levels, top to bottom. */
export function column(s = PICK, rows = ROWS) {
  const out = [];
  for (let j = 0; j < rows; j++) out.push(Math.round(sweepAt((j + 0.5) / rows, s)));
  return out;
}

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
/** An 8-bit grey PNG (colour type 0), every row one level across. */
export function pngOf(levels, cols = COLS) {
  const raw = Buffer.alloc((cols + 1) * levels.length);
  levels.forEach((v, y) => {
    raw[y * (cols + 1)] = 0;
    raw.fill(v, y * (cols + 1) + 1, (y + 1) * (cols + 1));
  });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cols, 0);
  ihdr.writeUInt32BE(levels.length, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = fileURLToPath(new URL('../board/assets/ground.png', import.meta.url));
  mkdirSync(fileURLToPath(new URL('../board/assets/', import.meta.url)), { recursive: true });
  const levels = column();
  const png = pngOf(levels);
  writeFileSync(out, png);
  const steps = [...new Set(levels)];
  const firstGrey = levels.findIndex((v) => v < 255);
  console.log(
    `wrote ${out} (${COLS} x ${ROWS}, ${png.length} bytes): white to row ${firstGrey - 1} ` +
      `(${(((firstGrey) / ROWS) * 100).toFixed(1)}% of the height), then ${steps.length - 1} steps to ${levels.at(-1)}`,
  );
}
