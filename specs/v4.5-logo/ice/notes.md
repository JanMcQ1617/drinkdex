# Sipply logo, direction "Ice" (slug `ice`), v2

v1 (the cube and sparkle) is preserved in `v1/`.

## Concept
The dot of the i in a heavy lowercase "sipply" is a small faceted ice cube, drawn as a real 3D cube with its edges cut as gaps. The app icon is that cube floating in Campari: above the waterline it is ice-white, and below it you see it through the drink. It is a bold, sticker-like object with no faces, no cup, no candy and no sparkle.

## Files
| file | what |
|---|---|
| `mark.svg` | the cube alone, Campari #D0102C, one colour, 1024 square viewBox, centred on its bounding box. Facets are gaps and the glint is cut out (even-odd) |
| `mark-ink.svg`, `mark-white.svg` | the same in ink #0A0A0A (tinted/monochrome icons) and in white |
| `wordmark.svg` | "sipply", #D0102C, tight viewBox `10 -846.87 2594 1011.87` (font units, baseline y 0, x-height 528) |
| `wordmark-white.svg`, `wordmark-ink.svg` | white (for use on red) and ink |
| `icon.svg` → `icon-1024.png` | 1024 square, opaque (`hasAlpha: no`), corners not rounded |
| `splash.png` | red mark on a transparent 1024 canvas. The art is 682 px wide, so it draws about 147 pt wide when the image is 220 pt, centred |
| `home.png` | the real v4.4 Campari Home (`home/index.html`, rendered with `home/tools/render.sh campari-home`) with `<img src="../wordmark.svg">` at left 16, top 66, height 33.13 px |
| `board.png` | 2400 × 1500 review sheet |

**In the app:** set the wordmark by **height 33.13 pt** (top 66). That keeps exactly the v1 letter scale (31 pt for the old box, x-height about 17 pt) and the same baseline. The box is taller only because the cube dot now stands higher.

## Fonts
- **Bricolage Grotesque** ExtraBold (wght 800, opsz 96, wdth 100). Licence: SIL Open Font License 1.1. Source: Google Fonts (css2 API → fonts.gstatic.com). It is outlined to paths with opentype.js, so the shipped SVGs contain no `<text>` and no font references.
- **Hand-drawn / built geometry:** the cube (in the dot, mark and icon), its glint, the waterline, and the sliced descender feet on both p's.
- Inter (already in repo `assets/fonts`) appears only in the board captions.

## How it is built
Everything comes from one script, run as `node build2.js <out> final2.json`. The script is `build2.js` with `cube3d.js` in scratchpad `logo/ice/tools/`. To change something, edit a number there and rebuild. Don't hand-edit the SVGs.
- **Cube:** a true orthographic projection of a cube, rotated yaw 26°, pitch 24° and roll −10°, so the front, top and right faces show. Each face is a rounded square drawn in its own plane, so the rounding skews correctly. The corner radius is 0.11 × side (0.22 on a side of 2). Each face is inset 0.0325 × side, so the three edges read as cut gaps that meet in a Y. The depth comes from the object's own geometry, so there is no separate extrusion or shadow.
- **Glint:** one diagonal capsule streak on the front face, in face coordinates from (−0.66, −0.20) to (−0.20, −0.66), half-width 0.075. It is mapped through the same projection, so it lies on the face. The glint is always **lighter than the surface it sits on**. On the icon it is pure white on a #FCE9EC face. On every one-colour version it is a cut-out, so it shows the paper.
- **Icon:** a #D0102C ground with a #A80C23 "drink" below a flat waterline at y 622. The cube is 420 side, centred at (508, 540), and its art spans 226–798 × 262–811, about 56 % of the tile, well inside the iOS mask. Above the line, the top face is white and the front and right faces are the single Campari tint #FCE9EC. Below the line, the same faces are drawn in #D0102C over #A80C23, so the ice shows through the drink. That uses the four allowed colours and nothing else.
- **Wordmark:** Bricolage glyphs with −8 unit tracking. The i's own dot is removed. The tittle is the same cube, one colour, size 205 (about 1.15–1.25 × the 162-unit stem across its front face). Its front face is centred over the stem, its lowest point sits 50 units above the x-height, and its facet gap is widened to 0.1 so the facets survive at display sizes. The tittle has no glint. **Custom letters:** both p descenders end in a foot sliced at 12°, rising to the right like the cube's tilt. That is the "cut ice" detail that separates it from cherry's Bricolage lockup at display sizes.

