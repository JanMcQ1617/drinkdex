# Sipply v4.5 logo: "Marker tag" (scribble), v2

## Concept
Sipply, tagged with a red paint pen: a fast lowercase script you'd scrawl on a sticker or a cup. The icon is that script's s on its own, thrown on at 9 degrees. The pen lands top-right, where the paint pools and runs straight down. The stroke then sweeps through the letter and flicks off to a point.

## Fonts
- Logo: hand-drawn, no font. I drew every letter as a pen centreline and outlined it to paths, so there is no font licence to track.
- Board captions only (not part of the logo): Inter, SIL OFL 1.1, from the repo's own `assets/fonts/InterLatin_*.ttf`.

## How it's built (v2)
- **Centrelines** are hand-placed cubic Beziers in SVG path syntax (`source/glyphs.js`). A new `M` inside a stroke marks a cusp, where the pen reverses without lifting. v1 used Catmull-Rom curves through point lists, and that is what caused its faceted, lumpy joins.
- **Slant:** a forward shear of 0.2 (about 11 degrees) applies to the centrelines only, never to the nib.
- **Nib:** a slightly flat ellipse (0.8 ratio) held at 35 degrees, so curves get a little thick and thin the way a real marker does. Downstrokes are about 10% heavier. Tapers ease in and out.
- **Pen-down:** where the pen lands on the s, the paint pools: the stroke starts 14% fatter and settles within a few units.
- **Outlining:** each pair of consecutive nib stamps becomes a convex hull, and Clipper unions all of them. Two passes then clean up the result:
  - A closing pass (offset +r, then -r) fillets concave joins so they are tangent-smooth.
  - An opening pass rounds off convex nicks.
  - At drip junctions the fillet is local. It is clipped to a small disc, so it can't web the drip to the spine.
  - The SVGs contain only `<path>` elements: no `<text>`, no strokes, no font references.
- **Drips** fall plumb. The icon's drip is added after the letter is rotated, so gravity doesn't turn with it. Its profile has three parts:
  - It leaves the pool at full width.
  - It necks to 50% of the stroke.
  - It swells evenly into a teardrop at 92% of the stroke.
- **Wordmark:** lowercase "sipply", stroke 21 on an x-height of 100 (v1 was 19).
  - The i's exit rises straight into p1's stem as one stroke.
  - The pen lifts before p2 and again before the l, as tags do. The l flicks in from the baseline with a clearly open loop.
  - The y's tail sweeps back under the l as a swash with one small drip.
  - Each letter sits up to 3 units above or below the baseline.
  - `wordmark-sm.svg` is the same lockup without the swash drip. Use it below 40 px tall.
