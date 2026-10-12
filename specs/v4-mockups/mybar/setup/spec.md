# My Bar, model "setup": guided setup, then a simple bar

9 Oct 2026. Jan: "make my bar section way more organized, its difficult for me to use and I created it with you, so make it more easy to use". Earlier the same day: "I want less stuff. it looks really clumped up and a lot of information".

This model splits the job in two. **Setup** is a short four-step pass you make once (Spirits, then Liqueurs & vermouth, then Mixers & fresh, then Bitters & syrups). Each step is a grid of the common items: you tap what you have, and a live line counts the drinks. **My Bar** after that is a calm summary: "You can make N ›", one "Next buy" line, and your bottles as one A to Z list with an add field at the top. Nothing on any screen where you tick or untick is ranked, so nothing moves under your finger.

It uses the less-stuff budget (`../../layout/spec.md`) and the Daylight tokens as white-min applies them (`../../white-min/`): one 24pt margin, three type sizes plus Playfair for drink names, a title and at most one icon in the top bar, space instead of rules, one primary key per screen, and details behind a tap. Ink is #0A0A0A on #FFFFFF, with muted #5C5C5C, wash #F5F5F5 and control #8A8A8A. Drink photos are the only colour.

**Every number on the boards is real.** They come from `src/data/barIndex.json` and the 899 recipes, run through the same slot matching as `matchBar`. The stocked bar is the 12 bottles that give the v4 mock's own figures: **30** you can make and 161 one away.

## Files

- `index.html`: ten frames at 440 × 956. Add `#empty`, `#setup-1`, `#setup-4`, `#bar`, `#add`, `#browse`, `#alias`, `#removed`, `#make` or `#next` to the URL to show one frame by itself.
- `contact.png`: the whole wall at 1x, 2432 × 2370.
- One PNG per frame, at 2x (880 × 1912): `empty.png`, `setup-1.png`, `setup-4.png`, `bar.png`, `add.png`, `browse.png`, `alias.png`, `removed.png`, `make.png`, `next.png`.
- `tools/render.sh`: renders all of the above with a throwaway headless Chrome profile in `.chrome-profile/` under this folder. It kills only processes carrying that profile path, then deletes the folder.
- Photos come from `../../white/img/` (the daylight prints).

---

## 1. The audit's high-severity problems, and the answer to each

| # | Problem today | What this model does |
|---|---|---|
| 1 | The checklist is ranked by "unlocks the most right now" (`pickerOrder`). It is re-ranked on every visit and every chip change, owned items end up scattered, and rank numerals change between visits. | **No ranked list anywhere you tick.** My Bar's list is A to Z. Each setup grid is a fixed list written in code. Search results are ordered by how well they match, then by how many recipes name them, and never by what you own. There are no numerals. |
| 2 | Rows reshuffle between visits, and "Show more" pages and One ingredient away reset. About 50 lines of STILLNESS comments are there to hide the motion. | **Nothing needs holding still, so the snapshot machinery goes** (`Snapshot`, `takeSnapshot`, `hold`, `frozen`, the tab-state re-sort). There is no paging: the bottle list is a FlatList of everything you own, and the "You can make" list is a SectionList. |
| 3 | What I HAVE and what I could ADD are mixed in one flat list. | **My Bar lists only what you have.** Adding happens somewhere else: the setup steps, the add window (search or shelves) and the Next buys sheet. |
| 4 | The "In your bar" view lies: an unticked item stays listed, and an Add from One ingredient away doesn't appear until the next visit. | **A removal says so where it happened.** The row turns into "Lime removed · 6 fewer drinks · Undo", and the count and the key change on screen. An add from any window or sheet goes into the A to Z list at once, while the list is covered, so you come back to it already in place. |
| 5 | 490 ingredients in a flat list: 170 can be browsed in pages of 20, the other 320 only by typing, and categories show only as chips. | **Shelves.** Setup walks the four shelves. With nothing typed, the add window lists five shelves, each opening its whole shelf A to Z, so all 490 are two taps away without typing. Search also matches brand names and shelf words (§5.5). |
| 6 | The payoff (drinks you can make) sits below the whole picker, and feedback on each tick lands off screen. | **The payoff comes first.** "You can make 30 ›" is the first thing under the title and the screen's one ink key. Every number that changes is on screen when it changes: the key, the setup's live line, the add window's live line, and the removed row. |

The medium-severity findings are covered too:

- The 15 chips are gone.
- Search knows Cointreau and simple syrup, and typing "citrus" lists the citrus (§5.5).
- "You can make" shows only drinks you can make. The empty state's Daiquiri is presented as an example, not under that heading.
- "What to buy next" has one ranking, shown in one line and one sheet. The second and third rankings are deleted.
- Each row shows what ticking it would do for you (+3 drinks), not a fixed "in 173 drinks".
- The basics bulk button is replaced by setup, which ticks only what you tap.
- Removing a bottle is one tap on its row, with Undo beside it.
- The chrome at rest goes from 71 elements to 36 (§10).

## 2. Structure