## Changes from v1 (judges' fixes)
Accepted:
- **Sparkle dropped** (gen-z, risk). It was the 2024–26 AI glyph. Dropping it also removes the curve-language clash craft flagged.
- **The cube reads as ice, not a tile.** It is a real 3D cube with three faces, cut facet edges and sharper corners (0.11 × side). It floats at a waterline in a red drink, which settles sugar cube, marshmallow and die. The waterline crops the cube, so it is no longer a tile inside a tile.
- **The glint is lighter than its surface** (craft). It is one diagonal streak, as risk suggested. The v1 arc and dot that spelled "r." and looked like a viewfinder are gone.
- **Extrusion problem gone** (craft). The depth is the cube's own side face, along its own axes.
- **The cube dominates at 29 pt** (craft). With the sparkle gone, it is the only object. At 58 px it still reads as a cube in liquid.
- **Wordmark tittle bigger and squarer.** It is now a 3D cube about 1.2 × the stem, with a hexagonal cube silhouette even at 31 px. It has no glint at any size, which covers "drop its glint at 1x".
- **One custom letter feature** (gen-z): the sliced p feet.
- **Film:** no squash or overshoot, and the clink-and-settle is physical (see below).

Rejected or changed:
- **Two cubes stacked or knocking** (gen-z). I did not render it: two white rounded cubes tumbling on red is the universal **dice** icon. That is a gambling cue, which is worse than ambiguous. I used the gen-z alternative instead, "cube partly cropped", where the waterline does the cropping.
- **A custom y** (my own try at the "custom letter" fix). I built a straight, sliced-stem y and rendered it. It made the word stiff and q-like and killed the playful curl, so I reverted it.
- **"Shrink the sparkle 40%."** Superseded by dropping it.

## Launch film (5 s, muted)
It opens on the white launch screen with the red cube centred, exactly as `splash.png` shows it. At 0.2 s the cube drops about 40 px and the camera's world gains a waterline: a Campari-red fill wipes up from the bottom edge to just under the cube's middle, so the cube sits in the drink. From that frame the cube shows its icon colouring, white above the line and red seen through the liquid below. A second, unseen cube is implied by a single quick clink: the cube jolts 6 px sideways and rotates 3°, the waterline ripples once, and it settles with a short ease-out. There is no bounce, squash or overshoot, so it moves like glass, not a character. At about 1.6 s the glint streak wipes across the front face once. At 2.0 s the red drink drains back down and out, and the cube lifts, shrinks and turns into the tittle position while "s", "i", "pply" rise from 12 px below with a 40 ms stagger. The full red wordmark is centred on white by about 2.8 s. Hold until 3.6 s, then the wordmark scales down and travels to its Home position (16, 66, 33.13 pt tall) while the feed fades in beneath it. The film ends on the white app page by 5.0 s. It uses only red, deep red, the tint and white, with no pour, no people and no sparkle.

## Risks
- **Box or package.** In one colour (the ink and white marks), a three-face cube can read as a parcel or "3D/AR" glyph. The glint and rounded corners pull it toward ice. The full-colour icon, with the drink, is unambiguous. Check the tinted iOS 18 icon on a device before shipping.
- **Two reds in the icon.** #D0102C above and #A80C23 below is a low-contrast split. That is intentional, because it is the drink and it should be quiet. At 29 pt @1x the cube still reads, but the waterline is only a darker band.
- **Pink.** The tint is kept very pale (#FCE9EC) so the cube reads as white ice catching red, not as a pink candy cube. Don't push the tint darker in marketing.
- **Minors / 1.4.3.** It has no face, mascot, toy, candy or cup. It shows a drink with ice, which is an adult product cue, but it stays plain and sticker-bold without being childish. Never animate the cube as a creature.
- **Look-alikes.** It isn't Campari's serif wordmark, Coca-Cola's script, a banded red/white circle, a flame, Untappd or Vivino. Before committing, search the App Store's drinks, social and **delivery/parcel** shelves for red tiles with a white 3D cube.
- **Font.** Bricolage is also cherry's face and is popular with startups. The ownable parts are the 3D cube dot and the sliced p feet, so trademark the lockup.
- **The p slices disappear below about 60 px type.** That is harmless, and at app size the cube dot carries the identity alone.
