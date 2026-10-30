# v4.11 · Buy a bottle: a spirit's page sells it, in Stripe test mode

29 Oct 2026. Jan, for the next build: a way to buy a spirit from its page, next to **Post this drink**, payable with Apple Pay (the cards in Wallet) or any other method. No supplier is connected yet (Jan is talking to them), so this build carries the real checkout with nobody selling: **Stripe test mode**, a fixed **US$1.00** the server sets, no money moved, nothing shipped. A cocktail's page does not change.

| Piece | Where | State |
|---|---|---|
| The flag, `EXPO_PUBLIC_SPIRIT_SHOP` | `.env` (`on`); read in `src/lib/shop.ts` | **on** for TestFlight, **off** for the App Store build (§3) |
| The publishable key, `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `.env`, empty | Jan pastes a `pk_test_` key (§5) |
| The bar | `src/components/DrinkPanels.tsx`, `PinnedPostBar`'s `onBuy` and `buying` | §2 |
| The page | `src/app/drink/[id].tsx` | passes `onBuy` on a spirit with the flag on |
| The checkout | `src/lib/shop.ts` (`startSpiritCheckout`), its rules in `src/lib/shopCore.ts` | §4 |
| Stripe at the root | `src/components/ShopHost.tsx` in `src/app/_layout.tsx`; the return link in `src/app/+native-intent.tsx` | flag on only |
| The SDK | `@stripe/stripe-react-native` 0.64.0 (`npx expo install`), its plugin in `app.json` (merchant ID, Google Pay off) | native: the first build after 36 |
| The server | `supabase/functions/shop-checkout`, secret `STRIPE_SECRET_KEY` (written alongside, not by this file's work) | not deployed |
| The proof | `node specs/v4.11/shop.test.mjs` | §7 |

Rules that hold everywhere:

- **Test mode only.** The server creates the payment and names the price; the phone sends which drink and nothing else. The phone confirms with a `pk_test_` key only and shows the sheet only for an answer marked `test: true`, so a mistake on either side stops before money can move (§4.3).
- **One hue.** Buy is the wash key with an ink label. Red still means post, and only post. Stripe's sheet is dressed in the app's ink, not the system blue (§4.4).
- **The App Store build ships with the flag off.** Off is the app as it was on every page, and the shop is not in the bundle at all: no Buy label, no Stripe JavaScript (§3). Selling for real is §6, and none of it is done.
- **No secret anywhere in the repo.** The secret key lives only in the Supabase function's secrets.

---

## 1. What it does

On a **spirit's** page (`category === 'spirit'`, 1,190 of the Dex's 2,089, the fortified wines on the spirit shelf included), with the flag on, the pinned bar holds two keys, half and half as Jan drew it: **Post this drink** on the left, the same red post key doing the same thing, and **Buy a bottle** on the right. A cocktail's page, a drink someone added (`custom/[id]`) and every page with the flag off keep the one full-width post key.

Tap **Buy a bottle**:

1. The key spins (Button's `loading`) and takes no second tap; the post key is held too (disabled: it dims and VoiceOver says so), so two sheets never race. Across pages `lib/shop` runs one checkout at a time, and a checkout whose page has been left ends without a sheet or a notice (§4.1).
2. `startSpiritCheckout` asks `shop-checkout` for a payment, as the signed-in person.
3. Stripe's PaymentSheet rises: Apple Pay first where the phone has it, then cards, then whatever the payment's automatic methods offer. Its key reads **Place test order**, and Apple Pay's sheet names the payee **Sipply, test order**, US$1.00.
4. Paid: a success haptic and **Test order placed**, "That was a test order of US$1.00 for Campari: no money moved, and nothing will ship." Nothing more: no store has signed, so the app promises no real bottles.
5. Closed: nothing. Closing a sheet is a decision.
6. Anything else: the app's notice (`showNotice`), saying what happened and that nothing was charged (§4.5).

**Signed out**, Buy shows, as Post does, and its tap says what needs an account: **Sign in to buy**, "Buying a bottle needs a Sipply account. Saving it to your Dex works without one." (the post sheet's own "Saving to your Dex works either way": posting needs an account too). That is what the page already does for posting: the post key opens its sheet signed out, and the sheet's "Sign in to post" says why the share key is dead. No sign-in screen is pushed from either.

## 2. The bar

**Layout.** A row of two `Button`s, `flex: 1` each, 12 apart (`space.md`, the post sheet's own pair), inside the bar's existing padding. Each stands at the row's height, so a key whose label wraps makes both keys taller together, and the bar's `onLayout` (`onHeight`) still reports the taller of the two; the route pads its content by it as before.

**Buy is `secondary`.** The wash key (`bgSunk` fill, ink label, `press` while held) is the variant that keeps one hue: `primary` is a second solid ink key competing with the post key for "the one action", `danger` underlines its label for the irreversible, and `post` is the accent, which check-design rule 17 keeps to posting. The post sheet already sets `secondary` beside `post` ("Save to Dex", "Save & post"), so the bar's pair reads as that pair does.

**No marks in the split.** At half of a 393pt phone the post key's plus would push "Post this drink" onto a second line at the default text size; without it the label fits from 375 to 440. Buy has no mark either, so the two keys are words alike.

**The label rule** (`postKeyLabel`, `src/lib/shopCore.ts`, now the bar's one rule). Whole width it is the rule it always was: "Post <name> again" unless the name is over 22 characters (`BAR_NAME_MAX`), then "Post it again". Half width no count works (the words round the name already take 88 of the key's 124pt at 393), so the full label is costed with textFit's `textWidth` on Archivo 600 at the size it is drawn (Dynamic Type up to the bar's 1.3 cap) and kept only when it fits one line. At the default size that keeps a name for 2 spirits at 375pt, 10 at 393 and 108 at 440; everything else says "Post it again". Spoken, the key is "Post Campari again" either way, and Buy is "Buy a bottle of Campari". `maxFontSizeMultiplier` stays 1.3 and labels still wrap: at the cap "Post this drink" takes two lines, and the bar grows.

The half key's room for its label (half the bar less the gap, less 20 of padding and the 1pt edge a side):

| Width | 375 | 390 | 393 | 402 | 414 | 428 | 430 | 440 |
|---|---|---|---|---|---|---|---|---|
| Room, pt | 115.5 | 123.0 | 124.5 | 129.0 | 135.0 | 142.0 | 143.0 | 148.0 |

"Post this drink" costs 114.0 at the default size, "Post it again" 97.8, "Buy a bottle" 93.9 (estimates, which err wide).

## 3. The flag

`SPIRIT_SHOP_ENABLED` is `process.env.EXPO_PUBLIC_SPIRIT_SHOP === 'on'`, static dot access as every flag in `.env` and `store/auth.ts`, so Expo inlines it and unset means off. `offersBottle(drink)` is the flag and `isSpirit`, and is the only way a page gets `onBuy`.

**Off is the old app, and the shop is not in the bundle.** Every test of the flag that guards the shop is written out in full where it stands (`process.env.EXPO_PUBLIC_SPIRIT_SHOP === 'on'`): Babel inlines the value, and Metro's constant-folding pass, which runs before Metro collects a file's requires, deletes the branch. So with the flag off `lib/shop` holds `WORDS = null`, an empty `BUY_LABEL`, and no `require('@stripe/stripe-react-native')`: the SDK is never bundled, `ShopHost` is never mounted, and `+native-intent` passes `drinkdex://stripe-redirect` through as it always did. The native SDK and the Apple Pay entitlement are still in the binary (app.json's plugin does not read the flag); nothing calls them.

