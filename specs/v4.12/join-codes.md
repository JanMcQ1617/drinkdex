# v4.12 · Tournaments: host with nobody invited, join with a code

30 Oct 2026. Jan, on build 37: "I want you to create the tournament and give me a code for other people to join instead of having to invite me friends before creating the tournament."

| Piece | Where | State |
|---|---|---|
| The server: the code, the misses, the two RPCs, create_tournament with nobody invited | `supabase/migrations/028_tournament_join_codes.sql` (and the same objects in `supabase/schema.sql`) | written, **not applied** (§5) |
| The code's pure half: alphabet, what a typed or pasted code becomes, the answers, the degrade rules, the words | `src/lib/tournamentCode.ts` (imports nothing) | new |
| The calls: create, read the code, probe, look up, join, share, copy | `src/lib/tournaments.ts` | changed |
| Whether the server has codes | `src/store/tournaments.ts` (`codes`, `probeCodes`, `setCodes`) | changed |
| The six boxes, Copy and Share | `src/components/tournaments/JoinCode.tsx` (`CodeCells`, `JoinCodeCard`) | new |
| Join with code | `src/app/tournaments/join.tsx`, a modal in `src/app/_layout.tsx` | new |
| The key on the Tournaments tab | `src/components/tournaments/FriendsBoard.tsx` | changed |
| The key on the pushed Tournaments list, and its empty state | `src/app/tournaments/index.tsx` | changed |
| Host a tournament: invite optional, the code once made | `src/app/tournaments/new.tsx`, `src/components/tournaments/InvitePicker.tsx` (`optional`) | changed |
| The code on a tournament's page | `src/app/tournaments/[id].tsx` | changed |
| The link `drinkdex://join/<code>` | `src/app/+native-intent.tsx` | changed |
| The types | `src/lib/database.types.ts` | changed |
| The words for Apple and testers | `review-notes-38.txt`, `wtt-38.txt` | §6 |
| The proof | `node specs/v4.12/join-codes.test.mjs` | §7 |

Rules that hold everywhere:

- **Build 37 notices nothing.** `create_tournament` keeps 020's six arguments and returns the same uuid; build 37 always sends at least one invitee, which still works exactly as before. Builds up to 37 never read `join_code` or call the two new RPCs.
- **Build 38 runs on a server without 028** (§4): no code shown, an invite still required, Join with code says it is not here yet. Nothing errors.
- **No new package or native module.** Copy is React Native's own `Clipboard` (0.86 still ships `RCTClipboard` in its CoreModules, so it is in the binary); Share is React Native's `Share`, as profiles and collections share.
- **App Review.** 1.4.3: nothing about a code counts or rewards drinking; the share text names the tournament and the code, nothing else. 5.3: the rules line and its "i" key are on Join with code and on the host sheet's code step, as on every tournament screen. The 3-a-day cap and "entries counted, never amounts" are untouched.
- **Joining tells nobody.** No push, no Activity row, no new notification of any kind (§2.4).

---

## 1. What a code is

**Six of 31 characters**: the figures 2 to 9 and the letters A to Z without I, L and O. Nothing on the screen can be read as something else (0 and O, 1, I and L), so nobody reading a code out has to spell it twice. 31⁶ is 887,503,681 codes.

