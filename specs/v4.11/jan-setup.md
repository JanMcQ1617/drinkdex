# v4.11 · Jan's setup for Buy a bottle

29 Oct 2026. Three parts, in this order. About 20 minutes. Do them before build 37 is built: the app reads the Stripe key when it is built, not when it runs.

> **Every key on this page is a TEST key.** The app gets one that starts `pk_test_`. Supabase gets one that starts `sk_test_`. Never a `pk_live_` or `sk_live_` until a store is live. The server refuses an `sk_live_` key anyway, so a mistake charges nobody.

---

## a. Apple: the merchant ID

1. Go to developer.apple.com/account and sign in.
2. Click **Certificates, IDs & Profiles**.
3. Click **Identifiers** on the left.
4. Click the blue **+** next to the title.
5. Choose **Merchant IDs**. Click **Continue**.
6. Description: `Sipply`
7. Identifier: `merchant.com.janmcqueeny.drinkdex`
8. Click **Continue**, then **Register**.

Now turn Apple Pay on for the app itself, with that merchant ID:

9. Still in **Identifiers**, switch the list at the top right to **App IDs**.
10. Click `com.janmcqueeny.drinkdex`.
11. In the **Capabilities** list, tick **Apple Pay Payment Processing**.
12. Click **Configure** (or **Edit**) beside it. Tick `merchant.com.janmcqueeny.drinkdex`. Click **Continue**, then **Save**, until the box closes.
13. Click **Save** at the top right of the page. If Apple warns that this changes the app's capabilities, click **Confirm**. The next build makes new profiles on its own.

Automatic signing might have done steps 9 to 13 itself, but if it does not, the archive fails at signing about 40 minutes in. Doing it by hand first costs a minute and does no harm.

Keep this tab open. Part b comes back to it.

## b. Stripe: the Apple Pay certificate

Stripe makes a request file, Apple signs it, Stripe gets the signed file back.

1. Go to dashboard.stripe.com and sign in to **The Idealize**'s account.
2. Turn on **Test mode** (the switch at the top right). The page says Test mode.
3. Click **Settings** (the gear), then **Payment methods**. (If Stripe puts it under Settings → Payments → Payment methods, it is the same page.)
4. Find **Apple Pay** and open its settings.
5. In the iOS certificates part, click **Add new application**.
6. Download the file Stripe gives you. It ends in `.certSigningRequest`.
7. Go back to the Apple tab. **Identifiers**, then at the top right switch **App IDs** to **Merchant IDs**.
8. Click `merchant.com.janmcqueeny.drinkdex`.
9. Under **Apple Pay Payment Processing Certificate**, click **Create Certificate**.
10. Apple asks if payments will be processed only in China mainland. Choose **No**. Click **Continue**.
11. Click **Choose File**, pick the `.certSigningRequest` from step 6, click **Continue**.
12. Click **Download**. You get a `.cer` file.
13. Go back to Stripe, to the same Apple Pay page. Upload the `.cer` file.
14. Stripe now lists the certificate. Done.

## c. The two keys

Still in Stripe, still in **Test mode**.

1. Click **Developers**, then **API keys**.
2. **Publishable key.** It starts `pk_test_`. Copy it.
3. Run this in Terminal. It asks for the key: paste it and press Return. It only accepts a `pk_test_` key, and it writes it into the app's `.env`.

   ```sh
   if cd ~/Projects/drinkdex-worktrees/polish; then
     printf 'Paste the Stripe TEST publishable key (pk_test_...), then press Return: '
     read -r PK
     PK=$(printf '%s' "$PK" | tr -d '[:space:]')
     if printf '%s' "$PK" | grep -Eq '^pk_test_[A-Za-z0-9]{20,}$'; then
       if grep -q '^EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=' .env; then
         sed -i '' "s|^EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=.*|EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=$PK|" .env
       else
         printf '\nEXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=%s\n' "$PK" >> .env
       fi
       echo "Saved: $(grep '^EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=' .env | cut -c1-48)..."
     else
       echo 'That is not a pk_test_ key. Nothing was changed.'
     fi
   fi
   ```

   It should print `Saved: EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...`. A publishable key is made to sit inside an app, so it is fine in `.env`.
4. **Secret key.** Click **Reveal test key**. It starts `sk_test_`. Copy it.
5. Go to the Supabase Dashboard and open the Sipply project.
6. Click **Edge Functions**, then **Secrets**.
7. Add a secret. Name: `STRIPE_SECRET_KEY`. Value: paste the `sk_test_` key. Save.
8. The secret key goes **only** there. Not in `.env`, not in a chat, not in the repo.

## Then

- Deploy the function and run the two curl checks: `server-shop-checkout.md` §3 and §5.
- Build 37 needs a fresh `ios/` folder: `scripts/build-ios.sh` reuses one that is already there, and an old one has no Stripe and no Apple Pay. So either build from a worktree that has no `ios/` folder (like `drinkdex-worktrees/polish` today), or first run `LANG=en_US.UTF-8 npx expo prebuild -p ios --clean` in the checkout you build from. Without it the build still runs, but Buy a bottle only ever says "Not set up yet".
- Build 37 is built with `EXPO_PUBLIC_SPIRIT_SHOP=on`, for TestFlight. The App Store build is built with it off, until a licensed store and real payments are live.
- On build 37, buy Campari with the test card `4242 4242 4242 4242` (any future date, any CVC), then with Apple Pay. In test mode Stripe never charges your real card. Both show up in Stripe's Dashboard, in Test mode, under **Payments**.
