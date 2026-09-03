# App Store listing copy

Paste these into App Store Connect. Written to be pasted, not edited.

Character limits are Apple's; the counts in brackets are what these
actually use, so there is room to fiddle without going over.

Every number here was counted out of `src/data/drinks.json` rather than
remembered. If the Dex grows before you submit, recount — an inflated
number in a listing is the kind of thing that is easy to write and
awkward to defend.

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
7,653 drinks. Collect them.
```
[27]

---

## Keywords — 100 max, comma-separated, NO spaces

```
cocktail,beer,wine,whisky,whiskey,spirits,bar,recipes,tasting,journal,brewery,vintage,mixology,pour
```

[99]

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
7,653 drinks waiting to be found: 3,224 beers, 2,369 wines, 1,178 spirits and 882 cocktails. Log what you pour, keep the photo, and see what your friends are drinking.
```

[165]

---

## Description — 4000 max

```
Sipply is a field guide to drinks, and a record of the ones you have had.

Every cocktail, beer, wine and spirit is an entry to find. There are 7,653 of them — 3,224 beers, 2,369 wines, 1,178 spirits and 882 cocktails — and each one tells you the glass it belongs in and where it comes from. Every cocktail carries its real recipe, the proper measures, and the story behind it.

Entries start locked. You collect one by drinking it: log the pour, add a photo and a note, and the card turns over and joins your collection.

THE DEX

Search it, filter it by category, or just scroll and find something you have never heard of. Some entries are everywhere — a Margarita, a Hefeweizen. Others are genuinely obscure: a 1930s Mexico City sour nobody wrote down for seventy years, a whisky forgotten in a warehouse for two decades, an amber lager invented in Vienna that only survived an ocean away.

Entries are graded common, uncommon, rare and legendary. There are 402 legendary cards and you will not find them by accident.

YOUR SHELF

Log a drink and it lands on your profile with your own photograph of it — not a stock picture of someone else's glass. Your collection, your notes, your camera roll.

Stats show you what you have covered and what you have not: progress by category, how your rarity spread compares, and the milestones you are closing in on.

PEOPLE

Follow other collectors and see what they have been pouring. Find friends by username, or match your contacts — phone numbers are turned into one-way hashes on your phone and your contacts are never uploaded.

If you would rather bring your Instagram circle, you can import the follower list Instagram gives you when you download your own data. Sipply never connects to your Instagram account and never learns which handle belongs to which person here.

WHAT SIPPLY DOES NOT DO

No ads. No analytics. No trackers. No advertising identifier. Nothing is sold or shared with anyone, and there is nothing to buy inside the app.

Sipply does not sell alcohol and cannot be used to order it. It is a reference and a diary, nothing more.

You can delete your account from inside the app, in one tap, without emailing anyone. It takes your posts and your photos with it.

—

Sipply is for people old enough to drink where they live. Please drink responsibly, and never drive after drinking.
```

[~2,180 — comfortably inside 4000, with room if you want to add a line]

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

**The support URL 404s until `docs/` is merged to `main`.** Pages serves
from `main` / `/docs`, so the branch alone does not publish it. Check that
it resolves before you submit — a support URL that 404s is a rejection.

---

## Screenshots — the bit that is actually missing

Required: **6.9" iPhone**, 1320 × 2868 or 1290 × 2796. Apple scales that
set down to the smaller sizes, so one set is enough.

The first two are what people see in search results without tapping
through. Lead with the two that carry the scale and the payoff:

1. **The Dex grid**, scrolled to somewhere dense. This is the shot that
   sells 7,653 entries; nothing else in the app communicates the size of
   it in one frame.
2. **An open drink card** — ideally a legendary one, so the rarity
   treatment is visible.
3. **Logging a pour**, with a real photograph attached.
4. **The feed**, with a few different people in it.
5. **Stats**, showing collection progress and the rarity spread.

Populate the account first. Screenshots of an empty state read as an empty
app, and this one is the opposite of empty.
