import React from 'react';

import { ChoiceKey } from './Choice';
import { ROW_H } from './metrics';

/**
 * A multi-choice row (Imprint 14, 15): 360 x 64, the 22pt box 18 in, its
 * label set left at 54. A checkbox to VoiceOver.
 */
export function CheckRow({
  label,
  checked,
  onPress,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
}) {
  return <ChoiceKey label={label} selected={checked} onPress={onPress} role="checkbox" box shape="row" minHeight={ROW_H} />;
}
