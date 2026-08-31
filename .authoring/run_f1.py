import json, sys, unicodedata
import ck
import f1_victorian_families  # noqa: F401  (populates ck.R)

def fold(s):
    s = unicodedata.normalize("NFKD", s.lower())
    return "".join(c for c in s if not unicodedata.combining(c)).strip()

live = json.load(open("../src/data/drinks.json"))
ids = {d["id"]: d for d in live}
names = {}
for d in live:
    names.setdefault(fold(d["name"]), []).append(d)

bad = 0
seen_id, seen_name = set(), set()
for r in ck.R:
    if r["id"] in ids:
        print(f"ID COLLISION  {r['id']}  -> existing {ids[r['id']]['category']} \"{ids[r['id']]['name']}\"")
        bad += 1
    if fold(r["name"]) in names:
        ex = names[fold(r["name"])][0]
        print(f"NAME COLLISION  {r['name']}  -> existing {ex['category']} \"{ex['name']}\" ({ex['id']})")
        bad += 1
    if r["id"] in seen_id:
        print(f"DUPLICATE IN BATCH (id)  {r['id']}"); bad += 1
    if fold(r["name"]) in seen_name:
        print(f"DUPLICATE IN BATCH (name)  {r['name']}"); bad += 1
    seen_id.add(r["id"]); seen_name.add(fold(r["name"]))

print(f"\nbatch: {len(ck.R)} entries, {bad} collisions")
if bad:
    sys.exit(1)
ck.emit("../scripts/cocktaildata", "22-victorian-families")
