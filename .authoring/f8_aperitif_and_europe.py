# -*- coding: utf-8 -*-
from ck import S, T, B, C

US, UK, ES, FR = "USA", "United Kingdom", "Spain", "France"
NYC, LDN, BKN = "New York City, USA", "London, England", "Brooklyn, USA"

# ============================================== LOW-ABV & APERITIF

T("Reverse Manhattan", US, NYC, "uncommon", "16-18%",
  "The Manhattan with its proportions turned around — two of vermouth to one of rye. Lighter, and a longer evening for it.",
  ["sweet vermouth", "rye", "bitters"],
  ["Sweet vermouth", "Rye whiskey", "Angostura bitters"],
  "Reversing a spirit-forward drink is a modern habit with an old justification: vermouth in 1890 was a fresher, better product than most of what was sold in the century after.",
  [("Sweet vermouth", "2 oz / 60 ml"), ("Rye whiskey", "1 oz / 30 ml"),
   ("Angostura bitters", "2 dashes"), ("Ice", "cubed")],
  "A cherry")

S("Sherry Julep", US, NYC, "rare", "12-14%",
  "Sherry, sugar and mint churned through crushed ice. The gentlest drink in the julep family by a distance.",
  ["nutty sherry", "mint", "sugar"],
  ["Sherry", "Mint", "Sugar"],
  "Juleps were made on whatever the bar had — cognac, peach brandy, rum, gin and sherry all appear in the nineteenth-century books, and bourbon is the latecomer.",
  [("Amontillado sherry", "3 oz / 90 ml"), ("Simple syrup", "0.5 oz / 15 ml"),
   ("Mint leaves", "10"), ("Ice", "crushed")],
  "A mint bouquet",
  sub="Julep & Cobbler", glass="Julep tin", method="muddled",
  steps=["Press the mint gently with the syrup in a julep tin.",
         "Add the sherry and pack with crushed ice.",
         "Churn with a barspoon until the tin frosts over.",
         "Cap with more ice and crown with mint."])

B("Vermouth Cassis", FR, "Paris, France", "Highball", "uncommon", "10-12%",
  "Dry vermouth and blackcurrant liqueur lengthened with soda. The French café order, also known as a Pompier.",
  ["blackcurrant", "dry vermouth", "soda"], "Highball glass",
  ["Dry vermouth", "Crème de cassis", "Soda water"],
  "Pompier means fireman, and the drink is named for them — a low-strength order for someone who might be called back to work.",
  [("Dry vermouth", "2 oz / 60 ml"), ("Crème de cassis", "0.5 oz / 15 ml"),
   ("Soda water", "4 oz / 120 ml, to top"), ("Ice", "cubed")],
  ["Fill a tall glass with ice.",
   "Add the vermouth and the cassis.",
   "Top with cold soda water.",
   "Stir once and hang a lemon twist on the rim."],
  "A lemon twist")

T("Cynar Negroni", US, NYC, "uncommon", "22-24%",
  "A Negroni with Cynar in Campari's place. Less bitter orange, more artichoke and earth.",
  ["artichoke", "juniper", "sweet vermouth"],
  ["Gin", "Cynar", "Sweet vermouth"],
  "Cynar is built on artichoke leaves and thirteen other botanicals, and it is noticeably lower in both bitterness and alcohol than Campari — so the same build drinks softer.",
  [("Gin", "1 oz / 30 ml"), ("Cynar", "1 oz / 30 ml"),
   ("Sweet vermouth", "1 oz / 30 ml"), ("Ice", "cubed")],
  "An orange twist", glass="Rocks glass")

# ==================================================== LONDON MARTINIS