```
My Bar tab (root)
├─ Empty state ............ frame 1. Shown while nothing you own is in the index
│   ├─ "Set up my bar" ──► Setup window
│   └─ "Or add one bottle" ► Add window
└─ Summary ................ frames 4 and 8
    ├─ "You can make N ›" ─► You can make (pushed) ......... frame 9 ──► drink page
    ├─ "Next buy: X  +N ›" ► Next buys (page sheet) ........ frame 10
    ├─ "Add a bottle" ─────► Add window (full-screen modal) . frames 5, 6, 7
    │                          └─ a shelf ► Shelf page (pushed inside the modal)
    ├─ a row's name ───────► Bottle sheet (small sheet)
    ├─ a row's x ──────────► removes it in place (frame 8)
    └─ ••• ────────────────► Run setup again · Clear my bar
Setup window (full-screen modal, 4 steps) ... frames 2 and 3
```

Five routes are new, all under `src/app/bar/`: `setup.tsx` (with a `step` param), `add.tsx`, `shelf/[shelf].tsx`, `make.tsx`, and the Next buys sheet. The sheet is a `Modal` with `presentationStyle="pageSheet"`, as PourTonightSheet uses today.

## 3. Screens and measurements

All frames are 440 × 956. The status bar is 0–62, the top bar 62–114 with its title at y 71, and content starts at y 122. The tab bar is 873–956 on tab roots only. Pushed screens and windows have no tab bar.

### 3.1 Empty state (frame 1) · 15 elements

- Top bar: "My Bar" title and no icon, since there is nothing to clear yet.
- A daylight print, 392 × 300 at y 122, of a **Daiquiri**. Under it, on one baseline at y 438: "Daiquiri" in Playfair 17 on the left, and "White rum, lime, sugar syrup" in small `muted` on the right. This is the whole idea in one example: three things make a drink. It is not headed "You can make".
- At y 486, body copy in two lines: "Tick what's in your bar, / and see every drink it can make."
- The key "Set up my bar": 392 × 52 at y 566, `ink`, body 500. It is the screen's one primary action.
- At y 630, small `muted`: "Four short steps: spirits, liqueurs, mixers, bitters."
- The field "Or add one bottle": 392 × 44 at y 680, `wash`. It opens the add window, for someone who only wants one bottle.

### 3.2 Setup window (frames 2 and 3) · 24 elements

This is a full-screen modal with no tab bar.

- Top bar: on step 1, an X at x 22, y 76. On steps 2–4, a back chevron at x 20 instead, which returns to the previous step. Nothing else goes in the bar.
- Title row at y 122: the shelf name as the title ("Spirits", "Liqueurs & vermouth", "Mixers & fresh", "Bitters & syrups"), with "1 of 4" in small `muted` on its baseline, right-aligned to x 416.
- At y 166, body `muted`: "Tap the ones you have."
- Grid: 18 tiles in 2 columns of 190 with a 12 gutter (x 24 and 226). Tiles are 52 tall at a 64 pitch from y 214, radius 4, label in body at a 16 inset.
  - Unticked: `wash` with `ink` text.
  - Ticked: `ink` with `onInk` text and a 16pt check at the right, so the state is carried by more than the fill. VoiceOver reads the tile as a toggle (`accessibilityRole="switch"` or `checkbox`, with `checked`).
- The live line at y 802, body: "You can already make **N** drinks". It counts the whole bar, every step included, and updates on every tap.
- The key: 392 × 52 at y 846, `ink`. It reads **"Skip"** while nothing on this step is ticked, **"Next"** once something is, and **"Done"** on step 4. It always does the same thing (go forward) and it is never disabled.
- The steps hold these fixed lists (ids in §7.2), in this order:
  1. **Spirits:** Gin, Vodka, White rum, Dark rum, Aged rum, Bourbon, Rye whiskey, Scotch whisky, Irish whiskey, Silver tequila, Reposado tequila, Mezcal, Brandy, Cognac, Pisco, Cachaça, Absinthe, Applejack.
  2. **Liqueurs & vermouth:** Sweet vermouth, Dry vermouth, Campari, Aperol, Triple sec, Orange curaçao, Maraschino liqueur, Bénédictine, Green chartreuse, Coffee liqueur, Amaretto, Crème de cacao, Crème de cassis, Elderflower liqueur, Lillet blanc, Irish cream, Champagne, Prosecco.
  3. **Mixers & fresh:** Lemon, Lime, Orange, Grapefruit, Mint, Soda water, Tonic water, Ginger beer, Ginger ale, Cola, Pineapple juice, Cranberry juice, Egg white, Whole egg, Cream, Milk, Coconut cream, Coffee.
  4. **Bitters & syrups:** Angostura bitters, Orange bitters, Peychaud's bitters, Sugar syrup, Grenadine, Honey, Honey syrup, Orgeat, Agave syrup, Maple syrup, Raspberry syrup, Passionfruit syrup, Demerara syrup, Brown sugar, Nutmeg, Cinnamon, Cloves, Hot sauce.
- Generic family ids ("Rum", "Whiskey", "Tequila") are never offered here. A bottle on a shelf is always a specific one (§8.4). "Gin" is offered because the generic gin id is the one 167 recipes name.

