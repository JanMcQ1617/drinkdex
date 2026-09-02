import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrinkArt } from '@/components/artwork';
import { Icon } from '@/components/icons';
import { Button, CategoryPill, EmptyState, PressableScale, haptic } from '@/components/ui';
import { colors, fonts, radius, space, type as typeScale } from '@/constants/theme';
import { DRINKS, formatDexNumber } from '@/data';
import { drinkPhoto } from '@/data/drinkPhotos';
import { persistPhoto, pickFromCamera, pickFromLibrary, type PickResult } from '@/lib/pour';
import { useAuth } from '@/store/auth';
import { useCollection } from '@/store/collection';
import { useSocial } from '@/store/social';
import type { Drink } from '@/types';

/* ==================================================================== */
/* Log a pour                                                           */
/*                                                                      */
/* The centre action's destination: photograph first, then say what it  */
/* was.                                                                 */
/*                                                                      */
/* That order is the whole point of this screen existing. Logging from  */
/* a Dex entry means you already know what you drank and have gone      */
/* looking for it — fine at home, useless at a bar with a glass in      */
/* front of you and no idea what the barman called it. Here the         */
/* photograph is the thing you can always take, and identifying it is a */
/* second step you can do at leisure.                                   */
/*                                                                      */
/* One screen, not a wizard. The two steps are short enough that paging */
/* between them would cost more than it organises, and keeping both     */
/* visible means the photo stays on screen while you search — which is  */
/* what you are looking at to work out what it was.                     */
/* ==================================================================== */

/** How many matches to render. The index is 7,653 entries deep. */
const MAX_RESULTS = 40;

function notice(r: Extract<PickResult, { ok: false; reason: 'denied' | 'error' }>) {
  Alert.alert(r.title, r.body);
}

/* -------------------------------------------------------------------- */

