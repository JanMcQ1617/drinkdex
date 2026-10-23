import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PRIVACY_URL, TERMS_URL } from '@/components/auth/Consent';
import { Wordmark, WORDMARK_LG } from '@/components/brand/Wordmark';
import { DockSlot, Rise } from '@/components/DockRise';
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
/* The wall of prints drifting in rows, the wordmark (the tagged one,   */
/* in Campari, since v4.5; brand/Wordmark), one line, the terms line,   */
/* and two keys: Get started (the flow's footer key, drawn 41 higher,   */
/* which slides home into the footer on the way in, m2) and I already   */
/* have an account, the wash key, which leaves for the existing sign-in */
/* with no questions asked.                                             */
/*                                                                      */
/* The terms' two links open as auth/Consent's do, in the in-app        */
/* browser, at the same published URLs.                                 */
/*                                                                      */
/* A COLD START CAN LAND HERE (v4.6, the Dock; specs/v4.6-details/      */
/* spec.md, B). The film's wordmark flies down into this one (a         */
/* DockSlot: it registers where it is drawn and stays hidden until the  */
/* flying one lands, 600 ms), the wall fades in once the wordmark is    */
/* clear of it (360 to 780 ms; no rise, its rows already drift), and    */
/* the line, the terms and both keys rise 10pt (420 to 880), late,      */
/* because they stand where the wordmark lands. Get started is the      */
/* flow's footer key, so it rises in OnboardingFlow. No pen mark here:  */
/* the detail system does not reach the onboarding. On the Dock's clock,*/
/* which rests at 1, so at rest every one of these is the identity.     */
/* ==================================================================== */

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
        <Rise group="wall" style={styles.wall}>
          <WelcomeWall style={styles.wallFill} />
        </Rise>
        <DockSlot id="welcome">
          <Wordmark height={WORDMARK_LG} header />
        </DockSlot>
        <Rise group="body" style={styles.words}>
          <Text maxFontSizeMultiplier={TEXT_CAP} style={styles.strap}>A field guide to cocktails and spirits.</Text>
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
        </Rise>
      </View>
      <Rise group="body" pointerEvents="box-none" style={StyleSheet.absoluteFill}>
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
      </Rise>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1, alignItems: 'center' },
  /* The wall's frame, now its fade's wrapper: what is left above the wordmark, the column's full width. */
  wall: { flex: 1, marginBottom: WALL_TO_WORDMARK, alignSelf: 'stretch' },
  wallFill: { flex: 1 },
  /* The line and the terms, as one group: the column's width, each centred in it as before. */
  words: { alignSelf: 'stretch', alignItems: 'center' },
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
