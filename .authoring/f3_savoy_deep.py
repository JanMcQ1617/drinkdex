from ck import S, T, C

UK = "United Kingdom"
LDN = "London, England"
US = "USA"
NYC = "New York City, USA"

T("Attention", UK, LDN, "rare", "24-26%",
  "Absinthe, gin, violet and dry vermouth in equal parts. Pale lilac, and considerably stranger than it looks.",
  ["anise", "violet", "juniper"],
  ["Absinthe", "Gin", "Crème de violette", "Dry vermouth"],
  "The Savoy prints a whole run of equal-parts absinthe cocktails from the years just after it came back to European bars, and this is the prettiest of them.",
  [("Absinthe", "0.75 oz / 22 ml"), ("Gin", "0.75 oz / 22 ml"),
   ("Crème de violette", "0.75 oz / 22 ml"), ("Dry vermouth", "0.75 oz / 22 ml"),
   ("Orange bitters", "2 dashes"), ("Ice", "cubed")],
  "A lemon twist")

S("Bennett", UK, LDN, "rare", "22-24%",
  "A Gimlet with bitters in it. That one addition changes the whole balance of the drink.",
  ["lime", "juniper", "bitters"],
  ["Gin", "Lime juice", "Simple syrup", "Angostura bitters"],
  "Two dashes of Angostura is the entire difference between this and a Gin Rickey served up, which is a fair summary of how the old books drew their distinctions.",
  [("Gin", "2 oz / 60 ml"), ("Lime juice", "0.75 oz / 22 ml"),
   ("Simple syrup", "0.5 oz / 15 ml"), ("Angostura bitters", "2 dashes"),
   ("Ice", "cubed")],
  "A lime twist")

S("Colony", US, NYC, "rare", "18-20%",
  "Gin, grapefruit and maraschino. Named for the Manhattan restaurant where being seated badly was a public event.",
  ["grapefruit", "cherry", "juniper"],
  ["Gin", "Grapefruit juice", "Maraschino liqueur"],
  "The Colony's headwaiter Gene Cavallero was famous for seating people by status rather than reservation, which made the front room the most contested real estate in the city.",
  [("Gin", "1.5 oz / 45 ml"), ("Grapefruit juice", "1 oz / 30 ml"),
   ("Maraschino liqueur", "0.5 oz / 15 ml"), ("Ice", "cubed")],
  "A grapefruit twist")

S("Commodore", US, NYC, "rare", "20-22%",
  "Rye with lemon, grenadine and orange bitters. A sour with a red tint and a dry finish.",
  ["rye", "lemon", "pomegranate"],
  ["Rye whiskey", "Lemon juice", "Grenadine", "Orange bitters"],
  "Real grenadine is pomegranate syrup, not red sugar water, and in a drink this simple the difference between the two is the whole drink.",
  [("Rye whiskey", "2 oz / 60 ml"), ("Lemon juice", "0.75 oz / 22 ml"),
   ("Grenadine", "0.5 oz / 15 ml"), ("Orange bitters", "2 dashes"),
   ("Ice", "cubed")],
  "A lemon twist")

T("Duchess", UK, LDN, "rare", "22-24%",
  "Absinthe with both vermouths, in thirds. No base spirit at all — the absinthe is the base.",
  ["anise", "wormwood", "vermouth"],
  ["Absinthe", "Dry vermouth", "Sweet vermouth"],
  "Absinthe was banned across most of Europe and America when this was written down, which is exactly why the drinks that used it read as daring rather than quaint.",
  [("Absinthe", "1 oz / 30 ml"), ("Dry vermouth", "1 oz / 30 ml"),
   ("Sweet vermouth", "1 oz / 30 ml"), ("Ice", "cubed")],
  "A lemon twist")

