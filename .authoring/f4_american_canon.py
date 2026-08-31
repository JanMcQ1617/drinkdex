# -*- coding: utf-8 -*-
from ck import S, T, B, C, FL

US, UK = "USA", "United Kingdom"
NYC, NOLA, SF = "New York City, USA", "New Orleans, USA", "San Francisco, USA"
LDN = "London, England"

# ============================================ THE OLD-FASHIONED COCKTAIL

T("Improved Holland Gin Cocktail", US, NYC, "rare", "28-30%",
  "Genever with maraschino, absinthe and bitters. The Old Fashioned before anyone thought to call it old.",
  ["malt", "juniper", "cherry", "anise"],
  ["Genever", "Maraschino liqueur", "Absinthe", "Angostura bitters"],
  "Improved meant one thing precisely in the old books: a plain spirit-sugar-bitters cocktail with maraschino and absinthe added, and nothing else.",
  [("Genever", "2 oz / 60 ml"), ("Simple syrup", "1 tsp"),
   ("Maraschino liqueur", "1 tsp"), ("Absinthe", "2 dashes"),
   ("Angostura bitters", "2 dashes"), ("Ice", "cubed")],
  "A lemon twist", glass="Rocks glass")

T("Fancy Brandy Cocktail", US, NYC, "rare", "30-32%",
  "Brandy, curaçao, sugar and bitters served in a sugar-rimmed glass. Fancy meant the rim, and nothing more.",
  ["cognac", "orange", "sugar"],
  ["Brandy", "Orange curaçao", "Angostura bitters"],
  "Jerry Thomas separates plain, improved and fancy versions of the same drink; fancy adds only a sugared rim and a fine lemon twist, and costs more.",
  [("Cognac", "2 oz / 60 ml"), ("Orange curaçao", "1 tsp"),
   ("Simple syrup", "1 tsp"), ("Angostura bitters", "2 dashes"),
   ("Caster sugar", "for the rim"), ("Ice", "cubed")],
  "A lemon twist over a sugared rim", glass="Coupe with a sugared rim")

T("Absinthe Cocktail", US, NOLA, "rare", "24-26%",
  "Absinthe, water, sugar and bitters, stirred cold. The absinthe drip served as a cocktail rather than a ritual.",
  ["anise", "wormwood", "sugar"],
  ["Absinthe", "Water", "Sugar", "Anisette"],
  "New Orleans drank more absinthe per head than any American city, and the Old Absinthe House on Bourbon Street still has the marble fountains it was dripped from.",
  [("Absinthe", "1.5 oz / 45 ml"), ("Cold water", "1.5 oz / 45 ml"),
   ("Simple syrup", "0.5 oz / 15 ml"), ("Anisette", "1 tsp"),
   ("Angostura bitters", "2 dashes"), ("Ice", "cubed")],
  "A lemon twist")

T("Rum Old Fashioned", US, NYC, "uncommon", "28-30%",
  "Aged rum, sugar and bitters. The template holds with any brown spirit, and rum takes to it better than most.",
  ["molasses", "oak", "bitters"],
  ["Aged rum", "Demerara syrup", "Angostura bitters"],
  "Demerara sugar syrup rather than plain is the one change worth making — it meets the molasses in the rum instead of sitting on top of it.",
  [("Aged rum", "2 oz / 60 ml"), ("Demerara syrup", "1 tsp"),
   ("Angostura bitters", "2 dashes"), ("Orange bitters", "1 dash"),
   ("Ice", "one large cube")],
  "An orange twist", glass="Rocks glass")

# =============================================================== SAVOY-ERA

T("Morning Glory", UK, LDN, "rare", "28-30%",
  "Brandy and Scotch together, with curaçao, absinthe and bitters. Built to be drunk in the morning, which explains a great deal.",
  ["cognac", "malt", "anise", "orange"],
  ["Brandy", "Scotch whisky", "Orange curaçao", "Absinthe"],
  "Nineteenth-century bar books have a whole category of morning drinks, and the honest reading is that they were hangover cures with better names.",
  [("Cognac", "1 oz / 30 ml"), ("Scotch whisky", "1 oz / 30 ml"),
   ("Orange curaçao", "1 tsp"), ("Absinthe", "2 dashes"),
   ("Angostura bitters", "2 dashes"), ("Simple syrup", "1 tsp"),
   ("Ice", "cubed")],
  "A lemon twist")

