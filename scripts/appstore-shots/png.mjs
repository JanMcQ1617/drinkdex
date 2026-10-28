/**
 * The few image facts compose.mjs needs, read straight from the bytes
 * (v4.9, specs/v4.9/appstore-shots).
 *
 *   imageSize(buf)    a PNG's or a JPEG's width and height, from its header
 *   pngInfo(buf)      a PNG's header fields, and whether it carries alpha
 *   opaquePng(buf)    the same picture with no alpha channel, for App Store
 *                     Connect, which refuses a screenshot that has one
 *
 * NO LIBRARY, as build-icons and render-details: node:zlib inflates and
 * deflates, and the PNG filters are a page of arithmetic. pngjs sits in
 * node_modules only as a dependency of a dependency (expo-notifications'
 * image utils), so leaning on it would break the day that tree changes.
 *
 * WHY opaquePng USUALLY COPIES. Headless Chrome writes its --screenshot as
 * 8-bit RGB with no tRNS chunk, which App Store Connect takes as it is, so
 * that file passes through byte for byte. Anything else (RGBA, a tRNS
 * chunk, grey, a palette) is decoded, laid over the page's white, and
 * written again as 8-bit RGB. Interlaced and 16-bit files are refused
 * rather than half-supported: Chrome writes neither.
 */
import { Buffer } from 'node:buffer';
import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Each chunk as { type, data }, in file order. */
function chunks(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  const out = [];
  let at = 8;
  while (at + 8 <= buf.length) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    out.push({ type, data: buf.subarray(at + 8, at + 8 + len) });
    at += 12 + len;
    if (type === 'IEND') break;
  }
  return out;
}

/** Width, height, bit depth, colour type, interlace, and whether any alpha can be in it. */
export function pngInfo(buf) {
  const all = chunks(buf);
  const ihdr = all[0];
  if (!ihdr || ihdr.type !== 'IHDR') throw new Error('PNG without IHDR first');
  const d = ihdr.data;
  const colorType = d[9];
  const hasTRNS = all.some((c) => c.type === 'tRNS');
  return {
    width: d.readUInt32BE(0),
    height: d.readUInt32BE(4),
    bitDepth: d[8],
    colorType,
    interlace: d[12],
    hasTRNS,
    /** Colour types 4 and 6 carry an alpha channel; a tRNS chunk adds one to the others. */
    alpha: colorType === 4 || colorType === 6 || hasTRNS,
  };
}

/** A PNG's or a baseline/progressive JPEG's pixel size, or null for anything else. */
export function imageSize(buf) {
  if (buf.subarray(0, 8).equals(SIGNATURE)) {
    const { width, height } = pngInfo(buf);
    return { width, height, format: 'png' };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let at = 2;
    while (at + 4 <= buf.length) {
      if (buf[at] !== 0xff) {
        at++;
        continue;
      }
      const marker = buf[at + 1];
      // Fill bytes and the standalone markers carry no length.
      if (marker === 0xff) {
        at++;
        continue;
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        at += 2;
        continue;
      }
      const len = buf.readUInt16BE(at + 2);
      // SOF0 to SOF15, less DHT (C4), JPG (C8) and DAC (CC), which share the range.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(at + 5), width: buf.readUInt16BE(at + 7), format: 'jpeg' };
      }
      at += 2 + len;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Decode and encode, 8-bit only                                      */
/* ------------------------------------------------------------------ */

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Undo the per-row filters in place; returns the bare rows, `stride` bytes each. */
function unfilter(raw, height, stride, bpp) {
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    const up = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[row + x - bpp] : 0;
      const b = y > 0 ? out[up + x] : 0;
      const c = x >= bpp && y > 0 ? out[up + x - bpp] : 0;
      const v = raw[src + x];
      out[row + x] =
        f === 0 ? v : f === 1 ? v + a : f === 2 ? v + b : f === 3 ? v + ((a + b) >> 1) : f === 4 ? v + paeth(a, b, c) : NaN;
    }
    if (f > 4) throw new Error(`PNG row ${y} has filter ${f}`);
  }
  return out;
}

/** Filter each row with whichever of the five filters leaves the smallest sum (libpng's heuristic). */
function filterRows(px, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(height * (stride + 1));
  const trial = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    const up = row - stride;
    let best = 0;
    let bestSum = Infinity;
    for (let f = 0; f <= 4; f++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? px[row + x - bpp] : 0;
        const b = y > 0 ? px[up + x] : 0;
        const c = x >= bpp && y > 0 ? px[up + x - bpp] : 0;
        const v = px[row + x];
        const r =
          (f === 0 ? v : f === 1 ? v - a : f === 2 ? v - b : f === 3 ? v - ((a + b) >> 1) : v - paeth(a, b, c)) & 0xff;
        trial[x] = r;
        sum += r < 128 ? r : 256 - r;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = f;
        trial.copy(out, y * (stride + 1) + 1);
      }
    }
    out[y * (stride + 1)] = best;
  }
  return out;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * The picture as 8-bit RGB with no alpha, laid over `ground` where it
 * was see-through. A file that is already that comes back unchanged.
 */
export function opaquePng(buf, ground = [255, 255, 255]) {
  const info = pngInfo(buf);
  if (!info.alpha && info.colorType === 2 && info.bitDepth === 8) return buf;
  if (info.bitDepth !== 8) throw new Error(`a ${info.bitDepth}-bit PNG: only 8-bit is handled`);
  if (info.interlace) throw new Error('an interlaced PNG is not handled');

  const all = chunks(buf);
  const ch = CHANNELS[info.colorType];
  const raw = zlib.inflateSync(Buffer.concat(all.filter((c) => c.type === 'IDAT').map((c) => c.data)));
  const px = unfilter(raw, info.height, info.width * ch, ch);
  const plte = all.find((c) => c.type === 'PLTE')?.data;
  const trns = all.find((c) => c.type === 'tRNS')?.data;

  const rgb = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0, n = info.width * info.height; i < n; i++) {
    let r;
    let g;
    let b;
    let a = 255;
    if (info.colorType === 2) {
      [r, g, b] = [px[i * 3], px[i * 3 + 1], px[i * 3 + 2]];
      if (trns && trns.length >= 6 && r === trns[1] && g === trns[3] && b === trns[5]) a = 0;
    } else if (info.colorType === 6) {
      [r, g, b, a] = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2], px[i * 4 + 3]];
    } else if (info.colorType === 0 || info.colorType === 4) {
      r = g = b = px[i * ch];
      if (info.colorType === 4) a = px[i * 2 + 1];
      else if (trns && trns.length >= 2 && r === trns[1]) a = 0;
    } else {
      const k = px[i];
      [r, g, b] = [plte[k * 3], plte[k * 3 + 1], plte[k * 3 + 2]];
      if (trns && k < trns.length) a = trns[k];
    }
    rgb[i * 3] = Math.round((r * a + ground[0] * (255 - a)) / 255);
    rgb[i * 3 + 1] = Math.round((g * a + ground[1] * (255 - a)) / 255);
    rgb[i * 3 + 2] = Math.round((b * a + ground[2] * (255 - a)) / 255);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(info.width, 0);
  ihdr.writeUInt32BE(info.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  // Colour space chunks ride along (Chrome is told to write sRGB); nothing that describes alpha or a palette does.
  const keep = all.filter((c) => ['iCCP', 'sRGB', 'gAMA', 'cHRM', 'pHYs'].includes(c.type));
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    ...keep.map((c) => chunk(c.type, c.data)),
    chunk('IDAT', zlib.deflateSync(filterRows(rgb, info.width, info.height, 3), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
