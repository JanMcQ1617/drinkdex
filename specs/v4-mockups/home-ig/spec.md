# Home, laid out like Instagram's feed (v4 "Daylight")

Mock, 12 Oct 2026, for Jan's note: "you changed the home section can you make it look the same as instagram since you changed it last build".

Build 20 cut Home down to an inset 4:5 print, one line (drink and author) and a heart with its count (`specs/v4-mockups/white-min/home.png`). This mock puts back Instagram's post anatomy in Daylight's black and white. The drink photos are the only colour.

Files:

- `index.html`: the wall. `index.html#home`, `#scrolled` and `#caption` each show one frame. `#measure` dumps every element's rectangle as JSON.
- `home.png`, `scrolled.png`, `caption.png`: 440 × 956 pt, saved at 2x (880 × 1912).
- `contact.png`: build 20 beside the three frames, at 1x.
- `tools/render.sh`: makes the PNGs using a throwaway headless Chrome profile in `.chrome-profile/`, which it deletes afterwards. `render.sh measure` prints the rectangles.

Sources: `src/app/(tabs)/index.tsx`, `src/components/PostCard.tsx`, `src/components/home/{HomeChrome,TodaysPours,NotInDexYet,groupPours}`, `src/components/FloatingTabBar.tsx`, `src/components/icons.tsx`, `src/constants/theme.ts`, `src/types.ts`, `src/lib/social.ts`, `supabase/migrations/021_post_likers.sql`, and the v4 palette in `specs/v4-mockups/white/spec.md`.

---

## 1. The frames

| Frame | What it shows |
|---|---|
| `home.png`, at rest | The bar (wordmark; create and Activity on the right). The stories tray. Post 1 whole (ines.ag, Negroni, no comments yet). Post 2's whole header (theo_stirs, Paper Plane) above the tab bar. |
| `scrolled.png`, scroll 681 | The bar has slid away, as it does today on a downward scroll. The tail of post 1 is at the top. Post 2 is centred between the status strip and the tab bar: a gallery with "1/3" and dots, liked by you (solid heart), three liker faces, two lines of caption with "… more", "View all 12 comments" and "5 hours ago". Post 3's header (maya.pours, with an unseen-story ring) and the top of its photo follow. |
| `caption.png`, scroll 681 | The same view after tapping "more". The whole caption opens where it is (6 lines, 108 pt). Nothing scrolls; the post grows, and post 3 moves below the tab bar. |

---

## 2. Measurements (points, 440 × 956, top inset 62, bottom inset 34)

All x values are from the screen's left edge. The text column is **16 to 424** (408 wide). Instagram uses a gutter of about 12 to 16; the other tabs keep 24.

### 2.1 The screen at rest, top to bottom

| Band | y | Height |
|---|---|---|
| Status bar (system) | 0 – 62 | 62 |
| Home bar | 62 – 106 | **44** (Home only; other bars stay 52) |
| Bar foot (1 pt `line`, shown only once scrolled) | 106 – 107 | 1 |
| Stories tray | 107 – 211 | 104 |
| Post 1 | 211 – 827 | 616 (no comments line) |
| Post 2 header | 827 – 879 | 52 (visible to 873) |
| Tab bar (as in build 20) | 873 – 956 | 49 row + 34 inset |

### 2.2 Home bar

| Element | Box | Notes |
|---|---|---|
| Wordmark "Sipply" | x 16, y 67, 81 × 34 | Playfair 700 28/34, tracking −0.2, `ink`. Vertically centred in the 44 pt row. |
| Create (+) | glyph 354 – 380, y 71 – 97 (26 pt); hit box 345 – 389 | NEW `create` glyph: a squared frame (rx 4) with a plus inside, stroke 1.6, `ink`. Opens `/log`. |
| Activity heart | glyph 398 – 424, y 71 – 97; hit box 389 – 433 | `heart` outline, `ink`. Opens `/activity`. |
| Unread dot | 414, 69, 12 × 12 | 8 pt `ink` dot with a 2 pt `page` ring (the existing TopBarButton `badge`). |

