/* ==================================================================== */
/* Buy a bottle: the rules, data in, answers out                        */
/*                                                                      */
/* v4.11 (Jan, 29 Oct 2026; specs/v4.11/shop.md). A spirit's page can   */
/* sell a bottle: the pinned bar splits into "Post this drink" and "Buy */
/* a bottle", and Buy runs a Stripe checkout. This file is the part of  */
/* that with no device in it: which drinks count as spirits, what a     */
/* publishable key and the server's answer must look like before the    */
/* payment sheet may rise, which link is Stripe's return, and the post  */
/* key's label once it has half the bar. lib/shop is the flag, the      */
/* function call and the sheet; components/DrinkPanels draws the bar.   */
/*                                                                      */
/* The post key's label lives here, the whole-width rule with it, so    */
/* there is one rule for it and not two: the split is the shop's.       */
/*                                                                      */
/* IMPORTS NOTHING, and uses only TypeScript that Node can strip, so    */
/* specs/v4.11/shop.test.mjs runs this very file against the catalogue  */
/* and textFit's own advances. The width a label costs is passed in by  */
/* the caller (textFit's textWidth on Archivo 600), not looked up here. */
/*                                                                      */
/* NO COPY THE SHOP SHOWS. Every word of the shop's own is in lib/shop, */
/* behind the flag, so a build with the shop off carries none of them.  */
/* The post key's words are here because every build draws that key.   */
/* ==================================================================== */

/* -------------------------------------------------------------------- */
/* What sells                                                           */
/* -------------------------------------------------------------------- */

/**
 * A bottle is a spirit's: the Dex is cocktails and spirits (since 20 Sep
 * 2026), and `category` is the field that says which (types.ts,
 * DrinkCategory). The fortified wines that stayed on the spirit shelf
 * (vermouth, sherry, port) are spirits here too, since a bottle is what
 * they are bought as. A cocktail is made, not bought, and a drink
 * someone added (custom/[id]) has no page that offers it.
 */
export function isSpirit(drink: { category: string }): boolean {
  return drink.category === 'spirit';
}

/* -------------------------------------------------------------------- */
/* Test mode, checked on the phone                                      */
/*                                                                      */
/* The server decides the amount and creates the payment; the phone     */
/* only shows the sheet. So the phone's one guarantee is the key it     */
/* confirms with: a pk_test_ key can confirm only a test-mode payment,  */
/* whatever the server sends. A live key is refused here, and so is an  */
/* answer the server does not mark as a test, so a mistake on either    */
/* side stops before the sheet rather than taking real money. Going     */
/* live is a deliberate change to these two checks (shop.md section 6). */
/* -------------------------------------------------------------------- */

/** True for a Stripe test-mode publishable key, and only that: never a live key, never a secret one. */
export function isTestPublishableKey(key: string | null | undefined): key is string {
  return typeof key === 'string' && /^pk_test_[A-Za-z0-9]+$/.test(key);
}

/** What shop-checkout answers with, once checked. `amount` is in the currency's smallest unit (cents). */
export interface CheckoutTicket {
  clientSecret: string;
  amount: number;
  currency: string;
}

/**
 * The function's answer, read: `{ client_secret, amount, currency, test }`.
 * 'malformed' is anything else; 'live' is a well-formed answer that is not
 * marked as a test, which this build never presents. Never throws: it
 * reads whatever came back.
 */
export function readTicket(
  data: unknown,
): { ok: true; ticket: CheckoutTicket } | { ok: false; why: 'malformed' | 'live' } {
  if (typeof data !== 'object' || data === null) return { ok: false, why: 'malformed' };
  const d = data as Record<string, unknown>;
  const secret = d.client_secret;
  const amount = d.amount;
  const currency = d.currency;
  // A PaymentIntent's client secret, pi_…_secret_…: a SetupIntent's or anything else is not a payment.
  if (typeof secret !== 'string' || !/^pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+$/.test(secret)) {
    return { ok: false, why: 'malformed' };
  }
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) return { ok: false, why: 'malformed' };
  if (typeof currency !== 'string' || !/^[a-z]{3}$/.test(currency)) return { ok: false, why: 'malformed' };
  if (d.test !== true) return { ok: false, why: 'live' };
  return { ok: true, ticket: { clientSecret: secret, amount, currency } };
}

