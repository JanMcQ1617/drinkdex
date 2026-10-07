/**
 * WCAG contrast audit for the Sipply palette.
 *
 * Run: node scripts/check-contrast.mjs
 *
 * Exits 1 if any declared pair fails its target ratio, or if a colour that
 * must never be drawn over a photograph could be (see FORBIDDEN_OVER_MEDIA).
 * Exits 2 if something it measures can no longer be read: a colour missing
 * from src/constants/theme.ts, an `onMedia` entry it cannot resolve or has
 * not been told how to measure (MEDIA_ROLES), or a grain tile
 * (assets/images/grain.png) that no longer matches the numbers theme.ts
 * declares for it.
 *
 * Targets: 4.5:1 for body text, 3:1 for large text, glyphs and the edges
 * that identify a control (WCAG 1.4.11), and 2:1 for the two design floors
 * that are not WCAG at all but keep a locked drink from reading as empty.
 */

import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const lum = (h) => {
  const [r, g, b] = hex(h).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** An rgba fill composited over an opaque ground, as the eye sees it. */
const over = ([r, g, b, a], ground) => {
  const base = hex(ground);
  return (
    '#' +
    [r, g, b]
      .map((c, i) => Math.round(c * a + base[i] * (1 - a)))
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
};

/** Stop the audit: something it measures could not be read. */
const unreadable = (why) => {
  console.error(`\n  check-contrast: ${why}\n`);
  process.exit(2);
};

/* ==================================================================== */
/* The palette, read from theme.ts                                      */
/*                                                                      */
/* This used to be a hand-kept mirror ("change there, change here").    */
/* The page moved from #FFFDF9 to cream #F7F2EA and the mirror did not, */
/* so every "on page" pair was measured against a colour the app no     */
/* longer drew, and textFaint passed at 3.11:1 while shipping at        */
/* 2.84:1. Reading the source removes the second copy instead of asking */
/* someone to remember it.                                              */
/*                                                                      */
/* Only the plain `key: '#RRGGBB'` and `key: 'rgba(r, g, b, a)'`         */
/* entries are picked up, from the code with its comments dropped (a    */
/* note such as "was textMuted: '#9A8F85'" would otherwise be read as   */
/* the token); a pair that needs a translucent colour composites it     */
/* explicitly, over the ground it is drawn on.                          */
/* ==================================================================== */

const THEME = readFileSync(new URL('../src/constants/theme.ts', import.meta.url), 'utf8');

function section(start, end) {
  const from = THEME.indexOf(start);
  const to = from < 0 ? -1 : THEME.indexOf(end, from);
  if (from < 0 || to < 0) unreadable(`cannot find \`${start}\` … \`${end}\` in theme.ts.`);
  return THEME.slice(from, to);
}

/** Source text with its comments removed, so a note that names a value is not read as one. */
const uncommented = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const COLORS = uncommented(section('export const colors = {', '} as const;'));

const found = {};
for (const [, key, value] of COLORS.matchAll(/(\w+):\s*'(#[0-9A-Fa-f]{6})'/g)) {
  found[key] = value.toUpperCase();
}

/*
 * The translucent colours in `colors` (the scrims, the edges and fills on
 * lining), read the same way, so a pair that composites one over a ground
 * uses the value the app draws rather than a copy of its numbers.
 */
const foundRgba = {};
for (const [, key, r, g, b, a] of COLORS.matchAll(
  /(\w+):\s*'rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)'/g,
)) {
  foundRgba[key] = [Number(r), Number(g), Number(b), Number(a)];
}

/*
 * Categories are derived, not listed, so a category added to theme.ts is
 * audited without anyone remembering to add it here.
 */
const CATEGORIES = [
  ...section('export const CATEGORY_META', '\n};').matchAll(
    /(\w+):\s*\{\s*label:[^}]*?\bcolor:\s*'(#[0-9A-Fa-f]{6})',\s*wash:\s*'(#[0-9A-Fa-f]{6})'/g,
  ),
].map(([, key, color, wash]) => ({ key, color, wash }));

/*
 * A misspelt or deleted token must fail the audit, not quietly test
 * `undefined` — so C exits with code 2 on any key theme.ts no longer
 * defines.
 */
const C = new Proxy(found, {
  get(target, key) {
    if (typeof key === 'string' && !(key in target)) {
      unreadable(`colors.${key} is not defined in theme.ts.`);
    }
    return target[key];
  },
});

/** The same guard for the rgba entries of `colors`. */
const R = new Proxy(foundRgba, {
  get(target, key) {
    if (typeof key === 'string' && !(key in target)) {
      unreadable(`colors.${key} is not an rgba value in theme.ts.`);
    }
    return target[key];
  },
});

/*
 * The worst case under anything drawn over a photograph or a video: a
 * blown-out white frame, for the light ink that is all of onMedia's text
 * but one. The legendary plaque's ink is dark, and for dark ink on a
 * translucent fill the worst frame is a black one, so a plaque is
 * measured over whichever of the two is worse (plaqueGround). Neither is
 * a token, because the app never paints them; the picture does.
 */
const WHITE_FRAME = '#FFFFFF';
const BLACK_FRAME = '#000000';

/*
 * Every category in CATEGORY_ORDER must have been parsed. A reordered or
 * reformatted CATEGORY_META entry would otherwise drop out of the audit
 * silently, which is the drift this file exists to prevent.
 */
const ORDER = [
  ...(/export const CATEGORY_ORDER[^=]*=\s*\[([^\]]*)\]/.exec(THEME)?.[1] ?? '').matchAll(
    /'(\w+)'/g,
  ),
].map(([, key]) => key);
const unparsed = ORDER.filter((key) => !CATEGORIES.some((c) => c.key === key));
if (ORDER.length === 0) unreadable('cannot read CATEGORY_ORDER in theme.ts.');
if (unparsed.length > 0) unreadable(`no color/wash parsed for ${unparsed.join(', ')} in CATEGORY_META.`);

/*
 * The two signup accents with no token of their own (see SIGNUP_ACCENTS).
 * Read from their named constants in theme.ts, for the same reason the
 * palette is: this list used to hold its own copy of the two hex values.
 */
const ACCENTS = {};
for (const [, key, value] of THEME.matchAll(/^const (ACCENT_\w+) = '(#[0-9A-Fa-f]{6})';$/gm)) {
  ACCENTS[key] = value.toUpperCase();
}
for (const key of ['ACCENT_AMBER', 'ACCENT_PLUM']) {
  if (!ACCENTS[key]) unreadable(`${key} is not defined in theme.ts.`);
}

/* ==================================================================== */
/* The grain, measured                                                  */
/*                                                                      */
/* Every ground in v3 is grained, and grain is a real pixel under the   */
/* text: on the lining (7.8% of a 232 grey) it lifts the ground enough  */
/* to cost onLining two points of contrast. So the audit decodes the    */
/* tile itself rather than trusting the numbers theme.ts writes about   */
/* it, stops if the two disagree, and measures each ink against the     */
/* worst pixel the tile can put under it: the brightest over a dark     */
/* ground, the darkest over paper.                                      */
/* ==================================================================== */

const GRAIN_SRC = uncommented(section('export const grain = {', '} as const;'));
const grainNumber = (src, key, what) => {
  const m = new RegExp(`\\b${key}:\\s*([\\d.]+)`).exec(src);
  if (!m) unreadable(`cannot read ${what} in theme.ts's \`grain\`.`);
  return Number(m[1]);
};
const TILE_SRC = /\btile:\s*\{([^}]*)\}/.exec(GRAIN_SRC)?.[1];
if (!TILE_SRC) unreadable("cannot read grain.tile in theme.ts's `grain`.");
const GRAIN = {
  tile: {
    min: grainNumber(TILE_SRC, 'min', 'grain.tile.min'),
    max: grainNumber(TILE_SRC, 'max', 'grain.tile.max'),
    alpha: grainNumber(TILE_SRC, 'alpha', 'grain.tile.alpha'),
  },
  paper: grainNumber(GRAIN_SRC.replace(TILE_SRC, ''), 'paper', 'grain.paper'),
  lining: grainNumber(GRAIN_SRC.replace(TILE_SRC, ''), 'lining', 'grain.lining'),
};
// An opacity outside 0..1 is clamped by React Native, so what it measured would not be what draws.
for (const key of ['paper', 'lining']) {
  if (!(GRAIN[key] > 0 && GRAIN[key] <= 1)) unreadable(`grain.${key} is ${GRAIN[key]}, not an opacity in (0, 1].`);
}

