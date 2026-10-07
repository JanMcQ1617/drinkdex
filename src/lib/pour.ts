import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import type { PostOutcome } from '@/store/social';
import { showNotice } from '@/utils/alerts';

/* ==================================================================== */
/* Posting a drink — the shared half                                    */
/*                                                                      */
/* Picking a photo and persisting it used to live inside drink/[id],    */
/* which was fine while that screen was the only way to post anything.  */
/* The centre action in the tab bar is a second way in, and two copies  */
/* of this would mean two answers to "where do pour photos live" — the  */
/* kind of divergence that shows up months later as photos that survive */
/* from one entry point and vanish from the other.                      */
/*                                                                      */
/* The pickers and stripMetadata also serve the profile picture, so the */
/* words they return must not assume a drink. reportPost and            */
/* reportPostPhoto are the post's alone, worded for either way of       */
/* posting.                                                             */
/*                                                                      */
/* The files on disk are this module's too: where they are written, how */
/* a saved path is re-rooted after an update, and how they are deleted. */
/* Those three lived in the collection store while it was the only     */
/* thing holding a photo. Drinks people add themselves hold photos as   */
/* well (their pours and their entry photos), and a second copy of      */
/* "which folder, and what may be deleted" is the divergence this file  */
/* exists to prevent.                                                   */
/* ==================================================================== */

/*
 * `Compatible` is a privacy setting, not a format preference.
 *
 * The library picker is PHPicker, and with the default representation it
 * hands back an iPhone's HEIC exactly as it sits in the library: original
 * bytes, `quality` ignored, and the full EXIF block — GPS included — still
 * attached. Asking for the compatible representation makes PHPicker
 * transcode to JPEG, which sends the photo through UIImage's re-encode at
 * `quality`, and that re-encode writes no location.
 *
 * It is the first of two layers. stripMetadata() below is the one that is
 * guaranteed; this one means a photo is already clean on the rare path
 * where stripMetadata fails and persistPhoto falls back to a plain copy.
 */
export const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.7,
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
};

/** JPEG quality for the stripped copy. Visually clean at 2048px, a few hundred KB. */
const JPEG_QUALITY = 0.8;

/**
 * Where persistPhoto keeps pour photos, relative to the document directory.
 * Every pour photo, a catalogue drink's or one of the drinks people add
 * themselves: they are told apart by the id at the front of the file name,
 * and nothing reads that back.
 */
const UNLOCKS = 'unlocks';

/**
 * Where persistCustomPhoto keeps the photo on a drink someone added, the
 * one that goes with the suggestion (as against the photo of a pour of it,
 * which is an ordinary pour photo in UNLOCKS).
 */
const CUSTOM = 'custom';

/**
 * The caption's length cap, for both ways of posting (the state and this
 * constant keep the name `note`, as the stored UnlockRecord field does).
 *
 * The note is the post caption, and the two screens that write it used to
 * disagree: 80 on a Dex card, uncapped on the centre-tab sheet. 280 leaves
 * room for a real sentence about the drink and stays far inside the
 * server's 2,000-character caption check, which rejects the whole post
 * rather than trimming it.
 */
export const NOTE_MAX = 280;

/**
 * The outcome of asking for a photo.
 *
 * A discriminated result rather than a thrown error or a bare `string |
 * null`, because the three failures want three different responses and
 * the caller is the only thing that knows how to show them. `cancelled`
 * in particular must stay silent — a user backing out of the camera has
 * not hit a problem and should not be told they have.
 *
 * `denied` only ever means the camera. The library needs no permission
 * at all (see pickFromLibrary), so a denial is always one the user can
 * undo in Settings, and a caller may offer the way there.
 */
export type PickResult =
  | { ok: true; uri: string }
  | { ok: false; reason: 'cancelled' }
  | { ok: false; reason: 'denied' | 'error'; title: string; body: string };

/**
 * Re-encodes a photo as a fresh JPEG with no metadata — no EXIF, no GPS —
 * with its longest edge capped at `maxEdge`, and returns the new file's
 * uri. Every photo that leaves the device goes through this first: pour
 * photos, and avatars.
 *
 * Why a re-encode rather than editing tags out: the manipulator decodes
 * to pixels and writes a new file from those pixels alone, so there is no
 * tag it can forget. It also bakes the EXIF orientation into the pixels
 * before the tag disappears — without that, a portrait phone photo would
 * come out lying on its side.
 *
 * The cap is the other half of the job. Library and camera photos arrive
 * at 12–48 MP, and every feed card, profile tile and follower's phone
 * would otherwise download the original. 2048px is sharper than any
 * screen the app draws a photo on, at a fraction of the bytes.
 *
 * `square` (avatars) keeps only the centre square, which is all a round
 * avatar ever shows. A square file is also what lets a small avatar's
 * early-resized decode cover its circle: expo-image fits that thumbnail
 * INSIDE the frame, so a 4:3 photo came out a third short of filling it.
 *
 * THROWS rather than handing back the original. A caller that got the
 * untouched uri back on failure would upload the exact metadata this
 * exists to remove, and never know it had.
 */
