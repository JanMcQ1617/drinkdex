import { isLoaded } from 'expo-font';
import { Platform, TurboModuleRegistry } from 'react-native';

import { colors, fonts, layout, radius, stroke } from '@/constants/theme';
import {
  amountText,
  applePayAmount,
  isSpirit,
  isTestPublishableKey,
  readTicket,
  refusalOf,
  STRIPE_RETURN_PATH,
  type CheckoutRefusal,
} from '@/lib/shopCore';
import { supabase } from '@/lib/supabase';
import type { Drink } from '@/types';

/* ==================================================================== */
/* Buy a bottle                                                         */
/*                                                                      */
/* v4.11 (Jan, 29 Oct 2026; specs/v4.11/shop.md). On a spirit's page    */
/* the pinned bar holds "Post this drink" and "Buy a bottle"; Buy runs  */
/* a checkout in Stripe's PaymentSheet: Apple Pay (the Wallet's cards), */
/* cards, and whatever else the payment's automatic methods offer.      */
/*                                                                      */
/* TEST MODE ONLY. No licensed store is connected yet (Jan is talking  */
/* to suppliers), so the server (supabase/functions/shop-checkout)      */
/* creates a test-mode payment for a fixed US$1.00 it decides itself,   */
/* and the phone confirms it with a pk_test_ key. No money moves and    */
/* nothing ships. The phone sends only which drink; it never names a    */
/* price. lib/shopCore refuses a live key and an answer not marked as a */
/* test, so neither side's mistake can take real money from this build. */
/*                                                                      */
/* THE FLAG, EXPO_PUBLIC_SPIRIT_SHOP. 'on' shows Buy; anything else is  */
/* the app as it was, on every page. On for TestFlight; OFF for the App */
/* Store build until a licensed supplier and real payments are live.    */
/* Read with static dot access, which is what lets Expo inline it, and  */
/* written out IN FULL at each test below rather than through           */
/* SPIRIT_SHOP_ENABLED: Metro folds a test that is a constant where it  */
/* is written (its constant-folding pass runs before it collects a      */
/* file's requires), so with the flag off the Stripe SDK's require and  */
/* every word below are gone from the bundle, not merely never reached. */
/* specs/v4.11/shop.test.mjs checks that each test is written so.       */
/*                                                                      */
/* SIGNED OUT, Buy shows, as Post does, and its tap says what needs an  */
/* account in words, as the post sheet's "Sign in to post" does. No     */
/* sign-in screen is pushed.                                            */
/* ==================================================================== */

/** EXPO_PUBLIC_SPIRIT_SHOP: 'on' shows "Buy a bottle" on a spirit's page; anything else hides it. */
export const SPIRIT_SHOP_ENABLED = process.env.EXPO_PUBLIC_SPIRIT_SHOP === 'on';

/** Apple Pay's merchant ID: app.json's Stripe plugin writes it into the entitlement. */
export const MERCHANT_ID = 'merchant.com.janmcqueeny.drinkdex';
/** The app's URL scheme (app.json `scheme`, lib/oauth's callback): Stripe returns redirect payments on it. */
export const URL_SCHEME = 'drinkdex';
const RETURN_URL = `${URL_SCHEME}://${STRIPE_RETURN_PATH}`;

/** The function behind Buy, and how long it may take: one call to Stripe behind it, so generous, never a spinner forever. */
const CHECKOUT_FUNCTION = 'shop-checkout';
const CHECKOUT_TIMEOUT_MS = 20_000;

/* -------------------------------------------------------------------- */
/* The SDK, only in a build with the shop                               */
/* -------------------------------------------------------------------- */

type StripeSdk = typeof import('@stripe/stripe-react-native');
let sdk: StripeSdk | null | undefined;