Measured live-line values along the frames' path:

| After | You can already make |
|---|---|
| Step 1: gin, vodka, white rum, bourbon | 2 |
| Step 2: plus sweet and dry vermouth, Campari, triple sec | 11 |
| Step 3: plus lemon, lime | 22 |
| Step 4: plus Angostura, sugar syrup | **30** |
| Everything in all four grids (72 items) | 326 |

### 3.3 My Bar summary (frame 4) · 36 elements

- Top bar: "My Bar" title, and ••• right-aligned to x 416 (26pt glyph, 44 × 44 hit area).
- **Make key:** 392 × 64 at y 122, `ink`, radius 4. "You can make 30" is body 600 in `onInk` at a 20 inset, with a 22pt white chevron at the right. This is the screen's one primary key. Its number is the only place on the screen where the drink count appears.
- **Next buy line:** y 202–246 (a 44 hit). On the left, "Next buy:" in body `muted` followed by "Soda water" in body 500 `ink`. On the right, "+11 drinks" in body `muted` and a 16pt `muted` chevron. Tapping anywhere on the line opens Next buys. It is hidden when nothing is one away.
- **Section header** at y 278: "In your bar" in body 600, then the count in `muted` ("12").
- **Field:** 392 × 44 at y 314, `wash`, with a search glyph and the placeholder "Add a bottle". Tapping it opens the add window. Once the field scrolls under the top bar, it pins there (`stickyHeaderIndices`), so a big bar can always add.
- **Rows:** A to Z, at a 56 pitch from y 370. Each row has its name in body `ink` at x 24, and an 18pt x in `control` (3.45:1, which passes as UI) right-aligned to x 416, with a 44 × 56 hit area.
  - Tap the name: opens the bottle sheet (§5.7).
  - Tap the x: removes the bottle (§5.3).
  - With 12 bottles, 9 rows show at rest and the tenth sits under the tab bar.
- There are no rules, no cards, no chips and no numerals.

### 3.4 Just removed (frame 8)

This is the same screen a moment after tapping the x on Lime:

- The key reads "You can make 24" (−6).
- Next buy still says Soda water, now "+9 drinks".
- The header says "11".
- The Lime row keeps its exact slot and becomes "Lime removed · 6 fewer drinks" in body `muted` (6.69:1), with "Undo" in body 600 `ink` right-aligned to x 416 (a 44 × 56 hit area).

### 3.5 Add window: search (frame 5), shelves (frame 6), brand names (frame 7)

This is a full-screen modal laid out like the + window (layout spec §5.6). The keyboard comes up when it opens.

- Top row: an X at x 22, y 76, and the field 352 × 44 at x 64, y 66, `wash`. The field holds the glass, the typed text and a clear x. With nothing typed, the placeholder reads "Search 490 ingredients".
- **Live line** at y 126, body: "**You can make 38** · 8 more with orange". The second part, `muted`, says what the last tap did. It stays until the next tap or until the query changes.
- **Result rows** at a 64 pitch from y 166:
  - The name in body at x 24.
  - A right-hand label in body `muted`, right-aligned to x 364. For an item you don't own and that would pour something, it reads "+N drinks". If it would pour nothing, the label is empty. For an owned item it reads "In your bar". For a generic that a family member already covers, it reads "Covered by White rum" (§8.4).
  - The toggle key, 36 × 36 at x 380, radius 4: `wash` with an `ink` plus when off, `ink` with a white check when on.
  - When the match came through an alias, a second line in small `muted` under the name says so: "Cointreau is a triple sec".
- **Shelves** show when nothing is typed (frame 6). These are five rows: Spirits, Liqueurs & vermouth, Mixers & fresh, Bitters & syrups, and Everything else. Each row has a `muted` "4 of 103" and a chevron, and opens its shelf page. Under the rows, in small `muted`: "Brand names work too, like Cointreau or Tanqueray."
- **Shelf page** (not drawn, but built from drawn parts) is pushed inside the modal with a back chevron. It has the shelf name as its title and "4 of 103" quiet on the title's baseline. Then come that shelf's 18 setup tiles (Everything else has none, so it starts with the list), then "Everything on this shelf" in body 600, then every item on the shelf A to Z as result rows (name, +N, toggle).
- The keyboard starts at y 610. Results scroll between the live line and the keyboard. `keyboardShouldPersistTaps="handled"`, so the first tap on a toggle lands.

### 3.6 You can make (frame 9) · 30 elements

This is a pushed screen with a back chevron and no tab bar.

- Title row at y 122: "You can make" as the title, with "30" in small `muted` on its baseline at the right.
- **Jump line** at y 170, body `muted`: "Gin · Vodka · Rum · Whiskey · No spirit". It lists only the families on this list. Each word is a 44-tall target that scrolls to its section. It never filters.
- **Sections** by spirit family, in a fixed order: Gin, Vodka, Rum, Whiskey, Tequila & mezcal, Brandy, Other spirits, No spirit. Each header is the family in body 600, then its count in `muted` ("Gin 17").
- **Rows** at a 64 pitch: a 52 thumb at x 24, and the name in Playfair 17 at x 92.
  - A drink with a photo shows the daylight print.
  - A drink without one shows its glass (coupe, martini, rocks, highball, shot or mug, chosen from `glassware`) in `control` on `wash`.
  - Only 6 of these 30 drinks have photos in the app (Boulevardier, Daiquiri, Kamikaze, Lemon Drop, Lemon Drop Shot, Martini). That is why the glass glyphs matter.
  - Tapping a row opens the drink page.
