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
  // No alias may point at an alcohol-free style. Sipply is an alcohol app and
  // the non-alcoholic-lager card was removed along with every 0% entry, so an
  // alias to it would resolve to a card that is not in the Dex. A new
  // alcohol-free product should be left out of the source data, not aliased.
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
  /* Late, generic fallbacks. They sit here deliberately: every specific
   * rule above must get first refusal, or bare 'amber' would swallow
   * 'amber lager' and bare 'dunkel' would swallow 'dunkelweizen'.
   * Left OUT on purpose, because no honest target exists: 'fruit',
   * 'dark', 'session', 'barrel-aged', 'honey' — and the brewery
   * descriptors ('franconia', 'paris craft'), which are a gap in this
   * file's own style tagging rather than a missing Dex entry. */
  ['strong dark', 'belgian-quadrupel'],
  ['dunkel', 'munich-dunkel'],
  ['weizen', 'hefeweizen'],
  ['amber', 'american-amber-ale'],
  ['porter', 'english-porter'],
  ['stout', 'irish-dry-stout'],
  ['ale', 'blonde-ale'],
];

/** Dex style name (lowercased) -> Drink.id, e.g. "american porter" -> american-porter. */
/*
 * AUTHORED style cards only. drinks.json also contains one generated card per
 * brand (id suffixed `-br`, written by scripts/merge-beer-brands.mjs), and
 * those must be excluded or the pipeline eats its own tail: every brand name
 * becomes a "style" name, `resolveStyle(b.name)` matches the brand's OWN card,
 * and each beer ends up declaring itself its own style. That reads as a
 * flattering 100% linkage and is worth nothing.
 */
const DEX_STYLES = new Map(
  JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'drinks.json'), 'utf8'))
    .filter((d) => d.category === 'beer' && !d.id.endsWith('-br'))
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

  /* Kwak was pinned to null here for months because the Dex had no style
   * that was actually true of it: the generic `amber` fallback files it as a
   * 4.5% American Amber Ale, and Belgian Amber Ale is 5–5.5% Spéciale Belge.
   * Both are real styles and both are the wrong beer.
   *
   * That gap is now closed — `belgian-strong-amber` was authored for exactly
   * this, and Kwak resolves through BRAND_FACTS below at its real 8.4%. The
   * entry stays here as a marker: leaving a brand unresolved is the correct
   * move when the honest style does not exist yet, and the fix is to author
   * the style, not to bend the brand into a neighbouring one. */
};

/* ------------------------------------------------------------------ */
/* Researched brand facts                                              */
/*                                                                    */
/* The 174 brands whose style never resolved from the atlas note, each */
/* looked up against the brewery or a beer database. Keyed by the      */
/* generated brand id, same contract as STYLE_OVERRIDES above.         */
/*                                                                    */
/* `abv` is only set where a figure was actually published. Left null, */
/* the card inherits the style range, which is honest; inventing a     */
/* number to fill the field would not be.                              */
/*                                                                    */
/* `flagship` is set on rows where the ATLAS NAMED A BREWERY, not a    */
/* beer. The card keeps the brewery name and takes its flagship s      */
/* style, and merge-beer-brands.mjs says so in the description rather  */
/* than implying the brewery is that one beer.                         */
/*                                                                    */
/* 46 of the 174 are deliberately absent — see UNRESOLVED below.       */
/* ------------------------------------------------------------------ */

