import { create } from 'zustand';

import { methodsNow } from '@/components/auth/methods';
import { noteSignInAttempt, type RememberedMethod } from '@/components/auth/rememberedAccount';
import { COUNTRY_BY_ISO, DIALS, countryForDial, deviceRegion } from '@/data/countries';
import { formatNational, matchDial, toE164, type Country } from '@/lib/phone';
import { TASTES_TO_START } from '@/lib/tastes';
import {
  CODE_WRONG,
  EMAIL_HAS_ACCOUNT,
  EMAIL_INVALID,
  PHONE_INVALID,
  WRONG_PASSWORD,
  useAuth,
} from '@/store/auth';
import { useCollection } from '@/store/collection';

/* ==================================================================== */
/* The sign-in flow                                                     */
/*                                                                      */
/* Which step the signed-out screen is on and what has been typed into  */
/* it, held once for the whole app. Home and Profile each mount the      */
/* sign-in screen through their own AuthGate, and both used to keep      */
/* their own form state, so switching tabs mid-sign-in showed a         */
/* different, empty form. Here both gates draw the same step, the same   */
/* digits and the same resend countdown.                                */
/*                                                                      */
/* MEMORY ONLY. Never persisted, so a cold start begins at the first     */
/* step, and nothing typed (a phone number, an email, a password) is     */
/* ever written to the device by this store.                            */
/*                                                                      */
/* ONE REQUEST AT A TIME. `pending` names the request that is out, and   */
/* every action that sends one returns at once while it is set. That    */
/* one guard covers a double tap, the keyboard's return key reaching a   */
/* disabled button, and the other mounted gate. The email password and   */
/* reset requests are the auth store's own and run on its `busy`, which  */
/* is what the screen shows for them; those two actions check it too.    */
/*                                                                      */
/* RESETS. The flow starts over whenever someone signs in (by any        */
/* method) and whenever the session ends (sign-out, account deletion, a  */
/* revoked token). It does that by watching the auth store, at the       */
/* bottom of this file, rather than being reset by it: the auth store    */
/* would otherwise import this module while this module imports the auth */
/* store, and Metro warns about that cycle on every launch. The Reels    */
/* store resets itself the same way (store/reels).                       */
/*                                                                      */
/* LATE ANSWERS. A request can outlive the step that sent it (Back while */
/* a code is being checked) or the whole flow (signed in some other way  */
/* meanwhile). Each action notes `generation` when it starts and drops   */
/* its answer if the flow has been reset since, so nothing lands on a    */
/* fresh flow. Messages are dropped once the step has moved too, so a    */
/* late "wrong code" never lands on the first step. What a code request  */
/* did to the number itself (a new code sent, an attempt used up) is     */
/* still recorded while that number is the live one: Change number and   */
/* straight back returns to that code, and its countdown and lock must   */
/* be the server's.                                                     */
/*                                                                      */
/* THE PICKS. 'tastes' is Home's first step, "What do you drink?"       */
/* (auth/TastePicker); every other gate draws it as 'entry', the card   */
/* of ways in. The drinks tapped there are held here, in memory, until  */
/* an account exists: they survive Back, a tab switch and every reset   */
/* below, and are put in the Dex exactly once, as the session arrives    */
/* (applyPicks, at the foot of this file), then cleared.                 */
/* ==================================================================== */

/**
 * 'tastes' the picker (Home only); 'entry' the card of ways in; 'phone' the
 * country and number; then the code, the email address, the password and
 * the reset request, as before.
 */
export type SignInStep = 'tastes' | 'entry' | 'phone' | 'code' | 'email' | 'password' | 'reset';

/**
 * What the email lookup said (store/auth lookupEmail, migration 016):
 * 'new' has no account, 'password' signs in with a password, 'other'
 * signs in with Apple, Google, Facebook or a phone number. 'unknown' is
 * the lookup declining to answer (metered, or the function missing), and
 * gets a password step that offers both sign-in and sign-up.
 */
