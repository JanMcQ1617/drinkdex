# -*- coding: utf-8 -*-
"""The last genuine gaps: three IBA officials, one country, and eight
classics the earlier probes missed."""
from ck import S, T, B, C

US, UK = "USA", "United Kingdom"
NYC, LDN = "New York City, USA", "London, England"

# ================================================== IBA OFFICIAL GAPS

S("Bacardi Cocktail", "Cuba", "Santiago de Cuba, Cuba", "uncommon", "20-22%",
  "Rum, lime and grenadine. A Daiquiri with grenadine, and the only cocktail a court has ruled on the recipe of.",
  ["lime", "pomegranate", "rum"],
  ["White rum", "Lime juice", "Grenadine"],
  "In 1936 the New York Supreme Court held that a Bacardi Cocktail must be made with Bacardi rum, which remains the only time a court has specified a cocktail's brand.",
  [("Bacardi white rum", "2 oz / 60 ml"), ("Lime juice", "0.75 oz / 22 ml"),
   ("Grenadine", "0.5 oz / 15 ml"), ("Ice", "cubed")],
  "A lime wheel")

S("New York Sour", US, "Chicago, USA", "uncommon", "18-20%",
  "A whiskey sour with a float of red wine sitting on top of it. The two layers are meant to be drunk together.",
  ["rye", "lemon", "red wine", "tannin"],
  ["Rye whiskey", "Lemon juice", "Simple syrup", "Red wine"],
  "It is generally traced to 1880s Chicago rather than New York, and was called a Continental Sour and a Claret Snap before the name that stuck.",
  [("Rye whiskey", "2 oz / 60 ml"), ("Lemon juice", "0.75 oz / 22 ml"),
   ("Simple syrup", "0.5 oz / 15 ml"), ("Egg white", "1, optional"),
   ("Dry red wine", "0.5 oz / 15 ml, to float"), ("Ice", "cubed")],
  "The wine float itself",
  glass="Rocks glass",
  steps=["Shake the whiskey, lemon juice and syrup with ice.",
         "Strain into a rocks glass over one large cube.",
         "Pour the red wine slowly over the back of a barspoon so it sits on the surface.",
         "Serve without stirring — the layers combine as you drink."])

S("Spicy Fifty", UK, LDN, "uncommon", "20-22%",
  "Vodka with elderflower, honey and lime, and a slice of red chilli shaken through it.",
  ["elderflower", "chilli", "honey", "lime"],
  ["Vodka", "Elderflower cordial", "Honey", "Lime juice"],
  "Salvatore Calabrese built it at Fifty St James in London, and it is one of very few modern drinks the IBA has taken into its official list.",
  [("Vanilla vodka", "2 oz / 60 ml"), ("Elderflower cordial", "0.5 oz / 15 ml"),
   ("Honey syrup", "0.5 oz / 15 ml"), ("Lime juice", "0.5 oz / 15 ml"),
   ("Red chilli", "2 thin slices"), ("Ice", "cubed")],
  "A red chilli slice",
  steps=["Put the chilli slices in the shaker and press them once — no more.",
         "Add everything else with ice and shake hard.",
         "Double-strain into a chilled coupe so no chilli comes through.",
         "Float a single thin slice of chilli on the surface."])

# ================================================================ SLOVENIA

B("Špricer", "Slovenia", "Slovenia", "Spritz", "common", "6-8%",
  "White wine and sparkling water, half and half. Slovenia's everyday drink, and ordering it is not a compromise.",
  ["white wine", "soda", "citrus"], "Tumbler",
  ["White wine", "Sparkling water"],
  "It is poured at weddings, on building sites and in wine bars without any change in status — the same glass, the same ratio, no apology for diluting good wine.",
  [("Dry white wine", "4 oz / 120 ml"),
   ("Sparkling water", "4 oz / 120 ml"), ("Ice", "optional")],
  ["Pour the wine into a plain tumbler.",
   "Add an equal measure of cold sparkling water.",
   "Ice is optional and often left out entirely.",
   "Serve immediately, while it still has its bubble."],
  "None")

# =========================================================== THE CLASSICS

S("Southside Fizz", US, NYC, "uncommon", "14-16%",
  "The Southside lengthened with soda. Gin, lime and mint, made long.",
  ["mint", "lime", "juniper", "soda"],
  ["Gin", "Lime juice", "Mint", "Soda water"],
  "The 21 Club and Chicago's South Side both claim it, and the Prohibition story that the rougher South Side gin needed mint to hide it is almost certainly invented.",
  [("Gin", "2 oz / 60 ml"), ("Lime juice", "0.75 oz / 22 ml"),
   ("Simple syrup", "0.5 oz / 15 ml"), ("Mint leaves", "8"),
   ("Soda water", "3 oz / 90 ml, to top"), ("Ice", "cubed")],
  "A mint sprig",
  sub="Fizz", glass="Highball glass",
  steps=["Shake the gin, lime, syrup and mint hard with ice.",
         "Double-strain into a tall glass over fresh ice.",
         "Top with cold soda water.",
         "Crown with a mint sprig."])