- For this bar the sections are: Gin 17, Vodka 6, Rum 2 (Daiquiri, Barbados Rum Punch), Whiskey 4 (Boulevardier, Whiskey Toddy, Sourtoe Cocktail, Whiskey Fix), and No spirit 1 (Milano-Torino).

### 3.7 Next buys (frame 10) · 20 elements in the sheet

This is a page sheet over My Bar, behind a scrim of `ink` at 36%.

- The sheet runs from y 380 with a radius of 12. The grabber is 36 × 4 in `rule` at y 388. The title "Next buys" is body 600 at y 412.
- Rows are 76 tall from y 452:
  - The name in body 500.
  - Under it, a line in small `muted`: "11 more, like Tom Collins and Whisky Highball".
  - An "Add" key, 72 × 40, `wash`, body 500, right-aligned to x 416. When tapped it becomes an `ink` key with a check ("Added").
- The real list for this bar:

| Bottle | More drinks | Like |
|---|---|---|
| Soda water | +11 | Tom Collins, Whisky Highball |
| Orange | +8 | Negroni, Old Fashioned |
| Absinthe | +6 | Joy Division, Duchess |
| Grapefruit | +5 | Greyhound, Salty Dog |
| Scotch whisky | +5 | Rob Roy, Affinity |
| Applejack | +5 | Applejack Sour, Brandy Toddy |
| Reposado tequila | +5 | |
| Maraschino liqueur | +4 | |
| Mint | +4 | |
| Honey | +4 | |

The list is capped at 10.

---

## 4. Ordering rules (the whole set)

| List | Order | Depends on what you own? |
|---|---|---|
| Your bottles (My Bar) | A to Z by label: accents folded, `localeCompare` | No. A removed row keeps its slot until you leave |
| Setup grids, and the grid on each shelf page | The fixed `SETUP` lists in §3.2 | No |
| Shelf page, "Everything on this shelf" | A to Z | No |
| Search results | Match quality: exact label, then label prefix, then word start, then alias, then shelf or category word, then contains. Then `uses` (descending), then label | **No.** Ticking never moves a row; only the right-hand label and the key change |
| Shelves (empty query) | Fixed: Spirits, Liqueurs & vermouth, Mixers & fresh, Bitters & syrups, Everything else | No |
| Next buys, and the Next buy line (its first row) | Full-slot gain (`gains.get(id).length`) descending, then `uses` descending, then label. This is today's `bestBottle` rank, now the **only** "what to buy" rank | Yes, by design. The ranking is taken when the sheet opens and held while it is open |
| A Next buy's example drinks | Rarity (common, uncommon, rare, legendary), then has a photo, then name. The first two are shown | The match set does |
| You can make, sections | The fixed family order in §3.6. Empty families are left out | Which families appear does |
| You can make, inside a section | Rarity (familiar first), then name | No |

The rule behind the set: **anywhere you tap to change your bar, the order is a property of the items, never of your bar.** The only ranked list, Next buys, is read rather than ticked through. It holds still while open, and its Add flips in place.

## 5. Every interaction

### 5.1 First run
1. My Bar opens on the empty state when no id you own is in the index. This is today's `empty` test.
2. "Set up my bar" opens the setup window at step 1.
3. Tapping a tile toggles it at once: the store's `toggle(id)`, a `haptic.select()`, and the live line updating. Nothing else moves.
4. The key goes to the next step. Its label says Skip or Next as described in §3.2. On step 4 the key is "Done", which closes the window onto the summary, scrolled to the top, with the same number on the make key. VoiceOver announces it: "Your bar has 12. You can make 30."
5. The back chevron (steps 2–4) returns to the previous step with its ticks intact. The X (step 1) closes the window. **Ticks are saved as you make them**, so leaving at any point keeps them. Skipping all four steps leaves you on the empty state, unchanged.
6. "Or add one bottle" opens the add window instead.

### 5.2 Adding
- **Add window:** tap "Add a bottle", type, then tap the key on a row. That is three taps, and the second is typing. The key flips to a check and the live line says what it did. The window stays open for more. The X closes it (it is a full-screen modal, like the + window, so there is no swipe-down).
- **Shelves:** with nothing typed, tap a shelf, then tap a tile or a row's key.
- **Next buys:** tap the line, then Add. The key flips to "Added" in place. Tapping it again undoes the add. The sheet's order and example lines hold. The "+N" on the other rows is refreshed in place, since adding soda water can change what orange adds.
- Each add goes into My Bar's A to Z list straight away, underneath the window or sheet. Closing it shows the list with the new rows already in their places. **No row is ever inserted while the list is visible and under the finger.**