Checked 29 Oct 2026:

- `npx expo export -p ios --clear` with `EXPO_PUBLIC_SPIRIT_SHOP=off`: the Hermes bundle holds no `Buy a bottle`, `Place test order`, `Test order placed`, `shop-checkout`, `StripeSdk` or `initPaymentSheet`. With `on`, all of them.
- `npx expo export:embed --platform ios --dev false --reset-cache --minify false`, the command Xcode's bundle step runs: with the flag off "Buy a bottle" appears only inside comments (which Hermes does not compile), and `stripeSdk()` is `sdk = null; return sdk`.
- `shop.test.mjs` §1 runs the same Babel and fold over `lib/shop.ts` for `on`, `off`, empty and unset on every run.

**Clear Metro's cache after flipping the flag.** Metro's transform cache does not key on an `EXPO_PUBLIC_` value: an `expo export` with the flag flipped and no `--clear` reused the previous bundle byte for byte. Xcode's bundle step passes `--reset-cache` (`node_modules/expo/scripts/react-native-xcode.sh`), so an archive is always right; a hand-run `expo export`, or an EAS Update, needs `--clear`. The same holds for every flag in `.env`.

**JS-only from the first build that has the SDK.** `@stripe/stripe-react-native` is native, so it changes the fingerprint (`runtimeVersion.policy`): build 36 and earlier can never receive this code by update. From the first build that contains it, flipping the flag is an EAS Update (with `--clear`).