T("Artillery", UK, LDN, "rare", "28-30%",
  "Gin and sweet vermouth with two dashes of Angostura. A Gin and It with the bitters that make it a cocktail.",
  ["juniper", "sweet vermouth", "bitters"],
  ["Gin", "Sweet vermouth", "Angostura bitters"],
  "The 1806 definition — spirits, sugar, water and bitters — means a drink without bitters is technically not a cocktail at all, which is the joke this one is built on.",
  [("Gin", "2 oz / 60 ml"), ("Sweet vermouth", "1 oz / 30 ml"),
   ("Angostura bitters", "2 dashes"), ("Ice", "cubed")],
  "A lemon twist")

S("Diki Diki", UK, LDN, "rare", "22-24%",
  "Applejack, Swedish punsch and grapefruit. Named for a Filipino chief the Savoy's bartender had read about.",
  ["apple", "grapefruit", "arrack"],
  ["Applejack", "Swedish punsch", "Grapefruit juice"],
  "Swedish punsch turns up all over the Savoy book and almost nowhere since — it was the fashionable bottle of the 1920s and then simply stopped being ordered.",
  [("Applejack", "1.5 oz / 45 ml"), ("Swedish punsch", "0.5 oz / 15 ml"),
   ("Grapefruit juice", "0.5 oz / 15 ml"), ("Ice", "cubed")],
  "A grapefruit twist")

T("Deshler", US, NYC, "rare", "22-24%",
  "Rye and Dubonnet with curaçao and Peychaud's. Named for a boxer who never lost a fight he was paid to win.",
  ["rye", "quinine", "orange", "anise"],
  ["Rye whiskey", "Dubonnet", "Orange curaçao", "Peychaud's bitters"],
  "It is named for the featherweight Dave Deshler, and it is one of very few pre-Prohibition drinks that calls for Peychaud's outside New Orleans.",
  [("Rye whiskey", "1.5 oz / 45 ml"), ("Dubonnet", "1.5 oz / 45 ml"),
   ("Orange curaçao", "2 dashes"), ("Peychaud's bitters", "2 dashes"),
   ("Orange peel", "2 strips"), ("Ice", "cubed")],
  "An orange twist")

S("Frisco", US, SF, "rare", "24-26%",
  "Rye with Bénédictine and lemon. Three ingredients, and the Bénédictine does most of the talking.",
  ["rye", "honey", "herbal", "lemon"],
  ["Rye whiskey", "Bénédictine", "Lemon juice"],
  "Bénédictine's label still carries D.O.M. for Deo Optimo Maximo, a monastic dedication kept on a bottle that a nineteenth-century wine merchant invented the backstory for.",
  [("Rye whiskey", "2 oz / 60 ml"), ("Bénédictine", "0.5 oz / 15 ml"),
   ("Lemon juice", "0.5 oz / 15 ml"), ("Ice", "cubed")],
  "A lemon twist")

S("Barbary Coast", US, SF, "rare", "20-22%",
  "Gin, Scotch, crème de cacao and cream. Named for the stretch of San Francisco you did not walk down alone.",
  ["chocolate", "cream", "malt", "juniper"],
  ["Gin", "Scotch whisky", "Crème de cacao", "Cream"],
  "The Barbary Coast was the city's saloon district until the 1917 vice raids closed it, and the drink outlived the neighbourhood by a century.",
  [("Gin", "0.75 oz / 22 ml"), ("Scotch whisky", "0.75 oz / 22 ml"),
   ("White crème de cacao", "0.75 oz / 22 ml"), ("Double cream", "0.75 oz / 22 ml"),
   ("Ice", "cubed")],
  "Grated nutmeg", sub="Creamy & Dessert")

# ============================================================ NEW ORLEANS

S("Suissesse", US, NOLA, "rare", "16-18%",
  "Absinthe shaken with egg white and anisette until it turns pale green and thick. A New Orleans breakfast.",
  ["anise", "egg white", "mint"],
  ["Absinthe", "Egg white", "Anisette", "Cream"],
  "Absinthe louches — turns cloudy — when water hits it, because the anise oils fall out of solution; egg white takes that cloud and makes it a texture.",
  [("Absinthe", "1.5 oz / 45 ml"), ("Anisette", "0.5 oz / 15 ml"),
   ("Egg white", "1"), ("Double cream", "0.5 oz / 15 ml"),
   ("Simple syrup", "0.25 oz / 7 ml"), ("Ice", "cubed")],
  "A mint sprig", sub="Fizz", glass="Small tumbler",
  steps=["Dry-shake everything without ice for 20 seconds.",
         "Add ice and shake hard until the tin is painful to hold.",
         "Strain into a small chilled tumbler, no soda.",
         "Rest a mint sprig on the foam."])

