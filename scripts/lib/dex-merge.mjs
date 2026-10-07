/**
 * Shared validation and merge machinery for every script that writes
 * src/data/drinks.json.
 *
 * WHY THIS EXISTS. Eight merge scripts each grew their own copy of the same
 * five checks. That is not just duplication — it is the reason the same bugs
 * kept recurring. A guard living in one script only fires when THAT script
 * runs, so a bad country label entering through the wine merge sailed past a
 * check sitting in the spirits merge. The label bug was fixed three separate
 * times in three separate places before anyone noticed it was one bug.
 *
 * So the rule here is: the check fires wherever the bad data enters, not
 * where someone happened to write it.
 *
 * WHAT IS AN ERROR AND WHAT IS A WARNING. A script is responsible for the
 * rows it writes and merely a bystander to everyone else's. Problems in your
 * own rows are hard errors and stop the write; problems in rows you inherited
 * are warnings, because refusing to run over someone else's pre-existing data
 * would wedge every script until an unrelated session fixed something. Both
 * are reported. Neither is silent.
 *
 * THE TRAP THIS MODULE MUST NEVER HELP YOU FALL INTO. `dexCountry()`
 * normalises a country name for DISPLAY. Several generators build card ids
 * from the raw country name. Apply this to the variable rather than to the
 * output field and 242 wine ids silently change from `-unitedstates-wn` to
 * `-usa-wn`, orphaning every collection record that points at them — and
 * because the new ids are unique too, no collision check catches it. It looks
 * like a clean run. Normalise the OUTPUT FIELD. Never the source variable.
 *
 * ORIGIN STORIES. `originStory` is not projected by any generator: it is
 * written in scripts/origindata/ and attached here, by merge() and by
 * merge-origin-stories.mjs, so a script that rebuilds whole rows from its own
 * source files cannot drop it. See attachOriginStories.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';

/* ------------------------------------------------------------------ */
/* Keys                                                                */
/* ------------------------------------------------------------------ */

/**
 * Accent-insensitive comparison key.
 *
 * NFD splits a letter from its combining accent so the accent can be
 * stripped; the explicit map handles the standalone letters NFD leaves
 * alone, because æ, ø and ł are letters in their own right rather than
 * accented forms of anything.
 */
const TRANSLIT = { æ: 'ae', ø: 'o', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ß: 'ss', œ: 'oe' };

export function fold(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[æøłđðþßœ]/g, (c) => TRANSLIT[c] ?? c)
    .replace(/[^a-z0-9]/g, '');
}

/**
 * The country token of an origin string.
 *
 * ALWAYS the last comma-separated segment, never the bare string. Both times
 * a bad label survived a sweep it was qualified — "Canada / United States"
 * and "New Orleans, United States" — and an equality test on the whole
 * origin reported clean.
 */
export function originCountry(origin) {
  return String(origin ?? '').split(',').pop().trim();
}

/**
 * EVERY country-ish token in an origin, not just the last one.
 *
 * A last-comma-segment rule is necessary and not sufficient. "New Orleans,
 * United States" needs the comma split; "Canada / United States" has no comma
 * at all and the whole string comes back unmatched. Both are real strings that
 * survived a real sweep. Split on commas AND slashes and check all of it —
 * caught by this module's own smoke test, which is the argument for writing
 * the test before trusting the rule.
 */
