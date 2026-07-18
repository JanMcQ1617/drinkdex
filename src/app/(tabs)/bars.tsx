import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '@/constants/theme';

/* ------------------------------------------------------------------ */
/* Data plumbing — free, keyless sources                               */
/*   ZIP -> lat/lon: api.zippopotam.us (covers PR ZIPs under /us/)     */
/*   nearby bars:    OpenStreetMap Overpass API                        */
/* ------------------------------------------------------------------ */

interface Bar {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lon: number;
  address?: string;
  hours?: string;
  distanceMi: number;
}

const KIND_LABEL: Record<string, string> = {
  bar: 'Bar',
  pub: 'Pub',
  biergarten: 'Beer garden',
  nightclub: 'Nightclub',
};

const KIND_EMOJI: Record<string, string> = {
  bar: '🍸',
  pub: '🍺',
  biergarten: '🍻',
  nightclub: '🪩',
};

const SEARCH_RADIUS_M = 8000;

function haversineMi(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeZip(zip: string): Promise<{ lat: number; lon: number; place: string }> {
  // Mainland ZIPs live under /us/; Puerto Rico's are filed under /pr/.
  let res = await fetch(`https://api.zippopotam.us/us/${zip}`);
  if (!res.ok) res = await fetch(`https://api.zippopotam.us/pr/${zip}`);
  if (!res.ok) throw new Error('zip-not-found');
  const data = await res.json();
  const p = data.places?.[0];
  if (!p) throw new Error('zip-not-found');
  const region = p['state abbreviation'] || data['country abbreviation'] || '';
  return {
    lat: parseFloat(p.latitude),
    lon: parseFloat(p.longitude),
    place: region ? `${p['place name']}, ${region}` : p['place name'],
  };
}

async function fetchBars(lat: number, lon: number): Promise<Bar[]> {
  const query = `[out:json][timeout:25];(
    node["amenity"~"^(bar|pub|biergarten|nightclub)$"](around:${SEARCH_RADIUS_M},${lat},${lon});
    way["amenity"~"^(bar|pub|biergarten|nightclub)$"](around:${SEARCH_RADIUS_M},${lat},${lon});
  );out center 60;`;
  // The public Overpass instances rate-limit under load; walk the mirrors.
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: { elements?: any[] } | null = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) continue;
      data = await res.json(); // non-JSON error pages throw -> next mirror
      break;
    } catch {
      // try the next mirror
    }
  }
  if (!data) throw new Error('overpass-failed');
  const seen = new Set<string>();
  const bars: Bar[] = [];
  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {};
    if (!tags.name) continue;
    const bLat = el.lat ?? el.center?.lat;
    const bLon = el.lon ?? el.center?.lon;
    if (bLat == null || bLon == null) continue;
    const key = tags.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
    const address = [street, tags['addr:city']].filter(Boolean).join(', ') || undefined;
    bars.push({
      id: `${el.type}-${el.id}`,
      name: tags.name,
      kind: tags.amenity,
      lat: bLat,
      lon: bLon,
      address,
      hours: tags.opening_hours,
      distanceMi: haversineMi(lat, lon, bLat, bLon),
    });
  }
  return bars.sort((a, b) => a.distanceMi - b.distanceMi);
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

type Status = 'idle' | 'loading' | 'error' | 'done';

