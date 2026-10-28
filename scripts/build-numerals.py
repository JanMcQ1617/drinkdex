"""
The outlined numerals' source: Anton's own figures and N (the poster,
v4.10, specs/v4.10/spec.md T.5), with its degree ring for the Dex's Nº sign
(U+00BA), read from the app's font file and flattened to polygons, so the
press's figures (v4.9, specs/v4.9/details/spec.md A.2) are drawn as filled
rings and never set as text: no SVG <Text>, no strokeWidth, no font loaded
by react-native-svg, and rule 6 (three faces, three jobs) is untouched.

WHY THE DEGREE RING. Anton's own masculine ordinal is a tall oval shaped
like its 0 (712 x 1218 units against the 0's 932 x 1792), so an outlined
"Nº 0147" read "N⁰ 0147". Its `degree` is a small round ring, which reads
as the Nº's sign: it is drawn for U+00BA, raised so its top sits on the cap
height (931..1607 becomes 1084..1760), with the degree's own advance. The
text the app passes still says º; only the shape is the ring's.

Anton is a static cut with no overlapping contours, so numeralPath's ring
offsets stay clean. Its thinnest counter is the 0's, 174 units: 4.7pt at
cap 48, which leaves 3.7pt inside the 1pt ring, so rings never meet.

A port of specs/v4.9/details/tools/extract-glyphs.py, which drew the board:
the same reader and the same flattening, so the app's table holds the same
numbers as tools/glyphs.json. It writes the table as TypeScript the app
imports, GENERATED like brand/paths.ts.

Run (repo root):  python3 scripts/build-numerals.py
Check:            python3 scripts/build-numerals.py --check
                  (writes nothing; exit 1 if the table is not this font's)
Writes:           src/components/details/numeralGlyphs.ts

Units: font units, y UP, as the font stores them (unitsPerEm 2048 for
Anton). Quadratic curves are flattened to one point per 1/96 em of chord
(about 0.6pt at a 48pt cap), which is under half a device pixel at 3x
for every size the spec draws; numeralPath.ts then simplifies each contour
at the size it is drawn. Proportional figures, as the font's defaults:
display tracking is numeralPath's, not the table's.

Needs fontTools (pip install fonttools), as the board's tools did.
"""
import json
import os
import sys

from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
FONT = os.path.join(ROOT, "assets/fonts/AntonLatin_400Regular.ttf")
OUT = os.path.join(ROOT, "src/components/details/numeralGlyphs.ts")
CHARS = "0123456789Nº "  # the space sets "Nº 0100" (the drink page figure, spec C.5)
# The Nº's sign is drawn with this glyph, raised to the cap height (the header says why).
ORDINAL = "º"
ORDINAL_GLYPH = "degree"


class FlatPen(BasePen):
    """extract-glyphs.py's pen, verbatim: lines kept, curves flattened by chord."""

    def __init__(self, glyphset, step):
        super().__init__(glyphset)
        self.step = step
        self.contours = []
        self.cur = None

    def _moveTo(self, p):
        self.cur = [list(p)]

    def _lineTo(self, p):
        self.cur.append(list(p))

    def _qCurveToOne(self, p1, p2):
        p0 = self.cur[-1]
        chord = ((p2[0] - p0[0]) ** 2 + (p2[1] - p0[1]) ** 2) ** 0.5 + (
            (p1[0] - p0[0]) ** 2 + (p1[1] - p0[1]) ** 2
        ) ** 0.5
        n = max(2, int(chord / self.step + 0.999))
        for i in range(1, n + 1):
            t = i / n
            u = 1 - t
            self.cur.append(
                [
                    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
                    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
                ]
            )

    def _curveToOne(self, p1, p2, p3):
        p0 = self.cur[-1]
        n = 12
        for i in range(1, n + 1):
            t = i / n
            u = 1 - t
            self.cur.append(
                [
                    u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
                    u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1],
                ]
            )

    def _closePath(self):
        c = self.cur
        if len(c) > 1 and c[0] == c[-1]:
            c.pop()
        self.contours.append([[round(x, 2), round(y, 2)] for x, y in c])
        self.cur = None

    _endPath = _closePath


