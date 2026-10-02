import { CameraView } from 'expo-camera';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { VideoPlayer } from 'expo-video';

/*
 * The recorder's media helpers: which codec to record with, the poster
 * frame, and clearing out abandoned recordings.
 *
 * Only the /record screen and its recorder components import this file. It
 * pulls in expo-camera, and lib/reels (which the tab bar loads at app
 * start) must stay free of it.
 */

export type ReelCodec = 'hvc1' | 'avc1';

let codecChoice: Promise<ReelCodec> | null = null;

/**
 * HEVC when this phone can record it, H.264 otherwise. Asked once per
 * session.
 *
 * At the 5 MB cap HEVC looks like H.264 at about twice the bitrate, and
 * every iPhone that encodes it also decodes it. The codec must be passed to
 * recordAsync in any case: iOS ignores videoBitrate unless one is.
 *
 * Ask once camera access is granted. expo-camera answers by opening a
 * capture device, and without permission (or while another app holds the
 * camera) that fails and the list comes back empty. An empty list or a
 * failed question is not remembered, so the next recording asks again;
 * H.264 is the answer meanwhile, because every iPhone records it.
 */
export function pickCodec(): Promise<ReelCodec> {
  codecChoice ??= CameraView.getAvailableVideoCodecsAsync()
    .then((codecs): ReelCodec => {
      if (codecs.length === 0) codecChoice = null;
      return codecs.includes('hvc1') ? 'hvc1' : 'avc1';
    })
    .catch((): ReelCodec => {
      codecChoice = null;
      return 'avc1';
    });
  return codecChoice;
}

/** Poster JPEG quality: a 720px frame at this is about 80 to 150 KB. */
const POSTER_QUALITY = 0.72;
const POSTER_MAX_WIDTH = 720;

async function posterAt(player: VideoPlayer, seconds: number): Promise<{ uri: string; landscape: boolean }> {
  // Native images are released as soon as the file is written, not left for the collector.
  const held: { release(): void }[] = [];
  try {
    const [thumb] = await player.generateThumbnailsAsync(seconds, { maxWidth: POSTER_MAX_WIDTH });
    if (!thumb) throw new Error('No frame came back for the poster.');
    held.push(thumb);
    /*
     * The generator applies the track's rotation, so a phone held upright
     * gives a tall frame here even though the camera wrote sideways pixels.
     * That makes the frame's own shape the honest answer to "was it filmed
     * sideways", which the viewer uses to letterbox instead of crop.
     */
    const landscape = thumb.width > thumb.height;
    const context = ImageManipulator.manipulate(thumb);
    held.push(context);
    const image = await context.renderAsync();
    held.push(image);
    // A fresh JPEG from pixels alone: no EXIF, no location, nothing the frame did not show.
    const out = await image.saveAsync({ format: SaveFormat.JPEG, compress: POSTER_QUALITY });
    return { uri: out.uri, landscape };
  } finally {
    for (const ref of held) ref.release();
  }
}

/**
 * The reel's poster frame, made on the phone (nothing on the server can
 * process video): half a second in, or the middle of a shorter reel, so
 * it is past the first frame's exposure settling. Retried once at the very
 * start if that frame cannot be read. Throws when neither works; the
 * review screen then asks for a retake rather than posting a reel with no
 * poster.
 */
export async function makePoster(
  player: VideoPlayer,
  durationMs: number,
): Promise<{ uri: string; landscape: boolean }> {
  const t = Math.min(0.5, durationMs / 2000);
  try {
    return await posterAt(player, t);
  } catch {
    return posterAt(player, 0);
  }
}

/**
 * Deletes every .mov in the folder expo-camera records into
 * (`<cache>/Camera`). Called when /record opens, before anything is
 * recorded, so every file there is an abandoned reel of up to 5 MB: one
 * discarded, retaken, or left behind by a crash. Photos expo-camera might
 * write to the same folder are .jpg and stay. Never throws.
 */
export function pruneCameraCache(): void {
  try {
    const folder = new Directory(Paths.cache, 'Camera');
    if (!folder.exists) return;
    for (const entry of folder.list()) {
      if (entry instanceof File && entry.extension.toLowerCase() === '.mov') {
        try {
          entry.delete();
        } catch {
          // One file that will not go does not stop the rest.
        }
      }
    }
  } catch {
    // The OS clears the cache folder eventually anyway.
  }
}
