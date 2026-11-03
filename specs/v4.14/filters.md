# v4.14: the Dex's filters

Jan: "optimize it so people can choose better and facilitate their choosing process."

The filter sheet now asks in the order people decide: what kind of drink, what it tastes like, how strong, then the details. Every option shows how many drinks it would show, and an option that would show nothing is dimmed with its 0 and can't be tapped, so no tap leads to an empty Dex. Wine is designed in: colour and style, grape, country and region. On the Dex, the quick chips are those first choices in a fixed order, and a row under them shows what is on, with a × on each and one Clear all.

Nothing was run on a phone (there is no simulator here). The sheet, the See all page and the two chip rows are checked by the type, lint, design and export gates and by `specs/v4.14/filters.test.mjs`, not by eye.

## The sheet

**First choices**, short groups at the top:

- **Type**: Cocktails, Spirits, Wines. One or none, as before ("Kind" until now).
- **Flavour**: the first run's seven, word for word (tasteTags.json's chips, unchanged).
- **Strength**: Light, Medium, Strong, by ABV, with one line under the head: "Light is under 15% ABV, strong 30% and over."
- **Your bar**: I can make it. Only while My Bar is on and has a bottle (see below).

A 1pt rule, then **the details**: Spirit (the seven, unchanged), Style, Grape, Country, Region, and In your Dex (Logged, Not yet) last.

**A group shows only when the chosen type has something in it.** Grape and Region are wine only; Flavour and Spirit have nothing for wine (a wine holds no taste chip, per wine-restore). Style, Grape and Region wait until a type is chosen, so the sheet first opens with six short groups:

| Type chosen | Groups |
|---|---|
| none | Type, Flavour, Strength, Spirit, Country, In your Dex |
| Cocktails | Type, Flavour, Strength, (Your bar), Spirit, Style, Country, In your Dex |
| Spirits | Type, Flavour, Strength, Spirit, Style, Country, In your Dex |
| Wines | Type, Strength, Style, Grape, Country, Region, In your Dex |

**Long groups show their six most common options, then "See all".** These are countries, grapes, regions, and a cocktail's or spirit's styles. The six are the type's six most common, worked out from the catalogue alone, so they never move while other choices change. Anything turned on beyond the six shows after them. "See all 151 ›" (Archivo small 500 with a 16pt chevron, like SectionHead's) turns the sheet into that group's page: a back key, the group's name, Clear for that group, a search field, and every option A to Z as a 52pt row with its count and a check. A region's row shows its country, and a search for "italy" finds its regions. The page is a FlatList, so 465 grapes cost what twenty do.

| Group | Options | First six (under the type) |
|---|---:|---|
| Style: cocktails | 19 | Sour 174, Spirit-forward 164, Highball 104, Hot 56, Creamy & dessert 51, Shot 47 |
| Style: spirits | 28 | Rum 184, Scotch 143, Liqueur 135, American whiskey 108, Vodka 98, Gin 95 |
| Style: wine | 7, all shown | Red 1,251, White 753, Rosé 45, Orange 3, Sparkling 108, Dessert 114, Fortified 70 |
| Grape | 465 | Cabernet Sauvignon 277, Pinot Noir 234, Syrah 232, Chardonnay 201, Riesling 172, Merlot 136 |
| Country (wine) | 93 of 151 | France 478, Italy 433, USA 250, Spain 118, Australia 104, Germany 83 |
| Country (all) | 151 | USA 790, France 641, Italy 528, England 179, Spain 165, Scotland 159 |
| Region | 419 | California 129, Burgundy 88, Piedmont 64, Alsace 59, Loire 59, Rhône 56 |

The foot key is unchanged: "Show 214 drinks", the live total, closing the sheet. At 0 it is the disabled "No drinks match".

## Every option says what it would show

**What an option's count means.** It is how many drinks the grid would hold with that option as its group's only choice and every other group left as it is. That is v4.2's meaning, now for all ten groups. OR inside a group, AND across groups.

