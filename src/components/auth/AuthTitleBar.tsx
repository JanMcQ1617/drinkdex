import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, type Ref, type RefObject } from 'react';
import { AccessibilityInfo, type Text, type TextInput } from 'react-native';

import { ScreenTopBar, TopBarButton } from '@/components/ScreenTopBar';

/* ==================================================================== */
/* The sign-in screen's title bar                                       */
/*                                                                      */
/* The app's one top bar (ScreenTopBar), set the way every sign-in step */
/* uses it: md, the rule always drawn (it is what tells the bar from    */
/* the form, and at the head of the sheet it is the sheet's edge, at    */
/* rest as much as scrolled), and at most one control, on the left:     */
/* close on the first step, back on the others, none on the username    */
/* step, which has nowhere to go back to.                               */
/*                                                                      */
/* Every caller passes insetTop={false}, because none has a status bar  */
/* to clear: the country picker is a native page sheet, and the sign-in */
/* and username steps put the bar at the head of the paper sheet over   */
/* the cabinet (auth/CabinetBackdrop's CabinetSheet), whose lining      */
/* clears the status bar above it. There the bar sticks while the form  */
/* scrolls.                                                             */
/* ==================================================================== */

export function AuthTitleBar({
  title,
  leading,
  onLeading,
  leadingLabel,
  insetTop = true,
  titleRef,
}: {
  title: string;
  leading: 'close' | 'back' | 'none';
  onLeading?: () => void;
  /** The spoken name of the leading control: "Close" and "Back" by default. */
  leadingLabel?: string;
  /** False inside a sheet: an iOS page sheet, or CabinetSheet, which clears the status bar itself. */
  insetTop?: boolean;
  /** So the screen can move VoiceOver to the title on each step (useStepTitleFocus). */
  titleRef?: Ref<Text>;
}) {
  const left =
    leading === 'none' || !onLeading ? undefined : (
      <TopBarButton
        icon={leading === 'close' ? 'close' : 'chevronLeft'}
        label={leadingLabel ?? (leading === 'close' ? 'Close' : 'Back')}
        accessibilityHint={leading === 'close' ? 'Leaves sign-in without an account' : undefined}
        onPress={onLeading}
      />
    );
  return (
    <ScreenTopBar
      title={title}
      size="md"
      showRule
      inset={insetTop ? 'safe' : 'sheet'}
      titleRef={titleRef}
      left={left}
    />
  );
}

/** After this, VoiceOver focus moves; the same pause PasswordResetOverlay waits. */
const TITLE_FOCUS_DELAY_MS = 300;

/**
 * Moves VoiceOver to the title whenever `step` changes, so a step that
 * swaps the whole form under the person's finger says where they are now
 * instead of leaving focus on a control that no longer exists.
 *
 * Only in the focused scene. Home and Profile can both have the sign-in
 * screen mounted (each tab has its own gate), and both swap steps
 * together because the flow is shared: the hidden one must not pull
 * VoiceOver into a tab that is not on screen.
 */
export function useStepTitleFocus(titleRef: RefObject<Text | null>, step: string) {
  const navigation = useNavigation();
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!navigation.isFocused() || !titleRef.current) return;
      AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus');
    }, TITLE_FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [navigation, titleRef, step]);
}

/** Long enough for the step (or the tab) to be on screen before the keyboard rises. */
const INPUT_FOCUS_DELAY_MS = 250;

/**
 * Puts the cursor in a step's input when that step appears, and again
 * whenever its scene comes back into focus (a tab switch mid-code).
 *
 * In place of autoFocus, which no field on the sign-in screen uses: Home
 * and Profile can both have the screen mounted, and an autoFocus in the
 * hidden one would raise the keyboard over a tab that is not on screen.
 * useFocusEffect runs only while the scene is focused, and the check
 * after the pause catches a switch away during it.
 *
 * Each step is its own component, remounted on every step change (the
 * screen keys its body on the step), so mounting is the step change.
 * `enabled` false skips it: the entry step raises no keyboard over the
 * ways in, and a locked code step has nothing to type into.
 */
export function useInputFocusOnShow(inputRef: RefObject<TextInput | null>, enabled = true) {
  const navigation = useNavigation();
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      const timer = setTimeout(() => {
        if (navigation.isFocused()) inputRef.current?.focus();
      }, INPUT_FOCUS_DELAY_MS);
      return () => clearTimeout(timer);
    }, [enabled, navigation, inputRef]),
  );
}
