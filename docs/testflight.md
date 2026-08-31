# TestFlight copy

Paste these into App Store Connect. Written to be pasted, not edited.

---

## Beta App Description

Sipply is a field guide to drinks. Every cocktail, beer, wine and spirit you
try is an entry to collect — 460 of them, with the real recipe, the
glassware, and where it comes from. Log what you're drinking, keep a photo,
and see what the people you follow have been having.

---

## What to Test

Thanks for trying Sipply. It's early, so tell me what's broken or confusing —
both are useful.

Worth poking at:

- **The Dex.** 460 entries. Filter by category, search, and open a few.
  Does it stay smooth when you scroll fast?
- **Logging a drink.** Add a photo and a caption. Does it show up on your
  profile and in the feed?
- **Finding people.** Search a username, or match your contacts. Contacts
  are hashed on your device and never uploaded.
- **The feed.** Follow someone and see whether their pours appear.
- **Stats.** Your collection progress, rarity spread, and milestones.

Please report:

- Anything that crashes, hangs, or shows an error you can't get out of
- A photo that fails to upload or appears on the wrong post
- Anything that looks wrong — spacing, colour, text that's cut off
- Anything you expected to be able to do and couldn't

Two things I already know about: the app is 18+ and alcohol-focused by
design, and your collection lives on your device — signing in elsewhere
won't bring it with you yet.

You can delete your account any time from **Profile → Delete account**. It
removes everything, including your photos.

---

## Feedback Email

mcqueeny1617@gmail.com

---

## Test Information — notes for Beta App Review

**Sign-in required?** Yes. Reviewers can create an account with any email;
there is no invite code or gate.

**User-generated content.** Sipply has posts, photos and usernames from
other users. Reporting and blocking are both available from the "..." menu
on any post that isn't yours: report offers a reason, block is immediate
and symmetric, and removes any follow between the two accounts.

**Account deletion.** Profile → Delete account. Deletes the account, all
posts, all photos and all follows. No email or support request needed.

**Age rating.** 18+. The app is about alcoholic drinks and includes
references to alcohol throughout. It does not sell alcohol, does not
facilitate purchase, and contains no commerce of any kind.

**Contacts.** The app asks for contacts access, but contacts are **not
collected**. Phone numbers are salted-SHA-256 hashed on the device and the
hashes are sent as query arguments to a read-only matching function that
stores nothing. The only value retained is the user's own phone hash, which
is what makes them findable, and it is cleared by "Stop being findable" in
Profile → Accounts.

**Third-party accounts?** None. No social login, no external services
beyond hosting.