- **Icon:** red ground (#D0102C) with a white mark, full-bleed and opaque (no alpha). The mark spans 60% of the tile and the s body sits a little above centre.
- **Colours used:** #D0102C, #FFFFFF, and #0A0A0A for the one-colour version.
- **App size:** in Home's top bar the wordmark is an `<img>` 42 px tall at left 14, top 67. Its baseline is at about y 94, where Playfair's was. Its x-height is about 14.7 px, the same as Playfair 28's. The swash drip's lowest point is about y 109, which clears the story rings (y 115) by 6 px.
- **Rebuilding:** run `node source/build.js <outdir>`. It needs `clipper-lib@6.4.2` in `source/node_modules`, which is not committed. `source/dripcmp.js` renders the drip-proportion comparison. `v1/` holds the first version untouched.

## What changed from v1, fix by fix
**Applied**
- Drip (Gen-Z, Craft, Risk):
  - Rebuilt with a tangent-filleted junction, so v1's notch and bump are gone.
  - Longer: 56 units, up from 44.
  - Neck at 50% of the stroke with an even swell into a teardrop bead at 92%. v1's bead was 70%, so it is now about 30% fatter.
  - It reads as wet paint at 58 px and no longer as a nail head.
- Pen character (Gen-Z): the flat elliptical nib plus the pooled pen-down at the landing.
- Coke read (Gen-Z): the icon s is turned 9 degrees further forward while the drip stays plumb. The tilt makes it look thrown on rather than set as a brand mark, and it also gives the drip room to hang clear of the bowl.
- Tail (Craft): the s tail now tapers to a point over 52 units, down to 6% of the stroke. That removes the round nub and the notch where the taper started.
- Wordmark hand pass (Gen-Z, Craft): every letter was redrawn as Beziers. The p bowls finish inside their stems, so there are no notches. p2 no longer knots into p1's bowl, and the l no longer forms a slit against p2's bowl. The l loop is open and stays open at 36 px (see the board's 1x row).
- Size (Craft, Risk): 42 px instead of 47, with a heavier nib. The swash drip is tested at 40 px, and `wordmark-sm` (no drip) covers anything under 40.
- Swash drip (Gen-Z): kept. It clears the stories tray, whose position doesn't change on SE or mini.
- Film (Risk): ease-out only. No extra drips or splatter.

**Rejected or modified**
- Drip neck at 65% (Craft): modified to 50%. I rendered 64% side by side with 50% and 42%. At 64% the tube is too close to the stroke weight, and at 58 px the icon reads as "Sı", a second stroke rather than paint. 50% with a fatter bead keeps Craft's real point (no pin, a gradual swell) and Risk's (enough mass at 29 pt).
- Running the drip off the tile edge (Gen-Z's alternative): rejected. A drip that long becomes a vertical bar beside the s ("S|"), and iOS's corner mask clips it unevenly. The tilt fixes the Coke read without that.
- Hairline split at the landing (Gen-Z's alternative): rejected in favour of the flat nib. A hairline fills in below 60 px, and at 1024 it looks like a crack in the vector.

## Launch film (5 s, muted)
1. **0.0 s:** the white splash with the tilted red s, exactly as the launch screen draws it.
2. **0.0 to 0.6 s:** the pool at the landing swells and the drip runs down to full length with an ease-out, the way wet paint does.
3. **0.6 to 1.4 s:** the s un-draws back along its own centreline, tail first. As it goes, it turns from 9 degrees back to the wordmark's angle.
4. **Through about 3.0 s:** the wordmark draws on as stroke-dash reveals of the real centrelines, in true stroke order with the pen lifts: s, then i into p1 in one pass, the p1 bowl, p2, the l flicking in, and the y ending in its swash. The i dot is dabbed last, and the swash drip falls at about 3.0 s.
5. **3.0 to 4.2 s:** a short hold, then the wordmark shrinks and moves to its spot in Home's top bar (left 14, top 67, 42 px).
6. **4.2 to 5.0 s:** the rest of Home fades up around it on white. The film ends on the real white app page with the wordmark already in place.

All motion is ease-out with no bounce or wobble, so it reads quick and confident rather than cartoonish.

## Risks
- **Coca-Cola:** red with white script is still their territory. Lead with red on white, as Home and the splash do. Never set the full wordmark white on red at large sizes or next to a drink or bottle shot. The board shows white on Campari only because the brief asks for it. The icon is a single tilted, drippy lowercase s, which shares no letterforms with the Spencerian Coca-Cola script or the Campari wordmark.
- **29 pt:** the drip now reads as a drip with a drop, but at 29@1x the bead is about 4 px and could read as a "!" beside the s. It is fine at 40 pt and above. Settings is the only place it gets that small.
- **Age appeal (Apple 1.4.3):** paint-pen tagging is street and youth culture, with no character, candy, toy, toddler cue or sippy-cup spout. Keep it away from pastel, bubbly or sticker-sheet treatments, and from added splatter.
- **Wordmark proportions:** it is tall for its width, so at 42 px it is only about 68 px wide, narrower than Playfair's "Sipply" was. It holds the corner well but is quieter. If Jan wants more presence, 44 px still clears the tray.
- **The two s's:** the icon s is turned 9 degrees and the wordmark s is not. That is intentional, since a tag is thrown on, and the film bridges it. Never place the tilted mark beside the wordmark as one lockup.
- **Craft ceiling:** these are generated outlines from hand-placed curves. A type designer's manual pass on the y-to-swash join would add the last few per cent.

## v2.1: clean icon s (20 Oct 2026)
Jan's pick was "Marker tag, cleaner icon". The wordmark stays exactly as approved. The icon is now the wordmark's own s with no drip, because beside the s the drip read as "S!" or "Sl" at home-screen size. The drip lives only in the wordmark and the intro film. The final set is in `../final/`.
- **Geometry:** `glyphs.js` `cleanMark()` uses the same centreline, nib, pen-down pool and weight (21) as the wordmark's s, plus the wordmark's clean-up pass. A local fillet (0.5 stroke) at the landing smooths the crease where the pool settles into the stroke. It is turned 9 degrees about its bbox centre.
- **Variants** (`../final/icon-variants.png`):
  - A: tilted, at v2 size.
  - B: upright, at v2 size.
  - C: both angles scaled to 70% of the tile.
  - Picked C tilted. The tilt keeps the thrown-on tag, while B reads as a set italic S. With no drip to make room for, the s can fill more of the tile, and it holds at 29@1x.
- **Optical centre:** halfway between the area centroid and the bbox centre, lifted 0.8% of the tile. The centroid alone sits the s low.
- **Splash:** the s at 56% of the canvas, which is about 123 pt at the app's 220 pt. That matches the v2 splash's on-screen size.
- **Android:** the s's farthest point is 296 px from centre, inside the 313 px radius of the 66 dp safe circle.
- **Rebuild:** `node source/final.js ../final && python3 -I source/raster.py ../final && rm ../final/polys.json`, then `source/shot.sh ../final/final-board.png 2400 1620 file://$PWD/source/final-board.html`. `final.js` also writes `geom.json`, which holds the bboxes and the splash pivot for the film. `variants-sheet.py` rebuilds the comparison sheet.
