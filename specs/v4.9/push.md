# v4.9 · Push: tell people when someone tags, invites or follows them (build spec)

28 Oct 2026. The remote push that `specs/v4.3/spec.md` §2.5 shaped before the Apple push key existed, built now that Jan is making one. Daily ideas (§3 of that spec) do not change: they stay local, scheduled on the phone, and never use anything here.

| Piece | File | Ships |
|---|---|---|
| The data: tokens, switches, ledger, triggers, RPCs, the shared secret | `supabase/migrations/027_push.sql`, mirrored in `supabase/schema.sql` | Jan applies it (§7) |
| The sender | `supabase/functions/push/index.ts` (one file, for the Dashboard editor) | Jan deploys it (§7) |
| The phone's side | `src/lib/push.ts`, `src/components/notifications/AlertsOptIn.tsx`, `NotificationsHost`, `src/lib/notifications.ts`, Settings → Notifications | Build 34 |
| The words for people | `docs/privacy.md` (Notifications from other people) | With build 34 |
| The test | `scripts/check-push.mjs` | Run beside check-ideas |

Rules that hold everywhere (as v4.3 §3.1):

- **App Store 4.5.4.** Notifications are never required: nothing waits on them, and every failure is silent. An in-app screen with plain consent words comes before iOS's prompt, and its Allow is the only yes: iOS allowing Sipply for daily ideas, whose words promise one idea a day, never stands in for it (§3.2). The app has its own off switches, three of them.
- **App Store 1.4.3.** The lines say who did what, never a drink to have, a time, an amount or a count: "ana tagged you in a post.", "ana invited you to Negroni week.", "ana started following you." A tournament name with a digit or a word from the daily ideas' banned list becomes "a tournament".
- **Less stuff.** Three rows in the existing Notifications group, one sheet asked at most once, no new screen, no badge.

---

## 1. The shape

```
post_tags / tournament_members ('invited') / follows
   │  AFTER INSERT (027 §7): cheap checks, then pg_net, ids only,
   │  header x-sipply-push = Vault push_secret
   ▼
Edge Function `push` (Verify JWT OFF)
   1. push_caller_ok(secret)          service_role only: is it our trigger?
   2. APNS_KEY → ES256 provider token  503 here spends nothing
   3. push_claim(secret, kind, subject, recipient)
        re-reads the row, < 1 hour old, no block either way,
        the switch on, never pushed (the ledger row is written here),
        a tag or an invite: the pair's hour free (push_pair taken here)
        → actor's username, tournament name, the recipient's tokens
   4. POST api.push.apple.com/3/device/<token>  (sandbox for dev tokens)
        410 / 400 BadDeviceToken / DeviceTokenNotForTopic → token deleted
   5. no phone took it: 502 not_delivered; and when Apple answered every
        phone (refused key, dead token, any refusal) push_release gives
        the claim back
   ▼
iPhone: "ana started following you." → tap → /user/<id>
```

**Why a trigger, not a Dashboard webhook**: it lives in the repo and is reviewed (v4.3 §2.5.3). **Why the secret is the database's**: the migration makes it in Vault (`push_secret`, 32 random bytes as hex), the trigger sends it, and only the database compares it (`push_caller_ok`, digests, never the text). The function never holds a copy, so nobody ever types or sees it, and rotating it is deleting the Vault row and re-running 027.

**What a forged call can do: nothing new.** Without the secret, a 401 after one RPC. Even with it, `push_claim` only lets through an event that really happened in the last hour, between people not blocked, to someone whose switch is on, never twice, and no more than one tag and one invite an hour from the same person to the same person.

## 2. The data (027)

