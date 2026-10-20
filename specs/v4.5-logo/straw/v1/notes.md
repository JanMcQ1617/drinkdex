# Sipply, direction "Bendy straw" (slug: straw)

## Concept
A single bendy straw draws the lowercase s of the icon. In the wordmark the straw stands in for the l and leans out over the y. Every other letter has soft, rounded ends. The straw is the only thing cut flat, so it reads as a real object sitting in the word, not as a decoration.

## Fonts
None. Everything is hand-drawn: a monoline built from centerlines, stroked and outlined with skia-pathops (Apache-2.0). No font is embedded, referenced or licensed. Nunito, Fredoka, Unbounded, Rubik, Outfit, Bricolage Grotesque, Lexend and Urbanist (all OFL, from fonts.gstatic.com) were rendered only as a comparison sheet. No glyph from any of them is used.

## How it is built
- **Units.** Baseline is 0 and the x-height is 100. The tube is 25 units wide everywhere (0.25 of the x-height), with round caps.
- **s.** Two elliptical bowls (upper r 17, lower r 18, so the bottom is slightly heavier for optical balance) joined by their internal common tangent. The tangent is solved on circles and then scaled in x, which works because tangency survives an affine transform. That is why the spine has no kinks.
- **i.** A capsule plus a 15.5-radius dot.
- **p.** A capsule stem with a 2.25 superellipse bowl, slightly squared off so it feels current.
- **y.** Two capsules. The right arm runs on into the descender (42 units).
- **l (the straw).** Butt-capped at the baseline. It rises to -112, bends right 50° on a radius of 30, then runs straight for 38 to a flat cut. Corrugation is 3 cuts across the tube, 3 units wide at a 7.5-unit pitch, straddling the start of the bend.
- **Icon mark.** The same s geometry in one tube 128 units wide, with both ends flat (it is all straw). The upper bowl stops at its top and runs straight to the right for 96. There it goes through 3 rib cuts (11 wide, 27 pitch), bends up 50° on a radius of 72, and ends in a flat-cut tip of 112. The mark is fitted to 600 of a 1000 box, nudged 6 left and 4 down for optical centring.
- **Icon colours.** Red ground #D0102C with a white mark. White on red is the one that pops on both light and dark wallpapers. A white tile would disappear on light ones.
- **Colours used.** #D0102C, #FFFFFF and #0A0A0A (the one-colour versions) only. No tints and no gloss.
- **Wordmark in the app.** On Home it is drawn 33.9 px tall. That puts the x-height at 16 px and the baseline at the old Playfair baseline (img at top 69).
- **Files.** mark.svg, mark-white.svg, mark-ink.svg, icon.svg (the icon source), wordmark.svg, wordmark-white.svg, wordmark-ink.svg, splash.svg (the splash source), icon-1024.png (RGB, no alpha), splash.png (RGBA, mark at 54% of the canvas, about 119 pt tall at imageWidth 220), home.png, board.png, and home/ (the copied mock and render tool).
- **Generators.** In the scratchpad at logo/straw/tools: build.py (wordmark), mark.py (icon mark), final.py plus final.json (all deliverables), and geo.py (helpers).

## Launch film (5 s, muted)
- **0 to 0.4 s.** Open on the white splash with the red s centred and still.
- **0.4 to 1.6 s.** The straw "sips": a white highlight runs up the tube from the flat bottom end, through the s, over the three ribs and out of the tip. At the same moment the tip flexes, bending 10° further and springing back, so the ribs visibly squeeze and stretch.
- **1.6 to 2.8 s.** The tip draws the rest of the word. The s glides left and settles into the wordmark's s position, and the other letters write on along their own centerlines (i, then the two p's, then the y), keeping the same 25-unit tube.
- **2.8 to 3.4 s.** The l rises out of the baseline as a fresh straw and does the same small flex.
- **3.4 to 4.2 s.** The finished red wordmark shrinks and moves to the top-left of the screen, into its place in Home's top bar.
- **4.2 to 5 s.** The rest of the white app page fades in under it. It ends on the real Home with the wordmark already in place.

Everything in the film is vector, so it can be built in code (Hyperframes, or Reanimated on the splash).

## Risks
- **Sippy-cup echo.** "Sipply" plus a straw is one step closer to the sippy-cup pun than a glass would be. There is no cup, lid or spout anywhere, the straw is drawn as a bar straw (flat cuts, corrugation), and the type is heavy rather than cute. Still, have someone outside the team read it cold for "kids".
- **Rounded type.** Heavy rounded monoline type sits near kids' edtech. The flat straw cuts, tight spacing and a single Campari red are what keep it 18+. Do not add bounce, faces or extra colours in marketing.
- **Accent at small sizes.** Below about 24 px the straw-l can read as an l with an accent ("ĺ"), and the rib cuts disappear. That is fine in the app bar (it reads as a straw at 34 px) but weak in small print. For any text-sized use, write "Sipply" in Inter.
- **Red-and-white straws.** Red-and-white striped straws suggest candy. The ribs here are cuts across a solid tube, never diagonal stripes. Keep it that way.
- **Comparisons.** A red tile with a white s is a common store shape, so the straw tip is what makes this one recognisable: never crop it, and check the store for lookalikes before shipping.
- **Counters.** At 29 pt 1x the s counters get tight but stay open. If the icon is ever simplified, keep the 128-unit tube; do not thicken it.
- **Home render.** It uses the real v4.4 mock, so it inherits that mock's fonts and photos. Only the wordmark changed.
