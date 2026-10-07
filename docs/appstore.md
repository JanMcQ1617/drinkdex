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
Sipply
```

[6] Keeping the name bare leaves "drinks", "field guide" and "collect"
free to use in the subtitle and keywords, where they do the same search
work without spending name characters. If you would rather the name carry
its own descriptor, `Sipply: Drinks Field Guide` [26] fits — but then drop
"guide" from the keywords, because repeats there are wasted.

---

## Subtitle — 30 max

```
Collect every drink you try
```

[27]

Alternatives, same length class:

```
A field guide to drinking
```
[25]

```
2,089 drinks. Collect them.
```
[27]

---

## Keywords — 100 max, comma-separated, NO spaces

```
cocktail,whisky,whiskey,spirits,bar,recipes,tasting,journal,mixology,pour,gin,rum,tequila,amaro
```

[95]

Two rules this already follows, both easy to get wrong: **no spaces after
the commas** (a space costs a character and buys nothing), and **nothing
repeated from the name or subtitle** — Apple already indexes those, so
"sipply", "collect", "drink" and "every" would be dead weight here.

Singular and plural are indexed together, so there is no point spending
characters on both.

---

## Promotional text — 170 max

Updatable any time without shipping a build, so this is the line to change
when the Dex grows or something is worth announcing.

```
2,089 drinks waiting to be found: 1,190 spirits and 899 cocktails with real recipes. Post what you drink, keep the photo, and see what your friends are drinking.
```

[161]

---

## Description — 4000 max

```
Sipply is a field guide to drinks, and a record of the ones you have had.

Every cocktail and every bottle is an entry to find. There are 2,089 of them — 899 cocktails and 1,190 spirits — and each one tells you the glass it belongs in and where it comes from. Every cocktail carries its real recipe, the proper measures, and the story behind it.

Entries start locked. You collect one by drinking it: post it, add a photo and a caption, and the card turns over and joins your collection.

THE DEX

Search it, filter it by category, or just scroll and find something you have never heard of. Some entries are everywhere — a Margarita, a Negroni. Others are genuinely obscure: a 1930s Mexico City sour the world forgot for seventy years, a whisky forgotten in a warehouse for two decades, a Mallorcan bitter sold against malaria that outlived the malaria.

YOUR SHELF

Post a drink and it lands on your profile with your own photograph of it — not a stock picture of someone else's glass. Your collection, your captions, your camera roll.

Stats show you what you have covered and what you have not: progress by category, and the milestones you are closing in on.

PEOPLE

Follow other collectors and see what they have been drinking. Find friends by username, or match your contacts — phone numbers are scrambled on your phone before they are compared, and your address book is never uploaded.

Host a tournament with people you follow: whoever tries the most different drinks in a week wins. Each drink counts once, never how much.

Continue with Facebook and see which of your Facebook friends are already here. Facebook only shows Sipply the friends who connected it too, and Sipply never posts anything there.

If you would rather bring your Instagram circle, ask Instagram for a copy of your followers and following and hand Sipply the .zip it sends. Sipply never connects to your Instagram account: the file is read on your phone, and the usernames in it are scrambled there before they are compared.

WHAT SIPPLY DOES NOT DO

No ads. No analytics. No trackers. No advertising identifier. Nothing is sold or shared with anyone, and there is nothing to buy inside the app.

Sipply does not sell alcohol and cannot be used to order it. It is a reference and a diary, nothing more.

You can delete your account from Settings inside the app, without emailing anyone. It takes your posts and your photos with it.

—

Sipply is for people old enough to drink where they live. Please drink responsibly, and never drive after drinking.
```

[2,532, recounted for build 15 — comfortably inside 4000, with room if you want to add a line]

The Facebook paragraph under PEOPLE describes a build made with
`EXPO_PUBLIC_FACEBOOK_SIGN_IN=on`. If the build you submit has it off,
delete that paragraph, and the count drops by 181.

The tournament paragraph under PEOPLE describes a server with migration
020 applied, which is what makes tournaments appear. If it is not applied
when you submit, delete that paragraph, and the count drops by 139.

---

## What's New — 4000 max

Not required for a first release. Version 1.0.0 is not on the App Store
yet, so if build 15 is the first build submitted for review, App Store
Connect will not ask for this; keep it for the first update. If an earlier
build reaches the App Store first, paste this with build 15:

```
Stories at the top of Home are circles now. A wine ring marks one you have not opened yet, and you can delete your own.

My Bar has a tab of its own, next to the +.

Tournaments: host one with people you follow, and whoever tries the most different drinks wins. Each drink counts once, never how much.

Drink pages tell each drink's origin story: where it began, who is credited, and how it got its name.

No more rarity. An entry is simply collected or not yet.

The tab bar shrinks while you scroll, and Home's top bar slides out of the way.