export function originTokens(origin) {
  return String(origin ?? '')
    .split(/[,/]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Country labels                                                      */
/* ------------------------------------------------------------------ */

/**
 * Atlas spelling -> the spelling the Dex `origin` field uses.
 *
 * Direction matters: an alias is only safe pointing from the MINORITY form
 * to the majority one. Czechia is here because the Dex already writes
 * "Czechia" 81 times against "Czech Republic" twice — aliasing the other way
 * would have flipped 81 correct rows to match 2 wrong ones.
 */
export const COUNTRY_ALIASES = Object.freeze({
  'United States': 'USA',
  'Türkiye': 'Turkey',
  'Czech Republic': 'Czechia',
  'Antigua & Barbuda': 'Antigua and Barbuda',
  'Bosnia & Herzegovina': 'Bosnia and Herzegovina',
  'Trinidad & Tobago': 'Trinidad and Tobago',
});

/** Normalise a country name for an output field. NEVER for an id. */
export const dexCountry = (name) => COUNTRY_ALIASES[name] ?? name;

/* ------------------------------------------------------------------ */
/* Strength                                                            */
/* ------------------------------------------------------------------ */

/**
 * The floor an entry must clear to be a drink this app catalogues.
 *
 * 0.5% is where most jurisdictions draw "alcohol-free", so it is the line
 * with an argument behind it rather than a preference.
 */
export const ABV_FLOOR = 0.5;

/** States the strength is UNDOCUMENTED — which is not the same as absent. */
const ABV_UNDOCUMENTED = /not published|varies/i;

/** States the alcohol is ABSENT, in words rather than a number. */
const ABV_ABSENT = /alcohol[-\s]?free|non[-\s]?alcoholic|de[-\s]?alcoholi[sz]/i;

/**
 * True only when the row can be PROVEN to sit below the floor.
 *
 * The asymmetry is deliberate. A false positive here deletes a real drink, so
 * anything this cannot prove, it lets through.
 *
 * Be honest about what that buys: this is a backstop, not a net. It is SILENT
 * on everything it cannot prove — "Varies by producer" sails through by
 * design, and so would a 0% entry whose abv field was left blank. It stops the
 * unarguable cases and nothing else. The 174 beer cards reading "Not
 * published" depend on exactly that looseness, which is the trade, but do not
 * mistake a passing merge for a checked one.
 *
 * Three things it must never confuse:
 *
 *  - "Not published" (174 beer cards) and "Varies by producer" (one wine card)
 *    say the strength is unknown, not zero. A first cut that required a
 *    parseable number would have condemned every one of them.
 *
 *  - The number taken is the FIRST in the string, because a range is written
 *    low end first. "0-8%" is a drink you can pour at zero and is rejected;
 *    "0.5-1.5%" clears. Taking the minimum of every number instead would read
 *    the 0.33 in "5% (0.33 L)" as the strength and throw out a real beer.
 *
 *  - A leading "<" inverts the comparison: "<0.5%" is BELOW 0.5 and must be
 *    rejected, where a bare "0.5%" clears.
 */
export function abvBelowFloor(abv) {
  const s = String(abv ?? '');
  if (ABV_UNDOCUMENTED.test(s)) return false;
  if (ABV_ABSENT.test(s)) return true;
  const m = s.match(/\d+(?:\.\d+)?/);
  if (!m) return false;
  const n = Number(m[0]);
  return /^\s*[<\u2264]/.test(s) ? n <= ABV_FLOOR : n < ABV_FLOOR;
}

/* ------------------------------------------------------------------ */
/* Checks                                                              */
/* ------------------------------------------------------------------ */

/** What a catalogue id may contain. Drinks added in the app use `u_`, outside it (check 7). */
export const ID_ALPHABET = /^[a-z0-9-]+$/;

/**
 * Every check runs over both the rows being written and the rows already
 * present, so a problem is caught wherever it entered.
 *
 * @param {object[]} drinks    drinks.json as read, before any change
 * @param {object[]} incoming  the cards this script is about to write
 * @param {string}   category  the category this script owns
 * @param {string}   owner     script name, for messages
 */
export function validate({ drinks, incoming, category, owner }) {
  const errors = [];
  const warnings = [];
  const priorById = new Map(drinks.map((d) => [d.id, d]));

  /* 1. Cross-category id collision.
   *
   * The obvious merge — drop every incoming id from `drinks`, re-add the new
   * rows — silently converts a same-id entry from another category. No error,
   * no missing row, one category just quietly one lighter. That is how a Pink
   * Gin cocktail became a spirit. An incoming id may only ever displace an
   * entry of its own category. */
  for (const c of incoming) {
    const prior = priorById.get(c.id);
    if (prior && prior.category !== category) {
      errors.push(`${c.id}: would overwrite ${prior.category} "${prior.name}"`);
    }
  }

  /* 2. Duplicate ids within the import itself. */
  const seenId = new Set();
  for (const c of incoming) {
    if (seenId.has(c.id)) errors.push(`${c.id}: duplicate id within this import`);
    seenId.add(c.id);
  }

  /* 3. Name collisions, accent-insensitive, so "Cachaca" cannot slip past
   * "Cachaça" and give the Dex two cards that read identically. */
  const nameOwner = new Map();
  for (const d of drinks) {
    if (seenId.has(d.id)) continue; // being replaced by this import
    nameOwner.set(fold(d.name), d);
  }
  for (const c of incoming) {
    const k = fold(c.name);
    const clash = nameOwner.get(k);
    if (clash) errors.push(`"${c.name}": display name collides with ${clash.category} "${clash.name}" [${clash.id}]`);
    nameOwner.set(k, c);
  }

  /* 4. Country-label convention, on the last comma-segment. Errors for rows
   * this script writes; warnings for rows it inherited, which belong to
   * whoever wrote them. */
  const checkLabel = (row, isOurs) => {
    for (const tok of originTokens(row.origin)) {
      if (COUNTRY_ALIASES[tok]) {
        const msg = `${row.id}: origin "${row.origin}" contains "${tok}" — the Dex writes "${COUNTRY_ALIASES[tok]}"`;
        (isOurs ? errors : warnings).push(msg);
      }
    }
  };
  for (const c of incoming) checkLabel(c, true);
  for (const d of drinks) if (!seenId.has(d.id)) checkLabel(d, false);

  /* 5. Required shape. A card missing serve/composition renders an empty
   * panel rather than failing loudly, so catch it here. Cocktails carry a
   * recipe instead — that is the documented split, not an omission. */
  const REQUIRED = ['id', 'name', 'category', 'subcategory', 'description', 'abv',
    'origin', 'rarity', 'tastingNotes', 'glassware', 'funFact'];
  for (const c of incoming) {
    for (const f of REQUIRED) {
      if (c[f] == null) errors.push(`${c.id}: missing ${f}`);
    }
    if (c.category === 'cocktail') {
      if (!c.recipe) errors.push(`${c.id}: cocktails must carry a recipe`);
    } else {
      if (!c.serve?.how) errors.push(`${c.id}: missing serve.how`);
      if (!c.composition?.components?.length) errors.push(`${c.id}: missing composition.components`);
      if (c.recipe) errors.push(`${c.id}: only cocktails carry a recipe`);
    }
  }

  /* 6. Alcohol-free rows.
   *
   * Sipply is an alcohol app. 78 alcohol-free entries reached the Dex before
   * anyone checked, because every merge trusted its own source file and no
   * layer asked the question. This is that layer.
   *
   * See abvBelowFloor: it rejects only what it can prove, so an undocumented
   * strength survives and a stated absence does not. Whether a specific
   * borderline drink belongs is an editorial call and stays one — this only
   * stops the unarguable cases.
   */
  for (const c of incoming) {
    if (abvBelowFloor(c.abv)) {
      errors.push(`${c.id}: abv "${c.abv}" does not clear the ${ABV_FLOOR}% floor — this app catalogues alcohol`);
    }
  }
  for (const d of drinks) {
    if (!seenId.has(d.id) && abvBelowFloor(d.abv)) {
      warnings.push(`${d.id}: abv "${d.abv}" does not clear the ${ABV_FLOOR}% floor`);
    }
  }

  /* 7. Id alphabet.
   *
   * Catalogue ids are lower-case letters, digits and hyphens, and the app
   * relies on it: a drink someone adds in the app gets the id `u_<uuid>`,
   * and the underscore is what keeps the two kinds apart. getDrink() stays
   * catalogue-only because no catalogue id can ever start with `u_`, and
   * every count in the app (the Dex progress, Stats, ranks) is honest
   * about added drinks only because of that. Today it holds because every
   * generator slugs its ids; this makes it a rule rather than a habit,
   * which matters most for scripts/import-submissions.mjs, whose ids come
   * from what people typed and then from Jan's hand edits.
   *
   * Errors for rows this script writes, warnings for rows it inherited,
   * as with the labels in check 4. */
  for (const c of incoming) {
    if (typeof c.id !== 'string' || !ID_ALPHABET.test(c.id)) {
      errors.push(`${c.id}: id must be lower-case letters, digits and hyphens (drinks added in the app use u_<uuid>)`);
    }
  }
  for (const d of drinks) {
    if (!seenId.has(d.id) && (typeof d.id !== 'string' || !ID_ALPHABET.test(d.id))) {
      warnings.push(`${d.id}: id is outside the catalogue alphabet [a-z0-9-]`);
    }
  }

  return { errors, warnings, owner };
}

/* ------------------------------------------------------------------ */
/* Origin stories                                                      */
/* ------------------------------------------------------------------ */

/* Resolved from this module, never the working directory, so a merge run
 * from anywhere finds the same files. */
const ORIGIN_DIR = new URL('../origindata/', import.meta.url);

/* Only the writers' story files. A sidecar `batch-NN.flags.json` holds
 * notes for Jan and is never read. */
const ORIGIN_FILE = /^batch-\d{2}\.json$/;

/* 60, not the writers' original 300: a drink with no documented origin
 * gets one honest sentence ("has no documented inventor or date"), and
 * padding it to length would mean inventing history. */
export const STORY_MIN = 60;
export const STORY_MAX = 800;

/* The band renders plain text: any of these would show up literally. */
const STORY_FORBIDDEN = [
  [/[\n\r]/, 'a line break'],
  [/</, 'a "<" (markup)'],
  [/\]\(/, 'a markdown link'],
  [/http|www\./i, 'a URL'],
  [/\p{Extended_Pictographic}/u, 'an emoji or pictograph'],
];

/* The same year drinkLabels.ts's datelineOf reads (decades included). */
const STORY_YEAR = /\b(1[5-9]\d\d|20[0-2]\d)s?\b/;

/**
 * Reads scripts/origindata/batch-NN.json (only files matching
 * /^batch-\d{2}\.json$/, in name order) and returns the rows with
 * `originStory` as the LAST key of every row that has a valid story, and
 * removed from every row that does not (never an empty string), so two runs,
 * from any script, write the same bytes. Rows are copied, never mutated.
 *
 * strict (merge-origin-stories.mjs): a problem in the story files is an
 * error, and the caller writes nothing. Otherwise (merge(), on behalf of the
 * cocktail and spirit merges) it is a warning and only valid stories are
 * attached: those scripts are bystanders to the stories and must not stop
 * on them.
 *
 * Two checks the spec once listed are deliberately absent from `warnings`:
 *  - the batch range. Files were refilled out of order (batch-15 holds
 *    #501-600, batch-06 #751-900), so a dexNumber outside NN's nominal
 *    hundred is normal, not misfiled. The id-in-two-files check is what
 *    catches a real filing mistake.
 *  - a story with no year. Two drinks in five have no documented origin
 *    date, so it is the expected case; as a warning it would fill the
 *    20-line cap on every merge and bury the warning that needs action.
 *    It is counted in `report.noYear` instead, for the runner to print.
 *
 * No directory (or no batch file in it) outside strict mode: the rows come
 * back unchanged, with nothing to report.
 *
 * @returns {{ out: object[], errors: string[], warnings: string[], report: null | {
 *   files: { file: string, entries: number, attached: number, lo: number, hi: number }[],
 *   attached: number, total: number, missing: string[], noYear: string[] } }}
 */
export function attachOriginStories(rows, { strict = false } = {}) {
  const errors = [];
  const warnings = [];
  const problem = (msg) => (strict ? errors : warnings).push(msg);

  const files = existsSync(ORIGIN_DIR)
    ? readdirSync(ORIGIN_DIR).filter((f) => ORIGIN_FILE.test(f)).sort()
    : [];
  if (!files.length) {
    if (strict) errors.push('no scripts/origindata/batch-NN.json files to merge');
    return { out: rows, errors, warnings, report: null };
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const stories = new Map(); // id -> trimmed story
  const fileOf = new Map(); // id -> the file it was first read from
  const perFile = [];

  for (const file of files) {
    const stat = { file, entries: 0, attached: 0, lo: Infinity, hi: -Infinity };
    perFile.push(stat);
    let data;
    try {
      data = JSON.parse(readFileSync(new URL(file, ORIGIN_DIR), 'utf8'));
    } catch (e) {
      problem(`${file}: does not parse (${e.message}) — none of its stories attached`);
      continue;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      problem(`${file}: must be one object of id -> story — none of its stories attached`);
      continue;
    }

    for (const [id, value] of Object.entries(data)) {
      stat.entries++;
      const where = `${file} ${id}`;
      const row = byId.get(id);
      if (!row) {
        // Usually a drink remove-drinks.mjs or prune-nonalcoholic.mjs took out:
        // delete its entry from the batch file.
        problem(`${where}: no drink has this id`);
        continue;
      }
      if (fileOf.has(id)) {
        // First file in name order keeps the id, so the outcome never
        // depends on the order readdir returned.
        problem(`${where}: already written in ${fileOf.get(id)}`);
        continue;
      }
      // Claimed before the story is checked, so a second copy is reported in
      // the same run even when the first copy is invalid too.
      fileOf.set(id, file);
      if (typeof value !== 'string') { problem(`${where}: story is not a string`); continue; }
      const story = value.trim();
      if (story.length < STORY_MIN || story.length > STORY_MAX) {
        problem(`${where}: ${story.length} characters, outside ${STORY_MIN} to ${STORY_MAX}`);
        continue;
      }
      const bad = STORY_FORBIDDEN.find(([re]) => re.test(story));
      if (bad) { problem(`${where}: contains ${bad[1]}`); continue; }

      stories.set(id, story);
      stat.attached++;
      stat.lo = Math.min(stat.lo, row.dexNumber);
      stat.hi = Math.max(stat.hi, row.dexNumber);
    }
  }

  // delete-then-set moves the key to the end, wherever a hand edit or an
  // older run left it, so every writer serialises the row the same way.
  const out = rows.map((row) => {
    const next = { ...row };
    delete next.originStory;
    const story = stories.get(row.id);
    if (story) next.originStory = story;
    return next;
  });

  const missing = rows.filter((r) => !stories.has(r.id)).map((r) => r.id);
  const noYear = rows.filter((r) => stories.has(r.id) && !STORY_YEAR.test(stories.get(r.id))).map((r) => r.id);

  return {
    out,
    errors,
    warnings,
    report: { files: perFile, attached: stories.size, total: rows.length, missing, noYear },
  };
}

/* ------------------------------------------------------------------ */
/* Merge                                                               */
/* ------------------------------------------------------------------ */

/**
 * Read-and-merge with sticky dex numbers.
 *
 * Never rebuilds drinks.json: several sessions write it, and a rebuild
 * discards whatever landed since this script last read the file. Numbers are
 * reused by id so a re-run is a true no-op rather than renumbering the Dex.
 *
 * `out` also carries the origin stories (attachOriginStories). The scripts
 * project their rows without `originStory`, so without this every cocktail
 * or spirit merge would strip the stories off the rows it rebuilds. The merge
 * scripts gate (reportAndGate) before calling this, so story problems are
 * printed here as warnings and never stop the write; `added` stays the
 * script's own cards, without stories.
 */
/**
 * KEY ORDER, for anyone porting an existing script onto this.
 *
 * `{ ...card, dexNumber }` appends dexNumber after every projected field (an
 * origin story, when there is one, is attached after it). If your script
 * projected it mid-object, the straight swap reorders every key in every
 * row: the data is byte-identical and the diff is enormous — 882 insertions
 * and 882 deletions on one 441-row category — and it reads in review exactly
 * like corruption.
 *
 * Carry a `dexNumber: 0` placeholder at the position you want in your
 * projection. A spread preserves the position of a key that already exists,
 * so the assignment below changes only the value and the diff stays empty.
 */
export function merge({ drinks, incoming }) {
  const incomingIds = new Set(incoming.map((c) => c.id));
  const kept = drinks.filter((d) => !incomingIds.has(d.id));
  const existingDex = new Map(drinks.map((d) => [d.id, d.dexNumber]));
  let next = Math.max(0, ...drinks.map((d) => d.dexNumber)) + 1;

  const added = incoming.map((c) => ({ ...c, dexNumber: existingDex.get(c.id) ?? next++ }));
  const merged = [...kept, ...added].sort((a, b) => a.dexNumber - b.dexNumber);
  const { out, warnings } = attachOriginStories(merged);
  for (const w of warnings.slice(0, 20)) console.warn(`  warn  origin story: ${w}`);
  if (warnings.length > 20) console.warn(`  warn  …and ${warnings.length - 20} more origin-story warnings (run merge-origin-stories.mjs)`);
  const fresh = added.filter((c) => !existingDex.has(c.id)).length;
  return { out, added, fresh, refreshed: added.length - fresh };
}

/**
 * Belt to the collision guard's braces: prove nothing was reclassified or
 * dropped, by comparing every pre-existing id's category before and after.
 *
 * The collision guard checks intent; this checks outcome. They catch the same
 * class of bug from opposite ends, and the cost of both is a few milliseconds.
 */
export function assertShapePreserved({ before, after, category }) {
  const problems = [];
  const afterById = new Map(after.map((d) => [d.id, d]));
  for (const d of before) {
    const now = afterById.get(d.id);
    if (!now) { problems.push(`${d.id} (${d.category} "${d.name}") was DROPPED`); continue; }
    if (now.category !== d.category) {
      problems.push(`${d.id} was RECLASSIFIED ${d.category} -> ${now.category}`);
    }
  }
  const count = (rows) => rows.reduce((a, d) => ((a[d.category] = (a[d.category] ?? 0) + 1), a), {});
  const b = count(before);
  const a = count(after);
  for (const cat of Object.keys(b)) {
    if (cat !== category && b[cat] !== a[cat]) {
      problems.push(`${cat} count moved ${b[cat]} -> ${a[cat]} but this script owns ${category}`);
    }
  }
  return problems;
}

/**
 * Print, then stop on anything that is ours.
 *
 * A gate, not a warning. A warning nobody reads is how the same bug recurred
 * three times — 1,457 cards once shipped silently unlinked because the script
 * printed a count and carried on.
 */
export function reportAndGate({ errors, warnings, owner }) {
  for (const w of warnings.slice(0, 20)) console.warn(`  warn  ${w}`);
  if (warnings.length > 20) console.warn(`  warn  …and ${warnings.length - 20} more (not this script's rows)`);
  if (!errors.length) return;
  console.error(`\n${owner}: ${errors.length} problem(s) — nothing written:\n`);
  for (const e of errors.slice(0, 40)) console.error('  ' + e);
  if (errors.length > 40) console.error(`  …and ${errors.length - 40} more`);
  process.exit(1);
}
