import { formatCount } from '@/data';
import {
  coveredBy,
  familiar,
  genericOf,
  type Ingredient,
  inSentence,
  isGeneric,
  type Match,
  type Shelf,
  SHELF_LABEL,
} from '@/lib/bar';

/* ==================================================================== */
/* What My Bar says, worked out from your bar                           */
/*                                                                      */
/* The words the screen and its sheets share, kept as pure functions so */
/* a row in the add field, a picker and the Next bottle sheet say a     */
/* thing the same way. No ranking lives here (src/lib/bar.ts has the    */
/* one ranked list): only copy.                                         */
/* ==================================================================== */

/** "+10", "−5" (U+2212), or null for no change: the payoff key's last change. */
export function signed(n: number | null): string | null {
  if (!n) return null;
  return n > 0 ? `+${formatCount(n)}` : `−${formatCount(-n)}`;
}

/** "1 drink", "31 drinks". */
export function drinks(n: number): string {
  return `${formatCount(n)} ${n === 1 ? 'drink' : 'drinks'}`;
}

/** "1 thing", "3 things": a shelf head's count, for VoiceOver. */
export function things(n: number): string {
  return `${formatCount(n)} ${n === 1 ? 'thing' : 'things'}`;
}

/** First letter down, for a name used mid-sentence ("Same as lime juice"). */
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * The small muted line under an ingredient row, only when it explains the
 * row (shelves spec 4.4, the setup judge's copy):
 *
 *   a generic       "Any whiskey", "Any whiskey · covered by your bourbon"
 *   a brand typed   "Cointreau is a triple sec"
 *   a spelling      "Same as lime juice"
 *   another shelf   "On Liqueurs & vermouth" (a shelf picker's search only)
 *
 * Null when the label says it all, which is most rows.
 */
export function rowNote(
  i: Ingredient,
  owned: Readonly<Record<string, unknown>>,
  { alias, pickerShelf }: { alias?: string; pickerShelf?: Shelf } = {},
): string | null {
  const parts: string[] = [];
  if (isGeneric(i.id)) {
    const cover = coveredBy(i.id, owned);
    parts.push(`Any ${inSentence(i)}${cover ? ` · covered by your ${inSentence(cover)}` : ''}`);
  }
  if (alias) {
    parts.push(
      i.brands?.includes(alias) && i.kind
        ? `${alias} is ${i.kind}`
        : `Same as ${i.proper ? alias : lowerFirst(alias)}`,
    );
  }
  if (pickerShelf && i.shelf !== pickerShelf) parts.push(`On ${SHELF_LABEL[i.shelf]}`);
  return parts.length ? parts.join(' · ') : null;
}

/** A family member's quiet line on its sheet: "Counts as any rum, too". */
export function familyNote(i: Ingredient): string | null {
  const generic = genericOf(i.id);
  return generic ? `Counts as any ${inSentence(generic)}, too` : null;
}

/**
 * A Next bottle row's line: "10 more, like Martini and Clarito". The two
 * named are the drinks it completes that people know best, photographed
 * first, then by Dex number.
 */
export function likeLine(matches: readonly Match[]): string {
  const n = matches.length;
  if (!n) return 'Nothing more for now';
  const named = matches.map((m) => m.drink).sort(familiar).slice(0, 2).map((d) => d.name);
  if (n === 1) return `1 more: ${named[0]}`;
  return `${formatCount(n)} more, like ${named.join(' and ')}`;
}

/**
 * VoiceOver's row: "Dry vermouth, not in your bar, adds 10 drinks" (the
 * shelves spec's wording), "Dry vermouth, in your bar".
 */
export function rowLabel(i: Ingredient, on: boolean, gain: number, note: string | null): string {
  return [
    i.label,
    on ? 'in your bar' : 'not in your bar',
    !on && gain > 0 ? `adds ${drinks(gain)}` : null,
    note,
  ]
    .filter(Boolean)
    .join(', ');
}
