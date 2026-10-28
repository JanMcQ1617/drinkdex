# Sipply v4.10: the type, in the logo's hand

Jan, 28 Oct 2026, pointing at the red paint-pen wordmark: "I want you to make it so all the text in the app is in this same font, and mix it with subheading and one other font."

This folder began as exploration: three three-font systems, each set from the real font files on the same three build-34 screens, and one recommendation.

**Recommendation: A, Tag. Sedgwick Ave for display, Anton for subheads, Archivo for body and figures.** The reasons are in section 4.

**A was adopted, and is built** (`specs/v4.10/spec.md` T, the lead's final call, which overrides the exploration's numbers where they differ). Sections 2 and 5 below carry the shipped numbers and rules; `board/A-build-checks.png` is the build's check sheet, drawn from the shipped files (`tools/checks.mjs`), and `tools/fit.mjs` now reads the shipped marker and checks the app's own width estimate against Chrome for every name.

## What is here

| Path | What it is |
|---|---|
| `board/00-markers.png` | Every marker candidate next to the drawn wordmark, with x-heights matched (`board/markers.html`). |
| `board/A-tag.png`, `B-menu.png`, `C-label.png` | Each direction's sheet. It shows the three phones and a spec card for each face, generated from the same role table the screens use. |
| `board/<L>-<dir>-home.png`, `-drink.png`, `-dex.png` | Each screen on its own, 440 x 956 @2x: Home at rest, the drink page scrolled to the spec, the Dex at For you. |
| `board/00-all-marker-home.png`, `-drink.png`, `-dex.png` | The control, not a direction: the same three screens with every line in Sedgwick Ave, Jan's words taken literally. Section 2 says what it shows. |
| `board/index.html` | The board. `?d=tag&s=drink` draws one phone, `?d=tag` one sheet, `?d=all&s=drink` the control, and no query the whole wall. |
| `fonts/` | The real files from github.com/google/fonts (`ofl/` and `apache/`), each with its licence text beside it. The nine files the directions use match google/fonts byte for byte (git blob hashes checked against the GitHub API, 28 Oct). |
| `tools/render.sh` | Rebuilds every PNG. Run it from the repo root: `bash specs/v4.10/type/tools/render.sh`. |
| `tools/fontaudit.py`, `coverage.py`, `payload.py`, `fit.mjs` | The measurements in section 3. Each file's header says how to run it. `fit.mjs` reads the shipped subset for A and ends with the build's acceptance (T.9). |
| `board/A-build-checks.png`, `tools/checks.mjs` | The build's check sheet (T.13), from the shipped files at theme.ts's numbers: the 35 names with a 0, wrapped heroes, accents and tails inside their ink room, the tab titles with their swash and count, the poster heads and the post header on one baseline, and the press's figures. |

`tools/shoot.sh` gives headless Chrome its own profile (`/tmp/sipply-v410-type-chrome`) and kills only that profile's processes.

## 1. The logo is drawn, not set

`specs/v4.5-logo/scribble/notes.md` says: "Logo: hand-drawn, no font." Every letter was placed as a pen centreline with a flat 35-degree nib and then outlined. There is no family to license, so the display role needs the closest available hand, not the same font. The wordmark itself stays the drawn paths in every direction; no font replaces it.

The hand being matched has these traits:
- lowercase
- forward slant of about 11 degrees
- tall and narrow
- a near-monoline marker stroke with only a slight thick-thin from the nib
- fast, partly joined letters, with pen lifts the way tags have them

`00-markers.png` sets ten candidates against it:

- **Closest: Sedgwick Ave.** Its project describes it as "handwritten graffiti letterforms", which is literally a "Marker tag". It matches on every trait: narrow, slanted, lowercase, a marker stroke, a tag's rhythm. Its "sipply" is the nearest to the drawn one on the sheet.
- **Next tier: Kaushan Script and Caveat 700.**
  - Kaushan is a brush with real thick-thin. It has more energy than the logo but less of its pen.
  - Caveat is a rounder, neater hand, and the most legible of the set.
- **Rejected:**
  - Sedgwick Ave Display: the lowercase turns into small caps.
  - Mansalva: wide and bouncy, which reads young.
  - Marck Script: a thin calligraphic join with a tiny x-height. It has a Reserved Font Name and no º.
  - Caveat Brush: Caveat with less clarity.
  - Just Another Hand: thin, and its metrics clip.
  - Kalam Bold: a felt-tip classroom hand.
  - Permanent Marker: caps only, and it lacks most of Latin Extended-A.
