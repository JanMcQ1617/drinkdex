# v4.15: Dex titles count cocktails and spirits

Jan's decision: a Dex title (the "rank") is read over cocktails and spirits only. Wine never counts toward a title or against one, and neither will any wine bottlings added later.

## What a Dex rank is

The **title** on Dex progress (the page behind the Dex's "38 / 4,671" and Profile's "38 entries in your Dex"). There are six, each one a share of the catalogue logged:

| Title | Share | Count now (of 2,327 cocktails and spirits) |
|---|---:|---:|
| Note taker | first entry | 1 |
| Cataloguer | 10% | 233 |
| Archivist | 25% | 582 |
| Scholar | 50% | 1,164 |
| Curator | 75% | 1,746 |
| Keeper of the Dex | 100% | 2,327 |

Dex progress shows the title beside the Dex count, a ruler with a notch at each rung, and "Next: Cataloguer, at 233". When a pour crosses a rung, a title card follows its collected card ("Archivist. Your Dex now holds 582 of 2,327 cocktails and spirits"). Note taker is never announced, and a title is announced only once (`bestRung`). The title is only on your own phone. Nobody else sees it, and it is not the place in a tournament or on the Friends board (those count posts, on the server).

Until now the share was of the **whole Dex**. In v4.14 wine came back as 2,344 cards, and that took the Dex from 2,327 to 4,671. So a title could drop a rung or two for nothing the person did. 233 logged went from Cataloguer to Note taker (wine-restore.md flagged it, and build 40's What to Test admits it).

## The change

**share = cocktails and spirits logged ÷ cocktails and spirits in the Dex** (2,327). Everything else on Dex progress still counts the whole Dex: the figure, "of 4,671 in the Dex · 0.8%", and the bars for each kind.

- `src/lib/milestones.ts` owns the scope:
  - `onLadder(category)` is true for cocktail and spirit. It is an allowlist, not "not wine", so a new kind (a shelf of wine bottlings under its own category, say) stays off the ladder until someone adds it.
  - `LADDER_TOTAL` is the count of those cards in the catalogue.
  - `ladderCount(unlocks)` counts catalogue cocktails and spirits in a collection. Wines, retired ids and added drinks don't count.
  - `rungCounts` moved here from `components/Ruler.tsx`, next to `rankTitle`, whose arithmetic it has to match. `nextRung` (the old inline "Next" lookup) is new. `rankTitle` and `milestoneCrossed` are unchanged: they take a count and a total, and every caller now passes the ladder's.
- `src/store/collection.ts`:
  - `rungAt` and `settle()` seed `bestRung` from `ladderCount(unlocks)` against `LADDER_TOTAL`.
  - `enter()` counts `before` on the ladder. `after` is `before + 1` only for a cocktail or spirit, so a wine leaves the count where it was and `milestoneCrossed` returns null.
  - The milestone card's `collected` is the ladder count.
- `src/components/Ruler.tsx`: `DexPanel` takes `count`/`total` (the Dex) and `ladder`/`ladderTotal` (the title).
  - The figure and "of 4,671 in the Dex · %" stay the Dex's.
  - The title word, the ladder ruler's fill, notches and figures (233 · 582 · 1,164 · 1,746 · 2,327), and the lines under the panel read the ladder.
  - A new first line under the panel, **"Titles count cocktails and spirits: 38 of 2,327"**, says why the ruler's fill no longer matches the percentage above it. The ruler's VoiceOver label is that same line, and the visible text is hidden from VoiceOver so it is heard once.
  - The Next line is now "Next: Cataloguer, at 233". It used to end "at 209 entries"; it dropped "entries" because the line above names the unit. It still names where the rung starts, never how many more (1.4.3).
  - The two lines measure 274pt at their widest ("2,327 of 2,327"), which fits on one line in 327pt (375 wide, 24 gutters).
- `src/components/CollectionStats.tsx`: `deriveStats` counts the ladder in the same pass (`onLadder`) and hands `LADDER_TOTAL` to the panel.
- `src/components/CelebrationOverlay.tsx`: the title card and its VoiceOver line now say "Your Dex now holds 233 of 2,327 cocktails and spirits" instead of "…233 of 4,671 entries". That line is about 308pt, so on a 375-wide phone it wraps to two centred lines inside the card's 279pt. The collected card still says "of 4,671 in your Dex".
- `src/store/celebrate.ts`: comment only (what `collected` means on a milestone).

Searched and needing nothing: Profile and the profile header (they show the Dex count, not the title), Settings (its v3 rank line was moved to Dex progress), PeerProfile, the Friends board and tournaments (server ranks of posts), daily ideas (`{caught}`/`{total}` are the whole Dex and no idea names a title), the share page `docs/c/`, Supabase (no title on the server), and the check scripts (none reads the ladder).

## Celebrations: what this change fires, and what it doesn't

A title can now **rise** at the first launch of this build, without a pour. Example: 300 cocktails and spirits read Note taker against 4,671 (6.4%) and read Cataloguer against 2,327 (12.9%). That rise is the ladder changing, not something the person did, so **it gets no card**. This follows the existing design: `milestoneCrossed` compares titles rather than counts, and `settle()` seeds `bestRung` so the app never re-awards a title someone already holds.

- **At launch**, `settle()` sets `bestRung = max(saved, rungAt(ladderCount))` before anything can be logged. The raised title counts as already held. This runs on every launch (no persist version bump is needed), so it holds even before the new value has been written back.
- **On a pour**, `milestoneCrossed(before, after, LADDER_TOTAL)` reads both counts against the same total. A title that changed only because the total changed is never a crossing. The next rung up still gets its card when a pour crosses it (582 → Archivist), with 582 on it.
- **A wine** gets its collected card, and it never gets a title card: the ladder count doesn't move.
- **`bestRung` is never lowered.** A build 40 tester whose wines made Cataloguer (100 cocktails and spirits + 400 wines = 500 of 4,671), and who saw that card, now reads Note taker. When their cocktails and spirits reach 233 they are Cataloguer again **without a second card**. Lowering `bestRung` instead would replay titles people have already seen, which is what the rule exists to prevent. Build 40 only went to testers, so few people can be in this case.
- **Nothing logged but wine**: the title is "Not started", the same word as an empty Dex, and Dex progress shows "Titles count cocktails and spirits: 0 of 2,327" with no Next line. Their first cocktail or spirit makes them a Note taker, unannounced like every first rung. A title word for a Dex holding only wine is Jan's call; the default keeps the rule strict.

Against build 39 (the Dex was the 2,327 cocktails and spirits, no wine), every title is **exactly** what it was, at every count. Against build 40, for someone who has logged no wine, 1,981 of the 2,328 possible counts read a higher title now and none reads lower. The only people who read lower than build 40 showed are the ones whose wines had lifted their title there (the tester case above).

## Proof

`node specs/v4.15/ranks.test.mjs`: 41 checks. It transpiles `lib/milestones`, `store/celebrate` and `store/collection` with the project's `typescript` and runs them on the real catalogue. The persisted store is hydrated through a stub AsyncStorage holding collections as build 40 saved them, using the project's own zustand. The test checks:

- the scope
- that 5,000 more wine bottlings plus a kind nobody has named yet leave the ladder at 2,327 and every title unchanged
- that every title matches build 39's
- that each rung's count is the first that holds it, at 2,327 and at every total from 1 to 10,000
- the store cases above (raised with no card; a crossing celebrated with the ladder's count; wine crosses nothing; no second card; seeded with no `bestRung`; Keeper with no wine; wine only)
- that no call in `src/` reads a title against `TOTAL`
- the panel's and the card's lines, and that their words are neutral (App Review 1.4.3)

Three mutations were each caught: counting a wine in `enter`, seeding `settle` from the whole count, and replacing the allowlist with "not wine".

Gates, all passing:

- `npx tsc --noEmit`
- `npx expo lint`
- every `scripts/check-*.mjs` (artwork, contrast, design, ideas, intro-dock, phone, push, recommend)
- `specs/v4.10/email-focus`, `v4.11/tournaments`, `v4.12/join-codes`, `v4.14/wine-restore`, `v4.14/filters`, `v4.14/find-friends`, `v4.15/ranks`
- `npx expo export -p ios --clear` to a temp directory, deleted afterwards

Not run on a phone (no simulator builds here). The two lines under the panel and the two-line title card were checked by width estimate (`lib/faceAdvances`), not by eye.

## Words elsewhere that are now stale (not touched here)

- **Build 41's What to Test**: drop build 40's "with the Dex twice the size, the title on Dex progress can read lower than it did" (`specs/v4.14/wtt-40.txt`). Optionally add "Dex titles count cocktails and spirits; wine doesn't move them."
- **`docs/appstore.md`**, the Dex progress paragraph: "Next: Cataloguer, at 209 entries", for someone with 38, is now "Next: Cataloguer, at 233". The ladder now counts cocktails and spirits. `docs/` is being edited by another workflow, so this is left for it or for Jan.
- Comments in `src/app/stats.tsx` and `CollectionStats.tsx` still say "38 / 2,089" in places as an example of the head figure. They are older than v4.14 and harmless; the ones this change touched say 4,671 and 2,327.
