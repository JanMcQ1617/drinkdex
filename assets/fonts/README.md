# Self-hosted fonts

**Every face the app sets lives here.** Nothing loads from
`@expo-google-fonts`, and the packages are uninstalled. `_layout.tsx`
`require()`s these files directly and `theme.ts` names them.

Three faces, three jobs (v4.10, `specs/v4.10/spec.md` T):

| File | Face | Job | Size |
|---|---|---|---|
| `SedgwickAveLatin_400Regular.ttf` | the marker, Sedgwick Ave | every drink name, the app's own tab titles, the empty states' headlines | 107 KB |
| `AntonLatin_400Regular.ttf` | the poster, Anton | the Dex's and the drink page's section heads (capitals by transform); the press's outlined figures are its paths | 105 KB |
| `ArchivoLatin_400Regular.ttf` | the text, Archivo | body, rows, field text, captions | 94 KB |
| `ArchivoLatin_500Medium.ttf` | | labels, the place on a post, figures | 95 KB |
| `ArchivoLatin_600SemiBold.ttf` | | every key, titles a person typed, counts, amounts, the Nº plate | 95 KB |

Jan asked for "all the text in the app ... in this same font" as the
red paint-pen wordmark, mixed with "subheading and one other font". The
logo is drawn, not set, so the marker is the nearest hand to its pen
(`specs/v4.10/type/README.md` 1). It never sets a figure or an
identifier: a count, an amount, a Nº, a key or a handle must be read
exactly, so those are Archivo. check-design rule 6 keeps each face to
its job.

Build 34 shipped Playfair Display (drink names) and Inter (everything
else); both left in v4.10.

## Built, not downloaded: `scripts/build-fonts.py`

All five files and the three licences here are written by one script
from the upstream files in `specs/v4.10/type/fonts/` (as google/fonts
ships them, pinned by sha256 in the script):

    python3 scripts/build-fonts.py            # build
    python3 scripts/build-fonts.py --check    # writes nothing; a gate

It does what the app has always done to a font, plus four edits to
Sedgwick's own data:

- **Static cuts.** Archivo ships as a variable font, and React Native's
  variable-font support is unreliable, so each weight is instanced to a
  static cut at width 100 first. Sedgwick Ave and Anton are static.
- **Latin subsets**, with every layout feature kept (tabular figures,
  kerning, ligatures): `U+0020-007E, U+00A0-00FF, U+0100-017F,
  U+0180-024F, U+1EA0-1EF9, U+2000-206F, U+20A0-20BF, U+2122`. That is
  build 34's set plus Latin Extended Additional, which five catalogue
  names need (Rượu Đế, Rượu Nếp, Rượu Rắn, Rượu Thuốc, Cà Phê Trứng
  Rum); build 34 drew those letters in the system font. The five come
  to 497 KB, against build 34's 639.
- **Renamed**, so a cut-down font never sits under the original family's
  name (a trap for whoever later loads the real one and wonders where
  their Cyrillic went): the family reads `SedgwickAveLatin`,
  `AntonLatin` or `ArchivoLatin`, and the style the weight. Copyright
  and licence (name IDs 0, 13, 14) are kept exactly.
- **Sedgwick's zero is unslashed.** Its shipped zero is slashed, and the
  slash is not a contour of its own, so "Ardbeg 10" read "Ardbeg 1Ø". The
  script redraws `zero` as Sedgwick's own `O` scaled into the zero's box,
  with the zero's advance and side bearing kept, so every fit is
  unchanged. Its name ID 5 says so.
- **Sedgwick's cap and x heights** in OS/2 are set to the drawn medians
  (850 and 670 of 1,000) in place of the shipped 950 and 660. Metadata
  only: React Native lays a line out from hhea, which is untouched.
- **Sedgwick's accented letters lose upstream's empty room.** Its è was
  110 units wider than e with the same ink, so "Crème" drew as "Crè me".
  Each accented letter takes its base letter's advance plus any accent
  overhang: advances only ever shrink.
- **Sedgwick keeps only its letter ligatures** (fi, fl, ff, ffi, ffl).
  Upstream's default `liga` also draws pictures in place of words:
  "star1", "arrow2", "hiphop1", "quotesleft" and six more. No catalogue
  name spells one, but a custom drink or a caption could, and iOS forms
  them unasked; `--check` fails a build that still has one.

All three families are OFL 1.1 with no Reserved Font Name, so the
subset, the edits and the rename are all permitted.

It also writes `src/lib/faceAdvances.ts` (GENERATED), the advances
`lib/textFit` costs a name or a caption with before layout, and
`--check` fails if that table is not these files'.

**If you need non-Latin**, widen `UNICODES` in the script and rebuild:
do not reach for the unsubsetted original.

**Do not re-add `@expo-google-fonts`** to get another weight. Importing a
single weight from one of those packages pulls that package's index, which
`require()`s every weight and italic it ships; the app once carried 60 font
files and 24.7 MB to use four of them.

## Adding or changing a weight

1. Add the cut to `CUTS` in `scripts/build-fonts.py` and build: never a
   variable font, never a file copied in by hand.
2. `require()` it in `_layout.tsx` and name it in `theme.ts`. **The
   `useFonts` key and the `fonts` value must match byte-for-byte**: a
   mismatch falls back to the system face silently instead of throwing.
   build-fonts `--check` and check-design both fail one.
3. If its line metrics differ, `FACE_METRICS` in
   `src/components/details/lineMarks.ts` must say so: `--check` holds
   them to each file's hhea, and check-design holds every role's line
   height to them.
4. Ship the licence. `LICENSE-*.txt` here cover all three families; the
   OFL *requires* its text to travel with the font, and `--check` fails a
   licence that is not the upstream file's, byte for byte.

## Rule

This codebase sets no `fontWeight` anywhere and must not start: React
Native would synthesize a fake bold instead of using the real cut. Pick the
family key that names the weight. (The one exception is the Sign in with
Apple row, which is the system font with Apple's own weight, as the HIG
asks.)
