/**
 * Maps the catalogue photographs onto dex entries and bakes the two faces
 * the app shows of each (specs/v3-cabinet.md §8):
 *
 *   assets/drinks/<id>.webp        the tungsten re-light, 1024px q82
 *   assets/drinks/ghost/<id>.webp  the ghost a locked Dex slot shows, 256px q80
 *
 * plus src/data/drinkPhotos.ts, the static require map for both.
 *
 * The bake is scripts/lib/tungsten.py (numpy + Pillow), run once for every
 * photo. This script owns every input the bake takes: the two theme colours,
 * sizes, per-photo overrides and the QA gates, so the Python has no
 * defaults of its own to drift. It writes lossless PNG; this script
 * encodes the WebP with cwebp and only replaces assets/drinks once every
 * photo has passed the seam gate.
 *
 * The source folders are named after the generation PROMPT, not the drink, so
 * the drink has to be parsed back out of the prompt text. ALIASES covers the
 * cases where the prompt wording and the dataset name genuinely differ.
 *
 * Needs Python 3 with numpy and Pillow, and `cwebp` and `dwebp` (brew install webp).
 *
 *   node scripts/build-drink-photos.mjs [--src <dir>] [--qa <dir>] [--manifest <file>] [--size 1024] [--quality 82]
 *   node scripts/build-drink-photos.mjs --grade off --qa <dir>
 *
 *   --qa <dir>     also write lit.png and ghost.png (contact sheets) and flags.json
 *   --grade off    skip the re-light and sheet the masters as they are, for a
 *                  before/after comparison. QA only: assets/ and src/ are not touched.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};

const fail = (msg) => {
  console.error(`\n  build-drink-photos: ${msg}\n`);
  process.exit(1);
};

/**
 * Where the generated photographs live. Later sources are newer batches.
 *
 * Two folder shapes are in play and both are supported: the Desktop set nests
 * prompt folders inside batch folders, the Downloads set puts them at the top
 * level. Either way the leaf holding `screen.png` is the prompt folder.
 */
/**
 * The photograph masters: one 1024px PNG per dex entry, named by its id.
 *
 * Previously this read the generator's raw exports — prompt folders scattered
 * across the Desktop and several Downloads batches, carrying every duplicate
 * take. Those were consolidated to one master per drink, so the prompt-name
 * parsing below now only matters if a fresh generator export is added back as
 * an extra source.
 */
const SOURCES = [path.join(process.env.HOME, 'Desktop', 'CLINK DEX PHOTOS')];

const srcArg = arg('--src', null);
const sources = srcArg ? srcArg.split(',') : SOURCES;
/**
 * The lit face is 1024, the masters' own size, so it is re-encoded but never
 * resampled: the drink page's full-bleed hero is about 1,179px wide at 3x,
 * and anything smaller is upscaled there.
 *
 * The ghost is 256. It is an impression, drawn about 2x up in a Dex window,
 * where the softness is intended, and a sixteenth of the pixels is what
 * keeps a screen of locked slots cheap to decode (spec §11: 0.26 MB each
 * against 4 MB for a 1024px face).
 */
const SIZE = Number(arg('--size', 1024));
const QUALITY = Number(arg('--quality', 82));
const GHOST_SIZE = 256;
const GHOST_QUALITY = 80;
const OUT_DIR = path.join(ROOT, 'assets', 'drinks');
/** The new set is encoded here and swapped in whole, so a failed bake leaves assets/drinks as it was. */
const STAGE_DIR = path.join(ROOT, 'assets', '.drinks-next');
const MAP_FILE = path.join(ROOT, 'src', 'data', 'drinkPhotos.ts');
const TUNGSTEN = path.join(ROOT, 'scripts', 'lib', 'tungsten.py');
/** Labels on the QA sheets, in the app's own face. */
const QA_FONT = path.join(ROOT, 'assets', 'fonts', 'InterLatin_500Medium.ttf');

