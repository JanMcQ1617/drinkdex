/**
 * WCAG contrast audit for the Clink palette.
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

const C = {
  bg: '#F7EEDF',
  bgSunk: '#EFE3D0',
  surface: '#FFFCF6',
  cardAlt: '#FBF4E9',
  text: '#2B1820',
  textMuted: '#63434D',
  textFaint: '#836169',
  textOnWine: '#F9F1E4',
  textOnGold: '#2B1820',
  wine: '#633444',
  goldInk: '#7D5A15',
  goldGlyph: '#A07C1A',
  gold: '#C9A227',
  danger: '#A83224',
  success: '#356B4D',
  lockInk: '#241017',
};

// [foreground, background, minimum, label]
const PAIRS = [
  [C.text, C.bg, 4.5, 'body text on page'],
  [C.text, C.surface, 4.5, 'body text on card'],
  [C.text, C.cardAlt, 4.5, 'body text on alt card'],
  [C.text, C.bgSunk, 4.5, 'body text on sunk well'],
  [C.textMuted, C.bg, 4.5, 'muted text on page'],
  [C.textMuted, C.surface, 4.5, 'muted text on card'],
  [C.textFaint, C.bg, 3.0, 'faint text on page (large/secondary)'],
  [C.textFaint, C.surface, 3.0, 'faint text on card (large/secondary)'],
  [C.wine, C.bg, 4.5, 'wine text on page'],
  [C.wine, C.surface, 4.5, 'wine text on card'],
  [C.goldInk, C.bg, 4.5, 'gold text on page'],
  [C.goldInk, C.surface, 4.5, 'gold text on card'],
  [C.danger, C.bg, 4.5, 'danger text on page'],
  [C.success, C.bg, 4.5, 'success text on page'],
  [C.textOnWine, C.wine, 4.5, 'text on wine button'],
  [C.textOnGold, C.gold, 4.5, 'text on gold button'],
  [C.goldGlyph, C.bg, 3.0, 'gold UI glyph on page'],
  [C.goldGlyph, C.surface, 3.0, 'gold UI glyph on card'],
  [C.textOnWine, C.lockInk, 4.5, 'text on locked artwork'],
  // Category colors must be readable as chip/label text.
  ['#A83A29', C.bg, 4.5, 'cocktail label on page'],
  ['#8A5F10', C.bg, 4.5, 'beer label on page'],
  ['#7A3A52', C.bg, 4.5, 'wine label on page'],
  ['#54438A', C.bg, 4.5, 'spirit label on page'],
  ['#A83A29', '#FBE6E0', 4.5, 'cocktail label on its wash'],
  ['#8A5F10', '#FAEFD2', 4.5, 'beer label on its wash'],
  ['#7A3A52', '#F6E4EA', 4.5, 'wine label on its wash'],
  ['#54438A', '#EBE7F5', 4.5, 'spirit label on its wash'],
  // Rarity colors.
  ['#6E635C', C.bg, 4.5, 'common label on page'],
  ['#356B4D', C.bg, 4.5, 'uncommon label on page'],
  ['#345F96', C.bg, 4.5, 'rare label on page'],
  [C.goldInk, '#FAEFD2', 4.5, 'legendary label on its wash'],
];

let failed = 0;
console.log('\n  Clink palette — WCAG contrast audit\n');
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
