# v4.2: taste filters, a Dex in your order, search that comes back, saved collections

13 Oct 2026. Jan: "I want to put the filters be like fruity or sour, the same questions asked on the drinks at the start of the app, then the same for the filters. Then I want the dex to be devided by the same recomendations you make to the user. If he picks out fruity drinks or sour drinks, then put them in an order where those drinks come first or something like that. Then I want you in the same dex page to make it so when the user scrolls up, the search tab appears, and the filters as well. Then I want you to make it so when I save a post, I can create "Folders" or collections in the saved section, wether fruity or sour or strong or whatever, but the users can create / delete them, and also share them if they want to."

Base: build 23 (`v3-3` at d3c0aeb). Daylight tokens (`specs/v4-mockups/white/spec.md`), the less-stuff layout (`specs/v4-mockups/layout/spec.md`), the first run and its recommender (`specs/v4-onboarding/spec.md`, `specs/v4.1-changes.md`), the Saved tab (`src/app/(tabs)/saved.tsx`). Nothing here changes a palette value, a type size or the tab bar.

| Jan asked | v4.2 answer | § |
|---|---|---|
| Filters "like fruity or sour, the same questions asked at the start" | The filter sheet uses the first run's own words: seven flavours (Fruity is new, and joins the first-run question too), the seven spirits, kind, caught or not yet | 1 |
| "The dex divided by the same recommendations… those drinks come first" | With answers, the Dex opens **For you**: one section per flavour you picked, in your order, each headed by the recommender's best 12, then "Everything else" by number. One key switches to **By number** | 2 |
| "When the user scrolls up, the search tab appears, and the filters as well" | The field and the chip row ride a header outside the list: scrolling down slides it under the bar, the first upward movement brings it back, finger-driven on the UI thread | 3 |
| "Folders or collections in the saved section… create / delete… share" | Instagram's collections: save as now, then "Save to collection"; collections hold posts and drinks; rename, delete, remove items; share by a link that opens in the app or on a web page, and stop sharing | 4 |

## Files

| Path | What |
|---|---|
| `spec.md` | This |
| `index.html` | 16 frames at 440 × 956. `index.html#<id>` shows one |
| `contact.png` | The wall at 1x |
| `foryou.png` `bynumber.png` `notaste.png` `hidden.png` `revealing.png` `filter.png` `flavours.png` `savebar.png` `sheet.png` `new.png` `saved.png` `collection.png` `more.png` `share.png` `shared.png` `web.png` | One frame each at 2x (880 × 1912) |
| `tools/recommend.mjs` | **The v4.2 reference recommender**: the v4-onboarding reference plus `fruity` (§1.2), the sour cap (Decided 5) and two exports. Runs A, C and D print what the v4-onboarding one printed over the same data; run B's card reads 147 (was 149). It replaced `specs/v4-onboarding/tools/recommend.mjs`: one file in both places, and `check-recommend` fails if they part |
| `tools/dex-order.mjs` | **The reference for §1 and §2**: chip membership, faceted counts, the For-you sections and the total order. `node tools/dex-order.mjs` prints the figures quoted below; `--write` regenerates `data/dex.js`, which the mockups read |
| `023_collections.sql` | **Migration 023, draft** (§4.9), with its VERIFY block. Moves unchanged to `supabase/migrations/` |
| `tools/render.sh` | Renders the PNGs with throwaway headless Chrome profiles under `.chrome-profile/`, kills only those processes, deletes the profile. `./tools/render.sh web share` re-renders some |

Every drink, count, section and "See all" figure in the frames is real output over `src/data` for **persona E**, Jan's own example: cocktails and spirits, rum (white) and tequila, **sour and fruity**, sometimes makes drinks at home, 14 drinks caught. The people and collection names are stand-ins.

### Mocked or only specified

| Mocked (a frame) | Specified only (words, no frame) |
|---|---|
| Dex For you at rest; By number; no answers; scrolled down (hidden, rail); mid scroll-up (revealing); the filter sheet; the first run's flavour step with Fruity | The Order sheet (two radio rows); the flat grid a filter or search gives in For you; a typed number in For you; Dynamic Type and VoiceOver layouts |
| Just saved (the bar); the save-to-collection sheet; New collection; the Saved tab with collections; a collection page; its •••; the share moment; the shared view in the app; the web page | Rename; Remove items (select mode); the delete confirm; "Add from All saved" after a New collection made on the Saved tab; signed-out and before-023 states; every error; the web page's loading, gone and not-yet states |

---

## 1. Taste filters

### 1.1 The vocabulary is the first run's

The filters say exactly what the first run said, in the same order, with the same scorer behind them (`lib/recommendCore`), so "Sour and citrusy" means one thing everywhere in the app.