C("Café Brûlot", US, NOLA, "Hot", "rare", "10-12%",
  "Coffee, brandy, spice and citrus peel set alight at the table and ladled while still burning.",
  ["coffee", "clove", "orange", "cognac"], "Demitasse",
  ["Coffee", "Brandy", "Orange peel", "Cloves"],
  "The showpiece is the peel: a whole orange rind is studded with cloves and lowered on a fork so the burning brandy runs down it in a spiral of flame.",
  [("Strong hot coffee", "8 oz / 240 ml"), ("Cognac", "3 oz / 90 ml"),
   ("Orange curaçao", "1 oz / 30 ml"), ("Orange", "1, peeled in one spiral"),
   ("Lemon peel", "2 strips"), ("Cloves", "6"),
   ("Cinnamon stick", "1"), ("Sugar", "2 tbsp")],
  ["Stud the orange spiral with the cloves and set it aside.",
   "Warm the brandy, curaçao, sugar, cinnamon and lemon peel in a wide brûlot bowl or pan.",
   "Light the spirit carefully and lower the clove-studded peel into the flame on a long fork.",
   "Ladle the burning brandy over the peel until the flame dies down.",
   "Pour in the hot coffee to extinguish it and serve in demitasse cups."],
  "None — the peel is the theatre", "boiled")

T("La Louisiane", US, NOLA, "uncommon", "28-30%",
  "Rye, sweet vermouth, Bénédictine and absinthe. The house drink of a Bourbon Street restaurant that closed decades ago.",
  ["rye", "herbal", "anise", "sweet vermouth"],
  ["Rye whiskey", "Sweet vermouth", "Bénédictine", "Absinthe"],
  "Restaurant de la Louisiane printed it as its house cocktail, and it sits between the Vieux Carré and the Sazerac in a city that produced remarkably few bad ideas.",
  [("Rye whiskey", "2 oz / 60 ml"), ("Sweet vermouth", "0.75 oz / 22 ml"),
   ("Bénédictine", "0.75 oz / 22 ml"), ("Absinthe", "3 dashes"),
   ("Peychaud's bitters", "3 dashes"), ("Ice", "cubed")],
  "A cherry")

S("Gun Shop Fizz", US, NOLA, "rare", "10-12%",
  "A whole bottle of Peychaud's stretched across twenty drinks with fruit, wine and soda. Bitters as the base spirit.",
  ["anise", "cherry", "citrus", "bitters"],
  ["Peychaud's bitters", "Red wine", "Fruit", "Soda water"],
  "Kirk Estopinal built it at Cure in New Orleans around the idea that bitters could be a base rather than a seasoning; it uses roughly four ounces per batch.",
  [("Peychaud's bitters", "1.5 oz / 45 ml"), ("Red wine", "0.5 oz / 15 ml"),
   ("Simple syrup", "0.75 oz / 22 ml"), ("Lemon", "2 wedges"),
   ("Orange", "2 slices"), ("Cucumber", "3 slices"),
   ("Soda water", "3 oz / 90 ml, to top"), ("Ice", "cubed")],
  "A lemon wheel and a cucumber slice",
  sub="Fizz", glass="Collins glass",
  steps=["Muddle the lemon, orange and cucumber with the syrup in a shaker.",
         "Add the Peychaud's, the red wine and ice, and shake briefly.",
         "Pour unstrained into a Collins glass.",
         "Top with soda and add more crushed ice to fill."])

# ====================================================== PUNCHES AND CUPS

C("Milk Punch", UK, "England", "Punch & Cobbler", "rare", "16-18%",
  "Spirit, citrus and hot milk curdled on purpose, then strained clear. It comes out looking like water and keeps for months.",
  ["citrus", "nutmeg", "silk"], "Wine glass",
  ["Brandy", "Rum", "Milk", "Lemon"],
  "Curdling is the whole technique: the milk solids trap the harsh compounds and the tannins, and straining them out leaves a punch that is clear, silky and effectively stable.",
  [("Brandy", "8 oz / 240 ml"), ("Dark rum", "8 oz / 240 ml"),
   ("Water", "12 oz / 360 ml"), ("Sugar", "6 oz / 170 g"),
   ("Lemons", "4, juiced, peels kept"), ("Whole milk", "10 oz / 300 ml"),
   ("Nutmeg", "to grate")],
  ["Steep the lemon peels in the sugar for two hours to draw out the oils.",
   "Add the spirits, water and lemon juice and stir until the sugar dissolves.",
   "Heat the milk to just below a simmer and pour the punch into the milk — this way round, never the reverse.",
   "Leave it to curdle for an hour, then strain slowly through a coffee filter until it runs clear.",
   "Bottle it and let it rest; it improves for weeks and keeps for months."],
  "Grated nutmeg", "infused")

