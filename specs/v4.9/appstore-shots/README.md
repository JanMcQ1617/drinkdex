# v4.9 · App Store screenshots

App Store Connect wants a 6.9" iPhone set: portrait PNGs at **1320 x 2868**
(1290 x 2796 is also taken), up to 10, with no alpha channel. Every smaller
iPhone size is drawn from that set, so it is the only one to make.

`scripts/appstore-shots/compose.mjs` turns raw phone screenshots into that
set in Sipply's own look. The raw screenshots are Jan's to take (below):
nothing here is a finished listing image until they exist. The two files in
`samples/` are the proof that the pipeline runs, made from plain grey
placeholders.

## The one command

From the repo root, with the five screenshots in a folder and named as in
`captions.json` (`dex.png`, `recipe.png`, `post.png`, `home.png`,
`saved.png`; `.PNG`, `.jpg` and `.heic` are fine too):

```sh
node scripts/appstore-shots/compose.mjs ~/Desktop/sipply-shots
```

It writes `~/Desktop/sipply-shots/composed/01-dex.png` to `05-saved.png`,
numbered in upload order. Drag them in that order into App Store Connect →
the version → **iPhone 6.9" Display**.

The captions come from `~/Desktop/sipply-shots/captions.json` if there is
one, otherwise from this folder's `captions.json`. To change a caption,
copy that file into the screenshots folder and edit it there; to keep the
phone's own file names (`IMG_4127.PNG`), use them as the keys instead. A
key's order is the upload order. A `\n` in a caption forces a line break.

Options: `--captions <file.json>`, `--out <folder>`, `--size 1290x2796`,
`--keep-html` (keeps the pages it drew, to open in a browser).
`--demo` remakes `samples/`.

It refuses, with a sentence saying why:

- a screenshot that is not a full-screen portrait iPhone shot (19.5:9:
  1320 x 2868, 1206 x 2622, 1179 x 2556 and the like). A cropped or
  resized one would sit wrong in the frame.
- a caption with a word guideline 1.4.3 rules out (the list is `NEVER` in
  the script, taken from the build 25 rewrite in `docs/appstore.md`),
  with a character outside the fonts' Latin subset (an emoji, say), or
  too long for two lines even at 30pt.
- more than 10 shots, or a key with no image, or with two.

It notes, without stopping: an image in the folder that no caption names,
a caption in Title Case, and a screenshot narrower than its frame (it
would be enlarged and look soft).

## What a finished shot looks like

At 440 x 956pt (the canvas is drawn at 3x):

| Part | What | From |
|---|---|---|
| Ground | white, the page's `bg` | `theme.ts` |
| Caption | Inter 600 in ink at the gutter (24), top at 64, one or two lines, balanced; 40/49 tracked -0.57 at most | `textRole.title` (28/34, -0.4) times size / 28 |
| Swash | `penSwash(56)` times the same size / 28, in length and weight (k), 1 x k right of the caption's left edge, its box 8 x k under the last line's foot | `penPath.ts`, `PEN.swash` |
| Frame | the screenshot as taken, centred, its corners a screen's (width x 55/440), a 1pt `hair` ring over it so a white screen still has an edge | `theme.ts` `hair`, `bgSunk` under it |
| Signature | the tagged wordmark, drip-less cut, 30pt box, centred on its ink, 26 above the foot | `brand/paths.ts` `WORDMARK_SM_PATH` |

The whole set takes one caption size, the largest from 40 down to 30 at
which every caption fits in two lines, so every frame sits at the same
height. The five drafts all fit at 40.

Red appears twice on a tile, the swash and the name, plus whatever red the
screenshot itself shows (the Dex key, a caught plate, a liked heart).
No device bezel, no status bar of its own, nothing that is not in the
app: guideline 2.3.3 wants screenshots that show the app in use, and a
listing that draws more than the app does is the kind of thing review
sends back.

Why the swash hangs lower than in the app: under a one-word tab title
("Dex") it sits 2pt into the line box and reads as the title's flourish.
Under a sentence, at that height, it reads as underlining whatever letters
it ends beneath (it underlined "the s" of "the story" in the first
render). Dropped clear of the descenders, it is the lockup's mark again.

## The shot list

Five screens that show what the app is for, in this order: the first three
are the ones search results show. They are the five, in the order, of
`docs/appstore.md`'s own list (Screenshots). Take each on the build going
to review, so nothing in the listing is missing from the app.

