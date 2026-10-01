# 02: Sign-in and sign-up screen

Status: ready to build. Phase: spec only. Nothing here has been implemented.

Reference 1 (`images/1.png`) supplies the layout only. That means a title bar with a close control, a hairline under it, one bordered group that stacks two rows (country over phone number), a helper line, a full-width filled Continue, an "or" rule, and then full-width OUTLINED buttons, each with a leading mark. Nothing comes from the reference's identity: not its colour, not its copy, not its wordmark. All copy below is our own.

> **Cross-check reconciliation (30 Sep 2026). Binding; it overrides the sections below wherever they differ.** File ownership is in `00-build-plan.md`: the data half of this spec (store, flow store, oauth, phone, countries, check script, `+native-intent`) is package **B3** in stage 1; the screens (`AuthGate`, `components/auth/*`, `WelcomeConnect`, `user/[id]`) are package **C2** in stage 2. Shared files are not edited here: `theme.ts`, `icons.tsx`, `ui.tsx` (A1 adds `googleBlue/Green/Yellow/Red`, `mail`, `GoogleMark`, `haptic.error`), `database.types.ts` and the migration (A2), `FindFriends.tsx` (C7 makes the §9.3 prefill), `.env` (B1 adds the §3 block verbatim), docs (C8).
> 1. **Primitives come from `01-design-v2.md`.** `auth/FieldGroup.tsx` is **not created**: use `FieldGroup`, `SelectField` and `Field` from `ui.tsx` (01 §5.3–5.4). Each row rings itself (2pt `lineInk` focus, 2pt `danger` error, drawn as an overlay), not one border around the group; idle edge is `lineControl` (same value as `textFaint`). The read-only email row is `Field` with `editable={false}` and `trailing` "Change" (01 §5.3).
> 2. **`AuthTitleBar` wraps `ScreenTopBar`** (`size="md"`, 44pt row, `showRule` always, rule `line`, `left` = `TopBarButton close|chevronLeft`, `titleRef` for VoiceOver focus; the country picker passes `inset="sheet"`). Not 56pt, not `borderStrong`.
> 3. **Continue is `Button` md at 48**, with no `borderRadius` override (Button is already `radius.control`). **`ProviderButton` is a thin wrapper over `Button variant="secondary" block leading={mark}`** (01 §5.1: mark pinned at `left: 16`, label centred). Busy: `leading={<ActivityIndicator size="small" color={colors.text} />}`. Inert: keep full strength, so pass `onPress={noop}` and `accessibilityState={{ disabled: true }}` rather than `disabled` (which fades to 0.42).
> 4. **No step animation.** §5.2's `Animated.View entering={FadeIn} exiting={FadeOut}` is removed: it breaks 06 lint rule 3 and is exactly the `exiting` ghost-view bug 06 §3.8 fixes. Steps swap instantly (a `View` keyed on `step + emailStatus`).
> 5. **Gate waits use `Hold`** (01 §5.17, which is 06's `GateHold`), not `AuthWait`. The merged `AuthGate` body (02 render order + 06's bounded row wait) is §9.1 below.
> 6. **Gutters `layout.gutter` (16)**, separators `line`, country-picker headers `SectionHeader size="group"` (sentence case: uppercase is lint-banned), picker rows take `ListRow` metrics (52pt).
> 7. **Code cells:** 1pt `lineControl` edge; the cell that takes the next digit draws a 2pt `lineInk` overlay ring while the input is focused (not wine); all six draw a 2pt `danger` ring in the error state. Radius `control`.
> 8. **Migration number is 016**: `supabase/migrations/016_sign_in_lookup.sql`, version `'016_sign_in_lookup'`. It is the only one of 016–019 that must be applied before the release build reaches anyone.
> 9. **Every pushed or modal route that wraps `AuthGate`** (03's `/activity`, `/saved`, `/post/[id]`, `/connections/[id]`, `/pours/[authorId]`; 05's `/record`, `/reel/[id]`; 02's `/user/[id]`) passes `onClose={() => (router.canGoBack() ? router.back() : router.replace('/dex'))}`. Only the tabs use the default (`/dex`).

---

## 0. Decisions at a glance

1. **Inline, not a modal route.** `AuthGate` keeps rendering sign-in in place inside the gated scenes (Home, Profile, `/user/[id]`), and the new screen draws the sheet's anatomy itself. Why: a native modal would surface above the cold-start intro overlay (spec for the intro), and close already has an honest destination, the Dex, which works signed out.
2. **One flow, shared by every gate.** A new in-memory zustand store, `src/store/signInFlow.ts`, holds the step and the typed values. Home and Profile then show the same step and the same digits, where today each gated tab mounts its own `AuthForm` with its own state.
3. **Every new account, email included, goes through the existing username step.** Email sign-up now sends only email and password, so `handle_new_user` (migration 015) gives it the `pour_xxxxxxxx` placeholder and `ChooseUsername` asks for the handle. Why: one path for all five methods, and a taken username comes back as a clean `23505` from `updateProfile` rather than the opaque signup 500 that `humanizeSignUp` has to guess at.
4. **Email first, then password, with real detection.** A new metered RPC, `public.sign_in_method(e)`, answers `new | password | other`. This adds no new disclosure. GoTrue's public `/signup` already answers the same question for anyone who asks (`user_already_exists`, or a user with no identities when confirmations are on). The RPC is metered tighter than that endpoint. If the meter refuses, the client falls back to a password step that offers both paths.
5. **Phone uses Supabase's own OTP**: `signInWithOtp({ phone })` then `verifyOtp({ phone, token, type: 'sms' })`. The SMS provider is **Twilio Verify**, because it generates and rate-limits codes itself, has Fraud Guard against SMS pumping, and needs no US A2P 10DLC sender registration. MessageBird is not used.
6. **Google reuses the Facebook browser leg.** `signInWithOAuth` plus `WebBrowser.openAuthSessionAsync` on the implicit flow, with `flowType` untouched. The browser leg moves from `lib/facebook.ts` into a new `lib/oauth.ts` that both providers call. No new native module. Google's provider token is dropped, never held.
7. **All four alternate methods are outlined rows of one component**, including Apple. Apple's mark is the system's own SF Symbol `apple.logo` through `expo-symbols`, which is already a dependency. Nothing is redrawn. Custom outlined "Continue with Apple" rows with a leading logo are a pattern App Review accepts, and the reference app ships exactly that.
8. **Flags.** `EXPO_PUBLIC_PHONE_SIGN_IN` and `EXPO_PUBLIC_GOOGLE_SIGN_IN` are new. Google and Facebook render only when the Apple row renders (guideline 4.8). Phone and email are first-party and are not subject to 4.8. With the phone flag off, the top group becomes the email field and the layout is unchanged.
9. **No flag emoji anywhere.** The country picker shows English names and `+dial` text, with an optional ISO code in search. The list is bundled in `src/data/countries.ts` and adds no dependency.
10. **New native modules: none.**

---

## 1. Scope

In scope:
- The signed-out screen and its steps: entry, phone code, email, password (four variants), reset.
- The country picker.
- The two new provider paths, phone and Google.
- The restyle of the Apple and Facebook buttons into outlined rows.
- The email lookup RPC.
- `AuthGate` render order.
- The light restyle of `ChooseUsername`.
- Prefilling the verified number in Find friends.
- Docs and setup.

Out of scope:
- Linking a phone account to an existing email account. These stay two accounts, and no UI merges them.
- CAPTCHA.
- Changing `PasswordResetOverlay`. It keeps working untouched, because `AuthMessage` stays exported from `AuthGate`.
- Hiding the tab bar on the signed-out screen. That file belongs to the tab-bar/design specs.
- Android polish beyond "it works". Apple, Google and Facebook are hidden there by the 4.8 rule exactly as Facebook is today.

---

## 2. Files

Owner "auth" means the engineer building this spec. Files marked **shared** are also edited by other specs in this batch. Keep those edits additive and small so the merges stay trivial.

| File | Action | Owner | What |
|---|---|---|---|
| `src/components/auth/SignInScreen.tsx` | create | auth | Step router plus the entry step. Default export `SignInScreen({ onClose })`. |
| `src/components/auth/AuthTitleBar.tsx` | create | auth | Title bar: leading control (close, back or none), centred title, hairline. |
| ~~`src/components/auth/FieldGroup.tsx`~~ | **not created** | — | Use `FieldGroup` / `SelectField` / `Field` from `ui.tsx` (01 §5.4). Where this spec says `GroupRow` read `SelectField`; `GroupInput` read `Field`; `GroupDivider` is drawn by `FieldGroup`. |
| `src/components/auth/ProviderButton.tsx` | create | auth | Thin wrapper over `Button variant="secondary" block leading={mark}`: method → mark + label + busy/inert (reconciliation 3). |
| `src/components/auth/PhoneCodeStep.tsx` | create | auth | The 6-digit code step. |
| `src/components/auth/EmailSteps.tsx` | create | auth | `EmailStep`, `PasswordStep` (four variants), `ResetStep`. |
| `src/components/auth/CountryPicker.tsx` | create | auth | Searchable country sheet (RN `Modal`, pageSheet). |
| `src/components/auth/Consent.tsx` | create | auth | `Consent` moved out of `AuthGate` unchanged, along with `TERMS_URL` and `PRIVACY_URL`. |
| `src/store/signInFlow.ts` | create | auth | Flow state machine (§5.1). |
| `src/lib/oauth.ts` | create | auth | Browser leg shared by Google and Facebook (§8.1). |
| `src/lib/phone.ts` | create | auth | E.164 building, formatting and validation. **No imports** (§6.2), so the node check can load it. |
| `src/data/countries.ts` | create | auth | Bundled list plus `deviceRegion()` (§6.1). |
| `scripts/check-phone.mjs` | create | auth | Assertion table for `lib/phone.ts` (§17). |
| `supabase/migrations/016_sign_in_lookup.sql` | create | A2 (00) | Number fixed by the cross-check: 016 sign-in lookup, 017 home and profile (03), 018 drink submissions (04), 019 reels (05), 020 places (07, deferred). |
| `src/components/AuthGate.tsx` | change | auth (C2) | Remove `AuthForm`, `SocialSignIn`, `FacebookButton`, `useAppleSignIn`, `BRAND_BUTTON_HEIGHT`, `signsInSocially`, the lockup image and `Consent`, which moves. Render `SignInScreen`. Add the `onClose` prop. Use `Hold` (no `AuthWait`) and 06's bounded row wait: the merged body is §9.1. Restyle `ChooseUsername` (§9.2). Keep exporting `AuthMessage`. |
| `src/store/auth.ts` | change | auth (B3) | New flags, `signUpEmail(email, password)` (the new `signUp`; §7.3 explains the name), `sendPhoneCode`, `verifyPhoneCode`, `lookupEmail`, `signInWithGoogle`, and `finishFacebook` generalized to `finishOAuth`. Phone and Google error copy. Reset the flow store on sign-in and sign-out (§7, §8). |
| `src/lib/facebook.ts` | change | auth | Browser leg moved to `lib/oauth.ts`. `openFacebookAuth(mode)` becomes a thin wrapper. The friends code is untouched. |
| `src/app/+native-intent.tsx` | change | auth | Import `AUTH_CALLBACK_PATH` from `@/lib/oauth`. |
| `src/app/user/[id].tsx` | change | auth | Pass `onClose={leave}` to both `<AuthGate>` uses. |
| `src/lib/database.types.ts` | change | auth | Add the `sign_in_method` function type. |
| `src/components/FindFriends.tsx` | change (**shared**) | C7 (00) | Prefill the "make yourself findable" phone field from `session.user.phone` (§9.3). Three lines. |
| `src/constants/theme.ts` | change (**shared**) | A1 (00) | The four Google mark colours. `radius.control` (8) comes from 01. |
| `src/components/icons.tsx` | change (**shared**) | A1 (00) | The outline `mail` icon and a separate `GoogleMark` component (§4.6). |
| `src/components/ui.tsx` | change (**shared**) | A1 (00) | `haptic.error` (one key). |
| `.env` | change | B1 (00) | Two new flags with a setup comment block (§3), pasted verbatim. |
| `docs/privacy.md`, `docs/appstore.md`, `docs/testflight.md` | change | C8 (00) | §16. |

Not changed: `app.json` (phone and Google need no native config, and `expo-symbols` needs no plugin), `lib/supabase.ts` (`flowType` stays implicit), `PasswordResetOverlay.tsx`, `lib/recovery.ts`, `FloatingTabBar.tsx`.

---

## 3. Flags and which controls render

`src/store/auth.ts`, next to the two existing flags. They use static dot access so Expo inlines them:

```ts
export const PHONE_SIGN_IN_ENABLED = process.env.EXPO_PUBLIC_PHONE_SIGN_IN === 'on';
export const GOOGLE_SIGN_IN_ENABLED = process.env.EXPO_PUBLIC_GOOGLE_SIGN_IN === 'on';
```

`SignInScreen` derives what to show from one hook, `useMethods()`:

```ts
apple    = APPLE_SIGN_IN_ENABLED && appleAvailable   // isAvailableAsync, cached at module scope
google   = apple && GOOGLE_SIGN_IN_ENABLED           // 4.8: third-party only beside Apple
facebook = apple && FACEBOOK_SIGN_IN_ENABLED         // unchanged rule
phone    = PHONE_SIGN_IN_ENABLED
emailRow = phone                                     // email is the top group when phone is off
anyRows  = emailRow || apple                         // draws the "or" rule and the stack at all
```

`isAvailableAsync` gets asked at **module load of `SignInScreen.tsx`** (`if (APPLE_SIGN_IN_ENABLED) void primeApple()`), and the answer goes into a module variable that the hook reads. The gated tabs import `AuthGate` at app start, so the answer is in before the first signed-out render and the Apple, Google and Facebook rows never pop in after layout.

Truth table:

| PHONE | APPLE (on + available) | GOOGLE | FB | Top group | Rows under "or" |
|---|---|---|---|---|---|
| off | off | any | any | Email | none (no rule) |
| off | on | off | off | Email | Apple |
| off | on | on | on | Email | Apple, Google, Facebook |
| on | off | any | any | Country + Phone | Email |
| on | on | on | on | Country + Phone | Email, Apple, Google, Facebook |

Row order is always email, Apple, Google, Facebook.

The `.env` addition goes under the existing block and uses the same style:

```
# Phone number (SMS code) and Continue with Google. 'on' shows one.
# Google, like Facebook, only ever appears beside Apple (guideline 4.8).
# Phone is first-party and shows on its own; with it off the top field is
# email. Both are JS-only flags: an EAS Update or the next build carries them.
# Before 'on' see specs/02-auth-login.md section 18 (Twilio Verify in Supabase
# > Phone; Google Cloud OAuth client in Supabase > Google), and apply
# supabase/migrations/016_sign_in_lookup.sql before any build ships.
EXPO_PUBLIC_PHONE_SIGN_IN=off
EXPO_PUBLIC_GOOGLE_SIGN_IN=off
```

---

## 4. Screen anatomy

All values are theme tokens. The one new token is `radius.control`, the squared control radius from Jan's house style ("squared buttons, not pills"). If the design-language spec has landed a control radius under another name, use that. Otherwise add `control: 8` to `radius` in `theme.ts` with a one-line comment: "Buttons, fields, the code cells: squared, never a pill." Once `Button` renders squared by itself (design-language spec), drop the per-instance `borderRadius` overrides below.

```
 ┌───────────────────────────────────────────┐  ← insets.top
 │ [X]        Sign in or join Sipply          │  ScreenTopBar md, 44pt row
 ├───────────────────────────────────────────┤  1pt rule, colors.line
 │                                           │  32 (space.xxl)
 │ ┌───────────────────────────────────────┐ │
 │ │ Country or region                     │ │  row 1, minHeight 56
 │ │ Puerto Rico (+1)                    ⌄ │ │
 │ ├───────────────────────────────────────┤ │  1pt textFaint, full width of group
 │ │ Phone number                          │ │  row 2, minHeight 56
 │ │ (787) 555-0134                        │ │
 │ └───────────────────────────────────────┘ │
 │ We'll text a 6-digit code to confirm it's │  helper, 8 below, caption textMuted
 │ you. Message and data rates may apply.    │
 │                                           │  24
 │ ┌───────────────────────────────────────┐ │
 │ │               Continue                │ │  Button primary md, 48, radius.control
 │ └───────────────────────────────────────┘ │
 │                                           │  24
 │ ─────────────────  or  ────────────────── │  OrDivider (01 §5.6): 1pt line rules
 │                                           │  24
 │ ┌───────────────────────────────────────┐ │
 │ │ ✉       Continue with email           │ │  ProviderButton, 48, border 1 colors.text
 │ └───────────────────────────────────────┘ │  12 between rows
 │ │       Continue with Apple             │ │
 │ │ G     Continue with Google            │ │
 │ │ f     Continue with Facebook          │ │
 │                                           │  24
 │  By continuing you confirm you are 18 or  │  Consent, caption, centred
 │  older ... Terms of Use ... Privacy Policy│
 └───────────────────────────────────────────┘  paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.md
```

### 4.1 Screen
- Root: `KeyboardAvoidingView` (`behavior="padding"` on iOS), `flex: 1`, `backgroundColor: colors.bg`.
- `AuthTitleBar` sits **outside** the `ScrollView`, so it stays put while the body scrolls under it.
- Body: `ScrollView`, `keyboardShouldPersistTaps="handled"`, `keyboardDismissMode="interactive"`, `contentContainerStyle={{ paddingHorizontal: layout.gutter, paddingTop: space.xxl, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.md, flexGrow: 1 }}`. The tab bar still floats over this screen, so the clearance stays, as it does today.
- The current lockup image (`sipply-lockup.webp`, 160×198) and the tagline are **removed** from this screen. The reference has no mark above the form, and the intro (which now plays on every cold start) is the brand moment.
- Fit check, 375×812, all five methods on: everything down to the Facebook row clears the floating bar at rest (≈691pt against ≈694pt visible). The consent line scrolls. That is acceptable.

### 4.2 `AuthTitleBar`
Props: `{ title: string; leading: 'close' | 'back' | 'none'; onLeading?: () => void; leadingLabel?: string; insetTop?: boolean }`. `insetTop` defaults to `true`, and the country picker passes `false`.
- **Superseded by reconciliation 2:** render `ScreenTopBar size="md" showRule inset={insetTop ? 'safe' : 'sheet'} title={title} titleRef={titleRef} left={leading === 'none' ? undefined : <TopBarButton icon={leading === 'close' ? 'close' : 'chevronLeft'} label={leadingLabel ?? (leading === 'close' ? 'Close' : 'Back')} onPress={onLeading!} />}`. The notes below on labels and hints still apply; the 56pt row, `borderStrong` hairline and `PressableScale` do not.
- Leading control: `PressableScale`, 44×44, centred `Icon` 20pt in `colors.text` (`close` or `chevronLeft`), `noHaptic`, `hitSlop={4}`.
  - Close: accessibilityLabel "Close", hint "Browse the Dex without signing in".
  - Back: label "Back".
- Title: `Text`, `fonts.bodySemiBold`, `typeScale.body` (16/24), `colors.text`, `textAlign: 'center'`, `numberOfLines={1}`, `maxFontSizeMultiplier={1.3}`, `accessibilityRole="header"`. Absolutely centred (`position: 'absolute', left: 56, right: 56`) so it never shifts when the leading control changes. A 44pt spacer on the right balances the leading control.
- Exposes a `titleRef` for focus moves (§14).

### 4.3 `FieldGroup` / `GroupRow` / `GroupInput`

> **Superseded by reconciliation 1:** build these rows with `ui.tsx`'s `FieldGroup`, `SelectField` (the country row) and `Field` (phone, email, password). What still holds from this section: the label-over-value anatomy, 16pt input text, the eye toggle on `secure`, focus-on-row-tap, and the house rule that every row has a visible label. What does not: one border colour for the whole group (each row rings itself), wine focus, `textFaint` dividers (`lineControl`).
- `FieldGroup` props: `{ children; state: 'idle' | 'focused' | 'error' }`.
  - Style: `backgroundColor: colors.surface`, `borderWidth: 1`, `borderRadius: radius.control`, `overflow: 'hidden'`.
  - `borderColor`: `colors.textFaint` when idle (3.91:1 on white, the same reasoning as `Field`), `colors.wine` when focused, `colors.danger` when in error. The width never changes, so focus causes no layout shift.
- `GroupDivider`: `height: 1`, `backgroundColor: colors.textFaint`, full width. In the error state it stays `textFaint`, because only the outer border changes.
- `GroupRow` (static or pressable) props: `{ label: string; value?: string; trailing?: ReactNode; onPress?; accessibilityLabel; accessibilityHint }`.
  - Style: `minHeight: 56`, `paddingHorizontal: space.md`, `paddingVertical: space.sm`, `justifyContent: 'center'`.
  - Label: `fonts.body`, `typeScale.micro` (12/16), `colors.textMuted`, hidden from VoiceOver.
  - Value: `fonts.body`, 16/24, `colors.text`.
  - `trailing` is absolutely positioned at `right: space.md` and vertically centred. The value gets `paddingRight: 32` when trailing is present.
- `GroupInput` is the same label-over-value anatomy with a real `TextInput` as the value line.
  - The `TextInput` style is `fonts.body` 16, `colors.text`, `padding: 0`, `minHeight: 24`, and `placeholderTextColor={colors.textMuted}`. 16pt keeps iOS from zooming the field.
  - Accepts every `TextInputProps` plus `label`, `ref` (React 19 plain prop) and `secure` (adds the same eye toggle as `Field`, 44pt target, `Icon` `eye`/`eyeOff` 18 in `textMuted`).
  - `onFocus` and `onBlur` report up so the parent can set `FieldGroup.state`.
  - Tapping anywhere on the row focuses the input: wrap the row in a `Pressable` that calls `ref.focus()`, `accessible={false}`.
- **The house rule holds.** Every row has a visible label, and a placeholder never stands in for one. The reference's placeholder-only phone row becomes "label over value", which also makes both rows identical in anatomy.

### 4.4 Helper and error line
- Directly under a group: `marginTop: space.sm`, `fonts.body`, `typeScale.caption` (13/18).
- Normal state: `colors.textMuted`, and it is the input's `accessibilityHint`.
- Error state: the **error replaces the helper** (the same rule as `Field`), in `colors.danger`, announced with `useAnnounce`, and the group's border turns danger.
- Errors that land here: field validation, send-code failures, wrong code, and lookup failures.

### 4.5 Primary action
- Existing `Button` with `variant="primary"`, `block`, `style={{ marginTop: space.xl }}` (48pt, `radius.control` built in: 01 §5.1).
- The label comes from the step table (§11).
- `disabled` while the input is incomplete. `loading` while that step's request is out.
- Errors from the auth store (`useAuth.error` / `notice`, see §5.3) render as `<AuthMessage>` with `marginTop: space.md` under it.

### 4.6 `ProviderButton`
Props: `{ method: 'email' | 'apple' | 'google' | 'facebook'; onPress; busy: boolean; inert: boolean }`.
- Container: **`Button variant="secondary" block size="md" leading={mark}`** (reconciliation 3; 48pt, 1pt `lineInk` edge, `surface` fill, pressed `bgSunk`, mark pinned at `left: 16`, label centred). The numbers below describe what that Button draws.
- Mark: absolute, `left: space.lg`, a 20×20 box, vertically centred.
  - email: `<Icon name="mail" size={20} color={colors.text} />`. New outline icon on the house 24-grid, 1.75 stroke: `M4.4 5.6h15.2a1.6 1.6 0 0 1 1.6 1.6v9.6a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6V7.2a1.6 1.6 0 0 1 1.6-1.6Z` and `m3.4 7.1 8.6 6.3 8.6-6.3`.
  - apple: `<SymbolView name="apple.logo" size={20} tintColor={colors.text} type="monochrome" />` from `expo-symbols`. Apple's own glyph, rendered by the system.
  - google: `<GoogleMark size={20} />`, a new export in `icons.tsx`: `Svg` with `viewBox="0 0 48 48"` and four `Path`s filled from theme tokens. Path data is Google's published "G". **Check it against the SVG in Google's branding download** (developers.google.com/identity/branding-guidelines) before shipping:
    - `googleRed` `M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z`
    - `googleBlue` `M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z`
    - `googleYellow` `M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z`
    - `googleGreen` `M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z`
  - facebook: `<Icon name="facebook" filled size={20} color={colors.facebook} />`. This is the existing Meta mark. On white, the "f" notch shows the button's white, which is exactly Meta's mark. The contrast pair `Facebook mark on a card` already exists.
- Label: `fonts.bodySemiBold`, 16/24, `colors.text`, `textAlign: 'center'`, `paddingHorizontal: 48` so a long label never runs under the mark.
  - Labels: "Continue with email", "Continue with Apple", "Continue with Google", "Continue with Facebook". These are the providers' own sanctioned phrasings, not the reference's copy.
- Busy (this row's request is out): the mark slot shows `<ActivityIndicator size="small" color={colors.text} />` in the same 20pt box. The label is unchanged and full strength, and `accessibilityState={{ busy: true }}`.
- Inert (any other request is out): `disabled`, but **no fade**. Same reason `Button` keeps loading at full strength: a fade would read as "your tap didn't land".
- Accessibility: `accessibilityRole="button"`, label = the visible text.
- Why provider marks are fine when the reference's marks are not: Apple's, Google's and Meta's sign-in guidelines *require* their own mark on a button that signs in with them. Nothing of the reference app's identity is used.
- Theme additions, written beside `facebook`/`onFacebook` with the same "quotation" comment ("Google's four mark colours, for the G on Continue with Google and nothing else. No text sits on them, so check-contrast has no pair."):
  - `googleBlue: '#4285F4'`
  - `googleGreen: '#34A853'`
  - `googleYellow: '#FBBC05'`
  - `googleRed: '#EA4335'`

### 4.7 "or" rule
- Row with `marginVertical: space.xl`, `gap: space.md`, `alignItems: 'center'`, `minHeight: 20`.
- Rules: `OrDivider` from `ui.tsx` (01 §5.6): 1pt `line`.
- Text: "or", `fonts.bodySemiBold`, caption, `colors.textMuted`.
- Rendered only when `anyRows`.

### 4.8 Consent footer
- The existing `Consent` component, moved to `auth/Consent.tsx` and called as `<Consent lead="By continuing" />`, with `marginTop: space.xl` and centred.
- The sentence is now true on the entry screen because it covers both cases: continuing either creates an account or continues one under the same terms.
- It stays on `ChooseUsername` and moves off the email sign-up password step, so it never shows twice on one screen.

### 4.9 Code cells (phone code step)
- Six cells in a row, `gap: space.sm`, each `flex: 1` (≈48pt on a 375pt phone), `height: 56`, `borderRadius: radius.control`, `borderWidth: 1`, `backgroundColor: colors.surface`.
- Edge: 1pt `lineControl` normally. While the input is focused, the cell that takes the next digit draws a 2pt `lineInk` ring as an overlay (01 §5.3's focus ring, so nothing shifts). In the error state all six draw a 2pt `danger` ring. (Reconciliation 7: not wine.)
- Digit: `fonts.bodySemiBold`, `typeScale.title.fontSize` (22), `colors.text`, `fontVariant: ['tabular-nums']`, centred.
- One real `TextInput` sits absolutely over the whole row (`StyleSheet.absoluteFill`) with:
  - `value={code}`, `color: 'transparent'`, `caretHidden`, `selectionColor="transparent"`
  - `inputMode="numeric"`, `textContentType="oneTimeCode"`, `autoComplete="one-time-code"`, `maxLength={6}`
  - accessibilityLabel "Verification code, 6 digits", and `accessibilityValue={{ text: code.split('').join(' ') }}`
- The cells are `accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"`.
- This is why it is one input and not six. iOS's "From Messages" autofill, paste and VoiceOver all need a single real field. Six inputs break all three.

---

## 5. Steps and the flow store

### 5.1 `src/store/signInFlow.ts`

Memory only, never persisted, so a cold start always begins at `entry`.

```ts
export type SignInStep = 'entry' | 'code' | 'email' | 'password' | 'reset';
export type EmailStatus = 'new' | 'password' | 'other' | 'unknown';
export type Method = 'phone' | 'code' | 'resend' | 'email' | 'apple' | 'google' | 'facebook';

export const OTP_LENGTH = 6;
export const RESEND_SECONDS = 60;      // = Supabase's per-user SMS interval
export const MAX_WRONG_CODES = 5;      // = Twilio Verify's attempts per code

interface SignInFlowState {
  step: SignInStep;
  iso: string;               // ISO 3166-1 alpha-2, default deviceRegion() ?? 'US'
  national: string;          // what is in the phone field (formatted for NANP)
  sentTo: string | null;     // E.164 the live code went to
  sentAt: number | null;     // ms; drives the resend countdown
  resends: number;
  wrongCodes: number;
  code: string;              // 0..6 digits
  email: string;
  password: string;          // cleared on every step change and on reset()
  emailStatus: EmailStatus | null;
  pending: Method | null;    // ONE request at a time, across every mounted gate
  error: string | null;      // field-scoped, shown in the helper slot
  providerError: string | null; // Apple/Google/Facebook, shown under the rows
  notice: string | null;     // 'New code sent.' on the code step

  setCountry(iso: string): void;
  setNational(text: string): void;
  setCode(text: string): void;           // digits only, sliced to 6; auto-submits at 6
  setEmail(text: string): void;
  setPassword(text: string): void;
  go(step: SignInStep, opts?: { keepAuthNotice?: boolean }): void;
  back(): void;
  reset(): void;

  submitPhone(): Promise<void>;
  resendCode(): Promise<void>;
  submitCode(): Promise<void>;
  submitEmail(): Promise<void>;          // runs the lookup, moves to 'password'
  submitPassword(): Promise<void>;       // signIn or signUp by emailStatus
  sendReset(): Promise<void>;
  continueWith(p: 'apple' | 'google' | 'facebook'): Promise<void>;
}
```

Rules:
- Every async action starts with `if (get().pending) return;`. That single guard covers double taps and both mounted gates.
- `go()` clears `error`, `providerError` and `notice`, and calls `useAuth.getState().clearError()`, **unless** `keepAuthNotice` is set. That carries the "check your email, then sign in" notice across the move after an unconfirmed sign-up, which is the same nuance today's `switchMode` comment protects. It also clears `password`.
- `back()`: `code → entry`, `email → entry`, `password → (PHONE_SIGN_IN_ENABLED ? 'email' : 'entry')`, `reset → password`.
- `reset()` returns to the initial state but **keeps `iso`**.
- The store is reset from `store/auth.ts`:
  - in the `onAuthStateChange` listener whenever the session goes from null to non-null;
  - in `signOut` and `deleteAccount` after the session clears.

  Import direction is `store/auth → store/signInFlow`. The flow store calls auth actions only through `useAuth.getState()` inside its actions, never at module scope, so the cycle is harmless.

### 5.2 Step map

| Step | Title bar | Leading | Body | Primary |
|---|---|---|---|---|
| `entry` (phone on) | Sign in or join Sipply | close → `onClose` | Group: Country row + Phone input. Helper. | Continue → `submitPhone` |
| `entry` (phone off) | Sign in or join Sipply | close → `onClose` | Group: Email input. Helper "We'll check whether you already have an account." | Continue → `submitEmail` |
| `code` | Confirm your number | back | Lede + cells + resend line (§6.4) | Verify → `submitCode` |
| `email` | Continue with email | back | Group: Email input. Same helper as above. | Continue → `submitEmail` |
| `password` / `password` | Welcome back | back | Group: Email (read-only) + Password. Right-aligned "Forgot your password?" | Sign in |
| `password` / `new` | Create your account | back | Group: Email (read-only) + Password (`newPassword`). Helper "At least 6 characters." | Create account |
| `password` / `other` | Sign in another way | back | Lede (§11) + the provider rows (§4.6) without the email row | none. Link "Or set a password by email" → `sendReset` |
| `password` / `unknown` | Enter your password | back | Group: Email (read-only) + Password. Link under the primary: "New to Sipply? Create an account" → sets `emailStatus = 'new'` | Sign in |
| `reset` | Reset your password | back | Lede "We'll email a link to set a new password." Group: Email (read-only). | Send reset link → `requestPasswordReset` |

The entry step (both forms) also carries the "or" rule, the provider rows (§3) and the consent footer. Other steps carry neither.

- **The read-only email row is deliberate.** It is a `GroupInput` with `editable={false}`, `value={email}`, `textContentType="username"` and `autoComplete="email"`, inside a `Pressable` that calls `back()` to change it. It has trailing text "Change" (`fonts.bodySemiBold`, caption, `colors.wine`) and accessibilityLabel "Email, you@example.com. Double-tap to change."
- iOS Password AutoFill pairs a password with a username field **present on the same screen**. A two-screen login without it saves passwords under no account.
- The `TextInput` inside has `pointerEvents="none"` so the row's press wins.
- Step body: wrap the body in a plain `<View key={step + (emailStatus ?? '')}>`. **No `entering`/`exiting`** (cross-check: 06 lint rule 3, and an `exiting` that never finishes leaves a ghost form on screen, 06 §3.8). The step swaps instantly, as iOS's own sign-in sheets do.

### 5.3 Where each message shows

| Source | Where |
|---|---|
| Phone validation, send failure, wrong or expired code, lookup failure (`flow.error`) | Helper slot under the group, in danger (§4.4) |
| Apple, Google or Facebook failure (`flow.providerError`) | `<AuthMessage tone="error">`, `marginTop: space.md`, directly under the last provider row |
| `useAuth.error` / `useAuth.notice` (email sign-in, sign-up and reset; dead reset link via `failRecovery`) | `<AuthMessage>` under the primary button on `entry`, `password` and `reset` |
| "New code sent." (`flow.notice`) | `<AuthMessage tone="notice">` under the resend line |

### 5.4 Focus management (two gates are mounted)

- **No `autoFocus` props anywhere.** Home and Profile can both have a mounted `SignInScreen`, and an `autoFocus` in the hidden one steals the keyboard.
- Instead, each step component runs `useFocusEffect` (from `expo-router`) plus an effect keyed on `step`. Each one focuses its input **only when the scene is focused**: check `navigation.isFocused()` via `useNavigation()`, after a `setTimeout(…, 250)` so the fade has started.
- Inputs focused: `code` → the code input. `email` → the email input. `password` → the password input. `entry` → nothing, so the keyboard does not cover the provider rows on every cold start.

---

## 6. Phone

### 6.1 `src/data/countries.ts`

```ts
import type { Country } from '@/lib/phone';
export const COUNTRIES: readonly Country[] = [ /* ~245 entries, sorted by name */ ];
export const COUNTRY_BY_ISO: Record<string, Country>;   // null-prototype, like DRINKS_BY_ID
export function deviceRegion(): string | null;
export const SUGGESTED_ISOS = ['PR', 'US'] as const;    // after the device region, de-duplicated
```

- `Country` is `{ iso: string; name: string; dial: string }`, with `dial` as digits only (`'1'`, `'44'`, `'1'` for PR).
- Contents: every ITU-T E.164 assignment with an ISO 3166-1 code. Each NANP member gets its own entry with `'1'` (US, PR, CA, DO, JM, TT, BS, BB, VI, GU, MP, AS and so on). Shared codes get one entry per territory: +7 RU/KZ, +44 GB/GG/IM/JE, +39 IT/VA, +47 NO/SJ, +590 GP/BL/MF, +262 RE/YT, +61 AU/CX/CC.
- English short names, sorted with `localeCompare('en', { sensitivity: 'base' })`.
- **No emoji, including no flags.** `check-design.mjs` blocks pictographs, and the brief forbids flags.
- Write it by hand from the ITU-T list. Copying from libphonenumber's metadata in a scratch directory is fine. **Never as a dependency.**
- `deviceRegion()`:
  - Read `Settings.get('AppleLocale')` (`react-native`'s `Settings`, iOS, NSUserDefaults, for example `"en_US"`).
  - Fall back to `Intl.DateTimeFormat().resolvedOptions().locale`.
  - Extract `/[_-]([A-Z]{2})(?=$|[_@-])/`.
  - Return the ISO only if it is in `COUNTRY_BY_ISO`, else `null`. Wrap everything in try/catch.
  - The default country is `deviceRegion() ?? 'US'`.

### 6.2 `src/lib/phone.ts`

Pure functions with **no imports at all**. `Country` is declared here, so `scripts/check-phone.mjs` can load the file with Node's built-in type stripping (Node 26 is installed).

```ts
export interface Country { iso: string; name: string; dial: string }
export const NANP = '1';
const KEEPS_TRUNK_ZERO = new Set(['IT', 'SM', 'VA']);

/** E.164 with '+', or null when it cannot be a mobile number. */
export function toE164(country: Country, typed: string): string | null;
/** As-you-type display for the field: NANP "(787) 555-0134"; others digits only. */
export function formatNational(country: Country, typed: string): string;
/** "+1 (787) 555-0134" for NANP; "+44 7700900123" otherwise. For the code step lede. */
export function displayPhone(e164: string): string;
/** The dial prefix a '+…' string starts with, longest match in `dials`. */
export function matchDial(e164Digits: string, dials: readonly string[]): string | null;
```

`toE164` rules, in order:
1. If `typed.trim()` starts with `+`: take all digits. Valid if there are 8–15 of them. Return `'+' + digits`. The caller then moves the picker to the country whose dial is `matchDial(…)`. If that dial is `'1'` and the current country is already NANP, keep the current one.
2. NANP (`dial === '1'`): national = digits. If there are 11 digits starting with `1`, drop the leading `1`. Valid only when exactly 10 digits remain and the first is 2–9. Return `'+1' + national`.
3. Otherwise: strip one leading `0` unless `KEEPS_TRUNK_ZERO.has(iso)`. Valid when national is at least 4 digits and `dial + national` is 8–15 digits.

Continue is enabled exactly when `toE164` is non-null.

The field gets:
- `inputMode="tel"`, `textContentType="telephoneNumber"`, `autoComplete="tel"`
- `maxLength={20}`
- `onBlur` marks the field as left, in a component-local `useState` (`phoneLeft`), which resets on remount
- After that, an invalid non-empty value shows "That number doesn't look right. Check the country and the number." in the helper slot. The existing rule applies: don't flag a number while it is still being typed.

### 6.3 Country picker (`CountryPicker.tsx`)

- RN `<Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={close}>`. `onRequestClose` covers both the swipe-down and Android back.
- Contents:
  - `<Grain />` as the last child, matching `log`/`edit-profile`, because native modals sit above the root `Grain`.
  - Root `View` with `flex: 1` and `backgroundColor: colors.bg`.
  - `AuthTitleBar` with title "Country or region", `leading="close"`, `leadingLabel="Close"`, and `insetTop={false}` (a pageSheet has no status bar inset).
  - `SearchField` (the existing primitive) with `placeholder="Name or code"`, `accessibilityLabel="Search countries and regions"`, `returnKeyType="search"`, style `marginHorizontal: layout.gutter, marginVertical: space.md`.
  - `SectionList`, `keyboardShouldPersistTaps="handled"`, `keyboardDismissMode="on-drag"`, and `getItemLayout` with a fixed row height of 52.
- Sections with an empty query:
  - "Suggested": device region, then PR, then US, de-duplicated.
  - "All countries and regions".
  - Headers are `SectionHeader size="group"` (01 §5.10: sentence case; uppercase is lint-banned), `space.lg` top and `space.sm` bottom; the group size already pads 16 horizontally.
- With a query: one unlabelled section. Matching is case- and diacritic-insensitive: `normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()`.
  - A query matches a name when the name **contains** it, or when any word in the name starts with it.
  - An exact ISO code also matches (`pr` → Puerto Rico).
  - So does a dial code with or without `+` (`44`, `+44`; exact prefix on `dial`).
  - Order: name-starts-with first, then the rest alphabetically.
- Row: `Pressable` with a pressed fill of `bgSunk` (01 §5.0; no scale), `minHeight: 52`, `paddingHorizontal: layout.gutter`, row direction, `gap: space.md`. The select tick is fired in `onPress`.
  - Name: `fonts.body`, 16, `colors.text`, `flex: 1`.
  - Dial: `+{dial}`, `fonts.body`, 16, `colors.textMuted`, tabular.
  - Selected: `Icon check` 18 in `colors.wine`.
  - Separator: `stroke.hair` `colors.line`, starting at `layout.gutter`.
  - accessibilityRole `button`, label `"{name}, plus {dial}"`, `accessibilityState={{ selected }}`.
- Selecting a row runs `haptic.select()`, `setCountry(iso)`, closes the sheet, and then focuses the phone input after 300ms.
- Empty search result: centred `fonts.body` 16 in `textMuted`, `paddingTop: space.xxl`, copy "No country or region matches “{q}”."
- The country row on the entry screen is a `GroupRow`:
  - label "Country or region"
  - value `"{name} (+{dial})"`
  - trailing `Icon chevronDown` 20 in `colors.text`
  - accessibilityRole `button`, label `"Country or region, {name}, plus {dial}"`, hint "Opens the list"

### 6.4 Code step (`PhoneCodeStep.tsx`)

- Lede: `fonts.body`, `typeScale.bodySm` (14/20), `colors.textMuted`, `marginBottom: space.lg`. Text: "Enter the 6-digit code we texted to {displayPhone(sentTo)}." It is followed inline by a nested `Text` "Change number" (`fonts.bodySemiBold`, wine, `accessibilityRole="link"`, `onPress={back}`).
- Cells: §4.9.
- Resend line: `marginTop: space.lg`, centred, `minHeight: 44`.
  - While `now - sentAt < 60s`: "Send a new code in 0:42", `fonts.body`, caption, `colors.textMuted`, not pressable. accessibilityLabel "Send a new code, available in 42 seconds".
  - After that: a `PressableScale` "Send a new code" in `fonts.bodySemiBold`, caption, `colors.wine` → `resendCode()`.
  - The countdown recomputes from `sentAt` on a 1s `setInterval` that only runs while the scene is focused (inside `useFocusEffect`). The time comes from the store, so switching tabs never resets it.
  - After the first resend, a second link appears under it: "Use email instead" → `go('email')` when phone is on.
- Primary "Verify": `Button`, `disabled` until `code.length === 6`, `loading` while `pending === 'code'`.
- `setCode` auto-runs `submitCode()` when the 6th digit lands. The explicit Verify button stays for VoiceOver users and for an auto-submit that failed.
- **Wrong or expired code** (GoTrue `otp_expired`, which covers both):
  - `wrongCodes += 1`, `code = ''`, cells in error, `haptic.error()`.
  - helper slot shows "That code is wrong or has expired. Check it, or send a new one."
  - the input stays focused.
- At `MAX_WRONG_CODES`:
  - helper becomes "Too many wrong codes. Send a new one."
  - Verify is disabled and the cells ignore input (`editable={false}`) until `resendCode()` succeeds, which resets `wrongCodes`.
  - The resend countdown still applies.
- **Success:**
  - supabase-js persists the session.
  - `verifyPhoneCode` runs `clearRecovering()` (same as the other methods).
  - The listener sets the session and resets the flow.
  - `AuthGate` takes over (§9.1). A new account gets the username step.

### 6.5 Auth store additions (phone)

```ts
sendPhoneCode: async (e164) => {
  try {
    const { error } = await supabase.auth.signInWithOtp({
      phone: e164,
      options: { channel: 'sms', shouldCreateUser: true, data: { accent: randomAccent() } },
    });
    return error ? humanizePhone(error) : null;
  } catch { return OFFLINE; }
},
verifyPhoneCode: async (e164, code) => {
  try {
    const { data, error } = await supabase.auth.verifyOtp({ phone: e164, token: code, type: 'sms' });
    if (error || !data.session) return error ? humanizeCode(error) : CODE_FAILED;
    await clearRecovering();
    return null;
  } catch { return OFFLINE; }
},
```

- `randomAccent()` is the existing `SIGNUP_ACCENTS[Math.floor(Math.random() * …)]` line pulled into a helper. `signUp` uses it too.
- `data.accent` is the only metadata sent. `handle_new_user` (015) fills in the placeholder handle and "New collector", and the username step follows.
- Nothing about the number or the code is ever logged, even under `__DEV__`.

---

## 7. Email

### 7.1 Lookup (client)

```ts
lookupEmail: async (email) => {
  const { data, error } = await supabase.rpc('sign_in_method', { e: email.trim() });
  if (!error && (data === 'new' || data === 'password' || data === 'other')) return { status: data, error: null };
  if (error && /network|fetch|timed? ?out/i.test(error.message ?? '')) return { status: null, error: OFFLINE };
  if (error && /invalid_email/.test(`${error.message} ${error.details ?? ''}`)) return { status: null, error: 'That email address doesn’t look right.' };
  return { status: 'unknown', error: null };   // rate_limited, missing function, anything else
},
```

- `submitEmail`:
  - Validates locally first: trimmed, contains `@` with something either side, at most 254 characters.
  - Sets `pending = 'email'`, calls `lookupEmail`, and on a status sets `emailStatus` and calls `go('password')`.
  - An error stays on the step in the helper slot.
- The email input:
  - `inputMode="email"`, `autoComplete="email"`, `textContentType="username"`. Same keychain reason as today.
  - `autoCapitalize="none"`, `autoCorrect={false}`.
  - `returnKeyType="next"`, `submitBehavior="blurAndSubmit"`, `onSubmitEditing={submitEmail}`.

### 7.2 Password step variants

`submitPassword` is guarded on `password.length >= (emailStatus === 'new' ? 6 : 1)`.

| `emailStatus` | Calls | On result |
|---|---|---|
| `password` / `unknown` | `useAuth.getState().signIn(email, password)` (unchanged) | Error shows under the primary. In `unknown`, an `invalid_credentials` failure appends the sentence "If you're new, create an account instead." |
| `new` | `signUpEmail(email, password)` (the new `signUp`, §7.3) | Needs confirmation (no session plus a notice): `set({ emailStatus: 'password' }); go('password', { keepAuthNotice: true })`. A `user_already_exists` race works the same way, without `keepAuthNotice`, and keeps the error. |
| `other` | none (the rows are the actions) | "Or set a password by email" runs `requestPasswordReset(email)` and then shows the existing notice |

- "Forgot your password?" sits under the group, right-aligned, `marginTop: space.sm`, `minHeight: 44`, hitSlop as today. It does `go('reset')`. Reset is the existing `requestPasswordReset`, unchanged, and the overlay flow is unchanged.
- Password input:
  - Sign-in: `textContentType="password"`, `autoComplete="password"`, `returnKeyType="go"`, `onSubmitEditing={submitPassword}`.
  - Sign-up: `newPassword` / `password-new`. The app's `webcredentials:janmcq1617.github.io` association means iOS offers a strong password.

### 7.3 `signUp` rewrite (store)

New signature: `signUp(email: string, password: string): Promise<void>`. **Cross-check:** B3 lands this in stage 1, while the old `AuthForm` in `AuthGate.tsx` (C2, stage 2) still calls today's `signUp`. So B3 adds it as **`signUpEmail(email, password)`**, the flow store calls `signUpEmail`, and today's `signUp` stays untouched and `@deprecated` until C2 has merged; B3 deletes the old `signUp` in stage 3 (`signUpEmail` keeps its name). The body:

- Drop:
  - the `profileFieldProblem`, placeholder and `refusedColumn` pre-checks
  - the two `is_objectionable` RPCs
  - `setPendingClaims` and its cleanup (there are no claims at sign-up any more)
- `supabase.auth.signUp({ email: email.trim(), password, options: { data: { accent: randomAccent() } } })`.
- `humanizeSignUp(error)` loses its `screened` parameter. The `status === 500` branch becomes "Could not create your account. Try again." No username is sent, so a 500 can no longer mean "taken".
- Keep:
  - the duplicate-email branch
  - the `!data.session` notice
  - the try/catch around the whole thing
- `drainPendingClaims` stays. It still drains claims parked by builds 8–11 on phones mid-confirmation.

Update the `AuthState` doc comment for `signUp` to match.

---

## 8. Apple, Google, Facebook

### 8.1 `src/lib/oauth.ts` (moved out of `lib/facebook.ts`)

```ts
export const AUTH_CALLBACK_PATH = 'auth/callback';
export function authCallbackUrl(): string;                      // Linking.createURL(AUTH_CALLBACK_PATH)
export type OAuthProvider = 'google' | 'facebook';
export type OAuthMode = 'sign-in' | 'link';
export type OAuthOutcome =
  | { kind: 'tokens'; accessToken: string; refreshToken: string; providerToken: string | null }
  | { kind: 'code'; code: string; providerToken: null }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };
export function parseAuthCallback(url: string, describe: (code?: string) => string): OAuthOutcome;
export async function openOAuth(
  provider: OAuthProvider,
  mode: OAuthMode,
  opts: { scopes?: string; queryParams?: Record<string, string>; describe: (code?: string) => string },
): Promise<OAuthOutcome>;
```

- This is the current `parseAuthCallback`/`openFacebookAuth` body moved verbatim, with the provider, scopes, query params and copy as parameters. **The header comment about the implicit flow moves with it, word for word. Do not switch the client to PKCE.**
- `lib/facebook.ts` keeps:
  - `type FacebookAuthOutcome = OAuthOutcome`
  - its `describe` and `failedCopy`
  - `openFacebookAuth(mode) => openOAuth('facebook', mode, { scopes: SCOPES, queryParams: { auth_type: 'rerequest' }, describe: (c) => describe(c, mode) })`
  - everything from "The Facebook token" down, untouched

### 8.2 Google

- Store action `signInWithGoogle(): Promise<string | null>`:

```ts
const failed = 'Google did not sign you in. Try again, or use another way.';
try {
  const outcome = await openOAuth('google', 'sign-in', {
    scopes: 'openid email profile',
    queryParams: { prompt: 'select_account' },   // always show the account chooser
    describe: describeGoogle,
  });
  return await finishOAuth(outcome, null, failed);   // no onProviderToken: Google's token is dropped
} catch { return failed; }
```

- `describeGoogle(code)`:

  | Code | Copy |
  |---|---|
  | `provider_disabled` | "Google sign-in isn't switched on for Sipply yet." |
  | `email_exists` / `user_already_exists` | "That email already has a Sipply account. Sign in with your email and password." |
  | `over_request_rate_limit` | `TOO_MANY` |
  | default | `failed` |

- `finishOAuth(outcome, expected, failed, onProviderToken?: (uid: string, token: string) => void)` is `finishFacebook` renamed with the Facebook-specific tail moved into the callback. Facebook passes `(uid, t) => { holdFacebookToken(uid, t); void syncFacebookFriends(uid); }` and Google passes nothing.
  - The `setSession({ access_token, refresh_token })`-only handover is unchanged. It is still what keeps any provider token out of AsyncStorage.
- Supabase's automatic identity linking signs a Google account whose verified email matches an existing account **into that account**. Nothing to build.
- Google sends `full_name`, so `handle_new_user` prefills the display name, and the username step still runs because the handle is a placeholder.

### 8.3 Apple and Facebook

- Logic unchanged (`signInWithApple`, `signInWithFacebook`). Only the buttons change, to `ProviderButton`.
- The `AppleAuthentication.AppleAuthenticationButton` import goes. `signInAsync` does not depend on it.
- `continueWith(p)`:

```ts
if (get().pending) return;
set({ pending: p, providerError: null });
useAuth.getState().clearError();
try {
  const auth = useAuth.getState();
  const message = await (p === 'apple' ? auth.signInWithApple() : p === 'google' ? auth.signInWithGoogle() : auth.signInWithFacebook());
  set({ providerError: message });
} finally { set({ pending: null }); }
```

- A cancel returns null and says nothing, as today.

---

## 9. After the session

### 9.1 `AuthGate` render order (replaces the current body). **Merged with 06 §3.5 by the cross-check: this is the one body to build.**

06 §3.5 steps 1 and 4 still apply as written (extend `useWelcome` with `rowWaitOver` / `endRowWait`, `ROW_WAIT_MS = 4000`, and the `loading` style). 06's `GateHold` is `Hold` from `ui.tsx` (01 §5.17). What changes against 06's version: `signsInSocially` is gone, so the bounded row wait covers **every** new account; `SignInScreen` replaces `AuthForm`; `onClose` is new.

```tsx
export function AuthGate({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  const router = useRouter();
  const close = onClose ?? (() => router.navigate('/dex'));

  const session = useAuth((s) => s.session);
  const ready = useAuth((s) => s.ready);
  const profile = useAuth((s) => s.profile);
  const profileError = useAuth((s) => s.profileError);
  const userId = session?.user.id;

  const welcomeSeen = useWelcome((s) => (userId ? s.seen[userId] : undefined));
  const rowWaitOver = useWelcome((s) => (userId ? s.rowWaitOver[userId] === true : false));
  const loadWelcome = useWelcome((s) => s.load);
  const dismissWelcome = useWelcome((s) => s.dismiss);
  const endRowWait = useWelcome((s) => s.endRowWait);

  const ownProfile = profile && profile.id === userId ? profile : null;
  /*
   * Every new account (phone, email, Apple, Google, Facebook) gets a placeholder
   * handle from handle_new_user and is about to be asked for a username, and
   * whether it must be is in its profile row. Waiting on the row keeps Welcome
   * from flashing past before the username step, but only for ROW_WAIT_MS
   * (specs/06 cause 5): after that, or once the row has failed, the account goes
   * on to Welcome and the username step takes over whenever the row lands.
   */
  const waitingForRow =
    session != null && welcomeSeen === false && !ownProfile && !profileError && !rowWaitOver;

  useEffect(() => {
    if (userId) loadWelcome(userId);
  }, [userId, loadWelcome]);

  useEffect(() => {
    if (!userId || welcomeSeen !== false || rowWaitOver) return;
    if (profileError) {
      endRowWait(userId);
      return;
    }
    if (!waitingForRow) return;
    const t = setTimeout(() => endRowWait(userId), ROW_WAIT_MS);
    return () => clearTimeout(t);
  }, [userId, welcomeSeen, rowWaitOver, profileError, waitingForRow, endRowWait]);

  if (!ready) {
    return <Hold slowMessage="Still connecting. The Dex and Stats work without a connection." />;
  }
  if (!session || !userId) return <SignInScreen onClose={close} />;
  if (ownProfile && isPlaceholderUsername(ownProfile.username)) {
    return <ChooseUsername key={userId} profile={ownProfile} />;
  }
  if (welcomeSeen === undefined || waitingForRow) {
    return <Hold slowMessage="Still loading your account." />;
  }
  if (!welcomeSeen) return <WelcomeConnect onDone={() => dismissWelcome(userId)} />;
  return <>{children}</>;
}
```

- `signsInSocially` is deleted. Every method can now make a placeholder account, so the "wait for the row before Welcome" rule applies to all of them. The wait is bounded by `ROW_WAIT_MS` (4 s), **not** by `refreshProfile`'s retries: each retry awaits a request with no timeout and can last until iOS's 60 s limit (06 §3.5), and a token refresh re-enters it. `rowWaitOver` is sticky for the session, which is what stops the fallback from Welcome back to a blank page.
- There is no `AuthWait`. `Hold` is quiet for 400 ms, then a wine spinner, then its message at 8 s (06 rule 3).
- `user/[id].tsx`: `<AuthGate onClose={leave}>{null}</AuthGate>` in both places. Update its header comment: "an account made on this screen's sign-in form, by any method".

### 9.2 `ChooseUsername` restyle

- Light touch only. Fields, rules and logic are unchanged.
- The top becomes `<AuthTitleBar title="Choose a username" leading="none" />`, and the Playfair `stepTitle` is removed.
- The body `ScrollView` starts at `space.xxl` below the bar. `stepLede` stays (`marginTop: 0`).
- `Button` needs no radius override (01's Button is already `radius.control`).
- Comments that say "Apple or Facebook" become "any new account: phone, email, Apple, Google or Facebook".
- The name stays optional for everyone, falling back to the handle. That rule exists for App Review's Apple name rule, and it is harmless for the other methods.

### 9.3 Find friends prefill (shared file, additive)

In `FindFriends.tsx`, where the parked phone prefill runs:

```ts
const verified = useAuth((s) => s.session?.user.phone);   // GoTrue stores digits, no '+'
…
const parkedPhone = parked?.phone ?? (verified ? `+${verified}` : undefined);
if (alive && parkedPhone) setPhone((typed) => typed || parkedPhone);
```

- This is a prefill only. The person still taps Save, so becoming findable stays an explicit choice. `normalizePhone` already strips `+1`.

---

## 10. Data

### 10.1 Migration `016_sign_in_lookup.sql`

Same house format as 011–015: a header with WHAT, WHY, ORDER, ALSO BY HAND and VERIFY, safe to re-run, and the `schema_migrations` insert last.

```sql
-- Sipply — migration 016: the email step's "sign in or sign up" lookup
-- Paste into the Supabase SQL Editor and Run. Safe to re-run. Independent
-- of 012–015 (needs only 009's schema_migrations).
--
-- WHY THIS IS NOT A NEW DISCLOSURE: GoTrue's public /auth/v1/signup already
-- tells anyone whether an email has an account (user_already_exists, or, with
-- confirmations on, a user with no identities). This answers the same
-- question, metered tighter: 30 per caller IP and 1,000 overall per hour.
-- A refused lookup is not an outage: the app shows a password step that
-- offers both sign-in and sign-up.
--
-- The caller is bucketed by md5 of Cloudflare's cf-connecting-ip, never the
-- IP itself, and rows live one hour. With no such header every caller shares
-- the 'unknown' bucket and the per-IP limit degrades into the overall one.

create table if not exists public.sign_in_lookups (
  bucket    text not null,
  looked_at timestamptz not null default now()
);
create index if not exists sign_in_lookups_time_idx on public.sign_in_lookups (looked_at);
create index if not exists sign_in_lookups_bucket_idx on public.sign_in_lookups (bucket, looked_at);
alter table public.sign_in_lookups enable row level security;
revoke all on public.sign_in_lookups from anon, authenticated;

create or replace function public.sign_in_method(e text)
returns text
language plpgsql
volatile                      -- it writes the meter; PostgREST runs STABLE read-only
security definer              -- reads auth.users, which no client role can
set search_path = ''
as $$
declare
  hdrs    jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  addr    text  := lower(btrim(coalesce(e, '')));
  caller  text;
  per_ip  integer;
  overall integer;
  pw      text;
begin
  if length(addr) > 254 or addr !~ '^[^@\s]+@[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  caller := md5('sipply-sign-in-lookup:' || coalesce(nullif(hdrs ->> 'cf-connecting-ip', ''), 'unknown'));

  perform pg_advisory_xact_lock(hashtextextended('sign_in_lookups', 0));
  delete from public.sign_in_lookups l where l.looked_at <= now() - interval '1 hour';
  select count(*), count(*) filter (where l.bucket = caller)
    into overall, per_ip
  from public.sign_in_lookups l;
  if per_ip >= 30 or overall >= 1000 then
    raise exception 'rate_limited' using errcode = 'P0001', hint = 'Try again later.';
  end if;
  insert into public.sign_in_lookups (bucket) values (caller);

  -- GoTrue stores emails lowercased, so equality hits its email index.
  select u.encrypted_password into pw
  from auth.users u
  where u.email = addr and u.deleted_at is null
  limit 1;

  if not found then return 'new'; end if;
  if pw is not null and pw <> '' then return 'password'; end if;   -- OAuth/phone users carry ''
  return 'other';
end;
$$;

revoke all on function public.sign_in_method(text) from public;
grant execute on function public.sign_in_method(text) to anon, authenticated;

insert into public.schema_migrations (version)
values ('016_sign_in_lookup') on conflict (version) do nothing;
```

Put these VERIFY queries in the header:

```sql
-- expect false, false
select has_table_privilege('anon', 'public.sign_in_lookups', 'select'),
       has_table_privilege('authenticated', 'public.sign_in_lookups', 'select');
-- expect true, true
select has_function_privilege('anon', 'public.sign_in_method(text)', 'execute'),
       has_function_privilege('authenticated', 'public.sign_in_method(text)', 'execute');
-- expect 'new' (the editor has no request headers, so this lands in 'unknown')
select public.sign_in_method('nobody@example.invalid');
-- AFTER one lookup from a phone: expect a row with fell_back = false. If every
-- row is true, cf-connecting-ip is not reaching Postgres; the per-IP limit is
-- then the overall one, which is safe but coarser.
select bucket = md5('sipply-sign-in-lookup:unknown') as fell_back, count(*)
from public.sign_in_lookups group by 1;
```

### 10.2 `database.types.ts`

Under `Functions`, with a doc comment pointing at the migration:

```ts
sign_in_method: { Args: { e: string }; Returns: string };   // 'new' | 'password' | 'other'
```

No other schema change:
- Phone accounts live in `auth.users.phone`, which GoTrue owns.
- Profiles are created by the existing `handle_new_user` (015), unchanged.

---

## 11. Copy

All strings are new or moved, and none comes from the reference. Use the typographic apostrophe consistently, as the app's existing copy does.

| Where | String |
|---|---|
| Title bar, entry | Sign in or join Sipply |
| Country row label | Country or region |
| Country row value | {name} (+{dial}) |
| Phone row label | Phone number |
| Phone helper | We’ll text a 6-digit code to confirm it’s you. Message and data rates may apply. |
| Email row label | Email |
| Email helper | We’ll check whether you already have an account. |
| Entry primary | Continue / (loading) Sending code… or Checking… |
| Rule | or |
| Provider rows | Continue with email · Continue with Apple · Continue with Google · Continue with Facebook |
| Consent | By continuing you confirm you are 18 or older and of legal drinking age where you live, and agree to the Terms of Use and the Privacy Policy. (the existing component, lead "By continuing") |
| Code title | Confirm your number |
| Code lede | Enter the 6-digit code we texted to {phone}. **Change number** |
| Code primary | Verify / Checking… |
| Resend | Send a new code in 0:42 · Send a new code · New code sent. · Use email instead |
| Email step title | Continue with email |
| Sign-in title / primary | Welcome back / Sign in · Signing in… |
| Sign-up title / primary | Create your account / Create account · Creating account… |
| Sign-up helper | At least 6 characters. |
| Other title | Sign in another way |
| Other lede | That email belongs to an account that signs in another way: with Apple, Google, Facebook or a phone number. Use the one you set it up with. |
| Other link | Or set a password by email |
| Unknown title / link | Enter your password / New to Sipply? Create an account |
| Forgot link | Forgot your password? |
| Reset title / lede / primary | Reset your password / We’ll email a link to set a new password. / Send reset link · Sending link… |
| Read-only email row trailing | Change |
| Picker title / search / empty | Country or region / Name or code / No country or region matches “{q}”. |
| Picker sections | Suggested · All countries and regions |

---

## 12. Errors

GoTrue codes come from `error.code`, never the message. That is the house rule from `humanizeAuth`.

| Code / condition | Copy | Shown |
|---|---|---|
| local invalid phone (after blur) | That number doesn’t look right. Check the country and the number. | helper |
| `validation_failed` (send) | That number doesn’t look right. Check the country and the number. | helper |
| `sms_send_failed` | Couldn’t text that number. Check it, or use another way to sign in. | helper |
| `phone_provider_disabled` | Phone sign-in isn’t switched on for Sipply yet. | helper |
| `over_sms_send_rate_limit` | Too many codes sent just now. Wait a few minutes and try again. | helper |
| `over_request_rate_limit` / status 429 | Too many attempts just now. Wait a minute and try again. (existing `TOO_MANY`) | helper |
| `signup_disabled` / `otp_disabled` | New accounts are paused right now. Try again later. | helper |
| offline (`isAuthRetryableFetchError && !status`, or a thrown fetch) | Cannot reach Sipply. Check your connection and try again. (existing `OFFLINE`) | helper / under primary |
| `otp_expired` (verify) | That code is wrong or has expired. Check it, or send a new one. | helper, cells red |
| fifth wrong code | Too many wrong codes. Send a new one. | helper |
| verify, anything else | Couldn’t check that code. Try again. | helper |
| lookup, `invalid_email` or local check | That email address doesn’t look right. | helper |
| lookup `rate_limited` / any non-network error | no message. Falls to the `unknown` variant | none |
| email sign-in / sign-up / reset | existing `humanizeAuth` / `humanizeSignUp` copy | under primary |
| Google | §8.2 | under rows |
| Apple / Facebook | existing copy | under rows |

---

## 13. States per step

| Step | Loading | Empty / incomplete | Error | Offline |
|---|---|---|---|---|
| entry (phone) | Continue `loading` ("Sending code…"). Rows and picker inert at full strength | Continue `disabled` until `toE164` is valid | helper in danger, group border danger | `OFFLINE` in helper, number kept |
| entry/email (email) | Continue `loading` ("Checking…") | disabled until it looks like an email | helper | `OFFLINE` in helper, stays on step |
| provider row | that row's mark becomes a spinner, everything else inert | n/a | `AuthMessage` under rows | the provider's own failure copy (the sheet itself fails to load) |
| code | Verify `loading`, input stays editable | Verify disabled under 6 digits | cells and border danger, helper | `OFFLINE` in helper, code kept |
| password | primary `loading` via `useAuth.busy` | disabled under 1 character (6 for `new`) | `AuthMessage` under primary | `OFFLINE` under primary |
| reset | primary `loading` | n/a (email already known) | existing | existing (`OFFLINE` vs "couldn’t send") |
| picker | none (bundled data) | "No country or region matches" | n/a | works offline |
| gate waits | `Hold` (spinner after 400ms, message at 8s) | n/a | `profileError` path unchanged; row wait capped at 4s | "Still connecting…" at 8s |

The intro does not cover the sign-in screen. The intro spec owns when the intro plays. Nothing here waits on it, because the screen is inline and has no native modal to race the overlay.

---

## 14. Accessibility

- Every control is at least 44pt (provider rows 48, Continue 48, title-bar controls 44×44, resend and links `minHeight: 44`).
- Contrast: every pair used is already audited by `check-contrast.mjs`:
  - `text` / `textMuted` / `wine` / `danger` on `bg` and `surface`
  - `textFaint` borders on `surface`
  - `facebook` on `surface`
  - The Google mark is a logo and exempt, and the row's label carries the meaning.

  No new pairs.
- On every step change, VoiceOver focus moves to the title bar's title: `AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus')` after 300ms, the same pattern as `useInitialFocus` in `PasswordResetOverlay`. Only in the focused scene.
- Labels:
  - Each `GroupInput` speaks its row label, and the helper is its `accessibilityHint`.
  - The country row is a button with a hint.
  - The read-only email row says "Double-tap to change".
  - The code field has a label and a spoken value. The cells are hidden.
  - Spinners set `accessibilityState.busy` on their control.
- Every error and notice goes through `useAnnounce`. The existing 800ms de-duplication covers two mounted gates.
- Dynamic Type:
  - Rows use `minHeight`, never `height`, so they grow.
  - Title bar title `maxFontSizeMultiplier={1.3}`.
  - Code cell digits `maxFontSizeMultiplier={1.4}`. The cells are a fixed 56pt, so the cap keeps the digits inside them.
- Reduce Motion: no step fade, and `PressableScale` already honours the setting.
- No colour-only signals. Errors always come with text, and focus is a border colour plus the caret.

---

## 15. Security and privacy

- The phone number and code are never logged, never put in a URL and never persisted by the app. supabase-js persists only the session.
- Provider tokens: Google's is dropped. Facebook's stays memory-only, as today. The `setSession` two-token handover is unchanged.
- OTP brute force: Twilio Verify allows 5 checks per code, the client locks at 5, and GoTrue rate-limits verify per IP.
- SMS pumping (toll fraud) is controlled **server-side**, where it actually works:
  - Twilio Verify Fraud Guard (on by default)
  - Verify Geo Permissions limited to the countries Sipply serves
  - Supabase's SMS rate limit

  A client-side country allowlist would be decoration, because an attacker calls GoTrue directly. The picker therefore lists everything, and an unserved country fails with `sms_send_failed` and its "use another way" copy.
- The email lookup: §10.1 (metered, IP never stored, rows expire after an hour).
- `flowType` stays implicit, and `detectSessionInUrl` stays off. Password recovery depends on both.

---

## 16. Docs (ship with the flags, not after)

`docs/` is the live GitHub Pages site and republishes when `main` moves. **The privacy changes must be on `main` before either new flag is `on` in a build anyone can install.**

- `docs/privacy.md`:
  - Add "**Phone number sign-in (only if you use it).**" Our authentication provider keeps the number you sign in with, to sign you in and nothing else. It is never shown to other users. To deliver the code, the number is passed to Twilio, which sends the text message and keeps it under its own policy. It is not used for contact matching unless you also choose to become findable under Find friends.
  - Add "**Continue with Google (only if you use it).**" Google gives our authentication provider your name, email address, a link to your profile picture and an identifier for you. Your name becomes your display name if Google is how you sign up. Google's temporary access key is discarded on your phone and never stored.
  - Update "**Account.**" from "Your email address" to "Your email address or phone number, whichever you sign in with".
  - Add one sentence where the matching limits are described: "To limit how often anyone can check whether an email has an account, a scrambled form of your IP address is kept for one hour."
  - Bump **Last updated**.
- `docs/appstore.md`, App Privacy table:
  - Contact Info → Phone Number: "The sign-in number for anyone who signs in by phone, kept by the authentication provider; otherwise only as a salted hash, and only for someone who makes themselves findable."
  - Identifiers → User ID: add "the id Google issues".
  - Usage Data → Other Usage Data: add the hour-long lookup meter.
  - The privacy manifest needs no change: phone number, email, name and user ID are already declared.
- `docs/testflight.md`, Beta App Review notes: add the Supabase test phone number and its fixed code (§18 A5), so reviewers can try phone sign-in without a real SIM. The demo email account stays the primary path.

---

## 17. Verification (engineer)

1. `npx tsc --noEmit`, `npx expo lint`, `node scripts/check-design.mjs` (no emoji, no stray hex: the Google colours live only in `theme.ts`), `node scripts/check-contrast.mjs`.
2. `node scripts/check-phone.mjs`. A new script that imports `../src/lib/phone.ts`, works on Node 26 with no flags, asserts this table, and exits 1 on any mismatch:

   | country | typed | `toE164` |
   |---|---|---|
   | PR (1) | `7875550134` | `+17875550134` |
   | PR | `(787) 555-0134` | `+17875550134` |
   | US | `1 787 555 0134` | `+17875550134` |
   | US | `0875550134` | `null` (first digit 0) |
   | US | `787555013` | `null` (9 digits) |
   | GB (44) | `07700 900123` | `+447700900123` |
   | IT (39) | `0612345678` | `+390612345678` (trunk 0 kept) |
   | ES (34) | `612345678` | `+34612345678` |
   | any | `+44 7700 900123` | `+447700900123` |
   | any | `+1234` | `null` (too short) |
   | DO (1) | `8095550134` | `+18095550134` |

   Also check `formatNational(PR, '7875550134') === '(787) 555-0134'`, `displayPhone('+17875550134') === '+1 (787) 555-0134'` and `matchDial('447700900123', ['1','44','4']) === '44'`.
3. On a device or simulator dev build. No new native code, so the existing dev client works.
   - **Flags off (all four):** one email group, no rule, no rows. Lookup works for each of `new`, `password` and `unknown`: rename the function in a scratch database, or exhaust the meter with 30 quick tries.
   - **Phone on, Apple off:** country and phone group plus the email row only.
   - **Everything on:** all four rows, in order.
   - **Phone:** Use a Supabase test number (§18 A5). Run send, then wrong code ×1 (error), then the right code (in). A new number goes to Choose a username and then Welcome. Check that Welcome's Find friends phone field is prefilled. Also run: resend countdown, five wrong codes (lock), and switching to Profile mid-code and back (same step, same digits, same countdown).
   - **Email:** run new → create → (confirmations on) the notice keeps across the move to sign-in. Existing account → sign in. Social-only email → "Sign in another way". Forgot → the reset link still opens `PasswordResetOverlay`.
   - **Google:** first sign-in → username step with the name prefilled. Second sign-in → straight in. Cancel the sheet → no message.
   - **Apple, Facebook:** behaviour unchanged, new look.
   - **Close** on Home → Dex. Close on `/user/[id]` opened cold from a link → Home (`leave`).
   - **Country picker:** search `puer`, `pr`, `+44`, `44` and `españa` (no match, because names are English; correct), swipe down to dismiss, VoiceOver through the rows.
   - **VoiceOver end to end:** on each step change focus lands on the title, errors are spoken once, and the code autofills from Messages.
4. A **real** SMS once, to Jan's own number, before the flag goes on in TestFlight.
5. After the archive: `scripts/check-native-links.sh` passes unchanged. No native module was added; `expo-symbols` was already in the build.

---

## 18. Jan's setup checklist (outside the code)

Order matters. Do A–D before setting either flag to `on`.

**A. Phone, with Twilio Verify**
1. Create a Twilio account and add billing. Verify is billed per successful verification plus the carrier SMS fee, so check Twilio's Verify pricing page for PR and US rates.
2. Twilio Console → Verify → Services → **Create**. Friendly name `Sipply` (it appears in the text: "Your Sipply verification code is …"), code length **6**. Leave Fraud Guard **on**. Under the service's **Geo permissions**, allow only the countries you serve. The proposed starting set is Puerto Rico, United States, US Virgin Islands, Canada, Dominican Republic, Mexico, Colombia and Spain. Adding a country later is a Twilio setting with no app change.
3. Copy the **Account SID**, the **Auth Token** and the Verify **Service SID**.
4. Supabase → Authentication → Sign In / Providers → **Phone**:
   - Enable phone provider: on.
   - SMS provider: **Twilio Verify**. Paste the three values.
   - Phone signups: on.

   Save.
5. Same page, **Test phone numbers and OTPs**: add one test entry in the form `17875550100=123456`, valid for at least 3 months. TestFlight testers and App Review use it, and no SMS is sent or billed. Put it in `docs/testflight.md` (§16).
6. Supabase → Authentication → **Rate Limits**: keep "SMS messages sent" at the default 30/hour for TestFlight, and raise it to 100/hour before the App Store release. It is project-wide, and anyone past it gets the "Too many codes" copy.

**B. Google**
1. Google Cloud console → create a project named `Sipply`, or reuse one. Open **Google Auth Platform** (formerly "OAuth consent screen"):
   - Branding: app name Sipply, support email, home page `https://janmcq1617.github.io/drinkdex/`, privacy `…/privacy`, terms `…/terms`, and authorized domain `<your-project-ref>.supabase.co`.
   - Audience: External.
   - Data access: scopes `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. All are non-sensitive, so no security review is needed.
2. Clients → **Create client** → type **Web application** (not iOS: the flow runs through Supabase's web callback). Under Authorized redirect URIs, add the **Callback URL** shown on Supabase's Google provider page (`https://<project-ref>.supabase.co/auth/v1/callback`). Copy the Client ID and the Client secret.
3. Supabase → Authentication → Sign In / Providers → **Google**: enable, paste the Client ID and Client secret, and save. Leave "Skip nonce checks" off (it only matters for native ID tokens, which this flow doesn't use).
4. Audience → **Publish app** ("In production"). In Testing mode, only listed test users can sign in.
5. Optional, cosmetic: until Google verifies the branding, its account chooser says "to continue to <ref>.supabase.co". Submitting branding for verification fixes that with no code change. It needs `janmcq1617.github.io` verified in Search Console (an HTML file in `docs/`).

**C. Supabase (both)**
1. Authentication → URL Configuration → Redirect URLs: confirm `drinkdex://auth/callback` is listed. It was added for Facebook, and Google returns to the same URL.
2. SQL editor: apply `supabase/migrations/016_sign_in_lookup.sql` and run its VERIFY block. **This must be done before any build with this screen ships, flags or not.** The email step calls the RPC whenever email is used. Without it, everyone gets the "unknown" fallback, which works but never detects sign-up.
3. After the first phone lookup from a real device, run the last VERIFY query and check that `fell_back` is false.

**D. Docs**
1. Merge the §16 edits to `main` so Pages republishes. Check that `/privacy` shows the phone and Google sections.
2. App Store Connect → App Privacy: update the three rows in §16.

**E. Flags**
1. In `.env`, set `EXPO_PUBLIC_PHONE_SIGN_IN=on` and/or `EXPO_PUBLIC_GOOGLE_SIGN_IN=on`. Google shows only while `EXPO_PUBLIC_APPLE_SIGN_IN=on`.
2. JS only: ship with an EAS Update or the next build.

---

## 19. Coordination with other specs in this batch

- **Design language / anti-slop spec:**
  - It owns `radius.control` (or its equivalent) and any global `Button` reshaping. This spec only consumes them (§4).
  - The provider row (white fill, 1pt espresso border, squared) and the bordered field group are this screen's version of "visible borders, no ovals". If that spec defines a shared outlined-button or field-group primitive, implement `ProviderButton`/`FieldGroup` on top of it rather than alongside it.
- **Tab-switch "cream screen" spec:** both specs touch `AuthGate`'s blank states. The cross-check merged them into one body (§9.1) built by package C2: 06's `Hold`, `rowWaitOver` and `ROW_WAIT_MS` with this spec's `SignInScreen`, `onClose` and all-accounts row wait.
- **Intro on every cold start spec:** no dependency. The sign-in screen is inline and never presents a native modal that could rise above the intro overlay.
- **Profile spec:** `ChooseUsername` stays in `AuthGate` and keeps using the shared `Field`. If the profile spec restyles `Field`, this screen inherits it.
- **Migrations:** this one is independent of the others. Take the next free number at build time.
