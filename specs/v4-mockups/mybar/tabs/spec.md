# My Bar, two modes ("tabs")

9 Oct 2026. Jan: "make my bar section way more organized, its difficult for me to use and I created it with you, so make it more easy to use". Earlier that day: "I want less stuff. it looks really clumped up and a lot of information".

This replaces My Bar in `../../layout/spec.md` §5.3 (and its "Ticked tiles always sort first" rule and long-press sheet). It keeps the v4 budget: one 24pt margin, three type sizes, a top bar with a title and at most one icon, space instead of rules, one primary action per screen, and details behind a tap. The palette is Daylight as `../../white-min` applies it.

Files:

- `index.html`: seven frames at 440 × 956. Add `#first-run`, `#stocked`, `#add`, `#search`, `#removed`, `#make` or `#spirits` to the URL to show one frame.
- `contact.png`: the wall at 1x. `first-run.png`, `stocked.png`, `add.png`, `search.png`, `removed.png`, `make.png`, `spirits.png`: one frame each at 2x (880 × 1912).
- `tools/render.sh`: renders them with throwaway headless Chrome profiles under `.chrome-profile/`, kills only processes carrying that path, then deletes it.
- `tools/bake.py`: bakes `img/gin-rickey.webp` with the exact maths of `../../white/tools/daylight.py`. Every other photo is read from `../../white/img/`.

Every number in the frames comes from `src/data/barIndex.json` run through the same matching as `src/lib/bar.ts`. The bar in frames 2 to 7 holds 12 things (gin, rye whiskey, white rum, Angostura bitters, Campari, dry vermouth, sweet vermouth, lemon, lime, mint, soda water, sugar syrup). That bar makes **31** drinks. Bourbon would add **7** and orange **6**. With orange it makes **37**, and without lime **23**.

---

## 0. The idea in one line

**One screen, two modes, with the payoff above both.** "In my bar" shows only what you own, grouped by type. "Add" puts search first, then the same groups with the most-used ingredients in each. "You can make N drinks ›" is a full-width key above both, and its number changes on every tap. You always know whether you are looking at what you have or at what you could add, and nothing in a list ever moves while you are tapping it.

## 1. What it fixes

| Audit problem (severity) | This design |
|---|---|
| Ranked by "unlocks the most right now", re-ranked every visit, rank numerals (high) | **Every order is fixed.** In my bar is A to Z inside fixed groups. Add's groups show their ingredients by `uses`, which is the same for everyone and changes only with a data build. No numerals. What a tick would do for you is shown as a number on the row ("+7"), and that number never moves the row. |
| Rows reshuffle between visits, paging lost (high) | Nothing is ranked, so there is nothing to re-take. The snapshot machinery (`Snapshot`, `takeSnapshot`, `held`, `frozen`, `appendAToZ`) is deleted. Three small things are held, each for one visit (§6), and the spec names each one. |
| Have and could-add mixed in one list (high) | They are two modes. "In my bar" lists only what you own. "Add" is where everything else is. The tab you are on is shown in ink 600 over a 2pt ink bar, and the count sits only on "In my bar 12". |
| "In your bar" view lies (high) | In my bar is built from `owned` every time the mode opens. A take-out stays visible as a struck row with Undo until you leave the mode, and the tab's count drops at once. An Add anywhere is listed the next time In my bar opens, because you can only add from the other mode. |
| 490 ingredients as a flat list, 170 behind "Show more" (high) | Six groups that match a home bar's shelves (§3). Add shows four per group, and "All 44 ›" opens the whole group, arranged by family for spirits. The other ~320 come from search, which now finds brands and kinds (§7). There is no paging. |
| Payoff below the whole picker (high) | The key sits at y 122 on every My Bar screen, above the modes, so the effect of each tap is reported right there: the number changes and the change shows beside the chevron ("+6", "−8"). |
| Chips duplicate the list, wrong homes, empty "Everything else" (medium) | No chips. Groups are headed sections. Vermouth sits with wine and the aperitif wines (Lillet, Punt e Mes, Dubonnet), and Campari sits with the bitters. The 80 "other" items are reached only by search, and a "More" group appears in In my bar only if you own one. |
| Search matches literal labels only (medium) | Aliases and brand names ("cointreau" finds Triple sec), group words ("citrus" finds the citrus), family words, whisky/whiskey folding, and merged duplicates (§7). |
| "You can make" shows drinks you can't make (medium) | Empty bar: the key says "Nothing to make yet" on wash and does nothing. No example drinks. The list is only what you can make, grouped by base spirit, in Dex order. |
| What to buy next shown three ways, two rankings (medium) | One home: "Best next" at the top of Add (two bottles, the canonical ranking `nextBest` already computes and nothing used). Every other row shows the same metric as "+N". One ingredient away, the best-bottle card and the per-row "+ Orange" toggles are gone. |
| Labels show a fixed number, not your gain (medium) | Rows show "+N", the live full-slot gain. "in 173 drinks" is gone. |
| First run is one bulk button with no review (medium) | The 14 basics are rows you tick one at a time, at the top of Add. Nothing goes in that you do not tap. |
| Removing has no home, feedback off screen (medium) | In my bar is the removing view. Tap a name or its ×, and the row strikes through in place with Undo where the × was, while the key shows "−8". Clear my bar sits at the end of In my bar. |
| Too much chrome before the first tick (medium) | Chrome is title, key and two tabs (plus the field in Add): 6 elements, down from 47. No band, plate, intro sentence, chips, rail, counter or walnut. |

