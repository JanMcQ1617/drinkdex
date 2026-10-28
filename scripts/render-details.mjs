/**
 * The detail marks, rendered off the device for visual proof (v4.6,
 * specs/v4.6-details/spec.md).
 *
 * ONE SOURCE. This imports src/components/details/penPath.ts itself, the
 * file the app draws from: node strips its types and runs it as it is
 * (penPath imports nothing and uses only erasable TypeScript, which its
 * header promises to keep). A mirror of the geometry here would prove a
 * copy, not what ships.
 *
 * NO BROWSER, as build-icons: the marks are straight-edged polygons (M,
 * L and Z only), so each is filled here on an 8x8 supersampled grid with
 * the nonzero rule, box-reduced to the pixel, and written as PNG through
 * node:zlib. The drip's two pieces are filled separately and united, as
 * the two <Path>s are on the device.
 *
 * Writes specs/v4.6-details/build/:
 *   <mark>.svg         the mark alone, accent on the page, in points
 *   <mark>@3x.png      the same at 3x (an iPhone Pro's scale), 1:1
 *   sheet@3x.png       every mark stacked, with a 1pt grid tick beside each
 *   index.html         the sheet with each mark's numbers
 * and prints each mark's box and its thinnest and widest ink in device px.
 *
 * v4.9 (specs/v4.9/details/spec.md E.3) adds every new mark to the sheet:
 * the double rules, the post's corners and its foot, the six doodles, the
 * crown, the arrow, the six signed ends and the ten empty-state clusters
 * from doodlePath and framePath (the pen, in the accent), and the press
 * from framePath and numeralPath (the figures and a ticket's perforation
 * in `rule`, the leader in `lineControl`, the ticket's own fill in
 * `bgSunk`). Each new mark is ONE path on the device, filled nonzero as a
 * whole, so it is filled here from its own path data the same way, never
 * stroke by stroke. Two checks fail the run besides the floor:
 *
 *   FLOOR    every new pen mark at every scale and turn the spec draws
 *            it at: the signed ends (1.2, each table rotation), every
 *            cluster row through emptyCluster (1.5 by a print, 1.1 and
 *            1.25 by a glyph), the crown at 1 and 0.8, the arrow, the
 *            15pt corners, the post's foot, and the double rules at 392,
 *            342, 408 and 358 with seeds 0, 5, 11 and 12;
 *   GLYPHS   every character of "Nº 0123456789" is in numeralGlyphs.ts,
 *            and numeral() draws every text the app sets: the Dex's
 *            "01" to "99" and the drink page's "Nº 0000" form, at the
 *            caps the app sets them.
 *
 * THE NEW FILES IMPORT EXTENSIONLESS ('./penPath'), as the rest of the
 * app does, so a resolve hook (below) retries a failed relative import
 * with ".ts". It is local to this script: the shared tsconfig needs no
 * allowImportingTsExtensions, which would let ".ts" specifiers into app
 * code. The modules load with await import() AFTER the hook, since a
 * static import would hoist above it.
 *
 * Run: node scripts/render-details.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (spec.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(spec)) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
});

// penPath.ts has no package "type"; node reparses it as a module and says so once. Not news here.
process.removeAllListeners('warning');
const { PEN, PEN_SEED, FLOOR, penRule, penSwash, penVRule, plateDrip } = await import(
  '../src/components/details/penPath.ts'
);
const { ARROW, ART_CLUSTER, DOODLE_SCALE, DOODLES, ICON_CLUSTER, SIGN_ROT, arrow, crown, emptyCluster, signature } =
  await import('../src/components/details/doodlePath.ts');
const { CORNER_RULE, CROP, cornerL, cornerRule, cropCorners, doubleRule, leader, perforation, TICKET, ticket } = await import(
  '../src/components/details/framePath.ts'
);
const { numeral, numeralWidth } = await import('../src/components/details/numeralPath.ts');
const { NUMERAL_GLYPHS } = await import('../src/components/details/numeralGlyphs.ts');

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, 'specs/v4.6-details/build');
mkdirSync(OUT, { recursive: true });

/* The accent and the page, read from theme.ts so a retuned accent needs no edit here. */
const theme = readFileSync(join(ROOT, 'src/constants/theme.ts'), 'utf8');
const hex = theme.match(/\baccent:\s*'#([0-9A-Fa-f]{6})'/)?.[1];
if (!hex) {
  console.error('  render-details: cannot read colors.accent in theme.ts');
  process.exit(2);
}
const RED = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
const PAGE = [255, 255, 255];
const PLATE_GREY = [0xe3, 0xe3, 0xe3];
/* The press's greys and the ticket's wash, read the same way: v4.9's marks name tokens, never values. */
const token = (name) => {
  const v = theme.match(new RegExp(`\\b${name}:\\s*'#([0-9A-Fa-f]{6})'`))?.[1];
  if (!v) {
    console.error(`  render-details: cannot read colors.${name} in theme.ts`);
    process.exit(2);
  }
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
};
const INK = { pen: RED, rule: token('rule'), control: token('lineControl'), wash: token('bgSunk') };