def read_font():
    font = TTFont(FONT)
    upem = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    gs = font.getGlyphSet()
    os2 = font["OS/2"]
    cap = getattr(os2, "sCapHeight", 0)
    glyphs = {}
    for ch in CHARS:
        name = ORDINAL_GLYPH if ch == ORDINAL else cmap.get(ord(ch))
        if not name or name not in gs:
            sys.exit(f"  build-numerals: no glyph for {ch!r} in {os.path.relpath(FONT, ROOT)}")
        pen = FlatPen(gs, upem / 96)
        gs[name].draw(pen)
        contours = pen.contours
        label = name
        if ch == ORDINAL:
            # Raised whole, so its top sits on the cap height.
            top = max(y for c in contours for _, y in c)
            rise = round(cap - top)
            contours = [[[x, round(y + rise, 2)] for x, y in c] for c in contours]
            label = f"{name}, raised {rise} to the cap height"
        glyphs[ch] = {"name": label, "advance": gs[name].width, "contours": contours}
    return upem, cap, glyphs


def table(upem, cap, glyphs):
    """The TypeScript, one glyph a line, so a font change shows in a diff as the glyphs it moved."""
    rows = []
    for ch in CHARS:
        g = glyphs[ch]
        key = json.dumps(ch)  # "º" for the ordinal: the source stays ASCII
        contours = json.dumps(g["contours"], separators=(",", ":"))
        rows.append(f"  {key}: {{ advance: {g['advance']}, contours: {contours} }}, // {g['name']}")
    body = "\n".join(rows)
    return f"""/* ==================================================================== */
/* GENERATED by scripts/build-numerals.py from                          */
/* assets/fonts/AntonLatin_400Regular.ttf. Do not edit: run it again    */
/* if the font changes; --check says if this is current.                */
/*                                                                      */
/* Anton's figures, N, its degree ring raised to the cap for the Nº's   */
/* sign (U+00BA; specs/v4.10/spec.md T.5) and the space, as polygons in */
/* FONT UNITS, y UP, curves flattened to 1/96 em. numeralPath.ts draws  */
/* them as the press's outlined figures (specs/v4.9/details/spec.md     */
/* A.2). Paint-free and import-free, so node runs it as it is for the   */
/* proof (scripts/render-details.mjs).                                  */
/* ==================================================================== */

/** One glyph: its advance width and its contours, in font units, y up. */
export interface NumeralGlyph {{
  advance: number;
  contours: [number, number][][];
}}

/** The font's em and cap height, in its units: numeralPath scales a cap of `capHeight` units to the cap it draws. */
export const NUMERAL_FONT = {{ unitsPerEm: {upem}, capHeight: {cap} }} as const;

/** The characters the press sets, by character. Anything else is not in the table, and numeral() skips it. */
export const NUMERAL_GLYPHS: Record<string, NumeralGlyph> = {{
{body}
}};
"""


def main():
    check = "--check" in sys.argv[1:]
    upem, cap, glyphs = read_font()
    text = table(upem, cap, glyphs)
    rel = os.path.relpath(OUT, ROOT)
    if check:
        try:
            with open(OUT, encoding="utf-8") as f:
                same = f.read() == text
        except FileNotFoundError:
            same = False
        if not same:
            print(f"  stale  {rel}", file=sys.stderr)
            print("\n  build-numerals: the glyph table differs from the font. Run python3 scripts/build-numerals.py.\n", file=sys.stderr)
            sys.exit(1)
        print(f"\n  build-numerals: {rel} matches {os.path.relpath(FONT, ROOT)}.\n")
        return
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(text)
    counts = {ch: len(g["contours"]) for ch, g in glyphs.items()}
    print(f"  {rel}  {len(text) / 1024:.1f} KB  contours {counts}  upem {upem}  cap {cap}")


if __name__ == "__main__":
    main()
