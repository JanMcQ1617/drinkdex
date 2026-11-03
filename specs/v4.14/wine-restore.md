# v4.14: wine back in the Dex

Wine is back for the App Store launch (Jan's decision), all of it but the five sakes and eight atlas wines that are the same thing as a card on the spirit shelf. **2,344 wines, Nº 2331 to Nº 4674.** The Dex goes from 2,327 entries to **4,671: 899 cocktails, 1,428 spirits and 2,344 wines.** Its last number is 4,674 (2240, 2311 and 2318 are still unused from v4.13). No existing card changed its number, name, id or category; one changed its style, Malibu (below).

Beer stays out. The spirit shelf keeps its twelve: the vermouths, the seven sherries and Ruby, Tawny and Vintage Port stay spirit cards. The atlas's other port and sherry appellations are wine cards (Porto Colheita, Porto Late Bottled Vintage, Porto Crusted, Porto Garrafeira, Porto Branco, Porto Rosé, Cape Vintage (Cape Port), Jerez-Xérès-Sherry, Montilla-Moriles), as the atlas styles them; see *What was left out*. Filtered to Spirits, "port" finds three; filtered to Wines, six Porto styles. Whether to move that family to the spirit shelf too is Jan's call (build 40's review raised it); nothing here does.

The list to photograph from: `specs/v4.14/wines-photo-list.csv` (below).

## What came back

**The data.** Every wine is the card it was on 20 Sep, by the same id, with the same words, read from `2a75eec^` (the commit before the removal), with seven exceptions spelled out under *Words that changed*.

| Nº | What | How many | Source |
|---|---|---:|---|
| 2331–2403 | The original wine cards: varietals, classic regions and styles (Nº 250–339 before 20 Sep, in that order) | 73 | `scripts/winedexdata/00-classics.json` (new file) |
| 2404–2468 | The world-wine cards by region (Nº 965–1029 before) | 65 | `scripts/winedexdata/01-…` to `09-…` (restored as they were) |
| 2469–4674 | One card per named wine in the atlas, in atlas order (country, region, name) | 2,206 | `src/data/wineAtlas.json` (tracked again), via `merge-wine-atlas.mjs` |

`00-classics.json` is new as a file, not as data. Those 90 cards were written straight into `drinks.json` when the app began and never had a source, so a re-merge could not have brought them back. It holds them less the twelve that stayed on the spirit shelf (`scripts/spiritdata/99-fortified.json`) and the five sakes.

**The scripts.** `scripts/merge-wines.mjs` (rewritten onto `scripts/lib/dex-merge.mjs` like `merge-world-spirits.mjs`, with its wine-only checks), `scripts/merge-wine-atlas.mjs` (restored; it now counts the spirit-shelf fortified cards as authored and leaves out their eight atlas twins), `scripts/build-wine-atlas-links.mjs` (restored, with `--check`, and covering the ports, sherries and vermouths as it did before). `scripts/build-wine-atlas.mjs` gained `--check` (the atlas is tracked again); its output, `docs/wine/` included, is byte for byte what it was. `scripts/check-wine-atlas-names.mjs` did not come back: it is a helper for naming new wine cards, takes names on the command line and exits 2 without them, so it would fail the "every `check-*.mjs`" gate. `git show 2a75eec^:scripts/check-wine-atlas-names.mjs` brings it back when a new wine card is being named.

**The type system.** `DrinkCategory` is `'cocktail' | 'spirit' | 'wine'`; the atlas types are back in `src/types.ts`. A new `CustomCategory` keeps a drink someone adds to cocktail or spirit (see *Not done*).

**The look.** `CATEGORY_META.wine` ("Wine", "Wines", in ink and wash like the other two). The no-photo face draws a wine glass for a wine with no glass named. The pour colours read the style again (`WINE_NAME_RULES`, `WINE_BY_SUBCATEGORY` in `components/artwork/liquid.ts`); the spirit shelf's fortified rules are untouched and still consulted first for those twelve, and the wine branch reads the same name rules first, so a tawny is amber on either shelf. Two rules are new: the red fortified wines (Late Bottled Vintage, Crusted, Banyuls, Maury, Mavrodaphne, Cape Vintage) pour deep red instead of amber, and Lambrusco, Brachetto and sparkling Shiraz pour red instead of straw. `check-artwork` maps every wine style and flags nothing. The rosé rule now ends at the word, so Rosette (a sweet white from Bergerac) no longer pours pink. Still wrong, and left: the atlas's 18 sweet reds pour the dessert amber, its three sparkling reds that are not Lambrusco (Modena, Vernaccia di Serrapetrona, Tsimlyansk) and Bugey-Cerdon pour straw, and Bohotin's two sweet rosés amber, because the card keeps the atlas's style only as Dessert or Sparkling. Nothing in build 40 draws a pour: the Dex's no-photo face is the glass outline, and DrinkArt is only in Reels, which is off. The fix, if Reels comes back, is to carry the atlas style into the card.

**The screens.** The Wine Atlas (`src/app/wine-atlas/index.tsx`) is back: every named wine by country or A–Z, and the 465 grapes behind them, with search and style chips (the atlas lists 469; four make no named wine and are left out of the list and the count, so no grape row opens an empty list and the count is the Dex's Grape filter's). Rebuilt in Daylight's kit (the old one inked rows merlot, gilt and rose and filled its keys in wine); a row now says its style in words. One thing is new: a wine row opens its Dex card, since every atlas wine is one. The drink page's **On the map** section is back (`OnTheMap` in `components/DrinkPanels.tsx`, the old `AtlasPanel`): "1 matching appellation in the atlas, across 1 country." for Barolo, or for a grape card "Syrah makes 230 named wines in the atlas, across 29 countries." with its other names under it, and a row that opens the atlas there. The ports, sherries and vermouths on the spirit shelf have it too, as they did before.

**The Dex.** A Wines chip under Kind in the filter sheet, and among the quick chips for someone with no taste answers (Cocktails, Spirits, Wines, Not yet). The kind counts, the caught counts and the bar's "wines in your Dex" all include it. Search finds a wine by its grapes as well as its name, style and place ("nebbiolo" finds Barolo), and `ł` folds to `l` (Małopolski Przełom Wisły). The log sheet, the reel's drink tag and add-a-drink's "Already in the Dex?" (`lib/drinkSearch`) fold the same letters (ł, đ, ß, ı, ø, æ, œ), so "dakovo", "bergstrasse" and "diyarbakir" find their wines there too.

**For you and the recommender.** A wine is never scored and holds no taste chip. The first run asks about cocktails and spirits, so no answer ever chose wine, and an atlas card's notes are its style's: every atlas red says "red fruit", which would have put 1,231 reds under Fruity and every white under Sour and citrusy. So wines are never an onboarding pick, never in a For you front, sit in Everything else by number, and are reached by the Wines chip and search. The reference (`specs/v4.2/tools/recommend.mjs`, copied byte for byte to `specs/v4-onboarding/tools/`), its Dex half (`dex-order.mjs`, a third kind in the facet counts) and the port (`src/lib/recommendCore.ts`, `src/lib/dexOrder.ts`) changed in step. `check-recommend` passes: no pick moved in any run; E's matchingCount is 185 (was 184) because of Malibu, recorded in its `RUNS` note; `classics.json` and `tasteTags.json` were rewritten by its `--write`.

**Stats, collections, posting, sharing.** Dex progress gains a Wines row with its bar. Posting, collections, places and tournaments read drinks by id and needed nothing. `docs/c/drinks.json` (the shared-collection web page's index) is regenerated: 4,671 drinks.

**Photos.** 71 wines have their photographs back. The 88 wine masters in `~/Desktop/CLINK DEX PHOTOS` had been inert since 20 Sep; a rebuild (`node scripts/build-drink-photos.mjs`) baked the 71 whose ids are wines again (the other 17: the twelve spirit-shelf cards, already shipped, and the five sakes). Every one of the 901 photos already shipped came out byte for byte the same, so the set grew by 142 files (71 prints, 71 proofs) and changed none. All gates passed; 2 of the 71 (Trockenbeerenauslese, Sémillon) carry the review-only wall-tint flag, as 45 other photos already do. The 71 are the masters as they were shot for the old Dex, so some labels carry real estate names (Château La Tour Blanche on Sauternes, Schloss Johannisberg on Trockenbeerenauslese); worth a look before submission. Franciacorta and Prosecco never had masters. `node scripts/build-dex-index.mjs --missing` prints the naming sheet with the wines in it again (it listed only cocktails and spirits, and its guard threw once wine was back).

**Fonts.** The wine names bring 19 letters the catalogue had not used (Î, Ó, Ü, ë, ï, õ, ÿ, ć, đ, ě, ł, ő, Ş, ű, ž, Ș, ț, ạ, ậ); all are inside the Latin subset, so the font files are unchanged and only `src/lib/faceAdvances.ts` was regenerated (`python3 scripts/build-fonts.py`, as v4.13 did for "°"). `specs/v4.10/type/tools/fit.mjs` passes for all 4,671 names at 22 and 60: none under, least margin 1.95% ("Aÿ" at 22).

**Copy in the app.** The welcome screen's line and the invite message now say "a field guide to cocktails, spirits and wine" (302 pt at body size, one line on every iPhone width).

## Numbering

New numbers after the highest (2330), in one run with no gap: the classics in their old order, then the regional cards, then the atlas cards in atlas order, which is what running the merges in that order makes (`merge-wines.mjs`, then `merge-wine-atlas.mjs`). The old numbers could not come back: the 20 Sep removal renumbered the Dex contiguously, and 250–339 and 965–1029 now belong to cocktails and spirits.

Proof, against `HEAD` (856b1bf): all 2,327 cards present with the same id, number, name, category and style, bar Malibu's style. 29 others changed one field, their generated "One of N … bottlings catalogued here" fun fact, recounted when Malibu moved (Spiced Rum 13 → 12, Flavored Rum 22 → 23). `node specs/v4.14/wine-restore.test.mjs` checks the numbers, the ids against `2a75eec^`, the sources, the links, the recommender gate, the colours and Malibu.

## Ids and the phones that logged a wine

Nothing to migrate. `store/collection`'s `settle()` keeps any record whose drink has left the catalogue in `retired`, on every launch, and moves it back to `unlocks` the moment its id exists again. Every restored wine has its pre-removal id, so a wine logged before 20 Sep is back in that person's Dex, counted, on the first launch of the build that has it. A post of a wine (`drink_id`) shows its drink again the same way, and a shared collection's wine shows its number and name once `docs/c/drinks.json` is pushed.

Not re-linked: anything logged as one of the five sakes or the eight atlas twins (Porto Ruby, Porto Tawny, Porto Vintage, Fino, Manzanilla de Sanlúcar, Amontillado, Oloroso, Palo Cortado). Those records stay in `retired`, not lost; they would re-link if those cards ever came back. Pointing the twins at their spirit cards (Porto Ruby's record onto Ruby Port) would need an alias step in `settle()`; not done, because it moves a person's record onto a different card.

## What was left out, and why

- **Beer**, all of it (as asked).
- **The five sakes** (Daiginjo, Ginjo, Honjozo, Junmai, Nigori). Not plainly wine: sake is brewed from rice, the old data filed it under wine with its "Grapes" relabelled "Rice", and the atlas, a list of grape wines, never had it. Default kept: out.
- **Eight atlas wines that are a spirit-shelf card under the atlas's name** (listed above). Before 20 Sep the Dex had both, the same wine twice; restored, it would be the same wine as a spirit and as a wine, which the Kind filter makes impossible to miss. `merge-wine-atlas.mjs` leaves them out only while the spirit card exists.
- **The 78 regional fortified wines: 70 came back.** They are plainly wines in the wine source (the atlas styles them Fortified, the cards read Grapes, Region, Vinification), so they are wine cards again: Commandaria, Madeira, Marsala and Rutherglen among the authored ones, and Madeira Bual, Banyuls, Rutherglen Muscat, Porto Colheita, Porto Late Bottled Vintage, Jerez-Xérès-Sherry, Montilla-Moriles and the rest of the atlas. The other eight are the twins above.

## Words that changed on the way back

- **App Review 1.4.3.** Six classics had a line that nudged toward more, now reworded in `00-classics.json`: Gamay was "dangerously gulpable" and "built for gulping … so pour generously"; Zinfandel "pour generously"; Cabernet Sauvignon "a generous five-ounce pour"; Lambrusco "a generous measure"; Montepulciano d'Abruzzo "Pour full glasses"; Vinho Verde "keep it cold and keep it coming". And the generated Rosé serve line (41 atlas rosés) said a bottle kept for an occasion "is usually a bottle wasted"; it now says rosé fades with keeping. The test fails if any of those words come back.
- **Four more cards for 1.4.3, found in build 40's review**: Montepulciano d'Abruzzo's description said its price "encourages a second bottle" and its serve line "keep a bottle within arm's reach of dinner"; Grüner Veltliner "pour freely"; Txakoli "drink it fast"; Cava's price made it "guilt-free for weeknight tapas". Now "a fair price for the quality", "from a slow ragù to grilled sausages", no "pour freely", "so each pour is still cold and spritzy when you taste it" (and "a light match for pintxos" for "made for grazing through snacks"), and "a natural partner for weeknight tapas". The test's list of banned words has all five. Moscato d'Asti's fun fact (winemakers "drank it with lunch so they could keep working") was read and kept: it is history about its low strength, not a suggestion to drink.
- **The atlas descriptions' first words** (`merge-wine-atlas.mjs`): "A" went before every tier, so 751 cards opened "A AOC red wine", "A AVA white wine" or "A Einzellage…". The article now follows the word after it ("An AOC red wine from Burgundy (Côte de Nuits), France."). The 37 nationwide names no longer come "from National, France", and Vin de France is "A VDF wine of any colour from France." rather than a "various wine". 783 descriptions changed, nothing else in them; the test allows exactly that rewrite. The composition summary and process lines of those 37 still say "National" (left as they were).
- **Four names lost a qualifier** that only a beer of the same name had made necessary: Brand (Alsace), Faro (Sicily), Montecarlo (Tuscany) and El Dorado (California (Sierra Foothills)) are now Brand, Faro, Montecarlo and El Dorado. Same ids.

## Malibu

Nº 1488 Malibu was filed as Spiced Rum; it is a 21% coconut rum. It is now **Flavored Rum** (Nº 2094, the style v4.13 made for the flavoured rums), through its row in `scripts/spiritbranddata/07-rum-cane.json` and `merge-spirit-brands.mjs`, so a re-merge keeps it. Its name, number, id and origin story are unchanged; it takes Flavored Rum's words: "Flavored Rum from Barbados.", 21–35% (its Strength line says under 30% it is a rum liqueur in the US), tropical fruit, citrus, cane sugar, light vanilla. Flavored Rum rather than Coconut Rum Liqueur (Nº 934, which describes Malibu almost by name): its seven flavours were kept under Flavored Rum in the v4.13 review, so the family now sits under one style.

## Not done, and why

- **A drink someone adds cannot be a wine.** `drink_submissions.category` is checked to cocktail or spirit (migration 018) and `scripts/import-submissions.mjs` files suggestions under those two folders. It takes a migration and an import change; the form offers no Wine until then, and a Dex filtered to Wines opens it as it opens unfiltered.
- **The first run asks nothing about wine**, so For you has no wine section. Adding wine to the onboarding questions is its own piece of work.
- **The rank ladder is a share of the whole Dex** (`lib/milestones`: 10%, 25%, 50%…). With 4,671 entries a person's title can step down: 233 logged was Cataloguer (10% of 2,327) and is now Note taker (5%). Nothing is re-celebrated (`bestRung` is kept), but the title on Dex progress reads lower. Jan's call whether the ladder should count wine.
- **Not run on a phone.** The atlas screen and On the map were checked by `tsc`, lint, `check-design` and the export, not on a device (no simulator builds here).

## Docs and App Store copy that now need updating (Jan; `docs/` untouched but `docs/c/drinks.json`)

- **App Store Connect**: the subtitle and description say 2,089 drinks, 899 cocktails and 1,190 spirits (already stale since v4.13's 2,327). Now 4,671: 899 cocktails, 1,428 spirits and 2,344 wines, and "a field guide to cocktails and spirits" wants wine in it.
- `docs/appstore.md`: lines 54, 112 and 130 (the counts), 275 (photo coverage: 972 of 4,671 now, 71 of them wines) and 786 ("sells 2,089 entries").
- `docs/index.html`: lines 29, 43, 47, 421, 449 and the counts list at 457–458 (add a wines line).
- `docs/testflight.md`: lines 59 and 118.
- `specs/v4.9/appstore-shots/captions.json` ("A field guide to cocktails and spirits") and its README, line 159; any screenshot showing the Dex's "/ 2,327".
- Build 40's What to Test and review notes: written, `specs/v4.14/wtt-40.txt` and `specs/v4.14/review-notes-40.txt`.
- **Push `docs/c/drinks.json` with the release**, or a wine in a shared collection shows on the web as "A drink added on Sipply".

## To rebuild

```
node scripts/build-wine-atlas.mjs          # only after a scripts/winedata edit; also writes docs/wine/
node scripts/merge-wines.mjs
node scripts/merge-wine-atlas.mjs
node scripts/build-wine-atlas-links.mjs
node scripts/check-recommend.mjs --write
node scripts/build-share-index.mjs
python3 scripts/build-fonts.py
node scripts/build-drink-photos.mjs        # when a wine master is added
```

## The photo list

`specs/v4.14/wines-photo-list.csv`: the 2,273 wines with no photograph, one row each (number, name, producer/grape, style, country), most likely to be looked for first. No wine card names a producer, so the third column is the card's grapes. The order: a hand-ranked list of the best-known names first (Prosecco, Napa Valley, Marlborough, Mendoza, Barossa Valley, Sonoma Coast, Willamette Valley, Franciacorta, Mosel…; Prosecco and Franciacorta are the two classics with no master); then the rest of the 65 regional cards, the big wine countries first; then the 2,206 atlas cards by a score: the country's place in the wine trade, a list of about 200 appellations people ask for by name (the Bordeaux communes, the Burgundy villages, Beaujolais crus, Côtes du Rhône, Chianti Classico, Barbaresco, Ribera del Duero, Douro, Sonoma and the rest), whether the grapes are the big ones, and red, white or sparkling before the rest. A judgement, written to be cut, not a ranking anyone measured.