## 2. Structure

### 2.1 The fixed head (every My Bar tab screen)

Nothing in the head scrolls or moves. The lists scroll under it.

| Piece | Measurements | Notes |
|---|---|---|
| Title "My Bar" | title 28/34 at x 24, y 71–105 | No icon. The tab bar's + already posts. |
| **The key** | 392 × 52 at x 24, y 122, radius 4 | `ink` with "You can make 31 drinks" in body 500 `onInk` at x 40, then the change figure ("+6", "−8") in body 400 `onInkMuted`, then a 20pt chevron with its right edge at x 404. With nothing to make it is `wash` with "Nothing to make yet" in body 500 `muted`, has no chevron, and is disabled. It is the screen's one primary action. |
| Mode tabs | y 190–234, two halves of 196 | Labels in body, centred. The chosen one is `ink` 600 over a 2pt `ink` bar 8 below the label, as wide as the label plus 12. The other is `muted` 500. "In my bar" carries the count in `muted` 400 tabular ("In my bar 12"), and that is the only place the count appears. |
| Field (Add only) | 392 × 44 at x 24, y 250, `wash`, radius 4 | 20pt glass, placeholder "Search a name or a brand" in body `muted`. While focused it is 316 wide with a clear × inside, and "Cancel" in body `ink` is right-aligned to 416. |

Content starts at y 250 in In my bar and at y 318 in Add (24 under the field). The tab bar is the v4 one (873–956), with My Bar active.

### 2.2 In my bar

- Groups in the fixed order of §3. Only groups you own something in are shown.
- A group header is body 600, 24 tall. Its rows start directly under it.
- Rows: two columns of 184 at x 24 and x 232 (24 gutter), 44 tall. The name is body `ink` at the column's left, truncated at 144. A 16pt × in `muted` sits at the column's right edge (x 192 and x 400). The whole 184 × 44 cell is the hit area.
- 24 between groups.
- After the last group, 32 below: "Clear my bar" in body `muted` at x 24, with a 44 hit area.
- Taken out this visit: the name turns `muted` with a 1.5pt strike, and "Undo" in body 500 `ink` replaces the ×, right-aligned in the cell.
- Empty bar (this mode chosen by hand): one body line at y 250, "Nothing in your bar yet.", and under it "Add what you have" in body 500 `ink`, which switches to Add.

### 2.3 Add

Top to bottom, under the field:

1. **The top group, picked when Add opens** (§6):
   - an empty bar gets **"The basics"**, with the small `muted` line "Most bars start with these. Tick the ones you have." and the 14 `BASICS` as rows, in group order (Gin, Vodka, White rum, Bourbon, Sweet vermouth, Dry vermouth, Triple sec, Angostura bitters, Lemon, Lime, Orange, Mint, Soda water, Sugar syrup);
   - any other bar gets **"Best next"**: two rows, each with a small `muted` second line naming the first two drinks it completes in Dex order ("Mint Julep, Boulevardier and 5 more"). It is hidden when nothing has a gain.
2. **The six groups.** Each has a header (body 600) with "All N ›" (body `muted`, 16pt chevron, 44 hit) right-aligned to 416, then its four ingredients with the highest `uses`.
3. Rows: 48 tall (60 with a second line). The name is body `ink` at x 24, truncated at 300. "+N" in body `muted` tabular is right-aligned to x 380, shown only when the gain is more than 0 and the thing is not in your bar. The box is 22 × 22 at x 394, centred: `ink` with a white check when it is in your bar, or empty with a 1.5pt `control` edge when it is not. The whole row is the hit area.

**Searching** replaces the top group and the groups with results, from y 302: rows as above, up to 40, no headers. A row that matched through an alias gets the alias as its small second line ("Orange liqueur, like Cointreau"). With no match: "Nothing called "xyz"." and, under it in small `muted`, "Try the kind of bottle, like gin or orange liqueur."

### 2.4 You can make (pushed from the key)

- Back chevron at x 20, y 76. No tab bar.
- "You can make" in title at y 122, with "31 drinks" in small `muted` on its baseline, right-aligned.
- Sections by base spirit (§4), each headed in body 600 (y 180 for the first).
- Rows at a 68 pitch from 8 under the header: a 52 thumb at x 24 (the print, or the rocks glass in `control` on `wash` when the drink has no photo), the name in Playfair 17 at x 92, and a small `muted` line under it listing your ingredients that go in, in recipe order. For an "either" slot it names the one you own ("Rye whiskey, Soda water" for Grogg).
- Tap a row to push the drink page. Nothing here can be ticked.

### 2.5 A whole group (pushed from "All N ›")

- Back chevron, then the group name in title at y 122, with "3 in your bar" in small `muted` right-aligned on its baseline.
- The key at y 172, live, the same as on the tab.
- **Spirits only:** one small `muted` line at y 240, "Any kind counts for a recipe that only says brandy or gin.", then the families A to Z (Brandy, Gin, Rum, Tequila & mezcal, Vodka, Whiskey, then More spirits). Each family is headed in body 600 and starts with its plain bottle, followed by its kinds by `uses`.
- Other groups: one list by `uses`, with no sub-headers.
- Rows and boxes as in Add.

## 3. The groups

Six shelves a home bar actually has, in this fixed order, plus "More" for owned odd items:

| Group | From `category` | Overrides (by id) | Browsable (of 170) |
|---|---|---|---|
| Spirits | spirit | | 44 |
| Liqueurs & bitters | liqueur, bitters | allspice-dram in | 41 |
| Vermouth & wine | wine | lillet-blanc, punt-e-mes, dubonnet, dubonnet-rouge in | 25 |
| Fresh | citrus, produce, dairy | vanilla-ice-cream in; lemonade, grapefruit-soda out | 23 |
| Mixers & juice | mixer, juice | lemonade, grapefruit-soda in | 17 |
| Syrups & spices | syrup, spice, savoury | cinnamon-syrup, vanilla-syrup, orange-flower-water in | 20 |
| More | other | | 0 (search only; shown in In my bar only if you own one) |

"Browsable" is today's `browseIngredients()` (uses ≥ 3 or reach ≥ 3) split by group. The other 320 are search-only, as now.

## 4. Ordering rules (all fixed)