| Object | What |
|---|---|
| `public.push_tokens (token pk, user_id → profiles cascade, env, created_at, updated_at)` | One row per phone. The token is the key, so a second account registering it takes it over. `env` is `production` (TestFlight, App Store) or `sandbox` (a development build). At most five per account; the least recently seen beyond that are trimmed. Owner-only select; no client writes |
| `public.push_settings (user_id pk, tags, invites, follows, updated_at)` | Per account, all `true` by default; no row reads as all on. Owner-only select; no client writes |
| `private.push_ledger (kind, subject_id, recipient_id) pk, actor_id, post_id, tournament_id, sent_at` | One row per event pushed. Subject: the post (tag), the tournament (invite), the follower (follow). Cascades from both people, the post and the tournament |
| `private.push_pair (kind, actor_id, recipient_id) pk, last_at` | The hour between two people: when `actor` last notified `recipient` of a tag, or of an invite (`kind` is one of those two). Overwritten, never cascading from a post or a tournament, so deleting and making again is no way round it; cascades from either person |
| `register_push_token(p_token, p_env)` | Signed in. Lower-cases and checks the token (hex, 64 to 200), upserts it to the caller, trims to five |
| `unregister_push_token(p_token)` | **Signed in or not**: a signed-out phone takes its own token off. Knowing a token means being the phone (or Apple) |
| `my_push_settings()` → `{ tags, invites, follows }` | Signed in |
| `set_push_setting(p_kind, p_on)` → the three | Signed in; `p_kind` one of the three |
| `push_caller_ok(p_secret)`, `push_claim(p_secret, p_kind, p_subject, p_recipient)`, `push_release(p_secret, p_kind, p_subject, p_recipient)` | **service_role only**: the function's. `push_claim` answers `send` or one word (`gone`, `stale`, `blocked`, `off`, `no_device`, `duplicate`, `limited`, `forbidden`, `bad_request`). `push_release` deletes one claim's ledger row from the last ten minutes, and the pair hour that claim took, and answers true or false |
| `post_tags_push`, `tournament_members_push` (when status = 'invited'), `follows_push` | AFTER INSERT, each catching everything: a warning, never a refused insert |
| Vault `push_secret`, `push_url` | Made by 027 if absent. `schema.sql` makes only the secret, so a new project's triggers stay inert until its own `push_url` is stored |

**Rate limits.** The ledger's key makes each event go out once: one follow push per follower and followed person, ever (unfollow and follow again is silent); one tag push per post and person; one invite push per tournament and person. That alone would let one person flood another (post, tag, delete the post, again; or host, invite, delete the tournament, again: `create_tournament`'s caps count surviving tournaments only, and the ledger's tag and invite rows go with their post or tournament). So `push_pair` also allows **one tag push and one invite push an hour from the same person to the same person**; the rest answer `limited`, queue no call at all (the trigger reads the pair too), and still show in Activity. Follows need no pair row: their ledger key is the pair. Run on PGlite with stand-ins for Vault, pg_net and auth (§8): the post-tag-delete loop and the host-invite-delete loop each send once, then `limited`.

**Inert until configured.** Nothing is queued for anyone with no token, and only build 34 registers. Before the function exists the calls answer 404; before `APNS_KEY` and `APNS_KEY_ID` exist they answer 503 before claiming, and the hour's limit keeps older events from going out on the day it is configured. pg_net only logs answers.

**Spent unless Apple refused it.** Nothing retries a push. Once claimed, an event is used up even if Apple did not answer (a timeout may still have been shown): never twice beats at least once for "someone followed you". But when Apple answered every phone and accepted none (a refused provider token, for a wrong Key ID, Team ID or key; a dead token; any other refusal), nothing can have been shown, so the function calls `push_release` and the claim is given back, ledger row and pair hour: the fault, once fixed, does not leave that follower and followed pair silenced forever. Either way, no phone taking it answers **502** `{"result":"not_delivered","sent":0,…,"released":true|false}`, so `net._http_response` shows the failure; only **200** `{"result":"sent","sent":1,…}` is a delivery.

## 3. The phone (build 34)

### 3.1 Registration (`src/lib/push.ts`)

The token is on the server while, and only while, all of these hold: someone is signed in, that account said yes to the alerts' own ask on this phone (`consent`, §3.2), iOS allows Sipply's notifications, 027 answers, and at least one of the three switches is on. Checked at launch, on returning to the app, on sign-in, sign-out and account change, when iOS's answer changes (from any door), when Apple rolls the token (`addPushTokenListener`), and after a switch changes. One run at a time; once per run of the app it registers even when nothing changed, so `updated_at` says which phones are still in use.

- **Signing out** needs no hook in `store/auth.ts`: `unregister_push_token` takes the token alone and works signed out, so it runs from the auth store's own change once the session is gone. The token is kept on the phone until the server confirms, so a sign-out with no connection finishes on a later launch. Account deletion cascades on the server.
- **Environment**: a release bundle is `production`, a `__DEV__` one `sandbox`. TestFlight and the App Store sign with `aps-environment` production.
- **Signed out with a push arriving in front**: not shown (`setupNotifications`); it is news for an account that is not on the phone.
- iOS only. Web and Android are no-ops; the server speaks APNs alone.