const GRADE = arg('--grade', 'on');
if (GRADE !== 'on' && GRADE !== 'off') fail(`--grade takes on or off, not '${GRADE}'.`);
const QA_DIR = arg('--qa', null) ? path.resolve(arg('--qa', null)) : null;
if (GRADE === 'off' && !QA_DIR) {
  fail('--grade off is a QA comparison, never a build: it needs --qa <dir> and writes nothing else.');
}

/* ---- The light ---- */

/**
 * The tungsten pool: the warm wall colour at the centre of the light, behind
 * the glass (grade.py's value). Not a theme token, because nothing in the app
 * draws it; it exists only inside the photographs.
 */
const POOL = '#7C5642';
/** Where the light pool sits, as a fraction of the frame. Every master centres its glass about here. */
const POOL_CENTRE = { cx: 0.5, cy: 0.46 };

/**
 * The two colours the bake must match, read from theme.ts with the regex
 * check-contrast.mjs uses:
 *   SETTLE   colors.liningDeep, the colour every lit photo meets at its
 *            edges, so the drink page's hero dissolves into its own ground
 *            with no seam;
 *   GHOST_HI colors.ghostHi, the highlight end of the ghost.
 * No fallback values: a guessed colour would bake the wrong edge into every
 * file and pass every check, so a missing token stops the build instead.
 */
function themeColors(keys) {
  const theme = fs.readFileSync(path.join(ROOT, 'src', 'constants', 'theme.ts'), 'utf8');
  const from = theme.indexOf('export const colors = {');
  const to = from < 0 ? -1 : theme.indexOf('} as const;', from);
  if (from < 0 || to < 0) fail('cannot find `export const colors = {` … `} as const;` in src/constants/theme.ts.');
  const found = {};
  for (const [, key, value] of theme.slice(from, to).matchAll(/(\w+):\s*'(#[0-9A-Fa-f]{6})'/g)) {
    found[key] = value.toUpperCase();
  }
  const missing = keys.filter((k) => !found[k]);
  if (missing.length) {
    fail(
      `${missing.map((k) => `colors.${k}`).join(' and ')} not found as a plain '#RRGGBB' in src/constants/theme.ts.\n` +
        '  The bake settles every photo to colors.liningDeep and maps each ghost up to colors.ghostHi;\n' +
        '  both arrive with the v3 tokens. Nothing was written.',
    );
  }
  return found;
}

const THEME_COLORS = themeColors(['liningDeep', 'ghostHi']);
const SETTLE = THEME_COLORS.liningDeep;
const GHOST_HI = THEME_COLORS.ghostHi;

/**
 * The QA gates (spec §8.3), measured by tungsten.py on every photo.
 *   seam     max per-channel difference from SETTLE over the outer 1% ring,
 *            out of 255. The only gate that FAILS the build: the drink page's
 *            dissolve depends on it. Checked on the PNG and again on the
 *            encoded WebP, which is what ships.
 *   stray    share of the frame away from the light (pool < 0.25) brighter
 *            than twice the wall there: a patch still glowing.
 *   subject  p99 linear luminance inside the light's core: below it the
 *            drink has been crushed into the wall.
 *   ghost    luminance spread inside the core of the ghost: below it the
 *            impression is too faint to read.
 * The last three only flag a photo for review.
 */
const GATES = { seam: 6, stray: 0.004, subject: 0.2, ghost: 0.05 };

/**
 * Per-photo corrections to the bake, for a photo the QA review says is
 * wrong:
 *   cx, cy  move the light pool (fractions of the frame) onto a glass that
 *           does not stand at the centre;
 *   mode    'wash' for a photo whose backdrop mask fails: the mask-free
 *           wash alone, which can never leave a patch but dims clear glass.
 * Empty until a review names one.
 */
const GRADE_OVERRIDES = {};

/**
 * Where several takes exist, the default pick is the largest file. These are
 * the ones where that picked a bad frame — value is the batch folder to prefer.
 */
