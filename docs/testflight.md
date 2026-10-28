# TestFlight copy

Paste these into App Store Connect. Written to be pasted, not edited.

Sign in with Apple and Continue with Facebook appear only in a build made
with `EXPO_PUBLIC_APPLE_SIGN_IN` and `EXPO_PUBLIC_FACEBOOK_SIGN_IN` set to
`on`. Phone sign-in and Continue with Google work the same way, with
`EXPO_PUBLIC_PHONE_SIGN_IN` and `EXPO_PUBLIC_GOOGLE_SIGN_IN`; Google, like
Facebook, shows only beside Apple. The parts that describe each sit under
their own headings below; leave those out of a build made without the
flag.

Friends from Facebook needs `EXPO_PUBLIC_FACEBOOK_FRIENDS=on` as well, and
it is off from 28 October 2026, while Meta reviews Facebook sign-in
without `user_friends` (`specs/v4.9/meta-review.md`). With it off, leave
out the Friends from Facebook item, make Continue with Facebook ask for
"public_profile and email" in the third-party paragraphs, and leave out
their two sentences about the Facebook friends list and access token (the
cut the counts below already describe).

Build 35 is made with `EXPO_PUBLIC_FACEBOOK_SIGN_IN=off` as well, from 28
October 2026, until Meta approves the app (`specs/v4.9/meta-review.md`,
§9). Until then Facebook's page signs in only people with a role on the
Meta app, and every other tester got a page that hung or said the app is
not active. With it off there is no Continue with Facebook anywhere: use
the third-party paragraph for a build with Apple and Google sign-in, near
the end, and the Signing in item without Friends from Facebook. Someone who
made their account with Facebook in an earlier build signs in with the
email address that Facebook account uses, and sets a password by email.

Tournaments need no flag: they appear once migration 020 is applied on the
server, and stay hidden until then. Until it is, leave out every line or
sentence below that mentions them. From build 30 (v4.7) they have a tab of
their own, the trophy, second in the tab bar (build 30 itself had it on the
red key in the middle, which is the Dex's since Jan's swap), whose Friends
board (you and the people you follow, by how many different drinks each
has posted) needs migration 025 too; without 025 the tab shows tournaments
alone, so leave out the sentences about the Friends board.

