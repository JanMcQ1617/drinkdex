import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import { File } from 'expo-file-system';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icons';
import { useAppActive } from '@/components/reels/ReelVideo';
import { announce, Button, haptic, MediaIconButton } from '@/components/ui';
import { colors, fonts, layout, radius, space, stroke, tabular, textRole } from '@/constants/theme';
import { cropCentre, pickFromLibrary } from '@/lib/pour';
import { showNotice } from '@/utils/alerts';

/* ==================================================================== */
/* The post camera (v4.11, specs/v4.11/post-camera.md)                  */
/*                                                                      */
/* Posting a drink starts here now. Jan: tapping Post should open the   */
/* camera, like the iPhone's own, with the camera roll one tap away,    */
/* instead of a sheet that asks "take a photo or choose one" first.     */
/* So every way into a post (the drink page's pinned key, the + window  */
/* once a drink is chosen, "Choose another") opens this, full screen:   */
/*                                                                      */
/*   top      Close camera (left), Flash: off, auto, on (right)         */
/*   middle   the live picture at the sensor's own 3:4, and over its    */
/*            foot the zoom chips: .5 where the phone has an ultra-wide */
/*            lens, 1 and 2 on any back camera, none on the front       */
/*   foot     Choose from library (left), the shutter, Switch camera    */
/*                                                                      */
/* It only hands back a photo. A photo taken or chosen goes to          */
/* `onPhoto`, and what follows (the caption, the place, Save to Dex or  */
/* Save & post) is the caller's existing post step. Close hands back    */
/* nothing. Every photo still goes through lib/pour on its way to the   */
/* Dex or a post, so the size cap and the stripped metadata are what    */
/* they were. The way up is too, because the camera reads it from the   */
/* phone's motion, as the system camera did (CameraView's               */
/* responsiveOrientationWhenOrientationLocked): iOS's own device        */
/* orientation stays portrait under Portrait Orientation Lock, and a    */
/* photo framed with the phone on its side would be saved sideways.     */
/*                                                                      */
/* THE CAMERA ROLL IS A GLYPH, NOT A THUMBNAIL. iOS's camera shows your */
/* last photo there; showing it would need the photo library read       */
/* (expo-media-library and "allow access to your photos"), which        */
/* Sipply has never asked for: the library key opens the system picker  */
/* (lib/pour's pickFromLibrary, PHPicker), which runs out of process    */
/* and needs no permission at all. So the key is the app's own photos   */
/* glyph (`grid`, as on "Choose photo") on a squared key.               */
/*                                                                      */
/* A FULL-SCREEN MODAL, mounted only while it is up (and through its    */
/* dismissal, as React Native keeps a modal's children until it has     */
/* gone), so every opening starts on the back camera at 1x with the     */
/* flash off, and the capture session ends with it. The status bar is   */
/* hidden while it is up, as on iOS's camera.                           */
/*                                                                      */
/* IT IS PRESENTED, SO IT CANNOT BE PRESENTED OVER A PRESENTATION THAT  */
/* IS STILL MOVING. iOS drops a modal asked for while another is being  */
/* presented or dismissed. Callers open it from a screen at rest, and   */
/* `onDismiss` says when it has finished leaving, for a caller that     */
/* raises a sheet next (drink/[id].tsx). A photo from the library waits */
/* for the system picker to finish leaving before it is handed back     */
/* (PICKER_SETTLE_MS), since handing it back closes this camera.        */
/*                                                                      */
/* What it learned from the reel recorder (reels/Recorder.tsx): the     */
/* session stops while the app is not in front (`active`); a camera     */
/* that fails to start says so and offers Try again, which remounts it  */
/* with a new key; the front camera is mirrored, so the photo is what   */
/* the preview showed; and Flash is not offered on the front camera,    */
/* whose flash (the screen) JavaScript cannot see.                      */
/* ==================================================================== */

/** The picture's frame, tall over wide: the sensor's own 4:3, so the photo is what the frame showed. */
const FRAME_ASPECT = 4 / 3;

/*
 * The shutter: a white disc in a white ring, the recorder's own at rest
 * (RecordButton), a little smaller so the foot fits a 4.7-inch phone
 * under a full-width frame.
 */
const SHUTTER_HIT = 88;
const RING = 76;
const RING_STROKE = 4;
const CORE = 62;

