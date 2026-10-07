import React from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { colors } from '@/constants/theme';

/* ==================================================================== */
/* Icon system                                                          */
/*                                                                      */
/* Hand-drawn on a 24×24 grid. One visual language throughout:          */
/*   • 1.75 stroke, round caps and joins (echoes Playfair Display's     */
/*     bracketed serifs — a hairline or a miter join would fight it)    */
/*   • outline for resting state, filled for active state               */
/*   • geometry sits on half-pixel centers so strokes stay crisp        */
/*                                                                      */
/* Replaces the emoji glyphs, which rendered as system font art —       */
/* inconsistent weight, uncontrollable color, and visibly "cheap".      */
/*                                                                      */
/* Two marks are not ours. The solid `facebook` is Meta's published     */
/* mark, drawn as published for the sign-in button (see its note in     */
/* SOLID); it is neither hand-drawn nor an active state. GoogleMark,    */
/* at the foot of this file, is Google's "G" for the same reason, and   */
/* is a component of its own because it is four colours, not one.       */
/*                                                                      */
/* Nothing here copies another app's glyph. `reels` in particular is a  */
/* portrait film gate, not a clapperboard and not a play-in-a-square,   */
/* which are Instagram's.                                               */
/* ==================================================================== */

const STROKE = 1.75;

export type IconName =
  | 'home'
  | 'dex'
  | 'atlas'
  | 'stats'
  | 'profile'
  | 'search'
  | 'eye'
  | 'eyeOff'
  | 'close'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'lock'
  | 'camera'
  | 'heart'
  | 'plus'
  | 'check'
  | 'users'
  | 'share'
  | 'more'
  | 'filter'
  | 'bookmark'
  | 'trophy'
  | 'flame'
  | 'grid'
  | 'settings'
  | 'comment'
  | 'instagram'
  | 'facebook'
  | 'document'
  | 'bottle'
  | 'reels'
  | 'alert'
  | 'mail'
  | 'phone'
  | 'addPerson'
  | 'stack'
  | 'flip'
  | 'flash'
  | 'volume'
  | 'volumeOff'
  | 'play'
  | 'pause'
  | 'send'
  | 'music';

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  /** Solid weight — used for active nav and engaged toggles, and for the
   *  Facebook mark on the sign-in button. */
  filled?: boolean;
}

/* ------------------------------------------------------------------ */
/* Path data                                                           */
/* ------------------------------------------------------------------ */

