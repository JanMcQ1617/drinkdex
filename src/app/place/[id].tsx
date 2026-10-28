import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { AuthGate } from '@/components/AuthGate';
import { PlacePage } from '@/components/places/PlacePage';
import { isPlaceId } from '@/lib/placeSearch';
import { isPlaceholderUsername, useAuth } from '@/store/auth';

/* ==================================================================== */
/* A place (specs/v4.8-places 3.4)                                      */
/*                                                                      */
/* A root-stack screen pushed from a post's "at La Factoría" and from a */
/* drink page's Where people have had it, as user/[id] is pushed from a */
/* name, so _layout.tsx needs no Stack.Screen for it and                */
/* drinkdex://place/<Place ID> lands here with no +native-intent change. */
/*                                                                      */
/* KEYED BY APPLE'S PLACE ID (the licence rework, spec §0.5). Sipply    */
/* has no place rows of its own any more: a place is the Place ID its   */
/* tagged photos share, so that id is the page's address. It is case-   */
/* sensitive ("I63802885C8189B2B"), so unlike a uuid it is never        */
/* lowercased.                                                          */
/*                                                                      */
/* Gated exactly as user/[id] is, and for its reasons: signed out,      */
/* AuthGate stands in with the sign-in screen, and with the handle      */
/* still a placeholder, with the username step. Places are read under   */
/* the posts' rules (a place page is built from posts), so there is     */
/* nothing to show anyone signed out. Both gates close the way Back     */
/* does: out of this screen, or Home when a link opened it cold.        */
/*                                                                      */
/* The id must have a Place ID's shape (the server's own check, 026's   */
/* post_photos_place_id_shape). Anything else is the missing state at   */
/* once, never a query: a link is untrusted text.                       */
/* ==================================================================== */

export default function PlaceScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  // expo-router hands the segment back decoded; Place IDs are case-sensitive, so it is used as it is.
  const id = String(params.id ?? '');
  const valid = isPlaceId(id);
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id);
  const profile = useAuth((s) => s.profile);
  // The same test AuthGate makes before it lets an account in.
  const unnamed = !!profile && profile.id === myId && isPlaceholderUsername(profile.username);

  /* Back is the stack's back; opened cold from a link there is nothing under this screen, so Home. */
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  if (!myId || unnamed) return <AuthGate onClose={leave}>{null}</AuthGate>;
  return <PlacePage id={id} valid={valid} onBack={leave} />;
}