B("Brandy Milk Punch", US, NOLA, "Brunch", "uncommon", "12-14%",
  "Brandy, milk, sugar and vanilla, shaken cold. New Orleans drinks it before noon and does not apologise.",
  ["cognac", "vanilla", "cream", "nutmeg"], "Rocks glass",
  ["Brandy", "Milk", "Sugar", "Vanilla"],
  "It shares only a name with the clarified English punch — this one is opaque, shaken to order, and belongs firmly to brunch.",
  [("Cognac", "2 oz / 60 ml"), ("Whole milk", "3 oz / 90 ml"),
   ("Simple syrup", "0.5 oz / 15 ml"), ("Vanilla extract", "0.25 tsp"),
   ("Ice", "cubed")],
  ["Add everything to a shaker with ice.",
   "Shake hard for 12 seconds until it is properly cold.",
   "Strain into a rocks glass over fresh ice.",
   "Grate nutmeg heavily over the top."],
  "Grated nutmeg")

C("Claret Cup", UK, "England", "Punch & Cobbler", "rare", "8-10%",
  "Bordeaux lengthened with soda, citrus, cucumber and borage. The drink of an English summer afternoon on a lawn.",
  ["red wine", "cucumber", "citrus", "borage"], "Punch bowl",
  ["Claret", "Soda water", "Cucumber", "Orange curaçao"],
  "Cucumber and borage in a wine cup are not garnish — the whole style is built around cooling the drink and the drinker, which is what cup meant.",
  [("Claret", "1 bottle / 750 ml"), ("Orange curaçao", "2 oz / 60 ml"),
   ("Brandy", "2 oz / 60 ml"), ("Sugar", "2 tbsp"),
   ("Lemon", "1, sliced"), ("Cucumber", "half, in ribbons"),
   ("Soda water", "1 pint / 500 ml, to top"), ("Ice", "a large block")],
  ["Stir the sugar into the curaçao and brandy until dissolved.",
   "Add the claret, lemon slices and cucumber ribbons and chill for an hour.",
   "Set a large block of ice in a bowl and pour the mixture over it.",
   "Top with cold soda water just before serving and float borage flowers if you have them."],
  "Borage flowers and cucumber ribbons", "built")

C("Champagne Cup", UK, "England", "Punch & Cobbler", "rare", "9-11%",
  "Champagne stretched with brandy, curaçao and fruit over a block of ice. A cup rather than a cocktail, and served by the bowl.",
  ["brioche", "orange", "berry"], "Punch bowl",
  ["Champagne", "Brandy", "Orange curaçao", "Fruit"],
  "Cups are always built over one large block rather than cubes — a block melts slowly enough that the bowl is still drinkable an hour into a garden party.",
  [("Champagne", "1 bottle / 750 ml"), ("Brandy", "2 oz / 60 ml"),
   ("Orange curaçao", "2 oz / 60 ml"), ("Maraschino liqueur", "1 oz / 30 ml"),
   ("Soda water", "8 oz / 240 ml"), ("Seasonal fruit", "1 cup, sliced"),
   ("Ice", "a large block")],
  ["Combine the brandy, curaçao, maraschino and fruit and chill for an hour.",
   "Set a large block of ice in a punch bowl.",
   "Pour the chilled mixture over it, then add the champagne slowly.",
   "Top with soda water and stir once, gently, from the bottom."],
  "Sliced fruit and mint", "built")

C("Badminton Cup", UK, "England", "Punch & Cobbler", "rare", "8-10%",
  "Claret with cucumber, sugar and soda. Named for the Gloucestershire house, not the game — and the game is named for the house too.",
  ["red wine", "cucumber", "soda"], "Punch bowl",
  ["Claret", "Cucumber", "Sugar", "Soda water"],
  "Badminton House gave its name to both the cup and the sport, which the Duke of Beaufort's guests are said to have invented indoors on a wet afternoon.",
  [("Claret", "1 bottle / 750 ml"), ("Cucumber", "1, peeled and sliced"),
   ("Caster sugar", "3 tbsp"), ("Nutmeg", "to grate"),
   ("Soda water", "1 pint / 500 ml, to top"), ("Ice", "a large block")],
  ["Put the cucumber slices, sugar and a grate of nutmeg in a bowl.",
   "Pour the claret over and leave it to steep, cold, for one hour.",
   "Strain out the cucumber and pour over a block of ice.",
   "Top with cold soda water and serve."],
  "Cucumber slices and grated nutmeg", "infused")

