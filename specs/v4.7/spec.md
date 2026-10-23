# v4.7 · The Tournaments tab, post motion, "Type your drink", more pen (build spec)

Jan, 23 Oct 2026, with three screenshots (the + window's search field; the tab bar with the red + circled; a feed post with a big heart drawn over the photo and the like, share and save keys circled):

> "Firstly, I want you to remove the red + in the middle since what I want you to put there is the tournament tab, make it visually pleasing, where the users can see a whole table of all the drinks their friends have registered. Then I want you to add motion graphics to when someone is liking, sharing or saving a post. Then I want you to change the text in the typing to type your drink, or something like that. Finally I want you to add more detail like the ones you added, but not too much as to not make it too heavy or too many details."

His picks, as given:
- The tab is a **Friends board**: running tournaments on top (a card each: name, time left, top three) and a "Host a tournament" key; below, **Friends**: one row per person you follow plus you, ranked by how many **different** drinks they have posted, each row with rank, avatar, username, the count and their latest three drink photos; a row opens that profile.
- The centre key stays a **red square** (the accent place the + held) but holds a **trophy** and opens the Tournaments tab.
- The double-tap heart is Instagram's: double-tap the photo to like, a big heart over it.

His standing rule is "less stuff". Every choice below takes the quieter option where two would do.

This file is the build contract. Parts 1 to 6 are the six asks; Part 7 says who owns which file. Mocks: `mock/` (open `mock/index.html#wall`; `board.png`, `empty.png`, `loading.png`, `tabbar.png`). The mock tool is the v4.6 one, cut down, and its pen marks are paths that `src/components/details/penPath.ts` itself generated (`mock/marks.js`). All measures are at 440 x 956 unless a 390 figure is given in brackets.

Rules that hold everywhere in this round (the same as v4.6):
- No Reanimated `entering`, `exiting` or `layout` props (they stall in Release). Shared values, `withTiming`/`withSequence`/`withDelay`, `useAnimatedStyle`, transforms and opacity only. No spring that visibly bounces: every "pop" below is a timed sequence that settles once.
- No new native modules. `expo-haptics` 57.0.3 is installed and wrapped as `haptic` in `components/ui.tsx`; nothing else is added.
- Reduce Motion (`useReducedMotion()`) collapses every motion here to a plain state change.
- FlatList cells do no per-item work on scroll: every animation's state is local to the key that was pressed, and is driven by a press or by its own value changing, never by mount.
- App Store 1.4.3: the app never encourages drinking or drinking more. Every count is **entries** (different drinks, each counted once, ever), never amounts, never per day, no streaks, no meters, no notifications about standing.

---

## 1. The tab bar

### 1.1 What changes

Build 29: Home · Dex · **+** · Saved · Profile, where the + was not a page (it opened the + window, `/log`).

v4.7: Home · Dex · **Tournaments** · Saved · Profile. Five pages, five equal slots. The centre slot is a real tab in the pager, between Dex and Saved, drawn as the **Tournaments key**: the red rectangle kept, a white trophy on it. Swiping from the Dex goes to Tournaments, then Saved.

### 1.2 The Tournaments key (`components/FloatingTabBar.tsx`)

| | Build 29 (the + key) | v4.7 (the Tournaments key) |
|---|---|---|
| What it is | `CentreAction`, not a route | `TournamentsKey`, the glyph of the route `board` |
| Fill | `colors.accent`, `accentPressed` held | the same |
| Size | 52 x 38, 3pt hitSlop to 44 | **52 x 32**, corners `radius.control` (4). The Pressable is the whole slot, as every tab's is (88 x 49 at 440), so no hitSlop |
| Glyph | `plus` 22, `onAccent`, filled | `trophy` 22, `onAccent`: **outline at rest, solid when focused** |
| Where you are | the line never rested under it | the 18 x 2 ink line rests under it like any tab |
| Haptic | none (it opened a window) | `haptic.select()`, as every tab press |
| VoiceOver | "Post a drink", hint "Take a photo…" | label **"Tournaments"**, `accessibilityRole="button"`, `accessibilityState={{ selected }}`, no hint |

**Why 32 tall.** The row is 49; the active line is at y 43 to 45 (`LINE_TOP`). A 38 key ran y 5.5 to 43.5, over the line. At 32 it runs 8.5 to 40.5, so the line sits 2.5 under it: the same air the line keeps under a 33pt glyph box (box foot 41, line 43). It still reads as the bar's one filled key, a little slimmer (`mock/tabbar.png`).

**The line.** There is no slot without a page any more, so the track is plain: `slots = pages`, page *i* rests the line on slot *i*'s centre (`outputRange: at.map((i) => i + 0.5)`). Delete `fabAt`, `savedAt`, `barAt`, the `+1` offset, `fabColumn` (the page column that hid the line as it crossed the +) and `CentreAction`. The line now passes under the red key on its way from the Dex to Saved, and rests under it on Tournaments; it stays ink (the accent never says where you are).

**Which slot.** The key is drawn for `route.name === 'board'`, wherever that route falls. In the shipping set (Reels and My Bar off) it is the centre. With Reels on it is the fourth of six, with My Bar on the third of six; neither flag ships, and the pager rebuilds when the page count changes, so nothing else needs to know.

**The glyph** is the existing `trophy` from `components/icons.tsx` (the 1.6 stroke family, round caps). Its SOLID form today is the cup, stem and foot **without handles**, which at 22 on red reads as a stemmed glass, the Dex's own idea. Give `SOLID.trophy` its handles: the outline's two handle paths, stroked at the filled weight (1.6 + 0.55 = 2.15) in `currentColor` inside the solid group (`<G fill={color} color={color}>` in `Icon`, and a nested `<G fill="none" stroke="currentColor" strokeWidth={2.15} strokeLinecap="round" strokeLinejoin="round">`). If `currentColor` does not resolve on device, draw the handles as filled outlines instead (offset the centreline ±1.075). The mock draws exactly this (`ic('trophy', …, solid)`); the other solid trophy users (none today: Leaderboard and Activity draw the outline) gain handles too.

**Names check-design reads** (rule 17, `ACCENT_FILES`): the accent and `onAccent` sit only inside `TournamentsKey`, `styles.trophyKey` and `styles.trophyKeyPressed`. Use exactly these names.

**`TAB_BAR_CLEARANCE`**, the bar's opacity, its Dock rise (`(tabs)/_layout.tsx`'s `<Rise group="chrome">`) and the face ring are unchanged.

### 1.3 The pager (`app/(tabs)/_layout.tsx`)

Add, between `dex` and `saved`:

```tsx
<TopTabs.Screen
  name="board"
  options={{
    title: 'Tournaments',
    tabBarAccessibilityLabel: 'Tournaments',
    tabBarIcon: tabIcon('trophy'),          // the bar draws it on the red key (1.2); this is its fallback
    lazyPlaceholder: () => <TabPlaceholder title="Tournaments" />,
  }}
/>
```

