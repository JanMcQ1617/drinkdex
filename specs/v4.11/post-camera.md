# v4.11 · Post opens the camera

30 Oct 2026. Jan, for the next build: "instead of this screen appearing when you are going to post something I want it to automatically open the camera with an option to take photos, and choose from camera roll", with a screenshot of iOS's own camera (the camera-roll key at the bottom left, an X at the top left to close). Posting no longer starts with a sheet that asks "take a photo or choose one": it starts in the camera, and the camera roll is one key in it.

| Piece | Where | State |
|---|---|---|
| The camera | `src/components/PostCamera.tsx` (`PostCamera`, `useCameraAccess`) | new |
| The drink page's post key | `src/app/drink/[id].tsx` | camera, then the sheet with the photo picked |
| The post sheet | `src/components/dex/PostSheet.tsx` | "Choose another" and Take photo open the camera over it |
| The + window | `src/app/log.tsx` | compose without a photo opens on the camera; the photo slot opens it |
| The old "camera or library" sheet | `src/components/log/PhotoSource.tsx` | kept, for the camera refused |
| The 2's crop | `src/lib/pour.ts`, `cropCentre` | new |
| Flash off and auto | `src/components/icons.tsx`, `flashOff`, `flashAuto` | new glyphs |
| Flash's spoken state | `src/components/ui.tsx`, `MediaIconButton`'s `accessibilityValue` | new prop |

Rules that hold everywhere:

- **Nothing new is asked of the phone.** The camera is expo-camera, already in the build for Reels (no new native module, no new package, nothing for `expo prebuild`); the camera permission is the one Sipply already asks, in app.json's words. The photo library is never read: the camera-roll key opens the system picker, which needs no permission (§4).
- **Posting still works with the camera refused.** Every door falls back to the sheet it opened before v4.11 (§5).
- **A photo is a photo as before.** Whatever the camera hands back goes through `lib/pour` exactly as a picked photo did: `persistPhoto` strips the metadata, turns it upright, caps it at 2048px and keeps it in the app's documents; the upload strips again (§7).
- **One hue.** The camera is the reel ground's black and white: no accent anywhere on it. Squared keys; the shutter is the one circle, as the reel recorder's is.

---

## 1. What it does

Every way into a post opens the camera, full screen, sliding up (a fade under Reduce Motion), the status bar hidden:

- **The drink page's pinned key** ("Post this drink", "Post <name> again"): the camera; a photo taken or chosen raises the post sheet with that photo already picked, at its caption, Add place, and **Save to Dex** / **Save & post** (or **Save photo** / **Save & post** for a drink already in the Dex). The sheet's old first screen, "Take photo / Choose photo", is skipped.
- **The + window** (Home's +, and every other "Post a drink": Tournaments, Profile, Stats, today's pours, the daily-idea and notification links): the search comes first, as it has since v4; **picking a drink opens the camera**, and a photo lands in compose's photo slot. A window opened for one drink (`/log?drink=<id>`, a drink you added's own Post key) opens the camera as soon as it has finished rising.
- **"Choose another"** under a picked photo in the sheet, and **the photo slot** in compose (empty or not): the camera again. In the sheet it opens over the sheet, so the caption and the place stay; a new photo replaces the old one.

**Close camera** (the X) hands nothing back: from the drink page it is the page as it was, nothing posted, nothing saved; in compose the slot stays as it was.

## 2. The screen

```
┌──────────────────────────────┐
│ [X]                  [flash] │  top: under the island, 8 + 44 + 8
├──────────────────────────────┤
│                              │
│        live picture, 3:4     │  the screen's width
│                              │
│        [.5] [1×] [2]         │  12 over the picture's foot
├──────────────────────────────┤
│ [roll]      ( O )    [flip]  │  foot: the shutter on the axis
└──────────────────────────────┘
```