C("Chatham Artillery Punch", US, "Savannah, USA", "Punch & Cobbler", "rare", "20-22%",
  "Rye, brandy and rum under champagne. A militia punch with a reputation for ending evenings early.",
  ["citrus", "oak", "champagne", "tea"], "Punch bowl",
  ["Rye whiskey", "Brandy", "Rum", "Champagne"],
  "The Chatham Artillery is a Savannah militia unit founded in 1786, and the punch's reputation rests on its habit of tasting like fruit and drinking like three spirits.",
  [("Rye whiskey", "8 oz / 240 ml"), ("Brandy", "8 oz / 240 ml"),
   ("Dark rum", "8 oz / 240 ml"), ("Strong green tea", "8 oz / 240 ml"),
   ("Lemon juice", "6 oz / 180 ml"), ("Demerara sugar", "6 oz / 170 g"),
   ("Champagne", "1 bottle / 750 ml"), ("Ice", "a large block")],
  ["Dissolve the sugar in the lemon juice, then stir in the cooled tea.",
   "Add the three spirits and refrigerate for at least a day — it needs the rest.",
   "Set a block of ice in a punch bowl and pour the mixture over it.",
   "Add the champagne last, at the table, and grate nutmeg over the surface."],
  "Grated nutmeg and lemon wheels", "built")

# ================================================= COLLINSES, BUCKS, MULES

S("Mike Collins", US, NYC, "rare", "12-14%",
  "The Collins built on Irish whiskey. Same lemon, same soda, a softer spirit underneath.",
  ["irish whiskey", "lemon", "soda"],
  ["Irish whiskey", "Lemon juice", "Simple syrup", "Soda water"],
  "The Collins family is named once per base — John for whiskey, Tom for Old Tom gin, Mike for Irish, Pedro for rum, Pierre for cognac, Sandy for Scotch.",
  [("Irish whiskey", "2 oz / 60 ml"), ("Lemon juice", "1 oz / 30 ml"),
   ("Simple syrup", "0.5 oz / 15 ml"), ("Soda water", "3 oz / 90 ml, to top"),
   ("Ice", "cubed")],
  "A lemon wheel and a cherry",
  sub="Highball", glass="Collins glass",
  steps=["Shake the whiskey, lemon juice and syrup with ice.",
         "Strain into a Collins glass filled with fresh ice.",
         "Top with cold soda water.",
         "Stir once and garnish."])

S("Colonel Collins", US, NYC, "rare", "12-14%",
  "The bourbon Collins, named for the rank the South gives anyone who owns a distillery.",
  ["bourbon", "lemon", "soda", "vanilla"],
  ["Bourbon", "Lemon juice", "Simple syrup", "Soda water"],
  "Kentucky colonel is an honorary commission the state governor still hands out, and it has been given to distillers, astronauts and Muhammad Ali alike.",
  [("Bourbon", "2 oz / 60 ml"), ("Lemon juice", "1 oz / 30 ml"),
   ("Simple syrup", "0.5 oz / 15 ml"), ("Soda water", "3 oz / 90 ml, to top"),
   ("Ice", "cubed")],
  "A lemon wheel and a cherry",
  sub="Highball", glass="Collins glass",
  steps=["Shake the bourbon, lemon juice and syrup with ice.",
         "Strain into a Collins glass filled with fresh ice.",
         "Top with cold soda water.",
         "Stir once and garnish."])

B("Applejack Rickey", US, "Washington DC, USA", "Highball", "rare", "12-14%",
  "Apple brandy, lime and soda, with no sugar at all. A rickey is defined by what is missing.",
  ["apple", "lime", "soda"], "Highball glass",
  ["Applejack", "Lime juice", "Soda water"],
  "The rickey was made at Shoomaker's in Washington for the lobbyist Joe Rickey, and the original was bourbon; gin only took over later.",
  [("Applejack", "2 oz / 60 ml"), ("Lime", "half, juiced"),
   ("Soda water", "5 oz / 150 ml, to top"), ("Ice", "cubed")],
  ["Squeeze half a lime into a tall glass and drop the shell in.",
   "Fill with ice and add the applejack.",
   "Top with cold soda water.",
   "Stir once. Add no sugar — that would make it a Collins."],
  "The spent lime shell")

