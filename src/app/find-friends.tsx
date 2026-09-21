import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FindFriends } from '@/components/FindFriends';
import { Icon } from '@/components/icons';
import { PressableScale } from '@/components/ui';
import { colors, fonts, space, type as typeScale } from '@/constants/theme';

/* ==================================================================== */
/* Find friends                                                         */
/*                                                                      */
/* A screen, not a settings row that expands.                           */
/*                                                                      */
/* FindFriends is four cards — contacts, Instagram, username search and  */
/* invites — each with a heading and a body paragraph. Expanded inside a */
/* settings group that is itself a card, it nested four bordered boxes   */
/* inside a fifth, and pushed "Sign out" a screen and a half down.       */
/* Instagram drills down for exactly this reason, and this is the one    */
/* row here with enough behind it to deserve it.                        */
/*                                                                      */
/* The same component is rendered full-width by WelcomeConnect at        */
/* signup, so the thing offered on day one and the thing reachable from  */
/* Settings are one implementation rather than two that drift.           */
/* ==================================================================== */

export default function FindFriendsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxxl },
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}>
        <PressableScale
          onPress={() => router.back()}
          noHaptic
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}>
          <Icon name="chevronLeft" size={22} color={colors.text} />
        </PressableScale>
        <Text style={styles.title}>Find friends</Text>
      </View>

      <FindFriends />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.xl },

  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingBottom: space.sm },
  back: { padding: space.xs },
  title: {
    fontFamily: fonts.display,
    fontSize: typeScale.headline.fontSize,
    lineHeight: typeScale.headline.lineHeight,
    color: colors.text,
  },
});
