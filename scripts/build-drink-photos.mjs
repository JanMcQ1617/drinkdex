/**
 * Maps the generated cocktail photographs onto dex entries and emits
 * app-sized WebP into assets/drinks/, plus a static require map.
 *
 * The source folders are named after the generation PROMPT, not the drink, so
 * the drink has to be parsed back out of the prompt text. ALIASES covers the
 * cases where the prompt wording and the dataset name genuinely differ.
 *
 *   node scripts/build-drink-photos.mjs [--src <dir>] [--size 512] [--quality 82]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};

/**
 * Where the generated photographs live. Later sources are newer batches.
 *
 * Two folder shapes are in play and both are supported: the Desktop set nests
 * prompt folders inside batch folders, the Downloads set puts them at the top
 * level. Either way the leaf holding `screen.png` is the prompt folder.
 */
const DOWNLOADS = path.join(process.env.HOME, 'Downloads');
const SOURCES = [
  path.join(process.env.HOME, 'Desktop', 'DRINKDEX IMAGES'),
  // Every generator export, however many batches deep. macOS names repeat
  // downloads "… 2", "… 3", so globbing the prefix beats listing paths that
  // go stale the moment another batch arrives.
  ...(fs.existsSync(DOWNLOADS) ? fs.readdirSync(DOWNLOADS) : [])
    .filter((d) => d.startsWith('stitch_minimalist_beverage_renderings'))
    .map((d) => path.join(DOWNLOADS, d))
    // The downloaded .zip sits next to the folder it expanded to.
    .filter((d) => fs.statSync(d).isDirectory())
    .sort(),
];

const srcArg = arg('--src', null);
const sources = srcArg ? srcArg.split(',') : SOURCES;
const SIZE = Number(arg('--size', 512));
const QUALITY = Number(arg('--quality', 82));
const OUT_DIR = path.join(ROOT, 'assets', 'drinks');
const MAP_FILE = path.join(ROOT, 'src', 'data', 'drinkPhotos.ts');

/**
 * Where several takes exist, the default pick is the largest file. These are
 * the ones where that picked a bad frame — value is the batch folder to prefer.
 */
const OVERRIDES = {
  // Largest take has a hand holding the glass; every other photo is still-life.
  // The other alternate has a flaming peel, which a Cosmopolitan does not take.
  cosmopolitan: '136-1..',

  // Regenerated 2026-08-21 to fix the original take, which is still on disk and
  // would otherwise win on file size. Seven and Seven had no whiskey colour at
  // all, Final Ward came out amber instead of Chartreuse-yellow, Sazerac had a
  // hand expressing the peel, Porto Flip was shot on a dark bar.
  'seven-and-seven': 'stitch_minimalist_beverage_renderings',
  'final-ward': 'stitch_minimalist_beverage_renderings',
  sazerac: 'stitch_minimalist_beverage_renderings',
  'porto-flip': 'stitch_minimalist_beverage_renderings',
};

/** Prompt wording → dex id, for the cases parsing alone can't resolve. */
const ALIASES = {
  'corpse reviver 2': 'corpse-reviver-no-2',
  'whiskey highball': 'whiskey-highball', // dataset spells it "Whisky"
  'dry martini': 'martini',
  'panky hanky': 'hanky-panky', // the prompt reversed the words
  'lemon drop martini': 'lemon-drop', // #105, the martini — not the #86 shot

  // Two dex entries are both named "Lemon Drop": #86 the shot and #105 the
  // martini. #105 only ever arrives via the "lemon drop martini" wording
  // above, so a bare "lemon drop" is the shot. Without this the bare form
  // resolves by name-map insertion order, which is not a decision.
  'lemon drop': 'lemon-drop-shot',
};

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Candidate drink names parsed out of a prompt folder, best guess first.
 *
 * Two candidates, not one: trailing "cocktail"/"shot" is usually prompt
 * filler ("a_negroni_cocktail") but sometimes part of the name itself
 * ("Champagne Cocktail", "Green Tea Shot", "Jell-O Shot"). Trying the
 * untrimmed form first lets those match and costs nothing when it is filler.
 */
function drinkNamesFromPrompt(folder) {
  let s = folder.replace(/^ultra_realistic_4k_photograph_of_(an?_)?/, '');
  // Prompts run on past the drink: "..._in_a_rocks_glass._amber_pour". Cut at
  // the sentence break first — a few prompts (pickleback) have no glass clause.
  s = s.split('.')[0];
  s = s.split(/_in_an?_/)[0];
  s = s.replace(/_$/, '');
  const full = norm(s.replace(/_/g, ' '));
  const trimmed = norm(s.replace(/_(cocktail|shot)$/, '').replace(/_/g, ' '));
  return full === trimmed ? [full] : [full, trimmed];
}

const drinks = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/drinks.json'), 'utf8'));
const byName = new Map(drinks.map((d) => [norm(d.name), d]));
const byId = new Map(drinks.map((d) => [d.id, d]));

