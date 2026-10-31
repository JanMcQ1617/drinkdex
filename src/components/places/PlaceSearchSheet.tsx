import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
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
/* Current place, then either the venues near you (under two            */
/* characters) or Apple's suggestions as you type, and "Places from     */
/* Apple Maps" at the foot, in words.                                   */
/*                                                                      */
/* CURRENT PLACE IS THE FIRST ROW (v4.11, specs/v4.11/current-place.md) */
/* so that posting from the bar you are in is one tap, then the Tag     */
/* this place step like any other row. It is the nearest venue of the   */
/* same nearby() answer the list under it is made from, kept only when  */
/* the fix is close and the venue within HERE_RADIUS_M of it, and       */
/* lifted out of "Near you" and the return key's rows so nothing is     */
/* listed twice. Never a second search: native runs one MKLocalSearch   */
/* at a time, and a second would cancel the list's. It is also the one  */
/* location row: while location has never been answered a tap on it     */
/* asks (it replaced v4.8's "Show places near me", which asked the same */
/* question), and after a refusal it says so and opens Settings.        */
/*                                                                      */
/* NO STATE OF IT IS A DEAD END (v4.12, specs/v4.12/current-place-fix). */
/* In build 37 "No bar or restaurant here." and "Can't tell which place */
/* you're in." took no tap, a fix that never came read as "nothing      */
/* within 800 m" and took none either, "finding" could spin for as long */
/* as Apple took, and Precise Location off was a line under the field   */
/* that named the row it hid: a tap on Current place did nothing, which */
/* is how it was reported. Now every state but finding does something   */
/* (Tag this place, ask, Settings, look again, or the field, to search  */
/* by name), and finding says so and ends after FIND_WAIT_MS.           */
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
/* Current place (5.1.1: on demand, and search by name works when it is */
/* refused). Opening the sheet, or coming back to it from Settings,     */
/* only reads the permission. A fix, when there is one, only biases     */
/* MapKit, picks the current place and works out "350 ft" beside a row; */
/* it is never handed to anything but lib/placeSearch, so it never      */
/* reaches Sipply (P4, 2.6).                                            */
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

/** Row height: a suggestion's two-line title in a 64 row, and Current place in every state. */
const ROW_H = layout.rowTall;
const ROW_CHECK = 20;
const LEAD_GLYPH = 20;
/** Typed characters before Apple is asked: the wrapper answers [] under it anyway. */
const MIN_QUERY = 2;
/** The nearby radius lib/placeSearch's nearby() searches, said in the phone's units. */
const NEARBY_RADIUS_M = 800;
/*
 * How near the nearest venue must be to be the one you are in: 100 m,
 * the accuracy the fix is asked for (kCLLocationAccuracyHundredMeters in
 * PlaceSearchEngine.swift). Within it the phone cannot say you are
 * anywhere else; past it, it can, and a bar down the street is a place
 * near you, not your current place. The ranking is the list's own,
 * straight-line distance from the fix, nearest first (native's sort), so
 * in a street of bars it is the nearest, and the Tag this place step's
 * map is where a wrong guess is caught, as it is for any row. All of it
 * holds only for a fix as good as it was asked to be (lib/placeSearch's
 * `close`); a worse one names nothing (UNSURE_HERE_LINE).
 */
const HERE_RADIUS_M = 100;
/** The current place's key as a pick: never a list row's (`near:`, `found:`, `s:`). */
const HERE_KEY = 'here';
/*
 * How long Current place may say it is finding before it says what it
 * was waiting for. Native gives up on the fix at 10 s
 * (PlaceSearchEngine.swift's currentCoordinate, which then answers no
 * fix), but MapKit's nearby search has no deadline of its own, and on a
 * weak connection it can outlast anyone's patience: the row spun, took no
 * tap, and read as broken. 20 s is native's 10 for the fix and 10 more for
 * Apple's answer.
 */