T("Earthquake", UK, LDN, "rare", "40-42%",
  "Gin, whisky and absinthe in equal measure. The name is a warning, not a flourish.",
  ["anise", "juniper", "malt"],
  ["Gin", "Whisky", "Absinthe"],
  "Toulouse-Lautrec drank a version of this made from cognac and absinthe and called it tremblement de terre, which the London version borrowed and then made worse.",
  [("Gin", "1 oz / 30 ml"), ("Whisky", "1 oz / 30 ml"),
   ("Absinthe", "1 oz / 30 ml"), ("Ice", "cubed")],
  "None", glass="Small coupe")

T("Fourth Degree", UK, LDN, "rare", "24-26%",
  "Gin with both vermouths and a rinse of absinthe. A Perfect Martini with the corners taken off.",
  ["anise", "juniper", "vermouth"],
  ["Gin", "Dry vermouth", "Sweet vermouth", "Absinthe"],
  "Splitting the vermouth between dry and sweet is what bartenders call perfect, a term that predates the Martini and applies to any drink built this way.",
  [("Gin", "1.5 oz / 45 ml"), ("Dry vermouth", "0.75 oz / 22 ml"),
   ("Sweet vermouth", "0.75 oz / 22 ml"), ("Absinthe", "4 dashes"),
   ("Ice", "cubed")],
  "A lemon twist")

T("Gin and It", UK, LDN, "uncommon", "26-28%",
  "Gin and Italian vermouth, at room temperature and without ice. The Martini before refrigeration reached the bar.",
  ["juniper", "sweet vermouth", "warmth"],
  ["Gin", "Sweet vermouth"],
  "It is served warm on purpose — the drink dates from London bars that had no reliable ice, and chilling it turns it into something else entirely.",
  [("Gin", "1.5 oz / 45 ml"), ("Sweet vermouth", "1.5 oz / 45 ml")],
  "A cherry", glass="Small coupe",
  steps=["Pour the gin and the sweet vermouth straight into a small glass.",
         "Stir them together briefly with a barspoon.",
         "Add no ice and do not chill the glass.",
         "Drop in a cherry and serve."])

T("Grand Slam", UK, LDN, "rare", "20-22%",
  "Swedish punsch with both vermouths. Sweet, spiced and almost entirely forgotten.",
  ["arrack", "spice", "vermouth"],
  ["Swedish punsch", "Dry vermouth", "Sweet vermouth"],
  "Swedish punsch is built on Batavian arrack shipped from Java, which is how an Indonesian spirit ended up defining a Scandinavian liqueur.",
  [("Swedish punsch", "1.5 oz / 45 ml"), ("Dry vermouth", "0.75 oz / 22 ml"),
   ("Sweet vermouth", "0.75 oz / 22 ml"), ("Ice", "cubed")],
  "A lemon twist")

S("Hoop La", UK, LDN, "rare", "20-22%",
  "Equal parts Lillet, Cointreau, brandy and lemon. A Corpse Reviver with brandy where the gin should be.",
  ["orange", "lemon", "cognac"],
  ["Lillet Blanc", "Cointreau", "Brandy", "Lemon juice"],
  "It shares its skeleton exactly with the Corpse Reviver No. 2 — four equal parts, one of them citrus — which is the most reliable template in the whole Savoy book.",
  [("Lillet Blanc", "0.75 oz / 22 ml"), ("Cointreau", "0.75 oz / 22 ml"),
   ("Brandy", "0.75 oz / 22 ml"), ("Lemon juice", "0.75 oz / 22 ml"),
   ("Ice", "cubed")],
  "A lemon twist")

S("Maiden's Blush", UK, LDN, "rare", "22-24%",
  "Gin with curaçao, grenadine and lemon. Named for its colour, which is the palest possible pink.",
  ["orange", "pomegranate", "lemon", "juniper"],
  ["Gin", "Orange curaçao", "Grenadine", "Lemon juice"],
  "The Savoy prints two different drinks under this name, one with curaçao and one with absinthe, and gives no hint as to which came first.",
  [("Gin", "1.5 oz / 45 ml"), ("Orange curaçao", "0.5 oz / 15 ml"),
   ("Grenadine", "0.25 oz / 7 ml"), ("Lemon juice", "0.5 oz / 15 ml"),
   ("Ice", "cubed")],
  "A lemon twist")

