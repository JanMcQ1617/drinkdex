from ck import S, FL, TD, SG, B, C

US, UK = "USA", "United Kingdom"
NYC = "New York City, USA"

# ------------------------------------------------------------- SANGAREES
# Wine or spirit, sugar, ice and a heavy grate of nutmeg. The nutmeg is the
# whole definition — without it the same glass is a toddy served cold.

SG("Port Sangaree", UK, "England", "rare", "14-16%",
   "Port with sugar over ice and a heavy grate of nutmeg. The nutmeg is not a garnish here — it is what makes the drink a sangaree.",
   ["port", "nutmeg", "sugar"],
   ["Port wine", "Sugar", "Nutmeg"],
   "Sangaree and sangria share a root in the Spanish sangre, for blood, and both describe a wine lengthened and spiced rather than a cocktail.",
   [("Ruby port", "3 oz / 90 ml"), ("Sugar", "1 tsp"),
    ("Cold water", "0.5 oz / 15 ml"), ("Ice", "cubed"), ("Nutmeg", "to grate")])

SG("Sherry Sangaree", UK, "England", "rare", "14-16%",
   "Sherry, sugar and nutmeg over ice. Lighter and drier than the port version, and the one Victorian bars actually poured most.",
   ["nutty sherry", "nutmeg", "sugar"],
   ["Sherry", "Sugar", "Nutmeg"],
   "Sherry was the most-drunk wine in nineteenth-century Britain and America, which is why so many drinks in the old books simply assume a bottle is already open.",
   [("Amontillado sherry", "3 oz / 90 ml"), ("Sugar", "1 tsp"),
    ("Cold water", "0.5 oz / 15 ml"), ("Ice", "cubed"), ("Nutmeg", "to grate")])

SG("Brandy Sangaree", US, NYC, "rare", "20-22%",
   "Brandy over ice with sugar and nutmeg, and a float of port on top in the fuller version.",
   ["cognac", "nutmeg", "port", "sugar"],
   ["Brandy", "Sugar", "Port wine", "Nutmeg"],
   "Jerry Thomas prints the sangaree once per base — port, sherry, brandy, gin, ale and porter — treating it as a template rather than a single drink.",
   [("Cognac", "2 oz / 60 ml"), ("Sugar", "1 tsp"),
    ("Cold water", "0.5 oz / 15 ml"), ("Ruby port", "0.5 oz / 15 ml, to float"),
    ("Ice", "cubed"), ("Nutmeg", "to grate")])

# ------------------------------------------------------------------ FLIPS
# Whole egg, spirit, sugar. Drop the white and it is a sangaree; drop the
# spirit and it is eggnog.

FL("Rum Flip", US, "New England, USA", "rare", "16-18%",
   "Dark rum with a whole egg and sugar, shaken to a custard. Colonial New England drank this by the tankard.",
   ["molasses", "egg", "nutmeg"],
   ["Dark rum", "Whole egg", "Simple syrup", "Nutmeg"],
   "The original colonial flip was ale, rum and sugar heated with a red-hot iron called a loggerhead — which is where the phrase at loggerheads comes from.",
   [("Dark rum", "2 oz / 60 ml"), ("Whole egg", "1"),
    ("Simple syrup", "0.5 oz / 15 ml"), ("Ice", "cubed")])

FL("Sherry Flip", UK, "England", "rare", "12-14%",
   "Sherry, whole egg and sugar. The lightest flip in the family and the easiest to drink two of.",
   ["nutty sherry", "egg", "nutmeg"],
   ["Sherry", "Whole egg", "Simple syrup", "Nutmeg"],
   "A flip is defined by the whole egg — white for foam, yolk for body. Drop the white and it becomes a sangaree; drop the spirit and it is eggnog.",
   [("Oloroso sherry", "2.5 oz / 75 ml"), ("Whole egg", "1"),
    ("Simple syrup", "0.5 oz / 15 ml"), ("Ice", "cubed")])