const BRAND_FACTS = {
  '1664-rose-fr': { style: 'fruit-beer', abv: '4.5%' },
  'achouffe-cherry-chouffe-be': { style: 'fruit-beer', abv: '8.0%' },
  'allagash-coolship-us': { style: 'gueuze', abv: '6.4%' },
  'amsterdam-framboise-ca': { style: 'fruit-beer', abv: '6.5%' },
  'andechser-de': { style: 'doppelbock', abv: '7.1%', flagship: 'Andechser Doppelbock Dunkel, 18.5deg Plato' },
  'andes-negra-ar': { style: 'schwarzbier', abv: null },
  'apostelbrau-de': { style: 'ancient-grain-beer', abv: null, flagship: 'Original Dinkel-Bier, brewed from spelt since 1990' },
  'apostol-co': { style: 'munich-helles', abv: '4.6%', flagship: 'Apostol Lager, 21-day German-style golden lager' },
  'appenzeller-hanfblute-ch': { style: 'herb-spice-beer', abv: '5.2%' },
  'asahi-maruef-jp': { style: 'japanese-rice-lager', abv: '4.5%' },
  'baird-country-girl-kabocha-jp': { style: 'pumpkin-ale', abv: '6.5%' },
  'baumgartner-at': { style: 'kellerbier', abv: '5.2%', flagship: 'Baumgartner Zwickl, naturally cloudy' },
  'belikin-sorrel-bz': { style: 'fruit-beer', abv: null },
  'bergquell-de': { style: 'german-pilsner', abv: '4.9%', flagship: 'Loebauer Bergquell Pilsner' },
  'boatrocker-au': { style: 'barrel-aged-imperial-stout', abv: '11.0%', flagship: 'Ramjet, aged in Starward whisky barrels' },
  'bomonti-filtresiz-tr': { style: 'kellerbier', abv: '4.8%' },
  'bosteels-deus-be': { style: 'biere-de-champagne', abv: '11.5%' },
  'brasserie-de-bretagne-fr': { style: 'blonde-ale', abv: '5.0%', flagship: 'Dremmwel Blonde, brewed with seven cereals' },
  'brasserie-du-mont-blanc-fr': { style: 'witbier', abv: '4.7%', flagship: 'La Blanche, coriander and lemon zest, glacier water' },
  'brasserie-la-choulette-framboise-fr': { style: 'fruit-beer', abv: '6.0%' },
  'brasserie-lancelot-cervoise-fr': { style: 'gruit', abv: '6.0%' },
  'braustelle-de': { style: 'kolsch', abv: null, flagship: 'Helios, unfiltered Koelsch in the Wiess style' },
  'carib-shandy-tt': { style: 'radler', abv: null },
  'carlton-mid-au': { style: 'american-lager', abv: '3.0%' },
  'central-waters-us': { style: 'barrel-aged-imperial-stout', abv: '10.5%', flagship: 'Brewer s Reserve Bourbon Barrel Stout, a year in 12-year bourbon barrels' },
  'ceylon-beverage-lk': { style: 'european-pale-lager', abv: '4.8%', flagship: 'Lion Lager, the best-selling beer in Sri Lanka and the Maldives' },
  'ciechan-miodowe-pl': { style: 'honey-beer', abv: '4.7%' },
  'ciechan-pl': { style: 'european-pale-lager', abv: null, flagship: 'Ciechan Wyborne, the beer that started Poland s unpasteurised trend' },
  'coach-house-gb': { style: 'english-bitter', abv: '3.7%', flagship: 'Coachman s Best Bitter' },
  'colorado-bertho-br': { style: 'american-brown-ale', abv: '8.0%' },
  'conwy-brewery-gb': { style: 'english-bitter', abv: '4.3%', flagship: 'Welsh Pride (Balchder Cymru), their best-selling bitter' },
  'de-garde-us': { style: 'berliner-weisse', abv: '2.3%', flagship: 'Bu Weisse, 15-20% of production by 2015' },
  'delirium-red-be': { style: 'fruit-beer', abv: '8.0%' },
  'desperados-fr': { style: 'herb-spice-beer', abv: '5.9%' },
  'distelhauser-de': { style: 'german-pilsner', abv: '4.9%', flagship: 'Distelhaeuser Premium Pils, Hallertauer Smaragd and Saphir' },
  'dortmunder-union-de': { style: 'dortmunder-export', abv: '5.3%', flagship: 'Dortmunder Union Export, the beer the style is named after' },
  'eagle-rock-solidarity-us': { style: 'dark-mild', abv: '3.8%' },
  'echigo-jp': { style: 'japanese-rice-lager', abv: '5.0%', flagship: 'Koshihikari Echigo, brewed with Niigata Koshihikari rice' },
  'eichhorn-de': { style: 'kellerbier', abv: '5.0%', flagship: 'Eichhorn Kellerbier' },
  'escudo-negra-cl': { style: 'schwarzbier', abv: '5.7%' },
  'estrella-galicia-1906-red-vintage-es': { style: 'doppelbock', abv: '8.0%' },
  'extraomnes-it': { style: 'belgian-blonde-ale', abv: null, flagship: 'Extraomnes Blond' },
  'feral-karma-citra-au': { style: 'black-ipa', abv: '5.8%' },
  'flying-fish-pressed-lemon-za': { style: 'radler', abv: '4.5%' },
  'fohrenburger-at': { style: 'european-pale-lager', abv: '5.5%', flagship: 'Fohrenburger Jubilaeum' },
  'fortuna-czarne-pl': { style: 'schwarzbier', abv: '5.8%' },
  'franciscan-well-ie': { style: 'irish-red-ale', abv: '4.3%', flagship: 'Rebel Red, launched 1998' },
  'freistadter-at': { style: 'german-pilsner', abv: '5.2%', flagship: 'Ratsherrn Premium' },
  'goldberg-black-ng': { style: 'munich-dunkel', abv: '6.0%' },
  'greif-de': { style: 'kellerbier', abv: '4.9%', flagship: 'Greif Kellerbier' },
  'guineu-riner-es': { style: 'american-pale-ale', abv: '2.5%' },
  'gulden-draak-brewmaster-be': { style: 'belgian-quadrupel', abv: '10.5%' },
  'gusswerk-bio-hanfbier-at': { style: 'herb-spice-beer', abv: null },
  'haandbryggeriet-no': { style: 'maltol', abv: '6.5%', flagship: 'Norwegian Wood, open-fire kilned malt with juniper' },
  'hitachino-nest-ginger-brew-jp': { style: 'herb-spice-beer', abv: '7.0%' },
  'innis-gunn-blood-red-sky-gb': { style: 'scottish-ale', abv: '6.8%' },
  'innis-gunn-gb': { style: 'scottish-ale', abv: '6.6%' },
  'innis-gunn-original-gb': { style: 'scottish-ale', abv: '6.6%' },
  'kasteel-rouge-be': { style: 'fruit-beer', abv: '8.0%' },
  'kizakura-jp': { style: 'altbier', abv: '5.0%', flagship: 'Kyoto Alt, Kyoto s first craft beer' },
  'kormoran-warminskie-miodowe-pl': { style: 'honey-beer', abv: null },
  'kwak-be': { style: 'belgian-strong-amber', abv: '8.4%' },
  'la-cristal-fr': { style: 'american-ipa', abv: null, flagship: 'La Cristal IPA, brewed with Savoy glacier water' },
  'landskron-de': { style: 'german-pilsner', abv: '4.8%', flagship: 'Landskron Premium Pilsner, lagered in 12m vaulted cellars' },
  'leffe-ruby-be': { style: 'fruit-beer', abv: '5.0%' },
  'level33-sg': { style: 'vienna-lager', abv: null, flagship: '33.1 Blond Lager, from an 1841 Vienna blond lager recipe' },
  'loba-negra-mx': { style: 'american-porter', abv: '5.5%' },
  'lowlander-nl': { style: 'american-ipa', abv: '6.0%', flagship: 'Lowlander I.P.A., brewed with grapefruit and coriander seed' },
  'mahou-maestra-es': { style: 'doppelbock', abv: '7.5%' },
  'meckatzer-de': { style: 'munich-helles', abv: null, flagship: 'Meckatzer Weiss-Gold, the first registered Allgaeu beer brand' },
  'minoh-momo-jp': { style: 'fruit-beer', abv: '5.0%' },
  'mohren-at': { style: 'european-pale-lager', abv: '5.6%', flagship: 'Mohren Spezial, the classic Vorarlberg lager' },
  'monteith-s-black-nz': { style: 'schwarzbier', abv: '5.2%' },
  'muller-brau-ch': { style: 'munich-helles', abv: null, flagship: 'Mueller Braeu, the house Helles' },
  'neder-de': { style: 'kellerbier', abv: '5.6%', flagship: 'Neder Kellerbier, dark unfiltered Zwickel' },
  'negev-passiflora-il': { style: 'fruit-beer', abv: '4.9%' },
  'neumarkter-lammsbrau-de': { style: 'munich-helles', abv: '4.7%', flagship: 'Lammsbraeu Urstoff' },
  'newstead-3-quarter-time-au': { style: 'session-ipa', abv: '3.4%' },
  'ninkasi-believer-us': { style: 'american-amber-ale', abv: '6.9%' },
  'ninkasi-fr': { style: 'blonde-ale', abv: null, flagship: 'Ninkasi Blonde' },
  'northbound-gb': { style: 'american-pale-ale', abv: '4.5%', flagship: '26 Pale Ale, one of the two launch beers in 2015' },
  'novomestsky-cz': { style: 'czech-pilsner', abv: '4.5%', flagship: 'Novomestsky svetly lezak, 11deg unfiltered' },
  'palmers-gb': { style: 'extra-special-bitter', abv: null, flagship: 'Palmers 200, brewed for the brewery s bicentenary in 1994' },
  'panhead-quickchange-nz': { style: 'extra-pale-ale', abv: '4.6%' },
  'panhead-supercharger-nz': { style: 'american-pale-ale', abv: '5.7%' },
  'patricia-negra-uy': { style: 'munich-dunkel', abv: '5.1%' },
  'philter-xpa-au': { style: 'extra-pale-ale', abv: '4.2%' },
  'pietra-colomba-fr': { style: 'witbier', abv: '5.0%' },
  'pietra-fr': { style: 'biere-corse', abv: '6.0%' },
  'pinta-pl': { style: 'american-ipa', abv: '6.1%', flagship: 'Atak Chmielu, brewed continuously since 2011' },
  'pivovarsky-dum-cz': { style: 'czech-pilsner', abv: '4.5%', flagship: 'Stepan svetly lezak, 12deg unfiltered' },
  'port-brewing-older-viscosity-us': { style: 'barrel-aged-imperial-stout', abv: '12.0%' },
  'primator-polotmavy-cz': { style: 'czech-amber-lager', abv: '5.5%' },
  'propeller-esb-ca': { style: 'extra-special-bitter', abv: '5.0%' },
  'purkmistr-cz': { style: 'czech-pilsner', abv: '4.8%', flagship: 'Purkmistr svetly lezak 12deg, Saaz hops' },
  'purple-moose-gb': { style: 'english-pale-ale', abv: '3.6%', flagship: 'Snowdonia Ale (Cwrw Eryri), pale and crystal malt' },
  'red-stripe-sorrel-jm': { style: 'fruit-beer', abv: '3.6%' },
  'riedenburger-de': { style: 'ancient-grain-beer', abv: '5.1%', flagship: 'Historisches Emmerbier, brewed from emmer and einkorn' },
  'riegele-de': { style: 'dortmunder-export', abv: '5.2%', flagship: 'Commerzienrat Riegele Privat, Beer of the Decade' },
  'rittmayer-de': { style: 'kellerbier', abv: '5.0%', flagship: 'Hallerndorfer Kellerbier' },
  'rugenbrau-ch': { style: 'munich-helles', abv: '4.8%', flagship: 'Rugenbraeu Lager Hell' },
  'russian-river-beatification-us': { style: 'american-wild-ale', abv: '5.5%' },
  'russian-river-damnation-us': { style: 'belgian-golden-strong-ale', abv: '7.5%' },
  'sagene-no': { style: 'german-pilsner', abv: '4.7%', flagship: 'Sagene Pilsner' },
  'samuel-smith-s-organic-cherry-gb': { style: 'fruit-beer', abv: '5.1%' },
  'san-miguel-flavored-apple-ph': { style: 'fruit-beer', abv: '3.0%' },
  'sarah-hughes-dark-ruby-gb': { style: 'dark-mild', abv: '6.0%' },
  'schremser-at': { style: 'marzen', abv: '5.1%', flagship: 'Schremser Maerzen' },
  'schutzengarten-ch': { style: 'munich-helles', abv: '4.8%', flagship: 'Schuetzengarten Lager Hell' },
  'sheelin-gb': { style: 'blonde-ale', abv: null, flagship: 'Sheelin Blonde Ale' },
  'shipyard-pumpkinhead-us': { style: 'pumpkin-ale', abv: '4.5%' },
  'sibirskaya-korona-lime-ru': { style: 'radler', abv: '4.7%' },
  'skol-beats-br': { style: 'malt-liquor', abv: '7.9%' },
  'st-ambroise-framboise-ca': { style: 'fruit-beer', abv: '5.0%' },
  'stiegl-paracelsus-at': { style: 'kellerbier', abv: '5.2%' },
  'strahov-monastery-cz': { style: 'czech-amber-lager', abv: null, flagship: 'Sv. Norbert amber, brewed on site and served nowhere else' },
  'svaneke-dk': { style: 'vienna-lager', abv: '4.6%', flagship: 'Svaneke Classic, Vienna-style since 2000' },
  'tegernseer-spezial-de': { style: 'dortmunder-export', abv: '5.6%' },
  'tempus-reserva-especial-mx': { style: 'scottish-ale', abv: '6.1%' },
  'the-bruery-mischief-us': { style: 'belgian-golden-strong-ale', abv: '8.5%' },
  'the-kernel-table-beer-gb': { style: 'table-beer', abv: '3.2%' },
  'thisted-dk': { style: 'baltic-porter', abv: '7.9%', flagship: 'Limfjords Porter, smoked malt and licorice' },
  'uberach-fr': { style: 'blonde-ale', abv: '4.8%', flagship: 'Uberach Biere Blonde, unfiltered and bottle-refermented' },
  'vadia-preta-pt': { style: 'schwarzbier', abv: '4.9%' },
  'waikato-draught-nz': { style: 'english-bitter', abv: '4.0%' },
  'wildflower-au': { style: 'american-wild-ale', abv: '5.0%', flagship: 'Gold, blended and barrel-aged on foraged native yeast' },
  'yards-brawler-us': { style: 'dark-mild', abv: '4.2%' },
  'zotler-de': { style: 'munich-helles', abv: '4.9%', flagship: 'Zoetler Gold' },
};