C("Dukes Martini", UK, LDN, "Spirit-Forward", "uncommon", "40-42%",
  "Frozen gin poured into a frozen glass over a vermouth rinse. No ice, no stirring, and a two-drink limit.",
  ["juniper", "cold", "lemon oil"], "Frozen martini glass",
  ["Gin", "Dry vermouth"],
  "The house limit of two is real and enforced. The bar keeps its gin in the freezer, so the drink is never diluted at all — which is exactly why two is the number.",
  [("Gin", "3 oz / 90 ml, from the freezer"),
   ("Dry vermouth", "a rinse"), ("Amalfi lemon peel", "1 strip")],
  ["Keep the gin in the freezer and the glass in the freezer with it.",
   "Splash a little vermouth around the frozen glass and tip out what does not cling.",
   "Pour the frozen gin straight in. Add no ice and do not stir.",
   "Cut a strip of lemon peel over the surface at the table and drop it in."],
  "A lemon peel, cut at the table", "built")

C("Connaught Martini", UK, LDN, "Spirit-Forward", "uncommon", "34-36%",
  "Stirred at the table from a trolley, with a choice of five bitters and a strip of Amalfi lemon.",
  ["juniper", "dry vermouth", "lemon oil"], "Martini glass",
  ["Gin", "Dry vermouth", "Bitters"],
  "The trolley is the drink. It is wheeled over, the bitters are chosen in front of you, and the whole thing is stirred and poured at the table rather than at the bar.",
  [("Gin", "2.5 oz / 75 ml"), ("Dry vermouth", "0.5 oz / 15 ml"),
   ("Bitters of your choosing", "2 dashes"), ("Amalfi lemon peel", "1 strip"),
   ("Ice", "cubed")],
  ["Chill the glass thoroughly before the trolley arrives.",
   "Stir the gin and vermouth with ice until very cold.",
   "Strain into the chilled glass and add the chosen bitters on top.",
   "Cut a wide strip of Amalfi lemon peel over the surface and discard it."],
  "A lemon peel, expressed and discarded", "stirred")

# ======================================================== SAVOY & SCOTS

S("Havana Cocktail", UK, LDN, "rare", "20-22%",
  "Apricot brandy, Swedish punsch and gin with lemon. A Savoy drink named for a city it has nothing to do with.",
  ["apricot", "arrack", "lemon"],
  ["Apricot brandy", "Swedish punsch", "Gin", "Lemon juice"],
  "Savoy drinks named for places are usually named for the guest who ordered them or the ship they arrived on, which is why so few of them taste like anywhere.",
  [("Apricot brandy", "1 oz / 30 ml"), ("Swedish punsch", "1 oz / 30 ml"),
   ("Gin", "0.5 oz / 15 ml"), ("Lemon juice", "0.5 oz / 15 ml"),
   ("Ice", "cubed")],
  "A lemon twist")

T("Thistle", UK, "Scotland", "rare", "26-28%",
  "Scotch and sweet vermouth with Angostura. A Rob Roy by another name, and the older one.",
  ["malt", "sweet vermouth", "bitters"],
  ["Scotch whisky", "Sweet vermouth", "Angostura bitters"],
  "The thistle became Scotland's emblem from a legend about barefoot Norse raiders standing on one and giving away a night attack with the noise.",
  [("Blended Scotch whisky", "1.5 oz / 45 ml"),
   ("Sweet vermouth", "1.5 oz / 45 ml"), ("Angostura bitters", "2 dashes"),
   ("Ice", "cubed")],
  "A cherry")

T("Flying Scotsman", UK, "Scotland", "rare", "24-26%",
  "Scotch, sweet vermouth, sugar and bitters. Named for the train, and sweeter than a Rob Roy.",
  ["malt", "sweet vermouth", "sugar"],
  ["Scotch whisky", "Sweet vermouth", "Angostura bitters", "Sugar"],
  "The Flying Scotsman ran London to Edinburgh from 1862 and in 1934 became the first locomotive officially recorded at a hundred miles an hour.",
  [("Blended Scotch whisky", "1.5 oz / 45 ml"),
   ("Sweet vermouth", "1.5 oz / 45 ml"), ("Simple syrup", "1 tsp"),
   ("Angostura bitters", "2 dashes"), ("Ice", "cubed")],
  "An orange twist")

