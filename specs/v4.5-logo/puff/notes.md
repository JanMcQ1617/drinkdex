# Sipply logo, direction "puff"

## Concept
Every drink you log becomes a sticker in your book, so the brand is a puffy vinyl sticker: inflated Y2K lettering in Campari red, set tight so the letters overlap, with a die-cut cast shadow. The app icon is one fat, tilted lowercase "s" in white on Campari. It reads like a sticker slapped onto the home screen. It is wide and streetwear-shaped, not a balloon or a toy.

## Files
- `mark.svg`: the red puffy "s", tilted -7°, on a transparent 1024 square. `mark-white.svg` and `mark-ink.svg` are the same silhouette in one colour, for tinted and monochrome icons.
- `wordmark.svg` / `wordmark-white.svg`: flat one-colour "sipply" for the app's 28 px top bar (aspect 3.315:1, so 28 px tall is about 93 px wide).
- `wordmark-gloss.svg` / `wordmark-gloss-white.svg`: the shaded version. Use it only at 64 px type and up.
- `icon.svg` and `icon-1024.png`: red ground with a white mark, opaque, square, no rounding.
- `splash.png`: the red puffy "s" with a pale cast shadow on a transparent 1024 canvas, for the 220 pt launch image.
- `home.png`: the real v4.4 Home mock (campari phone) with `wordmark.svg` at 28 px in place of Playfair. Source and render tool are in `home/`.
- `board.png` (and `board.html`, `board-icons/`).
- None of the SVGs contain `<text>`, fonts, filters, masks or gradients. They are only filled paths, so react-native-svg, Figma and Xcode all read them.

## Fonts
- **Unbounded, weight 900**: SIL Open Font License 1.1, from Google Fonts (TTF from fonts.gstatic.com). It is the base for i, p, p, l and y, which were outlined and then reshaped (see below). No font ships with the logo.
- **The "s" is hand-drawn**: a variable-width brush stroke over a six-segment Bézier spine, used in both the mark and the wordmark.
- The board's labels use Inter, already in the repo at `assets/fonts` (OFL). It is not part of the logo.

## How it's built
Everything was built in code (opentype.js plus clipper-lib polygon offsetting). The scripts live in the session scratchpad at `logo/puff/tools/`: `build.js`, `lib.js`, `sdesign.js`, `brush.js`, `board.js`.
1. **Letters.** Unbounded glyphs get a morphological close of 3 and an open of 18 (font units at 260 px/em). Every convex corner rounds to the same radius as the ball terminals of the hand-drawn "s". The "s" is a round nib swept along its spine, radius 70 to 79 units (plus 10 in the wordmark so it matches the 900 stems). Its apertures are drawn open on purpose: Unbounded's own "s" has hairline slits, and those fill in when puffed.
2. **Tight set.** Each letter is placed by binary search so it overlaps its neighbour by 8 units. The letter underneath is then cut by the next one's outline grown by 8 units, so the overlaps read as die-cut seams on any background. These are geometric cuts, not masks.
3. **Puff.** The volume comes from about 18 to 34 stacked insets of each letter. Each inset shrinks a little and drifts toward the top-left light, with colour ramping from deep #A80C23 at the edge through Campari #D0102C to a 28 % mix with the tint at the core. One tint streak (#F2B5BF) on the top-left of each stroke is the only specular highlight.
4. **Sticker.** The icon and splash add a hard cast shadow: the mark offset down by 30 units, in #A80C23 on red or the tint on white.
5. **Palette.** #D0102C, #A80C23, #FFFFFF, #0A0A0A, and one tint #F2B5BF. The shading steps are blends between those, never a new hue.

## 5-second launch film (muted)
The film opens on the white splash with the red puffy "s" centred and tilted. At 0.0 to 0.6 s it takes a breath: it squashes 4 % and springs back like a squeezed vinyl toy, and a single tint glint slides along its top bowl. At 0.6 to 1.6 s it un-tilts to upright and shrinks to wordmark size while "i p p l y" pop in one by one to its right. Each letter inflates from a flat red silhouette to full puff in 120 ms, landing slightly overlapped, so the word assembles like stickers being laid down. At 1.6 to 3.0 s the finished "sipply" holds centred and the cast shadow eases from 24 to 0, so the sticker settles onto the page. At 3.0 to 5.0 s the wordmark flattens (the shading fades to the flat one-colour version) as it glides and scales to its 28 px spot at the top-left of Home. The page's other chrome fades in under it, and the film ends on the white app page with the wordmark exactly where `home.png` has it.

## Risks
- **Candy read.** Red ground, white puffy "s" and gloss are close to the visual language of candy and soft drinks (Skittles uses a white puffy wordmark on red). I kept the gloss to one streak, used wide, fashion-leaning letterforms (Unbounded), and avoided bounce and rainbow. Jan should still judge whether it reads as candy for under-18s. If it does, the safer fallback is the flat wordmark with the shaded mark used rarely.
- **"Marshmallow" icon.** The white "s" with pink-tint edges can read as soft and sweet. The deep-red cast shadow keeps it graphic. A flat-white variant is one line in `build.js` if it reads too soft.
- **Gloss at small sizes.** The shaded wordmark turns to mush below about 64 px type. The app must use the flat `wordmark.svg` at 28 px (as `home.png` does).
- **Weight.** The flat wordmark is much heavier than Playfair was. It holds the top bar, but it is the loudest thing on Home besides the photo.
- **File weight.** The shaded SVGs are 280 to 370 KB of path data. For the app, use the flat SVGs or rasterise the shaded ones to PNG.
- **Tilt.** The icon "s" is rotated -7°. If Jan wants it upright, change `tilt` in `build.js`.
- **Look-alikes checked.** Not script (Coca-Cola), not a circle with a band (Poké Ball), no flame, no bull, no glass shape, and no cup or spout anywhere (sippy-cup pun avoided).