FL("Whiskey Flip", US, NYC, "rare", "18-20%",
   "Bourbon with a whole egg and sugar, shaken cold and dusted with nutmeg.",
   ["bourbon", "egg", "nutmeg", "vanilla"],
   ["Bourbon", "Whole egg", "Simple syrup", "Nutmeg"],
   "Flips were considered restorative rather than indulgent, and nineteenth-century bar books recommend them to the convalescent with a straight face.",
   [("Bourbon", "2 oz / 60 ml"), ("Whole egg", "1"),
    ("Simple syrup", "0.5 oz / 15 ml"), ("Ice", "cubed")])

C("Ale Flip", UK, "England", "Hot", "rare", "6-8%",
  "Hot ale beaten with egg, sugar and spice until it foams. The ancestor of every flip, and originally heated by plunging an iron from the fire straight into the tankard.",
  ["ale", "egg", "nutmeg", "molasses"], "Tankard",
  ["Ale", "Whole eggs", "Brown sugar", "Nutmeg"],
  "The loggerhead was a poker kept in the fire specifically for this; plunging it into the tankard both heated and foamed the drink in one motion.",
  [("Brown ale", "10 oz / 300 ml"), ("Whole eggs", "2"),
   ("Brown sugar", "3 tbsp"), ("Grated nutmeg", "0.5 tsp"),
   ("Dark rum", "1 oz / 30 ml, optional")],
  ["Beat the eggs hard with the sugar and nutmeg until pale.",
   "Heat the ale to steaming without letting it boil.",
   "Pour the hot ale slowly onto the eggs, whisking constantly so they do not scramble.",
   "Pour back and forth between two jugs from a height until thick and foaming.",
   "Serve immediately in a warmed tankard."],
  "Grated nutmeg", "boiled")

# ---------------------------------------------------------------- TODDIES

TD("Whiskey Toddy", US, NYC, "uncommon", "20-22%",
   "Bourbon, sugar and hot water. Three ingredients and no lemon — the American toddy leaves the citrus out.",
   ["bourbon", "sugar", "warmth"],
   ["Bourbon", "Sugar", "Hot water"],
   "American bar books separate the toddy from the sling by a single ingredient: a sling takes nutmeg, a toddy does not.",
   [("Bourbon", "2 oz / 60 ml"), ("Sugar", "1 tsp"),
    ("Hot water", "4 oz / 120 ml")],
   "A lemon twist")

TD("Brandy Toddy", US, NYC, "rare", "20-22%",
   "Cognac with sugar and hot water, served in a warmed glass with a spoon left standing in it.",
   ["cognac", "sugar", "warmth"],
   ["Brandy", "Sugar", "Hot water"],
   "The metal spoon is a genuine precaution rather than a flourish — it conducts heat away and stops boiling water cracking the glass.",
   [("Cognac", "2 oz / 60 ml"), ("Sugar", "1 tsp"),
    ("Hot water", "4 oz / 120 ml")],
   "A lemon twist")

TD("Rum Toddy", US, "New England, USA", "rare", "20-22%",
   "Dark rum, sugar and hot water with nutmeg. The winter drink of colonial New England, made from whatever was cheapest, which was rum.",
   ["molasses", "nutmeg", "sugar"],
   ["Dark rum", "Sugar", "Hot water", "Nutmeg"],
   "New England imported Caribbean molasses and distilled it locally, so rum was cheaper than beer in eighteenth-century Massachusetts.",
   [("Dark rum", "2 oz / 60 ml"), ("Sugar", "1 tsp"),
    ("Hot water", "4 oz / 120 ml"), ("Nutmeg", "to grate")],
   "Grated nutmeg")

# ----------------------------------------------------------------- SLINGS

S("Whiskey Sling", US, NYC, "rare", "18-20%",
  "Bourbon, lemon, sugar and water with nutmeg over the top. A toddy served cold, which is all a sling has ever been.",
  ["bourbon", "lemon", "nutmeg", "sugar"],
  ["Bourbon", "Lemon juice", "Sugar", "Water", "Nutmeg"],
  "The 1806 newspaper definition of a cocktail — spirits, sugar, water and bitters — describes it explicitly as a bittered sling, which makes the sling the parent form.",
  [("Bourbon", "2 oz / 60 ml"), ("Lemon juice", "0.5 oz / 15 ml"),
   ("Simple syrup", "0.5 oz / 15 ml"), ("Cold water", "1 oz / 30 ml"),
   ("Ice", "cubed")],
  "Freshly grated nutmeg",
  sub="Highball", glass="Tumbler",
  steps=["Shake the bourbon, lemon juice, syrup and water with ice.",
         "Strain into a tumbler over fresh ice.",
         "Grate nutmeg generously over the surface.",
         "Serve without a straw."])

