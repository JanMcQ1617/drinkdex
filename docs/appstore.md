# App Store listing copy

Paste these into App Store Connect. Written to be pasted, not edited.

Character limits are Apple's; the counts in brackets are what these
actually use, so there is room to fiddle without going over.

Every number here was counted out of `src/data/drinks.json` rather than
remembered. If the Dex grows before you submit, recount — an inflated
number in a listing is the kind of thing that is easy to write and
awkward to defend. So is an example drink the Dex no longer has, which
is why the description only names entries that are in the file.

Recount whenever `scripts/*data` changes, from the repo root. It prints
the total, then a count for each category:

```sh
node -e 'const d=require("./src/data/drinks.json"),c={};for(const x of d){c[x.category]=(c[x.category]||0)+1}console.log(d.length,c)'
```

Then check every drink the description names by searching the file for
it, and recount the bracketed lengths after any edit.

---

## App Name — 30 max

```
Sipply: Drinkdex
```

[16] The bare name "Sipply" is taken on the App Store, so the listing
name is "Sipply: Drinkdex". If App Store Connect still shows an older
name, replace it with this one. Only the App Store shows it: the name
under the icon on the home screen stays "Sipply", which comes from
`expo.name` in `app.json`.

Apple indexes the name for search, so "sipply" and "drinkdex" stay out of
the keywords.

---

## Subtitle — 30 max

```
Cocktail recipes and spirits
```

[28]

Alternatives, same length class:

```
A field guide to 2,089 drinks
```
[29]

```
A drink diary and recipe guide
```
[30]

The subtitle is the line people read in search results, so it names what
the app holds and never a drink to go and have. Build 25 dropped "Collect
every drink you try" and "2,089 drinks. Collect them." for guideline 1.4.3:
both read as a list to drink through. "A field guide to drinking" went
with them, because it can read as a guide to drinking itself.

The subtitle changes only with a new version, so the field guide
alternative's 2,089 has to be right on the day you submit. Recount first.

---

## Keywords — 100 max, comma-separated, NO spaces

```
whisky,whiskey,scotch,bourbon,gin,rum,tequila,mezcal,vodka,brandy,amaro,liqueur,mixology,journal
```

[96]

Two rules this already follows, both easy to get wrong: **no spaces after
the commas** (a space costs a character and buys nothing), and **nothing
repeated from the name or subtitle**. Apple already indexes those, so
"sipply", "drinkdex", "cocktail", "recipes" and "spirits" would be dead
weight here.

Singular and plural are indexed together, so there is no point spending
characters on both.

Build 25 dropped "bar", "pour" and "tasting" for guideline 1.4.3: each
reads as going out for a drink or having one. Every word left names a
kind of drink in the Dex, the craft of mixing them, or the journal.

With either alternative subtitle, "cocktail" is no longer in the subtitle,
so swap it in for "mezcal":

```
cocktail,whisky,whiskey,scotch,bourbon,gin,rum,tequila,vodka,brandy,amaro,liqueur,mixology,journal
```

[98]

---

## Promotional text — 170 max

Updatable any time without shipping a build, so this is the line to change
when the Dex grows or something is worth announcing.

```
A field guide to 2,089 drinks: 899 cocktails with real recipes and 1,190 spirits. Log the ones you have had, keep your own photo of each, and follow friends.
```

[157]

Build 25 took out "2,089 drinks waiting to be found" and "see what your
friends are drinking" for guideline 1.4.3: the first made the Dex a list
to drink through, and the second made other people's drinking the draw.
If you take the field guide subtitle, this opens with the same words, so
change the start here; it needs no build.

---

## Description — 4000 max

```
Sipply is a field guide to drinks, and a record of the ones you have had.

The Dex holds 2,089 entries (899 cocktails and 1,190 spirits), and each one tells you the glass it belongs in and where it comes from. Every cocktail carries its real recipe, the proper measures, and the story behind it.

Entries start locked. Post one you have had, with a photo and a caption, and the card turns over and joins your collection.

THE DEX

Search it, filter it by flavour, spirit or kind, or just scroll and find something you have never heard of. Some entries are everywhere — a Margarita, a Negroni. Others are genuinely obscure: a 1930s Mexico City sour the world forgot for seventy years, a whisky forgotten in a warehouse for two decades, a Mallorcan bitter sold against malaria that outlived the malaria.

Answer a few questions about your tastes and For you puts the entries closest to them first. By number is one tap away.

YOUR SHELF

Each drink you post lands on your profile with your own photograph of it, not a stock picture of someone else's glass. Your collection, your captions, your camera roll.

Write down a drink the Dex does not have, recipe and all, and it gets a page of its own.

SAVED

Save any drink or post to come back to, and sort them into collections. Share a collection by link, and stop sharing whenever you like.

PEOPLE

Follow friends and see the drinks they post, with their photos and captions. Tag the people you were with on a post, and they see it in Activity. Find friends by username, or match your contacts — phone numbers are scrambled on your phone before they are compared, and your address book is never uploaded.

Host a tournament with people you follow: one shared log of the drinks each of you posts between the dates you pick. No prizes, and how much anyone drinks is never counted or shown.

If you would rather bring your Instagram circle, ask Instagram for a copy of your followers and following and hand Sipply the .zip it sends. Sipply never connects to your Instagram account: the file is read on your phone, and the usernames in it are scrambled there before they are compared.

DAILY IDEAS

Only if you want them: at most one notification a day, at a time you choose, with a drink to read about, a recipe to write down or something new in the Dex. Sipply asks before any arrive. Change the time or turn them off in Settings, under Notifications.

WHAT SIPPLY DOES NOT DO

No ads. No analytics. No trackers. No advertising identifier. Nothing is sold or shared with anyone, and there is nothing to buy inside the app.

Sipply does not sell alcohol and cannot be used to order it. It is a reference and a diary, nothing more.

You can delete your account in Settings, which opens from your profile, without emailing anyone. It takes your posts and your photos with it.

—

Sipply is for people old enough to drink where they live. Please drink responsibly, and never drive after drinking.
```