function DrinkRow({
  drink,
  selected,
  onPress,
}: {
  drink: Drink;
  selected: boolean;
  onPress: (d: Drink) => void;
}) {
  const photo = drinkPhoto(drink.id);
  return (
    <PressableScale
      onPress={() => onPress(drink)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${drink.name}, ${drink.subcategory}, ${formatDexNumber(drink.dexNumber)}`}
      style={[styles.row, selected && styles.rowSelected]}>
      <View style={styles.rowArt}>
        {photo ? (
          <Image source={photo} style={styles.rowPhoto} contentFit="cover" transition={120} />
        ) : (
          <DrinkArt drink={drink} size={34} flat />
        )}
      </View>

      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>
          {drink.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {[drink.subcategory, drink.origin].filter(Boolean).join(' · ')}
        </Text>
      </View>

      {selected ? (
        <View style={styles.check}>
          <Icon name="check" size={14} color={colors.textOnWine} />
        </View>
      ) : (
        <CategoryPill category={drink.category} />
      )}
    </PressableScale>
  );
}

/* -------------------------------------------------------------------- */

export default function LogPourScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const unlock = useCollection((s) => s.unlock);
  const addPost = useSocial((s) => s.addPost);
  const myId = useAuth((s) => s.session?.user.id);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [drink, setDrink] = useState<Drink | null>(null);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  /*
   * Nothing is listed until something is typed. A bare list of 7,653
   * entries in alphabetical order is not a starting point, it is a wall —
   * and the one thing the user reliably knows here is roughly what the
   * drink was called.
   */
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return [];
    const hits: Drink[] = [];
    for (const d of DRINKS) {
      if (
        d.name.toLowerCase().includes(q) ||
        d.subcategory.toLowerCase().includes(q) ||
        d.origin.toLowerCase().includes(q)
      ) {
        hits.push(d);
        // Stop at the cap rather than filtering the whole index and
        // slicing: at 7,653 entries a one-character query matches
        // thousands, and none past the first 40 are ever rendered.
        if (hits.length >= MAX_RESULTS) break;
      }
    }
    return hits;
  }, [query]);

  const takePhoto = useCallback(async () => {
    haptic.tap();
    const r = await pickFromCamera();
    if (r.ok) setPhotoUri(r.uri);
    else if (r.reason !== 'cancelled') notice(r);
  }, []);

  const choosePhoto = useCallback(async () => {
    haptic.tap();
    const r = await pickFromLibrary();
    if (r.ok) setPhotoUri(r.uri);
    else if (r.reason !== 'cancelled') notice(r);
  }, []);

  const selectDrink = useCallback((d: Drink) => {
    haptic.select();
    setDrink(d);
  }, []);

  const canSave = photoUri != null && drink != null && !busy;

  const save = useCallback(
    async (alsoPost: boolean) => {
      if (!photoUri || !drink || busy) return;
      setBusy(true);
      try {
        const uri = await persistPhoto(drink.id, photoUri);
        const trimmed = note.trim();

        unlock(drink.id, uri, trimmed.length > 0 ? trimmed : undefined);

        /*
         * Only the sharing half needs an account. The collection is local,
         * so a signed-out user still gets their entry — posting is the
         * part that silently no-ops rather than blocking the save.
         */
        if (alsoPost && myId) {
          await addPost(myId, drink.id, trimmed.length > 0 ? trimmed : 'Logged a new entry.', uri);
        }

        haptic.tap();
        router.back();
      } finally {
        setBusy(false);
      }
    },
    [photoUri, drink, busy, note, unlock, myId, addPost, router],
  );

  const header = (
    <View>
      {/* ---- The photograph ---- */}
      <Pressable
        onPress={photoUri ? choosePhoto : takePhoto}
        accessibilityRole="button"
        accessibilityLabel={photoUri ? 'Change the photo' : 'Take a photo of your pour'}
        style={styles.photoFrame}>
        {photoUri ? (
          <>
            <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" />
            <View style={styles.photoBadge}>
              <Icon name="camera" size={15} color={colors.textOnWine} />
              <Text style={styles.photoBadgeText}>Change</Text>
            </View>
          </>
        ) : (
          <View style={styles.photoEmpty}>
            <View style={styles.photoEmptyDisc}>
              <Icon name="camera" size={26} color={colors.textOnWine} />
            </View>
            <Text style={styles.photoEmptyTitle}>Photograph your pour</Text>
            <Text style={styles.photoEmptyBody}>
              You can work out what it was afterwards.
            </Text>
          </View>
        )}
      </Pressable>

      {/* A second, quieter route to the same slot — the camera is the
          primary action, but the drink is often already in your roll. */}
      <PressableScale
        onPress={choosePhoto}
        noHaptic
        accessibilityRole="button"
        style={styles.libraryLink}>
        <Text style={styles.libraryLinkText}>
          {photoUri ? 'Pick a different photo' : 'Choose from your library'}
        </Text>
      </PressableScale>

      {/* ---- What was it ---- */}
      <Text style={styles.sectionTitle}>What was it?</Text>

      <View style={styles.searchWrap}>
        <Icon name="search" size={17} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search 7,653 entries"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={styles.searchInput}
          accessibilityLabel="Search for the drink you had"
        />
        {query.length > 0 ? (
          <PressableScale
            onPress={() => setQuery('')}
            noHaptic
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={10}>
            <Icon name="close" size={16} color={colors.textMuted} />
          </PressableScale>
        ) : null}
      </View>

      {drink && query.trim().length === 0 ? (
        <DrinkRow drink={drink} selected onPress={selectDrink} />
      ) : null}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* ---- Bar ---- */}
      <View style={[styles.topBar, { paddingTop: insets.top + space.sm }]}>
        <PressableScale
          onPress={() => router.back()}
          noHaptic
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          hitSlop={10}
          style={styles.topBarSide}>
          <Text style={styles.cancel}>Cancel</Text>
        </PressableScale>

        <Text style={styles.topBarTitle}>Add a pour</Text>

        {/* Balances the title against Cancel without a second control. */}
        <View style={styles.topBarSide} />
      </View>

      <FlatList
        data={results}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => (
          <DrinkRow drink={item} selected={drink?.id === item.id} onPress={selectDrink} />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          query.trim().length > 0 ? (
            <EmptyState
              icon="search"
              title="Nothing by that name"
              body="Try the style or the place instead — “stout”, “rioja”, “oaxaca” all work."
            />
          ) : null
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, { paddingBottom: space.xxxl }]}
        showsVerticalScrollIndicator={false}
      />

      {/* ---- Save ---- */}
      <View style={[styles.saveBar, { paddingBottom: insets.bottom + space.md }]}>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Add a note (optional)"
          placeholderTextColor={colors.textMuted}
          style={styles.noteInput}
          accessibilityLabel="A note about this pour"
        />
        <View style={styles.saveRow}>
          <Button
            label="Save to Dex"
            variant="secondary"
            onPress={() => void save(false)}
            disabled={!canSave}
            style={styles.saveBtn}
          />
          <Button
            label={busy ? 'Saving…' : 'Save & post'}
            onPress={() => void save(true)}
            disabled={!canSave || !myId}
            style={styles.saveBtn}
          />
        </View>
        {/*
          Says why the second button is dead rather than leaving a disabled
          control with no explanation — the collection works signed out and
          only sharing does not.
        */}
        {!myId && photoUri && drink ? (
          <Text style={styles.saveHint}>Sign in to post. Saving to your Dex works either way.</Text>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

/* -------------------------------------------------------------------- */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  topBarSide: { width: 72 },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.displayBold,
    fontSize: typeScale.title.fontSize,
    color: colors.text,
  },
  cancel: {
    fontFamily: fonts.bodyMedium,
    fontSize: typeScale.body.fontSize,
    color: colors.textMuted,
  },

  list: { paddingHorizontal: space.lg },

  /* Photograph */
  photoFrame: {
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginTop: space.sm,
  },
  photo: { width: '100%', height: '100%' },
  photoBadge: {
    position: 'absolute',
    right: space.md,
    bottom: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: colors.wine,
    borderRadius: radius.pill,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
  },
  photoBadgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    color: colors.textOnWine,
  },
  photoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  photoEmptyDisc: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.wine,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  photoEmptyTitle: {
    fontFamily: fonts.displayBold,
    fontSize: typeScale.bodyLg.fontSize,
    color: colors.text,
  },
  photoEmptyBody: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
    marginTop: 2,
  },

  libraryLink: { alignSelf: 'center', paddingVertical: space.md },
  libraryLinkText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.caption.fontSize,
    color: colors.wine,
  },

  sectionTitle: {
    fontFamily: fonts.displayBold,
    fontSize: typeScale.title.fontSize,
    color: colors.text,
    marginTop: space.sm,
    marginBottom: space.md,
  },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    /* 48, not 44: this is the one field on the screen and it is reached
       one-handed while holding a glass. */
    height: 48,
    marginBottom: space.md,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    /* 16 so iOS does not auto-zoom the screen on focus. */
    fontSize: 16,
    color: colors.text,
  },

  /* Result row */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    minHeight: 56,
  },
  rowSelected: { backgroundColor: colors.wineWash },
  rowArt: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardAlt,
  },
  rowPhoto: { width: '100%', height: '100%' },
  rowText: { flex: 1 },
  rowName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.body.fontSize,
    color: colors.text,
  },
  rowMeta: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.wine,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Save */
  saveBar: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  noteInput: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    height: 46,
  },
  saveRow: { flexDirection: 'row', gap: space.md },
  saveBtn: { flex: 1 },
  saveHint: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
