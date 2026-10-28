/**
 * Maps the catalogue photographs onto dex entries and bakes the two faces
 * the app shows of each (specs/v4-mockups/white/spec.md §6):
 *
 *   assets/drinks/<id>.webp        the daylight print, 1024px q82
 *   assets/drinks/proof/<id>.webp  the "not yet" proof a Dex cell shows, 256px q80
 *
 * plus src/data/drinkPhotos.ts, the static require map for both.
 *
 * The bake is scripts/lib/daylight.py (numpy + Pillow), run once for every
 * photo: the wall neutralised, the drink left exactly as shot. This script
 * owns the sizes, the qualities and the gates and passes them in; the bake's
 * own numbers live in daylight.py, and its sha256 goes into the header of
 * drinkPhotos.ts, so a photo set always says which bake made it. The Python
 * writes lossless PNG; this script encodes the WebP with cwebp and only
 * replaces assets/drinks once every photo has passed the gates.
 *
 * The source folders are named after the generation PROMPT, not the drink, so
 * the drink has to be parsed back out of the prompt text. ALIASES covers the
 * cases where the prompt wording and the dataset name genuinely differ.
 *
 * Needs Python 3 with numpy and Pillow, and `cwebp` and `dwebp` (brew install webp).
 *
 *   node scripts/build-drink-photos.mjs [--src <dir>] [--qa <dir>] [--manifest <file>] [--size 1024] [--quality 82]
 *   node scripts/build-drink-photos.mjs --grade off --qa <dir>
 *   node scripts/build-drink-photos.mjs --check
 *
 *   --qa <dir>     also write prints.png and proofs.png (contact sheets) and flags.json
 *   --grade off    skip the bake and sheet the masters as they are, to compare
 *                  with the default, --grade daylight. QA only: assets/ and src/
 *                  are not touched.
 *   --check        bake nothing: fail if drinkPhotos.ts was made by another
 *                  daylight.py than the repo's, or a file it requires is missing.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const fail = (msg) => {
  console.error(`\n  build-drink-photos: ${msg}\n`);
  process.exit(1);
};

/** A flag's value. A flag with nothing after it is a mistake, not the default. */
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  const value = process.argv[i + 1];
  if (value === undefined || value.startsWith('--')) fail(`${flag} needs a value.`);
  return value;
};

const OUT_DIR = path.join(ROOT, 'assets', 'drinks');
/** The new set is encoded here and swapped in whole, so a failed bake leaves assets/drinks as it was. */
const STAGE_DIR = path.join(ROOT, 'assets', '.drinks-next');
/** The old set, moved aside for the moment of the swap. */
const PREV_DIR = path.join(ROOT, 'assets', '.drinks-prev');
const MAP_FILE = path.join(ROOT, 'src', 'data', 'drinkPhotos.ts');
const DAYLIGHT = path.join(ROOT, 'scripts', 'lib', 'daylight.py');
/** Labels on the QA sheets, in the app's own face. */
const QA_FONT = path.join(ROOT, 'assets', 'fonts', 'ArchivoLatin_500Medium.ttf');

if (!fs.existsSync(DAYLIGHT)) fail(`${path.relative(ROOT, DAYLIGHT)} is missing: it is the bake.`);
/** The bake script's sha256, as the generated header records it. */
const bakeHash = () => createHash('sha256').update(fs.readFileSync(DAYLIGHT)).digest('hex');

/*
 * ---- --check: is the shipped set this daylight.py's bake? ----
 * The header's hash is how the photos and the bake stay in step: an edit to
 * daylight.py changes nothing on screen until the photos are rebuilt, so
 * without this a stale set would look current.
 */
