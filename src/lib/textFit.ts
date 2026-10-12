/* ==================================================================== */
/* Fitting a word to its column, without measuring it                   */
/*                                                                      */
/* A drink name never takes a line limit (specs/v3-cabinet.md 6.4): it  */
/* wraps at word boundaries and its container grows. The one way it can */
/* still break is INSIDE a word: iOS character-wraps a word wider than  */
/* its line, and the catalogue has such words ("Holunderbeergeist" is   */
/* 453pt at the drink page's 52pt on a 361pt column). So DrinkName      */
/* (components/cabinet.tsx) shrinks a name until its widest unbreakable */
/* run fits, and this file says how wide that run is.                   */
/*                                                                      */
/* An ESTIMATE, not a measurement, on purpose. onLayout would draw the  */
/* name once at full size and then again shrunk, a visible jump on      */
/* every long name and a second layout pass on every Dex card. A width  */
/* costed per character class is pure arithmetic, so the first frame is */
/* already the final one. The class widths were measured against the    */
/* font files (Playfair Display Bold, Inter SemiBold, the widest cuts   */
/* the app draws names and label values in) and are deliberately on the */
/* wide side: an estimate that is too wide shrinks a name a little more */
/* than it needed; one that is too narrow lets a word break.            */
/*                                                                      */
/* Running text is the other job (v4.1): Home's caption is cut to two   */
/* lines with its "… more" before layout. A class estimate errs a fifth */
/* or more wide on a sentence, which cut a caption well short of its    */
/* second line's end, so Inter's two text cuts also have their own      */
/* advance widths here ('inter400', 'inter600'), read from the font     */
/* files and set 2% over. Inter's kerning only draws pairs closer, so   */
/* these still never fall short of the line iOS sets.                   */
/*                                                                      */
/* Pure: no React, no theme. The face is passed in, not looked up.      */
/* ==================================================================== */

/**
 * 'playfair' and 'inter': the wide class estimates, for names and labels
 * (Inter's costed on SemiBold, its widest cut). 'inter400' and 'inter600':
 * Inter Regular and SemiBold's own advances, for running text.
 */
export type Face = 'playfair' | 'inter' | 'inter400' | 'inter600';
type ClassFace = 'playfair' | 'inter';

/** Advance widths in em, per character class. */
const CLASS_EM: Record<ClassFace, { narrow: number; lower: number; cap: number; wide: number }> = {
  playfair: { narrow: 0.49, lower: 0.66, cap: 0.9, wide: 0.97 },
  inter: { narrow: 0.47, lower: 0.65, cap: 0.77, wide: 1.02 },
};

/*
 * Inter's advances in font units (2048 to the em), from
 * assets/fonts/InterLatin_400Regular.ttf and InterLatin_600SemiBold.ttf
 * (hmtx), for U+0020 to U+007E in order, then the typographic marks in
 * TYPO_MARKS. An accented letter has its base letter's advance in Inter,
 * but for the three whose caron is drawn as an apostrophe (ď ľ ť), which
 * are listed with the marks. Regenerate these with the fonts.
 */
const INTER_UPM = 2048;
const TYPO_MARKS = '’‘“”–—…•·ďľť';
const INTER_UNITS: Record<'inter400' | 'inter600', string> = {
  inter400:
    '576 589 954 1297 1314 2011 1319 614 747 747 1026 1355 590 942 590 738 1292 833 1249 1265 1323 1215 1270 1159 1267 1270 590 618 1355 1355 1355 1047 1978 1413 1340 1496 1478 1231 1209 1528 1522 550 1169 1376 1158 1850 1543 1566 1308 1566 1318 1314 1322 1524 1413 2018 1397 1390 1288 747 738 747 965 934 661 1150 1254 1170 1254 1194 758 1256 1211 496 496 1124 496 1794 1210 1228 1254 1254 771 1081 670 1211 1151 1676 1118 1151 1131 873 681 873 1355 ' +
    '534 534 902 902 1024 2048 1770 1152 590 1454 696 770',
  inter600:
    '516 658 1071 1318 1332 2057 1357 667 764 764 1105 1378 653 953 653 776 1351 866 1276 1303 1364 1254 1310 1180 1311 1310 653 674 1378 1378 1378 1113 2046 1490 1350 1509 1479 1240 1204 1534 1527 567 1187 1440 1158 1889 1555 1574 1321 1583 1336 1332 1352 1507 1490 2089 1474 1461 1336 764 776 764 986 961 719 1176 1278 1193 1278 1211 796 1281 1254 536 536 1166 536 1844 1253 1247 1278 1278 813 1125 723 1254 1202 1719 1165 1205 1159 931 735 931 1378 ' +
    '602 602 1038 1027 1024 2048 1958 1031 653 1514 772 859',
};
/** Headroom over the font's own advances, for a scaled font's rounding. */
const ADVANCE_SLACK = 1.02;
/**
 * A character Inter does not draw (an emoji, another script) comes from a
 * system font, and is costed wider than any letter: Apple's emoji are
 * about 1.25em.
 */
