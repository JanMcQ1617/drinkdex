import React from 'react';

import { ChoiceKey } from './Choice';
import { ROW_H } from './metrics';

/**
 * A single-choice row (Imprint 04, 05, 06): 360 x 64 between the 40pt
 * margins, its label centred, a radio to VoiceOver. Grows with its text.
 */
export function OptionRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return <ChoiceKey label={label} selected={selected} onPress={onPress} role="radio" box={false} shape="row" minHeight={ROW_H} />;
}
