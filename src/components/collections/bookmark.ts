import type { AccessibilityActionEvent, AccessibilityActionInfo } from 'react-native';
import { Alert } from 'react-native';

import type { ItemRef } from '@/lib/collections';
import { collectionsHolding, collectionsOn, useCollections } from '@/store/collections';
import { useTaste } from '@/store/taste';

/* ==================================================================== */
/* What every bookmark shares (spec §4.1, §4.2; Decided 4)              */
/*                                                                      */
/* The bookmarks stay where they are and keep their own save paths:     */
/* useTaste's toggle for a drink (the drink page, the first picks), the */
/* social store's toggleSave for a post (the action row, the post's     */
/* •••). Collections add two things on top, and both live here so the   */
/* four bookmarks say them the same way:                                */
/*                                                                      */
/*   UNSAVE ASKS FIRST when the thing is in a collection, because the   */
/*   unsave takes it out of every one (in a collection ⇒ saved). One    */
/*   Alert, "Remove from All saved? It is also in Sunday sours and      */
/*   Fruity.", Unsave or Cancel. Not in any: no question, as build 23.  */
/*   HOLDING A BOOKMARK saves (if it is not saved) and opens the        */
/*   save-to-collection sheet; VoiceOver gets the same as a custom      */
/*   action. Only while collections are on (store/collections): signed */
/*   out or before 023 there is no long press, so a held bookmark is a  */
/*   tap, as it was.                                                    */
/* ==================================================================== */

/** "Sunday sours", "Sunday sours and Fruity", "A, B and C", "A, B and 3 more". */
export function namesLine(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

/**
 * Before any unsave. When the thing is in one or more of your collections
 * it asks first; otherwise `unsave` runs at once. `unsave` is the call
 * site's own path. A post's resolves false when the write failed, and the
 * post then keeps its collections; anything else counts as done.
 *
 * Once it has gone, the thing leaves every collection on this phone at
 * once, and a drink on the server too (its unsave is pushed on a
 * debounce; a post's lands now, and 023's trigger on saves follows it).
 *
 * A save bar still up for this thing goes with the unsave: its Save to
 * collection would otherwise put something that is no longer saved into
 * a collection, and the bar never shows on an unsave (spec §4.2).
 */
export function confirmUnsave(ref: ItemRef, unsave: () => unknown): void {
  const holding = collectionsOn() ? collectionsHolding(ref) : [];
  const run = () => {
    const bar = useCollections.getState().bar;
    if (bar && bar.thing.kind === ref.kind && bar.thing.id === ref.id) useCollections.getState().hideBar(bar.n);
    const done = unsave();
    const forget = (ok: unknown) => {
      if (ok !== false && holding.length > 0) useCollections.getState().forget(ref, ref.kind === 'drink');
    };
    if (done instanceof Promise) void done.then(forget, () => undefined);
    else forget(done);
  };
  if (holding.length === 0) {
    run();
    return;
  }
  Alert.alert('Remove from All saved?', `It is also in ${namesLine(holding.map((c) => c.name))}.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Unsave', style: 'destructive', onPress: run },
  ]);
}

/**
 * Saves a drink for a long press, if it is not saved already. False when
 * Saved is full (200), which the caller says; true when it is saved now.
 */
export function ensureDrinkSaved(id: string): boolean {
  const taste = useTaste.getState();
  if (taste.saved.includes(id)) return true;
  return taste.toggleSaved(id);
}

/** The custom action every bookmark carries while collections are on. */
export const SAVE_TO_COLLECTION: readonly AccessibilityActionInfo[] = [
  { name: 'saveToCollection', label: 'Save to collection' },
];

/** Runs `then` for the Save to collection custom action. */
export const onSaveToCollectionAction = (then: () => void) => (e: AccessibilityActionEvent) => {
  if (e.nativeEvent.actionName === 'saveToCollection') then();
};
