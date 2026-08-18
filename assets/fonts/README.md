# Self-hosted fonts

## `GowunBatangLatin-Bold.ttf` — the display face

This is **Gowun Batang, subset to Latin**, and it is the only font in the app
that is not loaded from `@expo-google-fonts`.

The upstream `GowunBatang_700Bold.ttf` is **8.2 MB** because it carries full
Hangul coverage. Clink sets English drink names with it and renders no Korean
at all, so that file was ~84% of the app's entire font payload and every glyph
paying for it was one we never draw. Subset to Latin + Latin Extended it is
**73 KB** — a 99% cut with no visible change, because the Latin outlines are
copied through untouched.

Regenerate it with:

    python3 -m fontTools.subset \
      node_modules/@expo-google-fonts/gowun-batang/700Bold/GowunBatang_700Bold.ttf \
      --unicodes='U+0020-00FF,U+0100-017F,U+0180-024F,U+2000-206F,U+20A0-20BF,U+2122' \
      --layout-features='*' --glyph-names \
      --output-file=assets/fonts/GowunBatangLatin-Bold.ttf

then rewrite name IDs 1/3/4/6/16 to `GowunBatangLatin`.

**On the name.** Gowun Batang is OFL and declares *no* Reserved Font Name, so
subsetting and renaming are both permitted. It is renamed anyway: a cut-down
font sitting under the original family name is a trap for whoever later loads
the real one and wonders why their Hangul is missing. `LICENSE-GowunBatang.txt`
is the OFL and must ship with it.

**If you need non-Latin**, widen `--unicodes` and regenerate — do not reach for
the 8.2 MB original.

## Everything else

Body (Hanken Grotesk) and numerals (Space Mono) still come from
`@expo-google-fonts` as normal packages. They are small and need no subsetting.

## Rule

This codebase sets no `fontWeight` anywhere and must not start — React Native
would synthesize a fake bold instead of using the real cut. Pick the family key
that names the weight.