- **Made by the server** when the tournament is made: `join_code`'s default, `private.new_tournament_code()`. Each character is one byte of a fresh `gen_random_uuid()` (Postgres's own strong random, no extension), a byte of 248 or more (31 × 8) drawn again so every character is equally likely; never `random()`, which is predictable. A code the content filter would refuse as a name (011's `is_objectionable`, glued, digits read as the letters they stand in for) is drawn again.
- **Unique among unfinished tournaments**: a partial unique index, `where finalized_at is null`. A finished tournament keeps its code on its row, where nothing can use it, and the code may be drawn again. Two creates drawing the same code in the same moment meet the index; `create_tournament` draws again, three tries at most.
- **Case and spacing never matter.** The server upper-cases and drops spaces and dashes (`private.tournament_code_norm`); the app's boxes do the same as you type (`typedCode`), and drop anything outside the 31, so a typed O, 0, 1, I or L simply does not land. A paste of the whole share message, or of its link, gives the code it carries.
- **Who can see it**: everyone `tournaments_read` already lets read the row (the host, the people in it and the people invited, minus blocks). No new grant, no new policy. The app shows it to the host and to people who have joined, while it has not finished.

## 2. The server (migration 028)

### 2.1 Objects

| Object | What |
|---|---|
| `public.tournaments.join_code text` | the code; `tournaments_join_code_shape` (null or `^[2-9A-HJKMNP-Z]{6}$`); default `private.new_tournament_code()` |
| `tournaments_join_code_open` | unique index on `join_code` where `finalized_at is null` |
| backfill | every unfinished tournament without a code gets one, one statement at a time (each sees the last), before the default is set |
| `private.tournament_code_misses` | `(user_id, hour, count)`, 020's `music_search_usage` shape: wrong codes per account per clock hour. RLS on, no policy, every grant revoked; cascades with the account |
| `private.tournament_code_norm(text)` | upper case, spaces and dashes out; null if not six of the 31. Immutable, reads nothing |
| `private.new_tournament_code()` | the generator above (definer) |
| `private.find_tournament_by_code(text)` | the one way a code reaches a tournament, for both RPCs (§2.3) |
| `private.code_join_state(uuid, uuid)` | may the caller join: `member`, `not_allowed`, `full` or `ok` (§2.2) |
| `public.tournament_by_code(p_code)` | the preview |
| `public.join_tournament_with_code(p_code)` | the join |
| `public.create_tournament(…)` | 020's, with nobody invited allowed |

### 2.2 The checks, in order

A code opens one unfinished tournament to a caller who:

1. **is signed in, and not an anonymous session**: `auth.uid()` set and the JWT's `is_anonymous` not true, else `28000` as every RPC here raises it; and **still has a profile**, else `28000` too: a deleted account's token verifies until it expires, and with no profile its misses could not be written (the foreign key), so every wrong guess would error while a right one answered, and the twenty would never count;
2. **has not guessed twenty wrong codes** in this clock hour and the one before it (§2.3);
3. **gave a code that exists** among unfinished tournaments, **hosted by someone the caller is not blocked with either way** (a blocked host's code answers exactly as a wrong one, and is charged as one, as `tournaments_read` hides that tournament). None running, but a **finished** tournament kept the code (and its host is not blocked either way): `finished`, not charged. Most ended tournaments are frozen by the first visit after their end (`my_tournaments`), so without this a code shared on Friday read as wrong on Monday, and every retry cost a guess;
4. **found it running**: its end, early end or goal not passed. One that has is frozen on the spot (`finalize_tournament`, as every read freezes it) and answers `finished`;
5. **is not in it already**: the host and anyone `accepted` get `member` with the id, and the app opens it;
6. **never declined it, left it or was taken out of it by a block**: `declined` stays final, as 020 made it (`not_allowed`);
7. **is not blocked either way with anyone in it or still asked** (`invited` or `accepted`), the host's row included: `not_allowed`, naming nobody;
8. **finds a seat**: 50 with the host, counting everyone in it or asked, as `add_invitees` counts (`full`). An open invitation is already a seat, so someone invited may always take it.

Joining does 3 to 8 again **under the tournament's lock** (`finalize_tournament`'s, which every tournament write takes), so a seat, a finish, a deletion or a block that lands between the preview and the tap is seen.

### 2.3 Guessing

Twenty wrong codes per account in this clock hour and the last; the twenty-first guess is answered `limited` **before the lookup**, so it learns nothing. The caller's guesses are serialised (an advisory lock per account, as `create_tournament` serialises a host's creates), so two at once cannot both read 19. A code that cannot be one (wrong length, a character outside the 31) is answered `not_found` without the charge: it names no tournament (the app's probe sends `''`). Nor is a finished tournament's code charged: `finished` opens nothing. The wait after the twentieth runs up to two hours (this clock hour and the last), so the app says "Try again later", not "in an hour". Counts and hours only, never the codes tried; a day of old rows is swept on the way in.

**Answers, not errors.** Both RPCs answer `{ result: <word> }` and never raise for a refusal: a raise would roll back the miss it is meant to count.

| RPC | Answers |
|---|---|
| `tournament_by_code(p_code)` | `ok`, `member`, `full`, each with `id, name, starts_at, ends_at, target, state` (`upcoming` or `live`), `members` (accepted, host included), `host { id, username, display_name, accent, avatar_path }`; else `not_found`, `limited`, `finished`, `not_allowed` alone |
| `join_tournament_with_code(p_code)` | `joined` or `member` with `id`; else `not_found`, `limited`, `finished`, `full`, `not_allowed` |

The preview is the invitation, not the tournament: no standings, no member list, no ids but the tournament's and the host's.

### 2.4 Joining tells nobody

027's `tournament_members_push` fires `after insert … when (new.status = 'invited')`. A code joins as `accepted` (an insert the trigger skips), and an open invitation becomes `accepted` by an update, which no trigger watches. 028 queues nothing itself. No push, no Activity row.

### 2.5 Hosting with nobody invited

`create_tournament` keeps 020's arguments, checks and uuid, with two changes: a host who names nobody gets a tournament (the code is the way in; the app reads it from the row); a host who named people none of whom can be invited (unfollowed, blocked since the list was drawn) is still refused `no_invitees`, which rolls the call back, because they meant someone. And the insert is retried on a code collision (§1).

### 2.6 Grants

`tournament_by_code(text)`, `join_tournament_with_code(text)` and `create_tournament(…)`: revoked from `public` and `anon`, granted to `authenticated`. The four helpers: revoked from `public`, `anon` and `authenticated`; reached only from definer code (the generator also as the column's default, which `create_tournament` evaluates as its owner). Every function pins `search_path = ''`.

### 2.7 Blocks, all of it

| Who | Code answer |
|---|---|
| The host, either way | `not_found`, charged as a wrong code (the tournament stays hidden, as `tournaments_read` hides it) |
| Anyone in it or still asked, either way | `not_allowed` ("You can't join that tournament."), naming nobody |
| Someone taken out earlier by a block (`declined`) | `not_allowed`, even after an unblock: `declined` is final |
| A block made after joining | unchanged from 020: with the host it takes the member out (`blocks_drop_tournament_membership`); between two members, each is hidden from the other by the read policies, as for invitations |

## 3. The app

### 3.1 Host a tournament

- **Invite · optional.** The head says so, and Create needs only a name and the dates. The key reads **Create**, or **Create and invite** once someone is picked. Following nobody is no dead end: the picker says "Nobody to invite yet. Share the join code once it's made, or find people to follow." with Find friends as a secondary key.
- **Made, the sheet turns into the code**: the bar says **Share the code** (Close at the left), the tournament's name in `title`, the six boxes, **Copy** and **Share**, the rules line and "i", and **Open tournament** at the foot. Swipe down or Close returns to where the sheet was opened, where the new tournament's card is.

### 3.2 The code, drawn

`JoinCodeCard`: six squared wash boxes, one character each in `heroFigure` (Archivo 600 28/34, tabular, capped at 1.3), the phone code's boxes, so the code sent and the boxes typed into are the same six. Never the marker or the poster (a code must be read exactly, check-design rule 6), never the accent (a code is not one of its seven places). Silent to VoiceOver; the card says "Join code, K 7 M P Q 2". Under it, two wash keys side by side: **Copy** (two squares; "Copied" with a tick for 1.6 s, "Code copied" spoken) and **Share** (the share glyph).

**Share** sends, through React Native's `Share`:

> Join my Sipply tournament "Negroni week": code K7MPQ2
> With the app, this link opens it: drinkdex://join/K7MPQ2

("our" instead of "my" from anyone but the host). The link is a custom scheme, so it does something only on a phone that has the app; the code stands on its own first, as `buildInviteMessage` is honest about its link. **No web page**: a universal link needs a domain and a page under `docs/`, which this change does not add.

### 3.3 On a tournament's page

For the host and everyone who has joined, until it finishes: a **Join code** head and the same card, after what you can do (Post, or Join and Decline) and before the standings, so the way to bring someone in is near the top while it is coming up. Read from the row once per visit (`fetchJoinCode`; it never changes), and again with the next board load (a pull, a return to the page) while a read has come back empty, so a weak connection hides it only until the next pull. Not shown to someone only invited (they join first), nor once it has finished, nor without 028.

### 3.4 Join with code

The Tournaments tab has a second wash key under **Host a tournament**: **Join with code** (the person-and-plus glyph), and so does the pushed Tournaments list, whose empty state now reads "Host one, or join with a code someone shared." with Join with code as its quieter second way out. It opens a modal sheet, as hosting does:

- **Six boxes, one real input** (auth/PhoneCodeStep's pattern): a transparent `TextInput` over the row, upper case, no autocorrect, the ASCII keyboard with a **Join** return key. The rings (where the next character goes; all six in ink for a wrong code) are overlays inside the boxes, a sibling of the input, so focus never reparents it (build 35's keyboard, specs/v4.10/email-focus.md).
- **The sixth character looks it up.** Then the invitation: the name (`title`), its first and last day as calendar pages, a facts line (On now or Coming up, the goal, how many are in it), and the host's face, name and handle. **Join** at the foot; **Open tournament** for someone already in it. Joined, the sheet gives way to the tournament's page. VoiceOver hears what the code opened as the keyboard goes ("Negroni week, hosted by Ana Ruiz. Join is at the bottom.", or "You're already in …"), as it hears a refusal; the host reads "Hosted by Ana Ruiz, @ana_r".
- **Refusals in few words**, under the boxes with the alert glyph: "Wrong code. Check it and try again." (rings the boxes), "That tournament has finished.", "That tournament is full.", "You can't join that tournament.", "Too many wrong codes. Try again later.", and for no connection "Could not check the code. Check your connection." with **Try again**.
- **A join link** (`drinkdex://join/K7MPQ2`) opens the sheet with the code in its boxes and looks it up; it never joins by itself.
- The rules line and its "i" at the foot.

## 4. Without 028

Build 38 may meet a server without 028 (if it is applied late, or a review build runs first). Nothing errors:

| Where | Without 028 |
|---|---|
| Host sheet | It asks once per account and launch (`probeCodes`: `tournament_by_code('')`, which 028 answers as a wrong code without counting it). No function: **Invite** (not optional), Create disabled until someone is picked, as build 37. Before that answer, a Create with nobody picked is refused by 020's `no_invitees`; the sheet reads that as "no codes" (`createSaysNoCodes`), switches to the old rule and says "For now, invite at least one person you follow." |
| After Create | No column, so no code (`fetchJoinCode` is null on any error): the sheet gives way to the tournament's page, as before |
| A tournament's page | No code, no card |
| Join with code | The key is there wherever Host is (it never comes and goes under the thumb); the sheet asks as it opens (`probeCodes`, once per launch, so it may already know from the host sheet) and, told there are no codes, says **Not here yet**, "Joining with a code arrives with an update on our side. Nothing to do on yours.", with no boxes. A lookup that finds no function says the same, for a probe that had not answered |

`node specs/v4.12/join-codes.test.mjs` runs each of these rules as they are and reads the screens for them.

## 5. For Jan: apply 028 before build 38 ships

1. **Supabase → SQL Editor → New query.** Paste the whole of `supabase/migrations/028_tournament_join_codes.sql` and **Run**. Expect "Success. No rows returned". It is safe to run again.
2. **Run the VERIFY block** at the head of the file, one query at a time: the record, the column and its default, 0 / 0 / 0 for codes missing, twice or misshapen, the index and the shape check, RLS on the misses, and the seven functions' grants.
3. **Settings → API → Reload schema** (or wait a minute), so PostgREST sees the two new functions. A `PGRST202` straight after the run is this cache.
4. **The smoke test** (in the VERIFY block, rolled back): paste your user id and a second real account's id, one you are not blocked with, and run it all at once. It hosts a tournament with nobody invited, reads its code, looks it up three ways, joins as the second account, checks no push was queued, checks twenty wrong codes stop the twenty-first, then ends it as you and checks its code answers `finished`, uncharged, and that an id with no profile (a deleted account's token) is signed out (`28000`). Expect "Success. No rows returned"; anything else raises and says what it found. You must host fewer than 5 unfinished tournaments for it to run.
5. Then upload build 38.

Order does not matter for build 37 (it never sees the change), and build 38 is safe without it (§4), but codes appear only once 028 is applied.

## 6. Review notes and What to Test

- `review-notes-38.txt`: build 37's, with only the **Tournaments** paragraph changed: "People join by invite or with a code the host shares; blocks apply." and "To try: trophy tab → Host a tournament or Join with code." To fit, "with people you follow" (no longer true of everyone in it), "picked on a calendar" (now "1 to 31 calendar days") and "follow anyone; (second tab)" were cut, and the cap's sentence takes a semicolon. Every v4.11 promise stays: the rules line quoted, the "i" and the rules' ending, 3 entries a day, amounts never counted, the calendar, First to. **3,997 characters** (the limit is 4,000).
- `wtt-38.txt`: leads with **Join with code** (host with nobody invited, the code with Copy and Share, join from a second account, the code on the page), then the **Current place** fix line (the other v4.12 change's own words; since review it says the row takes a tap whenever it isn't saying "Finding where you are…", which ends within 20 seconds, rather than "always"). "Tournaments" under Worth poking at now joins with the code. **2,909 characters**.

## 7. The proof

`node specs/v4.12/join-codes.test.mjs`, a pure check (no device, no network, no database), 144 checks:

1. **One code on both sides.** `lib/tournamentCode` transpiled and run: the alphabet is the 31, and is 028's generator's character for character; every shape check in 028 and `schema.sql` is one class taking exactly the 31; over the 248 bytes kept each character comes exactly 8 times; what is typed matches a model of `tournament_code_norm` on 5,000 fuzzed strings (any case, spaces, dashes); pasted messages and links give their codes; a link's code never throws.
2. **The answers and 028 missing.** Previews and joins read and refused as they should; `PGRST202`/`42883` are `unsupported`; the probe, `inviteRequired` and `createSaysNoCodes`; and the screens read for them: the host sheet's `canCreate`, Join with code's "Not here yet" branch with no `TextInput`, taken as soon as the store knows there are no codes (it probes as it opens), the page's card only with a code, the rules on every tournament screen.
3. **028's contract.** Seven functions, each pinning `search_path`, revoked first, the RPCs definers for `authenticated` alone, nothing granted to `anon` or `public`; `create_tournament`'s arguments and uuid equal 020's; `no_invitees` only when people were named; joining inserts only `accepted` and 027's trigger fires only for `invited`; the lookup refuses a non-code before the lock, takes the lock before counting and counts before looking up, and never raises; a finished tournament's code answers `finished` uncharged; both RPCs sign out a deleted account's token (no profile) before the lookup; blocks read for the host and for everyone in it or asked; the seat cap equals `add_invitees`' and the app's 50; the record is the last statement; `schema.sql`'s `create_tournament`, `find_tournament_by_code`, `tournament_by_code` and `join_tournament_with_code` are 028's byte for byte, and it and `database.types.ts` carry the rest.
4. **The notes**: each inside 4,000, every v4.11 promise kept, only the Tournaments paragraph changed, What to Test leading with Join with code and keeping Current place.

## 8. Not done, not checked

- **Not run.** No psql, postgres or supabase CLI here: 028 was read, not run, against `schema.sql`'s real names. The VERIFY block's smoke test is its first run.
- **On a phone.** No build was made. Worth looking at: the six boxes at the largest text sizes (each box is about 50pt wide at 390; the figure is capped at 1.3), Copy and Share side by side under Larger Text, and the Join key over the keyboard.
- **A new code, or no code.** A host cannot change a tournament's code or turn it off, and nobody can remove someone who joined. Both are follow-ups if a code leaks; until then the host can delete the tournament.
- **No link for someone without the app.** `drinkdex://` opens nothing there; the code is in the text to type once they have it.
- **Clipboard.** React Native says its core `Clipboard` will move to a package in a later release. Copy is reached only through `copyJoinCode`, which falls back to the share sheet (which has its own Copy) the day it is gone; in development React Native warns once when Copy is first pressed.