const SCALE = 3;
const SS = 8;

/* ------------------------------------------------------------------ */
/* Raster                                                             */
/* ------------------------------------------------------------------ */

/** Subsample coverage of polygons (nonzero), in a w x h px canvas, pt -> px by SCALE, shifted by (ox, oy) pt. */
function cover(polys, w, h, ox, oy, into = new Uint8Array(w * SS * h * SS)) {
  const W = w * SS;
  const H = h * SS;
  const k = SCALE * SS;
  for (const poly of polys) {
    const pts = poly.map(([x, y]) => [(x + ox) * k, (y + oy) * k]);
    for (let row = 0; row < H; row++) {
      const sy = row + 0.5;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % pts.length];
        if (y0 === y1) continue;
        const up = y1 > y0;
        if ((up && sy >= y0 && sy < y1) || (!up && sy >= y1 && sy < y0)) {
          xs.push([x0 + ((sy - y0) * (x1 - x0)) / (y1 - y0), up ? 1 : -1]);
        }
      }
      xs.sort((a, b) => a[0] - b[0]);
      let wind = 0;
      for (let i = 0; i < xs.length - 1; i++) {
        wind += xs[i][1];
        if (wind === 0) continue;
        const a = Math.max(0, Math.ceil(xs[i][0] - 0.5));
        const b = Math.min(W - 1, Math.ceil(xs[i + 1][0] - 0.5) - 1);
        for (let c = a; c <= b; c++) into[row * W + c] = 1;
      }
    }
  }
  return into;
}

/** Box-reduce to per-pixel coverage 0..1. */
function reduce(sub, w, h) {
  const W = w * SS;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) n += sub[(y * SS + j) * W + x * SS + i];
      out[y * w + x] = n / (SS * SS);
    }
  }
  return out;
}

function crcTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
}
const CRC = crcTable();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** RGB PNG from a w x h array of [r, g, b]. */
function png(w, h, px) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px[y * w + x];
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const mix = (bg, fg, c) => bg.map((v, i) => Math.round(v + (fg[i] - v) * c));

/* ------------------------------------------------------------------ */
/* The marks                                                          */
/* ------------------------------------------------------------------ */

/** A rounded-rect polygon, for the plate the drip leaves. */
function roundRect(x, y, w, h, r) {
  const pts = [];
  const arc = (cx, cy, a0) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (Math.PI / 2) * (i / 6);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  arc(x + w - r, y + r, -Math.PI / 2);
  arc(x + w - r, y + h - r, 0);
  arc(x + r, y + h - r, Math.PI / 2);
  arc(x + r, y + r, Math.PI);
  return pts;
}

