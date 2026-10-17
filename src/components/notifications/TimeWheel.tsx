/* ==================================================================== */
/* The time wheel, everywhere but iOS                                   */
/*                                                                      */
/* iOS draws its own wheel (TimeWheel.ios.tsx, SwiftUI through          */
/* @expo/ui). Android and the web have no SwiftUI, and @expo/ui's       */
/* swift-ui entry asks for its native views as it is imported, which    */
/* throws there, so this file stands in: no wheel, and TimeSheet shows  */
/* its list of half hours instead (spec §3.3's fallback).               */
/* ==================================================================== */

export interface TimeWheelProps {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
}

/** Whether this platform draws the wheel. */
export const HAS_WHEEL = false;

export function TimeWheel(_props: TimeWheelProps) {
  return null;
}
