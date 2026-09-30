import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import type { PostOutcome } from '@/store/social';
import { showNotice } from '@/utils/alerts';

/* ==================================================================== */
/* Logging a pour — the shared half                                     */
/*                                                                      */
/* Picking a photo and persisting it used to live inside drink/[id],    */
/* which was fine while that screen was the only way to log anything.   */
/* The centre action in the tab bar is a second way in, and two copies  */
/* of this would mean two answers to "where do pour photos live" — the  */
/* kind of divergence that shows up months later as photos that survive */
/* from one entry point and vanish from the other.                      */
/*                                                                      */
/* The pickers and stripMetadata also serve the profile picture, so the */
/* words they return must not assume a drink. reportPost and            */
/* reportPostPhoto are the pour's alone, worded for either way of       */
/* logging.                                                             */
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

/** Where persistPhoto keeps pour photos, relative to the document directory. */
const UNLOCKS = 'unlocks';

/**
 * The pour note's length cap, for both ways of logging.
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
 * THROWS rather than handing back the original. A caller that got the
 * untouched uri back on failure would upload the exact metadata this
 * exists to remove, and never know it had.
 */
export async function stripMetadata(uri: string, maxEdge = 2048): Promise<string> {
  // Native images held by these are large (a 48 MP decode is ~190 MB), so
  // they are released as soon as the file is written rather than left for
  // the garbage collector to notice.
  const held: { release(): void }[] = [];
  try {
    const loading = ImageManipulator.manipulate(uri);
    held.push(loading);
    let image = await loading.renderAsync();
    held.push(image);

    if (Math.max(image.width, image.height) > maxEdge) {
      const resizing = ImageManipulator.manipulate(image).resize(
        image.width >= image.height ? { width: maxEdge } : { height: maxEdge },
      );
      held.push(resizing);
      image = await resizing.renderAsync();
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
 * collection store re-roots every `unlocks/` path under the current
 * container when it loads, so nothing that reads a photo back has to.
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
        body: 'Sipply uses the camera to photograph a drink you are logging, or to take your profile picture. You can turn it on in Settings.',
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
 * Posting is never awaited — the pour is saved the moment it is local, and
 * an upload on a bar's signal can take seconds — so a failure arrives after
 * the sheet has gone and is told as a notice. The refused-caption case is
 * nearly always caught before this, next to the note field, by the same
 * check addPost runs first; this covers the server's list catching what the
 * client's missed. Every retry goes through Update photo on the drink,
 * whose "Save & post" adds to the post if it went up and creates it if it
 * did not.
 *
 * Here rather than in each screen because both ways of logging post the
 * same way and should fail in the same words.
 */
export function reportPost(outcome: PostOutcome): void {
  if (outcome === 'ok') return;
  if (outcome === 'no-photo') {
    showNotice(
      'Posted without the photo',
      'The photo did not upload. Open the drink in your Dex and use Update photo to add it.',
    );
  } else if (outcome === 'objectionable') {
    showNotice(
      'Not posted',
      'Your note includes language Sipply does not allow. Your pour is saved in your Dex. To share it without the note, open the drink, use Update photo and choose Save & post.',
    );
  } else {
    showNotice(
      'Could not post',
      'Your pour is saved in your Dex. To try again, open the drink, use Update photo and choose Save & post.',
    );
  }
}

/**
 * Says so when a new photo did not reach the post it was meant to follow.
 *
 * "Save photo" on an entry already collected keeps a post of it in step
 * and never creates one (the social store's addPhotoForDrink), and there
 * are two ways to press it: a Dex card's Update photo, and re-logging the
 * drink from the centre tab. `kept` is addPhotoForDrink's answer — true
 * when the post has the photo or there was no post to follow — so this
 * cannot claim a post exists, and says "if", as the sheet does.
 *
 * Beside reportPost so that one failure can have one wording from either
 * door. It names the way back as "open the drink" rather than assuming the
 * reader is on it: from the centre tab the sheet is gone by the time the
 * answer lands, and from a Dex card the sheet has closed as well.
 */
export function reportPostPhoto(kept: boolean): void {
  if (kept) return;
  showNotice(
    'Post not updated',
    'Your Dex has the new photo. If you shared this entry, the post still shows the old one. To try again, open the drink and use Update photo.',
  );
}
