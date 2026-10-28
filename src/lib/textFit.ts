import { ADVANCE_CHARS, FACE_ADVANCES, TEXT_CLASS_EM } from '@/lib/faceAdvances';

/* ==================================================================== */
/* Fitting a word to its column, without measuring it                   */
/*                                                                      */
/* A drink name never takes a line limit (specs/v3-cabinet.md 6.4): it  */
/* wraps at word boundaries and its container grows. The one way it can */
/* still break is INSIDE a word: iOS character-wraps a word wider than  */
/* its line, and the catalogue has such words ("Holunderbeergeist" at   */
/* the drink page's 60pt is wider than its column). So DrinkName        */
/* (components/cabinet.tsx) shrinks a name until its widest unbreakable */
/* run fits, and this file says how wide that run is.                   */
/*                                                                      */
/* An ESTIMATE, not a measurement, on purpose. onLayout would draw the  */
/* name once at full size and then again shrunk, a visible jump on      */
/* every long name and a second layout pass on every Dex card. A width  */
/* costed per character is pure arithmetic, so the first frame is       */
/* already the final one.                                               */
/*                                                                      */
/* The faces are named by their job, not their family, so the next swap */
/* renames nothing (v4.10, specs/v4.10/spec.md T.9):                    */
/*   'display'  the marker, Sedgwick Ave: drink names, the tab titles   */
/*   'text400'  Archivo Regular: running text (Home's caption)          */
/*   'text600'  Archivo SemiBold: a username before a caption, a strong */
/*              word in a tag line                                      */
/*   'text'     a wide class estimate costed on Archivo 600, its widest */
/*              cut, for labels and values in any Archivo weight        */
/* The three exact faces read GENERATED advances (lib/faceAdvances.ts,  */
/* from the shipped fonts by scripts/build-fonts.py): each character's  */
/* advance plus the widest positive kern it can take on its left and    */
/* its share of any ligature wider than its parts, set 2% over. Those   */
/* allowances matter now: Sedgwick has 651 kern pairs and some widen a  */
/* pair by 140 units in 1,000 (Archivo's by up to 50), and its f_f is   */
/* 136 wider than f + f. Inter only ever tightened, which is why its    */
/* tables needed none. specs/v4.10/type/tools/fit.mjs holds the         */
/* marker's estimate over Chrome's shaped width for every catalogue     */
/* name. An estimate that is too wide shrinks a name a little more      */
/* than it needed, or cuts a caption a word early; one that is too      */
/* narrow lets a word break, so every table errs wide.                  */
/*                                                                      */
/* Pure: no React, no theme. The face is passed in, not looked up.      */
/* ==================================================================== */

/**
 * 'display', 'text400' and 'text600': the marker's and Archivo Regular's
 * and SemiBold's own advances. 'text': the wide class estimate for labels
 * and values (Archivo, costed on SemiBold).
 */
export type Face = 'display' | 'text' | 'text400' | 'text600';
type ExactFace = 'display' | 'text400' | 'text600';

/*
 * faceAdvances covers U+0020 to U+007E, the typographic marks (’ ‘ “ ” –
 * — … • ·, and ď ľ ť, whose caron is drawn as an apostrophe and so is
 * wider than the base letter) and every letter of the catalogue's names.
 * Anything else is costed as its base letter, then as FALLBACK_EM.
 */
/** Headroom over the font's own advances, for a scaled font's rounding. */
const ADVANCE_SLACK = 1.02;
/**
 * A character the face does not draw (an emoji, another script) comes
 * from a system font, and is costed wider than any letter: Apple's emoji
 * are about 1.25em.
 */
const FALLBACK_EM = 1.3;

/** Each exact face's advances in em, by character. A 0 in the table is a character the face does not draw, and is left out. */
const ADVANCE_EM: Record<ExactFace, Map<string, number>> = {
  display: advanceTable(FACE_ADVANCES.display),
  text400: advanceTable(FACE_ADVANCES.text400),
  text600: advanceTable(FACE_ADVANCES.text600),
};

function advanceTable({ upem, units }: { upem: number; units: string }): Map<string, number> {
  const values = units.split(' ').map(Number);
  const table = new Map<string, number>();
  ADVANCE_CHARS.forEach((ch, i) => {
    const u = values[i];
    if (u) table.set(ch, (u / upem) * ADVANCE_SLACK);
  });
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
  if (face !== 'text') {
    const table = ADVANCE_EM[face];
    return table.get(ch) ?? table.get(base(ch)) ?? FALLBACK_EM;
  }
  const em = TEXT_CLASS_EM;
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
 * An exact face costs each character by its own advance and widest kern
 * (faceAdvances). 'text' costs it by class, in em, at Archivo 600's
 * widest in each (TEXT_CLASS_EM, generated): narrow = i j l t f r I ' ’ .
 * , : ; ! | ( ) / - and space; wide = m w M W æ œ Æ Œ %; cap = other
 * capitals, digits, & – ~; lower = everything else (accents are classed
 * by their base letter). Never below the shaped width of any catalogue
 * name's widest run (specs/v4.10/type/tools/fit.mjs checks all 2,089).
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
 * Which estimate a font family takes: 'display' for the marker, the wide
 * 'text' estimate for everything else. Read from the family name so this
 * file and DrinkName need no import of the display tokens (check-design
 * rule 6 keeps those inside constants/theme.ts).
 */
export function faceOf(fontFamily: string | undefined): Face {
  return fontFamily && /SedgwickAve/.test(fontFamily) ? 'display' : 'text';
}