/**
 * The pixels of a PNG in the one format the grain tile is saved in: 8-bit
 * RGBA, not interlaced, scanline filters 0 to 4. Anything else is not the
 * file theme.ts describes, so it stops the audit rather than being guessed.
 */
function readRgbaPng(url) {
  const file = readFileSync(url);
  const name = url.pathname.split('/').slice(-3).join('/');
  if (file.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') unreadable(`${name} is not a PNG.`);
  let header = null;
  const data = [];
  for (let at = 8; at + 8 <= file.length; ) {
    const length = file.readUInt32BE(at);
    const type = file.toString('latin1', at + 4, at + 8);
    const body = file.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
    } else if (type === 'IDAT') data.push(body);
    else if (type === 'IEND') break;
    at += 12 + length; // length, type, body, CRC
  }
  if (!header || header.depth !== 8 || header.colorType !== 6 || header.interlace !== 0) {
    unreadable(`${name} is not an 8-bit, non-interlaced RGBA PNG.`);
  }
  const { width, height } = header;
  const stride = width * 4;
  const raw = inflateSync(Buffer.concat(data));
  if (raw.length !== height * (stride + 1)) unreadable(`${name}: image data is ${raw.length} bytes, not ${height * (stride + 1)}.`);
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? px[row + x - 4] : 0;
      const up = y > 0 ? px[row - stride + x] : 0;
      const corner = x >= 4 && y > 0 ? px[row - stride + x - 4] : 0;
      let predict;
      if (filter === 0) predict = 0;
      else if (filter === 1) predict = left;
      else if (filter === 2) predict = up;
      else if (filter === 3) predict = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - corner)];
        predict = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
      } else unreadable(`${name}: unknown scanline filter ${filter} on row ${y}.`);
      px[row + x] = (line[x] + predict) & 255;
    }
  }
  return { width, height, px };
}