B("Gin Buck", UK, LDN, "Highball", "uncommon", "10-12%",
  "Gin, lemon and ginger ale. A buck is a rickey with ginger in place of soda, and lemon in place of lime.",
  ["ginger", "lemon", "juniper"], "Highball glass",
  ["Gin", "Lemon juice", "Ginger ale"],
  "Buck, mule and rickey are the same drink separated by mixer and citrus, and the names have been used interchangeably for a century by everyone except bartenders.",
  [("Gin", "2 oz / 60 ml"), ("Lemon juice", "0.5 oz / 15 ml"),
   ("Ginger ale", "5 oz / 150 ml, to top"), ("Ice", "cubed")],
  ["Fill a tall glass with ice.",
   "Add the gin and the lemon juice.",
   "Top with cold ginger ale.",
   "Stir once and hang a lemon wedge on the rim."],
  "A lemon wedge")

B("Whiskey Buck", US, NYC, "Highball", "rare", "10-12%",
  "Bourbon with lemon and ginger ale. The buck template on American whiskey.",
  ["bourbon", "ginger", "lemon"], "Highball glass",
  ["Bourbon", "Lemon juice", "Ginger ale"],
  "Ginger ale outsold every other American soft drink through the 1920s, largely because it was the one mixer that could hide bathtub spirits.",
  [("Bourbon", "2 oz / 60 ml"), ("Lemon juice", "0.5 oz / 15 ml"),
   ("Ginger ale", "5 oz / 150 ml, to top"), ("Ice", "cubed")],
  ["Fill a tall glass with ice.",
   "Add the bourbon and lemon juice.",
   "Top with cold ginger ale.",
   "Stir once and garnish with lemon."],
  "A lemon wedge")

B("London Buck", UK, LDN, "Highball", "rare", "10-12%",
  "Gin and ginger ale with a squeeze of lemon. The buck named after the gin rather than the spirit type.",
  ["juniper", "ginger", "lemon"], "Highball glass",
  ["London dry gin", "Lemon juice", "Ginger ale"],
  "London dry describes a production method rather than a place — it can legally be made anywhere, and most of the biggest brands are not made in London.",
  [("London dry gin", "2 oz / 60 ml"), ("Lemon juice", "0.5 oz / 15 ml"),
   ("Ginger ale", "5 oz / 150 ml, to top"), ("Ice", "cubed")],
  ["Fill a tall glass with ice.",
   "Add the gin and lemon juice.",
   "Top with ginger ale.",
   "Stir once and garnish with a lemon wedge."],
  "A lemon wedge")

B("Mexican Mule", US, NYC, "Highball", "uncommon", "12-14%",
  "Tequila, lime and ginger beer in a copper mug. The Moscow Mule with agave underneath.",
  ["agave", "ginger", "lime"], "Copper mug",
  ["Tequila", "Lime juice", "Ginger beer"],
  "The copper mug was a marketing device from the start — it was the vodka distributor's idea in the 1940s, and it does genuinely keep the drink colder.",
  [("Blanco tequila", "2 oz / 60 ml"), ("Lime juice", "0.75 oz / 22 ml"),
   ("Ginger beer", "4 oz / 120 ml, to top"), ("Ice", "cubed")],
  ["Fill a copper mug with ice.",
   "Add the tequila and lime juice.",
   "Top with cold ginger beer.",
   "Stir once and garnish with a lime wedge."],
  "A lime wedge and a mint sprig")

B("Kentucky Mule", US, "Kentucky, USA", "Highball", "uncommon", "12-14%",
  "Bourbon, lime and ginger beer. The mule with the vanilla and oak of a Kentucky barrel behind it.",
  ["bourbon", "ginger", "lime", "vanilla"], "Copper mug",
  ["Bourbon", "Lime juice", "Ginger beer"],
  "Bourbon must be aged in new charred oak, which is why it gives up so much vanilla so fast and why the barrels are then sold on to Scotland.",
  [("Bourbon", "2 oz / 60 ml"), ("Lime juice", "0.75 oz / 22 ml"),
   ("Ginger beer", "4 oz / 120 ml, to top"), ("Ice", "cubed")],
  ["Fill a copper mug with ice.",
   "Add the bourbon and lime juice.",
   "Top with cold ginger beer.",
   "Stir once and garnish."],
  "A lime wedge and a mint sprig")

# ============================================================ HAVANA

S("Nacional", "Cuba", "Havana, Cuba", "rare", "20-22%",
  "Rum, apricot and lime from the Hotel Nacional, which has been pouring it since 1930.",
  ["apricot", "lime", "rum"],
  ["White rum", "Apricot brandy", "Lime juice"],
  "The Hotel Nacional opened in 1930 and its bar survived the revolution intact — the drink is still on the menu, in the same room.",
  [("White rum", "2 oz / 60 ml"), ("Apricot brandy", "0.75 oz / 22 ml"),
   ("Lime juice", "0.75 oz / 22 ml"), ("Simple syrup", "0.25 oz / 7 ml"),
   ("Ice", "cubed")],
  "A lime wheel")

