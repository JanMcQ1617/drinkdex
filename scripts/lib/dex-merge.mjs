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
 */

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

  return { errors, warnings, owner };
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
 */
/**
 * KEY ORDER, for anyone porting an existing script onto this.
 *
 * `{ ...card, dexNumber }` appends dexNumber LAST. If your script projected
 * it mid-object, the straight swap reorders every key in every row: the data
 * is byte-identical and the diff is enormous — 882 insertions and 882
 * deletions on one 441-row category — and it reads in review exactly like
 * corruption.
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
  const out = [...kept, ...added].sort((a, b) => a.dexNumber - b.dexNumber);
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
