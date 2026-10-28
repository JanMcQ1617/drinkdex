# v4.9 · Facebook sign-in goes live: Meta's Business verification, App Review and Publish (Jan's packet)

28 Oct 2026. The Meta app **Sipply** is in development mode, so Continue with Facebook works only for people with a role on that Meta app. Before **Publish**, Meta's dashboard now wants two things: **Business verification** of The Idealize L.L.C., and **App Review** of the permissions the app asks for. The first review asks for **email** and **public_profile** only. `user_friends` is dropped for now: it needs a screencast of its own, it is the hardest of the three to get approved, and friends can already be found by contacts, the Instagram list and username search. The app side of that decision is the flag in §1; everything after §1 is Jan's, on Meta's dashboard, in order.

| Piece | Where | Who, when |
|---|---|---|
| The friends flag, `EXPO_PUBLIC_FACEBOOK_FRIENDS=off` | `.env`; read in `src/lib/facebook.ts`, used by `src/store/auth.ts`, `src/components/FacebookFriends.tsx`, `src/app/settings.tsx` | Ships in build 34 |
| The words for people | `docs/privacy.md`, `docs/support.md`, `docs/data-deletion.md` (no friends list) | Live once `main` moves, before submitting (§2) |
| The words for Apple | `docs/appstore.md`, `docs/testflight.md` (notes on what to leave out with the flag off) | When build 34 goes to review |
| Business verification | Meta, the business portfolio | Jan (§4) |
| App Review: email, public_profile | Meta, App Review | Jan (§5) |
| Publish, then the outside test | Meta, then a phone | Jan (§6) |

Rules that hold everywhere:

- **Ask for exactly what is submitted.** The build the reviewer installs asks Facebook for `public_profile` and `email` and nothing else. Build 33 and every build before it still ask for `user_friends`, so nothing is submitted until a build made with the flag off is on the public TestFlight link (§2).
- **App Store 1.4.3 binds the screencast too.** It shows signing in, the username step, the profile and Settings. No drink is poured, ordered or held up, no count or streak is on screen, and no caption says anything about drinking.
- **Jan does every upload, click and agreement on Meta himself.** Nothing on Meta's dashboard has been touched from here. No identifier number of The Idealize L.L.C. is written in this file; §4 says where the documents are.

---

## 1. The app: Friends from Facebook behind a flag

`FACEBOOK_FRIENDS_ENABLED` in `src/lib/facebook.ts` is `process.env.EXPO_PUBLIC_FACEBOOK_FRIENDS === 'on'`, read with static dot access like the sign-in flags in `store/auth.ts`, so Expo inlines it and unset means off. `.env` gains one line, `EXPO_PUBLIC_FACEBOOK_FRIENDS=off`. Off means:

- **The dialog.** `SCOPES` is `public_profile email`, so Facebook's page lists the name and profile picture and the email address, and never a friends list. `auth_type=rerequest` stays: it also re-asks for an email address someone unticked the first time.
- **Graph.** `syncFacebookFriends` returns false before it reads a token, so neither `/me/friends` nor `/me/permissions` is ever called, and `match_facebook_friends` is never reached. `fetchFacebookFriends` answers null.
- **The token.** `store/auth.ts` hands `finishOAuth` no `onProviderToken` for Facebook (`onFacebookToken` is `undefined`), so Facebook's token is dropped there unread, as Google's is; `holdFacebookToken` refuses it too.
- **The screens.** `FacebookFriends` is a wrapper that renders nothing, so Find friends (and the welcome step at signup, which draws the same component) goes from contacts straight to Let friends find you: no section, no Connect Facebook, no gap, and no read of a list an earlier build left on the phone. Settings' Find friends hint drops "Facebook". Sign-out still clears any such leftover list.
- **What does not change.** Continue with Facebook itself is `EXPO_PUBLIC_FACEBOOK_SIGN_IN`'s, and still shows only beside Apple (4.8). Every friends line of code stays where it was: `on` restores it exactly (§7).

Checked 28 Oct 2026 with the flag off: `tsc`, `expo lint`, every `scripts/check-*` and `--check`, and `expo export -p ios` all pass, and the exported bundle holds the scope string `public_profile email` and not `public_profile email user_friends` (the friends code is still in it, never reached).

## 2. Before anything on Meta

