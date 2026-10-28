# ==================================================================== #
# v4.10 type: what each direction would weigh in the app               #
#                                                                      #
# Each cut made the way assets/fonts/README.md makes today's five:     #
# a static instance of the variable font at the weight (and width 100) #
# the direction uses, then a Latin subset with every layout feature    #
# kept. The subset here adds Latin Extended Additional (U+1EA0-1EF9),  #
# which today's subsets leave out: five drink names (Rượu Đế, Rượu     #
# Nếp, Rượu Rắn, Rượu Thuốc, Cà Phê Trứng Rum) need it and fall back   #
# to the system font for those letters in build 34. Writes nothing.    #
#                                                                      #
#   python3 specs/v4.10/type/tools/payload.py specs/v4.10/type/fonts /tmp
# ==================================================================== #
# Static instance + Latin subset per cut, the way assets/fonts/README.md makes the app's,
# plus Latin Extended Additional (Vietnamese) for the five names today's subsets drop.
import sys, os, io
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset
F, OUT = sys.argv[1], sys.argv[2]
UNI = 'U+0020-00FF,U+0100-017F,U+0180-024F,U+1EA0-1EF9,U+2000-206F,U+20A0-20BF,U+2122'
def uni_list(spec):
    out = []
    for part in spec.split(','):
        a, _, b = part[2:].partition('-')
        out += range(int(a, 16), int(b or a, 16) + 1)
    return out
U = uni_list(UNI)
CUTS = {
  'A Tag':   [('SedgwickAve-Regular.ttf', {}), ('Anton-Regular.ttf', {}), ('Archivo[wdth,wght].ttf', {'wght': 400, 'wdth': 100}), ('Archivo[wdth,wght].ttf', {'wght': 500, 'wdth': 100}), ('Archivo[wdth,wght].ttf', {'wght': 600, 'wdth': 100})],
  'B Menu':  [('KaushanScript-Regular.ttf', {}), ('InstrumentSerif-Regular.ttf', {}), ('InstrumentSans[wdth,wght].ttf', {'wght': 400, 'wdth': 100}), ('InstrumentSans[wdth,wght].ttf', {'wght': 500, 'wdth': 100}), ('InstrumentSans[wdth,wght].ttf', {'wght': 600, 'wdth': 100})],
  'C Label': [('Caveat[wght].ttf', {'wght': 700}), ('GeistMono[wght].ttf', {'wght': 500}), ('HankenGrotesk[wght].ttf', {'wght': 400}), ('HankenGrotesk[wght].ttf', {'wght': 500}), ('HankenGrotesk[wght].ttf', {'wght': 600})],
}
for name, cuts in CUTS.items():
    total = 0; parts = []
    for fn, loc in cuts:
        f = TTFont(os.path.join(F, fn))
        if 'fvar' in f:
            f = instancer.instantiateVariableFont(f, loc)
        opts = subset.Options(); opts.layout_features = ['*']; opts.glyph_names = True; opts.notdef_outline = True
        sub = subset.Subsetter(opts); sub.populate(unicodes=U); sub.subset(f)
        b = io.BytesIO(); f.save(b); n = len(b.getvalue()); total += n
        parts.append(f"{fn.split('[')[0].split('-')[0]} {'/'.join(str(v) for v in loc.values()) or '400'} {n/1024:.0f}")
    print(f"{name}: {total/1024:.0f} KB  ({'; '.join(parts)})")
