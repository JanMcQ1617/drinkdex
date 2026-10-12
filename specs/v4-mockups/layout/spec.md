# v4 layout: less stuff

9 Oct 2026. This answers Jan's third note on v4: "I want less stuff. it looks really clumped up and a lot of information". It follows "remake the whole colorscheme of the app to black and white … make everything look sleek and good looking" and "rework the positioning of things, I want it to be pseudo minimalistic".

This is the **positioning** layer. It does not pick a palette: Daylight (`../white`), Night (`../black`) and Split (`../split`) each map onto the five role tokens below. The wireframes are greyscale. The drink photographs stay in colour because they carry the character, and in the Dex a drink you have not caught yet shows as a grey proof.

Files:

- `index.html`: seven frames at 440 × 956. Add `#home`, `#dex`, `#bar`, `#post`, `#profile`, `#plus` or `#post-rest` to the URL to show one frame.
- `contact.png`: the wall at 1x.
- `wire-home.png`, `wire-dex.png`, `wire-bar.png`, `wire-post.png` (with the likers sheet open), `wire-profile.png`, `wire-plus.png` (mid-search, keyboard up), and `wire-post-rest.png` (post detail without the sheet), each at 2x (880 × 1912).
- `tools/render.sh`: renders them with a throwaway headless Chrome profile in this folder. It kills only processes carrying that profile path, then deletes the profile.
- Photos are read from `../white/img/`. The grey proofs in the wireframe are a CSS filter. In the app they are the baked proof files.

---

## 1. Principles

1. **Nothing is lost, it just isn't on screen at rest.** Every removed item is listed below with where it went: a tap, the post's •••, a sheet, the drink page or Settings.
2. **The photo and the drink name are the screen.** Big colour prints and Playfair names carry the look. Everything else is quieter, smaller or gone.
3. **Separate with space.** No rules, dividers, cards, panels or outlines. Groups are set apart by 24–32pt of air. The only filled surfaces are fields, keys and tiles.
4. **One side margin: 24pt.** Every left and right edge on every screen sits at x = 24 or x = 416. The stories row scrolls edge to edge, and the sheet and keyboard run full width.
5. **Three type sizes, plus Playfair for drink names** (§2). No kickers, range headers, eyebrows or uppercase.
6. **One obvious action per screen.** Feed: like. Dex: search. My Bar: "You can make 30 ›". Profile: Edit profile. Likers: Follow. + window: pick a result, then Post.
7. **A count appears once.** If a number is already on screen, it is not repeated nearby. For example, My Bar's quiet line says "12 in your bar" and leaves "30" to the row that opens the list.
8. **Top bars have a title or the wordmark, and at most one icon.** A pushed screen gets a back chevron and no other icon in the bar.
9. **No badges or tags** unless the tag is the point of the screen. Caught or not caught in the Dex is shown by the photo itself (colour or proof), not by a tag.

Hard rules kept: no uppercase text, squared keys (4pt radius; avatars, story rings and dots are round), WCAG AA on every text pair, no top gradients, drink photos in colour, and everything buildable with Views + react-native-svg + expo-image.

## 2. Type: three sizes

| Role | Face | Size / line | Tracking | Used for |
|---|---|---|---|---|
| **title** | Inter 600 | 28 / 34 | −0.4 | Tab-root titles ("Dex", "My Bar", "nico.pours") |
| **body** | Inter 400 · 500 · 600 | 17 / 24 | −0.2 | Rows, names, key labels (500), field text, counts, captions |
| **small** | Inter 400 | 13 / 18 | 0 | Story names, the quiet count beside a title, the feed author, the bio, "38 drinks in your Dex" |
| drink names | Playfair 700 | 28 / 34 on the feed and post · 17 / 24 in grids and lists | −0.2 | The wordmark "Sipply", and every drink name |