export type EmailStatus = 'new' | 'password' | 'other' | 'unknown';

/** The request `pending` names. 'phone' sends the first code; 'resend' a later one; 'code' checks one. */
export type Method = 'phone' | 'code' | 'resend' | 'email' | 'apple' | 'google' | 'facebook';

export const OTP_LENGTH = 6;
/** Seconds before another code may be asked for: Supabase's per-number SMS interval. */
export const RESEND_SECONDS = 60;
/** Wrong codes before the code step locks until a new one is sent: Twilio Verify's attempts per code. */
export const MAX_WRONG_CODES = 5;
/** Mirrors GoTrue's default minimum, which the sign-up helper states. */
export const MIN_NEW_PASSWORD = 6;

export const TOO_MANY_WRONG_CODES = 'Too many wrong codes. Send a new one.';
export const NEW_CODE_SENT = 'New code sent.';
/** Appended to a wrong password when the lookup could not say whether the account exists. */
const IF_NEW = 'If you’re new, create an account instead.';

/** Mirrors sign_in_method's own check (016), so the server never refuses what this lets through. */
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+$/;
const EMAIL_MAX = 254;

/** Whether Continue can be pressed on an email step. Trimmed, one '@' with something either side, at most 254. */
export function looksLikeEmail(text: string): boolean {
  const email = text.trim();
  return email.length <= EMAIL_MAX && EMAIL_SHAPE.test(email);
}

/** The picker row for an ISO code; the US for anything the list does not have. */
export function countryOf(iso: string): Country {
  return COUNTRY_BY_ISO[iso] ?? COUNTRY_BY_ISO.US;
}

/** The E.164 number the phone field holds, or null. Continue is enabled exactly when this is non-null. */
export function enteredPhone(state: Pick<SignInFlowState, 'iso' | 'national'>): string | null {
  return toE164(countryOf(state.iso), state.national);
}

/**
 * Where the email address is typed: its own step, or the first step itself
 * when email is the only way in this build offers (auth/methods).
 */
export function emailStep(): SignInStep {
  return methodsNow().emailOnly ? 'entry' : 'email';
}

/** Seconds until another code may be asked for, 0 once it can. From the store's clock, so a tab switch never restarts it. */
export function resendWait(sentAt: number | null, now: number = Date.now()): number {
  if (sentAt === null) return 0;
  return Math.max(0, Math.ceil((sentAt + RESEND_SECONDS * 1000 - now) / 1000));
}

export interface SignInFlowState {
  step: SignInStep;
  /** ISO 3166-1 alpha-2 of the picker's country. Starts at the device's region, else the US. */
  iso: string;
  /** What is in the phone field, as formatNational shows it. */
  national: string;
  /** The E.164 number the live code went to. */
  sentTo: string | null;
  /** When it was sent, in ms; drives the resend countdown. */
  sentAt: number | null;
  /** Codes asked for again after the first. */
  resends: number;
  /** Wrong codes against the live one. */
  wrongCodes: number;
  /** 0 to 6 digits. */
  code: string;
  email: string;
  /** Cleared on every step change and by reset(). */
  password: string;
  emailStatus: EmailStatus | null;
  /** The request that is out, across every mounted gate. */
  pending: Method | null;
  /**
   * The step's own failure, shown in the helper slot under its field.
   * On the code step it is also the cells' error state.
   */
  error: string | null;
  /** Apple, Google or Facebook's failure, shown under the provider rows. */
  providerError: string | null;
  /** "New code sent.", under the resend line. */
  notice: string | null;
  /** The drinks picked on the 'tastes' step, in the order they were tapped. */
  picks: string[];
  /** Continue was pressed with enough picks: the card says "Join Sipply" over them. */
  joined: boolean;
  /** "Use another way" on Welcome back: the full card instead of the remembered method. */
  anotherWay: boolean;