S("Isle of Pines", "Cuba", "Havana, Cuba", "rare", "18-20%",
  "Rum, grapefruit and mint from the Cuban island now called Isla de la Juventud.",
  ["grapefruit", "mint", "rum"],
  ["White rum", "Grapefruit juice", "Mint", "Simple syrup"],
  "The Isle of Pines was disputed between Cuba and the United States until 1925 and is where Fidel Castro was imprisoned before the revolution he later won.",
  [("White rum", "2 oz / 60 ml"), ("Grapefruit juice", "1 oz / 30 ml"),
   ("Simple syrup", "0.5 oz / 15 ml"), ("Mint leaves", "8"),
   ("Ice", "cubed")],
  "A mint sprig")

# ======================================================== THE CRAFT ERA

S("Gin Blossom", US, NYC, "uncommon", "22-24%",
  "Gin, apricot eau-de-vie and dry vermouth, stirred and given a long stretch of orange peel.",
  ["apricot", "juniper", "orange"],
  ["Gin", "Apricot eau-de-vie", "Dry vermouth", "Orange bitters"],
  "Julie Reiner built it at the Clover Club in Brooklyn, and the eau-de-vie is doing something a liqueur cannot — it brings apricot without bringing sugar.",
  [("Gin", "1.5 oz / 45 ml"), ("Apricot eau-de-vie", "0.5 oz / 15 ml"),
   ("Dry vermouth", "1 oz / 30 ml"), ("Orange bitters", "1 dash"),
   ("Ice", "cubed")],
  "A long orange twist", method="stirred",
  steps=["Stir all ingredients with ice until very cold.",
         "Strain into a chilled coupe.",
         "Cut a long strip of orange peel and express it over the surface.",
         "Drop the peel in and serve."])

S("Industry Sour", US, NYC, "rare", "24-26%",
  "Green Chartreuse and Fernet-Branca with lime and sugar. Made by bartenders, for bartenders, at the end of a shift.",
  ["herbal", "menthol", "lime", "bitter"],
  ["Green Chartreuse", "Fernet-Branca", "Lime juice", "Simple syrup"],
  "Joaquín Simó built it at Death and Co, and the name is literal — it is the drink the trade orders when the guests have finally gone home.",
  [("Green Chartreuse", "1.5 oz / 45 ml"), ("Fernet-Branca", "0.75 oz / 22 ml"),
   ("Lime juice", "0.75 oz / 22 ml"), ("Simple syrup", "0.5 oz / 15 ml"),
   ("Ice", "cubed")],
  "A lime wheel")

T("Trident", US, "Seattle, USA", "rare", "18-20%",
  "Aquavit, Cynar and dry sherry with peach bitters. A Negroni rebuilt from Scandinavian and Italian parts.",
  ["caraway", "artichoke", "nutty sherry", "peach"],
  ["Aquavit", "Cynar", "Dry sherry", "Peach bitters"],
  "Robert Hess designed it as a deliberate Negroni analogue — same equal-parts skeleton, three substitutions, and nothing of the original left in the glass.",
  [("Aquavit", "1 oz / 30 ml"), ("Cynar", "1 oz / 30 ml"),
   ("Fino sherry", "1 oz / 30 ml"), ("Peach bitters", "2 dashes"),
   ("Ice", "cubed")],
  "A lemon twist")

T("Slope", US, "Brooklyn, USA", "rare", "24-26%",
  "Rye, sweet vermouth and apricot. One of the Brooklyn drinks named for the neighbourhoods around the bar that made them.",
  ["rye", "apricot", "sweet vermouth"],
  ["Rye whiskey", "Punt e Mes", "Apricot liqueur"],
  "Milk and Honey's staff named a whole run of Manhattan variations after Brooklyn neighbourhoods — Red Hook, Greenpoint, Bensonhurst, Carroll Gardens and this one.",
  [("Rye whiskey", "2 oz / 60 ml"), ("Punt e Mes", "0.75 oz / 22 ml"),
   ("Apricot liqueur", "0.25 oz / 7 ml"), ("Ice", "cubed")],
  "A cherry")

FL("Fort Washington Flip", US, NYC, "rare", "18-20%",
   "Applejack and maple with a whole egg. A flip built entirely out of things that grow in the northeast.",
   ["apple", "maple", "egg", "nutmeg"],
   ["Applejack", "Maple syrup", "Whole egg"],
   "Chad Solomon named it for the Manhattan neighbourhood, and it is one of the few modern drinks to take the whole-egg flip seriously rather than as a novelty.",
   [("Applejack", "2 oz / 60 ml"), ("Maple syrup", "0.5 oz / 15 ml"),
    ("Whole egg", "1"), ("Ice", "cubed")])