const tile = readRgbaPng(new URL('../assets/images/grain.png', import.meta.url));
const measured = { min: 255, max: 0, alphaMin: 255, alphaMax: 0, grey: true };
for (let i = 0; i < tile.px.length; i += 4) {
  const [r, g, b, a] = tile.px.subarray(i, i + 4);
  if (r !== g || g !== b) measured.grey = false;
  measured.min = Math.min(measured.min, r);
  measured.max = Math.max(measured.max, r);
  measured.alphaMin = Math.min(measured.alphaMin, a);
  measured.alphaMax = Math.max(measured.alphaMax, a);
}
if (
  !measured.grey ||
  measured.alphaMin !== measured.alphaMax ||
  measured.min !== GRAIN.tile.min ||
  measured.max !== GRAIN.tile.max ||
  measured.alphaMin !== GRAIN.tile.alpha
) {
  unreadable(
    `assets/images/grain.png measures ${measured.grey ? 'grey' : 'NOT grey'} ` +
      `${measured.min}..${measured.max}, alpha ${measured.alphaMin}` +
      `${measured.alphaMax === measured.alphaMin ? '' : `..${measured.alphaMax}`}; ` +
      `theme.ts's grain.tile says grey ${GRAIN.tile.min}..${GRAIN.tile.max}, alpha ${GRAIN.tile.alpha}. ` +
      'Make them agree before measuring anything over grain.',
  );
}

/** The worst grain pixel over a ground: the tile's alpha times the ground's opacity. */
const grained = (grey, opacity, ground) =>
  over([grey, grey, grey, (measured.alphaMin / 255) * opacity], ground);
const WORST = {
  // Dark grounds: the brightest pixel lifts them toward light ink.
  lining: grained(measured.max, GRAIN.lining, C.lining),
  cellar: grained(measured.max, GRAIN.lining, C.liningDeep),
  // Paper: the darkest pixel sinks it toward dark ink.
  paper: grained(measured.min, GRAIN.paper, C.bg),
};

/* ==================================================================== */
/* onMedia, read as the app reads it                                    */
/*                                                                      */
/* Everything drawn over a photograph comes from this one object, and    */
/* for its light ink the worst photograph is a white one. Each text     */
/* colour in it is measured over the worst frame under the scrim or     */
/* plaque it sits on, every entry must be one the audit knows, and the  */
/* lining inks, which fail there, are asserted to stay out.             */
/* ==================================================================== */

/** `{ key: value, … }` where a value is a nested block, a `colors.x` reference or a colour literal. */
function parseBlock(src) {
  const tokens = uncommented(src).match(/[{}:,]|'[^']*'|[\w$.]+/g) ?? [];
  let k = tokens.indexOf('{') + 1;
  const block = () => {
    const out = {};
    while (k < tokens.length && tokens[k] !== '}') {
      const key = tokens[k++];
      if (tokens[k++] !== ':') unreadable(`cannot read onMedia at \`${key}\` in theme.ts.`);
      out[key] = tokens[k] === '{' ? (k++, block()) : tokens[k++];
      if (tokens[k] === ',') k++;
    }
    k++;
    return out;
  };
  return block();
}

const ON_MEDIA = parseBlock(section('export const onMedia = {', '} as const;'));

/*
 * What each onMedia entry is. Everything in onMedia reaches a photograph,
 * so a key added there must be one this audit measures or knows it need
 * not, or it would be drawn over a white photo unmeasured: text (`ink`, a
 * plaque's ink) is asserted on what it sits on, scrims and fills are the
 * grounds those pairs use, the sparkle is a glyph, and edges, rules and
 * the text shadow carry nothing alone (the plaque's word says the tier).
 */
const MEDIA_ROLES = [
  [/^ink$/, 'text'],
  [/^plaque\.\w+\.ink$/, 'text'],
  [/^glyphGilt$/, 'glyph'],
  [/^scrim(Clear|Mid|Deep)$/, 'scrim'],
  [/^markerFill$/, 'fill'],
  [/^plaque\.\w+\.fill$/, 'fill'],
  [/^markerEdge$/, 'edge'],
  [/^plaque\.\w+\.edge$/, 'edge'],
  [/^rule\.\w+$/, 'rule'],
  [/^shadow$/, 'text shadow'],
];
const mediaPaths = (node, path = []) =>
  typeof node === 'string'
    ? [path.join('.')]
    : Object.entries(node).flatMap(([key, child]) => mediaPaths(child, [...path, key]));
