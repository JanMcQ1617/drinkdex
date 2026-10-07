import { SymbolView } from 'expo-symbols';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';

import { AuthMessage } from '@/components/auth/Consent';
import { type Methods, useMethods } from '@/components/auth/methods';
import type { RememberedMethod } from '@/components/auth/rememberedAccount';
import { GoogleMark, Icon } from '@/components/icons';
import { colors, layout, radius, space, stroke, textRole } from '@/constants/theme';
import { textWidth } from '@/lib/textFit';
import { useAuth } from '@/store/auth';
import { type Method, useSignInFlow } from '@/store/signInFlow';

/* ==================================================================== */
/* The ways in                                                          */
/*                                                                      */
/* ONE CARD, EVERY WAY IN ON ITS FIRST FRAME. Apple, Google and         */
/* Facebook full width, in that order, then phone and email side by     */
/* side as one row of two half-width buttons, then the age and terms    */
/* line. Two half rows instead of two full ones keep the consent above  */
/* the floating tab bar on a 6.1-inch phone. At a text size where       */
/* "Phone number" would wrap in half a row, the pair stacks instead.    */
/* Any subset holds: a flag that is off drops its button (auth/methods),*/
/* the pair becomes one full email row without phone, and with nothing  */
/* but email the card is the address field itself.                      */
/*                                                                      */
/* EACH PROVIDER'S OWN BUTTON RULES. Apple first, in Apple's black      */
/* style: black fill, white apple.logo (the system's SF Symbol, drawn    */
/* by iOS, not redrawn here), its title in the system font, the same    */
/* size as the rows under it, as the HIG asks of a custom Sign in with   */
/* Apple button. Google in its light theme: white, the #747775 stroke,   */
/* #1F1F1F ink and the four-colour G. Facebook on the same white with   */
/* Meta's blue f. Phone and email share that outline, so the stack is   */
/* one family. The words are the providers' sanctioned phrasings.       */
/*                                                                      */
/* A full-width row pins its mark 16pt from the left and centres the    */
/* label across the row, so a stack puts every mark in one column and   */
/* every label on one axis. A half-width row sets mark and label        */
/* together, centred.                                                   */
/*                                                                      */
/* Press feedback only (a fill, or a dim on Apple's black): nothing     */
/* here animates.                                                       */
/* ==================================================================== */

const MARK = 20;
/** A half-width button's side padding (styles.half). */
const HALF_PAD = space.sm;

type Skin = { bg: string; pressedBg?: string; edge: string; ink: string; label: TextStyle };

/*
 * Apple's title is the system font (fontFamily left unset), as the HIG asks
 * of a Sign in with Apple button; every other row is Inter.
 */
const APPLE_LABEL: TextStyle = { fontSize: 17, lineHeight: 22, fontWeight: '600' };

const OUTLINE: Skin = {
  bg: colors.surface,
  pressedBg: colors.bgSunk,
  edge: colors.providerEdge,
  ink: colors.providerInk,
  label: textRole.button,
};

const SKIN: Record<RememberedMethod, Skin> = {
  apple: {
    bg: colors.appleFill,
    edge: colors.appleFill,
    ink: colors.surface,
    label: APPLE_LABEL,
  },
  google: OUTLINE,
  facebook: OUTLINE,
  phone: OUTLINE,
  email: OUTLINE,
};

const LABEL: Record<RememberedMethod, string> = {
  apple: 'Continue with Apple',
  google: 'Continue with Google',
  facebook: 'Continue with Facebook',
  phone: 'Continue with phone number',
  email: 'Continue with email',
};

/** The half-width pair's shorter words; the spoken name stays LABEL's. */
const SHORT: Partial<Record<RememberedMethod, string>> = { phone: 'Phone number', email: 'Email' };

/** Each way in's mark, in a 20pt box. */
function Mark({ method }: { method: RememberedMethod }) {
  switch (method) {
    case 'apple':
      return (
        <SymbolView
          name="apple.logo"
          size={MARK}
          tintColor={colors.surface}
          type="monochrome"
          style={styles.mark}
        />
      );
    case 'google':
      return <GoogleMark size={MARK} />;
    case 'facebook':
      // Meta's mark: on white, the "f" shows the button's own white through it.
      return <Icon name="facebook" filled size={MARK} color={colors.facebook} />;
    case 'phone':
      return <Icon name="phone" size={MARK} color={colors.providerInk} />;
    case 'email':
      return <Icon name="mail" size={MARK} color={colors.providerInk} />;
  }
}

function noop() {}

/**
 * One way in.
 *
 * `busy`: this row's request is out. Its mark becomes a spinner, the label
 * stays, and the row reads as busy.
 *
 * `inert`: some other request is out. The row stops taking presses but
 * keeps FULL strength, so it is a no-op press and a disabled state for
 * VoiceOver rather than a fade, which would read as "your tap didn't land"
 * on the row that was not even tapped.
 *
 * `half`: one of the side-by-side pair, with its shorter words.
 */
