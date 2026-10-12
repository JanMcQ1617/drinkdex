import React from 'react';

import { ChoiceKey } from './Choice';
import { BAR_TILE_H } from './metrics';

/**
 * A bar tile (spec 2): 174 x 56, the box 16 in, its label at 50. A
 * checkbox to VoiceOver. Two lines when a bottle's name needs them
 * ("Sweet vermouth"), and the tile grows.
 */
export function CheckTile({
  label,
  checked,
  onPress,
  width,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
  width: number;
}) {
  return (
    <ChoiceKey
      label={label}
      selected={checked}
      onPress={onPress}
      role="checkbox"
      box
      shape="tile"
      minHeight={BAR_TILE_H}
      width={width}
    />
  );
}
