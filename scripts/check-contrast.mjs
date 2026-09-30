/**
 * WCAG contrast audit for the Sipply palette.
 *
 * Run: node scripts/check-contrast.mjs
 * Exits non-zero if any declared pair fails its target ratio, or if a
 * colour it needs can no longer be found in src/constants/theme.ts.
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
/* Only the plain `key: '#RRGGBB'` entries are picked up; rgba values   */
/* are composited explicitly below where a pair needs them.             */
/* ==================================================================== */

const THEME = readFileSync(new URL('../src/constants/theme.ts', import.meta.url), 'utf8');

function section(start, end) {
  const from = THEME.indexOf(start);
  const to = from < 0 ? -1 : THEME.indexOf(end, from);
  if (from < 0 || to < 0) {
    console.error(`\n  check-contrast: cannot find \`${start}\` … \`${end}\` in theme.ts.\n`);
    process.exit(2);
  }
  return THEME.slice(from, to);
}

const found = {};
for (const [, key, value] of section('export const colors = {', '} as const;').matchAll(
  /(\w+):\s*'(#[0-9A-Fa-f]{6})'/g,
)) {
  found[key] = value.toUpperCase();
}

const rgba = {};
for (const [, key, r, g, b, a] of section('export const glass = {', '} as const;').matchAll(
  /(\w+):\s*'rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)'/g,
)) {
  rgba[key] = [Number(r), Number(g), Number(b), Number(a)];
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
      console.error(`\n  check-contrast: colors.${key} is not defined in theme.ts.\n`);
      process.exit(2);
    }
    return target[key];
  },
});

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
if (ORDER.length === 0 || unparsed.length > 0) {
  console.error(
    ORDER.length === 0
      ? '\n  check-contrast: cannot read CATEGORY_ORDER in theme.ts.\n'
      : `\n  check-contrast: no color/wash parsed for ${unparsed.join(', ')} in CATEGORY_META.\n`,
  );
  process.exit(2);
}
for (const key of ['fill', 'fillStrong']) {
  if (!rgba[key]) {
    console.error(`\n  check-contrast: glass.${key} is not defined in theme.ts.\n`);
    process.exit(2);
  }
}

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
  if (!ACCENTS[key]) {
    console.error(`\n  check-contrast: ${key} is not defined in theme.ts.\n`);
    process.exit(2);
  }
}

/* Glass panes are translucent: what text sits on is the fill over the page. */
const GLASS = over(rgba.fill, C.bg);
const GLASS_STRONG = over(rgba.fillStrong, C.bg);

// [foreground, background, minimum, label]
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
  [C.textMuted, GLASS, 4.5, 'muted text on glass (tab bar labels)'],
  [C.textMuted, GLASS_STRONG, 4.5, 'muted text on strong glass (Dex masthead)'],
  // textFaint is large type and glyphs only (≥3:1). It is tested on every
  // ground theme.ts allows it on, down to the sunk well, the darkest of
  // them. The Dex slot recess is darker still and is off limits to it
  // (2.90:1), so it has no pair here.
  [C.textFaint, C.bg, 3.0, 'faint glyph / large text on page'],
  [C.textFaint, C.surface, 3.0, 'faint glyph / large text on card'],
  [C.textFaint, C.bgSunk, 3.0, 'faint glyph on sunk well'],
  [C.textFaint, GLASS, 3.0, 'faint glyph on glass fill'],
  [C.wine, C.bg, 4.5, 'wine text on page'],
  [C.wine, C.surface, 4.5, 'wine text on card'],
  [C.wine, C.bgSunk, 4.5, 'wine text on sunk well'],
  [C.wine, C.wineWash, 4.5, 'wine text on its own wash'],
  [C.wine, GLASS, 4.5, 'wine text on glass'],
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
  // untested as type there); readable only on wine and espresso, which is
  // exactly where the brand sheet sets the letterspaced tagline.
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
  // Dex grid — the empty slot. Its nameplate sits on DexCard's
  // `recessWash`, which is OPAQUE `slot` under every line of the name and
  // number, so `slot` is the exact ground here, not a stand-in. No text
  // lands on bare slotDeep.
  [C.textMuted, C.slot, 4.5, 'entry name on empty slot'],
  [C.textMuted, C.cardAlt, 4.5, 'entry name on the bone nameplate'],
  [C.textMuted, C.cardAlt, 3.0, 'dex number on the bone plate (secondary)'],
  [C.text, C.slot, 4.5, 'body text on empty slot'],
  [C.wine, C.slot, 4.5, 'progress count on the empty-slot recess'],
];

let failed = 0;
console.log('\n  Sipply palette — WCAG contrast audit\n');
console.log(`  page ${C.bg}   glass ${GLASS}   strong glass ${GLASS_STRONG}\n`);
for (const [fg, bg, min, label] of PAIRS) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2).padStart(5)}:1  (min ${min})  ${label}   ${fg} on ${bg}`,
  );
}

console.log(
  failed === 0
    ? `\n  All ${PAIRS.length} pairs pass.\n`
    : `\n  ${failed} of ${PAIRS.length} pairs FAIL.\n`,
);
process.exit(failed === 0 ? 0 : 1);