### 5.3 Removing and undo
- Tap the x on a row. The bottle leaves the store at once (`toggle`). The row stays in its slot as "Lime removed · 6 fewer drinks" with Undo, where 6 is `diffMakeable(before, after).lost.length`. The header count, the make key and the Next buy line all update.
- If the removal costs nothing, the row reads "Lime removed · no drinks lost".
- Undo puts the bottle back (`add([id])`) and the row returns to normal in the same slot.
- Several removals each keep their own undo row.
- Undo rows fold away when you leave My Bar: another tab takes the front, read from the tab navigator state as `bar.tsx` already does. A drink page pushed on top is not leaving, so swiping back still finds the Undo.
- VoiceOver announces: "Lime out of your bar. 6 fewer, 24 in all." The Undo is a button in the row.
- For a big bar you can also remove from search. Type the name and tap the check on its row. Same rules apply, and the window's live line reports it.
- **Clear my bar** (••• menu) asks first with a destructive alert: "Clear all 12? You can make 0 after this." It is the only bulk removal.

### 5.4 Seeing what you can make
- The make key pushes "You can make". The jump line scrolls to a family, and a row opens the drink page. Back returns to My Bar at the same scroll position.
- If you can make nothing, the key is replaced by a non-interactive line in body `muted`: "Nothing to make yet." The Next buy line then shows what opens the first drinks. With only gin, that is "+2" from scotch, calvados or dry vermouth.

### 5.5 Search words
- **Labels:** contains-matching, case- and accent-folded, as today.
- **Aliases:** a per-ingredient list in the index (§7.3).
  - "cointreau" finds Triple sec, with the line "Cointreau is a triple sec".
  - "simple" and "simple syrup" find Sugar syrup.
  - "club soda" and "seltzer" find Soda water.
  - "baileys" finds Irish cream, "tanqueray" finds Gin, "kahlua" finds Coffee liqueur, "st-germain" finds Elderflower liqueur, and "lemon juice" finds Lemon.
- **Shelf and category words:**
  - "citrus", "juice", "syrup", "bitters", "liqueur", "vermouth", "wine" or "beer" lists that whole category, under a first row "Citrus · Mixers & fresh ›" that opens the shelf page.
  - "whiskey" or "whisky", "rum" and "tequila" list the family, with the specific bottles first.
- The query clears when the window closes.

### 5.6 The ••• menu (an action sheet)
- **Run setup again** opens the setup window at step 1, with everything you own already ticked. Unticking there removes the bottle, and the live line still applies.
- **Clear my bar** (destructive, confirmed).

### 5.7 The bottle sheet (tap a row's name)

A small sheet with:

- the name in body 600;
- "In 14 of the 30 you can make" in body `muted`;
- "Goes in 173 drinks in all" in small `muted`, from `reachOf`;
- two keys: "Remove" (`wash`) and "Show its drinks" (`ink`), which pushes "You can make" filtered to that bottle, under a back chevron.

This is where the fixed number lives now: behind a tap, not on every row.

## 6. The payoff numbers, live

`matchOwned(owned)` is memoised on the store's `owned` object, so every change recomputes in one walk of the 899 recipes (a few thousand slots) and every re-render reuses the answer.

| Number | Where | When it changes | How it changes |
|---|---|---|---|
| You can make N | Make key | Every add or remove, anywhere | Text in place. VoiceOver hears it through `announce` |
| You can already make N | Setup live line | Every tile tap | Text in place (`accessibilityLiveRegion="polite"`) |
| You can make N · "8 more with orange" | Add window live line | Every toggle in the window | Text in place. The second part is that tap's `diffMakeable` |
| +N drinks on a result row | Add window, shelf page | Every toggle (`gainOf(result, id)`) | Text in place. Rows never move |
| N fewer drinks | Removed row | When it is removed | Frozen at the moment of removal. It describes that tap |
| In your bar N | Section header | Every add or remove | Text |
| Next buy: X +N | Summary line | Every add or remove | Text. The line can name a different bottle afterwards, but a line is not a list, so nothing moves, and adding from it always goes through the sheet |
| Next buys rows | Sheet | Ranked when it opens; +N refreshed live; order held | Text in place |
| Family counts | You can make | On open | The screen is read, never ticked, so it is computed when pushed |

## 7. Mapping onto the code

### 7.1 `src/store/bar.ts`
The shape doesn't change: `owned: Record<string, true>` stays as it is, along with the guarded storage, `RETIRED` renames, `toggle`, `add` and `clear`. Two small additions:

- `remove(id)`: explicit, so the x and Undo never depend on toggle state.
- `RETIRED` gains every merge in §7.3, so saved bars move with the data, as `vermouth` moved to `dry-vermouth` in build 16.

Undo rows are screen state, not store state: `removedHere: Map<id, lost>` in `bar.tsx`, cleared by the existing tab-state listener.

### 7.2 `src/lib/bar.ts`
**Keep:**
- `INGREDIENTS`, `INGREDIENTS_BY_ID`
- `matchBar`, `matchOwned`, `gains`
- `gainOf`, `diffMakeable`, `reachOf`
- the fold helpers