- **Never considered:** the obvious red-script faces (Yellowtail, Damion, Lobster, Pacifico). In red they turn into Coca-Cola or a candy shop, and both risks are named in the logo notes and in App Store 1.4.3's spirit.

## 2. The three directions

Each direction has the same structure:
- One display face in the logo's hand, for every title and every drink name: hero, grid, the post header, and wherever a name appears inside a sentence.
- One subheading face, for section heads ("The spec", "Sour and citrusy"), plus the press's big outlined Nº and section figures.
- One body face, for everything you read: rows, steps, captions, fields, usernames, chips, and in A and B the figures too.

That is the honest form of "all the text in this font". The marker takes every word you scan. It does not take what you read in paragraphs, at 13 pt, or under Dynamic Type at 2x.

**The literal reading, for comparison** (`board/00-all-marker-*.png`). The control sets every line in Sedgwick Ave, at A's sizes for the display jobs and today's Inter sizes for the rest. It is not a straw man: Sedgwick's x-height is 0.66 of its em, so at 17 the steps and spec rows still read. What breaks is everything around the reading:
- **No hierarchy.** Sedgwick has one weight. "maya.pours" in a caption, "Hurricane" over "glass" and the bold amounts all go flat, and with every line in the hand the drink names stop standing out, which is the one job the hand has. This is type-mix's first rule: never one family for everything.
- **The figures fail.** Sedgwick's zero is slashed (three contours, no alternate), so the count reads "2,Ø89" and the plate "Ø147". Its figures are proportional, so amounts do not line up. It has no º, so the plate's "Nº" patches in the system face mid-word.
- **The 13s get scratchy.** "glass", "abv", "2 hours ago" and "Liked by" are a tag at caption size, and they only get worse under Dynamic Type.

Sizes are matched by x-height, not by number. A marker's x-height runs from 0.40 to 0.66 of its em, against Inter's 0.546, so "title size" is a different number in each face. Each direction stays within 5 cuts. Today's app has 5.

Every role's size, weight and tracking is on the sheets' spec cards. The table below gives the main roles. Today's values are title 28/34, drink hero 52/56, a grid name 17/24, the post header's name 13/18, body 17/24 and small 13/18.

| | A · Tag | B · Menu | C · Label |
|---|---|---|---|
| **Display** (titles, every drink name) | Sedgwick Ave 400 | Kaushan Script 400 | Caveat 700 |
| title / hero / grid name / post name | 36/40 · 60/60 · 22/26 · 19/22 | 34/40 · 54/62 · 21/26 · 18/22 | 40/42 · 66/64 · 25/28 · 21/24 |
| **Subheading** (section heads, outlined figures) | Anton 400, 16/20 caps +0.8 | Instrument Serif 400, 26/30 −0.2 | Geist Mono 500, 13/18 caps +1.4 |
| **Body** (reading, UI) | Archivo 400/500/600 at width 100 | Instrument Sans 400/500/600 | Hanken Grotesk 400/500/600 (small at 14/19) |
| **Tabular figures** (Nº plate, amounts, counts) | Archivo 600 `tnum` | Instrument Sans 600 `tnum` | Geist Mono 500 (monospaced, with `ss09` for an unslashed zero) |
| **Red key** | Sedgwick Ave 24/28 | Instrument Sans 500 17/24 | Hanken Grotesk 600 17/24 |
| Cuts / payload (Latin subset, static) | 5 / **507 KB** | 5 / **412 KB** | 5 / **347 KB** |
| Feel | a tag over a gig poster's caps | a bar's chalkboard over a printed menu | a field notebook, names in pen, labels typed |

The payloads compare with **639 KB** today (654,800 bytes; every payload here is in 1,024-byte KB). The three directions carry the Vietnamese range on top, and still come in under it.