if (process.argv.includes('--check')) {
  const map = fs.existsSync(MAP_FILE) ? fs.readFileSync(MAP_FILE, 'utf8') : '';
  const baked = /daylight\.py sha256 ([0-9a-f]{64})/.exec(map)?.[1];
  const now = bakeHash();
  const rebuild = 'Run node scripts/build-drink-photos.mjs.';
  if (!baked) fail(`src/data/drinkPhotos.ts names no daylight.py sha256, so it predates the daylight bake. ${rebuild}`);
  if (baked !== now) {
    fail(`the photos were baked by daylight.py ${baked.slice(0, 12)}, and the repo's is ${now.slice(0, 12)}. ${rebuild}`);
  }
  const required = [...map.matchAll(/require\('\.\.\/\.\.\/(assets\/drinks\/[^']+)'\)/g)].map((m) => m[1]);
  const missing = required.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  if (missing.length) fail(`${missing.length} of the ${required.length} files drinkPhotos.ts requires are missing (${missing[0]}…). ${rebuild}`);
  console.log(`drink photos: daylight.py ${now.slice(0, 12)}'s bake, all ${required.length} files present`);
  process.exit(0);
}

/**
 * The photograph masters: one 1024px PNG per dex entry, named by its id.
 *
 * Previously this read the generator's raw exports — prompt folders scattered
 * across the Desktop and several Downloads batches, carrying every duplicate
 * take. Those were consolidated to one master per drink, so the prompt-name
 * parsing below now only matters if a fresh generator export is added back as
 * an extra source. Both folder shapes are still supported: the Desktop set
 * nested prompt folders inside batch folders, the Downloads set put them at
 * the top level, and either way the leaf holding `screen.png` is the prompt.
 */
const SOURCES = [path.join(process.env.HOME, 'Desktop', 'CLINK DEX PHOTOS')];

const srcArg = arg('--src', null);
const sources = srcArg ? srcArg.split(',') : SOURCES;
/**
 * The print is 1024, the masters' own size, so it is re-encoded but never
 * resampled: the drink page's full-bleed hero is about 1,179px wide at 3x,
 * and anything smaller is upscaled there.
 *
 * The proof is 256, as the ghost it replaces was (white spec 6.3). A Dex cell
 * draws it about 2x up, where the softness reads as a print still waiting for
 * its colour, and a sixteenth of the pixels keeps a screen of not-yet cells
 * cheap to decode (0.26 MB each against 4 MB for a 1024px print).
 */
const SIZE = Number(arg('--size', 1024));
const QUALITY = Number(arg('--quality', 82));
if (!Number.isInteger(SIZE) || SIZE < 64) fail(`--size takes a whole number of pixels (64 or more), not '${arg('--size')}'.`);
if (!Number.isInteger(QUALITY) || QUALITY < 0 || QUALITY > 100) fail(`--quality takes 0 to 100, not '${arg('--quality')}'.`);
const PROOF_SIZE = 256;
const PROOF_QUALITY = 80;

const GRADE = arg('--grade', 'daylight');
if (GRADE !== 'daylight' && GRADE !== 'off') fail(`--grade takes daylight or off, not '${GRADE}'.`);
const QA_DIR = arg('--qa', null) ? path.resolve(arg('--qa', null)) : null;
if (GRADE === 'off' && !QA_DIR) {
  fail('--grade off is a QA comparison, never a build: it needs --qa <dir> and writes nothing else.');
}

/* ---- The gates (white spec §9) ---- */

/**
 * Measured by daylight.py on the 8-bit PNG of every photo, before encoding:
 *   tintLeft    the most chroma (max − min channel, of 255) left on any wall
 *               pixel, one the master has under chroma 14. FAILS over 0: a
 *               tinted wall is a hue coming back onto a page that has none.
 *   drinkShift  the largest change in HSV saturation on any drink pixel, one
 *               the master has at chroma 40 or over. FAILS over 0: the drink
 *               is the one thing the bake must not touch.
 *   wallRange   the wall at the top (median of the top eighth) as a grey
 *               level, against the spec's #C4 to #E2. Reported, never a
 *               flag: the bake keeps each master's own brightness by design,
 *               and the masters run #A9 to #E9, so a third of the set would
 *               be marked for something no bake setting changes.
 *
 * And on the encoded WebP, which is what ships:
 *   proofTint   chroma anywhere in a decoded proof. FAILS over 1: libwebp's
 *               fixed-point YUV to RGB decodes a grey pixel with its channels
 *               up to 1 apart (measured on every proof), so 1 is grey and 2 is
 *               a tint.
 *   wallTint    chroma of the decoded print's wall at the top. Flags over 1
 *               for review: a warm seamless whose chroma sits on the ramp
 *               (carajillo's measures 18) keeps a sliver of its tint by design,
 *               and the gate shows where. A median, because 4:2:0 chroma lets
 *               a drink's colour bleed a pixel or two into the wall beside it,
 *               which is the encoder's and no tint at all.
 */
const GATES = { tintLeft: 0, drinkShift: 0, wallRange: [0xc4, 0xe2], proofTint: 1, wallTint: 1 };
/** The gates that stop the build. The rest only flag a photo for review. */
const FAILS = new Set(['wall tint', 'drink saturation', 'proof tint']);
/** "The wall at the top" is the median of the top 1/TOP of the frame, as daylight.py measures it. */
const TOP = 8;

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

/* ---- Bake: one Python run for every photo ---- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drink-photos-'));
// Runs on every exit, failures included, so neither scratch area outlives the build.
process.on('exit', () => {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(STAGE_DIR, { recursive: true, force: true });
  // A swap stopped between its two renames: put the old set back.
  if (fs.existsSync(PREV_DIR) && !fs.existsSync(OUT_DIR)) fs.renameSync(PREV_DIR, OUT_DIR);
  fs.rmSync(PREV_DIR, { recursive: true, force: true });
});
// Without a listener, Ctrl-C kills node outright: no 'exit', so the staged set
// was left inside assets/, and a press in the middle of the swap could leave
// assets/drinks without either set. A listener only runs once the script's
// synchronous code has returned, so the swap is never cut in half: Ctrl-C
// fails the build through the child it reaches (python, cwebp), and a signal
// node alone receives lands after the build has finished.
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(130));
fs.mkdirSync(path.join(tmp, 'print'));
fs.mkdirSync(path.join(tmp, 'proof'));

// Hashed before the run, so the header names the file that actually baked.
const BAKE_SHA = bakeHash();
const job = {
  grade: GRADE,
  size: SIZE,
  proofSize: PROOF_SIZE,
  gates: { tintLeft: GATES.tintLeft, drinkShift: GATES.drinkShift },
  qa: QA_DIR ? { dir: QA_DIR, font: QA_FONT } : null,
  photos: picks.map((p) => ({
    id: p.id,
    master: p.png,
    print: path.join(tmp, 'print', `${p.id}.png`),
    proof: path.join(tmp, 'proof', `${p.id}.png`),
  })),
};
const jobFile = path.join(tmp, 'job.json');
fs.writeFileSync(jobFile, JSON.stringify(job, null, 1));

const startedAt = Date.now();
console.log(`baking ${picks.length} photographs${GRADE === 'off' ? ' (--grade off: masters as they are)' : ''}`);
const run = spawnSync('python3', [DAYLIGHT, '--job', jobFile, '--out', tmp], { stdio: 'inherit' });
if (run.status !== 0) fail(`scripts/lib/daylight.py exited with ${run.status ?? run.signal}. Nothing was written.`);
const { bake, photos: metrics } = JSON.parse(fs.readFileSync(path.join(tmp, 'metrics.json'), 'utf8'));

/**
 * flags.json beside the contact sheets: every gate result, so the review can
 * see why a tile is flagged and how close the rest came.
 */
function writeFlags() {
  if (!QA_DIR) return;
  const flagged = picks
    .filter((p) => metrics[p.id].flags.length)
    .map((p) => ({ id: p.id, name: p.drink.name, dexNumber: p.drink.dexNumber, flags: metrics[p.id].flags }));
  fs.writeFileSync(
    path.join(QA_DIR, 'flags.json'),
    JSON.stringify(
      { grade: GRADE, bake, daylightSha256: BAKE_SHA, gates: GATES, photos: picks.length, flagged, wallOutsideRange: outsideRange(), metrics },
      null,
      1,
    ),
  );
}

/** "3 of 162  (wall tint (webp) 2, proof tint 1)", from the metrics as they stand. */
function flagSummary() {
  const counts = {};
  for (const m of Object.values(metrics)) for (const f of m.flags) counts[f] = (counts[f] ?? 0) + 1;
  const n = Object.values(metrics).filter((m) => m.flags.length).length;
  return `${n} of ${picks.length}` + (n ? `  (${Object.entries(counts).map(([k, c]) => `${k} ${c}`).join(', ')})` : '');
}

const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
/** Each photo whose wall at the top falls outside GATES.wallRange, darkest first: "saturn #A9A9A9". */
function outsideRange() {
  const [lo, hi] = GATES.wallRange;
  return picks
    .filter((p) => metrics[p.id].wallLevel < lo || metrics[p.id].wallLevel > hi)
    .sort((a, b) => metrics[a.id].wallLevel - metrics[b.id].wallLevel)
    .map((p) => `${p.id} ${metrics[p.id].wall}`);
}
/** "#A9 to #E9, 58 outside #C4 to #E2", the walls at the top as they stand. */
function wallSummary() {
  const levels = picks.map((p) => metrics[p.id].wallLevel);
  const [lo, hi] = GATES.wallRange;
  return `#${hex2(Math.min(...levels))} to #${hex2(Math.max(...levels))}, ${outsideRange().length} outside #${hex2(lo)} to #${hex2(hi)}`;
}

const worst = (key) => Math.max(...picks.map((p) => metrics[p.id][key]));
const failing = () => picks.filter((p) => metrics[p.id].flags.some((f) => FAILS.has(f)));

if (GRADE === 'off') {
  writeFlags();
  console.log(`QA sheets          ${QA_DIR}  (masters as they are; assets/ and src/ untouched)`);
  console.log(`wall at the top    ${wallSummary()}, tint up to ${worst('wallTint')}`);
  console.log(`would fail         ${failing().length} of ${picks.length}  (most tint on a wall pixel ${worst('tintLeft')})`);
  console.log(`would be flagged   ${flagSummary()}`);
  process.exit(0);
}

/** One photo per line under a failure, with the numbers that failed it. */
const failLines = (list) =>
  list
    .map((p) => {
      const m = metrics[p.id];
      return `    ${p.id}  ${m.flags.filter((f) => FAILS.has(f)).join(', ')}  (tint left ${m.tintLeft}, drink shift ${m.drinkShift}${m.proofTintWebp === undefined ? '' : `, proof tint ${m.proofTintWebp}`})`;
    })
    .join('\n');
const leftAsWas = '\n  assets/drinks and drinkPhotos.ts were left as they were.' + (QA_DIR ? `\n  See ${path.join(QA_DIR, 'flags.json')}.` : '');

const bakeFailed = failing();
if (bakeFailed.length) {
  writeFlags();
  fail(`${bakeFailed.length} photo(s) failed the bake's gates (wall tint ≤ ${GATES.tintLeft}, drink saturation shift ≤ ${GATES.drinkShift}):\n${failLines(bakeFailed)}${leftAsWas}`);
}

/* ---- Encode, then check what ships ---- */
fs.rmSync(STAGE_DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(STAGE_DIR, 'proof'), { recursive: true });

/**
 * A decoded WebP's pixels. PAM is the interchange because dwebp speaks it and
 * it needs no image library: a text header, then raw samples.
 */
function decode(file) {
  const pam = path.join(tmp, 'check.pam');
  execFileSync('dwebp', ['-quiet', file, '-pam', '-o', pam]);
  const buf = fs.readFileSync(pam);
  const start = buf.indexOf('ENDHDR\n') + 'ENDHDR\n'.length;
  const head = buf.subarray(0, start).toString('latin1');
  const field = (k) => Number(new RegExp(`^${k} (\\d+)$`, 'm').exec(head)[1]);
  return { buf, start, w: field('WIDTH'), h: field('HEIGHT'), depth: field('DEPTH') };
}

/** The most chroma on any pixel. */
function maxChroma({ buf, start, w, h, depth }) {
  let most = 0;
  for (let i = start, end = start + w * h * depth; i < end; i += depth) {
    const r = buf[i];
    const g = buf[i + 1];
    const b = buf[i + 2];
    most = Math.max(most, Math.max(r, g, b) - Math.min(r, g, b));
  }
  return most;
}

/**
 * The wall at the top: each channel's median over the top 1/TOP of the
 * frame, by histogram, averaging the two middle samples and rounding half
 * up as numpy's median and daylight.py's rounding do, so the PNG's figure
 * and the WebP's compare like for like.
 */
function topWall({ buf, start, w, h, depth }) {
  const n = w * Math.max(1, Math.floor(h / TOP));
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) hist[c][buf[start + k * depth + c]]++;
  const nth = (hh, rank) => {
    for (let v = 0, seen = 0; v < 256; v++) if ((seen += hh[v]) > rank) return v;
    return 255;
  };
  const med = hist.map((hh) => Math.floor((nth(hh, (n - 1) >> 1) + nth(hh, n >> 1)) / 2 + 0.5));
  return { hex: `#${med.map(hex2).join('')}`, tint: Math.max(...med) - Math.min(...med) };
}

