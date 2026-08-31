"""Compact authoring for cocktail Dex entries. Scratch tooling."""
import json, os, re, unicodedata

R = []
SUBCATS = {"Brunch","Creamy & Dessert","Fizz","Frozen","Highball","Hot",
           "Julep & Cobbler","Modern Classic","Party","Punch & Cobbler",
           "Regional","Retro","Shot","Sour","Sparkling","Spirit-Forward",
           "Spritz","Tiki","Tiki & Tropical"}
RAR = {"common","uncommon","rare","legendary"}
METH = {"shaken","stirred","built","blended","thrown","layered","muddled",
        "swizzled","boiled","infused"}

def slug(n):
    s = unicodedata.normalize("NFKD", n)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = (s.replace("&"," and ").replace("'","").replace("’","")
          .replace("ø","o").replace("ł","l").replace("ß","ss"))
    return re.sub(r"[^a-zA-Z0-9]+","-",s).strip("-").lower()

# Sipply is an alcohol app. 45 alcohol-free entries reached a source file
# before anyone noticed: the merge gate and the prune script both catch them
# downstream, and nothing caught them at construction. This is that layer.
#
# The obvious test — does the abv string start with "0" — is wrong twice over.
# It rejects a legitimate "0.5%" session strength, and it waves through
# "alcohol-free" and "<0.5%" because neither begins with a zero. So parse the
# numbers out and test a threshold.
#
# THE THRESHOLD IS 0.5% AND THAT IS A DELIBERATE CHOICE. It is the line most
# jurisdictions draw between alcoholic and not. A range must clear it at its
# LOW end: "0–8%" is rejected, because a drink that can be poured at zero is
# one people order as a soft drink (Chapman and Gunner both were). A drink at
# "0.5–1.5%" passes, which is exactly the Kvass case — genuinely borderline,
# and better surfaced as a question than silently decided by a regex.
FREE = re.compile(r"alcohol[- ]?free|non[- ]?alcoholic|alkoholfrei|no alcohol", re.I)

def alcoholic(abv):
    s = str(abv)
    if FREE.search(s):
        return False
    if "<" in s:            # "<0.5%" states an upper bound, not a strength
        return False
    nums = [float(n) for n in re.findall(r"\d+(?:\.\d+)?", s)]
    return bool(nums) and min(nums) >= 0.5

def C(name, country, origin, sub, rarity, abv, desc, notes, glass, ingr,
      fact, recipe, steps, garnish, method, id=None):
    assert sub in SUBCATS, f"{name}: subcategory {sub}"
    assert rarity in RAR, f"{name}: rarity {rarity}"
    assert method in METH, f"{name}: method {method}"
    assert 2 <= len(notes) <= 5, f"{name}: {len(notes)} notes"
    assert len(recipe) >= 2, f"{name}: recipe too thin"
    assert len(steps) >= 3, f"{name}: {len(steps)} steps"
    assert origin.split(",")[-1].strip() != "United States", f"{name}: use USA"
    assert alcoholic(abv), f"{name}: abv {abv!r} — alcohol only"
    R.append({"id": id or slug(name), "name": name, "subcategory": sub,
              "description": desc, "abv": abv, "origin": origin, "rarity": rarity,
              "tastingNotes": list(notes), "glassware": glass,
              "ingredients": list(ingr), "funFact": fact,
              "recipe": {"ingredients": [{"item": i, "amount": a} for i, a in recipe],
                         "steps": list(steps), "garnish": garnish, "method": method}})

SHAKE = ["Add all ingredients to a shaker with ice.",
         "Shake hard for about 12 seconds until the tin frosts.",
         "Double-strain into a chilled coupe.",
         "Garnish and serve immediately."]
FLIP = ["Dry-shake all ingredients without ice for 20 seconds to build the texture.",
        "Add ice and shake hard for another 15 seconds.",
        "Double-strain into a small chilled glass.",
        "Grate nutmeg generously over the surface and serve."]
TODDY = ["Put the sugar in a warmed heatproof glass and add a splash of hot water to dissolve it.",
         "Add the spirit and stir once.",
         "Top with hot water and stir again.",
         "Garnish and drink while hot."]
SANGAREE = ["Dissolve the sugar in a little water in the glass.",
            "Add the wine or spirit and stir.",
            "Fill with ice and stir until chilled.",
            "Grate nutmeg over the top — the nutmeg is what makes it a sangaree."]

def S(name, country, origin, rarity, abv, desc, notes, ingr, fact, recipe,
      garnish, sub="Sour", glass="Coupe glass", steps=None, method="shaken"):
    return C(name, country, origin, sub, rarity, abv, desc, notes, glass, ingr,
             fact, recipe, steps or SHAKE, garnish, method)

def FL(name, country, origin, rarity, abv, desc, notes, ingr, fact, recipe,
       garnish="Freshly grated nutmeg", sub="Creamy & Dessert",
       glass="Small wine glass", steps=None):
    return C(name, country, origin, sub, rarity, abv, desc, notes, glass, ingr,
             fact, recipe, steps or FLIP, garnish, "shaken")

def TD(name, country, origin, rarity, abv, desc, notes, ingr, fact, recipe,
       garnish, sub="Hot", glass="Heatproof glass", steps=None):
    return C(name, country, origin, sub, rarity, abv, desc, notes, glass, ingr,
             fact, recipe, steps or TODDY, garnish, "built")

def SG(name, country, origin, rarity, abv, desc, notes, ingr, fact, recipe,
       garnish="Freshly grated nutmeg", sub="Regional", glass="Tumbler",
       steps=None):
    return C(name, country, origin, sub, rarity, abv, desc, notes, glass, ingr,
             fact, recipe, steps or SANGAREE, garnish, "built")

def B(name, country, origin, sub, rarity, abv, desc, notes, glass, ingr, fact,
      recipe, steps, garnish):
    return C(name, country, origin, sub, rarity, abv, desc, notes, glass, ingr,
             fact, recipe, steps, garnish, "built")

STIR = ["Add all ingredients to a mixing glass with ice.",
        "Stir for about 30 seconds until properly cold and diluted.",
        "Strain into a chilled glass.",
        "Garnish and serve."]

def T(name, country, origin, rarity, abv, desc, notes, ingr, fact, recipe,
      garnish, sub="Spirit-Forward", glass="Coupe glass", steps=None):
    return C(name, country, origin, sub, rarity, abv, desc, notes, glass, ingr,
             fact, recipe, steps or STIR, garnish, "stirred")

def emit(path, fname):
    os.makedirs(path, exist_ok=True)
    with open(os.path.join(path, fname + ".json"), "w") as fh:
        json.dump(R, fh, ensure_ascii=False, indent=1); fh.write("\n")
    print(f"  {fname}.json {len(R)}")