export async function stripMetadata(
  uri: string,
  maxEdge = 2048,
  { square = false }: { square?: boolean } = {},
): Promise<string> {
  // Native images held by these are large (a 48 MP decode is ~190 MB), so
  // they are released as soon as the file is written rather than left for
  // the garbage collector to notice.
  const held: { release(): void }[] = [];
  try {
    const loading = ImageManipulator.manipulate(uri);
    held.push(loading);
    let image = await loading.renderAsync();
    held.push(image);

    // The manipulator has already turned the pixels upright, so width and
    // height here are the photo as it is seen, and the crop is centred on that.
    const side = Math.min(image.width, image.height);
    const crop = square && image.width !== image.height;
    const width = crop ? side : image.width;
    const height = crop ? side : image.height;
    const resize = Math.max(width, height) > maxEdge;
    if (crop || resize) {
      const editing = ImageManipulator.manipulate(image);
      held.push(editing);
      if (crop) {
        editing.crop({
          originX: Math.floor((image.width - side) / 2),
          originY: Math.floor((image.height - side) / 2),
          width: side,
          height: side,
        });
      }
      if (resize) editing.resize(width >= height ? { width: maxEdge } : { height: maxEdge });
      image = await editing.renderAsync();
      held.push(image);
    }

    const out = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
    return out.uri;
  } finally {
    for (const ref of held) ref.release();
  }
}

/**
 * Stores a picked photo in app document storage so it survives cache
 * cleanup, as the stripped copy rather than the original.
 *
 * Stripping here, not only at upload, means the file the collection keeps
 * is the same one that gets shared: already small, already upright,
 * already free of location. If the re-encode fails the original is copied
 * instead. That file never leaves the phone as it is, because the upload
 * path strips again and refuses to send what it cannot clean.
 *
 * The move and the copy are awaited. An un-awaited copy once let the store
 * persist a URI pointing at a file that had not finished writing, which
 * produced entries whose photo was intermittently missing depending on how
 * fast the device was.
 *
 * Falls back to the source URI rather than throwing: a pour logged with a
 * fragile photo path is worth more than a pour that failed to save.
 *
 * The URI returned is absolute, and the absolute part is not stable: iOS
 * can hand the app a new container path on an update or a restore. The
 * collection store and the custom-drinks store re-root every `unlocks/`
 * path under the current container when they load (rebase, below), so
 * nothing that reads a photo back has to.
 */
export async function persistPhoto(drinkId: string, sourceUri: string): Promise<string> {
  if (Platform.OS === 'web') return sourceUri;
  try {
    const dir = new Directory(Paths.document, UNLOCKS);
    dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, `${drinkId}-${Date.now()}.jpg`);
    const clean = await stripMetadata(sourceUri).catch(() => null);
    if (clean) await new File(clean).move(dest);
    else await new File(sourceUri).copy(dest);
    return dest.uri;
  } catch {
    return sourceUri;
  }
}

/**
 * The photo's uri under the CURRENT app container.
 *
 * The stores hold absolute `file://` uris, and on iOS the absolute path
 * includes the app container's id — which iOS is free to change when the
 * app is updated or restored. The file moves with the container; the saved
 * uri does not, so every logged photo went blank after an update. Rebuilt
 * from the file name at every launch, a uri always points into the
 * container the app is actually running in, and nothing that reads
 * `photoUri` has to know this happened.
 *
 * Only files in the photo folder are rebuilt. A uri from anywhere else —
 * the picker's cache, which persistPhoto falls back to when the copy
 * fails, or a web blob — is left as it came.
 */