[2,939, recounted for build 35 (28 Oct 2026) without the Facebook paragraph below; 3,120 with it, as build 25 had it. Comfortably inside 4000, with room if you want to add a line]

Build 25 rewrote this for guideline 1.4.3 (apps must not encourage
drinking or excessive drinking), which the daily ideas bring under closer
reading. Every line is about the catalogue, recipes, what you have posted,
what you have saved, or friends, and none invites anyone to drink, to try
more drinks, or to treat drinking as a score. What went: "You collect one
by drinking it" (now "Post one you have had"), "Every cocktail and every
bottle is an entry to find", "see what they have been drinking", the
Stats line about "the milestones you are closing in on", and a tournament
won by "whoever tries the most different drinks in a week". The
tournament is described as the people in it see it, one shared log of
their posts; the Tournaments paragraph in the review notes below keeps the
rules in full for App Review.

Dex progress (Stats) is left out on purpose. Its title ladder (Note
taker, Cataloguer, Archivist, Scholar, Curator, Keeper of the Dex) and
the line under it ("Next: Cataloguer, at 209 entries", for someone with
38) were reworded after build 25 to read as a catalogue, not a drinking
score, but they are still the nearest thing in the app to one, so the
listing does not point anyone at them.

The Facebook paragraph is out of PEOPLE from build 35. It describes a
build made with `EXPO_PUBLIC_FACEBOOK_SIGN_IN=on` and
`EXPO_PUBLIC_FACEBOOK_FRIENDS=on`, and build 35 has both off: the friends
flag from 28 October 2026, while Meta reviews Facebook sign-in without
`user_friends`, and Continue with Facebook itself from build 35, until
Meta approves the app (`specs/v4.9/meta-review.md`, §9). Once both are on
again, paste it back between the tournament paragraph and the Instagram
one, and the count grows by 181:

```
Continue with Facebook and see which of your Facebook friends are already here. Facebook only shows Sipply the friends who connected it too, and Sipply never posts anything there.
```

The tournament paragraph under PEOPLE describes a server with migration
020 applied, which is what makes tournaments appear. If it is not applied
when you submit, delete that paragraph, and the count drops by 183.

The Tag sentence under PEOPLE needs migration 024 (applied 17 Oct 2026)
and SAVED's collections need 023 (applied 13 Oct 2026). Without 024,
delete the sentence that starts "Tag the people", and the count drops
by 69.

DAILY IDEAS is true of build 25 and every build after it. Settings opens
from the ••• on the Profile tab, which is what "Settings, which opens from
your profile" means in the account line.

---

## What's New — 4000 max

Not required for a first release. Version 1.0.0 is not on the App Store
yet, so if build 25 is the first build submitted for review, App Store
Connect will not ask for this; keep it for the first update.

Written for build 25 against build 15, the last build this section
described, so it covers every round from v3.2 to v4.3. If the build
already on the App Store is 24, paste only the first two paragraphs: they
are build 25's.

```
Tag people on a post. When you post a drink, tap Tag people and choose up to 10 people you follow who were there. The post shows who you were with, and each person you tag sees it in Activity. Anyone you tag can remove themselves.

Daily ideas, only if you want them: one notification a day, at a time you choose, with a drink to read about, a recipe to write down or something new in the Dex. Sipply asks before any arrive. Change the time or turn them off in Settings, under Notifications.

Saved has a tab of its own. Save any drink or post, sort them into collections, and share a collection by link. Stop sharing whenever you like.

The Dex can follow your tastes. For you puts the drinks that match what you like first, and By number is one tap away. The filters use the same words as the taste questions, Fruity included.

Scroll up in the Dex and the search field and filters come back.

889 of the 899 cocktails now have a photograph.

Home looks like the feed you know: the full photo, then like, share and save, and who liked it.

New to Sipply? A few questions about your tastes come before you sign in.

Sign in with Apple or Google.

Swipe between tabs, and a line under the active tab shows where you are.

Black and white throughout, with less on every screen, so the drink photographs are the only colour.
```

