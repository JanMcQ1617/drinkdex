/*
 * shop-checkout: the server half of Buy a bottle (specs/v4.11), the key
 * beside Post this drink at the foot of a spirit's page. It makes a Stripe
 * PaymentIntent for the app's PaymentSheet (@stripe/stripe-react-native:
 * Apple Pay, cards, and whatever else Stripe's automatic payment methods
 * offer) and answers only its client secret.
 *
 * TEST MODE ONLY, ON PURPOSE. No licensed store is connected yet (Jan is
 * talking to suppliers), so nothing can be sold and nothing ships. Until
 * one is, this function:
 *
 *   1. checks the session itself (auth.getUser): a real, signed-in
 *      account, never the publishable key every copy of the app carries;
 *   2. reads the order the app sends, { drink_id, drink_name }, and
 *      nothing else: the id must look like a catalogue id, the name like
 *      a drink's name. What it costs is not the app's to say;
 *   3. refuses unless STRIPE_SECRET_KEY is a test key (sk_test_), so a
 *      live key pasted by mistake answers 503 and can never charge anyone;
 *   4. makes a PaymentIntent for TEST_AMOUNT_CENTS (US$1.00) in usd, both
 *      fixed here, with automatic payment methods on, the drink's name in
 *      the description and drink_id, user_id and test=true in its metadata,
 *      under one Idempotency-Key per tap that its one retry reuses;
 *   5. checks that Stripe's answer is that PaymentIntent, in test mode, for
 *      that amount, and answers its client secret.
 *
 * In test mode Stripe moves no money: its test cards (4242 4242 4242 4242)
 * are the only cards it takes, and for Apple Pay it puts a test card in
 * place of the real one from Wallet, so that card is never charged.
 *
 * SIPPLY NEVER SELLS ALCOHOL ITSELF. When a store is connected, the store
 * is the seller, as a Stripe Connect connected account. The two spots that
 * change are marked CONNECT, LATER below, and
 * specs/v4.11/server-shop-checkout.md lists everything else live needs.
 * None of it is built now.
 *
 * Nothing about the person is logged: no id, no drink, no client secret,
 * never the key and never Stripe's answer. Stripe's status, error type and
 * error code are, in one short line.
 *
 * DEPLOY (Supabase Dashboard, not the CLI): Edge Functions -> Deploy a new
 * function -> Via editor, name it `shop-checkout`, paste this file, and turn
 * OFF "Verify JWT with legacy secret" (function Settings tab). This project
 * signs sessions with an ECC (P-256) key, so that switch, which accepts only
 * the legacy HS256 secret, refuses every real user with a 401; and even a
 * switch that let sessions through would let the legacy anon key through
 * as well, since that key is a signed JWT too. The handler checks the
 * session itself (auth.getUser below), which is what keeps strangers out.
 * Secret (Edge Functions -> Secrets):
 *   STRIPE_SECRET_KEY  the TEST secret key (sk_test_...) from the Stripe
 *                      Dashboard in test mode, Developers -> API keys, on
 *                      The Idealize's account. A live key is refused.
 * Supabase supplies SUPABASE_URL and the project's client key itself. No
 * Stripe key, test or live, ever goes in the repo.
 *
 * Deno code: excluded from the app's tsc and lint. Its one import is an
 * npm: specifier Deno resolves at deploy; nothing is added to package.json.
 * Stripe is spoken to as stripe-connect-kit speaks to it: form-encoded REST
 * over fetch, no Stripe SDK. One file, so it can be pasted into the
 * Dashboard editor; the client-key reading is copied from apple-revoke
 * rather than shared.
 *
 * Request:  POST { "drink_id": "campari", "drink_name": "Campari" }
 *           with the session (supabase.functions.invoke sends it)
 * Answers:  200 { client_secret, amount: 100, currency: 'usd', test: true }
 *           400 bad_request | 401 signed_out | 502 upstream |
 *           503 not_configured                 a secret is missing, or Stripe refused the key
 *           503 test_mode_only                 STRIPE_SECRET_KEY is not a test key; nothing was made
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

/*
 * What every test order costs, decided here and only here: the app never
 * sends an amount, and a body that tries is refused (parseOrder). US$1.00
 * is the smallest round figure every payment method takes (Stripe's floor
 * for usd is US$0.50).
 */
export const TEST_AMOUNT_CENTS = 100;
export const CURRENCY = 'usd';

