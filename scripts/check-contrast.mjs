/**
 * WCAG contrast audit for the Sipply palette (v4 "Daylight").
 *
 * Run: node scripts/check-contrast.mjs
 *
 * Exits 1 if any declared pair fails its target ratio, if a pair that must
 * stay unreadable has become readable (NEVER), or if a hue other than the
 * one accent has crept into the palette (ONE HUE). Exits 2 if something it
 * measures can no longer be read: a colour missing from
 * src/constants/theme.ts, or an `onMedia` entry it has not been told how
 * to measure (MEDIA_ROLES).
 *
 * Targets: 4.5:1 for body text, 3:1 for large text, glyphs and the edges
 * that identify a control (WCAG 1.4.11). The pairs are
 * specs/v4-mockups/white/spec.md section 1.2, read against the values the
 * app draws: this file holds no copy of the palette.
 */

import { readFileSync } from 'node:fs';

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

/** The hue angle in degrees (HSL), or null for a grey. */
const hue = (h) => {
  const [r, g, b] = hex(h).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return null;
  const h6 = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h6 * 60;
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
/* Only the plain `key: '#RRGGBB'` and `key: 'rgba(r, g, b, a)'`         */
/* entries are picked up, from the code with its comments dropped (a    */
/* note such as "was textMuted: '#9A8F85'" would otherwise be read as   */
/* the token).                                                          */
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
const foundRgba = {};
for (const [, key, r, g, b, a] of COLORS.matchAll(
  /(\w+):\s*'rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)'/g,
)) {
  foundRgba[key] = [Number(r), Number(g), Number(b), Number(a)];
}

/** A misspelt or deleted token stops the audit rather than quietly testing `undefined`. */
const C = new Proxy(found, {
  get(target, key) {
    if (typeof key === 'string' && !(key in target)) unreadable(`colors.${key} is not defined in theme.ts.`);
    return target[key];
  },
});
const R = new Proxy(foundRgba, {
  get(target, key) {
    if (typeof key === 'string' && !(key in target)) unreadable(`colors.${key} is not an rgba value in theme.ts.`);
    return target[key];
  },
});

/*
 * Categories are derived, not listed, so a category added to theme.ts is
 * audited without anyone remembering to add it here.
 */
const CATEGORIES = [
  ...section('export const CATEGORY_META', '\n};').matchAll(
    /(\w+):\s*\{\s*label:[^}]*?\bcolor:\s*'(#[0-9A-Fa-f]{6})',\s*wash:\s*'(#[0-9A-Fa-f]{6})'/g,
  ),
].map(([, key, color, wash]) => ({ key, color: color.toUpperCase(), wash: wash.toUpperCase() }));
const ORDER = [
  ...(/export const CATEGORY_ORDER[^=]*=\s*\[([^\]]*)\]/.exec(THEME)?.[1] ?? '').matchAll(/'(\w+)'/g),
].map(([, key]) => key);
const unparsed = ORDER.filter((key) => !CATEGORIES.some((c) => c.key === key));
if (ORDER.length === 0) unreadable('cannot read CATEGORY_ORDER in theme.ts.');
if (unparsed.length > 0) unreadable(`no color/wash parsed for ${unparsed.join(', ')} in CATEGORY_META.`);

/* ==================================================================== */
/* One hue                                                              */
/*                                                                      */
/* Daylight is black and white: every value R = G = B, with ONE accent  */
/* (v4.4, Campari: `accent` and its held fill `accentPressed`, one hue  */
/* at two depths; `onAccent` is white and is held to neutral like any   */
/* other value). The other exceptions are quotations of someone else's  */
/* mark (Facebook's blue, Google's four colours and its outline grey)   */
/* and the intro film's sampled paper, which carry no text of ours. A   */
/* hue anywhere else fails, and so does an accent that is no longer     */
/* Campari: either depth more than ACCENT_DRIFT from CAMPARI_HUE. So    */
/* the family stays one hue, and the one Jan picked. Retuning a depth   */
/* is a palette edit; swapping the hue (a blue would pass every pair)   */
/* is a new accent, his call, made here with theme.ts and white spec    */
/* 1.3 together.                                                        */
/* ==================================================================== */

const ACCENT = ['accent', 'accentPressed'];
/** Campari's hue in degrees (HSL): accent sits at 351.3, accentPressed at 351.2. The family, not a copy of a value. */
const CAMPARI_HUE = 351;
/** How far, in degrees, either depth may sit from CAMPARI_HUE and still be Campari. */
const ACCENT_DRIFT = 2;
/** Degrees round the wheel from CAMPARI_HUE; a grey is no hue at all. */
const offHue = (h) =>
  h == null ? Infinity : Math.min(Math.abs(h - CAMPARI_HUE), 360 - Math.abs(h - CAMPARI_HUE));
