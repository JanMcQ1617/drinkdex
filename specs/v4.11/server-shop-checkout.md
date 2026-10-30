# v4.11 · shop-checkout: the server half of Buy a bottle (build spec)

29 Oct 2026. On a spirit's page the pinned bar becomes two keys, Post this drink and Buy a bottle (the app's half of v4.11, behind `EXPO_PUBLIC_SPIRIT_SHOP`). No licensed store is connected yet, so Buy a bottle runs a real Stripe checkout **in test mode only**: a fixed US$1.00 test order that moves no money, and nothing ships. This page covers the server and how to stand it up. Jan's Apple and Stripe clicks are in `jan-setup.md`.

| Piece | File | Ships |
|---|---|---|
| The checkout | `supabase/functions/shop-checkout/index.ts` (one file, for the Dashboard editor) | Jan deploys it (§3) |
| The secret | `STRIPE_SECRET_KEY`, an `sk_test_` key, in Supabase Edge Function secrets | Jan pastes it (`jan-setup.md` c) |
| The app's side | the Buy a bottle key and Stripe's PaymentSheet | Build 37, `EXPO_PUBLIC_SPIRIT_SHOP=on` for TestFlight only |
| The words for Apple and testers | `review-notes-37.txt`, `wtt-37.txt` | With build 37 |

Rules that hold everywhere:

- **The price is the server's.** `TEST_AMOUNT_CENTS = 100` and `usd` are constants in the function. The app sends `{ drink_id, drink_name }` and nothing else; a body with any other key (an amount, a currency, a store) is a 400, not ignored.
- **Test mode, enforced twice.** The function refuses to call Stripe unless `STRIPE_SECRET_KEY` is an `sk_test_` key (a live key pasted by mistake answers `503 test_mode_only` and charges nobody), and it hands the app a client secret only when Stripe's own answer says `livemode: false` for exactly US$1.00.
- **Signed in, checked by the function.** Every copy of the app carries the publishable key, so the gateway is not the check (§3). `auth.getUser` is: a real account's session, role `authenticated`, not anonymous, with a uuid id.
- **Sipply never sells alcohol.** Today nothing is sold at all. Later each licensed store is a Stripe Connect connected account and is the seller (§6). Nothing for Connect is built now; the two places it goes are marked `CONNECT, LATER` in the file.
- **Nothing about a person is logged**: no user id, no drink, no client secret, never the key, never Stripe's answer. Failures log one short line with Stripe's status, error type and error code.

---

## 1. The shape

```
Spirit page → Buy a bottle (signed in)
   │  supabase.functions.invoke('shop-checkout', { body: { drink_id, drink_name } })
   ▼
Edge Function `shop-checkout` (Verify JWT OFF)
   1. Authorization: Bearer <session>       none → 401 signed_out (body not read)
   2. parseOrder: exactly drink_id + drink_name, shapes checked → else 400
   3. auth.getUser(session)                 not a real account → 401 signed_out
   4. STRIPE_SECRET_KEY                     missing → 503 not_configured
                                            not sk_test_ → 503 test_mode_only
   5. POST api.stripe.com/v1/payment_intents (form-encoded, no SDK)
        amount=100 currency=usd automatic_payment_methods[enabled]=true
        description="Sipply test order: <name>"
        metadata[drink_id] metadata[user_id] metadata[test]=true
        Idempotency-Key: shop-checkout-<uuid>  (one per tap; the retry reuses it)
        no answer / 5xx / 409 / 429 → one retry; Stripe 401/403 → 503; other 4xx → 502
   6. readIntent: payment_intent, livemode false, 100, usd, pi_…_secret_… → else 502
   ▼
200 { client_secret, amount: 100, currency: "usd", test: true }
   ▼
App: initPaymentSheet({ paymentIntentClientSecret, applePay, … }) → presentPaymentSheet()
```

**Why a fresh Idempotency-Key per tap, reused on the retry**: that is what the key is for. If Stripe made the PaymentIntent but the answer was lost, the retry gets the same one back instead of a second. Two taps are two checkouts; an unpaid PaymentIntent charges nobody and Stripe leaves it as incomplete.

