import { StyleSheet, Text } from 'react-native';

import { CabinetSheet } from '@/components/auth/CabinetBackdrop';
import { FindFriends } from '@/components/FindFriends';
import { Icon } from '@/components/icons';
import { ScreenTopBar } from '@/components/ScreenTopBar';
import { Button } from '@/components/ui';
import { colors, fonts, layout, space, type as typeScale } from '@/constants/theme';

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
/* at full scroll. log.tsx pins its save the same way. CabinetSheet      */
/* draws the footer and its clearance.                                   */
/*                                                                      */
/* ONE FRAME WITH SIGN-IN. The step is the paper sheet over the cabinet  */
/* (auth/CabinetBackdrop) with the compact backdrop, as the sign-in and  */
/* username steps just before it are, so the three read as one flow. The */
/* title is the sheet's bar, which sticks while the long list scrolls    */
/* and always draws its rule, the sheet's edge. The glyph under it is    */
/* drawn bare, with no disc behind it: an icon in a tinted circle is the */
/* most copied header there is.                                          */
/* ==================================================================== */

export function WelcomeConnect({ onDone }: { onDone: () => void }) {
  /*
   * Keyboard as on /find-friends: the same four fields live here. With a
   * footer, CabinetSheet meets the keyboard with the scroll view's insets
   * rather than a KeyboardAvoidingView, so the pinned footer stays put
   * instead of riding up on the keyboard.
   *
   * "Skip" would be the honest word for the footer, but it frames the
   * step as an obstacle. Every one of these controls is permanently in
   * Settings, so this really is just "later" — and the lede already says
   * so, which is why the footnote that repeated it is gone.
   */
  return (
    <CabinetSheet
      backdrop="compact"
      bar={<ScreenTopBar title="Find your people" size="md" showRule inset="sheet" />}
      footer={<Button label="Continue" onPress={onDone} block />}
      contentStyle={styles.content}>
      <Icon name="users" size={28} color={colors.text} />

      <Text style={styles.lede}>
        Sipply is better with the friends you already drink with. You can bring them
        over now, or do it later from Settings — nothing here is one-time.
      </Text>

      {/*
        FindFriends opens with <FacebookFriends />, so someone who has
        just signed in with Facebook sees their friends first, right
        under the lede. Not mounted here as well: it would draw twice.
      */}
      <FindFriends />
    </CabinetSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.gutter,
    paddingTop: space.xl,
    paddingBottom: space.xl,
  },

  lede: {
    fontFamily: fonts.body,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: colors.textMuted,
    marginTop: space.md,
    marginBottom: space.xl,
  },
});