const [accentHue, pressedHue] = ACCENT.map((key) => hue(C[key]));
const oneHue = offHue(accentHue) <= ACCENT_DRIFT && offHue(pressedHue) <= ACCENT_DRIFT;

const QUOTATIONS = new Set([
  'facebook',
  'googleBlue',
  'googleGreen',
  'googleYellow',
  'googleRed',
  'providerEdge',
  'filmPaper',
]);
const tinted = [
  ...Object.entries(found)
    .filter(([key]) => !QUOTATIONS.has(key) && !ACCENT.includes(key))
    .filter(([, value]) => new Set(hex(value)).size > 1)
    .map(([key, value]) => `colors.${key} ${value}`),
  ...Object.entries(foundRgba)
    .filter(([, [r, g, b]]) => r !== g || g !== b)
    .map(([key, v]) => `colors.${key} rgba(${v.join(', ')})`),
  ...CATEGORIES.flatMap(({ key, color, wash }) =>
    [color, wash].filter((v) => new Set(hex(v)).size > 1).map((v) => `CATEGORY_META.${key} ${v}`),
  ),
];

/* ==================================================================== */
/* onMedia, read as the app reads it                                    */
/*                                                                      */
/* Over a photograph Daylight sets only a solid ink plate with onInk on */
/* it. Each entry must be one this audit knows how to measure.          */
/* ==================================================================== */

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
const MEDIA_ROLES = { ink: 'text', fill: 'plate', ring: 'ring', edge: 'decorative edge' };
const unclassed = Object.keys(ON_MEDIA).filter((key) => !(key in MEDIA_ROLES));
if (unclassed.length > 0) {
  unreadable(
    `${unclassed.map((key) => `onMedia.${key}`).join(', ')}: new over media. Say in MEDIA_ROLES what it is ` +
      'and measure it before it reaches a photo.',
  );
}
function mediaHex(key) {
  const m = /^colors\.(\w+)$/.exec(ON_MEDIA[key] ?? '');
  if (!m) unreadable(`onMedia.${key} is \`${ON_MEDIA[key]}\`, not a colors token.`);
  if (!(m[1] in found)) unreadable(`onMedia.${key} must be an opaque colour (colors.${m[1]}).`);
  return found[m[1]];
}
const MEDIA = { ink: mediaHex('ink'), fill: mediaHex('fill'), ring: mediaHex('ring') };

/*
 * The photographs' own extremes, measured on the daylight bake (white spec
 * 1.2): the lightest wall a plate sits on (rum-runner's #EAEAEA; the 162
 * walls run #ABABAB to #EAEAEA, the bake keeps each master's brightness),
 * and the darkest table pixel a plate's white ring has to hold against.
 * Pictures, not tokens.
 */
const LIGHT_WALL = '#EAEAEA';
const DARK_TABLE = '#3A3A3A';
const WHITE_FRAME = '#FFFFFF';

/* ==================================================================== */
/* The pairs                                                            */
/* ==================================================================== */

