import { useEffect, useRef, useState } from 'react';
import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { announce, Button, haptic } from '@/components/ui';
import { colors, radius, space, stroke, textRole } from '@/constants/theme';
import { CODE_LENGTH, spokenCode } from '@/lib/tournamentCode';
import { copyJoinCode, shareJoinCode } from '@/lib/tournaments';

/* ==================================================================== */
/* A tournament's join code, drawn (v4.12, specs/v4.12/join-codes.md)    */
/*                                                                      */
/* SIX BOXES, ONE FIGURE EACH. The code is drawn as the phone code is   */
/* (auth/PhoneCodeStep): six squared wash boxes, each holding one       */
/* character in the figure role (heroFigure, Archivo 600 28/34,         */
/* tabular), so the code someone is sent and the boxes they type it     */
/* into are the same six. Archivo, never the marker or the poster: a    */
/* code must be read exactly (check-design rule 6), and its alphabet    */
/* already leaves out what could be misread. Capped at 1.3, as the      */
/* other heroFigure boxes are (GoalPicker, the calendar pages); the     */
/* phone code's digits, in title, take 1.4. Ink on the wash, no accent: */
/* a code is not one of the accent's seven places.                      */
/*                                                                      */
/* SILENT, SPOKEN WHOLE. The boxes say nothing to VoiceOver; whatever   */
/* holds them says the code one character at a time ("Join code, A B C  */
/* 2 3 4"), so it can be read out.                                      */
/*                                                                      */
/* COPY AND SHARE are two wash keys side by side (squared, the          */
/* secondary key). Copy turns to "Copied" with a tick for a moment and  */
/* says so; where the clipboard is not there (lib/tournaments'          */
/* copyJoinCode) it opens the share sheet, which has its own Copy.      */
/* Share sends the code and its link (lib/tournamentCode's              */
/* joinCodeMessage).                                                     */
/* ==================================================================== */

/** The box: the phone code's height, so six fit a row at any width the app runs at. */
const CELL_H = 56;
/** How long Copy says "Copied". A label's timer, not an animation. */
const COPIED_MS = 1600;

/**
 * The six boxes. `code` may be shorter while it is being typed (the rest
 * are empty boxes). `ringAt` rings one box in lineInk, the focus ring, as
 * the phone code's is (where the next character goes, while the field has
 * focus); `error` rings all six in ink too (a code that did not work: no
 * red in Daylight). Rings are overlays, as Field's are, so nothing moves
 * when one shows.
 */
export function CodeCells({
  code,
  ringAt = null,
  error = false,
  style,
}: {
  code: string;
  ringAt?: number | null;
  error?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[styles.cells, style]}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {Array.from({ length: CODE_LENGTH }, (_, i) => {
        const ring = error ? colors.text : ringAt === i ? colors.lineInk : null;
        return (
          <View key={i} style={styles.cell}>
            <Text style={styles.figure} maxFontSizeMultiplier={1.3} numberOfLines={1}>
              {code[i] ?? ''}
            </Text>
            {ring ? <View pointerEvents="none" style={[styles.ring, { borderColor: ring }]} /> : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * The code with its two keys: on a tournament's page for everyone in it
 * while it runs, and on the host sheet once it is made. `hosting` words
 * the shared message ("my" or "our" tournament).
 */
export function JoinCodeCard({
  code,
  name,
  hosting,
  style,
}: {
  code: string;
  name: string;
  hosting: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const share = () => shareJoinCode({ name, code, hosting });
  const copy = () => {
    if (!copyJoinCode(code)) {
      share();
      return;
    }
    haptic.success();
    announce('Code copied');
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <View style={[styles.card, style]}>
      <View accessible accessibilityLabel={`Join code, ${spokenCode(code)}`}>
        <CodeCells code={code} />
      </View>
      <View style={styles.keys}>
        <Button
          label={copied ? 'Copied' : 'Copy'}
          icon={copied ? 'check' : 'stack'}
          variant="secondary"
          onPress={copy}
          style={styles.key}
          accessibilityLabel="Copy the code"
        />
        <Button
          label="Share"
          icon="share"
          variant="secondary"
          onPress={share}
          style={styles.key}
          accessibilityLabel="Share the code"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  cells: { flexDirection: 'row', gap: space.sm, height: CELL_H },
  /* The kit's field: a wash box with no edge; the ring says focus and error. */
  cell: {
    flex: 1,
    height: CELL_H,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    backgroundColor: colors.bgSunk,
  },
  figure: { ...textRole.heroFigure, color: colors.text, textAlign: 'center' },
  /* 1pt outside the box, concentric with its corner, as Field's ring is. */
  ring: {
    position: 'absolute',
    top: -stroke.edge,
    left: -stroke.edge,
    right: -stroke.edge,
    bottom: -stroke.edge,
    borderRadius: radius.control + stroke.edge,
    borderWidth: stroke.ring,
  },
  /* Two keys, halves of the row; under the largest text a label wraps inside its key. */
  keys: { flexDirection: 'row', gap: space.md },
  key: { flex: 1 },
});
