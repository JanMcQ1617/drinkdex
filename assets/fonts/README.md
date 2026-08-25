# Self-hosted fonts

**Both families the app uses live here.** Nothing loads from
`@expo-google-fonts`, and the packages are uninstalled. `_layout.tsx`
`require()`s these files directly and `theme.ts` names them.

| File | Role | Size |
|---|---|---|
| `PlayfairDisplayLatin_600SemiBold.ttf` | display | 108 KB |
| `PlayfairDisplayLatin_700Bold.ttf` | display bold — wordmark, drink names | 107 KB |
| `InterLatin_400Regular.ttf` | body | 141 KB |
| `InterLatin_500Medium.ttf` | letterspaced labels, dex numbers, figures | 141 KB |
| `InterLatin_600SemiBold.ttf` | body semibold — buttons, names | 142 KB |

The Sipply handoff names exactly two families — Playfair Display for the
display voice, Inter for everything else — which is why the third family is
gone. Space Mono used to set the dex numbers; they are now Inter Medium
tracked out, with `type.tabular` carrying the column alignment the mono was
really there for.

## Both files are Latin-only subsets, and both are renamed

Upstream, Playfair Display carries Cyrillic and Vietnamese and Inter carries
Cyrillic and Greek. This app renders English drink names, so the extra
scripts are payload with no reader. Subset to Latin + Latin Extended the two
families come to **654 KB across five cuts**, against roughly 1.5 MB for the
same five unsubsetted.

They are renamed for the same reason the old Gowun subset was: a cut-down
font sitting under the original family name is a trap for whoever later
loads the real one and wonders where their Cyrillic went. Both are OFL with
no Reserved Font Name, so both the subset and the rename are permitted.

## Regenerating

Google ships both as variable fonts, and React Native's variable-font
support is unreliable — so each weight is instanced to a static cut first,
then subset, then renamed. From the repo root:

    curl -sL -o /tmp/PlayfairDisplay-var.ttf \
      'https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf'
    curl -sL -o /tmp/Inter-var.ttf \
      'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf'

    # one instance per weight — Inter is pinned to opsz 14, its UI size
    python3 -m fontTools.varLib.instancer /tmp/Inter-var.ttf wght=500 opsz=14 \
      -o /tmp/inter-500.ttf

    python3 -m fontTools.subset /tmp/inter-500.ttf \
      --unicodes='U+0020-00FF,U+0100-017F,U+0180-024F,U+2000-206F,U+20A0-20BF,U+2122' \
      --layout-features='*' --glyph-names \
      --output-file=assets/fonts/InterLatin_500Medium.ttf

then rewrite name IDs 1/2/3/4/6/16/17 so the family reads `InterLatin` /
`PlayfairDisplayLatin` and the style reads the weight. **If you need
non-Latin**, widen `--unicodes` and regenerate — do not reach for the
unsubsetted original.

**Do not re-add `@expo-google-fonts`** to get another weight. Importing a
single weight from one of those packages pulls that package's index, which
`require()`s every weight and italic it ships; the app once carried 60 font
files and 24.7 MB to use four of them. Copy the one `.ttf` you need into
this folder and `require()` it.

## Adding or changing a weight

1. Put the static `.ttf` here — never a variable font.
2. `require()` it in `_layout.tsx` and name it in `theme.ts`. **The
   `useFonts` key and the `fonts` value must match byte-for-byte** — a
   mismatch falls back to the system face silently instead of throwing.
3. Ship the license. `LICENSE-*.txt` here cover both families; the OFL
   *requires* its text to travel with the font.

## Rule

This codebase sets no `fontWeight` anywhere and must not start — React
Native would synthesize a fake bold instead of using the real cut. Pick the
family key that names the weight.