/** The foot at its least: the shutter with 12 above and below it. */
const FOOT_MIN = SHUTTER_HIT + 2 * space.md;

/**
 * JPEG quality of the camera's own file. It is an intermediate: the post
 * keeps lib/pour's re-encode (0.8, at most 2048px), so this only has to
 * leave that something clean to work from.
 */
const CAPTURE_QUALITY = 0.9;

/**
 * How long a photo chosen from the library waits before it is handed
 * back. The picker hands its answer over as it starts to leave, and
 * handing the photo back closes this camera: a dismissal asked for while
 * the picker's own is still running is one iOS drops, which would leave
 * the camera up over a post that is waiting for it. A sheet's dismissal
 * is about 0.35 s and has begun before the answer arrives.
 */
const PICKER_SETTLE_MS = 500;

/*
 * The zoom chips. `wide` is the ultra-wide lens itself, chosen by name
 * (ultraWideLens); `two` is the 1x picture shown and kept twice as close,
 * a centred crop (lib/pour's cropCentre, which says why it is not
 * expo-camera's zoom). The chosen chip carries the ×, as iOS's does.
 */
type Zoom = 'wide' | 'one' | 'two';
const CHIPS: { zoom: Zoom; label: string; chosen: string; spoken: string }[] = [
  { zoom: 'wide', label: '.5', chosen: '.5×', spoken: '0.5 times zoom' },
  { zoom: 'one', label: '1', chosen: '1×', spoken: '1 times zoom' },
  { zoom: 'two', label: '2', chosen: '2×', spoken: '2 times zoom' },
];

/*
 * The flash, in the order the key steps through it, with its glyph and
 * its spoken value. On is the plain bolt on the selected (white) key.
 */
const FLASH_ORDER: FlashMode[] = ['off', 'auto', 'on'];
const FLASH: Partial<Record<FlashMode, { icon: IconName; word: string }>> = {
  off: { icon: 'flashOff', word: 'Off' },
  auto: { icon: 'flashAuto', word: 'Auto' },
  on: { icon: 'flash', word: 'On' },
};

/*
 * Which of the back camera's lenses is the ultra-wide, by its name: the
 * only thing expo-camera says about a lens (AVCaptureDevice's
 * localizedName, in the phone's own language). "Back Ultra Wide Camera"
 * in English; the Latin-script languages Sipply's people use spell it
 * with "ultra" too (es "ultra gran angular", fr "ultra grand-angle", de
 * "Ultraweitwinkel", it, pt), and the four CJK forms are listed. A name
 * no rule knows shows no .5 chip, which is a phone without one as far as
 * anyone can tell, never a wrong lens. Of several matches the shortest
 * is the physical lens; the longer ones are the virtual cameras that
 * contain it, which start on the ultra-wide too.
 */
const ULTRA_WIDE = /ultra|超広角|超广角|超廣角|초광각/i;
function ultraWideLens(lenses: readonly string[]): string | null {
  const named = lenses.filter((l) => ULTRA_WIDE.test(l));
  if (named.length === 0) return null;
  return named.reduce((a, b) => (b.length < a.length ? b : a));
}

/** Deletes a file the camera made and nothing will use. Quietly: iOS empties the cache folder in time anyway. */
function discard(uri: string | null) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // See above.
  }
}

/**
 * Whether the camera may open, asking iOS first when it still can: the
 * system's own prompt, in app.json's words, at the tap that needs it,
 * which is how the photo camera has always asked (lib/pour's
 * pickFromCamera). True once granted. False when refused, now or
 * before, and on the web: the caller then shows the sheet it showed
 * before v4.11, whose Take photo says where Settings turns the camera on.
 *
 * Asked at every tap rather than held, so a camera turned on in Settings
 * opens at the next Post with nothing to re-check (CameraGate re-reads
 * on return to the app for the same reason).
 */
export function useCameraAccess(): () => Promise<boolean> {
  const [, requestCam, getCam] = useCameraPermissions({ get: false });
  return useCallback(async () => {
    if (Platform.OS === 'web') return false;
    try {
      const now = await getCam();
      if (now.granted) return true;
      if (!now.canAskAgain) return false;
      return (await requestCam()).granted;
    } catch {
      return false;
    }
  }, [getCam, requestCam]);
}