const FIND_WAIT_MS = 20_000;
const FINDING_LINE = 'Finding where you are…';
const NOTHING_HERE_LINE = 'No bar or restaurant here.';
const UNSURE_HERE_LINE = "Can't tell which place you're in.";
/* No fix came (CoreLocation failed, or gave none in native's 10 s, or the ask outran FIND_WAIT_MS): a tap looks again. */
const LOST_LINE = "Couldn't find where you are. Try again.";
const LOCATION_OFF_LINE = 'Location is off for Sipply in Settings.';
/* The Precise Location switch sits on the same Settings page as the Location one, under it. */
const PRECISE_OFF_LINE = 'Precise Location is off in Settings.';
/*
 * "Isn't sent to Sipply", not "stays on your phone": the nearby search
 * sends the position to Apple (MKLocalPointsOfInterestRequest), as the
 * purpose string and the privacy policy say.
 */
const NOT_SENT_LINE = "Your location isn't sent to Sipply.";
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

/**
 * The nearby list: asked once per open, and only with a precise fix.
 * `lost` is no fix at all, which is not "nothing near": build 37 read it
 * as an empty answer and said "No bars or restaurants within 800 m".
 */
type Near =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; rows: FoundPlace[] }
  | { status: 'failed'; trouble: Trouble }
  | { status: 'lost' };

/**
 * The Current place row, by the location state and the nearby answer.
 * Every kind but `finding` takes a tap:
 *   `ask`        never answered: a tap asks.
 *   `finding`    the fix and nearby() are out: a spinner and words, ended
 *                by FIND_WAIT_MS.
 *   `found`      a venue within HERE_RADIUS_M: Tag this place.
 *   `none`       nothing within HERE_RADIUS_M, and `unsure`, venues near
 *                but the fix too coarse to say which one you are in: a
 *                tap puts the cursor in the field, to search by name.
 *   `lost`       no fix came: a tap looks again.
 *   `off`        refused, and `imprecise`, Precise Location off: a tap
 *                opens Settings, where both switches are.
 * Null draws no row: restricted, no module, a nearby ask superseded (asked
 * again as the field is cleared), or one that failed (the Notice says why,
 * and Try again finds it again).
 */