| List | Order | Changes when |
|---|---|---|
| Groups | §3 order | Never |
| In my bar, inside a group | Label A to Z (`localeCompare`) | Only when In my bar opens |
| Add, a group's four | `uses` descending, then label | Data build only |
| Group page | Spirits: family A to Z, plain bottle first, then `uses`. Others: `uses`, then label | Data build only |
| The basics | The 14 in group order (§2.3) | Never |
| Best next | Canonical `nextBest`: how many one-away drinks name the bottle, then full gain, then `uses`, then label. Top two. | Picked when Add opens (§6) |
| Best next's drink line | Dex number ascending | With the pick |
| Search | (1) label or alias starts with the query, (2) a word in it starts with it, (3) contains it, (4) group or family word hits. Inside each, `uses`, then label. Cap 40. | Only on typing |
| You can make sections | Brandy, Gin, Rum, Tequila & mezcal, Vodka, Whiskey, More spirits, then No spirit. Empty ones hidden. | When the list opens |
| Inside a section | Dex number ascending, so the classics come first (Gin Fizz Nº 8, Gin Rickey 21, Tom Collins 33, Martini 126…) | When the list opens |

Why `uses` and not reach for the fixed order: reach credits every member of a family, so Cognac (reach 72) and Apricot brandy (66) would sit above Brandy (49) and Vodka (68). `uses` puts Gin, White rum, Vodka and Rye whiskey first, which is what recipes name.

Why Best next is canonical: ranked by full gain, Applejack (+10) would lead every bar that lacks brandy, because five of its ten are plain-brandy recipes that Brandy or Cognac fill as well. Ranked by the recipes that name the bottle, Bourbon (+7) leads, then Orange (+6, which wins the tie with Scotch and White wine on `uses`). The row still shows the true full gain.

## 5. Every interaction

| Where | Gesture | Result |
|---|---|---|
| The key | Tap | Pushes You can make. Disabled at 0. |
| Mode tabs | Tap | Switches mode, with no animation (the bar jumps). Leaving In my bar sweeps its struck rows, and entering Add picks its top group. The scroll position of each mode is kept for the visit. |
| In my bar row | Tap the name or the × | Takes it out: `toggle(id)`. The row strikes in place, the tab count drops, the key's number and change update, and there is a haptic plus an announcement. |
| Struck row | Tap Undo (or anywhere on the row) | Puts it back: `toggle(id)`. The row returns to normal in place, and the change reads "+8". |
| "Clear my bar" | Tap | System alert "Clear your bar?", "12 things come off. This can't be undone.", Cancel / Clear (destructive). Clear calls `clear()`, and My Bar switches to Add with the basics. |
| Add row (any, including Best next, basics, results and group pages) | Tap | `toggle(id)`. The box fills or empties in place. The +N on this and every other row updates. The key updates. Haptic plus announcement. The same thing can appear twice on one screen (Orange in Best next and in Fresh), and both rows show the same state. |
| "All N ›" | Tap | Pushes the group page. |
| Field | Tap | Focuses and shows the keyboard. The field narrows and Cancel appears. The top group and groups give way to results as soon as there is a character. |
| Field | Type | Results update per keystroke (§7). A drag on the results puts the keyboard away. |
| Clear × in the field | Tap | Empties the query and keeps focus. |
| Cancel | Tap | Empties the query, puts the keyboard away and brings the browse back exactly as it was. |
| You can make row | Tap | Pushes the drink page. Back returns to the list, then to My Bar where you left it. |
| My Bar tab, tapped again while on it | Tap | Scrolls the current mode to the top (`useScrollToTop`). |
| Another tab takes the front | | Ends the visit: struck rows are swept, the change figure clears, and Best next is picked again next time. The mode is kept. |

Long press does nothing. Nothing is hidden behind a gesture you have to discover.

## 6. Live numbers, and the only three holds

