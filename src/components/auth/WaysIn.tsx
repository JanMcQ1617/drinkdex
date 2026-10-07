import { StyleSheet, Text, View } from 'react-native';

import { Consent } from '@/components/auth/Consent';
import { AuthStoreMessages, EmailStep } from '@/components/auth/EmailSteps';
import { useMethods } from '@/components/auth/methods';
import { ProviderCard } from '@/components/auth/ProviderButton';
import { colors, space, textRole } from '@/constants/theme';

/**
 * Every way in, then the age and terms line: the first step's body on
 * every gate, and Welcome back's "Use another way".
 *
 * With email the only way this build offers, the card is the address field
 * itself rather than one "Continue with email" button, a tap shorter.
 *
 * Its own file so the sign-in screen and Welcome back can both draw it:
 * EmailSteps imports ProviderButton, so the card cannot import EmailSteps
 * back without a require cycle.
 *
 * `lead` is a line above the rows ("Already on Sipply? The same buttons
 * sign you in.").
 */
export function WaysIn({ lead }: { lead?: string }) {
  const methods = useMethods();
  return (
    <View>
      {lead ? <Text style={styles.lead}>{lead}</Text> : null}
      {methods.emailOnly ? (
        <EmailStep focusOnShow={false} />
      ) : (
        <>
          <ProviderCard />
          {/* A dead reset link opened while signed out lands its message here (store/auth failRecovery). */}
          <AuthStoreMessages />
        </>
      )}
      <Consent lead="By continuing" />
    </View>
  );
}

const styles = StyleSheet.create({
  lead: {
    ...textRole.helper,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: space.lg,
  },
});