S("Pineapple Fizz", UK, LDN, "rare", "12-14%",
  "Rum, pineapple and sugar shaken and topped with soda. One of the Savoy's plainest and best fizzes.",
  ["pineapple", "rum", "soda"],
  ["White rum", "Pineapple juice", "Simple syrup", "Soda water"],
  "Pineapple was still expensive enough in 1930 to signal something — English country houses had rented single fruits as table centrepieces within living memory.",
  [("White rum", "2 oz / 60 ml"), ("Pineapple juice", "1 oz / 30 ml"),
   ("Simple syrup", "0.5 oz / 15 ml"), ("Soda water", "3 oz / 90 ml, to top"),
   ("Ice", "cubed")],
  "A pineapple wedge",
  sub="Fizz", glass="Highball glass",
  steps=["Shake the rum, pineapple juice and syrup hard with ice.",
         "Strain into a tall glass over fresh ice.",
         "Top with cold soda water.",
         "Garnish with a pineapple wedge."])

# ================================================== THE BROOKLYNS

T("Carroll Gardens", US, BKN, "rare", "24-26%",
  "Rye with Punt e Mes, an Italian amaro and a touch of maraschino. The richest of the Brooklyn variations.",
  ["rye", "bitter orange", "cherry", "amaro"],
  ["Rye whiskey", "Punt e Mes", "Amaro Nardini", "Maraschino liqueur"],
  "The Brooklyn variations all replace the original's Amer Picon, which stopped being imported to America in the 1970s and sent a generation of bartenders looking for substitutes.",
  [("Rye whiskey", "2 oz / 60 ml"), ("Punt e Mes", "0.75 oz / 22 ml"),
   ("Amaro Nardini", "0.25 oz / 7 ml"), ("Maraschino liqueur", "0.25 tsp"),
   ("Ice", "cubed")],
  "A cherry")

T("Cobble Hill", US, BKN, "rare", "22-24%",
  "Rye, dry vermouth and Amaro Montenegro with muddled cucumber. The only Brooklyn variation that tastes green.",
  ["cucumber", "rye", "orange peel"],
  ["Rye whiskey", "Dry vermouth", "Amaro Montenegro", "Cucumber"],
  "Cucumber in a stirred whiskey drink was a genuinely odd idea in 2007, and it is the reason this one still gets made when the others have faded.",
  [("Rye whiskey", "2 oz / 60 ml"), ("Dry vermouth", "0.5 oz / 15 ml"),
   ("Amaro Montenegro", "0.5 oz / 15 ml"), ("Cucumber", "3 slices"),
   ("Ice", "cubed")],
  "A cucumber slice",
  steps=["Press the cucumber gently in the bottom of a mixing glass.",
         "Add the rye, vermouth and amaro with ice and stir until cold.",
         "Double-strain into a chilled coupe so no cucumber comes through.",
         "Float a thin cucumber slice on top."])

T("Bushwick", US, BKN, "rare", "26-28%",
  "Rye, sweet vermouth, Amer Picon and maraschino. The closest of the variations to the Brooklyn it descends from.",
  ["rye", "bitter orange", "cherry"],
  ["Rye whiskey", "Sweet vermouth", "Amer Picon", "Maraschino liqueur"],
  "Amer Picon has not been sold in America since the 1970s, so every bar making this either has a smuggled bottle or a house substitute, and they will tell you which.",
  [("Rye whiskey", "2 oz / 60 ml"), ("Sweet vermouth", "0.75 oz / 22 ml"),
   ("Amer Picon", "0.25 oz / 7 ml"), ("Maraschino liqueur", "0.25 tsp"),
   ("Ice", "cubed")],
  "An orange twist")

S("La Última Palabra", US, NYC, "uncommon", "24-26%",
  "The Last Word rebuilt on mezcal. Same equal quarters, and the smoke changes everything about it.",
  ["smoke", "herbal", "cherry", "lime"],
  ["Mezcal", "Green Chartreuse", "Maraschino liqueur", "Lime juice"],
  "The Last Word's equal-parts structure is unusually forgiving of a base swap, which is why it has produced more successful variations than almost any other classic.",
  [("Mezcal", "0.75 oz / 22 ml"), ("Green Chartreuse", "0.75 oz / 22 ml"),
   ("Maraschino liqueur", "0.75 oz / 22 ml"), ("Lime juice", "0.75 oz / 22 ml"),
   ("Ice", "cubed")],
  "A lime twist")

