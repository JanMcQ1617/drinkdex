# TestFlight copy

Paste these into App Store Connect. Written to be pasted, not edited.

Sign in with Apple and Continue with Facebook appear only in a build made
with `EXPO_PUBLIC_APPLE_SIGN_IN` and `EXPO_PUBLIC_FACEBOOK_SIGN_IN` set to
`on`. Phone sign-in and Continue with Google work the same way, with
`EXPO_PUBLIC_PHONE_SIGN_IN` and `EXPO_PUBLIC_GOOGLE_SIGN_IN`; Google, like
Facebook, shows only beside Apple. The parts that describe each sit under
their own headings below; leave those out of a build made without the
flag.

Tournaments need no flag: they appear once migration 020 is applied on the
server, and stay hidden until then. Until it is, leave out every line or
sentence below that mentions them.

---

## Beta App Description

Sipply is a field guide to cocktails and spirits. Every drink you try is an entry to collect: 2,089 of them, made up of 899 cocktails and 1,190 spirits. Each entry carries its glassware and where it comes from; every cocktail carries the build, the measures and the method.

Post what you are drinking and it joins your Dex. Add a photo and your own shot replaces the stock artwork on that card from then on. Tell it what is on your shelf and My Bar works out what you can make tonight, and ranks the one bottle that unlocks the most.

This build turns the stories at the top of Home into circles, gives My Bar a tab of its own, and drops rarity: an entry is simply collected or not yet. It also adds tournaments with people you follow.

Worth trying:
- The Dex grid and its filters, and how locked entries read next to collected ones
- Posting a drink end to end, with and without a photo
- A tournament with a friend who tests too: host it, join it, post, and check the standings
- My Bar: tick a dozen bottles and check whether what it says you can make is right
- Account deletion and password reset

Anything that looks broken, slow or wrong on your screen is worth reporting.

---

## What to Test

Thanks for trying Sipply. It's early, so tell me what's broken or confusing —
both are useful.

Worth poking at:

- **The Dex.** 2,089 entries. Filter by category, search, and open a few.
  Does it stay smooth when you scroll fast?
- **Posting a drink.** Add a photo and a caption. Does it show up on your
  profile and in the feed?
- **Stories.** The circles at the top of Home are today's posts; a wine
  ring means you haven't opened it yet. Open your own and use its "..."
  menu to delete a post. Does it disappear from the circles and the feed?
- **Tournaments.** Tap the trophy at the top of Home and host one with
  someone you follow. Join it from their account, post a drink from each,
  and check the standings. Each different drink counts once, up to 3 new
  ones a day. Try ending one, and deleting one.
- **My Bar.** It has its own tab now, next to the +. Tick what's on your
  shelf and check what it says you can make.
- **Scrolling.** Scroll down Home, the Dex, My Bar or your profile: the tab
  bar shrinks to icons and Home's top bar slides away. Scroll up and both
  come back. Tell me if either gets stuck halfway, or a tab ever shows up
  blank or half drawn.
- **Finding people.** Search a username, or match your contacts. Contacts
  are hashed on your device and never uploaded.
- **Your Instagram list.** In Find friends, request your followers and
  following from Instagram, then choose the .zip it sends, without
  unzipping it. Does it find the people you expected?
- **Other people's profiles.** Open someone from the feed or a list. Their
  profile opens as its own page, with Report and Block in its "..." menu.
- **The feed.** Follow someone and see whether their posts appear.
- **Stats.** Your collection progress and milestones.

Please report:

- Anything that crashes, hangs, or shows an error you can't get out of
- A photo that fails to upload or appears on the wrong post
- Anything that looks wrong — spacing, colour, text that's cut off
- Anything you expected to be able to do and couldn't

Two things I already know about: the app is 18+ and alcohol-focused by
design, and your collection lives on your device — signing in elsewhere
won't bring it with you.

You can delete your account any time from **Profile → Settings** (the gear,
top right) **→ Delete account**. It removes everything, including your
photos.

### Add for a build with Apple and Facebook sign-in

Paste these two items into the "Worth poking at" list above:

- **Signing in with Apple or Facebook.** Make an account with either
  button. You'll be asked to choose a username before anything else.
- **Friends from Facebook.** After continuing with Facebook, Find friends
  shows which of your Facebook friends are on Sipply. Facebook only lists
  friends who connected Sipply too, so it helps if one of them tests with
  you.

---

## Feedback Email

mcqueeny1617@gmail.com

---

## Test Information — notes for Beta App Review

**Sign-in required?** Yes. Reviewers can create an account with any email;
there is no invite code or gate.