S("Brandy Sling", US, NYC, "rare", "18-20%",
  "Cognac with lemon, sugar and water, nutmeg grated over the top. The sling in its brandy form.",
  ["cognac", "lemon", "nutmeg"],
  ["Brandy", "Lemon juice", "Sugar", "Water", "Nutmeg"],
  "Slings were drunk hot in winter and cold in summer from the same recipe, which is why the old books often print no temperature at all.",
  [("Cognac", "2 oz / 60 ml"), ("Lemon juice", "0.5 oz / 15 ml"),
   ("Simple syrup", "0.5 oz / 15 ml"), ("Cold water", "1 oz / 30 ml"),
   ("Ice", "cubed")],
  "Freshly grated nutmeg",
  sub="Highball", glass="Tumbler",
  steps=["Shake the cognac, lemon juice, syrup and water with ice.",
         "Strain into a tumbler over fresh ice.",
         "Grate nutmeg over the top.",
         "Serve cold, or build the same measures with hot water in winter."])

# ------------------------------------------------------------------ SOURS

S("Gin Sour", US, NYC, "uncommon", "20-22%",
  "Gin, lemon and sugar. The plainest sour there is, and the shape almost every gin drink in the canon is built on.",
  ["lemon", "juniper", "sugar"],
  ["Gin", "Lemon juice", "Simple syrup"],
  "Two of spirit, three-quarters of citrus, half of sugar is the ratio nearly every sour resolves to — the Daiquiri, the Sidecar and the Margarita are the same arithmetic in different bottles.",
  [("Gin", "2 oz / 60 ml"), ("Lemon juice", "0.75 oz / 22 ml"),
   ("Simple syrup", "0.5 oz / 15 ml"), ("Ice", "cubed")],
  "A lemon wheel")

S("Rum Sour", US, NYC, "rare", "20-22%",
  "Aged rum with lemon and sugar. Sits between a Daiquiri and a Whiskey Sour, and lands closer to the whiskey than you would expect.",
  ["aged rum", "lemon", "sugar"],
  ["Aged rum", "Lemon juice", "Simple syrup"],
  "The only difference from a Daiquiri is lemon in place of lime, which sounds trivial and changes the drink completely — lemon reads richer, lime reads sharper.",
  [("Aged rum", "2 oz / 60 ml"), ("Lemon juice", "0.75 oz / 22 ml"),
   ("Simple syrup", "0.5 oz / 15 ml"), ("Ice", "cubed")],
  "A lemon wheel and a cherry")

S("Applejack Sour", US, "New Jersey, USA", "rare", "20-22%",
  "Apple brandy with lemon and sugar. A Jack Rose without the grenadine, and considerably drier for it.",
  ["apple", "lemon", "sugar"],
  ["Applejack", "Lemon juice", "Simple syrup"],
  "Laird's has distilled applejack in New Jersey since the 1700s and holds licence number one, the oldest commercial distilling permit in the United States.",
  [("Applejack", "2 oz / 60 ml"), ("Lemon juice", "0.75 oz / 22 ml"),
   ("Simple syrup", "0.5 oz / 15 ml"), ("Ice", "cubed")],
  "An apple slice")

# ---------------------------------------------------------------- CRUSTAS