/**
 * An amount as the sheet and the receipt line say it, for the currency
 * the test charge is in: US$1.00 from 100 usd. Null for any other
 * currency, whose copy then leaves the figure out rather than guess its
 * decimals (a yen has none).
 */
export function amountText(amount: number, currency: string): string | null {
  return currency === 'usd' ? `US$${(amount / 100).toFixed(2)}` : null;
}

/** The figure Apple Pay's sheet takes, "1.00": dollars and cents, no sign. Null where amountText is. */
export function applePayAmount(amount: number, currency: string): string | null {
  return currency === 'usd' ? (amount / 100).toFixed(2) : null;
}

/**
 * Why the function would not start a checkout, from its HTTP status and
 * the error's class name (by name, as lib/music and lib/appleRevoke do: a
 * second functions-js copy would break instanceof). lib/shop says each
 * one in words.
 *
 *   offline     the request never reached Supabase
 *   expired     401: the session the request carried was refused
 *   not_set_up  404, the function is not deployed; 503, its Stripe key is not set
 *   refused     400, 403, 409, 422: it will not sell this one
 *   busy        429
 *   failed      anything else, Stripe's own failures included
 */
export type CheckoutRefusal = 'offline' | 'expired' | 'not_set_up' | 'refused' | 'busy' | 'failed';

export function refusalOf(errorName: unknown, status: number | null): CheckoutRefusal {
  if (errorName === 'FunctionsFetchError') return 'offline';
  switch (status) {
    case 401:
      return 'expired';
    case 404:
    case 503:
      return 'not_set_up';
    case 400:
    case 403:
    case 409:
    case 422:
      return 'refused';
    case 429:
      return 'busy';
    default:
      return 'failed';
  }
}

/* -------------------------------------------------------------------- */
/* Stripe's return link                                                 */
/* -------------------------------------------------------------------- */

/**
 * The path of the link a redirect-based payment comes back on,
 * drinkdex://stripe-redirect (lib/shop's returnURL). app/+native-intent
 * keeps it from the router, as it keeps drinkdex://auth/callback, and
 * components/ShopHost hands it to Stripe.
 */
export const STRIPE_RETURN_PATH = 'stripe-redirect';

/**
 * Whether `url` is Stripe's return link: drinkdex://stripe-redirect,
 * drinkdex:///stripe-redirect, or the dev client's exp://host/--/stripe-redirect,
 * with or without a query. Read the way app/+native-intent reads a route.
 * Never throws.
 */
export function isStripeReturn(url: string): boolean {
  const devMarker = url.indexOf('/--/');
  const bare = devMarker >= 0 ? url.slice(devMarker + 4) : url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const first = (bare.split(/[?#]/)[0] ?? '').replace(/^\/+/, '').split('/')[0];
  return first === STRIPE_RETURN_PATH;
}

/* -------------------------------------------------------------------- */
/* The post key's label, whole or split                                 */
/* -------------------------------------------------------------------- */

/** On a key the bar's whole width: past this many characters "Post <name> again" becomes "Post it again". */
export const BAR_NAME_MAX = 22;

/**
 * The split bar's post key (a spirit's page with the shop on): the room
 * its label has on one line, in points, and what a label costs at the
 * size it is drawn. The caller works out both.
 */
export interface SplitKey {
  room: number;
  width: (label: string) => number;
}

/**
 * "Post this drink" until the drink is in your Dex, then "Post <name>
 * again", or "Post it again" when the name would crowd the key.
 *
 * Whole width (`split` null) the rule is the one the bar always had: a
 * name over BAR_NAME_MAX characters. Half width there is no count that
 * works: at 393pt the key's label has about 124pt, and the words round
 * the name ("Post ... again") take 88 of them. So the full label is
 * costed against the key's room, at the size it is drawn (Dynamic Type
 * included, up to the bar's cap), and kept only when it fits on one
 * line. A short name ("Gin") can still be said; anything longer is "Post
 * it again", which fits the narrowest phone's half key at the default
 * size. Either way the key is spoken with the full name (DrinkPanels).
 */
export function postKeyLabel(name: string, collected: boolean, split: SplitKey | null): string {
  if (!collected) return 'Post this drink';
  const full = `Post ${name} again`;
  if (!split) return name.length > BAR_NAME_MAX ? 'Post it again' : full;
  return split.width(full) <= split.room ? full : 'Post it again';
}
