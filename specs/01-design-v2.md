# 01 · Design language v2: "not AI"

Status: build-ready. Implementer: **DS** (the design-system and navigation owner).
Applies to every screen in `src/app` and every component in `src/components`.
Native modules added: **none**. Supabase changes: **none**. JS only.

Sibling specs in this batch, and the tags this document uses for them: **02** `02-auth-login.md`, **03** `03-home-and-profile.md`, **04** `04-custom-drinks.md`, **05** `05-reels.md` (the user-facing name is "Clips"; code says `reels`), **06** `06-tab-switch-bug.md`, **INTRO** (cold-start intro), **LOCATION** (long term). Section 15 lists every point where this spec and those meet. The precedence rule is simple: **shared tokens and primitives follow this spec; the composition and behaviour of a screen follow that screen's spec.**

---

## 0. What Jan asked, and what is actually wrong

Jan's words: *"update the AI slop since I don't want everything to look like oval shaped and not having borders. My goal is to make this app not look like AI."*

Here is what the code shows on branch `reads-and-redesign`:

| Tell | Where | Measured |
|---|---|---|
| Everything is a stadium | `radius.pill` (999) in **26** style sites; Button is a 52pt pill; SearchField, the SegmentedControl track and thumb, and every badge are pills; the tab bar is radius 32 on a 64pt bar (a full stadium); the log action is a disc | Every control on every screen is an oval |
| Borders you can't see | `colors.cardBorder` `#EFE9E0` is the edge of every Card, chip, search field and divider | **1.08:1** on the cream page, **1.21:1** on white |
| Separation by tint alone | White cards on cream | 1.11:1 |
| Icon in a disc | EmptyState, WelcomeConnect, PasswordReset's done mark, the drink page's lock, log's empty photo, log's selected check, recipe step numbers, milestone marks, the celebration's rank disc | **9** places |
| Performing lists | `FadeInDown` staggers on Home, the drink page and CollectionStats | 06 also shows they can blank the screen |
| Letterspaced caps headings | `SectionLabel` (uppercase, 3.3pt tracking) on 6 screens | The code's own comment calls it "the habit that most makes an interface look machine-designed" |
| A serif in every header | Playfair in 24 files, including 8 top-bar titles | The display face has no hierarchy left |
| Frosted glass with a painted sheen | The tab bar, the Dex masthead, the drink back button, Dex scroll-to-top | The fallback draws an SVG specular band: textbook glassmorphism |
| Airy gutters | `space.xl` (24pt) side padding on 12 screens | Instagram and the system apps use 16 |
| A top bar per screen | 8 hand-built bars | Three title sizes, two fonts, two alignments |

References 1 and 3 agree on the cure: **rounded rectangles at about 8pt, visible 1pt edges, ink-outlined secondary actions, sans-serif chrome, 16pt gutters.** Reference 2 adds the floating bottom bar and the edge-to-edge feed.

## 1. The five rules

1. **Rectangles, not ovals.** Controls are 8pt rounded rectangles, panels are 12pt, and media is square-cornered. Only *people* (avatars) and *round objects* (a camera shutter, a dot) are circles.
2. **Every edge is drawn.** A container that groups content has a visible 1pt edge. An input has a 3:1 edge. A secondary button has an ink edge. Tint is never the only separator.
3. **Chrome is plain.** Bars, headings, buttons, rows and fields are set in Inter. Playfair is kept for the brand's voice: the wordmark and drink names.
4. **Nothing performs.** No entrance animations, no shimmer, no glass, no glow, no gradient behind content. Motion answers a touch or shows a selection. No content is ever invisible while it waits for an animation (06).
5. **One wine thing per view.** Wine fills the primary action and the log button. Selection, focus and secondary actions use ink (`text`), so the brand colour keeps meaning "do this".

The palette stays: wine, merlot, bone, taupe, espresso, gilt (legendary only), cream page. That is the palette in `theme.ts` today, which the brief calls "Porcelain Speakeasy" and the file calls "Sipply". **No existing hex value changes.** v2 adds edge tokens, merges 05's dark "clip" tokens, and adds two values for the dark tab bar.

## 2. Ownership and sequencing

> **Cross-check override (30 Sep 2026, `00-build-plan.md` is binding for who edits which file).** The build is split into file-disjoint packages, so "DS does a mechanical pass over every file" cannot happen. What changes:
> - **Package A1 (design system)** is the only editor of `theme.ts`, `ui.tsx`, `icons.tsx`, `ScreenTopBar.tsx`, `TabStrip.tsx`, `glass.tsx`, `DexCard.tsx`, `check-design.mjs` and `check-contrast.mjs`. It lands in stage 1 with **every** token, primitive and glyph any spec in this batch needs (01, plus 02's Google colours, `mail`, `GoogleMark` and `haptic.error`; 03's `addPerson` and `stack`; 04's `labelHidden` and `secondaryAction`; 05's clip tokens, `onDark`, `flip`, `flash`, `volume`, `volumeOff`, `play`). Nobody else edits those files; a need found later goes to A1's owner as a follow-up commit.
> - **The old names stay during stages 1 and 2**, marked `/** @deprecated v2 — specs/01 §3.1 */` **with their old values** (never re-valued): `radius.sm/md/lg/xl/tab/pill`, `label.ui`, `elevation.raisedBox`, `motion.stagger`, the `glass` object and `glass.tsx`, Button's `ghost` (an alias of `text`), `CategoryPill` (an alias of `CategoryTag`), and `SectionLabel` (an alias that renders `SectionHeader`, so sentence case from day one and rule 5 stays clean). `GoldButton` and `elevation.brand` have no callers and are deleted at once.
> - **The "Phase 1 (mechanical)" column of section 14.3 is done by the package that owns each file** (00 lists them), in stage 2, together with that file's Phase 2/3 work.
> - **Stage 3 (A1, after every stage-2 package has merged)** deletes the deprecated names and `glass.tsx`. `tsc` then proves no site was missed, which is the guarantee this section originally wanted.
>
> The original sequencing below is kept for the reasoning; where it conflicts with the override, the override wins.

- **Phase 1 (DS) lands first, alone.** It covers the tokens (section 3), the primitives (section 5, including `ScreenTopBar.tsx` and `TabStrip.tsx`), icons, the check scripts, and the mechanical token migration in **every** file (section 14), including files owned by 02 to 05. It has to: the old `radius` keys are deleted, so nothing compiles until every site is mapped. Those edits change style values only, never layout, copy or behaviour, so the other specs rebuild on top of them without conflict.
- **Phase 2 (DS):** navigation chrome: the tab bar, the tab list, Stats moved to a push screen, top bars on DS-owned screens, Grain, and glass removed.
- **Phase 3 (DS):** polish of the screens no other spec rebuilds.
- 02 to 05 start from Phase 1. **Nobody else edits `theme.ts` or `ui.tsx`** (A1 owns them for the whole build; see the override). 06's `screenOptions` edit to `(tabs)/_layout.tsx` is made by package C1, and 06's lint rule 3 is A1's first commit to `check-design.mjs`.

## 3. Tokens: `src/constants/theme.ts` (DS, Phase 1)

Placement: `stroke` and `layout` go after `space`; `textRole` after `type` (it reads `fonts`); `foil` where `glass` was.

### 3.1 Radius: replace the whole object

The old keys (`sm 10, md 12, lg 16, xl 24, tab 32, pill 999`) are **deleted, not re-valued**. A changed value under an old name would silently restyle 60 sites. New names make `tsc` list every one.

```ts
/**
 * v2 radius scale. Role-named, so a call site says what it is.
 *   none     full-bleed media, grid tiles, docked bars, progress bars, rules
 *   badge    things ≤ 24pt: tags and badges, markers on media (gallery count,
 *            duration, + badge on a pour tile), checkboxes, thumbnails ≤ 48pt
 *   control  28–56pt interactive things: buttons, inputs, search, chips,
 *            segmented control, notices, media icon buttons, Dex cards
 *   card     panels: Card, list groups, sheets' top corners, dialogs, the
 *            tab bar, inset photos
 *   round    ONLY avatars (with their rings and badges), the camera
 *            shutter, dots ≤ 10pt. Lint-enforced (section 13.1).
 * A nested shape takes the concentric radius, outer − inset, computed at
 * the call site (the segmented thumb is `radius.control - 2`).
 */
export const radius = {
  none: 0,
  badge: 4,
  control: 8,
  card: 12,
  round: 999,
} as const;
```

Why 8: reference 1's inputs and buttons and reference 3's profile buttons all measure 7–8pt. `control` and `badge` are the names 02 and 04 already use; 03 and 07 wrote `radius.tag`, which means `radius.badge` (they were edited to match).

During stages 1–2 the old keys stay beside these, `@deprecated`, with their **old** values; stage 3 deletes them (section 2 override). New code uses only the five names above.

### 3.2 Colours: add (no existing value changes)

After `borderStrong`:

```ts
  /*
   * v2 EDGES. cardBorder (#EFE9E0) stays for RARITY_META.common only. As an
   * edge it measured 1.08:1 on the page and 1.21:1 on white, which is invisible.
   */
  /** 1pt edges: cards, list groups, chips, tags, search, the tab bar, rules
   *  under bars; hairline row separators. Decorative: 1.54:1 white, 1.38:1 page. */
  line: '#D9CFC1',
  /** 1pt edge of inputs, selects, checkboxes; outline buttons where a spec
   *  asks for a control edge. Same value as textFaint, separate intent.
   *  Non-text UI (WCAG 1.4.11): 3.91:1 on white, 3.51:1 on the page. */
  lineControl: '#8A7F74',
  /** Secondary-button outline, focus ring, active TabStrip underline. */
  lineInk: '#2B2322',
```

Merge **05 §10.1 verbatim**: `reelGround`, `reelInk`, `reelInkMuted`, `record`, `reelControlFill`, `reelControlBorder`, `reelScrim`, `reelScrimMid`, `reelScrimClear`, `reelTrack`, `reelTextShadow`, with 05's comments. Then add the two values the dark tab bar needs:

```ts
  /** The tab bar's fill while Clips is focused. Espresso; 1.28:1 above reelGround, so its edge does the separating. */
  reelBar: '#2B2322',
  /** Resting tab icon + label on reelBar: 5.86:1 (7.47:1 on reelGround). Clearly dimmer than reelInk, which marks the active tab. */
  reelInkDim: '#A99E94',
```

Nothing else uses the dark tokens. Paper screens never touch them.

### 3.3 Stroke widths: new

```ts
import { StyleSheet, type TextStyle } from 'react-native'; // was a type-only import

export const stroke = {
  /** Row separators inside list groups. */
  hair: StyleSheet.hairlineWidth,
  /** Every container and control edge, and the rule under a top bar or TabStrip. */
  edge: 1,
  /** Focus and error rings on inputs, drawn as an overlay so layout never moves. */
  ring: 2,
  /** TabStrip underline, Dex progress rule. */
  indicator: 2,
} as const;
```

### 3.4 Layout sizes: new

```ts
export const layout = {
  gutter: 16,       // screen side padding everywhere (was 24 on 12 screens)
  hit: 44,          // minimum touch target; smaller visuals reach it with hitSlop
  topBar: 44,
  tabBar: 64,
  tabBarInset: 12,  // floating tab bar inset from each screen edge
  control: 48,      // Button md
  controlSm: 36,    // Button sm (hitSlop 4 top/bottom → 44)
  field: 56,        // Field / SelectField row
  fieldMultiline: 112,
  search: 44,
  chip: 32,         // hitSlop 6 top/bottom → 44
  tag: 22,
  segmented: 36,    // hitSlop 4 top/bottom → 44
  tabStrip: 44,
  row: 52,          // ListRow, one line
  rowTall: 64,      // ListRow with a subtitle or a 40pt avatar
  gridGap: 2,       // between media grid tiles
} as const;
```

### 3.5 Text roles: new

```ts
/** v2 text roles. Chrome is Inter; Playfair only where named. */
export const textRole = {
  wordmark:     { fontFamily: fonts.displayBold, fontSize: 28, lineHeight: 34 },  // Home top bar (03)
  barTitle:     { fontFamily: fonts.bodySemiBold, fontSize: 17, lineHeight: 22 }, // ScreenTopBar md
  barTitleLg:   { fontFamily: fonts.bodySemiBold, fontSize: 20, lineHeight: 26 }, // ScreenTopBar lg, Clips header
  emptyTitle:   { fontFamily: fonts.bodySemiBold, fontSize: 22, lineHeight: 28 }, // EmptyState, primers
  sectionTitle: { fontFamily: fonts.bodySemiBold, fontSize: 16, lineHeight: 22 },
  groupTitle:   { fontFamily: fonts.bodySemiBold, fontSize: 14, lineHeight: 20 },
  rowTitle:     { fontFamily: fonts.body, fontSize: 16, lineHeight: 22 },
  rowSubtitle:  { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  button:       { fontFamily: fonts.bodySemiBold, fontSize: 16, lineHeight: 20 },
  buttonSm:     { fontFamily: fonts.bodySemiBold, fontSize: 14, lineHeight: 18 },
  fieldLabel:   { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16 },
  fieldValue:   { fontFamily: fonts.body, fontSize: 16, lineHeight: 22 },
  helper:       { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
} satisfies Record<string, TextStyle>;
```

17 and 20 are the only sizes not on `type`. They are bar titles only: 17 is iOS's navigation-title size and 20 is 03's profile username. `type` itself is unchanged. `label.ui` is **deleted** (its one user, SectionLabel, goes); `label.tagline` stays for the intro lockup.

### 3.6 Elevation

```ts
export const elevation = {
  /** The floating tab bar and the Dex scroll-to-top. Tight: lift, not smudge. */
  bar: { boxShadow: '0px 4px 14px rgba(43, 35, 34, 0.10)' },
  sheet: { /* unchanged */ },
} as const;
```

`raisedBox` becomes `bar` (re-valued). `brand` is deleted (no callers). Nothing else casts a shadow: no buttons, no cards, no dialogs.

### 3.7 Motion