/** Outline geometry. Stroked, never filled. */
const OUTLINE: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <Path d="M3.2 10.4 12 3.4l8.8 7" />
      <Path d="M5.4 9.3V19.4a1.6 1.6 0 0 0 1.6 1.6h10a1.6 1.6 0 0 0 1.6-1.6V9.3" />
      <Path d="M9.6 21V14.9h4.8V21" />
    </>
  ),
  // A stemmed coupe — the Dex's own subject, and legible at 20pt.
  dex: (
    <>
      <Path d="M3.9 5.4h16.2l-8.1 8.3z" />
      <Path d="M12 13.7v5.5" />
      <Path d="M8.3 19.6h7.4" />
    </>
  ),
  atlas: (
    <>
      <Circle cx={12} cy={12} r={8.7} />
      <Path d="M3.3 12h17.4" />
      <Path d="M12 3.3c2.2 2.4 3.4 5.4 3.4 8.7s-1.2 6.3-3.4 8.7c-2.2-2.4-3.4-5.4-3.4-8.7S9.8 5.7 12 3.3Z" />
    </>
  ),
  profile: (
    <>
      <Circle cx={12} cy={8.2} r={3.7} />
      <Path d="M4.9 20.4a7.3 7.3 0 0 1 14.2 0" />
    </>
  ),
  // Ascending bar chart — collection progress at a glance.
  stats: (
    <>
      <Path d="M5.2 20.2V13.6" />
      <Path d="M12 20.2V8.4" />
      <Path d="M18.8 20.2V4.6" />
      <Path d="M3 20.2h18" />
    </>
  ),
  search: (
    <>
      <Circle cx={10.8} cy={10.8} r={6.4} />
      <Path d="M15.5 15.5 20.4 20.4" />
    </>
  ),
  /*
   * Reveal / hide, for password fields. The set had no eye, so those
   * fields borrowed the magnifier and the close cross — which told the
   * user the button would search, and then that it would dismiss.
   */
  eye: (
    <>
      <Path d="M2.6 12C5.4 7.6 8.6 5.4 12 5.4c3.4 0 6.6 2.2 9.4 6.6-2.8 4.4-6 6.6-9.4 6.6-3.4 0-6.6-2.2-9.4-6.6Z" />
      <Circle cx={12} cy={12} r={3.1} />
    </>
  ),
  eyeOff: (
    <>
      <Path d="M2.6 12C5.4 7.6 8.6 5.4 12 5.4c3.4 0 6.6 2.2 9.4 6.6-2.8 4.4-6 6.6-9.4 6.6-3.4 0-6.6-2.2-9.4-6.6Z" />
      <Circle cx={12} cy={12} r={3.1} />
      <Path d="M4.6 4.6 19.4 19.4" />
    </>
  ),
  close: (
    <>
      <Path d="M6.2 6.2 17.8 17.8" />
      <Path d="M17.8 6.2 6.2 17.8" />
    </>
  ),
  chevronLeft: <Path d="M14.6 5.4 8 12l6.6 6.6" />,
  chevronRight: <Path d="M9.4 5.4 16 12l-6.6 6.6" />,
  chevronDown: <Path d="M5.4 9.4 12 16l6.6-6.6" />,
  lock: (
    <>
      <Path d="M5.9 10.6h12.2a1.4 1.4 0 0 1 1.4 1.4v7.2a1.4 1.4 0 0 1-1.4 1.4H5.9a1.4 1.4 0 0 1-1.4-1.4V12a1.4 1.4 0 0 1 1.4-1.4z" />
      <Path d="M8.1 10.4V7.6a3.9 3.9 0 0 1 7.8 0v2.8" />
    </>
  ),
  camera: (
    <>
      <Path d="M4.6 7.9h3.1l1.5-2.2h5.6l1.5 2.2h3.1a1.5 1.5 0 0 1 1.5 1.5v8.4a1.5 1.5 0 0 1-1.5 1.5H4.6a1.5 1.5 0 0 1-1.5-1.5V9.4a1.5 1.5 0 0 1 1.5-1.5z" />
      <Circle cx={12} cy={13.4} r={3.5} />
    </>
  ),
  heart: (
    <Path d="M12 20.3 4.9 13.4a4.3 4.3 0 0 1 0-6.2 4.5 4.5 0 0 1 6.3 0l.8.8.8-.8a4.5 4.5 0 0 1 6.3 0 4.3 4.3 0 0 1 0 6.2z" />
  ),
  comment: (
    <Path d="M20.4 12.6a7.4 7.4 0 0 1-8 7.4 8.5 8.5 0 0 1-3-.6L4.2 20.4l1.1-4.9a7.4 7.4 0 0 1-.7-3.2 7.4 7.4 0 0 1 8-7.4 7.5 7.5 0 0 1 7.8 7.4z" />
  ),
  /*
   * Instagram's mark redrawn on our own grid rather than dropped in as the
   * brand asset: at 1.75 stroke beside the other glyphs it reads as part of
   * the set, and Meta's guidelines forbid restyling the official logo. It
   * labels a Sipply feature, so it should look like Sipply.
   */
  instagram: (
    <>
      <Path d="M7.6 3.9h8.8a3.7 3.7 0 0 1 3.7 3.7v8.8a3.7 3.7 0 0 1-3.7 3.7H7.6a3.7 3.7 0 0 1-3.7-3.7V7.6a3.7 3.7 0 0 1 3.7-3.7Z" />
      <Circle cx={12} cy={12} r={3.6} />
      <Path d="M16.9 7.15h.01" />
    </>
  ),
  /*
   * Facebook, drawn two ways for two jobs.
   *
   * This outline is ours, on our grid, for the same reason as the Instagram
   * glyph above: where it labels a Sipply feature (a "Connect Facebook"
   * row, a friends list), it should read as part of this set. The ring is
   * the Atlas ring and the f stands on its lowest point, as Facebook's own
   * f runs out through the foot of its disc.
   *
   * The solid (below) is Facebook's own mark. It is for the sign-in button,
   * where the control stands for their account and Meta's guidelines ask
   * for their logo as published.
   */
  facebook: (
    <>
      <Circle cx={12} cy={12} r={8.7} />
      <Path d="M11.5 20.7V11.1a3.7 3.7 0 0 1 3.7-3.7" />
      <Path d="M9 13.4h6" />
    </>
  ),
  plus: (
    <>
      <Path d="M12 5.2v13.6" />
      <Path d="M5.2 12h13.6" />
    </>
  ),
  check: <Path d="M5 12.6 9.8 17.4 19 6.9" />,
  users: (
    <>
      <Circle cx={9.4} cy={8.4} r={3.4} />
      <Path d="M3.4 20.1a6.2 6.2 0 0 1 12 0" />
      <Path d="M16.1 5.4a3.4 3.4 0 0 1 0 6.6" />
      <Path d="M17.6 14.6a6.2 6.2 0 0 1 3 5.5" />
    </>
  ),
  share: (
    <>
      <Path d="M12 15.4V3.9" />
      <Path d="M8.2 7.5 12 3.7l3.8 3.8" />
      <Path d="M5.4 13.2v5.9a1.5 1.5 0 0 0 1.5 1.5h10.2a1.5 1.5 0 0 0 1.5-1.5v-5.9" />
    </>
  ),
  more: (
    <>
      <Circle cx={5.4} cy={12} r={1.15} />
      <Circle cx={12} cy={12} r={1.15} />
      <Circle cx={18.6} cy={12} r={1.15} />
    </>
  ),
  filter: (
    <>
      <Path d="M3.8 6.4h16.4" />
      <Path d="M6.6 12h10.8" />
      <Path d="M9.8 17.6h4.4" />
    </>
  ),
  bookmark: <Path d="M6.4 4.6h11.2v15.8L12 16.3l-5.6 4.1z" />,
  /*
   * A page with a turned corner — a document to read (Terms of Use). The
   * bookmark stood in for it and already means "save a post"; one glyph
   * with two jobs on neighbouring screens reads as the same action.
   */
  document: (
    <>
      <Path d="M13.8 3.4H6.6a1.4 1.4 0 0 0-1.4 1.4v14.4a1.4 1.4 0 0 0 1.4 1.4h10.8a1.4 1.4 0 0 0 1.4-1.4V8.4z" />
      <Path d="M13.8 3.4v3.6a1.4 1.4 0 0 0 1.4 1.4h3.6" />
      <Path d="M8.6 12.6h6.8" />
      <Path d="M8.6 16.4h4.4" />
    </>
  ),
  /*
   * A bottle on the shelf — what My Bar holds. The coupe is the Dex's own
   * mark; borrowed for an empty shelf it pointed at the wrong screen.
   */
  bottle: (
    <>
      <Path d="M10.4 3.2v4c0 1.4-3.2 1.8-3.2 3.6v8.6a1.4 1.4 0 0 0 1.4 1.4h6.8a1.4 1.4 0 0 0 1.4-1.4v-8.6c0-1.8-3.2-2.2-3.2-3.6v-4z" />
      <Path d="M10.4 5.4h3.2" />
      <Path d="M7.2 12.8h9.6" />
      <Path d="M7.2 17h9.6" />
    </>
  ),
  trophy: (
    <>
      <Path d="M7.4 4.4h9.2v5.1a4.6 4.6 0 0 1-9.2 0z" />
      <Path d="M7.4 5.9H5a1.4 1.4 0 0 0-1.4 1.4 3.6 3.6 0 0 0 3.6 3.6" />
      <Path d="M16.6 5.9H19a1.4 1.4 0 0 1 1.4 1.4 3.6 3.6 0 0 1-3.6 3.6" />
      <Path d="M12 14.1v3.4" />
      <Path d="M8.4 20.2a3.6 3.6 0 0 1 7.2 0z" />
    </>
  ),
  flame: (
    <Path d="M12 20.6a5.2 5.2 0 0 0 5.2-5.2c0-4.4-5.2-8.4-5.2-12-2 2.6-2.6 4.6-2.6 6.2 0 1.3-1 1.9-1.7 1.1a3 3 0 0 1-.6-1.1 7.6 7.6 0 0 0-1.3 5.8 5.2 5.2 0 0 0 5.2 5.2z" />
  ),
  grid: (
    <>
      <Path d="M4.4 4.4h6v6h-6z" />
      <Path d="M13.6 4.4h6v6h-6z" />
      <Path d="M4.4 13.6h6v6h-6z" />
      <Path d="M13.6 13.6h6v6h-6z" />
    </>
  ),
  settings: (
    <>
      <Circle cx={12} cy={12} r={3.1} />
      <Path d="M19.1 14.6a1.6 1.6 0 0 0 .3 1.7l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-1.7-.3 1.6 1.6 0 0 0-1 1.4v.2a1.9 1.9 0 1 1-3.8 0v-.1a1.6 1.6 0 0 0-1-1.4 1.6 1.6 0 0 0-1.7.3l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0 .3-1.7 1.6 1.6 0 0 0-1.4-1h-.2a1.9 1.9 0 1 1 0-3.8h.1a1.6 1.6 0 0 0 1.4-1 1.6 1.6 0 0 0-.3-1.7l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.7.3h.1a1.6 1.6 0 0 0 1-1.4v-.2a1.9 1.9 0 1 1 3.8 0v.1a1.6 1.6 0 0 0 1 1.4 1.6 1.6 0 0 0 1.7-.3l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0-.3 1.7v.1a1.6 1.6 0 0 0 1.4 1h.2a1.9 1.9 0 1 1 0 3.8h-.1a1.6 1.6 0 0 0-1.4 1z" />
    </>
  ),
  /*
   * Reels: a portrait film gate. A tall frame (the shape of a phone held
   * upright, which is the shape of what it holds), a play triangle, and two
   * short ticks hanging from the top edge like the claws of a film gate.
   * Deliberately not a clapperboard band with diagonal stripes, and not a
   * play triangle in a square: those are other apps' marks.
   */
  reels: (
    <>
      <Path d="M7.75 2.75h8.5a2.5 2.5 0 0 1 2.5 2.5v13.5a2.5 2.5 0 0 1-2.5 2.5h-8.5a2.5 2.5 0 0 1-2.5-2.5V5.25a2.5 2.5 0 0 1 2.5-2.5Z" />
      <Path d="M10.4 9.3v5.4l4.3-2.7Z" />
      <Path d="M9.5 2.75v2.5" />
      <Path d="M14.5 2.75v2.5" />
    </>
  ),
  /*
   * Something is wrong: errors in fields and notices, and the "could not
   * load" state. A ring and an exclamation, so it is not mistaken for the
   * close cross beside it.
   */
  alert: (
    <>
      <Circle cx={12} cy={12} r={8.7} />
      <Path d="M12 7.7v5.1" />
      <Path d="M12 16.3h.01" />
    </>
  ),
  /* An envelope: "Continue with email". */
  mail: (
    <>
      <Path d="M4.4 5.6h15.2a1.6 1.6 0 0 1 1.6 1.6v9.6a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6V7.2a1.6 1.6 0 0 1 1.6-1.6Z" />
      <Path d="m3.4 7.1 8.6 6.3 8.6-6.3" />
    </>
  ),
  /* A handset seen face-on: "Continue with phone number". */
  phone: (
    <>
      <Path d="M8.9 2.7h6.2a2.3 2.3 0 0 1 2.3 2.3v14a2.3 2.3 0 0 1-2.3 2.3H8.9a2.3 2.3 0 0 1-2.3-2.3V5a2.3 2.3 0 0 1 2.3-2.3Z" />
      <Path d="M10.5 18.3h3" />
    </>
  ),
  /* A person with a plus: follow someone, find friends. */
  addPerson: (
    <>
      <Circle cx={9.6} cy={8.2} r={3.6} />
      <Path d="M3.2 20.2a6.4 6.4 0 0 1 12.8 0" />
      <Path d="M18.6 8.4v6" />
      <Path d="M15.6 11.4h6" />
    </>
  ),
  /* Two squares offset: a post with more than one photo. */
  stack: (
    <>
      <Path d="M8.4 8.4h11.2v11.2H8.4z" />
      <Path d="M4.4 15.6V4.4h11.2" />
    </>
  ),
  /*
   * Flip camera: a small camera body inside two arcs that chase each other
   * round it, each with its arrowhead, so it reads as "turn around" rather
   * than "refresh" (one arc) or "sync" (two arcs with nothing inside).
   */
  flip: (
    <>
      <Path d="M4.47 9.98A7.8 7.8 0 0 1 19.53 9.98" />
      <Path d="M20.46 7.98 19.53 9.98 17.73 8.72" />
      <Path d="M19.53 14.02A7.8 7.8 0 0 1 4.47 14.02" />
      <Path d="M3.54 16.02 4.47 14.02 6.27 15.28" />
      <Path d="M9.7 9.5h4.6a1.1 1.1 0 0 1 1.1 1.1v3.4a1.1 1.1 0 0 1-1.1 1.1H9.7a1.1 1.1 0 0 1-1.1-1.1v-3.4a1.1 1.1 0 0 1 1.1-1.1Z" />
      <Circle cx={12} cy={12.3} r={0.7} />
    </>
  ),
  /* A lightning bolt: the torch. Solid when it is on. */
  flash: <Path d="M13.4 2.8 5.8 13.3h5.5l-.9 7.9 7.8-10.6h-5.5z" />,
  /* A speaker and two waves: sound is on. */
  volume: (
    <>
      <Path d="M3.5 10.3a.9.9 0 0 1 .9-.9h3.1l4.6-4v13.2l-4.6-4H4.4a.9.9 0 0 1-.9-.9z" />
      <Path d="M15.3 9.2a4 4 0 0 1 0 5.6" />
      <Path d="M17.9 6.6a7.6 7.6 0 0 1 0 10.8" />
    </>
  ),
  /* The same speaker, no waves, struck through: sound is off. */
  volumeOff: (
    <>
      <Path d="M3.5 10.3a.9.9 0 0 1 .9-.9h3.1l4.6-4v13.2l-4.6-4H4.4a.9.9 0 0 1-.9-.9z" />
      <Path d="M4.4 4.4 19.6 19.6" />
    </>
  ),
  /*
   * A small play triangle, for the badge on a reel tile. Always drawn
   * filled (see SOLID); this outline exists only because every name must
   * have one.
   */
  play: <Path d="M8.2 5.6v12.8a.8.8 0 0 0 1.22.68l10.2-6.4a.8.8 0 0 0 0-1.36L9.42 4.92A.8.8 0 0 0 8.2 5.6Z" />,
  /* Two bars: a song preview is playing, and a tap stops it. */
  pause: (
    <>
      <Path d="M8.8 5.6v12.8" />
      <Path d="M15.2 5.6v12.8" />
    </>
  ),
  /*
   * Share a post: a paper dart seen from the side, rising to the right,
   * the wing over the keel folded under it. Instagram's send glyph is a
   * top-down triangle with a centre fold, and Apple's paperplane is the
   * same view; this is neither.
   */
  send: (
    <>
      <Path d="M2.9 10.9 21.1 4.9 9.1 13.1z" />
      <Path d="M9.1 13.1 21.1 4.9 12.6 19.1z" />
    </>
  ),
  /* Two beamed quavers, for a song on a story: generic notation, not Apple Music's mark. */
  music: (
    <>
      <Path d="M9.4 17V5.8l9.4-2.2v11" />
      <Circle cx={7.2} cy={17.1} r={2.2} />
      <Circle cx={16.6} cy={14.7} r={2.2} />
    </>
  ),
};