let printBytes = 0;
let proofBytes = 0;
for (const p of picks) {
  const print = path.join(STAGE_DIR, `${p.id}.webp`);
  const proof = path.join(STAGE_DIR, 'proof', `${p.id}.webp`);
  execFileSync('cwebp', ['-quiet', '-q', String(QUALITY), path.join(tmp, 'print', `${p.id}.png`), '-o', print]);
  execFileSync('cwebp', ['-quiet', '-q', String(PROOF_QUALITY), path.join(tmp, 'proof', `${p.id}.png`), '-o', proof]);
  printBytes += fs.statSync(print).size;
  proofBytes += fs.statSync(proof).size;
  const m = metrics[p.id];
  const wall = topWall(decode(print));
  m.wallWebp = wall.hex;
  m.wallTintWebp = wall.tint;
  m.proofTintWebp = maxChroma(decode(proof));
  if (m.wallTintWebp > GATES.wallTint) m.flags.push('wall tint (webp)');
  if (m.proofTintWebp > GATES.proofTint) m.flags.push('proof tint');
}
writeFlags();

const shipFailed = failing();
if (shipFailed.length) {
  fail(`${shipFailed.length} encoded proof(s) are not grey (proof tint ≤ ${GATES.proofTint}):\n${failLines(shipFailed)}${leftAsWas}`);
}