  /** Adds a drink to the picks, or takes it back out. */
  togglePick: (drinkId: string) => void;
  /** The picker's Continue: on to the ways in, under the picks. Needs TASTES_TO_START. */
  continueTastes: () => void;
  /** The picker's "Sign in": the ways in, without joining on the picks. */
  signInFromTastes: () => void;
  /** Back from the ways in to the picker, picks kept. */
  backToTastes: () => void;
  /** Welcome back's "Use another way". */
  chooseAnotherWay: () => void;
  /** Back from the full card to Welcome back. */
  returnToRemembered: () => void;
  /** Welcome back's one button: the way in this phone used last time. */
  continueRemembered: (method: RememberedMethod) => void;

  setCountry: (iso: string) => void;
  setNational: (text: string) => void;
  /** Digits only, cut to 6. Checks the code by itself when the sixth digit lands. */
  setCode: (text: string) => void;
  setEmail: (text: string) => void;
  setPassword: (text: string) => void;
  /**
   * Moves to a step. Clears the flow's messages, the password, and the
   * auth store's error and notice, unless `keepAuthNotice`: that carries
   * "check your email, then sign in" (or a taken email's error) across a
   * move, the same nuance the old form's switchMode protected.
   */
  go: (step: SignInStep, opts?: { keepAuthNotice?: boolean }) => void;
  /**
   * phone and email go to entry; code to phone; password to email (entry
   * when email is the only way in); reset to password. The first steps'
   * own way back depends on the gate drawing them (SignInScreen).
   */
  back: () => void;
  /** Back to the first step with nothing typed, keeping the chosen country and the picks. */
  reset: () => void;
  /**
   * The 'unknown' password step's "New to Sipply? Create an account": the
   * same address, on the sign-up variant. The lookup could not say which
   * it is, so the person says. Clears the password (it was typed to sign
   * in, and an empty new-password field is where iOS offers a strong one)
   * and the sign-in error that usually prompts the tap.
   */
  signUpInstead: () => void;

  submitPhone: () => Promise<void>;
  resendCode: () => Promise<void>;
  submitCode: () => Promise<void>;
  /** Runs the lookup, then moves to the password step's variant for its answer. */
  submitEmail: () => Promise<void>;
  /** Signs in, or signs up for a 'new' address. */
  submitPassword: () => Promise<void>;
  sendReset: () => Promise<void>;
  continueWith: (provider: 'apple' | 'google' | 'facebook') => Promise<void>;
}

type FlowValues = Omit<
  SignInFlowState,
  | 'togglePick'
  | 'continueTastes'
  | 'signInFromTastes'
  | 'backToTastes'
  | 'chooseAnotherWay'
  | 'returnToRemembered'
  | 'continueRemembered'
  | 'setCountry'
  | 'setNational'
  | 'setCode'
  | 'setEmail'
  | 'setPassword'
  | 'go'
  | 'back'
  | 'reset'
  | 'signUpInstead'
  | 'submitPhone'
  | 'resendCode'
  | 'submitCode'
  | 'submitEmail'
  | 'submitPassword'
  | 'sendReset'
  | 'continueWith'
>;

function initial(iso: string, picks: string[]): FlowValues {
  return {
    step: 'tastes',
    picks,
    joined: false,
    anotherWay: false,
    iso,
    national: '',
    sentTo: null,
    sentAt: null,
    resends: 0,
    wrongCodes: 0,
    code: '',
    email: '',
    password: '',
    emailStatus: null,
    pending: null,
    error: null,
    providerError: null,
    notice: null,
  };
}

/** Bumped by reset(); see LATE ANSWERS in the header. */
let generation = 0;

/*
 * Each request that can sign someone in notes its way in first, so the
 * remembered account (Welcome back) offers that one next time. One that
 * ends without a session un-notes it, so a cancelled Apple sheet is not
 * credited with a later sign-in by a reset link.
 */
function endAttempt() {
  if (!useAuth.getState().session) noteSignInAttempt(null);
}

