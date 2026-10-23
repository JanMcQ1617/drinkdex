/* ==================================================================== */
/* The Dock's plan: where the film leaves its wordmark, and when        */
/* everything moves                                                     */
/*                                                                      */
/* v4.6 (Jan, 23 Oct 2026; specs/v4.6-details/spec.md, B). When the     */
/* film ends, its finished wordmark glides and shrinks into the first   */
/* screen's own wordmark while the app rises underneath. This file is   */
/* the arithmetic of that and nothing else: the rect the film's last    */
/* frame draws the wordmark in, as a pure function of the screen, and   */
/* the timeline's numbers. lib/introDock is the clock and the registry  */
/* that run them; VideoIntro is the film that hands over.               */
/*                                                                      */
/* IMPORTS NOTHING, and uses only TypeScript that Node can strip, so    */
/* scripts/check-intro-dock.mjs runs this very file against the film's  */
/* own generator output (~/Projects/sipply-intro/d-the-tag/tools/       */
/* data.json). The callers pass the two inputs that live elsewhere: the */
/* splash's width (brand/paths SPLASH_MARK) and the wordmark's viewBox  */
/* (brand/paths WORDMARK_PATH). A copy of either here would be a second */
/* source that could drift from the art; passed in, it cannot.          */
/* ==================================================================== */

/** The clip's frame, in film px. */
export const FILM_W = 1080;
export const FILM_H = 1920;
/** How wide the film draws the splash's 1024 canvas, in film px (centred at 540, 960). */
export const FILM_SPLASH_PX = 483;
/**
 * How wide the film's end frame draws the wordmark's viewBox, in film px,
 * centred on the film's own centre (gen.cjs WM_W). The viewBox is the
 * app's (brand/paths), so the vector wordmark laid on this rect covers
 * the film's ink to the pixel: the Dock round measured 1 px at 2x, and
 * both grounds are exact white.
 */
export const FILM_WORDMARK_PX = 660;
export const FILM_CENTRE_X = 540;
export const FILM_CENTRE_Y = 960;
/**
 * From here to the clip's end (5.00s) the frame is the finished wordmark,
 * still: the drip lands at 3.48. A tap at or past it can dock from the
 * frame on screen; a tap before it would dock a half-written name.
 */
export const FILM_STILL_S = 3.5;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Points per film px: the native splash's width over the film's (220/483). */
export function filmPt(splashWidth: number): number {
  return splashWidth / FILM_SPLASH_PX;
}

/**
 * The film's own frame on the screen: at the splash's scale and centred,
 * as VideoIntro lays the VideoView (its header, FRAME 0 IS THE SPLASH).
 * It may overflow the screen or stop short of it.
 */
export function filmRect(screenW: number, screenH: number, pt: number): Rect {
  const w = FILM_W * pt;
  const h = FILM_H * pt;
  return { x: (screenW - w) / 2, y: (screenH - h) / 2, w, h };
}

/**
 * The box the film's end frame draws the wordmark's viewBox in, in
 * points on this screen: 300.62 x 185.40, at 44.69, 329.30 on a 390 x 844.
 * Worked out through the film's frame rather than as "centred on the
 * screen", so it stays right if the film's wordmark ever moves off the
 * film's centre: change FILM_CENTRE and the check script says whether
 * the generator agrees.
 */
export function filmWordmarkRect(
  screenW: number,
  screenH: number,
  pt: number,
  viewBox: readonly number[],
): Rect {
  const film = filmRect(screenW, screenH, pt);
  const vbW = viewBox[2] ?? 1;
  const vbH = viewBox[3] ?? 1;
  const wPx = FILM_WORDMARK_PX;
  const hPx = (wPx * vbH) / vbW;
  return {
    x: film.x + (FILM_CENTRE_X - wPx / 2) * pt,
    y: film.y + (FILM_CENTRE_Y - hPx / 2) * pt,
    w: wPx * pt,
    h: hPx * pt,
  };
}

/* -------------------------------------------------------------------- */
/* The timeline, in ms after the film's playToEnd (spec B.4)            */
/* -------------------------------------------------------------------- */

/** The whole transition: one linear clock, 0 to 1 over this. */
export const DOCK_MS = 880;
/** The flight's end, and the frame the destination's own wordmark takes over from the flying one. */
export const HANDOFF_MS = 600;
/**
 * Smaller Text (a destination under 40pt tall, the drip-less cut): the
 * flying full cut and the destination's own cut cross-fade from here to
 * the hand-off, so the drip is gone by the time the two are one.
 */
export const SM_FADE_FROM = 450;
/** Home's stories rule draws itself in over this window (the pen signs the page). */
export const RULE_FROM = 560;
export const RULE_MS = 320;
/** A tap during the transition runs the clock home over this, rather than snapping. */
export const SKIP_MS = 160;
/** How long the film's still end frame waits for a destination to measure before it settles instead. */
export const TARGET_WAIT_MS = 150;
/** The settle (no destination): the wordmark lifts this far and shrinks to this, about its centre. */
export const SETTLE_LIFT = 12;
export const SETTLE_SCALE = 0.94;
/** The dissolve, today's EXIT_MS: the error path, the settle and a skip before the wordmark is finished. */
export const EXIT_MS = 280;

/**
 * One group of the app rising into place: it travels `dy` points up over
 * [start, start + dur] on RISE, and its opacity runs 0 to 1 over the
 * first `opMs` of that, on RISE or, `opLinear`, straight.
 */
export interface RiseGroup {
  start: number;
  dur: number;
  dy: number;
  opMs: number;
  opLinear: boolean;
}

/*
 * Bottom first, in one direction: the frame, then the page, then the
 * stories once the wordmark's foot has cleared their rings.
 *
 *   chrome   Home's keys and the tab bar; sign-in's step bar. Opacity is
 *            linear over 64 ms (4 frames) so the red Tournaments key and
 *            the Activity dot are tinted for 3 frames at most, never a
 *            pink disc. The dot rides here: it is drawn inside TopBarButton.
 *   feed     Home's whole list, so every row moves together on any phone.
 *            Opacity over its first 30% (132 ms), so a photo is washed
 *            pink for 2 frames, not 8.
 *   stories  TodaysPours, nested in the feed (opacities multiply; the
 *            feed's is 1 by 290 ms). It waits until 360 because before
 *            that the red script lies on "Your story" and the first name.
 *            The stories rule rides inside it: under 1.5pt of rise is left
 *            when the rule starts drawing at 560.
 *   wall     the onboarding welcome's wall of prints: a fade, no rise,
 *            because its rows already drift.
 *   body     what stands where a large wordmark lands (the welcome's line,
 *            terms and keys; sign-in's form; the reset's form), so it
 *            waits until the wordmark has nearly arrived.
 */
export const RISE_GROUPS = {
  chrome: { start: 160, dur: 360, dy: 8, opMs: 64, opLinear: true },
  feed: { start: 240, dur: 440, dy: 16, opMs: 132, opLinear: false },
  stories: { start: 360, dur: 420, dy: 14, opMs: 126, opLinear: false },
  wall: { start: 360, dur: 420, dy: 0, opMs: 126, opLinear: false },
  body: { start: 420, dur: 460, dy: 10, opMs: 138, opLinear: false },
} as const satisfies Record<string, RiseGroup>;

export type RiseGroupName = keyof typeof RISE_GROUPS;
