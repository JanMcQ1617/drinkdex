# v4.10 · The email field that dropped its keyboard (build 34, release blocker)

28 Oct 2026. Jan's screen recording of build 34 (TestFlight): signed out, **Continue with email**, tap **Email**, type. The keyboard rises and falls again at once, the field keeps only the first letter (`z`), and the tab bar keeps reappearing at the foot of the page. An address cannot be typed at all. Sign in with Apple works, because it types nothing.

| | |
|---|---|
| Cause | `src/components/ui.tsx:1786` in build 34 (`b0816cf`): Field's outer wrapper, `<View style={[slot && ringColor ? styles.fieldLifted : null, style]}>`, with `fieldLifted: { zIndex: 1 }` (`:2547`) |
| Since | 1 Oct 2026 (`941d71f` "Sign-in screen in the new layout" and `7be5267` "Design v2", one commit time), first shipped in **build 12**. Not v4.9. |
| Fields hit | Every typed row of a FieldGroup: **Email**, **Password** (sign in and create account), **Phone number** (phone sign-in is off in the build 34 flags, so that row was waiting to break) |
| Fix | One condition: `slot ? styles.fieldLifted : null` (`src/components/ui.tsx:1810`). A group row is lifted all the time, never only while ringed. |
| Proof | `node specs/v4.10/email-focus.test.mjs` passes on the tree and fails on build 34's `ui.tsx` (§3) |

---

## 1. What the recording shows

The frames were extracted to `/private/tmp/claude-501/-Users-janmcqueeny-Library-CloudStorage-OneDrive-BentleyUniversity-2-Claude-Shit/ce2420cd-7e5f-4a57-afda-480ff8102654/scratchpad/rec1/email/` (the contact sheets `sa.jpg` and `sc.jpg`, and the single frames beside them; a temporary folder, so they may be gone). Read in order, one tap goes:

1. The cursor is in Email and the keyboard is rising, but the label still rests at value size and there is no ring. iOS has focused the field; JavaScript has not yet heard.
2. The 2pt ink ring is drawn, the label has gone to the top, `z` is in the field, and the keyboard is down or going down.
3. The ring is gone. The field is blurred, with `z` in it.

The ring and the lost keyboard arrive **in the same frame**. That is the signature of this cause: the commit that draws the ring is the commit that takes the field out of the window (§2). The `z` is the one letter typed in the gap between steps 1 and 2. Each further tap repeats the loop, which is the flicker. The tab bar "staying visible" is the keyboard uncovering it each time it drops (§5).

## 2. The cause