The bar hides on a downward scroll and comes back on an upward one (HomeChrome, unchanged). The travel is now 45 (44 + 1).

### 2.3 Stories tray (107 – 211)

| Element | Measure |
|---|---|
| Slot | **80** wide (fixed, no longer width ÷ 5). The rail is padded 5 on each side, so ring boxes start at x 12 · 92 · 172 · 252 · 332 · 412. The sixth is cut by the screen edge (28 pt shows), as on Instagram. |
| Ring box | **66** × 66, top at y 115 (8 under the bar foot) |
| Unseen ring | 2 pt `ink` (19.80:1) |
| Seen ring | **1 pt `rule`** #C4C4C4. Today a seen story has no ring at all. |
| Disc | 56, inset 5 (2 ring + 3 gap), `wash` until the photo decodes. Shows the person's newest photo from today (as now). |
| "Your story" disc | Your avatar, 56, with no ring when you have not posted today. |
| + badge | A 22 pt `ink` disc with a 14 pt white plus (stroke 2.4) and a 3 pt `page` ring (28 outer). Its outer box is at 50 – 78, 153 – 181: its corner sits on the ring box's corner. Only drawn when you have not posted today. |
| Name | Inter 400 13/18, centred in the slot, one line, ellipsis. y 185 – 203 (4 under the ring). `ink` when unseen; `muted` when seen and for "Your story". |
| Tray foot | 8 pt, ending at 211. There is no rule. |

### 2.4 One post (y relative to the post's top; post 1 starts at 211)

| Element | x | y | w × h | Type, colour |
|---|---|---|---|---|
| **Header row** | 0 | 0 | 440 × 52 | |
| Story ring (only when the author has an unseen story today) | 12 | 6 | 40 × 40 | 2 pt `ink` ring, 2 pt gap |
| Avatar | 16 | 10 | 32 × 32 | Avatar (tone or photo) |
| Username | 60 | 8 | auto × 18 | Inter 600 13/18 `ink`, one line |
| Drink line | 60 | 26 | auto × 18 | **Playfair 700 13/18 `ink`**, one line. This is where Instagram shows a location. A place would follow it as "· Old San Juan" in Inter 400 `muted` once posts have one (§4). |
| ••• | 400 | 14 | 24 × 24 | `more`, `ink`; hit box 390 – 434 |
| **Photo** | 0 | 52 | **440 × 440** | Full bleed, 1:1, square corners, the 1 pt `photoEdge` inset, `wash` before decode |
| Gallery marker (galleries only) | right 12 | top 12 | 30 × 22 | The existing MediaMarker: solid `ink`, a 1 pt white ring, "1/3" in Inter 500 11/14 tabular, radius 2. The inset changes from 8 to **12**. |
| **Actions row** | 0 | 492 | 440 × 44 | |
| Heart | 16 | 501 | 26 × 26 | `heart`. Outline, or **solid `ink` when liked**: the shape carries the state, with no red. Hit box 7 – 51. |
| Comment | 60 | 501 | 26 × 26 | `comment` (existing glyph). Hit box 51 – 95. |
| Share | 104 | 501 | 26 × 26 | `send` (the existing paper plane). Hit box 95 – 139. |
| Save | 398 | 501 | 26 × 26 | `bookmark`, solid when saved. Hit box 389 – 433. |
| Gallery dots (galleries only) | centred on 220 | 511 | 6 pt dots, 4 gap | Current dot `ink`, the rest `rule`. Decorative and hidden from VoiceOver: the marker and the photo's label carry the position. |
| **Liked by** | 16 | 536 | row 22 tall | |
| Faces (1 to 3) | 16, stride 14 | 536 | 22 outer each | An 18 pt avatar in a 2 pt `page` ring. Each overlaps the one before by 8, and the later face is drawn on top. |
| Line | 8 after the faces (46 with one face, 74 with three) | 538 | × 18 | Inter 400 13/18 `ink`: "Liked by **maya.pours** and **23 others**" (the names and "N others" in 600) |
| **Caption** | 16 | 562 | 408 × 18 or 36 | Inter 400 13/18 `ink`. Starts with the author's username in 600. Collapsed to **2 lines**, ending "… **more**", with "more" in `muted`. Opened in place: 108 for the Paper Plane caption. |
| **View all N comments** (only when N > 0) | 16 | +4 | 408 × 18 | Inter 400 13/18 `muted` |
| **Time** | 16 | +4 | 408 × 18 | Inter 400 13/18 `muted`, the words from `timeAgoSpoken` ("2 hours ago") |
| Post foot | | | 14 | Space only, then the next header |

