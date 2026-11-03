# v4.13: new spirits in the Dex

238 new cards, Nº 2090 to Nº 2330: 229 bottles of brands, most of them versions of brands the Dex already had (flavours, ages, finishes, sugar-free bottlings), and 9 new style cards for the bottles no existing style described honestly. The Dex goes from 2,089 to 2,327. Nº 2240, 2311 and 2318 are unused: those cards came out after the image run had started (see **Changed after review**), and every number after them was kept rather than moved, so the Dex's last number is 2,330 with 2,327 entries. No existing card changed its number or its name.

Same list, one row per card in Dex order, for the image run: `specs/v4.13/new-spirits.csv` (number, name, brand, style, country, abv).

## Changed after review (3 Nov)

For the image run, only the first line changes a picture:

- **Nº 2318 is now Nº 2330, Aguardiente Antioqueño 24° Sin Azúcar** (was "Aguardiente Antioqueño Verde Sin Azúcar"). The FLA's own portfolio names it "Aguardiente Antioqueño 24º Sin Azúcar"; "verde" is only what people call the green cap. Generate it with the 24° label wording. The new name gives it a new id, so it takes the next number.
- **Removed: Nº 2240 Brugal Leyenda.** Brugal's own FAQ says it is sold only in the Dominican Republic, and as 80% aged rum and 20% Oloroso sherry it is legally a spirit drink, which the Dominican Rum card does not describe.
- **Removed: Nº 2311 Baileys Strawberries & Cream.** A limited spring edition (Walmart, Target and Tesco all list it so), and seasonal bottlings were left out everywhere else, as Crown Royal's were.
- **Restyled, same name and number:** Nº 2147 Fireball Blazin' Apple is Flavored Canadian Whisky from Canada (Fireball is Canadian whisky, sold as "Product of Canada"), not Flavored Whiskey from the USA; Nº 2236 Ron Barceló Cream is Cream Liqueur (Rum Cream is a Jamaican-rum card); Nº 2252 Don Q Coco is Flavored Rum (Coconut Rum Liqueur's composition says Barbadian rum).
- **One existing card corrected:** Nº 1279 Fireball now says Canada, not USA, with its style unchanged (Flavored Canadian Whisky's tasting notes are apple, not cinnamon).
- **Nº 2176 Grey Goose Altius stays**, with a note that it launched for bars, nightclubs and restaurants, which set its price. It is on greygoose.com's product list and some shops sell it, so it is not a travel-retail bottling.
- **Kept after checking:** Jameson Caskmates Stout Edition (current in Ireland, the UK and Australia; only US shoppers report it gone) and the seven 21% Malibu flavours, which stay under Flavored Rum: that card's range is 21–35% and its Strength line says a bottle under 30% is a rum liqueur in the US.

## How they were made

- Rows are in `scripts/spiritbranddata/*.json`, beside their brand; the style cards are in `scripts/spiritdata/` (12, 14, 15, 16 and 17). `drinks.json` was regenerated with `merge-world-spirits.mjs`, then `merge-spirit-brands.mjs`; the three cards above came out with `remove-drinks.mjs --keep-numbers` (new), which removes without renumbering.
- A brand card takes its serve, tasting notes and composition from its style, as before. **ABV** below is the bottle's own, from the source; the card shows the style's range unless the bottle is sold outside it, in which case the row now carries its own `abv` (new in `merge-spirit-brands.mjs`) and the card shows that. 19 rows do.
- 9 rows carry their own `rarity` (also new), because the rarity rule matches bare substrings: "1800" read as an 18-year-old, "151" and "1885" as a 15, and "Extra Añejo" on a Colombian rum as a tequila cue. Rarity is not shown; it weights onboarding's picks.
- Seasonal, limited, travel-retail and discontinued bottlings were left out, as were ready-to-drink cans.

## Before build 39 ships (Jan, outside this run)

- **docs/c/drinks.json**, the index the shared-collection web page reads. Run `node scripts/build-share-index.mjs` (it rewrites only that file) and push it with the release. Until then `build-share-index.mjs --check` fails, and on the web any of these 238 cards saved to a shared collection shows as "A drink added on Sipply", with no number or style.
- **The Dex total in the store copy.** The App Store subtitle and description (and docs/appstore.md, docs/index.html and docs/testflight.md) say 2,089 drinks and 1,190 spirits; it is now 2,327, with 899 cocktails and 1,428 spirits.

## New style cards

| Nº | Style | Family | Origin | ABV | Bottles using it | File |
|---:|---|---|---|---|---:|---|
| 2090 | Cream Liqueur | Liqueur | Worldwide | 15–17% | 3 | spiritdata/12-liqueurs.json |
| 2091 | Flavored Canadian Whisky | World Whisky | Canada | 33–35% | 4 | spiritdata/14-whisky.json |
| 2092 | Flavored Irish Whiskey | Irish Whiskey | Ireland | 30–35% | 1 | spiritdata/14-whisky.json |
| 2093 | Flavored Scotch Whisky | Scotch | Scotland | 35% | 2 | spiritdata/14-whisky.json |
| 2094 | Flavored Rum | Rum | Caribbean | 21–35% | 22 | spiritdata/15-rum-agave.json |
| 2095 | Flavored Tequila | Agave | Jalisco, Mexico | 30–40% | 3 | spiritdata/15-rum-agave.json |
| 2096 | Flavored Vodka | Vodka | Worldwide | 30–40% | 40 | spiritdata/16-gin-vodka.json |
| 2097 | Pepper Vodka | Vodka | Russia and Sweden | 35–40% | 2 | spiritdata/16-gin-vodka.json |
| 2098 | Aguardiente Colombiano | Anise Spirit | Colombia | 24–30% | 10 | spiritdata/17-asia-misc.json |

## New bottles, by brand

### Johnnie Walker (5)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2099 | Johnnie Walker Double Black | Blended Scotch | Scotland | 40% | https://www.johnniewalker.com/en-us/our-whisky/core-range/johnnie-walker-double-black |
| 2100 | Johnnie Walker 18 | Blended Scotch | Scotland | 40% | https://www.johnniewalker.com/en-us/our-whisky/core-range/johnnie-walker-aged-18-years |
| 2101 | Johnnie Walker Black Ruby | Blended Scotch | Scotland | 40% | https://www.johnniewalker.com/es-mx/our-whisky/core-range/johnnie-walker-black-ruby |
| 2102 | Johnnie Walker Black Cask | Blended Scotch | Scotland | 43% | https://www.johnniewalker.com/en-us/our-whisky/core-range/johnnie-walker-black-cask |
| 2103 | Johnnie Walker High Rye | Blended Scotch | Scotland | 45% | https://www.johnniewalker.com/en-us/our-whisky/core-range/high-rye-blended-scotch-whisky |

### Buchanan's (9)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2104 | Buchanan's DeLuxe 12 | Blended Scotch | Scotland | 40% | https://www.diffordsguide.com/beer-wine-spirits/3497/buchanans-de-luxe-12-year-old |
| 2105 | Buchanan's Master | Blended Scotch | Scotland | 40% | https://www.walmart.com/ip/212460559 |
| 2106 | Buchanan's Select 15 | Blended Malt Scotch | Scotland | 40% | https://scotchwhisky.com/magazine/latest-news/19893/buchanan-s-moves-into-blended-malts/ |
| 2107 | Buchanan's Special Reserve 18 | Blended Scotch | Scotland | 40% | https://en.wikipedia.org/wiki/Buchanan%27s |
| 2108 | Buchanan's Red Seal | Blended Scotch | Scotland | 40% | https://shopsk.com/products/buchanans-red-seal-scotch-whisky |
| 2109 | Buchanan's Two Souls | Blended Scotch | Scotland | 40% | https://thedailypour.com/spirit/buchanans-two-souls-blended-scotch |
| 2110 | Buchanan's Green Seal | Blended Scotch | Scotland | 40% | https://finviz.com/news/168565/buchanans-scotch-whisky-introduces-buchanans-green-seal-a-luxury-whisky-pulsing-with-ritmo-crafted-for-your-inner-circle |
| 2111 | Buchanan's Pineapple | Flavored Scotch Whisky | Scotland | 35% | https://thedailypour.com/?p=34000 |
| 2112 | Buchanan's Coconut | Flavored Scotch Whisky | Scotland | 35% (one retailer lists 40%) | https://finviz.com/news/392766/buchanans-whisky-introduces-buchanans-coconut-its-loudest-flavor-yet-with-a-new-campaign-featuring-nina-sky-thats-bursting-with-latin-rhythm-and-tropical-flavor |

### Old Parr (3)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2113 | Old Parr 12 | Blended Scotch | Scotland | 40% | https://en.wikipedia.org/wiki/Grand_Old_Parr |
| 2114 | Old Parr 18 | Blended Scotch | Scotland | 40% | https://en.wikipedia.org/wiki/Grand_Old_Parr |
| 2115 | Old Parr Silver | Blended Scotch | Scotland | 40% | https://en.wikipedia.org/wiki/Grand_Old_Parr |

### Jameson (4)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2116 | Jameson Caskmates Stout Edition | Irish Blended Whiskey | Ireland | 40% | https://uproxx.com/life/jameson-whiskeys-ranked/ |
| 2117 | Jameson Caskmates IPA Edition | Irish Blended Whiskey | Ireland | 40% | https://uproxx.com/life/jameson-whiskeys-ranked/ |
| 2118 | Jameson Crested | Irish Blended Whiskey | Ireland | 40% | https://thewhiskeywash.com/whiskey-news/jameson-introduces-new-names-and-updated-packing/ |
| 2119 | Jameson Orange | Flavored Irish Whiskey | Ireland | 30% | https://thewhiskeywash.com/irish-whiskey/jameson-orange-debuts-as-orange-flavored-irish-whiskey/ |

### Jim Beam (11)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2120 | Jim Beam Devil's Cut | Bourbon | USA | 45% | https://www.jimbeam.com/en-us/bourbons/jim-beam-devils-cut |
| 2121 | Jim Beam Double Oak | Bourbon | USA | 43% | https://www.jimbeam.com/en-us/bourbons/jim-beam-double-oak |
| 2122 | Jim Beam Single Barrel | Single Barrel Bourbon | USA | 54% | https://www.jimbeam.com/en-us/bourbons/jim-beam-single-barrel |
| 2123 | Jim Beam Rye | Rye Whiskey | USA | 45% | https://www.jimbeam.com/en-us/bourbons/jim-beam-rye |
| 2124 | Jim Beam Honey | Flavored Whiskey | USA | 32.5% | https://www.jimbeam.com/en-us/bourbons/jim-beam-honey |
| 2125 | Jim Beam Apple | Flavored Whiskey | USA | 32.5% | https://www.jimbeam.com/en-us/bourbons/jim-beam-apple |
| 2126 | Jim Beam Peach | Flavored Whiskey | USA | 32.5% | https://www.jimbeam.com/en-us/bourbons/jim-beam-peach |
| 2127 | Jim Beam Vanilla | Flavored Whiskey | USA | 32.5% | https://www.jimbeam.com/en-us/bourbons/jim-beam-vanilla |
| 2128 | Jim Beam Red Stag | Flavored Whiskey | USA | 32.5% | https://www.jimbeam.com/en-us/bourbons/jim-beam-red-stag |
| 2129 | Jim Beam Kentucky Fire | Flavored Whiskey | USA | 32.5% | https://www.jimbeam.com/en-us/bourbons/jim-beam-kentucky-fire |
| 2130 | Jim Beam Pineapple | Flavored Whiskey | USA | 32.5% | https://www.jimbeam.com/en-us/bourbons/jim-beam-pineapple |

### Evan Williams (8)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2131 | Evan Williams 1783 Small Batch | Small Batch Bourbon | USA | 45% | https://www.distillerytrail.com/blog/heaven-hill-redesigns-evan-williams-1783-small-batch-bourbon-bottle-bumps-up-the-proof/ |
| 2132 | Evan Williams Single Barrel | Single Barrel Bourbon | USA | 43.3% | https://www.evanwilliams.com/single-barrel |
| 2133 | Evan Williams Honey | Flavored Whiskey | USA | 35% | https://shop.iowaabd.com/products/73702-evan-williams-honey-750-ml |
| 2134 | Evan Williams Apple | Flavored Whiskey | USA | 35% | https://www.evanwilliams.com/apple-bourbon.php |
| 2135 | Evan Williams Peach | Flavored Whiskey | USA | 35% | https://www.evanwilliams.com/peach-bourbon.php |
| 2136 | Evan Williams Cherry | Flavored Whiskey | USA | 35% | https://heavenhill.com/news-and-notes/evan-williams-cherry-reserve-flavored-bourbon-to-be-launched-in-september/ |
| 2137 | Evan Williams Fire | Flavored Whiskey | USA | 35% (retailers) | https://www.evanwilliams.com/fire-bourbon.php |
| 2138 | Evan Williams Blackberry | Flavored Whiskey | USA | 32.5% | https://thewhiskeywash.com/whiskey-news/evan-williams-blackberry-bourbon-new-flavor-hits-shelves/ |

### Jack Daniel's (8)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2139 | Jack Daniel's Bonded | Tennessee Whiskey | USA | 50% | https://www.jackdaniels.com/en-us/whiskey/jack-daniels-bonded-tennessee-whiskey |
| 2140 | Jack Daniel's Bonded Rye | Rye Whiskey | USA | 50% | https://www.jackdaniels.com/en-us/whiskey/jack-daniels-bonded-tennessee-rye-whiskey |
| 2141 | Jack Daniel's Single Barrel Rye | Rye Whiskey | USA | 47% | https://www.jackdaniels.com/en-us/whiskey/jack-daniels-single-barrel-tennessee-rye-whiskey |
| 2142 | Jack Daniel's Sinatra Select | Tennessee Whiskey | USA | 45% | https://www.jackdaniels.com/en-us/whiskey/jack-daniels-sinatra-select-tennessee-whiskey |
| 2143 | Jack Daniel's Tennessee Honey | Flavored Whiskey | USA | 35% | https://www.jackdaniels.com/en-us/whiskey/jack-daniels-tennessee-honey |
| 2144 | Jack Daniel's Tennessee Fire | Flavored Whiskey | USA | 35% | https://www.jackdaniels.com/en-us/whiskey/jack-daniels-tennessee-fire |
| 2145 | Jack Daniel's Tennessee Apple | Flavored Whiskey | USA | 35% | https://www.jackdaniels.com/en-us/whiskey/jack-daniels-tennessee-apple |
| 2146 | Jack Daniel's Tennessee Blackberry | Flavored Whiskey | USA | 35% | https://www.jackdaniels.com/en-us/whiskey/tennessee-blackberry |

### Fireball (1)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2147 | Fireball Blazin' Apple | Flavored Canadian Whisky | Canada | 33% | https://www.fireballwhisky.com/blazin-apple/ |

### Crown Royal (7)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2148 | Crown Royal Black | Canadian Whisky | Canada | 45% | https://www.crownroyal.com/canadian-whisky/crown-royal-black |
| 2149 | Crown Royal XO | Canadian Whisky | Canada | 40% | https://www.crownroyal.com/canadian-whisky/crown-royal-xo |
| 2150 | Crown Royal Reserve 12 | Canadian Whisky | Canada | 40% | https://www.crownroyal.com/canadian-whisky/crown-royal-reserve-12yo |
| 2151 | Crown Royal Marquis | Canadian Whisky | Canada | 40% | https://www.crownroyal.com/canadian-whisky/crown-royal-marquis |
| 2152 | Crown Royal Regal Apple | Flavored Canadian Whisky | Canada | 35% | https://www.crownroyal.com/canadian-whisky/crown-royal-regal-apple |
| 2153 | Crown Royal Vanilla | Flavored Canadian Whisky | Canada | 35% | https://www.crownroyal.com/canadian-whisky/crown-royal-vanilla |
| 2154 | Crown Royal Peach | Flavored Canadian Whisky | Canada | 35% | https://www.crownroyal.com/canadian-whisky/crown-royal-peach |

### Absolut (11)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2155 | Absolut Mandrin | Flavored Vodka | Sweden | 40% | https://woodencork.com/collections/absolut |
| 2156 | Absolut Vanilia | Flavored Vodka | Sweden | 38–40% (38% in the EU) | https://www.diffordsguide.com/en-au/beer-wine-spirits/1225/absolut-vanilia |
| 2157 | Absolut Raspberri | Flavored Vodka | Sweden | 38–40% (by market) | https://woodencork.com/collections/absolut |
| 2158 | Absolut Pears | Flavored Vodka | Sweden | 38–40% (by market) | https://woodencork.com/collections/absolut |
| 2159 | Absolut Lime | Flavored Vodka | Sweden | 40% | https://woodencork.com/collections/absolut |
| 2160 | Absolut Grapefruit | Flavored Vodka | Sweden | 40% | https://woodencork.com/collections/absolut |
| 2161 | Absolut Watermelon | Flavored Vodka | Sweden | 38% | https://woodencork.com/collections/absolut |
| 2162 | Absolut Mango | Flavored Vodka | Sweden | 38–40% (by market) | https://woodencork.com/collections/absolut |
| 2163 | Absolut Wild Berri | Flavored Vodka | Sweden | 38% | https://woodencork.com/collections/absolut |
| 2164 | Absolut Peppar | Pepper Vodka | Sweden | 40% | https://en.wikipedia.org/wiki/Absolut_Vodka |
| 2165 | Absolut Tabasco | Pepper Vodka | Sweden | 38% | https://www.shankennewsdaily.com/2026/01/29/39093/absolut-unveils-new-tabasco-flavored-vodka/ |

### Smirnoff (6)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2166 | Smirnoff Raspberry | Flavored Vodka | USA | 30% | https://www.smirnoff.com/en-us/products/vodkas-and-flavors/raspberry |
| 2167 | Smirnoff Vanilla | Flavored Vodka | USA | 30% | https://www.smirnoff.com/en-us/products/vodkas-and-flavors/vanilla |
| 2168 | Smirnoff Watermelon | Flavored Vodka | USA | 35% | https://www.smirnoff.com/en-us/products/vodkas-and-flavors/watermelon |
| 2169 | Smirnoff Green Apple | Flavored Vodka | USA | 30% | https://www.smirnoff.com/en-us/products/vodkas-and-flavors/green-apple |
| 2170 | Smirnoff Peach | Flavored Vodka | USA | 35% | https://www.smirnoff.com/en-us/products/vodkas-and-flavors/peach |
| 2171 | Smirnoff Spicy Tamarind | Flavored Vodka | USA | 35% | https://www.smirnoff.com/en-us/products/vodkas-and-flavors/spicy-tamarind |

### Stoli (4)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2172 | Stoli Vanilla | Flavored Vodka | Latvia | 37.5% | https://stoli.com/product/stoli-vanilla |
| 2173 | Stoli Raspberry | Flavored Vodka | Latvia | 37.5% | https://stoli.com/product/stoli-raspberry |
| 2174 | Stoli Citrus | Citron Vodka | Latvia | 37.5% | https://stoli.com/product/stoli-citrus |
| 2175 | Stoli Orange | Flavored Vodka | Latvia | 37.5% | https://stoli.com/product/stoli-orange |

### Grey Goose (8)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2176 | Grey Goose Altius | Wheat Vodka | France | 40% | https://www.greygoose.com/products |
| 2177 | Grey Goose Le Citron | Citron Vodka | France | 40% | https://www.greygoose.com/products |
| 2178 | Grey Goose L'Orange | Flavored Vodka | France | 40% | https://www.greygoose.com/products |
| 2179 | Grey Goose La Poire | Flavored Vodka | France | 40% | https://www.greygoose.com/products |
| 2180 | Grey Goose Berry Rouge | Flavored Vodka | France | 40% | https://bevnet.com/pr/2026/01/27/introducing-grey-goose-berry-rouge-a-new-flavored-vodka-and-a-fresh-way-to-enjoy-berries |
| 2181 | Grey Goose Essences Strawberry & Lemongrass | Flavored Vodka | France | 30% | https://www.greygoose.com/products |
| 2182 | Grey Goose Essences Watermelon & Basil | Flavored Vodka | France | 30% | https://www.greygoose.com/products |
| 2183 | Grey Goose Essences White Peach & Rosemary | Flavored Vodka | France | 30% | https://www.greygoose.com/products |

### Cîroc (6)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2184 | Cîroc Red Berry | Flavored Vodka | France | 35% | https://www.ciroc.com/en-us/vodkas/red-berry |
| 2185 | Cîroc Peach | Flavored Vodka | France | 35% | https://www.ciroc.com/en-us/vodkas/peach |
| 2186 | Cîroc Pineapple | Flavored Vodka | France | 35% | https://www.ciroc.com/en-us/vodkas/pineapple |
| 2187 | Cîroc Coconut | Flavored Vodka | France | 35% | https://www.ciroc.com/en-us/vodkas/coconut |
| 2188 | Cîroc Apple | Flavored Vodka | France | 35% | https://www.ciroc.com/en-us/vodkas/apple |
| 2189 | Cîroc Summer Watermelon | Flavored Vodka | France | 35% | https://www.ciroc.com/en-us/vodkas/summer-watermelon |

### Belvedere (2)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2190 | Belvedere 10 | Rye Vodka | Poland | 40% | https://www.belvederevodka.com/en-us/collection/luxury-belvedere-10 |
| 2191 | Belvedere Dirty Brew | Flavored Vodka | Poland | 30% | https://bevinfogroup.com/2026/04/06/belvedere-vodka-launches-dirty-brew-nationwide/ |

### Ketel One (5)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2192 | Ketel One Citroen | Citron Vodka | Netherlands | 40% | https://www.ketelone.com/vodkas/ketel-one-citroen |
| 2193 | Ketel One Oranje | Flavored Vodka | Netherlands | 40% | https://www.ketelone.com/vodkas/ketel-one-oranje |
| 2194 | Ketel One Botanical Cucumber & Mint | Flavored Vodka | Netherlands | 30% | https://www.ketelone.com/vodkas/ketel-one-botanical-cucumber-mint |
| 2195 | Ketel One Botanical Grapefruit & Rose | Flavored Vodka | Netherlands | 30% | https://www.ketelone.com/vodkas/ketel-one-botanical-grapefruit-rose |
| 2196 | Ketel One Botanical Peach & Orange Blossom | Flavored Vodka | Netherlands | 30% | https://www.ketelone.com/vodkas/ketel-one-botanical-peach-orange-blossom |

### Skyy (2)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2197 | Skyy Infusions Citrus | Flavored Vodka | USA | 35% | https://www.skyyvodka.com/en-us/products/skyy-infusions-citrus/ |
| 2198 | Skyy Infusions Pineapple | Flavored Vodka | USA | 35% | https://www.skyyvodka.com/en-us/products/skyy-infusions-pineapple/ |

### New Amsterdam (4)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2199 | New Amsterdam | Grain Vodka | USA | 40% | https://www.newamsterdamvodka.com/products/ |
| 2200 | New Amsterdam Pink Whitney | Flavored Vodka | USA | 30% | https://www.diffordsguide.com/beer-wine-spirits/8468/new-amsterdam-pink-whitney-vodka |
| 2201 | New Amsterdam Peach | Flavored Vodka | USA | 35% | https://www.newamsterdamvodka.com/products/flavors/peach/ |
| 2202 | New Amsterdam Pineapple | Flavored Vodka | USA | 35% | https://www.newamsterdamvodka.com/products/flavors/pineapple/ |

### Bacardí (13)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2203 | Bacardí Black | Dark Rum | Puerto Rico | 40% | https://www.bacardi.com/us/en/our-rums/black-rum/ |
| 2204 | Bacardí Spiced | Spiced Rum | Puerto Rico | 35% | https://www.bacardi.com/us/en/our-rums/spiced-rum/ |
| 2205 | Bacardí Añejo Cuatro | Ron Añejo | Puerto Rico | 40% | https://www.bacardi.com/us/en/our-rums/anejo-cuatro-rum/ |
| 2206 | Bacardí Gran Reserva Diez | Ron Añejo | Puerto Rico | 40% | https://www.bacardi.com/us/en/our-rums/reserva-diez-rum/ |
| 2207 | Bacardí Gran Reserva Limitada | Ron Añejo | Puerto Rico | 40% | https://www.bacardi.com/us/en/our-rums/reserva-limitada-rum/ |
| 2208 | Bacardí Limón | Flavored Rum | Puerto Rico | not published | https://www.bacardi.com/us/en/our-rums/limon-rum/ |
| 2209 | Bacardí Lime | Flavored Rum | Puerto Rico | not published | https://www.bacardi.com/us/en/our-rums/lime-rum/ |
| 2210 | Bacardí Coconut | Flavored Rum | Puerto Rico | not published | https://www.bacardi.com/us/en/our-rums/coconut-rum/ |
| 2211 | Bacardí Pineapple | Flavored Rum | Puerto Rico | not published | https://www.bacardi.com/us/en/our-rums/pineapple-rum/ |
| 2212 | Bacardí Raspberry | Flavored Rum | Puerto Rico | not published | https://www.bacardi.com/us/en/our-rums/raspberry-rum/ |
| 2213 | Bacardí Dragonberry | Flavored Rum | Puerto Rico | not published | https://www.bacardi.com/us/en/our-rums/dragonberry-rum/ |
| 2214 | Bacardí Mango Chile | Flavored Rum | Puerto Rico | 35% | https://www.bacardi.com/us/en/our-rums/bacardi-mango-chile/ |
| 2215 | Bacardí Tropical | Flavored Rum | Puerto Rico | not published | https://www.bacardi.com/us/en/our-rums/bacardi-tropical/ |

### Havana Club (2)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2216 | Havana Club Añejo Especial | Ron Añejo | Cuba | 40% (37.5% in some EU markets) | https://www.thewhiskyexchange.com/p/4491/havana-club-anejo-especial-rum |
| 2217 | Havana Club Cuban Spiced | Spiced Rum | Cuba | 35% | https://www.thewhiskyexchange.com/p/60450 |

### Ron Medellín (5)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2218 | Ron Medellín Dorado | Gold Rum | Colombia | not published | https://www.ronmedellin.com.co/producto/ron-medellin-dorado/ |
| 2219 | Ron Medellín Añejo 3 Años | Ron Añejo | Colombia | 35–37.5% | https://www.ronmedellin.com.co/producto/ron-medellin-anejo-3-anos/ |
| 2220 | Ron Medellín Extra Añejo 5 Años | Ron Añejo | Colombia | not published | https://www.ronmedellin.com.co/producto/ron-medellin-extra-anejo-5-anos/ |
| 2221 | Ron Medellín Extra Añejo 8 Años | Ron Añejo | Colombia | 37.5% | https://www.ronmedellin.com.co/producto/ron-medellin-extra-anejo-8-anos/ |
| 2222 | Ron Medellín Gran Reserva 12 Años | Ron Añejo | Colombia | 37.5–40% | https://www.ronmedellin.com.co/producto/ron-medellin-gran-reserva-12-anos/ |

### Ron Viejo de Caldas (5)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2223 | Ron Viejo de Caldas Tradicional 3 Años | Ron Añejo | Colombia | 35–37.5% | https://thefatrumpirate.com/ron-viejo-de-caldas-3-anos |
| 2224 | Ron Viejo de Caldas Juan de la Cruz 5 | Ron Añejo | Colombia | not published | https://www.valoraanalitik.com/?p=139620 |
| 2225 | Ron Viejo de Caldas Carta de Oro 8 | Ron Añejo | Colombia | 35–37.5% | https://www.thespiritsbusiness.com/2026/05/ron-viejo-de-caldas-celebrates-best-of-colombian-rum/ |
| 2226 | Ron Viejo de Caldas Gran Reserva Especial 15 | Ron Añejo | Colombia | 40% | https://thelonecaner.com/category/rum-reviews-by-country/colombia/ |
| 2227 | Ron Viejo de Caldas Roble Blanco | White Rum | Colombia | not published | https://www.portafolio.co/tendencias/los-tres-nuevos-productos-de-la-industria-licorera-de-caldas-con-los-que-cierra-2020-546882 |

### Dictador (2)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2228 | Dictador 12 | Solera Rum | Colombia | 40% | https://www.diffordsguide.com/en-au/beer-wine-spirits/440/dictador-ultra-premium-reserve-12yo-rum |
| 2229 | Dictador 20 | Solera Rum | Colombia | 40% | https://thefatrumpirate.com/dictador-distillery-icon-reserve-aged-20-years-solera-system-rum |

### La Hechicera (1)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2230 | La Hechicera Reserva Familiar | Solera Rum | Colombia | 40% | https://www.thewhiskyexchange.com/p/18588/la-hechicera-reserva-familiar-rum |

### Ron Barceló (6)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2231 | Ron Barceló Imperial Onyx | Dominican Rum | Dominican Republic | not published | https://ronbarcelo.com/rum/imperial-onyx/ |
| 2232 | Ron Barceló Blanco Añejado | Dominican Rum | Dominican Republic | not published | https://ronbarcelo.com/rum/blanco-anejado/ |
| 2233 | Ron Barceló Dorado Añejado | Dominican Rum | Dominican Republic | not published | https://ronbarcelo.com/rum/dorado-anejado/ |
| 2234 | Ron Barceló Añejo | Dominican Rum | Dominican Republic | not published | https://ronbarcelo.com/rum/anejo/ |
| 2235 | Ron Barceló Gran Añejo | Dominican Rum | Dominican Republic | not published | https://ronbarcelo.com/rum/gran-anejo/ |
| 2236 | Ron Barceló Cream | Cream Liqueur | Dominican Republic | not published | https://ronbarcelo.com/rum/cream/ |

### Brugal (3)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2237 | Brugal Añejo | Dominican Rum | Dominican Republic | 38–40% (by market) | https://reservebar.com/products/brugal-anejo/GROUPING-120439.html |
| 2238 | Brugal Extra Viejo | Dominican Rum | Dominican Republic | not published | https://en.wikipedia.org/wiki/Brugal |
| 2239 | Brugal Blanco Supremo | Dominican Rum | Dominican Republic | 40% | https://www.spiritradar.com/rum-db/brugal-blanco-supremo-40-percent-700ml/ |

### Don Q (15)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2241 | Don Q Gold | Gold Rum | Puerto Rico | 40% | https://donq.com/don-q-gold/ |
| 2242 | Don Q 151 | Overproof Rum | Puerto Rico | 75.5% | https://donq.com/don-q-151/ |
| 2243 | Don Q Reserva | Ron Añejo | Puerto Rico | not published | https://donq.com/don-q-reserva/ |
| 2244 | Don Q Reserva 7 | Ron Añejo | Puerto Rico | 40% | https://donq.com/don-q-reserva-7/ |
| 2245 | Don Q Reserva Especial | Ron Añejo | Puerto Rico | 40% | https://donq.com/don-q-reserva-especial/ |
| 2246 | Don Q Gran Reserva XO | Ron Añejo | Puerto Rico | 40% | https://donq.com/don-q-gran-reserva-xo/ |
| 2247 | Don Q Oak Barrel Spiced | Spiced Rum | Puerto Rico | 45% | https://donq.com/don-q-oak-barrel-spiced/ |
| 2248 | Don Q Double Aged Port Cask Finish | Ron Añejo | Puerto Rico | not published | https://donq.com/don-q-double-aged-port-cask-finish/ |
| 2249 | Don Q Double Aged Pedro Ximénez Cask Finish | Ron Añejo | Puerto Rico | 44% | https://donq.com/don-q-double-aged-pedro-ximenez-cask-finish/ |
| 2250 | Don Q Double Aged Cognac Cask Finish | Ron Añejo | Puerto Rico | not published | https://donq.com/don-q-double-aged-cognac-cask-finish/ |
| 2251 | Don Q Double Aged Zinfandel Cask Finish | Ron Añejo | Puerto Rico | 40% | https://donq.com/don-q-double-aged-zinfandel-cask-finish/ |
| 2252 | Don Q Coco | Flavored Rum | Puerto Rico | 21% | https://donq.com/don-q-coco/ |
| 2253 | Don Q Limón | Flavored Rum | Puerto Rico | 30% (TapHunter says 35%) | https://donq.com/don-q-limon/ |
| 2254 | Don Q Naranja | Flavored Rum | Puerto Rico | 21% | https://donq.com/don-q-naranja/ |
| 2255 | Don Q Pasión | Flavored Rum | Puerto Rico | 30% | https://donq.com/don-q-pasion/ |

### Ron del Barrilito (2)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2256 | Ron del Barrilito Two Stars | Ron Añejo | Puerto Rico | 43% | https://rondelbarrilito.com/our-products/ |
| 2257 | Ron del Barrilito Four Stars | Ron Añejo | Puerto Rico | 43% | https://rondelbarrilito.com/our-products/ |

### Palo Viejo (1)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2258 | Palo Viejo Gold | Gold Rum | Puerto Rico | 40% | https://theliquorbarn.com/products/palo-viejo-gold-rum-750ml |

### Captain Morgan (9)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2259 | Captain Morgan White Rum | White Rum | US Virgin Islands | 40% | https://www.captainmorgan.com/en-us/products/captain-morgan-white-rum |
| 2260 | Captain Morgan Silver Spiced | Spiced Rum | US Virgin Islands | 35% | https://www.captainmorgan.com/en-us/products/captain-morgan-silver-spiced-rum |
| 2261 | Captain Morgan Black Spiced | Spiced Rum | US Virgin Islands | 47.3% | https://www.captainmorgan.com/en-us/products/captain-morgan-black-spiced-rum |
| 2262 | Captain Morgan Private Stock | Spiced Rum | US Virgin Islands | 40% | https://www.captainmorgan.com/en-us/products/captain-morgan-private-stock-rum |
| 2263 | Captain Morgan 100 Proof Spiced | Spiced Rum | US Virgin Islands | 50% | https://www.captainmorgan.com/en-us/products/captain-morgan-100-proof-spiced-rum |
| 2264 | Captain Morgan Sliced Apple | Spiced Rum | US Virgin Islands | 35% | https://www.captainmorgan.com/en-us/products/captain-morgan-sliced-apple |
| 2265 | Captain Morgan Pineapple | Flavored Rum | US Virgin Islands | 35% | https://www.captainmorgan.com/en-us/products/captain-morgan-pineapple-rum |
| 2266 | Captain Morgan Coconut | Flavored Rum | US Virgin Islands | 35% | https://www.captainmorgan.com/en-us/products/captain-morgan-coconut-rum |
| 2267 | Captain Morgan Sweet Chili Lime | Flavored Rum | US Virgin Islands | 35% | https://www.captainmorgan.com/en-us/products/captain-morgan-sweet-chili-lime |

### Kraken (1)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2268 | Kraken Gold Spiced | Spiced Rum | Dominican Republic | 35% | https://www.krakenrum.com/products/kraken-gold-spice/ |

### Malibu (7)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2269 | Malibu Pineapple | Flavored Rum | Barbados | 21% | https://kiamie.bottlenose.wine/products/13868721/malibu-pineapple-rum |
| 2270 | Malibu Mango | Flavored Rum | Barbados | 21% | https://target.com/p/malibu-caribbean-rum-with-mango-liqueur-750ml-bottle/-/A-47137270 |
| 2271 | Malibu Passion Fruit | Flavored Rum | Barbados | 21% | https://theliquorbarn.com/collections/flavored-rum/products/malibu-passion-fruit-750ml |
| 2272 | Malibu Lime | Flavored Rum | Barbados | 21% | https://www.fredmeyer.com/p/malibu-lime-rum/0008954054004 |
| 2273 | Malibu Strawberry | Flavored Rum | Barbados | 21% | https://specsonline.com/shop/spirits/malibu-rum-strawberry-2/ |
| 2274 | Malibu Watermelon | Flavored Rum | Barbados | 21% (house strength) | https://target.com/p/malibu-watermelon-flavored-caribbean-rum-750ml-bottle/-/A-82019832 |
| 2275 | Malibu Peach | Flavored Rum | Barbados | 21% | https://www.bevnet.com/spirits/2023/malibu-launches-malibu-peach/ |

### Patrón (8)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2276 | Patrón Extra Añejo | Tequila Extra Añejo | Mexico | 40% | https://patrontequila.com/roca |
| 2277 | Patrón Cristalino | Tequila Cristalino | Mexico | 40% | https://patrontequila.com/roca |
| 2278 | Patrón El Alto | Tequila Reposado | Mexico | 40% | https://bourbonblog.com/2022/12/12/patron-el-alto-luxury-reposado-tequila/ |
| 2279 | Patrón El Cielo | Tequila Blanco | Mexico | 40% | https://patrontequila.com/roca |
| 2280 | Gran Patrón Platinum | Tequila Blanco | Mexico | 40% | https://patrontequila.com/roca |
| 2281 | Gran Patrón Piedra | Tequila Extra Añejo | Mexico | 40% | https://patrontequila.com/roca |
| 2282 | Gran Patrón Burdeos | Tequila Añejo | Mexico | 40% | https://patrontequila.com/roca |
| 2306 | Patrón Citrónge Orange | Triple Sec | Mexico | 30% | https://patrontequila.com/products/patron-citronge-orange-liqueur.html |

### Don Julio (3)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2283 | Don Julio Reposado | Tequila Reposado | Mexico | 40% | https://www.donjulio.com/ |
| 2284 | Don Julio Añejo | Tequila Añejo | Mexico | 40% | https://www.donjulio.com/ |
| 2285 | Don Julio Rosado | Tequila Reposado | Mexico | 40% | https://www.bevnet.com/?p=206294 |

### Casamigos (5)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2286 | Casamigos Reposado | Tequila Reposado | Mexico | 40% | https://www.casamigos.com/ |
| 2287 | Casamigos Añejo | Tequila Añejo | Mexico | 40% | https://www.casamigos.com/ |
| 2288 | Casamigos Cristalino | Tequila Cristalino | Mexico | 40% | https://www.casamigos.com/ |
| 2289 | Casamigos Mezcal Joven | Mezcal Joven | Mexico | 40% | https://www.masterofmalt.com/mezcal/casamigos/casamigos-mezcal-joven-mezcal/ |
| 2290 | Casamigas Jalapeño | Flavored Tequila | Mexico | 40% | https://www.bevnet.com/spirits/2024/casamigos-introduces-casamigas-jalapeno-tequila-brought-to-you-by-cindy-crawford |

### Jose Cuervo (9)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2291 | Jose Cuervo Especial Silver | Tequila Blanco | Mexico | 40% | https://cuervo.com/products/especial-silver/ |
| 2292 | Jose Cuervo Especial Gold | Tequila Joven | Mexico | 40% | https://cuervo.com/products/especial-gold/ |
| 2293 | Jose Cuervo Tradicional Blanco | Tequila Blanco | Mexico | 40% | https://cuervo.com/products/tradicional-blanco/ |
| 2294 | Jose Cuervo Tradicional Añejo | Tequila Añejo | Mexico | 40% | https://cuervo.com/products/tradicional-anejo/ |
| 2295 | Jose Cuervo Tradicional Cristalino | Tequila Cristalino | Mexico | 40% | https://cuervo.com/products/tradicional-cristalino/ |
| 2296 | Jose Cuervo Reserva de la Familia Platino | Tequila Blanco | Mexico | 40% | https://reservadelafamilia.com/ |
| 2297 | Jose Cuervo Reserva de la Familia Reposado | Tequila Reposado | Mexico | 40% | https://reservadelafamilia.com/ |
| 2298 | Jose Cuervo Reserva de la Familia Extra Añejo | Tequila Extra Añejo | Mexico | 40% | https://reservadelafamilia.com/ |
| 2299 | Jose Cuervo Devil's Reserve | Flavored Tequila | Mexico | 30% | https://cuervo.com/products/devils-reserve/ |

### 1800 (5)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2300 | 1800 Silver | Tequila Blanco | Mexico | 40% | https://en.wikipedia.org/wiki/1800_Tequila |
| 2301 | 1800 Reposado | Tequila Reposado | Mexico | 40% | https://en.wikipedia.org/wiki/1800_Tequila |
| 2302 | 1800 Cristalino | Tequila Cristalino | Mexico | 40% | https://en.wikipedia.org/wiki/1800_Tequila |
| 2303 | 1800 Milenio | Tequila Extra Añejo | Mexico | 40% | https://en.wikipedia.org/wiki/1800_Tequila |
| 2304 | 1800 Coconut | Flavored Tequila | Mexico | 35% | https://www.diffordsguide.com/beer-wine-spirits/5713/1800-coconut-tequila |

### Hennessy (1)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2305 | Hennessy Paradis | Cognac Hors d'Âge | France | 40% | https://www.premiumgrandscrus.com/en/cognac-hors-d-age/4450-hennessy-paradis.html |

### Disaronno (1)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2307 | Disaronno Velvet | Cream Liqueur | Italy | 17% | https://en.wikipedia.org/wiki/Disaronno |

### Kahlúa (2)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2308 | Kahlúa Especial | Coffee Liqueur | Mexico | 36% | https://en.wikipedia.org/wiki/Kahl%C3%BAa |
| 2309 | Kahlúa Dunkin' Caramel Swirl Cream Liqueur | Cream Liqueur | Mexico | 16% | https://news.dunkindonuts.com/news/kahlua-dunkin-2025 |

### Baileys (3)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2310 | Baileys Salted Caramel | Irish Cream | Ireland | 17% | https://www.baileys.com/en-us/products |
| 2312 | Baileys Espresso Crème | Irish Cream | Ireland | 17% | https://www.baileys.com/en-us/products |
| 2313 | Baileys Chocolate | Irish Cream | Ireland | 15.7% | https://www.baileys.com/en-us/products/baileys-chocolate-liqueur |

### Jägermeister (3)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2314 | Jägermeister Cold Brew Coffee | Jägermeister | Germany | 33% | https://uk.jagermeister.com/products/coldbrew |
| 2315 | Jägermeister Manifest | Jägermeister | Germany | 38% | https://pressemappe.mast-jaegermeister.de/download/66/seiten-en/1036/6_jm-pressekit_en_productportfolio.pdf |
| 2316 | Jägermeister Scharf | Jägermeister | Germany | 33% | https://pressemappe.mast-jaegermeister.de/download/66/seiten-en/1036/6_jm-pressekit_en_productportfolio.pdf |

### Aguardiente Antioqueño (3)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2317 | Aguardiente Antioqueño Sin Azúcar | Aguardiente Antioqueño | Colombia | 29% | https://www.aguardienteantioqueno.com/portafolio/ |
| 2319 | Aguardiente Antioqueño Real | Aguardiente Antioqueño | Colombia | 24% / 29% | https://www.fla.com.co/aguardiente-antioquieno/ |
| 2330 | Aguardiente Antioqueño 24° Sin Azúcar | Aguardiente Antioqueño | Colombia | 24% | https://www.aguardienteantioqueno.com/portafolio/ |

### Néctar (4)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2320 | Aguardiente Néctar Rojo | Aguardiente Colombiano | Colombia | 29% | https://www.portafolio.co/negocios/industrias/mapa-de-los-aguardientes-la-variedad-de-marcas-y-sabores-que-hay-en-colombia-623176 |
| 2321 | Aguardiente Néctar Azul Sin Azúcar | Aguardiente Colombiano | Colombia | not published | https://trademarks.justia.com/982/87/e-l-c-aguardiente-nectar-azul-sin-98287568.html |
| 2322 | Aguardiente Néctar Club | Aguardiente Colombiano | Colombia | 24% | https://www.publimetro.co/comercial/2024/05/29/la-elc-celebra-20-anos-del-aguardiente-nectar-club-verde-con-innovacion-nuevos-retos-y-en-el-corazon-de-los-colombianos/ |
| 2323 | Aguardiente Néctar Dorado | Aguardiente Colombiano | Colombia | 24% | https://forbes.co/2024/03/19/negocios/el-guaro-sigue-de-moda-esta-licorera-lanza-aguardiente-saborizado-de-maracuya-coco-y-mango/ |

### Cristal (2)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2324 | Aguardiente Cristal | Aguardiente Colombiano | Colombia | 29–30% | https://www.valoraanalitik.com/?p=139620 |
| 2325 | Aguardiente Cristal Sin Azúcar | Aguardiente Colombiano | Colombia | not published | https://www.valoraanalitik.com/?p=139620 |

### Amarillo de Manzanares (1)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2326 | Aguardiente Amarillo de Manzanares | Aguardiente Colombiano | Colombia | 24% | https://specsonline.com/shop/spirits/amarillo-aguardiente-sin-azucar/ |

### Blanco del Valle (2)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2327 | Aguardiente Blanco del Valle | Aguardiente Colombiano | Colombia | not published | https://www.licorea.com/aguardiente-blanco-del-valle-1-liter-en-p-498.html |
| 2328 | Aguardiente Blanco del Valle Sin Azúcar | Aguardiente Colombiano | Colombia | 29% | https://www.licorea.com/aguardiente-blanco-del-valle-sin-azucar-en-p-883.html |

### Tapa Roja (1)

| Nº | Name | Style | Country | ABV | Source |
|---:|---|---|---|---|---|
| 2329 | Aguardiente Tapa Roja | Aguardiente Colombiano | Colombia | not published | https://www.portafolio.co/negocios/industrias/mapa-de-los-aguardientes-la-variedad-de-marcas-y-sabores-que-hay-en-colombia-623176 |

## Left out

- **Aguardiente Tapa Roja Rosado.** The bottle name is not stable in the sources (the press also calls it Aguardiente Rosado del Tolima), so the name could be wrong.
- **Hpnotiq.** A separate brand, not a variant of one already in the Dex, and it would need a style card of its own for one bottle.
- **Hennessy Pure White.** Hennessy gives it no grade, so filing it under Cognac VS would state a grade the bottle does not carry.
- **Crown Royal Salted Caramel.** A seasonal release. Seasonal and limited bottlings were left out in every group.
- **Crown Royal Blackberry.** A summer seasonal. Seasonal and limited bottlings were left out in every group.
- **Brugal Leyenda.** Sold only in the Dominican Republic, by Brugal's own FAQ, and a rum-and-sherry spirit drink rather than a rum (taken out after review).
- **Baileys Strawberries & Cream.** A limited spring edition (taken out after review).
- Colombian rum got no style card of its own: the aged Ron Medellín and Ron Viejo de Caldas bottles are the Spanish-Caribbean column-still style the Ron Añejo card already describes, Ron Medellín Dorado is a Gold Rum and Roble Blanco a White Rum. A Colombian Rum card can be added later if Jan wants one.
