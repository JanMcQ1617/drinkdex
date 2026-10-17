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

[4,000 max. 1,451 as pasted, counted for build 25 the way appstore.md
counts: bold marks gone, a paragraph's line breaks as spaces.]

Sipply is a field guide to cocktails and spirits. Its Dex holds 2,089 entries, made up of 899 cocktails and 1,190 spirits. Each entry carries its glassware and where it comes from; every cocktail carries the build, the measures and the method.

Post a drink you have had and it joins your Dex. Add a photo and your own shot replaces the stock artwork on that card from then on. Answer a few questions about what you like, and the Dex opens For you, with the drinks that fit you first.

This build lets you tag the people you were with on a post, and adds Daily ideas: one notification a day at most, at a time you choose, and only if you turn them on. The Saved tab now holds collections you name and can share by link. The Dex has taste filters, Fruity among them, and its search comes back as soon as you scroll up.

Worth trying:
- Tagging someone you follow on a post, and removing yourself from a post that tags you
- Daily ideas: turn them on in Settings, set the time a few minutes ahead, and check that one arrives (none comes on a day you have posted or added a drink)
- A collection: make one, add to it, share its link, then stop sharing
- The Dex in For you and By number, with the taste filters
- A tournament with a friend who tests too: host it from the "..." menu on your profile, join it, post, and check the standings
- Account deletion and password reset

Anything that looks broken, slow or wrong on your screen is worth reporting.

---

## What to Test

[4,000 max. 3,038 as pasted, recounted after build 25 the same way;
3,428 with the two sign-in items below added to the list.]

Thanks for trying Sipply. It's early, so tell me what's broken or confusing —
both are useful.

Worth poking at:

- **Tagging people.** Post a drink and tap Tag people under the caption to
  tag someone you follow, up to 10. On a post you already shared, its "..."
  menu has Tag people too. From the tagged account, check the post is in
  Activity (the heart on Home), then use the post's "..." menu to remove
  yourself.
- **Daily ideas.** Sipply offers them after you post or save something;
  you can also turn them on in Profile → "..." (top right) → Settings →
  Notifications. Set Time a few minutes ahead and wait. Try it on a day you
  haven't posted or added a drink yet: on a day you have, no idea comes.
  Turn them off and check nothing more arrives.
- **Saved collections.** On the Saved tab, tap New collection. Hold a
  bookmark to save something straight into it. In the collection's "..."
  menu, share its link, open the link on another phone, then Stop sharing
  and check the link no longer works.
- **The Dex.** 2,089 entries. With taste answers it opens For you, your
  kinds of drinks first; switch to By number for the plain order. Try the
  filters (the sliders at the end of the search field), Fruity among them,
  search, and open a few. Does it stay smooth when you scroll fast?
- **Scrolling.** Scroll down the Dex and the search field and filters slide
  away; scroll up a little and they come back. Home's top bar does the
  same. Tell me if either gets stuck halfway, or a tab ever shows up blank
  or half drawn.
- **Posting a drink.** Add a photo and a caption. Does it show up on your
  profile and in the feed?
- **Tournaments.** Open Profile → "..." → Tournaments and host one with
  someone you follow. Join it from their account, post a drink from each,
  and check the standings. Each different drink posted adds one entry, up
  to 3 a day. Try ending one, and deleting one.
- **Finding people.** Search a username, or match your contacts. Contacts
  are hashed on your device and never uploaded.
- **Your Instagram list.** In Find friends, request your followers and
  following from Instagram, then choose the .zip it sends, without
  unzipping it. Does it find the people you expected?
- **Other people's profiles.** Open someone from the feed or a list. Their
  profile opens as its own page, with Report account and Block in its "..."
  menu.
- **The feed.** Follow someone and see whether their posts appear.
- **Dex progress.** Tap the count at the top of the Dex, or "entries in your
  Dex" on your profile.

Please report:

- Anything that crashes, hangs, or shows an error you can't get out of
- A photo that fails to upload or appears on the wrong post
- Anything that looks wrong — spacing, colour, text that's cut off
- Anything you expected to be able to do and couldn't

Two things I already know about: the app is 18+ and alcohol-focused by
design, and your collection lives on your device — signing in elsewhere
won't bring it with you.

You can delete your account any time from **Profile → "..."** (top right)
**→ Settings → Delete account**. It removes everything, including your
photos.

### Add for a build with Apple and Facebook sign-in

Paste these two items into the "Worth poking at" list above:

- **Signing in with Apple or Facebook.** Make an account with either
  button, or with Google in a build that has it. You'll be asked to choose
  a username before anything else.
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
Blocks can be undone from Profile → "..." → Settings → Blocked accounts.
Captions, bios, display names and usernames pass a server-side filter that
refuses slurs and explicit sexual terms before they are saved.

**Tags.** A post can tag up to 10 people its author follows, never anyone
they are blocked with either way. Anyone tagged can remove themselves from
the post's "..." menu, and a post with tags is reported like any other.

**Account deletion.** Profile → "..." (top right) → Settings → Delete
account. Deletes the account, all posts, all photos and all follows. No
email or support request needed.

**Age rating.** 18+. Sipply is for people of legal drinking age where
they live: its first screens ask, and stop anyone who answers no, and every
new account confirms it. The app is about alcoholic drinks and includes
references to alcohol throughout. It does not sell alcohol, does not
facilitate purchase, and contains no commerce of any kind.

**Contacts.** The app asks for contacts access, but contacts are **not
collected**. Phone numbers are salted-SHA-256 hashed on the device and the
hashes are sent as query arguments, at most 500 per call, to a matching
function that stores none of them. It records only a count per account, to
enforce a limit of 3,000 hashes per rolling 24 hours. The only value
retained is the user's own phone hash, which is what makes them findable,
and it is cleared by "Stop being findable" in Profile → "..." → Settings →
Find friends.

**Instagram.** There is no Instagram login and no Instagram API. The user
picks their own Instagram data download (the .zip Instagram sends). It is
read on the device, and only its followers and following files, and its
personal information file when there is one, are unpacked; from that last
file only the user's own username is read, and it is stored, as a hash,
only if the user accepts it. The usernames are hashed and matched the same way as
phone numbers, under the same limit.

### Add Daily ideas to every build from 25, and tournaments and story music when it has them

Every build from 25: paste the **Daily ideas** paragraph from the App
Review notes in [appstore.md](appstore.md) into the notes above.
Tournaments (migration 020 applied): paste its **Tournaments** paragraph
too. Story music (`EXPO_PUBLIC_STORY_MUSIC=tap`): paste its **Songs on
posts** paragraph as well. Each is written once, there, so the two sets of
notes cannot drift apart.

This field has the same 4,000-character limit, measured the way
appstore.md measures it: bold marks gone, each paragraph's line breaks as
spaces, a blank line between paragraphs. Sign-in through Instagram is
2,339 now, with Tags, the age rating's second sentence and the "..." step
in three Settings paths (1,957 before). Build 25 has Apple, Google and
Facebook sign-in, tournaments and Daily ideas, and no phone sign-in or
songs. With the 896 third-party paragraph, Tournaments (652) and Daily
ideas (498), that is 4,391, 391 over. Shorten Contacts and Instagram to
their first two sentences, as appstore.md does, and it is 3,776, 224 to
spare. A build with phone sign-in as well comes to 4,242 with its code
line; take Contacts and Instagram down to their first sentence too and it
is 3,996, 4 to spare. Songs in place of phone sign-in need that cut and
the third-party paragraph's two sentences about the Facebook friends list
and access token dropped as well: 3,890, 110 to spare. Songs and phone
sign-in together do not fit. Count before pasting.

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
