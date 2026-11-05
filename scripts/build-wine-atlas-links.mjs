/**
 * Builds src/data/wineAtlasLinks.json — the bridge from a wine Dex card to
 * the atlas.
 *
 * Run AFTER build-wine-atlas.mjs (it reads the generated atlas) and after
 * any catalogue change (merge-wines.mjs, merge-wine-atlas.mjs).
 *
 *   node scripts/build-wine-atlas-links.mjs           # write it
 *   node scripts/build-wine-atlas-links.mjs --check   # write nothing; exit 1 if it is out of step
 *
 * Links store the wine's NAME, never its position in the atlas array.
 * Positions move: adding one row to winedata/wines.psv re-sorts the array,
 * and every index at or after the insertion silently retargets — the
 * Sauternes card renders Saint-Julien with no error anywhere. Names are
 * globally unique across all 1,558 wines, so they are a stable key, and a
 * name that stops resolving fails loudly through `problems` below.
 *
 * Most cards match by name on their own. The overrides below cover the rest:
 * a card that is a family of appellations rather than one ("Crémant",
 * "Madeira"), a card whose atlas name differs ("Ruby Port" is filed as
 * "Porto Ruby"), and the handful that have no atlas entry at all and should
 * say so rather than link to something approximate.
 *
 * THE BOTTLINGS (-wb, scripts/merge-wine-brands.mjs, v4.15) are linked
 * from their row, never by name: a bottle is on the map where the card it
 * is filed under is, its one appellation (Château Latour is Pauillac), or
 * its grape for a bottle filed under a variety ([yellow tail] Shiraz is
 * Syrah), or nowhere for one filed under a style made anywhere (Bordeaux
 * Blend). A link to a whole family would say "10 matching appellations"
 * of one bottle. And a bottle carries `grapes`, its own varieties by atlas
 * name, where its row names any the atlas knows: the Dex's Grape filter
 * reads those instead of everything its appellation permits (Krug Clos du
 * Mesnil is Chardonnay, not Le Mesnil's three). A row's grape is read
 * against its card before the atlas at large (atlasGrapes): an Argentine
 * Bonarda is Bonarda Argentina, not Lombardy's Croatina.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { atlasGrapes, atlasIndex, bottlingId, isBottling, loadWineBrands, styleCards, styleFacts } from './lib/wine-brands.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const atlas = JSON.parse(readFileSync(join(ROOT, 'src/data/wineAtlas.json'), 'utf8'));
const drinks = JSON.parse(readFileSync(join(ROOT, 'src/data/drinks.json'), 'utf8'));

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Two lookups, and the order matters.
 *
 * Folding is what lets a card named "Cotes de Provence" find "Côtes de
 * Provence", so it has to exist. But folding is not injective: Bulgaria's
 * Melnik and Bohemia's Mělník fold to the same key, so a folded lookup
 * returns BOTH and would link a Czech card to a Bulgarian wine — a valid
 * reference, resolving cleanly, and wrong. Exact match is tried first and
 * folding is only the fallback.
 */
const exactWineName = new Map(atlas.wines.map((w) => [w.n, [w.n]]));
const foldedWineName = new Map();
atlas.wines.forEach((w) => {
  const k = fold(w.n);
  if (!foldedWineName.has(k)) foldedWineName.set(k, []);
  foldedWineName.get(k).push(w.n);
});

/**
 * Exact, then folded, then the same two again with a trailing qualifier
 * removed. Returns [] when nothing matches.
 *
 * The Dex disambiguates card names that would otherwise read identically in
 * a list by appending the region — "Faro (Sicily)", "Mělník (Bohemia)". The
 * atlas name is the join key and never carries that suffix, so it is
 * stripped before the fallback lookups. Stripping is from the FIRST " (" so
 * a nested qualifier like "El Dorado (California (Sierra Foothills))"
 * reduces to "El Dorado" rather than to something malformed.
 *
 * An AMBIGUOUS folded match returns nothing rather than guessing. Melnik and
 * Mělník fold together, and picking either would be a valid reference to the
 * wrong wine — the failure this whole resolver exists to prevent. Ambiguity
 * must be settled by an explicit override, not by ordering.
 */