[1,322]

Guideline 1.4.3 reads this field like the rest of the listing, so every
line is about the catalogue, recipes, what you have posted or friends,
and none asks anyone to drink. Daily ideas says "a recipe to write down",
as the review notes do, rather than the in-app ask's "a recipe to create".

"In Settings, under Notifications" is the in-app ask's own wording.
Settings opens from the ••• on the Profile tab.

The Tag people paragraph needs migration 024 (applied 17 Oct 2026), and
collections need 023 (applied 13 Oct 2026). Without 024 the build shows no
Tag people row, so delete that paragraph.

The photo count was counted out of `src/data/drinkPhotos.ts` against
`src/data/drinks.json`: 901 of the 2,089 entries have one, 889 cocktails
and 12 spirits (recounted 24 Oct 2026). Recount after any photo import.

"Apple or Google" is build 35's: it is made with
`EXPO_PUBLIC_FACEBOOK_SIGN_IN=off`, because in development mode only the
Meta app's own roles can use Facebook, and everyone else's page hung or
said the app is not active. Once Meta approves and the app is Live, a
build with the flag back on (`specs/v4.9/meta-review.md`, §9) makes the
line "Sign in with Apple, Google or Facebook." again, as build 25 had it
(the count grows by 10).

---

## App Review Information — Notes, 4000 max

App Store Connect → the version → **App Review Information → Notes**.
Start from the Test Information notes in [testflight.md](testflight.md):
sign-in, user-generated content, tags, account deletion, age rating,
contacts, Instagram, and the third-party paragraph that matches the build.
They hold for App Review as they do for Beta App Review. Then add the
paragraphs below that match the build.

The field takes 4,000 characters, and the full set does not fit. Measured
for build 15 as pasted (bold marks gone, each paragraph's line breaks as
spaces, a blank line between paragraphs): sign-in through Instagram is
1,957; the third-party paragraph is 121 with no social sign-in, 709 with
Apple and Facebook, 896 with Google as well; phone sign-in is 457 before
its code line; tournaments 654; songs 589. Those six core paragraphs, the
896 one and tournaments make 3,511. Phone sign-in still fits on top: 3,977
with its six-digit code on the line after it, 23 to spare. Songs on top
runs over. When it does, shorten Contacts (508) and Instagram (480), the
two longest, to their first two sentences: the privacy policy, linked from
the listing, carries the rest. That saves 607, which fits songs with room
to spare, and songs with phone sign-in at 3,961, 39 to spare, so count
before pasting.

From build 25, Daily ideas (498) goes in every time, and so does that cut.
The Test Information notes grew too: Tags (216) is new, the age rating
(341) gained a sentence, and three Settings paths gained the "..." step,
so sign-in through Instagram is 2,339. Tournaments is 833 since the Dex
and Tournaments swapped places (23 Oct 2026): it starts from the trophy,
second in the tab bar, and adds a sentence on the Friends board (it was
847 in build 30, from the red key in the middle, and 644 from the Profile
tab). With the 896 paragraph and tournaments, the uncut set is 4,572, 572
over. Cut, it is 3,957, 43 to spare. Phone sign-in on top needs more:
Contacts and Instagram down to their first sentence (3,711 before phone
sign-in) and the two sentences of the third-party paragraph about the
Facebook friends list and access token dropped (the privacy policy
carries both), which makes 3,948 with its code line, 52 to spare. Songs
instead of phone sign-in, with every cut, is 4,071, 71 over, so songs fit
only with tournaments' Friends sentence left out (3,898, 102 to spare).
Songs and phone sign-in together do not fit, so count before pasting.

From build 33 (v4.8), Places (522) goes in whenever the build has the
place-search module and migration 026 is applied. Recounted from the
files on 25 Oct 2026, the same way: sign-in through Instagram with
Contacts (516 now) and Instagram down to their first sentence (75 and
60), the third-party paragraph without its two sentences about the
Facebook friends list and access token (665), Daily ideas (498) and
Tournaments (833) make 3,480 before phone sign-in and songs. Places on
top is 4,004, 4 over (it was 503 until 26 Oct, when it gained "on iOS 18
or later", since tagging needs Apple's Place IDs), so also leave out
Tournaments' last sentence, the one on the Friends board (173 with its
space; the paragraph is then 660): 3,831, 169 to spare. Neither phone
sign-in nor songs fits beside Places even then: phone sign-in with its
code line makes 4,299, 299 over, and songs 4,422, 422 over. A build that
needs either of them and Places has to choose, so count before pasting.

