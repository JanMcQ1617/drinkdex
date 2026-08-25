/**
 * Design-system guard.
 *
 * Two rules that were violated across the app before the light-mode
 * redesign, and that regress easily:
 *   1. No emoji used as UI. They render in the system font, so weight and
 *      color can't be themed, and they read as placeholder art.
 *   2. No hardcoded hex in screens/components. Colors come from tokens so
 *      contrast stays auditable by check-contrast.mjs.
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

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const violations = [];

for (const file of walk(ROOT)) {
  const rel = file.slice(ROOT.length);
  if (ALLOW[rel]) continue;

  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // Skip comments — prose may legitimately mention a hex or an emoji.
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
    if (EMOJI.test(code)) {
      violations.push({ rel, n: i + 1, kind: 'emoji', line: line.trim() });
    }
    if (HEX.test(code)) {
      violations.push({ rel, n: i + 1, kind: 'hex', line: line.trim() });
    }
  });
}

console.log('\n  Sipply design-system guard\n');

if (violations.length === 0) {
  console.log('  No emoji-as-UI or hardcoded hex outside the allowlist.\n');
  process.exit(0);
}

for (const v of violations) {
  console.log(`  ${v.kind.toUpperCase().padEnd(5)} ${v.rel}:${v.n}  ${v.line.slice(0, 96)}`);
}
console.log(`\n  ${violations.length} violation(s).\n`);
process.exit(1);