Post heights: 616 with a one-line caption and no comments; 656 with two lines and comments; 728 with the caption opened.

Scroll offsets: `scrolled` and `caption` are both at **681**. That puts post 2's header at y 146, its photo at 198 – 638, its actions at 638 – 682 and its liked-by row at 682 – 704. The caption is at 708 (36 tall, or 108 opened), the comments line at 748 (820 opened) and the time at 770 (842 opened).

### 2.5 Tab bar (unchanged from build 20)

An opaque `page` slab from 873 to 956 with a 49 pt row, glyph centres at y 897.5 and x 44 · 132 · 220 · 308 · 396.

- Home is the solid glyph in `ink`.
- Dex and My Bar are outlines in `muted`, as FloatingTabBar draws them.
- The + is a 52 × 38 `ink` key, radius 4, with a 22 pt white plus.
- Profile is a 26 pt avatar.
- There is no rule and no labels.

---

## 3. Type, colour, contrast, rules

- **No new type size.** Everything is the app's existing three sizes: 28/34 (the wordmark), 13/18 (all post and story text) and 17/24 (unused here). Inter 13 sets about as large as Instagram's 14 pt SF, because Inter's x-height is taller. Playfair appears only in the wordmark and the drink line. There is no uppercase anywhere.
- **Colour pairs:**
  - `ink` on `page` is 19.80:1: usernames, drink names, the caption, the liked-by line, every glyph.
  - `muted` on `page` is 6.69:1: "more", "View all 12 comments", the time, "Your story", seen names and resting tab glyphs.
  - White on `ink` is 19.80:1: the + badge, the tab +, the "1/3" marker.
  - The unseen ring (`ink`) passes 3:1 as a UI mark.
  - The seen ring (`rule`, 1.74:1) is decorative. The state is also carried by the ring's weight (2 → 1) and the name's tone (`ink` → `muted`).
- **Shapes:**
  - Avatars, story rings, the + badge, the unread dot and the gallery dots are round.
  - The create glyph's frame, the "1/3" marker (radius 2) and the tab + (radius 4) are squared. There is no pill anywhere.
- **Targets:**
  - Every glyph sits in a 44 × 44 box. The three on the left abut, at 7 · 51 · 95 · 139.
  - The liked-by line takes 11 pt of hitSlop above and below.
  - The whole caption is one target that opens it, with a nested username that opens the profile.
  - Each story is an 80 × 96 target.

---

## 4. Elements and the data behind them