/*
 * Loaded on the first ask: by ShopHost at launch once this build has a
 * key, else never. iOS only: Sipply ships no Android build, and the web
 * bundle has no module.
 *
 * ONLY FROM A BINARY THAT HAS IT. The SDK's index looks up its native
 * module as it is evaluated (TurboModuleRegistry.getEnforcing), which
 * throws in a binary built without the SDK: a dev client from before it,
 * or an archive from an ios/ made before it (scripts/build-ios.sh reuses
 * one; specs/v4.11/jan-setup.md). A try/catch here would not save the
 * app: Metro's require reports a module that throws on its first
 * evaluation as fatal instead of throwing it to the caller (metro-runtime,
 * guardedLoadModule). So the module is asked for first with
 * TurboModuleRegistry.get, which answers null, and Buy then says checkout
 * is not set up instead of the app dying.
 *
 * A require, not an import: an import is evaluated with this file, at
 * launch, and cannot sit behind the flag's test, so the off build would
 * carry the SDK. Hence the one lint exception below.
 */
export function stripeSdk(): StripeSdk | null {
  if (sdk === undefined) {
    sdk = null;
    if (
      process.env.EXPO_PUBLIC_SPIRIT_SHOP === 'on' &&
      Platform.OS === 'ios' &&
      TurboModuleRegistry.get('StripeSdk') != null
    ) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- behind the flag's test, so Metro can fold it away (above)
      sdk = require('@stripe/stripe-react-native') as StripeSdk;
    }
  }
  return sdk;
}

const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

/**
 * The publishable key this build confirms payments with, or null: the
 * shop is off, no key was set (.env leaves it empty until Jan pastes
 * one), or the key is not a test key. A live key is said once in the
 * log, never used.
 */
export function shopPublishableKey(): string | null {
  if (!SPIRIT_SHOP_ENABLED) return null;
  return isTestPublishableKey(PUBLISHABLE_KEY) ? PUBLISHABLE_KEY : null;
}
if (process.env.EXPO_PUBLIC_SPIRIT_SHOP === 'on' && PUBLISHABLE_KEY && !isTestPublishableKey(PUBLISHABLE_KEY)) {
  console.warn('shop: EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not a pk_test_ key; this build takes test payments only');
}

/** Whether this drink's page offers a bottle: the shop is on and it is a spirit (lib/shopCore). */
export function offersBottle(drink: Pick<Drink, 'category'>): boolean {
  return SPIRIT_SHOP_ENABLED && isSpirit(drink);
}

/* -------------------------------------------------------------------- */
/* The words                                                            */
/*                                                                      */
/* Every one is behind the flag (see the head of this file): a build    */
/* with the shop off holds no "Buy a bottle" for anything to draw. Each  */
/* failure says that nothing was charged, since the person who tapped   */
/* Buy is owed that before anything else.                              */
/* -------------------------------------------------------------------- */

const WORDS =
  process.env.EXPO_PUBLIC_SPIRIT_SHOP === 'on'
    ? {
        buy: 'Buy a bottle',
        buyOf: (name: string) => `Buy a bottle of ${name}`,
        /* The sheet's own key, in place of Stripe's "Pay": this build only ever places a test order. */
        payKey: 'Place test order',
        /* Apple Pay's last line reads "Pay <this>", so it says it too. */
        applePayLine: 'Sipply, test order',
        failedTitle: 'Could not buy it',
        notSetUpTitle: 'Not set up yet',
        notSetUp: 'Buying a bottle is not set up in this build yet, so nothing was charged.',
        signedOutTitle: 'Sign in to buy',
        /* Says only what holds signed out, as the post sheet's own line does: posting needs an account too. */
        signedOut: 'Buying a bottle needs a Sipply account. Saving it to your Dex works without one.',
        refusals: {
          offline: 'Sipply could not connect, so nothing was charged. Check your connection and try again.',
          expired: 'Your session has expired, so nothing was charged. Sign out, sign back in and try again.',
          not_set_up: 'Buying a bottle is not set up yet, so nothing was charged.',
          refused: 'This bottle cannot be bought through Sipply right now. Nothing was charged.',
          busy: 'Too many tries just now, so nothing was charged. Try again in a minute.',
          failed: 'Checkout could not start just now, so nothing was charged. Try again in a minute.',
        } satisfies Record<CheckoutRefusal, string>,
        sheetFailed: 'The payment did not go through, so nothing was charged. Try again.',
        paidTitle: 'Test order placed',
        /* What happened and nothing more: no store has signed, so the app promises no real bottles. */
        paid: (name: string, amount: string | null) =>
          `That was a test order${amount ? ` of ${amount}` : ''} for ${name}: no money moved, and nothing will ship.`,
      }
    : null;

