import { LABEL_SPLIT_AT, lookOf, type Look, shelfOf, shelfRank, type ShelfKey, SHELF_ORDER } from '@/data/barShelf';
import { INGREDIENTS_BY_ID, reachOf, type Ingredient } from '@/lib/bar';
import { textWidth } from '@/lib/textFit';

import { artSize } from './BottleArt';

/* ==================================================================== */
/* Laying out the back bar                                              */
/*                                                                      */
/* Bays are packed into planks in JS from worked-out widths (lib/       */
/* textFit.ts, the estimate DrinkName uses), never from onLayout, so    */
/* the first frame is the final one. A full shelf starts another plank, */
/* so a larger text size adds planks instead of clipping a label.       */
/* ==================================================================== */

/** Dynamic Type cap on the shelf labels. VoiceOver still reads the whole name. */
export const TAG_CAP = 1.3;
/** Shelf label type (textRole.statusWord, 12/16). */
const TAG_SIZE = 12;
const TAG_LINE = 16;
/** A tag's padding and edges, each side. */
const TAG_CHROME = 2 * 5 + 2;
/** A label never wider than this before it wraps (a long name breaks between words). */
const TAG_MEASURE = 92;
/** The narrowest bay: two bays of fruit still read as two things. */
const BAY_MIN = 48;
/** Gutter inside the band, each side. */
export const SHELF_INSET = 12;
/** Air between bays at the tightest. */
const BAY_GAP = 2;
/** At most this many planks before the bar folds behind "Show all". */
export const FOLD_AFTER = 3;

export interface BayModel {
  id: string;
  ingredient: Ingredient;
  look: Look;
  owned: boolean;
  /** The label, broken where it wraps. */
  lines: string[];
  /** A ghost at a shelf's end: what it would pour, written under its name. */
  pours?: number;
  /** What it would pour, for VoiceOver, on any ghost. */
  gain: number;
  width: number;
  artH: number;
  /** The caption's height, reserved so the overflow-safe caption box takes its room. */
  captionH: number;
}

export interface PlankModel {
  bays: BayModel[];
  /** The stand above the plank: the tallest bottle on it. */
  zone: number;
}

export interface ShelfModel {
  key: ShelfKey;
  planks: PlankModel[];
  /** Owned things on this shelf, drawn or folded away. */
  owned: number;
}

/**
 * A label in lines. One line unless it is two words of ten letters or
 * more ("Rye / whiskey"); longer names break greedily between words at
 * TAG_MEASURE, so no line is ever narrower than its widest word and iOS
 * never has to break inside one.
 */
export function labelLines(label: string, scale: number): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length < 2 || label.length < LABEL_SPLIT_AT) return [label];
  if (words.length === 2) return words;
  const size = TAG_SIZE * scale;
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && textWidth(next, 'inter', size) > TAG_MEASURE * scale) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/*
 * PACKING, NOT FITTING. textFit's estimate never falls short of a real
 * advance, and for Inter runs about a fifth wide, which at full width put
 * a sixteen-bottle bar on six planks. Bays are packed at PACK of it; the
 * caption itself hangs in a box wider than its bay (BackBar's `caption`),
 * so a label whose real width lands past its share overlaps the air
 * between bays and never wraps inside a word.
 */
const PACK = 0.86;

/** A caption's width for packing: the widest line, and on a ghost its "+N drinks". */
function captionWidth(lines: string[], pours: number | undefined, owned: boolean, scale: number): number {
  const size = TAG_SIZE * scale;
  let widest = 0;
  for (const l of lines) widest = Math.max(widest, textWidth(l, 'inter', size));
  if (pours != null) widest = Math.max(widest, textWidth(`+${pours} drinks`, 'inter', size));
  // Only an owned label is a tag, with padding and an edge; a ghost's name is bare.
  return widest * PACK + (owned ? TAG_CHROME : 0);
}

/** The caption's height: its lines (and "+N drinks"), and a tag's padding and edges. */
function captionHeight(lines: number, pours: boolean, owned: boolean, scale: number): number {
  const line = TAG_LINE * scale;
  return Math.ceil((lines + (pours ? 1 : 0)) * line + (owned ? 4 : 0));
}

/*
 * A BAY'S SIZE NEVER DEPENDS ON ITS STATE. Tapping a bottle swaps its tag
 * for its ghost name and "+N drinks" (or back), and the two captions differ
 * in width and height; sized by the one showing, a tap would nudge its
 * neighbours along the plank, or wrap one onto the next. So every bay
 * reserves the larger of both captions ("+88 drinks" for the count, which
 * changes as the shelf does), and a tap changes what is drawn, never where.
 */
const RESERVE_POURS = 88;

/**
 * One bay. `canPour`: this bay says "+N drinks" when it is a ghost (a
 * shelf's end, as the mockup drew it). Any other ghost is a bare name, so
 * only those few bays reserve the wider caption; VoiceOver hears the
 * count on every ghost.
 */