- **The route is `(tabs)/board.tsx`, URL `/board`, never `/tournaments`.** `/tournaments` is already the pushed full list (`app/tournaments/index.tsx`) and its children (`[id]`, `new`); a tab at the same path would collide with it. `lib/tournaments.ts` gains `boardHref = () => '/board' as Href`. Every existing `tournamentsHref()` link (Activity's invitations row, the tournament page's cold Back) keeps going to the full list, which is where invitations are answered.
- No `TopTabs.Protected` guard: the page count must be fixed for a build, and the tab must exist whether or not the server has migration 020 or 025 (2.8 says what it shows then).
- Lazy, as every tab: `TabPlaceholder title="Tournaments"` draws the title and its swash, so the swash does not pop in.
- The header comment's destination list becomes Home · Dex · Tournaments · Saved · Profile; "The post action is seated in the bar" goes.

### 1.4 Posting stays reachable, and `/log` is unchanged

`/log` (the + window) stays a root-stack `fullScreenModal`. Only the tab bar's call to it goes. It is still opened by:
- Home's **create key** (HomeChrome, "Post a drink", the + in a square beside the Activity heart): the main way, as on Instagram;
- the drink page's pinned **Post** key and the custom drink page's;
- Dex progress's, someone's pours', a tournament page's "Post a drink you've had", your empty profile's "Post a drink";
- a notification or a Daily idea that `opens: 'log'`.

Nothing called the + key from outside the bar. Stale wording to fix (comments, and one string):

| File | Now | v4.7 | Owner |
|---|---|---|---|
| `components/home/HomeChrome.tsx` 89 | "as the tab bar's + does" | "the one key that opens the + window from a tab" | A |
| `components/icons.tsx` 294 | "as the tab bar's + does" | drop the clause | A |
| `app/(tabs)/profile.tsx` 29 | "Posting is the + tab" | "Posting is Home's create key" | A |
| `components/profile/ProfileView.tsx` 55 | "+ in the bar · the + tab" | remove the row | A |
| `app/_layout.tsx` 186 | "from the bar's + and every other Post button" | "from Home's create key and every other Post button" | A |
| `app/log.tsx` 63 | "The + tab's destination" | "Posting's window, opened by Home's create key and every Post key" | B |
| `data/dailyIdeas.ts` 135 (`first-10`, shown to people) | "Tap + and type a drink you remember. That's all it takes to start your Dex." | **"Type a drink you remember. That's all it takes to start your Dex."** (the idea opens the + window itself) | B |
| `lib/introDockPlan.ts` 139, `components/VideoIntro.tsx` 383, `scripts/check-intro-dock.mjs` 104 | "the red + key", "a + key" | "the Tournaments key" | C |

### 1.5 The accent place, renamed

Place 1 is **the Tournaments key** (it was "the + key"), in `constants/theme.ts`'s list, `specs/v4-mockups/white/spec.md` §1.3 and check-design rule 17's `ACCENT_FILES` (`why: 'the Tournaments key (1)'`, `within: ['TournamentsKey', 'styles.trophyKey', 'styles.trophyKeyPressed']`). The reason changes with it: the bar's one filled key is now the app's shared game rather than posting, which keeps its red in the post key (place 2). Part 4 adds place 7, the liked heart. Owner: C.

---

## 2. The Tournaments tab (the Friends board)

### 2.1 Files

- `app/(tabs)/board.tsx`: the route. `<AuthGate>` around `<FriendsBoard />`, as `(tabs)/profile.tsx` wraps its body, keyed on the user id so an account switch remounts it.
- `components/tournaments/FriendsBoard.tsx`: the screen, its header block and its rows. **The board rule lives here** (2.4), so this file is a `DETAIL_SITES` placement (C lists it).
- `components/tournaments/TournamentCard.tsx`: one running tournament's card (2.3).
- `lib/friendsBoard.ts` and `store/friendsBoard.ts`: the data (Part 3).

### 2.2 Layout, top to bottom (`mock/board.png`)