const unclassed = mediaPaths(ON_MEDIA).filter((path) => !MEDIA_ROLES.some(([re]) => re.test(path)));
if (unclassed.length > 0) {
  unreadable(
    `${unclassed.map((path) => `onMedia.${path}`).join(', ')}: new over media. Say in MEDIA_ROLES ` +
      'what it is (text, glyph, scrim, fill, edge, rule) and measure it before it reaches a photo.',
  );
}

/** An onMedia entry as a colour: `{ hex }` or `{ rgba }`, from `colors` or a literal. */
function mediaColour(path) {
  const ref = path.split('.').reduce((node, key) => node?.[key], ON_MEDIA);
  if (typeof ref !== 'string') unreadable(`onMedia.${path} is missing from theme.ts.`);
  let m = /^colors\.(\w+)$/.exec(ref);
  if (m) {
    if (m[1] in found) return { hex: found[m[1]], name: `colors.${m[1]}` };
    if (m[1] in foundRgba) return { rgba: foundRgba[m[1]], name: `colors.${m[1]}` };
    unreadable(`onMedia.${path} points at colors.${m[1]}, which theme.ts does not define.`);
  }
  if ((m = /^'(#[0-9A-Fa-f]{6})'$/.exec(ref))) return { hex: m[1].toUpperCase(), name: m[1] };
  if ((m = /^'rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)'$/.exec(ref))) {
    return { rgba: m.slice(1).map(Number), name: ref };
  }
  return unreadable(`onMedia.${path} is \`${ref}\`, which this audit cannot read.`);
}

/** A colour drawn over media, as it lands on a white frame. */
const onWhite = (c) => c.hex ?? over(c.rgba, WHITE_FRAME);

/** A plaque's fill under its ink, over the frame (white or black) that is worse for that ink. */
const plaqueGround = (ink, fill) =>
  fill.hex ??
  [over(fill.rgba, WHITE_FRAME), over(fill.rgba, BLACK_FRAME)].reduce((a, b) =>
    ratio(ink, a) <= ratio(ink, b) ? a : b,
  );

/** Text over media is opaque: a translucent ink would take the picture's colour. */
function mediaInk(path) {
  const c = mediaColour(path);
  if (!c.hex) unreadable(`onMedia.${path} is translucent; text over media must be opaque.`);
  return c.hex;
}

const PLAQUES = Object.keys(ON_MEDIA.plaque ?? {});
for (const tier of ['neutral', 'rare', 'legendary']) {
  if (!PLAQUES.includes(tier)) unreadable(`onMedia.plaque.${tier} is missing from theme.ts.`);
}
const MEDIA = {
  ink: mediaInk('ink'),
  scrimMid: onWhite(mediaColour('scrimMid')),
  scrimDeep: onWhite(mediaColour('scrimDeep')),
  markerFill: onWhite(mediaColour('markerFill')),
  glyphGilt: mediaInk('glyphGilt'),
};
/** Every colour onMedia sets text in: `ink` and each plaque's ink. */
const MEDIA_TEXT = [
  ['ink', MEDIA.ink],
  ...PLAQUES.map((tier) => [`plaque.${tier}.ink`, mediaInk(`plaque.${tier}.ink`)]),
];

/*
 * Never over media (specs/v3-cabinet.md section 4.4). Each of these is
 * legible on its own ground and fails 4.5:1 at the shallowest scrim stop
 * over a white photo, so none may ever be an onMedia text colour: rarity
 * over a photo is a solid plaque, and the only ink is onMedia's.
 */
const FORBIDDEN_OVER_MEDIA = [
  'onLining',
  'onLiningMuted',
  'onLiningFaint',
  'giltOnLining',
  'rareOnLining',
  'taupe',
  'reelInkDim',
  'wineSoft',
];

/* ==================================================================== */
/* The pairs                                                            */
/* ==================================================================== */

/** The grounds an ink on lining stands on: flat, and at the worst grain pixel. */
const LINING_GROUNDS = [
  ['lining', C.lining],
  ['cellar', C.liningDeep],
  ['lining, worst grain pixel', WORST.lining],
  ['cellar, worst grain pixel', WORST.cellar],
];