`pressScale: 0.97`, used by media tiles only. `stagger` is deleted **once 06 has removed its last user** (06's layout-animation lint keeps it gone). Everything else is unchanged.

### 3.8 Glass → foil

Phase 1 keeps `glass`, with `GlassSurface`'s default radius becoming `radius.card`. At the end of Phase 2, delete the `glass` object and `src/components/glass.tsx`. DexCard's foil is the one non-glass user:

```ts
/** The Dex card's legendary foil sweep. */
export const foil = {
  edge: 'rgba(255, 253, 249, 0)',
  peak: 'rgba(255, 253, 249, 0.62)',
} as const;
```

In DexCard, `glass.sheenTo` becomes `foil.edge` and `glass.sheenFrom` becomes `foil.peak`. `expo-glass-effect` stays in `package.json`: removing a native dependency forces a prebuild, so drop it at the next planned native build.

`RARITY_META`, `CATEGORY_META`, `SIGNUP_ACCENTS` and `dexNumber` are unchanged.

## 4. Shape and edge map

This table is the contract. A reviewer checks every screen against it.

| Element | Radius | Edge | Fill | Size |
|---|---|---|---|---|
| Primary button | control | 1pt `wine` | `wine` (pressed `wineDeep`) | 48 / sm 36 |
| Secondary button | control | 1pt `lineInk` | `surface` (pressed `bgSunk`) | 48 / 36 |
| Tonal button | control | 1pt `line` | `bgSunk` (pressed `slot`) | 48 / 36 |
| On-dark button (05) | control | 1pt `reelInk` | `reelInk`, label `reelGround` | 48 / 36 |
| Text button | none | none | none (pressed opacity 0.5) | hit 44 |
| Danger button | control | 1pt `danger` | `dangerWash` (pressed opacity 0.8) | 48 / 36 |
| Field / SelectField | control | 1pt `lineControl`; focus: 2pt `lineInk` ring; error: 2pt `danger` ring | `surface` (disabled `bgSunk`) | 56 (multiline 112) |
| FieldGroup | control outside, 0 inside | 1pt `lineControl` outside, plus full-width separators | `surface` | 56 per row |
| Search field | control | 1pt `line` | `surface` (on a card: `bg`) | 44 |
| Chip (toggle) | control | 1pt `line`; selected 1pt `wine` | `surface`; selected `wineWash` | 32 |
| Tag / badge | badge | 1pt tone at `55` alpha, or `line` | tone wash, or `cardAlt` | 22 |
| Marker on media (gallery count, stack, duration band) | badge (a band: none) | none | `reelScrim`, text and glyph `reelInk` (≥ 10:1 even over a white frame; pair in 13.2) | per spec |
| + badge on your own pour tile (03) | badge | 2pt `bg` | `wine`, glyph `textOnWine` | 22 |
| On-dark text button (`onDarkText`) | none | none | none, label `reelInk` (pressed opacity 0.5) | hit 44 |
| Segmented control | control; thumb control − 2 | 1pt `line` on track and thumb | track `bgSunk`, thumb `surface` | 36 |
| TabStrip | none | 1pt `line` rule; 2pt `lineInk` underline | none | 44 |
| Card / ListGroup | card | 1pt `line` | `surface` | n/a |
| List row | none (the group clips it) | hairline `line`, inset to the title | `surface` (pressed `bgSunk`) | 52 / 64 |
| Notice | control | 1pt tone at `55` alpha | tone wash | padding 12 |
| Dex card | control (a printed card's corner, not an app tile's) | rarity edge 1–2.5pt / 1pt `slotBorder` | unchanged | aspect 0.72 |
| Feed photo, grid tile, clip | none | none | `bgSunk` / wash / `reelGround` while loading | per 03 / 05 |
| Inset photo (log frame, drink sheet preview, celebration art, 04's photo) | card | 1pt `line` | `bgSunk` | n/a |
| Thumbnail ≤ 48 (row art) | badge | 1pt `line` | category wash | 40–44 |
| Thumbnail 49–96 (prize thumb) | control | 1pt `line` | wash | 56 |
| Avatar | round | `ring` prop: 2pt accent | `wine` initials | 24 · 32 · 40 · 66 · 80/86 |
| Avatar badge (on a round avatar) | round | 2pt `bg` | `wine` | 22 |
| Dot (status, category, rarity pip, unread) | round, or a 1pt-radius square where 03 says so | none | tone | 6–8 |
| Checkbox (milestone mark) | badge | 1pt `lineControl`; checked: none | `surface`; checked: `wine` with a bone check | 20 |
| Colour swatch (edit profile) | control | 1pt `line`; selected: 2pt `lineInk` ring, outset 2 | the accent | 44 |
| Tab bar | card | 1pt `line` (Clips: 1pt `reelControlBorder`) | `surface` (Clips: `reelBar`) | 64 |
| Log action | control | 1pt `wineDeep` (Clips: none) | `wine` (Clips: `reelInk`) | 48 × 36 |
| Top bar | none | 1pt `line` bottom once scrolled | `bg` | 44 + safe top |
| Bottom sheet (custom) | card, top corners only | none | `surface` | n/a |
| Dialog (celebration) | card | 1pt `line` | `surface` | n/a |
| Media icon button (05's ReelControl, drink back) | control | 1pt `reelControlBorder` | `reelControlFill`; selected `reelInk` | 44 |
| Floating scroll-to-top | control | 1pt `line` | `surface` + `elevation.bar` | 44 |
| Progress bar | none | none | track `bgSunk`, fill `wine` | 4 |
| Record button (05) | round core idle; stop square radius 6 | 4pt ring (05) | `record` | 05 §4.2 |

## 5. Primitives (DS, Phase 1)

Every primitive keeps its current accessibility behaviour (roles, `announce`, live regions, `maxFontSizeMultiplier` caps) unless this section says otherwise. Public APIs are unchanged except where marked **API**.

### 5.0 Press feedback (applies to everything below)

- **Controls** (buttons, rows, chips, segments, select fields) answer with a **fill change**. It is applied on press-in and removed on press-out through RN `Pressable`'s `({ pressed }) => style`. **No scale.**
- **Media tiles** (DexCard, profile grid tile, clip tile) keep `PressableScale` at 0.97.
- **Glyph-only buttons** (TopBarButton) dim to opacity 0.6 while pressed (03).
- **Haptics:** buttons and rows no longer tick on press-in. `haptic.select` fires on a selection change (tab, segment, chip, TabStrip), `haptic.success` on a completed save, `haptic.tap` on like and record start. Button's `noHaptic` prop stays in its type as a deprecated no-op, so no call site needs an edit. PressableScale keeps its tick and a working `noHaptic`.

### 5.1 Button: **API** (variants renamed and added, plus a `leading` node)

```ts
export type ButtonVariant =
  | 'primary' | 'secondary' | 'tonal' | 'text' | 'danger' | 'dangerText' | 'onDark' | 'onDarkText';
// 'onDarkText' (cross-check addition): the text button for reelGround surfaces. `text` is wine
// (1.12:1 on reelGround) and `text muted` is textMuted (≈3.2:1), so neither can carry "Not now",
// "Done" or an EmptyState secondary action on dark. Label reelInk, no fill, no edge, pressed opacity 0.5.
// existing props unchanged: label, onPress, variant, size ('md' | 'sm'), icon, disabled,
// loading, block, style, accessibilityLabel, accessibilityHint
// + muted?: boolean            — `text` only: textMuted label instead of wine (Cancel, Not now)
// + leading?: React.ReactNode  — replaces `icon` with any 20pt node, as drawn
//                                (provider marks: 02's GoogleMark, the Apple and Facebook marks)
```

- `ghost` is **removed**. Rename its call sites to `text`: `drink/[id].tsx:1012`, `InstagramImport.tsx:531, 566, 622, 630, 801, 859, 874`, and `FindFriends.tsx:435`. 04's and 05's `ghost` buttons are written as `text`.
- **md:** height 48, `paddingHorizontal: 20`, radius `control`, `borderWidth: stroke.edge`, label `textRole.button`, icon 20.
- **sm:** height 36, `paddingHorizontal: 14`, label `textRole.buttonSm`, icon 16, `hitSlop={{ top: 4, bottom: 4 }}`.
- **Leading-icon anatomy (reference 1):** when `block` is set, `icon` or `leading` is present, and the variant is `secondary`, `tonal` or `onDark`, the icon is absolutely positioned at `left: 16`, vertically centred, and the label is centred across the full width. A stack of provider buttons then lines up its marks in one column and its labels on one axis. In every other case the icon sits inline before the label with `gap: 8`.
- Skins follow the section 4 table. Labels: primary `textOnWine`; secondary and tonal `text`; text `wine` (with `muted`, `textMuted`); danger and dangerText `danger`; onDark `reelGround` (05 §10.3).
- Disabled: opacity 0.42 (unchanged). The loading spinner rules are unchanged. No variant casts a shadow. `GoldButton` is deleted (no callers).

### 5.2 MediaIconButton: **new** (05's `ReelControl` skin, shared)

```ts
export function MediaIconButton(props: {
  icon: IconName; label: string; onPress: () => void;
  selected?: boolean; disabled?: boolean;
}): JSX.Element;
```

44 × 44, radius `control`, fill `reelControlFill`, 1pt `reelControlBorder`, glyph 22 `reelInk`. When selected: fill `reelInk`, glyph `reelGround`, `accessibilityState.selected`. Pressed: opacity 0.8. `hitSlop` 4. 05's `ReelControl` **is** this component: 05 imports `MediaIconButton` from `ui.tsx` and does not create `components/reels/ReelControl.tsx`. It is used by the drink page's back button, 05's recorder (close, flip, light) and 05's Clips header (record).

### 5.3 Field: restyled (reference 1's label-inside box). **API** adds `invalid` and `labelHidden`

- Box: `minHeight: layout.field` (56; multiline 112), radius `control`, 1pt `lineControl`, fill `surface`, `paddingHorizontal: 16`, `paddingVertical: 8`.
- Inside, as a column: the **label** (`textRole.fieldLabel`, `textMuted`), a 2pt gap, then the **TextInput** (`textRole.fieldValue`, `text`).
- **Resting (empty and unfocused):** the label is drawn at value size where the value would sit, as a 16pt placeholder: `transformOrigin: 'left center'`, `scale: 4/3`, `translateY = boxHeight/2 − (labelTop + labelHeight/2)`. Measure all three with `onLayout`; never hard-code them, so the label holds at every Dynamic Type size. **On focus, or once there is a value, it switches to `scale 1, translateY 0` instantly, with no animation.** Why: 06 shows that Reanimated can stall for 10–20s after a cold start in Release, and the sign-in screen is exactly what shows then. A float that stalled halfway would leave the label lying on top of the typed number. The label is always visible, so a placeholder never stands in for it.
- `placeholder` (e.g. "you@example.com") shows **only** while the field is focused and empty, in `textMuted`.
- `prefix` ('@') renders inline before the input, but only while the label sits on top.
- Focus: a 2pt `lineInk` ring, drawn as an absolute overlay (`top/left/right/bottom: -1`, radius `control + 1`, `pointerEvents="none"`), so focusing never moves the layout. It replaces today's wine border.
- Error (`error` set, or `invalid`): the same overlay in `danger`. Under the box goes the `textRole.helper` line in `danger` with a leading 14pt `alert` glyph and `marginTop: 6`. The hint line is `textRole.helper` in `textMuted`. The "error replaces the hint" rule is unchanged.
- **API `invalid?: boolean`:** the error ring with no message line, for a row inside a FieldGroup whose message the group shows.
- **API `labelHidden?: boolean` (for 04's ingredient rows):** no label is drawn, the placeholder shows at rest, the value is centred vertically, and `accessibilityLabel` is required.
- **API `trailing?: React.ReactNode` (for 02's read-only email row, "Change"):** absolutely positioned at `right: 16`, vertically centred; the input gets `paddingRight` = the node's measured width + 8. Not combined with `secure` (the reveal eye already uses that slot).
- **`ref`:** Field passes its `ref` (React 19 plain prop) straight to the `TextInput`, so 02's steps and 04's error scroll can call `focus()`.
- Secure reveal: unchanged, centred on the input line. Disabled (`editable={false}`): fill `bgSunk`, value in `textMuted`.
- Accessibility is unchanged: the visible label is hidden from VoiceOver, and the TextInput carries `accessibilityLabel={label}` with the hint or error as `accessibilityHint`.

### 5.4 FieldGroup and SelectField: **new** (reference 1's country + phone box)

```tsx
<FieldGroup error={phoneError} hint="We'll text you a code. Standard rates apply.">
  <SelectField label="Country/Region" value="United States (+1)" onPress={openCountryPicker} />
  <Field label="Phone number" value={phone} onChangeText={setPhone} invalid={!!phoneError}
         inputMode="tel" textContentType="telephoneNumber" autoComplete="tel" />
</FieldGroup>
```

- `FieldGroup({ children, error?, hint?, style? })` wraps each child in a `GroupSlotContext` provider carrying `{ position: 'only' | 'first' | 'middle' | 'last' }`. It uses context, not `cloneElement`.
- The group draws the outer box: radius `control`, 1pt `lineControl`, fill `surface`, `overflow: 'hidden'`. A child inside a slot draws **no** outer border. Between rows sits a full-width 1pt `lineControl` separator (reference 1 does not inset it).
- **Each row rings itself:** the focused or invalid row draws its 2pt ring overlay with radii by position. `first` takes the top corners at `control + 1`, `last` takes the bottom corners, `middle` takes 0, `only` takes all four. It uses `zIndex: 1` and a −1 inset so the ring covers the shared lines. (02 sketched one ring around the whole group. Per-row is what reference 1 does, and it tells the user which row is live.)
- Below the group, `error` (danger, with the alert glyph) replaces `hint` (`textMuted`). Both use `textRole.helper` with `marginTop: 8`, and `useAnnounce(error)` fires.
- `SelectField({ label, value, placeholder?, onPress, disabled?, accessibilityHint? })`: the same row anatomy as Field, with the label on top whenever `value` is set. A trailing `chevronDown` 20 in `text`. It is a `Pressable` (pressed fill `bgSunk`) with `accessibilityRole="button"`, `accessibilityLabel={`${label}, ${value}`}` and the default hint "Opens a list". Outside a group it draws its own box, as Field does.

### 5.5 SearchField: restyled

Height 44, radius `control` (was pill), 1pt `line`, fill `surface` (`onCard`: `bg`), magnifier 18 in `textMuted`, `paddingHorizontal: 12`. On focus the edge becomes 1pt `lineControl` (a search field, not a form input, so no ring). Behaviour is unchanged.

### 5.6 OrDivider: **new**

`OrDivider({ label = 'or', style? })` is a row: a 1pt `line` rule, then the label (`fonts.bodyMedium` 13, `textMuted`, `paddingHorizontal: 12`), then a 1pt `line` rule. It carries no margins of its own; 02 sets them. The rules are hidden from VoiceOver.

### 5.7 Chip: **new** (toggles: My Bar shelf, 04's pickers and tokens)

```ts
export function Chip(props: {
  label: string; selected: boolean; onPress: () => void;
  icon?: IconName;          // leading 14; replaces the selected check (04's "+ suggestion")
  trailingIcon?: IconName;  // trailing 12 (04's removable token: 'close')
  count?: number; disabled?: boolean; accessibilityLabel?: string;
}): JSX.Element;
```

Height 32, `paddingHorizontal: 12`, radius `control`, 1pt edge, `hitSlop={{ top: 6, bottom: 6 }}`, gap 6.

- **Unselected:** fill `surface`, edge `line`, label `fonts.bodyMedium` 13 in `text`, pressed fill `bgSunk`.
- **Selected:** fill `wineWash`, edge `wine`, label `fonts.bodySemiBold` 13 in `wine`, and a leading `check` 14 in `wine` unless `icon` is given.
- `count` trails in tabular `textMuted`.
- Accessibility: `accessibilityRole="button"`, `accessibilityState={{ selected }}`. `haptic.select` fires on change.
- 04 uses this and **does not create `ChoiceChip.tsx`**, as 04 §5.2 already allows. The Dex's underline filter chips stay as they are: they are tabs, not pills.

### 5.8 Tags: RarityBadge, CategoryTag, Tag

- **Shared anatomy:** height 22, `paddingHorizontal: 6`, radius `badge` (was pill), 1pt edge, label `type.tag` in `fonts.bodyMedium`, gap 4.
- **RarityBadge:** same API and colours. The dot stays round (6pt); legendary keeps its sparkle.
- **API:** `CategoryPill` is renamed `CategoryTag` (call sites in `log.tsx` and `drink/[id].tsx`).
- **New `Tag({ label })`:** fill `cardAlt`, edge `line`, label `textMuted`. The drink page's ingredient chips become `Tag`, wherever they live after 04 moves them to `DrinkPanels.tsx`.

### 5.9 Card, ListGroup, ListRow, Divider

- **Card:** radius `card`, 1pt `line` (was `cardBorder`), fill `surface`, no padding, no shadow.
- **New `ListGroup({ children, style? })`:** a Card with `overflow: 'hidden'`. Through context, its last row gets no separator.
- **New `ListRow`:**

```ts
export function ListRow(props: {
  title: string;
  subtitle?: string;                       // ≤ 2 lines
  leading?: { icon: IconName; color?: string } | { node: React.ReactNode };
  trailing?: 'chevron' | { text: string } | { node: React.ReactNode };
  onPress?: () => void;                    // absent → a static row, not a button
  emphasis?: boolean;                      // SemiBold title (people's names)
  destructive?: boolean;                   // title and icon in danger, never a chevron
  disabled?: boolean; busy?: boolean;      // busy: a spinner replaces the leading icon
  accessibilityLabel?: string; accessibilityHint?: string;
}): JSX.Element;
```

Anatomy:

- `minHeight` 52, or 64 with a subtitle or a leading node of 40pt or more.
- `paddingHorizontal: 16`, `paddingVertical: 12`, gap 12.
- Leading icon: 22 in `text` (`danger` for destructive rows).
- Title: `textRole.rowTitle` in `text`. Subtitle: `textRole.rowSubtitle` in `textMuted`.
- Trailing: a chevron is `chevronRight` 18 in `textFaint`; trailing text is 14 in `textMuted`.
- Separator: a hairline `line` that starts at the title's left edge.
- Pressed: fill `bgSunk`. Disabled: opacity 0.42.
- Role: `button` only when `onPress` is set.

02's country-picker rows, 03's Activity and connection rows and 04's list rows all use these metrics.

- **Divider:** height `stroke.hair`, colour `line`. **API:** adds `inset?: number`.

### 5.10 SectionHeader: replaces SectionLabel. **API**

```ts
export function SectionHeader(props: {
  title: string;
  size?: 'content' | 'group';              // default 'content'
  action?: { label: string; onPress: () => void };
  style?: ViewStyle;
}): JSX.Element;
```

- **content:** `textRole.sectionTitle` in `text`. **Sentence case, no tracking, no uppercase.**
- **group:** `textRole.groupTitle` in `textMuted`, `paddingHorizontal: 16`, so it lines up with the row titles in the ListGroup beneath it.
- **action:** a trailing text button, 14 SemiBold in `wine`, with `hitSlop` to 44.
- `accessibilityRole="header"`, and the label comes from the string. Layout-neutral: no margins of its own.
- `SectionLabel` is **deleted**. Its 6 users migrate in Phase 1 (settings, bar, profile, drink/[id], PeerProfile, CollectionStats). Wherever 02, 03, 04 or 05 say `SectionLabel`, they mean `SectionHeader` (02's country-picker letters and 03's Activity "New"/"Earlier" use `size="group"`).

### 5.11 SegmentedControl: restyled

Same API. The track is 36 tall, radius `control`, 1pt `line`, fill `bgSunk`, padding 2. The thumb has radius `control - 2`, fill `surface` and a 1pt `line` edge, and slides on `motion.selection` (under Reduce Motion, a 150ms timing). Labels are 13 SemiBold: `textMuted` at rest, **`text` (not wine) when active**. Segments get `hitSlop={{ top: 4, bottom: 4 }}`. The active state is also shown by the label colour, so a stalled thumb never hides which segment is on. My Bar is its only user; profiles move to TabStrip.

### 5.12 ScreenTopBar, TopBarButton, TopBarTextButton: **new file** `src/components/ScreenTopBar.tsx`

There is **one** top bar in the app, and this API is canonical. (03 and 07 were drafted against an earlier `TopBar variant="root|push|modal"` / `IconButton` / `leading={{ kind }}` API; they have been edited to this one, and `03-home-and-profile.md` §0.1 carries the name map.)

```ts
export function ScreenTopBar(props: {
  title: string;
  size?: 'md' | 'lg';            // md: textRole.barTitle (17/22); lg: textRole.barTitleLg (20/26)
  left?: ReactNode;
  right?: ReactNode;
  showRule: boolean;             // 1pt colors.line along the bottom (03 said cardBorder; v2 retires it as an edge)
  titleNode?: ReactNode;         // replaces the title text (03's wordmark); `title` is still required, as the a11y name
  inset?: 'safe' | 'sheet';      // default 'safe' = insets.top; 'sheet' = 8pt, for iOS page sheets
  titleRef?: React.Ref<Text>;    // 02 moves VoiceOver focus to the title on each step change
}): JSX.Element;

export function TopBarButton(props: {
  icon: IconName; label: string; onPress: () => void; filled?: boolean;
  badge?: boolean;               // 03's Home heart: a 6pt wine dot at the glyph's top-right (`// round-ok: dot`), and ", new" appended to the a11y label
  children?: ReactNode;
}): JSX.Element;                 // 44×44, 26pt glyph in `text`, opacity 0.6 pressed
export function TopBarTextButton(props: { label: string; onPress: () => void; muted?: boolean; disabled?: boolean; loading?: boolean }): JSX.Element;

/** The rule's signal. Flips its boolean only when the offset crosses `threshold`, so a scroll
 *  never re-renders the screen per frame. Pass `onScroll` and `scrollEventThrottle={16}` to the list. */
export function useScrolledPast(threshold?: number /* default 1 */): [scrolled: boolean, onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void];
```

A pushed screen's back control is `left={<TopBarButton icon="chevronLeft" label="Back" onPress={onBack} />}`.

- **Anatomy (03):** `paddingTop` per `inset`, then a 44pt row with `backgroundColor: colors.bg`. The side slots are 52 wide. The title is absolutely centred on the screen (`left: 56, right: 56`), with `numberOfLines={1}`, `maxFontSizeMultiplier={1.3}` and `accessibilityRole="header"`.
- **TopBarTextButton:** `textRole.rowTitle` in `wine` (`muted`: `textMuted`; the label goes SemiBold when not muted), `minWidth: 72`, `minHeight: 44`, `paddingHorizontal: 12`. When `left` or `right` is a TopBarTextButton (check `isValidElement(x) && x.type === TopBarTextButton`), its slot widens to 80 and the title insets become `left: 84, right: 84`.
- **Rule:** shown when `showRule` is true. It is instant (03: "one signal, drawn once"). Screens keep 03's `atTop` boolean, flipped only when it changes.
- **No blur, no glass, no Playfair.** The only exception is a caller's `titleNode` wordmark.
- 02's `AuthTitleBar` is a thin wrapper over ScreenTopBar (`size="md"`, `left` = TopBarButton `close` or `chevronLeft`, `showRule` always true). 03's `HomeTopBar` may use `titleNode`.

### 5.13 TabStrip: **new file** `src/components/TabStrip.tsx`

A1 builds it to this signature (it covers 03 §8.4's item shape):

```ts
export interface TabStripItem<K extends string> {
  key: K; label: string;               // label is always the a11y name, shown only without iconOnly
  icon?: IconName; fillActive?: boolean; // fillActive: the active glyph is drawn `filled`
  accessibilityLabel?: string;
}
export function TabStrip<K extends string>(props: {
  items: readonly TabStripItem<K>[]; value: K; onChange: (k: K) => void;
  iconOnly?: boolean; style?: ViewStyle;
}): JSX.Element;
```

Height `layout.tabStrip` (44), items `flex: 1`, `accessibilityRole="tabbar"` on the row and `button` + `selected` on each item, `haptic.select()` on change. Two v2 values: the bottom rule is 1pt **`line`** (03 said `cardBorder`), and the underline is 2pt `lineInk`, `tabWidth × 0.6` wide, springing on `motion.selection`. Icons mode: 24pt glyphs, filled in `text` when active and outline in `textMuted` at rest, so the state shows even if the underline stalls. Labels mode: 14 SemiBold in `text` / `textMuted`. It is used by 03 (profile sections, followers/following).

### 5.14 Notice: **new** (replaces 6 copies of errorBox / noticeBox)

`Notice({ tone: 'error' | 'success' | 'info', children, action?: { label, onPress } })`:

| Tone | Edge (1pt) | Fill | Text |
|---|---|---|---|
| error | `danger+'55'` | `dangerWash` | `danger` |
| success | `wine+'55'` | `wineWash` | `wine` |
| info | `line` | `surface` | `textMuted` |

- Shared: radius `control`, padding 12, gap 8, a leading 18 glyph (`alert` / `check` / `alert` in `textMuted`), text in `textRole.helper`, and an optional trailing text button.
- `accessibilityLiveRegion="polite"`, plus `useAnnounce` for errors.
- It replaces the private boxes in AuthGate (×2), edit-profile, FindFriends, FacebookFriends and InstagramImport. 03's `RefreshBanner` should be a `Notice tone="error"`.

### 5.15 EmptyState: restyled. **API** adds `actionVariant`, `secondaryAction`, `tone`

- The icon disc is **gone**. The glyph is drawn bare at 36, in `text` on paper and `reelInk` on dark.
- Title: `textRole.emptyTitle` (Inter SemiBold 22; it was Playfair), centred, `marginTop: 16`. Body: 16/24 in `textMuted` (dark: `reelInkMuted`), `maxWidth: 300`, `marginTop: 8`.
- `action`: a `Button` with `actionVariant` (default `'primary'`; `'secondary'` for retry; on dark, `'onDark'`), `minWidth: 200`, `marginTop: 24`.
- **`secondaryAction` (04):** a `Button variant="text" size="sm"` under the action, `marginTop: 4`. With `tone="dark"` it is `variant="onDarkText"` (wine text is invisible on `reelGround`).
- **`tone?: 'paper' | 'dark'`:** dark draws on `reelGround` colours for 05's states.
- Convention: error states use `icon="alert"` with a secondary "Try again". Empty states use their subject glyph and a primary action.

### 5.16 ProgressBar, Avatar, PressableScale

- **ProgressBar:** default height 4 (was 8), radius `none` (was height/2), track `bgSunk`, fill `wine`. API unchanged.
- **Avatar:** unchanged. It is the sanctioned circle, and its `size / 2` and `inner / 2` radii get `// round-ok: avatar`.
- **PressableScale:** API unchanged. Its doc comment now says "media tiles only".

### 5.17 Hold: **new** (06's `GateHold`, moved here so every package can use it)

06 §3.5 wrote `GateHold` inside `AuthGate.tsx`, and 06 rule 3 asks every loading branch to behave the same way. Two packages outside AuthGate need it in the same stage (04's custom detail, 05's camera gate), so it lives in `ui.tsx` and A1 builds it in stage 1 from 06's code, unchanged apart from the props:

```ts
export function Hold(props: {
  slowMessage: string;              // said (and announced once) after HOLD_SLOW_MS
  tone?: 'paper' | 'dark';          // dark: spinner reelInk, text reelInkMuted, ground reelGround
  fill?: boolean;                   // default true: flex 1, centred (a whole screen or gate).
                                    // false: paddingVertical space.xxxl, for a list's empty slot.
}): JSX.Element;
export const HOLD_QUIET_MS = 400;   // nothing but the ground for this long
export const HOLD_SLOW_MS = 8000;
```

Paper: ground `bg`, `ActivityIndicator` in `wine` labelled "Loading" from 400 ms, then `slowMessage` in `type.caption` `textMuted`, centred, `maxWidth: 280`, `gap: space.md`. **Every first-load spinner in 02–05 is a `Hold`** (section 11): 06 rule 3 forbids a hold that never says what it waits for.

## 6. The tab bar: `src/components/FloatingTabBar.tsx` (DS, Phase 2, a rewrite)

### 6.1 Destinations

**Home · Clips · [ + Log ] · Dex · Profile.** Four destinations and the log action, in five equal slots. This is the order 05 assumed.

- **Clips** (route `reels`, label from 05's `COPY.label`) sits in slot 2, where reference 2 puts its video tab.
- **Stats leaves the bar** and becomes a push screen, `/stats`, opened from the Dex top bar (section 7). Stats is a report on the Dex, not a place you visit every day. Six slots at 375pt would leave 57pt each under an 11pt label.
- The log action stays in the centre.
- Profile shows **your avatar** instead of the person glyph.
- **The bar stays visible when signed out.** The Dex and Stats work without an account, so hiding the bar would trap a signed-out person on the sign-in screen. 02 keeps `TAB_BAR_CLEARANCE` for this reason.

### 6.2 Anatomy (paper: every tab except Clips)

- **Wrapper:** `position: 'absolute'`, `left/right: layout.tabBarInset` (12), `bottom: Math.max(insets.bottom, 12) + 2` (unchanged).
- **Bar:** height 64, radius `card` (12, was a 32pt stadium), fill `surface` (opaque), 1pt `line`, `elevation.bar`. **No GlassSurface, no sheen, no blur.** An opaque, bordered bar reads as a made object. The fake-glass fallback is the most template-looking surface in the app, and native Liquid Glass resolves to near-page on cream (as `glass.tsx`'s own comment admits). This replaces 05's "light glass" assumption: there is no glass in v2.
- **Row:** `paddingHorizontal: 6`, `paddingVertical: 9`, five `flex: 1` slots.
- **Tab item:** a 28 × 28 glyph box (24 glyph centred), `gap: 3`, label `fonts.bodyMedium` 11 with `maxFontSizeMultiplier={1.3}`. Labels stay because two of the five glyphs, the coupe and the plus, are Sipply's own vocabulary.
  - At rest: outline glyph and label in `textMuted` (6.13:1 on white).
  - **Focused:** filled glyph, label in `fonts.bodySemiBold`, both in `text` (espresso), not wine. The bar's one wine object is the log action, so the "where you are" marker never competes with it.
- **Profile item:** `Avatar` 24 (from `useAuth(s => s.profile)`: `display_name`, `accent`, `avatar_path`) in the 28 box. Focused: a 28pt round ring, 1.5pt `lineInk` (`// round-ok: avatar`). Signed out, it falls back to the `profile` glyph. The label stays "Profile".
- **Log action:** 48 × 36, radius `control`, fill `wine`, 1pt `wineDeep`, `plus` 22 in `textOnWine` at the filled stroke weight. No ring, no shadow, no label. `hitSlop={{ top: 4, bottom: 4 }}`, pressed fill `wineDeep`. Accessibility and `router.push('/log')` are unchanged.
- **Badge (reserved):** a truthy `options.tabBarBadge` draws a 6pt `wine` dot at the glyph box's top-right (`round-ok: dot`). Nothing sets it yet.
- **Header comment:** use 06's sentence: "Nothing else moves: the page cuts, as iOS's own tab bar and Instagram's do ((tabs)/_layout.tsx, specs/06)."

### 6.3 Dark skin (while Clips is focused)

`const dark = state.routes[state.index]?.name === 'reels' && signedIn`, where `signedIn = useAuth((s) => s.session != null)`. Video needs a dark frame, and a cream bar over footage reads as a light leak (TikTok and Instagram both darken here). Signed out, the Clips tab shows 02's cream sign-in screen, so the bar stays paper there.

- **Bar:** fill `reelBar`, 1pt `reelControlBorder`, no shadow.
- **Items:** resting in `reelInkDim` (5.86:1), focused in `reelInk` (15.13:1). The focused avatar ring is `reelInk`.
- **Log action:** fill `reelInk` with a `wine` plus (13.53:1). Wine on espresso would be 1.12:1 and vanish.
- The skin switches instantly with the tab.

### 6.4 Slot logic (matches 05 §7.1)

```ts
import { REELS_ENABLED } from '@/lib/reels';
const visible = state.routes.filter((r) => r.name !== 'reels' || REELS_ENABLED);
const fabAt = Math.ceil(visible.length / 2);   // 4 visible → before Dex; 3 → Home · Dex · + · Profile
// focused stays `state.index === originalIndex(route)`; never the index in `visible`.
```

Press handling, the `tabPress` emit and `haptic.select` are unchanged. `TAB_BAR_CLEARANCE` stays 84.

### 6.5 `src/app/(tabs)/_layout.tsx`

- **06 owns `screenOptions`.** Its replacement of lines 1–63 (`animation: 'none'`, no `transitionSpec`, no `useReducedMotion`) lands as 06 writes it. v2 depends on it: tab switches are an instant cut.
- **DS owns the `Tabs.Screen` list** (Phase 2): `index` (Home, `home`), `reels` (05's options block: `title: COPY.label` from `@/lib/reels`, which B1 has landed in stage 1, `tabIcon('reels')`, `sceneStyle: { backgroundColor: colors.reelGround }`), `dex` ("Dex, your collection"), `profile`. Remove `stats`.
- `TabName` in `icons.tsx` gains `'reels'`.

### 6.6 The flag and the route (no stubs from DS)

Under `00-build-plan.md` no stub is needed and DS creates neither file:

- `src/lib/reels.ts` (with `REELS_ENABLED` and `COPY`) and the `.env` line are package **B1**'s, in stage 1, so the tab bar imports a real flag.
- `src/app/(tabs)/reels.tsx` is package **C5**'s; its first commit in stage 2 is the route with 05's flag-off `<Redirect href="/" />` (00's route-first rule), so `(tabs)/_layout.tsx` never names a missing route for long.

There is exactly one flag, and no `src/lib/flags.ts` (03 and 07 have been edited to match).

## 7. Top bars, screen by screen

Every bar is `ScreenTopBar`. Never more than one control per side.

| Screen | File | size | left | title | right | showRule | Owner |
|---|---|---|---|---|---|---|---|
| Home | `(tabs)/index.tsx` | n/a | `plus` → /log | wordmark `titleNode` | `heart` → /activity | `!atTop` | 03 |
| Clips | `(tabs)/reels.tsx` | n/a: an overlay header over video (05 §7.2) | none | "Clips" in **`textRole.barTitleLg`** (Inter, not Playfair), `reelInk` with `reelTextShadow` | `MediaIconButton camera` | none | 05 |
| Dex | `(tabs)/dex.tsx` | lg | none | "Dex" | `TopBarButton stats` "Collection stats" → `router.push('/stats')` | none: a 2pt progress rule sits directly beneath (`bgSunk` track, `wine` fill to collected/TOTAL) | DS |
| Profile | `(tabs)/profile.tsx` | lg | `plus` → /log | bare `username` (no @, no chevron: 03 §0) | `settings` gear → /settings (03 §0: keeps "the gear, top right" in docs true) | `!atTop` | 03 |
| Someone | `PeerProfile.tsx` | lg | back | bare `username` | `more` | `!atTop` | 03 |
| Stats | `stats.tsx` (new) | md | back | "Stats" | none | `!atTop` | DS |
| Drink | `drink/[id].tsx` | none: the hero image is the top | `MediaIconButton chevronLeft` "Back" at `top: insets.top + 8, left: 12` | none | none | none | DS |
| Settings | `settings.tsx` | md | back | "Settings" | none | `!atTop` | DS |
| Blocked accounts | `blocked.tsx` | md | back | "Blocked accounts" | none | `!atTop` | DS |
| Find friends | `find-friends.tsx` | md | back | "Find friends" | none | `!atTop` | DS |
| My Bar | `bar.tsx` | md | back | "My Bar" | none | `!atTop` | DS |
| Log a pour | `log.tsx` | md, `inset={Platform.OS === 'ios' ? 'sheet' : 'safe'}` | `TopBarTextButton` "Cancel" muted | "Log a pour" | none (Save stays in its bottom bar) | always | DS |
| Edit profile | `edit-profile.tsx` | md, inset as Log | "Cancel" muted | "Edit profile" | none (Save stays at the foot) | always | DS |
| Sign in | `auth/AuthTitleBar.tsx` | md | `close` / `chevronLeft` | 02's | none | always | 02 |
| Activity, Post, Saved, connections | 03's files | md | back | 03's | 03's | `!atTop` | 03 |
| Custom drink form | 04's file | md, sheet inset if modal | "Cancel" muted | 04's | none | always | 04 |

Rule: **titles stand alone.** No subtitle or tagline goes under a screen title. Home's "Pours from the accounts you follow." goes; a failed refresh says so in a `Notice`.

## 8. Dark (media) surfaces

05 owns these screens. These are the v2 rules they meet:

- Ground `reelGround`. Video is full-bleed at radius `none`.
- Text over video is `reelInk` with `reelTextShadow`, on 05's scrim bands. Those bands are the **only** gradients v2 allows, because they do a job (legibility).
- Controls over video or a camera preview use `MediaIconButton` (5.2). The action-rail glyphs stay bare (05).
- **Titles and primers on dark use Inter:** the Clips header uses `textRole.barTitleLg`, and 05's primer and state titles ("Film a clip" and the rest) use `textRole.emptyTitle`, not `fonts.display`/`type.headline`.
- 05's radii map to: `ReelControl` `control`; review panel top corners `card`; the drink-tag row `control`; timer and follow chips `control`; mute flash `control`; the record core's stop square stays at 6 (05's value, not flagged by the lint).
- 05's `cardBorder` edges (review panel, drink-tag row) become `line`, and its `space.xl` gutters become `layout.gutter`.
- **Grain (DS owns `Grain.tsx`):** implemented exactly as 05 §7.1 says: `usePathname()`, and `null` when `path === '/reels' || path.startsWith('/reel/')`. `/record` is a native full-screen modal, so Grain cannot reach it anyway.
- **Location (long term):** a place is a text line with a 14pt `pin` glyph in 13 `textMuted`. Never a chip, a pill or a map card in the feed.

## 9. Typography rules

1. **Chrome is Inter**, set through `textRole`: bars, section headers, buttons, tab labels, rows, fields, stat figures, empty-state and primer titles.
2. **Playfair is reserved for the brand's voice:** the Home wordmark; a drink's name where the drink is the subject (DexCard, PostCard, the drink page hero, the celebration card, 04's custom-drink detail title); avatar initials; the intro lockup. In list rows (log search, My Bar, 04's lists), drink names are `textRole.rowTitle` with `emphasis`.
3. **No uppercase, no letterspacing in UI.** `textTransform: 'uppercase'` is lint-banned (section 13.1). `dexNumber` keeps its 1.5pt tracking: it is a catalogue code made of figures, not words.
4. Figures that change or line up stay `tabular`.

## 10. Motion and feedback rules

| What | Rule |
|---|---|
| Tab switch | instant cut (06) |
| Stack push and modal | native, unchanged |
| Layout animations (`entering` / `exiting`) | **none**, enforced by 06's lint (CelebrationOverlay's scrim fade is its one allowance). 06 removes the existing ones, including Dex scroll-to-top's ZoomIn/ZoomOut. The button now simply appears. |
| Selection indicator (segmented thumb, TabStrip underline, Dex filter rule) | `withSpring(motion.selection)`; under Reduce Motion, `withTiming(…, { duration: motion.fast })`. Each one **also** shows its state without motion (label colour, filled glyph). |
| Field label | moves instantly (5.3) |
| Top-bar rule | instant (03) |
| Control press | fill swap, no scale (5.0) |
| Media tile press | scale 0.97 on `motion.spring` |
| Images | `expo-image` `transition={motion.fast}` (unchanged) |
| Like, heart burst, record morph | unchanged (03, 05) |
| Celebration | its choreography is kept: the one sanctioned moment |
| Loops | none, apart from video playback and the recording ring. **No shimmer, no pulse.** |
| Haptics | select on a selection change, success on a completed save, tap on like and record. Nothing on plain button presses. |

## 11. States

| State | Pattern |
|---|---|
| First load | `Hold` (5.17) under the top bar: `fill={false}` inside a list, `fill` for a whole screen, with a screen-specific `slowMessage` ("Still loading your feed.", "Still loading clips."). For a **known grid** (profile posts, clips), **static** placeholder tiles are allowed instead (`bgSunk` / `reelGround`, no animation, as in 03). |
| Refresh | the native `RefreshControl` only; never a second spinner in the body |
| Empty | `EmptyState` with the subject glyph and a primary action |
| Error, nothing on screen | `EmptyState icon="alert"`, "Could not load …", "Check your connection and try again.", `actionVariant="secondary"` "Try again" |
| Error, stale content on screen | `Notice tone="error"` as the first list item ("Could not refresh. Pull down to try again."); the content stays |
| Offline | the two error rows above. No NetInfo: a failed request is how the app learns it is offline, and the copy already says "connection". |
| Disabled | opacity 0.42 |
| Busy | the Button spinner rules |
| Destructive confirm | native `Alert` / `ActionSheetIOS` (unchanged) |

## 12. Accessibility

- **Contrast:** every new pair is in `check-contrast.mjs` (13.2). `lineControl` clears 3:1 on both white and the page. `line` is decorative and is never the only thing that identifies a control: chips, tags and rows are identified by their text.
- **Targets:** every control reaches 44 × 44. Button sm (36), chips (32) and segmented (36) get there through the `hitSlop` given in their sections.
- **Focus:** the 2pt `lineInk` ring on fields (15:1 on white) also shows for Full Keyboard Access.
- **Labels:** Field's label is always visible, and VoiceOver gets it through `accessibilityLabel`. SelectField reads "label, value" with the hint "Opens a list". FieldGroup errors are announced.
- **Headings:** ScreenTopBar titles and SectionHeaders keep `accessibilityRole="header"`.
- **Tabs:** the tab bar and TabStrip keep the `tabbar` + `button` + `selected` pattern. The avatar tab reads "Profile". The log action keeps its label and hint.
- **Dynamic Type:** boxes use `minHeight` and grow. Field's offsets are measured. Tab labels and bar titles are capped at 1.3× (overlays on video at 1.4×, per 05).
- **Reduce Motion:** honoured by every animation in section 10.
- **Colour independence:** an active tab is filled versus outline, and a selected chip adds a check.

## 13. Enforcement (DS, Phase 1)

### 13.1 `scripts/check-design.mjs`: two rules, appended after 06's rule 3

**Rule 4, shape.** It covers every file except `constants/theme.ts`, `components/SipplyIntro.tsx`, `components/artwork/*`, and `components/glass.tsx` until Phase 2 deletes it. A code line (comments stripped, as the existing rules do) is a `SHAPE` violation if it matches any of:

```js
/radius\.round/
/(borderRadius|cornerRadius|border(Top|Bottom)(Left|Right)Radius)\s*[:=]\s*\{?\s*[\w.]+\s*\/\s*2\b/
/(borderRadius|cornerRadius|border(Top|Bottom)(Left|Right)Radius)\s*[:=]\s*\{?\s*(1[3-9]|[2-9]\d|\d{3,})\b/
```

The exception is when the **raw** line, or the raw line above it, contains `round-ok:` followed by a reason (`avatar`, `avatar badge`, `shutter`, `dot`).

Today's tree matches exactly these lines:

- `SipplyIntro.tsx:316, 331, 396`: exempt file.
- `glass.tsx:195`: exempt until deleted.
- `AuthGate.tsx:378`: Phase 1 maps it to `radius.control`.
- `ui.tsx:451, 460`: Avatar, marked `round-ok: avatar`.
- `ui.tsx:591, 595`: ProgressBar, now radius `none`.
- `ui.tsx:1309`: the EmptyState disc, now deleted.

After stage 2 (every owning package has done its file's Phase 1 column) the rule reports zero. Until then it reports the sites in files whose package has not merged yet; each package must leave **its own** files clean under rules 1–5 before it merges, and the whole tree must be clean at the stage-2 gate. 05's record core gets `round-ok: shutter`; the tab bar's focused avatar ring `round-ok: avatar`; badge dots `round-ok: dot`.

**Rule 5, caps.** `textTransform:\s*['"]uppercase['"]` anywhere in `src/` is a `CAPS` violation. There are no exemptions.

Update the header comment's rule count and the success line to name all five.

### 13.2 `scripts/check-contrast.mjs`

Phase 1: add these pairs, with 05 §10.1's six pairs alongside them:

```js
[C.lineControl, C.surface, 3.0, 'input edge on its white fill'],             // 3.91
[C.lineControl, C.bg, 3.0, 'input edge against the page'],                   // 3.51
[C.lineInk, C.surface, 3.0, 'secondary button edge / focus ring'],           // 15.37
[C.textOnWine, C.wineDeep, 4.5, 'primary button label, pressed'],            // 13.32
[C.reelInk, C.reelBar, 4.5, 'active tab on the dark bar'],                   // 15.13
[C.reelInkDim, C.reelBar, 4.5, 'resting tab label on the dark bar'],         // 5.86
[C.wine, C.reelInk, 4.5, 'plus glyph on the log action, dark bar'],          // 13.53
[C.reelGround, C.reelInk, 4.5, 'onDark button label'],                       // 19.29
[C.reelInk, over([14, 11, 11, 0.78], '#FFFFFF'), 4.5, 'marker text on media over a white frame'], // ≈ 10.1
```

The tonal button's labels (`text` on `bgSunk`, and on `slot` while pressed) are already covered by "body text on sunk well" and "body text on empty slot".

Phase 2 (once `glass` is deleted): remove the `glass` section parse, the `fill`/`fillStrong` check, `GLASS`/`GLASS_STRONG`, the four glass pairs, and the glass part of the header line.

### 13.3 Definition of done (each phase)

1. `npx tsc --noEmit`, `npx expo lint`, `node scripts/check-design.mjs` and `node scripts/check-contrast.mjs` all pass.
2. A dev-client pass on a 375pt and a 430pt device, with Larger Text at the default and at AX3 and Reduce Motion on, checking every screen against section 4.

## 14. Files

Phase 1 is the mechanical token map: radius per section 4, `SectionLabel`→`SectionHeader`, `CategoryPill`→`CategoryTag`, `ghost`→`text`, and `cardBorder` used as an edge → `line`. Phases 2 and 3 change behaviour and layout.

**Who does each row:** the "Owner" column below is the spec that designed the change; the package that **edits** the file is the one `00-build-plan.md` assigns it to, and that package does all three columns for its file in stage 2 (A1 does its own files in stage 1). Where this table says "DS" for a screen file, read the 00 package (C1 shell, C6 catalogue, C7 remaining screens).

### 14.1 Created

| File | Owner | Phase | What |
|---|---|---|---|
| `src/components/ScreenTopBar.tsx` | DS (03 consumes) | 1 | 5.12. If 03's version is already merged, DS extends it rather than recreating it. |
| `src/components/TabStrip.tsx` | DS (03 consumes) | 1 | 5.13. The same rule applies. |
| `src/app/stats.tsx` | DS | 2 | Moved from `(tabs)/stats.tsx`. `ScreenTopBar size="md" title="Stats"` with a back `TopBarButton` (`router.canGoBack() ? back() : replace('/dex')`); a `ScrollView` with `paddingHorizontal: layout.gutter`; `CollectionStats`, API unchanged. The in-content "Stats" headline goes, since the bar has it. Not behind AuthGate (as today). Root `_layout.tsx` gets `<Stack.Screen name="stats" options={{ gestureDirection: 'horizontal' }} />`. |
| `src/lib/reels.ts`, `src/app/(tabs)/reels.tsx` | 05 (packages B1 and C5) | 1 / 2 | Not stubbed by DS (6.6) |

### 14.2 Deleted

| File | Owner | Phase |
|---|---|---|
| `src/app/(tabs)/stats.tsx` | DS | 2 |
| `src/components/glass.tsx` | DS | end of 2 |

### 14.3 Changed

| File | Owner | Phase 1 (mechanical) | Phase 2/3, or the owning spec |
|---|---|---|---|
| `src/constants/theme.ts` | DS | Section 3, including 05 §10.1 | P2: delete `glass`, add `foil` |
| `src/components/ui.tsx` | DS | Section 5, including 05's `onDark` and 04's `labelHidden` / `secondaryAction` | none |
| `src/components/icons.tsx` | DS | Add `reels` with **05's `reel` drawing**: a portrait frame `M7.75 2.75h8.5a2.5 2.5 0 0 1 2.5 2.5v13.5a2.5 2.5 0 0 1-2.5 2.5h-8.5a2.5 2.5 0 0 1-2.5-2.5V5.25a2.5 2.5 0 0 1 2.5-2.5Z`, a play triangle `M10.4 9.3v5.4l4.3-2.7Z`, and gate ticks `M9.5 2.75v2.5`, `M14.5 2.75v2.5`. Solid: the frame filled with the triangle knocked out (`fillRule="evenodd"`). One glyph, named `reels`: 03's square geometry and 05's separate `reel` name are both superseded, because a play-in-a-square is Instagram's mark. Add `alert` (circle r 8.7 at 12,12, `M12 7.7v5.1`, `M12 16.3h.01`). `TabName` gains `'reels'`. | **A1 adds every other glyph in stage 1 too**, from the specs that designed them: 02 §4.6 (`mail`, and the separate `GoogleMark` component), 03 §3 (`addPerson`, `stack`), 05 §10.2 (`flip`, `flash`, `volume`, `volumeOff`, `play`; 05's `reel` is this `reels`). No `menu` glyph: 03 keeps the Settings gear. `pin` stays reserved for 07 and is not added now. |
| `scripts/check-design.mjs` | DS | Rules 4 and 5 after 06's rule 3 | none |
| `scripts/check-contrast.mjs` | DS | 13.2 | P2: drop the glass pairs |
| `src/app/_layout.tsx` | package C1 makes every edit: 01, 03's `pours/[authorId]`, 04's `add-drink`, `custom/[id]` and `<SubmissionSync />`, 05's `record` and `reel/[id]`, 06's intro | `SipplyTheme.colors.border: colors.line` | P2: the `stats` Stack.Screen |
| `src/app/(tabs)/_layout.tsx` | 06 (`screenOptions`), DS (`Tabs.Screen` list) | none | P2: 6.5 |
| `src/components/FloatingTabBar.tsx` | DS | `radius.tab`→`card`, fab `pill`→`control` | P2: rewrite per section 6 |
| `src/components/Grain.tsx` | DS | none | P2: 05's pathname rule |
| `src/app/(tabs)/dex.tsx` | DS (04 adds its shelf; 06 removes ZoomIn) | scroll-top `cornerRadius={radius.control}`; barLink `lg`→`card`; chipRule radius 1→0 | P2: delete the collapsing glass `Masthead` in favour of a fixed `ScreenTopBar` and progress rule (section 7). The list header becomes `SearchField`, then the line "48 of 2,089 collected" (13 `textMuted`, tabular, `marginTop: 12`), then the My Bar link as a one-row `ListGroup` (`leading: { icon: 'bottle' }`, title "My Bar", subtitle as today, chevron), then 04's "Added by you" shelf, then the filter chips. Scroll-to-top: 44 × 44, radius `control`, `surface`, 1pt `line`, `elevation.bar`, no layout animation. Gutter `layout.gutter` |
| `src/app/drink/[id].tsx` (and 04's `DrinkPanels.tsx` once the panels move there) | DS | statCard/serveCard `lg`→`card`; chip `pill`→`badge`; stepNum `pill`→`badge`; lockedIcon `pill`→`control`; sheets `xl`→`card`; optionRow `md`→`control`; previewImage `md`→`card`; `ghost`→`text`; `SectionLabel`→`SectionHeader`; `CategoryPill`→`CategoryTag` | P2: GlassCircle → `MediaIconButton`. P3: ingredient chips → `Tag`; step numbers become bare numerals (14 SemiBold `textMuted` in a 20pt column); the lock disc becomes a bare `lock` 28 in `textMuted`; the unlock sheet's "Take photo" / "Choose photo" become `Button variant="secondary" block icon=…` (reference 1); gutter. (06 removes the FadeInDowns.) |
| `src/app/log.tsx` | DS (04 adds "Yours" rows and its search move) | photoFrame `lg`→`card` with 1pt `line`; photoEmptyDisc `pill`→`control`; row `md`→`control`; rowArt `sm`→`badge`; check `pill`→`badge`; `CategoryPill`→`CategoryTag` | P2: ScreenTopBar (section 7). P3: the empty photo shows a bare `camera` 32 in `text` with "Add a photo" (14 SemiBold), no disc; rows take ListRow metrics (art 44 at radius `badge`, name `rowTitle` emphasis); the selected row is `wineWash` plus a trailing `check` 20 in `wine`, no disc |
| `src/app/bar.tsx` | DS | chip `pill`→`control`; tally `lg`→`card`; `SectionLabel`→`SectionHeader` | P2: ScreenTopBar. P3: shelf chips → `Chip`; gutter |
| `src/app/settings.tsx` | DS (03 §10.5 and 04 add rows) | identity `lg`→`card`; `SectionLabel`→`SectionHeader size="group"` | P2: ScreenTopBar. P3: the identity block becomes a one-row ListGroup (Avatar 40, name emphasis, @handle subtitle, chevron → edit-profile); every `Row` becomes a `ListRow` in a `ListGroup` (icons in `text`, `destructive` where it applies); delete the private divider; gutter. Rows added by 03 and 04 are written as `ListRow` |
| `src/app/blocked.tsx` | DS | Divider restyle is automatic | P2: ScreenTopBar. P3: people in a ListGroup, "Unblock" `Button variant="secondary" size="sm"`; gutter |
| `src/app/find-friends.tsx` | DS (03 adds "Everyone on Sipply") | none | P2: ScreenTopBar; gutter. 03's heading is `SectionHeader` |
| `src/app/edit-profile.tsx` | DS | swatch `pill`→`control`; errorBox `md`→`control` | P2: ScreenTopBar. P3: errorBox → `Notice`; swatches 44 at radius `control` with 1pt `line`, selected marked by a 2pt `lineInk` ring outset 2; gutter |
| `src/components/DexCard.tsx` | DS | card `lg`→`control` | P2: `glass.sheen*` → `foil.*` |
| `src/components/CollectionStats.tsx` | DS (06 removes the entrances) | milestoneMark `pill`→`badge`; prize `lg`→`card`; prizeThumb `md`→`control`; `SectionLabel`→`SectionHeader` | P3: the milestone mark becomes the checkbox anatomy; ProgressBar v2 applies automatically |
| `src/components/CelebrationOverlay.tsx` | DS | card `xl`→`card`; halo/art `pill`→`control`; rankDisc `pill`→`control` | P3: the art becomes a 120 × 120 inset photo (radius `card`, 1pt `line`; legendary gets a 2.5pt `gilt` edge, and the Halo ring is deleted); the rank card shows a bare `trophy` 48 in `wine`, no disc; the eyebrow becomes 13 SemiBold `wine` in sentence case. The choreography is kept |
| `src/components/PeopleList.tsx` | DS | done `md`→`control` | P3: FollowButton: Follow = `primary` sm, Following = `tonal` sm with no check; PersonRow takes ListRow metrics |
| `src/components/FindFriends.tsx` | DS (02 adds a phone prefill) | notice `md`→`control`; `ghost`→`text` | P3: `Notice`; Playfair heading → `SectionHeader` |
| `src/components/FacebookFriends.tsx` | DS | notice `md`→`control` | P3: `Notice`; Playfair heading → `SectionHeader` |
| `src/components/InstagramImport.tsx` | DS | stepBadge `pill`→`badge`; notice `md`→`control`; 7× `ghost`→`text` | P3: `Notice`; step badges take the Tag anatomy; Playfair headings → `SectionHeader` |
| `src/components/WelcomeConnect.tsx` | DS (02 only renders it) | mark `pill`→`control` | P3: the disc goes (a bare glyph); ScreenTopBar; gutter |
| `src/components/PasswordResetOverlay.tsx` | DS (02 leaves it alone) | doneMark `pill`→`control` | P3: a bare `check` 40 in `wine`; the Field anatomy applies automatically; gutter |
| `src/components/AuthGate.tsx` | **02** | facebook `pill`→`control`; errorBox/noticeBox `md`→`control`; `BRAND_BUTTON_HEIGHT` 52 → `layout.control`; Apple `cornerRadius` → `radius.control` | 02 rebuilds it (section 15) |
| `src/app/(tabs)/index.tsx` | **03** | bubbleBadge `pill`→`round` + `// round-ok: avatar badge` | 03 rebuilds it |
| `src/components/PostCard.tsx` | **03** | photoFrame/artPanel `lg`→`card`; galleryCount `pill`→`badge` | 03 rebuilds it (full-bleed media, radius `none`) |
| `src/app/(tabs)/profile.tsx` | **03** | tile `md`→`none`; `SectionLabel`→`SectionHeader` | 03 rebuilds it |
| `src/components/PeerProfile.tsx` | **03** | `SectionLabel`→`SectionHeader`; categoryDot stays (a dot) | 03 rebuilds it |
| `src/components/VideoIntro.tsx`, `SipplyIntro.tsx` | **INTRO** | none (an exempt brand film) | none from v2 |
| `src/app/user/[id].tsx`, `+native-intent.tsx`, `InviteLinkHandler.tsx`, `RarityDonut.tsx`, `artwork/*` | none | none (RarityDonut's 9pt swatch is a dot) | none |

Any screen a spec adds later (04's custom-drink form, 05's recorder and pager, 03's Activity/Post/Saved, the location picker) is built only from section 5 and the section 4 table. It must pass rule 4 without new `round-ok` markers, apart from 05's shutter.

## 15. Reconciliation with the other specs

**Precedence:** shared tokens and primitives follow 01; a screen's composition and behaviour follow its own spec. A reviewer applies these substitutions wherever another spec says otherwise:

| Wherever a spec says | Read it as |
|---|---|
| `radius.sm`, `radius.md`, `radius.lg`, `radius.pill`, "control radius" | the section 4 table: `control`, `card`, `badge`, `none`, or `round` |
| `colors.cardBorder` as an edge or rule | `colors.line` |
| `SectionLabel` | `SectionHeader` (sentence case) |
| `Button variant="ghost"` | `variant="text"` |
| `paddingHorizontal: space.xl` as a screen gutter | `layout.gutter` (16) |
| `fonts.display` on a bar title, a state title or a primer | `textRole.barTitle` / `barTitleLg` / `emptyTitle` |
| `PressableScale` on a row or button | `Pressable` with a pressed fill (5.0) |
| glass, blur, an "unchanged light glass" bar | none in v2 (6.2) |

**02 (login).**
- `auth/FieldGroup.tsx` is **not created**: 02 imports `FieldGroup`/`SelectField`/`Field` from `ui.tsx`, which ring each row on focus (5.4). The read-only email row uses Field's new `trailing` ("Change").
- `ProviderButton` is `Button variant="secondary" block` with `leading={mark}` (5.1). The native Apple button, in `WHITE_OUTLINE` style with `cornerRadius={radius.control}` and height `layout.control`, sits in that stack without looking foreign.
- "Continue" is the Button md at **48** (02 drew 52), and the per-instance `borderRadius` overrides are dropped (02 §4 expects this).
- `AuthTitleBar` wraps `ScreenTopBar` (5.12). The country-picker headers are `SectionHeader size="group"`, its rows take ListRow metrics, and its gutters are 16.
- `haptic.error` (a `notificationAsync(Error)` like `success`) and the four Google colours are added by A1 in stage 1, not by 02.
- 02's `AuthWait` is not built: the gate uses `Hold` (5.17), and the merged AuthGate body is in 02 §9.1.

**03 (home and profile).**
- `ScreenTopBar`/`TopBarButton`/`useScrolledPast`/`TabStrip` are built once, by A1 in stage 1, to the signatures in 5.12 and 5.13. 03 was edited from its earlier `TopBar`/`IconButton` names to these (03 §0.1). Their rule colour is `line`.
- `radius.control`/`radius.badge` exist with 03's values (03's `radius.tag` = `radius.badge`).
- 03's dark-surface names map to 05's clip tokens: `mediaBg`/`surfaceDark` → `reelGround`, `textOnEspresso` (on dark) → `reelInk`, `textOnDarkMuted` → `reelInkMuted`, `lineOnDark` → `reelTrack`, markers' `scrim` + `lineOnMedia` → `reelScrim` with no edge (section 4). `textRole.rootTitle` → `barTitleLg`. `EmptyState tone="media"` → `tone="dark"`. No new tokens.
- `ProfileAction` (32pt, `lineControl`/`textFaint` outline) is accepted as a profile-header control: it is a rectangle with a visible edge.
- `RefreshBanner` is a `Notice`.
- The `reels` glyph is 01's/05's portrait frame, not the square.
- Activity's section headers are `SectionHeader size="group"`.

**04 (custom drinks).**
- It uses `Chip` (no `ChoiceChip.tsx`), `Field labelHidden`, and `EmptyState secondaryAction`. All three ship in Phase 1.
- Its photo frame is an inset photo (radius `card`, 1pt `line`). Its 40pt thumbs are radius `badge`.
- Its Dex shelf sits between the My Bar row and the chips (14.3).
- If `DrinkPanels.tsx` exists, the drink-page edits in 14.3 apply there, and its local `Chip` becomes `Tag`.

**05 (Clips).**
- DS merges 05's §10.1 tokens and §10.3 `onDark` in Phase 1, plus the `onDarkText` variant 05's primer and EmptyStates need on dark.
- `ReelControl` is `MediaIconButton` (5.2); no `ReelControl.tsx`.
- The profile Clips grid is 03's (`VideoGrid` + `videosSource`); 05 creates no `ReelTile.tsx`.
- The single `reels` glyph uses 05's drawing.
- The tab bar goes **dark** on Clips (6.3), overriding 05's light-bar assumption, since the bar is DS's.
- The Clips header and state titles use Inter (section 8).
- The flag, the stubs and Grain follow 05 exactly (6.6, section 8).

**06 (tab bug).**
- Its `screenOptions` replacement and its lint rule 3 land as written, and v2's rules 4 and 5 are appended after it.
- Its removal of entrance animations is what lets 3.7 delete `motion.stagger`.
- Its finding about Reanimated stalls is why Field labels and top-bar rules move instantly.

## 16. What Jan must configure

- **App Store Connect:** retake the App Store screenshots once v2 ships. The current ones show the pill buttons and the glass tab bar.
- That is all for v2. It is JS-only (no native build, no Supabase, no provider setup) and can ship as an EAS Update. The Clips flag `EXPO_PUBLIC_REELS` is 05's to switch on.

## 17. Acceptance checklist (against the running app)

- [ ] No oval anywhere except avatars, avatar badges, dots and 05's shutter. Rule 4 passes.
- [ ] Every card, list group, chip, tag, search field, segmented track and the tab bar shows a visible 1pt edge on the cream page.
- [ ] Every input shows a `lineControl` edge, a 2pt ink ring on focus and a danger ring on error. Focusing never shifts the layout by a pixel, and the label never overlaps typed text, even in the first seconds after a cold start in a Release build.
- [ ] Secondary buttons are white with a 1pt espresso outline. In block provider stacks, the marks line up 16pt from the left and the labels are centred.
- [ ] Tab bar: Home · Clips (flag on) · + · Dex · Profile, or Home · Dex · + · Profile with the flag off. It is a 12pt-cornered rectangle, opaque and bordered. The active tab is espresso and filled, and Profile shows your photo.
- [ ] On Clips, the bar is dark and the log action is bone with a wine plus.
- [ ] Stats opens from the Dex top bar and swipes back.
- [ ] Tab switches cut instantly. Nothing animates in. No uppercase text anywhere.
- [ ] No Playfair in any bar except the Home wordmark.
- [ ] 16pt side gutters everywhere.
- [ ] `tsc`, lint, `check-design` (5 rules) and `check-contrast` all pass.