const missingSources = sources.filter((d) => !fs.existsSync(d));
if (missingSources.length === sources.length) {
  console.error(`No source folder found. Looked in:\n  ${sources.join('\n  ')}`);
  process.exit(1);
}
for (const d of missingSources) console.warn(`  ! source folder missing, skipping: ${d}`);

/* ---- Collect every candidate image ---- */
const candidates = [];

/** Record one prompt folder, if it actually holds a screen.png. */
function take(dir, folder, batch) {
  const png = path.join(dir, 'screen.png');
  if (!fs.existsSync(png)) return false;
  candidates.push({ batch, folder, png, bytes: fs.statSync(png).size });
  return true;
}

for (const source of sources) {
  if (!fs.existsSync(source)) continue;
  const sourceName = path.basename(source);
  for (const entry of fs.readdirSync(source)) {
    const dir = path.join(source, entry);
    if (!fs.statSync(dir).isDirectory()) continue;
    // Flat layout: this IS a prompt folder, so the source name is the batch.
    if (take(dir, entry, sourceName)) continue;
    // Nested layout: this is a batch folder holding prompt folders.
    for (const folder of fs.readdirSync(dir)) {
      const inner = path.join(dir, folder);
      if (!fs.statSync(inner).isDirectory()) continue;
      take(inner, folder, entry);
    }
  }
}

/* ---- Resolve each to a dex entry ---- */
const perDrink = new Map();
const orphans = new Map();

for (const c of candidates) {
  const keys = drinkNamesFromPrompt(c.folder);
  let drink = null;
  for (const key of keys) {
    // Aliases outrank the name map: they exist to settle cases the raw name
    // gets wrong, such as the two entries both called "Lemon Drop".
    drink = byId.get(ALIASES[key]) ?? byName.get(key) ?? null;
    if (drink) break;
  }
  if (!drink) {
    const key = keys[keys.length - 1];
    orphans.set(key, (orphans.get(key) ?? 0) + 1);
    continue;
  }
  if (!perDrink.has(drink.id)) perDrink.set(drink.id, []);
  perDrink.get(drink.id).push({ ...c, drink });
}

/* ---- One image per drink: the largest file, as a proxy for most detail ---- */
const picks = [];
let duplicatesDropped = 0;
const overridesUsed = [];
for (const [id, list] of perDrink) {
  list.sort((a, b) => b.bytes - a.bytes);
  duplicatesDropped += list.length - 1;
  let chosen = list[0];
  const want = OVERRIDES[id];
  if (want) {
    const forced = list.find((c) => c.batch === want);
    if (forced) {
      chosen = forced;
      overridesUsed.push(id);
    } else {
      console.warn(`  ! override for '${id}' wants batch '${want}', which has no image — using the default pick`);
    }
  }
  picks.push({ id, ...chosen });
}
picks.sort((a, b) => a.drink.dexNumber - b.drink.dexNumber);

/* ---- Encode ---- */
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

let outBytes = 0;
for (const p of picks) {
  const out = path.join(OUT_DIR, `${p.id}.webp`);
  execFileSync('cwebp', ['-quiet', '-q', String(QUALITY), '-resize', String(SIZE), String(SIZE), p.png, '-o', out]);
  outBytes += fs.statSync(out).size;
}

/* ---- Static require map (Metro cannot resolve a dynamic require) ---- */
const lines = picks.map((p) => `  '${p.id}': require('../../assets/drinks/${p.id}.webp'),`).join('\n');
fs.writeFileSync(
  MAP_FILE,
  `/**
 * Photographs for dex entries that have one.
 *
 * GENERATED by scripts/build-drink-photos.mjs — do not edit by hand.
 * Coverage is partial (${picks.length} of ${drinks.length} entries); everything else falls
 * back to the procedural artwork in components/artwork.
 *
 * The requires are written out one per line because Metro resolves them
 * statically at build time — a computed require path returns undefined.
 */
const PHOTOS: Record<string, number> = {
${lines}
};

/** The photograph for a drink, or undefined when it has none. */
export function drinkPhoto(id: string): number | undefined {
  return PHOTOS[id];
}

/** How many entries ship with a photograph. */
export const PHOTO_COUNT = ${picks.length};
`,
  'utf8',
);

/* ---- Report ---- */
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const covered = new Set(picks.map((p) => p.id));
const cocktails = drinks.filter((d) => d.category === 'cocktail');

console.log(`source images      ${candidates.length}  (${mb(candidates.reduce((s, c) => s + c.bytes, 0))})`);
console.log(`written            ${picks.length} webp @ ${SIZE}px q${QUALITY}  (${mb(outBytes)})`);
console.log(`duplicates dropped ${duplicatesDropped}`);
if (overridesUsed.length) console.log(`overrides applied  ${overridesUsed.join(', ')}`);
console.log(`cocktail coverage  ${cocktails.filter((c) => covered.has(c.id)).length} / ${cocktails.length}`);
if (orphans.size) {
  console.log(`\nnot in the dex (${[...orphans.values()].reduce((a, b) => a + b, 0)} images, no entry to attach to):`);
  console.log('  ' + [...orphans.keys()].sort().join(', '));
}
