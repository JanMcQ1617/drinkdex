import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { Icon } from '@/components/icons';
import { PlaceMap } from '@/components/places/PlaceMap';
import { TopBarTextButton } from '@/components/ScreenTopBar';
import { SheetGrabber } from '@/components/Sheet';
import { Button, Field, haptic, Hold, Notice, SearchField, useAnnounce } from '@/components/ui';
import { colors, layout, space, textRole } from '@/constants/theme';
import { OBJECTIONABLE_MESSAGE } from '@/lib/moderation';
import {
  cleanLabel,
  distanceMeters,
  labelProblem,
  PLACE_CATEGORY_LABEL,
  PLACE_LABEL_MAX,
  type PlaceRef,
} from '@/lib/places';
import {
  cancelPlaceSearch,
  currentCoordinate,
  type FoundPlace,
  formatDistance,
  type LatLng,
  locationState,
  type LocationState,
  nearby,
  PlaceSearchError,
  type PlaceSuggestion,
  rememberFound,
  requestLocation,
  resolve,
  search,
  suggest,
} from '@/lib/placeSearch';
import { usePlaces } from '@/store/places';

/* ==================================================================== */
/* The place search (specs/v4.8-places 3.2)                             */
/*                                                                      */
/* A page sheet, as Tag people and the post sheet are: it takes typing, */
/* and UIKit slides it and honours Reduce Motion. Apple Maps answers it */
/* on the phone (MapKit, through lib/placeSearch): no key, no server in */
/* between, and what is typed goes only to Apple. Only venues come back */
/* (lib/placeSearch's VENUE_CATEGORIES), so a home or a street address  */
/* can never be tagged (P3).                                            */
/*                                                                      */
/* WHAT IT SHOWS, top to bottom: "Add place" and Cancel, the field,     */
/* then either the location row (under two characters) or Apple's       */
/* suggestions as you type, and "Places from Apple Maps" at the foot,   */
/* in words.                                                            */
/*                                                                      */
/* A TAP SHOWS THE PLACE BEFORE IT IS TAGGED. A row, once resolved,     */
/* opens a short "Tag this place" step: Apple's map of the venue, its   */
/* name and address, the name it will carry on the post, the key, and   */
/* "Back to search". MapKit is licensed on the condition that an        */
/* address result from Apple is shown with the corresponding Apple map  */
/* (DPLA Attachment 6 §2.4), and this is where the address the person   */
/* picks is surfaced; the map draws Apple's logo and Legal link itself  */
/* (§2.1). And a wrong bar is the one mistake a place can make in       */
/* public, so seeing the street before the tag is the cheapest way to   */
/* avoid one.                                                           */
/*                                                                      */
/* THE NAME ON THE POST IS THE POSTER'S (the licence rework, §0.5). The */
/* licence rules out keeping Apple's names, addresses and positions on  */
/* Sipply's server (§2.2, §2.5), so a tag carries only Apple's Place ID */
/* and a LABEL: a field prefilled with the name Apple returned, which   */
/* the poster may edit like a caption (60 characters at most, the       */
/* caption filter on it here and again on the server). It is their     */
/* words from then on; Apple's name is still beside it on the map's     */
/* line, here and on the place page.                                    */
/*                                                                      */
/* LOCATION IS ASKED FOR HERE AND NOWHERE ELSE, and only on a tap of    */
/* "Show places near me" (5.1.1: on demand, and search by name works    */
/* when it is refused). A fix, when there is one, only biases MapKit    */
/* and works out "350 ft" beside a row; it is never handed to anything  */
/* but lib/placeSearch, so it never reaches Sipply (P4, 2.6).           */
/*                                                                      */
/* NOTHING IS WRITTEN HERE. `onPick` gets the Place ID and the label,   */
/* and the caller writes them onto the photo with Save & post, or with  */
/* the ••• menu's Add place. The venue Apple described stays in this    */
/* phone's memory for the session only: its position as the next        */
/* search's bias (store/places' lastSpot) and its record for the place  */
/* page (lib/placeSearch's rememberFound), so opening the page straight */
/* after posting asks Apple nothing new.                                */
/* ==================================================================== */