// [foreground, background, minimum, label], or a heading string.
const PAIRS = [
  [C.text, C.bg, 4.5, 'body text on page'],
  [C.text, C.surface, 4.5, 'body text on card'],
  [C.text, C.card, 4.5, 'body text on Card'],
  [C.text, C.cardAlt, 4.5, 'body text on alt card'],
  [C.text, C.bgSunk, 4.5, 'body text on sunk well'],
  [C.textMuted, C.bg, 4.5, 'muted text on page'],
  [C.textMuted, C.surface, 4.5, 'muted text on card'],
  [C.textMuted, C.bgSunk, 4.5, 'muted text on sunk well'],
  [C.textMuted, C.wineWash, 4.5, 'muted text on a wine-wash note card'],
  // textFaint is large type and glyphs only (≥3:1). It is tested on every
  // ground theme.ts allows it on, down to the sunk well, the darkest of
  // them. The Dex slot recess is darker still and is off limits to it
  // (2.90:1), so it has no pair here.
  [C.textFaint, C.bg, 3.0, 'faint glyph / large text on page'],
  [C.textFaint, C.surface, 3.0, 'faint glyph / large text on card'],
  [C.textFaint, C.bgSunk, 3.0, 'faint glyph on sunk well'],
  [C.wine, C.bg, 4.5, 'wine text on page'],
  [C.wine, C.surface, 4.5, 'wine text on card'],
  [C.wine, C.bgSunk, 4.5, 'wine text on sunk well'],
  [C.wine, C.wineWash, 4.5, 'wine text on its own wash'],
  [C.merlot, C.bg, 4.5, 'merlot text on page'],
  [C.giltInk, C.bg, 4.5, 'gilt text on page'],
  [C.giltInk, C.surface, 4.5, 'gilt text on card'],
  [C.danger, C.bg, 4.5, 'danger text on page (dangerText button)'],
  [C.danger, C.surface, 4.5, 'danger text on a card (dangerText button)'],
  [C.danger, C.dangerWash, 4.5, 'danger text on its wash (danger button, form errors)'],
  [C.success, C.bg, 4.5, 'success text on page'],
  [C.textOnWine, C.wine, 4.5, 'text on wine button'],
  [C.textOnGilt, C.gilt, 4.5, 'text on gilt button'],
  [C.giltGlyph, C.bg, 3.0, 'gilt UI glyph on page'],
  [C.giltGlyph, C.surface, 3.0, 'gilt UI glyph on card'],
  [C.textOnWine, C.lockInk, 4.5, 'text on locked artwork'],
  // Taupe. Decorative on light grounds (1.68:1 on page — deliberately
  // untested as type there); readable only on wine and espresso, where the
  // intro sets its tagline, and a glyph on lining (section 4.1 below).
  [C.taupe, C.wine, 4.5, 'tagline (taupe) on wine'],
  [C.taupe, C.lockInk, 4.5, 'tagline (taupe) on espresso'],
  [C.taupeInk, C.bg, 4.5, 'taupe label on page'],
  [C.taupeInk, C.taupeWash, 4.5, 'taupe label on its own wash'],
  // Intro: type on the wine ground of the pour.
  [C.textOnWine, C.wine, 4.5, 'intro wordmark (bone) on wine'],
  [C.textOnWine, C.wineDeep, 4.5, 'intro wordmark (bone) on wine-deep'],
  // Categories must be readable as chip/label text, and the card name sits
  // on a near-opaque plate over the category field, whose darkest stop is
  // the wash — so the wash is the honest backdrop for it.
  ...CATEGORIES.flatMap(({ key, color, wash }) => [
    [color, C.bg, 4.5, `${key} label on page`],
    [color, wash, 4.5, `${key} label on its wash`],
    [C.text, wash, 4.5, `card name over ${key} field`],
    [C.taupeInk, wash, 4.5, `dex number over ${key} field`],
  ]),
  // The `dexNumber` style (theme.ts): taupeInk at 11pt, on a white card in
  // the feed and on the page elsewhere. Not on the empty-slot recess, where
  // it is 4.36:1 and the number takes textMuted instead.
  [C.taupeInk, C.surface, 4.5, 'dex number on a card'],
  // Two signup accents that outlived the beer and wine categories (see
  // SIGNUP_ACCENTS). Profiles store them as hex, so they still ring avatars
  // and fill the edit-profile swatches.
  [ACCENTS.ACCENT_AMBER, C.bg, 4.5, 'brass accent on page'],
  [ACCENTS.ACCENT_PLUM, C.bg, 4.5, 'plum accent on page'],
  // Rarity is the frame material: hairline -> taupe -> wine -> gilt.
  [C.textMuted, C.bg, 4.5, 'common label on page'],
  [C.taupeInk, C.bg, 4.5, 'uncommon label on page'],
  [C.wine, C.bg, 4.5, 'rare label on page'],
  [C.giltInk, C.bg, 4.5, 'legendary label on page'],
  [C.textMuted, C.cardBorder, 4.5, 'common label on its wash'],
  [C.taupeInk, C.taupeWash, 4.5, 'uncommon label on its wash'],
  [C.wine, C.wineWash, 4.5, 'rare label on its wash'],
  [C.giltInk, C.giltWash, 4.5, 'legendary label on its wash'],
  // Dex grid — build 13's light empty slot. Its nameplate sits on
  // DexCard's `recessWash`, which is OPAQUE `slot` under every line of the
  // name and number, so `slot` is the exact ground here, not a stand-in.
  // No text lands on bare slotDeep. v3's slot is the cellar (section 4.1
  // below) and puts no text on `slot`; these three leave in stage 3.
  [C.textMuted, C.slot, 4.5, 'entry name on empty slot'],
  [C.textMuted, C.cardAlt, 4.5, 'entry name on the bone nameplate'],
  [C.textMuted, C.cardAlt, 3.0, 'dex number on the bone plate (secondary)'],
  [C.text, C.slot, 4.5, 'body text on empty slot'],
  [C.wine, C.slot, 4.5, 'progress count on the empty-slot recess'],
  // Continue with Facebook: a Button-sized label, 16pt semibold, which is
  // not large text, so it needs 4.5:1 — the reason colors.facebook is the
  // 2023 blue and not #1877F2 (4.23:1). The solid mark on the button is
  // the same white on the same blue.
  [C.onFacebook, C.facebook, 4.5, 'Continue with Facebook label on Facebook blue'],
  // The outline mark, if a Connect Facebook row draws it in Facebook blue.
  [C.facebook, C.bg, 3.0, 'Facebook mark on page'],
  [C.facebook, C.surface, 3.0, 'Facebook mark on a card'],
  // colors.filmPaper has no pair: it is the intro film's ground, and
  // nothing is written on it (theme.ts says why). Nor do the four google*
  // colours: they fill the G and carry no text.

  // v2 edges. `line` is decorative (cards, chips, rules) and never the only
  // thing that identifies a control, so it has no pair. Input edges and the
  // ink outline are non-text UI that identifies a control: 3:1 (WCAG 1.4.11).
  [C.lineControl, C.surface, 3.0, 'input edge on its white fill'], // 3.91
  [C.lineControl, C.bg, 3.0, 'input edge against the page'], // 3.51
  [C.lineInk, C.surface, 3.0, 'secondary button edge / focus ring'], // 15.37
  [C.textOnWine, C.wineDeep, 4.5, 'primary button label, pressed'], // 13.32

  // The espresso tab bar: Reels' skin in build 13, every tab's in v3.
  [C.reelInk, C.reelBar, 4.5, 'active tab on the dark bar'], // 15.13
  [C.reelInkDim, C.reelBar, 4.5, 'resting tab label on the dark bar'], // 5.86
  // Build 13's dark log action: a wine plus on bone. v3 draws the plus the
  // other way round, bone on wine (section 4.5 below); the same pair also
  // holds the rare plaque's ink (section 4.4).
  [C.wine, C.reelInk, 4.5, 'plus glyph on the log action, dark bar'], // 13.53

  // Reels: the dark ground, and words and controls over video. Every rgba
  // is composited over a blown-out white frame, the worst case under it.
  [C.reelInk, C.reelGround, 4.5, 'text on the reels ground'],
  [C.reelInkMuted, C.reelGround, 4.5, 'secondary text on the reels ground'],
  [C.record, C.reelGround, 3.0, 'record core glyph on the reels ground'],
  [C.wineSoft, C.reelGround, 3.0, 'liked heart and heart burst on the reels ground'], // 4.02
  [C.reelGround, C.reelInk, 4.5, 'onDark button label (and a selected media control)'], // 19.29
  [C.reelGround, C.reelInkMuted, 4.5, 'onDark button label, pressed'],
  [C.reelInk, over(R.reelControlFill, WHITE_FRAME), 3.0, 'control glyph on its chip over a white frame'], // 4.27
  [C.reelInk, over(R.reelScrimMid, WHITE_FRAME), 4.5, 'caption at the shallow end of the scrim over a white frame'], // 5.45
  // Markers on photographs (gallery count, stack, duration) sit on
  // reelScrim with reelInk. The paper `scrim` with bone type failed 4.5:1
  // over a bright photo.
  [C.reelInk, over(R.reelScrim, WHITE_FRAME), 4.5, 'marker text on media over a white frame'], // 9.98

  /*
   * v3 Cabinet, specs/v3-cabinet.md section 4. "Worst grain" is the tile's
   * worst pixel over the ground (WORST, above), which is where the text
   * really lands on a grained surface. The cellar's flat value is the
   * recess, an opaque view with no grain on it; its grained value is the
   * drink page's ground.
   */
  'v3 · 4.1 Ink on lining and cellar',
  ...[
    ['onLining', 4.5, 'titles, body'],
    ['onLiningMuted', 4.5, 'secondary text'],
    ['onLiningFaint', 3.0, 'glyphs, the lock, 18pt and up only'],
    ['giltOnLining', 4.5, 'the word Legendary'],
    ['rareOnLining', 4.5, 'the word Rare'],
    ['dangerOnLining', 4.5, 'Remove from collection'],
  ].flatMap(([key, min, job]) => [
    [C[key], C.lining, min, `${key} on lining (${job})`],
    [C[key], C.liningDeep, min, `${key} on cellar`],
    [C[key], WORST.lining, min, `${key} on lining, worst grain pixel`],
    [C[key], WORST.cellar, min, `${key} on cellar, worst grain pixel`],
  ]),
  // The uncommon dot. It sits on lining and in an empty slot, never on the
  // drink page's grained cellar, so that one has no pair.
  [C.taupe, C.lining, 3.0, 'uncommon dot (taupe) on lining (glyph)'],
  [C.taupe, C.liningDeep, 3.0, 'uncommon dot (taupe) in an empty slot (glyph)'],
  [C.taupe, WORST.lining, 3.0, 'uncommon dot (taupe) on lining, worst grain pixel (glyph)'],
  // The outline button's edge on lining identifies a control: 3:1, as the
  // edge composites over each ground it can stand on.
  ...LINING_GROUNDS.map(([where, ground]) => [
    over(R.liningControl, ground),
    ground,
    3.0,
    `outline-button edge (liningControl) on ${where}`,
  ]),
  // Held, the same button lays liningPressed over that ground, under its
  // label (section 7.1.1). Not in section 4's tables; measured all the same.
  ...LINING_GROUNDS.map(([where, ground]) => [
    C.onLining,
    over(R.liningPressed, ground),
    4.5,
    `outline button held: onLining on liningPressed over ${where}`,
  ]), // 11.18, 12.28, 9.27, 10.07
  [C.lining, C.onLining, 4.5, 'primary label on lining: the bone button (Button onLining)'], // 13.32
  [C.lining, C.onLiningMuted, 4.5, 'the bone button, pressed'], // 6.79
  [C.onLining, C.wine, 4.5, 'bone plus glyph on wine; the rare plaque on paper'], // 10.95

  'v3 · 4.2 Ink on mat (bone card stock)',
  // gilt on mat (3.02) and line on mat (1.45) are decorative rules, the
  // mount's tier rule and its paper edge, so they have no pair.
  [C.text, C.mat, 4.5, 'body text on mat'], // 14.50
  [C.textMuted, C.mat, 4.5, 'muted text on mat'], // 5.78
  [C.taupeInk, C.mat, 4.5, 'number plate on mat (taupeInk)'], // 5.55
  [C.giltInk, C.mat, 4.5, 'the word Legendary on mat'], // 5.62
  [C.wine, C.mat, 4.5, 'spec amounts and the word Rare on mat'], // 12.96
  [C.lineControl, C.mat, 3.0, 'control edge on mat'], // 3.69
  [C.giltGlyph, C.mat, 3.0, 'legendary sparkle on mat (glyph)'], // 3.35

  'v3 · 4.3 Paper, worst grain pixel',
  // giltGlyph has no grain pair: the sparkle is 2.98:1 over the tile's
  // single darkest pixel (3.18 on the flat page, above). It is never the
  // only cue, since the word Legendary always prints beside it, so the
  // flat-page pair stands and a grain pair that fails on a few dark pixels
  // is not added (specs/v3-cabinet.md section 4.3).
  [C.text, WORST.paper, 4.5, 'body text on page, worst grain pixel'],
  [C.textMuted, WORST.paper, 4.5, 'muted text on page, worst grain pixel'], // 5.15
  [C.taupeInk, WORST.paper, 4.5, 'taupe label on page, worst grain pixel'], // 4.95
  [C.giltInk, WORST.paper, 4.5, 'gilt text on page, worst grain pixel'], // 5.01
  [C.wine, WORST.paper, 4.5, 'wine text on page, worst grain pixel'], // 11.56
  [C.textFaint, WORST.paper, 3.0, 'faint glyph / large text on page, worst grain pixel'], // 3.29

  'v3 · 4.4 Over media (onMedia), worst case a white photo',
  [MEDIA.ink, MEDIA.scrimMid, 4.5, 'onMedia.ink on scrimMid, the shallowest stop text may sit on'], // 5.45
  [MEDIA.ink, MEDIA.scrimDeep, 4.5, 'onMedia.ink on scrimDeep, the foot of the nameplate'], // 13.43
  [MEDIA.ink, MEDIA.markerFill, 4.5, 'onMedia.ink on markerFill (plates, markers, counts)'], // 9.98
  ...PLAQUES.map((tier) => [
    mediaInk(`plaque.${tier}.ink`),
    plaqueGround(mediaInk(`plaque.${tier}.ink`), mediaColour(`plaque.${tier}.fill`)),
    4.5,
    `${tier} plaque: its ink on its fill`,
  ]), // rare 13.53, legendary 4.79, neutral 9.98
  [MEDIA.glyphGilt, MEDIA.markerFill, 3.0, 'legendary sparkle (glyphGilt) on a marker (glyph)'], // 4.31

  'v3 · 4.5 Tab bar, and design floors',
  [over(R.logActionEdge, C.reelBar), C.reelBar, 3.0, 'the log action\'s edge (logActionEdge) on the espresso bar'], // 3.02
  [C.textOnWine, C.wine, 4.5, 'plus glyph on the wine log action, every tab'], // 10.95
  // The unread dot keeps the dark skin's wineSoft (section 9.1.1), now on
  // every tab's bar rather than the reels ground above.
  [C.wineSoft, C.reelBar, 3.0, 'badge dot (wineSoft) on the espresso bar, every tab (glyph)'], // 3.15
  // Design floors, not WCAG: a locked drink must still read as a glass
  // pressed into the cellar, and a locked legendary as worth hunting.
  [over(R.debossLight, C.liningDeep), C.liningDeep, 2.0, 'design floor: deboss highlight in an empty slot'], // 2.14
  [over(R.slotEdgeLegendary, C.liningDeep), C.liningDeep, 2.0, 'design floor: an empty legendary slot\'s edge'], // 2.52

  /*
   * v3.1, specs/v3.1-changes.md section 16.2. Home's stories sit on the
   * grained lining, so the ring is measured on the worst grain pixel too.
   * Home's bar floats over the feed with no slab of its own: its ground is
   * a fade of translucent lining, so its ink is measured with that fade
   * composited over the worst thing the feed can put under it, a white
   * photo, and over paper.
   */
  'v3.1 · Stories, Home bar, tournaments',
  // Unseen: lit wine, because wine itself is 1.22:1 on lining. A UI cue (WCAG 1.4.11); the seen ring is decorative.
  [C.storyRing, C.lining, 3.0, 'unseen story ring (storyRing) on lining (UI)'], // 4.37
  [C.storyRing, WORST.lining, 3.0, 'unseen story ring on lining, worst grain pixel (UI)'], // 3.71
  // Your own story's + badge: a bone disc on the lining (v3's unseen tile ring was the same pair), and its wine plus.
  [C.onLining, C.lining, 3.0, "the story + badge's bone disc on lining (UI)"], // 13.32
  [C.wine, C.onLining, 3.0, 'the story + badge: its wine plus on the bone disc (glyph)'], // 10.95
  [C.onLining, over(R.homeBarFoot, WHITE_FRAME), 4.5, "Home bar ink (onLining) at the bar's foot, over a white photo"], // 5.60
  [C.onLining, over(R.homeBarFoot, C.bg), 4.5, "Home bar ink at the bar's foot, over paper"], // 5.91
  [C.onLining, over(R.homeBarTop, WHITE_FRAME), 4.5, "Home bar ink at the bar's top, over a white photo"], // 11.53
  // A tournament's standings: your own row is wineWash.
  [C.text, C.wineWash, 4.5, 'your leaderboard row: text on wineWash'], // 12.78
  [C.textMuted, C.wineWash, 4.5, 'your leaderboard row: muted text on wineWash'], // 5.10
];

