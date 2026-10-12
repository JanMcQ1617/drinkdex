"""The proposed shelf of every ingredient (spec.md section 4), from its index category plus a short
override list. Mirrors what build-bar-index.mjs would emit as `shelf`."""
import collections
from match import ING, IDX

SHELVES = ['spirits', 'liqueurs', 'mixers', 'fresh', 'syrups', 'bitters', 'other']
SHELF_LABEL = {'spirits': 'Spirits', 'liqueurs': 'Liqueurs & vermouth', 'mixers': 'Mixers', 'fresh': 'Fresh',
               'syrups': 'Syrups & sugar', 'bitters': 'Bitters', 'other': 'Other'}
BY_CATEGORY = {'spirit': 'spirits', 'liqueur': 'liqueurs', 'wine': 'liqueurs', 'bitters': 'bitters',
               'citrus': 'fresh', 'juice': 'mixers', 'syrup': 'syrups', 'mixer': 'mixers', 'dairy': 'fresh',
               'produce': 'fresh', 'spice': 'other', 'savoury': 'other', 'other': 'other'}
# wine: fortified and aromatised stay with the liqueurs; what you top or lengthen with is a mixer
WINE_TO_MIXERS = ('champagne', 'prosecco', 'cava', 'sparkling', 'sekt', 'red-wine', 'white-wine', 'rose-wine',
                  'wine', 'lager', 'ale', 'beer', 'stout', 'porter', 'pilsner', 'cider', 'weisse', 'claret',
                  'burgundy', 'sake', 'rice-wine', 'palm-wine', 'sweet-white', 'sweet-red', 'aligote')
OVERRIDE = {
    # bottled "spirits" that are liqueurs on a real shelf
    'apricot-brandy': 'liqueurs', 'peach-brandy': 'liqueurs', 'cherry-brandy': 'liqueurs',
    'sloe-gin': 'liqueurs', 'coconut-rum': 'liqueurs', 'vanilla-vodka': 'spirits',
    # citrus that comes in a bottle or a can
    'lemonade': 'mixers', 'grapefruit-soda': 'mixers', 'ting-grapefruit-soda': 'mixers', 'lemon-squash': 'mixers',
    'icelandic-orange-soda': 'mixers', 'lemon-paeroa': 'mixers', 'lime-cordial': 'syrups',
    'orange-flower-water': 'other', 'orange-marmalade': 'other', 'lemon-sorbet': 'other',
    # syrups filed under spice
    'cinnamon-syrup': 'syrups', 'vanilla-syrup': 'syrups', 'allspice-dram': 'liqueurs',
    'vanilla-ice-cream': 'fresh', 'elderflower-cordial': 'syrups', 'raspberry-cordial': 'syrups',
    'cherry-heering': 'liqueurs', 'maraschino-cherry': 'other', 'raspberry-shrub': 'syrups',
    'angostura': 'bitters',
}

def shelf(i):
    if i in OVERRIDE: return OVERRIDE[i]
    c = ING[i]['category']
    if c == 'wine' and (i in WINE_TO_MIXERS or any(i.startswith(w) or i.endswith(w) for w in WINE_TO_MIXERS)) \
            and 'vermouth' not in i and 'sherry' not in i and 'port' not in i:
        return 'mixers'
    return BY_CATEGORY[c]

# Spirit families, from the index's own family slots (a generic slot lists its family)
FAMILY_ORDER = ['gin', 'rum', 'whiskey', 'brandy', 'tequila', 'vodka', 'other']
FAMILY_LABEL = {'gin': 'Gin', 'rum': 'Rum', 'whiskey': 'Whiskey', 'brandy': 'Brandy',
                'tequila': 'Tequila & mezcal', 'vodka': 'Vodka', 'other': 'More spirits'}
FAMILY = {}
_slots = collections.Counter(tuple(sl) for r in IDX['recipes'] for sl in r['slots'])
for g in ('gin', 'rum', 'whiskey', 'brandy', 'tequila'):
    canon = max((sl for sl in _slots if sl[0] == g and len(sl) > 3), key=lambda sl: _slots[sl])  # the family slot itself
    for x in canon:
        if shelf(x) == 'spirits': FAMILY.setdefault(x, g)
for x in ('mezcal',): FAMILY[x] = 'tequila'
for x in ING:
    if shelf(x) == 'spirits' and x not in FAMILY:
        l = ING[x]['label'].lower()
        FAMILY[x] = ('rum' if ' rum' in l or l.startswith('rum') or 'rhum' in l else
                     'whiskey' if 'whisk' in l else 'vodka' if 'vodka' in l else
                     'gin' if l.endswith(' gin') or l == 'gin' else 'brandy' if 'brandy' in l or 'cognac' in l else
                     'tequila' if 'tequila' in l or 'mezcal' in l else 'other')

if __name__ == '__main__':
    c = collections.Counter(shelf(i) for i in ING)
    print({SHELF_LABEL[s]: c[s] for s in SHELVES})
    for s in SHELVES:
        items = sorted([i for i in ING if shelf(i) == s], key=lambda i: -ING[i]['uses'])
        print('\n==', SHELF_LABEL[s], len(items), ':', ', '.join(ING[i]['label'] for i in items[:28]))
    fam = collections.defaultdict(list)
    for x, f in FAMILY.items(): fam[f].append(x)
    for f in FAMILY_ORDER:
        print('\n--', f, ', '.join(ING[x]['label'] for x in sorted(fam[f], key=lambda x: -ING[x]['uses'])[:16]))
