import { type Ref } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthTitleBar } from '@/components/auth/AuthTitleBar';
import { CabinetSheet } from '@/components/auth/CabinetBackdrop';
import { Consent } from '@/components/auth/Consent';
import { AuthStoreMessages } from '@/components/auth/EmailSteps';
import { useMethods } from '@/components/auth/methods';
import { ProviderButton, ProviderError, useWayIn } from '@/components/auth/ProviderButton';
import {
  forgetRememberedAccount,
  type RememberedAccount,
  type RememberedMethod,
} from '@/components/auth/rememberedAccount';
import { WaysIn } from '@/components/auth/WaysIn';
import { Avatar, Button } from '@/components/ui';
import { colors, fonts, layout, space, textRole } from '@/constants/theme';
import { useSignInFlow } from '@/store/signInFlow';

/* ==================================================================== */
/* Welcome back                                                         */
/*                                                                      */
/* The first step for a phone that has signed in before (the graft from */
/* specs/v3-2-mockups/signin-pour, frame 4): the remembered account's   */
/* face and name, ONE button for the way in it used last time, "Use     */
/* another way" for the full card, and "Not you? Forget this account"   */
/* for a shared phone. It takes the place of the full card on every    */
/* gate (the questions for someone new come before, in FirstRun).       */
/*                                                                      */
/* On the white sign-in page under the large wordmark, as the first     */
/* step for anyone new is: the person's face and name are the only      */
/* picture here.                                                        */
/*                                                                      */
/* When the remembered way in is no longer offered (its flag turned off, */
/* or Apple unavailable on this device), the card shows every way in    */
/* instead of a button that cannot work.                                */
/*                                                                      */
/* FACEBOOK IS THE EXCEPTION. With Continue with Facebook off (build 35 */
/* on, until Meta approves the app: specs/v4.9/meta-review.md), an      */
/* account made with it still has a way in that works, its email: the   */
/* sign-in address is the one Facebook gave. That address's lookup      */
/* answers "signs in another way", whose step offers a password by      */
/* email, and the reset link signs the person in to choose one. So the  */
/* one button is Continue with email, under a line that says so, rather */
/* than the full card under "Last time you signed in with Facebook".    */
/* ==================================================================== */

const LAST_TIME: Record<RememberedMethod, string> = {
  apple: 'Last time you signed in with Apple.',
  google: 'Last time you signed in with Google.',
  facebook: 'Last time you signed in with Facebook.',
  phone: 'Last time you signed in with your phone number.',
  email: 'Last time you signed in with your email.',
};

/** Under the name, for an account made with Facebook while Continue with Facebook is off. */
const FACEBOOK_OFF =
  'Facebook sign-in is not available right now. Continue with the email address your Facebook account uses, and Sipply can email you a link to set a password.';

/** "Not you? Forget this account": the remembered record goes, and the screen becomes the first-run one. */
function ForgetAccount() {
  const go = useSignInFlow((s) => s.go);
  const forget = () => {
    forgetRememberedAccount();
    // The first step again, now the ways in on every gate, with Welcome back's messages cleared.
    go('entry');
  };
  return (
    <Pressable
      onPress={forget}
      accessibilityRole="button"
      accessibilityLabel="Forget this account"
      accessibilityHint="Not you? Takes this account off this phone's sign-in screen"
      hitSlop={{ top: 8, bottom: 8 }}
      style={({ pressed }) => [styles.forget, pressed && styles.pressed]}>
      <Text style={styles.forgetText}>
        Not you? <Text style={styles.forgetLink}>Forget this account</Text>
      </Text>
    </Pressable>
  );
}

export function WelcomeBack({
  account,
  onClose,
  titleRef,
}: {
  account: RememberedAccount;
  onClose: () => void;
  titleRef: Ref<Text>;
}) {
  const methods = useMethods();
  const way = useWayIn();
  const continueRemembered = useSignInFlow((s) => s.continueRemembered);
  const chooseAnotherWay = useSignInFlow((s) => s.chooseAnotherWay);

  const method = account.method;
  const offered =
    method === 'email' ||
    (method === 'apple' && methods.apple) ||
    (method === 'google' && methods.google) ||
    (method === 'facebook' && methods.facebook) ||
    (method === 'phone' && methods.phone);
  // See FACEBOOK IS THE EXCEPTION in the header.
  const facebookOff = method === 'facebook' && !methods.facebook;
  const primary = offered ? method : facebookOff ? 'email' : null;
  const lastTime = method ? LAST_TIME[method] : null;

  return (
    <CabinetSheet
      backdrop="full"
      bar={
        <AuthTitleBar
          title="Welcome back"
          leading="close"
          onLeading={onClose}
          titleRef={titleRef}
          insetTop={false}
        />
      }
      contentStyle={styles.body}>
      <View
        accessible
        accessibilityLabel={lastTime ? `${account.name}. ${lastTime}` : account.name}
        style={styles.who}>
        <Avatar name={account.name} accent={account.accent} avatarPath={account.avatarPath} size={52} />
        <View style={styles.whoText}>
          <Text style={[textRole.bodyStrong, styles.name]}>{account.name}</Text>
          {lastTime ? <Text style={[textRole.small, styles.lastTime]}>{lastTime}</Text> : null}
        </View>
      </View>

      {primary ? (
        <>
          {facebookOff ? <Text style={styles.note}>{FACEBOOK_OFF}</Text> : null}
          <View style={styles.stack}>
            <ProviderButton
              method={primary}
              busy={way.busy(primary)}
              inert={way.working}
              onPress={() => continueRemembered(primary)}
            />
            <Button label="Use another way" variant="secondary" block onPress={chooseAnotherWay} />
            <ProviderError />
          </View>
          <AuthStoreMessages />
          <ForgetAccount />
          <Consent lead="By continuing" />
        </>
      ) : (
        <>
          <WaysIn />
          <ForgetAccount />
        </>
      )}
    </CabinetSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.gutter, paddingTop: space.xl },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xl },
  whoText: { flex: 1 },
  name: { color: colors.text },
  lastTime: { color: colors.textMuted, marginTop: 2 },
  // The email steps' lede (auth/EmailSteps), so the line reads as the same voice.
  note: { ...textRole.body, color: colors.textMuted, marginBottom: space.lg },
  stack: { gap: space.sm },
  forget: { alignSelf: 'center', marginTop: space.lg, paddingVertical: space.xs },
  pressed: { opacity: 0.5 },
  forgetText: { ...textRole.small, color: colors.textMuted, textAlign: 'center' },
  forgetLink: { fontFamily: fonts.bodySemiBold, color: colors.text },
});
