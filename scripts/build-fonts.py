"""
The app's five font files, built from the pinned upstream sources (v4.10,
specs/v4.10/spec.md T.1): Sedgwick Ave, the marker, for the drink names,
the tab titles and the empty states' headlines; Anton, the poster, for the
Dex's and the drink page's section heads (and, as paths, the press's
outlined figures, scripts/build-numerals.py); Archivo at 400, 500 and 600
for everything else, every key, count, amount, Nº and handle included.

Each cut is the upstream file from google/fonts (kept, with its licence,
in specs/v4.10/type/fonts/ and pinned below by sha256), made the way the
app has always made its fonts (assets/fonts/README.md): a static instance
where the source is variable (Archivo, at width 100), a Latin subset with
every layout feature kept, and a rename, so a cut-down file never sits
under the original family's name. The subset is build 34's Latin set plus
Latin Extended Additional (U+1EA0-1EF9): five catalogue names (Rượu Đế,
Rượu Nếp, Rượu Rắn, Rượu Thuốc, Cà Phê Trứng Rum) drew those letters in
the system font until now.

Four edits to Sedgwick's own data, all permitted by the OFL (none of the
three families has a Reserved Font Name):
  - its `zero` is redrawn as its own `O`, scaled into the zero's box with
    the zero's advance (592) and left side bearing (27) kept. The shipped
    zero is slashed, and its slash is not a contour of its own (it cuts the
    counter into two halves), so "Ardbeg 10" read "Ardbeg 1Ø" and could not
    be fixed by dropping a contour. Same advance, so every fit is unchanged;
  - its OS/2 cap and x heights are set to the drawn medians (850, 670), in
    place of the shipped 950 and 660. Metadata only: React Native lays a
    line out from hhea, which is untouched;
  - its accented letters lose the empty room upstream leaves after them
    (accented_advances says why: upstream's è is 110 units wider than e
    with the same ink, so "Crème" drew as "Crè me"). Advances only shrink,
    to the base letter's plus any accent overhang, so no name gets wider;
  - its default ligatures keep only the letter ones (fi, fl, ff, ffi, ffl).
    Upstream's `liga` also turns words into pictures: "star1" and "star2"
    into stars, "arrow1" and "arrow2" into arrows, "hiphop1", "hiphop2",
    "hiphopgoogle" and "hiphopvinyl" into drawings, "quotesleft" and
    "quotesright" into quote marks. No catalogue name spells one, but a
    custom drink or a caption may, and iOS forms them unasked
    (letter_ligatures_only).

It also writes src/lib/faceAdvances.ts (GENERATED), the advances textFit
costs a run of text with: for each exact face, each character's advance
plus the widest positive kern it can take on its left side, plus its share
of any ligature wider than its parts, in font units. Sedgwick has 651 kern
pairs and some widen a pair by up to 140 units, and its f_f ligature is 136
units wider than f + f, so an advance alone would fall short of the line
iOS sets; Inter only ever tightened, which is why its old table had no such
allowance.

Run (repo root):  python3 scripts/build-fonts.py
Check:            python3 scripts/build-fonts.py --check
                  (writes nothing; exit 1 unless the sources match their
                  pins, the shipped files are these, theme.ts, _layout.tsx
                  and lineMarks.ts agree with them, the catalogue's names
                  are all drawn, and faceAdvances.ts is current)
Writes:           assets/fonts/*.ttf, assets/fonts/LICENSE-*.txt,
                  src/lib/faceAdvances.ts

Deterministic: each file is saved with its source's head.modified and no
timestamp recalculation, so a rebuild with the same fontTools is the same
bytes. Archivo keeps the instancer's OVERLAP_SIMPLE flags, which CoreText
fills correctly.

Needs fontTools (pip install fonttools), as build-numerals.py does.
"""
import hashlib
import io
import json
import os
import re
import sys
import unicodedata

