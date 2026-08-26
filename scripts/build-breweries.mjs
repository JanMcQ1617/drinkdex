#!/usr/bin/env node
/**
 * Builds src/data/breweries.json — the brand layer.
 *
 * The Dex catalogues beer STYLES ("American IPA", "Gose"). Nobody drinks a
 * style, though; they drink Ocean IPA. This file is the other axis: real
 * products, grouped by the brewery that makes them and the country it stands
 * in. A brand carries identity — name, brewery, city; its STYLE carries the
 * depth, because `styleRef` points at the matching entry in drinks.json and
 * that entry already has the serve guide, glassware and composition written.
 * So a brand is never a thin dex entry: it inherits one.
 *
 * Two sources, in precedence order:
 *
 *   1. scripts/beerdata/<country>.json — hand-researched lineups, verified
 *      against the brewery's own site. These win, always. A country present
 *      here is fully populated at product level.
 *   2. scripts/beerdata/atlas.json — the 1,865-entry world survey. Roughly
 *      40% of it is already product-level ("Sierra Nevada Torpedo"); the rest
 *      names only the brewery, and those become a brewery with its flagship
 *      until someone researches the full lineup.
 *
 * Run: node scripts/build-breweries.mjs
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scripts', 'beerdata');
const OUT = join(ROOT, 'src', 'data', 'breweries.json');

/* ------------------------------------------------------------------ */
/* Style resolution                                                     */
/*                                                                      */
/* The atlas writes styles the way a drinker says them ("pils", "hazy   */
/* IPA", "trappist quad"). drinks.json ids them the way a judge does    */
/* ("german-pilsner", "new-england-ipa", "belgian-quadrupel"). This     */
/* table is the join. Order matters — longest, most specific first, so  */
/* "imperial stout" never resolves as plain "stout".                    */
/* ------------------------------------------------------------------ */

