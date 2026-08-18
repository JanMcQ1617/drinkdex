# Self-hosted fonts

None of these are on `@expo-google-fonts` — that is deliberate, and it is why
nobody else's app looks like this. They are loaded by `require()` in
`src/app/_layout.tsx` and named in `src/constants/theme.ts`.

Read the typography block at the top of `src/constants/theme.ts` first: it has
the role assignments, the size floor on Basteleur, and the no-`fontWeight` rule.

| File | Role | Source | License |
|---|---|---|---|
| `Basteleur-Bold.ttf` | display | [Keussel / Velvetyne](https://gitlab.com/velvetyne/basteleur) | OFL 1.1 |
| `Switzer-{Regular,Medium,Semibold,Bold}.ttf` | body | [Fontshare](https://www.fontshare.com/fonts/switzer) | ITF Free Font License |
| `Sligoil-Micro.ttf` | data / numerals | [Ariel Martín Pérez / Velvetyne](https://gitlab.com/velvetyne/sligoil) | OFL 1.1 |

All three are free to embed in a shipped app. The OFL requires the license text
to travel with the fonts, which is why `LICENSE-*.txt` sit in this folder — do
not delete them.

## Adding a weight

1. Take the **static** TTF, never the variable one. React Native's variable-font
   support is unreliable, and the `Fonts/WEB/fonts/` TTFs are the safe pick over
   `Fonts/OTF/` on Android.
2. Drop it here, `require()` it in `_layout.tsx`, and name it in `theme.ts`.
   The `useFonts` key and the `fonts` value must match byte-for-byte — a typo
   falls back to the system face silently instead of throwing.
3. Never reach for `fontWeight` to get there. RN would synthesize a fake bold
   instead of using the real cut.

## Known gap

None of these carry `½ ¾ ⅓`. Write measures as `1.5 oz` / `0.75 oz` — that is
what modern bar books do anyway. A literal fraction glyph will fall back to the
system font mid-word and look broken.
