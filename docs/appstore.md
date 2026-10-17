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

Continue with Facebook and see which of your Facebook friends are already here. Facebook only shows Sipply the friends who connected it too, and Sipply never posts anything there.

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

[3,120, recounted for build 25, comfortably inside 4000, with room if you want to add a line]

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

The Facebook paragraph under PEOPLE describes a build made with
`EXPO_PUBLIC_FACEBOOK_SIGN_IN=on`. If the build you submit has it off,
delete that paragraph, and the count drops by 181.

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

783 of the 899 cocktails now have a photograph.

Home looks like the feed you know: the full photo, then like, share and save, and who liked it.

New to Sipply? A few questions about your tastes come before you sign in.

Sign in with Apple, Google or Facebook.

Swipe between tabs, and a line under the active tab shows where you are.

Black and white throughout, with less on every screen, so the drink photographs are the only colour.
```

[1,332]

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
`src/data/drinks.json`: 795 of the 2,089 entries have one, 783 cocktails
and 12 spirits. Recount after any photo import.

"Apple, Google or Facebook" describes a build with all three sign-in flags
on, as build 25 has. Facebook also needs the Meta app to be Live: in
development mode only the app's own roles can use it, so until then make
the line "Sign in with Apple or Google." (the count drops by 10).

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
so sign-in through Instagram is 2,339. Tournaments is 644, now that it
starts from the Profile tab. With the 896 paragraph and tournaments, the
uncut set is 4,383, 383 over. Cut, it is 3,768, 232 to spare. Phone
sign-in on top makes 4,234 with its code line; take Contacts and Instagram
down to their first sentence as well and it is 3,988, 12 to spare. Songs
instead of phone sign-in need that cut and the two sentences of the
third-party paragraph about the Facebook friends list and access token
dropped (the privacy policy carries both): 3,882, 118 to spare. Songs and
phone sign-in together do not fit, so count before pasting.

### Tournaments — a server with migration 020 applied

**Tournaments.** Anyone can hold a friendly tournament with people they
follow: a shared log, and whoever posts the most different Dex entries
wins. Each drink counts once, and amounts are never counted or shown.
Only 3 entries a day count per person, and a drink first posted after the
day's three never counts later, so nothing rewards posting a lot at once.
No prizes, no entry fees, no streaks, no meters, no notifications. Every
tournament screen shows the rules, ending "No prizes, and Apple is not a
sponsor. Please drink responsibly." Names pass the caption filter. To find
it, follow anyone, then Profile → Tournaments → Host a tournament.

[644]

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
costs nothing to fill in.

| Field | Value |
| --- | --- |
| Privacy Policy URL | `https://janmcq1617.github.io/drinkdex/privacy` |
| Terms of Service URL | `https://janmcq1617.github.io/drinkdex/terms` |
| User data deletion → Data deletion instructions URL | `https://janmcq1617.github.io/drinkdex/data-deletion` |

`data-deletion` is new and does not exist until `main` moves. It has to
be live, along with the privacy policy that describes Facebook, before
the Meta app goes to review, which is before any build with the Facebook
button reaches testers.

---

## App Privacy — the questionnaire

App Store Connect → the app → **App Privacy**. These answers restate
[the privacy policy](privacy), which is the source: if either changes, the
other has to.

Apple's test for "collected" is that data leaves the phone and is kept
longer than it takes to answer the request. So the contact hashes, the
Instagram hashes and the Facebook friend ids sent for matching are **not**
collected — they are compared and dropped — and neither is the email
address the sign-in screen checks for an account. Nothing that stays on the
phone is collected either: the collection, unposted photos, the cached
Instagram and Facebook lists, which posts and activity have been seen, and
the daily ideas (from build 25), which are planned and scheduled on the
phone with the time, the ideas already shown and a random seed it keeps to
itself.
Song searches are not collected: the words go through our server to Apple
Music and are not kept. The server holds each answer in memory for ten
minutes, with no account attached, only so the same search is not asked
twice; if that cache ever grows longer or is written anywhere, declare
Search History.
Crash reports Apple gathers itself, through TestFlight or the App Store,
are Apple's to declare, not the app's.
The onboarding's taste answers and the saved drinks are kept on
the phone until an account exists, and only then with the account
(migration 022): that is when they become collected, and they are
declared below.

**Do you or your third-party partners collect data from this app?** Yes.

**Tracking.** No, for every type below. Nothing is combined with other
companies' data, and nothing goes to a data broker.

Declare these nine, each **linked to the user** unless the table says
otherwise, and each for **App Functionality** only unless the table says
otherwise:

| Category → data type | Linked | What it actually is |
| --- | --- | --- |
| Contact Info → Name | Yes | The display name, including the name Apple, Google or Facebook sends at sign-in |
| Contact Info → Email Address | Yes | The sign-in address; for Sign in with Apple it may be a Hide My Email relay |
| Contact Info → Phone Number | Yes | The sign-in number for anyone who signs in by phone, kept by the authentication provider; otherwise only as a salted hash, and only for someone who makes themselves findable. Apple counts a hash as the data it came from |
| User Content → Photos or Videos | Yes | Post photos, the profile photo, and the photo sent with a drink suggestion. Also covers the link to a Google or Facebook profile picture that Supabase keeps from sign-in, which the app never shows or copies |
| User Content → Other User Content | Yes | Captions, bios, likes, saves, follows, invites, drink suggestions, reports and the copy a report keeps; tournaments (name, dates, goal, invitations, standings and the host's time zone); the song added to a post; collections (their names and what is in them, and a share link when you make one); tags (the people you tag on a post, and the record kept when someone removes themselves from one, so that post cannot tag them again) |
| Identifiers → User ID | Yes | The account id and username; the id Apple or Facebook issues for Sipply, and the id Google issues; the hash of the user's own Instagram handle |
| Identifiers → Device ID | **No** | The random installation id Expo's update check sends. Expo keeps it to deliver updates and count installs per version; nothing ties it to an account |
| Usage Data → Other Usage Data | Yes | How many phone numbers or handles an account checked, from which list, and when; kept only to enforce the 3,000-a-day matching limit. How many song searches an account made in each hour, never the words; kept only to enforce the 120-an-hour limit. Also, with no account attached, the sign-in screen's hour-long meter of email checks, kept per scrambled IP address |
| Other Data → Other Data Types | Yes | Taste answers and saved drinks: what the person usually drinks, which spirits and flavours they like, whether they make drinks at home and what was in their bar, and the drinks they saved, kept with the account so they follow it to a new phone. Owner only, never on the profile. Purposes **App Functionality** and **Product Personalization** (the answers choose the drinks suggested, on the phone, by the same rules for everyone) |

App Functionality covers Other Usage Data: Apple's definition of the
purpose includes preventing fraud and implementing security measures, which
is what the matching limit, the song-search limit and the sign-in meter
are. Product Personalization is Apple's purpose for customising what a
person sees, recommendations included, which is what the taste answers
do; it is not tracking, because nothing is combined with
other companies' data or shared. Device
ID stays App Functionality only as long as Expo's install counts are used
for checking rollouts; if they start informing product decisions, add
Analytics to it.

Everything else is **Not collected**: Contacts, Location (photos are
re-encoded without it), Search History (the Dex is searched on the
phone), Browsing History, Health, Financial Info, Purchases, Sensitive
Info, Product Interaction, Advertising Data and Diagnostics.
Tournaments, songs, collections and tags add no new type: they are user
content, and the song-search count is usage data, both declared above.

**Build 25 (v4.3) changes nothing here but the tags in Other User
Content.** Daily ideas are local notifications and collect nothing.
Build 25 never asks for a push token, from Apple or from Expo:
expo-notifications (as read in 57.0.23, the version build 25 installs)
registers with Apple's push service only when `getDevicePushTokenAsync`
or `getExpoPushTokenAsync` is called, or when
`setAutoServerRegistrationEnabledAsync` has been turned on, and build 25
does none of these, so no device token exists to collect. Check before
submitting, after any expo-notifications upgrade too:
`grep -rnE 'PushTokenAsync|AutoServerRegistration' src` finds nothing.

That stops being true with the tag pushes in spec v4.3 §2.5, which keep
each phone's token with its account. The spec plans them as an
over-the-air update with no new build, and this page has to move first:
the questionnaire (a token kept with an account is most likely a Device
ID, linked), the privacy policy's Daily ideas paragraph, which says
Sipply does not ask for that address, and the manifest below. The
manifest ships inside the binary, so an over-the-air update cannot change
it: for it to stay true, its Device ID entry (linked false today) becomes
linked in a build that ships before the pushes go out.

The same types belong in the app's privacy manifest,
`ios.privacyManifests.NSPrivacyCollectedDataTypes` in `app.json`. It lists
all nine, Device ID with `NSPrivacyCollectedDataTypeLinked` false and Other
Data Types with both its purposes, and a tenth, Audio Data, for the
microphone the Reels recorder uses. The
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