**Change:**
- `bestBottle` becomes `nextBuys(result, limit = 10): { ingredient, matches }[]`, with the same rank (gain, then uses, then label). The Next buy line is `nextBuys(r, 1)[0]`.
- `searchIngredients(q)` returns `{ ingredient, via?: string }[]` and adds the alias and category steps in §5.5. Its order never reads `owned`.

**Add:**
- `type Shelf = 'spirits' | 'liqueurs' | 'mixers' | 'bitters' | 'other'`
- `SHELF_OF: Record<IngredientCategory, Shelf>`:
  - spirit → spirits
  - liqueur and wine → liqueurs
  - citrus, juice, mixer, produce and dairy → mixers
  - bitters, syrup, spice and savoury → bitters
  - other → other
- `SHELF_LABEL`, and `shelfItems(shelf)` (A to Z).
- `SETUP: Record<Exclude<Shelf, 'other'>, string[]>`:
  - spirits: `gin vodka white-rum dark-rum aged-rum bourbon rye-whiskey scotch-whisky irish-whiskey silver-tequila reposado-tequila mezcal brandy cognac pisco cachaca absinthe applejack`
  - liqueurs: `sweet-vermouth dry-vermouth campari aperol triple-sec orange-curacao maraschino-liqueur benedictine green-chartreuse coffee-liqueur amaretto creme-de-cacao creme-de-cassis elderflower-liqueur lillet-blanc irish-cream champagne prosecco`
  - mixers: `lemon lime orange grapefruit mint soda-water tonic-water ginger-beer ginger-ale cola pineapple-juice cranberry-juice egg-white whole-egg cream milk coconut-cream coffee`
  - bitters: `angostura-bitters orange-bitters peychaud-s-bitters sugar-syrup grenadine honey honey-syrup orgeat agave-syrup maple-syrup raspberry-syrup passionfruit-syrup demerara-syrup brown-sugar nutmeg cinnamon cloves hot-sauce`
  - All 72 ids exist in today's index.
- `familyOf(id)`, from a `family` field the build writes for spirits (gin, vodka, rum, whiskey, agave, brandy, other). Then `makeSections(result, owned)`: each makeable drink goes to the family of the owned spirit filling its first spirit slot, or to "No spirit".
- `examplesOf(matches)`: the order in §4.

**Delete:**
- `shoppingList` and `nextBest`: nothing reads them.
- `COMMON_INGREDIENTS`, `browseIngredients`, `CATEGORY_LABEL` and `CATEGORY_ORDER`: only `BarPicker` reads them. `dex.tsx` imports a different `CATEGORY_ORDER`, from `constants/theme`.
- `BASICS` and `basicsResult`: setup replaces them.

### 7.3 `src/data/barIndex.json` (via `scripts/build-bar-index.mjs`)
- **`aliases: string[]`** on each ingredient: a hand-kept table of about 60 entries. For example:
  - `triple-sec`: Cointreau, Combier
  - `sugar-syrup`: simple syrup, simple, gomme
  - `soda-water`: club soda, seltzer, sparkling water
  - `irish-cream`: Baileys
  - `gin`: Tanqueray, Beefeater, Bombay
  - `white-rum`: Bacardi, light rum
  - `silver-tequila`: blanco, plata
  - `maraschino-liqueur`: Luxardo
  - `lemon`: lemon juice
  - `lime`: lime juice
  - `cream`: heavy cream, double cream
- **Merges** (variants, with the old id added to `RETIRED`):
  - `angostura` (category other) → `angostura-bitters`
  - `kahlua` → `coffee-liqueur`, keeping "Kahlúa" as an alias
  - `st-germain-elderflower-liqueur` → `elderflower-liqueur`
  - `lime-disc`, `lime-zest` → `lime`
  - `orange-slices`, `seville-oranges` → `orange`
  - `orgeat-syrup` → `orgeat`
  - `agave-nectar` → `agave-syrup`
  - `egg`, `eggs`, `whole-eggs` → `whole-egg`
  - `golden-rum` → `gold-rum`
  - the "… float" and "… chaser" items → their base
  - Frame 5 already shows the merged result: there are no "Orange slices" or "Seville oranges" rows.
- **Family bugs, found while building this:**
  - **Sloe gin is in the gin family**, so it fills 165 "gin" slots. Sloe gin, dry vermouth and lemon "make" a Martini, Dukes Martini, Fifty-Fifty, Clarito and Gin Fix.
  - **Apricot brandy and peach brandy are in the brandy family** (49 slots).
  - All three are liqueurs. Take them out of those families and refile them as `liqueur`, with cherry brandy too. Until then the app promises drinks it can't pour, which is the trust failure the builder's own header warns about.
- **Refile `other`** (80 items) onto the four shelves wherever it is clear: Amarula and Barack pálinka are spirits, for example. "Everything else" then holds only what is truly odd, and the shelf hides itself when it is empty.
- **`family`** on each spirit, for the "You can make" sections.