From build 34 (v4.9), People notifications (199) goes in, straight after
Daily ideas, whenever migration 027 is applied, and Tournaments says "no
notifications but the invite" (675 without its Friends sentence). On top
of the 3,831 set that is 4,047, 47 over. With Friends from Facebook off,
as it is from 28 Oct 2026 ([testflight.md](testflight.md)), Continue with
Facebook asks for "public_profile and email" (14 fewer): 4,033, 33 over.
Either way, also cut Continue with Google's clause about its access token
from the third-party paragraph, "; its access token is discarded on the
device and never stored" (62; the privacy policy carries it, as it does
Facebook's), leaving "Continue with Google asks for openid, email and
profile only.": 3,971 with the friends flag off (the paragraph 589), 29 to
spare, or 3,985 with it on (603), 15 to spare, recounted from the files on
28 Oct 2026. Phone sign-in and songs fit even less than they did.

From build 35, Continue with Facebook is off too
(`EXPO_PUBLIC_FACEBOOK_SIGN_IN=off`, 28 Oct 2026): until Meta approves the
app (`specs/v4.9/meta-review.md`, §9), Facebook signs in only the Meta
app's own roles, and every other tester got a page that hung or said the
app is not active. The build shows Sign in with Apple and Continue with
Google, Apple wherever Google is (4.8), so the third-party paragraph is
the Apple and Google one in [testflight.md](testflight.md), written
without Google's token clause, as above (471, against 589): the build-34
set becomes 3,853, 147 to spare, recounted from the files on 28 Oct 2026.
The exact
text for build 35 is in `specs/v4.9/review-notes.txt`; it is only right
while these files say what it says, so after any edit to a pasted
paragraph, recount and write it again. When the flag comes back on, so
does build 34's paragraph, and meta-review.md §9 has its text.

### Tournaments — a server with migrations 020 and 025 applied

From build 30 (v4.7) tournaments are a tab of their own, the trophy,
second in the tab bar since the Dex took the red key in the middle (Jan's
swap, 23 Oct 2026), and the same tab carries the Friends board,
which needs migration 025 (`supabase/migrations/025_friends_board.sql`).
With 020 applied and 025 not, the tab shows tournaments alone: leave out
the last sentence, "The same tab lists you …" (173 with its space), and
the paragraph is 675.

From build 34 (v4.9), with migration 027 applied, the person invited gets
a push naming the host and the tournament (`specs/v4.9/push.md`), so "no
notifications" became "no notifications but the invite" (28 Oct 2026, +15:
848, or 675 without the Friends sentence). For a build before 34, or a
server without 027, put back "no notifications" (833, or 660). The Friends
sentence's "no notifications" holds either way: the board sends none.

**Tournaments.** Anyone can hold a friendly tournament with people they
follow: a shared log, and whoever posts the most different Dex entries
wins. Each drink counts once, and amounts are never counted or shown.
Only 3 entries a day count per person, and a drink first posted after the
day's three never counts later, so nothing rewards posting a lot at once.
No prizes, no entry fees, no streaks, no meters, no notifications but the
invite. Every tournament screen shows the rules, ending "No prizes, and
Apple is not a sponsor. Please drink responsibly." Names pass the caption
filter. To find it, follow anyone, then tap the trophy, second in the tab
bar → Host a tournament. The same tab lists you and the people you follow
by how many different Dex entries each has posted (each drink once,
ever): no amounts, no per-day counts, no notifications.

[848]

### Songs on posts — a build with `EXPO_PUBLIC_STORY_MUSIC=tap`

Only after the badge swap in `src/components/songs.tsx`
(specs/v3.1-changes.md §13.3), and only for `tap`. There is deliberately no paragraph for `autoplay`:
do not submit it without written permission from Apple or the
rights-holders (specs/v3.1-changes.md §0.1).

**Songs on posts.** A person can add an Apple Music song to a photo,
searched on our server through the Apple Music API with our MusicKit
developer token; explicit songs are left out. On the story it is a tag
below the photo, never over it: cover art, title, artist, a play button and
Apple's "Listen on Apple Music" badge, which opens the song. The 30-second
preview plays only when tapped, once, without looping, always beside that
link (5.2.5); the picker works the same way. Cover art appears only with
the song (the tag, the picker, the post being written), never in share
images (4.5.2).

[589]

### Daily ideas — build 25 and later

Every build from 25 on, whatever else it has: build 25 is the first with
notifications, which App Review holds to guideline 4.5.4 (consent in the
app before iOS asks, and an off switch in the app), and the messages are
what 1.4.3 would look at. Spec v4.3 §3 is the source for every claim in
it, so check them on the build before pasting.

**Daily ideas.** Optional local notifications, at most one a day, at a
time the person picks (6 PM by default). An in-app screen offers them
only after a first logged or added drink, post, save or follow; it shows
an example, and iOS asks only after Allow. On or off in Profile → "..." →
Settings → Notifications. Messages invite logging drinks already had,
writing down recipes, reading about and saving drinks; none suggests
drinking, a time to drink or drinking more. To see the offer, post a
drink.

[498]

"Writing down recipes" rather than "making": a drink of your own is an
entry typed into the Dex, and "making recipes" reads to 1.4.3 as mixing
drinks. "Post a drink" because Post is what the + window's key says; on a
fresh install it is the first catch and the first post at once, and the
offer comes once the catch card's Done is tapped. "On or off" because
Settings also turns them on, which shows the same offer.

