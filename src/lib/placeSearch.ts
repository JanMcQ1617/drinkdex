import { requireOptionalNativeModule } from 'expo'; // re-exported by expo (build/Expo.d.ts), checked in 57.0.27
import { Platform } from 'react-native';

/* ==================================================================== */
/* Place search: the JS face of modules/place-search                     */
/* (specs/v4.8-places/spec.md §1.7)                                      */
/*                                                                      */
/* Apple Maps through MapKit, on the phone. What the person types and    */
/* where they are go to Apple only: nothing in this file calls Sipply's  */
/* server. Of what it returns, only two things ever reach Sipply, and    */
/* only when a post is tagged: the venue's Apple Place ID and the label  */
/* the poster gives it (lib/places, store/social). currentCoordinate's   */
/* fix is for biasing a search and "350 ft" on this phone; NEVER pass it */
/* to supabase, a URL, a log or storage (§2.6).                         */
/*                                                                      */
/* APPLE'S DATA STAYS APPLE'S (the licence rework, spec §0.5). MapKit's  */
/* licence (DPLA Attachment 6 §2.2, §2.5) rules out a server database   */
/* of Apple's names, addresses and positions, and allows caching them   */
/* only "on a temporary and limited basis". So the server keeps only    */
/* the Place ID, and resolvePlace() asks Apple for the rest by that id  */
/* whenever a screen needs it, holding the answer in this file's memory */
/* only: at most RESOLVED_MAX places, each for RESOLVED_TTL_MS, gone on  */
/* relaunch, never written to storage. Place IDs are iOS 18 and later,  */
/* so tagging is too (placeSearchAvailable).                            */
/*                                                                      */
/* The module ships from build 33. Earlier builds that take an EAS       */
/* Update carrying this file have no PlaceSearch native module, and the  */
/* web build has none either, so `native` is null there and every        */
/* function answers "nothing" (null, [], 'unavailable', false) instead   */
/* of throwing: placeSearchAvailable() is false and tagging hides.       */
/*                                                                      */
/* Every native row is checked, not trusted (lib/friendsBoard's          */
/* pattern): MapKit's records are Apple's, but the shape crossing the    */
/* bridge is hand-built in PlaceSearchEngine.swift, and the Place ID in */
/* a row may reach the server, whose check (026's                       */
/* post_photos_place_id_shape) is the same APPLE_ID shape as here, so a */
/* row that passes here is never refused there for its id.              */
/* ==================================================================== */

/**
 * Mirrors venueTable() in modules/place-search/ios/PlaceSearchEngine.swift and
 * PLACE_CATEGORY_LABEL in src/lib/places.ts (tsc holds that one to this list).
 * Change them together. The server stores no kind (spec §0.5): the list is
 * enforced on the phone, where a venue is picked.
 */
export const VENUE_CATEGORIES = [
  'nightlife', 'brewery', 'winery', 'distillery', 'restaurant', 'cafe', 'hotel', 'musicVenue',
] as const;
export type PlaceCategory = (typeof VENUE_CATEGORIES)[number];

export interface LatLng { lat: number; lng: number }

/** A row of as-you-type suggestions. `id` is a native token, valid for the last two sets only. */
export interface PlaceSuggestion { id: string; title: string; subtitle: string }

/**
 * A venue as Apple Maps describes it, found by a search. Of this, only
 * `appleId` (and the label the poster makes from `name`) is ever sent to
 * Sipply; the rest is for the "Tag this place" step's map and words.
 */
export interface FoundPlace {
  appleId: string;               // MKMapItem.identifier (iOS 18+); a row without one is not taggable
  name: string;
  address: string | null;        // one line, without the country
  locality: string | null;
  country: string | null;        // ISO 3166-1 alpha-2, "PR"
  lat: number;
  lng: number;
  category: PlaceCategory;
}

/**
 * A stored Place ID looked up again with Apple (resolvePlace): what the
 * place page shows beside Apple's map. `category` is null when Apple files
 * the place outside VENUE_CATEGORIES now (it was a venue when tagged).
 * Held in memory only, for the session (see the header).
 */