Places need no flag either, but they need two things: the place-search
module, which ships inside the binary from build 33 (v4.8), and migration
026 applied on the server. Until both are there the build shows no Add
place, no "at …" line and no Where people have had it, so leave out every
line below that mentions places. Tagging also needs iOS 18 or later
(Apple's Place IDs, spec v4.8 §0.5); on an older iPhone there is no Add
place, while places others tagged still show by name.

---

## Beta App Description

[4,000 max. 1,665 as pasted, recounted for build 33 (25 Oct 2026) the way
appstore.md counts: bold marks gone, a paragraph's line breaks as spaces.
The Places line is 70 with its line break; without migration 026 leave it
out, and it is 1,595, as it was after the Dex and Tournaments swapped
places (23 Oct 2026). Build 25 was 1,451; the tournament item grew for
build 30 (1,609) and shortened with the swap.]

Sipply is a field guide to cocktails and spirits. Its Dex holds 2,089 entries, made up of 899 cocktails and 1,190 spirits. Each entry carries its glassware and where it comes from; every cocktail carries the build, the measures and the method.

Post a drink you have had and it joins your Dex. Add a photo and your own shot replaces the stock artwork on that card from then on. Answer a few questions about what you like, and the Dex opens For you, with the drinks that fit you first.

This build lets you tag the people you were with on a post, and adds Daily ideas: one notification a day at most, at a time you choose, and only if you turn them on. The Saved tab now holds collections you name and can share by link. The Dex has taste filters, Fruity among them, and its search comes back as soon as you scroll up.

Worth trying:
- Tagging the bar on a post, and the drink's Where people have had it
- Tagging someone you follow on a post, and removing yourself from a post that tags you
- Daily ideas: turn them on in Settings, set the time a few minutes ahead, and check that one arrives (none comes on a day you have posted or added a drink)
- A collection: make one, add to it, share its link, then stop sharing
- The Dex in For you and By number, with the taste filters
- A tournament with a friend who tests too: tap the trophy, second in the tab bar, host one, join it, post, and check the standings, and that the Friends board on the same tab lists you both
- Music from Spotify or Apple Music: it should keep playing when you open Sipply
- Account deletion and password reset

Anything that looks broken, slow or wrong on your screen is worth reporting.

---

## What to Test

[4,000 max. 3,843 as pasted, recounted for build 33 (26 Oct 2026) the
same way; 3,966 with the first sign-in item below added to the list, 34
to spare. Places is new (423 with its line break, after the licence
rework added iOS 18 and naming the place; 378 before that, and 334
before its Tag this place step and Apple-only maps key), and Liking,
sharing, saving (211) and Scrolling (229) came out to make room: both
shipped in builds 29 and 30 and have been tested since. Without
migration 026, leave Places out too (3,420). After the Dex and Tournaments swapped places (23
Oct 2026) it was 3,860 (3,983). Build 30 was 3,853 (3,976):
Tournaments now starts from the trophy, second in the bar, and Posting
says the red key is the Dex. Build 29 was 3,616: Tournaments, the post
keys and Posting were rewritten for the tab, the motion and the + on Home,
and Tagging, Daily ideas and the look were cut to make room.]

Thanks for trying Sipply. It's early, so tell me what's broken or confusing —
both are useful.

Worth poking at:

- **Places.** On iOS 18 or later, post a drink and tap Add place under
  the caption. Search a bar by name, or tap Show places near me (iOS asks
  for your location only then; say no once and check search still works).
  Pick one, change its name if you like, and tap Tag this place. Tap the
  place on your post to open its page and try Open in Apple Maps. On the
  drink's own page, check the bar shows under Where people have had it.
- **Tagging people.** Post a drink and tap Tag people under the caption to
  tag someone you follow. From the tagged account, check the post is in
  Activity (the heart on Home), then remove yourself from the post's "..."
  menu.
- **Daily ideas.** Turn them on in Profile → "..." (top right) → Settings
  → Notifications, set Time a few minutes ahead and wait. None comes on a
  day you have posted or added a drink. Turn them off and check nothing
  more arrives.
- **Saved collections.** On the Saved tab, tap New collection. Hold a
  bookmark to save something straight into it. In the collection's "..."
  menu, share its link, open the link on another phone, then Stop sharing
  and check the link no longer works.
- **The Dex.** 2,089 entries. With taste answers it opens For you, your
  kinds of drinks first; switch to By number for the plain order. Try the
  filters (the sliders at the end of the search field), Fruity among them,
  search, and open a few. Does it stay smooth when you scroll fast?
- **Tournaments.** Tap the trophy, second in the tab bar. Host one with
  someone you follow, join it from their account, post a drink from each,
  and check its card and its page. Each different drink adds one entry, up
  to 3 a day. Under it, Friends ranks you and the people you follow by
  different drinks posted: a new drink adds one, a re-post none. Tap a row
  to open that profile.
- **Posting a drink.** The + is now at the top of Home, beside the heart
  (the red key in the tab bar is the Dex now). Type your drink, add a photo
  and a caption. Does it show up on your profile and in the feed?
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
- **Your music.** Play something in Spotify or Apple Music, then open
  Sipply. It should keep playing through the opening film and the feed.
  Turning a video's sound on should lower your music, not stop it.
- **The look.** The red logo and its fine pen lines, a few more now: on the
  Tournaments tab, under a tournament's name, at the foot of Activity.
  Swipe the app away and open it: the film writes "sipply", then the word
  glides into Home's top bar. Tell me if anything jumps, flashes or lands
  in the wrong place, or if a pale Post key ever looks like it should work.

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

### Add for a build with Apple, Google and Facebook sign-in

Paste the first item into the "Worth poking at" list above. Add the second
only once the Meta app is Live: in development mode Facebook sign-in works
only for accounts added to the Meta app, so testers cannot try it. Build
35, with Facebook sign-in off, takes the first item alone: it names only
Apple, Google and email.

- **Signing in.** Make an account with Apple, Google or your email. You'll
  be asked to choose a username before anything else.
- **Friends from Facebook.** After continuing with Facebook, Find friends
  shows which of your Facebook friends are on Sipply. Facebook only lists
  friends who connected Sipply too, so it helps if one of them tests with
  you.

### Places, checked on the phone before review (not for pasting)

Jan's pass on build 33, from spec v4.8 §6.4. Tick each before submitting:

- [ ] Before 026: no Add place, no "at …", no Where people have had it, no
  errors. The build looks like build 32.
- [ ] After 026: Add place under Tag people; the search finds bars by name
  with location never asked.
- [ ] Show places near me shows the system prompt with the purpose string
  from `app.json`. Allow While Using lists venues within 800 m with
  distances in feet or miles. After Don't Allow, the same row reads
  "Location is off for Sipply in Settings." and opens Settings, and search
  still works. Precise Location off shows its own line.
- [ ] Tapping a result shows Tag this place with Apple's map of the venue
  (ink marker, no other points of interest, the Apple Maps logo and Legal
  link visible and Legal tappable) and Name on your post filled with
  Apple's name; Back to search keeps what was typed.
- [ ] Rename the place before tagging: the post says your name for it, and
  its page shows Apple's own name beside the map. An empty name, or one
  with a refused word, is stopped in the step and nothing posts with it.
- [ ] Searching a home address or a school finds nothing taggable.
- [ ] Save & post with a place: the feed shows "Negroni at La Factoría",
  and the place opens its page with the photo in the grid. Save to Dex
  with a place chosen posts nothing and tags nothing.
- [ ] A gallery post with a place on one photo: the line follows the photo
  and the header never jumps.
- [ ] Your "..." → Remove place takes the tag away; Add place puts one
  back.
- [ ] The place page shows the same map under its header (looked up live
  from Apple by the Place ID; the server keeps no address or position),
  and Open in Apple Maps opens the venue's own card. There is no Google
  Maps option anywhere. In airplane mode the page still shows the name,
  the counts and the drinks, without the map.
- [ ] A drink's page shows Where people have had it, places with someone
  you follow first, then the most recent, and never asks for location.
- [ ] On an iPhone below iOS 18 (if one is to hand): no Add place
  anywhere; a post tagged elsewhere still says "at …", and its page shows
  the drinks without a map.
- [ ] Someone else's post with a place: Report offers Wrong place tagged;
  the report's snapshot names the place.
- [ ] Airplane mode: the search shows its error; posting without a place
  still works.
- [ ] `plutil -p Sipply.app/Info.plist | grep -i location` prints only
  `NSLocationWhenInUseUsageDescription`.
- [ ] `scripts/check-native-links.sh` passes on the archive.

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

### Add Daily ideas to every build from 25, and tournaments, places and story music when it has them

Every build from 25: paste the **Daily ideas** paragraph from the App
Review notes in [appstore.md](appstore.md) into the notes above.
Tournaments (migration 020 applied): paste its **Tournaments** paragraph
too. Places (build 33 or later, with migration 026 applied): paste its
**Places** paragraph, and leave out the Tournaments paragraph's last
sentence to make room. People notifications (build 34 or later, with
migration 027 applied): paste its **People notifications** paragraph
straight after Daily ideas, with the Tournaments paragraph's "no
notifications but the invite" as appstore.md now has it. Story music
(`EXPO_PUBLIC_STORY_MUSIC=tap`): paste its **Songs on posts** paragraph as
well. Each is written once, there, so the two sets of notes cannot drift
apart.

This field has the same 4,000-character limit, measured the way
appstore.md measures it: bold marks gone, each paragraph's line breaks as
spaces, a blank line between paragraphs. Sign-in through Instagram is
2,339 now, with Tags, the age rating's second sentence and the "..." step
in three Settings paths (1,957 before). Build 25 has Apple, Google and
Facebook sign-in, tournaments and Daily ideas, and no phone sign-in or
songs. With the 896 third-party paragraph, Tournaments (644) and Daily
ideas (498), that is 4,383, 383 over. Shorten Contacts and Instagram to
their first two sentences, as appstore.md does, and it is 3,768, 232 to
spare. A build with phone sign-in as well comes to 4,234 with its code
line; take Contacts and Instagram down to their first sentence too and it
is 3,988, 12 to spare. Songs in place of phone sign-in need that cut and
the third-party paragraph's two sentences about the Facebook friends list
and access token dropped as well: 3,882, 118 to spare. Songs and phone
sign-in together do not fit. Count before pasting.

Since the Dex and Tournaments swapped places (23 Oct 2026) the
Tournaments paragraph is 833, not 644: it starts from the trophy, second
in the tab bar, and adds a sentence on the Friends board (build 30's, from
the red key in the middle, was 847). Uncut, the build-25 set is then
4,572; with the two-sentence cut it is 3,957, 43 to spare. Phone sign-in
or songs on top need the deeper cuts, and appstore.md has that recount.
Without migration 025, leave out the paragraph's last sentence (173), and
it is 660.

Build 33's Places paragraph (522) needs every cut: Contacts and Instagram
down to their first sentence, the third-party paragraph's two Facebook
sentences dropped, and Tournaments without its last sentence. That set
is 3,831, 169 to spare (recounted 26 Oct 2026; 4,004 with the Friends
sentence kept, 4 over). Phone sign-in or songs do not fit beside it;
appstore.md has the recount.

Build 34's People notifications (199) and the invite in Tournaments (15)
need one cut more: Continue with Google's clause about its access token,
which the privacy policy carries. With Friends from Facebook off, that set
is 3,971, 29 to spare (recounted 28 Oct 2026); appstore.md has the
recount.

Build 35 has Continue with Facebook off, so its third-party paragraph is
the one for a build with Apple and Google sign-in, below (471, against the
589 above): the same set is 3,853, 147 to spare (recounted 28 Oct 2026),
and `specs/v4.9/review-notes.txt` has the exact text.

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

### Third-party accounts — a build WITH Apple and Google sign-in, without Facebook

Build 35 and every build until Meta approves the app
(`EXPO_PUBLIC_FACEBOOK_SIGN_IN=off`). This is the paragraph in
`specs/v4.9/review-notes.txt`. Once the flag is back on, the paragraph
after it is the one to paste again.

**Third-party accounts?** Sign in with Apple and Continue with Google,
alongside email. Sign in with Apple is shown wherever Continue with Google
is (guideline 4.8), and either one asks a new account to choose a username
before anything else. Continue with Google asks for openid, email and
profile only, and runs in the system authentication sheet; there is no
Google SDK in the app. The other outside services are Supabase for hosting
and sign-in, and Expo for app updates.

[471]

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
