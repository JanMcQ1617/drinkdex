import { StyleSheet, View } from 'react-native';

import { Grain } from '@/components/Grain';
import { Hold } from '@/components/ui';
import { colors } from '@/constants/theme';

/**
 * The gate's Hold, on paper with its own grain: grain is no longer one
 * overlay over the app, so each ground mounts its own, under the content.
 * A leaf of its own so AuthGate and the sign-in screen can both draw it
 * without importing each other.
 */
export function AuthHold({ slowMessage }: { slowMessage: string }) {
  return (
    <View style={styles.screen}>
      <Grain />
      <Hold slowMessage={slowMessage} fill={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', backgroundColor: colors.bg },
});
