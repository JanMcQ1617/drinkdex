/**
 * Brings a month of drink suggestions into the catalogue pipeline.
 *
 *   node scripts/import-submissions.mjs <attachment.json> [--dry]
 *   node scripts/import-submissions.mjs --finish <scripts/cocktaildata/NN-submissions-YYYY-MM.json>
 *
 * On the 1st of each month the database emails Jan the previous month's
 * suggestions (migration 018): a card per drink to read, plus JSON
 * attachments already in the scripts/cocktaildata and scripts/spiritdata
 * entry shape, one per category, with a `_sipply` block on each entry
 * saying who sent it and what is still blank. This script is the two
 * commands either side of Jan's editing.
 *
 * IMPORT (the attachment):
 *   1. Writes the entries as the next numbered source file,
 *      scripts/cocktaildata/<NN>-submissions-<YYYY-MM>.json (or spiritdata),
 *      formatted JSON.stringify(arr, null, 1) like the hand-made files.
 *   2. Cuts every `_sipply` down to { submissionId }. Usernames, notes to
 *      the team and photo paths never enter the repo: the attachment in
 *      Jan's inbox keeps them.
 *   3. Prints what each entry still needs before the merge scripts will
 *      take it, RECOMPUTED here from the fields against the merge scripts'
 *      own rules (plus a cocktail's garnish and a spirit's pairings, which
 *      the merge lets through but nearly every Dex card has) rather than
 *      trusted from the email's list, so it is right after Jan's edits
 *      too: run it again on the written file to check progress (a file
 *      already in the data folder is only checked, never copied).
 *
 * Then Jan fills the blanks, deletes the entries he will not add, and runs
 * the merge (node scripts/merge-cocktails.mjs --dry first). The merge
 * scripts need no change: they project fields explicitly, so `_sipply` is
 * ignored, and their gates refuse every blank listed here.
 *
 * FINISH (the source file, after the merge has shipped):
 *   1. Prints one SQL line per remaining entry, marking its suggestion
 *      added with its catalogue id. Pasted into the SQL editor, that is
 *      what tells each person's app to fold their own copy into the Dex
 *      entry (lib/submissions in the app).
 *   2. Removes the `_sipply` keys and rewrites the file the same way.
 *   3. Prints a commented template for the entries Jan dropped.
 */

import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  abvBelowFloor,
  COUNTRY_ALIASES,
  fold,
  ID_ALPHABET,
  originTokens,
} from './lib/dex-merge.mjs';