const FALLBACK_EM = 1.3;

/** Each exact face's advances in em, by character. */
const ADVANCE_EM: Record<'inter400' | 'inter600', Map<string, number>> = {
  inter400: advanceTable(INTER_UNITS.inter400),
  inter600: advanceTable(INTER_UNITS.inter600),
};

function advanceTable(units: string): Map<string, number> {
  const chars = [...Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)), ...TYPO_MARKS];
  const values = units.split(' ').map(Number);
  const table = new Map<string, number>();
  chars.forEach((ch, i) => table.set(ch, ((values[i] ?? INTER_UPM) / INTER_UPM) * ADVANCE_SLACK));
  return table;
}

const NARROW = new Set(["i", "j", "l", "t", "f", "r", "I", "'", "’", ".", ",", ":", ";", "!", "|", "(", ")", "/", "-", " "]);
const WIDE = new Set(["m", "w", "M", "W", "æ", "œ", "Æ", "Œ", "%"]);
/** Classed with the capitals: the ampersand, the en dash, the tilde. */
const CAP_LIKE = new Set(["&", "–", "~"]);

/** An accented letter is costed as its base letter: "é" as "e", "Â" as "A". */
function base(ch: string): string {
  return ch.normalize('NFD')[0] ?? ch;
}

function charEm(ch: string, face: Face): number {
  if (face === 'inter400' || face === 'inter600') {
    const table = ADVANCE_EM[face];
    return table.get(ch) ?? table.get(base(ch)) ?? FALLBACK_EM;
  }
  const em = CLASS_EM[face];
  const b = base(ch);
  if (NARROW.has(b)) return em.narrow;
  if (WIDE.has(b)) return em.wide;
  if (CAP_LIKE.has(b) || /[0-9]/.test(b)) return em.cap;
  // A capital is any letter that has a distinct lower case form.
  if (b !== b.toLowerCase() && b === b.toUpperCase()) return em.cap;
  return em.lower;
}

/**
 * The runs iOS will not break inside: split on whitespace, and after a
 * hyphen or an en dash (the dash stays on the first line, so it is costed
 * with the run before it). A hyphen followed by a digit is not a break
 * ("1-2" stays together, as Unicode line breaking keeps it), so it is not
 * split there either: splitting where iOS would not is the one way this
 * could under-estimate.
 */
function runs(text: string): string[] {
  const out: string[] = [];
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    let start = 0;
    for (let i = 0; i < word.length; i++) {
      const ch = word[i]!;
      const next = word[i + 1];
      const breaksAfter = ch === '–' || (ch === '-' && next !== undefined && !/[0-9]/.test(next));
      if (breaksAfter && i + 1 < word.length) {
        out.push(word.slice(start, i + 1));
        start = i + 1;
      }
    }
    out.push(word.slice(start));
  }
  return out;
}

/**
 * Conservative width in points of the widest unbreakable run of `text`:
 * split on spaces, and after hyphens and en dashes (where iOS may break).
 * Each character is costed by class, in em: Playfair narrow 0.49, lower
 * 0.66, cap/digit 0.90, wide 0.97; Inter narrow 0.47, lower 0.65,
 * cap/digit 0.77, wide 1.02. Classes: narrow = i j l t f r I ' ’ . , : ; !
 * | ( ) / - and space; wide = m w M W æ œ Æ Œ %; cap = other capitals,
 * digits, & – ~; lower = everything else (accents are classed by their
 * base letter). Never below the real advance for any catalogue name,
 * origin or abv string, and at most ~25% above it on long words.
 */
export function widestRun(text: string, face: Face, size: number): number {
  let widest = 0;
  for (const run of runs(text)) {
    let em = 0;
    for (const ch of run) em += charEm(ch, face);
    if (em > widest) widest = em;
  }
  return widest * size;
}

/**
 * Conservative width in points of `text` set on one line, spaces
 * included: for reserving room beside a short label that must not wrap
 * under something else (the feed's status plaque). Same classes as
 * widestRun.
 */
export function textWidth(text: string, face: Face, size: number): number {
  let em = 0;
  for (const ch of text) em += charEm(ch, face);
  return em * size;
}