/** The Buy key's label: "Buy a bottle". Empty with the shop off, where nothing draws it. */
export const BUY_LABEL = WORDS?.buy ?? '';

/** The Buy key spoken: "Buy a bottle of Campari". */
export function buyLabelFor(name: string): string {
  return WORDS ? WORDS.buyOf(name) : '';
}

/* -------------------------------------------------------------------- */
/* The checkout                                                         */
/* -------------------------------------------------------------------- */

/**
 * The checkout's end. `paid` and `failed` carry what to say (the route
 * says it with the app's notice); `canceled` is the person closing the
 * sheet, or leaving the page before it rose: a decision either way,
 * which is answered with nothing.
 */
export type CheckoutResult =
  | { kind: 'paid'; amount: number; currency: string; title: string; message: string }
  | { kind: 'canceled' }
  | { kind: 'failed'; title: string; message: string };

/** The HTTP status of a FunctionsHttpError, whose context is the Response. */
function statusOf(error: unknown): number | null {
  const ctx = (error as { context?: unknown } | null)?.context;
  const status = (ctx as { status?: unknown } | null | undefined)?.status;
  return typeof status === 'number' ? status : null;
}

/*
 * The sheet in the app's own kit (Daylight; theme.ts): ink where Stripe
 * would use the system blue, ink for its errors too, the control's 4pt
 * corner, no shadow, and ink for the key's success flash, which would be
 * green. One hue in the app stays one hue in its sheets. Always light, as
 * the app is (app.json userInterfaceStyle).
 *
 * The key's label is Archivo 600, as every key in the app is. Stripe's
 * iOS side finds a face with UIFont(name:), by its PostScript name, not by
 * expo-font's alias (theme.ts's fonts.*); expo-font registers the file
 * for the whole process, so the PostScript name resolves once the root
 * layout's useFonts has loaded it. Asked only then: a name UIFont cannot
 * find fails initPaymentSheet outright, and Stripe's own face is better
 * than no checkout. The rest of the sheet keeps Stripe's face.
 */
/** Archivo 600's PostScript name, read out of the font file by specs/v4.11/shop.test.mjs. */
const KEY_FACE = 'ArchivoLatin-SemiBold';

function sheetAppearance() {
  return {
    colors: {
      primary: colors.text,
      background: colors.surface,
      componentBackground: colors.surface,
      componentBorder: colors.lineControl,
      componentDivider: colors.line,
      primaryText: colors.text,
      secondaryText: colors.textMuted,
      componentText: colors.text,
      placeholderText: colors.textMuted,
      icon: colors.text,
      error: colors.text,
    },
    shapes: { borderRadius: radius.control, borderWidth: stroke.edge, shadow: { opacity: 0 } },
    primaryButton: {
      ...(isLoaded(fonts.bodySemiBold) ? { font: { family: KEY_FACE } } : {}),
      colors: {
        background: colors.text,
        text: colors.onInk,
        border: colors.text,
        successBackgroundColor: colors.text,
        successTextColor: colors.onInk,
      },
      shapes: { borderRadius: radius.control, height: layout.control, shadow: { opacity: 0 } },
    },
  };
}

/*
 * ONE CHECKOUT AT A TIME, APP-WIDE. Stripe's iOS module holds a single
 * payment sheet, and each initPaymentSheet replaces the last, so two
 * checkouts that overlap could raise each other's payment: Buy on one
 * spirit, back, Buy on another while the first still waits on the
 * server. A page's own guard goes with the page, so the queue is here:
 * a checkout starts only once the one before it has ended, and one whose
 * page has gone ends at its next step without raising anything.
 */
let lastCheckout: Promise<unknown> = Promise.resolve();