const DATA_DIR = {
  cocktail: new URL('./cocktaildata/', import.meta.url),
  spirit: new URL('./spiritdata/', import.meta.url),
};
const DIR_LABEL = { cocktail: 'scripts/cocktaildata', spirit: 'scripts/spiritdata' };
const MERGE = { cocktail: 'merge-cocktails.mjs', spirit: 'merge-world-spirits.mjs' };
const DRINKS = new URL('../src/data/drinks.json', import.meta.url);
const RARITIES = new Set(['common', 'uncommon', 'rare', 'legendary']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const finish = args.includes('--finish');
const file = args.find((a) => !a.startsWith('--'));

function usage(message) {
  if (message) console.error(`\n  ${message}`);
  console.error(`
  node scripts/import-submissions.mjs <attachment.json> [--dry]
  node scripts/import-submissions.mjs --finish <scripts/cocktaildata/NN-submissions-YYYY-MM.json>
`);
  process.exit(1);
}

if (!file) usage('Which file? Give the attachment (or, with --finish, the source file).');
if (!existsSync(file)) usage(`No such file: ${file}`);

/** The same layout as every hand-made source file. */
const format = (arr) => JSON.stringify(arr, null, 1) + '\n';

function readEntries(path) {
  let arr;
  try {
    arr = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    usage(`${path} is not JSON: ${e.message}`);
  }
  if (!Array.isArray(arr)) usage(`${path} should hold an array of entries.`);
  arr.forEach((e, i) => {
    if (!e || typeof e !== 'object' || Array.isArray(e)) usage(`Entry ${i + 1} in ${path} is not an object.`);
  });
  return arr;
}

/** Which file an entry belongs in: the email says, and the shape agrees. */
function categoryOf(entry) {
  const said = entry?._sipply?.category;
  if (said === 'cocktail' || said === 'spirit') return said;
  if (entry.recipe) return 'cocktail';
  if (entry.serve || entry.composition) return 'spirit';
  return null;
}

/* ==================================================================== */
/* What each entry still needs                                          */
/*                                                                      */
/* The merge scripts' gates, restated as a checklist: merge-cocktails   */
/* and merge-world-spirits for the shape, scripts/lib/dex-merge for the */
/* collisions, labels, strength floor and id alphabet. Kept in this     */
/* order so the list reads top to bottom like the entry.                */
/* ==================================================================== */

const blank = (v) =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

function outstanding(entry, category, ctx) {
  const todo = [];
  const notes = [];

  // Id: the server slugs the name, which can come out empty (a name in a
  // script with no Latin letters) or as an id the catalogue already uses
  // for a differently named drink. A same-category id would not be refused
  // by the merge: it would silently REPLACE that card.
  //
  // The same name as the card already holding the id is different. On
  // import it is the Dex's own drink suggested again (from an app version
  // without it, say): nothing to add, only an answer to give. When checking
  // a source file whose card in drinks.json carries this entry's own
  // description, it is this entry itself, already merged.
  const taken = !blank(entry.id) ? ctx.byId.get(entry.id) : undefined;
  const sameDrink = taken && !blank(entry.name) && fold(taken.name) === fold(entry.name);
  if (blank(entry.id)) todo.push('id (empty: write a slug of the name)');
  else if (!ID_ALPHABET.test(entry.id)) todo.push(`id "${entry.id}" (lower-case letters, digits and hyphens only)`);
  else {
    if (sameDrink && ctx.checking && taken.description === entry.description) {
      notes.push(`in drinks.json already [${taken.id}]: merged`);
    }
    else if (sameDrink) {
      todo.push(
        `already in the Dex as ${taken.category} "${taken.name}" [${taken.id}]: delete this entry and mark the suggestion duplicate (the template --finish prints)`,
      );
    } else if (taken) todo.push(`id "${entry.id}" is taken by ${taken.category} "${taken.name}": choose another`);
    if (ctx.batchIds.get(entry.id) > 1) todo.push(`id "${entry.id}" appears twice in this file`);
  }

  if (blank(entry.name)) todo.push('name');
  else {
    const clash = ctx.byName.get(fold(entry.name));
    if (clash && !(sameDrink && clash.id === taken.id)) {
      todo.push(`name collides with ${clash.category} "${clash.name}" [${clash.id}]`);
    }
  }

  if (blank(entry.subcategory)) todo.push('subcategory');
  else if (!ctx.styles[category].has(entry.subcategory)) {
    notes.push(`subcategory "${entry.subcategory}" is new to the Dex`);
  }
  if (blank(entry.description)) todo.push('description');

  if (blank(entry.abv)) todo.push('abv');
  else if (abvBelowFloor(entry.abv)) todo.push(`abv "${entry.abv}" is under the 0.5% floor`);
  else if (category === 'cocktail' && !/\d/.test(String(entry.abv))) todo.push(`abv "${entry.abv}" states no strength`);

  if (blank(entry.origin)) todo.push('origin');
  else {
    for (const tok of originTokens(entry.origin)) {
      if (COUNTRY_ALIASES[tok]) todo.push(`origin: the Dex writes "${COUNTRY_ALIASES[tok]}" for "${tok}"`);
    }
  }

  if (!RARITIES.has(entry.rarity)) todo.push('rarity');
  if (!Array.isArray(entry.tastingNotes) || entry.tastingNotes.length < 2) todo.push('tastingNotes (needs 2+)');
  if (blank(entry.glassware)) todo.push('glassware');
  if (blank(entry.funFact)) todo.push('funFact');

  if (category === 'cocktail') {
    if (!Array.isArray(entry.ingredients) || entry.ingredients.length < 1) todo.push('ingredients (needs 1+)');
    const r = entry.recipe;
    if (!r || typeof r !== 'object') todo.push('recipe');
    else {
      const items = Array.isArray(r.ingredients) ? r.ingredients : [];
      if (items.length < 2) todo.push('recipe.ingredients (needs 2+)');
      const noItem = items.filter((i) => blank(i?.item)).length;
      if (noItem) todo.push(`recipe ingredients without an item (${noItem})`);
      const noAmount = items.filter((i) => !blank(i?.item) && blank(i?.amount)).map((i) => i.item);
      if (noAmount.length) todo.push(`recipe amounts (${noAmount.join(', ')})`);
      if (!Array.isArray(r.steps) || r.steps.length < 3) todo.push('recipe.steps (needs 3+)');
      if (blank(r.method)) todo.push('recipe.method');
      // Not a merge gate, but every cocktail in the Dex has one and the card
      // shows it; the email lists it too, so the two lists agree.
      if (blank(r.garnish)) todo.push('recipe.garnish');
    }
    if (entry.serve || entry.composition) todo.push('remove serve/composition (cocktails carry a recipe)');
  } else {
    const s = entry.serve;
    if (!s || typeof s !== 'object') todo.push('serve');
    else {
      if (blank(s.temp)) todo.push('serve.temp');
      if (blank(s.glass)) todo.push('serve.glass');
      if (blank(s.how)) todo.push('serve.how');
      // As the garnish: not gated by the merge, listed by the email.
      if (blank(s.pair)) todo.push('serve.pair');
    }
    const c = entry.composition;
    if (!c || typeof c !== 'object') todo.push('composition');
    else {
      if (blank(c.summary)) todo.push('composition.summary');
      if (!Array.isArray(c.components) || c.components.length < 3) todo.push('composition.components (needs 3+)');
      if (blank(c.process)) todo.push('composition.process');
    }
    if (entry.recipe) todo.push('remove recipe (spirits carry serve and composition)');
  }

  return { todo, notes };
}

function context(entries, checking = false) {
  const drinks = JSON.parse(readFileSync(DRINKS, 'utf8'));
  const byId = new Map(drinks.map((d) => [d.id, d]));
  const byName = new Map(drinks.map((d) => [fold(d.name), d]));
  const styles = { cocktail: new Set(), spirit: new Set() };
  for (const d of drinks) styles[d.category]?.add(d.subcategory);
  const batchIds = new Map();
  for (const e of entries) batchIds.set(e.id, (batchIds.get(e.id) ?? 0) + 1);
  return { byId, byName, styles, batchIds, checking };
}

function report(entries, category, ctx) {
  let clean = 0;
  for (const e of entries) {
    const { todo, notes } = outstanding(e, category, ctx);
    const who = e?._sipply?.submissionId ? `  (${e._sipply.submissionId})` : '';
    console.log(`\n  ${e.id || '(no id)'}  "${e.name ?? ''}"${who}`);
    if (todo.length === 0) {
      clean++;
      console.log('    ready');
    } else {
      for (const t of todo) console.log(`    todo  ${t}`);
    }
    for (const n of notes) console.log(`    note  ${n}`);
  }
  return clean;
}

/* ==================================================================== */
/* --finish                                                             */
/* ==================================================================== */

const sqlText = (s) => `'${String(s).replace(/'/g, "''")}'`;

if (finish) {
  const entries = readEntries(file);
  const drinks = JSON.parse(readFileSync(DRINKS, 'utf8'));
  const inDex = new Set(drinks.map((d) => d.id));

  const lines = [];
  const notYet = [];
  const unmarked = [];
  for (const e of entries) {
    const sid = e?._sipply?.submissionId;
    if (!sid) continue;
    if (!UUID.test(String(sid))) {
      unmarked.push(`${e.id}: submissionId "${sid}" is not a uuid; mark it by hand`);
      continue;
    }
    if (typeof e.id !== 'string' || !ID_ALPHABET.test(e.id)) {
      unmarked.push(`${e.id}: not a catalogue id yet; fix it and run --finish again`);
      continue;
    }
    if (!inDex.has(e.id)) notYet.push(e.id);
    lines.push(
      `update public.drink_submissions set status = 'added', catalogue_id = ${sqlText(e.id)}, reviewed_at = now() where id = ${sqlText(sid)};`,
    );
  }

  if (unmarked.length) {
    console.error(`\n  Not finished, nothing rewritten:\n`);
    for (const u of unmarked) console.error(`    ${u}`);
    process.exit(1);
  }

  if (notYet.length) {
    console.warn(`\n  warn  not in src/data/drinks.json yet: ${notYet.join(', ')}`);
    console.warn(`  warn  run the merge (and ship it) first, or those people see "in the next update" until you do.`);
  }

  console.log('\n-- Paste into the Supabase SQL editor: the suggestions added to the Dex.');
  if (lines.length) for (const l of lines) console.log(l);
  else console.log('-- (no entries in this file carry a submissionId: already finished?)');
  console.log(`
-- For the suggestions you did not add (their ids are in the email):
-- update public.drink_submissions set status = 'declined', reviewed_at = now() where id = '<submissionId>';
-- update public.drink_submissions set status = 'duplicate', catalogue_id = '<existing id>', reviewed_at = now() where id = '<submissionId>';`);

  const stripped = entries.map((e) => {
    if (!Object.prototype.hasOwnProperty.call(e, '_sipply')) return e;
    const { _sipply, ...rest } = e;
    void _sipply;
    return rest;
  });
  if (dry) {
    console.log(`\n  dry run: ${file} left as it is`);
  } else {
    writeFileSync(file, format(stripped));
    console.log(`\n  Removed _sipply from ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} in ${file}.`);
  }
  process.exit(0);
}

/* ==================================================================== */
/* Import                                                               */
/* ==================================================================== */

const entries = readEntries(file);
if (entries.length === 0) {
  console.log('  The attachment is empty: nothing to import.');
  process.exit(0);
}

const byCategory = { cocktail: [], spirit: [] };
for (const [i, e] of entries.entries()) {
  const category = categoryOf(e);
  if (!category) usage(`Entry ${i + 1} (${e.id ?? e.name ?? 'unnamed'}) is neither a cocktail nor a spirit.`);
  byCategory[category].push(e);
}

/*
 * The month the file is named after: from the attachment's own name
 * (sipply-cocktails-2026-09.json), else from the entries — each belongs to
 * the month of its last change in Puerto Rico time (UTC-4, no daylight
 * saving), the same rule the email uses — else this month.
 */
function monthTag() {
  const named = basename(file).match(/(\d{4}-\d{2})/);
  if (named) return named[1];
  const stamps = entries
    .map((e) => Date.parse(e?._sipply?.updatedAt ?? e?._sipply?.submittedAt ?? ''))
    .filter(Number.isFinite);
  const when = stamps.length ? new Date(Math.max(...stamps) - 4 * 3600 * 1000) : new Date();
  return when.toISOString().slice(0, 7);
}
const tag = monthTag();

/*
 * The next number in the folder: the highest numeric prefix plus one, so
 * spiritdata, which has a 99-fortified.json, goes on from 100. The merge
 * reads files in plain string order, where 100- sorts between 10- and
 * 11-, not after 99-. That is harmless: a drink already in drinks.json
 * keeps its dex number whatever file it is in, and the order only decides
 * the numbers new entries take among themselves.
 */
function nextPrefix(dir) {
  const highest = Math.max(
    0,
    ...readdirSync(dir)
      .map((f) => f.match(/^(\d+)-/))
      .filter(Boolean)
      .map((m) => Number(m[1])),
  );
  return String(highest + 1).padStart(2, '0');
}

/** Only the submission id stays: who sent it, their note and their photo path stay in Jan's inbox. */
function forRepo(e) {
  if (!Object.prototype.hasOwnProperty.call(e, '_sipply')) return e;
  const { _sipply, ...rest } = e;
  return _sipply?.submissionId ? { ...rest, _sipply: { submissionId: _sipply.submissionId } } : rest;
}

/** True when `file` is itself a source file in this category's folder: check it, do not import it. */
const inputDir = dirname(realpathSync(file));
const isSourceFile = (category) => inputDir === realpathSync(fileURLToPath(DATA_DIR[category]));

let refused = false;
for (const category of ['cocktail', 'spirit']) {
  const list = byCategory[category];
  if (list.length === 0) continue;
  const dir = DATA_DIR[category];

  if (isSourceFile(category)) {
    console.log(`\nChecking ${DIR_LABEL[category]}/${basename(file)} (${list.length} ${category}${list.length === 1 ? '' : 's'})`);
    const clean = report(list, category, context(list, true));
    console.log(`\n  ${clean} of ${list.length} ready. When all are: node scripts/${MERGE[category]} --dry`);
    continue;
  }

  const already = readdirSync(dir).find((f) => f.endsWith(`-submissions-${tag}.json`));
  if (already) {
    console.error(`\n  ${DIR_LABEL[category]}/${already} already holds the ${category} suggestions for ${tag}.`);
    console.error('  Importing again would put every entry in the Dex twice. Delete that file first if you mean to start over.');
    refused = true;
    continue;
  }

  const name = `${nextPrefix(dir)}-submissions-${tag}.json`;
  const out = list.map(forRepo);
  const ctx = context(out);

  console.log(`\n${dry ? 'Would write' : 'Wrote'} ${DIR_LABEL[category]}/${name} (${out.length} ${category}${out.length === 1 ? '' : 's'})`);
  const clean = report(out, category, ctx);
  if (!dry) writeFileSync(new URL(name, dir), format(out));

  console.log(
    `\n  ${clean} of ${out.length} ready. Next: fill the blanks, delete entries you won't add, then:` +
      `\n    node scripts/${MERGE[category]} --dry` +
      `\n  and once it is merged and shipped:` +
      `\n    node scripts/import-submissions.mjs --finish ${DIR_LABEL[category]}/${name}`,
  );
}

process.exit(refused ? 1 : 0);
