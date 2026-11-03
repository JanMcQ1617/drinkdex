# v4.14 · Find friends without Instagram

3 Nov 2026. Jan, on Find friends: remove the Instagram part only. Keep **Share invite link**, **Find by username** and the **Everyone on Sipply** list.

| Piece | Where | State |
|---|---|---|
| The section itself, and the handle claim inside it (`Findable`) | `src/components/InstagramImport.tsx` | **deleted** |
| Reading the download: unzip, parse, hash, the paste fallback, the closeness sort | `src/lib/instagram.ts` | **deleted** |
| The column that drew it, on Find friends and at signup | `src/components/FindFriends.tsx` | `<InstagramImport />` and its import gone; the doc says why |
| The Find friends screen | `src/app/find-friends.tsx` | header comment only (four fields → two) |
| The signup step "Find your people" | `src/components/WelcomeConnect.tsx` | comment only: it draws `FindFriends`, so it lost the section with it |
| Settings → Find friends, its spoken hint | `src/app/settings.tsx` | "… search and Instagram" → "Contacts, Facebook, invites and search" / "Contacts, invites and search" (now in the screen's order, as its comment says) |
| A matched person's second line and its opt-out of Follow all | `src/components/PeopleList.tsx` | `MatchEntry.note`, `MatchEntry.bulk` and `PersonRow`'s `note` gone: only the Instagram rows used them |
| A word set in ink inside a section's line | `src/components/profile/FindSection.tsx` | `FindEm` gone (only the Instagram steps used it) |
| The Instagram outline glyph | `src/components/icons.tsx` | gone (nothing had drawn it since v4) |
| Handle storage, the request stamp, the import's quota message, parking a handle at signup | `src/lib/discovery.ts` | gone; `retireInstagram` added (§3) |
| `setInstagramHash`, `matchInstagram` | `src/lib/social.ts` | gone; `clearInstagramHash` (null only) added for §3 |
| The signup drain writing a parked handle | `src/store/auth.ts` | gone; the profile load runs `retireInstagram` |
| Comments that named the import | `src/components/ui.tsx`, `src/lib/facebook.ts` | reworded |
| The proof | `node specs/v4.14/find-friends.test.mjs` | new (§6) |

Nothing else moved. No server table, function or migration changed; no package was added or removed; no native code changed; `src/components/dex/*` and `docs/` were not touched, and of `src/data/*` only the daily idea `friends-08` (§5, in build 40's review).

---

## 1. What went

Every part of the **Bring your Instagram friends** section, on every screen it was drawn on (Find friends, and the signup step, which renders the same `FindFriends`):

- the lede ("Instagram doesn't let any app read your follower list…")
- step 1, **Request your list** (opened Instagram's Download your information page), and its folded "Requested … ago" line
- step 2, **Choose the download** (the .zip picker), and **Open Instagram's page**
- **Paste a list of usernames instead**, its field and **Find these people**
- the results ("N of your M Instagram connections are on Sipply"), **Check my N connections again**, **Import a newer list**, **Forget my imported list** and its confirm
- the handle claim under it: **Let Instagram friends find you**, **Let friends find you as @…**, **Use a different username**, the "Your Instagram username" field, its **Make me findable** and **Stop being findable**
- in Settings, "and Instagram" from the Find friends row's VoiceOver hint

And the code that only served it: the two files above, the hash and match wrappers, the AsyncStorage helpers for the handle and the request stamp, `RATE_LIMITED_IMPORT_MESSAGE`, `setPendingClaims` (already uncalled; it was the only thing left that could park a handle), `FindEm`, the `note`/`bulk` fields, and the unused Instagram glyph.

## 2. What stays

Unchanged, in this order, on Find friends and at signup:

1. **Friends you already know**: Find from contacts (the one ink key)
2. **Friends from Facebook**, only while `EXPO_PUBLIC_FACEBOOK_FRIENDS` is on (it is off)
3. **Let friends find you**: your phone number, Make me findable / Stop being findable
4. **Invite a friend**: **Share invite link**
5. **Find by username**: the search field and its results

and under them on the Find friends screen, **Everyone on Sipply**. Jan named 4, 5 and the list; 1 to 3 are not Instagram, so they stay as they were.

## 3. What the import left on a phone

A phone that used the section on build 39 or earlier holds the imported list (up to 5,000 other people's usernames, `clink-ig-connections`), when it was asked for (`clink-ig-requested`) and the handle its account claimed (`clink-ig-handle`), whose salted hash is on the server in `profile_secrets.instagram_hash`. The buttons that forgot them went with the section, and the privacy policy promises they can be forgotten, so `retireInstagram` (lib/discovery) does it by itself:

- runs after every successful profile load, beside `drainPendingClaims`; on a phone that never used the import it removes two absent keys and reads one, with no network
- removes the list and the stamp
- only if this phone remembers a handle: `set_instagram_hash(null)` (the old opt-out), then forgets the handle. Offline, the handle stays and the next load tries again
- a server that has dropped `set_instagram_hash` counts as withdrawn, so the later cleanup (§4) cannot leave phones retrying forever
- sign-out's `clearDiscoveryCache` still names all three keys, for a phone signed out before the retire ran

A handle parked at signup by builds 8 to 11 is no longer written: the drain writes the number and lets the handle go with the record.

**What this cannot reach:** a claim made on another phone, or on this phone before a sign-out cleared its record. Those hashes stay on the server, and builds up to 39 can still match against them, until the server cleanup below.

## 4. Server objects now unused (for later; nothing applied)

| Object | Defined in | Note |
|---|---|---|
| `public.profile_secrets.instagram_hash` and index `profile_secrets_instagram_idx` | 008, `schema.sql` | Dropping the column withdraws every claim at once, including the ones §3 cannot see |
| `public.match_instagram(text[])` | 008, 010, 011, `schema.sql` | No v4.14 client calls it |
| `public.set_instagram_hash(text)` | 008, 011, `schema.sql` | v4.14 calls it only with null (§3); drop it in the same migration as the column, not after: a function left behind would fail on the missing column instead of reading as missing |
| `'instagram'` in `discovery_usage.matcher`'s check, and `private.charge_discovery('instagram', …)` from `match_instagram` | 011, `schema.sql` | Old rows age out of the 24-hour window by themselves |
| `ProfileSecretRow.instagram_hash`, `Functions.match_instagram`, `Functions.set_instagram_hash` | `src/lib/database.types.ts` | Left as they are: they mirror the server. Remove with the migration |

The `heard_from` value `'instagram'` (migration 022, the onboarding question "where did you hear about Sipply") is unrelated and stays.

Timing: dropping these breaks the Instagram section on any build up to 39 still installed (its save and its match would fail, with the error notices it already has). Safest once v4.14 is the version on sale and the build-39 TestFlight has expired or been replaced.

**Package now unused:** `fflate` (`package.json`, only `src/lib/instagram.ts` imported it). JS only, nothing native. Not removed here, so `package-lock.json` and `node_modules` do not move under the other lanes; `npm uninstall fflate` when nothing else is installing.

## 5. Copy outside this change's lane

**The daily idea `friends-08`** (`src/data/dailyIdeas.ts` line 301, and its twin in `specs/v4.3/ideas.mjs` line 253) said *"Bring your Instagram friends: Sipply can match them from a file Instagram sends you."* and opened Find friends, where there is no such thing any more. Reworded in both files in build 40's review, same id, and `check-ideas` passes:

> Add your number in Find friends so people who already have it can find you here.

The test now fails if any daily idea names Instagram (§6).

**Lines in `docs/` that now overstate what the app does** (not edited; listed for Jan):

`docs/privacy.md` (Last updated 28 Oct 2026; bump it)
- L259–272, **Instagram matching (only if you use it)**: the whole paragraph describes the import.
- L274–280: "Either way, the usernames are converted…", "Your Instagram list is never uploaded", and "Your own handle… **Stop being findable** in … Find friends clears it": that control no longer exists (the app withdraws a claim made on that phone by itself, §3).
- L282–286, **Matching limits**: "3,000 phone numbers and Instagram handles, counted together" → phone numbers.
- L303–310, **On your device**: "The phone number and Instagram username you give…", "The Instagram list you import is cached… **Forget my imported list**… clears it", "Signing out clears the Instagram list, the number and the username".
- L420–421: "Choosing an Instagram download involves no connection to Instagram at all."
- L458–459, **Deleting your account**: "(your number, your Instagram username, an imported Instagram list)".
- Still true, keep: L348 (never posts to Facebook or Instagram, no Meta code); L447 (deletion removes "the hashes that make you findable", which still includes any old handle hash until §4).

`docs/appstore.md`
- L156, the App Store **description**: "If you would rather bring your Instagram circle…" promotes the removed feature. Drop it in the build-40 listing.
- **App Privacy** answers, once v4.14 is the version on sale: L643 Identifiers → User ID, drop "the hash of the user's own Instagram handle" (the answer stays Yes for the account id); L645 Usage Data → Other Usage Data, "phone numbers or handles" → "phone numbers"; L593–605 the "collected" explanation's "the Instagram hashes" and "the cached Instagram list". None of these changes a Yes or No.
- L203, L293, L299–335, the review-notes recipe and its character counts, all name the Instagram paragraph; without it every count there drops by that paragraph's length, so recount before pasting.

`docs/support.md` (Last updated 28 Oct 2026)
- L44–46, **Forget an imported Instagram list**: the button is gone.
- L239–242: "or run a lot of checks" (the import's message, gone) and "3,000 phone numbers and Instagram handles… counted together".
- L301–304, **Can you connect my Instagram automatically?**: ends "Importing your own downloaded list is the only honest version of that feature".
- L306–312, **Which Instagram download do I choose?**: the whole answer.
- L314–316: "Find them by contacts, your Instagram list or their username".
- Still true, keep: L318–320 (Sipply never posts to Facebook or Instagram).

`docs/testflight.md`
- L133–135, What to Test bullet **Your Instagram list**.
- L271–277, Beta review notes **Instagram.** paragraph (describes the download).
- L296–304 and L319, the character counts that include it.

`docs/data-deletion.md` L41–42, "the hashes that let people find you by phone number or Instagram username": accurate until §4 drops the column (deletion still removes an old handle hash); trim it then.

`docs/terms.md` L29–30 (not affiliated with Instagram, never posts to it): true, keep.

**Build 40's notes**: `specs/v4.14/review-notes-40.txt` leaves out build 39's line 13, "Instagram. No Instagram login and no Instagram API." (still true, but it describes nothing in the app). `specs/v4.14/wtt-40.txt` says the import is gone and what it kept on a phone is cleared.

## 6. The proof

`node specs/v4.14/find-friends.test.mjs`, a pure check like the v4.11 and v4.12 tests:

1. Both files are gone and nothing imports them; none of the section's keys or lines is said anywhere in `src` (outside `src/data`); Settings' hint has no Instagram.
2. FindFriends keeps contacts, Facebook, being findable, **Share invite link** and **Find by username**; Find friends draws it with **Everyone on Sipply** under it; the signup step draws it too.
3. No client call to `match_instagram`; `set_instagram_hash` once, with null, and a missing function reads as done; the drain writes no handle; the profile load runs `retireInstagram`.
4. `src/lib/discovery.ts` runs as it is against an in-memory AsyncStorage: a phone that never used the import pays no round trip and keeps its number; one that did loses the list, the stamp and the handle after one withdrawal; offline keeps the handle and the next run withdraws it; sign-out's clear still covers every old key; a settled number takes its parked record (legacy handle included) with it.
5. No daily idea in `src/data/dailyIdeas.ts` or `specs/v4.3/ideas.mjs` names Instagram (it was a printed note until `friends-08` was reworded, §5).

Against build 39's tree it fails on every check in 1 and 3 and stops at 4 (discovery still imports lib/instagram).

App Review 1.4.3: this only removes; nothing new is said about drinking.