from fontTools import subset
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
SRC = os.path.join(ROOT, "specs/v4.10/type/fonts")
OUT = os.path.join(ROOT, "assets/fonts")
ADVANCES = os.path.join(ROOT, "src/lib/faceAdvances.ts")
THEME = os.path.join(ROOT, "src/constants/theme.ts")
LAYOUT = os.path.join(ROOT, "src/app/_layout.tsx")
LINE_MARKS = os.path.join(ROOT, "src/components/details/lineMarks.ts")
DRINKS = os.path.join(ROOT, "src/data/drinks.json")

# The sources, as google/fonts ships them (ofl/sedgwickave, ofl/anton, ofl/archivo).
SOURCES = {
    "SedgwickAve-Regular.ttf": "9c3633e56a8a104e0d10debb70907b66bb3cf32b03137fae7d5392712b253efa",
    "Anton-Regular.ttf": "a4ba3a92350ebb031da0cb47630ac49eb265082ca1bc0450442f4a83ab947cab",
    "Archivo[wdth,wght].ttf": "0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053",
}

# The shipped cuts: file stem (and useFonts key) -> source, instance, family, style, face.
CUTS = [
    ("SedgwickAveLatin_400Regular", "SedgwickAve-Regular.ttf", None, "SedgwickAveLatin", "Regular", "display"),
    ("AntonLatin_400Regular", "Anton-Regular.ttf", None, "AntonLatin", "Regular", "sub"),
    ("ArchivoLatin_400Regular", "Archivo[wdth,wght].ttf", {"wght": 400, "wdth": 100}, "ArchivoLatin", "Regular", "text400"),
    ("ArchivoLatin_500Medium", "Archivo[wdth,wght].ttf", {"wght": 500, "wdth": 100}, "ArchivoLatin", "Medium", "text500"),
    ("ArchivoLatin_600SemiBold", "Archivo[wdth,wght].ttf", {"wght": 600, "wdth": 100}, "ArchivoLatin", "SemiBold", "text600"),
]

# The licences travel with the fonts, verbatim (OFL 1.1, condition 2).
LICENSES = {
    "LICENSE-SedgwickAve.txt": "OFL-sedgwickave.txt",
    "LICENSE-Anton.txt": "OFL-anton.txt",
    "LICENSE-Archivo.txt": "OFL-archivo.txt",
}

# Build 34's Latin set, plus Latin Extended Additional for the five Vietnamese names.
UNICODES = "U+0020-007E,U+00A0-00FF,U+0100-017F,U+0180-024F,U+1EA0-1EF9,U+2000-206F,U+20A0-20BF,U+2122"

# Sedgwick's zero, redrawn from its O (T.1): the zero's own box, advance and left side bearing.
ZERO_BOX = (27, -17, 577, 798)
ZERO_ADVANCE = 592
ZERO_LSB = 27
SEDGWICK_HEIGHTS = {"sCapHeight": 850, "sxHeight": 670}
SEDGWICK_VERSION_NOTE = "; Sipply subset, zero unslashed, accented advances, letter ligatures only"
# The ligatures Sedgwick keeps: letters joined, nothing drawn in place of a word.
LETTER_LIGATURES = {"fi", "fl", "f_f", "f_f_i", "f_f_l"}

# faceAdvances.ts: which cuts are costed exactly, by textFit's face name, and the marks it always covers.
EXACT_FACES = [("display", "SedgwickAveLatin_400Regular"), ("text400", "ArchivoLatin_400Regular"), ("text600", "ArchivoLatin_600SemiBold")]
TYPO_MARKS = "’‘“”–—…•·ďľť"  # ’‘“”–—…•·ďľť, as textFit has always named them
# textFit's 'text' class estimate is costed on Archivo 600, the widest cut a label value is set in.
CLASS_FACE = "ArchivoLatin_600SemiBold"
NARROW = set("ijltfrI'’.,:;!|()/- ")
WIDE = set("mwMWæœÆŒ%")
CAP_LIKE = set("&–~")


def rel(path):
    return os.path.relpath(path, ROOT)


