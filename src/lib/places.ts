import type { Href } from 'expo-router';

import { getDrink } from '@/data';
import type { DrinkPlaceRow, PlaceDrinkRow } from '@/lib/database.types';
import { containsObjectionable, isObjectionableError } from '@/lib/moderation';
import { isPlaceId, type LatLng, type PlaceCategory, type ResolvedPlace } from '@/lib/placeSearch';
import { disablePlaces, isMissingPlaces, placesSupported } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { PlaceRef, Post } from '@/types';

/* ==================================================================== */
/* Places (specs/v4.8-places/spec.md 2 and §0.5, migration 026)         */
/*                                                                      */
/* The bar a drink was had at, as data: what the screens read, and the  */
/* one write that tags or untags a photo after it was posted. Finding a */
/* venue is the phone's and Apple's (lib/placeSearch, MapKit).          */
/*                                                                      */
/* WHAT SIPPLY KEEPS (the licence rework, §0.5). Apple's MapKit licence */
/* (DPLA Attachment 6) forbids a "secondary or derived database" of its */
/* Map Data (§2.2) and allows only "temporary and limited" caching      */
/* (§2.5). So the server keeps, per tagged photo, exactly two things:   */
/* Apple's Place ID (a stable reference Apple lets apps store) and the  */
/* poster's LABEL for it, which the "Tag this place" step prefills with */
/* Apple's name and lets the poster edit like a caption. The label is   */
/* the poster's words, filtered like a caption, and is what every       */
/* screen prints. Nothing of Apple's beyond the id is ever sent: no     */
/* address, area, kind or position. The place page asks Apple for those */
/* live, by id (lib/placeSearch's resolvePlace), and shows them only    */
/* beside Apple's map.                                                  */
/*                                                                      */
/* NOTHING HERE TAKES THE DEVICE'S LOCATION AND SENDS IT, and nothing   */
/* sorts by distance any more: there are no coordinates on the server   */
/* to sort by, and the drink page never asks for location.              */
/*                                                                      */
/* Counts are PEOPLE, never amounts, and nothing is ranked by them      */
/* (App Review 1.4.3): people you follow first, then most recent.       */
/*                                                                      */
/* No flag. Until 026 is applied every read answers "missing" (null),   */
/* which switches placesSupported() off for the session (lib/social     */
/* holds the switch), and the build looks like build 32. A relaunch     */
/* asks again.                                                          */
/* ==================================================================== */

export { placesSupported };

/** What a post's photo carries (declared in types.ts, which imports nothing; re-exported here with the other shapes). */
export type { PlaceRef };

/** A row of the drink page's "Where people have had it". */
export interface DrinkPlace {
  place: PlaceRef;
  /** Different people who tagged a photo of this drink here. Never an amount. */
  people: number;
  /** Someone you follow is among them (never you). */
  followed: boolean;
  lastAt: string;
}

/** A tile of a place page's grid. */
export interface PlaceDrink {
  drinkId: string;
  people: number;
  postId: string;
  photoPath: string | null;
  lastAt: string;
}

export interface PlacePage {
  /** The Place ID and the newest label anyone visible to you gave it. */
  place: PlaceRef;
  drinks: PlaceDrink[];
  /** Different people over every drink here (distinct people cannot be summed on the phone). */
  peopleHere: number;
}

/*
 * The words for each kind. Typed against PlaceCategory, which
 * lib/placeSearch derives from VENUE_CATEGORIES, so a kind added there and
 * not here fails tsc (the other copy: venueTable() in modules/place-search).
 * Only ever drawn from Apple's live answer, never from the server, which
 * stores no kind.
 */
export const PLACE_CATEGORY_LABEL: Record<PlaceCategory, string> = {
  nightlife: 'Bar',
  brewery: 'Brewery',
  winery: 'Winery',
  distillery: 'Distillery',
  restaurant: 'Restaurant',
  cafe: 'Café',
  hotel: 'Hotel',
  musicVenue: 'Music venue',
};