Playfair reuses the title and body sizes, so the app has three sizes in all. Weight changes inside body (400, 500, 600) carry emphasis instead of extra sizes. Plates, index labels, 11pt tab labels, kickers and rank numerals are gone.

## 3. Tokens and spacing

Palette-neutral roles. Each palette's own values drop in here.

| Role | Wireframe | Job | AA |
|---|---|---|---|
| `page` | #FFFFFF | Ground, bars, the sheet | — |
| `wash` | #F2F2F2 | Fields, unticked tiles, the secondary key, a photo before it loads | — |
| `muted` | #6B6B6B | Quiet text, placeholders, resting tab glyphs, not-yet drink names | 5.33 on page · 4.76 on wash |
| `ink` | #111111 | Text, ticked tiles, the primary key, the +, active glyphs | 18.9 on page · 16.9 on wash |
| `onInk` | #FFFFFF | Text on ink | 18.9 |

Night inverts `page` and `ink`. Split keeps the black chrome on the bars and the + window, but it can no longer use rules or the black head band on the pages. Each palette's own spec already gives its AA figures.

**Spacing (pt).** 4 · 8 · 12 · 16 · 24 · 32 · 48. Side margin 24. Grid gutter 24 (Dex), 12 (My Bar tiles) and 8 (Profile). Rows are 64 tall with 44 keys inside. A gap of 24–32 sets one group apart from the next.

**Fixed frames at 440 × 956.** Status bar 0–62. Top bar 62–114, with the title box at y 71–105 and the icon centred at y 88. Content starts at y 122. Tab bar 873–956: 49 for the bar plus 34 for the home indicator. The home indicator is 140 × 5 at y 942.

## 4. Shared pieces

**Tab bar: 10 → 5 elements.** Five glyphs, no labels. Centres are at x 44 · 132 · 220 · 308 · 396 and y 897. The bar has an opaque `page` ground with no rule, no shadow and no floating card.
- Resting tabs: 26pt outline glyph in `muted`. The active tab uses the same glyph filled, in `ink`.
- Profile is a 26pt avatar. When it is active, it gets a 1.5pt `ink` ring with a 2pt gap.
- The + is the only filled key: 52 × 38, radius 4, `ink`, with a 22pt white plus.
- Each tab keeps its name as `accessibilityLabel` ("Home", "Dex", "Post a drink", "My Bar", "Profile"). The labels are gone from the screen only. Swiping between tabs is unchanged.

**Top bar.** On a tab root, the title is set left at x 24, and the one icon is right-aligned to x 416 with a 44 × 44 hit area. If there is a quiet count, it sits on the title's baseline, right-aligned. A pushed screen has a back chevron at x 20 and nothing else.

**The post's •••.** It opens a sheet. The header line reads "ines.ag · 2h · La Factoría, Old San Juan". Its rows are Comment, Share, Save, View drink (Nº 0127, which opens the drink page) and Report. Your own posts also get Edit and Delete.

**Drink page** (unchanged screen, reached by tapping any drink name). It now holds everything the feed and grids used to stamp on: the Nº, caught or not yet, category, glass, origin and "friends who caught this".

---

## 5. Per screen

Counts cover the visible elements at rest: text runs, icons, keys, chips, tiles, photos, rules and tags. A key with its label counts as one element. The status bar and home indicator are not counted. The keyboard counts as one element. The "before" counts are taken from the clumped Daylight board (`../white/contact.png`). Night and Split have the same elements, give or take one.

### 5.1 Home: 44 → 27

**Before (44):** top bar 4 (wordmark, +, trophy, activity) · stories 13 (6 rings, 6 names, the "You" + badge) · post head 4 (avatar, "ines.ag · 2h", location, •••) · photo 1 · label 4 (name, Nº plate, "Spirit-forward · Florence, Italy", "In your Dex") · actions 4 (heart, comment, share, save) · likers line 4 (3 faces, "Liked by maya.pours and 12 others") · tab bar 10.