def sha256(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def unicode_list(spec):
    out = []
    for part in spec.split(","):
        a, _, b = part[2:].partition("-")
        out += range(int(a, 16), int(b or a, 16) + 1)
    return out


def catalogue_chars():
    """Every character of every drink's name, spaces aside, as the check needs them."""
    with open(DRINKS, encoding="utf-8") as f:
        drinks = json.load(f)
    return sorted({ch for d in drinks for ch in d["name"] if not ch.isspace()})


# ---------------------------------------------------------------- building


def accented_advances(font):
    """
    Sedgwick's accented letters lose the empty room upstream leaves after
    them. Many are set at a default 600 units whatever the letter under
    them: è and ë are 110 wider than e with their ink ending exactly where
    e's does, à and å 129 wider than a, so "Crème" drew as "Crè me" with a
    6.6pt gap at the drink page's 60pt. Each precomposed letter's advance
    becomes its base letter's, plus whatever its ink reaches past the base
    letter's ink on the right (an accent that overhangs keeps the room it
    needs: ď, ľ and ť, whose caron is an apostrophe beside the stem, stay
    about as wide as upstream set them). Only ever narrower, never wider:
    an accented capital that upstream sets tighter than its base (À, É)
    stays so. The left side, and so where the letter sits, is untouched.
    Returns the characters changed.
    """
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    changed = []
    for cp, name in sorted(cmap.items()):
        target = accented_target(font, cp)
        if target is not None and target < hmtx[name][0]:
            hmtx[name] = (target, hmtx[name][1])
            changed.append(chr(cp))
    return changed


def accented_target(font, cp):
    """
    The advance accented_advances wants for a precomposed letter: its
    base's, plus its ink's overhang past the base's on the right. None for
    anything else.
    """
    cmap = font.getBestCmap()
    glyf = font["glyf"]
    hmtx = font["hmtx"]
    name = cmap.get(cp)
    parts = unicodedata.normalize("NFD", chr(cp))
    base = cmap.get(ord(parts[0])) if len(parts) > 1 else None
    if not name or not base or base == name:
        return None
    g, b = glyf[name], glyf[base]
    g.recalcBounds(glyf)
    b.recalcBounds(glyf)
    if g.numberOfContours == 0 or b.numberOfContours == 0:
        return None
    return hmtx[base][0] + max(0, g.xMax - b.xMax)


def ligature_subtables(font):
    """
    The GSUB ligature subtables (type 4, or type 4 inside an extension) of
    the lookups the DEFAULT_LIGATURES features name: the ones iOS applies
    unasked. A ligature reached only through a language's own lookup (the
    Catalan l·l, Ldot and ldot, under locl) is a letter with a code point,
    and is left alone.
    """
    if "GSUB" not in font:
        return []
    table = font["GSUB"].table
    indices = set()
    for fr in table.FeatureList.FeatureRecord:
        if fr.FeatureTag in DEFAULT_LIGATURES:
            indices.update(fr.Feature.LookupListIndex)
    out = []
    for i in sorted(indices):
        lookup = table.LookupList.Lookup[i]
        for st in lookup.SubTable:
            if lookup.LookupType == 7:
                if st.ExtensionLookupType != 4:
                    continue
                st = st.ExtSubTable
            elif lookup.LookupType != 4:
                continue
            out.append(st)
    return out


def letter_ligatures_only(font):
    """
    Every default ligature rule but LETTER_LIGATURES goes, before the
    subset, so the subsetter drops the picture glyphs too (nothing else
    reaches them: they have no code point). Returns the glyphs dropped.
    """
    dropped = []
    for st in ligature_subtables(font):
        for first in list(st.ligatures):
            keep = [lig for lig in st.ligatures[first] if lig.LigGlyph in LETTER_LIGATURES]
            dropped += [lig.LigGlyph for lig in st.ligatures[first] if lig.LigGlyph not in LETTER_LIGATURES]
            if keep:
                st.ligatures[first] = keep
            else:
                del st.ligatures[first]
    return dropped


def unslash_zero(font):
    """Sedgwick's zero becomes its O, scaled into the zero's box: two contours, decomposed, unhinted."""
    glyf = font["glyf"]
    o = glyf["O"]
    if o.isComposite():
        sys.exit("  build-fonts: Sedgwick's O is a composite; redraw the zero by hand")
    x0, y0, x1, y1 = ZERO_BOX
    sx = (x1 - x0) / (o.xMax - o.xMin)
    sy = (y1 - y0) / (o.yMax - o.yMin)
    gs = font.getGlyphSet()
    pen = TTGlyphPen(gs)
    gs["O"].draw(TransformPen(pen, (sx, 0, 0, sy, x0 - o.xMin * sx, y0 - o.yMin * sy)))
    zero = pen.glyph()
    zero.recalcBounds(glyf)
    glyf["zero"] = zero
    font["hmtx"]["zero"] = (ZERO_ADVANCE, zero.xMin)


def rename(font, family, style, version_note=None):
    """Family and style in IDs 1, 2, 3, 4, 6, 16 and 17; IDs 0, 13 and 14 (copyright, licence) untouched."""
    name = font["name"]
    ps = f"{family}-{style}"
    values = {
        1: family,
        2: style,
        3: f"{family} {style}; subset(Latin)",
        4: f"{family} {style}",
        6: ps,
        16: family,
        17: style,
    }
    for rec in list(name.names):
        if rec.nameID in values and rec.platformID != 3:
            name.removeNames(nameID=rec.nameID, platformID=rec.platformID)
    for nid, value in values.items():
        name.setName(value, nid, 3, 1, 0x409)
    if version_note:
        version = name.getName(5, 3, 1, 0x409).toUnicode()
        name.setName(version + version_note, 5, 3, 1, 0x409)
    # A static cut's leftover variation names have no reader: ID 25 (the variable
    # font's PostScript prefix), and the axis and instance names STAT no longer uses.
    name.removeNames(nameID=25)
    name.removeUnusedNames(font)


def build_cut(stem, source, location, family, style):
    src = TTFont(os.path.join(SRC, source))
    modified = src["head"].modified
    font = src
    if location:
        font = instancer.instantiateVariableFont(src, location)
    if stem.startswith("SedgwickAve"):
        unslash_zero(font)
        accented_advances(font)
        letter_ligatures_only(font)
        for k, v in SEDGWICK_HEIGHTS.items():
            setattr(font["OS/2"], k, v)
    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.glyph_names = True
    opts.name_IDs = ["*"]
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=unicode_list(UNICODES))
    sub.subset(font)
    rename(font, family, style, SEDGWICK_VERSION_NOTE if stem.startswith("SedgwickAve") else None)
    font["head"].modified = modified
    font.recalcTimestamp = False
    out = io.BytesIO()
    font.save(out)
    return out.getvalue()