// [foreground, background, minimum, label], or a heading string.
const PAIRS = [
  'Text on the grounds (4.5:1)',
  [C.text, C.bg, 4.5, 'ink on page: all primary text'], // 19.80
  [C.text, C.surface, 4.5, 'ink on a sheet'],
  [C.text, C.bgSunk, 4.5, 'ink on wash: typed text, tile labels, the wash key'], // 18.16
  [C.text, C.press, 4.5, 'ink on press: a held row or key'], // 16.61
  [C.textMuted, C.bg, 4.5, 'muted on page: meta, counts, "+ Add"'], // 6.69
  [C.textMuted, C.surface, 4.5, 'muted on a sheet'],
  [C.textMuted, C.bgSunk, 4.5, 'muted on wash: placeholders'], // 6.13
  [C.textMuted, C.press, 4.5, 'muted on press: a meta line in a held row'], // 5.61
  [C.textFaint, C.bg, 3.0, 'textFaint on page: 18pt and up only'], // 3.45
  [C.textFaint, C.bgSunk, 3.0, 'textFaint on wash: 18pt and up only'], // 3.17

  'Text on ink',
  [C.onInk, C.text, 4.5, 'onInk on ink: keys, ticked tiles, plate digits, the toast'], // 19.80
  [C.onInk, C.inkPressed, 4.5, 'onInk on inkPressed: a held key'], // 12.63
  [C.onInkMuted, C.text, 4.5, 'onInkMuted on ink: a count inside an on chip'], // 7.85

  'Avatar initials',
  [C.onInk, C.tone1, 4.5, 'initials on tone1 (Graphite)'], // 15.13
  [C.onInk, C.tone2, 4.5, 'initials on tone2 (Charcoal)'], // 10.86
  [C.onInk, C.tone3, 4.5, 'initials on tone3 (Slate)'], // 6.69
  [C.text, C.tone4, 4.5, 'initials on tone4 (Mist)'], // 15.43

  'Marks that carry state (UI, 3:1)',
  [C.lineControl, C.bg, 3.0, 'control edge on page: an empty plate, an unticked box, resting tab glyphs'], // 3.45
  [C.lineControl, C.bgSunk, 3.0, 'control edge on wash: the no-photo glass'], // 3.17
  [C.lineInk, C.bg, 3.0, 'ink edge on page: the focus ring, a danger key, the unseen story ring'], // 19.80
  [C.lineInk, C.bgSunk, 3.0, 'ink ring on a focused field'],
  [C.text, C.bgSunk, 3.0, 'a ticked box or the active filter glyph on wash'],

  'Over a photograph: the ink plate',
  [MEDIA.ink, MEDIA.fill, 4.5, 'onMedia.ink on the plate (measured on the plate, never the picture)'], // 19.80
  [MEDIA.fill, LIGHT_WALL, 3.0, 'the plate against the lightest daylight wall'], // 16.46
  [MEDIA.ring, DARK_TABLE, 3.0, "the plate's white ring against the darkest table"], // 11.37

  'Categories (no hue: the word says it)',
  ...CATEGORIES.flatMap(({ key, color, wash }) => [
    [color, C.bg, 4.5, `${key} label on page`],
    [color, wash, 4.5, `${key} label on its wash`],
  ]),

  'Reels (flagged off): white on the ink ground, and over video',
  [C.reelInk, C.reelGround, 4.5, 'text on the reels ground'],
  [C.reelInkMuted, C.reelGround, 4.5, 'secondary text on the reels ground'],
  [C.record, C.reelGround, 3.0, 'the record dot on the reels ground'],
  [C.reelGround, C.reelInk, 4.5, 'onDark key label'],
  [C.reelGround, C.reelInkMuted, 4.5, 'onDark key label, pressed'],
  [C.reelInk, over(R.reelControlFill, WHITE_FRAME), 3.0, 'control glyph on its chip over a white frame'],
  [C.reelInk, over(R.reelScrimMid, WHITE_FRAME), 4.5, 'caption at the shallow end of the scrim over a white frame'],
  [C.reelInk, over(R.reelScrim, WHITE_FRAME), 4.5, 'marker text on media over a white frame'],

  'The accent (v4.4, Campari): the seven places, and only those',
  [C.accent, C.bg, 4.5, 'accent as text on page: the caught figure ("14 / 2,089", "14 entries")'], // 5.54
  [C.accent, C.bgSunk, 4.5, 'accent as text on wash'], // 5.08
  [C.accent, C.press, 4.5, 'accent as text on press'], // 4.64
  [C.onAccent, C.accent, 4.5, 'onAccent on accent: the Dex key\'s glass, the post key label, caught plate figures'], // 5.54
  [C.onAccent, C.accentPressed, 4.5, 'onAccent on accentPressed: the Dex key or the post key held'], // 7.66
  [C.accent, C.bg, 3.0, 'accent fill on page (UI): the Dex key, the post key, the plate, the Activity dot, the liked heart (7, v4.7; the burst\'s sits on its own white heart)'], // 5.54
  [C.accent, C.text, 3.0, 'accent fill against ink (UI): a key or plate on an ink ground keeps the fill'], // 3.58
  // A logotype is exempt from WCAG's contrast minimum (1.4.3); the logo is held to the UI line anyway.
  [C.accent, C.bg, 3.0, 'the logo on page (6, v4.5): the wordmark and the mark, red on white'], // 5.54

  'Quotations: the sign-in rows',
  [C.onFacebook, C.facebook, 4.5, 'Continue with Facebook label on Facebook blue'], // 4.82
  [C.facebook, C.bg, 3.0, 'Facebook mark on page'],
  [C.surface, C.appleFill, 4.5, 'Continue with Apple: title and apple.logo on black'],
  [C.providerInk, C.surface, 4.5, 'outlined way in: label and mark on white'],
  [C.providerInk, C.press, 4.5, 'outlined way in, pressed'],
  [C.providerEdge, C.surface, 3.0, 'outlined way in: its edge (UI)'],
];