**A dimmed option can't be tapped.** An option at 0 is dimmed (the Chip's own 0.42), shows its 0, and is disabled. One that is on can always be turned off, even at 0. The same goes for See all rows and quick chips.

**Switching type drops what doesn't fit the new type.** Choosing a type drops the choices it has no drinks for: Sour and citrusy when you tap Wines, a cocktail's Sour style when you tap Spirits, Red and Nebbiolo when you turn Wines off (their groups go with it). Each Type count is worked out that way, so with Sour and citrusy on, Wines reads 2,344 and a tap on it shows 2,344, never "No drinks match". Strength, Country and In your Dex carry across whole, so a choice in them can be on with nothing under the new type (Strong under Wines, Moldova under Cocktails). It stays in its group and on its See all page, on, with its 0, and a tap turns it off; it had dropped out of both, leaving only its token to untick (build 40's review).

**Turning one choice off can't empty the grid either.** In a group with several choices on, removing one can leave only choices that hold nothing. For example: Sour and citrusy, Rum, and Trinidad and Tobago, with Czechia and Australia also on and holding no sour rum drink. When every choice left in that group shows 0, they are removed too and the group turns off, so the grid gets wider instead of going empty (`toggleDex`). This applies in the sheet, on its pages and to the × on the row of what is on.

The test taps its way through the sheet and its See all pages for 600 steps, and through 9,000 more under six other seeds while it was being written. It never reached an empty grid. Every tap on an option showed exactly that option's count, or more when it joined a choice already on in its group.

## The rows on the Dex

**Quick chips** (`quickPicks`), after the order key, always in this fixed order:

- Cocktails · Spirits · Wines
- the person's flavours in answer order, or Sweet · Sour and citrusy · Fruity · Bitter for someone who hasn't answered
- up to two of their spirits
- Light
- I can make it (with a bar)
- Not yet

Turning a chip on no longer moves it to the front (v4.2 did that), so nothing moves under a finger. While anything is on or typed, a quick chip that would show nothing is dimmed and inert, as in the sheet. The row shows no counts, but VoiceOver reads them.

**Light is the only strength offered there.** It is the lighter choice. Medium and Strong are in the sheet.

**What is on.** While any filter is on, a second row under the quick chips shows each choice in sheet order as a token with × ("Wines, Red, Nebbiolo, Italy, Not yet"), after one "Clear all" (ink, underlined, first in the row so it is always in reach). Choices from the sheet that have no quick chip show up here, so a filtered grid always says why it is short. The row sits after the search field, never wraps it, so it can't change the field's native shape (the build 35 lesson).

**The filter survives leaving the tab, as before.** It is still screen state, and the pager keeps the page mounted. Dex progress's "See your 38" note works as before.

## Strength (App Review 1.4.3)

Strength is read from the middle of the card's own ABV range ("8–10%" counts as 9). Under 15% is Light, 15 to 30% is Medium, 30% and over is Strong.

| | Cocktails | Spirits | Wines | All |
|---|---:|---:|---:|---:|
| Light | 326 | 8 | 2,269 | 2,603 |
| Medium | 520 | 211 | 74 | 805 |
| Strong | 53 | 1,209 | 0 | 1,262 |

Vin de France ("Varies by producer") has no band.

**The words only describe what is in the glass.** Spoken, each chip says its band ("Light, under 15% alcohol, 2,603 drinks"). The test fails if any word the filters add matches drunk, buzz, binge, "another round", "keep it coming" and the like, and it keeps Light as the only strength among the quick chips.

## Wine

- **Style**: the colour or the method, from the card's stored style. "Regional Red" and "Red Varietal" are one Red, and "Skin-Contact" is Orange, the wine list's word. They are shown in this fixed order: Red, White, Rosé, Orange, Sparkling, Dessert, Fortified.
- **Grape**: from the atlas. A card's grapes are its linked appellations' grapes plus the variety a grape card is, with the atlas's synonyms already merged (Shiraz is Syrah). 2,334 of the 2,344 wines hold a grape; ten atlas cards record none. Barolo is under Nebbiolo.
- **Region**: the part of the card's origin just before its country, without brackets ("Burgundy (Côte de Nuits)" becomes Burgundy, "Sauternes, Bordeaux" becomes Bordeaux). "Loire Valley" is read as the Loire. "National" (Germany's nationwide names) isn't a region. Each region carries its country, so the same name in two countries stays two regions. Since build 40's review: a wine card named for a region the catalogue writes in its country is in that region (the Marlborough card says "South Island", the Pfalz card "Rhineland-Palatinate", and each was missing from its own region); four written names are read as the atlas's (`REGION_ALIAS`: Niederösterreich is Lower Austria, Alto Adige is Trentino-Alto Adige, Northern and Southern Rhône are the Rhône); and a region that is its whole country (Malta, San Marino, Wales) is none. 419 regions.