const STRIPE_PAYMENT_INTENTS_URL = 'https://api.stripe.com/v1/payment_intents';
const STRIPE_TIMEOUT_MS = 8000;
/** The first try and one retry, under the same Idempotency-Key. */
const STRIPE_ATTEMPTS = 2;
const RETRY_PAUSE_MS = 400;

/** The catalogue's ids (src/data/drinks.json): lower-case words joined by single hyphens, 32 at most today. */
const DRINK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DRINK_ID_MAX = 64;
/** The catalogue's longest name is 34 characters ("Rothman & Winter Crème de Violette"). */
const DRINK_NAME_MAX = 80;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** A test secret key as Stripe issues them; anything else is refused before Stripe is called. */
const TEST_SECRET_KEY = /^sk_test_[A-Za-z0-9_]{16,240}$/;
/** pi_<id>_secret_<secret>: what PaymentSheet takes. */
const CLIENT_SECRET = /^pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+$/;
/** Stripe's error types and codes, the only part of a refusal that is logged. */
const STRIPE_WORD = /^[a-z0-9_]{1,64}$/;

/* -------------------------------------------------------------------- */
/* The order                                                            */
/* -------------------------------------------------------------------- */

export interface Order {
  drinkId: string;
  drinkName: string;
}

/*
 * The drink's name as the PaymentIntent's description may carry it, or
 * null (400). Only Jan's Stripe Dashboard shows it (and, once stores are
 * connected, the store's), but it is still the app's words, so: one line,
 * NFC, its spaces collapsed, 1 to 80 characters, and no control, format,
 * private-use or unassigned character (no bidi overrides, no zero-width
 * anything). Every name in the catalogue passes.
 */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > DRINK_NAME_MAX * 4) return null;
  const t = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (t.length === 0 || [...t].length > DRINK_NAME_MAX) return null;
  if (/\p{C}/u.test(t)) return null;
  return t;
}

/*
 * The app's body, or null (400). Exactly its two keys: an amount, a
 * currency, a price or a store sent from the app is a bug or a forgery,
 * and either way it is refused rather than ignored.
 *
 * Nothing here proves the drink is a spirit, or that the name is that
 * drink's: the catalogue lives in the app, not on the server. Today that
 * cannot matter (every order is the same US$1.00 test, and the name only
 * labels it). Once stores are connected it is the store's listing, looked
 * up here by drink_id, that says what is sold and for how much.
 */
export function parseOrder(body: unknown): Order | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (Object.keys(b).some((k) => k !== 'drink_id' && k !== 'drink_name')) return null;
  const { drink_id: drinkId, drink_name: drinkName } = b;
  if (typeof drinkId !== 'string' || drinkId.length > DRINK_ID_MAX || !DRINK_ID.test(drinkId)) return null;
  const name = cleanName(drinkName);
  if (!name) return null;
  return { drinkId, drinkName: name };
}

/* -------------------------------------------------------------------- */
/* Stripe                                                               */
/* -------------------------------------------------------------------- */

/*
 * The PaymentIntent, form-encoded with Stripe's bracket keys. Everything in
 * it is the server's but the drink's id and name, which parseOrder checked,
 * and the account's id, which the session gave.
 *
 * CONNECT, LATER (not built; specs/v4.11/server-shop-checkout.md §6). When
 * a licensed store is connected it is the seller, and this is where that is
 * said. The amount becomes the store's price for this drink, read on the
 * server from its listing by drink_id, never the app's. Then one of:
 *
 *   a direct charge (the better fit: the store is the merchant of record,
 *   its name is on the statement, its account takes refunds and disputes):
 *     form.set('application_fee_amount', String(sipplyFeeCents));
 *     plus the Stripe-Account header in createPaymentIntent, and the app's
 *     PaymentSheet given that account id too;
 *   a destination charge (made on Sipply's account, paid on to the store's):
 *     form.set('transfer_data[destination]', store.accountId);
 *     form.set('on_behalf_of', store.accountId);   // the store, not Sipply, as merchant of record
 *     form.set('application_fee_amount', String(sipplyFeeCents));
 *
 * Either way metadata[test] goes, and readIntent's checks follow the price.
 */
export function paymentIntentForm(order: Order, userId: string): URLSearchParams {
  const form = new URLSearchParams();
  form.set('amount', String(TEST_AMOUNT_CENTS));
  form.set('currency', CURRENCY);
  // Apple Pay, cards and the rest, as turned on in the Stripe Dashboard's Payment methods.
  form.set('automatic_payment_methods[enabled]', 'true');
  form.set('description', `Sipply test order: ${order.drinkName}`);
  form.set('metadata[drink_id]', order.drinkId);
  form.set('metadata[user_id]', userId);
  form.set('metadata[test]', 'true');
  return form;
}

