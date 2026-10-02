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
the total, then a count for each category and each rarity:

```sh
node -e 'const d=require("./src/data/drinks.json"),c={};for(const x of d){c[x.category]=(c[x.category]||0)+1;c[x.rarity]=(c[x.rarity]||0)+1}console.log(d.length,c)'
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
2,089 drinks waiting to be found: 1,190 spirits and 899 cocktails with real recipes. Log what you pour, keep the photo, and see what your friends are drinking.
```

[159]

---

## Description — 4000 max

```
Sipply is a field guide to drinks, and a record of the ones you have had.

Every cocktail and every bottle is an entry to find. There are 2,089 of them — 899 cocktails and 1,190 spirits — and each one tells you the glass it belongs in and where it comes from. Every cocktail carries its real recipe, the proper measures, and the story behind it.

Entries start locked. You collect one by drinking it: log the pour, add a photo and a note, and the card turns over and joins your collection.

THE DEX

Search it, filter it by category, or just scroll and find something you have never heard of. Some entries are everywhere — a Margarita, a Negroni. Others are genuinely obscure: a 1930s Mexico City sour the world forgot for seventy years, a whisky forgotten in a warehouse for two decades, a Mallorcan bitter sold against malaria that outlived the malaria.

Entries are graded common, uncommon, rare and legendary. There are 229 legendary cards and you will not find them by accident.

YOUR SHELF

Log a drink and it lands on your profile with your own photograph of it — not a stock picture of someone else's glass. Your collection, your notes, your camera roll.

Stats show you what you have covered and what you have not: progress by category and by rarity, and the milestones you are closing in on.

PEOPLE

Follow other collectors and see what they have been pouring. Find friends by username, or match your contacts — phone numbers are scrambled on your phone before they are compared, and your address book is never uploaded.

Continue with Facebook and see which of your Facebook friends are already here. Facebook only shows Sipply the friends who connected it too, and Sipply never posts anything there.

If you would rather bring your Instagram circle, ask Instagram for a copy of your followers and following and hand Sipply the .zip it sends. Sipply never connects to your Instagram account: the file is read on your phone, and the usernames in it are scrambled there before they are compared.

WHAT SIPPLY DOES NOT DO

No ads. No analytics. No trackers. No advertising identifier. Nothing is sold or shared with anyone, and there is nothing to buy inside the app.

Sipply does not sell alcohol and cannot be used to order it. It is a reference and a diary, nothing more.

You can delete your account from Settings inside the app, without emailing anyone. It takes your posts and your photos with it.

—

Sipply is for people old enough to drink where they live. Please drink responsibly, and never drive after drinking.
```

[2,532 — comfortably inside 4000, with room if you want to add a line]

The Facebook paragraph under PEOPLE describes a build made with
`EXPO_PUBLIC_FACEBOOK_SIGN_IN=on`. If the build you submit has it off,
delete that paragraph, and the count drops by 181.

---

## What's New

Not required for a first release. App Store Connect will ask for it on
every update after this one.

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
Instagram and Facebook lists, and which pours and activity have been seen.
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
| User Content → Other User Content | Yes | Captions, bios, likes, saves, follows, invites, drink suggestions, reports and the copy a report keeps |
| Identifiers → User ID | Yes | The account id and username; the id Apple or Facebook issues for Sipply, and the id Google issues; the hash of the user's own Instagram handle |
| Identifiers → Device ID | **No** | The random installation id Expo's update check sends. Expo keeps it to deliver updates and count installs per version; nothing ties it to an account |
| Usage Data → Other Usage Data | Yes | How many phone numbers or handles an account checked, from which list, and when; kept only to enforce the 3,000-a-day matching limit. Also, with no account attached, the sign-in screen's hour-long meter of email checks, kept per scrambled IP address |

App Functionality covers the last one: Apple's definition of the purpose
includes preventing fraud and implementing security measures, which is what
the matching limit and the sign-in meter are. Device ID stays App
Functionality only as long as Expo's install counts are used for checking
rollouts; if they start informing product decisions, add Analytics to it.

Everything else is **Not collected**: Contacts, Location (photos are
re-encoded without it), Search History (the Dex is searched on the
phone), Browsing History, Health, Financial Info, Purchases, Sensitive
Info, Product Interaction, Advertising Data, Diagnostics and Other Data.

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

Retake the whole set on the v2 build: the current screenshots show the old
pill buttons and the glass tab bar. Stats is no longer a tab; it opens
from the Dex top bar.

Required: **6.9" iPhone**, 1320 × 2868 or 1290 × 2796. Apple scales that
set down to the smaller sizes, so one set is enough.

The first two are what people see in search results without tapping
through. Lead with the two that carry the scale and the payoff:

1. **The Dex grid**, scrolled to somewhere dense. This is the shot that
   sells 2,089 entries; nothing else in the app communicates the size of
   it in one frame.
2. **An open drink card** — ideally a legendary one, so the rarity
   treatment is visible.
3. **Logging a pour**, with a real photograph attached.
4. **The feed**, with a few different people in it.
5. **Stats**, showing collection progress and the rarity spread.

Populate the account first. Screenshots of an empty state read as an empty
app, and this one is the opposite of empty.