const STYLE_ALIASES = [
  // Non-alcoholic must outrank 'lager' — Malta India is a malta, not a beer.
  ['non-alcoholic', 'non-alcoholic-lager'],
  ['malt beverage', 'non-alcoholic-lager'],
  ['trappist quadrupel', 'belgian-quadrupel'],
  ['trappist quad', 'belgian-quadrupel'],
  ['belgian strong', 'belgian-golden-strong-ale'],
  ['strong golden ale', 'belgian-golden-strong-ale'],
  ['imperial coffee stout', 'imperial-stout'],
  ['bourbon barrel stout', 'barrel-aged-imperial-stout'],
  ['barrel-aged stout', 'barrel-aged-imperial-stout'],
  ['imperial stout', 'imperial-stout'],
  ['tropical stout', 'foreign-extra-stout'],
  ['export stout', 'foreign-extra-stout'],
  ['oatmeal stout', 'oatmeal-stout'],
  ['milk stout', 'milk-stout'],
  ['dry stout', 'irish-dry-stout'],
  ['baltic porter', 'baltic-porter'],
  ['coffee porter', 'american-porter'],
  ['smoked porter', 'smoked-porter'],
  ['session ipa', 'session-ipa'],
  ['west coast ipa', 'west-coast-ipa'],
  ['double ipa', 'double-ipa'],
  ['triple ipa', 'triple-ipa'],
  ['imperial ipa', 'double-ipa'],
  ['belgian ipa', 'belgian-ipa'],
  ['black ipa', 'black-ipa'],
  ['hazy ipa', 'new-england-ipa'],
  ['sour ipa', 'kettle-sour'],
  ['english ipa', 'english-ipa'],
  ['india pale ale', 'american-ipa'],
  ['extra ipa', 'double-ipa'],
  ['ipa', 'american-ipa'],
  ['vienna lager', 'vienna-lager'],
  ['dark lager', 'munich-dunkel'],
  ['amber lager', 'american-amber-lager'],
  ['light lager', 'american-light-lager'],
  ['strong lager', 'malt-liquor'],
  ['rice lager', 'japanese-rice-lager'],
  ['mexican lager', 'mexican-lager'],
  ['pale lager', 'american-lager'],
  ['czech lager', 'czech-pilsner'],
  ['munich helles', 'munich-helles'],
  ['helles', 'munich-helles'],
  ['dortmunder export', 'dortmunder-export'],
  ['italian pilsner', 'italian-pilsner'],
  ['czech pilsner', 'czech-pilsner'],
  ['dry pils', 'german-pilsner'],
  ['pilsner', 'german-pilsner'],
  ['pils', 'german-pilsner'],
  ['lager', 'american-lager'],
  ['flanders red', 'flanders-red-ale'],
  ['oud bruin', 'oud-bruin'],
  ['fruit lambic', 'framboise'],
  ['gueuze', 'gueuze'],
  ['lambic', 'lambic'],
  ['kettle sour', 'kettle-sour'],
  ['berliner weisse', 'berliner-weisse'],
  ['gose', 'gose'],
  ['wild ale', 'american-wild-ale'],
  ['sour', 'kettle-sour'],
  ['kriek', 'kriek'],
  ['weissbier', 'hefeweizen'],
  ['hefeweizen', 'hefeweizen'],
  ['dunkelweizen', 'dunkelweizen'],
  ['weizenbock', 'weizenbock'],
  ['witbier', 'witbier'],
  ['belgian white', 'witbier'],
  ['wheat ale', 'american-wheat-beer'],
  ['american wheat', 'american-wheat-beer'],
  ['wheat', 'american-wheat-beer'],
  ['doppelbock', 'doppelbock'],
  ['eisbock', 'eisbock'],
  ['maibock', 'maibock'],
  ['bock', 'bock'],
  ['märzen', 'marzen'],
  ['marzen', 'marzen'],
  ['oktoberfest', 'marzen'],
  ['festbier', 'festbier'],
  ['schwarzbier', 'schwarzbier'],
  ['kellerbier', 'kellerbier'],
  ['rauchbier', 'rauchbier'],
  ['smoked', 'rauchbier'],
  ['zoigl', 'zoigl'],
  ['grodziskie', 'grodziskie'],
  ['altbier', 'altbier'],
  ['alt', 'altbier'],
  ['kölsch', 'kolsch'],
  ['kolsch', 'kolsch'],
  ['cream ale', 'cream-ale'],
  ['california common', 'california-common'],
  ['steam', 'california-common'],
  ['barley wine', 'american-barleywine'],
  ['barleywine', 'american-barleywine'],
  ['old ale', 'old-ale'],
  ['scotch ale', 'wee-heavy'],
  ['wee heavy', 'wee-heavy'],
  ['scottish ale', 'scottish-ale'],
  ['irish red', 'irish-red-ale'],
  ['amber ale', 'american-amber-ale'],
  ['red ale', 'american-amber-ale'],
  ['brown ale', 'english-brown-ale'],
  ['brown', 'english-brown-ale'],
  ['dark mild', 'dark-mild'],
  ['extra special bitter', 'extra-special-bitter'],
  ['bitter', 'english-bitter'],
  ['best bitter', 'english-bitter'],
  ['english pale', 'english-pale-ale'],
  ['pale ale', 'american-pale-ale'],
  ['blonde ale', 'blonde-ale'],
  ['blonde', 'blonde-ale'],
  ['golden ale', 'blonde-ale'],
  ['saison', 'saison'],
  ['farmhouse', 'saison'],
  ['bière de garde', 'biere-de-garde'],
  ['biere de garde', 'biere-de-garde'],
  ['abbey', 'belgian-dubbel'],
  ['dubbel', 'belgian-dubbel'],
  ['tripel', 'belgian-tripel'],
  ['quadrupel', 'belgian-quadrupel'],
  ['trappist', 'belgian-tripel'],
  ['dark strong', 'belgian-quadrupel'],
  ['radler', 'radler'],
  ['malt liquor', 'malt-liquor'],
  // Sorghum/opaque beers have no Dex style — leave them unlinked rather
  // than pointing at 'specialty', which is a subcategory and not an id.
  ['porter', 'english-porter'],
  ['stout', 'irish-dry-stout'],
  ['ale', 'blonde-ale'],
];

/** Dex style name (lowercased) -> Drink.id, e.g. "american porter" -> american-porter. */
const DEX_STYLES = new Map(
  JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'drinks.json'), 'utf8'))
    .filter((d) => d.category === 'beer')
    .map((d) => [d.name.toLowerCase(), d.id])
);

function resolveStyle(text) {
  if (!text) return null;
  const t = text.toLowerCase().trim();

  /* Exact Dex style name wins. Without this, "American Porter" falls into the
   * alias table, hits the generic 'porter' rule and resolves to English
   * Porter — a real style, just the wrong one. */
  const exact = DEX_STYLES.get(t);
  if (exact) return exact;

  for (const [needle, id] of STYLE_ALIASES) if (t.includes(needle)) return id;
  return null;
}

/* ------------------------------------------------------------------ */
/* Explicit repoints                                                    */
/*                                                                      */
/* Keyed by the generated brand id, NOT by a substring of the style     */
/* text. These brands describe themselves in prose ("traditional        */
/* juniper farmhouse ale") rather than by style name, so neither exact  */
/* matching nor the alias table can reach them — and two were actively  */
/* WRONG, caught by the alias table's `farmhouse` rule sending Finland's */
/* sahti and Lithuania's keptinis to Saison.                            */
/*                                                                      */
/* Deliberately an id map. A substring rule here would be the same trap */
/* documented above: "tella" matches inside Stella Artois.              */
/* ------------------------------------------------------------------ */

