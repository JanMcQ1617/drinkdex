import { StyleSheet, View } from 'react-native';

import { Hold } from '@/components/ui';
import { colors } from '@/constants/theme';
import { useHoldBareGround } from '@/lib/bareGround';

/**
 * The gate's Hold, on the page. A leaf of its own so AuthGate and the
 * sign-in screen can both draw it without importing each other.
 */
export function AuthHold({ slowMessage }: { slowMessage: string }) {
  // White, as the sign-in page is, so the tab bar under it is too (lib/bareGround).
  useHoldBareGround();
  return (
    <View style={styles.screen}>
      <Hold slowMessage={slowMessage} fill={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', backgroundColor: colors.bg },
});