**Why the drink is not checked against the catalogue**: the catalogue lives in the app (`src/data/drinks.json`), not on the server. Today every order is the same US$1.00 test and the name only labels it in Stripe's Dashboard. Once stores are connected, the store's listing for that `drink_id`, read on the server, decides what is sold and for how much (§6).

## 2. The contract with the app

| | |
|---|---|
| Call | `supabase.functions.invoke('shop-checkout', { body: { drink_id, drink_name } })`, signed in (invoke sends the session) |
| `drink_id` | the catalogue id: `^[a-z0-9]+(-[a-z0-9]+)*$`, 64 at most (every one in `drinks.json` passes) |
| `drink_name` | the drink's name, 1 to 80 characters after its spaces are collapsed; no control or invisible characters (every catalogue name passes) |
| `200` | `{ client_secret, amount: 100, currency: "usd", test: true }`. `client_secret` goes to `initPaymentSheet`; the app shows `amount` and `currency` from here, never a figure of its own |
| `400 bad_request` | the body was not exactly those two keys, or a value was the wrong shape: an app bug |
| `401 signed_out` | no session, an expired one, or the publishable key: treat as signed out |
| `502 upstream` | Stripe did not answer, refused the request, or answered something unexpected |
| `503 not_configured` | a secret is missing, or Stripe refused the key; the function's Logs say which |
| `503 test_mode_only` | the secret is not an `sk_test_` key; nothing was made |

PaymentSheet needs, on the app's side: the `pk_test_` publishable key (`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`), the merchant identifier `merchant.com.janmcqueeny.drinkdex`, `applePay: { merchantCountryCode: 'US' }`, and a `returnURL` on the `drinkdex` scheme for methods that leave the app. No customer or ephemeral key: nothing is saved between checkouts.

## 3. Deploy

1. Supabase Dashboard → Edge Functions → **Deploy a new function** → **Via editor**.
2. Name it exactly `shop-checkout`. Paste `supabase/functions/shop-checkout/index.ts`. Deploy.
3. Its **Settings** tab: turn **OFF** "Verify JWT with legacy secret". Save.

**Why OFF, though the brief for this build said ON.** This project signs sessions with an ECC (P-256) key (Settings → JWT Keys). The switch checks only the legacy HS256 secret, so with it on every real user gets a 401, as `apple-music`, `apple-revoke` and `push` found (`specs/v3.1-changes.md`, 7 Oct 2026). And where the switch does let sessions through, it lets the legacy anon key through too, which is why the function checks the user itself. With it OFF, that check (step 3 of §1) is the only gate, and it is the one that matters: the smoke test below proves it.

## 4. The secret

Edge Functions → **Secrets** → Add: `STRIPE_SECRET_KEY` = the **test** secret key, `sk_test_…`, from Stripe in test mode, Developers → API keys, on The Idealize's account (`jan-setup.md` c). Quotes or spaces pasted round it are stripped. Supabase supplies `SUPABASE_URL` and the client key itself; nothing else is needed.

Never in the repo, never in `.env`, never in the app. The publishable `pk_test_` key is the only Stripe key the app holds.

## 5. Check it

**Smoke test, from Terminal, no account needed.** Both must answer `{"error":"signed_out"} 401`.

Without any session:

```sh
curl -s -w ' %{http_code}\n' -X POST https://yklknprzyoebzgazcmhj.supabase.co/functions/v1/shop-checkout \
  -H 'content-type: application/json' \
  -d '{"drink_id":"campari","drink_name":"Campari"}'
```

With the app's publishable key as the bearer, which is what anyone holding a copy of the app has:

```sh
KEY=$(grep '^EXPO_PUBLIC_SUPABASE_KEY=' ~/Projects/drinkdex-worktrees/polish/.env | cut -d= -f2-)
curl -s -w ' %{http_code}\n' -X POST https://yklknprzyoebzgazcmhj.supabase.co/functions/v1/shop-checkout \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H 'content-type: application/json' \
  -d '{"drink_id":"campari","drink_name":"Campari"}'
```

Anything else means:

- a message about a JWT or an authorization header: Verify JWT is still on (§3 step 3);
- a 404 or "function not found": the name is not `shop-checkout`;
- `{"error":"bad_request"}`: the `-d` line was mangled in the paste;
- a 503 or a 200 (with or without a `client_secret`): the user check let a stranger through, since the Stripe key is only read after it. Delete the function and tell Claude.