- **The picture is 3:4**, the sensor's own shape, at the screen's full width (393 x 524 on a 6.1-inch phone). expo-camera crops a still to its preview's shape, so 3:4 makes the photo the whole frame, the shape the system camera handed back before. A phone too short for the top row, a full-width frame and the shutter (a 4.7-inch phone with a large text size) narrows the frame instead, still 3:4.
- **Keys** are the app's `MediaIconButton`: 44pt squares, a translucent black fill and a faint white edge, the reel recorder's. Spoken: **Close camera**, **Flash** (with its value: Off, Auto, On), **Choose from library**, **Take photo**, **Switch camera** (with a hint: "Uses the front camera" or "Uses the back camera"). The zoom chips say "0.5 times zoom", "1 times zoom", "2 times zoom", and the chosen one is selected.
- **The shutter** is the recorder's at rest, a little smaller (a 62pt white disc in a 76pt white ring, 88pt to touch): it greys while held, spins while a photo is being taken, and takes no second press until it is done. It is dimmed until the camera is ready.
- **A camera that will not start** (another app holding it) says so in the frame, "The camera didn't start", with **Try again**, which mounts a new capture session. Close and the library key still work.
- **Mounted only while up.** Every opening starts on the back camera, at 1x, with the flash off, and the capture session ends when it closes. The session also stops while the app is not in front, while the library picker is over it, and as soon as the camera starts to leave.

## 3. Zoom and flash

**Zoom chips** show on the back camera only, as iOS's do; the chosen chip carries the × (".5×", "1×", "2×").

- **.5** is the ultra-wide lens itself, chosen with expo-camera's `selectedLens`. It shows only where the phone has one. expo-camera names lenses by AVFoundation's `localizedName`, in the phone's language, so the lens is found by its name: "ultra" (English "Back Ultra Wide Camera", and the Latin-script languages' "ultra gran angular", "ultra grand-angle", "Ultraweitwinkel"…) or the four CJK forms. A name the rule does not know shows no .5, never a wrong lens. Single-lens phones (SE, XR) and the front camera have none.
- **1** is the default lens, `builtInWideAngleCamera`.
- **2** is the 1x picture twice as close: the preview is drawn at twice its size from its centre, clipped by the frame, and the photo is cropped to its middle half (`cropCentre`), which is exactly what the preview showed. Not expo-camera's `zoom`: on iOS that prop is a fraction of the lens's maximum on a curve (`videoZoomFactor = max ^ zoom`, with `max` the active format's own, different by phone and format and not readable from JavaScript), so no value of it means 2x on every phone. Half of a 4032 x 3024 photo is 2016 x 1512, and every post is capped at 2048 anyway, so the 2 loses nothing the post keeps. The 2's preview is the 1x preview enlarged and is softer than iOS's own 2x on a 48 MP phone; the photo is not.
- The telephoto lens (3x, 5x on the Pro phones) is not offered: its factor is not knowable from its name, and a chip must say what it does.
- The preview's scale is always a transform (1 or 2), never one that comes and goes, so the camera view's native shape never changes (the build 35 lesson; there is no text field on this screen, but the rule costs nothing).

**Flash** is one key that steps **Off → Auto → On**: the bolt struck through, the bolt with an A, and the plain bolt on the selected (white) key. Off by default, every time: a flash in a bar is rarely wanted. Not shown on the front camera, whose flash is the screen and is not something JavaScript can see; expo-camera never sets a mode a camera does not support.

## 4. The camera roll

The key at the bottom left opens the **system photo picker** (`lib/pour`'s `pickFromLibrary`, PHPicker, compatible representation), over the camera. It runs outside the app and returns only the photo chosen, so it needs **no photo-library permission**, and Sipply still never asks for one.

iOS's camera shows your last photo on that key. Showing it would mean reading the photo library (expo-media-library, and the "Allow access to your photos" prompt) just to draw a thumbnail, contradicting app.json's promise that nothing is read from the library unless picked. So the key is the app's own photos glyph (`grid`, the one on "Choose photo") on a squared key.

Cancel comes back to the camera as it was. A photo chosen goes to the post step like a photo taken.

## 5. Permission, and the fallbacks

`useCameraAccess` asks at every tap that needs the camera: granted, the camera opens; never answered, iOS's own prompt appears at that tap (app.json's `cameraPermission`: "Sipply uses the camera to photograph a drink you are posting…"), which is how the photo camera has always asked; refused, now or before, the door falls back:

| Door | Camera refused |
|---|---|
| Drink page's post key | the post sheet at its two sources, **Take photo** and **Choose photo**, as before v4.11 |
| Sheet's Choose another | back to those two sources, as before |
| Sheet's Take photo | the system camera (`pickFromCamera`), whose refusal is the alert "Camera access needed" with **Open Settings** |
| + window, a drink picked | nothing opens by itself; compose waits with its empty slot |
| + window's photo slot | the "camera or library" sheet, as before; its Take photo is the same system camera and the same **Open Settings** |

**Choose photo** works in every case: the library needs no permission. Asked at every tap, so a camera turned on in Settings opens at the next Post with nothing to re-check. On the web the doors always fall back (the web was never a target for the camera).

## 6. Order of presentations

iOS drops a modal asked for while another is still being presented or dismissed. Three places this matters:

1. **The drink page's sheet after the camera.** The camera closes, and the sheet rises in the camera's `onDismiss`, never in the same commit (a photo waits in a ref, `sheetAfterCamera`). Close camera leaves nothing waiting.
2. **A library photo.** The picker hands its answer over as it starts to leave, and handing the photo back closes the camera. The camera holds the photo for `PICKER_SETTLE_MS` (500 ms) first; a sheet's dismissal is about 0.35 s and has begun before the answer arrives.
3. **`/log?drink=`.** The + window is itself a full-screen modal rising; the camera opens on its `transitionEnd`, once. A window that never reports one keeps its slot, one tap from the camera. A drink handed back by the add-a-drink form does not open the camera by itself: the form is a sheet still on its way down when the drink lands.

"Choose another" and Take photo present the camera **from inside the sheet's modal**, as the place search already is: iOS presents only from the topmost view controller, which while the sheet is up is the sheet.

## 7. What a photo goes through

- **Taken**: `takePictureAsync` at quality 0.9 with no EXIF asked for, from the back or front camera (the front mirrored, as the preview showed it, as the reel recorder does), with the shutter sound. Its way up comes from the phone's motion (`responsiveOrientationWhenOrientationLocked` on the `CameraView`), as the system camera's did: without it expo-camera reads iOS's device orientation, which stays portrait while Portrait Orientation Lock is on, so a photo framed with the phone on its side would be saved sideways and `persistPhoto` would make that permanent as it turns the pixels upright. The screen stays portrait, and the 3:4 crop with it (expo-camera sizes the crop by the screen's orientation, not the photo's). At 2, `cropCentre` crops the middle half (the manipulator decodes it upright first) and the uncropped file is deleted; a crop that fails keeps the whole photo rather than losing it. A capture that fails is told: "The photo didn't take. Try again, or choose one from your library."
- **Chosen**: `pickFromLibrary`, as before.
- **Then**, unchanged: the post step's `persistPhoto` (strip, upright, 2048 cap, Documents/unlocks), `unlock` / `updatePhoto` and the signed-out Save to Dex, `addPost` with the caption, tags, song and place, `addPhotoForDrink` for Save photo, and `reportPost` / `reportPostPhoto` for what became of it.
- A photo closed away (Close mid-capture) is deleted. Files the camera wrote that were not saved stay in `<cache>/Camera` until iOS empties the cache, as the picker's always have (`pruneCameraCache` takes only the recorder's `.mov`s).