**After (27):** top bar 2 (wordmark, activity bell) · stories 12 (6 rings, the 6th cut by the edge, and 6 names) · post 7 (photo, drink name, author, heart, "24", save, •••) · the next post's photo peeking 1 · tab bar 5. The post block itself went from **17 to 7**.

| Went | Now lives |
|---|---|
| + in the top bar | The + tab |
| Trophy (rank) | Profile › "38 drinks in your Dex ›" opens progress and rank |
| "You" + badge | Tap your own ring. With no story it opens the camera, and with a story it plays it, with "Add" in the viewer |
| Author avatar and the post head row | The author's name moves to the right end of the drink-name line. The avatar is on the post detail |
| Dateline "2h", location | The post's ••• header line, and the post detail's ••• |
| Nº plate, "In your Dex", "Spirit-forward · Florence" | The drink page (tap the drink name) |
| Comment, share | The post's ••• (Comment, Share) |
| Faces + "Liked by maya.pours and 12 others" | Tap the count "24" to open the likers sheet |
| Caption | The post detail (tap the photo). The feed shows no caption, which is under the budget's one-line allowance |

**Measurements.** Wordmark: Playfair 28/34 at x 24, y 71. Bell: 26pt at x 390, y 75. Stories: rings are 62 across with a 78 pitch from x 24 (an `ink` 2pt ring when unseen, a #C9C9C9 1pt ring when seen), y 122–184. Names: small, centred in a 78-wide box, y 192–210. Photo: 392 × 490 (4:5) at x 24, y 232, radius 2. Line: y 738–772, with "Negroni" in Playfair 28 left and "ines.ag" small `muted` right, sharing a baseline. Action row: y 786–816, with the heart (28pt) at x 22, "24" in body at x 58, save (24) at x 348 and ••• (24) at x 392. The next post's photo starts at y 848, a 32 gap.

### 5.2 Dex: 58 → 25

**Before (58):** top bar 2 (title, chart icon) · gauge 11 ("38", "in your Dex", "of 2,089 · 1.8%", "latest catch", "Ramos Gin Fizz", the ruler, 5 tick labels) · search 3 · chips 5 · range headers 6 (3 labels, 3 rules) · tiles 21 (9 photos, 6 plates, 6 names) · tab bar 10.

**After (25):** "Dex", "38 / 2,089" 2 · field 4 (field, glass icon, placeholder, filter icon) · tiles 14 (6 photos and 6 names, plus 2 photos cut by the bar) · tab bar 5. Chrome **37 → 11**. The tiles got bigger: 184 instead of 120.

| Went | Now lives |
|---|---|
| Chart icon, the gauge, "1.8%", ruler and ticks, "latest catch" | Tap "38 / 2,089" (or Profile › "38 drinks in your Dex ›") to open Dex progress: the ruler, the rank, the latest catch and "See your 38" |
| Chip row: All · Cocktails · Spirits · Collected · Not yet | The filter icon inside the field opens a sheet with the same choices. When a filter is on, the icon is filled and the quiet count reads the filtered total ("12 / 1,190") |
| Range headers "0001 – 0003" and their rules | The Nº rail. It appears at the right edge only while you scroll, and the thumb shows "0127". Drag it to jump |
| Nº plates on every tile | The drink page. Typing a number in the field ("127") jumps the grid to Nº 0127 and outlines that tile for 1s |
| Caught and not-yet tags | The photo: a colour print means caught, and a grey proof with a `muted` name means not yet |

**Measurements.** Title row y 71–105, with "38 / 2,089" small `muted` tabular, right-aligned on the baseline. Field: 392 × 44 at y 122, `wash`, radius 4. It holds a 20pt glass at x 36, "Search a name or number" in body `muted`, and the filter icon (22pt) at x 386, which gets its own 44 × 44 hit area. Grid: 2 columns of 184 with a 24 gutter (x 24 and 232). Photo 184 × 184, radius 2. Name: Playfair 17/24, 8 below the photo, one line, truncated. Row pitch 246 (184 + 8 + 24 + 30), so rows start at y 190, 436 and 682. The third row's names sit under the tab bar at rest. Nº rail (while scrolling): 24 wide at x 412–436, with the thumb a 44-tall `ink` tag carrying small white figures.

### 5.3 My Bar: 71 → 31

**Before (71):** title + "What's in your bar?" + quiet line 3 · search 3 · chips 7 (6, plus the count inside "In your bar 12") · tiles 24 (6 × tile, checkbox, "in 173 drinks", rank numeral) · overflow line + "Show 20 more" 2 · "You can make" + 30 + "See all" 3 · strip 12 (4 photos, 4 plates, 4 names) · "One ingredient away" + 161 + row (thumb, name, plate, needs-line, "+ Orange") 7 · tab bar 10.

**After (31):** "My Bar", "12 in your bar" 2 · "You can make 30" + chevron 2 · "Add orange → 5 more drinks" 1 · field 3 · tiles 18 (name only) · tab bar 5. The tiles are the screen's point, so they get the room. The chrome around them went **47 → 13**, and the visible tiles went from 6 to 18.

| Went | Now lives |
|---|---|
| "What's in your bar?" | Gone. The title says it |
| "makes 30 drinks" in the quiet line | Said once, by the row "You can make 30 ›" |
| Chips: All · In your bar · Spirits · Citrus · Liqueurs · Bitters | Ticked tiles always sort first, so "In your bar" is the top of the list. Categories come from search: typing "citrus" lists the citrus |
| "in 173 drinks" per ingredient, rank numerals 01–06 | Press and hold a tile to open the ingredient sheet: "in 173 drinks", plus what it unlocks for you. The order is still by usefulness, unnumbered |
| "Sweet vermouth, Dry vermouth and 482 more", "Show 20 more" | The tile list scrolls, and the rest of the 490 come through the search field |
| The "You can make" photo strip, its plates and "See all" | Tap "You can make 30 ›" to open the list as photos and names, in the Dex's grid style |
| The "One ingredient away 161" list and "+ Orange" | Tap the suggestion line to open the ranked "one bottle away" list. Orange is first, and each row has its + key. Ticking the Orange tile does the same |

**Measurements.** Title row y 71–105, with "12 in your bar" small `muted` on the baseline. Make row: y 122–170 (48 hit), with "You can make 30" in body 600 at y 134 and a chevron (22pt) right-aligned to x 416. Suggestion: y 174–198, with "Add orange" in body 500 `ink` and "→ 5 more drinks" in body `muted`. A 32 gap follows. Field: 392 × 44 at y 230. Tiles: 2 columns of 190 with a 12 gutter (x 24 and 226), each 52 tall at a 64 pitch from y 298, radius 4, label in body at 16 inset. Ticked tiles are `ink` with `onInk` text. Unticked tiles are `wash` with `ink` text. Tapping toggles a tile. This is state, not a key, so it is not the screen's primary action.

### 5.4 Post detail + likers sheet: 42 → 25 (sheet open) · 9 at rest

**Before, sheet open (42):** top bar 3 (back, "Post", •••) · behind the sheet 4 (avatar, "theo_stirs · 5h", "Home bar, Santurce", photo) · sheet head 4 (grabber, "Liked by", "24 people liked theo_stirs's Paper Plane", Nº plate) · search 3 · rows 28 (6 avatars, 6 names, 6 handles, 4 "In their Dex" tags, 5 keys, "(you)").

**After, sheet open (25):** back 1 · behind the sheet 4 (avatar, name, •••, photo) · grabber 1 · "Liked by" 1 · rows 18 (6 avatars, 6 names, "(you)", 5 keys).

**After, post detail at rest (9):** back · avatar, name, ••• · photo · drink name · full caption · heart, "24".

| Went | Now lives |
|---|---|
| "Post" title | Gone. The drink name is the page's title |
| ••• in the top bar | Moves into the screen, at the end of the author row (the bar holds only the back chevron) |
| "5h", "Home bar, Santurce" | The ••• header line |
| Save (feed only) | The post detail's ••• (Save). The feed keeps its save icon |
| Sheet sub-line, Nº plate | The count "24" is on the post, and the drink name is on the post |
| Sheet search | Appears only at the full detent when more than 50 people liked the post |
| Handles, "In their Dex" tags | That person's profile (tap the row). The drink page's "friends who caught this" |

**Measurements, post detail.** Back chevron 24pt at x 20, y 76. Author row y 122–154: a 32 avatar at x 24, the name in body 600 at x 68, ••• right-aligned to x 416. Photo 392 × 490 at y 170. Drink name: Playfair 28/34 at y 684. Caption: body, full length (here 2 lines), y 726. Heart (28pt) + "24" at y 790. There is no tab bar on a pushed screen.

**Measurements, sheet.** Scrim `ink` at 38%. The sheet is a medium detent from y 436 to 956, radius 12 at the top. Grabber 36 × 5 at y 444, #C9C9C9. "Liked by" in body 600 at x 24, y 468. Rows at a 64 pitch from y 516: a 44 avatar at x 24, the name in body at x 84 (truncated at 200), and the key 116 × 36 right-aligned to x 416. "Follow" is `ink` with `onInk` text. "Following" is `wash` with `ink` text. Your own row has no key, only a `muted` "(you)". Swiping up goes to the full detent at y 62.

### 5.5 Profile: 50 → 31

**Before (50):** top bar 3 (username, +, gear) · avatar 1 · counts 6 (3 figures, 3 labels on two lines) · name, bio (2 lines) 2 · Edit profile, Share profile 2 · Dex panel 10 (panel, "38", "of 2,089 in the Dex · 1.8%", "First Sips", the ruler, 5 tick labels) · "171 more to Barfly in Training, at 209" 1 · Posts / Dex tabs + underline 3 · grid 12 (6 photos, 6 plates) · tab bar 10.

**After (31):** "nico.pours", ••• 2 · avatar 1 · name, bio 2 · counts on one line 6 · Edit profile 1 · "38 drinks in your Dex" + chevron 2 · grid 12 (9 whole photos, 3 cut by the bar) · tab bar 5. Chrome **38 → 19**.

| Went | Now lives |
|---|---|
| + in the top bar | The + tab |
| Gear | ••• › Settings |
| Share profile key | ••• › Share profile |
| The Dex panel, ruler, "First Sips", the rank ladder, "171 more to Barfly…" | Tap "38 drinks in your Dex ›" to open Dex progress (the same page as Dex › "38 / 2,089") |
| Posts / Dex tab strip and underline | The grid is the posts. Your caught drinks are on Dex progress › "See your 38" |
| Plates on the grid | The post detail and the drink page |
| Second line of the bio | One line, truncated. The full bio is in Edit profile and in ••• › About |

**Measurements.** Title "nico.pours" at y 71, with ••• (26pt) right-aligned. Avatar 80 at x 24, y 130. Name: body 600 at x 124, y 146. Bio: small `muted`, one line, truncated at 292 wide, y 174. Counts: one body line at y 234, with figures in 600 `ink`, labels in `muted`, and 28 between pairs. Edit profile: 392 × 44 at y 282, `wash`, body 500. It is the screen's only key (on someone else's profile this slot is Follow, in `ink`). Dex line: small `muted` with a 16pt chevron, y 344–362. Grid: 3 columns of 125.3 with an 8 gutter from y 386, square, radius 2, no plates.