/* At 390 x 844 (the common phone), with the 440 Pro Max's in the notes. */
const PHONE_W = 390;
const MARKS = [
  {
    name: 'stories-rule',
    what: `Home: under the stories, ${PHONE_W - 32}pt (16 to ${PHONE_W - 16}); since v4.9 the upper stroke of its double rule, below`,
    shape: penRule(PHONE_W - 32, PEN_SEED.stories),
  },
  {
    name: 'section-head-rule',
    what: `Dex: under a section head, ${PHONE_W - 48}pt (24 to ${PHONE_W - 24})`,
    shape: penRule(PHONE_W - 48, PEN_SEED.sectionHead),
  },
  // Retired in v4.9 into the post's foot (cornerRule, below); kept on the sheet as the record, and seed 1 is never reused.
  { name: 'entry-rule', what: "Home (retired in v4.9): the 24pt rule closing each feed post, now the post's foot", shape: penRule(24, PEN_SEED.entry) },
  { name: 'swash', what: 'Tab-root title: 56pt at text scale 1', shape: penSwash(56) },
  { name: 'swash-1.3', what: 'Tab-root title at the 1.3 cap: 72.8pt, same weight', shape: penSwash(56 * 1.3) },
  { name: 'margin-rule', what: "Drink page: the record's margin rule, 160pt here (it measures itself)", shape: penVRule(160, PEN_SEED.margin) },
  { name: 'column-rule', what: 'Drink page: the facts column rule, 52pt here', shape: penVRule(52, PEN_SEED.column) },
  // Retired in v4.7 with Profile's Tournaments line (specs/v4.7/spec.md 6.1); kept on the sheet as the record of what was drawn.
  { name: 'profile-margin', what: "Profile (retired in v4.7): beside the two ledger rows, 53.5pt at text scale 1", shape: penVRule(53.5, PEN_SEED.margin) },
  /* v4.7 6.1 #10 and #12. A tournament's name (#11) is the tab roots' swash itself, drawn above. */
  {
    name: 'board-rule',
    what: `Tournaments tab: between tournaments and Friends, ${PHONE_W - 48}pt (24 to ${PHONE_W - 24})`,
    shape: penRule(PHONE_W - 48, PEN_SEED.board),
  },
  // Retired in v4.9 for the signed cherry (sign-cherry, below); kept on the sheet as the record, and seed 6 is never reused.
  { name: 'activity-end-rule', what: "Activity (retired in v4.9): the 24pt closing rule at the list's foot, now its signed end", shape: penRule(24, PEN_SEED.activityEnd) },
  {
    name: 'plate-drip',
    what: 'Drink page: the drip off a caught 62 x 24 Nº plate (plate drawn in Campari)',
    shape: plateDrip(),
    plate: { w: 62, h: 24 },
  },
];

/* ------------------------------------------------------------------ */
/* v4.9: the new marks (specs/v4.9/details/spec.md A.2), at 390 too   */
/* ------------------------------------------------------------------ */

