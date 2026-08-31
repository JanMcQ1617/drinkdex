import importlib, json, sys, unicodedata
import ck

def fold(s):
    """Match dex-merge.mjs exactly: strip accents AND every separator.

    A looser key that keeps spaces reports "Lambswool" and "Lamb's Wool" as
    different drinks, so the collision only surfaced at merge time. Whatever
    the gate downstream uses, the pre-check has to use the same key.
    """
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    for a, b in (("\u00e6", "ae"), ("\u00f8", "o"), ("\u0142", "l"),
                 ("\u0111", "d"), ("\u00f0", "d"), ("\u00fe", "th"),
                 ("\u00df", "ss"), ("\u0153", "oe")):
        s = s.replace(a, b)
    return "".join(c for c in s if c.isalnum())


live = json.load(open("../src/data/drinks.json"))

# A drink already in the Dex under a DIFFERENT name is the collision the name
# check cannot see. Nine got through this way — Ward 8 vs Ward Eight, Rose vs
# Rose Cocktail, Yale vs Yale Cocktail, and six more where the two names share
# no folded form at all. What they do share is a spec ingredient list, so that
# is the key to compare on.
#
# It is a WARNING, not an error. Weisser Spritzer, Gemist and Froccs are three
# countries' names for wine and soda and all three belong; so do Batanga and
# Charro Negro. The check cannot tell those from a true duplicate, so it asks
# rather than blocks.
def ingredient_key(row):
    return "|".join(sorted({str(i).lower().strip() for i in row.get("ingredients", [])}))


live_by_ingredients = {}
for row in live:
    if row.get("category") == "cocktail" and row.get("ingredients"):
        live_by_ingredients.setdefault(ingredient_key(row), []).append(row)
ids = {d["id"]: d for d in live}
names = {}
for d in live:
    names.setdefault(fold(d["name"]), []).append(d)

BATCHES = [(m, f) for m, f in (a.split("=") for a in sys.argv[1:])]
bad = 0
seen_id, seen_name = {}, {}
staged = []

for mod, fname in BATCHES:
    ck.R = []
    importlib.import_module(mod)
    for r in ck.R:
        if r["id"] in ids:
            print(f"ID COLLISION   {r['id']:28} -> {ids[r['id']]['category']} \"{ids[r['id']]['name']}\""); bad += 1
        k = fold(r["name"])
        if k in names:
            ex = names[k][0]
            print(f"NAME COLLISION {r['name']:28} -> {ex['category']} \"{ex['name']}\""); bad += 1
        if r["id"] in seen_id:
            print(f"DUP IN BATCH id   {r['id']}"); bad += 1
        if k in seen_name:
            print(f"DUP IN BATCH name {r['name']}"); bad += 1
        twin = live_by_ingredients.get(ingredient_key(r))
        if twin:
            names = ", ".join(f'{t["name"]} (#{t.get("dexNumber","?")})' for t in twin)
            print(f'SAME INGREDIENTS  {r["name"]:28} -> {names}   [check: same drink?]')
        seen_id[r["id"]] = 1; seen_name[k] = 1
    staged.append((fname, list(ck.R)))
    print(f"  {mod}: {len(ck.R)} entries")

total = sum(len(v) for _, v in staged)
print(f"\ntotal {total} entries, {bad} collisions")
if bad:
    sys.exit(1)
for fname, rows in staged:
    ck.R = rows
    ck.emit("../scripts/cocktaildata", fname)
