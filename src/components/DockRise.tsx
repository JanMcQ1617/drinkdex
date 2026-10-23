import React, { type ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { type DockTargetId, useDockSlotStyle, useDockTarget, useRise } from '@/lib/introDock';
import type { RiseGroupName } from '@/lib/introDockPlan';

/* ==================================================================== */
/* The Dock's two wrappers (lib/introDock; specs/v4.6-details/spec.md B)*/
/*                                                                      */
/*   <Rise group>        a group of a screen that rises into place      */
/*                       under the docking wordmark. Transforms and     */
/*                       opacity on this one view, from the Dock's      */
/*                       clock; the identity whenever the clock rests,  */
/*                       which is always but for 0.9s after a cold      */
/*                       start's film.                                  */
/*   <DockSlot id>       a destination wordmark: registers where it is  */
/*                       drawn, so the film's wordmark can fly there,   */
/*                       and hides it until the flight lands.           */
/*                                                                      */
/* Plain views, no role, no label: VoiceOver reads straight through     */
/* them to what they hold, and the film's modal overlay keeps it off    */
/* the screen until the Dock is done anyway.                            */
/* ==================================================================== */

export function Rise({
  group,
  style,
  pointerEvents,
  children,
}: {
  group: RiseGroupName;
  style?: StyleProp<ViewStyle>;
  /** `box-none` on a full-screen wrapper whose child is placed absolutely (the tab bar, a pinned key). */
  pointerEvents?: 'box-none' | 'auto';
  children: ReactNode;
}) {
  const rise = useRise(group);
  return (
    <Animated.View pointerEvents={pointerEvents} style={[style, rise]}>
      {children}
    </Animated.View>
  );
}

/**
 * Two views, on purpose. The outer one takes the slot's style (its place
 * in the parent's layout) and the hand-off's opacity. The inner one hugs
 * the wordmark and is the one measured: it carries no animated style, so
 * a measure taken mid-flight reads where the wordmark rests. `lead`
 * passes through to the measure when the wordmark inside is set with
 * Wordmark's `lead` (lib/introDock, useDockTarget). `enabled` is false
 * while the slot is mounted but covered (a blurred tab, the first run
 * drawn over it): it is then no destination at all.
 */
export function DockSlot({
  id,
  lead = false,
  enabled = true,
  style,
  children,
}: {
  id: DockTargetId;
  lead?: boolean;
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { ref, onLayout } = useDockTarget(id, { lead, enabled });
  const slot = useDockSlotStyle(id);
  return (
    <Animated.View style={[style, slot]}>
      <View ref={ref} onLayout={onLayout} collapsable={false}>
        {children}
      </View>
    </Animated.View>
  );
}