Every direction also has `nameLg`, a drink at title size (a post's wall label, the catch moment), at the title's numbers. It is on the spec cards, not on these three screens.

**A as built** (`specs/v4.10/spec.md` T.2, T.3), where it differs from the table above:

| Role | Shipped |
|---|---|
| `tabTitle` (new: Dex, Saved, Tournaments, My Bar) | Sedgwick 36/46, never scaled (cap 1), with ink room |
| `drinkHero` / `nameLg` / `name` / `nameSm` | Sedgwick 60/76 · 36/46 · 22/28 · 19/24 |
| `emptyTitle` | Sedgwick 22/28, EmptyState only, uncapped |
| `sub` (new: the Dex's and the drink page's section heads) | Anton 16/26, +0.8, capitals by transform (the copy and VoiceOver stay sentence case) |
| `title` | Archivo 600 28/34: a handle, a tournament, collection or place name, never the marker |
| every key (`button`, `buttonSm`), the red key included | **Archivo 600** 17/24, not the marker |
| `plate` | Archivo 600 13/18 +1.0, tabular |
| `nameInline` (a drink inside a sentence) | Archivo 600 at the host's size, not the marker |
| the press's figures | Anton, at cap 48 on both screens |

- **Line heights** are at least each face's natural line, (hhea ascent + descent) x size: Sedgwick 1.249 em, Anton 1.505, Archivo 1.088. Below it React Native's iOS layout does no baseline centring, so 36/40, 60/60, 22/26, 19/22 and 16/20 above were raised. check-design asserts it.
- **Ink room.** iOS clips a Text to its bounds, and Sedgwick's glyphs reach past its own metrics: descenders to 0.433 em under the baseline (descent 0.312), accented capitals to 1.174 em over it (ascent 0.937), a word's A 0.091 em left of its origin and a word's x 0.097 em past its advance. So every marker Text takes padding past its line box (ceil 0.24 x size above, 0.13 below, 0.10 each side) taken back as negative margin: the layout does not move and the ink is whole. Archivo and Anton need none.
- **The zero** is unslashed in the shipped file: Sedgwick's own O, scaled into the zero's box with its advance kept. **Accented letters** lose the empty room upstream leaves after them (its è was 110 units wider than e with the same ink, so "Crème" drew as "Crè me"); an accent that overhangs keeps its room. Both edits are in `scripts/build-fonts.py`.
- **Fit**, from the shipped marker: 88.8% of grid names on one line at 22 in 184, 69.9% of heroes at 60 in 392, the longest name x0.57. The app's estimate (`lib/textFit`, kerns and the f_f ligature allowed for) is never under Chrome's shaped width for any of the 2,089, with a least margin of 1.97%.
- **Payload**: five cuts, 497 KB (508,924 bytes), against build 34's 639, with the Vietnamese range added. It was 511 KB (522,980) until the integration pass dropped Sedgwick's ten picture ligatures ("star1", "arrow2", "hiphop1", "quotesleft" and the rest drew symbols in place of the word); the letter ligatures fi, fl, ff, ffi and ffl stay, and `build-fonts.py --check` holds it.

**A · Tag.** Sedgwick Ave, Anton, Archivo. The wordmark's own street. Sedgwick is the tag, so the titles, every drink name and the one red key read as written by the same pen as the logo. Anton's condensed caps are the gig poster or sticker under it: "THE SPEC", "SOUR AND CITRUSY", and the outlined "Nº 0147" and "01". Archivo is a plain grotesk that disappears. It is type-mix's "sport / streetwear" pairing, Anton with Archivo, with the marker on top.

**B · Menu.** Kaushan Script, Instrument Serif, Instrument Sans. The brush shouts the names. A light editorial serif reads out the sections, like a printed cocktail list. Instrument Sans is its designed-together partner for body. It is the most grown-up and the most "bar". It is also the furthest from the logo's pen, and Kaushan is a much-used brush (gym and surf-shop templates).

**C · Label.** Caveat, Geist Mono, Hanken Grotesk. The Dex as a specimen card: names written in by hand, every label, number and amount typed in a mono ("2 OZ", "SEE ALL 445", "38 / 2,089"). It applies type-mix's highest-leverage move hardest (data in a mono). It also gives the Nº figures a ticket feel. Caveat is the most legible marker, but it is a neat notes hand rather than a tag. Next to the typed labels the whole system leans notes-app or stationery. Geist Mono's default zero is slashed and read as "Ø147". The board uses its `ss09` zero, and the app would need that zero baked into the subset's default cmap, because React Native's `fontVariant` cannot reach stylistic sets reliably.

## 3. The measurements

**Coverage against the real data** (`tools/coverage.py`, all 2,089 names and every description, amount and step):
- Every display, subheading and body face in all three directions draws every Latin name character, including Añejo, Crème de Cassis, Vieux Carré, Żubrówka, Ti' Punch, Brännvin and Cachaça.
- The exceptions are the Vietnamese stacked marks in five names (Rượu Đế, Rượu Nếp, Rượu Rắn, Rượu Thuốc, Cà Phê Trứng Rum). Kaushan, Caveat and both Instruments lack them. **Sedgwick Ave, Anton, Archivo, Hanken and Geist Mono have them.**
- Build 34 already gets those five wrong. Today's Inter and Playfair subsets stop at U+024F, so ắ ế ố ợ ứ fall back to the system font. Direction A would fix that by adding U+1EA0-1EF9 to the subset (`tools/payload.py` includes it).
- **Sedgwick Ave has no º (U+00BA).** That is harmless only because "Nº" is never set in the display face. In every direction it belongs to the figures face. Keep it that way, or the Nº falls back to San Francisco.

**Figures.** Archivo and Instrument Sans have `tnum`, and Hanken's default figures are already tabular. Geist Mono is monospaced. Anton, Sedgwick and Kaushan have proportional figures and no `tnum`. Caveat's figures happen to share one advance, but they are a handwriting hand's. So none of the four may set a count, an amount or a Nº plate. They don't on the board. Sedgwick's slashed zero is one more reason (see the control above). Anton sets only the big outlined figures ("Nº 0147", "01"), where nothing has to line up in a column.

**Small text at 13 pt.** The body faces have x-heights of 0.526 (Archivo), 0.51 (Instrument Sans) and 0.493 (Hanken), against Inter's 0.546. Archivo and Instrument Sans hold 13/18. Hanken needs 14/19, which C uses.

**How the names fit** (`tools/fit.mjs`, Chrome-shaped from the real files):

| Face, grid / hero size | Grid names on one line in the Dex's 184 column | Hero names on one line in 392 |
|---|---|---|
| today, Playfair 700 17 / 52 | 94.5% | 70.4% |
| A, Sedgwick Ave 22 / 60 | 88.7% | 69.9% |
| B, Kaushan 21 / 54 | 91.2% | 78.8% |
| C, Caveat 700 25 / 66 | 91.1% | 75.6% |

DrinkName already fits or wraps the rest. The longest name, "Rothman & Winter Crème de Violette", needs x0.56 to x0.63 in every face.

**Payload** (`tools/payload.py`: static instances, Latin subset, every layout feature) is in the table in section 2. All three come in under today's 639 KB.

**The outlined figures on the board** are drawn as a 2.5 stroke under a page-white fill, so only a 1.25 ring round the silhouette shows. A bare stroke would draw every overlapping contour as a line inside the figure. The variable Geist Mono keeps those overlaps (its N and 1 are two shapes each), and the first renders of C showed them. Anton and Instrument Serif are static cuts and were clean either way.

## 4. Why A

1. **It is the logo's hand.** Jan pointed at the wordmark and asked for that font. Sedgwick Ave is the only candidate built from the same act: a marker tag, lowercase, narrow and slanted. On the Dex, "Dex" in Sedgwick under the red swash reads as the logo's sibling, not as a script sitting beside it. B's brush and C's notebook hand are both good scripts, but neither is that pen.
2. **The roles have maximum contrast with no near-neighbours.** Hand-drawn tag, condensed poster caps and a neutral grotesk are three different classes. B puts two expressive faces, brush and serif, side by side. C's Caveat and mono both pull toward stationery.
3. **It is sharp for 18 to 24, never cute.** Tag plus poster is street and gig culture, the same territory as the logo notes' "paint-pen tagging is street and youth culture". Caveat is the one candidate that risks reading as a cute notes app.
4. **It covers the data best.** It draws every character in every name, including the five Vietnamese names today's build gets wrong. It has tabular figures in Archivo, and its outlined Nº figure in Anton looks like a fight-poster number rather than a footnote.
5. **It stays in budget.** It is 5 cuts and about 507 KB against today's 639 KB, with the Vietnamese range added. Every family is OFL with no Reserved Font Name, so the app's usual subset-and-rename is clean. (Kaushan's RFN would have forced a name with no "Kaushan Script" in it.)

**What to watch in A:**
- **The red key in the marker.** "Post Piña Colada again" is white script on Campari red. The logo notes warn against exactly that pairing at large sizes (the Coca-Cola read). At 24 pt, inside a sentence, on one key, it reads as a tag on a sticker. It is still the first thing to pull back to Archivo 600 if Jan disagrees, and it costs nothing. *As built: the red key is Archivo 600, as every key is (spec 0.5); the board's marker key was not taken.*
- **Anton is loud.** It is only for section heads, at 16 pt in caps, never for a title or a run of words. One head per section, as now.
- **Sedgwick is light-stroked next to the drawn wordmark.** The wordmark's stroke is 21 on an x-height of 100, heavier than Sedgwick's. That is why the board never sets the wordmark and a Sedgwick title side by side at the same size: Home has the wordmark, the other tabs have titles.
- **Grid fit falls from 94.5% to 88.7% at 22.** At 21 it gets closer to today's. DrinkName's fit handles the rest either way.
- **Dynamic Type.** The marker should cap lower than body (today's name caps apply), because a tag at 2x stops reading as a tag.
- **A name inside a sentence.** Today's `nameInline` sets only the family and inherits the sentence's size, which works because Playfair's x-height (0.514) is close to Inter's. Sedgwick's is 0.66 against Archivo's 0.526, so at the sentence's size an inline name stands about 25% taller than the words round it. It needs its own size, about 0.8 of the host's (13.5 in a 17 line, 10.5 in a 13 caption). React Native's nested Text has no `em`, so that means one inline role per host size. Alternatively, keep the inline name in Archivo 600 in captions.

## 5. What adopting A touched (built in v4.10; spec T and F)

- `assets/fonts/`:
  - static instances of Archivo at 400, 500 and 600 (width 100), with Sedgwick Ave and Anton as they ship
  - Latin subsets with U+1EA0-1EF9 added, renamed as the README there describes
  - `LICENSE-*.txt` for each family
  - drop Inter and Playfair once nothing names them
- `src/app/_layout.tsx` `useFonts`, and `src/constants/theme.ts` `fonts` and `textRole`. The keys and values must match byte for byte (`scripts/build-fonts.py --check` and check-design both fail a mismatch). The roles are the ones in section 2's "A as built".
- `scripts/check-design.mjs` rule 6, the "Playfair discipline", which became "three faces, three jobs": the marker only in the DISPLAY roles (the tab title, the four name roles, the empty state's headline), the poster only in `sub`, every other role Archivo; each fenced role read only where its job is; every line at least its face's natural line; every `fonts` value a key `_layout.tsx` loads. Rule 5 allows the poster's capitals by transform in `textRole.sub` alone. `check-contrast` is unaffected, because the palette does not change.
- The places that draw the new roles: `DrinkName` (the marker's ink room and a 15pt shrink floor), ScreenTopBar's lg bar and TabPlaceholder (`tabTitle`, never scaled; `userTitle` keeps your handle in Archivo), the Dex's section heads and the drink page's (`sub`, their Archivo asides dropped onto its baseline), the post header's second line (" at " and the place on the drink's baseline), EmptyState's title, and DrinkPanels' PinnedPostBar, whose key ("Post Piña Colada again") is Archivo 600 like every key.
- `src/lib/textFit.ts` (`faceOf`, `fitScale`, `widestRun`) and `src/components/details/lineMarks.ts`, as DrinkPanels and cabinet call them (`lineMarks('playfair' | 'inter', …)`, `widestRun(…, 'inter', …)`). These carry per-face metrics, so they need Sedgwick's and Archivo's tables, or the margin rule and the spec's stacking test will measure the wrong face.
- `src/components/details/numeralGlyphs.ts`, generated by `scripts/build-numerals.py`, now from Anton for the outlined figures, and `scripts/render-details.mjs` re-run at cap 48. `numeralPath` offsets each contour on its own, so the source must have no overlapping contours. `Anton-Regular.ttf` is a static cut and has none: the board's first renders stroked it bare and it came out clean. A variable source, such as C's Geist Mono, would need an overlap-removed static instance first (fontTools' instancer with overlap removal, which needs skia-pathops). **Anton's º is not a plain ring**: its `ordmasculine` is a tall oval shaped like its 0, so the figure read "N⁰ 0147". The build draws the º with Anton's `degree` ring instead, raised to the cap height.
- Everything else that set Inter outside the app: the App Store screenshot composer (`scripts/appstore-shots/compose.mjs`, whose captions are now Archivo 600 at `textRole.title`, a caption being a sentence), the drink photos' QA sheets and the printable Dex index (the marker and Archivo). The website (sipply.theidealizepr.com, `docs/`) still sets its own Inter and Playfair copies: a follow-up, not part of v4.10. The intro film sets no type of its own.