Field (`src/components/ui.tsx`) draws its focus ring as an overlay (FieldRing) so focusing moves nothing. Inside a FieldGroup the ring also covers the hairline it shares with the next row, so the row was lifted above its siblings with a `zIndex`, **only while ringed**: `slot && ringColor`. And `ringColor` is set by focus (`const ringColor = inError || focused ? …`, `:1779`, from `setFocused(true)` in the input's `onFocus`, `:1842`).

Under Fabric (React Native 0.86.3, the app's version since 30 Sep), a `zIndex` is not only paint order:

1. **It decides whether the View exists natively.** `ViewShadowNode::initialize` (`node_modules/react-native/ReactCommon/react/renderer/components/view/ViewShadowNode.cpp`) makes a View a native view when `zIndex.has_value()` and its position is not `static`; a View's position is `relative` unless it says otherwise (`ReactCommon/yoga/yoga/style/Style.h`). With no style of its own, the wrapper is **flattened** away at rest, and the field's box (a native view, it has the wash fill) is mounted straight into the group's view.
2. **Focus unflattens it.** With `zIndex: 1` the wrapper must become a native view, so the Differentiator (`ReactCommon/react/renderer/mounting/Differentiator.cpp`, `ReparentMode::Unflatten`) creates it and **moves** the box into it: a Remove from the group's view, then an Insert into the wrapper.
3. **A Remove takes the text field out of the window.** On iOS it is `removeFromSuperview` (`React/Fabric/Mounting/ComponentViews/View/RCTViewComponentView.mm`, `unmountChildComponentView`). A UITextField that leaves the window resigns first responder: the keyboard goes down, and the TextInput reports `onBlur`. Nothing in `RCTTextInputComponentView.mm` restores focus when it comes back (`didMoveToWindow` only honours `autoFocus`, once).
4. **Blur undoes it.** `onBlur` sets `focused` false, the ring and the `zIndex` go, the wrapper flattens again, and the box is moved back. The field is now unfocused, holding whatever was typed before step 2.

So every typed row of a FieldGroup lost its keyboard the moment it took it, whether by a tap or by the step's own focus (`useInputFocusOnShow`). A Field on its own never had the lift (`slot` is null outside a group), which is why every other form in the app types normally.

**When.** FieldGroup and the lift arrived together on 1 Oct 2026 and shipped first in build 12 (`b7d134a`); build 11's Field changed only the input's own border colour on focus. `git diff aba8417 HEAD` (build 33 to 34) touches nothing in Field, FieldGroup or any sign-in step. Builds 12 to 34 all have the bug. Nothing in the specs or the notes records an email or phone sign-in typed on a phone since build 12, which is how it lasted.

## 3. The proof

`specs/v4.10/email-focus.test.mjs` is a pure check, no device and no React. It reads Field's outer wrapper out of `ui.tsx`, evaluates its style for every place a field can stand (alone, and as the only, first, middle or last row of a group), focused and not, and applies Fabric's rules: does the wrapper have a native view, and what is its native order (`ConcreteViewShadowNode.h`'s `orderIndex_`, which is the `zIndex`)? It fails if focus changes either. Before it models anything, it reads the five React Native facts above back out of `node_modules/react-native`, and stops if one no longer reads that way.

Abridged:

```
$ node specs/v4.10/email-focus.test.mjs
ok   alone: at rest flattened, order 0; focused flattened, order 0
ok   the only row of a group (Email): at rest a native view, order 1; focused a native view, order 1
ok   the last row of a group (Phone number, Password): at rest a native view, order 1; focused a native view, order 1
ok   a first row of a group: … a native view, order 1; focused a native view, order 1
ok   a middle row of a group: … a native view, order 1; focused a native view, order 1

$ git show b0816cf:src/components/ui.tsx > /tmp/ui-34.tsx
$ node specs/v4.10/email-focus.test.mjs /tmp/ui-34.tsx
ok   alone: at rest flattened, order 0; focused flattened, order 0
FAIL the only row of a group (Email): at rest flattened, order 0; focused a native view, order 1  <- focus reparents the TextInput, which resigns first responder
FAIL the last row of a group (Phone number, Password): at rest flattened, order 0; focused a native view, order 1  <- …
FAIL a first row of a group: …
FAIL a middle row of a group: …
```

`7be5267`'s `ui.tsx` fails the same four places.

## 4. The fix

```diff
-    <View style={[slot && ringColor ? styles.fieldLifted : null, style]}>
+    <View style={[slot ? styles.fieldLifted : null, style]}>
```

A row of a group is always a native view at order 1, focused or not, so focus changes nothing above the box and the text field never leaves the window. The ring is drawn inside that wrapper as before.

- **At rest the group draws exactly as it did.** Every row now sorts above the hairline rules, but at rest no row overlaps a rule.
- **The one cost.** Equal lifts draw in document order, so a ringed row with another row under it would lose the bottom of its ring's outer point (the part past the hairline) under that row's fill. No group has one: every row a person types in is the only row or the last (Email; Password under the read-only address; Phone number under Country or region).
- **Why not the other ways.** `collapsable={false}` alone keeps the wrapper a view, but a `zIndex` that still moved on focus would change a first or middle row's place among its siblings, which is a Remove and an Insert too. Dropping the lift would let the next row's fill cover the ring. The constant lift answers both.

The comment on Field's wrapper now states the rule for any View above a TextInput: nothing that focus or a keystroke changes may give it a native view or take one away (a zIndex, an opacity, a transform, a fill, a border, overflow, pointerEvents, accessible), nor change its key or its type; draw the change in a sibling overlay.

## 5. The tab bar

Not a bug, and not changed. Sign-in is drawn inline in the Home and Profile scenes on purpose, so the tab bar and the Dex stay reachable signed out (`SignInScreen.tsx`'s header). It covers nothing: CabinetSheet ends the form `TAB_BAR_CLEARANCE` (the bar plus 16) and `space.md` (12) above the home indicator, and drops the wordmark at large text sizes or on short screens so the ways in never reach the bar. On the email step Continue sits near the top. In the recording the bar kept showing because the keyboard kept dropping; with the keyboard staying up, the bar is under it for the whole step.

## 6. Every other field, checked for the same cause

The cause is a View above a TextInput whose native shape (exists or flattened, its order, its key, its type) changes on focus or on a keystroke. FieldGroup is used in four places only, all in sign-in, so the lift reached nothing else.

| Field | Where | Verdict |
|---|---|---|
| Email | `EmailStep`, the only row of its group | **The bug.** Fixed |
| Password | `PasswordForm`, the last row, under the read-only address | **The bug.** Fixed |
| Phone number | `PhoneEntry`, the last row, under Country or region | **The bug** (latent: phone sign-in is off). Fixed |
| The read-only address | `PasswordForm`, `ResetStep` | A Field that never takes focus (`editable={false}` under `pointerEvents="none"`); now lifted constantly, inside its own Pressable |
| The 6-digit code | `PhoneCodeStep` | A bare TextInput beside the cells; focus rings a cell from inside the cell, never above the input. Fine |
| Display name, Username | `AuthGate`'s ChooseUsername | Fields on their own. Fine |
| New password, Confirm | `PasswordResetOverlay` | Fields on their own. Fine |
| Every search: the Dex, the + window's "Type your drink", Find friends, country, place, tag people, likers, invite, music, drink tag, My Bar | `SearchField` | Its box always has a fill (wash or white), so it is always a native view; focus swaps the fill and adds the ring as a sibling. Fine |
| Captions | `log.tsx` (the + window), `PostSheet` | Fields on their own, static styles. Fine |
| Find friends' phone number | `FindFriends` | A Field on its own. Fine |
| Tournament name | `tournaments/new.tsx` | A Field on its own. Fine |
| Place search, Name on your post | `PlaceSearchSheet` | SearchField, and a Field on its own. Fine |
| Edit profile, Add a drink, Instagram import, reel review | their screens | Fields on their own, static styles. Fine |
| Collection name | `NameField` | A box that always has its fill and edge; focus swaps only the edge colour. Fine |

And the other ways a field gets remounted or blurred, on the sign-in path:

- **Keys.** SignInScreen keys the step on `view:emailStatus:variant`; none of it changes while typing (`setEmail` sets only the address and clears the error).
- **Components made in a render.** None anywhere in `src`.
- **Focus effects.** `useInputFocusOnShow` runs on the scene's focus, with stable dependencies, not on a render.
- **Keyboard.dismiss.** Nothing on the sign-in path calls it. The pager's own (`react-native-tab-view`'s `PagerViewAdapter.tsx:85`) runs only when the tab index changes.
- **v4.9's additions.** Paper measures and sets state inside itself only, and is placed as a first child (an Insert, never a move). The tab arrival clock drives the large tab titles' swash; the sign-in bar is `md` and draws none. ScreenTopBar's `paper` is not passed by AuthTitleBar. The Rise wrappers hold one animated style at rest. None of them sits above a field with a shape that changes.

## 7. What Jan should test

On the first build that carries this (not 34), signed out, on the phone:

1. **Home → Continue with email.** The cursor lands in Email by itself and the keyboard stays up. Type a whole address: every letter stays, the keyboard never drops, Continue turns on once it looks like an address, and return goes on.
2. **An address with an account.** Password takes the cursor and keeps the keyboard. Tap the eye to show the password: the keyboard stays. Sign in.
3. **A new address.** Create your account: a password of 6 or more, the hint stays under it. The confirmation email should arrive through Resend (the v4.9 check this bug blocked).
4. **Forgot your password?** Then **Change** on the address: back on Email with the address kept, and typing still works.
5. **The look.** Email's ring is the same 2pt ink ring with the group's corners; Password's ring draws over the hairline under the address; at rest both groups look exactly as in build 34.
6. **Profile tab, signed out.** The same steps work there (its own gate).
7. **A quick pass over the rest** (nothing changed there, so this is a regression check): the username step after a new account (Display name, Username), the Dex search, Find friends, a caption in the + window, a tournament name, a place search.
8. **Phone number,** only on a build made with `EXPO_PUBLIC_PHONE_SIGN_IN=on`: the number keeps the keyboard, and after choosing a country the cursor comes back to it.

Not verified here: anything on a device. No simulator or device build was run for this; the evidence is the code path in React Native's own sources, the recording, and the check in §3.

## 8. Files

- `src/components/ui.tsx`: Field's wrapper (the fix), and the comments on it, on FieldRing and on `styles.fieldLifted`.
- `specs/v4.10/email-focus.test.mjs`: the check (`node specs/v4.10/email-focus.test.mjs [path to a ui.tsx]`).
- `specs/v4.10/email-focus.md`: this file.