**User-generated content.** Sipply has posts, photos and usernames from
other users. Reporting and blocking are both available from the "..." menu
on any post or profile that isn't yours: report offers a reason, block is
immediate and symmetric, and removes any follow between the two accounts.
Blocks can be undone from Profile → Settings → Blocked accounts. Captions,
bios, display names and usernames pass a server-side filter that refuses
slurs and explicit sexual terms before they are saved.

**Account deletion.** Profile → Settings (the gear, top right) → Delete
account. Deletes the account, all posts, all photos and all follows. No
email or support request needed.

**Age rating.** 18+. The app is about alcoholic drinks and includes
references to alcohol throughout. It does not sell alcohol, does not
facilitate purchase, and contains no commerce of any kind.

**Contacts.** The app asks for contacts access, but contacts are **not
collected**. Phone numbers are salted-SHA-256 hashed on the device and the
hashes are sent as query arguments, at most 500 per call, to a matching
function that stores none of them. It records only a count per account, to
enforce a limit of 3,000 hashes per rolling 24 hours. The only value
retained is the user's own phone hash, which is what makes them findable,
and it is cleared by "Stop being findable" in Profile → Settings → Find
friends.

**Instagram.** There is no Instagram login and no Instagram API. The user
picks their own Instagram data download (the .zip Instagram sends). It is
read on the device, and only its followers and following files, and its
personal information file when there is one, are unpacked; from that last
file only the user's own username is read, and it is stored, as a hash,
only if the user accepts it. The usernames are hashed and matched the same way as
phone numbers, under the same limit.

### Add for a build with tournaments, and for one with story music

Tournaments (migration 020 applied): paste the **Tournaments** paragraph
from the App Review notes in [appstore.md](appstore.md) into the notes
above. Story music (`EXPO_PUBLIC_STORY_MUSIC=tap`): paste its **Songs on
posts** paragraph too. Both are written once, there, so the two sets of
notes cannot drift apart. This field has the same 4,000-character limit,
and the measured budget beside those paragraphs applies here as well.

### Add for a build with phone sign-in

Paste this into the notes, then add the test code on the line after it.
The code is set beside the number in Supabase → Authentication → Sign In /
Providers → Phone → **Test phone numbers and OTPs**, and it is kept out of
this file on purpose: the repository is public, and the number with its
code signs anyone in to that account. For the same reason, make the code
random rather than 123456 or another easy guess: the number is written
here, so the code is all that guards the account. Supabase gives each test
number an expiry date; check it has not passed before you submit.

**Phone sign-in.** Reviewers can try it without a SIM: enter the test
number +1 (787) 555-0100, then the six-digit code below. No text message is
sent; this number's code is fixed. The first sign-in creates an account and
asks for a username before anything else, as it does for any new number.
Email sign-in still works as described above. For real numbers, the text
message is sent by Twilio Verify, configured in Supabase; the app has no
SMS code of its own.

### Third-party accounts — a build WITHOUT Apple and Facebook sign-in

**Third-party accounts?** None. No social login. The only outside services
are Supabase for hosting and Expo for app updates.

### Third-party accounts — a build WITH Apple and Facebook sign-in

**Third-party accounts?** Sign in with Apple and Continue with Facebook,
alongside email. Sign in with Apple is shown wherever Continue with
Facebook is (guideline 4.8), and either one asks a new account to choose a
username before anything else. Continue with Facebook asks for
public_profile, email and user_friends, and runs in the system
authentication sheet; there is no Facebook SDK in the app. The friends list
is read on the device, and only the app-scoped ids of friends who also use
Sipply are sent to a matching function, which stores none of them. The
Facebook access token stays in memory and is never stored. The other
outside services are Supabase for hosting and sign-in, and Expo for app
updates.

### Third-party accounts — a build WITH Apple, Google and Facebook sign-in

**Third-party accounts?** Sign in with Apple, Continue with Google and
Continue with Facebook, alongside email. Sign in with Apple is shown
wherever Continue with Google or Continue with Facebook is (guideline 4.8),
and each one asks a new account to choose a username before anything else.
Continue with Google asks for openid, email and profile only; its access
token is discarded on the device and never stored. Continue with Facebook
asks for public_profile, email and user_friends. Both run in the system
authentication sheet; there is no Google or Facebook SDK in the app. The
Facebook friends list is read on the device, and only the app-scoped ids of
friends who also use Sipply are sent to a matching function, which stores
none of them. The Facebook access token stays in memory and is never
stored. The other outside services are Supabase for hosting and sign-in,
and Expo for app updates.
