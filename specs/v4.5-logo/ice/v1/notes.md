# Sipply logo, direction "Ice and sparkle" (slug `ice`)

## Concept
The dot on the i in a heavy lowercase "sipply" is a tilted ice cube, and the app icon is that same cube blown up with a sparkle beside it, as if it just caught the light. It looks like a bright sticker you would actually keep on a home screen. There are no characters, no faces and no cup, so it reads 18 to 24 and not kid.

## Files
| file | what |
|---|---|
| `mark.svg` | cube + sparkle, Campari #D0102C, 1024 square viewBox, optically centred, outlined |
| `mark-ink.svg`, `mark-white.svg` | the same mark all-ink #0A0A0A (tinted/monochrome icons) and all-white |
| `wordmark.svg` | "sipply" lockup in #D0102C, tight viewBox `10 -784.75 2600 946.75` (ratio 2.746:1) |
| `wordmark-white.svg`, `wordmark-ink.svg` | white (for use on red) and ink |
| `icon.svg` → `icon-1024.png` | Campari ground, white cube, #A80C23 extrusion; 1024 square, opaque (hasAlpha: no), corners not rounded |
| `splash.png` | the red mark on a transparent 1024 canvas (art spans about 660 px, so roughly 140 pt when drawn 220 pt wide) |
| `home.png` | the real v4.4 Campari Home (`home/index.html`, rendered with `home/tools/render.sh campari-home`) with the Playfair "Sipply" replaced by `<img src="../wordmark.svg">` at 31 px tall, left 16, top 68 |
| `board.png` | 2400 × 1500 review sheet |

**In the app:** set the wordmark by height. At **31 pt tall** its x-height (16 pt) and its baseline match where the Playfair title sat, and the cube clears the status bar. At 28 pt it looks a little light next to the 26 pt top-bar icons.

## Fonts
- **Bricolage Grotesque**, ExtraBold (wght 800), opsz 96, wdth 100. Licence: SIL Open Font License 1.1. Source: Google Fonts (css2 API → fonts.gstatic.com), subset TTF kept in the scratchpad `logo/ice/fonts/`. It is outlined to paths with opentype.js and the shipped SVGs have no font references.
- The i's dot is removed and replaced by a **hand-drawn** cube. The cube, its glint, the sparkle and the extrusion are all hand-built geometry. No other type is used. Inter on the board is only there for captions (it is already in the repo's assets).

## How the mark is built
- **Cube:** a rounded square with corner radius = 0.22 × side, rotated −12° (top edge rising to the right). Its glint is cut out as a hole (even-odd fill), so the one-colour versions work automatically. The glint is a corner arc stroke (0.105 × side wide, inset 0.17, centre-line radius 0.16, legs 0.07, round caps) plus a round dot (r 0.055) following it.
- **Sparkle:** a four-point star of radius 112 (on 1024) made of quadratic curves pinched to 0.13 R, upright so it contrasts with the tilt. It sits at the cube's upper-right corner and does not touch it.
- **Icon:** cube side 470 centred at (450, 562), sparkle at (742, 262). The cube is extruded 34 px straight down in #A80C23 for a chunky sticker depth. Only the icon has this; the flat marks drop it. The whole group sits inside the iOS mask with about 150 px of margin.
- **Wordmark:** Bricolage's own glyphs with uniform −8 unit tracking. The dotless i's stem carries a 180-unit cube (same radius, tilt and glint) centred over the stem, 672 units above the baseline. That lifts it slightly above the l's ascender so it "pops".
- Everything comes from one script: scratchpad `logo/ice/tools/build.js` with `tools/final.json`. Change a number there and rebuild rather than editing SVGs by hand.

## Revisions made after looking
1. Glint: the first version was a long L-bracket, and it read as a crop or viewfinder icon. It is now a short corner arc plus a dot, the universal "shiny" cue.
2. Cube corner radius: 0.25 → 0.28 → **0.22**. Softer corners read as a marshmallow or pillow; 0.22 reads as a cube and still looks friendly.
3. Added a #A80C23 extrusion under the cube. At 60 pt it gives depth and sticker quality; below 40 pt it disappears harmlessly.
4. The wordmark carries the glint too. At 28 to 31 pt on a 3x screen it shows as a 1 px highlight, and at display sizes it makes the dot unmistakably ice. A solid-dot version was also tested and was indistinguishable at app size.
5. Wordmark size in Home went from 28.4 to 31 px, because it looked light next to Playfair.
6. Mark re-centred optically for the splash: the bounding box centre is now (512, 503).

## Launch film (5 s, muted)
It opens on the white splash with the red cube and sparkle centred, exactly as the launch screen shows. At 0.3 s the cube tips from −12° to about +6° and drops 20 px, like a cube landing in a glass. It squashes about 6 % on contact and settles back to −12° with one small overshoot (spring, about 0.6 s). As it settles, the glint draws on (stroke-dashoffset, 0.25 s), and then the sparkle scales in from 0 with a quick 15° twist and a single twinkle (scale 1 → 1.15 → 1). At 1.8 s the cube slides left and shrinks to exactly the dot position over the i. Meanwhile "s", "ipply" rise into place letter by letter from 12 px below with a 40 ms stagger, so the full wordmark sits centred at about 2.6 s. The sparkle fades out as the cube becomes the dot. Hold until 3.6 s. Then the wordmark scales down and travels to its top-left Home position (16, 68, 31 pt tall) while the white page stays put, and the feed fades in under it by 5.0 s. The film ends on the white app page with the wordmark already where it lives. Use red only, on white, with no drink pour, no liquid and no people.

## Risks
- **Squircle in a squircle.** A rounded square inside an iOS icon is a familiar shape (Notes-style utility icons, photo widgets). The tilt, glint and sparkle carry the distinction. At 29 pt @1x (Settings and Spotlight) it becomes "white tile + star", which still reads but is generic. Do a search on the App Store's drinks and social shelves before committing.
- **Sparkle cliché.** The ✦ four-point star is everywhere in 2024 to 2026 (AI features use it heavily). Here it is subordinate and paired with ice, but some may read "AI app". If Jan feels that, the fallback is to drop the sparkle and enlarge the cube, which still works because of the glint.
- **"Is it ice?"** A white cube with no blue could read as a sugar cube, marshmallow or die without context. The drinks context (name, screenshots) settles it, but on its own it is ambiguous.
- **Minors / 1.4.3.** Bright red, a sticker look and a sparkle are youthful but have no child cues: no face, no candy, no toy, no cup. Keep marketing from adding faces to the cube or animating it as a character. The film above treats it as an object, never a creature.
- **Look-alikes checked:** not the Campari wordmark (serif caps), not Coca-Cola script, not a red/white banded circle, no flame. The red-ground and white-glyph scheme is common (YouTube, Pinterest, Target); the shape is what makes it ownable.
- **Font:** Bricolage Grotesque is popular with 2024 to 2026 startups. The outlined custom cube dot is the ownable part, so trademark it as the lockup, not the type.
- **Wordmark at 1x:** the glint hole needs a 2x or 3x screen. On 1x web contexts at under 40 px, use the solid version (set `glint` off in build.js) or accept a faintly lighter dot.