| Group | Chips, in order (label = the first run's key) | Key |
|---|---|---|
| Flavour | Refreshing · Sour and citrusy · **Fruity** · Sweet · Bitter · Strong and stirred · Creamy | `refreshing` `sour` `fruity` `sweet` `bitter` `strong` `creamy` |
| Spirit | Gin · Rum · Tequila and mezcal · Whiskey · Vodka · Brandy and cognac · Liqueurs and amaro | `gin` `rum` `agave` `whiskey` `vodka` `brandy` `liqueur` |
| Kind | Cocktails · Spirits | `cocktail` `spirit` (one or none, as today) |
| In your Dex | Caught · Not yet | `unlocked` `locked` (one or none, as today) |

"Added by you" stays where it is: the row over the grid while a search finds a drink you added (unchanged, never a chip).

### 1.2 Fruity, exactly

Jan named it; the first run did not have it. It is added in **four places at once**, and nothing else in the scorer moves.

**The definition** (`FLAVOURS.fruity`, after `sour` in the object):

- **Families that are fruity** (`subcats`, a hit of 1): `Tiki & Tropical`, `Punch & Cobbler`, `Fruit Brandy`.
- **Fruit the notes name** (`notes`, 0.5 each, the reference's rule), fresh fruit that is not citrus (citrus is sour's): apple, pineapple, banana, peach, pear, apricot, raspberry, strawberry, cranberry, blackcurrant, pomegranate, passionfruit, passion fruit, mango, berry, red fruit, red berry, stone fruit, tropical fruit, green apple, melon, plum, lychee, sour cherry, tart berry, tart plum, ripe pear, ripe banana, orchard fruit, baked apple, cider, sloe, watermelon, guava, jam, juicy, blackberry, bramble jam, berries, red berries, tart fruit, tart red fruit, sloe berry, ripe peach, white peach, muskmelon, honeydew melon, guavaberry, cloudberry, tropical (the last fourteen added in review: without them Midori, Melon Liqueur and Crème de Mûre scored 0, and the Bramble, Bellini and Sloe Gin Fizz only 0.5). **Not** the dried and sherried notes a whisky carries (dried fruit, raisin, dried fig, prune, sherried fruit), and **not** plain "cherry" or "dark cherry", which in this catalogue is the maraschino garnish on every Manhattan.
- **Fruit the recipe names** (`ids`, 0.5, barIndex ids): the fruit juices and purees (pineapple, cranberry, apple, passion fruit, mango, guava, papaya, pomegranate, blackcurrant, strawberry, white peach), fresh fruit (strawberries, pineapple, banana, peaches, watermelon, papaya, green grapes, mixed, seasonal and chopped fruit, seasonal berries), the fruit syrups (raspberry, passion fruit, raspberry cordial, blackcurrant cordial), and the fruit liqueurs (crème de cassis, Chambord, crème de mûre, blackberry, peach schnapps and liqueur, apricot, pear, melon, banana and crème de banane, cherry liqueur and Cherry Heering, passion fruit, sloe gin, sour apple schnapps, guavaberry, umeshu). Not grenadine (sweet's), not maraschino liqueur (it is in the Aviation and the Last Word, which nobody calls fruity), not triple sec or curaçao (citrus).
- **One new rule, `noteAbvMax: 30`**: above 30% abv only the family counts. A 40% Speyside that says "orchard fruit, pear" is not fruity (0); a fruit brandy is (its family, 1); a 16.5% Chambord is (its notes). In `flavourHit`, straight after the `abvMin` line: `if (F.noteAbvMax && abv !== null && abv > F.noteAbvMax) return 0;`. It applies to fruity and, since Decided 5, to sour; no other flavour's output moves.

**What it gives** (`tools/dex-order.mjs`): **322** drinks are fruity (239 cocktails, 83 spirits; 216 plainly, by family or two signals). Fruity alone, cocktails only, picks Piña Colada · Cosmopolitan · Mai Tai · Cape Codder · Sangria · Fuzzy Navel. Without `noteAbvMax` it was 572, the extra 250 nearly all 40% bottles, half of them whiskies; without dropping "cherry" the Martinez, Rob Roy and Brooklyn were fruity.

**The four places:**

1. **The reference**: `specs/v4.2/tools/recommend.mjs` replaces `specs/v4-onboarding/tools/recommend.mjs`. Diff: the `fruity` entry, sour's `noteAbvMax: 30` (Decided 5), the `noteAbvMax` line, `LIKE.fruity = 'fruity drinks'`, the bar step's extra `fruity: ['pineapple-juice']`, and `export` on `spiritHits` and `flavourHit`. With the sour cap, run B's card reads 147 (was 149: La Bandera and Bandera, 40% shots that only say lime, left sour); runs A, C and D are unchanged.
2. **The port**: `src/lib/recommendCore.ts` gets the same entry and sour's cap, `noteAbvMax?: number` on `FlavourChoice`, the same line in `flavourHit`, `LIKE.fruity`, `BAR_BY_FLAVOUR.fruity`. `src/store/taste.ts`: `Flavour` gains `'fruity'` and `FLAVOUR_KEYS` lists it after `'sour'` (the persisted-answers check then accepts it; `FLAVOURS_MAX` stays 3). Migration 022 needs nothing: `answers` is jsonb.
3. **The check**: `scripts/check-recommend.mjs` imports the new reference (path change) and gains two runs, so the expectations cover fruity:
   - **E** (persona E) `{ goal: null, drinks: 'both', spirits: ['rum','agave'], styleOf: 'rum', styles: ['white'], flavours: ['sour','fruity'], home: 'sometimes', bar: ['white-rum','tequila','lime','lemon','sugar-syrup','soda-water'] }` → ids `daiquiri, strawberry-daiquiri, pina-colada, margarita, illegal, mezcal-joven`; Piña Colada's why line "Because you like white rum and fruity drinks"; `matchingCount` **161**; barRows' extras `triple-sec, pineapple-juice`.
   - **F** `{ drinks: 'cocktails', spirits: [], flavours: ['fruity'], home: null, bar: [] }` → names `Piña Colada, Cosmopolitan, Mai Tai, Cape Codder, Sangria, Fuzzy Navel`, every why "Because you like fruity drinks"; `matchingCount` **239**.
   - The sweep draws flavours from `Object.keys(ref.FLAVOURS)`, so it now sweeps fruity on both sides with no edit. The PASS line reads "runs A to F … (matching 574, 147, 2073, 378, 161, 239)".
   - It also writes and checks **`src/data/tasteTags.json`** (§1.3) with `--write`, like `classics.json`.
4. **The first run**: step 7 (`flavours`, v4.1 §1.2) shows seven keys: Refreshing · Sour and citrusy / Fruity · Sweet / Bitter · Strong and stirred / Creamy, a 2 × 4 grid of the same 174 × 64 keys at the same 76 pt pitch from y 270, Creamy alone on the last row (keys keep one size; a lone full-width key would read as a different kind of answer). The feedback card is unchanged and still fits (the grid ends at y 562, the card starts at 719). Frame `flavours`. Settings → Your tastes reruns the same step, so existing accounts can add Fruity.

### 1.3 What a chip holds, and how chips combine

- **A flavour chip** holds a drink when `flavourHit(d, f) >= 0.5`: the scorer says it at least once. It is the same line as the first run's card ("That's 161 drinks in the Dex that match"), so the numbers agree.
- **A spirit chip** holds a drink when `spiritHits(d).get(s) === 1`: the spirit is its base, or the bottle itself is one. Not the 0.6 "it is somewhere in the recipe", or every Long Island would be gin, rum, tequila and vodka at once.
- **OR inside a group, AND across groups.** Sour and citrusy + Fruity + Cocktails + Not yet = cocktails not caught yet that are sour or fruity (525 for persona E).
- **Counts are faceted**: a chip's figure is how many the grid would hold with that chip as its group's only choice and the other groups as they are, so it answers "how many would I see". The kind and caught counts behave as today.
- **Strong and stirred counts 1,303**, because every bottle is strong (abv 25+, the scorer's rule). That is honest: with Cocktails on it is 224, the stirred drinks.

**Cheap on the phone: `src/data/tasteTags.json`.** Per catalogue id, one integer: bits 0–6 the seven flavour chips (≥ 0.5), bits 7–13 the seven spirit chips (base), bit 14 cocktail, bits 15–21 the flavour said plainly (a hit of 1, which decides a drink's section, §2.2); plus one `stamp` (a hash of drinks.json, barIndex.json and `lib/recommendCore.ts`, the scorer, so any edit to that file, a comment included, needs `--write`) that `dexFronts.forAnswers` includes (§2.2). Generated by `scripts/check-recommend.mjs --write` from the port and checked in step on every run, like `classics.json` (the check fails when a catalogue edit or a scorer edit leaves it stale). About 58 KB. Every filter and every count is then bit tests over 2,089 integers: the sheet's 18 faceted counts are about 38,000 tests, well under 2 ms, worked when the sheet opens and on each tap. Nothing is scored at runtime for filtering.

**In code**: the existing one-pass filter in `dex.tsx` keeps its shape; `category` and `status` become one `filter` object `{ flavours: Flavour[]; spirits: Spirit[]; kind: CategoryFilter; status: StatusFilter }`, and `dexFilter.ts`'s note (Dex progress's "See your 38") sets it the same way.

### 1.4 The sheet (frame `filter`)

Behind the sliders key in the field, as today; a `BottomSheet` titled **Filter** with **Clear** (text key, underlined, ink) on the title's row. Four groups, each a `small` 600 `muted` label and wrapping chips (32 tall, 4 pt, `hair` edge off, `ink` on, the count in `muted` / `onInkMuted`: `components/ui` `Chip` as built). 24 pt between groups. At the foot, one ink key **Show 525 drinks** (the live total) that closes the sheet. Chips apply at once, so the grid behind has already changed; the key only closes. "Show 0 drinks" is drawn as the disabled key ("No drinks match"), never hidden.

- The sheet scrolls inside itself at large Dynamic Type sizes; the foot key stays.
- VoiceOver: each group is a list with its label as header; a chip is a `button` with `selected`, labelled "Fruity, 235 drinks"; the foot key "Show 525 drinks".
- The field's key is the solid sliders glyph while anything is on (`Icon sliders filled`), "Filter, on" for VoiceOver, as today.

### 1.5 The quick chips (the row under the field)

The row under the field (§3 header) holds the order key (§2.3) and **quick chips**, the same chips as the sheet, one tap each:

1. every chip that is **on**, in sheet order, ink;
2. then the person's **own answers** that are off: their flavours in answer order, then their spirits (persona E: Sour and citrusy · Fruity · Rum · Tequila and mezcal);
3. without answers: Cocktails · Spirits · Not yet, then the first two flavours (frame `notaste`).

At most 8 chips; the row scrolls sideways edge to edge (`scrollsToTop={false}`), cut by the screen's edge as the cue. The sheet stays the full set. No counts on quick chips (they are in the sheet), so the row stays quiet.

### 1.6 Nothing is pre-picked

The person's answers **order** the Dex (§2) and **offer** themselves as quick chips (§1.5); they never filter it on arrival. A sour drinker still meets the Old Fashioned, and a filter they did not set would make the Dex look smaller than it is.

---

## 2. The Dex in your order: For you

### 2.1 When

- **Answers with at least one flavour or one spirit** → the Dex opens **For you** (frame `foryou`).
- **No answers** (skipped, or an account from before v4.1) → **By number** only; no order key; one quiet line above the grid, "Tell us your taste, and your kind of drinks come first ›" (`small` `muted`, chevron), opens Settings → Your tastes (the existing rerun of the first run's steps). Frame `notaste`. Once answered, the Dex is For you on its next focus.
- A person who chose By number keeps it (§2.3).

### 2.2 The order, exactly (`tools/dex-order.mjs` `forYou`, ported as `src/lib/dexOrder.ts`)

Built on the recommender, never inside it:

1. **Section keys.** The person's flavours in the order they picked them; with none, their spirits; with neither, no For you.
2. **Membership.** A drink belongs to at most one section: the key it hits hardest (`flavourHit`, or `spiritHits` for spirit sections), ties to the earlier answer. Below the chip line (§1.3) in every key: no section. A strawberry daiquiri, sour 1 and fruity 1, is a sour for someone who said sour first.
3. **A section's front: its best 12.** `recommend({ ...answers, drinks: answers.drinks === 'both' ? null : answers.drinks, exclude: <every drink outside the section> }, 12)`: the scorer's own order, its variety caps, its three photographed openers, photographed first. (`both` gates nothing; dropping it only drops its two-and-two guarantee, which would put a bottle of white rum at the head of the sours.) When the person's own gates (their spirits, cocktails-only or spirits-only) leave fewer than 12, the rest of the front comes from the same call with the gates lifted, so a gin drinker's "Fruity" still has 12. Slice to 12 (`recommend` can return 3 for n < 3).
4. **Everything else**: every drink not in a front, **in Nº order**. Every drink appears exactly once (checked: the order is a permutation of 2,089).
5. **Caught drinks stay in place.** Nothing is excluded for being in the Dex: the Dex is the book, and a tile never jumps away because you caught it. It turns from proof to print where it is.
6. **Deterministic**: no randomness, no clock; same answers, same Dex on every phone.

**Persona E** (frame `foryou`, `hidden`, `revealing`):

| Section | Header right | The front, in order |
|---|---|---|
| Sour and citrusy | See all 445 | Daiquiri · Mary Pickford · Mojito · Puka Punch · Margarita · Papelón con Limón y Ron · Paloma · Art of Choke · Cazuela · Frozen Margarita · Adios Motherfucker · Tommy's Margarita |
| Fruity | See all 322 | Strawberry Daiquiri · Piña Colada · Barbados Rum Punch · Rum Runner · Hurricane · Guarapita · Tokyo Tea · Tropical Itch · Regent's Punch · El Diablo · Aruba Ariba · La Perla |
| Everything else | by number | the other 2,065, from Nº 0001 Caesar |

Run A's person (gin and bourbon, bitter and strong): **Bitter** Boulevardier · Left Hand · Negroni · Paper Plane · Horse's Neck … ; **Strong and stirred** Old Fashioned · Revolver · Earthquake · Rusty Nail · Flying Dutchman …. A spirits-only whiskey person gets one **Whiskey** section: Old Fashioned · Bottled-in-Bond Bourbon · Irish Blended Whiskey · Blended Malt Scotch ….

**Why fronts of 12, not whole sections.** Sour and citrusy holds 445 drinks; a whole section (the 386 that are sour first) would bury Fruity 193 rows down, where nobody arrives. Twelve (six rows, a screen and a half) is the recommendation; **See all 445 ›** is the rest, one tap away (it turns that flavour's chip on, §2.4). Open question 1.

**Cost and where it lives.** The fronts are up to six `recommend()` calls (14–25 ms in Node on an M-series; budget 120 ms on an iPhone 12), so they are worked **when the answers change**, not when the Dex draws: at the first run's `pour` step (beside the picks), at Settings → Your tastes' Continue, and once in `store/taste`'s persist `migrate` (v1 → v2) for accounts that answered before v4.2, during the splash. Stored in the taste store as `dexFronts: { forAnswers: string; sections: { kind: 'flavour' | 'spirit'; key: string; ids: string[] }[] } | null` (`forAnswers` = the stable JSON of `drinks, spirits, styleOf, styles, flavours, home, bar` **plus the catalogue stamp `tasteTags.json` carries** (a hash of drinks.json and the scorer), so a build that changes the catalogue or the scorer recomputes once instead of keeping last build's fronts; a mismatch recomputes). Answers that arrive from another phone (`firstSync`, server wins) are a change of answers: the recompute runs in the taste store's subscriber after interactions, never inside the Dex's render; until it lands the Dex draws the stored fronts, skipping what no longer exists. Everything else (membership, Everything else, the total order) comes from the fronts plus `tasteTags`, O(n) per render of a new filter, memoised on `(dexFronts, filter, query)`. A catalogue drink that disappears is skipped on read.

### 2.3 The order key and the Order sheet

The row's first key is the order key: **For you ⌄** or **By number ⌄** (`wash` fill, `ink` 500 `small` label, a 14 pt chevron; the same 32 × 4 pt as a chip, filled so it never reads as a filter). It opens a short `BottomSheet`, **Order**, with two radio rows (body, 56 tall, the ticked one with an ink check): "For you" with the small line "Your kinds of drinks first, then the rest by number", and "By number" with "Nº 0001 to 2,089". A tap applies and closes. Not mocked.

The choice is kept per phone in a small store, `src/store/dexPrefs.ts` (`createGuardedStorage`, key `sipply-dex.v1`, `{ order: 'foryou' | 'number' | null }`; null = the default of §2.1). It is a convenience, never synced. VoiceOver: "Order, For you. Button. Opens the order choice."

### 2.4 With a filter or a search

- **Search text** or **any filter on** → the grid is **flat**: no section heads, the matching drinks in **the total order**: the fronts' drinks first, in their order, then every other match by its section (first answer first, no section last), each by Nº. So "rum" in For you shows Barbados Rum Punch, Rum Runner, Rum Barrel first (`dex-order.mjs` prints it); in By number it is by Nº, as today.
- **See all 445 ›** sets the flavour chips to that one flavour; the grid goes flat in the same order, 445 drinks, the chip on in the row.
- **A typed number** jumps to the drink's tile wherever it is (a `Map<dexNumber, rowIndex>` built with the rows, so it works in any order), outlines it for 1 s, as today. A number hidden by a filter clears the filters and goes, as today.
- **The bar's count** reads caught / total of what the filters hold, ignoring Caught / Not yet (today's rule, widened from kind to every group): "10 / 535" in frame `filter`.
- **Empty**: today's `GridEmpty` answers, with "Not under these filters" now naming the chips ("Sour and citrusy, Fruity, Cocktails").

### 2.5 The Nº rail in For you

It still shows only while the grid moves. In **By number** and in a flat By-number result it is today's rail. In **For you at rest** its top holds **one stop per section** (44 pt each, a 1.5 pt `control` tick), then a 12 pt gap, then the Nº hairline for Everything else. The thumb reads the section's name while a section is under the bar ("Fruity", frame `hidden`; the tag grows left to fit, 44 tall) and "0412" once Everything else is; dragging to a stop jumps to that section's head, below it jumps by number within Everything else. In a **flat For-you result** (§2.4) the order is not by number, so there is no rail. VoiceOver: the adjustable element's values are the section names, then the numbers.

### 2.6 Geometry at 440 (the header is §3)

| Piece | Geometry |
|---|---|
| Bar | 62–114, "Dex" `title` at x 24, the count `small` `muted` tabular right-aligned to 416 on the title's baseline (unchanged) |
| Header | 114–226 (112): field 392 × 44 at y 122; row of 32 pt chips at y 178, from x 24, 8 apart, scrolling to the screen edge |
| First content | y 234 |
| Section head | 24 tall: the name `body` 600 at x 24; right-aligned to 416, "See all 445" `small` 500 `ink` + a 16 pt chevron (a 44 pt-tall hit over the whole head) or, for Everything else, "by number" `small` `muted` and no hit. 12 to the first row |
| Grid | today's: 184 prints at x 24 and 232, Playfair 17/24 names two lines reserved, 264 pitch |
| Between sections | the last row's 24 ledge + 8, so 32 of air before the next head |
| No-answers line | y 234–252, then the grid at 270 |

**Element count at rest**, For you (frame `foryou`): bar 2 · field 4 · order key + 4 quick chips 5 · section head 2 · 4 prints and 4 names (+2 cut) · tab bar 5 = **28**, against the less-stuff Dex's 25. The three new things at rest are the order key, the chips Jan asked to see, and one section head.

### 2.7 Accessibility

Section heads are `header`s (the rotor's Headings jumps between sections), "See all" is a `button` "See all 445 sour and citrusy drinks". A tile's label is unchanged. The order key's label says the current order. The no-answers line is a `link` "Tell us your taste. Opens the taste questions". Colour is never the signal: caught is colour *and* the ink name, as today.

---

## 3. Search that comes back when you scroll up

### 3.1 Behaviour (frames `hidden`, `revealing`)

- **The header** is the field and the chip row (112 pt at 440, more at large text sizes). The bar ("Dex" and the count) never moves.
- **Scrolling down** slides the header up under the bar, 1:1 with the finger, until it is gone (−112). The grid gets the whole screen.
- **Scrolling up** brings it back **from the first point of upward movement**, 1:1, fully back after 112 pt of travel (a short flick). It stays until you scroll down again: Instagram's header, Safari's toolbar.
- **At the top it is always fully shown**, and **at rest it never covers the first row**: the list's content starts under it (paddingTop = header height).
- **Opacity** follows the slide: 1 until the header is 40% gone, then down to 0 at fully hidden, so a half-hidden header reads as moving, not broken. Its `page` ground stays opaque (nothing shows through it, frame `revealing`).
- **Pinned** (always shown, nothing moves) while: the field has focus or the keyboard is up; the filter or order sheet is open; a finger is on the rail; **VoiceOver or Switch Control is running**.
- **Coming back to the tab**, tapping the Dex tab again, or the status bar: shown (the top is reached, and focus rebuilds the graph shown, as `useHideOnScroll` does for Home).
- **No snap.** It can rest part-shown after a slow drag, as Home's bar does today; any rest is a drawn state, because the finger, not a clock, put it there.

### 3.2 Build

**The house mechanism, not a new one.** `components/ScrollChrome` already does this for Home's bar: the tab's list reports its offset into one native `Animated.Value` (`useTabScroll('dex')`, already on the Dex list), and `useHideOnScroll(tab, distance)` turns it into a `diffClamp` + `interpolate` graph on the **native driver**. That is UI-thread, moved by scroll events alone, with no timer, frame loop or Reanimated worklet, so the Release stall of specs/06 (and v4.1 §7.0) cannot freeze it half-way, and check-design rule 15 (no `Animated.timing` in ScrollChrome) holds. Reanimated's `useAnimatedScrollHandler` was considered and not used for that reason.

1. **Header out of the list.** `head` stops being `ListHeaderComponent`. It is an `Animated.View` positioned absolutely at the bar's foot, inside a clip view (`overflow: 'hidden'`, top = bar bottom, height = header height) that sits above the list and under the bar in z-order. It measures itself (`onLayout`) and the list gets `contentContainerStyle={{ paddingTop: headerH, … }}`; `onHeadLayout` / `headH` (used by the number jump's estimate) read the same value.
2. **The graph.** `const hide = useHideOnScroll('dex', headerH, { pinned })` (a new optional `pinned` that returns `store.rest`, the constant 0, and rebuilds shown when it turns off; the hook already returns `store.rest` under VoiceOver). `transform: [{ translateY: Animated.multiply(hide, -1) }]`, `opacity: hide.interpolate({ inputRange: [0, 0.4 * headerH, headerH], outputRange: [1, 1, 0], extrapolate: 'clamp' })`. The ground's `page` fill sits on the translated view, the opacity on its contents.
3. **`pointerEvents`.** The clip view is `box-none`; a hidden header is under the opaque bar and clipped, so a tap cannot land on it. Its `accessibilityElementsHidden` is never set: under VoiceOver it is pinned and always reachable, and it is first in the screen's accessibility order (rendered before the list).
4. **The rail.** The rail's dock rides the same graph: `translateY: Animated.subtract(headerH, hide)` from the bar's foot, so it starts under the header when shown and under the bar when hidden, and never lies over the field.
5. **Jumps.** A typed-number jump happens with the field focused, so the header is pinned. A rail drag pins it while held. After either, the next finger scroll moves it from where it is. **Because the header is now over the list, not in it, every jump lands below it**: `scrollToIndex({ index, viewOffset: headerH })`, and the estimate in `onScrollToIndexFailed` drops today's `headH.current +` (the list's `paddingTop` already holds it), so the outlined tile, a rail stop's section head and "See all"'s first row are never drawn under a pinned header.
6. **The bar's rule** (`useScrolledPast`) shows once content is under the bar *or* the header, unchanged in kind.
7. **No layout animations**, no `entering` / `exiting`, nothing starts invisible: at rest the header is drawn at translate 0 and opacity 1 by the graph's identity.

Acceptance: in a Release build on device, with the Reanimated stall reproduced (specs/06's cold start), the header still hides and returns with the finger; at the top it is whole; under VoiceOver it never moves.

---

## 4. Saved collections

### 4.1 The model

- **All saved** is what Saved holds today: saved **drinks** (the bookmark on any drink's page or the first picks; `store/taste` `saved`, synced to `want_to_try`, 022) and saved **posts** (the post's bookmark; `saves`, 017). Saving works exactly as now.
- A **collection** is a named group of things in All saved, drinks and posts together. A thing can be in several collections.
- **In a collection ⇒ saved.** Adding to a collection saves first. **Unsaving** (the bookmark again, from anywhere) takes the thing out of every collection too; when it is in one or more, the unsave asks first: "Remove from All saved? It is also in Sunday sours and Fruity." **Unsave** / **Cancel** (an `Alert`). Removing from a collection keeps it in All saved. The server enforces the same (023 §4 triggers), so a second phone cannot leave an orphan. Open question 4.
- **Caps**: 50 collections per account, 200 items per collection (All saved drinks are already capped at 200 by 022).
- **Collections need an account** (they live on the server so they can be shared and follow you). Signed out, saving drinks works on the phone as today and nothing about collections is shown.
- **Before 023 is applied** nothing about collections is shown anywhere (§4.10).

### 4.2 Saving, then "Save to collection" (frame `savebar`)

- A tap on any bookmark saves to All saved, as now. If the person has an account and 023 is live, a **bar** rises above the tab bar (or above the home indicator on a pushed screen): 392 × 60 at x 24, 12 above the tab bar, `ink`, 4 pt; a 40 pt print of the thing (the post's photo, or the drink's print or no-photo face), "Saved" `body` 500 `onInk`, and **Save to collection** (`body` 500 `onInk`, underlined, the bar's one key, 44 tall). It is the screen's one solid object while it shows.
- It stays **4 s** (a JS timer), and 10 s while VoiceOver runs; it is announced ("Saved. Save to collection, button"). A new save restarts it; scrolling does not dismiss it; a swipe down does. It never shows on an unsave.
- **Long-press any bookmark** (500 ms, a light haptic): saves if not saved, then opens the sheet directly, no bar. VoiceOver: a custom action "Save to collection" on every bookmark.
- Motion: mounted at rest-drawn values (opacity 0.6, 8 pt low) and brought to rest with `withTiming` 180 ms `out`; a JS timer at 230 ms re-renders it at its plain end style (v4.1 §7.0). Removal is a JS-timed unmount after a 140 ms fade.

### 4.3 The sheet (frame `sheet`)

A `BottomSheet` (medium detent; full at more than six collections, then it scrolls): **Save to collection** (`body` 600, centred), under it `small` `muted` "maya.pours's post is in All saved" for a post, or "Hemingway Daiquiri is in All saved" for a drink (a post's line names its author, so it never reads as the drink being saved). Rows of 64 pt:

1. **New collection**: a 48 pt `wash` square with a 24 pt plus, `body` 500.
2. Every collection, the one saved to last first (`updated_at desc`): a 48 pt cover (§4.5), the name in `body` (one line, ellipsis), and a 22 pt box at the right edge, ticked (`ink` with a white check) when the thing is in it.

A row tap toggles membership **at once** (optimistic; on error it untoggles and a `Notice` says "Could not save to Sunday sours. Try again."), with a selection haptic. **Done** (ink, 392 × 52) closes; so does the scrim or a swipe. At a cap the row says why in its own `small` line ("Full: 200 items") and does not tick. VoiceOver: each row a `checkbox` "Sunday sours, 9 drinks and 2 posts, not in it".

### 4.4 New collection (frame `new`)

From the sheet's first row, the sheet pushes to its second page (a back chevron, **New collection** centred): the thing being saved as a 120 pt cover, one field (56 tall, `wash`, focused, an `ink` 1.5 pt edge while focused, "Collection name" placeholder, a `small` `muted` "12 / 40" counter), the line "Only you can see it. You can share a link to it later.", and **Create** (ink; `off` until the name has a non-space character). The keyboard's return key creates too. The name is trimmed, 1 to 40 characters, duplicates allowed. Create makes the collection with the thing in it and returns to the first page, ticked.

From the **Saved tab's New collection tile**, the same name page, then **Add from All saved**: All saved's grid (drinks two-up, posts three-up) with a 22 pt box on each tile, and **Add 4** (ink) at the foot; Skip makes it empty. Not mocked.

### 4.5 The Saved tab (frame `saved`)

The tab root becomes Instagram's Saved on the Dex's grid:

- The bar: **Saved** (`title`), no icon (unchanged).
- One `small` `muted` line: "Only you can see what you save, until you share a collection."
- Tiles two-up (184 at x 24 and 232, the Dex's columns), 258 pitch: a **cover** (a 2 × 2 mosaic of the first four items' prints with 2 pt `page` gaps when there are four or more; the one print when one to three; `wash` when empty), then the name (`body` 500, one line) and a `small` `muted` line saying what is in it, in words: "9 drinks · 2 posts · Shared".
- Order: **All saved** first; then collections, the one saved to last first; then the **New collection** tile (`wash`, a 32 pt plus, "New collection").
- **All saved** opens what the tab showed until now (drinks two-up, then posts not in your Dex yet, then posts already in it), moved unchanged to `app/saved/all.tsx`.
- Nothing saved at all: today's empty state, no tiles. Signed out, or before 023: today's page exactly (the drinks, no tiles), so nothing is one tap further away for them.
- A cover cell is the post's photo for a post (the signed URL, as `PostGrid` primes it) and the **colour print** for a drink, caught or not: a cover is a picture of the collection, not of your progress. Inside the collection the grid shows caught or not as the Dex does. A drink with no photograph is the no-photo face.

### 4.6 A collection (frames `collection`, `more`)

`app/saved/[id].tsx`, pushed. The bar holds only the back chevron (layout spec rule 8). Then:

- The name as the page title (`title`, x 24, y 122, wrapping), **•••** (24 pt, 44 hit) right-aligned on its first line.
- One `small` `muted` line: "9 drinks · 2 posts · Private" (or "· Shared by link").
- Drinks two-up as the Dex draws them (colour and ink name if caught, proof and muted name if not), newest first; then a `body` 600 "Posts" head and the posts three-up (`PostGridRow`), newest first. Tapping opens the drink or the post.
- Empty: "Nothing here yet" / "Long-press a bookmark to save something straight into Sunday sours." and **Add from All saved**.

**•••** opens a sheet headed by that line, with rows (24 pt glyph, `body`, 56 tall): **Rename** (a one-field sheet, as §4.4, "Save"), **Share** (§4.7; once shared: **Share link** and **Stop sharing**), **Remove items**, **Delete collection**.

- **Remove items**: the grid gets a 22 pt box on every tile and the bar gets **Cancel**; a foot bar shows **Remove 2** (ink; `off` at 0). Removing keeps them in All saved. VoiceOver: a custom action "Remove from Sunday sours" on each tile, without the mode.
- **Delete collection**: an `Alert`, "Delete Sunday sours?" / "Its drinks and posts stay in All saved." with **Delete** (destructive style) and **Cancel**. A shared collection adds "The link stops working." Deleting goes back to Saved.

### 4.7 Sharing (frame `share`)

- **Share** calls `share_collection(id)`, which turns the link on and returns its **share id** (a random uuid, not the collection's id). The meta line says "Shared by link". Then the **iOS share sheet** (`Share.share`) with `message: "My Sunday sours collection on Sipply"` and `url: https://janmcq1617.github.io/drinkdex/c/#<shareId>`.
- **The first time** a person shares anything, one ink line sits above the share sheet for its lifetime: "Anyone with the link sees the name, its drinks and your username. Stop sharing any time in •••." (kept in `dexPrefs`-style local storage as seen).
- **Stop sharing** (•••) calls `unshare_collection(id)`: the link answers nothing from that moment, in the app and on the web. **Sharing again mints a new link**; the old one never works again.
- **A name the content filter catches** (`is_objectionable`, 011) cannot be shared: "Rename it to share it." The collection itself is still fine, because only you see it. **Renaming a shared collection** goes through the same filter (023's `touch_collection` refuses it with `collection_name_objectionable`): the Rename sheet says "That name can't go on a shared link. Stop sharing, or choose another." and keeps the old name.
- **The link**: one https link for everyone, `https://janmcq1617.github.io/drinkdex/c/#<shareId>`. The id is in the **fragment**, so it never reaches GitHub's servers or a referrer. The page offers **Open in Sipply** (`drinkdex://collection/<shareId>`). The app also answers that deep link directly (QR codes, a pasted link). Universal links (the https link opening the app straight away) need an `apple-app-site-association` file at the root of `janmcq1617.github.io`, which this repo does not serve: open question 3.

### 4.8 Someone opens a shared collection

**In the app** (frame `shared`): `app/collection/[share].tsx` calls `get_shared_collection(share)`.

- The page as §4.6, read-only: no •••, no boxes. Under the title: a 24 pt avatar and "**nico.pours** · 9 drinks · 2 posts" (the username opens their profile). Drinks are drawn against the **viewer's** Dex (colour if *they* caught it). Posts are the ones the viewer may see (blocked authors are left out by the function, either way).
- One key at the foot, over a `page` slab with a 1 pt `line` rule: **Save collection** (ink). It calls `copy_shared_collection(share)`, then saves each item into the viewer's All saved through the usual paths (drinks through `useTaste.setSaved`, posts through `savePost`), and becomes **Saved to your collections** (`wash`), which opens the copy. At the drinks cap, the drinks that did not fit are taken back out of the copy (`removeItems`), so "in a collection ⇒ saved" holds: "Saved. 3 drinks didn't fit in All saved (200 is the most), so they were left out." At 50 collections: "You have 50 collections. Delete one to save this one."
- **The owner** opening their own link is sent to `/saved/<id>` (the function says `mine`).
- **Signed out**: the drinks show; the posts line reads "2 posts, sign in to see them"; Save collection opens the sign-in.
- **Off, unknown, or a blocked owner**: one empty state, "This collection isn't shared any more." (a block never says it is a block).

**On the web** (frame `web`): `docs/c/index.html`, a complete page with no Jekyll front matter (as `docs/index.html`), in Daylight tokens (the rest of docs/ still wears the old cream; this page does not).

- Reads the fragment, calls `POST {SUPABASE_URL}/rest/v1/rpc/get_shared_collection` with the **publishable key** (the same public key the app ships), and renders: the Sipply wordmark (Playfair 28), the collection's name (`title`), "A collection by **nico.pours** · 9 drinks · 2 posts", then one row per item, newest first: "Nº 0102" (tabular, `muted`) and the drink's name in Playfair 17, with its style in `small` `muted`, or "From a post" for a post item. **Never a photo, a caption or a post's author.**
- Names and numbers come from **`docs/c/drinks.json`**, `{ id: [dexNumber, name, subcategory] }`, generated from `src/data/drinks.json` by `scripts/build-share-index.mjs` (about 90 KB) and checked in step by the same script's `--check` in CI. A drink the index does not know (a drink someone added) reads "A drink added on Sipply".
- Foot: **Get Sipply** (ink; the App Store page once listed, the TestFlight invite until then, from `docs/testflight.md`) and **Open in Sipply** (`wash`, the deep link). On a phone without the app, Safari answers a `drinkdex://` link with its own "address is invalid" alert, which the page cannot stop; so the key sets `location.href` and, if the page is still visible 1.5 s later (`document.visibilityState`), replaces its own label with "Sipply isn't on this phone yet" beside Get Sipply. Until universal links (open question 3), Get Sipply is the key a friend without the app needs, so it is the ink one. Under them, `small` `muted`: "Sipply is for people of legal drinking age."
- `<meta name="robots" content="noindex">`, `<meta name="referrer" content="no-referrer">`, no analytics, no cookies, no third-party script; fonts as the docs site loads them.
- States: loading (the wordmark and a `muted` "Opening the collection…"); **none** (off, unknown, deleted) "This collection isn't shared any more."; **before 023** (PGRST202) "Shared collections aren't open yet."; network error "Couldn't reach Sipply. Try again." with a Retry key.

### 4.9 Data: migration 023 (draft in `023_collections.sql`)

- `public.collections` (id, owner_id → profiles **on delete cascade**, name 1–40 trimmed, visibility `private | link`, share_id unique nullable, shared_at, created_at, updated_at; `visibility = 'link'` exactly when share_id is set). Owner-only RLS; the client may insert `owner_id, name` and update `name` only (while shared, only to a name the content filter passes). 50 per account by a locking before-insert trigger (`collections_full`).
- `public.collection_items` (collection_id → collections **cascade**, kind `drink | post`, drink_id (catalogue id shape) or post_id → posts **cascade**, created_at by `clock_timestamp()`). Once per collection each (partial unique indexes; the app reads 23505 as "already in"). Owner-only read, insert and delete; a post item only for a post the inserter can see (posts_read). 200 per collection (`collection_full`). An item added bumps the collection's `updated_at`.
- **Link-shared readable by id, and only by id**: the tables have no policy for anyone but the owner, so nothing can be listed. `get_shared_collection(share_id)` (security definer, granted to anon and authenticated) answers one collection for one live share id, with the owner's username, counts and items; post ids only to a signed-in caller not blocked with the post's author; null for a blocked owner. `share_collection` / `unshare_collection` (owner, definer) mint and throw away the share id. `copy_shared_collection` (signed in) makes the private copy.
- **Unsaving cleans up**: after-delete triggers on `saves` and `want_to_try` remove the thing from the owner's collections.
- **Deletion**: account → profiles → collections → items, all cascades; post deletion → its items. A shared link of a deleted account stops answering.
- **Order**: needs 017 and 022 (section 0 stops otherwise); not 018–021. Applied by hand, like every migration. The VERIFY block checks tables, RLS, the seven policies, the three cascades, grants and function privileges, the six triggers, and a rolled-back smoke test as two accounts plus an anon read.

### 4.10 The client, and before 023

`src/lib/collections.ts`, beside `lib/social` and in its style:

- `collectionsSupported()`: false for the runtime once the server answers PGRST205 / 42P01 (table) or PGRST202 (function), exactly as `savesSupported()` does for 017. Re-asked on the next launch, so applying 023 needs no new build.
- `fetchCollections(myId)` (with covers: the first four items' ids per collection, one query with a lateral `limit 4`, or two simple queries), `fetchCollection(id)`, `createCollection(name, firstItem?)`, `renameCollection`, `deleteCollection`, `addItem` / `removeItems`, `membership(kind, itemId)` (which of my collections hold it, for the sheet's boxes), `shareCollection` / `unshareCollection`, `fetchShared(shareId)`, `copyShared(shareId)`.
- A small `store/collections.ts` (not persisted) keeps the list and a `version` the Saved tab and the sheet read, as `useSocial.savesVersion` does.
- **Before 023**: no bar after a save, no long-press sheet, the Saved tab exactly as build 23, the deep link opens "Shared collections aren't open yet." Nothing errors.

### 4.11 Privacy policy, deletion page, App Store (same build; bump **Last updated**)

`docs/privacy.md`, **What Sipply stores about you**, after "Social graph":

> **Collections.** You can group your saved posts and drinks into collections you name. A collection is private: only you can see it, until you share it. Sharing makes a link. Anyone with the link, signed in to Sipply or not, can see the collection's name, your username, and the drinks in it by name and number, in the app or on a web page; for a post in it, they see only which drink it shows, and only people signed in to Sipply can open the post itself, if they are allowed to see it anyway. **Stop sharing** turns the link off at once, and sharing again makes a new link, so the old one never works again. Someone who saved a copy of your shared collection before you stopped sharing keeps their copy. Collections are kept with your account.

**Who else can see it**, after the first paragraph:

> **Anyone you share a collection with** can see what that collection's link shows (above), until you stop sharing it. The web page for a link is served by GitHub Pages, which we use to host this site; the link's code is in the part of the address that browsers never send to it.

**Deleting your account**: add "your collections (any link to one stops working)" to the list. **"Social graph"** sentence: "Saved posts are visible only to you, unless you put one in a collection you share."

`docs/data-deletion.md`, **From our servers**: add "- your collections, and the links to any you shared".

`docs/appstore.md`: **User Content → Other User Content** adds "collections (their names and what is in them, and a share link when you make one)". No new data type, no tracking, no new purpose.

`docs/terms.md`: no change (what you share is already your content under the terms; a collection name passes the same content filter before it can be shared).

---

## 5. Motion, all of it

| What | How |
|---|---|
| Header hide and return | Native-driver `diffClamp` graph from the list's own scroll event (§3.2). No clock |
| Rail | Today's: mounted while moving, cut by a JS timer. Rides the header graph |
| Filter / order / save / ••• sheets | The existing `BottomSheet` |
| A chip turning on | A cut (today's `Chip`), with the selection haptic |
| For you ⇄ By number, a filter, a search | The grid is re-rendered in place, scrolled to its top, no transition |
| Save bar | §4.2: rest-drawn start, 180 ms `withTiming`, JS end state and JS unmount |
| Sheet box ticks | A cut, plus the selection haptic |
| Proof → print on a catch | Today's native crossfade (DexCard), unchanged |

No `entering` / `exiting` / `layout` props anywhere (check-design keeps failing them).

## 6. Accessibility, beyond what each section says

- Contrast: every pair is an existing Daylight pair. Lowest text: `muted` on `wash` 6.13 (the order key's chevron is ink); `onInkMuted` counts on an ink chip 7.85; the save bar is `onInk` on `ink` 19.80. Unticked boxes `control` on `page` 3.45.
- Targets: chips 32 drawn with 6 pt slop each side (44); "See all" 44 tall; boxes inside 64 pt rows; the save bar's key 44.
- Dynamic Type: the header grows and the list's padding follows it (measured); chips grow; at the two largest sizes the section head's "See all" drops under the name; collection tiles go one-up.
- VoiceOver never sees a moving header (pinned), never loses the save bar before it is read (10 s), and gets custom actions for Save to collection and Remove from a collection.

## 7. Build checklist

1. **Fruity** in the reference (replace the file), the port, `store/taste`, `scripts/check-recommend.mjs` (runs E and F, the new path, `tasteTags.json`), the first run's step 7 (seven keys). `node scripts/check-recommend.mjs` passes.
2. `src/data/tasteTags.json` (generated), `src/lib/dexOrder.ts` (port of `tools/dex-order.mjs`: `matcher`, `facetCounts`, `forYou` from stored fronts, the total order), `dexFronts` in `store/taste` (persist v2, migrate computes), `src/store/dexPrefs.ts`.
3. `components/dex/FilterSheet.tsx` → four groups and the foot key; `dexFilter.ts` → the filter object; the quick chip row and order key in the Dex header; the Order sheet.
4. `dex.tsx`: sections, Everything else, flat results in the total order, the number map, the rail's stops, the no-answers line, the header out of the list on `useHideOnScroll` (with the new `pinned` option in `ScrollChrome`).
5. `supabase/migrations/023_collections.sql` (from the draft) and `schema.sql`; `lib/collections.ts`, `store/collections.ts`.
6. The save bar and long-press on every bookmark (post action row, post •••'s Save, the drink page's bookmark, the first picks' Save); the save sheet with its New collection page; the unsave confirm when in collections.
7. Saved: tiles; `app/saved/all.tsx` (today's page moved); `app/saved/[id].tsx` with •••, Rename, Remove items, Delete, Share / Stop sharing; `app/collection/[share].tsx` (the deep link) with Save collection.
8. `docs/c/index.html`, `docs/c/drinks.json`, `scripts/build-share-index.mjs`; the privacy, deletion and App Store edits (§4.11).
9. check-design: no `entering=` / `exiting=` in the new files, no pill radius, no uppercase, no `Animated.timing` in ScrollChrome.

**Acceptance**: persona E's Dex shows the fronts in §2.2, in order; "See all 445" gives 445; the sheet's figures match `node specs/v4.2/tools/dex-order.mjs`; By number is today's Dex; the header hides and returns with the finger in a Release build with Reanimated stalled, and never moves under VoiceOver; a collection made on one phone shows on another; Share gives a link that opens on the web (names only) and in the app; Stop sharing kills it in both, and sharing again gives a new one; deleting the account leaves no collection and no live link; before 023 the build behaves as build 23.

## 8. Open questions for Jan

1. **Twelve per section, or every matching drink?** Recommended: **twelve**, with "See all 445". Whole sections bury the second one 193 rows down.
2. **Show the owner's username on a shared link?** Recommended: **yes**, on both the web page and in the app. A collection from "someone" is less useful to a friend, and the first share says so in one line. No would mean "A collection on Sipply" and nothing else.
3. **The link's address.** It reads `janmcq1617.github.io/drinkdex/c/#…`, your GitHub name, and opens a web page first (with Open in Sipply) because universal links need a file at that domain's root. Recommended: **ship it as is**, and move to a Sipply domain with universal links when the App Store listing is live.
4. **Unsaving something that is in a collection**: take it out of every collection (Instagram), or leave it in them? Recommended: **take it out, after one confirm** ("It is also in Sunday sours and Fruity"), so a collection never holds something that is not saved.

### Decided (Jan, 13 Oct 2026)

1. **Twelve per section**, with "See all".
2. **Show the owner's username** on a shared link, on the web page and in the app.
3. **The link ships as is** (`janmcq1617.github.io/drinkdex/c/#…`, web page first); a Sipply domain with universal links comes with the App Store listing.
4. **Unsave takes it out of every collection, after one confirm.**
5. **Sour gets the same strength cap as Fruity** (the critic's "bare bottles in Sour and citrusy"): above `noteAbvMax` 30 only the family counts toward `sour`, so Cognac VS, Ouzo, Tequila Blanco and the like leave the section and the chip. This changes the first run's counts and runs A to D: the reference (`tools/recommend.mjs`), the port and `scripts/check-recommend.mjs` move together, and every figure this spec quotes (566, 194, the sheet's counts) is re-read from `node specs/v4.2/tools/dex-order.mjs` after the change.
6. **The active tab gets an effect** (Jan, mid-round: "add an affect to know in which tab i am in the bottom"): a short ink line under the active tab's glyph that slides with the pager's own position (native driver, no JS clock), plus the filled glyph. The + is not a tab and is skipped.