| # | File | Screen | Have on it |
|---|---|---|---|
| 1 | `dex` | **The Dex** tab (the red key in the middle) | The grid with photographs showing, scrolled a little so prints fill it. For you or By number, either. A modest caught figure is fine (it is the app's own); do not pick a moment that makes the count the subject. |
| 2 | `recipe` | **A drink page**, scrolled to its Recipe | A classic cocktail that has a photo and that you have caught (the red Nº plate, its drip), with the Recipe measures on screen and the start of the Origin story under them. |
| 3 | `post` | **Posting a drink**: the post sheet | A photo attached, a caption typed and the keyboard dismissed, a place tagged (a public venue, never a home address), "Save & post" in view. Needs build 33's places (iOS 18 or later, migration 026). |
| 4 | `home` | **Home**, the feed | The stories row and its rule, then one post: the photo, like, share and save, a caption about the drink. |
| 5 | `saved` | **Saved**, collections | Three or four named collections with covers, two to a row. Needs migration 023. |

### No Tournaments shot

Every screen of the feature either ranks people by the drinks they have
posted or sets the race to post the most, and App Review reads a picture
as it reads the words under it:

- **The tab** (the trophy, `FriendsBoard`): each tournament card draws its
  top three, each with a rank and an entry count, and the Friends rows
  rank you and everyone you follow by how many different drinks each has
  posted: rank, face, username, "42 entries".
- **A tournament's page** (`tournaments/[id]`) is its leaderboard, and the
  full list's rows say "You're 2nd" or "Won by ana · 6 entries".
- **Host a tournament** (`tournaments/new`) has a Goal row whose chips
  read "Most entries by the end" and "First to 10 entries".

So every frame of it is the tournament "won by whoever tries the most
different drinks" that build 25 took out of the description, and more of
a score than Dex progress, which `docs/appstore.md` keeps out of the
screenshots as the part most likely to read as one. A caption cannot fix
it: the composer's guard refuses "win", "the most" and "leaderboard" in
the words, and would pass a picture that shows all three. The feature is
disclosed where it belongs, in the review notes' Tournaments paragraph,
with its rules in full.

Nor in the background of another shot: no tournament card, standings,
Friends row or tournament invitation (Activity, Profile's •••) anywhere in
frame. The trophy in the tab bar is only the tab's icon and stays.

### How to capture

- **Phone.** Any Face ID iPhone. A 6.9" Pro Max gives 1320 x 2868, the
  set's own size; a 6.3" Pro gives 1206 x 2622, a 6.1" 1179 x 2556, and
  both are drawn down into the frame (about 920px wide at 40pt captions) with no loss.
- **Settings.** Light appearance, default text size (Larger Text off),
  Bold Text, Zoom and Smart Invert off.
- **Status bar.** Charge to 100% first, Wi-Fi on, and turn on Do Not
  Disturb so no banner lands mid-shot. Leave the clock alone: setting it
  back by hand can upset sign-in and every "2h" on a post. The composer
  keeps the status bar exactly as the phone drew it.
- **Signed in, with real-looking content.** Use an account whose posts
  are its own photos, with captions about the drink, never about how many
  or how much. Fill Saved and Home from test accounts you control.
- **Nobody's data without their OK.** A real friend's username, avatar,
  photo or face goes in a screenshot only if they have said yes. Test
  accounts are simpler. No phone numbers, emails or contact names on any
  screen (Find friends and Settings are not on the list for that reason).
- **The words on screen count too.** Guideline 1.4.3 reads the pictures
  as it reads the copy: no post caption or collection name about drinking
  more, rounds, a night out or a time to drink. "Recipes to write down"
  or "Gin classics" for a collection.
- **Take it with the side button and volume up**, then get the original
  to the Mac by AirDrop, which sends the full-size PNG. Not through
  WhatsApp, which shrinks and recompresses it.

## Caption drafts

In `captions.json`, all five fit at 40pt. Each is about the catalogue,
recipes, logging what you have had, saving, or friends, and none asks
anyone to drink, to try more, or to keep a count, which is guideline
1.4.3 as `docs/appstore.md` applies it to the rest of the listing.

| Shot | Draft | Alternative (fits at) |
|---|---|---|
| dex | A field guide to cocktails and spirits | A field guide to 2,089 drinks (40; recount `drinks.json` the day you submit) |
| recipe | The real recipe, and the story behind it | Every cocktail with its real recipe (40) |
| post | Log what you had, with photo and place | Log what you had, and where you had it (40) |
| home | Follow friends and see what they post | Follow friends and see their photos (40) |
| saved | Save drinks and sort them into collections | Save drinks into your own collections (40) |

What they stay clear of, and why (build 25 took each out of the listing):
"collect every drink you try" and "drinks waiting to be found" make the
Dex a list to drink through; "see what your friends are drinking" makes
other people's drinking the draw; a tournament "won by whoever tries the
most" makes drinking a score, which is why the set has no tournaments
caption or shot at all (above). Dex progress (Stats) is not in the set
for the same reason the listing does not point at it.

Each caption has to be true of the build it ships with: the post caption
needs places, saved needs 023. Without one of them, drop that shot and
its key.

## Files

- `captions.json`: the five drafts, keyed by file name, in upload order.
- `samples/01-dex.png`, `samples/02-recipe.png`: two finished 1320 x 2868
  RGB PNGs, made by `--demo` from `samples/raw/dex.png` (1206 x 2622) and
  `samples/raw/recipe.png` (1179 x 2556), plain grey placeholders.
- `scripts/appstore-shots/compose.mjs`: the composer.
- `scripts/appstore-shots/png.mjs`: image sizes and the alpha strip, no
  library.