/* ==================================================================== */
/* The label: the poster's name for the place                           */
/*                                                                      */
/* Held to the server's rule (026's post_photos_place_label_shape and   */
/* set_photo_place): 1 to 60 characters counted as code points, no      */
/* edge spaces, runs of spaces as one, no control characters, so it     */
/* stays one line in a post's header. The caption filter is run here    */
/* first so a refused word is said in the step, not after posting; the  */
/* server runs the same filter (the label's trigger) whatever arrives.  */
/* ==================================================================== */

export const PLACE_LABEL_MAX = 60;

/**
 * The label as it will be stored: control characters gone, whitespace
 * runs made one space, trimmed, cut to PLACE_LABEL_MAX code points (what
 * char_length counts; slicing UTF-16 units could split a surrogate pair).
 */
export function cleanLabel(raw: string): string {
  // Invisible direction overrides and zero-width marks are dropped: a label
  // is shown to everyone, and U+202E can make one read backwards or hide a
  // word from the filter. The same set as 026's set_photo_place and its
  // table check, so the three stay in step. The joiners U+200C/U+200D stay
  // (Persian, the Indic scripts and emoji sequences need them).
  // Then C0 and C1 control characters (line breaks, tabs) become spaces, so the label stays one line.
  const flat = raw
    .replace(/[​‎‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(flat).slice(0, PLACE_LABEL_MAX).join('').trim();
}

/** Why a label cannot be used, or null when it can. Run on cleanLabel's answer. */
export function labelProblem(label: string): 'empty' | 'objectionable' | null {
  if (label.length === 0) return 'empty';
  if (containsObjectionable(label)) return 'objectionable';
  return null;
}

/* ==================================================================== */
/* Checked, not trusted                                                 */
/*                                                                      */
/* lib/friendsBoard's pattern: the row types are hand-typed, and a      */
/* label is someone else's words.                                       */
/* ==================================================================== */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** A trimmed string, or null for anything else, empty included. */
function text(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function finite(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** A whole number of people, never below nought. */
function count(v: unknown): number {
  return Math.max(0, Math.floor(finite(v) ?? 0));
}

/** A place from a Place ID and a label, or null when either is unusable. */
export function toPlaceRef(id: unknown, label: unknown): PlaceRef | null {
  const appleId = text(id);
  const said = typeof label === 'string' ? cleanLabel(label) : '';
  if (!appleId || !isPlaceId(appleId) || said.length === 0) return null;
  return { appleId, label: said };
}

function toDrinkPlace(r: DrinkPlaceRow): DrinkPlace | null {
  const place = toPlaceRef(r.apple_place_id, r.label);
  const lastAt = text(r.last_at);
  if (!place || !lastAt) return null;
  return { place, people: Math.max(1, count(r.people)), followed: r.followed === true, lastAt };
}

/** A drink not in this build (the wine and beer removed on 20 Sep 2026) is dropped: there is no page to open. */
function toPlaceDrink(r: PlaceDrinkRow): PlaceDrink | null {
  const drinkId = text(r.drink_id);
  const postId = text(r.post_id);
  const lastAt = text(r.last_at);
  if (!drinkId || !getDrink(drinkId) || !postId || !UUID.test(postId) || !lastAt) return null;
  return { drinkId, people: count(r.people), postId, photoPath: text(r.photo_path), lastAt };
}

/* ==================================================================== */
/* Writes                                                               */
/* ==================================================================== */

export type SetPhotoPlaceResult = 'ok' | 'refused' | 'objectionable' | 'failed';

/**
 * set_photo_place: tags a photo of your own post with a place (its Place
 * ID and your label), or (null) takes the tag off. 'refused' when it is
 * not yours or the photo is gone (or the server found the label
 * malformed, which cleanLabel prevents); 'objectionable' when the
 * caption filter refused the label; 'failed' when it did not go through.
 * A missing function (026 not applied) also switches places off. Never
 * throws.
 */
export async function setPhotoPlaceRemote(postId: string, path: string, place: PlaceRef | null): Promise<SetPhotoPlaceResult> {
  try {
    const { data, error } = await supabase.rpc('set_photo_place', {
      p_post_id: postId,
      p_path: path,
      p_apple_place_id: place?.appleId ?? null,
      p_label: place ? cleanLabel(place.label) : null,
    });
    if (error) {
      if (isMissingPlaces(error)) {
        disablePlaces();
        return 'failed';
      }
      if (isObjectionableError(error)) return 'objectionable';
      if (/place_invalid/.test(error.message ?? '')) return 'refused';
      return 'failed';
    }
    return data === true ? 'ok' : 'refused';
  } catch {
    return 'failed';
  }
}

/* ==================================================================== */
/* Reads                                                                */
/* ==================================================================== */

/**
 * drink_places: where people have had this drink, people you follow
 * first, then the most recently posted (the server's order, kept as it
 * is: there is no distance to sort by). Null when 026 is missing, which
 * also switches places off. Throws on any other failure. Rows are
 * checked, not trusted. The drink id is all that is sent.
 */
export async function fetchDrinkPlaces(drinkId: string): Promise<DrinkPlace[] | null> {
  const { data, error } = await supabase.rpc('drink_places', { p_drink_id: drinkId });
  if (error) {
    if (isMissingPlaces(error)) {
      disablePlaces();
      return null;
    }
    throw error;
  }
  return (Array.isArray(data) ? data : []).map(toDrinkPlace).filter((r): r is DrinkPlace => r !== null);
}

/**
 * A place page from Sipply's side: the newest label and what people have
 * had there (place_drinks). Null when 026 is missing. `place` null when
 * nothing visible to you is tagged there (a bad id, every tag removed, or
 * all by people you are blocked with). Drinks not in this build are
 * dropped. Throws on any other failure. Apple's side (the address, the
 * map) is the screen's, live, by id.
 */
export async function fetchPlacePage(
  appleId: string,
): Promise<{ place: PlaceRef | null; drinks: PlaceDrink[]; peopleHere: number } | null> {
  if (!isPlaceId(appleId)) return { place: null, drinks: [], peopleHere: 0 };
  const { data, error } = await supabase.rpc('place_drinks', { p_apple_place_id: appleId });
  if (error) {
    if (isMissingPlaces(error)) {
      disablePlaces();
      return null;
    }
    throw error;
  }
  const rows = Array.isArray(data) ? data : [];
  const place = rows.length > 0 ? toPlaceRef(appleId, rows[0].label) : null;
  return {
    place,
    drinks: rows.map(toPlaceDrink).filter((r): r is PlaceDrink => r !== null),
    peopleHere: rows.length > 0 ? count(rows[0].people_here) : 0,
  };
}

/* ==================================================================== */
/* On the phone                                                         */
/* ==================================================================== */

/** Great-circle metres (haversine): "350 ft" beside a search row, from MapKit's live positions only. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "/place/<Place ID>". A typed-route escape (lib/tournaments' reason); the id's alphabet is URL-safe. */
export const placeHref = (appleId: string) => `/place/${encodeURIComponent(appleId)}` as Href;

/*
 * No Google Maps link (spec P2, revised 26 Oct 2026). Map Data shown on a
 * map is shown only on an Apple map (DPLA Attachment 6 §2.4).
 */

/**
 * Apple Maps by URL: the fallback when lib/placeSearch's native
 * openInAppleMaps answers false. Built from Apple's live answer (a
 * ResolvedPlace), since Sipply holds no position.
 */
export function appleMapsUrl(p: ResolvedPlace): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(p.name)}&ll=${p.lat},${p.lng}`;
}

/** Whether two places are the same tag: one Place ID, and the same words. */
export function samePlace(a: PlaceRef | null | undefined, b: PlaceRef | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.appleId === b.appleId && a.label === b.label;
}

/**
 * The place on THIS photo of a post (the one on screen), or null. Read
 * through hasOwn: a path is a key into a plain object.
 */
export function photoPlace(post: Post, path: string | null | undefined): PlaceRef | null {
  if (!path || !post.places || !hasOwn(post.places, path)) return null;
  return post.places[path] ?? null;
}