S("Gin Crusta", US, "New Orleans, USA", "rare", "24-26%",
  "Gin, maraschino, lemon and bitters in a sugar-rimmed glass lined with a single whole lemon peel.",
  ["lemon", "cherry", "juniper", "sugar"],
  ["Gin", "Maraschino liqueur", "Lemon juice", "Angostura bitters"],
  "The crusta is defined by the peel — one lemon rind cut in a single piece and pressed inside the glass, which is where the name comes from.",
  [("Gin", "2 oz / 60 ml"), ("Maraschino liqueur", "0.25 oz / 7 ml"),
   ("Lemon juice", "0.5 oz / 15 ml"), ("Orange curacao", "0.25 tsp"),
   ("Angostura bitters", "2 dashes"), ("Caster sugar", "for the rim"),
   ("Ice", "cubed")],
  "A whole lemon peel inside a sugared rim",
  glass="Small wine glass with a sugared rim",
  steps=["Peel a lemon in one continuous spiral and press it inside a small wine glass.",
         "Rim the glass with lemon and caster sugar.",
         "Shake the gin, maraschino, curacao, lemon juice and bitters with ice.",
         "Strain into the prepared glass and serve."])

S("Whiskey Crusta", US, "New Orleans, USA", "rare", "24-26%",
  "The crusta built on rye. Same lemon-lined glass, same sugared rim, a heavier drink underneath it.",
  ["rye", "lemon", "cherry", "sugar"],
  ["Rye whiskey", "Maraschino liqueur", "Lemon juice", "Angostura bitters"],
  "Joseph Santini created the original Brandy Crusta in New Orleans around 1850, and it is the drink the Sidecar and the Margarita both descend from.",
  [("Rye whiskey", "2 oz / 60 ml"), ("Maraschino liqueur", "0.25 oz / 7 ml"),
   ("Lemon juice", "0.5 oz / 15 ml"), ("Angostura bitters", "2 dashes"),
   ("Caster sugar", "for the rim"), ("Ice", "cubed")],
  "A whole lemon peel inside a sugared rim",
  glass="Small wine glass with a sugared rim",
  steps=["Line a small wine glass with a single long lemon peel.",
         "Rim it with lemon and caster sugar.",
         "Shake the rye, maraschino, lemon juice and bitters with ice.",
         "Strain into the prepared glass and serve."])

# ----------------------------------------------------------------- JULEPS

C("Brandy Julep", US, "American South, USA", "Julep & Cobbler", "rare", "24-26%",
  "Cognac, sugar and mint churned through crushed ice. The julep as it was made before bourbon claimed it.",
  ["mint", "cognac", "sugar"], "Julep tin",
  ["Brandy", "Mint", "Sugar"],
  "The julep was originally made with cognac or peach brandy; bourbon only became standard after phylloxera cut off the French supply in the 1870s.",
  [("Cognac", "2.5 oz / 75 ml"), ("Sugar", "1 tsp"),
   ("Mint leaves", "10"), ("Ice", "crushed")],
  ["Press the mint gently with the sugar in a julep tin — bruise it, do not tear it.",
   "Add the cognac and pack the tin with crushed ice.",
   "Churn with a barspoon until the outside of the tin frosts.",
   "Cap with more crushed ice and crown with a dense mint bouquet."],
  "A dense mint bouquet", "muddled")

C("Champagne Julep", US, "American South, USA", "Julep & Cobbler", "rare", "12-14%",
  "Mint and sugar under champagne over crushed ice. Lighter than any julep has a right to be.",
  ["mint", "brioche", "sugar"], "Julep tin",
  ["Champagne", "Mint", "Sugar"],
  "Jerry Thomas prints it in 1862, which puts champagne juleps in American bars decades before the Kentucky Derby made the bourbon version a fixture.",
  [("Champagne", "5 oz / 150 ml"), ("Sugar", "1 tsp"),
   ("Mint leaves", "10"), ("Ice", "crushed")],
  ["Press the mint with the sugar in a julep tin.",
   "Fill the tin with crushed ice.",
   "Pour the champagne slowly over the ice so it does not foam over the rim.",
   "Stir once, gently, and crown with mint."],
  "A mint bouquet", "muddled")

# ---------------------------------------------------------------- COOLERS