| Element | Data | Status |
|---|---|---|
| Wordmark, create, Activity heart and its dot | `router.navigate('/log')`, `/activity`, the `unread` that index.tsx already computes | **Exists.** The create glyph is new art. |
| Story discs and rings | `pours` and `groupPours` (unseen first, newest photo), the `seen` store | **Exists** |
| "Your story" + badge | `mine` / `you` items in TodaysPours | **Exists.** The label and badge are new UI. |
| Header avatar | `author.avatarPath` / `accent` → `Avatar` | **Exists** |
| Header story ring | Whether the author has an unseen pour today: `groupPours(pours, myId, seen, now)` | **Derivable**: no server work, but index.tsx has to pass it in |
| Username | `author.username` | **Exists** |
| Drink line | `getDrink(post.drinkId).name` | **Exists** |
| Place after the drink | — | **Missing.** Posts have no location column (already noted in v4's open items). Not drawn in the frames. |
| Photo, gallery marker, dots | `photoPaths` / `photoPath`, `index` | **Exists** |
| Photo aspect | `layout.feedPhotoAspect` | **Exists** (a token). Per-post aspect is not stored, so every post crops to the same frame. |
| Heart, double-tap burst | `likedByMe`, `likes`, `toggleLike` | **Exists** |
| Comment glyph | — | **Missing**: there is no comments table and no thread. `Post.commentCount` exists but is always 0 (`lib/social.ts` line 170). |
| Share glyph | The card's existing `share()` (system share sheet) | **Exists**. It moves out of the ••• menu. |
| Save | `savedByMe`, `toggleSave`, `savesSupported()` (migration 017) | **Exists** |
| Liked by, one face | `post.likedBy` from `post_like_summaries` (migration **021, still unapplied**) | **Exists once 021 is applied**. Until then the row reads "**24 likes**" and is not tappable. |
| Liked by, faces 2 and 3 | — | **Missing**: 021 returns one liker per post. 021 is not applied yet, so amend it to return up to three before applying, rather than adding a 022. |
| Liked-by → likers sheet | `LikersSheet` (021's `post_likers`) | **Exists**. It opens from the whole line now, not from the count. |
| Caption, "more" | `post.caption`, `isBlankCaption` | **Exists**. The feed hides it today, and it comes back. The open/closed state is local to the card. |
| View all N comments | — | **Missing** (the comments again) |
| Time | `post.createdAt` → `timeAgoSpoken` | **Exists**. It moves from the ••• sheet's header back onto the card. |

---

## 5. What changes in the code

No app code was edited for this mock. This is the build list.

### 5.1 `src/components/PostCard.tsx`

- **Remove from the feed variant:**
  - the line under the print (`line`, `nameTarget`, `byline`, `bylineText`, `NAME_*`);
  - the count button (`count`, `countText`);
  - the band arithmetic (`ACTIONS_BAND`, `BAND_SLACK`, `ACTIONS_INSET`).
- **Photo**: `printW = width` (it was `width - 2 * layout.gutter`), so `mediaH = width / feedPhotoAspect`, which is 440. Drop `printFeed`'s centring. `Print` keeps the photo edge and the wash.
- **Header** (new `PostHeader`, also used by the detail variant in place of `AuthorIdentity`):
  - a 52-tall row, `paddingLeft 16`, `paddingRight 6` (so the 24 pt ••• ends at 424);
  - the avatar 32, inside a 40 `StoryRing` when `story === 'unseen'`;
  - a text column 12 after it: username (`textRole.small` + `fonts.bodySemiBold`, `ink`, one line) over the drink (`fonts.displayBold` 13/18, `ink`, one line);
  - **taps**: the avatar opens the story viewer when there is a story, otherwise the profile; the username opens the profile; the drink opens the drink page; ••• opens the menu.
  - Spoken: "ines.ag, Negroni, 2 hours ago".
- **Actions** (44 tall, `paddingLeft 7`, `paddingRight 7`):
  - `HEART` 28 → **26** and `GLYPH` 24 → **26**, so all four glyphs are the same size;
  - order: heart, comment, share (`send` → `share()`), spacer, bookmark (only with `canSave`);
  - gallery dots in an absolute centred layer (`pointerEvents="none"`, hidden from VoiceOver).
- **Gallery marker**: `COUNT_INSET` 8 → 12.
- **Liked by** (new `LikedBy`):
  - minHeight 22, `paddingLeft 16`;
  - faces: up to three `Avatar` 18 in 22 `page` rings, 14 apart;
  - the text uses `textRole.small` with nested 600 spans: "Liked by **{name}** and **{formatCount(likes − 1)} others**", or "and **1 other**";
  - with no name to show (`likedBy` null or undefined) it reads "**{n} likes**";
  - with 0 likes there is no row;
  - it is a Pressable that opens `LikersSheet` only when `listable`.
- **Caption** (new):
  - margin-top 4, padding 16, `textRole.small` `ink`, the username as a nested 600 Text that opens the profile;
  - collapsed to 2 lines with an inline "… more" in `textMuted`;
  - **work out the cut before layout** with `lib/textFit`'s `textWidth` (as NotInDexYet's local `lineCount` does; lift it into textFit), so the cell's height is known and the virtualised list never jumps;
  - a tap opens it in place. The state is keyed by `post.id`, as the like `flip` is, so a recycled cell cannot open on someone else's caption.
- **Comments line**: only when `post.commentCount > 0` ("View all 12 comments"; "View 1 comment"). It opens the thread.
- **Time**: `timeAgoSpoken(post.createdAt)` in `textMuted`, under the comments line.
- **Spacing**: `cardFeed` `paddingBottom` 14.
- **••• menu**: drop `Share` (it is the glyph now). The sheet's header can drop the time (it is on the card).
- **Detail variant**: render the same card with the caption opened and no "more". `cardDetail`, `detailName` and `actionsDetail` retire, and the post page keeps its back bar.
- **New props**: `story?: 'unseen' | 'seen'` and `onOpenStory?: (authorId: string) => void`.

### 5.2 `src/app/(tabs)/index.tsx`

- `styles.header.paddingBottom`: `layout.group` (24) → **0**. The tray has its own 8 pt foot, and the first header follows it.
- **Story map**: `const story = storyMap(groupPours(pours, myId, seenMarks, Date.now()))`, an `authorId → 'unseen' | 'seen'` lookup. Pass `story={story[item.post.authorId]}` and `onOpenStory={openPours}` to `PostCard`, and add both to `renderItem`'s deps. The `seen` marks come from the store TodaysPours already reads (`useSeen((s) => s.pours[myId])`).
- Pass `onPost={openLog}` to `HomeChrome`.
- `HOME_BAR_HEIGHT` (now 45) still drives the spacer and `progressViewOffset`. Nothing else changes there.
- The windowing (`initialNumToRender 2`, `windowSize 5`) holds: posts are 616 – 656 tall, about the same as build 20's.

### 5.3 `src/components/home/HomeChrome.tsx`

- **The row**: draw Home's own row rather than `ScreenTopBar size="lg"`, because the lg row is fixed at 52 high with a 24 gutter:
  - height **44**, `paddingLeft 16`, `paddingRight 7`;
  - the wordmark, a flex spacer, then `<TopBarButton icon="create" label="Post a drink" onPress={onPost} />` and `<TopBarButton icon="heart" label="Activity" badge={unread} onPress={onActivity} />`.
- `HIDE` = 44 + 1. Everything else (native-driven hide, rule fade, status strip) is unchanged.
- **Props**: add `onPost`.

### 5.4 `src/components/home/TodaysPours.tsx`

- **The story token**: `layout.story` becomes `{ ring: 66, ringWidth: 2, seenWidth: 1, gap: 3, slot: 80 }`, which gives a 56 disc. `perRow` goes.
- **Slots**: fixed 80-wide slots. The rail's `paddingHorizontal` is `12 − (80 − 66) / 2` = **5**.
- **Spacing**: `RAIL_TOP` 8 under the bar foot, label `marginTop` 4 (was 8), and a rail `paddingBottom` of 8.
- **Rings**:
  - unseen keeps its 2 pt `ink` ring;
  - **seen gets a 1 pt `rule` ring** (today it has none);
  - your own story with photos gets the 1 pt ring too.
- **`you` (no post today)**: the label is "**Your story**" (was "You") in `textMuted`, and the **+ badge** is drawn at ring-box offset 38, 38 (28 outer). It still opens `/log`.
- **`mine`**: your newest photo, labelled "Your story", with no badge.
- `find` is unchanged.

### 5.5 Elsewhere

- `src/constants/theme.ts`:
  - `feedPhotoAspect: 4 / 5` → **1**;
  - the `story` token above.
- `src/components/icons.tsx`: a new outline `create` glyph: `<Rect x={3.6} y={3.6} width={16.8} height={16.8} rx={4} />`, `<Path d="M12 8v8" />`, `<Path d="M8 12h8" />`. The `bell` is then unused on Home.
- `src/components/home/NotInDexYet.tsx`: `PRINT_H` reads `feedPhotoAspect`, so its prints turn square (136 × 136) with the token change. Pin it to `4 / 5` locally if the row should stay portrait. It keeps its place after posts 5 and 15, as Instagram's "Suggested for you" row does.
- `src/lib/social.ts`: add `likers?: UserProfile[]` (up to 3) beside `likedBy`, from the amended `post_like_summaries`. `commentCount` gets a real count only once comments exist.
- `LikersSheet`, `FloatingTabBar` and `groupPours` are unchanged.

### 5.6 Server and product work that the mock assumes

1. **Comments.** These need:
   - a `comments` table (post, author, body, created_at) with RLS mirroring `posts_read`, symmetric blocks included;
   - delete for your own comments and for the post's author;
   - Report on comments, because App Review's UGC rules cover them as they cover posts;
   - a count as an embedded aggregate in the feed query, as `likes` has;
   - a thread sheet with a composer;
   - an Activity entry.

   This is its own package. **Until it ships, the card draws no comment glyph and no "View all" line**: the row reads heart · share … save, with no dead control.
2. **Migration 021**: apply it, after amending `post_like_summaries` to return up to three likers per post. Keep its rule: people you follow first, then the newest, never you, never anyone blocked either way.
3. **Place** (optional): a nullable, length-capped `posts.place`, a field in the + window's compose step, and the header line "Negroni · Old San Juan". Without it, the header's second line is the drink alone, as drawn.

---

## 6. Choices made, and the other way round

- **1:1, not 4:5.** At 4:5 a post is 110 pt taller (550). At rest you would see only post 1, down to its actions, against the brief's "two posts visible". User photos are portrait phone shots, so 1:1 crops more off their top and bottom than 4:5 did. Swapping back is one token.
- **Story discs show the drink, not the face.** Instagram shows faces. Sipply's tray already shows each person's newest photo (signed and primed in one batch), and most accounts have no photo avatar, so a tray of grey silhouettes would say nothing. Faces are one swap (`Avatar` in place of `PourFace`).
- **Activity is a heart again.** The brief and Instagram use the heart. v4 moved Activity to the bell so that a heart meant only "like". Keep the bell if that matters more; it is one prop.
- **The + appears twice.** The create glyph in the bar repeats the tab bar's + key. Drop the bar one if a single + is enough; the heart then sits alone at the right.
- **16 gutter on Home, 24 elsewhere.** Instagram's text sits 12 to 16 in. Home's wordmark therefore sits 8 left of the other tabs' titles when you swipe between them.
- **The sixth story ring is cut by the edge**, as on Instagram, instead of the v4 judges' "five whole rings". The cut is what says the row scrolls.
- **Home's bar is 44, as Instagram's is**, against 52 elsewhere. That is part of what lets post 2's header show at rest.
- **Seen names stay `muted`** (Daylight). Instagram keeps every name black. Muted is a second cue beside the ring.
- **Element count at rest goes from 27 to 38.**
  - Bar: 3.
  - Tray: 6 discs, 6 names and the badge (13).
  - Post 1: 13.
  - Post 2's header: 4.
  - Tab bar: 5.

  Jan asked for "less stuff" on 9 Oct; this is his newer ask. If 38 feels busy, cut in this order: the bar's +, the header's story ring, the gallery dots.

## 7. Mock stand-ins

- The post and story photos are the shipped daylight prints (`assets/drinks/*.webp`), standing in for users' own photos, zoomed slightly (1.12 to 1.18) to frame the glass.
- Profile photos are grey Daylight tones with a white silhouette (no initials, so no capitals).
- Names follow the earlier v4 mocks. Captions, like counts and times were written for the mock.
- Post 2's "1/3" marks a three-photo gallery; only its first photo is drawn.
- The caption is cut at two lines by measuring in the browser. The app should get the same result from `lib/textFit` before layout.
