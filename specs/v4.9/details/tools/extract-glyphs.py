"""
The outlined numerals' source: Inter 600's own digits, N and the masculine
ordinal (the Dex's Nº sign, U+00BA), read from the app's font file and
flattened to polygons, so the numerals are drawn as filled rings (spec A.3)
and never set as text: no SVG <Text>, no strokeWidth, no font loaded by
react-native-svg, and rule 6 (Playfair for drink names only) is untouched.

Run (repo root):  python3 specs/v4.9/details/tools/extract-glyphs.py
Writes:           specs/v4.9/details/tools/glyphs.json

Port (foundation package): the same reader becomes scripts/build-numerals.py
writing src/components/details/numeralGlyphs.ts (GENERATED, like
brand/paths.ts), with --check to say whether it is current.

Units: font units, y UP, as the font stores them (unitsPerEm 2048 for
Inter). Quadratic curves are flattened to one point per 1/96 em of chord
(about 0.4pt at a 40pt numeral), which is under half a device pixel at 3x
for every size the spec draws.
"""
import json
import os
import sys

from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../../../.."))
FONT = os.path.join(ROOT, "assets/fonts/InterLatin_600SemiBold.ttf")
CHARS = "0123456789Nº "  # the space sets "Nº 0100" (the drink page figure, spec C.5)


class FlatPen(BasePen):
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


def main():
    font = TTFont(FONT)
    upem = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    gs = font.getGlyphSet()
    os2 = font["OS/2"]
    out = {
        "font": os.path.relpath(FONT, ROOT),
        "unitsPerEm": upem,
        "capHeight": getattr(os2, "sCapHeight", 0),
        "ascender": font["hhea"].ascent,
        "descender": font["hhea"].descent,
        "glyphs": {},
    }
    for ch in CHARS:
        name = cmap.get(ord(ch))
        if not name:
            sys.exit(f"no glyph for {ch!r}")
        pen = FlatPen(gs, upem / 96)
        gs[name].draw(pen)
        out["glyphs"][ch] = {"name": name, "advance": gs[name].width, "contours": pen.contours}
    # Tabular figures, as the plate's: Inter's tnum lookup maps each digit to a .tf glyph when the font has one.
    with open(os.path.join(HERE, "glyphs.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print("wrote glyphs.json", {k: len(v["contours"]) for k, v in out["glyphs"].items()}, "upem", upem, "cap", out["capHeight"])


if __name__ == "__main__":
    main()