**The real test, on build 37 (TestFlight).** Signed in: Dex → Campari → Buy a bottle → pay with `4242 4242 4242 4242`, any future date, any CVC, any ZIP. Then with Apple Pay. Stripe Dashboard, **test mode** → Payments: two US$1.00 payments, "Sipply test order: Campari", Succeeded, metadata `drink_id campari`, `user_id <your id>`, `test true`. Nothing appears in live mode. If the app says the checkout is not available: Edge Functions → `shop-checkout` → Logs; `not configured (STRIPE_SECRET_KEY is missing)` means §4 is not done, `Stripe refused STRIPE_SECRET_KEY (401)` means the key was mistyped or rolled.

## 6. What changes for live (not built; decided only when a store signs)

1. **Each store is a Stripe Connect connected account**, onboarded with `~/Projects/stripe-connect-kit`. The store is the seller and the merchant of record, never Sipply: either a **direct charge** (the PaymentIntent made on the store's account with the `Stripe-Account` header, and PaymentSheet given that account id), or a **destination charge** with `transfer_data[destination]` **and** `on_behalf_of` set to the store. Sipply's share is `application_fee_amount`. The two `CONNECT, LATER` comments in the function mark where.
2. **Listings on the server.** A migration adds the stores and what they sell: `drink_id` → store, connected account id, price, the states it ships to. The function reads the price from there; the app still never sends one, and `parseOrder` does not change.
3. **The test-mode guard is changed by an edit, never by a paste.** `readStripeKey` and `readIntent` gain a reviewed constant for the mode; `metadata[test]` goes; the answer's `test` becomes Stripe's `livemode`. Until that edit, an `sk_live_` key keeps answering `503 test_mode_only`.
4. **Orders.** A Stripe webhook (`payment_intent.succeeded`, signature checked as `stripe-connect-kit`'s `verifyWebhook` does) writes an orders row and tells the store. Refunds and disputes are the store's, on its account.
5. **A budget per account**, as `charge_music_search` (migration 020) does for song search, so nobody can make PaymentIntents in a loop.
6. **Law and age, on the store.** The store holds the licence for every state it ships to and checks age (21+ in the US) on delivery. Sipply's own gate asks only "legal drinking age where you live". Check Stripe's restricted-business terms for alcohol with each store's account before it goes live.
7. **App Store.** App Review guideline 4.9 (Apple Pay): the store's name, the price, shipping and tax shown before Pay. App Privacy gets the purchase and payment rows, and `docs/privacy.md` and the terms name Stripe and the stores, before the App Store build turns `EXPO_PUBLIC_SPIRIT_SHOP` on. The App Store review notes say who sells.
8. **Live keys** last: `pk_live_` in that build's `.env`, `sk_live_` in Supabase secrets, and Stripe's Apple Pay settings checked for the live certificate.

## 7. Not verified here

- The function has never run on Supabase's Edge runtime and has never called Stripe. It was run under Node with Deno, supabase-js and `fetch` stubbed: every one of the 2,089 catalogue ids and names accepted; extra keys, an amount, bad ids, over-long names and control, bidi and zero-width characters refused; no session a 401 with no client made and no Stripe call; the publishable key, an anonymous user, a non-`authenticated` role and a non-uuid id each a 401; a missing key a 503; `sk_live_`, `rk_live_`, `rk_test_` and `pk_` keys each `503 test_mode_only` with no Stripe call; the exact URL, headers and form fields; a fresh Idempotency-Key per tap and the same one on the retry; a lost answer retried once; two 5xx a 502; Stripe 401 a 503; Stripe 400 a 502 with no retry; `Stripe-Should-Retry` honoured; a live, wrong-amount, wrong-currency or misshapen answer a 502; nothing logged on success, and no id, key, client secret or drink in any log line. It also passes `tsc --strict`. That check is not in the repo (`scripts/` was outside this change); it is worth adding as `scripts/check-shop.mjs`, beside `check-push.mjs`.
- Apple Pay in PaymentSheet needs the merchant ID, Stripe's certificate (`jan-setup.md` a, b) and a build carrying the Apple Pay entitlement. Only build 37 on a phone proves it.
