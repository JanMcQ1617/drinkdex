import type {
  AtlasCountry,
  AtlasGrape,
  AtlasWine,
  WineAtlas,
  WineStyle,
} from '@/types';

import raw from './wineAtlas.json';

/**
 * The wine atlas — reference, not collection.
 *
 * The Dex is 460 hand-authored cards you collect. This is the map behind
 * them: every named wine (appellation, protected denomination or classic
 * style) and every grape variety those wines are made from. Nothing here
 * is collectible and nothing here carries a dex number.
 *
 * Grape synonyms are already merged upstream by
 * scripts/build-wine-atlas.mjs, so Syrah and Shiraz are one variety, as are
 * Tempranillo, Tinta Roriz, Aragonez, Tinto Fino, Cencibel and Tinta de Toro.
 */
export const ATLAS = raw as unknown as WineAtlas;

export const ATLAS_WINES: AtlasWine[] = ATLAS.wines;
export const ATLAS_COUNTRIES: AtlasCountry[] = ATLAS.countries;
export const ATLAS_GRAPES: AtlasGrape[] = ATLAS.grapes;
export const ATLAS_COUNTS = ATLAS.counts;

export const countryNameOf = (w: AtlasWine): string => ATLAS_COUNTRIES[w.c].name;
export const grapeNamesOf = (w: AtlasWine): string[] => w.g.map((i) => ATLAS_GRAPES[i].name);

/**
 * Style families, as someone actually filters. Deliberately overlapping — a
 * Sparkling Red belongs under both Red and Sparkling, and asking a drinker to
 * pick one would be the wrong question.
 */
export const STYLE_FAMILIES: Record<string, WineStyle[]> = {
  Red: ['Red', 'Sweet Red', 'Sparkling Red'],
  White: ['White', 'Sweet White', 'Vin Jaune'],
  Rosé: ['Rosé', 'Sparkling Rosé', 'Sweet Rosé'],
  Sparkling: ['Sparkling', 'Sparkling Red', 'Sparkling Rosé'],
  Sweet: ['Sweet White', 'Sweet Red', 'Sweet Rosé'],
  Fortified: ['Fortified'],
  Orange: ['Orange'],
};

export const STYLE_FAMILY_ORDER = Object.keys(STYLE_FAMILIES);

/** Strip accents so "cote" finds Côte-Rôtie and "echezeaux" finds Échézeaux. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u0111\u00f0\u00f8\u0142\u00e6\u0153\u00df\u00fe\u0131]/g, (c) => FOLD_EXTRA[c] ?? c);
}

const FOLD_EXTRA: Record<string, string> = {
  đ: 'd', ð: 'd', ø: 'o', ł: 'l', æ: 'ae', œ: 'oe', ß: 'ss', þ: 'th', ı: 'i',
};

/**
 * Search text per wine, precomputed once.
 *
 * Includes every synonym of every grape, so searching "shiraz" returns the
 * Rhône alongside the Barossa — the same 155 wines "syrah" returns. A drinker
 * who knows one name should not get a smaller world than one who knows both.
 */
const WINE_HAYSTACK: string[] = ATLAS_WINES.map((w) => {
  const names = new Set<string>();
  for (const gi of w.g) {
    const g = ATLAS_GRAPES[gi];
    names.add(g.name);
    for (const s of g.synonyms) names.add(s);
  }
  return fold(
    [w.n, ATLAS_COUNTRIES[w.c].name, w.r, w.t, w.s, ...names].join(' ')
  );
});

const GRAPE_HAYSTACK: string[] = ATLAS_GRAPES.map((g) =>
  fold([g.name, g.origin, g.note, ...g.synonyms].join(' '))
);

export interface WineQuery {
  /** Free text. Matches name, country, region, tier, style and any grape synonym. */
  term?: string;
  /** A key of STYLE_FAMILIES. */
  family?: string | null;
  /** Restrict to one country. */
  country?: string | null;
  /** Restrict to wines citing this grape index. */
  grape?: number | null;
}

/** Indices into ATLAS_WINES, in atlas order. */
export function queryWines({ term, family, country, grape }: WineQuery = {}): number[] {
  const t = term ? fold(term.trim()) : '';
  const styles = family ? STYLE_FAMILIES[family] : null;
  const ci = country ? ATLAS_COUNTRIES.findIndex((c) => c.name === country) : -1;
  const out: number[] = [];
  for (let i = 0; i < ATLAS_WINES.length; i++) {
    const w = ATLAS_WINES[i];
    if (styles && !styles.includes(w.s)) continue;
    if (ci >= 0 && w.c !== ci) continue;
    if (grape != null && !w.g.includes(grape)) continue;
    if (t && !WINE_HAYSTACK[i].includes(t)) continue;
    out.push(i);
  }
  return out;
}

/** Indices into ATLAS_GRAPES. */
export function queryGrapes(term?: string, color?: string | null): number[] {
  const t = term ? fold(term.trim()) : '';
  const out: number[] = [];
  for (let i = 0; i < ATLAS_GRAPES.length; i++) {
    if (color && ATLAS_GRAPES[i].color !== color) continue;
    if (t && !GRAPE_HAYSTACK[i].includes(t)) continue;
    out.push(i);
  }
  return out;
}

/** Group wine indices by country, preserving atlas order. */
export function groupByCountry(indices: number[]): { country: AtlasCountry; wines: number[] }[] {
  const groups: { country: AtlasCountry; wines: number[] }[] = [];
  let current = -1;
  for (const i of indices) {
    const c = ATLAS_WINES[i].c;
    if (c !== current) {
      current = c;
      groups.push({ country: ATLAS_COUNTRIES[c], wines: [] });
    }
    groups[groups.length - 1].wines.push(i);
  }
  return groups;
}

/** Alphabetical across all countries, for the A–Z index. */
export const ALPHABETICAL: number[] = ATLAS_WINES.map((_, i) => i).sort((a, b) =>
  fold(ATLAS_WINES[a].n) < fold(ATLAS_WINES[b].n) ? -1 : 1
);
