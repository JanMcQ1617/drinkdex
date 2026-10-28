import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Icon } from '@/components/icons';
import { Button } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { formatCount } from '@/data';
import { type DrinkPlace, placeHref, placesSupported } from '@/lib/places';
import { useAuth } from '@/store/auth';
import { usePlaces } from '@/store/places';
import { useSocial } from '@/store/social';

/* ==================================================================== */
/* Where people have had it (specs/v4.8-places 3.5)                     */
/*                                                                      */
/* The drink page's last section: the places people have tagged their   */
/* photos of this drink at, so someone reading the spec also knows      */
/* where they can try one. A fact about each time it was had, never a   */
/* recommendation: there are no deals, prices, hours or "best bars"     */
/* here, and nothing says to go (App Store 1.4.3).                      */
/*                                                                      */
/* THE ORDER IS NEVER HOW MANY. Places where someone you follow posted */
/* it first, then the most recent: the server's order (drink_places),   */
/* kept as it comes. The people count is shown beside a place but never */
/* ranks it, so the list cannot read as a chart of bars (spec 0.2 #2).  */
/*                                                                      */
/* NO DISTANCE, AND NO LOCATION AT ALL (the licence rework, §0.5).      */
/* Sipply's server keeps only each photo's Apple Place ID and its       */
/* poster's label, never a position, so there is nothing to measure a   */
/* distance to without asking Apple about every row, and this section   */
/* never asks for, or reads, where the phone is. Each row is the label  */
/* people gave the place and who posted there; the place's page asks    */
/* Apple for its address and map, one place at a time.                  */
/*                                                                      */
/* "LESS STUFF". Nothing at all until there is something to say:        */
/* signed out, without migration 026, while loading, on a failure, or   */
/* with no places, the section draws nothing. It is the page's last     */
/* section, so appearing late moves nothing above it. Three rows at     */
/* rest; the rest behind "Show N more", up to twenty.                   */
/* ==================================================================== */

/** Rows at rest, and the most "Show more" opens to. */
const AT_REST = 3;
const MOST = 20;
const ROW_H = 56;
const PIN = 20;
const CHEVRON = 18;
/** Above this text size the place's name may take a second line. */
const WRAP_SCALE = 1.3;

/**
 * Who posted it there, in people, never amounts: "3 people", "1 person";
 * with someone you follow among them, "Someone you follow" (just them) or
 * "3 people, including someone you follow". The server says whether, not
 * how many, so the words never claim a number they were not given.
 */
function whoLine(people: number, followed: boolean): string {
  if (followed && people <= 1) return 'Someone you follow';
  const n = people === 1 ? '1 person' : `${formatCount(people)} people`;
  return followed ? `${n}, including someone you follow` : n;
}

export function WherePeopleHadIt({ drinkId }: { drinkId: string }) {
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id);
  const entry = usePlaces((s) => s.byDrink[drinkId]);
  const loadDrink = usePlaces((s) => s.loadDrink);
  const { fontScale } = useWindowDimensions();

  // Opened by "Show N more"; a new visit starts at three again.
  const [open, setOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!myId || !placesSupported()) return;
      void loadDrink(drinkId);
      return () => {
        setOpen(false);
      };
    }, [drinkId, loadDrink, myId]),
  );

  /*
   * A post written from this very page (the post sheet's Save & post) or a
   * place added or removed on a post while it is open: the rows again,
   * quietly, so a bar tagged a moment ago shows here without leaving and
   * coming back. Focus covers every other way back to the page; these two
   * counters only move on a write that succeeded. The first render's
   * values are the baseline, not a change.
   */
  const postsVersion = useSocial((s) => s.postsVersion);
  const placesVersion = useSocial((s) => s.placesVersion);
  const seen = useRef({ postsVersion, placesVersion });
  useEffect(() => {
    const was = seen.current;
    if (was.postsVersion === postsVersion && was.placesVersion === placesVersion) return;
    seen.current = { postsVersion, placesVersion };
    if (myId && placesSupported()) void loadDrink(drinkId);
  }, [drinkId, loadDrink, myId, placesVersion, postsVersion]);

  const rows = entry?.data ?? [];

  if (!myId || !placesSupported() || !entry || entry.state !== 'ready' || rows.length === 0) return null;

  const capped = rows.slice(0, MOST);
  const shown = open ? capped : capped.slice(0, AT_REST);
  const more = capped.length - shown.length;
  const wraps = fontScale > WRAP_SCALE;

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[textRole.bodyStrong, styles.ink]}>
        Where people have had it
      </Text>
      <View>
        {shown.map((row) => (
          <PlaceLine
            key={row.place.appleId}
            row={row}
            wraps={wraps}
            onPress={() => router.push(placeHref(row.place.appleId))}
          />
        ))}
      </View>
      {more > 0 ? (
        <Button
          label={`Show ${more} more`}
          variant="text"
          size="sm"
          onPress={() => setOpen(true)}
          accessibilityHint="Lists more places in place"
          style={styles.more}
        />
      ) : null}
    </View>
  );
}

/**
 * One place: the pin, the label people gave it over "3 people, including
 * someone you follow", and a chevron. No separators, as Friends who logged
 * it has none. Opens the place's page.
 */
const PlaceLine = React.memo(function PlaceLine({
  row,
  wraps,
  onPress,
}: {
  row: DrinkPlace;
  wraps: boolean;
  onPress: () => void;
}) {
  const { place, people, followed } = row;
  const meta = whoLine(people, followed);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${place.label}, ${meta}`}
      accessibilityHint="Opens the place"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Icon name="pin" size={PIN} color={colors.textMuted} />
      <View style={styles.rowText}>
        <Text numberOfLines={wraps ? 2 : 1} style={[textRole.body, styles.ink]}>
          {place.label}
        </Text>
        <Text style={[textRole.small, styles.muted]}>{meta}</Text>
      </View>
      <Icon name="chevronRight" size={CHEVRON} color={colors.textMuted} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  /* DrinkPanels' Section: 32 of air above, the head 12 over its content. */
  section: { marginTop: layout.section, paddingHorizontal: layout.gutter, gap: space.md },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },
  /* Friends who logged it's press. */
  pressed: { opacity: 0.6 },
  /* 56 at the least, growing with the text: the pin, the words 12 after it, the chevron on the far gutter. */
  row: { minHeight: ROW_H, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  rowText: { flex: 1 },
  /* The small text key's own inset (8) taken back, so "Show 4 more" starts on the gutter. */
  more: { alignSelf: 'flex-start', marginLeft: -space.sm },
});
