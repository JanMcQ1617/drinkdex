# Sipply, direction "Bendy straw" (slug: straw), round 2

Round 1 is kept untouched in `v1/`.

## Concept
A single bendy straw draws the lowercase s of the icon, and in the wordmark the straw stands in for the l, rising above every other letter before it bends. Every letter has round ends; only the straw is cut flat (with softened corners), so it reads as a real object in the word, not a decoration.

## Fonts
None. Every letterform is hand-drawn: centerlines stroked and outlined with skia-pathops (Apache-2.0). No font is embedded, referenced or licensed. Nunito, Fredoka, Unbounded, Rubik, Outfit, Bricolage Grotesque, Lexend and Urbanist (all OFL, from fonts.gstatic.com) were rendered once as a comparison sheet in round 1. No glyph from any of them is used.

## How it is built
- **Units.** Baseline is 0 and the x-height is 100. Letters use a 25-unit tube with round caps.
- **s, i, p, y.** Unchanged from round 1: the s is two elliptical bowls joined by their internal common tangent, the p a 2.25 superellipse bowl, the y two capsules with a 42-unit descender.
- **l, the straw (changed).** The tube is 26 units, one unit heavier than the letters to make up for the rib cuts. It is flat-cut at the baseline and rises to -150, well above the i dot (-146), so it reads as an ascender rather than an accent. It then bends right 42 degrees on a 40-unit radius and runs straight for 50 to a flat cut. Its top sits at -222. Two rib cuts sit just below the bend: 6 units wide at a 13-unit pitch, so they come out about 1 px wide at 1x and 3 px on a 3x phone. A 2.5-unit morphological opening softens every corner of the flat cuts. The y now starts 24 units after the straw (was 15), so the tip no longer crowds the y's left arm.
- **Icon mark (changed).**
  - The tube is 118 units wide (was 128). The bowl radii are larger (108 upper, 120 lower; were 94/102), which takes the inner radii from 30 to about 49, so the counters no longer pinch at the spine.
  - The upper bowl runs 70 units right, through two rib cuts (16 wide, 38 pitch), then bends up 59 degrees on a 110 radius (was 72) and ends in a 100-unit tip. The longer, softer bend reads as flex rather than a pipe elbow.
  - **One terminal rule.** Both ends are flat cuts with a 7-unit corner softening. The bottom terminal ends at 128 degrees on the lower bowl, which puts its cut face exactly perpendicular to the tip's cut face, so the two ends now belong to one system.
  - The whole mark leans forward 7 degrees. That tilt is the personality move, and it puts the tip about 52 degrees above horizontal.
  - The mark is fitted to 600 of a 1000 box, nudged 6 left and 4 down for optical centring.
