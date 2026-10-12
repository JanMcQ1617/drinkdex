import { StyleSheet, View } from 'react-native';

import { Hold } from '@/components/ui';
import { colors } from '@/constants/theme';

/**
 * The gate's Hold, on the page. A leaf of its own so AuthGate and the
 * sign-in screen can both draw it without importing each other.
 */
export function AuthHold({ slowMessage }: { slowMessage: string }) {
  return (
    <View style={styles.screen}>
      <Hold slowMessage={slowMessage} fill={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', backgroundColor: colors.bg },
});