export function rebase(uri: string | null): string | null {
  // Typed as a string, but it came off disk. Anything that throws here
  // throws out of a store's merge, and persist's error path would then save
  // the empty store over the real one — so a bad value passes through.
  if (typeof uri !== 'string' || !uri || Platform.OS === 'web') return uri;
  const marker = `/${UNLOCKS}/`;
  const at = uri.lastIndexOf(marker);
  if (at === -1) return uri;
  const name = uri.slice(at + marker.length);
  if (!name || name.includes('/')) return uri;
  try {
    return new File(Paths.document, UNLOCKS, name).uri;
  } catch {
    return uri;
  }
}

/**
 * Deletes a pour photo a store has stopped pointing at.
 *
 * Only inside the photo folder — a picker-cache fallback belongs to the
 * picker. Failure is swallowed: a file that would not delete is disk space,
 * not a broken collection, and the record has already gone.
 */
export function discardPhoto(uri: string | null | undefined) {
  if (!uri || Platform.OS === 'web') return;
  try {
    const dir = new Directory(Paths.document, UNLOCKS).uri;
    if (!uri.startsWith(dir.endsWith('/') ? dir : `${dir}/`)) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // See above.
  }
}

/**
 * Every pour photo at once, for a reset. persistPhoto recreates the folder.
 *
 * The folder holds the pours of drinks people added as well, so Reset
 * collection clears those pours in the same breath (the custom-drinks
 * store's clearPours); a record left pointing into a deleted folder would
 * draw an empty frame.
 */
export function discardAllPhotos() {
  if (Platform.OS === 'web') return;
  try {
    const dir = new Directory(Paths.document, UNLOCKS);
    if (dir.exists) dir.delete();
  } catch {
    // As discardPhoto.
  }
}

/* -------------------------------------------------------------------- */
/* The photo on a drink someone added                                   */
/* -------------------------------------------------------------------- */

/**
 * Stores the photo for a drink someone is adding, as a stripped copy in
 * Documents/custom/, and returns its FILE NAME.
 *
 * A name rather than a uri because the record keeps it for as long as the
 * drink exists, across app updates, and an absolute uri goes stale when iOS
 * moves the container (see rebase). customPhotoUri builds the uri each
 * time it is drawn, so there is nothing to re-root.
 *
 * Always a copy. The photo often arrives from the log sheet, whose own
 * file the sheet still owns and may yet save as a pour photo; moving it
 * would leave that pour pointing at nothing.
 *
 * THROWS on failure, unlike persistPhoto. There is no fallback a file name
 * can express, and the form has a better answer than a broken frame: it
 * says the photo could not be saved and saves the drink without it.
 *
 * As with persistPhoto, a re-encode that fails copies the original, and
 * that file never leaves the phone as it is: the suggestion's upload
 * (putStrippedPhoto in lib/social) strips again and refuses to send what it
 * cannot clean.
 */
export async function persistCustomPhoto(id: string, sourceUri: string): Promise<string> {
  if (Platform.OS === 'web') return sourceUri;
  const dir = new Directory(Paths.document, CUSTOM);
  dir.create({ intermediates: true, idempotent: true });
  const name = `${id.replace(/[^A-Za-z0-9_-]/g, '')}-${Date.now()}.jpg`;
  const dest = new File(dir, name);
  const clean = await stripMetadata(sourceUri).catch(() => null);
  if (clean) await new File(clean).move(dest);
  else await new File(sourceUri).copy(dest);
  return name;
}

/**
 * The uri to draw a custom drink's photo from, built from its file name
 * under the current container. Empty for no photo (a drink's photoFile is
 * null when it has none, so `pourUri || customPhotoUri(c.photoFile)` needs
 * no check of its own) and for a name that cannot be one of
 * persistCustomPhoto's (a path), which draws as no photo either.
 *
 * On web persistCustomPhoto keeps the picker's uri as the "name", so it
 * comes back as it went in.
 */
export function customPhotoUri(fileName: string | null | undefined): string {
  if (Platform.OS === 'web') return fileName ?? '';
  if (!fileName || fileName.includes('/')) return '';
  try {
    return new File(Paths.document, CUSTOM, fileName).uri;
  } catch {
    return '';
  }
}

/** Deletes one custom drink's photo. Swallows failure, as discardPhoto does. */
export function discardCustomPhoto(fileName: string | null | undefined) {
  if (!fileName || fileName.includes('/') || Platform.OS === 'web') return;
  try {
    const file = new File(Paths.document, CUSTOM, fileName);
    if (file.exists) file.delete();
  } catch {
    // As discardPhoto.
  }
}

/** Every custom drink's photo at once, for an account deletion. */
export function discardAllCustomPhotos() {
  if (Platform.OS === 'web') return;
  try {
    const dir = new Directory(Paths.document, CUSTOM);
    if (dir.exists) dir.delete();
  } catch {
    // As discardPhoto.
  }
}

