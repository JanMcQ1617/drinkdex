# 03 · Home and Profile

Status: build-ready. Owner tags follow `01-design-v2.md` §2. This spec is **HOME** plus **PROFILE**, and its implementer owns `(tabs)/index.tsx`, `PostCard.tsx`, `(tabs)/profile.tsx` and `PeerProfile.tsx`, together with the new files listed in §2.
Native modules added: **none**. Supabase changes: **one migration** (§4.1). The change is JS plus SQL, so it can ship by EAS Update if the rest of the release needs no new binary.

**Start from DS Phase 1** (`01-design-v2.md` §2). This spec builds only on the primitives and tokens that spec defines: `ScreenTopBar`, `TopBarButton` (with `badge`), `useScrolledPast`, `TabStrip`, `Hold`, `Button` (tonal, sm, text), `EmptyState` (v2), `Notice`, `SectionHeader`, `ListGroup`, `radius.*`, `colors.line*`, `stroke.*`, `layout.*` and `textRole.*`. It defines **no** competing primitive and makes **no** edits to `theme.ts` or `ui.tsx`. Read the Expo SDK 57 docs before writing code (AGENTS.md). React Compiler is on, so derive state instead of setting it synchronously inside effects, and reuse the keyed-state pattern that `usePostsByAuthor` already uses.

Home follows the **structure** of reference 2 and Profile follows the structure of reference 3. Proportions and the order of parts carry over; their identity does not. That means no Instagram wordmark, no gradient story ring, no paper-plane glyph, no Threads button, no account-switch chevron and none of their copy.

### 0.1 Cross-check reconciliation (30 Sep 2026). Binding: it overrides the text below wherever they differ

**Packages (`00-build-plan.md`).** **C3 · Home** owns `(tabs)/index.tsx`, `PostCard.tsx`, `home/TodaysPours.tsx`, `home/groupPours.ts`, `app/pours/[authorId].tsx`, `app/activity.tsx`, `app/post/[id].tsx`, `store/seen.ts`. **C4 · Profile** owns `(tabs)/profile.tsx`, `PeerProfile.tsx`, `PeopleList.tsx`, `app/find-friends.tsx`, every `components/profile/*` file, `app/connections/[id].tsx`, `app/saved.tsx`, `lib/profileLink.ts`. The data layer in §4 (migration, `schema.sql`, `database.types.ts`, `types.ts`, `lib/social.ts`, `store/social.ts`) is built **from this spec, verbatim, by A2 in stage 1**; C3 and C4 only consume it. The `_layout.tsx` line is C1's, the Settings group is C7's, the glyphs are A1's, `docs/privacy.md` is C8's. C3 and C4 also do 01 §14.3's three columns for the files they own (e.g. PeopleList's FollowButton restyle).

**Names.** This spec was drafted against an earlier 01 draft. Build with 01's final names:

| This spec says | Build with (01) |
|---|---|
| `TopBar variant="root"` / `titleAlign="center"` | `ScreenTopBar` (the title is always centred) |
| `TopBar variant="push" title={t} onBack` | `ScreenTopBar size="md" title={t} left={<TopBarButton icon="chevronLeft" label="Back" onPress={onBack} />}`; on profiles `size="lg"` |
| `leading={{ kind: 'icon', icon, label, onPress }}` | `left={<TopBarButton icon={…} label={…} onPress={…} />}` |
| `trailing={[{ kind: 'icon', …, badge }]}` | `right={<TopBarButton … badge={unread} />}` (one control per side) |
| `divider={scrolled}` | `showRule={scrolled}`; `useScrolledPast` is exported from `ScreenTopBar.tsx` |
| own profile `titleNode` in `textRole.rootTitle` | `size="lg" title={username}` (barTitleLg, 20/26); no titleNode |
| `radius.tag` | `radius.badge` |
| `mediaBg`, `surfaceDark` | `reelGround` |
| `textOnEspresso` (on a dark ground) | `reelInk` |
| `textOnDarkMuted` | `reelInkMuted` |
| `lineOnDark` | `reelTrack` |
| a marker's `scrim` fill + 1pt `lineOnMedia` + `textOnWine` | fill `reelScrim`, no edge, glyph/text `reelInk` (01 §4) |
| `EmptyState tone="media"` | `tone="dark"` (its secondary action is `onDarkText`) |
| `src/lib/flags.ts` | `src/lib/reels.ts` (B1 lands it in stage 1). There is no `flags.ts`. |
| the "Videos" profile tab and its copy | **"Clips"**: label `COPY.label`, copy from `COPY` in `@/lib/reels` (05 D1: one file names the feature) |
| first-load `ActivityIndicator` | `Hold fill={false}` (01 §5.17) with "Still loading your feed." / "…this profile." / "…activity." etc. (06 rule 3) |
| `useSignedPhoto` imported from `PostCard` | `@/lib/useSignedPhoto` (A2 moved it there with 05's `bucket` argument; PostCard re-exports it) |
| `isRenderablePost` exported by `PostCard` | `@/lib/social` (A2); PostCard imports it |

**Rules added by the cross-check.**
- Every list of posts filters with `isRenderablePost` (06 rule 4): the Home feed (`visibleFeed`, §6.1), the profile Posts grid, and Saved. The Dex tab already drops unknown drinks.
- The double-tap heart burst is **unmounted by a JS `setTimeout(…, 900)`**, not by its fade finishing: 06 found Reanimated can stall after a cold start while JS timers keep running, and a stalled fade would leave a heart on the photo. Its resting state is "not mounted".
- Gated pushed routes (`/activity`, `/saved`, `/post/[id]`, `/connections/[id]`, `/pours/[authorId]`) render `<AuthGate onClose={() => (router.canGoBack() ? router.back() : router.replace('/dex'))}>` (02 reconciliation 9).
- `post/[id]` checks its param with its own UUID regex; it does not import `ACCOUNT_ID` from `PeerProfile` (that file is C4's, and C3 must not depend on it in the same stage).
- Migration number: **017** (`017_home_and_profile.sql`).

---

## 0. Decisions

| Question | Decision | Why (one line) |
|---|---|---|
| Comment button in the feed | **Not built.** No glyph is drawn. | There is no comments table, and a glyph that leads nowhere is the "control that only looks like one" PostCard's own notes removed. Comments are the open question in §15. |
| Save button in the feed | **Built for real:** a `saves` table and a Saved screen. | A bookmark that forgets itself would confirm something that never happened. |
| Heart on Home | **Built:** `/activity` shows likes on your pours and new followers. It needs no new table. | Without a destination the heart is decoration. `likes` and `follows` already hold the data. |
| "Stories" row | **Today's pours.** Each tile is a 72×90 rectangle showing a person's newest pour from the last 24 h. A 2pt wine frame means unseen and a 1pt `line` frame means seen. Your tile comes first and carries a + badge. | The pour is the content, so the tile shows the drink, not the face. A rectangle thumbnail is v2's shape (DS §4 "thumbnail 49–96pt") and is not Instagram's ring. |
| Pours viewer | A modal sheet you tap through. It never auto-advances, and "seen" is stored on the device only. | A pour is a photo to look at, not a five-second clip. No view receipts means nothing can leak and no table is needed. |
| Dex count in the profile header | **No.** Every profile shows Posts / Followers / Following. | A peer's collection never leaves their phone (PeerProfile's own note), so a Dex figure would be a dash on every profile but yours. |
| Third profile tab | **Dex**, not Tagged. It shows the drinks this person shared, in Dex order, as Dex cards with a rarity summary. | Nothing is tagged in Sipply. Places belong to the long-term location spec. The binder view is what makes the profile Sipply's. |
| What your own profile shows | **What other people see.** Your private collection is one link, "142 in your Dex". | That is how reference 3 behaves, and the Dex tab already holds the full collection. |
| Profile list engine | One `FlatList` with `numColumns={1}`, fed **pre-chunked rows**: 3 posts, 3 videos or 2 Dex cards per row. | `numColumns` cannot change on a mounted list, and Dex cards must be 2-up (the Dex tab's own note says why 3-up fails). |
| Grid tile tap | Opens a new `/post/[id]` screen with one PostCard. | One route serves the grid, Saved and Activity. Scrolling that author's feed from there can come later. |
| Followers and following lists | Built (`/connections/[id]`) and visible to any signed-in user. | Follows are already readable under RLS (for counts), so the lists expose nothing new. The privacy policy line is updated (§4.6). |
| Feed photo | Full bleed, radius `none`, **3:4**. | 3:4 is the iPhone camera's native ratio, so pours are not cropped. The old 1:1.3 was within 3% of it. |
| Profile grid | Full bleed, **square** tiles, `layout.gridGap`. | Matches the brief, reference 3 and DS §4. |
| Double-tap to like | Yes, on the photo. It likes only and never unlikes, and is detected by tap timing on a `Pressable`. | RNGH would need a root `GestureHandlerRootView`, which is not this spec's file. Timing is enough. |
| Home + and Profile + | Both go **straight to `/log`**, with no sheet. | Logging is the most frequent action. Recording a clip starts from the Clips header's camera button (REELS) and from your empty Clips tab. |
| Profile "menu" | The **Settings gear** (DS §7 table). Settings gains a **Your activity** group (Saved, Activity). | A ≡ that opens only Settings is Instagram's glyph doing our gear's job. Keeping the gear also keeps every "(the gear, top right)" line in `docs/` true. |
| Profile title | The bare `username`, centred, with no lock and no chevron. | There is no account switcher, so a chevron would promise one. A bare handle matches the feed's author line. |
| Unfollow from a profile | Confirmed with an action sheet. List rows still toggle without asking. | An accidental unfollow on the main screen is silent and costly. Lists are bulk tools. |
| Loading | `Hold` (DS §5.17, §11). **No skeletons.** | DS rule 4: nothing performs; 06 rule 3: a hold says what it waits for. |
| New native modules | **None.** | |

---

## 1. Scope and seams

**In scope:**

- Home: the top bar, Today's pours and the feed.
- The PostCard v2 anatomy.
- The pours viewer.
- Activity.
- Profile, both your own and a peer's.
- The followers and following lists.
- The single-post screen.
- Saved.
- One migration.
- Privacy-policy lines.

**Seams:**

| Other spec | What this spec relies on, and what it leaves alone |
|---|---|
| **DS** (`01-design-v2.md`) | Relies on everything A1 lands in stage 1. It also needs `TAB_BAR_CLEARANCE` (still 84) and, for the Clips tab on profiles, `REELS_ENABLED` from `src/lib/reels.ts` (B1, stage 1). Do not create `src/lib/flags.ts`. Do not edit `theme.ts`, `ui.tsx`, `FloatingTabBar.tsx` or `(tabs)/_layout.tsx`. DS's Phase 1 bubble-badge edit in `index.tsx` becomes moot, because `FriendsRow` is deleted here. |
| **REELS** | Profiles reach clips only through the adapter `src/components/profile/videosSource.ts` (§8.7), wired to `@/lib/reels` from the start. The tab label is `COPY.label` ("Clips"). 05 creates no profile tile of its own. |
| **LOGIN** (`02-auth-login.md`) | `AuthGate` keeps rendering sign-in inside Home, Profile and `/user/[id]`. Keep the `<AuthGate>` wrappers in `index.tsx` and `profile.tsx` exactly as they are. New pushed screens gate the way `user/[id]` does: `if (!myId) return <AuthGate>{null}</AuthGate>`. |
| **TABS-BUG** | Untouched. Every screen here paints `colors.bg` (or `reelGround`) on its own root `View`, so no frame can show the scene background alone. |
| **INTRO**, **CUSTOM-DRINKS** | Untouched, apart from one `Stack.Screen` line in `_layout.tsx` (§2). |
| **Location** (long term) | The fourth profile tab slot stays free for Places. |

---

## 2. Files

### Create (owner: this spec)

| File | What |
|---|---|
| `supabase/migrations/017_home_and_profile.sql` (A2 writes it) | The `saves` table, the `recent_pours()` RPC and an index (§4.1). Number fixed by the cross-check (016 sign-in lookup, 017 this, 018 drink submissions, 019 reels). |
| `src/components/home/TodaysPours.tsx` | The row of pour tiles (§6.3). |
| `src/components/home/groupPours.ts` | A pure function that groups pours by author, unseen first. Used by both the row and the viewer. |
| `src/app/pours/[authorId].tsx` | The Today's pours viewer (§7). |
| `src/app/activity.tsx` | Activity (§9). |
| `src/app/saved.tsx` | Saved (§10.3). |
| `src/app/post/[id].tsx` | A single post (§10.2). |
| `src/app/connections/[id].tsx` | Followers and Following (§10.1). |
| `src/components/profile/ProfileView.tsx` | The profile body, shared by your own profile and a peer's (§8). |
| `src/components/profile/ProfileHeader.tsx` | Avatar, name, counts, bio and the actions slot, plus the private `TonalIconButton` (§8.2, §8.3). |
| `src/components/profile/PostGrid.tsx` | `PostGridRow`, `PostGridTile`, `chunk()` (§8.5). |
| `src/components/profile/DexShelf.tsx` | `DexSummary`, `DexShelfRow`, and `derivePostStats` (moved here) (§8.6). |
| `src/components/profile/VideoGrid.tsx` | `VideoGridRow` and its tile (§8.7). |
| `src/components/profile/videosSource.ts` | The seam to REELS (§8.7). |
| `src/components/profile/usePostsByAuthor.ts` | **Moved** unchanged out of `PeerProfile.tsx`, together with `POSTS_PAGE`. |
| `src/components/profile/useProfileCounts.ts` | Follower and following counts (§4.4). |
| `src/store/seen.ts` | A persisted, on-device record of seen pours and seen activity (§4.5). |
| `src/lib/profileLink.ts` | The share-profile link and message (§8.3). |

### Change

| File | Owner | Change |
|---|---|---|
| `src/app/(tabs)/index.tsx` | HOME | Rebuilt as §6. `FriendsRow`, `PersonBubble`, the subtitle and the `FadeInDown` stagger are deleted. The `<AuthGate>` wrapper stays as it is. |
| `src/components/PostCard.tsx` | HOME | The v2 anatomy (§6.4). |
| `src/app/(tabs)/profile.tsx` | PROFILE | Becomes a thin wrapper around `<ProfileView isOwn/>`. `Stat`, `PostTile`, `FollowRow`, `OWN_SEGMENTS` and the Accounts list are deleted. The `<AuthGate>` wrapper stays. |
| `src/components/PeerProfile.tsx` | PROFILE | Keeps the lookup, report and block logic verbatim, and exports `ACCOUNT_ID`. The body becomes `<ProfileView isOwn={false}/>`. `ProfileIdentity`, `PEER_SEGMENTS`, the Stats segment and the full-card list are deleted. |
| `src/components/PeopleList.tsx` | C4 (00) | Also 01 §14.3's FollowButton/PersonRow restyle. **Add** `hideFollow?: boolean` to `PersonRow`. When set, it renders no `FollowButton`, for your own row in a list. |
| `src/app/find-friends.tsx` | C4 (00) | Also 01 §7's ScreenTopBar and gutter. **Append** the "Everyone on Sipply" section (§10.4). This is where the profile's Accounts list goes. |
| `src/app/settings.tsx` | C7 (00), from this text | **Add only** the "Your activity" group (§10.5). |
| `src/lib/social.ts` | A2 (00), stage 1, from this text | The new queries in §4.3. `toPost` and `toPosts` gain `savedByMe`. Nothing existing is renamed. |
| `src/store/social.ts` | A2 (00), stage 1, from this text | Adds `pours`, `poursStatus`, `activityLatestAt`, `savesVersion` and `toggleSave`. Extends `load`, `refreshFeed` and `dropAuthor` (§4.4). |
| `src/types.ts` | A2 (00) | Adds `Post.savedByMe`, `Pour` and `ActivityItem` (§4.2). |
| `src/lib/database.types.ts`, `supabase/schema.sql` | A2 (00) | Mirror the migration in the same commit (repo rule, §4.1). |
| `src/components/icons.tsx` | A1 (00), stage 1 | The glyphs `addPerson` and `stack` (§3), with `reels`, `alert` and 05's `play`. |
| `src/app/_layout.tsx` | C1 (00) | One line after the `log` entry: `<Stack.Screen name="pours/[authorId]" options={{ presentation: 'modal', gestureDirection: 'vertical' }} />`. The other new routes are plain pushes and need no entry, the same as `user/[id]`. |
| `docs/privacy.md` | C8 (00) | Adds the lines in §4.6. |

---

## 3. Tokens and glyphs

**Tokens:** use DS §3 as written. This spec adds none. These are the ones it uses:

- **Radius:** `radius.none` for media and grid tiles, `radius.badge` for markers on media and for thumbnails 48pt and under, `radius.control` for pour tiles and buttons, `radius.card` for the rarity strip, and `radius.round` only through `Avatar`.
- **Edges:** `colors.line` with `stroke.edge` or `stroke.hair`; markers over photos have no edge; `colors.reelTrack` for the viewer's progress bars.
- **Media:** `colors.reelGround`, `colors.reelInk`, `colors.reelInkMuted`, `colors.reelScrim` (05's clip tokens, merged by 01 §3.2).
- **Layout:** `layout.gutter` (16), `layout.gridGap` (2), `layout.controlSm` (36), `layout.hit` (44).
- **Type:** `textRole.wordmark`, `barTitleLg`, `barTitle`, `sectionTitle`, `groupTitle`, `helper`. Every other size used here is already on `type`: 11, 12, 13, 14, 16, 22.

**Glyphs**, appended to `icons.tsx` on the 24 grid with `STROKE` 1.75 and outline only:

```tsx
addPerson: (<><Circle cx={9.6} cy={8.2} r={3.6} /><Path d="M3.2 20.2a6.4 6.4 0 0 1 12.8 0" /><Path d="M18.6 8.4v6" /><Path d="M15.6 11.4h6" /></>),
stack:     (<><Path d="M8.4 8.4h11.2v11.2H8.4z" /><Path d="M4.4 15.6V4.4h11.2" /></>),
```

Add both names to `IconName`. The existing glyphs used here are `plus`, `heart` (solid), `share`, `bookmark` (solid), `more`, `grid` (solid), `dex` (solid), `settings`, `chevronLeft`, `close`, `camera`, `users`, and DS's `reels` and `alert`.

---

## 4. Data

### 4.1 Migration `017_home_and_profile.sql`

Use the house header (WHAT, WHY, ORDER, ALSO BY HAND, VERIFY). It is safe to re-run and independent of every other migration in this batch. Installed builds notice nothing, because the app treats a missing table or function as "feature off" (§4.3).

```sql
-- 1. Saves: a private bookmark of a post. Readable by its owner only.
create table if not exists public.saves (
  user_id    uuid not null references public.profiles on delete cascade,
  post_id    uuid not null references public.posts    on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists saves_user_created_idx on public.saves (user_id, created_at desc);
-- Serves the cascade when a post is deleted.
create index if not exists saves_post_idx         on public.saves (post_id);

alter table public.saves enable row level security;

-- Insert may name only the two ids; created_at stays the server's.
revoke all on public.saves from anon, authenticated;
grant select, delete on public.saves to authenticated;
grant insert (user_id, post_id) on public.saves to authenticated;

drop policy if exists saves_read_own   on public.saves;
drop policy if exists saves_insert_own on public.saves;
drop policy if exists saves_delete_own on public.saves;

create policy saves_read_own on public.saves
  for select to authenticated using (auth.uid() = user_id);

-- Only a post you can see: posts_read already hides anyone you are
-- blocked with, either way.
create policy saves_insert_own on public.saves
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.posts p where p.id = post_id)
  );

create policy saves_delete_own on public.saves
  for delete to authenticated using (auth.uid() = user_id);

-- 2. Today's pours: every photo shared in the last 24 hours by the caller
-- or anyone the caller follows. SECURITY INVOKER on purpose: posts_read,
-- post_photos_read and follows_read all apply, so blocks are honoured
-- with nothing extra here.
create or replace function public.recent_pours()
returns table (post_id uuid, author_id uuid, drink_id text, path text, poured_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.author_id, p.drink_id, ph.path, ph.created_at
  from public.post_photos ph
  join public.posts p on p.id = ph.post_id
  where ph.created_at >= now() - interval '24 hours'
    and (
      p.author_id = (select auth.uid())
      or p.author_id in (
        select f.following_id from public.follows f
        where f.follower_id = (select auth.uid())
      )
    )
  order by ph.created_at desc
  limit 300;
$$;

revoke all on function public.recent_pours() from public, anon;
grant execute on function public.recent_pours() to authenticated;

create index if not exists post_photos_created_idx on public.post_photos (created_at desc);

-- Last statement on purpose (see 009).
insert into public.schema_migrations (version)
values ('017_home_and_profile') on conflict (version) do nothing;
```

The query uses `post_photos.created_at` rather than `posts.created_at` because logging a drink again adds a photo to an **old** post (one post per drink, migration 007), and that photo is still today's pour.

**VERIFY block** (put this in the header too):

```sql
select version from public.schema_migrations where version = '017_home_and_profile';
select to_regclass('public.saves') as saves_table,
       to_regprocedure('public.recent_pours()') as recent_pours_fn;   -- both non-null
```

**`schema.sql`:** put each piece of the migration in its matching section (Tables, Indexes, Functions, Table privileges, Row Level Security). Add the `('017_home_and_profile', 'contained in schema.sql')` row, and change the header to "as of migration 017".

**`database.types.ts`:**

```ts
export type SaveRow = { user_id: string; post_id: string; created_at: string };
// Tables:
saves: { Row: SaveRow; Insert: { user_id: string; post_id: string }; Update: never; Relationships: [] };
// Functions (doc comment: "Photos shared in the last 24 h by you and the people you follow."):
recent_pours: {
  Args: Record<never, never>;
  Returns: { post_id: string; author_id: string; drink_id: string; path: string; poured_at: string }[];
};
```

### 4.2 Types (`src/types.ts`)

```ts
export interface Post {
  // …existing…
  /** The signed-in user saved this post (saves table). */
  savedByMe?: boolean;
}

/** One photo shared to a post in the last 24 hours (recent_pours). */
export interface Pour { postId: string; authorId: string; drinkId: string; path: string; /** ISO */ at: string }

export type ActivityItem =
  | { kind: 'like'; key: string; actorId: string; postId: string; drinkId: string; photoPath: string | null; at: string }
  | { kind: 'follow'; key: string; actorId: string; at: string };
```

### 4.3 Queries (`src/lib/social.ts`, additions only)

Embedded selects are cast through `unknown`, as the file already does, because `database.types.ts` declares no relationships.

```ts
/* Feature presence: a build can reach a phone before Jan runs the migration. */
let savesTablePresent = true;
export const savesSupported = () => savesTablePresent;

function isMissingRelation(e: { code?: string; message?: string } | null) {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table/i.test(e.message ?? ''));
}
function isMissingFunction(e: { code?: string } | null) {
  return !!e && (e.code === 'PGRST202' || e.code === '42883');
}

/** Which of THESE posts you saved. Never throws: any failure reads as "none saved". */
async function fetchMySaves(myId: string, postIds: string[]): Promise<Set<string>>;
// .from('saves').select('post_id').eq('user_id', myId).in('post_id', postIds)
// isMissingRelation(error) → savesTablePresent = false.
```

`toPosts` runs `fetchMyLikes` and `fetchMySaves` together in a `Promise.all`, and `toPost(row, myId, myLikes, mySaves)` sets `savedByMe`.

| Function | Query sketch | Notes |
|---|---|---|
| `savePost(myId, postId)` | `.from('saves').insert({ user_id: myId, post_id: postId })` | A duplicate counts as success, as `likePost` does. |
| `unsavePost(myId, postId)` | `.delete().eq('user_id', myId).eq('post_id', postId)` | |
| `fetchSavedPosts(myId)` | ``.from('saves').select(`created_at, post:posts(${POST_SELECT})`).eq('user_id', myId).order('created_at', { ascending: false }).limit(FEED_SIZE)`` | Drops a null `post`, which is what RLS returns for a blocked author. Then calls `toPosts`, keeping the saved order. |
| `fetchPost(postId, myId)` → `Post \| null` | `.from('posts').select(POST_SELECT).eq('id', postId).maybeSingle()` | Returns null when the post is gone, blocked, or its drink has left the Dex. |
| `fetchFollowingCount(userId)` | `.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId)` | The pair to the existing, currently unused `fetchFollowerCount`. |
| `fetchFollowsMe(theirId, myId)` → `boolean` | The same head request with `.eq('follower_id', theirId).eq('following_id', myId)` | Drives the "Follow back" label. |
| `fetchConnections(userId, list)` | followers: ``.from('follows').select(`created_at, person:profiles!follows_follower_id_fkey(${profileCols()})`).eq('following_id', userId)``; following: the same with `follows_following_id_fkey` and `.eq('follower_id', userId)`. Both use `.order('created_at', { ascending: false }).limit(CONNECTIONS_PAGE)`. | Export `CONNECTIONS_PAGE = 200`. Drop a null `person`. A PGRST201 error (ambiguous embed) means the FK names are wrong: check them with `select conname from pg_constraint where conrelid = 'public.follows'::regclass;`. |
| `fetchRecentPours()` → `Pour[]` | `supabase.rpc('recent_pours')` | `isMissingFunction` returns `[]`. Any other error throws. Drop rows where `!getDrink(drink_id)`. |
| `fetchActivity(myId)` → `ActivityItem[]` | Two queries in `Promise.all`, each with `.gte('created_at', <30 days ago>).order('created_at', { ascending: false }).limit(ACTIVITY_LIMIT /* 60 */)`. Likes: `.from('likes').select('post_id, user_id, created_at, posts!inner(id, author_id, drink_id, photo_path)').eq('posts.author_id', myId).neq('user_id', myId)`. Follows: `.from('follows').select('follower_id, created_at').eq('following_id', myId)`. | Merge, sort newest first and cut to 60. Drop likes whose drink has left the Dex. Keys are `like:${post_id}:${user_id}` and `follow:${follower_id}`. |
| `fetchLatestActivityAt(myId)` → `string \| null` | The same two queries, selecting only `created_at` (plus the `posts!inner(author_id)` filter for likes), `.limit(1)`, with no time floor. | Returns the later of the two. Feeds the Home heart's badge. |

### 4.4 Stores

**`src/store/social.ts` additions:**

```ts
pours: Pour[];
/** 'idle' before the first answer; 'error' when the last fetch failed (the row then shows your tile only). */
poursStatus: 'idle' | 'ready' | 'error';
/** Newest like-on-your-post or new follower, for the Home heart badge. */
activityLatestAt: string | null;
/** Bumped on every successful save/unsave, so Saved refetches on focus. */
savesVersion: number;
/** Optimistic, shaped like toggleLike: patches feed[].savedByMe, rolls back on failure. */
toggleSave: (myId: string, postId: string, wasSaved: boolean) => Promise<boolean>;
```

- **`EMPTY`** gains `pours: []`, `poursStatus: 'idle'`, `activityLatestAt: null` and `savesVersion: 0`.
- **`load`:**
  - After `fetchFollowing`, run `Promise.all([api.fetchFeed(myId, following), api.fetchRecentPours().catch(() => null)])`, with the existing `gen` checks.
  - Then `set({ …, pours: pours ?? get().pours, poursStatus: pours ? 'ready' : 'error' })`.
  - Pour authors are always within `following` plus yourself, so `profileIdsFor` already covers their profiles.
- **Activity badge (both `load` and `refreshFeed`):** without awaiting, call `api.fetchLatestActivityAt(myId).then(at => { if (get().gen === gen) set({ activityLatestAt: at }); }).catch(() => {})`.
- **`refreshFeed`:** gets the same pours change as `load`.
- **`toggleSave`:** returns `false` immediately when `!api.savesSupported()`. On success it runs `set({ savesVersion: get().savesVersion + 1 })`.
- **`dropAuthor`:** also filters `pours` by `authorId`.

**`useProfileCounts`** (`src/components/profile/useProfileCounts.ts`):

```ts
export function useProfileCounts(userId: string | undefined): { followers: number | null; following: number | null; reload: () => void };
```

- Fetches `Promise.all([fetchFollowerCount(userId), fetchFollowingCount(userId)])`.
- State is keyed by user and request, like `usePostsByAuthor`.
- A failed fetch keeps the last numbers for the same user, or `null` if there are none.

### 4.5 `src/store/seen.ts` (new, persisted)

```ts
interface SeenState {
  hydrated: boolean;
  /** myId → authorId → ISO of the newest pour viewed. */
  pours: Record<string, Record<string, string>>;
  /** myId → ISO of the newest activity opened. */
  activity: Record<string, string>;
  markPourSeen: (myId: string, authorId: string, at: string) => void;   // keeps the max
  markActivitySeen: (myId: string, at: string) => void;                 // keeps the max
}
```

- Built with zustand `persist`, name `'sipply-seen-v1'`, storage `createJSONStorage(() => AsyncStorage)`.
- `onRehydrateStorage` prunes pour entries older than 48 h, then sets `hydrated: true`.
- Losing this store is harmless: everything simply reads as unseen once. That is why it does not copy the collection store's guarded writes.
- It is keyed by account, so it needs no reset on sign-out.

### 4.6 Privacy policy (`docs/privacy.md`)

- **Social graph** becomes: "Who you follow, which posts you have liked, and which posts you have saved. Saved posts are visible only to you."
- **Who else can see it**, first paragraph, becomes: "…your profile, your posts, your photos, who you follow and who follows you. When you like a post, its author can see that you liked it."
- **Deleting your account:** add "your saved posts" after "your likes".

---

## 5. Shared rules for these screens

- **Top bars** are always DS `ScreenTopBar`. Its rule is `showRule={scrolled}` from `const [scrolled, onScroll] = useScrolledPast()`, with `onScroll` and `scrollEventThrottle={16}` passed to the screen's list.
- **States** follow DS §11.
  - First load: `Hold fill={false}` (spinner from 400 ms, then "Still loading …" at 8 s).
  - Empty: `EmptyState` with its subject glyph and **one** primary action, or none.
  - Error with nothing on screen: `EmptyState icon="alert"`, "Could not load …", "Check your connection and try again.", with `actionVariant="secondary"` "Try again".
  - Error over stale content: `Notice tone="error"`, "Could not refresh. Pull down to try again.", as the first list item. The content stays.
  - Offline is the same two error states.
- **Press feedback:** media tiles (pour tiles, grid tiles, video tiles, Dex cards) use `PressableScale` at `motion.pressScale` with `noHaptic`, `unstable_pressDelay={120}` and `haptic.tap()` in `onPress`. Flicks start on tiles, the same reason DexCard gives. Controls use DS fills. `haptic.select` fires on tab changes.
- **Gutters:** `layout.gutter`. Media is full bleed.

---

## 6. Home (`src/app/(tabs)/index.tsx`)

### 6.1 Composition

```
<AuthGate>                                                     (unchanged)
  <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <ScreenTopBar title="Sipply" showRule={scrolled}
      titleNode={<Text style={[textRole.wordmark, { color: colors.wine }]} accessibilityRole="header" maxFontSizeMultiplier={1.2}>Sipply</Text>}
      left={<TopBarButton icon="plus" label="Log a pour" onPress={() => router.push('/log')} />}
      right={<TopBarButton icon="heart" label="Activity" badge={unread} onPress={() => router.push('/activity')} />} />
    <FlatList data={visibleFeed} ListHeaderComponent={header} … />   {/* visibleFeed = feed.filter(isRenderablePost), 06 §3.3 */}
```

- `unread = !!activityLatestAt && (!seenAt || activityLatestAt > seenAt)`, where `seenAt = useSeen(s => s.activity[myId])`. `TopBarButton`'s `badge` draws the 6pt wine dot and appends ", new" to the label.
- `header` holds the stale-content `Notice` (only when `feedError && visibleFeed.length > 0`), placed with `marginHorizontal: layout.gutter, marginTop: space.sm`, followed by `<TodaysPours …/>`.
- **The FlatList keeps:**
  - its current window (`initialNumToRender 2`, `maxToRenderPerBatch 2`, `windowSize 5`)
  - `useScrollToTop(listRef)`
  - pull to refresh through `refreshFeed`
  - `onScroll` from `useScrolledPast`
  - `contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + space.md }}`
- **Remove:** `FadeInDown`, the `scrolled`-stagger state and `markScrolled` (DS §10).
- **`ListEmptyComponent`** keeps today's three states, in v2 form:
  - Loading: a spinner, unless a pull is already spinning.
  - Failed: `EmptyState icon="alert"`, "Could not load your feed", with Try again (secondary) calling `load(myId)`.
  - Empty: `EmptyState icon="users"`, "Nothing poured yet", "Follow friends and their pours land here. Yours will too.", with primary **Find friends** → `/find-friends`.

### 6.2 Navigation helpers

`openDrink`, `openPerson` (yours → `router.navigate('/profile')`, anyone else → push `/user/[id]`) and `openFindFriends` stay exactly as they are today. New:

- `openPours(authorId)` → `router.push({ pathname: '/pours/[authorId]', params: { authorId } })`.

### 6.3 `TodaysPours`

**Props:** `{ myId, me: UserProfile, pours: Pour[], status: 'idle' | 'ready' | 'error', profiles, seenHydrated: boolean, onLog, onOpen(authorId), onFindFriends }`.

**`groupPours.ts`:**

```ts
export interface PourGroup { authorId: string; pours: Pour[] /* oldest → newest */; newestAt: string; unseen: boolean }
export function groupPours(
  pours: Pour[], myId: string, seen: Record<string, string> | undefined, now = Date.now(),
): { mine: PourGroup | null; others: PourGroup[] };
```

- Drops pours older than 24 h by `now`, so a tile expires without a refetch.
- `unseen = !seen?.[authorId] || newestAt > seen[authorId]`.
- `others` lists unseen groups first, each block ordered by `newestAt` descending, capped at 50.
- `mine.unseen` is always false.

**Row:** a wrapper `View` with a bottom `stroke.hair` in `colors.line`, containing a horizontal `ScrollView` with:

- `scrollsToTop={false}` (keep today's comment about the status-bar tap)
- `showsHorizontalScrollIndicator={false}`
- `contentContainerStyle={{ paddingHorizontal: layout.gutter, paddingVertical: space.md, gap: space.md }}`

**Tile** (constants at the top of the file):

```ts
const TILE_W = 72;   // 4:5 frame
const TILE_H = 90;
const INSET = 3;     // photo inset inside the frame; inner radius = radius.control - INSET (concentric, DS §3.1)
```

- **Frame:** a 72×90 `View`, `borderRadius: radius.control`, `backgroundColor: colors.bg`.
  - Unseen: `borderWidth: 2, borderColor: colors.wine`.
  - Seen, and your own tile: `borderWidth: stroke.edge, borderColor: colors.line`.
  - The photo stays inset by `INSET` either way, so the tile never changes size.
  - Frame thickness is the non-colour cue for unseen.
  - Until `seenHydrated` is true, every frame uses the seen style, so tiles never flash wine and then turn grey.
- **Photo:** absolute fill with `INSET` on all four sides, `borderRadius: radius.control - INSET`, `overflow: 'hidden'`.
  - Source: `useSignedPhoto(newest.path)`, using `Image` with `cacheKey: path`, `cachePolicy="memory-disk"`, `contentFit="cover"` and `transition={motion.fast}`.
  - While the URL is `undefined`, the photo area is filled with `bgSunk`.
  - If the URL is `null`, show `DrinkArt size={44}` centred on that category's `wash`.
- **Label:** `marginTop: 6`, `width: 72`, `fonts.body` at 12/16, centred, `numberOfLines={1}`, `maxFontSizeMultiplier={1.3}`. Colour is `text` when unseen and `textMuted` when seen. The text is the author's `username`.

**Tiles, in order:**

1. **Your tile.**
   - **No pours today:** the frame is 1pt `line` filled with `bgSunk`, with a `plus` 22 in `text` centred and the label "Log a pour". Tapping it calls `onLog` (a11y "Log a pour").
   - **With pours today:** your newest photo in seen style, labelled "Your pours". Tapping it calls `onOpen(myId)` (a11y "Your pours today, N").
     - It also gets a **+ badge**: a separate `Pressable` at `right: -4, bottom: -4` of the frame, 22×22, `borderRadius: radius.badge`, filled `wine` with a 2pt `colors.bg` edge, and a `plus` 14 in `textOnWine`.
     - The badge has `hitSlop={11}` and the label "Log a pour", and calls `onLog`.
     - It is square because it sits on a thumbnail, not an avatar (DS rule 1), so it needs no `round-ok`.
2. **One tile per `others` group.**
   - a11y: `` `${displayName}, ${n} ${n === 1 ? 'pour' : 'pours'} today${unseen ? ', new' : ''}` ``, hint "Opens their pours".
   - Tapping calls `onOpen(authorId)`.
3. **Find friends tile.** Shown only when `others` is empty and `status === 'ready'`. It uses the same frame as your empty tile with the `users` glyph and the label "Find friends", and calls `onFindFriends`.

**States:** `idle` and `error` show your tile only. There are no placeholders (DS: no skeletons) and no message, because the feed already speaks for the connection. `ready` shows the full row.

### 6.4 PostCard v2 (`src/components/PostCard.tsx`)

Props are unchanged. There is no card chrome and no fill.

```
Author row   minHeight 56 · paddingHorizontal layout.gutter · gap space.md · alignItems center
  [Avatar 32, no ring]  username         fonts.bodySemiBold 14/18 text
                        Negroni  #0042   fonts.display 14/18 text  +  dexNumber        [IconButton more, textMuted]
Media        full width · radius none
  photo aspectRatio 3/4 · bgSunk while loading   |   art fallback aspectRatio 1 · category wash · DrinkArt size = width × 0.56
  gallery count (only if > 1): at top 12 / right 12 — height 22, paddingHorizontal 6, radius badge,
                fill colors.reelScrim, no edge, fonts.bodyMedium 11/14 tabular reelInk, "1/3"
Actions      height 44 · paddingHorizontal space.sm (8, so glyph edges land on the 16 gutter)
  [♥] [share]                                                              [bookmark]
Likes        paddingHorizontal gutter · fonts.bodySemiBold 14/18 text · "12 likes" (absent at 0)
Caption      paddingHorizontal gutter · paddingTop 4 · fonts.body 14/20 text: **username** caption · 2-line clamp + "more"
Time         paddingHorizontal gutter · paddingTop 4 · fonts.body 12/16 textMuted · timeAgoSpoken(createdAt)
             paddingBottom space.lg
```

**Author row:**

- **Avatar:** a `Pressable` around `Avatar size={32}` with `hitSlop={6}` that opens the profile. It is hidden from VoiceOver, because the username beside it does the same thing.
- **Username:** a pressable `Text` with `hitSlop={{ top: 8, bottom: 2, right: 12 }}`, labelled `` `Open ${displayName}'s profile` ``.
- **Drink tag:** a `Pressable` with `hitSlop={{ top: 2, bottom: 8, right: 12 }}` that calls `onOpenDrink`.
  - The drink name is set in Playfair, per DS §9.2: a drink's name where the drink is the subject.
  - Label: `` `${drink.name}, number ${drink.dexNumber}. Opens it in the Dex` ``.
- The two text lines are secondary targets shorter than 44pt. Each has an alternative: the avatar for the profile, and "Open in the Dex" in the menu for the drink.
- Without `onOpenAuthor`, the identity reads as one plain element, as it does today.
- **More:** opens the same menu content as today (Open in the Dex, Share, then Report and Block on other people's posts).
- **Deleted:** the drink block that sat under the photo (the Playfair name and the ingredients line). The drink tag now names the drink, and the ingredients live on the drink page one tap away. Its styles go with it: `drinkMeta`, `drinkNameRow`, `drinkName`, `spec`, the `photoFrame` margin and radius, and the `artPanel` margins.

**Media taps.** One `Pressable` covers the media:

```ts
const DOUBLE_TAP_MS = 260;
// press: if (now - lastTap < DOUBLE_TAP_MS) { clearTimeout(pending); lastTap = 0; if (!liked) onLike(); burst(); }
//        else { lastTap = now; if (hasGallery) pending = setTimeout(advance, DOUBLE_TAP_MS); }
// clear the timer on unmount
```

- A single-photo post has no single-tap action, so it never waits.
- A gallery post advances 260 ms after a single tap.
- **Burst:** a solid `heart` at 88pt in `textOnWine`, centred, `pointerEvents="none"`. It scales 0 → 1.1 → 1 on `motion.spring`, holds for 280 ms, then fades over `motion.base`.
  - It answers a touch, so DS rule 4 allows it.
  - It is skipped under Reduce Motion. The action-row heart still fills.
- **VoiceOver:**
  - The photo is `accessibilityRole="image"`, labelled "Photo of Negroni" (gallery: "…, 2 of 3").
  - On a gallery post the frame is instead `accessibilityRole="button"`, labelled `` `Next photo of ${name}, ${i} of ${n}` ``.
  - Liking is done with the heart button. Double-tap is a touch shortcut, never the only path.

**Actions.** PostCard keeps its private `IconButton` because it carries the value-driven pop. Restyle it to a 44×44 box with no slop and a pressed opacity of 0.5 (the DS glyph rule).

- **Like:** 24 glyph, wine and filled when liked. `haptic.tap()` stays.
- **Share:** labelled "Share this pour". `Share.share` is unchanged.
- **Save:** right-aligned. Rendered only when `savesSupported()`.
  - The `bookmark` glyph is in `text` and filled when saved.
  - Label "Save" or "Remove from saved", with `accessibilityState={{ selected }}`.
  - Optimistic overlay using `saveFlip`, keyed `` `${post.id}|${serverSaved ? 1 : 0}` ``, exactly like `flip` for likes. A failure clears it.
- **No comment glyph.**

**Likes:** the figure moves from wine to `text`. The filled wine heart directly above it already carries the state (DS rule 5).

**Caption:**

- `numberOfLines={expanded ? undefined : 2}`.
- To decide whether to show "more", render a hidden measuring copy: absolute, `opacity: 0`, `accessibilityElementsHidden`, with no `numberOfLines`. Its `onTextLayout` reports `lines.length > 2`.
- "more" is a pressable `Text` in `fonts.bodyMedium` 14 `textMuted`.
- `expanded` is keyed by `post.id`, so a recycled card resets.
- A blank caption renders nothing.

**Time:** `timeAgoSpoken` is now used for display too ("2 hours ago"). `timeAgo` stays exported for the viewer header.

---

## 7. Today's pours viewer (`src/app/pours/[authorId].tsx`)

- **Presentation:** a root-stack modal (§2), giving a native swipe-down close and VoiceOver's escape gesture. Gate it like `user/[id]`. Render `<StatusBar style="light" />` while it is open.
- **Order snapshot.** On mount, `useState(() => …)` fixes the order of people:
  - `[mine]` when `authorId === myId`.
  - Otherwise `groupPours(…).others` as it stood on open, starting at the tapped author.
  - Within an author, start at the **first unseen** pour (counting oldest to newest), or at 0 if all are seen.
- **State:** `{ authorIdx, pourIdx }`.
  - **Next** goes to the next pour. After an author's last pour it goes to the next author's first unseen pour. After the last author it calls `router.back()`.
  - **Previous** goes back one pour. At an author's first pour it goes to the previous author's last pour. At the very start it does nothing.
- **Seen:** each time a pour is shown, call `markPourSeen(myId, authorId, pour.at)`.

```
ground colors.reelGround · paddingTop space.sm (page sheet)
Progress   row · paddingHorizontal gutter · gap 4 · one bar per pour, flex 1, height stroke.indicator, radius none
           shown/past reelInk · ahead reelTrack · hidden from VoiceOver
Header     height 48 · paddingHorizontal gutter: Avatar 32 · username fonts.bodySemiBold 14 reelInk ·
           timeAgo(at) fonts.body 13 reelInkMuted · spacer · MediaIconButton icon="close" label "Close"
Photo      flex 1 · Image contentFit="contain" · useSignedPhoto(path)
Tap zones  over the photo: left 33% button "Previous pour", right 67% button "Next pour"
Footer     paddingHorizontal gutter · paddingVertical space.md · gap space.sm
           drink name fonts.display 22/28 reelInk + dexNumber (color reelInkMuted) → button: back, then push /drink/[id]
           "View post" fonts.bodySemiBold 14 reelInkMuted → back, then push /post/[postId]
```

- The photo's a11y label is `` `Photo of ${drink.name}, ${pourIdx + 1} of ${n}, by ${displayName}` ``. The same string goes to `announce()` each time the pour changes.
- A `null` photo shows `DrinkArt size={160}` on `reelGround`.
- **Nothing left on arrival** (expired, or a stale link): `EmptyState tone="dark" icon="camera"`, "Nothing new right now", with secondary **Close**.

---

## 8. Profile

### 8.1 Wrappers

**`(tabs)/profile.tsx`** (inside `AuthGate`):

- While `profileLoading`: a `ScreenTopBar size="lg" title=""` with the same `left`/`right`, plus `Hold fill`.
- On failure: the same bar with today's message and Try again, in `EmptyState icon="alert"` form.
- Otherwise:

```tsx
<ProfileView person={toProfile(profile)} isOwn
  left={<TopBarButton icon="plus" label="Log a pour" onPress={() => router.push('/log')} />}
  right={<TopBarButton icon="settings" label="Settings" onPress={openSettings} />}
  bottomInset={insets.bottom + TAB_BAR_CLEARANCE + space.md} />
```

**`PeerProfile.tsx`:**

- `ACCOUNT_ID`, `ownEntry`, the lookup states (`loading | failed | missing`), `openReport`, `confirmBlock` and `afterBlock` stay verbatim.
- The lookup states render under `ScreenTopBar size="lg"` with a back `TopBarButton`.
- When the person is found:

```tsx
<ProfileView person={person} isOwn={false}
  onBack={onBack}
  right={<TopBarButton icon="more" label={`Options for @${person.username}`} onPress={openAccountMenu} />}
  onBlocked={afterBlock}
  bottomInset={insets.bottom + space.xl} />
```

- `openAccountMenu` becomes `['Share profile', 'Report account', `Block @${username}`, 'Cancel']`, with `destructiveButtonIndex: 2`. On other platforms it uses `Alert` as today.

### 8.2 `ProfileView` and `ProfileHeader`

**`ProfileView` owns:**

- **The top bar.**
  - Own: `ScreenTopBar size="lg" title={username} left={left} right={right}` (bare username, centred, `textRole.barTitleLg`).
  - Peer: `ScreenTopBar size="lg" title={username} left={<TopBarButton icon="chevronLeft" label="Back" onPress={onBack} />} right={right}`.
  - Both use `showRule={scrolled}`.
- **Data.**
  - Posts: `usePostsByAuthor(person.id, myId, isOwn ? String(postsVersion) : '')`.
  - Counts: `useProfileCounts(person.id)`.
  - Clips come through the seam (§8.7) and are fetched the first time that tab opens; the refetch key is `useVideosVersion()`.
- **The current tab:** `'posts' | 'videos' | 'dex'`, defaulting to `posts`. It is not persisted.
- **The rows and the list.**

**Header** (`ProfileHeader`, the first part of `ListHeaderComponent`):

```
paddingHorizontal layout.gutter · paddingTop space.xs
Row: [Avatar size 86, no ring]  marginLeft 20  Column (flex 1, justifyContent center):
       name     textRole.groupTitle, color text (not textMuted) · numberOfLines 1
       counts   marginTop 6 · row of 3 cells, flex 1, left-aligned:
                  figure  fonts.bodySemiBold 16/22 text · tabular · maxFontSizeMultiplier 1.4
                  label   fonts.body 14/20 text · maxFontSizeMultiplier 1.4 · "posts" / "followers" / "following" (singular at 1)
Bio      marginTop space.md · fonts.body 14/20 text (absent when empty)
Actions  marginTop space.lg · row · gap 6 (§8.3)
```

**Counts:**

| Cell | Own | Peer | Pressable |
|---|---|---|---|
| posts | `total ?? (status === 'ready' ? posts.length : null)` | same | No. A `View accessible` labelled "12 posts". |
| followers | `counts.followers` | `counts.followers` + the optimistic delta (below) | Yes. Opens `/connections/[id]` with `list: 'followers'`. Label "968 followers", hint "Shows the list". |
| following | `useSocial.following.length` | `counts.following` | Yes. Opens the same screen with `list: 'following'`. |

- A `null` count shows "–", read as "Followers, not loaded yet". This is the existing `Stat` rule.
- **Optimistic peer followers.** When the counts resolve, remember `followingAtCount = following.includes(id)`. Display `followers + (followingNow === followingAtCount ? 0 : followingNow ? 1 : -1)`, never below 0.

### 8.3 Actions row and share

| Variant | Contents (all DS `Button size="sm"`, 36 tall, with hitSlop to 44) |
|---|---|
| Own | `Button variant="tonal" label="Edit profile"` (`flex: 1`) → `/edit-profile` · `Button variant="tonal" label="Share profile"` (`flex: 1`) · `TonalIconButton icon="addPerson" label="Find friends"` → `/find-friends` |
| Peer, not following | `Button variant="primary" label="Follow"`, or `"Follow back"` when `fetchFollowsMe` is true (`flex: 1`) |
| Peer, following | `Button variant="tonal" label="Following"` (`flex: 1`, no check icon, per DS's FollowButton). Pressing it opens an action sheet titled `` `Unfollow @${username}?` `` with options `['Unfollow', 'Cancel']`, destructive index 0. Other platforms use `Alert`. |

- Following goes through `useSocial.toggleFollow`, which is optimistic.
- a11y labels are "Follow Jan McQueeny" and "Unfollow Jan McQueeny".
- There is no Message button and no placeholder for one.
- **`TonalIconButton`** is private to `ProfileHeader.tsx` and matches DS §4's tonal button at the icon-only size:
  - 36×36, `radius.control`, `stroke.edge` `line`, filled `bgSunk` (pressed: `slot`).
  - Glyph 18 in `text`, `hitSlop={4}`, `accessibilityRole="button"`.

**Share** (`src/lib/profileLink.ts`):

```ts
export const profileUrl = (id: string) => Linking.createURL(`u/${id}`);   // +native-intent already routes u/<uuid> → /user/<id>
export function buildProfileShareMessage(p: { displayName: string; username: string; url: string }): string {
  return `${p.displayName} (@${p.username}) on Sipply. If you have the app, this opens the profile: ${p.url}\nOr search for @${p.username}.`;
}
```

It is as honest about the custom scheme as `buildInviteMessage` is. Sharing never creates an invite and never makes anyone follow anyone.

### 8.4 Tabs

- The header is followed by the DS `TabStrip` with `iconOnly`, placed outside the gutters with `marginTop: space.lg`.
- **Items:**
  - `{ key: 'posts', icon: 'grid', label: 'Posts', fillActive: true }`
  - `{ key: 'videos', icon: 'reels', label: COPY.label /* "Clips" */, fillActive: true }`, shown only when `videosSource.SHOW_PROFILE_VIDEOS`
  - `{ key: 'dex', icon: 'dex', label: 'Dex', fillActive: true }`
- Changing tab calls `haptic.select()`. The strip is not sticky: making it sticky would mean splitting the header into list items, which is not worth it at our post counts.

### 8.5 Rows and the posts grid

**List settings:**

- `FlatList` with `numColumns={1}`, `data={rows}`, `keyExtractor={r => r.key}`.
- `ListHeaderComponent` = header + TabStrip.
- `onScroll` from `useScrolledPast`.
- `refreshing={reloading}`. `onRefresh` reloads posts, counts and videos, and runs `refreshProfile()` on your own profile when the row is missing.
- `initialNumToRender={6}`, `windowSize={7}`.
- `useScrollToTop` on your own profile only.
- `contentContainerStyle={{ paddingBottom: bottomInset }}`.

**Row types:**

```ts
type Row =
  | { key: string; kind: 'posts'; posts: Post[] }            // ≤ 3
  | { key: string; kind: 'videos'; videos: ProfileVideo[] }  // ≤ 3
  | { key: string; kind: 'dexSummary' }
  | { key: string; kind: 'dex'; drinks: Drink[] }            // ≤ 2
  | { key: string; kind: 'state'; state: 'loading' | 'empty' | 'error' }
  | { key: string; kind: 'note'; text: string };
```

**What each tab shows, by state:**

| Tab | loading | error, nothing held | data | none |
|---|---|---|---|---|
| posts | `state:loading` | `state:error` | `chunk(posts.filter(isRenderablePost), 3)`, then a `note` "Showing the latest 100 of 1,204 posts." when `total > posts.length` | `state:empty` |
| videos | `state:loading` | `state:error` | `chunk(videos, 3)` | `state:empty` |
| dex | `state:loading` | `state:error` | `dexSummary`, then `chunk(drinksByDexNumber, 2)` | `state:empty` |

- **Keys:** `` `${tab}:${firstId}` ``, `` `${tab}:state` `` and `` `${tab}:note` ``.
- **Note row:** `textRole.helper`, `textMuted`, `paddingHorizontal: layout.gutter`, `paddingTop: space.lg`.

**`PostGridRow`:**

- `flexDirection: 'row'`, `gap: layout.gridGap`, `marginTop: layout.gridGap`.
- Tile size is `S = (width - 2 * layout.gridGap) / 3`, unrounded, for the same reason as DexCard's `cardWidth`. A short last row stays left-aligned.

**`PostGridTile`** (replaces `PostTile`):

- An `S × S` square, `radius.none`, filled with the category `wash`.
- Image: `useSignedPhoto(post.photoPath, post)` under the existing three-state rule. A `null` URL shows `DrinkArt size={S * 0.6} flat`.
- A post with more than one photo gets a `stack` marker at top 6, right 6: 22×22, `radius.badge`, filled `reelScrim`, no edge, glyph 14 in `reelInk`.
- It is a media tile (§5). Tapping opens `/post/[id]`.
- a11y: `` `${drink.name}, posted ${timeAgoSpoken(createdAt)}${n > 1 ? `, ${n} photos` : ''}` ``.

### 8.6 Dex tab (`DexShelf.tsx`)

- `drinksByDexNumber = posts.map(p => getDrink(p.drinkId)).filter(Boolean).sort((a, b) => a.dexNumber - b.dexNumber)`. The posts are already unique per drink.
- `derivePostStats` moves here unchanged.

**`DexSummary`** (`paddingHorizontal: layout.gutter`, `paddingTop: space.lg`, `paddingBottom: space.md`):

- **Line 1:** `` `${formatCount(n)} of ${formatCount(TOTAL)} shared` `` in `textRole.sectionTitle`, `text`.
  - When the list is one page of more, add a line below in `textRole.helper` `textMuted`: "Based on their latest 100 posts" (own profile: "your latest").
- **Own profile only:** `Button variant="text" size="sm" label={`${formatCount(unlockedCount)} in your Dex`}` with `alignSelf: 'flex-start'`.
  - It calls `router.navigate('/dex')`.
  - a11y hint: "Opens your Dex".
  - `unlockedCount` comes from `deriveStats(useCollection.unlocks)`.
- **Rarity strip.**
  - A `Card` (`radius.card`, 1pt `line`, `overflow: 'hidden'`) with `marginTop: space.md` and `flexDirection: 'row'`.
  - It holds 4 cells, each `flex: 1`, 56 tall and centred. Cells 2 to 4 have a `stroke.hair` `line` left edge.
  - Each cell shows the figure in `fonts.bodySemiBold` 16/22 `text` (tabular), then `RARITY_META[r].label` in `fonts.bodyMedium` 11/14, coloured `RARITY_META[r].color` (audited on white).
  - Each cell is `accessible`, labelled `` `${label}, ${count}` ``.

**`DexShelfRow`:**

- `flexDirection: 'row'`, `gap: space.sm`, `paddingHorizontal: layout.gutter`, `marginBottom: space.sm`.
- `cardWidth = (width - layout.gutter * 2 - space.sm) / 2` and `artSize = Math.round(cardWidth * 0.66)`, the Dex tab's own numbers.
- Each card is `<DexCard drink collected userPhotoUri={null} cardWidth artSize onPress={id => router.push({ pathname: '/drink/[id]', params: { id } })} />`, which shows the stock photograph or art in its rarity frame.

### 8.7 Clips tab: the seam to REELS (wired, not stubbed)

`src/components/profile/videosSource.ts` is the **only** file here that knows about videos:

```ts
import { COPY, REELS_ENABLED, fetchReelsByAuthor, type Reel } from '@/lib/reels';   // B1, stage 1
import { useReels } from '@/store/reels';                                               // B1, stage 1
import { signedPhotoUrl, primeSignedUrls } from '@/lib/social';                         // A2, stage 1
export interface ProfileVideo { id: string; authorId: string; posterPath: string; durationMs: number; createdAt: string; drinkId: string | null }
export const SHOW_PROFILE_VIDEOS = REELS_ENABLED;
/** Newest first, ≤ 100 (05's live limit). Maps Reel → ProfileVideo, then primeSignedUrls('reels', posterPaths) once. */
export function fetchProfileVideos(authorId: string, myId: string): Promise<ProfileVideo[]>;
export function signedPosterUrl(path: string): Promise<string | null>;   // signedPhotoUrl(path, 'reels'); never rejects
export const VIDEO_ROUTE = '/reel/[id]' as const;   // push with params { id, author: authorId } (05 §8.2)
export const RECORD_VIDEO_ROUTE = '/record' as const;
/** 05's store bumps reelsVersion after a post, delete or report; pass it as the refetch key. */
export const useVideosVersion = () => useReels((s) => s.reelsVersion);
export const VIDEO_COPY = COPY;   // every visible string for the tab comes from here
```

- No `WIRED` flag and no stub: `lib/reels.ts` and `store/reels.ts` land in stage 1 (B1), so this file is written against them once. It stays the **only** file in `components/profile/` that imports clip code.
- **`VideoGridRow` and its tile** (DS §8):
  - 3 columns, `gap: layout.gridGap`, tile width `S`, `aspectRatio: 9/16`, `radius.none`, filled `reelGround` while loading.
  - The poster comes from `signedPosterUrl` with `contentFit="cover"`.
  - Bottom left: the `play` glyph 14 plus the duration (`m:ss`), set in `fonts.bodySemiBold` 12 `reelInk` (`tabular`) over a 32pt `reelScrim` band.
  - Tapping it opens `VIDEO_ROUTE` with `{ id, author: authorId }`.
  - a11y: `` `Clip, ${seconds} seconds, posted ${timeAgoSpoken(createdAt)}${drink ? `, tagged ${drink.name}` : ''}` `` (05 §8.1's label).

### 8.8 Empty and error rows

Every `state` row renders DS `EmptyState`, with one action at most. `@u` below means the username.

| Tab | Own: empty | Peer: empty | Error (both) |
|---|---|---|---|
| Posts | `camera`, "Log your first pour", "Pours you share show up here.", primary **Log a pour** → `/log` | `camera`, "No pours yet", "@u hasn't shared a pour yet." No action, because Follow is already in the header. | `alert`, "Could not load posts", "Check your connection and try again.", secondary **Try again** |
| Clips | `reels`, `COPY.emptyTitle` ("No clips yet"), "Film one and it shows up here.", primary `COPY.record` ("Record a clip") → `RECORD_VIDEO_ROUTE` | `reels`, `COPY.emptyTitle`, "Nothing filmed yet." | `alert`, "Could not load clips", same body and action |
| Dex | `dex`, "Nothing shared yet", "Drinks you share land here in Dex order.", primary **Log a pour** | `dex`, "Nothing in their Dex yet", "Drinks @u shares land here in Dex order." | `alert`, "Could not load this Dex", same body and action |

A failed refetch over data already on screen keeps that data, as `usePostsByAuthor` does today. Error rows appear only when nothing is held.

---

## 9. Activity (`src/app/activity.tsx`)

- `ScreenTopBar size="md" title="Activity" showRule={scrolled}` with a back `TopBarButton`. Gate it like `user/[id]`, with 02's `onClose`.
- **Data:** `fetchActivity(myId)`, then `fetchProfiles(actorIds)` merged into `useSocial.profiles`. Hold it locally in keyed `{ status, items }` state. Pull to refresh.
- **Seen:**
  - On mount, capture `seenAtOnOpen` once.
  - In `useFocusEffect`, once the items have loaded, call `markActivitySeen(myId, max(items[0]?.at, activityLatestAt))`. This clears the Home badge.
- **Sections:** `SectionHeader` "New" for items newer than `seenAtOnOpen`, and "Earlier" for the rest. Each has `paddingHorizontal: layout.gutter`, `marginTop: space.lg`, `marginBottom: space.sm`, and an empty section is omitted.
- **Row** (ListRow metrics, rows sit on the page):
  - `minHeight: layout.rowTall` (64), `paddingHorizontal: layout.gutter`, `paddingVertical: space.md`, `gap: space.md`, row direction, centred items.
  - A `stroke.hair` `line` separator, inset to the text: 16 + 40 + 12 = 68.
  - **Leading:** a `Pressable` around `Avatar 40` that opens the actor's profile. It is hidden from VoiceOver.
  - **Text** (`flex: 1`, `fonts.body` 14/20 `text`), pressable:
    - Like: "**username** liked your pour of Negroni." + `timeAgo` in `textMuted`. Opens `/post/[postId]`.
    - Follow: "**username** started following you." + time. Opens `/user/[id]`.
    - a11y: "Ana liked your pour of Negroni, 2 hours ago".
  - **Trailing:**
    - Like: a 44×44 thumbnail (`radius.badge`, 1pt `line`), via `useSignedPhoto`, or `DrinkArt` on the category wash. Opens `/post/[postId]`, labelled "Open the post".
    - Follow: the existing `FollowButton`, unchanged.
  - **v1 has no aggregation:** one row per event, 60 at most, covering 30 days.
- **States:**
  - Loading: spinner.
  - Error: `EmptyState icon="alert"` "Could not load activity", with Try again.
  - Empty: `EmptyState icon="heart"` "No activity yet", "When someone likes your pour or follows you, it shows up here.", with no action.

---

## 10. Other screens

### 10.1 Followers and following (`src/app/connections/[id].tsx`)

- **Params:**
  - `id`: checked against `ACCOUNT_ID` (exported from `PeerProfile.tsx`). A bad id goes straight to the empty state.
  - `list`: `'followers' | 'following'`, default `'followers'`.
- **Top bar:** `ScreenTopBar size="md"` with a back `TopBarButton`, titled with the username, from `useSocial.profiles[id]` or `useAuth.profile`, otherwise "People".
- **Tabs:** DS `TabStrip` (labels shown) with Followers and Following. Changing calls `router.setParams({ list })`.
- **List:** a `FlatList` of `PersonRow`s from `fetchConnections`.
  - Follow state comes from `useSocial.following`, toggled with `toggleFollow`.
  - Your own row passes `hideFollow` and `onOpen={() => router.navigate('/profile')}`.
- **Footer:** when 200 rows come back, show "Showing the latest 200." in `textRole.helper` `textMuted`.
- **States:**
  - Loading: spinner.
  - Error: "Could not load this list", with Try again.
  - Empty followers: `EmptyState icon="users"` "No followers yet".
  - Empty following: "Not following anyone yet". On your own profile only, add primary **Find friends**.
- Blocked or deleted people never appear (RLS handles this).

### 10.2 Single post (`src/app/post/[id].tsx`)

- `ScreenTopBar size="md" title="Post"` with a back `TopBarButton`. Gate it like `user/[id]`. A bad UUID (checked with a local regex, §0.1) goes straight to the missing state.
- **Data:** `fetchPost(id, myId)` with keyed `loading | failed | missing | ready` state.
- **Ready:** a `ScrollView` holding one `PostCard`:
  - `onOpenAuthor`: yourself → `router.navigate('/profile')`; anyone else → push `/user/[id]`.
  - `onOpenDrink` → `/drink/[id]`.
  - `onBlocked`: `dropAuthor`, then `router.back()`.
- **Failed:** `EmptyState icon="alert"` "Could not load this post", with Try again.
- **Missing:** `EmptyState icon="camera"` "Post unavailable", "This post was removed or isn't available.", with secondary **Back**.

### 10.3 Saved (`src/app/saved.tsx`)

- `ScreenTopBar size="md" title="Saved"` with a back `TopBarButton`.
- First row: "Only you can see what you save." in `textRole.helper` `textMuted`, with `paddingHorizontal: layout.gutter` and `paddingVertical: space.sm`.
- **Data:** `fetchSavedPosts(myId)` in keyed state. In `useFocusEffect`, refetch when `savesVersion` has changed since the last fetch, so a post unsaved from `/post/[id]` is gone when you return.
- **Rows:** `chunk(posts.filter(isRenderablePost), 3)` rendered as `PostGridRow`.
- **States:**
  - Loading: spinner.
  - Error: "Could not load saved posts", with Try again.
  - Empty: `EmptyState icon="bookmark"` "Nothing saved yet", "Tap the bookmark under any pour to keep it here."
  - `!savesSupported()`: "Saving isn't available right now", "Try again after the next update.", with no action.

### 10.4 Find friends: Everyone on Sipply (`src/app/find-friends.tsx`, appended)

- After `<FindFriends />`, add `SectionHeader title="Everyone on Sipply"` (`marginTop: space.xl`, `marginBottom: space.md`).
- Then a `ListGroup` of `PersonRow`s from `useSocial.people`, loaded by `loadPeople(myId)` in an effect on mount.
- **States** move here from the old profile Accounts list:
  - Loading: spinner.
  - Failed: `EmptyState icon="alert"`, with Try again.
  - Empty: "No one else here yet", with no action, because this screen's invite card is right above it.

### 10.5 Settings: Your activity (`src/app/settings.tsx`, added)

- Directly after the identity block, add one group titled **"Your activity"** with two rows:
  - **Saved** (`bookmark`), detail "Pours you bookmarked. Only you can see them.", opens `/saved`.
  - **Activity** (`heart`), detail "Likes on your pours and new followers.", opens `/activity`.
- Use whichever primitive Settings uses when this lands: today's `Section` + `Row`, or DS Phase 3's `SectionHeader size="group"` + `ListGroup` + `ListRow` with `trailing="chevron"`.

---

## 11. Accessibility (all must hold)

- **Targets:** 44pt everywhere, by box or `hitSlop`. The only exceptions are the two author-row text lines (§6.4), and each has an alternative path.
- **VoiceOver order on Home:**
  1. Log a pour
  2. "Sipply" (header)
  3. Activity (", new")
  4. Notice
  5. Pour tiles
  6. Each post: username, drink, options, photo, like, share, save, likes, caption, More, time
- **Avatars** are hidden wherever an adjacent name already speaks.
- **State:** carried by `accessibilityState` (`selected`, `busy`, `disabled`) and spoken words, never by colour alone. Unseen also differs by frame thickness. Active tabs are filled.
- **Announcements:** `announce()` for each viewer step. Notices announce themselves (DS). Failures to like, save or follow keep their existing `Alert`s.
- **Dynamic Type caps:** wordmark 1.2; bar titles, tile labels and buttons 1.3; counts 1.4. Body copy is uncapped.
- **Reduce Motion:** no burst. TabStrip motion is handled by DS. There are no entrance animations at all.
- **Contrast:** every pair used is already audited, by today's palette or by DS §13.2:
  - text and textMuted on bg, surface and bgSunk
  - textOnWine on wine
  - reelInk and reelInkMuted on reelGround, and reelInk on reelScrim over a white frame (01 §13.2)
  - the RARITY_META colours on white

  `check-contrast.mjs` needs no new pairs.

---

## 12. Motion

| What | Rule |
|---|---|
| Feed, grids and lists loading | No entrance animation. Images use `transition={motion.fast}`. |
| Like heart | The existing value-driven pop. Double-tap burst as in §6.4, off under Reduce Motion. |
| TabStrip and top-bar divider | DS primitives. |
| Tiles | `PressableScale` at `motion.pressScale`. |
| Viewer step | Instant cut. No slide. |

---

## 13. Build order and done

1. **Data layer.** The migration file, `schema.sql`, `database.types.ts`, `types.ts`, the `lib/social.ts` queries and `store/social.ts` are **A2's, in stage 1** (00). In stage 2, C3 starts with `store/seen.ts` and C4 with `profileLink.ts`.
2. **Glyphs.** `addPerson` and `stack` are added by A1 in stage 1 (§3 gives the paths). Nothing to create here.
3. **PostCard v2.**
4. **Home:** `TodaysPours`, `groupPours`, the viewer route (its `_layout.tsx` line is C1's).
5. **Profile:** move `usePostsByAuthor`, then build `useProfileCounts`, `PostGrid`, `DexShelf`, `VideoGrid` with `videosSource`, `ProfileHeader`, `ProfileView`, and finally the own-profile and peer wrappers.
6. **Other screens:** `post/[id]`, `connections/[id]`, `saved` and `activity`, then the Find friends and Settings additions.
7. **Docs.** The `docs/privacy.md` lines.
8. **Checks.** Run `npx expo start` once so typed routes include the new screens. Then `npx tsc --noEmit`, `npx expo lint`, `node scripts/check-design.mjs` (rules 3 and 4 must report zero in these files, with no new `round-ok`) and `node scripts/check-contrast.mjs`.

**Done** means each of these was checked in the running app, using a dev client or an update to build 11 (`tsc` alone does not count):

- [ ] With the migration **not** applied, the feed loads, no bookmark shows and Today's pours shows only your tile.
- [ ] With it applied, saving and unsaving work on Home and on `/post/[id]`, and Saved updates when you return to it.
- [ ] After you log a pour:
  - your tile shows the photo with a + badge;
  - on a second account that follows you, your tile has a wine frame;
  - the tile opens the viewer;
  - the frame turns to `line` after viewing, and stays that way across an app restart.
- [ ] Logging a drink you already have (a new photo on an old post) shows up in Today's pours.
- [ ] Blocking someone from a post menu removes their tile, their posts and their Activity rows at once.
- [ ] Double-tap likes a single-photo post with no delay. A single tap on a gallery advances about a quarter of a second later.
- [ ] Profile:
  - the counts open the lists;
  - Follow → Following → Unfollow (through the sheet) moves the followers figure by ±1 at once;
  - "Follow back" shows when they follow you.
- [ ] Profile tabs:
  - Posts is a 3-up, full-bleed grid;
  - Dex is 2-up cards in Dex order with the rarity strip;
  - Clips is hidden while `SHOW_PROFILE_VIDEOS` (= `REELS_ENABLED`) is false, and shows the author's clips when it is on.
- [ ] On a 375pt screen, your own actions row (Edit profile, Share profile, add-person) fits on one line without truncation at the default text size.
- [ ] The heart badge appears after someone likes your post, and clears after you open Activity.
- [ ] A VoiceOver pass over Home, the viewer, Profile and Activity reads in the §11 order.

---

## 14. What Jan must do outside the code

1. **Apply the migration by hand.**
   - In the Supabase dashboard open **SQL Editor → New query**, paste all of `supabase/migrations/017_home_and_profile.sql` and press **Run**.
   - Then run its VERIFY block (§4.1). Both values must come back non-null.
   - The app keeps working without it (no bookmark, and only your tile in the pours row), so do it any time before telling testers about Saved.
2. **Nothing else.** This needs no keys, no env flags beyond DS's `EXPO_PUBLIC_REELS`, no dashboard toggles, no Apple or Meta settings and no native build.
3. **Privacy policy.** The `docs/` Pages site republishes when `main` moves, which publishes the policy lines.

---

## 15. Open question for Jan

- **Comments.** They are left out of this spec on purpose. Reference 2 has them, but comments bring obligations a like does not:
  - a table of their own
  - the content filter run on every comment
  - report and block on each comment (App Store guideline 1.2)
  - notifications

  If you want them, they become their own spec, and the comment glyph goes back into the action row when that spec lands, not before.
