import { create } from 'zustand';

import { fetchDrinkPlaces, fetchPlacePage, type DrinkPlace, type PlacePage } from '@/lib/places';
import type { LatLng } from '@/lib/placeSearch';
import { useAuth } from '@/store/auth';

/*
 * Places (specs/v4.8-places/spec.md 2.4, as reworked in §0.5): where
 * people have had each drink, each place's page (Sipply's side of it: the
 * label and the drinks; Apple's side, the address and the map, is looked
 * up live by the screen and held by lib/placeSearch), and where the last
 * pick this session was.
 *
 * The friendsBoard store's guards: numbered loads where only the newest
 * writes (per drink and per place here, so two drink pages open in the
 * stack never overwrite each other), a `gen` that reset() bumps so an
 * answer for one account never lands in the next one's, and its own watch
 * on the auth store. Not persisted: a place's people move whenever
 * someone posts, and a relaunch also asks again whether 026 is there.
 *
 * A load keeps what it holds while it refreshes, so a revisit draws at
 * once, and a refresh that fails over data keeps the data (`state` stays
 * 'ready', with `refreshFailed` set for a screen that says so).
 */

export type Load<T> = {
  data: T;
  state: 'loading' | 'ready' | 'failed' | 'missing';
  /** The last refresh failed over data that is still showing (state 'ready'). Cleared by the next answer. */
  refreshFailed?: boolean;
};

interface PlacesState {
  /** Per drink, the server's rows, in the server's order (people you follow first, then most recent). */
  byDrink: Record<string, Load<DrinkPlace[]>>;
  /** Numbered loads, only the newest writes; nothing when signed out. 'missing' = 026 not applied. */
  loadDrink: (drinkId: string) => Promise<void>;
  /** Per Apple Place ID, the page. 'missing' = nothing visible is tagged there, or 026 not applied (data null). */
  byPlace: Record<string, Load<PlacePage | null>>;
  loadPlace: (appleId: string) => Promise<void>;
  /**
   * Where the last place picked this session is, as MapKit described it a
   * moment before: the next search's bias without location. Memory only,
   * never persisted and never sent (it is Apple's position, so it lives
   * as long as the session and no longer, §0.5): it goes back to MapKit as
   * a bias, and nowhere else.
   */
  lastSpot: LatLng | null;
  rememberSpot: (at: LatLng) => void;
  /** On a change of account (watched below, as the friendsBoard store does). */
  reset: () => void;
  /** Which account's data this is (see store/social): kept out of EMPTY so a reset cannot put it back. */
  gen: number;
}

type Data = Pick<PlacesState, 'byDrink' | 'byPlace' | 'lastSpot'>;

const EMPTY: Data = {
  byDrink: {},
  byPlace: {},
  lastSpot: null,
};

/*
 * A focus refetch racing a pull: only the newest load of each key writes.
 * Null-prototype maps, as data/index.ts's BY_ID: the keys are a drink id
 * or a Place ID from a route, and on an ordinary object
 * drinkSeq['constructor'] is the Object function, which `+ 1` turns into a
 * string that never equals the number a load holds.
 */
const drinkSeq: Record<string, number> = Object.create(null);
const placeSeq: Record<string, number> = Object.create(null);

/*
 * Loading, keeping what is held: an entry that is showing data stays as
 * it is while it refreshes; anything else draws as loading.
 */
function loading<T>(held: Load<T> | undefined, empty: T): Load<T> {
  if (held?.state === 'ready') return held;
  return { data: held?.data ?? empty, state: 'loading' };
}

/* A failure: data showing stays showing, with the refresh marked failed; otherwise failed. */
function failed<T>(held: Load<T> | undefined, empty: T): Load<T> {
  if (held?.state === 'ready') return { ...held, refreshFailed: true };
  return { data: held?.data ?? empty, state: 'failed' };
}

export const usePlaces = create<PlacesState>((set, get) => ({
  ...EMPTY,
  gen: 0,

  loadDrink: async (drinkId) => {
    // Signed out, the function is not callable (anon holds no grant).
    if (!useAuth.getState().session || !drinkId) return;
    const gen = get().gen;
    const seq = (drinkSeq[drinkId] = (drinkSeq[drinkId] ?? 0) + 1);
    const put = (entry: Load<DrinkPlace[]>) => set({ byDrink: { ...get().byDrink, [drinkId]: entry } });
    const before = get().byDrink[drinkId];
    const shown = loading(before, [] as DrinkPlace[]);
    if (shown !== before) put(shown);
    try {
      const rows = await fetchDrinkPlaces(drinkId);
      if (get().gen !== gen || seq !== drinkSeq[drinkId]) return;
      put(rows === null ? { data: [], state: 'missing' } : { data: rows, state: 'ready' });
    } catch {
      if (get().gen !== gen || seq !== drinkSeq[drinkId]) return;
      put(failed(get().byDrink[drinkId], [] as DrinkPlace[]));
    }
  },

  loadPlace: async (id) => {
    if (!useAuth.getState().session || !id) return;
    const gen = get().gen;
    const seq = (placeSeq[id] = (placeSeq[id] ?? 0) + 1);
    const put = (entry: Load<PlacePage | null>) => set({ byPlace: { ...get().byPlace, [id]: entry } });
    const before = get().byPlace[id];
    const shown = loading<PlacePage | null>(before, null);
    if (shown !== before) put(shown);
    try {
      const page = await fetchPlacePage(id);
      if (get().gen !== gen || seq !== placeSeq[id]) return;
      // 026 missing, or nothing visible tagged there: both draw "Place unavailable".
      if (page === null || page.place === null) put({ data: null, state: 'missing' });
      else put({ data: { place: page.place, drinks: page.drinks, peopleHere: page.peopleHere }, state: 'ready' });
    } catch {
      if (get().gen !== gen || seq !== placeSeq[id]) return;
      put(failed<PlacePage | null>(get().byPlace[id], null));
    }
  },

  rememberSpot: (at) => {
    const held = get().lastSpot;
    if (held && held.lat === at.lat && held.lng === at.lng) return;
    set({ lastSpot: { lat: at.lat, lng: at.lng } });
  },

  reset: () => {
    // Every load in flight is now stale: bumping gen alone covers it, and the counters only grow.
    set({ ...EMPTY, gen: get().gen + 1 });
  },
}));

/*
 * A different account, or none, means this store holds someone else's
 * places (who you follow changes "people you follow first"), and the
 * spot of someone else's last pick. Watched here, as store/friendsBoard does, so the sign-in code never
 * imports this one; token refreshes keep the id and reset nothing.
 */
let watchedUserId = useAuth.getState().session?.user.id ?? null;
useAuth.subscribe((state) => {
  const id = state.session?.user.id ?? null;
  if (id === watchedUserId) return;
  watchedUserId = id;
  usePlaces.getState().reset();
});