## 8. Checked, and what only a phone can check

Checked 30 Oct 2026 in the worktree: `npx tsc --noEmit`, `npx expo lint`, every `scripts/check-*.mjs`, every build script's `--check`, `specs/v4.11/shop.test.mjs`, `specs/v4.10/email-focus.test.mjs`, and `npx expo export -p ios --clear`.

On a phone (TestFlight), before this ships:

- A drink page: Post opens the camera; a photo raises the sheet with it; Close leaves the page; Choose another opens the camera over the sheet and keeps the caption.
- Home's +: pick a drink, the camera opens; Close leaves the empty slot; the slot opens it again.
- A drink you added: its Post key opens the + window, then the camera.
- The camera roll key: a photo chosen goes through as a photo taken, and cancel returns to the camera.
- Zoom: .5 on a phone with an ultra-wide (and in Spanish), none on an SE; 2 keeps what the preview showed; landscape photos stay landscape, with Portrait Orientation Lock on and off.
- Flash off, auto, on, in a dark room; no flash key on the front camera.
- Refuse the camera at the first prompt: the sheet's two sources come up, Choose photo works, Take photo offers Open Settings; turn it on in Settings and the next Post opens the camera.
- VoiceOver: Close camera, Flash (and its value), the zoom chips, Choose from library, Take photo, Switch camera.
