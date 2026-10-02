import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useInputFocusOnShow } from '@/components/auth/AuthTitleBar';
import { AuthMessage } from '@/components/auth/Consent';
import { Icon } from '@/components/icons';
import { Button, haptic, useAnnounce } from '@/components/ui';
import {
  colors,
  fonts,
  layout,
  radius,
  space,
  stroke,
  tabular,
  textRole,
  type as typeScale,
} from '@/constants/theme';
import { DIALS } from '@/data/countries';
import { displayPhone } from '@/lib/phone';
import { CODE_WRONG } from '@/store/auth';
import {
  MAX_WRONG_CODES,
  OTP_LENGTH,
  RESEND_SECONDS,
  resendWait,
  TOO_MANY_WRONG_CODES,
  useSignInFlow,
} from '@/store/signInFlow';

/* ==================================================================== */
/* The 6-digit code                                                     */
/*                                                                      */
/* ONE REAL INPUT, SIX DRAWN CELLS. A single TextInput lies over the    */
/* whole row, its text and caret invisible, and the cells draw what it  */
/* holds. iOS's "From Messages" suggestion, paste and VoiceOver all     */
/* need one real field; six inputs break all three. The cells are       */
/* hidden from VoiceOver, and the input speaks its digits one by one.   */
/*                                                                      */
/* The code, the countdown and the lock live in the sign-in flow store, */
/* so Home and Profile show the same digits and the same countdown, and */
/* switching tabs never restarts either. The countdown is worked out    */
/* from when the code was sent, on a one-second tick that runs only     */
/* while this scene is on screen.                                       */
/* ==================================================================== */

/** "0:42" for the resend countdown. */
function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Wall-clock seconds, refreshed once a second while the scene is focused. */
function useFocusedClock() {
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(
    useCallback(() => {
      const tick = () => setNow(Date.now());
      // At once on return, so a countdown that ran out while away is not shown for a second.
      const first = setTimeout(tick, 0);
      const timer = setInterval(tick, 1000);
      return () => {
        clearTimeout(first);
        clearInterval(timer);
      };
    }, []),
  );
  return now;
}