# ---------------------------------------------------------------- faceAdvances.ts


def widest_kerns(font):
    """Each glyph's largest positive pair adjustment with it on the LEFT, from the kern feature's PairPos lookups."""
    best = {}

    def note(glyph, value):
        if value > best.get(glyph, 0):
            best[glyph] = value

    def widen(*records):
        return sum(getattr(r, "XAdvance", 0) or 0 for r in records if r is not None)

    if "GPOS" not in font:
        return best
    table = font["GPOS"].table
    lookups = set()
    for fr in table.FeatureList.FeatureRecord:
        if fr.FeatureTag == "kern":
            lookups.update(fr.Feature.LookupListIndex)
    for i in sorted(lookups):
        lookup = table.LookupList.Lookup[i]
        for st in lookup.SubTable:
            if lookup.LookupType == 9:
                if st.ExtensionLookupType != 2:
                    continue
                st = st.ExtSubTable
            elif lookup.LookupType != 2:
                continue
            if st.Format == 1:
                for glyph, pairs in zip(st.Coverage.glyphs, st.PairSet):
                    for rec in pairs.PairValueRecord:
                        note(glyph, widen(getattr(rec, "Value1", None), getattr(rec, "Value2", None)))
            elif st.Format == 2:
                classes = st.ClassDef1.classDefs if st.ClassDef1 else {}
                rows = [
                    max([widen(getattr(c2, "Value1", None), getattr(c2, "Value2", None)) for c2 in r.Class2Record] or [0])
                    for r in st.Class1Record
                ]
                for glyph in st.Coverage.glyphs:
                    note(glyph, rows[classes.get(glyph, 0)])
    return best


