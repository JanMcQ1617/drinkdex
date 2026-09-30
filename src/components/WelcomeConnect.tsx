import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FindFriends } from '@/components/FindFriends';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui';
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
/*                                                                      */
/* THE WAY OUT IS PINNED. Continue used to sit after the six cards of    */
/* FindFriends, about two screens down, so a skippable step arrived with */
/* its only exit off-screen and read as mandatory. It now sits in a      */
/* footer that is always in view, above the floating tab bar — AuthGate  */
/* renders this inside the Home and Profile tab scenes, and the bar      */
/* floats over their bottom edge, which is where the old button ended up */
/* at full scroll. log.tsx pins its save the same way.                   */
/* ==================================================================== */

export function WelcomeConnect({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      {/*
        Keyboard props as on /find-friends: the same four fields live here.
        Insets rather than a KeyboardAvoidingView, so the pinned footer
        stays put instead of riding up on the keyboard.
      */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.xxl, paddingBottom: space.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}>
        <View style={styles.mark}>
          <Icon name="users" size={26} color={colors.wine} />
        </View>

        <Text style={styles.title} accessibilityRole="header">Find your people</Text>
        <Text style={styles.lede}>
          Sipply is better with the friends you already drink with. You can bring them
          over now, or do it later from Settings — nothing here is one-time.
        </Text>

        <FindFriends />
      </ScrollView>

      {/*
        "Skip" would be the honest word, but it frames the step as an
        obstacle. Every one of these controls is permanently in Settings,
        so this really is just "later" — and the lede above already says
        so, which is why the footnote that repeated it is gone.

        Bottom padding is the tab-screen clearance plus the space.md every
        tab screen and the sign-in form add. Without it the button cleared
        a notchless phone's bar by 6pt, close enough to read as part of it.
      */}
      <View
        style={[styles.footer, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.md }]}>
        {/* No haptic of its own: Button's press already ticks. */}
        <Button label="Continue" onPress={onDone} block />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
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

  footer: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    backgroundColor: colors.bg,
  },
});
