/**
 * WCAG contrast audit for the Sipply palette.
 *
 * Run: node scripts/check-contrast.mjs
 * Exits non-zero if any declared pair fails its target ratio.
 */

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

// Mirror of src/constants/theme.ts — change there, change here.
const C = {
  bg: '#FFFDF9',
  bgSunk: '#E9E5DF',
  surface: '#FFFDF9',
  cardAlt: '#E9E5DF',
  text: '#2B2322',
  textMuted: '#6A6058',
  textFaint: '#9A8F85',
  textOnWine: '#E9E5DF',
  textOnEspresso: '#E9E5DF',
  textOnGilt: '#2B2322',
  wine: '#5B0F1A',
  wineDeep: '#3E0A12',
  merlot: '#7E2330',
  wineSoft: '#A85A63',
  wineWash: '#F5E7E7',
  taupe: '#CBBBA5',
  taupeInk: '#736247',
  taupeWash: '#F2ECE1',
  gilt: '#B08A3E',
  giltGlyph: '#A8823A',
  giltInk: '#7D5F1C',
  giltWash: '#F6EEDC',
  danger: '#A83224',
  success: '#5B0F1A',
  lockInk: '#2B2322',
  // The empty-slot recess in the Dex grid.
  slot: '#E3DDD3',
  slotDeep: '#D8D1C5',
};

// [foreground, background, minimum, label]
const PAIRS = [
  [C.text, C.bg, 4.5, 'body text on page'],
  [C.text, C.surface, 4.5, 'body text on card'],
  [C.text, C.cardAlt, 4.5, 'body text on alt card'],
  [C.text, C.bgSunk, 4.5, 'body text on sunk well'],
  [C.textMuted, C.bg, 4.5, 'muted text on page'],
  [C.textMuted, C.surface, 4.5, 'muted text on card'],
  [C.textMuted, C.bgSunk, 4.5, 'muted text on sunk well'],
  [C.textFaint, C.bg, 3.0, 'faint text on page (large/secondary)'],
  [C.textFaint, C.surface, 3.0, 'faint text on card (large/secondary)'],
  [C.wine, C.bg, 4.5, 'wine text on page'],
  [C.wine, C.surface, 4.5, 'wine text on card'],
  [C.wine, C.bgSunk, 4.5, 'wine text on sunk well'],
  [C.wine, C.wineWash, 4.5, 'wine text on its own wash'],
  [C.merlot, C.bg, 4.5, 'merlot text on page'],
  [C.giltInk, C.bg, 4.5, 'gilt text on page'],
  [C.giltInk, C.surface, 4.5, 'gilt text on card'],
  [C.danger, C.bg, 4.5, 'danger text on page'],
  [C.success, C.bg, 4.5, 'success text on page'],
  [C.textOnWine, C.wine, 4.5, 'text on wine button'],
  [C.textOnGilt, C.gilt, 4.5, 'text on gilt button'],
  [C.giltGlyph, C.bg, 3.0, 'gilt UI glyph on page'],
  [C.giltGlyph, C.surface, 3.0, 'gilt UI glyph on card'],
  [C.textOnWine, C.lockInk, 4.5, 'text on locked artwork'],
  // Taupe. Decorative on light grounds (1.85:1 on page — deliberately
  // untested as type there); readable only on wine and espresso, which is
  // exactly where the brand sheet sets the letterspaced tagline.
  [C.taupe, C.wine, 4.5, 'tagline (taupe) on wine'],
  [C.taupe, C.lockInk, 4.5, 'tagline (taupe) on espresso'],
  [C.taupeInk, C.bg, 4.5, 'taupe label on page'],
  [C.taupeInk, C.taupeWash, 4.5, 'taupe label on its own wash'],
  // Intro: type on the wine ground of the pour.
  [C.textOnWine, C.wine, 4.5, 'intro wordmark (bone) on wine'],
  [C.textOnWine, C.wineDeep, 4.5, 'intro wordmark (bone) on wine-deep'],
  // Category colors must be readable as chip/label text.
  ['#7E2330', C.bg, 4.5, 'cocktail label on page'],
  ['#8A5F10', C.bg, 4.5, 'beer label on page'],
  ['#5E2545', C.bg, 4.5, 'wine label on page'],
  ['#3A2E2C', C.bg, 4.5, 'spirit label on page'],
  ['#7E2330', '#F5E6E5', 4.5, 'cocktail label on its wash'],
  ['#8A5F10', '#F6EDDC', 4.5, 'beer label on its wash'],
  ['#5E2545', '#F1E6EC', 4.5, 'wine label on its wash'],
  ['#3A2E2C', '#ECE7E3', 4.5, 'spirit label on its wash'],
  // Rarity is the frame material: hairline -> taupe -> wine -> gilt.
  [C.textMuted, C.bg, 4.5, 'common label on page'],
  [C.taupeInk, C.bg, 4.5, 'uncommon label on page'],
  [C.wine, C.bg, 4.5, 'rare label on page'],
  [C.giltInk, C.bg, 4.5, 'legendary label on page'],
  [C.textMuted, '#EFE9E0', 4.5, 'common label on its wash'],
  [C.taupeInk, C.taupeWash, 4.5, 'uncommon label on its wash'],
  [C.wine, C.wineWash, 4.5, 'rare label on its wash'],
  [C.giltInk, C.giltWash, 4.5, 'legendary label on its wash'],
  // Dex grid — the empty slot. Its nameplate and number plate sit on
  // slotDeep, which is the darkest surface any body text lands on.
  [C.textMuted, C.slot, 4.5, 'entry name on empty slot'],
  [C.textMuted, C.cardAlt, 4.5, 'entry name on the bone nameplate'],
  [C.textMuted, C.cardAlt, 3.0, 'dex number on the bone plate (secondary)'],
  [C.text, C.slot, 4.5, 'body text on empty slot'],
  [C.wine, C.slot, 4.5, 'progress count on the empty-slot recess'],
  // Collected cards: the name sits on a near-opaque off-white plate over
  // the category field, so the field's darkest stop is the real backdrop.
  [C.text, '#F5E6E5', 4.5, 'card name over cocktail field'],
  [C.text, '#F6EDDC', 4.5, 'card name over beer field'],
  [C.text, '#F1E6EC', 4.5, 'card name over wine field'],
  [C.text, '#ECE7E3', 4.5, 'card name over spirit field'],
];

let failed = 0;
console.log('\n  Sipply palette — WCAG contrast audit\n');
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