FL("Coffee Flip", UK, LDN, "rare", "16-18%",
   "Cold coffee, port and a whole egg. The Coffee Cocktail with the coffee it was always missing.",
   ["coffee", "port", "egg", "nutmeg"],
   ["Cold brew coffee", "Tawny port", "Whole egg"],
   "The classic Coffee Cocktail contains no coffee at all — it is port, brandy and egg, and it earned the name purely from how it looks in the glass.",
   [("Cold brew coffee", "1 oz / 30 ml"), ("Tawny port", "1.5 oz / 45 ml"),
    ("Brandy", "0.5 oz / 15 ml"), ("Whole egg", "1"),
    ("Simple syrup", "0.5 oz / 15 ml"), ("Ice", "cubed")])

# =============================================================== TIKI

S("Scorpion", US, "California, USA", "uncommon", "18-20%",
  "Rum and brandy with orgeat and citrus, blended and served for several people out of one bowl.",
  ["orgeat", "orange", "rum", "almond"],
  ["White rum", "Brandy", "Orgeat", "Orange juice"],
  "Trader Vic's version is a bowl drink with a gardenia floating in the middle, and the flower is specified in the original recipe as seriously as the rum is.",
  [("White rum", "2 oz / 60 ml"), ("Brandy", "1 oz / 30 ml"),
   ("Orange juice", "2 oz / 60 ml"), ("Lemon juice", "1 oz / 30 ml"),
   ("Orgeat", "0.75 oz / 22 ml"), ("Ice", "1 cup, crushed")],
  "A gardenia, or a mint sprig and an orange wheel",
  sub="Tiki & Tropical", glass="Scorpion bowl", method="blended",
  steps=["Put everything in a blender with crushed ice.",
         "Blend on high for five seconds only — it should stay loose, not slushy.",
         "Pour into a scorpion bowl or a large tiki mug.",
         "Float a gardenia in the centre if you can get one."])

S("Q.B. Cooler", US, "California, USA", "rare", "18-20%",
  "Three rums with honey, ginger, lime and orange. The drink the Mai Tai was reverse-engineered from.",
  ["ginger", "honey", "lime", "rum"],
  ["Rum", "Honey", "Ginger", "Lime juice"],
  "Trader Vic tasted this at Don the Beachcomber's, could not get the recipe, and built the Mai Tai partly out of what he thought was in it.",
  [("Gold rum", "1 oz / 30 ml"), ("Dark Jamaican rum", "1 oz / 30 ml"),
   ("Demerara rum", "0.5 oz / 15 ml"), ("Lime juice", "0.75 oz / 22 ml"),
   ("Orange juice", "0.75 oz / 22 ml"), ("Honey syrup", "0.5 oz / 15 ml"),
   ("Ginger syrup", "0.5 oz / 15 ml"), ("Angostura bitters", "1 dash"),
   ("Soda water", "1 oz / 30 ml"), ("Ice", "crushed")],
  "A mint sprig",
  sub="Tiki & Tropical", glass="Tiki mug", method="blended",
  steps=["Flash-blend everything but the soda with a scoop of crushed ice for five seconds.",
         "Pour unstrained into a tall tiki mug.",
         "Add the soda water and top with more crushed ice.",
         "Crown with a dense mint sprig."])

S("Ancient Mariner", US, "California, USA", "rare", "20-22%",
  "Two rums with grapefruit, lime and allspice. A modern tiki drink built to look like an old one.",
  ["allspice", "grapefruit", "lime", "rum"],
  ["Demerara rum", "Dark Jamaican rum", "Allspice dram", "Grapefruit juice"],
  "Jeff Berry created it in the 1990s while reconstructing lost Don the Beachcomber recipes, and named it for the Coleridge poem rather than any bar.",
  [("Demerara rum", "1 oz / 30 ml"), ("Dark Jamaican rum", "1 oz / 30 ml"),
   ("Grapefruit juice", "0.75 oz / 22 ml"), ("Lime juice", "0.75 oz / 22 ml"),
   ("Allspice dram", "0.5 oz / 15 ml"), ("Simple syrup", "0.5 oz / 15 ml"),
   ("Ice", "crushed")],
  "A mint sprig and a lime wheel",
  sub="Tiki & Tropical", glass="Tiki mug", method="blended",
  steps=["Flash-blend everything with a scoop of crushed ice for five seconds.",
         "Pour unstrained into a tiki mug.",
         "Fill to the top with more crushed ice.",
         "Garnish with mint and a lime wheel."])
