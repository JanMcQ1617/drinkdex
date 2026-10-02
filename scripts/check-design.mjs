/**
 * Design-system guard.
 *
 * Five rules that were violated across the app before the redesigns, and
 * that regress easily:
 *   1. No emoji used as UI. They render in the system font, so weight and
 *      color can't be themed, and they read as placeholder art.
 *   2. No hardcoded hex in screens/components. Colors come from tokens so
 *      contrast stays auditable by check-contrast.mjs.
 *   3. No layout animations (`entering` / `exiting`). See LAYOUT_ANIM.
 *   4. No ovals. Controls are rounded rectangles; only people (avatars)
 *      and round objects (a shutter, a dot) are circles. See SHAPE.
 *   5. No uppercase. Letterspaced caps headings were the habit that most
 *      made the interface look machine-designed. See CAPS.
 *
 * Comments are stripped before any rule runs, block comments included,
 * so prose may mention a hex, an emoji or a banned style.
 *
 * Run: node scripts/check-design.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../src/', import.meta.url).pathname;

/** Files allowed to define raw color values or emoji, and why. */
const ALLOW = {
  'constants/theme.ts': 'defines the palette itself; drinkGlyph is deprecated',
  'components/artwork/liquid.ts': 'defines the LIQUID pour palette',
  'components/artwork/index.tsx': 'defines garnish tints (olive, cherry, citrus)',
  'components/SipplyIntro.tsx': 'exact port of the brand intro timeline',
};

const EMOJI = /\p{Extended_Pictographic}/u;
const HEX = /#[0-9a-fA-F]{6}\b/;

/*
 * 3. No layout animations. An `entering` that never runs leaves content at
 *    opacity 0; an `exiting` that never finishes leaves a ghost view on
 *    screen. specs/06-tab-switch-bug.md.
 */
const LAYOUT_ANIM = /\b(entering|exiting)=\{/;
/** Files allowed one kind of layout animation, and why. */
const LAYOUT_ANIM_ALLOW = {
  'components/CelebrationOverlay.tsx': {
    kinds: ['entering'],
    why: 'scrim fade-in is decoration over a card that is visible without it',
  },
};

/*
 * 4. No ovals. A radius that makes a shape a circle or a stadium: the
 *    `round` token, half of a size (`size / 2`), or a literal of 13 or more
 *    (no control in the v2 scale is rounder than `card`, 12). A circle that
 *    is meant (an avatar, an avatar badge, the camera shutter, a dot) says
 *    so with a `round-ok: <reason>` comment on its line or the line above.
 *    specs/01-design-v2.md, section 13.1.
 */
const SHAPE = [
  /radius\.round/,
  /(borderRadius|cornerRadius|border(Top|Bottom)(Left|Right)Radius)\s*[:=]\s*\{?\s*[\w.]+\s*\/\s*2\b/,
  /(borderRadius|cornerRadius|border(Top|Bottom)(Left|Right)Radius)\s*[:=]\s*\{?\s*(1[3-9]|[2-9]\d|\d{3,})\b/,
];
const ROUND_OK = /round-ok:\s*\w/;
/** Files rule 4 does not read, and why. */
const SHAPE_EXEMPT = [
  [/^constants\/theme\.ts$/, 'defines the radius scale, round included'],
  [/^components\/SipplyIntro\.tsx$/, 'the brand film: the pour is drawn in discs'],
  [/^components\/artwork\//, 'drink illustrations: glasses and garnishes are round'],
];

/*
 * 5. No uppercase. No exemptions: not even a section heading. The label
 *    is written in sentence case in the source, and that is how it shows.
 */
const CAPS = /textTransform:\s*['"]uppercase['"]/;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/**
 * The code on each line with its comments removed. Block comments are
 * tracked across lines: this codebase explains itself in long `/* … *\/`
 * blocks (and JSX `{/* … *\/}` ones), and the prose inside them names the
 * very styles these rules ban. A line-at-a-time strip only removed
 * single-line blocks, so a multi-line one was read as code.
 *
 * A `/*` inside a quoted string on its line ('image/*') is code, not an
 * opener: because a block now runs across lines, a stray one would hide
 * every line down to the next `*\/` from all five rules, which is a silent
 * pass. Like the strip it replaces, a `//` inside a string (a URL) still
 * ends the line's code early. None of the rules is looking for anything
 * after one.
 */
function codeLines(lines) {
  let inBlock = false;
  return lines.map((line) => {
    let out = '';
    let i = 0;
    // Where this line's code resumed after its last block comment: quotes
    // are counted from here, so an apostrophe in comment prose is not one.
    let from = 0;
    while (i < line.length) {
      if (inBlock) {
        const end = line.indexOf('*/', i);
        if (end < 0) return out;
        inBlock = false;
        i = end + 2;
        from = i;
        continue;
      }
      const open = line.indexOf('/*', i);
      const slash = line.indexOf('//', i);
      if (slash >= 0 && (open < 0 || slash < open)) return out + line.slice(i, slash);
      if (open < 0) return out + line.slice(i);
      if (quoted(line, from, open)) {
        out += line.slice(i, open + 2);
        i = open + 2;
        continue;
      }
      out += line.slice(i, open);
      inBlock = true;
      i = open + 2;
    }
    return out;
  });
}

/** True when `at` falls inside a '…', "…" or `…` literal opened in line[from, at). */
function quoted(line, from, at) {
  let quote = null;
  for (let i = from; i < at; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
    }
  }
  return quote !== null;
}

const violations = [];

for (const file of walk(ROOT)) {
  const rel = file.slice(ROOT.length);
  const lines = readFileSync(file, 'utf8').split('\n');
  const code = codeLines(lines);
  const shapeExempt = SHAPE_EXEMPT.some(([re]) => re.test(rel));

  code.forEach((c, i) => {
    const add = (kind) => violations.push({ rel, n: i + 1, kind, line: lines[i].trim() });

    // Rule 5 reads every file, the allowlist included.
    if (CAPS.test(c)) add('caps');

    if (ALLOW[rel]) return;

    if (EMOJI.test(c)) add('emoji');
    if (HEX.test(c)) add('hex');

    const anim = c.match(LAYOUT_ANIM);
    if (anim && !LAYOUT_ANIM_ALLOW[rel]?.kinds.includes(anim[1])) add('anim');

    if (
      !shapeExempt &&
      SHAPE.some((re) => re.test(c)) &&
      !ROUND_OK.test(lines[i]) &&
      !(i > 0 && ROUND_OK.test(lines[i - 1]))
    ) {
      add('shape');
    }
  });
}

console.log('\n  Sipply design-system guard\n');

if (violations.length === 0) {
  console.log(
    '  No emoji-as-UI, hardcoded hex, layout animations, ovals or uppercase outside the allowlists.\n',
  );
  process.exit(0);
}

for (const v of violations) {
  console.log(`  ${v.kind.toUpperCase().padEnd(5)} ${v.rel}:${v.n}  ${v.line.slice(0, 96)}`);
}
console.log(`\n  ${violations.length} violation(s).\n`);
process.exit(1);