**That build needs a fresh `ios/`.** `scripts/build-ios.sh` runs `expo prebuild` only when `ios/` is missing and never runs `pod install`, so an archive from a checkout whose `ios/` predates this work has no Stripe pod and no Apple Pay entitlement: run `LANG=en_US.UTF-8 npx expo prebuild -p ios --clean` first, or archive from a worktree with no `ios/` (jan-setup.md). A binary without the module no longer crashes: `stripeSdk()` asks `TurboModuleRegistry.get('StripeSdk')` before the require, since a throw in the SDK's index is reported as fatal by Metro's require however it is caught, and `ShopHost` asks for the key before the SDK. Buy then says "Not set up yet".

## 4. The checkout

### 4.1 Order of events (`startSpiritCheckout`, never throws)

0. Waits for a checkout already running anywhere in the app: Stripe's iOS module holds one sheet, and each `initPaymentSheet` replaces the last.
1. Stops with "Not set up yet" if the flag is off, the drink is not a spirit, or there is no `pk_test_` key, and only then loads the SDK; again if this binary has no Stripe module.
2. Stops with "Sign in to buy" if there is no session (`supabase.auth.getSession()`; no request).
3. `supabase.functions.invoke('shop-checkout', { body: { drink_id, drink_name }, timeout: 20_000 })`: supabase-js sends the session's token.

   Before this request, after its answer and before the sheet, the checkout asks `onPage()`, the drink page's `useFocusEffect` saying it is still the screen in front. Once it is not (back, or another screen opened over it) the checkout ends `canceled`: no sheet over another screen, no notice for a drink the person left. The server's test payment stays unconfirmed, which charges nothing.
4. Reads the answer (`readTicket`); a malformed one, or one not marked `test: true`, stops before the sheet (the second is logged, with nothing about the person).
5. `initPaymentSheet`: `merchantDisplayName 'Sipply'`, `paymentIntentClientSecret`, `applePay { merchantCountryCode 'US', cartItems }`, `returnURL 'drinkdex://stripe-redirect'`, `allowsDelayedPaymentMethods false`, `primaryButtonLabel 'Place test order'`, `style 'alwaysLight'`, the app's `appearance` (§4.4).
6. `presentPaymentSheet`: `Canceled` is `{ kind: 'canceled' }`; any other error is "did not go through"; otherwise `{ kind: 'paid', amount, currency }` with its words.

### 4.2 What the app expects of `shop-checkout`

| | |
|---|---|
| Request | `POST` with the session (the function checks it itself), body `{ drink_id, drink_name }`. No price, no currency, no quantity |
| 200 | `{ client_secret: 'pi_…_secret_…', amount: 100, currency: 'usd', test: true }`, amount in cents |
| 401 | the session refused (the app sends none signed out): "Your session has expired…" |
| 404, 503 | not deployed, or `STRIPE_SECRET_KEY` missing, refused or not a test key: "Not set up yet" |
| 400, 403, 409, 422 | will not sell this one: "This bottle cannot be bought through Sipply right now." |
| 429 | "Too many tries just now…" |
| 502, anything else, or the network | "Checkout could not start just now…", "Sipply could not connect…" |

### 4.3 Test mode, four times over

1. The server holds a test secret key (`sk_test_`), so it can only create test-mode payments.
2. The server sets the amount (US$1.00); the phone never sends one (`shop.test.mjs` checks the request body).
3. The phone uses its publishable key only if it is `pk_test_…` (`isTestPublishableKey`; a live key is refused and logged once). A test key can only confirm a test-mode payment, whatever the server sent.
4. The phone shows the sheet only for an answer with `test: true` (`readTicket`).

Apple Pay in test mode uses the real cards in Wallet, and Stripe hands back a test token: the card is not charged. Delayed methods (bank debits) are off, since nothing yet listens for a payment that settles later.

### 4.4 The sheet in the app's kit

