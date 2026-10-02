import * as WebBrowser from 'expo-web-browser';
import { type StyleProp, StyleSheet, Text, type TextStyle, type ViewStyle } from 'react-native';

import { Notice, useAnnounce } from '@/components/ui';
import { colors, fonts, space, type as typeScale } from '@/constants/theme';

/* ==================================================================== */
/* The sign-in screens' small print                                     */
/*                                                                      */
/* Two pieces every auth surface shares: the age and terms sentence,    */
/* and the box a message from the auth store is drawn in. Both moved    */
/* here out of AuthGate. This file imports nothing from the sign-in     */
/* screens, so every step, AuthGate and PasswordResetOverlay can import */
/* them without a require cycle: AuthGate renders the steps, and a step */
/* that imported its message box back from AuthGate would close a loop  */
/* Metro warns about on every launch. AuthGate still exports            */
/* AuthMessage, so PasswordResetOverlay's import is unchanged.          */
/* ==================================================================== */

/*
 * The published documents. Extensionless on purpose — GitHub Pages serves
 * `terms.html` for `/terms`, and these are the exact strings recorded in
 * `docs/appstore.md` as the App Store Connect URLs, so the app and the
 * listing point at one thing rather than two spellings of it.
 */
export const TERMS_URL = 'https://janmcq1617.github.io/drinkdex/terms';
export const PRIVACY_URL = 'https://janmcq1617.github.io/drinkdex/privacy';

/**
 * The age and terms statement, said where an account is taken up: at the
 * foot of the sign-in screen's first step, and under Continue on the
 * username step, which every new account passes through (phone, email,
 * Apple, Google or Facebook). terms.md opens "By creating an account you
 * agree to these terms", and its first eligibility rule is being 18 or
 * older and of legal drinking age where you live.
 *
 * "By continuing" is true on the first step because it covers both
 * cases: continuing there either makes an account or carries on with one,
 * under the same terms. It is not repeated on the later steps (the email
 * sign-up password step included), so it never shows twice on one screen.
 *
 * A sentence rather than a checkbox: the terms are agreed to the same way,
 * and a required tick in front of every signup is a step, where this is a
 * statement the button then acts on.
 *
 * Nested <Text onPress> rather than two Pressables: this has to read and
 * wrap as one sentence, and a Pressable in the middle of a paragraph
 * breaks the line around itself.
 */
export function Consent({ lead, style }: { lead: string; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[styles.consent, style]}>
      {lead} you confirm you are 18 or older and of legal drinking age where you live, and agree
      to the{' '}
      <Text
        style={styles.consentLink}
        accessibilityRole="link"
        onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)}>
        Terms of Use
      </Text>{' '}
      and the{' '}
      <Text
        style={styles.consentLink}
        accessibilityRole="link"
        onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)}>
        Privacy Policy
      </Text>
      .
    </Text>
  );
}

/**
 * The error or notice box every auth surface shows near its button: a
 * refused password, "check your email", a provider that did not sign the
 * person in, "New code sent.". One auth surface, drawn one way (the app's
 * Notice) and announced one way.
 *
 * Notice already speaks an error. A notice is news as well ("check your
 * email, then sign in" is the next thing the person has to do), so it is
 * announced here too; useAnnounce speaks it on iOS, where the live region
 * that serves Android does nothing, and its de-duplication keeps two
 * mounted gates from saying it twice.
 */
export function AuthMessage({
  tone,
  children,
  style,
}: {
  tone: 'error' | 'notice';
  children: string;
  style?: StyleProp<ViewStyle>;
}) {
  useAnnounce(tone === 'notice' ? children : null);
  return (
    <Notice tone={tone === 'error' ? 'error' : 'success'} style={style}>
      {children}
    </Notice>
  );
}

const styles = StyleSheet.create({
  consent: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: space.xl,
    /* Keeps the sentence off the screen edges when it wraps to three lines
       on a small handset. */
    paddingHorizontal: space.sm,
  },
  /* Wine words, not a wine object: the screen's links are all this colour,
     so "this is tappable" reads the same everywhere on it. */
  consentLink: { fontFamily: fonts.bodySemiBold, color: colors.wine },
});
