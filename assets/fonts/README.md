# Self-hosted fonts

None of these are on `@expo-google-fonts` — that is deliberate, and it is why
nobody else's app looks like this. They are loaded by `require()` in
`src/app/_layout.tsx` and named in `src/constants/theme.ts`.

Read the typography block at the top of `src/constants/theme.ts` first: it has
the role assignments, the 12px stencil warning, and the no-`fontWeight` rule.

| File | Role | Source | License |
|---|---|---|---|
| `BespokeStencil-Bold.ttf` | display | [Fontshare](https://www.fontshare.com/fonts/bespoke-stencil) | ITF Free Font License |
| `Boska-Medium.ttf` | accent (ledes) | [Barbara Bigosinska / Fontshare](https://www.fontshare.com/fonts/boska) | ITF Free Font License |
| `Switzer-{Regular,Medium,Semibold,Bold}.ttf` | body | [Fontshare](https://www.fontshare.com/fonts/switzer) | ITF Free Font License |
| `Sligoil-Micro.ttf` | data / numerals | [Ariel Martín Pérez / Velvetyne](https://gitlab.com/velvetyne/sligoil) | OFL 1.1 |

All are free to embed in a shipped app. `LICENSE-Fontshare.txt` covers the three
Fontshare families; `LICENSE-Sligoil.txt` is the OFL, which *requires* its text
to travel with the font — do not delete either.

## Watch the 12px nameplate

`DexCard`'s name style sets `display` at 12px and only shows it on **collected**
cards, so it stays invisible until you own something and then becomes the
densest surface in the app. Stencil breaks are the first thing to go at small
optical sizes. If it reads as mush on device, point that one style at
`bodySemiBold` rather than shrinking the display role to suit one label.

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