Ink (`colors.text`) where Stripe would use the system blue, for its errors too (Daylight has no red error), the key's success flash in ink rather than green, `radius.control` corners, the 1pt edge, no shadows, the key at `layout.control` (52). Always light, like the app. The key's label is Archivo 600, as every key in the app: Stripe finds a face with `UIFont(name:)`, by PostScript name (`ArchivoLatin-SemiBold`, which `shop.test.mjs` reads out of the font file), and expo-font registers the file for the whole process. It is passed only once expo-font reports the face loaded (`isLoaded`), since a name UIFont cannot find fails `initPaymentSheet` outright. The rest of the sheet keeps Stripe's face.

### 4.5 The words

All in `lib/shop.ts`'s `WORDS`, behind the flag. Every failure says nothing was charged. Titles: "Not set up yet", "Sign in to buy", "Could not buy it", "Test order placed". Cancel says nothing.

## 5. Before 'on' does more than "Not set up yet"

1. **Apple Developer, before the next archive.** Create the merchant ID `merchant.com.janmcqueeny.drinkdex` and turn on Apple Pay, with that merchant ID, for the App ID `com.janmcqueeny.drinkdex`. The Stripe plugin writes `com.apple.developer.in-app-payments` into every build, flag or no flag, and automatic signing cannot create a merchant ID: without this the archive does not sign.
2. **Stripe Dashboard, test mode.** Developers > API keys. The `pk_test_` key goes into `.env` as `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`. The `sk_test_` key goes into Supabase > Edge Functions > Secrets as `STRIPE_SECRET_KEY`, nowhere else.
3. **Stripe's Apple Pay certificate.** Stripe Dashboard > Settings > Payment methods > Apple Pay > iOS certificates: download Stripe's CSR, make the certificate for the merchant ID in Apple Developer, upload it back. Without it Apple Pay is not offered; cards still are.
4. **Deploy** `supabase/functions/shop-checkout` as `shop-checkout`, as the head of that file says (it checks the session itself; its Verify JWT switch stays off).
5. **On a phone**, a Release build: a spirit's page shows both keys, a cocktail's one; Buy with Apple Pay, then with the test card 4242 4242 4242 4242 (any future date, any CVC); each ends on "Test order placed", and the payment shows in the Stripe Dashboard's test data. The sheet's key reads "Place test order" in Archivo. Close the sheet once: nothing is said. Tap Buy and go straight back: no sheet rises. Signed out: "Sign in to buy".

**Review notes for a TestFlight build with the flag on.** Beta App Review will see the key. `specs/v4.9/review-notes.txt` is not changed by this work; for that build, add a paragraph such as: "Spirit pages show Buy a bottle. It is a test-mode Stripe checkout for a fixed US$1.00 with no seller connected: no money is charged and nothing is shipped, and the app says so after the test order. It is switched off in App Store builds; any future sales would be by licensed retailers."

## 6. When the first supplier connects

Each is its own piece of work, and the App Store build turns the flag on only when all of them are done.

