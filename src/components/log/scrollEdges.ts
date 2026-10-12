import { type ReactNode, useRef, useState } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/* ==================================================================== */
/* A scroll view's two edges, for the rules of the bars on them         */
/*                                                                      */
/* Daylight draws no dividers (layout spec 1): a 1pt rule appears under */
/* a bar only once content has scrolled under it, and over a pinned     */
/* foot (Post, Continue, Invite, a form's save bar) only while there is */
/* content under it. A rule at the end of a page, with nothing below    */
/* it, would be a divider.                                              */
/*                                                                      */
/* One set of handlers answers both: `under` (the top bar's signal, as  */
/* ScreenTopBar's useScrolledPast) and `moreBelow` (the foot's, as the  */
/* drink page's useMoreBelow in DrinkPanels). The foot's is worked out  */
/* from the offset, the view's height and the content's, so a page too  */
/* short to scroll is answered on layout. State flips only when an      */
/* answer changes, never per frame.                                     */
/*                                                                      */
/* Built here for the + window's package; ScreenTopBar is the place for */
/* it, beside useScrolledPast, once the integration pass moves it.      */
/* ==================================================================== */

export interface ScrollEdges {
  /** Content has moved under the top bar. */
  under: boolean;
  /** Content runs on under the foot. */
  moreBelow: boolean;
  /** Pass with scrollEventThrottle={16}. */
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onLayout: (e: LayoutChangeEvent) => void;
  onContentSizeChange: (w: number, h: number) => void;
}

/**
 * `footInset`: the part of the content's end that is only padding for a
 * foot laid over the list (the taste picker's tray), so reaching it is the
 * end of the content.
 */
export function useScrollEdges(footInset = 0): ScrollEdges {
  const [under, setUnder] = useState(false);
  const [moreBelow, setMoreBelow] = useState(false);
  const m = useRef({ y: 0, view: 0, content: 0, under: false, more: false });

  const settle = () => {
    const s = m.current;
    const nextUnder = s.y >= 1;
    if (nextUnder !== s.under) {
      s.under = nextUnder;
      setUnder(nextUnder);
    }
    if (s.view <= 0 || s.content <= 0) return;
    const nextMore = s.y + s.view < s.content - footInset - 1;
    if (nextMore !== s.more) {
      s.more = nextMore;
      setMoreBelow(nextMore);
    }
  };

  return {
    under,
    moreBelow,
    onScroll: (e) => {
      m.current.y = e.nativeEvent.contentOffset.y;
      m.current.view = e.nativeEvent.layoutMeasurement.height;
      m.current.content = e.nativeEvent.contentSize.height;
      settle();
    },
    onLayout: (e) => {
      m.current.view = e.nativeEvent.layout.height;
      settle();
    },
    onContentSizeChange: (_w, h) => {
      m.current.content = h;
      settle();
    },
  };
}

/**
 * The edges as a render prop, for state that must start fresh with what
 * it measures: inside a Modal (whose content mounts on each opening, so
 * a sheet opened again at its top is not left ruled from the last visit),
 * or keyed per step (the + window's two steps).
 */
export function WithScrollEdges({ children }: { children: (edges: ScrollEdges) => ReactNode }) {
  return children(useScrollEdges());
}