### 3.2 The ask (`AlertsOptIn`, frame not drawn; words below)

The daily ideas' ask promises "one notification a day" and nothing else, so these alerts have their own sheet, the same `BottomSheet` and keys:

| Piece | Words |
|---|---|
| Title | **Hear when someone tags, invites or follows you?** `body` 600 |
| Body | "Sipply can send you a notification when one of these happens:" |
| Panel (`wash`, radius 12, as the ideas' example) | three lines, each a 22 pt glyph in ink and `small` text: *users* "Someone tags you in a post", *trophy* "Someone invites you to a tournament", *addPerson* "Someone starts following you" |
| Small print | `small` `muted`: "Each has its own switch in Settings, under Notifications. Daily ideas stay as they are. Next, iOS asks you to allow them." (the last sentence only before iOS has been asked) |
| Keys | **Allow these notifications** (primary); **Not now** (text, `muted`) |

**When.** Once per account on each phone, ever: the first time **Activity** is open (where tags and new followers already show, reached from the heart on Home, so never on first launch), signed in, 027 answering, the app in front, no answer kept yet, and iOS **not refusing**, 800 ms after Activity arrives. Settings also opens it when someone ticks one of the three without having said yes on this phone.

**Its own yes (`consent` in `lib/push`, persisted in `sipply-push.v1`, per account id, the five most recent kept).** Allow is `yes`; the sheet going up writes `no` until Allow, so Not now, a swipe, or the app closing under it all stay `no`. Nothing registers without `yes`. **Already allowed for daily ideas**: that ask said "Never more than one a day", so iOS allowing Sipply is not a yes to these. Such a person gets this same sheet once on Activity, without the iOS sentence, and Allow registers the token with no iOS prompt. **Not now is kept**: allowing daily ideas later, or turning notifications on in iOS Settings, never turns it round; only ticking a box in Settings, which opens this sheet again, and its Allow do. **Refused in iOS**: never asked by the app again; Settings sends them to iOS Settings.

### 3.3 Settings → Notifications

The existing group gains three rows after Daily ideas and Time, each the 22 pt squared `Box`, wrapped as one VoiceOver switch, as Daily ideas is:

| Row | Ticked when | Line under the title | Hint |
|---|---|---|---|
| **When someone tags you** | on for the account, said yes to on this phone, and iOS asked | "Off in iOS Settings" when ticked but refused in iOS | "A notification when someone tags you in a post" |
| **Tournament invites** | same | same | "A notification when someone invites you to a tournament" |
| **New followers** | same | same | "A notification when someone starts following you" |

- Until the yes on this phone every box is unticked, even with iOS allowing Sipply for daily ideas; ticking one opens the alerts' ask (it names all three), and Allow then also turns that one on if the account had it off.
- Refused in iOS: the same "Notifications are off for Sipply" alert as Daily ideas, with Open Settings, and nothing changes.
- Unticking saves at once (shown at once, put back with "Could not change that" if the server refuses); the last one off takes the token off the server.
- Read again each time Settings shows (another phone may have changed them). Shown only once the server has answered (027 applied).

### 3.4 Taps

`data: { kind, url }` rides in the payload's top-level `body` dictionary, which is where expo-notifications reads a remote notification's data on iOS (`NotificationRecords.swift`, `serializedNotificationData`); `lib/notifications` also falls back to the trigger's payload. `/post/<id>` and `/user/<id>` were already allowed; `/tournaments/<id>` is added and pushed as `/tournaments/[id]`.

## 4. The words and the payload

```json
{ "aps": { "alert": { "body": "ana started following you." }, "sound": "default", "thread-id": "follows" },
  "body": { "kind": "follow", "url": "/user/<follower id>" } }
```

- Body only: iOS's first line is the app's name. No badge. Threads `tags`, `invites`, `follows`.
- Headers: `apns-topic: com.janmcqueeny.drinkdex`, `apns-push-type: alert`, `apns-priority: 10`, `apns-expiration` a day ahead, `apns-collapse-id: <kind>:<subject>`.
- Longest line: a 24-character username and a 40-character tournament name, 84 characters; the payload a few hundred bytes (Apple allows 4 KB).
- The provider token: ES256, header `{ alg, kid }`, claims `{ iss, iat }`, reused for 50 minutes per isolate. `APNS_KEY` is read tolerantly: BEGIN/END lines (dashes or not), escaped `\n`s, and every non-base64 character are stripped.
- Nothing about a person is logged by the function: Apple's reason codes and one-word results only.

## 5. Privacy and App Store

- `docs/privacy.md`: **Notifications from other people (only if you allow them)** in What Sipply stores: asked on its own screen, separately from daily ideas, the token, the switches, the phone remembering the answer, the notes of what was sent, and the hour-between-two-people record (kept until either account is deleted); the daily ideas paragraph now says they never use the token; Apple's Push Notification service named under Who else can see it; tokens, switches and notes added to Deleting your account. **Last updated 28 October 2026.**
- **App Privacy (recommendation; nothing changed in App Store Connect):** the questionnaire **already has** an **Identifiers → Device ID** row, answered **not linked** (Expo's random installation id; `docs/appstore.md`'s table). **Change that row** to **Linked to the user** (a push token is stored with the account), purpose **App Functionality** only, **not used for tracking**; do not add a second one. No other new type: the events were already collected (follows, tags, tournaments).
- **The privacy manifest ships in the binary, so it has to change in build 34 itself**: `app.json` → `ios.privacyManifests.NSPrivacyCollectedDataTypes`, the `NSPrivacyCollectedDataTypeDeviceID` entry, `NSPrivacyCollectedDataTypeLinked` from `false` to `true` (purposes stay App Functionality, tracking stays false), with the `buildNumber` bump to 34. An over-the-air update cannot change it (`docs/appstore.md` says so already).
- Left for the lead (not this package's files):
  - `app.json`: the manifest change above and build 34.
  - `docs/appstore.md`: the Device ID row (its "nothing ties it to an account" stops being true: say it is also the push token, kept with the account, from build 34); the "Build 25 never asks for a push token" paragraph and its `grep -rnE 'PushTokenAsync|AutoServerRegistration' src` check, which now finds `src/lib/push.ts` (rewrite to: from build 34 the token is asked for only after the alerts' own Allow, and kept with the account); the "becomes linked in a build that ships before the pushes go out" paragraph, now done by build 34.
  - **Review notes** (1.4.3's closest look is at Tournaments): the Tournaments paragraph says "No prizes, no entry fees, no streaks, no meters, no notifications." That stops being true. Suggested: "No prizes, no entry fees, no streaks, no meters; its only notification is the invite, naming host and tournament." (+47 characters; the paragraph 880, or 707 without the Friends board sentence). The board sentence's "no notifications" stays true (the board sends none). A new paragraph, 199 counted the file's way (spaces collapsed, `**` dropped): "**People notifications (optional).** A tag, a tournament invite or a new follower ("ana started following you."). Their own in-app screen asks first, then iOS. Three switches in Settings → Notifications." With Places, the 3,831 configuration becomes 3,831 + 47 + 2 + 199 = **4,079, 79 over**, so something else has to give; count before pasting.
  - `specs/v4.3/spec.md` line 465, "tournaments send none", is stale for the same reason: from v4.9 a tournament sends one push, the invitation.
  - `docs/data-deletion.md`, **From our servers**: device tokens, notification switches, the notes of notifications sent, and the hour-between-two-people records.
  - 027's five RPCs in `src/lib/database.types.ts`, optional (until then `lib/push` calls its four untyped and shape-checks every answer).

## 6. Checks

`node scripts/check-push.mjs`: the key in 13 pastings comes back as the same PKCS#8 bytes and nonsense is refused; the provider token's exact header and claims and a signature node verifies; the 50-minute reuse; every line under 120 characters, the 1.4.3 list, no digit, a full stop last; the fallback for a listed or numbered tournament name; every url on the app's own allowlist with a router case; the handler with Supabase and Apple stubbed (401 with no database call, 401 after `push_caller_ok` alone, 503 that spends nothing, 200 that sends nothing, `limited` included, three phones on two hosts with every header, dead tokens deleted, a refused provider token re-signed and its claim given back with a 502, every token dead given back, an unanswered phone kept spent, no id, token, secret or name in the logs); and the contract between 027, the function and `lib/push` (RPC and argument names, the switch and kind names, the header, the pair's hour the same in the trigger and the claim, definer and empty search_path on every function, the record last, `schema.sql` carrying it all).

## 7. Jan's steps, in order

1. **Make the push key.** developer.apple.com → Certificates, Identifiers & Profiles → **Keys** → **+**. Name it "Sipply push", tick **Apple Push Notifications service (APNs)**, then **Configure**: Environment **Sandbox & Production**, Key Restriction **Team Scoped (All Topics)**. Save, Continue, Register. **Download the .p8 now** (Apple offers it once) and note the **Key ID** (10 characters) on that page. Keep the .p8 out of the repo (`*.p8` is gitignored).
2. **Check the App ID.** Identifiers → `com.janmcqueeny.drinkdex`: **Push Notifications** is ticked (it has been since build 25). Nothing to configure there: no certificate is needed with a key.
3. **Add two Edge Function secrets.** Supabase Dashboard → Edge Functions → **Secrets** → Add: `APNS_KEY` = the whole .p8 text, pasted as is (one line is fine); `APNS_KEY_ID` = the Key ID. Check `APPLE_TEAM_ID` is already there (Sign in with Apple uses it).
4. **Deploy the function.** Edge Functions → **Deploy a new function** → **Via editor**, name it exactly `push`, paste `supabase/functions/push/index.ts`, Deploy. Then its **Settings** tab: turn **OFF** "Verify JWT with legacy secret", Save.
5. **Check it answers.** In Terminal: `curl -s -X POST https://yklknprzyoebzgazcmhj.supabase.co/functions/v1/push -H 'content-type: application/json' -d '{}'`. Expect `{"error":"forbidden"}`. Anything mentioning an authorization header means Verify JWT is still on (step 4). A 404 means the name is not `push`.
6. **Apply 027.** SQL Editor → paste `supabase/migrations/027_push.sql` → Run. Then run its VERIFY block from the file's header, one query at a time, and the rolled-back smoke test with your id and a second account's id (one that does not follow you). If the app later says nothing about the switches, Settings → API → **Reload schema**.
7. **App Privacy.** App Store Connect → Sipply → App Privacy: **change the existing Device ID row** from not linked to **linked**, App Functionality only, not tracking (§5), and publish, before build 34 goes to review. Build 34's `app.json` manifest must say linked too (the lead's list in §5).
8. **Test on build 34** (TestFlight). On your phone: sign in, open Activity; the ask appears once (tap Allow; if notifications are already on from daily ideas there is no iOS prompt after it). Settings → Notifications shows the three boxes ticked. From a second account (any build, any phone) follow your account: within seconds your phone shows "<their username> started following you."; tapping it opens their profile. Then in the SQL editor: `select status_code, left(content::text, 200), created from net._http_response order by created desc limit 5;` shows `200` and `{"result":"sent","sent":1,...}`; only that is a delivery. Unfollow and follow again: nothing (once per pair, ever; the trigger reads the ledger and queues no call). Untick New followers and have a third account follow you: nothing, and no call is queued either.
9. If step 8 shows `503`: a secret is missing or misshapen (the function's Logs say which). `502` with `"result":"not_delivered"`: no phone took it. With `"released":true` and `ExpiredProviderToken` or `InvalidProviderToken` in the Logs, the key, Key ID or Team ID is wrong; with `"dropped":1`, Apple called the token dead (a development build's token sent as production, or the other way; open the app again and it re-registers). Either way the claim was given back, so after the fix the same second account can unfollow and follow again to test. With `"released":false`, Apple did not answer (the Logs say "did not answer"); that follow stays spent, so test with another account, or clear it by hand: `delete from private.push_ledger where kind = 'follow' and recipient_id = '<your id>';`.

## 8. Not verified here

- The SQL has never run on Supabase. It has run on PGlite (Postgres 17, `@electric-sql/pglite` 0.3.16 from netlify-cli's install) with stand-ins for Vault, pg_net, `auth.uid()` and the tables 027 reads: applied twice (re-run safe), then follow send, duplicate, give back, send again, forbidden; the post-tag-delete loop sending once then `limited` with no call queued and no ledger row left; another person's tag not limited; a given-back tag claim freeing its hour; the hour passing; a claim older than ten minutes refused by `push_release`; the host-invite-delete loop sending once then `limited`; the pairs cascading with the account; the privileges and RLS. The header's own smoke test also ran there and rolled back clean. Supabase's real Vault, pg_net and roles are the VERIFY block's to prove.
- The function was run under Node with Deno and supabase-js stubbed, never on Supabase's Edge runtime. Its fetch must speak HTTP/2 to APNs (Apple requires it); Deno's fetch negotiates it by ALPN, but only step 8 proves it from Supabase.
- `pg_net`'s `net.http_request_queue` is read by the smoke test; if the editor's role cannot read it, drop those three lines.
- Nothing ran on a phone: the ask, the switches, the token and the taps need build 34.