## Country (every type)

**Country comes from the card's own origin, never the atlas.** A grape card is grown in twenty countries, but the card is from where it says it is. 233 of the 241 endings the catalogue writes are a country already. For the rest:

- "Switzerland and France" counts as both.
- "Northern Italy" counts as Italy.
- A short list (`PLACE_OF`) reads regions written where the country goes ("Sicily, Lombardy" become Italy, "Korea" becomes South Korea).
- The few endings that are not one country (Caribbean, Worldwide, Scandinavia) count as no country rather than as a made-up one.
- "Southeast England, United Kingdom" and "Wales, United Kingdom" (the atlas's English and Welsh wines) count as England and Wales, the countries the rest of the catalogue writes, so English Sparkling Wine and Kent are one England (`countriesOfOrigin`, build 40's review). English Bacchus ("National, United Kingdom") names no nation and stays United Kingdom, with the three cocktails and five spirits written that way (Gimlet among them).

29 drinks have no country. The test fails if a later merge brings in a country with "and" or a compass word in it, so the list gets a line when that happens.

## I can make it

**A bar that makes nothing yet is no bar.** One bottle of Campari makes no cocktail; the chip used to be offered then, undimmed at rest, and one tap emptied the grid. Now neither the chip nor Your bar is drawn until the bar makes something, and a choice left on from a fuller bar stops applying (as it does when the bar is emptied). It applies again, shown on its chip and in the row of what is on, once the bar makes something.

**It is built but not visible in this build.** It works from `lib/bar`'s `matchOwned`, so it counts only cocktails, and only appears while `EXPO_PUBLIC_MY_BAR=on` and the bar has a bottle. My Bar is off (`.env` says `off`; Jan, 13 Oct: no layout he likes yet), and offering a chip whose shelf nobody can edit would be a dead end. When My Bar comes back, the chip appears in the sheet (Your bar) and in the quick row with no other change. The test runs it with a bar of its own.

## Speed

**Every drink is turned into a small record once** (`components/dex/dexFacets`): its type, two bit masks, a strength band, a style, and its grapes, countries and region as indexes into option tables. In Node that takes about 21 ms for 4,671 drinks. It happens on first use and also in the first idle moment after the Dex draws (`requestIdleCallback`, as store/taste does), so the first tap doesn't wait for it. At rest nothing builds it: the quick chips need no counts then.

**Each count is a single pass over the catalogue.** Each drink is tested against each group that is on. A drink that passes all of them counts towards every option it holds, one that fails exactly one counts towards that group's options only, and one that fails two counts nowhere. No option ever gets a pass of its own, so 465 grapes cost what seven flavours did. In Node a count takes 0.35 ms on average over the walk. The counts are memoised on the filter, the search, the logged counts and the bar, and the bar's count and the sheet's share one pass when nothing is typed.

## VoiceOver

- Each group is a list headed by its name.
- Each chip and See all row is a button whose label says its count ("Fruity, 235 drinks"; "Piedmont, Italy, 64 drinks"). VoiceOver adds selected when it's on and dimmed at 0.
- "See all" says what it lists ("See all 151 countries").
- A token says "Remove Italy", and Clear all says "Clear all filters". Under Spirits, Style and Spirit both have Rum, Gin and Vodka, which are not the same choice, so a style with a spirit's word says so in the row, the empty grid's line and VoiceOver: "Rum style", "Remove Rum style".
- The page's back key says "Back to filters".
- The foot key reads the count.
- The sliders key's hint names the new groups.

