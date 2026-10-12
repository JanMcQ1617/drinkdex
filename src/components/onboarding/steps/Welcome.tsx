import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PRIVACY_URL, TERMS_URL } from '@/components/auth/Consent';
import { colors, radius, space, textRole } from '@/constants/theme';

import {
  EDGE,
  KEY_H,
  SECONDARY_H,
  WALL_TO_WORDMARK,
  WELCOME_KEY_GAP,
  WELCOME_SHIFT,
  WELCOME_TEXT_FOOT,
  type Geometry,
} from '../metrics';
import { WelcomeWall } from '../WelcomeWall';

/* ==================================================================== */
/* The welcome (welcome.png; Imprint 01)                                */
/*                                                                      */
/* The wall of prints drifting in rows, the wordmark in Playfair, one   */
/* line, the terms line, and two keys: Get started (the flow's footer   */
/* key, drawn 41 higher, which slides home into the footer on the way   */
/* in, m2) and I already have an account, the wash key, which leaves    */
/* for the existing sign-in with no questions asked.                    */
/*                                                                      */
/* The terms' two links open as auth/Consent's do, in the in-app        */
/* browser, at the same published URLs.                                 */
/* ==================================================================== */

const WORDMARK_CAP = 1.2;
const LABEL_CAP = 1.3;
/*
 * The strapline and the terms line grow to 2x and no further: the wall
 * gives up its room for them, and past 2x they would run on under the two
 * keys on a small phone (an SE has 509pt above Get started). 2x keeps them
 * at twice their size, and every word on screen.
 */
const TEXT_CAP = 2;
/** The legal line's measure: x 60 to 380 at 440. */
const LEGAL_INSET = 60;

export function WelcomeStep({ geo, onHaveAccount }: { geo: Geometry; onHaveAccount: () => void }) {
  const primaryTop = geo.keyTop + WELCOME_SHIFT;
  const secondaryTop = primaryTop + KEY_H + WELCOME_KEY_GAP;

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[styles.column, { paddingBottom: geo.height - primaryTop + WELCOME_TEXT_FOOT }]}>
        <WelcomeWall style={styles.wall} />
        <Text maxFontSizeMultiplier={WORDMARK_CAP} accessibilityRole="header" style={styles.wordmark}>
          Sipply
        </Text>
        <Text maxFontSizeMultiplier={TEXT_CAP} style={styles.strap}>Find the drinks you’ll love.</Text>
        <Text maxFontSizeMultiplier={TEXT_CAP} style={styles.legal}>
          By continuing you agree to the{' '}
          <Text
            style={styles.link}
            accessibilityRole="link"
            onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)}>
            Terms of Use
          </Text>{' '}
          and{' '}
          <Text
            style={styles.link}
            accessibilityRole="link"
            onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)}>
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
      <Pressable
        onPress={onHaveAccount}
        accessibilityRole="button"
        accessibilityLabel="I already have an account"
        accessibilityHint="Signs in without the questions"
        style={({ pressed }) => [styles.secondary, { top: secondaryTop }, pressed && styles.secondaryPressed]}>
        <Text maxFontSizeMultiplier={LABEL_CAP} numberOfLines={1} style={styles.secondaryLabel}>
          I already have an account
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1, alignItems: 'center' },
  wall: { flex: 1, marginBottom: WALL_TO_WORDMARK },
  wordmark: { ...textRole.wordmarkLg, color: colors.text, textAlign: 'center' },
  strap: { ...textRole.body, color: colors.textMuted, textAlign: 'center', marginTop: 14 },
  legal: {
    ...textRole.small,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: space.lg,
    paddingHorizontal: LEGAL_INSET,
  },
  link: { textDecorationLine: 'underline' },
  secondary: {
    position: 'absolute',
    left: EDGE,
    right: EDGE,
    minHeight: SECONDARY_H,
    borderRadius: radius.control,
    backgroundColor: colors.bgSunk,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: EDGE,
  },
  secondaryPressed: { backgroundColor: colors.press },
  secondaryLabel: { ...textRole.bodyMedium, color: colors.text, textAlign: 'center' },
});
