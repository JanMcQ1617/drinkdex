# Sipply v4.5 logo: "Marker tag" (scribble)

## Concept
Sipply, tagged with a red paint pen: a fast, loose lowercase script you would scrawl on a sticker or a cup. The icon is that script's s on its own. The pen lands top-right, where the paint pools and drips straight down, then it sweeps through the letter and flicks off at the tail.

## Fonts
- Logo: none. Every letterform is hand-drawn as pen centrelines and outlined to paths, so there is no font and no licence to track.
- Board captions only (not part of the logo): Inter, SIL OFL 1.1, from the repo's own `assets/fonts/InterLatin_*.ttf`.

## How it's built
- Every letter is drawn as a centreline: runs of key points joined by centripetal Catmull-Rom curves, with a new run wherever the pen reverses (a cusp), lightly smoothed. The nib is round. Width varies only as a pen would: about 12% heavier on downstrokes, tapered where the stroke flicks off, full and blunt where the pen lands. The slant (shear 0.2, about 11 degrees) is applied to the centreline and never to the nib, so the stroke weight stays even.
- Outlining: each pair of consecutive nib stamps becomes its convex hull, and Clipper unions all of them into clean filled outlines. The SVGs contain only `<path>` elements: no `<text>`, no strokes, no font references.
- Drips are their own strokes. They fall straight down, with no slant, because gravity doesn't slant. Each one leaves the letter through a concave neck, runs as a tube that thickens slightly, and ends in a rounded teardrop tip.
- Wordmark: lowercase "sipply". The s is drawn on its own; "ipply" is one continuous stroke, with the i's entry tick, cusps at the p stems, a closed l loop and a y whose tail sweeps back under the l as a swash, with one small drip under it. Each letter sits up to 5% of the x-height above or below the baseline so it doesn't look typeset. The wordmark's s is the icon's s.
- Icon: red ground (#D0102C) with a white mark, full-bleed, opaque. The s body is 56% of the tile height and the whole mark is centred.
- Colours used: #D0102C, #FFFFFF and #0A0A0A (the one-colour version). I tried a deep-red #A80C23 sticker shadow under the white s and dropped it, because it looked like a smudge at small sizes.
- App size: in Home's top bar the wordmark is an `<img>` 47 px tall at left 14 and top 62. Its baseline lands where Playfair's did, and its x-height (about 18 px) is a little larger than Playfair 28's. Built by `source/build.js`; the pen engine is `source/pen.js` and the letter drawings are `source/glyphs.js`. They need `clipper-lib@6.4.2`.

## Launch film (5 s, muted)
0.0 s: the white splash with the red s, exactly as the launch screen shows it. 0.0 to 0.6 s: the drip at the top-right swells and runs down to full length, the way wet paint drips. 0.6 to 1.4 s: the s un-draws back along its own stroke, tail to landing. Right after, the wordmark draws on in true stroke order with a stroke-dash reveal on the centrelines: the s first, then one continuous pass through "ipply" with the i dot dabbed last, finishing in the y swash, whose drip falls at about 3.0 s. 3.0 to 4.2 s: hold, then the wordmark shrinks and moves to its top-left place in Home's top bar (left 14, top 62, 47 px). 4.2 to 5.0 s: the rest of the page fades up around it on white. The film ends on the real white app page with the wordmark already in place. All motion is ease-out, with no bounce or wobble, so it feels quick and confident rather than cartoonish.

## Risks
- Coca-Cola: red ground with white script is their territory. A single heavy round-nib lowercase s with a drip shares no letterforms with the Spencerian Coca-Cola script or the Campari wordmark. Still, avoid ever setting the full wordmark white on red at very large sizes next to a bottle shot.
- "$" reading: drips under the s read as a dollar sign at icon sizes, which I tested and rejected. The drip now hangs from the top-right landing point, so the left-of-centre spot where a slanted "$" puts its bar stays empty. At 29 pt the drip reads as an apostrophe-like tick ("s'"), which is acceptable but worth a second look.
- Age appeal (Apple 1.4.3): graffiti and tag styling is street and youth culture, but there's no character, candy, toy or toddler cue, and no sippy-cup spout. Keep it away from bubbly pastel treatments.
- The wordmark has three descenders and a swash, so it's tall for its width (aspect about 1.71). In the 45 px top bar the swash's drip comes down to about y 109, a few px into the gap above the stories tray. It's fine in the render, but check it on a small phone.
- The i dot and the swash drip are about 1.5 px at 1x. They hold up, but below about 30 px tall the drip disappears. Don't use the wordmark below 36 px tall.
- These are generated outlines, so a type designer's hand pass on the bowl joins of the two p's and the tail flick of the s would add the last 5%.