### 7.4 Components
**Delete:**
- `BarPicker.tsx`
- `Counter.tsx` (YouCanMake, OneIngredientAway, BestBottleCard, AwayRowView)
- `PourTonightSheet.tsx`
- most of `model.ts`: Snapshot, takeSnapshot, awayOf, pickerOrder, hold, appendAToZ, stripOf, basicsExamples, and the STILLNESS comments
- `faces.tsx` lit and ghost mounts, which belong to Brass

**Add:**

| File | What it holds |
|---|---|
| `bar/Summary.tsx` | MakeKey, NextBuyLine |
| `bar/BottleList.tsx` | FlatList of rows and undo rows, with the field as a sticky header |
| `bar/SetupStep.tsx` | Grid, live line, key; reused by the shelf page |
| `bar/ResultRow.tsx` | Name, alias line, +N or "In your bar", toggle |
| `bar/NextBuysSheet.tsx` | The Next buys page sheet |
| `bar/BottleSheet.tsx` | The bottle sheet |
| `app/bar/setup.tsx`, `app/bar/add.tsx`, `app/bar/shelf/[shelf].tsx`, `app/bar/make.tsx` | The four new routes |

All of it is `View`, `Text`, `Pressable`, `FlatList` or `SectionList`, `expo-image` and `react-native-svg` glyphs. `controls.tsx`'s toggle can be re-skinned as the 36 × 36 result key. `bar.tsx` shrinks to: empty state or Summary, plus BottleList.

## 8. Edge cases

1. **0 items.** The empty state shows: no make key, no Next buy, no list, and no ••• (there is nothing to clear). `matchBar` already returns `EMPTY` for an empty set. Ids saved under an older index that are no longer in it don't count towards "empty", and they are not listed. That is today's filter.
2. **1 item, nothing makeable.** "Nothing to make yet." shows in place of the key, and Next buy shows the best opener. With gin alone, nothing is makeable, 20 drinks are one away, and the best buys are +2 each.
3. **About 100 items** (here, the top 100 by `uses`). It makes 445, with 333 one away, and the best next buys are only +5 (crème de violette, Galliano).
   - The list is 100 rows at a 56 pitch, virtualised.
   - The field pins under the top bar once scrolled, so adding or finding is always one tap away. Typing in the add window finds an owned bottle to remove it.
   - "You can make 445" is grouped into at most 8 family sections, with "No spirit" holding 62 of them. Grouping by each owned spirit would have made 27 sections, which is why sections are families.
   - The jump line wraps to two lines if it has to.
   - Tapping the My Bar tab while on it scrolls to the top (as now).
4. **Everything owned.** Next buy hides, and so does the Next buys sheet. The make key carries the whole count.
5. **Family items ("rum" vs "white rum").** A recipe slot naming "Rum" lists every rum, and a slot naming "White rum" lists only white rum. Owning White rum therefore makes every plain-"rum" drink, and owning only the generic "Rum" makes only the 15 that say just "rum". Setup offers only specific bottles. In search:
   - The generic sorts after its family's specifics (it is a label match like the others, but it gets a family penalty) and reads "Rum, any kind".
   - If you own a member, its right-hand label says "Covered by White rum", and there is no +N. That tells you that you don't need it.
   - A saved bar that holds the generic keeps it, listed as "Rum, any kind".
   - Gin is the exception. The generic "Gin" is what 167 recipes name, and London dry gin adds only one recipe, so setup offers "Gin".
   - With the family fixes in §7.3, a liqueur never fills a spirit's generic slot.
6. **Removing a family member** that was the only thing filling a generic slot. "N fewer" counts those drinks too, because the diff is taken on the makeable sets, before and after.
7. **Undo after leaving.** Not offered. The undo row folds on leaving, and VoiceOver users hear the announcement and get the in-row Undo while they are there.
8. **Setup re-run.** Owned tiles show ticked, and an untick removes the bottle (with no undo row there, but the live line drops at once and the bottle is one tap from coming back). Bottles you own that aren't on any grid are untouched and stay listed on My Bar.
9. **Dynamic Type.** Tiles and rows grow taller. At accessibility sizes the setup grid becomes one column, and the result row's right-hand label moves under the name. Labels truncate with an ellipsis and never overlap the check. The jump line wraps.
10. **Reduce Motion.** Nothing here animates except the system's sheet slides, and those follow the setting.
11. **No photo.** A drink in "You can make" without a photo shows its glass glyph, from `glassware`, falling back to rocks. Today 162 of 2,089 drinks have photos.

## 9. The eight tasks, step by step

**The audit's own task list was cut off in my brief**, so these eight are rebuilt from its findings. A step is one tap, one typed query, or one scroll needed to find something. "Today" counts build 18/19 as the audit describes it.