type Here =
  | { kind: 'ask' }
  | { kind: 'finding' }
  | { kind: 'found'; p: FoundPlace }
  | { kind: 'none' }
  | { kind: 'unsure' }
  | { kind: 'lost' }
  | { kind: 'off' }
  | { kind: 'imprecise' };

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
  /** The fix is as good as it was asked to be (about 100 m): only then can it name the place you are in. */
  const [fixClose, setFixClose] = useState(false);
  const [near, setNear] = useState<Near>({ status: 'idle' });
  const [bias] = useState(storedBias);

  /*
   * With location allowed, a coarse fix (about 100 m) biases every search
   * and gives the rows their distance; with Precise Location on as well,
   * it lists what is within 800 m. Approximate location still biases,
   * but lists nothing: a kilometre-wide guess would put the wrong bars
   * "near you". Turned off in Settings while the sheet was open (below),
   * what the last fix found goes with it.
   *
   * EACH LOAD TAKES A NUMBER, and only the newest may land (`loadSeq`).
   * Two can be out at once (Try again or the lost row tapped twice, the
   * location prompt's answer beside a return from Settings), and native
   * runs one MKLocalSearch at a time, so the newer nearby() settles the
   * older as superseded; that older null, landing after the newer answer,
   * blanked the row and the list it had just filled.
   */
  const loadSeq = useRef(0);
  /* An ask the field's clearing owed while a suggestion settled (onChangeText, payNear); any load pays it. */
  const nearOwed = useRef(false);
  const loadNear = useCallback(async (state: LocationState) => {
    const seq = ++loadSeq.current;
    const live = () => seq === loadSeq.current;
    nearOwed.current = false;
    if (state.permission !== 'granted') {
      setFix(null);
      setFixClose(false);
      setNear({ status: 'idle' });
      return;
    }
    setNear(state.precise ? { status: 'loading' } : { status: 'idle' });
    /*
     * Never a row that spins for good. FIND_WAIT_MS after the ask, what is
     * still out is dropped (the number moves on, so a late answer cannot
     * land) and the row says what it was waiting for: the fix (lost, which
     * a tap asks again) or Apple's answer (failed: the list's own Notice
     * and its Try again, as for any search that did not answer). Native's
     * own 10 s ends most waits for a fix first, as no fix (`!at`, lost
     * too); one CoreLocation delivers after that is kept natively, so the
     * lost row's second ask gets it at once.
     */
    let located = false;
    const watchdog = state.precise
      ? setTimeout(() => {
          if (!live()) return;
          loadSeq.current += 1;
          setNear(located ? { status: 'failed', trouble: 'failed' } : { status: 'lost' });
        }, FIND_WAIT_MS)
      : null;
    try {
      const got = await currentCoordinate();
      if (!live()) return;
      const at = got?.at ?? null;
      setFix(at);
      setFixClose(got?.close ?? false);
      if (!state.precise) return;
      if (!at) {
        setNear({ status: 'lost' });
        return;
      }
      located = true;
      try {
        const rows = await nearby(at);
        if (!live()) return;
        /*
         * Superseded: MapKit runs one venue search at a time, and a tap on a
         * suggestion or the return key took its turn (or the sheet is
         * going). The list then says nothing rather than spinning for good,
         * and clearing the field asks again (onChangeText).
         */
        setNear(rows ? { status: 'ready', rows } : { status: 'idle' });
      } catch (e) {
        if (live()) setNear({ status: 'failed', trouble: troubleOf(e) });
      }
    } finally {
      if (watchdog) clearTimeout(watchdog);
    }
  }, []);

  /*
   * Gone, nothing it asked may land or ask again. Closing cancels the
   * search in flight (PlaceSearchSheet's close), but not a fix: one that
   * came after (native waits up to 10 s) went on to nearby(), sending the
   * position to Apple for a sheet that was dismissed and taking MapKit's
   * one search from whatever asked next, a reopened sheet's included. The
   * number moves on, so a load still out stops at its next `live()`, and
   * its watchdog, if it fires first, finds it stale and sets nothing.
   */
  useEffect(
    () => () => {
      loadSeq.current += 1;
    },
    [],
  );

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

  /*
   * Back from Settings with the sheet still open: Current place sends a
   * refusal there, and Precise Location off (v4.12), and iOS does not end
   * the app for either switch, so the sheet would go on saying "Location
   * is off" after it was turned on. The state is read again, and a change
   * loads as a tap does: the row goes to finding, then to the place, by
   * itself. Only after the app was really away (background): the location
   * prompt only makes it inactive, and askLocation already loads what that
   * answer allows.
   */
  useEffect(() => {
    if (!loc) return;
    let alive = true;
    let away = false;
    const sub = AppState.addEventListener('change', (now) => {
      if (now === 'background') away = true;
      if (now !== 'active' || !away) return;
      away = false;
      void locationState().then((state) => {
        if (!alive || (state.permission === loc.permission && state.precise === loc.precise)) return;
        setLoc(state);
        void loadNear(state);
      });
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [loc, loadNear]);

  /*
   * The one place in the app that can raise the system's location prompt,
   * behind the one row that asks, Current place. Its answer loads the row
   * and the list under it, since both come from the one nearby() answer.
   */
  const askLocation = async () => {
    haptic.select();
    const state = await requestLocation();
    setLoc(state);
    /*
     * Allowed with Precise Location: the nearby list is about to show, and
     * the keys, up since the sheet opened with nothing near to show, would
     * sit over it (the open's own rule, above). Down, a later tap on
     * "nothing here" visibly brings them back to search by name.
     */
    if (state.permission === 'granted' && state.precise) Keyboard.dismiss();
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

  /*
   * The nearby ask the field's clearing owed while a suggestion settled
   * (onChangeText), made once the pick has let go of MapKit's one search
   * and the list is back: the pick failed, or Back to search from Tag
   * this place. Not as a pick is superseded, which may be the sheet
   * going, nor on the Tag step, which shows no list.
   */
  const payNear = () => {
    if (nearOwed.current && loc?.permission === 'granted' && loc.precise) void loadNear(loc);
  };

  const backToSearch = () => {
    setPickNotice(null);
    setLabelError(null);
    setChosen(null);
    payNear();
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
        payNear();
        return;
      }
      // Superseded: the sheet is closing, or a newer ask took MapKit's turn.
      if (found === null) return;
      if (found === 'not_taggable') {
        setPickNotice("This place can't be tagged. Pick a bar, restaurant or similar place.");
        payNear();
        return;
      }
      choose(found);
    } finally {
      setSettling(null);
    }
  };

  /* ---- Current place: the nearest of the nearby answer, if it is here ---- */

  const nearest = near.status === 'ready' && fix ? (near.rows[0] ?? null) : null;
  const hereVenue = nearest && fix && fixClose && distanceMeters(fix, nearest) <= HERE_RADIUS_M ? nearest : null;
  const here: Here | null = (() => {
    if (!loc) return null;
    switch (loc.permission) {
      case 'undetermined':
        return { kind: 'ask' };
      case 'denied':
        return { kind: 'off' };
      case 'granted':
        if (!loc.precise) return { kind: 'imprecise' };
        if (near.status === 'loading') return { kind: 'finding' };
        if (near.status === 'lost') return { kind: 'lost' };
        if (near.status !== 'ready') return null;
        if (hereVenue) return { kind: 'found', p: hereVenue };
        return nearest && !fixClose ? { kind: 'unsure' } : { kind: 'none' };
      default:
        return null;
    }
  })();

  /*
   * While a term is typed the row stays only with a venue in it, and only
   * if it already held one as the typing began. With a venue it is still
   * the one-tap answer whatever is typed, and one row. Asking, finding,
   * nothing here and Settings are about location, not the search, so they
   * go under two characters rather than push Apple's suggestions under the
   * keys. And a venue found mid-word (nearby() can take seconds, Apple's
   * suggestions a fraction of one) would land above the suggestions and
   * push them 64 down, under a finger already on its way to one, so it
   * waits until the field is cleared.
   */
  const [hereKept, setHereKept] = useState(false);
  const hereShown = here !== null && (!typing || (here.kind === 'found' && hereKept));
  /** The venue the row shows, which no list under it repeats. */
  const hereFound = hereShown && here?.kind === 'found' ? here.p : null;
  /* Its spinner is the nearby list's too (one answer), so no Hold under it. */
  const hereBusy = hereShown && here?.kind === 'finding';

  const onChangeText = (text: string) => {
    const nowTyping = text.trim().length >= MIN_QUERY;
    if (!typing && nowTyping) setHereKept(hereFound !== null);
    /*
     * Back under two characters with the nearby answer superseded while
     * the term was out (a suggestion's tap or the return key took MapKit's
     * one search): asked again, or the sheet showed neither the row nor
     * Near you until it was reopened. Not while a suggestion is settling,
     * whose search this one would cancel in turn: owed instead, and asked
     * once the pick lets go (payNear). Typing a term again cancels the
     * debt, since the next clearing asks for itself.
     */
    if (typing && !nowTyping && near.status === 'idle' && loc?.permission === 'granted' && loc.precise) {
      if (settling === null) void loadNear(loc);
      else nearOwed.current = true;
    }
    if (nowTyping) nearOwed.current = false;
    setQuery(text);
    setPickNotice(null);
  };

  /*
   * "No bar or restaurant here." and "Can't tell which place you're in."
   * end the row's question, so a tap goes to the one way left to name the
   * place: its name, typed. Not a second look: native serves the same fix
   * for 120 s (PlaceSearchEngine.swift's fixAt), so looking again would
   * spin and give the same answer, a tap that looks as if it worked and
   * did not.
   */
  const searchByName = () => fieldRef.current?.focus();

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
  /* How many the answer held, the current place among them: it was found with them. */
  let counted = 0;
  if (!typing) {
    // The current place is lifted out: it is the first row already.
    if (near.status === 'ready') {
      rows = near.rows.filter((p) => p !== hereFound).map((p, i) => ({ kind: 'found', key: `near:${i}`, p }));
      counted = near.rows.length;
    }
    if (near.status === 'failed') trouble = near.trouble;
  } else if (searchNow) {
    if ('trouble' in searchNow) trouble = searchNow.trouble;
    else {
      // The return key's rows are venues with a Place ID too, so the current place is lifted out of them the same way.
      rows = searchNow.rows
        .filter((p) => p.appleId !== hereFound?.appleId)
        .map((p, i) => ({ kind: 'found', key: `found:${i}`, p }));
      counted = searchNow.rows.length;
    }
  } else {
    const shown = suggestNow ?? staleRows;
    if (shown && 'trouble' in shown) trouble = shown.trouble;
    else if (shown) rows = shown.rows.map((s) => ({ kind: 'suggestion', key: `s:${s.id}`, s }));
    counted = rows.length;
  }

  const waiting = typing ? !searchNow && !suggestNow && !staleRows : near.status === 'loading';
  const answeredNow = typing && (searchNow ?? suggestNow) !== null;
  const noMatch = answeredNow && !trouble && counted === 0;
  const nothingNear = !typing && near.status === 'ready' && near.rows.length === 0;
  const noMatchLine = `No bars or restaurants match “${term}”.`;
  const nothingNearLine = `No bars or restaurants within ${formatDistance(NEARBY_RADIUS_M)}. Search by name.`;
  /* Current place's one quiet line when the answer held no venue for it; with nothing near at all it says so for the whole list. */
  const hereLine =
    here?.kind === 'none'
      ? nothingNear
        ? nothingNearLine
        : NOTHING_HERE_LINE
      : here?.kind === 'unsure'
        ? UNSURE_HERE_LINE
        : here?.kind === 'lost'
          ? LOST_LINE
          : null;

  /*
   * After each answer VoiceOver hears how many, or the empty line; on the
   * confirm step, the place. The nearby answer is heard with Current place
   * first: the row a tap asked from comes back as a different view (ask,
   * finding, found), so VoiceOver's focus does not stay on it to hear what
   * it found, and the count alone would not say.
   */
  const heardHere =
    !typing && hereShown ? (hereFound ? `Current place, ${hereFound.name}. ` : hereLine ? `${hereLine} ` : '') : '';
  const spokenAnswer = chosen
    ? `${chosen.name}. Tag this place?`
    : noMatch
    ? noMatchLine
    : !typing && near.status === 'lost'
    ? `Current place. ${LOST_LINE}`
    : nothingNear
      ? nothingNearLine
      : (answeredNow || (!typing && near.status === 'ready')) && !trouble
        ? `${heardHere}${counted} ${counted === 1 ? 'place' : 'places'}`
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
      case 'granted':
        /*
         * Near you's heading, over the venues. With Precise Location off
         * there are none to head, and since v4.12 Current place says why
         * and opens Settings (`imprecise`): build 37 said it in a line here
         * instead, which named "your current place" as one of the things
         * not listed and could not be tapped, so a finger that went for the
         * words got nothing.
         */
        return loc.precise && near.status === 'ready' && rows.length > 0 ? (
          <Text accessibilityRole="header" style={[styles.groupTitle, styles.gutter]}>
            Near you
          </Text>
        ) : null;
      case 'undetermined':
      case 'denied':
        /*
         * One row, not a sentence and a key on every open ("less stuff"):
         * since v4.11 it is Current place, above. Never answered, a tap on
         * it asks; v4.8's "Show places near me" under it asked the same
         * question and filled from the same answer, so it went. After a
         * refusal it says where the switch is and goes there; a second row
         * saying the same words to the same Settings page would be the
         * same thing twice. iOS never asks twice, so Settings is the only
         * way back.
         */
        return null;
      default:
        // Restricted, or no module: search by name, and nothing to say about it.
        return null;
    }
  })();

  /*
   * Current place, the first row. Found, it is a list row like the rest
   * (PlaceResultRow, the same pick, the same FoundPlace, so the same
   * Place ID and label reach onPick); otherwise it holds the row's place
   * at the same 64, so finding it never moves what is under it.
   */
  const hereRow = (() => {
    if (!hereShown || !here) return null;
    switch (here.kind) {
      case 'found': {
        const row: Row = { kind: 'found', key: HERE_KEY, p: here.p };
        return (
          <PlaceResultRow
            row={row}
            fix={fix}
            here
            selected={isCurrent(row)}
            settling={settling === HERE_KEY}
            locked={settling !== null}
            first
            onPress={pick}
          />
        );
      }
      case 'ask':
        return (
          <HereRow
            line={NOT_SENT_LINE}
            label={`Current place. ${NOT_SENT_LINE}`}
            hint="Asks to use your location to find where you are"
            onPress={() => void askLocation()}
          />
        );
      case 'finding':
        return <HereRow busy line={FINDING_LINE} label="Current place, finding where you are" />;
      case 'none':
      case 'unsure':
        return hereLine ? (
          <HereRow
            line={hereLine}
            label={`Current place. ${hereLine}`}
            hint="Puts the cursor in the search field, to search by name"
            onPress={searchByName}
          />
        ) : null;
      case 'lost':
        return (
          <HereRow
            line={LOST_LINE}
            label={`Current place. ${LOST_LINE}`}
            hint="Looks for where you are again"
            onPress={() => {
              if (loc) void loadNear(loc);
            }}
          />
        );
      case 'off':
        return (
          <HereRow
            line={LOCATION_OFF_LINE}
            label={`Current place. ${LOCATION_OFF_LINE}`}
            hint="Opens Settings"
            onPress={() => void Linking.openSettings()}
          />
        );
      case 'imprecise':
        /*
         * Allowed, but approximate: a kilometre-wide guess cannot name the
         * bar you are in, so the row names no place. It says why, and goes
         * where the switch is; coming back with it on loads as a tap does
         * (Body's AppState listener compares `precise` too).
         */
        return (
          <HereRow
            line={PRECISE_OFF_LINE}
            label={`Current place. ${PRECISE_OFF_LINE}`}
            hint="Opens Settings"
            onPress={() => void Linking.openSettings()}
          />
        );
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
      {hereRow}
      {locationBlock}
      {waiting && !trouble && !hereBusy ? <Hold fill={false} slowMessage="Still searching." /> : null}
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
            // Under a typed term the current place sits straight above the first suggestion, as one list.
            first={index === 0 && !(typing && hereShown)}
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
 * Current place before it holds a venue: 64 like the row it becomes, the
 * 20pt locate glyph at the gutter (a spinner in its place while the fix
 * and nearby() are out, the trailing slot's busy pattern moved to the
 * front, since this row has no trailing check yet), "Current place" over
 * one quiet line. Every state but finding takes a tap (ask, Settings, look
 * again, or the field), so the plain View, no press and no fill, is the
 * busy row alone, and it says in words that it is busy as well as with the
 * spinner: in build 37 two quiet states drew this same row, glyph and all,
 * took no tap, and looked like a button that did nothing. Every label
 * starts with the words on the row, so "Tap Current place" in Voice
 * Control finds it in any state.
 */
function HereRow({
  line,
  label,
  hint,
  busy = false,
  onPress,
}: {
  line?: string;
  label: string;
  hint?: string;
  busy?: boolean;
  onPress?: () => void;
}) {
  const parts = (
    <>
      <View style={styles.lead}>
        {busy ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Icon name="locate" size={LEAD_GLYPH} color={colors.textMuted} />
        )}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.body}>Current place</Text>
        {line ? <Text style={styles.quiet}>{line}</Text> : null}
      </View>
    </>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label} accessibilityState={{ busy }} style={styles.row}>
        {parts}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      {parts}
    </Pressable>
  );
}

