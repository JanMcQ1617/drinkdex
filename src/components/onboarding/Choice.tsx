import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Icon } from '@/components/icons';
import { colors, radius, space, textRole } from '@/constants/theme';

import { BOX, BOX_INSET, BOX_INSET_TILE, BOX_TO_LABEL } from './metrics';
import { FadeOut, T, useFadingPrevious } from './motion';

/* ==================================================================== */
/* One answer key, the four shapes' shared body                         */
/*                                                                      */
/* OptionRow, OptionTile, CheckRow and CheckTile are this, sized. A key */
/* is its fill, not an edge (spec 3.1): unpicked wash with an ink label */
/* (18.16:1), picked ink with an onInk label in 500 (19.80:1), so a     */
/* pick is said by fill AND weight, never by colour alone. A checkbox   */
/* is 22pt, page-filled with a 1.5pt control edge (3.17:1 on wash),      */
/* and once ticked an ink check on page inside the ink key.             */
/*                                                                      */
/* The pick (m4, m9): 300ms, no scale, no movement. The new look is      */
/* drawn at once in plain styles and the old one laid over it, faded out */
/* and unmounted by a JS timer (motion.tsx), so a stalled worklet never  */
/* leaves a pick that does not turn ink or a tick without its check.    */
/* ==================================================================== */

export type ChoiceShape = 'row' | 'tile';

function Look({
  label,
  on,
  pressed,
  box,
  shape,
  centred,
}: {
  label: string;
  on: boolean;
  pressed: boolean;
  box: boolean;
  shape: ChoiceShape;
  centred: boolean;
}) {
  const fill = on ? (pressed ? colors.inkPressed : colors.text) : pressed ? colors.press : colors.bgSunk;
  const lead = box ? (shape === 'tile' ? BOX_INSET_TILE : BOX_INSET) : 0;
  return (
    <>
      <View style={[StyleSheet.absoluteFill, styles.fill, { backgroundColor: fill }]} />
      <View
        style={[
          styles.content,
          centred ? styles.centred : null,
          box ? { paddingLeft: lead } : null,
        ]}>
        {box ? (
          <View style={[styles.box, !on && styles.boxEmpty]}>
            {on ? <Icon name="check" size={BOX - 2} color={colors.text} /> : null}
          </View>
        ) : null}
        <Text
          style={[
            on ? textRole.bodyMedium : textRole.body,
            styles.label,
            centred && styles.labelCentred,
            box && { marginLeft: shape === 'tile' ? BOX_TO_LABEL - 2 : BOX_TO_LABEL },
            { color: on ? colors.onInk : colors.text },
          ]}>
          {label}
        </Text>
      </View>
    </>
  );
}

export function ChoiceKey({
  label,
  selected,
  onPress,
  role,
  box,
  shape,
  minHeight,
  width,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Single choice is a radio, multi a checkbox (spec 10). */
  role: 'radio' | 'checkbox';
  /** Draw the 22pt checkbox at the left. */
  box: boolean;
  shape: ChoiceShape;
  minHeight: number;
  width?: number;
}) {
  const reduce = useReducedMotion();
  const old = useFadingPrevious(selected, reduce ? 0 : T.pick + T.settle);
  const centred = !box;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={role === 'radio' ? { selected } : { checked: selected }}
      style={[styles.key, { minHeight }, width !== undefined ? { width } : styles.stretch]}>
      {({ pressed }) => (
        <>
          <Look label={label} on={selected} pressed={pressed} box={box} shape={shape} centred={centred} />
          {old !== undefined && !reduce ? (
            <FadeOut duration={T.pick} style={styles.overlay}>
              <Look label={label} on={old} pressed={false} box={box} shape={shape} centred={centred} />
            </FadeOut>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  key: { borderRadius: radius.control, overflow: 'hidden', justifyContent: 'center' },
  stretch: { alignSelf: 'stretch' },
  fill: { borderRadius: radius.control },
  overlay: { justifyContent: 'center' },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    paddingRight: space.lg,
  },
  centred: { justifyContent: 'center', paddingHorizontal: space.lg },
  label: { flexShrink: 1 },
  labelCentred: { textAlign: 'center' },
  box: {
    width: BOX,
    height: BOX,
    borderRadius: radius.badge,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxEmpty: { borderWidth: 1.5, borderColor: colors.lineControl },
});
