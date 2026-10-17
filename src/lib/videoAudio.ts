import type { VideoPlayer } from 'expo-video';

/* ==================================================================== */
/* Video players and other apps' audio                                  */
/*                                                                      */
/* OPENING SIPPLY MUST NOT STOP SOMEONE'S MUSIC (Jan, 17 Oct 2026).     */
/* Spotify, Apple Music, a podcast: whatever is playing goes on         */
/* playing whenever Sipply makes no sound. Only a sound the person      */
/* chose (a story's song, a reel with its sound on, their own take on   */
/* review) may get in its way, and then by ducking it, never by         */
/* stopping it.                                                         */
/*                                                                      */
/* THE CAUSE WAS EXPO-VIDEO'S DEFAULT. Its docs say a player starts at  */
/* 'auto'; on iOS it starts at doNotMix (ios/VideoPlayer.swift,         */
/* expo-video 57.0.5). Whenever a player starts or stops playing,       */
/* VideoManager.setAudioSession takes the strictest mode among the      */
/* players that are playing, and for doNotMix it sets the .playback     */
/* category without .mixWithOthers and activates the session, muted or  */
/* not, audio track or not. A non-mixable session going active is what  */
/* iOS answers by interrupting every other app's audio. The launch      */
/* film, muted and with no audio track at all, did that on every cold   */
/* start, and because expo-video never deactivates the session,         */
/* nothing ever told the music it could come back.                      */
/*                                                                      */
/* 'AUTO' IS NO BETTER ONCE THERE IS SOUND. It mixes only while no      */
/* player is outputting sound; the moment one is unmuted it drops       */
/* .mixWithOthers and activates the session, which interrupts exactly   */
/* as doNotMix does. It never ducks.                                    */
/*                                                                      */
/* SO SILENT MIXES AND SOUND DUCKS. A muted player is 'mixWithOthers',  */
/* which expo-video keeps mixable and never activates. A player with    */
/* sound is 'duckOthers': the music drops under it and keeps playing,   */
/* rather than pausing for a resume that would only come if Sipply      */
/* deactivated the session. applyMuted writes mode and mute together,   */
/* so neither changes without the other; expo-video re-reads both       */
/* whenever either changes and whenever a player starts or stops.       */
/*                                                                      */
/* SET IT IN THE SETUP CALLBACK, AHEAD OF play(). A player is born      */
/* doNotMix and the session is decided when it starts playing, so a     */
/* mode written afterwards by an effect could land after the music had  */
/* already been stopped.                                                */
/*                                                                      */
/* WHAT JS CANNOT DO IS DEACTIVATE. expo-video never calls              */
/* setActive(false), and nothing else in the app does. Once a sound     */
/* stops, the mode falls back to mixing; whether iOS lifts the duck     */
/* then, or only when Sipply leaves the foreground, has to be checked   */
/* on a phone. If the music stays low, the fix is native (deactivate    */
/* with .notifyOthersOnDeactivation once nothing is playing) and needs  */
/* a build.                                                             */
/*                                                                      */
/* THE RECORDER IS OUT OF THIS FILE'S REACH. With the microphone on,    */
/* expo-camera adds an audio input and leaves AVCaptureSession to       */
/* configure the app's audio session for recording, which is expected   */
/* to stop other audio while /record is open (Reels, behind its flag).  */
/* expo-camera has no option to change that.                            */
/*                                                                      */
/* NO APP.JSON OR PLUGIN CHANGE. Nothing here plays in the background,  */
/* so UIBackgroundModes audio stays off, and a JS-only fix leaves the   */
/* runtime fingerprint alone, so it can reach existing builds over EAS  */
/* Update.                                                              */
/* ==================================================================== */

/**
 * Mutes or unmutes `player` and sets how it sits with other apps' audio to
 * match: muted, it mixes with them; with sound, it ducks them. Every player
 * in the app goes through this, in its setup callback before play() and
 * again whenever its mute changes.
 *
 * A plain function rather than an inline write, because React Compiler
 * treats what a hook returns as immutable and its lint refuses
 * `player.muted = …` inside a component (the note in ReelVideo).
 */
export function applyMuted(player: VideoPlayer, muted: boolean): void {
  /*
   * Sound is only ever on under 'duckOthers'. expo-video applies the session
   * on its own queue, reading whatever both properties hold when it runs,
   * and it can run between these two writes. So an unmute sets the mode
   * before the sound, and a mute takes the sound away before the mode: in
   * between it can only see a silent player, which it keeps mixable, and
   * never sound under 'mixWithOthers', which plays over the music at full
   * volume instead of ducking it.
   */
  if (muted) {
    player.muted = true;
    player.audioMixingMode = 'mixWithOthers';
  } else {
    player.audioMixingMode = 'duckOthers';
    player.muted = false;
  }
}
