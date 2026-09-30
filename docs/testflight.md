# TestFlight copy

Paste these into App Store Connect. Written to be pasted, not edited.

Sign in with Apple and Continue with Facebook appear only in a build made
with `EXPO_PUBLIC_APPLE_SIGN_IN` and `EXPO_PUBLIC_FACEBOOK_SIGN_IN` set to
`on`. The parts that describe them sit under their own headings below;
leave those out of a build made without the two flags.

---

## Beta App Description

Sipply is a field guide to cocktails and spirits. Every drink you try is an entry to collect: 2,089 of them, made up of 899 cocktails and 1,190 spirits. Each entry carries its glassware and where it comes from; every cocktail carries the build, the measures and the method.

Log what you are drinking and it joins your Dex. Add a photo and your own shot replaces the stock artwork on that card from then on. Tell it what is on your shelf and My Bar works out what you can make tonight, and ranks the one bottle that unlocks the most.

This build reworks the interface throughout: Dex cells are photographs rather than framed thumbnails, the drink card runs full bleed, and the tab bar, filters and headings have been stripped back.

Worth trying:
- The Dex grid and its filters, and how locked entries read next to collected ones
- Logging a pour end to end, with and without a photo
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
- **Logging a drink.** Add a photo and a caption. Does it show up on your
  profile and in the feed?
- **Finding people.** Search a username, or match your contacts. Contacts
  are hashed on your device and never uploaded.
- **Your Instagram list.** In Find friends, request your followers and
  following from Instagram, then choose the .zip it sends, without
  unzipping it. Does it find the people you expected?
- **Other people's profiles.** Open someone from the feed or a list. Their
  profile opens as its own page, with Report and Block in its "..." menu.
- **The feed.** Follow someone and see whether their pours appear.
- **Stats.** Your collection progress, rarity spread, and milestones.

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