const STYLE_OVERRIDES = {
  // Was `saison` via the "farmhouse" alias — a real style, the wrong one.
  'sahti-fi': 'sahti',
  'jovaru-alus-lt': 'keptinis',

  // Opaque sorghum beer, sold still-fermenting in a waxed carton.
  'chibuku-botswana-bw': 'chibuku',
  'chibuku-shake-shake-zw': 'chibuku',
  'chibuku-malawi-mw': 'chibuku',

  // Brittany's revived tradition — buckwheat, and in Mor Braz's case seawater.
  'coreff-fr': 'biere-bretonne',
  'britt-fr': 'biere-bretonne',
  'lancelot-fr': 'biere-bretonne',
  'mor-braz-fr': 'biere-bretonne',

  // German brewing transplanted to subtropical Santa Catarina in the 1850s.
  'eisenbahn-br': 'blumenau-lager',

  // Spéciale Belge, 5–5.5%: Antwerp's house beer. NOT Kwak, which is an
  // 8.4% strong amber — a plausible link that would misdescribe the beer,
  // so it stays unresolved rather than pointing somewhere tidy and wrong.
  'de-koninck-be': 'belgian-amber-ale',
  'palm-be': 'belgian-amber-ale',
};

/* ------------------------------------------------------------------ */
/* Brewery attribution                                                  */
/*                                                                      */
/* An atlas row is either a product ("Sierra Nevada Torpedo") or a bare */
/* brewery ("Crew Republic"). Products are attributed by finding the    */
/* longest brewery name in the SAME COUNTRY that the product name       */
/* starts with — same-country only, because "Bohemia" is a brand in     */
/* four countries and a prefix match across borders would merge them.   */
/* ------------------------------------------------------------------ */

