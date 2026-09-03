import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

/* ==================================================================== */
/* Logging a pour — the shared half                                     */
/*                                                                      */
/* Picking a photo and persisting it used to live inside drink/[id],    */
/* which was fine while that screen was the only way to log anything.   */
/* The centre action in the tab bar is a second way in, and two copies  */
/* of this would mean two answers to "where do pour photos live" — the  */
/* kind of divergence that shows up months later as photos that survive */
/* from one entry point and vanish from the other.                      */
/* ==================================================================== */

export const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.7,
};

/**
 * The outcome of asking for a photo.
 *
 * A discriminated result rather than a thrown error or a bare `string |
 * null`, because the three failures want three different responses and
 * the caller is the only thing that knows how to show them. `cancelled`
 * in particular must stay silent — a user backing out of the camera has
 * not hit a problem and should not be told they have.
 */
export type PickResult =
  | { ok: true; uri: string }
  | { ok: false; reason: 'cancelled' }
  | { ok: false; reason: 'denied' | 'error'; title: string; body: string };

/**
 * Copies a picked photo into app document storage so it survives cache
 * cleanup.
 *
 * The copy is awaited. An un-awaited copy once let the store persist a URI
 * pointing at a file that had not finished writing, which produced entries
 * whose photo was intermittently missing depending on how fast the device
 * was.
 *
 * Falls back to the source URI rather than throwing: a pour logged with a
 * fragile photo path is worth more than a pour that failed to save.
 */
export async function persistPhoto(drinkId: string, sourceUri: string): Promise<string> {
  if (Platform.OS === 'web') return sourceUri;
  try {
    const dir = new Directory(Paths.document, 'unlocks');
    dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, `${drinkId}-${Date.now()}.jpg`);
    await new File(sourceUri).copy(dest);
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

export async function pickFromLibrary(): Promise<PickResult> {
  try {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        return {
          ok: false,
          reason: 'denied',
          title: 'Photo access needed',
          body: 'Sipply needs photo library access to log proof. You can enable it in Settings.',
        };
      }
    }
    return asset(await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS));
  } catch {
    return {
      ok: false,
      reason: 'error',
      title: 'Something went wrong',
      body: 'Could not open the photo library. Try again.',
    };
  }
}

export async function pickFromCamera(): Promise<PickResult> {
  // getUserMedia capture is unreliable on web — fall back to the library.
  if (Platform.OS === 'web') return pickFromLibrary();
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      return {
        ok: false,
        reason: 'denied',
        title: 'Camera access needed',
        body: 'Sipply needs camera access to snap proof. You can enable it in Settings.',
      };
    }
    return asset(await ImagePicker.launchCameraAsync(PICKER_OPTIONS));
  } catch {
    return {
      ok: false,
      reason: 'error',
      title: 'Something went wrong',
      body: 'Could not open the camera. Try again.',
    };
  }
}
