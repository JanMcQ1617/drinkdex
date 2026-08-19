# Self-hosted fonts

**All four faces the app uses live here.** Nothing loads from
`@expo-google-fonts` any more, and the packages are uninstalled. `_layout.tsx`
`require()`s these files directly and `theme.ts` names them.

| File | Role | Size |
|---|---|---|
| `GowunBatangLatin-Bold.ttf` | display | 73 KB |
| `HankenGrotesk_400Regular.ttf` | body | 65 KB |
| `HankenGrotesk_700Bold.ttf` | body bold | 64 KB |
| `SpaceMono_400Regular.ttf` | numerals | 96 KB |

Measured in the built `.app`: **60 font files / 24.7 MB → 4 files / 299 KB.**
The letterforms did not change — this is the same three families the app always
used. Two separate kinds of waste were removed.

## 1. The display face carried a language we never render

`GowunBatang_700Bold.ttf` upstream is **8.2 MB** because it carries full Hangul,
and the app sets English drink names with it. Subset to Latin + Latin Extended
it is **73 KB** — the Latin outlines are copied through untouched, so there is
no visible change at all.

For scale, against the 24.7 MB the built app actually shipped: that one file was
~33% of the font payload, and Gowun Batang across both its weights was ~64% —
15.8 MB, of which only the Bold was ever referenced.

Regenerate it by installing the package temporarily, then:

    python3 -m fontTools.subset \
      node_modules/@expo-google-fonts/gowun-batang/700Bold/GowunBatang_700Bold.ttf \
      --unicodes='U+0020-00FF,U+0100-017F,U+0180-024F,U+2000-206F,U+20A0-20BF,U+2122' \
      --layout-features='*' --glyph-names \
      --output-file=assets/fonts/GowunBatangLatin-Bold.ttf

then rewrite name IDs 1/3/4/6/16 to `GowunBatangLatin` and uninstall the package
again. **If you need non-Latin**, widen `--unicodes` and regenerate — do not
reach for the 8.2 MB original.

**On the name.** Gowun Batang is OFL and declares *no* Reserved Font Name, so
both the subset and the rename are permitted. It is renamed anyway: a cut-down
font sitting under the original family name is a trap for whoever later loads
the real one and wonders where their Hangul went.

## 2. The packages shipped every weight, not the ones we imported

Importing a single weight from an `@expo-google-fonts` package pulls that
package's index, which `require()`s **every weight and italic it ships**. The
built app carried 18 Hanken Grotesk files and 4 Space Mono files in order to use
three of them, plus 18 Inter and 18 Fraunces files that nothing imported at all.

`require()`ing the `.ttf` directly bundles exactly one file. That is why these
are self-hosted rather than depended on.

**Do not re-add `@expo-google-fonts`** to get another weight. Copy the one
`.ttf` you need into this folder and `require()` it.

## Adding or changing a weight

1. Put the static `.ttf` here — never a variable font. React Native's
   variable-font support is unreliable.
2. `require()` it in `_layout.tsx` and name it in `theme.ts`. **The `useFonts`
   key and the `fonts` value must match byte-for-byte** — a mismatch falls back
   to the system face silently instead of throwing.
3. Ship the license. `LICENSE-*.txt` here cover the three families; the OFL
   *requires* its text to travel with the font.

## Rule

This codebase sets no `fontWeight` anywhere and must not start — React Native
would synthesize a fake bold instead of using the real cut. Pick the family key
that names the weight.