S("Moonlight", UK, LDN, "rare", "20-22%",
  "Kirsch, grapefruit and sugar. Three ingredients, dry as a bone, and nothing like as sweet as cherry brandy suggests.",
  ["cherry stone", "grapefruit", "almond"],
  ["Kirsch", "Grapefruit juice", "Sugar"],
  "Kirsch is distilled with the cherry stones left in, which is where its faint bitter-almond edge comes from and why it is not a sweet liqueur.",
  [("Kirsch", "1.5 oz / 45 ml"), ("Grapefruit juice", "1.5 oz / 45 ml"),
   ("Simple syrup", "0.25 oz / 7 ml"), ("Ice", "cubed")],
  "A grapefruit twist")

T("Nineteen Twenty", UK, LDN, "rare", "24-26%",
  "Kirsch, gin and sweet vermouth in thirds. A Martini with cherry stones running through it.",
  ["cherry stone", "juniper", "sweet vermouth"],
  ["Kirsch", "Gin", "Sweet vermouth"],
  "Drinks named for years cluster around 1920 in the old books, and almost all of them were invented in Europe by American bartenders who had just left home.",
  [("Kirsch", "1 oz / 30 ml"), ("Gin", "1 oz / 30 ml"),
   ("Sweet vermouth", "1 oz / 30 ml"), ("Orange bitters", "2 dashes"),
   ("Ice", "cubed")],
  "A lemon twist")

C("Prince of Wales", UK, LDN, "Sparkling", "rare", "18-20%",
  "Rye, maraschino and pineapple under champagne, and attributed to a king who liked his drinks complicated.",
  ["pineapple", "rye", "cherry", "champagne"], "Flute",
  ["Rye whiskey", "Maraschino liqueur", "Pineapple", "Champagne"],
  "The recipe is credited to Edward VII from his years as Prince of Wales, a period he spent building a reputation that made the attribution entirely plausible.",
  [("Rye whiskey", "1.5 oz / 45 ml"), ("Maraschino liqueur", "1 tsp"),
   ("Angostura bitters", "1 dash"), ("Pineapple", "1 small piece"),
   ("Champagne", "2 oz / 60 ml, to top"), ("Ice", "cubed")],
  ["Muddle the pineapple with the maraschino and bitters in a shaker.",
   "Add the rye and ice, and shake hard.",
   "Double-strain into a chilled flute.",
   "Top with champagne and add an orange twist."],
  "An orange twist", "shaken")

T("Rose Cocktail", "France", "Paris, France", "rare", "20-22%",
  "Kirsch, dry vermouth and raspberry. The one drink Paris gave the cocktail canon that London did not immediately claim.",
  ["raspberry", "cherry stone", "dry vermouth"],
  ["Kirsch", "Dry vermouth", "Raspberry syrup"],
  "It is credited to Johnny Mitta at the Chatham Hotel in Paris around 1920, and became the most-ordered drink in the city for most of that decade.",
  [("Dry vermouth", "1.5 oz / 45 ml"), ("Kirsch", "1 oz / 30 ml"),
   ("Raspberry syrup", "0.5 oz / 15 ml"), ("Ice", "cubed")],
  "A cherry")

S("Soul Kiss", UK, LDN, "rare", "16-18%",
  "Dubonnet, dry vermouth, rye and orange juice. Low, aromatic and easier than its name suggests.",
  ["orange", "quinine", "rye"],
  ["Dubonnet", "Dry vermouth", "Rye whiskey", "Orange juice"],
  "Dubonnet was created in 1846 to make quinine palatable to French soldiers in North Africa, which is a strange origin for something this gentle.",
  [("Dubonnet", "0.75 oz / 22 ml"), ("Dry vermouth", "0.75 oz / 22 ml"),
   ("Rye whiskey", "0.75 oz / 22 ml"), ("Orange juice", "0.75 oz / 22 ml"),
   ("Ice", "cubed")],
  "An orange twist")

