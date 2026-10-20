# Sipply logo direction: Cocktail cherry (`cherry`)

## Concept
A Campari-red cocktail cherry whose stem curls into a lowercase-style S, so the fruit you find on a Manhattan or in a Shirley Temple spells the name. The same little mark sits on the i in a heavy, slightly quirky lowercase "sipply", so the icon, the splash and the wordmark are one idea.

## Files
- `mark.svg` - mark alone, Campari red #D0102C, gloss cut out (one path colour), square 1024 viewBox.
- `wordmark.svg` / `wordmark-white.svg` - outlined lockup, tight viewBox `25 -1130.2 2697 1298.2` (font units, em 1000, baseline at y 0).
  At 28 px type the image is **36.35 px tall x 75.5 px wide**, with the baseline **31.65 px below its top**. In Home's top bar that is `top: 64, left: 17` in place of the Playfair span.
- `icon-1024.png` - red ground (#D0102C), white cherry, red gloss. Opaque RGB, square, corners not rounded.
- `splash.png` - red mark on a transparent 1024 canvas, mark ~62% of the canvas (about 136 pt tall when drawn 220 pt wide on white).
- `home.png` - the real v4.4 Home mock (campari row) with the wordmark swapped in; source in `home/` (`home/index.html`, `home/tools/render.sh campari-home`).
- `board.png` - review sheet.

## Fonts
- **Bricolage Grotesque**, ExtraBold 800, static instance at opsz 60 / wdth 100, by Mathieu Triay (Atelier Triay) and the Bricolage Grotesque Project Authors. **SIL Open Font License 1.1.** Downloaded from Google Fonts (fonts.googleapis.com css2 API, fonts.gstatic.com TTF). Letters used: s, dotless i (U+0131), p, p, l, y, with the font's kerning and -12 units of tracking. Outlined with opentype.js, so no font ships with the SVGs.
- The cherry, stem and gloss are **hand-drawn** (built in code, see below).

## How the mark is built
- **Cherry body:** an ellipse (radius 236, 1.03 wide by 0.95 tall) with a narrow radial dimple at the top (12% deep, gaussian sigma 0.17 rad). The dimple gives it the two cherry shoulders, so it reads as a cherry and not a ball. Sampled at 96 points and joined with a closed Catmull-Rom path.
- **Stem / S:** a turtle path of tangent-continuous arcs and straights. It leaves the dimple 14 degrees right of vertical (72 units), turns 90 degrees left at radius 100 (the lower bowl), runs straight for 30 (the spine), turns 160 + 25 degrees right at radius 100 (the upper bowl), and ends in an angled cut. It is drawn as a tapered outline, 60 units wide at the base and 46 at the tip, so it is not a stroke with round caps (round caps read as cute).
- **Gloss:** a single thick arc with round ends at 0.64R, from 196 to 246 degrees, 0.17R thick. In the one-colour versions it is a cut-out.
- **Icon:** the mark fills 74% of the tile, nudged up 6 units, so the cherry's mass sits near the optical centre.
- **Wordmark tittle:** the same mark, scaled so the cherry is 0.95x the i's stem width. It floats 0.42 stem widths above the x-height, and its stem is thickened (80/64 units) so the curl survives at 28 px.
- Generator scripts (geom.js, mark3.js, wordmark.js, build.js, board.js) are in the scratchpad `logo/cherry/tools`. Changing a parameter rebuilds every file.

## Launch film (5 s, muted)
0.0-0.6 s: the white splash holds with the red cherry centred, exactly as the launch screen draws it. 0.6-1.6 s: the S stem unwinds from its tip down into a straight cocktail-pick-straight stem, and the cherry drops a few points as if it had just been pulled from the jar. It bounces once (a short squash of the body only, no face or eyes) while the gloss arc sweeps across it. 1.6-2.8 s: the stem springs back and re-ties itself into the S. While it does, the cherry shrinks and slides up-left into the i of "sipply", and the letters s-p-p-l-y rise in from the baseline behind it, one per 60 ms. 2.8-4.0 s: the full wordmark holds centred in red on white. 4.0-5.0 s: the wordmark scales down and moves to its exact top-left spot in Home's top bar (17, 64, 36.35 px tall) as the feed fades up beneath it. The film ends on the white app page with the real header already in place, so the hand-off has no cut.

## Risks
- **Bomb read in one colour:** a black ball with a curly stem on top can look like a cartoon bomb. That shows up in the all-ink tinted-icon version, and it is the main weakness of this direction. In red the cherry read wins easily; in mono the gloss and dimple are all that save it. iOS 18 tinted icons will show this version.
- **"Cherry = young" pressure:** cherries also mean candy, lip gloss and "cherry" slang. Keeping it flat, glossy, a single fruit with a typographic S, and paired with a heavy grotesk keeps it on the bar side. Never add a second cherry, a face, sparkles or a pink tint. Legal and App Review readers may still associate the S-stem cherry with Cherry Coke-style soda. The colour and type are nothing like Cherry Coke's script, but a reviewer could raise it.
- **Wordmark size:** at 28 px the lowercase "sipply" reads a touch smaller than the old capital-S Playfair word, and the S curl on the tittle is about 1 px thick at 1x (it is clear at 2x/3x). Setting it at 30 px type (38.9 px image) is worth trying in the app.
- **Ground choice:** red ground was chosen because it owns the Campari accent and stands out on both wallpapers. The white-ground version (red cherry) reads more literally as fruit but disappears on light wallpapers; it is kept in the scratchpad as `icon-white-1024.png`.
- **Trademark:** cherry icons are common in fruit, slots and vape brands. Do a clearance search before filing.