/* ------------------------------------------------------------------ */
/* Deliberately unresolved                                             */
/*                                                                    */
/* Researched and NOT given a style, with the reason. These stay       */
/* reading "Not published" in the Dex, which is the honest outcome:    */
/* a brewery with no designated flagship, a product no source          */
/* confirms, a range rather than a beer, or — three times — a cider.   */
/*                                                                    */
/* Kept as data rather than deleted so the next person to look does    */
/* not repeat the search and reach the same dead end.                  */
/* ------------------------------------------------------------------ */

const UNRESOLVED = {
  'aktien-brau-de': 'Bayreuther Aktienbrauerei. Searches keep resolving to Kulmbacher Brauerei AG, a different company. No flagship or abv confirmed for the Bayreuth brewery itself.',
  'albens-id': 'NOT A BEER. Albens Cider Factory, Jembrana, Bali — 4.9% cider from 100% Fuji apples, fermented with French champagne yeast. No malt. Third cider found in the beer atlas after Tusker and Good George.',
  'bapbap-fr': 'BAPBAP Originale confirmed as the flagship, a fruity pale ale of wheat and barley, but no abv published and the sources will not separate pale ale from blonde.',
  'barbarian-chicha-power-pe': 'Barbarian (Lima) makes Chicha Tu Mare, a corn-and-quinoa Berliner-weisse-like beer. Nothing found for a Chicha Power SKU.',
  'boga-es': 'Boga Garagardoa (Mungia, Bizkaia, founded 2014) confirmed with Argia pilsner, Tosta brown, Beltza stout, Martzela weissbier and Lorea IPA. No source designates a flagship.',
  'bomonti-siyah-tr': 'No source found for a Bomonti dark variant. Search returned only the pale/unfiltered line.',
  'bragdy-lleu-gb': 'Bragdy Lleu (Dyffryn Nantlle) flagship is Lleu at 4.0%, confirmed — but no source states its style, and a 4% Welsh ale could be a bitter or a golden ale.',
  'bush-de-nuits-be': 'Verified 13% Belgian strong AMBER aged in Nuits-St-Georges barrels. Dex Belgian family is blonde/dubbel/golden-strong/quad/tripel; a 13% amber is none of them.',
  'charlevoix-dominus-vobiscum-ca': 'Dominus Vobiscum is a RANGE (Blanche, Blonde, Double, Triple, Lupulus, Brut), not one beer. Picking a member would misrepresent the row.',
  'chelarte-sesion-co': 'Chelarte (Bogota) confirmed as a brewery; its named beers are Pamela, Raquel, Debora. Nothing found for a Sesion SKU.',
  'deck-donohue-fr': 'A BREWERY (Bonneuil, nr Paris). Flagship is Mission Pale Ale, 4.8% APA, 35 IBU — but the row names the brewery, not the beer.',
  'devil-craft-jp': 'A brewpub chain (Kanda, Hamamatsucho, Gotanda, Jiyugaoka) with its own Oimachi brewery. No flagship identified in any source.',
  'ducal-negra-bo': 'No dark Ducal found. Ducal is a tropicalised pilsener from Santa Cruz; no Negra variant in any source. The atlas row may be wrong.',
  'falken-ch': 'Brauerei Falken (Schaffhausen, 1799, the region s last independent) has Lagerbier Hell, Lagerbier Dunkel, Edelfalke, Doppelfalken and First Cool 4.5%. No flagship designated.',
  'fauna-ligera-mx': 'Closest real product is Fauna BRISA Ligera, a 3.8% mini session IPA. Resolving would assert the two names are the same beer, which no source states.',
  'fremont-bourbon-abominable-us': 'Verified barrel-aged imperial winter ale, 11-15.4% by year. Dex Barrel-Aged family holds only barleywine and imperial stout; it is neither.',
  'godspeed-ochame-ca': 'Verified Green Tea IPA, 6.0%, German and French hops. Not an American IPA; the tea is the defining feature. Candidate for a Herb & Spice Beer card.',
  'good-george-drop-hop-nz': 'NOT A BEER. Dry-hopped apple cider, 4.5%. Hops are added to cider; there is no malt.',
  'grand-teton-bitch-creek-us': 'Conflicting: BeerAdvocate carries it as BOTH Extra Special Bitter and American Brown Ale; abv reported 5.5/6.0/7.5. Needs the brewery page.',
  'held-brau-de': 'Held Braeu (Oberailsfeld) confirmed with a 4.9% Hell and a 5.3% Wallfahrtsbier, but no source designates a flagship and the row s hint is only "Franconia".',
  'kasztelan-niepasteryzowane-pl': 'Verified European Pale Lager, unpasteurised, 4.6-5.4%. Dex has no European Pale Lager card; it is not a pilsner or a helles. Candidate for a new style.',
  'knoblach-de': 'Brauerei Knoblach (Schammelsdorf, founded 1880) confirmed. Sources list Schammelsdorfer Lagerbier and the seasonal Pfingststoeffla but designate no flagship.',
  'kumpel-ua': 'Kumpel (Lviv) is a restaurant-brewery pouring light, amber and a mix called mishunk. Sources give abvs from 2.9 to 6.9% across unnamed beers and designate no flagship.',
  'lacada-gb': 'Lacada (Portrush, community-owned) names West Bay and Rathlin Gold as flagships but publishes an abv for neither, and the two are different styles.',
  'lion-brewery-us': 'Lionshead is confirmed as the flagship (750,000 cases a year) but no source gives its style or abv; the Stegmaier brand they also own spans 4.5% to 7.8%.',
  'loncium-at': 'Biermanufaktur Loncium (Koetschach-Mauthen, Carinthia, founded 2007) confirmed, but no source names a flagship or gives an abv for one.',
  'modelo-chelada-mx': 'Verified 3.5% RTD michelada — lager blended with tomato, salt and lime. Not a fruit beer, not a radler. Needs its own Chelada card or belongs in cocktails.',
  'nogne-o-no': 'Norway s craft pioneer, confirmed. But sources name three different flagships — Stonecutter Scotch Ale, Hopwired IPA and Batch #100 — and none of them is the beer the brewery is best known for abroad. No single style is defensible.',
  'norrebro-bryghus-dk': 'A BREWERY, not a beer. Copenhagen microbrewery with a wide range; no single product named in the row.',
  'olde-mecklenburg-us': 'A BREWERY (Charlotte NC). Flagship Copper is a 4.9% Dusseldorf Altbier — unambiguous, but the row names the brewery.',
  'orbaek-bryggeri-dk': 'Organic since 1996; signature is a Brown Ale that won organic gold in 2002, but no source says English or American brown, and no abv.',
  'otaru-beer-jp': 'A BREWERY, not a beer. Otaru brews Pilsner, Weiss and Dunkel to Reinheitsgebot; no single product to resolve.',
  'perle-fr': 'Brasserie Perle (Strasbourg) confirmed with Pils, Nature, Blanche, IPA and Perle dans les Vignes. No source names a flagship or an abv, and the row s hint does not match any single product.',
  'sainte-cru-fr': 'A BREWERY (Colmar, Alsace), founded 2012, hop-forward range of IPAs. No single product in the row.',
  'schlappeseppel-de': 'Schlappeseppel (Aschaffenburg) has Kellerbier 5.5%, Pilsner 5.0%, Dunkel 5.2%, Export, Helles and Weissbier. No flagship designated anywhere.',
  'skumenn-fr': 'Brasserie Skumenn (Cesson-Sevigne, organic, founded 2015) brews blonde, amber, white, triple and IPA. No flagship designated.',
  'sprig-fern-doris-plum-nz': 'Sprig + Fern (Nelson) confirmed; Doris Plum not in any source. Their listed range is APA, Best Bitter, Fern Dark et al.',
  'taquina-negra-bo': 'Sources split: cervezapedia calls Taquiña Negra a stout, BeerAdvocate carries only the adjunct lager. Dex has no generic stout card and I cannot tell which sub-style.',
  'the-bruery-us': 'No single flagship. Their best-known beer, Mischief, already has its own Dex card resolved separately, so styling the brewery row from it would duplicate.',
  'three-coins-bee-beer-lk': 'No honey variant found. Every source has Three Coins as a 4.8% pale lager; nothing supports a Bee Beer SKU.',
  'timothy-taylor-golden-best-gb': 'Verified 3.5% PALE mild. Dex has only dark-mild, which would be factually wrong. Needs a Pale Mild style card.',
  'turbinenbrau-ch': 'Turbinenbraeu (Zurich) brews Goldsprint, Start and Rekord. No flagship designated and no abv published for any of them.',
  'tusker-cider-ke': 'NOT A BEER. 4.5% apple cider, EABL states no hops or barley at all, gluten-free. Should leave the beer atlas, not get a style.',
  'ueli-bier-ch': 'A BRAND/BREWERY (Brauerei Fischerstube, Basel) covering Reverenz, Spezial, Basilisk, Classic, Weizen. Flagship Reverenz is a 5.2% Kellerbier.',
  'wicklow-wolf-locavore-ie': 'A SERIES, four releases a year, different style each time — 2019 dry stout, Spring 2024 barrel-aged farmhouse, Summer 2024 honey wheat, 2025 ESB. No single style exists.',
  'yuengling-black-tan-us': 'Verified 4.6%, a 60/40 porter+lager BLEND. No blend style in the Dex; calling it a porter would misdescribe it.',
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
          /* A brewery is never named after a style. Without this, "Saison Dupont"
           * and its cuvée invent a brewery called "Saison", and the three Zoigl
           * towns invent one called "Zoigl" — which is a communal brewing
           * tradition, not a company. */
          if (DEX_STYLES.has(cand.toLowerCase())) continue;
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
      /* Researched facts win over both the override table and the fuzzy
       * resolver, because they came from the brewery rather than from
       * pattern-matching a one-word atlas note. Several of those notes are
       * provably wrong — Feral Karma Citra is noted "Session" and is a Black
       * IPA; Colorado Berthô is noted "Honey" and is brewed with Brazil nuts. */
      const facts = BRAND_FACTS[beerId];
      brewery.beers.push({
        id: beerId,
        name: b.name,
        shortName: short || b.name,
        style: b.note || null,
        styleRef: facts
          ? facts.style
          : beerId in STYLE_OVERRIDES
            ? STYLE_OVERRIDES[beerId]
            : resolveStyle(b.note) ?? resolveStyle(b.name),
        ...(facts ? { factChecked: true } : {}),
        ...(facts?.abv ? { abv: facts.abv } : {}),
        ...(facts?.flagship ? { flagship: facts.flagship } : {}),
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
  /* Every BRAND_FACTS and UNRESOLVED key must name a brand that exists.
   *
   * A misspelled key is the worst kind of bug here because it is SILENT: the
   * lookup misses, the brand falls through to the fuzzy resolver, and the run
   * reports success while the beer stays exactly as unresolved as before.
   * Three keys were wrong on the first pass of this table — including
   * `port-older-viscosity-us` for `port-brewing-older-viscosity-us` — and
   * nothing would have caught them. */
  {
    const real = new Set(
      out.flatMap((c) => c.breweries.flatMap((b) => b.beers.map((x) => x.id)))
    );
    const ghosts = [...Object.keys(BRAND_FACTS), ...Object.keys(UNRESOLVED)].filter(
      (k) => !real.has(k)
    );
    if (ghosts.length) {
      console.error(`\n${ghosts.length} researched key(s) match no brand — nothing written:\n`);
      for (const g of ghosts.slice(0, 20)) console.error('  ' + g);
      process.exit(1);
    }
  }

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
