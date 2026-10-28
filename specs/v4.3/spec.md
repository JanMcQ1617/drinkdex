# v4.3: tag the people you were with, and one idea a day

16 Oct 2026. Jan: "I want you to be able to tag in your friends, i also want notifications constantly, every single day send users different messages like post your first drinks, or create a new drink, create around 200 different sayings to put in notifications for users."

His answers (13 to 16 Oct): **(1)** tag friends on a post, Instagram's Tag people: when posting, pick friends who were with you; the post shows "with ana and leo"; each tagged friend sees it in Activity (the dot on Home's heart). **(2)** Tag alerts live in Activity now. Real remote push comes later, once he makes an Apple push key: design the data so a server push can be added without a client rebuild, but build no remote push now. **(3)** A daily notification at 6 pm local time by default, changeable in Settings with an off switch. Daily messages are local scheduled notifications: no server, no push key.

Base: build 24 (`v3-3` at 278fb8f, v4.2). Daylight tokens (`specs/v4-mockups/white/spec.md`), the less-stuff layout (`specs/v4-mockups/layout/spec.md`), Instagram's post anatomy as built (`specs/v4-mockups/home-ig`, `components/PostCard`), Activity (`app/activity.tsx`), Settings (`app/settings.tsx`), the + window (`app/log.tsx`). Nothing here changes a palette value, a type size or the tab bar.

| Jan asked | v4.3 answer | § |
|---|---|---|
| "Tag in your friends" | **Tag people** on the compose step: up to 10 people you follow. The post's header reads "maya.pours with ana and leo". A tagged person can remove themselves; a block removes tags both ways | 1 |
| Each tagged friend sees it | A row in Activity, "ana tagged you in their *Negroni*", one per post, lighting the dot on Home's heart. Migration 024 holds the tags so a server push can be bolted on later with no client rebuild | 1.6, 2 |
| "Notifications constantly, every single day" | **Daily ideas**: one local notification a day at 6:00 PM, a different message each day, chosen from what the person has and hasn't done. Never the same message twice within 60 days | 3 |
| "Post your first drinks, or create a new drink" | Both are categories of the catalogue (first steps, post your first, create a drink) beside log, read, browse, save, friends, knowledge and tastes | 3.6 |
| "Around 200 different sayings" | **200**, in `ideas.mjs`, each checked by `tools/schedule.mjs` against App Store 1.4.3 (nothing that encourages drinking), the house style and 120 characters | 3.6 |
| 6 pm, changeable, with an off switch | Settings → **Notifications**: Daily ideas (on or off) and Time. Asked for first in an in-app screen with plain consent words, never on first launch | 3.2, 3.3 |

## Files

| Path | What |
|---|---|
| `spec.md` | This |
| `index.html` | 10 frames at 440 × 956. `index.html#<id>` shows one |
| `contact.png` | The wall at 1x |
| `compose.png` `picker.png` `feed.png` `tagged.png` `activity.png` `optin.png` `settings.png` `time.png` `lock1.png` `lock2.png` | One frame each at 2x (880 × 1912) |
| `024_post_tags.sql` | **Migration 024, draft** (§2.1), with its VERIFY block and a rolled-back smoke test. Moves unchanged to `supabase/migrations/` |
| `ideas.mjs` | **The 200 daily ideas**, ten categories (§3.6). Ported verbatim as `src/data/dailyIdeas.ts` |
| `tools/schedule.mjs` | **The reference planner and the catalogue's checks** (§3.4 to §3.6). `node specs/v4.3/tools/schedule.mjs` checks every line and simulates five people over 180 days; `--quiet` prints only the verdicts. Ported as `src/lib/dailyIdeas.ts` and `scripts/check-ideas.mjs` |
| `tools/render.sh` | Renders the PNGs with throwaway headless Chrome profiles under `/tmp/sipply-v43-chrome`, kills only those processes, deletes the profile. `./tools/render.sh optin time` re-renders some |

