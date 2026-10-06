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
/* Pure: no React, no theme. The face is passed in, not looked up.      */
/* ==================================================================== */

export type Face = 'playfair' | 'inter';

/** Advance widths in em, per character class. */
const CLASS_EM: Record<Face, { narrow: number; lower: number; cap: number; wide: number }> = {
  playfair: { narrow: 0.49, lower: 0.66, cap: 0.9, wide: 0.97 },
  inter: { narrow: 0.47, lower: 0.65, cap: 0.77, wide: 1.02 },
};

const NARROW = new Set(["i", "j", "l", "t", "f", "r", "I", "'", "’", ".", ",", ":", ";", "!", "|", "(", ")", "/", "-", " "]);
const WIDE = new Set(["m", "w", "M", "W", "æ", "œ", "Æ", "Œ", "%"]);
/** Classed with the capitals: the ampersand, the en dash, the tilde. */
const CAP_LIKE = new Set(["&", "–", "~"]);

/** An accented letter is costed as its base letter: "é" as "e", "Â" as "A". */
function base(ch: string): string {
  return ch.normalize('NFD')[0] ?? ch;
}

function charEm(ch: string, face: Face): number {
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

/**
 * Which estimate a font family takes: Playfair for the display face,
 * Inter for everything else. Read from the family name so this file and
 * DrinkName need no import of the display tokens (check-design rule 6
 * keeps those inside constants/theme.ts).
 */
export function faceOf(fontFamily: string | undefined): Face {
  return fontFamily && /playfair/i.test(fontFamily) ? 'playfair' : 'inter';
}