Each tap runs `matchOwned(owned)` once (it is memoised on the store's `owned` object, as now), and everything below reads that one result in the same commit. Nothing animates.

| Number | Source | When it changes |
|---|---|---|
| Key "You can make N drinks" | `result.makeable.length` | Every toggle, in every mode and on group pages |
| Key change "+6" / "−8" | `after − before` from `diffMakeable` | Every toggle. It shows the last change and stays until the next change or the end of the visit. A change of 0 shows nothing. |
| "In my bar 12" | owned ids that are in the index | Every toggle (struck rows are not counted) |
| Row "+N" | `gainOf(result, id)` | Every toggle. Hidden when 0 or owned. The row and its neighbours do not move, because the number sits in a fixed right-aligned slot. |
| Best next's rows | `nextBest.slice(0, 2)`, picked when Add opens | Rows held for the visit to Add. Their +N and boxes are live. |
| "3 in your bar" on a group page | owned ids in that group | Every toggle |
| You can make list | `result.makeable` | When it is pushed (nothing can change while it is open) |

**The three holds**, the whole of what replaces today's snapshot machinery:

1. **Struck rows** (In my bar). A take-out stays drawn, struck, until you switch mode or another tab takes the front. This is a `Set<string>` in screen state.
2. **The top group of Add** (basics or Best next). It is picked when Add opens and kept while you are in Add, so a first tick does not swap the basics for Best next above your finger, and adding Bourbon does not slide Orange up into its place.
3. **The change figure.** It is the last change, until the next change or the end of the visit.

Everything else is a pure function of `owned`, drawn fresh.

## 7. Search

- **Fold** (extends today's `fold`): lowercase, accents off, "whisky" → "whiskey", "&" → "and".
- **Aliases**: a hand table in `scripts/bar-data/aliases.json`, emitted into the index as `aliases: string[]` plus one display line. A first cut:
  - triple-sec: cointreau, combier, "orange liqueur" (line "Orange liqueur, like Cointreau")
  - grand-marnier: "orange liqueur" (line "Orange liqueur")
  - sugar-syrup: "simple syrup", simple, gomme
  - soda-water: "club soda", seltzer, "sparkling water"
  - gin: tanqueray, beefeater, bombay, gordon's, hendrick's
  - white-rum: bacardi, "light rum", "silver rum"
  - dark-rum: myers's, goslings
  - bourbon: "maker's mark", "buffalo trace", "wild turkey", "jim beam"
  - irish-whiskey: jameson
  - scotch-whisky: "johnnie walker", "famous grouse"
  - sweet-vermouth: "martini rosso", carpano, "antica formula", "red vermouth"
  - dry-vermouth: "noilly prat", "dolin dry", "martini extra dry"
  - angostura-bitters: angostura, "aromatic bitters"
  - maraschino-liqueur: luxardo, maraschino
  - coffee-liqueur: kahlua, "tia maria"
  - irish-cream: baileys
  - st-germain-elderflower-liqueur: st-germain, elderflower
  - cognac: hennessy, "rémy martin", courvoisier
- **Group and category words**: "spirits", "liqueurs", "bitters", "vermouth", "wine", "beer", "fresh", "citrus", "juice", "mixers", "syrups", "spices" list that group or category. "citrus" lists Lemon, Lime, Orange, Grapefruit and the rest, after the literal hit Citrus vodka. Family words ("rum", "whiskey", "brandy", "tequila") already match by label. They also bring the plain bottle.
- **Merged duplicates** are dropped from search and browse and folded into the real entry: angostura (other) → angostura-bitters, lime-disc and lime-zest → lime, orange-slices and seville-oranges → orange, passion-fruit-syrup → passionfruit-syrup, orgeat-syrup → orgeat, golden-rum → gold-rum. Each goes into `RETIRED` in `src/store/bar.ts` so a saved bar keeps pouring the same drinks.
- **Label casing**: proper nouns get their capitals ("Grand Marnier", "St-Germain", "Fernet-Branca", "Green Chartreuse"). These are names, not uppercase styling, so they are allowed.

## 8. Families: "rum" vs "white rum"

How the index works today (unchanged): a recipe that says "rum" has the slot `[rum, white-rum, dark-rum, gold-rum, …]`, so any kind fills it. A recipe that says "white rum" has the slot `[white-rum]`, so only that kind fills it. Owning a kind therefore covers the plain-family recipes, but owning the plain bottle does not cover the kind recipes. With lime and sugar syrup, plain Rum makes Barbados Rum Punch. White rum makes that and the Daiquiri.

What the screen does with that:

- **In my bar** lists exactly what you ticked ("White rum") under Spirits, A to Z. It has no family headers, because the inventory is short and you know what you own.
- **Add's Spirits four** are the most-named bottles (Gin, White rum, Vodka, Rye whiskey), whatever their family.
- **The Spirits page** is where families show: each family is headed, with the plain bottle first and its kinds below. One line states the rule once.
- **+N tells the truth per kind.** Applejack shows +10 because it fills plain-brandy recipes too. Tick Cognac and Applejack's number drops to 5 in place, because the plain-brandy recipes are no longer waiting.
- **The basics** use kinds (White rum, Bourbon), not plain bottles, because kinds cover more.
- **Search "rum"** lists every kind and the plain "Rum", by `uses`.
- **Data fix needed:** the gin family slot includes sloe gin, so today sloe gin plus dry vermouth "makes" a Dukes Martini and a Fifty-Fifty. Sloe gin is a liqueur (its category already says so) and should leave the gin family in `scripts/build-bar-index.mjs`. Peach and apricot brandy in the brandy family deserve the same look.

## 9. Edge cases

- **0 items (first run).** My Bar opens on Add with The basics. The key is `wash`, "Nothing to make yet", disabled. "In my bar" has no count. Ticking the basics in order lights the key at Bourbon (Gin, Vodka, White rum and Bourbon make 2), and it reaches 47 with all 14. The basics stay at the top until you leave Add, even after every one is ticked.
- **1 to 4 items.** In my bar is the default and may show one group with one row. If nothing is makeable the key stays "Nothing to make yet". Best next shows whenever something is one away (Gin alone already has some).
- **100 items** (the top 100 by `uses`). The key reads "You can make 445 drinks". In my bar runs 27 / 24 / 12 / 14 / 10 / 13 across the groups, 51 two-up rows, roughly four screens, with sticky group headers so you always know which shelf you are on. Add's fours are nearly all ticked, and the largest gain left is +5, so Best next still has something to say. To check one item among 100, use the field in Add: owned results show a ticked box.
- **Removing the last item of a group.** The row strikes and the header stays until the sweep, so nothing above or below moves.
- **Several take-outs in a row.** Each strikes with its own Undo. The key's number is the real total, and its change figure is the last tap's.
- **Unticking in Add.** Allowed. The box empties and the key shows "−N". There is no struck state in Add, because the box is its own undo.
- **"Other" items** (80 in the index, search only). If owned, they appear in a final "More" group in In my bar. They never appear in Add's browse.
- **Retired or unknown ids.** Retired ids are renamed by `RETIRED` at load, as now. Ids missing from the index are ignored in counts and lists, as now.
- **Before the bar loads from disk** (`hydrated` false), the head draws with the key in `wash` and no label, and the lists are empty. The mode is chosen once, on the first hydrated render (Add if empty, In my bar otherwise), so a stocked bar never flashes the basics.
- **Long names.** They truncate with an ellipsis ("St-Germain elderflower liq…"). The full label is the accessibility label.
- **Dynamic Type.** Above 1.3×, In my bar goes to one column (today's `TWO_UP_MAX_SCALE`). Rows and the key grow with the text, and the key's minimum height is 52.
- **Singular.** "You can make 1 drink".
- **VoiceOver.**
  - The key: button, "You can make 31 drinks", hint "Opens the list".
  - Tabs: `tablist` / `tab` with selected state.
  - In my bar rows: button "Lime", hint "Takes it out of your bar". Struck rows: "Lime, taken out", with an "Undo" action.
  - Add rows: checkbox "Bourbon", checked state, hint "Adds 7 drinks".
  - Each toggle announces "Lime out of your bar. 8 fewer, 23 in all." (the existing `announce` sentence).

## 10. Mapping onto the code

**Unchanged:** `src/store/bar.ts` (`owned`, `toggle`, `clear`, `hydrated`, persistence and the read-before-write guard). `RETIRED` grows with the merged ids in §7. `add` is no longer called by the UI.

**`scripts/build-bar-index.mjs` → `src/data/barIndex.json`** (generated, so edit the script and not the JSON):

- per ingredient: `group` (§3, category plus overrides), `family` for spirits (brandy, gin, rum, tequila, vodka, whiskey, more), `aliases` and `aliasLine` (§7), `hidden` for merged duplicates;
- per recipe: `base`, the family of its first spirit slot, or `none`;
- sloe gin out of the gin family (§8).

**`src/lib/bar.ts`:**

| Keep | Change | Add | Retire |
|---|---|---|---|
| `matchBar`, `matchOwned`, `gainOf`, `diffMakeable`, `reachOf`, `BASICS`, `browseIngredients`, `INGREDIENTS(_BY_ID)` | `searchIngredients` (fold, aliases, word-start tier, group and family words, hidden), `shoppingList` tie-break (n, full gain, `uses`, label), exported as `bestNext(result, count)` | `GROUP_ORDER`, `GROUP_LABEL`, `groupOf(i)`, `FAMILY_ORDER`, `familyOf(i)`, `topOfGroup(group, 4)`, `groupPage(group)`, `makeSections(result)` | `CATEGORY_LABEL`, `CATEGORY_ORDER`, `bestBottle` (it ranked Applejack first), `COMMON_INGREDIENTS` if nothing else reads it |

**`src/components/bar/model.ts`:** retire `Snapshot`, `takeSnapshot`, `awayOf`, `pickerOrder`, `pickerRows`, `appendAToZ`, `stripOf`, `awayRows`, `rankDrinks`, `basicsExamples` and the echo rule. What replaces them is three pure functions: `haveSections(owned, struck)`, `addSections(result, owned, top)` and `makeSections(result)`.

**Components.** Retire `BarPicker.tsx`, `Counter.tsx` (YouCanMake, OneIngredientAway, BestBottleCard, SectionHead, NameList), `PourTonightSheet.tsx`, and whatever in `faces.tsx`, `controls.tsx` and the brass pieces only My Bar used. New: `MakeKey`, `ModeTabs`, `HaveList`, `AddList`, `IngredientRow`.

**Routes.** `src/app/(tabs)/bar.tsx` is rewritten. New `src/app/bar/make.tsx` and `src/app/bar/[group].tsx` are pushed over the tabs like `/drink/[id]`.

**Screen state** (all in `bar.tsx`, none persisted):

- `mode`: `'have' | 'add'`;
- `struck`: `Set<string>`;
- `change`: `{ delta: number } | null`;
- `top`: `'basics' | string[]`, picked on entering Add;
- `query`.

The visit end reuses today's navigation `state` listener, which already tells another tab taking the front apart from a drink page pushed on top.

**Lists.** In my bar is a `SectionList` with rows chunked in pairs and sticky section headers. Add is a `SectionList` (about 30 rows at rest). The search is a `FlatList` (at most 40). The group page is a `SectionList` (at most 44). The head is a plain `View` above the list, so it never scrolls.

## 11. Eight tasks, step counts

The audit's own list of eight tasks was cut off in my brief, so these are the eight I used. A step is a tap, a typed word or a deliberate scroll. "Before" is build 19 as the code reads, on the 12-item bar unless noted.

| # | Task | Before (build 19) | After |
|---|---|---|---|
| 1 | First run: put in the 10 basics you have (no vodka, triple sec, mint or bourbon) | 11 (6 visible ticks, Show more, 4 more ticks), and their places change once you leave. Or 6 with the bulk button and four unticks, if you know to look for them. | **11** (10 ticks on one fixed list, 1 scroll). Nothing goes in by default. |
| 2 | Add the Cointreau you just bought | Fails: "cointreau" finds nothing. 3 if you already know it is a triple sec. | **4**: Add, field, "cointreau", tick Triple sec |
| 3 | Take out Lime, you ran out | 2: In your bar chip, untick. It stays listed as unticked, and the result shows below the fold. | **1**: tap Lime (In my bar is the default) |
| 4 | Undo that | 2: scroll to the note under You can make, Undo | **1**: Undo, where Lime is |
| 5 | Check whether Campari is in your bar | 1: In your bar chip, then read the A to Z (or 3 by search) | **0**: it is under Liqueurs & bitters on arrival |
| 6 | See what you can make and open the Martini | 2 to 4: scroll to the strip, and if the Martini is not among its 12, See all, scroll the A to Z list, tap | **2**: the key, then Martini (4th under Gin) |
| 7 | Find the best next bottle and add it | 3: scroll to One ingredient away, read the card, Add. It suggests Applejack. | **2**: Add, tick Bourbon under Best next |
| 8 | Clear the bar | 4: In your bar chip, scroll, Clear, confirm | **3**: scroll to the end, Clear my bar, confirm |
| | **Total** | **28 to 30**, with one fail (task 2 counted at 3) | **24**, no fail |

The step count drops by a sixth. The bigger change is what the steps cost: before, five of the eight tasks meant finding something in a list whose order depends on what you own, and two reported their result off screen. After, every list is in a fixed order, every result shows in the key above the list, and the Cointreau case works.

## 12. Element counts

Method: every text run, glyph, box, photo, field and tab counts, a key with its label counts once, the tab bar is 5, and the keyboard is 1.

| Frame | Elements | Notes |
|---|---|---|
| 1 First run | 37 | 22 of them are the 11 basics rows on screen (name and box) |
| 2 In my bar, at rest | **41** (was 71) | Chrome **6** (was 47). 12 of the 41 are the × marks. Without them it would be 29, but take-out would have no visible handle. |
| 3 Add, at rest | 43 | |
| 4 Add, searching | 30 | |
| 5 Just took Lime out | 42 | The change figure is the one extra |
| 6 You can make | 37 | 11 rows × (thumb, name, line) |
| 7 Spirits | 40 | |

## 13. Budget check

- **One margin.** Every left and right edge is at x 24 or x 416. The tab bar, keyboard and status bar are full width.
- **Three sizes.** Title 28, body 17, small 13, plus Playfair 17 for drink names. Weights 400, 500 and 600 carry emphasis.
- **Top bar.** The title only, with no icon. Pushed screens have only the back chevron.
- **Space, not rules.** No dividers, cards or outlines. Groups are 24 apart. The only filled surfaces are the key, the field and the ticked boxes. The 2pt bar under a tab is a state mark, not a divider.
- **One primary action.** The key. Ticks and take-outs are state, as in white-min.
- **Details behind a tap.** Best next's drink line is the only second line at rest. The full drink list is behind the key, a whole group behind "All N ›", and the recipe behind the drink page.
- **No uppercase.** Brand capitals ("Grand Marnier", "Cointreau") are names.
- **Squared.** The key, the field and the boxes use radius 4 or 3. Only the avatar is round.
- **WCAG AA.**

  | Pair | Ratio |
  |---|---|
  | `ink` on page | 19.80 |
  | `muted` on page | 6.69 |
  | `muted` on `wash` (placeholder, the disabled key) | 6.13 |
  | `onInk` on `ink` | 19.80 |
  | `onInkMuted` on `ink` (the change figure) | 7.85 |
  | `control` box edge on page (UI) | 3.45 |

  The chosen tab's 2pt `ink` bar is 19.80 against the page, so the state does not rest on the 600/500 weight alone. A struck row carries its state three ways: the strike, the `muted` colour and the word Undo.
- **Buildable in React Native.** Views, Text, Pressable, `SectionList` and `FlatList`, `expo-image` for thumbs and `react-native-svg` for the ×, check, chevron and glass. No blur, gradients, masks, shadows, layout animation or timed animation.
- **Stillness.** No row moves under a finger. Toggles change fills, figures and the key's words in place. Rows appear or disappear only when a view opens (a mode switch, a push or a new visit).

## 14. Open questions

- **The × marks.** They cost 12 elements on a 12-item bar. Dropping them saves 12, but tap-to-remove would then have no visible handle. I kept them, and they would be the first thing to cut if Jan wants even less.
- **The basics after first run.** They live in their groups, and the top of each group is mostly the basics anyway. If Jan wants a permanent "The basics" block, it can sit under Best next, at a cost of 14 rows.
- **The family rule line on the Spirits page** is the one explanatory sentence in the design. It could move into the plain bottle's row as a second line ("Brandy, any kind of brandy also counts") if one line at the top reads as instructions.