const ART = ['coupe', 'lime', 'olive', 'twist'].filter((n) => ART_CLUSTER[n]);
const ICON = Object.keys(ICON_CLUSTER);
const V49 = [
  { name: 'double-rule-stories', what: `Home: the stories rule doubled, ${PHONE_W - 32}pt, seed 0 (Pen's mock) over seed 3`, shape: doubleRule(PHONE_W - 32, PEN_SEED.stories) },
  { name: 'double-rule-board', what: `Tournaments: the board rule doubled, ${PHONE_W - 48}pt`, shape: doubleRule(PHONE_W - 48, PEN_SEED.board) },
  { name: 'double-rule-spec', what: `Drink page: the spec card's head, ${PHONE_W - 48}pt`, shape: doubleRule(PHONE_W - 48, PEN_SEED.spec) },
  { name: 'double-rule-rest-head', what: `Dex: the "Everything else" head, ${PHONE_W - 48}pt`, shape: doubleRule(PHONE_W - 48, PEN_SEED.restHead) },
  { name: 'post-corner-tr', what: `Home: a post's top-right corner, ${CROP.arm}pt arms, at { top: 3, right: 8 }`, shape: cornerL(CROP.arm, 'tr') },
  { name: 'post-foot', what: `Home: a post's foot, the corner and the closing rule as one stroke, ${CORNER_RULE.run} x ${CORNER_RULE.arm}`, shape: cornerRule() },
  { name: 'post-corner-bl', what: "The post page: its bottom-left corner alone (it has no closing rule)", shape: cornerL(CROP.arm, 'bl') },
  { name: 'crop-corners', what: "An empty state's print, 120 x 150: the anti-diagonal pair, 6pt off it", shape: cropCorners(120, 150) },
  ...Object.keys(DOODLES).map((n) => ({ name: `doodle-${n}`, what: `The ${n}, at ${DOODLE_SCALE.art} (beside a print), unturned`, shape: DOODLES[n](DOODLE_SCALE.art, 0) })),
  { name: 'crown', what: "Tournaments: the leader's crown on a 40pt face, 8 degrees", shape: crown(1, 8) },
  { name: 'crown-0.8', what: "A tournament's page: the crown on a live leader's 32pt face", shape: crown(0.8, 8) },
  { name: 'arrow', what: "Home and the Dex empty: the arrow from beside the body to the key, 14pt clear", shape: arrow(ARROW.from, ARROW.to, ARROW.bend) },
  ...Object.keys(SIGN_ROT).map((n) => ({ name: `sign-${n}`, what: `A list's end, signed: the ${n} at ${DOODLE_SCALE.sign}, ${SIGN_ROT[n]} degrees, and the swash`, shape: signature(n, SIGN_ROT[n]) })),
  ...ART.map((n) => ({ name: `cluster-${n}-art`, what: `An empty state round a print: the ${n}'s cluster and the corners, one path`, shape: emptyCluster(n, 'art') })),
  ...ICON.map((n) => ({ name: `cluster-${n}-icon`, what: `An empty state over a glyph: the ${n}'s cluster, one path`, shape: emptyCluster(n, 'icon') })),
  { name: 'figure-01', what: 'Dex: a section figure, cap 40, in rule (the press)', shape: numeral('01', 40), ink: 'rule' },
  { name: 'figure-no-0100', what: 'Drink page: the spec card\'s figure, cap 64, in rule (the press)', shape: numeral('Nº 0100', 64), ink: 'rule' },
  { name: 'leader', what: 'Drink page: a menu leader, 120pt, in lineControl (the press)', shape: leader(120), ink: 'control' },
  {
    name: 'ticket',
    what: `Tournaments: a ticket card, 300 x 158, notches r ${TICKET.notch} at 63, its perforation in rule (the press on the wash)`,
    shape: perforation(TICKET.notch + 2, 300 - TICKET.notch - 2, 63),
    ink: 'rule',
    under: { shape: ticket(300, 158, 63), ink: 'wash' },
  },
].map((m) => ({ ink: 'pen', ...m, v49: true }));
MARKS.push(...V49);

/** A shape's own path data as polygons: what the device fills (M/L/Z, its coordinates to the hundredth). */
function pathPolys(d) {
  return d
    .split('M')
    .filter(Boolean)
    .map((sub) =>
      sub
        .replace(/Z$/, '')
        .split('L')
        .map((pt) => pt.trim().split(/\s+/).map(Number)),
    );
}
/**
 * One <Path> filled as the device fills it: NONZERO across all of its
 * subpaths at once (a one-path mark's strokes are wound the same way, a
 * figure's rings outer-out and inner-in), into `into`. Each `d` is its
 * own <Path>, so separate ones unite.
 */
function coverPath(d, w, h, ox, oy, into) {
  const W = w * SS;
  const H = h * SS;
  const k = SCALE * SS;
  const polys = pathPolys(d).map((poly) => poly.map(([x, y]) => [(x + ox) * k, (y + oy) * k]));
  for (let row = 0; row < H; row++) {
    const sy = row + 0.5;
    const xs = [];
    for (const pts of polys) {
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % pts.length];
        if (y0 === y1) continue;
        const up = y1 > y0;
        if ((up && sy >= y0 && sy < y1) || (!up && sy >= y1 && sy < y0)) {
          xs.push([x0 + ((sy - y0) * (x1 - x0)) / (y1 - y0), up ? 1 : -1]);
        }
      }
    }
    xs.sort((a, b) => a[0] - b[0]);
    let wind = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      wind += xs[i][1];
      if (wind === 0) continue;
      const a = Math.max(0, Math.ceil(xs[i][0] - 0.5));
      const b = Math.min(W - 1, Math.ceil(xs[i + 1][0] - 0.5) - 1);
      for (let c = a; c <= b; c++) into[row * W + c] = 1;
    }
  }
  return into;
}

