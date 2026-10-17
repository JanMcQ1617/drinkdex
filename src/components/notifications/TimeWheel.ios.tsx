import { DatePicker, Host } from '@expo/ui/swift-ui';
import { datePickerStyle, labelsHidden } from '@expo/ui/swift-ui/modifiers';
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';

import type { TimeWheelProps } from './TimeWheel';

/* ==================================================================== */
/* The time wheel, iOS                                                  */
/*                                                                      */
/* iOS's own hour and minute wheel (spec §3.3, frame `time`): SwiftUI's */
/* DatePicker in its wheel style, hosted by @expo/ui. The system draws  */
/* it, so it reads the phone's 12- or 24-hour clock, speaks to          */
/* VoiceOver as an adjustable picker, and scrolls with the system's     */
/* feel; nothing here animates.                                         */
/*                                                                      */
/* Uncontrolled after it opens: the wheel starts at the saved time and  */
/* reports each change up, and is never driven back from JS, so a turn  */
/* of the wheel is never fought by a re-render mid-spin. TimeSheet      */
/* mounts it only while it is up, so each opening starts afresh.        */
/*                                                                      */
/* If @expo/ui ever misbehaves here, HAS_WHEEL false puts iOS on the    */
/* list of half hours, as Android has.                                  */
/* ==================================================================== */

export type { TimeWheelProps };

/** Whether this platform draws the wheel. */
export const HAS_WHEEL = true;

export function TimeWheel({ hour, minute, onChange }: TimeWheelProps) {
  // A fixed day: only the hour and the minute are read back.
  const [start] = useState(() => new Date(2000, 0, 1, hour, minute));
  return (
    <Host matchContents colorScheme="light" style={styles.host}>
      <DatePicker
        selection={start}
        displayedComponents={['hourAndMinute']}
        onDateChange={(d) => onChange(d.getHours(), d.getMinutes())}
        modifiers={[datePickerStyle('wheel'), labelsHidden()]}
      />
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { alignSelf: 'center' },
});