export interface PlaceSearchSheetProps {
  visible: boolean;
  /** The place already chosen, which its row ticks. */
  current: PlaceRef | null;
  /** The Place ID and the poster's label, checked; the sheet closes itself straight after. */
  onPick: (place: PlaceRef) => void;
  onClose: () => void;
}

export function PlaceSearchSheet({ visible, current, onPick, onClose }: PlaceSearchSheetProps) {
  /*
   * Anything in flight is dropped as the sheet goes, whichever way it
   * goes (Cancel, a swipe down, VoiceOver's escape, a pick): a late answer
   * has nothing to land on, and MapKit need not finish a search nobody
   * will read.
   */
  const close = useCallback(() => {
    cancelPlaceSearch();
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <Body current={current} onPick={onPick} onClose={close} />
    </Modal>
  );
}

/* -------------------------------------------------------------------- */

/** Row heights: a suggestion's two-line title in a 64 row; the location row is 56. */
const ROW_H = layout.rowTall;
const NEAR_ROW_H = 56;
const ROW_CHECK = 20;
const NEAR_GLYPH = 20;
/** Typed characters before Apple is asked: the wrapper answers [] under it anyway. */
const MIN_QUERY = 2;
/** The nearby radius lib/placeSearch's nearby() searches, said in the phone's units. */
const NEARBY_RADIUS_M = 800;
/** The confirm step's map across the column at 2:1, as the place page's. */
const MAP_ASPECT = 2;

/**
 * Case and diacritics aside, as the people searches. The combining-mark
 * range is escaped: typed literally it is invisible.
 */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** A row the sheet lists: Apple's as-you-type suggestion, or a venue already resolved (nearby, the return key). */
type Row = { kind: 'suggestion'; key: string; s: PlaceSuggestion } | { kind: 'found'; key: string; p: FoundPlace };

/** What a failed ask says. Throttled is MapKit's own limit; everything else reads as the connection. */
type Trouble = 'throttled' | 'failed';

/** An answer, kept with the term it answers, so a slow one for an older term never shows under a newer. */
type Answer<T> = { term: string; rows: T } | { term: string; trouble: Trouble };

/** The nearby list: asked once per open, and only with a precise fix. */
type Near = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; rows: FoundPlace[] } | { status: 'failed'; trouble: Trouble };

function troubleOf(e: unknown): Trouble {
  return e instanceof PlaceSearchError && e.code === 'throttled' ? 'throttled' : 'failed';
}

const TROUBLE_LINE: Record<Trouble, string> = {
  throttled: "That's a lot of searches. Try again in a minute.",
  failed: "Couldn't search places. Check your connection and try again.",
};

/**
 * The bias for a search without a fix (spec 3.2's order after the fix):
 * where the place picked last this session is, else none (Apple's own
 * default, the device's region). Posts no longer carry a position (§0.5),
 * so the old third source, your own latest tagged post, is gone. Read
 * once as the sheet opens, not subscribed to: the bias of a search is not
 * something to re-render for.
 */
function storedBias(): LatLng | null {
  return usePlaces.getState().lastSpot;
}

/** Apple's name as the label's starting point: tidied and cut to what a label may hold. */
function labelFrom(found: FoundPlace): string {
  return cleanLabel(found.name);
}