export function PhoneCodeStep() {
  const navigation = useNavigation();
  const sentTo = useSignInFlow((s) => s.sentTo);
  const sentAt = useSignInFlow((s) => s.sentAt);
  const code = useSignInFlow((s) => s.code);
  const wrongCodes = useSignInFlow((s) => s.wrongCodes);
  const resends = useSignInFlow((s) => s.resends);
  const pending = useSignInFlow((s) => s.pending);
  const error = useSignInFlow((s) => s.error);
  const notice = useSignInFlow((s) => s.notice);
  const setCode = useSignInFlow((s) => s.setCode);
  const submitCode = useSignInFlow((s) => s.submitCode);
  const resendCode = useSignInFlow((s) => s.resendCode);
  const back = useSignInFlow((s) => s.back);
  const go = useSignInFlow((s) => s.go);

  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const now = useFocusedClock();

  /*
   * Locked after MAX_WRONG_CODES (Twilio Verify's attempts per code) until
   * a new code is sent: Verify is off and the cells take no input.
   */
  const locked = wrongCodes >= MAX_WRONG_CODES;
  useInputFocusOnShow(inputRef, !locked);

  /*
   * A wrong code buzzes once, from the gate that is on screen: both gates
   * draw this step from the same store, and two buzzes for one code would
   * read as two failures.
   */
  const seenWrong = useRef(wrongCodes);
  useEffect(() => {
    if (wrongCodes > seenWrong.current && navigation.isFocused()) haptic.error();
    seenWrong.current = wrongCodes;
  }, [wrongCodes, navigation]);

  // Spoken: the line under the cells is not a FieldGroup, which would say it itself.
  useAnnounce(error);

  /*
   * Red cells say "this code", so only a wrong code (and the lock it leads
   * to) turns them red. No connection, or a failed resend, is said in the
   * same line but leaves the code alone.
   */
  const cellsInError = locked || error === CODE_WRONG || error === TOO_MANY_WRONG_CODES;
  // The cell the next digit goes into; with all six typed, the last.
  const nextCell = Math.min(code.length, OTP_LENGTH - 1);
  // The store's clock can be a moment behind a fresh send; never show more than the full wait.
  const wait = Math.min(RESEND_SECONDS, resendWait(sentAt, now));
  const verifying = pending === 'code';

  return (
    <View>
      <Text style={styles.lede}>
        Enter the 6-digit code we texted to {sentTo ? displayPhone(sentTo, DIALS) : 'your phone'}.{' '}
        <Text style={styles.ledeLink} accessibilityRole="link" onPress={back}>
          Change number
        </Text>
      </Text>

      <View style={styles.codeRow}>
        <View
          style={styles.cells}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          {Array.from({ length: OTP_LENGTH }, (_, i) => {
            const ring = cellsInError ? colors.danger : focused && i === nextCell ? colors.lineInk : null;
            return (
              <View key={i} style={styles.cell}>
                <Text style={styles.digit} maxFontSizeMultiplier={1.4}>
                  {code[i] ?? ''}
                </Text>
                {/* An overlay, as Field's focus ring is, so nothing shifts when it shows. */}
                {ring ? <View pointerEvents="none" style={[styles.cellRing, { borderColor: ring }]} /> : null}
              </View>
            );
          })}
        </View>
        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={setCode}
          editable={!locked}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          inputMode="numeric"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={OTP_LENGTH}
          caretHidden
          selectionColor="transparent"
          style={styles.codeInput}
          accessibilityLabel="Verification code, 6 digits"
          accessibilityValue={{ text: code.split('').join(' ') }}
          accessibilityHint={error ?? undefined}
        />
      </View>

      {error ? (
        <View style={styles.errorLine}>
          <Icon name="alert" size={14} color={colors.danger} />
          <Text style={[textRole.helper, styles.errorText]}>{error}</Text>
        </View>
      ) : null}

      {/*
        The sixth digit checks the code by itself. Verify stays for
        VoiceOver, and for a check that failed for want of a connection.
      */}
      <Button
        label={verifying ? 'Checking…' : 'Verify'}
        onPress={() => void submitCode()}
        disabled={code.length !== OTP_LENGTH || locked}
        loading={verifying}
        block
        style={styles.primary}
      />

      <View style={styles.resend}>
        {wait > 0 ? (
          <View style={styles.countdownBox}>
            <Text
              style={[styles.countdown, tabular]}
              accessibilityLabel={`Send a new code, available in ${wait} seconds`}>
              Send a new code in {clock(wait)}
            </Text>
          </View>
        ) : (
          <Button
            label="Send a new code"
            variant="text"
            size="sm"
            onPress={() => void resendCode()}
            loading={pending === 'resend'}
          />
        )}
        {/* Once one new code has not done it, another way in is worth offering. */}
        {resends > 0 ? (
          <Button label="Use email instead" variant="text" size="sm" onPress={() => go('email')} />
        ) : null}
      </View>

      {notice ? (
        <AuthMessage tone="notice" style={styles.notice}>
          {notice}
        </AuthMessage>
      ) : null}
    </View>
  );
}

/** Code cells are a fixed height so six fit one row; their digits are capped to stay inside. */
const CELL_HEIGHT = 56;

const styles = StyleSheet.create({
  lede: {
    fontFamily: fonts.body,
    fontSize: typeScale.bodySm.fontSize,
    lineHeight: typeScale.bodySm.lineHeight,
    color: colors.textMuted,
    marginBottom: space.lg,
  },
  ledeLink: { fontFamily: fonts.bodySemiBold, color: colors.wine },

  codeRow: { height: CELL_HEIGHT },
  cells: { flexDirection: 'row', gap: space.sm, height: CELL_HEIGHT },
  cell: {
    flex: 1,
    height: CELL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    borderWidth: stroke.edge,
    borderColor: colors.lineControl,
    backgroundColor: colors.surface,
  },
  /* 1pt outside, 1pt in: covers the edge, concentric with the cell's corner. */
  cellRing: {
    position: 'absolute',
    top: -stroke.edge,
    left: -stroke.edge,
    right: -stroke.edge,
    bottom: -stroke.edge,
    borderRadius: radius.control + stroke.edge,
    borderWidth: stroke.ring,
  },
  digit: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.title.fontSize,
    lineHeight: typeScale.title.lineHeight,
    color: colors.text,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  /* The real input: the whole row, drawing nothing of its own. */
  codeInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    color: 'transparent',
    fontSize: typeScale.body.fontSize,
  },

  errorLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: space.sm },
  errorText: { flex: 1, color: colors.danger },

  primary: { marginTop: space.xl },

  resend: { marginTop: space.lg, alignItems: 'center' },
  /* The link's own height (a small text button, 44 to the finger with its slop),
     held while it counts down, so nothing jumps when the line becomes the link. */
  countdownBox: { minHeight: layout.controlSm, justifyContent: 'center' },
  countdown: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    textAlign: 'center',
  },
  notice: { marginTop: space.md },
});