/**
 * Solid geometry. Filled, never stroked — so weight stays even where an
 * outline icon would double up its own strokes.
 *
 * Icons absent here fall back to their outline drawn at a heavier stroke,
 * which reads correctly for linear marks (chevrons, plus, check).
 */
const SOLID: Partial<Record<IconName, React.ReactNode>> = {
  home: (
    <Path
      d="M12 2.7a1.4 1.4 0 0 1 .9.3l8.3 6.6a1.4 1.4 0 0 1 .5 1.1v8.7a2.2 2.2 0 0 1-2.2 2.2h-4.6v-5.7a1 1 0 0 0-1-1h-3.8a1 1 0 0 0-1 1v5.7H4.5a2.2 2.2 0 0 1-2.2-2.2v-8.7a1.4 1.4 0 0 1 .5-1.1l8.3-6.6a1.4 1.4 0 0 1 .9-.3z"
      fillRule="evenodd"
    />
  ),
  dex: (
    <>
      <Path d="M3.5 5.1a.5.5 0 0 0-.36.85l8.5 8.7a.5.5 0 0 0 .72 0l8.5-8.7a.5.5 0 0 0-.36-.85z" />
      <Path d="M11.1 14.6h1.8v4.3h2.8a.9.9 0 0 1 0 1.8H8.3a.9.9 0 0 1 0-1.8h2.8z" />
    </>
  ),
  atlas: (
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2.9a9.1 9.1 0 1 0 0 18.2 9.1 9.1 0 0 0 0-18.2ZM2.9 11.2h18.2v1.6H2.9zM11.2 2.9h1.6v18.2h-1.6z"
    />
  ),
  profile: (
    <>
      <Circle cx={12} cy={8} r={4.2} />
      <Path d="M12 13.6c-4.2 0-7.6 2.9-7.6 6.5a.9.9 0 0 0 .9.9h13.4a.9.9 0 0 0 .9-.9c0-3.6-3.4-6.5-7.6-6.5z" />
    </>
  ),
  stats: (
    <>
      <Path d="M3.9 12.4h2.6a1.1 1.1 0 0 1 1.1 1.1v5.6H2.8v-5.6a1.1 1.1 0 0 1 1.1-1.1z" />
      <Path d="M10.7 7.2h2.6a1.1 1.1 0 0 1 1.1 1.1v10.8H9.6V8.3a1.1 1.1 0 0 1 1.1-1.1z" />
      <Path d="M17.5 3.4h2.6a1.1 1.1 0 0 1 1.1 1.1v14.6h-4.8V4.5a1.1 1.1 0 0 1 1.1-1.1z" />
      <Path d="M2.6 19.8h18.8a.9.9 0 0 1 0 1.8H2.6a.9.9 0 0 1 0-1.8z" />
    </>
  ),
  heart: (
    <Path d="M12 20.9a1 1 0 0 1-.68-.27l-6.9-6.7a5.1 5.1 0 0 1 0-7.4 5.4 5.4 0 0 1 7.58 0 5.4 5.4 0 0 1 7.58 0 5.1 5.1 0 0 1 0 7.4l-6.9 6.7a1 1 0 0 1-.68.27z" />
  ),
  bookmark: <Path d="M6.4 4.6a.9.9 0 0 0-.9.9v14.9a.9.9 0 0 0 1.42.73L12 17.4l5.08 3.73a.9.9 0 0 0 1.42-.73V5.5a.9.9 0 0 0-.9-.9z" />,
  /*
   * Facebook's published mark: a disc with the f cut out of it, the f's
   * stem open through the foot. Meta's 2023 geometry (the Simple Icons
   * path, CC0; the mark itself is Meta's trademark), scaled from its
   * 24-unit disc to 19.2 about the centre so it sits at the optical size
   * of the other solids rather than touching the box. One contour, no
   * evenodd: the f is a notch in the disc's outline, so drawn in
   * onFacebook on a facebook fill, the f shows the button's own blue.
   */
  facebook: (
    <Path d="M9.681 21.353v-6.384H7.702v-2.934h1.979v-1.264c0-3.268 1.478-4.782 4.686-4.782.321 0 .764.034 1.174.082a6.944 6.944 0 0 1 .913.156v2.66a6.898 6.898 0 0 0-.522-.029 21.444 21.444 0 0 0-.586-.007c-.566 0-1.007.077-1.34.247a1.349 1.349 0 0 0-.543.498c-.206.336-.299.796-.299 1.402v1.038h3.135l-.309 1.682-.23 1.251h-2.597v6.596C17.917 20.99 21.6 16.943 21.6 12.035c0-5.302-4.298-9.6-9.6-9.6s-9.6 4.298-9.6 9.6c0 4.502 3.099 8.28 7.281 9.318Z" />
  ),
  trophy: (
    <>
      <Path d="M7.4 4.4h9.2v5.1a4.6 4.6 0 0 1-9.2 0z" />
      <Path d="M11.1 14v3.5h1.8V14z" />
      <Path d="M12 16.6a3.6 3.6 0 0 0-3.6 3.6h7.2a3.6 3.6 0 0 0-3.6-3.6z" />
    </>
  ),
  flame: (
    <Path d="M12 20.6a5.2 5.2 0 0 0 5.2-5.2c0-4.4-5.2-8.4-5.2-12-2 2.6-2.6 4.6-2.6 6.2 0 1.3-1 1.9-1.7 1.1a3 3 0 0 1-.6-1.1 7.6 7.6 0 0 0-1.3 5.8 5.2 5.2 0 0 0 5.2 5.2z" />
  ),
  grid: (
    <>
      <Path d="M4.4 4.4h6v6h-6z" />
      <Path d="M13.6 4.4h6v6h-6z" />
      <Path d="M4.4 13.6h6v6h-6z" />
      <Path d="M13.6 13.6h6v6h-6z" />
    </>
  ),
  lock: (
    <>
      <Path d="M5.9 10.6h12.2a1.4 1.4 0 0 1 1.4 1.4v7.2a1.4 1.4 0 0 1-1.4 1.4H5.9a1.4 1.4 0 0 1-1.4-1.4V12a1.4 1.4 0 0 1 1.4-1.4z" />
      <Path
        d="M8.1 10.4V7.6a3.9 3.9 0 0 1 7.8 0v2.8h-1.8V7.6a2.1 2.1 0 0 0-4.2 0v2.8z"
        fillRule="evenodd"
      />
    </>
  ),
  /*
   * The gate filled, with the triangle and the two ticks knocked out of it
   * (one path, evenodd), so the active tab is a solid slab with the same
   * features as the resting outline. The frame is the outline's outer edge
   * (half a stroke wider all round), and the ticks become slots under a
   * thin top band so the silhouette stays a plain rounded rectangle.
   */
  reels: (
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M7.75 1.875h8.5a3.375 3.375 0 0 1 3.375 3.375v13.5a3.375 3.375 0 0 1-3.375 3.375h-8.5a3.375 3.375 0 0 1-3.375-3.375V5.25A3.375 3.375 0 0 1 7.75 1.875ZM10 8.6v6.8l5.4-3.4ZM8.9 3.4h1.2v2.7H8.9ZM13.9 3.4h1.2v2.7h-1.2Z"
    />
  ),
  flash: <Path d="M13.4 2.8 5.8 13.3h5.5l-.9 7.9 7.8-10.6h-5.5z" />,
  /*
   * The My Bar tab, active: the outline bottle's silhouette grown by half a
   * stroke, with the label band knocked out (evenodd), so the filled glyph
   * still reads as a labelled bottle rather than a blob.
   */
  bottle: (
    <Path
      fillRule="evenodd"
      d="M9.5 2.3h5v4.9c0 .5 3.2 1.2 3.2 3.6v8.6a2.3 2.3 0 0 1-2.3 2.3H8.6a2.3 2.3 0 0 1-2.3-2.3v-8.6c0-2.4 3.2-3.1 3.2-3.6zM8.1 13.4v3.2h7.8v-3.2z"
    />
  ),
  play: (
    <Path d="M8.2 5.6v12.8a.8.8 0 0 0 1.22.68l10.2-6.4a.8.8 0 0 0 0-1.36L9.42 4.92A.8.8 0 0 0 8.2 5.6Z" />
  ),
};