/** Thinnest and widest ink over every stroke of a mark of many (polygons of 20 points and more: a dot is not a stroke), in pt. */
function strokeWidths(shape) {
  let lo = Infinity;
  let hi = 0;
  for (const poly of shape.polys) {
    if (poly.length < 20 || (poly.length - 10) % 2) continue;
    const [a, b] = widths({ polys: [poly] });
    lo = Math.min(lo, a);
    hi = Math.max(hi, b);
  }
  return [lo, hi];
}

/** Thinnest and widest ink across the stroke, from the outline's paired sides, in pt. */
function widths(shape) {
  const poly = shape.polys[0];
  // The outline is left side (n), cap (5), right side reversed (n), cap (5).
  const n = (poly.length - 10) / 2;
  let lo = Infinity;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[poly.length - 5 - 1 - i];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  return [lo, hi];
}

const r2 = (v) => Math.round(v * 100) / 100;
const PAD = 4; // pt of page round each mark

const rendered = [];
for (const m of MARKS) {
  // A mark drawn over another (the ticket's perforation on its fill) is placed on their joint box.
  const joint = m.under
    ? [m.shape.box, m.under.shape.box].reduce((a, b) => {
        const x0 = Math.min(a.x, b.x);
        const y0 = Math.min(a.y, b.y);
        return { x: x0, y: y0, w: Math.max(a.x + a.w, b.x + b.w) - x0, h: Math.max(a.y + a.h, b.y + b.h) - y0 };
      })
    : m.shape.box;
  const { x, y, w, h } = joint;
  const polys = m.shape.polys;
  // Canvas in pt: the ink's box, or the plate and the drip for the drip.
  let cx = x;
  let cy = y;
  let cw = w;
  let ch = h;
  let plateCov = null;
  if (m.plate) {
    // The drip's frame origin is 6 in from the plate's right corner and 1.5 above its bottom edge.
    const px = -(m.plate.w - PEN.drip.inset);
    const py = -(m.plate.h - PEN.drip.overlap);
    cx = Math.min(px, x);
    cy = Math.min(py, y);
    cw = Math.max(px + m.plate.w, x + w) - cx;
    ch = Math.max(py + m.plate.h, y + h) - cy;
    m.platePoly = roundRect(px, py, m.plate.w, m.plate.h, 2);
  }
  const W = Math.ceil((cw + 2 * PAD) * SCALE);
  const H = Math.ceil((ch + 2 * PAD) * SCALE);
  const ox = -cx + PAD;
  const oy = -cy + PAD;
  if (m.platePoly) plateCov = reduce(cover([m.platePoly], W, H, ox, oy), W, H);
  const sub = new Uint8Array(W * SS * H * SS);
  if (m.v49) for (const d of m.shape.d) coverPath(d, W, H, ox, oy, sub);
  else for (const poly of polys) cover([poly], W, H, ox, oy, sub);
  const ink = reduce(sub, W, H);
  // The plate and the drip are one paint, so their union is the image.
  const cov = plateCov ? ink.map((c, i) => Math.max(c, plateCov[i])) : ink;
  const fg = m.v49 ? INK[m.ink] : RED;
  let px;
  if (m.under) {
    const lay = new Uint8Array(W * SS * H * SS);
    for (const d of m.under.shape.d) coverPath(d, W, H, ox, oy, lay);
    const base = reduce(lay, W, H);
    px = Array.from(cov, (c, i) => mix(mix(PAGE, INK[m.under.ink], base[i]), fg, c));
  } else {
    px = Array.from(cov, (c) => mix(PAGE, fg, c));
  }
  writeFileSync(join(OUT, `${m.name}@3x.png`), png(W, H, px));

  const svgW = r2(cw + 2 * PAD);
  const svgH = r2(ch + 2 * PAD);
  const css = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  const fill = m.v49 ? css(fg) : `#${hex}`;
  const plateSvg = m.platePoly
    ? `<path fill="${fill}" d="${m.platePoly.map(([a, b], i) => `${i ? 'L' : 'M'}${r2(a)} ${r2(b)}`).join('')}Z"/>`
    : '';
  const underSvg = m.under ? m.under.shape.d.map((d) => `<path fill="${css(INK[m.under.ink])}" d="${d}"/>`).join('') : '';
  writeFileSync(
    join(OUT, `${m.name}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="${r2(cx - PAD)} ${r2(cy - PAD)} ${svgW} ${svgH}">` +
      `<rect x="${r2(cx - PAD)}" y="${r2(cy - PAD)}" width="${svgW}" height="${svgH}" fill="#FFFFFF"/>${plateSvg}${underSvg}` +
      m.shape.d.map((d) => `<path fill="${fill}" d="${d}"/>`).join('') +
      '</svg>\n',
  );

  // The press's widths are not the pen's: a ring, a dot, a dash. Only pen marks are held to the floor.
  const pen = !m.v49 || m.ink === 'pen';
  const [lo, hi] = pen ? (m.v49 ? strokeWidths(m.shape) : widths(m.shape)) : [NaN, NaN];
  rendered.push({ ...m, W, H, px, lo, hi });
  const inkNote = pen
    ? `ink ${r2(lo)} to ${r2(hi)} pt (${r2(lo * SCALE)} to ${r2(hi * SCALE)} px at 3x)`
    : `press, in ${m.ink === 'control' ? 'lineControl' : 'rule'}${m.under ? ' on the wash' : ''}`;
  console.log(
    `  ${m.name.padEnd(18)} box ${String(w).padStart(3)} x ${String(h).padStart(3)} pt   ${inkNote}` +
      `   ${m.shape.d.reduce((s, d) => s + d.length, 0)} chars`,
  );
  if (pen && lo < FLOOR - 1e-6) {
    console.error(`  render-details: ${m.name} falls under the ${FLOOR}pt floor`);
    process.exit(1);
  }
}

/* ---- v4.9: the floor at every scale and turn the spec draws, and the figures' glyphs ---- */

const floorRuns = [
  ...Object.keys(SIGN_ROT).map((n) => [`signature ${n} ${SIGN_ROT[n]}`, signature(n, SIGN_ROT[n])]),
  ...Object.keys(ART_CLUSTER).map((n) => [`cluster ${n} art`, emptyCluster(n, 'art')]),
  ...Object.keys(ICON_CLUSTER).map((n) => [`cluster ${n} icon`, emptyCluster(n, 'icon')]),
  ...[...Object.values(ART_CLUSTER), ...Object.values(ICON_CLUSTER)].flat().map(([n, sc, rot]) => [`${n} ${sc} ${rot}`, DOODLES[n](sc, rot)]),
  ['crown 1', crown(1, 8)],
  ['crown 0.8', crown(0.8, 8)],
  ['arrow', arrow(ARROW.from, ARROW.to, ARROW.bend)],
  ['corner tr', cornerL(CROP.arm, 'tr')],
  ['corner bl', cornerL(CROP.arm, 'bl')],
  ['crop corners', cropCorners(120, 150)],
  ['post foot', cornerRule()],
  ...[392, 342, 408, 358].flatMap((L) => [0, 5, 11, 12].map((seed) => [`double rule ${L} ${seed}`, doubleRule(L, seed)])),
];
let thinnest = Infinity;
for (const [what, shape] of floorRuns) {
  const [lo] = strokeWidths(shape);
  thinnest = Math.min(thinnest, lo);
  if (!(lo >= FLOOR - 1e-6)) {
    console.error(`  render-details: ${what} falls under the ${FLOOR}pt floor (${r2(lo)}pt)`);
    process.exit(1);
  }
}
console.log(`\n  floor: ${floorRuns.length} v4.9 pen marks at the spec's scales and turns, thinnest ink ${r2(thinnest)}pt`);

const SET = 'Nº 0123456789';
const missing = [...SET].filter((ch) => !NUMERAL_GLYPHS[ch]);
if (missing.length) {
  console.error(`  render-details: numeralGlyphs.ts lacks ${missing.map((c) => JSON.stringify(c)).join(', ')}`);
  process.exit(1);
}
// The Dex's section figures ("01" on), and the drink page's "Nº 0000" at the caps its column fits on a 375, 390 and 440 phone.
const texts = [
  ...Array.from({ length: 99 }, (_, i) => [String(i + 1).padStart(2, '0'), 40]),
  ...['Nº 0001', 'Nº 0100', 'Nº 0444', 'Nº 0888', 'Nº 2089'].flatMap((t) =>
    [375, 390, 440].map((W) => [t, Math.min(64, Math.floor((W - 48) / numeralWidth(t, 1)))]),
  ),
];
for (const [t, c] of texts) {
  const n = numeral(t, c);
  if (!n.d[0] || n.points === 0 || !(n.width > 0)) {
    console.error(`  render-details: numeral(${JSON.stringify(t)}, ${c}) draws nothing`);
    process.exit(1);
  }
}
console.log(`  glyphs: "${SET}" all in numeralGlyphs.ts; ${texts.length} figure texts drawn`);

/* The sheet: every mark, left-aligned, 8pt of page between, a 1pt ink tick at the left for scale. */
const GAP = 8 * SCALE;
const SW = Math.max(...rendered.map((r) => r.W)) + 6 * SCALE;
const SH = rendered.reduce((s, r) => s + r.H + GAP, GAP);
const sheet = new Array(SW * SH).fill(PAGE);
let top = GAP;
for (const r of rendered) {
  // 1pt by 1pt grey tick, vertically centred on the mark's canvas, for scale.
  for (let y = 0; y < SCALE; y++) {
    for (let x = 0; x < SCALE; x++) sheet[(top + Math.floor(r.H / 2) + y) * SW + SCALE + x] = PLATE_GREY;
  }
  for (let y = 0; y < r.H; y++) {
    for (let x = 0; x < r.W; x++) sheet[(top + y) * SW + 6 * SCALE + x] = r.px[y * r.W + x];
  }
  top += r.H + GAP;
}
writeFileSync(join(OUT, 'sheet@3x.png'), png(SW, SH, sheet));

const rows = rendered
  .map(
    (r) =>
      `<tr><td><img src="${r.name}@3x.png" width="${r.W / SCALE}" height="${r.H / SCALE}" style="image-rendering:auto"></td>` +
      `<td><b>${r.name}</b><br>${r.what}<br><span>box ${r.shape.box.w} x ${r.shape.box.h} pt · ${
        Number.isNaN(r.lo) ? 'the press' : `ink ${r2(r.lo)} to ${r2(r.hi)} pt`
      }</span></td></tr>`,
  )
  .join('\n');
writeFileSync(
  join(OUT, 'index.html'),
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pen details</title>
<style>body{margin:24px;font:14px/1.45 -apple-system,system-ui,sans-serif;color:#0A0A0A;background:#fff}
table{border-collapse:collapse}td{padding:10px 16px 10px 0;vertical-align:middle;border-bottom:1px solid #E3E3E3}
span{color:#5C5C5C}img{display:block}</style>
<h1>Pen details, v4.6 to v4.9</h1>
<p>Generated by <code>scripts/render-details.mjs</code> from <code>src/components/details/penPath.ts</code>, and since v4.9 <code>doodlePath.ts</code>, <code>framePath.ts</code> and <code>numeralPath.ts</code>. Each image is 3x, shown at 1x here; open the PNG for 1:1 device pixels. <code>sheet@3x.png</code> holds all of them.</p>
<table>${rows}</table>
`,
);
console.log(`\n  wrote ${rendered.length * 2 + 2} files to specs/v4.6-details/build/\n`);