C("Remsen Cooler", US, NYC, "Highball", "rare", "10-12%",
  "Scotch and soda over a long unbroken spiral of lemon peel. Named for a whisky brand nobody drinks any more.",
  ["malt", "lemon", "soda"], "Collins glass",
  ["Scotch whisky", "Soda water", "Lemon peel"],
  "The cooler is defined by the continuous citrus spiral hung inside the glass — the same construction as a Horse's Neck, which is a cooler under another name.",
  [("Blended Scotch whisky", "2 oz / 60 ml"),
   ("Soda water", "5 oz / 150 ml, to top"),
   ("Lemon", "1, peeled in one spiral"), ("Ice", "cubed")],
  ["Peel a lemon in one continuous spiral and hang it inside a Collins glass.",
   "Fill the glass carefully with ice, holding the spiral against the side.",
   "Add the Scotch and top with cold soda water.",
   "Stir once and serve."],
  "A full lemon spiral", "built")

C("Klondike Cooler", US, NYC, "Highball", "rare", "10-12%",
  "Rye with orange peel and ginger ale over ice — a cooler named for the gold rush of 1897.",
  ["ginger", "orange", "rye"], "Collins glass",
  ["Rye whiskey", "Ginger ale", "Orange peel"],
  "The Klondike rush drew a hundred thousand prospectors north in two years; barely a few hundred struck it rich, and the drink outlasted almost all of them.",
  [("Rye whiskey", "2 oz / 60 ml"), ("Ginger ale", "5 oz / 150 ml, to top"),
   ("Orange", "1, peeled in one spiral"), ("Ice", "cubed")],
  ["Hang a continuous orange peel spiral inside a Collins glass.",
   "Fill with ice, keeping the spiral pressed against the side.",
   "Add the rye and top with cold ginger ale.",
   "Stir once and serve."],
  "A full orange spiral", "built")

S("Harvard Cooler", US, "Massachusetts, USA", "rare", "12-14%",
  "Applejack, lemon and sugar lengthened with soda. The Harvard's long, cold cousin.",
  ["apple", "lemon", "soda"],
  ["Applejack", "Lemon juice", "Simple syrup", "Soda water"],
  "Cooler, rickey, fizz and Collins are separated by fine distinctions of sweetener, citrus and garnish that Victorian bar books took entirely seriously.",
  [("Applejack", "2 oz / 60 ml"), ("Lemon juice", "0.75 oz / 22 ml"),
   ("Simple syrup", "0.5 oz / 15 ml"), ("Soda water", "3 oz / 90 ml, to top"),
   ("Ice", "cubed")],
  "A lemon wheel",
  sub="Highball", glass="Collins glass",
  steps=["Shake the applejack, lemon juice and syrup with ice.",
         "Strain into a Collins glass filled with fresh ice.",
         "Top with cold soda water.",
         "Stir once and garnish with a lemon wheel."])

# --------------------------------------------------- COLONIAL & ODDITIES

B("Bombo", "Barbados", "Caribbean", "Regional", "rare", "16-18%",
  "Rum, water, sugar and nutmeg. The plainest rum drink in the colonial Atlantic, and the one sailors actually drank.",
  ["molasses", "nutmeg", "sugar"], "Tankard",
  ["Dark rum", "Water", "Sugar", "Nutmeg"],
  "Bombo, sometimes bumbo, was the currency of colonial election campaigns — George Washington's agents handed out gallons of it during his 1758 run for the Virginia House of Burgesses.",
  [("Dark rum", "2 oz / 60 ml"), ("Cold water", "3 oz / 90 ml"),
   ("Sugar", "1 tsp"), ("Nutmeg", "to grate")],
  ["Dissolve the sugar in a little of the water in the bottom of the vessel.",
   "Add the rum and the remaining water and stir.",
   "Grate nutmeg generously over the surface.",
   "Serve at ambient temperature, or over ice in the heat."],
  "Freshly grated nutmeg")

B("Blackstrap", US, "New England, USA", "Regional", "rare", "18-20%",
  "Dark rum with molasses and hot water. Colonial, cheap and unapologetically heavy.",
  ["molasses", "treacle", "rum"], "Mug",
  ["Blackstrap rum", "Molasses", "Hot water"],
  "Blackstrap molasses is the third boiling of cane syrup with nearly all the sugar removed, which is why it tastes bitter and mineral rather than sweet.",
  [("Blackstrap or dark rum", "2 oz / 60 ml"), ("Molasses", "1 tsp"),
   ("Hot water", "4 oz / 120 ml")],
  ["Stir the molasses into a little hot water until it has fully dissolved.",
   "Add the rum and stir again.",
   "Top with the remaining hot water.",
   "Serve hot, in a warmed mug."],
  "None")