export default function BarsScreen() {
  const insets = useSafeAreaInsets();
  const [zip, setZip] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [place, setPlace] = useState('');
  const [bars, setBars] = useState<Bar[]>([]);

  const search = useCallback(async () => {
    const cleaned = zip.trim();
    if (!/^\d{5}$/.test(cleaned)) {
      setStatus('error');
      setErrorMsg('Enter a 5-digit ZIP / area code.');
      return;
    }
    Keyboard.dismiss();
    setStatus('loading');
    setErrorMsg('');
    try {
      const geo = await geocodeZip(cleaned);
      setPlace(geo.place);
      const found = await fetchBars(geo.lat, geo.lon);
      setBars(found);
      setStatus('done');
    } catch (e) {
      setStatus('error');
      setErrorMsg(
        e instanceof Error && e.message === 'zip-not-found'
          ? "Couldn't find that ZIP code. Double-check it?"
          : 'The bar map is not answering right now. Try again in a minute.'
      );
    }
  }, [zip]);

  const openMaps = useCallback((bar: Bar) => {
    const q = encodeURIComponent(bar.name);
    Linking.openURL(`https://maps.apple.com/?q=${q}&ll=${bar.lat},${bar.lon}`).catch(() => {});
  }, []);

  const renderBar = useCallback(
    ({ item }: { item: Bar }) => (
      <Pressable
        onPress={() => openMaps(item)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.name} in Maps`}
        style={({ pressed }) => [styles.barCard, pressed && styles.pressed]}
      >
        <View style={styles.barEmojiWrap}>
          <Text style={styles.barEmoji}>{KIND_EMOJI[item.kind] ?? '🍸'}</Text>
        </View>
        <View style={styles.barBody}>
          <Text style={styles.barName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.barMeta} numberOfLines={1}>
            {KIND_LABEL[item.kind] ?? 'Bar'}
            {item.address ? ` · ${item.address}` : ''}
          </Text>
          {item.hours ? (
            <Text style={styles.barHours} numberOfLines={1}>
              {item.hours}
            </Text>
          ) : null}
        </View>
        <Text style={styles.barDistance}>
          {item.distanceMi < 0.2 ? '<0.2' : item.distanceMi.toFixed(1)} mi
        </Text>
      </Pressable>
    ),
    [openMaps]
  );

  return (
    <FlatList
      data={status === 'done' ? bars : []}
      renderItem={renderBar}
      keyExtractor={(bar) => bar.id}
      style={styles.screen}
      contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 12 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View>
          <Text style={styles.header}>Bars near you</Text>
          <Text style={styles.sub}>
            Drop your area code and Clink pulls every bar, pub, and beer garden within five miles.
          </Text>
          <View style={styles.searchRow}>
            <TextInput
              value={zip}
              onChangeText={setZip}
              placeholder="ZIP · e.g. 00901"
              placeholderTextColor={colors.textFaint}
              keyboardType="number-pad"
              maxLength={5}
              returnKeyType="search"
              onSubmitEditing={search}
              style={styles.zipInput}
              accessibilityLabel="Area code"
            />
            <Pressable
              onPress={search}
              disabled={status === 'loading'}
              accessibilityRole="button"
              accessibilityLabel="Search bars"
              style={({ pressed }) => [
                styles.searchBtn,
                pressed && styles.pressed,
                status === 'loading' && { opacity: 0.5 },
              ]}
            >
              <Text style={styles.searchBtnText}>Scout</Text>
            </Pressable>
          </View>

          {status === 'loading' && (
            <View style={styles.stateWrap}>
              <ActivityIndicator color={colors.gold} />
              <Text style={styles.stateText}>Scouting the neighborhood…</Text>
            </View>
          )}
          {status === 'error' && (
            <View style={styles.stateWrap}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}
          {status === 'done' && (
            <Text style={styles.resultLine}>
              <Text style={styles.resultCount}>{bars.length}</Text> spots near {place}
            </Text>
          )}
        </View>
      }
      ListEmptyComponent={
        status === 'done' ? (
          <View style={styles.stateWrap}>
            <Text style={styles.stateText}>
              Nothing mapped within five miles of that ZIP. Frontier territory — go log something
              legendary.
            </Text>
          </View>
        ) : null
      }
      ListFooterComponent={
        status === 'done' && bars.length > 0 ? (
          <Text style={styles.attribution}>Bar data © OpenStreetMap contributors</Text>
        ) : null
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 10,
  },
  pressed: {
    opacity: 0.72,
  },
  header: {
    fontFamily: fonts.displayBold,
    fontSize: 28,
    color: colors.text,
  },
  sub: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
    marginTop: 6,
    marginBottom: 16,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  zipInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    letterSpacing: 2,
    color: colors.text,
    minHeight: 48,
  },
  searchBtn: {
    backgroundColor: colors.gold,
    borderRadius: 12,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  searchBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.bg,
  },
  stateWrap: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  stateText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.danger,
    textAlign: 'center',
  },
  resultLine: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 10,
    marginBottom: 4,
  },
  resultCount: {
    fontFamily: fonts.bodySemiBold,
    color: colors.text,
  },

  /* Bar cards */
  barCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    padding: 14,
  },
  barEmojiWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barEmoji: {
    fontSize: 20,
  },
  barBody: {
    flex: 1,
    gap: 2,
  },
  barName: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: colors.text,
  },
  barMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  barHours: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textFaint,
  },
  barDistance: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.gold,
    fontVariant: ['tabular-nums'],
  },
  attribution: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: 16,
  },
});