### 5.6 + window: 35 → 18 (mid-search)

**Before (35):** X, "Post a drink" 2 · your photo beside the field, field, glass, text, clear 5 · "8 drinks", "sorted by best match" 2 · rows 25 (6 thumbs, 6 names, 6 plates, 6 subtitles, one "In your Dex") · keyboard 1.

**After (18):** X 1 · field 4 (field, glass, typed text, clear) · rows 12 (6 thumbs, 6 names) · keyboard 1.

| Went | Now lives |
|---|---|
| "Post a drink" title | Gone. The X and the field explain the window, and the + tab is labelled for VoiceOver |
| Your photo beside the field | Step 2, after you pick a drink |
| "8 drinks", "sorted by best match" | Gone. The order is still best match |
| Nº plates, "Spirit-forward · Florence", "In your Dex" | The drink page. When two results share a name, only those two show a small `muted` subtitle |
| "Not the one? Add 'neg'" | The last result row, "Add 'neg' as a new drink", reached by scrolling the results |

**Measurements, mid-search.** X (24pt) at x 22, y 76. Field 352 × 44 at x 64, y 66, `wash`, in the top-bar row, so the window has no bar above it. Results from y 130 at a 68 pitch: a 52 thumb at x 24 (a drink with no photo shows a `muted` glass outline on `wash`) and the name in Playfair 17 at x 92. The keyboard starts at y 610, with a 72pt clear gap above it.