1. **The store sells, not Sipply.** Each licensed supplier becomes a Stripe Connect connected account. A destination charge (`transfer_data.destination`, `on_behalf_of` so the store is the merchant of record) or a direct charge on the store's account; Sipply's cut, if any, is `application_fee_amount`. The function keeps its shape: it picks the connected account from the offer instead of charging the platform. A store is onboarded through Connect's hosted link (Express accounts first), never by handing Sipply its keys.
2. **A real price.** An offers table (a migration: drink, store's connected account, price and currency, where it ships, in stock), read by the function. The phone still sends only the drink, and perhaps which offer; never a price. The page then shows the price and the store before the sheet.
3. **Shipping and legal age.** A shipping address (Stripe's address collection, or the SDK's AddressSheet), checked against where the store's licence lets it ship; a legal-age confirmation before checkout; and the ID check at delivery by the carrier (adult signature), which is the store's and the carrier's to do, and must be in the store's terms.
4. **A webhook.** `payment_intent.succeeded` and `.payment_failed` into an orders table with the store, the drink and the status; receipts, refunds and disputes from there. Only then may `allowsDelayedPaymentMethods` be true.
5. **The test-mode checks change, deliberately.** `isTestPublishableKey` and `readTicket`'s `test: true` give way to a live key and a live answer; "Place test order", "Sipply, test order" and the test-order confirmation are rewritten. Nothing else in the app should need to know.
6. **Apple and the policy.** App Privacy: Purchases (purchase history) and Contact Info (name, physical address, phone) linked to the account, for App Functionality, and app.json's privacy manifest to match; whatever Stripe's own manifest declares for payment data. The privacy policy (`docs/privacy.md`) names Stripe as the processor and the store as the seller. Review notes say who sells, under which licence, where it ships and how age is checked, with a demo account. The age rating questions about alcohol are answered again for a store that sells it. Read App Review guideline 1.4.3 and the legal section (5) before submitting; guideline 2.1 is also why the test checkout never goes to the App Store.

## 7. Checks

Run 29 Oct 2026 on the worktree, all passing:

```
npx tsc --noEmit
npx expo lint
node scripts/check-artwork.mjs      node scripts/check-contrast.mjs   node scripts/check-design.mjs
node scripts/check-ideas.mjs        node scripts/check-intro-dock.mjs node scripts/check-phone.mjs
node scripts/check-push.mjs         node scripts/check-recommend.mjs
node scripts/build-share-index.mjs --check   node scripts/build-drink-photos.mjs --check
node scripts/build-icons.mjs --check         node scripts/build-ground.mjs --check
python3 scripts/build-fonts.py --check       python3 scripts/build-numerals.py --check
node specs/v4.11/shop.test.mjs
node specs/v4.10/email-focus.test.mjs
npx expo export -p ios --output-dir <tmp>                                   (flag on)
EXPO_PUBLIC_SPIRIT_SHOP=off npx expo export -p ios --clear --output-dir <tmp>   (flag off, §3)
```

`scripts/check-native-links.sh` needs a built `.app`, so it waits for the archive.

`shop.test.mjs`, abridged:

```
1. The flag, EXPO_PUBLIC_SPIRIT_SHOP
ok   flag 'off': the Stripe SDK's require folded away, the shop's words folded away
ok   "Buy a bottle" is typed only behind the flag in shop.ts
ok   ShopHost loads the SDK only for a build with a key
ok   the SDK is required only from a binary that has its native module (TurboModuleRegistry.get('StripeSdk'))
2. Which drinks sell
ok   isSpirit: yes to all 1190 spirits, no to all 899 cocktails
3. The pinned bar, whole and split
ok   whole width: every one of 2089 names gets the bar's old label (BAR_NAME_MAX 22)
ok   split, default size: "Post this drink", "Post it again" and "Buy a bottle" fit one line from 375 to 440 (tightest: "Post this drink" at 375, 1.5pt to spare)
ok   split: no "Post <name> again" is kept where it would wrap (1190 spirits x 8 widths x 4 text sizes)
4. Test mode, checked on the phone
ok   the server's answer is shown only when well formed and marked test: true (12 of 12 cases)
ok   the phone sends no amount: shop-checkout gets the drink, and decides the price itself
5. Stripe's return link, the sheet key's face, and the failures by status
ok   the sheet's key is Archivo 600 by its PostScript name, ArchivoLatin-SemiBold (...), asked only once expo-font has it
6. One sheet at a time
ok   lib/shop runs one checkout at a time, app-wide: each waits for the one before it
ok   a checkout whose page has gone stops before the request, after the answer, and before the sheet
ok   the split's post key is disabled while Buy starts, so it dims and is spoken as dimmed rather than taking dead taps
```

With the SDK's require taken out from behind the flag, §1 fails on `off`, empty and unset, and on the require and label checks.

## 8. Files

- `src/lib/shop.ts` (new): the flag, the lazy SDK, the key, `offersBottle`, the words, `startSpiritCheckout`.
- `src/lib/shopCore.ts` (new, imports nothing): `isSpirit`, the test-mode checks, `readTicket`, `refusalOf`, the return link, `postKeyLabel` and `BAR_NAME_MAX`.
- `src/components/ShopHost.tsx` (new): StripeProvider and the return link.
- `src/components/DrinkPanels.tsx`: `PinnedPostBar` splits with `onBuy`; the label rule moved to shopCore.
- `src/app/drink/[id].tsx`: `onBuy` on a spirit with the flag on, the outcomes.
- `src/app/_layout.tsx`: mounts `ShopHost` with the flag on.
- `src/app/+native-intent.tsx`: keeps `drinkdex://stripe-redirect` off the router with the flag on.
- `app.json`: the Stripe plugin, `merchantIdentifier` and `enableGooglePay false`.
- `package.json`, `package-lock.json`: `@stripe/stripe-react-native` 0.64.0.
- `.env`: the flag (`on`) and the empty publishable key, with what each needs.
- `specs/v4.11/shop.md`, `specs/v4.11/shop.test.mjs`: this.