function asset(result: ImagePicker.ImagePickerResult): PickResult {
  if (result.canceled) return { ok: false, reason: 'cancelled' };
  const uri = result.assets?.[0]?.uri;
  if (!uri) {
    return {
      ok: false,
      reason: 'error',
      title: 'No photo came back',
      body: 'That did not return an image. Try again.',
    };
  }
  return { ok: true, uri };
}

/*
 * No permission request, on purpose.
 *
 * The library picker runs out of process: the user chooses, and the app
 * only ever receives what they chose, so there is nothing to authorise.
 * Asking anyway raised iOS's "allow access to your photos" prompt for the
 * WHOLE library, contradicting the usage string's promise that nothing is
 * read unless picked — and a user who tapped Don't Allow was then refused
 * a picker that would have worked.
 */
export async function pickFromLibrary(): Promise<PickResult> {
  try {
    return asset(await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS));
  } catch {
    return {
      ok: false,
      reason: 'error',
      title: 'Could not open your photos',
      body: 'Take one with the camera instead, or try again.',
    };
  }
}

export async function pickFromCamera(): Promise<PickResult> {
  // getUserMedia capture is unreliable on web — fall back to the library.
  if (Platform.OS === 'web') return pickFromLibrary();
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      /*
       * The same reason, in the same words, as the system prompt that was
       * just refused (app.json's cameraPermission), and it names both
       * uses, since this picker also takes the profile picture.
       */
      return {
        ok: false,
        reason: 'denied',
        title: 'Camera access needed',
        body: 'Sipply uses the camera to photograph a drink you are posting, or to take your profile picture. You can turn it on in Settings.',
      };
    }
    return asset(await ImagePicker.launchCameraAsync(PICKER_OPTIONS));
  } catch {
    return {
      ok: false,
      reason: 'error',
      title: 'Could not open the camera',
      body: 'Choose one from your photos instead, or try again.',
    };
  }
}

/**
 * Says what became of a post once it is known.
 *
 * Posting is never awaited — the drink is saved the moment it is local,
 * and an upload on a bar's signal can take seconds — so a failure arrives
 * after the sheet has gone and is told as a notice. The refused-caption
 * case is nearly always caught before this, next to the caption field, by
 * the same check addPost runs first; this covers the server's list
 * catching what the client's missed. Every retry goes through the drink
 * page's pinned button ("Post another <name>", or "Post it again" for a
 * long name), whose sheet's "Save & post" adds to the post if it went up
 * and creates it if it did not. The notices say "post it again" rather
 * than either label, so they are right for both.
 *
 * Here rather than in each screen because both ways of posting post the
 * same way and should fail in the same words.
 */
export function reportPost(outcome: PostOutcome): void {
  if (outcome === 'ok') return;
  if (outcome === 'no-photo') {
    showNotice(
      'Posted without the photo',
      'The photo did not upload. Open the drink in your Dex and post it again to add it.',
    );
  } else if (outcome === 'objectionable') {
    showNotice(
      'Not posted',
      'Your caption includes language Sipply does not allow. The drink is saved in your Dex. To share it without the caption, open it in your Dex, post it again and choose Save & post.',
    );
  } else {
    showNotice(
      'Could not post',
      'The drink is saved in your Dex. To try again, open it in your Dex, post it again and choose Save & post.',
    );
  }
}

/**
 * Says so when a new photo did not reach the post it was meant to follow.
 *
 * "Save photo" on an entry already collected keeps a post of it in step
 * and never creates one (the social store's addPhotoForDrink), and there
 * are two ways to press it: the sheet behind a drink page's pinned "Post
 * another" button, and posting the drink again from the centre tab. `kept`
 * is addPhotoForDrink's answer — true when the post has the photo or there
 * was no post to follow — so this cannot claim a post exists, and says
 * "if", as the sheet does.
 *
 * Beside reportPost so that one failure can have one wording from either
 * door. It names the way back as "open it in your Dex" rather than assuming
 * the reader is on it: from the centre tab the sheet is gone by the time
 * the answer lands, and from a drink page the sheet has closed as well.
 */
export function reportPostPhoto(kept: boolean): void {
  if (kept) return;
  showNotice(
    'Post not updated',
    'Your Dex has the new photo. If you shared this entry, the post still shows the old one. To try again, open it in your Dex and post it again.',
  );
}