## Code

- `src/components/dex/dexFacets.ts` (new): the facets, pure, with no runtime imports. It holds each drink's record, the option tables, matching, the one-pass counts, Type's switch-and-drop (`withKind`), and the order options are offered in.
- `src/components/dex/dexFilter.ts`: the filter is now lib/dexOrder's `ChipFilter` plus strength, make, styles, grapes, countries and regions. This file connects the facets to the catalogue (built lazily), and holds the words, the quick picks, the sheet's groups and See all lists, `toggleDex` with its never-empty rule, and the note from Dex progress.
- `src/components/dex/FilterSheet.tsx`: the groups and the See all page.
- `src/components/dex/QuickChips.tsx`: the quick chips, and `ActiveFilters`, the row of what is on.
- `src/components/dex/dexRows.ts`: `dexGrid` takes the filters' test (`matches`) instead of building it.
- `src/app/(tabs)/dex.tsx`: the new filter state, the bar's counts and the live counts, the idle warm-up, and the row of what is on in the header.
- `src/lib/dexOrder.ts`: the old chip helpers the app no longer reads are gone (`Chip`, `chipWord`, `chipOn`, `toggleChip`, `chipsOn`, `quickChips`, `matcher`, `filterIsOn`). `facetCounts` stays as the four groups' definition, checked against the v4.2 reference by check-recommend, and the new test holds dexFacets to it: same figures for Flavour, Spirit, Type and In your Dex, except Wines while a flavour or spirit is on, which now counts what a tap on it shows.
- `specs/v4.14/filters.test.mjs` (new). It runs the app's own files, transpiled, on the real catalogue:
  - every count checked against the grid counted the slow way (5,625 options under five filters, plus samples along the walk)
  - "Show N" equal to the grid dexRows draws, with and without a search
  - the tap walk
  - agreement with lib/dexOrder
  - the data (strength bands, wine styles, countries, grapes, regions)
  - the groups each type shows, the quick picks, the note
  - the spoken labels, and the 1.4.3 words
  - speed

## Left out, and why

- **Smoky and Herbal.** Taste is the seven tasteTags chips, the first run's words. A smoky or herbal chip would need a definition written into the scorer and the first run (the four places Fruity took in v4.2), not a tasting-note match made up here.
- **Glass.** The drink page already shows it, and a group for it would be one more on the sheet that few people would choose by.
- **Drinks someone added** have only a type and a Logged state. Any other group that is on hides them, as a flavour chip always did.
- **"Tiki" (47) and "Tiki & Tropical" (19)** are two cocktail styles in the data, and the sheet lists both. Merging them is a data change for the cocktail source, not a filter rule.

## Gates (all exit 0)

- `npx tsc --noEmit`, `npx expo lint`: clean.
- Every `scripts/check-*.mjs`: artwork, contrast, design, ideas, intro-dock, phone, push, recommend.
- Every build script with `--check`: share-index, drink-photos, ground, icons, wine-atlas, wine-atlas-links, `build-fonts.py`, `build-numerals.py`.
- Tests: tournaments, email-focus, join-codes, wine-restore, find-friends and the new `specs/v4.14/filters.test.mjs`.
- `npx expo export -p ios --clear` to a temp dir: 12 MB bundle, temp dir deleted.
- `drinks.json` untouched. All 2,327 HEAD cards keep their id, number and name, and no number is shared.

## For Jan

- **Look at the sheet on a phone**: the See all page with the keyboard up (the rows scroll clear of it via `automaticallyAdjustKeyboardInsets`), and the header with the row of what is on at the largest text size.
- **Tiki and Tiki & Tropical**: merge them in the cocktail data?
- **I can make it** turns on with My Bar. Nothing else is needed.