- **Icon colours.** Red ground #D0102C with a white mark. The red tile pops on both light and dark wallpapers; a white tile disappears on light ones. Colours used anywhere: #D0102C, #FFFFFF, #0A0A0A (one-colour versions). No tints, no gloss.
- **Wordmark in the app.** Same 16 px x-height and the same baseline as round 1 and as the old Playfair wordmark (baseline at y 96). Because the straw now rises higher, the image is 42.4 px tall at top 60.5 (round 1 was 33.9 px at top 69).
- **Files.** mark.svg, mark-white.svg, mark-ink.svg, icon.svg (icon source), wordmark.svg, wordmark-white.svg, wordmark-ink.svg, splash.svg (splash source), icon-1024.png (RGB, no alpha), splash.png (RGBA, mark 54% of the canvas, about 119 pt tall at 220 pt wide), home.png, board.png, home/ (the copied mock and render tool), v1/ (round 1).
- **Generators** (scratchpad, logo/straw/tools): build.py (wordmark), mark.py (icon mark), geo.py (helpers, now with `soften` and `rotate`), final.py plus final.json (round-2 parameters; round 1's are in final.v1.json).

## Judges' fixes: what I took and what I didn't
Taken:
- **Three ribs read as Adidas stripes (gen-z, craft).** Two ribs in both the icon and the wordmark. In the icon the cuts are 16 units, not the 3 hairlines of round 1. I tried 20 to 24-unit cuts, and they sliced the tip off the s into a separate shape, which made the "ś" reading worse. 16 is the widest cut that still keeps the tube reading as one piece.
- **Plumbing pipe (gen-z).** The bend radius goes from 72 to 110, the flat-topped run is shorter, the corners are softened and the mark leans.
- **Tilt for personality (gen-z).** The 7-degree forward lean. A backward lean looked like a mistake.
- **Straw-l reads as ĺ (all three).** The stem is now 38 units taller, the bend radius 40 (was 30), the tip 50 (was 38), and the straw is the tallest thing in the word. On the Home render it reads as a straw.
- **Ribs visible at app size (gen-z).** The wordmark ribs went from 3 units wide to 6. They show as two hairlines at 2x.
- **Pinched counters (craft).** Fixed: thinner tube, bigger bowl radii.
- **One terminal rule (craft).** Both ends are now perpendicular flat cuts with soft corners.
- **Room for the y (craft).** Added 9 units.
- **Thicken the straw-l slightly (risk).** It is now 26 against the letters' 25.
- **Tip closer to vertical (risk).** The icon tip goes from 40 to about 52 degrees above horizontal. The wordmark tip goes from 40 to 48.

Rejected:
- **Swap the rounded monoline for a tighter grotesk (risk).** The one-tube system is what ties the straw to the word. A grotesk next to a round tube makes the straw look pasted on, and an off-the-shelf grotesk makes the wordmark generic. What keeps it 18+ instead: flat cuts on the straw, a single Campari red, no faces, no bounce.
- **Round the tube ends fully (gen-z, first half).** I tried a round bottom terminal (variant J in the scratchpad). It turned the s into a worm or a candy cane, which pushes it toward kids. Softened flat cuts got the friendliness without that.
- **Ribs as edge-only notches (gen-z alternative).** Tried both round scallops and square slots. Scallops looked like bite marks. Slots looked like a hose clamp. Both vanished below 60 pt.

## Launch film (5 s, muted)
0 to 0.4 s: hold the white splash with the red straw-s centred and still. 0.4 to 1.2 s: the straw flexes once. The tip springs 10 degrees further over and back, so the two ribs squeeze and open. A single quick white glint crosses the ribs; it is short and subtle, not a sip running up the tube (per the risk note, no juice-box drinking cue). 1.2 to 2.6 s: the s straightens its 7-degree lean, shrinks and slides left into its place in the wordmark, while i, p, p and y write on along their own centerlines in the 25-unit tube. 2.6 to 3.2 s: the l rises from the baseline as a fresh straw, overshoots its 150 height by a hair and settles, then its tip bends over. 3.2 to 4.2 s: the red wordmark scales down and moves to Home's top-left position (x 16, baseline 96). 4.2 to 5 s: the rest of the white app page fades in under it, ending on the real Home with the wordmark in place. Everything is vector, so it can be built in code (Hyperframes, or Reanimated on the splash).

## Risks
- **Sippy-cup and juice-box echo.** "Sipply" plus a straw is still one step closer to the sippy-cup pun than a glass would be. Run a cold read with people outside the team: "what's this app for, and who is it for?" If "kids" or "juice" comes up even once, drop this direction.
- **ś at small sizes.** At 29 to 40 pt 1x the ribs disappear, and the mark becomes an s with an up-right tick. It is attached and tilted now, so it reads less like an accent than in round 1, but it is not gone. That is inherent to a straw-tip-on-an-s idea.
- **Rounded type.** The heavy rounded letters sit near kids' edtech. Never add bounce, faces or extra colours in marketing.
- **Red-and-white straws.** Ribs stay straight cuts across a solid tube. Never use diagonal or candy stripes.
- **Taller wordmark.** At the same x-height the wordmark is now 42 px tall, with the straw tip 1.5 px above the old top bar band. It clears the status bar on the render. Check it on a real device with a Dynamic Island.
- **Store lookalikes.** A red tile with a white s is a common shape. The straw tip is what makes this one recognisable, so never crop it. Check the store before shipping.
- **Home render.** It uses the real v4.4 mock, so it inherits that mock's fonts and photos. Only the wordmark changed.
