/**
 * Builds src/data/wineAtlasLinks.json — the bridge from a wine Dex card to
 * the atlas.
 *
 * Run AFTER build-wine-atlas.mjs (it reads the generated atlas).
 * Run: node scripts/build-wine-atlas-links.mjs
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
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const atlas = JSON.parse(readFileSync(join(ROOT, 'src/data/wineAtlas.json'), 'utf8'));
const drinks = JSON.parse(readFileSync(join(ROOT, 'src/data/drinks.json'), 'utf8'));

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const byWineName = new Map();
atlas.wines.forEach((w) => {
  const k = fold(w.n);
  if (!byWineName.has(k)) byWineName.set(k, []);
  byWineName.get(k).push(w.n);
});

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
 * Cards with deliberately no atlas entry. Sake is brewed from rice and
 * vermouth is aromatized and fortified — neither is a named wine on an
 * appellation map, and pointing them at something adjacent would be a
 * small lie told 7 times.
 */
const ABSENT = {
  daiginjo: 'Sake is brewed from rice, not grapes — it sits outside the atlas.',
  ginjo: 'Sake is brewed from rice, not grapes — it sits outside the atlas.',
  honjozo: 'Sake is brewed from rice, not grapes — it sits outside the atlas.',
  junmai: 'Sake is brewed from rice, not grapes — it sits outside the atlas.',
  nigori: 'Sake is brewed from rice, not grapes — it sits outside the atlas.',
  'dry-vermouth': 'Vermouth is aromatized and fortified rather than an appellation wine.',
  'sweet-vermouth': 'Vermouth is aromatized and fortified rather than an appellation wine.',
};

const links = {};
const problems = [];

for (const d of drinks.filter((x) => x.category === 'wine')) {
  if (ABSENT[d.id]) {
    links[d.id] = { wines: [], grape: null, absent: ABSENT[d.id] };
    continue;
  }
  let wines = [];
  let grape = null;

  if (WINES[d.id]) {
    for (const name of WINES[d.id]) {
      const hit = byWineName.get(fold(name));
      if (hit) wines.push(...hit);
    }
    if (!wines.length) problems.push(`${d.id}: no override name resolved`);
  } else if (GRAPES[d.id]) {
    grape = byGrapeName.get(fold(GRAPES[d.id]));
    if (grape === undefined) problems.push(`${d.id}: grape override "${GRAPES[d.id]}" not found`);
  } else {
    const k = fold(d.name);
    if (byWineName.has(k)) wines = [...byWineName.get(k)];
    else if (byGrapeName.has(k)) grape = byGrapeName.get(k);
    else problems.push(`${d.id} (${d.name}): unmatched and no override`);
  }

  wines = [...new Set(wines)].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  links[d.id] = { wines, grape: grape ?? null };
}

if (problems.length) {
  console.error('Link problems:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}

writeFileSync(join(ROOT, 'src/data/wineAtlasLinks.json'), JSON.stringify(links) + '\n');

const linked = Object.values(links).filter((l) => l.wines.length || l.grape != null).length;
const absent = Object.values(links).filter((l) => l.absent).length;
console.log(
  `wineAtlasLinks.json — ${Object.keys(links).length} wine cards: ` +
    `${linked} linked, ${absent} intentionally absent`
);
