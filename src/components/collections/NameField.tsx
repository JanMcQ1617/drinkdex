import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, layout, radius, space, tabular, textRole } from '@/constants/theme';
import { COLLECTION_NAME_MAX, nameLength } from '@/lib/collections';

/* ==================================================================== */
/* A collection's name (spec §4.4)                                      */
/*                                                                      */
/* One field, 56 tall on the wash, the placeholder "Collection name"    */
/* and a quiet "12 / 40" at its right, so the limit is said before it   */
/* is met. Focused, a 1.5pt ink edge, which is always laid out          */
/* (transparent at rest), so focus moves nothing. Characters are        */
/* counted as the server counts them (lib/collections nameLength), and  */
/* typing past 40 keeps the first 40.                                   */
/*                                                                      */
/* Not the app's Field: that one carries its label inside the box, and  */
/* this page has no label to carry, only the thing being named above.   */
/* VoiceOver hears "Collection name" as the field's label, what is      */
/* typed as its value, and the count with what return does as its hint. */
/* ==================================================================== */

/** The focus edge (spec: 1.5pt ink). */
const EDGE = 1.5;

export function NameField({
  value,
  onChangeText,
  onSubmit,
  autoFocus,
  returnKeyLabel,
}: {
  value: string;
  onChangeText: (v: string) => void;
  /** The keyboard's return key: Create, or Save on Rename. */
  onSubmit: () => void;
  autoFocus?: boolean;
  /** Spoken with the field: what return does. */
  returnKeyLabel: string;
}) {
  const [focused, setFocused] = useState(!!autoFocus);
  const n = nameLength(value);

  const change = (v: string) => {
    // One line, and at most the server's 40 characters.
    const flat = v.replace(/[\r\n]+/g, ' ');
    onChangeText(nameLength(flat) > COLLECTION_NAME_MAX ? [...flat].slice(0, COLLECTION_NAME_MAX).join('') : flat);
  };

  return (
    <View style={[styles.box, focused && styles.boxFocused]}>
      <TextInput
        value={value}
        onChangeText={change}
        onSubmitEditing={onSubmit}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        placeholder="Collection name"
        placeholderTextColor={colors.textMuted}
        returnKeyType="done"
        // Return creates; an empty name keeps the keyboard up rather than closing on nothing.
        submitBehavior="submit"
        autoCapitalize="sentences"
        autoCorrect
        maxFontSizeMultiplier={1.6}
        accessibilityLabel="Collection name"
        accessibilityHint={`${n} of ${COLLECTION_NAME_MAX} characters. Return to ${returnKeyLabel.toLowerCase()}.`}
        style={styles.input}
      />
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        maxFontSizeMultiplier={1.3}
        style={styles.count}>
        {`${n} / ${COLLECTION_NAME_MAX}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: layout.field,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.control,
    backgroundColor: colors.bgSunk,
    borderWidth: EDGE,
    borderColor: 'transparent',
  },
  boxFocused: { borderColor: colors.lineInk },
  input: {
    ...textRole.fieldValue,
    flex: 1,
    color: colors.text,
    paddingVertical: space.md,
  },
  count: { ...textRole.small, ...tabular, color: colors.textMuted },
});