C("Coffee Grog", US, "California, USA", "Hot", "rare", "16-18%",
  "Hot coffee with rum, butter and spice, and a flamed orange peel dropped in at the end.",
  ["coffee", "butter", "clove", "rum"], "Mug",
  ["Coffee", "Dark rum", "Butter", "Spices"],
  "Don the Beachcomber built a batter of butter, brown sugar and spice and kept it behind the bar by the tub, so the drink was a scoop and a pour rather than a build.",
  [("Hot strong coffee", "5 oz / 150 ml"), ("Dark rum", "1.5 oz / 45 ml"),
   ("Unsalted butter", "1 tsp"), ("Brown sugar", "1 tbsp"),
   ("Ground cloves", "a pinch"), ("Ground cinnamon", "a pinch"),
   ("Orange peel", "1 strip")],
  ["Mash the butter with the sugar and spices into a paste.",
   "Drop a spoonful into a warmed mug and pour the hot coffee over it, stirring until it melts.",
   "Add the rum and stir once more.",
   "Hold a strip of orange peel over a flame, squeeze it so the oils catch, and drop it in."],
  "A flamed orange peel", "built")

# ===================================================== SPAIN & FRANCE

B("Sonic", "Japan", "Tokyo, Japan", "Highball", "uncommon", "10-12%",
  "Whisky with half soda and half tonic. Named for the two mixers rather than anything faster.",
  ["quinine", "malt", "soda"], "Highball glass",
  ["Japanese whisky", "Soda water", "Tonic water"],
  "Splitting the mixer halves the tonic's sweetness while keeping its bitterness, which is the whole reason a Japanese bar reaches for two bottles instead of one.",
  [("Japanese whisky", "1.5 oz / 45 ml"), ("Soda water", "2.5 oz / 75 ml"),
   ("Tonic water", "2.5 oz / 75 ml"), ("Ice", "one long spear")],
  ["Fill a tall glass with a single long ice spear, or with hard clear cubes.",
   "Add the whisky and stir once to chill it.",
   "Pour the soda and tonic together down a barspoon.",
   "Lift once from the bottom and serve without garnish."],
  "None, or a lemon peel")

B("Pomada", ES, "Menorca, Spain", "Regional", "uncommon", "12-14%",
  "Menorcan gin and cloudy lemonade. The drink of the island's summer fiestas, poured by the jug.",
  ["juniper", "lemon", "wine spirit"], "Tall glass",
  ["Xoriguer gin", "Lemonade"],
  "Menorcan gin is distilled from wine rather than grain, a habit left behind by the British navy during its eighteenth-century occupation of the island.",
  [("Xoriguer or Menorcan gin", "2 oz / 60 ml"),
   ("Cloudy lemonade", "5 oz / 150 ml"), ("Ice", "cubed")],
  ["Fill a tall glass with ice.",
   "Add the gin.",
   "Top with cloudy lemonade.",
   "Stir once. At a fiesta it is mixed by the jug and poured from horseback height."],
  "A lemon wedge")

S("Agua de Sevilla", ES, "Seville, Spain", "uncommon", "14-16%",
  "Cava with brandy, triple sec and pineapple under a cap of whipped cream. Seville drinks it in the heat.",
  ["pineapple", "cava", "cream", "brandy"],
  ["Cava", "Brandy", "Triple sec", "Pineapple juice"],
  "It is a bar drink rather than a home one, and the whipped cream is not optional — served without it, in Seville, it is simply a different order.",
  [("Cava", "3 oz / 90 ml"), ("Spanish brandy", "0.75 oz / 22 ml"),
   ("Triple sec", "0.5 oz / 15 ml"), ("Pineapple juice", "2 oz / 60 ml"),
   ("Whipped cream", "to top"), ("Ice", "cubed")],
  "Whipped cream and cinnamon",
  sub="Sparkling", glass="Wine glass",
  steps=["Shake the brandy, triple sec and pineapple juice with ice.",
         "Strain into a large wine glass over fresh ice.",
         "Top with cold cava and stir once, gently.",
         "Cap with whipped cream and dust with cinnamon."])