const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[æ]/g, 'ae')
    .replace(/[øö]/g, 'o')
    .replace(/[ł]/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** A note that describes the company rather than a beer. */
const isBreweryNote = (note) => /^(craft|organic craft|craft brewery)(,|$)/i.test(note.trim());

function build() {
  const atlas = JSON.parse(readFileSync(join(SRC, 'atlas.json'), 'utf8'));

  // Hand-researched countries replace the atlas entirely for that country.
  const researched = new Map();
  for (const f of readdirSync(SRC)) {
    if (f === 'atlas.json' || !f.endsWith('.json')) continue;
    const list = JSON.parse(readFileSync(join(SRC, f), 'utf8'));
    researched.set(basename(f, '.json'), list);
  }

  /** country -> brewery record */
  const byCountry = new Map();
  const ensure = (country, code, region) => {
    if (!byCountry.has(country)) byCountry.set(country, { country, code, region, breweries: new Map() });
    return byCountry.get(country);
  };

  /* --- pass 1: atlas ------------------------------------------------ */
  // Group by country first so attribution never crosses a border.
  const rows = new Map();
  for (const b of atlas) {
    if (!rows.has(b.country)) rows.set(b.country, []);
    rows.get(b.country).push(b);
  }

  for (const [country, list] of rows) {
    const { code, region } = list[0];
    const c = ensure(country, code, region);

    // Bare-brewery rows become breweries; everything else is a product
    // looking for one.
    const breweryRows = list.filter((b) => isBreweryNote(b.note));
    const productRows = list.filter((b) => !isBreweryNote(b.note));

    for (const b of breweryRows) {
      const city = b.note.includes(',') ? b.note.split(',').slice(1).join(',').trim() : null;
      c.breweries.set(b.name, {
        id: slug(`${b.name}-${b.code}`),
        name: b.name,
        city,
        beers: [],
        /* No lineup researched yet — the brewery is real, its catalogue
         * is not yet known. The app shows these as "lineup not yet
         * catalogued" rather than inventing product names. */
        needsLineup: true,
      });
    }

    for (const b of productRows) {
      // Longest same-country brewery name this product starts with.
      let owner = null;
      for (const name of c.breweries.keys()) {
        if (b.name.toLowerCase().startsWith(name.toLowerCase()) && (!owner || name.length > owner.length)) {
          owner = name;
        }
      }
      // Also try other product rows' leading words as an implicit brewery
      // ("Sierra Nevada Pale Ale" + "Sierra Nevada Torpedo" => Sierra Nevada).
      if (!owner) {
        const words = b.name.split(' ');
        /* An implicit brewery name can't start with an article or a generic
         * brewing word, or "La Chouffe" and "La Cagole" merge into a brewery
         * called "La". These carry no identity on their own. */
        const STOP = new Set(['la','le','les','el','los','las','the','de','den','der','die','das',
          'du','di','del','saint','st','cerveza','cerveceria','cervecería','birra','biere','bière',
          'brasserie','brouwerij','brauerei','browar','pivovar','bia','birra']);
        for (let n = Math.min(3, words.length - 1); n >= 1 && !owner; n--) {
          const cand = words.slice(0, n).join(' ');
          if (STOP.has(cand.toLowerCase().split(' ')[0])) continue;
          const siblings = productRows.filter((p) => p.name.startsWith(cand + ' '));
          if (siblings.length >= 2) owner = cand;
        }
      }

      const breweryName = owner ?? b.name;
      if (!c.breweries.has(breweryName)) {
        c.breweries.set(breweryName, { id: slug(`${breweryName}-${b.code}`), name: breweryName, city: null, beers: [], needsLineup: false });
      }
      const brewery = c.breweries.get(breweryName);
      brewery.needsLineup = false;

      // Strip the brewery name off the front so the card reads "Torpedo"
      // under "Sierra Nevada" rather than repeating it.
      const short = owner && b.name.length > owner.length ? b.name.slice(owner.length).trim() : b.name;

      const beerId = slug(`${b.name}-${b.code}`);
      brewery.beers.push({
        id: beerId,
        name: b.name,
        shortName: short || b.name,
        style: b.note || null,
        styleRef: STYLE_OVERRIDES[beerId] ?? resolveStyle(b.note) ?? resolveStyle(b.name),
      });
    }
  }

  /* --- pass 2: researched lineups override ------------------------- */
  for (const [, list] of researched) {
    for (const entry of list) {
      const seed = atlas.find((a) => a.country === entry.country) ?? atlas.find((a) => entry.brewery && a.name === entry.brewery);
      const country = entry.country ?? seed?.country ?? 'Puerto Rico';
      const ref = atlas.find((a) => a.country === country);
      if (!ref) continue;
      const c = ensure(country, ref.code, ref.region);

      // Replace any atlas stub for this brewery, including the bare-name
      // row the atlas contributed (matched loosely — "Ocean Lab Brewing Co"
      // vs "Ocean Lab Brewing Co.").
      const owned = new Set(entry.beers.map((x) => slug(x.name)));
      for (const key of [...c.breweries.keys()]) {
        const b = c.breweries.get(key);
        const sameHouse = slug(key) === slug(entry.brewery) || slug(entry.brewery).startsWith(slug(key));
        /* The atlas lists Medalla Light as its own row; the researched file
         * lists it under Compañía Cervecera. Drop the stub, or the beer
         * appears twice — once orphaned, once correctly attributed. */
        const isOrphanOfOurs = b.beers.length <= 1 && b.beers.every((x) => owned.has(slug(x.name)));
        if (sameHouse || isOrphanOfOurs) c.breweries.delete(key);
      }

      c.breweries.set(entry.brewery, {
        id: slug(`${entry.brewery}-${ref.code}`),
        name: entry.brewery,
        city: entry.city ?? null,
        founded: entry.founded ?? null,
        note: entry.note ?? null,
        needsLineup: false,
        researched: true,
        beers: entry.beers.map((x) => ({
          id: slug(`${entry.brewery}-${x.name}`),
          name: x.name,
          shortName: x.name,
          style: x.style ?? null,
          styleRef: resolveStyle(x.style) ?? resolveStyle(x.name),
          abv: x.abv ?? null,
          note: x.note ?? null,
        })),
      });
    }
  }

  /* --- emit --------------------------------------------------------- */
  const out = [...byCountry.values()]
    .map((c) => ({
      country: c.country,
      code: c.code,
      region: c.region,
      breweries: [...c.breweries.values()].sort((a, b) => b.beers.length - a.beers.length || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.country.localeCompare(b.country));

  writeFileSync(OUT, JSON.stringify(out, null, 1));

  const breweries = out.reduce((a, c) => a + c.breweries.length, 0);
  const beers = out.reduce((a, c) => a + c.breweries.reduce((n, b) => n + b.beers.length, 0), 0);
  const linked = out.reduce(
    (a, c) => a + c.breweries.reduce((n, b) => n + b.beers.filter((x) => x.styleRef).length, 0),
    0
  );
  const pending = out.reduce((a, c) => a + c.breweries.filter((b) => b.needsLineup).length, 0);

  console.log(`countries  ${out.length}`);
  console.log(`breweries  ${breweries}  (${pending} awaiting a researched lineup)`);
  console.log(`beers      ${beers}`);
  console.log(`styleRef   ${linked}/${beers} (${((linked / beers) * 100).toFixed(0)}%) linked to a Dex style`);
  console.log(`\nwrote ${OUT}`);
}

build();