"Log" is now "Post", and a note is now a caption.
```

[594]

The tournament paragraph needs migration 020 applied, like the one in the
description. The origin story paragraph needs the origin story merge in
`src/data/drinks.json`; without it the band shows each drink's fun fact,
so delete that paragraph.

---

## App Review Information — Notes, 4000 max

App Store Connect → the version → **App Review Information → Notes**.
Start from the Test Information notes in [testflight.md](testflight.md):
sign-in, user-generated content, account deletion, age rating, contacts,
Instagram, and the third-party paragraph that matches the build. They hold
for App Review as they do for Beta App Review. Then add the paragraphs
below that match the build.

The field takes 4,000 characters, and the full set does not fit. Measured
for build 15 as pasted (bold marks gone, each paragraph's line breaks as
spaces, a blank line between paragraphs): sign-in through Instagram is
1,957; the third-party paragraph is 121 with no social sign-in, 709 with
Apple and Facebook, 896 with Google as well; phone sign-in is 457 before
its code line; tournaments 701; songs 574. Those six core paragraphs, the
896 one and tournaments make 3,558, so adding phone sign-in or songs on top
runs over. When it does, shorten Contacts (508) and Instagram (480), the
two longest, to their first two sentences: the privacy policy, linked from
the listing, carries the rest. That saves 607, which fits either addition
with room to spare and both with almost none, so count before pasting.

### Tournaments — a server with migration 020 applied

**Tournaments.** People who follow each other can hold a friendly
tournament: whoever posts the most different drinks wins. Each drink counts
once, and how much anyone drinks is never counted or shown. At most 3 new
drinks a day count per person, and a drink first posted after the day's
three never counts later, so nothing rewards trying a lot in one night. No
prizes, no entry fees, no streaks, no meters, no push notifications. Every
tournament screen shows the rules, ending "No prizes, and Apple is not a
sponsor. Please drink responsibly." Only people the host follows can be
invited, and names pass the caption filter. To try it, follow any account,
then tap the trophy at the top of Home, then +.

[701]

### Songs on posts — a build with `EXPO_PUBLIC_STORY_MUSIC=tap`

Only after the badge swap in `src/components/songs.tsx`
(specs/v3.1-changes.md §13.3), and only for `tap`. There is deliberately no paragraph for `autoplay`:
do not submit it without written permission from Apple or the
rights-holders (specs/v3.1-changes.md §0.1).

**Songs on posts.** A person can add an Apple Music song to a photo,
searched from our server through the Apple Music API under our MusicKit
developer token; explicit songs are left out. On the story it is a tag
below the photo, never over it: cover art, title, artist, a play button and
Apple's "Listen on Apple Music" badge, which opens the song. The 30-second
preview plays only when tapped, once, without looping, always beside that
link (5.2.5); the song picker works the same way. Cover art and song
details appear only there, with playback, never in share images (4.5.2).

[574]

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
Instagram and Facebook lists, and which posts and activity have been seen.
Song searches are not collected: the words go through our server to Apple
Music and are not kept. The server holds each answer in memory for ten
minutes, with no account attached, only so the same search is not asked
twice; if that cache ever grows longer or is written anywhere, declare
Search History.
Crash reports Apple gathers itself, through TestFlight or the App Store,
are Apple's to declare, not the app's.

**Do you or your third-party partners collect data from this app?** Yes.

**Tracking.** No, for every type below. Nothing is combined with other
companies' data, and nothing goes to a data broker.

Declare these eight, each **linked to the user** unless the table says
otherwise, and each for **App Functionality** only:

| Category → data type | Linked | What it actually is |
| --- | --- | --- |
| Contact Info → Name | Yes | The display name, including the name Apple, Google or Facebook sends at sign-in |
| Contact Info → Email Address | Yes | The sign-in address; for Sign in with Apple it may be a Hide My Email relay |
| Contact Info → Phone Number | Yes | The sign-in number for anyone who signs in by phone, kept by the authentication provider; otherwise only as a salted hash, and only for someone who makes themselves findable. Apple counts a hash as the data it came from |
| User Content → Photos or Videos | Yes | Post photos, the profile photo, and the photo sent with a drink suggestion. Also covers the link to a Google or Facebook profile picture that Supabase keeps from sign-in, which the app never shows or copies |
| User Content → Other User Content | Yes | Captions, bios, likes, saves, follows, invites, drink suggestions, reports and the copy a report keeps; tournaments (name, dates, goal, invitations, standings and the host's time zone); the song added to a post |
| Identifiers → User ID | Yes | The account id and username; the id Apple or Facebook issues for Sipply, and the id Google issues; the hash of the user's own Instagram handle |
| Identifiers → Device ID | **No** | The random installation id Expo's update check sends. Expo keeps it to deliver updates and count installs per version; nothing ties it to an account |
| Usage Data → Other Usage Data | Yes | How many phone numbers or handles an account checked, from which list, and when; kept only to enforce the 3,000-a-day matching limit. How many song searches an account made in each hour, never the words; kept only to enforce the 120-an-hour limit. Also, with no account attached, the sign-in screen's hour-long meter of email checks, kept per scrambled IP address |

App Functionality covers the last one: Apple's definition of the purpose
includes preventing fraud and implementing security measures, which is what
the matching limit, the song-search limit and the sign-in meter are. Device
ID stays App Functionality only as long as Expo's install counts are used
for checking rollouts; if they start informing product decisions, add
Analytics to it.

Everything else is **Not collected**: Contacts, Location (photos are
re-encoded without it), Search History (the Dex is searched on the
phone), Browsing History, Health, Financial Info, Purchases, Sensitive
Info, Product Interaction, Advertising Data, Diagnostics and Other Data.
Tournaments and songs add no new type: they are user content, and the
song-search count is usage data, both declared above.

The same types belong in the app's privacy manifest,
`ios.privacyManifests.NSPrivacyCollectedDataTypes` in `app.json`. It lists
all eight, Device ID with `NSPrivacyCollectedDataTypeLinked` false, and a
ninth, Audio Data, for the microphone the Reels recorder uses. The
manifest ships inside the binary, and the recorder is in every build from
the one after 11 even while Reels is switched off, so the manifest
declares it from that build on. The questionnaire above adds Audio Data
only when Reels is turned on, because until then no build records or
uploads any sound.

---

## Screenshots — the bit that is actually missing

Retake the whole set on build 15 or later: the current screenshots show the
old pill buttons and the glass tab bar, and every build before 15 shows
rarity on the cards and has no My Bar tab. Stats is no longer a tab; it
opens from the Dex top bar.

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
5. **Stats**, showing collection progress and milestones.

Populate the account first. Screenshots of an empty state read as an empty
app, and this one is the opposite of empty.