S("Army and Navy", US, "Washington DC, USA", "uncommon", "20-22%",
  "Gin, lemon and orgeat. The almond does all the work that sugar would otherwise do.",
  ["almond", "lemon", "juniper"],
  ["Gin", "Lemon juice", "Orgeat"],
  "Orgeat is an almond syrup thinned with orange flower water, and it brings texture as well as sweetness — which is why the drink tastes fuller than three ingredients should.",
  [("Gin", "2 oz / 60 ml"), ("Lemon juice", "0.75 oz / 22 ml"),
   ("Orgeat", "0.5 oz / 15 ml"), ("Angostura bitters", "1 dash"),
   ("Ice", "cubed")],
  "A lemon twist")

S("Honeysuckle", US, NYC, "uncommon", "20-22%",
  "Rum, lime and honey. A Daiquiri with honey instead of sugar, and rounder for it.",
  ["honey", "lime", "rum"],
  ["White rum", "Lime juice", "Honey"],
  "Honey will not dissolve in a cold drink and has to be loosened with warm water first — the step every recipe assumes and no recipe prints.",
  [("White rum", "2 oz / 60 ml"), ("Lime juice", "0.75 oz / 22 ml"),
   ("Honey syrup", "0.5 oz / 15 ml"), ("Ice", "cubed")],
  "A lime wheel")

S("Petite Fleur", UK, LDN, "rare", "20-22%",
  "Rum, Cointreau and grapefruit in equal parts. Small, sharp and almost forgotten.",
  ["grapefruit", "orange", "rum"],
  ["White rum", "Cointreau", "Grapefruit juice"],
  "Equal-parts drinks were the house style of the 1930s because they were easy to teach and easy to pour fast, not because anyone thought thirds were ideal.",
  [("White rum", "1 oz / 30 ml"), ("Cointreau", "1 oz / 30 ml"),
   ("Grapefruit juice", "1 oz / 30 ml"), ("Ice", "cubed")],
  "A grapefruit twist")

T("Ideal Cocktail", UK, LDN, "rare", "24-26%",
  "Gin and dry vermouth with grapefruit and maraschino. A Martini with fruit in it, which is less alarming than it sounds.",
  ["grapefruit", "juniper", "cherry"],
  ["Gin", "Dry vermouth", "Grapefruit juice", "Maraschino liqueur"],
  "Grapefruit was a novelty ingredient in 1930s London — commercial cultivation had barely started, and it appears in the Savoy far more often than in any book before it.",
  [("Gin", "1.5 oz / 45 ml"), ("Dry vermouth", "1 oz / 30 ml"),
   ("Grapefruit juice", "0.5 oz / 15 ml"), ("Maraschino liqueur", "0.25 tsp"),
   ("Ice", "cubed")],
  "A cherry")

S("Marmalade Cocktail", UK, LDN, "rare", "18-20%",
  "Gin shaken with a spoonful of orange marmalade and lemon. The bitterness of the peel is the whole point.",
  ["marmalade", "bitter orange", "lemon", "juniper"],
  ["Gin", "Orange marmalade", "Lemon juice"],
  "Craddock recommends it before lunch specifically, on the grounds that the bitterness in the peel is an appetiser rather than a flavour.",
  [("Gin", "2 oz / 60 ml"), ("Orange marmalade", "1 heaped tsp"),
   ("Lemon juice", "0.75 oz / 22 ml"), ("Ice", "cubed")],
  "A strip of orange peel",
  steps=["Stir the marmalade into the gin in the shaker until it starts to break up.",
         "Add the lemon juice and ice and shake hard for 15 seconds.",
         "Double-strain to catch the shreds of peel.",
         "Garnish with a strip of orange peel."])

T("Shamrock", UK, LDN, "rare", "24-26%",
  "Irish whiskey with dry vermouth, green Chartreuse and crème de menthe. Green, herbal and stronger than it looks.",
  ["mint", "herbal", "irish whiskey"],
  ["Irish whiskey", "Dry vermouth", "Green Chartreuse", "Crème de menthe"],
  "Green Chartreuse and crème de menthe in the same glass is a lot of mint, which is why the measures are so small and why the drink survives at all.",
  [("Irish whiskey", "1.5 oz / 45 ml"), ("Dry vermouth", "1.5 oz / 45 ml"),
   ("Green Chartreuse", "3 dashes"), ("Green crème de menthe", "3 dashes"),
   ("Ice", "cubed")],
  "An olive, in the original")

T("Blarney Stone", UK, LDN, "rare", "28-30%",
  "Irish whiskey with absinthe, curaçao and maraschino. The Savoy's most crowded Irish drink.",
  ["anise", "orange", "cherry", "irish whiskey"],
  ["Irish whiskey", "Absinthe", "Orange curaçao", "Maraschino liqueur"],
  "Kissing the Blarney Stone at Cork's Castle Blarney is supposed to grant eloquence, which is a reasonable claim to make about this much whiskey too.",
  [("Irish whiskey", "2 oz / 60 ml"), ("Absinthe", "0.25 tsp"),
   ("Orange curaçao", "0.25 tsp"), ("Maraschino liqueur", "0.25 tsp"),
   ("Angostura bitters", "1 dash"), ("Ice", "cubed")],
  "An orange twist and an olive")