C("Zurracapote", ES, "La Rioja, Spain", "Punch & Cobbler", "rare", "9-11%",
  "Red wine macerated for days with peaches, cinnamon and lemon. Rioja's fiesta punch, and not a sangría.",
  ["peach", "cinnamon", "red wine"], "Tumbler",
  ["Red wine", "Peaches", "Cinnamon", "Sugar"],
  "The difference from sangría is time: sangría is mixed and drunk the same day, and zurracapote is left to macerate for two or three before anyone touches it.",
  [("Rioja red wine", "2 bottles / 1.5 L"), ("Peaches", "4, sliced"),
   ("Lemon", "1, sliced"), ("Cinnamon sticks", "3"),
   ("Sugar", "1 cup"), ("Water", "1 cup")],
  ["Combine everything in a large jar or bucket and stir until the sugar dissolves.",
   "Cover and leave somewhere cool for two to three days.",
   "Taste and add sugar only if the fruit has not done enough.",
   "Strain or serve with the fruit, over ice, in tumblers."],
  "A slice of the macerated peach", "infused")

C("Sangría Blanca", ES, "Spain", "Punch & Cobbler", "uncommon", "10-12%",
  "White wine with peach, citrus and brandy over ice. Sangría without the tannin, and easier in the heat.",
  ["peach", "citrus", "white wine"], "Tumbler",
  ["White wine", "Brandy", "Peaches", "Citrus"],
  "White sangría is the version served across most of northern Spain, where the local wine is white and using a Rioja red for punch would be an odd thing to do.",
  [("Dry white wine", "1 bottle / 750 ml"), ("Spanish brandy", "2 oz / 60 ml"),
   ("Triple sec", "2 oz / 60 ml"), ("Peaches", "2, sliced"),
   ("Orange", "1, sliced"), ("Lemon", "1, sliced"),
   ("Soda water", "8 oz / 240 ml"), ("Ice", "cubed")],
  ["Combine the wine, brandy, triple sec and fruit in a jug.",
   "Chill for at least four hours so the fruit gives up its flavour.",
   "Add ice and top with soda water just before serving.",
   "Pour into tumblers, making sure everyone gets fruit."],
  "The macerated fruit", "infused")

B("Kir Breton", FR, "Brittany, France", "Regional", "uncommon", "5-7%",
  "Cider with blackcurrant liqueur. The Kir made with what Brittany actually grows.",
  ["blackcurrant", "apple", "cider"], "Wine glass",
  ["Dry cider", "Crème de cassis"],
  "The original Kir uses Burgundy's aligoté, and every French region has since made the same drink from whatever it presses — cider in Brittany, and it is the better version.",
  [("Dry Breton cider", "5 oz / 150 ml"),
   ("Crème de cassis", "0.5 oz / 15 ml")],
  ["Pour the cassis into the bottom of a wine glass.",
   "Add the cold cider slowly so it does not foam over.",
   "Do not stir — the pour combines it.",
   "Serve without ice."],
  "None")

C("Trou Normand", FR, "Normandy, France", "Shot", "rare", "40-42%",
  "A shot of calvados taken between courses, on the theory that it makes room for the rest of the meal.",
  ["apple", "oak", "warmth"], "Small glass",
  ["Calvados"],
  "Trou normand means the Norman hole, and the modern restaurant version replaces the neat shot with apple sorbet drowned in calvados.",
  [("Calvados", "1 oz / 30 ml"), ("Apple sorbet", "1 small scoop, optional")],
  ["Pour a small measure of calvados.",
   "Drink it in one, between courses, standing if the table is that sort of table.",
   "For the modern version, put a scoop of apple sorbet in a glass and pour the calvados over it.",
   "Either way, return to the meal immediately."],
  "None", "built")
