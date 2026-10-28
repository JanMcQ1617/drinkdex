import { requireNativeView } from 'expo'; // re-exported by expo (build/Expo.d.ts) as requireNativeViewManager
import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors } from '@/constants/theme';
import { placeModuleAvailable } from '@/lib/placeSearch';

/* ==================================================================== */
/* The Apple map beside a place (specs/v4.8-places 1.8)                 */
/*                                                                      */
/* WHY THERE IS A MAP AT ALL. Apple's licence for MapKit (Developer     */
/* Program License Agreement, Attachment 6 §2.4) does not let an app    */
/* surface an address from Apple Maps "without displaying the           */
/* corresponding Apple map". So the two places that show a venue's      */
/* Apple address, the search sheet's "Tag this place" step and the      */
/* place page, show this map of it too. Both get the venue from Apple   */
/* live (a search, or a look-up by Place ID: Sipply's server keeps no   */
/* position, spec §0.5), and this draws the position it was handed. It  */
/* is a still picture of a few streets with the venue's marker in ink,  */
/* drawn by MapKit itself (modules/place-search/ios/PlaceMapView.swift), */
/* and it never pans, zooms or shows where the person is.               */
/*                                                                      */
/* APPLE'S MARKS STAY VISIBLE (§2.1): MapKit draws its logo and Legal   */
/* link in the map's lower corners, so the map is never smaller than    */
/* MIN_W x MIN_H (where both still fit, HIG Maps), nothing is laid over */
/* it, and it is never clipped by a radius (prints are square too).     */
/*                                                                      */
/* No module, no map: builds up to 32 never run this file's screens     */
/* with Apple's data (they cannot tag, and a fingerprint runtime keeps  */
/* this JS off them), and the web build has no MapKit. The caller then  */
/* draws nothing in its place.                                          */
/* ==================================================================== */

/** Below this MapKit's logo and Legal link start to crowd. */
export const MAP_MIN_W = 200;
export const MAP_MIN_H = 160;

interface NativeProps {
  lat: number;
  lng: number;
  name: string;
  style?: ViewStyle | ViewStyle[];
}

/*
 * Resolved once, at import, and only when the binary has the module:
 * requireNativeView registers a host component by name, and asking for
 * one the binary lacks would warn on every launch of an older build.
 */
const NativePlaceMap = placeModuleAvailable() ? requireNativeView<NativeProps>('PlaceSearch') : null;

/** True where the map can be drawn (build 33 on, iOS). */
export function placeMapAvailable(): boolean {
  return NativePlaceMap !== null;
}

export function PlaceMap({
  lat,
  lng,
  name,
  width,
  height = MAP_MIN_H,
}: {
  lat: number;
  lng: number;
  /** The venue's name: the marker's spoken title, never drawn on the map. */
  name: string;
  width: number;
  height?: number;
}) {
  if (!NativePlaceMap) return null;
  const w = Math.max(MAP_MIN_W, Math.round(width));
  const h = Math.max(MAP_MIN_H, Math.round(height));
  return (
    /*
     * The hair edge sits on a wrapper, as a print's photoEdge does, so the
     * map's own corners (Apple's logo, Legal) are never covered by it.
     */
    <View style={[styles.frame, { width: w, height: h }]}>
      <NativePlaceMap lat={lat} lng={lng} name={name} style={styles.fill} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.bgSunk,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hair,
    overflow: 'hidden',
  },
  fill: { flex: 1 },
});
