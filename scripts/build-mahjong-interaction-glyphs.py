"""Generate portable Kaiti Canvas outlines (requires fonttools).

Usage: python scripts/build-mahjong-interaction-glyphs.py source.ttf
Source: LXGW WenKai Medium v1.522, https://github.com/lxgw/LxgwWenKai
Font outlines remain under SIL OFL 1.1; see minigame/assets/interaction-kaiti-OFL.txt.
Only interaction characters are embedded, not the full desktop font.
"""

import json
from pathlib import Path
import sys

from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont


class CanvasPen(BasePen):
    def __init__(self, glyph_set):
        super().__init__(glyph_set)
        self.commands = []

    def add(self, op, *points):
        self.commands.append([op, *[[round(value, 3) for value in point] for point in points]])

    def _moveTo(self, point):
        self.add("moveTo", point)

    def _lineTo(self, point):
        self.add("lineTo", point)

    def _qCurveToOne(self, control, end):
        self.add("qCurveTo", control, end)

    def _curveToOne(self, control1, control2, end):
        self.add("curveTo", control1, control2, end)

    def _closePath(self):
        self.add("closePath")

    def _endPath(self):
        pass


def main():
    font = TTFont(sys.argv[1])
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    result = {
        "source": "LXGW WenKai Medium v1.522",
        "sourceUrl": "https://github.com/lxgw/LxgwWenKai/releases/tag/v1.522",
        "license": "SIL OFL 1.1; ../assets/interaction-kaiti-OFL.txt",
        "unitsPerEm": font["head"].unitsPerEm,
        "glyphs": {},
    }
    for char in "吃碰杠听胡平和自摸宝中大风夹对过出":
        name = cmap[ord(char)]
        bounds = BoundsPen(glyph_set)
        pen = CanvasPen(glyph_set)
        glyph_set[name].draw(bounds)
        glyph_set[name].draw(pen)
        result["glyphs"][char] = {
            "advance": font["hmtx"][name][0],
            "bounds": bounds.bounds,
            "commands": pen.commands,
        }
    output = Path(__file__).resolve().parents[1] / "minigame/src/interaction-glyphs.js"
    # Native Mini Game loaders resolve JavaScript modules; no JSON-loader dependency.
    header = "// Generated Canvas glyphs; SIL OFL 1.1, see ../assets/interaction-kaiti-OFL.txt.\n"
    output.write_text(header + "module.exports = " + json.dumps(result, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(f"Generated {len(result['glyphs'])} glyphs, {output.stat().st_size} bytes")


if __name__ == "__main__":
    main()
