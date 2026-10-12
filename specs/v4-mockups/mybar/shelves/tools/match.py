"""matchBar ported from src/lib/bar.ts, so every number in the mock is the real one.
python3 tools/match.py id id id ...   (run from anywhere)"""
import json, os, re, sys, collections
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '..'))
IDX = json.load(open(os.path.join(ROOT, 'src/data/barIndex.json')))
ING = {i['id']: i for i in IDX['ingredients']}
PHOTOS = set(re.findall(r"'([^']+)': require", open(os.path.join(ROOT, 'src/data/drinkPhotos.ts')).read()))
# spec.md section 7.4: liqueurs the index files inside a spirit family come out of it (sloe gin poured
# 165 gin drinks, apricot brandy every brandy one). Every number in the mock uses the fixed families.
NOT_FAMILY = {'sloe-gin', 'apricot-brandy', 'peach-brandy'}
def _fix(slot):
    return [x for x in slot if x not in NOT_FAMILY or x == slot[0]] if len(slot) > 3 else slot
RECIPES = sorted(({**r, 'slots': [_fix(sl) for sl in r['slots']]} for r in IDX['recipes']),
                 key=lambda r: r['name'].lower())

def match(owned):
    owned = set(owned)
    makeable, nearly = [], []
    if not owned: return makeable, nearly, {}
    for r in RECIPES:
        missing, unmet = [], None
        for s in r['slots']:
            if any(i in owned for i in s): continue
            missing.append(s[0]); unmet = s
            if len(missing) > 1: break
        if not missing: makeable.append(r)
        elif len(missing) == 1: nearly.append((r, missing[0], unmet))
    gains = collections.defaultdict(list)
    for r, need, slot in nearly:
        for i in set(slot): gains[i].append(r)
    return makeable, nearly, gains

def best(gains, k=8):
    rows = [(i, rs) for i, rs in gains.items() if i in ING and rs]
    rows.sort(key=lambda t: (-len(t[1]), -ING[t[0]]['uses'], ING[t[0]]['label']))
    return rows[:k]

if __name__ == '__main__':
    owned = sys.argv[1:]
    for o in owned: assert o in ING, o
    mk, nr, gains = match(owned)
    print(len(owned), 'owned ->', len(mk), 'makeable,', len(nr), 'one away')
    print('MAKE:', ', '.join(r['name'] + ('*' if r['id'] in PHOTOS else '') for r in mk))
    for i, rs in best(gains, 10):
        print(f"  +{len(rs):3d} {ING[i]['label']:<22} {', '.join(r['name'] for r in rs[:6])}")

def shopping(nearly, gains, k=10):
    """lib/bar.ts shoppingList: one entry per missing[0], ranked by how many nearly drinks name it."""
    named = collections.defaultdict(list)
    for r, need, slot in nearly: named[need].append(r)
    rows = [(i, rs, len(gains.get(i, rs))) for i, rs in named.items() if i in ING]
    rows.sort(key=lambda t: (-len(t[1]), -t[2], ING[t[0]]['label']))
    return rows[:k]
