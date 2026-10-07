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
/* for a shared phone. It takes the place of the taste picker, which is */
/* a question for someone new, and of the full card on every gate.      */
/*                                                                      */
/* No big photograph: the backdrop's three mounts are the person's own   */
/* latest catches when this phone's Dex has any, each decoded at 90 x    */
/* 124pt (never wider than 220pt, so the 1024px photos stay sharp).      */
/*                                                                      */
/* When the remembered way in is no longer offered (its flag turned off, */
/* or Apple unavailable on this device), the card shows every way in    */
/* instead of a button that cannot work.                                */
/* ==================================================================== */

const LAST_TIME: Record<RememberedMethod, string> = {
  apple: 'Last time you signed in with Apple.',
  google: 'Last time you signed in with Google.',
  facebook: 'Last time you signed in with Facebook.',
  phone: 'Last time you signed in with your phone number.',
  email: 'Last time you signed in with your email.',
};

/** "Not you? Forget this account": the remembered record goes, and the screen becomes the first-run one. */
function ForgetAccount() {
  const backToTastes = useSignInFlow((s) => s.backToTastes);
  const forget = () => {
    forgetRememberedAccount();
    // Home's first-run step is the picker; every other gate draws it as the ways in.
    backToTastes();
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
  drinks,
  onClose,
  titleRef,
}: {
  account: RememberedAccount;
  /** The backdrop's three mounts. */
  drinks: readonly string[];
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
  const primary = offered ? method : null;
  const lastTime = method ? LAST_TIME[method] : null;

  return (
    <CabinetSheet
      backdrop="full"
      backdropDrinks={drinks}
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
          <Text style={[textRole.shelfTitle, styles.name]}>{account.name}</Text>
          {lastTime ? <Text style={[textRole.helper, styles.lastTime]}>{lastTime}</Text> : null}
        </View>
      </View>

      {primary ? (
        <>
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
  stack: { gap: space.sm },
  forget: { alignSelf: 'center', marginTop: space.lg, paddingVertical: space.xs },
  pressed: { opacity: 0.5 },
  forgetText: { ...textRole.helper, color: colors.textMuted, textAlign: 'center' },
  forgetLink: { fontFamily: fonts.bodySemiBold, color: colors.wine },
});