The people in the frames are stand-ins (ana and leo are Jan's own example). The drinks and photos are the catalogue's. Every notification line drawn is real copy from `ideas.mjs`, and the example fortnights in §3.11 are real output of `tools/schedule.mjs`.

### Mocked or only specified

| Mocked (a frame) | Specified only (words, no frame) |
|---|---|
| Compose with Tag people filled; the picker; a tagged post on Home; the post page when you are tagged, with In this post open; Activity with tag rows; the daily-ideas ask; Settings → Notifications; the time sheet; two lock screens | The picker at ten, empty, searching and failing; the post's ••• rows (Tag people, Remove me from this post); the Remove me confirm; a re-post that starts with the post's tags; Settings with notifications off in iOS; the Android channel; every error |

---

## 1. Tag people

### 1.1 The model

- **A tag hangs off the post, not a photo.** A post is one drink per person (007) and its photos are the times it was posted; the tags say who was with you. A re-post of the same drink adds people and never removes anyone silently (§1.2).
- **Who can be tagged**: people you follow, at most **10** per post, never yourself, never anyone you are blocked with either way. They do not have to follow you back (open question 1).
- **Who can remove a tag**: the tagged person (themselves), and the author (anyone). When the tagged person removes themselves, the author can never tag them on that post again. When the author removes a tag (a mistake), they can tag that person again.
- **What a tag shows**: anyone who can see the post sees who is in it, by username, except people they are blocked with. The tagged person gets an Activity row. Nobody is told when someone removes themselves.
- **Blocks**: blocking either way removes every tag between the two people at once, and unblocking brings nothing back (§1.7).
- **No new route.** Everything is a sheet or a row: `TagPeopleSheet` (a page sheet), `TaggedSheet` (a short sheet), the compose row, the header line, the Activity row.

### 1.2 The compose row (frame `compose`)

`app/log.tsx`'s compose step gains one row, `components/log/TagPeopleRow.tsx`, straight under the caption (16 above it), before Add music when music is on:

| Piece | Geometry and words |
|---|---|
| Row | 56 tall across the column (x 24 to 416), no fill, no rule: space parts it from the caption (layout spec principle 3). Pressed: `press` fill, as a ListRow |
| Glyph | `profile` 24, `ink`, at x 24, centred |
| Label | **Tag people**, `body` 500 `ink`, at x 60 |
| Who | `body` `muted`, one line, ellipsis, right-aligned 8 before the chevron. Nobody: nothing. One: "ana". Two: "ana and leo". Three or more: "ana and 2 others" (pick order) |
| Chevron | `chevronRight` 20 `muted`, ending at 416 |

- **Shown** exactly where Post exists and 024 is live: signed in, a catalogue drink (`posts`), `tagsSupported()`. A drink someone added, or signed out: no row.
- **Tags go with Post only**, like the song. "Save to Dex only" keeps the drink and drops the tags. No confirm: choosing not to post is the decision.
- **A re-post** (a drink you already posted): the row starts with the post's current tags (`fetchMyPostTags`, read once as compose opens; while it loads the row shows no names and still opens). Post writes the difference: new people are added, anyone unticked is removed. If the read fails, the row starts empty and Post only adds.
- **Leaving** with picked tags counts as work: `dirty` includes a tag set that differs from where it started, so the X asks "Discard this post?" as it does for a caption.
- **VoiceOver**: one `button`, label "Tag people", value "ana and leo" (or "nobody yet"), hint "Choose people you follow who were with you".

### 1.3 The picker (frame `picker`)

`components/tags/TagPeopleSheet.tsx`, a React Native `Modal` with `presentationStyle="pageSheet"`, like `LikersSheet` (it scrolls and takes typing). UIKit slides it and honours Reduce Motion.

| Piece | Geometry and words |
|---|---|
| Head | `SheetGrabber`; **Tag people** `body` 600 at x 24; **Done** `body` 500 `ink`, right-aligned to 416, a 44 hit |
| Line | `small` `muted`, 4 under the head: "People you follow. They'll see this post in Activity." At ten picked it becomes "That's 10, the most for one post." (and is announced) |
| Field | `SearchField` 392 × 44, `wash`, "Search people you follow". Not focused on open: the list is the first thing to see |
| Chips | Only when someone is picked: the picked, in pick order, as ink chips (`Chip` on, 32 tall, 4 pt) with the username and a 14 pt ×, 8 apart, one row that scrolls sideways edge to edge and to its end when a chip is added. Tapping a chip unpicks. VoiceOver: "Remove ana, button" |
| Rows | 64 pitch: `Avatar` 44 at x 24; the display name `body` `ink` at x 84 and "@ana" `small` `muted` under it; the 22 pt `Box` (collections' `components/collections/Box`) right-aligned to 416, `ink` with a white check when picked |

- **Who is listed, in order**: the people already picked when it opened; then people you tagged lately (the last 20 distinct people tagged on your own posts already on the phone, newest first, still followed); then everyone you follow, newest follow first (`fetchConnections(myId, 'following')`, 200). Each person once. You are never listed.
- **Search** filters that list on the phone, by username or display name, folded (case and accents ignored, `@` stripped). When you follow 200 or more (the connections page came back full), each search also asks the server (`searchPeople`) and keeps only ids in `useSocial.following`, so nobody you don't follow appears.
- **A tap** anywhere on a row toggles it, with `haptic.select`. Unchanged order: a ticked row does not jump. At ten, unticked rows take no taps and read `disabled` (half strength), and a tap on one announces "You can tag 10 people at most".
- **Done**, a swipe down or VoiceOver's escape all keep the choice and hand the picked list back (`onDone`). Nothing here writes to the server: the compose step writes with Post (§1.2); the ••• version writes on Done (§1.5).
- **States**: loading, `Hold`; following nobody, `EmptyState` "No one to tag yet" / "You can tag people you follow. Find friends from your profile."; no match, `small` `muted` "No one you follow matches “xyz”."; failed, "Couldn't load the people you follow." with Try again.
- **Blocked people never appear**: a block removes the follow (006) and `follows_read` hides the edge (011).
- **VoiceOver**: each row a `checkbox`, label "Ana López, @ana", checked or not; the chips row is a list labelled "Tagged".

### 1.4 On the post: the "with" line (frames `feed`, `tagged`)

The post header (home-ig 5.1) keeps its two lines. The **first line** gains who the author was with; nothing else moves, so a post is still 7 things at rest.

**Words.** `{author} with {names}`, every username and "N others" in 600, "with" and "and" in 400, all `ink`, `small` 13/18:

| Tagged | Line |
|---|---|
| 1 | maya.pours with **ana** |
| 2 | maya.pours with **ana** and **leo** |
| 3 to 10 | maya.pours with **ana** and **2 others** |
| You among them | ines.ag with **you** and **2 others** |

**Order of names**: you first when you are tagged, then people you follow, then the rest, each group by when they were tagged (the author's pick order).

**Fitting** (`lib/tags.ts` `withLine`, worked out before layout from Inter's advances with `lib/textFit`, as the caption's cut is, so the header is its final height on its first frame): the header's measure (from 60 to 8 short of •••'s box, 330 at 440, times the capped font scale, `HEADER_CAP` 1.3). Try, in order: as worded; with two names, "with **ana** and **1 other**"; "with **3 people**" (or "with **1 person**"). If even that does not fit, the line ends in an ellipsis (`numberOfLines={1}`), the author's name first.

**Taps.** The author's name opens their profile, as now. "with …" is one target (hit slop to 44, as the username's): with one person, their profile (yours is the Profile tab); with two or more, **In this post** (§1.5).

**VoiceOver.** The header stays one element: "maya.pours, with ana and leo, Negroni, 2 hours ago". Its actions gain "People in this post" (two or more) or "Open ana's profile" (one), beside "Open Negroni" and "View story".

**Data.** `Post.tagged?: UserProfile[]`: `undefined` = unknown (024 not live, or the read failed), drawn as no line; `[]` = nobody.

### 1.5 In this post, Remove me, and the ••• rows (frame `tagged`)

`components/tags/TaggedSheet.tsx`, a `BottomSheet` (at most ten rows, so the short sheet): **In this post** `body` 600 centred, then one 64 pt row per person in the line's order: `Avatar` 44, the display name (**You** for you) over "@username" `small` `muted`, and a 116 × 36 key:

- **your own row**: **Remove me** (`secondary`, wash);
- **everyone else**: `FollowButton` (Follow `ink`, Following `wash`); none on the author's own view of their post (they manage tags through •••).

Tapping a person opens their profile once the sheet has gone (the likers sheet's pending pattern).

**Remove me** (and the post ••• row below) asks first, an `Alert`: "Remove yourself from this post?" / "ines.ag isn't told. They can't tag you on this post again." with **Remove** (destructive style) and **Cancel**. On success: `haptic.select`, the row goes, the line drops you, "Removed from this post" is announced. On failure: "Could not remove you" / "Check your connection and try again."

**The post's •••** (`menuActions` in PostCard) gains:

| Whose post | Row | Where |
|---|---|---|
| Someone else's, and you are tagged | **Remove me from this post** (plain, not destructive: it removes nothing of theirs) | After View drink, before Report |
| Your own | **Tag people**, with the count as its detail when there are any ("2") | Before View drink |

Your own post's **Tag people** opens `TagPeopleSheet` with the post's tags picked; **Done writes the difference at once** (optimistic: the card's line changes first). A person the server refuses (they unfollowed you, removed themselves from this post, or a block) is put back as it was, and one `Notice` says "Couldn't tag leo. You can only tag people you follow who haven't removed themselves." At ten (`post_tags_full`): "That's 10 already."

### 1.6 Activity (frame `activity`)

- **A row per tag**, `TagRow` in `app/activity.tsx`, beside `LikesRow` and `FollowRow`: the author's face (40, opens their profile), the sentence (`body`): "**ana** tagged you in their *Negroni*." with the drink in Playfair inline and the time in `muted`, then the post's 44 pt print (`LikedThumb`, renamed `PostThumb`). The sentence and the print open the post. A drink no longer in the catalogue: "tagged you in a post."
- **Never grouped.** A post tags you once, and two tags are two different posts by people you know, so each keeps its row, as follows do. Placed among likes and follows by when you were tagged, in New or Earlier.
- **The dot on Home's heart** lights for a tag as for a like: `fetchLatestActivityAt` reads the newest tag of you too.
- **Gone when the tag is**: removing yourself, the author untagging you, a block, or the post's deletion takes the row away (it is read from `post_tags` as it is).
- Empty state body: "When someone likes your post, follows you or tags you, it shows up here."
- **VoiceOver**: one `button`, "Ana López tagged you in their Negroni, 2 hours ago", hint "Opens the post". The face is hidden, as on the other rows.

### 1.7 Blocks and privacy

- Only people you follow, never yourself, never anyone blocked either way, at most ten: all enforced by 024's insert policy and cap trigger, not by the client (the client pre-checks only to explain).
- A block removes the tags between the two people, both ways (`blocks_drop_tags`), as 006 removes the follows. When the person who blocked was the one tagged, a refusal is kept too, so that post cannot tag them again after an unblock.
- A tagged person's name never reaches someone they are blocked with (`post_tags_read`), on anyone's post.
- Removing yourself sticks for that post (`post_tag_refusals`); the author is never told.
- A post you are tagged in can be reported like any post. Tags carry no text, so the content filter has nothing to check.
- Account deletion: every tag of the account and on its posts goes by cascade (§2.1).
- docs/privacy.md says all of this (§4).

### 1.8 Before 024, and signed out

Before 024 is applied (PGRST205 or 42P01 on `post_tags`, or PGRST200 on an embed of it): no Tag people row, no "with" line, no tag rows, no ••• rows, and nothing errors. `tagsSupported()` is re-asked on the next launch, so applying 024 needs no new build. Signed out: no row (there is no Post), and posts show their "with" line only to signed-in readers, as every post read is signed in.

---

## 2. Data

### 2.1 Migration 024 (draft in `024_post_tags.sql`)

- **`public.post_tags`** (`post_id` → posts **on delete cascade**, `tagged_id` → profiles **on delete cascade**, `created_at` default now(); primary key `(post_id, tagged_id)`; index `post_tags_tagged_recent_idx (tagged_id, created_at desc)` for Activity and the dot).
- **Grants**: `select, delete` to authenticated; `insert (post_id, tagged_id)` only, so the clock is the server's; no update; nothing for anon.
- **RLS**:
  - `post_tags_read`: the post is visible (`exists` under `posts_read`, which hides an author you are blocked with) **and** the tagged person is not in your block set.
  - `post_tags_insert_author`: you are the post's author; the tagged person is not you; you follow them (`exists` under `follows_read`); not `blocked_with` them; not `private.tag_refused(post, person)`.
  - `post_tags_delete`: you are the tagged person, or the post's author.
- **`post_tags_cap`**: a before-insert trigger with a per-post advisory lock refuses the 11th with `post_tags_full` (P0001).
- **`public.post_tag_refusals`** (same two keys, both cascading; RLS on, no grants, no policies) and **`post_tags_refuse_again`**: after the TAGGED person deletes their own row, a refusal is kept, but only while the post and the profile still exist, so an account deletion's cascade never trips its foreign key. Read only by `private.tag_refused()` (definer, in `private`, out of PostgREST's reach).
- **`blocks_drop_tags`**: after insert on `blocks`, a definer trigger deletes the tags between the pair, both ways.
- **Order**: after 023 by number; needs 009, 006 and 011 only (section 0 stops otherwise). Applied by hand, like every migration. The VERIFY block checks the tables, RLS, the three policies, the four cascades, the grants, the three triggers and the cap, and runs a rolled-back smoke test as two accounts: tag, duplicate (23505), self (42501), not followed (42501), the tagged account reads its tag and the post, removes itself, the author cannot tag again, and a block, then an unblock, leaves no tag.

### 2.2 The client: `src/lib/social.ts`

Beside the likers and saves, in their style (never-throwing reads, a session flag on a missing table):

```ts
/** At most this many people on one post (024's post_tags_full). */
export const POST_TAGS_MAX = 10;
/** False once the server has said migration 024's post_tags does not exist. */
export const tagsSupported = () => tagsTablePresent;

/** Who is tagged on THESE posts, by post id, oldest tag first. Null = unknown. Never throws. */
async function fetchPostTags(postIds: string[]): Promise<Map<string, UserProfile[]> | null>;
// .from('post_tags').select(`post_id, created_at, person:profiles(${profileCols()})`)
//   .in('post_id', part).order('created_at'), chunked by IDS_PER_REQUEST; a null person
//   (profiles_read hid them) is dropped.

/** The tags on YOUR post of this drink, for a re-post's compose row. */
export async function fetchMyPostTags(myId: string, drinkId: string): Promise<{ postId: string | null; people: UserProfile[] }>;

export type TagRefusal = 'not-allowed' | 'full' | 'failed';
/** Writes the difference between `prev` and `next` on your post. One insert per new person, so one refusal never drops the rest; 23505 counts as done. */
export async function setPostTags(
  myId: string,
  postId: string,
  next: readonly string[],
  prev: readonly string[],
): Promise<{ added: string[]; removed: string[]; refused: { id: string; why: TagRefusal }[] }>;
// 42501 → 'not-allowed' (unfollowed, removed themselves, or a block); P0001 'post_tags_full' → 'full'.

/** Removes you from someone's post. Throws when the request failed. */
export async function removeMyTag(myId: string, postId: string): Promise<void>;
```

- **`toPosts`** gains `fetchPostTags(ids)` as a fourth parallel read beside likes, saves and liker summaries; `toPost` sets `tagged: tags ? (tags.get(row.id) ?? []) : undefined`. The feed, profiles, Saved, the post page and collections all pick tags up with no other change. A separate read, not an embed in `POST_SELECT`: PostgREST fails a whole select whose embed it does not know (PGRST200), and a post read must never fail because of tags.
- **`createPost`** returns `{ withPhoto: boolean; postId: string }` (was `boolean`); its one caller is the store.
- **`fetchActivity`** gains a third read, tolerant of a missing table:
  ```ts
  supabase.from('post_tags')
    .select('post_id, created_at, posts!inner(id, author_id, drink_id, photo_path)')
    .eq('tagged_id', myId).gte('created_at', since)
    .order('created_at', { ascending: false }).limit(ACTIVITY_LIMIT)
  ```
  Each row becomes a `kind: 'tag'` item keyed `'tag:' + post_id`, its `actorId` the post's `author_id`, with `postId`, `drinkId`, `photoPath` and `at` (the tag's `created_at`); a drink that has left the Dex is dropped, as for likes.
- **`fetchLatestActivityAt`** reads the newest `post_tags.created_at` for `tagged_id = myId` as a third one-row read and returns the latest of the three.

### 2.3 Types and stores

- `src/types.ts`: `Post.tagged?: UserProfile[]`; `ActivityItem` gains `| { kind: 'tag'; key: string; actorId: string; postId: string; drinkId: string; photoPath: string | null; at: string }`.
- `src/lib/database.types.ts` (hand-written): `post_tags` Row `{ post_id: string; tagged_id: string; created_at: string }`, Insert `{ post_id: string; tagged_id: string }`.
- `src/lib/pour.ts`: `PostOutcome` gains `'untagged'` (posted, some tags refused): `reportPost` says "Posted" / "Some tags didn't save. Open the post's ••• and choose Tag people to try again."
- `src/store/social.ts`: `addPost(myId, drinkId, caption, photoUri, music?, tags?: { next: string[]; prev: string[] })` writes the tags after `createPost` with its `postId`; `setTags(myId, postId, next, prev)` and `removeMyTag(myId, postId)` patch the feed's copy (`tagged`) optimistically, roll back on failure, and bump a new `tagsVersion` that a mounted post page reads to refetch its own copy (as `savesVersion` does for Saved).
- `src/lib/tags.ts` (pure): `orderTagged(tagged, myId, following)`, `withLine(author, tagged, { myId, following, measure, fontScale })` → `{ parts: { text: string; strong: boolean }[]; spoken: string; opens: 'person' | 'list'; personId?: string }`, `whoShort(people)` for the compose row ("ana and 2 others").

### 2.4 Activity and the bell, unchanged in kind

`app/activity.tsx` keeps `groupByPost` for likes and passes `kind: 'tag'` through as its own entry (like a follow). `useSeen`'s mark covers tags by time with nothing new. The bell's dot reads `activityLatestAt`, which now includes tags.

### 2.5 Later: a push for a tag, with no client rebuild

Nothing below is built in v4.3. It is how the data is shaped so it can be added when Jan makes the Apple push key (.p8):

1. **Build 25 already carries what a phone needs**: expo-notifications (§3.9), the `aps-environment` entitlement it writes, and a response handler that opens any notification's `data.url` (§3.7). So everything after this is server work plus an over-the-air JS update, never a new binary.
2. **Migration 025** (later): `public.push_tokens (user_id → profiles cascade, token, platform, updated_at, primary key (user_id, token))`, owner-only RLS; and a per-account `tags` preference (default on).
3. **A trigger on `post_tags`**, the 013 pattern: `after insert` → `private.notify_tag()` (definer) → `net.http_post` to a URL kept in Vault (`tag_push_url`) with `{ post_id, tagged_id, author_id }` and a shared secret header. Inert until the secret exists; a failure is a warning, never a refused tag. A SQL trigger rather than a dashboard webhook, so it lives in the repo and is reviewed.
4. **An Edge Function `push-tag`**: checks the secret; re-reads with the service role that the tag still exists, nobody is blocked and the preference is on; sends `{ aps: { alert: { body: "ana tagged you in their Negroni" }, sound: "default", "thread-id": "tags" }, kind: "tag", url: "/post/<id>" }` to APNs with the key (Edge secrets `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, topic `com.janmcqueeny.drinkdex`); deletes a token APNs answers 410 for; at most one push per post and person.
5. **An OTA update**: after permission is granted, `getDevicePushTokenAsync()` → upsert into `push_tokens`; Settings → Notifications gains "When someone tags you" (a box, on). The ask's copy (§3.2) gains one line before the first such push, because its consent words today promise one idea a day and nothing else.

---

## 3. Daily ideas

### 3.1 The rules every part of this keeps

- **App Store 4.5.4**: notifications are never required; an **in-app screen with plain consent words comes before the system prompt**; the app has its own off switch. Never on first launch, never before the person has done something.
- **App Store 1.4.3**: an alcohol app never encourages drinking, or drinking more. Messages ask only for logging what someone **already had**, making a recipe, reading about a drink, browsing or filtering the Dex, saving and collections, friends, and plain knowledge. Never "have one", a time of day, a day of the week, rounds, streaks, a count to raise, or a reward for more. The app is 21+ already (the first run's age gate).
- **Local only**: scheduled on the phone with expo-notifications. No server, no push key, no device token, nothing sent anywhere.
- **One a day, at most**, at the person's time (6:00 PM unless changed). **Never the same message within 60 days.** No badge.

### 3.2 The ask (frame `optin`)

`components/notifications/IdeasOptIn.tsx`, a `BottomSheet`:

| Piece | Words and geometry |
|---|---|
| Preview | An in-app drawing of the notification, 392 wide, `wash`, radius 12: the app icon 38 (`assets/images/icon.png`), "Sipply" `small` 600, the chosen time `small` `muted` on the right, and the body in `small` `ink`: **the person's own first planned idea** (`plan(...)[0]`, filled), so it shows exactly what they would get |
| Title | **Get one idea a day?** `body` 600 |
| Consent | `body`: "Sipply can send you one notification a day at 6:00 PM: a drink to read about, a recipe to create, or something new in the Dex." (the time is theirs) |
| Small print | `small` `muted`: "Never more than one a day. Change the time or turn it off in Settings, under Notifications. Next, iOS asks you to allow them." |
| Keys | **Allow daily ideas** (primary, 392 × 52); **Not now** (text, `muted`, 44) |

The time is formatted by the phone's locale (`toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })`) with the space before AM or PM made a no-break space (U+00A0), so "6:00 PM" never breaks across lines.

**When it appears.**

1. **A first**: the first time on this phone that the person catches a drink (the Dex goes from 0 to 1), posts, adds a drink of their own, saves something (a drink or a post), or follows someone. The store notes it (`noteDone`) and sets `due`. Ignored while the first run is up: the first run's own saves never count.
2. **A calm moment**: `IdeasOptInHost`, mounted in `app/(tabs)/_layout.tsx`, shows the sheet 800 ms (a JS timer) after all of these hold: `due`; a tab root is focused; no modal or sheet is up (the + window closed, `useCelebrate`'s queue empty, `FirstRun` gone); the app is active. So after a first catch it comes once the celebration card is done and you are back on a tab, never over the + window, a celebration or another sheet.
3. **Only if it may ask**: iOS's status is not denied, daily ideas are off, it has asked fewer than twice, and (on the second ask) at least 14 days have passed since the first **and** something new happened after them (any catch, post, own drink, save or follow).

**Answers.**

- **Allow daily ideas**: `requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } })`. Granted: on, plan and schedule at once, announce "Daily ideas on, at 6:00 PM". Denied in iOS's prompt: stays off, and Sipply never shows this sheet again by itself (Settings explains, §3.3).
- **Not now**, a swipe down or the scrim: `asks + 1`, `lastAskedAt` now. After a second Not now, never again by itself.
- **No provisional authorisation** (iOS's quiet delivery without asking): it would skip the consent this screen exists for.
- It is a **phone** setting, not an account's: signing out keeps it, and the ideas that need an account drop out of the plan (§3.4).

### 3.3 Settings → Notifications (frames `settings`, `time`)

A new section straight after **Your activity**, in the house's wash groups:

| Row | When | Trailing | Line under the title |
|---|---|---|---|
| **Daily ideas** | always | the 22 pt `Box`, ticked when on | on: "One a day from Sipply"; off: "One idea a day, at a time you choose"; on, but notifications are off for Sipply in iOS: "Off in iOS Settings" |
| **Time** | only while on | "6:00 PM" `small` `muted`, chevron | none |

- A **squared box, never a pill switch**: the house has no ovals (check-design rule 4). VoiceOver reads the row as a `switch`: "Daily ideas, on" or "off", hint "One notification a day".
- **Turning it on**: iOS granted → on, and the plan is made at once; iOS not asked yet → the same ask sheet (§3.2), over Settings, whatever the ask count, since the person asked for it; iOS denied → an `Alert` "Notifications are off for Sipply" / "Turn them on in iOS Settings, then come back here." with **Not now** and **Open Settings** (`Linking.openSettings()`).
- **Turning it off**: every scheduled idea is cancelled at once (§3.8), "Daily ideas off" is announced. History is kept, so turning it on again does not repeat the last 60 days.
- **The time sheet** (`components/notifications/TimeSheet.tsx`, a `BottomSheet`): **Time** `body` 600 centred; iOS's own wheel, `@expo/ui/swift-ui` `Host` + `DatePicker` with `displayedComponents={['hourAndMinute']}` and `modifiers={[datePickerStyle('wheel')]}` (`@expo/ui` is already a dependency, unused until now); `small` `muted` "Your idea comes once a day, at this time."; **Done** (primary). Done saves hour and minute and replans at once; the scrim or a swipe leaves the time as it was. **Fallback**, on Android and if `@expo/ui` misbehaves on iOS: a list of the 48 half hours in the same sheet, 52 pt rows, the chosen one ticked, scrolled to it.
- No new route: the Your tastes rerun is already a Modal here; the time is a sheet.

### 3.4 Planning: the next 14 days (`plan`, ported from `tools/schedule.mjs`)

**Inputs, read on the phone when planning:** caught (the Dex's count, `useCollection`), total (2,089 today, from the catalogue), signed in, posts (your own posts on the phone), drinks of your own (`useCustomDrinks`), following (`useSocial.following`), saved (drinks + posts), tastes answered (`hasAnswers`), collections live (023, signed in), tags live (024, signed in, following someone), whether you **logged or posted today**, the history of delivered ideas (90 days), the install id, the time.

**The plan**, deterministic:

1. **Days**: 14 consecutive local days. Today is included only while its time is more than a minute away **and** you have not logged a drink or posted today (the idea would only repeat what you just did); otherwise the plan starts tomorrow.
2. **Eligible messages**: those whose category's needs and own needs all hold now (needs vocabulary in `ideas.mjs`), and that were not delivered (or planned earlier in this window) in the last **60 days**. A message naming a drink, the day's suggestion or a fact's own drink, needs that drink not named in the last 60 days.
3. **Category**: drawn with the weights below among categories that still have an eligible message, **never yesterday's category**, using a generator seeded by `installId:YYYY-MM-DD`. So replanning ten times a day gives the same idea for the same day, and two phones do not get the same idea on the same evening.

   | State | first | post | log | create | explore | dex | saved | friends | know | tastes |
   |---|---|---|---|---|---|---|---|---|---|---|
   | Nothing in the Dex | 5 | | | 1 | 3 | 2 | 1 (2 signed in) | 2 signed in | 2 | 2 without answers |
   | Drinks in the Dex, never posted, signed in | | 4 | 3 | 2 | 3 | 2 | 2 | 2 | 2 | 2 without answers |
   | Drinks in the Dex, posted | | | 3 | 2 | 3 | 2 | 2 | 2 | 2 | 2 without answers |

4. **Message**: within the category, one never delivered beats one delivered long ago; among equals, the seeded draw.
5. **Tokens** filled now: `{caught}` `{total}` `{left}` with `formatCount`, `{suggestion}` the day's drink's name (§3.5).
6. **Nothing eligible** for a day (possible only after months of daily use with a narrow state): no idea that day, never a repeat.

**What the simulation proves** (`node specs/v4.3/tools/schedule.mjs`, five people over 180 days, replanning on every opening): one idea a day at most; no message twice within 60 days; no drink named twice within 60 days; no category two days running; never more than 14 pending. Someone who stops opening Sipply gets the 14 already planned and then nothing (person Q): the window is what stops it nagging (open question 2).

### 3.5 The day's suggestion

`suggestionsFor(state)`: `recommend({ ...answers, drinks: 'cocktails', exclude: [...caughtIds, ...savedDrinkIds] }, 30)` (`lib/recommend`, the first run's own scorer); with no answers, the same call with empty answers, which ranks by the classics weight and photographs. Cocktails only, so every "recipe" and "glass" line is true of it. The planner takes the first not named in the last 60 days. Persona E's first suggestions: Piña Colada, Daiquiri, Strawberry Daiquiri, Mary Pickford, Mojito.

### 3.6 The catalogue: 200 ideas (`ideas.mjs`)

| Category | Count | For | Opens | Example |
|---|---|---|---|---|
| first | 16 | Nothing in the Dex yet | + window, Dex | "Post your first drink. Pick one you've had before, add a photo, and it lands in your Dex." |
| post | 14 | Drinks caught, signed in, nothing posted | + window, Dex, profile | "Post your first drink. Your friends see it on Home, and it stays on your profile." |
| log | 28 | Drinks caught | + window | "Your camera roll might hold a drink or two you never logged. Worth a look." |
| create | 22 | Anyone | add a drink | "Create a new drink. Give it a name, a recipe and a photo, and it joins your Dex." |
| explore | 34 | Anyone | the suggestion's page | "Meet Piña Colada. Its page has the recipe, the glass and where it comes from." |
| dex | 22 | Anyone | Dex, Dex progress | "Filter the Dex by flavour: fruity, sour, bitter and more." |
| saved | 18 | Anyone; collections lines need 023 | Saved, Dex, Home | "Make a collection: group saved drinks by flavour, by trip, by anything." |
| friends | 20 | Signed in | Find friends, Home, Activity, profile, + window | "When a friend tags you in a post, you'll find it in Activity." |
| know | 20 | Anyone | a drink's page, Dex | "The Daiquiri is named after a beach near Santiago de Cuba. Its page has the rest." |
| tastes | 6 | No answers yet | Your tastes | "Fruity, sour or bitter? Answer once and get picks that fit." |

**Every line's rules** (checked by `tools/schedule.mjs`, which becomes `scripts/check-ideas.mjs`): at least 200; unique ids (`<category>-NN`) and bodies; the counts per category; known needs, opens and tokens; `{caught}` only with `caught2` (never "1 drinks"), `{left}` only with `caught`, `{suggestion}` only opening `drink`; a fixed `drink` that exists in `drinks.json`; at most **120 characters** filled with the longest real values (the longest today is 98); no en or em dash, no "!", no emoji, no capitals typed in, no U+2116; starts with a capital and ends with a full stop or a question mark; British spelling; and the **1.4.3 banned list** (inviting a drink, drinking as the verb, rounds and shots, a time or a day, effects, reward, habits and streaks, counts to raise, one more, "try", going out, strength). A person read every line too, because a list cannot judge tone. Knowledge lines state only facts that match the drink's own page (`origin`, `funFact`) or that are standard (bourbon's rules, juniper in gin).

**Body only, no title.** iOS puts the app's name on the first line of a notification with no title, so a title would say "Sipply" twice (to confirm on device, §7).

### 3.7 What a tap opens

Each scheduled idea carries `data: { kind: 'daily', id, day, url }`. One handler (`routeNotification` in `src/lib/notifications.ts`) opens `data.url` for **any** kind, so a later tag push opens its post with no client change (§2.5):

| `opens` | `url` | How |
|---|---|---|
| `log` | `/log` | `navigate`: the + window, find step |
| `addDrink` | `/add-drink?from=shelf` | `navigate('/dex')`, then `push` the form, so Back lands on the Dex, which takes the form's handoff and opens the new drink |
| `dex` | `/dex` | `navigate` |
| `drink` | `/drink/<id>` | `push` |
| `progress` | `/stats` | `push` (Dex progress keeps its old path) |
| `saved` | `/saved` | `navigate` |
| `findFriends` | `/find-friends` | `push` |
| `home` | `/` | `navigate` |
| `activity` | `/activity` | `push` |
| `profile` | `/profile` | `navigate` |
| `tastes` | `/settings?open=tastes` | `push`; Settings opens Your tastes once when `open === 'tastes'` (`useLocalSearchParams`, no new route) |
| (later) tag push | `/post/<uuid>` | `push` |

- **Allowlist**: `^/(|log|dex|saved|profile|activity|stats|find-friends|add-drink\?from=shelf|settings\?open=tastes|drink/[a-z0-9][a-z0-9-]{0,79}|post/<uuid>|user/<uuid>)$`. Anything else opens Home. A drink id the catalogue lost opens the drink page's own not-found state.
- **Listeners**: `addNotificationResponseReceivedListener` while running; on a cold start, `getLastNotificationResponse()` once the root navigator is ready, then `clearLastNotificationResponse()`; a response is acted on once (its identifier is remembered for the session).
- **Screens that need an account** (Saved's collections, Activity, Find friends) keep their own `AuthGate`. Ideas that need an account are not planned while signed out.

### 3.8 Scheduling, cancelling and the 64 cap

- **Identifiers** `daily:YYYY-MM-DD`; `content: { body, sound: 'default', data, interruptionLevel: 'active' }`; `trigger: { type: SchedulableTriggerInputTypes.DATE, date, channelId: 'daily-ideas' }`.
- **Cancel only ours**: `getAllScheduledNotificationsAsync()`, keep those with `content.data.kind === 'daily'`, `cancelScheduledNotificationAsync(identifier)` each. Never `cancelAllScheduledNotificationsAsync`, so a later kind is never touched.
- **The 64 cap**: iOS keeps at most 64 pending local notifications per app. Sipply holds at most 14; `WINDOW_DAYS` is asserted at most 30 in code.
- **Replanned** (cancel ours, plan, schedule; one run at a time, a request during a run queues one more):
  1. at launch, once the stores have rehydrated;
  2. when the app comes to the foreground (`AppState` active), at most once every 10 minutes unless the local day or the time zone changed;
  3. on Settings: on, off, a new time;
  4. after something that changes the state: a catch, a post, a drink of your own, a save, a follow, answering your tastes (debounced 3 s, after interactions);
  5. on sign in, sign out and account change;
  6. when iOS's permission changed (read on foreground with `getPermissionsAsync`): granted to denied cancels ours and the Settings line says so; denied to granted while on plans again;
  7. after an over-the-air update (a new catalogue): ids in history that no longer exist are ignored.
- **What was delivered**: the last plan is kept (`planned`); on each replan, every planned idea whose time has passed moves to `history` (kept 90 days).
- **While Sipply is open** at the time: `setNotificationHandler` shows a `daily` idea in Notification Centre only (`shouldShowBanner: false`, `shouldShowList: true`, no sound); any other kind (a later tag push) shows its banner.
- **Web**: every call is a no-op (`Platform.OS === 'web'`).

### 3.9 Install and config

- `npx expo install expo-notifications` (SDK 57's version; Hornofino runs 57.0.10). A native module, so this is **build 25**: the runtime fingerprint changes and no over-the-air update can carry it. The tags could ship over the air, but they ride with it.
- `app.json` plugins: `["expo-notifications", { "icon": "./assets/images/android-icon-monochrome.png", "color": "#0A0A0A" }]`. No `sounds`, and `enableBackgroundRemoteNotifications` stays off (no `UIBackgroundModes`).
- **iOS entitlement**: the plugin always writes `aps-environment` (development unless `mode` is set), and prebuild applies it even when the plugin is not listed, because expo-notifications is installed. So the App ID `com.janmcqueeny.drinkdex` needs the **Push Notifications** capability: Xcode's automatic signing adds it on the first archive, or tick it at developer.apple.com → Identifiers. **No APNs key and no certificate**: those are for remote push (§2.5). After the App Store export, check the signed app says `aps-environment = production` (`codesign -d --entitlements :- Sipply.app`); Xcode's App Store export signs with the distribution profile's value.
- **No Info.plist string** (local notifications have no usage description).
- **Android**: `setNotificationChannelAsync('daily-ideas', { name: 'Daily ideas', importance: AndroidImportance.DEFAULT })` at startup, before any ask (Android 13 shows its prompt only once a channel exists); `requestPermissionsAsync()` covers `POST_NOTIFICATIONS`.
- **Privacy manifest**: no new collected data type. expo-notifications ships its own `PrivacyInfo.xcprivacy` for its required-reason APIs.

### 3.10 Modules and the store

| File | What |
|---|---|
| `src/data/dailyIdeas.ts` | `CATEGORIES`, `IDEAS: DailyIdea[]`, verbatim from `ideas.mjs` |
| `src/lib/dailyIdeas.ts` | `WINDOW_DAYS` 14, `NO_REPEAT_DAYS` 60, `HISTORY_DAYS` 90, `OPENS`, `NEEDS`, `weights`, `eligible`, `suggestionsFor`, `fill`, `plan`: the port of `tools/schedule.mjs` |
| `src/lib/notifications.ts` | `notificationsStatus()`, `askNotifications()`, `rescheduleDailyIdeas(reason)`, `cancelDailyIdeas()`, `routeNotification(data)`, `setupNotifications()` (handler, Android channel) |
| `src/store/ideas.ts` | Persisted (`createGuardedStorage`, key `sipply-ideas.v1`) |
| `components/notifications/IdeasOptIn.tsx` | The ask, and `IdeasOptInHost` (in the tabs layout) |
| `components/notifications/TimeSheet.tsx` | The time sheet |
| `components/notifications/NotificationsHost.tsx` | In the root layout: setup, listeners, the cold-start response, `AppState` replans |
| `scripts/check-ideas.mjs` | The catalogue's checks, run beside check-design |

```ts
interface IdeasState {
  enabled: boolean;                 // the Settings box
  hour: number; minute: number;     // 18, 0
  installId: string;                // random, made once (expo-crypto randomUUID)
  asks: number;                     // 0 to 2
  lastAskedAt: string | null;
  answer: 'allowed' | 'notNow' | 'denied' | null;
  due: boolean;                     // a first happened; ask on the next calm tab
  planned: { id: string; cat: string; day: string; at: string; drink: string | null }[];
  history: { id: string; cat: string; day: string; drink: string | null }[];
  tz: string | null;                // the zone the plan was made in
  noteDone: (kind: 'catch' | 'post' | 'create' | 'save' | 'follow') => void;
}
```

### 3.11 Two real fortnights (the first week of each)

Persona E (14 caught, 5 posts, follows 6, collections and tags live):

| Day | Idea | Opens |
|---|---|---|
| 16 Oct | Read how Piña Colada is put together, step by step. | /drink/pina-colada |
| 17 Oct | Gin's main flavour comes from juniper. The rest is each distiller's choice. | /dex |
| 18 Oct | Today's pick from the Dex: Daiquiri. Save it if it sounds good. | /drink/daiquiri |
| 19 Oct | Bookmarks on posts and on drinks both end up in Saved. | /saved |
| 20 Oct | Meet Strawberry Daiquiri. Its page has the recipe, the glass and where it comes from. | /drink/strawberry-daiquiri |
| 21 Oct | Post a drink and tag the people who were there with you. | /log |
| 22 Oct | Whisky or whiskey? Scotland and Japan usually leave out the e. Ireland and the US usually keep it. | /dex |

Person N (new, signed out, no answers, nothing caught):

| Day | Idea | Opens |
|---|---|---|
| 16 Oct | Tell Sipply what you like and your Dex puts those drinks first. | Your tastes |
| 17 Oct | Drag the number rail at the side of the Dex to jump anywhere in it. | /dex |
| 18 Oct | Spirits count too. A bottle you know well can be the first thing in your Dex. | /log |
| 19 Oct | From the Dex: Piña Colada. Read how it's made. | /drink/pina-colada |
| 20 Oct | Keep a list of drinks to read about later. Save them as you browse the Dex. | /dex |
| 21 Oct | Tap + and type a drink you remember. That's all it takes to start your Dex. | /log |
| 22 Oct | Save drinks you want to remember with the bookmark on their page. | /dex |

---

## 4. Privacy and App Store (same build; bump **Last updated**)

`docs/privacy.md`, **What Sipply stores about you**, after "Collections":

> **Tags.** When you post, you can tag up to 10 people you follow who were with you. Anyone who can see the post can see who is tagged in it, and each person you tag sees the post in their Activity. Someone you tag can remove themselves at any time, and you are not told; you can't tag them on that post again. Blocking someone, either way, removes the tags between you. Tags are kept with the post.

**On your device**, a new paragraph:

> **Daily ideas (only if you allow them).** If you turn on daily ideas, Sipply schedules one notification a day on your phone, at the time you choose. They are written and scheduled on the phone from what is already there, such as your Dex, your tastes and what you have saved. Nothing about them is sent to us or to anyone else, and no notification service is involved. Turn them off in **Settings → Notifications**, or in your phone's settings.

**Who else can see it**, in the Other Sipply users paragraph: "If someone tags you, anyone who can see their post can see your username on it."

**Deleting your account**: add "the tags on your posts and the tags of you on other people's posts". `docs/data-deletion.md`, **From our servers**: add "- tags on your posts, and tags of you on other people's posts".

`docs/appstore.md`:

- **User Content → Other User Content** adds "tags (the people you tag on a post)". No new data type: local notifications collect nothing, and build 25 collects no device token.
- **Review notes**, a new paragraph:

  > **Daily ideas (optional notifications).** Only after someone has used Sipply (their first logged drink, post, drink of their own, save or follow) does one screen offer a notification a day; it shows an example, says how to turn it off, and iOS's prompt follows only if they tap Allow. The notifications are local, scheduled on the phone, at most one a day at the time the person picks (6:00 PM unless changed); Settings → Notifications turns them off. The 200 messages invite people to log drinks they have already had, write down recipes, read about drinks, save and organise them, and see friends' posts. None suggests drinking, a time to drink or drinking more. To see it: log a drink, finish the celebration, and return to Home.

- The tournaments paragraph's "no push notifications" stays true: tournaments send none. **Superseded (28 Oct 2026): from v4.9 a tournament sends one push, the invitation, and the review notes say so; see `specs/v4.9/push.md`.**

`docs/terms.md`: no change.

## 5. Motion

| What | How |
|---|---|
| Picker | UIKit's page sheet (as the likers list), Reduce Motion is UIKit's |
| In this post, the ask, the time sheet | The existing `BottomSheet` (the Modal's own fade) |
| A tick, a chip appearing or going | A cut, with the selection haptic |
| The "with" line changing | Re-rendered in place; nothing animates |
| The ask's 800 ms wait | A JS timer, then the sheet; no Reanimated |

No `entering` / `exiting` / `layout` props, no Reanimated-driven chrome, nothing that starts invisible (check-design rules 3 and 15).

## 6. Accessibility

- Contrast: every pair is an existing Daylight pair. Lowest text: `muted` on `wash` 6.13 (the picker's placeholder, the preview's time); the chips' `onInk` on `ink` 19.80; an unticked box's `control` edge on `page` 3.45.
- Targets: the compose row 56; picker rows 64; chips 32 drawn with 6 of slop each side; the "with" target 44 with slop; keys 36 inside 64 rows; Settings rows 52 and 64.
- Dynamic Type: the header's two lines keep `HEADER_CAP` 1.3 and the line's fitting uses the capped scale; picker and sheet rows grow; the ask sheet scrolls inside itself at the two largest sizes with its keys pinned.
- VoiceOver: the compose row's value says who; picker rows are checkboxes; the header gains one action; Activity's tag row is one button; the Settings box is a switch; the ask and the time sheet are announced with their titles; a removal and a toggle are announced.

## 7. Build checklist

1. `supabase/migrations/024_post_tags.sql` (from the draft) and `schema.sql`; `database.types.ts`.
2. `lib/social.ts`: `tagsSupported`, `POST_TAGS_MAX`, `fetchPostTags` in `toPosts`, `fetchMyPostTags`, `setPostTags`, `removeMyTag`, `createPost`'s new return, the third reads in `fetchActivity` and `fetchLatestActivityAt`. `types.ts`. `lib/pour.ts` (`'untagged'`). `store/social.ts` (`addPost` tags, `setTags`, `removeMyTag`, `tagsVersion`). `lib/tags.ts`.
3. `components/log/TagPeopleRow.tsx` in `app/log.tsx` (the row, `dirty`, the re-post start); `components/tags/TagPeopleSheet.tsx`; `components/tags/TaggedSheet.tsx`.
4. `PostCard`: the "with" line in `PostHeader`, its target and VoiceOver action, the ••• rows (Tag people, Remove me from this post), the removal overlay. `app/activity.tsx`: `TagRow`, the empty body.
5. `expo-notifications` installed, the `app.json` plugin, the App ID's Push Notifications capability.
6. `src/data/dailyIdeas.ts`, `src/lib/dailyIdeas.ts`, `src/lib/notifications.ts`, `src/store/ideas.ts`; `NotificationsHost` in `app/_layout.tsx`; `IdeasOptInHost` in `app/(tabs)/_layout.tsx`; `noteDone` calls at a catch (`useCollection.unlock`), a post (`addPost` ok), a drink of your own, a save (post or drink), a follow; Settings' Notifications section, `TimeSheet`, and `open=tastes`.
7. `scripts/check-ideas.mjs`; check-design and check-contrast pass (no pill, no uppercase, no `entering=`); `node specs/v4.3/tools/schedule.mjs --quiet` passes.
8. `docs/privacy.md`, `docs/data-deletion.md`, `docs/appstore.md` (§4).
9. On device, build 25: a body-only notification shows "Sipply" as its first line; a tap from a cold start opens the right screen; the time change moves tomorrow's idea; off cancels everything pending; `aps-environment` is production in the exported app.

**Acceptance**: tagging ana and leo shows "maya.pours with ana and leo" on Home and the post page, and a row in each one's Activity with the dot; ana removes herself, the line drops her and maya cannot tag her on that post again; a block either way removes the tags; before 024 the build behaves as build 24. Daily ideas: never asked before a first; Allow gives one idea a day at 6:00 PM, never the same within 60 days; a new time moves them; off stops them; every tap opens its screen.

## 8. Open questions for Jan

1. **Tag anyone you follow, or only people who follow you back?** Recommended: **anyone you follow**, as you asked. Removing yourself sticks, a block clears tags, and an Activity row is all a tag can do to someone. Mutual-only is one line in 024's insert policy if strangers tagging people becomes a problem.
2. **When someone stops opening Sipply, stop after 14 days of ideas?** The plan is made when the app opens, so a person who never opens it gets the 14 already planned and then nothing. Recommended: **yes**, as drawn: it stops a notification nobody reads from becoming noise, and Apple looks kindly on it. The alternative is a 30-day window (still under iOS's 64).
3. **A "Tagged" grid on profiles**, as Instagram has? Recommended: **not now** (less stuff): Activity and the post line cover being tagged.