S("Southern Bride", UK, LDN, "rare", "18-20%",
  "Gin, grapefruit and a bar spoon of maraschino. The Colony's shape with the proportions moved.",
  ["grapefruit", "juniper", "cherry"],
  ["Gin", "Grapefruit juice", "Maraschino liqueur"],
  "Maraschino is measured in barspoons rather than ounces for good reason — it is made from whole crushed Marasca cherries, stones included, and takes over a drink quickly.",
  [("Gin", "2 oz / 60 ml"), ("Grapefruit juice", "1 oz / 30 ml"),
   ("Maraschino liqueur", "1 tsp"), ("Ice", "cubed")],
  "A grapefruit twist")

S("Stanley", UK, LDN, "rare", "20-22%",
  "Gin and rum together, with lemon and grenadine. Two base spirits in one glass, which the old books did far more often than modern ones.",
  ["lemon", "pomegranate", "juniper", "rum"],
  ["Gin", "White rum", "Lemon juice", "Grenadine"],
  "Split-base drinks were routine before Prohibition and became unfashionable afterwards, largely because they are harder to sell than a drink named after one bottle.",
  [("Gin", "1 oz / 30 ml"), ("White rum", "1 oz / 30 ml"),
   ("Lemon juice", "0.75 oz / 22 ml"), ("Grenadine", "0.5 oz / 15 ml"),
   ("Ice", "cubed")],
  "A lemon twist")

S("Ward Eight", US, "Boston, USA", "uncommon", "20-22%",
  "Rye with lemon, orange and grenadine. Made in Boston on an election night, for a man who had not won yet.",
  ["rye", "lemon", "orange", "pomegranate"],
  ["Rye whiskey", "Lemon juice", "Orange juice", "Grenadine"],
  "The story places it at Locke-Ober in 1898, mixed for Martin Lomasney's ward on the night of a vote that had not been counted — celebrating early, and correctly.",
  [("Rye whiskey", "2 oz / 60 ml"), ("Lemon juice", "0.5 oz / 15 ml"),
   ("Orange juice", "0.5 oz / 15 ml"), ("Grenadine", "0.5 oz / 15 ml"),
   ("Ice", "cubed")],
  "An orange slice and a cherry", glass="Rocks glass")

T("Whist", UK, LDN, "rare", "22-24%",
  "Applejack, rum and sweet vermouth. Named for the card game bridge was built out of.",
  ["apple", "rum", "sweet vermouth"],
  ["Applejack", "White rum", "Sweet vermouth"],
  "Whist ruled English card tables for two centuries before bridge displaced it, which dates the naming convention as precisely as anything in the book.",
  [("Applejack", "1.5 oz / 45 ml"), ("White rum", "0.75 oz / 22 ml"),
   ("Sweet vermouth", "0.75 oz / 22 ml"), ("Ice", "cubed")],
  "A lemon twist")

C("Yale Cocktail", US, NYC, "Modern Classic", "rare", "26-28%",
  "A Martini stained blue, with bitters and a splash of soda. The colour is the entire reason it exists.",
  ["juniper", "violet", "dry vermouth"], "Coupe glass",
  ["Gin", "Dry vermouth", "Crème de violette", "Orange bitters"],
  "The blue was originally Crème Yvette, an American violet liqueur that went out of production in 1969 and did not come back until 2009.",
  [("Gin", "2 oz / 60 ml"), ("Dry vermouth", "0.5 oz / 15 ml"),
   ("Crème de violette", "1 tsp"), ("Orange bitters", "2 dashes"),
   ("Soda water", "splash"), ("Ice", "cubed")],
  ["Stir the gin, vermouth, violette and bitters with ice until very cold.",
   "Strain into a chilled coupe.",
   "Add a short splash of soda water.",
   "Twist a lemon peel over the surface and drop it in."],
  "A lemon twist", "stirred")