**After picking (not drawn; same budget).** The top bar has a back chevron and the chosen drink's name in Playfair 17 as its title. Photo 392 × 490 at y 122. A tap opens the camera or library, and an empty slot shows a camera glyph on `wash`. Caption field: 392 × 88 at y 636, `wash`, body, placeholder "Say something about it". Post key: 392 × 52 at y 860 (or 16 above the keyboard), `ink`, "Post" in body 500. Nothing else.

---

## 6. Element count summary

| Screen | Before | After | Change |
|---|---|---|---|
| Home | 44 | 27 | −39% (post block 17 → 7) |
| Dex | 58 | 25 | −57% (chrome 37 → 11) |
| My Bar | 71 | 31 | −56% (chrome 47 → 13, tiles 6 → 18) |
| Post + likers | 42 | 25 | −40% (at rest: 9) |
| Profile | 50 | 31 | −38% (chrome 38 → 19) |
| + window | 35 | 18 | −49% |

Elements that stayed are mostly photos and drink names. Text runs, plates, tags, chips and rules dropped by roughly two thirds.

## 7. New surfaces this adds (all reached by one tap)

- **Dex progress page**, from Dex's "38 / 2,089" and Profile's "38 drinks in your Dex ›". It holds the gauge, the rank ladder, the latest catch, "171 more to Barfly in Training" and "See your 38". It reuses the ruler from the palette specs.
- **Dex filter sheet**, behind the field's filter icon: All, Cocktails, Spirits, Caught and Not yet, with their counts.
- **Post ••• sheet**: the header (author · time · place), then Comment, Share, Save, View drink, Report, and Edit and Delete on your own posts.
- **Ingredient sheet**, from a long press on a My Bar tile: "in N drinks" and what it unlocks.
- **"You can make" list** and **"One bottle away" list**, from My Bar's two lines.
- **Profile •••**: Share profile, Settings, About.

## 8. Build notes (React Native)

- Everything above is `View` + `Text` + `expo-image` + `react-native-svg` glyphs. Nothing here needs blur, gradients, masks or shadows.
- The tab bar drops its labels and its floating card. Set `tabBarShowLabel: false` and pass each tab's `accessibilityLabel`. The active state swaps the outline glyph for the filled glyph.
- Dex grid: a `FlashList` with `numColumns={2}` and a fixed 246 row pitch, so `getItemLayout` makes number jumps O(1). The Nº rail mounts on `onScrollBeginDrag` and fades out 1.2s after `onMomentumScrollEnd`.
- Grey proofs come from the baked proof files, not a runtime filter. Size images to their frames (184 and 125, at @3x) with `enforceEarlyResizing`, as in build 13.
- Keep hit areas at 44 × 44 or more even where a glyph is 24 (save, •••, filter, chevrons).
