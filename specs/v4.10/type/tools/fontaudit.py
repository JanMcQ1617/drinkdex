# ==================================================================== #
# v4.10 type: what each font file is                                   #
#                                                                      #
# For every file named: its family, its x-height, cap height and line  #
# metrics as fractions of the em (the board sizes each role by these,  #
# not by nominal size), how much of Latin Extended-A it carries, which #
# figure features it has (tnum, pnum), its variable axes, which of a   #
# fixed probe string it cannot draw, and its licence line.             #
#                                                                      #
# Run from any folder that is not the fonts folder (python puts the    #
# script's own folder on the path):                                    #
#   python3 specs/v4.10/type/tools/fontaudit.py specs/v4.10/type/fonts/*.ttf
# ==================================================================== #
import sys, os
from fontTools.ttLib import TTFont
need = "AñejoCrème de cassis Ti’ Punch Ti' Punch Nº 0127 ½ ¾ Ñ É È Ü Ç ç ü é è à â ô ï æ œ ß Ł ł ő ş ğ · — – ’ “ ” • × ° % & / 0123456789"
def feats(f):
    out=set()
    for t in ('GSUB','GPOS'):
        if t in f:
            for fr in f[t].table.FeatureList.FeatureRecord: out.add(fr.FeatureTag)
    return out
for p in sys.argv[1:]:
    f=TTFont(p, lazy=True)
    cmap=f.getBestCmap()
    miss=sorted(set(c for c in need if ord(c) not in cmap and c!=' '))
    n=f['name']
    fam=n.getDebugName(16) or n.getDebugName(1)
    lic=(n.getDebugName(13) or '')[:60].replace('\n',' ')
    os2=f['OS/2']; upm=f['head'].unitsPerEm
    xh=getattr(os2,'sxHeight',0); ch=getattr(os2,'sCapHeight',0)
    fe=feats(f)
    axes=[(a.axisTag,a.minValue,a.maxValue) for a in f['fvar'].axes] if 'fvar' in f else []
    # latin-ext count
    le=sum(1 for c in range(0x100,0x180) if c in cmap)
    hh=f['hhea']
    print(f"{os.path.basename(p)} | {fam} | xh {xh/upm:.3f} cap {ch/upm:.3f} asc {hh.ascent/upm:.2f} desc {hh.descent/upm:.2f} gap {hh.lineGap/upm:.2f} | latExtA {le}/128 | tnum {'tnum' in fe} pnum {'pnum' in fe} kern {'kern' in fe} liga {'liga' in fe} calt {'calt' in fe} | axes {axes} | missing {''.join(miss) or '-'} | lic {lic}")