const OVERRIDES = {
  // Empty by design. Each drink now has exactly one master in CLINK DEX
  // PHOTOS, so there is no competing take to choose between — the entries
  // that used to live here (a Cosmopolitan with a hand in frame, four
  // regenerated frames, two re-renders) were resolved by consolidating the
  // winning file. Repopulate only if a raw generator export with duplicate
  // takes is added back as a second source.
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

/* ---- Preflight: the tools, before any work ---- */

if (spawnSync('python3', ['-c', 'import numpy, PIL'], { stdio: 'ignore' }).status !== 0) {
  fail('Needs Python 3 with numpy and Pillow (python3 -m pip install numpy pillow)');
}
for (const tool of ['cwebp', 'dwebp']) {
  const probe = spawnSync(tool, ['-version'], { stdio: 'ignore' });
  if (probe.error || probe.status !== 0) fail(`Needs ${tool} (brew install webp)`);
}

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

/**
 * A loose image file named for a dex id, e.g. `black-russian.png`.
 *
 * The generator normally hands over prompt folders, but an image that arrives
 * some other way (saved out of a chat, a one-off re-render) has no prompt to
 * parse. Naming the file after the id says directly what it is, and lands it
 * in a real source folder so a rebuild keeps it — dropping it straight into
 * assets/drinks would be erased, since the build replaces that directory.
 */
const BY_ID_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

for (const source of sources) {
  if (!fs.existsSync(source)) continue;
  const sourceName = path.basename(source);
  for (const entry of fs.readdirSync(source)) {
    const dir = path.join(source, entry);
    if (!fs.statSync(dir).isDirectory()) {
      const ext = path.extname(entry).toLowerCase();
      const id = path.basename(entry, path.extname(entry));
      if (BY_ID_EXT.has(ext) && byId.has(id)) {
        candidates.push({ batch: sourceName, folder: entry, png: dir, bytes: fs.statSync(dir).size, byId: id });
      }
      continue;
    }
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
  if (c.byId) {
    // Same shape as the parsed path below: downstream sorting and the
    // manifest both read `.drink` off the pick.
    if (!perDrink.has(c.byId)) perDrink.set(c.byId, []);
    perDrink.get(c.byId).push({ ...c, drink: byId.get(c.byId) });
    continue;
  }
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
if (picks.length === 0) fail('no photograph matched a dex entry; nothing to bake.');

/* ---- Grade overrides: only real photos, only known knobs ---- */
const picked = new Set(picks.map((p) => p.id));
for (const [id, o] of Object.entries(GRADE_OVERRIDES)) {
  if (!picked.has(id)) console.warn(`  ! GRADE_OVERRIDES['${id}'] names no photographed entry; ignored`);
  for (const [k, v] of Object.entries(o)) {
    const ok =
      ((k === 'cx' || k === 'cy') && typeof v === 'number' && v >= 0 && v <= 1) ||
      (k === 'mode' && (v === 'masked' || v === 'wash'));
    if (!ok) fail(`GRADE_OVERRIDES['${id}'].${k} = ${JSON.stringify(v)}: cx and cy take 0..1, mode 'masked' or 'wash'.`);
  }
}

/* ---- Bake: one Python run for every photo ---- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drink-photos-'));
// Runs on every exit, failures included, so neither scratch area outlives the build.
process.on('exit', () => {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(STAGE_DIR, { recursive: true, force: true });
});
// Without a listener, Ctrl-C kills node outright: no 'exit', so the staged set
// was left inside assets/, and a press between removing assets/drinks and
// renaming the new set in lost both. A listener only runs once the script's
// synchronous code has returned, so the swap is never cut in half: Ctrl-C
// fails the build through the child it reaches (python, cwebp), and a signal
// node alone receives lands after the build has finished.
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(130));
fs.mkdirSync(path.join(tmp, 'lit'));
fs.mkdirSync(path.join(tmp, 'ghost'));

const job = {
  colors: { settle: SETTLE, ghostHi: GHOST_HI, pool: POOL },
  size: SIZE,
  ghostSize: GHOST_SIZE,
  grade: GRADE === 'on',
  pool: POOL_CENTRE,
  gates: GATES,
  qa: QA_DIR ? { dir: QA_DIR, font: QA_FONT } : null,
  photos: picks.map((p) => ({
    id: p.id,
    master: p.png,
    lit: path.join(tmp, 'lit', `${p.id}.png`),
    ghost: path.join(tmp, 'ghost', `${p.id}.png`),
    override: Object.prototype.hasOwnProperty.call(GRADE_OVERRIDES, p.id) ? GRADE_OVERRIDES[p.id] : null,
  })),
};
const jobFile = path.join(tmp, 'job.json');
fs.writeFileSync(jobFile, JSON.stringify(job, null, 1));

const startedAt = Date.now();
console.log(`baking ${picks.length} photographs${GRADE === 'off' ? ' (--grade off: masters as they are)' : ''}`);
const run = spawnSync('python3', [TUNGSTEN, '--job', jobFile, '--out', tmp], { stdio: 'inherit' });
if (run.status !== 0) fail(`scripts/lib/tungsten.py exited with ${run.status ?? run.signal}. Nothing was written.`);
const metrics = JSON.parse(fs.readFileSync(path.join(tmp, 'metrics.json'), 'utf8'));

/**
 * flags.json beside the contact sheets: every gate result, so the review can
 * see why a tile is amber and how close the rest came.
 */
function writeFlags() {
  if (!QA_DIR) return;
  const flagged = picks
    .filter((p) => metrics[p.id].flags.length)
    .map((p) => ({ id: p.id, name: p.drink.name, dexNumber: p.drink.dexNumber, flags: metrics[p.id].flags }));
  fs.writeFileSync(
    path.join(QA_DIR, 'flags.json'),
    JSON.stringify(
      {
        grade: GRADE === 'on' ? 'tungsten' : 'off',
        colors: { settle: SETTLE, ghostHi: GHOST_HI, pool: POOL },
        gates: GATES,
        photos: picks.length,
        flagged,
        metrics,
      },
      null,
      1,
    ),
  );
}

/** "3 of 162  (stray light 2, ghost 1)", from the metrics as they stand. */
function flagSummary() {
  const counts = {};
  for (const m of Object.values(metrics)) for (const f of m.flags) counts[f] = (counts[f] ?? 0) + 1;
  const n = Object.values(metrics).filter((m) => m.flags.length).length;
  return `${n} of ${picks.length}` + (n ? `  (${Object.entries(counts).map(([k, c]) => `${k} ${c}`).join(', ')})` : '');
}

if (GRADE === 'off') {
  writeFlags();
  console.log(`QA sheets          ${QA_DIR}  (ungraded masters; assets/ and src/ untouched)`);
  console.log(`would be flagged   ${flagSummary()}`);
  process.exit(0);
}

/* ---- Encode, then check the seam on what ships ---- */
fs.rmSync(STAGE_DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(STAGE_DIR, 'ghost'), { recursive: true });

const settleRgb = [1, 3, 5].map((i) => parseInt(SETTLE.slice(i, i + 2), 16));

/**
 * The seam gate's measure on an encoded WebP: the largest per-channel
 * difference from SETTLE over the outer 1% ring. Lossy encoding can move a
 * flat edge by a level or two, so the PNG passing is not enough on its own.
 * PAM is the interchange because dwebp speaks it and it needs no image
 * library: a text header, then raw samples.
 */
function webpSeam(file) {
  const pam = path.join(tmp, 'seam.pam');
  execFileSync('dwebp', ['-quiet', file, '-pam', '-o', pam]);
  const buf = fs.readFileSync(pam);
  const end = buf.indexOf('ENDHDR\n') + 'ENDHDR\n'.length;
  const head = buf.subarray(0, end).toString('latin1');
  const field = (k) => Number(new RegExp(`^${k} (\\d+)$`, 'm').exec(head)[1]);
  const [w, h, depth] = [field('WIDTH'), field('HEIGHT'), field('DEPTH')];
  // The ring by pixel centres, as tungsten.py measures it: whole rows at the
  // top and bottom, the side columns in between.
  const inRing = (i, n) => Math.min((i + 0.5) / n, 1 - (i + 0.5) / n) < 0.01;
  const sideCols = [];
  for (let x = 0; x < w; x++) if (inRing(x, w)) sideCols.push(x);
  let worst = 0;
  for (let y = 0; y < h; y++) {
    const cols = inRing(y, h) ? null : sideCols;
    for (let k = 0, n = cols ? cols.length : w; k < n; k++) {
      const i = end + (y * w + (cols ? cols[k] : k)) * depth;
      for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(buf[i + c] - settleRgb[c]));
    }
  }
  return worst;
}

let litBytes = 0;
let ghostBytes = 0;
let worstSeam = 0;
for (const p of picks) {
  const lit = path.join(STAGE_DIR, `${p.id}.webp`);
  const ghost = path.join(STAGE_DIR, 'ghost', `${p.id}.webp`);
  execFileSync('cwebp', ['-quiet', '-q', String(QUALITY), path.join(tmp, 'lit', `${p.id}.png`), '-o', lit]);
  execFileSync('cwebp', ['-quiet', '-q', String(GHOST_QUALITY), path.join(tmp, 'ghost', `${p.id}.png`), '-o', ghost]);
  litBytes += fs.statSync(lit).size;
  ghostBytes += fs.statSync(ghost).size;
  const m = metrics[p.id];
  m.seamWebp = webpSeam(lit);
  if (m.seamWebp > GATES.seam && !m.flags.includes('seam')) m.flags.push('seam');
  worstSeam = Math.max(worstSeam, m.seam, m.seamWebp);
}
writeFlags();

const seamFailed = picks.filter((p) => metrics[p.id].flags.includes('seam'));
if (seamFailed.length) {
  fail(
    `${seamFailed.length} photo(s) do not settle to ${SETTLE} at the edge (seam gate: ≤ ${GATES.seam}/255):\n` +
      seamFailed.map((p) => `    ${p.id}  png ${metrics[p.id].seam}, webp ${metrics[p.id].seamWebp}`).join('\n') +
      '\n  assets/drinks and drinkPhotos.ts were left as they were.' +
      (QA_DIR ? `\n  See ${path.join(QA_DIR, 'flags.json')}.` : ''),
  );
}

/* ---- Swap the new set in whole (this also retires the old locked/ set) ---- */
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.renameSync(STAGE_DIR, OUT_DIR);

/* ---- Static require map (Metro cannot resolve a dynamic require) ---- */
const lines = picks.map((p) => `  '${p.id}': require('../../assets/drinks/${p.id}.webp'),`).join('\n');
const ghostLines = picks
  .map((p) => `  '${p.id}': require('../../assets/drinks/ghost/${p.id}.webp'),`)
  .join('\n');
fs.writeFileSync(
  MAP_FILE,
  `/**
 * Photographs for dex entries that have one.
 *
 * GENERATED by scripts/build-drink-photos.mjs — do not edit by hand.
 * Coverage is partial (${picks.length} of ${drinks.length} entries); everything else falls
 * back to the procedural artwork in components/artwork.
 *
 * Every photograph is the tungsten re-light (specs/v3-cabinet.md §8): the
 * studio master re-lit as a drink in one warm pool of light, against a wall
 * that settles at every edge to colors.liningDeep (${SETTLE} when baked), so
 * a photo meets the cellar ground with no seam. If liningDeep changes, run
 * the script again: the edge colour is in the pixels.
 *
 * The requires are written out one per line because Metro resolves them
 * statically at build time — a computed require path returns undefined.
 */
const PHOTOS: Record<string, number> = {
${lines}
};

/**
 * The ghost of each photograph: what a locked Dex slot shows. Baked from the
 * lit photo as an embossed impression running from liningDeep up to
 * colors.ghostHi (${GHOST_HI}), at ${GHOST_SIZE}px. Baked, not drawn at runtime,
 * because iOS does not run CSS filters on images.
 */
const GHOST: Record<string, number> = {
${ghostLines}
};

/** The lit photograph for a drink, or undefined when it has none. */
export function drinkPhoto(id: string): number | undefined {
  // Own keys only: a hostile id like 'constructor' must not resolve.
  return Object.prototype.hasOwnProperty.call(PHOTOS, id) ? PHOTOS[id] : undefined;
}

/** The ghost of drinkPhoto(id), for a locked slot, or undefined when there is no photograph. */
export function drinkPhotoGhost(id: string): number | undefined {
  return Object.prototype.hasOwnProperty.call(GHOST, id) ? GHOST[id] : undefined;
}

/**
 * @deprecated The locked face is now the ghost: use drinkPhotoGhost. Kept so
 * build 13's callers compile until they move over; removed in v3 stage 3.
 */
export const drinkPhotoLocked = drinkPhotoGhost;

/** How many entries ship with a photograph. */
export const PHOTO_COUNT = ${picks.length};
`,
  'utf8',
);

/* ---- Optional manifest: which source file won for each drink ---- */
const manifestPath = arg('--manifest', null);
if (manifestPath) {
  const orphanPicks = new Map();
  for (const c of candidates) {
    if (c.byId) continue;
    const keys = drinkNamesFromPrompt(c.folder);
    if (keys.some((k) => byId.get(ALIASES[k]) ?? byName.get(k))) continue;
    const key = keys[keys.length - 1];
    const best = orphanPicks.get(key);
    if (!best || c.bytes > best.bytes) orphanPicks.set(key, c);
  }
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        picks: picks.map((p) => ({ id: p.id, dexNumber: p.drink.dexNumber, name: p.drink.name, source: p.png })),
        notInDex: [...orphanPicks.entries()].map(([key, c]) => ({ key, source: c.png })),
      },
      null,
      2,
    ),
  );
  console.log(`manifest written    ${manifestPath}`);
}