/*
 * Pairs that must stay UNREADABLE (white spec 1.2, "Never"), so nobody
 * later sets text in them. Each is asserted under its threshold; if one
 * ever clears it, take it off this list on purpose rather than by accident.
 */
const NEVER = [
  [C.lineControl, C.bg, 4.5, 'control grey as text under 18pt (check-design rule 16 keeps it off Text)'], // 3.45
  [C.lineControl, C.press, 3.0, 'control edge on press: a held outline key turns its edge ink instead'], // 2.90
  [C.rule, C.bg, 3.0, 'rule as text'], // 1.74
  [C.hair, C.bg, 3.0, 'hair as text'], // 1.45
  [C.line, C.bg, 3.0, 'line as text'], // 1.28
  [C.line, C.bgSunk, 3.0, 'line on wash'], // 1.18
  [C.accent, C.text, 4.5, 'accent as text on ink: on ink it is a fill, its words stay onInk'], // 3.58
];

/* Decorative only, printed for the record: none may carry text. */
const NOTES = [
  [C.bgSunk, C.bg, 'wash against page: a field reads by its fill, glyph and placeholder, not an edge'], // 1.09
  [C.hair, C.bgSunk, 'hair on wash'],
  [C.rule, C.bgSunk, 'rule on wash: the sheet grabber'],
  [over(R.photoEdge, WHITE_FRAME), WHITE_FRAME, "photoEdge over a blown-out white photo: the print's edge"],
  [over(R.scrim, C.bg), C.bg, 'the scrim over the page'],
];

let failed = 0;
let measured = 0;
console.log('\n  Sipply palette (v4 Daylight) — WCAG contrast audit\n');
console.log(`  page ${C.bg}   wash ${C.bgSunk}   ink ${C.text}   muted ${C.textMuted}   control ${C.lineControl}`);
for (const pair of PAIRS) {
  if (typeof pair === 'string') {
    console.log(`\n  ${pair}\n`);
    continue;
  }
  const [fg, bg, min, label] = pair;
  const r = ratio(fg, bg);
  const ok = r >= min;
  measured++;
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2).padStart(5)}:1  (min ${min})  ${label}   ${fg} on ${bg}`);
}

console.log('\n  Never readable, asserted under their threshold\n');
let neverFailed = 0;
for (const [fg, bg, max, label] of NEVER) {
  const r = ratio(fg, bg);
  const ok = r < max;
  if (!ok) neverFailed++;
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2).padStart(5)}:1  (must stay under ${max})  ${label}` +
      `${ok ? '' : ': now readable; take it off NEVER deliberately'}   ${fg} on ${bg}`,
  );
}

console.log('\n  Decorative, not pairs\n');
for (const [fg, bg, label] of NOTES) {
  console.log(`  NOTE  ${ratio(fg, bg).toFixed(2).padStart(5)}:1  ${label}   ${fg} on ${bg}`);
}

console.log('\n  One hue: every value R = G = B but the accent and the quotations\n');
for (const t of tinted) console.log(`  FAIL  tinted  ${t}`);
console.log(
  `  ${oneHue ? 'PASS' : 'FAIL'}  the accent is Campari's one hue: accent ${C.accent} at ` +
    `${accentHue == null ? 'grey' : `${accentHue.toFixed(1)}°`}, accentPressed ${C.accentPressed} at ` +
    `${pressedHue == null ? 'grey' : `${pressedHue.toFixed(1)}°`} (each within ${ACCENT_DRIFT}° of ${CAMPARI_HUE}°)`,
);
if (tinted.length === 0) {
  console.log(
    `  PASS  ${Object.keys(found).length - QUOTATIONS.size - ACCENT.length} neutral colours, ` +
      `${ACCENT.length} accent, ${QUOTATIONS.size} quotations`,
  );
}

const total = failed + neverFailed + tinted.length + (oneHue ? 0 : 1);
console.log(
  total === 0
    ? `\n  All ${measured} pairs pass, all ${NEVER.length} never-text pairs stay unreadable, and the palette's one hue is the accent.\n`
    : `\n  ${failed} of ${measured} pairs FAIL; ${neverFailed} of ${NEVER.length} never-text checks FAIL; ` +
        `${tinted.length} tinted value(s)${oneHue ? '' : "; the accent is not Campari's one hue"}.\n`,
);
process.exit(total === 0 ? 0 : 1);