| y (440) | What | Detail |
|---|---|---|
| 62 to 114 | **Top bar** | `ScreenTopBar size="lg" title="Tournaments"`, nothing on the right. The swash under the title comes from ScreenTopBar itself (v4.6 A.3 #4): no new code. Rule on scroll via `useScrolledPast`. |
| 130 to 178 | **Host a tournament** | `<Button label="Host a tournament" variant="secondary" icon="plus" block />` at the gutter, the same call as the full list's key. Opens `newTournamentHref()`. Jan asked for it on top. Hidden only while the server has no tournaments (2.8). |
| 202 to 220 | **On now** | `SectionHeader size="group"` with the list's `HEAD_INSET` margins, so its words sit on the gutter. Only when at least one card shows. |
| 228 to 386 | **Cards** | One per running tournament you host or have joined (`rowKind(t) === 'live'`), ending soonest first, at most 5. One card: full width (392). Two or more: a horizontal `ScrollView` of 300pt cards, 12 apart, `contentContainerStyle={{ paddingHorizontal: layout.gutter }}`, `snapToInterval={312}`, `decelerationRate="fast"`, `showsHorizontalScrollIndicator={false}`, so the next card peeks past the right gutter and says "there is more". Above Larger Text 1.3 (`STACK_SCALE`), the cards stack full width instead. |
| 386 to 430 | **All tournaments ›** | A quiet 44pt line (small, muted, chevron 16, Profile's old line exactly): "All tournaments", and at its end what is waiting: `1 invitation` first, else `1 coming up`, else nothing. Opens `tournamentsHref()`, the full list (Invitations, On now, Coming up, Finished). One button to VoiceOver: "All tournaments, 1 invitation". Drawn whenever you have any tournament at all; with none, the empty line below replaces the whole block. |
| 430 to 454 | **The board rule** | 2.4. |
| 458 to 476 | **Friends** | `SectionHeader size="group"`, same margins. |
| 484 on | **Rows** | 64pt each (2.5). Six show above the bar at 440 with two cards on now. |
| foot | **The rules** | 24 under the last row, at the gutter, small muted: "Friends shows how many different drinks each person has posted, each counted once." then `<TournamentRules />`'s sentence ("… Entries are counted, never amounts. No prizes, and Apple is not a sponsor. Please drink responsibly."). One `Text`, two sentences' worth more than today's list. Bottom padding `insets.bottom + TAB_BAR_CLEARANCE`. |

**The list is one `FlatList`** of Friends rows. Everything above them is its `ListHeaderComponent` (memoised), the rules its `ListFooterComponent`. `keyExtractor={(r) => r.userId}`. No `getItemLayout`: its offsets would have to include the header's measured height, rows grow at Larger Text, and the list is at most 201 rows, so the default measuring costs nothing that matters.

**No panels around the rows, no rules between them**: rows on the page, set apart by space (Daylight, layout principle 3). The cards are the screen's only panels (`ui.Card`: wash, 8pt corner, no edge).

### 2.3 A tournament card (`TournamentCard.tsx`, `mock/board.png`)

`Card`, padding 16, height **158** (16 + name 24 + meta 18 + 10 + three 26pt lines + 12). Always room for three lines, so the card never grows when its standings arrive and two cards side by side are always the same height.

- **Name**: `textRole.bodyStrong`, one line with an ellipsis (Inter: a tournament's name is not a drink's), and a 16pt muted chevron at the right, centred on the name's line.
- **Meta**: small muted, one line: `Ends ${dayWord(lastMoment(endsAt))} · ${peopleCount(members)}` ("Ends Sunday · 5 people"), the helpers TournamentRow already exports. That is the "time left": a day, never a countdown clock.
- **Top three**: from `useTournaments().boards[id]` (`loadBoard(id)`, see 3.4), the first three `standings` by the server's rank. Each 26pt line: the rank in small 600 tabular, right-aligned in a 14pt column; a 20pt `Avatar` 10 after it; the username in small ink (yours followed by " (you)" in muted); the entries right-aligned in small muted tabular (`differentDrinks(k)`: "6 entries", "1 entry").
  - **Ranks are the server's**: a tournament breaks a tie by who got there first, so ranks never repeat on a card (1, 2, 3 even at 4 entries each).
  - **No rank for nobody-yet**: a member with 0 counted shows no figure and "No entries yet" (Leaderboard's rule: at nought every rank is the tie-break).
  - **Before the board arrives** the three lines are empty space (no spinner, no skeleton); a failed board leaves them empty too. The card still opens the page.
  - Blocked people are already out of `standings` (the server drops them).
- **Tap**: the whole card is one Pressable, opens `tournamentHref(id)`. Pressed: the card's fill goes `colors.press` (controls answer with their fill; no scale).
- **VoiceOver**: one button. "Negroni week. Ends Sunday, 5 people. 1st ana, 6 entries. 2nd you, 4 entries. 3rd leo, 4 entries." Hint "Opens the tournament". Use `ordinal()`.

### 2.4 The board rule (a new pen placement; also 6.2)

`<PenRule length={width − 2·layout.gutter} seed={PEN_SEED.board} />`: 392pt (342), in a **24pt band View** that ends the header block, `position: 'absolute', left: 0, top: 12 − PEN.rule.mid` inside the gutter-padded header, so its centreline is the band's middle.
- It separates the two halves of the screen the way Dex's head rule ends a head: tournaments above, people below.
- 12pt clear of the quiet line's text above and of the Friends head below; 40pt from the first row's face.
- **Drawn only when both halves are**: tournaments supported and Friends supported (2.8). With only one half there is nothing to separate. **Never under an error line**: when the tournaments load fails with nothing cached, the half above is "Could not load tournaments…", so the rule is left out and the Friends head takes its own 24 (v4.6 A.4: never on errors). (Integration, 23 Oct.)
- `width` from `useWindowDimensions`. A static, cached path: no measurement, no state.

### 2.5 A Friends row (`mock/board.png`)

64 tall, the whole row one Pressable.

| x (440) | What |
|---|---|
| 24 to 52 | **Rank**: `textRole.count` (17/24 600 tabular), right-aligned in a 28 column, `maxFontSizeMultiplier` 1.3, `adjustsFontSizeToFit` with `minimumFontScale` 0.75 so "200" fits. |
| 60 to 100 | **Face**: `Avatar` 40 (initials on the stored tone when there is no photo). |
| 112 to 276 | **Username** in `bodyMedium` (17/24 500), one line, ellipsis; yours followed by " (you)" in `textMuted`. Under it the count in small muted tabular: "42 entries", "1 entry", or "No entries yet". The username, not the display name: it is what people know each other by in the app, and it is what the cards and the Leaderboard show. |
| 288 to 416 | **Latest three**: 40 x 40 prints, 4 apart, ending on the far gutter, newest first from the left. A print is the post's own photo (`useSignedPhoto(photoPath)`, expo-image `contentFit="cover"`, `recyclingKey={path}`, decoded at 40pt: set the small-frame early resize, as build 13's lag fix requires for new Images in small frames), else the drink's stock photo (`photoFor(drinkId)`), else a wash square. 2pt corners and the `photoEdge` inset, like every print. Fewer than three posts: the missing slots stay empty page (no placeholder), so the column's left edge holds down the list. |

- **Order**: by entries, most first, then username (the server's order, 3.2).
- **Ties share a rank** (1, 2, 3, 3, 5): on the board a tie means nothing more than a tie. VoiceOver says "tied" (below).
- **Zero entries**: no rank figure, "No entries yet", no prints.
- **You**: always in the table, wherever your count puts you, said three ways and never by colour alone: the wash under your row (`colors.bgSunk`, from x 16 to 424, the row's full 64, `radius.control`), " (you)" after your name, and ", you" in the spoken label. Leaderboard's convention, exactly.
- **Tap**: someone else opens `/user/[id]` (`router.push`, as Activity does); yours goes to your Profile tab (`navigation.navigate('profile')`, the pager pages across). Pressed: the row's fill goes `colors.press` (yours from wash to press).
- **VoiceOver**: one button; the prints and the rule are hidden. Labels: "1st, maya.pours, 87 entries"; "3rd, tied, nico.pours, you, 42 entries"; "sam.ortega, no entries yet". Hint "Opens their profile" / "Opens your profile". Section heads are headers.
- **Larger Text** above 1.3 (`STACK_SCALE`): the prints move to their own line under the name block, starting at the name's x, and the row grows (no fixed height). Rank and face stay on the first line.
- **Scroll cost**: rows are memoised on their row object; nothing animates; the signed URLs are the shared cache's.

### 2.6 Empty states (`mock/empty.png`)

- **No tournaments at all** (the list is empty): no "On now", no cards, no quiet line. Under the Host key, 12 down, one small muted sentence: "Nothing on now. A tournament is a shared log of the Dex entries you and people you follow post between two dates." It takes 12 more under it when the rule follows (`nothingOverRule`), so the rule has 24 clear above as under the quiet line; at 12 it read as the sentence's underline (visual review). Then the board rule, then Friends.
- **Tournaments, none on now** (only finished, coming up or invitations): no "On now" and no cards; the quiet line shows ("All tournaments · 1 invitation ›").
- **You follow nobody**: the table is your row alone (no rank if you have 0 entries, else "1"). Under it, 16 down: "Follow people to see how many different drinks each has posted." (small muted), and a quiet line in ink 500, "Find people to follow ›", opening `/find-friends`. A link, not a second wash key under the Host key. The Host key stays: the host sheet's own picker already says "Follow people first".
- **Everyone you follow has 0 entries**: their rows show with no rank and "No entries yet", ordered by username, under yours.
- There is no `EmptyState` component on this screen except 2.8's "not here yet". A swash on the title is the tab root's own (v4.6 A.4 allows it).

### 2.7 Loading, refresh, errors

- **First visit, nothing in either store** (`mock/loading.png`): the bar, its swash and the Host key draw at once; under them `<Hold fill={false} slowMessage="Still loading tournaments and friends." />` centred in the rest. Never a skeleton. The Hold stays until **both** halves are known (each answered, failed, or said the function is missing), so the Friends head, rows and board rule never push in above an already drawn rules footer (code review, 23 Oct). A tournaments load superseded by a newer one does not count as answered: the tab waits for the newest to settle, so "Nothing on now" never flashes before cards.
- **Later visits** show what the stores hold at once and refresh quietly on focus (`useFocusEffect`): `useTournaments().load()`, then `loadBoard(id)` for each card shown (in parallel, at most 5), and `useFriendsBoard().load()`.
- **Pull to refresh**: `RefreshControl` (`tintColor={colors.textMuted}`) runs the same three and ends when all have answered.
- **A failed refresh with data showing**: a `Notice` (not red: the notice's ink tone) above the Host key, "Could not refresh. Pull down to try again.", as the full list does.
- **A failed first load of Friends**: under the Friends head, small muted, "Could not load. Pull down to try again." The tournaments half is unaffected, and vice versa.
- Tap targets: every control here is at least 44 tall (rows 64, the quiet lines 44, the key 48, cards 158).

### 2.8 When the server is missing a migration

- **025 missing** (no `friends_board`, `PGRST202` or `42883`, `isMissingFunction`): the store says `supported: false`. The Friends head, rows, footnote sentence about Friends and the board rule are not drawn; the tournaments half and the rules stay. No error anywhere. The next focus asks again, so applying 025 needs no new build.
- **020 missing** (`useTournaments().supported === false`): no Host key, no cards, no quiet line, no board rule; Friends alone.
- **Both missing**: `EmptyState icon="trophy" title="Tournaments are not here yet" body="They arrive with an update on our side. Nothing to do on yours."`, the full list's own words.

### 2.9 Profile's Tournaments line and its ••• row: both go

The tab replaces them.
- `components/profile/ProfileHeader.tsx`: remove the `TournamentsLine` type and the `tournaments` field of `ProfileActions`, the Tournaments Pressable, **the v4.6 margin rule** (it drew only beside two rows, A.3 #7) and its imports (`lineMarks`, `PenMargin`, `PEN`), and the header comment's two paragraphs about them. The `ledger` View may stay as the Dex line's wrapper (it carries `marginTop: space.xs`) or fold back into the line; nothing moves either way. The red figure in "42 entries in your Dex" is unchanged.
- `components/profile/ProfileView.tsx`: drop the `tournaments` prop and its doc; fix the spacing comment ("12 from the last quiet line's 44pt row (Tournaments, or Dex …)" becomes the Dex line).
- `app/(tabs)/profile.tsx`: drop `tournamentsRow`, `tournamentsLine`, `lineDetail`, `invitations`, the `useTournaments` reads and the focus `load()`. The ••• is **Share profile, Settings, About**; the fallback menu is **Settings**. Rewrite the header comment's Tournaments paragraph to say the tab replaced the line and the row (Jan, 23 Oct 2026).
- Profile's detail budget drops to the swash alone (6.3).

---

## 3. Data

### 3.1 What "entries" means here

Each person's Dex lives on their phone; the server cannot see it. What it can see is their **posts**, and a post is one drink (`posts_one_per_drink`, 007): a re-post adds a photo to the same post. So a person's entries on the board are **the number of different catalogue drinks they have posted, each once, ever**: `count(distinct drink_id)` over their posts, catalogue ids only (`drink_id !~ '^u_'`, the tournaments' own rule). It can be lower than Profile's "N posts", which counts custom drinks' posts too; the copy never claims the two match. It is never an amount, never per day, and it never resets, so there is nothing to keep up and no streak. The screen says "entries" (the catalogue's word, as Profile's "42 entries in your Dex" does) and the footnote says what is counted.

### 3.2 `supabase/migrations/025_friends_board.sql` (Package A writes it exactly; Jan applies it by hand)

Style as 020 to 024: a header that says what it adds, its order and dependencies, that it was read and not run, a VERIFY block; section 0 stops the file if a dependency is missing; `security definer`, `set search_path = ''`, `(select auth.uid())`, every name schema-qualified; privileges revoked from public and anon, granted to authenticated; a `comment on function`; the `schema_migrations` insert last. Also add the function to `supabase/schema.sql` (after `my_tournaments`), as 024 did.

```sql
-- ====================================================================
-- Sipply — migration 025: the Friends board
--
-- For specs/v4.7/spec.md §3. supabase/schema.sql holds the same object.
--
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
--
-- READ, NOT RUN. Like 021 to 024, nothing here has been executed: the
-- machine it was written on has no psql, postgres, docker or supabase CLI.
-- It was proven by reading every statement against supabase/schema.sql's
-- real names: profiles (id, username, display_name, accent, avatar_path),
-- follows (follower_id, following_id), posts (id, author_id, drink_id,
-- photo_path, created_at), post_photos (post_id, created_at),
-- private.my_block_set() (011) and schema_migrations (009). The first real
-- run is Jan's: run the VERIFY block right after it.
--
-- WHAT IT ADDS
--
--   public.friends_board(): for the caller and everyone the caller
--   follows, minus anyone blocked either way, one row each: who they are,
--   how many DIFFERENT catalogue drinks they have posted (each once, ever:
--   one post is one drink, 007), their place among the rows, and their
--   latest three posts' drink and photo. Most entries first, then
--   username; at most 200 people, and the caller always.
--
-- WHY A FUNCTION. The board needs a count per person over posts, which a
-- client would have to read row by row. SECURITY DEFINER so the counts
-- are one query; it reads only what posts_read already shows the caller
-- (every post by anyone they are not blocked with), and applies the same
-- block set itself. Nothing is stored and nothing new is exposed.
--
-- WHAT IS COUNTED (App Review 1.4.3). Different drinks, each once, ever:
-- never amounts, never per day, never reset. The app calls them entries.
--
-- ORDER
--
-- After 024 by number. Depends on 009 (schema_migrations), 007
-- (post_photos, posts_one_per_drink) and 011 (my_block_set) only; section
-- 0 stops the file if any is missing. Builds up to 29 never call it.
-- Build 30 (v4.7) calls it on the Tournaments tab and, while it is
-- missing (PGRST202 or 42883), leaves out the Friends half of that tab
-- with no error; the next focus after this file shows it. A PGRST202
-- straight after the run is PostgREST's schema cache: Settings -> API ->
-- Reload schema, or wait a minute.
--
-- VERIFY AFTERWARDS (all read-only, except the rolled-back smoke test)
--
--   -- Expect one row: 025_friends_board.
--   select version from public.schema_migrations where version = '025_friends_board';
--
--   -- Expect one row: friends_board() | true | false | true
--   select p.oid::regprocedure as fn, p.prosecdef,
--          has_function_privilege('anon', p.oid, 'execute')          as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as authenticated
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'friends_board';
--
--   -- Smoke test as a real account, rolled back. Paste your user id.
--   -- Expect your own row (entries = your posts, less any custom drinks),
--   -- then one row per person you follow, most entries first.
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     json_build_object('sub', '<your user id>', 'role', 'authenticated')::text, true);
--   select username, entries, place, jsonb_array_length(latest) from public.friends_board();
--   rollback;
-- ====================================================================


-- --------------------------------------------------------------------
-- 0. Stop here unless 007, 009 and 011 are applied
-- --------------------------------------------------------------------

do $$
begin
  if to_regprocedure('private.my_block_set()') is null
     or to_regclass('public.post_photos') is null
     or to_regclass('public.schema_migrations') is null then
    raise exception '025 needs 007, 009 and 011 applied first';
  end if;
end;
$$;


-- --------------------------------------------------------------------
-- 1. The board
--
-- `place` is a competition rank (1, 2, 3, 3, 5): on this board a tie is
-- only a tie. Null at 0 entries, where a place would be the alphabet's.
-- `latest` is a jsonb array of up to three {drink_id, photo_path},
-- newest first by the post's last photo (a re-post moves a drink up),
-- then by post id, so two posts with the same moment keep one order from
-- call to call and the prints never swap on a refresh. photo_path may be
-- null (a post with no photo), and the app then shows the drink's own
-- picture. Ranked over everyone the caller follows, then cut to 200, so
-- a place is true even past the cut; the caller's row is kept whatever
-- its place.
-- --------------------------------------------------------------------

create or replace function public.friends_board()
returns table (user_id uuid, username text, display_name text, accent text, avatar_path text,
               entries integer, place integer, latest jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as id
  ),
  people as (
    select m.id as person from me m where m.id is not null
    union
    select f.following_id from public.follows f join me m on f.follower_id = m.id
  ),
  shown as (
    select p.person
    from people p
    where not (p.person = any ((select private.my_block_set())::uuid[]))
  ),
  counted as (
    select s.person,
           (select count(distinct po.drink_id)::integer
            from public.posts po
            where po.author_id = s.person and po.drink_id !~ '^u_') as entries
    from shown s
  ),
  ranked as (
    select c.person, c.entries, pr.username, pr.display_name, pr.accent, pr.avatar_path,
           (rank() over (order by c.entries desc))::integer as place,
           row_number() over (order by c.entries desc, pr.username) as nth
    from counted c
    join public.profiles pr on pr.id = c.person
  )
  select r.person, r.username, r.display_name, r.accent, r.avatar_path, r.entries,
         case when r.entries > 0 then r.place end,
         coalesce((
           select jsonb_agg(jsonb_build_object('drink_id', l.drink_id, 'photo_path', l.photo_path)
                            order by l.last_at desc, l.id)
           from (
             select po.id, po.drink_id, po.photo_path,
                    coalesce((select max(ph.created_at) from public.post_photos ph where ph.post_id = po.id),
                             po.created_at) as last_at
             from public.posts po
             where po.author_id = r.person and po.drink_id !~ '^u_'
             order by last_at desc, po.id
             limit 3
           ) l
         ), '[]'::jsonb)
  from ranked r
  where r.nth <= 200 or r.person = (select m.id from me m)
  order by r.entries desc, r.username;
$$;

comment on function public.friends_board() is
  'The Tournaments tab''s Friends board (v4.7): the caller and everyone they follow, minus blocks either way, '
  'with how many different catalogue drinks each has posted (each once, ever; never amounts) and their latest '
  'three posts. Most first, then username; at most 200 plus the caller.';

revoke all on function public.friends_board() from public, anon;
grant execute on function public.friends_board() to authenticated;


-- --------------------------------------------------------------------
-- Record that this migration ran. Last statement in the file on purpose:
-- a run that fails partway must not claim to have succeeded. See 009.
-- --------------------------------------------------------------------
insert into public.schema_migrations (version)
values ('025_friends_board') on conflict (version) do nothing;
```

Notes for the reader of the SQL:
- **Blocks**: `my_block_set()` is both directions (011), the same set `posts_read`, `profiles_read` and `follows_read` use. A follow edge to someone you are blocked with is already dropped by 006's trigger; the filter here is belt and braces.
- **Deleted and hidden**: a deleted post is a deleted row (posts have no soft delete), a deleted account cascades away, and posts have no other hiding (reports hide reels, not posts, 019). So "following the posts read policy" is exactly the block filter.
- **Cost**: `posts_one_per_drink` is a unique index on (author_id, drink_id), which serves both per-author scans; `post_photos_post_idx (post_id, taken_at desc)` and the unique `(post_id, path)` find each post's photos for the max (a post holds a handful). The latest three break a tie on the moment by post id, so prints never swap between calls (DB review). One call per focus.
- `rank` is not used as a column name (`place`), so nothing reads as the window function. The column is called `place` everywhere below.

### 3.3 The client

- `lib/database.types.ts` (hand-typed, as `MyTournamentRow`): `FriendsBoardRow = { user_id: string; username: string; display_name: string; accent: string; avatar_path: string | null; entries: number; place: number | null; latest: unknown }`, and `friends_board: { Args: Record<string, never>; Returns: FriendsBoardRow[] }` in `Functions`.
- `types.ts`: `FriendStanding = { userId; username; displayName; accent; avatarPath: string | null; entries: number; place: number | null; tied: boolean; latest: { drinkId: string; photoPath: string | null }[] }`. `tied` is computed on the client: another row has the same non-null place.
- `lib/friendsBoard.ts`: `fetchFriendsBoard(): Promise<FriendStanding[] | null>`. Null when `isMissingFunction(error)` (025 not applied); throws on any other error; rows **checked, not trusted** (lib/tournaments' `str`/`num` pattern: a row without a user id or username is dropped; `latest` is filtered to objects with a string `drink_id`, at most 3).
- `store/friendsBoard.ts` (zustand, the tournaments store's shape and guards exactly): `supported` (true until the server says the function is missing), `rows`, `loading`, `failed`, `loaded` (has answered once), `gen`, `load()` (numbered loads, only the newest writes; nothing when signed out), `reset()`, and the same `useAuth.subscribe` that resets it when the user id changes. Not persisted.

### 3.4 The cards' top three

No new SQL: `tournament_board(t)` (020) already returns blocked-filtered standings, and the tournaments store already caches each answer in `boards`. The tab calls `loadBoard(id)` for each card it shows (at most 5) on focus and on pull, after `load()`. A tournament page opened from a card then shows its board at once.

---

## 4. Motion on a post (`components/PostCard.tsx`, `mock/` has no frames: the numbers are the spec)

### 4.1 The liked heart is red: accent place 7

A liked heart is the most universal red state there is, and Jan drew it red. It becomes **place 7, the liked heart**: the like key's solid heart and the double-tap heart over the photo, in `colors.accent`. Not a detail mark and not information beyond the like itself (the key's `selected` state says it too). The unliked heart stays the ink outline; the like count, "Liked by…" and every other heart in the app (Home's Activity heart, the likers sheet, EmptyState glyphs, reels while they are off) stay ink.

check-design's names: the token sits only inside `function LikeKey` and `function HeartBurst` in PostCard (`ACCENT_FILES`: `{ why: 'the liked heart (7): the like key and the double-tap heart', within: ['LikeKey', 'HeartBurst'], tokens: ['accent'] }`). `accentPressed` is not used: a pressed glyph key dims to half, as every glyph key does. The header comment "No red anywhere: a liked heart is the solid ink heart." goes.

### 4.2 The like key (`LikeKey`, its own component, 26 glyph in a 44 box)

Driven by `liked` changing (as IconButton is today), never by mount, so a card scrolling back into view never pops.

**Turning on** (a tap, or a double-tap that likes):
| t (ms) | What | Curve |
|---|---|---|
| 0 | The glyph switches from the ink outline to the **solid Campari heart** (a switch, never a colour tween). `haptic.tap()` (in `onLike`, as today). | step |
| 0 to 80 | scale 1 → 0.82 | `Easing.in(Easing.quad)` |
| 80 to 220 | scale 0.82 → 1.18 | `Easing.out(Easing.cubic)` |
| 220 to 380 | scale 1.18 → 1 | `Easing.inOut(Easing.quad)` |
| 80 to 400 | **The ring**: a 26pt circle behind the glyph, a 1.5pt `colors.accent` border and no fill, scale 0.6 → 1.5 and opacity 0.5 → 0 | `Easing.out(Easing.cubic)` |

The ring is always mounted (opacity 0 at rest), `pointerEvents="none"`, hidden from VoiceOver, so a like mounts nothing. It is the only motion graphic in the app that draws outside a glyph, and it is gone by 400 ms.

**Turning off**: the glyph switches to the ink outline at 0; scale 1 → 0.9 (90, `Easing.out(Easing.quad)`) → 1 (140, `Easing.out(Easing.quad)`). No ring. Undoing should not feel as good as doing.

The withSpring pair in today's IconButton (damping 8, a visible bounce) goes; these timings replace it.

### 4.3 Double-tap on the photo (`HeartBurst`)

Instagram's gesture, already built (`onMediaPress`, `DOUBLE_TAP_MS` 260): it **likes once and never unlikes**; a second double-tap replays the heart and changes nothing. What changes is the heart:

- **Drawn**: a **128pt** solid `colors.accent` heart on a solid white heart **4pt** larger each side (was 96 and 3: about 73pt of heart on a 440 photo, 17%, read as a sticker; 128 draws about 97pt, 22%, near Instagram's quarter; visual review) (`onMedia.ring`), centred on the photo. The white keeps it read on a red drink.
- **Timeline** (mounted on the double-tap, unmounted by the existing JS timer at `BURST_MS` = 900, which stays the guarantee):

| t (ms) | What | Curve |
|---|---|---|
| 0 to 180 | scale 0 → 1.15, opacity 0 → 1 over the first 60 | `Easing.out(Easing.cubic)` |
| 180 to 280 | scale 1.15 → 0.95 | `Easing.inOut(Easing.quad)` |
| 280 to 380 | scale 0.95 → 1 | `Easing.out(Easing.quad)` |
| 380 to 620 | hold | |
| 620 to 840 | opacity 1 → 0, scale 1 → 1.1, translateY 0 → −12 (it lifts as it goes) | `Easing.in(Easing.quad)` |

- The like key pops at the same moment, because `liked` changed (4.2). When the post was already liked, the key does nothing and only the burst plays.
- Haptic: `haptic.tap()` only when it likes (inside `onLike`); none on a replay.
- Signed out: nothing (as today).

### 4.4 The share key (the paper dart, `send`)

On press, `Share.share` opens **at once** (the system sheet is never delayed for an animation); the dart flies under the sheet's rise:

| t (ms) | What | Curve |
|---|---|---|
| 0 | `haptic.tap()` | |
| 0 to 160 | translateX 0 → 8, translateY 0 → −3 (along its own heading, up and to the right), scale 1 → 0.9, opacity 1 → 0 | `Easing.in(Easing.cubic)` |
| 160 | jump to translateX −6, translateY 2, scale 1, opacity 0 | step |
| 160 to 360 | back to 0, 0, opacity 1 | `Easing.out(Easing.cubic)` |

Ink throughout. Driven by the press (a `withSequence` on the key's own shared values), so a share from another path never moves it. A second press mid-flight restarts the sequence from its current values.

### 4.5 The save key (the bookmark)

Driven by `saved` changing (after the unsave confirmation, when there is one), never by mount.

**Saving**:
| t (ms) | What | Curve |
|---|---|---|
| 0 | `haptic.select()` (in `onSave`, as today) | |
| 0 to 160 | **The fill pours in from the top**: the solid bookmark sits in a 26pt window with `overflow: 'hidden'`; the window's translateY runs −26 → 0 while the solid glyph inside runs +26 → 0, so the fill appears top-down over the outline (transforms only, PenRule's draw-on trick) | `Easing.out(Easing.cubic)` |
| 160 to 260 | **The drop lands**: the whole glyph translateY 0 → 1.5 | `Easing.in(Easing.quad)` |
| 260 to 380 | translateY 1.5 → 0 | `Easing.out(Easing.quad)` |

**Unsaving**: the solid goes at 0 (the outline shows); the glyph lifts translateY 0 → −1.5 (90, out quad) → 0 (120, out quad).

The long press (Save to collection) saves first if needed, so it plays the same save; the sheet then rises over it. Ink throughout.

### 4.6 Reduce Motion, and the list

- **Reduce Motion**: the like key switches outline ↔ red solid with no scale and no ring; the double-tap shows **no** burst (as today), the key turning red is the answer; the dart does not move; the bookmark switches outline ↔ solid. Haptics stay.
- **Per item, local**: every shared value lives in the key that owns it (`LikeKey`, the share and save `IconButton`s); nothing is lifted to the card or the list, nothing runs on mount, no state is set per frame. The ring and the bookmark's fill window are always mounted and cost one View each per post.
- **Release safety**: no `entering`/`exiting`/`layout`; the burst keeps its JS-timer unmount, so a stalled Reanimated can never leave a heart on a photo.

---

## 5. "Type your drink"

The placeholder **"Name, style or country" becomes "Type your drink"** in both fields:
- `app/log.tsx` (the + window's search): placeholder "Type your drink"; `accessibilityLabel` stays "Search for the drink you had, by name, style or country", which is still what the field searches. Rewrite the comment above it: the placeholder now invites typing; the label says how it searches (name, style, origin), so someone who never heard the drink's name still knows "tiki" or "mexico" works.
- `components/reels/DrinkTagSheet.tsx` (Tag a drink): placeholder "Type your drink"; label "Search the Dex" becomes "Search for a drink to tag, by name, style or country".
- `components/ui.tsx`: SearchField's doc example ("Names what is searched — 'Name, style or country'") becomes "What to type, e.g. 'Type your drink'. Never the only label."

No other field changes (the Dex's own search keeps its words).

---

## 6. More pen (the detail tier, v4.6 A, extended)

Jan: "more detail like the ones you added, but not too much". Three new placements, plus the swash on the new tab root (which ScreenTopBar already draws on every lg title), and one retired with the Profile line. Each obeys v4.6 A.1 (the pen), A.2 (the components) and A.4 (never on photos, keys, chips, fields, rings, the tab bar, body text, errors, destructive actions), and none adds a word, a count or a state.

### 6.1 The placements

| # | Screen | Mark | File (DETAIL_SITES) | Geometry |
|---|---|---|---|---|
| 9 | Tournaments tab | `PenSwash` under "Tournaments" | `components/ScreenTopBar.tsx` (already listed; no change) and `TabPlaceholder.tsx` | v4.6 A.3 #4, unchanged |
| 10 | Tournaments tab | **The board rule**: `PenRule` 392 (342), `PEN_SEED.board` | `components/tournaments/FriendsBoard.tsx` (**new**) | 2.4 |
| 11 | A tournament's page | **The swash under its name**: `PenSwash scale={min(fontScale, 1.3)}` | `app/tournaments/[id].tsx` (**new**) | Wrap the name `Text` in `<View style={{ flex: 1 }}>` (move `flex: 1` from the Text's style to the wrapper; the ••• stays beside it) and add `<PenSwash style={{ position: 'absolute', left: 1, bottom: -7 }} />`, 3 lower than the tab roots' offset, because a typed name has descenders ("Negroni week": at -4 the g's tail met the ink; visual review). `nameRow`'s `marginBottom` goes 4 → 8. It sits under the last line of a wrapped name, at its start. Ink bottom 7 below the line box; the status line's caps start about 16.5 below it (gap 4 + `marginBottom` 8 + the small line's own lead), so 9.5 clear. The name is a page title (Inter 28), the one pushed screen with a title of its own in the body, so it is signed like a tab root's. |
| 12 | Activity | **The closing rule**: `PenRule length={24} seed={PEN_SEED.activityEnd}` at the list's foot | `app/activity.tsx` (**new**) | `ListFooterComponent` when there are rows to show (`visible.length > 0`): a View with `paddingTop: space.lg`, `paddingLeft: layout.gutter`, height `space.lg + PEN.rule.height`, the rule inside it. Ledger's entry rule again: the 30 days end the way a feed post ends. 16 under the last row (26 under its print), never on the empty, error or loading states. |
| retired | Profile (yours) | ~~`PenMargin` beside the ledger rows~~ | ~~`components/profile/ProfileHeader.tsx`~~ | It needed both quiet lines (v4.6 A.3 #7); the Tournaments line is gone (2.9). |

`PEN_SEED` (in `details/penPath.ts`) gains `board: 5` and `activityEnd: 6`, so each reads as its own stroke. No geometry changes; `node scripts/render-details.mjs` may add the two to its sheet but must print the same widths (0.4 to 1.1pt).

### 6.2 Why these, and not the others offered

- **Settings' section heads**: six heads, one beside "Delete account"; a mark near a destructive action is a v4.6 never, and six of the same mark is the "too heavy" Jan warned against.
- **The + window's head**: it has none (the X and the field are its top row), and a mark on or beside a field is a never.
- **A sheet's grabber area**: the grabber is a control you drag; red beside it reads as a state of the sheet.
- **A margin rule beside a tournament's standings**: your row's wash bleeds 8 past the gutter, which would put the rule 3.4pt from a grey edge, reading as a border. The swash on the name signs that page instead.
- **Per-row marks on the Friends board**: a mark per row is a pattern, not a detail. One rule between the halves is enough.

### 6.3 Per-screen budget (v4.6 A.5, updated)

| Screen | Marks | Count |
|---|---|---|
| Home | stories head rule (draws on once) · closing rule per post | 2 |
| Dex | swash · head rule per section | 2 |
| **Tournaments tab** | swash · board rule | **2** |
| Drink page, caught | margin rule · column rule · drip | 3 |
| Drink page, not yet / custom drink | margin rule · column rule | 2 |
| Profile (yours) | swash | **1** (was 2) |
| Saved, My Bar | swash | 1 |
| **A tournament's page** | swash under its name | **1** |
| **Activity** | closing rule at the foot | **1** |
| Someone else's profile, other pushed screens, sheets, windows, onboarding, sign-in | none | 0 |

Still no screen over three, no two marks of a kind side by side without content between them, and the v4.6 never-list holds, amended only by name: a pushed screen may now carry exactly the two marks above (#11, #12).

### 6.4 check-design (rule 17)

`DETAIL_SITES` gains three entries and loses one:

```js
'components/tournaments/FriendsBoard.tsx': { marks: ['PenRule'], why: "the board rule between the Tournaments tab's two halves" },
'app/tournaments/[id].tsx':               { marks: ['PenSwash'], why: "the swash under a tournament's name" },
'app/activity.tsx':                       { marks: ['PenRule'], why: "the closing rule at Activity's foot" },
// removed: 'components/profile/ProfileHeader.tsx' (its margin rule retired with the Tournaments line)
```

`ACCENT_FILES` (1.5 and 4.1): FloatingTabBar's entry renamed and re-pointed, PostCard's added. Prove it as v4.6 A.6 did: plant `PenRule` in `ProfileHeader.tsx`, `PenSwash` in `FriendsBoard.tsx`, `colors.accent` in PostCard's `IconButton`, and `colors.accentPressed` in `LikeKey`; each must fail with its own message; revert; the tree passes.

---

## 7. File ownership

Three packages, run in parallel in the same worktree. **No file is edited by two packages.** None of them commits, pushes, or applies a migration. Each runs the checks in Part 8 on its own files before it reports, and the final full run happens once all three have landed (check-design passes only then: C's rule-17 entries name A's and B's functions).

### Package A: the tab bar, the Tournaments tab, the data, the Profile line, the docs

| File | Change |
|---|---|
| `src/components/FloatingTabBar.tsx` | `TournamentsKey` (1.2), five equal slots, the plain line track, no `router`, header comment rewritten |
| `src/app/(tabs)/_layout.tsx` | the `board` screen (1.3); header comment |
| `src/app/(tabs)/board.tsx` (new) | AuthGate + FriendsBoard (2.1) |
| `src/components/tournaments/FriendsBoard.tsx` (new) | the screen (2.2 to 2.8), **including the board rule** (2.4), imported by name: `import { PenRule } from '@/components/details/PenMarks'` and `PEN`, `PEN_SEED` from `penPath` |
| `src/components/tournaments/TournamentCard.tsx` (new) | 2.3 |
| `src/lib/friendsBoard.ts`, `src/store/friendsBoard.ts` (new) | 3.3 |
| `src/lib/database.types.ts`, `src/types.ts` | 3.3 |
| `src/lib/tournaments.ts` | `boardHref` |
| `src/components/icons.tsx` | the solid trophy's handles (1.2); the `create` comment (1.4) |
| `src/components/home/HomeChrome.tsx` | the `onPost` doc comment only (1.4) |
| `src/components/profile/ProfileHeader.tsx`, `ProfileView.tsx`, `src/app/(tabs)/profile.tsx` | 2.9 |
| `src/app/tournaments/index.tsx` | header comment only ("Opened from Profile's Tournaments line and its •••" becomes "from the Tournaments tab's All tournaments line and Activity's invitations row") |
| `src/app/_layout.tsx` | the comment at 186 only (1.4) |
| `supabase/migrations/025_friends_board.sql` (new), `supabase/schema.sql` | 3.2. **Write the file; never run it.** |
| `docs/appstore.md` | The Tournaments review-notes paragraph: "To find it, follow anyone, then tap the red trophy key in the middle of the tab bar → Host a tournament." and one sentence on the board: "The same tab lists you and the people you follow by how many different Dex entries each has posted (each drink once, ever): no amounts, no per-day counts, no notifications." Recount it and every total that includes it (the "[644]" and the paragraphs on the 4,000 limit), and say that it now needs migration 025 for the Friends half. |
| `docs/testflight.md` | Lines 35 and 77 to 78: tournaments are found from the red trophy key; add the Friends board to the tournaments test item. |
| `docs/support.md` | "How do tournaments work?": "Tap the red trophy key in the middle of the tab bar, then **Host a tournament** …"; drop the Profile and "..." directions. A new short answer, **"What is Friends on the Tournaments tab?"**: you and the people you follow, by how many different drinks each has posted, each counted once, custom drinks not counted; amounts are never counted; it shows nobody you have blocked or who blocked you. |

### Package B: post motion and the placeholder

| File | Change |
|---|---|
| `src/components/PostCard.tsx` | `LikeKey` (4.2), the share and save motion on `IconButton` (4.4, 4.5: a `motion?: 'share' \| 'save'` prop, or two small components; B's choice), `HeartBurst` in Campari with the new timeline (4.3), the header comment's "No red anywhere" sentence. **The accent token appears only inside `LikeKey` and `HeartBurst`.** `closingRule` and the v4.6 `PenRule` stay as they are. |
| `src/app/log.tsx` | placeholder and its comment (5); the header comment at 63 (1.4) |
| `src/components/reels/DrinkTagSheet.tsx` | placeholder and label (5) |
| `src/components/ui.tsx` | SearchField's doc comment only (5) |
| `src/data/dailyIdeas.ts` | the `first-10` idea's words (1.4); run `node scripts/check-ideas.mjs` |

### Package C: the new pen placements, check-design, the accent lists

| File | Change |
|---|---|
| `src/components/details/penPath.ts` | `PEN_SEED.board = 5`, `PEN_SEED.activityEnd = 6` (6.1) |
| `src/app/tournaments/[id].tsx` | the swash under the name (6.1 #11) |
| `src/app/activity.tsx` | the closing rule (6.1 #12); the header comment's "(as Profile's ••• does)" becomes "(as the Tournaments tab's All tournaments line does)" |
| `scripts/check-design.mjs` | `DETAIL_SITES` (6.4), `ACCENT_FILES` (1.5, 4.1), rule 17's header comment ("six places" → seven, the place list) |
| `src/constants/theme.ts` | the accent comment: place 1 renamed and re-reasoned, place 7 added, "EXACTLY six" → seven, the detail tier's list (board rule, a tournament's swash, Activity's closing rule; Profile's margin rule retired), the `accent` doc line |
| `specs/v4-mockups/white/spec.md` | §1.3: the same, and "Profile's Tournaments state" in the rules list goes |
| `specs/v4.6-details/spec.md` | one line at the top of A.3 and A.5: "Extended by specs/v4.7/spec.md §6 (23 Oct 2026): #7 retired, #9 to #12 added." |
| `scripts/check-contrast.mjs` | the label at 297 (+ the liked heart; no new pair: accent on page is 5.54, and the burst's red sits on its own white heart) |
| `scripts/check-intro-dock.mjs`, `src/lib/introDockPlan.ts`, `src/components/VideoIntro.tsx` | "+ key" wording only (1.4) |
| `scripts/render-details.mjs` | optional: the two new seeds on the sheet |

### What each needs from the other (no shared file)

- **A → C: the board rule.** A writes it in FriendsBoard.tsx to 2.4 using `PEN_SEED.board`. Until C's `penPath.ts` lands, `PEN_SEED.board` does not type-check; A may land first only if C's one-line seed edit lands in the same round (it does: both run now). C lists the file in DETAIL_SITES.
- **A → C: the Profile margin rule.** A deletes the import and the mark from ProfileHeader; C deletes its DETAIL_SITES entry. Either alone still passes (an entry with no import is allowed; an import with no entry fails, and A removes the import).
- **A → C: the key's names.** A uses exactly `TournamentsKey`, `styles.trophyKey`, `styles.trophyKeyPressed`; C writes them into `ACCENT_FILES`.
- **B → C: the heart's names.** B puts the accent only in `LikeKey` and `HeartBurst`; C writes `ACCENT_FILES['components/PostCard.tsx']`. PostCard's existing DETAIL_SITES entry (`PenRule`) is untouched by both.
- **A ↔ B: posting.** A removes the bar's call to `/log`; B owns `log.tsx` and changes nothing about how it opens. HomeChrome's create key (A's comment edit only) stays the way in.
- **A ↔ C: Activity.** Activity's invitations row keeps opening `tournamentsHref()` (A does not touch activity.tsx); C adds the closing rule and the comment.
- **The tournament page.** A does not touch `[id].tsx` (Back still falls back to the full list); C adds the swash.

---

## 8. Checks before any package is done

- `npx tsc --noEmit -p .`, `node scripts/check-design.mjs`, `node scripts/check-contrast.mjs` all clean once all three have landed; each package runs them on its own result first and reports anything that waits on another.
- B: `node scripts/check-ideas.mjs`.
- C: the planted-violation proof (6.4), then reverted.
- A: read 025 against `supabase/schema.sql` once more (names, `place` everywhere, the grant); do not run it.
- No FlatList cell does per-item work: Friends rows are memoised and static; PostCard's keys animate only on their own value or press.
- Reduce Motion on: no pop, no ring, no burst, no flight, no pour; every state still changes.
- VoiceOver: the bar reads Home, Dex, Tournaments, Saved, Profile with `selected`; a card and a row are each one button with the labels in 2.3 and 2.5; the marks and prints are silent.
