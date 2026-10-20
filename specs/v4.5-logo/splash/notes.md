# Sipply logo, direction "Melt & splash" (slug `splash`)

## Concept
Sipply is poured, not printed. A fat, juicy italic "sipply" in Campari red melts at the baseline and the dot of the i is a drop. The icon is the tile itself dipped in Campari, with a big white s and the red running off it in glossy drips.

## Files
- `icon-1024.png`: the iOS icon, 1024 square, opaque (checked `hasAlpha: no`), corners not rounded. **White ground, red mark.** The top 59% is Campari red holding a white s with a hard #A80C23 shadow. The lower edge pours into four drips and a falling drop, each with a crisp white gloss oval.
- `mark.svg`: the standalone mark, a red rounded tile melting into drips, with a white s, a hard shadow and gloss. Square viewBox. `mark-flat.svg` has no shadow or gloss. `mark-ink.svg` and `mark-white.svg` are true one-colour versions, with the s cut out by a mask, for tinted or monochrome icons.
- `wordmark.svg` (Campari), `wordmark-white.svg` (for use on red), `wordmark-ink.svg`. Flat, tight viewBox.
  - Sizing: at "font size" F px the image is `F x 1.185` tall and its baseline sits `F x 0.855` below the top. Home uses F = 31: 36.74 px tall, top at 69.1, so the baseline lands on Playfair's old baseline (y = 95.6). The drips end at about y = 105.8, inside the 107 top bar.
  - x-height matches Playfair 28 at F = 28. I went to 31 because lowercase Shrikhand has less mass than a capital S.
- `splash.png`: `mark.svg` drawn 800 px wide, centred on a transparent 1024 canvas. At the app's `imageWidth: 220` it shows about 172 pt wide on white.
- `home/`: a copy of the v4.4 mock with the Playfair span swapped for `<img src="../wordmark.svg">`, plus `campari-home.png`.
  - The render tool's profile root was renamed to `/tmp/sipply-logo-chrome-splash-home`. The original's end-of-run `pkill` on `/tmp/sipply-v44-chrome` would have killed other copies running in parallel.
- `board.png`: the review sheet.

## Fonts
- **Shrikhand** Regular by Jonny Pinhorn, SIL Open Font License 1.1. Fetched from Google Fonts (fonts.googleapis.com css2, fonts.gstatic.com TTF). It is used only as outlines (converted to paths with opentype.js). No font file is referenced by any deliverable.
- Drips, drops, gloss ovals and the dipped tile are **hand-built** geometry (bezier code, no font).
- The board labels use Inter from the repo's own `assets/fonts`. Inter is not part of the logo.

## How it is built
Generators live in the scratchpad (`scratchpad/logo/splash/tools`). `build.sh` rebuilds every deliverable.

- **Wordmark**
  - "sipply" in Shrikhand at 1000 upm with the font's kerning.
  - The tittle contour of the i is removed and replaced by a teardrop: radius 1.04 x the tittle, height 2 x radius, leaning 12 degrees with the italic.
  - Three drips hang from the s bowl, the i foot and the l foot, at lengths 210, 330 and 250 units. Each drip:
    - finds the glyph's real bottom edge by ray-casting the flattened outline;
    - leaves the letter through tangent-matched fillets (the edge slope is sampled, so curved bottoms don't notch);
    - runs straight, with neck widths 112 to 124 units;
    - swells gently (x1.1) into a round end.
  - Added shapes are re-wound to the glyph's direction, so they union under nonzero fill. The p counters keep their own winding.
- **Icon and mark:** a block whose straight lower edge carries drips built from the same profile. Corner drips on the mark continue the tile's sides. The s is Shrikhand's s at 416 px (icon) or 320 px (mark), with a hard 12/16 px #A80C23 offset shadow. The gloss is crisp white ovals at about 0.17 x 0.32 of each round end's radius, rotated 28 degrees.
- **Colours:** #D0102C, #A80C23, #FFFFFF, #0A0A0A (ink versions). No tint was needed.

## Launch film (5 s, muted)
- **0.0 to 0.6 s:** we open on the white splash with the mark centred. The s holds still while the red tile under it wobbles once, like jelly.
- **0.6 to 2.4 s:** the drips start to run. Each one stretches down with ease-in gravity, the long middle drip lets go of its drop, and the gloss ovals ride along.
- **2.4 to 3.6 s:** the camera follows the drop down while the tile above melts away into a red sheet that slides past the bottom of the frame. On the way the white s turns into the lowercase "sipply" wordmark, built letter by letter, with its own three drips beading out under it.
- **3.6 to 4.4 s:** the dropped drop hits the bottom edge in a small crown splash (five crisp beads, no blur) that pops and clears.
- **4.4 to 5.0 s:** the wordmark shrinks and travels to its home-bar position (16, 69) and lands on the white app page, with the drips giving one last settle.

## Risks
- **Blood reading.** Red drips on white can say horror or Halloween. The cheerful Shrikhand forms, short fat round drips, and white gloss push it toward syrup and paint. Still, test with a few 18 to 24 year olds and never pair it with dark or black backgrounds in marketing. The dark home-screen row is the icon's weakest look.
- **Drip trope.** Paint-drip logos are common in streetwear. Distinctiveness rests on the Shrikhand s plus the dipped tile, not the drip alone. Sherwin-Williams also uses red paint dripping, but over a globe, so it's not close in form.
- **Two-tone tile.** Red top, white bottom, square. The drips break any Poke Ball echo (no circle, no band), but don't simplify the drips away.
- **The question mark trap.** A single centred drip plus a dot under an s reads as "?". That's why the icon has four drips and the drop sits under an off-centre drip. Keep it that way in any redraw.
- **Small sizes.** At 1x 29 px the gloss ovals and the drop blur into a few pixels. It's legible but busy, so a 29 to 40 px Settings/Spotlight variant could drop the gloss (`mark-flat` logic).
- **Light wallpapers.** The icon's white lower 41% merges with very light wallpapers. That's normal for white-ground icons, but its silhouette is a red block, not a full square.
- **Under-18 appeal.** There are no characters, faces, candy or toy cues and no sippy cup. Shrikhand is retro-display, not kiddie. Keep the motion fast and adult (a pour, not a bounce-and-giggle).