/* ------------------------------------------------------------------ */
/* Components                                                          */
/* ------------------------------------------------------------------ */

/**
 * A single icon.
 *
 * Decorative by default — callers that use an icon as the only content of
 * a control must supply their own `accessibilityLabel` on the pressable.
 */
export const Icon = React.memo(function Icon({
  name,
  size = 24,
  color = colors.text,
  filled = false,
}: IconProps) {
  const solid = filled ? SOLID[name] : undefined;

  if (solid) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <G fill={color}>{solid}</G>
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G
        stroke={color}
        strokeWidth={filled ? STROKE + 0.55 : STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none">
        {OUTLINE[name]}
      </G>
    </Svg>
  );
});

/**
 * Google's "G", for "Continue with Google" and nothing else.
 *
 * Drawn as Google publishes it, on its own 48-unit grid and in its four
 * colours, because the sign-in button stands for a Google account and
 * Google's branding guidelines ask for the mark unaltered. That is also why
 * it is not an `Icon`: it does not take a colour, a stroke or a filled
 * state. The colours are theme tokens (colors.google*), quoted like
 * Facebook's blue. Check the paths against the SVG in Google's branding
 * download before shipping a change to them.
 *
 * Decorative: the button around it carries the label.
 */
export const GoogleMark = React.memo(function GoogleMark({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill={colors.googleRed}
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill={colors.googleBlue}
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill={colors.googleYellow}
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill={colors.googleGreen}
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
});

/**
 * The glyphs the tab bar draws: each has a SOLID form for its active state.
 * Most are named after their route; My Bar's route is `bar` and its glyph
 * is `bottle`. (tabs)/_layout.tsx and FloatingTabBar draw them with
 * <Icon filled={focused} /> in the colour the bar hands them, so the glyph
 * always matches its own label — outline at rest, solid when active, the
 * iOS convention, which reads as a state change without relying on colour.
 */
export type TabName = 'home' | 'dex' | 'atlas' | 'stats' | 'profile' | 'reels' | 'bottle';