/* ---- Report ---- */
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const covered = new Set(picks.map((p) => p.id));
const cocktails = drinks.filter((d) => d.category === 'cocktail');
const overridden = Object.keys(GRADE_OVERRIDES).filter((id) => picked.has(id));

console.log(`source images      ${candidates.length}  (${mb(candidates.reduce((s, c) => s + c.bytes, 0))})`);
console.log(`lit                ${picks.length} webp @ ${SIZE}px q${QUALITY}  (${mb(litBytes)})`);
console.log(`ghost              ${picks.length} webp @ ${GHOST_SIZE}px q${GHOST_QUALITY}  (${mb(ghostBytes)})`);
console.log(`settle             ${SETTLE} (colors.liningDeep)  worst seam ${worstSeam}/255, gate ${GATES.seam}`);
console.log(`flagged            ${flagSummary()}${QA_DIR ? `  → ${path.join(QA_DIR, 'flags.json')}` : ''}`);
if (overridden.length) console.log(`grade overrides    ${overridden.join(', ')}`);
console.log(`duplicates dropped ${duplicatesDropped}`);
if (overridesUsed.length) console.log(`overrides applied  ${overridesUsed.join(', ')}`);
console.log(`cocktail coverage  ${cocktails.filter((c) => covered.has(c.id)).length} / ${cocktails.length}`);
console.log(`took               ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
if (orphans.size) {
  console.log(`\nnot in the dex (${[...orphans.values()].reduce((a, b) => a + b, 0)} images, no entry to attach to):`);
  console.log('  ' + [...orphans.keys()].sort().join(', '));
}
