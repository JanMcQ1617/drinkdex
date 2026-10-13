import { useSegments } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useScreenReader } from '@/components/onboarding/motion';
import { announce } from '@/components/ui';
import { layout, motion, space } from '@/constants/theme';
import { type SavedThing, useCollections, useCollectionsOn } from '@/store/collections';

import { SaveBar } from './SaveBar';
import { SaveSheet } from './SaveSheet';

/* ==================================================================== */
/* The save bar and the save sheet, over the whole app                  */
/*                                                                      */
/* Mounted once in the root layout, after the Stack, so a bookmark in   */
/* any list (Home's feed, a profile's post, the drink page) only tells  */
/* store/collections what it saved, and this draws the rest. Nothing    */
/* here draws while collections are off (signed out, or before 023):    */
/* the store never holds a bar or a sheet then, and the guard below     */
/* makes sure.                                                          */
/*                                                                      */
/* THE BAR'S CLOCK IS JS: 4s, or 10s while VoiceOver runs so it is read */
/* before it goes (spec §4.2), restarted by every new save. Its leaving */
/* is a 140ms fade and a JS-timed unmount (SaveBar says why).           */
/*                                                                      */
/* WHERE: 12pt above the tab bar on a tab, 12pt above the home          */
/* indicator on a pushed screen, read from the route, so a bar that is  */
/* up while a drink page pushes moves to the new foot with it.          */
/* ==================================================================== */

const SHOW_MS = 4000;
const SHOW_MS_SCREEN_READER = 10_000;
/** Between the bar and what it stands on. */
const LIFT = space.md;

export function CollectionsHost() {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const on = useCollectionsOn();
  const bar = useCollections((s) => s.bar);
  const sheet = useCollections((s) => s.sheet);
  const hideBar = useCollections((s) => s.hideBar);
  const openSheet = useCollections((s) => s.openSheet);
  const closeSheet = useCollections((s) => s.closeSheet);
  const screenReader = useScreenReader();

  /*
   * The bar last shown, kept through its fade once the store has let it
   * go; and the sheet's thing, kept through the sheet's own fade so it
   * leaves showing what it showed.
   */
  const [shown, setShown] = useState<{ thing: SavedThing; n: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [sheetThing, setSheetThing] = useState<SavedThing | null>(null);
  if (bar && bar !== shown) {
    setShown(bar);
    setLeaving(false);
  } else if (!bar && shown && !leaving) {
    setLeaving(true);
  }
  if (sheet && sheet.thing !== sheetThing) setSheetThing(sheet.thing);

  // Up for its time, then let go; a new save (a new n) starts the count again.
  const n = bar?.n;
  useEffect(() => {
    if (n === undefined) return;
    announce('Saved. Save to collection, button');
    const id = setTimeout(() => hideBar(n), screenReader ? SHOW_MS_SCREEN_READER : SHOW_MS);
    return () => clearTimeout(id);
  }, [n, screenReader, hideBar]);

  // The fade's end, on a JS clock.
  useEffect(() => {
    if (!leaving) return;
    const id = setTimeout(() => {
      setShown(null);
      setLeaving(false);
    }, motion.exit);
    return () => clearTimeout(id);
  }, [leaving]);

  const onTab = segments[0] === '(tabs)';
  const bottom = insets.bottom + (onTab ? layout.tabBar : 0) + LIFT;

  return (
    <>
      {shown && on ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <SaveBar
            key={shown.n}
            thing={shown.thing}
            n={shown.n}
            leaving={leaving}
            bottom={bottom}
            onOpen={() => openSheet(shown.thing)}
            onDismiss={() => hideBar(shown.n)}
          />
        </View>
      ) : null}
      <SaveSheet thing={sheetThing} visible={!!sheet && on} onClose={closeSheet} />
    </>
  );
}