export function ProviderButton({
  method,
  onPress,
  busy,
  inert,
  half,
  style,
}: {
  method: RememberedMethod;
  onPress: () => void;
  busy: boolean;
  inert: boolean;
  half?: boolean;
  style?: ViewStyle;
}) {
  const skin = SKIN[method];
  const still = inert && !busy;
  const pressable = !busy && !still;
  const label = half ? (SHORT[method] ?? LABEL[method]) : LABEL[method];
  const mark = <View style={styles.mark}>{busy ? <ActivityIndicator size="small" color={skin.ink} /> : <Mark method={method} />}</View>;

  return (
    <Pressable
      onPress={pressable ? onPress : noop}
      accessibilityRole="button"
      accessibilityLabel={LABEL[method]}
      accessibilityState={{ disabled: still || busy, busy }}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: skin.bg, borderColor: skin.edge },
        pressed && pressable && (skin.pressedBg ? { backgroundColor: skin.pressedBg } : styles.dimmed),
        half && styles.half,
        style,
      ]}>
      {half ? (
        <View style={styles.group}>
          {mark}
          <Text style={[skin.label, styles.groupLabel, { color: skin.ink }]}>{label}</Text>
        </View>
      ) : (
        <>
          <View style={styles.pinned}>{mark}</View>
          <Text style={[skin.label, styles.label, { color: skin.ink }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** What a way in does when pressed, and whether its request is the one out. */
export function useWayIn() {
  const pending = useSignInFlow((s) => s.pending);
  const go = useSignInFlow((s) => s.go);
  const continueWith = useSignInFlow((s) => s.continueWith);
  const authBusy = useAuth((s) => s.busy);
  const working = pending !== null || authBusy;
  return {
    working,
    // Phone and email start no request of their own: 'phone' pending is the code being sent.
    busy: (method: RememberedMethod) =>
      method !== 'phone' && method !== 'email' && pending === (method as Method),
    press: (method: RememberedMethod) => {
      if (method === 'phone') go('phone');
      else if (method === 'email') go('email');
      else void continueWith(method);
    },
  };
}

/** The line that says why a provider did not sign the person in, directly under the rows. */
export function ProviderError() {
  const providerError = useSignInFlow((s) => s.providerError);
  return providerError ? <AuthMessage tone="error">{providerError}</AuthMessage> : null;
}

/**
 * textFit errs wide by about a seventh on "Phone number" in Inter SemiBold
 * (127pt worked out at 16pt, about 110 drawn), which alone would stack the
 * pair on every 375pt phone. Taken back here; were a phone ever to draw it
 * wider than this allows, the label wraps inside its half and the row grows.
 */
const PAIR_ESTIMATE = 0.9;

/**
 * Whether "Phone number" fits on one line in half the card at this text
 * size, worked out rather than measured, so the first frame is the final
 * one. The card is the window less the sheet's gutters; past this the two
 * stack.
 */
function pairFits(windowWidth: number, fontScale: number): boolean {
  const half = (windowWidth - 2 * layout.gutter - space.sm) / 2;
  const room = half - 2 * (stroke.edge + HALF_PAD) - MARK - space.sm;
  const words = textWidth(SHORT.phone ?? '', 'inter', textRole.button.fontSize * fontScale);
  return words * PAIR_ESTIMATE <= room;
}

function socialOf(methods: Methods): RememberedMethod[] {
  return [
    ...(methods.apple ? (['apple'] as const) : []),
    ...(methods.google ? (['google'] as const) : []),
    ...(methods.facebook ? (['facebook'] as const) : []),
  ];
}

/**
 * Full-width rows: Apple, Google and Facebook (each where offered), and
 * the phone row with `withPhone`. "Sign in another way" (an email whose
 * account was made some other way) lists these; the email is what brought
 * the person there, so it is not offered again.
 */
export function ProviderRows({ withPhone }: { withPhone: boolean }) {
  const methods = useMethods();
  const way = useWayIn();
  const rows = [...socialOf(methods), ...(withPhone && methods.phone ? (['phone'] as const) : [])];
  if (rows.length === 0) return null;
  return (
    <View style={styles.stack}>
      {rows.map((method) => (
        <ProviderButton
          key={method}
          method={method}
          busy={way.busy(method)}
          inert={way.working}
          onPress={() => way.press(method)}
        />
      ))}
      <ProviderError />
    </View>
  );
}

/**
 * The first step's card of buttons: every way in but the email field
 * itself (auth/WaysIn draws that when email is the only one).
 */
export function ProviderCard() {
  const methods = useMethods();
  const way = useWayIn();
  const { width, fontScale } = useWindowDimensions();

  const social = socialOf(methods);
  const pair = methods.phone && pairFits(width, fontScale);
  const button = (method: RememberedMethod, half?: boolean) => (
    <ProviderButton
      key={method}
      method={method}
      half={half}
      busy={way.busy(method)}
      inert={way.working}
      onPress={() => way.press(method)}
    />
  );

  return (
    <View style={styles.stack}>
      {social.map((method) => button(method))}
      {pair ? (
        <View style={styles.pair}>
          {button('phone', true)}
          {button('email', true)}
        </View>
      ) : (
        <>
          {methods.phone ? button('phone') : null}
          {button('email')}
        </>
      )}
      <ProviderError />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  pair: { flexDirection: 'row', gap: space.sm },
  row: {
    minHeight: layout.control,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
    borderRadius: radius.control,
    borderWidth: stroke.edge,
    alignSelf: 'stretch',
  },
  half: { flex: 1, flexBasis: 0, paddingHorizontal: HALF_PAD },
  // Apple's black has no lighter fill to press to; it dims, as iOS's own button does.
  dimmed: { opacity: 0.8 },
  mark: { width: MARK, height: MARK, alignItems: 'center', justifyContent: 'center' },
  pinned: { position: 'absolute', left: space.lg },
  /* Room for the pinned mark on both sides, so a long label never runs under it and stays centred. */
  label: { flexShrink: 1, textAlign: 'center', paddingHorizontal: MARK + space.md },
  group: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, flexShrink: 1 },
  groupLabel: { flexShrink: 1, textAlign: 'center' },
});
