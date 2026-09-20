# TestFlight copy

Paste these into App Store Connect. Written to be pasted, not edited.

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