/*
 * ---- Swap the new set in whole (anything it lacks, such as v3's ghost/, goes with the old) ----
 * Two renames, then the delete: removing 300-odd files first left a window
 * in which neither set was in assets/. If the second rename fails, the old
 * set goes back.
 */
fs.rmSync(PREV_DIR, { recursive: true, force: true });
if (fs.existsSync(OUT_DIR)) fs.renameSync(OUT_DIR, PREV_DIR);
try {
  fs.renameSync(STAGE_DIR, OUT_DIR);
} catch (err) {
  if (fs.existsSync(PREV_DIR)) fs.renameSync(PREV_DIR, OUT_DIR);
  fail(`could not move the new set into assets/drinks (${err.message}); the old set was put back.`);
}
fs.rmSync(PREV_DIR, { recursive: true, force: true });

/* ---- Static require map (Metro cannot resolve a dynamic require) ---- */
const lines = picks.map((p) => `  '${p.id}': require('../../assets/drinks/${p.id}.webp'),`).join('\n');
const proofLines = picks
  .map((p) => `  '${p.id}': require('../../assets/drinks/proof/${p.id}.webp'),`)
  .join('\n');
fs.writeFileSync(
  MAP_FILE,
  `/**
 * Photographs for dex entries that have one.
 *
 * GENERATED by scripts/build-drink-photos.mjs — do not edit by hand.
 * Coverage is partial (${picks.length} of ${drinks.length} entries); everything else shows the
 * no-photo face (components/artwork/VectorFace).
 *
 * Every photograph is the daylight bake (specs/v4-mockups/white/spec.md §6):
 * the studio master as shot, with only the wall neutralised. A pixel under
 * chroma ${bake.onset} (the seamless, stone, glass, ice) keeps its luminance and loses
 * its tint; one at ${bake.onset + bake.span} or over (the drink, the garnish) is the master's own
 * pixel; a smoothstep runs between. So no wall brings a hue onto the page.
 * The bake reads chroma, not place: a wooden counter is as coloured as a
 * drink, so the dozen masters shot on wood keep their brown.
 *
 * The bake that made them (node scripts/build-drink-photos.mjs --check
 * compares it with the repo's scripts/lib/daylight.py):
 *   daylight.py sha256 ${BAKE_SHA}
 * If that file changes, run the script again: the bake is in the pixels.
 *
 * The requires are written out one per line because Metro resolves them
 * statically at build time — a computed require path returns undefined.
 */
const PHOTOS: Record<string, number> = {
${lines}
};

/**
 * The "not yet" proof of each photograph, what a Dex cell shows before the
 * catch: the same frame in black and white, lifted toward the wash
 * (out = ${bake.proof.ceil} − (255 − Y) × ${bake.proof.gain}), at ${PROOF_SIZE}px. Baked, not drawn at
 * runtime, because iOS does not run CSS filters on images.
 */
const PROOFS: Record<string, number> = {
${proofLines}
};

/** The daylight print for a drink, or undefined when it has none. */
export function photoFor(id: string): number | undefined {
  // Own keys only: a hostile id like 'constructor' must not resolve.
  return Object.prototype.hasOwnProperty.call(PHOTOS, id) ? PHOTOS[id] : undefined;
}

/** The ${PROOF_SIZE}px "not yet" proof of photoFor(id), or undefined when there is no photograph. */
export function proofFor(id: string): number | undefined {
  return Object.prototype.hasOwnProperty.call(PROOFS, id) ? PROOFS[id] : undefined;
}

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

console.log(`source images      ${candidates.length}  (${mb(candidates.reduce((s, c) => s + c.bytes, 0))})`);
console.log(`prints             ${picks.length} webp @ ${SIZE}px q${QUALITY}  (${mb(printBytes)})`);
console.log(`proofs             ${picks.length} webp @ ${PROOF_SIZE}px q${PROOF_QUALITY}  (${mb(proofBytes)})`);
console.log(`wall at the top    ${wallSummary()}; shipped tint up to ${worst('wallTintWebp')}`);
console.log(`gates              tint left on a wall ${worst('tintLeft')}, drink saturation shift ${worst('drinkShift')}, proof tint ${worst('proofTintWebp')}`);
console.log(`flagged            ${flagSummary()}${QA_DIR ? `  → ${path.join(QA_DIR, 'flags.json')}` : ''}`);
console.log(`daylight.py        sha256 ${BAKE_SHA}`);
console.log(`duplicates dropped ${duplicatesDropped}`);
if (overridesUsed.length) console.log(`overrides applied  ${overridesUsed.join(', ')}`);
console.log(`cocktail coverage  ${cocktails.filter((c) => covered.has(c.id)).length} / ${cocktails.length}`);
console.log(`took               ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
if (orphans.size) {
  console.log(`\nnot in the dex (${[...orphans.values()].reduce((a, b) => a + b, 0)} images, no entry to attach to):`);
  console.log('  ' + [...orphans.keys()].sort().join(', '));
}