# The ligatures iOS forms unasked: their lookups (GSUB type 4) under these features.
DEFAULT_LIGATURES = {"liga", "clig", "rlig", "ccmp"}


def ligature_extra(font, kerns):
    """
    Each glyph's share of the widest ligature it can be part of, where a
    ligature (with its own widest kern) is wider than its parts: Sedgwick's
    f_f is 136 units wider than f + f, so "Fluffy" would be costed short.
    The excess is shared evenly among the parts and each glyph takes its
    largest share, so any ligature's parts together cover its excess.
    """
    if "GSUB" not in font:
        return {}
    hmtx = font["hmtx"]
    table = font["GSUB"].table
    lookups = set()
    for fr in table.FeatureList.FeatureRecord:
        if fr.FeatureTag in DEFAULT_LIGATURES:
            lookups.update(fr.Feature.LookupListIndex)
    share = {}
    for i in sorted(lookups):
        lookup = table.LookupList.Lookup[i]
        for st in lookup.SubTable:
            if lookup.LookupType == 7:
                if st.ExtensionLookupType != 4:
                    continue
                st = st.ExtSubTable
            elif lookup.LookupType != 4:
                continue
            for first, ligs in st.ligatures.items():
                for lig in ligs:
                    parts = [first] + list(lig.Component)
                    excess = hmtx[lig.LigGlyph][0] + kerns.get(lig.LigGlyph, 0) - sum(hmtx[g][0] for g in parts)
                    if excess <= 0:
                        continue
                    each = -(-excess // len(parts))
                    for g in parts:
                        share[g] = max(share.get(g, 0), each)
    return share


def advance_units(font, chars):
    """Each character's advance plus its widest kern and ligature share, in font units; 0 for a character the font does not draw."""
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    kerns = widest_kerns(font)
    ligs = ligature_extra(font, kerns)
    out = []
    for ch in chars:
        glyph = cmap.get(ord(ch))
        out.append(0 if glyph is None else hmtx[glyph][0] + kerns.get(glyph, 0) + ligs.get(glyph, 0))
    return out


def class_em(font, chars):
    """
    Archivo 600's widest advance (plus kern) in each of textFit's classes,
    rounded up to the hundredth, as Inter's were measured: over the letters
    and figures (ASCII's and the catalogue's) and the classes' own named
    members. Other punctuation falls in 'lower' in textFit and is not
    measured here, as it was not for Inter: an em dash at a lowercase
    letter's width is the estimate's known short spot, and no label value
    or name has one inside a word.
    """
    units = dict(zip(chars, advance_units(font, chars)))
    upem = font["head"].unitsPerEm
    widest = {"narrow": 0, "lower": 0, "cap": 0, "wide": 0}
    for ch, u in units.items():
        if not u or not (ch.isalnum() or ch in NARROW or ch in WIDE or ch in CAP_LIKE):
            continue
        b = unicodedata.normalize("NFD", ch)[0]
        if b in NARROW:
            k = "narrow"
        elif b in WIDE:
            k = "wide"
        elif b in CAP_LIKE or b.isdigit():
            k = "cap"
        elif b != b.lower() and b == b.upper():
            k = "cap"
        else:
            k = "lower"
        widest[k] = max(widest[k], u / upem)
    return {k: -(-round(v * 1000, 6) // 10) / 100 for k, v in widest.items()}


def advance_chars():
    ascii_ = [chr(c) for c in range(0x20, 0x7F)]
    seen = set(ascii_)
    chars = list(ascii_)
    for ch in TYPO_MARKS + "".join(catalogue_chars()):
        if ch not in seen:
            seen.add(ch)
            chars.append(ch)
    return chars


def advances_ts(fonts):
    chars = advance_chars()
    faces = []
    for face, stem in EXACT_FACES:
        f = fonts[stem]
        units = " ".join(str(u) for u in advance_units(f, chars))
        faces.append(f"  {face}: {{ upem: {f['head'].unitsPerEm}, units: '{units}' }}, // {stem}")
    cls = class_em(fonts[CLASS_FACE], chars)
    body = "\n".join(faces)
    return f"""/* ==================================================================== */
/* GENERATED by scripts/build-fonts.py from assets/fonts/. Do not edit: */
/* run it again if a font changes; --check says if this is current.     */
/*                                                                      */
/* The advances textFit costs text with (specs/v4.10/spec.md T.9), in   */
/* FONT UNITS: each character's hmtx advance plus the widest positive   */
/* kern it can take with it on the left and its share of any ligature   */
/* wider than its parts (Sedgwick's f_f), so a pair that widens is      */
/* never costed short. 0 is a character the face does not draw: textFit */
/* costs it as its base letter, then as a fallback. TEXT_CLASS_EM is    */
/* Archivo 600's widest advance in each of textFit's classes, in em,    */
/* rounded up: the 'text' estimate for labels and values.               */
/* ==================================================================== */

/** The characters every table is indexed by: U+0020 to U+007E, textFit's typographic marks, then the catalogue names' own letters. */
export const ADVANCE_CHARS: readonly string[] = {json.dumps(chars, ensure_ascii=True)};

/** Each exact face's em and its advances, one per ADVANCE_CHARS entry, space-separated. */
export const FACE_ADVANCES = {{
{body}
}} as const;

/** The 'text' class estimate, in em (narrow, lower, cap, wide). */
export const TEXT_CLASS_EM = {{ narrow: {cls['narrow']}, lower: {cls['lower']}, cap: {cls['cap']}, wide: {cls['wide']} }} as const;
"""


# ---------------------------------------------------------------- checking


def theme_fonts():
    """The `fonts` object's values in theme.ts, by key."""
    with open(THEME, encoding="utf-8") as f:
        text = f.read()
    m = re.search(r"export const fonts = \{(.*?)\n\} as const;", text, re.S)
    if not m:
        return None
    return dict(re.findall(r"^\s*(\w+):\s*'([^']+)'", m.group(1), re.M))


def use_fonts_keys():
    with open(LAYOUT, encoding="utf-8") as f:
        text = f.read()
    m = re.search(r"useFonts\(\{(.*?)\}\)", text, re.S)
    if not m:
        return None
    return dict(re.findall(r"^\s*(\w+):\s*require\('([^']+)'\)", m.group(1), re.M))


def face_metrics():
    """FACE_METRICS in lineMarks.ts: face -> (ascent, descent)."""
    with open(LINE_MARKS, encoding="utf-8") as f:
        text = f.read()
    return {
        face: (float(a), float(d))
        for face, a, d in re.findall(r"^\s*(\w+):\s*\{\s*ascent:\s*([\d.]+),\s*descent:\s*([\d.]+)", text, re.M)
    }


def contours(font, glyph):
    return font["glyf"][glyph].numberOfContours


def has_feature(font, tag):
    return "GSUB" in font and any(fr.FeatureTag == tag for fr in font["GSUB"].table.FeatureList.FeatureRecord)


def check():
    problems = []

    # 1. The sources are the pinned files.
    for name, pin in SOURCES.items():
        path = os.path.join(SRC, name)
        if not os.path.exists(path):
            problems.append(f"missing source {rel(path)}")
        elif sha256(path) != pin:
            problems.append(f"{rel(path)} is not the pinned file (sha256 {pin[:8]}…)")

    # 2. Each shipped file exists, with its names.
    fonts = {}
    for stem, _source, location, family, style, _face in CUTS:
        path = os.path.join(OUT, stem + ".ttf")
        if not os.path.exists(path):
            problems.append(f"missing {rel(path)}")
            continue
        font = TTFont(path)
        fonts[stem] = font
        name = font["name"]
        want = {1: family, 2: style, 4: f"{family} {style}", 6: f"{family}-{style}", 16: family, 17: style}
        for nid, value in want.items():
            got = name.getDebugName(nid)
            if got != value:
                problems.append(f"{rel(path)}: name ID {nid} is {got!r}, not {value!r}")
        src = TTFont(os.path.join(SRC, _source), lazy=True)
        for nid in (0, 13, 14):
            if name.getDebugName(nid) != src["name"].getDebugName(nid):
                problems.append(f"{rel(path)}: name ID {nid} differs from its source's")

    # 3. theme.ts names only shipped cuts, each a useFonts key that loads that file.
    tfonts = theme_fonts()
    keys = use_fonts_keys()
    if tfonts is None:
        problems.append("cannot find `export const fonts = {…} as const;` in src/constants/theme.ts")
    if keys is None:
        problems.append("cannot find `useFonts({…})` in src/app/_layout.tsx")
    if tfonts and keys is not None:
        stems = {c[0] for c in CUTS}
        for key, value in tfonts.items():
            if value not in keys:
                problems.append(f"fonts.{key} is '{value}', which is not a useFonts key in _layout.tsx")
            elif os.path.basename(keys[value]) != value + ".ttf":
                problems.append(f"useFonts key {value} loads {keys[value]}, not {value}.ttf")
            if value not in stems:
                problems.append(f"fonts.{key} is '{value}', which this script does not build")
        for key, path in keys.items():
            if key not in stems:
                problems.append(f"_layout.tsx loads {key}, which this script does not build")

    sedgwick = fonts.get("SedgwickAveLatin_400Regular")
    anton = fonts.get("AntonLatin_400Regular")
    archivo = [fonts[s] for s in ("ArchivoLatin_400Regular", "ArchivoLatin_500Medium", "ArchivoLatin_600SemiBold") if s in fonts]

    # 4. Sedgwick's zero is the unslashed one.
    if sedgwick:
        n = contours(sedgwick, "zero")
        adv = sedgwick["hmtx"]["zero"][0]
        if n != 2 or adv != ZERO_ADVANCE:
            problems.append(f"Sedgwick's zero has {n} contours and advance {adv}, not 2 and {ZERO_ADVANCE}")

    # 4b. And no accented letter is wider than its base letter and its accent's overhang (accented_advances).
    if sedgwick:
        wide = [
            chr(cp)
            for cp, name in sorted(sedgwick.getBestCmap().items())
            if (t := accented_target(sedgwick, cp)) is not None and sedgwick["hmtx"][name][0] > t
        ]
        if wide:
            problems.append(f"Sedgwick's {''.join(wide[:12])}{'…' if len(wide) > 12 else ''} keep upstream's empty room after them: rebuild")

    # 4c. And its ligatures join letters, and never draw a picture in place of a word (letter_ligatures_only).
    if sedgwick:
        pictures = sorted(
            {lig.LigGlyph for st in ligature_subtables(sedgwick) for ligs in st.ligatures.values() for lig in ligs}
            - LETTER_LIGATURES
        )
        if pictures:
            problems.append(f"Sedgwick still forms {', '.join(pictures)}: rebuild")

    # 5. Every character of every catalogue name is drawn by the marker and by all three Archivo cuts.
    chars = catalogue_chars()
    for stem, font in [("SedgwickAveLatin_400Regular", sedgwick)] + [(f["name"].getDebugName(6), f) for f in archivo]:
        if not font:
            continue
        cmap = font.getBestCmap()
        missing = "".join(ch for ch in chars if ord(ch) not in cmap)
        if missing:
            problems.append(f"{stem} cannot draw {missing!r} from the catalogue's names")

    # 6. Anton has what the press sets.
    if anton:
        cmap = anton.getBestCmap()
        for ch in "0123456789N°":
            if ord(ch) not in cmap:
                problems.append(f"Anton has no {ch!r}")

    # 7. lineMarks.ts's ascent and descent are the fonts' hhea, to 3 decimals.
    metrics = face_metrics()
    for face, font in (("display", sedgwick), ("sub", anton), ("text", archivo[0] if archivo else None)):
        if not font:
            continue
        upem = font["head"].unitsPerEm
        hh = font["hhea"]
        if hh.lineGap:
            problems.append(f"{font['name'].getDebugName(6)} has a line gap of {hh.lineGap}")
        want = (round(hh.ascent / upem, 3), round(-hh.descent / upem, 3))
        got = metrics.get(face)
        if got is None or (round(got[0], 3), round(got[1], 3)) != want:
            problems.append(f"FACE_METRICS.{face} in lineMarks.ts is {got}, the font's hhea is {want}")
    for font in archivo[1:]:
        if (font["hhea"].ascent, font["hhea"].descent) != (archivo[0]["hhea"].ascent, archivo[0]["hhea"].descent):
            problems.append(f"{font['name'].getDebugName(6)}'s hhea differs from Archivo 400's")

    # 8. The Archivo cuts are static, and have tabular figures.
    for font in archivo:
        if "fvar" in font:
            problems.append(f"{font['name'].getDebugName(6)} is still variable")
        if not has_feature(font, "tnum"):
            problems.append(f"{font['name'].getDebugName(6)} has no tnum")

    # 9. The licences are the sources', byte for byte.
    for dest, source in LICENSES.items():
        a, b = os.path.join(OUT, dest), os.path.join(SRC, source)
        if not os.path.exists(a):
            problems.append(f"missing {rel(a)}")
        elif open(a, "rb").read() != open(b, "rb").read():
            problems.append(f"{rel(a)} is not {rel(b)}")

    # And the advance tables are this build's.
    if len(fonts) == len(CUTS):
        try:
            with open(ADVANCES, encoding="utf-8") as f:
                if f.read() != advances_ts(fonts):
                    problems.append(f"{rel(ADVANCES)} is stale: run python3 scripts/build-fonts.py")
        except FileNotFoundError:
            problems.append(f"missing {rel(ADVANCES)}")

    if problems:
        for p in problems:
            print(f"  {p}", file=sys.stderr)
        print(f"\n  build-fonts: {len(problems)} problem(s).\n", file=sys.stderr)
        sys.exit(1)
    print(f"\n  build-fonts: the five cuts, their licences and {rel(ADVANCES)} match the pinned sources.\n")


def main():
    if "--check" in sys.argv[1:]:
        check()
        return
    for name, pin in SOURCES.items():
        if sha256(os.path.join(SRC, name)) != pin:
            sys.exit(f"  build-fonts: {name} is not the pinned file")
    os.makedirs(OUT, exist_ok=True)
    fonts = {}
    total = 0
    for stem, source, location, family, style, _face in CUTS:
        data = build_cut(stem, source, location, family, style)
        path = os.path.join(OUT, stem + ".ttf")
        with open(path, "wb") as f:
            f.write(data)
        fonts[stem] = TTFont(io.BytesIO(data))
        total += len(data)
        print(f"  {rel(path)}  {len(data):,} bytes")
    for dest, source in LICENSES.items():
        with open(os.path.join(SRC, source), "rb") as f, open(os.path.join(OUT, dest), "wb") as g:
            g.write(f.read())
    text = advances_ts(fonts)
    with open(ADVANCES, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"  {rel(ADVANCES)}  {len(text) / 1024:.1f} KB")
    print(f"\n  build-fonts: five cuts, {total:,} bytes ({total / 1024:.0f} KB).\n")


if __name__ == "__main__":
    main()