/**
 * How far to shrink `text` at `size` so its widest run fits `measure`:
 * min(1, measure / widestRun), never below floor / size (floor default
 * 11, the app's smallest type) and never above 1. A word that cannot fit
 * even at the floor is drawn at the floor and breaks inside itself there;
 * specs/v3-cabinet.md 6.4 names the three catalogue words that do, in the
 * two narrowest columns.
 *
 * Never enlarges: at a text size below the default (fontScale < 1) a
 * `size` under the floor stays as the reader chose it.
 */
export function fitScale(text: string, face: Face, size: number, measure: number, floor = 11): number {
  const run = widestRun(text, face, size);
  if (run <= 0 || size <= 0 || run <= measure) return 1;
  return Math.min(1, Math.max(floor / size, measure / run));
}

/* ==================================================================== */
/* How many lines, before layout                                        */
/*                                                                      */
/* Lifted from NotInDexYet (specs/v4.1-changes.md 4.8), so Home's       */
/* caption can be cut to two lines with its "… more" before the cell is */
/* laid out: the cell's height is known on its first frame, and the     */
/* virtualised feed never jumps when a caption measures itself.         */
/* ==================================================================== */

/**
 * The lines one paragraph (no line breaks) wraps to: greedy, word by word.
 * `lead` points of the first line are already taken (see lineCount).
 */
function paragraphLines(text: string, face: Face, size: number, measure: number, lead = 0): number {
  const gap = textWidth(' ', face, size);
  let lines = lead > 0 ? Math.max(1, Math.ceil(lead / measure)) : 0;
  let used = lead > 0 ? lead - (lines - 1) * measure : 0;
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    const w = textWidth(word, face, size);
    if (used > 0 && used + gap + w <= measure) {
      used += gap + w;
      continue;
    }
    // A new line; a word wider than the line breaks inside itself over as many as it needs.
    const span = Math.max(1, Math.ceil(w / measure));
    lines += span;
    used = w - (span - 1) * measure;
  }
  return Math.max(1, lines);
}

/**
 * Lines `text` wraps to at `size` in a `measure`-wide column, by the
 * widths above (never short of the real ones), so it errs high: a block
 * laid out with it may keep a line spare, but never needs one more. A
 * line break in the text starts a new line, and an empty line between two
 * breaks counts as one.
 *
 * `lead` is the width, in points, of a word set before the text on its
 * first line, a space before the text's first word (the caption's
 * username, which is SemiBold where the words are Regular).
 */
export function lineCount(text: string, face: Face, size: number, measure: number, lead = 0): number {
  if (!(measure > 0) || !(size > 0)) return 1;
  let lines = 0;
  text.split(/\r?\n/).forEach((paragraph, i) => {
    lines += paragraphLines(paragraph, face, size, measure, i === 0 ? lead : 0);
  });
  return Math.max(1, lines);
}

/**
 * Where to cut `text` so that, with `suffix` set straight after it (the
 * feed caption's "… more"), it still fits `maxLines` lines: the longest
 * start of it that ends on a whole word. Null when the whole text fits
 * without a cut. `lead` is as lineCount's: a word's width set before the
 * text (the caption's username), counted and never cut.
 *
 * By lineCount, so the cut errs short: the kept words always fit, and a
 * caption is never cut after the moment it first draws.
 */
export function clampToLines(
  text: string,
  face: Face,
  size: number,
  measure: number,
  maxLines: number,
  suffix: string,
  lead = 0,
): string | null {
  const body = text.trimEnd();
  if (lineCount(body, face, size, measure, lead) <= maxLines) return null;
  // The end of each word, so a cut keeps the writer's own spaces and line breaks before it.
  const ends: number[] = [];
  for (const m of body.matchAll(/\S+/g)) ends.push(m.index + m[0].length);
  const fits = (words: number) =>
    lineCount(body.slice(0, words > 0 ? ends[words - 1] : 0) + suffix, face, size, measure, lead) <= maxLines;
  // The most words that fit with the suffix; a line count only grows as words are added.
  let lo = 0;
  let hi = ends.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return body.slice(0, lo > 0 ? ends[lo - 1] : 0);
}

/**
 * Which estimate a font family takes: Playfair for the display face,
 * Inter for everything else. Read from the family name so this file and
 * DrinkName need no import of the display tokens (check-design rule 6
 * keeps those inside constants/theme.ts).
 */
export function faceOf(fontFamily: string | undefined): Face {
  return fontFamily && /playfair/i.test(fontFamily) ? 'playfair' : 'inter';
}