type StripeCall =
  | { kind: 'ok'; body: Record<string, unknown> }
  | { kind: 'refused'; status: number } // a 4xx not worth repeating: the request or the key
  | { kind: 'failed' }; // no answer, or a 5xx, both times

async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await res.json();
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Stripe's error type and code, for the log line. Its message is not kept: it can quote the key's last digits. */
function errorWords(body: Record<string, unknown>): string {
  const e = (body.error ?? {}) as { type?: unknown; code?: unknown };
  return [e.type, e.code].filter((v): v is string => typeof v === 'string' && STRIPE_WORD.test(v)).join(' ');
}

/** Whether to send it again: Stripe's Stripe-Should-Retry when it says, else a conflict, a rate limit or a 5xx. */
export function shouldRetry(status: number, hint: string | null): boolean {
  if (hint === 'true') return true;
  if (hint === 'false') return false;
  return status === 409 || status === 429 || status >= 500;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/*
 * The POST, tried at most twice under the same Idempotency-Key. That is
 * Stripe's own advice for a request that got no answer or a 5xx: if the
 * first one did make a PaymentIntent, Stripe answers the second with that
 * same one instead of making another. Each tap of Buy a bottle gets a
 * fresh key (handle), so two taps are two checkouts; an unpaid
 * PaymentIntent charges nobody, and Stripe leaves it incomplete.
 */
async function createPaymentIntent(secretKey: string, form: URLSearchParams, idempotencyKey: string): Promise<StripeCall> {
  const body = form.toString();
  for (let attempt = 1; attempt <= STRIPE_ATTEMPTS; attempt++) {
    const last = attempt === STRIPE_ATTEMPTS;
    let res: Response;
    try {
      res = await fetch(STRIPE_PAYMENT_INTENTS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'Idempotency-Key': idempotencyKey,
          // CONNECT, LATER: a direct charge adds 'Stripe-Account': store.accountId here.
        },
        body,
        signal: AbortSignal.timeout(STRIPE_TIMEOUT_MS),
      });
    } catch {
      console.error(`shop-checkout: Stripe did not answer (try ${attempt} of ${STRIPE_ATTEMPTS})`);
      if (last) return { kind: 'failed' };
      await pause(RETRY_PAUSE_MS);
      continue;
    }
    const answered = await bodyOf(res);
    if (res.ok) return { kind: 'ok', body: answered };
    console.error(`shop-checkout: Stripe answered ${res.status} ${errorWords(answered)}`.trim());
    if (!shouldRetry(res.status, res.headers.get('stripe-should-retry'))) {
      return res.status >= 500 ? { kind: 'failed' } : { kind: 'refused', status: res.status };
    }
    if (last) return { kind: 'failed' };
    await pause(RETRY_PAUSE_MS);
  }
  return { kind: 'failed' };
}

/*
 * Stripe's answer, shape-checked rather than trusted, or null. It must be
 * a PaymentIntent, made in test mode, for the test amount in usd: the
 * answer then says `test: true` because Stripe said so, not because the
 * key's prefix did.
 */
export function readIntent(body: Record<string, unknown>): { clientSecret: string } | null {
  if (body.object !== 'payment_intent') return null;
  if (body.livemode !== false) return null;
  if (body.amount !== TEST_AMOUNT_CENTS || body.currency !== CURRENCY) return null;
  const secret = body.client_secret;
  return typeof secret === 'string' && secret.length <= 300 && CLIENT_SECRET.test(secret)
    ? { clientSecret: secret }
    : null;
}

/* -------------------------------------------------------------------- */
/* Configuration                                                        */
/* -------------------------------------------------------------------- */

interface Project {
  url: string;
  clientKey: string;
}

/* The project's client key, read as apple-revoke reads it. */
function publishableFromMap(): string | null {
  const many = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (!many) return null;
  try {
    const map = JSON.parse(many) as Record<string, unknown>;
    const pick = map.default ?? Object.values(map).find((v) => typeof v === 'string');
    return typeof pick === 'string' && pick ? pick : null;
  } catch {
    return null;
  }
}

function clientKey(): string | null {
  return (
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ||
    publishableFromMap() ||
    Deno.env.get('SUPABASE_ANON_KEY') ||
    null
  );
}

/* Supabase supplies these itself; they are needed to check the caller. */
function readProject(): Project | null {
  const url = Deno.env.get('SUPABASE_URL');
  const key = clientKey();
  return url && key ? { url, clientKey: key } : null;
}

