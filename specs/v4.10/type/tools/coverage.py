# ==================================================================== #
# v4.10 type: can each face set the drinks the app actually has?       #
#                                                                      #
# Reads src/data/drinks.json and collects every character the 2,089    #
# names use (plus "Nº" and the figures), and every character the       #
# descriptions, origins, glasses, amounts and steps use. Then, per     #
# font, the characters it has no glyph for. A face missing a name      #
# character falls back to the system font for that glyph on iOS, so a  #
# miss here is a visible patch of San Francisco inside a drink name.   #
# Also says whether the default figures are already tabular.           #
#                                                                      #
#   python3 specs/v4.10/type/tools/coverage.py . specs/v4.10/type/fonts/*.ttf assets/fonts/*.ttf
# ==================================================================== #
# Which characters the app's drink data actually sets, and which fonts miss any.
import json, sys, os, collections
from fontTools.ttLib import TTFont
R = sys.argv[1]
d = json.load(open(os.path.join(R, 'src/data/drinks.json'), encoding='utf8'))
names = collections.Counter(); body = collections.Counter()
for x in d:
    for c in x['name']: names[c] += 1
    r = x.get('recipe') or {}
    blob = ' '.join([x.get('description',''), x.get('origin',''), x.get('funFact',''), x.get('glassware','')] + [i['item']+' '+i['amount'] for i in r.get('ingredients',[])] + r.get('steps',[]))
    for c in blob: body[c] += 1
non_ascii_names = sorted(c for c in names if ord(c) > 126)
non_ascii_body = sorted(c for c in body if ord(c) > 126)
print('name chars beyond ASCII:', ''.join(non_ascii_names))
print('body chars beyond ASCII:', ''.join(non_ascii_body))
print('names using them:', [x['name'] for x in d if any(ord(c)>126 for c in x['name'])][:40])
NEED_NAME = set(c for c in names if c != ' ') | set('Nº0123456789')
NEED_BODY = set(c for c in body if c not in ' \n')
for p in sys.argv[2:]:
    f = TTFont(p, lazy=True); cm = f.getBestCmap()
    mn = ''.join(sorted(c for c in NEED_NAME if ord(c) not in cm))
    mb = ''.join(sorted(c for c in NEED_BODY if ord(c) not in cm))
    hm = f['hmtx']; dig = set(hm[cm[ord(c)]][0] for c in '0123456789' if ord(c) in cm)
    print(f"{os.path.basename(p):42s} names-miss [{mn}]  body-miss [{mb}]  digits {'tabular' if len(dig)==1 else 'proportional'}")
