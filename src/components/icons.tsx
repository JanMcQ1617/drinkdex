import React from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { colors } from '@/constants/theme';

/* ==================================================================== */
/* Icon system                                                          */
/*                                                                      */
/* Hand-drawn on a 24×24 grid. One visual language throughout:          */
/*   • 1.75 stroke, round caps and joins (echoes Gowun Batang's soft    */
/*     serifs — a hairline or a miter join would fight the type)        */
/*   • outline for resting state, filled for active state               */
/*   • geometry sits on half-pixel centers so strokes stay crisp        */
/*                                                                      */
/* Replaces the emoji glyphs, which rendered as system font art —       */
/* inconsistent weight, uncontrollable color, and visibly "cheap".      */
/* ==================================================================== */

const STROKE = 1.75;

export type IconName =
  | 'home'
  | 'dex'
  | 'stats'
  | 'profile'
  | 'search'
  | 'close'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'lock'
  | 'camera'
  | 'heart'
  | 'plus'
  | 'check'
  | 'sparkle'
  | 'users'
  | 'share'
  | 'more'
  | 'filter'
  | 'bookmark'
  | 'trophy'
  | 'flame'
  | 'grid'
  | 'settings'
  | 'comment';

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  /** Solid weight — used for active nav and engaged toggles. */
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
  plus: (
    <>
      <Path d="M12 5.2v13.6" />
      <Path d="M5.2 12h13.6" />
    </>
  ),
  check: <Path d="M5 12.6 9.8 17.4 19 6.9" />,
  sparkle: (
    <>
      <Path d="M12 3.4c.5 3.9 1.7 5.1 5.6 5.6-3.9.5-5.1 1.7-5.6 5.6-.5-3.9-1.7-5.1-5.6-5.6 3.9-.5 5.1-1.7 5.6-5.6z" />
      <Path d="M17.9 15.1c.3 2 .9 2.6 2.9 2.9-2 .3-2.6.9-2.9 2.9-.3-2-.9-2.6-2.9-2.9 2-.3 2.6-.9 2.9-2.9z" />
    </>
  ),
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
  sparkle: (
    <>
      <Path d="M12 3a.6.6 0 0 1 .6.52c.5 3.66 1.62 4.78 5.28 5.28a.6.6 0 0 1 0 1.19c-3.66.5-4.78 1.62-5.28 5.28a.6.6 0 0 1-1.19 0c-.5-3.66-1.62-4.78-5.28-5.28a.6.6 0 0 1 0-1.19c3.66-.5 4.78-1.62 5.28-5.28A.6.6 0 0 1 12 3z" />
      <Path d="M17.9 14.8a.5.5 0 0 1 .5.42c.28 1.86.82 2.4 2.68 2.68a.5.5 0 0 1 0 .99c-1.86.28-2.4.82-2.68 2.68a.5.5 0 0 1-.99 0c-.28-1.86-.82-2.4-2.68-2.68a.5.5 0 0 1 0-.99c1.86-.28 2.4-.82 2.68-2.68a.5.5 0 0 1 .49-.42z" />
    </>
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

export type TabName = 'home' | 'dex' | 'stats' | 'profile';

/**
 * Bottom-nav icon. Outline at rest, solid when active — the iOS
 * convention, and it reads as a state change without relying on color.
 */
export const TabIcon = React.memo(function TabIcon({
  name,
  focused,
  size = 25,
}: {
  name: TabName;
  focused: boolean;
  size?: number;
}) {
  return (
    <Icon
      name={name}
      size={size}
      filled={focused}
      color={focused ? colors.wine : colors.textFaint}
    />
  );
});