/**
 * One place. A suggestion is Apple's title (up to two lines) over its
 * address line; a venue already resolved (nearby, the return key) is its
 * name over "Bar · 350 ft". The row for the place already chosen ends in
 * a check and reads selected; a row that is settling spins there instead,
 * and every row waits until it has. As Current place (`here`) it leads
 * with the locate glyph and its line is "Current place · 30 ft", the
 * distance the figure the near rows give.
 */
const PlaceResultRow = React.memo(function PlaceResultRow({
  row,
  fix,
  here = false,
  selected,
  settling,
  locked,
  first,
  onPress,
}: {
  row: Row;
  fix: LatLng | null;
  /** The Current place row. */
  here?: boolean;
  selected: boolean;
  settling: boolean;
  /** Some row is settling, so this one takes no tap. */
  locked: boolean;
  /** No separator above the first. */
  first: boolean;
  onPress: (row: Row) => void;
}) {
  const title = row.kind === 'suggestion' ? row.s.title : row.p.name;
  const away = row.kind === 'found' && fix ? formatDistance(distanceMeters(fix, row.p)) : null;
  const line = here
    ? ['Current place', away].filter(Boolean).join(' · ')
    : row.kind === 'suggestion'
      ? row.s.subtitle
      : foundLine(row.p, fix);
  const spoken = here
    ? ['Current place', title, away].filter(Boolean).join(', ')
    : row.kind === 'suggestion'
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
      {here ? (
        <View style={styles.lead}>
          <Icon name="locate" size={LEAD_GLYPH} color={colors.textMuted} />
        </View>
      ) : null}
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
  /* Current place's glyph (or its spinner): 20 at the gutter, the words 12 after it. */
  lead: { width: LEAD_GLYPH, alignItems: 'center', justifyContent: 'center' },
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
