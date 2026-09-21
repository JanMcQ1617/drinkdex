import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FindFriends } from '@/components/FindFriends';
import { Icon } from '@/components/icons';
import { Button, haptic } from '@/components/ui';
import { colors, fonts, radius, space, type as typeScale } from '@/constants/theme';

/* ==================================================================== */
/* Welcome — find your people                                           */
/*                                                                      */
/* Shown once, immediately after an account exists, before the app       */
/* proper. Every control on it also lives in Settings; this step only    */
/* decides WHEN it is offered, not whether it exists.                    */
/*                                                                      */
/* WHY IT CANNOT COME EARLIER THAN THIS. Matching needs an account:      */
/* the whole mechanism is "hash what you know, ask the server which      */
/* hashes it also holds, follow the answers". With no row of your own    */
/* there is nobody to follow from and nothing to attach a follow to. A   */
/* connect button on the sign-in screen would have to hold its result    */
/* until after signup anyway, so this is as early as it goes.            */
/*                                                                      */
/* WHY THERE IS NO "LOG IN WITH INSTAGRAM". There is no such API. Meta   */
/* returns follower COUNTS to third-party apps and never lists, and the  */
/* Basic Display API — the only one that ever covered personal accounts  */
/* — was switched off on 4 December 2024. The honest version is the      */
/* user's own data export, parsed on the device. See lib/instagram.ts.   */
/* Saying that plainly here is deliberate: a button labelled "Connect    */
/* Instagram" that then asks for a downloaded ZIP reads as a bait, and   */
/* the explanation costs two lines.                                      */
/* ==================================================================== */

export function WelcomeConnect({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();

  const finish = useCallback(() => {
    haptic.tap();
    onDone();
  }, [onDone]);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.xxl, paddingBottom: space.xxxl },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.mark}>
          <Icon name="users" size={26} color={colors.wine} />
        </View>

        <Text style={styles.title}>Find your people</Text>
        <Text style={styles.lede}>
          Sipply is better with the friends you already drink with. You can bring them
          over now, or do it later from Settings — nothing here is one-time.
        </Text>

        <FindFriends />

        {/*
          "Skip" would be the honest word, but it frames the step as an
          obstacle. Every one of these controls is permanently in Settings,
          so this really is just "later" — and saying so stops the step
          feeling like something you lose by declining.
        */}
        <Button label="Continue" onPress={finish} block style={styles.cta} />
        <Text style={styles.footnote}>
          You can add or remove any of this later in Settings.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.xl },

  mark: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.wineWash,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: typeScale.headline.fontSize,
    lineHeight: typeScale.headline.lineHeight,
    color: colors.text,
  },
  lede: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.textMuted,
    marginTop: space.sm,
    marginBottom: space.xl,
  },

  cta: { marginTop: space.xxl },
  footnote: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: space.md,
  },
});