export function PostCamera({
  visible,
  onPhoto,
  onClose,
  onDismiss,
}: {
  visible: boolean;
  /** A photo taken or chosen: a file uri, still in a cache folder. The caller closes the camera. */
  onPhoto: (uri: string) => void;
  /** Close camera: nothing taken, nothing posted. */
  onClose: () => void;
  /** The camera has finished leaving: a sheet may be raised now. */
  onDismiss?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <Modal
      visible={visible}
      presentationStyle="fullScreen"
      animationType={reduceMotion ? 'fade' : 'slide'}
      backdropColor={colors.reelGround}
      onRequestClose={onClose}
      onDismiss={onDismiss}>
      <CameraScreen open={visible} onPhoto={onPhoto} onClose={onClose} />
    </Modal>
  );
}

function CameraScreen({
  open,
  onPhoto,
  onClose,
}: {
  open: boolean;
  onPhoto: (uri: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const appActive = useAppActive();

  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [zoom, setZoom] = useState<Zoom>('one');
  /** The lenses of the camera in use, as expo-camera last named them, with the side they were named for. */
  const [lenses, setLenses] = useState<{ facing: CameraType; names: string[] } | null>(null);
  const [ready, setReady] = useState(false);
  const [mountFailed, setMountFailed] = useState(false);
  /** Bumped by Try again: a new key, a new capture session. */
  const [attempt, setAttempt] = useState(0);
  /** What is running: the shutter's capture, or the library's picker. Either holds every key. */
  const [busy, setBusy] = useState<'shutter' | 'library' | null>(null);

  /*
   * Between events. `busy` refuses a second press before its render lands;
   * `open` is whether the camera is still wanted when a capture or a pick
   * comes back (Close may have been pressed meanwhile, or the caller has
   * moved on); `mounted` whether there is anything left to set state on.
   */
  const live = useRef({ busy: false, open, mounted: true });
  useEffect(() => {
    live.current.open = open;
  }, [open]);
  useEffect(() => {
    const state = live.current;
    state.mounted = true;
    return () => {
      state.mounted = false;
    };
  }, []);

  const back = facing === 'back';
  const ultra = back && lenses?.facing === 'back' ? ultraWideLens(lenses.names) : null;
  // A .5 chosen on a lens that has since gone (a flip, a rename) is 1x.
  const zoomNow: Zoom = !back ? 'one' : zoom === 'wide' && !ultra ? 'one' : zoom;
  const chips = back ? CHIPS.filter((c) => c.zoom !== 'wide' || ultra) : [];

  /*
   * The frame: the screen's width at 3:4, under a top row that clears the
   * island and over a foot that holds the shutter. A phone too short for
   * both narrows the frame instead, still 3:4, so the photo is always the
   * frame (expo-camera crops a still to its preview's shape).
   */
  const topH = insets.top + space.sm + layout.hit + space.sm;
  const frameH = Math.round(Math.min(width * FRAME_ASPECT, height - topH - FOOT_MIN - insets.bottom));
  const frameW = Math.round(frameH / FRAME_ASPECT);

  const shoot = async () => {
    const camera = cameraRef.current;
    const state = live.current;
    if (!camera || !ready || state.busy) return;
    state.busy = true;
    setBusy('shutter');
    let uri: string | null = null;
    try {
      // No EXIF asked for, so none is written; lib/pour strips whatever is left anyway.
      const picture = await camera.takePictureAsync({ quality: CAPTURE_QUALITY, exif: false });
      uri = picture?.uri ?? null;
      if (uri && zoomNow === 'two') {
        /*
         * The 2: the middle half of the photo, as the preview showed it.
         * A crop that fails keeps the whole photo, which is still the one
         * taken, rather than losing it.
         */
        const whole = uri;
        uri = await cropCentre(whole, 2).catch(() => whole);
        if (uri !== whole) discard(whole);
      }
    } catch {
      uri = null;
    } finally {
      state.busy = false;
      if (state.mounted) setBusy(null);
    }
    if (!state.open) {
      discard(uri);
      return;
    }
    if (!uri) {
      showNotice("The photo didn't take", 'Try again, or choose one from your library.');
      return;
    }
    onPhoto(uri);
  };

  /*
   * The system picker, over this camera. The capture session pauses while
   * it is up (`active`), so the camera is not running, light on, behind a
   * picker. A cancel comes back to the camera as it was; an error is told
   * in lib/pour's words.
   */
  const choose = async () => {
    const state = live.current;
    if (state.busy) return;
    state.busy = true;
    setBusy('library');
    try {
      const r = await pickFromLibrary();
      if (r.ok) {
        await new Promise((done) => setTimeout(done, PICKER_SETTLE_MS));
        if (state.open) onPhoto(r.uri);
      } else if (r.reason !== 'cancelled') {
        showNotice(r.title, r.body);
      }
    } finally {
      state.busy = false;
      if (state.mounted) setBusy(null);
    }
  };

  const stepFlash = () => {
    const next = FLASH_ORDER[(FLASH_ORDER.indexOf(flash) + 1) % FLASH_ORDER.length];
    setFlash(next);
    haptic.select();
    // The key's value changes under the focus, which VoiceOver does not read by itself.
    announce(`Flash ${FLASH[next]?.word.toLowerCase() ?? ''}`);
  };

  const flip = () => {
    haptic.select();
    setFacing((f) => (f === 'back' ? 'front' : 'back'));
    // Each side starts at 1x: the chips are the back camera's.
    setZoom('one');
  };

  const pickZoom = (next: Zoom) => {
    if (next === zoomNow) return;
    haptic.select();
    setZoom(next);
  };

  const retry = () => {
    setMountFailed(false);
    setReady(false);
    setAttempt((n) => n + 1);
  };

  const flashKey = FLASH[flash] ?? FLASH.off!;
  const held = busy !== null;

  return (
    <View style={styles.screen}>
      {/* Hidden while it is up; back as it leaves, so the page under it never jumps once it shows. */}
      <StatusBar style="dark" hidden={open} animated />

      <View style={[styles.top, { height: topH, paddingTop: insets.top + space.sm }]}>
        <MediaIconButton icon="close" label="Close camera" onPress={onClose} />
        {back ? (
          <MediaIconButton
            icon={flashKey.icon}
            label="Flash"
            accessibilityValue={{ text: flashKey.word }}
            accessibilityHint="Changes the flash"
            selected={flash === 'on'}
            onPress={stepFlash}
          />
        ) : null}
      </View>

      <View style={[styles.frame, { width: frameW, height: frameH }]}>
        {mountFailed ? (
          <View style={styles.failed}>
            <Icon name="camera" size={40} color={colors.reelInk} />
            <Text style={[textRole.bodyStrong, styles.failedTitle]} accessibilityRole="header">
              The camera didn&apos;t start
            </Text>
            <Text style={styles.failedBody}>Close any other app that is using the camera, then try again.</Text>
            <Button label="Try again" variant="onDark" onPress={retry} style={styles.failedAction} />
          </View>
        ) : (
          <CameraView
            key={attempt}
            ref={cameraRef}
            /*
             * The 2's preview: the 1x picture drawn twice the size from its
             * centre and clipped by the frame, which is the crop the photo
             * gets. Always a transform (1 or 2), never one that comes and
             * goes, so the view's native shape never changes.
             */
            style={[StyleSheet.absoluteFill, { transform: [{ scale: zoomNow === 'two' ? 2 : 1 }] }]}
            mode="picture"
            facing={facing}
            flash={back ? flash : 'off'}
            selectedLens={zoomNow === 'wide' && ultra ? ultra : undefined}
            // What you saw in the preview is what you get.
            mirror={!back}
            /*
             * The photo's way up from the phone's motion, not from iOS's
             * device orientation, which stays portrait while Portrait
             * Orientation Lock is on: without this a photo framed with the
             * phone on its side is saved sideways, and lib/pour then makes
             * that permanent as it turns the pixels upright. The system
             * camera this replaced read the motion too. The screen stays
             * portrait either way (app.json), and so does the 3:4 crop
             * (expo-camera sizes it by the screen's orientation).
             */
            responsiveOrientationWhenOrientationLocked
            /*
             * The session stops whenever nobody can see it or it is done:
             * the app away, the library's picker over it, or the camera on
             * its way out (a photo handed back, or Close).
             */
            active={open && appActive && busy !== 'library'}
            onCameraReady={() => setReady(true)}
            onMountError={() => setMountFailed(true)}
            onAvailableLensesChanged={(e) => setLenses({ facing, names: e.lenses })}
          />
        )}

        {chips.length > 1 && !mountFailed ? (
          <View style={styles.chips} pointerEvents="box-none">
            {chips.map((c) => {
              const chosen = c.zoom === zoomNow;
              return (
                <Pressable
                  key={c.zoom}
                  onPress={() => pickZoom(c.zoom)}
                  disabled={held}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={c.spoken}
                  accessibilityState={{ selected: chosen, disabled: held }}
                  style={({ pressed }) => [styles.chip, chosen && styles.chipChosen, pressed && styles.chipPressed]}>
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={[styles.chipText, chosen ? styles.chipTextChosen : styles.chipTextShadow]}>
                    {chosen ? c.chosen : c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      <View style={[styles.foot, { paddingBottom: insets.bottom }]}>
        <MediaIconButton
          icon="grid"
          label="Choose from library"
          disabled={held}
          onPress={() => void choose()}
        />
        <Shutter busy={busy === 'shutter'} disabled={!ready || mountFailed || held} onPress={() => void shoot()} />
        <MediaIconButton
          icon="flip"
          label="Switch camera"
          accessibilityHint={back ? 'Uses the front camera' : 'Uses the back camera'}
          disabled={held || mountFailed}
          onPress={flip}
        />
      </View>
    </View>
  );
}

/**
 * The shutter. The disc is one of the few circles the design allows (a
 * shutter is a round object, not a control drawn round); held, it greys
 * rather than shrinking, since controls answer with a fill. While a
 * capture is out it spins and takes no second press.
 */
function Shutter({ busy, disabled, onPress }: { busy: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Take photo"
      accessibilityState={{ disabled, busy }}
      style={[styles.shutter, disabled && !busy && styles.shutterDisabled]}>
      {({ pressed }) => (
        <>
          <View style={styles.ring} />
          <View style={[styles.core, pressed && styles.corePressed]}>
            {busy ? <ActivityIndicator color={colors.reelGround} /> : null}
          </View>
        </>
      )}
    </Pressable>
  );
}

const shadow = {
  textShadowColor: colors.reelTextShadow,
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
} as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.reelGround },

  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
  },

  /* The picture: clipped, so the 2's doubled preview stays inside it. */
  frame: { alignSelf: 'center', overflow: 'hidden', backgroundColor: colors.reelGround },

  /* The chips, 12 over the frame's foot, centred, as iOS sets them. */
  chips: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: space.md,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.sm,
  },
  chip: {
    minWidth: layout.chip,
    height: layout.chip,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    borderWidth: stroke.edge,
    borderColor: colors.reelControlBorder,
    backgroundColor: colors.reelControlFill,
  },
  chipChosen: { backgroundColor: colors.reelInk, borderColor: colors.reelInk },
  chipPressed: { opacity: 0.8 },
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: 13, lineHeight: 18, color: colors.reelInk, ...tabular },
  chipTextChosen: { color: colors.reelGround },
  // Shadowed like all type over the picture: the chip's translucent fill alone is 4.27:1 over white.
  chipTextShadow: shadow,

  /* The foot: library, shutter, flip, on one line, the shutter on the axis. */
  foot: {
    flex: 1,
    minHeight: FOOT_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.gutter,
  },

  shutter: { width: SHUTTER_HIT, height: SHUTTER_HIT, alignItems: 'center', justifyContent: 'center' },
  shutterDisabled: { opacity: 0.42 },
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    // round-ok: shutter (the ring round the disc)
    borderRadius: RING / 2,
    borderWidth: RING_STROKE,
    borderColor: colors.reelInk,
  },
  core: {
    width: CORE,
    height: CORE,
    // round-ok: shutter (the disc)
    borderRadius: CORE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.reelInk,
  },
  corePressed: { backgroundColor: colors.reelInkMuted },

  failed: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: layout.gutter },
  failedTitle: { color: colors.reelInk, textAlign: 'center', marginTop: space.lg },
  failedBody: { ...textRole.body, color: colors.reelInkMuted, textAlign: 'center', marginTop: space.sm },
  failedAction: { marginTop: space.xl },
});
