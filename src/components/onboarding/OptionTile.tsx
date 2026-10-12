import React from 'react';

import { ChoiceKey } from './Choice';
import { ROW_H } from './metrics';

/**
 * A grid key with no box (the flavours' 174 x 64, spec 2), its label
 * centred. The flavours are a multi choice, so it is a checkbox to
 * VoiceOver there; `role` says which.
 */
export function OptionTile({
  label,
  selected,
  onPress,
  width,
  role = 'checkbox',
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  width: number;
  role?: 'radio' | 'checkbox';
}) {
  return (
    <ChoiceKey
      label={label}
      selected={selected}
      onPress={onPress}
      role={role}
      box={false}
      shape="tile"
      minHeight={ROW_H}
      width={width}
    />
  );
}