/** "Category · 350 ft", or "Category · San Juan" without a fix. */
function foundLine(p: FoundPlace, fix: LatLng | null): string {
  return [PLACE_CATEGORY_LABEL[p.category], fix ? formatDistance(distanceMeters(fix, p)) : p.locality]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The sheet's page. The Modal mounts it on every open and drops it once
 * the sheet has gone, so each open reads the location state afresh
 * (permissions change in Settings while the app runs) and the field
 * starts empty.
 */
function Body({ current, onPick, onClose }: { current: PlaceRef | null; onPick: (place: PlaceRef) => void; onClose: () => void }) {
  const rememberSpot = usePlaces((s) => s.rememberSpot);
  const { width } = useWindowDimensions();
  const fieldRef = useRef<TextInput>(null);

  const [query, setQuery] = useState('');
  const term = query.trim();
  const typing = term.length >= MIN_QUERY;

  /* ---- Location: read as the sheet opens, never asked for until the tap ---- */

  const [loc, setLoc] = useState<LocationState | null>(null);
  const [fix, setFix] = useState<LatLng | null>(null);
  const [near, setNear] = useState<Near>({ status: 'idle' });
  const [bias] = useState(storedBias);

  /*
   * With location allowed, a coarse fix (about 100 m) biases every search
   * and gives the rows their distance; with Precise Location on as well,
   * it lists what is within 800 m. Approximate location still biases,
   * but lists nothing: a kilometre-wide guess would put the wrong bars
   * "near you".
   */
  const loadNear = useCallback(async (state: LocationState) => {
    if (state.permission !== 'granted') return;
    if (state.precise) setNear({ status: 'loading' });
    const at = await currentCoordinate();
    setFix(at);
    if (!state.precise) return;
    if (!at) {
      setNear({ status: 'ready', rows: [] });
      return;
    }
    try {
      const rows = await nearby(at);
      /*
       * Superseded: MapKit runs one venue search at a time, and a tap on a
       * row or the return key took its turn (or the sheet is going). The
       * list then says nothing rather than spinning for good.
       */
      setNear(rows ? { status: 'ready', rows } : { status: 'idle' });
    } catch (e) {
      setNear({ status: 'failed', trouble: troubleOf(e) });
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void locationState().then((state) => {
      if (!alive) return;
      setLoc(state);
      /*
       * The field takes the cursor unless the nearby list is about to
       * show: the keys would sit over it. Focused here, once the state is
       * known, rather than by autoFocus, which fires before it is.
       */
      if (!(state.permission === 'granted' && state.precise)) fieldRef.current?.focus();
      void loadNear(state);
    });
    return () => {
      alive = false;
    };
  }, [loadNear]);

  /* The one place in the app that can raise the system's location prompt. */
  const askLocation = async () => {
    haptic.select();
    const state = await requestLocation();
    setLoc(state);
    void loadNear(state);
  };

  /* ---- Suggestions as you type, and the return key's search ---- */

  const searchBias = fix ?? bias;
  const [suggested, setSuggested] = useState<Answer<PlaceSuggestion[]> | null>(null);
  const [searched, setSearched] = useState<Answer<FoundPlace[]> | null>(null);
  // Bumped by Try again: the same term is asked again.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!typing) return;
    let alive = true;
    /*
     * Every change asks; the wrapper waits 150 ms after the last and
     * answers null to the ones a newer call overtook, which are dropped.
     */
    suggest(term, searchBias).then(
      (rows) => {
        if (alive && rows) setSuggested({ term, rows });
      },
      (e: unknown) => {
        if (alive) setSuggested({ term, trouble: troubleOf(e) });
      },
    );
    return () => {
      alive = false;
    };
  }, [typing, term, searchBias, attempt]);

  const runSearch = useCallback(() => {
    if (!typing) return;
    const asked = term;
    search(asked, searchBias).then(
      (rows) => {
        if (rows) setSearched({ term: asked, rows });
      },
      (e: unknown) => setSearched({ term: asked, trouble: troubleOf(e) }),
    );
  }, [typing, term, searchBias]);

  /* ---- Picking ---- */

  /** The row that is settling: its trailing slot spins, and every row waits. */
  const [settling, setSettling] = useState<string | null>(null);
  /** A pick's own trouble (it would not resolve, or is not a venue), said above the list until the next pick or the next letter. */
  const [pickNotice, setPickNotice] = useState<string | null>(null);
  /** The venue on the "Tag this place" step, or null while searching. */
  const [chosen, setChosen] = useState<FoundPlace | null>(null);
  /** The name it will carry on the post: Apple's, until the poster edits it. */
  const [labelDraft, setLabelDraft] = useState('');
  /** Why the name cannot be used, said under the field; cleared by the next keystroke. */
  const [labelError, setLabelError] = useState<string | null>(null);

  /*
   * A venue in hand: the keyboard goes, and the step shows it on Apple's
   * map with Apple's name in the field. Chosen again (the same place, or
   * a new one after Back to search), the field starts from Apple's name
   * again: an edit belongs to the place it was made for.
   */
  const choose = (found: FoundPlace) => {
    Keyboard.dismiss();
    setPickNotice(null);
    setLabelError(null);
    setLabelDraft(current && current.appleId === found.appleId ? current.label : labelFrom(found));
    setChosen(found);
  };

  const backToSearch = () => {
    setPickNotice(null);
    setLabelError(null);
    setChosen(null);
  };

  /*
   * The tag, checked here as the server will check it (lib/places'
   * cleanLabel and labelProblem: the label's shape and the caption
   * filter), so a refused name is said beside the field rather than after
   * posting. Nothing is sent from here: the caller writes the tag.
   */
  const tag = (found: FoundPlace) => {
    const label = cleanLabel(labelDraft);
    const problem = labelProblem(label);
    if (problem) {
      setLabelError(problem === 'empty' ? 'Give the place a name.' : OBJECTIONABLE_MESSAGE);
      return;
    }
    haptic.select();
    rememberFound(found);
    rememberSpot({ lat: found.lat, lng: found.lng });
    onPick({ appleId: found.appleId, label });
    onClose();
  };

  const pick = async (row: Row) => {
    if (settling) return;
    setSettling(row.key);
    setPickNotice(null);
    try {
      if (row.kind === 'found') {
        choose(row.p);
        return;
      }
      let found: Awaited<ReturnType<typeof resolve>>;
      try {
        found = await resolve(row.s);
      } catch (e) {
        setPickNotice(TROUBLE_LINE[troubleOf(e)]);
        return;
      }
      // Superseded: the sheet is closing, or a newer ask took MapKit's turn.
      if (found === null) return;
      if (found === 'not_taggable') {
        setPickNotice("This place can't be tagged. Pick a bar, restaurant or similar place.");
        return;
      }
      choose(found);
    } finally {
      setSettling(null);
    }
  };

  const onChangeText = (text: string) => {
    setQuery(text);
    setPickNotice(null);
  };

  /* ---- What the list holds ---- */

  const searchNow = searched && searched.term === term ? searched : null;
  const suggestNow = suggested && suggested.term === term ? suggested : null;
  /*
   * While a new term is out, the last suggestions stay on screen rather
   * than blinking to a spinner on every letter; only with nothing to show
   * yet does the Hold stand in. A stale answer is only ever kept for its
   * rows, never for its trouble: an old failure is not news about a new
   * term. The return key's rows win for the term they answer.
   */
  const staleRows = suggested && 'rows' in suggested && suggested.rows.length > 0 ? suggested : null;

  let rows: Row[] = [];
  let trouble: Trouble | null = null;
  if (!typing) {
    if (near.status === 'ready') rows = near.rows.map((p, i) => ({ kind: 'found', key: `near:${i}`, p }));
    if (near.status === 'failed') trouble = near.trouble;
  } else if (searchNow) {
    if ('trouble' in searchNow) trouble = searchNow.trouble;
    else rows = searchNow.rows.map((p, i) => ({ kind: 'found', key: `found:${i}`, p }));
  } else {
    const shown = suggestNow ?? staleRows;
    if (shown && 'trouble' in shown) trouble = shown.trouble;
    else if (shown) rows = shown.rows.map((s) => ({ kind: 'suggestion', key: `s:${s.id}`, s }));
  }

  const waiting = typing ? !searchNow && !suggestNow && !staleRows : near.status === 'loading';
  const answeredNow = typing && (searchNow ?? suggestNow) !== null;
  const noMatch = answeredNow && !trouble && rows.length === 0;
  const nothingNear = !typing && near.status === 'ready' && near.rows.length === 0;
  const noMatchLine = `No bars or restaurants match “${term}”.`;
  const nothingNearLine = `No bars or restaurants within ${formatDistance(NEARBY_RADIUS_M)}. Search by name.`;

  /* After each answer VoiceOver hears how many, or the empty line; on the confirm step, the place. */
  const spokenAnswer = chosen
    ? `${chosen.name}. Tag this place?`
    : noMatch
    ? noMatchLine
    : nothingNear
      ? nothingNearLine
      : (answeredNow || (!typing && near.status === 'ready')) && !trouble
        ? `${rows.length} ${rows.length === 1 ? 'place' : 'places'}`
        : null;
  useAnnounce(spokenAnswer);

  /* ---- The current place's row is ticked ---- */

  /*
   * A venue already resolved is the current one by its Place ID, exactly.
   * A suggestion has no id until it is tapped, so it is matched by its
   * title against the label, which is Apple's name unless the poster
   * edited it (then no suggestion is ticked, which is only a missing tick).
   */
  const currentName = current ? fold(current.label) : null;
  const isCurrent = (row: Row): boolean => {
    if (!current || currentName === null) return false;
    if (row.kind === 'found') return row.p.appleId === current.appleId;
    return fold(row.s.title) === currentName;
  };

  /* ---- The parts ---- */

  const locationBlock = (() => {
    if (typing || !loc) return null;
    switch (loc.permission) {
      case 'undetermined':
        /*
         * "Isn't sent to Sipply", not "stays on your phone": the nearby
         * search sends the position to Apple (MKLocalPointsOfInterestRequest),
         * as the purpose string and the privacy policy say.
         */
        return (
          <NearRow
            line="Your location isn't sent to Sipply."
            hint="Asks to use your location"
            onPress={() => void askLocation()}
          />
        );
      case 'granted':
        return loc.precise ? (
          near.status === 'ready' && near.rows.length > 0 ? (
            <Text accessibilityRole="header" style={[styles.groupTitle, styles.gutter]}>
              Near you
            </Text>
          ) : null
        ) : (
          <Text style={[styles.quiet, styles.line]}>
            Precise Location is off for Sipply, so places near you aren&apos;t listed. Search by name.
          </Text>
        );
      case 'denied':
        /*
         * Someone who already said no gets the same one row, not a
         * sentence and a key on every open ("less stuff"): it says where
         * the switch is, and a tap goes there. iOS never asks twice, so
         * Settings is the only way back.
         */
        return (
          <NearRow
            line="Location is off for Sipply in Settings."
            hint="Opens Settings"
            onPress={() => void Linking.openSettings()}
          />
        );
      default:
        // Restricted, or no module: search by name, and nothing to say about it.
        return null;
    }
  })();

  const header = (
    <View>
      {pickNotice ? (
        <Notice tone="error" style={styles.notice}>
          {pickNotice}
        </Notice>
      ) : null}
      {trouble ? (
        <Notice
          tone="error"
          style={styles.notice}
          action={
            trouble === 'failed'
              ? {
                  label: 'Try again',
                  onPress: () => {
                    if (!typing) {
                      if (loc) void loadNear(loc);
                    } else if (searchNow) runSearch();
                    else setAttempt((n) => n + 1);
                  },
                }
              : undefined
          }>
          {TROUBLE_LINE[trouble]}
        </Notice>
      ) : null}
      {locationBlock}
      {waiting && !trouble ? <Hold fill={false} slowMessage="Still searching." /> : null}
      {nothingNear && !trouble ? <Text style={[styles.quiet, styles.line]}>{nothingNearLine}</Text> : null}
    </View>
  );

  const footer = (
    <Text style={[styles.quiet, styles.attribution]}>Places from Apple Maps</Text>
  );

  const titleRow = (
    <View style={styles.titleRow}>
      <Text accessibilityRole="header" style={[textRole.bodyStrong, styles.ink, styles.title]}>
        Add place
      </Text>
      <TopBarTextButton label="Cancel" muted onPress={onClose} />
    </View>
  );

  if (chosen) {
    const column = width - 2 * layout.gutter;
    const meta = [PLACE_CATEGORY_LABEL[chosen.category], chosen.address ?? chosen.locality, fix ? formatDistance(distanceMeters(fix, chosen)) : null]
      .filter(Boolean)
      .join(' · ');
    return (
      <View style={styles.screen} onAccessibilityEscape={backToSearch}>
        <SheetGrabber />
        {titleRow}
        <ScrollView
          contentContainerStyle={styles.confirm}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets>
          <PlaceMap lat={chosen.lat} lng={chosen.lng} name={chosen.name} width={column} height={column / MAP_ASPECT} />
          <Text accessibilityRole="header" numberOfLines={2} style={[textRole.bodyStrong, styles.ink, styles.chosenName]}>
            {chosen.name}
          </Text>
          {meta ? (
            <Text numberOfLines={2} style={[styles.quiet, styles.chosenMeta]}>
              {meta}
            </Text>
          ) : null}
          {/*
            The name the post will say, "at …": Apple's to start with, the
            poster's to change, like a caption (§0.5). One line, 60 at most.
          */}
          <Field
            label="Name on your post"
            value={labelDraft}
            onChangeText={(t) => {
              setLabelDraft(t);
              setLabelError(null);
            }}
            maxLength={PLACE_LABEL_MAX}
            autoCapitalize="words"
            // Off: autocorrect would "fix" a venue's real name (La Factoría,
            // Jungle Bird) while the poster edits it; capitals still help.
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => tag(chosen)}
            error={labelError}
            style={styles.labelField}
          />
          <Button
            label="Tag this place"
            block
            onPress={() => tag(chosen)}
            accessibilityHint="Adds this place to your post"
            style={styles.tagKey}
          />
          <Button
            label="Back to search"
            variant="text"
            size="sm"
            onPress={backToSearch}
            style={styles.backKey}
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen} onAccessibilityEscape={onClose}>
      <SheetGrabber />
      {titleRow}
      <SearchField
        ref={fieldRef}
        value={query}
        onChangeText={onChangeText}
        onSubmitEditing={runSearch}
        placeholder="Search a bar or restaurant"
        accessibilityLabel="Search Apple Maps for a bar, restaurant or other place you had a drink"
        returnKeyType="default"
        keyboardAppearance="light"
        style={styles.search}
      />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={({ item, index }) => (
          <PlaceResultRow
            row={item}
            fix={fix}
            selected={isCurrent(item)}
            settling={settling === item.key}
            locked={settling !== null}
            first={index === 0}
            onPress={pick}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          noMatch && !trouble ? <Text style={[styles.quiet, styles.noMatch]}>{noMatchLine}</Text> : null
        }
        ListFooterComponent={footer}
        initialNumToRender={10}
        windowSize={7}
        // The keyboard: a drag lowers it, a tap on a row still lands, and rows scroll clear of it.
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        style={styles.list}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

/**
 * "Show places near me": 56, the 20pt pin, the words over one quiet line.
 * One row in both states that offer it: undetermined (the tap asks) and
 * denied (the tap opens Settings).
 */
function NearRow({ line, hint, onPress }: { line: string; hint: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Show places near me. ${line}`}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.nearRow, pressed && styles.pressed]}>
      <Icon name="pin" size={NEAR_GLYPH} color={colors.textMuted} />
      <View style={styles.rowText}>
        <Text style={styles.body}>Show places near me</Text>
        <Text style={styles.quiet}>{line}</Text>
      </View>
    </Pressable>
  );
}

/**
 * One place. A suggestion is Apple's title (up to two lines) over its
 * address line; a venue already resolved (nearby, the return key) is its
 * name over "Bar · 350 ft". The row for the place already chosen ends in
 * a check and reads selected; a row that is settling spins there instead,
 * and every row waits until it has.
 */
const PlaceResultRow = React.memo(function PlaceResultRow({
  row,
  fix,
  selected,
  settling,
  locked,
  first,
  onPress,
}: {
  row: Row;
  fix: LatLng | null;
  selected: boolean;
  settling: boolean;
  /** Some row is settling, so this one takes no tap. */
  locked: boolean;
  /** No separator above the first. */
  first: boolean;
  onPress: (row: Row) => void;
}) {
  const title = row.kind === 'suggestion' ? row.s.title : row.p.name;
  const line = row.kind === 'suggestion' ? row.s.subtitle : foundLine(row.p, fix);
  const spoken =
    row.kind === 'suggestion'
      ? [row.s.title, row.s.subtitle].filter(Boolean).join(', ')
      : [row.p.name, row.p.address, row.p.locality].filter(Boolean).join(', ');
  return (
    <Pressable
      onPress={locked ? undefined : () => onPress(row)}
      disabled={locked}
      accessibilityRole="button"
      accessibilityLabel={selected ? `${spoken}, selected` : spoken}
      accessibilityHint="Shows this place on a map before you tag it"
      accessibilityState={{ selected, disabled: locked, busy: settling }}
      style={({ pressed }) => [styles.row, pressed && !locked && styles.rowPressed]}>
      {/* The separator, inset to the text, so the rows read as one list without boxing it. */}
      {first ? null : <View style={styles.separator} />}
      <View style={styles.rowText}>
        <Text numberOfLines={2} style={styles.body}>
          {title}
        </Text>
        {line ? (
          <Text numberOfLines={1} style={styles.quiet}>
            {line}
          </Text>
        ) : null}
      </View>
      <View style={styles.trailing}>
        {settling ? (
          <ActivityIndicator color={colors.text} accessibilityLabel="Adding" />
        ) : selected ? (
          <Icon name="check" size={ROW_CHECK} color={colors.text} />
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  ink: { color: colors.text },
  pressed: { backgroundColor: colors.press },
  body: { ...textRole.body, color: colors.text },
  quiet: { ...textRole.small, color: colors.textMuted },
  groupTitle: { ...textRole.groupTitle, color: colors.textMuted },
  gutter: { paddingHorizontal: layout.gutter, paddingTop: space.sm, paddingBottom: space.xs },

  /* The title at the gutter; Cancel's own inset taken back so its word ends on the far gutter (PostSheet's). */
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingLeft: layout.gutter,
    paddingRight: layout.gutter - space.md,
  },
  title: { flexShrink: 1 },
  search: { marginTop: space.sm, marginHorizontal: layout.gutter },

  list: { flex: 1 },
  /* The first row 8 under the field. */
  content: { paddingTop: space.sm, paddingBottom: space.xxxl },

  notice: { marginHorizontal: layout.gutter, marginBottom: space.md },
  /* A quiet line at the gutter, 16 under the field. */
  line: { paddingHorizontal: layout.gutter, paddingTop: space.lg, alignItems: 'flex-start' },
  noMatch: { textAlign: 'center', paddingHorizontal: layout.gutter, paddingTop: space.xl },
  attribution: { textAlign: 'center', marginTop: space.lg, paddingHorizontal: layout.gutter },

  /* The "Tag this place" step: the map 8 under the title row at the gutter, the words, then the keys. */
  confirm: { paddingHorizontal: layout.gutter, paddingTop: space.sm, paddingBottom: space.xxxl },
  chosenName: { marginTop: space.lg },
  chosenMeta: { marginTop: space.xs },
  labelField: { marginTop: space.xl },
  tagKey: { marginTop: space.xl },
  /* Centred under the key; a small text key's own inset is symmetrical, so nothing to take back. */
  backKey: { alignSelf: 'center', marginTop: space.sm },

  /* "Show places near me": 56, the 20pt pin at the gutter, the words 12 after it. */
  nearRow: {
    minHeight: NEAR_ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.gutter,
    paddingVertical: space.sm,
  },

  /* A place: 64, the words at the gutter, the check (or the spinner) on the far gutter. */
  row: {
    minHeight: ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.gutter,
    paddingVertical: space.sm,
  },
  rowPressed: { backgroundColor: colors.press },
  rowText: { flex: 1 },
  trailing: { width: ROW_CHECK, alignItems: 'center', justifyContent: 'center' },
  separator: {
    position: 'absolute',
    top: 0,
    left: layout.gutter,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hair,
  },
});