1. **Build 34, with these three flags.** In `.env`: `EXPO_PUBLIC_APPLE_SIGN_IN=on`, `EXPO_PUBLIC_FACEBOOK_SIGN_IN=on`, `EXPO_PUBLIC_FACEBOOK_FRIENDS=off`. Archive and upload as usual (`scripts/build-ios.sh archive`), and wait until the public link `https://testflight.apple.com/join/1T5KAfkz` serves build 34, not 33.
2. **Check it on your own phone** (you have a role, so Facebook works for you in development mode). Sign out, then Continue with Facebook: Facebook's page lists **name and profile picture** and **email address**, and **no friends list**. Profile → "..." → Settings → Find friends: no Friends from Facebook section, and no space where it was.
3. **Publish the words.** Pages serves `/docs` from `main`, so merge, then open `https://janmcq1617.github.io/drinkdex/privacy`, `/support` and `/data-deletion` and check they say nothing about reading a friends list (privacy's Facebook paragraph ends "Not your friends list"). Meta reads the privacy policy during review, and a policy that still describes `user_friends` contradicts a submission without it.

## 3. Meta app settings: the checklist

What the repo shows: the iOS bundle id is `com.janmcqueeny.drinkdex` (`app.json` → `ios.bundleIdentifier`). There is no Facebook SDK, no `FacebookAppID` and no `fb…` URL scheme: Continue with Facebook is Facebook's web login dialog, opened by Supabase in iOS's sign-in sheet (`lib/oauth.ts`), returning through Supabase's callback to `drinkdex://auth/callback`. Whether the Meta app already has an iOS platform cannot be seen from here; check it.

**App settings → Basic**

- [ ] **App icon** (1024 × 1024), **Category** (Lifestyle fits), **Contact email** one you read.
- [ ] **Privacy Policy URL** `https://janmcq1617.github.io/drinkdex/privacy`, **Terms of Service URL** `https://janmcq1617.github.io/drinkdex/terms`, **User data deletion → Data deletion instructions URL** `https://janmcq1617.github.io/drinkdex/data-deletion` (as `docs/appstore.md`, "Meta app settings").
- [ ] **iOS platform.** If there is no iOS section at the bottom, **Add platform → iOS**. **Bundle ID** exactly `com.janmcqueeny.drinkdex`. **iPhone Store ID**: App Store Connect → Sipply → App Information → **Apple ID** (fill it only if Meta insists; the app is not on the App Store yet). **Single Sign On**: off (there is no SDK, so the Facebook app never hands back to Sipply). **URL Scheme Suffix** and **Shared Secret**: empty. Save. With an iOS platform, App Review asks for a Simulator build (§5.4).
- [ ] **Business portfolio**: the app is connected to The Idealize's portfolio (the.idealize), the one §4 verifies.

**App settings → Advanced**

- [ ] **Age restriction**: **Alcohol-related**, if offered (otherwise 18+). Sipply is an alcohol reference for adults, and the App Store rates it 18+.

**Use cases → Authenticate and request data from users with Facebook Login → Customize**

- [ ] **Permissions**: **email** and **public_profile** only. If `user_friends` is listed, **Remove** it here (§5.1 removes it from the review request).
- [ ] **Settings**: Client OAuth login **Yes**; Web OAuth login **Yes**; Enforce HTTPS **Yes**; Use Strict Mode for redirect URIs **Yes**; Embedded browser OAuth login **No** (iOS's sheet is the system browser, not an embedded web view); Login with the JavaScript SDK **No**.
- [ ] **Valid OAuth Redirect URIs** holds exactly the Callback URL shown on Supabase → Authentication → Sign In / Providers → Facebook (`https://<project-ref>.supabase.co/auth/v1/callback`). `drinkdex://auth/callback` does not go here: it is Supabase's Redirect URLs entry, already set.
- [ ] **Deauthorize callback URL**: empty. Nothing listens for it, and removing Sipply in Facebook only stops Facebook sending more (`docs/data-deletion.md`).

## 4. Business verification (Jan uploads, Meta decides)

Where: the app's **App Review → Requests** shows "Business verification required" with **Start verification**, or Meta Business Suite → **Settings → Business info / Security Centre → Start verification** for the.idealize. Either leads to the same form.

What Meta asks for:

1. **The business details**: the legal name, address, phone number and website. Type the name exactly as the certificate of formation prints it, punctuation included (The Idealize L.L.C.), and the address exactly as the document you upload for it prints it, ZIP code included. Website: `https://theidealizepr.com`, which shows the name. If Meta asks for a tax or registration number, type it from the IRS letter or the certificate; it is never written down here.
2. **A document that proves the legal name**, and, when that document does not show the address, **one that proves the address** (or the phone number). Names must match what you typed. What fits, and where it is:
   - **Legal name**: the Puerto Rico Department of State **Certificate of Formation**, or its **Certificado de Organización** or **Certificado de Entidad Jurídica**, and the **IRS EIN letter (CP 575)**. All four are in OneDrive, `Claude Shit/02-Idealize/legal/01-Formacion-LLC/`, dated 18 Sep 2026. Prefer the English ones (Certificate of Formation, CP 575).
   - **Address**: the CP 575 letter shows the name and the mailing address together, and is often enough for both. Otherwise a **utility bill** or a **bank statement** for the LLC's own account, in the LLC's name, at the same address; Jan has those, not this folder.
   - The certificate's duplicated surname on the authorized person does not matter here: Meta checks the business's name and address, not the organizer's.
3. **A way to confirm contact**: a code to an email at the website's domain (an `@theidealizepr.com` address is the quickest), a call or text to the business phone, or domain verification of theidealizepr.com. Pick the email.

Meta says a decision can take up to two weeks; it emails the result. A refusal names the mismatch (nearly always the name or the address written differently from the document): fix that one field and send again.

## 5. App Review: the submission

### 5.1 Take `user_friends` out

**App Review → Requests → New requests**: on the `user_friends` row, the **trash icon**, then confirm. Only **email** and **public_profile** stay. If the use case still lists it, remove it there too (§3). Adding it back later is §7.

### 5.2 "How will your app use this permission?" (paste as is)

Meta wants one description per permission. Each also has the box "I agree that I will use any data I receive … in accordance with the allowed usage": tick it.

**email**

> Sipply is an iOS app: a field guide to cocktails and spirits, where people keep a record of the drinks they have had and follow their friends. People can create or open their Sipply account with Continue with Facebook. We use the email address only as the email of that Sipply account: it lets Sipply recognise the account, so that someone who later types that address on the sign-in screen is told the address belongs to an account that signs in another way (Apple, Google, Facebook or a phone number), so no second account is made, and it is where a confirmation link goes if the account needs one. It is never shown to other users, never used for marketing and never shared or sold. The screencast shows the Facebook dialog asking for it, and Sipply recognising the address after signing out (0:55 to 1:20).

**public_profile**

> Sipply uses public_profile to create and sign in to the person's Sipply account. The app-scoped user ID links the Facebook login to one Sipply account, so the same Facebook account always opens the same Sipply account. The name fills the Display name field on Sipply's Choose a username screen, where the person can change it before continuing; other Sipply users see the display name on that person's profile. Sipply does not show or copy the profile picture, never posts to Facebook and asks for nothing else. The screencast shows the Facebook dialog, the name filled in, and the profile afterwards (0:10 to 0:55).

### 5.3 Reviewer instructions (App verification details; paste as is)

> Sipply is an iOS app in public beta on TestFlight. Meta test users can sign in while the app is in development mode.
>
> 1. On an iPhone, install TestFlight from the App Store, then open https://testflight.apple.com/join/1T5KAfkz on that iPhone, tap Accept, then Install. Open Sipply. A short intro plays first.
> 2. On the welcome screen, tap "I already have an account". The screen "Sign in or join Sipply" lists Continue with Apple, Continue with Google and Continue with Facebook.
> 3. Tap Continue with Facebook. iOS asks whether Sipply may use "supabase.co" to sign in (our sign-in provider); tap Continue.
> 4. Facebook's login dialog opens. Log in with a test user. The dialog asks for the name and profile picture (public_profile) and the email address (email) only. Tap Continue.
> 5. Back in Sipply, the new account opens on "Choose a username". The Display name is already filled with the Facebook name (public_profile). Type any username and tap Continue, then Continue again on "Find your people".
> 6. The Profile tab (the last one, at the right of the tab bar) shows that display name.
> 7. To see the email in use: Profile → "..." (top right) → Settings → Sign out, and Sign out again to confirm. On "Welcome back" (open the Profile tab if it is not showing), tap "Use another way", then Continue with email, type the test user's email address and continue. Sipply answers that the address belongs to an account that signs in another way, because it is that account's email. Go back and tap Continue with Facebook: the same account opens, with no username step.
> 8. To delete the account and everything Facebook sent: Profile → "..." → Settings → Delete account.
>
> There is no Facebook SDK in the app: Facebook's login dialog runs in iOS's own sign-in sheet. Sipply never posts to Facebook. The app is for adults (it is rated 18+): if a test user is under the drinking age, use one that is not.

No credentials go with it: Meta tests with its own test users, and says never to give a personal Facebook login.

### 5.4 The Simulator build (because the Meta app has an iOS platform)

Meta's page for iOS apps asks for a Simulator build, a `.app` file, tested in Xcode's Simulator first, uploaded under **Upload a Simulator Build File** in the request. Its pages say nothing about TestFlight in its place, so give both: the build, and the TestFlight steps above.

`scripts/build-ios.sh sim` already makes one: Release, unsigned, installed on a booted Simulator. It costs this Mac a lot of memory and an Xcode run, which is why it waits until the build itself is the goal, as here.

1. Take the build lock: `scripts/build-lock.sh acquire "meta review sim"`. Same `.env` as build 34 (§2.1).
2. Boot a Simulator: Xcode → Open Developer Tool → Simulator, any iPhone.
3. `scripts/build-ios.sh sim`, then `scripts/build-lock.sh release`.
4. In the Simulator: welcome → I already have an account → Continue with Facebook → log in with your own Facebook account (development mode lets only roles in) → back to Sipply. If Continue with Facebook does not complete there, do not upload; say so in the instructions and rely on TestFlight. Sign in with Apple may fail in an unsigned build; Meta does not test it.
5. Upload `ios/build-sim/Build/Products/Release-iphonesimulator/Sipply.app`. A `.app` is a folder: if the file picker will not take it, compress it (right-click → Compress, giving `Sipply.app.zip`) and upload that; Meta's older guide asked for exactly that. Meta deletes it three weeks after review. `ios/build-sim` is gitignored and can go afterwards.

### 5.5 Data handling questions (asked once Business verification passes)

- **Data processors or service providers with access to the Platform Data**: Yes. **Supabase, Inc.** (United States): it hosts the database and runs sign-in, so the name, email and app-scoped id pass through it. Nobody else receives them: GitHub Pages hosts only the web pages, Expo only app updates, Twilio only phone sign-in.
- **Who is responsible for the Platform Data**: The Idealize L.L.C., with the same country and address as Business verification (Meta lists Puerto Rico as its own entry; use whichever the verification used).
- **National security requests in the past 12 months**: No.
- **Policies for requests from public authorities**: tick only what is true of The Idealize today. With nothing written down yet, **None of the above** is the honest answer; writing a short policy first (review each request's legality, challenge unlawful ones, disclose the minimum, keep a record) would let you tick all four.

### 5.6 The screencast (Jan's phone, 60 to 90 s)

Meta follows the recording when it tests, rejects a permission with no recording, wants 1080 or better and an English interface, and does not listen to audio. One recording serves both permissions: upload the same file under each.

**Before recording**: iPhone in English; Do Not Disturb on; a **Meta test user** (App roles → Test users) rather than your own Facebook account, so no personal name or email is on video, and one with no Sipply account yet, so the username step appears; Sipply freshly installed from TestFlight (build 34) or signed out with Welcome back's "Not you? Forget this account" done. Start Control Center → Screen Recording.

**Shot list and script**

| Time | On screen | Do | Says (caption, optional) |
|---|---|---|---|
| 0:00–0:10 | Sipply's welcome screen | Tap "I already have an account" | "Sipply's sign-in" |
| 0:10–0:15 | "Sign in or join Sipply" with Continue with Facebook | Hold 2 s on the Facebook row, tap it | "The Facebook Login button" |
| 0:15–0:20 | iOS: Sipply wants to use "supabase.co" to sign in | Tap Continue | "iOS's own sign-in sheet; no Facebook SDK" |
| 0:20–0:40 | Facebook's login, then its permission screen | Log in as the test user; **hold 3 s** on the screen listing name and profile picture, email address; tap Continue | "Requested: public_profile and email only" |
| 0:40–0:55 | Choose a username, Display name already filled | Hold 2 s on the name, type a username, Continue; Continue on Find your people; open the Profile tab | "public_profile: the Facebook name becomes the display name" |
| 0:55–1:20 | Settings, Welcome back, Continue with email | "..." → Settings → Sign out (twice: the row, then the alert) → Use another way → Continue with email → type the test user's email → continue; hold on "Sign in another way" | "email: Sipply recognises the account's address" |
| 1:20–1:30 | Welcome back | Go back, Continue with Facebook: the profile opens, no username step | "Same Facebook account, same Sipply account" |

Trim the start and end in Photos. If the email lookup answers "Enter your password" instead of "Sign in another way", it was rate limited: wait an hour and record again, rather than submit a recording that does not show it. Captions need an editor (iMovie); without them the timings in §5.2 tell the reviewer what each part shows.

### 5.7 Submit

Every row of the request green (Business verification, platform settings, App verification details, data handling, each permission's description, agreement and screencast), then **Submit for review**. Meta emails the decision. A rejection names the permission and the reason; the usual ones are a login button the reviewer could not reach (check the TestFlight link still serves build 34 and the Simulator build signs in) or a screencast that does not show the data being used.

## 6. After approval

1. **Publish.** The dashboard's **Publish** (the App Mode switch from Development to Live). Keep the privacy and data deletion URLs answering afterwards: Meta checks them and can restrict a live app whose policy 404s.
2. **Test with an account that has no role on the Meta app** (someone else's real Facebook account, on their iPhone or yours after they sign in there), on build 34 from the public link: Continue with Facebook, the dialog lists name and profile picture and email only, Choose a username, the profile. Then Supabase → Authentication → Users: the new user shows Facebook as its provider. Your own role account keeps working either way.
3. **The App Store copy.** The Meta app is Live, so What's New can say "Sign in with Apple, Google or Facebook." (`docs/appstore.md`). The description's Facebook paragraph and the TestFlight "Friends from Facebook" item stay out while the friends flag is off, and the review notes' third-party paragraph says "public_profile and email" (`docs/testflight.md`).

## 7. Adding `user_friends` back later

1. **Meta first.** Use cases → Facebook Login → Customize → Permissions → add **user_friends**, then request it in App Review with its own description and screencast: sign in with Facebook (the dialog now lists the friends list), then Find friends → Friends from Facebook showing a friend who also connected Sipply. That needs two test users who are Facebook friends of each other and have both granted `user_friends`. Until approval only roles get a list; everyone else sees "Facebook did not share your friends list."
2. **The app.** In `.env`, `EXPO_PUBLIC_FACEBOOK_FRIENDS=on`, the only line to change: the scopes, Graph, the token, the section and the Settings hint all come back as they were. JS-only, so an EAS Update on the build's channel or the next build carries it.
3. **The words.** Put the friends wording back in `docs/privacy.md` (the Continue with Facebook paragraph, the matching limits' Facebook sentence, On your device, Meta, the deletion list), `docs/support.md` (Why do I only see some of my Facebook friends?) and `docs/data-deletion.md`. The wording to restore is the version before the commit that turned the flag off: `git log -p -- docs/privacy.md` finds it, and at the time of writing it is `c10e7a4`'s (`git show c10e7a4:docs/privacy.md`). Then the notes in `docs/appstore.md` and `docs/testflight.md` flip back: the PEOPLE paragraph, the Friends from Facebook item, and `user_friends` in the third-party paragraphs. App Privacy's answers do not change.
4. `.env`'s own comment, step 6 ("Meta App Review for the user_friends permission"), was left as it was, as asked; it is now the step for this section, not for sign-in.

## 8. Not verified here

- Meta's dashboard itself: labels and menus move, and nothing there was opened. Whether the iOS platform is set, what the use case lists and whether email and public_profile really need review (rather than standard access) are as the task describes them.
- Whether Meta's reviewers accept the TestFlight link without the Simulator build; Meta's iOS page documents only the build.
- Whether `Continue with Facebook` completes in an unsigned Simulator build (§5.4 step 4 is the check).
- The values in `.env`: only names were read, plus the one line appended.
- The privacy policy does not name The Idealize L.L.C. as the app's operator. Meta does not ask it to; if a reviewer asks who runs the app, it is the verified business.