type StripeKey = { kind: 'test'; key: string } | { kind: 'missing' } | { kind: 'not_test'; what: string };

/*
 * Jan's secret. Read only after the caller is checked (see handle), so
 * nobody outside an account can ask whether it is set, or which kind it is.
 * Quotes and spaces pasted round it go. Anything but a test secret key is
 * refused here, before Stripe is called: this is the guard that keeps a
 * live key from ever charging anyone, and it is meant to be changed only by
 * an edit to this file (server-shop-checkout.md §6), never by a paste.
 */
export function readStripeKey(raw: string | undefined): StripeKey {
  const key = (raw ?? '').replace(/["'\s]/g, '');
  if (key.length === 0) return { kind: 'missing' };
  if (TEST_SECRET_KEY.test(key)) return { kind: 'test', key };
  // Only the prefix is named in the log, and only the kinds Stripe issues.
  const what = /^(sk|rk)_live_/.test(key)
    ? 'a live key'
    : /^rk_test_/.test(key)
      ? 'a restricted key'
      : /^pk_/.test(key)
        ? 'a publishable key'
        : 'not a Stripe secret key';
  return { kind: 'not_test', what };
}

/* -------------------------------------------------------------------- */
/* The handler                                                          */
/* -------------------------------------------------------------------- */

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const fail = (status: number, error: string) => answer(status, { error });

/** 503, said in the logs too: the app only says the checkout is not available, so this is where the reason shows. */
function notConfigured(why: string): Response {
  console.error(`shop-checkout: not configured (${why}); nothing was made or charged`);
  return fail(503, 'not_configured');
}

export async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return fail(400, 'bad_request');

  // No session, no further: not even the body is read.
  const authorization = req.headers.get('Authorization') ?? '';
  const jwt = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1];
  if (!jwt || jwt.length > 8192) return fail(401, 'signed_out');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'bad_request');
  }
  const order = parseOrder(body);
  if (!order) return fail(400, 'bad_request');

  const project = readProject();
  if (!project) return notConfigured('SUPABASE_URL or the client key is missing');

  /*
   * The gateway does not check the session (see DEPLOY above), so this is
   * the check. GoTrue answers a user only for a real account's session:
   * the publishable or anon key sent as the bearer has no `sub`, and gets
   * an error here, so it is a 401 like no header at all. The account must
   * also be a full one (role authenticated, not an anonymous sign-in,
   * which this project does not offer but GoTrue could), with an id that
   * is a uuid, since that id goes into the PaymentIntent's metadata.
   */
  const supabase = createClient(project.url, project.clientKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: who, error: whoError } = await supabase.auth.getUser(jwt);
  const user = who?.user;
  if (whoError || !user) return fail(401, 'signed_out');
  if (typeof user.id !== 'string' || !UUID.test(user.id)) return fail(401, 'signed_out');
  if ((user as { is_anonymous?: unknown }).is_anonymous === true) return fail(401, 'signed_out');
  if (user.role !== undefined && user.role !== 'authenticated') return fail(401, 'signed_out');

  // After the caller check, not before (readStripeKey says why).
  const stripeKey = readStripeKey(Deno.env.get('STRIPE_SECRET_KEY'));
  if (stripeKey.kind === 'missing') return notConfigured('STRIPE_SECRET_KEY is missing');
  if (stripeKey.kind === 'not_test') {
    console.error(
      `shop-checkout: STRIPE_SECRET_KEY is ${stripeKey.what}, not a test key (sk_test_); refused, nothing was made or charged`,
    );
    return fail(503, 'test_mode_only');
  }

  const made = await createPaymentIntent(
    stripeKey.key,
    paymentIntentForm(order, user.id),
    `shop-checkout-${crypto.randomUUID()}`,
  );
  if (made.kind === 'refused') {
    // 401: the key is wrong or rolled. 403: a key without the right to make PaymentIntents.
    if (made.status === 401 || made.status === 403) {
      return notConfigured(`Stripe refused STRIPE_SECRET_KEY (${made.status})`);
    }
    return fail(502, 'upstream');
  }
  if (made.kind === 'failed') return fail(502, 'upstream');

  const intent = readIntent(made.body);
  if (!intent) {
    console.error('shop-checkout: Stripe answered something other than a test PaymentIntent for the test amount');
    return fail(502, 'upstream');
  }
  return answer(200, {
    client_secret: intent.clientSecret,
    amount: TEST_AMOUNT_CENTS,
    currency: CURRENCY,
    test: true,
  });
}

Deno.serve(handle);