Not for pasting, for whoever tests it on a phone: to watch one arrive, set
Profile → "..." → Settings → Notifications → Time a few minutes ahead and
lock the phone. Not on a day that phone has logged or posted, though: that
day's idea is skipped, because it would only ask for what was just done, so
after the post that brings up the offer, the first idea comes the next day.
Turning Daily ideas on in Settings, without logging anything, shows the
same offer and leaves today in the plan.

### People notifications — build 34 and later, with migration 027 applied

From build 34 (v4.9): the first notifications Sipply sends from a server,
when someone tags, invites or follows the person. Nothing about them shows
until migration 027 (`supabase/migrations/027_push.sql`) is applied: before
it, the build asks nothing, registers no token and shows no switches, so
leave this paragraph out, and the Tournaments paragraph's "but the invite"
with it. App Review holds them to guideline 4.5.4 as it does Daily ideas
(their own consent before iOS asks, and an off switch in the app), and
1.4.3 reads their words. Spec v4.9 (`specs/v4.9/push.md`) §3 and §4 are
the source; paste it straight after Daily ideas.

**People notifications (optional).** A tag, a tournament invite or a new
follower ("ana started following you."). Their own in-app screen asks
first, then iOS. Three switches in Settings → Notifications.

[199]

Not for pasting: what the paragraph rests on, to check on the build.

- **The ask** comes up once per account on each phone, the first time
  Activity opens (the heart on Home), or when one of the three is ticked in
  Settings before that. Its Allow is the only yes: iOS allowing Sipply for
  daily ideas never stands in for it, and with notifications already on
  there is no iOS prompt after it. Not now is kept.
- **The words** say who did what and nothing else: "ana tagged you in a
  post.", "ana invited you to" the tournament's name, "ana started
  following you." A tournament name with a digit or a word from the daily
  ideas' banned list is sent as "a tournament". No drink, time, amount or
  count, no badge, nothing promotional (4.5.3).
- **Nothing is sent** between people blocked either way, nothing goes
  twice, and one person's tags and invites reach another at most once an
  hour each.
- **To watch one arrive** takes two accounts and the steps in
  `specs/v4.9/push.md` §7, step 8.

### Places — a build with the place-search module and migration 026 applied

From build 33 (v4.8). It needs both halves: the native module
(`modules/place-search`) ships inside the binary, and nothing about places
shows until migration 026 (`supabase/migrations/026_places.sql`) is
applied, so a build without it looks like build 32. Apply 026 before
submitting anyway: the binary carries a location purpose string, and the
reviewer should find the feature that uses it. Spec v4.8 §4.4 is the
source; paste it with the Tournaments cut described above.

**Places.** A post can name the bar or restaurant it was had at, found
with Apple Maps search on the device (MapKit). Only venues can be tagged,
never a home or an address. Location is When In Use, asked only on a tap
of Show places near me; search by name works without it, and the device's
location never reaches our server. Pages count people who had a drink at a
place, never amounts, prices, deals or rankings. Wrong places are reported
from the post's "..." menu. Try it on iOS 18 or later: post a drink, then
Add place.

[522]

Not for pasting: the guidelines to check on the build before submitting.

- **5.1.1.** Location is asked for on demand (only on a tap of Show places
  near me), with a purpose string, and search by name works when it is
  denied.
- **5.1.5.** Location is directly relevant to the feature (places near
  you), and nothing uses it in the background.
- **2.5.4.** No background modes: no `UIBackgroundModes` `location`, no
  Always permission.
- **1.4.3.** Nothing encourages drinking: a place is only ever "where
  people have had it", counted in people, with no deals, prices, opening
  hours or rankings of bars, and the place page has no key to post a drink
  there.