export function makeBay(
  id: string,
  owned: boolean,
  pours: number | undefined,
  fontScale: number,
  canPour: boolean,
): BayModel | null {
  const ingredient = INGREDIENTS_BY_ID[id];
  if (!ingredient) return null;
  const scale = Math.min(fontScale, TAG_CAP);
  const look = lookOf(ingredient);
  const art = artSize(look);
  const lines = labelLines(ingredient.label, scale);
  // Only a ghost that would pour something says so ("+8 drinks").
  const says = canPour && !owned && pours ? pours : undefined;
  const reserve = canPour ? Math.max(RESERVE_POURS, pours ?? 0) : undefined;
  const width = Math.max(
    BAY_MIN,
    art.w + 2,
    captionWidth(lines, undefined, true, scale) + 2,
    captionWidth(lines, reserve, false, scale) + 2,
  );
  const captionH = Math.max(
    captionHeight(lines.length, false, true, scale),
    captionHeight(lines.length, canPour, false, scale),
  );
  return { id, ingredient, look, owned, lines, pours: says, gain: pours ?? 0, width, artH: art.h, captionH };
}

/** Bays into planks no wider than `room`, in order. */
function pack(bays: BayModel[], room: number): PlankModel[] {
  const planks: PlankModel[] = [];
  let row: BayModel[] = [];
  let used = 0;
  for (const bay of bays) {
    const need = bay.width + (row.length ? BAY_GAP : 0);
    if (row.length && used + need > room) {
      planks.push(plank(row));
      row = [];
      used = 0;
    }
    row.push(bay);
    used += row.length > 1 ? need : bay.width;
  }
  if (row.length) planks.push(plank(row));
  return planks;
}

function plank(bays: BayModel[]): PlankModel {
  // The art box carries 6pt of margin under the foot; the stand is the tallest bottle, plus air.
  const zone = Math.max(...bays.map((b) => b.artH)) + 2;
  // Every caption on a plank reserves the tallest one's room, so the plank's height is fixed too.
  const captionH = Math.max(...bays.map((b) => b.captionH));
  return { bays: bays.map((b) => (b.captionH === captionH ? b : { ...b, captionH })), zone };
}

/**
 * The shelves to draw. `order` is each shelf's bays as the snapshot left
 * them; `suggestion` the ghost at each shelf's end. Folded (more than
 * FOLD_AFTER planks and not opened), each shelf keeps the one plank that
 * holds its suggestion and as many bays as fit beside it; `hidden` says
 * how many owned things that put out of sight.
 */
export function layoutShelves({
  order,
  suggestion,
  owned,
  pours,
  width,
  fontScale,
  open,
}: {
  order: Record<ShelfKey, string[]>;
  suggestion: Record<ShelfKey, string | null>;
  owned: Record<string, true>;
  pours: (id: string) => number;
  width: number;
  fontScale: number;
  open: boolean;
}): { shelves: ShelfModel[]; hidden: number; folds: boolean } {
  const room = width - 2 * SHELF_INSET;
  const built = SHELF_ORDER.map((key) => {
    const ids = order[key];
    const tail = suggestion[key];
    const bays = ids
      .filter((id) => id !== tail)
      .map((id) => makeBay(id, !!owned[id], pours(id), fontScale, false))
      .filter((b): b is BayModel => !!b);
    const end = tail ? makeBay(tail, !!owned[tail], pours(tail), fontScale, true) : null;
    return { key, bays, end };
  });

  const full = built.map(({ key, bays, end }) => ({
    key,
    planks: pack(end ? [...bays, end] : bays, room),
    owned: bays.filter((b) => b.owned).length + (end?.owned ? 1 : 0),
  }));
  const planks = full.reduce((n, s) => n + s.planks.length, 0);
  const folds = planks > FOLD_AFTER;
  if (!folds || open) return { shelves: full.filter((s) => s.planks.length), hidden: 0, folds };

  let hidden = 0;
  const shelves = built.map(({ key, bays, end }, i) => {
    let used = end ? end.width : 0;
    const kept: BayModel[] = [];
    // In order, up to the first that does not fit: a fold never re-orders the shelf.
    for (const bay of bays) {
      const need = bay.width + (kept.length || end ? BAY_GAP : 0);
      if (used + need > room || kept.length < bays.indexOf(bay)) {
        if (bay.owned) hidden++;
        continue;
      }
      kept.push(bay);
      used += need;
    }
    const row = end ? [...kept, end] : kept;
    return { key, planks: row.length ? [plank(row)] : [], owned: full[i]!.owned };
  });
  return { shelves: shelves.filter((s) => s.planks.length), hidden, folds };
}

/** Each shelf's ids in standing order: family, then the most reach, then by name. */
export function sortForShelves(ids: Iterable<string>): Record<ShelfKey, string[]> {
  const out: Record<ShelfKey, string[]> = { spirits: [], middle: [], rail: [] };
  const items = [...ids].map((id) => INGREDIENTS_BY_ID[id]).filter((i): i is Ingredient => !!i);
  items.sort(
    (a, b) => shelfRank(a) - shelfRank(b) || reachOf(b.id) - reachOf(a.id) || a.label.localeCompare(b.label),
  );
  for (const i of items) out[shelfOf(i)].push(i.id);
  return out;
}