export const useSignInFlow = create<SignInFlowState>()((set, get) => {
  /** True while the answer to a request started at `gen` on `step` still belongs on screen. */
  const current = (gen: number, step: SignInStep) => generation === gen && get().step === step;
  /** True while a code request started at `gen` for `to` is still about the live number. */
  const sameNumber = (gen: number, to: string) => generation === gen && get().sentTo === to;
  /** Ends a request, unless a reset has already ended it and another may have started since. */
  const settle = (gen: number) => {
    if (generation === gen) set({ pending: null });
  };

  return {
    ...initial(deviceRegion() ?? 'US', []),

    togglePick: (drinkId) => {
      const { picks } = get();
      set({ picks: picks.includes(drinkId) ? picks.filter((id) => id !== drinkId) : [...picks, drinkId] });
    },

    continueTastes: () => {
      if (get().picks.length < TASTES_TO_START) return;
      set({ joined: true });
      get().go('entry');
    },

    signInFromTastes: () => {
      set({ joined: false });
      get().go('entry');
    },

    backToTastes: () => {
      set({ joined: false });
      get().go('tastes');
    },

    chooseAnotherWay: () => {
      set({ anotherWay: true });
      get().go('entry');
    },

    returnToRemembered: () => {
      set({ anotherWay: false });
      get().go('entry');
    },

    /*
     * Phone and email open their own step, whose Back returns to 'entry',
     * which is Welcome back again while `anotherWay` is off. With email the
     * only way in, its field IS the first step, so that card is shown.
     */
    continueRemembered: (method) => {
      switch (method) {
        case 'apple':
        case 'google':
        case 'facebook':
          void get().continueWith(method);
          return;
        case 'phone':
          get().go('phone');
          return;
        case 'email':
          if (emailStep() === 'entry') get().chooseAnotherWay();
          else get().go('email');
          return;
      }
    },

    setCountry: (iso) => {
      const country = COUNTRY_BY_ISO[iso];
      if (!country) return;
      set({ iso, national: formatNational(country, get().national), error: null });
    },

    // A send failure was about the number that was there; editing it retires the message.
    setNational: (text) => {
      set({ national: formatNational(countryOf(get().iso), text), error: null });
    },

    setCode: (text) => {
      const s = get();
      // Locked after MAX_WRONG_CODES until a new code is sent; the cells ignore input.
      if (s.wrongCodes >= MAX_WRONG_CODES) return;
      const code = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
      if (code === s.code) return;
      set({ code, error: null });
      if (code.length === OTP_LENGTH) void get().submitCode();
    },

    setEmail: (text) => set({ email: text, error: null }),

    setPassword: (text) => set({ password: text }),

    go: (step, opts) => {
      set({ step, error: null, providerError: null, notice: null, password: '' });
      if (!opts?.keepAuthNotice) useAuth.getState().clearError();
    },

    back: () => {
      switch (get().step) {
        case 'phone':
        case 'email':
          get().go('entry');
          return;
        case 'code':
          // "Change number": back to the number, where the country and digits still are.
          set({ code: '' });
          get().go('phone');
          return;
        case 'password':
          get().go(emailStep());
          return;
        case 'reset':
          get().go('password');
          return;
        case 'tastes':
        case 'entry':
          return;
      }
    },

    reset: () => {
      generation += 1;
      // The picks outlive a reset: only applyPicks, once they are in the Dex, clears them.
      set(initial(get().iso, get().picks));
    },

    signUpInstead: () => {
      const s = get();
      if (s.step !== 'password' || s.emailStatus !== 'unknown' || s.pending) return;
      if (useAuth.getState().busy) return;
      set({ emailStatus: 'new' });
      get().go('password');
    },

    submitPhone: async () => {
      const s = get();
      if (s.pending) return;
      const country = countryOf(s.iso);
      const e164 = toE164(country, s.national);
      if (!e164) {
        set({ error: PHONE_INVALID });
        return;
      }

      /*
       * Typed in the international form: the picker follows the number,
       * so the screen agrees with what is sent. A number whose code the
       * picked country already dials keeps that country: Puerto Rico must
       * not turn into the United States because someone typed +1 787, nor
       * Jersey into the United Kingdom for +44.
       */
      let iso = country.iso;
      if (s.national.trim().startsWith('+')) {
        const dial = matchDial(e164, DIALS);
        if (dial && dial !== country.dial) iso = countryForDial(dial)?.iso ?? iso;
      }

      /*
       * The same number, with its code still inside the resend interval:
       * someone tapped Change number and came straight back. Sending
       * again would only be refused for coming too soon, so this returns
       * to the code that is already on its way, countdown and all. A code
       * step that was locked is still locked (only a new code lifts it),
       * so it says so again: go() has just cleared the message.
       */
      if (s.sentTo === e164 && resendWait(s.sentAt) > 0) {
        set({ iso, code: '' });
        get().go('code');
        if (get().wrongCodes >= MAX_WRONG_CODES) set({ error: TOO_MANY_WRONG_CODES });
        return;
      }

      const gen = generation;
      set({ pending: 'phone', iso, error: null, providerError: null });
      useAuth.getState().clearError();
      try {
        const failure = await useAuth.getState().sendPhoneCode(e164);
        if (!current(gen, 'phone')) return;
        if (failure) {
          set({ error: failure });
          return;
        }
        set({ sentTo: e164, sentAt: Date.now(), resends: 0, wrongCodes: 0, code: '' });
        get().go('code');
      } finally {
        settle(gen);
      }
    },

    resendCode: async () => {
      const s = get();
      if (s.pending || !s.sentTo || resendWait(s.sentAt) > 0) return;
      const gen = generation;
      const to = s.sentTo;
      set({ pending: 'resend', error: null, notice: null });
      try {
        const failure = await useAuth.getState().sendPhoneCode(to);
        if (!sameNumber(gen, to)) return;
        const onCodeStep = get().step === 'code';
        if (failure) {
          if (onCodeStep) set({ error: failure });
          return;
        }
        /*
         * A new code gets Twilio's full five attempts, so the lock lifts
         * here and only here. Recorded even after Change number: the code
         * went out, and coming back with this number returns to it.
         */
        set({
          sentAt: Date.now(),
          resends: get().resends + 1,
          wrongCodes: 0,
          code: '',
          notice: onCodeStep ? NEW_CODE_SENT : null,
        });
      } finally {
        settle(gen);
      }
    },

    submitCode: async () => {
      const s = get();
      if (s.pending || !s.sentTo) return;
      if (s.code.length !== OTP_LENGTH || s.wrongCodes >= MAX_WRONG_CODES) return;
      const gen = generation;
      const to = s.sentTo;
      set({ pending: 'code', error: null, notice: null });
      noteSignInAttempt('phone');
      try {
        const failure = await useAuth.getState().verifyPhoneCode(to, s.code);
        // null is a session: the auth listener has already reset this flow.
        if (failure === null || !sameNumber(gen, to)) return;
        const onCodeStep = get().step === 'code';
        if (failure === CODE_WRONG) {
          // Counted even after Change number: the check reached Twilio, whose count this mirrors.
          const wrongCodes = get().wrongCodes + 1;
          const message = wrongCodes >= MAX_WRONG_CODES ? TOO_MANY_WRONG_CODES : CODE_WRONG;
          set(onCodeStep ? { wrongCodes, code: '', error: message } : { wrongCodes, code: '' });
          return;
        }
        // Offline or a server failure: the code stays, so Verify can be pressed again.
        if (onCodeStep) set({ error: failure });
      } finally {
        settle(gen);
        endAttempt();
      }
    },

    submitEmail: async () => {
      const s = get();
      if (s.pending) return;
      const email = s.email.trim();
      if (!looksLikeEmail(email)) {
        set({ error: EMAIL_INVALID });
        return;
      }
      const gen = generation;
      const from = s.step;
      set({ pending: 'email', error: null, providerError: null });
      useAuth.getState().clearError();
      try {
        const answer = await useAuth.getState().lookupEmail(email);
        if (!current(gen, from)) return;
        if (answer.status === null) {
          set({ error: answer.error });
          return;
        }
        set({ email, emailStatus: answer.status });
        get().go('password');
      } finally {
        settle(gen);
      }
    },

    submitPassword: async () => {
      const s = get();
      const auth = useAuth.getState();
      if (s.pending || auth.busy) return;
      if (s.step !== 'password' || s.emailStatus === null || s.emailStatus === 'other') return;
      if (s.password.length < (s.emailStatus === 'new' ? MIN_NEW_PASSWORD : 1)) return;
      const gen = generation;
      const { email, password, emailStatus } = s;
      noteSignInAttempt('email');

      if (emailStatus === 'new') {
        await auth.signUpEmail(email, password);
        endAttempt();
        const after = useAuth.getState();
        if (after.session || !current(gen, 'password')) return;
        if (after.notice) {
          /*
           * Made, but the project wants the email confirmed first, so there
           * is no session. On to the sign-in variant, where the person is
           * about to go anyway, with the notice kept on screen and the
           * password they just chose still filled in for when they come
           * back: the same thing the old form did after a sign-up. Not
           * go(), which clears the password.
           */
          set({ emailStatus: 'password', error: null, providerError: null, notice: null });
        } else if (after.error === EMAIL_HAS_ACCOUNT) {
          // Someone made the account between the lookup and now: sign in instead, error kept.
          set({ emailStatus: 'password' });
          get().go('password', { keepAuthNotice: true });
        }
        return;
      }

      await auth.signIn(email, password);
      endAttempt();
      const after = useAuth.getState();
      if (after.session || !current(gen, 'password')) return;
      /*
       * The lookup did not answer, so this screen offered both paths and
       * cannot know whether the address has an account. A wrong password
       * and no account look the same from here, so the error says both.
       */
      if (emailStatus === 'unknown' && after.error === WRONG_PASSWORD) {
        useAuth.setState({ error: `${WRONG_PASSWORD} ${IF_NEW}` });
      }
    },

    sendReset: async () => {
      const s = get();
      const auth = useAuth.getState();
      if (s.pending || auth.busy) return;
      const email = s.email.trim();
      if (!looksLikeEmail(email)) return;
      set({ error: null, providerError: null });
      await auth.requestPasswordReset(email);
    },

    continueWith: async (provider) => {
      if (get().pending || useAuth.getState().busy) return;
      const gen = generation;
      set({ pending: provider, providerError: null });
      useAuth.getState().clearError();
      noteSignInAttempt(provider);
      try {
        const auth = useAuth.getState();
        const message = await (provider === 'apple'
          ? auth.signInWithApple()
          : provider === 'google'
            ? auth.signInWithGoogle()
            : auth.signInWithFacebook());
        // null for a success and a cancel alike; a success has reset the flow already.
        if (generation === gen) set({ providerError: message });
      } finally {
        settle(gen);
        endAttempt();
      }
    },
  };
});

/*
 * See RESETS in the header. Signing in by any method and losing the
 * session both start the flow over; a token refresh (session to session)
 * changes nothing here.
 */
useAuth.subscribe((state, prev) => {
  if ((state.session === null) === (prev.session === null)) return;
  if (state.session) applyPicks();
  useSignInFlow.getState().reset();
});

/*
 * THE PICKS GO IN ONCE. Called as a session arrives (any way in, on any
 * gate), and again if the collection finishes loading after that. The
 * picks are cleared only once the collection has taken them, so a launch
 * that could not read the Dex back keeps them rather than writing them
 * where they would not be saved; addFromTastes also skips any drink the
 * Dex already holds, so a second call can never add one twice.
 */
function applyPicks() {
  const { picks } = useSignInFlow.getState();
  if (picks.length === 0 || !useAuth.getState().session) return;
  if (useCollection.getState().addFromTastes(picks) !== null) useSignInFlow.setState({ picks: [] });
}

useCollection.subscribe((state, prev) => {
  if (state.hydrated && !prev.hydrated) applyPicks();
});