export interface ResolvedPlace {
  appleId: string;
  name: string;
  address: string | null;
  locality: string | null;
  lat: number;
  lng: number;
  category: PlaceCategory | null;
}

export type LocationPermission = 'unavailable' | 'undetermined' | 'denied' | 'restricted' | 'granted';
export interface LocationState { permission: LocationPermission; precise: boolean }

export type PlaceSearchErrorCode = 'offline' | 'throttled' | 'stale' | 'failed' | 'unavailable';
export class PlaceSearchError extends Error {
  constructor(
    readonly code: PlaceSearchErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

/* -------------------------------------------------------------------- */
/* The native module                                                    */
/* -------------------------------------------------------------------- */

/** What PlaceSearchModule.swift defines. Results are `unknown` on purpose: they are checked below. */
interface NativeShape {
  placeIdsAvailable(): boolean;
  resolvePlace(id: string): Promise<unknown>;
  suggest(query: string, bias: LatLng | null): Promise<unknown>;
  resolve(id: string): Promise<unknown>;
  search(query: string, bias: LatLng | null): Promise<unknown>;
  nearby(center: LatLng): Promise<unknown>;
  cancel(): Promise<void>;
  locationState(): Promise<unknown>;
  requestLocation(): Promise<unknown>;
  currentCoordinate(): Promise<unknown>;
  openInAppleMaps(target: { appleId: string | null; name: string; lat: number; lng: number }): Promise<unknown>;
  formatDistance(meters: number): string;
}

/*
 * iOS only: Sipply ships no Android build, and Platform.OS keeps the web
 * bundle from asking. requireOptionalNativeModule answers null rather than
 * throwing when the binary has no such module (builds up to 32).
 */
const native: NativeShape | null =
  Platform.OS === 'ios' ? requireOptionalNativeModule<NativeShape>('PlaceSearch') : null;

/** True on an iOS build that contains the module (build 33 on): the map can be drawn. */
export function placeModuleAvailable(): boolean {
  return native !== null;
}

/*
 * Read once: it is an availability check (iOS 18), the same answer all
 * session. A module without the function (none shipped, but an update
 * could in principle meet one) reads as "no Place IDs", which only hides
 * tagging.
 */
const placeIds: boolean = (() => {
  if (!native) return false;
  try {
    return native.placeIdsAvailable() === true;
  } catch {
    return false;
  }
})();

/**
 * True where a place can be TAGGED: the module is in this build and the
 * phone has Apple Place IDs (iOS 18 and later), since a Place ID is all the
 * server keeps about a venue (spec §0.5). False everywhere else: the Add
 * place rows hide, while places tagged by others still show as their
 * label. Also gates resolvePlace, which needs the same iOS 18 API.
 */
export function placeSearchAvailable(): boolean {
  return placeIds;
}

/* A call a newer one took over. Kept apart from null, which resolve() reads as "not a venue". */
const SUPERSEDED: unique symbol = Symbol('superseded');
type Superseded = typeof SUPERSEDED;

function nativeCode(e: unknown): string | null {
  if (typeof e !== 'object' || e === null) return null;
  const code = (e as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/*
 * The engine's codes (PlaceSearchEngine.swift's failure()) to ours. A
 * cancelled call is not an error: the sheet asked for something newer, and
 * the caller drops it.
 */
async function ask<T>(call: Promise<unknown>, shape: (raw: unknown) => T): Promise<T | Superseded> {
  let raw: unknown;
  try {
    raw = await call;
  } catch (e) {
    const code = nativeCode(e);
    if (code === 'ERR_PLACES_CANCELLED') return SUPERSEDED;
    const message = e instanceof Error ? e.message : undefined;
    if (code === 'ERR_PLACES_THROTTLED') throw new PlaceSearchError('throttled', message);
    if (code === 'ERR_PLACES_OFFLINE') throw new PlaceSearchError('offline', message);
    if (code === 'ERR_PLACES_STALE') throw new PlaceSearchError('stale', message);
    throw new PlaceSearchError('failed', message);
  }
  return shape(raw);
}

/* -------------------------------------------------------------------- */
/* Checked, not trusted                                                 */
/* -------------------------------------------------------------------- */

/** 026's post_photos_place_id_shape, and what the place route accepts. */
const APPLE_ID = /^[A-Za-z0-9._:-]{1,100}$/;
const COUNTRY = /^[A-Z]{2}$/;

/** Whether `s` has the shape of an Apple Place ID (as the server checks it). */
export function isPlaceId(s: unknown): s is string {
  return typeof s === 'string' && APPLE_ID.test(s);
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/*
 * Trimmed and cut to `max` CODE POINTS, which is what 026's char_length()
 * counts. Native cut to `max` Swift Characters, and one Character (a flag, a
 * family emoji) can be several code points; slicing UTF-16 units instead
 * could split a surrogate pair, which Postgres rejects. Empty is null.
 */
function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = Array.from(v.trim()).slice(0, max).join('').trim();
  return t.length > 0 ? t : null;
}

const isCategory = (v: unknown): v is PlaceCategory =>
  typeof v === 'string' && (VENUE_CATEGORIES as readonly string[]).includes(v);

/** A usable point, or null: finite, on the globe, and not (0, 0), which MapKit uses for "unknown". */
function point(lat: unknown, lng: unknown): LatLng | null {
  const a = num(lat);
  const b = num(lng);
  if (a === null || b === null) return null;
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  if (a === 0 && b === 0) return null;
  return { lat: a, lng: b };
}

/* A row's Place ID, trimmed, or null when it has none of the right shape. */
const placeIdOf = (v: unknown): string | null => (typeof v === 'string' && APPLE_ID.test(v.trim()) ? v.trim() : null);

/*
 * A search's venue. Without a Place ID it is dropped, not shown untaggable:
 * the server keeps nothing else, so a venue without one cannot be tagged
 * (Apple gives nearly every point of interest one on iOS 18).
 */
function toFoundPlace(raw: unknown): FoundPlace | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const name = text(r.name, 120);
  const at = point(r.lat, r.lng);
  const appleId = placeIdOf(r.appleId);
  if (!name || !at || !appleId || !isCategory(r.category)) return null;
  const country = typeof r.country === 'string' && COUNTRY.test(r.country.trim()) ? r.country.trim() : null;
  return {
    appleId,
    name,
    address: text(r.address, 300),
    locality: text(r.locality, 120),
    country,
    lat: at.lat,
    lng: at.lng,
    category: r.category,
  };
}

function toFoundPlaces(raw: unknown, max: number): FoundPlace[] {
  if (!Array.isArray(raw)) return [];
  const out: FoundPlace[] = [];
  for (const item of raw) {
    if (out.length >= max) break;
    const place = toFoundPlace(item);
    if (place) out.push(place);
  }
  return out;
}

function toSuggestions(raw: unknown): PlaceSuggestion[] {
  if (!Array.isArray(raw)) return [];
  const out: PlaceSuggestion[] = [];
  for (const item of raw) {
    if (out.length >= 8) break;
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : null;
    const title = text(r.title, 200);
    if (!id || !title) continue;
    out.push({ id, title, subtitle: text(r.subtitle, 300) ?? '' });
  }
  return out;
}

/*
 * Only { lat, lng } crosses to native, whatever the caller passed (the
 * bias is a LatLng: the phone's own fix, or store/places' lastSpot, the
 * last pick's position held in memory only, since a PlaceRef is just
 * { appleId, label } and carries no position), and a point that is not
 * one becomes "no bias" rather than an error.
 */
const toBias = (p: LatLng | null | undefined): LatLng | null => (p ? point(p.lat, p.lng) : null);

/* Case and accents folded, as lib/drinkSearch does, so "Factoria" matches "La Factoría". */
const fold = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

/* -------------------------------------------------------------------- */
/* Suggestions (debounced here, so every caller gets it)                */
/* -------------------------------------------------------------------- */

const SUGGEST_DEBOUNCE_MS = 150;

/*
 * A generation counter: each call takes the next number, and only the newest
 * may answer with rows. A call overtaken inside the 150 ms window resolves
 * null without ever reaching native; one overtaken after it reached native
 * resolves null too (native also settles it as cancelled), so a slow answer
 * for "neg" can never paint over "negroni".
 */
let suggestGen = 0;
let pendingSuggest: { timer: ReturnType<typeof setTimeout>; drop: () => void } | null = null;

function dropPendingSuggest() {
  if (!pendingSuggest) return;
  clearTimeout(pendingSuggest.timer);
  pendingSuggest.drop();
  pendingSuggest = null;
}

/**
 * As-you-type suggestions, venues only, at most 8. Waits 150 ms after the last
 * call before asking (the debounce lives here, so every caller gets it).
 * null = superseded by a newer call: drop it. [] under 2 characters.
 */
export function suggest(query: string, bias?: LatLng | null): Promise<PlaceSuggestion[] | null> {
  const gen = ++suggestGen;
  dropPendingSuggest();
  const mod = native;
  if (!mod) return Promise.resolve([]);
  const q = query.trim();
  if (q.length < 2) {
    // Native stops the completer on a short fragment; the rows answer here, at once.
    mod.suggest('', null).catch(() => {});
    return Promise.resolve([]);
  }
  const at = toBias(bias);
  return new Promise<PlaceSuggestion[] | null>((settle, fail) => {
    const timer = setTimeout(() => {
      pendingSuggest = null;
      ask(mod.suggest(q, at), toSuggestions).then(
        (rows) => settle(rows === SUPERSEDED || gen !== suggestGen ? null : rows),
        (e: unknown) => (gen !== suggestGen ? settle(null) : fail(e)),
      );
    }, SUGGEST_DEBOUNCE_MS);
    pendingSuggest = { timer, drop: () => settle(null) };
  });
}

/* -------------------------------------------------------------------- */
/* Venues: resolve, search, nearby (one MKLocalSearch at a time native) */
/* -------------------------------------------------------------------- */

async function searchRows(query: string, bias: LatLng | null): Promise<FoundPlace[] | Superseded> {
  if (!native) return [];
  return ask(native.search(query, bias), (raw) => toFoundPlaces(raw, 15));
}

/**
 * A suggestion to a venue. 'not_taggable' = it led to something outside
 * VENUE_CATEGORIES. null = superseded.
 *
 * A tap on a row from a set native no longer holds (more than one set ago)
 * answers 'stale' natively. Rather than make the person tap again, it is
 * retried once as a search for the row's own text, taking the first venue
 * whose name is the row's title after folding; only if none is does the
 * 'stale' error reach the caller.
 */
export async function resolve(s: PlaceSuggestion): Promise<FoundPlace | 'not_taggable' | null> {
  if (!native) return null;
  try {
    const found = await ask(native.resolve(s.id), (raw) =>
      raw === null || raw === undefined ? ('not_taggable' as const) : (toFoundPlace(raw) ?? ('not_taggable' as const)),
    );
    return found === SUPERSEDED ? null : found;
  } catch (e) {
    if (!(e instanceof PlaceSearchError) || e.code !== 'stale') throw e;
    const rows = await searchRows(`${s.title} ${s.subtitle}`.trim(), null);
    if (rows === SUPERSEDED) return null;
    const title = fold(s.title);
    const match = rows.find((p) => fold(p.name) === title);
    if (match) return match;
    throw e;
  }
}

/** The return key's search, at most 15. null = superseded. */
export async function search(query: string, bias?: LatLng | null): Promise<FoundPlace[] | null> {
  const rows = await searchRows(query.trim(), toBias(bias));
  return rows === SUPERSEDED ? null : rows;
}

/** Venues within 800 m of `center`, nearest first, at most 20. null = superseded. */
export async function nearby(center: LatLng): Promise<FoundPlace[] | null> {
  const at = toBias(center);
  if (!native || !at) return [];
  const rows = await ask(native.nearby(at), (raw) => toFoundPlaces(raw, 20));
  return rows === SUPERSEDED ? null : rows;
}

/* -------------------------------------------------------------------- */
/* A stored Place ID, looked up again (the place page)                   */
/* -------------------------------------------------------------------- */

/*
 * "Temporary and limited" (§2.5), in numbers: a place page visited again
 * within half an hour draws at once, and nothing outlives the session or
 * grows past a hundred places. Map order is insertion order, so the
 * oldest entry is the first key.
 */
const RESOLVED_TTL_MS = 30 * 60 * 1000;
const RESOLVED_MAX = 100;
const resolved = new Map<string, { at: number; place: ResolvedPlace | null }>();
const resolving = new Map<string, Promise<ResolvedPlace | null>>();

function keep(appleId: string, place: ResolvedPlace | null) {
  resolved.delete(appleId);
  resolved.set(appleId, { at: Date.now(), place });
  while (resolved.size > RESOLVED_MAX) {
    const oldest = resolved.keys().next().value;
    if (oldest === undefined) break;
    resolved.delete(oldest);
  }
}

function toResolvedPlace(raw: unknown, asked: string): ResolvedPlace | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const name = text(r.name, 120);
  const at = point(r.lat, r.lng);
  if (!name || !at) return null;
  return {
    // Apple may hand back a newer id for the same place; the screen keeps using the one it asked with.
    appleId: asked,
    name,
    address: text(r.address, 300),
    locality: text(r.locality, 120),
    lat: at.lat,
    lng: at.lng,
    category: isCategory(r.category) ? r.category : null,
  };
}

/**
 * What this session already holds for a Place ID: the place, null (Apple
 * does not know it), or undefined (not asked yet, or the answer is older
 * than RESOLVED_TTL_MS). Lets a screen draw a revisit with no blink.
 */
export function cachedPlace(appleId: string): ResolvedPlace | null | undefined {
  const hit = resolved.get(appleId);
  if (!hit) return undefined;
  if (Date.now() - hit.at > RESOLVED_TTL_MS) {
    resolved.delete(appleId);
    return undefined;
  }
  return hit.place;
}

/**
 * Apple's current record for a stored Place ID (MKMapItemRequest), for the
 * place page. Null when this phone cannot look one up (no module, below
 * iOS 18), when the id is not one, or when Apple no longer knows it. One
 * request per id at a time, shared; answers (null included) are kept in
 * memory as the header says, failures are not. Throws PlaceSearchError
 * ('offline', 'throttled', 'failed') so the page can say why.
 */
export async function resolvePlace(appleId: string): Promise<ResolvedPlace | null> {
  const mod = native;
  if (!mod || !placeIds || !APPLE_ID.test(appleId)) return null;
  const held = cachedPlace(appleId);
  if (held !== undefined) return held;
  const flying = resolving.get(appleId);
  if (flying) return flying;
  const ask = (async () => {
    let raw: unknown;
    try {
      raw = await mod.resolvePlace(appleId);
    } catch (e) {
      const code = nativeCode(e);
      const message = e instanceof Error ? e.message : undefined;
      if (code === 'ERR_PLACES_THROTTLED') throw new PlaceSearchError('throttled', message);
      if (code === 'ERR_PLACES_OFFLINE') throw new PlaceSearchError('offline', message);
      throw new PlaceSearchError('failed', message);
    }
    const place = raw === null || raw === undefined ? null : toResolvedPlace(raw, appleId);
    keep(appleId, place);
    return place;
  })();
  resolving.set(appleId, ask);
  try {
    return await ask;
  } finally {
    resolving.delete(appleId);
  }
}

/**
 * The venue just tagged, as the search found it seconds ago, so opening
 * its page straight after posting needs no second ask of Apple. The same
 * memory, the same limits.
 */
export function rememberFound(found: FoundPlace): void {
  keep(found.appleId, {
    appleId: found.appleId,
    name: found.name,
    address: found.address,
    locality: found.locality,
    lat: found.lat,
    lng: found.lng,
    category: found.category,
  });
}

/** Cancels anything in flight (the sheet's close). */
export function cancelPlaceSearch(): void {
  suggestGen += 1;
  dropPendingSuggest();
  native?.cancel().catch(() => {});
}

/* -------------------------------------------------------------------- */
/* Location: When In Use, asked only from "Show places near me"         */
/* -------------------------------------------------------------------- */

const UNAVAILABLE: LocationState = { permission: 'unavailable', precise: false };
const PERMISSIONS: readonly LocationPermission[] = ['undetermined', 'denied', 'restricted', 'granted'];

function toLocationState(raw: unknown): LocationState {
  if (typeof raw !== 'object' || raw === null) return UNAVAILABLE;
  const r = raw as Record<string, unknown>;
  const permission = PERMISSIONS.find((p) => p === r.permission);
  if (!permission) return UNAVAILABLE;
  return { permission, precise: permission === 'granted' && r.precise === true };
}

/*
 * Asked fresh every time, never cached: the person can change it in
 * Settings while the app runs, and the sheet reads it on each open. A
 * failure reads as 'unavailable', so the screen falls back to text search,
 * which needs no permission at all.
 */

/** 'unavailable' when the module is missing. Never prompts. */
export async function locationState(): Promise<LocationState> {
  if (!native) return UNAVAILABLE;
  try {
    return toLocationState(await native.locationState());
  } catch {
    return UNAVAILABLE;
  }
}

/** Shows the system prompt only while 'undetermined'; otherwise answers at once. */
export async function requestLocation(): Promise<LocationState> {
  if (!native) return UNAVAILABLE;
  try {
    return toLocationState(await native.requestLocation());
  } catch {
    return UNAVAILABLE;
  }
}

/**
 * A coarse fix (about 100 m), only when already granted; null otherwise. Never prompts. NEVER send it anywhere.
 * The accuracy native reports is dropped here, so nothing past this line has more than a point.
 */
export async function currentCoordinate(): Promise<LatLng | null> {
  if (!native) return null;
  try {
    const raw = await native.currentCoordinate();
    if (typeof raw !== 'object' || raw === null) return null;
    const r = raw as Record<string, unknown>;
    return point(r.lat, r.lng);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------- */
/* Maps and distance                                                    */
/* -------------------------------------------------------------------- */

/**
 * Native Apple Maps: Apple's own card by id on iOS 18+, else a pin with the name. False if Maps did not open.
 * On false the caller opens lib/places' appleMapsUrl instead. Takes a place Apple just described (a
 * ResolvedPlace), never one rebuilt from Sipply's server, which holds no position.
 */
export async function openInAppleMaps(p: { appleId: string | null; name: string; lat: number; lng: number }): Promise<boolean> {
  const at = point(p.lat, p.lng);
  if (!native || !at) return false;
  const appleId = p.appleId && APPLE_ID.test(p.appleId) ? p.appleId : null;
  try {
    return (await native.openInAppleMaps({ appleId, name: p.name, lat: at.lat, lng: at.lng })) === true;
  } catch {
    return false;
  }
}

/* The fallback without the module: metres to the nearest 10 under a kilometre, else kilometres to one place. */
function plainDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

/** "350 ft" / "1.2 km" in the phone's units (MKDistanceFormatter); a plain km/m fallback without the module. */
export function formatDistance(meters: number): string {
  const m = Number.isFinite(meters) ? Math.max(0, meters) : 0;
  if (native) {
    try {
      const s = native.formatDistance(m);
      if (typeof s === 'string' && s.length > 0) return s;
    } catch {
      // Fall through to the plain form.
    }
  }
  return plainDistance(m);
}