- **4.0 and 5.2, and the MapKit licence (DPLA Attachment 6).** Apple Maps
  data is shown with an Apple map that keeps its logo and Legal link
  (§2.1, §2.4): the Tag this place step and the place page each draw one,
  and the search sheet and place page also credit Apple in words ("Places
  from Apple Maps", "Place details from Apple Maps"). Map Data is shown on
  no other map: there is no Google Maps link and no Google API. And no
  Apple address, area, category or position is kept on our server (§2.2,
  §2.5): per tagged photo it stores only Apple's Place ID and the poster's
  own name for the place (prefilled from Apple's, editable, filtered), and
  the phone looks the address and position up live by that id, holding
  them in memory for the session only (spec v4.8 §0.5). A label the poster
  leaves as it was is Apple's name word for word, so this narrows the
  §2.2 risk rather than removing it; spec §0.5 says why it is accepted.
- **Below iOS 18** there are no Place IDs, so there is no Add place; a
  place someone else tagged still shows as its name, and its page shows
  the drinks without Apple's map.

---

## URLs

| Field | Value |
| --- | --- |
| Privacy Policy URL | `https://janmcq1617.github.io/drinkdex/privacy` |
| Support URL | `https://janmcq1617.github.io/drinkdex/support` |
| Marketing URL | leave blank — there is no marketing site, and a dead link is worse than none |

**Pages serves from `main` / `/docs`**, so a branch alone publishes
nothing, and these pages change only when `main` moves. The privacy,
support and terms pages all resolved on 29 September 2026. Check again
before you submit — a support URL that 404s is a rejection.

### Meta app settings, for Continue with Facebook

Not App Store Connect: these go in the Meta developer app whose App ID and
secret Supabase's Facebook provider uses, under App settings → Basic. Meta
needs the privacy policy and the data deletion page before the app can go
live or `user_friends` can be reviewed; the terms URL is optional and
costs nothing to fill in. Business verification, App Review and Publish
are step by step in `specs/v4.9/meta-review.md`.

| Field | Value |
| --- | --- |
| Privacy Policy URL | `https://janmcq1617.github.io/drinkdex/privacy` |
| Terms of Service URL | `https://janmcq1617.github.io/drinkdex/terms` |
| User data deletion → Data deletion instructions URL | `https://janmcq1617.github.io/drinkdex/data-deletion` |

`data-deletion` is new and does not exist until `main` moves. It has to
be live, along with the privacy policy that describes Facebook, before
the Meta app goes to review, which is before any build with the Facebook
button reaches testers. Build 34 reached them with it anyway; build 35
hides it again until Meta approves (`specs/v4.9/meta-review.md`, §9).

---

## App Privacy — the questionnaire

App Store Connect → the app → **App Privacy**. These answers restate
[the privacy policy](privacy), which is the source: if either changes, the
other has to.

Build 35's Continue with Facebook being off changes none of them: the
accounts made with Facebook in earlier builds keep what Facebook sent
(the name, the email address, the picture link and Facebook's id), and the
button comes back once Meta approves the app.

Apple's test for "collected" is that data leaves the phone and is kept
longer than it takes to answer the request. So the contact hashes, the
Instagram hashes and the Facebook friend ids sent for matching (only by a
build with `EXPO_PUBLIC_FACEBOOK_FRIENDS=on`; with it off none are sent,
and no answer below changes) are **not**
collected — they are compared and dropped — and neither is the email
address the sign-in screen checks for an account. Nothing that stays on the
phone is collected either: the collection, unposted photos, the cached
Instagram list (and Facebook list, with that flag on), which posts and
activity have been seen,
each account's answer to the screen that asks about notifications from
other people (from build 34), and the daily ideas (from build 25), which
are planned and scheduled on the phone with the time, the ideas already
shown and a random seed it keeps to itself.
Song searches are not collected: the words go through our server to Apple
Music and are not kept. The server holds each answer in memory for ten
minutes, with no account attached, only so the same search is not asked
twice; if that cache ever grows longer or is written anywhere, declare
Search History.
Place searches (from build 33) are not collected either: what is typed,
and the device's location if the person allowed it, go from the phone to
Apple through MapKit and never reach our server. Only a place a person
tags is kept, on the photo once posted, as Apple's Place ID and the name
the person gives it, and it is declared below. Looking a tagged place up
again (its address and map, on its page) also runs between the phone and
Apple, by that id, and is held only in the phone's memory.
Crash reports Apple gathers itself, through TestFlight or the App Store,
are Apple's to declare, not the app's.
The onboarding's taste answers and the saved drinks are kept on
the phone until an account exists, and only then with the account
(migration 022): that is when they become collected, and they are
declared below.

**Do you or your third-party partners collect data from this app?** Yes.

**Tracking.** No, for every type below. Nothing is combined with other
companies' data, and nothing goes to a data broker.

Declare these ten, each **linked to the user** unless the table says
otherwise, and each for **App Functionality** only unless the table says
otherwise:

| Category → data type | Linked | What it actually is |
| --- | --- | --- |
| Contact Info → Name | Yes | The display name, including the name Apple, Google or Facebook sends at sign-in |
| Contact Info → Email Address | Yes | The sign-in address; for Sign in with Apple it may be a Hide My Email relay |
| Contact Info → Phone Number | Yes | The sign-in number for anyone who signs in by phone, kept by the authentication provider; otherwise only as a salted hash, and only for someone who makes themselves findable. Apple counts a hash as the data it came from |
| User Content → Photos or Videos | Yes | Post photos, the profile photo, and the photo sent with a drink suggestion. Also covers the link to a Google or Facebook profile picture that Supabase keeps from sign-in, which the app never shows or copies |
| User Content → Other User Content | Yes | Captions, bios, likes, saves, follows, invites, drink suggestions, reports and the copy a report keeps; tournaments (name, dates, goal, invitations, standings and the host's time zone); the song added to a post; collections (their names and what is in them, and a share link when you make one); tags (the people you tag on a post, and the record kept when someone removes themselves from one, so that post cannot tag them again) |
| Location → Precise Location | Yes | The place a person tags on a post's photo (a bar, restaurant or similar venue chosen from Apple Maps), kept as Apple's Place ID for that venue and the name the person gives it, shown with the post. The Place ID names one venue, so it places the person there as exactly as coordinates would, although no coordinates are stored. The device's own location is used on the phone and by Apple Maps only, and never sent to Sipply. |
| Identifiers → User ID | Yes | The account id and username; the id Apple or Facebook issues for Sipply, and the id Google issues; the hash of the user's own Instagram handle |
| Identifiers → Device ID | Yes, from build 34 (**No** until build 33) | The random installation id Expo's update check sends. Expo keeps it to deliver updates and count installs per version; nothing ties it to an account. From build 34, also the phone's APNs device token: the address Apple issues so that a server can send that phone a notification for Sipply. It is kept with the account (at most five phones) only once the person has allowed notifications from other people, so that a tag, a tournament invite or a new follower reaches that person's phone, and is sent, with each notification's one line, its kind and the in-app link it opens (holding the random id of the post, tournament or person it is about), to Apple's Push Notification service, which delivers it. It comes off the server when the person signs out, turns all three switches off, turns notifications off for Sipply in iOS (read the next time the app opens) or deletes the account |
| Usage Data → Other Usage Data | Yes | How many phone numbers or handles an account checked, from which list, and when; kept only to enforce the 3,000-a-day matching limit. How many song searches an account made in each hour, never the words; kept only to enforce the 120-an-hour limit. From build 34, when one person last notified another of a tag, and of a tournament invite, never any words; kept only to enforce one of each an hour between the same two people, until either account is deleted. Also, with no account attached, the sign-in screen's hour-long meter of email checks, kept per scrambled IP address |
| Other Data → Other Data Types | Yes | Taste answers and saved drinks: what the person usually drinks, which spirits and flavours they like, whether they make drinks at home and what was in their bar, and the drinks they saved, kept with the account so they follow it to a new phone. Owner only, never on the profile. From build 34, also the account's three switches for notifications from other people (tags, invites, new followers), all on until changed. Purposes **App Functionality** and **Product Personalization** (the answers choose the drinks suggested, on the phone, by the same rules for everyone; the switches are App Functionality alone) |

App Functionality covers Other Usage Data: Apple's definition of the
purpose includes preventing fraud and implementing security measures, which
is what the matching limit, the song-search limit, the notifications' hour
between two people and the sign-in meter are. Product Personalization is
Apple's purpose for customising what a person sees, recommendations
included, which is what the taste answers do; it is not tracking, because
nothing is combined with other companies' data or shared. Device ID stays
App Functionality only as long as Expo's install counts are used for
checking rollouts; if they start informing product decisions, add
Analytics to it. The push token is App Functionality alone: it delivers
the notifications the person allowed, and nothing else reads it.

Everything else is **Not collected**: Contacts, Coarse Location (the
device's own location never leaves the phone except to Apple Maps for a
search, and photos are re-encoded without location), Search History (the
Dex and place searches run on the phone or with Apple), Browsing History,
Health, Financial Info, Purchases, Sensitive Info, Product Interaction,
Advertising Data and Diagnostics.
Tournaments, songs, collections and tags add no new type: they are user
content, and the song-search count is usage data, both declared above.
Notifications from other people (build 34) add none either: the token is
the Device ID above, the notes of what was sent are about follows, tags
and invites already in Other User Content, the hour between two people is
usage data like the matching limit's, and the switches sit with the taste
answers in Other Data Types.

**Build 33 (v4.8) adds Location → Precise Location: linked to the user,
App Functionality, not used for tracking.** The device's own location
stays not collected. Why, from Apple's own definitions
(developer.apple.com/app-store/app-privacy-details, read 25 Oct 2026;
spec v4.8 §4.3 quotes them):

- **A tagged place is collected.** It leaves the phone for our server (the
  photo's `apple_place_id` and `place_label`, on Save & post or through
  `set_photo_place`) and is kept with the post, far longer than it takes
  to answer the request.
- **It is still Precise Location, after the licence rework (spec v4.8
  §0.5).** Apple's definition is information that describes the location
  of a user or device at the resolution of a latitude and longitude with
  three or more decimal places. Sipply no longer stores the venue's
  coordinates, but that changes how the location is held, not what it is:
  the Place ID points at one venue, anyone with MapKit can turn it back
  into that venue's exact position, and the tag says the person was there
  when they had the drink, linked to the account through the post. The
  licence decided what Sipply may keep of Apple's data; it does not make
  the user's location any coarser, so the label does not change.
- **Other User Content alone is not enough.** Apple's page says that data a
  user is asked to type into a field is disclosed as its specific type, and
  a place picker asks for exactly one type, a location. Under-declaring is
  a rejection risk; over-declaring costs one row on the label.
- **The device's own location is not collected.** Apple counts data
  processed only on the device as not collected, and what Apple itself
  collects, through MapKit, as Apple's to disclose. The fix goes to MapKit
  and never reaches Sipply (spec v4.8 §2.6).
- **Coarse Location is not declared.** Nothing coarser than the venue is
  kept.
- **Name is not a new type.** The name the person gives the place is their
  own words about the post, like a caption, so it is already inside Other
  User Content; it is listed under Precise Location above only because it
  travels with the Place ID.

There is no Coarse alternative any more. The first draft could have
stored rounded coordinates; a Place ID cannot be rounded, so showing
Coarse would mean dropping the tag itself. Publish the privacy policy
(its Places paragraph) before changing the label.

**Build 25 (v4.3) changes nothing here but the tags in Other User
Content.** Daily ideas are local notifications and collect nothing.
Build 25 never asked for a push token, from Apple or from Expo:
expo-notifications (as read in 57.0.23, the version build 25 installs)
registers with Apple's push service only when `getDevicePushTokenAsync`
or `getExpoPushTokenAsync` is called, or when
`setAutoServerRegistrationEnabledAsync` has been turned on, and builds 25
to 33 do none of these, so no device token existed to collect.

**Build 34 (v4.9) makes Device ID linked to the user, still App
Functionality only and not used for tracking.** Its notifications from
other people (`specs/v4.9/push.md`) keep each phone's APNs device token
with its account, so that a tag, a tournament invite or a new follower
reaches that person's phone: a Device ID, and linked. The token is asked
for only after the alerts' own Allow (iOS allowing Sipply for daily ideas
is never enough by itself), while iOS allows Sipply's notifications and at
least one of the three switches is on, and it stays on the server only
until one of those stops holding or the account is deleted (the table
says when). It is asked for from Apple alone: `src/lib/push.ts` calls
`getDevicePushTokenAsync`, never Expo's token or its server registration,
so Expo's push service is never involved and Apple's is the only one the
privacy policy names. Check before submitting, after any
expo-notifications upgrade too:
`grep -rnE 'ExpoPushTokenAsync|AutoServerRegistration' src` finds
nothing, and `grep -rn 'getDevicePushTokenAsync' src` finds only
`src/lib/push.ts`.

Change the existing Device ID row from not linked to linked; do not add a
second one, since the questionnaire takes one answer per type, whatever
identifiers it covers. Spec v4.3 §2.5 planned these pushes as an
over-the-air update, but the manifest below ships inside the binary and an
update cannot change it, so they wait for build 34, whose manifest says
linked. Publish the privacy policy (its Notifications from other people
paragraph) and the new label before build 34 goes to review.

The same types belong in the app's privacy manifest,
`ios.privacyManifests.NSPrivacyCollectedDataTypes` in `app.json`. It lists
all ten, Device ID with `NSPrivacyCollectedDataTypeLinked` true from
build 34 (false until build 33, while it was Expo's installation id alone)
and Other Data Types with both its purposes, and an eleventh, Audio Data, for the
microphone the Reels recorder uses. Build 33 adds the tenth,
`NSPrivacyCollectedDataTypePreciseLocation`, linked, not tracking, for
`NSPrivacyCollectedDataTypePurposeAppFunctionality` (spec v4.8 §1.6). MapKit and CoreLocation are not required-reason APIs, so
`NSPrivacyAccessedAPITypes` does not change. The binary's only location
key is `NSLocationWhenInUseUsageDescription`. The
manifest ships inside the binary, and the recorder is in every build from
the one after 11 even while Reels is switched off, so the manifest
declares it from that build on. The questionnaire above adds Audio Data
only when Reels is turned on, because until then no build records or
uploads any sound. Build 25 adds nothing to it: expo-notifications brings
its own privacy manifest, which declares no collected data and one
required-reason API (UserDefaults, reason CA92.1, in the 57.0.23 copy),
inside its pod's own `ExpoNotifications_privacy` bundle.

---

## Screenshots — the bit that is actually missing

Retake the whole set on build 25: the current screenshots show the old
pill buttons and the glass tab bar, and older builds show rarity on the
cards and colour throughout, where build 25 is black and white with the
drink photographs as the only colour. Build 25 hides My Bar, so leave it
out. Dex progress is not a tab; it opens from the count at the top of the
Dex.

Required: **6.9" iPhone**, 1320 × 2868 or 1290 × 2796. Apple scales that
set down to the smaller sizes, so one set is enough.

The first two are what people see in search results without tapping
through. Lead with the two that carry the scale and the payoff:

1. **The Dex grid**, scrolled to somewhere dense. This is the shot that
   sells 2,089 entries; nothing else in the app communicates the size of
   it in one frame.
2. **An open drink card** with its origin story.
3. **Posting a drink**, with a real photograph attached.
4. **The feed**, with a few different people in it.
5. **Saved**, with a few collections you have named.

Not Dex progress: its title ladder, even reworded after build 25, is the
part of the app most likely to read as a score, which the description
leaves out for guideline 1.4.3, so the screenshots leave it out too.

Populate the account first. Screenshots of an empty state read as an empty
app, and this one is the opposite of empty.
