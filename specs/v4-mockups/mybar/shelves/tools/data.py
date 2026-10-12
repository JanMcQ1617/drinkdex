"""Works out every number the shelves mock shows, from the real index, and writes ../data.js.
Run from anywhere: python3 tools/data.py. Deterministic."""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from match import ING, PHOTOS, ROOT, match
from shelves import FAMILY, FAMILY_LABEL, FAMILY_ORDER, SHELF_LABEL, SHELVES, shelf

DRINKS = {d['id']: d for d in json.load(open(os.path.join(ROOT, 'src/data/drinks.json')))}
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'data.js')

BAR = ['gin', 'white-rum', 'bourbon', 'sweet-vermouth', 'campari', 'triple-sec', 'angostura-bitters',
       'lemon', 'lime', 'orange', 'sugar-syrup', 'soda-water']
BASICS = ['gin', 'vodka', 'white-rum', 'bourbon', 'sweet-vermouth', 'dry-vermouth', 'lemon', 'lime',
          'sugar-syrup', 'angostura-bitters', 'soda-water', 'orange', 'triple-sec', 'mint']
BASICS_TICKED = ['gin', 'white-rum', 'bourbon', 'sweet-vermouth', 'lemon', 'lime', 'sugar-syrup',
                 'angostura-bitters', 'soda-water', 'orange']
ECHO_USES = 3

def label(i): return ING[i]['label']
def famous(rs): return sorted(rs, key=lambda r: (r['id'] not in PHOTOS, DRINKS[r['id']]['dexNumber']))

def glass(drink_id):
    g = (DRINKS[drink_id].get('glassware') or '').lower()
    if any(w in g for w in ('highball', 'collins', 'tall', 'pint', 'hurricane', 'wine')): return 'highball'
    if any(w in g for w in ('coupe', 'cocktail', 'martini', 'nick')): return 'coupe'
    if any(w in g for w in ('mug', 'cup', 'toddy', 'punch')): return 'mug'
    return 'rocks'

def drink(r): return {'id': r['id'], 'name': r['name'], 'photo': r['id'] in PHOTOS, 'glass': glass(r['id'])}

def inventory(owned):
    return [{'shelf': s, 'label': SHELF_LABEL[s],
             'items': sorted((label(i) for i in owned if shelf(i) == s), key=str.lower)} for s in SHELVES]

def next_bottles(owned, k=10, skip=()):
    """One rule: what adding it really pours (full-slot gain), ties to the more-named bottle, then A to Z;
    an echo (every drink it adds is already claimed by a row above, and recipes rarely name it) is dropped."""
    mk, nr, gains = match(owned)
    rows = sorted(((i, rs) for i, rs in gains.items() if i in ING and rs and i not in skip),
                  key=lambda t: (-len(t[1]), -ING[t[0]]['uses'], label(t[0])))
    out, claimed = [], []
    for i, rs in rows:
        ids = {r['id'] for r in rs}
        if ING[i]['uses'] < ECHO_USES and any(ids <= c for c in claimed): continue
        claimed.append(ids)
        names = [r['name'] for r in famous(rs)]
        out.append({'id': i, 'label': label(i), 'gain': len(rs), 'like': names[:2]})
        if len(out) == k: break
    return out

def picker_rows(owned, s, k=13):
    """A shelf's picker in its FIXED order: how many recipes name it, then A to Z. Gains are live."""
    mk, nr, gains = match(owned)
    ids = sorted((i for i in ING if shelf(i) == s), key=lambda i: (-ING[i]['uses'], label(i)))
    return [{'label': label(i), 'owned': i in owned, 'gain': len(gains.get(i, []))} for i in ids[:k]]

def base_of(r):
    for sl in r['slots']:
        sp = [x for x in sl if shelf(x) == 'spirits']
        if sp: return FAMILY.get(sp[0], 'other')
    return 'none'

def make_list(owned):
    mk, _, _ = match(owned)
    groups = []
    for f in FAMILY_ORDER + ['none']:
        rs = [r for r in mk if base_of(r) == f]
        if rs: groups.append({'label': FAMILY_LABEL.get(f, 'Without a spirit'), 'drinks': [drink(r) for r in rs]})
    return groups

def whisk(owned):
    """Search "whisk": label prefix first, then the family (bourbon is a whiskey with no "whisk" in its name),
    then contains, each by uses. A generic whose family you already hold is "covered"."""
    mk, nr, gains = match(owned)
    fam = [i for i in ING if FAMILY.get(i) == 'whiskey']
    def key(i):
        l = label(i).lower()
        return (0 if l.startswith('whisk') else 1, -ING[i]['uses'], l)
    rows = []
    for i in sorted(fam, key=key):
        covered = None
        if i == 'whiskey':
            have = [x for x in owned if FAMILY.get(x) == 'whiskey']
            if have: covered = label(have[0]).lower()
        rows.append({'label': label(i), 'owned': i in owned, 'gain': len(gains.get(i, [])), 'covered': covered,
                     'sub': 'Any whiskey' if i == 'whiskey' else None})
    return rows

mk, nr, gains = match(BAR)
dv = BAR + ['dry-vermouth']
mk_dv, _, _ = match(dv)
no_lime = [b for b in BAR if b != 'lime']
mk_nl, _, _ = match(no_lime)
lime_drinks = famous([r for r in mk if any('lime' in sl for sl in r['slots'])])
lost = [r['name'] for r in mk if r['id'] not in {x['id'] for x in mk_nl}]

data = {
    'bar': {'count': len(BAR), 'make': len(mk), 'inventory': inventory(BAR), 'next': next_bottles(BAR)},
    # Next bottle, just after its first Add: the rows hold the order they opened in; the counts are live
    'nextFrozen': {'make': len(mk_dv), 'line': next_bottles(dv, 1)[0],
                   'rows': [{**n, 'added': n['id'] in dv,
                             'gain': n['gain'] if n['id'] in dv else len(match(dv)[2].get(n['id'], []))}
                            for n in next_bottles(BAR)]},
    'picker': {'shelf': 'Liqueurs & vermouth', 'make': len(mk_dv), 'rows': picker_rows(dv, 'liqueurs')},
    'search': {'query': 'whisk', 'make': len(mk), 'rows': whisk(BAR)},
    'removed': {'label': 'Lime', 'make': len(mk_nl), 'lost': lost, 'inventory': inventory(no_lime),
                'next': next_bottles(no_lime, 1, skip=('lime',))},
    'lime': {'make': len(mk), 'drinks': [drink(r) for r in lime_drinks], 'reach': None},
    'makeList': {'make': len(mk), 'groups': make_list(BAR)},
    'basics': {'tiles': [{'label': label(i), 'on': i in BASICS_TICKED}
                         for i in sorted(BASICS, key=lambda i: (SHELVES.index(shelf(i)), BASICS.index(i)))],
               'ticked': len(BASICS_TICKED), 'make': len(match(BASICS_TICKED)[0]), 'all': len(match(BASICS)[0])},
    'shelfCounts': {SHELF_LABEL[s]: sum(1 for i in ING if shelf(i) == s) for s in SHELVES},
}
with open(OUT, 'w') as f:
    f.write('/* GENERATED by tools/data.py from src/data/barIndex.json. Do not edit by hand. */\n')
    f.write('window.DATA = ' + json.dumps(data, ensure_ascii=False, indent=1) + ';\n')
print(json.dumps({k: (v if k != 'makeList' else '...') for k, v in data.items()}, ensure_ascii=False, indent=1)[:6000])