/**
 * Buys a bottle of `drink`, in test mode: asks shop-checkout for a
 * payment (as the signed-in person: supabase-js sends the session),
 * then raises Stripe's sheet over it. Resolves once the sheet is gone.
 * Never throws. Waits for a checkout already running (above).
 *
 * `onPage` is whether the page that asked is still the screen in front.
 * It is read before the request, once the server has answered, and
 * again before the sheet; once it is false the checkout ends `canceled`,
 * with no sheet and nothing said, as the person has left the drink.
 *
 * Stops before any request when the shop is off, the drink is not a
 * spirit, this build has no test key, or nobody is signed in; and before
 * the sheet when the answer is not a test payment.
 */
export function startSpiritCheckout(
  drink: Pick<Drink, 'id' | 'name' | 'category'>,
  onPage: () => boolean,
): Promise<CheckoutResult> {
  const run = lastCheckout.then(() => checkout(drink, onPage));
  lastCheckout = run.catch(() => undefined);
  return run;
}

async function checkout(drink: Pick<Drink, 'id' | 'name' | 'category'>, onPage: () => boolean): Promise<CheckoutResult> {
  const words = WORDS;
  if (!words) return { kind: 'failed', title: '', message: '' };
  const stop = (message: string, title = words.failedTitle): CheckoutResult => ({ kind: 'failed', title, message });
  const left: CheckoutResult = { kind: 'canceled' };

  // The key first: without one the SDK is never loaded (stripeSdk, above).
  if (!shopPublishableKey() || !isSpirit(drink)) return stop(words.notSetUp, words.notSetUpTitle);
  const stripe = stripeSdk();
  if (!stripe) return stop(words.notSetUp, words.notSetUpTitle);

  try {
    if (!onPage()) return left;
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) return stop(words.signedOut, words.signedOutTitle);

    const { data, error } = await supabase.functions.invoke(CHECKOUT_FUNCTION, {
      body: { drink_id: drink.id, drink_name: drink.name },
      timeout: CHECKOUT_TIMEOUT_MS,
    });
    // Left while the server answered: no sheet and no notice over another screen. Its test payment stays unconfirmed, which charges nothing.
    if (!onPage()) return left;
    if (error) {
      const why = refusalOf((error as { name?: unknown }).name, statusOf(error));
      return why === 'not_set_up' ? stop(words.refusals.not_set_up, words.notSetUpTitle) : stop(words.refusals[why]);
    }

    const read = readTicket(data);
    if (!read.ok) {
      // Nothing about the person in it: what the server got wrong, for whoever reads the log.
      if (read.why === 'live') console.warn('shop: shop-checkout answered a payment not marked as a test; not shown');
      return stop(words.refusals.failed);
    }
    const { clientSecret, amount, currency } = read.ticket;
    const figure = applePayAmount(amount, currency);

    const init = await stripe.initPaymentSheet({
      merchantDisplayName: 'Sipply',
      paymentIntentClientSecret: clientSecret,
      applePay: {
        merchantCountryCode: 'US',
        ...(figure ? { cartItems: [{ label: words.applePayLine, amount: figure, paymentType: 'Immediate' as const }] } : {}),
      },
      returnURL: RETURN_URL,
      // A payment that settles later (a bank debit) would need a webhook to know it landed: none yet (shop.md 6).
      allowsDelayedPaymentMethods: false,
      primaryButtonLabel: words.payKey,
      style: 'alwaysLight',
      appearance: sheetAppearance(),
    });
    if (init.error) return stop(words.refusals.failed);
    if (!onPage()) return left;

    const shown = await stripe.presentPaymentSheet();
    if (shown.error) {
      return shown.error.code === stripe.PaymentSheetError.Canceled ? { kind: 'canceled' } : stop(words.sheetFailed);
    }
    if (shown.didCancel) return { kind: 'canceled' };
    return {
      kind: 'paid',
      amount,
      currency,
      title: words.paidTitle,
      message: words.paid(drink.name, amountText(amount, currency)),
    };
  } catch {
    return stop(words.refusals.failed);
  }
}