function resolveWine(name) {
  const exact = exactWineName.get(name);
  if (exact) return exact;

  const folded = foldedWineName.get(fold(name));
  if (folded?.length === 1) return folded;
  if (folded?.length > 1) return [];

  const base = name.replace(/\s*\(.*$/, '').trim();
  return base && base !== name ? resolveWine(base) : [];
}

/** Same rule for grapes. */
const exactGrapeName = new Map();
atlas.grapes.forEach((g) => {
  for (const n of [g.name, ...g.synonyms]) if (!exactGrapeName.has(n)) exactGrapeName.set(n, g.name);
});
function resolveGrape(name) {
  return exactGrapeName.get(name) ?? byGrapeName.get(fold(name));
}

/* A name key is only as good as its uniqueness. Check, don't assume. */
{
  const counts = new Map();
  for (const w of atlas.wines) counts.set(w.n, (counts.get(w.n) ?? 0) + 1);
  const clashes = [...counts].filter(([, n]) => n > 1).map(([n]) => n);
  if (clashes.length) {
    console.error('Atlas wine names are no longer unique; name-keyed links are unsafe:');
    for (const c of clashes) console.error('  ' + c);
    process.exit(1);
  }
}
const byGrapeName = new Map();
atlas.grapes.forEach((g) => {
  for (const n of [g.name, ...g.synonyms]) {
    const k = fold(n);
    if (!byGrapeName.has(k)) byGrapeName.set(k, g.name);
  }
});

/** Card id -> explicit atlas wine names. */
const WINES = {
  'ice-wine': ['Icewine (Ontario)', 'Eiswein', 'Vin de Glace du Québec'],
  'vin-santo': ['Vin Santo del Chianti', 'Vin Santo del Chianti Classico', 'Vin Santo di Montepulciano'],
  madeira: ['Madeira Sercial', 'Madeira Verdelho', 'Madeira Bual', 'Madeira Malmsey',
            'Madeira Terrantez', 'Madeira Rainwater', 'Madeira Tinta Negra'],
  'ruby-port': ['Porto Ruby'],
  'tawny-port': ['Porto Tawny', 'Porto Colheita'],
  'vintage-port': ['Porto Vintage', 'Porto Late Bottled Vintage', 'Porto Crusted'],
  'bordeaux-blend': ['Médoc', 'Haut-Médoc', 'Pauillac', 'Margaux', 'Saint-Julien', 'Saint-Estèphe',
                     'Pessac-Léognan', 'Saint-Émilion', 'Pomerol', 'Graves'],
  'provence-rose': ['Côtes de Provence', 'Côtes de Provence Sainte-Victoire', 'Côtes de Provence La Londe',
                    'Coteaux d’Aix-en-Provence', "Coteaux d'Aix-en-Provence", 'Coteaux Varois en Provence'],
  'amontillado-sherry': ['Amontillado'],
  'fino-sherry': ['Fino'],
  'manzanilla-sherry': ['Manzanilla de Sanlúcar'],
  'oloroso-sherry': ['Oloroso'],
  'palo-cortado-sherry': ['Palo Cortado'],
  'orange-wine': ['Kakheti Qvevri Amber', 'Carso Vitovska'],
  cremant: ['Crémant de Bordeaux', 'Crémant de Bourgogne', 'Crémant de Loire', "Crémant d'Alsace",
            'Crémant de Limoux', 'Crémant du Jura', 'Crémant de Die', 'Crémant de Luxembourg',
            'Crémant de Wallonie'],
  lambrusco: ['Lambrusco di Sorbara', 'Lambrusco Grasparossa di Castelvetro',
              'Lambrusco Salamino di Santa Croce', 'Lambrusco Reggiano', 'Lambrusco Mantovano'],
  'pet-nat': ['Blanquette Méthode Ancestrale', 'Bugey-Cerdon'],
  txakoli: ['Getariako Txakolina', 'Bizkaiko Txakolina', 'Arabako Txakolina'],
};

/** Card id -> atlas grape name, where the card is a variety. */
const GRAPES = { 'syrah-shiraz': 'Syrah' };

/**
 * Cards with deliberately no atlas entry. Vermouth is aromatized and
 * fortified rather than a named wine on an appellation map, and pointing it
 * at something adjacent would be a small lie told twice.
 *
 * So are v4.16's six styles (specs/v4.16/style-cards.md): a blend, a
 * rosé, a Moscato or a sweet red sold by its style, made anywhere in a
 * state or in many countries. Bordeaux Blend and Provence Rosé point at
 * the appellations that define them; these have none, and the atlas has
 * no row for them, so they say so. Their bottles are on the map nowhere,
 * as every bottle filed under a style made anywhere is, and carry their
 * own grapes into the Grape filter. Sweet Red's says where the sweet reds
 * of named places are, since the atlas styles eighteen of them Sweet Red.
 */
const ABSENT = {
  'dry-vermouth': 'Vermouth is aromatized and fortified rather than an appellation wine.',
  'sweet-vermouth': 'Vermouth is aromatized and fortified rather than an appellation wine.',
  'california-red-blend': 'A style blended from vineyards anywhere in California, rather than the wine of one place on the map.',
  'new-world-rose': 'A style made across the New World, rather than an appellation wine.',
  'new-world-moscato': 'A style made across the New World from Muscat grapes, rather than an appellation wine.',
  'red-blend': 'A style made wherever red grapes grow, rather than an appellation wine.',
  'white-blend': 'A style made wherever white grapes grow, rather than an appellation wine.',
  'sweet-red':
    'A style made in many wine countries, rather than an appellation wine. The sweet reds of named places, Kindzmarauli and Recioto della Valpolicella among them, are on the map under their own names.',
};

/*
 * Which cards get a link (v4.14): every wine card, and the fortified wines
 * on the spirit shelf (scripts/spiritdata/99-fortified.json: the ports, the
 * sherries and the two vermouths). Those were wine cards when these links
 * were first drawn and are the same wines now, so Ruby Port still points at
 * Porto Ruby. The five sakes, and their ABSENT lines above, went when wine
 * came back without them.
 */
const SPIRIT_SHELF_WINES = new Set(['Sherry', 'Port', 'Vermouth']);
const onTheMap = (d) =>
  d.category === 'wine' || (d.category === 'spirit' && SPIRIT_SHELF_WINES.has(d.subcategory));

const links = {};
const problems = [];

const idx = atlasIndex(atlas);
const styles = styleCards(drinks);
const bottleRows = new Map(loadWineBrands().map((b) => [bottlingId(b), b]));

for (const d of drinks.filter(onTheMap)) {
  if (isBottling(d.id)) {
    const b = bottleRows.get(d.id);
    const card = b && styles.get(b.s);
    if (!card) {
      problems.push(`${d.id} (${d.name}): ${b ? `filed under "${b.s}", which is not a wine card` : 'no row in scripts/winebranddata/'}`);
      continue;
    }
    const facts = styleFacts(card, idx);
    const grapes = atlasGrapes(b, idx, facts);
    links[d.id] = {
      wines: facts.kind === 'place' ? [facts.atlasWine.n] : [],
      grape: facts.kind === 'variety' ? facts.grape : null,
      ...(grapes.length ? { grapes } : {}),
    };
    continue;
  }
  if (ABSENT[d.id]) {
    links[d.id] = { wines: [], grape: null, absent: ABSENT[d.id] };
    continue;
  }
  let wines = [];
  let grape = null;

  if (WINES[d.id]) {
    for (const name of WINES[d.id]) {
      wines.push(...resolveWine(name));
    }
    if (!wines.length) problems.push(`${d.id}: no override name resolved`);
  } else if (GRAPES[d.id]) {
    grape = resolveGrape(GRAPES[d.id]);
    if (grape === undefined) problems.push(`${d.id}: grape override "${GRAPES[d.id]}" not found`);
  } else {
    const hit = resolveWine(d.name);
    if (hit.length) wines = [...hit];
    else {
      const g = resolveGrape(d.name);
      if (g !== undefined) grape = g;
      else problems.push(`${d.id} (${d.name}): unmatched and no override`);
    }
  }

  wines = [...new Set(wines)].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  links[d.id] = { wines, grape: grape ?? null };
}

if (problems.length) {
  console.error('Link problems:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}

/*
 * --check writes nothing and fails while the file is out of step: the links
 * are worked out from drinks.json and the atlas, both generated, so either
 * changing without this run leaves a card pointing at the wrong place or
 * nowhere.
 */
const OUT = join(ROOT, 'src/data/wineAtlasLinks.json');
const text = JSON.stringify(links) + '\n';
if (process.argv.includes('--check')) {
  let shipped = '';
  try {
    shipped = readFileSync(OUT, 'utf8');
  } catch {
    // A missing file is out of step, below.
  }
  if (shipped !== text) {
    console.error('src/data/wineAtlasLinks.json is out of step with drinks.json or the atlas: run node scripts/build-wine-atlas-links.mjs');
    process.exit(1);
  }
  console.log(`wineAtlasLinks.json — in step, ${Object.keys(links).length} cards`);
  process.exit(0);
}
writeFileSync(OUT, text);

const linked = Object.values(links).filter((l) => l.wines.length || l.grape != null).length;
const absent = Object.values(links).filter((l) => l.absent).length;
const bottles = Object.keys(links).filter(isBottling).length;
console.log(
  `wineAtlasLinks.json — ${Object.keys(links).length} wine cards: ` +
    `${linked} linked, ${absent} intentionally absent; ${bottles} of them bottlings`
);