/*
 * Pairs printed for the record and never asserted: they explain a rule
 * rather than meet a target.
 */
const NOTES = [
  [C.wine, C.lining, 'wine on lining: why the primary button on lining is bone, never wine'], // 1.22
];

let failed = 0;
let measuredPairs = 0;
console.log('\n  Sipply palette — WCAG contrast audit\n');
console.log(`  page ${C.bg}   card ${C.surface}   mat ${C.mat}   reels ${C.reelGround}`);
console.log(`  lining ${C.lining}   cellar ${C.liningDeep}`);
console.log(
  `  grain.png grey ${measured.min}..${measured.max}, alpha ${measured.alphaMin}: worst pixel ` +
    `paper ${WORST.paper}, lining ${WORST.lining}, cellar ${WORST.cellar}\n`,
);
for (const pair of PAIRS) {
  if (typeof pair === 'string') {
    console.log(`\n  ${pair}\n`);
    continue;
  }
  const [fg, bg, min, label] = pair;
  const r = ratio(fg, bg);
  const ok = r >= min;
  measuredPairs++;
  if (!ok) failed++;
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2).padStart(5)}:1  (min ${min})  ${label}   ${fg} on ${bg}`,
  );
}

for (const [fg, bg, label] of NOTES) {
  console.log(`  NOTE  ${ratio(fg, bg).toFixed(2).padStart(5)}:1  (not a pair)  ${label}   ${fg} on ${bg}`);
}

/*
 * Each never-over-media colour, against the shallowest scrim over a white
 * photo. Two things must hold: it fails 4.5:1 there (if one ever passed,
 * its place on this list should be reconsidered on purpose, not kept by
 * habit), and onMedia sets no text in it.
 */
console.log('\n  v3 · 4.4 Never over media: below 4.5:1 on scrimMid over white, and no onMedia text colour\n');
let forbiddenFailed = 0;
for (const key of FORBIDDEN_OVER_MEDIA) {
  const value = C[key];
  const r = ratio(value, MEDIA.scrimMid);
  const usedAs = MEDIA_TEXT.filter(([, ink]) => ink === value).map(([path]) => `onMedia.${path}`);
  const problems = [
    ...(r >= 4.5 ? ['now clears 4.5:1 over media; take it off the list deliberately'] : []),
    ...(usedAs.length ? [`is the value of ${usedAs.join(', ')}`] : []),
  ];
  if (problems.length) forbiddenFailed++;
  console.log(
    `  ${problems.length ? 'FAIL' : 'PASS'}  FORBIDDEN over media (${r.toFixed(2)}:1)  ${key}` +
      `${problems.length ? `: ${problems.join('; ')}` : ''}   ${value} on ${MEDIA.scrimMid}`,
  );
}

const total = failed + forbiddenFailed;
console.log(
  total === 0
    ? `\n  All ${measuredPairs} pairs pass, and all ${FORBIDDEN_OVER_MEDIA.length} never-over-media colours stay off media.\n`
    : `\n  ${failed} of ${measuredPairs} pairs FAIL; ${forbiddenFailed} of ${FORBIDDEN_OVER_MEDIA.length} never-over-media checks FAIL.\n`,
);
process.exit(total === 0 ? 0 : 1);