B("Shandygaff", UK, "England", "Party", "uncommon", "2-3%",
  "Ale and ginger beer, half and half. The Victorian ancestor of the shandy, and sharper than the lemonade version that replaced it.",
  ["ginger", "malt", "bitter"], "Pint glass",
  ["Ale", "Ginger beer"],
  "Dickens uses the word in 1868 and Wodehouse never stopped; the ginger-beer version predates the lemonade shandy by a good half-century.",
  [("Bitter or pale ale", "half pint / 285 ml"),
   ("Ginger beer", "half pint / 285 ml")],
  ["Chill both the ale and the ginger beer thoroughly.",
   "Pour the ginger beer into a pint glass first.",
   "Add the ale slowly, down the side of the tilted glass, to control the foam.",
   "Do not stir — the pour does the mixing."],
  "None")

C("Green Swizzle", "Barbados", "Barbados", "Tiki & Tropical", "rare", "18-20%",
  "Rum, lime and falernum swizzled green with a wormwood bitters, and immortalised by a Wodehouse character who claimed it changed his life.",
  ["falernum", "lime", "herbal", "rum"], "Highball glass",
  ["White rum", "Lime juice", "Falernum", "Green bitters"],
  "The original green came from a Barbadian wormwood bitters that is now effectively lost, which is why every modern version reaches for Chartreuse instead.",
  [("White rum", "2 oz / 60 ml"), ("Lime juice", "0.75 oz / 22 ml"),
   ("Falernum", "0.5 oz / 15 ml"), ("Green Chartreuse", "0.25 oz / 7 ml"),
   ("Angostura bitters", "2 dashes"), ("Ice", "crushed")],
  ["Fill a tall glass with crushed ice.",
   "Add the rum, lime juice, falernum, Chartreuse and bitters.",
   "Spin a swizzle stick between your palms until the outside of the glass frosts over.",
   "Top with more crushed ice and crown with mint."],
  "A mint sprig", "swizzled")

S("Zoom", UK, "London, England", "rare", "22-24%",
  "Spirit, honey and cream shaken cold. Three ingredients, and it works with brandy, whisky or gin equally well.",
  ["honey", "cream", "cognac"],
  ["Brandy", "Honey", "Cream"],
  "The Savoy prints it as a template rather than a fixed recipe — the base spirit is left to the drinker, which is unusual for a book that specifies everything else.",
  [("Cognac", "2 oz / 60 ml"), ("Honey", "1 tsp"),
   ("Double cream", "0.75 oz / 22 ml"), ("Ice", "cubed")],
  "Grated nutmeg",
  sub="Creamy & Dessert",
  steps=["Loosen the honey with a splash of warm water so it will combine.",
         "Add the cognac, honey syrup and cream to a shaker with ice.",
         "Shake hard for 15 seconds.",
         "Double-strain into a chilled coupe and grate nutmeg over the top."])

C("Scaffa", UK, "England", "Spirit-Forward", "rare", "30-32%",
  "Layered liqueurs and spirit served at room temperature, with no ice and no dilution whatsoever.",
  ["herbal", "cherry", "cognac"], "Pony glass",
  ["Maraschino liqueur", "Green Chartreuse", "Brandy", "Angostura bitters"],
  "The scaffa is the only classical drink category defined by being served warm and undiluted — a deliberate refusal of everything ice brought to bartending.",
  [("Maraschino liqueur", "0.75 oz / 22 ml"), ("Green Chartreuse", "0.75 oz / 22 ml"),
   ("Brandy", "0.75 oz / 22 ml"), ("Angostura bitters", "1 dash")],
  ["Pour the maraschino into a small glass.",
   "Float the green Chartreuse over the back of a barspoon.",
   "Float the brandy last and add a dash of bitters on top.",
   "Serve at room temperature, without ice and without stirring."],
  "None — the layers are the presentation", "layered")