| # | Task | Today | This model |
|---|---|---|---|
| 1 | Build a first bar (the 12 bottles here) from empty | **8** if your bar is close to the 14 basics: the basics key, the "In your bar" chip, 3 unticks (soda, orange and mint, which it ticked for you), then search, type and tick for Campari. **About 36** for a bar unlike the basics (3 per bottle by search) | **17 taps, no typing, no scrolling.** Set up, 12 tile taps, Next ×3, Done. Nothing is ticked that you didn't tap |
| 2 | Add a common bottle you just bought (Campari) | 3 by search (field, type, tick), or about 5 by chip (scroll the chips, Liqueurs, scroll among 41 ranked) | **3:** field, "camp", +. Or 4 without typing: field, Liqueurs & vermouth, scroll to C, + |
| 3 | Add one by its brand name (Cointreau) | **Fails.** No results, unless you already know it is "Triple sec" | **3:** field, "cointreau", + (Triple sec, "Cointreau is a triple sec") |
| 4 | Remove one (Lime) | About 3: the "In your bar" chip, find it, untick. The feedback lands below the fold | **1:** the x on its row, which is A to Z and on screen. In a big bar, 3 (field, "lim", tap its check) |
| 5 | Undo that removal | 2: scroll down to the note under You can make, then Undo, and only on this visit | **1:** Undo, in the same row |
| 6 | See everything in my bar | 1 (the chip) plus scrolling, and the view lists things you've unticked and misses things added from One ingredient away | **0:** it is the screen |
| 7 | See what I can make and open a drink | About 4: scroll past the picker (2), See all, find it in the A to Z text menu, tap | **2:** You can make, then the drink (plus a scroll inside its family, or 1 tap on the jump line) |
| 8 | Find the best next bottle and add it | About 3: scroll to One ingredient away, then the best bottle's Add, with two other rankings on screen giving different answers | **0** to know it (the Next buy line, at rest). **2** to add it: the line, then Add |

These are also on the board: **clearing the bar** takes 3 today (chip, scroll, Clear) and 3 here (•••, Clear my bar, confirm). **Re-running setup** isn't possible today (the basics key only shows while empty) and takes 2 here.

Task 1 is the only one where the tap count goes up, if your bar happens to look like the basics. The trade is deliberate: the basics key ticked vodka, triple sec and mint whether you had them or not, and then left you to find the wrong ones in a ranked list.

## 10. Budget check

| Rule | Here |
|---|---|
| One margin | Every edge is at x 24 or x 416. Only the keyboard, the scrim and the sheet run full width |
| Three type sizes, plus Playfair | Title 28/34 (screen titles), body 17/24 at 400/500/600 (everything else), small 13/18 (alias lines, quiet counts on title baselines, example lines, the empty-state step line). Playfair 17 for drink names; there is no Playfair 28 on these screens |
| Top bar: title plus at most 1 icon | My Bar has •••. The empty state has none. Windows have only the X or a back chevron |
| Space, not rules | No rules, dividers, cards or outlines. The filled surfaces are fields, keys, tiles, the sheet, and the `wash` behind a glass glyph |
| One primary action per screen | Empty: Set up my bar. Setup: Next / Skip / Done. Summary: You can make. Next buys: Add (a list of the same action) |
| Details behind a tap | "in 173 drinks", "in 14 of yours", Remove and Show its drinks: the bottle sheet. Rankings: Next buys. Drinks: their pages |
| No uppercase | None. The jump line uses sentence-case family names. There are no letter indexes |
| Squared keys | Every key and tile has radius 4. The sheet has radius 12 at the top. Avatars stay round |
| WCAG AA | `ink`/`page` 19.80 · `ink`/`wash` 18.16 · `muted`/`page` 6.69 · `muted`/`wash` 6.13 (placeholders) · `onInk`/`ink` 19.80 (keys, ticked tiles, the check) · `control`/`page` 3.45 (the remove x and resting tabs, UI only and never text) · `control`/`wash` 3.17 (no-photo glass). The scrim never sits under text that has to be read |
| Hit areas | 44 × 44 or more everywhere: the x (44 × 56), Undo, the toggle key (36 × 36 inside a 64 row hit), each jump word, the Next buy line (392 × 44) |

**Element counts** (visible at rest; a key with its label counts as 1; a field counts as 3: field, glyph, placeholder):

| Screen | Count |
|---|---|
| My Bar summary | **71 → 36** (title and ••• 2 · make key 2 · next buy 4 · header 2 · field 3 · 9 rows × 2 = 18 · tab bar 5) |
| Empty state | 15 |
| Setup step | 24 |
| Add window, mid-search | 24 |
| Shelves | 22 |
| Brand-name search | 11 |
| You can make | 30 |
| Next buys sheet | 20 |

The summary's 36 is five more than white-min's 31. The difference is the remove x on each row, which buys one-tap removal on a list where every row is something you own.

## 11. Open questions

1. **Sugar syrup and honey syrup** are separate ids from sugar (a dropped staple) and from honey. Anyone with sugar can make sugar syrup. Treating `sugar-syrup` as a staple would change a lot of counts, so it is Jan's call, not this screen's.
2. **Orange as a requirement.** The index counts orange peel, so Negroni and Old Fashioned need an orange. That is why "Orange +8" is the second next buy here. It's correct by the builder's rules, but people may be surprised that a Negroni needs fruit.
3. **Copy:** "Next buy" was chosen over the model's "Next bottle" because the line also names lemons and mint. Either word works in the layout.
